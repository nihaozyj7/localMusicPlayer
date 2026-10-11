package metacache

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

/* ==========================================================================
   写回 m4a 时的「容器长度」与「chunk 绝对偏移」一致性
   --------------------------------------------------------------------------
   这一组用例守的是两个曾经真实存在、且**现有测试一个都抓不到**的 bug：

   ① moov 位于 mdat 之前时（faststart）写标签会让 stco 记录的绝对偏移失效。
      stco/co64 存的是「相对文件起始的绝对偏移」，moov 一变长，后面的 mdat
      与所有 chunk 就整体后移，而偏移值不会自己跟着变 —— 解码器从错误位置取
      数据，用户的音乐文件被永久写坏。
      实测（3 秒 440Hz faststart m4a，只在 moov 末尾插入 4096 字节）：原文件解出
      529200 字节 PCM，改动后的文件一个字节都解不出来。

   ② 只替换最内层 box（udta 里没有 meta 时追加 meta、meta 里没有 ilst 时追加
      ilst）却不重算外层长度。外层声明的长度比实际短，解析器走完声明长度后会
      把多出来的字节当成新的顶层 box。

   之前的夹具（metacache_test.go#buildTestM4A）恰好没有 stco，而断言只比
   mdat 的**字节内容**——位置移了、内容没变，所以永远是绿的。
   ========================================================================== */

// stcoBox 造一个 stco：4 字节版本/标志 + 4 字节条目数 + N × 4 字节偏移。
func stcoBox(offsets ...uint32) []byte {
	payload := make([]byte, 8+4*len(offsets))
	binary.BigEndian.PutUint32(payload[4:8], uint32(len(offsets)))
	for i, off := range offsets {
		binary.BigEndian.PutUint32(payload[8+4*i:12+4*i], off)
	}
	return mp4Box("stco", payload)
}

// mdatPayload 夹具里的音频载荷（与 minimalM4A 用同一串，方便对照）。
var mdatPayload = []byte("fake-audio-payload")

// m4aWithStco 造一个「moov 在 mdat 之前 + 带真实 stco」的 m4a：
//
//	ftyp + moov{ trak{ mdia{ minf{ stbl{ stco } } } } } + mdat
//
// stco 里的偏移指向 mdat 的载荷起点（即真正的音频数据）。
// 返回文件字节、moov 结束偏移、mdat 载荷偏移。
func m4aWithStco(count int) (data []byte, moovEnd, mdatPayloadAt int) {
	build := func(offsets []uint32) []byte {
		stbl := mp4Box("stbl", stcoBox(offsets...))
		minf := mp4Box("minf", stbl)
		mdia := mp4Box("mdia", minf)
		trak := mp4Box("trak", mdia)
		moov := mp4Box("moov", trak)
		ftyp := mp4Box("ftyp", []byte("M4A isom\x00\x00\x02\x00M4A mp42isom"))
		mdat := mp4Box("mdat", mdatPayload)
		return concat(ftyp, moov, mdat)
	}
	// 先用占位偏移量出布局（条目数不变 → 长度不变），再填真实偏移。
	probe := build(make([]uint32, count))
	_, moovEnd, ok := findTopLevelBoxAbs(probe, "moov")
	if !ok {
		panic("fixture: 找不到 moov")
	}
	mdatStart, _, ok := findTopLevelBoxAbs(probe, "mdat")
	if !ok {
		panic("fixture: 找不到 mdat")
	}
	offsets := make([]uint32, count)
	for i := range offsets {
		offsets[i] = uint32(mdatStart + 8)
	}
	return build(offsets), moovEnd, mdatStart + 8
}

// findBoxPath 沿着 kinds 从顶层逐级定位一个 box，返回它的绝对起点；找不到返回 -1。
// 会自动跳过 meta 载荷前的 4 字节版本/标志。
func findBoxPath(raw []byte, kinds ...string) int {
	cur, end, ok := findTopLevelBoxAbs(raw, kinds[0])
	if !ok {
		return -1
	}
	parentKind := kinds[0]
	for _, kind := range kinds[1:] {
		payloadAt, boxEnd, ok := boxSizeAt(raw, cur, end, parentKind)
		if !ok {
			return -1
		}
		childFrom := payloadAt
		if parentKind == "meta" {
			childFrom += 4
		}
		cur = findChildAbs(raw, childFrom, boxEnd, kind)
		if cur < 0 {
			return -1
		}
		end = boxEnd
		parentKind = kind
	}
	return cur
}

