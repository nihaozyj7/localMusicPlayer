package library

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"localmusicplayer/internal/bootstrap"
)

func timeAgoHours(h int) time.Time { return time.Now().Add(-time.Duration(h) * time.Hour) }

func contextTODO() context.Context { return context.Background() }

// 元数据缓存载入失败时**绝不能**把内存里的空表写回去。
//
// 场景：杀软扫描占住文件、并发写、跨机器拷贝中 —— 一次瞬时读失败就足以让
// SaveCache 用空表覆盖 metadata-cache.json，紧接着 pruneCoverCache 按空表
// 把**所有**内嵌封面文件当孤儿删掉。用户看到的就是「缓存莫名消失、封面全没了」。
func TestSaveCacheRefusesToOverwriteOnLoadFailure(t *testing.T) {
	m, store, _ := newTestManager(t)
	path := filepath.Join(store.DataDir(), "metadata-cache.json")

	// 写一份坏缓存（截断的 JSON），模拟「读得到但解析不了」
	const broken = `{"version":1,"entries":{"a":`
	if err := os.WriteFile(path, []byte(broken), 0o644); err != nil {
		t.Fatal(err)
	}
	m.ensureCacheLoaded()

	if err := m.SaveCache(); err == nil {
		t.Fatal("载入失败时 SaveCache 必须返回错误")
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != broken {
		t.Fatalf("磁盘上的缓存被覆盖了：\n%s", after)
	}
	if _, err := os.Stat(path + ".broken"); err != nil {
		t.Fatalf("解析失败时应留一份 .broken 现场：%v", err)
	}
}

// 载入失败时不能按空表回收封面：那些文件仍然被磁盘上的缓存引用着。
func TestPruneCoverCacheSkippedOnLoadFailure(t *testing.T) {
	m, store, _ := newTestManager(t)

	// 放一张「一分钟前」的封面文件（早于 1 小时的年龄门槛并不是必要条件，
	// 关键是 keep 为空时它会被回收）
	dir := m.CoversDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	name := "0123456789abcdef.jpg"
	if err := os.WriteFile(filepath.Join(dir, name), []byte("cover-bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	old := timeAgoHours(2)
	if err := os.Chtimes(filepath.Join(dir, name), old, old); err != nil {
		t.Fatal(err)
	}

	path := filepath.Join(store.DataDir(), "metadata-cache.json")
	if err := os.WriteFile(path, []byte("{oops"), 0o644); err != nil {
		t.Fatal(err)
	}
	m.ensureCacheLoaded()
	m.pruneCoverCache()

	if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
		t.Fatalf("载入失败时封面不该被回收：%v", err)
	}
}

// 载入失败之后**不允许**再写盘，但也不能让整个扫描崩掉（返回错误即可）。
func TestScanStillWorksWhenCacheBroken(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "a.wav"), 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music, Status: "ok"}}
	}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(store.DataDir(), "metadata-cache.json"), []byte("{oops"), 0o644); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)
	res, err := m.Scan(contextTODO(), false)
	if err != nil {
		t.Fatalf("缓存坏掉不该让扫描失败：%v", err)
	}
	if res.Kept != 1 {
		t.Fatalf("应扫到 1 首，实际 %d", res.Kept)
	}
}

// 派生出来的下载目录不能被写回 config.Folders，历史残留也要被忽略。
func TestEffectiveFoldersDropsStaleDownloadFolder(t *testing.T) {
	dataDir := t.TempDir()
	t.Setenv("LMPLAYER_DATA_DIR", dataDir)
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	newDownload := filepath.Join(t.TempDir(), "new-downloads")
	oldDownload := filepath.Join(t.TempDir(), "old-downloads")
	if err := store.Update(func(c *bootstrap.Config) {
		c.DownloadDir = newDownload
		// 模拟早期版本写进来的残留
		c.Folders = []bootstrap.Folder{
			{ID: bootstrap.DownloadFolderID, Path: oldDownload, Status: "ok"},
			{ID: "f1", Path: filepath.Join(t.TempDir(), "music"), Status: "ok"},
		}
	}); err != nil {
		t.Fatal(err)
	}

	got := store.Get().EffectiveFolders()
	var downloadPaths []string
	for _, f := range got {
		if f.ID == bootstrap.DownloadFolderID {
			downloadPaths = append(downloadPaths, f.Path)
		}
	}
	if len(downloadPaths) != 1 {
		t.Fatalf("下载目录应当只有一条，实际 %d 条：%v", len(downloadPaths), downloadPaths)
	}
	if strings.EqualFold(downloadPaths[0], oldDownload) {
		t.Fatalf("用的是残留的旧下载目录：%s", downloadPaths[0])
	}
	if !strings.EqualFold(downloadPaths[0], newDownload) {
		t.Fatalf("下载目录应为 %s，实际 %s", newDownload, downloadPaths[0])
	}
}
