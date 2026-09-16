package lyricsfetch

import (
	"context"
	"testing"
)

/* --------------------------------------------------------------------------
   时长优先：自动匹配歌词必须先挑「时长对得上」的那一版
   --------------------------------------------------------------------------
   实测场景：原唱 / 伴奏 / Live / 翻唱常常标题与歌手完全一样，只有时长
   差几十秒。纯按分数排会选中错误的那一版，歌词整首对不上。
*/

func TestOrderByDurationPromotesExactMatch(t *testing.T) {
	want := int64(240000) // 4:00
	// 分数更高的那一版时长差了 30 秒（Live / 伴奏），分数低一档的才是原唱
	cands := []Candidate{
		{ID: "live", Provider: "p1", Title: "歌", Artist: "歌手", Duration: 270000, Score: 100},
		{ID: "studio", Provider: "p2", Title: "歌", Artist: "歌手", Duration: 241000, Score: 93},
	}
	got := orderByDuration(cands, want)
	if got[0].ID != "studio" {
		t.Fatalf("时长一致的原唱应排第一，实际第一位是 %q（%dms）", got[0].ID, got[0].Duration)
	}
	if len(got) != 2 {
		t.Fatalf("候选不应丢失，实际 %d 条", len(got))
	}
}

func TestOrderByDurationFallsBackWhenNothingMatches(t *testing.T) {
	want := int64(240000)
	cands := []Candidate{
		{ID: "a", Provider: "p1", Duration: 300000, Score: 100},
		{ID: "b", Provider: "p2", Duration: 330000, Score: 90},
	}
	got := orderByDuration(cands, want)
	if got[0].ID != "a" || got[1].ID != "b" {
		t.Fatalf("没有时长对得上的候选时应保持原顺序，实际 %q, %q", got[0].ID, got[1].ID)
	}
}

// 分数差得太远（超出 durationRankWindow）的候选不能被时长顶上来：
// 「标题只沾边、时长刚好一样」的结果就是错的歌词。
func TestOrderByDurationKeepsLowScoreCandidateDown(t *testing.T) {
	want := int64(240000)
	cands := []Candidate{
		{ID: "good", Provider: "p1", Title: "歌", Artist: "歌手", Duration: 300000, Score: 100},
		{ID: "junk", Provider: "p2", Title: "别的歌", Duration: 240000, Score: 40},
	}
	got := orderByDuration(cands, want)
	if got[0].ID != "good" {
		t.Fatalf("低分候选不该因时长一致被顶到第一，实际 %q", got[0].ID)
	}
}

// 来源没给时长时不能被当成「时长一致」，也不能排到给得出时长的候选之前。
func TestOrderByDurationUnknownDurationSortsLast(t *testing.T) {
	want := int64(240000)
	cands := []Candidate{
		{ID: "unknown", Provider: "p1", Duration: 0, Score: 100},
		{ID: "exact", Provider: "p2", Duration: 240500, Score: 90},
	}
	got := orderByDuration(cands, want)
	if got[0].ID != "exact" {
		t.Fatalf("有明确时长且对得上的候选应在前，实际 %q", got[0].ID)
	}
}

// 目标时长未知（0）时整段逻辑不生效 —— 不能凭空调序。
func TestOrderByDurationNoTarget(t *testing.T) {
	cands := []Candidate{{ID: "a", Duration: 1000, Score: 50}, {ID: "b", Duration: 2000, Score: 90}}
	got := orderByDuration(cands, 0)
	if got[0].ID != "a" {
		t.Fatal("目标时长未知时不应重排")
	}
}

type staticProvider struct {
	name  string
	items []Candidate
	err   error
}

func (s *staticProvider) Name() string { return s.name }
func (s *staticProvider) Search(context.Context, SearchRequest) ([]Candidate, error) {
	out := make([]Candidate, len(s.items))
	copy(out, s.items)
	for i := range out {
		if out[i].Provider == "" {
			out[i].Provider = s.name
		}
	}
	return out, s.err
}
func (s *staticProvider) Fetch(_ context.Context, c Candidate) (Result, error) {
	return Result{LRC: "[00:00.00]" + c.ID, Provider: s.name}, nil
}

// 端到端：Search 返回的顺序里，时长对得上的那一版必须在前面。
func TestSearchPrefersMatchingDuration(t *testing.T) {
	p := &staticProvider{name: "p", items: []Candidate{
		{ID: "live", Title: "歌", Artist: "歌手", Duration: 275000, HasLyrics: true},
		{ID: "studio", Title: "歌", Artist: "歌手", Duration: 240400, HasLyrics: true},
	}}
	agg := NewAggregator(p)
	got, err := agg.Search(context.Background(), SearchRequest{Title: "歌", Artist: "歌手", Duration: 240000})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(got) != 2 || got[0].ID != "studio" {
		t.Fatalf("时长一致的原唱应排第一，实际 %+v", got)
	}
}

// Match 自动匹配必须抓到「时长对得上」的那一版，而不是分数最高的那一版。
func TestMatchPicksDurationMatch(t *testing.T) {
	p := &staticProvider{name: "p", items: []Candidate{
		{ID: "live", Title: "歌", Artist: "歌手", Duration: 275000, HasLyrics: true},
		{ID: "studio", Title: "歌", Artist: "歌手", Duration: 240400, HasLyrics: true},
	}}
	agg := NewAggregator(p)
	res, err := agg.Match(context.Background(), SearchRequest{Title: "歌", Artist: "歌手", Duration: 240000})
	if err != nil {
		t.Fatalf("Match: %v", err)
	}
	if res.Candidate.ID != "studio" {
		t.Fatalf("Match 应选中时长一致的候选，实际 %q", res.Candidate.ID)
	}
}
