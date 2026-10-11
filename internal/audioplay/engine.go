/* ==========================================================================
   audioplay — 后端原生音频播放引擎
   --------------------------------------------------------------------------
   为什么要有这个包：

   原来音频由前端的 <audio> 元素出声，音频解码与输出跑在 WebView2 的渲染
   进程里。WebView2 一卡（主线程被渲染占满、GPU 进程抖动），音频线程就拿不到
   时间片，听感上就是「卡顿 / 沙哑」。而且音是从 WebView2 进程出来的，
   Windows 音量合成器里显示的是 webview2 而不是本程序，没法单独调音量。

   把「解码 + 输出」搬到 Go 进程之后：
     · 音频由独立的高优先级线程驱动，网页再卡也不影响出声；
     · 音量合成器里显示的是本程序（图标、名称都对得上）。

   --------------------------------------------------------------------------
   数据流

     ffmpeg (s16le PCM) → feeder goroutine → ring buffer → malgo 回调 → 声卡
                                                   ↓
                                             Analyzer（频谱）

   解码复用 internal/ffmpeg：它已经把任意格式转成 16bit/44.1kHz/立体声 PCM，
   并落到转码缓存里（600MB LRU）。本包只负责「把 PCM 按时喂给声卡」。

   --------------------------------------------------------------------------
   为什么走「落盘 WAV」而不是「管道流式解码」

   转码缓存是现成的、已经过测试的（internal/media）。流式管道要自己处理
   ffmpeg 进程的生命周期、seek 时的重启、以及 EOF 判定，出错面大得多。
   代价是首次播放一首未缓存的歌要等转码完成 —— 这由上层用「先返回时长、
   后起播」的方式掩盖（见 PlayerService）。命中缓存时是零等待的。
   ========================================================================== */

package audioplay

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gen2brain/malgo"
)

/* --------------------------------------------------------------------------
   常量
   -------------------------------------------------------------------------- */

const (
	// SampleRate / Channels / BytesPerSample 必须与 internal/ffmpeg 的
	// 转码输出参数一致（44100 / 2 / 16bit）。本包按此固定布局解析 PCM，
	// 换参数会整体错位，所以刻意写成常量而不是从外部传进来。
	SampleRate     = 44100
	Channels       = 2
	BytesPerSample = 2
	FrameSize      = Channels * BytesPerSample // 一帧（立体声 16bit）= 4 字节

	// PeriodFrames 是每次回调交给声卡的帧数。
	//
	// 1024 帧 @44.1kHz ≈ 23ms 的缓冲。取值要平衡两件事：
	//   · 太小 → 回调太频繁，Go 的调度抖动会直接变成爆音；
	//   · 太大 → seek / 暂停的响应变迟钝。
	// 23ms 是两者之间比较稳的点（实测在 Windows/malgo 上不爆）。
	PeriodFrames = 1024

	// ringFrames 是环形缓冲的容量（帧数）。
	//
	// 约 3 秒。存在的意义是「解耦」：feeder 从磁盘读、回调往声卡写，
	// 两者速度不会完全相等，缓冲太小吃不开抖动就会断续。
	// 上限设 3 秒是因为 seek 时要丢弃积压的数据 —— 积压越多，
	// seek 后听到旧内容的时间越长。
	ringFrames = SampleRate * 3
)

/* --------------------------------------------------------------------------
   环形缓冲（单生产者单消费者）
   --------------------------------------------------------------------------
   feeder 只写、音频回调只读。用 mutex 而不是 lock-free：
   临界区只有一次 memcpy，锁竞争在「每 23ms 一次」的频率下完全可以忽略，
   而自己写无锁环形缓冲在溢出/回绕边界上很容易出错。
   -------------------------------------------------------------------------- */

type ringBuffer struct {
	mu   sync.Mutex
	data []byte
	// rd/wr 是**帧**下标（不是字节），回绕时对 capFrames 取模。
	// 刻意不叫 read/write：那会和方法名冲突（Go 里字段与方法共享同一命名空间）。
	rd    int
	wr    int
	count int // 当前可读帧数
	// closed 表示生产者已经结束（文件读完），回调据此判断「播完了」
	closed bool
}

func newRingBuffer(frames int) *ringBuffer {
	return &ringBuffer{data: make([]byte, frames*FrameSize)}
}

func (r *ringBuffer) capFrames() int { return len(r.data) / FrameSize }

// write 把 pcm 追加进缓冲，返回实际写入的帧数（空间不足时部分写入）。
// 调用方据返回值决定是否要等待 —— 不在这里阻塞，避免把喂数据的
// goroutine 和音频线程的锁耦合成「谁等谁」。
func (r *ringBuffer) write(pcm []byte) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	n := len(pcm) / FrameSize
	if n == 0 {
		return 0
	}
	free := r.capFrames() - r.count
	if n > free {
		n = free
	}
	if n == 0 {
		return 0
	}

	// 分两段拷贝处理回绕
	first := n
	if r.wr+first > r.capFrames() {
		first = r.capFrames() - r.wr
	}
	copy(r.data[r.wr*FrameSize:], pcm[:first*FrameSize])
	if rest := n - first; rest > 0 {
		copy(r.data, pcm[first*FrameSize:(first+rest)*FrameSize])
	}
	r.wr = (r.wr + n) % r.capFrames()
	r.count += n
	return n
}

// read 读走 out 所需的数据；不足时**补静音**并把 returnFrames 报告为实际
// 读到的帧数。补静音是必须的：音频回调必须总是填满缓冲区，返回短缓冲
// 在 WASAPI 下会造成重复播放上一段（听起来像卡带）。
func (r *ringBuffer) read(out []byte) (frames int, underrun bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	want := len(out) / FrameSize
	if r.count < want {
		underrun = true
	}
	n := want
	if n > r.count {
		n = r.count
	}
	if n > 0 {
		first := n
		if r.rd+first > r.capFrames() {
			first = r.capFrames() - r.rd
		}
		copy(out, r.data[r.rd*FrameSize:(r.rd+first)*FrameSize])
		if rest := n - first; rest > 0 {
			copy(out[first*FrameSize:], r.data[:(rest)*FrameSize])
		}
		r.rd = (r.rd + n) % r.capFrames()
		r.count -= n
	}
	// 不足的部分补静音（既不重复上一段，也不留脏数据）
	if n < want {
		for i := n * FrameSize; i < len(out); i++ {
			out[i] = 0
		}
	}
	return n, underrun
}

