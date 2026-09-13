// Package theme 负责主题发现与自定义主题加载（需求 A8：用户丢一个 CSS 文件即可用）。
//
// 主题 = 一个只声明设计令牌的 CSS 文件。为了让程序能读到中文主题名、
// 深浅模式与色板缩略图，约定在文件头的注释里写少量指令，例如：
//
//	/* @theme-name 深色 · 黑白极简
//	   @theme-mode dark
//	   @theme-swatch #08080a #1b1b1f #3a3a42 #f4f4f6 #ff4d6d */
//
// 没有指令也能用：此时名称取文件名，模式按文件名里的 light/浅色 猜测，
// 色板从文件中的颜色字面量里取前 5 个。
package theme

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
)

//go:embed builtin/*.css
var builtinFS embed.FS

// Info 主题元信息（与前端 ThemeInfo 对应）
type Info struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Mode    string   `json:"mode"`
	Swatch  []string `json:"swatch"`
	Builtin bool     `json:"builtin"`
	File    string   `json:"-"`
}

// Manager 主题目录管理
//
// byID / order 会被 Reload 整表替换，而 List / CSS / BuiltinIDs 可能在同一时刻
// 被另一个 goroutine 读到（最典型的是 /early-theme.js 的 handler 与设置页的
// 「重新扫描」并发）。无锁读写 Go 的 map 不是数据错乱，是**直接崩溃**，
// 所以这里必须加 RWMutex —— 读多写少，RWMutex 的开销可以忽略。
type Manager struct {
	mu    sync.RWMutex
	dir   string
	byID  map[string]Info
	order []string
}

var (
	reThemeName   = regexp.MustCompile(`@theme-name\s+(.+)`)
	reThemeMode   = regexp.MustCompile(`@theme-mode\s+(\w+)`)
	reThemeSwatch = regexp.MustCompile(`@theme-swatch\s+([^\r\n*]+)`)
	reColorHex    = regexp.MustCompile(`#[0-9a-fA-F]{3,8}`)
	reRootSel     = regexp.MustCompile(`:root\[data-theme="([^"]+)"\]`)
)

// NewManager 准备主题目录：把内置主题写入用户目录（用户可自由改），然后扫描
func NewManager(dataDir string) (*Manager, error) {
	dir := filepath.Join(dataDir, "themes")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("创建主题目录失败: %w", err)
	}

	m := &Manager{dir: dir, byID: map[string]Info{}}
	if err := m.syncBuiltin(); err != nil {
		return nil, err
	}
	if err := m.Reload(); err != nil {
		return nil, err
	}
	return m, nil
}

// Dir 主题目录（供「打开主题文件夹」使用）
func (m *Manager) Dir() string { return m.dir }

// syncBuiltin 把内置主题写入用户目录；已存在的文件不覆盖（保留用户改动）
func (m *Manager) syncBuiltin() error {
	entries, err := builtinFS.ReadDir("builtin")
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".css") {
			continue
		}
		target := filepath.Join(m.dir, e.Name())
		if _, err := os.Stat(target); err == nil {
			continue
		}
		data, err := builtinFS.ReadFile("builtin/" + e.Name())
		if err != nil {
			continue
		}
		if err := os.WriteFile(target, data, 0o644); err != nil {
			return fmt.Errorf("写入内置主题失败: %w", err)
		}
	}
	return nil
}

// Reload 重新扫描主题目录
func (m *Manager) Reload() error {
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return fmt.Errorf("读取主题目录失败: %w", err)
	}

	byID := map[string]Info{}
	order := []string{}

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".css") {
			continue
		}
		name := e.Name()
		base := strings.TrimSuffix(name, filepath.Ext(name))
		if strings.HasPrefix(base, "_") || strings.HasPrefix(base, ".") {
			continue // 模板文件与隐藏文件不参与
		}
		raw, err := os.ReadFile(filepath.Join(m.dir, name))
		if err != nil {
			continue
		}
		info := parseTheme(base, string(raw))
		info.File = filepath.Join(m.dir, name)
		byID[info.ID] = info
		order = append(order, info.ID)
	}

	// 内置主题优先排在前面，其余按名称排序
	sort.SliceStable(order, func(i, j int) bool {
		a, b := byID[order[i]], byID[order[j]]
		if a.Builtin != b.Builtin {
			return a.Builtin
		}
		return a.ID < b.ID
	})

	// 整表替换必须在锁里：/early-theme.js 的 handler 会在任意时刻调 List()，
	// 而设置页的「重新扫描」会调 Reload()。无锁时并发读 map 会直接
	// fatal error: concurrent map read and map write（不是数据错乱，是崩溃）。
	m.mu.Lock()
	m.byID = byID
	m.order = order
	m.mu.Unlock()
	return nil
}

