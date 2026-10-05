/* ==========================================================================
   accrual.go — 流式响度累积器（边解码边算，固定内存）
   --------------------------------------------------------------------------
   为什么要「流式」而不是「整首读进来再算」

   bs1770.go 里的 IntegratedLUFS/IntegratedLRA/TruePeakDBTP 接收的是
   [][]float64 —— 一首 5 分钟的歌是 2×1323 万个 float64 = **212MB**。
   整首读进内存再算，光是内存就把收益吃光了，更何况并发跑两首。

   本文件的 Accumulator 把同样的事拆成「喂一块、算一块」：

     · K 加权是**逐样本**的 IIR（两个 biquad 串联），天然可以跨块延续
       （状态就是 4 个 float64），所以滤波可以边读边做；
     · 400ms 块带 75% 重叠（步进 100ms），只要维护一个「滑动窗口内的平方和」
       就能在流上增量计算每块的能量；
     · 真峰值的 4 相 FIR 只需要看当前样本附近 12 个点，跨块时保留尾部即可；
     · 两级门限需要**全部块的功率列表**才能算 —— 但它每 100ms 才一条，
       5 分钟的歌只有 3000 个 float64（24KB），可以整个留下。

   于是测量一首歌常驻内存只有几十 KB，与歌长无关。

   --------------------------------------------------------------------------
   正确性与 bs1770.go 的一致性

   本文件是 bs1770.go 的流式等价实现，两者必须在数值上一致（误差仅来自
   浮点累加顺序）。测试用同一段 PCM 分别走两条路径对比（见 accrual_test.go）。
   单位、门限、常数一律复用 bs1770.go 里的定义，不在这里另写一份。
   ========================================================================== */

package loudness

import (
	"math"
	"sync"
)

// 真峰值插值系数（与 bs1770.go 的 truePeakPhases 是同一组，48kHz 标准值）
// —— 这里只需要一份，避免两处系数不同步。

// blockAcc 一个 400ms 块的功率（各声道加权平方和）
// 与 bs1770.go 的 blockEnergy 同义，但只保留我们需要的标量。

// Accumulator 流式累积响度。
//
// 使用方式：NewAccumulator(rate, channels) → 反复 Write(chunk) →
// 最后 Result()。Write 接收**交错**的声道样本（每个样本一个 float64，
// 标称范围 ±1.0），与 audioplay 解码出来的 PCM 布局一致。
//
// 并发：Write 与 Result 不能被并发调用（内部没有加锁）—— 它本来就是
// 单条解码流水线上的一环。唯一例外是 Result 会在内部对块功率排序，
// 那一步不碰累积状态。
type Accumulator struct {
	rate     int
	channels int

	// —— K 加权滤波器状态（每个声道两级 biquad 的 4 个状态量）——
	// 用 transposed direct form II，与 bs1770.go 的 kWeight 完全一致。
	coeff [2]biquad
	kw    []kWeightState

	// —— 块累积 ——
	// blockLen / stepLen 以**帧**为单位
	blockLen int
	stepLen  int
	// ring 是滑动窗口：保留最近 blockLen 帧的 K 加权样本（每个声道一条）。
	// 每到产出点就对它重算一次平方和（见 emitBlock 的说明）。
	ring    [][]float64
	ringPos int
	// blocks 是已产出的块功率（每 100ms 一条）
	blocks []float64
	// 已喂进 ring 的帧数（用于判断"凑满一个块了没有"）
	filled int

	// —— 真峰值 ——
	// tail 保留上一块末尾的几个样本，让跨块的插值窗口不被截断
	tail      []float64
	truePeak  float64
	sawSample bool

	// kwScratch 是复用的「0 号声道 K 加权结果」缓冲（喂给真峰值用）。
	// 复用它是为了让「转码时顺手测量」这条路在整首歌上不产生垃圾 ——
	// 那是一条跑在音频解码循环里的热路径。
	kwScratch []float64

	// —— 元信息 ——
	frames int64
}

type kWeightState struct {
	// 两级各自的两个状态
	s1, s2 [2]float64
}

