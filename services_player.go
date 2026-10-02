/* ==========================================================================
   services_player.go — 后端原生播放服务
   --------------------------------------------------------------------------
   这是前端与 internal/audioplay 之间的桥。前端不再自己出声，而是把
   「放哪首 / 暂停 / 跳转 / 音量」交给这里，并从事件里拿进度与频谱。

   --------------------------------------------------------------------------
   为什么进度用「锚点 + 前端外推」而不是「每帧推位置」

   最直接的做法是后端定时把 position 推给前端。但那样一来，WebView2 一卡，
   事件就在队列里积压，恢复后前端会看到一串**跳变**的位置 —— 歌词会一顿一顿
   地蹦，比音频本身卡顿还明显。而「界面流畅」正是这次迁移的目标之一。

   所以这里只推「锚点」：{positionMs, atMs, durationMs, playing}，
   其中 atMs 是发出时的单调时钟（performance.now 口径，见 nowMs）。
   前端拿到锚点后自己用 performance.now() 外推：
   显示位置 = positionMs + (now - atMs) * 速率。
   这样即使事件晚到几百毫秒，前端的进度依然是连续推进的，不会跳。

   锚点只在「状态真的变了」或「距离上次锚点超过 anchorIntervalMs」时推，
   所以常态下每秒没几条消息，开销可以忽略。

   --------------------------------------------------------------------------
   频谱为什么由前端拉（Pull）而不是推（Push）

   频谱是 30Hz 的高频数据，推给前端就要走 30 次/秒的 web message 编解码。
   而皮肤只在**播放详情页打开、且该皮肤声明了 spectrum** 时才需要它
   （见 contract.js 的 spectrum 字段）。用拉的方式，前端可以在不需要时
   完全不请求，也不需要后端知道「现在有没有人在看」。
   ========================================================================== */

package main

import (
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"localmusicplayer/internal/audioplay"
	"localmusicplayer/internal/bootstrap"
)

/* --------------------------------------------------------------------------
   事件名（与前端 frontend/src/js/audio.js 对齐）
   -------------------------------------------------------------------------- */

const (
	// playerStateEvent 是播放状态 + 位置锚点。
	// 载荷：{positionMs, durationMs, playing, atMs, reason}
	playerStateEvent = "player:state"

	// playerErrorEvent 播放失败（解码失败 / 文件损坏 / 没取到地址）
	playerErrorEvent = "player:error"

	// playerReadyEvent 声卡已就绪（前端据此决定是否启用后端播放）
	playerReadyEvent = "player:ready"
)

// anchorIntervalMs 是位置锚点的最小推送间隔。
//
// 500ms 是刻意取的折中：前端自己有外推，所以锚点稀疏一点完全不影响流畅度；
// 但也不能太稀，否则外推误差累积（前端用的是 performance.now，
// 与音频时钟有微小漂移）会让歌词与声音逐渐错开。
// 500ms 一次重新对齐，漂移量级在毫秒级，肉耳听不出。
const anchorIntervalMs = 500

// spectrumMaxBands 是单次频谱请求允许的最大段数。
// 与前端 audio.js#spectrum 的上限一致（那里是 1..128）。
const spectrumMaxBands = 128

/* --------------------------------------------------------------------------
   PlayerService
   -------------------------------------------------------------------------- */

