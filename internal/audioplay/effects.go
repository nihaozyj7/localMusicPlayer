/* ==========================================================================
   effects.go — 音效链（均衡器 + 空间处理 + 混响）
   --------------------------------------------------------------------------
   对外只暴露一个 Chain：上层（PlayerService）设置一个"音效档位"名字，
   Chain 负责把档位翻译成三块 DSP 的参数。

   --------------------------------------------------------------------------
   数据流与顺序

     ring buffer → int16 → [float64]
                          → 高通（只有部分档位启用）
                          → 参数均衡（每档最多 10 段）
                          → 空间处理（Haas + 宽度 + 串扰）
                          → 混响（梳状 + 全通）
                          → 软限幅
                          → [int16] → 声卡

   顺序不是随便排的，三个约束：
     1. **EQ 在空间处理之前**。EQ 是"音色"处理，空间处理是"声场"处理。
        反过来（先加宽再 EQ）会让 EQ 把中侧拆分后的 M/S 当成普通立体声
        来滤 —— 频响曲线会随声像内容变化，同一个预设在不同歌上效果不一致。
     2. **混响在空间处理之后**。混响需要"已经定好声场的信号"作为激发源。
        混响在前的话，它产生的尾巴又会被宽度处理放大，混响量会随宽度
        档位漂移（用户会觉得"加宽之后混响变多了"）。
     3. **软限幅在最后**。EQ 提升 + 混响叠加 + 宽度放大都可能让峰值
        超过 ±1.0，最后一个环节不做保护，输出就会硬削波（爆音）。

   Engine 的调用点还有一条顺序约束（见 engine.go 的 onData）：
   **音效在增益之前**，理由写在那里。

   --------------------------------------------------------------------------
   切换音效为什么要两条链做交叉淡化

   音量变化在 engine.go 里有斜坡，因为那是一个**乘性增益的阶跃**。
   音效切换要严重得多：混响器里有几万样本的延迟线，"关闭混响"的那一瞬间
   它的输出从"有能量"直接变成 0 —— 这个阶跃比调音量陡得多，听感是一声"啪"。
   反向切换（打开混响）时延迟线是空的，本身没有阶跃，但如果**同时**换了
   EQ，系数突变会让滤波器输出跳变（IIR 的内部状态与新系数不匹配），
   同样是一声"啪"。

   处理办法是维护**两条完整的链路**（chainA / chainB）：旧档位在一条上
   继续处理（包括它的混响尾巴继续自然衰减），新档位在另一条上处理，
   输出按 fade 在 30ms 内从前者过渡到后者。

   ★ 为什么不能只做"干信号 ↔ 处理后信号"的淡化（那样只需一条链）：
   在**音效到音效**的切换上是错的。比如"3D 环绕 → 关闭"，
   若淡出端是干净干信号，那 Haas 延迟线里积攒的空间尾巴会被一刀切断，
   比不做淡化还明显。详见 Chain 类型注释。

   EQ 系数另外还有一层 slew 平滑（见 eqSection 的 target/current 双份系数）：
   交叉淡化解决的是"两条链之间的过渡"，slew 解决的是"同一条链内系数突变"。
   两者针对的机制不同，都需要。

   --------------------------------------------------------------------------
   零分配

   全部状态在 Chain.prepare 里一次分配。processStereo 里没有任何
   make / map / interface / 闭包 —— 它跑在 malgo 的音频线程上，
   一次 GC 停顿就是一声爆音（engine.go 的 onData 注释里也强调了这点）。
   ========================================================================== */

package audioplay

import "math"

/* --------------------------------------------------------------------------
   预设档位
   -------------------------------------------------------------------------- */

// EffectPreset 是音效档位名字。
//
// 用字符串而不是枚举数字：这个值要落盘（bootstrap.Config）、要传给前端、
// 要出现在诊断信息里。数字在配置文件里完全不可读，而字符串写错了能一眼
// 看出来（非法值由 NormalizeEffectPreset 收敛到 off）。
type EffectPreset string

const (
	// EffectOff 关闭全部音效（默认）。
	//
	// ★ 默认关闭是刻意的，与"响度均衡""跳过静音"同一立场：
	// 任何改动音频本身的处理都必须由用户明确开启。
	EffectOff EffectPreset = "off"

	// EffectVocal 清澈人声：切低频 + 提中高频 + 轻微空间感。
	EffectVocal EffectPreset = "vocal"

	// EffectBass 低音增强：低频架式提升 + 切掉超低频避免浑浊。
	EffectBass EffectPreset = "bass"

	// EffectSurround 3D 环绕：Haas 延迟 + 宽度 + 串扰。
	EffectSurround EffectPreset = "surround"
)

// EffectPresets 是全部合法档位，顺序即设置界面的展示顺序。
//
// ★ 导出这个切片是为了让"哪些档位合法"只有一个事实来源：
// 校验函数、设置界面、测试都从这里取，不会出现
// "后端认 4 个档、前端画了 5 个按钮"这种不一致。
var EffectPresets = []EffectPreset{
	EffectOff, EffectVocal, EffectBass, EffectSurround,
}

// NormalizeEffectPreset 把任意字符串收敛到合法档位，非法值返回 off。
//
// 手改配置文件、从旧版本升上来、前端传了个已经删掉的档位名 —— 都会走到
// 这里。返回 off 而不是报错：音效是"锦上添花"的功能，为一个非法字符串
// 让播放失败是本末倒置。
func NormalizeEffectPreset(v string) EffectPreset {
	for _, p := range EffectPresets {
		if string(p) == v {
			return p
		}
	}
	return EffectOff
}

// EffectPresetLabel 返回档位的中文名（诊断信息与设置界面用）。
func EffectPresetLabel(p EffectPreset) string {
	switch p {
	case EffectVocal:
		return "清澈人声"
	case EffectBass:
		return "低音增强"
	case EffectSurround:
		return "3D 环绕"
	default:
		return "关闭"
	}
}

/* --------------------------------------------------------------------------
   档位的参数定义
   -------------------------------------------------------------------------- */

// eqBandSpec 描述一个 EQ 频段（设计参数，非运行时状态）。
type eqBandSpec struct {
	kind   int // eqKindPeaking / eqKindLowShelf / eqKindHighShelf
	freq   float64
	q      float64 // peaking 用；架子与高通忽略
	gainDB float64
}

const (
	eqKindPeaking = iota
	eqKindLowShelf
	eqKindHighShelf
)

// presetSpec 是一个档位的完整 DSP 定义。
type presetSpec struct {
	// highPassHz > 0 时在 EQ 之前启用高通
	highPassHz float64
	highPassQ  float64

	bands []eqBandSpec

	stereo StereoParams
	// enableEarly 为 true 时启用早期反射场（effects_early.go）——
	// 环绕档里唯一携带双耳时间差（ITD）的环节。
	//
	// ★ 它必须是 preset 固化的布尔，不能靠 stereo.Decorrelation 之类
	// 推断：与 runReverb 同理，淡出中的那条链的 preset 已经被下一次
	// 切换改写，处理时现查会用"新档位的开关"决定"旧档位的数据过不过"，
	// 把延迟线里积攒的能量在一个样本内整块丢掉（见 runReverb 的说明）。
	enableEarly bool
	// enableOrbit 为 true 时启用运动调制（effects_orbit.go）——
	// 让声像与反射延迟随时间摆动，也就是"音乐绕着头转"。
	//
	// ★ 与 enableEarly 分开：反射场是**空间**（声场长什么样），
	// 摆动是**运动**（声场会不会动）。合并成一个布尔的话，
	// 将来想做"有空间但不转"或"只转不做反射"的档位就没法表达。
	enableOrbit bool
	// enableReverb 为 false 时混响整块旁路（省掉全部延迟线运算）
	enableReverb bool
	reverb       ReverbParams
}

