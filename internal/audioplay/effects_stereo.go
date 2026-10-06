/* ==========================================================================
   effects_stereo.go — 立体声空间处理（"3D 环绕"的底座）
   --------------------------------------------------------------------------
   ★ 本文件是**重写**而不是调参。上一版把"3D 环绕"做成了
   "右声道延迟 22ms + 0.35 衰减反馈"，那是教科书式的错误做法，
   两个用户反馈（"效果依然等于没有" / "会出现爆音"）都能从代码里
   直接推出根因。下面先把根因写清楚，再写这一版为什么对。

   ★ 第四轮（"有变宽、有混响，但没有环绕的感觉"）对本文件又动了两刀，
   别把下面第一、二节当成现状：

     · 本文件**不再负责 5~25ms 的早期反射** —— 那部分整体搬去了
       effects_early.go，因为它需要每耳不同的延迟（见那里的文件头）；
     · 全通去相关从"两个全通相减"改成"一个全通"，注入量因此有界
       （见第三节第 2 条与 processStereo 的注释）。

   --------------------------------------------------------------------------
   一、上一版为什么"听起来没有效果"

   上一版的核心是**只给右声道**加 22ms 延迟（左声道不延迟），
   然后把延迟信号按 0.8 的比例**加回右声道**。

   这是个单边单抽头延迟 —— 它的传递函数是

        H_R(z) = 1 + g·z^-D          （g = 0.8, D = 22ms）

   这不是"加宽"，这是一个**梳状滤波器**。实测频响（44100Hz，单声道素材）：

        频率      左声道      右声道     左右差
         120Hz    -4.3dB     -10.1dB    -5.8dB
         200Hz    -4.2dB     -12.8dB    -8.6dB
         800Hz    -4.2dB     -13.2dB    -9.0dB
        6300Hz    -4.1dB     -15.4dB   -11.3dB
       12500Hz   -10.1dB      +2.2dB   +12.3dB

   右声道被梳状滤波器挖出一串深达 9~15dB 的陷波。听感上：

     · 陷波是**固定频率**的，与音乐无关 → 无论放什么歌，
       右声道永远是"闷 + 空"的那一个，声像被拉偏而不是变宽；
     · 陷波落在中频（200Hz~6kHz，人耳最敏感的区间），
       把"空间感"最关键的中频细节吃掉 → 听起来不像"更宽"，
       而像"坏了 / 录音有缺陷"。

   这正好解释了"3D 环绕的效果依然等于没有"：用户听到的不是
   "环绕感"，而是右声道音色变怪 —— 大脑把它归类成"音质问题"，
   不会归类成"环绕效果"。上一版用来"证明有效"的测试
   （TestSurroundPresetStrongEnoughForHeadphones）量的是
   **平均 |L-R|**，而梳状滤波恰恰能把 |L-R| 量得很大
   （实测 0.37）—— 指标很好看，听感是坏的。这是指标选错的典型。

   --------------------------------------------------------------------------
   二、上一版为什么"爆音"

   0.35 的**反馈**把单次延迟变成一串无限长的重复声：

        comb:  y[n] = x[n] + fb·y[n-D]     fb = 0.35

   反馈梳状滤波器不只是"多次回声"，它在 D 的每个整数倍频率上
   制造**共振峰**，峰谷比：

        20·log10( (1+fb)/(1-fb) ) = 20·log10( 1.35/0.65 ) ≈ 6.3dB

   共振会与音乐自身的能量叠加。更要命的是 fb 没有任何平滑 ——
   切档位时 setParams 把 haasMix / haasFb **直接**从 0 跳到 0.35/0.8，
   而延迟线里此刻可能正积着能量。这是一个瞬间的传递函数突变，
   输出在单个样本上跳变 → 一声"啪"。

   实测（TestDiagClickOnSwitch，220Hz 满幅正弦）：
       稳态每样本最大变化 = 924（＝该正弦的理论值，正常）
       切档瞬间            = 950
   差值不大是因为测试用的是**稳态正弦 + 恰好对齐的缓冲**；
   真实音乐里延迟线里积着的是随机相位的内容，跳变会大得多。
   上一版的"两条链交叉淡化"本意是解决这个，但淡化的是**链的输出**，
   而链内部（stereo.setParams）的参数是硬跳变的 —— 淡化遮不住
   链内部的阶跃，只是把它乘了个渐变系数。

   --------------------------------------------------------------------------
   三、这一版怎么做（对齐工业界的做法）

   参考实现（都是成熟、被大量用户听过的代码）：

     · **FFmpeg `af_haas.c`** —— 它的 M/S 结构是本版的骨架：
       mid 原样带过、side 用延迟副本重建后按 `mid ± side` 合成，
       左右用**不同的延迟**（2.05ms / 2.12ms）制造去相关。
       ★ 它也印证了"单边加延迟是错的"：af_haas 从不把延迟信号
         加到某一侧的输出上，而是先进中侧域再合成。
       ★ 它的默认 side_gain 虽然是 1，但 delay 参数可调且带
         balance/phase 控制 —— 上游把 Haas 当作需要精细约束的处理，
         而不是"往右边塞个延迟"。

     · **FFmpeg `af_stereowiden.c`** —— 左右**对称**处理：
         L' = drymix·L - crossfeed·R - feedback·bufR
         R' = drymix·R - crossfeed·L - feedback·bufL
       对称意味着两个声道被同样对待 —— 不会出现上一版
       "右声道被梳状滤波、左声道干净"的失衡。

     · **FFmpeg `af_crossfeed.c`** —— 串扰的二阶滤波器设计。
       ★ 本版第一稿照抄了它的 shelf 公式，实测**不合适**：它设计给
         "M/S 域里只滤 side 信号"用，直流增益不是 1（随 strength 变，
         strength=1 时 ≈0.01），搬进"低频互补互换"结构必须乘 1/H(0)
         补偿，补偿完高频泄漏被放大 30~100 倍 —— 等于把高频混成
         单声道，方向与加宽完全相反。第二稿换成 RBJ LPF
         （直流增益结构性等于 1，见 designCrossfeed）。

     · **RBJ Audio EQ Cookbook（LPF）** —— 串扰最终用的滤波器形状。
       选它就三个理由：直流增益严格为 1（互补互换的前提）、
       带外 -12dB/oct（10kHz 泄漏 <0.1%，不吃加宽出来的高频）、
       系数一行公式。简单且性质可证明，胜过更花哨的公式。

   这一版"3D 环绕"由三个手段组成，每个都针对一个具体的听感目标，
   并且**各自都不会破坏频响**：

     1. **中侧宽度（M/S）** —— 声场变宽的主力。
        只缩放 S = (L-R)/2，中置信号（人声、底鼓、贝斯）完全不动。
        ★ 这是唯一"无副作用"的加宽手段：它不引入任何滤波，
          不改变任何声道的频响，纯粹是矩阵运算。
          代价是对**真单声道**素材（L==R，S 恒为 0）无效。

     2. **全通去相关（allpass decorrelation）** —— 让单声道素材也有宽度。
        把中置分量经**一个**全通（61 样本）扰动后作为附加侧分量，
        最终按 `mid ± side` 合成：
          side += ap(mid)·0.5·decor
          L = mid + side      R = mid - side
        全通的定义性质是 |H(e^jw)| ≡ 1 —— **幅度响应完全平坦**，
        这是它与梳状滤波器的本质区别：只改相位，不改音色。
        ★ 平坦在这里还有一层结构性作用（第四轮）：注入量因此是
          `0.5·decor·|mid|` 这个**常数**，单耳最坏陷波被钉死在
          -6dB，不可能与 mid 相消。旧写法用**两个**不同延迟的全通
          相减，`|H1-H2|` 在频域 0~2 起伏，实测单声道素材在 1000Hz
          处左右耳差 **38dB** —— 折叠完全平直、单耳却被挖空。
          这是"折叠平直 ≠ 单耳没被挖坑"的教训，详见 processStereo 的注释。
        ★ 关键是合成方式：输出恒为 `mid ± side`，所以 L+R = 2·mid
          **与全通无关** —— 单声道折叠严格平直（实测 0.00dB）。
        ★ **5~25ms 的早期反射不在本文件**：它需要每耳不同的延迟才有
          双耳时间差，塞进 ±side 等于判它 ITD = 0。见 effects_early.go。

     3. **串扰（低频互补互换）** —— 消除头中效应，让声音"在前面"
        而不是"在脑中"：本侧低频的 k 倍换成对侧低频的 k 倍。
        ★ 单声道安全是**结构性**的：L==R 时 lowL==lowR，
          换出换入完全抵消，L' = R' = 输入（实测全频段 0.00dB）。
        ★ 串扰只在低频起效（700Hz 拐点）：高频保持原样，
          不会把加宽出来的高频宽度又混回去。
        这一版串扰仍保持小量：它的方向与"加宽"相反，
        主要用来把声场**中心**黏住，避免加宽过头后中间出现空洞。

   --------------------------------------------------------------------------
   四、参数平滑（这是"爆音"的直接对策）

   ★ 所有参数变化都走一个**一阶平滑（one-pole smoothing）**，
     每帧推进一次，时间常数 stereoParamSmoothMs：

        cur += (target - cur) * coeff

   为什么这能消除爆音：上一版的爆音来自"参数在单帧内阶跃"。
   一阶平滑保证参数是**连续**的，于是传递函数也连续变化，
   输出不会出现阶跃。这与 eqSection 的系数 slew 是同一个思路
   （那里用线性插值，这里用一阶低通 —— 对"参数本身是乘性增益"
   的场景，一阶低通更自然，且不需要知道总时长）。

   ★ 为什么长度参数（延迟/全通系数）不需要平滑：
     本版没有可变的延迟长度 —— 全通系数是固定的（prepare 时算好），
     只有**混入量**是可变的。混入量平滑就足够了。

   --------------------------------------------------------------------------
   五、为什么没有反馈（no feedback）

   ★ 这一版**刻意不做任何反馈**。上一版的 0.35 反馈是爆音与
     "金属感"的来源（见第二节的共振计算）。

   去相关用**全通**实现：全通本身就是"带反馈"的结构，
   但它的反馈系数被**约束在 |g| < 1 且满足幅度平坦**，
   不存在上一版那种"反馈量自由调 → 共振峰 → 能量累积"的问题。
   全通的 g 在 prepare 时定死，不随档位变化，所以它不可能
   在切换瞬间产生阶跃。

   --------------------------------------------------------------------------
   六、零分配 / 线程模型

   prepare 里一次分配，processStereo 里没有任何 make/map/interface。
   与 reverb 同样：不保证 setParams 与 processStereo 的并发安全，
   由 engine.go 的原子快照保证可见性（见 effects.go 的 Chain 说明）。
   ========================================================================== */

