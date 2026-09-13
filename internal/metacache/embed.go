package metacache

import (
	"encoding/binary"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// EmbedResult 一次「写回歌曲元数据」的结果。
//
// 注意这是可选增强：失败只影响「文件里有没有标签」，
// 缓存目录里的封面/歌词始终是有效的。
type EmbedResult struct {
	OK      bool   `json:"ok"`
	Format  string `json:"format"`  // m4a / flac / mp3 …
	Message string `json:"message"` // 失败原因或说明
	Bytes   int    `json:"bytes"`   // 处理后的文件大小
}

// ErrUnsupported 表示该格式暂不支持写入标签。
var ErrUnsupported = errors.New("该格式暂不支持写入元数据")

// EmbedCover 把封面写入音频文件自身的标签。
//
// 当前实现支持：
//   - m4a / mp4（iTunes `covr` atom）：本包用纯 Go 追加一个新的 moov，
//     不动音频数据、不重新编码；
//   - flac（PICTURE metadata block）：本包重写 metadata 区块。
//
// 其他格式（mp3 / wav / ogg / ape / wma / dsf）返回 ErrUnsupported ——
// 内置的精简 ffmpeg 只编进了 wav/flac/null 三个封装器，无法通用 remux，
// 所以这里宁可明确说"不支持"，也不要写坏用户的文件。
func EmbedCover(path, mime string, data []byte) (EmbedResult, error) {
	return EmbedMeta(path, mime, data, "")
}

// EmbedLyrics 只把歌词写入音频文件自身的标签，不动封面。
func EmbedLyrics(path, lyrics string) (EmbedResult, error) {
	return EmbedMeta(path, "", nil, lyrics)
}

// EmbedMeta 把封面与歌词一起写进音频文件（两者都可以为空 = 不写那一样）。
//
// 为什么不是「先写封面再写歌词」（两次 EmbedCover / EmbedLyrics）：
// 每次都要读一遍整个文件、重新拼一遍 moov / FLAC metadata，
// 而且**封面会被覆盖两次**。合成一次写入既省一遍 IO，也保证同一次操作里
// 「写进去的封面和歌词」是同一份缓存内容。
//
// 歌词的落地位置：
//   - m4a / mp4：ilst 里的 `©lyr`（iTunes 的歌词字段，UTF-8 文本）；
//   - flac：VORBIS_COMMENT 里的 `LYRICS` 字段（保留原有的 TITLE / ARTIST 等注释）。
func EmbedMeta(path, mime string, cover []byte, lyrics string) (EmbedResult, error) {
	if strings.TrimSpace(path) == "" {
		return EmbedResult{}, errors.New("文件路径为空")
	}
	lyrics = strings.TrimSpace(lyrics)
	if len(cover) == 0 && lyrics == "" {
		return EmbedResult{}, errors.New("没有要写入的内容")
	}
	// 注意用 TrimPrefix（去掉开头的点）而不是 TrimSuffix：
	// filepath.Ext 返回的是 ".m4a"，点在前缀上。
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
	ext = strings.TrimSpace(ext)

	if ext == "m4a" || ext == "mp4" || ext == "m4b" || ext == "alac" || ext == "aac" {
		res, err := embedMetaMP4(path, mime, cover, lyrics)
		res.Format = "m4a"
		return res, err
	}
	if ext == "flac" {
		res, err := embedMetaFLAC(path, mime, cover, lyrics)
		res.Format = "flac"
		return res, err
	}
	return EmbedResult{Format: ext, Message: ErrUnsupported.Error()}, ErrUnsupported
}

// SupportedEmbed 判断某个扩展名能不能写回元数据。
func SupportedEmbed(ext string) bool {
	switch strings.TrimSpace(strings.ToLower(strings.TrimPrefix(ext, "."))) {
	case "m4a", "mp4", "m4b", "alac", "aac", "flac":
		return true
	}
	return false
}

/* --------------------------------------------------------------------------
   MP4 / M4A：在原有 moov 里「长出」一个 covr
   --------------------------------------------------------------------------
   为什么不是「在文件末尾追加一个新的 moov」：
   解析器（github.com/dhowden/tag，也是我们扫描时用的那个）是从文件头开始
   顺序遍历 box 的，遇到 `moov` 就下钻、遇到未知 box 就按 size 跳过。
   `mdat` 不在它的已知列表里，于是它会把 mdat 的**内容**当成 box 继续解析 ——
   实测只要末尾出现第二个 moov，`covr` 就会读到错位的字节，
   报 `unhandled implicit content type`。多个 moov 本身也违反 MP4 规范。

   所以改成：把 covr 插进**原有 moov** 的 udta/meta/ilst 里，
   整个过程只改动 moov 内部字节与四处 size 字段（moov / udta / meta / ilst），
   音频数据（mdat）与所有 chunk 偏移（stco 记录的是绝对偏移，指向 mdat）都不受影响。

   关键实现细节：moov 内部的 box 在插入点之前的字节必须保持原样，
   否则 stco 里的偏移就全错了。所以都是「保留前缀 + 替换尾部」而不是重建。
   -------------------------------------------------------------------------- */

// mp4Node 一个要修改的嵌套 box：定位信息 + 它的「前导部分」。
type mp4Node struct {
	kind    string
	payload []byte // 版本/标志之后的子 box 区域（meta 会剥掉 4 字节版本）
	sizeAt  int    // size 字段在文件里的偏移
	header  int    // 该 box 头长度（8，或 meta 的 12）
	start   int
}

func embedMetaMP4(path, mime string, cover []byte, lyrics string) (EmbedResult, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return EmbedResult{}, fmt.Errorf("读取文件失败: %w", err)
	}
	moovStart, moovEnd, ok := findTopLevelBoxAbs(raw, "moov")
	if !ok {
		return EmbedResult{}, errors.New("不是有效的 MP4/M4A：找不到 moov")
	}

	// covr 与 ©lyr 是同级的 ilst 条目，拼在一起（顺序无所谓）
	var atoms []byte
	if len(cover) > 0 {
		atoms = append(atoms, buildCovrPayload(mime, cover)...)
	}
	if lyrics != "" {
		atoms = append(atoms, box("\xa9lyr", buildTextDataBox([]byte(lyrics)))...)
	}
	note := metaNote(len(cover), lyrics)

	// moov 的载荷：从 moovStart+8 到 moovEnd
	moovPayload := raw[moovStart+8 : moovEnd]
	udta := findChildAbs(raw, moovStart+8, moovEnd, "udta")
	if udta < 0 {
		// 没有 udta：整个 moov 载荷末尾追加 udta/meta/ilst
		newUdta := box("udta", boxFull("meta", box("ilst", atoms)))
		body := append(append([]byte{}, moovPayload...), newUdta...)
		out := spliceBox(raw, moovStart, moovEnd, append(boxHeader("moov", len(body)+8), body...))
		if err := writeFileAtomic(path, out); err != nil {
			return EmbedResult{}, err
		}
		return EmbedResult{OK: true, Message: note, Bytes: len(out)}, nil
	}

	udtaSize := int(binary.BigEndian.Uint32(raw[udta : udta+4]))
	udtaEnd := udta + udtaSize
	meta := findChildAbs(raw, udta+8, udtaEnd, "meta")
	if meta < 0 {
		newMeta := boxFull("meta", box("ilst", atoms))
		body := append(append([]byte{}, raw[udta+8:udtaEnd]...), newMeta...)
		out := spliceBox(raw, udta, udtaEnd, append(boxHeader("udta", len(body)+8), body...))
		if err := writeFileAtomic(path, out); err != nil {
			return EmbedResult{}, err
		}
		return EmbedResult{OK: true, Message: note, Bytes: len(out)}, nil
	}

	// meta 是「完整 box」：4 字节版本/标志 + 子 box
	metaSize := int(binary.BigEndian.Uint32(raw[meta : meta+4]))
	metaEnd := meta + metaSize
	ilst := findChildAbs(raw, meta+12, metaEnd, "ilst")
	if ilst < 0 {
		inner := append(append([]byte{}, raw[meta+12:metaEnd]...), box("ilst", atoms)...)
		newMeta := append(boxHeader("meta", len(inner)+12), 0, 0, 0, 0)
		newMeta = append(newMeta, inner...)
		out := spliceBox(raw, meta, metaEnd, newMeta)
		if err := writeFileAtomic(path, out); err != nil {
			return EmbedResult{}, err
		}
		return EmbedResult{OK: true, Message: note, Bytes: len(out)}, nil
	}

	// ilst 已存在：只为「这次真的要写」的条目做替换，剩下的原样保留。
	// 关键细节：lyrics 为空时**不能**把已有的 ©lyr 摘掉 —— 空字符串的含义是
	// 「这次没有歌词要写」，而不是「把文件里的歌词删掉」。
	drop := map[string]bool{}
	if len(cover) > 0 {
		drop["covr"] = true
	}
	if lyrics != "" {
		drop["\xa9lyr"] = true
	}
	ilstEnd := ilstEndOf(raw, ilst, metaEnd)
	filtered := filterIlst(raw, ilst, ilstEnd, drop)
	filtered = append(filtered, atoms...)

	newIlst := append(boxHeader("ilst", len(filtered)+8), filtered...)

	// 自内向外重算：ilst → meta → udta → moov
	newMetaPayload := append(append([]byte{}, raw[meta+12:ilst]...), newIlst...)
	newMetaPayload = append(newMetaPayload, raw[ilstEnd:metaEnd]...)
	newMeta := append(boxHeader("meta", len(newMetaPayload)+12), 0, 0, 0, 0)
	newMeta = append(newMeta, newMetaPayload...)

	newUdtaPayload := append(append([]byte{}, raw[udta+8:meta]...), newMeta...)
	newUdtaPayload = append(newUdtaPayload, raw[metaEnd:udtaEnd]...)
	newUdta := append(boxHeader("udta", len(newUdtaPayload)+8), newUdtaPayload...)

	newMoovPayload := append(append([]byte{}, raw[moovStart+8:udta]...), newUdta...)
	newMoovPayload = append(newMoovPayload, raw[udtaEnd:moovEnd]...)
	newMoov := append(boxHeader("moov", len(newMoovPayload)+8), newMoovPayload...)

	out := spliceBox(raw, moovStart, moovEnd, newMoov)
	if err := writeFileAtomic(path, out); err != nil {
		return EmbedResult{}, err
	}
	return EmbedResult{OK: true, Message: note, Bytes: len(out)}, nil
}

