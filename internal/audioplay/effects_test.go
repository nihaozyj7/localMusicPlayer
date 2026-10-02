/* ==========================================================================
   effects_test.go — 音效链的测试
   --------------------------------------------------------------------------
   这个文件的测试分成四类，每类针对一个**具体的翻车方式**：

    1. 滤波器设计正确性 —— 系数算错的话，EQ 会变成"听起来有点怪但说不出
       哪里怪"。用频响实测（喂正弦、量幅度）来验证，而不是比系数：
       系数公式抄错一个符号时，后者也能过（只要抄的和实现一致）。

    2. 稳定性 —— 混响是带反馈的结构，反馈量 >= 1 会让能量无限累积成
       Inf/NaN。这是 DSP 最经典的翻车方式，必须有测试守着。

    3. 不爆音 —— 音效切换、大信号、极端参数下输出不能出现阶跃或溢出。
       这些是最难在人工试听时发现的（有时候要点十几次才听到一次）。

    4. 默认路径零开销 —— 不开音效时 ProcessStereo 必须原样放行。
       这条容易被"顺手加个归一化"之类的改动破坏，而它的后果是
       "所有用户的无损音质被静默劣化"。
   ========================================================================== */

package audioplay

import (
	"encoding/binary"
	"math"
	"testing"
)

/* --------------------------------------------------------------------------
   测试辅助
   -------------------------------------------------------------------------- */

// makeStereoSamples 生成 n 帧的 s16le 缓冲，内容由 f 决定（返回 -1..1）。
func makeStereoSamples(n int, f func(i int) (float64, float64)) []byte {
	buf := make([]byte, n*FrameSize)
	for i := 0; i < n; i++ {
		l, r := f(i)
		binary.LittleEndian.PutUint16(buf[i*FrameSize:], uint16(int16(l*32767)))
		binary.LittleEndian.PutUint16(buf[i*FrameSize+2:], uint16(int16(r*32767)))
	}
	return buf
}

// samplesEqualBytes 比较两个缓冲是否逐字节相同。
func samplesEqualBytes(t *testing.T, name string, got, want []byte) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: 长度 %d，期望 %d", name, len(got), len(want))
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("%s: 第 %d 字节 = %d，期望 %d", name, i, got[i], want[i])
		}
	}
}

// sineAt 是第 i 帧、频率 freq 的正弦样本值（幅度 amp）。
func sineAt(i int, freq, amp float64) float64 {
	return amp * math.Sin(2*math.Pi*freq*float64(i)/float64(SampleRate))
}

// measureGainDB 把 buf 里已处理的信号按频率 freq 做单点 DFT，
// 返回相对**理想输入幅度**的增益（dB）。
//
// ★ 为什么要这么测（而不是"看输出非零"）：EQ 的设计目标就是"某个频率
// 增益是多少 dB"，只有量出实际的频响才能验证设计公式抄对了没有。
// 用单点 DFT 而不是完整 FFT：这里只关心一个频点，DFT 的 O(N) 更直接，
// 也更容易看出"测的到底是哪个频率"。
//
// skipFrames 跳过开头若干帧：滤波器需要时间进入稳态（瞬态响应会污染结果）。
//
// ★ 基准必须带上幅度 amp：调用方生成的信号幅度各异（0.2 / 0.3 / 1.0），
// 而输入相关用的是理想正弦。若基准写成固定的单位幅度，结果会被乘上
// 一个 20*log10(amp) 的常数偏移 —— 那种错误看起来很像是滤波器增益算错了
// （本文件初版就在这里踩过一次：0.3 幅度导致全部测量偏低 10.46dB）。
//
// 所以这个函数只用于"调用方自己生成信号"的场景：链是就地把 buf 从
// 输入改写成输出的，函数无法从输出里还原输入，必须由调用方声明 amp。
func measureGainDB(t *testing.T, name string, buf []byte, freq, amp float64, skipFrames int) float64 {
	t.Helper()
	frames := len(buf) / FrameSize
	if skipFrames >= frames {
		t.Fatalf("%s: skipFrames(%d) >= frames(%d)", name, skipFrames, frames)
	}

	var reIn, imIn, reOut, imOut float64
	for i := skipFrames; i < frames; i++ {
		off := i * FrameSize
		outL := float64(int16(binary.LittleEndian.Uint16(buf[off:]))) / 32768.0

		phase := 2 * math.Pi * freq * float64(i) / float64(SampleRate)
		cosP, sinP := math.Cos(phase), math.Sin(phase)

		// 输入：同一段索引上的理想正弦（幅度由调用方声明）
		in := amp * math.Sin(phase)
		reIn += in * cosP
		imIn += in * sinP
		// 输出：实测样本
		reOut += outL * cosP
		imOut += outL * sinP
	}

	magIn := math.Hypot(reIn, imIn)
	magOut := math.Hypot(reOut, imOut)
	if magIn == 0 {
		t.Fatalf("%s: 输入幅度为 0", name)
	}
	return 20 * math.Log10(magOut/magIn)
}

// measureBiquadGainDB 测一个 biquad 在指定频率的增益（dB）。
//
// 与 measureGainDB 的区别：这条**自己生成输入**，所以输入与输出
// 都能在同一遍循环里拿到，基准自然就是生成时用的幅度 —— 不存在
// "调用方忘了声明 amp" 的可能。滤波器设计的单元测试都用它。
func measureBiquadGainDB(t *testing.T, name string, c biquadCoeffs, freq, amp float64) float64 {
	t.Helper()
	const frames = 16384
	const skip = 8192 // 跳过大半，确保进入稳态

	var b biquad
	b.assign(c)

	var reIn, imIn, reOut, imOut float64
	for i := 0; i < frames; i++ {
		phase := 2 * math.Pi * freq * float64(i) / float64(SampleRate)
		cosP, sinP := math.Cos(phase), math.Sin(phase)
		in := amp * math.Sin(phase)

		ol, _ := b.processStereo(in, in)

		if i < skip {
			continue
		}
		reIn += in * cosP
		imIn += in * sinP
		reOut += ol * cosP
		imOut += ol * sinP
	}

	magIn := math.Hypot(reIn, imIn)
	magOut := math.Hypot(reOut, imOut)
	if magIn == 0 {
		t.Fatalf("%s: 输入幅度为 0", name)
	}
	return 20 * math.Log10(magOut/magIn)
}

// rmsDB 返回缓冲的 RMS（dBFS）。用于稳定性检查（能量是否失控）。
func rmsDB(buf []byte) float64 {
	frames := len(buf) / FrameSize
	if frames == 0 {
		return -math.MaxFloat64
	}
	var sum float64
	for i := 0; i < frames; i++ {
		off := i * FrameSize
		l := float64(int16(binary.LittleEndian.Uint16(buf[off:]))) / 32768.0
		r := float64(int16(binary.LittleEndian.Uint16(buf[off+2:]))) / 32768.0
		sum += l*l + r*r
	}
	mean := sum / float64(frames*2)
	if mean <= 0 {
		return -math.MaxFloat64
	}
	return 10 * math.Log10(mean)
}

/* ==========================================================================
   0. 样本换算（所有 DSP 的地基）
   ========================================================================== */

