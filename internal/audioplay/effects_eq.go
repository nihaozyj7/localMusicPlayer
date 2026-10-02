/* ==========================================================================
   effects_eq.go — 双二阶（biquad）参数均衡器
   --------------------------------------------------------------------------
   为什么自己写而不是调库：
   均衡器本身很简单（每个频段一个二阶 IIR），但**集成约束**很苛刻 —— 它跑在
   音频回调里，必须零分配、零阻塞、参数可随时改而不爆音。自己写才能把这些
   约束直接写进类型里（预分配状态、无锁参数快照、逐帧插值），引一个通用 DSP
   库反而要围着它的内存模型绕。

   --------------------------------------------------------------------------
   为什么用 RBJ Audio EQ Cookbook 的系数

   这是业界事实标准（Web Audio 的 BiquadFilterNode、Equalizer APO、SoX、
   ffmpeg 的 equalizer 滤镜用的都是同一组公式）。用它的直接好处是：同一条
   "清澈人声" 曲线在前端 Web Audio 路径与后端原生路径上算出来是**同一个
   传递函数**，不会出现「切到原生播放声音就变了」。

   Q 与带宽的关系：peaking 用 Q 定义锐度，官方文档给的是
   Q = 1 / (2 * sinh(ln(2)/2 * BW * w0/sin(w0)))，本文件直接接受 Q ——
   预设表是手工调的，用 Q 比用倍频程带宽更直观。

   --------------------------------------------------------------------------
   数值格式：内部 float64，进出 int16

   滤波器内部状态用 float64 累加，只在读写的两端转 int16：
     · 内部用 int16 会让递归的舍入误差不断累积，低频频段会听到明显的
       "颗粒感"（量化噪声被反馈回路放大）；
     · 但对外的 buf 是 s16le 的（见 engine.go 的 PCM 布局），
       所以每个样本进出各转一次。这两次转换是免费的（x86 上就是
       cvtsi2sd / cvttsd2si）。

   --------------------------------------------------------------------------
   Direct Form I 而不是 Direct Form II

   教科书上 DF-II 更省内存（N 个状态 vs 2N 个），但它的中间累加器在
   **系数突变**时会剧烈跳变 —— 而本文件的参数是可实时改的。DF-I 的两个
   延迟单元直接对应输入/输出的历史样本，改系数只影响"新的加权方式"，
   不会把已积累的内部能量瞬间放大。代价是每段多两个 float64，可以忽略。
   ========================================================================== */

package audioplay

import "math"

// maxEQBands 是参数均衡器的频段数上限。
//
// 10 段是播放器里最常见的规格（Winamp / foobar2000 / 手机播放器都是 10 段），
// 再多对"听感预设"这种用法没有意义：预设曲线本来就是宽的，段数堆上去只会
// 让相邻段互相打架（相邻峰叠加会形成梳状起伏），反而更难调。
const maxEQBands = 10

// biquad 是单个双二阶滤波器（一个频段）。
//
// 系数（b0/b1/b2/a1/a2）是**归一化后**的（已经除过 a0），
// 所以每个样本只需 5 次乘加。
type biquad struct {
	b0, b1, b2, a1, a2 float64

	// Direct Form I 的状态：x1/x2 是输入历史，y1/y2 是输出历史。
	// ★ 左右声道各一套。立体声不能共用一套状态（那等于把两个声道相加），
	// 而两套状态又必须由同一个 filter 对象持有 —— 分成两个对象会让
	// "改系数" 变成两次操作，中间那个瞬间左右声道系数不一致，声像会飘。
	x1l, x2l, y1l, y2l float64
	x1r, x2r, y1r, y2r float64
}

// reset 清空滤波器状态（切歌 / 关闭音效时调用）。
//
// ★ 为什么必须清：不清的话，上一首歌在延迟单元里残留的能量会在开新歌的
// 第一个样本上被重新加进去 —— 听感上是切歌瞬间的一声"噗"。
func (b *biquad) reset() {
	*b = biquad{b0: b.b0, b1: b.b1, b2: b.b2, a1: b.a1, a2: b.a2}
}

// processStereo 就地对一帧（左右各一个样本）套用本滤波段。
//
// 参数是 float64 的左右样本（-1..1），返回滤波后的左右样本。
// 用值传递而不是指针：调用方在每帧的热循环里，指针会妨碍内联。
func (b *biquad) processStereo(xl, xr float64) (float64, float64) {
	// 左声道
	yl := b.b0*xl + b.b1*b.x1l + b.b2*b.x2l - b.a1*b.y1l - b.a2*b.y2l
	b.x2l, b.x1l = b.x1l, xl
	b.y2l, b.y1l = b.y1l, yl

	// 右声道
	yr := b.b0*xr + b.b1*b.x1r + b.b2*b.x2r - b.a1*b.y1r - b.a2*b.y2r
	b.x2r, b.x1r = b.x1r, xr
	b.y2r, b.y1r = b.y1r, yr
	return yl, yr
}

