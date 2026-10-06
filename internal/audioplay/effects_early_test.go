/* ==========================================================================
   effects_early_test.go — 早期反射场与"单耳不得被挖空"的回归测试
   --------------------------------------------------------------------------
   这两条测试对应第四轮用户反馈（"有变宽、有混响，但没有环绕的感觉"）
   复盘出来的两个**结构性**缺口，缺一个都会让这一轮的修复静默失效：

     1. 双耳时间差（ITD）必须真的存在 —— 它是"声音在头外面"最主要
        的线索，而 `mid ± side` 结构把它恒定压成 0（前三轮的根因）。
     2. 单耳电平差必须有上界 —— 折叠平直**不等于**单耳没被挖坑，
        第三轮就是靠"折叠平直"这条指标一路绿灯过去的。
   ========================================================================== */

package audioplay

import (
	"math"
	"testing"
)

// TestEarlyFieldCarriesInterauralTimeDifference 钉住早期反射场的**核心语义**：
// 同一个反射到达两只耳朵的时刻必须不同。
//
// ★ 为什么用冲激而不是正弦/噪声：正弦的互相关峰值受带宽限制，
// 0.5ms 的时移在 200~3600Hz 的带通信号上会被主瓣宽度完全盖住
// （实测归一化峰值仍然落在 lag=0），那是**指标选错**，不是没有 ITD。
// 冲激的响应就是延迟表本身，逐样本可读，没有歧义。
//
// ★ 为什么判据只要求 ≥0.4ms：人耳 ITD 的自然范围是 0~0.7ms，
// 抽头 1 的设计值是 0.7ms。留 0.4ms 的下限是为了"必须是真实时间差"
// 而不是"抗住取整误差"（0.4ms ≈ 18 样本，取整误差只有 1 样本）。
func TestEarlyFieldCarriesInterauralTimeDifference(t *testing.T) {
	const fs = 44100
	var e earlyFieldStage
	e.prepare(fs)
	e.setAmount(1.0)

	// 单位冲激（双耳同相），之后喂静音让整条延迟线走完。
	// 直接用 float64 驱动，绕开 int16 量化：这里量的是**样本序号**，
	// 量化只会给判据引入无关噪声。
	const n = fs / 2
	inL, inR := make([]float64, n), make([]float64, n)
	outL, outR := make([]float64, n), make([]float64, n)
	inL[0], inR[0] = 1.0, 1.0
	for i := 0; i < n; i++ {
		outL[i], outR[i] = e.processStereo(inL[i], inR[i])
	}

	peakL, peakR := 0, 0
	bestL, bestR := 0.0, 0.0
	for i := 0; i < n; i++ {
		// 反射场 = 输出 - 输入：直达声原样穿过，不参与"谁先到"的判断
		l := math.Abs(outL[i] - inL[i])
		r := math.Abs(outR[i] - inR[i])
		if l > bestL {
			bestL, peakL = l, i
		}
		if r > bestR {
			bestR, peakR = r, i
		}
	}

	if bestL <= 0 || bestR <= 0 {
		t.Fatalf("早期反射场对冲激没有响应（L 峰值 %.5f、R 峰值 %.5f）—— 反射场没在跑？",
			bestL, bestR)
	}

	deltaMs := float64(peakR-peakL) / fs * 1000
	if math.Abs(deltaMs) < 0.4 {
		t.Errorf("同一个反射到达两耳的时间差 = %.3f ms（峰值：L 第 %d 样本、R 第 %d 样本），"+
			"期望 |Δ| >= 0.4ms —— 双耳时间差是「声音在头外面」的主线索，"+
			"Δ=0 说明反射场退化成了 mid ± side 那种同相位注入（前三轮的根因）",
			deltaMs, peakL, peakR)
	}
}

// TestEarlyFieldEarsAreDecorrelated 钉住包围感：两耳收到的反射场必须
// **互不相关**。
//
// ★ 依据是 Barron & Bradley 的经典结论：包围感（envelopment）来自
// 晚场/扩散声的低双耳互相关。若两耳的反射只差 0.5ms 这种小量，
// 它们在带宽内几乎是同一段信号 —— 实测 ICC = 0.98，听感是
// "直达声又响了一遍"，仍然在头里，不是包围。
//
// 判据取 ICC < 0.5：实测 -0.02（完全扩散），留出足够余量以免
// 后续调参把延迟表改回去时被这条测试挡住而不是被听感挡住。
func TestEarlyFieldEarsAreDecorrelated(t *testing.T) {
	const fs = 44100
	const n = 44100 * 2
	const skip = 44100

	in := diagNoise(n, 0.4)
	var e earlyFieldStage
	e.prepare(fs)
	e.setAmount(1.0)

	var cf, ea, eb float64
	for i := 0; i < n; i++ {
		ol, orr := e.processStereo(in[i], in[i])
		if i < skip {
			continue
		}
		// 新增场 = 输出 - 输入（输入是单声道，逐样本相减即可）
		fl, fr := ol-in[i], orr-in[i]
		cf += fl * fr
		ea += fl * fl
		eb += fr * fr
	}
	if ea <= 0 || eb <= 0 {
		t.Fatalf("早期反射场没有能量（左 %.6f / 右 %.6f）", ea, eb)
	}
	icc := cf / math.Sqrt(ea*eb)
	if icc >= 0.5 {
		t.Errorf("两耳反射场的互相关系数 = %.3f，期望 < 0.5 —— "+
			"两耳几乎收到同一段反射，包围感无从谈起（延迟表被改得过于接近？）", icc)
	}
}

