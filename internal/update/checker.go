package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

/* ==========================================================================
   GitHub Release 检测与下载
   --------------------------------------------------------------------------
   这一层把「网络」和「业务」隔开：
     · Check    —— 问 GitHub「最新版是哪个」，纯读，不改任何本地状态；
     · Download —— 把安装包拉下来，**逐个通道降级**，带进度回调与校验。

   关键区分：**检查更新直连 API，下载才走代理。**
   Release API 的响应只有几 KB，直连通常没问题；真正需要加速的是
   17MB 的 exe 资产（它走的是 objects.githubusercontent.com，
   在国内网络下经常龟速甚至完全不通）。所以代理名单只用在下载上 ——
   让检查更新也去挤代理，只会平白多一个失败点。

   超时的取值逻辑：
     · 检查更新是用户点一下就要看到结果的动作，超过十几秒还不如失败了重试，
       所以给 15 秒；
     · 下载是用户明确知道「要下十几 MB」的长任务，超时只用来兜住
       「永远不结束」，给足 30 分钟（见 downloadTimeout）；
     · 单个通道连上但传输龟速的情况，靠 stallTimeout 判定（见下文）。
   ========================================================================== */

const (
	checkTimeout = 15 * time.Second
	// downloadTimeout 是**整个下载**的上限。给得很宽松：它要兜住的是
	// 「连接挂死」而不是「慢」，慢速下载对用户仍然是有价值的（能下完）。
	downloadTimeout = 30 * time.Minute
	// stallTimeout 是「多久没有任何新字节到达就认定这条通道不行」。
	// 这是本功能最关键的一个超时：代理挂掉时的典型表现不是立刻报错，
	// 而是**连上了然后一动不动**。没有它，用户会看到进度条永远停在 0%，
	// 而且永远不会自动切到下一个通道。
	stallTimeout = 25 * time.Second
	// maxReleaseBytes 限制 API 响应的体积，防止异常响应把内存吃满。
	maxReleaseBytes = 4 << 20
)

// CheckResult 是一次「检查更新」的结论。
//
// 它刻意做成**纯数据 + 明确的状态**：界面只需要照着字段渲染，
// 不需要自己再判断「没更新」和「检查失败」的区别 —— 那两者在
// 早期的实现里经常被混成一个「没有更新」的空结果，
// 于是网络故障时用户看到的是「已是最新版」，这是最坏的一种错。
type CheckResult struct {
	// Current 是当前运行的版本（来自 Go 侧常量）。
	Current string `json:"current"`
	// Latest 是远端最新版本号；检查失败时为空。
	Latest string `json:"latest"`
	// HasUpdate 表示 Latest 比 Current 新。
	HasUpdate bool `json:"hasUpdate"`
	// Available 表示「有新版本，但**找不到当前平台的安装包**」。
	// 这种情况必须和 HasUpdate 分开：有新版却下不了，提示语完全不同。
	Available bool `json:"assetAvailable"`
	// AssetName / AssetSize / DownloadURL 是选中的安装包。
	AssetName     string `json:"assetName"`
	AssetSize     int64  `json:"assetSize"`
	AssetSizeText string `json:"assetSizeText"`
	DownloadURL   string `json:"downloadUrl"`
	// Notes 是 release 说明原文（Markdown，界面按纯文本渲染）。
	Notes string `json:"notes"`
	// ReleaseURL 是这个 release 的网页地址（「查看完整说明」用）。
	ReleaseURL string `json:"releaseUrl"`
	// PublishedAt 是发布时间（毫秒时间戳），0 表示未知。
	PublishedAt int64 `json:"publishedAt"`
	// Prerelease 标记这是预发布版本。
	Prerelease bool `json:"prerelease"`
	// CheckedAt 是本次检查的时间（毫秒时间戳）。
	CheckedAt int64 `json:"checkedAt"`
	// Error 非空表示检查失败（网络/解析），此时 Latest 为空。
	Error string `json:"error,omitempty"`
}

