/* ==========================================================================
   silence.go — 头/尾静音检测（「跳过无声片段」）
   --------------------------------------------------------------------------
   需求：「跳过音乐尾部的无声片段、首部的无声片段，在设置中按需开启，
   分别为跳过头部、尾部的静音区域」。

   --------------------------------------------------------------------------
   为什么在「解码后的 PCM」上做，而不是在原始文件上做

   原始文件（MP3 / FLAC / APE…）里要判断「这段是不是静音」必须先解码 ——
   而本项目的音频链路本来就已经把任意格式转成了固定布局的 PCM WAV
   （44 字节头 + 16bit/44.1kHz/立体声，见 internal/ffmpeg），并且**落盘缓存**。
   在同一份 PCM 上跑一遍扫描，既不需要引入解码器，也不需要为每种容器格式
   再写一套解析：一份实现覆盖全部格式。

   --------------------------------------------------------------------------
   为什么结果要按文件缓存

   扫描是「把整首歌过一遍」的 O(n) 操作。一首 5 分钟的歌是 1323 万个采样点，
   每次装载都重扫一遍的话，切歌会明显变慢 —— 而这正是用户最容易感知的地方。
   好在文件内容不变时结论也不变，所以按「路径 + 修改时间 + 大小」缓存，
   第二次播放同一首歌是零开销（见 scanSilence 的调用点）。

   缓存只存**结论**（首尾各多少帧静音），不存 PCM 本身，条目也只有几十字节。
   ========================================================================== */

package audioplay

import (
	"encoding/binary"
	"math"
	"os"
	"sync"
)

/* --------------------------------------------------------------------------
   阈值
   -------------------------------------------------------------------------- */

const (
	// silenceDBFS 是「判为静音」的电平门限（相对满刻度的 dB）。
	//
	// -50 dBFS 对应 16bit 样本约 ±103 的幅度（32768 × 10^(-50/20) ≈ 104）。
	// 取值要平衡两件事：
	//   · 太高（比如 -30 dBFS）→ 把音乐里的弱奏、淡入淡出、尾奏混响也当静音掐掉，
	//     用户会觉得「歌的开头被吃掉了一块」；
	//   · 太低（比如 -70 dBFS）→ 抓轨文件里的底噪（黑胶转录、老磁带）永远
	//     判不成静音，功能等于没开。
	// -50 dBFS 是这两者之间比较稳的点：真正的数字静音与低电平底噪都能盖住，
	// 而正常音乐的弱奏段落（通常不低过 -40 dBFS）不会被误伤。
	silenceDBFS = -50.0

	// silenceRunMs 是「连续静音多久才算一段静音」（毫秒）。
	//
	// 必须有它：音乐里到处是几十毫秒的近静音瞬间（乐句之间的呼吸、
	// 打击乐之间的空隙）。不设最短长度的后果是「开头的那一下停顿被当成静音，
	// 于是每次播放都跳过几十毫秒」—— 听感上是开头被咬掉一口。
	//
	// 200ms 是「短到不放过真正的空白段、长到不会误伤乐句间隙」的量级。
	silenceRunMs = 200

	// silenceScanStepFrames 是扫描时的取样步长（帧）。
	//
	// 静音判定不需要逐帧看：一段静音至少 200ms（8820 帧），
	// 每 64 帧（约 1.5ms）取一个窗口，落在静音段里的取样点足够多，
	// 不可能整段漏掉。而扫描量因此降到 1/64 —— 一首 5 分钟的歌从
	// 「1323 万次取样」变成 20 万次，装载时的开销可以忽略。
	silenceScanStepFrames = 64

	// silenceWindowFrames 是每个取样点看的窗口长度（帧）。
	//
	// 与步长等长（64 帧 ≈ 1.5ms）：取窗口的**峰值**而不是瞬时值，
	// 避免恰好取在正弦波过零点上而把有声音的地方误判成静音。
	silenceWindowFrames = silenceScanStepFrames
)

/* --------------------------------------------------------------------------
   结果
   -------------------------------------------------------------------------- */

