package bilibili

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultBaseURL = "https://api.bilibili.com"
	desktopUA      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

// Client 是哔哩哔哩公开 Web 接口的最小客户端。
//
// 搜索与播放地址接口现在需要 WBI 签名；本客户端会自动获取 wbi_img 密钥、
// 缓存 12 小时，并在请求前完成签名。
type Client struct {
	hc    *http.Client
	ua    string
	buvid string

	mu     sync.RWMutex
	imgKey string
	subKey string
	wbiAt  time.Time
}

// NewClient 创建客户端。
func NewClient() *Client {
	return &Client{
		hc: &http.Client{
			Timeout: 20 * time.Second,
		},
		ua:    desktopUA,
		buvid: randomBuvid3(),
	}
}

// BaseURL 暴露 API 根地址，便于测试时替换（未导出字段无法从外部覆盖时使用）。
func (c *Client) BaseURL() string { return defaultBaseURL }

func randomBuvid3() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "00000000-0000-4000-8000-000000000000infoc"
	}
	// UUID v4 格式 + infoc，B 站只把它当普通设备标识。
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b[:])
	return fmt.Sprintf("%s-%s-%s-%s-%sinfoc", h[0:8], h[8:12], h[12:16], h[16:20], h[20:32])
}

func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("User-Agent", c.ua)
	req.Header.Set("Referer", "https://www.bilibili.com/")
	req.Header.Set("Origin", "https://www.bilibili.com")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	req.Header.Set("Cookie", "buvid3="+c.buvid+"; b_nut="+strconv.FormatInt(time.Now().Unix(), 10))
}

func (c *Client) getJSON(ctx context.Context, endpoint string, params url.Values, out any, withWBI bool) error {
	if params == nil {
		params = url.Values{}
	}
	if withWBI {
		if err := c.sign(ctx, params); err != nil {
			return err
		}
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return fmt.Errorf("bilibili: 非法接口地址: %w", err)
	}
	q := u.Query()
	for k, vals := range params {
		for _, v := range vals {
			q.Add(k, v)
		}
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return err
	}
	c.setHeaders(req)
	resp, err := c.hc.Do(req)
	if err != nil {
		return fmt.Errorf("bilibili: 请求失败: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return fmt.Errorf("bilibili: 读取响应失败: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bilibili: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("bilibili: 解析 JSON 失败: %w", err)
	}
	return nil
}

// ensureWBI 获取并缓存 WBI 签名密钥。
func (c *Client) ensureWBI(ctx context.Context) error {
	c.mu.RLock()
	ok := c.imgKey != "" && c.subKey != "" && time.Since(c.wbiAt) < 12*time.Hour
	c.mu.RUnlock()
	if ok {
		return nil
	}

	var nav struct {
		Code int `json:"code"`
		Data struct {
			WbiImg struct {
				ImgURL string `json:"img_url"`
				SubURL string `json:"sub_url"`
			} `json:"wbi_img"`
		} `json:"data"`
	}
	if err := c.getJSON(ctx, defaultBaseURL+"/x/web-interface/nav", nil, &nav, false); err != nil {
		return err
	}
	img := pathBaseNoExt(nav.Data.WbiImg.ImgURL)
	sub := pathBaseNoExt(nav.Data.WbiImg.SubURL)
	if img == "" || sub == "" {
		return fmt.Errorf("bilibili: nav 接口未返回 wbi_img（code=%d）", nav.Code)
	}
	c.mu.Lock()
	c.imgKey, c.subKey, c.wbiAt = img, sub, time.Now()
	c.mu.Unlock()
	return nil
}

func pathBaseNoExt(raw string) string {
	if raw == "" {
		return ""
	}
	if i := strings.LastIndexByte(raw, '/'); i >= 0 {
		raw = raw[i+1:]
	}
	if i := strings.LastIndexByte(raw, '.'); i >= 0 {
		raw = raw[:i]
	}
	return raw
}

// sign 为 URL 参数追加 wts 与 w_rid。参数会被就地修改。
func (c *Client) sign(ctx context.Context, params url.Values) error {
	if err := c.ensureWBI(ctx); err != nil {
		return err
	}
	c.mu.RLock()
	imgKey, subKey := c.imgKey, c.subKey
	c.mu.RUnlock()
	mixinKey := getMixinKey(imgKey + subKey)
	if len(mixinKey) < 32 {
		return fmt.Errorf("bilibili: WBI 密钥长度异常")
	}

	params.Set("wts", strconv.FormatInt(time.Now().Unix(), 10))

	keys := make([]string, 0, len(params))
	for k := range params {
		if k == "w_rid" {
			continue
		}
		keys = append(keys, k)
	}
	sortStrings(keys)

	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('&')
		}
		v := filterWbiValue(params.Get(k))
		b.WriteString(encodeURIComponent(k))
		b.WriteByte('=')
		b.WriteString(encodeURIComponent(v))
	}
	params.Set("w_rid", md5Hex(b.String()+mixinKey))
	return nil
}

func sortStrings(items []string) {
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && items[j] < items[j-1]; j-- {
			items[j], items[j-1] = items[j-1], items[j]
		}
	}
}