// DownloadResult 是一次下载的最终结论。
type DownloadResult struct {
	// Path 是下载完成的临时文件路径（校验通过后才有）。
	Path string `json:"path"`
	// Bytes 是实际写入的字节数。
	Bytes int64 `json:"bytes"`
	// SHA256 是实测哈希（十六进制小写）。
	SHA256 string `json:"sha256"`
	// MirrorID / MirrorName 是**最终成功**的那条通道。
	MirrorID   string `json:"mirrorId"`
	MirrorName string `json:"mirrorName"`
	// Verified 表示哈希与 SHA256SUMS.txt 对上了。
	// 清单缺失时是 false 但不算失败（见 Download 的说明）。
	Verified bool `json:"verified"`
	// Attempts 记录试过几条通道（>1 说明发生了降级，界面可以提示）。
	Attempts int `json:"attempts"`
}

// Progress 是一次下载进度。回调会以较高频率被调用，调用方自己节流。
type Progress struct {
	// Done / Total 已下载 / 总字节（Total 为 0 表示服务端没给长度）。
	Done  int64 `json:"done"`
	Total int64 `json:"total"`
	// Percent 是 0~100 的整数；Total 未知时为 -1。
	Percent int `json:"percent"`
	// SpeedText 是「1.2 MB/s」这样的速度文本。
	SpeedText string `json:"speedText"`
	// MirrorID / MirrorName 是**当前正在用**的通道。
	MirrorID   string `json:"mirrorId"`
	MirrorName string `json:"mirrorName"`
	// Attempt 是当前第几次尝试（从 1 开始）。
	Attempt int `json:"attempt"`
	// Message 是一句人话状态（「正在切换通道…」）。
	Message string `json:"message"`
}

// Client 是检测器。零值可用（会用默认 HTTP 客户端）。
type Client struct {
	// HTTP 用于请求 GitHub API，可以注入测试用的客户端。
	HTTP *http.Client
	// DownloadHTTP 用于下载安装包；为 nil 时用默认客户端
	// （下载不设 Client.Timeout，超时靠 context 与 stall 检测，见 downloadOnce）。
	//
	// 单独一个字段是为了让测试能把「所有通道」都重定向到一个本地服务器，
	// 从而在不联网、不依赖第三方代理的前提下验证降级路径。
	DownloadHTTP *http.Client
	// Repo 是 "owner/name"，例如 "nihaozyj7/localMusicPlayer"。
	Repo string
	// APIBase 默认 https://api.github.com，测试时指向本地服务器。
	APIBase string
	// Token 可选：配置后能提高 API 速率限制（匿名是每小时 60 次）。
	Token string
}

// NewClient 构造一个针对某个仓库的检测器。
func NewClient(repo string) *Client {
	return &Client{Repo: strings.TrimSpace(repo)}
}

func (c *Client) httpClient() *http.Client {
	if c != nil && c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: checkTimeout}
}

func (c *Client) apiBase() string {
	if c != nil && strings.TrimSpace(c.APIBase) != "" {
		return strings.TrimRight(strings.TrimSpace(c.APIBase), "/")
	}
	return "https://api.github.com"
}

/* --------------------------------------------------------------------------
   检查更新
   -------------------------------------------------------------------------- */

// Check 查询最新 release，并与 currentVersion 比较。
//
// 返回的 CheckResult 在**失败时也不返回 error**：网络不通是一个预期的、
// 需要展示给用户的状态（"检查失败：…"），而不是调用方的编程错误。
// 只有参数本身不合法（仓库名为空、当前版本号解析不了）才走 error ——
// 那些是配置问题，应该在日志里响而不是渲染成一句话。
func (c *Client) Check(ctx context.Context, currentVersion string, includePrerelease bool) (CheckResult, error) {
	now := time.Now().UnixMilli()
	current, err := ParseVersion(currentVersion)
	if err != nil {
		return CheckResult{}, fmt.Errorf("当前版本号无法解析（%q）：%w", currentVersion, err)
	}
	repo := strings.TrimSpace(c.Repo)
	if repo == "" {
		return CheckResult{}, fmt.Errorf("未配置 GitHub 仓库地址")
	}

	result := CheckResult{Current: current.String(), CheckedAt: now}

	releases, err := c.fetchReleases(ctx)
	if err != nil {
		result.Error = err.Error()
		return result, nil
	}

	best, ok := selectRelease(releases, includePrerelease)
	if !ok {
		// 一个 release 都没有（或全被过滤掉）不是错误：
		// 仓库刚建、还没发过版本时就是这个样子。
		result.Error = "这个仓库还没有可用的正式版本"
		return result, nil
	}

	latest, err := best.Version()
	if err != nil {
		result.Error = fmt.Sprintf("最新版本号无法解析（%q）", best.TagName)
		return result, nil
	}

	result.Latest = latest.String()
	result.Notes = strings.TrimSpace(best.Body)
	result.ReleaseURL = best.HTMLURL
	result.Prerelease = best.Prerelease
	if t := best.PublishedTime(); !t.IsZero() {
		result.PublishedAt = t.UnixMilli()
	}

	if !latest.NewerThan(current) {
		// 已经是最新（或本地版本比远端还新 —— 开发机上很常见）。
		return result, nil
	}

	result.HasUpdate = true

	asset, ok := PickAsset(best.Assets)
	if !ok {
		// 有新版本，但没有当前平台能用的安装包。
		// 明确告诉用户「去网页看看」，而不是假装无事发生。
		result.Error = fmt.Sprintf("新版本 %s 没有提供当前平台（%s）的安装包", latest.String(), platformLabel())
		return result, nil
	}

	result.Available = true
	result.AssetName = asset.Name
	result.AssetSize = asset.Size
	result.AssetSizeText = HumanSize(asset.Size)
	if asset.BrowserDownloadURL != "" {
		result.DownloadURL = asset.BrowserDownloadURL
	} else {
		result.DownloadURL = asset.APIURL
	}
	return result, nil
}

