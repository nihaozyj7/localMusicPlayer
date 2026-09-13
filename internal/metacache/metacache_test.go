package metacache

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"

	"github.com/dhowden/tag"
)

/* --------------------------------------------------------------------------
   构造一个最小但结构正确的 m4a 文件
   -------------------------------------------------------------------------- */

func be32b(v uint32) []byte {
	b := make([]byte, 4)
	binary.BigEndian.PutUint32(b, v)
	return b
}

func mkBox(kind string, payload []byte) []byte {
	out := append([]byte{}, be32b(uint32(len(payload)+8))...)
	out = append(out, []byte(kind)...)
	return append(out, payload...)
}

// mdatBox 取出顶层 mdat 的完整字节，用来断言音频数据没被动过。
func mdatBox(t *testing.T, raw []byte) []byte {
	t.Helper()
	start, end, ok := findTopLevelBox(raw, "mdat")
	if !ok {
		t.Fatal("找不到 mdat")
	}
	return raw[start:end]
}

// buildTestM4A 造一个 ftyp + moov(mvhd) + mdat 的最小 m4a。
func buildTestM4A() []byte {
	// mvhd：版本 0 + 标志 3 字节 + 创建/修改时间 + 时间刻度 + 时长
	mvhd := make([]byte, 100)
	mvhd[0] = 0
	binary.BigEndian.PutUint32(mvhd[12:16], 44100) // timescale
	binary.BigEndian.PutUint32(mvhd[16:20], 44100) // duration = 1s
	moov := mkBox("moov", mkBox("mvhd", mvhd))

	ftyp := mkBox("ftyp", append([]byte("M4A "), be32b(0)...))
	mdat := mkBox("mdat", make([]byte, 2048))

	out := append([]byte{}, ftyp...)
	out = append(out, moov...)
	out = append(out, mdat...)
	return out
}

func TestEmbedCoverMP4RoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	original := buildTestM4A()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}

	// 造一张最小的 JPEG（SOI + APP0 + EOI 就足够被当成图片数据）
	cover := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x00, 0xFF, 0xD9}

	res, err := EmbedCover(path, "image/jpeg", cover)
	if err != nil {
		t.Fatalf("写入封面失败: %v", err)
	}
	if !res.OK {
		t.Fatalf("结果应标记成功: %+v", res)
	}
	if res.Format != "m4a" {
		t.Fatalf("格式应为 m4a，实际 %s", res.Format)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(after) <= len(original) {
		t.Fatalf("文件应变大：%d → %d", len(original), len(after))
	}
	// 音频数据必须一字未动
	origMdat := mdatBox(t, original)
	newMdat := mdatBox(t, after)
	if !bytes.Equal(origMdat, newMdat) {
		t.Fatal("mdat（音频数据）被改动了")
	}
	// 原有标签必须保留（我们只是往里插了一个 covr）
	if !bytes.Contains(after, []byte("mvhd")) {
		t.Fatal("原有的 mvhd 丢失了")
	}

	// 关键验证：用第三方解析库（扫描时用的同一个）能否读出封面
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	m, err := tag.ReadFrom(f)
	if err != nil {
		t.Fatalf("重新解析失败（说明写进去的标签结构不合法）: %v", err)
	}
	pic := m.Picture()
	if pic == nil {
		t.Fatal("解析不到封面")
	}
	if !bytes.Equal(pic.Data, cover) {
		t.Fatalf("封面数据不一致：%d vs %d 字节", len(pic.Data), len(cover))
	}
	if pic.MIMEType != "image/jpeg" {
		t.Fatalf("封面类型应识别为 image/jpeg，实际 %q", pic.MIMEType)
	}
}

// 重复写入不应该无限追加（同名覆盖语义）
func TestEmbedCoverMP4Idempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(path, buildTestM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	coverA := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 1, 2, 3, 0xFF, 0xD9}
	coverB := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 9, 8, 7, 0xFF, 0xD9}

	if _, err := EmbedCover(path, "image/jpeg", coverA); err != nil {
		t.Fatal(err)
	}
	if _, err := EmbedCover(path, "image/jpeg", coverB); err != nil {
		t.Fatal(err)
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	m, err := tag.ReadFrom(f)
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	pic := m.Picture()
	if pic == nil || !bytes.Equal(pic.Data, coverB) {
		t.Fatal("最后一次写入的封面应生效")
	}
}

