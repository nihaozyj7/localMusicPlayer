package main

import (
	"context"
	"embed"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"localmusicplayer/internal/audioplay"
	"localmusicplayer/internal/bilibili"
	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/covercache"
	"localmusicplayer/internal/coverfetch"
	"localmusicplayer/internal/ffmpeg"
	"localmusicplayer/internal/library"
	"localmusicplayer/internal/loudness"
	"localmusicplayer/internal/media"
	"localmusicplayer/internal/metacache"
	"localmusicplayer/internal/skins"
	"localmusicplayer/internal/theme"
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

	librarySvc  *LibraryService
	windowSvc   *WindowService
	appSvc      *AppService
	loudnessSvc *LoudnessService
	downloadSvc *DownloadService
	coverSvc    *CoverService
	lyricsSvc   *LyricsService
	playerSvc   *PlayerService
	// unplayableSvc 记录「播放时确认放不出来」的文件（见 services_unplayable.go）
	unplayableSvc *UnplayableService
	metaCache     *metacache.Store
	// mediaKeySvc 负责键盘媒体键（⏯）的全局热键接管
	mediaKeySvc *MediaKeyService
	// updateSvc 负责「检测 GitHub Release → 下载 → 自替换安装」
	// （见 services_update.go）
	updateSvc *UpdateService
	// aiTagSvc 负责「下载完成后用 AI 提取元数据并回写文件」（见 ai_tags.go）
	aiTagSvc *AITagService
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

	// 播放界面皮肤：**两个根都扫** —— 内置样式是 Go 侧只读 embed 资源
	// （internal/skins/resources/player-skins/），第三方在用户数据目录。
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

	// 在线能力共用一个 bilibili 客户端：WBI 签名密钥与设备标识只需要取一次。
	//
	// 提前到这里创建，因为它要参与下面后端播放的 resolve（在线歌曲兜底）。
	onlineClient := bilibili.NewClient()
	onlineSvc := newOnlineService(store, onlineClient)

	// 后端原生播放：把「解码 + 输出」从 WebView2 搬到 Go 进程。
	//
	// resolve 的职责是把歌曲 id 变成引擎能直接读的 PCM WAV 路径。
	// 走 mediaSrv.PlayableFile 是为了复用现有的转码缓存（600MB LRU）——
	// 它本来是为「浏览器播不了 ape/wma」建的，现在后端播放也吃同一份缓存，
	// 于是同一首歌不会被转码两次。
	//
	// ★ 在线歌曲的兜底（这是「在线试听不能用」的修复点）：
	//
	// 在线试听曲目**不在曲库里**（它不是用户扫描出来的文件），直接查会得到
	// 「歌曲不存在」。以前这条失败会和「文件损坏」共用同一条错误链路，
	// 于是一首完全正常的在线歌曲会被登记进「放不出来」清单 ——
	// 用户看到的正是「在线试听不能用了」。
	//
	// 现在的做法：识别出在线曲目（bili: 前缀）就先确保它的音频已经落到本地
	// 缓存（命中零开销，未命中现在下载），再正常走转码/播放。
	playerSvc := NewPlayerService(func(songID string) (string, int64, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
		defer cancel()

		if bvid, ok := onlineBVID(songID); ok {
			if _, _, err := onlineSvc.EnsureCached(ctx, bvid); err != nil {
				return "", 0, fmt.Errorf("在线试听准备失败: %w", err)
			}
		}

		path, err := mediaSrv.PlayableFile(ctx, songID)
		if err != nil {
			return "", 0, err
		}
		// ★ 把「转码时顺手扫出来的首尾静音」喂给播放引擎。
		//
		// 转码为了出声本来就要把整首歌解码一遍，顺手也把首尾静音扫了
		// （见 media.Server.transcode）。如果这里不喂进去，
		// 紧接着的 planTrimLocked 会调 LoadSilenceInfo 再扫一遍同一个文件
		// 去找同一件东西。
		//
		// 省下的量级（实测，10 分钟 / 100MB 的 WAV）：约 7ms —— 扫描只读
		// 头尾各最多 60 秒，不是整文件读取。这是切歌路径上可感知的一档，
		// 而省掉它零风险：结论已经在手上，转移成本只是一次 map 写入。
		//
		// 喂进去之后 LoadSilenceInfo 直接命中缓存（key 是路径+大小+修改
		// 时间，与转码缓存同一套口径）。
		//
		// 取不到（没扫过 / 不是转码产物）就什么都不做：
		// 那会退回原来的真扫描路径，行为与改造前一致 —— 只是快慢之别，
		// 不影响正确性。
		if song, ok := songs(songID); ok {
			if head, tail, total, ok := mediaSrv.ScanSilence(song); ok {
				audioplay.PrimeSilenceInfo(path, head, tail, total)
			}
		}
		var durMs int64
		if song, ok := songs(songID); ok {
			durMs = song.Duration
		}
		return path, durMs, nil
	})
	state.playerSvc = playerSvc

	// 播放选项（跳过首尾静音 / 切歌间隔）从配置里读。
	//
	// 注入的是「读取函数」而不是配置本身：用户在设置里改了开关之后，
	// 下一首装载就该用新值，而这个服务是长期存活的单例 ——
	// 拿一份构造时的快照会让改动要重启才生效。
	playerSvc.setConfigProvider(func() bootstrap.Config { return store.Get() })

	if base, err := mediaSrv.Start(); err != nil {
		log.Printf("media server failed: %v", err)
	} else {
		log.Printf("media server: %s", base)
	}

	// 试听缓存就绪后，把它登记成 mediaSrv 能解析到的「虚拟歌曲」。
	//
	// 走回调而不是让 OnlineService 直接依赖 media.Server：在线服务只该负责
	// 「把音频弄到本地」，谁需要这份文件、以什么形式需要，是装配层的事
	// （也让测试里可以只验缓存、不接后端）。
	onlineSvc.setVirtualResolver(func(bvid, path, ext string) {
		mediaSrv.RegisterVirtual(onlineSongID(bvid), path, ext)
	})
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
	// 「放不出来」清单：登记播放时确认失败的文件，并把它们从曲库摘掉。
	// 依赖曲库做反查与移除（见 services_unplayable.go）。
	state.unplayableSvc = NewUnplayableService(store)
	state.unplayableSvc.setLibrary(state.librarySvc)
	// themeMgr 传下去是为了算额外窗口的「创建底色」（见
	// desktop_wallpaper.go#desktopWallpaperFirstFrameColour）；它为 nil 也安全。
	state.windowSvc = NewWindowService(store, themeMgr)
	state.appSvc = NewAppService()
	state.loudnessSvc = NewLoudnessService(loudMgr, lib)
	// 响度服务要能解析在线试听曲目，否则它们完全不受响度均衡约束
	// （曲库里查不到 ⇒ Get/Measure 直接以「歌曲不存在」失败）。
	// 复用 media 的虚拟表：它登记的 Path/Size/ModTime 正是测量需要的三要素。
	state.loudnessSvc.setVirtualResolver(mediaSrv.VirtualSong)

	// ★ 把「转码时顺手算响度」接起来（这是响度测量提速的关键一环）。
	//
	// 后端播放必然要把整首歌转成 PCM WAV（见 mediaSrv.PlayableFile），
	// 那份 PCM 是整首歌唯一一次完整流过我们代码的机会。响度测量挂在这条
	// 既有的数据流上之后，就不再需要「另起一个 ffmpeg 把同一个文件解码
	// 第二遍」—— 实测每首歌省 1 秒以上，且完全不额外占一个核。
	//
	// 只对**本地曲库**曲目写缓存：在线试听曲目走虚拟表，它们的
	// Size/ModTime 与曲库记录口径不同，硬写进去只会留下一条很快过期的记录；
	// 它们仍然走原有的按需测量路径。
	mediaSrv.SetLoudnessSink(func(song bootstrap.Song, scan *ffmpeg.LoudnessScanner) {
		if song.ID == "" {
			return
		}
		// 在线试听曲目跳过：它们的 Size/ModTime 来自虚拟表，与曲库记录口径
		// 不同，硬写进去只会留下一条很快就过期的记录。它们仍走按需测量路径。
		// 判据复用 onlineBVID —— 与播放链路识别在线曲目是同一个函数。
		if _, isOnline := onlineBVID(song.ID); isOnline {
			return
		}
		res := scan.Result()
		// 拿曲库里的权威记录覆盖 Size/ModTime：转码用的 Song 可能来自
		// 虚拟表或者一次旧的快照，而缓存有效性判定认的就是这两个值。
		if authoritative, ok := songs(song.ID); ok {
			song = authoritative
		}
		state.loudnessSvc.StoreMeasurement(song, loudness.Measurement{
			Integrated: res.Integrated,
			TruePeak:   res.TruePeak,
			LRA:        res.LRA,
			Threshold:  res.Threshold,
		})
	})

	state.downloadSvc = NewDownloadService(store, onlineClient)
	// 下载与试听**共用同一份缓存**：用户在搜索结果里试听过的歌，
	// 点下载时可以直接从缓存搬到下载目录，不必重新走一遍网络。
	state.downloadSvc.setCache(onlineSvc.files)
	// 版本更新：检测 GitHub Release，下载走代理降级，安装靠自替换脚本。
	state.updateSvc = NewUpdateService(store)
	// 封面/歌词缓存放在配置的缓存目录下（默认 %APPDATA%\LocalMusicPlayer\cache）
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
	if port := strings.TrimSpace(os.Getenv("LMPLAYER_DEBUG_PORT")); port != "" {
		browserArgs = append(browserArgs, "--remote-debugging-port="+port)
	}

	app := application.New(application.Options{
		Name:        "LMPlayer",
		Description: "本地音乐播放器（localMusicPlayer）",
		// Icon 是**窗口类**图标（Windows 下经 WM_SETICON / 窗口类注册生效）。
		//
		// 为什么必须显式设置：不设置时 Wails 在 Windows 上退回
		// LoadIconWithResourceID(0, IDI_APPLICATION) —— 也就是系统默认图标，
		// 而 WebView2 自己带窗口图标，于是任务栏与**音量合成器**里显示的是
		// webview2 而不是本程序。音频改成后端输出之后，音是**本进程**发出来的，
		// 合成器那一栏的图标/名称就直接取自本进程的窗口图标 ——
		// 这里设对了，合成器里才会显示本程序。
		Icon: appIconPNG,
		Services: []application.Service{
			application.NewService(state.librarySvc),
			application.NewService(NewPlaylistService(store)),
			application.NewService(state.lyricsSvc),
			application.NewService(themeSvc),
			application.NewService(skinSvc),
			application.NewService(NewConfigService(store)),
			application.NewService(state.appSvc),
			application.NewService(NewMediaService(mediaSrv, songs)),
			application.NewService(playerSvc),
			application.NewService(state.loudnessSvc),
			application.NewService(state.windowSvc),
			application.NewService(onlineSvc),
			application.NewService(state.downloadSvc),
			application.NewService(state.coverSvc),
			application.NewService(state.unplayableSvc),
			// 版本更新（设置 → 关于 → 检查更新）
			application.NewService(state.updateSvc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
			Middleware: func(next http.Handler) http.Handler {
				audio := mediaSrv.Handler()
				online := onlineSvc.Handler()
				// 内嵌封面缓存（内容寻址的图片文件）。列表接口只下发
				// /cover/<hash>?t=… 的地址，图片由浏览器按需取并永久缓存 ——
				// 于是 IPC 载荷里不再需要几百 MB 的 base64（见 internal/covercache）。
				covers := lib.CoversHandler()
				// 自定义皮肤是用户数据目录里的文件，必须由我们自己按只读规则
				// 托管（asset server 只认打包进二进制的 frontend/dist）。
				var skinsHandler http.Handler
				if state.skins != nil {
					skinsHandler = state.skins.Handler()
				}
				earlyTheme := earlyThemeHandler(store, themeMgr)
				// 启动过渡图（上一次退出时缓存的画面）也不在 dist 里，
				// 同样要在静态资源之前拦下来（见 boot_frame.go）
				bootFrame := bootFrameHandler(store)
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					// 前端的「首帧画好了，可以露面了」信号。
					//
					// 刻意走普通 HTTP 请求，而不是 Wails 的 JS→Go 绑定：那条链路
					// 要把 web message 交给宿主线程再派发，而启动阶段宿主主线程
					// 正忙着起 WebView2，实测能晚到近一秒 —— 窗口就白等这么久，
					// 表现就是「任务栏图标都出来半天了，窗口才冒出来」。
					if r.URL.Path == bootRevealPath {
						state.windowSvc.MarkReadyAsync()
						w.WriteHeader(http.StatusNoContent)
						return
					}
					// 前端的「界面已经装配完毕」信号（比 boot/reveal 晚得多）。
					//
					// 与 bootRevealPath 的分工：那个信号只说明「窗口可以露面了」
					// （过渡画面已经画出来），模块一跑起来就发；而这个说明
					// 「bootstrap 跑完、主题套好、运行时同步已启动」。
					//
					// 桌面背景歌词的启动恢复等的是**这一个**，因为启动高峰
					// （解析 bundle、解码封面、套主题、建皮肤）正好落在这两点
					// 之间 —— 在那之前挂一整套皮肤上去，就会和主窗口抢 CPU / GPU
					// （见 early_theme.go#waitMainWindowBooted）。
					if r.URL.Path == bootBootedPath {
						state.windowSvc.MarkBooted()
						w.WriteHeader(http.StatusNoContent)
						return
					}
					// 首帧主题：必须在静态资源之前拦下来，否则会被当成
					// 「不存在的文件」而 404（index.html 的 <head> 里同步引用它）。
					if r.URL.Path == earlyThemePath {
						earlyTheme.ServeHTTP(w, r)
						return
					}
					if r.URL.Path == bootFramePath {
						bootFrame.ServeHTTP(w, r)
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
					if strings.HasPrefix(r.URL.Path, covercache.Prefix) {
						covers.ServeHTTP(w, r)
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
		// 然后第二个进程自己退出（由下面的 SingleInstanceOptions 处理）。回调里要做的就是
		// 「把已有窗口显示出来并抢焦点」——这正是需求里要的行为。
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.localmusicplayer.app",
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
	state.appSvc.app = app
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
	// 下载完成后（无论网络下载还是从试听缓存搬运）用 AI 整理元数据并回写文件。
	// 由 DownloadService 在后台 goroutine 里调，所以这里直接同步执行即可 ——
	// 它内部会串行化并自己处理「开关关掉 / AI 未配置 / 格式不支持」的跳过。
	state.aiTagSvc = NewAITagService(store)
	state.aiTagSvc.setAI(aiSvc)
	state.aiTagSvc.setLibrary(state.lib)
	state.downloadSvc.setOnDownloaded(func(path string) {
		state.aiTagSvc.Process(path)
	})
	// 封面服务需要应用句柄来弹「选择本地图片」的文件对话框
	state.coverSvc.app = app
	state.coverSvc.setEmitter(emit)
	// 「放不出来」清单：登记新条目时推一条事件给前端（刷新清单 + 提示用户）
	state.unplayableSvc.setEmitter(emit)
	// 更新服务：需要事件通道推「检查完了 / 下载进度 / 下载完成 / 正在安装」，
	// 也需要应用句柄在安装时退出进程（见 services_update.go#Install）
	state.updateSvc.setEmitter(emit)
	state.updateSvc.setApp(app)
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

	// 主窗口几何：优先用上次退出时的位置 / 尺寸 / 最大化状态，
	// 没有存档（首次启动）或存档不可用（跑到屏幕外了）时用默认值 + Wails 居中。
	//
	// 校验放在 mainWindowSavedGeometry 里：位置要至少三分之一面积落在某块屏幕内
	// （复用桌面歌词那套 rectVisibleEnough），尺寸要落在 MinWidth..上限之间。
	// 直接信任存档会让「换显示器后窗口启动了但看不见」，比不记忆更糟。
	savedX, savedY, savedW, savedH, okPos, okSize, savedMax := state.windowSvc.mainWindowSavedGeometry()

	winOpts := application.WebviewWindowOptions{
		Name:      "main",
		Title:     "LMPlayer",
		Width:     mainWindowDefaultWidth,
		Height:    mainWindowDefaultHeight,
		MinWidth:  1000,
		MinHeight: 680,
		Frameless: true,
		// 窗口底色：WebView2 吐出第一帧之前，露出来的就是它。以前写死近黑，
		// 浅色主题启动时就是「黑一下」；现在按磁盘上的真实主题算（见
		// early_theme.go#firstFrameWindowColour），取不到时才退回近黑。
		BackgroundColour: firstFrameWindowColour(store, themeMgr),
		URL:              "/",
		// 先隐藏，等前端把第一帧画完再显示（WindowService.MarkReady）。
		//
		// 不隐藏的话 Wails 会用带 WS_VISIBLE 的样式创建窗口，而 WebView2 在页面
		// 渲染完成前会先亮一块白底 —— 那就是首屏那一下「闪一下」。
		// 隐藏创建能直接从样式里去掉 WS_VISIBLE（Wails issue #4611 的修法）。
		//
		// 但「隐藏」同时意味着 WebView2 不出帧，Show 之后还要等第一帧 —— 那一段
		// 空档就是「黑一下」。应用一跑起来就用 DWM 把窗口遮住再显示，把这个空档
		// 挪到用户看不见的地方（见 services.go#showPrepared）。
		Hidden: true,
	}
	if okSize {
		winOpts.Width, winOpts.Height = savedW, savedH
	}
	if okPos {
		// 默认是 WindowCentered，会忽略 X/Y；自己摆位置必须显式写 WindowXY
		// （与桌面歌词窗口同一个坑，见 desktop_lyrics.go#desktopLyricsOptions）。
		winOpts.InitialPosition = application.WindowXY
		winOpts.X, winOpts.Y = savedX, savedY
	}
	state.window = app.Window.NewWithOptions(winOpts)

	// 记下「上次退出时是不是最大化」：窗口实现要等 Wails 自己的 goroutine
	// 把它建出来（NewWithOptions 返回时原生窗口还不存在，此刻 Maximise() 是
	// 空操作，理由同下面 applyWindowIconWithRetry 的注释），所以推迟到
	// 窗口真的显示出来之后再最大化 —— 太早调用会丢。
	go state.windowSvc.restoreMainWindowMaximizedWhenReady(savedMax)

	// 移动 / 缩放 / 最大化时把几何写进配置（见 main_window_geometry.go）
	state.windowSvc.attachMainWindowGeometryTracking(state.window)

	// 把应用图标装到窗口上（任务栏 + 音量合成器都用它）。
	//
	// 为什么不能只靠 application.Options.Icon：Wails v3.0.0-beta.14 在
	// Windows 上那个字段是空实现（windowsApp.setIcon 方法体为空），
	// 窗口类图标仍是系统通用图标 —— 详见 app_icon_windows.go 的说明。
	//
	// 为什么要用「重试」而不是直接调：NewWithOptions 返回时原生窗口
	// **还没建出来**（窗口实现是在 Wails 自己的 goroutine 里创建的），
	// 此刻 NativeWindow() 是 nil，直接调等于什么都不做（实测就是这样，
	// 日志里会看到「拿不到窗口句柄」）。这与启动流程里 cloakNativeWindow
	// 遇到的是同一个时序问题，处理方式保持一致：轮询到句柄可用为止。
	go applyWindowIconWithRetry(state.window, appIconPNG)

	// 关闭行为：开着「最小化到托盘」时，把这次关闭拦下来，改成隐藏窗口。
	//
	// 必须用 RegisterHook 而不是 OnWindowEvent：Hook 比 Listener 先跑，
	// 取消事件才能同时拦住 Wails 内建的「销毁窗口」和下面那个关桌面歌词的
	// Listener。用 Listener 的话事件已经在派发途中，窗口照样会被销毁。
	state.window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		if !state.windowSvc.hideToTrayOnClose() {
			// 真正退出：趁窗口还在（还可见、还是当前那张画面），抓一帧缓存下来，
			// 下次启动拿它当过渡图（见 boot_frame.go / index.html#boot-splash）。
			state.windowSvc.captureBootFrame()
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

	// 应用一开始跑就把窗口「显示出来但遮住」，让 WebView2 边启动边出帧。
	// 前端首帧画好就走 /boot/reveal 让 ShowMain 摘遮罩，窗口出现的那一帧
	// 已经是画好的（见 services.go#showPrepared）。
	//
	// 为什么不能晚一点再显示：WebView2 的合成器要等窗口可见才开始出帧，
	// 显示得越晚，页面吐出第一帧就越晚（实测晚 300ms 以上）。
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		state.windowSvc.startPreparedBoot()
	})

	// 上次开着「关闭时最小化到托盘」的话，启动时就把托盘图标建出来
	if store.Get().MinimizeToTray {
		state.windowSvc.ensureTray()
	}

	// ---- 后端原生音频启动 ----
	//
	// 放在 ApplicationStarted 之后而不是 main 的开头：打开声卡（WASAPI）
	// 要几十毫秒，而启动阶段最抢时间的是「建窗口 + 出首帧」。
	// 音频晚一点就绪不影响任何事 —— 前端在此之前本来也没在播放。
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		if state.playerSvc == nil {
			return
		}
		// Wails 的 Emit 是 Emit(name string, data ...any) bool，
		// 与服务的窄接口（单个 payload、无返回值）不一致，这里包一层。
		state.playerSvc.setApp(eventBridge{emit: func(name string, payload any) {
			app.Event.Emit(name, payload)
		}})
		// 播完自动下一首：回调跑在音频线程上，必须丢到 goroutine 里 ——
		// 在音频回调里做 IPC 广播会阻塞输出，直接表现为声音卡顿。
		state.playerSvc.setEOFHandler(func() {
			go emit("player:ended", map[string]any{})
		})
		if !state.playerSvc.Start() {
			// 启动失败不是致命错误：前端启动时会调 Player.Available()，拿到
			// available=false 就退回 legacy <audio> 路径（见 audio.js）。
			// 注意 player:ready 事件目前**没有订阅者**，别指望它触发回退。
			log.Printf("[player] 后端音频未启动，前端将回退到 <audio>")
		}
		startPlayerTick()

		// 键盘媒体键（⏯）：注册成系统级全局热键，所以最小化/失焦/缩托盘都能响应。
		//
		// 放在这里而不是 main 的开头：热键回调会去调前端 togglePlay，
		// 而前端要等界面装配完才挂得上监听（见 media-keys.js#startMediaKeys）——
		// 注册得太早，早期那几次按键只会走「前端不在线」的退化分支。
		startMediaKeys(state)
	})

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
		if state.playerSvc != nil {
			state.playerSvc.Stop()
		}
		// 释放媒体键：RegisterHotKey 是进程级独占，不注销的话
		// 这台机器上的其它播放器会一直收不到这个键。
		if state.mediaKeySvc != nil {
			state.mediaKeySvc.Stop()
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

	// 启动时静默检查一次更新。
	//
	// 放在 ApplicationStarted 里（而不是 main 开头）有两个原因：
	//   · 它要发事件给前端，而前端得先装配完才挂得上监听；
	//   · 启动阶段最抢时间的是「建窗口 + 出首帧」，一次 HTTP 请求
	//     不该跟它抢带宽。
	// CheckSilently 自己会读配置里的开关，失败只记日志、不弹任何东西 ——
	// 用户没要求这次检查，就不该被它的失败打扰。
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		if state.updateSvc == nil {
			return
		}
		go func() {
			// 稍微等一会儿：让窗口先露面、界面先装配完，
			// 这样发现新版本时的那个提示能落在已经画好的界面上。
			time.Sleep(3 * time.Second)
			state.updateSvc.CheckSilently()
		}()
	})

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

// startPlayerTick 起一个低频定时器，让后端在「没有 API 被调用」时也能
// 补推播放位置锚点。
//
// 为什么需要它：播放过程中前端不会调用任何 Player 方法，但它需要持续
// 重新对齐位置（否则前端用 performance.now 外推的进度会与音频时钟漂移）。
// 让前端轮询是更差的选择 —— 那会把「界面空闲时也在跑 JS」变成常态，
// 而这次迁移的全部意义就是让界面少干活。
//
// 200ms 的间隔：服务内部还有 500ms 的锚点节流（anchorIntervalMs），
// 所以这里只是「给节流器一个被触发的机会」，真正的推送频率由服务决定。
// 比 500ms 密是为了让状态变化（播放→暂停）能更快被发现。
func startPlayerTick() {
	go func() {
		ticker := time.NewTicker(200 * time.Millisecond)
		defer ticker.Stop()
		for range ticker.C {
			if state == nil || state.playerSvc == nil {
				return
			}
			state.playerSvc.Tick()
		}
	}()
}

// startMediaKeys 注册键盘播放/暂停键（⏯）的全局热键。
//
// 为什么是全局热键而不是网页的 MediaSession：本项目的播放跑在 Go 进程里，
// 后端接管时页面上根本没有 <audio> 元素，而 MediaSession 只有在有媒体元素
// 播放时才会把媒体键回调下来 —— 那条路在本项目里不成立。详见
// services_mediakey.go 文件顶部的完整说明。
//
// 注册失败（被别的播放器独占、平台不支持）只记日志，不影响程序启动。
func startMediaKeys(st *appState) {
	if st == nil {
		return
	}
	svc := NewMediaKeyService(func() {
		// 退化路径：前端还没挂上监听时，至少让按键直接作用于引擎。
		// 正常情况走不到这里 —— 前端在线时是按「发事件让它 toggle」处理的。
		if st.playerSvc == nil {
			return
		}
		if st.playerSvc.Playing() {
			st.playerSvc.Pause()
		} else {
			st.playerSvc.Play()
		}
	})
	svc.setEmitter(emit)
	st.mediaKeySvc = svc
	svc.Start()
}
