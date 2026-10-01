package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"localmusicplayer/internal/onlinecache"
)

/* ==========================================================================
   在线试听缓存 ⇄ 下载
   --------------------------------------------------------------------------
   需求（用户原话）：
     「播放器部分目前在线试听功能不能使用了，应该把歌曲加入到播放列表的，
      并且缓存到默认的缓存目录里面去，但是不进入下载目录，如果缓存目录存在
      歌曲文件，用户下载时可以直接从缓存中移动到下载路径。」

   这一组测试盯住的正是这三件事：
     1. 试听会**落盘**（否则后端解析不到，播放必然失败）；
     2. 缓存**不进入下载目录**（用户没点下载，就不该在下载目录里看到文件）；
     3. 点下载时**优先从缓存搬运**，不重新走网络。
   ========================================================================== */

// newCacheForTest 建一个隔离的试听缓存（指向 t.TempDir，不污染真实临时目录）。
func newCacheForTest(t *testing.T) *onlinecache.Store {
	t.Helper()
	return onlinecache.New(t.TempDir())
}

// payloadOf 造一段超过下限的假音频内容。
func payloadOf(n int) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte('A' + i%26)
	}
	return b
}

func TestDownloadMovesFromPreviewCache(t *testing.T) {
	cache := newCacheForTest(t)
	dir := t.TempDir()
	const bvid = "BV1cache00001"
	data := payloadOf(64 * 1024)

	// 模拟「用户先试听」：音频已经落在缓存里
	if _, err := cache.Store(bvid, "m4a", bytes.NewReader(data)); err != nil {
		t.Fatalf("写入试听缓存失败: %v", err)
	}

	svc := &DownloadService{files: cache}
	var added []string
	svc.setOnFileAdded(func(p string) { added = append(added, p) })

	task := &DownloadTask{ID: bvid + "-1", BVID: bvid, Title: "测试歌曲", State: DownloadRunning, Dir: dir}
	svc.tasks = []*DownloadTask{task}
	svc.running = map[string]bool{bvid: true}

	if !svc.tryMoveFromCache(task.ID, bvid, "测试歌曲", dir) {
		t.Fatal("缓存命中时应当走搬运分支")
	}

	// 1. 文件出现在下载目录，内容完整
	target := filepath.Join(dir, "测试歌曲.m4a")
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("下载目录里应当有文件: %v", err)
	}
	if !bytes.Equal(got, data) {
		t.Fatal("搬运后的内容与缓存不一致")
	}

	// 2. 缓存被**消费掉**（移动而不是复制）
	if cache.Exists(bvid) {
		t.Fatal("搬运到下载目录后，缓存里不该还留着一份")
	}

	// 3. 任务被正确收尾
	if task.State != DownloadDone {
		t.Fatalf("任务状态应为 done，实际 %q", task.State)
	}
	if task.Path != target {
		t.Fatalf("任务路径 = %q，期望 %q", task.Path, target)
	}
	if task.Done != int64(len(data)) {
		t.Fatalf("任务字节数 = %d，期望 %d", task.Done, len(data))
	}

	// 4. 新文件要进曲库
	if len(added) != 1 || added[0] != target {
		t.Fatalf("onFileAdded 应以目标路径回调一次，实际 %v", added)
	}
}

// 缓存里没有这首歌时，搬运分支必须老实返回 false（让调用方走网络下载）。
func TestDownloadWithoutCacheFallsBack(t *testing.T) {
	cache := newCacheForTest(t)
	dir := t.TempDir()
	const bvid = "BV1nocache01"

	svc := &DownloadService{files: cache}
	svc.tasks = []*DownloadTask{{ID: bvid + "-1", BVID: bvid, State: DownloadRunning, Dir: dir}}

	if svc.tryMoveFromCache(bvid+"-1", bvid, "没有缓存", dir) {
		t.Fatal("没有缓存时不该报告搬运成功")
	}
	// 也不该在下载目录里留下任何东西
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Fatalf("没有缓存时不该在下载目录留下文件: %v", entries)
	}
}

