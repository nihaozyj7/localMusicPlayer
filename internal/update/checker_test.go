package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

/* ==========================================================================
   checker_test.go — 检测与下载
   --------------------------------------------------------------------------
   用 httptest 把 GitHub API 换成假服务器。这样能测到真实网络里最要紧的
   那几条路径：**代理挂掉时能不能自动降级**、**哈希对不上会不会拒绝安装**、
   **卡住的连接会不会被超时打破**。这三条在手工点界面时全都很难复现。
   ========================================================================== */

// fakeRelease 造一份 release JSON。
func fakeRelease(tag string, assets []Asset, draft, prerelease bool) Release {
	return Release{
		TagName:     tag,
		Name:        tag,
		Body:        "## 更新内容\n\n- 修了几个问题",
		HTMLURL:     "https://github.com/o/r/releases/tag/" + tag,
		Draft:       draft,
		Prerelease:  prerelease,
		PublishedAt: "2026-02-01T10:00:00Z",
		Assets:      assets,
	}
}

func windowsAsset(tag string) Asset {
	return Asset{
		Name:               fmt.Sprintf("LMPlayer-%s-windows-x64.exe", tag),
		Size:               1024,
		BrowserDownloadURL: "https://github.com/o/r/releases/download/" + tag + "/app.exe",
	}
}

// assetNamed 用给定的文件名造一个资产（体积与地址都是占位值）。
//
// 为什么需要它：windowsAsset 写死了 windows-x64，而 PickAsset 是按
// runtime.GOOS 挑档位的 —— 在 Linux/macOS 上那个资产永远匹配不上。
// 需要「当前平台能挑中」的测试应该用 currentPlatformAssetName()
// （定义在 mirror_test.go，同属 update 包）再配这个构造器。
func assetNamed(name, tag string) Asset {
	return Asset{
		Name:               name,
		Size:               1024,
		BrowserDownloadURL: "https://github.com/o/r/releases/download/" + tag + "/" + name,
	}
}

