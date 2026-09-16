package ffmpeg

import (
	"context"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

/* --------------------------------------------------------------------------
   解析（不需要真实 ffmpeg）
   -------------------------------------------------------------------------- */

func TestParseLoudnormJSON(t *testing.T) {
	stderr := `ffmpeg version n8.1
Input #0, mov,mp4,m4a, from 'a.m4a':
  Duration: 00:04:06.35, start: 0.000000, bitrate: 133 kb/s
[Parsed_loudnorm_0 @ 000002] 
{
	"input_i" : "-21.75",
	"input_tp" : "-6.00",
	"input_lra" : "3.20",
	"input_thresh" : "-31.75",
	"output_i" : "-16.05",
	"normalization_type" : "linear",
	"target_offset" : "0.05"
}
size=N/A time=00:04:06.35 bitrate=N/A speed= 220x
`
	raw, ok := ParseLoudnormJSON(stderr)
	if !ok {
		t.Fatal("未解析出 loudnorm JSON")
	}
	for _, want := range []string{"input_i", "-21.75", "input_tp", "target_offset"} {
		if !strings.Contains(raw, want) {
			t.Errorf("JSON 里缺少 %q: %s", want, raw)
		}
	}

	if _, ok := ParseLoudnormJSON("no json here"); ok {
		t.Error("没有 JSON 时不应返回成功")
	}
	if _, ok := ParseLoudnormJSON("{}"); ok {
		t.Error("空 JSON 不应被当作 loudnorm 结果")
	}
}

func TestParseLoudnormJSONWithPrefixBraces(t *testing.T) {
	// stderr 前面可能出现别的花括号（如流信息里的字典），必须仍能找到正确的 JSON
	stderr := `{not json}
Metadata:
{
	"input_i" : "-18.00",
	"input_tp" : "-2.00"
}
`
	raw, ok := ParseLoudnormJSON(stderr)
	if !ok {
		t.Fatal("应能跳过前面的无效花括号")
	}
	if !strings.Contains(raw, "input_i") {
		t.Errorf("拿到的是错误的片段: %s", raw)
	}
}

func TestParseDuration(t *testing.T) {
	cases := []struct {
		in   string
		want float64
		ok   bool
	}{
		{"Duration: 00:04:06.35, start: 0", 246.35, true},
		{"Duration: 00:03:02.05, start", 182.05, true},
		{"Duration: 01:00:00.00, start", 3600, true},
		{"Duration: 00:00:12.50, start", 12.5, true},
		{"nothing here", 0, false},
		{"Duration: 00:00:00.00, start", 0, false},
		{"Duration: N/A, start", 0, false},
	}
	for _, c := range cases {
		got, ok := ParseDuration(c.in)
		if ok != c.ok {
			t.Errorf("ParseDuration(%q) ok=%v，期望 %v", c.in, ok, c.ok)
			continue
		}
		if ok && math.Abs(got-c.want) > 0.01 {
			t.Errorf("ParseDuration(%q) = %.2f，期望 %.2f", c.in, got, c.want)
		}
	}
}

func TestParseStreamLine(t *testing.T) {
	cases := []struct {
		name                          string
		in                            string
		codec                         string
		sampleRate, channels, bitrate int
	}{
		{
			"wma",
			"  Stream #0:0: Audio: wmav2 (a[1][0][0] / 0x0161), 44100 Hz, stereo, fltp, 128 kb/s",
			"wmav2", 44100, 2, 128000,
		},
		{
			"aac 单声道",
			"  Stream #0:0[0x1](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, mono, fltp, 64 kb/s",
			"aac", 48000, 1, 64000,
		},
		{
			"flac 无码率",
			"  Stream #0:0: Audio: flac, 96000 Hz, stereo, s32 (24 bit)",
			"flac", 96000, 2, 0,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			codec, rate, ch, br := parseStreamLine(c.in)
			if codec != c.codec {
				t.Errorf("codec = %q，期望 %q", codec, c.codec)
			}
			if rate != c.sampleRate {
				t.Errorf("采样率 = %d，期望 %d", rate, c.sampleRate)
			}
			if ch != c.channels {
				t.Errorf("声道 = %d，期望 %d", ch, c.channels)
			}
			if br != c.bitrate {
				t.Errorf("码率 = %d，期望 %d", br, c.bitrate)
			}
		})
	}

	if _, _, _, _ = parseStreamLine("no stream line"); false {
		t.Fatal("不应到达")
	}
}

/* --------------------------------------------------------------------------
   解析器选择
   -------------------------------------------------------------------------- */