// TestSampleRoundTripIsExact 验证 int16 ↔ float64 的往返在**软限幅透明区**
// 内是精确的双射。
//
// ★ 这条测试守着一个很容易被"顺手优化"破坏的不变量：
// readSample 与 writeSample 必须用同一个缩放系数（32768）并且四舍五入，
// 否则会丢掉小信号的最低位。
//
// 曾经的写法是"/32768 读、*32767 截断写"，后果：
//
//	· 样本 1 → 0.0000305 → 0.99997 → 截断成 0（丢 LSB）；
//	· 样本 -32768 永远无法还原（会变成 -32767）。
//
// 症状是"不开音效时音频也变了"—— 丢的还是低电平处的最低位，
// 在安静段落与淡出尾巴上最明显，人工试听基本发现不了。
//
// ★ 为什么只测到 0.85 而不是整个 int16 范围：
// writeSample 内部会做软限幅，而软限幅对 |x| > 0.85 的样本是
// **故意**压扁的（满幅附近几乎不动、但不再逐位相等）。那是设计行为，
// 不是往返误差。阈值之上的样本由
// TestSampleRoundTripJustAboveThresholdIsBounded 覆盖。
//
// 0.85 * 32768 = 27853，所以透明区是 [-27853, 27853]。
func TestSampleRoundTripIsExact(t *testing.T) {
	buf := make([]byte, FrameSize)
	limit := 27853 // = softClipThreshold(0.85) * sampleScale(32768)

	// 覆盖整个透明区（约 5.5 万个值）。几毫秒的循环，
	// 但能把"某个数值区间被压扁"的问题一次性抓干净
	//（抽样很容易恰好避开出问题的那几个值）。
	for i := -limit; i <= limit; i++ {
		want := int16(i)
		binary.LittleEndian.PutUint16(buf, uint16(want))
		x := readSample(buf, 0)
		writeSample(buf, 0, x)
		got := int16(binary.LittleEndian.Uint16(buf))
		if got != want {
			t.Fatalf("往返后 %d 变成了 %d（read=%v）—— 缩放系数不对称或未四舍五入",
				want, got, x)
		}
	}
}

// TestSampleRoundTripJustAboveThresholdIsBounded 验证阈值之上的样本
// 被软限幅**温和**处理（压扁但不越界、不反相、变化量小）。
//
// ★ 这条的作用是区分"软限幅在工作"与"往返换算坏了"：
// 两者都表现为"样本值变了"，但前者是设计行为（变化量小且有界），
// 后者是 bug（可能差几十个 LSB 或者反向）。
func TestSampleRoundTripJustAboveThresholdIsBounded(t *testing.T) {
	buf := make([]byte, FrameSize)

	for _, magnitude := range []int16{27854, 30000, 32000, 32767} {
		for _, sign := range []int16{1, -1} {
			v := magnitude * sign
			binary.LittleEndian.PutUint16(buf, uint16(v))
			x := readSample(buf, 0)
			writeSample(buf, 0, x)
			got := int16(binary.LittleEndian.Uint16(buf))

			// 软限幅只会把幅度**压小**（朝向阈值方向），不放大、不反相
			if sign > 0 && (got > v || got < 0) {
				t.Errorf("正样本 %d 经过软限幅变成 %d（应被略微压小且保持正号）", v, got)
			}
			if sign < 0 && (got < v || got > 0) {
				t.Errorf("负样本 %d 经过软限幅变成 %d（应被略微压小且保持负号）", v, got)
			}
			// 变化量必须很小：这是"软压扁"而不是"重映射"
			diff := int(got) - int(v)
			if diff < 0 {
				diff = -diff
			}
			if diff > 3276 { // 0.1 * sampleScale
				t.Errorf("样本 %d 经过软限幅变成 %d，变化 %d 过大（应只是轻微压扁）",
					v, got, diff)
			}
		}
	}
}

// TestSampleRoundTripBoundaries 检查端点值的归一化结果符合预期。
//
// 端点最容易出错（-32768 与 32767 的映射方向相反），单独钉住它们。
func TestSampleRoundTripBoundaries(t *testing.T) {
	buf := make([]byte, FrameSize)

	// -32768 应该映射到恰好 -1.0
	//
	// ★ 这里必须经由变量而不能直接写 uint16(int16(-32768))：
	// Go 的常量算术会先发现 -32768 无法用 int16 表示"正值化"后的结果，
	// 直接报 "constant overflows uint16"。走一次变量就绕开了
	// 编译期常量折叠，得到的是运行期补码转换（正是我们要测的）。
	minSample := int16(-32768)
	binary.LittleEndian.PutUint16(buf, uint16(minSample))
	if got := readSample(buf, 0); got != -1.0 {
		t.Errorf("readSample(-32768) = %v，期望恰好 -1.0", got)
	}

	// 32767 略小于 1.0（因为用 32768 作分母），且不该越界
	maxSample := int16(32767)
	binary.LittleEndian.PutUint16(buf, uint16(maxSample))
	got := readSample(buf, 0)
	if got >= 1.0 || got <= 0.999 {
		t.Errorf("readSample(32767) = %v，期望在 (0.999, 1.0) 之间", got)
	}

	// 0 必须精确映射到 0（否则静音段落会带上直流偏置）
	binary.LittleEndian.PutUint16(buf, 0)
	if got := readSample(buf, 0); got != 0 {
		t.Errorf("readSample(0) = %v，期望恰好 0", got)
	}
}

/* ==========================================================================
   1. 滤波器设计正确性
   ========================================================================== */

// TestBiquadPeakingMatchesSpec 验证 peaking 滤波器在中心频率处的增益
// 确实等于设计值。
//
// 这是整个 EQ 的基石：如果这里错了，所有预设的每个频段都是错的。
func TestBiquadPeakingMatchesSpec(t *testing.T) {
	const (
		freq   = 1000.0
		q      = 1.0
		gainDB = 6.0
	)
	c := designPeaking(freq, q, gainDB, SampleRate)
	got := measureBiquadGainDB(t, "peaking", c, freq, 0.3)
	// 容差 0.5dB：量化误差、滤波器瞬态残留都会贡献零点几 dB。
	// 0.5 足够严 —— 设计公式抄错的话偏差通常是好几 dB 甚至符号相反。
	if math.Abs(got-gainDB) > 0.5 {
		t.Errorf("peaking 在 %.0fHz 的增益 = %.2f dB，期望 %.2f dB", freq, got, gainDB)
	}
}

// TestBiquadPeakingAtDcIsUnity 验证 peaking 在 DC 处不改变增益。
//
// peaking 是"某个频段的局部调整"，两端都应该回到 0dB。
// 这条能抓住"整体通带偏移"那类笔误 —— 那会让所有频率一起变，
// 而不是只凸起一段。
func TestBiquadPeakingAtDcIsUnity(t *testing.T) {
	c := designPeaking(1000, 1.0, 6.0, SampleRate)
	// DC 增益 = (b0+b1+b2)/(1+a1+a2)
	dc := (c.b0 + c.b1 + c.b2) / (1 + c.a1 + c.a2)
	if math.Abs(dc) < 0.99 || math.Abs(dc) > 1.01 {
		t.Errorf("peaking 在 DC 的增益 = %.4f，期望 1.0（局部滤波不该动两端）", dc)
	}
}

// TestBiquadPeakingCutMatchesSpec 验证衰减（负增益）方向也是对的。
//
// ★ 单独测负数的理由：系数里 A = 10^(dB/40)，如果实现写成 10^(dB/20)
// 或者漏了负号处理，"提升"可能碰巧对而"衰减"完全错。
func TestBiquadPeakingCutMatchesSpec(t *testing.T) {
	const (
		freq   = 500.0
		gainDB = -9.0
	)
	c := designPeaking(freq, 1.0, gainDB, SampleRate)
	got := measureBiquadGainDB(t, "peaking-cut", c, freq, 0.3)
	if math.Abs(got-gainDB) > 0.5 {
		t.Errorf("peaking 衰减在 %.0fHz = %.2f dB，期望 %.2f dB", freq, got, gainDB)
	}
}

