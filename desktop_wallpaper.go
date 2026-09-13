package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

/* ==========================================================================
   桌面背景歌词（铺满桌面、压在桌面图标之下的壁纸层）
   --------------------------------------------------------------------------
   需求：歌词不只可以飘在桌面上（那种是「桌面歌词」，见 desktop_lyrics.go），
   还可以**当成桌面背景**——把播放界面的那张背景铺满屏幕、垫在桌面图标下面，
   歌词跟着画在上面。两者是二选一的一组单选按钮。

   实现要点：
     1. 打开一个全屏无边框窗口，页面是**专门写的轻量页**（/wallpaper.html），
        它只画「背景 + 歌词」，不加载外壳、曲库、列表这些主界面才要的东西。
     2. 用 SetParent 把这个窗口挂到桌面的「壁纸层」（WorkerW）里，并压到最底，
        于是它就在桌面图标之下 —— 这正是「桌面背景」的定义。
        Windows 专属部分见 desktop_wallpaper_windows.go。
     3. 数据仍然由主窗口推过来（窗口标题 / 封面缩略图 / 当前歌词行），
        通道与桌面歌词一致：WindowService 保存 + app.Event.Emit 广播。

   为什么不做「把整个播放详情页投到桌面上」：
     那等于同时跑两个完整的播放界面（两套 DOM、两套图片解码、两套动效），
     而桌面那一份用户根本点不到 —— 花的全是纯浪费。这里改成只渲染
     「背景层 + 歌词」这一小块，并且：
       · 封面由主窗口降采样成 64px 的小图再推过来（解码与模糊都便宜一个数量级）；
       · 页面里没有任何 requestAnimationFrame 轮询，只在收到推送时才重画；
       · 两个桌面模式互斥，永远不会同时存在两个额外窗口。
     详见 frontend/src/js/desktop-wallpaper.js 的说明。
   ========================================================================== */

const (
	// desktopWallpaperWindow 窗口名（运行时按名字查找/复用）
	desktopWallpaperWindow = "desktop-wallpaper"
	// desktopWallpaperEvent 主窗口 -> 背景歌词窗口的状态事件名
	desktopWallpaperEvent = "desktop:wallpaper"
	// desktopWallpaperURL 背景歌词窗口的页面
	desktopWallpaperURL = "/wallpaper.html"

	// desktopWallpaperDefaultFontSize 歌词默认字号（推送里没带时用）
	desktopWallpaperDefaultFontSize = 44
	// 字号的合法区间，挡住前端算错时把歌词画成一行或者糊满全屏
	desktopWallpaperMinFontSize = 16
	desktopWallpaperMaxFontSize = 160
)

// 桌面歌词与桌面背景歌词这两种模式的取值。
//
// 单独定义成常量而不是用两个 bool：需求要求它们是**一组单选**，
// 用「一个模式变量」表达比「两个各管各的开关」更难写错。
const (
	desktopModeOff       = "off"
	desktopModeLyrics    = "lyrics"
	desktopModeWallpaper = "wallpaper"
)

// desktopWallpaperContent 背景歌词窗口要画的内容。
//
// 刻意做成「一个扁平快照」而不是让窗口自己去查曲库：那个窗口里没有 store、
// 没有曲库也没有歌词缓存，它只是一个画布。
type desktopWallpaperContent struct {
	// —— 歌词 ——
	Text     string `json:"text"` // 当前行
	Prev     string `json:"prev"` // 上一行（淡显，给一点上下文）
	Next     string `json:"next"` // 下一行（淡显）
	Playing  bool   `json:"playing"`
	FontSize int    `json:"fontSize"`
	// —— 曲目 ——
	Title  string `json:"title"`
	Artist string `json:"artist"`
	// Cover 是**小尺寸**封面（主窗口用 canvas 降采样后的 data URL）。
	// 桌面背景本来就是大范围模糊的，用原图既慢又看不出差别。
	Cover string `json:"cover"`
	// —— 背景观感（与主题/皮肤一致，避免桌面与主界面两个颜色）——
	Veil       string  `json:"veil"`
	Blur       float64 `json:"blur"`
	Scale      float64 `json:"scale"`
	Brightness float64 `json:"brightness"`
}

