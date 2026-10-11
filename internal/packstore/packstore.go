// Package packstore 从远端仓库获取「主题 / 播放界面样式包」并安装到本机。
//
// 数据源是仓库里的两个清单文件：
//
//	<baseURL>/theme/index.json     主题（一条目 = 一个 CSS 文件）
//	<baseURL>/style/index.json     样式包（一条目 = 一个目录）
//
// 它们由 `node plugins/build-index.mjs` 生成，清单里逐文件带 size 与 sha256。
//
// 为什么是「逐文件下载」而不是打个 zip 让客户端解压：清单本身就能表达
// 「有哪些文件、各多大、各是什么哈希」，仓库推上去即可生效，不需要任何构建步骤；
// 而 zip 每次改一个字符都要重新打包上传，多一道纯手工的步骤 ——
// 手工步骤才是这类功能真正的失效点。
//
// 关于 sha256 的定位（**它不是安全边界**）：清单和文件来自同一个仓库，
// 能改文件的人也能改清单。它的作用是**防呆**：拦住「推了新文件忘了跑
// build-index.mjs」造成的静默失配，以及 CDN / 代理返回半截内容这类传输事故。
// 真要有安全边界，那得是签名，不在这个功能的范围内。
//
// 关于代理：这里**复用更新功能那份 GitHub 加速名单**（internal/update）。
// 名单是「GitHub 在国内的可达性」这一个事实，不该有两份；而且这里要下载的
// index.json 与资源文件走的正是同一个域名族，遇到的是同一批网络问题。
// 只对 GitHub 的地址套代理：自建仓库 / 本地调试服务器的地址拼上代理前缀
// 只会得到一堆必然失败的请求，每个都要等一次超时。
package packstore

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"localmusicplayer/internal/atomicfile"
	"localmusicplayer/internal/update"
)

const (
	// SpecVersion 是本包认识的清单版本。清单里的 spec 与它不一致时直接拒绝：
	// 与其按旧规则去解释一份新格式（字段含义变了就会装出乱七八糟的东西），
	// 不如让用户先升级程序。
	SpecVersion = 1

	// KindTheme / KindStyle 是清单的两种类型，同时也是 URL 里的一级目录。
	KindTheme = "theme"
	KindStyle = "style"

	catalogTimeout = 20 * time.Second
	fileTimeout    = 60 * time.Second

	maxCatalogBytes = 2 << 20
	maxFileBytes    = 8 << 20
	maxTotalBytes   = 32 << 20
	// maxItems 限制清单条目数，防止一份异常（或被塞满垃圾）的清单把界面拖死。
	maxItems = 500

	// memoryTTL 是「同一次会话里来回切 tab」的复用窗口。
	// 它刻意很短：用户点开这个面板就是想看**现在**仓库里有什么。
	memoryTTL = 3 * time.Minute
)

