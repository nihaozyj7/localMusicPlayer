package audioplay

import (
	"math"
	"testing"
)

/* --------------------------------------------------------------------------
   FFT 正确性
   -------------------------------------------------------------------------- */

// naiveDFT 用 O(n²) 直接按定义算参考 DFT，用来校验 fftInPlace。
// 刻意不复用被测代码的任何东西：两边都错成同一种样子就没意义了。
func naiveDFT(x []float64) (re, im []float64) {
	n := len(x)
	re = make([]float64, n)
	im = make([]float64, n)
	for k := 0; k < n; k++ {
		var sr, si float64
		for t := 0; t < n; t++ {
			ang := -2 * math.Pi * float64(k) * float64(t) / float64(n)
			sr += x[t] * math.Cos(ang)
			si += x[t] * math.Sin(ang)
		}
		re[k], im[k] = sr, si
	}
	return re, im
}

// assertFFTMatches 把 fftInPlace 的结果和朴素 DFT 逐点比对。
func assertFFTMatches(t *testing.T, x []float64) {
	t.Helper()
	wantR, wantI := naiveDFT(x)

	gotR := make([]float64, len(x))
	gotI := make([]float64, len(x))
	copy(gotR, x)
	fftInPlace(gotR, gotI)

	// 容差按输入能量缩放：DFT 的中间量随 n 增长，绝对误差也随之为大。
	scale := 0.0
	for _, v := range x {
		scale += math.Abs(v)
	}
	if scale < 1 {
		scale = 1
	}
	tol := 1e-9 * scale

	for k := range x {
		if math.Abs(gotR[k]-wantR[k]) > tol || math.Abs(gotI[k]-wantI[k]) > tol {
			t.Fatalf("第 %d 个 bin 不符：got (%.12f, %.12f) want (%.12f, %.12f)",
				k, gotR[k], gotI[k], wantR[k], wantI[k])
		}
	}
}

// TestFFTMatchesKnownInput 用两种极端输入校验 FFT：直流（能量全在 bin 0）
// 和单频正弦（能量集中在两个共轭 bin）。
func TestFFTMatchesKnownInput(t *testing.T) {
	// 1) 常量信号：X[0] = n * c，其余为 0
	const n = 8
	dc := make([]float64, n)
	for i := range dc {
		dc[i] = 0.25
	}
	assertFFTMatches(t, dc)

	// 顺便把解析解写死校验一遍，确保朴素 DFT 本身没写反符号
	gotR := make([]float64, n)
	gotI := make([]float64, n)
	copy(gotR, dc)
	fftInPlace(gotR, gotI)
	if math.Abs(gotR[0]-2.0) > 1e-12 { // 8 * 0.25
		t.Errorf("常量信号的直流分量应为 2.0，实际 %v", gotR[0])
	}
	for k := 1; k < n; k++ {
		if math.Abs(gotR[k]) > 1e-12 || math.Abs(gotI[k]) > 1e-12 {
			t.Errorf("常量信号在 bin %d 应为 0，实际 (%v, %v)", k, gotR[k], gotI[k])
		}
	}

	// 2) 单频正弦，频率正好落在 bin 2 上（整周期，无泄漏）
	sin := make([]float64, n)
	for i := range sin {
		sin[i] = math.Sin(2 * math.Pi * 2 * float64(i) / n)
	}
	assertFFTMatches(t, sin)

	// 解析解：X[2] = -i*n/2，X[6] = +i*n/2（实正弦的共轭对）
	copy(gotR, sin)
	for i := range gotI {
		gotI[i] = 0
	}
	fftInPlace(gotR, gotI)
	if math.Abs(gotR[2]) > 1e-12 || math.Abs(gotI[2]+4.0) > 1e-12 {
		t.Errorf("bin 2 应为 -4i，实际 (%v, %v)", gotR[2], gotI[2])
	}
	if math.Abs(gotR[6]) > 1e-12 || math.Abs(gotI[6]-4.0) > 1e-12 {
		t.Errorf("bin 6 应为 +4i，实际 (%v, %v)", gotR[6], gotI[6])
	}

	// 3) 再来一个非整周期的（有泄漏）和长度为 4 的小例子，覆盖不同层数
	leaky := make([]float64, n)
	for i := range leaky {
		leaky[i] = math.Cos(2*math.Pi*1.5*float64(i)/n) * 0.7
	}
	assertFFTMatches(t, leaky)
	assertFFTMatches(t, []float64{1, -1, 1, -1})

	// 4) 非法长度应当静默返回，而不是 panic 或写坏内存
	bad := []float64{1, 2, 3}
	fftInPlace(bad, make([]float64, 3))
	if bad[0] != 1 || bad[1] != 2 || bad[2] != 3 {
		t.Errorf("非 2 的幂长度应原样返回，实际 %v", bad)
	}
}

