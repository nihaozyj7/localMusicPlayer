// Package skins 负责「播放界面插件（样式包）」的目录扫描与同源托管。
//
// 为什么要有插件这个东西：主题（internal/theme）只能换颜色令牌，改不了
// 播放界面的**结构**（比如把旋转唱片换成频谱、把歌词面板挪到左侧）。
// 一个样式包是一整个目录：清单（skin.json）+ 入口模块 + 自带 CSS/图标/私有模块，
// 由前端在运行时按需 import，因此它必须能被 WebView 通过 HTTP 取到 ——
// 这就引出本包的第二件事：同源托管。
//
// 为什么必须同源托管，而不是让前端直接 import 一个 file:// 路径：
//   - 打包后的界面是通过 asset server 以 http(s) 提供的，file:// 的模块
//     会被浏览器的同源策略拒绝（CORS + 混合内容），JS 根本 import 不进来；
//   - 页面 CSP 里 script-src / style-src 是 'self'，外部来源一律被拦。
//
// ★ 两个根目录（契约 v3 的核心变化）
//
//	内置（只读，随二进制分发）：resources/player-skins/<id>/     ← //go:embed
//	第三方（用户目录，可写）  ：<dataDir>/player-skins/<id>/
//
// 内置样式与第三方样式走**同一条**扫描 / 校验 / 托管路径，唯一的区别是根目录
// 与 `builtin` 标记。于是"加/删一款内置样式"不再需要改前端源码、也不需要重新
// 打包前端 —— 只动资源目录即可；反过来，内置样式目录可以直接拷进数据目录使用。
//
// 目录约定（两个根目录一致）：
//
//	<root>/my-skin/
//	  skin.json    清单：{ id,name,version,apiVersion,entry,styles,icon,order,
//	                       capabilities,colors,performance }（缺失时按默认约定补齐）
//	  skin.js      入口（没有它这个目录不算样式包）
//	  skin.css     样式（清单不写 styles 时取目录下顶层全部 *.css）
//	  assets/…     自带图标与贴图
//	  lib/…        自带私有模块（只允许目录内相对 import）
//
// 与 theme 包一样，这里**不做任何样式专属逻辑**：宿主不认识任何具体样式。
package skins

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"localmusicplayer/internal/bootstrap"
)

// builtinFS 内置样式资源（随二进制分发，只读）。
//
// 它们以前是前端包里静态 import 的模块（打包进 bundle → 再进 exe），
// 于是"删掉一款内置样式"要改源码 + 重建前端 + 重编后端 + 重发版。
// 现在它们和第三方样式一样是**数据**：扫描 → 校验 → 运行时 import。
//
//go:embed all:resources/player-skins
var builtinFS embed.FS

// BuiltinRoot 内置样式在 builtinFS 里的根。
const BuiltinRoot = "resources/player-skins"

// templateFS 示例样式（随二进制分发，首次启动写进用户样式目录）。
//
// 为什么要有它：接口再清楚，用户面对一个空目录也不知道从哪下手。
// 一个能直接跑的完整样式包，复制改名就是一个新样式。目录名以 _ 开头，扫描时跳过。
//
//go:embed template
var templateFS embed.FS

// TemplateDirName 示例样式的目录名（下划线开头 = 不参与扫描）。
const TemplateDirName = "_template"

// SkinInfo 一个样式包（与前端约定一致）。
//
// 除了 Go 侧自己用得上的几个字段（Module/Styles/Dir），这里把**清单原文**
// 一并下发给前端：契约的字段解析放在前端一处（frontend/packages/player-skins），
// 后端不再逐字段镜像一遍 —— 镜像就会出现"两边字段名不一致"的静默漂移。
type SkinInfo struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Version  string   `json:"version,omitempty"`
	Module   string   `json:"module"` // 相对该样式目录的入口 js
	Styles   []string `json:"styles"` // 相对该样式目录的 css 文件
	Dir      string   `json:"-"`      // 磁盘绝对路径（内置为空：它在 embed 里）
	Builtin  bool     `json:"builtin"`
	Source   string   `json:"source"`   // builtin | data（排错用）
	Manifest any      `json:"manifest"` // 归一化后的清单（见 normalizeManifest）
}

