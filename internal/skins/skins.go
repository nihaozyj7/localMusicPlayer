// Package skins 负责「播放界面皮肤（样式包）」的目录扫描与同源托管。
//
// 为什么要有皮肤这个东西：主题（internal/theme）只能换颜色令牌，改不了
// 播放界面的**结构**（比如把旋转唱片换成频谱、把歌词面板挪到左侧）。
// 皮肤是一个完整的样式包：一段 JS（入口模块）+ 若干 CSS，由前端按需加载，
// 因此它必须能被 WebView 通过 HTTP 取到 —— 这就引出本包的第二件事：
// 同源托管。
//
// 为什么必须同源托管，而不是让前端直接 import 一个 file:// 路径：
//   - 打包后的界面是通过 asset server 以 http(s) 提供的，file:// 的模块
//     会被浏览器的同源策略拒绝（CORS + 混合内容），JS 根本 import 不进来；
//   - 页面 CSP 里 script-src / style-src 是 'self'，外部来源一律被拦。
//
// 目录约定（<dataDir>/player-skins/）：
//
//	player-skins/
//	  my-skin/
//	    skin.json    可选清单：{"name":"…","version":"…","module":"skin.js","styles":["skin.css"]}
//	    skin.js      入口（没有它这个目录不算皮肤）
//	    skin.css     可选样式
//
// 没有 skin.json 也要能用（用户丢两个文件进去就该看到效果）：
// 此时 id 与 name 取目录名、module 默认 skin.js、styles 取目录下全部 *.css。
//
// 与 theme 包一样，这里**不写任何内置皮肤**：内置皮肤由前端打包进资源里，
// 用户目录里的这份是「用户自己写的」，扫描时不去覆盖、不去删除。
package skins

import (
	"embed"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// templateFS 示例样式（随二进制分发，首次启动写进用户皮肤目录）。
//
// 为什么要有它：皮肤接口再清楚，用户面对一个空目录也不知道从哪下手。
// theme 包用的是「给一个 _template.css」的办法，这里同理 —— 一个能直接跑的
// 完整样式包，复制改名就是一个新样式。目录名以 _ 开头，扫描时会被跳过。
//
//go:embed template
var templateFS embed.FS

// TemplateDirName 示例样式的目录名（下划线开头 = 不参与扫描）。
const TemplateDirName = "_template"

// SkinInfo 一个皮肤包（与前端 SkinInfo 对应）。
type SkinInfo struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Version string   `json:"version,omitempty"`
	Module  string   `json:"module"` // 相对该皮肤目录的入口 js，默认 skin.js
	Styles  []string `json:"styles"` // 相对该皮肤目录的 css 文件
	Dir     string   `json:"-"`      // 皮肤目录绝对路径（不下发给前端）
	Builtin bool     `json:"builtin"`
}

// Manager 皮肤目录管理。
//
// byID / order 用「手写、不依赖锁」的方式维护：Reload 是整体替换
// （先构造好新 map 再一次性换指针），因此并发读 List/Get 不会读到半成品。
// 皮肤列表的读取频率很低（打开设置页才读一次），这里刻意不引入 mutex。
type Manager struct {
	mu    sync.RWMutex
	dir   string
	byID  map[string]SkinInfo
	order []string
}

// manifest 是 skin.json 的结构。
type manifest struct {
	Name    string   `json:"name"`
	Version string   `json:"version"`
	Module  string   `json:"module"`
	Styles  []string `json:"styles"`
}

// NewManager 准备皮肤目录：确保 <dataDir>/player-skins 存在，写入示例样式，然后扫描一次。
func NewManager(dataDir string) (*Manager, error) {
	dir := filepath.Join(dataDir, "player-skins")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("创建皮肤目录失败: %w", err)
	}
	m := &Manager{dir: dir, byID: map[string]SkinInfo{}}
	if err := m.syncTemplate(); err != nil {
		return nil, err
	}
	if err := m.Reload(); err != nil {
		return nil, err
	}
	return m, nil
}