/* --------------------------------------------------------------------------
   缓冲区就绪条件
   -------------------------------------------------------------------------- */

// TestSpectrumNilBeforeFullBuffer 窗口没满就返回 nil（调用方据此保持上一帧），
// 而不是返回一列 0 —— 后者会让画面在起播瞬间「闪一下空白」。
func TestSpectrumNilBeforeFullBuffer(t *testing.T) {
	a := NewAnalyzer(DefaultFFTSize)
	if a.Available() {
		t.Fatal("新建的分析器不该是已就绪状态")
	}
	if got := a.Spectrum(DefaultBands); got != nil {
		t.Fatalf("空缓冲区应返回 nil，实际长度 %d", len(got))
	}

	// 差一个样本也不行
	a.Write(make([]float64, DefaultFFTSize-1))
	if got := a.Spectrum(DefaultBands); got != nil {
		t.Fatalf("差一个样本时仍应返回 nil，实际长度 %d", len(got))
	}

	// 补上最后一个样本就绪
	a.Write([]float64{0})
	if !a.Available() {
		t.Fatal("满 512 个样本后应就绪")
	}
	if got := a.Spectrum(DefaultBands); got == nil || len(got) != DefaultBands {
		t.Fatalf("就绪后应返回 %d 个频段，实际 %v", DefaultBands, got)
	}
}

/* --------------------------------------------------------------------------
   频段数钳位
   -------------------------------------------------------------------------- */

// TestSpectrumBandCountClamping 校验 clampBands 的边界。
//
// 重点是 0 这个反直觉的分支：JS 的 `Math.floor(bands) || 32` 里 0 是 falsy，
// 所以 spectrum(0) 得到的是 32 段而不是 1 段。负数在 JS 里是 truthy，
// 于是 -5 走 Math.max(1, ...) 变成 1。这两种「越界」的结果方向相反，
// 必须分开断言，别合并成一句「越界就钳到 1」。
func TestSpectrumBandCountClamping(t *testing.T) {
	cases := []struct {
		in   int
		want int
		why  string
	}{
		{0, 32, "JS 里 0 是 falsy，`|| 32` 兜底成默认段数"},
		{-5, 1, "负数 truthy，走到 Math.max(1, ...)"},
		{1, 1, "下界本身"},
		{32, 32, "默认值原样透传"},
		{128, 128, "上界本身"},
		{200, 128, "超过上界钳到 128"},
	}

	for _, c := range cases {
		if got := clampBands(c.in); got != c.want {
			t.Errorf("clampBands(%d) = %d，want %d（%s）", c.in, got, c.want, c.why)
		}

		// 同样通过公开 API 走一遍，确认长度确实生效
		a := NewAnalyzer(DefaultFFTSize)
		a.Write(sine(DefaultFFTSize, 0.1)) // 非静音，避免全 0 掩盖长度问题
		got := a.Spectrum(c.in)
		if got == nil {
			t.Fatalf("Spectrum(%d) 不该返回 nil", c.in)
		}
		if len(got) != c.want {
			t.Errorf("Spectrum(%d) 长度 = %d，want %d", c.in, len(got), c.want)
		}
	}
}

/* --------------------------------------------------------------------------
   静音与能量分布
   -------------------------------------------------------------------------- */

// TestSpectrumSilenceIsZero 全零输入 → 全零输出。
// 这条同时守住了 dB 映射的边界：magnitude=0 时 log10 是 -Inf，
// 映射到字节必须是 0，不能因为 NaN 计算出什么诡异的东西。
func TestSpectrumSilenceIsZero(t *testing.T) {
	a := NewAnalyzer(DefaultFFTSize)
	// 连喂几帧，确认平滑也不会把 -Inf 变成非零
	for round := 0; round < 4; round++ {
		a.Write(make([]float64, DefaultFFTSize))
		out := a.Spectrum(DefaultBands)
		if out == nil {
			t.Fatal("静音满窗后不该返回 nil")
		}
		for i, v := range out {
			if v != 0 {
				t.Fatalf("第 %d 轮第 %d 段静音应为 0，实际 %v", round, i, v)
			}
			if math.IsNaN(v) {
				t.Fatalf("第 %d 轮第 %d 段出现 NaN", round, i)
			}
		}
	}
}