// SilenceInfo 是一首歌首尾静音的检测结论。
//
// 单位统一用**帧**：引擎内部的位置、seek、缓冲全部以帧为准
// （见 Engine.SeekToFrame 的说明），用毫秒会在两处之间来回换算，
// 而换算本身就是误差来源。
type SilenceInfo struct {
	// HeadFrames 是开头连续静音的帧数（0 表示开头就是声音）
	HeadFrames int64
	// TailFrames 是结尾连续静音的帧数（0 表示结尾就是声音）
	TailFrames int64
	// TotalFrames 是这首歌的总帧数，供调用方判断「掐完还剩多少」
	TotalFrames int64
}

// HeadMs / TailMs 返回以毫秒计的静音长度（供上层与前端展示 / 断言）
func (s SilenceInfo) HeadMs() int64 { return frameToMs(s.HeadFrames) }

// TailMs 返回尾部静音长度（毫秒）
func (s SilenceInfo) TailMs() int64 { return frameToMs(s.TailFrames) }

// SilenceTrim 描述「这首歌实际该怎么掐」。
//
// 与 SilenceInfo 分开：SilenceInfo 是**文件的事实**（头尾各有多少静音），
// 而本结构是**本次播放的决策**（用户开了哪些开关、掐完还剩多少）。
// 事实可以缓存复用，决策随开关变化 —— 混在一起会让缓存带上开关的状态。
type SilenceTrim struct {
	// StartFrame 是起播位置（开了「跳过开头静音」时是头部静音的长度）
	StartFrame int64
	// EndFrame 是「播到这里就算结束」的帧下标（超出部分不再输出）
	EndFrame int64
	// TotalFrames 是文件总帧数
	TotalFrames int64
	// SkippedHeadMs / SkippedTailMs 是实际跳掉的毫秒数（0 表示没跳）
	SkippedHeadMs int64
	SkippedTailMs int64
}

// Playing 报告掐完之后还有没有内容可放。
//
// 极端情况必须挡住：「整首歌都是静音」的文件如果把头尾都掐掉，
// 就会变成一个长度为零的区间 —— 那会让播放位置计算出现 0 长度的
// 进度条（前端除以 duration 得到 NaN），而且用户会看到「点了没反应」。
// 调用方据此退回「不掐」。
func (t SilenceTrim) Playing() bool {
	return t.EndFrame > t.StartFrame
}

/* --------------------------------------------------------------------------
   扫描
   -------------------------------------------------------------------------- */

// scanSilence 扫描一份 PCM 数据，返回首尾静音长度。
//
// pcm 是**去掉 WAV 头之后**的裸数据（16bit 小端交错立体声）。
// 只在开头与结尾附近找：中间的静音不是这个功能要处理的东西
// （跳过中间的静音会让歌词与音频错位，那是另一个量级的功能）。
func scanSilence(pcm []byte) SilenceInfo {
	total := int64(len(pcm) / FrameSize)
	info := SilenceInfo{TotalFrames: total}
	if total == 0 {
		return info
	}

	// 最少连续静音长度（帧）
	minRun := int64(SampleRate) * silenceRunMs / 1000

	// —— 头部 ——
	// 从头往后找第一个「有声音」的窗口；它之前的都算静音。
	head := int64(0)
	for f := int64(0); f+silenceWindowFrames <= total; f += silenceScanStepFrames {
		if !isSilentWindow(pcm, f, silenceWindowFrames) {
			break
		}
		head = f + silenceWindowFrames
	}
	// 不足一段的静音不算：那是乐句之间的呼吸，不是「无声片段」
	if head < minRun {
		head = 0
	} else {
		// 对齐到取样边界，避免把一个窗口切一半
		head = head / silenceScanStepFrames * silenceScanStepFrames
	}

	// —— 尾部 ——
	// 从后往前找最后一个「有声音」的窗口。
	tail := int64(0)
	for f := total - silenceWindowFrames; f >= 0; f -= silenceScanStepFrames {
		if !isSilentWindow(pcm, f, silenceWindowFrames) {
			break
		}
		tail = total - f
	}
	if tail < minRun {
		tail = 0
	} else {
		tail = tail / silenceScanStepFrames * silenceScanStepFrames
	}

	// 头尾不能重叠：整首歌都静音时两个扫描都会得出「全部」，
	// 相加就超过了总长度。这里让尾部让位（头部优先），因为
	// 「跳过开头」是更常被开启的那一个。
	if head+tail > total {
		tail = total - head
		if tail < 0 {
			tail = 0
		}
	}

	info.HeadFrames = head
	info.TailFrames = tail
	return info
}