// filterIlst 复制 ilst 里不需要重建的条目（drop 里的条目会被丢掉）。
func filterIlst(raw []byte, ilst, limit int, drop map[string]bool) []byte {
	ilstSize := int(binary.BigEndian.Uint32(raw[ilst : ilst+4]))
	ilstEnd := ilst + ilstSize
	if ilstEnd > limit {
		ilstEnd = limit
	}
	out := make([]byte, 0, ilstSize)
	for off := ilst + 8; off+8 <= ilstEnd; {
		size := int(binary.BigEndian.Uint32(raw[off : off+4]))
		kind := string(raw[off+4 : off+8])
		if size < 8 || off+size > ilstEnd {
			break
		}
		if !drop[kind] {
			out = append(out, raw[off:off+size]...)
		}
		off += size
	}
	return out
}

// ilstEndOf 返回 ilst box 的结束偏移（越界时退回到 limit）。
func ilstEndOf(raw []byte, ilst, limit int) int {
	size := int(binary.BigEndian.Uint32(raw[ilst : ilst+4]))
	if size < 8 || ilst+size > limit {
		return limit
	}
	return ilst + size
}

// buildTextDataBox 生成 iTunes 的 UTF-8 文本 data box（type 1）。
func buildTextDataBox(text []byte) []byte {
	out := make([]byte, 0, len(text)+16)
	out = append(out, boxHeader("data", len(text)+16)...)
	out = append(out, 0, 0, 0, 1) // 版本 0 + 类型 1 = UTF-8 文本
	out = append(out, 0, 0, 0, 0) // locale
	return append(out, text...)
}

