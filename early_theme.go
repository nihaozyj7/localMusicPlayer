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

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/theme"
)

/* ==========================================================================
   启动首帧主题（early theme）
   --------------------------------------------------------------------------
   问题：主题是**前端脚本**在启动时套用的（discoverThemes → applyResolvedTheme），
   而脚本要等 JS bundle 下载、解析、执行。在那之前页面用的是 index.html 根元素
   上写死的 data-theme="flat-dark"，也就是一整块近黑。

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

// earlyThemeState 是「首帧主题」的解析结果：完全不经过前端，只看磁盘上的配置。
//
// /early-theme.js（浏览器里那一帧）与窗口底色（firstFrameWindowColour）都从它
// 出发 —— 两边必须是同一件事，否则「窗口底色」和「页面第一帧」又会错开一档，
// 那就等于换了个颜色的闪。
type earlyThemeState struct {
	Theme string // 已确认存在的主题 id
	Mode  string
	Seed  string // 空串 = 没有取色记录
	Seed2 string
}

// resolveEarlyTheme 按磁盘上的真实配置算出首帧主题。
func resolveEarlyTheme(store *bootstrap.Store, themeMgr *theme.Manager) earlyThemeState {
	var st earlyThemeState
	if store != nil {
		cfg := store.Get()
		st.Theme = strings.TrimSpace(cfg.Theme)
		st.Mode = strings.TrimSpace(cfg.ThemeMode)
		st.Seed = validHexColor(cfg.CoverSeed)
		st.Seed2 = validHexColor(cfg.CoverSeed2)
	}

	// 配置里的主题可能已经被用户删掉了（主题文件不在磁盘上）。这时别硬套，
	// 退回到 index.html 的默认主题，剩下的交给前端 discoverThemes 去纠正。
	if st.Theme == "" || !themeExists(themeMgr, st.Theme) {
		st.Theme = "flat-dark"
	}
	if st.Mode == "" {
		st.Mode = "dark"
	}
	if st.Seed2 == "" {
		st.Seed2 = st.Seed
	}
	return st
}

// earlyThemeScript 生成 /early-theme.js 的内容。
func earlyThemeScript(store *bootstrap.Store, themeMgr *theme.Manager) []byte {
	st := resolveEarlyTheme(store, themeMgr)
	themeID, mode, seed, seed2 := st.Theme, st.Mode, st.Seed, st.Seed2

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
	//
	// 注意：行内自定义属性**压得过样式表里的同名令牌**，所以这些值只在「首帧」
	// 有意义。前端套主题时会「先把它们降级成运行时令牌、再撤掉行内副本」
	// （见 theme.js#demoteEarlyThemeInlineProps）：
	//   · 不撤 —— 窗口底色会被永久锁在启动时那个颜色上，换主题看起来就像没生效；
	//   · 直接撤 —— 封面还没解码完的那段空窗期会退回主题写死的占位灰，启动时
	//     又要灰一下（「上次的颜色 → 灰 → 真正取色」）。
	// 降级之后观感与首帧完全一致，同时把控制权交还给主题样式表 / 运行时令牌表。
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

// reBgApp 从主题 CSS 里读 --bg-app（首帧底色）。
var reBgApp = regexp.MustCompile(`--bg-app\s*:\s*([^;\r\n}]+)`)

// firstFrameHex 算「页面第一帧的底色」，与 earlyThemeScript 写给 --bg-app 的值
// 完全一致。
//
// 封面取色主题用同一个种子色混出近似底色（真正的颜色要等封面解码完，第一帧
// 只能是这个近似值，见文件头说明）；其它主题直接读它自己声明的 --bg-app ——
// 内置主题也被 syncBuiltin 写到了用户目录里，所以自定义主题与内置主题走的是
// 同一条路。
func firstFrameHex(st earlyThemeState, themeMgr *theme.Manager) string {
	if st.Theme == "cover-dark" && st.Seed != "" {
		return mixHex(st.Seed, "#07070a", 0.18)
	}
	if themeMgr == nil {
		return ""
	}
	css, err := themeMgr.CSS(st.Theme)
	if err != nil {
		return ""
	}
	// 注释里也可能出现 --bg-app，所以逐个匹配、取第一个**合法纯色**的值。
	for _, m := range reBgApp.FindAllStringSubmatch(css, -1) {
		if hex := validHexColor(strings.TrimSpace(m[1])); hex != "" {
			return hex
		}
	}
	return ""
}

// firstFrameWindowColour 给出窗口创建时的底色（application.WebviewWindowOptions
// 的 BackgroundColour）。
//
// 为什么需要一个「按主题算」的底色：窗口在 WebView2 吐出第一帧之前，露出来的
// 就是它。写死近黑时，浅色主题启动那一下就是黑闪。虽然正常路径下窗口是遮着
// 显示、等第一帧画好才露面的（见 services.go#showPrepared），但这个值仍然是
// 兜底：万一遮罩用不了（老系统 / 远程桌面），第一帧至少是同一个颜色。
func firstFrameWindowColour(store *bootstrap.Store, themeMgr *theme.Manager) application.RGBA {
	// 算不出来时保持和 index.html 写着的一致的近黑，与改动前完全一样。
	fallback := application.NewRGB(8, 8, 10)
	r, g, b, ok := parseHex(firstFrameHex(resolveEarlyTheme(store, themeMgr), themeMgr))
	if !ok {
		return fallback
	}
	return application.NewRGB(uint8(r), uint8(g), uint8(b))
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

// themeExists 判断主题是否真的存在（内置主题由后端写进主题目录，一并算上）。
func themeExists(mgr *theme.Manager, id string) bool {
	// 内置名单只认 theme 包那一份：mgr 为 nil（极端兜底路径）时也得认得出内置主题。
	if theme.IsBuiltinID(id) {
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

   ★★ 启动恢复的**时机**要分两种模式，不能共用一套：
   桌面歌词窗口很轻（一行文字、透明小窗），ApplicationStarted 之后立刻建
   是合适的；而桌面背景歌词要挂一整套播放界面样式、渲染整屏画面，属于
   重活。它如果和主窗口一起在启动阶段跑，就会和主窗口抢 CPU / GPU ——
   两边都在解析 JS、解码封面、跑首帧合成，结果主窗口明显变卡、启动也变慢。
   所以背景歌词改成**等主窗口的界面装配完毕之后再恢复**
   （见 waitMainWindowBooted），那时启动高峰已经过去，桌面上的画面晚一两秒
   出现，而用户正在看主窗口，基本无感。
   -------------------------------------------------------------------------- */

