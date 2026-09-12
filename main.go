// 音乐播放器 —— Go + Wails3 桌面应用入口。
//
// 启动顺序：
//  1. 载入配置（%APPDATA%\MusicPlayer\config.json）
//  2. 准备主题目录管理器（把内置主题同步到用户目录）
//  3. 启动本地音频服务（127.0.0.1 随机端口 + 随机 token）
//  4. 创建 Wails 应用与窗口（无边框，自绘标题栏）
//  5. 首次扫描曲库 + 启动文件夹监听
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

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/ffmpeg"
	"musicplayer/internal/library"
	"musicplayer/internal/loudness"
	"musicplayer/internal/media"
	"musicplayer/internal/theme"
)

//go:embed all:frontend/dist
var assets embed.FS

// appState 汇总应用运行期的各个组件，避免全局变量散落
type appState struct {
	store   *bootstrap.Store
	lib     *library.Manager
	watch   *library.Watcher
	themes  *theme.Manager
	media   *media.Server
	loud    *loudness.Manager
	window  *application.WebviewWindow
	app     *application.App

	librarySvc  *LibraryService
	windowSvc   *WindowService
	loudnessSvc *LoudnessService
}

var state *appState

func main() {
	state = &appState{}

	/* ---- 1) 配置 ---- */
	store, err := bootstrap.NewStore()
	if err != nil {
		log.Fatalf("载入配置失败: %v", err)
	}
	state.store = store
	log.Printf("配置文件: %s", store.Path())

	/* ---- 2) 主题目录 ---- */
	themeMgr, err := theme.NewManager(store.DataDir())
	if err != nil {
		log.Printf("主题目录准备失败（将只使用内置主题）: %v", err)
	} else {
		state.themes = themeMgr
		log.Printf("主题目录: %s（%d 个主题）", themeMgr.Dir(), len(themeMgr.List()))
	}

	/* ---- 3) 曲库、音频服务与响度测量 ---- */
	lib := library.NewManager(store)
	state.lib = lib

	loudMgr := loudness.NewManager(store.DataDir(), store.Get().ScanConcurrency)
	state.loud = loudMgr

	songs := func(id string) (bootstrap.Song, bool) { return lib.SongByID(id) }
	mediaSrv := media.New(songs)
	mediaSrv.SetCacheDir(filepath.Join(store.DataDir(), "cache", "transcode"))
	state.media = mediaSrv
	if base, err := mediaSrv.Start(); err != nil {
		log.Printf("音频服务启动失败: %v", err)
	} else {
		log.Printf("音频服务: %s（转码能力: %v）", base, mediaSrv.CanTranscode())
	}

	// 内置 ffmpeg 是 155MB，解包要一两秒：放后台做，别挡住窗口显示。
	// 解包完成后刷新一次解析结果，转码与响度测量就能用上内置版本。
	go func() {
		if err := ffmpeg.Prewarm(); err != nil {
			log.Printf("[ffmpeg] 内置二进制解包失败: %v", err)
		}
		tools := ffmpeg.Resolve()
		path := tools.FFmpeg
		if path == "" {
			path = "未找到"
		}
		log.Printf("[ffmpeg] 可用: %v 来源=%s 路径=%s", tools.Available(), tools.Describe(), path)
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
		log.Printf("文件夹监听初始化失败: %v", err)
	} else {
		state.watch = watch
	}

	/* ---- 4) 服务实例 ---- */
	state.librarySvc = NewLibraryService(lib, watch, store)
	state.windowSvc = NewWindowService()
	state.loudnessSvc = NewLoudnessService(loudMgr, lib)

	/* ---- 5) Wails 应用 ---- */
	//
	// MUSICPLAYER_DEBUG_PORT 会让 WebView2 打开远程调试端口（如 9333），
	// 之后可以用 http://127.0.0.1:9333/json 接入 DevTools 查看真实页面里的
	// 报错、网络请求与 DOM —— 排查「界面里能复现但外部测不出来」的问题时非常有用。
	// 平时不设置该变量，端口不会打开。
	var browserArgs []string
	if port := strings.TrimSpace(os.Getenv("MUSICPLAYER_DEBUG_PORT")); port != "" {
		browserArgs = append(browserArgs, "--remote-debugging-port="+port)
		log.Printf("[debug] WebView2 远程调试已开启：http://127.0.0.1:%s/json", port)
	}

	app := application.New(application.Options{
		Name:        "音乐播放器",
		Description: "本地音乐播放器 · Go + Wails3",
		Services: []application.Service{
			application.NewService(state.librarySvc),
			application.NewService(NewPlaylistService(store)),
			application.NewService(NewLyricsService(store, songs)),
			application.NewService(NewThemeService(themeMgr)),
			application.NewService(NewConfigService(store)),
			application.NewService(NewMediaService(mediaSrv, songs)),
			application.NewService(state.loudnessSvc),
			application.NewService(state.windowSvc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
			// 音频必须与页面同源：WebView2 会拒绝从 http://wails.localhost
			// 页面加载 http://127.0.0.1:port 的媒体（URL safety check），
			// 连请求都不会发出去。因此这里把 /audio/ 直接挂到 asset server 上。
			Middleware: func(next http.Handler) http.Handler {
				audio := mediaSrv.Handler()
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if strings.HasPrefix(r.URL.Path, media.AudioPrefix) {
						audio.ServeHTTP(w, r)
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

	/* ---- 6) 窗口：无边框 + 自绘标题栏 ---- */
	state.window = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "音乐播放器",
		Width:            1280,
		Height:           820,
		MinWidth:         1000,
		MinHeight:        680,
		Frameless:        true,
		BackgroundColour: application.NewRGB(8, 8, 10),
		URL:              "/",
	})

	app.OnShutdown(func() {
		if state.watch != nil {
			state.watch.Stop()
		}
		if state.media != nil {
			state.media.Stop()
		}
		if err := state.lib.SaveCache(); err != nil {
			log.Printf("保存元数据缓存失败: %v", err)
		}
	})

	/* ---- 7) 首次扫描 + 监听 ---- */
	go func() {
		if store.Get().AutoScanOnStart {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			res, err := lib.Scan(ctx, false)
			if err != nil {
				log.Printf("首次扫描失败: %v", err)
				emit("scan:failed", map[string]any{"message": err.Error()})
			} else {
				log.Printf("首次扫描完成：保留 %d 首，过滤 %d 个", res.Kept, res.Excluded)
				emit("scan:done", res)
			}
		}
		startWatchers()
	}()

	if err := app.Run(); err != nil {
		log.Fatalf("应用退出: %v", err)
	}
}

// startWatchers 按配置启动文件夹监听
func startWatchers() {
	if state == nil || state.watch == nil {
		return
	}
	cfg := state.store.Get()
	if !cfg.WatchFolders {
		log.Printf("文件夹监听：已关闭（设置里可开启）")
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
		log.Printf("文件夹监听启动失败: %v", err)
		return
	}
	log.Printf("文件夹监听已启动：%d 个目录", len(roots))
}

// emit 向所有窗口广播事件
func emit(name string, payload any) {
	if state == nil || state.app == nil {
		return
	}
	state.app.Event.Emit(name, payload)
}
