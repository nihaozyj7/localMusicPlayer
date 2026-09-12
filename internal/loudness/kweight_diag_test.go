package loudness

import (
	"math"
	"testing"
)

// TestKWeightingGainAtCalibrationPoint K 加权在 997Hz 的增益必须是 +0.691 dB。
//
// 这一点反直觉，但正是 BS.1770 的设计：发布的滤波器系数在 997Hz（标准选定的
// 标定点）处增益为 +0.691 dB，而响度公式里的常数 -0.691 恰好抵消它，
// 于是「满量程 997Hz 正弦 = -3.01 LKFS」成立。
//
// 所以这里不能断言 0dB —— 那会把正确的实现改坏（我第一版就断言错了）。
// 真正该守的是 bs1770_test.go 里的锚点：整个链路算出来必须是 -3.01。
func TestKWeightingGainAtCalibrationPoint(t *testing.T) {
	const rate = 48000
	n := rate * 4
	src := make([]float64, n)
	for i := range src {
		src[i] = math.Sin(2 * math.Pi * 997 * float64(i) / float64(rate))
	}
	out := kWeight(src, rate)

	rms := func(a []float64) float64 {
		var sum float64
		for _, v := range a[1000:] {
			sum += v * v
		}
		return math.Sqrt(sum / float64(len(a)-1000))
	}
	gainDB := 20 * math.Log10(rms(out)/rms(src))
	t.Logf("K 加权在 997Hz 的增益 = %+.4f dB（应为 +0.691，由公式常数抵消）", gainDB)
	if math.Abs(gainDB-0.691) > 0.02 {
		t.Errorf("997Hz 增益 = %+.4f dB，期望 +0.691 dB", gainDB)
	}
}

// TestCalibrationConstantCancelsFilterGain 换一种说法守住同一件事：
// 滤波器在标定点的增益 + 公式常数 = 0，这样 997Hz 满量程才落在 -3.01。
func TestCalibrationConstantCancelsFilterGain(t *testing.T) {
	const rate = 48000
	n := rate * 4
	src := make([]float64, n)
	for i := range src {
		src[i] = math.Sin(2 * math.Pi * 997 * float64(i) / float64(rate))
	}
	out := kWeight(src, rate)
	var sumS, sumO float64
	for i := 1000; i < n; i++ {
		sumS += src[i] * src[i]
		sumO += out[i] * out[i]
	}
	gainDB := 10 * math.Log10(sumO/sumS)
	total := gainDB + loudnessOffset
	if math.Abs(total) > 0.02 {
		t.Errorf("标定点上「滤波增益 + 常数」应为 0 dB，实际 %+.4f dB（滤波 %+.4f + 常数 %.3f）",
			total, gainDB, loudnessOffset)
	}
}

// TestKWeightingLowFrequencyRolloff 低频应被衰减（K 加权含高通）
func TestKWeightingLowFrequencyRolloff(t *testing.T) {
	const rate = 48000
	measure := func(freq float64) float64 {
		n := rate * 2
		src := make([]float64, n)
		for i := range src {
			src[i] = math.Sin(2 * math.Pi * freq * float64(i) / float64(rate))
		}
		out := kWeight(src, rate)
		rms := func(a []float64) float64 {
			var sum float64
			for _, v := range a[1000:] {
				sum += v * v
			}
			return math.Sqrt(sum / float64(len(a)-1000))
		}
		return 20 * math.Log10(rms(out)/rms(src))
	}
	low := measure(60)
	high := measure(1000)
	t.Logf("60Hz 增益 %+.2f dB，1000Hz 增益 %+.2f dB", low, high)
	if low > high-3 {
		t.Errorf("60Hz 应比 1000Hz 低不少（高通作用），实际 %+.2f vs %+.2f", low, high)
	}
}

// TestKWeightingGainCurve 打印若干频点的增益，便于人工比对标准曲线
func TestKWeightingGainCurve(t *testing.T) {
	const rate = 48000
	for _, freq := range []float64{20, 60, 100, 500, 997, 2000, 5000, 10000} {
		n := rate * 2
		src := make([]float64, n)
		for i := range src {
			src[i] = math.Sin(2 * math.Pi * freq * float64(i) / float64(rate))
		}
		out := kWeight(src, rate)
		var sumS, sumO float64
		for i := 1000; i < n; i++ {
			sumS += src[i] * src[i]
			sumO += out[i] * out[i]
		}
		g := 20 * math.Log10(math.Sqrt(sumO/float64(n-1000))/math.Sqrt(sumS/float64(n-1000)))
		t.Logf("  %6.0f Hz : %+7.3f dB", freq, g)
	}
}
