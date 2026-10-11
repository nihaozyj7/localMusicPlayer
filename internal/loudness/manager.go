// Package loudness 计算音频的响度并给出回放补偿增益。
//
// 为什么需要：不同来源的音频响度差得很远（实测用户曲库里同一批 m4a 的
// 整合响度能差 10 LU 以上），切歌时音量忽大忽小。这里按 EBU R128 / ITU-R
// BS.1770-4 测出每首歌的整合响度与真峰值，回放时按目标响度做增益补偿。
//
// 补偿方式选择「静态线性增益」而不是 loudnorm 的动态归一化：
//   - 线性增益保留原始动态范围，不会破坏音乐本身的强弱对比；
//   - 结果是一个恒定 dB 值，后端可以在音频回调里实时套用，切歌零延迟；
//   - 动态归一化需要实时重采样整条流，做不到了解耦（也无法用于原生格式）。
//
// 本文件放**行为**（测量、队列、解析）；磁盘格式与查询在 cache.go，
// 两者合起来构成完整的一包。
//
// ★ 两条最重要的设计：
//
//  1. **测量与挡位是两件事。** 整合响度/真峰值/LRA 是文件的固有量，
//     与用户选哪个目标响度无关。所以一首歌无论切几个挡位，都只测一次
//     （见 cache.go）。
//  2. **播放优先。** 正在播的那首歌永远排在最前，后台批量预热给它让路
//     （见下面「播放优先队列」）。
package loudness

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/executil"
	"localmusicplayer/internal/ffmpeg"
) // AlgoVersion 测量算法的版本号。
// 只要测量方式变了（解码路径、滤镜、门限、单位换算…），就把它 +1，
// 旧的缓存会自动判为过期并重算 —— 否则用户升级后会拿到用旧算法算出的
// 补偿值，且完全看不出来。
//
// ★ 2：测量滤镜从 loudnorm 换成 ebur128（快 10 倍，见 analyse 的说明），
// 并且缓存记录里不再带 target（见 cache.go 的文件头说明）。
const AlgoVersion = 2

// 并发上限。
//
// ★ 默认值刻意很小（2）。响度测量是**后台**工作，而它跑起来时用户往往正在
// 听歌。实测（8 核 16 线程）：同时跑 8 个 ffmpeg 时单个进程的分析速度从
// 21.7x 实时掉到 4.1x —— 多开的进程没换来成比例的吞吐，只是把 CPU 铺满、
// 风扇狂转，顺带把前台播放的音效链也拖慢。开 2 个各跑满一个核，
// 总吞吐几乎一样，前台却始终有余量。
const (
	DefaultConcurrency = 2
	MaxConcurrency     = 4
)

// managerQueue 是测量调度队列的内部状态（见下面「播放优先队列」一节）。
//
// 它作为 Manager 的字段存在，所以定义在这里、由 cache.go 的 NewManager 初始化。
type managerQueue struct {
	mu      sync.Mutex
	started bool
	// urgent / queue 按优先级分两条，避免每次出队都扫描整个切片
	urgent []*Request
	queue  []*Request
	// queued 是「已在队列里」的集合（按测量 key 去重），出队时同步删除
	queued map[string]bool
	// running 是当前占用槽位的数量
	running int
	// inter 是「交互请求在排队」的计数，供后台任务判断是否让路
	inter int
	// wake 用来唤醒调度循环（容量 1，重复信号会被合并）
	wake chan struct{}
}

func newManagerQueue() *managerQueue {
	return &managerQueue{queued: map[string]bool{}, wake: make(chan struct{}, 1)}
}

// requestKey 是队列去重用的键：与测量缓存的 key 一致。
//
// 同一首歌即使来自不同的挡位请求，也会合并成一次测量 —— 这正是
// 「测量与挡位解耦」在队列层上的体现。
func requestKey(s bootstrap.Song) string {
	return keyFor(s.Path, s.Size, s.ModTime)
}

