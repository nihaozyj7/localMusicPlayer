package coverfetch

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// UserAgent 所有公开接口共用的 UA。
//
// 这些站点都会对空 UA / 脚本 UA 做拦截，用一个真实的桌面浏览器 UA 最省事。
const UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// maxImageBytes 单张封面的下载上限。
// 封面本来就是缩略图，2MB 足够；防止被第三方大图拖住内存。
const maxImageBytes = 2 << 20

// client 所有来源共用的 HTTP 客户端。
//
// 关键点：
//   - 每个请求都带 ctx 超时，单个来源卡住不会拖累整体；
//   - 限制重定向次数（默认 10 次足够，但显式写明便于排查）；
//   - 保留默认 Transport（长连接复用），只调整超时。
var client = &http.Client{
	Timeout: 15 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 6 {
			return fmt.Errorf("重定向次数过多")
		}
		// 跟随重定向时也带上我们的 UA / Referer，否则部分 CDN 会返回 403
		if len(via) > 0 {
			req.Header.Set("User-Agent", UserAgent)
			req.Header.Set("Referer", via[0].URL.Scheme+"://"+via[0].URL.Host+"/")
		}
		return nil
	},
}

// getJSON 拉取并解析 JSON。
//
// headers 用于个别站点要求的额外头（例如 MusicBrainz 的 Accept）。
func getJSON(ctx context.Context, rawURL string, out any, headers map[string]string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: HTTP %d", hostOf(rawURL), resp.StatusCode)
	}
	// 这些接口的响应都是几十 KB 级别，4MB 上限足够，也避免异常响应打爆内存
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("%s: 解析 JSON 失败: %w", hostOf(rawURL), err)
	}
	return nil
}

func hostOf(rawURL string) string {
	if u, err := url.Parse(rawURL); err == nil && u.Host != "" {
		return u.Host
	}
	return "unknown"
}

/* --------------------------------------------------------------------------
   图片下载与白名单
   -------------------------------------------------------------------------- */

// imageHostSuffixes 允许代理的图片域名后缀。
//
// 安全考虑：/online/cover 是一个会把「任意 URL 的内容」回给前端的接口，
// 如果不做限制，它就变成了一个可以访问内网地址的 HTTP 代理（SSRF）。
// 这里只放行各家公开图床的域名，并且额外挡掉 IP 字面量。
var imageHostSuffixes = []string{
	// Apple / iTunes
	"mzstatic.com",
	// Deezer
	"dzcdn.net",
	"deezer.com",
	// Cover Art Archive / Internet Archive
	"coverartarchive.org",
	"archive.org",
	// 网易云音乐
	"music.126.net",
	"126.net",
	// 哔哩哔哩
	"hdslb.com",
	"biliimg.com",
	"bilivideo.com",
	// 酷狗 / QQ 音乐（保留位，接口当前不稳定，先留域名免得上线后又要改）
	"kugou.com",
	"gtimg.com",
	"y.qq.com",
	// Last.fm / Discogs 的公共图床
	"lastfm.freetls.fastly.net",
	"discogs.com",
}

// AllowedImageURL 判断一个地址是否可以由本包代理下载。
func AllowedImageURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return false
	}
	// 先挡掉 IP 字面量（含内网地址），避免 SSRF
	if net.ParseIP(host) != nil {
		return false
	}
	for _, suffix := range imageHostSuffixes {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}

// Download 下载一张封面。
//
// 会先做域名白名单校验：不允许的地址直接拒绝，不发出请求。
func Download(ctx context.Context, rawURL string) (ImageData, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ImageData{}, ErrNotFound
	}
	if !AllowedImageURL(rawURL) {
		return ImageData{}, fmt.Errorf("封面地址不在允许的图床列表内: %s", hostOf(rawURL))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return ImageData{}, err
	}
	req.Header.Set("User-Agent", UserAgent)
	// 图床基本都校验 Referer。注意不能一律用图片自己的域名：网易云 CDN
	// 与 B 站图床都期待「站点首页」作为来源，用错会 403 或返回占位白图。
	req.Header.Set("Referer", refererFor(rawURL))
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return ImageData{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ImageData{}, fmt.Errorf("%s: HTTP %d", hostOf(rawURL), resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxImageBytes))
	if err != nil {
		return ImageData{}, err
	}
	if len(body) == 0 {
		return ImageData{}, ErrNotFound
	}
	ct := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if ct == "" || !strings.HasPrefix(ct, "image/") {
		ct = sniffImageType(body)
	}
	if ct == "" {
		return ImageData{}, fmt.Errorf("%s: 返回的内容不是图片", hostOf(rawURL))
	}
	// 统一成规范类型（image/jpg → image/jpeg，并以魔数为准）：
	// 这个值会被写进缓存索引、data URL 与代理响应头，必须干净。
	ct = NormalizeMIME(ct, body)
	final := rawURL
	if resp.Request != nil && resp.Request.URL != nil {
		final = resp.Request.URL.String()
	}
	return ImageData{Body: body, ContentType: ct, URL: final}, nil
}

