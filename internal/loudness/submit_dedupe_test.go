package loudness

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"localmusicplayer/internal/bootstrap"
)

// TestSubmitDedupeWaiterGetsPrerequisiteResult 守「去重等待者共享前置请求结果」。
//
// 回归的缺陷：等待者只轮询 m.Get(song)，只看得到「成功」这一种结局。前置请求
// 失败（这里是文件不存在）时缓存永远不会有这首歌，等待者只能一路等自己的 ctx
// 超时 —— 生产路径上 Measure 的 ctx 是 3 分钟，用户看到「测量中」卡满 3 分钟 +
// 一条误导性的 context deadline exceeded。
func TestSubmitDedupeWaiterGetsPrerequisiteResult(t *testing.T) {
	m := NewManager(t.TempDir(), 2)
	song := bootstrap.Song{
		ID:      "probe-dedupe-1",
		Path:    filepath.Join(t.TempDir(), "definitely-not-here.mp3"),
		Size:    12345,
		ModTime: 67890,
	}

	// 占住并发槽位，让调度器暂时取不走下面的请求，制造一个稳定的「去重窗口」
	// （不改 m.conc，避免与调度器竞争同一个字段）。
	m.q.mu.Lock()
	m.q.running = m.conc
	m.q.mu.Unlock()

	first := &Request{Song: song, Priority: PriorityInterrupt, Done: make(chan struct{})}
	if !m.enqueue(first) {
		t.Fatal("前置请求没有入队")
	}
	go func() {
		time.Sleep(150 * time.Millisecond)
		m.q.mu.Lock()
		m.q.running = 0
		m.q.mu.Unlock()
		m.signalWake()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	start := time.Now()
	_, err := m.Submit(ctx, song, PriorityNormal)
	elapsed := time.Since(start)

	select {
	case <-first.Done:
	default:
		t.Fatal("前置请求还没有结束")
	}
	if err == nil {
		t.Fatal("前置测量必然失败（文件不存在），等待者也应拿到错误")
	}
	if errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("等待者等到了自己的 ctx 超时（%v）—— 前置请求的结果没有被共享", err)
	}
	if err.Error() != first.Err.Error() {
		t.Fatalf("等待者拿到的错误 %v 与前置请求 %v 不一致", err, first.Err)
	}
	if elapsed > 3*time.Second {
		t.Fatalf("等待者耗时 %v，应当在前置请求结束时就返回", elapsed)
	}
}

// TestSubmitDedupeWaiterRetriesWhenPrerequisiteCancelled 守「前置被取消时
// 等待者自己接着测」。
//
// 前置请求的发起方取消（用户点「取消批量测量」/切歌）后，请求会被调度器
// 直接丢弃。等待者不能把这个当成自己的失败：它的 ctx 还活着，应当重新入队
// 自己测，拿到真实结果或真实错误。
func TestSubmitDedupeWaiterRetriesWhenPrerequisiteCancelled(t *testing.T) {
	m := NewManager(t.TempDir(), 2)
	song := bootstrap.Song{
		ID:      "probe-dedupe-2",
		Path:    filepath.Join(t.TempDir(), "still-not-here.mp3"),
		Size:    1,
		ModTime: 1,
	}

	m.q.mu.Lock()
	m.q.running = m.conc
	m.q.mu.Unlock()

	first := &Request{Song: song, Priority: PriorityInterrupt, Done: make(chan struct{})}
	if !m.enqueue(first) {
		t.Fatal("前置请求没有入队")
	}

	type outcome struct {
		err     error
		elapsed time.Duration
	}
	done := make(chan outcome, 1)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	go func() {
		start := time.Now()
		_, err := m.Submit(ctx, song, PriorityNormal)
		done <- outcome{err: err, elapsed: time.Since(start)}
	}()

	// 等等待者挂到前置请求上，再模拟「前置请求的发起方取消」。
	time.Sleep(150 * time.Millisecond)
	m.cancelRequest(first)
	m.q.mu.Lock()
	m.q.running = 0
	m.q.mu.Unlock()
	m.signalWake()

	select {
	case out := <-done:
		if out.err == nil {
			t.Fatal("等待者重试后应自己测出失败（文件不存在）")
		}
		if errors.Is(out.err, ErrSuperseded) {
			t.Fatalf("等待者把「前置被取消」当成了自己的失败（%v）—— 应当自己接着测", out.err)
		}
		if errors.Is(out.err, context.DeadlineExceeded) {
			t.Fatalf("等待者等到了自己的 ctx 超时（%v）", out.err)
		}
		if out.elapsed > 5*time.Second {
			t.Fatalf("等待者耗时 %v", out.elapsed)
		}
	case <-time.After(8 * time.Second):
		t.Fatal("等待者没有返回")
	}

	select {
	case <-first.Done:
	default:
		t.Fatal("前置请求应当已被调度器作废并关闭 Done")
	}
}

// TestSubmitDedupeManyWaitersShareOneInFlight 并发多等待者：不该互相拖死、
// 不该泄漏「在飞」条目，也不该把别人的 ctx 超时当成结果。
//
// 这是 singleflight 改动的压力回归：16 个 goroutine 同时 Submit 同一首歌，
// 全部必须在远小于 ctx 的时间内返回（同一首失败歌共享同一个错误），
// 结束后 q.flight 必须为空、运行槽归零，不能留下永不关闭的 Done。
func TestSubmitDedupeManyWaitersShareOneInFlight(t *testing.T) {
	m := NewManager(t.TempDir(), 2)
	song := bootstrap.Song{
		ID:      "probe-dedupe-3",
		Path:    filepath.Join(t.TempDir(), "nobody-here.mp3"),
		Size:    7,
		ModTime: 7,
	}

	const waiters = 16
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	errs := make(chan error, waiters)
	var wg sync.WaitGroup
	start := time.Now()
	for i := 0; i < waiters; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := m.Submit(ctx, song, PriorityNormal)
			errs <- err
		}()
	}

	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(8 * time.Second):
		t.Fatal("有等待者没有返回 —— 去重路径可能死锁或泄漏了 goroutine")
	}
	elapsed := time.Since(start)

	close(errs)
	for err := range errs {
		if err == nil {
			t.Fatal("文件不存在，每个等待者都应该拿到错误")
		}
		if errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("等待者被自己的 ctx 超时兜走了：%v", err)
		}
	}
	if elapsed > 6*time.Second {
		t.Fatalf("%d 个等待者耗时 %v，应当共享同一次测量快速返回", waiters, elapsed)
	}

	q := &m.q
	q.mu.Lock()
	left := len(q.flight)
	running := q.running
	q.mu.Unlock()
	if left != 0 || running != 0 {
		t.Fatalf("结束后不该留下在飞条目 / 运行槽：flight=%d running=%d", left, running)
	}
}