/* --------------------------------------------------------------------------
   RBJ Audio EQ Cookbook 系数
   --------------------------------------------------------------------------
   所有设计函数都返回**已归一化**的系数（除过 a0）。
   注意 a1/a2 的符号约定：传递函数写成
       H(z) = (b0 + b1 z⁻¹ + b2 z⁻²) / (1 + a1 z⁻¹ + a2 z⁻²)
   所以 processStereo 里是 **减** a1*y1 - a2*y2。
   -------------------------------------------------------------------------- */

// biquadCoeffs 是一组设计好的系数（未绑定到具体滤波器实例）
type biquadCoeffs struct {
	b0, b1, b2, a1, a2 float64
}

// designPeaking 设计一个峰值（bell）滤波器：在 f0 处提升/衰减 gainDB，
// 带宽由 Q 决定（Q 越大越窄）。
//
// 这是"清澈人声""低音增强"这类预设的主力 —— 所有"某个频段多一点/少一点"
// 的需求最终都是若干个 peaking 的叠加。
func designPeaking(f0, q, gainDB, sampleRate float64) biquadCoeffs {
	if q <= 0 {
		q = 0.707
	}
	a := math.Pow(10, gainDB/40) // A = 10^(dB/40)
	w0 := 2 * math.Pi * f0 / sampleRate
	cosW, sinW := math.Cos(w0), math.Sin(w0)
	alpha := sinW / (2 * q)

	b0 := 1 + alpha*a
	b1 := -2 * cosW
	b2 := 1 - alpha*a
	a0 := 1 + alpha/a
	a1 := -2 * cosW
	a2 := 1 - alpha/a

	return biquadCoeffs{b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0}
}

// designLowShelf 设计低架滤波器：f0 以下整体提升/衰减 gainDB。
//
// 斜率固定用 S=1（最平缓的一档）。做出更陡的架子（S<1）会让低频段的
// 相位旋转更剧烈，在"低音增强"这种用法下听感发闷。
func designLowShelf(f0, gainDB, sampleRate float64) biquadCoeffs {
	const s = 1.0
	a := math.Pow(10, gainDB/40)
	w0 := 2 * math.Pi * f0 / sampleRate
	cosW, sinW := math.Cos(w0), math.Sin(w0)
	// 架子滤波器的 alpha 用 S 定义，而不是 Q
	alpha := sinW / 2 * math.Sqrt((a+1/a)*(1/s-1)+2)

	// 2*sqrt(A)*alpha 在公式里出现三次，提出来避免重复开方
	twoSqrtAAlpha := 2 * math.Sqrt(a) * alpha

	b0 := a * ((a + 1) - (a-1)*cosW + twoSqrtAAlpha)
	b1 := 2 * a * ((a - 1) - (a+1)*cosW)
	b2 := a * ((a + 1) - (a-1)*cosW - twoSqrtAAlpha)
	a0 := (a + 1) + (a-1)*cosW + twoSqrtAAlpha
	a1 := -2 * ((a - 1) + (a+1)*cosW)
	a2 := (a + 1) + (a-1)*cosW - twoSqrtAAlpha

	return biquadCoeffs{b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0}
}

// designHighShelf 设计高架滤波器：f0 以上整体提升/衰减 gainDB。
// 用于"清澈人声"的高频空气感与"柔和"预设的高频收敛。
func designHighShelf(f0, gainDB, sampleRate float64) biquadCoeffs {
	const s = 1.0
	a := math.Pow(10, gainDB/40)
	w0 := 2 * math.Pi * f0 / sampleRate
	cosW, sinW := math.Cos(w0), math.Sin(w0)
	alpha := sinW / 2 * math.Sqrt((a+1/a)*(1/s-1)+2)
	twoSqrtAAlpha := 2 * math.Sqrt(a) * alpha

	b0 := a * ((a + 1) + (a-1)*cosW + twoSqrtAAlpha)
	b1 := -2 * a * ((a - 1) + (a+1)*cosW)
	b2 := a * ((a + 1) + (a-1)*cosW - twoSqrtAAlpha)
	a0 := (a + 1) - (a-1)*cosW + twoSqrtAAlpha
	a1 := 2 * ((a - 1) - (a+1)*cosW)
	a2 := (a + 1) - (a-1)*cosW - twoSqrtAAlpha

	return biquadCoeffs{b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0}
}

// designHighPass 设计二阶高通：f0 以下按 12dB/oct 衰减。
//
// ★ 这是"清澈人声"的关键一段而不是可选项：人声基频最低约 80Hz，
// 而流行乐的底鼓/贝斯能量集中在 40-100Hz。把 100Hz 以下切掉，
// 人声不需要变响就已经"浮"出来了 —— 比单纯抬高 3kHz 自然得多
// （抬高 3kHz 到一定程度会变成刺耳的"齿音"）。
func designHighPass(f0, q, sampleRate float64) biquadCoeffs {
	if q <= 0 {
		q = 0.707
	}
	w0 := 2 * math.Pi * f0 / sampleRate
	cosW, sinW := math.Cos(w0), math.Sin(w0)
	alpha := sinW / (2 * q)

	b0 := (1 + cosW) / 2
	b1 := -(1 + cosW)
	b2 := (1 + cosW) / 2
	a0 := 1 + alpha
	a1 := -2 * cosW
	a2 := 1 - alpha

	return biquadCoeffs{b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0}
}
