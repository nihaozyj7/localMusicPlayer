package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

/* ==========================================================================
   桌面背景歌词（铺满桌面、压在桌面图标之下的壁纸层）
   --------------------------------------------------------------------------
   需求原文：「把当前正在播放的样式投影到桌面中去，相当于把当前的播放详情页
   投影到桌面上去，只不过去除掉 UI，只保留播放界面样式所渲染的内容」。
   它与「桌面歌词」（飘在桌面上的那一条，见 desktop_lyrics.go）二选一，
   在界面上是同一组单选按钮的两个选项。

   实现要点：
     1. 打开一个全屏无边框窗口，页面是 /wallpaper.html。它加载**同一套皮肤**
        （frontend/packages/player-skins），挂载**当前正在用的那一个样式**，
        但只有一个 .playerview__stage：没有标题栏、没有返回/封面/样式按钮组、
        没有底栏；歌词行也不做成可点可聚焦的按钮（宿主通过 options.interactive
        告知皮肤，见包里的 contract.js）。于是剩下的正是「样式渲染出来的内容」。
     2. 用 SetParent 把这个窗口挂到桌面的「壁纸层」（WorkerW）里，并压到最底，
        于是它就在桌面图标之下 —— 这正是「桌面背景」的定义。
        Windows 专属部分见 desktop_wallpaper_windows.go。
     3. 数据由主窗口按**皮肤契约的 patch** 推过来（换歌 / 封面 / 歌词 / 进度 /
        设置 / 主题），通道与桌面歌词一致：WindowService 保存 + app.Event.Emit 广播。

   为什么后端在这里是个「哑管道」：
      窗口里跑的是和详情页一模一样的皮肤，皮肤需要的是「曲目 / 封面集合 /
      已解析的歌词行 / 播放进度 / 显示设置 / 主题令牌」这一整套。在 Go 这边把这套
      结构再声明一遍，等于把皮肤契约抄成第二份 —— 皮肤一改这里就悄悄过期，而且过期
      的表现是「桌面上少画了一块」，很难联想到是后端字段没跟上。所以后端只做三件
      事：记住最后一次全量、按顶层 key 合并增量、原样转发。

   资源开销（需求里专门问过「会不会渲染两份」）：
      确实是两份 DOM，但桌面那一份是**事件驱动**的：页面里没有 requestAnimationFrame、
      没有定时器，只在收到推送时才写 DOM；推送端按内容签名去重、进度推送限流到 1Hz，
      内容不变时一次 IPC 都不发。加上两个桌面模式互斥，任意时刻至多一个额外窗口。
      详见 frontend/src/js/desktop-wallpaper.js 的说明。
   ========================================================================== */