// newAPIServer 起一个只提供 releases 列表的假 API。
func newAPIServer(t *testing.T, releases []Release, status int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/releases") {
			http.NotFound(w, r)
			return
		}
		// GitHub 要求带 UA；这里顺带断言客户端确实带了，
		// 因为漏掉它线上表现是 403，很难猜到原因。
		if r.Header.Get("User-Agent") == "" {
			t.Errorf("请求缺少 User-Agent，真实 GitHub 会返回 403")
		}
		if status != 0 && status != http.StatusOK {
			// 模拟限流响应
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.WriteHeader(status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(releases)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newTestClient(srv *httptest.Server) *Client {
	return &Client{
		Repo:    "o/r",
		APIBase: srv.URL,
		HTTP:    &http.Client{Timeout: 5 * time.Second},
	}
}

/* --------------------------------------------------------------------------
   检查更新
   -------------------------------------------------------------------------- */

func TestCheckReportsUpdateAvailable(t *testing.T) {
	// ★ 资产必须带**当前平台**的关键字。
	//
	// PickAsset 按 runtime.GOOS 选档位（见 release.go 的 platformKinds）：
	// 在 Linux 上喂一个纯 windows.exe 的列表，正确结果就是「没有当前平台的
	// 安装包」——Check 会据此填 res.Error 并置 Available=false。
	// 原测试写死了 windowsAsset，在 Linux 上因此失败
	//（CI 此前因 gofmt 红灯从未真正跑到测试，所以一直没暴露）。
	name := currentPlatformAssetName()
	if name == "" {
		t.Skipf("未知平台 %s，platformKinds 没有对应档位", runtime.GOOS)
	}

	srv := newAPIServer(t, []Release{fakeRelease("v0.2.0", []Asset{assetNamed(name, "v0.2.0")}, false, false)}, 0)
	c := newTestClient(srv)

	res, err := c.Check(context.Background(), "0.1.1", false)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if res.Error != "" {
		t.Fatalf("不应有错误：%s", res.Error)
	}
	if !res.HasUpdate {
		t.Fatal("0.1.1 → 0.2.0 应当报告有更新")
	}
	if res.Latest != "v0.2.0" {
		t.Fatalf("Latest = %q", res.Latest)
	}
	if res.Current != "0.1.1" {
		t.Fatalf("Current = %q", res.Current)
	}
	if res.Notes == "" {
		t.Fatal("应当带上更新说明")
	}
	if res.ReleaseURL == "" {
		t.Fatal("应当带上 release 网页地址")
	}
	if res.PublishedAt == 0 {
		t.Fatal("应当解析出发布时间")
	}
	// 既然喂的就是当前平台的资产，任何平台上都应该挑得出来 ——
	// 不再需要 `if runtime.GOOS == "windows"` 这种平台分支。
	if !res.Available {
		t.Fatalf("应当能找到可下载的资产（平台 %s，喂的是 %s）", runtime.GOOS, name)
	}
	if res.AssetSizeText == "" {
		t.Fatal("应当带上体积文本")
	}
	if res.DownloadURL == "" {
		t.Fatal("应当带上下载地址")
	}
}

func TestCheckReportsUpToDate(t *testing.T) {
	srv := newAPIServer(t, []Release{fakeRelease("v0.1.1", []Asset{windowsAsset("v0.1.1")}, false, false)}, 0)
	res, err := newTestClient(srv).Check(context.Background(), "0.1.1", false)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if res.HasUpdate {
		t.Fatal("同版本不应报告有更新")
	}
	if res.Error != "" {
		t.Fatalf("「已是最新」不是错误状态，得到：%s", res.Error)
	}
}

func TestCheckTreatsOlderRemoteAsUpToDate(t *testing.T) {
	// 开发机本地版本比远端新（本地已 bump 但还没发版）—— 不应提示「更新」。
	srv := newAPIServer(t, []Release{fakeRelease("v0.1.0", []Asset{windowsAsset("v0.1.0")}, false, false)}, 0)
	res, err := newTestClient(srv).Check(context.Background(), "0.2.0", false)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if res.HasUpdate {
		t.Fatal("远端版本更旧时不应提示更新")
	}
}

func TestCheckSkipsDraftAndPrerelease(t *testing.T) {
	releases := []Release{
		fakeRelease("v0.9.0", []Asset{windowsAsset("v0.9.0")}, true, false),  // draft：跳过
		fakeRelease("v0.8.0", []Asset{windowsAsset("v0.8.0")}, false, true),  // 预发布：默认跳过
		fakeRelease("v0.2.0", []Asset{windowsAsset("v0.2.0")}, false, false), // 应选这个
	}
	srv := newAPIServer(t, releases, 0)
	res, err := newTestClient(srv).Check(context.Background(), "0.1.0", false)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if res.Latest != "v0.2.0" {
		t.Fatalf("应当跳过 draft 与 prerelease，得到 %q", res.Latest)
	}
}

func TestCheckIncludesPrereleaseWhenAsked(t *testing.T) {
	releases := []Release{
		fakeRelease("v0.2.0", []Asset{windowsAsset("v0.2.0")}, false, false),
		fakeRelease("v0.3.0-beta.1", []Asset{windowsAsset("v0.3.0-beta.1")}, false, true),
	}
	srv := newAPIServer(t, releases, 0)
	res, err := newTestClient(srv).Check(context.Background(), "0.1.0", true)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if res.Latest != "v0.3.0-beta.1" {
		t.Fatalf("开启预发布后应当选 0.3.0-beta.1，得到 %q", res.Latest)
	}
	if !res.Prerelease {
		t.Fatal("应当标记为预发布")
	}
}

func TestCheckPicksHighestVersionNotFirstInList(t *testing.T) {
	// API 按创建时间倒序返回；补发旧版本补丁会让顺序与版本号大小不一致。
	releases := []Release{
		fakeRelease("v0.1.5", []Asset{windowsAsset("v0.1.5")}, false, false),
		fakeRelease("v0.2.0", []Asset{windowsAsset("v0.2.0")}, false, false),
	}
	srv := newAPIServer(t, releases, 0)
	res, err := newTestClient(srv).Check(context.Background(), "0.1.0", false)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if res.Latest != "v0.2.0" {
		t.Fatalf("应当按版本号取最大（0.2.0），得到 %q", res.Latest)
	}
}

func TestCheckNetworkFailureIsReportedNotSwallowed(t *testing.T) {
	// 这是最关键的一条不变量：网络失败**不能**被伪装成「已是最新版」。
	// 那样用户会以为自己在最新版上，永远不会去排查网络。
	c := &Client{
		Repo:    "o/r",
		APIBase: "http://127.0.0.1:1",
		HTTP:    &http.Client{Timeout: 2 * time.Second},
	}
	res, err := c.Check(context.Background(), "0.1.0", false)
	if err != nil {
		t.Fatalf("网络失败不应返回 error（那是要被展示的状态）：%v", err)
	}
	if res.Error == "" {
		t.Fatal("网络失败时必须填 Error，否则界面会显示成「已是最新」")
	}
	if res.HasUpdate {
		t.Fatal("检查失败时不应声称有更新")
	}
	if res.CheckedAt == 0 {
		t.Fatal("即使失败也应当带上检查时间")
	}
}

func TestCheckRateLimitHint(t *testing.T) {
	srv := newAPIServer(t, nil, http.StatusForbidden)
	res, err := newTestClient(srv).Check(context.Background(), "0.1.0", false)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if !strings.Contains(res.Error, "API 调用次数已用完") {
		t.Fatalf("403 且剩余为 0 时应当给出限流提示，得到：%s", res.Error)
	}
}

func TestCheckNewVersionWithoutPlatformAsset(t *testing.T) {
	// 有新版本但没有当前平台的包：必须与「已是最新」区分开。
	var assets []Asset
	if runtime.GOOS == "windows" {
		assets = []Asset{{Name: "LMPlayer-v0.2.0-macos-arm64.dmg", Size: 100}}
	} else {
		assets = []Asset{{Name: "LMPlayer-v0.2.0-windows-x64.exe", Size: 100}}
	}
	srv := newAPIServer(t, []Release{fakeRelease("v0.2.0", assets, false, false)}, 0)
	res, err := newTestClient(srv).Check(context.Background(), "0.1.0", false)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if !res.HasUpdate {
		t.Fatal("应当报告有更新")
	}
	if res.Available {
		t.Fatal("没有对应平台资产时 Available 应为 false")
	}
	if res.Error == "" {
		t.Fatal("应当说明「没有当前平台的安装包」")
	}
}

func TestCheckEmptyReleaseList(t *testing.T) {
	srv := newAPIServer(t, []Release{}, 0)
	res, err := newTestClient(srv).Check(context.Background(), "0.1.0", false)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if res.Error == "" {
		t.Fatal("没有任何 release 时应当给出说明")
	}
}

func TestCheckRejectsBadArguments(t *testing.T) {
	c := NewClient("")
	if _, err := c.Check(context.Background(), "0.1.0", false); err == nil {
		t.Fatal("仓库为空时应当返回 error（这是配置问题，不是网络状态）")
	}
	c2 := NewClient("o/r")
	if _, err := c2.Check(context.Background(), "not-a-version", false); err == nil {
		t.Fatal("当前版本号非法时应当返回 error")
	}
}

/* --------------------------------------------------------------------------
   下载：通道降级
   -------------------------------------------------------------------------- */

// redirectTransport 把**所有**下载请求都重定向到一个本地测试服务器，
// 不管候选地址里写的是 github.com 还是某个代理域名。
//
// 这是让降级测试能离线跑的关键：否则「第二条通道」会真的去连
// ghproxy.net 之类的第三方，测试既要联网又不可复现，
// 而且真实代理有时会返回 403 页面而不是连接错误，
// 反而把断言带到无关的方向上。
type redirectTransport struct{ base string }

func (rt redirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.URL.Scheme = "http"
	clone.URL.Host = strings.TrimPrefix(rt.base, "http://")
	clone.Host = ""
	return http.DefaultTransport.RoundTrip(clone)
}

// localClient 返回一个把下载全部导向 srv 的 Client。
func localClient(srv *httptest.Server) *Client {
	return &Client{
		Repo:         "o/r",
		DownloadHTTP: &http.Client{Transport: redirectTransport{base: srv.URL}},
	}
}

func TestDownloadFailsOverWhenFirstChannelErrors(t *testing.T) {
	// 核心路径：第一条通道失败 → 自动切到下一条并成功。
	// 这正是「网络环境差时切到代理下载」要保证的行为。
	payload := []byte("fake-installer-content-for-testing")
	sum := sha256.Sum256(payload)
	wantSum := hex.EncodeToString(sum[:])

	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 第一次请求（直连）失败，之后成功 —— 模拟「直连不通、代理可用」。
		if atomic.AddInt32(&hits, 1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Length", fmt.Sprint(len(payload)))
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dir := t.TempDir()
	c := localClient(srv)

	var attempts []string
	res, err := c.Download(context.Background(), DownloadOptions{
		URL:            "https://github.com/o/r/releases/download/v0.2.0/app.exe",
		AssetName:      "app.exe",
		TempDir:        dir,
		Channel:        ChannelAuto,
		ExpectedSHA256: wantSum,
		OnAttempt: func(i int, m Mirror) {
			attempts = append(attempts, m.ID)
		},
	})
	if err != nil {
		t.Fatalf("第一通道失败后应当切到下一通道并成功：%v", err)
	}
	if res.Bytes != int64(len(payload)) {
		t.Fatalf("下载字节数 = %d，期望 %d", res.Bytes, len(payload))
	}
	if !res.Verified {
		t.Fatal("哈希应当校验通过")
	}
	if res.Attempts != 2 {
		t.Fatalf("应当尝试 2 次（第二次成功），得到 %d", res.Attempts)
	}
	if len(attempts) < 2 {
		t.Fatalf("应当报告每次尝试的通道，得到 %v", attempts)
	}
	if attempts[0] != "direct" {
		t.Fatalf("auto 模式下第一次应当试直连，得到 %q", attempts[0])
	}
	if attempts[1] != "ghproxy.net" {
		t.Fatalf("第二次应当切到名单里的第一条代理，得到 %q", attempts[1])
	}
	// 最终成功的通道要被如实记录下来（界面要显示「这次走的哪条」）
	if res.MirrorID != "ghproxy.net" {
		t.Fatalf("MirrorID = %q，期望 ghproxy.net", res.MirrorID)
	}
	got, err := os.ReadFile(res.Path)
	if err != nil {
		t.Fatalf("读回下载文件失败：%v", err)
	}
	if string(got) != string(payload) {
		t.Fatal("文件内容与预期不一致")
	}
}

func TestDownloadAllChannelFailuresMentionsEveryChannel(t *testing.T) {
	// 所有通道都失败时，错误信息必须**逐条列出**试过的通道与失败原因。
	// 只报最后一条（"403 Forbidden"）会把最重要的线索丢掉：
	// 用户需要知道「是全网都不通，还是只有某个代理挂了」。
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := localClient(srv)
	_, err := c.Download(context.Background(), DownloadOptions{
		URL:       "https://github.com/o/r/releases/download/v1/app.exe",
		AssetName: "app.exe",
		TempDir:   t.TempDir(),
		Channel:   ChannelAuto,
	})
	if err == nil {
		t.Fatal("所有通道都失败时应当返回错误")
	}
	if !strings.Contains(err.Error(), "所有下载通道都失败了") {
		t.Fatalf("错误信息应当说明是全部通道失败：%v", err)
	}
	// 每条通道都要出现在错误里（"直连" 与至少一个代理名）
	if !strings.Contains(err.Error(), "直连") {
		t.Fatalf("错误信息应当列出试过的通道：%v", err)
	}
	if !strings.Contains(err.Error(), "ghproxy.net") {
		t.Fatalf("错误信息应当列出代理通道：%v", err)
	}
}

func TestDownloadRejectsChecksumMismatch(t *testing.T) {
	// 下载包被篡改/损坏时必须拒绝，并且**不能留下文件**。
	payload := []byte("tampered-content")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(len(payload)))
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dir := t.TempDir()
	c := NewClient("o/r")
	_, err := c.Download(context.Background(), DownloadOptions{
		URL:       srv.URL + "/app.exe",
		AssetName: "app.exe",
		TempDir:   dir,
		Channel:   "direct", // 只试直连，让错误直接暴露
		// 故意给一个错误的期望哈希
		ExpectedSHA256: strings.Repeat("0", 64),
	})
	if err == nil {
		t.Fatal("哈希不匹配时必须失败")
	}
	if !strings.Contains(err.Error(), "不一致") {
		t.Fatalf("应当说明是哈希不一致：%v", err)
	}
	// 校验失败的文件不能留在临时目录里
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		t.Errorf("校验失败后不应留下文件，却发现 %s", e.Name())
	}
}

func TestDownloadWithoutChecksumStillSucceeds(t *testing.T) {
	// 发布时忘了传 SHA256SUMS.txt 不应让用户完全无法升级：
	// 应当成功下载，但如实报告 Verified=false。
	payload := []byte("no-checksum-available")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(len(payload)))
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	c := NewClient("o/r")
	res, err := c.Download(context.Background(), DownloadOptions{
		URL:       srv.URL + "/app.exe",
		AssetName: "app.exe",
		TempDir:   t.TempDir(),
		Channel:   "direct",
	})
	if err != nil {
		t.Fatalf("没有校验和时应当仍然成功：%v", err)
	}
	if res.Verified {
		t.Fatal("没有校验和时 Verified 应为 false")
	}
	if res.SHA256 == "" {
		t.Fatal("应当仍然算出实测哈希，供界面展示")
	}
}