// fetchReleases 取最近的 release 列表。
//
// 用列表接口而不是 `/releases/latest`：那个接口只返回**最新**的一个，
// 一旦最新的是 draft 或者预发布，我们就得整个重来一次请求。
// 列表接口一次拿回来，本地再挑。
func (c *Client) fetchReleases(ctx context.Context) ([]Release, error) {
	endpoint := fmt.Sprintf("%s/repos/%s/releases?per_page=30", c.apiBase(), strings.TrimSpace(c.Repo))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("构造请求失败：%w", err)
	}
	// GitHub 要求带 UA，不带会直接 403。
	req.Header.Set("User-Agent", "LMPlayer-Updater")
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if c != nil && strings.TrimSpace(c.Token) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(c.Token))
	}

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("连接 GitHub 失败：%w", friendlyNetErr(err))
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxReleaseBytes))
	if err != nil {
		return nil, fmt.Errorf("读取响应失败：%w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub 返回 %s%s", resp.Status, c.rateLimitHint(resp))
	}

	var releases []Release
	if err := json.Unmarshal(body, &releases); err != nil {
		return nil, fmt.Errorf("解析响应失败：%w", err)
	}
	return releases, nil
}

// rateLimitHint 在 403/429 时补一句提示 —— 匿名调用每小时只有 60 次，
// 用户遇到时看到的光秃秃一个 "403 Forbidden" 是没法排查的。
func (c *Client) rateLimitHint(resp *http.Response) string {
	if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusTooManyRequests {
		return ""
	}
	if remaining := resp.Header.Get("X-RateLimit-Remaining"); remaining == "0" {
		return "（API 调用次数已用完，请稍后再试）"
	}
	return "（可能触发了 GitHub 的访问限制，请稍后再试）"
}

// selectRelease 从列表里挑出「最该比较的那一个」。
//
//   - 跳过 draft（未发布）和没有 tag 的条目；
//   - 默认跳过 prerelease；开启 includePrerelease 时也纳入候选；
//   - 在候选里取版本号最大的（不是取列表第一个）：
//     API 按创建时间倒序返回，而「补发一个旧版本的修复」会让顺序
//     与版本号大小不一致。
func selectRelease(releases []Release, includePrerelease bool) (Release, bool) {
	var best Release
	var bestVer Version
	found := false

	for _, r := range releases {
		if r.Draft {
			continue
		}
		if r.Prerelease && !includePrerelease {
			continue
		}
		v, err := r.Version()
		if err != nil {
			continue
		}
		if !found || v.NewerThan(bestVer) {
			best, bestVer, found = r, v, true
		}
	}
	return best, found
}

/* --------------------------------------------------------------------------
   取小文本（校验和清单）
   -------------------------------------------------------------------------- */

