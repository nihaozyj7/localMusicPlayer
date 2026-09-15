package main

import (
	"context"
	"embed"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"musicplayer/internal/bilibili"
	"musicplayer/internal/bootstrap"
	"musicplayer/internal/coverfetch"
	"musicplayer/internal/ffmpeg"
	"musicplayer/internal/library"
	"musicplayer/internal/loudness"
	"musicplayer/internal/media"
	"musicplayer/internal/metacache"
	"musicplayer/internal/skins"
	"musicplayer/internal/theme"
)

//go:embed all:frontend/dist
var assets embed.FS

// 托盘图标（PNG）。与构建用的窗口/可执行文件图标同源：build/appicon.png，
// 由 `wails3 task generate:icons` 从它生成 Windows .ico / macOS .icns，
// 这里嵌进二进制给系统托盘用（Wails 的托盘只认 PNG 字节）。
//
//go:embed build/appicon.png
var appIconPNG []byte

type appState struct {
	store  *bootstrap.Store
	lib    *library.Manager
	watch  *library.Watcher
	themes *theme.Manager
	skins  *skins.Manager
	media  *media.Server
	loud   *loudness.Manager
	window *application.WebviewWindow
	app    *application.App

	windowBackdrop string

	librarySvc  *LibraryService
	windowSvc   *WindowService
	loudnessSvc *LoudnessService
	downloadSvc *DownloadService
	coverSvc    *CoverService
	lyricsSvc   *LyricsService
	metaCache   *metacache.Store
}

var state *appState