/* --------------------------------------------------------------------------
   工具集
   -------------------------------------------------------------------------- */

// toolSet 返回当前 ffmpeg 工具集；还没解析过就补一次。
//
// 构造时不再同步解析（见 NewManager），所以这里要能补上 —— 否则
// 「后台 prewarm 还没跑完就被问到」会得到「没有 ffmpeg」的假答案。
func (m *Manager) toolSet() ffmpeg.Tools {
	m.toolsMu.RLock()
	t := m.tools
	m.toolsMu.RUnlock()
	if t.FFmpeg != "" || t.Source != "" {
		return t
	}
	t = ffmpeg.Resolve()
	m.toolsMu.Lock()
	m.tools = t
	m.toolsMu.Unlock()
	return t
}

// Available 是否具备测量能力
func (m *Manager) Available() bool { return m.toolSet().Available() }

// Tools 返回 ffmpeg 工具信息
func (m *Manager) Tools() ffmpeg.Tools { return m.toolSet() }

// RefreshTools 重新解析 ffmpeg（后台 prewarm 完成 / 设置里切换后调用）
func (m *Manager) RefreshTools() {
	ffmpeg.Reset()
	t := ffmpeg.Resolve()
	m.toolsMu.Lock()
	m.tools = t
	m.toolsMu.Unlock()
}

// Concurrency 返回当前的并发上限（诊断 / 测试用）
func (m *Manager) Concurrency() int { return m.conc }

/* --------------------------------------------------------------------------
   测量
   -------------------------------------------------------------------------- */

// Measure 得到某首歌的测量结果。
//
// 命中有效缓存就直接返回；否则**立刻按需测量**（这是常规路径：用户播到哪首
// 就测哪首，不需要事先全库扫描）。ctx 可用于取消（例如用户很快切歌）。
//
// ★ 这里不再有 targetLUFS 参数：测量结果与挡位无关，见包注释。
func (m *Manager) Measure(ctx context.Context, song bootstrap.Song) (Measurement, error) {
	if item, ok := m.Get(song); ok {
		return item, nil
	}
	return m.measureUncached(ctx, song)
}

// Store 把一份已经算好的测量结果记进缓存（**不跑 ffmpeg**）。
//
// ★ 这是「零成本测量」的入口。转码播放链路在解码过程中顺手用纯 Go 的
// BS.1770 实现算出了响度（见 internal/ffmpeg/loudnessscan.go 与 media.Server），
// 算完把结果交到这里落库。相比「再起一个 ffmpeg 把整首歌解码一遍」，
// 这条路径不额外读一次文件、不额外启一个进程、不额外占一个核。
//
// 传进来的 song 必须带上正确的 Size/ModTime（曲库记录里的值），
// 否则记录立刻就是过期的 —— 那说明文件在转码之后被改过，重算是正确行为。
func (m *Manager) Store(song bootstrap.Song, res Measurement) {
	res.Path = song.Path
	res.Size = song.Size
	res.ModTime = song.ModTime
	res.Algo = AlgoVersion
	res.Measured = true
	if res.MeasuredAt == 0 {
		res.MeasuredAt = nowMillis()
	}

	m.mu.Lock()
	m.items[keyFor(song.Path, song.Size, song.ModTime)] = res
	m.dirty = true
	m.mu.Unlock()
}

// StoreAndGain 记下测量结果，并把指定挡位的增益也算好一起记账。
//
// 「转码时顺手测量」的调用方用它：算完响度就等于"这首歌在当前挡位下已经有
// 补偿"，播放到它时不需要再排队、也不需要再算一遍。
func (m *Manager) StoreAndGain(song bootstrap.Song, res Measurement, targetLUFS float64) float64 {
	m.Store(song, res)
	item, _ := m.Get(song)
	gain := GainDB(item, targetLUFS)
	m.mu.Lock()
	m.putGainLocked(song.ID, targetLUFS, gain)
	m.dirty = true
	m.mu.Unlock()
	return gain
}

