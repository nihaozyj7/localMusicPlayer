package coverfetch

import (
	"context"
	"net/url"
	"strings"
)

// iTunesProvider 通过 Apple 的公开搜索接口取封面。
//
// 接口：https://itunes.apple.com/search?term=<关键词>&entity=song&limit=N
// 特点：无需鉴权、响应快、返回 artworkUrl100（可换成 600×600 大图）。
//
// 两个实际踩过的坑：
//   - 不要带 country 参数。实测 country=cn / us 都会让接口返回 0 条
//     （接口会按地区做很严格的曲库过滤），不带时中文关键词反而能命中。
//   - 中英文关键词都可能只命中翻唱/钢琴版，所以结果要交给 scoreMatch 排序，
//     不能盲取第一条。
type iTunesProvider struct{}

// NewITunes 创建 iTunes 来源。
func NewITunes() *iTunesProvider { return &iTunesProvider{} }

// Name 来源标识。
func (p *iTunesProvider) Name() string { return "itunes" }

// Find 查询封面。
func (p *iTunesProvider) Find(ctx context.Context, req Request) (FindResult, error) {
	req = req.Normalize()
	keyword := req.Keyword()
	if keyword == "" {
		keyword = req.Album
	}
	if keyword == "" {
		return FindResult{}, nil
	}

	q := url.Values{
		"term":   {keyword},
		"entity": {"song"},
		"limit":  {"15"},
	}

	var resp struct {
		ResultCount int `json:"resultCount"`
		Results     []struct {
			TrackName      string `json:"trackName"`
			CollectionName string `json:"collectionName"`
			ArtistName     string `json:"artistName"`
			ArtworkURL100  string `json:"artworkUrl100"`
			ArtworkURL60   string `json:"artworkUrl60"`
			TrackTimeMills int64  `json:"trackTimeMillis"`
		} `json:"results"`
	}
	endpoint := "https://itunes.apple.com/search?" + q.Encode()
	if err := getJSON(ctx, endpoint, &resp, nil); err != nil {
		return FindResult{}, err
	}
	if len(resp.Results) == 0 {
		return FindResult{}, nil
	}

	candidates := make([]Cover, 0, len(resp.Results))
	for _, item := range resp.Results {
		raw := firstNonEmpty(item.ArtworkURL100, item.ArtworkURL60)
		if raw == "" {
			continue
		}
		if !confirmMatch(req, item.TrackName, item.ArtistName) {
			continue
		}
		candidates = append(candidates, Cover{
			URL:      bigArtwork(raw),
			Provider: p.Name(),
			MIME:     "image/jpeg",
			Width:    600,
			Height:   600,
			Score: scoreMatch(req, item.TrackName, item.ArtistName, item.CollectionName,
				item.TrackTimeMills),
		})
	}
	candidates = dedupeCovers(candidates)
	if len(candidates) == 0 {
		return FindResult{}, nil
	}
	// 按可信度降序：接口返回的顺序对我们没有意义
	sortCovers(candidates)
	return FindResult{Cover: candidates[0], Candidates: candidates}, nil
}

// bigArtwork 把 100×100 的缩略图地址换成 600×600。
//
// iTunes 的图床把尺寸编码在路径里（…/100x100bb.jpg），替换即可拿到大图。
func bigArtwork(raw string) string {
	out := upgradeImageSize(raw, "/100x100bb.", "/600x600bb.")
	out = upgradeImageSize(out, "/60x60bb.", "/600x600bb.")
	out = upgradeImageSize(out, "/30x30bb.", "/600x600bb.")
	return out
}

/* --------------------------------------------------------------------------
   通用打分与「确认命中」判定
   -------------------------------------------------------------------------- */

// 相似度阈值：低于这个值的候选一律不用。
//
// 为什么不能只看分数：scoreMatch 里「标题互相包含」只给基础分，
// 一条完全无关的结果也能拿到十几分。早期版本直接用最高分返回，
// 结果查「zzzz不存在的歌曲zzzz」也会返回一张封面 —— 对用户来说这就是错的封面，
// 比没有封面更糟。
const minTitleSimilarity = 0.5

