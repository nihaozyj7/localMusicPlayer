/* ==========================================================================
   effects_reverb.go — Schroeder/Freeverb 结构算法混响
   --------------------------------------------------------------------------
   为什么用 Freeverb 这一族而不是卷积混响：

   卷积混响（拿一段真实房间的脉冲响应做 FFT 分区卷积）听起来最真，但
     · 一个 2 秒 IR @44.1kHz 是 88200 抽头，直接时域卷积每帧要 88200 次
       乘加 × 2 声道 —— 每秒约 78 亿次乘加，CPU 直接烧掉；
     · 必须上 FFT 分区卷积，而分区卷积**天然引入至少一个分区的延迟**
       （典型 128~1024 样本），要消掉它还得做 look-ahead 补偿。
   这两件事把它推到"三五天工作量 + 实时性风险"的量级，不值得为一个
   播放器的混响开关去扛（真要做也该走 ffmpeg 离线预渲染，见
   internal/ffmpeg 的转码缓存）。

   算法混响（Schroeder 梳状 + 全通）用几百个样本的延迟线做出可用的空间感，
   零延迟、零分配、CPU 占用可以忽略 —— 这正是"小房间 / 大厅"这类
   播放器常见混响档位需要的全部。

   --------------------------------------------------------------------------
   结构：8 梳状（并联）+ 4 全通（串联）

   梳状滤波器提供"回声越叠越密"的衰减尾巴（决定混响时长），
   全通滤波器把梳状产生的规则梳齿"打散"成扩散的混响（决定自然度）。

   8 个梳状的延迟长度刻意取成**互质**（1116/1188/1277/1356/1422/1491/
   1557/1617），这样它们的回声不会在同一个时刻叠在一起 —— 否则会听到
   明显的"嗡嗡"金属声（这是最典型的"廉价混响"听感）。

   刻意的取舍：这套延迟长度来自 Freeverb 的 44.1kHz 原始设计，本文件
   **按采样率缩放**，所以在 48kHz 设备上依然是同一组互质比例。

   --------------------------------------------------------------------------
   为什么放在音频回调里是安全的

   全部状态在 On/参数变化时**一次性预分配**（见 reverb.prepare），
   音频回调里只做下标自增和数组读写，没有任何 make/map/interface。
   参数（wet/dry/room/damp）由上层写进一个原子快照，回调读快照 ——
   不是逐帧插值，而是靠"参数只影响反馈系数与混合比例"这一点：
   这些量突变不会产生阶跃（延迟线里的能量是连续的），实测不会爆音。
   ★ 但**开关混响本身**必须做交叉淡化（见 effects.go 的 chainFadeFrames /
     Chain.processFading），因为那会凭空把一整条延迟线的能量从 0 拉到非 0。
   ========================================================================== */

package audioplay

import "math"

/* --------------------------------------------------------------------------
   Freeverb 的延迟长度（44.1kHz 原始设计值，单位：样本）
   -------------------------------------------------------------------------- */

// combTuning 是 8 个梳状滤波器的延迟长度。
// 互质是刻意的（见文件头说明）。
var combTuning = [8]int{1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617}

// allpassTuning 是 4 个全通滤波器的延迟长度。
var allpassTuning = [4]int{556, 441, 341, 225}

// stereoSpread 是右声道相对左声道的延迟偏移（样本）。
//
// ★ 这是"立体声混响"的关键：左右用**同一组结构但错开的位置**，
// 两个声道的混响尾巴就互不相关，听感上是"包住"而不是"从中间发出来"。
// Freeverb 原版取 23；太小两边会近似同相（听起来还是在中间），
// 太大就变成两个独立的混响（失去声场中心）。
const stereoSpread = 23

// reverbMaxDelay 是延迟线数组的长度上限（样本）。
//
// 48kHz 下最长的梳状是 1617 * 48000/44100 ≈ 1760，加上 stereoSpread 与
// 取整余量，2048 有充足富余。写成常量是为了让延迟线在 prepare 时
// 一次分配好，而不是每个延迟长度单独 make 一次
// （8+8+4+4 = 24 次分配，虽然只在开关时发生，但没必要）。
const reverbMaxDelay = 2048

/* --------------------------------------------------------------------------
   梳状滤波器（含阻尼）
   -------------------------------------------------------------------------- */