func (m *Manager) measureUncached(ctx context.Context, song bootstrap.Song) (Measurement, error) {
	tools := m.toolSet()
	if !tools.Available() {
		return Measurement{}, fmt.Errorf("ffmpeg 不可用，无法测量响度")
	}
	res, err := analyse(ctx, tools.FFmpeg, song.Path)
	if err != nil {
		return Measurement{}, err
	}
	m.Store(song, res)
	item, _ := m.Get(song)
	return item, nil
}

/* --------------------------------------------------------------------------
   播放优先队列
   --------------------------------------------------------------------------
   ★ 这是「优先处理正在播放的那首歌」的落点。

   为什么需要队列，而不是各自起 goroutine + 信号量：信号量只能限制**同时**
   跑几个，不能决定**下一个跑谁**。用户点开一首歌时希望它马上被算出来，
   而如果后台正在批量补测整库，点播请求直接起 goroutine 只会去和后台抢核，
   用户要等的那首反而排在别人后面。

   队列规则（优先级从高到低）：
     1. PriorityInterrupt —— 正在播放 / 刚切到的那首，永远最先处理；
     2. PriorityNormal    —— 后台批量预热。
   同优先级内先到先服务。队列按测量 key 去重：同一首歌重复入队只留一条，
   所以它的长度上界就是曲库大小。

   让路：后台批量任务每提交下一首之前会检查 YieldIfPending，有交互请求在
   排队就停下来等 —— 于是即使用户在预热进行到一半时切歌，那首歌也只需要等
   **当前这一首**测完（单首亚秒级），而不是等预热的剩余部分。
   -------------------------------------------------------------------------- */

// Priority 是测量请求的优先级
type Priority int

const (
	// PriorityNormal 后台批量预热
	PriorityNormal Priority = iota
	// PriorityInterrupt 正在播放 / 刚切到的那首
	PriorityInterrupt
)

// Request 一次测量请求
type Request struct {
	Song     bootstrap.Song
	Priority Priority
	// Done 在测量结束（或请求被取消）时关闭
	Done chan struct{}
	// Result / Err 在 Done 关闭后有效
	Result Measurement
	Err    error

	// 以下字段由调度器在 q.mu 保护下读写
	cancelled bool
}

// ErrSuperseded 表示这次请求在自己的测量开始前就被取消了。
//
// 它不是「失败」：调用方（播放链路）不依赖响度结果也能正常播放
// （补偿是算好之后再套上去的）。它只是让被取消的歌不会在队列里
// 变成一次无人认领的 ffmpeg 调用。
var ErrSuperseded = fmt.Errorf("测量请求已被取消")

// Submit 把一首歌排进测量队列并等它完成。
func (m *Manager) Submit(ctx context.Context, song bootstrap.Song, prio Priority) (Measurement, error) {
	// 快速路径：已经测过就直接返回，不进队列、不抢槽位。
	// 批量预热里绝大多数歌曲走的都是这一条（重复调用是廉价的）。
	if item, ok := m.Get(song); ok {
		return item, nil
	}

	req := &Request{Song: song, Priority: prio, Done: make(chan struct{})}
	if !m.enqueue(req) {
		// 同一首歌已经在队列里：等它出结果，不重复排队（否则两处都会跑
		// 一次 ffmpeg，纯浪费）。用轮询缓存而不是共享同一个 Request：
		// 两个调用方各自要能取消，共享一条会互相牵连。
		//
		// 为什么不上条件变量：这里最多等一首歌的分析时间，轮询开销
		// （每秒 50 次 map 读）可以忽略，而条件变量要维护一套通知生命周期，
		// 在「等的人自己也被取消」时会多出一堆边界情况。
		t := time.NewTicker(20 * time.Millisecond)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return Measurement{}, ctx.Err()
			case <-t.C:
				if item, ok := m.Get(song); ok {
					return item, nil
				}
			}
		}
	}

	select {
	case <-req.Done:
		return req.Result, req.Err
	case <-ctx.Done():
		// 取消后不再等：用户切歌时不该让前端卡在这一个调用上。
		// 已经排队的任务由调度器自行作废（不会白跑一次 ffmpeg）。
		m.cancelRequest(req)
		return Measurement{}, ctx.Err()
	}
}

