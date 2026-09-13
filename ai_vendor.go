package main

import (
	"strings"
)

/* ==========================================================================
   AI「思考模式」的厂商适配
   --------------------------------------------------------------------------
   问题：思考模式并不是一个通用开关。各家用的字段完全不同：

     OpenAI / xAI / Gemini / Ollama      reasoning_effort: "none" | "low" | ...
     DeepSeek / Anthropic / GLM / Kimi   thinking: {type: "disabled" | "enabled"}
     Qwen / SiliconFlow                  enable_thinking: false | true
     OpenRouter                          reasoning: {enabled: false} / {effort: ...}

   旧实现只做了一件事：把 temperature 去掉、并在系统提示里加一句「请先仔细推理」。
   那对任何一家都不算「开关」—— 用户打开/关闭思考时行为完全一样，
   所以看起来「开关没生效」。

   另一个容易踩的坑：这些字段在**裸 HTTP 请求体里都是顶层字段**。
   官方示例里的 extra_body 只是 OpenAI Python SDK 用来塞非标准字段的写法，
   直接 POST JSON 时不能真的构造一层 extra_body 嵌套对象。

   本文件只负责「厂商 → 请求体字段」的映射；调用方见 services_ai.go。
   ========================================================================== */

const (
	aiVendorAuto        = "auto"
	aiVendorOpenAI      = "openai"
	aiVendorDeepSeek    = "deepseek"
	aiVendorAnthropic   = "anthropic"
	aiVendorGemini      = "gemini"
	aiVendorQwen        = "qwen"
	aiVendorGLM         = "glm"
	aiVendorKimi        = "kimi"
	aiVendorMiniMax     = "minimax"
	aiVendorXAI         = "xai"
	aiVendorOpenRouter  = "openrouter"
	aiVendorSiliconFlow = "siliconflow"
	aiVendorOllama      = "ollama"
)

// aiVendorInfo 供设置界面渲染「模型类型」下拉框（由 ConfigService.AIProviders 返回）。
type aiVendorInfo struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	// Hint 该厂商在思考开关上的限制（无法真正关闭 / 需要特定模型），界面直接展示
	Hint string `json:"hint"`
}

// aiVendorCatalog 下拉框顺序：auto 在最前（默认），其余按使用频率排。
var aiVendorCatalog = []aiVendorInfo{
	{ID: aiVendorAuto, Label: "自动识别（按接口地址与模型名判断）", Hint: "识别不出时按 OpenAI 兼容接口处理"},
	{ID: aiVendorOpenAI, Label: "OpenAI（GPT-5 系列 / o 系列）", Hint: "o 系列无法完全关闭思考，只能降到最低档"},
	{ID: aiVendorDeepSeek, Label: "DeepSeek（deepseek-chat / reasoner）", Hint: "思考模式下 temperature 会被忽略"},
	{ID: aiVendorAnthropic, Label: "Anthropic Claude", Hint: "开启思考时 temperature 必须为 1，程序会自动去掉它"},
	{ID: aiVendorGemini, Label: "Google Gemini", Hint: "Pro 系列无法关闭思考"},
	{ID: aiVendorQwen, Label: "阿里通义千问 Qwen", Hint: "仅「混合思考」模型可关闭；部分开源模型只支持流式"},
	{ID: aiVendorGLM, Label: "智谱 GLM", Hint: "GLM-5.3 系列传 disabled 会报错"},
	{ID: aiVendorKimi, Label: "月之暗面 Kimi", Hint: "kimi-k3 / k2.7-code 始终思考，传 thinking 会报错"},
	{ID: aiVendorMiniMax, Label: "MiniMax", Hint: "官方未提供关闭思考的参数，只能保持默认"},
	{ID: aiVendorXAI, Label: "xAI Grok", Hint: "reasoning_effort=none 可真正关闭"},
	{ID: aiVendorOpenRouter, Label: "OpenRouter（统一网关）", Hint: "统一 reasoning 字段；标记 mandatory 的模型不接受关闭"},
	{ID: aiVendorSiliconFlow, Label: "SiliconFlow（硅基流动）", Hint: "R1 类纯推理模型无法关闭"},
	{ID: aiVendorOllama, Label: "Ollama（本地，OpenAI 兼容）", Hint: "本地兼容层用 reasoning_effort；GPT-OSS 无法完全关闭"},
}

// aiProvidersForUI 返回给前端的厂商清单。
func aiProvidersForUI() []aiVendorInfo {
	out := make([]aiVendorInfo, len(aiVendorCatalog))
	copy(out, aiVendorCatalog)
	return out
}

func isValidAIVendor(id string) bool {
	id = strings.TrimSpace(id)
	if id == "" {
		return true // 空 = 用默认（auto）
	}
	for _, v := range aiVendorCatalog {
		if v.ID == id {
			return true
		}
	}
	return false
}

