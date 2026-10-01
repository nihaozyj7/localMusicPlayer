package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/update"
)

/* ==========================================================================
   services_update.go — 版本更新（检测 / 下载 / 安装）
   --------------------------------------------------------------------------
   功能分三步，每一层都刻意暴露给前端一个**明确的状态**而不是布尔值：

     Check    —— 问 GitHub「最新版是什么」，并和当前版本比大小；
     Download —— 逐个通道（直连 → 各代理）尝试，带进度与 SHA-256 校验；
     Install  —— 启动一个引导脚本，等本进程退出后替换 exe 并重启。

   为什么下载要放在 Go 侧而不是前端 fetch：
     1. 前端跑在 WebView 里，受同源与 CSP 限制，直接拉 github.com 的
        release 资产并不总是可行；
     2. 代理降级需要「按顺序试、失败换下一个、并统计每条通道的失败原因」，
        这套逻辑在前端写会散在 Promise 链里，没法测；
     3. 校验哈希与落盘本来就必须在后端做。

   为什么「检查」不走代理而「下载」走：
     API 响应只有几 KB，直连通常可用；要加速的是十几 MB 的资产
     （它走 objects.githubusercontent.com，国内经常连不上）。让检查也去挤代理，
     只会平白多一个可能失败的环节。详见 internal/update/checker.go 顶部的说明。
   ========================================================================== */

// UpdateService 是暴露给前端的更新服务。
type UpdateService struct {
	store *bootstrap.Store
	app   *application.App

	// repo 是 "owner/name"。做成字段而不是常量，便于测试指到别的仓库。
	repo string
	// currentVersion 是当前运行的版本（来自 appVersion 常量）。
	currentVersion string
	// client 是检测器；测试时可以替换。
	client *update.Client

	emitFn func(string, any)

	mu sync.Mutex
	// checking 防止用户连点「检查更新」时并发发起多个请求
	checking bool
	// downloading 表示当前有下载在进行
	downloading bool
	// cancelDownload 取消正在进行的下载（用户点「取消」）
	cancelDownload context.CancelFunc
	// lastCheck 缓存上一次检查结果，供界面重新打开时直接渲染
	lastCheck *update.CheckResult
	// pending 是下载完成、等待安装的安装包
	pending *update.DownloadResult
	// pendingName 是等待安装的资产文件名（界面上要显示）
	pendingName string

	// now 便于测试注入时间。
	now func() time.Time
}

// repoSlug 是本项目在 GitHub 上的仓库，更新检查的唯一数据源。
const repoSlug = "nihaozyj7/localMusicPlayer"

// NewUpdateService 构造服务。
func NewUpdateService(store *bootstrap.Store) *UpdateService {
	return &UpdateService{
		store:          store,
		repo:           repoSlug,
		currentVersion: appVersion,
		client:         update.NewClient(repoSlug),
		now:            time.Now,
	}
}

// setEmitter 注入事件发送函数（main 在创建应用后调用）。
//
// 故意不导出：Wails 会把服务的导出方法生成到前端绑定里，
// 而入参是函数的方法走 JSON 序列化一定会失败（与 DownloadService 同理）。
func (s *UpdateService) setEmitter(fn func(string, any)) { s.emitFn = fn }

func (s *UpdateService) emit(name string, payload any) {
	if s.emitFn != nil {
		s.emitFn(name, payload)
	}
}

// setApp 注入应用句柄（安装完成后用它退出进程）。
func (s *UpdateService) setApp(app *application.App) { s.app = app }

/* --------------------------------------------------------------------------
   只读信息
   -------------------------------------------------------------------------- */

// Version 返回当前版本号（与 AppService.Version 同源，这里只是让
// 更新界面少一次调用）。
func (s *UpdateService) Version() string { return s.currentVersion }

// Mirrors 返回可选的下载通道，供设置界面渲染下拉框。
//
// 返回的是**副本**：直接返回内部切片的话，前端拿到之后一旦就地修改
// 就会改到全局名单（那是一个包级变量）。
func (s *UpdateService) Mirrors() []map[string]any {
	s.mu.Lock()
	channel := s.channelLocked()
	s.mu.Unlock()

	out := make([]map[string]any, 0, len(update.Mirrors))
	for _, m := range update.Mirrors {
		out = append(out, map[string]any{
			"id":      m.ID,
			"name":    m.Name,
			"prefix":  m.Prefix,
			"note":    m.Note,
			"current": m.ID == channel,
		})
	}
	return out
}