func TestEmbedCoverUnsupported(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.mp3")
	if err := os.WriteFile(path, []byte("ID3\x03\x00\x00\x00\x00\x00\x00"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := EmbedCover(path, "image/jpeg", []byte{0xFF, 0xD8, 0xFF, 0xD9})
	if err != ErrUnsupported {
		t.Fatalf("mp3 应返回 ErrUnsupported，实际 %v", err)
	}
	if SupportedEmbed("mp3") {
		t.Fatal("SupportedEmbed(mp3) 应为 false")
	}
	if !SupportedEmbed("m4a") || !SupportedEmbed("flac") {
		t.Fatal("m4a / flac 应被支持")
	}
}

/* --------------------------------------------------------------------------
   FLAC
   -------------------------------------------------------------------------- */

func buildTestFLAC() []byte {
	// fLaC + STREAMINFO(34 字节, 最后一块) + 音频帧（随便几个字节）
	body := make([]byte, 34)
	header := []byte{0x80 | flacBlockStreamInfo, 0, 0, 34}
	out := append([]byte("fLaC"), header...)
	out = append(out, body...)
	return append(out, 0xFF, 0xF8, 0x69, 0x00, 0x11, 0x22)
}

func TestEmbedCoverFLACRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.flac")
	original := buildTestFLAC()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}
	cover := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0xFF, 0xD9}

	res, err := EmbedCover(path, "image/jpeg", cover)
	if err != nil {
		t.Fatalf("写入 FLAC 封面失败: %v", err)
	}
	if !res.OK || res.Format != "flac" {
		t.Fatalf("结果不对: %+v", res)
	}

	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	m, err := tag.ReadFrom(f)
	if err != nil {
		t.Fatalf("重新解析 FLAC 失败: %v", err)
	}
	pic := m.Picture()
	if pic == nil {
		t.Fatal("解析不到 FLAC 封面")
	}
	if !bytes.Equal(pic.Data, cover) {
		t.Fatal("FLAC 封面数据不一致")
	}
}

/* --------------------------------------------------------------------------
   歌词：m4a 的 ©lyr 与 flac 的 LYRICS 字段
   -------------------------------------------------------------------------- */

const testLyrics = "[00:01.00]第一行\n[00:05.50]第二行"

func TestEmbedLyricsMP4(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	original := buildTestM4A()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := EmbedLyrics(path, testLyrics); err != nil {
		t.Fatalf("写入歌词失败: %v", err)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// 音频数据一字未动
	if !bytes.Equal(mdatBox(t, original), mdatBox(t, after)) {
		t.Fatal("mdat（音频数据）被改动了")
	}
	// 第三方解析器能读出歌词（扫描时用的同一个库）
	readTags := func(p string) tag.Metadata {
		f, err := os.Open(p)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		m, err := tag.ReadFrom(f)
		if err != nil {
			t.Fatalf("重新解析失败: %v", err)
		}
		return m
	}
	if got := readTags(path).Lyrics(); got != testLyrics {
		t.Fatalf("歌词读回来不一致：%q", got)
	}

	// 再写一遍不应该堆叠（同名条目必须被替换）
	if _, err := EmbedLyrics(path, testLyrics); err != nil {
		t.Fatal(err)
	}
	again, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Count(again, []byte("\xa9lyr")) != 1 {
		t.Fatalf("©lyr 条目应该只有一个，实际 %d 个", bytes.Count(again, []byte("\xa9lyr")))
	}
	if got := readTags(path).Lyrics(); got != testLyrics {
		t.Fatalf("二次写入后歌词读回来不一致：%q", got)
	}
}

func TestEmbedMetaKeepsCoverAndLyricsTogether(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(path, buildTestM4A(), 0o644); err != nil {
		t.Fatal(err)
	}
	cover := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0xFF, 0xD9}

	res, err := EmbedMeta(path, "image/jpeg", cover, testLyrics)
	if err != nil {
		t.Fatalf("一次写入封面+歌词失败: %v", err)
	}
	if !res.OK {
		t.Fatalf("结果应标记成功: %+v", res)
	}

	readTags := func(p string) tag.Metadata {
		f, err := os.Open(p)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		m, err := tag.ReadFrom(f)
		if err != nil {
			t.Fatalf("重新解析失败: %v", err)
		}
		return m
	}
	m := readTags(path)
	pic := m.Picture()
	if pic == nil || !bytes.Equal(pic.Data, cover) {
		t.Fatal("封面没写对")
	}
	if got := m.Lyrics(); got != testLyrics {
		t.Fatalf("歌词没写对：%q", got)
	}

	// 只写封面（lyrics 为空）时，已有的歌词必须原样保留
	if _, err := EmbedMeta(path, "image/jpeg", cover, ""); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Count(after, []byte("\xa9lyr")) != 1 {
		t.Fatal("只写封面时不该丢掉已有的歌词")
	}
	if got := readTags(path).Lyrics(); got != testLyrics {
		t.Fatalf("只写封面后歌词变了：%q", got)
	}
}

