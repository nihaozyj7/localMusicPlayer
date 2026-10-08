package main

import (
	"log"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"localmusicplayer/internal/bootstrap"
)

/* ==========================================================================
   主窗口位置 / 尺寸记忆
   --------------------------------------------------------------------------
   需求：应用重新打开时，主窗口回到上次退出时的位置和大小。

   为什么必须自己记：主窗口是 Frameless 的（见 main.go 的 winOpts），
   最大化 / 还原走的是我们自绘的按钮，操作系统**不会**替我们保存任何几何
   信息；Wails 的窗口创建也不带「自动恢复上次几何」这回事 —— 不落盘的话
   每次启动都是 1280×820 居中。

   与桌面歌词（desktop_lyrics.go）那套的区别：
     · 桌面歌词是独立的小窗口、尺寸固定，只需要记 X/Y；
     · 主窗口位置和尺寸都要记，而且多一个「最大化」状态。
   两者共用 rectVisibleEnough 做「存档是否还在屏幕里」的校验。
   ========================================================================== */

const (
	// mainWindowDefaultWidth / mainWindowDefaultHeight 主窗口的默认尺寸，
	// 也是「没有存档 / 存档不可用」时回退的尺寸。
	//
	// 这两个值必须与 main.go 里 winOpts 的那一组一致 —— 所以在这里定义、
	// 由 main.go 引用，而不是两边各写一份（改一处忘另一处就会出现
	// 「重置了位置但尺寸没变回默认」这种很难查的不一致）。
	mainWindowDefaultWidth  = 1280
	mainWindowDefaultHeight = 820

	// mainGeometrySettle 几何落盘的去抖时长。
	//
	// 拖拽 / 拉伸窗口时 WindowDidMove / WindowDidResize 事件非常密，而每次落盘
	// 都是「序列化整份配置 + 原子写文件」（配置里可能含数万个歌单 ID，见
	// bootstrap.saveLocked 的说明）。等用户手停下来再写一次。
	// 比桌面歌词的 400ms 稍长：主窗口的拖动/缩放通常更连续。
	mainGeometrySettle = 500 * time.Millisecond

	// mainGeometryMinW / mainGeometryMinH 存档尺寸的下限。
	//
	// 与 main.go 里的 MinWidth/MinHeight 保持一致。比这个更小的存档只可能来自
	// 「配置被手改」或者「在极小屏幕上被系统压过」，读回来会让窗口连标题栏上的
	// 按钮都摆不下 —— 夹到最小值，而不是整个放弃存档（位置往往还是对的）。
	mainGeometryMinW = 1000
	mainGeometryMinH = 680

	// mainGeometryMaxW / mainGeometryMaxH 存档尺寸的上限。
	//
	// 防的是「存档来自一块 8K 显示器，现在插到笔记本自带屏上」这种情况：
	// 尺寸本身不设上限的话，窗口会比屏幕还大，虽然位置校验能过（左上角可见
	// 即算可见），但用户看不到右半边和底边，也没有明显办法救回来。
	// 现在的处理是：尺寸超上限时整个放弃尺寸存档（位置仍然保留，见
	// mainWindowSavedGeometry），因为一个「占满当前屏幕」的默认值比一个
	// 比屏幕还大的窗口好用。
	mainGeometryMaxW = 10000
	mainGeometryMaxH = 10000
)

