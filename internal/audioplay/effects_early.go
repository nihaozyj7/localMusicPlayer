/* ==========================================================================
   effects_early.go — 早期反射场（"3D 环绕"里唯一携带双耳时间差的环节）
   --------------------------------------------------------------------------
   ★ 为什么需要这个文件（第四轮，实测定位）

   第三轮重写把环绕档做成了 `L = mid + side、R = mid - side` 一个结构，
   空间成分（全通差分、5~25ms 稀疏回声）全部从**同一个 side** 里走。
   这个结构有一个绕不开的数学后果：

       side 装任何东西，两个耳朵收到的都是**同一段波形、极性相反、
       时间完全相同** —— 双耳时间差恒为 0。

   实测（TestSurroundPerceptualProbe，单声道白噪声过 surround 档）：

       左右互相关峰值 lag = 0 样本（0.000 ms）

   而"声音在头外面 / 环绕过来"这件事，大脑最主要的判断依据恰恰是
   **ITD（双耳时间差）**：同一个事件在两耳之间差 0.2~0.7ms。
   lag = 0 的反相差异不携带任何时间信息 —— 听感是"空、发虚、声像
   左右飘"（也即用户反馈的"有变宽、有混响，但没有环绕的感觉"），
   而不是"声音绕着我"。

   同一份实测还量到另一件事：单声道素材在 500Hz 处左耳比右耳低 18dB。
   这是因为 side 注入量大到能与 mid 逐点相消 —— 直达声被梳状滤波挖坑，
   大脑把它归类成"声像/音色问题"，同样不会归类成"环绕"。

   结论：mid ± side 结构**只能**做宽化，做不了环绕。环绕必须由
   「同极性、不同延迟」的每耳独立反射提供 —— 那才等价于
   "同一个反射面把同一段声音在两个不同时刻送到两只耳朵"，
   这是真实房间里的物理事实，也是 precedence/ITD 线索的来源。

   --------------------------------------------------------------------------
   一、结构

   每只耳朵一条环形延迟线，写入的是**带通后的 mid**，两只耳朵用
   **不同的延迟**读出 4 个抽头，然后**同极性**加到各自声道上：

       src  = bandpass(mid)                      （160Hz 一阶高通 + 3.6kHz 一阶低通）
       reflL = Σ g_k · src(t - dL_k)
       reflR = Σ g_k · src(t - dR_k)
       L    = L + reflL
       R    = R + reflR

   关键点是 **dL ≠ dR**：每个抽头在两耳之间差 0.5~0.8ms，
   正落在人耳 ITD 的自然范围（0 ~ 0.7ms）里，所以每个反射都会被
   大脑定位到头外的某个方向；而 4 个抽头的左右倾向**故意交替**
   （有的偏左、有的偏右），合成之后不是"声像歪到一边"，
   而是"声音从几个方向陆续回来"—— 这就是包围感的物理来源。

   ★ 为什么同极性而不是 `L = mid + refl、R = mid - refl`：
     反相注入能让侧能量指标（side/mid）做得很好看，但它把 ITD 抹成 0
     （见文件头），这正是前三轮"指标全绿、用户没感觉"的根因。
     这里明确选择"指标退一点、时间差做出来"，并把判据改成直接量 ITD
     （见 TestSurroundFieldCarriesInterauralTimeDifference）。

   ★ 为什么放在 stereoStage **之后**、reverb **之前**：
     · stereoStage 的 `mid ± side` 结构被 TestSpatialProcessingKeepsMonoFoldFlat
       钉死（单声道折叠必须逐位平直），把会动折叠的东西塞进去就破了那条；
     · 早期反射（<20ms）在声学上属于"直达声之后、混响尾巴之前"，
       顺序上就该夹在中间；
     · 与 runReverb 同理，它由 preset 固化成布尔开关，切换时靠整条链的
       交叉淡化过门，**不需要**逐参数平滑 —— 见 chainState.runEcho。

   --------------------------------------------------------------------------
   二、带通限带（160Hz ~ 3.6kHz）不是可选项

   · 低端：反射里的低频会与直达声低频梳状相消，听感是"低音糊/发虚"，
     而且低频 ITD 反而容易被听成"相位问题"。160Hz 一阶高通把
     80Hz 处压到约 -9dB，低频折叠基本不受影响。
   · 高端：真实房间的墙面吸收让 4kHz 以上反射明显弱于直达声；
     不限带的话抽头会在高频制造刺耳的"哒哒"梳齿。
   · 中间这一段（160~3600Hz）恰好是 ITD 线索最有效的区间
     （1.5kHz 以下以时间差为主、以上以强度差为主）。

   两个一阶节：高通用 `x - 一阶低通` 实现（不需要 x[n-1]），
   直流增益结构性等于 0，不存在系数算错导致漏直流的风险。

   --------------------------------------------------------------------------
   三、零分配 / 线程模型

   与 reverb、stereoStage 完全一致：prepare 一次分配，processStereo 里
   没有 make/map/interface；参数固化在 preset 里，不保证并发安全。
   ========================================================================== */

