package loudness

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/ffmpeg"
)

// jsonUnmarshal 只是给测试用的薄封装，避免在测试里再引一次 encoding/json 别名
func jsonUnmarshal(raw string, v any) error { return json.Unmarshal([]byte(raw), v) }

func execCommand(name string, args ...string) *exec.Cmd { return exec.Command(name, args...) }

/* --------------------------------------------------------------------------
   增益计算（响度均衡的核心公式，不需要 ffmpeg）
   -------------------------------------------------------------------------- */

func TestGainDBBasic(t *testing.T) {
	cases := []struct {
		name     string
		item     Measurement
		target   float64
		wantGain float64
	}{
		// 音乐太轻 → 抬高（真峰值足够低，不触发保护）
		{"轻的抬高", Measurement{Integrated: -21.75, TruePeak: -21.0}, -16, 5.75},
		// 音乐太响 → 压低
		{"响的压低", Measurement{Integrated: -11.0, TruePeak: -1.0}, -16, -5.0},
		// 正好在目标 → 不动
		{"刚好命中", Measurement{Integrated: -16.0, TruePeak: -3.0}, -16, 0},
		// 真峰值保护：抬到会削波就截断
		// 需要 +10dB，但真峰值 -1.0 只允许抬到 -1.0 dBTP，即最多 0dB
		{"真峰值保护", Measurement{Integrated: -26.0, TruePeak: -1.0}, -16, 0},
		// 真峰值保护但有余量：允许抬到上限
		{"真峰值部分限制", Measurement{Integrated: -26.0, TruePeak: -8.0}, -16, 7.0},
		// 未测量（Integrated=0）→ 不补偿
		{"未测量", Measurement{}, -16, 0},
		// 上限截断
		{"增益上限", Measurement{Integrated: -80.0, TruePeak: -60.0}, -16, maxGainDB},
		// 下限截断
		{"增益下限", Measurement{Integrated: 40.0, TruePeak: 0}, -16, minGainDB},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := GainDB(c.item, c.target)
			if math.Abs(got-c.wantGain) > 0.011 {
				t.Errorf("GainDB = %.2f，期望 %.2f", got, c.wantGain)
			}
		})
	}
}

// TestGainNeverClips 任何情况下增益后都不应超过真峰值上限
func TestGainNeverClips(t *testing.T) {
	targets := []float64{-14, -16, -18, -23}
	for _, target := range targets {
		for _, lufs := range []float64{-30, -25, -20, -16, -12, -8} {
			for _, tp := range []float64{-20, -10, -5, -2, -1, -0.5} {
				item := Measurement{Integrated: lufs, TruePeak: tp}
				gain := GainDB(item, target)
				if lufs+gain+tp > truePeakCeiling+0.01 && gain > 0 {
					t.Errorf("target=%.0f lufs=%.1f tp=%.1f → gain=%.2f 会超过 %.1f dBTP",
						target, lufs, tp, gain, truePeakCeiling)
				}
			}
		}
	}
}

/* --------------------------------------------------------------------------
   缓存
   -------------------------------------------------------------------------- */

func TestCacheRoundTrip(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)

	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1234, ModTime: 5678}
	m.mu.Lock()
	m.items[keyFor(song.Path, song.Size, song.ModTime)] = Measurement{
		Path: song.Path, Size: song.Size, ModTime: song.ModTime,
		Integrated: -18.5, TruePeak: -3.2, LRA: 6.5,
	}
	m.dirty = true
	m.mu.Unlock()

	if err := m.Save(); err != nil {
		t.Fatalf("保存缓存失败: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "loudness-cache.json")); err != nil {
		t.Fatalf("缓存文件不存在: %v", err)
	}

	// 新的管理器应能读回
	m2 := NewManager(dir, 2)
	item, ok := m2.Get(song)
	if !ok {
		t.Fatal("重启后没有读到缓存")
	}
	if math.Abs(item.Integrated-(-18.5)) > 1e-9 || math.Abs(item.TruePeak-(-3.2)) > 1e-9 {
		t.Errorf("缓存数值不一致: %+v", item)
	}
}

// TestCacheInvalidatedOnFileChange 文件变了必须重测
func TestCacheInvalidatedOnFileChange(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1000, ModTime: 100}
	m.mu.Lock()
	m.items[keyFor(song.Path, 1000, 100)] = Measurement{Path: song.Path, Size: 1000, ModTime: 100, Integrated: -20}
	m.mu.Unlock()

	if _, ok := m.Get(song); !ok {
		t.Fatal("同尺寸同时间应命中")
	}

	changed := song
	changed.Size = 2000
	if _, ok := m.Get(changed); ok {
		t.Error("文件大小变化后不应命中缓存")
	}
	changed = song
	changed.ModTime = 200
	if _, ok := m.Get(changed); ok {
		t.Error("修改时间变化后不应命中缓存")
	}
}

