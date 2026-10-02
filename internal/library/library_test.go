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

/* --------------------------------------------------------------------------
   DropSong：从曲库里摘掉一首歌（见 services_unplayable.go 的用途）
   -------------------------------------------------------------------------- */

// ★ 这条测试锁住一个很容易写漏的细节：**元数据缓存条目也必须一起清**。
//
// 只摘内存不同步缓存的话，下次扫描会命中缓存 → 认为「这个文件没变，
// 复用旧元数据」→ 这首歌又回到曲库。用户看到的现象就是
// 「移除之后一扫描它又回来了」，然后每次点到又失败一次。
func TestDropSongRemovesSongAndCache(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	path := filepath.Join(music, "bad.wav")
	writeWAV(t, path, 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)

	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	songs := m.Songs()
	if len(songs) != 1 {
		t.Fatalf("前置条件：应有 1 首，实际 %d", len(songs))
	}
	id := songs[0].ID

	// 缓存里确实有这个文件的条目（否则这条测试没有意义）
	m.cacheMu.RLock()
	_, cachedBefore := m.cache[path]
	m.cacheMu.RUnlock()
	if !cachedBefore {
		t.Fatal("前置条件：扫描后缓存里应当有这个文件的条目")
	}

	if !m.DropSong(id) {
		t.Error("DropSong 应返回 true")
	}
	if _, ok := m.SongByID(id); ok {
		t.Error("DropSong 之后这首歌不该还在曲库里")
	}

	m.cacheMu.RLock()
	_, cachedAfter := m.cache[path]
	m.cacheMu.RUnlock()
	if cachedAfter {
		t.Error("DropSong 必须同时清掉元数据缓存条目（否则重扫会让它回来）")
	}

	// 幂等：重复摘返回 false，不 panic
	if m.DropSong(id) {
		t.Error("重复 DropSong 应返回 false")
	}
	if m.DropSong("") {
		t.Error("空 id 应返回 false")
	}
}

// DropSong 之后再扫描，文件仍在磁盘上、仍会被重新扫进来 ——
// 这正是「用户修好文件后重新扫描就能回来」的依据。
func TestDropSongThenRescanFindsItAgain(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	out := filepath.Join(music, "b.wav")
	writeWAV(t, out, 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	songs := m.Songs()
	if len(songs) != 1 {
		t.Fatalf("应有 1 首，实际 %d", len(songs))
	}

	m.DropSong(songs[0].ID)
	if len(m.Songs()) != 0 {
		t.Fatalf("摘掉后应为 0 首，实际 %d", len(m.Songs()))
	}

	// 重新扫描：文件还在磁盘上，所以它应当回来（这正是「已修好」按钮的依据）
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if len(m.Songs()) != 1 {
		t.Errorf("重新扫描后文件应重新入库（磁盘文件没被删），实际 %d 首", len(m.Songs()))
	}
}

/* --------------------------------------------------------------------------
   Songs() 排序快照的失效
   --------------------------------------------------------------------------
   背景：Songs() 现在缓存「按 AddedAt 倒序」的快照（省掉每次调用的整库排序，
   实测 10k 首 2.48ms → 0.50ms）。代价是**每一处改动 m.songs 的地方都必须
   标记快照失效**，漏一处就会返回过期列表 —— 这类 bug 不会崩、只会「界面少一首
   或者删了还在」，非常难查。这组测试就是为它钉的。
   -------------------------------------------------------------------------- */

// TestSongsSnapshotReflectsDrop 摘歌后快照必须立刻反映（本轮真实踩到过的漏标）
func TestSongsSnapshotReflectsDrop(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "a.wav"), 1)
	writeWAV(t, filepath.Join(music, "b.wav"), 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	songs := m.Songs()
	if len(songs) != 2 {
		t.Fatalf("应有 2 首，实际 %d", len(songs))
	}

	// 先读一次让快照建立，再删 —— 这一步正是回归点：
	// 如果 DropSong 没标脏，下面会读到那条已经被删掉的歌。
	if !m.DropSong(songs[0].ID) {
		t.Fatal("DropSong 应返回 true")
	}
	got := m.Songs()
	if len(got) != 1 {
		t.Fatalf("摘掉 1 首后应剩 1 首，实际 %d（快照未失效）", len(got))
	}
	if got[0].ID == songs[0].ID {
		t.Errorf("被摘掉的那首仍出现在 Songs() 里：%s", got[0].ID)
	}
	// 逐 id 查询也必须同步（走的是 m.songs 本身，与快照是两条路径）
	if _, ok := m.SongByID(songs[0].ID); ok {
		t.Errorf("SongByID 仍能查到被摘掉的 %s", songs[0].ID)
	}
}

// TestSongsSnapshotIsCopy 调用方改返回值不能污染后续请求
func TestSongsSnapshotIsCopy(t *testing.T) {
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
	first[0].Title = "被调用方改坏了"

	second := m.Songs()
	if second[0].Title == "被调用方改坏了" {
		t.Error("Songs() 返回的必须是拷贝：调用方一改就污染了内部快照")
	}
}

// TestSongsSnapshotOrderIsStable 快照命中时顺序必须与重建时一致（AddedAt 倒序）
func TestSongsSnapshotOrderIsStable(t *testing.T) {
	m, store, _ := newTestManager(t)
	music := t.TempDir()
	for _, name := range []string{"a.wav", "b.wav", "c.wav"} {
		writeWAV(t, filepath.Join(music, name), 1)
	}
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}

	// 连读多次（第 2 次起命中快照），顺序必须完全一致
	base := m.Songs()
	for i := 0; i < 5; i++ {
		again := m.Songs()
		if len(again) != len(base) {
			t.Fatalf("第 %d 次读取长度不一致：%d vs %d", i+2, len(again), len(base))
		}
		for j := range base {
			if again[j].ID != base[j].ID {
				t.Fatalf("第 %d 次读取顺序变了：位置 %d 是 %s，期望 %s", i+2, j, again[j].ID, base[j].ID)
			}
		}
	}
}
