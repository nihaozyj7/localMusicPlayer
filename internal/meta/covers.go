package meta

// 读取音频文件里的**全部**内嵌封面。
//
// 为什么不能只用 github.com/dhowden/tag 的 Picture()：
// 那个接口的定义就是「返回一张图片」（`Picture() *Picture`），
// 多张封面（正面 / 背面 / 盘面，或者用户自己写回去的多张）它只会给你第一张，
// 而我们的界面要能把它们都列出来给用户挑。所以这里自己解析容器格式。
//
// 设计原则和 meta.go 一致：**任何一步失败都只降级**。
// 封面读不出来最多是列表里少几项，绝不能让一首坏文件把整次浏览打断，
// 也绝不 panic —— 输入的是用户手里各种来路的文件，字节布局不能想当然。

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"

	"github.com/dhowden/tag"
)

// Picture 文件里的一张内嵌图片。
type Picture struct {
	MIME string
	Data []byte
}

const (
	// maxPictures 一次最多返回多少张内嵌封面。
	//
	// 内嵌图会被转成 data URL 发给前端，一张几百 KB 的话 12 张就是好几 MB。
	// 正常情况下文件里不会有超过「正面 + 背面 + 盘面」这么多张，
	// 真有异常文件也不至于把内存和界面拖垮。
	maxPictures = 12
)

// ReadPictures 读取音频文件里所有的内嵌封面。
//
// 读不到（格式不支持、没有封面、文件坏了）就返回空切片，不返回错误 ——
// 调用方（封面列表）只关心「有几张」，没有就是没有。
func ReadPictures(path string) []Picture {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	if len(raw) == 0 {
		return nil
	}

	var pics []Picture
	switch strings.ToLower(strings.TrimPrefix(filepath.Ext(path), ".")) {
	case "flac":
		pics = readPicturesFLAC(raw)
	case "m4a", "mp4", "m4b", "alac", "aac":
		pics = readPicturesMP4(raw)
	case "mp3":
		pics = readPicturesMP3(raw)
	}

	// 兜底：自己解析到 0 张时，退回到 dhowden/tag 的「第一张封面」。
	//
	// 为什么值得兜底：ID3 的变体非常多（unsynchronisation、扩展头、
	// 非标准编码的描述串…），自己写的 APIC 扫描总会有漏网之鱼；
	// 而扫描曲库时 meta.Read 用的就是这个库，它认得的我们至少也该认出来一张。
	if len(pics) == 0 {
		if pic := readPictureFallback(path); pic != nil {
			pics = append(pics, *pic)
		}
	}

	out := make([]Picture, 0, len(pics))
	for _, p := range pics {
		if len(p.Data) == 0 || len(p.Data) > maxCoverBytes {
			continue
		}
		mime := strings.TrimSpace(p.MIME)
		if mime == "" || !strings.HasPrefix(strings.ToLower(mime), "image/") {
			mime = sniffImageMIME(p.Data)
		}
		out = append(out, Picture{MIME: mime, Data: p.Data})
		if len(out) >= maxPictures {
			break
		}
	}
	return out
}

// readPictureFallback 用第三方库取一张封面（读不到返回 nil）。
//
// 返回值刻意是 *Picture 而不是 Picture：nil 才有「没有」这个含义。
func readPictureFallback(path string) *Picture {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	m, err := tag.ReadFrom(f)
	if err != nil || m == nil {
		return nil
	}
	pic := m.Picture()
	if pic == nil || len(pic.Data) == 0 {
		return nil
	}
	return &Picture{MIME: pic.MIMEType, Data: pic.Data}
}

// sniffImageMIME 按魔数判断图片类型（索引/标签里没写类型时的兜底）。
func sniffImageMIME(b []byte) string {
	switch {
	case len(b) >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF:
		return "image/jpeg"
	case len(b) >= 8 && string(b[0:8]) == "\x89PNG\r\n\x1a\n":
		return "image/png"
	case len(b) >= 12 && string(b[0:4]) == "RIFF" && string(b[8:12]) == "WEBP":
		return "image/webp"
	case len(b) >= 6 && (string(b[0:6]) == "GIF87a" || string(b[0:6]) == "GIF89a"):
		return "image/gif"
	case len(b) >= 12 && string(b[4:12]) == "ftypavif":
		return "image/avif"
	case len(b) >= 2 && b[0] == 'B' && b[1] == 'M':
		return "image/bmp"
	}
	return "image/jpeg"
}

