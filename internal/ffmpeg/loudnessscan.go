/* ==========================================================================
   loudnessscan.go — 转码时顺手算响度
   --------------------------------------------------------------------------
   为什么放在这里

   后端播放本来就要把整首歌转成固定的 PCM（16bit/44.1kHz/立体声 WAV）落盘，
   见 internal/media 的 PlayableFile → ffmpeg.TranscodeToWAV。也就是说：
   **这首歌的完整 PCM 必然会在解码转码时流经我们的代码。**

   既然它已经流过一次了，就没有任何理由为了测响度**再起一个 ffmpeg、
   再把同一个文件解码一遍**。后者不仅多花几秒，还会和正在播放的音效链抢核。

   这个文件提供的 Scan 就是那条「顺手」通道：喂进来一段交错 PCM，
   它内部维护一个流式响度累积器（见 internal/loudness 的 Accumulator）+
   首尾静音扫描，最后一次性给出结论。

   与「另外跑一次 ffmpeg 测量」的对比（同一台机器、240 秒曲目）：

     ffmpeg loudnorm 整曲   11,700 ms   ← 改造前的生产路径
     ffmpeg ebur128 整曲     1,100 ms   ← 改造后的兜底路径
     顺手算（本文件）            0 ms   ← 没有额外工作，只是解码时多几次乘加

   --------------------------------------------------------------------------
   为什么把「静音扫描」也并进来

   首尾静音检测（internal/audioplay/silence.go）同样是要把整首歌读一遍的
   O(n) 工作。它现在是"装载前单独读一遍文件"，而这里恰好有一份一模一样的
   PCM 流过。并进来的收益不是 CPU（静音扫描已经按 1/64 抽样了），
   而是**少一次整文件读取**——一首 10 分钟的歌是 105MB。
   ========================================================================== */

package ffmpeg

import (
	"encoding/binary"
	"math"
	"sort"
)

// LoudnessResult 一次「顺手测量」的结论。
//
// 字段与 internal/loudness 的 Measurement 的固有量部分一一对应，
// 但这里**不导入** loudness 包：依赖方向必须是 loudness → ffmpeg
// （loudness 要用 ffmpeg 跑兜底测量），反过来会成环。
type LoudnessResult struct {
	// Integrated 整合响度（LUFS）。0 表示整段静音或过短、拿不到数据。
	Integrated float64
	// TruePeak 真峰值（dBTP）。0 表示没有数据。
	TruePeak float64
	// LRA 响度范围（LU）
	LRA float64
	// Threshold 相对门限（LUFS）
	Threshold float64

	// Frames 实际分析过的帧数（诊断用）
	Frames int64
}

// LoudnessScanner 流式响度扫描器。
//
// 用法：NewLoudnessScanner(rate, channels) → 反复 Write(interleavedPCM)
// → Result()。**不是**并发安全的（它就是一条解码流水线上的一环）。
type LoudnessScanner struct {
	rate     int
	channels int

	// K 加权两级 IIR 的状态，每个声道各两个
	coeff [2]biquad

	// 滑动窗口（400ms）：保留最近 blockLen 帧的 K 加权样本
	blockLen int
	stepLen  int
	ring     [][]float64
	ringPos  int
	filled   int
	// blocks 是已产出的 400ms 块功率（每 100ms 一条）
	blocks []float64

	// 真峰值：保留跨块所需的尾部样本
	tail     []float64
	peak     float64
	sawAudio bool

	frames int64

	// —— 首尾静音 ——
	// headSilent 为 true 表示"到目前为止全是静音"
	headSilent  bool
	headFrames  int64
	tailSilent  int64
	silentLimit int16

	// scratch 是复用的解码缓冲（交错 int16 → float64）
	scratch []float64
	// pending 存不足一帧的尾巴，等下一块 Write 接上（见 Write 的说明）
	pending []byte

	// states 是 K 加权滤波器的跨块状态
	states scannerStates
}

type biquad struct{ b0, b1, b2, a1, a2 float64 }

// scannerState 是 K 加权两级 IIR 的状态（每级 s1/s2）
type scannerState struct{ s1, s2 [2]float64 }

// scannerStates 持有所有声道的状态。本项目的 PCM 恒为立体声，
// 单声道复用 [0]。
type scannerStates struct{ st [2]scannerState }