// isSilentWindow 判断从 from 帧开始、长 n 帧的窗口是否整段都在门限之下。
//
// 用**峰值**而不是平均值：一段「静音 + 一个咔哒声」的窗口平均下来仍然很低，
// 但那声咔哒是真实存在的声音，掐掉它就会听出「开头被咬了一口」。
func isSilentWindow(pcm []byte, from, n int64) bool {
	limit := int16(math.Pow(10, silenceDBFS/20) * 32768)
	if limit < 0 {
		limit = -limit
	}
	end := from + n
	total := int64(len(pcm) / FrameSize)
	if end > total {
		end = total
	}
	for f := from; f < end; f++ {
		off := f * FrameSize
		for c := 0; c < Channels; c++ {
			v := int16(binary.LittleEndian.Uint16(pcm[off+int64(c*BytesPerSample):]))
			if v > limit || v < -limit {
				return false
			}
		}
	}
	return true
}

/* --------------------------------------------------------------------------
   按文件缓存
   --------------------------------------------------------------------------
   键是「路径 + 大小 + 修改时间」：文件被换成另一首歌（同名覆盖）时
   大小或修改时间必然变，缓存自动失效。不做内容 hash —— 那要再读一遍全文件，
   而扫描本来就是为了省下这一次读。
   -------------------------------------------------------------------------- */

type silenceCacheKey struct {
	path    string
	size    int64
	modTime int64
}

var (
	silenceCacheMu sync.Mutex
	silenceCache   = map[silenceCacheKey]SilenceInfo{}
	// silenceCacheMax 是缓存条目上限。一首歌一条、几十字节，
	// 4000 条对内存毫无压力；设上限只是防「长年不重启 + 巨量曲库」的极端情况。
	silenceCacheMax = 4000
)

// LoadSilenceInfo 返回某个 WAV 文件的首尾静音结论。
//
// 命中缓存时零开销；未命中时把去掉头之后的 PCM **分块**读一遍
// （不整首读进内存 —— 一首 10 分钟的歌是 105MB，整读会明显吃内存）。
//
// 注意：分块读的边界必须落在取样步长的整数倍上，否则头尾两段窗口会错位。
func LoadSilenceInfo(path string) (SilenceInfo, error) {
	st, err := os.Stat(path)
	if err != nil {
		return SilenceInfo{}, err
	}
	key := silenceCacheKey{path: path, size: st.Size(), modTime: st.ModTime().UnixNano()}
	if v, ok := silenceCacheGet(key); ok {
		return v, nil
	}

	info, err := scanSilenceFile(path, st.Size())
	if err != nil {
		return SilenceInfo{}, err
	}
	silenceCachePut(key, info)
	return info, nil
}

// ClearSilenceCache 清空静音扫描缓存（文件被替换 / 用户手动清缓存时调用）。
func ClearSilenceCache() {
	silenceCacheMu.Lock()
	silenceCache = map[silenceCacheKey]SilenceInfo{}
	silenceCacheMu.Unlock()
}

func silenceCacheGet(key silenceCacheKey) (SilenceInfo, bool) {
	silenceCacheMu.Lock()
	defer silenceCacheMu.Unlock()
	v, ok := silenceCache[key]
	return v, ok
}