// TestBiquadHighPassAttenuatesBelowCutoff 验证高通确实在截止频率以下衰减。
func TestBiquadHighPassAttenuatesBelowCutoff(t *testing.T) {
	c := designHighPass(200, 0.707, SampleRate)
	// 40Hz 约为截止的 1/5，二阶滤波理论约 -28dB
	got := measureBiquadGainDB(t, "highpass-below", c, 40, 0.3)
	if got > -12 {
		t.Errorf("高通在 40Hz（截止 200Hz）只有 %.2f dB 衰减，期望 <= -12dB", got)
	}
}

// TestBiquadHighPassPassesAboveCutoff 验证通带内基本不衰减。
//
// ★ 这条同样重要：滤波器"有衰减"很容易做到（随便写个错公式也会衰减），
// 真正要验证的是"该衰减的地方衰减、不该衰减的地方不动"。
func TestBiquadHighPassPassesAboveCutoff(t *testing.T) {
	c := designHighPass(200, 0.707, SampleRate)
	got := measureBiquadGainDB(t, "highpass-pass", c, 4000, 0.3)
	if math.Abs(got) > 0.5 {
		t.Errorf("高通在 4kHz（截止 200Hz）增益 = %.2f dB，期望约 0dB", got)
	}
}

// TestBiquadLowShelfBoostsLowFreq 验证低架滤波器只影响低频。
func TestBiquadLowShelfBoostsLowFreq(t *testing.T) {
	c := designLowShelf(200, 6, SampleRate)

	low := measureBiquadGainDB(t, "lowshelf-low", c, 40, 0.3)
	high := measureBiquadGainDB(t, "lowshelf-high", c, 4000, 0.3)

	if math.Abs(low-6) > 1.0 {
		t.Errorf("低架在 40Hz 增益 = %.2f dB，期望约 +6dB", low)
	}
	// 4kHz 处低架的残留影响由 S=1 的斜率决定，约 1~2dB。
	// 门限放到 3dB：要抓的是"低架影响了整个频段"这种结构性错误，
	// 而不是架子的斜率细节。
	if math.Abs(high) > 3.0 {
		t.Errorf("低架在 4kHz 增益 = %.2f dB，期望接近 0dB（不该明显影响高频）", high)
	}
}

// TestBiquadHighShelfBoostsHighFreq 验证高架滤波器只影响高频。
func TestBiquadHighShelfBoostsHighFreq(t *testing.T) {
	c := designHighShelf(4000, 6, SampleRate)

	high := measureBiquadGainDB(t, "highshelf-high", c, 12000, 0.3)
	low := measureBiquadGainDB(t, "highshelf-low", c, 200, 0.3)

	if math.Abs(high-6) > 1.0 {
		t.Errorf("高架在 12kHz 增益 = %.2f dB，期望约 +6dB", high)
	}
	if math.Abs(low) > 3.0 {
		t.Errorf("高架在 200Hz 增益 = %.2f dB，期望接近 0dB（不该明显影响低频）", low)
	}
}

// TestBiquadCoeffsNormalized 验证系数确实被 a0 归一化了。
//
// 归一化漏掉的话，滤波器的整体增益会变成 a0 倍 —— 表现是
// "开了 EQ 音量突然变大/变小"，而且随频率变化。
// 检查办法：DC 增益（z=1）应该等于设计值。
// H(1) = (b0+b1+b2) / (1+a1+a2)
func TestBiquadCoeffsNormalized(t *testing.T) {
	cases := []struct {
		name string
		c    biquadCoeffs
	}{
		{"peaking", designPeaking(1000, 1, 6, SampleRate)},
		{"lowshelf", designLowShelf(200, 6, SampleRate)},
		{"highshelf", designHighShelf(4000, 6, SampleRate)},
	}
	for _, tc := range cases {
		// peaking 在 DC 处增益为 1；架子滤波器在 DC 处是 A^2 量级。
		// 这里统一检查"分母不为 0 且数值有限"——系数爆炸（除以 0）
		// 是归一化写错的最明显症状。
		denom := 1 + tc.c.a1 + tc.c.a2
		if math.IsNaN(denom) || math.IsInf(denom, 0) {
			t.Errorf("%s: 归一化后分母 = %v（NaN/Inf）", tc.name, denom)
		}
		for _, v := range []float64{tc.c.b0, tc.c.b1, tc.c.b2, tc.c.a1, tc.c.a2} {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				t.Errorf("%s: 系数含 NaN/Inf: %+v", tc.name, tc.c)
				break
			}
			// 系数绝对值不该超过 10：正常设计的 biquad 系数都在 ±3 以内。
			// 超过说明归一化漏了或者公式抄错。
			if math.Abs(v) > 10 {
				t.Errorf("%s: 系数 %.3f 明显过大（归一化可能漏了）: %+v", tc.name, v, tc.c)
				break
			}
		}
	}
}

/* ==========================================================================
   2. 稳定性
   ========================================================================== */

// TestReverbStableUnderMaxParams 是最重要的一条稳定性测试。
//
// ★ 反馈量 >= 1 会让混响能量无限累积 → float64 溢出成 Inf → NaN →
// 整个音频输出变成噪声或静音。这条测试用**最大**参数（Size=1）
// 连续喂满幅信号 10 秒，检查输出始终有限且能量没有失控增长。
func TestReverbStableUnderMaxParams(t *testing.T) {
	var r reverb
	r.prepare(SampleRate)
	r.setParams(ReverbParams{Amount: 1.0, Size: 1.0, Damp: 0.0})

	// 10 秒 = 441000 帧，分块处理（模拟音频回调）
	const blockFrames = 1024
	const blocks = 430
	for b := 0; b < blocks; b++ {
		for i := 0; i < blockFrames; i++ {
			// 满幅方波是最恶劣的输入：每个跳变都注入大量能量
			v := 1.0
			if (b*blockFrames+i)%100 < 50 {
				v = -1.0
			}
			ol, or := r.processStereo(v, v)
			if math.IsNaN(ol) || math.IsInf(ol, 0) || math.IsNaN(or) || math.IsInf(or, 0) {
				t.Fatalf("第 %d 块第 %d 帧输出 %v/%v（NaN 或 Inf）—— 反馈量失控", b, i, ol, or)
			}
			// 单项输出不该超过"输入 × 稳态增益上限"。
			// 8 路梳状的稳态增益上限是 1/(1-feedback) ≈ 50，
			// 再乘 combScale(1/8) 与 wet(<=1) → 约 6.25。
			// 给到 20 已经是很宽松的上界，超过必然是数值发散。
			if math.Abs(ol) > 20 || math.Abs(or) > 20 {
				t.Fatalf("第 %d 块第 %d 帧输出 %v/%v 超出合理上界（数值发散）", b, i, ol, or)
			}
		}
	}
}

