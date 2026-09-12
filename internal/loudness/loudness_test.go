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

// jsonUnmarshal 只是给测试用的薄封装
func jsonUnmarshal(raw string, v any) error { return json.Unmarshal([]byte(raw), v) }

func execCommand(name string, args ...string) *exec.Cmd { return exec.Command(name, args...) }

const testTarget = -16.0

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
   缓存有效性：文件没变 + 算法没变 + 补偿标准没变
   -------------------------------------------------------------------------- */

// TestCacheInvalidatedWhenTargetChanges 这是用户明确要求的行为：
// 补偿标准改了，已算好的补偿必须失效并重算。
func TestCacheInvalidatedWhenTargetChanges(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1000, ModTime: 100}

	m.mu.Lock()
	m.items[keyFor(song.Path, 1000, 100)] = Measurement{
		Path: song.Path, Size: 1000, ModTime: 100,
		Target: -16, Algo: AlgoVersion,
		Integrated: -20, TruePeak: -3, Measured: true, Gain: 4,
	}
	m.mu.Unlock()

	// 同一标准 → 命中
	if _, ok := m.Get(song, -16); !ok {
		t.Fatal("同一补偿标准下应命中缓存")
	}

	// 换了标准 → 必须失效
	if _, ok := m.Get(song, -23); ok {
		t.Error("目标响度从 -16 改成 -23 后，旧的补偿必须失效（否则用户改了标准却没生效）")
	}
	if _, ok := m.Get(song, -14); ok {
		t.Error("目标响度改成 -14 后也应失效")
	}
	// 目标带小数也不能误判
	if _, ok := m.Get(song, -16.0); !ok {
		t.Error("-16 与 -16.0 应视为同一标准")
	}
}

// TestCacheInvalidatedOnAlgoChange 算法升级后旧结果作废
func TestCacheInvalidatedOnAlgoChange(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1000, ModTime: 100}

	m.mu.Lock()
	m.items[keyFor(song.Path, 1000, 100)] = Measurement{
		Path: song.Path, Size: 1000, ModTime: 100,
		Target: testTarget, Algo: AlgoVersion - 1, // 旧算法
		Integrated: -20, Measured: true,
	}
	m.mu.Unlock()

	if _, ok := m.Get(song, testTarget); ok {
		t.Error("算法版本不同时缓存必须失效")
	}
}

// TestCacheInvalidatedOnFileChange 文件变了必须重测
func TestCacheInvalidatedOnFileChange(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1000, ModTime: 100}
	fresh := Measurement{
		Path: song.Path, Size: 1000, ModTime: 100,
		Target: testTarget, Algo: AlgoVersion, Integrated: -20, Measured: true,
	}
	m.mu.Lock()
	m.items[keyFor(song.Path, 1000, 100)] = fresh
	m.mu.Unlock()

	if _, ok := m.Get(song, testTarget); !ok {
		t.Fatal("同尺寸同时间应命中")
	}

	changed := song
	changed.Size = 2000
	if _, ok := m.Get(changed, testTarget); ok {
		t.Error("文件大小变化后不应命中缓存")
	}
	changed = song
	changed.ModTime = 200
	if _, ok := m.Get(changed, testTarget); ok {
		t.Error("修改时间变化后不应命中缓存")
	}
}

func TestMissingAndCountValid(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	songs := []bootstrap.Song{
		{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1},
		{ID: "b", Path: `D:\m\b.flac`, Size: 1, ModTime: 1},
	}
	if got := len(m.Missing(songs, testTarget)); got != 2 {
		t.Fatalf("应缺 2 首，实际 %d", got)
	}
	m.mu.Lock()
	m.items[keyFor(songs[0].Path, 1, 1)] = Measurement{
		Path: songs[0].Path, Size: 1, ModTime: 1,
		Target: testTarget, Algo: AlgoVersion, Integrated: -16, Measured: true,
	}
	m.mu.Unlock()

	if got := len(m.Missing(songs, testTarget)); got != 1 {
		t.Fatalf("应缺 1 首，实际 %d", got)
	}
	if got := m.CountValid(songs, testTarget); got != 1 {
		t.Fatalf("有效数应为 1，实际 %d", got)
	}
	// 换标准后有效数归零
	if got := m.CountValid(songs, -23); got != 0 {
		t.Fatalf("换标准后有效数应为 0，实际 %d", got)
	}
	if got := len(m.Missing(songs, -23)); got != 2 {
		t.Fatalf("换标准后应缺 2 首，实际 %d", got)
	}
}

