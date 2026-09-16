package meta

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/metacache"
)

/* --------------------------------------------------------------------------
   内嵌封面读取（ReadPictures）
   --------------------------------------------------------------------------
   样本文件全部**在测试里现场构造**，不依赖本机音乐库：
     - m4a：手工拼 ftyp + moov(mvhd)，再用 metacache.EmbedCovers 写进多张封面；
     - flac：fLaC + STREAMINFO，同样用 EmbedCovers 写 PICTURE block；
     - mp3：手工拼 ID3v2.3 头 + 两个 APIC 帧（metacache 不支持写 mp3，
            所以这一段只能自己拼字节）。
   这样测试同时钉住了「写」与「读」两侧的字节布局是否自洽。
   -------------------------------------------------------------------------- */

// testCover 造一张 n 字节的假图，开头是 JPEG 魔数（嗅探用得上）。
// 长度刻意大于 64：读侧虽然不看尺寸，但过小的图接近「坏数据」，
// 用长一点的样本更能代表真实封面。
func testCover(seed byte, n int) []byte {
	out := make([]byte, n)
	for i := range out {
		out[i] = seed ^ byte(i*31)
	}
	copy(out, []byte{0xFF, 0xD8, 0xFF, 0xE0})
	return out
}

// testPNG 造一张 n 字节的假图，开头是 PNG 魔数。
//
// 为什么需要它：EmbedCovers 会按传入的 MIME 往 data box 里写类型字节，
// 而解析端在类型字节缺失/不认识时会**回退到按魔数嗅探**。如果假图全是 JPEG
// 魔数，「类型字节有没有被正确解析」就永远测不出来（PNG 也会被测成 JPEG）。
func testPNG(seed byte, n int) []byte {
	out := make([]byte, n)
	for i := range out {
		out[i] = seed ^ byte(i*17)
	}
	copy(out, []byte("\x89PNG\r\n\x1a\n"))
	return out
}

// buildMinimalM4A 拼一个能用的最小 m4a：ftyp + moov(mvhd) + mdat。
func buildMinimalM4A() []byte {
	mk := func(kind string, payload []byte) []byte {
		head := make([]byte, 8)
		binary.BigEndian.PutUint32(head, uint32(8+len(payload)))
		copy(head[4:8], kind)
		return append(head, payload...)
	}
	mvhd := make([]byte, 100)
	binary.BigEndian.PutUint32(mvhd[12:16], 44100)
	binary.BigEndian.PutUint32(mvhd[16:20], 44100)
	out := mk("ftyp", append([]byte("M4A "), 0, 0, 0, 0))
	out = append(out, mk("moov", mk("mvhd", mvhd))...)
	return append(out, mk("mdat", make([]byte, 1024))...)
}

// buildMinimalFLAC 拼一个 fLaC + STREAMINFO（最后一块）+ 几个音频字节。
func buildMinimalFLAC() []byte {
	out := append([]byte("fLaC"), 0x80|0, 0, 0, 34)
	out = append(out, make([]byte, 34)...)
	return append(out, 0xFF, 0xF8, 0x69, 0x00)
}

// buildMP3WithAPICs 手工拼一个只含 APIC 帧的 ID3v2.3 tag + 一小段假音频。
func buildMP3WithAPICs(pics [][]byte) []byte {
	frame := func(data []byte) []byte {
		// APIC：编码(1) + MIME(0 结尾) + 图片类型(1) + 描述(0 结尾) + 图片数据
		payload := []byte{0}
		payload = append(payload, []byte("image/jpeg")...)
		payload = append(payload, 0)
		payload = append(payload, 3) // 3 = 封面正面
		payload = append(payload, 0) // 空描述
		payload = append(payload, data...)

		out := make([]byte, 10)
		copy(out[0:4], "APIC")
		binary.BigEndian.PutUint32(out[4:8], uint32(len(payload)))
		return append(out, payload...)
	}

	var body []byte
	for _, p := range pics {
		body = append(body, frame(p)...)
	}
	head := make([]byte, 10)
	copy(head[0:3], "ID3")
	head[3] = 3 // v2.3
	head[4] = 0 // 无 unsynchronisation / 无扩展头
	// syncsafe 大小（每字节 7 位）
	size := len(body)
	head[6] = byte((size >> 21) & 0x7F)
	head[7] = byte((size >> 14) & 0x7F)
	head[8] = byte((size >> 7) & 0x7F)
	head[9] = byte(size & 0x7F)

	out := append(head, body...)
	return append(out, make([]byte, 512)...) // 假音频数据
}

