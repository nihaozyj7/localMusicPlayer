package metacache

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dhowden/tag"
)

/* --------------------------------------------------------------------------
   多封面写回（EmbedCovers）
   --------------------------------------------------------------------------
   这里只测「写」这一侧：多张封面真的都进了文件、替换而不是堆叠、
   音频数据一字未动。读回来由 internal/meta 的 ReadPictures 测试覆盖
   （那边同样用这里的 EmbedCovers 生成样本文件，两边是对称的）。
   -------------------------------------------------------------------------- */

func TestEmbedCoversMP4(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	original := buildTestM4A()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}

	coverA := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'A', 'A', 0xFF, 0xD9}
	coverB := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'B', 'B', 0xFF, 0xD9}
	covers := []CoverImage{
		{MIME: "image/jpeg", Data: coverA},
		{MIME: "image/jpeg", Data: coverB},
	}

	res, err := EmbedCovers(path, covers, testLyrics)
	if err != nil {
		t.Fatalf("写入多封面失败: %v", err)
	}
	if !res.OK || res.Format != "m4a" {
		t.Fatalf("结果不对: %+v", res)
	}
	// 说明里要能看出写了几张（只报总字节数用户看不懂）
	if !strings.Contains(res.Message, "2 张封面") {
		t.Fatalf("说明里应提到张数: %q", res.Message)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// 音频数据一字未动
	if !bytes.Equal(mdatBox(t, original), mdatBox(t, after)) {
		t.Fatal("mdat（音频数据）被改动了")
	}
	// 两个 covr box（每张一个）
	if got := bytes.Count(after, []byte("covr")); got != 2 {
		t.Fatalf("应有 2 个 covr，实际 %d", got)
	}
	if got := bytes.Count(after, []byte("\xa9lyr")); got != 1 {
		t.Fatalf("©lyr 应只有一个，实际 %d", got)
	}
	// 第三方解析器仍要能解析（写坏了结构它会直接报错）
	readTags := func(p string) tag.Metadata {
		f, err := os.Open(p)
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
	m := readTags(path)
	if m.Picture() == nil {
		t.Fatal("解析不到封面")
	}
	if got := m.Lyrics(); got != testLyrics {
		t.Fatalf("歌词不一致：%q", got)
	}

	// 再写一次：旧的 covr 必须被替换（不能攒成 4 个）
	if _, err := EmbedCovers(path, covers, testLyrics); err != nil {
		t.Fatal(err)
	}
	again, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := bytes.Count(again, []byte("covr")); got != 2 {
		t.Fatalf("重复写入应替换而不是堆叠，实际 %d 个 covr", got)
	}

	// 只写一张：应把之前的两张一起换掉
	if _, err := EmbedCovers(path, covers[:1], ""); err != nil {
		t.Fatal(err)
	}
	single, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := bytes.Count(single, []byte("covr")); got != 1 {
		t.Fatalf("应只剩 1 个 covr，实际 %d", got)
	}
	// lyrics 传空 = 「这次没歌词要写」，已有的不能丢
	if got := bytes.Count(single, []byte("\xa9lyr")); got != 1 {
		t.Fatal("只写封面时不该丢掉已有的歌词")
	}
}

func TestEmbedCoversFLAC(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "song.flac")
	original := buildTestFLAC()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}

	coverA := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'A', 'A', 0xFF, 0xD9}
	coverB := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'B', 'B', 0xFF, 0xD9}
	coverC := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'C', 'C', 0xFF, 0xD9}
	covers := []CoverImage{
		{MIME: "image/jpeg", Data: coverA},
		{MIME: "image/png", Data: coverB},
		{MIME: "image/jpeg", Data: coverC},
	}

	res, err := EmbedCovers(path, covers, testLyrics)
	if err != nil {
		t.Fatalf("写入 FLAC 多封面失败: %v", err)
	}
	if !res.OK || res.Format != "flac" {
		t.Fatalf("结果不对: %+v", res)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// 音频帧必须原样保留在文件末尾
	if !bytes.HasSuffix(raw, original[len(original)-6:]) {
		t.Fatal("FLAC 音频帧被改动了")
	}
	// 三张封面 = 三个独立的 PICTURE block
	if got := countFLACBlocks(t, raw, flacBlockPicture); got != 3 {
		t.Fatalf("应有 3 个 PICTURE block，实际 %d", got)
	}
	for i, want := range []string{"image/jpeg", "image/png", "image/jpeg"} {
		mime, data, ok := readFLACPictureAt(t, raw, i)
		if !ok {
			t.Fatalf("第 %d 个 PICTURE 读不出来", i)
		}
		if mime != want {
			t.Fatalf("第 %d 个 PICTURE 的 MIME 应为 %q，实际 %q", i, want, mime)
		}
		if !bytes.Equal(data, covers[i].Data) {
			t.Fatalf("第 %d 个 PICTURE 的图片数据不一致", i)
		}
	}
	// 歌词照旧走 VORBIS_COMMENT
	comments, ok := readFirstVorbisComment(t, raw)
	if !ok || lookupVorbis(comments, "LYRICS") != testLyrics {
		t.Fatal("歌词没写对")
	}

	// 重复写入：PICTURE 必须被替换而不是堆叠
	if _, err := EmbedCovers(path, covers, testLyrics); err != nil {
		t.Fatal(err)
	}
	raw2, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := countFLACBlocks(t, raw2, flacBlockPicture); got != 3 {
		t.Fatalf("重复写入后应仍是 3 个 PICTURE，实际 %d", got)
	}
}