// presetSpecs 是档位 → DSP 参数的映射表。
//
// ★ 所有增益都刻意克制在 ±5dB 以内。
// 播放器的预设是给"听感修饰"用的，不是母带处理：超过 ±6dB 的提升
// 配合后面的软限幅会明显压扁动态（听起来"响但没劲"），
// 而用户对比"开/关"时的第一反应会是"开了变难听"。
var presetSpecs = map[EffectPreset]presetSpec{
	// ★ off 的 stereo **必须**显式写成 Width 0.5（直通），不能留零值。
	//
	// 零值 Width 会被 setParams 映射成 width = 0（单声道），而 off 档在
	// **交叉淡化期间**是会真的跑 stereoStage 的（见 ProcessStereo：
	// 只有"两条链都是 off 且淡化完成"才整块旁路）。于是
	// "3D 环绕 → 关闭" 变成：淡出期间 off 链输出 mono → 淡化结束、
	// 快速路径接管、恢复完整立体声 → 单个样本上 L 跳 +side、R 跳 -side
	// → 一声"啪"。侧信号越强越响 —— 这是"切换音效爆音"的成因之一。
	// 写成 0.5 后 off 链是逐位直通（width×2 = 1 → M/S 恒等分支），
	// 淡化边界前后都是原信号，无缝。
	EffectOff: {stereo: StereoParams{Width: 0.5}},

	// 清澈人声
	//
	// 思路是"做减法"而不是"做人声频段加法"：
	//   · 120Hz 高通 —— 切掉贝斯与底鼓的基频能量，人声不需要变响就浮出来了。
	//     这是最关键的一步，比抬 3kHz 有效得多（抬 3kHz 过头就是刺耳齿音）。
	//   · 250Hz -3dB —— 这个频段是"浑浊/箱音"的来源（人声的胸腔共鸣叠加处）。
	//   · 3kHz +2.5dB —— 人声的"清晰度/临场感"频段（辅音的辨识度在这里）。
	//   · 9kHz +1.5dB —— 一点空气感，让齿音与气息听起来自然而不是被闷住。
	EffectVocal: {
		highPassHz: 120,
		highPassQ:  0.707,
		bands: []eqBandSpec{
			{eqKindPeaking, 250, 1.0, -3.0},
			{eqKindPeaking, 3000, 1.2, 2.5},
			{eqKindHighShelf, 9000, 0.707, 1.5},
		},
		// 很小的一点宽度，让人声从"贴脸"退到"面前有一个舞台"。
		// ★ 不给人声档加混响：人声加混响会立刻削弱清晰度，
		// 与"清澈人声"这个名字直接矛盾。
		stereo: StereoParams{Width: 0.55},
	},

	// 低音增强
	//
	// ★ 30Hz 高通 + 55Hz -2dB 是"低音增强"不翻车的前提：
	// 绝大多数回放设备（耳机、笔记本喇叭）根本放不出 40Hz 以下，
	// 但那一带的能量会吃掉功放/扬声器的行程预算 —— 结果是"低音更糊了
	// 但一点都不更响"。先把放不出来的部分削掉，再把 80~150Hz
	// （真正能被听到的"鼓点冲击力"）抬起来，才是有意义的增强。
	//
	// ★ 低架拐点定在 150Hz 而不是更低：
	// 低架是"拐点以下整体抬升"，拐点越低，100Hz 处抬得越少
	//（架子在拐点附近才走完一半）。实测拐点取 120Hz 时 100Hz 只抬到
	// 约 1.95dB —— 明显弱于"低音增强"这个名字给人的预期。
	// 定在 150Hz 让 80~150Hz 这一段（鼓点与贝斯基频所在）拿到接近
	// 满额的提升。
	EffectBass: {
		highPassHz: 30,
		highPassQ:  0.707,
		bands: []eqBandSpec{
			{eqKindPeaking, 55, 0.8, -2.0},
			{eqKindLowShelf, 150, 0.707, 5.0},
			// 轻微削低中频，让低频在整体混音里更突出（等响度心理声学：
			// 低频的提升感很大程度来自"中频相对变少"）
			{eqKindPeaking, 500, 1.0, -1.5},
		},
		// ★ 与 off 同理：bass 不动声场，但 stereo 不能留零值 ——
		// 零值 = 单声道，交叉淡化期间会先把立体声压成单声道、
		// 淡化结束时再跳回立体声（见 EffectOff 那段注释）。
		// 0.5 = 直通（0.5×2 = 1，M/S 走恒等分支）。
		stereo: StereoParams{Width: 0.5},
	},

	// 3D 环绕
	//
	// ★ 参数是为**耳机**调的，这一点决定了全部取值的量级。
	//
	// ★★ 这一版是**重写**。上一版（Width 0.98 / Haas 0.8 / Crossfeed 0.06，
	// 其中 Haas 是"右声道延迟 22ms + 0.35 反馈"）被用户反馈
	// "效果依然等于没有 + 会出现爆音"，根因与修法见 effects_stereo.go
	// 文件头（那里有实测频响数据与完整的推导）。一句话概括：
	//
	//   · "只给一侧加延迟"在数学上就是给那个声道加了一个**梳状滤波器**，
	//     实测在 200Hz~6kHz 挖出 9~15dB 的陷波 —— 听感是"右声道坏了"，
	//     而不是"变宽了"，所以用户觉得"没有效果"；
	//   · 0.35 的延迟反馈制造 6.3dB 的共振峰，且参数在切换时**硬跳变**，
	//     两者叠加就是那声"爆音"。
	//
	// 这一版三个手段（M/S 宽度 / 全通去相关 / Bauer 串扰）都只改
	// 声场、不改频响，并且参数全部走 12ms 一阶平滑：
	//
	//   · Width 1.0 → 约 2 倍中侧宽度。这是**唯一无副作用**的加宽手段
	//     （纯矩阵运算，不引入任何滤波），设为满值。
	//     ★ 代价是对真单声道素材（L==R）完全无效 —— 由 Decorrelation 补。
	//
	//   · Decorrelation 1.0（满值）→ 全通去相关，**只有一层**：
	//     一个 61 样本（1.4ms）的全通，`side += ap(mid)·0.5·decor`。
	//     全通幅度响应恒为 1，只改相位不改音色；因为幅度恒定，
	//     注入量恒为 0.5·|mid|，单耳最坏陷波被钉在 -6dB。
	//     ★ 第三轮的第二个手段（6/11/17/25ms 稀疏回声进侧分量）
	//       已在第四轮移除：它不带 ITD 且能把单耳挖到 -18dB，
	//       职责由 enableEarly 的早期反射场接手。
	//
	//   · enableEarly → 早期反射场（effects_early.go）：
	//     4 个**同极性、每耳延迟不同**的反射抽头，落在 precedence
	//     的 1~20ms 窗口里。这是链路里唯一真正携带双耳时间差的环节，
	//     也是"环绕感"的主力（全通只提供宽化，混响只提供扩散尾巴）。
	//
	//   · Crossfeed 0.10 → 只串**低频**的互补互换，用来消除头中效应
	//     （把声音从"脑中"挪到"面前"）。
	//     ★ 串扰方向与加宽相反（它缩小通道差），所以必须很小 ——
	//     测试钉住上限 0.10（见 TestSurroundCrossfeedStaysSmall）。
	//     语义是归一化强度：内部换出比 = 0.05，直流处只做 5% 的
	//     中心黏合，不会把加宽效果抵消掉。
	//     ★ 它用的是二阶低通做互补互换而不是比例混合，所以
	//     单声道折叠严格不变（实测全频段 0.00dB，见 processStereo）。
	//
	// ★★ 第三轮（用户确认"加入轻混响"）：v0.1.4 把单声道声道差做到
	// 0.236、第二轮重写做到 0.168，用户依然说没效果。复盘出两个感知缺口：
	// 全通只有 1.4/2.0ms、低于 precedence 的 5~30ms 宽敞感窗口（补了
	// 5~25ms 稀疏回声）；环绕最强的听感线索是空间感（补了混响 ——
	// 干湿比 0.30、Size 0.60 约 0.7s 的小房间、阻尼偏暗）。
	//
	// ★★ 第四轮（用户反馈"有变宽、有混响，但没有环绕的感觉"）：
	// 前三轮全部空间成分都走 `L = mid + side、R = mid - side`，
	// 这个结构把**双耳时间差（ITD）恒定压成 0** —— 实测互相关峰值
	// 就落在 lag = 0 样本上。ITD 是"声音在头外面"最主要的判断依据，
	// 于是宽化和混响都听得到、环绕感就是出不来。详见 effects_early.go
	// 文件头（那里有实测数据与完整的推导）。
	//
	// 这一轮新增 enableEarly（早期反射场）：4 个同极性、每耳延迟不同
	// 的反射抽头（抽头 1 两耳差 0.7ms，正落在人耳 ITD 的自然范围；
	// 抽头 2~4 拉开到 2.7~4.3ms 让两耳的反射场互不相关），
	// 这是链路里唯一真正带时间差的环节。
	//
	// 同时改了两处"看着是宽、其实是染色"的结构（实测数字）：
	//   · side 通道里那组 6/11/17/25ms 回声整体移除 —— Σg·scale≈1.0
	//     意味着某频率上 side 正好等于 -mid，单耳被挖空（500Hz 处
	//     左右耳差 18dB，1000Hz 处 38dB）；
	//   · 全通去相关从"两个延迟不同的全通相减"改成"一个全通"——
	//     相减的 |H1-H2| 在频域 0~2 起伏，同样能挖空单耳；
	//     单个全通 |H|≡1，注入量是常数，最坏陷波因此被结构性钉在 -6dB。
	// 两者合起来把单耳最坏电平差从 38dB 降到 12.6dB。
	//
	// ★★ 第五轮（用户反馈"音频是固定的，没有音乐环绕的感觉；
	// 左右两只耳机输出的声音是动态的"）：
	// 到第四轮为止，全部处理都是**静态**的 —— 滤波、延迟、混响参数
	// 一旦定下就不再变，左右耳输出的比例是一条固定曲线。静态处理能
	// 决定"声场长什么样"，决定不了"声场会不会动"，所以听感停在
	// "宽了、有空间了，但它不转"。
	//
	// 这一轮新增 enableOrbit（运动调制，effects_orbit.go）：
	//   · 中置声像按 0.25Hz 在左右之间摆（L+R 恒等，折叠不受影响）；
	//   · 反射场的每耳延迟反向推移 ±0.6ms，最强的那个反射会真的
	//     从左耳摆到右耳 —— 这是让"摆动"读起来像**绕**而不是像
	//     "自动声像在抖"的关键，因为时间差线索跟着一起动了。
	// 实测（单声道白噪、0.5 秒分块）：左右响度摆幅 11.8dB 且穿过
	// 中心 —— 引入之前这个数字是 0dB。
	EffectSurround: {
		stereo:       StereoParams{Width: 1.0, Decorrelation: 1.0, Crossfeed: 0.10},
		enableEarly:  true,
		enableOrbit:  true,
		enableReverb: true,
		reverb:       ReverbParams{Amount: 0.30, Size: 0.60, Damp: 0.60},
	},
}