// metaNote 拼一条人话的结果说明（设置界面会直接显示这句）。
func metaNote(coverBytes int, lyrics string) string {
	switch {
	case coverBytes > 0 && lyrics != "":
		return fmt.Sprintf("已写入封面（%d 字节）与歌词（%d 字）", coverBytes, len([]rune(lyrics)))
	case coverBytes > 0:
		return fmt.Sprintf("已写入封面（%d 字节）", coverBytes)
	case lyrics != "":
		return fmt.Sprintf("已写入歌词（%d 字）", len([]rune(lyrics)))
	default:
		return "没有要写入的内容"
	}
}

// buildCovrPayload 生成一个完整的 covr box。
func buildCovrPayload(mime string, cover []byte) []byte {
	dataType := byte(13) // JPEG
	if strings.Contains(strings.ToLower(mime), "png") {
		dataType = 14
	}
	// data box：8 字节头 + 4 字节版本 + 4 字节类型 + 4 字节 locale + 载荷。
	// 类型字节必须落在 box 内偏移 3（1 字节版本 + 3 字节类型），
	// 见 layout_probe_test.go：放错位置解析器会读成 class=0（implicit）并报错。
	dataBox := make([]byte, 0, len(cover)+20)
	dataBox = append(dataBox, boxHeader("data", len(cover)+20)...)
	dataBox = append(dataBox, 0, 0, 0, dataType)
	dataBox = append(dataBox, 0, 0, 0, 0) // locale
	dataBox = append(dataBox, cover...)
	return box("covr", dataBox)
}