// PlayerService 把播放能力暴露给前端。
//
// 线程模型：所有方法都可能被 Wails 的绑定层从任意 goroutine 调用，
// 因此对引擎的复合操作（换歌 = 解析地址 + 转码 + 装载）用 mu 串行化，
// 避免两次快速切歌互相覆盖。
type PlayerService struct {
	engine *audioplay.Engine

	// resolve 把歌曲 id 解析成「可直接喂给引擎的 PCM WAV 路径」。
	// 由 main 注入（它需要 media.Server 的转码缓存 + store 的曲库查询）。
	resolve func(songID string) (path string, durationMs int64, err error)

	// app 用于发事件（由 main 注入，可能与 nil 比较）
	app eventEmitter

	mu sync.Mutex

	// currentSongID 是当前装载的歌曲
	currentSongID string
	// loaded 表示引擎里确实已经装载了这首歌（转码失败时为 false）
	loaded bool
	// playbackRate 恒为 1（预留：后端变速播放）
	playbackRate float64

	// lastAnchorAt 上次推锚点的时刻（nowMs 口径），用于节流
	lastAnchorAt int64
	// lastPlaying 上次推送时的播放状态，状态变化时必须立刻推
	lastPlaying bool

	// userVolume / muted 由前端同步过来，与响度补偿相乘后写进引擎
	userVolume float64
	muted      bool
	// loudnessGainDB 是当前这首歌的响度补偿（dB），由前端算好后同步
	loudnessGainDB float64

	// available 表示声卡是否成功打开。打开失败时前端回退到 <audio> 播放，
	// 保证「后端音频不可用」不会变成「完全没声音」。
	available bool

	// lastErr 记录最近一次失败原因，供设置界面显示
	lastErr string

	// lastFailSong / lastFailMsg 是「同一个失败只广播一次」的抑制键。
	//
	// 为什么需要：解析/装载失败后服务不会进入「已装载」状态，前端若恰好
	// 因为别的原因再发一次 Load（同一首歌），就会再走一遍失败的解析（比如
	// 再跑一次 ffmpeg 转码并再失败一次），每次都会 Emit 一条 player:error。
	// 前端那边已经用 failedSongId 做了闸门，这里再兜一层：事件风暴不该
	// 从后端发起 —— 排查日志时「同一条错误刷了几十遍」会淹没真正有用的行。
	lastFailSong string
	lastFailMsg  string

	// onEOF 播完时的回调（由 main 注入，用于自动切下一首）
	onEOF func()

	// config 提供「跳过首尾静音」与「切歌间隔」这几个开关（由 main 注入）。
	//
	// 为什么不让服务直接持有 *bootstrap.Store：本文件刻意只依赖两个窄接口
	//（resolve 函数与 eventEmitter），测试里可以完全脱离配置层跑。
	// 配置读取失败（比如测试里没注入）时一律按「不跳过、无间隔」处理 ——
	// 那正是加入这个功能之前的默认行为，属于安全兜底。
	config func() bootstrap.Config

	// lastTrim 是最近一次装载实际用的掐点（诊断 / 前端展示「跳过了多少」）。
	lastTrim audioplay.SilenceTrim
}

// eventEmitter 是发事件需要的最小接口。
//
// 刻意不直接用 *application.App：这里抽出一个只有 Emit 的窄接口，
// 既让本文件不依赖整个 application 包（便于测试替身），
// 也把「服务只该发事件、不该操作窗口」这件事写在类型上。
// *application.App 通过下面这个适配器接上来。
type eventEmitter interface {
	Emit(name string, payload any)
}

// eventBridge 把 Wails 的 app.Event（一个 EventManager）适配成 eventEmitter。
//
// 为什么不直接让 *application.App 实现 Emit：它的方法集里没有 Emit
// （发事件要经 app.Event.Emit）。与其改 Wails 的签名，不如在这里加一层薄适配。
type eventBridge struct {
	emit func(name string, payload any)
}

func (b eventBridge) Emit(name string, payload any) {
	if b.emit != nil {
		b.emit(name, payload)
	}
}

// NewPlayerService 构造服务。
// resolve 必须能把歌曲 id 变成引擎可直接播放的 WAV 路径。
func NewPlayerService(resolve func(string) (string, int64, error)) *PlayerService {
	return &PlayerService{
		engine:       audioplay.New(),
		resolve:      resolve,
		userVolume:   1,
		playbackRate: 1,
	}
}