func writeTemp(t *testing.T, name string, data []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// 多封面写进 m4a 后要能全部读回来，顺序与数据都要一致。
func TestReadPicturesM4A(t *testing.T) {
	covers := []metacache.CoverImage{
		{MIME: "image/jpeg", Data: testCover(0x11, 300)},
		{MIME: "image/png", Data: testPNG(0x22, 400)},
		{MIME: "image/jpeg", Data: testCover(0x33, 200)},
	}
	path := writeTemp(t, "song.m4a", buildMinimalM4A())
	if _, err := metacache.EmbedCovers(path, covers, ""); err != nil {
		t.Fatalf("写回多封面失败（样本构造不出来，后面的断言没意义）: %v", err)
	}

	got := ReadPictures(path)
	if len(got) != len(covers) {
		t.Fatalf("应读到 %d 张封面，实际 %d", len(covers), len(got))
	}
	for i, want := range covers {
		if !bytes.Equal(got[i].Data, want.Data) {
			t.Fatalf("第 %d 张封面数据不一致（%d vs %d 字节）", i, len(got[i].Data), len(want.Data))
		}
		if got[i].MIME != want.MIME {
			t.Fatalf("第 %d 张封面 MIME = %q，期望 %q", i, got[i].MIME, want.MIME)
		}
	}
}

// 同一个 covr 里塞多个 data box（iTunes 早期写法）也必须全部读出来。
func TestReadPicturesMP4MultipleDataInOneCovr(t *testing.T) {
	a := testCover(0x44, 128)
	// 第二张用真正的 PNG 魔数：data box 里声明类型 14（PNG），
	// 只有内容也真是 PNG 才能验证「声明类型被正确解出」而不是被 sniff 兜底成 jpeg
	b := make([]byte, 192)
	copy(b, []byte("\x89PNG\r\n\x1a\n"))

	dataBox := func(data []byte, typ uint32) []byte {
		head := make([]byte, 8)
		binary.BigEndian.PutUint32(head[0:4], uint32(8+8+len(data)))
		copy(head[4:8], "data")
		flags := make([]byte, 8)
		flags[3] = byte(typ) // 类型字节在 box 内偏移 3
		out := append(head, flags...)
		return append(out, data...)
	}
	covrPayload := append(dataBox(a, 13), dataBox(b, 14)...)
	covr := make([]byte, 8)
	binary.BigEndian.PutUint32(covr[0:4], uint32(8+len(covrPayload)))
	copy(covr[4:8], "covr")
	covr = append(covr, covrPayload...)

	// 手工拼 udta/meta/ilst，里面只放这一个 covr
	ilst := make([]byte, 8)
	binary.BigEndian.PutUint32(ilst[0:4], uint32(8+len(covr)))
	copy(ilst[4:8], "ilst")
	ilst = append(ilst, covr...)

	metaPayload := append([]byte{0, 0, 0, 0}, ilst...)
	metaBox := make([]byte, 8)
	binary.BigEndian.PutUint32(metaBox[0:4], uint32(8+len(metaPayload)))
	copy(metaBox[4:8], "meta")
	metaBox = append(metaBox, metaPayload...)

	udta := make([]byte, 8)
	binary.BigEndian.PutUint32(udta[0:4], uint32(8+len(metaBox)))
	copy(udta[4:8], "udta")
	udta = append(udta, metaBox...)

	base := buildMinimalM4A()
	start, end, ok := findM4ABox(base, "moov")
	if !ok {
		t.Fatal("夹具里没有 moov")
	}
	out := append([]byte{}, base[:end]...)
	out = append(out, udta...)
	// 修 moov 的大小
	binary.BigEndian.PutUint32(out[start:start+4], uint32(end-start+len(udta)))
	out = append(out, base[end:]...)

	path := writeTemp(t, "one-covr.m4a", out)
	got := ReadPictures(path)
	if len(got) != 2 {
		t.Fatalf("同一个 covr 里的两个 data box 都应读到，实际 %d 张", len(got))
	}
	if !bytes.Equal(got[0].Data, a) || !bytes.Equal(got[1].Data, b) {
		t.Fatal("读到的图片数据不对")
	}
	if got[1].MIME != "image/png" {
		t.Fatalf("png 的类型应解出来，实际 %q", got[1].MIME)
	}
}

// findM4ABox 在字节里找顶层 box 的 [start,end)。
func findM4ABox(raw []byte, kind string) (int, int, bool) {
	for off := 0; off+8 <= len(raw); {
		size := int(binary.BigEndian.Uint32(raw[off : off+4]))
		if size < 8 || off+size > len(raw) {
			return 0, 0, false
		}
		if string(raw[off+4:off+8]) == kind {
			return off, off + size, true
		}
		off += size
	}
	return 0, 0, false
}

// FLAC：每张封面一个 PICTURE block，全部读回来。
func TestReadPicturesFLAC(t *testing.T) {
	covers := []metacache.CoverImage{
		{MIME: "image/jpeg", Data: testCover(0x66, 256)},
		{MIME: "image/png", Data: testPNG(0x77, 320)},
	}
	path := writeTemp(t, "song.flac", buildMinimalFLAC())
	if _, err := metacache.EmbedCovers(path, covers, ""); err != nil {
		t.Fatalf("写回 FLAC 封面失败: %v", err)
	}

	got := ReadPictures(path)
	if len(got) != 2 {
		t.Fatalf("应读到 2 张 FLAC 封面，实际 %d", len(got))
	}
	for i, want := range covers {
		if !bytes.Equal(got[i].Data, want.Data) {
			t.Fatalf("第 %d 张数据不一致", i)
		}
		if got[i].MIME != want.MIME {
			t.Fatalf("第 %d 张 MIME = %q，期望 %q", i, got[i].MIME, want.MIME)
		}
	}
}

// MP3：ID3v2.3 里的多个 APIC 帧。
func TestReadPicturesMP3(t *testing.T) {
	covers := [][]byte{testCover(0x88, 300), testCover(0x99, 260)}
	path := writeTemp(t, "song.mp3", buildMP3WithAPICs(covers))

	got := ReadPictures(path)
	if len(got) != 2 {
		t.Fatalf("应读到 2 张 APIC，实际 %d", len(got))
	}
	for i, want := range covers {
		if !bytes.Equal(got[i].Data, want) {
			t.Fatalf("第 %d 张 APIC 数据不一致（%d vs %d 字节）", i, len(got[i].Data), len(want))
		}
		if got[i].MIME != "image/jpeg" {
			t.Fatalf("第 %d 张 APIC MIME = %q", i, got[i].MIME)
		}
	}
}

// 只有一张 APIC 的常见情况。
func TestReadPicturesMP3Single(t *testing.T) {
	cover := testCover(0xAB, 500)
	path := writeTemp(t, "single.mp3", buildMP3WithAPICs([][]byte{cover}))
	got := ReadPictures(path)
	if len(got) != 1 || !bytes.Equal(got[0].Data, cover) {
		t.Fatalf("单张 APIC 读不回来: %d 张", len(got))
	}
}

// 各种「读不出封面」的情况：必须返回空切片且绝不 panic。
func TestReadPicturesNoPanic(t *testing.T) {
	cases := []struct {
		name string
		file string
		data []byte
	}{
		{"不存在的文件", "missing.flac", nil},
		{"空文件", "empty.flac", nil},
		{"随机字节", "junk.m4a", []byte("这不是任何音频格式的字节流\x00\x01\x02")},
		{"只有 ID3 头没有帧", "head.mp3", []byte("ID3\x03\x00\x00\x00\x00\x00\x00")},
		{"被截断的 ID3 帧", "cut.mp3", append([]byte("ID3\x03\x00\x00\x00\x00\x01\x00"), []byte("APIC\x00\x00\x10\x00\x00")...)},
		{"flac 声明长度越界", "bad.flac", append([]byte("fLaC\x06\xFF\xFF\xFF"), make([]byte, 16)...)},
		{"mp4 声明长度越界", "bad.m4a", append([]byte("\x00\x00\x00\x40moov"), make([]byte, 8)...)},
		{"flac 里没有 PICTURE", "plain.flac", buildMinimalFLAC()},
		{"mp4 里没有 ilst", "plain.m4a", buildMinimalM4A()},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var path string
			if c.data == nil {
				// 故意指向一个不存在的路径（用临时目录保证不会碰到真实文件）
				path = filepath.Join(t.TempDir(), c.file)
			} else {
				path = writeTemp(t, c.file, c.data)
			}
			got := ReadPictures(path)
			if len(got) != 0 {
				t.Fatalf("不该读出封面，实际 %d 张", len(got))
			}
		})
	}

	if got := ReadPictures(""); len(got) != 0 {
		t.Fatal("空路径应返回空")
	}
}

// 单张超过 4MB 的内嵌图要丢弃（否则一首歌就能把内存吃满）。
func TestReadPicturesSkipsOversized(t *testing.T) {
	// 直接手工拼一个 flac：PICTURE 里的数据超过 maxCoverBytes
	big := make([]byte, maxCoverBytes+1)
	copy(big, []byte{0xFF, 0xD8, 0xFF, 0xE0})
	small := testCover(0xCD, 200)

	path := writeTemp(t, "big.flac", buildMinimalFLAC())
	if _, err := metacache.EmbedCovers(path, []metacache.CoverImage{
		{MIME: "image/jpeg", Data: big},
		{MIME: "image/jpeg", Data: small},
	}, ""); err != nil {
		t.Fatalf("写入超大有封面失败: %v", err)
	}
	got := ReadPictures(path)
	if len(got) != 1 || !bytes.Equal(got[0].Data, small) {
		t.Fatalf("超大图应被丢弃、只留小图，实际 %d 张", len(got))
	}
}