// spliceBox 把 [start,end) 这段字节替换成 replacement。
func spliceBox(raw []byte, start, end int, replacement []byte) []byte {
	out := make([]byte, 0, len(raw)-(end-start)+len(replacement))
	out = append(out, raw[:start]...)
	out = append(out, replacement...)
	return append(out, raw[end:]...)
}

// findTopLevelBoxAbs 返回指定顶层 box 的绝对 [start, end)。
func findTopLevelBoxAbs(raw []byte, boxType string) (int, int, bool) {
	for off := 0; off+8 <= len(raw); {
		size := int(binary.BigEndian.Uint32(raw[off : off+4]))
		kind := string(raw[off+4 : off+8])
		header := 8
		if size == 1 {
			if off+16 > len(raw) {
				return 0, 0, false
			}
			size = int(binary.BigEndian.Uint64(raw[off+8 : off+16]))
			header = 16
		} else if size == 0 {
			size = len(raw) - off
		}
		if size < header || off+size > len(raw) {
			return 0, 0, false
		}
		if kind == boxType {
			return off, off + size, true
		}
		off += size
	}
	return 0, 0, false
}

// findChildAbs 在 [from,to) 里找直接的子 box，返回其绝对起始偏移；找不到返回 -1。
func findChildAbs(raw []byte, from, to int, kind string) int {
	for off := from; off+8 <= to; {
		size := int(binary.BigEndian.Uint32(raw[off : off+4]))
		name := string(raw[off+4 : off+8])
		if size < 8 || off+size > to {
			return -1
		}
		if name == kind {
			return off
		}
		off += size
	}
	return -1
}

// findTopLevelBox 保留给测试用：在文件里找出指定类型的顶层 box。
func findTopLevelBox(raw []byte, boxType string) (int, int, bool) {
	return findTopLevelBoxAbs(raw, boxType)
}

// findNestedBox 保留给测试用：在容器 box 的载荷里找子 box（一层）。
func findNestedBox(payload []byte, boxType string) []byte {
	for off := 0; off+8 <= len(payload); {
		size := int(binary.BigEndian.Uint32(payload[off : off+4]))
		kind := string(payload[off+4 : off+8])
		if size < 8 || off+size > len(payload) {
			return nil
		}
		if kind == boxType {
			return payload[off : off+size]
		}
		off += size
	}
	return nil
}

