/* ==========================================================================
   effects_orbit_test.go — "音乐绕着头转"的回归测试
   --------------------------------------------------------------------------
   第五轮的用户反馈是"你的这个音频是**固定的**……左右两只耳机输出的
   声音是动态的"。前四轮的处理全是静态的，指标再好看也不会动 ——
   这个文件钉的就是**动**本身。

   三条判据各防一种退化：
     1. 输出的左右平衡必须**随时间大幅摆动**（不然就退回"固定"）；
     2. 摆动**不得改变单声道折叠**（不然一开环绕音量就跟着呼吸）；
     3. 摆到最极端的那一相位**不得削顶**（软限幅在 x>1.48 之后会
        连续钉死在满幅上，那正是"爆音"的形态）。
   ========================================================================== */

package audioplay

import (
	"encoding/binary"
	"math"
	"testing"
)

// TestSurroundImageActuallyMovesOverTime 是第五轮反馈的直接回归：
// 环绕档下左右耳的响度平衡必须随时间**明显**摆动。
//
// ★ 素材刻意用**单声道白噪**：素材自己没有左右差，测到的一切不平衡
// 只能来自音效链；而白噪铺满全频段，比单一正弦更接近"听音乐"的
// 复合结果（全通去相关对每个频点的静态偏置方向不同，单频探针
// 会把结果带偏到某一个频点的极端值上）。
//
// ★ 按 0.5 秒分块算左右 RMS 之比：块太长会把摆动平均掉，
// 太短又会被波形相位污染。0.5 秒相对 4 秒的周期是 1/8，
// 一圈至少落 8 个采样点，足够还原摆幅。
//
// ★ 判据取峰峰值 ≥ 6dB：实测约 15dB。6dB 是"明显在动"与
// "静态处理的自然漂移"的分界 —— 本文件存在之前的实现实测峰峰值 0dB。
func TestSurroundImageActuallyMovesOverTime(t *testing.T) {
	const total = SampleRate * 5 // 大于一个摆动周期（4 秒）
	const block = SampleRate / 2 // 0.5 秒一块

	var c Chain
	c.prepare(SampleRate)
	c.RequestPreset(EffectSurround)
	for b := 0; b < 4; b++ {
		buf := makeStereoSamples(PeriodFrames, func(int) (float64, float64) { return 0, 0 })
		c.ProcessStereo(buf)
	}

	noise := diagNoise(total, 0.3)
	buf := makeStereoSamples(total, func(i int) (float64, float64) {
		return noise[i], noise[i] // 纯单声道
	})
	c.ProcessStereo(buf)

	ilds := make([]float64, 0, total/block)
	for start := 0; start+block <= total; start += block {
		var el, er float64
		for i := start; i < start+block; i++ {
			off := i * FrameSize
			l := float64(int16(binary.LittleEndian.Uint16(buf[off:]))) / sampleScale
			r := float64(int16(binary.LittleEndian.Uint16(buf[off+2:]))) / sampleScale
			el += l * l
			er += r * r
		}
		if el <= 0 || er <= 0 {
			t.Fatalf("第 %d 块能量为 0（左 %.6g / 右 %.6g）", start/block, el, er)
		}
		ilds = append(ilds, 10*math.Log10(el/er))
	}

	lo, hi := ilds[0], ilds[0]
	for _, v := range ilds {
		if v < lo {
			lo = v
		}
		if v > hi {
			hi = v
		}
	}
	swing := hi - lo

	if swing < 6 {
		t.Errorf("环绕档左右响度平衡的摆幅只有 %.2f dB（各块 ILD：%v），期望 >= 6dB —— "+
			"输出是**固定的**，用户反馈的「左右两只耳机输出的声音是动态的」没有被做到",
			swing, ilds)
	} else {
		t.Logf("环绕档左右响度摆幅 %.1f dB（%.1f ~ %.1f dB，%d 块）", swing, lo, hi, len(ilds))
	}
}

// TestOrbitPanKeepsMonoFoldExact 钉住摆动声像的**恒等性质**：
// 无论摆到哪个相位，L + R 都必须与输入逐位一致。
//
// ★ 这是整个摆动设计能塞进链尾、又不碰任何折叠判据的根本前提
// （见 effects_orbit.go 第一节）。它一旦被破坏，下面所有判据都会
// 静默变味：TestSurroundMonoFoldDownIsUsable 会先开始飘。
func TestOrbitPanKeepsMonoFoldExact(t *testing.T) {
	for _, s := range []float64{-1, -0.7, -0.3, 0, 0.15, 0.5, 0.9, 1} {
		for _, v := range []float64{0, 0.25, -0.9, 0.75, -1} {
			// 输入取一对任意左右值（含不相等的），折叠必须原样回来
			for _, in := range [][2]float64{{v, v}, {v, -v * 0.4}, {v * 0.3, v * 0.8}} {
				ol, orr := applyOrbitPan(in[0], in[1], s)
				if got, want := ol+orr, in[0]+in[1]; math.Abs(got-want) > 1e-12 {
					t.Errorf("applyOrbitPan(%.3f, %.3f, %.2f) 的折叠 = %.12f，期望 %.12f —— "+
						"摆动改动了 L+R，单声道折叠不再平直",
						in[0], in[1], s, got, want)
				}
			}
		}
	}
}

// TestChainNoClippingAtOrbitPeak 钉住"摆到最极端的那一相位不得削顶"。
//
// ★ 与 TestChainNoClippingWithExtremeInput 的分工：那条测的是
// 默认相位（摆动刚开始、量很小），这条**直接把相位拨到 s=1**，
// 也就是摆幅最大的那一刻。这两条覆盖的不是同一件事 ——
// 第五轮接入摆动时若只看原来那条，最坏相位根本没被测到。
//
// 判据与原测试一致：不出现长度 ≥3 的连续顶格游程（硬削波必然 ≥3）。
func TestChainNoClippingAtOrbitPeak(t *testing.T) {
	var c Chain
	c.prepare(SampleRate)
	c.RequestPreset(EffectSurround)
	for block := 0; block < 3; block++ {
		buf := makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
			v := sineAt(i, 440, 1.0)
			return v, v
		})
		c.ProcessStereo(buf)
	}
	// 拨到摆动正峰（+1），之后的每个样本都接近最坏情况
	c.orbit.phase = math.Pi / 2

	values := make([]int16, 0, PeriodFrames*4*2)
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

	maxRun, run, totalTop := 0, 0, 0
	for _, v := range values {
		if v == 32767 || v == -32768 {
			totalTop++
			run++
			if run > maxRun {
				maxRun = run
			}
		} else {
			run = 0
		}
	}
	if maxRun > 2 {
		t.Errorf("摆动正峰相位下出现长度 %d 的连续顶格（门限 2；触顶 %d/%d）—— "+
			"波形被削平了。orbitPanDepth 是不是调过头了？"+
			"软限幅在输入超过 1.48 之后会把输出钉死在满幅上", maxRun, totalTop, len(values))
	}
}
