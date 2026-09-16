package library

import (
	"context"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

// TestReadAllReportsCancellation 是「取消不能被当成『这些就是全部歌』」的
// 契约测试：readAll 的第二个返回值必须如实反映取消，否则调用方会把整个曲库
// 覆盖成空（并广播 scan:done）。
func TestReadAllReportsCancellation(t *testing.T) {
	m, _, _ := newTestManager(t)
	items := []candidate{
		{path: filepath.Join(t.TempDir(), "a.wav"), ext: ".wav"},
		{path: filepath.Join(t.TempDir(), "b.wav"), ext: ".wav"},
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, cancelled := m.readAll(ctx, items, 2, false)
	if !cancelled {
		t.Fatal("上下文已取消时 readAll 必须返回 cancelled=true，否则调用方会把曲库清空")
	}
}

// TestCancelledRescanKeepsLibrary 回归测试：增量重扫被取消时不能动曲库。
//
// 触发路径：RescanPaths 会「先删受影响目录里的旧条目，再写入读到的结果」，
// 而 readAll 在被取消时只能给出残缺结果。旧实现会拿残缺结果往下走，
// 于是那个目录的歌被整批删掉 —— 表现是「扫描失败，歌却没了」。
func TestCancelledRescanKeepsLibrary(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "one.wav"), 1)
	writeWAV(t, filepath.Join(music, "two.wav"), 1)

	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m.ReloadFolders()
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatalf("首次扫描失败: %v", err)
	}
	if n := len(m.Songs()); n != 2 {
		t.Fatalf("应有 2 首，实际 %d", n)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := m.RescanPaths(ctx, []string{filepath.Join(music, "one.wav")}); err == nil {
		t.Fatal("被取消的增量重扫应当返回错误")
	}
	if n := len(m.Songs()); n != 2 {
		t.Fatalf("被取消的增量重扫不能改动曲库：期望仍有 2 首，实际 %d", n)
	}
}