func TestMissingAndClear(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	songs := []bootstrap.Song{
		{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1},
		{ID: "b", Path: `D:\m\b.flac`, Size: 1, ModTime: 1},
	}
	if got := len(m.Missing(songs)); got != 2 {
		t.Fatalf("应缺 2 首，实际 %d", got)
	}
	m.mu.Lock()
	m.items[keyFor(songs[0].Path, 1, 1)] = Measurement{Path: songs[0].Path, Size: 1, ModTime: 1, Integrated: -16}
	m.dirty = true
	m.mu.Unlock()

	if got := len(m.Missing(songs)); got != 1 {
		t.Fatalf("应缺 1 首，实际 %d", got)
	}
	if err := m.Clear(); err != nil {
		t.Fatalf("清除失败: %v", err)
	}
	if got := len(m.Missing(songs)); got != 2 {
		t.Fatalf("清除后应缺 2 首，实际 %d", got)
	}
}

/* --------------------------------------------------------------------------
   ffmpeg 输出解析
   -------------------------------------------------------------------------- */

func TestParseLoudnormJSON(t *testing.T) {
	stderr := `ffmpeg version 8.1
Input #0, mov,mp4,m4a, from 'a.m4a':
  Duration: 00:04:06.35, start: 0.000000, bitrate: 133 kb/s
Stream mapping:
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
	raw, ok := ffmpeg.ParseLoudnormJSON(stderr)
	if !ok {
		t.Fatal("未解析出 loudnorm JSON")
	}
	var parsed loudnormJSON
	if err := jsonUnmarshal(raw, &parsed); err != nil {
		t.Fatalf("JSON 无效: %v", err)
	}
	if parsed.InputI != "-21.75" || parsed.InputTP != "-6.00" {
		t.Errorf("解析结果不对: %+v", parsed)
	}

	if _, ok := ffmpeg.ParseLoudnormJSON("no json here"); ok {
		t.Error("没有 JSON 时不应返回成功")
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
		{"nothing", 0, false},
		{"Duration: 00:00:00.00, start", 0, false},
	}
	for _, c := range cases {
		got, ok := ffmpeg.ParseDuration(c.in)
		if ok != c.ok {
			t.Errorf("ParseDuration(%q) ok=%v，期望 %v", c.in, ok, c.ok)
			continue
		}
		if ok && math.Abs(got-c.want) > 0.01 {
			t.Errorf("ParseDuration(%q) = %.2f，期望 %.2f", c.in, got, c.want)
		}
	}
}

/* --------------------------------------------------------------------------
   真实测量（需要 ffmpeg，缺失时跳过）
   -------------------------------------------------------------------------- */

func TestMeasureRealFile(t *testing.T) {
	tools := ffmpeg.Resolve()
	if !tools.Available() {
		t.Skip("没有可用的 ffmpeg，跳过真实测量")
	}

	dir := t.TempDir()
	m := NewManager(dir, 2)
	if !m.Available() {
		t.Skip("响度管理器报告 ffmpeg 不可用")
	}

	// 生成一个 6 秒正弦波（响度是确定的，可用于验证公式方向）
	wav := filepath.Join(dir, "tone.wav")
	if err := generateTone(tools.FFmpeg, wav); err != nil {
		t.Skipf("无法生成测试音频: %v", err)
	}
	st, err := os.Stat(wav)
	if err != nil {
		t.Fatal(err)
	}

	song := bootstrap.Song{ID: "t_tone", Path: wav, Size: st.Size(), ModTime: st.ModTime().UnixMilli()}
	item, err := m.Measure(context.Background(), song)
	if err != nil {
		t.Fatalf("测量失败: %v", err)
	}
	t.Logf("测得: 整合响度=%.2f LUFS 真峰值=%.2f dBTP LRA=%.2f", item.Integrated, item.TruePeak, item.LRA)

	if item.Integrated == 0 {
		t.Error("整合响度不应为 0")
	}
	if item.Integrated > 0 {
		t.Errorf("整合响度不可能是正数: %.2f", item.Integrated)
	}

	// 落盘 → 新实例应命中缓存
	if err := m.Save(); err != nil {
		t.Fatal(err)
	}
	m2 := NewManager(dir, 2)
	if _, ok := m2.Get(song); !ok {
		t.Error("重启后应命中缓存")
	}

	// 目标响度低于实测值时增益应为正（需要调小）
	gain := GainDB(item, -30)
	if gain >= 0 {
		t.Errorf("目标 -30 比实测 %.1f 轻，增益应为负，实际 %.2f", item.Integrated, gain)
	}
}

func generateTone(ffmpegPath, out string) error {
	cmd := execCommand(ffmpegPath,
		"-hide_banner", "-loglevel", "error", "-y",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=6",
		"-ac", "2", "-ar", "44100", out)
	return cmd.Run()
}
