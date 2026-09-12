package loudness

import (
	"math"
	"testing"
)

/* --------------------------------------------------------------------------
   BS.1770 的已知锚点
   --------------------------------------------------------------------------
   标准里最有用的一条自检：**满量程 997 Hz 正弦波的整合响度是 -3.01 LKFS**。
   这是因为 K 加权滤波器在 997Hz（标准选它就是为了对齐）增益为 0dB，
   而一个幅度 1.0 的正弦波 RMS 是 1/√2，即 -3.01 dB。

   如果实现里滤波器系数、声道求和或门限任一处错了，这条就会偏。
   -------------------------------------------------------------------------- */

const testRate = 48000

// sine 生成 durationSec 秒的 997Hz 正弦，幅度 amp（1.0 = 满量程）
func sine(rate int, durationSec float64, amp float64) []float64 {
	n := int(float64(rate) * durationSec)
	out := make([]float64, n)
	for i := 0; i < n; i++ {
		out[i] = amp * math.Sin(2*math.Pi*997*float64(i)/float64(rate))
	}
	return out
}

// TestBS1770Anchor 满量程 997Hz 正弦应为 -3.01 LKFS
func TestBS1770Anchor(t *testing.T) {
	// 用单声道（K 加权后单声道权重 1.0）
	samples := sine(testRate, 10, 1.0)
	got := IntegratedLUFS([][]float64{samples}, testRate)

	// 允许 ±0.1 LU：门限与块对齐会带来一点点差异
	if math.Abs(got-(-3.01)) > 0.1 {
		t.Errorf("满量程 997Hz 正弦测得 %.2f LUFS，期望 -3.01 ±0.1", got)
	}
}

// TestBS1770HalfAmplitude 幅度减半应恰好低 6.02 LU
func TestBS1770HalfAmplitude(t *testing.T) {
	full := IntegratedLUFS([][]float64{sine(testRate, 8, 1.0)}, testRate)
	half := IntegratedLUFS([][]float64{sine(testRate, 8, 0.5)}, testRate)

	diff := full - half
	if math.Abs(diff-6.02) > 0.1 {
		t.Errorf("幅度减半应低 6.02 LU，实际差 %.2f（full=%.2f half=%.2f）", diff, full, half)
	}
}

// TestBS1770PerChannelWeighting 立体声同信号比单声道响约 3.01 LU
// （BS.1770 规定左右声道权重各为 1.0，能量相加）
func TestBS1770PerChannelWeighting(t *testing.T) {
	mono := IntegratedLUFS([][]float64{sine(testRate, 8, 0.5)}, testRate)
	s := sine(testRate, 8, 0.5)
	stereo := IntegratedLUFS([][]float64{s, s}, testRate)

	diff := stereo - mono
	if math.Abs(diff-3.01) > 0.1 {
		t.Errorf("双声道同信号应响 3.01 LU，实际差 %.2f", diff)
	}
}

// TestBS1770Silence 静音不应产生有效响度
func TestBS1770Silence(t *testing.T) {
	silence := make([]float64, testRate*5)
	got := IntegratedLUFS([][]float64{silence}, testRate)
	if !math.IsInf(got, -1) && got > -70 {
		t.Errorf("静音应低于绝对门限（返回 -Inf 或极小值），实际 %.2f", got)
	}
}

// TestBS1770TooShort 短于一个门限块（400ms）时无法给出整合响度
func TestBS1770TooShort(t *testing.T) {
	short := sine(testRate, 0.2, 1.0) // 200ms < 400ms
	got := IntegratedLUFS([][]float64{short}, testRate)
	if !math.IsInf(got, -1) {
		t.Errorf("不足 400ms 时无法计算整合响度，应返回 -Inf，实际 %.2f", got)
	}
}

// TestBS1770GatingShortLoudBurst 门限必须把「短暂很响」的部分算进去，
// 而把长时间的安静段排除掉。
func TestBS1770GatingShortLoudBurst(t *testing.T) {
	// 20 秒里前 3 秒是满量程，其余是 -40dB 的底噪
	n := testRate * 20
	mixed := make([]float64, n)
	loud := sine(testRate, 3, 1.0)
	copy(mixed, loud)
	quiet := sine(testRate, 17, 0.01)
	copy(mixed[len(loud):], quiet)

	got := IntegratedLUFS([][]float64{mixed}, testRate)

	// 只按整体 RMS 算会明显低于算上响亮段的门限结果；
	// 有门限时结果应接近那段响音频（约 -3.01）而不是被安静段拉到很低
	if got < -10 {
		t.Errorf("门限没有起作用：测得 %.2f LUFS，应该更接近响亮段（约 -3）", got)
	}
	if got > 0 {
		t.Errorf("不应超过 0 LUFS，实际 %.2f", got)
	}
}

// TestBS1770SampleRateCoefficients 不同采样率都要能用（系数按采样率取）
func TestBS1770SampleRateCoefficients(t *testing.T) {
	for _, rate := range []int{44100, 48000, 88200, 96000} {
		got := IntegratedLUFS([][]float64{sine(rate, 6, 1.0)}, rate)
		if math.Abs(got-(-3.01)) > 0.2 {
			t.Errorf("采样率 %d 下测得 %.2f LUFS，期望约 -3.01（滤波器系数可能没按采样率取）", rate, got)
		}
	}
}

// TestTruePeak 真峰值应能识别出接近满量程的信号
func TestTruePeak(t *testing.T) {
	// 幅度 0.5 → 真峰值约 -6.02 dBTP
	got := TruePeakDBTP([][]float64{sine(testRate, 1, 0.5)}, testRate)
	if math.Abs(got-(-6.02)) > 0.2 {
		t.Errorf("幅度 0.5 的真峰值 = %.2f dBTP，期望约 -6.02", got)
	}

	// 静音
	if tp := TruePeakDBTP([][]float64{make([]float64, testRate)}, testRate); !math.IsInf(tp, -1) {
		t.Errorf("静音真峰值应为 -Inf，实际 %.2f", tp)
	}
}

// TestLoudnessRange 响度范围（LRA）对平稳信号应接近 0
func TestLoudnessRange(t *testing.T) {
	steady := IntegratedLRA([][]float64{sine(testRate, 10, 0.5)}, testRate)
	if steady > 3 {
		t.Errorf("平稳信号的 LRA 应很小，实际 %.2f LU", steady)
	}
}

// TestKWeightingDCRejected K 加权含高通，直流应被压掉
func TestKWeightingDCRejected(t *testing.T) {
	// 纯直流（常量 0.5）加权后应远低于同幅度的 997Hz 正弦
	dc := make([]float64, testRate*5)
	for i := range dc {
		dc[i] = 0.5
	}
	gotDC := IntegratedLUFS([][]float64{dc}, testRate)
	gotTone := IntegratedLUFS([][]float64{sine(testRate, 5, 0.5)}, testRate)
	if !math.IsInf(gotDC, -1) && gotDC > gotTone-6 {
		t.Errorf("K 加权的高通应显著衰减直流：dc=%.2f tone=%.2f", gotDC, gotTone)
	}
}