// ensureMainWindowOnScreen 在屏幕信息就绪后确认窗口真的落在某块屏幕里。
//
// 为什么需要这一步：窗口创建时（main.go 的 winOpts）屏幕枚举还没跑完，
// app.Screen.GetAll() 是空的，那时只能保守地信任存档（见
// validateMainWindowGeometry 的说明）。等窗口显示出来之后再校验一次 ——
// 如果存档确实落在所有屏幕之外（换了显示器 / 改了分辨率 / 拔了外接屏），
// 在这里把窗口拉回主屏中央，避免「应用启动了但窗口看不见」。
//
// 必须在窗口显示之后再摆：窗口还是隐藏状态时 SetPosition 对某些平台
// 不一定生效，而且提前摆会让 showPrepared 的遮罩/首帧按错的几何走。
func (s *WindowService) ensureMainWindowOnScreen() {
	w := s.current()
	if w == nil || s.app == nil {
		return
	}
	// 最大化 / 全屏时位置由系统定，不该去动
	if w.IsMaximised() || w.IsFullscreen() {
		return
	}
	screens := s.app.Screen.GetAll()
	if len(screens) == 0 {
		// 还是拿不到屏幕信息就放弃纠正：总比乱摆一个位置强
		return
	}
	x, y := w.Position()
	width, height := w.Size()
	if width <= 0 || height <= 0 {
		return
	}
	if rectVisibleEnough(x, y, width, height, screens) {
		return // 已经可见，什么都不用做
	}

	// 落在屏幕外了：搬回主屏中央并清掉存档，
	// 免得下次启动又拿这个坏位置去试一遍。
	log.Printf("[window] 主窗口位置 (%d,%d) 不在任何屏幕内，已移回主屏中央", x, y)
	if s.store != nil {
		if err := s.store.ResetMainWindowGeometry(); err != nil {
			log.Printf("[window] 清掉失效的窗口几何存档失败: %v", err)
		}
	}
	targetX, targetY := 0, 0
	if sc := s.app.Screen.GetPrimary(); sc != nil {
		b := sc.WorkArea
		targetX = b.X + (b.Width-width)/2
		targetY = b.Y + (b.Height-height)/2
	}
	// 标记「这次移动是程序自己发起的」：SetPosition 会触发 WindowDidMove，
	// 不加标记就会被当成用户操作（见 noteGeometryTouched）。
	s.mainGeomSelfMove.Store(true)
	w.SetPosition(targetX, targetY)
}

// noteGeometryTouched 记录「用户动过窗口」，但要排掉两类不是用户操作的移动：
//
//  1. 启动序列期间框架/我们自己摆放窗口（门还没开，见
//     attachMainWindowGeometryTracking）；
//  2. 我们主动纠正位置 / 重置窗口时调的那几下 SetPosition/SetSize
//     （见 mainGeomSelfMove）。
//
// 这个标志只用来回答「用户是不是已经自己动过窗口了」
// （见 restoreMainWindowMaximizedWhenReady 的防抢控制权判断）。
// 不做这两层排除的话会出现很别扭的自相矛盾：程序自己挪一下窗口，
// 就再也不敢恢复最大化了 —— 表现成「只要窗口曾经跑丢过，最大化就恢复不了」。
func (s *WindowService) noteGeometryTouched() {
	if !s.mainGeomTrackingReady.Load() {
		return // 启动序列期间的移动不算用户操作
	}
	if s.mainGeomSelfMove.Load() {
		return // 这次移动是我们自己发起的
	}
	s.mainGeomUserTouched.Store(true)
}

// markGeometryTrackingReady 开启「用户动过窗口」的判定。
//
// 由启动流程在窗口显示、几何纠正、最大化恢复都做完之后调用 ——
// 那之后发生的移动 / 缩放才真的来自用户。
func (s *WindowService) markGeometryTrackingReady() {
	s.mainGeomTrackingReady.Store(true)
}

