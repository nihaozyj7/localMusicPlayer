package main

import (
	"context"
	"embed"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

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
			application.NewService(NewThemeService(themeMgr)),
			application.NewService(NewSkinService(skinMgr)),
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
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	})
	state.app = app
	state.librarySvc.app = app
	state.windowSvc.app = app
	// 下载服务需要应用句柄来弹「选择保存位置」的目录对话框，
	// 并把进度/结果通过事件推给前端
	state.downloadSvc.app = app
	state.downloadSvc.setEmitter(emit)
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
		Name:             "main",
		Title:            "Music Player",
		Width:            1280,
		Height:           820,
		MinWidth:         1000,
		MinHeight:        680,
		Frameless:        true,
		BackgroundColour: application.NewRGB(8, 8, 10),
		URL:              "/",
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

	// 主窗口关闭 = 退出应用：桌面歌词是独立的置顶窗口，不跟着关的话它会
	// 单独留在桌面上，应用也不会退出（DisableQuitOnLastWindowClosed=false
	// 只在「最后一个窗口」关闭时才退出）。这里在主窗口收到 WindowClosing 时
	// 顺手把歌词窗口也关掉。
	//
	// 用 goroutine 而不是同步调用：窗口关闭事件跑在主线程上，而
	// WebviewWindow.Close() 内部走 InvokeSync，同步调用会死锁。
	state.window.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		go state.windowSvc.SetDesktopLyrics(false)
	})
	// 上次退出时开着桌面歌词的话，这里把它恢复出来
	// （必须在主窗口创建之后：歌词窗口会读取主屏尺寸来定位自己）
	if store.Get().ShowDesktopLyrics {
		state.windowSvc.SetDesktopLyrics(true)
	}

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
	roots := make([]string, 0, len(cfg.Folders))
	for _, f := range cfg.Folders {
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