func box(kind string, payload []byte) []byte {
	out := make([]byte, 0, len(payload)+8)
	out = append(out, boxHeader(kind, len(payload)+8)...)
	return append(out, payload...)
}

// boxFull 生成「完整 box」（meta/hdlr 这类），载荷前多 4 字节版本与标志。
func boxFull(kind string, payload []byte) []byte {
	withFlags := make([]byte, 0, len(payload)+4)
	withFlags = append(withFlags, 0, 0, 0, 0)
	withFlags = append(withFlags, payload...)
	return box(kind, withFlags)
}

func boxHeader(kind string, size int) []byte {
	out := make([]byte, 8)
	binary.BigEndian.PutUint32(out[0:4], uint32(size))
	copy(out[4:8], kind)
	return out
}

/* --------------------------------------------------------------------------
   FLAC：重写 metadata 区块
   --------------------------------------------------------------------------
   FLAC 结构：`fLaC` + 一串 metadata block + 音频帧。
   类型 4 = VORBIS_COMMENT，类型 6 = PICTURE，最后一个 block 的 header 最高位置 1。

   实现方式：解析原文件的全部 metadata block，替换/插入 PICTURE，
   然后把「新 metadata + 原音频帧」写成新文件。音频帧一个字节都不动。
   -------------------------------------------------------------------------- */

const (
	flacBlockStreamInfo    = 0
	flacBlockVorbisComment = 4
	flacBlockPicture       = 6
)

func embedMetaFLAC(path, mime string, cover []byte, lyrics string) (EmbedResult, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return EmbedResult{}, fmt.Errorf("读取文件失败: %w", err)
	}
	if len(raw) < 4 || string(raw[0:4]) != "fLaC" {
		return EmbedResult{}, errors.New("不是有效的 FLAC 文件")
	}

	type block struct {
		kind byte
		body []byte
	}
	var blocks []block
	var comments [][2]string // 保留原有的 VORBIS_COMMENT 字段
	off := 4
	for {
		if off+4 > len(raw) {
			return EmbedResult{}, errors.New("FLAC metadata 不完整")
		}
		header := raw[off]
		last := header&0x80 != 0
		kind := header & 0x7F
		length := int(raw[off+1])<<16 | int(raw[off+2])<<8 | int(raw[off+3])
		off += 4
		if off+length > len(raw) {
			return EmbedResult{}, errors.New("FLAC metadata 长度越界")
		}
		body := raw[off : off+length]
		off += length

		switch {
		case kind == flacBlockPicture:
			// 丢掉旧的 PICTURE（同一张封面重复写入时不堆叠），
			// 稍后按 cover 是否有内容决定要不要重新加回去
		case kind == flacBlockVorbisComment:
			// 记下原有注释（TITLE / ARTIST…），稍后与新的 LYRICS 合并重写
			comments = parseVorbisComment(body)
		default:
			blocks = append(blocks, block{kind: kind, body: body})
		}
		if last {
			break
		}
	}
	audio := raw[off:]

	if len(comments) > 0 || lyrics != "" {
		merged := comments
		if lyrics != "" {
			merged = setVorbisField(merged, "LYRICS", lyrics)
		}
		if len(merged) > 0 {
			blocks = append(blocks, block{kind: flacBlockVorbisComment, body: buildVorbisComment(merged)})
		}
	}
	if len(cover) > 0 {
		blocks = append(blocks, block{kind: flacBlockPicture, body: flacPictureBlock(mime, cover)})
	}

	// 重新拼装：注意最后一个 block 要置「最后一块」标志
	var out []byte
	out = append(out, raw[0:4]...)
	for i, b := range blocks {
		flag := b.kind
		if i == len(blocks)-1 {
			flag |= 0x80
		}
		length := len(b.body)
		out = append(out, flag, byte(length>>16), byte(length>>8), byte(length))
		out = append(out, b.body...)
	}
	out = append(out, audio...)

	if err := writeFileAtomic(path, out); err != nil {
		return EmbedResult{}, err
	}
	return EmbedResult{OK: true, Message: metaNote(len(cover), lyrics), Bytes: len(out)}, nil
}