/* --------------------------------------------------------------------------
   FLAC：遍历全部 PICTURE block
   --------------------------------------------------------------------------
   结构：`fLaC` + 若干 metadata block + 音频帧。
   每个 block 头 4 字节：1 字节（最后一块的标志 | 类型）+ 3 字节大端长度。
   类型 6 = PICTURE。PICTURE 内容（全是**大端**）：
     类型(4) | MIME 长度(4) + MIME | 描述长度(4) + 描述 |
     宽(4) 高(4) 色深(4) 索引色数(4) | 图片数据长度(4) + 图片数据
   一个 block 一张图，所以「多张封面」在 FLAC 里天然就是多个 PICTURE block。
   -------------------------------------------------------------------------- */

func readPicturesFLAC(raw []byte) []Picture {
	if len(raw) < 4 || string(raw[0:4]) != "fLaC" {
		return nil
	}
	var out []Picture
	for off := 4; off+4 <= len(raw); {
		header := raw[off]
		last := header&0x80 != 0
		kind := header & 0x7F
		length := int(raw[off+1])<<16 | int(raw[off+2])<<8 | int(raw[off+3])
		off += 4
		// 长度越界说明文件被截断/损坏：直接停，别读越界
		if length < 0 || off+length > len(raw) {
			break
		}
		if kind == 6 { // PICTURE
			if p, ok := parseFLACPicture(raw[off : off+length]); ok {
				out = append(out, p)
			}
		}
		off += length
		if last {
			break
		}
	}
	return out
}

// parseFLACPicture 解析一个 PICTURE block 的内容。
//
// 注意宽容处理：宽高/色深这些字段很多写入器会填 0，甚至有些写入器
// 在图片数据之后还塞了自己的私有尾巴，所以只按长度取数据、不管尾巴。
func parseFLACPicture(body []byte) (Picture, bool) {
	pos := 0
	readU32 := func() (int, bool) {
		if pos+4 > len(body) {
			return 0, false
		}
		v := int(binary.BigEndian.Uint32(body[pos : pos+4]))
		pos += 4
		return v, true
	}
	readStr := func() (string, bool) {
		n, ok := readU32()
		if !ok || n < 0 || pos+n > len(body) {
			return "", false
		}
		s := string(body[pos : pos+n])
		pos += n
		return s, true
	}

	if _, ok := readU32(); !ok { // 图片类型（3 = 封面正面），这里不区分
		return Picture{}, false
	}
	mime, ok := readStr()
	if !ok {
		return Picture{}, false
	}
	if _, ok := readStr(); !ok { // 描述
		return Picture{}, false
	}
	for i := 0; i < 4; i++ { // 宽 / 高 / 色深 / 索引色数
		if _, ok := readU32(); !ok {
			return Picture{}, false
		}
	}
	n, ok := readU32()
	if !ok || n <= 0 || pos+n > len(body) {
		return Picture{}, false
	}
	return Picture{MIME: mime, Data: body[pos : pos+n]}, true
}

/* --------------------------------------------------------------------------
   MP4 / M4A：moov > udta > meta > ilst 下的全部 covr
   --------------------------------------------------------------------------
   同一张封面有两种合法写法，两种都要认：
     1. 一个 covr box 里放**多个** data box（iTunes 早期就是这么写的）；
     2. 多个并列的 covr box，每个一个 data box（我们的 EmbedCovers 用这种）。
   data box 的头 8 字节是「版本(1) + 类型(3)」，类型 13 = JPEG、14 = PNG、
   27 = BMP；有些文件这里写 0（implicit），那就按魔数嗅探。
   -------------------------------------------------------------------------- */

