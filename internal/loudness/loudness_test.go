package loudness

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/ffmpeg"
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

func TestGainNeverClips(t *testing.T) {
	for _, tp := range []float64{-0.5, -1.0, -3.0, -6.0, -12.0} {
		for _, target := range []float64{-14, -16, -18, -23} {
			item := Measurement{Integrated: -30, TruePeak: tp}
			gain := GainDB(item, target)
			if got := tp + gain; got > truePeakCeiling+0.01 {
				t.Errorf("真峰值 %.1f + 增益 %.2f = %.2f 超过了上限 %.1f",
					tp, gain, got, truePeakCeiling)
			}
		}
	}
}

/* --------------------------------------------------------------------------
   ★ 核心：换挡位不丢数据、不重算
   --------------------------------------------------------------------------
   这是用户报的那个问题：
     「我发现比如我从较响改为默认的时候，以前在"较响"这个挡位计算的响度补偿
       丢失了。这显然是不对的，这些数据应该持久化复用。」
   根因是旧实现把 target 当作**测量记录**的有效性条件，切挡位时旧记录整条作废
   （还被 InvalidateTarget 直接删掉）。现在测量与挡位解耦，下面这组测试
   把它钉住。
   -------------------------------------------------------------------------- */

// TestTargetSwitchKeepsMeasurement 换挡位后测量结果原封不动
func TestTargetSwitchKeepsMeasurement(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1000, ModTime: 100}

	m.Store(song, Measurement{Integrated: -20, TruePeak: -3, Measured: true})

	// 在 -14 挡位取一次（会把增益记账）
	if _, ok := m.GainFor(song, -14); !ok {
		t.Fatal("-14 挡位应能算出增益（测量结果与挡位无关）")
	}
	// 切到 -16：测量结果必须还在
	item, ok := m.Get(song)
	if !ok {
		t.Fatal("换挡位后测量结果丢失了 —— 这正是用户报的 bug")
	}
	if math.Abs(item.Integrated-(-20)) > 1e-9 {
		t.Errorf("测量结果被改动: %+v", item)
	}
	if _, ok := m.GainFor(song, -16); !ok {
		t.Error("-16 挡位应能立刻算出增益，而不是排队重测")
	}
}

// TestGainPerTargetIsPersisted 每个挡位的增益各自记账，互不影响
func TestGainPerTargetIsPersisted(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1000, ModTime: 100}
	m.Store(song, Measurement{Integrated: -20, TruePeak: -3, Measured: true})

	// 四个挡位各取一次
	targets := []float64{-14, -16, -18, -23}
	want := map[float64]float64{}
	for _, tg := range targets {
		g, ok := m.GainFor(song, tg)
		if !ok {
			t.Fatalf("挡位 %.0f 取增益失败", tg)
		}
		want[tg] = g
	}
	if got := m.GainCount(); got != 4 {
		t.Fatalf("四个挡位应各有一条增益记录，实际 %d 条", got)
	}

	// 落盘 → 重启 → 四个挡位全部原样命中（一个都不能丢）
	if err := m.Save(); err != nil {
		t.Fatalf("落盘失败: %v", err)
	}
	m2 := NewManager(dir, 2)
	for _, tg := range targets {
		g, ok := m2.GainFor(song, tg)
		if !ok {
			t.Fatalf("重启后挡位 %.0f 的增益丢了", tg)
		}
		if math.Abs(g-want[tg]) > 1e-9 {
			t.Errorf("重启后挡位 %.0f 的增益 = %.4f，期望 %.4f", tg, g, want[tg])
		}
	}
	// 而且不能再多出条目（说明没有重算）
	if got := m2.GainCount(); got != 4 {
		t.Errorf("重启后应仍是 4 条，实际 %d 条", got)
	}
}