// TestInvalidateTargetDropsStale 改标准后主动清掉过期记录
func TestInvalidateTargetDropsStale(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	songs := []bootstrap.Song{
		{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1},
		{ID: "b", Path: `D:\m\b.flac`, Size: 1, ModTime: 1},
	}
	// 必须用真实 key，否则 Get 查不到（模拟 load() 之后的正常状态）
	k1 := keyFor(songs[0].Path, 1, 1)
	k2 := keyFor(songs[1].Path, 1, 1)
	m.mu.Lock()
	m.items[k1] = Measurement{Path: songs[0].Path, Size: 1, ModTime: 1, Target: -16, Algo: AlgoVersion, Integrated: -20}
	m.items[k2] = Measurement{Path: songs[1].Path, Size: 1, ModTime: 1, Target: -23, Algo: AlgoVersion, Integrated: -18}
	m.byPath[songs[0].Path] = k1
	m.byPath[songs[1].Path] = k2
	m.mu.Unlock()

	dropped := m.InvalidateTarget(-23)
	if dropped != 1 {
		t.Errorf("应丢弃 1 条过期记录，实际 %d", dropped)
	}
	if m.Count() != 1 {
		t.Errorf("剩余应 1 条，实际 %d", m.Count())
	}
	if _, ok := m.Get(songs[1], -23); !ok {
		t.Error("与目标一致的那条应保留")
	}
	if _, ok := m.Get(songs[0], -16); ok {
		t.Error("旧标准的那条应被丢弃")
	}
}

func TestClear(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	m.mu.Lock()
	m.items["k"] = Measurement{Integrated: -20}
	m.mu.Unlock()
	if err := m.Clear(); err != nil {
		t.Fatalf("清除失败: %v", err)
	}
	if m.Count() != 0 {
		t.Errorf("清除后应为空，实际 %d", m.Count())
	}
}

// TestInvalidateTargetRebuildsPathIndex 失效重建后按路径索引仍要可用
func TestInvalidateTargetRebuildsPathIndex(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	keep := bootstrap.Song{ID: "b", Path: `D:\m\b.flac`, Size: 1, ModTime: 1}
	drop := bootstrap.Song{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1}

	m.mu.Lock()
	m.items[keyFor(keep.Path, 1, 1)] = Measurement{Path: keep.Path, Size: 1, ModTime: 1, Target: -23, Algo: AlgoVersion, Integrated: -18}
	m.items[keyFor(drop.Path, 1, 1)] = Measurement{Path: drop.Path, Size: 1, ModTime: 1, Target: -16, Algo: AlgoVersion, Integrated: -20}
	m.byPath[keep.Path] = keyFor(keep.Path, 1, 1)
	m.byPath[drop.Path] = keyFor(drop.Path, 1, 1)
	m.mu.Unlock()

	if n := m.InvalidateTarget(-23); n != 1 {
		t.Fatalf("应丢弃 1 条，实际 %d", n)
	}
	m.mu.RLock()
	_, hasKept := m.byPath[keep.Path]
	_, hasDropped := m.byPath[drop.Path]
	m.mu.RUnlock()
	if !hasKept {
		t.Error("保留项的路径索引应重建")
	}
	if hasDropped {
		t.Error("丢弃项的路径索引应清掉")
	}
	if _, ok := m.Get(keep, -23); !ok {
		t.Error("保留项仍应可查")
	}
}

func TestCacheRoundTrip(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)

	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1234, ModTime: 5678}
	m.mu.Lock()
	m.items[keyFor(song.Path, song.Size, song.ModTime)] = Measurement{
		Path: song.Path, Size: song.Size, ModTime: song.ModTime,
		Target: testTarget, Algo: AlgoVersion,
		Integrated: -18.5, TruePeak: -3.2, LRA: 6.5, Measured: true, Gain: 2.5,
	}
	m.dirty = true
	m.mu.Unlock()

	if err := m.Save(); err != nil {
		t.Fatalf("保存缓存失败: %v", err)
	}

	m2 := NewManager(dir, 2)
	item, ok := m2.Get(song, testTarget)
	if !ok {
		t.Fatal("重启后没有读到缓存")
	}
	if math.Abs(item.Integrated-(-18.5)) > 1e-9 || math.Abs(item.TruePeak-(-3.2)) > 1e-9 {
		t.Errorf("缓存数值不一致: %+v", item)
	}
	if item.Algo != AlgoVersion || math.Abs(item.Target-testTarget) > 1e-9 {
		t.Errorf("有效性条件没有被持久化: algo=%d target=%.2f", item.Algo, item.Target)
	}
}

