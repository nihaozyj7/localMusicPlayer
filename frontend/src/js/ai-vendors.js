/* ==========================================================================
   ai-vendors.js — 「模型类型」下拉框的厂商清单
   --------------------------------------------------------------------------
   思考模式的请求体字段各家完全不同（见 Go 侧 ai_vendor.go）：

     OpenAI / xAI / Gemini / Ollama      reasoning_effort: "none" | "low" | ...
     DeepSeek / Anthropic / GLM / Kimi   thinking: {type: "disabled" | "enabled"}
     Qwen / SiliconFlow                  enable_thinking: false | true
     OpenRouter                          reasoning: {enabled: false} / {effort: ...}

   所以用户必须告诉程序「我填的是哪家的模型」，否则开关无从下手。

   ⚠️ 这份清单与 Go 侧 ai_vendor.go 的 aiVendorCatalog **必须保持一致**：
   id 的顺序与取值都会被 ai_vendor_test.go 校验，改一边忘了另一边会测试失败。
   ========================================================================== */

export const AI_VENDORS = [
  { id: "auto", label: "自动识别（按接口地址与模型名判断）", hint: "识别不出时按 OpenAI 兼容接口处理" },
  { id: "openai", label: "OpenAI（GPT-5 系列 / o 系列）", hint: "o 系列无法完全关闭思考，只能降到最低档" },
  { id: "deepseek", label: "DeepSeek（deepseek-chat / reasoner）", hint: "思考模式下 temperature 会被忽略" },
  { id: "anthropic", label: "Anthropic Claude", hint: "开启思考时 temperature 必须为 1，程序会自动去掉它" },
  { id: "gemini", label: "Google Gemini", hint: "Pro 系列无法关闭思考" },
  { id: "qwen", label: "阿里通义千问 Qwen", hint: "仅「混合思考」模型可关闭；部分开源模型只支持流式" },
  { id: "glm", label: "智谱 GLM", hint: "GLM-5.3 系列传 disabled 会报错" },
  { id: "kimi", label: "月之暗面 Kimi", hint: "kimi-k3 / k2.7-code 始终思考，传 thinking 会报错" },
  { id: "minimax", label: "MiniMax", hint: "官方未提供关闭思考的参数，只能保持默认" },
  { id: "xai", label: "xAI Grok", hint: "reasoning_effort=none 可真正关闭" },
  { id: "openrouter", label: "OpenRouter（统一网关）", hint: "统一 reasoning 字段；标记 mandatory 的模型不接受关闭" },
  { id: "siliconflow", label: "SiliconFlow（硅基流动）", hint: "R1 类纯推理模型无法关闭" },
  { id: "ollama", label: "Ollama（本地，OpenAI 兼容）", hint: "本地兼容层用 reasoning_effort；GPT-OSS 无法完全关闭" },
];

export function aiVendorLabel(id) {
  return AI_VENDORS.find((v) => v.id === id)?.label || id || "自动识别";
}

export function aiVendorHint(id) {
  return AI_VENDORS.find((v) => v.id === id)?.hint || "";
}
