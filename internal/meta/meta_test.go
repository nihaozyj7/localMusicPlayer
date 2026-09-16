package meta

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

/* --------------------------------------------------------------------------
   M4A / MP4 解析测试
   --------------------------------------------------------------------------
   这里用「合成 MP4」而不是真实音乐文件：把 mvhd 与 esds/AudioSpecificConfig
   按规范拼出来，就能在 CI 里稳定验证解析器，不依赖本机音乐库。
   -------------------------------------------------------------------------- */

// buildAudioSpecificConfig 生成 AAC 的 AudioSpecificConfig 头若干字节
func buildAudioSpecificConfig(objType, freqIndex, channels int) []byte {
	v := uint16(objType)<<11 | uint16(freqIndex)<<7 | uint16(channels)<<3
	return []byte{byte(v >> 8), byte(v), 0x56, 0xE5, 0x00}
}

// desc 生成一个描述符，长度按真实文件的 4 字节变长形式（80 80 80 XX）书写
func desc(tag byte, payload []byte) []byte {
	out := []byte{tag}
	length := len(payload)
	out = append(out,
		byte(0x80|(length>>21)&0x7F),
		byte(0x80|(length>>14)&0x7F),
		byte(0x80|(length>>7)&0x7F),
		byte(length&0x7F),
	)
	return append(out, payload...)
}

// box 生成一个 MP4 box（4 字节长度 + 4 字节类型 + 负载）
func box(typ string, payload []byte) []byte {
	out := make([]byte, 8+len(payload))
	binary.BigEndian.PutUint32(out, uint32(8+len(payload)))
	copy(out[4:8], typ)
	copy(out[8:], payload)
	return out
}

// buildM4A 拼出一个结构合法的 m4a 字节流：ftyp + moov(mvhd + stsd(mp4a(esds)))
func buildM4A(timescale uint32, duration uint32, asc []byte) []byte {
	var buf []byte

	ftyp := append([]byte("M4A "), 0, 0, 0, 0)
	ftyp = append(ftyp, []byte("M4A isom")...)
	buf = append(buf, box("ftyp", ftyp)...)

	// mvhd（version 0）：
	// version+flags(4) creation(4) modification(4) timescale(4) duration(4)
	mvhd := []byte{0, 0, 0, 0}
	tmp := make([]byte, 4)
	mvhd = append(mvhd, tmp...) // creation
	mvhd = append(mvhd, tmp...) // modification
	binary.BigEndian.PutUint32(tmp, timescale)
	mvhd = append(mvhd, tmp...)
	binary.BigEndian.PutUint32(tmp, duration)
	mvhd = append(mvhd, tmp...)
	mvhd = append(mvhd, make([]byte, 80)...)

	// esds：ES_Descriptor → DecoderConfigDescriptor → DecoderSpecificInfo(ASC)
	dcd := []byte{0x40, 0x15, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0}
	dcd = append(dcd, desc(0x05, asc)...)
	es := append([]byte{0x00, 0x01, 0x00}, desc(0x04, dcd)...)
	esds := desc(0x03, es)

	// AudioSampleEntry（mp4a）：采样率字段刻意填 0（真实文件里很常见）
	sample := make([]byte, 0, 64)
	sample = append(sample, 0, 0, 0, 0, 0, 0, 0, 1) // reserved + dataReferenceIndex
	sample = append(sample, 0, 0, 0, 0, 0, 0, 0, 0) // version/revision/vendor
	sample = append(sample, 0, 2, 0, 16)            // channels + sampleSize
	sample = append(sample, 0, 0, 0, 0)             // pre_defined + reserved
	sample = append(sample, 0, 0, 0, 0)             // samplerate = 0（故意的）
	sample = append(sample, box("esds", esds)...)
	stsd := append([]byte{0, 0, 0, 0, 0, 0, 0, 1}, box("mp4a", sample)...)

	buf = append(buf, box("moov", append(box("mvhd", mvhd), box("stsd", stsd)...))...)
	return buf
}

func writeFile(t *testing.T, name string, data []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestM4ADurationAndSampleRate(t *testing.T) {
	cases := []struct {
		name      string
		timescale uint32
		duration  uint32
		objType   int
		freqIndex int
		wantMS    int64
		wantRate  int
	}{
		{"44.1kHz/246秒", 1000, 246347, 2, 4, 246347, 44100},
		{"48kHz/180秒", 1000, 180000, 2, 3, 180000, 48000},
		{"96kHz/60秒", 1000, 60000, 2, 0, 60000, 96000},
		{"22.05kHz/30秒", 1000, 30000, 2, 7, 30000, 22050},
		{"8kHz/5秒", 1000, 5000, 2, 11, 5000, 8000},
		{"timescale=44100", 44100, 441000, 2, 4, 10000, 44100},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			asc := buildAudioSpecificConfig(c.objType, c.freqIndex, 2)
			data := buildM4A(c.timescale, c.duration, asc)
			path := writeFile(t, "test.m4a", data)

			got := mp4Duration(path)
			if got.durationMS != c.wantMS {
				t.Errorf("时长 = %dms，期望 %dms", got.durationMS, c.wantMS)
			}
			if got.sampleRate != c.wantRate {
				t.Errorf("采样率 = %dHz，期望 %dHz", got.sampleRate, c.wantRate)
			}
		})
	}
}