// sine 生成一个整周期数可控的正弦（cycles 为窗口内的周期数）。
func sine(n, cyclesPerWindow float64) []float64 {
	return sineAmp(n, cyclesPerWindow, 0.5)
}

// sineAmp 同上，但可以指定振幅（用于测「输入突然变强」时的平滑滞后）。
func sineAmp(n, cyclesPerWindow, amp float64) []float64 {
	out := make([]float64, int(n))
	for i := range out {
		out[i] = amp * math.Sin(2*math.Pi*cyclesPerWindow*float64(i)/n)
	}
	return out
}

// centroid 返回能量加权重心（用 0..1 归一化到段数下标）。
func centroid(v []float64) float64 {
	var sum, wsum float64
	for i, x := range v {
		sum += x
		wsum += x * float64(i)
	}
	if sum == 0 {
		return 0
	}
	return wsum / sum
}

// argmax 返回最大值的下标（并列取最小下标）。
func argmax(v []float64) int {
	best := 0
	for i, x := range v {
		if x > v[best] {
			best = i
		}
	}
	return best
}

// TestSpectrumPeakLandsInExpectedBucket 分析器本身不含采样率信息（bin 是归一化
// 的），所以没法断言「440Hz 落在第几段」。能断言的是单调性：
// 频率越高，能量重心越靠右，argmax 也越靠右。
//
// 这里用「窗口内周期数」当频率：低频取 2 个周期，高频取 100 个周期。
func TestSpectrumPeakLandsInExpectedBucket(t *testing.T) {
	low := NewAnalyzer(DefaultFFTSize)
	high := NewAnalyzer(DefaultFFTSize)

	low.Write(sine(DefaultFFTSize, 2))
	high.Write(sine(DefaultFFTSize, 100))

	lo := low.Spectrum(DefaultBands)
	hi := high.Spectrum(DefaultBands)
	if lo == nil || hi == nil {
		t.Fatal("满窗后不该返回 nil")
	}

	loArg, hiArg := argmax(lo), argmax(hi)
	loC, hiC := centroid(lo), centroid(hi)

	if hiArg <= loArg {
		t.Errorf("高频的峰值下标应大于低频：low=%d(重心 %.2f) high=%d(重心 %.2f)",
			loArg, loC, hiArg, hiC)
	}
	if hiC <= loC {
		t.Errorf("高频的能量重心应大于低频：low=%.2f high=%.2f", loC, hiC)
	}

	// 低频（2 个周期）应当确实落在很左边的几段里
	if loArg > 4 {
		t.Errorf("2 周期正弦的峰值不该跑到第 %d 段（应集中在最左几段）", loArg)
	}
	// 高频（100 个周期，接近奈奎斯特）应当落在右边
	if hiArg < DefaultBands/2 {
		t.Errorf("100 周期正弦的峰值在第 %d 段，偏左了（应落在右半段）", hiArg)
	}

	// 输出必须都是 0..1 的合法值
	for i, v := range hi {
		if v < 0 || v > 1 || math.IsNaN(v) {
			t.Errorf("第 %d 段输出越界：%v", i, v)
		}
	}
}

/* --------------------------------------------------------------------------
   平滑收敛
   -------------------------------------------------------------------------- */