func silenceCachePut(key silenceCacheKey, info SilenceInfo) {
	silenceCacheMu.Lock()
	defer silenceCacheMu.Unlock()
	if len(silenceCache) >= silenceCacheMax {
		// 满了就整体清空而不是逐个淘汰：静音扫描很便宜（命中缓存才是常态），
		// 而维护 LRU 需要额外的链表与时间戳，收益不成比例。
		silenceCache = map[silenceCacheKey]SilenceInfo{}
	}
	silenceCache[key] = info
}

// scanSilenceFile 分块扫描文件，得出首尾静音长度。
//
// 扫描只覆盖**头部与尾部各最多 maxScanFrames 帧**：真正的静音不会超过
// 这个长度（10 分钟），而中间部分与结论无关 —— 全文件扫描是纯浪费。
func scanSilenceFile(path string, size int64) (SilenceInfo, error) {
	f, err := os.Open(path)
	if err != nil {
		return SilenceInfo{}, err
	}
	defer f.Close()

	totalPCM := size - headerSizeOffset
	if totalPCM < 0 {
		totalPCM = 0
	}
	total := totalPCM / FrameSize
	info := SilenceInfo{TotalFrames: total}
	if total == 0 {
		return info, nil
	}

	// 头部：读开头一段（够覆盖「跳过开头静音」的合理范围）
	headChunk := int64(scanChunkFrames)
	if headChunk > total {
		headChunk = total
	}
	headBuf := make([]byte, headChunk*FrameSize)
	n, err := f.ReadAt(headBuf, headerSizeOffset)
	if err != nil && n == 0 {
		return SilenceInfo{}, err
	}
	headBuf = headBuf[:n/int(FrameSize)*FrameSize]
	info.HeadFrames = scanSilence(headBuf).HeadFrames

	// 尾部：同理从末尾往前读一段
	tailChunk := int64(scanChunkFrames)
	if tailChunk > total {
		tailChunk = total
	}
	tailBuf := make([]byte, tailChunk*FrameSize)
	offset := headerSizeOffset + (total-tailChunk)*FrameSize
	n, err = f.ReadAt(tailBuf, offset)
	if err != nil && n == 0 {
		return SilenceInfo{}, err
	}
	tailBuf = tailBuf[:n/int(FrameSize)*FrameSize]
	info.TailFrames = scanSilence(tailBuf).TailFrames

	if info.HeadFrames > total {
		info.HeadFrames = total
	}
	if info.TailFrames > total-info.HeadFrames {
		info.TailFrames = total - info.HeadFrames
	}
	return info, nil
}

// scanChunkFrames 是头尾各自扫描的最大长度（帧）。
//
// 10 分钟：比任何人能忍的「开头空白」都长得多，而内存占用是
// 10×60×44100×4 ≈ 105MB —— 太大，所以这里实际取 60 秒（约 10MB），
// 已经把「一个静音片段的合理上限」覆盖得绰绰有余。
const scanChunkFrames = SampleRate * 60

/* --------------------------------------------------------------------------
   决策
   -------------------------------------------------------------------------- */

// PlanSilenceTrim 按开关把「文件事实」换算成「本次播放的掐头去尾方案」。
//
// skipHead / skipTail 分别对应设置里的两个开关。两者都关时返回的方案是
// 「原样播放」（StartFrame=0、EndFrame=总长），调用方不必自己判空。
func PlanSilenceTrim(info SilenceInfo, skipHead, skipTail bool) SilenceTrim {
	trim := SilenceTrim{
		StartFrame:  0,
		EndFrame:    info.TotalFrames,
		TotalFrames: info.TotalFrames,
	}
	if skipHead && info.HeadFrames > 0 {
		trim.StartFrame = info.HeadFrames
		trim.SkippedHeadMs = frameToMs(info.HeadFrames)
	}
	if skipTail && info.TailFrames > 0 {
		trim.EndFrame = info.TotalFrames - info.TailFrames
		trim.SkippedTailMs = frameToMs(info.TailFrames)
	}
	if trim.EndFrame < trim.StartFrame {
		trim.EndFrame = trim.StartFrame
	}
	return trim
}