// syncTemplate 把示例样式写入用户目录；已存在的文件**不覆盖**。
//
// 不覆盖是有意的：用户完全可能拿 _template 当自己的草稿本来改，
// 每次启动都盖回去等于把他的改动删了。
func (m *Manager) syncTemplate() error {
	entries, err := templateFS.ReadDir("template")
	if err != nil {
		return fmt.Errorf("读取示例样式失败: %w", err)
	}
	target := filepath.Join(m.dir, TemplateDirName)
	if err := os.MkdirAll(target, 0o755); err != nil {
		return fmt.Errorf("创建示例样式目录失败: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		dst := filepath.Join(target, e.Name())
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		data, err := templateFS.ReadFile("template/" + e.Name())
		if err != nil {
			continue
		}
		if err := os.WriteFile(dst, data, 0o644); err != nil {
			return fmt.Errorf("写入示例样式失败: %w", err)
		}
	}
	return nil
}

// Dir 皮肤根目录（供「打开皮肤文件夹」使用）。
func (m *Manager) Dir() string { return m.dir }

// OpenFolderPath 返回皮肤根目录（资源管理器打开用）。
func (m *Manager) OpenFolderPath() string { return m.dir }

// ImportResult 一次「从文件夹导入样式包」的结果。
type ImportResult struct {
	ID       string `json:"id"`
	Imported bool   `json:"imported"`
}

// ImportDir 把一个用户选中的样式包目录复制进皮肤根目录。
//
// 合法性判定直接复用扫描时的规则（scanSkin）：目录里必须能找到一个入口
// （默认 skin.js，或 skin.json 里指定的 module），否则就不是样式包。
// 目录名会作为皮肤 id，因此不能以 _ / . 开头 —— 那类目录扫描时会跳过，
// 导进来也「看不见」，不如在这里直接说清楚。
//
// 同名目录已存在时拒绝导入（而不是覆盖）：皮肤是用户自己写的，
// 静默盖掉他的文件比多一次改名麻烦得多。
func (m *Manager) ImportDir(src string) (ImportResult, error) {
	src = strings.TrimSpace(src)
	if src == "" {
		return ImportResult{}, fmt.Errorf("没有选择文件夹")
	}
	st, err := os.Stat(src)
	if err != nil || !st.IsDir() {
		return ImportResult{}, fmt.Errorf("不是有效的文件夹：%s", src)
	}
	packDir, name, info, err := m.resolveSkinSource(src)
	if err != nil {
		return ImportResult{}, err
	}
	if strings.HasPrefix(name, "_") || strings.HasPrefix(name, ".") {
		return ImportResult{}, fmt.Errorf("文件夹名不能以 _ 或 . 开头（这类目录会被扫描跳过），请改名后再导入")
	}
	target := filepath.Join(m.dir, name)
	if st, err := os.Stat(target); err == nil && st.IsDir() {
		return ImportResult{}, fmt.Errorf("样式目录里已经有同名的「%s」，请改名或删除后再导入", name)
	}
	if err := copyTree(packDir, target); err != nil {
		return ImportResult{}, fmt.Errorf("复制样式包失败：%w", err)
	}
	if err := m.Reload(); err != nil {
		return ImportResult{}, err
	}
	return ImportResult{ID: info.ID, Imported: true}, nil
}

// resolveSkinSource 定位「真正是样式包」的那个目录。
//
// 直接用选中目录本身；它不是样式包时，再看一层子目录 —— AI 生成的目录结构
// 往往是 player-skins/<样式id>/，用户很可能选中最外层。此时若只有一个合法
// 子目录就自动往下走一层；有多个候选则宁可报错，也不猜用户想要哪一个。
func (m *Manager) resolveSkinSource(src string) (string, string, SkinInfo, error) {
	name := filepath.Base(filepath.Clean(src))
	if name == "" || name == "." || name == string(filepath.Separator) {
		return "", "", SkinInfo{}, fmt.Errorf("无法识别文件夹名")
	}
	if info, ok := m.scanSkin(src, name); ok {
		return src, name, info, nil
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return "", "", SkinInfo{}, fmt.Errorf("读取文件夹失败：%w", err)
	}
	candidates := []string{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		child := filepath.Join(src, e.Name())
		if _, ok := m.scanSkin(child, e.Name()); ok {
			candidates = append(candidates, e.Name())
		}
	}
	if len(candidates) == 1 {
		child := filepath.Join(src, candidates[0])
		if info, ok := m.scanSkin(child, candidates[0]); ok {
			return child, candidates[0], info, nil
		}
	}
	if len(candidates) > 1 {
		return "", "", SkinInfo{}, fmt.Errorf("这个文件夹里有 %d 个样式包，请选中其中具体的那一个再导入", len(candidates))
	}
	return "", "", SkinInfo{}, fmt.Errorf("这不是有效的样式包：目录里要有 skin.js（或 skin.json 指定的入口模块）")
}

// copyTree 递归复制目录（皮肤是纯静态资源：只认普通文件，符号链接一律跳过）。
func copyTree(src, dst string) error {
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, e := range entries {
		s := filepath.Join(src, e.Name())
		d := filepath.Join(dst, e.Name())
		if e.IsDir() {
			if err := copyTree(s, d); err != nil {
				return err
			}
			continue
		}
		if !e.Type().IsRegular() {
			continue
		}
		data, err := os.ReadFile(s)
		if err != nil {
			return err
		}
		if err := os.WriteFile(d, data, 0o644); err != nil {
			return err
		}
	}
	return nil
}

// Delete 删除一个样式包（连同它的整个目录）。
//
// 删除对象只认「扫描出来的那个目录」（info.Dir），而不是拿前端传来的 id
// 去拼路径：id 是用户可以随便写的字符串，拼路径等于把删除权交出去。
// 再叠一道 withinDir + 「不能等于根目录」的检查，确保删不掉样式根目录本身
// 或目录之外的任何东西。
func (m *Manager) Delete(id string) error {
	info, ok := m.Get(id)
	if !ok {
		return fmt.Errorf("样式不存在: %s", id)
	}
	target := filepath.Clean(info.Dir)
	root := filepath.Clean(m.dir)
	if target == "" || target == root || !withinDir(root, target) {
		return fmt.Errorf("拒绝删除样式根目录或目录之外的内容: %s", id)
	}
	if err := os.RemoveAll(target); err != nil {
		return fmt.Errorf("删除样式失败: %w", err)
	}
	return m.Reload()
}

// List 返回全部皮肤（按目录名排序）。
func (m *Manager) List() []SkinInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]SkinInfo, 0, len(m.order))
	for _, id := range m.order {
		out = append(out, m.byID[id])
	}
	return out
}