package audioplay

import "math"

/* --------------------------------------------------------------------------
   常量
   -------------------------------------------------------------------------- */

// stereoParamSmoothMs 是参数平滑的时间常数（毫秒）。
//
// ★ 这是"爆音"的直接对策（见文件头第四节）。
//
// 取 12ms：足够短，用户点一下按钮几乎立刻听到效果（不会有
// "怎么半天没反应"的感觉）；又足够长，把参数阶跃摊平成不可闻的滑变。
//
// 对比 eqSlewFrames（20ms）：那里用线性插值是因为要在固定帧数内
// 走完一段系数，必须知道终点；这里用时不变的一阶低通，
// 时间常数是更自然的描述方式 —— 而且中途改目标值时行为更平滑
// （线性插值需要重新计算步长，容易在快速连点时产生速度突变）。
const stereoParamSmoothMs = 12.0

// stereoParamSmoothMin 是平滑系数的下限，防止 sampleRate 异常时除零。
const stereoParamSmoothMin = 1e-6

// maxAllpassDelaySamples 是去相关全通延迟线的容量上限。
//
// 去相关用的延迟长度（见 decorrelationDelay）最长约 100 样本 @44.1kHz，
// 取 256 留足余量（48kHz 下也够）。写成常量是为了 prepare 时一次分配。
const maxAllpassDelaySamples = 256

