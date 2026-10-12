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
	"unicode/utf8"
)

// maxErrBody 错误信息里最多带多少字节的响应体。
// body 上限是 16MB，整段塞进 error 会一路进日志和界面。
const maxErrBody = 512

// truncateBody 把响应体摘要成便于阅读的一小段（按 rune 边界截断，
// 避免把 UTF-8 码点劈开而在错误信息里出现乱码）。
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

const (
	// defaultBaseURL 是生产环境的接口根地址。
	//
	// ★ 实测它必须是 https：明文 http 会被中间人改写搜索结果（有 TestBaseURLIsHTTPS
	// 守着）。**不要**在这里写死之后又用常量拼 URL —— 那样这个包的网络逻辑就没法
	// 指向 httptest，只能一直零测试（第六轮审查 N-8）。所有拼 URL 的地方都用
	// c.base()，它默认回落到这里。
	defaultBaseURL = "https://api.bilibili.com"
	desktopUA      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

// Client 是哔哩哔哩公开 Web 接口的最小客户端。
//
// 搜索与播放地址接口现在需要 WBI 签名；本客户端会自动获取 wbi_img 密钥、
// 缓存 12 小时，并在请求前完成签名。
type Client struct {
	// BaseURL 接口根地址（测试时可替换，指向 httptest 假服务器）。
	//
	// 留空表示用 defaultBaseURL —— 生产装配（NewClient）会显式写上默认值。
	// 它是**导出字段**而不是常量：请求装配（拼 URL、带 cookie/UA、降级重试）
	// 是「能不能搜到」里最要紧的一段，常量把它挡在测试之外（N-8）。
	BaseURL string

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
		BaseURL: defaultBaseURL,
		ua:      desktopUA,
		buvid:   randomBuvid3(),
	}
}

// base 返回实际使用的接口根地址（去掉尾部的「/」，便于直接拼路径）。
func (c *Client) base() string {
	if strings.TrimSpace(c.BaseURL) == "" {
		return defaultBaseURL
	}
	return strings.TrimRight(c.BaseURL, "/")
}

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
		return fmt.Errorf("bilibili: HTTP %d: %s", resp.StatusCode, truncateBody(body))
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
	if err := c.getJSON(ctx, c.base()+"/x/web-interface/nav", nil, &nav, false); err != nil {
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
