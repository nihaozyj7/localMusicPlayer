package lyricsfetch

import (
	"context"
	"strings"
	"sync"
	"testing"
)

/* --------------------------------------------------------------------------
   自动匹配的**字级（逐字）优先**
   --------------------------------------------------------------------------
   需求：有逐字就播逐字，没有才播逐行。抓之前不知道谁是字级，所以策略是
   「先抓最匹配的那个；拿到行级时为声明了字级能力的来源再多花一次请求」。
   这里的测试守住三件事：

     · 行级（分更高）在前时，仍然换成字级那一份；
     · 字级来源也只有行级时，保留原来那份更好的（不能越试越差）；
     · 已经有字级结果时**不再多花请求**（切歌路径上的预算是硬约束）。
   -------------------------------------------------------------------------- */

// recordingProvider 记录被调用了几次、返回写死的歌词，可声明字级能力。
type recordingProvider struct {
	name  string
	items []Candidate
	lrc   string
	word  bool // 是否声明「可能给字级」（WordProvider）

	mu    sync.Mutex
	calls int
}

func (p *recordingProvider) Name() string { return p.name }

func (p *recordingProvider) Search(_ context.Context, _ SearchRequest) ([]Candidate, error) {
	out := make([]Candidate, len(p.items))
	copy(out, p.items)
	for i := range out {
		out[i].Provider = p.name
	}
	return out, nil
}

func (p *recordingProvider) Fetch(_ context.Context, c Candidate) (Result, error) {
	p.mu.Lock()
	p.calls++
	p.mu.Unlock()
	return Result{LRC: p.lrc + "[" + p.name + "]", Provider: p.name, Candidate: c}, nil
}

func (p *recordingProvider) callCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.calls
}

// wordCapableProvider = recordingProvider + HasWordLevel。
type wordCapableProvider struct{ recordingProvider }

func (p *wordCapableProvider) HasWordLevel() bool { return p.recordingProvider.word }

// 分高的来源只给行级时，仍要换成声明了字级能力的来源那一份。
func TestMatchPrefersWordLevelOverHigherScore(t *testing.T) {
	line := &recordingProvider{name: "line", lrc: "[00:01.00]行级"}
	line.items = []Candidate{{ID: "a", Title: "歌", Artist: "歌手", Duration: 240000, HasLyrics: true}}
	word := &wordCapableProvider{recordingProvider: recordingProvider{
		name:  "kugou",
		lrc:   "[00:01.00]<00:01.000>逐<00:01.300>字",
		word:  true,
		items: []Candidate{{ID: "b", Title: "歌", Artist: "歌手", Duration: 240300, HasLyrics: true}},
	}}

	agg := NewAggregator(line, word)
	res, err := agg.Match(context.Background(), SearchRequest{Title: "歌", Artist: "歌手", Duration: 240000})
	if err != nil {
		t.Fatalf("Match: %v", err)
	}
	if res.Provider != "kugou" {
		t.Fatalf("应当选中能给字级的来源，实际 %q（%q）", res.Provider, res.LRC)
	}
	if !strings.Contains(res.LRC, "<00:01.000>") {
		t.Fatalf("拿到的不是字级歌词: %q", res.LRC)
	}
	if line.callCount() != 1 || word.callCount() != 1 {
		t.Fatalf("应当各抓一次（有限的两步），实际 line=%d word=%d", line.callCount(), word.callCount())
	}
}

// 字级来源也只有行级时，必须保留分更高的那一份 —— 不能因为多试一次结果更差。
func TestMatchKeepsBetterLineLevelWhenNoWordAvailable(t *testing.T) {
	line := &recordingProvider{name: "line", lrc: "[00:01.00]行级-更好"}
	line.items = []Candidate{{ID: "a", Title: "歌", Artist: "歌手", Duration: 240000, HasLyrics: true}}
	word := &wordCapableProvider{recordingProvider: recordingProvider{
		name:  "kugou",
		lrc:   "[00:01.00]行级-更差",
		word:  true,
		items: []Candidate{{ID: "b", Title: "歌", Artist: "歌手", Duration: 240300, HasLyrics: true}},
	}}

	agg := NewAggregator(line, word)
	res, err := agg.Match(context.Background(), SearchRequest{Title: "歌", Artist: "歌手", Duration: 240000})
	if err != nil {
		t.Fatalf("Match: %v", err)
	}
	if !strings.Contains(res.LRC, "更好") {
		t.Fatalf("没有字级可换时应保留原结果，实际 %q", res.LRC)
	}
}