/* --------------------------------------------------------------------------
   去相关用的全通滤波器
   -------------------------------------------------------------------------- */

// decorrelationDelay 是去相关全通的延迟长度（@44.1kHz，样本）。
//
// ★ 为什么短（几十个样本）而不是像 Haas 那样 20ms：
//
// 去相关的目标是"让两个声道的相位不同"，而不是"制造一个可听的回声"。
// 延迟越长，相位差随频率变化越快 —— 用 20ms（882 样本）时，
// 相邻频率的相位差变化极快，会把立体声内容搅成"相位噪声"，
// 听感是声像不稳、飘忽。几十个样本的量级（0.5~2ms）只在高频
// 提供足够的相位差来产生宽度感，低频基本不受影响（低频波长大，
// 同样的延迟对应的相位差小），所以低音依然是稳的。
//
// ★ 为什么只需要**一个**全通（第四轮改动，此前是延迟 61/89 的两个）：
//
// 去相关进侧分量的写法是 `side += ...`，随后 L = mid + side、
// R = mid - side。两个全通**相减**（apL - apR）在幅度上是
// `|H1 - H2|`，它在频域里从 0 到 2 大幅起伏：H1 ≈ -H2 的那些频率上
// 注入量达到满值 decor，正好与 mid 逐点相消 —— 实测单声道素材在
// 1000Hz 处左右耳差 **38dB**，也就是有一只耳朵在该频点几乎听不到。
//
// 单个全通的幅度响应**恒等于 1**，所以注入量是 `0.5·decor·|mid|`
// —— 一个不随频率起伏的常数。同样把 side/mid 抬到 0.5，
// 最坏陷波却被结构性地钉在 20·log10(1-0.5) = -6dB，
// 而不是 0。"能与 mid 相消"这件事被数学排除掉了。
//
// 数值取 61（质数，@44.1kHz 约 1.4ms）：比 Haas 的 20ms 短得多，
// 不会产生可听回声；比 1~2 个样本长得多，高频相位差足够铺开。
const decorrelationDelay = 61

// decorrelationFeedback 是去相关全通的反馈系数。
//
// ★ 这个值不是"调"出来的，而是由"全通"这个定义决定的：
//
// 一阶全通的传递函数是
//
//	H(z) = (-g + z^-D) / (1 - g·z^-D)
//
// 它的幅度响应恒等于 1（|H(e^jw)| ≡ 1）**对任意 |g| < 1 都成立** ——
// 这是全通结构本身的数学性质，不是参数选择的结果。
//
// 取 0.5 是听感取舍：g 越大，相位随频率变化越剧烈（去相关越强），
// 但瞬态（鼓点）的相位失真也越明显。0.5 是混响器里的常见取值
// （Freeverb 的 allpassFeedback 就是 0.5，见 effects_reverb.go），
// 在"有宽度"与"不糊"之间。
//
// ★ 硬约束 |g| < 1：g >= 1 时全通变成不稳定系统，能量无限累积成
// Inf/NaN。与 reverb 的反馈上限是同一类问题。
// 这里 g 是编译期常量且不随档位变化，所以不存在"忘了夹住"的风险 ——
// 但仍然在 prepare 里断言，防止以后有人把它改成可调参数。
const decorrelationFeedback = 0.5