// reset 丢掉所有已缓冲数据（seek / 换歌时用）
func (r *ringBuffer) reset() {
	r.mu.Lock()
	r.rd, r.wr, r.count = 0, 0, 0
	r.mu.Unlock()
}

func (r *ringBuffer) setClosed(v bool) {
	r.mu.Lock()
	r.closed = v
	r.mu.Unlock()
}

// state 一次性取回「可读帧数 + 是否已结束」，供回调做 EOF 判定。
// 分两次加锁会让「读空」和「已结束」之间出现竞争窗口。
func (r *ringBuffer) state() (count int, closed bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.count, r.closed
}

func (r *ringBuffer) buffered() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.count
}

/* --------------------------------------------------------------------------
   增益（音量 × 响度补偿）
   --------------------------------------------------------------------------
   前端原来用 GainNode.setTargetAtTime(value, now, 0.015) 做平滑。
   搬到后端后不能直接改增益值 —— 波形上出现阶跃就是「咔」的一声爆音。
   这里用同样的时间常数做线性插值，逐帧逼近目标值。
   -------------------------------------------------------------------------- */

// gainRampTime 与前端 setTargetAtTime 的 0.015s 时间常数对齐，手感一致。
const gainRampTime = 15 * time.Millisecond

type gainState struct {
	mu      sync.Mutex
	current float64
	target  float64
}

func (g *gainState) set(target float64) {
	// 目标值先钳到合法范围：负增益在数学上会让波形反相并放大，
	// 是比「静音」更糟的结果，必须在入口就挡住。
	if target < 0 {
		target = 0
	}
	g.mu.Lock()
	g.target = target
	g.mu.Unlock()
}

// setHard 直接把 current 与 target 一起设成目标值，**不做斜坡**。
//
// 只用于「换歌」这一种场景：那时环形缓冲刚被 reset，下一个回调读到的是新歌
// 的第一个样本，波形上本来就没有连续性可言 —— 此时插值毫无意义，反而会让
// 新歌开头带上一小段上一首的增益（15ms 的斜坡）。
//
// 反过来，**绝不能**用它来实现普通音量变化（拖动音量条 / 静音）：那里波形是
// 连续的，硬切就是一个阶跃，听感是「咔」。那种场景必须走 set + 斜坡。
func (g *gainState) setHard(target float64) {
	if target < 0 {
		target = 0
	}
	g.mu.Lock()
	g.current = target
	g.target = target
	g.mu.Unlock()
}

// valueFor 返回「本缓冲处理完毕后」的增益，并把 current 推进过去。
//
// 与 value 的区别：这里一次前进 stepFrames 帧，而且要配合
// applyGainRampS16 做**缓冲内**插值 —— 一次回调要覆盖 23ms 的音频，
// 如果整块用同一个增益值，那么每次音量变化在波形上仍然是一个阶跃
// （只是台阶变少了），拖动音量条时依然会听到细碎的「咔」声。
func (g *gainState) valueFor(stepFrames int) float64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.current == g.target {
		return g.current
	}
	perFrame := 1.0 / (float64(SampleRate) * gainRampTime.Seconds())
	maxStep := perFrame * float64(stepFrames)
	delta := g.target - g.current
	if delta > maxStep {
		g.current += maxStep
	} else if delta < -maxStep {
		g.current -= maxStep
	} else {
		g.current = g.target
	}
	return g.current
}

// currentValue 只读当前增益，不推进斜坡。
// 给「缓冲内插值」用：需要知道本次缓冲的起点增益。
func (g *gainState) currentValue() float64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.current
}

// applyGain 就地把「本缓冲的增益斜坡」套用到 s16 数据上：从当前增益
// 线性过渡到本缓冲结束时该有的增益。
//
// ★ 这个方法存在的唯一理由，就是让「先取起点、再推进斜坡」这个顺序
// 无法被写反 —— 它以前是回调里的三行裸代码：
//
//	applyGainRampS16(buf, e.gain.currentValue(), e.gain.valueFor(n))
//
// Go 的实参求值顺序是从左到右，看起来没问题；但 valueFor **会推进并返回**
// current，而 currentValue 读的也是同一个 current。一旦哪个环节把顺序调一下
// （或者有人「顺手」把 currentValue() 挪到后面做日志/调试），两个实参就是
// 同一个数，斜坡退化成阶跃 —— 而单元测试全绿，因为
// applyGainRampS16 本身是对的，valueFor 也是对的，错的是**组装**。
//
// 收进这里之后，「块内必须是插值而不是阶跃」这条性质可以直接被测
// （见 TestGainApplyGainInterpolatesWithinBuffer）。
func (g *gainState) applyGain(buf []byte, stepFrames int) {
	from := g.currentValue() // 必须先取起点：valueFor 会把它推进到终点
	to := g.valueFor(stepFrames)
	applyGainRampS16(buf, from, to)
}

// targetValue 只读增益**目标值**（不推进斜坡）。
//
// 存在的意义是「可观测性」：合成后的增益是「用户音量 × 响度补偿」的结果，
// 出了音量问题（比如静音没生效、补偿没套上）时，唯一能直接确认合成结果
// 的就是这个值。上层的诊断接口与测试都用它，不必去猜 current 走到哪了。
func (g *gainState) targetValue() float64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.target
}

/* --------------------------------------------------------------------------
   引擎
   -------------------------------------------------------------------------- */

// ErrNotReady 表示引擎尚未启动（声卡没打开）
var ErrNotReady = errors.New("音频引擎尚未启动")