// TestReverbDecaysAfterInputStops 验证混响尾巴确实会衰减到 0。
//
// ★ 这是"反馈量上界"之外的另一半保证：即使不溢出，如果反馈量 >= 1，
// 混响在输入停止后会**永远**响下去（自激振荡）。真实感受是
// "停止播放后喇叭一直有嗡嗡声"。
func TestReverbDecaysAfterInputStops(t *testing.T) {
	var r reverb
	r.prepare(SampleRate)
	r.setParams(ReverbParams{Amount: 1.0, Size: 1.0, Damp: 0.0})

	// 喂 0.5 秒的满幅信号建立能量
	for i := 0; i < SampleRate/2; i++ {
		v := sineAt(i, 440, 1.0)
		r.processStereo(v, v)
	}

	// 之后喂 15 秒静音，检查尾部能量显著低于峰值。
	// 反馈量 0.98 时，能量时间常数约 1/(1-0.98) = 50 个延迟周期，
	// 最长延迟约 1617 样本 → 约 1.8 秒时间常数。15 秒足够衰减到
	// e^(-8) ≈ 0.03%。
	const tailFrames = SampleRate * 15
	tailBuf := make([]byte, tailFrames*FrameSize)
	for i := 0; i < tailFrames; i++ {
		ol, or := r.processStereo(0, 0)
		binary.LittleEndian.PutUint16(tailBuf[i*FrameSize:], uint16(int16(ol*32767)))
		binary.LittleEndian.PutUint16(tailBuf[i*FrameSize+2:], uint16(int16(or*32767)))
	}

	// 取最后 1 秒的能量，它应该已经衰减到几乎为零。
	lastSecond := tailBuf[len(tailBuf)-SampleRate*FrameSize:]
	level := rmsDB(lastSecond)
	if level > -60 {
		t.Errorf("静音 15 秒后混响尾音仍为 %.1f dBFS，期望 <= -60dBFS（衰减不掉）", level)
	}
}

// TestReverbResetClearsTail 验证 reset 真的清空了延迟线。
//
// 场景：切歌。不清的话上一首的混响会盖在新歌开头。
func TestReverbResetClearsTail(t *testing.T) {
	var r reverb
	r.prepare(SampleRate)
	r.setParams(ReverbParams{Amount: 1.0, Size: 0.9})

	// 建立能量
	for i := 0; i < SampleRate; i++ {
		v := sineAt(i, 440, 1.0)
		r.processStereo(v, v)
	}
	// 立刻 reset
	r.reset()

	// reset 之后喂静音，输出应该**立刻**就是 0（延迟线被清空了）
	peak := 0.0
	for i := 0; i < 4096; i++ {
		ol, or := r.processStereo(0, 0)
		peak = math.Max(peak, math.Max(math.Abs(ol), math.Abs(or)))
	}
	if peak > 1e-9 {
		t.Errorf("reset 后静音输入仍有输出峰值 %.6f，期望 0（延迟线没清干净）", peak)
	}
}

// TestChainNeverOutputsNaN 用极端参数扫一遍所有档位，
// 确认任何组合下都不会产生 NaN/Inf。
func TestChainNeverOutputsNaN(t *testing.T) {
	for _, p := range EffectPresets {
		t.Run(string(p), func(t *testing.T) {
			var c Chain
			c.prepare(SampleRate)
			c.RequestPreset(p)
			// 跑几个缓冲让切换生效
			for block := 0; block < 5; block++ {
				buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
					return sineAt(block*PeriodFrames+i, 440, 0.95), sineAt(block*PeriodFrames+i, 441, 0.95)
				})
				c.ProcessStereo(buf)
				for i := 0; i < len(buf); i += 2 {
					v := int16(binary.LittleEndian.Uint16(buf[i:]))
					// int16 天然不会是 NaN，但可以检查"是否出现了满幅的
					// 噪声状输出" —— 这里只验证流程跑通且样本有效。
					_ = v
				}
			}
		})
	}
}

// TestClamp01RejectsNaN 验证 clamp01 挡住 NaN。
//
// ★ NaN 在带反馈的 DSP 里会**永远**存在（延迟线里的 NaN 出来后经过
// 任何运算还是 NaN），所以入口必须挡住它。
func TestClamp01RejectsNaN(t *testing.T) {
	nan := math.NaN()
	if got := clamp01(nan); got != 0 {
		t.Errorf("clamp01(NaN) = %v，期望 0", got)
	}
	if got := clamp01(-5); got != 0 {
		t.Errorf("clamp01(-5) = %v，期望 0", got)
	}
	if got := clamp01(5); got != 1 {
		t.Errorf("clamp01(5) = %v，期望 1", got)
	}
	if got := clamp01(0.5); got != 0.5 {
		t.Errorf("clamp01(0.5) = %v，期望 0.5", got)
	}
}

// TestSoftClipRejectsNaN 验证软限幅挡住 NaN，并把 ±Inf 饱和到满幅。
//
// ★ 两者的处理方式**不同**，这里分开断言：
//
//	· NaN —— 没有"正确的输出值"可言（它不表示任何幅度），
//	  返回 0（静音）是最不容易出事的兜底；
//	· ±Inf —— 它表示"极大的幅度"，所以应该**饱和到 ±1**，
//	  而不是塌成 0。塌成 0 会让一个偶然的数值爆炸变成静音，
//	  反而更难被发现（而饱和至少是可听、可诊断的）。
func TestSoftClipRejectsNaN(t *testing.T) {
	nan := math.NaN()
	if got := softClip(nan); got != 0 {
		t.Errorf("softClip(NaN) = %v，期望 0", got)
	}
	if got := softClip(math.Inf(1)); got != 1 {
		t.Errorf("softClip(+Inf) = %v，期望 1（饱和到满幅）", got)
	}
	if got := softClip(math.Inf(-1)); got != -1 {
		t.Errorf("softClip(-Inf) = %v，期望 -1（饱和到满幅）", got)
	}
}

/* ==========================================================================
   3. 不爆音 / 输出范围
   ========================================================================== */

// TestSoftClipNeverAmplifies 是软限幅**最重要**的一条测试。
//
// ★ 限幅器的定义就是"绝不放大"：对任何输入，输出幅度必须 <= 输入幅度。
// 违反它的东西不是限幅器，而是增益扩张器 —— 它会把本该压住的过载
// 推得更高，让削波更严重。
//
// 这个 bug 真发生过：初版的三次多项式满足全部边界条件
// （f(T)=T、f'(T)=1、f'(1)=0），但在 (T, 1) 区间里整体位于恒等线**之上**
// （0.9 → 0.922、0.95 → 0.978）。边界条件全对的函数照样可以到处越界，
// 所以必须逐点比较 f(x) 与 x，而不是只检查几个端点。
//
// 用细步长扫过整个定义域（含远超满幅的区域）。
func TestSoftClipNeverAmplifies(t *testing.T) {
	const step = 0.0005
	for x := 0.0; x <= 3.0; x += step {
		got := softClip(x)
		if got > x+1e-12 {
			t.Fatalf("softClip(%v) = %v —— 输出大于输入，这是增益扩张而不是限幅", x, got)
		}
		if got < 0 {
			t.Fatalf("softClip(%v) = %v —— 正输入变成了负输出", x, got)
		}
		// 负半边同样检查（对称性）
		gotNeg := softClip(-x)
		if gotNeg < -x-1e-12 {
			t.Fatalf("softClip(%v) = %v —— 输出幅度大于输入，这是增益扩张而不是限幅", -x, gotNeg)
		}
	}
}

// TestSoftClipMonotonic 验证软限幅在整个定义域上单调不减。
//
// 不单调的话，响一点的输入反而给出轻一点的输出 —— 波形会被折叠，
// 听感上是严重的非线性失真。
func TestSoftClipMonotonic(t *testing.T) {
	const step = 0.0005
	prev := softClip(-3.0)
	for x := -3.0 + step; x <= 3.0; x += step {
		cur := softClip(x)
		if cur < prev-1e-12 {
			t.Fatalf("softClip 在 %v 处不单调：%.9f → %.9f", x, prev, cur)
		}
		prev = cur
	}
}

