package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/coverfetch"
	"musicplayer/internal/meta"
	"musicplayer/internal/metacache"
)

/* --------------------------------------------------------------------------
   多封面 + 内嵌封面（CoverService）
   --------------------------------------------------------------------------
   这些测试盯住四件事：
     1. 列表 = 缓存项（可编辑）+ 文件内嵌项（只读，负数下标）；
     2. 添加是「追加 + 设为当前」，校验不过的图绝不进缓存；
     3. 切换 / 轮播 / 删除之后返回的集合与重启后读到的状态一致；
     4. 写回文件时写的是**全部**缓存封面，顺序与 items 一致。
   -------------------------------------------------------------------------- */

// solidPNG 造一张最小但能通过 coverfetch 体检的 PNG（72×72、非纯白）。
//
// 为什么不复用 internal/metacache 里的 encodeTestPNG：那是另一个包的测试
// 内部函数，跨包用不了。这里自己造是因为 CoverService.Add 会真的解码图片，
// 用几字节的假字节会被 InspectImage 直接拒掉（正是它该做的事）。
func solidPNG(t *testing.T, c color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 72, 72))
	for y := 0; y < 72; y++ {
		for x := 0; x < 72; x++ {
			// 加一点渐变，避免被判成「单一颜色」（那把纯白图的规则）
			img.Set(x, y, color.RGBA{c.R + uint8(x%5), c.G + uint8(y%5), c.B, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func pngDataURL(t *testing.T, c color.RGBA) string {
	t.Helper()
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(solidPNG(t, c))
}

// newCoverSvcForTest 造一个「一首 m4a 歌」的 CoverService。
func newCoverSvcForTest(t *testing.T) (*CoverService, *metacache.Store, string) {
	t.Helper()
	dir := t.TempDir()
	songPath := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(songPath, buildTinyM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("MUSICPLAYER_DATA_DIR", filepath.Join(dir, "data"))
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	cache := metacache.NewStore(filepath.Join(dir, "cache", "meta"))
	songs := map[string]bootstrap.Song{
		"t_song": {ID: "t_song", Path: songPath, Title: "样例", Ext: ".m4a"},
	}
	svc := NewCoverService(store, cache, coverfetch.New(), func(id string) (bootstrap.Song, bool) {
		s, ok := songs[id]
		return s, ok
	})
	return svc, cache, songPath
}

func TestCoverServiceAddAppendsAndActivates(t *testing.T) {
	svc, cache, _ := newCoverSvcForTest(t)

	set, err := svc.Add("t_song", "", pngDataURL(t, color.RGBA{10, 20, 30, 255}), nil)
	if err != nil {
		t.Fatalf("添加封面失败: %v", err)
	}
	if len(set.Items) != 1 || set.Active != 0 {
		t.Fatalf("第一张应是唯一项且生效: %+v", set)
	}
	if !set.Items[0].Active || set.Items[0].MIME != "image/png" {
		t.Fatalf("第一项的标记不对: %+v", set.Items[0])
	}
	if set.Items[0].Width != 72 || set.Items[0].Height != 72 {
		t.Fatalf("尺寸应被记下来: %+v", set.Items[0])
	}

	// 第二张：追加 + 设为当前
	set, err = svc.Add("t_song", "", pngDataURL(t, color.RGBA{200, 40, 90, 255}), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(set.Items) != 2 {
		t.Fatalf("应有 2 张，实际 %d", len(set.Items))
	}
	if set.Active != 1 || !set.Items[1].Active || set.Items[0].Active {
		t.Fatalf("新加的那张应成为当前生效: %+v", set)
	}
	// CacheStats 的 covers 语义仍然是「有封面的歌曲数」
	if got := svc.CacheStats()["covers"].(int); got != 1 {
		t.Fatalf("covers 统计应为 1（一首歌），实际 %d", got)
	}
	if cache.CoverCount("t_song") != 2 {
		t.Fatal("缓存里应有 2 张")
	}
}

// 校验不过的图（这里用纯白占位图）绝不能进缓存。
func TestCoverServiceAddRejectsBlankImage(t *testing.T) {
	svc, cache, _ := newCoverSvcForTest(t)
	img := image.NewRGBA(image.Rect(0, 0, 72, 72))
	for y := 0; y < 72; y++ {
		for x := 0; x < 72; x++ {
			img.Set(x, y, color.RGBA{255, 255, 255, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	url := "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())

	if _, err := svc.Add("t_song", "", url, nil); err == nil {
		t.Fatal("白图应被拒绝")
	}
	if got := cache.CoverCount("t_song"); got != 0 {
		t.Fatalf("白图不该进缓存，实际 %d 张", got)
	}
}

func TestCoverServiceAddManySkipsInvalid(t *testing.T) {
	svc, _, _ := newCoverSvcForTest(t)

	got, err := svc.AddMany("t_song", []string{
		pngDataURL(t, color.RGBA{10, 20, 30, 255}),
		"",                     // 空白
		"   ",                  // 只有空格
		"not-a-data-url",       // 完全不是 data URL
		"data:image/png,plain", // 不是 base64
		pngDataURL(t, color.RGBA{90, 90, 90, 255}),
	}, nil)
	if err != nil {
		t.Fatalf("批量添加失败: %v", err)
	}
	if len(got.Items) != 2 {
		t.Fatalf("应只有 2 张有效封面，实际 %d", len(got.Items))
	}
	if !strings.Contains(got.Message, "成功添加 2 张") || !strings.Contains(got.Message, "跳过 4 张") {
		t.Fatalf("Message 应说明成功/跳过数量，实际 %q", got.Message)
	}
	if got.Active != 1 {
		t.Fatalf("最后成功的一张应生效，active=%d", got.Active)
	}
}

func TestCoverServiceSetActiveAndRemove(t *testing.T) {
	svc, _, _ := newCoverSvcForTest(t)
	if _, err := svc.AddMany("t_song", []string{
		pngDataURL(t, color.RGBA{10, 20, 30, 255}),
		pngDataURL(t, color.RGBA{80, 120, 40, 255}),
		pngDataURL(t, color.RGBA{30, 60, 200, 255}),
	}, nil); err != nil {
		t.Fatal(err)
	}

	set, err := svc.SetActive("t_song", 0)
	if err != nil {
		t.Fatalf("切换失败: %v", err)
	}
	if set.Active != 0 || !set.Items[0].Active {
		t.Fatalf("切换后 active 不对: %+v", set)
	}
	// 越界：返回错误而不是 panic（后端要能扛住前端的过期下标）
	if _, err := svc.SetActive("t_song", 9); err == nil {
		t.Fatal("越界下标应报错")
	}

	set, err = svc.Remove("t_song", 0)
	if err != nil {
		t.Fatalf("删除失败: %v", err)
	}
	if len(set.Items) != 2 {
		t.Fatalf("删后应剩 2 张，实际 %d", len(set.Items))
	}
	// 内嵌项（负数下标）是只读的
	if _, err := svc.Remove("t_song", -1); err == nil {
		t.Fatal("内嵌项不该能删")
	}
}

// 列表要把文件里内嵌的封面也列出来（负数下标、只读标记）。
func TestCoverServiceListIncludesEmbedded(t *testing.T) {
	svc, _, songPath := newCoverSvcForTest(t)

	// 给歌曲文件写入两张内嵌封面
	covers := []metacache.CoverImage{
		{MIME: "image/png", Data: solidPNG(t, color.RGBA{11, 22, 33, 255})},
		{MIME: "image/png", Data: solidPNG(t, color.RGBA{44, 55, 66, 255})},
	}
	if _, err := metacache.EmbedCovers(songPath, covers, ""); err != nil {
		t.Fatalf("写内嵌封面失败: %v", err)
	}

	// 再加一张缓存封面
	if _, err := svc.Add("t_song", "", pngDataURL(t, color.RGBA{150, 30, 30, 255}), nil); err != nil {
		t.Fatal(err)
	}

	set, err := svc.List("t_song")
	if err != nil {
		t.Fatalf("List 失败: %v", err)
	}
	if len(set.Items) != 1 {
		t.Fatalf("缓存项应有 1 张，实际 %d", len(set.Items))
	}
	if set.Items[0].Index != 0 || set.Items[0].Embedded {
		t.Fatalf("缓存项下标应为 0 且非内嵌: %+v", set.Items[0])
	}
	if len(set.Embedded) != 2 {
		t.Fatalf("内嵌项应有 2 张，实际 %d", len(set.Embedded))
	}
	for i, e := range set.Embedded {
		if e.Index != -1-i {
			t.Fatalf("内嵌项下标应为 -1-i，实际 %d", e.Index)
		}
		if !e.Embedded || e.Provider != "embedded" {
			t.Fatalf("内嵌项标记不对: %+v", e)
		}
		if !strings.HasPrefix(e.Preview, "data:image/png;base64,") {
			t.Fatalf("内嵌项应有 data URL 预览: %.40s", e.Preview)
		}
	}
	if !set.Items[0].Active {
		t.Fatal("唯一那张缓存封面应是当前生效")
	}

	// 在线曲目 / 文件不存在时不该报错，只是没有内嵌项
	svc.songs = func(string) (bootstrap.Song, bool) { return bootstrap.Song{ID: "t_song", Path: ""}, true }
	set, err = svc.List("t_song")
	if err != nil {
		t.Fatalf("没有本地文件时 List 不该报错: %v", err)
	}
	if len(set.Embedded) != 0 {
		t.Fatalf("没有文件时不该有内嵌项: %+v", set.Embedded)
	}
}

// CachedSets / CachedPreviews：启动回填用，必须带上 items 的预览。
func TestCoverServiceCachedSets(t *testing.T) {
	svc, _, _ := newCoverSvcForTest(t)
	if _, err := svc.AddMany("t_song", []string{
		pngDataURL(t, color.RGBA{10, 20, 30, 255}),
		pngDataURL(t, color.RGBA{200, 120, 40, 255}),
	}, nil); err != nil {
		t.Fatal(err)
	}

	sets := svc.CachedSets()
	set, ok := sets["t_song"]
	if !ok {
		t.Fatalf("CachedSets 里应有 t_song: %v", sets)
	}
	if len(set.Items) != 2 || set.Active != 1 {
		t.Fatalf("回填的集合不对: %+v", set)
	}
	if len(set.Embedded) != 0 {
		t.Fatal("批量回填不该去读文件（Embedded 必须留空）")
	}
	for _, it := range set.Items {
		if !strings.HasPrefix(it.Preview, "data:") {
			t.Fatalf("回填必须带预览: %+v", it)
		}
	}
	// 旧的 CachedPreviews 仍要能用（返回当前生效那张）
	prev := svc.CachedPreviews()
	if !strings.HasPrefix(prev["t_song"], "data:") {
		t.Fatalf("CachedPreviews 应返回 data URL，实际 %.40s", prev["t_song"])
	}
	if prev["t_song"] != set.Items[1].Preview {
		t.Fatal("CachedPreviews 应返回当前生效那张")
	}
	if got := svc.Current("t_song"); got["count"].(int) != 2 || got["active"].(int) != 1 {
		t.Fatalf("Current 应带上 count/active: %+v", got)
	}
}

// cover:changed 事件的 payload 必须带上 count（前端靠它决定要不要重拉列表）。
func TestCoverServiceEmitsChangedWithCount(t *testing.T) {
	svc, _, _ := newCoverSvcForTest(t)
	type ev struct {
		name    string
		payload map[string]any
	}
	var events []ev
	svc.setEmitter(func(name string, payload any) {
		m, _ := payload.(map[string]any)
		events = append(events, ev{name: name, payload: m})
	})

	if _, err := svc.Add("t_song", "", pngDataURL(t, color.RGBA{10, 20, 30, 255}), nil); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Add("t_song", "", pngDataURL(t, color.RGBA{90, 200, 30, 255}), nil); err != nil {
		t.Fatal(err)
	}

	if len(events) != 2 {
		t.Fatalf("应发 2 次事件，实际 %d", len(events))
	}
	for i, e := range events {
		if e.name != "cover:changed" {
			t.Fatalf("事件名不对: %q", e.name)
		}
		if got := e.payload["count"].(int); got != i+1 {
			t.Fatalf("第 %d 次事件的 count 应为 %d，实际 %d", i+1, i+1, got)
		}
	}
}

// Reset 清空该歌全部缓存封面，措辞保持不变。
func TestCoverServiceReset(t *testing.T) {
	svc, cache, _ := newCoverSvcForTest(t)
	if _, err := svc.AddMany("t_song", []string{
		pngDataURL(t, color.RGBA{10, 20, 30, 255}),
		pngDataURL(t, color.RGBA{120, 20, 30, 255}),
	}, nil); err != nil {
		t.Fatal(err)
	}
	res, err := svc.Reset("t_song")
	if err != nil {
		t.Fatalf("Reset 失败: %v", err)
	}
	if res["note"] != "已恢复原始封面（写入文件的部分不会撤销）" {
		t.Fatalf("提示措辞被改了: %v", res["note"])
	}
	if got := cache.CoverCount("t_song"); got != 0 {
		t.Fatalf("Reset 后应清空，实际 %d 张", got)
	}
	set, _ := svc.List("t_song")
	if len(set.Items) != 0 {
		t.Fatalf("Reset 后列表应为空: %+v", set.Items)
	}
}

// WriteCacheToFiles：多张缓存封面要一起写进文件（顺序 = items）。
func TestWriteCacheToFilesWritesAllCovers(t *testing.T) {
	svc, _, songPath := newCoverSvcForTest(t)
	if _, err := svc.AddMany("t_song", []string{
		pngDataURL(t, color.RGBA{10, 20, 30, 255}),
		pngDataURL(t, color.RGBA{200, 120, 40, 255}),
		pngDataURL(t, color.RGBA{40, 200, 120, 255}),
	}, nil); err != nil {
		t.Fatal(err)
	}

	res, err := svc.WriteCacheToFiles()
	if err != nil {
		t.Fatalf("写回失败: %v", err)
	}
	if got := res["covers"].(int); got != 1 {
		t.Fatalf("covers 计的是「写成功的歌曲数」，应为 1，实际 %d", got)
	}

	pics := meta.ReadPictures(songPath)
	if len(pics) != 3 {
		t.Fatalf("文件里应有 3 张内嵌封面，实际 %d", len(pics))
	}
	// 顺序必须与缓存一致：拿缓存里的字节逐张比对
	cached := svc.cache.Covers("t_song")
	for i := range cached {
		want, _, ok := svc.cache.CoverBytesAt("t_song", i)
		if !ok {
			t.Fatalf("第 %d 张缓存读不出来", i)
		}
		if !bytes.Equal(pics[i].Data, want) {
			t.Fatalf("第 %d 张封面顺序/内容不一致", i)
		}
	}
}

// 新加封面时勾了「写回文件」，文件里应该立刻有全部封面。
func TestCoverServiceAddWithEmbedWritesAll(t *testing.T) {
	svc, _, songPath := newCoverSvcForTest(t)
	yes := true
	if _, err := svc.Add("t_song", "", pngDataURL(t, color.RGBA{10, 20, 30, 255}), &yes); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Add("t_song", "", pngDataURL(t, color.RGBA{30, 10, 200, 255}), &yes); err != nil {
		t.Fatal(err)
	}
	if got := len(meta.ReadPictures(songPath)); got != 2 {
		t.Fatalf("文件里应有 2 张封面，实际 %d", got)
	}

	// 不勾写回时，文件里的内容保持不变（不会被清掉）
	no := false
	if _, err := svc.Add("t_song", "", pngDataURL(t, color.RGBA{9, 200, 90, 255}), &no); err != nil {
		t.Fatal(err)
	}
	if got := len(meta.ReadPictures(songPath)); got != 2 {
		t.Fatalf("不写回时文件不该变化，实际 %d 张", got)
	}
}

// 曲库里没有这首歌时：Add / List 等要明确报错，不能静默成功。
func TestCoverServiceUnknownSong(t *testing.T) {
	svc, _, _ := newCoverSvcForTest(t)
	if _, err := svc.Add("nope", "", pngDataURL(t, color.RGBA{1, 2, 3, 255}), nil); err == nil {
		t.Fatal("Add 未知歌曲应报错")
	}
	if _, err := svc.List("nope"); err == nil {
		t.Fatal("List 未知歌曲应报错")
	}
	if _, err := svc.SetActive("nope", 0); err == nil {
		t.Fatal("SetActive 未知歌曲应报错")
	}
	if _, err := svc.Remove("nope", 0); err == nil {
		t.Fatal("Remove 未知歌曲应报错")
	}
}

// ClearCache 要把多封面的所有文件都清掉。
func TestCoverServiceClearCache(t *testing.T) {
	svc, cache, _ := newCoverSvcForTest(t)
	if _, err := svc.AddMany("t_song", []string{
		pngDataURL(t, color.RGBA{10, 20, 30, 255}),
		pngDataURL(t, color.RGBA{120, 20, 30, 255}),
	}, nil); err != nil {
		t.Fatal(err)
	}
	res, err := svc.ClearCache()
	if err != nil {
		t.Fatalf("清空缓存失败: %v", err)
	}
	if got := res["covers"].(int); got != 1 {
		t.Fatalf("清空应删掉 1 首歌的封面，实际 %d", got)
	}
	if cache.CoverCount("t_song") != 0 {
		t.Fatal("清空后不该还有封面")
	}
	entries, _ := os.ReadDir(filepath.Join(cache.Dir(), string(metacache.KindCover)))
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".png") || strings.HasSuffix(e.Name(), ".jpg") {
			t.Fatalf("缓存目录里还留着图片文件: %s", e.Name())
		}
	}
}