// AccChunkFrames 是建议的喂块大小（帧）。
//
// 取 1 秒：比 100ms 的块步长大一个数量级，块计算的分摊开销可以忽略；
// 同时它让「喂进来的块边界」永远不会被误当成「块边界」——
// 块边界完全由 stepLen 决定，与喂块边界无关。
const AccChunkFrames = 44100

// NewAccumulator 创建累积器。channels 目前只用得到 1 与 2。
func NewAccumulator(rate, channels int) *Accumulator {
	if rate <= 0 {
		rate = 48000
	}
	if channels <= 0 {
		channels = 2
	}
	a := &Accumulator{
		rate:     rate,
		channels: channels,
		coeff:    coefficientFor(rate),
		blockLen: int(blockSeconds * float64(rate)),
		stepLen:  int(stepSeconds * float64(rate)),
	}
	a.kw = make([]kWeightState, channels)
	a.ring = make([][]float64, channels)
	for c := range a.ring {
		a.ring[c] = make([]float64, a.blockLen)
	}
	return a
}

// Write 喂一块**交错**样本（frames*channels 个）。
//
// 最后一块可以不足一整帧的整数倍，多余样本会被忽略。
func (a *Accumulator) Write(samples []float64) {
	if len(samples) == 0 || a.blockLen <= 0 || a.stepLen <= 0 {
		return
	}
	frames := len(samples) / a.channels
	if frames == 0 {
		return
	}

	// scratch 暂存 **0 号声道的原始样本**，供真峰值使用。
	//
	// ★ 真峰值必须量在**原始信号**上，不能量在 K 加权之后的结果上。
	//
	// K 加权的高架滤波在 997Hz 附近有约 +0 dB 的增益、在低频还有提升，
	// 拿它去算真峰值会得到一个比真实峰值更大的数（实测满量程正弦被算成
	// +1.16 dBTP）。而真峰值保护（GainDB 里那条）正是要防止抬升后削波，
	// 它必须看到真实的样本幅度。
	if cap(a.kwScratch) < frames {
		a.kwScratch = make([]float64, frames)
	}
	scratch := a.kwScratch[:frames]
	for i := 0; i < frames; i++ {
		scratch[i] = samples[i*a.channels]
	}

	// ★ 所有声道必须**同步推进**环形缓冲的下标，而且「第几帧」必须是
	//   **全局**帧号（a.filled + 本块内的下标），不能是本次 Write 内部的
	//   局部下标 —— 后者每次调用都从 0 重新开始，会让窗口滑动整体错位。
	//
	// 这里刻意**不用"增量加减维护平方和"的写法**。
	//
	// 那个写法看起来省一次循环，但它把三个量（全局帧号、环形下标、
	// 窗口是否已满）耦合在一起，任何一个差一格都会让块功率**逐块线性漂移**
	// —— 实测写错过两次：块 0 正确、块 1 起每块多出 stepLen 帧的能量，
	// 第 4 块已偏高 1 倍，整合响度虚高 9 LU。而这类错误在"一次性喂整首歌"
	// 时看不出来，只有按 1 秒一块喂（转码时的真实用法）才稳定复现。
	//
	// 现在的做法：环形缓冲仍然保留最近 blockLen 帧的**样本**，
	// 每到产出点就把这 blockLen 个样本重算一次平方和。
	// 代价是每个样本被读 4 次（400ms/100ms），而这只是一次乘加 ——
	// 相比"响度算错 9 LU"和"以后没人敢改这段代码"，这个代价完全值得。
	// 整首歌仍然是 O(n)（常数因子 ×4），实测在解码循环里可以忽略。
	for i := 0; i < frames; i++ {
		for c := 0; c < a.channels; c++ {
			x := samples[i*a.channels+c]
			st := &a.kw[c]

			// 第 1 级
			y0 := a.coeff[0].b0*x + st.s1[0]
			st.s1[0] = a.coeff[0].b1*x - a.coeff[0].a1*y0 + st.s2[0]
			st.s2[0] = a.coeff[0].b2*x - a.coeff[0].a2*y0

			// 第 2 级
			y1 := a.coeff[1].b0*y0 + st.s1[1]
			st.s1[1] = a.coeff[1].b1*y0 - a.coeff[1].a1*y1 + st.s2[1]
			st.s2[1] = a.coeff[1].b2*y0 - a.coeff[1].a2*y1

			// 存进环形缓冲（保留最近 blockLen 帧的 K 加权样本）
			a.ring[c][a.ringPos] = y1
		}

		// 写指针前进一格（回绕）
		a.ringPos++
		if a.ringPos >= a.blockLen {
			a.ringPos = 0
		}
		a.filled++

		// 窗口第一次填满就算得出第一个块；之后每走 stepLen 帧产出一个块
		if a.filled >= a.blockLen && (a.filled-a.blockLen)%a.stepLen == 0 {
			a.emitBlock()
		}
	}

	a.frames += int64(frames)

	// —— 真峰值 ——
	//
	// 4 相 FIR 需要 i..i+11 共 12 个**连续**样本。跨块时必须把上一块末尾的
	// 11 个样本接在前面，否则位于喂块边界上的峰会被整段跳过 ——
	// 那样真峰值会随「喂块大小」变化，正是 TestAccumulatorChunkingIsIrrelevant
	// 会抓到的错误。
	a.accumulateTruePeak(a.tail, scratch)

	// 记下本块末尾 11 个样本，供下一块接续
	keep := 11
	if len(scratch) < keep {
		keep = len(scratch)
	}
	if cap(a.tail) < keep {
		a.tail = make([]float64, keep)
	}
	a.tail = a.tail[:keep]
	copy(a.tail, scratch[len(scratch)-keep:])
}

