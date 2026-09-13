package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/theme"
)

/* ==========================================================================
   启动首帧主题（early theme）
   --------------------------------------------------------------------------
   问题：主题是**前端脚本**在启动时套用的（discoverThemes → applyResolvedTheme），
   而脚本要等 JS bundle 下载、解析、执行。在那之前页面用的是 index.html 根元素
   上写死的 data-theme="dark-minimal"，也就是一整块近黑。

   于是启动时会看到两次「先错后对」：
     1. 浅色主题：先黑一下，脚本跑完才变白；
     2. 封面取色主题：先黑，再套主题里写死的占位灰，等封面解码、取色完再整体
        重绘成真正的颜色 —— 三段式，第一帧很难看。

   做法：在 <head> 最前面放一个**同步的**外链脚本 /early-theme.js（用外链是为了
   不动 index.html 的 CSP：script-src 'self' 本来就允许同源脚本，不需要放开
   'unsafe-inline'）。它由这里在**请求时**生成，内容来自磁盘上的真实配置：

     · data-theme / data-mode —— 直接用上次保存的主题，前端脚本不必先跑一遍；
     · --seed / --seed-2    —— 用上次取色的结果。取色结果的权威来源是前端的
       封面解码（Go 不重复实现一遍），前端每次取完都会随配置写回，这里只负责读。

   脚本还会把 --bg-app / --bg-window 换成由同一个种子色算出的近似底色：即使
   主题 CSS 比主样式表晚一步生效，中间那一帧也是同色系的近似色，而不是黑屏。
   ========================================================================== */

// earlyThemePath /early-theme.js 的路由（在 main.go 的 Middleware 里拦截）
const earlyThemePath = "/early-theme.js"

// hexColorRe 校验种子色：只接受 3/6 位十六进制，避免把任意字符串拼进 CSS
var hexColorRe = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)

// earlyThemeScript 生成 /early-theme.js 的内容。
func earlyThemeScript(store *bootstrap.Store, themeMgr *theme.Manager) []byte {
	cfg := store.Get()

	themeID := strings.TrimSpace(cfg.Theme)
	mode := strings.TrimSpace(cfg.ThemeMode)
	seed := validHexColor(cfg.CoverSeed)
	seed2 := validHexColor(cfg.CoverSeed2)

	// 配置里的主题可能已经被用户删掉了（主题文件不在磁盘上）。这时别硬套，
	// 退回到 index.html 的默认主题，剩下的交给前端 discoverThemes 去纠正。
	if themeID == "" || !themeExists(themeMgr, themeID) {
		themeID = "dark-minimal"
	}
	if mode == "" {
		mode = "dark"
	}
	if seed2 == "" {
		seed2 = seed
	}

	themeJSON, err := json.Marshal(themeID)
	if err != nil {
		return nil
	}
	modeJSON, err := json.Marshal(mode)
	if err != nil {
		return nil
	}

	var b strings.Builder
	b.WriteString("(function(){try{var d=document.documentElement;")
	fmt.Fprintf(&b, "d.setAttribute('data-theme',%s);", themeJSON)
	fmt.Fprintf(&b, "d.setAttribute('data-mode',%s);", modeJSON)
	fmt.Fprintf(&b, "d.style.colorScheme=%s;", modeJSON)

	// 种子色只有消费它的主题（内置的 cover-dark，以及将来同样声明 --seed 的
	// 自定义主题）才需要。写进别的主题没有任何效果，但会一直留在 <html> 上，
	// 容易误以为「主题自带色被覆盖了」—— 所以这里只在 cover-dark 下写。
	if seed != "" && themeID == "cover-dark" {
		fmt.Fprintf(&b, "d.style.setProperty('--seed',%q);", seed)
		fmt.Fprintf(&b, "d.style.setProperty('--seed-2',%q);", seed2)
		// 由种子色压暗出来的近似底色：真正的主题令牌随后会覆盖它，
		// 这里只是为了让「主题 CSS 还没生效」的那一帧不是黑屏。
		mix := mixHex(seed, "#07070a", 0.18)
		fmt.Fprintf(&b, "d.style.setProperty('--bg-app',%q);", mix)
		fmt.Fprintf(&b, "d.style.setProperty('--bg-window',%q);", mix)
	}

	// 强制一次重算：给 body 改一个不参与任何样式的属性，让已在 DOM 里的元素
	// 重新解析 var(--…)。与 theme.js 的 forceStyleRefresh 是同一个手法。
	b.WriteString(
		"var b=document.body;" +
			"if(b){b.dataset.styleEpoch=String((Number(b.dataset.styleEpoch)||0)+1);}" +
			"}catch(e){}})();")
	return []byte(b.String())
}

// earlyThemeHandler 返回 /early-theme.js 的处理器。
//
// 每次都重新生成，因此不存在「客户端缓存导致脚本过期」的问题；用户在界面上
// 换完主题后立刻刷新页面读到的也一定是新值。
func earlyThemeHandler(store *bootstrap.Store, themeMgr *theme.Manager) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := earlyThemeScript(store, themeMgr)
		if body == nil {
			http.Error(w, "early theme unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(body)
	})
}

