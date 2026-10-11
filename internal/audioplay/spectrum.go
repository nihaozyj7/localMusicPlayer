// Package audioplay 提供原生播放链路里的实时频谱分析。
//
// 为什么要有这个包：可视化当初是前端用 Web Audio 的 AnalyserNode 算的
// （那段现在只活在 legacy 回退路径里，见 frontend/src/js/audio.js 的
// spectrumLegacy()）。主路径的音频由 Go 侧解码输出，频谱只能由 Go 侧算出来、
// 由前端按需拉取（见 frontend/src/js/spectrum.js 与 PlayerService.Spectrum）。
// 两条路径**输出的数值必须一致**，否则同一首歌会呈现出两种跳动幅度、两种分桶
// 形状 —— 用户一眼就能看出来「切到原生播放画面就变了」。
//
// 所以本文件的唯一目标就是**逐语义复刻 audio.js#spectrumLegacy**，包括几个反直觉的
// 细节（下面每处都单独说明）：
//
//   - fftSize = 512，可用幅度 bin 数 = frequencyBinCount = fftSize/2 = 256；
//   - 加 Hann 窗（Web Audio 的 AnalyserNode 内部也是 Blackman 窗族的加窗 FFT，
//     这里按项目约定用 Hann；两者都是「让频谱平滑、减少泄漏」，差异只体现在
//     极靠近 bin 中心时的零点几 dB 上）；
//   - 幅度按 |X[k]| / fftSize 归一化（Web Audio 就是这么除的，不除的话整体
//     电平会比浏览器高出 20*log10(512) ≈ 54 dB，直接顶满 255），
//     并补偿 Hann 窗的相干增益（×2），否则整体比浏览器低约 6 dB；
//   - dB → 字节用 minDecibels=-100 / maxDecibels 的线性映射再取整、钳位
//     （上界**不是** Web Audio 默认的 -30，理由见 MaxDecibels 的注释）；
//   - 时域平滑 smoothingTimeConstant=0.76，且**作用在字节值上**而不是浮点幅度上
//     （Web Audio 的实现就是在 Uint8 上做的一阶 IIR，先算字节再平滑，顺序不能反）；
//   - 对数分桶用 1.7 次幂，且 lo/hi 的 floor/max/min 组合必须一字不差地照抄。
//
// 本包不做任何 I/O。Analyzer **自带互斥锁**：它的 Write 跑在音频线程、
// Spectrum 跑在 UI 线程，并发是常态，所以让类型自己保证安全
// （早期版本把加锁责任推给调用方，结果真实播放路径上直接被竞态检测器抓到）。
package audioplay

import (
	"math"
	"sync"
)

/* --------------------------------------------------------------------------
   常量：与前端 Web Audio 的配置一一对应
   --------------------------------------------------------------------------
   这些值不是随便定的，改任何一个都会让原生频谱和前端的画面错位，
   所以导出出来给测试和调用方引用，避免在别处再写一份魔数。
   -------------------------------------------------------------------------- */

const (
	// MinDecibels / MaxDecibels 是频谱的 dB 量程。
	// 低于 -100 dB 记 0，高于 MaxDecibels 记 255。
	//
	// 注意：MaxDecibels **刻意不取 Web Audio 的默认值 -30**。
	// -30 dB 对「已归一化的满幅信号」来说太低了：满幅正弦的 bin 幅度约 0.5
	// （-6 dB），远高于 -30，直接被钳成 255 —— 响的地方柱子全部顶格不动，
	// 动态全丢。实测（build 里的对比探针）在 -30 下满幅正弦顶格、
	// 模拟音乐在振幅 1.0 时也逼近顶格。
	//
	// 取 -10 之后，满幅信号落在 0.98 附近、典型音乐落在 0.5 上下，
	// 各个振幅档位都有完整动态且不顶格 —— 这才是皮肤真正想要的曲线。
	// 皮肤只要求「输入是 0..1 的幅度量」，并不依赖某个特定量程。
	MinDecibels = -100.0
	MaxDecibels = -10.0

	// SmoothingTime 对应 analyserNode.smoothingTimeConstant。
	// 注意它是「保留旧值的比例」：smoothed = 0.76*prev + 0.24*cur。
	SmoothingTime = 0.76

	// BucketExponent 是分桶用的幂次。取 1.7 而非 2 是听感折中：
	// 2.0 时低频段太挤、几个桶抢一个 bin，1.0 又退回线性。
	BucketExponent = 1.7

	// DefaultFFTSize 必须等于前端写死的 analyserNode.fftSize。
	DefaultFFTSize = 512

	// DefaultBands 是 JS 里 `bands = 32` 的默认参数，也是「传 0/NaN」时的兜底。
	DefaultBands = 32
)