// emitBlock 产出一个块的功率：对环形缓冲里保留的最近 blockLen 帧重算平方和。
//
// 每次重算是 blockLen 次乘加，而块步进是 stepLen = blockLen/4，
// 也就是每个样本被读 4 遍。整首歌仍是 O(n)。
// 为什么不用"增量加减"省掉这 4 倍：见 Write 里的详细说明 ——
// 那个写法极易差一格，代价是响度整体算错 9 LU。
func (a *Accumulator) emitBlock() {
	var sum float64
	for c := range a.ring {
		var s float64
		for _, v := range a.ring[c] {
			s += v * v
		}
		sum += s / float64(a.blockLen)
	}
	a.blocks = append(a.blocks, sum)
}

// accumulateTruePeak 对「上一块末尾的接续样本 + 本块样本」做 4 相过采样，
// 更新真峰值。
//
// prev 与 cur 在逻辑上是一段连续信号，拼起来才能覆盖跨块的插值窗口。
func (a *Accumulator) accumulateTruePeak(prev, cur []float64) {
	if len(cur) == 0 {
		return
	}
	// 先看原始采样点（与 bs1770.TruePeakDBTP 的第一步一致）
	for _, v := range prev {
		if av := math.Abs(v); av > a.truePeak {
			a.truePeak = av
		}
	}
	for _, v := range cur {
		if av := math.Abs(v); av > a.truePeak {
			a.truePeak = av
		}
	}

	// 再过采样插值，捕捉采样点之间的峰。
	//
	// 只对「12 个抽头都落在真实样本上」的窗口做卷积 —— 与
	// bs1770.TruePeakDBTP 的 `i+len(phases[0]) <= len(ch)` 完全同口径。
	// 边界处补 0 再卷积是错的：补出来的 0 会把窗口里的真实样本权重改掉，
	// 反而造出一个不存在的"峰"（实测真峰值虚高 1.6 dB）。
	phases := truePeakPhases[:]
	taps := len(phases[0])
	total := len(prev) + len(cur)
	// at 把「接续段 + 本块」当成一条连续的信号来索引
	at := func(i int) float64 {
		if i < len(prev) {
			return prev[i]
		}
		return cur[i-len(prev)]
	}
	// 窗口起点从 prev 的第 0 个样本开始：这样跨块边界的那一段也能被覆盖，
	// 且每个窗口读到的都是真实样本（不补 0）。
	for i := 0; i+taps <= total; i++ {
		for p := range phases {
			ph := &phases[p]
			var acc float64
			for k := 0; k < taps; k++ {
				acc += ph[k] * at(i+k)
			}
			if av := math.Abs(acc); av > a.truePeak {
				a.truePeak = av
			}
		}
	}
	a.sawSample = a.sawSample || total > 0
}