/* --------------------------------------------------------------------------
   自动切歌的间隔
   -------------------------------------------------------------------------- */

// GapScheduler 负责「上一首播完到下一首起播之间等多久」。
//
// 为什么放在引擎这一层而不是前端：间隔的本质是**音频时间**上的空白，
// 由音频线程的时钟来度量才准确。放前端的话，WebView 一卡（或页面不可见被
// 节流）间隔就会变长，用户听到的是忽长忽短的停顿。
//
// 工作方式：EOF 时不立刻触发上层回调，而是把「播完了」记下来并输出静音，
// 等间隔走完再回调。上层（PlayerService）于是不需要为自己加计时器。
type GapScheduler struct {
	mu sync.Mutex
	// gapFrames 是间隔长度（帧）。0 表示不留间隔。
	gapFrames int64
	// startFrame 是当前间隔的起点（引擎位置口径的帧号）
	startFrame int64
	// endFrame 是间隔结束的帧号
	endFrame int64
	// armed 表示正在等间隔走完
	armed bool
	// onReady 是间隔走完时的回调（触发自动切歌）
	onReady func()
}

// NewGapScheduler 创建一个不带间隔的调度器（等价于立刻回调）。
func NewGapScheduler() *GapScheduler { return &GapScheduler{} }

// SetGapSeconds 设置间隔长度（秒）。负值按 0 处理。
//
// 播放途中改这个值不会打断正在进行的间隔：那一段已经按旧值排好了，
// 中途改会让「等 1.5 秒」变成「等 0.3 秒」，用户拖滑块时听起来像跳帧。
func (g *GapScheduler) SetGapSeconds(seconds float64) {
	if seconds < 0 {
		seconds = 0
	}
	g.mu.Lock()
	g.gapFrames = int64(seconds * float64(SampleRate))
	g.mu.Unlock()
}

// GapSeconds 返回当前配置的间隔（秒，供诊断与测试）
func (g *GapScheduler) GapSeconds() float64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	return float64(g.gapFrames) / float64(SampleRate)
}

// HasGap 报告当前是否配置了间隔
func (g *GapScheduler) HasGap() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.gapFrames > 0
}

// Arm 在「上一首播完」时调用，返回 true 表示「已进入间隔，先别切歌」。
//
// 返回 false 有两种情况，调用方都应当**立刻**切歌：
//
//	· 没配置间隔（gapFrames == 0）；
//	· 已经处于间隔中（重复的 EOF 不该重新计时）。
func (g *GapScheduler) Arm(onReady func()) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.gapFrames <= 0 {
		return false
	}
	if g.armed {
		return true
	}
	g.armed = true
	g.startFrame = 0
	g.endFrame = g.gapFrames
	g.onReady = onReady
	return true
}

// Cancel 取消正在进行的间隔（用户手动切歌 / 暂停时调用）。
//
// 必须能取消：用户在 1.5 秒的间隔里点了「下一首」，那一下是明确的即时意图，
// 不该还要等剩下的半秒。
func (g *GapScheduler) Cancel() {
	g.mu.Lock()
	g.armed = false
	g.onReady = nil
	g.mu.Unlock()
}

// Active 报告是否正在间隔中（诊断与测试用）
func (g *GapScheduler) Active() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.armed
}

// Tick 由音频回调按「本次消费了 frames 帧」推进间隔，返回是否仍在间隔中。
//
// ★ 它必须在**音频回调线程**上被调用，参数是本次真正输出给声卡的帧数 ——
// 这样间隔就与音频时钟严格同步：网页卡住、系统忙、设备缓冲大小变化，
// 间隔的实际时长都不变。
func (g *GapScheduler) Tick(frames int) bool {
	g.mu.Lock()
	if !g.armed {
		g.mu.Unlock()
		return false
	}
	g.startFrame += int64(frames)
	done := g.startFrame >= g.endFrame
	var fn func()
	if done {
		g.armed = false
		fn = g.onReady
		g.onReady = nil
	}
	g.mu.Unlock()

	if done && fn != nil {
		fn()
	}
	return !done
}
