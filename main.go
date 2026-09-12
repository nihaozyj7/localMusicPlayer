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

	"github.com/wailsapp/wails/v3/pkg/application"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/library"
	"musicplayer/internal/media"
	"musicplayer/internal/theme"
)

//go:embed all:frontend/dist
var assets embed.FS

// appState 汇总应用运行期的各个组件，避免全局变量散落
type appState struct {
	store  *bootstrap.Store
	lib    *library.Manager
	watch  *library.Watcher
	themes *theme.Manager
	media  *media.Server
	window *application.WebviewWindow
	app    *application.App

	librarySvc *LibraryService
	windowSvc  *WindowService
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

	/* ---- 3) 曲库与音频服务 ---- */
	lib := library.NewManager(store)
	state.lib = lib

	songs := func(id string) (bootstrap.Song, bool) { return lib.SongByID(id) }
	mediaSrv := media.New(songs)
	state.media = mediaSrv
	if base, err := mediaSrv.Start(); err != nil {
		log.Printf("音频服务启动失败: %v", err)
	} else {
		log.Printf("音频服务: %s（转码能力: %v）", base, mediaSrv.CanTranscode())
	}

	watch, err := library.NewWatcher(lib)
	if err != nil {
		log.Printf("文件夹监听初始化失败: %v", err)
	} else {
		state.watch = watch
	}

	/* ---- 4) 服务实例 ---- */
	state.librarySvc = NewLibraryService(lib, watch, store)
	state.windowSvc = NewWindowService()

	/* ---- 5) Wails 应用 ---- */
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
			application.NewService(state.windowSvc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Windows: application.WindowsOptions{
			DisableQuitOnLastWindowClosed: false,
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