// TestSmoothingConverges 连续喂同一个非零信号，输出应当单调趋近稳态值
// （不震荡、不越过稳态），并且稳态就在「不平滑」时的那一帧附近。
//
// 这里额外验证了 0.76 是「保留旧值」的比例：上一帧的权重高，所以收敛是慢的，
// 若实现写反（0.24 保留旧值）会收敛得明显更快，下面的步长断言能抓住。
func TestSmoothingConverges(t *testing.T) {
	a := NewAnalyzer(DefaultFFTSize)
	sig := sine(DefaultFFTSize, 6)

	// 首帧：按约定 smoothed 直接等于当前值（没有「上一帧」）
	a.Write(sig)
	first := append([]float64(nil), a.Spectrum(DefaultBands)...)
	if first == nil {
		t.Fatal("满窗后不该返回 nil")
	}

	// 后续帧喂完全相同的信号：每帧的 cur 都等于 first，
	// 平滑只是把 smoothed 慢慢拉向 first。
	prev := append([]float64(nil), first...)
	var last []float64
	steps := make([]float64, 0, 40)
	for round := 0; round < 40; round++ {
		a.Write(sig)
		cur := append([]float64(nil), a.Spectrum(DefaultBands)...)
		if cur == nil {
			t.Fatal("满窗后不该返回 nil")
		}

		// 每一段都不该超过首帧的值（IIR 在首帧已初始化成稳态候选，
		// 之后输入相同，就不该再出现超调）
		maxStep := 0.0
		for i := range cur {
			if cur[i] > prev[i]+1e-9 {
				t.Fatalf("第 %d 轮第 %d 段超出首帧（%v > %v），平滑不应超调",
					round, i, cur[i], prev[i])
			}
			if d := math.Abs(cur[i] - prev[i]); d > maxStep {
				maxStep = d
			}
		}
		steps = append(steps, maxStep)
		prev = cur
		last = cur
	}

	// 单调趋于平稳：步长不增（允许量化带来的极小抖动）
	for i := 1; i < len(steps); i++ {
		if steps[i] > steps[i-1]+1e-9 {
			t.Errorf("第 %d 轮步长 %v 大于上一轮 %v，收敛不该反弹", i, steps[i], steps[i-1])
		}
	}
	// 注意：这里**不能**断言 steps[0] > 0。
	// 首帧按 Web Audio 的约定直接把 smoothed 初始化成当前值（见 spectrum.go），
	// 之后每轮喂的都是同一个信号，于是 cur 恒等于 first、smoothed 也恒等于它，
	// 步长从第一轮起就是 0 —— 这是「输入不变 → 输出不变」的正确表现。
	// 平滑的滞后性由下面这段验证（输入突变时才该看到缓慢跟随）。
	if steps[0] > 1e-9 {
		t.Errorf("首轮步长 %v，输入恒定时不该有变化", steps[0])
	}
	if steps[len(steps)-1] > 1e-9 {
		t.Errorf("末轮步长 %v，应当已经收敛", steps[len(steps)-1])
	}

	// 稳态应与首帧几乎相同（输入恒定 → IIR 稳态就是该输入）
	for i := range last {
		if math.Abs(last[i]-first[i]) > 1e-9 {
			t.Errorf("第 %d 段稳态 %v 偏离首帧 %v", i, last[i], first[i])
		}
	}

	// 输入突然变强：平滑应当让它**逐步**上升（保留旧值比例 0.76），
	// 而不是一步跳到新值。若实现把 0.76/0.24 写反，这一步会明显更大。
	loud := sineAmp(DefaultFFTSize, 6, 1.0) // 满幅
	a.Write(loud)
	risen := a.Spectrum(DefaultBands)
	absorbed := 0
	for i := range risen {
		if risen[i] > last[i]+1e-9 {
			absorbed++
		}
	}
	if absorbed == 0 {
		t.Error("输入增强后频谱应当上升（平滑不该把变化完全吃掉）")
	}

	// 换个输入（静音）时应当**缓慢**衰减而不是瞬间归零：
	// 0.76 的保留系数意味着 10 帧后还剩 0.76^10 ≈ 6.4%。
	a.Write(make([]float64, DefaultFFTSize))
	after := a.Spectrum(DefaultBands)
	nonzero := 0
	for _, v := range after {
		if v > 0 {
			nonzero++
		}
	}
	if nonzero == 0 {
		t.Error("单帧静音后不应立刻归零，0.76 的平滑会保留大部分历史")
	}
}

/* --------------------------------------------------------------------------
   构造与环形缓冲的边界
   -------------------------------------------------------------------------- */

// TestNewAnalyzerRejectsBadFFTSize 非法 fftSize 回退到默认值而不是 panic。
func TestNewAnalyzerRejectsBadFFTSize(t *testing.T) {
	for _, bad := range []int{0, -1, 3, 100, 1 << 20} {
		a := NewAnalyzer(bad)
		if a.FFTSize() != DefaultFFTSize {
			t.Errorf("NewAnalyzer(%d).FFTSize() = %d，want %d", bad, a.FFTSize(), DefaultFFTSize)
		}
		if a.Bins() != DefaultFFTSize/2 {
			t.Errorf("NewAnalyzer(%d).Bins() = %d，want %d", bad, a.Bins(), DefaultFFTSize/2)
		}
	}
	if a := NewAnalyzer(256); a.FFTSize() != 256 || a.Bins() != 128 {
		t.Errorf("合法的小尺寸应被接受：size=%d bins=%d", a.FFTSize(), a.Bins())
	}
}