// State 返回更新相关的当前状态快照（界面重新打开时直接渲染）。
func (s *UpdateService) State() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := map[string]any{
		"currentVersion": s.currentVersion,
		"channel":        s.channelLocked(),
		"checking":       s.checking,
		"downloading":    s.downloading,
		"repo":           s.repo,
		"repoUrl":        "https://github.com/" + s.repo,
	}
	if s.store != nil {
		cfg := s.store.Get()
		out["checkOnStart"] = cfg.UpdateCheckOnStart
		out["skippedVersion"] = cfg.SkippedVersion
	}
	if s.lastCheck != nil {
		out["check"] = s.lastCheck
	}
	if s.pending != nil {
		out["pending"] = map[string]any{
			"name":     s.pendingName,
			"path":     s.pending.Path,
			"bytes":    s.pending.Bytes,
			"verified": s.pending.Verified,
			"mirrorId": s.pending.MirrorID,
		}
	}
	return out
}

// channelLocked 读当前下载通道（调用方持锁）。
func (s *UpdateService) channelLocked() string {
	if s.store == nil {
		return update.ChannelAuto
	}
	return bootstrap.NormalizeUpdateChannel(s.store.Get().UpdateChannel)
}

/* --------------------------------------------------------------------------
   设置
   -------------------------------------------------------------------------- */

// SetChannel 记住用户选的下载通道。
func (s *UpdateService) SetChannel(id string) error {
	if s.store == nil {
		return errors.New("配置不可用")
	}
	channel := bootstrap.NormalizeUpdateChannel(id)
	return s.store.Update(func(c *bootstrap.Config) { c.UpdateChannel = channel })
}

// SetCheckOnStart 开关「启动时自动检查更新」。
func (s *UpdateService) SetCheckOnStart(on bool) error {
	if s.store == nil {
		return errors.New("配置不可用")
	}
	return s.store.Update(func(c *bootstrap.Config) { c.UpdateCheckOnStart = on })
}

// SkipVersion 记下「跳过这个版本」，之后不再为它提示。
//
// 传空字符串等于取消跳过（界面上「不再跳过」用得到）。
func (s *UpdateService) SkipVersion(version string) error {
	if s.store == nil {
		return errors.New("配置不可用")
	}
	clean := strings.TrimSpace(version)
	return s.store.Update(func(c *bootstrap.Config) { c.SkippedVersion = clean })
}

/* --------------------------------------------------------------------------
   检查更新
   -------------------------------------------------------------------------- */

// Check 检查是否有新版本。
//
// force=false 时尊重用户「跳过此版本」的选择：那个版本仍然会写进结果
// （界面可以显示「你跳过了 vX」），但 HasUpdate 置为 false，
// 免得每次启动都弹同一个提示。
func (s *UpdateService) Check(force bool) (update.CheckResult, error) {
	s.mu.Lock()
	if s.checking {
		s.mu.Unlock()
		// 已经在检查了：把上一次的结果还给调用方，而不是再发一次请求。
		// 重复请求除了浪费额度，还会让界面上两个并发的响应互相覆盖。
		if s.lastCheck != nil {
			return *s.lastCheck, nil
		}
		return update.CheckResult{Current: s.currentVersion, Error: "正在检查中"}, nil
	}
	s.checking = true
	client := s.client
	current := s.currentVersion
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.checking = false
		s.mu.Unlock()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	res, err := client.Check(ctx, current, false)
	if err != nil {
		return update.CheckResult{}, err
	}

	// 「跳过此版本」：如实告诉界面这是被跳过的，但不当作「有更新」。
	if skipped := s.skippedVersion(); skipped != "" && res.Latest != "" && sameVersion(skipped, res.Latest) {
		res.HasUpdate = false
		res.Available = false
	}

	s.mu.Lock()
	s.lastCheck = &res
	s.mu.Unlock()

	s.emit("update:checked", res)
	return res, nil
}

// CheckSilently 是启动时的静默检查：不推 update:checked 之外的任何界面变化，
// 失败也只记日志。
//
// 它与 Check 分开，是因为「启动时后台跑」和「用户点了按钮」的语义不同：
// 前者不该弹任何错误提示（用户没要求这次检查），后者必须把失败讲清楚。
func (s *UpdateService) CheckSilently() {
	if s.store != nil && !s.store.Get().UpdateCheckOnStart {
		return
	}
	res, err := s.Check(false)
	if err != nil {
		log.Printf("[update] 启动检查失败：%v", err)
		return
	}
	if res.Error != "" {
		log.Printf("[update] 启动检查：%s", res.Error)
		return
	}
	if res.HasUpdate {
		log.Printf("[update] 发现新版本 %s（当前 %s）", res.Latest, res.Current)
	}
}

