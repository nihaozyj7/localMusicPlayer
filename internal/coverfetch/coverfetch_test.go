package coverfetch

import (
	"context"
	"strings"
	"testing"
)

// 网易图片地址的拼装：去重已有 param 再补尺寸参数。
// 拼错不会报错，只会静默拿到原图或 404，所以必须有断言。
func TestNeteaseSized(t *testing.T) {
	cases := []struct{ in, want string }{
		{"https://p1.music.126.net/abc/123.jpg", "https://p1.music.126.net/abc/123.jpg?param=500y500"},
		{"https://p1.music.126.net/abc/123.jpg?param=100y100", "https://p1.music.126.net/abc/123.jpg?param=500y500"},
		{"", ""},
	}
	for _, c := range cases {
		if got := neteaseSized(c.in, 500); got != c.want {
			t.Errorf("neteaseSized(%q) = %q，期望 %q", c.in, got, c.want)
		}
	}
}

func TestAllowedImageURL(t *testing.T) {
	allow := []string{
		"https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
		"https://cdn-images.dzcdn.net/images/cover/x/1000x1000.jpg",
		"https://coverartarchive.org/release-group/abc/front-500",
		"https://p1.music.126.net/abc/123.jpg",
		"https://i0.hdslb.com/bfs/archive/x.jpg",
	}
	for _, u := range allow {
		if !AllowedImageURL(u) {
			t.Errorf("应放行: %s", u)
		}
	}

	deny := []string{
		"",
		"file:///C:/Windows/win.ini",
		"http://127.0.0.1:8080/admin",
		"http://localhost/secret",
		"http://192.168.1.1/",
		"https://evil.example.com/x.jpg",
		"javascript:alert(1)",
	}
	for _, u := range deny {
		if AllowedImageURL(u) {
			t.Errorf("应拒绝: %s", u)
		}
	}
}

func TestBigArtwork(t *testing.T) {
	in := "https://is1-ssl.mzstatic.com/image/thumb/Music/x.jpg/100x100bb.jpg"
	got := bigArtwork(in)
	if !strings.Contains(got, "/600x600bb.jpg") {
		t.Fatalf("iTunes 缩略图未升级为大图: %q", got)
	}
}

func TestStripNoiseAndLuceneEscape(t *testing.T) {
	if got := stripNoise("晴天 (Live版)"); got != "晴天" {
		t.Fatalf("stripNoise 结果不对: %q", got)
	}
	if got := stripNoise("(纯音乐)"); got != "(纯音乐)" {
		t.Fatalf("整串都在括号里时应保留原文: %q", got)
	}
	if got := luceneEscape("a+b:c"); strings.ContainsAny(got, "+:") {
		t.Fatalf("luceneEscape 未转义保留字符: %q", got)
	}
}

func TestScoreMatchPrefersExact(t *testing.T) {
	req := Request{Title: "晴天", Artist: "周杰伦"}
	exact := scoreMatch(req, "晴天", "周杰伦", "", 0)
	loose := scoreMatch(req, "晴天 (深情版)", "Lucky小爱", "", 0)
	if exact <= loose {
		t.Fatalf("精确匹配应得分更高: exact=%d loose=%d", exact, loose)
	}
}

// confirmMatch 必须挡掉「完全不相关」的结果。
//
// 这条断言来自实测：早期只用 scoreMatch 排序，查「zzzz不存在的歌曲zzzz」
// 也会返回一张封面 —— 对用户来说错的封面比没有封面更糟。
func TestConfirmMatchRejectsIrrelevant(t *testing.T) {
	junk := Request{Title: "zzzz不存在的歌曲zzzz", Artist: "nobody"}.Normalize()
	if confirmMatch(junk, "晴天", "周杰伦") {
		t.Fatal("完全无关的候选不应被确认")
	}
	if confirmMatch(junk, "Lucky小爱", "") {
		t.Fatal("完全无关的候选（无歌手信息）不应被确认")
	}

	real := Request{Title: "晴天", Artist: "周杰伦"}.Normalize()
	if !confirmMatch(real, "晴天", "周杰伦") {
		t.Fatal("精确匹配应被确认")
	}
	if !confirmMatch(real, "晴天 (女版)", "田各田各") {
		t.Fatal("标题包含时即使歌手不同也应被确认（需求明确不要求太精确）")
	}
	// 来源不带歌手字段 → 视为信息不足，不应因此否决
	if !confirmMatch(real, "晴天", "") {
		t.Fatal("来源不带歌手信息时不应被否决")
	}
	// 本地文件没有歌手标签、只能按标题找封面时，标题命中就够了
	noArtist := Request{Title: "晴天"}.Normalize()
	if !confirmMatch(noArtist, "晴天", "周杰伦") {
		t.Fatal("请求侧没有歌手时不应按歌手否决")
	}

	// 标题只是弱命中（相似度过线但既不相等也不包含）且歌手完全不相干 → 否决
	weak := Request{Title: "晴空万里", Artist: "周杰伦"}.Normalize()
	if confirmMatch(weak, "Poker Face", "Lady Gaga") {
		t.Fatal("标题弱命中且歌手不相干时应否决")
	}
	// 标题完全不相干 → 直接否决，连歌手都不用看
	other := Request{Title: "晴天", Artist: "周杰伦"}.Normalize()
	if confirmMatch(other, "Poker Face", "Lady Gaga") {
		t.Fatal("标题与歌手都不相干时应否决")
	}
}