// setConfigProvider 注入配置读取器（同样不导出，理由见 setApp）。
//
// 只读配置、不写配置：这个服务负责的是「按当前开关播这一首」，
// 改开关是设置界面的事。把写入能力挡在外面，就不会出现
// 「播放路径顺手改用户配置」这种很难排查的行为。
func (s *PlayerService) setConfigProvider(fn func() bootstrap.Config) {
	s.mu.Lock()
	s.config = fn
	s.mu.Unlock()
	// 立刻把「切歌间隔」同步给引擎：用户改完设置不必重启，
	// 下一首自动切歌就该按新值停顿。
	if fn != nil && s.engine != nil {
		s.engine.SetTrackGapSeconds(fn().TrackGapSeconds)
	}
}

// cfgLocked 读取当前配置（没注入时返回默认值）。调用方必须持有 s.mu。
//
// 默认值是「不跳过任何静音、间隔按默认秒数」—— 与设置界面首次打开时
// 看到的状态一致，测试里也就不用为每个用例准备一份配置。
func (s *PlayerService) cfgLocked() bootstrap.Config {
	if s.config == nil {
		return *bootstrap.DefaultConfig()
	}
	return s.config()
}

// setApp 注入事件发送器（main 里 app 构造完成后调用）。
//
// 刻意**不导出**：Wails 的绑定生成器会把导出方法一律暴露给前端，
// 而这个方法接收一个 Go 接口值 —— 生成器会为此报
// 「non-empty interface type ... not supported by encoding/json」。
// 它本来就只该由 main 调用，不导出既消除告警，也避免前端误调。
func (s *PlayerService) setApp(app eventEmitter) {
	s.mu.Lock()
	s.app = app
	s.mu.Unlock()
}

// setEOFHandler 注入「播完自动下一首」的回调（同样不导出，理由见 setApp）
func (s *PlayerService) setEOFHandler(fn func()) {
	s.mu.Lock()
	s.onEOF = fn
	s.mu.Unlock()
	if s.engine != nil {
		s.engine.SetEOFHandler(fn)
	}
}

/* --------------------------------------------------------------------------
   启动
   -------------------------------------------------------------------------- */

// Start 打开声卡。失败**不是**致命错误：返回 available=false，
// 前端会退回用 <audio> 播放（见 audio.js 的回退分支）。
func (s *PlayerService) Start() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.engine == nil {
		return false
	}
	if err := s.engine.Open(); err != nil {
		s.lastErr = err.Error()
		s.available = false
		log.Printf("[player] 后端音频不可用，前端将回退到 <audio>：%v", err)
		s.emitLocked(playerReadyEvent, map[string]any{
			"available": false,
			"reason":    err.Error(),
		})
		return false
	}
	s.available = true
	s.lastErr = ""
	log.Printf("[player] 后端原生音频已就绪（%d Hz / %d ch）",
		audioplay.SampleRate, audioplay.Channels)
	s.emitLocked(playerReadyEvent, map[string]any{"available": true})
	return true
}

// Stop 关闭声卡（退出时调用）
func (s *PlayerService) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.engine != nil {
		s.engine.Close()
	}
}

/* --------------------------------------------------------------------------
   暴露给前端的方法（Wails 绑定）
   -------------------------------------------------------------------------- */

// Available 报告后端音频是否可用。前端在启动时调一次，
// 决定走「后端播放」还是「回退到 <audio>」。
func (s *PlayerService) Available() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return map[string]any{
		"available":  s.available,
		"reason":     s.lastErr,
		"sampleRate": audioplay.SampleRate,
		"channels":   audioplay.Channels,
	}
}