func readPicturesMP4(raw []byte) []Picture {
	// 只下钻这三个容器就够：封面只可能在这里。做**限定深度**的递归而不是
	// 全文件乱搜，是为了避免把 mdat 里的音频/视频字节当成 box 解析 —— 那
	// 正是「covr 读到错位字节」的经典成因（见 embed.go 里的长注释）。
	moov, ok := mp4Child(raw, 0, len(raw), "moov")
	if !ok {
		return nil
	}
	udta, ok := mp4Child(raw, moov.body, moov.end, "udta")
	if !ok {
		return nil
	}
	meta, ok := mp4Child(raw, udta.body, udta.end, "meta")
	if !ok {
		return nil
	}
	// meta 是「完整 box」：4 字节版本/标志之后才是子 box
	inner := meta.body + 4
	if inner > meta.end {
		return nil
	}
	ilst, ok := mp4Child(raw, inner, meta.end, "ilst")
	if !ok {
		return nil
	}
	// mp4Child 返回的 body 是**载荷**起始（已跳过 box 头）。ilst 的载荷
	// 本身就是「一串子 box」，所以子 box 直接从 body 开始遍历 ——
	// 这里踩过一次：写成 body-8 会把 ilst 自己的 box 头当成第一个条目，
	// 于是 size=980 / type=ilst 不匹配 covr，循环第一次就 break，
	// 读到 0 张。而兜底逻辑又会从 dhowden/tag 补一张进来，
	// 表现得像「库只给一张」，其实是自己一个都没读到。
	return mp4PicturesFromIlst(raw, ilst.body, ilst.end)
}

// mp4PicturesFromIlst 遍历 ilst 的所有条目，取其中的 covr。
func mp4PicturesFromIlst(raw []byte, from, to int) []Picture {
	var out []Picture
	for off := from; off+8 <= to; {
		size := int(binary.BigEndian.Uint32(raw[off : off+4]))
		if size < 8 || off+size > to {
			break
		}
		if string(raw[off+4:off+8]) == "covr" {
			out = append(out, mp4PicturesFromCovr(raw, off+8, off+size)...)
		}
		off += size
	}
	return out
}

// mp4PicturesFromCovr 取出一个 covr 里的全部 data box
// （同一个 covr 里放多张图也是合法的，必须逐个数）。
//
// 关于「data box 声明的长度比 covr 里剩下的字节多」：这不是假设，是**真实存在**
// 的写法。本仓库旧版的 buildCovrPayload 就把长度写成 len(cover)+20（多 4 字节），
// 于是 covr 体内的 data box 全都超出自己的容器；dhowden/tag 不校验嵌套长度所以
// 一直没暴雷，但按长度遍历的解析器会读到错位字节。
//
// 处理策略是**宽容**：只有当剩余字节 >= data box 头时才尝试解析，
// 并且把可读范围夹到容器末尾。这样超长的（历史/第三方）与规整的文件都能读，
// 也不会因为一个坏长度把后面的封面全丢掉。
func mp4PicturesFromCovr(raw []byte, from, to int) []Picture {
	var out []Picture
	for off := from; off+8 <= to; {
		size := int(binary.BigEndian.Uint32(raw[off : off+4]))
		if size < 8 {
			break
		}
		if string(raw[off+4:off+8]) == "data" {
			end := off + size
			if end > to {
				end = to // 夹取：信封比容器长，就按容器可读范围解析
			}
			if p, ok := parseMP4DataBox(raw[off:end]); ok {
				out = append(out, p)
			}
		}
		if off+size > to {
			// 长度已经不靠谱了，继续遍历只会读到垃圾
			break
		}
		off += size
	}
	return out
}

