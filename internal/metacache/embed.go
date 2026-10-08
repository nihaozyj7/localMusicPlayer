package metacache

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// renameAttempts / renameBackoffBase 与 internal/atomicfile 保持同一套退避参数。
// Windows 上 os.Rename 会因为目标被瞬时占用（杀软、索引器、另一个写者）而失败，
// 返回 ERROR_ACCESS_DENIED / ERROR_SHARING_VIOLATION，退避重试即可成功。
const (
	renameAttempts    = 8
	renameBackoffBase = 5 * time.Millisecond
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

// EmbedCover 把封面写入音频文件自身的标签（等价于 EmbedCovers 传一张）。
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

// CoverImage 一张要写进文件的封面。
//
// 为什么需要这个类型：同一首歌可以有多张封面（正面 / 背面 / 盘面），
// 它们要按顺序一起写进文件，第一张就是「封面正面」。
type CoverImage struct {
	MIME string
	Data []byte
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
//
// 这个函数保留原签名（有测试与旧调用方），只是转发到 EmbedCovers。
func EmbedMeta(path, mime string, cover []byte, lyrics string) (EmbedResult, error) {
	var covers []CoverImage
	if len(cover) > 0 {
		covers = []CoverImage{{MIME: mime, Data: cover}}
	}
	return EmbedCovers(path, covers, lyrics)
}

// TextTags 要写回歌曲文件的文本标签（标题 / 歌手 / 专辑）。
//
// 为什么要单独一个类型而不是三个 string 参数：它现在的唯一来源是
// AI 元数据整理（见 ai_tags.go），空字段的语义是「这一项不确定，别动文件里
// 原来的值」—— 三个裸 string 很容易被调用方随手传空而误删用户标签。
type TextTags struct {
	Title  string
	Artist string
	Album  string
}

// Empty 三个字段都是空（没有任何要写的标签）时返回 true。
func (t TextTags) Empty() bool {
	return strings.TrimSpace(t.Title) == "" && strings.TrimSpace(t.Artist) == "" && strings.TrimSpace(t.Album) == ""
}

// EmbedTextTags 只把标题 / 歌手 / 专辑写回歌曲文件自身的标签，不动封面与歌词。
//
// 与 EmbedCovers 共用同一套写入实现：每写一次都要读一遍整个文件、重拼一遍
// moov / FLAC metadata，分两次写既慢又会让中间的半成品短暂可见。
func EmbedTextTags(path string, tags TextTags) (EmbedResult, error) {
	return EmbedTags(path, nil, "", tags)
}

// EmbedTags 把封面、歌词与文本标签一次性写进音频文件（任意项都可以为空）。
//
// 这是本包写回能力的总入口：EmbedCovers / EmbedMeta / EmbedTextTags 都是它的
// 薄封装，保证「一次操作只读写一遍文件」这条性质在新增字段时也不会被破坏。
//
// 空字段的语义一律是「这次没有要写的内容」，**不是**「把文件里原来的值删掉」：
// 只有真的要写的项才会进 drop 集合（见 embedMetaMP4 / embedMetaFLAC）。
func EmbedTags(path string, covers []CoverImage, lyrics string, tags TextTags) (res EmbedResult, err error) {
	defer func() {
		if r := recover(); r != nil {
			res = EmbedResult{Message: fmt.Sprintf("解析音频文件结构时出错，已放弃写入以免损坏文件: %v", r)}
			err = fmt.Errorf("写入元数据失败（文件结构异常）: %v", r)
		}
	}()
	return embedTags(path, covers, lyrics, tags)
}

// EmbedCovers 把多张封面 + 歌词一次写进音频文件。
//
// 顺序就是写进文件的顺序：第一张 = 封面正面（FLAC 的 PICTURE 类型 3、
// MP4 的第一个 covr）。重复写入是**替换**语义而不是堆叠：
// 写之前先把文件里旧的 covr / PICTURE 全部丢掉，再按这里的顺序写回去，
// 否则用户换几次封面，文件里就会攒下一串再也删不掉的旧图。
//
// 它不动标题 / 歌手 / 专辑（TextTags 传空），见 EmbedTags。
//
// ★ 实际的写入（含 recover）在 EmbedTags 里：它处理的输入是**用户磁盘上的
// 任意音频文件**，而文件里那些 box / block 长度字段完全不可信。历史上这里出过
// 「畸形 udta/meta 长度 → slice 越界 panic」，而调用链
// （services_cover.go 的写回封面）没有 recover，于是坏标签能让整个应用崩溃。
// 现在两层防护：boxSizeAt 做全量边界校验（正面拦），recover 兜底（背面拦）。
// 任何解析异常都退化成「返回错误、不写文件」，绝不崩进程、绝不写坏文件。
func EmbedCovers(path string, covers []CoverImage, lyrics string) (res EmbedResult, err error) {
	return EmbedTags(path, covers, lyrics, TextTags{})
}

func embedTags(path string, covers []CoverImage, lyrics string, tags TextTags) (EmbedResult, error) {
	if strings.TrimSpace(path) == "" {
		return EmbedResult{}, errors.New("文件路径为空")
	}
	lyrics = strings.TrimSpace(lyrics)

	// 过滤空项：空数据 / 空 MIME 都写不出一张合法的图，留着只会写坏文件
	images := make([]CoverImage, 0, len(covers))
	for _, c := range covers {
		if len(c.Data) == 0 {
			continue
		}
		images = append(images, c)
	}

	if len(images) == 0 && lyrics == "" && tags.Empty() {
		return EmbedResult{}, errors.New("没有要写入的内容")
	}
	// 注意用 TrimPrefix（去掉开头的点）而不是 TrimSuffix：
	// filepath.Ext 返回的是 ".m4a"，点在前缀上。
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
	ext = strings.TrimSpace(ext)

	if ext == "m4a" || ext == "mp4" || ext == "m4b" || ext == "alac" || ext == "aac" {
		res, err := embedMetaMP4(path, images, lyrics, tags)
		res.Format = "m4a"
		return res, err
	}
	if ext == "flac" {
		res, err := embedMetaFLAC(path, images, lyrics, tags)
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

func embedMetaMP4(path string, covers []CoverImage, lyrics string, tags TextTags) (EmbedResult, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return EmbedResult{}, fmt.Errorf("读取文件失败: %w", err)
	}
	moovStart, moovEnd, ok := findTopLevelBoxAbs(raw, "moov")
	if !ok {
		return EmbedResult{}, errors.New("不是有效的 MP4/M4A：找不到 moov")
	}

	// covr / ©lyr / ©nam… 是同级的 ilst 条目，拼在一起（顺序无所谓）。
	// 多张封面 = 多个 covr box，每个里面各有一个 data box。
	var atoms []byte
	for _, c := range covers {
		if len(c.Data) == 0 {
			continue
		}
		atoms = append(atoms, buildCovrPayload(c.MIME, c.Data)...)
	}
	if lyrics != "" {
		atoms = append(atoms, box("\xa9lyr", buildTextDataBox([]byte(lyrics)))...)
	}
	atoms = append(atoms, buildMP4TextAtoms(tags)...)
	note := metaNote(covers, lyrics, tags)

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

	// ★ 这里必须用 boxSizeAt 而不是裸读 4 字节再加法。
	//
	// 原实现是 `udtaEnd := udta + int(binary.BigEndian.Uint32(raw[udta:udta+4]))`，
	// 长度字段直接采信、**没有任何上界检查**，紧接着就 `raw[udta+8:udtaEnd]`。
	// 一个损坏（或被人为构造）的文件把长度写成 0x7FFFFFF0，
	// 就会得到 `slice bounds out of range [:2147483632] with capacity N` —— panic。
	// 而这条调用链（services_cover.go 的写回封面）全程没有 recover()，
	// 于是一个坏标签就能让整个应用崩掉。boxSizeAt 内部已做全量边界校验。
	_, udtaEnd, ok := boxSizeAt(raw, udta, moovEnd, "udta")
	if !ok {
		return EmbedResult{}, errors.New("udta box 长度非法，已放弃写入以免损坏文件")
	}
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

	// meta 是「完整 box」：4 字节版本/标志 + 子 box。
	// 同样走 boxSizeAt，理由与上面一致（防越界 panic）。
	metaBody, metaEnd, ok := boxSizeAt(raw, meta, udtaEnd, "meta")
	if !ok {
		return EmbedResult{}, errors.New("meta box 长度非法，已放弃写入以免损坏文件")
	}
	// meta 头是 12 字节（8 字节 box 头 + 4 字节版本/标志）。boxSizeAt 返回的
	// metaBody 是按 8 字节头算的，且 size==1 时头是 16 —— 这里只接受 8/16 两种
	// 形态，否则说明结构不是我们能安全改写的布局。
	metaInner := metaBody + 4
	if metaInner > metaEnd {
		return EmbedResult{}, errors.New("meta box 结构异常，已放弃写入以免损坏文件")
	}
	ilst := findChildAbs(raw, metaInner, metaEnd, "ilst")
	if ilst < 0 {
		inner := append(append([]byte{}, raw[metaInner:metaEnd]...), box("ilst", atoms)...)
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
	// 文本标签同理（见 TextTags.Empty）。
	//
	// covr 这里只 drop 一次：drop 是「整个 ilst 里所有 covr 条目都丢掉」，
	// 而新的多张 covr 是在过滤完成后一次性 append 上去的，所以不会被误删。
	drop := map[string]bool{}
	if len(covers) > 0 {
		drop["covr"] = true
	}
	if lyrics != "" {
		drop["\xa9lyr"] = true
	}
	for _, key := range mp4TextAtomKeys(tags) {
		drop[key] = true
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

/* --------------------------------------------------------------------------
   MP4 文本标签（标题 / 歌手 / 专辑）
   --------------------------------------------------------------------------
   iTunes 的 ilst 用 © 开头的四字节原子名承载文本字段：
     ©nam = 标题、©ART = 歌手、©alb = 专辑
   注意 © 是 U+00A9，在 UTF-8 里是 0xC2 0xA9 两个字节，但这里必须按
   **Latin-1 单字节 0xA9** 写 —— MP4 的 box 类型是 4 字节定长，写成两个字节
   会让整个 ilst 的 box 边界全部错位（解析器读到的是错位字节，表现为
   标题乱码或标签整块丢失）。所以字面量写作 "\xa9nam" 而不是 "©nam"。
   -------------------------------------------------------------------------- */

// mp4TextAtomKeys 返回这次真的要写的 ilst 键（供 filterIlst 精确剔除旧值）。
func mp4TextAtomKeys(tags TextTags) []string {
	var keys []string
	if strings.TrimSpace(tags.Title) != "" {
		keys = append(keys, "\xa9nam")
	}
	if strings.TrimSpace(tags.Artist) != "" {
		keys = append(keys, "\xa9ART")
	}
	if strings.TrimSpace(tags.Album) != "" {
		keys = append(keys, "\xa9alb")
	}
	return keys
}

// buildMP4TextAtoms 按「有值才写」的顺序拼出文本标签的 ilst 条目。
func buildMP4TextAtoms(tags TextTags) []byte {
	var out []byte
	append1 := func(key, value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		out = append(out, box(key, buildTextDataBox([]byte(value)))...)
	}
	append1("\xa9nam", tags.Title)
	append1("\xa9ART", tags.Artist)
	append1("\xa9alb", tags.Album)
	return out
}

// metaNote 拼一条人话的结果说明（设置界面会直接显示这句）。
//
// 覆盖多张时会带上张数：只报总字节数的话，用户看到「已写入封面（1234567 字节）」
// 完全不知道到底写进去几张。
func metaNote(covers []CoverImage, lyrics string, tags TextTags) string {
	count, total := 0, 0
	for _, c := range covers {
		if len(c.Data) == 0 {
			continue
		}
		count++
		total += len(c.Data)
	}
	coverPart := ""
	switch {
	case count > 1:
		coverPart = fmt.Sprintf("已写入 %d 张封面（共 %d 字节）", count, total)
	case count == 1:
		coverPart = fmt.Sprintf("已写入封面（%d 字节）", total)
	}
	lyricsPart := ""
	if lyrics != "" {
		lyricsPart = fmt.Sprintf("歌词（%d 字）", len([]rune(lyrics)))
	}
	tagPart := ""
	if n := len(mp4TextAtomKeys(tags)); n > 0 {
		// 说明用「几项」而不是具体字段名：本包同时服务 m4a 与 FLAC，
		// 两边的字段名不同，这里说「元数据」才对两种格式都成立。
		tagPart = fmt.Sprintf("元数据（%d 项）", n)
	}
	return joinMetaNote(coverPart, lyricsPart, tagPart)
}

// joinMetaNote 把若干段说明用「与」连起来（空段直接跳过）。
func joinMetaNote(parts ...string) string {
	kept := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			kept = append(kept, p)
		}
	}
	if len(kept) == 0 {
		return "没有要写入的内容"
	}
	return "已写入" + strings.Join(kept, "与")
}

// buildCovrPayload 生成一个完整的 covr box。
func buildCovrPayload(mime string, cover []byte) []byte {
	dataType := byte(13) // JPEG
	if strings.Contains(strings.ToLower(mime), "png") {
		dataType = 14
	}
	// data box：8 字节头 + 4 字节版本 + 4 字节类型 + 4 字节 locale + 载荷，
	// 所以声明长度必须是 len(cover)+16。
	//
	// 这里原来写的是 +20（多算了 4 字节），于是每个 data box 的长度字段都比
	// 自己的真实字节数大 4。dhowden/tag 不校验嵌套 box 的长度，所以一直没暴露；
	// 但**按长度遍历 box 的解析器会读到错位的字节**（internal/meta 的 ReadPictures
	// 就是这么发现它的）。多出来的 4 字节会让后一个 covr 的起点偏移，
	// 于是「同一个 ilst 里的第二个封面之后」全部对不齐。
	//
	// 类型字节必须落在 box 内偏移 3（1 字节版本 + 3 字节类型），
	// 见 layout_probe_test.go：放错位置解析器会读成 class=0（implicit）并报错。
	dataBox := make([]byte, 0, len(cover)+16)
	dataBox = append(dataBox, boxHeader("data", len(cover)+16)...)
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
		_, end, ok := boxSizeAt(raw, off, len(raw), boxType)
		if !ok {
			return 0, 0, false
		}
		if string(raw[off+4:off+8]) == boxType {
			return off, end, true
		}
		off = end
	}
	return 0, 0, false
}

// boxSizeAt 解析位于 off 的 box 头，返回 (载荷起点, box 结束偏移, kind)。
//
// ok=false 表示这个 box 头不可信（越界 / 长度非法 / 64 位长度读不出来），
// 调用方必须**立即停止**遍历，绝不能拿这个 size 去切片。
//
// ★ 为什么必须集中到一处：这里曾经有两份实现（findTopLevelBoxAbs 与
// findChildAbs），而只有前者处理了 size==0 / size==1 两种 MP4 规范里的合法
// 特殊长度。后者漏了，于是「size 字段为 0 的 meta box」被判定成
// 「找不到 meta」，代码转而走「追加一个新 meta」的分支 —— 在已经存在 meta 的
// 文件里再塞一个，stco 记录的绝对偏移全部失效，**用户的音乐文件被永久写坏**。
// （size==1 表示真正的长度是紧随其后的 8 字节；size==0 表示「本 box 一直延伸到
// 容器末尾」。两种都是规范允许的形态，不是畸形数据。）
//
// 现在两份实现共用这一个函数，避免子集实现再次漂移。
func boxSizeAt(raw []byte, off, limit int, kind string) (payloadAt, end int, ok bool) {
	if off < 0 || off+8 > limit || off+8 > len(raw) {
		return 0, 0, false
	}
	size := int(binary.BigEndian.Uint32(raw[off : off+4]))
	header := 8
	switch size {
	case 0:
		// 延伸到容器末尾。这里是**唯一的**合法「无限长」形态，
		// 必须显式处理，否则会被下面的 size < 8 当成非法而提前放弃遍历。
		size = limit - off
	case 1:
		// 64 位长度：紧随 box 头之后 8 字节。
		if off+16 > limit || off+16 > len(raw) {
			return 0, 0, false
		}
		big := binary.BigEndian.Uint64(raw[off+8 : off+16])
		// int 在 32 位平台上会溢出，且超大值必然越界，统一按不可信处理。
		if big > uint64(limit-off) {
			return 0, 0, false
		}
		size = int(big)
		header = 16
	}
	if size < header || off+size > limit || off+size > len(raw) {
		return 0, 0, false
	}
	return off + header, off + size, true
}

// findChildAbs 在 [from,to) 里找直接的子 box，返回其绝对起始偏移；找不到返回 -1。
func findChildAbs(raw []byte, from, to int, kind string) int {
	for off := from; off+8 <= to; {
		_, end, ok := boxSizeAt(raw, off, to, kind)
		if !ok {
			return -1
		}
		if string(raw[off+4:off+8]) == kind {
			return off
		}
		off = end
	}
	return -1
}

// findTopLevelBox 保留给测试用：在文件里找出指定类型的顶层 box。
func findTopLevelBox(raw []byte, boxType string) (int, int, bool) {
	return findTopLevelBoxAbs(raw, boxType)
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

func embedMetaFLAC(path string, covers []CoverImage, lyrics string, tags TextTags) (EmbedResult, error) {
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
	vendor := ""             // 原有的 vendor 标识，写回时原样保留
	seenComment := false     // 是否已经遇到过 VORBIS_COMMENT 块
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
			// 记下原有注释（TITLE / ARTIST…），稍后与新的 LYRICS 合并重写。
			//
			// ★ 必须是**追加**而不是赋值。规范允许文件里存在多个
			// VORBIS_COMMENT 块，原实现写的是 `comments = parse(...)`，
			// 于是遇到第二个块时会把第一个块里已经读到的 TITLE / ARTIST
			// **静默丢掉** —— 用户只需一次「写回歌词」，标签就少了一批。
			// vendor 只认第一个非空的（多块时后续块的 vendor 是次要信息）。
			fields, v := parseVorbisComment(body)
			comments = append(comments, fields...)
			if !seenComment || vendor == "" {
				vendor = v
			}
			seenComment = true
		default:
			blocks = append(blocks, block{kind: kind, body: body})
		}
		if last {
			break
		}
	}
	audio := raw[off:]

	if len(comments) > 0 || lyrics != "" || !tags.Empty() {
		merged := comments
		if lyrics != "" {
			merged = setVorbisField(merged, "LYRICS", lyrics)
		}
		// 文本标签：空字段**不覆盖**文件里原有的同名注释（见 TextTags 的说明）。
		merged = setVorbisFieldIfAny(merged, "TITLE", tags.Title)
		merged = setVorbisFieldIfAny(merged, "ARTIST", tags.Artist)
		merged = setVorbisFieldIfAny(merged, "ALBUM", tags.Album)
		if len(merged) > 0 {
			blocks = append(blocks, block{
				kind: flacBlockVorbisComment,
				body: buildVorbisCommentWithVendor(merged, vendor),
			})
		}
	}
	// 每张封面一个独立的 PICTURE block（一张一个 block 才是规范做法；
	// 把多张塞进同一个 block 是无效的，播放器只会读出第一张或直接报错）。
	// 因为上面已经把旧的 PICTURE 全丢了，这里追加的不会和旧图堆叠。
	for _, c := range covers {
		if len(c.Data) == 0 {
			continue
		}
		blocks = append(blocks, block{kind: flacBlockPicture, body: flacPictureBlock(c.MIME, c.Data)})
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
	return EmbedResult{OK: true, Message: metaNote(covers, lyrics, tags), Bytes: len(out)}, nil
}

/* --------------------------------------------------------------------------
   VORBIS_COMMENT（小端长度！）
   --------------------------------------------------------------------------
   FLAC 的注释块格式：
     vendor_length(u32 LE) + vendor + count(u32 LE)
     + count × ( length(u32 LE) + "KEY=VALUE" )
   注意协议里所有长度都是**小端**，写反了播放器会把整个块读成垃圾。
   -------------------------------------------------------------------------- */

// parseVorbisComment 解析 VORBIS_COMMENT 块体，返回 (字段列表, vendor)。
// vendor 供写回时原样保留（见 buildVorbisCommentWithVendor）。
func parseVorbisComment(body []byte) ([][2]string, string) {
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
	if !ok || vendorLen < 0 || pos+vendorLen > len(body) {
		return out, ""
	}
	vendor := string(body[pos : pos+vendorLen])
	pos += vendorLen
	count, ok := readU32()
	if !ok {
		return out, vendor
	}
	for i := 0; i < count; i++ {
		length, ok := readU32()
		if !ok || length < 0 || pos+length > len(body) {
			return out, vendor
		}
		text := string(body[pos : pos+length])
		pos += length
		eq := strings.Index(text, "=")
		if eq <= 0 {
			continue
		}
		out = append(out, [2]string{text[:eq], text[eq+1:]})
	}
	return out, vendor
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

// setVorbisFieldIfAny 与 setVorbisField 相同，但值为空时**原样返回**。
//
// 空值的语义是「这一项没提取出来」，不是「把用户的标题删掉」——
// 两者混起来会让一次 AI 整理把文件里正确的 TITLE / ARTIST 清空。
func setVorbisFieldIfAny(comments [][2]string, key, value string) [][2]string {
	value = strings.TrimSpace(value)
	if value == "" {
		return comments
	}
	return setVorbisField(comments, key, value)
}

// vendorString 是写入 VORBIS_COMMENT 的编码器标识。
// 只在**原文件没有 vendor**（或解析不出来）时才用它，否则保留原值 ——
// 强行改写会把「这个文件是谁写的 / 被谁处理过」的线索抹掉。
const vendorString = "LMPlayer"

// buildVorbisCommentWithVendor 拼 VORBIS_COMMENT 块体。
// vendor 为空时使用本项目的标识。
func buildVorbisCommentWithVendor(comments [][2]string, vendor string) []byte {
	if strings.TrimSpace(vendor) == "" {
		vendor = vendorString
	}
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
	be32(0)                  // 描述长度 0
	be32(0)                  // 宽（未知）
	be32(0)                  // 高（未知）
	be32(0)                  // 色深（未知）
	be32(0)                  // 索引色数量（未知）
	be32(uint32(len(cover))) // 图片数据长度
	out = append(out, cover...)
	return out
}

/* --------------------------------------------------------------------------
   写盘
   -------------------------------------------------------------------------- */

// writeFileAtomic 写临时文件再改名，尽量保留原文件权限。
//
// ★ 与 atomicfile.Write 的关键区别：**没有「直接覆盖写」的回退**。
//
// atomicfile.Write 在 rename 连续失败后会退回 os.WriteFile(path, ...)，
// 那是 O_TRUNC 的非原子覆盖 —— 对配置文件可以接受，但这里的 path 是
// **用户的音乐文件**：一旦在覆盖过程中失败（断电、磁盘满、进程被杀），
// 用户得到的是一个被截断的、无法播放的文件，且原内容不可恢复。
// 「宁可这次写不进去」远比「可能把用户的歌毁掉」正确。
//
// 因此这里保留的是 atomicfile 的**退避重试**（Windows 上杀软 / 索引器 /
// 另一个写者会瞬时占用目标文件，返回 ERROR_ACCESS_DENIED /
// ERROR_SHARING_VIOLATION，重试几次即可成功），但**去掉**非原子回退。
//
// 另外两点修复：
//   - path 是符号链接时（用户用 symlink 管理音乐库），rename 会把链接本身
//     替换成普通文件、切断链接；现在先 EvalSymlinks 解析出真实目标再写。
//   - 覆盖前先留一份 <name>.bak：写坏了还能让用户捞回来。
func writeFileAtomic(path string, data []byte) error {
	// 符号链接：写真实目标，别把链接替换掉
	target := path
	if resolved, err := filepath.EvalSymlinks(path); err == nil && resolved != "" {
		target = resolved
	}

	dir := filepath.Dir(target)
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
	if info, err := os.Stat(target); err == nil {
		_ = os.Chmod(tmpName, info.Mode())
	}

	// 覆盖前留备份。只在第一次覆盖时留（不覆盖已有 .bak），
	// 这样用户拿到的永远是「改动之前的那一份原始文件」。
	backup := target + ".bak"
	if _, err := os.Stat(backup); os.IsNotExist(err) {
		if err := copyFile(target, backup); err != nil {
			// 备份失败就不写：宁可这次不写回标签，也不能在没有退路的情况下改用户文件
			return fmt.Errorf("创建备份失败，已放弃写入以免损坏文件: %w", err)
		}
	}

	// rename 的退避重试（与 internal/atomicfile 同一套参数：5,10,…,40ms，
	// 累计约 180ms）。**注意：重试全部失败后直接返回错误，不做非原子覆盖。**
	var lastErr error
	for attempt := 0; attempt < renameAttempts; attempt++ {
		if err := os.Rename(tmpName, target); err == nil {
			return nil
		} else {
			lastErr = err
		}
		time.Sleep(time.Duration(attempt+1) * renameBackoffBase)
	}
	return fmt.Errorf("替换原文件失败（已保留备份 %s）: %w", filepath.Base(backup), lastErr)
}

// copyFile 复制文件（备份用）。读失败 / 写失败都算失败。
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		_ = os.Remove(dst)
		return err
	}
	if err := out.Sync(); err != nil {
		_ = out.Close()
		_ = os.Remove(dst)
		return err
	}
	return out.Close()
}