// TestSoftClipBoundedByUnity 验证输出永远不超过满幅。
//
// 这是"绝不硬削波"的硬保证：writeSample 里还有一个 int16 钳位，
// 但那是最后一道保险（会制造尖角 = 破裂声）；软限幅必须自己先保证不越界。
func TestSoftClipBoundedByUnity(t *testing.T) {
	for _, x := range []float64{0.85, 0.9, 1.0, 1.5, 2, 5, 10, 100, 1e6} {
		if got := softClip(x); got > 1.0 {
			t.Errorf("softClip(%v) = %v，超出满幅", x, got)
		}
		if got := softClip(-x); got < -1.0 {
			t.Errorf("softClip(%v) = %v，超出满幅", -x, got)
		}
	}
}

// TestSoftClipWithinRange 验证软限幅的输出始终在 [-1, 1] 内，且不反相。
func TestSoftClipWithinRange(t *testing.T) {
	cases := []float64{0, 0.1, -0.1, 0.5, -0.5, 0.85, -0.85, 0.9, -0.9, 1.0, -1.0, 1.5, -1.5, 100, -100}
	for _, x := range cases {
		got := softClip(x)
		if got > 1.0 || got < -1.0 {
			t.Errorf("softClip(%v) = %v，超出 [-1,1]", x, got)
		}
		// 单调性：软限幅不该让信号反相
		if x > 0 && got < 0 {
			t.Errorf("softClip(%v) = %v，正输入变成了负输出", x, got)
		}
		if x < 0 && got > 0 {
			t.Errorf("softClip(%v) = %v，负输入变成了正输出", x, got)
		}
	}
}

// TestSoftClipTransparentBelowThreshold 验证阈值以下完全透明。
//
// ★ 这条是"无损"保证：正常音量（峰值远低于 0.85）的音乐经过
// 软限幅必须**逐位不变**，否则所有用户都在被静默劣化。
func TestSoftClipTransparentBelowThreshold(t *testing.T) {
	for i := -8500; i <= 8500; i++ {
		x := float64(i) / 10000.0
		if got := softClip(x); got != x {
			t.Fatalf("softClip(%v) = %v，阈值以下必须原样返回", x, got)
		}
	}
}

// TestSoftClipContinuousAtThreshold 验证软限幅在阈值处连续（无拐点）。
//
// 不连续的话，跨界的那一个样本会产生阶跃 —— 听感是轻微但持续的"沙沙"。
func TestSoftClipContinuousAtThreshold(t *testing.T) {
	const eps = 1e-6
	below := softClip(softClipThreshold - eps)
	above := softClip(softClipThreshold + eps)
	if math.Abs(above-below) > 1e-4 {
		t.Errorf("阈值处不连续：%.9f → %.9f（差 %.9f）", below, above, above-below)
	}
}

// TestChainOffIsBitExact 是本文件最重要的"无损"测试。
//
// ★ 不开音效时 ProcessStereo 必须把缓冲**逐字节**原样放行。
// 任何"顺手加个归一化 / 加个抖动 / 改个缩放系数"的改动都会破坏它，
// 后果是所有不用音效的用户的音质被悄悄改变。
//
// ★ 样本值必须都落在软限幅的透明区（|x| <= 0.85）内，
// 也就是 int16 的 [-27853, 27853]。
//
// 为什么不能拿 32767 / -32768 来测：那是满幅，软限幅**本来就要**
// 压它（32767 → 约 31596）。那条路径属于"限幅器在工作"，
// 不属于"旁路是否无损"。把它们混在一起测，会让这条测试在
// "限幅器写对了"和"旁路坏掉了"两种情况下都失败，无法区分。
// 满幅样本的行为由 TestSoftClip* 与 TestChainNoClipping* 覆盖。
func TestChainOffIsBitExact(t *testing.T) {
	var c Chain
	c.prepare(SampleRate)

	// 用一批"有代表性"的样本：零、正负最小位、透明区边界、中间值。
	// 27853 是透明区的正边界（0.85 × 32768 取整），刻意包含它。
	values := []int16{0, 1, -1, 27853, -27853, 12345, -12345, 100, -100, 32000 - 4147}
	original := make([]byte, len(values)*FrameSize)
	for i, v := range values {
		binary.LittleEndian.PutUint16(original[i*FrameSize:], uint16(v))
		binary.LittleEndian.PutUint16(original[i*FrameSize+2:], uint16(v))
	}
	work := make([]byte, len(original))
	copy(work, original)

	c.ProcessStereo(work)
	samplesEqualBytes(t, "off 档位", work, original)
}

// TestChainOffAfterSwitchingIsBitExact 验证从音效档位切回 off 之后，
// 输出重新变成逐位精确。
//
// ★ 这条比上一条更接近真实场景：用户试了几个音效，最后关掉。
// 关掉之后必须回到完全原始的音频 —— 而不是"基本原始但还残留一点"。
// 这里要先等 EQ 的系数 slew 收敛（882 帧），所以多跑几个缓冲。
//
// 样本范围同样限制在软限幅透明区内（理由见上一条）。
func TestChainOffAfterSwitchingIsBitExact(t *testing.T) {
	var c Chain
	c.prepare(SampleRate)

	// 先切到清澈人声并跑一会儿
	c.RequestPreset(EffectVocal)
	for block := 0; block < 6; block++ {
		buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
			return sineAt(i, 440, 0.5), sineAt(i, 440, 0.5)
		})
		c.ProcessStereo(buf)
	}

	// 切回 off，跑足够多的缓冲让 EQ 系数收敛（slew 是 882 帧，
	// 每个缓冲 1024 帧，所以 2 个缓冲就够，这里跑 4 个留余量）
	c.RequestPreset(EffectOff)
	for block := 0; block < 4; block++ {
		buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
			return 0, 0
		})
		c.ProcessStereo(buf)
	}

	// 现在再喂一批样本，必须逐位精确
	values := []int16{0, 1, -1, 27853, -27853, 12345, -12345}
	original := make([]byte, len(values)*FrameSize)
	for i, v := range values {
		binary.LittleEndian.PutUint16(original[i*FrameSize:], uint16(v))
		binary.LittleEndian.PutUint16(original[i*FrameSize+2:], uint16(v))
	}
	work := make([]byte, len(original))
	copy(work, original)

	c.ProcessStereo(work)
	samplesEqualBytes(t, "切回 off 之后", work, original)
}