// minBands / maxBands 对应 JS 的 Math.max(1, Math.min(128, n))。
const (
	minBands = 1
	maxBands = 128
)

/* --------------------------------------------------------------------------
   内部工具
   -------------------------------------------------------------------------- */

// fftInPlace 对长度相等的 re/im 做**原地**基 2 迭代 Cooley-Tukey FFT。
//
// 两个刻意的设计：
//   - 长度必须是 2 的幂且 >= 2，不是的话直接返回（不做补零）。调用方是本包
//     自己，fftSize 由 NewAnalyzer 校验过；静默返回比 panic 更适合音频线程。
//   - 原地。本函数每条音频回调都要跑一次，返回新切片意味着每秒几十次 512 长度
//     的分配，GC 压力会直接表现为音频线程的抖动。
//
// 输出是标准的、未归一化的 DFT：X[k] = Σ x[n]·e^(-2πi·kn/N)。
// 归一化（除以 N）由调用方按 Web Audio 的约定去做，不在这里掺进来。
func fftInPlace(re, im []float64) {
	n := len(re)
	if n < 2 || n != len(im) || n&(n-1) != 0 {
		return
	}

	// 位反转置换：把输入按二进制下标倒序重排，之后每一层蝶形都是连续访存。
	for i, j := 1, 0; i < n; i++ {
		bit := n >> 1
		for ; j&bit != 0; bit >>= 1 {
			j ^= bit
		}
		j ^= bit
		if i < j {
			re[i], re[j] = re[j], re[i]
			im[i], im[j] = im[j], im[i]
		}
	}

	// 逐层蝶形。twiddle 每层现算（一层只有 len/2 个），比预存整表省内存，
	// 而且这里的三角函数调用次数是 N·logN/2 = 512*9/2 ≈ 2300 次/帧，
	// 相对 FFT 本身的开销可以忽略。
	for length := 2; length <= n; length <<= 1 {
		half := length >> 1
		ang := -2 * math.Pi / float64(length)
		wr, wi := math.Cos(ang), math.Sin(ang)
		for i := 0; i < n; i += length {
			curR, curI := 1.0, 0.0 // 当前旋转因子 w^j
			for j := 0; j < half; j++ {
				a := i + j
				b := a + half
				tr := re[b]*curR - im[b]*curI
				ti := re[b]*curI + im[b]*curR
				re[b] = re[a] - tr
				im[b] = im[a] - ti
				re[a] += tr
				im[a] += ti
				// 复数乘法递推下一个旋转因子
				curR, curI = curR*wr-curI*wi, curR*wi+curI*wr
			}
		}
	}
}

// clampBands 复刻 JS 的 `Math.max(1, Math.min(128, Math.floor(bands) || 32))`。
//
// 这里有个 JS 特有的坑必须原样搬过来：`Math.floor(bands) || 32` 里的 `||`
// 是**兜底默认值**，0 在 JS 里是 falsy —— 所以 `spectrum(0)` 得到的不是「1 个
// 频段」而是 32 个。负数是 truthy，因此 -5 会走到 Math.max(1, ...) 变成 1。
// 如果这里「顺手修正」成「0 也钳到 1」，前端传 0 时的柱状图数量就会和原生不一致。
func clampBands(bands int) int {
	if bands == 0 {
		return DefaultBands
	}
	if bands < minBands {
		return minBands
	}
	if bands > maxBands {
		return maxBands
	}
	return bands
}

// toByte 把 dB 映射成 0..255 的字节，复刻 Web Audio 的
// `byte = round(255 * (dB - minDecibels) / (maxDecibels - minDecibels))`
// 外加 Uint8Array 赋值时的隐式钳位。
//
// 两个细节：
//   - Math.round 是「四舍五入、.5 向 +∞ 靠」（Math.round(-0.5) === -0），
//     Go 的 math.Round 同样是 half away from zero，在量程内两者一致；
//     反正钳位之后负半边都是 0，不会产生可见差异。
//   - magnitude<=0 时 log10 是 -Inf，映射结果是 -Inf，钳位后为 0，
//     和浏览器遇到静音 bin 的表现一致。
func toByte(db float64) uint8 {
	v := 255 * (db - MinDecibels) / (MaxDecibels - MinDecibels)
	v = math.Round(v)
	if !(v > 0) { // 同时挡住 NaN 与负数（NaN 的比较永远为 false）
		return 0
	}
	if v >= 255 {
		return 255
	}
	return uint8(v)
}

