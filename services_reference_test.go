package main

import (
	"os"
	"path/filepath"
	"testing"

	"musicplayer/internal/skins"
	"musicplayer/internal/theme"
)

// 这两个测试盯的是「AI 提示词里的参考资料必须是本机真实存在的路径」：
// 提示词会把这些路径交给 AI，路径写错（或指向源码仓库里才有的文件）等于没有参考。
// 因此断言不看字符串长什么样，而是逐个 os.Stat：路径必须真实存在，且与当前
// 生效的样式 / 主题对得上。

func TestSkinReferenceListsRealPaths(t *testing.T) {
	dataDir := t.TempDir()
	mgr, err := skins.NewManager(dataDir)
	if err != nil {
		t.Fatalf("准备皮肤目录失败: %v", err)
	}

	// 造一个第三方样式包（正常流程是用户自己写或导入进来的）
	packDir := filepath.Join(dataDir, "player-skins", "aurora")
	if err := os.MkdirAll(packDir, 0o755); err != nil {
		t.Fatalf("创建样式包目录失败: %v", err)
	}
	if err := os.WriteFile(filepath.Join(packDir, "skin.js"), []byte("export default {}"), 0o644); err != nil {
		t.Fatalf("写 skin.js 失败: %v", err)
	}
	if err := os.WriteFile(filepath.Join(packDir, "skin.css"), []byte(""), 0o644); err != nil {
		t.Fatalf("写 skin.css 失败: %v", err)
	}
	if err := mgr.Reload(); err != nil {
		t.Fatalf("重扫皮肤失败: %v", err)
	}

	ref := NewSkinService(mgr).Reference("aurora")

	if want := filepath.Join(dataDir, "player-skins"); ref.Dir != want {
		t.Errorf("样式根目录 = %q，期望 %q", ref.Dir, want)
	}
	if ref.CurrentID != "aurora" {
		t.Errorf("CurrentID = %q，期望 aurora", ref.CurrentID)
	}
	// 当前样式包必须指向真实目录，AI 才能读到入口与样式
	if ref.Current != packDir {
		t.Errorf("当前样式包 = %q，期望 %q", ref.Current, packDir)
	}
	if !isDir(ref.Example) {
		t.Errorf("示例样式包路径不存在: %q", ref.Example)
	}
	for _, name := range []string{"skin.js", "skin.css", "skin.json"} {
		if _, err := os.Stat(filepath.Join(ref.Example, name)); err != nil {
			t.Errorf("示例包里缺 %s: %v", name, err)
		}
	}
	if len(ref.Packs) != 1 {
		t.Fatalf("第三方样式包数量 = %d，期望 1（_template 不参与扫描）", len(ref.Packs))
	}
	if _, err := os.Stat(ref.Packs[0].Module); err != nil {
		t.Errorf("包入口路径不可用 %q: %v", ref.Packs[0].Module, err)
	}
	for _, style := range ref.Packs[0].Styles {
		if _, err := os.Stat(style); err != nil {
			t.Errorf("包样式路径不可用 %q: %v", style, err)
		}
	}

	// 当前用的是内置样式时，磁盘上没有对应目录，这里必须如实留空
	builtin := NewSkinService(mgr).Reference("classic")
	if builtin.Current != "" {
		t.Errorf("内置样式不应有磁盘路径，得到 %q", builtin.Current)
	}
	if builtin.CurrentID != "classic" {
		t.Errorf("CurrentID 应原样回传，得到 %q", builtin.CurrentID)
	}
}

func TestThemeReferencePointsAtExistingFiles(t *testing.T) {
	dataDir := t.TempDir()
	mgr, err := theme.NewManager(dataDir)
	if err != nil {
		t.Fatalf("准备主题目录失败: %v", err)
	}

	ref := NewThemeService(mgr).Reference("cover-dark")

	if want := filepath.Join(dataDir, "themes"); ref.Dir != want {
		t.Errorf("主题目录 = %q，期望 %q", ref.Dir, want)
	}
	if ref.CurrentID != "cover-dark" {
		t.Errorf("CurrentID = %q，期望 cover-dark", ref.CurrentID)
	}
	if ref.CurrentName == "" {
		t.Error("当前主题应当有显示名")
	}
	// 关键：当前主题的文件路径必须真实存在（id 与文件名不一定相同，所以不能靠拼）
	if _, err := os.Stat(ref.CurrentFile); err != nil {
		t.Errorf("当前主题文件不可用 %q: %v", ref.CurrentFile, err)
	}
	if filepath.Base(ref.CurrentFile) != "cover-dark.css" {
		t.Errorf("当前主题文件 = %q，期望 cover-dark.css", filepath.Base(ref.CurrentFile))
	}

	// 内置三款都要在参考列表里，并且路径都存在（AI 直接读它们当范例）
	if len(ref.Files) < 3 {
		t.Fatalf("参考主题数量 = %d，期望至少 3（内置三款）", len(ref.Files))
	}
	for _, f := range ref.Files {
		if _, err := os.Stat(f.File); err != nil {
			t.Errorf("参考主题路径不可用 %q: %v", f.File, err)
		}
	}

	// 主题不存在时不应编造路径
	none := NewThemeService(mgr).Reference("not-a-theme")
	if none.CurrentFile != "" {
		t.Errorf("未知主题不应给出文件路径，得到 %q", none.CurrentFile)
	}
}