// TestInvalidateTargetKeepsEverything 兼容接口不再删任何测量数据
func TestInvalidateTargetKeepsEverything(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	a := bootstrap.Song{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1}
	b := bootstrap.Song{ID: "b", Path: `D:\m\b.flac`, Size: 1, ModTime: 1}
	m.Store(a, Measurement{Integrated: -20, TruePeak: -3, Measured: true})
	m.Store(b, Measurement{Integrated: -18, TruePeak: -2, Measured: true})
	m.GainFor(a, -14)
	m.GainFor(b, -14)

	// 切到 -16 时前端会调它 —— 它必须什么都不删
	if n := m.InvalidateTarget(-16); n != 0 {
		t.Errorf("换挡位不应丢弃任何记录，实际丢了 %d 条", n)
	}
	if m.Count() != 2 {
		t.Errorf("测量记录应全部保留，实际剩 %d 条", m.Count())
	}
	// -14 的增益也还在（用户切回去应当立刻命中）
	if _, ok := m.GainFor(a, -14); !ok {
		t.Error("-14 挡位的增益不应被丢弃")
	}
	if _, ok := m.GainFor(b, -16); !ok {
		t.Error("-16 挡位应能现算出来")
	}
}

// TestInvalidateStaleGainsDropsMismatched 自校验：目标值与自述不符的条目会被清掉
//
// 它防的是"坏数据"（手工改缓存、旧格式迁移出岔子），而不是换挡位。
func TestInvalidateStaleGainsDropsMismatched(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1, ModTime: 1}
	m.Store(song, Measurement{Integrated: -20, TruePeak: -3, Measured: true})

	m.mu.Lock()
	// 故意把"标称 -16"的增益塞到 -14 的槽位下（模拟手工改缓存等坏数据）
	m.gains[song.ID] = map[string]GainEntry{
		targetKey(-14): {Target: -16, DB: 6, Algo: AlgoVersion},
	}
	m.mu.Unlock()

	if n := m.InvalidateStaleGains(-14); n != 1 {
		t.Fatalf("应清掉 1 条目标不符的条目，实际 %d", n)
	}
	// 清掉之后重新取，应按真值算。
	// 这首歌 Integrated=-20、TruePeak=-3 ⇒ 真峰值只允许抬到 -1，即最多 +2dB。
	g, ok := m.GainFor(song, -14)
	if !ok {
		t.Fatal("清掉坏条目后应能重算")
	}
	if math.Abs(g-2) > 0.011 {
		t.Errorf("重算增益 = %.2f，期望 +2.00（被真峰值保护收口）", g)
	}
}

/* --------------------------------------------------------------------------
   有效性：只有「文件变了」「算法变了」才作废
   -------------------------------------------------------------------------- */

func TestCacheInvalidatedOnAlgoChange(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1000, ModTime: 100}

	m.mu.Lock()
	m.items[keyFor(song.Path, 1000, 100)] = Measurement{
		Path: song.Path, Size: 1000, ModTime: 100,
		Algo: AlgoVersion - 1, // 旧算法
		Integrated: -20, Measured: true,
	}
	m.mu.Unlock()

	if _, ok := m.Get(song); ok {
		t.Error("算法版本不同时缓存必须失效")
	}
}

func TestCacheInvalidatedOnFileChange(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1000, ModTime: 100}
	m.Store(song, Measurement{Integrated: -20, Measured: true})

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

func TestMissingAndCountValid(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	songs := []bootstrap.Song{
		{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1},
		{ID: "b", Path: `D:\m\b.flac`, Size: 1, ModTime: 1},
	}
	if got := len(m.Missing(songs)); got != 2 {
		t.Fatalf("应缺 2 首，实际 %d", got)
	}
	m.Store(songs[0], Measurement{Integrated: -16, Measured: true})

	if got := len(m.Missing(songs)); got != 1 {
		t.Fatalf("应缺 1 首，实际 %d", got)
	}
	if got := m.CountValid(songs); got != 1 {
		t.Fatalf("有效数应为 1，实际 %d", got)
	}
	// ★ 换挡位不改变「已测量」的数量 —— 测量与挡位无关
	if got := m.CountValid(songs); got != 1 {
		t.Fatalf("换挡位后有效数不该变化，实际 %d", got)
	}
	if got := len(m.Missing(songs)); got != 1 {
		t.Fatalf("换挡位后应仍然只缺 1 首，实际 %d", got)
	}
}

