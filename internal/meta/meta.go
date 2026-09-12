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

func mp4Duration(path string) durationInfo {
	f, err := os.Open(path)
	if err != nil {
		return durationInfo{}
	}
	defer f.Close()

	head := make([]byte, 1<<20) // mvhd 一般在文件头部 1MB 内
	n, _ := io.ReadFull(f, head)
	head = head[:n]

	idx := bytes.Index(head, []byte("mvhd"))
	if idx < 0 || idx+4+20 > n {
		return durationInfo{}
	}
	body := idx + 4
	version := head[body]
	if version == 1 {
		if body+4+8+8+4 > n {
			return durationInfo{}
		}
		timescale := be32(head[body+4+8+8 : body+4+8+8+4])
		duration := be64(head[body+4+8+8+4 : body+4+8+8+4+8])
		if timescale == 0 {
			return durationInfo{}
		}
		ms := int64(duration) * 1000 / int64(timescale)
		return finishMP4(path, ms, int(timescale))
	}
	if body+4+4+4+4 > n {
		return durationInfo{}
	}
	timescale := be32(head[body+4+4+4 : body+4+4+4+4])
	duration := be32(head[body+4+4+4+4 : body+4+4+4+4+4])
	if timescale == 0 {
		return durationInfo{}
	}
	ms := int64(duration) * 1000 / int64(timescale)
	return finishMP4(path, ms, int(timescale))
}

func finishMP4(path string, ms int64, sampleRate int) durationInfo {
	bitrate := 0
	if st, err := os.Stat(path); err == nil && ms > 0 {
		bitrate = int(st.Size() * 8 / (ms / 1000))
	}
	return durationInfo{durationMS: ms, sampleRate: sampleRate, bitrate: bitrate}
}

func be32(b []byte) uint32 {
	return uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
}

func be64(b []byte) uint64 {
	return uint64(be32(b))<<32 | uint64(be32(b[4:]))
}
