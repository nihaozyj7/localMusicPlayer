package theme

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeThemeFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestManagerImportDir(t *testing.T) {
	m, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	src := filepath.Join(t.TempDir(), "pack")
	writeThemeFile(t, filepath.Join(src, "sunset.css"), ":root[data-theme=\"sunset\"]{--accent:#f80}")
	writeThemeFile(t, filepath.Join(src, "notes.txt"), "随手写的说明，不是主题")
	writeThemeFile(t, filepath.Join(src, "bad.css"), "body{color:red}")

	res, err := m.ImportDir(src)
	if err != nil {
		t.Fatalf("导入失败: %v", err)
	}
	if strings.Join(res.Imported, ",") != "sunset" {
		t.Fatalf("Imported = %v，期望 [sunset]", res.Imported)
	}
	if len(res.Skipped) != 1 || !strings.Contains(res.Skipped[0], "bad.css") {
		t.Fatalf("Skipped = %v，期望点名 bad.css", res.Skipped)
	}
	if _, err := os.Stat(filepath.Join(m.Dir(), "sunset.css")); err != nil {
		t.Fatalf("主题没有复制到主题目录: %v", err)
	}
	found := false
	for _, info := range m.List() {
		if info.ID == "sunset" {
			found = true
		}
	}
	if !found {
		t.Fatal("导入的 sunset 没出现在主题列表里")
	}

	// 一个主题都没有的文件夹：明确报错，而不是「导入 0 个」静默成功
	pics := filepath.Join(t.TempDir(), "pics")
	writeThemeFile(t, filepath.Join(pics, "a.css"), "body{}")
	if _, err := m.ImportDir(pics); err == nil {
		t.Fatal("没有 data-theme 选择器的文件夹应报错")
	}

	// 空的 / 不存在的路径
	if _, err := m.ImportDir(t.TempDir()); err == nil {
		t.Fatal("空文件夹应报错")
	}
	if _, err := m.ImportDir(filepath.Join(pics, "a.css")); err == nil {
		t.Fatal("文件路径应报错")
	}
}

func TestManagerDelete(t *testing.T) {
	m, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	src := filepath.Join(t.TempDir(), "pack")
	writeThemeFile(t, filepath.Join(src, "sunset.css"), ":root[data-theme=\"sunset\"]{--accent:#f80}")
	if _, err := m.ImportDir(src); err != nil {
		t.Fatalf("导入失败: %v", err)
	}

	if err := m.Delete("sunset"); err != nil {
		t.Fatalf("删除失败: %v", err)
	}
	// 文件与列表必须同时消失：只删文件不重扫就是「删了还在」的老问题
	if _, err := os.Stat(filepath.Join(m.Dir(), "sunset.css")); !os.IsNotExist(err) {
		t.Fatal("删除后文件仍然存在")
	}
	for _, info := range m.List() {
		if info.ID == "sunset" {
			t.Fatal("删除后列表里还有 sunset")
		}
	}

	// 内置主题：每次启动都会重新生成，因此明确拒绝删除
	if err := m.Delete("flat-dark"); err == nil {
		t.Fatal("内置主题应拒绝删除")
	}
	// 不存在的 id
	if err := m.Delete("no-such-theme"); err == nil {
		t.Fatal("不存在的主题应报错")
	}
	// 目录穿越式的 id 不能删到目录外的东西
	if err := m.Delete("../flat-dark"); err == nil {
		t.Fatal("非法 id 应报错")
	}
}