// detectAIVendor 按 Base URL 与模型名猜厂商（「模型类型」选自动时走这里）。
//
// 猜错的后果被 services_ai.go 里的「400 就去掉思考参数重试一次」兜住了，
// 所以这里宁可猜得果断一点。
func detectAIVendor(baseURL, model string) string {
	url := strings.ToLower(strings.TrimSpace(baseURL))
	name := strings.ToLower(strings.TrimSpace(model))

	switch {
	case containsAny(url, "openrouter.ai"):
		return aiVendorOpenRouter
	case containsAny(url, "siliconflow"):
		return aiVendorSiliconFlow
	case containsAny(url, "deepseek"):
		return aiVendorDeepSeek
	case containsAny(url, "anthropic", "claude"):
		return aiVendorAnthropic
	case containsAny(url, "generativelanguage.googleapis", "googleapis", "gemini"):
		return aiVendorGemini
	case containsAny(url, "dashscope", "aliyuncs", "bailian"):
		return aiVendorQwen
	case containsAny(url, "bigmodel", "zhipu"):
		return aiVendorGLM
	case containsAny(url, "moonshot", "kimi"):
		return aiVendorKimi
	case containsAny(url, "minimax"):
		return aiVendorMiniMax
	case containsAny(url, "x.ai"):
		return aiVendorXAI
	case containsAny(url, "11434", "ollama"):
		return aiVendorOllama
	}

	switch {
	case strings.HasPrefix(name, "claude"):
		return aiVendorAnthropic
	case strings.HasPrefix(name, "gemini"):
		return aiVendorGemini
	case strings.HasPrefix(name, "qwen"):
		return aiVendorQwen
	case strings.HasPrefix(name, "glm"):
		return aiVendorGLM
	case strings.HasPrefix(name, "kimi"), strings.HasPrefix(name, "moonshot"):
		return aiVendorKimi
	case strings.HasPrefix(name, "minimax"), strings.HasPrefix(name, "abab"):
		return aiVendorMiniMax
	case strings.HasPrefix(name, "grok"):
		return aiVendorXAI
	case strings.HasPrefix(name, "deepseek"):
		return aiVendorDeepSeek
	}

	// 兜底：OpenAI 兼容接口是事实标准，reasoning_effort 也是被最多网关接受的写法
	return aiVendorOpenAI
}

// aiThinkingFields 返回「思考开关」要写进请求体的顶层字段。
//
// 返回 nil 表示该厂商没有可用的开关字段（例如 MiniMax），
// 此时调用方应当照常请求，不要凭空造字段。
func aiThinkingFields(vendor, model string, thinking bool) map[string]any {
	switch vendor {
	case aiVendorOpenAI:
		if thinking {
			return map[string]any{"reasoning_effort": "medium"}
		}
		return map[string]any{"reasoning_effort": openAIReasoningOff(model)}
	case aiVendorDeepSeek:
		if thinking {
			return map[string]any{"thinking": map[string]any{"type": "enabled"}, "reasoning_effort": "high"}
		}
		return map[string]any{"thinking": map[string]any{"type": "disabled"}}
	case aiVendorAnthropic:
		if thinking {
			return map[string]any{"thinking": map[string]any{"type": "enabled", "budget_tokens": 4096}}
		}
		return map[string]any{"thinking": map[string]any{"type": "disabled"}}
	case aiVendorGemini:
		if thinking {
			return map[string]any{"reasoning_effort": "high"}
		}
		return map[string]any{"reasoning_effort": "none"}
	case aiVendorQwen:
		if thinking {
			return map[string]any{"enable_thinking": true, "thinking_budget": 2048}
		}
		return map[string]any{"enable_thinking": false}
	case aiVendorGLM:
		if thinking {
			return map[string]any{"thinking": map[string]any{"type": "enabled"}}
		}
		return map[string]any{"thinking": map[string]any{"type": "disabled"}}
	case aiVendorKimi:
		if thinking {
			return map[string]any{"thinking": map[string]any{"type": "enabled"}}
		}
		return map[string]any{"thinking": map[string]any{"type": "disabled"}}
	case aiVendorXAI:
		if thinking {
			return map[string]any{"reasoning_effort": "high"}
		}
		return map[string]any{"reasoning_effort": "none"}
	case aiVendorOpenRouter:
		if thinking {
			return map[string]any{"reasoning": map[string]any{"effort": "high"}}
		}
		return map[string]any{"reasoning": map[string]any{"enabled": false}}
	case aiVendorSiliconFlow:
		if thinking {
			return map[string]any{"enable_thinking": true, "thinking_budget": 1024}
		}
		return map[string]any{"enable_thinking": false}
	case aiVendorOllama:
		if thinking {
			return map[string]any{"reasoning_effort": "high"}
		}
		return map[string]any{"reasoning_effort": "none"}
	}
	// MiniMax 等：官方没有关闭字段，不造字段，免得被网关直接拒掉
	return nil
}

// openAIReasoningOff 选 OpenAI 的「关闭思考」取值。
//
// GPT-5 及更新模型接受 reasoning_effort=none；o 系列（o1/o3/o4）不接受 none，
// 会把请求打成 400，最低只能到 minimal。
func openAIReasoningOff(model string) string {
	name := strings.ToLower(strings.TrimSpace(model))
	if strings.HasPrefix(name, "o1") || strings.HasPrefix(name, "o3") || strings.HasPrefix(name, "o4") {
		return "minimal"
	}
	return "none"
}

// aiDropTemperature 判断「开启思考」时是否必须去掉 temperature。
//
// 硬冲突（官方明文）：DeepSeek 思考模式下 temperature / presence_penalty /
// frequency_penalty 全部无效；Anthropic 开启 extended thinking 时 temperature
// 只能为 1；OpenAI 推理模型不接受采样参数。与其发一个会被忽略甚至报错的值，
// 不如直接不发。
func aiDropTemperature(vendor string) bool {
	switch vendor {
	case aiVendorDeepSeek, aiVendorAnthropic, aiVendorOpenAI:
		return true
	}
	return false
}

// aiVendorHint 返回该厂商的限制说明（设置界面展示）。
func aiVendorHint(vendor string) string {
	for _, v := range aiVendorCatalog {
		if v.ID == vendor {
			return v.Hint
		}
	}
	return ""
}

func containsAny(haystack string, needles ...string) bool {
	for _, n := range needles {
		if strings.Contains(haystack, n) {
			return true
		}
	}
	return false
}
