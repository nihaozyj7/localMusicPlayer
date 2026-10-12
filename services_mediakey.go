/* ==========================================================================
   services_mediakey.go — 键盘媒体键（Play/Pause）全局响应
   --------------------------------------------------------------------------
   需求：键盘上那颗 ⏯（播放/暂停）键在本程序里没反应，而别的播放器/网页能用。
   而且用户希望**挂后台时**（最小化、失焦、缩到托盘）也照样能响应。

   --------------------------------------------------------------------------
   为什么必须做成「系统级全局热键」，而不是网页里的 MediaSession

   那条路（navigator.mediaSession.setActionHandler）看着更「标准」，但在本项目
   里**根本不会生效**，原因有二，都是硬性的：

     1. MediaSession 的前提是页面上有一个**真正在出声的 <audio>/<video> 元素**。
        媒体键由 Chromium 注册到系统的 SMTC（媒体传输控件）后，只有当某个
        媒体元素处于播放态时才会把按键回调下来。纯 Web Audio / 没有媒体元素
        的会话拿不到媒体键（见 w3c/audio-session 的讨论）。
     2. 更致命的是：本项目的播放已经**搬到 Go 进程**了（internal/audioplay +
        WASAPI，见 services_player.go 顶部说明）。后端接管播放时页面上压根
        不创建 <audio>（只有 legacy 回退路径 —— audio.js 里的 audioEl() —— 才会创建），
        所以 MediaSession 连「注册」的前提都不成立。

   于是这里走 Go 侧的全局热键：RegisterHotKey 是系统级注册，**与窗口焦点、
   是否最小化、是否缩到托盘全部无关** —— 这正好就是「挂后台也要能响应」。
   Windows / Linux(X11) 下媒体键无需任何权限；macOS 需要辅助功能授权
   （见 hotkey 包文档），失败时本模块只记日志、绝不影响程序启动。

   --------------------------------------------------------------------------
   为什么按一下要「先转成事件、再让前端去 toggle」，而不是直接推引擎

   后端引擎是**从动**的：真正的「播放意图」记在前端 store 的 state.playing 上
   （见 store.js#togglePlay）。如果这里只调 engine.Play/Pause，而后端推回的
   锚点又会被前端 applyAnchor 当成唯一真源去覆盖 state.playing —— 两边就会打架，
   表现为「按了没反应」或者「过一会自己弹回去」。

   所以热键的职责只有一件事：**把「用户按了播放/暂停」这个意图转达给前端**，
   剩下的交给前端已有的 togglePlay 链路（它会改 state 并把结果推回后端）。

   前端**报到之前**（热键已注册、页面还没挂上监听，见 media-keys.js#startMediaKeys）
   才退化为直接操作引擎 —— 这段窗口真实存在（热键在 ApplicationStarted 就注册了），
   判据是「前端有没有调 FrontendReady 报到」，不是「有没有注入 emitter」
   （后者在生产路径上恒为真，见第六轮审查 N-12）。
   ========================================================================== */

package main

import (
	"log"
	"sync"

	"golang.design/x/hotkey"
)

/* --------------------------------------------------------------------------
   媒体键事件名（与前端 frontend/src/js/media-keys.js 对齐）
   -------------------------------------------------------------------------- */

// mediaKeyEvent 是「用户按了媒体键」的事件名。
//
// 载荷：{action string}，目前只有 "toggle"（播放/暂停）。
// 刻意只传一个抽象的 action 而不是「帮我 Play」：前端拿到后走自己的
// togglePlay —— 由前端决定此刻该播还是该停，后端不替它做决定。
const mediaKeyEvent = "media:key"

/* --------------------------------------------------------------------------
   MediaKeyService
   -------------------------------------------------------------------------- */

// mediaKeyToggle 是热键触发时要执行的动作（由 main 注入）。
//
// 注入而不是在这里直接抓 state：既是依赖倒置（本文件不该认识 appState），
// 也让单测可以塞一个假实现进来,不必真的去注册系统热键。
type mediaKeyToggle func()

// MediaKeyService 负责注册媒体键并把按键转成事件。
//
// 生命周期与播放引擎一致：ApplicationStarted 之后 Start，退出时 Stop。
// 注册失败（被别的程序独占 / 平台不支持）不是致命错误，只记日志。
type MediaKeyService struct {
	// onToggle 是「播放/暂停」被按下时的动作
	onToggle mediaKeyToggle

	// emit 发事件给前端（可为 nil：此时退化为直接调用 onToggle）
	emit func(name string, payload any)

	// frontendReady 表示前端已经挂上 media:key 监听并报到（见 FrontendReady）。
	// 只有它为真时按键才走「发事件给前端」这条路 —— emit 非 nil 并不等于
	// 有人在听：生产路径上 emitter 在注册热键之前就注入好了，而页面要等装配完
	// 才挂得上监听（第六轮审查 N-12 记的正是这段窗口）。
	frontendReady bool

	mu       sync.Mutex
	hk       *hotkey.Hotkey
	started  bool
	lastErr  string
	stopOnce sync.Once
}

// NewMediaKeyService 构造服务。onToggle 为 nil 时服务退化为「只记日志」，
// 不会 panic —— 媒体键是增强功能，不该因为它没接好就让程序起不来。
func NewMediaKeyService(onToggle mediaKeyToggle) *MediaKeyService {
	return &MediaKeyService{onToggle: onToggle}
}