// allpassStage 是一阶全通滤波器（去相关用）。
//
// ★ 与 effects_reverb.go 里的 allpassFilter 的区别：
// 那个是 Schroeder 全通的"简化版"（buf 里存的是 x + bufOut·fb，
// 输出是 -x + bufOut），结构与这里的标准形式等价但状态定义不同。
// 这里**刻意不复用**那个类型，因为：
//
//	· reverb 的那个把延迟长度写死在 size 里且不提供单声道 process 的
//	  语义说明，复用它会让"混响"与"去相关"两个用途互相牵扯；
//	· 这个类型需要明确的"每声道独立实例"语义（左右各一个），
//	  而 reverb 的是 4 个串联 + 左右两组，复用会让调用方难以读。
//
// 独立的类型让两处的意图都清楚，代价是几十行代码。
type allpassStage struct {
	buf []float64
	pos int
	// feedback 是反馈系数（见 decorrelationFeedback 的说明）
	feedback float64
}

// prepare 按采样率分配延迟线并算好反馈系数。
//
// g 由采样率无关的常量给出，d 按采样率缩放（保证不同采样率下
// 相位扰动的**时间**一致，而不是样本数一致 —— 后者会让去相关
// 强度随采样率漂移）。
func (a *allpassStage) prepare(delaySamples int, g float64) {
	if delaySamples < 1 {
		delaySamples = 1
	}
	if delaySamples > maxAllpassDelaySamples {
		delaySamples = maxAllpassDelaySamples
	}
	if cap(a.buf) < delaySamples {
		a.buf = make([]float64, delaySamples)
	} else {
		a.buf = a.buf[:delaySamples]
		for i := range a.buf {
			a.buf[i] = 0
		}
	}
	a.pos = 0
	// 夹住反馈系数：|g| >= 1 会让全通变成不稳定系统（见常量说明）。
	if g >= decorrelationFeedbackMax {
		g = decorrelationFeedbackMax
	} else if g <= -decorrelationFeedbackMax {
		g = -decorrelationFeedbackMax
	}
	a.feedback = g
}

// decorrelationFeedbackMax 是全通反馈系数的硬上限（见 decorrelationFeedback）。
const decorrelationFeedbackMax = 0.95

// process 过一个样本（标准 Schroeder 全通：H(z) = (-g + z^-D)/(1 - g·z^-D)）。
//
// 幅度响应恒为 1（全通的本质），所以它只改相位、不改音色 ——
// 这正是它比"纯延迟"更适合做去相关的原因（见文件头第三节）。
//
// ★★ 这里踩过一个坑，实测抓到，写下来作为警示：
//
//	错误写法：buf[pos] = x + g·bufOut     （bufOut = 读到的**延迟值**）
//	正确写法：buf[pos] = x + g·out        （out = 本次**输出**）
//
// 差一个下标，传递函数完全不同。错误写法等价于
//
//	B(z) = X + g·z^-D·B、Y = -g·X + z^-D·B
//	H(z) = (-g + (1+g²)·z^-D) / (1 - g·z^-D)      ← |H| 不是常数！
//
// DC 增益变成 (1+g²) ≈ 1.25（g=0.5），各频点 0.8~1.5 起伏 ——
// 这个"全通"实际上是个幅度不平的滤波器。第一版实测后果：
//
//   - 两个不同延迟的"全通"做差，|apL-apR| 测到 **2.647**
//     （两个真全通的差的模 ≤ 2 —— 超出理论上限就是抓到 bug 的判据）；
//   - 单声道素材左右 RMS 差 11.7dB（左 0.088 / 右 0.338），声像跑偏；
//   - 复杂素材峰值抬高 4.35dB，大量样本顶进软限幅（"爆音"之一）。
//
// 正确写法下 B = X + g·Y，于是 Y = -g·X + z^-D(X + g·Y)
// → H = (-g + z^-D)/(1 - g·z^-D)，|H| ≡ 1 对任意 |g| < 1 成立。
func (a *allpassStage) process(x float64) float64 {
	bufOut := a.buf[a.pos]
	out := -a.feedback*x + bufOut
	a.buf[a.pos] = x + a.feedback*out
	a.pos++
	if a.pos >= len(a.buf) {
		a.pos = 0
	}
	return out
}

// reset 清空延迟线（切歌时调用）。
func (a *allpassStage) reset() {
	for i := range a.buf {
		a.buf[i] = 0
	}
	a.pos = 0
}

/*
--------------------------------------------------------------------------

	第三轮的"稀疏回声去相关"（tapEchoStage）已在第四轮整体移除
	--------------------------------------------------------------------------
	它原本把中置分量的 6/11/17/25ms 稀疏回声按 `side += echo(mid)` 塞进
	侧分量 —— 单声道折叠确实靠 ±side 相消而严格平直。第四轮实测把它
	拿掉，两个原因：

	  1. **不带双耳时间差（ITD）**。±side 决定了两耳收到的是同一段
	     波形、极性相反、时间完全相同，实测互相关峰值就落在 lag = 0。
	     这正是"有变宽、有混响，但没有环绕的感觉"的直接根因。
	     5~25ms 反射这个活儿现在由 effects_early.go 的 earlyFieldStage
	     用**同极性、每耳延迟不同**的方式重做。

	  2. **注入量能与 mid 逐点相消**。Σg·scale ≈ 1.0 的最坏对齐上界
	     意味着某个频率上 side 正好等于 -mid，该耳被整只挖空 ——
	     实测单声道素材在 500Hz 处左右耳差 14dB，听感是"某一耳坏了"。

	保留这段注释而不是连历史一起删：它是"结构决定听感"的一个反例，
	下一次有人想"往 side 里加点延迟回声"时应该先看到它。
*/