func TestDownloadDetectsTruncatedTransfer(t *testing.T) {
	// 服务端声明 1000 字节却只发 10 字节：必须判失败，
	// 否则会安装一个残缺的 exe。
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "1000")
		_, _ = w.Write([]byte("short"))
	}))
	defer srv.Close()

	c := localClient(srv)
	_, err := c.Download(context.Background(), DownloadOptions{
		URL:       "https://github.com/o/r/releases/download/v1/app.exe",
		AssetName: "app.exe",
		TempDir:   t.TempDir(),
		// 只走直连：这条测的是「截断检测」，不需要把 8 条通道都试一遍。
		Channel: "direct",
	})
	if err == nil {
		t.Fatal("传输不完整时必须失败")
	}
	if !strings.Contains(err.Error(), "下载不完整") {
		t.Fatalf("应当报告下载不完整：%v", err)
	}
}

func TestDownloadRespectsContextCancellation(t *testing.T) {
	// 用户点「取消」：必须立刻停下来，而不是继续跑完所有通道。
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "1000000")
		w.WriteHeader(http.StatusOK)
		// 慢慢发，让取消有机会生效
		for i := 0; i < 50; i++ {
			select {
			case <-r.Context().Done():
				return
			default:
			}
			_, _ = w.Write([]byte(strings.Repeat("x", 1000)))
			time.Sleep(10 * time.Millisecond)
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(60 * time.Millisecond)
		cancel()
	}()

	c := NewClient("o/r")
	_, err := c.Download(ctx, DownloadOptions{
		URL:       srv.URL + "/app.exe",
		AssetName: "app.exe",
		TempDir:   t.TempDir(),
		Channel:   "direct",
	})
	if err == nil {
		t.Fatal("取消后应当返回错误")
	}
}

