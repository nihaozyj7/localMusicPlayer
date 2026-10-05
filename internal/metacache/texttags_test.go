package metacache

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/dhowden/tag"
)

/* ==========================================================================
   文本标签（标题 / 歌手 / 专辑）写回
   --------------------------------------------------------------------------
   这是「下载完成后用 AI 整理元数据」的落地点（见 ai_tags.go）：
   AI 还原出的 title / artist / album 最终就是靠这里写进用户文件的。

   三条必须守住的性质：
     1. **写得进去**：第三方解析库（扫描时用的同一个 dhowden/tag）能读回来；
     2. **不碰别的**：音频数据、已有封面/歌词一律不受影响；
     3. **空值不删**：AI 没给出某个字段时，文件里原有的同名标签必须原样保留
        —— 这一条最容易写错，而它的后果是「一次整理把用户正确的标签清空了」。
   ========================================================================== */

// readTags 打开文件并交给扫描时用的同一个解析库。
func readTags(t *testing.T, path string) tag.Metadata {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	m, err := tag.ReadFrom(f)
	if err != nil {
		t.Fatalf("重新解析失败（写进去的标签结构不合法）: %v", err)
	}
	return m
}

func TestEmbedTextTagsMP4RoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	original := buildTestM4A()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}

	tags := TextTags{Title: "真的标题", Artist: "真的歌手", Album: "真的专辑"}
	res, err := EmbedTextTags(path, tags)
	if err != nil {
		t.Fatalf("写入文本标签失败: %v", err)
	}
	if !res.OK || res.Format != "m4a" {
		t.Fatalf("结果不对: %+v", res)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// 音频数据一字未动
	if !bytes.Equal(mdatBox(t, original), mdatBox(t, after)) {
		t.Fatal("mdat（音频数据）被改动了")
	}

	m := readTags(t, path)
	if m.Title() != tags.Title {
		t.Fatalf("标题读回来不一致：%q", m.Title())
	}
	if m.Artist() != tags.Artist {
		t.Fatalf("歌手读回来不一致：%q", m.Artist())
	}
	if m.Album() != tags.Album {
		t.Fatalf("专辑读回来不一致：%q", m.Album())
	}
}