// FetchText 取一小段文本（用于 SHA256SUMS.txt 这类清单文件）。
//
// 它走**与下载相同的通道**（含代理）：清单和资产在同一个目录下，
// 如果资产必须走代理才能拿到，清单直连也一样拿不到。
//
// maxBytes 是硬上限：清单文件只有几百字节，一个异常的大响应不该被读进内存。
func (c *Client) FetchText(ctx context.Context, url string, maxBytes int64) (string, error) {
	if maxBytes <= 0 {
		maxBytes = 64 << 10
	}

	var lastErr error
	// 只试直连与名单里的前几个通道：清单是可选加固，
	// 为它把 8 条通道全试一遍（每条都可能卡 25 秒）不值得。
	candidates := Candidates(url, ChannelAuto)
	if len(candidates) > 3 {
		candidates = candidates[:3]
	}

	for _, candidate := range candidates {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, candidate, nil)
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("User-Agent", "LMPlayer-Updater")

		resp, err := c.downloadClient().Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxBytes))
		_ = resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("服务器返回 %s", resp.Status)
			continue
		}
		return string(body), nil
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("没有可用的通道")
	}
	return "", lastErr
}

/* --------------------------------------------------------------------------
   下载
   -------------------------------------------------------------------------- */

// DownloadOptions 控制一次下载。
type DownloadOptions struct {
	// URL 是要下载的资产地址（通常是 GitHub 的 browser_download_url）。
	URL string
	// AssetName 是文件名，用于匹配校验和清单。
	AssetName string
	// TempDir 是落盘目录（调用方保证它存在）。
	TempDir string
	// Channel 是用户选的通道（"auto" 或某个代理 id）。
	Channel string
	// ExpectedSHA256 是期望哈希；为空表示没有清单可对。
	ExpectedSHA256 string
	// OnProgress 会被高频调用（调用方负责节流）；可以为 nil。
	OnProgress func(Progress)
	// OnAttempt 在**每条通道开始尝试前**调用，让界面能显示「正在试 xxx」。
	OnAttempt func(attempt int, m Mirror)
}

// Download 逐个通道尝试，把资产下载到 TempDir 下并做哈希校验。
//
// 返回的 error 只有在**所有通道都试过并且都失败**时才非 nil；
// 错误信息里会带上每条通道失败的原因 —— 用户看到「全部通道都失败」时
// 最需要知道的就是「到底是网络问题还是代理问题」，只报最后一条会把
// 线索丢掉。
func (c *Client) Download(ctx context.Context, opts DownloadOptions) (DownloadResult, error) {
	raw := strings.TrimSpace(opts.URL)
	if raw == "" {
		return DownloadResult{}, fmt.Errorf("没有可下载的地址")
	}
	if strings.TrimSpace(opts.TempDir) == "" {
		return DownloadResult{}, fmt.Errorf("临时目录为空")
	}

	candidates := Candidates(raw, opts.Channel)
	if len(candidates) == 0 {
		return DownloadResult{}, fmt.Errorf("没有可用的下载通道")
	}

	ctx, cancel := context.WithTimeout(ctx, downloadTimeout)
	defer cancel()

	var failures []string
	for i, url := range candidates {
		// 每轮开始前检查外层是否已经取消（用户点了「取消」）。
		if err := ctx.Err(); err != nil {
			return DownloadResult{}, err
		}

		mirror, _ := MirrorFor(url)
		if mirror.ID == "" {
			// MirrorFor 认不出来就是直连（前缀为空的那一项）。
			mirror, _ = MirrorByID("direct")
		}

		if opts.OnAttempt != nil {
			opts.OnAttempt(i+1, mirror)
		}

		res, err := c.downloadOnce(ctx, opts, url, mirror, i+1)
		if err == nil {
			res.Attempts = i + 1
			return res, nil
		}
		failures = append(failures, fmt.Sprintf("%s：%v", mirrorLabel(mirror), friendlyNetErr(err)))

		// 用户主动取消 / 整体超时：不要再往下试别的通道了。
		//
		// 但错误信息要用**这一条通道自己的失败原因**（err），而不是笼统的
		// ctx.Err()。两者经常同时发生：ctx 到期的那一刻，正在卡住的那条
		// 通道也会报错。报 "context deadline exceeded" 等于把最有用的一条
		// 线索（"这条通道卡住了/被拒了"）丢掉，用户无从判断该换哪个通道。
		if ctx.Err() != nil {
			return DownloadResult{}, fmt.Errorf("下载中断 —— %s", strings.Join(failures, "；"))
		}
	}

	return DownloadResult{}, fmt.Errorf("所有下载通道都失败了 —— %s", strings.Join(failures, "；"))
}