/* --------------------------------------------------------------------------
   音效链
   -------------------------------------------------------------------------- */

// eqSection 是均衡器段落：一组 biquad + 系数平滑。
//
// 系数平滑（slew）是防爆音的另一半：
// 切换档位时若把所有 biquad 的系数**直接**换成新值，滤波器内部状态
// （x1/x2/y1/y2）是按旧系数积累的，输出会在那一帧跳变。
// 这里让系数在 ~20ms 内线性走到目标值，跳变就被摊平了。
//
// ★ 只对 EQ 做平滑，不对混响的反馈系数做：
// 混响反馈量的变化不会产生阶跃（延迟线里的能量是连续的，反馈系数只是
// 决定它衰减多快），实测无爆音。而 EQ 系数直接决定**当前样本**的加权，
// 突变就是阶跃。这个区别值得写下来，否则以后有人会"顺手"给混响也加上
// 平滑，白白多一份每帧拷贝的开销。
type eqSection struct {
	// current / target 是系数与采样率。平滑步长由 slewStep 决定。
	bands   []biquad
	targets []biquadCoeffs
	current []biquadCoeffs

	// hp 是高通段（always 存在，gain 为 0 时它被旁路）
	hp      biquad
	hpCur   biquadCoeffs
	hpTgt   biquadCoeffs
	hpOn    bool
	hpTgtOn bool

	// smoothLeft 是系数还需要平滑的帧数。0 表示已经收敛（走快速路径）。
	smoothLeft int
	sampleRate float64
}

// eqSlewFrames 是系数平滑的时长（帧 @44.1kHz）。
//
// 20ms ≈ 882 帧。取这个值是因为它明显短于"能被听成两段声音"的门限
// （约 30ms，与 Haas 的下限同源），又足够把系数阶跃摊平成不可闻的滑变。
const eqSlewFrames = 882

// prepare 按最大频段数预分配（只在开关 / 采样率变化时调用）。
func (e *eqSection) prepare(sampleRate int) {
	if cap(e.bands) < maxEQBands {
		e.bands = make([]biquad, maxEQBands)
		e.targets = make([]biquadCoeffs, maxEQBands)
		e.current = make([]biquadCoeffs, maxEQBands)
	}
	e.bands = e.bands[:maxEQBands]
	e.targets = e.targets[:maxEQBands]
	e.current = e.current[:maxEQBands]
	e.sampleRate = float64(sampleRate)
	e.reset()
}

// reset 清空**滤波器状态**（切歌 / seek 时调用）。
//
// ★★ 绝对不能碰系数（targets / current）—— 这是本文件出过的最严重的一个
// bug，写在这里作为警示。
//
// 症状：**切歌之后完全没声音，但进度条正常走**。
// 原因：初版这里把 targets/current 一并清成 biquadCoeffs{}（零值），
// 而零值的 b0 = 0 —— 传递函数变成 H(z) = 0，输出恒为 0，也就是静音。
// 更糟的是零值系数**不满足** isIdentity()（那要求 b0 == 1），
// 所以 eqSection.process 里"直通段跳过"的快速路径**不会**跳过它们，
// 这些零系数滤波器照常参与运算，把信号整块乘成 0。
//
// 为什么症状是"切歌后"而不是"一开始就没声"：第一次装载之前链是
// off 档位、系数是全直通（prepare 里 applyPreset(off) + snapCoeffs 设好的），
// 所以首曲正常；一旦 Load 调到这里，系数被清零，此后**永远**没有声音 ——
// 直到用户重新点一次音效按钮（那会触发 applyPreset 重写系数）。
//
// 进度条为什么不受影响：位置推进（positionFrame）与音频内容完全无关，
// 它只是按帧计数。所以"进度正常但没声音"是这个 bug 的典型特征。
//
// 教训：reset 的语义是"清历史状态"，不是"恢复初始值"。系数属于**配置**，
// 历史（x1/x2/y1/y2）才属于**状态**。两者必须分开清 ——
// 见 biquad.reset()（它只清 8 个延迟单元，保留 5 个系数），
// 本函数应该与它保持同一个语义。
//
// 现在改为逐段调用 biquad.reset()：它内部用 `*b = biquad{b0: ..., a2: ...}`
// 只保留系数、丢掉历史，正是这里想要的效果。
func (e *eqSection) reset() {
	for i := range e.bands {
		e.bands[i].reset()
	}
	e.hp.reset()
	// hpOn 是"当前生效的开关"，属于配置而不是状态，同样保留。
	// smoothLeft（平滑进度）归零：切歌后没有"正在过渡"可言，
	// 且归零会让 stepOnce 直接返回，走稳态路径。
	e.smoothLeft = 0
}