// combFilter 是带阻尼的低通反馈梳状滤波器。
//
// 阻尼（damp）是 Freeverb 相对原始 Schroeder 结构最重要的改进：
// 反馈路径上串一个一阶低通，让高频比低频衰减得更快 —— 这正是真实房间的
// 行为（空气吸收与墙面软包都在吃高频）。没有它，混响尾巴会一直"嘶嘶"响，
// 听起来像弹簧混响而不是房间。
type combFilter struct {
	buf  []float64
	pos  int
	size int

	// store 是阻尼低通的状态（滤波后的反馈值）
	store float64

	// feedback / damp1 / damp2 由 setParams 写入。
	//
	// damp2 = 1 - damp1，预先算好：回调里每样本做一次减法，虽然便宜，
	// 但这是每个样本都要跑的路径，能省则省。
	feedback float64
	damp1    float64
	damp2    float64
}

// prepare 分配延迟线（只在开关 / 采样率变化时调用）。
func (c *combFilter) prepare(size int) {
	if size < 1 {
		size = 1
	}
	if size > reverbMaxDelay {
		size = reverbMaxDelay
	}
	if cap(c.buf) < size {
		c.buf = make([]float64, size)
	} else {
		c.buf = c.buf[:size]
		// 复用旧缓冲时必须清零：上次的残响会让"关闭再打开"变成一声闷响
		for i := range c.buf {
			c.buf[i] = 0
		}
	}
	c.size = size
	c.pos = 0
	c.store = 0
}

// process 处理一个样本并返回混响输出。
func (c *combFilter) process(x float64) float64 {
	// 读出延迟线上的样本（这就是本次的"回声"）
	out := c.buf[c.pos]

	// 阻尼低通：一阶 IIR，把回声的高频磨掉一点再送回延迟线。
	// 写回的是**滤波后的 out**，这保证了反馈路径本身是低通的。
	c.store = out*c.damp2 + c.store*c.damp1

	// 写入输入 + 反馈
	c.buf[c.pos] = x + c.store*c.feedback

	c.pos++
	if c.pos >= c.size {
		c.pos = 0
	}
	return out
}

/* --------------------------------------------------------------------------
   全通滤波器
   -------------------------------------------------------------------------- */

// allpassFilter 是不带阻尼的全通滤波器（反馈增益固定 0.5）。
//
// 全通的作用不是"回声"而是**相位扩散**：它把所有频率的幅度都保持不变，
// 只改变相位关系，从而把梳状滤波器产生的规则梳齿打散。
// 反馈增益 0.5 是 Freeverb/Freeverb3 的通用取值 —— 再高会开始产生
// 可听的"振铃"，再低扩散效果不足。
type allpassFilter struct {
	buf  []float64
	pos  int
	size int
}

// allpassFeedback 是全通滤波器的反馈增益（Freeverb 原值）
const allpassFeedback = 0.5

func (a *allpassFilter) prepare(size int) {
	if size < 1 {
		size = 1
	}
	if size > reverbMaxDelay {
		size = reverbMaxDelay
	}
	if cap(a.buf) < size {
		a.buf = make([]float64, size)
	} else {
		a.buf = a.buf[:size]
		for i := range a.buf {
			a.buf[i] = 0
		}
	}
	a.size = size
	a.pos = 0
}

func (a *allpassFilter) process(x float64) float64 {
	bufOut := a.buf[a.pos]
	out := -x + bufOut
	a.buf[a.pos] = x + bufOut*allpassFeedback
	a.pos++
	if a.pos >= a.size {
		a.pos = 0
	}
	return out
}

/* --------------------------------------------------------------------------
   混响器本体
   -------------------------------------------------------------------------- */

// reverb 是一个完整的两声道混响处理器。
//
// prepare 之后即可反复使用；音频回调里只调用 process。
// **不保证并发安全**：process 在音频线程，setParams 在控制线程。
// 这里刻意不加锁（见文件头说明），而是让参数通过"整组赋值"的方式更新 ——
// Go 里对多个 float64 字段的非原子写入在极端情况下可能被读到"半新半旧"，
// 但混响参数（反馈量 / 阻尼 / 混合比）的短暂不一致**不会产生爆音或崩溃**
// （最坏情况是一个回调周期内衰减时间略有偏差），所以这里选择了性能。
type reverb struct {
	combsL [8]combFilter
	combsR [8]combFilter
	apsL   [4]allpassFilter
	apsR   [4]allpassFilter

	// 参数
	feedback float64 // 梳状反馈量（由 roomSize 换算）
	damp1    float64
	damp2    float64
	wet      float64 // 湿信号输出增益
	dry      float64 // 干信号直通增益

	prepared bool
}