// parseMP4DataBox 解析一个 data box：8 字节头 + 4 字节「版本(1) + 类型(3)」
// + 4 字节 locale + 载荷。
//
// 类型字段在 box 内偏移 1..3（偏移 0 是版本号，永远是 0），
// 这一点写错过一次：按偏移 0 读会把「版本 0 + 类型高字节」当成类型，
// 于是所有封面都被嗅探成 JPEG（testCover 造的是 JPEG 魔数，测不出差别），
// 直到用 PNG 内容才暴露出来。
func parseMP4DataBox(b []byte) (Picture, bool) {
	const head = 16 // 8(box) + 4(版本/类型) + 4(locale)
	if len(b) < head {
		return Picture{}, false
	}
	dataType := uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
	payload := b[head:]
	if len(payload) == 0 {
		return Picture{}, false
	}
	mime := ""
	switch dataType {
	case 13:
		mime = "image/jpeg"
	case 14:
		mime = "image/png"
	case 27:
		mime = "image/bmp"
	}
	if mime == "" {
		mime = sniffImageMIME(payload)
	}
	return Picture{MIME: mime, Data: payload}, true
}

// mp4Box 一个 box 在文件里的位置。
type mp4Box struct {
	body int // 载荷起始偏移
	end  int // box 结束偏移（载荷结束）
}

// mp4Child 在 [from,to) 里找第一个指定类型的直接子 box。
//
// 防越界是重点：传进来的 from/to 全部来自文件自身的 size 字段，
// 上一个 box 的 size 一旦是垃圾值，任何一次切片都可能 panic。
func mp4Child(raw []byte, from, to int, kind string) (mp4Box, bool) {
	if from < 0 || to > len(raw) {
		return mp4Box{}, false
	}
	for off := from; off+8 <= to; {
		size := int(binary.BigEndian.Uint32(raw[off : off+4]))
		header := 8
		if size == 1 { // 64 位长度
			if off+16 > to {
				return mp4Box{}, false
			}
			size = int(binary.BigEndian.Uint64(raw[off+8 : off+16]))
			header = 16
		} else if size == 0 { // 一直到文件末尾
			size = to - off
		}
		if size < header || off+size > to {
			return mp4Box{}, false
		}
		if string(raw[off+4:off+8]) == kind {
			return mp4Box{body: off + header, end: off + size}, true
		}
		off += size
	}
	return mp4Box{}, false
}

/* --------------------------------------------------------------------------
   MP3：ID3v2 里的全部 APIC 帧
   --------------------------------------------------------------------------
   ID3v2 头 10 字节：`ID3` + 版本(2) + 标志(1) + 大小(4，**syncsafe**：每字节
   只用低 7 位)。帧：ID(4) + 大小(4) + 标志(2) + 内容。APIC 的内容是：
     文本编码(1) | MIME(以 0 结尾的 ASCII) | 图片类型(1) |
     描述(按文本编码，以 0 结尾) | 图片数据（一直到帧尾）
   -------------------------------------------------------------------------- */

const id3HeaderSize = 10

func readPicturesMP3(raw []byte) []Picture {
	if len(raw) < id3HeaderSize || string(raw[0:3]) != "ID3" {
		return nil
	}
	version := raw[3]
	flags := raw[4]
	// syncsafe：每字节 7 位有效，所以 4 字节能表示的最大值是 2^28-1
	size := syncSafeSize(raw[6:10])
	if size <= 0 {
		return nil
	}
	if id3HeaderSize+size > len(raw) {
		// 标签长度超过文件本身：文件被截断，按文件剩余长度尽力而为
		size = len(raw) - id3HeaderSize
	}
	body := raw[id3HeaderSize : id3HeaderSize+size]

	// 全局 unsynchronisation：写入方把 0xFF 00 的所有 00 都删掉、并在每个
	// 0xFF 后面补一个 00。这里做一次还原，否则图片数据会被解出错误的字节。
	if flags&0x80 != 0 {
		body = undoUnsynchronisation(body)
	}

	pos := 0
	// 扩展头：标志位 0x40，长度紧跟在头后面。这里只做「跳过」的宽容处理 ——
	// 我们不需要扩展头里的任何信息，别为了它把整个解析搞复杂。
	if flags&0x40 != 0 {
		if len(body) < 4 {
			return nil
		}
		extSize := 0
		if version >= 4 {
			extSize = syncSafeSize(body[0:4]) // v2.4 也是 syncsafe
		} else {
			extSize = int(binary.BigEndian.Uint32(body[0:4]))
		}
		if extSize < 0 || extSize > len(body) {
			return nil
		}
		pos = extSize
	}

	var out []Picture
	for pos+10 <= len(body) {
		id := string(body[pos : pos+4])
		frameSize := 0
		if version >= 4 {
			frameSize = syncSafeSize(body[pos+4 : pos+8])
		} else {
			frameSize = int(binary.BigEndian.Uint32(body[pos+4 : pos+8]))
		}
		if frameSize <= 0 {
			// 帧长为 0 或负数 = 已经到 padding（全 0）或者字节错位，收工
			break
		}
		start := pos + 10
		end := start + frameSize
		if end > len(body) {
			break
		}
		if id == "APIC" {
			if p, ok := parseAPICFrame(body[start:end], version); ok {
				out = append(out, p)
			}
		}
		pos = end
	}
	return out
}