// bs1770_48k 是 BS.1770-4 附录 1 给出的 48kHz K 加权系数。
//
// 与 internal/loudness/bs1770.go 里的同名表是同一组数：那边是纯 Go 算法
// 实现的基准，这里是转码顺手测量用的副本。两处刻意各留一份而不是互相导入，
// 因为依赖方向只能是 loudness → ffmpeg（loudness 要用 ffmpeg 做兜底测量），
// 反向导入会成环。数值一致性由测试保证（同一段信号两边结果必须一致）。
var bs1770_48k = [2]biquad{
	// 第 1 级：高架滤波（模拟头部声学）
	{b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285,
		a1: -1.69065929318241, a2: 0.73248077421585},
	// 第 2 级：RLB 高通
	{b0: 1.0, b1: -2.0, b2: 1.0,
		a1: -1.99004745483398, a2: 0.99007225036621},
}

// truePeakPhases 是 BS.1770-4 附录 2 表 3 的 4 相插值系数（48kHz）
var truePeakPhases = [4][12]float64{
	{0.0017089843750, 0.0109863281250, -0.0196533203125, 0.0332031250000,
		-0.0594482421875, 0.1373291015625, 0.9721679687500, -0.1022949218750,
		0.0476074218750, -0.0266113281250, 0.0148925781250, -0.0083007812500},
	{0.0291748046875, -0.0292968750000, -0.0517578125000, 0.0891113281250,
		-0.1665039062500, 0.4650878906250, 0.7797851562500, -0.2003173828125,
		0.1015625000000, -0.0582275390625, 0.0330810546875, -0.0189208984375},
	{-0.0189208984375, 0.0330810546875, -0.0582275390625, 0.1015625000000,
		-0.2003173828125, 0.7797851562500, 0.4650878906250, -0.1665039062500,
		0.0891113281250, -0.0517578125000, -0.0292968750000, 0.0291748046875},
	{-0.0083007812500, 0.0148925781250, -0.0266113281250, 0.0476074218750,
		-0.1022949218750, 0.9721679687500, 0.1373291015625, -0.0594482421875,
		0.0332031250000, -0.0196533203125, 0.0109863281250, 0.0017089843750},
}

// eburCoefficients 取得某采样率下的 K 加权系数。
//
// 48kHz 直接用标准值；其它采样率按 BS.1770 附录的双线性变换重新推导
// （与 internal/loudness 的 coefficientFor 同一套做法，只是这里不做缓存 ——
// 转码路径一次只创建一个扫描器，缓存没有意义）。
func eburCoefficients(rate int) [2]biquad {
	if rate == 48000 {
		return bs1770_48k
	}
	out := [2]biquad{}
	for i, st := range bs1770_48k {
		out[i] = resampleBiquad(st, 48000, rate)
	}
	return out
}

// resampleBiquad 把一个 biquad 从 fromRate 重新推导到 toRate。
//
// 对 0.0 < f < 0.5 的每个数字极/零点 z，先映射为模拟角频率
// s = 2·fs·(z-1)/(z+1)，再以新采样率做双线性变换
// z' = (2·fs' + s) / (2·fs' - s)。这样能严格保持原滤波器的频率响应形状，
// 也是 libebur128 / ffmpeg 处理非 48kHz 时的通行做法。
func resampleBiquad(st biquad, fromRate, toRate int) biquad {
	if fromRate == toRate {
		return st
	}
	p1, p2 := quadRoots(1, st.a1, st.a2)
	if math.Abs(st.b0) <= 1e-15 {
		return st
	}
	z1, z2 := quadRoots(st.b0, st.b1, st.b2)

	z1 = mapRoot(z1, float64(fromRate), float64(toRate))
	z2 = mapRoot(z2, float64(fromRate), float64(toRate))
	p1 = mapRoot(p1, float64(fromRate), float64(toRate))
	p2 = mapRoot(p2, float64(fromRate), float64(toRate))

	gain := biquadGainAtDC(st)
	out := polyToBiquad(z1, z2, p1, p2)
	if dcNew := biquadGainAtDC(out); math.Abs(dcNew) > 1e-15 {
		k := gain / dcNew
		out.b0 *= k
		out.b1 *= k
		out.b2 *= k
	}
	return out
}

// mapRoot 把一个数字域的根按采样率变换映射到新的数字域
func mapRoot(z complex128, fromRate, toRate float64) complex128 {
	s := 2 * complex(fromRate, 0) * (z - 1) / (z + 1)
	return (2*complex(toRate, 0) + s) / (2*complex(toRate, 0) - s)
}