// validateMainWindowGeometry 是 mainWindowSavedGeometry 的纯函数内核：
// 给定原始存档与屏幕列表，算出哪几项可用。
//
// 单独抽出来是为了可测 —— application.ScreenManager 的构造函数是私有的、
// LayoutScreens 还会做 DPI 重算，测试里没法造一个「假的 App」。
// 把校验逻辑与 App 解耦之后，规则本身就能直接测（见
// main_window_geometry_test.go）。
//
// 关于 screens 为空：**必须区分「屏幕信息还没准备好」与「确认不落在屏幕里」**。
//
// 启动时 app.Screen.GetAll() 在窗口创建那一刻还是空的 —— 屏幕枚举
// （windowsApp.processAndCacheScreens）要等 Wails 的原生 side 初始化完才跑，
// 而 winOpts 必须在那之前就填好。这里若把「空屏幕列表」当成「不可见」，
// 每次启动都会把位置存档判为无效、于是永远居中：功能看起来完全没生效
// （这个坑在实测中踩到过，日志里表现为 screens=0 且 okPos=false）。
//
// 所以约定：拿不到屏幕信息时**保守放行位置**（信任存档），由调用方在屏幕
// 信息就绪后再用 ensureMainWindowOnScreen 纠正。真正的「屏幕外」判定只在
// 确实拿到了屏幕列表时做。
func validateMainWindowGeometry(
	x, y, w, h int, hasPos, hasSize, maximized bool, screens []*application.Screen,
) (outX, outY, outW, outH int, okPos, okSize, outMax bool) {
	outMax = maximized

	if hasSize && w >= mainGeometryMinW && h >= mainGeometryMinH &&
		w <= mainGeometryMaxW && h <= mainGeometryMaxH {
		outW, outH, okSize = w, h, true
	}

	if !hasPos {
		return 0, 0, outW, outH, false, okSize, outMax
	}
	// 屏幕信息还没就绪：先信任存档（见上面的说明）。
	if len(screens) == 0 {
		return x, y, outW, outH, true, okSize, outMax
	}
	// 位置校验要用「实际会用的尺寸」：没有尺寸存档时用默认值，
	// 否则算出来的可见面积没有意义。
	checkW, checkH := outW, outH
	if !okSize {
		checkW, checkH = mainWindowDefaultWidth, mainWindowDefaultHeight
	}
	if !rectVisibleEnough(x, y, checkW, checkH, screens) {
		return 0, 0, outW, outH, false, okSize, outMax
	}
	return x, y, outW, outH, true, okSize, outMax
}

// mainWindowSavedGeometry 读出主窗口的几何存档并做校验。
//
// 返回的三个 bool 各自独立：
//   - okPos  位置可用（存过 且 至少三分之一面积落在某块屏幕里）
//   - okSize 尺寸可用（存过 且 在合法范围内）
//   - maximized 上次退出时是最大化
//
// 位置单独用 rectVisibleEnough 校验（复用桌面歌词那套）：换显示器之后
// 存档的 X/Y 可能落在所有屏幕之外，直接套用会让窗口「启动了但看不见」——
// 那比不记忆还糟，因为用户完全不知道发生了什么。
func (s *WindowService) mainWindowSavedGeometry() (x, y, w, h int, okPos, okSize, maximized bool) {
	if s.store == nil {
		return 0, 0, 0, 0, false, false, false
	}
	sx, sy, sw, sh, hasPos, hasSize, maxed := s.store.MainWindowGeometry()
	// 拿不到屏幕信息时保守放行位置（见 validateMainWindowGeometry 的说明），
	// 屏幕就绪后由 ensureMainWindowOnScreen 纠正。
	var screens []*application.Screen
	if s.app != nil {
		screens = s.app.Screen.GetAll()
	}
	return validateMainWindowGeometry(sx, sy, sw, sh, hasPos, hasSize, maxed, screens)
}