// Manager 样式目录管理。
//
// byID / order 用「整体替换」的方式维护：Reload 先构造好新表再一次性换指针。
// 皮肤列表的读取频率很低（打开设置页才读一次），这里刻意不引入复杂的缓存。
type Manager struct {
	mu    sync.RWMutex
	dir   string
	byID  map[string]SkinInfo
	order []string
	// token 是访问 /skins/ 资源所需的随机令牌（与 /audio/、/cover/ 同一套口径）。
	// 内置样式在二进制里，但第三方样式在**用户数据目录**里，而且这是唯一一条
	// 能读到用户目录内容的无鉴权路由，所以统一要求 token。
	token string
}

// manifest 是 skin.json 的结构（契约 v3）。
//
// 字段用 any / 指针，是为了**原样透传**给前端：后端不解释 capabilities / colors
// 的细节，只做"文件是否存在、entry 是否越界"这类结构校验。
type manifest struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Version      string         `json:"version"`
	APIVersion   string         `json:"apiVersion"`
	Author       string         `json:"author"`
	Description  string         `json:"description"`
	Entry        string         `json:"entry"`
	Module       string         `json:"module"` // v2 字段名，仍然接受（等价于 entry）
	Styles       []string       `json:"styles"`
	Icon         map[string]any `json:"icon"`
	Order        *int           `json:"order"`
	Capabilities map[string]any `json:"capabilities"`
	Colors       map[string]any `json:"colors"`
	Performance  map[string]any `json:"performance"`
	Extra        map[string]any `json:"-"` // 未知字段原样保留在下发清单里
}

// NewManager 准备样式目录：确保 <dataDir>/player-skins 存在，写入示例样式，然后扫描一次。
func NewManager(dataDir string) (*Manager, error) {
	dir := filepath.Join(dataDir, "player-skins")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("创建样式目录失败: %w", err)
	}
	m := &Manager{dir: dir, byID: map[string]SkinInfo{}, token: bootstrap.RandomID("sk")}
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
			// 子目录（assets/ 之类）也要铺出来，但不覆盖已有文件。
			// 注意第一个参数是 **embed.FS 里的路径**，必须用 path.Join（斜杠）——
			// filepath.Join 在 Windows 上会产出反斜杠，embed 查不到会直接报
			// "file does not exist"。
			if err := syncTemplateDir(path.Join("template", e.Name()), filepath.Join(target, e.Name())); err != nil {
				return err
			}
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

// syncTemplateDir 铺一个模板子目录（同样不覆盖已有文件）。
func syncTemplateDir(rel, target string) error {
	if err := os.MkdirAll(target, 0o755); err != nil {
		return fmt.Errorf("创建示例样式子目录失败: %w", err)
	}
	entries, err := templateFS.ReadDir(rel)
	if err != nil {
		return fmt.Errorf("读取示例样式子目录失败: %w", err)
	}
	for _, e := range entries {
		child := path.Join(rel, e.Name())
		dst := filepath.Join(target, e.Name())
		if e.IsDir() {
			if err := syncTemplateDir(child, dst); err != nil {
				return err
			}
			continue
		}
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		data, err := templateFS.ReadFile(child)
		if err != nil {
			continue
		}
		if err := os.WriteFile(dst, data, 0o644); err != nil {
			return fmt.Errorf("写入示例样式失败: %w", err)
		}
	}
	return nil
}

// Dir 样式根目录（供「打开样式文件夹」使用）。
func (m *Manager) Dir() string { return m.dir }

// OpenFolderPath 返回样式根目录（资源管理器打开用）。
func (m *Manager) OpenFolderPath() string { return m.dir }

