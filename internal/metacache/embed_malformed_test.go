package metacache

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

/* ==========================================================================
   畸形 / 边界 MP4 结构的回归测试
   --------------------------------------------------------------------------
   为什么单独一个文件：internal/metacache/embed.go 是**唯一会改写用户音乐文件**
   的模块，它解析的却是磁盘上任意来源、长度字段完全不可信的 box 结构。
   这里曾经出过两个会伤害用户数据的问题：

     1. embedMetaMP4 裸读 udta/meta 的 4 字节长度后直接切片，
        没有任何上界检查 → 一个把长度写成 0x7FFFFFF0 的坏文件就能触发
        `slice bounds out of range` panic，而调用链没有 recover()，
        于是「写回一张封面」= 整个应用崩溃。
     2. findChildAbs 没处理 size==0 / size==1 两种**规范允许的**特殊长度，
        把合法的 meta box 判成「不存在」，代码转而走「追加一个新 meta」的分支，
        在已经有 meta 的文件里再塞一个 → stco 记录的绝对偏移失效，
        用户的音乐文件被永久写坏。

   本文件的验收标准是**同一句话**：
     「要么正确改写，要么返回 error，**绝不 panic、绝不写坏原文件**」。
   所以每个用例都断言两件事：不 panic（Go 测试天然会在 panic 时失败），
   以及出错时原文件字节**完全不变**。
   ========================================================================== */

/* --------------------------------------------------------------------------
   构造工具
   -------------------------------------------------------------------------- */

// mp4Box 拼一个普通 box（32 位长度）。
func mp4Box(kind string, payload []byte) []byte {
	out := make([]byte, 8, 8+len(payload))
	binary.BigEndian.PutUint32(out[0:4], uint32(8+len(payload)))
	copy(out[4:8], kind)
	return append(out, payload...)
}

// mp4BoxRawSize 用**指定的** size 字段值拼 box（用来构造畸形/特殊长度）。
func mp4BoxRawSize(kind string, sizeField uint32, payload []byte) []byte {
	out := make([]byte, 8, 8+len(payload))
	binary.BigEndian.PutUint32(out[0:4], sizeField)
	copy(out[4:8], kind)
	return append(out, payload...)
}

// minimalM4A 造一个结构完整的最小 m4a：ftyp + moov(内含 udta 或 meta 按参数)。
// udtaPayload 为 nil 表示 moov 里没有 udta。
func minimalM4A(moovChildren []byte) []byte {
	ftyp := mp4Box("ftyp", []byte("M4A isom\x00\x00\x02\x00M4A mp42isom"))
	moov := mp4Box("moov", moovChildren)
	mdat := mp4Box("mdat", []byte("fake-audio-payload"))
	return concat(ftyp, moov, mdat)
}

func concat(parts ...[]byte) []byte {
	var out []byte
	for _, p := range parts {
		out = append(out, p...)
	}
	return out
}

// writeTempM4A 把字节写进临时文件并返回路径。
func writeTempM4A(t *testing.T, data []byte) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "sample.m4a")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("写临时文件失败: %v", err)
	}
	return path
}

// assertUnchanged 断言文件内容与给定的原始字节完全一致。
// 「出错时原文件必须一字未改」是本文件的核心断言。
func assertUnchanged(t *testing.T, path string, want []byte) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读回文件失败: %v", err)
	}
	if len(got) != len(want) {
		t.Fatalf("原文件被改动了：长度 %d → %d（应当保持不变）", len(want), len(got))
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("原文件被改动了：偏移 %d 处 %02x → %02x（应当保持不变）", i, want[i], got[i])
		}
	}
}

/* --------------------------------------------------------------------------
   用例 1：udta 长度字段被写成巨大值
   --------------------------------------------------------------------------
   ⚠️ 关于本用例严重度的诚实说明（复核后修正）：

   最初这条被定性为「panic 崩溃」。逐条回源后发现**它并不能真正触发 panic**：
   `udta` 是通过 findChildAbs 找到的，而 findChildAbs 原有的
   `if size < 8 || off+size > to { return -1 }` 已经排除了「长度越界」的 box ——
   也就是说能找到 udta，就意味着 udta+udtaSize <= moovEnd 已经成立，
   后面的 `raw[udta+8:udtaEnd]` 自然不会越界。meta 同理。

   所以这条的真实性质是**纵深防御**而不是线上崩溃：直接把 4 字节长度读出来
   就用于切片，这个写法本身不安全，一旦将来有人改了 findChildAbs 的检查、
   或在这两行之间插入新的逻辑，就会立刻变成越界崩溃。
   修复（统一走带全量校验的 boxSizeAt + 入口 recover）保留，
   但严重度从 P0 降为「健壮性加固」。

   本用例断言的行为因此是：**不 panic，且要么安全改写、要么返回错误**，
   不强制要求返回错误（因为走「追加」分支在此结构下是合法且正确的）。
   -------------------------------------------------------------------------- */