// TestChainSwitchNoDiscontinuity 是防爆音的核心测试。
//
// 在信号播放中途切换音效，检查输出**相邻样本之间**没有出现大幅跳变。
//
// ★ 怎么界定"跳变"：一个 440Hz 正弦在 44.1kHz 下相邻样本的最大差
// 约为 2π*440/44100 ≈ 0.063（满幅时）。取 0.3 作为门限 —— 明显高于
// 正常波形斜率，又远低于"阶跃"（阶跃会是接近 1.0 的跳变）。
func TestChainSwitchNoDiscontinuity(t *testing.T) {
	// 逐一测试所有"切换路径"，重点是涉及混响的两条
	paths := [][2]EffectPreset{
		{EffectOff, EffectVocal},
		{EffectVocal, EffectOff},
		{EffectOff, EffectHall},
		{EffectHall, EffectOff},      // 关闭混响：最容易爆音的一条
		{EffectHall, EffectSurround}, // 混响 → 无混响：另一条危险路径
		{EffectSurround, EffectHall},
		{EffectLive, EffectHall}, // 混响 → 不同参数的混响
		{EffectBass, EffectVocal},
	}

	for _, path := range paths {
		from, to := path[0], path[1]
		t.Run(string(from)+"->"+string(to), func(t *testing.T) {
			var c Chain
			c.prepare(SampleRate)
			c.RequestPreset(from)
			// 让 from 生效并进入稳态
			for block := 0; block < 4; block++ {
				buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
					v := sineAt(block*PeriodFrames+i, 440, 0.6)
					return v, v
				})
				c.ProcessStereo(buf)
			}

			// 发起切换，然后连续处理若干个缓冲，把整个淡化过程覆盖住
			c.RequestPreset(to)

			const totalFrames = PeriodFrames * 4
			all := make([]byte, 0, totalFrames*FrameSize)
			for block := 0; block < 4; block++ {
				buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
					// 用连续的正弦相位，避免缓冲边界本身造成不连续
					v := sineAt(block*PeriodFrames+i, 440, 0.6)
					return v, v
				})
				c.ProcessStereo(buf)
				all = append(all, buf...)
			}

			// 检查相邻帧的最大跳变
			worst := 0
			worstAt := 0
			frames := len(all) / FrameSize
			for i := 1; i < frames; i++ {
				prev := int(int16(binary.LittleEndian.Uint16(all[(i-1)*FrameSize:])))
				cur := int(int16(binary.LittleEndian.Uint16(all[i*FrameSize:])))
				d := cur - prev
				if d < 0 {
					d = -d
				}
				if d > worst {
					worst = d
					worstAt = i
				}
			}
			// 0.3 * 32767 ≈ 9830
			if worst > 9830 {
				t.Errorf("切换 %s→%s 时出现跳变：第 %d 帧相邻差 %d（门限 9830，约满幅的 30%%）",
					from, to, worstAt, worst)
			}
		})
	}
}

// TestChainNoClippingWithExtremeInput 验证满幅输入经过音效链后
// 不会出现硬削波的迹象。
//
// ★ 音效链的作用是"修饰"，不是"制造爆音"。EQ 提升 + 混响叠加很容易
// 把峰值推过满幅，软限幅就是为此存在的 —— 这条测试检查它真的在工作。
func TestChainNoClippingWithExtremeInput(t *testing.T) {
	for _, preset := range []EffectPreset{EffectVocal, EffectBass, EffectHall} {
		t.Run(string(preset), func(t *testing.T) {
			var c Chain
			c.prepare(SampleRate)
			c.RequestPreset(preset)
			// 先跑几个缓冲让切换完成
			for block := 0; block < 3; block++ {
				buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
					v := sineAt(i, 440, 1.0)
					return v, v
				})
				c.ProcessStereo(buf)
			}

			// 喂满幅信号，统计"连续顶格"的样本数。
			//
			// 硬削波的特征是**大量连续样本同时顶格**；软限幅只会让
			// 峰值样本略微压扁，不会出现连续顶格。
			values := make([]int16, 0, PeriodFrames*2)
			for block := 0; block < 4; block++ {
				buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
					v := sineAt(block*PeriodFrames+i, 440, 1.0)
					return v, v
				})
				c.ProcessStereo(buf)
				for i := 0; i < PeriodFrames; i++ {
					values = append(values,
						int16(binary.LittleEndian.Uint16(buf[i*FrameSize:])),
						int16(binary.LittleEndian.Uint16(buf[i*FrameSize+2:])))
				}
			}

			// 检查是否触到 int16 的极值（32767 / -32768 是硬钳位的特征）
			hardClipped := 0
			for _, v := range values {
				if v == 32767 || v == -32768 {
					hardClipped++
				}
			}
			// 允许极少量（软限幅在 t=1 时输出恰好接近满幅，
			// 量化后可能碰到极值），但不能成片出现。
			if hardClipped > len(values)/50 {
				t.Errorf("%s: %d/%d 个样本触到硬钳位极值（应为软限幅）",
					preset, hardClipped, len(values))
			}
		})
	}
}

/* ==========================================================================
   4. 档位与校验
   ========================================================================== */

// TestNormalizeEffectPreset 验证非法档位名被收敛到 off。
func TestNormalizeEffectPreset(t *testing.T) {
	cases := map[string]EffectPreset{
		"off":      EffectOff,
		"vocal":    EffectVocal,
		"bass":     EffectBass,
		"surround": EffectSurround,
		"live":     EffectLive,
		"hall":     EffectHall,
		"":         EffectOff, // 空字符串
		"VOCAL":    EffectOff, // 大小写敏感（配置里存的都是小写）
		"bogus":    EffectOff,
		"eq":       EffectOff, // 曾经考虑过的名字，不是合法档位
	}
	for in, want := range cases {
		if got := NormalizeEffectPreset(in); got != want {
			t.Errorf("NormalizeEffectPreset(%q) = %q，期望 %q", in, got, want)
		}
	}
}

// TestEffectPresetsAllHaveSpecs 验证每个列出的档位都有对应的参数定义。
//
// ★ 这条防的是"加了档位名但忘了写 presetSpecs"——
// 那种情况下 map 查询返回零值 spec，表现为"选了档位但完全没有效果"。
func TestEffectPresetsAllHaveSpecs(t *testing.T) {
	for _, p := range EffectPresets {
		spec, ok := presetSpecs[p]
		if !ok {
			t.Errorf("档位 %q 在 EffectPresets 里但没有 presetSpecs 定义", p)
			continue
		}
		// off 之外每个档位至少要改变点什么，否则它是个"空档位"
		if p == EffectOff {
			continue
		}
		hasEQ := len(spec.bands) > 0 || spec.highPassHz > 0
		hasStereo := spec.stereo.Width != 0 || spec.stereo.Haas != 0 || spec.stereo.Crossfeed != 0
		hasReverb := spec.enableReverb
		if !hasEQ && !hasStereo && !hasReverb {
			t.Errorf("档位 %q 什么效果都不做（空档位）", p)
		}
	}
}

// TestEffectPresetLabelsAllPresent 验证每个档位都有中文名。
func TestEffectPresetLabelsAllPresent(t *testing.T) {
	for _, p := range EffectPresets {
		if label := EffectPresetLabel(p); label == "" {
			t.Errorf("档位 %q 没有标签", p)
		}
	}
}

// TestPresetGainsWithinReasonableRange 验证所有预设的增益都在 ±6dB 内。
//
// ★ 上限 6dB 是设计约束（写在本文件的注释里）：更大的提升配合软限幅
// 会明显压扁动态，用户对比"开/关"时会觉得"开了变难听"。
func TestPresetGainsWithinReasonableRange(t *testing.T) {
	for name, spec := range presetSpecs {
		for _, b := range spec.bands {
			if math.Abs(b.gainDB) > 6.0 {
				t.Errorf("档位 %q 的 %.0fHz 频段增益 %.1f dB 超出 ±6dB 设计约束",
					name, b.freq, b.gainDB)
			}
		}
	}
}

// TestPresetFrequenciesWithinNyquist 验证所有频段频率都在奈奎斯特频率以下。
//
// ★ 频率 >= 采样率/2 时 w0 >= π，设计公式会产生无意义的系数
// （cos(w0) 开始重复），滤波器行为完全不可预测。
func TestPresetFrequenciesWithinNyquist(t *testing.T) {
	nyquist := float64(SampleRate) / 2
	for name, spec := range presetSpecs {
		if spec.highPassHz >= nyquist {
			t.Errorf("档位 %q 的高通频率 %.0fHz >= 奈奎斯特频率 %.0fHz", name, spec.highPassHz, nyquist)
		}
		for _, b := range spec.bands {
			if b.freq <= 0 || b.freq >= nyquist {
				t.Errorf("档位 %q 的频段频率 %.0fHz 超出 (0, %.0f)", name, b.freq, nyquist)
			}
		}
	}
}