// attachMainWindowGeometryTracking 给主窗口挂上「移动 / 缩放就记住」的事件。
//
// 在 main.go 创建窗口之后调用一次。
func (s *WindowService) attachMainWindowGeometryTracking(w *application.WebviewWindow) {
	if w == nil {
		return
	}
	// 启动阶段先把「用户动过窗口」的门关上：窗口是隐藏创建的
	// （main.go 的 winOpts.Hidden），Wails 与启动流程自己会在这期间摆放窗口
	// （首次定位、遮罩显示、补系统外框都会发 WindowDidMove/WindowDidResize），
	// 那些都不是用户操作。不关门的话，restoreMainWindowMaximizedWhenReady 里
	// 「用户已动过窗口就别抢控制权」的判断会被框架自己的动作触发 ——
	// 表现就是最大化状态永远恢复不了（实测踩到过，日志里是
	// 「用户在启动期间动过窗口，跳过最大化恢复」）。
	//
	// 几何**照常记录**（下面两个回调仍然 scheduleMainGeometrySave），
	// 只是这段时间的变化不算「用户操作」。启动序列结束由
	// markGeometryTrackingReady 开门。
	s.mainGeomTrackingReady.Store(false)

	// WindowDidMove 与 WindowDidResize 各自置位自己的标志，去抖窗口结束时
	// 一起写（见 scheduleMainGeometrySave）。
	w.OnWindowEvent(events.Common.WindowDidMove, func(*application.WindowEvent) {
		s.noteGeometryTouched()
		s.scheduleMainGeometrySave(w, true, false)
	})
	w.OnWindowEvent(events.Common.WindowDidResize, func(*application.WindowEvent) {
		s.noteGeometryTouched()
		s.scheduleMainGeometrySave(w, false, true)
	})
	// 最大化 / 还原：只改 maximized 标志，不动 W/H。
	//
	// 关键点：最大化状态下读到的 Size() 是「最大化之后的尺寸」，把它写进
	// W/H 会让下次「还原」回不到用户真正想要的大小。所以这两个事件里
	// 只记标志位。
	w.OnWindowEvent(events.Common.WindowMaximise, func(*application.WindowEvent) {
		s.saveMainWindowMaximized(true)
	})
	w.OnWindowEvent(events.Common.WindowUnMaximise, func(*application.WindowEvent) {
		s.saveMainWindowMaximized(false)
		// 还原之后尺寸回到「非最大化」的值，这时才该记几何 ——
		// 最大化期间 saveMainWindowGeometry 是直接 return 的。
		// 等去抖过去再读，免得读到还原动画中间那一帧。
		s.scheduleMainGeometrySave(w, true, true)
	})
}

// syncMaximizedFromWindow 按窗口**当前真实状态**同步 maximized 存档。
//
// 为什么除了事件之外还要这个：Wails 只在它自己的 unmaximise() 里发
// Common.WindowUnMaximise；用户用「双击无边框标题栏」「把窗口拖出屏幕顶端」
// 这类系统手势还原 / 最大化时，走的是 Windows 原生的窗口过程，Wails 收不到
// 它自己那次调用，事件就不会发。只靠事件的话存档会一直停在旧值 ——
// 表现成「我明明还原了，下次启动又自己最大化」。
//
// 这里在每次几何落盘时顺手对一次，让存档始终跟真实状态一致。
func (s *WindowService) syncMaximizedFromWindow(w *application.WebviewWindow) {
	if w == nil {
		return
	}
	s.saveMainWindowMaximized(w.IsMaximised())
}

// scheduleMainGeometrySave 去抖地把主窗口几何写进配置。
//
// moved / resized 记录「这段时间里发生过什么」，而不是只记最后一次是谁触发的：
// 拖动窗口时系统往往同时发 move 和 resize（有些平台拖动会改尺寸），
// 只保留最后一次的事件类型会丢掉另一半更新 —— 位置记下来了但尺寸没记。
// 两个标志累积到去抖窗口结束，然后一次性写。
func (s *WindowService) scheduleMainGeometrySave(w *application.WebviewWindow, moved, resized bool) {
	s.mainGeomMu.Lock()
	s.mainGeomSeq++
	id := s.mainGeomSeq
	s.mainGeomMoved = s.mainGeomMoved || moved
	s.mainGeomResized = s.mainGeomResized || resized
	if s.mainGeomTimer != nil {
		s.mainGeomTimer.Stop()
	}
	s.mainGeomTimer = time.AfterFunc(mainGeometrySettle, func() {
		s.mainGeomMu.Lock()
		stale := id != s.mainGeomSeq
		if !stale {
			// 取走累积的标志并清零，供下一轮使用
			moved, resized = s.mainGeomMoved, s.mainGeomResized
			s.mainGeomMoved, s.mainGeomResized = false, false
		}
		s.mainGeomMu.Unlock()
		if stale {
			// 期间又有新的移动/缩放：这次作废，由最后一次负责写
			return
		}
		s.saveMainWindowGeometry(w, moved, resized)
	})
	s.mainGeomMu.Unlock()
}

