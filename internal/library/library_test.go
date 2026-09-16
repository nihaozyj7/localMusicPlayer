package library

import (
	"context"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
	"time"

	"localmusicplayer/internal/bootstrap"
)

// writeWAV 生成一个最小可解析的 WAV（1 秒 8kHz 单声道），用于测试时长解析。
func writeWAV(t *testing.T, path string, seconds int) {
	t.Helper()
	const sampleRate = 8000
	dataSize := sampleRate * seconds // 8bit 单声道
	buf := make([]byte, 0, 44+dataSize)

	buf = append(buf, []byte("RIFF")...)
	tmp := make([]byte, 4)
	binary.LittleEndian.PutUint32(tmp, uint32(36+dataSize))
	buf = append(buf, tmp...)
	buf = append(buf, []byte("WAVEfmt ")...)
	binary.LittleEndian.PutUint32(tmp, 16)
	buf = append(buf, tmp...)
	binary.LittleEndian.PutUint16(tmp[:2], 1) // PCM
	buf = append(buf, tmp[:2]...)
	binary.LittleEndian.PutUint16(tmp[:2], 1) // 单声道
	buf = append(buf, tmp[:2]...)
	binary.LittleEndian.PutUint32(tmp, sampleRate)
	buf = append(buf, tmp...)
	binary.LittleEndian.PutUint32(tmp, sampleRate) // byteRate = sampleRate * 1ch * 1byte
	buf = append(buf, tmp...)
	binary.LittleEndian.PutUint16(tmp[:2], 1)
	buf = append(buf, tmp[:2]...)
	binary.LittleEndian.PutUint16(tmp[:2], 8)
	buf = append(buf, tmp[:2]...)
	buf = append(buf, []byte("data")...)
	binary.LittleEndian.PutUint32(tmp, uint32(dataSize))
	buf = append(buf, tmp...)
	buf = append(buf, make([]byte, dataSize)...)

	if err := os.WriteFile(path, buf, 0o644); err != nil {
		t.Fatalf("写入测试 WAV 失败: %v", err)
	}
}

// newTestManager 准备一个使用临时数据目录的曲库管理器。
// 默认清空过滤规则，避免默认的「排除 <10KB」把小体积测试文件全过滤掉，
// 需要验证过滤行为的测试再单独写入规则。
func newTestManager(t *testing.T) (*Manager, *bootstrap.Store, string) {
	t.Helper()
	dataDir := t.TempDir()
	t.Setenv("LMPLAYER_DATA_DIR", dataDir)

	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("创建配置存储失败: %v", err)
	}
	if err := store.Update(func(c *bootstrap.Config) {
		// 清空默认规则 + 隔离下载目录。
		// 后者是必须的：EffectiveFolders 会把 DownloadDir 自动当成扫描根，
		// 默认值指向本机真实的「音乐/downloads」，那里的文件会让
		// 「应该扫到 N 首」的断言在本机上失败（换台机器又可能变绿）。
		c.FilterRules = []bootstrap.FilterRule{}
		dir := filepath.Join(t.TempDir(), "downloads")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("创建临时下载目录失败: %v", err)
		}
		c.DownloadDir = dir
	}); err != nil {
		t.Fatalf("清空默认规则失败: %v", err)
	}
	m := NewManager(store)
	return m, store, dataDir
}