// enqueue 入队；返回 false 表示同一首歌已在队列里。
func (m *Manager) enqueue(req *Request) bool {
	q := &m.q
	key := requestKey(req.Song)

	q.mu.Lock()
	if q.queued[key] {
		q.mu.Unlock()
		return false
	}
	q.queued[key] = true
	if req.Priority == PriorityInterrupt {
		// 交互请求插到**队首**：后到的往往就是用户刚点开的那首，
		// 它应当比之前排队的所有交互请求更早被处理。
		q.urgent = append([]*Request{req}, q.urgent...)
		q.inter++
	} else {
		q.queue = append(q.queue, req)
	}
	if !q.started {
		q.started = true
		go m.dispatch()
	}
	q.mu.Unlock()

	m.signalWake()
	return true
}

// cancelRequest 把请求标记为作废（它可能还在排队，也可能已经在跑）
func (m *Manager) cancelRequest(req *Request) {
	m.q.mu.Lock()
	req.cancelled = true
	m.q.mu.Unlock()
}

// signalWake 让调度循环立刻醒一次（入队 / 任务结束时调用）。
//
// 用非阻塞发送：容量为 1 的信号通道天然合并重复信号，调度循环每次醒来都会
// 尽量把能跑的槽位填满，所以丢一个信号不会漏掉任务。
func (m *Manager) signalWake() {
	select {
	case m.q.wake <- struct{}{}:
	default:
	}
}

// dispatch 是唯一的调度 goroutine：按优先级取任务，把并发控制在 m.conc 内。
func (m *Manager) dispatch() {
	q := &m.q
	for {
		req := m.nextRequest()
		if req == nil {
			// 没有可跑的任务：等唤醒信号，而不是忙等。
			select {
			case <-q.wake:
			case <-time.After(250 * time.Millisecond):
				// 兜底轮询：万一信号在「出队」与「等待」之间错过，
				// 也能在 250ms 内把队列捞起来（开销可忽略）。
			}
			continue
		}
		q.mu.Lock()
		q.running++
		q.mu.Unlock()
		go func(r *Request) {
			defer func() {
				q.mu.Lock()
				q.running--
				q.mu.Unlock()
				close(r.Done)
				m.signalWake()
			}()
			m.runRequest(r)
		}(req)
	}
}

// nextRequest 取出下一个该跑的任务（没有就返回 nil）。
//
// ★ 交互优先：只要 urgent 非空就绝不取普通任务 —— 这正是「后台批量给
// 播放让路」在调度层的实现（提交层还有一道 YieldIfPending）。
func (m *Manager) nextRequest() *Request {
	q := &m.q
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.running >= m.conc {
		return nil
	}

	// 先清掉队首的取消项（它们不该占用一次 ffmpeg），再取任务。
	for {
		switch {
		case len(q.urgent) > 0:
			r := q.urgent[0]
			q.urgent = q.urgent[1:]
			m.dropQueuedLocked(r)
			// ★ 递减必须紧跟「出队」，不能放到 return 之前。
			//
			// q.inter 是「还有交互请求在排队」的计数，YieldIfPending() 靠它
			// 让后台批量测量让路。旧写法只在真正返回这个请求时才递减，
			// 于是**被取消的交互请求**会让计数永久留在 1 以上：
			// YieldIfPending() 从此永远返回 true，MeasureAll（"测量整个曲库"）
			// 会一直让路、一首都不再测 —— 用户看到的是「响度均衡点了一次
			// 之后再也没有测过新歌」，而且重启才好。
			if q.inter > 0 {
				q.inter--
			}
			if r.cancelled {
				close(r.Done)
				continue
			}
			return r
		case len(q.queue) > 0:
			r := q.queue[0]
			q.queue = q.queue[1:]
			m.dropQueuedLocked(r)
			if r.cancelled {
				close(r.Done)
				continue
			}
			return r
		default:
			return nil
		}
	}
}