// List 返回全部主题（按顺序）
func (m *Manager) List() []Info {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Info, 0, len(m.order))
	for _, id := range m.order {
		out = append(out, m.byID[id])
	}
	return out
}

// CSS 读取主题 CSS 原文
func (m *Manager) CSS(id string) (string, error) {
	m.mu.RLock()
	info, ok := m.byID[id]
	m.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("主题不存在: %s", id)
	}
	raw, err := os.ReadFile(info.File)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

// OpenFolderPath 返回主题目录（供资源管理器打开）
func (m *Manager) OpenFolderPath() string { return m.dir }

// ImportResult 一次「从文件夹导入主题」的结果。
//
// Imported 给出真正落地的主题 id（取自 :root[data-theme="…"]，与文件名不一定相同）；
// Skipped 逐条说明哪个文件为什么没进来（模板、隐藏文件、缺选择器…），
// 让前端能把「导入了 0 个」讲清楚，而不是只报一句失败。
type ImportResult struct {
	Imported []string `json:"imported"`
	Skipped  []string `json:"skipped"`
}

// ImportDir 把用户选中的文件夹里的主题 CSS 复制进主题目录。
//
// 合法性判定：文件夹里至少有一个 .css，且该文件里出现
// :root[data-theme="…"] 选择器 —— 主题本来就只声明这组令牌，
// 随手选到图片文件夹 / 空白目录会被明确挡下来。
// 只导入一层（主题目录是平的，不支持嵌套子目录）。
func (m *Manager) ImportDir(src string) (ImportResult, error) {
	res := ImportResult{Imported: []string{}, Skipped: []string{}}
	src = strings.TrimSpace(src)
	if src == "" {
		return res, fmt.Errorf("没有选择文件夹")
	}
	st, err := os.Stat(src)
	if err != nil || !st.IsDir() {
		return res, fmt.Errorf("不是有效的文件夹：%s", src)
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return res, fmt.Errorf("读取文件夹失败：%w", err)
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".css") {
			continue
		}
		name := e.Name()
		base := strings.TrimSuffix(name, filepath.Ext(name))
		if strings.HasPrefix(base, "_") || strings.HasPrefix(base, ".") {
			res.Skipped = append(res.Skipped, name+"（模板 / 隐藏文件不参与导入）")
			continue
		}
		raw, err := os.ReadFile(filepath.Join(src, name))
		if err != nil {
			res.Skipped = append(res.Skipped, name+"（读不到文件）")
			continue
		}
		sel := reRootSel.FindSubmatch(raw)
		if len(sel) != 2 {
			res.Skipped = append(res.Skipped, name+"（缺少 :root[data-theme=\"…\"] 选择器，不像主题）")
			continue
		}
		if err := os.WriteFile(filepath.Join(m.dir, name), raw, 0o644); err != nil {
			res.Skipped = append(res.Skipped, name+"（写入失败："+err.Error()+"）")
			continue
		}
		res.Imported = append(res.Imported, string(sel[1]))
	}
	switch {
	case len(res.Imported) > 0:
		if err := m.Reload(); err != nil {
			return res, err
		}
		return res, nil
	case len(res.Skipped) > 0:
		return res, fmt.Errorf("没有导入任何主题：%s", strings.Join(res.Skipped, "；"))
	default:
		// 用户可能选中了「装着主题的子文件夹」的外层目录：这时明确指出往里一层，
		// 比只回一句「没有 .css」有用。
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			names, err := os.ReadDir(filepath.Join(src, e.Name()))
			if err != nil {
				continue
			}
			for _, n := range names {
				if !n.IsDir() && strings.HasSuffix(strings.ToLower(n.Name()), ".css") {
					return res, fmt.Errorf("文件夹里没有 .css 主题文件；主题在子文件夹「%s」里，请选中它再导入", e.Name())
				}
			}
		}
		return res, fmt.Errorf("文件夹里没有 .css 主题文件")
	}
}