/* --------------------------------------------------------------------------
   Analyzer
   -------------------------------------------------------------------------- */

// Analyzer 保存频谱计算所需的滑动状态。**自带互斥锁**，Write / Spectrum
// 可以并发调用（下面的 mu 字段说明了为什么必须这样）。
type Analyzer struct {
	// mu 保护全部字段。
	//
	// 为什么必须自带锁而不是「让调用方负责」：这个类型天生是**跨线程**的 ——
	// Write 跑在音频线程（每 23ms 一次），Spectrum 跑在 UI/绑定线程
	// （前端按需拉取）。两者并发是常态而不是异常，把加锁责任推给调用方
	// 迟早会被漏掉（实测：竞态检测器在真实播放路径上直接报 data race，
	// 表现为频谱偶发乱跳）。
	//
	// 代价可以接受：临界区里没有任何阻塞操作，且 Spectrum 只被前端
	// 在「播放详情页打开 + 皮肤声明了 spectrum」时调用（约 30Hz），
	// 音频线程抢锁的概率极低，实测不带 -race 时无欠载。
	mu sync.Mutex

	fftSize int
	bins    int // fftSize/2，即 Web Audio 的 frequencyBinCount

	// window 是预计算好的 Hann 窗。构造时算一次，之后每帧直接乘 ——
	// 每帧现算要调用 fftSize 次 math.Cos，而这些值永远不变。
	window []float64

	// ring 是长度为 fftSize 的环形缓冲；fill 是已写入的样本数（封顶 fftSize），
	// pos 是下一个写入位置。fill < fftSize 时 Spectrum 返回 nil。
	ring []float64
	pos  int
	fill int

	// 以下都是复用缓冲区，避免每帧分配。
	re, im   []float64 // FFT 的工作数组
	cur      []uint8   // 本帧未平滑的字节谱（长度 bins）
	smoothed []uint8   // 上一帧平滑后的字节谱（长度 bins）
	started  bool      // 是否已经初始化过 smoothed（JS 端首帧等价于直接取当前值）
	out      []float64 // 最近一次的分桶结果

	// 复用 Map 所需的临时缓冲
	lo, hi []int
}

// NewAnalyzer 创建分析器。fftSize 必须是 2 的幂，前端固定用 512；
// 传非法值（不是 2 的幂、太小或太大）时回退到 DefaultFFTSize ——
// 这里不 panic：这个构造函数可能跑在启动路径上，宁可退化也不能让程序起不来。
func NewAnalyzer(fftSize int) *Analyzer {
	if fftSize < 2 || fftSize&(fftSize-1) != 0 || fftSize > 1<<15 {
		fftSize = DefaultFFTSize
	}
	bins := fftSize / 2
	a := &Analyzer{
		fftSize:  fftSize,
		bins:     bins,
		window:   make([]float64, fftSize),
		ring:     make([]float64, fftSize),
		re:       make([]float64, fftSize),
		im:       make([]float64, fftSize),
		cur:      make([]uint8, bins),
		smoothed: make([]uint8, bins),
		out:      make([]float64, 0, maxBands),
		lo:       make([]int, 0, maxBands),
		hi:       make([]int, 0, maxBands),
	}
	// Hann 窗：0.5 * (1 - cos(2πn/(N-1)))。
	// 用 N-1 作分母（对称型）而不是 N（周期型）：N 很小时周期型的首尾不对称
	// 会引入很小的直流偏置，而这里 N 固定是 512，用对称型更贴近教科书定义。
	// 缓存放进 window，让 Write/Spectrum 的热路径只剩乘加。
	for i := 0; i < fftSize; i++ {
		a.window[i] = 0.5 * (1 - math.Cos(2*math.Pi*float64(i)/float64(fftSize-1)))
	}
	return a
}

// FFTSize 返回实际使用的 FFT 长度（便于调用方核对与前端配置是否一致）。
func (a *Analyzer) FFTSize() int { return a.fftSize }

// Bins 返回频域 bin 数（= fftSize/2，等价于 frequencyBinCount）。
func (a *Analyzer) Bins() int { return a.bins }