// desktopWallpaperSnapshot 推给背景歌词窗口的完整状态（内容 + 开关 + 平台能力）。
type desktopWallpaperSnapshot struct {
	Enabled bool `json:"enabled"`
	desktopWallpaperContent
	// Supported 当前系统是否支持「窗口垫到桌面图标之下」。
	// 不支持的平台（非 Windows、或找不到桌面窗口）上前端会把这个按钮禁掉。
	Supported bool   `json:"supported"`
	Reason    string `json:"reason"`
}

/* --------------------------------------------------------------------------
   单选：桌面歌词 / 桌面背景歌词
   -------------------------------------------------------------------------- */

// setDesktopMode 是这两个互斥模式的**唯一入口**。
//
// 为什么把关口收在一个函数里：两个模式各自都要占一个真实窗口，而需求明确
// 要求二选一。只要所有调用方（底栏按钮、设置开关、启动恢复）都走这里，
// 就不可能把两个窗口同时打开 —— 那既费双份资源，画面上也是两条歌词叠着。
//
// 注意：调用它时**不能**持有 desktopMu / wallpaperMu —— 关窗口内部走
// InvokeSync，在锁里调用会与主线程互相等待。
func (s *WindowService) setDesktopMode(mode string) map[string]any {
	switch mode {
	case desktopModeLyrics:
		s.closeDesktopWallpaperWindow()
		return s.openDesktopLyricsWindow()
	case desktopModeWallpaper:
		s.closeDesktopLyricsWindow()
		return s.openDesktopWallpaperWindow()
	default:
		s.closeDesktopLyricsWindow()
		s.closeDesktopWallpaperWindow()
		return map[string]any{"ok": true, "enabled": false, "mode": desktopModeOff}
	}
}

/* --------------------------------------------------------------------------
   窗口生命周期
   -------------------------------------------------------------------------- */

// desktopWallpaperWindowRef 返回已存在的背景歌词窗口（没有则 nil）。
//
// 与桌面歌词同理：Close() 之后窗口会从注册表里移除，且不能再 Show() 复活，
// 要重新显示必须用 NewWithOptions 重新创建 —— 见 ensureDesktopWallpaper。
func (s *WindowService) desktopWallpaperWindowRef() *application.WebviewWindow {
	if s.app == nil {
		return nil
	}
	w, ok := s.app.Window.GetByName(desktopWallpaperWindow)
	if !ok {
		return nil
	}
	if ww, ok := w.(*application.WebviewWindow); ok {
		return ww
	}
	return nil
}

// SetDesktopWallpaper 打开/关闭桌面背景歌词窗口。
//
// 由底栏「桌面背景歌词」按钮与设置里的同名开关调用。
// 与桌面歌词二选一：打开它会把窗口歌词先关掉（见 setDesktopMode）。
func (s *WindowService) SetDesktopWallpaper(on bool) map[string]any {
	if !on {
		s.closeDesktopWallpaperWindow()
		return map[string]any{"ok": true, "enabled": false}
	}
	return s.setDesktopMode(desktopModeWallpaper)
}

// closeDesktopWallpaperWindow 关掉（并记为「已被操作过」）背景歌词窗口。
//
// 幂等：窗口本来就不在也只是把状态清干净。
func (s *WindowService) closeDesktopWallpaperWindow() {
	s.wallpaperMu.Lock()
	s.wallpaperOn = false
	// 记下「已经有人操作过」：启动恢复的兜底路径据此退让（见 early_theme.go）
	s.wallpaperTouched = true
	s.wallpaperMu.Unlock()

	if w := s.desktopWallpaperWindowRef(); w != nil {
		w.Close()
	}
}

