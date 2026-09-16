// Package loudness 计算音频响度并给出回放补偿增益。
//
// 本文件是 ITU-R BS.1770-4 / EBU R128 的纯 Go 实现：K 加权滤波 + 门限积分响度
// + 真峰值（4 倍过采样）。不依赖 ffmpeg，因此可以：
//   - 直接对已经解码好的 PCM 样本计算，省掉一次独立解码；
//   - 在没有 ffmpeg 的环境下也能工作（只要格式能被 Go 侧解码）。
//
// 实现依据（BS.1770-4）：
//   - 第 2 阶段的"RLB"高通 + 第 1 阶段的高架滤波构成 K 加权；
//   - 400ms 块、75% 重叠（步进 100ms）；
//   - 绝对门限 -70 LKFS，相对门限 = 门限后平均响度 - 10 LU；
//   - 单声道/左右声道权重 1.0，环绕声道 1.41（这里只用到前两者）；
//   - 常数为 -0.691（把 997Hz 满量程正弦标定到 -3.01 LKFS）。
package loudness

import (
	"math"
	"sort"
	"sync"
)

/* --------------------------------------------------------------------------
   K 加权滤波器
   --------------------------------------------------------------------------
   BS.1770 的两级 IIR 串联。表里的系数是 48kHz 的，其它采样率按标准附录的
   双线性变换重新算（下面 coefficientFor 就是做这件事）。
   -------------------------------------------------------------------------- */

type biquad struct{ b0, b1, b2, a1, a2 float64 }

// bs1770_48k 是标准给出的 48kHz 系数（也是其它采样率的推导基准）
var bs1770_48k = [2]biquad{
	// 第 1 级：高架滤波（模拟头部声学）
	{b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285,
		a1: -1.69065929318241, a2: 0.73248077421585},
	// 第 2 级：RLB 高通
	{b0: 1.0, b1: -2.0, b2: 1.0,
		a1: -1.99004745483398, a2: 0.99007225036621},
}

// coefficientCache 按采样率缓存推导出的系数。
//
// 用 sync.Map 而不是普通 map：IntegratedLUFS / IntegratedLRA / TruePeakDBTP
// 都是导出函数，任何并发调用都会在普通 map 上产生数据竞争，而在 Go 里
// 「并发 map 读写」是 fatal error（不可 recover）。目前生产路径走 ffmpeg，
// 没有并发调用者，但这是对外导出 API 的潜在崩溃点，代价只有一行。
// 采样率种类极少（44.1k / 48k / 96k…），不存在无界增长。
var coefficientCache sync.Map // int -> [2]biquad

// coefficientFor 取得某采样率下的 K 加权系数。
//
// 48kHz 直接用标准值；其它采样率用标准的双线性变换推导方式重算：
// 把标准里的模拟极零点按采样率重新映射。这里采用 BS.1770 附录里
// 与 libebur128 相同的做法 —— 先用 48kHz 系数反推模拟域参数，
// 再按目标采样率做双线性变换。
func coefficientFor(rate int) [2]biquad {
	if c, ok := coefficientCache.Load(rate); ok {
		return c.([2]biquad)
	}
	if rate == 48000 {
		coefficientCache.Store(rate, bs1770_48k)
		return bs1770_48k
	}

	// 把 48kHz 的数字系数映射到目标采样率。
	// 方法：先算出该滤波器在 48kHz 下的极零点，再对这些点做
	// 「数字频率 → 模拟频率」的逆映射，最后用目标采样率重新离散化。
	out := [2]biquad{}
	for i, st := range bs1770_48k {
		out[i] = resampleBiquad(st, 48000, rate)
	}
	// 并发调用时可能有两个 goroutine 同时算出同一个 rate 的值 —— 结果相同，
	// 覆盖是幂等的，不需要 double-check 锁。
	coefficientCache.Store(rate, out)
	return out
}

// resampleBiquad 把一个 biquad 从 fromRate 重新推导到 toRate。
//
// 对 0.0 < f < 0.5 的每个数字极/零点 z，先映射为模拟角频率
// s = 2·fs·(z-1)/(z+1)，再以新采样率做双线性变换
// z' = (2·fs' + s) / (2·fs' - s)。这样可以严格保持原滤波器的频率响应形状，
// 这也是 libebur128 / ffmpeg 处理非 48kHz 时的通行做法。
func resampleBiquad(st biquad, fromRate, toRate int) biquad {
	if fromRate == toRate {
		return st
	}
	// 由 a1,a2 求极点（分母 z² + a1·z + a2）
	p1, p2 := quadRoots(1, st.a1, st.a2)
	// 由 b0,b1,b2 求零点
	var z1, z2 complex128
	if math.Abs(st.b0) > 1e-15 {
		z1, z2 = quadRoots(st.b0, st.b1, st.b2)
	} else {
		return st
	}

	z1 = mapRoot(z1, float64(fromRate), float64(toRate))
	z2 = mapRoot(z2, float64(fromRate), float64(toRate))
	p1 = mapRoot(p1, float64(fromRate), float64(toRate))
	p2 = mapRoot(p2, float64(fromRate), float64(toRate))

	// 保持原滤波器的直流增益，避免整体电平漂移
	gain := biquadGainAtDC(st)
	out := polyToBiquad(z1, z2, p1, p2)
	// 用直流增益归一到原值
	dcNew := biquadGainAtDC(out)
	if math.Abs(dcNew) > 1e-15 {
		k := gain / dcNew
		out.b0 *= k
		out.b1 *= k
		out.b2 *= k
	}
	return out
}