// quadRoots 解 a·z² + b·z + c = 0
func quadRoots(a, b, c float64) (complex128, complex128) {
	disc := complex(b*b-4*a*c, 0)
	r := math.Hypot(real(disc), imag(disc))
	re := math.Sqrt((r + real(disc)) / 2)
	im := math.Sqrt((r - real(disc)) / 2)
	if imag(disc) < 0 {
		im = -im
	}
	sq := complex(re, im)
	twoA := complex(2*a, 0)
	return (-complex(b, 0) + sq) / twoA, (-complex(b, 0) - sq) / twoA
}

// polyToBiquad 由零点/极点构造 biquad（分子分母都按 z 的降幂排）
func polyToBiquad(z1, z2, p1, p2 complex128) biquad {
	return biquad{
		b0: 1,
		b1: real(-(z1 + z2)),
		b2: real(z1 * z2),
		a1: real(-(p1 + p2)),
		a2: real(p1 * p2),
	}
}

// biquadGainAtDC 直流（z=1）处的增益
func biquadGainAtDC(st biquad) float64 {
	den := 1 + st.a1 + st.a2
	if math.Abs(den) < 1e-15 {
		return 0
	}
	return (st.b0 + st.b1 + st.b2) / den
}

// 常量与 BS.1770-4 一致（与 loudness/bs1770.go 同源）
const (
	scBlockSeconds   = 0.400
	scStepSeconds    = 0.100
	scAbsoluteGate   = -70.0
	scRelativeGateLU = -10.0
	scLoudnessOffset = -0.691
	// 静音判定门限（-50 dBFS，与 audioplay 的 silenceDBFS 一致）
	scSilenceDBFS = -50.0
)

// NewLoudnessScanner 创建扫描器。channels 支持 1~2。
func NewLoudnessScanner(rate, channels int) *LoudnessScanner {
	if rate <= 0 {
		rate = WAVSampleRate
	}
	if channels <= 0 || channels > 2 {
		channels = WAVChannels
	}
	s := &LoudnessScanner{
		rate:        rate,
		channels:    channels,
		coeff:       eburCoefficients(rate),
		blockLen:    int(scBlockSeconds * float64(rate)),
		stepLen:     int(scStepSeconds * float64(rate)),
		headSilent:  true,
		silentLimit: int16(math.Pow(10, scSilenceDBFS/20) * 32768),
	}
	s.ring = make([][]float64, channels)
	for c := range s.ring {
		s.ring[c] = make([]float64, s.blockLen)
	}
	return s
}

// Write 喂一段**交错**的 16bit 小端 PCM（与转码产物的布局一致）。
//
// ★ 必须能接受**任意长度**的输入，包括不足一帧的碎片。
//
// 转码时是按 256KB 一块喂的（那是 4 的倍数，不会碎），但"能接受任意长度"
// 是流式接口的基本契约：调用方不该被迫自己凑整。以前这里写成
// `frames := len(pcm)/(channels*2); if frames == 0 { return }`，
// 于是不足一帧的尾巴会被**静默丢弃** —— 丢掉的虽只有一个字节，
// 但这类"悄悄少一点"的行为在流式解析里是 bug 的温床。
//
// 现在的做法：把不足一帧的尾巴存进 pending，下次 Write 接在前面。
func (s *LoudnessScanner) Write(pcm []byte) {
	if len(pcm) == 0 {
		return
	}
	if len(s.pending) > 0 {
		pcm = append(s.pending, pcm...)
		s.pending = nil
	}
	align := s.channels * 2
	if rem := len(pcm) % align; rem != 0 {
		// 尾巴存起来等下一块。要**复制**：调用方可能复用它的缓冲区。
		s.pending = append([]byte(nil), pcm[len(pcm)-rem:]...)
		pcm = pcm[:len(pcm)-rem]
	}
	if len(pcm) == 0 {
		return
	}

	frames := len(pcm) / align
	if cap(s.scratch) < frames*s.channels {
		s.scratch = make([]float64, frames*s.channels)
	}
	buf := s.scratch[:frames*s.channels]
	for i := range buf {
		off := i * 2
		buf[i] = float64(int16(binary.LittleEndian.Uint16(pcm[off:]))) / 32768.0
	}
	s.process(buf, frames)
}