// Engine 是后端的音频播放引擎。
//
// 生命周期：Open() 启动声卡并以静音持续输出（不播放时也只是喂静音，
// 这样设备常开、切歌零延迟）；Close() 释放设备。
//
// 并发约定：Load / Play / Pause / Seek / SetGain 可以从任意 goroutine 调用；
// 内部用 mu 串行化「换源」这类复合操作。
type Engine struct {
	mu sync.Mutex

	ctx     *malgo.AllocatedContext
	device  *malgo.Device
	started bool

	ring *ringBuffer
	gain gainState

	// analyzer 在音频线程里被写入，由前端轮询读取 —— 内部自带锁
	analyzer *Analyzer

	// effects 是音效链（均衡器 + 空间处理 + 混响，见 effects.go）。
	//
	// ★ 并发的处理方式与 gain / analyzer 都不同，值得单独说明：
	//
	// 音效切换涉及"换掉整条链的参数"，而这个动作**必须**发生在音频样本
	// 边界上（否则会爆音）。所以这里不让控制线程直接改 Chain，而是：
	//   1. 控制线程写 effectPreset（一个原子变量，见 SetEffect）；
	//   2. 音频回调每次进来先读它，变了就调 Chain.RequestPreset；
	//   3. Chain 自己在缓冲边界执行切换 + 交叉淡化。
	//
	// 为什么不复用 e.mu：音频回调**绝对不能**拿一把可能被控制线程长期
	// 持有的锁（Load 会持锁跑几秒的转码等待）。gainState 用的是同样的
	// 思路 —— 不过那里只需要一个数字，用普通赋值 + 内存序就够；
	// 这里要传的是一个档位字符串，必须用 atomic.Value 或 atomic.Pointer。
	effects Chain

	// effectPreset 是"控制线程请求的档位"。由原子指针持有，
	// 保证音频线程读到的是一个完整、不可变的字符串值。
	effectPreset atomic.Pointer[EffectPreset]

	// monoScratch 是 feedAnalyzer 的复用缓冲（避免在音频线程上分配）
	monoScratch []float64

	// file 是当前喂给声卡的 PCM 文件（WAV，44 字节头已跳过）
	file    *os.File
	pcmSize int64 // 去掉头之后的 PCM 字节数

	// endFrame 是「播到这里就算结束」的帧下标（不含）。
	//
	// 它存在的唯一目的是「跳过尾部静音」：设成掐掉尾巴之后的位置，
	// 播放位置一走到它就按播完处理，不再等文件真正读空。
	// 0 表示没有设限（原样播到文件末尾）。为什么用 0 而不是 pcmSize：
	// pcmSize 要等到 Load 里 stat 完才知道，而 Load 之前的零值状态
	// 用一个哨兵表示「没限制」比到处判 pcmSize 更不容易写错。
	endFrame int64

	// trimStart 是本次装载的起播帧（跳过开头静音之后的位置）。
	//
	// 它与 positionFrame 的区别是：positionFrame 会随播放推进、也会被 seek 改，
	// 而它是「这首歌是从哪儿开始的」这个事实，全程不变。
	// 进度条的时间基准要用它 —— 否则 seek 之后 0 点会跟着漂。
	// 由 posMu 保护（与 positionFrame / endFrame 同一把锁）。
	trimStart int64

	// gap 是「上一首播完到下一首起播」的间隔调度器（见 silence.go）。
	// 没配置间隔时它的 Arm 返回 false，引擎立刻触发 EOF 回调（与历史行为一致）。
	gap *GapScheduler

	// stopFeed 用于让当前 feeder goroutine 退出（换歌 / seek / 关闭时）
	stopFeed chan struct{}
	feedDone chan struct{}

	// playing 是用户意图（不是声卡状态）：false 时回调输出静音但仍推进文件位置吗？
	// 不推进 —— 暂停就停在原地，恢复时从同一帧继续。
	playing bool

	// eof 记录「文件已读到结尾且缓冲已放空」，供上层触发自动下一首
	eof bool

	// positionFrames 是**已经消费**的帧数（从文件起点算），用于报告播放位置。
	// 只有回调线程推进它，读取时加锁。
	posMu         sync.Mutex
	positionFrame int64

	// underruns 统计（诊断用）
	underruns int64

	// onEOF 播完时的回调（由上层设置，用于自动切歌）
	onEOF func()
}

// New 创建一个未启动的引擎
func New() *Engine {
	e := &Engine{
		ring:     newRingBuffer(ringFrames),
		analyzer: NewAnalyzer(DefaultFFTSize),
		gain:     gainState{current: 1, target: 1},
		gap:      NewGapScheduler(),
	}
	// 音效档位默认 off。必须先存一个值：音频回调会 load 它，
	// 而 atomic.Pointer 的零值是 nil（解引用会 panic）。
	off := EffectOff
	e.effectPreset.Store(&off)
	return e
}

// SetEffect 设置音效档位。可以从任意 goroutine 调用。
//
// 返回是否发生了实际变化（相同档位是 no-op）。
//
// ★ 它**不**直接改音效链，只把请求记进一个原子变量；
// 真正的切换由音频回调在下一次进入时执行（见 Engine.effects 的说明）。
// 这样做的代价是切换最多晚一个缓冲周期（23ms）生效 —— 用户不可感知；
// 换来的是"参数永远在样本边界上原子生效"，不需要在音频线程上加锁。
func (e *Engine) SetEffect(preset EffectPreset) bool {
	// 与当前请求相同 → 不需要写
	if cur := e.effectPreset.Load(); cur != nil && *cur == preset {
		return false
	}
	// 用局部变量取地址：escape analysis 会把它放到堆上，
	// 每次调用一次小分配。这个路径只在用户改设置时走（不是热路径），
	// 用一次分配换"读到一个完整不可变的值"是完全值得的 ——
	// 反过来（存进 Engine 的字段再取地址）会让多个调用方共享同一块内存，
	// 那就又变成数据竞争了。
	p := preset
	e.effectPreset.Store(&p)
	return true
}

// Effect 返回控制线程最近一次请求的档位（诊断用）。
//
// 注意它返回的是"请求值"，不是"音频线程正在用的值" ——
// 两者在切换后可能差一个缓冲周期。想知道后者用 EffectDiagnostics。
func (e *Engine) Effect() EffectPreset {
	if p := e.effectPreset.Load(); p != nil {
		return *p
	}
	return EffectOff
}

// EffectDiagnostics 返回音效链的运行状态（设置界面 / 排查用）。
//
// 这里读的是音频线程维护的状态，属于"探测"语义：拿到的可能是
// 一个缓冲周期之前的值。对诊断用途完全够用。
func (e *Engine) EffectDiagnostics() map[string]any {
	return map[string]any{
		"requested": string(e.Effect()),
		"applied":   string(e.effects.CurrentPreset()),
		"prepared":  e.effects.Prepared(),
		"label":     EffectPresetLabel(e.effects.CurrentPreset()),
	}
}

// SetTrackGapSeconds 设置「自动切歌时两首歌之间的间隔」（秒）。
//
// 传 0 表示不留间隔（播完立刻触发下一首）。这个方法可以从任意 goroutine 调用。
func (e *Engine) SetTrackGapSeconds(seconds float64) {
	if e.gap != nil {
		e.gap.SetGapSeconds(seconds)
	}
}

// TrackGapActive 报告当前是否正在「切歌间隔」中（诊断用）。
func (e *Engine) TrackGapActive() bool {
	if e.gap == nil {
		return false
	}
	return e.gap.Active()
}