// Delete 删除一个用户主题（只删主题目录里的那一个 CSS 文件）。
//
// 为什么内置主题不允许删：它们是**每次启动时**由 syncBuiltin 从二进制里补写到
// 主题目录的，删掉只会在下次启动又冒出来。与其让用户看到「删了又回来」，
// 不如在这里直接说清楚。
//
// 删除之后立刻重扫一遍：列表是「磁盘的真话」，不重扫就会出现
// 「文件删了、界面还在」——这正是本方法要修掉的问题。
func (m *Manager) Delete(id string) error {
	key := strings.TrimSpace(id)
	m.mu.RLock()
	info, ok := m.byID[key]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("主题不存在: %s", id)
	}
	if info.Builtin {
		return fmt.Errorf("「%s」是内置主题，程序每次启动都会重新生成，不能删除", info.Name)
	}
	if strings.TrimSpace(info.File) == "" {
		return fmt.Errorf("主题 %s 没有对应的文件", id)
	}
	// 双保险：只允许删主题目录里的文件。File 是扫描时自己拼出来的，
	// 正常不会跑到目录外，但删除是不可撤销的动作，值得再确认一次。
	if !withinDir(m.dir, info.File) {
		return fmt.Errorf("拒绝删除主题目录之外的文件: %s", info.File)
	}
	if err := os.Remove(info.File); err != nil {
		return fmt.Errorf("删除主题失败: %w", err)
	}
	return m.Reload()
}

// withinDir 判断 target 是否落在 dir 之内（相等也算）。
func withinDir(dir, target string) bool {
	rel, err := filepath.Rel(dir, target)
	if err != nil {
		return false
	}
	rel = filepath.ToSlash(rel)
	return rel != ".." && !strings.HasPrefix(rel, "../")
}

// BuiltinIDs 内置主题 id 列表
func (m *Manager) BuiltinIDs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []string{}
	for _, id := range m.order {
		if m.byID[id].Builtin {
			out = append(out, id)
		}
	}
	return out
}

/* --------------------------------------------------------------------------
   解析
   -------------------------------------------------------------------------- */

var builtinIDs = map[string]string{
	"dark-minimal":  "深色 · 黑白极简",
	"light-minimal": "浅色 · 黑白极简",
	"cover-dark":    "封面取色 · 深色",
}

func parseTheme(base, css string) Info {
	info := Info{ID: base, Name: base, Mode: guessMode(base, css), Swatch: []string{}}

	// 选择器里的 data-theme 值优先作为 id（保证与实际生效的选择器一致）
	if m := reRootSel.FindStringSubmatch(css); len(m) == 2 {
		info.ID = m[1]
	}
	if name, ok := builtinIDs[info.ID]; ok {
		info.Builtin = true
		info.Name = name
	}

	if m := reThemeName.FindStringSubmatch(css); len(m) == 2 {
		info.Name = strings.TrimSpace(m[1])
	}
	if m := reThemeMode.FindStringSubmatch(css); len(m) == 2 {
		info.Mode = strings.ToLower(strings.TrimSpace(m[1]))
	}
	if m := reThemeSwatch.FindStringSubmatch(css); len(m) == 2 {
		for _, c := range strings.Fields(m[1]) {
			if strings.HasPrefix(c, "#") {
				info.Swatch = append(info.Swatch, c)
			}
		}
	}
	if len(info.Swatch) == 0 {
		seen := map[string]bool{}
		for _, c := range reColorHex.FindAllString(css, 40) {
			lc := strings.ToLower(c)
			if seen[lc] || len(lc) < 4 {
				continue
			}
			seen[lc] = true
			info.Swatch = append(info.Swatch, c)
			if len(info.Swatch) == 5 {
				break
			}
		}
	}
	return info
}

func guessMode(base, css string) string {
	l := strings.ToLower(base)
	if strings.Contains(l, "light") || strings.Contains(base, "浅色") {
		return "light"
	}
	if strings.Contains(l, "dark") || strings.Contains(base, "深色") {
		return "dark"
	}
	if m := reThemeMode.FindStringSubmatch(css); len(m) == 2 {
		return strings.ToLower(strings.TrimSpace(m[1]))
	}
	return "dark"
}