// mapRoot 把一个数字域的根按采样率变换映射到新的数字域
func mapRoot(z complex128, fromRate, toRate float64) complex128 {
	// 数字域 → 模拟域
	s := 2 * complex(fromRate, 0) * (z - 1) / (z + 1)
	// 模拟域 → 新数字域
	return (2*complex(toRate, 0) + s) / (2*complex(toRate, 0) - s)
}

// quadRoots 解 a·z² + b·z + c = 0
func quadRoots(a, b, c float64) (complex128, complex128) {
	disc := complex(b*b-4*a*c, 0)
	sq := csqrt(disc)
	twoA := complex(2*a, 0)
	return (-complex(b, 0) + sq) / twoA, (-complex(b, 0) - sq) / twoA
}

func csqrt(c complex128) complex128 {
	r := math.Hypot(real(c), imag(c))
	re := math.Sqrt((r + real(c)) / 2)
	im := math.Sqrt((r - real(c)) / 2)
	if imag(c) < 0 {
		im = -im
	}
	return complex(re, im)
}

// polyToBiquad 由零点/极点构造 biquad（分子分母都按 z 的降幂排）
func polyToBiquad(z1, z2, p1, p2 complex128) biquad {
	b1 := -(z1 + z2)
	b2 := z1 * z2
	a1 := -(p1 + p2)
	a2 := p1 * p2
	return biquad{
		b0: 1,
		b1: real(b1),
		b2: real(b2),
		a1: real(a1),
		a2: real(a2),
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

// kWeight 对整条声道做 K 加权，返回加权后的样本。
//
// 用 transposed direct form II（每个滤波器只保留两个状态），
// 比直接型在浮点下更稳。
func kWeight(samples []float64, rate int) []float64 {
	co := coefficientFor(rate)
	out := make([]float64, len(samples))

	for stage := 0; stage < 2; stage++ {
		f := co[stage]
		var s1, s2 float64
		for i, x := range samples {
			y := f.b0*x + s1
			s1 = f.b1*x - f.a1*y + s2
			s2 = f.b2*x - f.a2*y
			out[i] = y
		}
		samples = out
	}
	return out
}

/* --------------------------------------------------------------------------
   门限积分响度
   -------------------------------------------------------------------------- */

// 常量与门限（BS.1770-4 / EBU R128）
const (
	// 400ms 块，75% 重叠 → 每 100ms 一个块
	blockSeconds   = 0.400
	stepSeconds    = 0.100
	absoluteGate   = -70.0 // 绝对门限 LKFS
	relativeGateLU = -10.0 // 相对门限（相对门限后平均值）
	loudnessOffset = -0.691
)

// IntegratedLUFS 计算整合响度（LKFS/LUFS）。
//
// channels 是各声道的 PCM 浮点样本（标称范围 ±1.0），长度应一致；
// rate 是采样率。样本不足一个门限块时返回 -Inf。
func IntegratedLUFS(channels [][]float64, rate int) float64 {
	lufs, _ := integrate(measureBlocks(channels, rate))
	return lufs
}

// IntegratedLRA 计算响度范围（LRA，EBU Tech 3342），单位 LU。
func IntegratedLRA(channels [][]float64, rate int) float64 {
	_, l := integrate(measureBlocks(channels, rate))
	return l
}

// blockEnergy 一个 400ms 块里各声道的 K 加权均方能量
type blockEnergy struct {
	energy []float64 // 各声道能量
}

// measureBlocks 做 K 加权并按 400ms/100ms 切块，返回块能量。
func measureBlocks(channels [][]float64, rate int) []blockEnergy {
	if rate <= 0 || len(channels) == 0 {
		return nil
	}
	n := len(channels[0])
	if n == 0 {
		return nil
	}
	for _, ch := range channels {
		if len(ch) < n {
			n = len(ch)
		}
	}

	// 各声道分别 K 加权
	weighted := make([][]float64, len(channels))
	for i, ch := range channels {
		weighted[i] = kWeight(ch[:n], rate)
	}

	blockLen := int(blockSeconds * float64(rate))
	stepLen := int(stepSeconds * float64(rate))
	if blockLen <= 0 || stepLen <= 0 || n < blockLen {
		return nil
	}

	var blocks []blockEnergy
	for start := 0; start+blockLen <= n; start += stepLen {
		e := make([]float64, len(weighted))
		for c, ch := range weighted {
			var sum float64
			for i := start; i < start+blockLen; i++ {
				sum += ch[i] * ch[i]
			}
			e[c] = sum / float64(blockLen)
		}
		blocks = append(blocks, blockEnergy{energy: e})
	}
	return blocks
}

// blockPower 一个块的「功率」（各声道 K 加权均方能量之和）。
//
// 门限比较要在这个功率域（或换算成响度）做，**不能**把已经带上标定常数的
// 响度值再当功率累加 —— 那样 -0.691 会被重复计入。
// 第一版就踩了这个坑：块响度算出来是 -3.009 正确，但 integrate 里又减了一次
// 常数，整体偏了 0.691 LU。
func blockPower(b blockEnergy) float64 {
	var sum float64
	for _, e := range b.energy {
		sum += e // 前声道权重均为 1.0
	}
	return sum
}

// powerToLoudness 功率 → 响度（LKFS）
func powerToLoudness(power float64) float64 {
	if power <= 0 {
		return math.Inf(-1)
	}
	return loudnessOffset + 10*math.Log10(power)
}

// blockLoudness 由块能量算该块的响度（LKFS）
func blockLoudness(b blockEnergy) float64 {
	return powerToLoudness(blockPower(b))
}

// integrate 应用两级门限得到整合响度；同时按 EBU Tech 3342 算 LRA。
//
// 全程在功率域累加，只在最后转一次响度，保证标定常数只被计入一次。
func integrate(blocks []blockEnergy) (lufs, lra float64) {
	if len(blocks) == 0 {
		return math.Inf(-1), 0
	}

	// 第一级：绝对门限（块响度 > -70 LKFS）
	var (
		absSum   float64 // 通过绝对门限的功率和
		absCount int
	)
	for _, b := range blocks {
		if l := blockLoudness(b); l > absoluteGate {
			absSum += blockPower(b)
			absCount++
		}
	}
	if absCount == 0 {
		return math.Inf(-1), 0
	}

	// 相对门限 = 通过绝对门限块的平均响度 - 10 LU
	relativeThreshold := powerToLoudness(absSum/float64(absCount)) + relativeGateLU

	// 第二级：绝对 + 相对门限，仍在功率域累加
	var sum float64
	var count int
	for _, b := range blocks {
		if l := blockLoudness(b); l > absoluteGate && l > relativeThreshold {
			sum += blockPower(b)
			count++
		}
	}
	if count == 0 {
		return math.Inf(-1), 0
	}
	lufs = powerToLoudness(sum / float64(count))
	lra = loudnessRange(blocks)
	return lufs, lra
}

// loudnessRange 按 EBU Tech 3342 计算响度范围。
//
// 做法：以「绝对门限通过块的平均响度 - 20 LU」为门限筛选，
// 再取这些块响度的 10% 与 95% 分位数之差。
func loudnessRange(blocks []blockEnergy) float64 {
	var absSum float64
	var absCount int
	for _, b := range blocks {
		if l := blockLoudness(b); l > absoluteGate {
			absSum += blockPower(b)
			absCount++
		}
	}
	if absCount == 0 {
		return 0
	}
	rel := powerToLoudness(absSum/float64(absCount)) - 20.0

	var short []float64
	for _, b := range blocks {
		l := blockLoudness(b)
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

func sortFloats(a []float64) {
	// 用标准库的 pdqsort，不要手写插入排序。
	//
	// 这里以前是插入排序，注释的理由是「小切片」—— 但那个假设不成立：
	// 切片装的是全部通过门限的 400ms 块，而块步进是 100ms（stepSeconds），
	// 也就是约 10 × 时长（秒）个元素：3 分钟的歌约 1800 个，1 小时的
	// DJ set 约 36000 个，O(k²) 就是 3 亿次比较。sort 本来就在标准库里。
	sort.Float64s(a)
}

/* --------------------------------------------------------------------------
   真峰值（BS.1770-4 附录 2）
   --------------------------------------------------------------------------
   对样本做 4 倍过采样后取绝对值最大，再转 dBTP。
   标准给的是 48kHz 下的 4 相 FIR 系数，这里用同一组系数，
   其它采样率下按相同的过采样倍数使用（与 libebur128 的近似做法一致）。
   -------------------------------------------------------------------------- */

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

// TruePeakDBTP 计算真峰值（dBTP）。无声时返回 -Inf。
func TruePeakDBTP(channels [][]float64, rate int) float64 {
	_ = rate
	peak := 0.0
	for _, ch := range channels {
		for _, v := range ch {
			if a := math.Abs(v); a > peak {
				peak = a
			}
		}
	}
	// 4 相过采样插值，捕捉采样点之间的峰
	for _, ch := range channels {
		for i := 0; i+len(truePeakPhases[0]) <= len(ch); i++ {
			for _, ph := range truePeakPhases {
				var acc float64
				for k, c := range ph {
					acc += c * ch[i+k]
				}
				if a := math.Abs(acc); a > peak {
					peak = a
				}
			}
		}
	}
	if peak <= 0 {
		return math.Inf(-1)
	}
	return 20 * math.Log10(peak)
}
