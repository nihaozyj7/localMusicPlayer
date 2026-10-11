package lyricsfetch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

const sourceUA = "LMPlayer/1.0 (lyrics)"

// maxErrBody 错误信息里最多带多少字节的响应体（body 上限是 12MB）。
const maxErrBody = 512

// truncateBody 把响应体摘要成便于阅读的一小段；按 rune 边界截断，
// 避免把 UTF-8 码点劈开而在错误信息里出现乱码。
func truncateBody(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) <= maxErrBody {
		return s
	}
	cut := maxErrBody
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut] + "…"
}

func fetchJSON(ctx context.Context, endpoint string, headers map[string]string, out any) error {
	body, err := fetchBytes(ctx, endpoint, headers)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("lyricsfetch: 解析 JSON 失败: %w", err)
	}
	return nil
}

// postJSON 以 JSON 体发一个 POST 并解析响应。
//
// 单独有它的原因：QQ 的 musicu.fcg 只收 POST（GET 那套 c.y.qq.com 接口在部分
// 网络/机房下会整站 500，见 qq.go）。其余来源都是 GET，所以之前没有这个需求。
func postJSON(ctx context.Context, endpoint string, headers map[string]string, payload, out any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("lyricsfetch: 序列化请求失败: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", sourceUA)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	for k, v := range headers {
		if strings.TrimSpace(k) == "" {
			continue
		}
		req.Header.Set(k, v)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 12*1024*1024))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("lyricsfetch: HTTP %d: %s", resp.StatusCode, truncateBody(body))
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("lyricsfetch: 解析 JSON 失败: %w", err)
	}
	return nil
}

func fetchBytes(ctx context.Context, endpoint string, headers map[string]string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", sourceUA)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	for k, v := range headers {
		if strings.TrimSpace(k) == "" {
			continue
		}
		req.Header.Set(k, v)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 12*1024*1024))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("lyricsfetch: HTTP %d: %s", resp.StatusCode, truncateBody(body))
	}
	return body, nil
}
