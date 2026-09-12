// Package meta 读取音频文件的元数据（标题、歌手、专辑、时长、内嵌封面）。
//
// 设计要点：
//   - 标签解析用 github.com/dhowden/tag（纯 Go，支持 mp3/m4a/flac/ogg）；
//   - 时长解析自己写（各格式取头部信息，只读几 KB），避免引入大型解码依赖；
//   - 任何一步失败都只降级（时长 0、封面空），绝不让单首坏文件中断整次扫描。
package meta

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/dhowden/tag"
)

// Info 一首歌的元数据
type Info struct {
	Title      string
	Artist     string
	Album      string
	DurationMS int64
	SampleRate int
	Bitrate    int
	CoverDataURL string
}

const maxCoverBytes = 4 << 20 // 单张封面最大 4MB，避免配置/内存被撑爆

// Read 读取元数据；path 必须存在
func Read(path string) Info {
	info := Info{}
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))

	// 1) 标签与封面
	if f, err := os.Open(path); err == nil {
		defer f.Close()
		if m, err := tag.ReadFrom(f); err == nil {
			info.Title = strings.TrimSpace(m.Title())
			info.Artist = strings.TrimSpace(m.Artist())
			info.Album = strings.TrimSpace(m.Album())
			if pic := m.Picture(); pic != nil && len(pic.Data) > 0 && len(pic.Data) <= maxCoverBytes {
				mime := pic.MIMEType
				if mime == "" {
					mime = "image/jpeg"
				}
				info.CoverDataURL = fmt.Sprintf("data:%s;base64,%s", mime, base64.StdEncoding.EncodeToString(pic.Data))
			}
		}
	}

	// 2) 时长 / 采样率 / 码率
	var d durationInfo
	switch ext {
	case "mp3":
		d = mp3Duration(path)
	case "flac":
		d = flacDuration(path)
	case "wav", "aiff", "aif":
		d = wavDuration(path)
	case "m4a", "mp4", "alac", "aac":
		d = mp4Duration(path)
	}
	info.DurationMS = d.durationMS
	info.SampleRate = d.sampleRate
	info.Bitrate = d.bitrate

	// 3) 兜底：用「比特率估算」补时长（只对 CBR 有效，作为最后手段）
	if info.DurationMS == 0 {
		if st, err := os.Stat(path); err == nil && info.Bitrate > 0 {
			info.DurationMS = st.Size() * 8 * 1000 / int64(info.Bitrate)
		}
	}
	return info
}

type durationInfo struct {
	durationMS int64
	sampleRate int
	bitrate    int
}

/* --------------------------------------------------------------------------
   MP3：优先读 Xing/Info 帧（VBR 准确），否则按帧数累加
   -------------------------------------------------------------------------- */

func mp3Duration(path string) durationInfo {
	f, err := os.Open(path)
	if err != nil {
		return durationInfo{}
	}
	defer f.Close()

	header := make([]byte, 16*1024)
	n, _ := io.ReadFull(f, header)
	header = header[:n]

	idx := findFrameSync(header)
	if idx < 0 {
		return durationInfo{}
	}

	// 解析第一帧头
	frame, ok := parseMP3Frame(header[idx:])
	if !ok {
		return durationInfo{}
	}

	// Xing / Info 头（位于第一帧内，偏移随声道模式变化）
	if xing := parseXing(header[idx:], frame); xing.frames > 0 && frame.sampleRate > 0 {
		// 每帧固定 1152 个采样（MPEG1 Layer3）或 576（MPEG2/2.5）
		samplesPerFrame := 1152
		if frame.version != 1 {
			samplesPerFrame = 576
		}
		ms := int64(xing.frames) * int64(samplesPerFrame) * 1000 / int64(frame.sampleRate)
		bitrate := 0
		if ms > 0 {
			if st, err := os.Stat(path); err == nil {
				bitrate = int(st.Size() * 8 / (ms / 1000))
			}
		}
		return durationInfo{durationMS: ms, sampleRate: frame.sampleRate, bitrate: bitrate}
	}

	// 无 Xing：从音频数据起点按帧累加（限制最多扫 12MB，兼顾准确与速度）
	if _, err := f.Seek(int64(idx), io.SeekStart); err != nil {
		return durationInfo{sampleRate: frame.sampleRate}
	}
	buf := make([]byte, 256*1024)
	var totalSamples int64
	var totalBytes int64
	var read int
	for read < 12<<20 {
		n, err := f.Read(buf)
		if n <= 0 {
			break
		}
		read += n
		totalBytes += int64(n)
		i := 0
		for i+4 <= n {
			fr, ok := parseMP3Frame(buf[i:])
			if !ok || fr.frameLen <= 0 {
				i++
				continue
			}
			samples := 1152
			if fr.version != 1 {
				samples = 576
			}
			totalSamples += int64(samples)
			i += fr.frameLen
		}
		if err != nil {
			break
		}
	}
	if frame.sampleRate == 0 || totalSamples == 0 {
		return durationInfo{}
	}
	ms := totalSamples * 1000 / int64(frame.sampleRate)
	bitrate := 0
	if ms > 0 {
		bitrate = int(totalBytes * 8 / (ms / 1000))
	}
	return durationInfo{durationMS: ms, sampleRate: frame.sampleRate, bitrate: bitrate}
}

