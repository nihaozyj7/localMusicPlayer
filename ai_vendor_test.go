package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// 「模型类型」的厂商清单在 Go（ai_vendor.go）与前端（ai-vendors.js）各有一份。
//
// 两边都必要：后端要用它决定请求体字段，前端要用它渲染下拉框。
// 但一旦漂了，用户选到的厂商就会与后端实际发送的字段对不上 ——
// 表现是「思考开关时灵时不灵」，很难查。所以这里直接读前端文件做一致性校验。
func TestAIVendorCatalogMatchesFrontend(t *testing.T) {
	raw, err := os.ReadFile("frontend/src/js/ai-vendors.js")
	if err != nil {
		t.Fatalf("读取前端厂商清单失败: %v", err)
	}
	re := regexp.MustCompile(`\{ id: "([a-z]+)",`)
	matches := re.FindAllStringSubmatch(string(raw), -1)
	if len(matches) == 0 {
		t.Fatal("没有从 ai-vendors.js 解析出任何厂商 id")
	}
	frontend := make([]string, 0, len(matches))
	for _, m := range matches {
		frontend = append(frontend, m[1])
	}
	backend := make([]string, 0, len(aiVendorCatalog))
	for _, v := range aiVendorCatalog {
		backend = append(backend, v.ID)
	}
	if strings.Join(frontend, ",") != strings.Join(backend, ",") {
		t.Fatalf("厂商清单不一致：\n后端 = %v\n前端 = %v", backend, frontend)
	}
}

func TestAIVendorThinkingFields(t *testing.T) {
	cases := []struct {
		vendor   string
		model    string
		thinking bool
		wantKey  string
	}{
		{"openai", "gpt-5", false, "reasoning_effort"},
		{"openai", "o3-mini", false, "reasoning_effort"},
		{"deepseek", "deepseek-chat", false, "thinking"},
		{"qwen", "qwen3-max", false, "enable_thinking"},
		{"openrouter", "x", false, "reasoning"},
	}
	for _, c := range cases {
		fields := aiThinkingFields(c.vendor, c.model, c.thinking)
		if _, ok := fields[c.wantKey]; !ok {
			t.Errorf("%s 关闭思考时应包含字段 %q，实际 %v", c.vendor, c.wantKey, fields)
		}
	}
	// OpenAI 的 o 系列不接受 none，只能降到 minimal
	if got := aiThinkingFields("openai", "o3-mini", false)["reasoning_effort"]; got != "minimal" {
		t.Errorf("o 系列应使用 minimal，实际 %v", got)
	}
	if got := aiThinkingFields("openai", "gpt-5", false)["reasoning_effort"]; got != "none" {
		t.Errorf("GPT-5 应使用 none，实际 %v", got)
	}
	// MiniMax 没有官方关闭字段：不要凭空造字段（会被网关拒）
	if fields := aiThinkingFields("minimax", "abab", false); len(fields) != 0 {
		t.Errorf("MiniMax 不应发送思考字段，实际 %v", fields)
	}
	// 开启思考时：DeepSeek 必须带 thinking.enabled
	if fields := aiThinkingFields("deepseek", "deepseek-chat", true); fields["thinking"] == nil {
		t.Errorf("DeepSeek 开启思考应带 thinking 字段，实际 %v", fields)
	}
	// temperature 冲突只在部分厂商生效
	if !aiDropTemperature("deepseek") || !aiDropTemperature("anthropic") || aiDropTemperature("qwen") {
		t.Error("aiDropTemperature 的厂商判定不对")
	}
}

func TestDetectAIVendor(t *testing.T) {
	cases := []struct {
		base, model, want string
	}{
		{"https://api.deepseek.com/v1", "deepseek-chat", "deepseek"},
		{"https://openrouter.ai/api/v1", "any", "openrouter"},
		{"https://api.moonshot.cn/v1", "kimi-k2", "kimi"},
		{"https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen3-max", "qwen"},
		{"http://localhost:9004/v1", "auto-low", "openai"},
		{"", "claude-sonnet-4", "anthropic"},
	}
	for _, c := range cases {
		if got := detectAIVendor(c.base, c.model); got != c.want {
			t.Errorf("detectAIVendor(%q, %q) = %q，期望 %q", c.base, c.model, got, c.want)
		}
	}
}
