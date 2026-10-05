package loudness

import (
	"context"
	"fmt"
	"math"
	"sync"
	"testing"
	"time"

	"localmusicplayer/internal/bootstrap"
)

/* --------------------------------------------------------------------------
   流式累积器 vs 一次性计算
   --------------------------------------------------------------------------
   accrual.go 的 Accumulator 是 bs1770.go 那几个函数的流式等价实现。
   两者必须给出同样的数：流式那份是为了「转码时顺手算」（固定内存），
   而一次性那份是算法基准（也是诊断工具在用）。如果它们分叉了，
   用户会看到「同一首歌，播放时算的和批量算的不一样」。
   -------------------------------------------------------------------------- */

// TestAccumulatorMatchesBatch 逐块喂 vs 一次性算，结果必须一致
func TestAccumulatorMatchesBatch(t *testing.T) {
	rate := 44100
	// 造一段有动态变化的信号：前 2 秒满幅、中间 3 秒 -20dB、最后 2 秒 -6dB。
	// 用单一正弦测不出门限逻辑（LRA 恒为 0），必须有多段。
	total := rate * 7
	left := make([]float64, total)
	right := make([]float64, total)
	for i := 0; i < total; i++ {
		sec := float64(i) / float64(rate)
		amp := 1.0
		switch {
		case sec < 2:
			amp = 1.0
		case sec < 5:
			amp = 0.1
		default:
			amp = 0.5
		}
		v := amp * math.Sin(2*math.Pi*997*float64(i)/float64(rate))
		left[i] = v
		right[i] = v
	}

	wantLoud := IntegratedLUFS([][]float64{left, right}, rate)
	wantLRA := IntegratedLRA([][]float64{left, right}, rate)
	wantPeak := TruePeakDBTP([][]float64{left, right}, rate)

	// 流式：按 5000 帧一块喂（刻意不整除，覆盖"块边界与喂块边界错开"）
	acc := NewAccumulator(rate, 2)
	const chunk = 5000
	interleaved := make([]float64, 0, chunk*2)
	for start := 0; start < total; start += chunk {
		end := start + chunk
		if end > total {
			end = total
		}
		interleaved = interleaved[:0]
		for i := start; i < end; i++ {
			interleaved = append(interleaved, left[i], right[i])
		}
		acc.Write(interleaved)
	}
	got := acc.Result()

	if math.Abs(got.Integrated-wantLoud) > 0.05 {
		t.Errorf("流式整合响度 = %.3f，一次性算法 = %.3f（差 %.3f LU，超过 0.05）",
			got.Integrated, wantLoud, math.Abs(got.Integrated-wantLoud))
	}
	if math.Abs(got.LRA-wantLRA) > 0.05 {
		t.Errorf("流式 LRA = %.3f，一次性算法 = %.3f", got.LRA, wantLRA)
	}
	if math.Abs(got.TruePeak-wantPeak) > 0.05 {
		t.Errorf("流式真峰值 = %.3f，一次性算法 = %.3f", got.TruePeak, wantPeak)
	}
}

// TestAccumulatorKnownAnchor 满量程 997Hz 正弦必须是 -3.01 LUFS
// （与 bs1770_test.go 用的是同一条标准锚点，证明两条路径标定一致）
func TestAccumulatorKnownAnchor(t *testing.T) {
	rate := 48000
	n := rate * 10
	interleaved := make([]float64, 0, n*2)
	for i := 0; i < n; i++ {
		v := math.Sin(2 * math.Pi * 997 * float64(i) / float64(rate))
		interleaved = append(interleaved, v, v)
	}
	acc := NewAccumulator(rate, 2)
	acc.Write(interleaved)
	got := acc.Result()

	// 立体声同信号比单声道响 3.01 LU，单声道基准是 -3.01，故期望约 0.00
	if math.Abs(got.Integrated-0.0) > 0.15 {
		t.Errorf("满量程 997Hz 立体声正弦 = %.2f LUFS，期望约 0.00（单声道 -3.01 + 3.01）",
			got.Integrated)
	}
	if math.Abs(got.TruePeak-0.0) > 0.1 {
		t.Errorf("真峰值 = %.2f dBTP，期望约 0.00", got.TruePeak)
	}
}