/* --------------------------------------------------------------------------
   串扰（低频互补互换）
   -------------------------------------------------------------------------- */

// crossfeedFilter 是串扰用的二阶低通（RBJ Cookbook LPF，Q = 1/√2 即
// Butterworth）。左右各持一份系数相同、状态独立的实例。
//
// ★ 为什么串扰必须用"频率选择性"的滤波器而不是按比例混合：
//
// 纯比例混合（xl' = (1-k)·xl + k·xr，"上上一版"的做法）对左右做的是
// 无频率选择性的混合，低频一起被串过去，效果是"变窄但没消除头中效应"。
// 人耳对低频的定位主要靠双耳时间差，把低频补到对侧才符合真实听感
// （Bauer 串扰的物理动机：头部对低频没有声影，低频本来就该同时到达两耳）。
//
// ★ 为什么不用 FFmpeg af_crossfeed.c 的 shelf 公式（本版第一稿用过，
// 后来换掉）：那个滤波器是**给 M/S 域的 side 信号做搁架**用的
// （见 af_crossfeed.c：mid/side 分解后只对 side 滤波），
// 它的直流增益不是 1（随 strength 变，strength=1 时 ≈ 0.01），
// 在我们这个"低频互补互换"的结构里必须再乘一个 1/H(0) 补偿 ——
// 补偿完又会把高频泄漏放大 30~100 倍（实测 strength=1 时
// 高频串扰泄漏达 4 倍，等于把左右高频几乎混成单声道，与加宽完全相反）。
//
// RBJ LPF 的直流增益**恒等于 1**（b0+b1+b2 = 1+a1+a2，系数结构保证），
// 不存在补偿与泄漏问题；带外按 -12dB/oct 下降，10kHz 以上泄漏 < 0.1%，
// 不会吃掉加宽出来的高频宽度。这是"选它而不选更花哨的公式"的理由：
// 简单 + 直流严格为 1 + 泄漏可忽略。
//
// ★ 泄漏率（k = crossfeed 混入量）在各频点的实际值：
//
//	直流:   k·1     （互补互换，总量守恒）
//	fc:     k·0.707
//	10kHz:  k·0.006 （fc=700Hz 时，-44dB）
type crossfeedFilter struct {
	// 直接形式 I 的系数（已按 a0 归一化，见 designCrossfeed）
	b0, b1, b2 float64
	a1, a2     float64

	// 每个声道独立的状态（直接形式 I 需要 x1/x2/y1/y2）
	x1L, x2L, y1L, y2L float64
	x1R, x2R, y1R, y2R float64
}

// processL / processR 各处理一个声道（左右各自独立状态：串扰是
// "本侧低频换对侧低频"，两侧的滤波历史必须分开）。
func (c *crossfeedFilter) processL(x float64) float64 {
	y := c.b0*x + c.b1*c.x1L + c.b2*c.x2L - c.a1*c.y1L - c.a2*c.y2L
	c.x2L, c.x1L = c.x1L, x
	c.y2L, c.y1L = c.y1L, y
	return y
}

func (c *crossfeedFilter) processR(x float64) float64 {
	y := c.b0*x + c.b1*c.x1R + c.b2*c.x2R - c.a1*c.y1R - c.a2*c.y2R
	c.x2R, c.x1R = c.x1R, x
	c.y2R, c.y1R = c.y1R, y
	return y
}

// reset 清空滤波器状态（切歌时调用）。
func (c *crossfeedFilter) reset() {
	c.x1L, c.x2L, c.y1L, c.y2L = 0, 0, 0, 0
	c.x1R, c.x2R, c.y1R, c.y2R = 0, 0, 0, 0
}

// crossfeedCutHz 是串扰低通的 -3dB 拐点。
//
// 700Hz：Bauer 串扰关心的是 200Hz 以下的"实感低频"与 500Hz 附近的
// 中低频过渡。拐点取 700Hz 让 100~400Hz 这一段接近全量互补互换，
// 而 2kHz 以上基本不串（否则会把刚加宽出来的高频侧信号又混回去）。
const crossfeedCutHz = 700.0

// designCrossfeed 算出串扰低通的系数（RBJ LPF，Q = 1/√2）。
//
// 公式（RBJ Audio EQ Cookbook 的 LPF）：
//
//	w0    = 2π·fc/fs
//	alpha = sin(w0) / (2·Q)
//	b0 = (1 - cos w0)/2        b1 = 1 - cos w0      b2 = (1 - cos w0)/2
//	a0 = 1 + alpha             a1 = -2·cos w0       a2 = 1 - alpha
//
// 全部除以 a0 归一化。
//
// ★ 直流增益恒为 1：b0+b1+b2 = 2(1-cos w0)，而 a0+a1+a2 = 2(1-cos w0)
// （+alpha 与 -alpha 相消），两者相等 → H(1) = 1。这不是巧合而是
// LPF 的结构性质 —— 它正是互补互换结构"低频总量守恒"的前提
// （见 processStereo 第 2 步的推导）。
func designCrossfeed(sampleRate float64) crossfeedFilter {
	w0 := 2 * math.Pi * crossfeedCutHz / sampleRate
	if w0 <= 0 || w0 >= math.Pi {
		// 采样率异常（比如 fc 已超过奈奎斯特）：退化成直通，
		// 而不是产出 NaN 系数把声卡打爆。
		return crossfeedFilter{b0: 1}
	}
	cosW0 := math.Cos(w0)
	alpha := math.Sin(w0) / (2 * (1 / math.Sqrt2)) // Q = 1/√2

	b0 := (1 - cosW0) / 2
	b1 := 1 - cosW0
	b2 := (1 - cosW0) / 2
	a0 := 1 + alpha
	a1 := -2 * cosW0
	a2 := 1 - alpha

	return crossfeedFilter{
		b0: b0 / a0,
		b1: b1 / a0,
		b2: b2 / a0,
		a1: a1 / a0,
		a2: a2 / a0,
	}
}