// Load 装载一首歌并（按 state 里的播放意图）开始播放。
//
// 这个方法会**阻塞**到歌曲可以起播为止（需要转码时可能几秒）。
// 前端应当把它当作「切歌」来用，并在此期间显示加载态。
func (s *PlayerService) Load(songID string) (map[string]any, error) {
	if songID == "" {
		return nil, fmt.Errorf("歌曲 id 为空")
	}

	// 解析放在锁外：转码可能耗时数秒，不能卡住其他调用（比如 Stop）
	path, durationMs, err := s.resolve(songID)
	if err != nil {
		s.fail(songID, err)
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.available || s.engine == nil {
		return nil, fmt.Errorf("后端音频不可用")
	}

	// 换歌前记录：竞态下如果已经切到别的歌了，就别覆盖状态
	//
	// 增益与音频在同一个 Load 里一起换（见 audioplay.Engine.Load 的说明）：
	// 如果先 Load 再 SetGain，两者之间会插进至少一个音频回调，那个缓冲就会
	// 用**上一首**的增益放出来。上一首若被明显压低（很响的歌），那一段就是
	// 一次爆响 —— 也就是用户报的「切歌瞬间上一首突然变响」。
	//
	// 这里传 0 dB 而不是 composeGainLocked()：进入 Load 时 s.loudnessGainDB
	// 记的还是**上一首**的补偿（换歌后前端才会把新歌的推过来），拿它去配新歌
	// 就是张冠李戴。新歌没测过时它的补偿本来就是 0，所以「不补偿」既是最安全
	// 的起点，也是未测量时的正确值；前端在装载返回后会立刻推真实补偿。
	s.loudnessGainDB = 0
	trim := s.planTrimLocked(path)
	if err := s.engine.Load(path, trim.StartFrame, trim.EndFrame, s.composeGainLocked()); err != nil {
		s.lastErr = err.Error()
		s.mu.Unlock()
		s.fail(songID, err)
		s.mu.Lock()
		return nil, err
	}
	// 掐点方案要在装载成功之后才记账：失败时它属于上一首，
	// 记下来会让诊断信息指向一个根本没播成的区间。
	s.lastTrim = trim

	s.currentSongID = songID
	s.loaded = true
	s.lastErr = ""
	// 装载成功：清掉失败抑制键，让这首歌下次真出问题还能正常报出来
	s.lastFailSong = ""
	s.lastFailMsg = ""
	// 换歌后立刻对齐增益（响度补偿是按歌算的，上一首的值要作废）
	s.applyGainLocked()
	// 位置回到 0，强制下一次推送不被节流吃掉
	s.lastAnchorAt = 0

	posMs, durMs := s.engine.Position()
	if durationMs > 0 && durMs == 0 {
		durMs = durationMs
	}
	return map[string]any{
		"positionMs": posMs,
		"durationMs": durMs,
		// 跳过静音的实况：前端据此显示「跳过了多少」，
		// 也让用户在排查「开头怎么直接就是音乐」时有据可查。
		//
		// 注意 durationMs 仍是**整首歌**（见 planTrimLocked 的说明）——
		// 跳过静音不会让这首歌变短。
		"skippedHeadMs": trim.SkippedHeadMs,
		"skippedTailMs": trim.SkippedTailMs,
	}, nil
}

// planTrimLocked 按当前开关算出这首歌「要自动跳过哪一段」。
//
// 调用方必须持有 s.mu（读的是 s.config）。
//
// ★ 返回的是**会播放的区间**，不是「这首歌的长度」。
//
// 「跳过静音」的语义是**自动跳过**，不是把歌变短：
//
//	一首 4:12 的歌，开头 3 秒静音、结尾 20 秒静音，两个开关都开 ——
//	 · 时长仍然是 4:12（engine.Position 的分母恒为整个文件）；
//	 · 起播瞬间位置落到 3 秒处（用户听到的第一声就是音乐）；
//	 · 位置走到 3:52 就结束并切下一首（不去听那 20 秒空白）。
//
// 为什么不能把时长也改成「跳完之后」：歌词按原曲时间轴打轴，
// 位置一旦从 0 重新起算就会**整体提前**（开头静音多长就偏多少）；
// 「保留歌曲播放进度」存的位置同样会对不上。
//
// 这里刻意**不把检测失败当成错误**：它是「锦上添花」，
// 读不了文件（文件被删、权限不足）时应当退回「原样播放」，
// 而不是让一首本来能播的歌变成播不了 —— 那才是真正糟糕的结果。
// 读不了的原因会记进日志，便于排查。
func (s *PlayerService) planTrimLocked(path string) audioplay.SilenceTrim {
	cfg := s.cfgLocked()

	// 两个开关都关：短路，不去扫文件（省掉一次整段读取，装载更快）。
	//
	// 注意间隔与跳过静音是**两个独立设置**：「不跳过静音」不代表
	// 「不留间隔」，所以间隔照样同步给引擎。
	s.engine.SetTrackGapSeconds(cfg.TrackGapSeconds)
	if !cfg.SkipSilenceHead && !cfg.SkipSilenceTail {
		// StartFrame / EndFrame 都是 0 = 「从头播到文件末尾」，
		// 与加入这个功能之前的行为逐字一致。
		return audioplay.SilenceTrim{StartFrame: 0, EndFrame: 0}
	}

	info, err := audioplay.LoadSilenceInfo(path)
	if err != nil {
		log.Printf("[player] 静音检测失败，本首按原样播放：%v", err)
		return audioplay.SilenceTrim{StartFrame: 0, EndFrame: 0}
	}

	trim := audioplay.PlanSilenceTrim(info, cfg.SkipSilenceHead, cfg.SkipSilenceTail)
	if !trim.Playing() {
		// 掐完什么都不剩（整首歌都是静音，或头尾静音盖住了全部内容）。
		// 退回「不掐」：放一段静音至少是「有反应」，
		// 而零长度区间会让进度条与位置计算全部失效。
		log.Printf("[player] 掐完首尾静音后没有可播放内容，本首按原样播放（总长 %dms）",
			info.TotalFrames*1000/audioplay.SampleRate)
		return audioplay.SilenceTrim{StartFrame: 0, EndFrame: 0, TotalFrames: info.TotalFrames}
	}
	return trim
}

// Play 开始播放（不换歌）
func (s *PlayerService) Play() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.engine != nil && s.loaded {
		s.engine.Play()
		s.pushAnchorLocked("play")
	}
	return s.stateLocked()
}

