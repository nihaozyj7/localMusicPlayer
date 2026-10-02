package bootstrap

import "testing"

// 播放界面背景动效档位的规范化与默认值。
//
// 重点钉住「非法值兜底成 smooth」这条：如果兜底成 performance，
// 一个手改坏/拼错的配置会让用户莫名其妙回到省电档，
// 而表现是「我明明没开省电，怎么还是卡」—— 这类静默降级最难排查。
func TestSkinPerformanceModeNormalize(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", "smooth"}, // 缺省（老版本配置没有这个字段）
		{"smooth", "smooth"},
		{"performance", "performance"},
		{"PERFORMANCE", "performance"}, // 大小写不敏感
		{" performance ", "performance"},
		{"bogus", "smooth"}, // 非法值 → 流畅档
		{"60", "smooth"},
		{"true", "smooth"},
	}
	for _, c := range cases {
		if got := NormalizeSkinPerformanceMode(c.in); got != c.want {
			t.Errorf("NormalizeSkinPerformanceMode(%q) = %q，期望 %q", c.in, got, c.want)
		}
	}
}

// 默认配置必须是 smooth：高刷屏用户在默认设置下就该拿到流畅的画面。
func TestSkinPerformanceModeDefaultIsSmooth(t *testing.T) {
	if d := DefaultConfig(); d.SkinPerformanceMode != "smooth" {
		t.Errorf("默认配置的 skinPerformanceMode = %q，期望 smooth", d.SkinPerformanceMode)
	}
}

// 老配置（没有该字段）经 normalize 后必须拿到 smooth，而不是零值 ""。
func TestSkinPerformanceModeBackfillsLegacyConfig(t *testing.T) {
	cfg := DefaultConfig()
	cfg.SkinPerformanceMode = "" // 模拟旧版本配置（字段不存在 → 零值）
	normalize(cfg)
	if cfg.SkinPerformanceMode != "smooth" {
		t.Errorf("旧配置经 normalize 后 = %q，期望补齐为 smooth", cfg.SkinPerformanceMode)
	}
}

// 档位可选值必须与前端 SKIN_PERFORMANCE_MODES 一一对应。
func TestSkinPerformanceModesList(t *testing.T) {
	want := map[string]bool{"smooth": true, "performance": true}
	if len(SkinPerformanceModes) != len(want) {
		t.Fatalf("SkinPerformanceModes 有 %d 项，期望 %d 项（前端 SKIN_PERFORMANCE_MODES 必须一一对应）",
			len(SkinPerformanceModes), len(want))
	}
	for _, m := range SkinPerformanceModes {
		if !want[m] {
			t.Errorf("出现了前端不认识的档位 %q", m)
		}
	}
}