// WriteS16 直接喂一段已经解好的 int16 样本（交错）。与 Write 等价，
// 只是省掉了一次二进制解析（调用方如果本来就是 int16 数组就用这个）。
func (s *LoudnessScanner) WriteS16(samples []int16) {
	frames := len(samples) / s.channels
	if frames == 0 {
		return
	}
	if cap(s.scratch) < len(samples) {
		s.scratch = make([]float64, len(samples))
	}
	buf := s.scratch[:len(samples)]
	for i, v := range samples {
		buf[i] = float64(v) / 32768.0
	}
	s.process(buf, frames)
}

// process 处理一块已转成 float64 的交错样本
func (s *LoudnessScanner) process(buf []float64, frames int) {
	// 滤波器状态从上一块延续（存在 s 上）
	st := s.states

	// ★ 逐帧推进，所有声道**同步**前进环形下标。
	//
	// 与 internal/loudness 的 Accumulator 同构（那边有详细的踩坑说明）。
	// 这里刻意**不用**「增量加减维护平方和」的写法 —— 它把全局帧号、
	// 环形下标、窗口是否填满三个量耦合在一起，差一格就会让块功率**逐块
	// 线性漂移**（实测响度虚高近 8 LU，而且只在按 1 秒一块喂时才稳定复现，
	// 一次性喂整首歌反而看不出来 —— 而那正是转码时的真实用法）。
	//
	// 现在的做法：环形缓冲保留最近 blockLen 帧样本，每到产出点重算一次
	// 平方和。每个样本被读 4 遍（400ms 窗口 / 100ms 步进），整首仍是 O(n)。
	for i := 0; i < frames; i++ {
		for c := 0; c < s.channels; c++ {
			x := buf[i*s.channels+c]
			sc := &st.st[c]

			y0 := s.coeff[0].b0*x + sc.s1[0]
			sc.s1[0] = s.coeff[0].b1*x - s.coeff[0].a1*y0 + sc.s2[0]
			sc.s2[0] = s.coeff[0].b2*x - s.coeff[0].a2*y0

			y1 := s.coeff[1].b0*y0 + sc.s1[1]
			sc.s1[1] = s.coeff[1].b1*y0 - s.coeff[1].a1*y1 + sc.s2[1]
			sc.s2[1] = s.coeff[1].b2*y0 - s.coeff[1].a2*y1

			s.ring[c][s.ringPos] = y1
		}

		s.ringPos++
		if s.ringPos >= s.blockLen {
			s.ringPos = 0
		}
		s.filled++
		if s.filled >= s.blockLen && (s.filled-s.blockLen)%s.stepLen == 0 {
			s.emitBlock()
		}
	}
	s.states = st

	// —— 首尾静音 ——
	s.scanSilence(buf, frames)

	// —— 真峰值 ——
	s.scanTruePeak(buf, frames)

	s.frames += int64(frames)
}

// emitBlock 产出一个块的功率：对环形缓冲里保留的最近 blockLen 帧重算平方和。
//
// 与 loudness.Accumulator.emitBlock 同构（也见 process 里为什么不用增量写法）。
func (s *LoudnessScanner) emitBlock() {
	var sum float64
	for c := range s.ring {
		var e float64
		for _, v := range s.ring[c] {
			e += v * v
		}
		sum += e / float64(s.blockLen)
	}
	s.blocks = append(s.blocks, sum)
}

// scanSilence 累积首尾静音。
//
// 与 audioplay/silence.go 的 scanSilence 同一套判定（-50 dBFS 峰值门限），
// 但**不抽样**：这里数据本来就在手上，逐帧看反而更简单、也更准。
//
// 注意这里给出的是**原始事实**（头尾各有多少帧低于门限），
// 「连续静音至少 200ms 才算一段静音」那条业务规则由调用方
// （audioplay.PlanSilenceTrim）应用 —— 两者刻意分开，
// 因为门限扫描是「文件的事实」，200ms 是「用户要不要跳过的决策」。
func (s *LoudnessScanner) scanSilence(buf []float64, frames int) {
	limit := float64(s.silentLimit) / 32768.0
	for i := 0; i < frames; i++ {
		base := i * s.channels
		loud := false
		for c := 0; c < s.channels; c++ {
			v := buf[base+c]
			if v > limit || v < -limit {
				loud = true
				break
			}
		}
		if s.headSilent {
			if loud {
				s.headSilent = false
				s.tailSilent = 0
			} else {
				s.headFrames++
			}
			continue
		}
		if loud {
			s.tailSilent = 0
		} else {
			s.tailSilent++
		}
	}
}