// GapSeconds 返回当前配置的切歌间隔（秒，诊断用）。
func (e *Engine) GapSeconds() float64 {
	if e.gap == nil {
		return 0
	}
	return e.gap.GapSeconds()
}

// CancelTrackGap 取消正在进行的切歌间隔。
//
// 用户手动切歌 / 暂停 / 卸载时必须调它：间隔期间点「下一首」是明确的即时意图，
// 不该还要等剩下的半秒；而卸载后还挂着计时器会让下一次装载立刻收到一个
// 过期的「播完了」回调 —— 表现为自动跳过一首歌。
func (e *Engine) CancelTrackGap() {
	if e.gap != nil {
		e.gap.Cancel()
	}
}

// PrepareSwitch 立刻让引擎安静下来，为「马上就来的另一首歌」让路。
//
// ★ 为什么必须有它（真实报障：切歌时上一首还会继续播放一会儿）
//
// 上层切歌的时序是这样的：
//
//	playerLoad(B) → resolve(B)       ← 这里可能要跑一次 ffmpeg 转码，**一秒以上**
//	              → engine.Load(B)   ← 到这一步音频才真的换掉
//
// 在整个 resolve 期间，引擎里装的还是 A：环形缓冲里积压的 PCM（最多 3 秒）
// 加上已经交给声卡的那几个缓冲，会一直被放出来。用户听到的就是
// 「点了下一首，A 还接着唱了一秒多」。
//
// 光靠 engine.Load 里的 ring.reset() 是救不了的 —— 那是 Load **之后**才发生，
// 而问题恰恰出在 Load **之前**那段等待。所以需要这个「先静音、后装载」的中间态：
//
//	playerCancelGap() → PrepareSwitch()  ← 立刻安静（几微秒）
//	playerLoad(B)     → resolve(B)       ← 这一秒里用户听到的是**静音**，不是 A
//	                  → engine.Load(B)   ← 新歌从第一个样本开始出声
//
// 为什么不是「暂停」：暂停会把用户意图也一起改掉（后端 playing=false），
// 而用户并没有要暂停，他只是要换一首。这里只丢弃「将要出声的旧数据」，
// 播放意图保持原样，所以新歌装载完成后不需要再被谁「唤醒」。
//
// 代价是 A→B 之间有一段几十毫秒到一秒多的**静音**，长度取决于 resolve 要多快。
// 这是刻意的取舍：切歌时听到一小段安静，远好过听到上一首还在唱。
func (e *Engine) PrepareSwitch() {
	e.mu.Lock()
	// 丢掉缓冲里还没放出来的旧歌数据，并让 feeder 停下 ——
	// 不停的话它会在我们等待 resolve 的这段时间里继续把旧文件灌进缓冲。
	e.stopFeedLocked()
	// reset 之后缓冲为空且没有生产者。音频回调走的顺序是：
	//   gap 判定（已在 CancelTrackGap / Load 里取消）→ playingNow() → ring.read()
	// 缓冲空 → frames == 0，再读 ring.state()：
	//   closed=true  → markEOF()（把 playing 置 false，上层可能据此自动跳歌）
	//   closed=false → 直接 return（输出静音，什么都不做）
	//
	// 这里**必须**让它走 closed=false 那一支：我们只是想安静一下，不想
	// 让引擎报「这首歌播完了」。
	//
	// ★ 注意：Ring.reset() **只清数据，不清 closed**（见它的实现）。所以下一行的
	// setClosed(false) 不是「再显式置一次以防万一」，而是**必需**的：
	// reset() 之后若 closed 仍是 true，回调会把「缓冲空 + 已结束」判成
	// markEOF()（playing 置 false，上层据此自动跳歌）—— 用户看到的是
	// 「切歌瞬间被自动跳过一首」。（曾经这里有句注释说 reset 会把 closed
	// 清成 false，是错的；照着它删掉 setClosed 就会踩上面这个坑。）
	e.ring.reset()
	e.ring.setClosed(false)
	e.mu.Unlock()
}

// Open 打开声卡。返回错误表示设备不可用 —— 上层应当据此回退到前端播放。
func (e *Engine) Open() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.started {
		return nil
	}

	ctx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		return fmt.Errorf("初始化音频上下文失败: %w", err)
	}

	cfg := malgo.DefaultDeviceConfig(malgo.Playback)
	cfg.Playback.Format = malgo.FormatS16
	cfg.Playback.Channels = Channels
	cfg.SampleRate = SampleRate
	cfg.PeriodSizeInFrames = PeriodFrames
	// 不绑定具体设备：用系统默认输出，跟随用户切换（插耳机自动切）
	cfg.Alsa.NoMMap = 1

	// 先把 ctx 挂到字段上：这样下面两条失败路径都能共用 releaseDeviceLocked
	//（它负责「释放 + 清字段」），不必再手写 Uninit / Free。
	e.ctx = ctx
	device, err := malgo.InitDevice(ctx.Context, cfg, malgo.DeviceCallbacks{
		Data: e.onData,
	})
	if err != nil {
		e.releaseDeviceLocked() // e.device 还是 nil，只回收 ctx
		return fmt.Errorf("打开音频设备失败: %w", err)
	}

	e.device = device
	if err := device.Start(); err != nil {
		// ★ 释放必须走 releaseDeviceLocked：它会**同时清空字段**。
		//
		// 这里曾经是手写三行（device.Uninit / ctx.Uninit / ctx.Free）而不清字段，
		// 但 e.device / e.ctx 在上面两行就已经赋了值（就是为了让失败路径拿到它们），
		// 于是退出时 Close() 会照着这两个字段**再释放一次**：
		// 设备双重 Uninit、上下文被 Free 两次 —— use-after-free / 堆损坏。
		// 触发条件是「声卡打不开」（设备被独占、没有输出设备、驱动刚被拔掉），
		// 而在**退出路径**上崩溃，用户只会看到「关不掉 / 闪退」。
		e.releaseDeviceLocked()
		return fmt.Errorf("启动音频设备失败: %w", err)
	}

	// 音效链在声卡打开之后才 prepare：它会分配几十 KB 的延迟线，
	// 而这些分配**必须**发生在音频线程启动之前（回调里不能分配内存）。
	// 放在 Start 之前也可以，但那时设备还没确认可用 —— 分配了又要在
	// 失败路径上回收，不如放到确认成功之后。
	e.effects.prepare(SampleRate)
	// 把当前请求的档位立刻装载进链（不用等第一个回调）。
	// 注意这里用的是 RequestPreset 而不是直接 apply：切换逻辑统一走
	// 音频线程那条路径，避免"启动时"和"运行时"两套装载代码。
	if p := e.effectPreset.Load(); p != nil && *p != EffectOff {
		e.effects.RequestPreset(*p)
	}

	e.started = true
	return nil
}

