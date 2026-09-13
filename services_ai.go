package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"musicplayer/internal/bootstrap"
)

// AiService 用 OpenAI 兼容的 Chat Completions 接口做「元数据清洗」。
//
// 场景：本地文件名里往往带着歌名/歌手，但混有各种脏数据（括号、序号、编码、
// 多余的广告文案…），直接拿去联网匹配歌词/封面很难命中。这里让 AI 依据
// 现有元数据 + 文件名，判断出真实的 title / artist / album，再交给匹配器。
//
// 说明：这个服务只被 CoverService 等后端逻辑内部调用，不直接暴露给前端，
// 因此不需要为它生成前端绑定。
type AiService struct {
	store  *bootstrap.Store
	client *http.Client

	// cache 元数据清洗结果的缓存。
	//
	// 为什么必须有：AI 一次调用实测 8~18 秒，而歌词/封面匹配会在
	// 「自动匹配一次 + 适配器再确认一次」的路径上重复请求同一首歌。
	// 没有缓存时用户会看到「同一首歌反复等十几秒」，而且第三方网关
	// 被这么打很容易限流。
	mu    sync.Mutex
	cache map[string]aiCacheEntry
}

type aiCacheEntry struct {
	meta CleanMeta
	at   time.Time
	// failed 标记「这次清洗失败了」，也缓存，但只缓存很短时间：
	// 网关挂掉时不应该让每首歌都白等一次 20 秒超时。
	failed bool
}

const (
	// aiCacheTTL 成功结果的缓存时长。元数据基本不变，缓存久一点没问题。
	aiCacheTTL = 6 * time.Hour
	// aiCacheFailTTL 失败结果的缓存时长。短一些，网关恢复后能自动重试。
	aiCacheFailTTL = 3 * time.Minute
)

func NewAiService(store *bootstrap.Store) *AiService {
	return &AiService{
		store:  store,
		client: &http.Client{Timeout: 20 * time.Second},
		cache:  map[string]aiCacheEntry{},
	}
}

// cachedMeta 读缓存（命中且未过期才算命中）。
func (s *AiService) cachedMeta(key string) (CleanMeta, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.cache[key]
	if !ok {
		return CleanMeta{}, false
	}
	ttl := aiCacheTTL
	if entry.failed {
		ttl = aiCacheFailTTL
	}
	if time.Since(entry.at) > ttl {
		delete(s.cache, key)
		return CleanMeta{}, false
	}
	if entry.failed {
		return CleanMeta{}, false
	}
	return entry.meta, true
}

func (s *AiService) storeCache(key string, meta CleanMeta, failed bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// 简单的容量上限：元数据键是「标题|歌手|专辑」，几十首歌的场景完全够用，
	// 这里只是防止长时间运行后无限增长。
	if len(s.cache) > 512 {
		for k := range s.cache {
			delete(s.cache, k)
			if len(s.cache) <= 256 {
				break
			}
		}
	}
	s.cache[key] = aiCacheEntry{meta: meta, at: time.Now(), failed: failed}
}

// CleanMeta AI 清洗后的元数据。
type CleanMeta struct {
	Title  string `json:"title"`
	Artist string `json:"artist"`
	Album  string `json:"album"`
}

