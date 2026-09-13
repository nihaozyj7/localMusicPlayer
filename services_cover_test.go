package main

import (
	"context"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/coverfetch"
	"musicplayer/internal/library"
	"musicplayer/internal/metacache"
)

/* --------------------------------------------------------------------------
   「把缓存里的封面/歌词补写进歌曲文件」这个一次性动作。
   --------------------------------------------------------------------------
   它写的是**用户的音乐文件**，所以这里要盯住三件事：
     1. 支持写标签的格式（m4a / flac）真的写进去了；
     2. 不支持写标签的格式（mp3 / wav…）被明确跳过，而不是去硬写；
     3. 缓存里没有对应记录的歌不会被碰，曲库里已消失的 id 也只是跳过。
   -------------------------------------------------------------------------- */

// buildTinyM4A 造一个 ftyp + moov(mvhd) + mdat 的最小 m4a（够 dhowden/tag 解析）。
func buildTinyM4A() []byte {
	mkBox := func(kind string, payload []byte) []byte {
		out := make([]byte, 4)
		binary.BigEndian.PutUint32(out, uint32(len(payload)+8))
		out = append(out, []byte(kind)...)
		return append(out, payload...)
	}
	out := mkBox("ftyp", append([]byte("M4A "), make([]byte, 4)...))
	out = append(out, mkBox("moov", mkBox("mvhd", make([]byte, 100)))...)
	return append(out, mkBox("mdat", make([]byte, 256))...)
}

// buildTinyFLAC 造一个 fLaC + STREAMINFO + 几个音频字节。
func buildTinyFLAC() []byte {
	body := make([]byte, 34)
	out := append([]byte("fLaC"), 0x80|0 /* 最后一块 */, 0, 0, 34)
	out = append(out, body...)
	return append(out, 0xFF, 0xF8, 0x69, 0x00)
}