// ★ © 是单字节 0xA9。若错写成 UTF-8 的双字节 0xC2 0xA9，
// 四字节的 box 类型会变成五字节、ilst 内所有 box 的边界一起错位。
// 这里直接断言字节层：解析库对错位往往「读到点东西但不报错」，
// 只靠读回来的值可能测不出问题。
func TestEmbedTextTagsMP4UsesSingleByteCopyrightAtom(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(path, buildTestM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := EmbedTextTags(path, TextTags{Title: "标题"}); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Count(raw, []byte("\xa9nam")) != 1 {
		t.Fatalf("应恰好有一个 ©nam 原子，实际 %d 个", bytes.Count(raw, []byte("\xa9nam")))
	}
	if bytes.Contains(raw, []byte("\xc2\xa9nam")) {
		t.Fatal("© 被写成了 UTF-8 双字节（box 类型必须正好 4 字节）")
	}
	// 解析器能读出来才算真的对（错位的字节读出来是乱码）
	if got := readTags(t, path).Title(); got != "标题" {
		t.Fatalf("标题读回来不一致：%q", got)
	}
}

func TestEmbedTextTagsMP4ReplacesInsteadOfStacking(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(path, buildTestM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := EmbedTextTags(path, TextTags{Title: "第一版", Artist: "歌手A"}); err != nil {
		t.Fatal(err)
	}
	if _, err := EmbedTextTags(path, TextTags{Title: "第二版", Artist: "歌手B"}); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// 重复写入必须是替换：堆叠的话文件里会攒下一串再也删不掉的旧标题
	if bytes.Count(raw, []byte("\xa9nam")) != 1 {
		t.Fatalf("©nam 条目应该只有一个，实际 %d 个", bytes.Count(raw, []byte("\xa9nam")))
	}
	m := readTags(t, path)
	if m.Title() != "第二版" || m.Artist() != "歌手B" {
		t.Fatalf("二次写入未覆盖：%q / %q", m.Title(), m.Artist())
	}
}

// ★ 空字段的语义是「这次没有要写的内容」，不是「把文件里原来的值删掉」。
func TestEmbedTextTagsEmptyFieldsKeepExistingValues(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(path, buildTestM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := EmbedTextTags(path, TextTags{Title: "原标题", Artist: "原歌手", Album: "原专辑"}); err != nil {
		t.Fatal(err)
	}
	// 只写标题：歌手与专辑必须原样保留
	if _, err := EmbedTextTags(path, TextTags{Title: "新标题"}); err != nil {
		t.Fatal(err)
	}
	m := readTags(t, path)
	if m.Title() != "新标题" {
		t.Fatalf("标题应被更新，实际 %q", m.Title())
	}
	if m.Artist() != "原歌手" {
		t.Fatalf("空歌手不该清掉原有的歌手，实际 %q", m.Artist())
	}
	if m.Album() != "原专辑" {
		t.Fatalf("空专辑不该清掉原有的专辑，实际 %q", m.Album())
	}
}

// 写文本标签时不能碰已有的封面与歌词（一次操作只写自己要写的那几项）。
func TestEmbedTextTagsKeepsCoverAndLyricsMP4(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(path, buildTestM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	cover := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0xFF, 0xD9}
	if _, err := EmbedMeta(path, "image/jpeg", cover, testLyrics); err != nil {
		t.Fatal(err)
	}

	if _, err := EmbedTextTags(path, TextTags{Title: "标题"}); err != nil {
		t.Fatal(err)
	}
	m := readTags(t, path)
	pic := m.Picture()
	if pic == nil || !bytes.Equal(pic.Data, cover) {
		t.Fatal("写文本标签时把封面弄丢了")
	}
	if got := m.Lyrics(); got != testLyrics {
		t.Fatalf("写文本标签时把歌词弄丢了：%q", got)
	}
}

func TestEmbedTextTagsFLACRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.flac")
	original := buildTestFLAC()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}

	tags := TextTags{Title: "真的标题", Artist: "真的歌手", Album: "真的专辑"}
	res, err := EmbedTextTags(path, tags)
	if err != nil {
		t.Fatalf("写入 FLAC 文本标签失败: %v", err)
	}
	if !res.OK || res.Format != "flac" {
		t.Fatalf("结果不对: %+v", res)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// 音频帧必须一字未动
	if !bytes.HasSuffix(raw, original[len(original)-6:]) {
		t.Fatal("FLAC 音频帧被改动了")
	}
	comments, ok := readFirstVorbisComment(t, raw)
	if !ok {
		t.Fatal("找不到 VORBIS_COMMENT 块")
	}
	if got := lookupVorbis(comments, "TITLE"); got != tags.Title {
		t.Fatalf("TITLE 读回来不一致：%q", got)
	}
	if got := lookupVorbis(comments, "ARTIST"); got != tags.Artist {
		t.Fatalf("ARTIST 读回来不一致：%q", got)
	}
	if got := lookupVorbis(comments, "ALBUM"); got != tags.Album {
		t.Fatalf("ALBUM 读回来不一致：%q", got)
	}
}

// FLAC 的空字段同样不能覆盖原有的同名注释。
func TestEmbedTextTagsFLACEmptyFieldsKeepExisting(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.flac")
	if err := os.WriteFile(path, buildTestFLAC(), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := EmbedTextTags(path, TextTags{Title: "原标题", Artist: "原歌手"}); err != nil {
		t.Fatal(err)
	}
	// Title 传空 = 不动它；Artist 有值 = 覆盖
	if _, err := EmbedTextTags(path, TextTags{Artist: "新歌手"}); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	comments, _ := readFirstVorbisComment(t, raw)
	if got := lookupVorbis(comments, "TITLE"); got != "原标题" {
		t.Fatalf("空标题不该清掉原有的 TITLE，实际 %q", got)
	}
	if got := lookupVorbis(comments, "ARTIST"); got != "新歌手" {
		t.Fatalf("ARTIST 应被更新，实际 %q", got)
	}
	// 覆盖而不是堆叠
	count := 0
	for _, kv := range comments {
		if kv[0] == "ARTIST" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("ARTIST 字段应该只有一个，实际 %d 个", count)
	}
}

// 三种内容可以一次写完（下载后整理时封面/歌词/标签可能同时要写）。
func TestEmbedTagsWritesEverythingAtOnce(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(path, buildTestM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	cover := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0xFF, 0xD9}
	res, err := EmbedTags(path, []CoverImage{{MIME: "image/jpeg", Data: cover}}, testLyrics, TextTags{
		Title: "标题", Artist: "歌手",
	})
	if err != nil {
		t.Fatalf("一次写入全部内容失败: %v", err)
	}
	if !res.OK {
		t.Fatalf("结果应标记成功: %+v", res)
	}
	m := readTags(t, path)
	if pic := m.Picture(); pic == nil || !bytes.Equal(pic.Data, cover) {
		t.Fatal("封面没写对")
	}
	if got := m.Lyrics(); got != testLyrics {
		t.Fatalf("歌词没写对：%q", got)
	}
	if m.Title() != "标题" || m.Artist() != "歌手" {
		t.Fatalf("文本标签没写对：%q / %q", m.Title(), m.Artist())
	}
}

// 什么都没有时应当报错，而不是白读白写一遍文件。
func TestEmbedTagsRejectsEmpty(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(path, buildTestM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := EmbedTags(path, nil, "  ", TextTags{}); err == nil {
		t.Fatal("没有任何要写入的内容时应报错")
	}
}

// 不支持的格式（mp3 / wav…）必须明确拒绝，绝不硬写。
func TestEmbedTextTagsUnsupportedFormat(t *testing.T) {
	dir := t.TempDir()
	for _, ext := range []string{".mp3", ".wav", ".ogg"} {
		path := filepath.Join(dir, "song"+ext)
		if err := os.WriteFile(path, []byte("not really audio"), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := EmbedTextTags(path, TextTags{Title: "标题"}); err == nil {
			t.Fatalf("%s 不支持写标签，应当报错", ext)
		}
		if SupportedEmbed(ext) {
			t.Fatalf("SupportedEmbed(%s) 应为 false", ext)
		}
	}
}