// 试听缓存**不能**落进下载目录 —— 这是需求明确要求的一条。
func TestPreviewCacheStaysOutOfDownloadDir(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LMPLAYER_MUSIC_DIR", dir)
	downloadDir := bootstrap_DownloadDirForTest(t, dir)

	cache := newCacheForTest(t)
	const bvid = "BV1separate1"
	if _, err := cache.Store(bvid, "m4a", bytes.NewReader(payloadOf(4096))); err != nil {
		t.Fatal(err)
	}

	// 缓存目录和下载目录必须是两个不同的地方
	if samePath(cache.Dir(), downloadDir) {
		t.Fatal("试听缓存目录不该就是下载目录")
	}
	rel, err := filepath.Rel(downloadDir, cache.Dir())
	if err == nil && !strings.HasPrefix(rel, "..") {
		t.Fatalf("试听缓存不该落在下载目录之内: %s", cache.Dir())
	}
}

// bootstrap_DownloadDirForTest 取默认下载目录（仅用于上面的「不在其中」断言）。
func bootstrap_DownloadDirForTest(t *testing.T, musicDir string) string {
	t.Helper()
	return filepath.Join(musicDir, "downloads")
}

// 搬运时遇到同名文件要走重名处理，绝不能覆盖用户已有的文件。
func TestDownloadFromCacheDoesNotOverwrite(t *testing.T) {
	cache := newCacheForTest(t)
	dir := t.TempDir()
	const bvid = "BV1conflict1"

	existing := filepath.Join(dir, "重名.m4a")
	if err := os.WriteFile(existing, []byte("用户自己已有的文件"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := cache.Store(bvid, "m4a", bytes.NewReader(payloadOf(8192))); err != nil {
		t.Fatal(err)
	}

	svc := &DownloadService{files: cache}
	svc.tasks = []*DownloadTask{{ID: bvid + "-1", BVID: bvid, State: DownloadRunning, Dir: dir}}

	if !svc.tryMoveFromCache(bvid+"-1", bvid, "重名", dir) {
		t.Fatal("应当搬运成功（换一个不冲突的文件名）")
	}

	// 原文件必须完好无损
	raw, err := os.ReadFile(existing)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "用户自己已有的文件" {
		t.Fatal("搬运不该覆盖下载目录里已有的同名文件")
	}
	// 搬过来的那份应当带 (2) 后缀
	if _, err := os.Stat(filepath.Join(dir, "重名 (2).m4a")); err != nil {
		t.Fatalf("应当生成不冲突的文件名: %v", err)
	}
}

/* --------------------------------------------------------------------------
   在线曲目 id 的识别
   -------------------------------------------------------------------------- */

// 前后端必须用同一套 id 判据：前端注册在线曲目用的是 `bili:` + bvid。
func TestOnlineBVIDParsing(t *testing.T) {
	cases := []struct {
		id     string
		want   string
		wantOK bool
	}{
		{"bili:BV1xx411c7mD", "BV1xx411c7mD", true},
		{"bili:BV1cache00001", "BV1cache00001", true},
		{"  bili:BV1trim  ", "BV1trim", true},
		{"bili:", "", false},
		{"BV1xx411c7mD", "", false},  // 裸 bvid 不算在线曲目 id
		{"local/abc.mp3", "", false}, // 本地曲目
		{"", "", false},
		{"bilibili:BV1x", "", false}, // 前缀不匹配
	}
	for _, c := range cases {
		got, ok := onlineBVID(c.id)
		if ok != c.wantOK || got != c.want {
			t.Errorf("onlineBVID(%q) = (%q, %v)，期望 (%q, %v)", c.id, got, ok, c.want, c.wantOK)
		}
	}
}

// 生成的 id 必须能被自己解析回来（不会出现「登记了却查不到」）。
func TestOnlineSongIDRoundTrip(t *testing.T) {
	const bvid = "BV1xx411c7mD"
	got, ok := onlineBVID(onlineSongID(bvid))
	if !ok || got != bvid {
		t.Fatalf("onlineSongID/onlineBVID 往返失败: (%q, %v)", got, ok)
	}
}