func TestWriteCacheToFiles(t *testing.T) {
	dir := t.TempDir()
	musicDir := filepath.Join(dir, "music")
	if err := os.MkdirAll(musicDir, 0o755); err != nil {
		t.Fatal(err)
	}

	m4aPath := filepath.Join(musicDir, "song.m4a")
	flacPath := filepath.Join(musicDir, "song.flac")
	mp3Path := filepath.Join(musicDir, "song.mp3")
	if err := os.WriteFile(m4aPath, buildTinyM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(flacPath, buildTinyFLAC(), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(mp3Path, []byte("ID3\x03\x00\x00\x00\x00\x00\x00"), 0o644); err != nil {
		t.Fatal(err)
	}

	songs := map[string]bootstrap.Song{
		"t_m4a":  {ID: "t_m4a", Path: m4aPath, Title: "M4A 歌", Ext: ".m4a"},
		"t_flac": {ID: "t_flac", Path: flacPath, Title: "FLAC 歌", Ext: ".flac"},
		"t_mp3":  {ID: "t_mp3", Path: mp3Path, Title: "MP3 歌", Ext: ".mp3"},
	}

	// 配置存储没有「指定目录」的构造器，走它自己的环境变量（测试里只想拿一个
	// 干净的 Store，不关心内容），这样不会碰到用户真实的 %APPDATA%\MusicPlayer
	t.Setenv("MUSICPLAYER_DATA_DIR", filepath.Join(dir, "data"))
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	cache := metacache.NewStore(filepath.Join(dir, "cache", "meta"))
	svc := NewCoverService(store, cache, coverfetch.New(), func(id string) (bootstrap.Song, bool) {
		s, ok := songs[id]
		return s, ok
	})

	cover := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0xFF, 0xD9}
	lyrics := "[00:01.00]第一行"
	for _, id := range []string{"t_m4a", "t_flac", "t_mp3"} {
		if _, err := cache.SaveCover(id, "image/jpeg", cover, "user"); err != nil {
			t.Fatal(err)
		}
		if _, err := cache.SaveLyrics(id, lyrics, "user"); err != nil {
			t.Fatal(err)
		}
	}
	// 曲库里已经不存在的 id：不能让整体失败
	if _, err := cache.SaveLyrics("t_gone", lyrics, "user"); err != nil {
		t.Fatal(err)
	}

	res, err := svc.WriteCacheToFiles()
	if err != nil {
		t.Fatalf("写入失败: %v", err)
	}

	if got := res["total"].(int); got != 4 {
		t.Fatalf("total 应为 4（三首 + 一个残留 id），实际 %d", got)
	}
	if got := res["written"].(int); got != 2 {
		t.Fatalf("written 应为 2（m4a / flac），实际 %d —— 结果 %+v", got, res)
	}
	if got := res["skipped"].(int); got != 2 {
		t.Fatalf("skipped 应为 2（mp3 不支持 + 残留 id），实际 %d —— 结果 %+v", got, res)
	}
	if got := res["covers"].(int); got != 2 {
		t.Fatalf("covers 应为 2，实际 %d", got)
	}
	if got := res["lyrics"].(int); got != 2 {
		t.Fatalf("lyrics 应为 2，实际 %d", got)
	}

	// m4a：文件应变大且带上 covr / ©lyr
	m4aAfter, err := os.ReadFile(m4aPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(m4aAfter) <= len(buildTinyM4A()) {
		t.Fatal("m4a 文件应变大")
	}
	for _, atom := range []string{"covr", "\xa9lyr"} {
		if !containsBytes(m4aAfter, []byte(atom)) {
			t.Fatalf("m4a 里没找到 %q", atom)
		}
	}
	// 音频数据一字未动
	if !containsBytes(m4aAfter, make([]byte, 256)) {
		t.Fatal("m4a 的 mdat 似乎被改动了")
	}

	// flac：带上 PICTURE 与 LYRICS
	flacAfter, err := os.ReadFile(flacPath)
	if err != nil {
		t.Fatal(err)
	}
	if !containsBytes(flacAfter, []byte("LYRICS="+lyrics)) {
		t.Fatal("flac 里没找到 LYRICS 字段")
	}
	if !containsBytes(flacAfter, cover) {
		t.Fatal("flac 里没找到封面数据")
	}

	// mp3：必须原样不动
	mp3After, err := os.ReadFile(mp3Path)
	if err != nil {
		t.Fatal(err)
	}
	if string(mp3After) != "ID3\x03\x00\x00\x00\x00\x00\x00" {
		t.Fatal("mp3 不支持写标签，文件不该被改动")
	}

	reasons, _ := res["reasons"].([]string)
	if len(reasons) == 0 {
		t.Fatal("跳过的原因应该带回来给用户看")
	}
}

/* --------------------------------------------------------------------------
   与真实曲库对接：缓存里的 songID 必须能和 library 扫描出来的 id 对上。
   --------------------------------------------------------------------------
   这是最容易出错的一段：缓存文件名用的是 bootstrap.StableID(路径)，
   而曲库扫描后也是同一个函数。两边算法一旦漂移（比如前端 stableId 的
   UTF-16 码元处理），「把缓存写进文件」就会全部落空 —— 界面只会显示
   「已写入 0 首，跳过 N 首」，很难查。这里用真的 Manager 扫一遍来钉住它。
   -------------------------------------------------------------------------- */
func TestWriteCacheToFilesMatchesLibraryIDs(t *testing.T) {
	dir := t.TempDir()
	musicDir := filepath.Join(dir, "music")
	if err := os.MkdirAll(musicDir, 0o755); err != nil {
		t.Fatal(err)
	}
	songPath := filepath.Join(musicDir, "probe-song.m4a")
	// mdat 填 30KB：默认过滤规则里有一条「小于 10KB 排除」，
	// 用最小样本会被它筛掉，那是规则在正常工作、不是这里的 bug
	raw := buildTinyM4A()
	raw = append(raw, make([]byte, 30000)...)
	if err := os.WriteFile(songPath, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	t.Setenv("MUSICPLAYER_DATA_DIR", filepath.Join(dir, "data"))
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	// 关掉默认过滤规则（默认有一条「小于 10KB 排除」，会把最小测试文件筛掉）。
	// 注意要用空切片而不是 nil：nil 会被 store 当成「没配过」而重新填回默认规则。
	if err := store.Update(func(c *bootstrap.Config) {
		c.FilterRules = []bootstrap.FilterRule{}
		c.DownloadDir = hermeticDownloadDir(t)
		c.Folders = []bootstrap.Folder{{ID: "f_test", Path: musicDir, Status: "ok"}}
		c.AutoScanOnStart = false
		c.WatchFolders = false
	}); err != nil {
		t.Fatal(err)
	}

	lib := library.NewManager(store)
	if _, err := lib.Scan(context.Background(), false); err != nil {
		t.Fatalf("扫描失败: %v", err)
	}
	songs := lib.Songs()
	if len(songs) != 1 {
		t.Fatalf("应该扫到 1 首歌，实际 %d", len(songs))
	}
	songID := songs[0].ID

	cache := metacache.NewStore(filepath.Join(dir, "cache", "meta"))
	cover := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0xFF, 0xD9}
	if _, err := cache.SaveCover(songID, "image/jpeg", cover, "user"); err != nil {
		t.Fatal(err)
	}
	if _, err := cache.SaveLyrics(songID, "[00:01.00]hi", "user"); err != nil {
		t.Fatal(err)
	}

	svc := NewCoverService(store, cache, coverfetch.New(), lib.SongByID)
	res, err := svc.WriteCacheToFiles()
	if err != nil {
		t.Fatal(err)
	}
	if got := res["written"].(int); got != 1 {
		t.Fatalf("应该写入 1 首（说明缓存 id 与曲库 id 对得上），实际 %+v", res)
	}

	after, err := os.ReadFile(songPath)
	if err != nil {
		t.Fatal(err)
	}
	if !containsBytes(after, []byte("covr")) || !containsBytes(after, []byte("\xa9lyr")) {
		t.Fatal("封面与歌词都应该写进文件")
	}
}

func TestWriteCacheToFilesEmpty(t *testing.T) {	dir := t.TempDir()
	t.Setenv("MUSICPLAYER_DATA_DIR", filepath.Join(dir, "data"))
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	svc := NewCoverService(store, metacache.NewStore(filepath.Join(dir, "cache")), coverfetch.New(),
		func(string) (bootstrap.Song, bool) { return bootstrap.Song{}, false })

	res, err := svc.WriteCacheToFiles()
	if err != nil {
		t.Fatalf("空缓存不该报错: %v", err)
	}
	if got := res["total"].(int); got != 0 {
		t.Fatalf("空缓存 total 应为 0，实际 %d", got)
	}
}

func containsBytes(haystack, needle []byte) bool {
	if len(needle) == 0 || len(haystack) < len(needle) {
		return false
	}
outer:
	for i := 0; i+len(needle) <= len(haystack); i++ {
		for j := range needle {
			if haystack[i+j] != needle[j] {
				continue outer
			}
		}
		return true
	}
	return false
}