// File 是清单里的一条文件记录。
type File struct {
	// Path 是**相对 kind 根**的路径（`glass-dark.css` / `magic-circle/skin.js`）。
	// 统一成相对 kind 根，是为了让下载地址只有一条拼法：<base>/<kind>/<path>。
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

// Item 是清单里的一个可安装条目。
type Item struct {
	ID          string   `json:"id"`
	Dir         string   `json:"dir"`
	Name        string   `json:"name"`
	Version     string   `json:"version"`
	Author      string   `json:"author"`
	Description string   `json:"description"`
	Mode        string   `json:"mode"`
	APIVersion  string   `json:"apiVersion"`
	Swatch      []string `json:"swatch"`
	Files       []File   `json:"files"`
}

// Catalog 是一份清单。
type Catalog struct {
	Spec  int    `json:"spec"`
	Kind  string `json:"kind"`
	Items []Item `json:"items"`
}

// CatalogResult 是「取清单」的结论，界面直接照着渲染。
type CatalogResult struct {
	Kind  string `json:"kind"`
	Items []Item `json:"items"`
	// Channel 是这次实际走通的通道 id（"direct" 或某个代理）。
	Channel string `json:"channel"`
	// FetchedAt 是清单被拉到的时刻（毫秒）；来自缓存时是当初那一刻。
	FetchedAt int64 `json:"fetchedAt"`
	// Cached 表示这次**没能联网**，用的是本机缓存。
	//
	// 它必须独立于 Items 存在：拿缓存顶上的时候如果不告诉用户，
	// 用户会以为「仓库里就这些」，而真相是「网络不通，这是上次看到的」。
	Cached bool `json:"cached"`
	// StaleReason 是 Cached 为真时这次联网失败的原因（人话）。
	StaleReason string `json:"staleReason"`
}

// Target 描述一次安装落到哪里。
type Target struct {
	// Dir 是安装根目录（主题目录；或 player-skins/<id>）。
	Dir string
	// Prefix 是每个文件路径里要去掉的前缀：样式包是 "<目录名>/"，主题是空串。
	// 去掉之后剩下的部分才是相对 Dir 的路径。
	Prefix string
}

// InstallResult 是一次安装的结论。
type InstallResult struct {
	ID    string `json:"id"`
	Files int    `json:"files"`
	Bytes int64  `json:"bytes"`
	// Backups 是覆盖前留下的 .bak 文件名（空表示这次没有覆盖任何已有文件）。
	Backups []string `json:"backups"`
	Channel string   `json:"channel"`
}

// Client 是远端清单 + 资源下载器。用 NewClient 构造。
type Client struct {
	// BaseURL 是 plugins 目录的基地址（末尾不带斜杠）。
	BaseURL string
	// Channel 是 GitHub 下载通道：update.ChannelAuto 或某个代理 id。
	Channel string
	// CacheDir 是清单缓存目录；为空则不做磁盘缓存（也就没有离线兜底）。
	CacheDir string
	// HTTP 可注入测试客户端。
	HTTP *http.Client
	// UserAgent 会带在请求头上。
	UserAgent string

	mu  sync.Mutex
	mem map[string]memEntry
	now func() time.Time
}

type memEntry struct {
	result CatalogResult
	at     time.Time
}

// NewClient 构造下载器。baseURL 末尾的斜杠会被去掉。
func NewClient(baseURL, channel, cacheDir string) *Client {
	return &Client{
		BaseURL:  strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		Channel:  strings.TrimSpace(channel),
		CacheDir: strings.TrimSpace(cacheDir),
		mem:      map[string]memEntry{},
		now:      time.Now,
	}
}

/* --------------------------------------------------------------------------
   取清单
   -------------------------------------------------------------------------- */

// Catalog 取某个类型的清单。
//
// refresh=false 时优先用 3 分钟内的内存结果（同一次会话里来回切 tab 不该反复打 GitHub）；
// 联网失败时会退回**磁盘缓存**并如实标注 Cached / StaleReason —— 对国内网络来说
// 「打不开 GitHub」是常态而不是异常，这时能列出上次看到的清单，比一片空白有用得多。
func (c *Client) Catalog(ctx context.Context, kind string, refresh bool) (CatalogResult, error) {
	if c == nil {
		return CatalogResult{}, errors.New("插件仓库未初始化")
	}
	kind = strings.TrimSpace(kind)
	if kind != KindTheme && kind != KindStyle {
		return CatalogResult{}, fmt.Errorf("未知的插件类型：%q", kind)
	}
	if c.BaseURL == "" {
		return CatalogResult{}, errors.New("没有配置插件仓库地址（设置 → 外观 → 插件仓库）")
	}

	if !refresh {
		if hit, ok := c.memoryGet(kind); ok {
			return hit, nil
		}
	}

	raw, channel, err := c.get(ctx, c.catalogURL(kind), maxCatalogBytes, catalogTimeout)
	if err != nil {
		if cached, ok := c.readDiskCache(kind); ok {
			cached.Cached = true
			cached.StaleReason = err.Error()
			c.memoryPut(kind, cached)
			return cached, nil
		}
		return CatalogResult{}, err
	}

	catalog, err := ParseCatalog(raw, kind)
	if err != nil {
		return CatalogResult{}, err
	}

	result := CatalogResult{
		Kind:      kind,
		Items:     catalog.Items,
		Channel:   channel,
		FetchedAt: c.now().UnixMilli(),
	}
	c.memoryPut(kind, result)
	c.writeDiskCache(kind, result)
	return result, nil
}

// ParseCatalog 解析并校验一份清单。导出来是为了让调用方（和测试）
// 不必起一个 HTTP 服务器就能验证清单的合法性。
func ParseCatalog(raw []byte, kind string) (Catalog, error) {
	var doc Catalog
	if err := json.Unmarshal(raw, &doc); err != nil {
		return Catalog{}, fmt.Errorf("清单不是合法 JSON：%w", err)
	}
	if doc.Spec != SpecVersion {
		return Catalog{}, fmt.Errorf("清单版本 %d 不受支持（本程序支持 %d），请先升级程序", doc.Spec, SpecVersion)
	}
	if doc.Kind != kind {
		return Catalog{}, fmt.Errorf("清单类型是 %q，与请求的 %q 不一致", doc.Kind, kind)
	}
	if len(doc.Items) > maxItems {
		return Catalog{}, fmt.Errorf("清单条目过多（%d），已拒绝", len(doc.Items))
	}

	seen := map[string]bool{}
	for i := range doc.Items {
		it := &doc.Items[i]
		it.ID = strings.TrimSpace(it.ID)
		if it.ID == "" {
			return Catalog{}, fmt.Errorf("第 %d 个条目缺少 id", i+1)
		}
		// id 会被当成目录名 / 文件名用，必须自己就是安全的一段路径
		if _, err := safeRel(it.ID); err != nil || strings.Contains(it.ID, "/") {
			return Catalog{}, fmt.Errorf("条目 id 不合法：%q", it.ID)
		}
		if seen[it.ID] {
			return Catalog{}, fmt.Errorf("条目 id 重复：%q", it.ID)
		}
		seen[it.ID] = true

		if len(it.Files) == 0 {
			return Catalog{}, fmt.Errorf("条目「%s」没有任何文件", it.ID)
		}
		if it.Name == "" {
			it.Name = it.ID
		}
		for j := range it.Files {
			f := &it.Files[j]
			if _, err := safeRel(f.Path); err != nil {
				return Catalog{}, fmt.Errorf("条目「%s」的路径不合法：%w", it.ID, err)
			}
			if f.Size < 0 || f.Size > maxFileBytes {
				return Catalog{}, fmt.Errorf("条目「%s」的文件 %s 大小异常（%d 字节）", it.ID, f.Path, f.Size)
			}
			if len(f.SHA256) != 64 {
				return Catalog{}, fmt.Errorf("条目「%s」的文件 %s 缺少有效的 sha256", it.ID, f.Path)
			}
			if _, err := hex.DecodeString(f.SHA256); err != nil {
				return Catalog{}, fmt.Errorf("条目「%s」的文件 %s 的 sha256 不是十六进制", it.ID, f.Path)
			}
		}
	}
	return doc, nil
}

/* --------------------------------------------------------------------------
   安装
   -------------------------------------------------------------------------- */

// Install 把条目装到 target。
//
// 顺序是「先全部下载 + 校验，再落盘」：任何一步失败都不会在目标目录里
// 留下半个包（半个样式包的后果是「装上了但起不来」，比彻底没装上更难排查）。
func (c *Client) Install(ctx context.Context, kind string, item Item, target Target) (InstallResult, error) {
	res := InstallResult{ID: item.ID}
	if c == nil || c.BaseURL == "" {
		return res, errors.New("没有配置插件仓库地址")
	}
	if strings.TrimSpace(target.Dir) == "" {
		return res, errors.New("没有指定安装目录")
	}
	if len(item.Files) == 0 {
		return res, fmt.Errorf("条目「%s」没有任何文件", item.ID)
	}

	// —— 第一遍：算目标路径（全部先校验，任何一个不安全就整个中止）——
	plan := make([]plannedFile, 0, len(item.Files))
	var total int64
	for _, f := range item.Files {
		clean, err := safeRel(f.Path)
		if err != nil {
			return res, fmt.Errorf("条目「%s」的路径不合法：%w", item.ID, err)
		}
		rel := clean
		if target.Prefix != "" {
			p := strings.TrimSuffix(target.Prefix, "/") + "/"
			if !strings.HasPrefix(clean, p) {
				return res, fmt.Errorf("条目「%s」的文件 %s 不在 %s 目录下", item.ID, clean, p)
			}
			rel = strings.TrimPrefix(clean, p)
		}
		dest := filepath.Join(target.Dir, filepath.FromSlash(rel))
		// 双保险：safeRel 已经挡掉了 `..` 与绝对路径，这里再确认一次最终位置
		if inside, err := pathInside(target.Dir, dest); err != nil || !inside {
			return res, fmt.Errorf("条目「%s」的文件 %s 会写到安装目录之外", item.ID, clean)
		}
		total += f.Size
		plan = append(plan, plannedFile{rel: rel, target: dest, file: f})
	}
	if total > maxTotalBytes {
		return res, fmt.Errorf("条目「%s」体积过大（%d 字节）", item.ID, total)
	}

	// —— 第二遍：下载 + 校验，全部进内存 ——
	bodies := make([][]byte, len(plan))
	channel := ""
	for i, p := range plan {
		data, ch, err := c.get(ctx, c.fileURL(kind, p.file.Path), maxFileBytes, fileTimeout)
		if err != nil {
			return res, fmt.Errorf("下载 %s 失败：%w", p.file.Path, err)
		}
		if int64(len(data)) != p.file.Size {
			return res, fmt.Errorf(
				"%s 的大小与清单不符（清单 %d 字节，实际 %d 字节）—— 仓库可能没跑 build-index.mjs",
				p.file.Path, p.file.Size, len(data),
			)
		}
		sum := sha256.Sum256(data)
		got := hex.EncodeToString(sum[:])
		if !strings.EqualFold(got, p.file.SHA256) {
			return res, fmt.Errorf("%s 校验失败（内容与清单不符）", p.file.Path)
		}
		bodies[i] = data
		if ch != "" {
			channel = ch
		}
	}

	// 防呆：确认拉到的确实像个主题 / 样式包
	if err := sanityCheck(kind, target.Prefix, planMap(plan, bodies)); err != nil {
		return res, err
	}

	// —— 第三遍：落盘（先备份已有文件）——
	for i, p := range plan {
		if _, err := os.Stat(p.target); err == nil {
			if err := backupFile(p.target); err != nil {
				return res, fmt.Errorf("备份 %s 失败：%w", p.rel, err)
			}
			res.Backups = append(res.Backups, filepath.Base(p.target)+".bak")
		}
		if err := atomicfile.Write(p.target, bodies[i], 0o644); err != nil {
			return res, fmt.Errorf("写入 %s 失败：%w", p.rel, err)
		}
		res.Files++
		res.Bytes += int64(len(bodies[i]))
	}
	res.Channel = channel
	return res, nil
}

// plannedFile 是安装计划里的一条：清单记录 + 已经算好的落盘位置。
type plannedFile struct {
	rel    string
	target string
	file   File
}

// plannedLike 让 sanityCheck 只依赖「相对路径 → 内容」这一张表。
type plannedLike map[string][]byte

func planMap(plan []plannedFile, bodies [][]byte) plannedLike {
	out := plannedLike{}
	for i, p := range plan {
		out[p.rel] = bodies[i]
	}
	return out
}

// sanityCheck 做「这东西像不像它声称的东西」的最低限度检查。
//
// 为什么值得做：清单与内容由同一个仓库提供，sha256 只能证明「拉到的和清单里
// 写的是同一份」。把它们对错位（比如样式包目录改了名、index.json 忘了重新生成）
// 是完全可能的，而后果是**装进去一个程序认不出来的东西**：主题列表里不出现，
// 样式列表里也不出现，用户唯一的感受是「点了安装，什么也没发生」。
func sanityCheck(kind, prefix string, files plannedLike) error {
	prefix = strings.TrimSuffix(prefix, "/")
	if prefix != "" {
		prefix += "/"
	}
	switch kind {
	case KindTheme:
		for name, data := range files {
			if !strings.HasSuffix(strings.ToLower(name), ".css") {
				continue
			}
			if strings.Contains(string(data), ":root[data-theme=") {
				return nil
			}
		}
		return errors.New("下载到的内容里没有 :root[data-theme=\"…\"] 选择器，不像一个主题")
	case KindStyle:
		raw, ok := files["skin.json"]
		if !ok {
			return errors.New("下载到的样式包里没有 skin.json")
		}
		var m struct {
			ID      string `json:"id"`
			Entry   string `json:"entry"`
			Version string `json:"apiVersion"`
		}
		if err := json.Unmarshal(raw, &m); err != nil {
			return fmt.Errorf("样式包的 skin.json 不是合法 JSON：%w", err)
		}
		if strings.TrimSpace(m.ID) == "" {
			return errors.New("样式包的 skin.json 里没有 id")
		}
		if strings.TrimSpace(m.Entry) == "" {
			return errors.New("样式包的 skin.json 里没有 entry（入口文件）")
		}
		return nil
	default:
		return fmt.Errorf("未知的插件类型：%q", kind)
	}
}

/* --------------------------------------------------------------------------
   下载
   -------------------------------------------------------------------------- */

func (c *Client) catalogURL(kind string) string {
	return c.BaseURL + "/" + kind + "/index.json"
}

func (c *Client) fileURL(kind, p string) string {
	return c.BaseURL + "/" + kind + "/" + strings.TrimPrefix(p, "/")
}

// errNotRetryable 标记「换通道也没用」的失败（404 / 403 这类明确的否定回答）。
var errNotRetryable = errors.New("not retryable")

// get 按候选地址逐个尝试，返回内容与实际走通的通道。
func (c *Client) get(ctx context.Context, rawURL string, limit int64, timeout time.Duration) ([]byte, string, error) {
	candidates := c.candidates(rawURL)
	var lastErr error
	for _, candidate := range candidates {
		data, err := c.getOnce(ctx, candidate, limit, timeout)
		if err == nil {
			return data, channelOf(candidate), nil
		}
		lastErr = err
		if errors.Is(err, errNotRetryable) {
			break
		}
	}
	if lastErr == nil {
		lastErr = errors.New("没有可用的下载地址")
	}
	return nil, "", lastErr
}

func (c *Client) getOnce(ctx context.Context, rawURL string, limit int64, timeout time.Duration) ([]byte, error) {
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("请求地址不合法：%w", err)
	}
	if c.UserAgent != "" {
		req.Header.Set("User-Agent", c.UserAgent)
	}
	// 走 CDN 的静态文件加这一条能省掉一次条件请求往返
	req.Header.Set("Accept", "application/json, text/css, */*")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("连不上 %s：%w", hostOf(rawURL), err)
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusOK:
		// 继续
	case resp.StatusCode == http.StatusNotFound:
		return nil, fmt.Errorf("%w：远端没有这个文件（%s）", errNotRetryable, hostOf(rawURL))
	case resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusUnauthorized:
		return nil, fmt.Errorf("%w：远端拒绝访问（HTTP %d）", errNotRetryable, resp.StatusCode)
	default:
		return nil, fmt.Errorf("HTTP %d（%s）", resp.StatusCode, hostOf(rawURL))
	}

	// 多读 1 字节：恰好等于上限时才能区分「正好」和「超了」
	data, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, fmt.Errorf("读取响应失败：%w", err)
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("响应超过 %d 字节上限", limit)
	}
	return data, nil
}