func findFrameSync(b []byte) int {
	for i := 0; i+4 <= len(b); i++ {
		if b[i] == 0xFF && b[i+1]&0xE0 == 0xE0 {
			if _, ok := parseMP3Frame(b[i:]); ok {
				return i
			}
		}
	}
	return -1
}

type mp3Frame struct {
	version    int // 1 = MPEG1, 2 = MPEG2, 25 = MPEG2.5
	bitrate    int // kbps
	sampleRate int
	frameLen   int
}

var mp3BitrateTable = map[int][15]int{
	1:  {0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320},
	2:  {0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160},
	25: {0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160},
}

func parseMP3Frame(b []byte) (mp3Frame, bool) {
	if len(b) < 4 || b[0] != 0xFF || b[1]&0xE0 != 0xE0 {
		return mp3Frame{}, false
	}
	var version int
	switch (b[1] >> 3) & 0x03 {
	case 0: // MPEG 2.5
		version = 25
	case 1:
		return mp3Frame{}, false // reserved
	case 2:
		version = 2
	case 3:
		version = 1
	}
	layer := (b[1] >> 1) & 0x03
	if layer != 1 { // 只处理 Layer III
		return mp3Frame{}, false
	}
	bitrateIdx := int(b[2] >> 4)
	if bitrateIdx == 0 || bitrateIdx == 15 {
		return mp3Frame{}, false
	}
	sampleRateIdx := int((b[2] >> 2) & 0x03)
	if sampleRateIdx == 3 {
		return mp3Frame{}, false
	}
	baseRates := map[int][3]int{
		1:  {44100, 48000, 32000},
		2:  {22050, 24000, 16000},
		25: {11025, 12000, 8000},
	}
	sampleRate := baseRates[version][sampleRateIdx]
	bitrate := mp3BitrateTable[version][bitrateIdx]
	padding := int((b[2] >> 1) & 0x01)

	var frameLen int
	if version == 1 {
		frameLen = 144*bitrate*1000/sampleRate + padding
	} else {
		frameLen = 72*bitrate*1000/sampleRate + padding
	}
	if frameLen <= 4 {
		return mp3Frame{}, false
	}
	return mp3Frame{version: version, bitrate: bitrate, sampleRate: sampleRate, frameLen: frameLen}, true
}

type xingInfo struct {
	frames int
}

func parseXing(frame []byte, f mp3Frame) xingInfo {
	// 侧信息长度：MPEG1 单声道 17，其它 32 字节
	sideInfo := 32
	if f.version == 1 && len(frame) > 3 && ((frame[3]>>6)&0x03) == 3 {
		sideInfo = 17
	}
	offset := 4 + sideInfo
	if offset+8 > len(frame) {
		return xingInfo{}
	}
	tag := string(frame[offset : offset+4])
	if tag != "Xing" && tag != "Info" {
		return xingInfo{}
	}
	flags := int(frame[offset+4])<<24 | int(frame[offset+5])<<16 | int(frame[offset+6])<<8 | int(frame[offset+7])
	pos := offset + 8
	if flags&0x01 != 0 { // Frames 字段存在
		if pos+4 > len(frame) {
			return xingInfo{}
		}
		frames := int(frame[pos])<<24 | int(frame[pos+1])<<16 | int(frame[pos+2])<<8 | int(frame[pos+3])
		return xingInfo{frames: frames}
	}
	return xingInfo{}
}