// Get 按 id 取一个皮肤。
func (m *Manager) Get(id string) (SkinInfo, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	info, ok := m.byID[strings.TrimSpace(id)]
	return info, ok
}

// Reload 重新扫描皮肤目录。
//
// 扫描规则：
//   - 只看**子目录**（皮肤是一整个包，散在外面的 js / css 不认）；
//   - 名字以 _ 或 . 开头的目录跳过（下划线是「模板/停用」的约定，
//     点和 theme 包保持一致，避免把隐藏目录也算成皮肤）；
//   - 目录里没有 skin.js 的跳过 —— 那是用户随手建的文件夹，不是皮肤；
//   - 按目录名排序，保证前端列表顺序稳定（不随文件系统枚举顺序变化）。
func (m *Manager) Reload() error {
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return fmt.Errorf("读取皮肤目录失败: %w", err)
	}

	byID := map[string]SkinInfo{}
	order := []string{}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasPrefix(name, "_") || strings.HasPrefix(name, ".") {
			continue
		}
		info, ok := m.scanSkin(filepath.Join(m.dir, name), name)
		if !ok {
			continue
		}
		// id 冲突时以先扫描到的为准（目录名排序后是确定行为），
		// 后一个不会静默覆盖前一个 —— 用户不会看到「皮肤莫名变了内容」。
		if _, dup := byID[info.ID]; dup {
			continue
		}
		byID[info.ID] = info
		order = append(order, info.ID)
	}

	sort.Strings(order)

	// 整表替换必须在锁里：List/Get 会被设置页与前端轮询并发调用，
	// 无锁读一个正在被替换的 map 会直接 fatal（concurrent map read and map write）。
	// 之前这里的注释声称「一次换指针，所以并发读不会读到半成品」，
	// 那只对「读到旧表」成立，对「读到一半被换」并不成立。
	m.mu.Lock()
	m.byID = byID
	m.order = order
	m.mu.Unlock()
	return nil
}

// scanSkin 读一个候选目录，判断它是不是一个可用的皮肤。
func (m *Manager) scanSkin(dir, name string) (SkinInfo, bool) {
	// 入口必须是 skin.js（或清单里显式指定的那个文件），否则不算皮肤
	module := "skin.js"
	info := SkinInfo{ID: name, Name: name, Dir: dir}

	if raw, err := os.ReadFile(filepath.Join(dir, "skin.json")); err == nil {
		var mf manifest
		// 清单坏了就忽略它、按「没有清单」处理：一个手写错的 JSON 不该让
		// 整个皮肤消失，用户还能靠默认约定把皮肤跑起来。
		if err := json.Unmarshal(raw, &mf); err == nil {
			if s := strings.TrimSpace(mf.Name); s != "" {
				info.Name = s
			}
			info.Version = strings.TrimSpace(mf.Version)
			if s := strings.TrimSpace(mf.Module); s != "" {
				module = s
			}
			for _, s := range mf.Styles {
				if s = strings.TrimSpace(s); s != "" {
					info.Styles = append(info.Styles, filepath.ToSlash(s))
				}
			}
		}
	}
	// 清单里的 module 必须是本目录内的相对路径：它会被拼进 /skins/<id>/<module>，
	// 带 .. 或绝对路径的写法既没有意义，也容易变成目录穿越的入口。
	module = filepath.ToSlash(strings.TrimSpace(module))
	if module == "" || strings.Contains(module, "..") || strings.HasPrefix(module, "/") {
		module = "skin.js"
	}
	if !fileExists(filepath.Join(dir, filepath.FromSlash(module))) {
		return SkinInfo{}, false
	}
	info.Module = module

	// 样式：清单里给了就用清单的（存在性仍要校验），否则取目录下全部 *.css
	styles := make([]string, 0, len(info.Styles))
	if len(info.Styles) > 0 {
		for _, s := range info.Styles {
			if fileExists(filepath.Join(dir, filepath.FromSlash(s))) {
				styles = append(styles, s)
			}
		}
	} else {
		names, err := os.ReadDir(dir)
		if err != nil {
			return SkinInfo{}, false
		}
		for _, e := range names {
			if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".css") {
				continue
			}
			if strings.HasPrefix(e.Name(), ".") {
				continue
			}
			styles = append(styles, filepath.ToSlash(e.Name()))
		}
		sort.Strings(styles)
	}
	info.Styles = styles
	return info, true
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info != nil && !info.IsDir()
}