func TestSimilarity(t *testing.T) {
	if s := similarity("晴天", "晴天"); s != 1 {
		t.Fatalf("相同串相似度应为 1，实际 %v", s)
	}
	if s := similarity("晴天", "zzzz"); s > 0.3 {
		t.Fatalf("完全不同的串相似度应很低，实际 %v", s)
	}
}

// 请求关键词：标题里已经含歌手时不要重复拼接（会拉低搜索命中率）。
func TestRequestKeyword(t *testing.T) {
	r := Request{Title: "周杰伦 - 晴天", Artist: "周杰伦"}.Normalize()
	if got := r.Keyword(); got != "周杰伦 - 晴天" {
		t.Fatalf("标题已含歌手时不应重复: %q", got)
	}
	r2 := Request{Title: "晴天", Artist: "周杰伦"}.Normalize()
	if got := r2.Keyword(); got != "晴天 周杰伦" {
		t.Fatalf("关键词拼接不对: %q", got)
	}
}

// 单来源失败不能影响整体：一个必失败来源 + 一个返回固定图的来源。
func TestAggregatorIgnoresFailingProvider(t *testing.T) {
	agg := New(&stubProvider{name: "boom", fail: true}, &stubProvider{
		name: "ok",
		cover: Cover{
			URL:      "https://p1.music.126.net/abc/1.jpg",
			Provider: "ok",
			Score:    70,
		},
	})
	cover, err := agg.Find(context.Background(), Request{Title: "x", Artist: "y"})
	if err != nil {
		t.Fatalf("应取到 ok 来源的封面: %v", err)
	}
	if cover.Provider != "ok" {
		t.Fatalf("来源应为 ok，实际 %s", cover.Provider)
	}
}

// 全部来源都没命中时的兜底与负缓存。
func TestAggregatorFallbackAndNotFound(t *testing.T) {
	agg := New(&stubProvider{name: "empty"})
	if _, err := agg.Find(context.Background(), Request{Title: "x"}); err != ErrNotFound {
		t.Fatalf("无结果时应返回 ErrNotFound，实际 %v", err)
	}
	// 命中负缓存后再查一次，仍然是 ErrNotFound（不会 panic 或返回半成品）
	if _, err := agg.Find(context.Background(), Request{Title: "x"}); err != ErrNotFound {
		t.Fatalf("负缓存路径应同样返回 ErrNotFound，实际 %v", err)
	}

	// FallbackURL 只在白名单内才生效
	agg2 := New(&stubProvider{name: "empty"})
	if _, err := agg2.Find(context.Background(), Request{
		Title:       "y",
		FallbackURL: "http://127.0.0.1/secret.jpg",
	}); err != ErrNotFound {
		t.Fatalf("非白名单兜底地址不应被使用，实际 %v", err)
	}
	cover, err := agg2.Find(context.Background(), Request{
		Title:       "z",
		FallbackURL: "https://i0.hdslb.com/bfs/archive/x.jpg",
	})
	if err != nil {
		t.Fatalf("白名单兜底地址应生效: %v", err)
	}
	if cover.Provider != "fallback" {
		t.Fatalf("兜底来源应为 fallback，实际 %s", cover.Provider)
	}
}

type stubProvider struct {
	name  string
	fail  bool
	cover Cover
}

func (s *stubProvider) Name() string { return s.name }

func (s *stubProvider) Find(_ context.Context, _ Request) (FindResult, error) {
	if s.fail {
		return FindResult{}, errStub
	}
	return FindResult{Cover: s.cover}, nil
}

var errStub = &stubError{"stub provider failed"}

type stubError struct{ msg string }

func (e *stubError) Error() string { return e.msg }