// apply 设置新的目标系数（不立即生效，由 processStereo 逐步逼近）。
func (e *eqSection) apply(spec presetSpec) {
	n := 0

	// 高通段
	if spec.highPassHz > 0 {
		e.hpTgt = designHighPass(spec.highPassHz, spec.highPassQ, e.sampleRate)
		e.hpTgtOn = true
	} else {
		e.hpTgt = biquadCoeffs{}
		e.hpTgtOn = false
	}

	for _, b := range spec.bands {
		if n >= maxEQBands {
			break
		}
		switch b.kind {
		case eqKindLowShelf:
			e.targets[n] = designLowShelf(b.freq, b.gainDB, e.sampleRate)
		case eqKindHighShelf:
			e.targets[n] = designHighShelf(b.freq, b.gainDB, e.sampleRate)
		default:
			e.targets[n] = designPeaking(b.freq, b.q, b.gainDB, e.sampleRate)
		}
		n++
	}
	// 剩下的频段目标系数清零（等价于直通：b0=0 会让输出变成 0，
	// 所以要显式设成单位冲激的系数）
	for i := n; i < maxEQBands; i++ {
		e.targets[i] = biquadCoeffs{b0: 1}
	}

	e.smoothLeft = eqSlewFrames
}

// stepCoeffs 把一组系数朝目标推进一步（每步走 frac 比例），返回推进后的值。
//
// frac 通常等于 1/eqSlewFrames（每帧一步）。传 1.0 表示直接跳到目标值。
func stepCoeffs(cur biquadCoeffs, tgt biquadCoeffs, frac float64) biquadCoeffs {
	f := func(c, t float64) float64 {
		d := t - c
		// 已经足够接近就直接吸附到目标值，避免无限逼近
		// （浮点数的线性插值永远差最后一点点，会让 smoothLeft 到 0 时
		// 系数还留着一个极小的残差。虽然听不出来，但会让"直通判定"
		// 的精确比较永远失败，白白多跑 10 次 biquad —— 而那是默认
		// 路径（不开音效）的开销，必须干净）
		if d > -1e-9 && d < 1e-9 {
			return t
		}
		return c + d*frac
	}
	return biquadCoeffs{
		b0: f(cur.b0, tgt.b0), b1: f(cur.b1, tgt.b1), b2: f(cur.b2, tgt.b2),
		a1: f(cur.a1, tgt.a1), a2: f(cur.a2, tgt.a2),
	}
}

// assign 把系数写进滤波器（保留状态，见 biquad.reset 的说明）。
func (b *biquad) assign(c biquadCoeffs) {
	b.b0, b.b1, b.b2, b.a1, b.a2 = c.b0, c.b1, c.b2, c.a1, c.a2
}

// isIdentity 报告一组系数是否等价于直通（用于跳过整个滤波段）。
//
// 直通判定必须是**位模式相等**而不是"浮点近似"：系数是由设计函数算出来的，
// 同一个预设每次算出的位都一样，所以这里用精确比较既正确又便宜。
func (c biquadCoeffs) isIdentity() bool {
	return c.b0 == 1 && c.b1 == 0 && c.b2 == 0 && c.a1 == 0 && c.a2 == 0
}

/* --------------------------------------------------------------------------
   Chain
   -------------------------------------------------------------------------- */

// Chain 是完整的音效链。零值不可用，必须经过 prepare。
//
// 生命周期与 Engine 的声卡一致：Engine.Open 时 prepare，
// Engine.Close 时置为未就绪。**不保证并发安全**：
// setPreset / reset 在控制线程，processStereo 在音频线程 ——
// 两者之间的可见性由 engine.go 的原子参数快照保证（见 Engine.SetEffect）。
//
// --------------------------------------------------------------------------
// 切换音效为什么要两条完整链路（而不是"干信号 ↔ 湿信号"混合）
//
// 最省事的做法是只维护一条链，切换时在"原始干信号"和"处理后的信号"之间
// 淡化。但那在**音效到音效**的切换上是错的：
//
//	3D 环绕 → 关闭
//
// 若淡出端是"干净干信号"，那 Haas 延迟线里积攒的空间尾巴是在一个淡化
// 周期里被**直接抽走**的 —— 而它本来会自然衰减出几十毫秒的余韵。
// 听感是"空间感被一刀切断"，比不做淡化还明显（不做淡化至少两端都是
// 瞬变，还能被当成"切换动作"）。
//
// 所以这里维护两套 DSP 状态：旧的（fading out）与新的（fading in）。
// 每条路径各自完整地处理输入，输出按 fade 混合。代价是切换期间 CPU
// 翻倍（仍是可忽略的量级），换来的是"混响自然退场"这个正确的听感。
//
// ★ 切换完成后（fade 到 1）旧链的状态被**丢弃**，新链继承为活动链。
// 丢弃而不是保留，是因为保留两份会让"下一次切换"不知道该用哪份，
// 而重新分配延迟线的成本只在切换时付一次（不涉及音频线程的分配 ——
// 两条链的缓冲都在 prepare 里一次分配好，切换只是换索引）。
type Chain struct {
	// 两条并行的链路：A 与 B。活动的那条由 activeIsA 指示。
	//
	// 用"两个固定槽位 + 布尔切换"而不是"两个指针":
	// 指针会让音频线程读到控制线程写的指针（需要原子操作），
	// 而布尔同样需要原子 —— 但布尔可以让整个切换用一次
	// 无锁的整数写完成，实现更直白。
	chainA chainState
	chainB chainState

	// 两条并行的链路：A 与 B。
	//
	// ★ 语义必须精确，这里踩过一次坑（写下来免得再犯）：
	//
	//	fadingOutIsA —— **淡化期间**哪条链在淡出（旧效果）。
	//	                淡化结束后它无意义。
	//
	//	新效果永远在另一条链上。淡化结束后，"新链"就成了唯一的活动链，
	//	而它是不是 A 由 fadingOutIsA 取反表示。
	//
	// 曾经的写法是只存一个 activeIsA 表示"淡入目标"，然后让
	// processFading 用它取反去拿"淡出链"。那在两处都错了：
	// applyPendingLocked 会**立刻**翻转它，于是 processFading 拿到的
	// "旧链"其实是新链 —— 淡化方向整个反过来，混响能量在 fade=1 的
	// 那一帧被整块丢弃（实测跳变 4 万多，是满幅的 1.3 倍）。
	//
	// 现在改成显式表达"谁在淡出"，淡化方向不再依赖取反。
	fadingOutIsA bool

	// 淡化状态（全部由音频线程独占读写）
	fade    float64 // 0 = 全是淡出链，1 = 全是新链
	fadeInc float64 // 每个样本的推进量；0 表示不需要淡化

	// pendingPreset 是被推迟到下一个缓冲才生效的档位。
	//
	// 为什么不在 SetPreset 里立刻改：SetPreset 跑在控制线程，
	// 它要改的是"已经在淡入的那条链"还是"刚空出来的那条链"，
	// 取决于音频线程当前的 position —— 从控制线程猜这个状态就是在
	// 制造竞态。改成"请求 + 音频线程在缓冲边界执行"，语义清晰得多。
	pendingPreset EffectPreset
	hasPending    bool

	// —— 以下两个只被音频线程使用 ——
	// 当前档位（用于诊断 / 上报）。它是"音频线程实际在处理"的档位，
	// 与 pendingPreset 不是一回事。
	currentPreset EffectPreset

	// orbit 是环绕档的运动调制源（LFO）。
	//
	// ★ 挂在 Chain 而不是 chainState 上：两条链在交叉淡化期间共用
	// 同一个相位，切换时才不会出现"声像被扫一下"。见 orbitLFO 注释。
	orbit orbitLFO

	samples  int
	prepared bool
}