// setEmitter 注入事件发送器（不导出：Wails 绑定生成器会把导出方法暴露给前端，
// 而这里接收的是函数值，生成器无法序列化 —— 与 PlayerService#setApp 同理）。
func (s *MediaKeyService) setEmitter(emit func(name string, payload any)) {
	s.mu.Lock()
	s.emit = emit
	s.mu.Unlock()
}

// FrontendReady 由前端在**挂上 media:key 监听之后**调用，表示「现在可以往我这里
// 发事件了」。这是 Wails 绑定方法（前端 media-keys.js#startMediaKeys 就在订阅成功后
// 调它一次）。
//
// 为什么需要这个握手（第六轮审查 N-12）：热键在 ApplicationStarted 就注册好了，
// 而页面要装配到 startMediaKeys 那一行才挂得上监听 —— 中间那段按下的 ⏯ 以前是
// 「发给空气」：emit 一直非 nil（生产路径上注册热键前就注入好了），事件发出去没人听，
// 而退化分支的判据恰恰是「emit == nil」，所以那段窗口既不生效也不兜底。
// 判据换成「前端报到过没有」之后，窗口内的按键会退化到直接操作引擎（见 dispatch），
// 启动那一秒里的 ⏯ 也能生效。
//
// 单向：前端只会从「未报到」变成「已报到」。页面重载时订阅是「先卸再挂」
// （startMediaKeys 第一行就是 stopMediaKeys），中间不需要、也不应该回退 ——
// 回退只会重新打开一段丢键窗口。
func (s *MediaKeyService) FrontendReady() {
	s.mu.Lock()
	already := s.frontendReady
	s.frontendReady = true
	s.mu.Unlock()
	if !already {
		log.Printf("[mediakey] 前端已就绪：按键改由前端 togglePlay 处理")
	}
}

// Start 注册全局媒体键。返回是否注册成功。
//
// 注册成功与否都不该阻断启动流程：注册不上（比如被其它播放器独占）时，
// 程序应当照常可用，只是媒体键没接管。
func (s *MediaKeyService) Start() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.started {
		return true
	}

	// 媒体键没有修饰键组合：mods 传空切片。
	// KeyMediaPlayPause 就是 VK_MEDIA_PLAY_PAUSE (0xB3)，见 hotkey 包的 Windows 实现。
	hk := hotkey.New([]hotkey.Modifier{}, hotkey.KeyMediaPlayPause)
	if err := hk.Register(); err != nil {
		s.lastErr = err.Error()
		log.Printf("[mediakey] 媒体键注册失败（不影响正常使用）：%v", err)
		return false
	}

	s.hk = hk
	s.started = true
	s.lastErr = ""
	log.Printf("[mediakey] 已接管媒体键：%v", hk)

	// 按键回调必须丢到 goroutine 里：Keydown() 是一个无缓冲的事件通道，
	// 而这个循环正是它的消费者 —— 如果在这里同步做重活（比如等一次 IPC 往返），
	// 下一次按键就会在通道上排队，表现为「连按几下只响一次」。
	go s.listen(hk)
	return true
}

// listen 消费热键事件并分发。
func (s *MediaKeyService) listen(hk *hotkey.Hotkey) {
	for range hk.Keydown() {
		go s.dispatch()
	}
}

// dispatch 把一个按键变成前端事件。
//
// 在 goroutine 里跑（由 listen 起），所以这里可以安全地做阻塞操作。
func (s *MediaKeyService) dispatch() {
	s.mu.Lock()
	emit := s.emit
	ready := s.frontendReady
	onToggle := s.onToggle
	s.mu.Unlock()

	// 前端已报到（挂上监听并调过 FrontendReady）就交给它 toggle：它才是播放意图
	// 的真源（见文件顶部的说明），会自己决定是播还是停并把结果同步回后端。
	if emit != nil && ready {
		emit(mediaKeyEvent, map[string]any{"action": mediaKeyToggleAction})
		return
	}

	// 退化到直接操作引擎。两个场景共用这一条：
	//   · 构造方压根没注入 emitter（MediaKeyService 是独立类型，测试就这么用，
	//     见 TestMediaKeyDispatchFallsBackWhenNoFrontend）；
	//   · 前端还没报到 —— 热键已注册、页面还没装配完（N-12 的窗口期）。
	// ★ 判据必须是「前端报到过没有」，不能只看 emit 是否为 nil：生产路径上
	//   emitter 在 Start() 之前就注入好了（main.go 的装配区），只看 emit 的话
	//   窗口期的事件会发出去没人听，而这段兜底永远走不到。
	if onToggle != nil {
		onToggle()
	}
}

// mediaKeyToggleAction 是播放/暂停这个动作的标识（前端据此分支）。
const mediaKeyToggleAction = "toggle"

// Stop 注销热键。可重复调用（用 Once 保护，退出流程里可能被多路径触发）。
func (s *MediaKeyService) Stop() {
	s.stopOnce.Do(func() {
		s.mu.Lock()
		hk := s.hk
		s.hk = nil
		s.started = false
		s.mu.Unlock()
		if hk != nil {
			if err := hk.Unregister(); err != nil {
				log.Printf("[mediakey] 注销媒体键失败：%v", err)
			} else {
				log.Printf("[mediakey] 已释放媒体键")
			}
		}
	})
}

// Status 返回媒体键状态（设置界面/排障用）。
//
// 刻意不导出：目前没有界面在用它，导出只会给前端多一个无用的绑定。
// 需要时把它导出并在设置页展示即可。
func (s *MediaKeyService) status() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return map[string]any{
		"registered": s.started,
		"lastError":  s.lastErr,
		"key":        "MediaPlayPause",
	}
}