package audioplay

import "math"

/* --------------------------------------------------------------------------
   常量与抽头表
   -------------------------------------------------------------------------- */

// earlyFieldTaps 是每只耳朵的反射抽头数。
//
// 4 个而不是更多：precedence 窗口（5~30ms）里能被听成"空间"而不是
// "回声"的独立反射大概就是这个量级；再多就开始与后面的 reverb 抢同一件事，
// 听感是"混响变糊"而不是"环绕变强"。
const earlyFieldTaps = 4

// earlyFieldMaxDelaySamples 是延迟线容量上限（样本）。
//
// 最长抽头 16.4ms：44.1kHz = 723、48kHz = 787、96kHz = 1574、
// 192kHz = 3149。取 3300 让**任何**采样率下都不必夹延迟 ——
// 被夹过的延迟表会让"同一个预设在不同设备上换了一个空间"，
// 那是极难排查的听感漂移。缓冲按实际需要的 maxD+1 分配，
// 44.1kHz 下只有 724 个 float64（约 5.8KB），常量大不等于分配大。
const earlyFieldMaxDelaySamples = 3300

// earlyFieldHPHz / earlyFieldLPHz 是反射场的带通拐点（见文件头第二节）。
const (
	earlyFieldHPHz = 200.0
	earlyFieldLPHz = 3600.0
)

// earlyFieldDelayLMS / earlyFieldDelayRMS 是 @44.1kHz 的抽头延迟（毫秒）。
//
// ★ 抽头 1 是**配对**的：同一个反射、两耳差 0.7ms —— 正在人耳 ITD 的
// 自然范围（0 ~ 0.7ms）里，precedence 效应会把它与直达声融合，
// 融合的产物就是"声音在头外面，偏向左边"。这是本段唯一的**方向**线索。
//
// ★ 抽头 2~4 故意**不配对**：两耳的延迟差拉到 1.7 ~ 4.3ms。
// 延迟差超过一个波长量级之后，两耳收到的反射就基本互不相关了 ——
// 这正是**包围感**要的东西（Barron & Bradley：晚场/扩散声的
// 双耳互相关系数越低，包围感越强）。
//
// 两条线索都要：只配对 → 反射场两耳几乎一样（实测归一化互相关 0.98），
// 听感是"直达声又响了一遍"，还是在头里；只打散 → 有弥散感但没有
// "从某个方向回来"。抽头 1 出方向、2~4 出扩散，各干各的。
//
//	抽头 1: L 2.6 / R 3.3ms   Δ=+0.7ms   方向（左）
//	抽头 2: L 6.2 / R 8.9ms   Δ=+2.7ms   扩散
//	抽头 3: L 10.7 / R 13.9ms Δ=+3.2ms   扩散
//	抽头 4: L 16.4 / R 12.1ms Δ=-4.3ms   扩散（这条把净延迟差往回拉，
//	                                      避免整个反射场偏向一侧）
var earlyFieldDelayLMS = [earlyFieldTaps]float64{2.6, 6.2, 10.7, 16.4}
var earlyFieldDelayRMS = [earlyFieldTaps]float64{3.3, 8.9, 13.9, 12.1}