// chainState 是一条独立的 DSP 链路（EQ + 空间处理 + 早期反射 + 混响）。
type chainState struct {
	eq     eqSection
	stereo stereoStage
	early  earlyFieldStage
	rev    reverb
	// preset 是这条链当前装载的档位
	preset EffectPreset
	// runEarly 是"这条链当前是否要跑早期反射场"（effects_early.go）。
	//
	// ★ 与 runReverb 同一条约束：必须**随 preset 一起固化**，不能在处理时
	// 现查 presetSpecs[preset] —— 理由见 runReverb 那段（淡出中的链的
	// preset 已被下一次切换改写，现查会把延迟线里积攒的反射能量
	// 在一个样本之内整块丢弃 → 输出跳变 → 爆响）。
	runEarly bool
	// runOrbit 表示"这条链当前是否要跑运动调制"（effects_orbit.go）。
	//
	// ★ 同一条约束：随 preset 固化，理由见 runReverb。
	// ★ 摆动量本身**不**挂在这条链上 —— LFO 挂在 Chain 上共用一个相位，
	//   否则交叉淡化期间两条链的相位不同，切换瞬间会"嗖"地扫一下
	//   （见 orbitLFO 的类型注释）。
	runOrbit bool
	// runReverb 是"这条链当前是否要跑混响"。
	//
	// ★ 必须**随 preset 一起固化**，不能在处理时临时查 presetSpecs[preset]。
	// 原因：淡出中的那条链，它的 preset 已经被下一次切换改写了
	//（见 applyPendingLocked 对 inactive 的复用）。如果处理时现查，
	// 就会用"新档位的混响开关"去决定"旧档位的数据要不要过混响器"——
	// 那个判断从 true 变成 false 时，延迟线里积攒的混响能量会在
	// **一个样本之内**被整块丢弃，输出跳变 4 万多（满幅的 1.3 倍），
	// 听感就是一声爆响。
	//
	// ★ 它的取值来自 presetSpec.enableReverb；3D 环绕档目前启用混响
	//（第三轮经用户确认嵌回环绕档，"现场感/大厅混响"两个独立档位仍处于移除状态）。
	runReverb bool
	// needsApply 表示参数还没写进去（prepare 后或刚被清空时）
	needsApply bool
}

// applyPreset 把档位参数写进这条链。
func (s *chainState) applyPreset(p EffectPreset) {
	spec := presetSpecs[p]
	s.eq.apply(spec)
	s.stereo.setParams(spec.stereo)
	if spec.enableEarly {
		s.early.setAmount(1.0)
	} else {
		s.early.setAmount(0)
	}
	if spec.enableReverb {
		s.rev.setParams(spec.reverb)
	}
	s.preset = p
	// 固化"要不要跑早期反射 / 摆动 / 混响"（见对应字段的说明）
	s.runEarly = spec.enableEarly
	s.runOrbit = spec.enableOrbit
	s.runReverb = spec.enableReverb
	s.needsApply = false
}

// chainFadeFrames 是音效切换的交叉淡化时长（帧 @44.1kHz）。
//
// 30ms：明显长于单次回调（23ms），保证淡化至少跨过两个回调，
// 不会出现"一个回调之内就切完了"的情况；又短到听不出延迟。
const chainFadeFrames = 1323

// prepare 分配全部 DSP 状态（Engine.Open 时调用一次）。
func (c *Chain) prepare(sampleRate int) {
	c.chainA.eq.prepare(sampleRate)
	c.chainA.stereo.prepare(sampleRate)
	c.chainA.early.prepare(sampleRate)
	c.chainA.rev.prepare(sampleRate)
	c.chainB.eq.prepare(sampleRate)
	c.chainB.stereo.prepare(sampleRate)
	c.chainB.early.prepare(sampleRate)
	c.chainB.rev.prepare(sampleRate)

	c.samples = sampleRate
	c.orbit.prepare(sampleRate)
	c.prepared = true

	// 两条链都先装载 off 档位。
	//
	// ★ 这一步不能省：零值 biquadCoeffs 的 b0=0 会把输出直接乘成 0，
	// 也就是**静音**。而 current[i].isIdentity() 的直通判定又依赖
	// "off 档位的系数恰好是单位冲激"，所以必须真的算一遍 off 的参数
	//（empty bands 会走 apply 里那段显式填 b0=1 的分支）。
	//
	// 顺带把 current 系数直接吸附到目标值（EQ 的 apply 只设 targets，
	// 实际系数由逐帧 slew 推进）—— prepare 时不存在"爆音"问题，
	// 没必要求 882 帧去收敛，否则开声卡的头 20ms 会带着半收敛的系数。
	c.chainA.applyPreset(EffectOff)
	c.chainB.applyPreset(EffectOff)
	snapCoeffs(&c.chainA.eq)
	snapCoeffs(&c.chainB.eq)

	// 初始：A 是活动链（B 闲置）。fadingOutIsA 在 fade >= 1 时无意义，
	// 取 false 表示"A 是 incoming/活动链"。
	c.fadingOutIsA = false
	c.fade = 1
	c.fadeInc = 0
	c.currentPreset = EffectOff
	c.pendingPreset = EffectOff
	c.hasPending = false
}

// snapCoeffs 把 EQ 的 current 系数直接吸附到 target（跳过 slew）。
func snapCoeffs(e *eqSection) {
	e.hpCur = e.hpTgt
	e.hp.assign(e.hpCur)
	e.hpOn = e.hpTgtOn
	for i := range e.bands {
		e.current[i] = e.targets[i]
		e.bands[i].assign(e.current[i])
	}
	e.smoothLeft = 0
}

// Prepared 报告音效链是否已就绪（诊断用）。
func (c *Chain) Prepared() bool { return c.prepared }

// Reset 清空全部 DSP 状态（切歌 / seek 时调用）。
//
// ★ 只清滤波器历史与延迟线，**绝不动档位与系数**：
//
//	· 档位是用户的跨歌偏好（"我给这首歌开了 3D 环绕" 的意图是
//	  "我要一直用 3D 环绕"），清掉就等于每次切歌都自动关音效；
//	· 系数属于配置，清掉会让滤波器变成 H(z)=0 的静音器 ——
//	  这正是"切歌后没声音、进度条还在走"那个 bug 的成因，
//	  完整说明见 eqSection.reset 的注释。
//
// ★ 淡化中的两条链一起清。只清活动链的话，另一条链里残留的上一首的
// 混响尾巴会在下一次切换时冒出来。
func (c *Chain) Reset() {
	if !c.prepared {
		return
	}
	c.chainA.eq.reset()
	c.chainA.stereo.reset()
	c.chainA.early.reset()
	c.chainA.rev.reset()
	c.chainB.eq.reset()
	c.chainB.stereo.reset()
	c.chainB.early.reset()
	c.chainB.rev.reset()
}