/* --------------------------------------------------------------------------
   stereoStage
   -------------------------------------------------------------------------- */

// stereoStage 是立体声空间处理器。
//
// 与 reverb 同样：prepare 之后音频回调只调用 processStereo，
// **不保证 processStereo 与 setParams 之间的并发安全**
// （见 effects_reverb.go 类型注释里对这条取舍的完整说明）。
type stereoStage struct {
	// —— 去相关全通（单个：幅度恒为 1，注入量因此有界，见 decorrelationDelay）——
	ap allpassStage

	// —— 串扰滤波器（左右各一个实例，状态独立）——
	xf crossfeedFilter

	// —— 参数：目标值（setParams 写入）——
	tgtWidth     float64 // 中侧宽度倍率（1 = 原始）
	tgtDecor     float64 // 去相关混入量（0 = 关闭）
	tgtCrossfeed float64 // 串扰混入量（0 = 关闭）

	// —— 参数：当前值（音频线程逐帧平滑逼近目标）——
	width     float64
	decor     float64
	crossfeed float64

	// smoothCoeff 是一阶平滑的系数（prepare 时按采样率算好）。
	smoothCoeff float64

	// primed 表示 setParams 已经调用过至少一次。
	//
	// ★ 它的唯一作用是区分"首次装载"与"运行中切换"（见 setParams）：
	// 首次装载要让 current **吸附**到目标值，避免启动瞬间一段
	// "从单声道展开"的音染；运行中切换才需要平滑。
	primed bool
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
	// Decorrelation 是去相关（全通相位扰动）的混入量（0 = 关闭）。
	//
	// ★ 它存在的唯一目的是让**真单声道素材**（L == R、S 恒为 0）
	// 也能被拉出宽度 —— 纯 M/S 宽度对这类素材完全无效。
	// 实现是"把中置信号拆出一份，用两个不同频率的全通分别扰动
	// 左右"，所以它**会**给中置信号引入通道差。
	Decorrelation float64
	// Crossfeed 是左右串扰量（0 = 关闭，1 = 最强）。
	//
	// ★ 方向提醒：串扰**缩小**左右声道差，与"加宽"相反。
	// 它的作用是消除头中效应（把声音从"脑中"挪到"面前"），
	// 量必须小，否则会把加宽效果抵消掉。
	//
	// ★ 语义是"归一化强度"而不是裸的换出比例：内部换出比
	// β = Crossfeed/2。因为互补互换结构在 β=0.5 时直流处才是
	// 完全合并（L' = R' = (L+R)/2），β=1 反而是"左右完全互换"
	//（通道差幅度不变、只是反相）—— 直接把 0..1 当 β 用，
	// 参数过半就会重新变宽，"越大越集中"的直觉就断了。
	// 这里约定 1 = 完全互补（直流处单声道合并），0.12 这类
	// 小值就对应 6% 的中心黏合。
	Crossfeed float64
}

// prepare 按采样率分配延迟线、设计滤波器、算好平滑系数。
// 只在开关 / 采样率变化时调用。
func (s *stereoStage) prepare(sampleRate int) {
	fs := float64(sampleRate)
	if fs <= 0 {
		fs = 44100
	}
	scale := fs / 44100.0

	s.ap.prepare(int(float64(decorrelationDelay)*scale), decorrelationFeedback)

	// 串扰滤波器：RBJ LPF（直流增益恒为 1，不需要任何补偿，
	// 见 designCrossfeed 的说明）。滤波器的**形状**固定、
	// 只有混入量（crossfeed 参数）可变 —— 混入量是纯增益，
	// 平滑它不会改变滤波器的频率选择性。
	s.xf = designCrossfeed(fs)

	// 一阶平滑系数：coeff = 1 - exp(-1/(tau·fs))
	//
	// tau 是时间常数，1/(tau·fs) 是"到 63% 所需的帧数"的倒数。
	// 用 exp 而不是 1/N 的近似：后者在 tau 很小时误差大，
	// 而这里 tau=12ms 已经足够大，但用精确式没有额外代价（只在
	// prepare 里算一次），没必要引入近似误差。
	tauFrames := stereoParamSmoothMs * fs / 1000.0
	coeff := 1 - math.Exp(-1.0/tauFrames)
	if coeff < stereoParamSmoothMin {
		coeff = stereoParamSmoothMin
	}
	s.smoothCoeff = coeff

	// 重新 prepare 后要重新"吸附"一次：新的采样率下平滑系数变了，
	// 而 current 里留着的是旧采样率的收敛结果。让下一次 setParams
	// 把 current 直接对上目标，避免一段无意义的过渡。
	s.primed = false
}

