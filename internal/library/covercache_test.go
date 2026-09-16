package library

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/covercache"
)

// 这条测试锁的是本轮的核心要求：**元数据缓存里不应该存 base64 封面数据**。
//
// 背景：实测真实缓存 %APPDATA%\MusicPlayer\metadata-cache.json 是 5.59MB，
// 其中 5.57MB（99.6%）是内嵌封面的 base64 data URL。改成内容寻址之后，
// 缓存里只剩一个十几字节的文件名。
func TestLegacyCoverMigrationDropsBase64(t *testing.T) {
	m, store, _ := newTestManager(t)

	// 1x1 PNG 的关键字节（内容不需要是合法图片：迁移只做 base64 解码）
	coverBytes := []byte("\x89PNG\r\n\x1a\n-fake-cover-payload-for-the-test")
	legacy := "data:image/png;base64," + base64.StdEncoding.EncodeToString(coverBytes)

	cachePath := filepath.Join(store.DataDir(), "metadata-cache.json")
	v1 := map[string]any{
		"version": 1,
		"entries": map[string]any{
			"C:/music/a.mp3": map[string]any{
				"title": "A", "artist": "X", "album": "Y",
				"duration": 1000, "sample": 44100, "bitrate": 320,
				"size": 10, "modTime": 20,
				"cover": legacy, // v1 形态：完整 base64 data URL
			},
			"C:/music/b.mp3": map[string]any{
				"title": "B", "size": 11, "modTime": 21,
				"cover": "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(coverBytes), // 同一张图
			},
		},
	}
	raw, err := json.Marshal(v1)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cachePath, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	// 触发懒加载（迁移就在这里发生），再落盘
	m.ensureCacheLoaded()
	if err := m.SaveCache(); err != nil {
		t.Fatalf("SaveCache: %v", err)
	}

	after, err := os.ReadFile(cachePath)
	if err != nil {
		t.Fatal(err)
	}

	// 1) 缓存里不能再出现 base64 / data URL
	if bytes.Contains(after, []byte("base64")) {
		t.Fatalf("元数据缓存里仍有 base64 数据：\n%s", after)
	}
	if bytes.Contains(after, []byte("data:image")) {
		t.Fatalf("元数据缓存里仍有 data URL：\n%s", after)
	}
	if bytes.Contains(after, []byte("\"cover\":")) {
		t.Fatalf("元数据缓存里仍有 cover 字段：\n%s", after)
	}

	// 2) 两首歌引用同一张图 → 内容寻址只落一个文件
	entries, err := os.ReadDir(m.CoversDir())
	if err != nil {
		t.Fatalf("封面缓存目录不可读: %v", err)
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() {
			files = append(files, e.Name())
		}
	}
	if len(files) != 1 {
		t.Fatalf("同一张图应只落一个文件，实际 %d 个：%v", len(files), files)
	}
	if !covercache.ValidName(files[0]) {
		t.Fatalf("封面文件名不是内容 hash 形态：%q", files[0])
	}

	// 3) 文件内容就是原始封面字节（不是 base64）
	got, err := os.ReadFile(filepath.Join(m.CoversDir(), files[0]))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, coverBytes) {
		t.Fatalf("封面缓存里的字节与原始封面不一致：%q", got)
	}

	// 4) 元数据里存的是文件名引用
	if !bytes.Contains(after, []byte(files[0])) {
		t.Fatalf("元数据缓存里没有文件名引用 %q：\n%s", files[0], after)
	}

	// 5) 迁移后再次加载不应重复写盘，也不应报错
	m.ensureCacheLoaded()
	again, err := os.ReadDir(m.CoversDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(again) != 1 {
		t.Fatalf("重复加载后封面文件数变成了 %d", len(again))
	}
}

// 扫描一首没有内嵌封面的歌，缓存里连 cover 字段都不该出现（omitempty）。
func TestScannedCacheHasNoCoverField(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "plain.wav"), 2)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music, Status: "ok", Watching: false}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store) // 让管理器读到最新的文件夹列表
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatalf("Scan: %v", err)
	}
	if err := m.SaveCache(); err != nil {
		t.Fatalf("SaveCache: %v", err)
	}

	after, err := os.ReadFile(filepath.Join(store.DataDir(), "metadata-cache.json"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(after, []byte("base64")) {
		t.Fatalf("元数据缓存里出现了 base64：\n%s", after)
	}

	// 有封面的歌才写 coverFile；没有封面时两个字段都不写
	for _, s := range m.Songs() {
		if s.Cover != "" {
			t.Fatalf("本地歌曲不该再带 base64 Cover 字段：%q", s.Cover)
		}
		if s.CoverURL != "" && !strings.HasPrefix(s.CoverURL, covercache.Prefix) {
			t.Fatalf("CoverURL 应指向同源封面路由，实际 %q", s.CoverURL)
		}
	}
}

func TestDecodeDataURL(t *testing.T) {
	payload := []byte("hello-cover")
	good := "data:image/webp;base64," + base64.StdEncoding.EncodeToString(payload)

	data, mime, ok := decodeDataURL(good)
	if !ok || string(data) != string(payload) || mime != "image/webp" {
		t.Fatalf("decodeDataURL(%q) = (%q, %q, %v)", good, data, mime, ok)
	}

	for _, bad := range []string{"", "not-a-data-url", "data:image/png,plain", "data:image/png;base64,!!!!", "data:image/png;base64,"} {
		if _, _, ok := decodeDataURL(bad); ok {
			t.Errorf("decodeDataURL(%q) 应为 false", bad)
		}
	}
}