// dropQueuedLocked 把请求从「已在队列」集合里移除。调用方需持有 q.mu。
func (m *Manager) dropQueuedLocked(r *Request) {
	delete(m.q.queued, requestKey(r.Song))
}

// measureTimeout 是单次响度测量的上限。
//
// ★ 为什么必须有：runRequest 以前用的是 context.Background()，没有任何上限。
// 一个让 ffmpeg 卡住的文件（损坏的容器、掉线的网络驱动器、被杀软锁住的文件）
// 会**永久占住一个并发槽** —— 调度器从此凑不满并发，Submit 的调用方
// （界面上的「测量中…」）永远等不到 Done，而且没有任何办法把它弄下来，
// 只能重启进程。
//
// 上限取得很宽松：ebur128 实测约 20 倍实时（10 分钟的歌约 30 秒，
// 2 小时的整轨有声书约 6 分钟）。10 分钟足够覆盖正常情况，又能在真卡死时
// 把槽位收回来。
//
// 声明为变量而不是常量：测试要能在毫秒级验证「超时真的会释放槽位」。
// 生产路径不会改它。
var measureTimeout = 10 * time.Minute

// measureContext 构造一次**排队测量**的上下文。
//
// 与调用方自己那个 ctx 的区别（见 Submit）：调用方的取消只作用于
// 「还在排队」的请求；一旦真的跑起来，能把它停下来的只有这里的上限。
func measureContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), measureTimeout)
}

// runRequest 真正执行一次测量并把结果落库。
func (m *Manager) runRequest(r *Request) {
	// ★ 必须用带上限的 ctx。写成 context.Background() 的话，
	// 卡死的 ffmpeg 会把并发槽永久占住（见 measureTimeout 的说明）。
	ctx, cancel := measureContext()
	defer cancel()
	item, err := m.measureUncached(ctx, r.Song)
	r.Result, r.Err = item, err
}

// YieldIfPending 报告「此刻有没有交互请求在排队」，供后台批量任务让路。
//
// 后台任务每提交下一首之前调一次，返回 true 就先别提交。
func (m *Manager) YieldIfPending() bool {
	m.q.mu.Lock()
	defer m.q.mu.Unlock()
	return m.q.inter > 0
}

// Pending 返回队列中等待的任务数（诊断 / 测试用）
func (m *Manager) Pending() int {
	m.q.mu.Lock()
	defer m.q.mu.Unlock()
	return len(m.q.urgent) + len(m.q.queue)
}

/* --------------------------------------------------------------------------
   批量
   -------------------------------------------------------------------------- */

// Progress 批量测量的进度
type Progress struct {
	Done     int
	Total    int
	Failed   int
	Current  string
	Finished bool
}