// Pause 暂停
func (s *PlayerService) Pause() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.engine != nil {
		s.engine.Pause()
		s.pushAnchorLocked("pause")
	}
	return s.stateLocked()
}

// Playing 报告引擎当前是否在出声。
//
// 给媒体键的退化路径用：前端还没挂上监听时，按键直接在这里做「在放就停、
// 停了就放」的翻转，至少不让按键静默丢掉。
//
// 注意它问的是**引擎**而不是前端 store 的播放意图 —— 两者在切歌途中
// 会短暂不一致（后端还要把环形缓冲里的旧音频吐完）。对「退化的兜底行为」
// 而言，引擎的真实状态才是该依据的那个。
func (s *PlayerService) Playing() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.engine == nil {
		return false
	}
	return s.engine.Playing()
}

// Seek 跳到指定毫秒。会做范围钳制，非法值不会让播放错乱。
func (s *PlayerService) Seek(positionMs float64) (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.engine == nil || !s.loaded {
		return s.stateLocked(), nil
	}
	// seek 是明确的即时意图：把可能还挂着的切歌间隔取消掉。
	// 否则用户在间隔里拖了进度条，间隔走完还是会把歌切走。
	s.engine.CancelTrackGap()
	_, durMs := s.engine.Position()
	ms := int64(positionMs)
	if ms < 0 {
		ms = 0
	}
	if durMs > 0 && ms > durMs {
		ms = durMs
	}
	frame := ms * audioplay.SampleRate / 1000
	if err := s.engine.SeekToFrame(frame); err != nil {
		s.lastErr = err.Error()
		return nil, err
	}
	// seek 是「位置突变」，必须立刻推一个锚点，
	// 否则前端会在旧的锚点上继续外推，进度条会先弹回旧位置再跳过来。
	s.pushAnchorLocked("seek")
	return s.stateLocked(), nil
}

