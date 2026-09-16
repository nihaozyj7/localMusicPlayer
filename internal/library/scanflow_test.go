package library

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"localmusicplayer/internal/bootstrap"
)

// TestScanPicksUpFolderAddedAfterStartup 回归测试：
// 管理器在启动时缓存了文件夹列表。如果之后通过配置新增了文件夹，
// 但没有通知曲库，扫描就会仍然只扫旧目录 —— 表现为
// 「加了文件夹，界面却一首歌都扫不到」。
// 现在 Scan 会自查配置并同步，因此这条必须过。
func TestScanPicksUpFolderAddedAfterStartup(t *testing.T) {
	m, store, _ := newTestManager(t)

	// 启动时没有任何文件夹
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if len(m.Songs()) != 0 {
		t.Fatalf("初始不应有歌曲，实际 %d", len(m.Songs()))
	}

	// 之后才新增文件夹（模拟用户在设置界面添加）
	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "late-a.wav"), 2)
	writeWAV(t, filepath.Join(music, "late-b.wav"), 2)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = append(c.Folders, bootstrap.Folder{ID: "late", Path: music, Status: "ok"})
	}); err != nil {
		t.Fatal(err)
	}

	// 注意：这里刻意不调用 ReloadFolders，验证自愈
	res, err := m.Scan(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if res.Found != 2 || res.Kept != 2 {
		t.Fatalf("新增文件夹后应扫到 2 首，实际 Found=%d Kept=%d", res.Found, res.Kept)
	}
	if len(m.Songs()) != 2 {
		t.Fatalf("曲库应有 2 首，实际 %d", len(m.Songs()))
	}
}

// TestReloadFoldersRemovesFolder 移除文件夹后不应再扫到旧的歌
func TestReloadFoldersRemovesFolder(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "a.wav"), 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m.ReloadFolders()

	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if len(m.Songs()) != 1 {
		t.Fatalf("应有 1 首，实际 %d", len(m.Songs()))
	}

	// 移除文件夹后重扫，曲库应为空
	if err := store.Update(func(c *bootstrap.Config) { c.Folders = nil }); err != nil {
		t.Fatal(err)
	}
	res, err := m.Scan(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if res.Kept != 0 || len(m.Songs()) != 0 {
		t.Fatalf("移除文件夹后不应有歌曲，实际 Kept=%d songs=%d", res.Kept, len(m.Songs()))
	}
	if res.Removed != 1 {
		t.Errorf("应统计到 1 首被移除，实际 %d", res.Removed)
	}
}

// TestConcurrentScansAreSerialized 并发扫描请求必须排队执行而不是互相覆盖：
// 两个 goroutine 同时 Scan，两次都应返回成功，且最终曲库数据一致。
func TestConcurrentScansAreSerialized(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	for i := 0; i < 6; i++ {
		writeWAV(t, filepath.Join(music, string(rune('a'+i))+".wav"), 1)
	}
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m.ReloadFolders()

	var wg sync.WaitGroup
	results := make([]ScanResult, 3)
	errs := make([]error, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			results[idx], errs[idx] = m.Scan(ctx, false)
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("第 %d 个并发扫描失败: %v", i, err)
		}
	}
	// 首个扫描 Added=6，之后的扫描 Added 应为 0（数据没变）
	if results[0].Kept != 6 && results[1].Kept != 6 && results[2].Kept != 6 {
		t.Errorf("并发扫描后应有 6 首，实际 %+v", results)
	}
	if got := len(m.Songs()); got != 6 {
		t.Errorf("最终曲库应有 6 首，实际 %d", got)
	}
	if m.IsScanning() {
		t.Error("全部扫描结束后 IsScanning 应为 false")
	}
}