// Close 释放声卡与当前文件
func (e *Engine) Close() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.gap != nil {
		e.gap.Cancel()
	}
	e.stopFeedLocked()
	if e.file != nil {
		_ = e.file.Close()
		e.file = nil
	}
	e.releaseDeviceLocked()
	e.started = false
}

// releaseDeviceLocked 释放设备与上下文，并**把字段清空**（幂等）。
//
// ★ 「释放即清空字段」是这里的全部意义：任何一条释放路径忘了清字段，
// 下一次释放（Close、关闭时的第二次调用、Open 失败后的收尾）就会对已经
// 释放过的对象再动手 —— use-after-free / 双重释放，崩在退出路径上。
// 所以释放动作只允许从这里走，不要在任何地方手写 Uninit / Free。
//
// 调用方必须持有 e.mu（名字里的 Locked 就是这个意思）。
func (e *Engine) releaseDeviceLocked() {
	if e.device != nil {
		// miniaudio：InitDevice 成功但 Start 失败时也必须 Uninit，
		// 所以这里不看 started，只看字段。
		e.device.Uninit()
		e.device = nil
	}
	if e.ctx != nil {
		_ = e.ctx.Uninit()
		e.ctx.Free()
		e.ctx = nil
	}
}

// Started 报告声卡是否已经打开
func (e *Engine) Started() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.started
}

/* --------------------------------------------------------------------------
   音频回调
   --------------------------------------------------------------------------
   跑在 malgo 自己的高优先级线程上。这里**绝对不能**做任何可能阻塞的事：
   不加会长时间持有的锁、不分配内存、不做 IO、不打印日志。
   -------------------------------------------------------------------------- */

func (e *Engine) onData(out, in []byte, frameCount uint32) {
	// 切歌间隔（见 GapScheduler）：上一首已经放完，正在等两首歌之间的停顿。
	//
	// ★ 它必须排在「是否在播放」的判断**之前**。
	//
	// markEOF 会把 playing 置成 false（这首歌确实已经结束了），
	// 如果间隔的推进放在那个判断之后，就永远走不到 —— 表现为配了切歌间隔
	// 之后「播完再也不切歌」，也就是整个自动切歌链路卡死。
	//
	// 这里输出的是**静音**而不是继续喂数据 —— 间隔的语义就是「什么都不放」。
	// 用音频回调来推进（而不是另起一个 timer）是为了让间隔严格跟着音频时钟走：
	// 网页卡顿、系统忙、设备缓冲变化都不会让间隔忽长忽短。
	if e.gap != nil && e.gap.Active() {
		for i := range out {
			out[i] = 0
		}
		e.gap.Tick(int(frameCount))
		return
	}

	// 暂停 / 未装载：输出静音。
	// 注意仍然要「填满」缓冲区，返回短缓冲在 WASAPI 下会被当成欠载处理。
	if !e.playingNow() {
		for i := range out {
			out[i] = 0
		}
		return
	}

	frames, underrun := e.ring.read(out)
	if underrun {
		e.posMu.Lock()
		e.underruns++
		e.posMu.Unlock()
	}
	if frames == 0 {
		// 缓冲空且文件已读完 → 播完了
		if _, closed := e.ring.state(); closed {
			e.markEOF()
		}
		return
	}

	// —— 尾部静音截断 ——
	//
	// 开了「跳过尾部静音」时，位置一走到 endFrame 就按播完处理：
	// 不去等文件真正读空（那正是用户不想要的那段静音）。
	// 本缓冲内**只放出到 endFrame 为止**的那部分，多出来的样本就地清零 ——
	// 直接丢掉这些帧会让回调拿到一个短缓冲，而短缓冲在 WASAPI 下会被当成
	// 欠载处理（听感是「卡带」）。
	e.posMu.Lock()
	end := e.endFrame
	pos := e.positionFrame
	e.posMu.Unlock()
	if end > 0 {
		remaining := end - pos
		if remaining <= 0 {
			for i := range out {
				out[i] = 0
			}
			e.markEOF()
			return
		}
		if int64(frames) > remaining {
			zeroFrom := int(remaining) * FrameSize
			for i := zeroFrom; i < len(out); i++ {
				out[i] = 0
			}
			frames = int(remaining)
		}
	}

	// —— 音效（均衡器 + 空间处理 + 混响）——
	//
	// ★ 顺序：音效在增益**之前**。
	//
	// 这不是随便排的。音效链的末尾有一个固定在 0.85 阈值的软限幅器，
	// 它的职责是"防止 EQ 提升 + 混响叠加把峰值推过头"—— 也就是说
	// 它保护的是**音乐信号本身**。而增益（用户音量 × 响度补偿）是
	// 用户的输出级控制，它应该在限幅**之后**：用户把音量调到 30%
	// 时，限幅器看到的仍然是满幅的音乐（该压的地方照压），
	// 然后整体再乘 0.3。反过来（先乘 0.3 再限幅）会让限幅器在
	// 音量很低时完全不工作 —— 因为信号根本没到阈值，于是"小音量下
	// 音效不会过载、大音量下会"，同一个音效在不同音量下听感不一致。
	//
	// 另外还有一个更实际的理由：applyGainRampS16 是纯整数运算
	//（就地为 s16 乘增益），而音效链是 float64 的。把音效放前面，
	// 两者各自处理自己擅长的格式，中间只转换一次。
	if preset := e.effectPreset.Load(); preset != nil {
		e.effects.RequestPreset(*preset)
	}
	e.effects.ProcessStereo(out[:frames*FrameSize])

	// 应用增益（用户音量 × 响度补偿），并就地做 16bit 定点缩放。
	// 缓冲内插值的起点/终点由 gainState.applyGain 内部处理（顺序写反会让
	// 斜坡退化成阶跃 —— 见那里的说明）。
	e.gain.applyGain(out[:frames*FrameSize], int(frames))

	// 频谱：把立体声降成单声道喂给分析器（AnalyserNode 也是这么做的）
	e.feedAnalyzer(out[:frames*FrameSize])

	e.posMu.Lock()
	e.positionFrame += int64(frames)
	reachedEnd := end > 0 && e.positionFrame >= end
	e.posMu.Unlock()

	// 恰好停在掐点上：本缓冲已经把最后一段放完了，立刻按播完处理。
	// 不这样做的话要等下一个回调（那时 remaining<=0 才被发现），
	// 中间会多放一个约 23ms 的静音缓冲 —— 听感上是切歌前多了一丝停顿。
	if reachedEnd {
		e.markEOF()
	}
}