// ImportResult 一次「从文件夹导入样式包」的结果。
type ImportResult struct {
	ID       string `json:"id"`
	Imported bool   `json:"imported"`
}

// ImportDir 把一个用户选中的样式包目录复制进样式根目录。
//
// 合法性判定直接复用扫描时的规则：目录里必须能找到一个入口
// （默认 skin.js，或清单里指定的 entry），否则就不是样式包。
// 目录名会作为样式 id，因此不能以 _ / . 开头 —— 那类目录扫描时会跳过，
// 导进来也「看不见」，不如在这里直接说清楚。
//
// 同名目录已存在时拒绝导入（而不是覆盖）：样式是用户自己写的，
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
	if info, ok := scanSkinAt(src, name, false, "data"); ok {
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
		if _, ok := scanSkinAt(child, e.Name(), false, "data"); ok {
			candidates = append(candidates, e.Name())
		}
	}
	if len(candidates) == 1 {
		child := filepath.Join(src, candidates[0])
		if info, ok := scanSkinAt(child, candidates[0], false, "data"); ok {
			return child, candidates[0], info, nil
		}
	}
	if len(candidates) > 1 {
		return "", "", SkinInfo{}, fmt.Errorf("这个文件夹里有 %d 个样式包，请选中其中具体的那一个再导入", len(candidates))
	}
	return "", "", SkinInfo{}, fmt.Errorf("这不是有效的样式包：目录里要有 skin.js（或清单里指定的入口模块）")
}

// copyTree 递归复制目录（样式包是纯静态资源：只认普通文件，符号链接一律跳过）。
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
//
// 内置样式**不可删除**：它在二进制里（Dir 为空），"删掉它"这个动作没有意义，
// 也不该被误当成"用户删了但下次还在"的 bug。
func (m *Manager) Delete(id string) error {
	info, ok := m.Get(id)
	if !ok {
		return fmt.Errorf("样式不存在: %s", id)
	}
	if info.Builtin {
		return fmt.Errorf("「%s」是内置样式（随应用分发，只读），不能删除；如需停用请直接切换成别的样式", id)
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

// List 返回全部样式（内置在前，其余按目录名排序）。
func (m *Manager) List() []SkinInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]SkinInfo, 0, len(m.order))
	for _, id := range m.order {
		out = append(out, m.byID[id])
	}
	return out
}

// Get 按 id 取一个样式。
func (m *Manager) Get(id string) (SkinInfo, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	info, ok := m.byID[strings.TrimSpace(id)]
	return info, ok
}

// Reload 重新扫描两个根目录。
//
// 扫描规则：
//   - 只看**子目录**（样式是一整个包，散在外面的 js / css 不认）；
//   - 名字以 _ 或 . 开头的目录跳过（下划线是「模板/停用」的约定；
//     数据和主题包保持一致的语义）；
//   - 目录里没有入口文件（默认 skin.js）的跳过 —— 那是用户随手建的文件夹；
//   - 内置根先扫、数据根后扫：id 冲突时**内置胜出**（内置是随包分发的那一份，
//     不能被数据目录里的同名副本顶替 —— v2 有过"第三方旧副本永久顶替内置"的事故）；
//   - 内置之间按目录名排序，数据目录同理，保证前端列表顺序稳定。
func (m *Manager) Reload() error {
	byID := map[string]SkinInfo{}
	order := []string{}

	// 1) 内置（embed，只读）
	if builtins, err := fs.Sub(builtinFS, BuiltinRoot); err == nil {
		entries, err := fs.ReadDir(builtins, ".")
		if err == nil {
			names := dirNames(entries)
			sort.Strings(names)
			for _, name := range names {
				info, ok := scanSkinFS(builtins, name, name, "", true, "builtin")
				if !ok {
					continue
				}
				byID[info.ID] = info
				order = append(order, info.ID)
			}
		} else {
			log.Printf("[skins] 读取内置样式目录失败：%v", err)
		}
	}

	// 2) 用户数据目录（可写、可删）
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return fmt.Errorf("读取样式目录失败: %w", err)
	}
	names := dirNames(entries)
	sort.Strings(names)
	for _, name := range names {
		info, ok := scanSkinAt(filepath.Join(m.dir, name), name, false, "data")
		if !ok {
			continue
		}
		if _, dup := byID[info.ID]; dup {
			log.Printf("[skins] 样式 id「%s」与内置样式同名，已忽略数据目录里的这份（内置样式不会被磁盘副本顶替）", info.ID)
			continue
		}
		byID[info.ID] = info
		order = append(order, info.ID)
	}

	m.mu.Lock()
	m.byID = byID
	m.order = order
	m.mu.Unlock()
	return nil
}