// openDesktopWallpaperWindow 打开背景歌词窗口并立刻推一次当前状态。
func (s *WindowService) openDesktopWallpaperWindow() map[string]any {
	if supported, reason := desktopWallpaperSupport(); !supported {
		return map[string]any{"ok": false, "enabled": false, "reason": reason}
	}

	s.wallpaperMu.Lock()
	s.wallpaperOn = true
	s.wallpaperTouched = true
	s.wallpaperMu.Unlock()

	win, reason := s.ensureDesktopWallpaper()
	if win == nil {
		s.wallpaperMu.Lock()
		s.wallpaperOn = false
		s.wallpaperMu.Unlock()
		return map[string]any{"ok": false, "enabled": false, "reason": reason}
	}

	// 窗口刚创建时还没有任何事件，不推的话它会停在「等待播放」的空态
	s.pushDesktopWallpaper()
	return map[string]any{"ok": true, "enabled": true}
}

// ensureDesktopWallpaper 确保背景歌词窗口存在并显示
// （不存在就按「无边框 + 垫到桌面图标之下」新建）。
//
// 失败时返回人话原因：这个功能依赖未公开的桌面窗口结构，
// 失败是**正常结果之一**（比如换了 shell、系统版本不兼容），必须能说清是哪一步。
func (s *WindowService) ensureDesktopWallpaper() (*application.WebviewWindow, string) {
	if w := s.desktopWallpaperWindowRef(); w != nil {
		w.Show()
		return w, ""
	}
	if s.app == nil {
		return nil, "应用还没准备好"
	}

	w := s.app.Window.NewWithOptions(s.desktopWallpaperOptions())
	hwnd := w.NativeWindow()
	if hwnd == nil {
		w.Close()
		return nil, "拿不到窗口句柄"
	}
	// 关键一步：把窗口挂到桌面图标那一层之下。
	// Window 是 Hidden 创建的，所以这一步失败时屏幕上不会留下任何东西。
	if err := attachDesktopWallpaperWindow(hwnd); err != nil {
		w.Close()
		return nil, err.Error()
	}
	w.Show()
	return w, ""
}

// desktopWallpaperOptions 组装背景歌词窗口参数。
func (s *WindowService) desktopWallpaperOptions() application.WebviewWindowOptions {
	return application.WebviewWindowOptions{
		Name:   desktopWallpaperWindow,
		Title:  "桌面背景歌词",
		Width:  1280,
		Height: 720,
		// 默认是 WindowCentered（会忽略 X/Y），显式写 WindowXY 更省事
		InitialPosition: application.WindowXY,
		Frameless:       true,
		// 用 Solid 而不是 Transparent：这个窗口整块都是不透明画面
		// （它自己就是那张壁纸），逐像素透明在这里没有意义；
		// 而且透明走的是 WS_EX_NOREDIRECTIONBITMAP，与 WS_CHILD 的壁纸层不合。
		BackgroundType:   application.BackgroundTypeSolid,
		BackgroundColour: application.NewRGB(8, 8, 10),
		// 绝对不能置顶：它要待在桌面图标下面
		AlwaysOnTop: false,
		// 先隐藏创建，挂进壁纸层之后再显示 —— 否则会先在屏幕中间闪一下
		Hidden:        true,
		DisableResize: true,
		// 关掉 WebView2 右键菜单
		DefaultContextMenuDisabled: true,
		URL:                        desktopWallpaperURL,
		Windows: application.WindowsWindow{
			// 不进任务栏、不进 Alt+Tab
			HiddenOnTaskbar: true,
			// 关掉 Aero 阴影与 Win11 圆角
			DisableFramelessWindowDecorations: true,
			DisableIcon:                       true,
			DisableMenu:                       true,
		},
	}
}

/* --------------------------------------------------------------------------
   状态同步（主窗口 -> 背景歌词窗口）
   -------------------------------------------------------------------------- */

// UpdateDesktopWallpaper 主窗口在「换歌 / 歌词行变化 / 播放状态变化」时调用。
//
// 前端做了节流（只在内容真的变化时调用），所以这里不再去重。
func (s *WindowService) UpdateDesktopWallpaper(payload map[string]any) desktopWallpaperSnapshot {
	s.wallpaperMu.Lock()
	applyWallpaperStrings(&s.wallpaper, payload)
	if v, ok := payload["playing"].(bool); ok {
		s.wallpaper.Playing = v
	}
	if v, ok := payload["fontSize"].(float64); ok && v > 0 {
		s.wallpaper.FontSize = int(v)
	}
	for _, key := range []string{"blur", "scale", "brightness"} {
		if v, ok := payload[key].(float64); ok {
			switch key {
			case "blur":
				s.wallpaper.Blur = v
			case "scale":
				s.wallpaper.Scale = v
			case "brightness":
				s.wallpaper.Brightness = v
			}
		}
	}
	s.wallpaperMu.Unlock()

	s.pushDesktopWallpaper()
	return s.DesktopWallpaperState()
}