// 空内容与不支持格式的行为（旧签名 EmbedMeta 也要保持一致）。
func TestEmbedCoversEdgeCases(t *testing.T) {
	dir := t.TempDir()
	m4a := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(m4a, buildTestM4A(), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := EmbedCovers("", nil, "x"); err == nil {
		t.Fatal("空路径应报错")
	}
	// 全是空项 = 没有要写的内容
	if _, err := EmbedCovers(m4a, []CoverImage{{MIME: "image/jpeg"}, {}}, ""); err == nil {
		t.Fatal("没有任何内容时应报错")
	}
	// nil covers + 歌词：只写歌词
	if res, err := EmbedCovers(m4a, nil, testLyrics); err != nil || !res.OK {
		t.Fatalf("只写歌词应成功: %+v %v", res, err)
	}
	// EmbedMeta 空封面等价于 EmbedCovers(nil)
	if res, err := EmbedMeta(m4a, "image/jpeg", nil, "新歌词"); err != nil || !res.OK {
		t.Fatalf("EmbedMeta 空封面应等价于只写歌词: %+v %v", res, err)
	}

	mp3 := filepath.Join(dir, "song.mp3")
	if err := os.WriteFile(mp3, []byte("ID3\x03\x00\x00\x00\x00\x00\x00"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := EmbedCovers(mp3, []CoverImage{{MIME: "image/jpeg", Data: []byte{1, 2, 3}}}, ""); err != ErrUnsupported {
		t.Fatalf("mp3 应返回 ErrUnsupported，实际 %v", err)
	}
}

/* --------------------------------------------------------------------------
   FLAC PICTURE block 的小工具（测试专用）
   -------------------------------------------------------------------------- */

func countFLACBlocks(t *testing.T, raw []byte, kind byte) int {
	t.Helper()
	count := 0
	for off := 4; off+4 <= len(raw); {
		last := raw[off]&0x80 != 0
		k := raw[off] & 0x7F
		length := int(raw[off+1])<<16 | int(raw[off+2])<<8 | int(raw[off+3])
		off += 4
		if off+length > len(raw) {
			t.Fatalf("metadata 越界")
		}
		if k == kind {
			count++
		}
		off += length
		if last {
			break
		}
	}
	return count
}

// readFLACPictureAt 按顺序读出第 n 个 PICTURE block 的 MIME 与图片数据。
func readFLACPictureAt(t *testing.T, raw []byte, n int) (string, []byte, bool) {
	t.Helper()
	idx := 0
	for off := 4; off+4 <= len(raw); {
		last := raw[off]&0x80 != 0
		k := raw[off] & 0x7F
		length := int(raw[off+1])<<16 | int(raw[off+2])<<8 | int(raw[off+3])
		off += 4
		if off+length > len(raw) {
			return "", nil, false
		}
		if k == flacBlockPicture {
			if idx == n {
				body := raw[off : off+length]
				pos := 4 // 图片类型
				mimeLen := int(beU32(body[pos : pos+4]))
				pos += 4
				mime := string(body[pos : pos+mimeLen])
				pos += mimeLen
				descLen := int(beU32(body[pos : pos+4]))
				pos += 4 + descLen
				pos += 16 // 宽/高/色深/索引色数
				dataLen := int(beU32(body[pos : pos+4]))
				pos += 4
				return mime, body[pos : pos+dataLen], true
			}
			idx++
		}
		off += length
		if last {
			break
		}
	}
	return "", nil, false
}

func beU32(b []byte) uint32 {
	return uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
}