func (c *Client) downloadClient() *http.Client {
	if c != nil && c.DownloadHTTP != nil {
		return c.DownloadHTTP
	}
	// 下载不设 Client.Timeout，而用 request context 控制：
	// http.Client.Timeout 覆盖的是**整个请求**（含读 body），
	// 一个固定值对慢速网络仍然可能不够，而 stalled 检测
	// 才是真正该做的事（见 copyWithStall）。
	//
	// 这里也**不放连接池**：见 newDownloadTransport 的说明。
	// 用一个独立的 Transport 而不是 http.DefaultTransport：
	// DefaultTransport 是进程级共享的，改它的行为会影响到别人。
	return &http.Client{Transport: newDownloadTransport()}
}

// newDownloadTransport 返回一个**不重用连接**的 Transport。
//
// 为什么要专门做这件事（这是一个实测出来的坑）：
//
// 卡住的连接会被 go 的 http 连接池**放回池子里**（因为读到超时/取消时，
// 池子并不总能判断出这条连接已经不可用）。于是下一轮换通道时，
// 新请求从池子里拿到的还是那条死掉的连接 —— 又一次卡满超时，
// 再换、再拿同一条…… 实测表现是「8 条通道各卡 25 秒，总共 3 分 20 秒」，
// 而用户看到的是一动不动、最后报「所有通道都失败」，尽管其中好几条
// 本来是可用的。
//
// DisableKeepAlives 让每个请求都新建连接，卡住的连接不会再被复用。
// 代价是每个通道多一次 TCP+TLS 握手 —— 相对于「少卡 25 秒」，
// 这个代价完全可以接受（而且代理通道域名各不相同，本来也复用不了）。
func newDownloadTransport() *http.Transport {
	if base, ok := http.DefaultTransport.(*http.Transport); ok {
		clone := base.Clone()
		clone.DisableKeepAlives = true
		return clone
	}
	return &http.Transport{DisableKeepAlives: true}
}

// downloadOnce 走单条通道下载一次。
func (c *Client) downloadOnce(ctx context.Context, opts DownloadOptions, url string, mirror Mirror, attempt int) (DownloadResult, error) {
	reqCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return DownloadResult{}, fmt.Errorf("构造请求失败：%w", err)
	}
	req.Header.Set("User-Agent", "LMPlayer-Updater")
	req.Header.Set("Accept", "application/octet-stream")

	resp, err := c.downloadClient().Do(req)
	if err != nil {
		return DownloadResult{}, fmt.Errorf("连接失败：%w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return DownloadResult{}, fmt.Errorf("服务器返回 %s", resp.Status)
	}

	// 目标文件用「资产名 + 序号」：同一时刻可能有并发下载（用户点了两次），
	// 固定名会互相覆盖，而且 Windows 上 os.Rename 会直接失败。
	target := filepath.Join(opts.TempDir, fmt.Sprintf("%s.part%d", safeFileName(opts.AssetName), attempt))

	f, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return DownloadResult{}, fmt.Errorf("创建临时文件失败：%w", err)
	}
	// 任何一条失败路径都要把半个文件清掉，否则临时目录会越攒越多。
	cleanup := func() {
		_ = f.Close()
		_ = os.Remove(target)
	}

	hasher := sha256.New()
	total := resp.ContentLength
	if total <= 0 {
		total = opts.expectedSize(resp)
	}

	writer := io.MultiWriter(f, hasher)

	// 进度节流：每 200ms 或每 1% 推一次。
	// 不节流的话，一个 17MB 的下载会产生几万次事件，把 WebView 的
	// 消息队列塞满，界面反而卡住。
	progress := newProgressPump(opts.OnProgress, total, mirror, attempt)

	written, err := copyWithStall(reqCtx, cancel, writer, resp.Body, progress)
	if err != nil {
		cleanup()
		// 服务端声明了长度却提前断开时，Go 的 http body 会先把
		// `unexpected EOF` 报出来（而不是让我们读到 EOF 再对长度）。
		// 那个说法对用户毫无意义，这里换成「下载不完整」——
		// 用户看到它就知道「重试一次」是对的动作。
		if total > 0 && written < total && isTruncation(err) {
			return DownloadResult{}, fmt.Errorf("下载不完整（收到 %s，应为 %s）", HumanSize(written), HumanSize(total))
		}
		return DownloadResult{}, err
	}
	if total > 0 && written != total {
		cleanup()
		return DownloadResult{}, fmt.Errorf("下载不完整（收到 %s，应为 %s）", HumanSize(written), HumanSize(total))
	}

	if err := f.Sync(); err != nil {
		cleanup()
		return DownloadResult{}, fmt.Errorf("写入磁盘失败：%w", err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(target)
		return DownloadResult{}, fmt.Errorf("关闭文件失败：%w", err)
	}

	actual := hex.EncodeToString(hasher.Sum(nil))
	res := DownloadResult{
		Path:       target,
		Bytes:      written,
		SHA256:     actual,
		MirrorID:   mirror.ID,
		MirrorName: mirrorLabel(mirror),
	}

	// 校验：只有拿到期望值时才判定。清单缺失（ExpectedSHA256 为空）
	// **不算失败** —— 发布流程里可能某一版忘了传 SHA256SUMS.txt，
	// 为此拒绝安装会让用户彻底没法升级；Verified=false 会如实告诉
	// 界面「这一版没能校验」，把风险讲清楚而不是替他决定。
	if want := strings.ToLower(strings.TrimSpace(opts.ExpectedSHA256)); want != "" {
		if want != actual {
			_ = os.Remove(target)
			return DownloadResult{}, fmt.Errorf("校验失败：文件哈希与 SHA256SUMS.txt 不一致（下载包可能已损坏，请重试）")
		}
		res.Verified = true
	}

	if opts.OnProgress != nil {
		opts.OnProgress(Progress{
			Done: written, Total: total, Percent: 100,
			MirrorID: mirror.ID, MirrorName: mirrorLabel(mirror),
			Attempt: attempt, Message: "下载完成",
		})
	}
	return res, nil
}