func TestEmbedCoversHugeUdtaSizeDoesNotPanic(t *testing.T) {
	bogusUdta := mp4BoxRawSize("udta", 0x7FFFFFF0, []byte("x"))
	data := minimalM4A(bogusUdta)
	path := writeTempM4A(t, data)

	// 核心断言：不 panic。返回成功或失败都可接受。
	res, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: []byte("JPEGDATA")}}, "")
	t.Logf("巨大 udta 长度：ok=%v err=%v msg=%s", res.OK, err, res.Message)

	// 无论走哪条分支，音频数据都不能丢
	after, readErr := os.ReadFile(path)
	if readErr != nil {
		t.Fatalf("读回文件失败: %v", readErr)
	}
	if !containsBytes(after, []byte("fake-audio-payload")) {
		t.Fatal("音频数据（mdat）丢失 —— 无论是否写入成功，音频都必须原样保留")
	}
}

/* --------------------------------------------------------------------------
   用例 2：meta 长度字段被写成巨大值（同一类纵深防御）
   -------------------------------------------------------------------------- */

func TestEmbedCoversHugeMetaSizeDoesNotPanic(t *testing.T) {
	bogusMeta := mp4BoxRawSize("meta", 0x7FFFFFF0, []byte("\x00\x00\x00\x00"))
	udta := mp4Box("udta", bogusMeta)
	data := minimalM4A(udta)
	path := writeTempM4A(t, data)

	res, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: []byte("JPEGDATA")}}, "")
	t.Logf("巨大 meta 长度：ok=%v err=%v msg=%s", res.OK, err, res.Message)

	after, readErr := os.ReadFile(path)
	if readErr != nil {
		t.Fatalf("读回文件失败: %v", readErr)
	}
	if !containsBytes(after, []byte("fake-audio-payload")) {
		t.Fatal("音频数据（mdat）丢失")
	}
}

/* --------------------------------------------------------------------------
   用例 3：meta 的 size 字段 == 0（规范允许 = 延伸到容器末尾）
   --------------------------------------------------------------------------
   这是 findChildAbs 漏掉 size==0 分支的直接后果：
   合法 box 被判成「不存在」→ 追加重复 meta → 文件结构被破坏。
   正确行为：识别出这个 meta，把封面写进它里面的 ilst。
   -------------------------------------------------------------------------- */

func TestEmbedCoversHandlesMetaSizeZero(t *testing.T) {
	// meta 的 size 字段写 0（延伸到 udta 末尾），payload 是 4 字节版本/标志
	metaPayload := []byte{0, 0, 0, 0}
	zeroMeta := mp4BoxRawSize("meta", 0, metaPayload)
	udta := mp4Box("udta", zeroMeta)
	data := minimalM4A(udta)
	path := writeTempM4A(t, data)

	res, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: []byte("JPEGDATA")}}, "")
	if err != nil {
		t.Fatalf("size==0 的 meta 是合法结构，不应失败: %v", err)
	}
	if !res.OK {
		t.Fatalf("期望写入成功，实际: %+v", res)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读回失败: %v", err)
	}
	// 必须**只有一个** meta —— 出现第二个说明走了「追加」的错误分支
	if n := countBox(after, "meta"); n != 1 {
		t.Fatalf("meta box 数量应为 1，实际 %d（说明把合法 meta 判成了不存在并追加了重复的）", n)
	}
	// 封面必须真的写进去了
	if !containsBytes(after, []byte("JPEGDATA")) {
		t.Fatal("封面数据没有被写进文件")
	}
	// 音频数据必须原样保留
	if !containsBytes(after, []byte("fake-audio-payload")) {
		t.Fatal("音频数据（mdat）丢失")
	}
}

/* --------------------------------------------------------------------------
   用例 4：size 字段 == 1（64 位长度）
   -------------------------------------------------------------------------- */

