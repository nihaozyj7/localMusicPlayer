package main

import (
	"log"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"localmusicplayer/internal/bootstrap"
)

/* ==========================================================================
   桌面歌词（独立透明窗口）
   --------------------------------------------------------------------------
   需求：桌面歌词是「歌词显示在桌面上」，所以要开一个**独立的透明置顶窗口**，
   而不是在主窗口里画一条悬浮条（旧实现）。

   Windows 上必须遵守的两条硬约束（来自 Wails v3 源码与官方 issue #6088）：
     1. BackgroundTypeTransparent 只有在 IgnoreMouseEvents == false 时才走
        WS_EX_NOREDIRECTIONBITMAP（DirectComposition 逐像素透明）那条分支；
        一旦开启点击穿透，窗口会变成一块不透明的白板。所以这里**不开启穿透**，
        改为把窗口做得尽量矮、并让它可以被拖动。
     2. BackgroundColour 必须是 alpha=0（application.NewRGBA(0,0,0,0)）。
        application.NewRGB 的 alpha 是 255，会把 WebView2 背景覆盖成不透明。

   窗口内容是一个独立的极简页面（/lyrics.html）：透明背景 + 一行歌词文字，
   数据由主窗口通过事件推过来（app.Event.Emit 会广播给所有窗口）。
   ========================================================================== */

const (
	// desktopLyricsWindow 窗口名（运行时按名字查找/复用）
	desktopLyricsWindow = "desktop-lyrics"
	// desktopLyricsEvent 主窗口 -> 歌词窗口的状态事件名
	desktopLyricsEvent = "desktop:lyrics"
	// 歌词窗口默认尺寸（DIP）。故意做得矮：不穿透的前提下，窗口会吃掉
	// 它覆盖区域内的鼠标点击，越矮遮挡越小。
	desktopLyricsWidth  = 1000
	desktopLyricsHeight = 132
	// desktopLyricsBottomGap 距屏幕工作区底边（任务栏上沿）的距离
	desktopLyricsBottomGap = 108
	// desktopLyricsMinWidth 最小宽度，避免窄屏时算出负数
	desktopLyricsMinWidth = 360
	// desktopLyricsPosSettle 位置落盘的去抖时长。
	//
	// Wails 自己已经对 WindowDidMove 做了 50ms 去抖，但拖动过程中事件依然很密，
	// 而每次落盘都是「序列化整份配置 + 原子写文件」。再等 400ms，
	// 用户手停下来之后才写一次。
	desktopLyricsPosSettle = 400 * time.Millisecond
)

// desktopLyricsSnapshot 桌面歌词窗口要显示的内容。
type desktopLyricsSnapshot struct {
	Enabled  bool   `json:"enabled"`
	Text     string `json:"text"`
	Playing  bool   `json:"playing"`
	FontSize int    `json:"fontSize"`
}

// desktopLyricsWindow 返回已存在的歌词窗口（没有则 nil）。
//
// 注意：Close() 之后窗口会被从注册表里移除，且**不能再 Show() 复活**
// （Show 内部走 Run()，而 Run() 对已销毁的窗口直接返回）。要重新显示必须
// 用 NewWithOptions 重新创建 —— 见 ensureDesktopLyrics。
func (s *WindowService) desktopLyricsWindow() *application.WebviewWindow {
	if s.app == nil {
		return nil
	}
	w, ok := s.app.Window.GetByName(desktopLyricsWindow)
	if !ok {
		return nil
	}
	if ww, ok := w.(*application.WebviewWindow); ok {
		return ww
	}
	return nil
}

// SetDesktopLyrics 打开/关闭桌面歌词窗口。
//
// 由底栏「桌面歌词」按钮与设置里的同名开关调用。
//
// 它与「桌面背景歌词」是一组单选按钮（见 desktop_wallpaper.go#setDesktopMode）：
// 打开窗口歌词会先把背景歌词关掉，反过来也一样。
func (s *WindowService) SetDesktopLyrics(on bool) map[string]any {
	if !on {
		s.closeDesktopLyricsWindow()
		return map[string]any{"ok": true, "enabled": false}
	}
	return s.setDesktopMode(desktopModeLyrics)
}