// readStco 按 moov > trak > mdia > minf > stbl > stco 读出 chunk 偏移。
func readStco(t *testing.T, raw []byte) []uint32 {
	t.Helper()
	stco := findBoxPath(raw, "moov", "trak", "mdia", "minf", "stbl", "stco")
	if stco < 0 {
		t.Fatal("读不到 stco（夹具或写入后的结构被破坏）")
	}
	payloadAt, end, ok := boxSizeAt(raw, stco, len(raw), "stco")
	if !ok {
		t.Fatal("stco 长度非法")
	}
	count := int(binary.BigEndian.Uint32(raw[payloadAt+4 : payloadAt+8]))
	if payloadAt+8+count*4 > end {
		t.Fatalf("stco 条目数 %d 越界", count)
	}
	out := make([]uint32, count)
	for i := 0; i < count; i++ {
		out[i] = binary.BigEndian.Uint32(raw[payloadAt+8+4*i : payloadAt+12+4*i])
	}
	return out
}

// assertTopLevelWalkExact 断言顶层 box 遍历**正好**走完整个文件。
//
// 这条断言直接针对「外层长度没跟着改」那类 bug：只要某一层的长度字段比实际
// 短或长，遍历要么提前结束、要么踩到越界 —— 两种情况都会失败。
func assertTopLevelWalkExact(t *testing.T, raw []byte) {
	t.Helper()
	off := 0
	kinds := []string{}
	for off+8 <= len(raw) {
		_, end, ok := boxSizeAt(raw, off, len(raw), "")
		if !ok || end <= off {
			t.Fatalf("顶层 box 遍历到偏移 %d（文件 %d 字节）时长度非法：声明大小与结构不一致", off, len(raw))
		}
		kinds = append(kinds, string(raw[off+4:off+8]))
		off = end
	}
	if off != len(raw) {
		t.Fatalf("顶层 box 只走到 %d，文件长 %d：末尾还有 %d 字节没有归属（外层长度字段没跟着改）",
			off, len(raw), len(raw)-off)
	}
	if strings.Count(strings.Join(kinds, ","), "moov") != 1 {
		t.Fatalf("顶层 moov 应当恰好一个，实际：%v", kinds)
	}
}

func TestEmbedCoversShiftsChunkOffsetsWhenMoovPrecedesMdat(t *testing.T) {
	original, moovEnd, mdatPayloadAt := m4aWithStco(3)
	if mdatPayloadAt <= moovEnd {
		t.Fatalf("夹具不成立：mdat 载荷 %d 应当在 moov 结束 %d 之后", mdatPayloadAt, moovEnd)
	}
	oldOffsets := readStco(t, original)
	for _, off := range oldOffsets {
		if int(off) != mdatPayloadAt {
			t.Fatalf("夹具不成立：stco 应当指向 mdat 载荷 %d，实际 %d", mdatPayloadAt, off)
		}
	}

	path := writeTempM4A(t, original)
	res, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: make([]byte, 2048)}}, "")
	if err != nil {
		t.Fatalf("moov 在 mdat 之前的文件应当能写成功（平移 chunk 偏移），实际失败: %v", err)
	}
	if !res.OK {
		t.Fatalf("期望写入成功，实际: %+v", res)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读回文件失败: %v", err)
	}
	delta := len(after) - len(original)
	if delta <= 0 {
		t.Fatalf("夹具应当让文件变大（封面），实际 delta=%d", delta)
	}
	assertTopLevelWalkExact(t, after)

	newOffsets := readStco(t, after)
	if len(newOffsets) != len(oldOffsets) {
		t.Fatalf("stco 条目数变了：%d → %d", len(oldOffsets), len(newOffsets))
	}
	for i := range newOffsets {
		want := oldOffsets[i] + uint32(delta)
		if newOffsets[i] != want {
			t.Fatalf("第 %d 个 chunk 偏移应为 %d（旧值 %d + 文件增长 %d），实际 %d —— 偏移没有跟着 moov 一起平移",
				i, want, oldOffsets[i], delta, newOffsets[i])
		}
	}

	// 最强的一条：按新的偏移去读，读到的必须**就是**音频载荷。
	off := int(newOffsets[0])
	if off+len(mdatPayload) > len(after) {
		t.Fatalf("平移后的偏移 %d 已经超出文件（%d 字节）", off, len(after))
	}
	if got := after[off : off+len(mdatPayload)]; string(got) != string(mdatPayload) {
		t.Fatalf("平移后的偏移 %d 指向的不是音频数据：%q（期望 %q）", off, got, mdatPayload)
	}
}

