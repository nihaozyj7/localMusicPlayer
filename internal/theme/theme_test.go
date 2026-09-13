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
	if err := m.Delete("dark-minimal"); err == nil {
		t.Fatal("内置主题应拒绝删除")
	}
	// 不存在的 id
	if err := m.Delete("no-such-theme"); err == nil {
		t.Fatal("不存在的主题应报错")
	}
	// 目录穿越式的 id 不能删到目录外的东西
	if err := m.Delete("../dark-minimal"); err == nil {
		t.Fatal("非法 id 应报错")
	}
}