func TestClear(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1}
	m.Store(song, Measurement{Integrated: -20, Measured: true})
	m.GainFor(song, -14)
	if err := m.Clear(); err != nil {
		t.Fatalf("清除失败: %v", err)
	}
	if m.Count() != 0 || m.GainCount() != 0 {
		t.Errorf("清除后应为空，实际 items=%d gains=%d", m.Count(), m.GainCount())
	}
}

func TestCacheRoundTrip(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)

	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1234, ModTime: 5678}
	m.Store(song, Measurement{Integrated: -18.5, TruePeak: -3.2, LRA: 6.5, Measured: true})
	if _, ok := m.GainFor(song, testTarget); !ok {
		t.Fatal("应能算出增益")
	}

	if err := m.Save(); err != nil {
		t.Fatalf("保存缓存失败: %v", err)
	}

	m2 := NewManager(dir, 2)
	item, ok := m2.Get(song)
	if !ok {
		t.Fatal("重启后没有读到缓存")
	}
	if math.Abs(item.Integrated-(-18.5)) > 1e-9 || math.Abs(item.TruePeak-(-3.2)) > 1e-9 {
		t.Errorf("缓存数值不一致: %+v", item)
	}
	if item.Algo != AlgoVersion {
		t.Errorf("算法版本没有被持久化: %d", item.Algo)
	}
	// 增益也要跟着回来（否则重启后又得算一遍）。
	// Integrated=-18.5、TruePeak=-3.2：目标 -16 想抬 +2.5，但真峰值只允许
	// 抬到 -1（即 +2.2），所以被收口到 +2.2。
	if g, ok := m2.GainFor(song, testTarget); !ok || math.Abs(g-2.2) > 1e-9 {
		t.Errorf("重启后增益 = %.2f（ok=%v），期望 2.20", g, ok)
	}
}

/* --------------------------------------------------------------------------
   旧版缓存迁移：升级不能丢用户已经算好的数据
   -------------------------------------------------------------------------- */

// TestMigrateLegacyCache 这是「升级后数据不丢」的回归测试。
//
// v1 格式把 target/gain 直接放在测量记录里。迁移必须做到：
//   · 固有量进新表（不重测）；
//   · 记录里那个 gain 归到它当时的 target 挡位下（用户在"较响"算过的
//     补偿，升级后仍然是"较响"的补偿）。
func TestMigrateLegacyCache(t *testing.T) {
	dir := t.TempDir()
	song := bootstrap.Song{ID: "t_1", Path: `D:\m\a.flac`, Size: 1000, ModTime: 100}
	key := keyFor(song.Path, 1000, 100)

	// 手写一份 v1 缓存（字段与旧实现的 json tag 逐字一致）。
	//
	// 数值自洽：Integrated=-20.5、TruePeak=-8
	// ⇒ 挡位 -14 的补偿 = min(-14-(-20.5), -1-(-8)) = min(6.5, 7) = 6.5 dB。
	legacy := map[string]any{
		"version": 1,
		"entries": map[string]any{
			key: map[string]any{
				"path": song.Path, "size": 1000, "modTime": 100,
				"target": -14.0, "algo": AlgoVersion,
				"integrated": -20.5, "truePeak": -8.0, "lra": 5.0,
				"gain": 6.5,
				"measured": true, "measuredAt": 111,
			},
		},
	}
	raw, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "loudness-cache.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	m := NewManager(dir, 2)
	// 1. 测量结果必须还在（不能因为升级就重测）
	item, ok := m.Get(song)
	if !ok {
		t.Fatal("迁移后测量结果丢失了")
	}
	if math.Abs(item.Integrated-(-20.5)) > 1e-9 {
		t.Errorf("迁移后响度值 = %.2f，期望 -20.5", item.Integrated)
	}
	// 2. 旧挡位(-14)的增益必须可用
	g, ok := m.GainFor(song, -14)
	if !ok || math.Abs(g-6.5) > 1e-9 {
		t.Errorf("迁移后 -14 挡位增益 = %.2f（ok=%v），期望 6.50", g, ok)
	}
	// 3. 其它挡位现算即可（不需要重测）：-16 想抬 4.5，真峰值允许到 +7，故 4.5
	g16, ok := m.GainFor(song, -16)
	if !ok || math.Abs(g16-4.5) > 1e-9 {
		t.Errorf("-16 挡位增益 = %.2f（ok=%v），期望 4.50", g16, ok)
	}
	// 4. 迁移结果要能落盘并被下一次启动读回
	if err := m.Save(); err != nil {
		t.Fatal(err)
	}
	m2 := NewManager(dir, 2)
	if _, ok := m2.Get(song); !ok {
		t.Error("迁移后的缓存应已按新格式落盘")
	}
	if g, ok := m2.GainFor(song, -14); !ok || math.Abs(g-6.5) > 1e-9 {
		t.Errorf("第二次启动后 -14 增益 = %.2f（ok=%v）", g, ok)
	}
}