// dirNames 取目录项里「看起来像一个样式包」的目录名（跳过隐藏与下划线开头）。
func dirNames(entries []fs.DirEntry) []string {
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasPrefix(name, "_") || strings.HasPrefix(name, ".") {
			continue
		}
		out = append(out, name)
	}
	return out
}

// scanSkinAt 扫描一个**磁盘**目录（导入时的合法性判定也用它）。
func scanSkinAt(dir, name string, builtin bool, source string) (SkinInfo, bool) {
	return scanSkinFS(os.DirFS(dir), ".", name, dir, builtin, source)
}

// scanSkinFS 扫描一个 fs.FS 里的某个子目录。
//
// 参数同时服务两个根：内置根在 embed.FS 里（没有磁盘路径，dirHint 为空），
// 数据根在磁盘上（dirHint 供删除 / 打开目录用）。
func scanSkinFS(fsys fs.FS, sub, name, dirHint string, builtin bool, source string) (SkinInfo, bool) {
	if name == "" {
		name = filepath.Base(sub)
	}

	readFile := func(rel string) ([]byte, bool) {
		p := path.Join(sub, rel)
		data, err := fs.ReadFile(fsys, p)
		if err != nil {
			return nil, false
		}
		return data, true
	}
	has := func(rel string) bool {
		st, err := fs.Stat(fsys, path.Join(sub, rel))
		return err == nil && st != nil && !st.IsDir()
	}

	info := SkinInfo{ID: name, Name: name, Dir: dirHint, Builtin: builtin, Source: source}
	mf := manifest{}

	if raw, ok := readFile("skin.json"); ok {
		// 清单坏了就忽略它、按「没有清单」处理：一个手写错的 JSON 不该让
		// 整个样式消失，用户还能靠默认约定把样式跑起来。
		_ = json.Unmarshal(raw, &mf)
		// 未知字段原样保留：契约（前端）可以有比后端新的字段，
		// 后端不该因为"不认识"就把它们丢掉。
		rawMap := map[string]any{}
		if err := json.Unmarshal(raw, &rawMap); err == nil {
			mf.Extra = rawMap
		}
	}

	if s := strings.TrimSpace(mf.Name); s != "" {
		info.Name = s
	}
	info.Version = strings.TrimSpace(mf.Version)

	entry := strings.TrimSpace(mf.Entry)
	if entry == "" {
		entry = strings.TrimSpace(mf.Module) // v2 清单字段，仍然接受
	}
	if entry == "" || !safeRel(entry) || !has(entry) {
		// 清单里的入口必须是本目录内的相对路径：它会被拼进 /skins/<id>/<entry>，
		// 带 .. 或绝对路径的写法既没有意义，也容易变成目录穿越的入口。
		// 写错了就**退回默认约定**（skin.js）—— 一个笔误不该让整个样式消失。
		entry = "skin.js"
		if !has(entry) {
			return SkinInfo{}, false
		}
	}
	info.Module = entry

	// 样式：清单里给了就用清单的（存在性仍要校验），否则取目录下**顶层**全部 *.css。
	// 不递归：lib/ 之类的子目录里放的可能是片段，不小心注进去会改到别的样式。
	if len(mf.Styles) > 0 {
		for _, s := range mf.Styles {
			s = filepath.ToSlash(strings.TrimSpace(s))
			if s != "" && safeRel(s) && has(s) {
				info.Styles = append(info.Styles, s)
			}
		}
	} else {
		if entries, err := fs.ReadDir(fsys, sub); err == nil {
			for _, e := range entries {
				if e.IsDir() || strings.HasPrefix(e.Name(), ".") {
					continue
				}
				if strings.HasSuffix(strings.ToLower(e.Name()), ".css") {
					info.Styles = append(info.Styles, filepath.ToSlash(e.Name()))
				}
			}
			sort.Strings(info.Styles)
		}
	}

	info.Manifest = normalizeManifest(mf, info)
	return info, true
}