// closeDesktopLyricsWindow 关掉（并记为「已被操作过」）桌面歌词窗口。
//
// 幂等：窗口本来就不在也只是把状态清干净。
func (s *WindowService) closeDesktopLyricsWindow() {
	s.desktopMu.Lock()
	s.desktopOn = false
	// 记下「已经有人操作过」：启动恢复的兜底路径据此退让（见 WindowService）
	s.desktopTouched = true
	// 取消还没到点的位置保存（马上要自己写一次，避免重复）
	if s.posSaveTimer != nil {
		s.posSaveTimer.Stop()
		s.posSaveTimer = nil
	}
	s.desktopMu.Unlock()

	if w := s.desktopLyricsWindow(); w != nil {
		// 关闭前补写一次：拖动后的去抖保存可能还没到点，窗口一销毁位置就再也读不到了
		s.saveDesktopLyricsPos(w)
		w.Close()
	}
}

// openDesktopLyricsWindow 打开歌词窗口并立刻推一次当前状态。
func (s *WindowService) openDesktopLyricsWindow() map[string]any {
	s.desktopMu.Lock()
	s.desktopOn = true
	// 记下「已经有人操作过」：启动恢复的兜底路径据此退让（见 WindowService）
	s.desktopTouched = true
	s.desktopMu.Unlock()

	win := s.ensureDesktopLyrics()
	// 立刻把当前状态推一次：窗口刚创建时还没有任何事件，
	// 不推的话它会一直停在「等待播放」的空态。
	s.pushDesktopLyrics()
	if win == nil {
		s.desktopMu.Lock()
		s.desktopOn = false
		s.desktopMu.Unlock()
		return map[string]any{"ok": false, "enabled": false, "reason": "窗口创建失败"}
	}
	return map[string]any{"ok": true, "enabled": true}
}

// ensureDesktopLyrics 确保歌词窗口存在并显示（不存在就按透明置顶参数新建）。
func (s *WindowService) ensureDesktopLyrics() *application.WebviewWindow {
	if w := s.desktopLyricsWindow(); w != nil {
		w.Show()
		return w
	}
	if s.app == nil {
		return nil
	}
	w := s.app.Window.NewWithOptions(s.desktopLyricsOptions())
	s.watchDesktopLyricsMove(w)
	w.Show()
	return w
}

// watchDesktopLyricsMove 记住用户把桌面歌词窗口拖到了哪儿。
//
// 为什么必须靠窗口事件：拖拽是系统级的（页面里只是一句
// `--wails-draggable: drag`，指针按下之后窗口由操作系统移动），
// JS 侧完全收不到拖拽事件，只能从 Go 这边问窗口要坐标。
//
// 落盘本身再去抖 400ms（见 desktopLyricsPosSettle）；关窗口时还会补写一次，
// 所以「拖完立刻关掉」也不会丢。
func (s *WindowService) watchDesktopLyricsMove(w *application.WebviewWindow) {
	if w == nil {
		return
	}
	w.OnWindowEvent(events.Common.WindowDidMove, func(*application.WindowEvent) {
		s.scheduleDesktopLyricsPosSave(w)
	})
}

// scheduleDesktopLyricsPosSave 去抖地把当前位置写进配置。
func (s *WindowService) scheduleDesktopLyricsPosSave(w *application.WebviewWindow) {
	id := s.nextPosSaveSeq()
	s.desktopMu.Lock()
	if s.posSaveTimer != nil {
		s.posSaveTimer.Stop()
	}
	s.posSaveTimer = time.AfterFunc(desktopLyricsPosSettle, func() {
		if id != s.posSaveSeq {
			// 期间又有新的移动：这一次作废，由最后一次负责写
			return
		}
		s.saveDesktopLyricsPos(w)
	})
	s.desktopMu.Unlock()
}

func (s *WindowService) nextPosSaveSeq() uint64 {
	s.posSaveSeq++
	return s.posSaveSeq
}

// saveDesktopLyricsPos 把窗口当前位置写进配置（位置没变就不写盘）。
func (s *WindowService) saveDesktopLyricsPos(w *application.WebviewWindow) {
	if w == nil || s.store == nil {
		return
	}
	x, y := w.Position()
	if oldX, oldY, ok := s.store.DesktopLyricsPos(); ok && oldX == x && oldY == y {
		return
	}
	if err := s.store.SetDesktopLyricsPos(x, y); err != nil {
		// 记不住位置不是致命错误：下次启动回到默认位置而已，不该打断用户
		log.Printf("[desktop-lyrics] 保存窗口位置失败: %v", err)
	}
}