func TestResolvePrefersEnvVar(t *testing.T) {
	Reset()
	dir := t.TempDir()
	fake := filepath.Join(dir, BinaryName())
	if err := os.WriteFile(fake, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("LMPLAYER_FFMPEG", fake)
	t.Cleanup(Reset)

	tools := Resolve()
	if tools.Source != "env" {
		t.Errorf("来源 = %q，期望 env", tools.Source)
	}
	if tools.FFmpeg != fake {
		t.Errorf("路径 = %q，期望 %q", tools.FFmpeg, fake)
	}
	if !tools.Available() || tools.Describe() == "" {
		t.Error("Available/Describe 应有值")
	}
}

func TestResolveIgnoresBadEnvVar(t *testing.T) {
	Reset()
	t.Setenv("LMPLAYER_FFMPEG", filepath.Join(t.TempDir(), "nope.exe"))
	t.Cleanup(Reset)

	tools := Resolve()
	if tools.Source == "env" {
		t.Error("指向不存在的文件时不应采用 env 来源")
	}
}

func TestCacheDirOverride(t *testing.T) {
	custom := filepath.Join(t.TempDir(), "my-bin")
	t.Setenv("LMPLAYER_FFMPEG_DIR", custom)
	got, err := cacheDir()
	if err != nil {
		t.Fatal(err)
	}
	if got != custom {
		t.Errorf("cacheDir = %q，期望 %q", got, custom)
	}
}

/* --------------------------------------------------------------------------
   CopyWithLimit
   -------------------------------------------------------------------------- */

func TestCopyWithLimit(t *testing.T) {
	src := strings.NewReader("0123456789")

	var out strings.Builder
	n, err := CopyWithLimit(&out, src, 4)
	if err != nil {
		t.Fatal(err)
	}
	if n != 4 || out.String() != "0123" {
		t.Errorf("限长拷贝 = %q（%d 字节），期望 0123（4 字节）", out.String(), n)
	}

	out.Reset()
	src = strings.NewReader("0123456789")
	n, err = CopyWithLimit(&out, src, 0) // 0 表示不限制
	if err != nil {
		t.Fatal(err)
	}
	if n != 10 || out.String() != "0123456789" {
		t.Errorf("不限长拷贝 = %q（%d 字节）", out.String(), n)
	}

	out.Reset()
	src = strings.NewReader("ab")
	n, _ = CopyWithLimit(&out, src, 100) // 限制大于内容
	if n != 2 || out.String() != "ab" {
		t.Errorf("超限拷贝 = %q（%d 字节）", out.String(), n)
	}
}

/* --------------------------------------------------------------------------
   真实 ffmpeg（没有则跳过）
   -------------------------------------------------------------------------- */

func TestProbeRealFile(t *testing.T) {
	Reset()
	tools := Resolve()
	if !tools.Available() {
		t.Skip("没有可用的 ffmpeg")
	}

	dir := t.TempDir()
	src := filepath.Join(dir, "tone.wav")
	cmd := exec.Command(tools.FFmpeg, "-hide_banner", "-loglevel", "error", "-y",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ac", "2", "-ar", "44100", src)
	if err := cmd.Run(); err != nil {
		t.Skipf("无法生成测试音频: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20_000_000_000)
	defer cancel()

	info, err := Probe(ctx, tools.FFmpeg, src)
	if err != nil {
		t.Fatalf("Probe 失败: %v", err)
	}
	if math.Abs(info.DurationSec-2.0) > 0.15 {
		t.Errorf("时长 = %.3f 秒，期望约 2 秒", info.DurationSec)
	}
	if info.SampleRate != 44100 {
		t.Errorf("采样率 = %d，期望 44100", info.SampleRate)
	}
	if info.Channels != 2 {
		t.Errorf("声道 = %d，期望 2", info.Channels)
	}

	// SoundDurationMS 也要能拿到时长，并且和 Probe 一致
	ms, err := SoundDurationMS(ctx, tools.FFmpeg, src)
	if err != nil {
		t.Fatalf("SoundDurationMS 失败: %v", err)
	}
	if math.Abs(ms-2000) > 150 {
		t.Errorf("毫秒时长 = %.1f，期望约 2000", ms)
	}
}

func TestProbeMissingFile(t *testing.T) {
	Reset()
	tools := Resolve()
	if !tools.Available() {
		t.Skip("没有可用的 ffmpeg")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15_000_000_000)
	defer cancel()

	if _, err := Probe(ctx, tools.FFmpeg, filepath.Join(t.TempDir(), "nope.wav")); err == nil {
		t.Error("不存在的文件应报错")
	}
	if _, err := SoundDurationMS(ctx, tools.FFmpeg, filepath.Join(t.TempDir(), "nope.wav")); err == nil {
		t.Error("不存在的文件应报错")
	}
	if _, err := Probe(ctx, "", "x"); err == nil {
		t.Error("ffmpeg 为空时应报错")
	}
}
