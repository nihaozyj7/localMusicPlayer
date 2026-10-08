/* ==========================================================================
   effects_probe_test.go — 环绕档的**测量探针**
   --------------------------------------------------------------------------
   与 effects_early_test.go / effects_test.go 里那些"判据式"测试不同，
   这个文件的主测试只**打印**，不设门槛：它存在的意义是让下一次
   "用户说没效果"时，能立刻拿到同一张表（频点 × 左右耳电平、
   互相关、侧/中能量比、相对 off 的改变量），直接对照历史数字，
   而不是重新凭感觉调参。

   判据式测试负责"不能变坏"，这张表负责"到底变了什么"。
   两者的分工是刻意的 —— 历史上两次"指标全绿、听感没变"的教训
   都出在只有判据、没有表。
   ========================================================================== */

package audioplay

import (
	"math"
	"testing"
)

// diagChain 构造一条"档位已生效（无淡化过渡）"的音效链。
func diagChain(p EffectPreset) *Chain {
	c := &Chain{}
	c.prepare(44100)
	// fadingOutIsA=false → activeChain == chainA
	c.chainA.applyPreset(p)
	snapCoeffs(&c.chainA.eq)
	c.currentPreset = p
	return c
}

func sumSq(v []float64) float64 {
	s := 0.0
	for _, x := range v {
		s += x * x
	}
	return s
}

// diagNoise 是确定性白噪声，取值严格落在 [-1, 1)。
func diagNoise(n int, amp float64) []float64 {
	out := make([]float64, n)
	seed := uint64(0x123456789abcdef)
	for i := range out {
		seed = seed*6364136223846793005 + 1442695040888963407
		v := float64(seed>>11)/float64(uint64(1)<<53)*2 - 1 // [-1,1)
		out[i] = amp * v
	}
	return out
}

