package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// 思考开关到底有没有发出去、发的是哪家的字段，只能在最终请求体上验证。
func TestBuildChatBodyCarriesThinkingSwitch(t *testing.T) {
	raw := func(vendor string, thinking bool) string {
		fields := aiThinkingFields(vendor, "m", thinking)
		b, err := json.Marshal(buildChatBody("m", "sys", "user", vendor, thinking, fields))
		if err != nil {
			t.Fatalf("序列化失败: %v", err)
		}
		return string(b)
	}

	off := raw("deepseek", false)
	if !strings.Contains(off, `"thinking":{"type":"disabled"}`) {
		t.Errorf("DeepSeek 关闭思考应带 thinking.disabled，实际 %s", off)
	}
	on := raw("deepseek", true)
	if !strings.Contains(on, `"thinking":{"type":"enabled"}`) || !strings.Contains(on, `"reasoning_effort":"high"`) {
		t.Errorf("DeepSeek 开启思考应带 thinking.enabled + reasoning_effort，实际 %s", on)
	}
	// DeepSeek 思考模式下 temperature 被官方声明为无效，必须不发
	if strings.Contains(on, "temperature") {
		t.Errorf("DeepSeek 开启思考不应发 temperature，实际 %s", on)
	}
	if !strings.Contains(off, "temperature") {
		t.Errorf("关闭思考时应保留 temperature，实际 %s", off)
	}

	// MiniMax 没有官方关闭字段：不能凭空造字段
	if mm := raw("minimax", false); strings.Contains(mm, "thinking") || strings.Contains(mm, "enable_thinking") {
		t.Errorf("MiniMax 不应凭空造思考字段，实际 %s", mm)
	}

	// 各家关闭值不一样，最容易错的就是这里
	cases := map[string]string{
		"qwen":        `"enable_thinking":false`,
		"siliconflow": `"enable_thinking":false`,
		"openai":      `"reasoning_effort":"none"`,
		"xai":         `"reasoning_effort":"none"`,
		"gemini":      `"reasoning_effort":"none"`,
		"openrouter":  `"reasoning":{"enabled":false}`,
		"glm":         `"thinking":{"type":"disabled"}`,
		"kimi":        `"thinking":{"type":"disabled"}`,
		"anthropic":   `"thinking":{"type":"disabled"}`,
		"ollama":      `"reasoning_effort":"none"`,
	}
	for vendor, want := range cases {
		if got := raw(vendor, false); !strings.Contains(got, want) {
			t.Errorf("%s 关闭思考应包含 %s，实际 %s", vendor, want, got)
		}
	}
}