func TestEmbedCoversShiftsNegativeDeltaToo(t *testing.T) {
	// 反向：先写两张封面，再写一张（ilst 变小），文件缩小，偏移必须往前移。
	original, _, _ := m4aWithStco(1)
	path := writeTempM4A(t, original)

	two := []CoverImage{
		{MIME: "image/jpeg", Data: make([]byte, 4096)},
		{MIME: "image/jpeg", Data: make([]byte, 4096)},
	}
	if _, err := EmbedCovers(path, two, ""); err != nil {
		t.Fatalf("第一步写入失败: %v", err)
	}
	mid, _ := os.ReadFile(path)
	midOffsets := readStco(t, mid)

	if _, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: make([]byte, 16)}}, ""); err != nil {
		t.Fatalf("第二步写入失败: %v", err)
	}
	after, _ := os.ReadFile(path)
	delta := len(after) - len(mid)
	if delta >= 0 {
		t.Fatalf("夹具应当让文件变小，实际 delta=%d", delta)
	}
	assertTopLevelWalkExact(t, after)

	newOffsets := readStco(t, after)
	if newOffsets[0] != uint32(int(midOffsets[0])+delta) {
		t.Fatalf("文件缩小时偏移应前移 %d：%d → %d", delta, midOffsets[0], newOffsets[0])
	}
	off := int(newOffsets[0])
	if string(after[off:off+len(mdatPayload)]) != string(mdatPayload) {
		t.Fatal("缩小后偏移没有指向音频数据")
	}
}

func TestEmbedCoversRefusesUnfixableOffsets(t *testing.T) {
	// moof（分片）、iloc（条目位置）、saio（辅助信息偏移）都另有绝对偏移需要同步，
	// 本包不同步 → 必须明确放弃写入，而且**一个字节都不能改**原始文件。
	cases := []struct {
		name string
		raw  []byte
	}{
		{"fragmented (moof)", concat(minimalM4A(mp4Box("udta", mp4Box("meta", []byte{0, 0, 0, 0}))), mp4Box("moof", []byte("x")))},
		{"iloc inside moov", func() []byte {
			moov := mp4Box("moov", concat(mp4Box("iloc", []byte{0, 0, 0, 0, 0, 0, 0, 0}), mp4Box("trak", mp4Box("mdia", mp4Box("minf", mp4Box("stbl", stcoBox(0)))))))
			ftyp := mp4Box("ftyp", []byte("M4A isom\x00\x00\x02\x00M4A mp42isom"))
			return concat(ftyp, moov, mp4Box("mdat", mdatPayload))
		}()},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			path := writeTempM4A(t, c.raw)
			res, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: make([]byte, 512)}}, "")
			if err == nil {
				t.Fatalf("存在无法同步的绝对偏移时应当放弃写入，实际成功: %+v", res)
			}
			if !strings.Contains(err.Error(), "放弃写入") {
				t.Fatalf("错误信息应当明确说明「放弃写入」，实际: %v", err)
			}
			after, readErr := os.ReadFile(path)
			if readErr != nil {
				t.Fatalf("读回文件失败: %v", readErr)
			}
			if string(after) != string(c.raw) {
				t.Fatal("放弃写入时原始文件被改动了")
			}
		})
	}
}

func TestEmbedCoversKeepsParentSizesConsistent(t *testing.T) {
	// 四种 moov 内部布局都要求「每一层长度都跟着改」。
	// 其中后两种正是历史上只改最内层、外层长度留旧值的那两条分支。
	//
	// 夹具里的 udta 子 box 都是**真正的 box**（不是任意字节）：层次结构的长度
	// 一致性只能对结构化的载荷断言。
	withIlst := mp4Box("meta", concat([]byte{0, 0, 0, 0}, mp4Box("ilst", mp4Box("covr", mp4Box("data", []byte("OLD"))))))
	cases := []struct {
		name string
		raw  []byte
	}{
		{"moov 里没有 udta", minimalM4A(mp4Box("mvhd", []byte("x")))},
		{"udta 里没有 meta", minimalM4A(mp4Box("udta", mp4Box("\xa9too", []byte("keepme"))))},
		{"meta 里没有 ilst", minimalM4A(mp4Box("udta", mp4Box("meta", []byte{0, 0, 0, 0})))},
		{"ilst 已存在（替换 covr）", minimalM4A(mp4Box("udta", withIlst))},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			path := writeTempM4A(t, c.raw)
			res, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: []byte("NEWCOVER")}}, "")
			if err != nil {
				t.Fatalf("应当能写成功: %v", err)
			}
			if !res.OK {
				t.Fatalf("期望成功: %+v", res)
			}
			after, _ := os.ReadFile(path)
			assertTopLevelWalkExact(t, after)
			if !containsBytes(after, []byte("NEWCOVER")) {
				t.Fatal("封面没写进文件")
			}
			if !containsBytes(after, mdatPayload) {
				t.Fatal("音频数据丢失")
			}
			// 四种布局写完后都应当是 moov > udta > meta > ilst：
			// 每一层的长度字段自洽，才能一路下探成功。
			if findBoxPath(after, "moov", "udta", "meta", "ilst") < 0 {
				t.Fatal("写回后 moov > udta > meta > ilst 无法重新定位（某层长度字段不自洽）")
			}
			// 原有的 udta 子 box 不能被吃掉（只做最小插入）。
			if strings.Contains(c.name, "没有 meta") && !containsBytes(after, []byte("keepme")) {
				t.Fatal("原有的 udta 子 box 被丢掉了")
			}
		})
	}
}