// TestSurroundPerceptualProbe 输出"环绕档到底改变了什么"的完整测量。
//
// 三件事：
//  1. 单声道输入下左右各自的稳态幅度 —— 有没有固定频率的陷波（音色/声像损坏）
//  2. **空间场**（surround − off）的左右互相关 —— 差异带不带时间差
//  3. 宽频侧/中能量比 + 与 off 的能量差
//
// 唯一的断言是"改变量不能小到没有"：这张表本身在 -v 下打印，
// 是给下一轮调参照的。
func TestSurroundPerceptualProbe(t *testing.T) {
	const fs = 44100
	off := diagChain(EffectOff)
	sur := diagChain(EffectSurround)

	// ---- 1. 单声道正弦输入下，左右各自的稳态幅度 ----
	t.Log("freq, L(dB), R(dB), L-R(dB), fold(dB)")
	worst := 0.0
	worstF := 0.0
	for _, f := range []float64{60, 120, 250, 500, 1000, 2000, 4000, 6300, 10000, 14000} {
		n := fs / 2
		in := make([]float64, n)
		for i := range in {
			g := 1.0
			if i < n/4 {
				g = float64(i) / float64(n/4)
			}
			in[i] = 0.5 * g * math.Sin(2*math.Pi*f*float64(i)/fs)
		}
		lo, ro := runMono(sur, in)
		a := n / 2
		ampL, ampR := rms(lo[a:]), rms(ro[a:])
		lo2, ro2 := runMono(off, in)
		refL, refR := rms(lo2[a:]), rms(ro2[a:])
		dev := math.Abs(db(ampL) - db(ampR))
		if dev > worst {
			worst, worstF = dev, f
		}
		t.Logf("%6.0fHz  L=%7.2f  R=%7.2f  |L-R|差=%6.2f  fold=%7.2f   [off %.2f/%.2f]",
			f, db(ampL), db(ampR), dev, db(rmsSum(lo[a:], ro[a:])), db(refL), db(refR))
	}
	t.Logf("→ 单耳最大电平差 %.1f dB @ %.0fHz（真实小房间早期反射的量级约 3~6dB）", worst, worstF)

	// ---- 2/3. 宽频单声道：空间场的左右互相关 ----
	const n = 44100 * 3
	in := diagNoise(n, 0.4)
	lo, ro := runMono(sur, in)
	lo0, ro0 := runMono(off, in)

	// 空间场 = surround − off（把"没变的直达声"剔掉，只看新增的那部分）
	fL := make([]float64, n)
	fR := make([]float64, n)
	for i := range in {
		fL[i] = lo[i] - lo0[i]
		fR[i] = ro[i] - ro0[i]
	}
	const skip = 44100
	best, bestLag := 0.0, 0
	for lag := -400; lag <= 400; lag++ {
		s := 0.0
		for i := skip; i < n-skip; i++ {
			j := i + lag
			if j < 0 || j >= n {
				continue
			}
			s += fL[i] * fR[j]
		}
		if math.Abs(s) > math.Abs(best) {
			best, bestLag = s, lag
		}
	}
	eL, eR := rms(fL[skip:n-skip]), rms(fR[skip:n-skip])
	nn := float64(n - 2*skip)
	t.Logf("空间场互相关峰值 lag = %+d 样本 = %+.3f ms（归一化 %.3f）",
		bestLag, float64(bestLag)/fs*1000, best/(nn*eL*eR))
	t.Logf("空间场自身能量：L %.1f dBFS / R %.1f dBFS（相对输入 %.1f dBFS）",
		db(eL), db(eR), db(rms(in)))

	// 完整信号的 ICC（越低越"扩散"）
	segL, segR := lo[skip:n-skip], ro[skip:n-skip]
	s0 := 0.0
	for i := range segL {
		s0 += segL[i] * segR[i]
	}
	t.Logf("整链 ICC(lag=0) = %.3f   [off 档 = %.3f]",
		s0/(float64(len(segL))*rms(segL)*rms(segR)), corrMono(lo0, ro0, skip, n-skip))

	// ---- 4. 宽频侧/中能量比 + 与 off 的能量差 ----
	var midSq, sideSq float64
	for i := skip; i < n-skip; i++ {
		m := (lo[i] + ro[i]) * 0.5
		s := (lo[i] - ro[i]) * 0.5
		midSq += m * m
		sideSq += s * s
	}
	t.Logf("宽频单声道 侧/中 RMS = %.3f（TestSurroundPresetStrongEnoughForHeadphones 门槛 0.45）",
		math.Sqrt(sideSq/midSq))

	diff := 0.0
	for i := range lo {
		dl, dr := lo[i]-lo0[i], ro[i]-ro0[i]
		diff += dl*dl + dr*dr
	}
	orig := sumSq(lo0) + sumSq(ro0)
	ratio := diff / orig
	t.Logf("相对 off 的改变能量占比 = %.2f%% (%.2f dB)", ratio*100, 10*math.Log10(ratio))

	// 断言只有一条：改变量不能小到"开关切换等于没按"。
	// 门槛 5% 对应 -13dB 的能量变化 —— 再低就属于"测得出、听不出"，
	// 那正是前三轮反复出现的状态。
	if ratio < 0.05 {
		t.Errorf("环绕档相对 off 只改变了 %.2f%% 的能量（期望 >= 5%%）—— "+
			"处理链在跑，但量级小到用户听不出区别", ratio*100)
	}
}

func runMono(c *Chain, in []float64) ([]float64, []float64) {
	buf := make([]byte, len(in)*FrameSize)
	for i := range in {
		writeSample(buf, i*FrameSize, in[i])
		writeSample(buf, i*FrameSize+2, in[i])
	}
	c.ProcessStereo(buf)
	l := make([]float64, len(in))
	r := make([]float64, len(in))
	for i := range in {
		l[i] = readSample(buf, i*FrameSize)
		r[i] = readSample(buf, i*FrameSize+2)
	}
	return l, r
}

func corrMono(a, b []float64, from, to int) float64 {
	s, ea, eb := 0.0, 0.0, 0.0
	for i := from; i < to; i++ {
		s += a[i] * b[i]
		ea += a[i] * a[i]
		eb += b[i] * b[i]
	}
	if ea <= 0 || eb <= 0 {
		return 0
	}
	return s / math.Sqrt(ea*eb)
}

func rms(v []float64) float64 {
	s := 0.0
	for _, x := range v {
		s += x * x
	}
	return math.Sqrt(s / float64(len(v)))
}

func rmsSum(a, b []float64) float64 {
	s := 0.0
	for i := range a {
		d := a[i] + b[i]
		s += d * d
	}
	return math.Sqrt(s / float64(len(a)))
}

func db(x float64) float64 {
	if x <= 0 {
		return -999
	}
	return 20 * math.Log10(x)
}