func (c *Client) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	// 不设 Client.Timeout：超时统一由每次请求的 context 控制
	// （清单 20 秒、文件 60 秒），一个全局值做不到这种区分。
	return &http.Client{}
}

// candidates 返回应该尝试的地址。
//
// 只有 GitHub 的地址才套代理：自建仓库 / 本地调试地址拼上代理前缀会得到
// 一堆必然失败的请求，每个都要等一次超时，反而把「能用」变成「很慢」。
func (c *Client) candidates(rawURL string) []string {
	if !isGitHubURL(rawURL) {
		return []string{rawURL}
	}
	return update.Candidates(rawURL, update.NormalizeChannel(c.Channel))
}

// isGitHubURL 判断地址是否属于 GitHub 的文件下载域名族。
func isGitHubURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	switch strings.ToLower(u.Hostname()) {
	case "github.com", "raw.githubusercontent.com", "objects.githubusercontent.com", "codeload.github.com":
		return true
	default:
		return false
	}
}

// channelOf 反查这次实际走的是哪条通道（供界面回显）。
func channelOf(rawURL string) string {
	if m, ok := update.MirrorFor(rawURL); ok {
		return m.ID
	}
	return "direct"
}

func hostOf(rawURL string) string {
	if u, err := url.Parse(rawURL); err == nil && u.Host != "" {
		return u.Host
	}
	return rawURL
}

