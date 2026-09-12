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
type Manager struct {
	dir    string
	byID   map[string]Info
	order  []string
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

	m.byID = byID
	m.order = order
	return nil
}

// List 返回全部主题（按顺序）
func (m *Manager) List() []Info {
	out := make([]Info, 0, len(m.order))
	for _, id := range m.order {
		out = append(out, m.byID[id])
	}
	return out
}

// CSS 读取主题 CSS 原文
func (m *Manager) CSS(id string) (string, error) {
	info, ok := m.byID[id]
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

// BuiltinIDs 内置主题 id 列表
func (m *Manager) BuiltinIDs() []string {
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