// applyGainRampS16 在缓冲**内部**从 from 线性插值到 to，逐样本套用增益。
//
// 为什么不能整块乘同一个值：一次回调覆盖约 23ms 的音乐，整块用同一个增益，
// 音量变化在波形上仍然是一个阶跃 —— 只是台阶变疏了，拖动音量条时听到的是
// 一串细碎的「咔」。逐样本插值才真正消除阶跃。
//
// from == to 时退化成一次普通乘法（避免逐样本插值的额外开销）。
func applyGainRampS16(buf []byte, from, to float64) {
	if from == to {
		applyGainS16(buf, to)
		return
	}
	n := len(buf) / FrameSize
	if n == 0 {
		return
	}
	step := (to - from) / float64(n)
	g := from
	for i := 0; i < n; i++ {
		// 每帧两个声道用同一个增益（保持声像不变）
		for c := 0; c < Channels; c++ {
			off := i*FrameSize + c*BytesPerSample
			if off+1 >= len(buf) {
				break
			}
			v := int32(int16(binary.LittleEndian.Uint16(buf[off:])))
			v = int32(float64(v) * g)
			if v > 32767 {
				v = 32767
			} else if v < -32768 {
				v = -32768
			}
			binary.LittleEndian.PutUint16(buf[off:], uint16(int16(v)))
		}
		g += step
	}
}

// applyGainS16 就地把 s16le 样本乘以增益（带钳位，避免回绕成反相噪声）
func applyGainS16(buf []byte, g float64) {
	if g == 1 {
		return
	}
	for i := 0; i+1 < len(buf); i += 2 {
		v := int32(int16(binary.LittleEndian.Uint16(buf[i:])))
		v = int32(float64(v) * g)
		if v > 32767 {
			v = 32767
		} else if v < -32768 {
			v = -32768
		}
		binary.LittleEndian.PutUint16(buf[i:], uint16(int16(v)))
	}
}

// feedAnalyzer 把交错的立体声 PCM 降成单声道浮点，交给频谱分析器。
//
// monoScratch 是复用的：这里跑在音频线程上，每次回调都 make 一个新切片
// 会持续制造 GC 压力，GC 停顿就直接是爆音。
func (e *Engine) feedAnalyzer(buf []byte) {
	if e.analyzer == nil {
		return
	}
	n := len(buf) / FrameSize
	if cap(e.monoScratch) < n {
		e.monoScratch = make([]float64, n)
	}
	mono := e.monoScratch[:n]
	for i := 0; i < n; i++ {
		off := i * FrameSize
		l := float64(int16(binary.LittleEndian.Uint16(buf[off:])))
		r := float64(int16(binary.LittleEndian.Uint16(buf[off+2:])))
		mono[i] = (l + r) / 2 / 32768.0
	}
	e.analyzer.Write(mono)
}

func (e *Engine) playingNow() bool {
	e.posMu.Lock()
	p := e.playing
	e.posMu.Unlock()
	return p
}

// markEOF 处理「这首歌播完了」。
//
// ★ 有切歌间隔时不立刻回调上层。
//
// 间隔的语义是「这一首结束了，但下一首要等一会儿才开始」。所以这里先把自己
// 标记成「已结束、不再出声」，然后交给 GapScheduler 在**音频时钟**上等满
// 间隔再回调。回调最终会走到上层的 setEOFHandler（自动切下一首）。
//
// 为什么让引擎自己管这段等待，而不是让上层 setTimeout：间隔的时长必须由
// 音频时钟度量。上层在 WebView / Go 定时器上等，网页一卡或系统一忙，
// 间隔就会忽长忽短 —— 用户听到的是停顿时长不稳定。
func (e *Engine) markEOF() {
	e.posMu.Lock()
	if e.eof {
		e.posMu.Unlock()
		return
	}
	e.eof = true
	e.playing = false
	fn := e.onEOF
	e.posMu.Unlock()

	// 没配置间隔（或已经在间隔中）：与历史行为完全一致，立刻回调。
	// 注意 Arm 传进去的回调就是 fn —— 间隔走完时由 GapScheduler 调用它。
	if e.gap != nil && e.gap.Arm(fn) {
		return
	}
	if fn != nil {
		fn()
	}
}

/* --------------------------------------------------------------------------
   装载与播放
   -------------------------------------------------------------------------- */