// MeasureAll 并发补测一批歌曲，通过 onProgress 汇报进度。
//
// 这是**可选**的批量预热：正常使用不需要它（播放时会自动按需测量）。
// 只测缺失的部分，因此重复调用是廉价的。ctx 取消后会尽快返回，
// 已测好的部分仍然保留（下次继续，不会白干）。
//
// ★ 它走的是**低优先级**队列，而且每提交下一首之前都让路
// （YieldIfPending）：用户点开一首歌时，预热会立刻停下来把槽位让出去。
func (m *Manager) MeasureAll(ctx context.Context, songs []bootstrap.Song, onProgress func(Progress)) (int, int, error) {
	todo := m.Missing(songs)
	total := len(todo)
	if onProgress != nil {
		onProgress(Progress{Done: 0, Total: total})
	}
	if total == 0 {
		if onProgress != nil {
			onProgress(Progress{Done: 0, Total: 0, Finished: true})
		}
		return 0, 0, nil
	}

	done, failed := 0, 0
	for _, song := range todo {
		if ctx.Err() != nil {
			break
		}
		// 让路：有交互请求在排队就先不提交下一首。
		//
		// 这里等的是「交互队列清空」，而不是一个固定时长 —— 后台任务本来
		// 就没有时间承诺，多等一会儿毫无损失；而用户点的那首歌因此能独占
		// 槽位。用户连续切歌就一直让，这是正确行为。
		for m.YieldIfPending() {
			select {
			case <-ctx.Done():
				goto finish
			case <-time.After(50 * time.Millisecond):
			}
		}

		_, err := m.Submit(ctx, song, PriorityNormal)
		if ctx.Err() != nil {
			break
		}
		done++
		if err != nil {
			failed++
		}
		p := Progress{Done: done, Total: total, Failed: failed, Current: song.Title}
		if done == total {
			p.Finished = true
		}
		if onProgress != nil {
			onProgress(p)
		}
	}

finish:
	// 收尾进度必须在这里补发：取消时未提交的曲目没人处理，
	// 上面 done == total 永远不成立，于是 Finished 永远是 false ——
	// 前端进度条不会收敛（用户看到「测量中」永远不结束）。
	if onProgress != nil {
		onProgress(Progress{Done: done, Total: total, Failed: failed, Finished: true})
	}

	if err := m.Save(); err != nil {
		return done, failed, err
	}
	return done, failed, ctx.Err()
}

/* --------------------------------------------------------------------------
   调用 ffmpeg 测量
   -------------------------------------------------------------------------- */

// analyse 跑一次响度分析。
//
// ★ 换了滤镜（提速的关键之一）：以前用 loudnorm，它会把整条流重新编码输出，
// 每首歌都要付一次完整的解码 + 编码。实测一首 240 秒的曲子要 **11.7 秒**
// （0.05x 实时）。而 ebur128 只做扫描、不产生输出，同样内容 **1.1 秒**
// （21.7x 实时）—— 快 10 倍，而我们要的只是那几个数。
//
// 解析侧也随之改了：ebur128 的 Summary 字段与 loudnorm 的 JSON 不同
// （见 parseSummary）。
//
// 参数说明（都踩过坑）：
//
//	-vn -map 0:a：m4a/mp4 里常内嵌封面（视频流）。不禁掉的话 ffmpeg 会为它选
//	  视频编码器，而精简构建里所有视频编码器都被关掉了，于是报
//	  "Error selecting an encoder"。
//	peak=true：让 ebur128 顺便给出真峰值。这一步是整条命令里最贵的部分
//	  （真峰值要对每个采样点做 4 相过采样插值），但它把「再跑一次拿真峰值」
//	  彻底省掉了 —— 分两次跑才是真的慢。
//	framelog=quiet：不要逐帧输出，解析只需要末尾的 Summary。
func analyse(ctx context.Context, ffmpegPath, path string) (Measurement, error) {
	args := []string{
		"-hide_banner", "-nostdin", "-nostats",
		"-i", path,
		"-vn", "-map", "0:a",
		"-af", "ebur128=peak=true:framelog=quiet",
		"-f", "null", "-",
	}
	cmd := executil.CommandContext(ctx, ffmpegPath, args...)
	// 用带上限的 buffer 而不是裸 bytes.Buffer。
	//
	// 上限取 64KB：framelog=quiet 之后 stderr 里只有容器元信息与末尾的
	// Summary（实测约 1.5KB），64KB 有 40 倍余量。万一将来输出变大到超过
	// 上限，解析会失败并返回明确错误（"ffmpeg 未返回响度数据"），
	// 而不是静默给出错误数值。
	stderr := ffmpeg.NewBoundedBuffer(64 << 10)
	cmd.Stderr = stderr
	cmd.Stdout = nil

	runErr := cmd.Run()
	out := stderr.String()

	summary, ok := ffmpeg.ParseEBUR128Summary(out)
	if !ok {
		if runErr != nil {
			return Measurement{}, fmt.Errorf("ffmpeg 分析失败: %v（%s）", runErr, tail(out, 200))
		}
		return Measurement{}, fmt.Errorf("ffmpeg 未返回响度数据（%s）", tail(out, 200))
	}
	return parseSummary(summary)
}