/* --------------------------------------------------------------------------
   同源托管
   -------------------------------------------------------------------------- */

// Prefix 皮肤资源的 URL 前缀。
//
// 定义为包级常量而不是让 main.go 自己写一遍字面量：中间件路由与
// Handler 内部的前缀裁剪必须是同一个值，两处各写一遍迟早会漂移。
const Prefix = "/skins/"

// 需要显式指定的 MIME。
//
// 为什么不能只靠 http.ServeFile 的自动嗅探：Windows 注册表会把 .js 映射成
// text/plain（甚至 application/x-javascript），而 ES module 的 import 对
// MIME 是**严格**的 —— 一旦不是 JavaScript MIME，浏览器会直接拒绝执行，
// 皮肤就「加载了但没效果」，这种问题极难排查。
var mimeByExt = map[string]string{
	".js":    "text/javascript; charset=utf-8",
	".mjs":   "text/javascript; charset=utf-8",
	".css":   "text/css; charset=utf-8",
	".json":  "application/json; charset=utf-8",
	".png":   "image/png",
	".jpg":   "image/jpeg",
	".jpeg":  "image/jpeg",
	".webp":  "image/webp",
	".gif":   "image/gif",
	".svg":   "image/svg+xml",
	".woff2": "font/woff2",
	".woff":  "font/woff",
}

// Handler 返回皮肤资源的只读 HTTP 处理器（挂在 Prefix 下）。
func (m *Manager) Handler() http.Handler {
	root := m.dir
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 只读：这个 handler 不提供写入接口，出现 POST 只可能是有人在探测
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "只支持 GET / HEAD", http.StatusMethodNotAllowed)
			return
		}

		// 统一分隔符：Windows 上 URL 也可能带反斜杠（某些手写链接），
		// 而下面的穿越检查全是按 "/" 做的，不统一就会出现漏网之鱼。
		rel := filepath.ToSlash(strings.TrimPrefix(r.URL.Path, Prefix))
		rel = filepath.ToSlash(filepath.Clean("/" + rel)) // 先绝对化：../ 全被 Clean 吃掉
		rel = strings.TrimPrefix(rel, "/")                // 变回相对路径

		// 隐藏文件/目录一律拒绝。相对路径按 "/" 分段判断，因为
		// filepath.Clean 只保证没有 ".."，管不住 ".git" 这类名字。
		if rel == "" || hasHiddenSegment(rel) {
			http.NotFound(w, r)
			return
		}

		// 「Clean + 结果仍在根目录之内」的双保险：第一道挡住 ../，
		// 第二道防止某些平台上的路径语义差异把文件解析到根目录外。
		full := filepath.Join(root, filepath.FromSlash(rel))
		if !withinDir(root, full) {
			http.NotFound(w, r)
			return
		}
		info, err := os.Stat(full)
		if err != nil || info.IsDir() {
			// 目录不列目录、不做 index：皮肤是「一个目录一个包」，
			// 列目录只会把用户的文件结构暴露出去。
			http.NotFound(w, r)
			return
		}

		// 皮肤是用户正在改的文件，必须禁止缓存：浏览器缓存住旧的 skin.js
		// 会让「我明明改了却没生效」变成常态，而重新扫描只有几百字节的成本。
		w.Header().Set("Cache-Control", "no-store")
		if ct, ok := mimeByExt[strings.ToLower(filepath.Ext(full))]; ok {
			w.Header().Set("Content-Type", ct)
		}
		http.ServeFile(w, r, full)
	})
}

// hasHiddenSegment 判断相对路径里是否存在以点开头的文件或目录。
func hasHiddenSegment(rel string) bool {
	for _, seg := range strings.Split(rel, "/") {
		if seg == "" {
			continue
		}
		if strings.HasPrefix(seg, ".") {
			return true
		}
	}
	return false
}

// withinDir 判断 target 是否落在 dir 之内（相等也算，虽然调用方已排除目录）。
func withinDir(dir, target string) bool {
	rel, err := filepath.Rel(dir, target)
	if err != nil {
		return false
	}
	rel = filepath.ToSlash(rel)
	return rel != ".." && !strings.HasPrefix(rel, "../")
}