// isTruncation 判断一个传输错误是不是「对端提前断开」这一类。
//
// http.Response.Body 在 Content-Length 未读满就遇到连接关闭时，
// 会返回 io.ErrUnexpectedEOF（包在 *http.httpError 里），
// 文本是 "unexpected EOF"。它和真正的读错误（磁盘、TLS）要区分开：
// 前者重试就好，后者重试也没用。
func isTruncation(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, io.EOF) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unexpected eof") || strings.Contains(msg, "连接被中断")
}

// expectedSize 在服务端没给 Content-Length 时兜底（此时返回 0）。
func (o DownloadOptions) expectedSize(*http.Response) int64 { return 0 }

// copyWithStall 在拷贝的同时检测「卡住」。
//
// 为什么必须单独做这件事：代理失效的典型表现是 TCP 连得上、HTTP 头也回了，
// 然后 body 一个字节都不来。此时 io.Copy 会**永远**阻塞下去，
// 进度条停在原地，用户既不知道发生了什么，也不会自动切到备用通道。
// 这里用「距上次收到字节超过 stallTimeout 就取消」来打破这个僵局，
// 让 Download 的循环能走到下一条通道。
func copyWithStall(ctx context.Context, cancel context.CancelFunc, dst io.Writer, src io.Reader, pump *progressPump) (int64, error) {
	buf := make([]byte, 128<<10)
	var written int64
	lastData := time.Now()

	for {
		if err := ctx.Err(); err != nil {
			return written, err
		}

		// 读之前先设一个 deadline 语义的检查：Go 的 io.Reader 不支持超时，
		// 所以把「读」放进 goroutine，主循环只等结果或超时。
		type readResult struct {
			n   int
			err error
		}
		done := make(chan readResult, 1)
		go func() {
			n, err := src.Read(buf)
			done <- readResult{n, err}
		}()

		select {
		case <-ctx.Done():
			return written, ctx.Err()
		case r := <-done:
			if r.n > 0 {
				if _, err := dst.Write(buf[:r.n]); err != nil {
					return written, fmt.Errorf("写入失败：%w", err)
				}
				written += int64(r.n)
				lastData = time.Now()
				pump.update(written)
			}
			if r.err != nil {
				if r.err == io.EOF {
					return written, nil
				}
				return written, fmt.Errorf("传输中断：%w", r.err)
			}
		case <-time.After(stallTimeout):
			// 还没到 stallTimeout 就继续等；这个分支只在
			// 「距离上次收到数据已经很久」时才有意义，
			// 所以这里用 lastData 判断而不是直接判失败。
			if time.Since(lastData) >= stallTimeout {
				cancel()
				return written, fmt.Errorf("连接卡住（%s 内没有收到数据）", stallTimeout)
			}
		}
	}
}