/* --------------------------------------------------------------------------
   缓存
   -------------------------------------------------------------------------- */

func (c *Client) memoryGet(kind string) (CatalogResult, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	hit, ok := c.mem[kind]
	if !ok || c.now().Sub(hit.at) > memoryTTL {
		return CatalogResult{}, false
	}
	return hit.result, true
}

func (c *Client) memoryPut(kind string, r CatalogResult) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.mem == nil {
		c.mem = map[string]memEntry{}
	}
	c.mem[kind] = memEntry{result: r, at: c.now()}
}

func (c *Client) cachePath(kind string) string {
	if c.CacheDir == "" {
		return ""
	}
	return filepath.Join(c.CacheDir, "index-"+kind+".json")
}

func (c *Client) writeDiskCache(kind string, r CatalogResult) {
	p := c.cachePath(kind)
	if p == "" {
		return
	}
	raw, err := json.Marshal(r)
	if err != nil {
		return
	}
	// 缓存写失败不影响主流程（它只是离线兜底）
	_ = atomicfile.Write(p, raw, 0o644)
}

func (c *Client) readDiskCache(kind string) (CatalogResult, bool) {
	p := c.cachePath(kind)
	if p == "" {
		return CatalogResult{}, false
	}
	raw, err := os.ReadFile(p)
	if err != nil {
		return CatalogResult{}, false
	}
	var r CatalogResult
	if err := json.Unmarshal(raw, &r); err != nil || len(r.Items) == 0 {
		return CatalogResult{}, false
	}
	// 真正的通道信息在缓存里没有意义，标注成空由界面显示「缓存」
	r.Channel = ""
	return r, true
}