const (
	// desktopWallpaperWindow 窗口名（运行时按名字查找/复用）
	desktopWallpaperWindow = "desktop-wallpaper"
	// desktopWallpaperEvent 主窗口 -> 背景歌词窗口的状态事件名
	desktopWallpaperEvent = "desktop:wallpaper"
	// desktopWallpaperURL 背景歌词窗口的页面
	desktopWallpaperURL = "/wallpaper.html"

	// desktopWallpaperPatchType 增量里「这条是什么更新」的键名。
	// 值取自皮肤契约的 PATCH_TYPES（song / media / lyrics / progress / state /
	// options / theme / resize…）。后端只转发，不解释。
	desktopWallpaperPatchType = "type"
	// desktopWallpaperFullPatch 把「全量快照」包装成哪种增量。
	//
	// 选 song，是因为契约里 song 的语义就是「换歌：皮肤用 ctx 里的数据整体重画
	// 一遍」，恰好等于「窗口刚打开，把现在的样子铺上去」。
	desktopWallpaperFullPatch = "song"
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

	// 窗口刚创建时还没有任何事件，不推的话它会停在空态
	s.pushDesktopWallpaper(s.DesktopWallpaperState())
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
   --------------------------------------------------------------------------
   这一段刻意保持「薄」：payload 的形状由前端按皮肤契约决定，后端只负责
   保存最后一次全量 + 转发增量。理由见文件头「为什么后端在这里是个哑管道」。
   -------------------------------------------------------------------------- */

// UpdateDesktopWallpaper 主窗口在「换歌 / 封面 / 歌词 / 进度 / 设置 / 主题」变化时调用。
//
// payload = 皮肤契约里的一次 patch：`type` 说明这条是什么更新，其余键是本次
// 变化的字段。后端只按顶层 key 合并（**不做深合并**：像 options、lyrics 这些
// 字段本来就是整体替换的语义，深合并反而会把旧数据留在新状态上）。
//
// 返回值刻意只有一个 ok：这个方法每秒会被调用一次（进度兜底），
// 把合并后的全量当成返回值回给前端，等于每秒把封面 data URL、整套主题令牌、
// 上百行歌词重新序列化一遍送回调用方 —— 而调用方根本不看。要全量请走
// DesktopWallpaperState（只在窗口加载完成时调一次）。
func (s *WindowService) UpdateDesktopWallpaper(payload map[string]any) map[string]any {
	if len(payload) == 0 {
		return map[string]any{"ok": true}
	}

	s.wallpaperMu.Lock()
	if s.wallpaper == nil {
		s.wallpaper = make(map[string]any, len(payload))
	}
	for key, value := range payload {
		if key == desktopWallpaperPatchType {
			// type 属于「这条增量」，不是状态本身，不能并进快照 ——
			// 并进去的话下一次读全量会带着上一条的 type，语义就乱了
			continue
		}
		s.wallpaper[key] = value
	}
	s.wallpaperMu.Unlock()

	s.pushDesktopWallpaper(payload)
	return map[string]any{"ok": true}
}

// DesktopWallpaperState 读当前状态（一次**全量**快照）。
//
// 背景歌词窗口加载完成后用它做初始同步：事件是「之后」才来的，
// 不主动拉一次的话，新窗口会一直空着直到下一次换行。
func (s *WindowService) DesktopWallpaperState() map[string]any {
	s.wallpaperMu.Lock()
	defer s.wallpaperMu.Unlock()
	return s.wallpaperSnapshotLocked()
}

// MarkDesktopWallpaperReady 由背景歌词窗口在加载完成后调用。
//
// 页面加载完成与窗口创建之间有时序差：创建时推的那一次事件，页面可能还没注册
// 好监听。所以这里既补推一次全量、也把全量直接**返回**给调用方 —— 两条路任意
// 一条通了，窗口就不会停在空态。
func (s *WindowService) MarkDesktopWallpaperReady() map[string]any {
	state := s.DesktopWallpaperState()
	if s.desktopWallpaperWindowRef() != nil {
		s.pushDesktopWallpaper(state)
	}
	return state
}

// DesktopWallpaperTouched 报告「背景歌词开关是否已经被用户/前端操作过」。
//
// 与 DesktopLyricsTouched 同一个用途：启动恢复的兜底路径靠它退让。
func (s *WindowService) DesktopWallpaperTouched() bool {
	s.wallpaperMu.Lock()
	defer s.wallpaperMu.Unlock()
	return s.wallpaperTouched
}

// pushDesktopWallpaper 把一份 payload 广播出去。
//
// app.Event.Emit 会广播给所有窗口（包含背景歌词窗口），主窗口也会收到 ——
// 前端按 payload 里的字段自行忽略即可。
func (s *WindowService) pushDesktopWallpaper(payload map[string]any) {
	if s.app == nil || len(payload) == 0 {
		return
	}
	s.app.Event.Emit(desktopWallpaperEvent, payload)
}

// wallpaperSnapshotLocked 组装**全量**快照（调用方必须已持有 wallpaperMu）。
//
// 合并进来的键原样带上，再把「开关 + 平台能力」和 type 覆盖上去。
// type 固定成 song：接收方据此走「用全量重画一遍」那条路（理由见常量注释）。
func (s *WindowService) wallpaperSnapshotLocked() map[string]any {
	// 平台能力只探测一次：它要枚举桌面窗口，没必要每次换行都做
	if !s.wallpaperProbed {
		s.wallpaperProbed = true
		s.wallpaperSupported, s.wallpaperReason = desktopWallpaperSupport()
	}

	out := make(map[string]any, len(s.wallpaper)+4)
	for key, value := range s.wallpaper {
		out[key] = value
	}
	out[desktopWallpaperPatchType] = desktopWallpaperFullPatch
	out["enabled"] = s.wallpaperOn
	out["supported"] = s.wallpaperSupported
	out["reason"] = s.wallpaperReason
	return out
}
