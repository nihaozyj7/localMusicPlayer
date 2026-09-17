package lyricsfetch

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

// cancelRecordingProvider 记录自己的 ctx 是否被取消 —— 用来证明「强命中提前收工」
// 会真的掐掉还在跑的来源，而不是让它们继续跑到 providerTimeout。
type cancelRecordingProvider struct {
	name     string
	delay    time.Duration
	title    string
	artist   string
	started  atomic.Int32
	canceled atomic.Int32
	finished atomic.Int32
}

func (p *cancelRecordingProvider) Name() string { return p.name }

func (p *cancelRecordingProvider) Search(ctx context.Context, _ SearchRequest) ([]Candidate, error) {
	p.started.Add(1)
	select {
	case <-time.After(p.delay):
		p.finished.Add(1)
		return []Candidate{{ID: p.name, Title: p.title, Artist: p.artist, HasLyrics: true}}, nil
	case <-ctx.Done():
		p.canceled.Add(1)
		return nil, ctx.Err()
	}
}

func (p *cancelRecordingProvider) Fetch(_ context.Context, _ Candidate) (Result, error) {
	return Result{LRC: "[00:00.00]hi", Provider: p.name}, nil
}

// 修复前：Search 因「强命中 + grace 窗口到点」提前返回，但慢来源的 goroutine
// 仍会继续跑到自己的 providerTimeout（默认 6s），期间占着一条在途 HTTP 请求。
// 修复后：scancel() 立刻中止它们。
//
// 断言方式：慢来源必须观察到 ctx 被取消（而不是正常跑完），
// 且在 Search 返回后很短时间内就结束 —— 而不是等满它的 delay。
func TestSearchCancelsSlowProvidersOnEarlyReturn(t *testing.T) {
	fast := &cancelRecordingProvider{name: "fast", title: "晴天", artist: "周杰伦"}
	// 慢来源的 delay 远大于 searchGrace + providerTimeout 之前的观察窗口。
	slow := &cancelRecordingProvider{name: "slow", delay: 30 * time.Second, title: "不相关", artist: "谁"}
	agg := NewAggregator(fast, slow)

	_, err := agg.Search(context.Background(), SearchRequest{Title: "晴天", Artist: "周杰伦"})
	if err != nil {
		t.Fatalf("Search 失败: %v", err)
	}

	// 给取消传播一点时间（goroutine 需要被调度到）。
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if slow.canceled.Load() > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	if slow.canceled.Load() == 0 {
		t.Fatalf("慢来源没有观察到取消（started=%d finished=%d）—— "+
			"提前收工后它仍在跑满 providerTimeout", slow.started.Load(), slow.finished.Load())
	}
	if slow.finished.Load() != 0 {
		t.Fatalf("慢来源竟然正常跑完了（delay=%v）", slow.delay)
	}
}

// 反向保证：没有提前收工时，所有来源都必须被正常等待（不能把正常路径也掐掉）。
func TestSearchWaitsForAllProvidersWithoutStrongMatch(t *testing.T) {
	a := &cancelRecordingProvider{name: "a", delay: 50 * time.Millisecond, title: "甲", artist: "x"}
	b := &cancelRecordingProvider{name: "b", delay: 50 * time.Millisecond, title: "乙", artist: "y"}
	agg := NewAggregator(a, b)

	got, err := agg.Search(context.Background(), SearchRequest{Title: "完全不匹配的标题", Artist: "zzz"})
	if err != nil {
		t.Fatalf("Search 失败: %v", err)
	}
	if a.finished.Load() != 1 || b.finished.Load() != 1 {
		t.Fatalf("两个来源都应正常跑完：a=%d b=%d", a.finished.Load(), b.finished.Load())
	}
	if len(got) < 2 {
		t.Fatalf("应收到两个来源的候选，实际 %d", len(got))
	}
}
