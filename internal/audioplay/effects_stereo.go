/* ==========================================================================
   effects_stereo.go — 立体声空间处理（"3D 环绕"的底座）
   --------------------------------------------------------------------------
   播放器里的"3D 环绕"其实是三件事的统称，本文件把三件事拆开实现，
   再按档位组合：

     1. **中侧（Mid/Side）宽度**：把 M=(L+R)/2、S=(L-R)/2 拆出来，
        只放大 S 再合回去。这是最"干净"的加宽方式 —— 中置信号
        （人声、底鼓、贝斯）完全不动，声像稳定性不受影响。

     2. **Haas 延迟**：把一侧延迟 10~30ms 再混回去。人耳会把"先到的
        那个声音"定位成方向来源，于是整体听起来比原始立体声更宽。
        ★ 这就是绝大多数播放器"3D 环绕 / 现场感"档位真正在做的事。

     3. **串扰（crossfeed）**：把一侧的信号按比例衰减后混进另一侧。
        对耳机而言它是"把声音从脑袋里挪到前面"的关键
        （消除"头中效应"）；对扬声器而言它做的是相反的事 ——
        强化房间声场的包络感。

   --------------------------------------------------------------------------
   为什么不用 Web Audio 的 PannerNode / HRTF

   HRTF（头相关传递函数）要用真实的人头脉冲响应做卷积，属于"成本高"的
   那一类（见 effects_reverb.go 文件头对卷积的说明）。而播放器上 90% 的
   用户期待"3D 环绕"只是"声音更宽、更有包围感"，上面三件事就够了，
   而且零延迟、零分配、CPU 可忽略。

   --------------------------------------------------------------------------
   延迟线：环形缓冲，固定上限

   Haas 延迟最大取 maxHaasDelayMs(30ms) @ 48kHz ≈ 1440 样本，一次分配好
   （见 prepare），回调里只做下标运算。
   ========================================================================== */

package audioplay

// maxHaasDelaySamples 是 Haas 延迟线的容量上限。
//
// 48kHz 下 30ms = 1440 样本，取 2048 留足余量。
// 用常量而不是算出来：延迟线要在 prepare 时一次分配（见文件头说明）。
const maxHaasDelaySamples = 2048

// defaultHaasDelayMs 是 Haas 延迟的默认值（毫秒）。
//
// ★ 15ms 是刻意落在"感知融合区"中间的取值：
//
//	· < 5ms   —— 两耳信号被当成同一个声音，只产生梳状滤波（听感是变闷），
//	            不会变宽；
//	· 10~30ms —— 融合成一个声音但有明确的宽度/方向感 ← 要的就是这一段；
//	· > 30ms —— 被听成**两个独立的声音**（回声），这是"3D 环绕"最典型的
//	            翻车方式：听起来像对着山谷喊话。
const defaultHaasDelayMs = 15.0

// stereoStage 是立体声空间处理器。
//
// 与 reverb 同样：prepare 之后音频回调只调用 processStereo，
// **不保证 processStereo 与 setParams 之间的并发安全**（见
// effects_reverb.go 类型注释里对这条取舍的完整说明）。
type stereoStage struct {
	// haas 是两侧共用的延迟线。
	//
	// 只需要**一条**：Haas 的做法是"延迟右声道再混回右声道"，
	// 左声道不延迟。两条线会让声场中心偏移到一边（两边都被延迟
	// 就等于都没延迟，反而失去效果）。
	haas []float64
	pos  int
	// delaySamples 是右声道的延迟量（样本）
	delaySamples int

	// —— 参数 ——
	// width: 中侧宽度倍率。1 = 原始，>1 = 变宽，<1 = 变窄，0 = 单声道
	width float64
	// haasMix: 延迟信号混回的比例（0 = 不混）
	haasMix float64
	// crossfeed: 串扰量（0 = 无串扰）
	crossfeed float64
}