// Unload 停止播放并卸载当前歌曲（前端清空播放队列 / 停止时调用）
func (s *PlayerService) Unload() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.engine != nil {
		// 先取消可能还挂着的切歌间隔，再暂停：
		// 顺序反过来的话，间隔走完的回调会把「已经停掉的播放器」又推到下一首。
		s.engine.CancelTrackGap()
		s.engine.Pause()
	}
	s.loaded = false
	s.currentSongID = ""
	s.pushAnchorLocked("stop")
	return s.stateLocked()
}

// SetPlaybackOptions 同步「跳过静音」与「切歌间隔」这几个播放选项。
//
// 它是设置界面改完开关后**立刻**调用的：跳过静音要影响的是「下一首」，
// 而切歌间隔可能正好在等 —— 所以间隔在这里就地重建，用户改完不必重启。
//
// 参数用显式的三个值而不是一个结构体：Wails 的绑定生成器对匿名结构体、
// map 之外的自定义类型支持都不好（见 setApp 里关于 non-empty interface 的说明），
// 三个标量参数是最省事也最不容易出错的形式。
//
// enabled=false 时把两个跳过开关一起关掉，用于「恢复默认」这类场景。
func (s *PlayerService) SetPlaybackOptions(skipSilenceHead, skipSilenceTail bool, trackGapSeconds float64) map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	// 间隔的取值范围在这里也钳一次：前端可能推来非法值（手改配置、
	// 旧版本前端），而引擎拿到负数会算出「往回等」的荒谬行为。
	gap := bootstrap.NormalizeTrackGapSeconds(trackGapSeconds)
	if s.engine != nil {
		s.engine.SetTrackGapSeconds(gap)
	}
	return map[string]any{
		"skipSilenceHead": skipSilenceHead,
		"skipSilenceTail": skipSilenceTail,
		"trackGapSeconds": gap,
	}
}

// SetVolume 同步用户音量（0..1）与静音状态。
// 真正的增益 = 用户音量 × 响度补偿，在 applyGainLocked 里合成。
func (s *PlayerService) SetVolume(volume float64, muted bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if volume < 0 {
		volume = 0
	}
	if volume > 1 {
		volume = 1
	}
	s.userVolume = volume
	s.muted = muted
	s.applyGainLocked()
}

// SetLoudnessGain 同步当前歌曲的响度补偿（dB）。
// 前端算好（或从后端响度服务取到）后通过这里下发，避免后端重复一套响度逻辑。
func (s *PlayerService) SetLoudnessGain(gainDB float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// 与前端 audio.js#computeGain 的钳位保持一致（±24dB）
	if gainDB > 24 {
		gainDB = 24
	}
	if gainDB < -24 {
		gainDB = -24
	}
	s.loudnessGainDB = gainDB
	s.applyGainLocked()
}

// State 返回当前播放状态 + 位置锚点。
// 前端在挂载、从后台恢复、或怀疑自己漂移时调一次重新对齐。
func (s *PlayerService) State() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stateLocked()
}

// Spectrum 返回当前频谱（0..1 的数组）。拿不到时 bands 为 nil。
//
// bands 参数是皮肤声明的段数（见 contract.js 的 spectrum 字段）。
// 越界会被钳到 1..128，与前端 audio.js#spectrum 的口径一致。
func (s *PlayerService) Spectrum(bands int) map[string]any {
	if bands <= 0 {
		bands = audioplay.DefaultBands
	}
	if bands > spectrumMaxBands {
		bands = spectrumMaxBands
	}
	if s.engine == nil {
		return map[string]any{"bands": nil}
	}
	data := s.engine.Spectrum(bands)
	if data == nil {
		return map[string]any{"bands": nil}
	}
	// 转成普通 float 切片：Wails 的绑定层要 JSON 序列化，
	// 而引擎返回的是内部复用的切片（下次调用会被覆盖），必须拷一份出去。
	out := make([]float64, len(data))
	for i, v := range data {
		// 两位小数与前端一致（audio.js 推 spectrum 补丁时也是两位）
		out[i] = float64(int(v*100+0.5)) / 100
	}
	return map[string]any{"bands": out}
}