// parseSummary 把 ebur128 的 Summary 文本解析成测量结果。
//
// Summary 的形态（stderr 末尾）：
//
//	[Parsed_ebur128_0 @ ...] Summary:
//
//	  Integrated loudness:
//	    I:         -21.8 LUFS
//	    Threshold: -31.8 LUFS
//
//	  Loudness range:
//	    LRA:         0.0 LU
//	    LRA low:   -21.8 LUFS
//
//	  True peak:
//	    Peak:      -20.9 dBFS
//
// 解析方式：定位 "Summary:" 之后，按**标签**取其后第一个数值。
// 刻意不按行号解析 —— ffmpeg 不同版本会增删字段，按标签取更稳。
//
// ★ 真峰值的标签是 "Peak"，单位标的是 dBFS：ffmpeg 的 ebur128 在
// peak=true 时输出的就是真峰值（写法沿用了旧标签）。这与
// bs1770.TruePeakDBTP 的口径一致，两边可以互换使用。
func parseSummary(text string) (Measurement, error) {
	integrated, ok := summaryValue(text, "I:")
	if !ok {
		return Measurement{}, fmt.Errorf("响度值无效（Summary 里没有 I 字段）")
	}
	// -inf 表示整段静音：此时不做任何补偿
	if math.IsInf(integrated, 0) || math.IsNaN(integrated) {
		return Measurement{Integrated: 0}, nil
	}

	m := Measurement{Integrated: integrated}
	if v, ok := summaryValue(text, "Threshold:"); ok && !math.IsInf(v, 0) {
		m.Threshold = v
	}
	if v, ok := summaryValue(text, "LRA:"); ok && !math.IsInf(v, 0) {
		m.LRA = v
	}
	if v, ok := summaryValue(text, "Peak:"); ok && !math.IsInf(v, 0) {
		m.TruePeak = v
	}
	return m, nil
}

// summaryValue 从 Summary 文本里取出某个标签后的第一个数值。
//
// 先定位到 "Summary:" 之后再找标签：ffmpeg 的 stderr 里在 Summary 之前还有
// 容器元信息，万一某行恰好出现同样的标签就会被误取。
func summaryValue(text, label string) (float64, bool) {
	if i := strings.Index(text, "Summary:"); i >= 0 {
		text = text[i:]
	}
	i := strings.Index(text, label)
	if i < 0 {
		return 0, false
	}
	rest := strings.TrimLeft(text[i+len(label):], " \t")
	// 取到第一个数值：允许前导符号、小数点，以及 -inf 这种写法
	end := 0
	for end < len(rest) {
		c := rest[end]
		switch {
		case (c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.':
			end++
		case (c == 'i' || c == 'n' || c == 'f') && end > 0:
			end++
		default:
			goto done
		}
	}
done:
	if end == 0 {
		return 0, false
	}
	token := rest[:end]
	if strings.Contains(token, "inf") {
		// ebur128 对纯静音会给 -inf；这里返回 (0,true) 让调用方按
		// 「拿到值了，但它表示静音」处理（见 parseSummary）。
		return 0, true
	}
	v, err := strconv.ParseFloat(token, 64)
	if err != nil {
		return 0, false
	}
	return v, true
}

func tail(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return "…" + s[len(s)-n:]
}

/* --------------------------------------------------------------------------
   杂项
   -------------------------------------------------------------------------- */

// timeNow 抽出来是为了让测试能替换时钟（缓存记账用）
var timeNow = time.Now