// syncSafeSize 解析 ID3 的 syncsafe 长度（每字节只用低 7 位）。
func syncSafeSize(b []byte) int {
	if len(b) < 4 {
		return 0
	}
	return int(b[0]&0x7F)<<21 | int(b[1]&0x7F)<<14 | int(b[2]&0x7F)<<7 | int(b[3]&0x7F)
}

// undoUnsynchronisation 还原 ID3 的 unsynchronisation（把 0xFF 00 变回 0xFF）。
//
// 宽容之处：如果 0xFF 后面不是 0x00，就原样保留 —— 说明这个写入器
// 其实没做 unsynchronisation（标志位写错了），硬按规则解会吃掉真实的字节。
func undoUnsynchronisation(b []byte) []byte {
	if !bytes.Contains(b, []byte{0xFF, 0x00}) {
		return b
	}
	out := make([]byte, 0, len(b))
	for i := 0; i < len(b); i++ {
		out = append(out, b[i])
		if b[i] == 0xFF && i+1 < len(b) && b[i+1] == 0x00 {
			i++ // 跳过被插入的 0x00
		}
	}
	return out
}

// parseAPICFrame 解析一个 APIC 帧的内容。
func parseAPICFrame(b []byte, version byte) (Picture, bool) {
	if len(b) < 4 {
		return Picture{}, false
	}
	enc := b[0]
	pos := 1

	// MIME：Latin-1 的 0 结尾串（v2.2 的 PIC 帧是 3 字符图片格式，这里不处理，
	// 因为「PIC」这个 ID 我们不认，走不到这个函数）
	nul := bytes.IndexByte(b[pos:], 0)
	if nul < 0 {
		return Picture{}, false
	}
	mime := string(b[pos : pos+nul])
	pos += nul + 1

	if pos >= len(b) { // 图片类型 1 字节
		return Picture{}, false
	}
	pos++

	// 描述串：按文本编码结束（UTF-16 是 2 字节的 0）
	descEnd, ok := id3TextEnd(b[pos:], enc)
	if !ok {
		return Picture{}, false
	}
	pos += descEnd
	if pos >= len(b) {
		return Picture{}, false
	}
	return Picture{MIME: mime, Data: b[pos:]}, true
}

// id3TextEnd 返回按文本编码计算的字符串结束位置（含终止符）。
//
// 只用来「跳过描述串」，所以宽字符编码只需要找双字节 0 即可。
func id3TextEnd(b []byte, enc byte) (int, bool) {
	switch enc {
	case 0: // ISO-8859-1
		i := bytes.IndexByte(b, 0)
		if i < 0 {
			return 0, false
		}
		return i + 1, true
	case 1, 2: // UTF-16（带/不带 BOM）
		for i := 0; i+1 < len(b); i += 2 {
			if b[i] == 0 && b[i+1] == 0 {
				return i + 2, true
			}
		}
		return 0, false
	default: // UTF-8 等单字节编码
		i := bytes.IndexByte(b, 0)
		if i < 0 {
			return 0, false
		}
		return i + 1, true
	}
}