func TestDownloadRejectsEmptyOptions(t *testing.T) {
	c := NewClient("o/r")
	if _, err := c.Download(context.Background(), DownloadOptions{TempDir: t.TempDir()}); err == nil {
		t.Fatal("下载地址为空时应当失败")
	}
	if _, err := c.Download(context.Background(), DownloadOptions{URL: "https://x/y"}); err == nil {
		t.Fatal("临时目录为空时应当失败")
	}
}

/* --------------------------------------------------------------------------
   进度回调
   -------------------------------------------------------------------------- */

func TestDownloadReportsProgress(t *testing.T) {
	payload := make([]byte, 512<<10)
	for i := range payload {
		payload[i] = byte(i)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(len(payload)))
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	var events []Progress
	c := NewClient("o/r")
	_, err := c.Download(context.Background(), DownloadOptions{
		URL:       srv.URL + "/app.exe",
		AssetName: "app.exe",
		TempDir:   t.TempDir(),
		Channel:   "direct",
		OnProgress: func(p Progress) {
			events = append(events, p)
		},
	})
	if err != nil {
		t.Fatalf("下载失败：%v", err)
	}
	if len(events) == 0 {
		t.Fatal("应当有进度回调")
	}
	// 最后一条必须是 100%
	last := events[len(events)-1]
	if last.Percent != 100 {
		t.Fatalf("最后一条进度应当是 100%%，得到 %d", last.Percent)
	}
	if last.Done != int64(len(payload)) {
		t.Fatalf("最后一条的字节数不对：%d", last.Done)
	}
	// 进度事件必须被节流：不节流的话 512KB 会产生几千条事件
	if len(events) > 60 {
		t.Fatalf("进度事件过多（%d 条），节流可能失效", len(events))
	}
	for _, e := range events {
		if e.MirrorID == "" {
			t.Fatal("进度里应当带上通道信息")
		}
	}
}