/* --------------------------------------------------------------------------
   FLAC：STREAMINFO 块给出采样率与总采样数
   -------------------------------------------------------------------------- */

func flacDuration(path string) durationInfo {
	f, err := os.Open(path)
	if err != nil {
		return durationInfo{}
	}
	defer f.Close()

	head := make([]byte, 4+4+34)
	if _, err := io.ReadFull(f, head); err != nil {
		return durationInfo{}
	}
	if string(head[0:4]) != "fLaC" {
		return durationInfo{}
	}
	// 第一个元数据块必须是 STREAMINFO；块头 4 字节 + 数据 34 字节
	blockType := head[4] & 0x7F
	if blockType != 0 {
		return durationInfo{}
	}
	data := head[8 : 8+34]
	sampleRate := int(data[10])<<12 | int(data[11])<<4 | int(data[12])>>4
	totalSamples := int64(data[13]&0x0F)<<32 | int64(data[14])<<24 | int64(data[15])<<16 | int64(data[16])<<8 | int64(data[17])
	if sampleRate == 0 || totalSamples == 0 {
		return durationInfo{sampleRate: sampleRate}
	}
	ms := totalSamples * 1000 / int64(sampleRate)
	bitrate := 0
	if st, err := os.Stat(path); err == nil && ms > 0 {
		bitrate = int(st.Size() * 8 / (ms / 1000))
	}
	return durationInfo{durationMS: ms, sampleRate: sampleRate, bitrate: bitrate}
}

/* --------------------------------------------------------------------------
   WAV / AIFF：解析 RIFF 块
   -------------------------------------------------------------------------- */

func wavDuration(path string) durationInfo {
	f, err := os.Open(path)
	if err != nil {
		return durationInfo{}
	}
	defer f.Close()

	head := make([]byte, 64*1024)
	n, _ := io.ReadFull(f, head)
	head = head[:n]
	if n < 12 {
		return durationInfo{}
	}
	if string(head[0:4]) != "RIFF" && string(head[0:4]) != "FORM" {
		return durationInfo{}
	}

	var byteRate, sampleRate int
	var dataSize int64
	pos := 12
	for pos+8 <= n {
		id := string(head[pos : pos+4])
		size := int(int64(head[pos+4]) | int64(head[pos+5])<<8 | int64(head[pos+6])<<16 | int64(head[pos+7])<<24)
		body := pos + 8
		switch id {
		case "fmt ":
			if body+16 <= n {
				sampleRate = int(head[body+4]) | int(head[body+5])<<8 | int(head[body+6])<<16 | int(head[body+7])<<24
				byteRate = int(head[body+8]) | int(head[body+9])<<8 | int(head[body+10])<<16 | int(head[body+11])<<24
			}
		case "data":
			if size > 0 {
				dataSize = int64(size)
			} else if st, err := os.Stat(path); err == nil {
				dataSize = st.Size() - int64(body)
			}
		case "COMM": // AIFF
			if body+18 <= n {
				// 80-bit 扩展浮点采样率，简化处理：直接跳过，用 SSND 大小 + 通道估算不可靠
				sampleRate = 0
			}
		}
		if size <= 0 {
			break
		}
		pos = body + size + (size & 1)
		if pos <= body {
			break
		}
	}

	if byteRate <= 0 || dataSize <= 0 {
		return durationInfo{sampleRate: sampleRate}
	}
	ms := dataSize * 1000 / int64(byteRate)
	return durationInfo{durationMS: ms, sampleRate: sampleRate, bitrate: byteRate * 8 / 1000}
}

/* --------------------------------------------------------------------------
   MP4 / M4A：遍历 atom 找 moov/mvhd
   -------------------------------------------------------------------------- */