func main() {
	state = &appState{}

	store, err := bootstrap.NewStore()
	if err != nil {
		log.Fatalf("load config failed: %v", err)
	}
	state.store = store

	themeMgr, err := theme.NewManager(store.DataDir())
	if err != nil {
		log.Printf("theme dir failed: %v", err)
	} else {
		state.themes = themeMgr
	}

	// 播放界面皮肤：只看用户数据目录里的样式包，内置皮肤由前端打包提供。
	// 目录建不出来也不致命 —— 前端拿到的空列表就等于「没有自定义皮肤」，
	// 但同源托管的 handler 需要它非 nil 才有意义（见下面的 Middleware）。
	skinMgr, err := skins.NewManager(store.DataDir())
	if err != nil {
		log.Printf("skin dir failed: %v", err)
	} else {
		state.skins = skinMgr
	}

	lib := library.NewManager(store)
	state.lib = lib
	loudMgr := loudness.NewManager(store.DataDir(), store.Get().ScanConcurrency)
	state.loud = loudMgr

	songs := func(id string) (bootstrap.Song, bool) { return lib.SongByID(id) }
	mediaSrv := media.New(songs)
	mediaSrv.SetCacheDir(filepath.Join(store.DataDir(), "cache", "transcode"))
	state.media = mediaSrv
	if base, err := mediaSrv.Start(); err != nil {
		log.Printf("media server failed: %v", err)
	} else {
		log.Printf("media server: %s", base)
	}

	// 在线能力共用一个 bilibili 客户端：WBI 签名密钥与设备标识只需要取一次
	onlineClient := bilibili.NewClient()
	onlineSvc := newOnlineService(store, onlineClient)
	// 歌词 / 封面自动匹配时用 AI 清洗元数据
	aiSvc := NewAiService(store)
	onlineSvc.setAI(aiSvc)

	go func() {
		if err := ffmpeg.Prewarm(); err != nil {
			log.Printf("[ffmpeg] prewarm failed: %v", err)
		}
		tools := ffmpeg.Resolve()
		bin := tools.FFmpeg
		if bin == "" {
			bin = "未找到"
		}
		log.Printf("[ffmpeg] 就绪：%s（%s）", bin, tools.Describe())
		mediaSrv.RefreshFFmpeg()
		loudMgr.RefreshTools()
		emit("ffmpeg:ready", map[string]any{
			"available": tools.Available(),
			"source":    tools.Source,
			"describe":  tools.Describe(),
		})
	}()

	watch, err := library.NewWatcher(lib)
	if err != nil {
		log.Printf("watcher init failed: %v", err)
	} else {
		state.watch = watch
	}

	state.librarySvc = NewLibraryService(lib, watch, store)
	state.windowSvc = NewWindowService(store)
	state.loudnessSvc = NewLoudnessService(loudMgr, lib)
	state.downloadSvc = NewDownloadService(store, onlineClient)
	// 封面/歌词缓存放在配置的缓存目录下（默认 %APPDATA%\MusicPlayer\cache）
	state.metaCache = metacache.NewStore(filepath.Join(store.Get().CacheDir, "meta"))
	state.coverSvc = NewCoverService(store, state.metaCache, coverfetch.New(), songs)
	// AI 元数据清洗：自动匹配封面时先用它把脏文件名解析成正确的元数据。
	state.coverSvc.setAI(aiSvc)

	// 歌词服务：读缓存 + 在线自动匹配。
	// 缓存与在线匹配都是可选依赖（注入失败时功能降级，不影响本地歌词读取）。
	lyricsSvc := NewLyricsService(store, songs)
	lyricsSvc.setCache(state.metaCache)
	lyricsSvc.setOnline(newLyricsMatcher(onlineSvc))
	lyricsSvc.setAI(aiSvc)
	state.lyricsSvc = lyricsSvc

	// 主题 / 样式服务需要应用句柄来弹「导入文件夹」的选择器（见各自的 Import）。
	themeSvc := NewThemeService(themeMgr)
	skinSvc := NewSkinService(skinMgr)

	var browserArgs []string
	if port := strings.TrimSpace(os.Getenv("MUSICPLAYER_DEBUG_PORT")); port != "" {
		browserArgs = append(browserArgs, "--remote-debugging-port="+port)
	}

	app := application.New(application.Options{
		Name:        "Music Player",
		Description: "Local music player with online search",
		Services: []application.Service{
			application.NewService(state.librarySvc),
			application.NewService(NewPlaylistService(store)),
			application.NewService(state.lyricsSvc),
			application.NewService(themeSvc),
			application.NewService(skinSvc),
			application.NewService(NewConfigService(store)),
			application.NewService(NewMediaService(mediaSrv, songs)),
			application.NewService(state.loudnessSvc),
			application.NewService(state.windowSvc),
			application.NewService(onlineSvc),
			application.NewService(state.downloadSvc),
			application.NewService(state.coverSvc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
			Middleware: func(next http.Handler) http.Handler {
				audio := mediaSrv.Handler()
				online := onlineSvc.Handler()
				// 自定义皮肤是用户数据目录里的文件，必须由我们自己按只读规则
				// 托管（asset server 只认打包进二进制的 frontend/dist）。
				var skinsHandler http.Handler
				if state.skins != nil {
					skinsHandler = state.skins.Handler()
				}
				earlyTheme := earlyThemeHandler(store, themeMgr)
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					// 首帧主题：必须在静态资源之前拦下来，否则会被当成
					// 「不存在的文件」而 404（index.html 的 <head> 里同步引用它）。
					if r.URL.Path == earlyThemePath {
						earlyTheme.ServeHTTP(w, r)
						return
					}
					if strings.HasPrefix(r.URL.Path, onlinePrefix) {
						online.ServeHTTP(w, r)
						return
					}
					if strings.HasPrefix(r.URL.Path, media.AudioPrefix) {
						audio.ServeHTTP(w, r)
						return
					}
					if strings.HasPrefix(r.URL.Path, skins.Prefix) {
						if skinsHandler == nil {
							http.NotFound(w, r)
							return
						}
						skinsHandler.ServeHTTP(w, r)
						return
					}
					next.ServeHTTP(w, r)
				})
			},
		},
		Windows: application.WindowsOptions{
			DisableQuitOnLastWindowClosed: false,
			AdditionalBrowserArgs:         browserArgs,
		},
		// 单实例：第二次启动时 Wails 会把第二个进程的参数发给已经在跑的实例，
		// 然后第二个进程自己退出（见 single_instance.go）。回调里要做的就是
		// 「把已有窗口显示出来并抢焦点」——这正是需求里要的行为。
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.musicplayer.app",
			OnSecondInstanceLaunch: func(application.SecondInstanceData) {
				if state != nil && state.windowSvc != nil {
					state.windowSvc.ShowMain()
				}
			},
		},
	})
	state.app = app
	state.librarySvc.app = app
	state.windowSvc.app = app
	themeSvc.app = app
	skinSvc.app = app
	// 下载服务需要应用句柄来弹「选择保存位置」的目录对话框，
	// 并把进度/结果通过事件推给前端
	state.downloadSvc.app = app
	state.downloadSvc.setEmitter(emit)
	// 下载完成后把新文件立刻纳入曲库：下载目录是隐式扫描根，而「实时监听」
	// 未必开着（也可能因为启动时没有音乐文件夹而根本没启动），只靠监听会漏。
	state.downloadSvc.setOnFileAdded(func(path string) {
		go func() {
			if _, err := state.lib.RescanPaths(context.Background(), []string{path}); err != nil {
				log.Printf("[download] 新文件入库失败: %v", err)
			}
		}()
	})
	// 封面服务需要应用句柄来弹「选择本地图片」的文件对话框
	state.coverSvc.app = app
	state.coverSvc.setEmitter(emit)
	// 下载目录变了要让曲库重载文件夹（下载目录是隐式扫描根）并重扫一次，
	// 这样刚迁移过去的歌会立刻出现在「本地歌曲」里。
	state.downloadSvc.onDirChanged = func() {
		state.lib.ReloadFolders()
		go func() {
			if _, err := state.lib.Scan(context.Background(), false); err != nil {
				log.Printf("[download] 迁移后重扫失败: %v", err)
			}
		}()
	}

	backdropMode := bootstrap.NormalizeBackdropMode(store.Get().NativeBackdrop)
	winOpts := application.WebviewWindowOptions{
		Name:      "main",
		Title:     "Music Player",
		Width:     1280,
		Height:    820,
		MinWidth:  1000,
		MinHeight: 680,
		Frameless: true,
		// 窗口底色取近黑，和深色主题一致（浅色主题由前端首帧就换掉，见 early_theme.go）
		BackgroundColour: application.NewRGB(8, 8, 10),
		URL:              "/",
		// 先隐藏，等前端把第一帧画完再显示（WindowService.MarkReady）。
		//
		// 不隐藏的话 Wails 会用带 WS_VISIBLE 的样式创建窗口，而 WebView2 在页面
		// 渲染完成前会先亮一块白底 —— 那就是首屏那一下「闪一下」。
		// 隐藏创建能直接从样式里去掉 WS_VISIBLE（Wails issue #4611 的修法）。
		Hidden: true,
	}
	if backdrop, ok := backdropTypeFor(backdropMode); ok {
		winOpts.BackgroundType = application.BackgroundTypeTranslucent
		winOpts.Windows.BackdropType = backdrop
	} else {
		backdropMode = "off"
	}
	state.windowBackdrop = backdropMode
	state.window = app.Window.NewWithOptions(winOpts)
	state.windowSvc.activeBackdrop = backdropMode

	// 关闭行为：开着「最小化到托盘」时，把这次关闭拦下来，改成隐藏窗口。
	//
	// 必须用 RegisterHook 而不是 OnWindowEvent：Hook 比 Listener 先跑，
	// 取消事件才能同时拦住 Wails 内建的「销毁窗口」和下面那个关桌面歌词的
	// Listener。用 Listener 的话事件已经在派发途中，窗口照样会被销毁。
	state.window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		if !state.windowSvc.hideToTrayOnClose() {
			return
		}
		e.Cancel()
		// 隐藏走主线程（Hide 内部是 InvokeSync）；事件回调本身可能就在主线程上，
		// 同步调用会自己等自己，所以放 goroutine。
		go state.windowSvc.HideMain()
	})

	// 显示时机：窗口是隐藏创建的（避开 WebView2 的白底首帧），正常由前端的
	// MarkReady 在几百毫秒内显示（见 services.go#MarkReady）。
	//
	// 这里补两次定时重试，纯粹是兜底：
	//   · 前端的信号可能因为脚本报错没发出来；
	//   · 也可能发得太早（窗口实现还没从 pendingRun 里跑起来，Show() 会直接返回）。
	// MarkReady 只在「还没真正显示过」时动手，所以重复调用不会抢焦点。
	time.AfterFunc(1500*time.Millisecond, state.windowSvc.MarkReady)
	time.AfterFunc(4*time.Second, state.windowSvc.MarkReady)

	// 上次开着「关闭时最小化到托盘」的话，启动时就把托盘图标建出来
	if store.Get().MinimizeToTray {
		state.windowSvc.ensureTray()
	}

	// 主窗口关闭 = 退出应用：桌面歌词与桌面背景歌词都是独立的额外窗口，
	// 不跟着关的话它们会单独留在桌面上，应用也不会退出
	// （DisableQuitOnLastWindowClosed=false 只在「最后一个窗口」关闭时才退出）。
	// 这里在主窗口收到 WindowClosing 时顺手把这两个模式一起关掉
	// （走单选入口，它本身就是「全关」）。
	//
	// 用 goroutine 而不是同步调用：窗口关闭事件跑在主线程上，而
	// WebviewWindow.Close() 内部走 InvokeSync，同步调用会死锁。
	state.window.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		go state.windowSvc.setDesktopMode(desktopModeOff)
	})
	// 上次退出时开着桌面歌词 / 桌面背景歌词的话，这里记下来，等应用真的 Run
	// 起来之后再恢复。不能在此时直接打开：那一刻 Wails 的窗口实现还没就绪，
	// WebviewWindow.Show() 会直接返回，窗口根本创建不出来（详见 early_theme.go）。
	restoreDesktopModeOnStartup(app, store, state.windowSvc)

	app.OnShutdown(func() {
		if state.watch != nil {
			state.watch.Stop()
		}
		if state.media != nil {
			state.media.Stop()
		}
		if err := state.lib.SaveCache(); err != nil {
			log.Printf("save cache failed: %v", err)
		}
	})

	go func() {
		if store.Get().AutoScanOnStart {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			res, err := lib.Scan(ctx, false)
			if err != nil {
				log.Printf("first scan failed: %v", err)
				emit("scan:failed", map[string]any{"message": err.Error()})
			} else {
				log.Printf("first scan done: kept=%d excluded=%d", res.Kept, res.Excluded)
				emit("scan:done", res)
			}
		}
		startWatchers()
	}()

	if err := app.Run(); err != nil {
		log.Fatalf("app exit: %v", err)
	}
}

func startWatchers() {
	if state == nil || state.watch == nil {
		return
	}
	cfg := state.store.Get()
	if !cfg.WatchFolders {
		return
	}
	// 用 EffectiveFolders（含隐式下载根），与 Scan 的口径保持一致
	folders := cfg.EffectiveFolders()
	roots := make([]string, 0, len(folders))
	for _, f := range folders {
		roots = append(roots, f.Path)
	}
	if len(roots) == 0 {
		return
	}
	if err := state.watch.Start(roots); err != nil {
		log.Printf("watcher start failed: %v", err)
	}
}

func emit(name string, payload any) {
	if state == nil || state.app == nil {
		return
	}
	state.app.Event.Emit(name, payload)
}