// 第一个候选就是字级时，不该再为第二个来源多花一次请求。
func TestMatchStopsAtFirstWordLevel(t *testing.T) {
	word := &wordCapableProvider{recordingProvider: recordingProvider{
		name:  "kugou",
		lrc:   "[00:01.00]<00:01.000>逐字",
		word:  true,
		items: []Candidate{{ID: "a", Title: "歌", Artist: "歌手", Duration: 240000, HasLyrics: true}},
	}}
	other := &recordingProvider{name: "line", lrc: "[00:01.00]行级"}
	other.items = []Candidate{{ID: "b", Title: "歌", Artist: "歌手", Duration: 240000, HasLyrics: true}}

	agg := NewAggregator(word, other)
	res, err := agg.Match(context.Background(), SearchRequest{Title: "歌", Artist: "歌手", Duration: 240000})
	if err != nil {
		t.Fatalf("Match: %v", err)
	}
	if res.Provider != "kugou" {
		t.Fatalf("应当用第一个候选，实际 %q", res.Provider)
	}
	if other.callCount() != 0 {
		t.Fatalf("已有字级结果时不该再抓别的来源，实际抓了 %d 次", other.callCount())
	}
}

// 没有声明字级能力的来源互相比时，行为与原来完全一致：一次请求、取第一个。
func TestMatchWithoutWordProviderSpendsOneFetch(t *testing.T) {
	first := &recordingProvider{name: "p1", lrc: "[00:01.00]一"}
	first.items = []Candidate{{ID: "a", Title: "歌", Artist: "歌手", Duration: 240000, HasLyrics: true}}
	second := &recordingProvider{name: "p2", lrc: "[00:01.00]二"}
	second.items = []Candidate{{ID: "b", Title: "歌", Artist: "歌手", Duration: 240300, HasLyrics: true}}

	agg := NewAggregator(first, second)
	if _, err := agg.Match(context.Background(), SearchRequest{Title: "歌", Artist: "歌手", Duration: 240000}); err != nil {
		t.Fatalf("Match: %v", err)
	}
	if first.callCount() != 1 || second.callCount() != 0 {
		t.Fatalf("应当只抓一次，实际 p1=%d p2=%d", first.callCount(), second.callCount())
	}
}

// 内置来源清单里必须有酷狗（它是唯一能给字级的那个）。
func TestDefaultAggregatorIncludesKugou(t *testing.T) {
	agg := NewAggregator()
	found := false
	for _, name := range agg.Providers() {
		if name == "kugou" {
			found = true
		}
	}
	if !found {
		t.Fatalf("内置来源里没有酷狗: %v", agg.Providers())
	}
}

// Aggregator.Fetch 按候选缓存：先探格式再点「使用」不该下载两遍。
func TestAggregatorFetchCachesByCandidate(t *testing.T) {
	p := &recordingProvider{name: "p", lrc: "[00:01.00]行级"}
	agg := NewAggregator(p)
	for i := 0; i < 3; i++ {
		if _, err := agg.Fetch(context.Background(), "p", "id-1"); err != nil {
			t.Fatalf("Fetch: %v", err)
		}
	}
	if p.callCount() != 1 {
		t.Fatalf("同一个候选应当只抓一次，实际 %d 次", p.callCount())
	}
	// 另一个候选仍然要真的去抓
	if _, err := agg.Fetch(context.Background(), "p", "id-2"); err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if p.callCount() != 2 {
		t.Fatalf("不同候选不该共用缓存，实际 %d 次", p.callCount())
	}
}