// DesktopWallpaperState 读当前状态。
//
// 背景歌词窗口加载完成后用它做一次初始同步：事件是「之后」才来的，
// 不主动拉一次的话，新窗口会一直空着直到下一次换行。
func (s *WindowService) DesktopWallpaperState() desktopWallpaperSnapshot {
	s.wallpaperMu.Lock()
	defer s.wallpaperMu.Unlock()
	return s.wallpaperSnapshotLocked()
}

// MarkDesktopWallpaperReady 由背景歌词窗口在加载完成后调用，立刻把状态推给自己。
//
// 页面加载完成与窗口创建之间有时序差：创建时推的那一次事件页面可能还没
// 注册好监听，所以页面这边必须主动要一次。
func (s *WindowService) MarkDesktopWallpaperReady() desktopWallpaperSnapshot {
	if s.desktopWallpaperWindowRef() != nil {
		s.pushDesktopWallpaper()
	}
	return s.DesktopWallpaperState()
}

// DesktopWallpaperTouched 报告「背景歌词开关是否已经被用户/前端操作过」。
//
// 与 DesktopLyricsTouched 同一个用途：启动恢复的兜底路径靠它退让。
func (s *WindowService) DesktopWallpaperTouched() bool {
	s.wallpaperMu.Lock()
	defer s.wallpaperMu.Unlock()
	return s.wallpaperTouched
}

func (s *WindowService) pushDesktopWallpaper() {
	if s.app == nil {
		return
	}
	// app.Event.Emit 会广播给所有窗口（包含新建的背景歌词窗口），
	// 主窗口也会收到 —— 前端按 payload 里的字段自行忽略即可。
	s.app.Event.Emit(desktopWallpaperEvent, s.DesktopWallpaperState())
}

// wallpaperSnapshotLocked 组装快照（调用方必须已持有 wallpaperMu）。
func (s *WindowService) wallpaperSnapshotLocked() desktopWallpaperSnapshot {
	content := s.wallpaper
	if content.FontSize <= 0 {
		content.FontSize = desktopWallpaperDefaultFontSize
	}
	if content.FontSize < desktopWallpaperMinFontSize {
		content.FontSize = desktopWallpaperMinFontSize
	}
	if content.FontSize > desktopWallpaperMaxFontSize {
		content.FontSize = desktopWallpaperMaxFontSize
	}
	// 平台能力只探测一次：它要枚举桌面窗口，没必要每次换行都做
	if !s.wallpaperProbed {
		s.wallpaperProbed = true
		s.wallpaperSupported, s.wallpaperReason = desktopWallpaperSupport()
	}
	return desktopWallpaperSnapshot{
		Enabled:                 s.wallpaperOn,
		desktopWallpaperContent: content,
		Supported:               s.wallpaperSupported,
		Reason:                  s.wallpaperReason,
	}
}

// applyWallpaperStrings 把推送里的字符串字段搬进内容快照。
//
// 单独抽出来只是为了 UpdateDesktopWallpaper 读起来不像一堵墙；
// 允许缺字段（推啥更新啥），因为主窗口有时候只推歌词、有时候只推封面。
func applyWallpaperStrings(dst *desktopWallpaperContent, payload map[string]any) {
	for key, target := range map[string]*string{
		"text":   &dst.Text,
		"prev":   &dst.Prev,
		"next":   &dst.Next,
		"title":  &dst.Title,
		"artist": &dst.Artist,
		"cover":  &dst.Cover,
		"veil":   &dst.Veil,
	} {
		if v, ok := payload[key].(string); ok {
			*target = v
		}
	}
}