// saveMainWindowGeometry 把主窗口当前位置 / 尺寸写进配置。
//
// moved / resized 决定这次更新哪几项（见 SetMainWindowGeometry 的哨兵语义）。
func (s *WindowService) saveMainWindowGeometry(w *application.WebviewWindow, moved, resized bool) {
	if w == nil || s.store == nil {
		return
	}
	if !moved && !resized {
		return
	}
	// 顺手把最大化状态跟真实状态对齐一次：系统手势触发的最大化 / 还原
	// 不会走 Wails 的事件（见 syncMaximizedFromWindow）。
	s.syncMaximizedFromWindow(w)

	// 最大化 / 全屏时不要记几何：那时候的 Size() 是系统给的铺满尺寸，
	// 记下来会污染「还原后应该多大」。最大化状态由 saveMainWindowMaximized 单独记。
	//
	// 注意这里**不 return 就走人**是有代价的：最大化状态下退出应用时，
	// 用户调整过的「还原尺寸」不会被更新。但那是正确行为 —— 最大化时的
	// Size() 读到的是铺满尺寸，写进去才是真的错。（还原尺寸在进入最大化
	// 之前那一次移动/缩放时就已经记下了。）
	if w.IsMaximised() || w.IsFullscreen() {
		return
	}

	x, y := MainWindowNoPosArg, MainWindowNoPosArg
	var width, height int
	if moved {
		x, y = w.Position()
	}
	if resized {
		width, height = w.Size()
	}

	curX, curY, curW, curH, _, _, _ := s.store.MainWindowGeometry()
	if moved && curX == x && curY == y && (!resized || (curW == width && curH == height)) {
		return
	}
	if !moved && curW == width && curH == height {
		return
	}

	if err := s.store.SetMainWindowGeometry(x, y, width, height); err != nil {
		// 记不住几何不是致命错误：下次启动回到默认而已，不该打断用户
		log.Printf("[window] 保存主窗口几何失败: %v", err)
	}
}

// MainWindowNoPosArg 是「这次不更新这一项」的哨兵，语义与
// bootstrap.MainWindowNoPos 一致，单独起个名字是因为这里读起来是
// 「参数」而不是「存档值」。
const MainWindowNoPosArg = bootstrap.MainWindowNoPos

// saveMainWindowMaximized 记住主窗口的最大化状态。
func (s *WindowService) saveMainWindowMaximized(on bool) {
	if s.store == nil {
		return
	}
	if _, _, _, _, _, _, cur := s.store.MainWindowGeometry(); cur == on {
		return
	}
	if err := s.store.SetMainWindowMaximized(on); err != nil {
		log.Printf("[window] 保存最大化状态失败: %v", err)
	}
}

