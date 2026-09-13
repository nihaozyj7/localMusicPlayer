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
}

func NewAiService(store *bootstrap.Store) *AiService {
	return &AiService{
		store:  store,
		client: &http.Client{Timeout: 20 * time.Second},
	}
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

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
	// 低温让结果更稳定；思考模式下部分推理模型不接受 temperature，因此省略。
	Temperature *float64 `json:"temperature,omitempty"`
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
	if cfg.AIThinking {
		system += "请先在内部仔细推理再给出结论。"
	}

	user := fmt.Sprintf(
		"候选元数据：\n标题（title）：%s\n歌手（artist）：%s\n专辑（album）：%s\n完整文件名：%s",
		title, artist, album, filename,
	)

	reqBody := chatRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
	}
	if !cfg.AIThinking {
		zero := 0.0
		reqBody.Temperature = &zero
	}

	raw, err := json.Marshal(reqBody)
	if err != nil {
		return CleanMeta{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return CleanMeta{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(cfg.AIAPIKey))

	resp, err := s.client.Do(req)
	if err != nil {
		return CleanMeta{}, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return CleanMeta{}, fmt.Errorf("AI 服务返回 %d：%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed chatResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return CleanMeta{}, fmt.Errorf("解析 AI 响应失败: %w", err)
	}
	if parsed.Error != nil && parsed.Error.Message != "" {
		return CleanMeta{}, fmt.Errorf("AI 服务错误: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return CleanMeta{}, errors.New("AI 没有返回结果")
	}

	content := strings.TrimSpace(parsed.Choices[0].Message.Content)
	content = stripJSONFence(content)

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