// Diagnostics 返回引擎诊断信息（供设置界面排查「声音断续」）
func (s *PlayerService) Diagnostics() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]any{
		"available":    s.available,
		"loaded":       s.loaded,
		"songId":       s.currentSongID,
		"lastError":    s.lastErr,
		"sampleRate":   audioplay.SampleRate,
		"channels":     audioplay.Channels,
		"userVolume":   s.userVolume,
		"muted":        s.muted,
		"loudnessDB":   s.loudnessGainDB,
		"periodFrames": audioplay.PeriodFrames,
		// 跳过静音的实况：排查「开头/结尾怎么少了几秒」时看这几项。
		//
		// skipped*Ms = 自动跳过的那两段有多长；
		// trimStartMs = 实际从原曲的哪个位置开始出声（开了跳过开头时不是 0）。
		// 时长**不在这里**：它恒为整首歌（进度条要覆盖全曲）。
		"skippedHeadMs": s.lastTrim.SkippedHeadMs,
		"skippedTailMs": s.lastTrim.SkippedTailMs,
		"trimStartMs":   s.lastTrim.StartFrame * 1000 / audioplay.SampleRate,
		"trimEndMs":     s.lastTrim.EndFrame * 1000 / audioplay.SampleRate,
	}
	if s.engine != nil {
		out["playing"] = s.engine.Playing()
		out["underruns"] = s.engine.Underruns()
		out["bufferedMs"] = s.engine.Buffered()
		out["eof"] = s.engine.EOF()
		// 切歌间隔：用户报「切歌时停了一下」时可以在这里确认是不是间隔在起作用
		out["trackGapSeconds"] = s.engine.GapSeconds()
		out["trackGapActive"] = s.engine.TrackGapActive()
	}
	return out
}

// Tick 由后端的定时器周期调用：负责在「没有状态变化但位置在走」时补推锚点。
//
// 为什么需要它：锚点只靠前端调 Play/Pause/Seek 时推是不够的 ——
// 播放过程中没有任何一个 API 会被调用，前端却需要持续重新对齐。
// 由后端主动节流推送，前端就不必轮询。
func (s *PlayerService) Tick() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.loaded || s.engine == nil || !s.engine.Playing() {
		return
	}
	s.pushAnchorLocked("tick")
}

/* --------------------------------------------------------------------------
   内部
   -------------------------------------------------------------------------- */

// applyGainLocked 把「用户音量 × 响度补偿」合成为线性增益写进引擎。
// 调用方必须持有 s.mu。
func (s *PlayerService) applyGainLocked() {
	if s.engine == nil {
		return
	}
	s.engine.SetGain(s.composeGainLocked())
}

// composeGainLocked 算出「用户音量 × 响度补偿」的线性增益，不改引擎状态。
// 调用方必须持有 s.mu。
//
// 单独抽出来是为了给换歌用：换歌时要**先**算出新歌该用的增益，再和音频
// 一起装进引擎（见 Load），不能在装载后再算 —— 那中间的回调窗口会用错增益。
func (s *PlayerService) composeGainLocked() float64 {
	if s.engine == nil {
		return 0
	}
	vol := s.userVolume
	if s.muted {
		vol = 0
	}
	// 与前端 audio.js#targetGain 同一算法：线性 = 10^(dB/20)
	linear := math.Pow(10, s.loudnessGainDB/20)
	return vol * linear
}