// RequestPreset 请求切换音效档位（从控制线程调用）。
//
// 返回是否真的会发生变化（相同档位是 no-op）。
//
// ★ 它只记录"待生效"，真正的切换由音频线程在**缓冲边界**执行
// （见 ProcessStereo）。这样做的原因：
//
//	· 切换要用到"哪条链现在是活动的"，而这个状态只有音频线程知道 ——
//	  从控制线程去读就是在读一个正在被音频线程修改的值；
//	· 一个缓冲（23ms）的延迟对用户来说不可感知，但换来的是
//	  参数永远在样本边界上原子地生效。
func (c *Chain) RequestPreset(p EffectPreset) bool {
	if !c.prepared {
		return false
	}
	if p == c.currentPreset && !c.hasPending {
		return false
	}
	// 已经请求了同一个档位就不重复记（连续点同一个按钮）
	if c.hasPending && c.pendingPreset == p {
		return false
	}
	c.pendingPreset = p
	c.hasPending = true
	return true
}

// CurrentPreset 返回音频线程最近一次实际生效的档位。
//
// ★ 这是"探测"语义：控制线程调用它拿到的可能是一个缓冲之前的旧值。
// 它只用于诊断信息展示，不参与任何逻辑判断。
func (c *Chain) CurrentPreset() EffectPreset {
	if !c.prepared {
		return EffectOff
	}
	return c.currentPreset
}

// ProcessStereo 就地处理一整个缓冲（s16le 交错立体声）。
//
// ★ 这是音频回调里唯一调用的方法。它跑在 malgo 的实时线程上，
// 因此这里**没有**任何 make/map/interface/闭包 —— 全部状态都在
// prepare 里预分配好了（见文件头"零分配"一节）。
func (c *Chain) ProcessStereo(buf []byte) {
	if !c.prepared || len(buf) == 0 {
		return
	}

	frames := len(buf) / FrameSize
	if frames == 0 {
		return
	}

	// —— 在缓冲边界执行 pending 切换 ——
	//
	// 放在缓冲开头而不是结尾：这样本次缓冲就已经开始淡化，
	// 用户感知到的延迟最短。
	c.applyPendingLocked()

	// 快速路径：两条链都在 off 且淡化已完成 → 整块旁路。
	//
	// ★ 这条路径很重要：默认（不用户外音效）时它让整个音效模块的
	// 每样本开销降到两三次比较。不能让"加了个音效功能"变成
	// "所有人的 CPU 都多烧一点"。
	if c.fade >= 1 &&
		c.chainA.preset == EffectOff && c.chainB.preset == EffectOff &&
		c.chainA.eq.smoothLeft <= 0 && c.chainB.eq.smoothLeft <= 0 {
		return
	}

	// —— 快速路径 2：单链跑（没有在淡化）——
	//
	// 这是常态（选好一个音效之后一直用它），所以值得单独一条路径：
	// 省掉第二条链的全部运算和一次按样本的混合。
	if c.fade >= 1 {
		c.processSingle(buf, frames)
		return
	}

	c.processFading(buf, frames)
}

// applyPendingLocked 把 pending 切换落到实处。只在音频线程调用。
func (c *Chain) applyPendingLocked() {
	if !c.hasPending {
		return
	}
	target := c.pendingPreset
	c.hasPending = false

	if target == c.currentPreset {
		// 请求又变回了当前档位（用户在两次缓冲之间点了切换再点回来）——
		// 什么都不做。若此时正在淡化，让它自然走完即可。
		return
	}

	// 把装载新档位的那条链定为"非淡出链"。
	//
	// ★ 关键：如果上一次淡化还没走完（fade < 1），那条"正在淡入"的链
	// 就是我们现在要复用的新链；而"正在淡出"的那条继续淡出 ——
	// 也就是 fadingOutIsA **保持不变**。这正好实现了"连续切换时
	// 放弃上一次的过渡，直接朝最新目标过渡"。
	//
	// 若上一次淡化已经走完（fade >= 1），则淡化中的语义不存在，
	// 可以直接翻转：原来那条活动链变成淡出链。
	if c.fade >= 1 {
		c.fadingOutIsA = !c.fadingOutIsA
	}

	incoming := c.incomingChain()
	incoming.applyPreset(target)
	// 新链的 EQ 系数直接吸附到目标（不走 slew）。
	//
	// ★ 为什么不 slew：slew 的意义是"避免系数突变造成爆音"，
	// 但新链此刻的状态是**清零的**（没有历史样本），系数突变对它
	// 没有任何可闻影响 —— 而 slew 反而会引入一个"新效果缓慢淡入"
	// 的额外过程，与交叉淡化叠加后过渡会变得拖沓。
	snapCoeffs(&incoming.eq)

	c.currentPreset = target
	c.fade = 0
	c.fadeInc = 1.0 / float64(chainFadeFrames)
}

// fadingOutChain 返回淡化期间**淡出**的那条链（旧效果）。
// 只在 fade < 1 时有意义。
func (c *Chain) fadingOutChain() *chainState {
	if c.fadingOutIsA {
		return &c.chainA
	}
	return &c.chainB
}

// incomingChain 返回淡化期间**淡入**的那条链（新效果）。
//
// ★ 淡化结束后（fade >= 1）它就是那条唯一的活动链。
func (c *Chain) incomingChain() *chainState {
	if c.fadingOutIsA {
		return &c.chainB
	}
	return &c.chainA
}

// activeChain 返回"唯一在处理信号的那条链"（只在 fade >= 1 时调用）。
//
// 淡化结束后活动链就是 incomingChain —— 这条函数存在的意义是让
// processSingle 的意图明确，而不是到处写 fadingOutIsA 的取反。
func (c *Chain) activeChain() *chainState {
	if c.fade >= 1 {
		return c.incomingChain()
	}
	// 淡化期间没有"唯一活动链"，调用方不该走到这里。
	// 返回淡入链作为兜底（比 panic 安全：音频线程 panic 会让整个
	// 播放进程崩掉，而这里退化成"只放新链"最多是一点瑕疵）。
	return c.incomingChain()
}

// processSingle 是"只有一条活动链"的快速路径。
func (c *Chain) processSingle(buf []byte, frames int) {
	ch := c.activeChain()
	runEarly := ch.runEarly
	runOrbit := ch.runOrbit
	runReverb := ch.runReverb

	for i := 0; i < frames; i++ {
		off := i * FrameSize
		xl := readSample(buf, off)
		xr := readSample(buf, off+2)

		// 运动调制的相位每样本推进一次。只有环绕档才推进：
		// 其它档位下相位停在原地没有影响（新链是靠交叉淡化淡入的，
		// 起点相位被淡化盖住，见 orbitLFO 的注释）。
		orbit := 0.0
		if runOrbit {
			orbit = c.orbit.next()
		}

		// EQ 的系数可能还在收敛（切到 off 档位后的最后一段路）
		if ch.eq.smoothLeft > 0 {
			ch.eq.stepOnce()
		}
		xl, xr = ch.eq.process(xl, xr)
		xl, xr = ch.stereo.processStereo(xl, xr)
		if runEarly {
			xl, xr = ch.early.processStereo(xl, xr, orbit)
		}
		if runReverb {
			xl, xr = ch.rev.processStereo(xl, xr)
		}
		// 摆动放最后：整条链的输出一起摆（音乐与空间同步转），
		// 而混响的激励取的是摆动之前的中置分量，房间本身不跟着歪。
		if runOrbit {
			xl, xr = applyOrbitPan(xl, xr, orbit)
		}

		writeSample(buf, off, xl)
		writeSample(buf, off+2, xr)
	}
}