// confirmMatch 判断一条搜索结果是否**真的**匹配到了我们要找的歌。
//
// 规则刻意保守但不苛刻：
//   - 标题必须有实质重合（相等 / 互相包含 / 相似度 ≥ 0.5）；
//   - 标题已经**强命中**（完全相等或互相包含）时不再看歌手 ——
//     封面不要求太精确，而「晴天」vs「晴天(女版)」这种翻唱/衍生版本
//     是最常见的可用结果，用歌手把他挡掉反而更差；
//   - 标题只是弱命中（靠相似度勉强过线）时，歌手也完全不沾边才否决；
//   - 请求里没给歌手、或来源不带歌手字段（视为信息不足）时不否决。
func confirmMatch(req Request, title, artist string) bool {
	rt, ct := normalizeText(req.Title), normalizeText(title)
	strongTitle := false
	// 请求侧没有标题信息时只能靠歌手，此时不做标题否决
	if rt != "" && ct != "" {
		strongTitle = rt == ct || strings.Contains(ct, rt) || strings.Contains(rt, ct)
		if !strongTitle && similarity(rt, ct) < minTitleSimilarity {
			return false
		}
	}
	if strongTitle {
		return true
	}

	ra, ca := normalizeText(req.Artist), normalizeText(artist)
	if ra != "" && ca != "" {
		if ra != ca && !strings.Contains(ca, ra) && !strings.Contains(ra, ca) {
			// 歌手完全不沾边：只有在相似度也很低时才否决，
			// 避免「周杰伦」vs「Jay Chou」这种同人不同写法被误杀
			if similarity(ra, ca) < 0.34 {
				return false
			}
		}
	}
	return true
}

// scoreMatch 给一条搜索结果打分。
//
// 封面不要求太精确，因此这里只做「标题/歌手是否互相包含」这种轻量判断，
// 目的是把明显不相关的条目排到后面，而不是做严格的实体对齐。
// 用不用某条候选由 confirmMatch 决定，分数只负责排序。
func scoreMatch(req Request, title, artist, album string, duration int64) int {
	score := 0
	rt, ct := normalizeText(req.Title), normalizeText(title)
	switch {
	case rt == "" || ct == "":
		score += 10
	case rt == ct:
		score += 60
	case strings.Contains(ct, rt) || strings.Contains(rt, ct):
		score += 42
	default:
		score += int(similarity(rt, ct) * 45)
	}

	ra, ca := normalizeText(req.Artist), normalizeText(artist)
	switch {
	case ra == "" || ca == "":
		score += 5
	case ra == ca:
		score += 30
	case strings.Contains(ca, ra) || strings.Contains(ra, ca):
		score += 20
	default:
		score += int(similarity(ra, ca) * 18)
	}

	rl, cl := normalizeText(req.Album), normalizeText(album)
	if rl != "" && cl != "" {
		if rl == cl {
			score += 10
		} else if strings.Contains(cl, rl) || strings.Contains(rl, cl) {
			score += 6
		}
	}

	if req.Duration > 0 && duration > 0 {
		diff := req.Duration - duration
		if diff < 0 {
			diff = -diff
		}
		switch {
		case diff <= 3000:
			score += 10
		case diff <= 10000:
			score += 5
		case diff > 60000:
			score -= 15
		}
	}
	return score
}

// similarity 返回两串的最长公共子序列长度占较长串的比例（0~1）。
func similarity(a, b string) float64 {
	if a == "" || b == "" {
		return 0
	}
	ra, rb := []rune(a), []rune(b)
	l := lcsLen(ra, rb)
	m := len(ra)
	if len(rb) > m {
		m = len(rb)
	}
	if m == 0 {
		return 0
	}
	return float64(l) / float64(m)
}

func lcsLen(a, b []rune) int {
	dp := make([]int, len(b)+1)
	for _, ca := range a {
		prev := 0
		for j, cb := range b {
			cur := dp[j+1]
			if ca == cb {
				dp[j+1] = prev + 1
			} else if dp[j] > dp[j+1] {
				dp[j+1] = dp[j]
			}
			prev = cur
		}
	}
	return dp[len(b)]
}

// normalizeText 去掉空格与标点、统一大小写，便于包含判断。
func normalizeText(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		if r == ' ' || r == '\t' || r == '\n' {
			continue
		}
		switch r {
		case '(', ')', '（', '）', '[', ']', '［', '］', '【', '】', '-', '_', '·', '.', ',', '，', '。', '!', '！', '?', '？', '\'', '"', '“', '”':
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