// TestMetaCacheActuallyPersistsAndReuses 缓存必须真的被序列化并复用。
//
// 之前的 bug：cacheEntry 用了未导出小写字段，encoding/json 把每个条目写成 {}，
// 于是缓存永久失效 —— 每次重扫都重新解析全部文件的标签。
// 这个测试同时检查「落盘内容非空」和「跨进程实例复用」两件事。
func TestMetaCacheActuallyPersistsAndReuses(t *testing.T) {
	m, store, dataDir := newTestManager(t)
	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "a.wav"), 3)
	writeWAV(t, filepath.Join(music, "b.wav"), 5)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m.ReloadFolders()

	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if got := m.MetaReads(); got != 2 {
		t.Fatalf("首次扫描应读 2 次元数据，实际 %d", got)
	}

	// 1) 缓存文件里必须真的有内容（而不是一堆 {}）
	raw, err := os.ReadFile(filepath.Join(dataDir, "metadata-cache.json"))
	if err != nil {
		t.Fatalf("缓存文件不存在: %v", err)
	}
	var cf struct {
		Version int                       `json:"version"`
		Entries map[string]map[string]any `json:"entries"`
	}
	if err := json.Unmarshal(raw, &cf); err != nil {
		t.Fatalf("缓存文件不是合法 JSON: %v", err)
	}
	if len(cf.Entries) != 2 {
		t.Fatalf("缓存应有 2 个条目，实际 %d", len(cf.Entries))
	}
	for path, entry := range cf.Entries {
		if len(entry) == 0 {
			t.Fatalf("缓存条目为空对象（字段未导出，缓存形同虚设）: %s", path)
		}
		if _, ok := entry["duration"]; !ok {
			t.Errorf("缓存条目缺少 duration 字段: %s -> %v", path, entry)
		}
		if _, ok := entry["size"]; !ok {
			t.Errorf("缓存条目缺少 size 字段: %s -> %v", path, entry)
		}
	}

	// 2) 换一个全新的 Manager（模拟重启应用）应命中缓存，不再读元数据
	m2 := NewManager(store)
	if _, err := m2.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if got := m2.MetaReads(); got != 0 {
		t.Errorf("重启后重扫应全部命中缓存，实际读了 %d 次元数据", got)
	}
	songs := m2.Songs()
	if len(songs) != 2 {
		t.Fatalf("应恢复 2 首，实际 %d", len(songs))
	}
	for _, s := range songs {
		if s.Duration <= 0 {
			t.Errorf("缓存复用后时长丢失: %s", s.Title)
		}
	}

	// 3) 同一实例再扫一次也不应重新读
	before := m.MetaReads()
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if m.MetaReads() != before {
		t.Errorf("同实例重扫不应读元数据，%d -> %d", before, m.MetaReads())
	}
}

// TestMetaCacheInvalidatedOnChange 文件变化后缓存必须失效重读
func TestMetaCacheInvalidatedOnChange(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	path := filepath.Join(music, "a.wav")
	writeWAV(t, path, 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m.ReloadFolders()

	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	first := m.MetaReads()

	// 重写文件（大小与修改时间都变了）
	time.Sleep(20 * time.Millisecond)
	writeWAV(t, path, 4)

	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if m.MetaReads() == first {
		t.Errorf("文件变化后应重新读取元数据（保持在 %d）", first)
	}
	songs := m.Songs()
	if len(songs) != 1 {
		t.Fatalf("应有 1 首，实际 %d", len(songs))
	}
	if songs[0].Duration < 3000 {
		t.Errorf("时长应反映新文件（约 4 秒），实际 %dms", songs[0].Duration)
	}
}
func TestRescanPathsWaitsForFullScan(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "a.wav"), 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m.ReloadFolders()

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, _ = m.Scan(context.Background(), false)
	}()
	go func() {
		defer wg.Done()
		_, _ = m.RescanPaths(context.Background(), []string{filepath.Join(music, "a.wav")})
	}()
	wg.Wait()

	if got := len(m.Songs()); got != 1 {
		t.Errorf("交叉执行后曲库应仍有 1 首，实际 %d", got)
	}
	if m.IsScanning() {
		t.Error("IsScanning 应回到 false")
	}
}
