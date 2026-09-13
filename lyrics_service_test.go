package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/lyrics"
	"musicplayer/internal/metacache"
)

/* --------------------------------------------------------------------------
   歌词读取链与「持久化」。
   --------------------------------------------------------------------------
   盯住两件用户报过的问题：
     1. 手动匹配到的歌词，关掉应用再打开就没了 —— 因为只存在前端内存里，
        没有落进后端缓存（缓存目录才是真相来源）；
     2. 读取链缺少「缓存」这一层，也没有「在线自动匹配」这一步，
        试听（在线曲目）时压根拿不到歌词。

   下面这些断言都是**跨 Load 调用**的（相当于「第二次打开」），
   而不是只看同一个服务实例里的内存状态。
   -------------------------------------------------------------------------- */

// fakeMatcher 假的在线歌词源：不联网，返回固定歌词。
type fakeMatcher struct {
	calls int
	lrc   string
	title string
	art   string
	err   error
}

func (f *fakeMatcher) Match(_ context.Context, title, artist string, durationMS int64) (string, string, string, string, error) {
	f.calls++
	if f.err != nil {
		return "", "", "", "", f.err
	}
	return f.lrc, "fake", f.title, f.art, nil
}

type lyricsFixture struct {
	svc    *LyricsService
	cache  *metacache.Store
	store  *bootstrap.Store
	cfg    *ConfigService
	songs  map[string]bootstrap.Song
	dir    string
	match  *fakeMatcher
	m4a    string
	reload func(t *testing.T) *LyricsService
}

// setConfig 走真实的配置写入路径（ConfigService.Set → applyPatch），
// 这样测试覆盖的是「前端推 lyricsSources 时后端怎么处理」，包含规范化。
func (f *lyricsFixture) setConfig(t *testing.T, patch map[string]any) {
	t.Helper()
	if _, err := f.cfg.Set(patch); err != nil {
		t.Fatalf("写配置失败: %v", err)
	}
}

