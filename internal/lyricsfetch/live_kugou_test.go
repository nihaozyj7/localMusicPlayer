package lyricsfetch

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"localmusicplayer/internal/lyrics"
)

/* --------------------------------------------------------------------------
   酷狗来源的**真实网络**回归（默认跳过）
   --------------------------------------------------------------------------
   上面的 httptest 用例锁的是解析逻辑，但那些 JSON 是我自己写的 —— 上游改了
   字段名、或者我当初就把字段抄错了，它们一律是绿的。这条用例直接打真接口，
   把「搜索 → 反查 → 下载 → KRC 解码」整条链走一遍，并确认拿到的确实是
   **字级（逐字）**歌词。

   默认不跑（CI 没有稳定的第三方网络）：`LMPLAYER_LIVE_KUGOU=1 go test ./internal/lyricsfetch/ -run Live -v`
   -------------------------------------------------------------------------- */

func TestLiveKugouSearchAndFetchWordLevel(t *testing.T) {
	if os.Getenv("LMPLAYER_LIVE_KUGOU") != "1" {
		t.Skip("需要 LMPLAYER_LIVE_KUGOU=1 才跑真实网络测试")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	p := NewKugou()
	cands, err := p.Search(ctx, SearchRequest{Title: "晴天", Artist: "周杰伦", Duration: 269000, Limit: 5})
	if err != nil {
		t.Fatalf("搜索失败: %v", err)
	}
	if len(cands) == 0 {
		t.Fatal("没有搜到任何候选")
	}
	first := cands[0]
	// 歌名/歌手要能对上（这条正是「只给关键词时 song/singer 会错位」的守卫）
	if !strings.Contains(first.Title, "晴天") {
		t.Fatalf("第一条候选的歌名不对（字段抄错了？）: %+v", first)
	}
	if !strings.Contains(first.Artist, "周杰伦") {
		t.Fatalf("第一条候选的歌手不对: %+v", first)
	}
	if first.Duration < 200000 || first.Duration > 400000 {
		t.Fatalf("时长换算不对（秒/毫秒？）: %d", first.Duration)
	}
	if first.ID == "" || !strings.Contains(first.ID, "_") {
		t.Fatalf("候选 ID 里应当有 hash 与时长: %q", first.ID)
	}

	res, err := p.Fetch(ctx, first)
	if err != nil {
		t.Fatalf("抓取失败: %v", err)
	}
	if !lyrics.HasWordTiming(res.LRC) {
		t.Fatalf("这条应当是字级歌词（KRC），实际拿到行级：%q", truncate(res.LRC, 200))
	}
	if FormatOf(res.LRC) != FormatWord {
		t.Fatalf("FormatOf 判定不对: %s", FormatOf(res.LRC))
	}
	t.Logf("拿到字级歌词 %d 字节，开头：%s", len(res.LRC), truncate(res.LRC, 120))
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// 自动匹配的整体行为：真实来源 + 真实网络下，「晴天」应当匹配到**字级**歌词。
//
// 这条覆盖的是 Match 里那段「拿到行级之后为字级来源多花一次请求」的策略 ——
// 单测里两个来源都是假的，只能证明逻辑；这里证明它在真接口上确实生效。
func TestLiveAggregatorMatchPrefersWordLevel(t *testing.T) {
	if os.Getenv("LMPLAYER_LIVE_KUGOU") != "1" {
		t.Skip("需要 LMPLAYER_LIVE_KUGOU=1 才跑真实网络测试")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	res, err := NewAggregator().Match(ctx, SearchRequest{Title: "晴天", Artist: "周杰伦", Duration: 269000, Limit: 12})
	if err != nil {
		t.Fatalf("Match 失败: %v", err)
	}
	if !lyrics.HasWordTiming(res.LRC) {
		t.Fatalf("应当匹配到字级歌词，实际来源 %s：%q", res.Provider, truncate(res.LRC, 200))
	}
	t.Logf("匹配到 %s（%s - %s）%d 字节，含逐字时间轴",
		res.Provider, res.Candidate.Title, res.Candidate.Artist, len(res.LRC))
}