/* --------------------------------------------------------------------------
   VORBIS_COMMENT（小端长度！）
   --------------------------------------------------------------------------
   FLAC 的注释块格式：
     vendor_length(u32 LE) + vendor + count(u32 LE)
     + count × ( length(u32 LE) + "KEY=VALUE" )
   注意协议里所有长度都是**小端**，写反了播放器会把整个块读成垃圾。
   -------------------------------------------------------------------------- */

func parseVorbisComment(body []byte) [][2]string {
	out := [][2]string{}
	pos := 0
	readU32 := func() (int, bool) {
		if pos+4 > len(body) {
			return 0, false
		}
		v := int(binary.LittleEndian.Uint32(body[pos : pos+4]))
		pos += 4
		return v, true
	}

	vendorLen, ok := readU32()
	if !ok || pos+vendorLen > len(body) {
		return out
	}
	pos += vendorLen
	count, ok := readU32()
	if !ok {
		return out
	}
	for i := 0; i < count; i++ {
		length, ok := readU32()
		if !ok || pos+length > len(body) {
			return out
		}
		text := string(body[pos : pos+length])
		pos += length
		eq := strings.Index(text, "=")
		if eq <= 0 {
			continue
		}
		out = append(out, [2]string{text[:eq], text[eq+1:]})
	}
	return out
}

// setVorbisField 覆盖/新增一个字段（同名旧值先去掉，避免重复）。
func setVorbisField(comments [][2]string, key, value string) [][2]string {
	out := make([][2]string, 0, len(comments)+1)
	for _, kv := range comments {
		if !strings.EqualFold(kv[0], key) {
			out = append(out, kv)
		}
	}
	return append(out, [2]string{key, value})
}

func buildVorbisComment(comments [][2]string) []byte {
	const vendor = "MusicPlayer"
	var out []byte
	be := func(v uint32) {
		out = append(out, byte(v), byte(v>>8), byte(v>>16), byte(v>>24))
	}
	be(uint32(len(vendor)))
	out = append(out, vendor...)
	be(uint32(len(comments)))
	for _, kv := range comments {
		entry := kv[0] + "=" + kv[1]
		be(uint32(len(entry)))
		out = append(out, entry...)
	}
	return out
}

// flacPictureBlock 按 FLAC 规范拼 PICTURE 区块内容。
func flacPictureBlock(mime string, cover []byte) []byte {
	if mime == "" {
		mime = "image/jpeg"
	}
	var out []byte
	be32 := func(v uint32) {
		out = append(out, byte(v>>24), byte(v>>16), byte(v>>8), byte(v))
	}
	be32(3) // 图片类型 3 = 封面正面
	be32(uint32(len(mime)))
	out = append(out, mime...)
	be32(0)                // 描述长度 0
	be32(0)                // 宽（未知）
	be32(0)                // 高（未知）
	be32(0)                // 色深（未知）
	be32(0)                // 索引色数量（未知）
	be32(uint32(len(cover))) // 图片数据长度
	out = append(out, cover...)
	return out
}

/* --------------------------------------------------------------------------
   写盘
   -------------------------------------------------------------------------- */

// writeFileAtomic 写临时文件再改名，尽量保留原文件权限。
func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".mp-embed-*")
	if err != nil {
		return fmt.Errorf("创建临时文件失败: %w", err)
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("写入临时文件失败: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("同步临时文件失败: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("关闭临时文件失败: %w", err)
	}
	if info, err := os.Stat(path); err == nil {
		_ = os.Chmod(tmpName, info.Mode())
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("替换原文件失败: %w", err)
	}
	return nil
}