func TestEmbedLyricsFLAC(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.flac")
	original := buildTestFLAC()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := EmbedLyrics(path, testLyrics); err != nil {
		t.Fatalf("写入 FLAC 歌词失败: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// 音频帧（STREAMINFO 之后的部分）必须一字未动
	if !bytes.HasSuffix(raw, original[len(original)-6:]) {
		t.Fatal("FLAC 音频帧被改动了")
	}
	// 自己解析回来（不依赖第三方库对 FLAC LYRICS 的支持）
	comments, ok := readFirstVorbisComment(t, raw)
	if !ok {
		t.Fatal("找不到 VORBIS_COMMENT 块")
	}
	if got := lookupVorbis(comments, "LYRICS"); got != testLyrics {
		t.Fatalf("LYRICS 字段读回来不一致：%q", got)
	}

	// 重复写入要覆盖而不是堆叠
	if _, err := EmbedLyrics(path, "新的歌词"); err != nil {
		t.Fatal(err)
	}
	raw2, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	comments2, _ := readFirstVorbisComment(t, raw2)
	if got := lookupVorbis(comments2, "LYRICS"); got != "新的歌词" {
		t.Fatalf("重复写入应覆盖而不是堆叠，实际 %q", got)
	}
	count := 0
	for _, kv := range comments2 {
		if kv[0] == "LYRICS" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("LYRICS 字段应该只有一个，实际 %d 个", count)
	}
}

// readFirstVorbisComment 从 FLAC 字节里取出第一个 VORBIS_COMMENT 块的字段。
func readFirstVorbisComment(t *testing.T, raw []byte) ([][2]string, bool) {
	t.Helper()
	if len(raw) < 4 || string(raw[0:4]) != "fLaC" {
		t.Fatal("不是 FLAC")
	}
	for off := 4; off+4 <= len(raw); {
		last := raw[off]&0x80 != 0
		kind := raw[off] & 0x7F
		length := int(raw[off+1])<<16 | int(raw[off+2])<<8 | int(raw[off+3])
		off += 4
		if off+length > len(raw) {
			t.Fatal("metadata 越界")
		}
		if kind == flacBlockVorbisComment {
			return parseVorbisComment(raw[off : off+length]), true
		}
		off += length
		if last {
			break
		}
	}
	return nil, false
}

func lookupVorbis(comments [][2]string, key string) string {
	for _, kv := range comments {
		if kv[0] == key {
			return kv[1]
		}
	}
	return ""
}

/* --------------------------------------------------------------------------
   Store：缓存读写与索引
   -------------------------------------------------------------------------- */

func TestStoreCoverAndLyrics(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	cover := []byte{0xFF, 0xD8, 0xFF, 0xD9}

	path, err := s.SaveCover("t_abc", "image/jpeg", cover, "user")
	if err != nil {
		t.Fatalf("保存封面失败: %v", err)
	}
	if path == "" {
		t.Fatal("应返回缓存路径")
	}
	if got, ok := s.CoverPath("t_abc"); !ok || got != path {
		t.Fatalf("CoverPath 不一致: %q vs %q", got, path)
	}
	if url, ok := s.CoverDataURL("t_abc"); !ok || url[:15] != "data:image/jpeg" {
		t.Fatalf("CoverDataURL 不对: %q", url)
	}
	if s.CoverSource("t_abc") != "user" {
		t.Fatal("来源应为 user")
	}

	if _, err := s.SaveLyrics("t_abc", "[00:01.00]hello", "online:lrclib"); err != nil {
		t.Fatalf("保存歌词失败: %v", err)
	}
	text, ok := s.Lyrics("t_abc")
	if !ok || text != "[00:01.00]hello" {
		t.Fatalf("歌词读回不一致: %q", text)
	}

	// 重新打开（模拟重启）：索引必须能读回来
	s2 := NewStore(dir)
	if _, ok := s2.CoverPath("t_abc"); !ok {
		t.Fatal("重启后封面索引丢失")
	}
	if _, ok := s2.LyricsPath("t_abc"); !ok {
		t.Fatal("重启后歌词索引丢失")
	}

	// 统计
	stats := s2.Stats()
	if stats["covers"].(int) != 1 || stats["lyrics"].(int) != 1 {
		t.Fatalf("统计不对: %+v", stats)
	}
	if stats["bytes"].(int64) <= 0 {
		t.Fatal("缓存占用应大于 0")
	}

	// 删除封面
	if err := s2.DeleteCover("t_abc"); err != nil {
		t.Fatalf("删除封面失败: %v", err)
	}
	if _, ok := s2.CoverPath("t_abc"); ok {
		t.Fatal("删除后不应还能读到封面")
	}
	s3 := NewStore(dir)
	if _, ok := s3.CoverPath("t_abc"); ok {
		t.Fatal("删除后重启不应复活")
	}
}

func TestStoreRejectsEmptyAndOversized(t *testing.T) {
	s := NewStore(t.TempDir())
	if _, err := s.SaveCover("", "image/jpeg", []byte{1}, "user"); err == nil {
		t.Fatal("空 id 应报错")
	}
	if _, err := s.SaveCover("x", "image/jpeg", nil, "user"); err == nil {
		t.Fatal("空数据应报错")
	}
	big := make([]byte, maxCoverBytes+1)
	if _, err := s.SaveCover("x", "image/jpeg", big, "user"); err == nil {
		t.Fatal("超大封面应报错")
	}
	if _, err := s.SaveLyrics("x", "   ", "online"); err == nil {
		t.Fatal("空歌词应报错")
	}
}

func TestExtForMIME(t *testing.T) {
	cases := map[string]string{
		"image/jpeg": ".jpg",
		"image/png":  ".png",
		"image/webp": ".webp",
		"":           ".jpg",
		"IMAGE/PNG":  ".png",
	}
	for in, want := range cases {
		if got := extForMIME(in); got != want {
			t.Errorf("extForMIME(%q) = %q，期望 %q", in, got, want)
		}
	}
}