// Enabled 是否已配置可用的 AI 服务。
func (s *AiService) Enabled() bool {
	if s == nil {
		return false
	}
	cfg := s.store.Get()
	return strings.TrimSpace(cfg.AIBaseURL) != "" && strings.TrimSpace(cfg.AIAPIKey) != ""
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// ExtractMeta 对脏元数据做一次清洗。失败时返回 ErrAINotConfigured 或其它错误，
// 调用方应回退到原始元数据继续匹配（AI 只是加分项，不是硬依赖）。
func (s *AiService) ExtractMeta(title, artist, album, filename string) (CleanMeta, error) {
	if !s.Enabled() {
		return CleanMeta{}, ErrAINotConfigured
	}
	cacheKey := strings.Join([]string{
		strings.TrimSpace(title), strings.TrimSpace(artist), strings.TrimSpace(album),
	}, "|")
	if meta, ok := s.cachedMeta(cacheKey); ok {
		return meta, nil
	}
	cfg := s.store.Get()

	base := strings.TrimRight(strings.TrimSpace(cfg.AIBaseURL), "/")
	if !strings.Contains(base, "://") {
		base = "https://" + base
	}
	model := strings.TrimSpace(cfg.AIModelID)
	if model == "" {
		model = "gpt-4o-mini"
	}

	system := "你是音乐元数据清洗助手。用户的本地音乐文件可能来自文件名，里面混有各种脏数据" +
		"（括号、序号、编码、标点、广告文案等）。请根据提供的字段，提取真实的 歌曲名(title)、" +
		"歌手(artist)、专辑(album)。只输出一个 JSON 对象，形如 " +
		`{"title":"...","artist":"...","album":"..."}` +
		"；无法确定的字段用空字符串。不要输出 JSON 以外的任何内容。"
	// 注意：思考模式不再靠「在提示词里加一句请仔细推理」假装开关 ——
	// 真正的开关是各家的请求体字段（见 ai_vendor.go）。提示词只描述任务本身。

	user := fmt.Sprintf(
		"候选元数据：\n标题（title）：%s\n歌手（artist）：%s\n专辑（album）：%s\n完整文件名：%s",
		title, artist, album, filename,
	)

	// 「模型类型」决定思考开关用哪家的字段；选自动时按接口地址与模型名猜。
	vendor := strings.TrimSpace(cfg.AIVendor)
	if vendor == "" || vendor == aiVendorAuto {
		vendor = detectAIVendor(base, model)
	}
	thinking := cfg.AIThinking
	fields := aiThinkingFields(vendor, model, thinking)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	meta, err := s.requestMeta(ctx, base, cfg.AIAPIKey, model, system, user, vendor, thinking, fields)
	if err != nil && len(fields) > 0 && isAIRejectedParams(err) {
		// 厂商/模型选得不对时，思考开关字段可能被服务端直接拒（400 / 422）。
		// 退一步去掉这些字段重发一次：保证 AI 清洗本身仍然可用 ——
		// 「开关没生效」不该升级成「AI 功能整个不可用」。
		meta, err = s.requestMeta(ctx, base, cfg.AIAPIKey, model, system, user, vendor, thinking, nil)
	}
	if err != nil {
		s.storeCache(cacheKey, CleanMeta{}, true)
		return CleanMeta{}, err
	}
	s.storeCache(cacheKey, meta, false)
	return meta, nil
}

// buildChatBody 组装 /chat/completions 的请求体。
//
// 单独抽出来是为了能被测试直接断言：思考开关的坑全在「发出去的字段」上，
// 只测 aiThinkingFields 还不够 —— 温度冲突、字段是否真的落在顶层，
// 都要看这里组装出来的最终结果。
func buildChatBody(model, system, user, vendor string, thinking bool, fields map[string]any) map[string]any {
	body := map[string]any{
		"model": model,
		"messages": []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
	}
	// 低温让结果更稳定；但思考模式与采样参数冲突时不发（见 aiDropTemperature）。
	if !(thinking && aiDropTemperature(vendor)) {
		body["temperature"] = 0
	}
	// 思考开关字段是**顶层**字段。官方示例里的 extra_body 只是 OpenAI SDK
	// 用来塞非标准字段的写法，裸 HTTP 不能真的套一层。
	for k, v := range fields {
		body[k] = v
	}
	return body
}

// aiHTTPError 记录服务端返回的非 2xx 状态码，供上层判断「是不是参数被拒」。
type aiHTTPError struct {
	status int
	detail string
}

func (e *aiHTTPError) Error() string {
	return fmt.Sprintf("AI 服务返回 %d：%s", e.status, e.detail)
}

// isAIRejectedParams 判断错误是不是「请求体里的字段不被接受」。
//
// 只认 400 / 422：这两种才值得去掉思考参数重试。401/403 是鉴权问题、
// 429 是限流、5xx 是服务端故障，重发一次没有意义。
func isAIRejectedParams(err error) bool {
	var httpErr *aiHTTPError
	if errors.As(err, &httpErr) {
		return httpErr.status == http.StatusBadRequest || httpErr.status == http.StatusUnprocessableEntity
	}
	return false
}

// requestMeta 组装请求体并调用一次 /chat/completions。
//
// fields 为空表示「不带任何思考开关字段」（厂商不支持，或上一次被拒后的重试）。
func (s *AiService) requestMeta(
	ctx context.Context,
	base, apiKey, model, system, user, vendor string,
	thinking bool,
	fields map[string]any,
) (CleanMeta, error) {
	body := buildChatBody(model, system, user, vendor, thinking, fields)

	raw, err := json.Marshal(body)
	if err != nil {
		return CleanMeta{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return CleanMeta{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))

	resp, err := s.client.Do(req)
	if err != nil {
		return CleanMeta{}, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return CleanMeta{}, &aiHTTPError{status: resp.StatusCode, detail: strings.TrimSpace(string(respBody))}
	}

	var parsed chatResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return CleanMeta{}, fmt.Errorf("解析 AI 响应失败: %w", err)
	}
	if parsed.Error != nil && parsed.Error.Message != "" {
		return CleanMeta{}, fmt.Errorf("AI 服务错误: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return CleanMeta{}, errors.New("AI 没有返回结果")
	}

	content := stripJSONFence(strings.TrimSpace(parsed.Choices[0].Message.Content))
	var meta CleanMeta
	if err := json.Unmarshal([]byte(content), &meta); err != nil {
		return CleanMeta{}, fmt.Errorf("AI 返回内容不是合法 JSON: %w", err)
	}
	return meta, nil
}

// ErrAINotConfigured 表示还未填写 baseUrl / apiKey。
var ErrAINotConfigured = errors.New("AI 未配置")

func stripJSONFence(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		if idx := strings.IndexByte(s, '\n'); idx >= 0 {
			s = s[idx+1:]
		}
		s = strings.TrimSuffix(strings.TrimSpace(s), "```")
	}
	return strings.TrimSpace(s)
}