func TestScanFindsAndFilters(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()

	// 恢复两条与产品默认一致的规则：排除 <10KB、排除 .mp4
	if err := store.Update(func(c *bootstrap.Config) {
		c.FilterRules = []bootstrap.FilterRule{
			{ID: "rule_size", Type: "size", Op: "lt", Value: "10240", Unit: "B", Scope: "exclude", Enabled: true},
			{ID: "rule_mp4", Type: "regex", Op: "match", Value: `\.mp4$`, Scope: "exclude", Enabled: true},
		}
	}); err != nil {
		t.Fatal(err)
	}

	// 3 首正常音频 + 1 个过小的文件（应被默认规则排除）+ 1 个非音频文件
	writeWAV(t, filepath.Join(music, "song-a.wav"), 2)
	writeWAV(t, filepath.Join(music, "song-b.wav"), 3)
	if err := os.MkdirAll(filepath.Join(music, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeWAV(t, filepath.Join(music, "sub", "song-c.wav"), 1)
	tiny := filepath.Join(music, "tiny.mp4")
	if err := os.WriteFile(tiny, make([]byte, 1200), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(music, "notes.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music, Status: "ok", Watching: false}}
	}); err != nil {
		t.Fatal(err)
	}
	// 让管理器读到最新的文件夹列表
	m = NewManager(store)

	res, err := m.Scan(context.Background(), false)
	if err != nil {
		t.Fatalf("扫描失败: %v", err)
	}

	if res.Found != 3 {
		t.Errorf("应找到 3 个音频文件，实际 %d", res.Found)
	}
	if res.Kept != 2 {
		t.Errorf("应有 2 首通过过滤（tiny.mp4 被 <10KB 规则排除），实际 %d", res.Kept)
	}
	if res.Excluded != 1 {
		t.Errorf("应过滤掉 1 个文件，实际 %d", res.Excluded)
	}

	songs := m.Songs()
	if len(songs) != 2 {
		t.Fatalf("Songs() 应返回 2 首，实际 %d", len(songs))
	}
	for _, s := range songs {
		if s.Ext != "wav" {
			t.Errorf("不应出现非 wav 歌曲: %+v", s)
		}
		if s.Title == "" || s.Artist == "" || s.Album == "" {
			t.Errorf("标题/歌手/专辑应有兜底值: %+v", s)
		}
		if s.Duration < 900 || s.Duration > 3100 {
			t.Errorf("WAV 时长解析异常: %d ms (%s)", s.Duration, s.Path)
		}
		if s.SampleRate != 8000 {
			t.Errorf("采样率解析异常: %d", s.SampleRate)
		}
	}

	// 文件夹状态与曲目数应回写。
	// 注意：Folders() 里还包含「下载目录」这个由程序管理的隐式扫描根
	// （见 bootstrap.Config.EffectiveFolders），这里只看用户配置的那一个。
	folders := userFolders(m.Folders())
	if len(folders) != 1 || folders[0].Status != "ok" {
		t.Errorf("文件夹状态异常: %+v", folders)
	}
	if folders[0].TrackCount != 2 {
		t.Errorf("文件夹曲目数应为 2，实际 %d", folders[0].TrackCount)
	}
}

// userFolders 过滤掉程序自动管理的扫描根（下载目录），
// 只留下用户在设置里配置的文件夹。
func userFolders(all []bootstrap.Folder) []bootstrap.Folder {
	out := make([]bootstrap.Folder, 0, len(all))
	for _, f := range all {
		if f.ID == bootstrap.DownloadFolderID {
			continue
		}
		out = append(out, f)
	}
	return out
}

func TestScanMissingFolderStatus(t *testing.T) {
	m, store, _ := newTestManager(t)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "gone", Path: filepath.Join(t.TempDir(), "not-exist")}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)

	res, err := m.Scan(context.Background(), false)
	if err != nil {
		t.Fatalf("扫描不应报错: %v", err)
	}
	if res.Found != 0 || res.Kept != 0 {
		t.Errorf("不存在的目录不应有歌曲: %+v", res)
	}
	if got := m.Folders()[0].Status; got != "missing" {
		t.Errorf("文件夹状态应为 missing，实际 %q", got)
	}
}

func TestScanCacheReuse(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "a.wav"), 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)

	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	first := m.Songs()
	if len(first) != 1 {
		t.Fatalf("应有 1 首，实际 %d", len(first))
	}

	// 第二次扫描应命中元数据缓存，结果保持一致
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	second := m.Songs()
	if len(second) != 1 || second[0].ID != first[0].ID {
		t.Errorf("重复扫描应得到同一首歌（id 稳定），%v -> %v", first, second)
	}
	if second[0].Duration != first[0].Duration {
		t.Errorf("缓存复用后时长应一致: %d != %d", second[0].Duration, first[0].Duration)
	}
}

func TestRescanPathsIncremental(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "a.wav"), 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}

	newFile := filepath.Join(music, "b.wav")
	writeWAV(t, newFile, 1)

	res, err := m.RescanPaths(context.Background(), []string{newFile})
	if err != nil {
		t.Fatalf("增量扫描失败: %v", err)
	}
	if res.Added != 1 {
		t.Errorf("应新增 1 首，实际 %d", res.Added)
	}
	if len(m.Songs()) != 2 {
		t.Errorf("增量后应有 2 首，实际 %d", len(m.Songs()))
	}
}

func TestWatcherPicksUpNewFile(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}

	w, err := NewWatcher(m)
	if err != nil {
		t.Skipf("当前环境不支持 fsnotify: %v", err)
	}
	defer w.Stop()
	if err := w.Start([]string{music}); err != nil {
		t.Fatalf("启动监听失败: %v", err)
	}

	writeWAV(t, filepath.Join(music, "watched.wav"), 1)

	// 防抖窗口 500ms，这里最多等 5 秒
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if len(m.Songs()) == 1 {
			return
		}
		time.Sleep(150 * time.Millisecond)
	}
	t.Errorf("文件监听未在 5 秒内更新曲库（当前 %d 首）", len(m.Songs()))
}