/* --------------------------------------------------------------------------
   路径与文件
   -------------------------------------------------------------------------- */

// safeRel 校验清单里的路径能不能安全地落到目标目录。
//
// 这份清单来自网络，`Path` 是拼接 URL 与落盘路径的依据。
// `../../../Windows/System32/x` 这种值绝不能走到写盘那一步。
func safeRel(p string) (string, error) {
	clean := strings.TrimSpace(strings.ReplaceAll(p, "\\", "/"))
	if clean == "" {
		return "", errors.New("空路径")
	}
	if strings.HasPrefix(clean, "/") {
		return "", fmt.Errorf("绝对路径：%s", p)
	}
	if strings.Contains(clean, ":") {
		return "", fmt.Errorf("含盘符或协议：%s", p)
	}
	for _, seg := range strings.Split(clean, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return "", fmt.Errorf("含不安全的路径片段：%s", p)
		}
	}
	return clean, nil
}

// pathInside 判断 child 是否真的落在 parent 之内（用相对路径判断，不做字符串前缀比较）。
func pathInside(parent, child string) (bool, error) {
	absParent, err := filepath.Abs(parent)
	if err != nil {
		return false, err
	}
	absChild, err := filepath.Abs(child)
	if err != nil {
		return false, err
	}
	rel, err := filepath.Rel(absParent, absChild)
	if err != nil {
		return false, err
	}
	if rel == "." || rel == ".." {
		return false, nil
	}
	return !strings.HasPrefix(rel, ".."+string(filepath.Separator)), nil
}

// backupFile 在覆盖前留一份 "<name>.bak"。
//
// 与内置主题同步（internal/theme 的 syncBuiltin）用同一套约定：
// 用户手改过的文件要能找回来，而不是被一次「更新」直接抹掉。
func backupFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return atomicfile.Write(path+".bak", data, 0o644)
}
