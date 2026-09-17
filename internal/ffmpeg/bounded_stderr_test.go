package ffmpeg

import (
	"bytes"
	"strings"
	"testing"
)

// 证明 boundedBuffer 是「限长」的：无论喂多少字节，占用都不超过 max。
// 这是修复 F1（Probe/SoundDurationMS 用无上限 bytes.Buffer 收 stderr）的核心保证。
func TestBoundedBufferCapsMemory(t *testing.T) {
	const max = 8 << 10
	b := newBoundedBuffer(max)

	// 模拟 ffmpeg 默认 loglevel 下的逐帧进度输出：10 分钟音轨 ≈ 几千行。
	line := []byte("[null @ 0x1] frame=  123 fps=0.0 q=-0.0 size=N/A time=00:00:01.00 bitrate=N/A speed= 1x\n")
	n := 0
	for n < 4<<20 { // 4MB 输入
		if _, err := b.Write(line); err != nil {
			t.Fatalf("Write 不应返回错误（丢弃超出部分不是错误）: %v", err)
		}
		n += len(line)
	}

	if len(b.String()) > max {
		t.Fatalf("缓冲区超过上限：len=%d max=%d", len(b.String()), max)
	}
	if len(b.String()) == 0 {
		t.Fatal("前半部分必须被保留（Duration/Stream 行都在头部）")
	}
}

// 证明「写满之后 Write 仍返回 len(p)」——os/exec 的读取 goroutine 依赖这个契约，
// 返回短写会被当成 unexpected EOF / 卡住子进程。
func TestBoundedBufferWriteContract(t *testing.T) {
	b := newBoundedBuffer(16)
	payload := bytes.Repeat([]byte("x"), 1024)
	got, err := b.Write(payload)
	if err != nil {
		t.Fatalf("err = %v, want nil", err)
	}
	if got != len(payload) {
		t.Fatalf("Write 返回 %d, 契约要求返回 %d", got, len(payload))
	}
}

// 证明关键信息（头部）真的还在：把「多行进度 + 末尾 Duration」的真实形态喂进去，
// 头部的 Stream 行必须可解析。
func TestBoundedBufferKeepsHeader(t *testing.T) {
	b := newBoundedBuffer(maxStderrBytes)
	header := "Input #0, mov,mp4,m4a, from 'x.m4a':\n" +
		"  Duration: 00:03:02.05, start: 0.000000, bitrate: 320 kb/s\n" +
		"  Stream #0:0: Audio: aac (LC), 44100 Hz, stereo, fltp, 320 kb/s\n"
	if _, err := b.Write([]byte(header)); err != nil {
		t.Fatal(err)
	}
	// 再灌入远超上限的进度行
	for i := 0; i < 5000; i++ {
		_, _ = b.Write([]byte(strings.Repeat("[null @ 0x1] frame=1 time=00:00:01.00\n", 8)))
	}
	out := b.String()
	if d, ok := ParseDuration(out); !ok || d < 181 || d > 183 {
		t.Fatalf("Duration 解析失败或错误: d=%v ok=%v", d, ok)
	}
	// parseStreamLine 把 "320 kb/s" 归一成 bps（320000），不是 320。
	_, sr, ch, br := parseStreamLine(out)
	if sr != 44100 || ch != 2 || br != 320000 {
		t.Fatalf("Stream 行解析失败: sr=%d ch=%d br=%d", sr, ch, br)
	}
}