// sniffImageType 通过魔数判断图片类型（Content-Type 不可信时兜底）。
func sniffImageType(b []byte) string {
	if len(b) < 12 {
		return ""
	}
	switch {
	case b[0] == 0xFF && b[1] == 0xD8:
		return "image/jpeg"
	case string(b[0:8]) == "\x89PNG\r\n\x1a\n":
		return "image/png"
	case string(b[0:6]) == "GIF87a" || string(b[0:6]) == "GIF89a":
		return "image/gif"
	case string(b[0:4]) == "RIFF" && string(b[8:12]) == "WEBP":
		return "image/webp"
	case string(b[4:12]) == "ftypavif":
		return "image/avif"
	}
	return ""
}

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */

// firstNonEmpty 返回第一个非空字符串。
func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// itoa 十进制整数转字符串（多处拼查询串/参数时用）。
func itoa(v int64) string { return strconv.FormatInt(v, 10) }

// sortCovers 按可信度降序排列候选封面（稳定排序，同分保持来源给出的顺序）。
func sortCovers(items []Cover) {
	sort.SliceStable(items, func(i, j int) bool { return items[i].Score > items[j].Score })
}

// upgradeImageSize 把常见缩略图地址换成更大的版本。
//
// iTunes 的 artworkUrl100 是 100×100，直接把尺寸段替换成 600x600 就能拿到大图，
// 不需要额外的接口调用。
func upgradeImageSize(raw string, from, to string) string {
	if raw == "" || from == "" || to == "" {
		return raw
	}
	return strings.ReplaceAll(raw, from, to)
}

// dedupeCovers 去掉重复 URL 的候选，保持原顺序。
func dedupeCovers(items []Cover) []Cover {
	seen := make(map[string]struct{}, len(items))
	out := make([]Cover, 0, len(items))
	for _, c := range items {
		if !c.Valid() {
			continue
		}
		if _, ok := seen[c.URL]; ok {
			continue
		}
		seen[c.URL] = struct{}{}
		out = append(out, c)
	}
	return out
}

/* --------------------------------------------------------------------------
   并发查询辅助
   -------------------------------------------------------------------------- */

// indexedResult 并发查询的中间结果：记住来源本身与它在声明列表中的位置。
type indexedResult struct {
	idx      int
	provider Provider
	res      FindResult
	failed   bool
}

// runProviders 并发执行所有 Provider，把结果按声明顺序返回。
//
// 之所以还原成声明顺序：Provider 的声明顺序就是我们的优先级顺序，
// 顺序稳定，行为才可预期、可测试。
//
// 返回的每一项都带 failed 标记（含超时与错误），Aggregator 用它做熔断。
func runProviders(ctx context.Context, providers []Provider, req Request, perProvider time.Duration) []indexedResult {
	if perProvider <= 0 {
		perProvider = DefaultPerProviderTimeout
	}
	ch := make(chan indexedResult, len(providers))

	var wg sync.WaitGroup
	for i, p := range providers {
		wg.Add(1)
		go func(i int, p Provider) {
			defer wg.Done()
			cctx, cancel := context.WithTimeout(ctx, perProvider)
			defer cancel()
			res, err := p.Find(cctx, req)
			if err != nil {
				// 单个来源失败是常态（网络/限流/接口变动），不向上冒泡
				ch <- indexedResult{idx: i, provider: p, failed: true}
				return
			}
			ch <- indexedResult{idx: i, provider: p, res: res, failed: !res.Cover.Valid()}
		}(i, p)
	}
	go func() {
		wg.Wait()
		close(ch)
	}()

	got := make([]indexedResult, 0, len(providers))
	for item := range ch {
		got = append(got, item)
	}
	// 插入排序：结果数量是个位数，比 sort.Slice 更直白
	for i := 1; i < len(got); i++ {
		cur := got[i]
		j := i - 1
		for j >= 0 && got[j].idx > cur.idx {
			got[j+1] = got[j]
			j--
		}
		got[j+1] = cur
	}
	return got
}