// TestAccumulatorSilence 静音不应产生有效响度
func TestAccumulatorSilence(t *testing.T) {
	acc := NewAccumulator(44100, 2)
	acc.Write(make([]float64, 44100*5*2))
	got := acc.Result()
	if got.Integrated != 0 {
		t.Errorf("静音应得到 Integrated=0（不补偿），实际 %.2f", got.Integrated)
	}
}

// TestAccumulatorTooShort 短于一个门限块（400ms）时拿不到整合响度
func TestAccumulatorTooShort(t *testing.T) {
	acc := NewAccumulator(44100, 2)
	// 200ms
	acc.Write(make([]float64, 44100/5*2))
	if got := acc.Result(); got.Integrated != 0 {
		t.Errorf("不足 400ms 时应拿不到整合响度，实际 %.2f", got.Integrated)
	}
}

// TestAccumulatorChunkingIsIrrelevant 喂块大小不能影响结果
//
// 这是流式实现最容易出错的地方：滑动窗口、块步进、真峰值跨块尾部保留，
// 任何一处把"喂块边界"当成"分析边界"都会让结果随喂法变化。
func TestAccumulatorChunkingIsIrrelevant(t *testing.T) {
	rate := 44100
	n := rate * 3
	interleaved := make([]float64, n*2)
	for i := 0; i < n; i++ {
		v := 0.7 * math.Sin(2*math.Pi*440*float64(i)/float64(rate))
		interleaved[i*2] = v
		interleaved[i*2+1] = v
	}

	var results []float64
	for _, chunk := range []int{1, 997, 4096, 44100, n} {
		acc := NewAccumulator(rate, 2)
		for start := 0; start < n; start += chunk {
			end := start + chunk
			if end > n {
				end = n
			}
			acc.Write(interleaved[start*2 : end*2])
		}
		results = append(results, acc.Result().Integrated)
	}
	for i := 1; i < len(results); i++ {
		if math.Abs(results[i]-results[0]) > 0.02 {
			t.Errorf("喂块大小改变了结果：%v（第 %d 个与第 1 个不同）", results, i+1)
		}
	}
}

/* --------------------------------------------------------------------------
   播放优先队列
   --------------------------------------------------------------------------
   用户的要求：「不能播放一首处理一首，应该改为优先处理播放的歌曲」。
   下面这组测试钉住队列的两条规则：
     · 交互请求插到队首；
     · 后台批量在有人排队时让路。
   -------------------------------------------------------------------------- */