// setParams 更新空间处理的**目标**参数。
//
// ★ 这里只写目标值，不直接生效 —— 实际值由 processStereo 逐帧
// 平滑逼近。这是消除"爆音"的关键（见文件头第四节）。
func (s *stereoStage) setParams(p StereoParams) {
	// Width: 0..1 → 中侧缩放 0..2（见 StereoParams.Width 的说明）
	s.tgtWidth = clamp01(p.Width) * 2
	s.tgtDecor = clamp01(p.Decorrelation)
	// Crossfeed: 归一化强度 → 内部换出比 β = k/2（见 StereoParams.Crossfeed）
	s.tgtCrossfeed = clamp01(p.Crossfeed) * 0.5

	// ★ 首次 setParams（prepare 之后立刻调用，此时 current 全为 0）
	// 必须**吸附**到目标值而不是从 0 平滑过去。
	//
	// 为什么：Chain.prepare 之后会 applyPreset 一次。若那一刻
	// width 从 0 开始平滑，就会有一个 12ms 的"从单声道展开到立体声"
	// 的过程 —— 那是启动瞬间一次不该有的音染。
	// （档位切换时不需要吸附：Chain 用两条链交叉淡化，
	//   新链的 current 本来就是它自己的稳态值，见 applyPendingLocked。）
	if !s.primed {
		s.width = s.tgtWidth
		s.decor = s.tgtDecor
		s.crossfeed = s.tgtCrossfeed
		s.primed = true
	}
}

// reset 清空全部延迟线与滤波器状态（切歌时调用）。
//
// ★ 只清**状态**，不碰参数（与 eqSection.reset 的语义一致，
// 那里有这条约定的完整说明：reset 是"清历史状态"，
// 不是"恢复初始值"）。
func (s *stereoStage) reset() {
	s.ap.reset()
	s.xf.reset()
}