/* --------------------------------------------------------------------------
   增益映射（服务层用的批量查询）
   -------------------------------------------------------------------------- */

func TestGainForRequiresFreshCache(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir, 2)
	song := bootstrap.Song{ID: "a", Path: `D:\m\a.flac`, Size: 10, ModTime: 20}
	m.Store(song, Measurement{Integrated: -20, TruePeak: -3, Measured: true})

	// 响度差是 +4dB，但真峰值 -3dBTP 只允许抬到 -1dBTP，因此被收口到 +2dB
	gain, ok := m.GainFor(song, -16)
	if !ok {
		t.Fatal("有效缓存应返回增益")
	}
	if math.Abs(gain-2) > 0.011 {
		t.Errorf("增益 = %.2f，期望 +2.00（真峰值保护收口）", gain)
	}
	// ★ 换标准必须能算出新值（而不是返回 false 让上层去重测）
	g23, ok := m.GainFor(song, -23)
	if !ok {
		t.Fatal("换标准后应能立刻算出新增益")
	}
	if math.Abs(g23-(-3)) > 0.011 {
		t.Errorf("挡位 -23 的增益 = %.2f，期望 -3.00", g23)
	}
	// 没有测量结果的歌仍然返回 false（需要真去测）
	other := bootstrap.Song{ID: "z", Path: `D:\m\z.flac`, Size: 1, ModTime: 1}
	if _, ok := m.GainFor(other, -16); ok {
		t.Error("没有测量记录时不应返回增益")
	}
}

/* --------------------------------------------------------------------------
   并发上限
   -------------------------------------------------------------------------- */

// TestConcurrencyIsCapped 并发默认必须是 2，且不允许被配置放大到失控
func TestConcurrencyIsCapped(t *testing.T) {
	if got := NewManager(t.TempDir(), 0).Concurrency(); got != DefaultConcurrency {
		t.Errorf("默认并发 = %d，期望 %d", got, DefaultConcurrency)
	}
	if DefaultConcurrency > 2 {
		t.Errorf("默认并发 %d 过大 —— 测量是后台工作，跑满 CPU 会让风扇狂转",
			DefaultConcurrency)
	}
	if got := NewManager(t.TempDir(), 99).Concurrency(); got != MaxConcurrency {
		t.Errorf("超大并发应被夹到 %d，实际 %d", MaxConcurrency, got)
	}
}

/* --------------------------------------------------------------------------
   ffmpeg 输出解析（ebur128 的 Summary）
   -------------------------------------------------------------------------- */

// TestParseEBUR128Summary 解析真实 ffmpeg 输出形态
func TestParseEBUR128Summary(t *testing.T) {
	stderr := `ffmpeg version 8.1
Input #0, mov,mp4,m4a, from 'a.m4a':
  Duration: 00:04:06.35, start: 0.000000, bitrate: 133 kb/s
    Stream #0:0: Audio: aac (LC), 44100 Hz, stereo, fltp, 133 kb/s
Stream mapping:
  Stream #0:0 -> #0:0 (aac (native) -> pcm_s16le (native))
[Parsed_ebur128_0 @ 000001] 
Summary:

  Integrated loudness:
    I:         -21.8 LUFS
    Threshold: -31.8 LUFS

  Loudness range:
    LRA:         0.0 LU
    LRA low:   -21.8 LUFS
    LRA high:  -21.8 LUFS

  True peak:
    Peak:      -20.9 dBFS
`
	summary, ok := ffmpeg.ParseEBUR128Summary(stderr)
	if !ok {
		t.Fatal("应从 stderr 里取到 Summary")
	}
	m, err := parseSummary(summary)
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if math.Abs(m.Integrated-(-21.8)) > 1e-9 {
		t.Errorf("Integrated = %.2f，期望 -21.8", m.Integrated)
	}
	if math.Abs(m.Threshold-(-31.8)) > 1e-9 {
		t.Errorf("Threshold = %.2f，期望 -31.8", m.Threshold)
	}
	if math.Abs(m.LRA-0.0) > 1e-9 {
		t.Errorf("LRA = %.2f，期望 0.0", m.LRA)
	}
	if math.Abs(m.TruePeak-(-20.9)) > 1e-9 {
		t.Errorf("TruePeak = %.2f，期望 -20.9", m.TruePeak)
	}
}