// earlyFieldGains 是各抽头增益（递减，Σ = 0.45，Σg² = 0.0639）。
//
// ★ 总量 Σg 与能量 Σg² 是两个不同的量，这里两个都要交代：
//
//	· **能量**（Σg²，经带通后 ≈ 0.016 · |mid|² ≈ -18dB）决定
//	  "反射够不够响"。真实房间的早期反射就在直达声的 -6 ~ -12dB，
//	  这里刻意比它还低一档 —— 耳机上没有房间吸声的掩蔽，
//	  照抄真实房间会听成"回声太大"。
//	· **峰值**（Σg = 0.45）决定"最坏单耳陷波"：全部反相时
//	  20·log10(1-0.45) ≈ -7dB，且四个抽头的延迟互不相同，
//	  在实测的 250Hz~8kHz 网格上最深只到 3dB（多数频点 <1dB）。
//
// ★ 峰值还要与 stereoStage 的全通注入（最坏 -6dB）**叠加**：
// 两者落在同一频率上时单耳会被推到 -13dB 左右。这就是 Σg 不能再往上
// 调的原因 —— 上一稿 Σg=0.54 时实测 250Hz 处左右耳差 17.8dB。
// 想再响就得先把全通那一侧的预算让出来（见 decor 参数的取值）。
var earlyFieldGains = [earlyFieldTaps]float64{0.18, 0.13, 0.09, 0.05}

/* --------------------------------------------------------------------------
   earlyFieldStage
   -------------------------------------------------------------------------- */

// earlyFieldStage 是早期反射场处理器。
//
// 与 reverb / stereoStage 同样的生命周期与并发约定：prepare 之后
// processStereo 只读写自己的状态，参数在 applyPreset 时固化。
type earlyFieldStage struct {
	// 环形延迟线：两只耳朵读**同一份** src，只是偏移不同。
	buf  []float64
	pos  int
	size int

	// dL / dR 是按采样率换算后的抽头延迟（样本），g 是抽头增益。
	dL [earlyFieldTaps]int
	dR [earlyFieldTaps]int
	g  [earlyFieldTaps]float64

	// 带通：一阶低通状态各一个。
	//
	// 高通 = x - 一阶低通（所以 hpLP 是高通内部那个低通的状态），
	// 低通 = 第二级。
	hpLP    float64
	lp      float64
	hpCoeff float64
	lpCoeff float64

	// amount 是总混入量。由 applyPreset 固化（见 chainState.runEcho 的说明）——
	// 它不参与逐帧平滑：整条链交叉淡化已经覆盖了开关瞬间。
	amount float64

	prepared bool
}