// validHexColor 过滤掉不合法的颜色值（空串表示「没有」）。
func validHexColor(v string) string {
	v = strings.TrimSpace(v)
	if !hexColorRe.MatchString(v) {
		return ""
	}
	return v
}

// themeExists 判断主题是否真的存在（内置三款由后端写进主题目录，一并算上）。
func themeExists(mgr *theme.Manager, id string) bool {
	switch id {
	case "dark-minimal", "light-minimal", "cover-dark":
		return true
	}
	if mgr == nil {
		return false
	}
	for _, t := range mgr.List() {
		if t.ID == id {
			return true
		}
	}
	return false
}

/*
mixHex 把 hex 颜色按 ratio 混向 another（ratio 是 another 的占比，0~1）。

只用于生成「首帧近似底色」，不必还原 color-mix 的精确语义：它与主题实际算出来
的颜色非常接近，肉眼看不出切换。真正的颜色随后由主题 CSS 覆盖。
*/
func mixHex(hex, another string, ratio float64) string {
	r1, g1, b1, ok1 := parseHex(hex)
	r2, g2, b2, ok2 := parseHex(another)
	if !ok1 || !ok2 {
		return hex
	}
	if ratio < 0 {
		ratio = 0
	}
	if ratio > 1 {
		ratio = 1
	}
	mix := func(a, b int) int { return int(float64(a)*(1-ratio) + float64(b)*ratio + 0.5) }
	return fmt.Sprintf("#%02x%02x%02x", mix(r1, r2), mix(g1, g2), mix(b1, b2))
}

func parseHex(v string) (int, int, int, bool) {
	v = strings.TrimPrefix(strings.TrimSpace(v), "#")
	if len(v) == 3 {
		v = string([]byte{v[0], v[0], v[1], v[1], v[2], v[2]})
	}
	if len(v) != 6 {
		return 0, 0, 0, false
	}
	var r, g, bl int
	if _, err := fmt.Sscanf(v, "%02x%02x%02x", &r, &g, &bl); err != nil {
		return 0, 0, 0, false
	}
	return r, g, bl, true
}

/* --------------------------------------------------------------------------
   桌面歌词 / 桌面背景歌词 窗口的启动恢复
   --------------------------------------------------------------------------
   问题：main 里在创建应用之后立刻 SetDesktopLyrics(true)，但那一刻
   globalApplication.impl 还是 nil —— Wails 的 WebviewWindow.Show() 在 impl
   为 nil 时会**直接 return**（见 wails v3 webview_window.go#Show），
   于是这个窗口根本没有被创建。用户看到的就是「重启后桌面歌词不出现，
   手动关一次再开一次才出来」（手动那一次走的是已经 Run 起来的应用）。

   修法：把「恢复上次开着的桌面歌词」推迟到 ApplicationStarted 之后 ——
   那时应用已经 Run，窗口是真的能创建出来的。

   两个模式是单选，所以这里只恢复其中一个（配置里的互斥已在
   bootstrap.normalize 收敛过，这里只是不再两件事各写一遍）。
   -------------------------------------------------------------------------- */

// restoreDesktopModeOnStartup 注册一次性的启动恢复（配置里开着才注册）。
func restoreDesktopModeOnStartup(app *application.App, store *bootstrap.Store, svc *WindowService) {
	if app == nil || store == nil || svc == nil {
		return
	}
	cfg := store.Get()
	mode := desktopModeOff
	switch {
	case cfg.ShowDesktopWallpaper:
		mode = desktopModeWallpaper
	case cfg.ShowDesktopLyrics:
		mode = desktopModeLyrics
	}
	if mode == desktopModeOff {
		return
	}

	started := make(chan struct{})
	var once bool
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		if once {
			return
		}
		once = true
		close(started)
	})

	go func() {
		select {
		case <-started:
			// 正常路径：应用已经开始跑消息循环，窗口能真正创建出来
		case <-time.After(20 * time.Second):
			// 兜底：万一这个平台没派发启动事件，也不能让歌词一直不出现。
			// 20 秒后主窗口早就显示了，此时再试着建一次是安全的 —— 但如果这期间
			// 用户已经自己开关过，就必须退让（不能把他刚关掉的又弄出来）。
			if svc.DesktopLyricsTouched() || svc.DesktopWallpaperTouched() {
				return
			}
			log.Printf("[desktop-%s] 未收到启动事件，按超时兜底恢复", mode)
		}
		// 事件回调跑在 Wails 的事件 goroutine 上，而窗口创建内部走 InvokeSync，
		// 所以这里必须是独立 goroutine，避免和主线程互相等待。
		if !stillWanted(store, mode) {
			return // 启动过程中用户已经把它关掉了
		}
		// 走单选入口：即便配置里两个都开着，也只会有一个窗口被创建出来
		if res := svc.setDesktopMode(mode); res["ok"] != true {
			log.Printf("[desktop-%s] 启动恢复失败: %v", mode, res["reason"])
		}
	}()
}

// stillWanted 报告启动过程中配置是否仍然要求这个模式（用户可能已经改过）
func stillWanted(store *bootstrap.Store, mode string) bool {
	cfg := store.Get()
	if mode == desktopModeWallpaper {
		return cfg.ShowDesktopWallpaper
	}
	return cfg.ShowDesktopLyrics && !cfg.ShowDesktopWallpaper
}