// TestM4ADurationVersion1 mvhd version 1 用 64 位 creation/modification/duration
func TestM4ADurationVersion1(t *testing.T) {
	// version+flags(4) creation(8) modification(8) timescale(4) duration(8)
	mvhd := make([]byte, 0, 64)
	mvhd = append(mvhd, 1, 0, 0, 0)
	mvhd = append(mvhd, make([]byte, 16)...)

	scale := make([]byte, 4)
	binary.BigEndian.PutUint32(scale, 44100)
	mvhd = append(mvhd, scale...)

	dur := make([]byte, 8)
	binary.BigEndian.PutUint64(dur, 44100*123) // 123 秒
	mvhd = append(mvhd, dur...)
	mvhd = append(mvhd, make([]byte, 32)...)

	t.Logf("夹具 mvhd 长度=%d body=% X", len(mvhd), mvhd[:32])

	data := box("moov", box("mvhd", mvhd))
	path := writeFile(t, "v1.m4a", data)

	// 先确认夹具布局正确，否则测的是夹具而不是解析器
	raw, _ := os.ReadFile(path)
	idx := strings.Index(string(raw), "mvhd")
	if idx < 0 {
		t.Fatal("夹具里没有 mvhd")
	}
	body := idx + 4
	if raw[body] != 1 {
		t.Fatalf("夹具 version = %d，期望 1", raw[body])
	}
	if got := binary.BigEndian.Uint32(raw[body+20 : body+24]); got != 44100 {
		t.Fatalf("夹具 timescale = %d，期望 44100（raw=% X）", got, raw[body:body+32])
	}
	if got := binary.BigEndian.Uint64(raw[body+24 : body+32]); got != 44100*123 {
		t.Fatalf("夹具 duration = %d，期望 %d（raw=% X）", got, 44100*123, raw[body:body+32])
	}

	got := mp4Duration(path)
	if got.durationMS != 123000 {
		t.Errorf("version 1 时长 = %dms，期望 123000ms", got.durationMS)
	}
}

// TestM4ASampleRateFromSampleEntry 当 esds 缺失时回退读 AudioSampleEntry
func TestM4ASampleRateFromSampleEntry(t *testing.T) {
	sample := make([]byte, 0, 32)
	sample = append(sample, 0, 0, 0, 0, 0, 0, 0, 1)
	sample = append(sample, 0, 0, 0, 0, 0, 0, 0, 0)
	sample = append(sample, 0, 2, 0, 16)
	sample = append(sample, 0, 0, 0, 0)
	rate := make([]byte, 4)
	binary.BigEndian.PutUint32(rate, 44100<<16) // 16.16 定点
	sample = append(sample, rate...)

	data := box("moov", box("stsd", append([]byte{0, 0, 0, 0, 0, 0, 0, 1}, box("mp4a", sample)...)))
	if got := mp4SampleRate(data); got != 44100 {
		t.Errorf("从 AudioSampleEntry 解析采样率 = %d，期望 44100", got)
	}
}

// TestParseAudioSpecificConfigBits 位域解析必须精确。
// 曾经的 bug：esds 变长长度只读一个字节，导致 ASC 指针偏 3 字节，
// 把 44100 的曲子解成 96000。
func TestParseAudioSpecificConfigBits(t *testing.T) {
	cases := []struct {
		name     string
		asc      []byte
		wantRate int
	}{
		{"LC 44100 立体声", []byte{0x12, 0x10, 0x56, 0xE5, 0x00}, 44100},
		{"LC 96000 立体声", []byte{0x10, 0x10, 0x56, 0xE5, 0x00}, 96000},
		{"LC 48000 立体声", []byte{0x11, 0x90, 0x56, 0xE5, 0x00}, 48000},
		{"LC 22050 单声道", []byte{0x13, 0x88, 0x56, 0xE5, 0x00}, 22050},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := parseAudioSpecificConfig(c.asc); got != c.wantRate {
				t.Errorf("采样率 = %d，期望 %d（ASC=% X）", got, c.wantRate, c.asc)
			}
		})
	}
}

// TestFindDescriptorVarLength 变长长度字段必须按续读标志累加
func TestFindDescriptorVarLength(t *testing.T) {
	payload := []byte{0xAA, 0xBB, 0xCC}
	b := append([]byte{0x00}, desc(0x05, payload)...)
	got, ok := findDescriptor(b, 0x05)
	if !ok {
		t.Fatal("未找到描述符")
	}
	if string(got) != string(payload) {
		t.Errorf("负载 = % X，期望 % X", got, payload)
	}
}

// TestWalkESDSChain 完整描述符链：03 → 04 → 05
func TestWalkESDSChain(t *testing.T) {
	asc := buildAudioSpecificConfig(2, 4, 2) // 44100
	dcd := []byte{0x40, 0x15, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0}
	dcd = append(dcd, desc(0x05, asc)...)
	es := append([]byte{0x00, 0x01, 0x00}, desc(0x04, dcd)...)
	esds := desc(0x03, es)

	if got := walkESDS(esds); got != 44100 {
		t.Errorf("walkESDS 采样率 = %d，期望 44100", got)
	}
}