func TestEmbedLyricsKeepsEmbeddedFlacPictures(t *testing.T) {
	// 只写歌词（covers == nil）时，FLAC 里原有的 PICTURE 必须原样保留。
	// 历史实现无条件丢弃全部 PICTURE 并在重建时只按 covers 重新添加，
	// 于是「把歌词写进文件」会把用户的内嵌封面静默删掉。
	pic := []byte("PRETEND-PNG-BYTES-1234567890")
	raw := buildFlacWithPicture(t, "OLD-TITLE", pic)
	path := writeTempFile(t, raw, "sample.flac")

	res, err := EmbedLyrics(path, "[00:01.00]第一句\n[00:02.00]第二句\n")
	if err != nil {
		t.Fatalf("写歌词失败: %v", err)
	}
	if !res.OK {
		t.Fatalf("期望成功: %+v", res)
	}
	after, _ := os.ReadFile(path)
	if !containsBytes(after, pic) {
		t.Fatal("写歌词把 FLAC 里原有的内嵌封面删掉了")
	}
	if !containsBytes(after, []byte("LYRICS=")) {
		t.Fatal("歌词没有被写进 VORBIS_COMMENT")
	}
	if !containsBytes(after, []byte("OLD-TITLE")) {
		t.Fatal("原有的标题标签丢了")
	}

	// 反过来：真的要写封面时，旧 PICTURE 应当被替换（不堆叠）。
	if _, err := EmbedCovers(path, []CoverImage{{MIME: "image/png", Data: []byte("NEW-PNG")}}, ""); err != nil {
		t.Fatalf("写封面失败: %v", err)
	}
	after2, _ := os.ReadFile(path)
	if containsBytes(after2, pic) {
		t.Fatal("写新封面时旧 PICTURE 应当被替换掉")
	}
	if !containsBytes(after2, []byte("NEW-PNG")) {
		t.Fatal("新封面没写进文件")
	}
	if !containsBytes(after2, []byte("LYRICS=")) {
		t.Fatal("写封面时把歌词弄丢了")
	}
}

/* --------------------------------------------------------------------------
   FLAC 夹具
   -------------------------------------------------------------------------- */

// buildFlacWithPicture 造一个最小可用的 FLAC：
// fLaC + STREAMINFO + VORBIS_COMMENT(TITLE=…) + PICTURE + 假音频帧。
func buildFlacWithPicture(t *testing.T, title string, picture []byte) []byte {
	t.Helper()
	var out []byte
	out = append(out, "fLaC"...)

	// STREAMINFO（34 字节，内容对本用例不重要，但必须是第一块且长度正确）
	streamInfo := make([]byte, 34)
	out = append(out, 0x00) // 类型 0、非最后一块
	out = append(out, 0x00, 0x00, byte(len(streamInfo)))
	out = append(out, streamInfo...)

	// VORBIS_COMMENT：vendor + 1 个字段 TITLE=…
	vendor := []byte("lmplayer-test")
	comment := make([]byte, 0, 64)
	comment = appendU32LE(comment, uint32(len(vendor)))
	comment = append(comment, vendor...)
	comment = appendU32LE(comment, 1)
	field := []byte("TITLE=" + title)
	comment = appendU32LE(comment, uint32(len(field)))
	comment = append(comment, field...)
	out = append(out, 0x04)
	out = append(out, byte(len(comment)>>16), byte(len(comment)>>8), byte(len(comment)))
	out = append(out, comment...)

	// PICTURE（内容不需要是合法图片：本包只按字节搬运）
	// 0x86 = 「最后一块」标志 + 类型 6：必须置上，否则解析器会继续把后面的
	// 音频帧当成 metadata block。
	out = append(out, 0x86)
	out = append(out, byte(len(picture)>>16), byte(len(picture)>>8), byte(len(picture)))
	out = append(out, picture...)

	// 元数据区之后的假音频帧（写回时必须原样保留）
	out = append(out, []byte{0xFF, 0xF8, 0x00, 0x00}...)
	return out
}

func appendU32LE(b []byte, v uint32) []byte {
	return append(b, byte(v), byte(v>>8), byte(v>>16), byte(v>>24))
}

// writeTempFile 写一个任意扩展名的临时文件。
func writeTempFile(t *testing.T, data []byte, name string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("写临时文件失败: %v", err)
	}
	return path
}