func TestProgressPercentUnknownTotal(t *testing.T) {
	p := newProgressPump(nil, 0, Mirror{ID: "direct"}, 1)
	snap := p.snapshot(500, "")
	if snap.Percent != -1 {
		t.Fatalf("总长未知时 Percent 应为 -1，得到 %d", snap.Percent)
	}
}

/* --------------------------------------------------------------------------
   与镜像表联动：候选顺序真的会被 Download 使用
   -------------------------------------------------------------------------- */

func TestDownloadChosenMirrorOrder(t *testing.T) {
	// 用户指定了通道时，那个通道必须**第一个**被尝试（尊重用户选择）。
	// 这里既检查候选顺序，也用一次真实的 Download 调用确认它确实按这个顺序走。
	raw := "https://github.com/o/r/releases/download/v1/app.exe"
	got := Candidates(raw, "ghfast.top")
	if len(got) == 0 || got[0] != "https://ghfast.top/"+raw {
		t.Fatalf("指定通道应当排第一，得到 %v", got)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := localClient(srv)
	var order []string
	_, _ = c.Download(context.Background(), DownloadOptions{
		URL:       raw,
		AssetName: "app.exe",
		TempDir:   t.TempDir(),
		Channel:   "ghfast.top",
		OnAttempt: func(i int, m Mirror) {
			order = append(order, m.ID)
		},
	})
	if len(order) == 0 {
		t.Fatal("应当有尝试记录")
	}
	if order[0] != "ghfast.top" {
		t.Fatalf("用户指定的通道应当第一个被尝试，得到 %q", order[0])
	}
	// 兜底仍然要在（代理会挂，只认一个通道的话用户就只能手动改设置）
	if len(order) < 2 {
		t.Fatalf("指定通道后仍应有兜底通道，得到 %v", order)
	}
}

func TestDownloadProgressPumpRespectsNilCallback(t *testing.T) {
	// OnProgress 为 nil 时不能 panic（服务层在静默检查时会传 nil）。
	p := newProgressPump(nil, 100, Mirror{ID: "direct"}, 1)
	p.update(50)
	p.update(100)
	if p.lastPct != 100 {
		t.Fatalf("lastPct 应当被更新，得到 %d", p.lastPct)
	}
}

func TestFriendlyNetErr(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Get \"https://x\": dial tcp: i/o timeout", "连接超时"},
		{"dial tcp 1.2.3.4:443: connect: connection refused", "对方拒绝了连接"},
		{"dial tcp: lookup github.com: no such host", "域名解析失败（可能是 DNS 或网络不可达）"},
		{"unexpected EOF", "连接被中断"},
	}
	for _, c := range cases {
		got := friendlyNetErr(fmt.Errorf("%s", c.in))
		if got == nil || got.Error() != c.want {
			t.Errorf("friendlyNetErr(%q) = %v，期望 %q", c.in, got, c.want)
		}
	}
	if friendlyNetErr(nil) != nil {
		t.Fatal("nil 应当返回 nil")
	}
}

/* --------------------------------------------------------------------------
   落盘路径
   -------------------------------------------------------------------------- */

func TestDownloadWritesIntoTempDirOnly(t *testing.T) {
	payload := []byte("payload")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(len(payload)))
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dir := t.TempDir()
	c := NewClient("o/r")
	res, err := c.Download(context.Background(), DownloadOptions{
		// 资产名里带目录穿越：落盘路径必须仍在 TempDir 内
		URL:       srv.URL + "/app.exe",
		AssetName: "../../../../evil.exe",
		TempDir:   dir,
		Channel:   "direct",
	})
	if err != nil {
		t.Fatalf("下载失败：%v", err)
	}
	abs, _ := filepath.Abs(res.Path)
	absDir, _ := filepath.Abs(dir)
	if !strings.HasPrefix(abs, absDir+string(filepath.Separator)) {
		t.Fatalf("文件落到了临时目录之外：%s", abs)
	}
}