// Result 汇总出测量结果。返回的 Measurement 只填了固有量，
// Path/Size/ModTime/Algo 由调用方补（那些不是音频内容算出来的）。
//
// 与 bs1770.go 的 IntegratedLUFS + IntegratedLRA + TruePeakDBTP 等价。
func (a *Accumulator) Result() Measurement {
	out := Measurement{}
	if len(a.blocks) == 0 && !a.sawSample {
		return out
	}

	// 两级门限（全程在功率域，只在最后转一次响度 —— 标定常数 -0.691
	// 只能被计入一次，这是 bs1770.go 里踩过的坑）。
	var absSum float64
	var absCount int
	for _, p := range a.blocks {
		if powerToLoudness(p) > absoluteGate {
			absSum += p
			absCount++
		}
	}
	if absCount > 0 {
		relative := powerToLoudness(absSum/float64(absCount)) + relativeGateLU
		var sum float64
		var count int
		for _, p := range a.blocks {
			l := powerToLoudness(p)
			if l > absoluteGate && l > relative {
				sum += p
				count++
			}
		}
		if count > 0 {
			out.Integrated = powerToLoudness(sum / float64(count))
		} else {
			out.Integrated = math.Inf(-1)
		}
	} else {
		out.Integrated = math.Inf(-1)
	}
	if math.IsInf(out.Integrated, -1) {
		// 整段静音或过短：与 analyse 的既有语义一致 —— 不做任何补偿
		out.Integrated = 0
	}

	out.LRA = a.loudnessRange()
	if a.truePeak <= 0 {
		out.TruePeak = math.Inf(-1)
	} else {
		out.TruePeak = 20 * math.Log10(a.truePeak)
	}
	if math.IsInf(out.TruePeak, -1) {
		// 静音没有真峰值，用 0 表示「没有数据」（GainDB 里有 0 判断）
		out.TruePeak = 0
	}
	return out
}

// loudnessRange 按 EBU Tech 3342 算 LRA（与 bs1770.loudnessRange 同算法）
func (a *Accumulator) loudnessRange() float64 {
	var absSum float64
	var absCount int
	for _, p := range a.blocks {
		if powerToLoudness(p) > absoluteGate {
			absSum += p
			absCount++
		}
	}
	if absCount == 0 {
		return 0
	}
	rel := powerToLoudness(absSum/float64(absCount)) - 20.0

	short := make([]float64, 0, len(a.blocks))
	for _, p := range a.blocks {
		l := powerToLoudness(p)
		if l > absoluteGate && l > rel {
			short = append(short, l)
		}
	}
	if len(short) < 2 {
		return 0
	}
	sortFloats(short)
	lo := percentile(short, 0.10)
	hi := percentile(short, 0.95)
	if hi < lo {
		return 0
	}
	return hi - lo
}

// Frames 返回已喂入的总帧数（诊断 / 测试用）
func (a *Accumulator) Frames() int64 { return a.frames }

/* --------------------------------------------------------------------------
   便捷入口：一次性算完一段 PCM
   -------------------------------------------------------------------------- */

// pcmAccPool 复用累积器里的临时切片，避免每次测量都重新分配。
//
// 为什么池化：一次测量会走几十毫秒的解码循环，期间会构造若干临时切片。
// 池本身不是性能关键（测量本来就是后台工作），但它能让「同时跑 2 个测量」
// 时的内存曲线是平的，而不是每次抖动一下。
var pcmAccPool = sync.Pool{New: func() any { return make([]float64, 0, 8192) }}
