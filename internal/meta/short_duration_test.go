// 时长不足 1 秒的文件的回归测试。
//
// ★ 这里钉住的是一个**会崩溃整个应用**的历史故障：码率曾经写成
// size*8/(ms/1000)，ms 落在 1..999 之间时 ms/1000 == 0 —— Go 的整数除零
// 会 panic（不是返回 0）。触发条件低到「曲库里有一个 < 1 秒的铃声 /
// 切片 / 截断文件」即可，而当时扫描 worker 没有 recover，结果是
// 扫到那个文件就闪退。
//
// 四个调用点（mp3 两条路径、flac、mp4）现在统一走 bitrateBps；
// 这里覆盖 helper 本身 + 走完整 Read() 入口的 m4a / flac 两条真实路径。

package meta

import (
	"testing"
)

// TestBitrateBpsNoDivideByZero 钉住 helper 的边界：任何正时长都必须算出结果而不是崩。
func TestBitrateBpsNoDivideByZero(t *testing.T) {
	cases := []struct {
		name string
		size int64
		ms   int64
		want int
	}{
		// 历史崩溃点：ms < 1000（旧写法 ms/1000 == 0 → 除零 panic）
		{"1ms", 22050, 1, 176400000},
		{"500ms", 22050, 500, 352800},
		{"999ms", 22050, 999, 176576},
		{"整 1000ms", 22050, 1000, 176400},
		{"1.5 秒", 44100, 1500, 235200},
		// 非法输入一律 0，绝不做除法
		{"时长为 0", 22050, 0, 0},
		{"时长为负", 22050, -5, 0},
		{"大小为 0", 0, 500, 0},
		{"大小为负", -1, 500, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := bitrateBps(c.size, c.ms); got != c.want {
				t.Fatalf("bitrateBps(%d, %d) = %d，期望 %d", c.size, c.ms, got, c.want)
			}
		})
	}
}

// buildShortFLAC 拼一个结构合法但时长短于 1 秒的 FLAC 头。
// 只写 STREAMINFO（4 字节块头 + 34 字节数据），时长由 sampleRate 与 totalSamples 决定。
func buildShortFLAC(sampleRate int, totalSamples int64) []byte {
	head := make([]byte, 4+4+34)
	copy(head[0:4], "fLaC")
	head[4] = 0x80 // 第一个元数据块：末块 + 类型 0（STREAMINFO）
	head[7] = 34   // 块长度 34
	data := head[8:]
	// sampleRate 占 20 bit：data[10] 全 8 bit + data[11] 全 8 bit + data[12] 高 4 bit
	data[10] = byte(sampleRate >> 12)
	data[11] = byte(sampleRate >> 4)
	data[12] = byte(sampleRate<<4) & 0xF0
	// totalSamples 占 36 bit，起点是 data[12] 的最低位
	data[13] = byte(totalSamples>>32) & 0x0F
	data[14] = byte(totalSamples >> 24)
	data[15] = byte(totalSamples >> 16)
	data[16] = byte(totalSamples >> 8)
	data[17] = byte(totalSamples)
	return head
}

// TestShortM4ADurationAndBitrate 走完整 Read()：500ms 的 m4a 必须返回时长与码率，而不是 panic。
func TestShortM4ADurationAndBitrate(t *testing.T) {
	// timescale=44100, duration=22050 → 500ms
	asc := buildAudioSpecificConfig(2, 4, 2)
	data := buildM4A(44100, 22050, asc)
	path := writeFile(t, "short.m4a", data)

	info := Read(path) // 老代码在这里 panic
	if info.DurationMS != 500 {
		t.Errorf("时长 = %dms，期望 500ms", info.DurationMS)
	}
	want := bitrateBps(int64(len(data)), 500)
	if info.Bitrate != want {
		t.Errorf("码率 = %d，期望 %d", info.Bitrate, want)
	}
	if want <= 0 {
		t.Fatal("测试数据本身算不出码率，用例失去意义")
	}
}

// TestShortFLACDurationAndBitrate 同上，覆盖 flac 的独立调用点。
func TestShortFLACDurationAndBitrate(t *testing.T) {
	// 44100Hz / 22050 采样 → 500ms
	data := buildShortFLAC(44100, 22050)
	path := writeFile(t, "short.flac", data)

	info := Read(path)
	if info.DurationMS != 500 {
		t.Errorf("时长 = %dms，期望 500ms", info.DurationMS)
	}
	if info.SampleRate != 44100 {
		t.Errorf("采样率 = %dHz，期望 44100Hz", info.SampleRate)
	}
	if info.Bitrate != bitrateBps(int64(len(data)), 500) {
		t.Errorf("码率 = %d，与按文件大小算出的不一致", info.Bitrate)
	}
}

// TestShortFilesDurationBelowOneSecond 覆盖最容易漏的区间（1..999ms），
// 用多个采样数把每个「ms/1000 == 0」的取值都打一遍。
func TestShortFilesDurationBelowOneSecond(t *testing.T) {
	for _, total := range []int64{45, 441, 22050, 44099} {
		wantMS := total * 1000 / 44100
		if wantMS <= 0 || wantMS >= 1000 {
			t.Fatalf("测试取值 %d 不在 1..999ms 区间（算出 %dms）", total, wantMS)
		}
		path := writeFile(t, "below1s.flac", buildShortFLAC(44100, total))
		if got := Read(path).DurationMS; got != wantMS {
			t.Errorf("totalSamples=%d 时长 = %dms，期望 %dms", total, got, wantMS)
		}
	}
}