// 内置主题必须真的能被扫出来、且元信息完整 —— 设置界面的主题卡片全靠这几项：
// 没有 name 卡片就是一行 id，没有 swatch 色卡就是一块灰，mode 错了
// 「深色 / 浅色 / 跟随系统」会挑错主题。
//
// 检查对象取自扫描结果里的 Builtin 条目（而不是写死一份数量或清单），
// 所以以后往 builtin/ 里加主题会自动被覆盖到，不会变成假红灯。
func TestBuiltinThemesAreDiscoverable(t *testing.T) {
	m, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	byID := map[string]Info{}
	for _, info := range m.List() {
		byID[info.ID] = info
	}

	builtinCount := 0
	for _, info := range m.List() {
		if !info.Builtin {
			continue
		}
		builtinCount += 1
		if info.Name == "" || info.Name == info.ID {
			t.Errorf("%s 的显示名 = %q，期望文件头的 @theme-name", info.ID, info.Name)
		}
		if info.Mode != "dark" && info.Mode != "light" {
			t.Errorf("%s 的 mode = %q，期望 dark / light", info.ID, info.Mode)
		}
		if len(info.Swatch) < 3 {
			t.Errorf("%s 只有 %d 个色板色，色卡会是一块灰", info.ID, len(info.Swatch))
		}
		if css, err := m.CSS(info.ID); err != nil || strings.TrimSpace(css) == "" {
			t.Errorf("%s 读不到 CSS：%v", info.ID, err)
		}
		if err := m.Delete(info.ID); err == nil {
			t.Errorf("内置主题 %s 应拒绝删除", info.ID)
		}
	}
	if builtinCount == 0 {
		t.Fatal("一个内置主题都没扫到")
	}

	// 反向：这几款是随程序分发的既定主题，改名或误删主题文件会在这里失败
	// （加新主题不受影响，上面的循环已经覆盖它了）。
	for _, want := range []string{"flat-dark", "flat-light", "cover-dark"} {
		if _, ok := byID[want]; !ok {
			t.Errorf("内置主题 %s 没出现在扫描结果里", want)
		}
	}
}

// 已经从程序里移除的内置主题，留在用户目录里的那份旧副本必须被移走 ——
// 否则它会以「用户主题」的身份继续出现在主题列表里，等于没删掉。
// 同时要守住边界：连修订号都没有的同名文件不许动。
func TestDropRetiredBuiltins(t *testing.T) {
	dir := t.TempDir()
	themesDir := filepath.Join(dir, "themes")
	// ① 正常的内置副本（带我们的修订号）
	writeThemeFile(t, filepath.Join(themesDir, "dark-minimal.css"),
		"/* 用户可能动过内容，但这是我们写下去的那一份 */\n"+
			":root[data-theme=\"dark-minimal\"]{--bg-app:#08080a}\n"+
			"@theme-name 深色 · 黑白极简\n@theme-mode dark\n@theme-builtin-rev 3\n")
	// ② 磁盘上的修订号比代码里记的新：装过更新（或更旧）的版本，实测本机就是这种
	writeThemeFile(t, filepath.Join(themesDir, "light-minimal.css"),
		"@theme-name 浅色 · 黑白极简\n@theme-mode light\n@theme-builtin-rev 99\n")

	m, err := NewManager(dir)
	if err != nil {
		t.Fatal(err)
	}

	for _, id := range []string{"dark-minimal", "light-minimal"} {
		if _, err := os.Stat(filepath.Join(themesDir, id+".css")); !os.IsNotExist(err) {
			t.Errorf("退役内置主题 %s 的旧副本应该被移走", id)
		}
		if _, err := os.Stat(filepath.Join(themesDir, id+".css.bak")); err != nil {
			t.Errorf("%s 移走前应留一份 .bak：%v", id, err)
		}
		for _, info := range m.List() {
			if info.ID == id {
				t.Errorf("退役主题 %s 不该再出现在列表里", id)
			}
		}
	}

	// ③ 没有修订号的同名文件：比这套机制更早的副本 / 用户另存的稿子，不能确定
	//    是我们写的，留着。（重新建一次 Manager，走的就是「程序升级后重启」那条路径。）
	writeThemeFile(t, filepath.Join(themesDir, "light-minimal.css"),
		"@theme-name 浅色 · 黑白极简\n@theme-mode light\n")
	m2, err := NewManager(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(themesDir, "light-minimal.css")); err != nil {
		t.Errorf("没写修订号的同名文件不该被动：%v", err)
	}
	found := false
	for _, info := range m2.List() {
		if info.ID == "light-minimal" {
			found = true
		}
	}
	if !found {
		t.Error("没写修订号的同名文件应继续作为普通主题出现")
	}
}