/* --------------------------------------------------------------------------
   进度节流
   -------------------------------------------------------------------------- */

type progressPump struct {
	fn       func(Progress)
	total    int64
	mirror   Mirror
	attempt  int
	lastSent time.Time
	lastPct  int
	started  time.Time
	lastByte int64
}

func newProgressPump(fn func(Progress), total int64, mirror Mirror, attempt int) *progressPump {
	p := &progressPump{
		fn: fn, total: total, mirror: mirror, attempt: attempt,
		lastPct: -1, started: time.Now(),
	}
	if fn != nil {
		fn(p.snapshot(0, "正在连接…"))
	}
	return p
}

func (p *progressPump) update(done int64) {
	pct := -1
	if p.total > 0 {
		pct = int(done * 100 / p.total)
	}
	// 节流：1% 一跳，且两次事件之间至少隔 200ms。
	// 快网络上 1% 可能几毫秒就过去了，光看百分比仍然会刷爆事件。
	if pct == p.lastPct && time.Since(p.lastSent) < 200*time.Millisecond {
		return
	}
	if p.fn == nil {
		// 没有回调时仍然要推进节流状态：否则 lastSent 永远停在起点，
		// 一旦调用方在中途挂上回调（或复用一个 pump），节流判断就是错的。
		p.snapshot(done, "")
		return
	}
	p.fn(p.snapshot(done, ""))
}

func (p *progressPump) snapshot(done int64, message string) Progress {
	pct := -1
	if p.total > 0 {
		pct = int(done * 100 / p.total)
	}
	p.lastSent = time.Now()
	p.lastPct = pct

	speed := ""
	if elapsed := time.Since(p.started).Seconds(); elapsed > 0.5 {
		speed = FormatSpeed(float64(done) / elapsed)
	}
	p.lastByte = done

	return Progress{
		Done: done, Total: p.total, Percent: pct, SpeedText: speed,
		MirrorID: p.mirror.ID, MirrorName: mirrorLabel(p.mirror),
		Attempt: p.attempt, Message: message,
	}
}

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */

func mirrorLabel(m Mirror) string {
	if m.Name != "" {
		return m.Name
	}
	if m.Prefix == "" {
		return "直连 GitHub"
	}
	return m.Prefix
}

// safeFileName 把资产名清洗成安全的文件名（防目录穿越）。
//
// 资产名来自远端 JSON，直接拼进路径的话，一个 `../../x.exe` 就能写到
// 临时目录外面去。
func safeFileName(name string) string {
	base := filepath.Base(strings.TrimSpace(name))
	base = strings.ReplaceAll(base, "\\", "_")
	if base == "" || base == "." || base == ".." {
		return "update.bin"
	}
	return base
}

func platformLabel() string {
	return platformOSName() + "/" + runtimeArchName()
}

func platformOSName() string {
	switch runtimeGOOS() {
	case "windows":
		return "Windows"
	case "darwin":
		return "macOS"
	case "linux":
		return "Linux"
	default:
		return runtimeGOOS()
	}
}

// friendlyNetErr 把 Go 的网络错误翻译成用户能看懂的一句话。
//
// 原始错误像 `Get "https://...": dial tcp 140.82.x.x:443: connectex: A connection
// attempt failed because the connected party did not properly respond`，
// 直接铺在界面上没人看得懂，但完全丢掉又没法排查 —— 所以这里只翻译
// 「最外层那层意思」，原文仍会进日志。
func friendlyNetErr(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	lower := strings.ToLower(msg)

	switch {
	case strings.Contains(lower, "timeout") || strings.Contains(lower, "deadline exceeded"):
		return fmt.Errorf("连接超时")
	case strings.Contains(lower, "connection refused"):
		return fmt.Errorf("对方拒绝了连接")
	case strings.Contains(lower, "no such host"):
		return fmt.Errorf("域名解析失败（可能是 DNS 或网络不可达）")
	case strings.Contains(lower, "certificate") || strings.Contains(lower, "tls"):
		return fmt.Errorf("HTTPS 证书校验失败")
	case strings.Contains(lower, "eof"):
		return fmt.Errorf("连接被中断")
	case strings.Contains(lower, "context canceled"):
		return fmt.Errorf("已取消")
	}
	return err
}