// resetDesktopLyricsPos 清掉位置存档并立刻把窗口移回默认位置。
func (s *WindowService) resetDesktopLyricsPos() map[string]any {
	if s.store != nil {
		if err := s.store.SetDesktopLyricsPos(bootstrap.DesktopLyricsNoPos, bootstrap.DesktopLyricsNoPos); err != nil {
			return map[string]any{"ok": false, "reason": err.Error()}
		}
	}
	w := s.desktopLyricsWindow()
	if w == nil {
		return map[string]any{"ok": true, "applied": false}
	}
	// 注意：这里必须用默认位置算法，不能用 desktopLyricsOptions() ——
	// 后者会读刚被清掉的存档（清掉之前是存档值），结果「重置」把窗口
	// 又摆回用户拖过去的地方。这个坑在实现时踩过一次。
	defX, defY, _ := s.desktopLyricsDefaultPos()
	w.SetPosition(defX, defY)
	return map[string]any{"ok": true, "applied": true, "x": defX, "y": defY}
}

// ResetDesktopLyricsPosition 把桌面歌词窗口移回默认位置并清掉记忆。
//
// 给设置界面一个出口：换显示器/改分辨率之后如果存档落在别扭的地方，
// 用户可以一键回到默认（而不是去删配置文件）。
func (s *WindowService) ResetDesktopLyricsPosition() map[string]any {
	return s.resetDesktopLyricsPos()
}

// desktopLyricsOptions 组装桌面歌词窗口参数。
func (s *WindowService) desktopLyricsOptions() application.WebviewWindowOptions {
	opts := application.WebviewWindowOptions{
		Name:   desktopLyricsWindow,
		Title:  "桌面歌词",
		Width:  desktopLyricsWidth,
		Height: desktopLyricsHeight,
		// 默认是 WindowCentered，会忽略 X/Y；自己摆位置必须显式写 WindowXY
		InitialPosition: application.WindowXY,
		Frameless:       true,
		// 逐像素透明（不要开 IgnoreMouseEvents，会把透明打回不透明）
		BackgroundType:   application.BackgroundTypeTransparent,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		AlwaysOnTop:      true,
		Hidden:           true,
		DisableResize:    true,
		// 关掉 WebView2 右键菜单：透明歌词条上弹出系统菜单很奇怪
		DefaultContextMenuDisabled: true,
		URL:                        "/lyrics.html",
		Windows: application.WindowsWindow{
			// 不进任务栏、不进 Alt+Tab
			HiddenOnTaskbar: true,
			// 关掉 Aero 阴影与 Win11 圆角：透明窗口边缘出现阴影框很难看
			DisableFramelessWindowDecorations: true,
			DisableIcon:                       true,
			DisableMenu:                       true,
		},
	}

	// 位置：优先用上次拖到的位置，否则用「主屏工作区水平居中、底部靠上」。
	// 坐标是 DIP 逻辑像素，Wails 内部按所在屏 ScaleFactor 换算，不用自己乘 DPI。
	defX, defY, width := s.desktopLyricsDefaultPos()
	opts.Width = width
	opts.X, opts.Y = defX, defY
	if x, y, ok := s.desktopLyricsSavedPos(); ok {
		opts.X, opts.Y = x, y
	}
	return opts
}

// desktopLyricsDefaultPos 默认位置与宽度（主屏工作区内，水平居中、底部靠上）。
func (s *WindowService) desktopLyricsDefaultPos() (int, int, int) {
	width := desktopLyricsWidth
	x, y := 0, 0
	if s.app == nil {
		return x, y, width
	}
	screen := s.app.Screen.GetPrimary()
	if screen == nil {
		return x, y, width
	}
	wa := screen.WorkArea
	if max := wa.Width - 160; max < width {
		width = max
	}
	if width < desktopLyricsMinWidth {
		width = desktopLyricsMinWidth
	}
	x = wa.X + (wa.Width-width)/2
	y = wa.Y + wa.Height - desktopLyricsHeight - desktopLyricsBottomGap
	return x, y, width
}