// Load 装载一个 PCM WAV 文件（44 字节标准头）并准备播放。
// 会停止当前的 feeder、清空缓冲、把位置重置到 startFrame。
//
// startFrame / endFrame 是「跳过首尾静音」的落点（见 PlanSilenceTrim）：
//   - startFrame 是起播位置（0 = 从头）；
//   - endFrame 是结束位置（0 = 一直播到文件末尾）。
//
// 两个边界都由上层算好传进来，引擎不自己读配置也不自己扫静音 ——
// 引擎只负责「按给定的区间播放」，这样它的行为可以被单独测试。
//
// gain 是这首歌应当使用的线性增益（用户音量 × 该曲响度补偿）。**必须**在这里
// 一起传入，而不是装载完再单独调 SetGain —— 原因见 applyGainForLoad 的注释：
// 「装载」与「换增益」之间只要有一个音频回调的窗口，那一个缓冲就会用上一首的
// 增益放出来，听起来正是「切歌瞬间上一首突然变响」。
func (e *Engine) Load(path string, startFrame, endFrame int64, gain float64) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("打开音频文件失败: %w", err)
	}
	st, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return fmt.Errorf("读取音频文件信息失败: %w", err)
	}
	// 跳过标准 44 字节 WAV 头。ffmpeg.TranscodeToWAV 保证头长固定为 44
	// （见 internal/ffmpeg 的说明），所以这里可以直接定位。
	const headerSize = 44
	if _, err := f.Seek(headerSize, io.SeekStart); err != nil {
		_ = f.Close()
		return fmt.Errorf("跳过 WAV 头失败: %w", err)
	}
	pcmSize := st.Size() - headerSize
	if pcmSize < 0 {
		pcmSize = 0
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	e.stopFeedLocked()
	if e.file != nil {
		_ = e.file.Close()
	}
	e.file = f
	e.pcmSize = pcmSize
	e.ring.reset()
	e.ring.setClosed(false)
	e.analyzer.Reset()
	// 音效链也要清：延迟线（Haas）与滤波器历史里留着上一首的残响，
	// 不清的话新歌开头会盖着一层上一首的空间尾巴
	//（听感是"切歌后前几百毫秒糊成一片"）。
	//
	// ★ 清状态但**不**清档位：用户的音效选择是跨歌的偏好
	//（"我要一直用 3D 环绕" 而不是"只给这一首"）。
	//
	// 用 RequestReset 而不是 Reset：这里跑在控制线程，而链里的滤波器历史
	// 与延迟线是音频线程在读写的（ProcessStereo 不带锁）。直接清就是数据竞争，
	// 且可能把音频线程刚装载好的系数一起清掉。请求会在下一批音频数据的
	// 缓冲边界被落实 —— 对"新歌开头不留上一首的残响"这个目标完全够用。
	e.effects.RequestReset()
	// 换增益与换音频在同一个「装载」动作里完成，中间不留给音频回调任何窗口
	e.gain.setHard(gain)
	// 换歌作废上一首可能还挂着的切歌间隔：不等它走完，否则新歌会先静音 1.5 秒。
	//
	// ★ 这一句是「手动切歌立刻出声」的关键，而它**只覆盖 Load 这一条路**。
	//
	// 为什么还需要 Engine.Play 里那一句（见那里的说明）：上层的手动切歌是
	// Load + Play 两步，而**同歌重播**（单曲循环 / 播完即停后手动重播）只调
	// Play 不调 Load —— 那条路上间隔不会被这里清掉。
	if e.gap != nil {
		e.gap.Cancel()
	}

	totalFrames := pcmSize / FrameSize
	start := startFrame
	if start < 0 {
		start = 0
	}
	if start > totalFrames {
		start = totalFrames
	}
	// endFrame <= 0 / 超出范围一律按「播到文件末尾」处理：
	// 上层在关闭「跳过尾部静音」时传的就是 0。
	end := endFrame
	if end <= 0 || end > totalFrames {
		end = totalFrames
	}
	if end < start {
		end = start
	}

	e.posMu.Lock()
	e.positionFrame = start
	e.endFrame = end
	e.trimStart = start
	e.eof = false
	e.posMu.Unlock()

	e.startFeedLocked(start)
	return nil
}

// startFeedLocked 起一个 goroutine 把文件读进环形缓冲。
// 调用方必须持有 e.mu。
func (e *Engine) startFeedLocked(startFrame int64) {
	if e.file == nil {
		return
	}
	stop := make(chan struct{})
	done := make(chan struct{})
	e.stopFeed = stop
	e.feedDone = done

	// 从指定位置开始读（f 的当前位置已在 Load/Seek 里定位好）
	f := e.file
	go func() {
		defer close(done)
		// 每次读 0.25 秒，兼顾吞吐与「暂停时不会一次灌满整个缓冲」
		buf := make([]byte, SampleRate/4*FrameSize)
		for {
			select {
			case <-stop:
				return
			default:
			}

			// 缓冲满了就等一下，别空转烧 CPU
			if e.ring.buffered() >= ringFrames-PeriodFrames {
				select {
				case <-stop:
					return
				case <-time.After(10 * time.Millisecond):
					continue
				}
			}

			n, err := f.Read(buf)
			if n > 0 {
				// write 可能只写入一部分（缓冲将满），剩下的下次再写
				written := 0
				for written < n {
					select {
					case <-stop:
						return
					default:
					}
					w := e.ring.write(buf[written:n])
					if w == 0 {
						// 缓冲满：等回调取走一些
						select {
						case <-stop:
							return
						case <-time.After(5 * time.Millisecond):
						}
						continue
					}
					written += w * FrameSize
				}
			}
			if err != nil {
				// EOF 或读错误：标记生产者结束，让回调能判定「播完」
				e.ring.setClosed(true)
				return
			}
		}
	}()
}

// stopFeedLocked 让当前 feeder 退出并等待它真的结束。
// 调用方必须持有 e.mu —— 但**不能**在持有 posMu 时调用（feeder 不碰 posMu，
// 这里的等待只是为了不让两个 feeder 同时往同一个文件读）。
func (e *Engine) stopFeedLocked() {
	if e.stopFeed != nil {
		close(e.stopFeed)
		e.stopFeed = nil
		// 等它退出：否则换歌时新旧两个 feeder 会同时操作 e.file
		if e.feedDone != nil {
			<-e.feedDone
			e.feedDone = nil
		}
	}
}

// Play 开始（或继续）播放
//
// ★ 顺带取消切歌间隔。
//
// 为什么 Load 里已经有一句取消了，这里还要再来一句：
// 「在间隔里点下一首」的手动切歌是 Load + Play 两步，Load 那一句确实能兜住
// 换歌；但**同歌重播**（单曲循环时播完重来、播完即停后又点播放）只调 Play，
// 不调 Load —— 那条路上间隔仍然挂着，音频回调会一直停在「间隔中，只输出
// 静音」那个分支里，表现就是「点了播放没反应，要过一会儿才响」。
//
// 它与 Pause 里那次取消是同一个道理的镜像：Pause 说的是「先别放」，
// Play 说的是「现在就开始放」—— 两者都是明确的即时意图，都不该被一段
// 为「自动接下一首」准备的停顿挡住。
//
// 它不会削弱「间隔只作用于自动切歌」这条约定：真正区分两者的不是这里，
// 而是**谁先被调用** ——
//
//	· 自动切歌：markEOF 先 Arm 间隔，间隔跑完才回调上层，上层随后才 Load/Play；
//	· 手动切歌 / 重播：上层在间隔还没跑完时就把 Play 发下来了。
//
// 所以这里取消的**只可能是「人主动要它现在出声」那一次**。
func (e *Engine) Play() {
	if e.gap != nil {
		e.gap.Cancel()
	}
	e.posMu.Lock()
	e.playing = true
	e.eof = false
	e.posMu.Unlock()
}

// Pause 暂停：停在这里，不丢位置
//
// 顺带取消切歌间隔：暂停表达的是「先别放」，而间隔走完会触发「下一首」——
// 两者叠加的结果是暂停之后歌自己切走了，那是明确违背用户意图的。
func (e *Engine) Pause() {
	if e.gap != nil {
		e.gap.Cancel()
	}
	e.posMu.Lock()
	e.playing = false
	e.posMu.Unlock()
}

// Playing 报告用户意图上的播放状态
func (e *Engine) Playing() bool {
	e.posMu.Lock()
	defer e.posMu.Unlock()
	return e.playing
}