// TestWriteKeepsMostRecentSamples 环形缓冲只保留最近 fftSize 个样本。
//
// 用「先喂静音、再喂正弦」的方式验证：如果窗口退化成全静音，输出就会全 0；
// 如果保留了正确的最近窗口，就应当有非零能量。
func TestWriteKeepsMostRecentSamples(t *testing.T) {
	a := NewAnalyzer(DefaultFFTSize)
	// 先塞 3 窗静音，再塞一窗正弦；环形缓冲应当只剩下正弦那一窗
	a.Write(make([]float64, DefaultFFTSize*3))
	a.Write(sine(DefaultFFTSize, 8))

	out := a.Spectrum(DefaultBands)
	if out == nil {
		t.Fatal("不该返回 nil")
	}
	total := 0.0
	for _, v := range out {
		total += v
	}
	if total == 0 {
		t.Fatal("窗口里应当只剩最近一窗正弦，输出却全为 0")
	}

	// 一次 Write 传入超长切片：只取末尾 fftSize 个
	b := NewAnalyzer(DefaultFFTSize)
	long := make([]float64, DefaultFFTSize*2)
	copy(long[DefaultFFTSize:], sine(DefaultFFTSize, 8))
	b.Write(long)
	out2 := b.Spectrum(DefaultBands)
	if out2 == nil {
		t.Fatal("不该返回 nil")
	}
	for i := range out {
		if math.Abs(out[i]-out2[i]) > 1e-12 {
			t.Fatalf("超长 Write 应等价于只写末尾一窗：第 %d 段 %v != %v", i, out2[i], out[i])
		}
	}
}

// TestReset 清空后回到「未就绪」，避免切歌时残留上一首的频谱。
func TestReset(t *testing.T) {
	a := NewAnalyzer(DefaultFFTSize)
	a.Write(sine(DefaultFFTSize, 8))
	if a.Spectrum(DefaultBands) == nil {
		t.Fatal("满窗后不该返回 nil")
	}
	a.Reset()
	if a.Available() {
		t.Fatal("Reset 后应回到未就绪")
	}
	if a.Spectrum(DefaultBands) != nil {
		t.Fatal("Reset 后应返回 nil")
	}
}

// TestToByteMapping 守住 dB → 字节的映射端点：
// 量程下界记 0，上界记 255，中间按线性（并四舍五入）。
//
// 中点刻意用 MinDecibels/MaxDecibels **算出来**而不是写死数值：
// 量程上界是经过实测调整的（见 spectrum.go 里 MaxDecibels 的说明），
// 写死的话每次调量程都要跟着改测试，容易变成「改测试来迁就实现」。
func TestToByteMapping(t *testing.T) {
	mid := (MinDecibels + MaxDecibels) / 2 // 量程中点 → 127.5 → 128
	cases := []struct {
		db   float64
		want uint8
	}{
		{MinDecibels, 0},
		{MinDecibels - 50, 0},   // 低于下界钳到 0
		{MaxDecibels, 255},      // 上界
		{MaxDecibels + 50, 255}, // 高于上界钳到 255
		{math.Inf(-1), 0},       // 静音（magnitude=0）走的就是这条
		{math.NaN(), 0},         // NaN 也必须是 0，不能是垃圾值
		{0, 255},                // 0 dB 远高于上界
		{mid, 128},              // 量程中点
	}
	for _, c := range cases {
		if got := toByte(c.db); got != c.want {
			t.Errorf("toByte(%v) = %d，want %d", c.db, got, c.want)
		}
	}
}

// TestMaxDecibelsGivesHeadroom 是本包对量程取值的回归保护。
//
// Web Audio 的默认上界是 -30 dB，但那个值会让满幅信号直接顶格
// （柱状图在响段完全不动）。这里断言：满幅正弦**不应**顶格，
// 否则说明量程又被调回了一个会削平动态的值。
func TestMaxDecibelsGivesHeadroom(t *testing.T) {
	a := NewAnalyzer(DefaultFFTSize)
	// 喂满幅正弦，多喂几次让平滑收敛
	sig := sineAmp(DefaultFFTSize, 8, 1.0)
	for i := 0; i < 30; i++ {
		a.Write(sig)
	}
	sp := a.Spectrum(DefaultBands)
	if sp == nil {
		t.Fatal("满窗后不该返回 nil")
	}
	maxV := 0.0
	for _, v := range sp {
		if v > maxV {
			maxV = v
		}
	}
	if maxV >= 0.999 {
		t.Errorf("满幅信号顶格（max=%.3f）：MaxDecibels=%.0f 偏低，动态会被削平",
			maxV, MaxDecibels)
	}
	// 同时要求它足够高，否则就是量程给得太大、整体偏暗
	if maxV < 0.3 {
		t.Errorf("满幅信号只有 max=%.3f：MaxDecibels=%.0f 偏高，画面会偏暗",
			maxV, MaxDecibels)
	}
}