// restoreMainWindowMaximizedWhenReady 在窗口实现就绪后恢复最大化状态。
//
// 为什么必须等：NewWithOptions 只是把窗口参数记下来，**原生窗口是在 Wails
// 自己的 goroutine 里创建的**（与 applyWindowIconWithRetry 遇到的时序问题
// 完全相同）。那一刻调 Maximise() 是空操作，状态会丢。
//
// 另一条约束：窗口是**隐藏创建**的（见 main.go 的 winOpts.Hidden），提前
// 最大化会让「隐藏窗口先变成铺满尺寸」，之后 showPrepared 抓首屏/摆遮罩
// 都按最大化的尺寸走，观感上会出现一次明显的尺寸跳变。所以这里等到窗口
// 真的显示出来（shown）之后再最大化。
//
// 这个轮询同时负责「屏幕信息就绪后把跑丢的窗口拉回来」
// （ensureMainWindowOnScreen）：两件事都要求「窗口已显示 + 屏幕枚举已完成」，
// 分开轮询只是白等两遍。
func (s *WindowService) restoreMainWindowMaximizedWhenReady(maximized bool) {
	// 整段事情做完（成功、不需要做、或超时）之后才开门：
	// 在那之前发生的移动/缩放都不算用户操作（见 noteGeometryTouched）。
	// 放在最前面 defer，保证任何一条 return 路径都会开门 ——
	// 忘了开门的话，用户之后拖窗口就再也标记不上「动过」，
	// 表现为下次启动时最大化恢复会跟用户抢控制权。
	defer s.markGeometryTrackingReady()

	// 轮询等两件事同时成立：原生窗口建出来了（NativeWindow 非 nil）+ 已经显示。
	// 总时长约 6 秒，够覆盖「首帧渲染慢」的极端情况；超时就放弃 ——
	// 那两件事都不是致命问题（窗口只是没最大化 / 位置可能不对），
	// 用户自己动一下就行，不该为它卡住启动。
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		w := s.current()
		if w == nil {
			return
		}
		if w.NativeWindow() != nil && s.MainWindowShown() {
			// 先把可能跑丢的窗口拉回屏幕内，再考虑最大化 ——
			// 顺序反过来的话，最大化会作用于一个屏幕外的窗口。
			s.ensureMainWindowOnScreen()

			if !maximized {
				return
			}
			// 到这里就不再需要「用户是不是动过窗口」这个判断了：
			// 门还关着，期间所有移动都被 noteGeometryTouched 忽略，
			// 标志必然是 false。等门开了（本函数返回之后），
			// 用户的任何拖动都会正常记上。
			w.Maximise()
			// 最大化事件会由 Wails 回发，saveMainWindowMaximized 会把它写回去。
			// 这里不直接写盘：事件路径是唯一权威，避免两处状态不一致。
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	log.Printf("[window] 等待主窗口就绪超时，跳过几何纠正 / 最大化恢复")
}

// ResetMainWindowGeometry 清掉主窗口几何存档，并立刻把窗口摆回默认。
//
// 给设置界面一个出口：换显示器 / 改分辨率之后如果存档落在别扭的地方，
// 用户可以一键回到默认（而不是去删配置文件）。与桌面歌词的
// ResetDesktopLyricsPosition 是同一个设计。
func (s *WindowService) ResetMainWindowGeometry() map[string]any {
	if s.store == nil {
		return map[string]any{"ok": false, "reason": "配置不可用"}
	}
	if err := s.store.ResetMainWindowGeometry(); err != nil {
		return map[string]any{"ok": false, "reason": err.Error()}
	}
	w := s.current()
	if w == nil {
		return map[string]any{"ok": true, "applied": false}
	}
	// 先还原再摆位置：最大化状态下 SetPosition/SetSize 是无效的
	// （系统会让窗口保持铺满），必须先退出最大化。
	if w.IsMaximised() {
		w.UnMaximise()
	}
	// 标记「这几下是程序自己动的」：SetSize/SetPosition 会触发
	// WindowDidResize/WindowDidMove，不标记就会被当成用户操作。
	//
	// 注意这里**故意不加 defer 复位**：事件是异步派发的，我们返回之后
	// 才被处理，defer 会在事件到达之前就把标记清掉。而「程序自己动窗口」
	// 这件事只发生在启动纠正与重置这两处，重置完标记留着也没有副作用 ——
	// 它只会让之后真正由用户发起的移动被正确记为「用户动过」……
	// 所以重置结束时必须把它清掉，否则用户之后拖窗口就再也标记不上了。
	s.mainGeomSelfMove.Store(true)
	w.SetSize(mainWindowDefaultWidth, mainWindowDefaultHeight)
	// 居中：拿主屏工作区算，不能用 WindowCentered（那是创建时才有用的选项）
	if s.app != nil {
		if sc := s.app.Screen.GetPrimary(); sc != nil {
			b := sc.WorkArea
			w.SetPosition(
				b.X+(b.Width-mainWindowDefaultWidth)/2,
				b.Y+(b.Height-mainWindowDefaultHeight)/2,
			)
		}
	}
	// 等事件派发完再撤销标记（给一个足够宽的窗口：这些事件由 Wails 的
	// 事件循环派发，通常几毫秒内到）。
	time.AfterFunc(300*time.Millisecond, func() { s.mainGeomSelfMove.Store(false) })
	// 用户主动重置之后，就不该再拿「存档里的最大化」去恢复
	s.mainGeomUserTouched.Store(true)
	return map[string]any{
		"ok":      true,
		"applied": true,
		"width":   mainWindowDefaultWidth,
		"height":  mainWindowDefaultHeight,
	}
}