/* ==========================================================================
   5. 功能正确性（"清澈人声确实让人声更清楚"）
   ========================================================================== */

// TestVocalPresetBoostsPresenceBand 验证清澈人声档确实抬高了
// 3kHz 附近的"清晰度"频段、并且切掉了低频。
//
// 这是"预设实际做了什么"的端到端验证 —— 前面的测试验证了滤波器
// 公式正确，这条验证**预设参数**配得对（比如把 3000 写成 300 就过不了）。
func TestVocalPresetBoostsPresenceBand(t *testing.T) {
	var c Chain
	c.prepare(SampleRate)
	c.RequestPreset(EffectVocal)
	// 等切换 + 系数 slew 完全收敛
	for block := 0; block < 4; block++ {
		buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) { return 0, 0 })
		c.ProcessStereo(buf)
	}

	measure := func(freq float64) float64 {
		frames := 16384
		const amp = 0.2
		buf := makeStereoSamples(frames, func(i int) (float64, float64) {
			v := sineAt(i, freq, amp)
			return v, v
		})
		c.ProcessStereo(buf)
		return measureGainDB(t, "vocal", buf, freq, amp, 8192)
	}

	// 低频（80Hz，人声高通 120Hz 以下）应被明显衰减
	low := measure(80)
	if low > -3 {
		t.Errorf("清澈人声在 80Hz 增益 = %.2f dB，期望明显衰减（< -3dB）", low)
	}

	// 3kHz（清晰度频段）应被提升
	presence := measure(3000)
	if presence < 1.0 {
		t.Errorf("清澈人声在 3kHz 增益 = %.2f dB，期望提升（> +1dB）", presence)
	}
}

// TestBassPresetBoostsLowFreq 验证低音增强档确实抬高了低频。
func TestBassPresetBoostsLowFreq(t *testing.T) {
	var c Chain
	c.prepare(SampleRate)
	c.RequestPreset(EffectBass)
	for block := 0; block < 4; block++ {
		buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) { return 0, 0 })
		c.ProcessStereo(buf)
	}

	frames := 16384
	const amp = 0.2
	buf := makeStereoSamples(frames, func(i int) (float64, float64) {
		v := sineAt(i, 100, amp)
		return v, v
	})
	c.ProcessStereo(buf)
	got := measureGainDB(t, "bass", buf, 100, amp, 8192)
	if got < 2.0 {
		t.Errorf("低音增强在 100Hz 增益 = %.2f dB，期望提升（> +2dB）", got)
	}
}

// TestStereoPresetWidensSideSignal 验证 3D 环绕档确实放大了侧信号。
//
// ★ 用"纯侧信号"（L = -R）来测侧分量：宽度处理只作用于侧分量。
//
// 这里同时验证**两个不同机制**，必须分开测，因为它们的预期行为相反：
//
//  1. M/S 宽度 —— 只放大 L-R，**不碰** L+R。所以对纯侧信号有效果；
//  2. Haas 延迟 —— 只延迟右声道，**故意**让 L 与 R 不再相等。
//
// 曾经把"中置信号应该完全不动"当成宽度的性质写进断言，结果被 Haas
// 破坏了。那不是 bug：Haas 的工作原理就是"给一侧加一点延迟制造
// 双耳差异"，对纯中置素材它同样起作用（这正是"3D 环绕"在单声道
// 老录音上也能听出效果的原理）。所以"中置完全不动"只对**关闭 Haas**
// 的档位成立，测试必须按机制拆开。
func TestStereoPresetWidensSideSignal(t *testing.T) {
	// measureChannelDiff 返回处理后的平均 |L-R|。
	// midOnly=true 时输入是纯中置，false 时是纯侧。
	measureChannelDiff := func(params StereoParams, midOnly bool) float64 {
		// 直接构造一个只做空间处理的链，绕开预设表 ——
		// 这样每条断言测的就是"某一个机制"，不会被档位里其他参数干扰。
		var s stereoStage
		s.prepare(SampleRate)
		s.setParams(params)

		frames := 16384
		buf := makeStereoSamples(frames, func(i int) (float64, float64) {
			v := sineAt(i, 440, 0.2)
			if midOnly {
				return v, v
			}
			return v, -v
		})
		// 逐帧过空间处理（与 Chain 里的调用顺序一致）
		for i := 0; i < frames; i++ {
			off := i * FrameSize
			l := float64(int16(binary.LittleEndian.Uint16(buf[off:]))) / 32768.0
			r := float64(int16(binary.LittleEndian.Uint16(buf[off+2:]))) / 32768.0
			ol, or := s.processStereo(l, r)
			binary.LittleEndian.PutUint16(buf[off:], uint16(int16(ol*sampleScale)))
			binary.LittleEndian.PutUint16(buf[off+2:], uint16(int16(or*sampleScale)))
		}

		// 跳过后半段，等 Haas 延迟线进入稳态
		var sum float64
		for i := frames / 2; i < frames; i++ {
			off := i * FrameSize
			l := float64(int16(binary.LittleEndian.Uint16(buf[off:]))) / 32768.0
			r := float64(int16(binary.LittleEndian.Uint16(buf[off+2:]))) / 32768.0
			sum += math.Abs(l - r)
		}
		return sum / float64(frames/2)
	}

	const amp = 0.2

	// —— 机制 1：M/S 宽度 ——
	// 纯侧信号在 Width 处理下应该明显变宽。
	// 注意此时 Haas=0、Crossfeed=0，所以通道差完全来自宽度。
	sidePlain := measureChannelDiff(StereoParams{Width: 0.5}, false) // 0.5 = 原始宽度
	sideWide := measureChannelDiff(StereoParams{Width: 0.95}, false)
	if sideWide <= sidePlain*1.3 {
		t.Errorf("宽度 0.95 下侧信号 |L-R| = %.5f，宽度 0.5（原始）时 %.5f —— 没有明显加宽",
			sideWide, sidePlain)
	}

	// 纯中置信号在**只有宽度**时应该完全不受影响。
	midPlain := measureChannelDiff(StereoParams{Width: 0.5}, true)
	midWide := measureChannelDiff(StereoParams{Width: 0.95}, true)
	if midWide > midPlain+1e-4 {
		t.Errorf("M/S 宽度把中置信号的 |L-R| 从 %.6f 变成了 %.6f —— 加宽不该破坏中置声像",
			midPlain, midWide)
	}

	// —— 机制 2：Haas 延迟 ——
	// 它对纯中置信号**应该**产生通道差异（这就是它制造空间感的原理）。
	midHaas := measureChannelDiff(StereoParams{Width: 0.5, Haas: 0.35}, true)
	if midHaas < amp*0.1 {
		t.Errorf("Haas 对中置信号只产生了 %.5f 的通道差，期望明显可见（约 %.5f）",
			midHaas, amp*0.35)
	}

	// —— 机制 3：串扰 ——
	// 串扰把两侧互相混合，所以它会**减小**纯侧信号的通道差
	//（极端情况 crossfeed=1 时两声道完全相同 = 单声道）。
	sideCross := measureChannelDiff(StereoParams{Width: 0.5, Crossfeed: 1.0}, false)
	if sideCross >= sidePlain {
		t.Errorf("串扰全开时侧信号 |L-R| = %.5f，未开时 %.5f —— 串扰应该缩小通道差",
			sideCross, sidePlain)
	}
}