/* --------------------------------------------------------------------------
   增益映射（服务层用的批量查询）
   -------------------------------------------------------------------------- */

func TestGainForRequiresFreshCache(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "a", Path: `D:\m\a.flac`, Size: 10, ModTime: 20}
	key := keyFor(song.Path, 10, 20)
	m.mu.Lock()
	m.items[key] = Measurement{
		Path: song.Path, Size: 10, ModTime: 20,
		Target: -16, Algo: AlgoVersion, Integrated: -20, TruePeak: -3, Measured: true,
	}
	m.mu.Unlock()

	// 响度差是 +4dB，但真峰值 -3dBTP 只允许抬到 -1dBTP，因此被收口到 +2dB
	gain, ok := m.GainFor(song, -16)
	if !ok {
		t.Fatal("有效缓存应返回增益")
	}
	if math.Abs(gain-2) > 0.011 {
		t.Errorf("增益 = %.2f，期望 +2.00（真峰值保护收口）", gain)
	}
	// 换标准后不再返回
	if _, ok := m.GainFor(song, -23); ok {
		t.Error("换标准后不应再返回旧增益")
	}
}

/* --------------------------------------------------------------------------
   ffmpeg 输出解析
   -------------------------------------------------------------------------- */

func TestParseLoudnormJSON(t *testing.T) {
	stderr := `ffmpeg version 8.1
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

/* --------------------------------------------------------------------------
   真实测量（需要 ffmpeg，缺失时跳过）
   -------------------------------------------------------------------------- */

func TestMeasureRealFileOnDemand(t *testing.T) {
	tools := ffmpeg.Resolve()
	if !tools.Available() {
		t.Skip("没有可用的 ffmpeg，跳过真实测量")
	}

	dir := t.TempDir()
	m := NewManager(dir, 2)
	if !m.Available() {
		t.Skip("响度管理器报告 ffmpeg 不可用")
	}

	wav := filepath.Join(dir, "tone.wav")
	if err := generateTone(tools.FFmpeg, wav); err != nil {
		t.Skipf("无法生成测试音频: %v", err)
	}
	st, err := os.Stat(wav)
	if err != nil {
		t.Fatal(err)
	}

	song := bootstrap.Song{ID: "t_tone", Path: wav, Size: st.Size(), ModTime: st.ModTime().UnixMilli()}

	// 按需测量：不需要事先扫描
	item, err := m.Measure(context.Background(), song, testTarget)
	if err != nil {
		t.Fatalf("测量失败: %v", err)
	}
	t.Logf("测得: 整合响度=%.2f LUFS 真峰值=%.2f dBTP LRA=%.2f 补偿=%+.2f dB",
		item.Integrated, item.TruePeak, item.LRA, item.Gain)

	if item.Integrated == 0 {
		t.Error("整合响度不应为 0")
	}
	if item.Integrated > 0 {
		t.Errorf("整合响度不可能是正数: %.2f", item.Integrated)
	}
	if !item.Measured || item.Algo != AlgoVersion || item.Target != testTarget {
		t.Errorf("测量结果缺少有效性标记: %+v", item)
	}
	if math.Abs(item.Gain-GainDB(item, testTarget)) > 1e-9 {
		t.Errorf("缓存里的增益与公式不一致: %.2f vs %.2f", item.Gain, GainDB(item, testTarget))
	}

	// 第二次应命中缓存（不重新起 ffmpeg）
	if again, err := m.Measure(context.Background(), song, testTarget); err != nil || again.MeasuredAt != item.MeasuredAt {
		t.Errorf("第二次测量应命中缓存（MeasuredAt 应不变）: %v %d vs %d", err, again.MeasuredAt, item.MeasuredAt)
	}

	// 换标准 → 必须重算
	if _, err := m.Measure(context.Background(), song, -23); err != nil {
		t.Fatalf("换标准后重算失败: %v", err)
	}
	if v, ok := m.Get(song, testTarget); ok {
		t.Errorf("换标准后旧标准不应再命中: %+v", v)
	}

	// 落盘 → 新实例应命中
	if err := m.Save(); err != nil {
		t.Fatal(err)
	}
	m2 := NewManager(dir, 2)
	if _, ok := m2.Get(song, -23); !ok {
		t.Error("重启后应命中当前标准的缓存")
	}
	if _, ok := m2.Get(song, testTarget); ok {
		t.Error("重启后旧标准的缓存不应被采用")
	}

	// 目标更轻 → 增益应为负
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