// processFading 是"两条链交叉淡化"的路径。
func (c *Chain) processFading(buf []byte, frames int) {
	from := c.fadingOutChain() // 旧（淡出）
	to := c.incomingChain()    // 新（淡入）
	fromEarly := from.runEarly
	toEarly := to.runEarly
	fromOrbit := from.runOrbit
	toOrbit := to.runOrbit
	fromRev := from.runReverb
	toRev := to.runReverb

	for i := 0; i < frames; i++ {
		off := i * FrameSize
		xl := readSample(buf, off)
		xr := readSample(buf, off+2)

		// ★ 相位**每样本只推进一次**，两条链读同一个值。
		// 各推各的话，淡化期间两条链的摆动量不同，声像会被来回拉，
		// 而且淡化一结束声像会"跳"到新链的相位上。
		orbit := 0.0
		if fromOrbit || toOrbit {
			orbit = c.orbit.next()
		}
		fromS, toS := 0.0, 0.0
		if fromOrbit {
			fromS = orbit
		}
		if toOrbit {
			toS = orbit
		}

		// —— 旧链 ——
		//
		// ★ 旧链必须**继续跑完整的效果**，而不是只取一份干信号。
		// 这正是"3D 环绕 → 关闭"能自然过渡的原因：旧链里的 Haas
		// 延迟线在自己的缓冲里继续衰减，淡化只是把它整体往下压。
		// 换成"干信号淡出"的话，那 1~2 秒的混响尾巴会被一刀切断。
		if from.eq.smoothLeft > 0 {
			from.eq.stepOnce()
		}
		fl, fr := from.eq.process(xl, xr)
		fl, fr = from.stereo.processStereo(fl, fr)
		if fromEarly {
			fl, fr = from.early.processStereo(fl, fr, fromS)
		}
		if fromRev {
			fl, fr = from.rev.processStereo(fl, fr)
		}
		if fromOrbit {
			fl, fr = applyOrbitPan(fl, fr, fromS)
		}

		// —— 新链 ——
		if to.eq.smoothLeft > 0 {
			to.eq.stepOnce()
		}
		tl, tr := to.eq.process(xl, xr)
		tl, tr = to.stereo.processStereo(tl, tr)
		if toEarly {
			tl, tr = to.early.processStereo(tl, tr, toS)
		}
		if toRev {
			tl, tr = to.rev.processStereo(tl, tr)
		}
		if toOrbit {
			tl, tr = applyOrbitPan(tl, tr, toS)
		}

		// —— 混合 ——
		f := c.fade
		xl = fl*(1-f) + tl*f
		xr = fr*(1-f) + tr*f

		writeSample(buf, off, xl)
		writeSample(buf, off+2, xr)

		c.fade += c.fadeInc
		if c.fade >= 1 {
			c.fade = 1
			// 淡化完成：把**新的**活动链之外的那条清空。
			//
			// ★ 必须清：不清的话，下一次切换会把这条"带着上一首/上一个
			// 音效的延迟线内容"的链当成新链复用，而 applyPendingLocked
			// 又假设新链是干净状态（见那里对 snapCoeffs 的说明）——
			// 结果是新音效一上来就带着一段旧的混响尾巴。
			//
			// 清的是**非活动**的那条，也就是刚刚淡出的 from。
			c.cleanupAfterFade()
			// 剩下的帧走单链路径（fade 已经是 1）
			if i+1 < frames {
				c.processSingleRange(buf, i+1, frames)
			}
			return
		}
	}
}

// processSingleRange 处理缓冲里 [start, frames) 这一段（单链路径）。
//
// 从 processFading 中途交接过来时用：淡化在缓冲中间就完成了，
// 剩下的帧没必要继续跑两条链。
func (c *Chain) processSingleRange(buf []byte, start, frames int) {
	ch := c.activeChain()
	runEarly := ch.runEarly
	runOrbit := ch.runOrbit
	runReverb := ch.runReverb

	for i := start; i < frames; i++ {
		off := i * FrameSize
		xl := readSample(buf, off)
		xr := readSample(buf, off+2)

		orbit := 0.0
		if runOrbit {
			orbit = c.orbit.next()
		}

		if ch.eq.smoothLeft > 0 {
			ch.eq.stepOnce()
		}
		xl, xr = ch.eq.process(xl, xr)
		xl, xr = ch.stereo.processStereo(xl, xr)
		if runEarly {
			xl, xr = ch.early.processStereo(xl, xr, orbit)
		}
		if runReverb {
			xl, xr = ch.rev.processStereo(xl, xr)
		}
		if runOrbit {
			xl, xr = applyOrbitPan(xl, xr, orbit)
		}

		writeSample(buf, off, xl)
		writeSample(buf, off+2, xr)
	}
}

// cleanupAfterFade 清空刚刚淡出的那条链。只在音频线程调用。
func (c *Chain) cleanupAfterFade() {
	stale := c.fadingOutChain()
	stale.eq.reset()
	stale.stereo.reset()
	stale.early.reset()
	stale.rev.reset()
	// 参数本身没变（它还是自己那个 preset），但 reset 之后显式重写一遍
	// 更安全 —— 代价是几十次浮点运算，只在切换时发生一次。
	stale.applyPreset(stale.preset)
	snapCoeffs(&stale.eq)
}

/* --------------------------------------------------------------------------
   样本读写（热路径的薄封装）
   --------------------------------------------------------------------------
   ★ 这两个函数必须构成一个**精确的往返**：read → write 之后，
     每一个 int16 值都要原样回来。

   这不是"精度问题"而是正确性问题。int16 有 65536 个可能值，
   浮点侧用 [-1, 1] 表示它，映射必须是双射 —— 任何"缩放系数不对称"
   的写法都会让一部分样本被压到相邻值上（信息丢失），而所有 DSP
   都在这个映射之上工作。

   曾经的写法是"/32768 读、*32767 写"，两个问题：
     · 样本 1 → 0.0000305 → *32767 = 0.99997 → 截断成 **0**（丢一个 LSB）；
     · 样本 -32768 → -1.0 → *32767 = -32767（永远无法还原 -32768）。
   症状是"不开音效时音频也变了"（TestChainOffIsBitExact 直接抓到）。
   而且丢的是**小信号的最低位** —— 听感上就是低电平处的量化噪声变大，
   在安静段落或淡出尾巴上最明显，人工试听极难发现。

   正确做法：读写用**同一个**缩放系数 32768，且写入时用**四舍五入**
   （而不是截断）。32768 让 [-32768, 32767] 完整覆盖到 [-1, 1)：
     read:  x = s / 32768        （s=-32768 → -1.0，s=32767 → 0.99997）
     write: s = round(x * 32768) （x=-1.0 → -32768，x=0.99997 → 32767）
   四舍五入保证 read 的结果写回去一定落回原值（误差 << 0.5 LSB）。

   32767 作为"归一化上限"是另一个常见写法（用它把 +1.0 映射成 32767），
   但它会让映射不双射 —— 这正是上面踩的坑。
   -------------------------------------------------------------------------- */

// sampleScale 是浮点与 int16 之间的换算系数。
//
// 取 32768（而不是 32767）的理由见上面的长注释：它让映射成为双射。
const sampleScale = 32768.0