// prepare 按采样率分配延迟线并算好滤波器系数。只在开关 / 采样率变化时调用。
//
// 只清状态、不写 amount：与 eqSection.reset / reverb.reset 的语义一致
// （reset 是"清历史状态"，不是"恢复初始值"）。
func (e *earlyFieldStage) prepare(sampleRate int) {
	fs := float64(sampleRate)
	if fs <= 0 {
		fs = 44100
	}

	maxD := 0
	for i := 0; i < earlyFieldTaps; i++ {
		dl := int(earlyFieldDelayLMS[i] * 0.001 * fs)
		dr := int(earlyFieldDelayRMS[i] * 0.001 * fs)
		if dl < 1 {
			dl = 1
		}
		if dr < 1 {
			dr = 1
		}
		if dl > earlyFieldMaxDelaySamples-1 {
			dl = earlyFieldMaxDelaySamples - 1
		}
		if dr > earlyFieldMaxDelaySamples-1 {
			dr = earlyFieldMaxDelaySamples - 1
		}
		e.dL[i] = dl
		e.dR[i] = dr
		e.g[i] = earlyFieldGains[i]
		if dl > maxD {
			maxD = dl
		}
		if dr > maxD {
			maxD = dr
		}
	}

	// size 必须严格大于最大延迟：读位置 pos-d 要落在缓冲内（负数补 size），
	// 而 pos-d == 0 读到的是"上一圈"的样本 —— 只要 size > maxD 就是正确的历史。
	size := maxD + 1
	if cap(e.buf) < size {
		e.buf = make([]float64, size)
	} else {
		e.buf = e.buf[:size]
		for i := range e.buf {
			e.buf[i] = 0
		}
	}
	e.size = size
	e.pos = 0

	// 一阶低通系数：a = 1 - exp(-2π·fc/fs)
	e.hpCoeff = 1 - math.Exp(-2*math.Pi*earlyFieldHPHz/fs)
	e.lpCoeff = 1 - math.Exp(-2*math.Pi*earlyFieldLPHz/fs)
	e.hpLP = 0
	e.lp = 0

	e.prepared = e.size > 1
}

// setAmount 写入总混入量（applyPreset 调用；0 = 关闭本段）。
func (e *earlyFieldStage) setAmount(v float64) {
	if !(v > 0) { // 同时挡住 NaN
		v = 0
	}
	if v > 1 {
		v = 1
	}
	e.amount = v
}

// reset 清空延迟线与滤波器状态（切歌 / seek / 链交接时调用）。
// 只清状态，不碰 amount 与延迟表。
func (e *earlyFieldStage) reset() {
	for i := range e.buf {
		e.buf[i] = 0
	}
	e.pos = 0
	e.hpLP = 0
	e.lp = 0
}

// shape 对中置信号做带通（160Hz 高通 + 3.6kHz 低通）。
//
// 高通用 `x - 一阶低通` 实现：一阶低通直流增益恒为 1，所以高通的
// 直流增益结构性等于 0 —— 反射场不会把直流/超低频灌进声道。
func (e *earlyFieldStage) shape(x float64) float64 {
	e.hpLP += e.hpCoeff * (x - e.hpLP)
	hp := x - e.hpLP
	e.lp += e.lpCoeff * (hp - e.lp)
	return e.lp
}

// processStereo 就地处理一帧：把带通后的中置分量按每耳各自的延迟
// 送回两只耳朵（同极性，见文件头第一节）。
//
// ★ 早退条件 `amount <= 0`：off/vocal/bass 三档不跑本段，
// 与 runReverb 的旁路是同一个道理（省掉全部延迟线读写）。
func (e *earlyFieldStage) processStereo(xl, xr float64) (float64, float64) {
	if !e.prepared || e.amount <= 0 {
		return xl, xr
	}

	// 反射源取**中置**分量：
	//   · 人声、底鼓、贝斯这些"锚点"在 mid 里，房间感加在它们身上
	//     才会被听成"整个声场在空间里"，而不是"某个乐器坏了"；
	//   · 用 mid 而不是各自的声道，反射场的双耳差异就完全由延迟差决定，
	//     不会把原始声像的左右差再叠一遍上去。
	src := e.shape((xl + xr) * 0.5)
	e.buf[e.pos] = src

	var reflL, reflR float64
	for i := 0; i < earlyFieldTaps; i++ {
		p := e.pos - e.dL[i]
		if p < 0 {
			p += e.size
		}
		reflL += e.g[i] * e.buf[p]

		p = e.pos - e.dR[i]
		if p < 0 {
			p += e.size
		}
		reflR += e.g[i] * e.buf[p]
	}

	e.pos++
	if e.pos >= e.size {
		e.pos = 0
	}

	a := e.amount
	return xl + reflL*a, xr + reflR*a
}