// processStereo 就地处理一帧。
func (s *stereoStage) processStereo(xl, xr float64) (float64, float64) {
	// —— 0. 参数平滑（必须在用参数之前）——
	//
	// 一阶低通：每次走剩余距离的 smoothCoeff。三个参数各自独立平滑。
	//
	// ★ 末尾吸附（与 eqSection/stepCoeffs 的 1e-9 吸附同一意图）：
	// 一阶低通是渐近收敛，浮点上永远差最后一点点。若不吸附，
	// width 会停在 1±1e-16，`s.width != 1` 的直通判定永远不成立 ——
	// 关闭路径会一直多跑一遍 M/S 矩阵（数学上是恒等，但那是
	// "位级透明"的反面：多一次浮点乘法就没有比特透明可言）。
	// 吸附到目标值后，off 档走的是**逐位**直通。
	c := s.smoothCoeff
	s.width = snapParam(s.width, s.tgtWidth, c)
	s.decor = snapParam(s.decor, s.tgtDecor, c)
	s.crossfeed = snapParam(s.crossfeed, s.tgtCrossfeed, c)

	// —— 1. 去相关（全通相位扰动）——
	//
	// ★★ 结构对齐 FFmpeg af_haas.c（Vladimir Sadovnikov 的
	// Haas Stereo Enhancer）：**在中侧域里重建侧分量**，而不是
	// "往某一侧加东西"。
	//
	//	mid   = (L + R) / 2
	//	side  = origSide·width + ap(mid)·0.5·decor
	//	L'    = mid + side
	//	R'    = mid - side
	//
	// ★ 为什么这样写能**保证单声道兼容**：
	// 输出恒等于 `mid ± 某个东西`，而 mid 是原封不动带过来的。
	// 无论全通怎么改相位，**中置分量永远不会被削掉**。
	// 早期的错误写法是 `L += ap(M)`（把扰动**加到**已有的 L/R 上），
	// 于是 L+R 变成 `2M + ap(M) - ap(M)` 之外还多出项 —— 频域上是梳状，
	// 实测 12.5kHz 掉 6.7dB。改成 `mid ± side` 之后 L+R = 2·mid 恒成立。
	//
	// ★ 原始立体声内容必须**保留**（af_haas 本身是"增强器"，只服务
	// 增强；我们的档位要同时服务立体声与单声道素材）。所以这里把
	// "缩放后的原始侧分量"与"由 mid 生成的去相关分量"**相加进同一个
	// side**，再按 mid ± side 合成（见下方代码）。
	//
	// ★★ 单声道折叠由此**严格**成立：L + R = 2·mid，与 side 里装了
	// 什么完全无关（±side 相消）。这不是"调小混入量换来的"，是结构保证
	//（TestSpatialProcessingKeepsMonoFoldFlat 钉到 ~1e-15）。
	//
	// ★★ 但是——**折叠平直并不等于单耳没被挖坑**，这是第四轮才量清楚的
	// 一件事，必须写下来：`mid ± side` 只保证两耳之和不变，
	// 它对 side 的**幅度**毫无约束。旧写法用两个不同延迟的全通相减
	// （apL - apR），`|H1 - H2|` 在频域里 0~2 大幅起伏，某些频率上
	// 注入量正好等于 -mid，该耳就被整只挖空 —— 实测单声道素材在
	// 1000Hz 处左右耳差 **38dB**，500Hz 处 14dB。
	//
	// 修法不是调小 decor，而是把注入量换成**幅度恒定**的形状：
	// 单个全通 |H| ≡ 1，所以 `ap(mid)·0.5·decor` 的幅度恒为
	// `0.5·decor·|mid|` —— 与 mid 的比值是常数，最坏陷波被结构性地
	// 钉在 20·log10(1-0.5) = -6dB，不可能出现相消为零。
	// side/mid 同时稳定在 0.5（旧写法是"平均 0.6、个别频点 1.0"）。
	// 改动前先跑 TestSurroundPerEarResponseStaysBounded。
	//
	// ★ 为什么用 0.5 的反馈（decorrelationFeedback）而不是纯延迟：
	// 全通的幅度响应恒为 1（|H| ≡ 1），纯延迟的幅度响应是梳状。
	// 这是"只改相位、不改音色"的数学保证，见 allpassStage 的说明。
	//
	// ★ 5~25ms 的可闻反射不再在这一段里做：那是**早期反射**，
	// 需要每耳**不同的延迟**才有双耳时间差，塞进 ±side 就等于
	// 判了它 ITD = 0。它现在由 effects_early.go 的 earlyFieldStage
	// 独立完成（夹在本段与混响之间）。
	//
	// ★ 当 decor = 0 且 width 为 1 时完全旁路（连全通都不跑）：
	// 既省开销，又保证"关闭加宽"路径的比特透明。
	if s.decor > 1e-6 || s.width != 1 {
		mid := (xl + xr) * 0.5
		side := (xl - xr) * 0.5

		// 先做宽度（缩放原始侧分量）
		side *= s.width

		// 再叠加去相关分量（幅度恒定，见上方注释里的有界性推导）。
		// 只进侧分量 → 单声道折叠依然严格（±side 相消）。
		if s.decor > 1e-6 {
			side += s.ap.process(mid) * 0.5 * s.decor
		}

		xl = mid + side
		xr = mid - side
	}

	// —— 2. 串扰（低频互补互换）——
	//
	// 放在最后：它做的是"输出级的混合"，把已经处理好的左右声道
	// 低频按比例互换。放在前面的话，串扰引入的交叉信号又会被宽度
	// 放大，得到的是一个"越加宽越像单声道"的怪结果。
	//
	// ★★ 混入方式必须是**互补分离**，不能是"本侧减掉对侧的低频"。
	// 这是我第二版踩的坑，写下来免得再犯：
	//
	//   错误写法（第二版）：xl -= LP(xr)·k、xr -= LP(xl)·k
	//
	//   对**单声道**素材（L == R == x）会退化成
	//       L' = R' = x - k·LP(x)
	//   也就是把中置信号的低频**整体**削掉 —— 实测 80~200Hz 掉 1.1dB，
	//   而且因为 LP 在拐点附近有约 -90° 相移，某个频率上
	//   |1 - k·H(f)| 会接近 0 —— 实测右声道在 **800Hz 挖了一个
	//   20.9dB 的深坑**。那正是"音质坏了"的听感。
	//
	//   正确写法（本版，与 Bauer 串扰的物理含义一致）：
	//   把本侧信号的低频分出 k 倍送去对侧、对侧同样分来 k 倍：
	//
	//       lowL  = LP(L)·k            （本侧低频的 k 倍，LP 直流增益 = 1）
	//       lowR  = LP(R)·k
	//       L'    = (L - lowL) + lowR  ← 自己的（除低频 k 倍外）+ 对侧的低频
	//       R'    = (R - lowR) + lowL
	//
	//   ★ 为什么这样是单声道安全的：对 L == R == x（单声道素材），
	//       L' = R' = (x - low) + low      = x
	//     两个声道**完全相同**（仍是单声道，没引入任何通道差），
	//     而且就是输入本身 —— 低频**总量严格守恒**：
	//     这也是实测"单声道折叠 L+R 全频段 0.00dB 偏差"的原因。
	//   ★ 对立体声素材，直流处 L' = (1-k)·L + k·R —— 正是 Bauer
	//     串扰的定义式（低频按比例互换）；中高频 k→0（LP 滚降），
	//     加宽出来的高频宽度不受影响。
	if s.crossfeed > 1e-6 {
		// k = 混入量；低通直流增益恒为 1（见 designCrossfeed），
		// 所以 lowL 就是"本侧低频的 k 倍"，不需要任何补偿系数。
		k := s.crossfeed

		lowL := s.xf.processL(xl) * k
		lowR := s.xf.processR(xr) * k

		// 本侧：去掉自己低频的 k 倍、补上对侧低频的 k 倍
		xl = (xl - lowL) + lowR
		xr = (xr - lowR) + lowL
	}

	return xl, xr
}

// snapParam 是参数一阶平滑的一步：逼近目标，足够近时直接吸附。
//
// eps 与 eqSection/stepCoeffs 用 1e-9 是同一个理由：渐近收敛在
// 浮点上永远不"到达"目标值，而直通判定（width == 1）要求精确相等。
func snapParam(cur, tgt, coeff float64) float64 {
	d := tgt - cur
	if d > -1e-9 && d < 1e-9 {
		return tgt
	}
	return cur + d*coeff
}