// stateLocked 组装状态快照。调用方必须持有 s.mu。
func (s *PlayerService) stateLocked() map[string]any {
	out := map[string]any{
		"available": s.available,
		"loaded":    s.loaded,
		"songId":    s.currentSongID,
		"playing":   false,
		"atMs":      nowMs(),
	}
	if s.engine != nil {
		posMs, durMs := s.engine.Position()
		out["positionMs"] = posMs
		out["durationMs"] = durMs
		out["playing"] = s.engine.Playing()
	}
	return out
}

// pushAnchorLocked 按节流规则推一个位置锚点。调用方必须持有 s.mu。
//
// reason 只是给排查用的（play/pause/seek/stop/tick），前端不依赖它。
func (s *PlayerService) pushAnchorLocked(reason string) {
	now := nowMs()
	playing := false
	posMs, durMs := int64(0), int64(0)
	if s.engine != nil {
		posMs, durMs = s.engine.Position()
		playing = s.engine.Playing()
	}

	// 状态变化（尤其 play↔pause）必须立刻推，否则前端会继续按「在播」外推，
	// 暂停后进度条还会自己往前走一小段。
	//
	// 另外三种是「位置突变」，状态没变也必须推：
	//   · seek —— 不推的话前端会在旧锚点上继续外推，进度条先弹回旧位置再跳过来；
	//   · stop —— 要把位置归零；
	//   · load —— 换歌后位置重置到 0。
	// 只有 tick（纯时间推进）才吃节流。
	stateChanged := playing != s.lastPlaying
	if !stateChanged && reason == "tick" && now-s.lastAnchorAt < anchorIntervalMs {
		return
	}

	s.lastAnchorAt = now
	s.lastPlaying = playing
	s.emitLocked(playerStateEvent, map[string]any{
		"positionMs": posMs,
		"durationMs": durMs,
		"playing":    playing,
		"atMs":       now,
		"songId":     s.currentSongID,
		"reason":     reason,
	})
}

func (s *PlayerService) emitLocked(name string, payload any) {
	if s.app == nil {
		return
	}
	s.app.Emit(name, payload)
}

// fail 记录并广播一次播放失败。失败不改变 available（声卡本身是好的）。
//
// 同一首歌的同一个原因只会广播**一次**：重复的失败报告对用户没有任何新信息，
// 而前端每个 tick 都可能重新尝试装载（见 services_player.go 里 lastFailSong
// 的说明）。成功装载会清掉抑制键，所以「修好文件后再试」仍然能收到通知。
func (s *PlayerService) fail(songID string, err error) {
	msg := err.Error()

	s.mu.Lock()
	s.lastErr = msg
	// 命中抑制键：只记日志，不再广播
	if songID != "" && songID == s.lastFailSong && msg == s.lastFailMsg {
		s.mu.Unlock()
		log.Printf("[player] 重复的播放失败（已抑制广播）：%s —— %s", songID, msg)
		return
	}
	s.lastFailSong = songID
	s.lastFailMsg = msg
	app := s.app
	s.mu.Unlock()

	if app != nil {
		app.Emit(playerErrorEvent, map[string]any{
			"songId": songID,
			"reason": msg,
		})
	}
}

/* --------------------------------------------------------------------------
   时间基准
   --------------------------------------------------------------------------
   锚点里的 atMs 必须与前端 performance.now() 同口径，前端才能正确外推。
   两者都是「自某个起点起的毫秒数」，起点不同没关系 —— 前端只用
   (now - atMs) 这个差值，所以只要单位一致、单调递增即可。
   time.Since 基于单调时钟，不受系统时间被调整影响。
   -------------------------------------------------------------------------- */

var timeBase = time.Now()

// nowMs 返回自本进程启动起经过的毫秒数（单调）
func nowMs() int64 {
	return time.Since(timeBase).Milliseconds()
}

// songDurationMs 从歌曲元数据里取时长（取不到返回 0）
func songDurationMs(song bootstrap.Song) int64 {
	return song.Duration
}