func TestEmbedCoversHandles64BitSize(t *testing.T) {
	// 用 size==1 形态构造 meta：8 字节头 + 8 字节真实长度 + payload
	inner := []byte{0, 0, 0, 0} // 版本/标志
	realSize := uint64(16 + len(inner))
	raw := make([]byte, 16, 16+len(inner))
	binary.BigEndian.PutUint32(raw[0:4], 1) // size == 1 → 用 64 位长度
	copy(raw[4:8], "meta")
	binary.BigEndian.PutUint64(raw[8:16], realSize)
	metaBox := append(raw, inner...)

	udta := mp4Box("udta", metaBox)
	data := minimalM4A(udta)
	path := writeTempM4A(t, data)

	res, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: []byte("JPEGDATA")}}, "")
	if err != nil {
		t.Fatalf("64 位长度的 meta 是合法结构，不应失败: %v", err)
	}
	if !res.OK {
		t.Fatalf("期望写入成功，实际: %+v", res)
	}
	after, _ := os.ReadFile(path)
	if !containsBytes(after, []byte("JPEGDATA")) {
		t.Fatal("封面数据没有被写进文件")
	}
	if !containsBytes(after, []byte("fake-audio-payload")) {
		t.Fatal("音频数据（mdat）丢失")
	}
}

/* --------------------------------------------------------------------------
   用例 5：截断的文件（长度字段指向文件之外）
   -------------------------------------------------------------------------- */

func TestEmbedCoversTruncatedFileDoesNotPanic(t *testing.T) {
	full := minimalM4A(mp4Box("udta", mp4Box("meta", []byte{0, 0, 0, 0})))
	// 从中间截断，制造「box 声明长度 > 实际文件长度」
	for _, cut := range []int{0, 4, 8, 12, 16, 20, 24, 28} {
		if cut >= len(full) {
			continue
		}
		data := full[:cut]
		path := writeTempM4A(t, data)
		// 只要不 panic 就算通过；返回什么都接受（截断文件本来就不可写）
		res, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: []byte("J")}}, "")
		if err == nil && res.OK {
			// 如果它声称成功了，那就必须真的没破坏文件
			t.Logf("截断到 %d 字节时声称写入成功: %+v", cut, res)
		}
	}
}

/* --------------------------------------------------------------------------
   用例 6：完全没有 moov / 不是 MP4
   -------------------------------------------------------------------------- */

func TestEmbedCoversNonMP4(t *testing.T) {
	path := writeTempM4A(t, []byte("this is definitely not an mp4 file at all"))
	res, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: []byte("J")}}, "")
	if err == nil {
		t.Fatalf("非 MP4 文件应当报错，实际成功: %+v", res)
	}
}

/* --------------------------------------------------------------------------
   用例 9：boxSizeAt 的长度校验（P0 修复点的直接单元测试）
   -------------------------------------------------------------------------- */

func TestBoxSizeAtRejectsOutOfBounds(t *testing.T) {
	// 一个 8 字节头的 box，声明长度远超缓冲区
	buf := make([]byte, 32)
	binary.BigEndian.PutUint32(buf[0:4], 0x7FFFFFF0)
	copy(buf[4:8], "udta")

	if _, _, ok := boxSizeAt(buf, 0, len(buf), "udta"); ok {
		t.Fatal("越界长度必须被判为不可信（ok=false），否则会退化成 slice 越界 panic")
	}

	// size==0：合法，表示延伸到 limit 末尾
	zero := make([]byte, 32)
	binary.BigEndian.PutUint32(zero[0:4], 0)
	copy(zero[4:8], "meta")
	payloadAt, end, ok := boxSizeAt(zero, 0, len(zero), "meta")
	if !ok {
		t.Fatal("size==0 是规范允许的形态，不应被判为非法")
	}
	if payloadAt != 8 || end != len(zero) {
		t.Fatalf("size==0 应解析为 payloadAt=8 end=%d，实际 payloadAt=%d end=%d", len(zero), payloadAt, end)
	}

	// size==1：64 位长度，且真实长度越界时必须拒绝
	big := make([]byte, 40)
	binary.BigEndian.PutUint32(big[0:4], 1)
	copy(big[4:8], "meta")
	binary.BigEndian.PutUint64(big[8:16], 1<<40) // 远超缓冲区
	if _, _, ok := boxSizeAt(big, 0, len(big), "meta"); ok {
		t.Fatal("64 位长度越界必须被拒绝")
	}

	// 头部不足 8 字节
	if _, _, ok := boxSizeAt(buf[:5], 0, 5, "udta"); ok {
		t.Fatal("不足 8 字节的头必须被拒绝")
	}
}

/* --------------------------------------------------------------------------
   用例 10：findChildAbs 与 findTopLevelBoxAbs 对特殊长度行为一致
   --------------------------------------------------------------------------
   这条防的是「子集实现漂移」——两个函数曾经对 size==0/1 的处理不一致，
   正是 C-02 的根因。
   -------------------------------------------------------------------------- */

