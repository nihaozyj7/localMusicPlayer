/* ==========================================================================
   skipsilence_test.go — 「跳过首尾静音 / 切歌间隔」的配置层测试
   --------------------------------------------------------------------------
   这一层的错误都会表现成「设置看起来生效了，重启后什么都没变」或者
   「我明明设了 0 秒，怎么又变成 1.5 秒了」—— 不会崩、不会报错，
   所以每一条边界都必须钉住。
   ========================================================================== */

package bootstrap

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

// 默认值：跳过静音默认关闭（会改变用户听到的音频，必须明确开启），
// 切歌间隔默认 1.5 秒（需求指定的值）。
func TestSkipSilenceDefaults(t *testing.T) {
	d := DefaultConfig()
	if d.SkipSilenceHead {
		t.Error("skipSilenceHead 默认应当是 false（改动音频的处理必须由用户开启）")
	}
	if d.SkipSilenceTail {
		t.Error("skipSilenceTail 默认应当是 false")
	}
	if math.Abs(d.TrackGapSeconds-DefaultTrackGapSeconds) > 1e-9 {
		t.Errorf("trackGapSeconds 默认 = %v，期望 %v", d.TrackGapSeconds, DefaultTrackGapSeconds)
	}
	if DefaultTrackGapSeconds != 1.5 {
		t.Errorf("默认切歌间隔应当是 1.5 秒，实际 %v", DefaultTrackGapSeconds)
	}
}

// 切歌间隔的规范化：0 是**合法值**，不能被当成「没设过」而落回默认。
//
// 这是本文件最重要的一条：如果把 0 也落回 1.5，用户明确选的
// 「不留间隔，播完立刻接上」会被静默改成 1.5 秒 ——
// 而且他改一次、重启一次就变回来，根本找不到原因。
func TestNormalizeTrackGapSecondsZeroIsValid(t *testing.T) {
	if got := NormalizeTrackGapSeconds(0); got != 0 {
		t.Errorf("0 秒是合法值（不留间隔），不该落回默认，实际得到 %v", got)
	}
}

func TestNormalizeTrackGapSecondsClamps(t *testing.T) {
	cases := []struct{ in, want float64 }{
		{-5, 0},     // 负数 → 0
		{-0.1, 0},   // 极小负数 → 0
		{0, 0},      // 0 保持
		{0.5, 0.5},  // 半秒
		{1.5, 1.5},  // 默认值必须能原样通过
		{2.34, 2.3}, // 一位小数（滑条是 0.1 一档）
		{2.36, 2.4}, // 四舍五入
		{10, 10},    // 上限
		{999, 10},   // 超上限 → 钳到 10
		{1.55, 1.6}, // 半位进位
		{1.54, 1.5}, // 半位舍去
	}
	for _, c := range cases {
		if got := NormalizeTrackGapSeconds(c.in); math.Abs(got-c.want) > 1e-9 {
			t.Errorf("NormalizeTrackGapSeconds(%v) = %v，期望 %v", c.in, got, c.want)
		}
	}
}

// 规范化后的小数位必须干净：config.json 里不该出现 1.5000000000000002。
func TestNormalizeTrackGapSecondsCleanDecimals(t *testing.T) {
	for _, in := range []float64{1.5, 2.34, 0.7, 3.14159, 9.99} {
		got := NormalizeTrackGapSeconds(in)
		// 乘 10 之后应当接近整数
		scaled := got * 10
		if math.Abs(scaled-math.Round(scaled)) > 1e-9 {
			t.Errorf("NormalizeTrackGapSeconds(%v) = %v，小数位超过一位", in, got)
		}
	}
}

// 三个新字段必须真的落进 JSON —— 字段名的拼写错误在 Go 里是编译不过的，
// 但 json tag 写错只会让配置静默丢失（前端推上来的键对不上）。
func TestSkipSilenceJSONTags(t *testing.T) {
	c := DefaultConfig()
	c.SkipSilenceHead = true
	c.SkipSilenceTail = true
	c.TrackGapSeconds = 2.5

	raw, err := json.Marshal(c)
	if err != nil {
		t.Fatalf("序列化失败: %v", err)
	}
	s := string(raw)

	for _, key := range []string{`"skipSilenceHead":true`, `"skipSilenceTail":true`, `"trackGapSeconds":2.5`} {
		if !strings.Contains(s, key) {
			t.Errorf("序列化结果里缺少 %s —— json tag 拼错了（前端推的键会对不上）", key)
		}
	}
}

// 反序列化：老版本配置文件里没有这三个字段时，必须落回默认值
// （而不是零值 —— 那会让切歌间隔变成 0 秒，用户的停顿设置凭空消失）。
func TestSkipSilenceBackfillsLegacyConfig(t *testing.T) {
	// 模拟一份「加入这个功能之前」的配置
	raw := []byte(`{"theme":"cover-dark","volume":0.8,"playMode":"sequence"}`)
	parsed := DefaultConfig()
	if err := json.Unmarshal(raw, parsed); err != nil {
		t.Fatalf("解析旧配置失败: %v", err)
	}
	normalize(parsed)

	if parsed.SkipSilenceHead || parsed.SkipSilenceTail {
		t.Error("旧配置没有这两个字段时应当保持默认（关闭）")
	}
	if math.Abs(parsed.TrackGapSeconds-DefaultTrackGapSeconds) > 1e-9 {
		t.Errorf("旧配置没有这个字段时应当落回默认 %v，实际 %v",
			DefaultTrackGapSeconds, parsed.TrackGapSeconds)
	}
}

// normalize 必须夹住手改配置写进去的非法值。
func TestNormalizeClampsTrackGapOnLoad(t *testing.T) {
	c := DefaultConfig()
	c.TrackGapSeconds = -100
	normalize(c)
	if c.TrackGapSeconds != 0 {
		t.Errorf("负间隔应当被规范化成 0，实际 %v", c.TrackGapSeconds)
	}

	c2 := DefaultConfig()
	c2.TrackGapSeconds = 9999
	normalize(c2)
	if c2.TrackGapSeconds != MaxTrackGapSeconds {
		t.Errorf("超大间隔应当被钳到 %v，实际 %v", MaxTrackGapSeconds, c2.TrackGapSeconds)
	}
}

// 两个跳过开关是**独立**的：normalize 不能把它们互斥或联动。
//
// 需求原文是「分别为跳过头部、尾部的静音区域」，所以任意组合都必须被保留。
func TestSkipSilenceSwitchesAreIndependent(t *testing.T) {
	combos := []struct{ head, tail bool }{
		{false, false}, {true, false}, {false, true}, {true, true},
	}
	for _, c := range combos {
		cfg := DefaultConfig()
		cfg.SkipSilenceHead = c.head
		cfg.SkipSilenceTail = c.tail
		normalize(cfg)
		if cfg.SkipSilenceHead != c.head || cfg.SkipSilenceTail != c.tail {
			t.Errorf("组合 (%v, %v) 被 normalize 改成了 (%v, %v) —— 两个开关必须相互独立",
				c.head, c.tail, cfg.SkipSilenceHead, cfg.SkipSilenceTail)
		}
	}
}
