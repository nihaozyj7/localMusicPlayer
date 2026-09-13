package metacache

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

/* --------------------------------------------------------------------------
   多封面存储（v2）
   --------------------------------------------------------------------------
   这些测试盯的是三件容易出错的事：
     1. 追加语义 —— 每次添加都是「新增一张并设为当前生效」，不是覆盖；
     2. 去重 —— 同一份内容重复添加只占一个文件、索引里也只有一项；
     3. v1 兼容 —— 老索引（扁平 {file,mime,source,at}）必须能读出来，
        而新写的索引里 v1 字段必须指向「当前生效那张」，旧代码读到的不该是空。
   -------------------------------------------------------------------------- */

// testCoverBytes 造一张内容可区分、且长度 >64 字节的假封面。
//
// 为什么不用 buildTestM4A 那种几字节的迷你图：ReadPictures 的单张下限虽然只有
// 65 字节，但 coverfetch.InspectImage 之类的地方对过小的图是直接拒绝的，
// 用一段够长的字节更接近真实场景（字节内容是假的没关系，缓存只搬运不解码）。
func testCoverBytes(seed byte) []byte {
	out := make([]byte, 256)
	for i := range out {
		out[i] = seed + byte(i%7)
	}
	copy(out, []byte{0xFF, 0xD8, 0xFF, 0xE0})
	return out
}

func TestStoreMultiCoverAdd(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)

	a := testCoverBytes(1)
	b := testCoverBytes(60)
	c := testCoverBytes(120)

	first, err := s.AddCover("song1", "image/jpeg", a, "user", 500, 500)
	if err != nil {
		t.Fatalf("添加第一张失败: %v", err)
	}
	if first.Width != 500 || first.Height != 500 {
		t.Fatalf("尺寸没记下来: %+v", first)
	}
	if first.Hash == "" || len(first.Hash) < coverHashLen {
		t.Fatalf("应记录内容 hash: %+v", first)
	}
	if !strings.HasSuffix(first.File, "-"+first.Hash[:coverHashLen]+".jpg") {
		t.Fatalf("文件名应为 <safeID>-<hash8><ext>，实际 %q", first.File)
	}

	if _, err := s.AddCover("song1", "image/jpeg", b, "user", 0, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddCover("song1", "image/jpeg", c, "user", 0, 0); err != nil {
		t.Fatal(err)
	}

	items := s.Covers("song1")
	if len(items) != 3 {
		t.Fatalf("应有 3 张封面，实际 %d", len(items))
	}
	// 顺序 = 写入顺序
	if items[0].File != first.File {
		t.Fatal("items 顺序应为写入顺序")
	}
	if got := s.ActiveCover("song1"); got != 2 {
		t.Fatalf("最后添加的应成为当前生效，active=%d", got)
	}
	// 「当前生效」那套接口读到的必须就是第三张
	path, ok := s.CoverPath("song1")
	if !ok || filepath.Base(path) != items[2].File {
		t.Fatalf("CoverPath 应指向当前生效那张: %q", path)
	}
	urls := s.CoverDataURLs("song1")
	if len(urls) != 3 {
		t.Fatalf("CoverDataURLs 应有 3 项，实际 %d", len(urls))
	}

	// 重启后（新 Store 实例）索引必须完整读回来
	s2 := NewStore(dir)
	items2 := s2.Covers("song1")
	if len(items2) != 3 {
		t.Fatalf("重启后应有 3 张，实际 %d", len(items2))
	}
	if s2.ActiveCover("song1") != 2 {
		t.Fatalf("重启后 active 应保持 2，实际 %d", s2.ActiveCover("song1"))
	}
}