// TestSurroundPerEarResponseStaysBounded 是"单耳被挖空"的回归测试。
//
// ★★ 这条测试补的是一个**被漏掉的判据**。第三轮重写一路绿灯，
// 是因为所有指标都在量"折叠平不平"（L+R）和"声道差大不大"（|L-R|），
// 没有一条在量**单只耳朵自己的频响**。实测（mono 正弦逐点）：
//
//	第三轮的 stereoStage：1000Hz 处左右耳差 **38.3dB**
//	                       500Hz 处 14dB
//	第四轮改完之后：        全链最坏 12~13dB（出现在 250Hz 一个点上）
//
// 38dB 意味着中频某一段**整只耳朵听不到** —— 大脑把它归类成
// "音质坏了 / 声像飘"，不会归类成"环绕"。这正是用户反馈的另一种形态。
//
// 判据取 16dB：实测最坏 13.3dB，留出余量；而 38dB 的旧实现会被
// 当场抓住。这条测试必须对**全链**（含早期反射与混响）测 ——
// 单看某一段会漏掉"两段叠加后陷波更深"的组合效应（第四轮实测过：
// 全通 -6dB 与早期反射的陷波落在同一频率上时，单耳掉到 -13dB）。
func TestSurroundPerEarResponseStaysBounded(t *testing.T) {
	const fs = 44100
	const maxDeviationDB = 16.0

	// 20 个对数分布的频点：单频探针太稀会漏掉窄陷波，
	// 但也不必扫到几百点 —— 判据是"有没有整只耳朵消失"级别的回归。
	freqs := []float64{
		100, 160, 250, 315, 400, 500, 630, 800, 1000, 1250,
		1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500,
	}

	off := diagChain(EffectOff)
	sur := diagChain(EffectSurround)

	worst, worstFreq := 0.0, 0.0
	for _, f := range freqs {
		const n = 16384
		in := make([]float64, n)
		for i := range in {
			g := 1.0
			if i < n/4 {
				g = float64(i) / float64(n/4)
			}
			in[i] = 0.5 * g * math.Sin(2*math.Pi*f*float64(i)/fs)
		}
		lo, ro := runMono(sur, in)
		lo0, ro0 := runMono(off, in)
		a := n / 2
		// 与 off 档对齐：量"这一档让左右耳相对**原始**差了多少"
		devL := db(rms(lo[a:])) - db(rms(lo0[a:]))
		devR := db(rms(ro[a:])) - db(rms(ro0[a:]))
		if d := math.Abs(devL - devR); d > worst {
			worst, worstFreq = d, f
		}
	}

	if worst > maxDeviationDB {
		t.Errorf("环绕档在 %.0fHz 处把左右耳拉开了 %.1f dB（上限 %.0f dB）—— "+
			"某只耳朵的直达声被抵消了。折叠平直不代表单耳没被挖坑，"+
			"检查 stereoStage 的注入量与早期反射场的 Σg 是否叠加越界",
			worstFreq, worst, maxDeviationDB)
	} else {
		t.Logf("环绕档全链单耳最坏电平差 %.1f dB @ %.0fHz（上限 %.0f dB；"+
			"第三轮的 stereoStage 单独就有 38.3dB）", worst, worstFreq, maxDeviationDB)
	}
}

// TestEarlyFieldOnlyRunsOnSurround 钉住"只有环绕档跑早期反射场"。
//
// 关联风险：早期反射会显著改变单声道折叠（它不是 ±side 结构），
// 若 off/vocal/bass 意外跑起来，后果是"没开音效声音也被处理过"，
// 与历史上"切歌后音效失效/静音"那类问题同源 —— 而且更隐蔽，
// 因为 off 档的逐位直通测试只覆盖 stereoStage，覆盖不到这一段。
func TestEarlyFieldOnlyRunsOnSurround(t *testing.T) {
	for _, p := range EffectPresets {
		want := p == EffectSurround
		spec := presetSpecs[p]
		if spec.enableEarly != want {
			t.Errorf("档位 %q 的 enableEarly = %v，期望 %v —— "+
				"环绕档必须开、其余档位必须关（早期反射会改单声道折叠）",
				p, spec.enableEarly, want)
		}
		if spec.enableEarly && spec.stereo.Width == 0 {
			t.Errorf("档位 %q 开了早期反射但 stereo 参数是零值（Width 0 = 单声道）", p)
		}
	}
}
