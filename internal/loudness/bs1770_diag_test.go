package loudness

import (
	"math"
	"testing"
)

// TestDiagAnchorPipeline 打印锚点计算的每一步，便于日后排查偏差来源。
//
// 手工推导：997Hz 满量程正弦 → 原始均方 0.5（-3.01dB）
// → K 加权 +0.691dB → 块能量 0.5864 → 块响度 -3.009 LKFS（已含常数）
// → 门限聚合后仍是 -3.01。
//
// 打印中间量而不是只断言最终值：一旦出现回归，一眼能看出问题在
// 滤波器、块切分还是门限聚合。
func TestDiagAnchorPipeline(t *testing.T) {
	const rate = 48000
	samples := sine(rate, 10, 1.0)

	// 1) 原始均方
	var rawSum float64
	for _, v := range samples {
		rawSum += v * v
	}
	rawMean := rawSum / float64(len(samples))
	t.Logf("原始: mean(x²)=%.6f  →  %.3f dB", rawMean, 10*math.Log10(rawMean))

	// 2) K 加权后的均方（跳过滤波器瞬态）
	out := kWeight(samples, rate)
	var wSum float64
	const skip = 5000
	for _, v := range out[skip:] {
		wSum += v * v
	}
	wMean := wSum / float64(len(out)-skip)
	t.Logf("加权: mean(y²)=%.6f  →  %.3f dB（相对原始 %+.3f dB）",
		wMean, 10*math.Log10(wMean), 10*math.Log10(wMean/rawMean))

	// 3) 块与块响度
	blocks := measureBlocks([][]float64{samples}, rate)
	t.Logf("块数 = %d", len(blocks))
	if len(blocks) > 0 {
		mid := blocks[len(blocks)/2]
		t.Logf("中间块 power=%.6f  块响度=%.3f LKFS", blockPower(mid), blockLoudness(mid))
	}

	lufs, lra := integrate(blocks)
	t.Logf("integrate → %.4f LUFS, LRA=%.3f", lufs, lra)
	t.Logf("理论（不加门限）: %.4f", powerToLoudness(wMean))

	// 平稳信号下，门限聚合不应改变结果
	if math.Abs(lufs-(-3.01)) > 0.1 {
		t.Errorf("锚点 = %.4f，期望 -3.01", lufs)
	}
}