// desktopLyricsSavedPos 读取位置存档，并校验它现在还合不合理。
//
// 校验是必须的：用户可能拔掉副屏、改了分辨率或缩放，上一次的坐标就会落在
// 屏幕之外 —— 那种情况下窗口会「启动后看不见」，用户只会以为功能坏了。
// 规则故意宽松但明确：**窗口至少要有三分之一落在某块屏幕内**。
// 不满足就当没存过，回到默认位置（默认位置永远可见）。
func (s *WindowService) desktopLyricsSavedPos() (int, int, bool) {
	if s.store == nil {
		return 0, 0, false
	}
	x, y, ok := s.store.DesktopLyricsPos()
	if !ok {
		return 0, 0, false
	}
	if s.app == nil {
		// 拿不到屏幕信息时不冒险：回默认位置（总比放到看不见的地方强）
		return 0, 0, false
	}
	if !rectVisibleEnough(x, y, desktopLyricsWidth, desktopLyricsHeight, s.app.Screen.GetAll()) {
		return 0, 0, false
	}
	return x, y, true
}

// rectVisibleEnough 判断矩形是否至少三分之一面积落在给定的某块屏幕里。
func rectVisibleEnough(x, y, w, h int, screens []*application.Screen) bool {
	if len(screens) == 0 {
		return false
	}
	need := w * h / 3
	if need <= 0 {
		need = 1
	}
	for _, sc := range screens {
		if sc == nil {
			continue
		}
		// 用 Bounds 而不是 WorkArea：拖到任务栏上方一点点也算「用户想要的」
		b := sc.Bounds
		ox := min(x+w, b.X+b.Width) - max(x, b.X)
		oy := min(y+h, b.Y+b.Height) - max(y, b.Y)
		if ox <= 0 || oy <= 0 {
			continue
		}
		if ox*oy >= need {
			return true
		}
	}
	return false
}

// UpdateDesktopLyrics 主窗口在「歌词行变化 / 播放状态变化」时调用。
//
// 前端做了节流（只在内容真的变化时调用），所以这里不再去重。
func (s *WindowService) UpdateDesktopLyrics(payload map[string]any) desktopLyricsSnapshot {
	s.desktopMu.Lock()
	if v, ok := payload["text"].(string); ok {
		s.desktopText = v
	}
	if v, ok := payload["playing"].(bool); ok {
		s.desktopPlaying = v
	}
	if v, ok := payload["fontSize"].(float64); ok && v > 0 {
		s.desktopFontSize = int(v)
	}
	s.desktopMu.Unlock()
	s.pushDesktopLyrics()
	return s.desktopState()
}

// DesktopLyricsState 读当前状态。
//
// 歌词窗口加载完成后用它做一次初始同步：事件是「之后」才来的，
// 不主动拉一次的话，新窗口会一直等到下一次换行才有内容。
func (s *WindowService) DesktopLyricsState() desktopLyricsSnapshot {
	return s.desktopState()
}

// DesktopLyricsTouched 报告「桌面歌词开关是否已经被用户/前端操作过」。
//
// 启动恢复的兜底路径用它来决定要不要出手：用户已经自己做过选择，
// 恢复逻辑就必须退让，不能过一会儿又把窗口冒出来。
func (s *WindowService) DesktopLyricsTouched() bool {
	s.desktopMu.Lock()
	defer s.desktopMu.Unlock()
	return s.desktopTouched
}

// MarkDesktopLyricsReady 由歌词窗口在加载完成后调用，立刻把状态推给自己。
//
// 页面加载完成与窗口创建之间有时序差：创建时推的那一次事件页面可能还没
// 注册好监听，所以页面这边必须主动要一次。
func (s *WindowService) MarkDesktopLyricsReady() desktopLyricsSnapshot {
	if s.desktopLyricsWindow() != nil {
		s.pushDesktopLyrics()
	}
	return s.desktopState()
}

func (s *WindowService) pushDesktopLyrics() {
	if s.app == nil {
		return
	}
	// app.Event.Emit 会广播给所有窗口（包含新建的歌词窗口），
	// 主窗口也会收到 —— 前端按 payload 里的字段自行忽略即可。
	s.app.Event.Emit(desktopLyricsEvent, s.desktopState())
}

func (s *WindowService) desktopState() desktopLyricsSnapshot {
	s.desktopMu.Lock()
	defer s.desktopMu.Unlock()
	size := s.desktopFontSize
	if size <= 0 {
		size = 22
	}
	return desktopLyricsSnapshot{
		Enabled:  s.desktopOn,
		Text:     s.desktopText,
		Playing:  s.desktopPlaying,
		FontSize: size,
	}
}