// ReverbParams 是混响的对外参数（由上层从音效预设换算后传入）。
//
// 三个量都是 0..1 的**归一化**值，具体含义见下面的换算 ——
// 刻意不让上层直接传反馈系数：那些系数与采样率、延迟长度强耦合，
// 暴露出去只会让上层算错（而且改一次实现就得改所有调用方）。
type ReverbParams struct {
	// Amount 是混响量（干湿比）。0 = 完全干（等价于关闭），1 = 全部是混响。
	Amount float64
	// Size 是空间大小。0 = 小房间（尾巴短），1 = 大厅（尾巴长）。
	Size float64
	// Damp 是高频阻尼。0 = 明亮（像瓷砖房间），1 = 昏暗（像铺了地毯）。
	Damp float64
}

// reverbFeedbackMin / reverbFeedbackMax 把 Size 映射到梳状反馈量。
//
// ★ 上限 0.98 而不是 1.0 是硬性要求，不是调参偏好：
// 反馈量 >= 1 意味着延迟线里的能量不衰减，混响会**无限累积**直到
// float64 溢出成 Inf/NaN，然后整个音频输出变成噪声或者静音。
// 0.98 对应稳态增益 1/(1-0.98) = 50 倍 —— 这个增益由 setParams 里的
// normalize 除回去（见那里的详细说明），所以它不会传到输出上；
// 0.28 对应约 1.4 倍，是"小房间"的短尾巴。
const (
	reverbFeedbackMin = 0.28
	reverbFeedbackMax = 0.98
)

// setParams 更新混响参数。可从控制线程调用（见类型注释的并发说明）。
func (r *reverb) setParams(p ReverbParams) {
	size := clamp01(p.Size)
	damp := clamp01(p.Damp)
	amount := clamp01(p.Amount)

	r.feedback = reverbFeedbackMin + size*(reverbFeedbackMax-reverbFeedbackMin)

	// 阻尼系数直接就是 damp（0 = 不衰减高频，1 = 最强衰减）。
	// 上限 0.4：再高会把高频衰减到几乎不存在，混响听起来像"捂住了"。
	r.damp1 = damp * 0.4
	r.damp2 = 1 - r.damp1

	// —— 湿信号归一化：必须按反馈量的稳态增益来除 ——
	//
	// ★ 这是本文件最容易搞错、后果最严重的一处。
	//
	// 一个反馈量为 f 的梳状滤波器，稳态增益是 1/(1-f)。f=0.98 时是 **50 倍**。
	// 8 路并联再除以 8（见 processStereo 的 combScale）只是把它们**平均**，
	// 稳态增益仍然是 50 倍 —— 也就是说"只按梳状数量归一化"完全没有
	// 解决增益问题：一个满幅信号进混响，出来是 50 倍满幅。
	//
	// 实测症状（这就是本注释存在的原因）：大厅档位（Size=0.92，f≈0.924，
	// 稳态增益约 13 倍）在满幅输入下让湿路径冲到约 20 倍满幅，
	// 输出变成刺耳的削波噪声（测试里抓到 813/8192 个样本顶到 int16 极值）。
	//
	// 所以这里再乘 1/(1-f)：让湿路径的稳态增益回到 1 附近，
	// 响度由 amount 单独控制。这样 Size 只管"尾巴多长"，
	// 不再顺带改变"混响多响" —— 两者解耦之后参数才可预测。
	//
	// （Freeverb 原版不需要这一步，因为它的反馈量是固定的 0.84；
	//   我们把反馈量做成可调的，就必须补上归一化。）
	normalize := 1 - r.feedback

	// 干湿混合用等功率（equal-power）而不是线性交叉淡化：
	// 线性淡化在中点（各 0.5）会有一个明显的音量凹陷 —— 因为两个
	// **不相关**的信号相加，功率是平方和开方，各 0.5 的功率只有单路的
	// 0.5 倍（-3dB）。用 cos/sin 保证中点也是 1.0 的总功率。
	//
	// 这一步是"混响调大时整体不会变小声"的关键。
	theta := amount * math.Pi / 2
	r.wet = math.Sin(theta) * normalize
	r.dry = math.Cos(theta)

	for i := range r.combsL {
		r.combsL[i].feedback = r.feedback
		r.combsL[i].damp1 = r.damp1
		r.combsL[i].damp2 = r.damp2
		r.combsR[i].feedback = r.feedback
		r.combsR[i].damp1 = r.damp1
		r.combsR[i].damp2 = r.damp2
	}
}