func (s *UpdateService) skippedVersion() string {
	if s.store == nil {
		return ""
	}
	return strings.TrimSpace(s.store.Get().SkippedVersion)
}

// sameVersion 比较两个版本字符串是否等价（允许 `v` 前缀差异）。
func sameVersion(a, b string) bool {
	va, err1 := update.ParseVersion(a)
	vb, err2 := update.ParseVersion(b)
	if err1 != nil || err2 != nil {
		return strings.TrimSpace(a) == strings.TrimSpace(b)
	}
	return va.CompareTo(vb) == 0
}

/* --------------------------------------------------------------------------
   下载
   -------------------------------------------------------------------------- */

// Download 下载上一次检查发现的新版本。
//
// 为什么让前端先 Check 再 Download，而不是 Download 自己重新查一遍：
// 用户是看着「v0.2.0，17MB」那个界面点的下载，中途重新检查可能拿到
// 更新的版本，界面上的数字就和实际下载的东西对不上了。
func (s *UpdateService) Download() (update.DownloadResult, error) {
	s.mu.Lock()
	if s.downloading {
		s.mu.Unlock()
		return update.DownloadResult{}, errors.New("已经有一个下载在进行中")
	}
	check := s.lastCheck
	s.mu.Unlock()

	if check == nil {
		return update.DownloadResult{}, errors.New("请先检查更新")
	}
	if check.DownloadURL == "" {
		return update.DownloadResult{}, errors.New("没有可下载的安装包，请到发布页面手动下载")
	}

	dir := s.installDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return update.DownloadResult{}, fmt.Errorf("创建更新目录失败：%w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	s.mu.Lock()
	s.downloading = true
	s.cancelDownload = cancel
	channel := s.channelLocked()
	client := s.client
	s.mu.Unlock()

	defer func() {
		cancel()
		s.mu.Lock()
		s.downloading = false
		s.cancelDownload = nil
		s.mu.Unlock()
	}()

	// 期望哈希：资产旁边通常有一个 SHA256SUMS.txt。取它是一次额外请求，
	// 失败不影响主流程（只是少了校验，结果里会如实标 Verified=false）。
	expected := s.fetchExpectedSum(ctx, check)

	res, err := client.Download(ctx, update.DownloadOptions{
		URL:            check.DownloadURL,
		AssetName:      check.AssetName,
		TempDir:        dir,
		Channel:        channel,
		ExpectedSHA256: expected,
		OnProgress: func(p update.Progress) {
			s.emit("update:progress", p)
		},
		OnAttempt: func(attempt int, m update.Mirror) {
			// 换通道时给界面一句话，否则用户只看到进度条从 0 重新开始
			// 却不知道发生了什么（尤其是自动降级很常见）。
			name := m.Name
			if name == "" {
				name = "直连 GitHub"
			}
			msg := fmt.Sprintf("正在通过 %s 下载", name)
			if attempt > 1 {
				msg = fmt.Sprintf("上一条通道不可用，改用 %s", name)
			}
			s.emit("update:progress", update.Progress{
				Percent: -1, MirrorID: m.ID, MirrorName: name,
				Attempt: attempt, Message: msg,
			})
		},
	})
	if err != nil {
		s.emit("update:failed", map[string]any{"message": err.Error()})
		return update.DownloadResult{}, err
	}

	// 记住这条通道：用户下次再更新时，直接从成功过的通道开始，
	// 不必重走一遍「直连超时 → 换代理」的过程。
	if res.MirrorID != "" && res.MirrorID != update.ChannelAuto {
		if err := s.SetChannel(res.MirrorID); err != nil {
			log.Printf("[update] 记住下载通道失败：%v", err)
		}
	}

	s.mu.Lock()
	s.pending = &res
	s.pendingName = check.AssetName
	s.mu.Unlock()

	s.emit("update:downloaded", map[string]any{
		"name":     check.AssetName,
		"version":  check.Latest,
		"bytes":    res.Bytes,
		"verified": res.Verified,
		"mirrorId": res.MirrorID,
		"path":     res.Path,
	})
	return res, nil
}

// CancelDownload 取消正在进行的下载。
func (s *UpdateService) CancelDownload() bool {
	s.mu.Lock()
	cancel := s.cancelDownload
	s.mu.Unlock()
	if cancel == nil {
		return false
	}
	cancel()
	return true
}

// fetchExpectedSum 取 SHA256SUMS.txt 并解析出当前资产的期望哈希。
//
// 拿不到就返回空字符串（调用方按「没有校验和」处理）。这里刻意不报错：
// 校验是**加固**，不是更新的前置条件；为它中断整个流程是不划算的。
func (s *UpdateService) fetchExpectedSum(ctx context.Context, check *update.CheckResult) string {
	if check == nil || check.DownloadURL == "" {
		return ""
	}

	// 校验和文件的地址：把资产名换成 SHA256SUMS.txt，同目录同 tag。
	base := check.DownloadURL
	if idx := strings.LastIndex(base, "/"); idx > 0 {
		base = base[:idx]
	}
	sumURL := base + "/SHA256SUMS.txt"

	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	body, err := s.client.FetchText(ctx, sumURL, 64<<10)
	if err != nil {
		log.Printf("[update] 取校验和失败（将不校验哈希）：%v", err)
		return ""
	}
	sums := update.ParseChecksums(body)
	if sum, ok := update.ChecksumFor(sums, check.AssetName); ok {
		return sum
	}
	return ""
}

/* --------------------------------------------------------------------------
   安装
   -------------------------------------------------------------------------- */

// Install 启动引导脚本，替换当前程序并重启。
//
// 时序：写脚本 → 起一个**独立**的 cmd 进程 → 退出本应用。
// 三条都必须对：
//
//	· 脚本进程必须脱离本进程（不共享控制台、不作为子进程等待），
//	  否则本进程退出时它会被一起带走；
//	· 必须先起脚本再退出：反过来就没有人来做替换了；
//	· 退出要用 app.Quit（走正常的关闭流程：保存曲库缓存、释放媒体键），
//	  而不是 os.Exit（会跳过 OnShutdown，用户下次启动要重新全库扫描）。
func (s *UpdateService) Install() (map[string]any, error) {
	s.mu.Lock()
	pending := s.pending
	name := s.pendingName
	s.mu.Unlock()

	if pending == nil || strings.TrimSpace(pending.Path) == "" {
		return nil, errors.New("还没有下载好可安装的更新")
	}
	if _, err := os.Stat(pending.Path); err != nil {
		return nil, fmt.Errorf("安装包已不存在，请重新下载：%w", err)
	}

	target, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("定位当前程序失败：%w", err)
	}
	target, err = filepath.EvalSymlinks(target)
	if err != nil {
		// 解析不了就用原路径：不是致命问题，替换逻辑照样能跑。
		target, _ = os.Executable()
	}

	dir := s.installDir()
	script := filepath.Join(dir, "apply-update.bat")

	scriptPath, err := prepareInstall(installPlan{
		SourcePath:  pending.Path,
		TargetPath:  target,
		ScriptPath:  script,
		RestartArgs: os.Args[1:],
	})
	if err != nil {
		return nil, err
	}

	if err := launchInstallScript(scriptPath); err != nil {
		return nil, fmt.Errorf("启动更新脚本失败：%w", err)
	}

	// 先给界面回一句，再退出：emit 是异步的，退出太快的话前端
	// 可能来不及把「正在安装…」画出来。
	s.emit("update:installing", map[string]any{
		"name":        name,
		"target":      target,
		"installer":   pending.Path,
		"verified":    pending.Verified,
		"mirrorName":  describeChannel(pending.MirrorID),
		"restartWait": 2,
	})

	// 退出放到 goroutine 里：Install 必须先把返回值交给前端，
	// 否则这次调用的响应还没发出去，进程就已经在退了。
	go func() {
		time.Sleep(400 * time.Millisecond)
		if s.app != nil {
			s.app.Quit()
		}
	}()

	return map[string]any{
		"script":   scriptPath,
		"target":   target,
		"verified": pending.Verified,
		"quitting": true,
	}, nil
}

// OpenDownloadDir 用系统文件管理器打开「更新」目录。
//
// 安装失败时用户要用到它：脚本会把新版本回滚，但下载好的安装包
// 仍然留在那里，用户可以直接双击运行（或者拿去手动替换）。
func (s *UpdateService) OpenDownloadDir() error {
	dir := s.installDir()
	// 目录可能还不存在（从没下载过），先建出来再打开 ——
	// 打开一个不存在的路径在 Windows 上会弹一个错误框。
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("创建更新目录失败：%w", err)
	}
	return revealPath(dir)
}

// installDir 返回更新文件的落盘目录。
func (s *UpdateService) installDir() string {
	dataDir := ""
	if s.store != nil {
		dataDir = s.store.DataDir()
	}
	if strings.TrimSpace(dataDir) == "" {
		dataDir = os.TempDir()
	}
	return defaultInstallDir(dataDir)
}