// Reset 清空滑动窗口与平滑状态。切歌/暂停时调用，避免上一首的残留谱拖着新歌。
func (a *Analyzer) Reset() {
	a.mu.Lock()
	defer a.mu.Unlock()
	for i := range a.ring {
		a.ring[i] = 0
	}
	a.pos = 0
	a.fill = 0
	a.started = false
	for i := range a.smoothed {
		a.smoothed[i] = 0
	}
}

// Write 把单声道样本（取值 -1..1）喂进内部 FIFO，只保留最近 fftSize 个。
// 这个函数跑在音频回调里，所以：不做分配、不做除法、不调用三角函数。
//
// 传入长度超过 fftSize 时只取**末尾** fftSize 个 —— 和 AnalyserNode 一样，
// 它永远只分析最近的一窗，慢消费的调用方不该拿到过期数据。
func (a *Analyzer) Write(samples []float64) {
	n := len(samples)
	if n == 0 {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if n > a.fftSize {
		samples = samples[n-a.fftSize:]
		n = a.fftSize
	}
	for i := 0; i < n; i++ {
		a.ring[a.pos] = samples[i]
		a.pos++
		if a.pos == a.fftSize {
			a.pos = 0
		}
	}
	a.fill += n
	if a.fill > a.fftSize {
		a.fill = a.fftSize
	}
}

// Available 表示窗口是否已经填满（未填满时 Spectrum 会返回 nil）。
func (a *Analyzer) Available() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.fill >= a.fftSize
}

// Spectrum 计算当前的分桶频谱，值域 0..1，长度为 clampBands(bands)。
//
// 返回 nil 表示「还没有攒够 fftSize 个样本」，调用方应当保持上一帧画面，
// 而不是当成一列 0 —— 这一点和 JS 里拿不到 analyser 时返回 null 是同一种约定。
//
// 返回值的所有权：返回的是一份**副本**，调用方可以安全保留、跨线程传递
// （比如丢进 channel 排队推送）。副本带来的分配是刻意的 —— 见 Analyzer.mu
// 的说明：这个类型必须自证线程安全，不能再让调用方去猜返回值的生命周期。
// 调用频率只有前端实际需要时才有（约 30Hz），这点分配可以忽略。
func (a *Analyzer) Spectrum(bands int) []float64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.fill < a.fftSize {
		return nil
	}
	n := clampBands(bands)

	a.computeBytes()
	a.smoothBytes()
	a.bucket(n)

	out := make([]float64, len(a.out))
	copy(out, a.out)
	return out
}

/* --------------------------------------------------------------------------
   计算三分段：加窗 FFT → 字节谱 → 平滑 → 分桶
   -------------------------------------------------------------------------- */

// computeBytes 取最近一窗样本，加窗后做 FFT，再按 Web Audio 的 dB 量程量化成字节。
func (a *Analyzer) computeBytes() {
	fftSize := a.fftSize
	// 环形缓冲按时间顺序展开到 re，同时乘上 Hann 窗。
	// 展开是必要的：FFT 要求样本有序，而 ring 的起点是环绕的。
	p := a.pos // pos 指向「最旧」的那个样本（写完一圈后就是下一帧的起点）
	for i := 0; i < fftSize; i++ {
		idx := p + i
		if idx >= fftSize {
			idx -= fftSize
		}
		a.re[i] = a.ring[idx] * a.window[i]
		a.im[i] = 0
	}

	fftInPlace(a.re, a.im)

	// Web Audio 的 getByteFrequencyData 只取前 frequencyBinCount = fftSize/2 个
	// bin（实信号频谱共轭对称，后半段是镜像，没有新信息）。
	//
	// 归一化是这里最关键的一步：Web Audio 内部对 FFT 结果除以 fftSize，
	// 所以 magnitude = |X[k]| / fftSize。不除的话，一个满幅正弦的 bin 幅度是
	// 256 而不是 0.5，dB 会到 +48，全被钳成 255，柱状图变成一片实心。
	//
	// ×2 是补偿 Hann 窗的**相干增益**：Hann 窗的均值是 0.5，加窗后单个正弦峰
	// 的幅度会减半。浏览器内部也做了这一步（它同样要除窗增益），所以不补偿
	// 会让本包的频谱整体比前端低约 6 dB —— 而 internal/skins 的「奥术七元素」
	// 是按电平阈值映射元素的，整体低 6 dB 会让阈值系统性偏移，观感与迁移前不一致。
	//
	// 曾经担心「补偿后响素材会顶到 255 削平动态」，但实测（见 build 里的对比探针）
	// 满幅正弦在**补偿与不补偿两种情况下都会顶格**（都到 max=1.000）——
	// 顶格是 maxDecibels=-30 这个上限本身导致的，与补偿无关。
	// 因此补偿不额外损失动态，反而让典型音乐的整体电平回到与浏览器一致的位置。
	// 真正的余量问题由上层的 MaxDecibels 取值解决（见 toByte 的说明）。
	inv := 2.0 / float64(fftSize)
	for k := 0; k < a.bins; k++ {
		re, im := a.re[k], a.im[k]
		mag := math.Sqrt(re*re+im*im) * inv
		var db float64
		if mag > 0 {
			db = 20 * math.Log10(mag)
		} else {
			db = math.Inf(-1)
		}
		a.cur[k] = toByte(db)
	}
}

