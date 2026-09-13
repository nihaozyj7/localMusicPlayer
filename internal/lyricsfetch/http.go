package lyricsfetch

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

const sourceUA = "MusicPlayer/1.0 (lyrics)"

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
		return nil, fmt.Errorf("lyricsfetch: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return body, nil
}