// safeRel 判断清单里的相对路径是否安全（不接受空、绝对路径、穿越）。
func safeRel(rel string) bool {
	rel = filepath.ToSlash(strings.TrimSpace(rel))
	if rel == "" || strings.HasPrefix(rel, "/") || strings.Contains(rel, "..") {
		return false
	}
	return true
}

// normalizeManifest 把清单补齐成前端要的形状。
//
// 后端只做"补齐默认值 + 保证字段存在"，**不解释** capabilities / colors 的语义 ——
// 那些是契约的一部分，由前端一处解析（避免两边各写一份而漂移）。
func normalizeManifest(mf manifest, info SkinInfo) map[string]any {
	out := map[string]any{}
	if mf.Extra != nil {
		for k, v := range mf.Extra {
			out[k] = v
		}
	}
	id := strings.TrimSpace(mf.ID)
	if id == "" {
		id = info.ID
	}
	name := strings.TrimSpace(mf.Name)
	if name == "" {
		name = info.Name
	}
	apiVersion := strings.TrimSpace(mf.APIVersion)
	if apiVersion == "" {
		// 没有清单（或者老清单没写版本）：按"当前契约"处理，
		// 让用户丢两个文件进去也能看到效果；真要按老契约跑会被前端拒绝并说明原因。
		apiVersion = "3.0"
	}
	out["id"] = id
	out["name"] = name
	out["version"] = strings.TrimSpace(mf.Version)
	out["apiVersion"] = apiVersion
	out["author"] = strings.TrimSpace(mf.Author)
	out["description"] = strings.TrimSpace(mf.Description)
	out["entry"] = info.Module
	out["styles"] = info.Styles
	if mf.Icon != nil {
		out["icon"] = mf.Icon
	}
	if mf.Order != nil {
		out["order"] = *mf.Order
	}
	if mf.Capabilities != nil {
		out["capabilities"] = mf.Capabilities
	}
	if mf.Colors != nil {
		out["colors"] = mf.Colors
	}
	if mf.Performance != nil {
		out["performance"] = mf.Performance
	}
	return out
}

/* --------------------------------------------------------------------------
   同源托管
   -------------------------------------------------------------------------- */

// Prefix 样式资源的 URL 前缀。
//
// 定义为包级常量而不是让 main.go 自己写一遍字面量：中间件路由与
// Handler 内部的前缀裁剪必须是同一个值，两处各写一遍迟早会漂移。
const Prefix = "/skins/"

// Token 返回访问样式资源所需的令牌（供前端拼 URL）。
// 与 /audio/、/cover/ 一样：进程启动时随机生成，不落盘、不跨进程复用。
func (m *Manager) Token() string { return m.token }

// URLFor 拼出某个样式目录的基地址（含 token）。
// 前端拿到它之后自行拼文件名（清单里的 module / styles / icon.file）。
func (m *Manager) URLFor(skinID string) string {
	return Prefix + skinID + "/?t=" + m.token
}