// 同一份内容重复添加：不重复写文件、不重复追加，但要把它切回当前生效。
func TestStoreMultiCoverDedup(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	a := testCoverBytes(1)
	b := testCoverBytes(60)

	first, err := s.AddCover("song1", "image/jpeg", a, "user", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddCover("song1", "image/jpeg", b, "user", 0, 0); err != nil {
		t.Fatal(err)
	}
	// 再把 a 加一遍
	dup, err := s.AddCover("song1", "image/jpeg", a, "user", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if dup.File != first.File {
		t.Fatalf("同一份内容应复用已有项: %q vs %q", dup.File, first.File)
	}
	if got := len(s.Covers("song1")); got != 2 {
		t.Fatalf("不应重复追加，实际 %d 项", got)
	}
	if got := s.ActiveCover("song1"); got != 0 {
		t.Fatalf("复用的项应被设为当前生效，active=%d", got)
	}
	// 缓存目录里也该只有两个文件（没有多出一份 a 的副本）
	entries, err := os.ReadDir(filepath.Join(dir, string(KindCover)))
	if err != nil {
		t.Fatal(err)
	}
	files := 0
	for _, e := range entries {
		if !e.IsDir() {
			files++
		}
	}
	if files != 3 { // 2 张封面 + index.json
		t.Fatalf("covers 目录下应有 2 张图 + index.json，实际 %d 个文件", files)
	}
}

func TestStoreSetActiveAndCarousel(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	for i := 0; i < 3; i++ {
		if _, err := s.AddCover("s", "image/png", testCoverBytes(byte(i*40)), "user", 0, 0); err != nil {
			t.Fatal(err)
		}
	}

	if err := s.SetActiveCover("s", 1); err != nil {
		t.Fatalf("切换失败: %v", err)
	}
	if s.ActiveCover("s") != 1 {
		t.Fatal("active 应为 1")
	}
	if err := s.SetActiveCover("s", 99); err == nil {
		t.Fatal("越界下标应报错")
	}

	// 重启后当前生效下标要在（轮播开关是全局配置，不存在索引里）
	s2 := NewStore(dir)
	if s2.ActiveCover("s") != 1 {
		t.Fatalf("重启后状态丢失: active=%d", s2.ActiveCover("s"))
	}
}

func TestStoreRemoveCover(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	var files []string
	for i := 0; i < 3; i++ {
		item, err := s.AddCover("s", "image/jpeg", testCoverBytes(byte(i*40)), "user", 0, 0)
		if err != nil {
			t.Fatal(err)
		}
		files = append(files, item.File)
	}
	// active = 2
	if err := s.RemoveCover("s", 0); err != nil {
		t.Fatalf("删除失败: %v", err)
	}
	items := s.Covers("s")
	if len(items) != 2 {
		t.Fatalf("应剩 2 张，实际 %d", len(items))
	}
	// 删掉的下标在当前生效项之前 → active 要前移一位（原来的第 2 张现在是第 1 张）
	if got := s.ActiveCover("s"); got != 1 {
		t.Fatalf("active 应修正为 1，实际 %d", got)
	}
	if _, err := os.Stat(filepath.Join(dir, string(KindCover), files[0])); !os.IsNotExist(err) {
		t.Fatal("被删的那张文件应该从磁盘上消失")
	}

	// 删掉当前生效项：顺延到后一张
	if err := s.RemoveCover("s", 1); err != nil {
		t.Fatal(err)
	}
	if got := s.ActiveCover("s"); got != 0 {
		t.Fatalf("删掉生效项后 active 应退到 0，实际 %d", got)
	}

	// 删唯一一张 = 清空
	if err := s.RemoveCover("s", 0); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.CoverPath("s"); ok {
		t.Fatal("删光后不该还能读到封面")
	}
	if got := s.CoverCount("s"); got != 0 {
		t.Fatalf("删光后数量应为 0，实际 %d", got)
	}
	s2 := NewStore(dir)
	if _, ok := s2.CoverPath("s"); ok {
		t.Fatal("删光后重启不该复活")
	}
}

// v1 索引（扁平结构）必须能被读出来，并在写回时同步出 v1 字段。
func TestStoreMigratesV1Index(t *testing.T) {
	dir := t.TempDir()
	coverDir := filepath.Join(dir, string(KindCover))
	if err := os.MkdirAll(coverDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// 老命名：<safeID><ext>，没有 hash 段
	legacy := "oldsong.jpg"
	if err := os.WriteFile(filepath.Join(coverDir, legacy), testCoverBytes(7), 0o644); err != nil {
		t.Fatal(err)
	}
	index := map[string]any{
		"version": 1,
		"entries": map[string]any{
			"oldsong": map[string]any{
				"file": legacy, "mime": "image/jpeg", "source": "itunes", "at": 1700000000000,
			},
		},
	}
	raw, _ := json.MarshalIndent(index, "", "  ")
	if err := os.WriteFile(filepath.Join(coverDir, "index.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	s := NewStore(dir)
	items := s.Covers("oldsong")
	if len(items) != 1 {
		t.Fatalf("v1 记录应迁移成 1 项，实际 %d", len(items))
	}
	if items[0].File != legacy || items[0].MIME != "image/jpeg" || items[0].Source != "itunes" {
		t.Fatalf("迁移后的项不对: %+v", items[0])
	}
	if s.ActiveCover("oldsong") != 0 {
		t.Fatal("迁移后的 active 应为 0")
	}
	// 老文件必须原样还能读（不能因为迁移就找不到封面了）
	if _, ok := s.CoverPath("oldsong"); !ok {
		t.Fatal("v1 封面文件读不到")
	}
	if s.CoverSource("oldsong") != "itunes" {
		t.Fatalf("来源应为 itunes，实际 %q", s.CoverSource("oldsong"))
	}
	// Stats 的 covers 语义是「有封面的歌曲数」
	if got := s.Stats()["covers"].(int); got != 1 {
		t.Fatalf("covers 统计应为 1，实际 %d", got)
	}

	// 再加一张：老项保留在新项之前，且新写的索引里 v1 字段 = 当前生效那张
	added, err := s.AddCover("oldsong", "image/png", testCoverBytes(90), "user", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	items = s.Covers("oldsong")
	if len(items) != 2 || items[0].File != legacy {
		t.Fatalf("老项应保留在数组里: %+v", items)
	}

	rawIndex, err := os.ReadFile(filepath.Join(coverDir, "index.json"))
	if err != nil {
		t.Fatal(err)
	}
	var payload struct {
		Version int                   `json:"version"`
		Entries map[string]CoverEntry `json:"entries"`
	}
	if err := json.Unmarshal(rawIndex, &payload); err != nil {
		t.Fatalf("新索引不是合法 JSON: %v", err)
	}
	entry := payload.Entries["oldsong"]
	if payload.Version != 2 {
		t.Fatalf("索引版本应为 2，实际 %d", payload.Version)
	}
	// v1 字段必须同步成「当前生效那张」= 新加的那张
	if entry.File != added.File || entry.MIME != "image/png" {
		t.Fatalf("v1 兼容字段没同步成当前生效项: %+v", entry)
	}
	if len(entry.Items) != 2 || entry.Active != 1 {
		t.Fatalf("v2 字段不对: %+v", entry)
	}
}

// 越界的 active 要夹到合法范围（手改索引 / 异常写入都会出现）。
func TestStoreClampsActive(t *testing.T) {
	dir := t.TempDir()
	coverDir := filepath.Join(dir, string(KindCover))
	if err := os.MkdirAll(coverDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, n := range []string{"a.jpg", "b.jpg"} {
		if err := os.WriteFile(filepath.Join(coverDir, n), testCoverBytes(3), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	index := map[string]any{
		"version": 2,
		"entries": map[string]any{
			"s": map[string]any{
				"items": []map[string]any{
					{"file": "a.jpg", "mime": "image/jpeg", "at": 1},
					{"file": "b.jpg", "mime": "image/jpeg", "at": 2},
				},
				"active": 7,
			},
		},
	}
	raw, _ := json.Marshal(index)
	if err := os.WriteFile(filepath.Join(coverDir, "index.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	s := NewStore(dir)
	if got := s.ActiveCover("s"); got != 1 {
		t.Fatalf("越界 active 应夹到 1，实际 %d", got)
	}
	if path, ok := s.CoverPath("s"); !ok || filepath.Base(path) != "b.jpg" {
		t.Fatalf("夹取后应取最后一张: %q", path)
	}
}

// 数量上限：异常调用方（循环追加）不该把索引撑爆。
func TestStoreCoverCountLimit(t *testing.T) {
	s := NewStore(t.TempDir())
	for i := 0; i < maxCoverCount; i++ {
		if _, err := s.AddCover("s", "image/jpeg", testCoverBytes(byte(i)), "user", 0, 0); err != nil {
			t.Fatalf("第 %d 张添加失败: %v", i, err)
		}
	}
	if _, err := s.AddCover("s", "image/jpeg", testCoverBytes(200), "user", 0, 0); err == nil {
		t.Fatalf("超过 %d 张应被拒绝", maxCoverCount)
	}
}

// ClearCache 依赖的 DeleteCover 语义：清空全部并删掉所有文件。
func TestStoreDeleteCoverRemovesAllFiles(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	var files []string
	for i := 0; i < 3; i++ {
		item, err := s.AddCover("s", "image/jpeg", testCoverBytes(byte(i*30)), "user", 0, 0)
		if err != nil {
			t.Fatal(err)
		}
		files = append(files, item.File)
	}
	if err := s.DeleteCover("s"); err != nil {
		t.Fatalf("清空失败: %v", err)
	}
	for _, f := range files {
		if _, err := os.Stat(filepath.Join(dir, string(KindCover), f)); !os.IsNotExist(err) {
			t.Fatalf("文件 %q 应被删掉", f)
		}
	}
	if len(s.CoverIDs()) != 0 {
		t.Fatalf("清空后不该还有 id: %v", s.CoverIDs())
	}
}