// readSample 从 buf 的 off 偏移读一个 s16le 样本，归一化到 [-1, 1)。
func readSample(buf []byte, off int) float64 {
	return float64(int16(uint16(buf[off])|uint16(buf[off+1])<<8)) / sampleScale
}

// writeSample 把一个浮点样本写回 buf（含软限幅与钳位）。
//
// ★ 用 math.Round 而不是直接截断 int32()：截断会让 read→write
// 的往返产生偏差（见上面的说明），Round 才保证精确。
//
// 不用"x*32768 + 0.5 再取整"这个手写技巧：Go 的 int() 是**向零截断**，
// 对负数来说 +0.5 是往错误方向偏的（-1.4 应该舍到 -1，但
// -1.4+0.5 = -0.9 会被截断成 0）。手写就得按符号分两支，
// 而 math.Round 已经把这件事做对了 —— 这个函数每个样本都要跑，
// 但 Round 在 x86 上编译成一条 SSE 指令，不是慢的超越函数。
func writeSample(buf []byte, off int, x float64) {
	x = softClip(x)
	v := int32(math.Round(x * sampleScale))
	if v > 32767 {
		v = 32767
	} else if v < -32768 {
		v = -32768
	}
	binaryPut16(buf[off:], uint16(int16(v)))
}

// eqSection.process 对一帧套用高通（若启用）+ 全部频段。
func (e *eqSection) process(xl, xr float64) (float64, float64) {
	if e.hpOn {
		xl, xr = e.hp.processStereo(xl, xr)
	}
	for i := range e.bands {
		// 直通段跳过：off 档位下全部段都是直通，这个判断让
		// "没开音效"时的开销从 10 次 biquad 降到 10 次比较。
		if e.current[i].isIdentity() {
			continue
		}
		xl, xr = e.bands[i].processStereo(xl, xr)
	}
	return xl, xr
}

// stepOnce 把系数朝目标推进**一帧**，并写进滤波器。
//
// ★ 按帧推进而不是按缓冲推进：如果整块缓冲共用一个插值进度
// （比如"本缓冲起点 0.3，终点 0.4，整块用 0.35"），系数在缓冲边界上
// 依然是阶跃 —— 与 engine.go 里 applyGainRampS16 必须逐样本插值是
// 同一个道理（那里有完整说明）。这里每帧推一次，阶跃被彻底摊平。
func (e *eqSection) stepOnce() {
	if e.smoothLeft <= 0 {
		return
	}
	// frac 就是"每帧走总距离的 1/总帧数"
	frac := 1.0 / float64(eqSlewFrames)
	e.hpCur = stepCoeffs(e.hpCur, e.hpTgt, frac)
	e.hp.assign(e.hpCur)
	e.hpOn = e.hpTgtOn

	for i := range e.bands {
		e.current[i] = stepCoeffs(e.current[i], e.targets[i], frac)
		e.bands[i].assign(e.current[i])
	}

	e.smoothLeft--
}

/* --------------------------------------------------------------------------
   软限幅
   -------------------------------------------------------------------------- */

// softClipThreshold 是软限幅的起始阈值（相对满幅），也即"膝盖"位置。
//
// 0.85 而不是 1.0：限幅器需要一点"预警区"来开始压缩。
// 阈值设在 1.0 的话，等到它介入时峰值已经在硬削波的边上了。
const softClipThreshold = 0.85

// softClipInvRange 是 1 - softClipThreshold，预先算好。
//
// 它在 softClip 里出现两次（一次当分母、一次当系数），
// 而这个函数每个样本都要跑 —— 能省的除法就省掉。
const softClipInvRange = 1 - softClipThreshold

// softClip 是软限幅器：阈值以下逐位透明，阈值以上平滑压向满幅。
//
// --------------------------------------------------------------------------
// 公式与它的四条性质
//
//	|x| <= T:   y = x                     （完全透明）
//	|x| >  T:   y = T + (1-T)·tanh( (|x|-T)/(1-T) )
//
// 这四条性质都是可验证的，也是"能用的限幅器"的最低要求：
//
//  1. **膝盖处连续且导数连续**：|x|=T 时 tanh(0)=0，所以 y=T（值连续）；
//     求导得 dy/dx = sech²(0) = 1（斜率也连续）。C¹ 连续意味着
//     波形没有拐点，不会产生"咔"声。
//  2. **单调递增**：sech² 恒正，所以 y 随 |x| 严格递增。
//     单调保证了不会出现"输入更响、输出反而更轻"的怪现象。
//  3. **严格有界**：tanh 的值域是 (-1,1)，所以 y ∈ (T, 1)。
//     无论输入多大（EQ 提升 + 混响叠加 + 声道加宽可能到 5 倍满幅），
//     输出永远不超过 1.0 —— 这是"绝不硬削波"的硬保证。
//  4. **阈值以下逐位透明**：直接返回 x，一点误差都不引入。
//     ★ 这一条是"不开音效时音频不被改动"的基础。
//
// --------------------------------------------------------------------------
// ★ 这里踩过一次坑，写下来免得再犯
//
// 初版用的是三次多项式 f = T + (1-T)·(t - t³/3)/(2/3)（t 是归一化距离）。
// 它满足"值连续、膝盖处斜率为 1、t=1 处斜率为 0"，看起来很像一个限幅器，
// 但实际上它在 (T, 1) 区间里 **大于恒等映射** —— 也就是把 0.9 放大到
// 0.922、把 0.95 放大到 0.978。那不是限幅，是**增益扩张**：
// 本该被压住的过载信号反而被推得更高，限幅器的存在意义完全反了。
//
// 教训：验证限幅器必须**逐点比较 f(x) 与 x**（看它是否在恒等线之下），
// 而不能只看"边界条件是否满足"。边界条件全对的函数照样可以到处越界。
// TestSoftClipNeverAmplifies 就是为此写的。
//
// --------------------------------------------------------------------------
// 为什么用真的 math.Tanh 而不是多项式近似
//
// 起初想用多项式省开销，但推导正确的多项式近似（在膝盖处 C¹、
// 在满幅附近又足够平）需要至少五次，还要处理越界，代码复杂度远超收益。
// 而 math.Tanh 在 Go 里对 |x| 较小的区间走的是快速路径，
// 且本函数在**默认路径（不开音效）上根本不会被调用**（见 Chain 的快速路径），
// 只在用户明确开了 EQ/混响之后才参与运算 —— 这点开销完全可接受。
func softClip(x float64) float64 {
	// NaN 兜底：任何 NaN 进入输出都会污染声卡缓冲
	//（见 effects_reverb.go 的 clamp01 对同类问题的说明）
	if math.IsNaN(x) {
		return 0
	}
	// ±Inf 也要挡住：tanh 本身能处理，但这里提前返回更明确，
	// 也避免 abs 变成 +Inf 之后再参与运算。
	if math.IsInf(x, 0) {
		if x > 0 {
			return 1
		}
		return -1
	}

	abs := x
	neg := false
	if abs < 0 {
		abs = -abs
		neg = true
	}
	if abs <= softClipThreshold {
		return x
	}

	shaped := softClipThreshold + softClipInvRange*math.Tanh((abs-softClipThreshold)/softClipInvRange)

	if neg {
		return -shaped
	}
	return shaped
}

// binaryPut16 是小端写入的薄封装。
//
// 为什么不 import encoding/binary：本文件（含 EQ/空间/混响三块）是
// 音频回调的热路径，保持依赖面最小便于审查。而且这里的写法和
// engine.go 里 applyGainRampS16 的手写小端读写是同一套约定，
// 用同一套更不容易出错。
func binaryPut16(b []byte, v uint16) {
	b[0] = byte(v)
	b[1] = byte(v >> 8)
}