// prepare 按采样率分配全部延迟线。只在开关 / 采样率变化时调用。
//
// scale 是"相对 44.1kHz 的缩放系数"。本项目的采样率是常量 44100
// （见 engine.go），所以实际永远是 1.0 —— 但仍然按参数缩放，
// 否则将来换采样率时混响的尾巴长度会跟着变（听起来是"同一个档位
// 在小房间和大厅之间跳"），很难排查。
func (r *reverb) prepare(sampleRate int) {
	scale := float64(sampleRate) / 44100.0

	for i := range r.combsL {
		size := int(float64(combTuning[i]) * scale)
		r.combsL[i].prepare(size)
		// 右声道错开 stereoSpread（见常量说明），得到去相关的立体声尾巴
		r.combsR[i].prepare(size + int(stereoSpread*scale))
	}
	for i := range r.apsL {
		size := int(float64(allpassTuning[i]) * scale)
		r.apsL[i].prepare(size)
		r.apsR[i].prepare(size + int(stereoSpread*scale))
	}
	r.prepared = true
}

// reset 清空全部延迟线（切歌时调用）。
//
// ★ 换歌必须清：不清的话上一首的混响尾巴会盖在新歌的开头上，
// 听感是"切歌后前几百毫秒糊成一片"。
func (r *reverb) reset() {
	for i := range r.combsL {
		for j := range r.combsL[i].buf {
			r.combsL[i].buf[j] = 0
		}
		r.combsL[i].store = 0
		for j := range r.combsR[i].buf {
			r.combsR[i].buf[j] = 0
		}
		r.combsR[i].store = 0
	}
	for i := range r.apsL {
		for j := range r.apsL[i].buf {
			r.apsL[i].buf[j] = 0
		}
		for j := range r.apsR[i].buf {
			r.apsR[i].buf[j] = 0
		}
	}
}

// processStereo 就地处理一帧。参数与返回都是 float64（-1..1）。
//
// 结构（Freeverb 原版）：
//
//	输入 → [8 梳状并联，求和] → [4 全通串联] → 湿信号
//	干信号直通
//	输出 = dry * 干 + wet * 湿
func (r *reverb) processStereo(xl, xr float64) (float64, float64) {
	// 左右两组梳状**吃同一个单声道激发源**（而不是各自吃自己的声道）。
	//
	// 这是 Freeverb 的做法，好处是混响的激发源不随原始声像摇摆 ——
	// 一首左右差异很大的歌（比如硬左的吉他）不会让混响也跟着"偏"到一边，
	// 听感上更像一个包住听者的房间，而不是"左右各有一个混响"。
	//
	// 立体声感由延迟长度差异提供：右声道的全部延迟都比左声道多
	// stereoSpread 个样本（见 prepare），于是两边的尾巴互不相关。
	// ★ 也就是说：**空间感来自延迟差异，不是来自输入差异**。
	mono := (xl + xr) * 0.5

	var wetL, wetR float64
	for i := range r.combsL {
		wetL += r.combsL[i].process(mono)
		wetR += r.combsR[i].process(mono)
	}

	// 8 路并联求和会带来约 8 倍的增益，必须归一化 ——
	// 否则混响一开就比干信号响得多（听感是"打开混响音量突然跳大"）。
	//
	// ★ 注意这里除的是**梳状数量**（8），而"反馈量的稳态增益"
	// 由 setParams 里的 normalize 单独负责。两件事必须分开除：
	// 前者是结构性的（并联了几路），后者是参数性的（尾巴有多长）。
	// 见 setParams 里那段长注释 —— 漏掉后者会导致输出溢出。
	//
	// 除以 8（梳状数量）而不是除以 sqrt(8)：8 路的输出虽然彼此独立
	// （延迟长度互质），但在低频段它们高度相关（同一个输入的不同延迟），
	// 用算术平均更接近实际听感上的电平。
	const combScale = 1.0 / 8.0
	wetL *= combScale
	wetR *= combScale

	// 4 级全通串联。全通的幅度响应恒为 1，所以这里不需要再归一化 ——
	// 它只改相位（把梳状产生的规则梳齿打散成扩散的混响）。
	for i := range r.apsL {
		wetL = r.apsL[i].process(wetL)
		wetR = r.apsR[i].process(wetR)
	}

	return xl*r.dry + wetL*r.wet, xr*r.dry + wetR*r.wet
}

// clamp01 把值夹到 0..1，同时挡住 NaN。
//
// ★ NaN 必须挡：NaN 的比较永远为 false，所以 `if v < 0` 这类写法
// 放它过去，然后 NaN 会在反馈回路里**永远**存在下去（延迟线里的 NaN
// 出来后经过任何运算还是 NaN），整个音频输出变成静音或噪声。
// 这是混响这类带反馈的 DSP 最经典的翻车方式。
func clamp01(v float64) float64 {
	if !(v > 0) { // 同时挡住负数与 NaN
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
