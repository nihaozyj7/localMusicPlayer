package bootstrap

import (
	"encoding/json"
	"testing"
)

// 主窗口圆角（WindowCorners）的规范化与落盘测试。
//
// 这个值会一路走到 DWM 的 DWMWA_WINDOW_CORNER_PREFERENCE，认不出来的写法必须
// 落回 system，而不是把垃圾字符串塞给窗口层。
func TestNormalizeWindowCorners(t *testing.T) {
	cases := map[string]string{
		"system":    "system",
		"round":     "round",
		"small":     "small",
		"square":    "square",
		"  ROUND  ": "round",
		"SQUARE":    "square",
		"":          "system",
		"rounded":   "system", // 不是合法值
		"8px":       "system", // 没有「任意半径」这一档
	}
	for in, want := range cases {
		if got := NormalizeWindowCorners(in); got != want {
			t.Errorf("NormalizeWindowCorners(%q) = %q, 期望 %q", in, got, want)
		}
	}
}

func TestWindowCornersRoundTripAndDefault(t *testing.T) {
	def := DefaultConfig()
	if def.WindowCorners != "system" {
		t.Errorf("默认圆角应为 system，得到 %q", def.WindowCorners)
	}

	// 旧配置里没有这个键：反序列化后是空串，normalize 之后必须是 system，
	// 否则从旧版本升级上来的用户会拿到一个非法值。
	var cfg Config
	if err := json.Unmarshal([]byte("{}"), &cfg); err != nil {
		t.Fatalf("解析空配置失败: %v", err)
	}
	normalize(&cfg)
	if cfg.WindowCorners != "system" {
		t.Errorf("缺省键应回落到 system，得到 %q", cfg.WindowCorners)
	}
}