// SeekToFrame 跳到指定**帧**位置。会丢弃缓冲中积压的数据并让 feeder 从新位置续读。
//
// 刻意不叫 Seek：那个名字在 Go 里等同于 io.Seeker 的约定
// （Seek(offset int64, whence int) (int64, error)），签名不符会被 go vet 拦下，
// 而这里的语义确实是「跳到第 N 帧」而不是「相对某个 whence 偏移」。
func (e *Engine) SeekToFrame(frame int64) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.file == nil {
		return ErrNotReady
	}
	// seek 是明确的即时意图：把可能还挂着的切歌间隔取消掉，
	// 否则用户在间隔里拖了进度条，1.5 秒后歌还是会被切走。
	if e.gap != nil {
		e.gap.Cancel()
	}
	if frame < 0 {
		frame = 0
	}
	// 上界按「掐完尾部静音之后的结束位置」算：拖到最右应当停在真正的终点，
	// 而不是停在文件末尾那段用户根本听不到的静音里。
	e.posMu.Lock()
	end := e.endFrame
	e.posMu.Unlock()
	maxFrames := e.pcmSize / FrameSize
	if end > 0 && end < maxFrames {
		maxFrames = end
	}
	if frame > maxFrames {
		frame = maxFrames
	}

	e.stopFeedLocked()
	if _, err := e.file.Seek(headerSizeOffset+frame*FrameSize, io.SeekStart); err != nil {
		return fmt.Errorf("定位失败: %w", err)
	}
	e.ring.reset()
	e.ring.setClosed(false)
	e.analyzer.Reset()
	// 与 Load 同理：跳转后混响尾巴要清掉。
	//
	// 这里比换歌更明显：seek 是"用户想立刻听到那个位置的音乐"，
	// 而一段残响拖在后面会让跳转听起来不够即时。
	// 同样走 RequestReset（控制线程不直接碰音频线程的状态，见 Load 里的说明）。
	e.effects.RequestReset()

	e.posMu.Lock()
	e.positionFrame = frame
	e.eof = false
	e.posMu.Unlock()

	e.startFeedLocked(frame)
	return nil
}

// headerSizeOffset 与 Load 里的 44 字节头保持一致
const headerSizeOffset = 44

// SetGain 设置线性增益（用户音量 × 响度补偿）。内部做斜坡平滑，不会爆音。
// 负值会被钳到 0（钳位在 gainState.set 里统一处理）。
func (e *Engine) SetGain(v float64) {
	e.gain.set(v)
}

// GainTarget 返回当前增益的目标值（不推进斜坡）。
//
// 供上层合成校验与诊断用：音量 = 用户音量 × 响度补偿，
// 想知道「合成结果对不对」只能看这个值，而不是 current（它还在斜坡途中）。
func (e *Engine) GainTarget() float64 {
	return e.gain.targetValue()
}

// Position 返回当前播放位置（毫秒）与总时长（毫秒）。
//
// ★ 两者都用**整首歌的原时间轴**，与「跳过静音」无关。
//
// 「跳过静音」的语义是「自动跳过」，不是「把歌变短」：
//
//	一首 4:12 的歌，开头 3 秒静音、结尾 20 秒静音，两个开关都开 ——
//	 · 时长仍然是 4:12（252000ms），进度条按整首歌铺开；
//	 · 起播瞬间位置自动落到 3 秒处（用户听到的第一声就是音乐）；
//	 · 位置走到 3:52 就结束并切下一首（不去听那 20 秒空白）。
//
// 为什么位置必须是原时间轴上的绝对位置，而不是「掐完之后从 0 起算」：
//
//  1. **歌词**是按原曲时间轴打轴的。位置若从 0 起算，所有歌词都会
//     整体提前（开头静音多长就偏多少），越往后越对不上；
//  2. **记忆播放进度**（保留歌曲播放进度）存的是原曲位置，恢复时要能对得上；
//  3. 用户拖进度条时心里的刻度也是原曲时间轴。
//
// 一句话：**掐掉的只是「会被播放的区间」，不是「这首歌的时间轴」**。
func (e *Engine) Position() (posMs, durMs int64) {
	e.posMu.Lock()
	frame := e.positionFrame
	e.posMu.Unlock()
	// 分母恒为文件总长：进度条要覆盖整首歌，包括被跳过的首尾。
	return frameToMs(frame), frameToMs(e.pcmSize / FrameSize)
}

// TrimStart 返回本次装载「实际起播」的位置（毫秒，原曲时间轴）。
//
// 开了「跳过开头静音」时它不是 0 —— 前端据此知道「进度条一上来就落在
// 3 秒处」是预期行为，而不是播放位置错乱；诊断信息也用它回答
// 「到底从头开始播了没有」。
func (e *Engine) TrimStart() int64 {
	e.posMu.Lock()
	defer e.posMu.Unlock()
	return frameToMs(e.trimStart)
}

func frameToMs(f int64) int64 {
	return f * 1000 / SampleRate
}

// EOF 报告是否已播完（供上层触发自动下一首）
func (e *Engine) EOF() bool {
	e.posMu.Lock()
	defer e.posMu.Unlock()
	return e.eof
}

// SetEOFHandler 设置播完回调（自动切歌）
func (e *Engine) SetEOFHandler(fn func()) {
	e.posMu.Lock()
	e.onEOF = fn
	e.posMu.Unlock()
}

// Spectrum 返回当前频谱（0..1，对数分桶）。拿不到时返回 nil。
func (e *Engine) Spectrum(bands int) []float64 {
	if e.analyzer == nil {
		return nil
	}
	return e.analyzer.Spectrum(bands)
}

// Underruns 返回欠载次数（诊断：>0 说明喂数据跟不上，会听到断续）
func (e *Engine) Underruns() int64 {
	e.posMu.Lock()
	defer e.posMu.Unlock()
	return e.underruns
}

// Buffered 返回缓冲中可读的毫秒数（诊断用）
func (e *Engine) Buffered() int64 {
	return frameToMs(int64(e.ring.buffered()))
}

// TrimRange 返回当前装载的播放区间（起播帧、结束帧、文件总帧数）。
// 供上层诊断「跳过静音到底跳了多少」。三个值都是**文件口径**的绝对帧号。
func (e *Engine) TrimRange() (start, end, total int64) {
	e.posMu.Lock()
	start = e.trimStart
	end = e.endFrame
	e.posMu.Unlock()
	total = e.pcmSize / FrameSize
	if end <= 0 {
		end = total
	}
	return start, end, total
}