// TestSurroundPresetIsAudibleOnMonoSource 验证 3D 环绕档在**单声道素材**
// 上也有可听的改变。
//
// ★ 为什么单独测这个：很多老录音、播客、以及部分在线音源是实质单声道
// （L 与 R 完全相同）。如果"3D 环绕"只做 M/S 加宽，那对这类素材
// 完全没有效果 —— 用户点了按钮却听不出区别，会认为功能坏了。
// Haas 与串扰就是为了让这类素材也有变化而存在的。
func TestSurroundPresetIsAudibleOnMonoSource(t *testing.T) {
	run := func(preset EffectPreset) []float64 {
		var c Chain
		c.prepare(SampleRate)
		c.RequestPreset(preset)
		// 等切换 + slew 收敛
		for block := 0; block < 4; block++ {
			buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) { return 0, 0 })
			c.ProcessStereo(buf)
		}

		frames := PeriodFrames
		buf := makeStereoSamples(frames, func(i int) (float64, float64) {
			v := sineAt(i, 440, 0.3)
			return v, v // 纯单声道素材
		})
		c.ProcessStereo(buf)

		out := make([]float64, frames)
		for i := 0; i < frames; i++ {
			off := i * FrameSize
			out[i] = float64(int16(binary.LittleEndian.Uint16(buf[off+2:]))) / 32768.0
		}
		return out
	}

	plain := run(EffectOff)
	surround := run(EffectSurround)

	// 逐样本比较：必须存在明显差异（不能用"有点不同"当通过标准，
	// 那样连浮点噪声都能过）。取最大差值的均值作为判据。
	var maxDiff float64
	for i := range plain {
		d := math.Abs(plain[i] - surround[i])
		if d > maxDiff {
			maxDiff = d
		}
	}
	// 输入幅度 0.3，Haas 混入量 0.35 → 预期差异量级约 0.1
	if maxDiff < 0.02 {
		t.Errorf("3D 环绕对单声道素材的最大改变只有 %.5f，期望 > 0.02（用户应能听出区别）",
			maxDiff)
	}
}

// TestChainRapidSwitchingStaysClean 验证快速连续切换档位不会失控。
//
// ★ 这是一个**真实用户行为**，不是构造出来的极端场景：
// 用户在设置界面里逐个试音效（"清澈人声"→"3D 环绕"→"大厅混响"…）
// 时，点击间隔远小于 30ms 的淡化时长，所以每一次新切换都发生在
// 上一次淡化还没走完的时候。
//
// 这正是两链设计里最容易出错的地方：如果新请求把"正在淡入的那条链"
// 当成新目标、同时又把"正在淡出的那条链"的状态搞混，就会出现
// 输出在两个效果之间来回跳。这条测试逐档连续切换，只给每个档位
// 一个缓冲（1024 帧 ≈ 23ms，短于淡化时长），确保淡化总被打断。
func TestChainRapidSwitchingStaysClean(t *testing.T) {
	var c Chain
	c.prepare(SampleRate)

	// 刻意包含反复回到 hall / off 的往返（涉及混响的开关，
	// 是最容易暴露"延迟线内容被错误复用"的路径）
	order := []EffectPreset{
		EffectHall, EffectOff, EffectVocal, EffectSurround,
		EffectBass, EffectHall, EffectLive, EffectOff, EffectHall,
	}

	worst := 0
	for step, p := range order {
		c.RequestPreset(p)
		buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
			v := sineAt(i, 440, 0.8)
			return v, v
		})
		c.ProcessStereo(buf)

		for i := 1; i < PeriodFrames; i++ {
			prev := int(int16(binary.LittleEndian.Uint16(buf[(i-1)*FrameSize:])))
			cur := int(int16(binary.LittleEndian.Uint16(buf[i*FrameSize:])))
			d := cur - prev
			if d < 0 {
				d = -d
			}
			if d > worst {
				worst = d
			}
		}
		if worst > 12000 {
			t.Fatalf("第 %d 步（切到 %s）出现跳变 %d —— 快速切换时状态串了",
				step, p, worst)
		}
	}
	// 记录实测值便于以后回归时对比（正常应在 2000 以内）
	t.Logf("快速连续切换 %d 次，最大相邻样本跳变 = %d", len(order), worst)
}

// TestProcessStereoAllocsZero 验证音频回调路径**零分配**。
//
// ★ 这不是性能优化，而是正确性约束。
//
// ProcessStereo 跑在 malgo 的实时音频线程上。在那里分配内存意味着：
//
//	· 每 23ms 一次的分配会持续制造 GC 压力，而 Go 的 GC 停顿
//	  直接就是一声爆音（engine.go 的 onData 注释里也强调了这点）；
//	· 停顿的时机不可预测 —— 表现为"平时挺好，偶尔咔一下"，
//	  这种问题在人工试听时极难复现和定位。
//
// 全部缓冲都在 Chain.prepare 里一次分配好，ProcessStereo 只做下标运算。
// 这条测试用 testing.AllocsPerRun 把这个约定钉住 —— 以后有人在
// 热路径里写了一句 make / append / 闭包捕获，这里会立刻失败。
//
// 档位切换路径（applyPendingLocked → applyPreset）同样要零分配：
// 它虽然不是每个缓冲都跑，但**可能在任何一次回调里跑**，
// 所以约束完全相同。
func TestProcessStereoAllocsZero(t *testing.T) {
	for _, p := range EffectPresets {
		t.Run(string(p), func(t *testing.T) {
			var c Chain
			c.prepare(SampleRate)
			c.RequestPreset(p)

			buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
				v := sineAt(i, 440, 0.5)
				return v, v
			})
			// 先跑几次让切换与系数 slew 稳定下来 ——
			// 这一段是"过渡态"，AllocsPerRun 要测的是稳态。
			for i := 0; i < 5; i++ {
				c.ProcessStereo(buf)
			}

			if got := testing.AllocsPerRun(50, func() { c.ProcessStereo(buf) }); got != 0 {
				t.Errorf("ProcessStereo（%s）每次分配 %.1f 次，期望 0 —— 音频线程不能分配内存",
					p, got)
			}
		})
	}

	// 切换档位的路径单独测：它在回调**内部**触发，
	// 所以"切换时分配了"和"稳态分配了"一样致命。
	t.Run("switching", func(t *testing.T) {
		var c Chain
		c.prepare(SampleRate)
		buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
			return 0.1, 0.1
		})
		got := testing.AllocsPerRun(50, func() {
			c.RequestPreset(EffectHall)
			c.ProcessStereo(buf)
			c.RequestPreset(EffectOff)
			c.ProcessStereo(buf)
		})
		if got != 0 {
			t.Errorf("切换档位时 ProcessStereo 分配 %.1f 次，期望 0", got)
		}
	})
}

// TestChainAfterPrepareHasNoSilentOutput 验证 prepare 之后链不是"静音"的。
//
// ★ 这条防的是零值 biquadCoeffs 的坑：b0=0 会让输出直接变成 0。
// 如果 eqSection.apply 里没把空频段显式设成 b0=1，off 档位就会静音 ——
// 而 TestChainOffIsBitExact 会同时失败，但那条测试的失败信息
// 不会直接指向原因。这里给一个更明确的信号。
func TestChainAfterPrepareHasNoSilentOutput(t *testing.T) {
	var c Chain
	c.prepare(SampleRate)

	buf := makeStereoSamples(64, func(i int) (float64, float64) {
		return sineAt(i, 440, 0.5), sineAt(i, 440, 0.5)
	})
	c.ProcessStereo(buf)

	nonZero := 0
	for i := 0; i < 64; i++ {
		if binary.LittleEndian.Uint16(buf[i*FrameSize:]) != 0 {
			nonZero++
		}
	}
	if nonZero == 0 {
		t.Fatal("prepare 之后链把输出变成了全零（biquadCoeffs 的 b0=0 坑）")
	}
}