func newLyricsFixture(t *testing.T) *lyricsFixture {
	t.Helper()
	dir := t.TempDir()
	musicDir := filepath.Join(dir, "music")
	if err := os.MkdirAll(musicDir, 0o755); err != nil {
		t.Fatal(err)
	}
	m4a := filepath.Join(musicDir, "song.m4a")
	if err := os.WriteFile(m4a, buildTinyM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	plain := filepath.Join(musicDir, "plain.m4a")
	if err := os.WriteFile(plain, buildTinyM4A(), 0o644); err != nil {
		t.Fatal(err)
	}

	songs := map[string]bootstrap.Song{
		"t_m4a": {ID: "t_m4a", Path: m4a, Title: "夜曲", Artist: "周杰伦", Ext: ".m4a", Duration: 226000},
		// 标题是占位元数据，用来验证「未知歌手」不会被拿去搜
		"t_plain": {ID: "t_plain", Path: plain, Title: "Track 07", Artist: "未知歌手", Album: "未知专辑", Ext: ".m4a"},
	}

	t.Setenv("MUSICPLAYER_DATA_DIR", filepath.Join(dir, "data"))
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	cacheDir := filepath.Join(dir, "cache", "meta")
	cache := metacache.NewStore(cacheDir)
	matcher := &fakeMatcher{lrc: "[00:01.00]在线匹配到的歌词", title: "夜曲", art: "周杰伦"}

	fix := &lyricsFixture{
		cache: cache,
		store: store,
		cfg:   NewConfigService(store),
		songs: songs,
		dir:   dir,
		match: matcher,
		m4a:   m4a,
	}
	fix.reload = func(t *testing.T) *LyricsService {
		t.Helper()
		// 新的服务实例 = 新的进程：内存里什么都不剩，只有磁盘上的缓存
		fresh := metacache.NewStore(cacheDir)
		svc := NewLyricsService(store, func(id string) (bootstrap.Song, bool) {
			s, ok := songs[id]
			return s, ok
		})
		svc.setCache(fresh)
		svc.setOnline(matcher)
		return svc
	}
	fix.svc = fix.reload(t)
	return fix
}

// 手动匹配（Save）之后，换一个服务实例仍然读得到。
func TestLyricsSaveThenReloadFromCache(t *testing.T) {
	f := newLyricsFixture(t)

	res, err := f.svc.Save("t_m4a", "[00:03.00]手动匹配的歌词", "online:lrclib", boolPtr(false))
	if err != nil {
		t.Fatalf("Save 失败: %v", err)
	}
	if res["cached"] != true {
		t.Fatalf("应当写进缓存: %+v", res)
	}

	// 只留「缓存」这一层，确保命中的确实是缓存
	f.setConfig(t, map[string]any{"lyricsSources": []any{"cache"}})
	svc2 := f.reload(t)
	got, err := svc2.Load("t_m4a")
	if err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	if got.Source != lyrics.SourceCache || got.LRC != "[00:03.00]手动匹配的歌词" {
		t.Fatalf("重启后没有从缓存读到歌词: %+v", got)
	}
}

// 开启「写进歌曲文件」时，歌词要真的进到音频文件里（内嵌优先于缓存）。
func TestLyricsSaveEmbedsIntoFile(t *testing.T) {
	f := newLyricsFixture(t)

	if _, err := f.svc.Save("t_m4a", "[00:05.00]写进文件的歌词", "user", boolPtr(true)); err != nil {
		t.Fatalf("Save 失败: %v", err)
	}

	// 清掉缓存层，只从文件里读 —— 这样命中的一定是内嵌歌词
	f.setConfig(t, map[string]any{"lyricsSources": []any{"embedded"}})
	svc2 := f.reload(t)
	got, err := svc2.Load("t_m4a")
	if err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	if got.Source != lyrics.SourceEmbedded {
		t.Fatalf("歌词没有写进文件（来源 %q）", got.Source)
	}
	if got.LRC != "[00:05.00]写进文件的歌词" {
		t.Fatalf("内嵌歌词内容不对: %q", got.LRC)
	}
}

// 字级歌词（逐字时间戳）在「应用」时先归一化成行级，再写缓存与歌曲文件。
func TestLyricsSaveNormalizesWordLevel(t *testing.T) {
	f := newLyricsFixture(t)

	res, err := f.svc.Save("t_m4a", "[00:12.00]<00:12.00>你<00:12.30>好", "online:qq", boolPtr(true))
	if err != nil {
		t.Fatalf("Save 失败: %v", err)
	}
	if res["lrc"] != "[00:12.00]你好" {
		t.Fatalf("返回的歌词应当是行级，实际 %v", res["lrc"])
	}
	if res["converted"] != true || res["lineLevel"] != false {
		t.Fatalf("应当标记为「做过字级转换」: %+v", res)
	}

	// 清掉缓存层，只从文件里读：写进文件的也必须已经是行级
	f.setConfig(t, map[string]any{"lyricsSources": []any{"embedded"}})
	svc2 := f.reload(t)
	got, err := svc2.Load("t_m4a")
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != lyrics.SourceEmbedded {
		t.Fatalf("歌词没有写进文件（来源 %q）", got.Source)
	}
	if got.LRC != "[00:12.00]你好" {
		t.Fatalf("内嵌进文件的应是行级歌词，实际 %q", got.LRC)
	}
}

// 本地三级都读不到时，AutoMatch 联网匹配一次并落缓存；
// 第二次（相当于重启后）应当直接命中缓存，不再联网。
func TestLyricsAutoMatchCaches(t *testing.T) {
	f := newLyricsFixture(t)

	got, err := f.svc.AutoMatch("t_m4a")
	if err != nil {
		t.Fatalf("AutoMatch 失败: %v", err)
	}
	if got.Source != "online:fake" || got.LRC != "[00:01.00]在线匹配到的歌词" {
		t.Fatalf("自动匹配结果不对: %+v", got)
	}
	if f.match.calls != 1 {
		t.Fatalf("应当只联网一次，实际 %d 次", f.match.calls)
	}

	svc2 := f.reload(t)
	loaded, err := svc2.Load("t_m4a")
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Source != lyrics.SourceCache {
		t.Fatalf("第二次应当命中缓存，实际来源 %q", loaded.Source)
	}
	if f.match.calls != 1 {
		t.Fatalf("第二次不该再联网，实际 %d 次", f.match.calls)
	}
}

// 占位元数据（未知歌手）不能拿去搜在线歌词。
func TestLyricsAutoMatchSkipsPlaceholderArtist(t *testing.T) {
	f := newLyricsFixture(t)
	if _, err := f.svc.AutoMatch("t_plain"); err != nil {
		t.Fatalf("AutoMatch 失败: %v", err)
	}
	if f.match.calls != 0 {
		t.Fatalf("「未知歌手」不该触发在线匹配，实际调了 %d 次", f.match.calls)
	}
}

// 在线试听曲目（不在本地曲库里）也能读缓存、也能保存。
func TestLyricsOnlineTrackUsesCache(t *testing.T) {
	f := newLyricsFixture(t)
	const id = "bili:BV1xx411c7mD"

	// 曲库里没有它 —— Load 不能报错，而是安静地返回空
	got, err := f.svc.Load(id)
	if err != nil {
		t.Fatalf("在线曲目 Load 不该报错: %v", err)
	}
	if got.LRC != "" {
		t.Fatalf("还没有缓存时应当是空的: %+v", got)
	}

	if _, err := f.svc.Save(id, "[00:02.00]试听时匹配的歌词", "online:lrclib", boolPtr(true)); err != nil {
		t.Fatalf("在线曲目 Save 失败: %v", err)
	}
	svc2 := f.reload(t)
	got, err = svc2.Load(id)
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != lyrics.SourceCache || got.LRC != "[00:02.00]试听时匹配的歌词" {
		t.Fatalf("在线曲目没有从缓存读到歌词: %+v", got)
	}
}

// 关掉 online 来源时 AutoMatch 直接空返回，不联网。
func TestLyricsAutoMatchRespectsSources(t *testing.T) {
	f := newLyricsFixture(t)
	f.setConfig(t, map[string]any{"lyricsSources": []any{"embedded", "lrc-file", "cache"}})
	got, err := f.svc.AutoMatch("t_m4a")
	if err != nil {
		t.Fatal(err)
	}
	if got.LRC != "" || f.match.calls != 0 {
		t.Fatalf("关掉 online 后不该联网: %+v calls=%d", got, f.match.calls)
	}
}

// 旧配置（没有 cache 这一层）经过后端补丁后必须带上 cache，
// 否则升级上来的用户永远读不到自己之前匹配过的歌词。
func TestLyricsSourcesPatchAddsCache(t *testing.T) {
	f := newLyricsFixture(t)
	f.setConfig(t, map[string]any{"lyricsSources": []any{"lrc-file", "embedded", "online"}})
	got := f.store.Get().LyricsSources
	want := []string{"lrc-file", "embedded", "cache", "online"}
	if len(got) != len(want) {
		t.Fatalf("来源列表不对: %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("来源列表不对: %v", got)
		}
	}
}

func boolPtr(v bool) *bool { return &v }