func TestQueuePicksUrgentFirst(t *testing.T) {
	m := NewManager(t.TempDir(), 1)

	// 先把槽位占满：塞一个会一直跑到我们放行为止的"任务"。
	// 这里直接用队列的内部状态做白盒测试 —— 我们要验的就是调度顺序本身，
	// 而真跑 ffmpeg 会让用例慢且依赖外部二进制。
	songs := make([]bootstrap.Song, 3)
	for i := range songs {
		songs[i] = bootstrap.Song{
			ID:   string(rune('a' + i)),
			Path: `D:\m\` + string(rune('a'+i)) + `.flac`,
			Size: int64(i + 1), ModTime: 1,
		}
	}

	q := &m.q
	q.mu.Lock()
	// 模拟"正在跑 1 个"（conc=1）
	q.running = 1
	q.started = true
	q.mu.Unlock()

	normal := &Request{Song: songs[0], Priority: PriorityNormal, Done: make(chan struct{})}
	if !m.enqueue(normal) {
		t.Fatal("普通请求应能入队")
	}
	urgent := &Request{Song: songs[1], Priority: PriorityInterrupt, Done: make(chan struct{})}
	if !m.enqueue(urgent) {
		t.Fatal("交互请求应能入队")
	}

	// 现在放行：下一个被取出的必须是交互请求
	q.mu.Lock()
	q.running = 0
	q.mu.Unlock()

	got := m.nextRequest()
	if got == nil {
		t.Fatal("应有可取的任务")
	}
	if got.Song.ID != songs[1].ID {
		t.Errorf("应先取交互请求 %s，实际取了 %s（后台任务插到了播放前面）",
			songs[1].ID, got.Song.ID)
	}
}

func TestQueueDeduplicates(t *testing.T) {
	m := NewManager(t.TempDir(), 1)
	song := bootstrap.Song{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1}

	r1 := &Request{Song: song, Priority: PriorityNormal, Done: make(chan struct{})}
	r2 := &Request{Song: song, Priority: PriorityInterrupt, Done: make(chan struct{})}
	if !m.enqueue(r1) {
		t.Fatal("第一次入队应成功")
	}
	if m.enqueue(r2) {
		t.Error("同一首歌重复入队应被去重（否则会跑两次 ffmpeg）")
	}
	if got := m.Pending(); got != 1 {
		t.Errorf("队列里应只有 1 条，实际 %d", got)
	}
}

// TestYieldIfPending 批量任务必须能感知到"有人在等"
//
// 这是让路的触发条件：YieldIfPending 返回 true 时，MeasureAll 会停下等它清空。
func TestYieldIfPending(t *testing.T) {
	m := NewManager(t.TempDir(), 2)
	if m.YieldIfPending() {
		t.Error("空队列时不该要求让路")
	}

	song := bootstrap.Song{ID: "u", Path: `D:\m\u.flac`, Size: 1, ModTime: 1}
	// 只入队、不跑（用 enqueue 而不是 Submit，避免真起 ffmpeg）
	m.enqueue(&Request{Song: song, Priority: PriorityInterrupt, Done: make(chan struct{})})

	if !m.YieldIfPending() {
		t.Error("有交互请求排队时，后台任务必须让路")
	}
}

// TestSubmitReturnsCachedImmediately 已测量的歌不进队列（快速路径）
func TestSubmitReturnsCachedImmediately(t *testing.T) {
	m := NewManager(t.TempDir(), 2)
	song := bootstrap.Song{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1}
	m.Store(song, Measurement{Integrated: -20, TruePeak: -3, Measured: true})

	done := make(chan struct{})
	var item Measurement
	go func() {
		item, _ = m.Submit(context.Background(), song, PriorityInterrupt)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("已测量的歌应立刻返回，不该进队列等 ffmpeg")
	}
	if math.Abs(item.Integrated-(-20)) > 1e-9 {
		t.Errorf("返回的测量值不对: %+v", item)
	}
	if got := m.Pending(); got != 0 {
		t.Errorf("快速路径不该产生排队项，实际 %d", got)
	}
}

// TestSubmitContextCancel 取消后 Submit 立刻返回，且不再等结果
func TestSubmitContextCancel(t *testing.T) {
	m := NewManager(t.TempDir(), 2)
	song := bootstrap.Song{ID: "a", Path: `D:\m\a.flac`, Size: 1, ModTime: 1}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	start := time.Now()
	_, err := m.Submit(ctx, song, PriorityInterrupt)
	if err == nil {
		t.Error("已取消的 ctx 应当返回错误")
	}
	if elapsed := time.Since(start); elapsed > 500*time.Millisecond {
		t.Errorf("取消后应立即返回，实际花了 %v", elapsed)
	}
}

/* --------------------------------------------------------------------------
   并发上限的实测：并发 2 时必须真的只有 2 个在跑
   -------------------------------------------------------------------------- */

// TestQueueRespectsConcurrency 队列不能突破并发上限
//
// 这是「不要让风扇狂转」的硬约束：无论排了多少首歌，同时在跑的
// 测量数都不能超过 concurrency。
func TestQueueRespectsConcurrency(t *testing.T) {
	m := NewManager(t.TempDir(), 2)
	if m.Concurrency() != 2 {
		t.Fatalf("并发上限应为 2，实际 %d", m.Concurrency())
	}

	q := &m.q
	q.mu.Lock()
	q.running = 2 // 两个槽位都占着
	q.started = true
	for i := 0; i < 5; i++ {
		s := bootstrap.Song{
			ID: string(rune('a' + i)), Path: `D:\m\` + string(rune('a'+i)) + `.flac`,
			Size: int64(i + 1), ModTime: 1,
		}
		q.queue = append(q.queue, &Request{Song: s, Priority: PriorityNormal, Done: make(chan struct{})})
	}
	q.mu.Unlock()

	if got := m.nextRequest(); got != nil {
		t.Error("槽位已满时不该再取任务（否则并发会失控）")
	}
}

// TestQueueConcurrentSubmitIsSafe 并发入队不能丢任务。
//
// ★ 断言方式必须与调度器的记账语义对齐，否则会变成一条**时序敏感**的
// 假失败（在 Windows 上恰好通过、在 Linux CI 上失败）。
//
// 调度器的记账是分段的（见 manager.go）：
//
//	入队    → q.queued[key]=true，进 q.queue / q.urgent
//	出队    → dropQueuedLocked 立刻把 key 从 q.queued 删掉，再交给 goroutine
//	跑完    → q.running--，close(req.Done)
//
// 也就是说「queued + running」**只在任务还没跑完时有意义**。原实现把断言
// 放在 wg.Wait() 之后，而在 Linux 上这些请求会用不存在的路径（`D:\m\...`）
// 立刻失败跑完 —— 于是它们既不在 queued 里、也不在 running 里，
// 总数自然凑不齐 50（实测 30）。那不是并发 bug，是断言用错了量。
//
// 这里改成等**每个请求自己的 Done**：每个 Done 必须恰好被关闭一次，
// 这就直接证明了「没有请求被无声丢弃、也没有被重复处理」——
// 与平台、与任务跑得快慢都无关。
func TestQueueConcurrentSubmitIsSafe(t *testing.T) {
	m := NewManager(t.TempDir(), 2)
	const n = 50

	// 每个请求各带一个 Done，收集起来统一等待。
	reqs := make([]*Request, n)
	for i := 0; i < n; i++ {
		reqs[i] = &Request{
			Song: bootstrap.Song{
				ID:   fmt.Sprintf("t_%d", i),
				Path: fmt.Sprintf(`D:\m\song-%d.flac`, i),
				Size: int64(i), ModTime: 1,
			},
			Priority: PriorityNormal,
			Done:     make(chan struct{}),
		}
	}

	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			m.enqueue(reqs[i])
		}(i)
	}
	wg.Wait()

	// ★ 核心断言：每个请求都必须**恰好完成一次**。
	//
	// 用 Done 而不是队列长度：Done 由调度器在任务真正跑完之后关闭，
	// 它是"这个请求被处理过了"的唯一可靠证据。若某个请求被丢弃，
	// 它的 Done 永远不会关闭，这里就会超时失败。
	done := make(chan struct{}, n)
	for _, r := range reqs {
		go func(r *Request) {
			<-r.Done
			done <- struct{}{}
		}(r)
	}

	deadline := time.After(30 * time.Second)
	for i := 0; i < n; i++ {
		select {
		case <-done:
		case <-deadline:
			t.Fatalf("等第 %d/%d 个请求完成超时 —— 有请求被无声丢弃了", i+1, n)
		}
	}

	// 去重集合不该超过请求数（重复入队会让它多计）
	q := &m.q
	q.mu.Lock()
	seen := len(q.queued)
	queued := len(q.urgent) + len(q.queue)
	running := q.running
	q.mu.Unlock()

	if seen > n {
		t.Errorf("去重集合不该超过 %d，实际 %d", n, seen)
	}
	// 全部跑完之后，队列里不该还压着东西
	if queued != 0 || running != 0 {
		t.Errorf("全部请求完成后队列应为空，实际 排队 %d + 运行 %d", queued, running)
	}
}
