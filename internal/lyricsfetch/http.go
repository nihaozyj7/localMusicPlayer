package lyricsfetch

import (
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

const sourceUA = "MusicPlayer/1.0 (lyrics)"

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

func fetchText(ctx context.Context, endpoint string, headers map[string]string) (string, error) {
	body, err := fetchBytes(ctx, endpoint, headers)
	if err != nil {
		return "", err
	}
	return string(body), nil
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
