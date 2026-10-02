/* ==========================================================================
   config_effect_test.go — 音效档位在配置层的校验
   --------------------------------------------------------------------------
   这里守的是"两处档位列表必须一致"。

   为什么要两处列表：bootstrap 是最底层包，不能反过来依赖 internal/audioplay
   （那会把依赖方向弄反，同样的取舍见 config.go 里 UpdateChannel 的注释）。
   但"两处各写一份"就必然会漂移 —— 加了新档位却只改一边，
   症状是"设置界面能看到但存不住"或者"存住了但重新打开没了"。

   这个测试就是那道防线：它把两份列表拿来逐项对比。

   ★ 注意依赖方向：本文件（测试）import 了 internal/audioplay，但
     **生产代码**依然是 bootstrap 不依赖任何业务包。
     audioplay 也不 import bootstrap，所以不存在循环。
     用测试承担这个校验，既拿到强保证，又保住了生产代码的依赖方向 ——
     这正是"两处列表"这个设计能成立的前提。
   ========================================================================== */

package bootstrap

import (
	"encoding/json"
	"testing"

	"localmusicplayer/internal/audioplay"
)

// TestEffectPresetsMatchAudioLayer 验证配置层的档位列表与 audioplay 完全一致。
func TestEffectPresetsMatchAudioLayer(t *testing.T) {
	audioPresets := make([]string, len(audioplay.EffectPresets))
	for i, p := range audioplay.EffectPresets {
		audioPresets[i] = string(p)
	}

	if len(EffectPresets) != len(audioPresets) {
		t.Fatalf("配置层 %d 个档位，audioplay %d 个 —— 两处列表已漂移：\n配置层: %v\n业务层: %v",
			len(EffectPresets), len(audioPresets), EffectPresets, audioPresets)
	}
	// 顺序也要一致：设置界面的按钮顺序直接取配置层的列表，
	// 顺序不同会让两边显示的按钮排列不一样。
	for i := range EffectPresets {
		if EffectPresets[i] != audioPresets[i] {
			t.Errorf("第 %d 个档位不一致：配置层 %q，业务层 %q",
				i, EffectPresets[i], audioPresets[i])
		}
	}
}

// TestNormalizeEffectPresetConfig 验证配置层的收敛行为。
func TestNormalizeEffectPresetConfig(t *testing.T) {
	cases := map[string]string{
		"off":      "off",
		"vocal":    "vocal",
		"bass":     "bass",
		"surround": "surround",
		"live":     "live",
		"hall":     "hall",
		// 大小写与空白要能容忍（手改配置文件很容易带上）
		"  VOCAL  ": "vocal",
		"Hall":      "hall",
		// 非法值一律落回 off
		"":        "off",
		"bogus":   "off",
		"eq":      "off",
		"reverb!": "off",
		"offf":    "off",
	}
	for in, want := range cases {
		if got := NormalizeEffectPreset(in); got != want {
			t.Errorf("NormalizeEffectPreset(%q) = %q，期望 %q", in, got, want)
		}
	}
}

// TestDefaultEffectPresetIsOff 验证默认档位是 off。
//
// ★ 这是一个**产品立场**的测试，不是技术细节：
// 音效会改变用户听到的声音，所以默认必须是"什么都不做"。
// 这条测试防的是"某次重构顺手把默认值改成了 vocal"——
// 那会让所有用户在升级后被静默地加了一层 EQ。
func TestDefaultEffectPresetIsOff(t *testing.T) {
	def := DefaultConfig()
	if def.EffectPreset != "off" {
		t.Errorf("默认音效档位 = %q，期望 off（任何改动音频的处理都必须由用户明确开启）",
			def.EffectPreset)
	}
}

// TestNormalizeConfigEffectPreset 验证 normalize 会把非法档位收敛掉。
func TestNormalizeConfigEffectPreset(t *testing.T) {
	cfg := DefaultConfig()
	cfg.EffectPreset = "a-preset-from-a-future-version"
	normalize(cfg)
	if cfg.EffectPreset != "off" {
		t.Errorf("normalize 之后的档位 = %q，期望 off", cfg.EffectPreset)
	}
}

// TestEffectPresetRoundTripThroughJSON 验证档位能穿过 JSON 往返。
//
// 配置是落盘的 JSON，字段名写错（比如 json tag 拼错）会让这个值
// 永远存不住 —— 而那种错误在纯内存测试里完全看不出来。
func TestEffectPresetRoundTripThroughJSON(t *testing.T) {
	cfg := DefaultConfig()
	cfg.EffectPreset = "hall"

	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("序列化失败: %v", err)
	}

	var back Config
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatalf("反序列化失败: %v", err)
	}
	if back.EffectPreset != "hall" {
		t.Errorf("JSON 往返之后 = %q，期望 hall（json tag 可能写错了）", back.EffectPreset)
	}
}