// StereoParams 是空间处理的对外参数（全部归一化到 0..1，见各字段说明）。
type StereoParams struct {
	// Width 是立体声宽度。0.5 = 原始宽度，1.0 = 约 2 倍宽度。
	//
	// ★ 为什么 0.5 是"原始"而不是 0：M/S 拆分的标准回合公式是
	// L = M + S、R = M - S。若按 Width 线性缩放 S 为 k*S，
	// 则 k=1 才是原始宽度。把 Width 定义成 k，那"关闭加宽"就得传 1，
	// 而"轻微加宽"与"关闭"挤在一起不好调。这里改用
	// k = Width * 2，于是 0.5 ↔ 原始、1.0 ↔ 2 倍、0 ↔ 单声道。
	Width float64
	// Haas 是 Haas 延迟的混入量（0 = 关闭）。
	Haas float64
	// Crossfeed 是左右串扰量（0 = 关闭）。
	Crossfeed float64
}

// prepare 按采样率分配延迟线。只在开关 / 采样率变化时调用。
func (s *stereoStage) prepare(sampleRate int) {
	// 延迟线按最大可能长度分配，实际延迟量由 delaySamples 控制。
	// 这样改 Haas 参数（比如换档位）不需要重新分配。
	if cap(s.haas) < maxHaasDelaySamples {
		s.haas = make([]float64, maxHaasDelaySamples)
	} else {
		s.haas = s.haas[:maxHaasDelaySamples]
		for i := range s.haas {
			s.haas[i] = 0
		}
	}
	s.pos = 0
	s.delaySamples = int(defaultHaasDelayMs * float64(sampleRate) / 1000)
	if s.delaySamples < 1 {
		s.delaySamples = 1
	}
	if s.delaySamples >= maxHaasDelaySamples {
		s.delaySamples = maxHaasDelaySamples - 1
	}
}

// setParams 更新空间处理参数。
func (s *stereoStage) setParams(p StereoParams) {
	// Width: 0..1 → 中侧缩放 0..2（见 StereoParams.Width 的说明）
	s.width = clamp01(p.Width) * 2
	s.haasMix = clamp01(p.Haas)
	s.crossfeed = clamp01(p.Crossfeed)
}

// reset 清空延迟线（切歌时调用）。
func (s *stereoStage) reset() {
	for i := range s.haas {
		s.haas[i] = 0
	}
	s.pos = 0
}

// processStereo 就地处理一帧。
func (s *stereoStage) processStereo(xl, xr float64) (float64, float64) {
	// —— 1. Haas 延迟 ——
	//
	// 先把右声道的**当前**样本写进延迟线，再读出 delaySamples 之前的
	// 那个样本。写成"先读后写"会让延迟少一个样本（无所谓），
	// 但"先写后读"在 delaySamples 很小时（比如 1）能正确取到上一帧，
	// 边界行为更直观。
	if s.haasMix > 0 {
		s.haas[s.pos] = xr
		readPos := s.pos - s.delaySamples
		if readPos < 0 {
			readPos += len(s.haas)
		}
		delayed := s.haas[readPos]
		s.pos++
		if s.pos >= len(s.haas) {
			s.pos = 0
		}
		// 混入延迟信号。用加法混入（不是替换）：Haas 效果的原理就是
		// "直达声 + 稍晚的同一声音"在人耳里融合成一个更宽的声音。
		xr += delayed * s.haasMix
	}

	// —— 2. 中侧宽度 ——
	//
	// 注意顺序：先做 Haas 再做宽度（而不是反过来）。
	// 宽度处理会放大 S 分量，而 Haas 已经在右声道引入了额外的
	// 差异信号 —— 先 Haas 后宽度，那部分差异也会被一起放大，
	// 效果更强；反过来则 Haas 引入的差异不参与宽度计算，
	// 两档参数的"手感"会更割裂。
	if s.width != 1 {
		mid := (xl + xr) * 0.5
		side := (xl - xr) * 0.5 * s.width
		xl = mid + side
		xr = mid - side
	}

	// —— 3. 串扰 ——
	//
	// 放在最后：它做的是"输出级的混合"，把已经处理好的左右声道
	// 按比例互馈。放在前面的话，串扰引入的交叉信号又会被宽度放大，
	// 得到的是一个"越加宽越像单声道"的怪结果。
	if s.crossfeed > 0 {
		xl, xr = xl*(1-s.crossfeed*0.5)+xr*s.crossfeed*0.5,
			xr*(1-s.crossfeed*0.5)+xl*s.crossfeed*0.5
	}

	return xl, xr
}