// 需要显式指定的 MIME。
//
// 为什么不能只靠 http.ServeFile 的自动嗅探：Windows 注册表会把 .js 映射成
// text/plain（甚至 application/x-javascript），而 ES module 的 import 对
// MIME 是**严格**的 —— 一旦不是 JavaScript MIME，浏览器会直接拒绝执行，
// 样式就「加载了但没效果」，这种问题极难排查。
// 内嵌资源更是没有扩展名嗅探可言，必须自己给。
var mimeByExt = map[string]string{
	".js":    "text/javascript; charset=utf-8",
	".mjs":   "text/javascript; charset=utf-8",
	".css":   "text/css; charset=utf-8",
	".json":  "application/json; charset=utf-8",
	".map":   "application/json; charset=utf-8",
	".png":   "image/png",
	".jpg":   "image/jpeg",
	".jpeg":  "image/jpeg",
	".webp":  "image/webp",
	".gif":   "image/gif",
	".svg":   "image/svg+xml",
	".woff2": "font/woff2",
	".woff":  "font/woff",
}

// Handler 返回样式资源的只读 HTTP 处理器（挂在 Prefix 下）。
//
// 先在**内置资源**里找（embed），找不到再落到用户数据目录 —— 与扫描的优先级
// 一致：同 id 时内置胜出，否则一个同名目录就能让内置样式加载到别人的代码。
func (m *Manager) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 只读：这个 handler 不提供写入接口，出现 POST 只可能是有人在探测
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "只支持 GET / HEAD", http.StatusMethodNotAllowed)
			return
		}

		// 鉴权：与 /audio/、/cover/ 同一套口径（本机随机 token，随进程变化）。
		if r.URL.Query().Get("t") != m.token {
			http.Error(w, "forbidden", http.StatusForbidden)
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

		if m.serveBuiltin(w, r, rel) {
			return
		}
		m.serveData(w, r, rel)
	})
}

// serveBuiltin 尝试从内嵌资源里取文件；取到返回 true。
func (m *Manager) serveBuiltin(w http.ResponseWriter, r *http.Request, rel string) bool {
	sub, err := fs.Sub(builtinFS, BuiltinRoot)
	if err != nil {
		return false
	}
	st, err := fs.Stat(sub, rel)
	if err != nil || st == nil || st.IsDir() {
		return false
	}
	f, err := sub.Open(rel)
	if err != nil {
		return false
	}
	defer f.Close()
	setSkinHeaders(w, rel)
	w.Header().Set("Content-Length", strconv.FormatInt(st.Size(), 10))
	if r.Method == http.MethodHead {
		return true
	}
	_, _ = io.Copy(w, f)
	return true
}

// serveData 从用户数据目录取文件（内置里没有的）。
func (m *Manager) serveData(w http.ResponseWriter, r *http.Request, rel string) {
	root := m.dir
	// 「Clean + 结果仍在根目录之内」的双保险：第一道挡住 ../，
	// 第二道防止某些平台上的路径语义差异把文件解析到根目录外。
	full := filepath.Join(root, filepath.FromSlash(rel))
	if !withinDir(root, full) {
		http.NotFound(w, r)
		return
	}
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		// 目录不列目录、不做 index：样式是「一个目录一个包」，
		// 列目录只会把用户的文件结构暴露出去。
		http.NotFound(w, r)
		return
	}

	setSkinHeaders(w, rel)
	// 样式是用户正在改的文件，而内嵌资源是随版本固定的：一律 no-store，
	// 让"我明明改了却没生效"与"重扫后还拿旧文件"这两种情况都不会出现。
	http.ServeFile(w, r, full)
}

// setSkinHeaders 设置资源响应头（禁缓存 + 显式 MIME）。
func setSkinHeaders(w http.ResponseWriter, rel string) {
	w.Header().Set("Cache-Control", "no-store")
	if ct, ok := mimeByExt[strings.ToLower(path.Ext(rel))]; ok {
		w.Header().Set("Content-Type", ct)
	}
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