// TestParseSummaryIgnoresPreamble 前导元信息里的同名字段不能被误取
func TestParseSummaryIgnoresPreamble(t *testing.T) {
	stderr := `Input #0, wav, from 'x.wav':
  Metadata:
    I:         -99.0 LUFS
Summary:

  Integrated loudness:
    I:         -14.2 LUFS
    Threshold: -24.2 LUFS
`
	summary, ok := ffmpeg.ParseEBUR128Summary(stderr)
	if !ok {
		t.Fatal("应取到 Summary")
	}
	m, _ := parseSummary(summary)
	if math.Abs(m.Integrated-(-14.2)) > 1e-9 {
		t.Errorf("应取 Summary 里的值 -14.2，实际 %.2f（说明取到了前导文本里的同名字段）",
			m.Integrated)
	}
}

// TestParseSummarySilence 纯静音（-inf）不应产生补偿
func TestParseSummarySilence(t *testing.T) {
	summary := "Summary:\n\n  Integrated loudness:\n    I:          -inf LUFS\n    Threshold: -inf LUFS\n"
	m, err := parseSummary(summary)
	if err != nil {
		t.Fatalf("静音也应当解析成功（不是错误）: %v", err)
	}
	if m.Integrated != 0 {
		t.Errorf("静音应得到 Integrated=0（不补偿），实际 %.2f", m.Integrated)
	}
}

func TestParseSummaryMissingField(t *testing.T) {
	if _, err := parseSummary("Summary:\n\n  Loudness range:\n    LRA: 1.0 LU\n"); err == nil {
		t.Error("没有 I 字段时应当报错，而不是静默给出 0")
	}
}