// mp4Duration 解析 MP4/M4A 的时长与采样率。
//
// mvhd box 结构（body 从 "mvhd" 之后的 4 字节开始）：
//
//	version(1) flags(3)
//	[v0] creation(4) modification(4) timescale(4) duration(4)
//	[v1] creation(8) modification(8) timescale(4) duration(8)
//
// 采样率不能用 timescale —— 那是时间刻度（常见 1000 / 44100 / 90000），
// 与音频采样率不是一回事。真正的采样率在 stsd → mp4a 采样描述里。
func mp4Duration(path string) durationInfo {
	f, err := os.Open(path)
	if err != nil {
		return durationInfo{}
	}
	defer f.Close()

	head := make([]byte, 2<<20) // mvhd 一般在文件头部；必要时下面会扩大读取
	n, _ := io.ReadFull(f, head)
	head = head[:n]

	ms := mp4DurationFromMvhd(head)
	sampleRate := mp4SampleRate(head)

	// mvhd 不在头部 2MB 内（少数文件 moov 在尾部）：整体再读一次
	if ms == 0 {
		if st, err := os.Stat(path); err == nil && st.Size() > int64(len(head)) && st.Size() <= 64<<20 {
			whole := make([]byte, st.Size())
			if _, err := f.ReadAt(whole, 0); err == nil {
				ms = mp4DurationFromMvhd(whole)
				if sampleRate == 0 {
					sampleRate = mp4SampleRate(whole)
				}
			}
		}
	}

	bitrate := 0
	if st, err := os.Stat(path); err == nil && ms > 0 {
		bitrate = int(st.Size() * 8 / (ms / 1000))
	}
	return durationInfo{durationMS: ms, sampleRate: sampleRate, bitrate: bitrate}
}

// mp4DurationFromMvhd 从 mvhd box 计算时长（毫秒）；失败返回 0
func mp4DurationFromMvhd(buf []byte) int64 {
	// 遍历所有 mvhd（正常只有一个，避免误命中其它数据里的同名字节）
	for offset := 0; ; {
		rel := bytes.Index(buf[offset:], []byte("mvhd"))
		if rel < 0 {
			return 0
		}
		body := offset + rel + 4 // 指向 version 字节
		offset = body

		if body+4 > len(buf) {
			return 0
		}
		version := buf[body]

		var timescale uint32
		var duration uint64
		switch version {
		case 0:
			// version/flags(4) + creation(4) + modification(4) = 12
			p := body + 12
			if p+8 > len(buf) {
				return 0
			}
			timescale = be32(buf[p : p+4])
			duration = uint64(be32(buf[p+4 : p+8]))
		case 1:
			// version/flags(4) + creation(8) + modification(8) = 20
			p := body + 20
			if p+12 > len(buf) {
				return 0
			}
			timescale = be32(buf[p : p+4])
			duration = be64(buf[p+4 : p+12])
		default:
			continue
		}

		// 合理性校验：时间刻度过小/过大都说明偏移不对
		if timescale < 100 || timescale > 1_000_000 || duration == 0 {
			continue
		}
		ms := int64(duration) * 1000 / int64(timescale)
		if ms <= 0 || ms > 24*3600*1000 {
			continue
		}
		return ms
	}
}

// mp4SampleRate 取音频采样率。
//
// 不能只读 AudioSampleEntry 里那个 16.16 定点字段：实测有一批 m4a
// （iTunes/HE-AAC 封装）那里填的是 0，真实采样率只存在于 esds →
// DecoderConfigDescriptor → AudioSpecificConfig 里。
// 因此优先级为：AudioSpecificConfig（权威）→ AudioSampleEntry（兜底）。
func mp4SampleRate(buf []byte) int {
	if rate := aacSampleRate(buf); rate > 0 {
		return rate
	}
	return sampleEntryRate(buf)
}

// aacSampleRateTable AAC 采样率索引表（AudioSpecificConfig 用）
var aacSampleRateTable = [16]int{
	96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050,
	16000, 12000, 11025, 8000, 7350, 0, 0, 0,
}

// aacSampleRate 解析 esds 描述符链，从 AudioSpecificConfig 取采样率。
//
// 关键点：esds 的每个描述符长度是「变长」的，最高位为续读标志，
// 例如 DecoderSpecificInfo 常见写作 05 80 80 80 25（长度 0x25）。
// 只读一个长度字节会让指针偏 3 字节，从而解出完全错误的 ASC
// （实测会把 44100 的曲子读成 96000）。
func aacSampleRate(buf []byte) int {
	idx := bytes.Index(buf, []byte("esds"))
	if idx < 0 {
		return 0
	}
	body := idx + 4
	end := body + 512
	if end > len(buf) {
		end = len(buf)
	}
	if body >= end {
		return 0
	}
	return walkESDS(buf[body:end])
}

