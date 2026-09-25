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

// value 返回当前增益，并把 current 朝 target 推进一步。
// stepFrames 是本次回调处理的帧数，用于算出正确的斜坡速率。
func (g *gainState) value(stepFrames int) float64 {
	g.mu.Lock()
	if g.current == g.target {
		v := g.current
		g.mu.Unlock()
		return v
	}
	g.mu.Unlock()
	return g.valueFor(stepFrames)
}

// currentValue 只读当前增益，不推进斜坡。
// 给「缓冲内插值」用：需要知道本次缓冲的起点增益。
func (g *gainState) currentValue() float64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.current
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

	// monoScratch 是 feedAnalyzer 的复用缓冲（避免在音频线程上分配）
	monoScratch []float64

	// file 是当前喂给声卡的 PCM 文件（WAV，44 字节头已跳过）
	file    *os.File
	pcmSize int64 // 去掉头之后的 PCM 字节数

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
	// seekTarget 非 nil 时表示正在等待 seek 生效（回调用它重置计数）
	pendingSeek *int64

	// underruns 统计（诊断用）
	underruns int64

	// onEOF 播完时的回调（由上层设置，用于自动切歌）
	onEOF func()
}

// New 创建一个未启动的引擎
func New() *Engine {
	return &Engine{
		ring:     newRingBuffer(ringFrames),
		analyzer: NewAnalyzer(DefaultFFTSize),
		gain:     gainState{current: 1, target: 1},
	}
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

	device, err := malgo.InitDevice(ctx.Context, cfg, malgo.DeviceCallbacks{
		Data: e.onData,
	})
	if err != nil {
		_ = ctx.Uninit()
		ctx.Free()
		return fmt.Errorf("打开音频设备失败: %w", err)
	}

	e.ctx = ctx
	e.device = device
	if err := device.Start(); err != nil {
		device.Uninit()
		_ = ctx.Uninit()
		ctx.Free()
		return fmt.Errorf("启动音频设备失败: %w", err)
	}
	e.started = true
	return nil
}

// Close 释放声卡与当前文件
func (e *Engine) Close() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.stopFeedLocked()
	if e.file != nil {
		_ = e.file.Close()
		e.file = nil
	}
	if e.device != nil {
		e.device.Uninit()
		e.device = nil
	}
	if e.ctx != nil {
		_ = e.ctx.Uninit()
		e.ctx.Free()
		e.ctx = nil
	}
	e.started = false
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

	// 应用增益（用户音量 × 响度补偿），并就地做 16bit 定点缩放。
	// 用缓冲内插值：整块共用一个增益值的话，音量变化在波形上仍是阶跃。
	gainTo := e.gain.valueFor(int(frames))
	applyGainRampS16(out[:frames*FrameSize], e.gain.currentValue(), gainTo)

	// 频谱：把立体声降成单声道喂给分析器（AnalyserNode 也是这么做的）
	e.feedAnalyzer(out[:frames*FrameSize])

	e.posMu.Lock()
	e.positionFrame += int64(frames)
	e.posMu.Unlock()
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
// gain 是这首歌应当使用的线性增益（用户音量 × 该曲响度补偿）。**必须**在这里
// 一起传入，而不是装载完再单独调 SetGain —— 原因见 applyGainForLoad 的注释：
// 「装载」与「换增益」之间只要有一个音频回调的窗口，那一个缓冲就会用上一首的
// 增益放出来，听起来正是「切歌瞬间上一首突然变响」。
func (e *Engine) Load(path string, startFrame int64, gain float64) error {
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
	// 换增益与换音频在同一个「装载」动作里完成，中间不留给音频回调任何窗口
	e.gain.setHard(gain)

	start := startFrame
	if start < 0 {
		start = 0
	}
	if maxFrames := pcmSize / FrameSize; start > maxFrames {
		start = maxFrames
	}
	e.posMu.Lock()
	e.positionFrame = start
	e.eof = false
	e.pendingSeek = nil
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
func (e *Engine) Play() {
	e.posMu.Lock()
	e.playing = true
	e.eof = false
	e.posMu.Unlock()
}

// Pause 暂停：停在这里，不丢位置
func (e *Engine) Pause() {
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
	if frame < 0 {
		frame = 0
	}
	maxFrames := e.pcmSize / FrameSize
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

// Position 返回当前播放位置（毫秒）与总时长（毫秒）
func (e *Engine) Position() (posMs, durMs int64) {
	e.posMu.Lock()
	frame := e.positionFrame
	e.posMu.Unlock()
	return frameToMs(frame), frameToMs(e.pcmSize / FrameSize)
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