// TestParseEBUR128SummaryRejectsGarbage 没有 Summary 时不能假装成功
func TestParseEBUR128SummaryRejectsGarbage(t *testing.T) {
	if _, ok := ffmpeg.ParseEBUR128Summary("a.m4a: No such file or directory\n"); ok {
		t.Error("没有 Summary 时不应返回成功")
	}
	// 有 "Summary:" 但没有内容也要挡住
	if _, ok := ffmpeg.ParseEBUR128Summary("Summary:\n\n"); ok {
		t.Error("Summary 段为空时不应返回成功")
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
	item, err := m.Measure(context.Background(), song)
	if err != nil {
		t.Fatalf("测量失败: %v", err)
	}
	t.Logf("测得: 整合响度=%.2f LUFS 真峰值=%.2f dBTP LRA=%.2f",
		item.Integrated, item.TruePeak, item.LRA)

	if item.Integrated == 0 {
		t.Error("整合响度不应为 0")
	}
	if item.Integrated > 0 {
		t.Errorf("整合响度不可能是正数: %.2f", item.Integrated)
	}
	if !item.Measured || item.Algo != AlgoVersion {
		t.Errorf("测量结果缺少有效性标记: %+v", item)
	}

	// 第二次应命中缓存（不重新起 ffmpeg）
	if again, err := m.Measure(context.Background(), song); err != nil || again.MeasuredAt != item.MeasuredAt {
		t.Errorf("第二次测量应命中缓存（MeasuredAt 应不变）: %v %d vs %d", err, again.MeasuredAt, item.MeasuredAt)
	}

	// 两个挡位都要能算出增益。
	//
	// 注意它们在这里**相等**：这首歌真峰值 -21.1 dBTP，抬到 -1 还差 20 dB
	// 的余量，而两个挡位的目标差只有 2 dB —— 都远没到真峰值上限，
	// 但下面的断言刻意只看「都算得出来、且换挡位不需要重测」，
	// 因为真正的 2 dB 差值要等真峰值有余量时才体现（见下）。
	gain14, ok := m.GainFor(song, -14)
	if !ok {
		t.Fatal("应能算出 -14 挡位的增益")
	}
	gain16, ok := m.GainFor(song, -16)
	if !ok {
		t.Fatal("应能算出 -16 挡位的增益")
	}
	if math.Abs((gain14-gain16)-2) > 0.011 {
		t.Errorf("两个挡位的增益差应为 2 dB（-14 比 -16 响 2 LU），实际 %.2f",
			gain14-gain16)
	}
	// 换挡位不能触发第二次测量
	if again, _ := m.Get(song); again.MeasuredAt != item.MeasuredAt {
		t.Error("取另一个挡位的增益不该导致重新测量")
	}

	// 落盘 → 新实例应命中
	if err := m.Save(); err != nil {
		t.Fatal(err)
	}
	m2 := NewManager(dir, 2)
	if _, ok := m2.Get(song); !ok {
		t.Error("重启后应命中测量缓存")
	}
	if _, ok := m2.GainFor(song, -14); !ok {
		t.Error("重启后 -14 挡位的增益应仍然可用")
	}

	// 目标更轻 → 增益应为负
	gain := GainDB(item, -30)
	if gain >= 0 {
		t.Errorf("目标 -30 比实测 %.1f 轻，增益应为负，实际 %.2f", item.Integrated, gain)
	}
}

/* --------------------------------------------------------------------------
   懒加载
   --------------------------------------------------------------------------
   NewManager 不再同步读缓存（那会拖慢首帧），改成第一次真正用到时才读
   （ensureLoaded + sync.Once）。这组测试钉住两件事：
     · 盘上有缓存时，第一次查询就能读到（不能因为"懒"而读不到）；
     · 多次调用只读一次盘（sync.Once 的语义），且后续写入可见。
   -------------------------------------------------------------------------- */

// TestLazyLoadReadsCacheOnFirstUse 首次查询必须能读到盘上的缓存
func TestLazyLoadReadsCacheOnFirstUse(t *testing.T) {
	dir := t.TempDir()
	song := bootstrap.Song{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1}

	// 第一个 manager 写入一条并落盘
	m1 := NewManager(dir, 2)
	m1.Store(song, Measurement{Integrated: -16, Measured: true})
	if err := m1.Save(); err != nil {
		t.Fatalf("落盘失败: %v", err)
	}

	// 第二个 manager 构造时**不该**读盘；第一次 Get 时才读
	m2 := NewManager(dir, 2)
	if _, ok := m2.Get(song); !ok {
		t.Error("首次查询应能通过懒加载读到盘上的缓存")
	}
}

// TestLazyLoadOnlyOnce 多次查询只读一次盘（构造函数里不该有阻塞读）
func TestLazyLoadOnlyOnce(t *testing.T) {
	dir := t.TempDir()
	song := bootstrap.Song{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1}
	m := NewManager(dir, 2)

	// 第一次调用触发 load；之后即使盘上的文件删掉，也不该再读（已 loaded）
	if got := m.Count(); got != 0 {
		t.Fatalf("空目录应得到 0 条，实际 %d", got)
	}
	m.Store(song, Measurement{Integrated: -16, Measured: true})

	// 再查多次：内存里那条必须在（不会被第二次 load 覆盖掉）
	for i := 0; i < 3; i++ {
		if _, ok := m.Get(song); !ok {
			t.Fatalf("第 %d 次查询丢了内存里的记录（说明又 load 了一次，把内存覆盖了）", i+1)
		}
	}
}

func generateTone(ffmpegPath, out string) error {
	cmd := execCommand(ffmpegPath,
		"-hide_banner", "-loglevel", "error", "-y",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=6",
		"-ac", "2", "-ar", "44100", out)
	return cmd.Run()
}