// walkESDS 逐层进入 ES_Descriptor → DecoderConfigDescriptor → DecoderSpecificInfo
func walkESDS(b []byte) int {
	// ES_Descriptor(0x03)
	payload, ok := findDescriptor(b, 0x03)
	if !ok {
		return 0
	}
	// 跳过 ES_ID(2) + flags(1)
	if len(payload) < 3 {
		return 0
	}
	payload = payload[3:]

	// DecoderConfigDescriptor(0x04)
	dc, ok := findDescriptor(payload, 0x04)
	if !ok {
		return 0
	}
	// 跳过 objectTypeIndication(1) + streamType/bufferSizeDB(4) + maxBitrate(4) + avgBitrate(4)
	if len(dc) < 13 {
		return 0
	}
	dc = dc[13:]

	// DecoderSpecificInfo(0x05) —— 内容就是 AudioSpecificConfig
	asc, ok := findDescriptor(dc, 0x05)
	if !ok || len(asc) < 2 {
		return 0
	}
	return parseAudioSpecificConfig(asc)
}

// findDescriptor 在 b 中定位 tag 描述符并返回其负载。
// 描述符长度是最多 4 字节的变长整数（每字节低 7 位有效，最高位为续读标志）。
func findDescriptor(b []byte, tag byte) ([]byte, bool) {
	for i := 0; i < len(b); i++ {
		if b[i] != tag {
			continue
		}
		length := 0
		j := i + 1
		for k := 0; k < 4; k++ {
			if j >= len(b) {
				return nil, false
			}
			length = length<<7 | int(b[j]&0x7F)
			j++
			if b[j-1]&0x80 == 0 {
				break
			}
		}
		if length < 0 || j+length > len(b) {
			continue
		}
		return b[j : j+length], true
	}
	return nil, false
}

// parseAudioSpecificConfig 解析 AudioSpecificConfig 的采样率
func parseAudioSpecificConfig(b []byte) int {
	if len(b) < 2 {
		return 0
	}
	// 前 2 字节 = 5 位 audioObjectType + 4 位 samplingFrequencyIndex + 3 位 channelConfiguration
	v := uint16(b[0])<<8 | uint16(b[1])
	objType := int(v >> 11)
	freqIndex := int(v>>7) & 0x0F

	if objType == 31 {
		// 扩展 objectType：再占 6 位，采样率索引随之后移
		if len(b) < 3 {
			return 0
		}
		v3 := uint32(b[0])<<16 | uint32(b[1])<<8 | uint32(b[2])
		freqIndex = int(v3>>9) & 0x0F
	}

	if freqIndex == 0x0F {
		// 显式频率：索引之后直接跟 24 位真实频率
		if len(b) < 5 {
			return 0
		}
		shift := uint(1)
		if objType == 31 {
			shift = 0
		}
		rate := int(uint32(b[1]&byte(0x7F>>(3-shift)))<<17 | uint32(b[2])<<9 | uint32(b[3])<<1 | uint32(b[4])>>7)
		if rate >= 8000 && rate <= 384_000 {
			return rate
		}
		return 0
	}

	if freqIndex < len(aacSampleRateTable) {
		return aacSampleRateTable[freqIndex]
	}
	return 0
}

// sampleEntryRate 从 AudioSampleEntry 的 16.16 / 32.32 定点字段兜底取采样率
func sampleEntryRate(buf []byte) int {
	candidates := []struct {
		off   int
		shift uint
		size  int
	}{
		{24, 16, 4}, // 标准：reserved(6)+dataRef(2)+ver/rev/vendor(8)+ch/size/pre/res(8)
		{28, 16, 4}, // 少数封装省略 pre_defined/reserved
		{40, 32, 8}, // QuickTime version 1/2 的 32.32
	}
	for _, tag := range [][]byte{[]byte("mp4a"), []byte("alac")} {
		for idx := 0; ; {
			rel := bytes.Index(buf[idx:], tag)
			if rel < 0 {
				break
			}
			body := idx + rel + 4
			idx = body
			for _, c := range candidates {
				p := body + c.off
				if p+c.size > len(buf) {
					continue
				}
				var raw uint64
				if c.size == 4 {
					raw = uint64(be32(buf[p : p+4]))
				} else {
					raw = be64(buf[p : p+8])
				}
				if rate := int(raw >> c.shift); rate >= 8000 && rate <= 384_000 {
					return rate
				}
			}
		}
	}
	return 0
}

func be16(b []byte) uint16 {
	return uint16(b[0])<<8 | uint16(b[1])
}

func be32(b []byte) uint32 {
	return uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
}

func be64(b []byte) uint64 {
	return uint64(be32(b))<<32 | uint64(be32(b[4:]))
}