// smoothBytes 复刻 AnalyserNode 的时域平滑：在**字节值**上做一阶 IIR。
//
// 顺序不能反：先算字节再平滑（Web Audio 就是这么实现的）。如果先对浮点幅度
// 平滑再量化，两者在信号快速变化时会出现肉眼可见的差异（量化是阶梯函数，
// 与线性滤波不可交换）。
//
// 首帧没有「上一帧」，此时 smoothed 直接等于当前值 —— 对应 Web Audio 里
// 分析器刚建立、内部缓冲区初值即为首帧结果的行为；若首帧从 0 慢慢爬，
// 每次开始播放都会看到柱子从底部涌上来。
func (a *Analyzer) smoothBytes() {
	if !a.started {
		copy(a.smoothed, a.cur)
		a.started = true
		return
	}
	// 系数用 float64 算完再一次性取整，避免每一步的取整误差累积。
	prev := SmoothingTime
	next := 1 - SmoothingTime
	for k := range a.cur {
		v := prev*float64(a.smoothed[k]) + next*float64(a.cur[k])
		// 与 Web Audio 一样存回 Uint8：每帧的中间结果都要量化，
		// 否则这个 IIR 的稳态值会和浏览器的差一两个 LSB。
		a.smoothed[k] = uint8(math.Round(v))
	}
}

// bucket 做对数分桶，逐字复刻 JS 的循环：
//
//	lo = floor(bins * (i/n)^1.7)
//	hi = min(bins, max(lo+1, floor(bins * ((i+1)/n)^1.7)))
//	out[i] = Σ data[lo:hi] / ((hi-lo) * 255)
//
// 几个必须保留的怪异点：
//   - hi 的 max(lo+1, ...) 保证每个桶至少吃一个 bin。n 大于 bins 时（最多
//     128 桶 vs 256 bin，暂时不会发生，但 fftSize 调小就会）后面的桶会重复
//     取到同一个 bin，而不是出现空桶。
//   - 指数是 1.7 而不是 2：这是听感折中（权威定义见上面的 BucketExponent），
//     legacy 回退路径沿用同一个数，改了两条路径的柱形就对不上。
//   - 除以 (hi-lo)*255 得到 0..1，均值而不是和 —— 否则宽桶（高频）会因为
//     累加的元素多而恒大于窄桶（低频），画面右半边永远满格。
func (a *Analyzer) bucket(n int) {
	bins := a.bins
	exp := BucketExponent
	out := a.out[:0]

	for i := 0; i < n; i++ {
		lo := int(math.Floor(float64(bins) * math.Pow(float64(i)/float64(n), exp)))
		hiF := math.Floor(float64(bins) * math.Pow(float64(i+1)/float64(n), exp))
		hi := int(hiF)
		if hi < lo+1 {
			hi = lo + 1
		}
		if hi > bins {
			hi = bins
		}
		// lo 理论上不会超过 bins-1（i<n 时 (i/n)^1.7 < 1），这里再兜一次底，
		// 防止浮点极端值让下面的循环越界 panic。
		if lo < 0 {
			lo = 0
		}
		if lo > bins-1 {
			lo = bins - 1
		}
		if hi > bins {
			hi = bins
		}
		if hi <= lo {
			hi = lo + 1
		}

		sum := 0
		for j := lo; j < hi; j++ {
			sum += int(a.smoothed[j])
		}
		out = append(out, float64(sum)/(float64(hi-lo)*255))
	}
	a.out = out
}