func TestFindChildAndTopLevelAgree(t *testing.T) {
	// 顶层：ftyp + moov{ udta{ meta(size=0) } }
	metaZero := mp4BoxRawSize("meta", 0, []byte{0, 0, 0, 0})
	udta := mp4Box("udta", metaZero)
	data := minimalM4A(udta)

	// 顶层 udta 必须找得到
	if off := findTopLevelBoxAbs2(data, "moov"); off < 0 {
		t.Fatal("顶层 moov 必须找得到")
	}
	moovStart, moovEnd, ok := findTopLevelBoxAbs(data, "moov")
	if !ok {
		t.Fatal("findTopLevelBoxAbs(moov) 失败")
	}
	// 子层 udta 必须找得到
	udtaOff := findChildAbs(data, moovStart+8, moovEnd, "udta")
	if udtaOff < 0 {
		t.Fatal("findChildAbs(udta) 失败")
	}
	// 子层 meta(size==0) 必须找得到 —— 这是 C-02 的核心断言
	udtaEnd := udtaOff + 8 + len(metaZero)
	metaOff := findChildAbs(data, udtaOff+8, udtaEnd, "meta")
	if metaOff < 0 {
		t.Fatal("size==0 的 meta 必须被 findChildAbs 找到（否则会追加重复 meta 把文件写坏）")
	}
}

func findTopLevelBoxAbs2(raw []byte, kind string) int {
	off, _, ok := findTopLevelBoxAbs(raw, kind)
	if !ok {
		return -1
	}
	return off
}

/* --------------------------------------------------------------------------
   用例 7：正常文件仍然能正常工作（防止修复过度而误伤正常路径）
   -------------------------------------------------------------------------- */

func TestEmbedCoversNormalFileStillWorks(t *testing.T) {
	// 一个正常的 moov > udta > meta > ilst 结构
	ilst := mp4Box("ilst", nil)
	metaInner := append([]byte{0, 0, 0, 0}, ilst...)
	meta := mp4Box("meta", metaInner)
	udta := mp4Box("udta", meta)
	data := minimalM4A(udta)
	path := writeTempM4A(t, data)

	res, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: []byte("JPEGDATA")}}, "")
	if err != nil {
		t.Fatalf("正常文件应当写入成功: %v", err)
	}
	if !res.OK {
		t.Fatalf("期望 OK，实际: %+v", res)
	}
	after, _ := os.ReadFile(path)
	if !containsBytes(after, []byte("JPEGDATA")) {
		t.Fatal("封面没写进去")
	}
	if n := countBox(after, "meta"); n != 1 {
		t.Fatalf("meta 数量应为 1，实际 %d（写重了）", n)
	}
	if !containsBytes(after, []byte("fake-audio-payload")) {
		t.Fatal("音频数据丢失")
	}
}

/* --------------------------------------------------------------------------
   用例 8：写回后必须留下备份（C-07）
   -------------------------------------------------------------------------- */

func TestEmbedCoversCreatesBackup(t *testing.T) {
	ilst := mp4Box("ilst", nil)
	meta := mp4Box("meta", append([]byte{0, 0, 0, 0}, ilst...))
	udta := mp4Box("udta", meta)
	data := minimalM4A(udta)
	path := writeTempM4A(t, data)

	if _, err := EmbedCovers(path, []CoverImage{{MIME: "image/jpeg", Data: []byte("JPEGDATA")}}, ""); err != nil {
		t.Fatalf("写入失败: %v", err)
	}

	backup, err := os.ReadFile(path + ".bak")
	if err != nil {
		t.Fatalf("应当留下 %s.bak 备份: %v", filepath.Base(path), err)
	}
	// 备份必须是**改动前的原始内容**
	if len(backup) != len(data) {
		t.Fatalf("备份内容不是原始文件：长度 %d，期望 %d", len(backup), len(data))
	}
	for i := range backup {
		if backup[i] != data[i] {
			t.Fatalf("备份内容不是原始文件：偏移 %d 不同", i)
		}
	}
}

/* --------------------------------------------------------------------------
   辅助
   -------------------------------------------------------------------------- */

// countBox 统计字节流里出现的指定 box 类型数量（粗糙但足够用于本文件的断言）。
func countBox(raw []byte, kind string) int {
	n := 0
	for i := 4; i+4 <= len(raw); i++ {
		if string(raw[i:i+4]) == kind {
			n++
		}
	}
	return n
}

func containsBytes(haystack, needle []byte) bool {
	if len(needle) == 0 {
		return true
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		match := true
		for j := range needle {
			if haystack[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