// desktopRestoreBootTimeout 是「等主窗口启动完成」的上限。
//
// 30 秒是刻意给得很宽的：正常路径根本用不到（前端几百毫秒到一两秒就报
// booted），它只覆盖「前端信号因为脚本报错 / 非标准资源加载而永远不来」。
// 超时也照常恢复 —— 宁可桌面上晚一点出现，也不能因为一个信号丢失就让这个
// 功能永远不出现。
const desktopRestoreBootTimeout = 30 * time.Second

// restoreDesktopModeOnStartup 注册一次性的启动恢复（配置里开着才注册）。
func restoreDesktopModeOnStartup(app *application.App, store *bootstrap.Store, svc *WindowService) {
	if app == nil || store == nil || svc == nil {
		return
	}
	cfg := store.Get()
	// 「启动该恢复哪个模式」由配置层回答：背景歌词只有在「本次开着 + 允许自动
	// 启动」时才恢复（见 bootstrap.Config.StartupDesktopMode）。
	mode := cfg.StartupDesktopMode()
	if mode == desktopModeOff {
		return
	}

	// 背景歌词是重活：先让主窗口启动完再恢复（见文件头说明）。
	deferWallpaper := mode == desktopModeWallpaper

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
			if desktopModeTouched(svc) {
				return
			}
			log.Printf("[desktop-%s] 未收到启动事件，按超时兜底恢复", mode)
		}

		// ★ 背景歌词再等一步：主窗口启动完（界面装配完毕）之后才动手。
		//
		// 这里等的是 WindowService.booted，不是 shown：shown 只说明窗口可见，
		// 而前端模块**一跑起来**就发了那个信号，真正的启动高峰（解析 bundle、
		// 解码封面、套主题、建皮肤）全在它之后。背景歌词要挂一整套皮肤、渲染
		// 整屏画面，撞在高峰里就会和主窗口抢 CPU / GPU —— 表现正是「主窗口卡顿、
		// 启动变慢」。
		//
		// 等待期间每隔一小段查一次「用户是否已经自己操作过」：用户等不及手动
		// 打开背景歌词，或者已经把配置改掉，我们就立刻退让，不再多做一次。
		if deferWallpaper && !waitMainWindowBooted(svc, store, mode) {
			return
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

// desktopModeTouched 报告用户是否已经自己操作过（任一）桌面模式开关。
//
// 两个开关是一组单选，所以「碰过任意一个」都该让启动恢复退让：用户已经
// 表达过自己的选择，恢复逻辑再自作主张就会把他刚关掉的又弄出来。
// 刻意不看 mode：无论这次要恢复哪个，只要用户碰过这一组里的任意一个，
// 本次启动恢复就都不该再动手。
func desktopModeTouched(svc *WindowService) bool {
	return svc.DesktopLyricsTouched() || svc.DesktopWallpaperTouched()
}

// waitMainWindowBooted 等主窗口的界面装配完毕，返回 false 表示这次恢复应当放弃。
//
// 判据是 WindowService.booted（前端在 bootstrap 跑完后走 /boot/booted 置位，
// 见 services.go#MarkBooted）。它是启动高峰的**结束点**：
//
//	模块执行 ──/boot/reveal──► 窗口可见 ──bootstrap/主题/封面……──► /boot/booted
//	                            ↑ shown                              ↑ booted
//	                            └──── 这一段就是会被抢性能的高峰 ────┘
//
// 为什么不干脆用固定延时：启动耗时在不同机器上差好几倍（杀毒软件扫描、
// 冷启动读盘、曲库大小都会影响）。固定延时要么短了（还在高峰里，性能问题
// 照旧），要么长了（用户白等）。等这个信号则是「主窗口一准备好就立刻动手」，
// 既不抢性能也不拖拉。
//
// 放弃的三种情形（都必须在「还没动手建窗口」的时候判掉）：
//   - 用户已经自己操作过桌面模式开关 —— 他的选择优先；
//   - 配置已经不再要求这个模式（用户关了自动启动、或切到了别的模式）；
//   - 等超时了 —— 这时启动高峰无论如何都过去了，照常恢复。
//
// 用轮询而不是注册回调：booted 可能在前端信号到达前就已经置位（刷新页面、
// 第二个实例），也可能是兜底路径下永远不来，轮询天然覆盖这两种情况，
// 而且不会漏掉「等待期间用户改配置」这个并发条件。
func waitMainWindowBooted(svc *WindowService, store *bootstrap.Store, mode string) bool {
	deadline := time.Now().Add(desktopRestoreBootTimeout)
	for {
		if svc.MainWindowBooted() {
			return true
		}
		if desktopModeTouched(svc) || !stillWanted(store, mode) {
			return false
		}
		if time.Now().After(deadline) {
			// 前端信号没来（脚本报错 / 非标准资源加载）：不能再等了。
			// 这时主窗口早该显示了，启动高峰无论如何都过去了。
			log.Printf("[desktop-%s] 等待主窗口启动完成超时，仍按恢复流程继续", mode)
			return true
		}
		time.Sleep(desktopRestorePollInterval)
	}
}

// desktopRestorePollInterval 是「等主窗口启动完成」的轮询间隔。
//
// 主窗口从启动到装配完成的量级是几百毫秒到一两秒，100ms 一档足够跟得上；
// 再密只是空转（每次轮询只是读一个 atomic）。
const desktopRestorePollInterval = 100 * time.Millisecond

// stillWanted 报告启动过程中配置是否仍然要求这个模式（用户可能已经改过）
//
// 直接比 StartupDesktopMode 的结果：它已经把「本次是否开着」「是否允许自动
// 启动」两条规则都算进去了，这里再逐字段判断等于把同一套规则写第二遍。
func stillWanted(store *bootstrap.Store, mode string) bool {
	return store.Get().StartupDesktopMode() == mode
}