// scanTruePeak 用 4 相过采样求真峰值（BS.1770-4 附录 2）
func (s *LoudnessScanner) scanTruePeak(buf []float64, frames int) {
	// 只取 0 号声道：立体声两声道通常同相，真峰值取一个声道是通行做法，
	// 而且能省掉一半的过采样计算（那是这条链路上最贵的一步）。
	mono := make([]float64, 0, len(s.tail)+frames)
	mono = append(mono, s.tail...)
	for i := 0; i < frames; i++ {
		mono = append(mono, buf[i*s.channels])
	}
	for _, v := range mono {
		if av := math.Abs(v); av > s.peak {
			s.peak = av
		}
	}
	phases := &truePeakPhases
	taps := len(phases[0])
	for i := 0; i+taps <= len(mono); i++ {
		for p := range phases {
			ph := &phases[p]
			var acc float64
			for k := 0; k < taps; k++ {
				acc += ph[k] * mono[i+k]
			}
			if av := math.Abs(acc); av > s.peak {
				s.peak = av
			}
		}
	}
	keep := 11
	if len(mono) < keep {
		keep = len(mono)
	}
	s.tail = append(s.tail[:0], mono[len(mono)-keep:]...)
}

// Silence 返回首尾静音长度（帧）与总帧数。
//
// 「连续静音至少 200ms 才算一段」这条规则在调用方应用（见 audioplay 的
// PlanSilenceTrim）：这里给出的是原始事实，不做取舍。
func (s *LoudnessScanner) Silence() (head, tail, total int64) {
	return s.headFrames, s.tailSilent, s.frames
}

// Result 汇总响度结论
func (s *LoudnessScanner) Result() LoudnessResult {
	out := LoudnessResult{Frames: s.frames}

	var absSum float64
	var absCount int
	for _, p := range s.blocks {
		if powerToLUFS(p) > scAbsoluteGate {
			absSum += p
			absCount++
		}
	}
	if absCount > 0 {
		rel := powerToLUFS(absSum/float64(absCount)) + scRelativeGateLU
		var sum float64
		var count int
		for _, p := range s.blocks {
			l := powerToLUFS(p)
			if l > scAbsoluteGate && l > rel {
				sum += p
				count++
			}
		}
		if count > 0 {
			out.Integrated = powerToLUFS(sum / float64(count))
		}
	}
	out.LRA = s.loudnessRange()
	if s.peak > 0 {
		out.TruePeak = 20 * math.Log10(s.peak)
	}
	return out
}

func (s *LoudnessScanner) loudnessRange() float64 {
	var absSum float64
	var absCount int
	for _, p := range s.blocks {
		if powerToLUFS(p) > scAbsoluteGate {
			absSum += p
			absCount++
		}
	}
	if absCount == 0 {
		return 0
	}
	rel := powerToLUFS(absSum/float64(absCount)) - 20.0
	short := make([]float64, 0, len(s.blocks))
	for _, p := range s.blocks {
		l := powerToLUFS(p)
		if l > scAbsoluteGate && l > rel {
			short = append(short, l)
		}
	}
	if len(short) < 2 {
		return 0
	}
	sortFloats(short)
	return percentile(short, 0.95) - percentile(short, 0.10)
}

func powerToLUFS(power float64) float64 {
	if power <= 0 {
		return math.Inf(-1)
	}
	return scLoudnessOffset + 10*math.Log10(power)
}

// sortFloats 排序（LRA 分位数用）。
//
// 用标准库的 pdqsort，不手写插入排序：这里装的是全部通过门限的 400ms 块，
// 块步进 100ms，也就是约 10 × 时长（秒）个元素 —— 3 分钟的歌约 1800 个，
// 1 小时的 DJ set 约 36000 个，O(k²) 就是 3 亿次比较。
func sortFloats(a []float64) { sort.Float64s(a) }

// percentile 线性插值分位数（p 取 0~1）
func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return sorted[0]
	}
	pos := p * float64(len(sorted)-1)
	lo := int(math.Floor(pos))
	hi := int(math.Ceil(pos))
	if lo < 0 {
		lo = 0
	}
	if hi >= len(sorted) {
		hi = len(sorted) - 1
	}
	if lo == hi {
		return sorted[lo]
	}
	frac := pos - float64(lo)
	return sorted[lo]*(1-frac) + sorted[hi]*frac
}
