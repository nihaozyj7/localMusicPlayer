// Package lyricsfetch 负责在线歌词搜索与匹配。
//
// 设计上参考 LDDC 的多源歌词搜索思路：LRCLIB、网易云、QQ 音乐、酷狗各自实现
// Provider，由 Aggregator 并发查询、按标题/歌手/时长打分，再按得分顺序抓取歌词。
package lyricsfetch

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
)

// ErrNoMatch 表示没有找到足够可信的歌词。
var ErrNoMatch = errors.New("没有找到匹配的歌词")

// SearchRequest 描述一首待匹配歌曲。
type SearchRequest struct {
	Title    string
	Artist   string
	Album    string
	Duration int64 // 毫秒
	Keyword  string
	Limit    int
}

// Candidate 是一条歌词搜索结果。
type Candidate struct {
	ID        string `json:"id"`
	Provider  string `json:"provider"`
	Title     string `json:"title"`
	Artist    string `json:"artist"`
	Album     string `json:"album"`
	Duration  int64  `json:"duration"` // 毫秒
	Cover     string `json:"cover"`
	HasLyrics bool   `json:"hasLyrics"`
	Score     int    `json:"score"`

	raw any
}

// Key 返回跨来源唯一的候选键。
func (c Candidate) Key() string { return c.Provider + ":" + c.ID }

// Result 是抓取到的歌词。
type Result struct {
	LRC         string    `json:"lrc"`
	Translation string    `json:"translation,omitempty"`
	Romanized   string    `json:"romanized,omitempty"`
	Provider    string    `json:"provider"`
	Source      string    `json:"source"`
	Candidate   Candidate `json:"candidate"`
}

// Provider 是单个歌词源。
type Provider interface {
	Name() string
	Search(ctx context.Context, req SearchRequest) ([]Candidate, error)
	Fetch(ctx context.Context, candidate Candidate) (Result, error)
}

// Aggregator 并发使用多个 Provider 完成搜索与自动匹配。
type Aggregator struct {
	providers []Provider

	mu    sync.RWMutex
	cache map[string]cachedResult
}

type cachedResult struct {
	res Result
	at  time.Time
}

// NewAggregator 创建聚合器；不传 Provider 时使用内置的四个来源。
func NewAggregator(providers ...Provider) *Aggregator {
	if len(providers) == 0 {
		providers = []Provider{
			NewLRCLIB(), NewNetease(),
		}
	}
	return &Aggregator{
		providers: providers,
		cache:     map[string]cachedResult{},
	}
}

// Providers 返回当前注册的来源名称。
func (a *Aggregator) Providers() []string {
	out := make([]string, 0, len(a.providers))
	for _, p := range a.providers {
		out = append(out, p.Name())
	}
	return out
}

// Search 并发查询所有 Provider，并按匹配度降序返回候选。
func (a *Aggregator) Search(ctx context.Context, req SearchRequest) ([]Candidate, error) {
	req = prepareRequest(req)
	if len(a.providers) == 0 {
		return nil, ErrNoMatch
	}

	type providerResult struct {
		items []Candidate
		err   error
	}
	ch := make(chan providerResult, len(a.providers))
	for _, p := range a.providers {
		go func(p Provider) {
			cctx, cancel := context.WithTimeout(ctx, 12*time.Second)
			defer cancel()
			items, err := p.Search(cctx, req)
			for i := range items {
				if items[i].Provider == "" {
					items[i].Provider = p.Name()
				}
			}
			ch <- providerResult{items: items, err: err}
		}(p)
	}

	var all []Candidate
	var errs []error
	for range a.providers {
		r := <-ch
		if r.err != nil {
			errs = append(errs, r.err)
			continue
		}
		all = append(all, r.items...)
	}
	for i := range all {
		all[i].Score = scoreCandidate(req, all[i])
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i].Score > all[j].Score })
	if req.Limit > 0 && len(all) > req.Limit {
		all = all[:req.Limit]
	}
	if len(all) == 0 {
		if len(errs) > 0 {
			return nil, errors.Join(errs...)
		}
		return nil, ErrNoMatch
	}
	return all, nil
}

// Match 自动匹配并抓取歌词：先取评分最高的候选，失败时按分数向后重试。
func (a *Aggregator) Match(ctx context.Context, req SearchRequest) (Result, error) {
	req = prepareRequest(req)
	if req.Title == "" && req.Keyword == "" {
		return Result{}, fmt.Errorf("缺少歌曲标题")
	}
	key := cacheKey(req)
	if v, ok := a.getCache(key); ok {
		return v, nil
	}

	candidates, err := a.Search(ctx, req)
	if err != nil {
		return Result{}, err
	}
	if len(candidates) == 0 {
		return Result{}, ErrNoMatch
	}
	if candidates[0].Score < 35 {
		return Result{}, ErrNoMatch
	}

	var lastErr error
	for _, c := range candidates {
		if c.Score < 30 {
			break
		}
		p := a.provider(c.Provider)
		if p == nil {
			continue
		}
		res, err := p.Fetch(ctx, c)
		if err != nil {
			lastErr = err
			continue
		}
		if strings.TrimSpace(res.LRC) == "" {
			lastErr = fmt.Errorf("%s 返回了空歌词", c.Provider)
			continue
		}
		if res.Provider == "" {
			res.Provider = c.Provider
		}
		if res.Source == "" {
			res.Source = c.Provider
		}
		res.Candidate = c
		a.setCache(key, res)
		return res, nil
	}
	if lastErr != nil {
		return Result{}, lastErr
	}
	return Result{}, ErrNoMatch
}

// SearchByText 便于外部直接按标题/歌手搜索。
func (a *Aggregator) SearchByText(ctx context.Context, title, artist string, duration int64) ([]Candidate, error) {
	return a.Search(ctx, SearchRequest{Title: title, Artist: artist, Duration: duration})
}

func (a *Aggregator) provider(name string) Provider {
	for _, p := range a.providers {
		if p.Name() == name {
			return p
		}
	}
	return nil
}

func (a *Aggregator) getCache(key string) (Result, bool) {
	a.mu.RLock()
	v, ok := a.cache[key]
	a.mu.RUnlock()
	if !ok || time.Since(v.at) > 24*time.Hour {
		return Result{}, false
	}
	return v.res, true
}

func (a *Aggregator) setCache(key string, res Result) {
	a.mu.Lock()
	a.cache[key] = cachedResult{res: res, at: time.Now()}
	a.mu.Unlock()
}

func prepareRequest(req SearchRequest) SearchRequest {
	req.Title = strings.TrimSpace(req.Title)
	req.Artist = strings.TrimSpace(req.Artist)
	req.Album = strings.TrimSpace(req.Album)
	req.Keyword = strings.TrimSpace(req.Keyword)
	if req.Keyword == "" {
		req.Keyword = strings.TrimSpace(strings.Join([]string{req.Title, req.Artist}, " "))
	}
	if req.Limit <= 0 {
		req.Limit = 12
	}
	return req
}

func cacheKey(req SearchRequest) string {
	return normalize(req.Title) + "|" + normalize(req.Artist) + "|" + strconv.FormatInt(req.Duration, 10)
}

/* --------------------------------------------------------------------------
   匹配度评分
   -------------------------------------------------------------------------- */

func scoreCandidate(req SearchRequest, c Candidate) int {
	score := 0

	titleReq := normalize(req.Title)
	titleCan := normalize(c.Title)
	if titleReq != "" && titleCan != "" {
		switch {
		case titleReq == titleCan:
			score += 70
		case strings.Contains(titleCan, titleReq) || strings.Contains(titleReq, titleCan):
			score += 48
		default:
			score += int(similarity(titleReq, titleCan) * 55)
		}
	} else {
		score += 20 // 没有标题信息时不做否定，只给基础分
	}

	if req.Artist != "" {
		artistReq := normalize(req.Artist)
		artistCan := normalize(c.Artist)
		switch {
		case artistReq != "" && artistReq == artistCan:
			score += 30
		case artistReq != "" && artistCan != "" && (strings.Contains(artistCan, artistReq) || strings.Contains(artistReq, artistCan)):
			score += 22
		default:
			score += int(similarity(artistReq, artistCan) * 16)
		}
	} else {
		score += 8
	}

	if req.Duration > 0 && c.Duration > 0 {
		diff := req.Duration - c.Duration
		if diff < 0 {
			diff = -diff
		}
		switch {
		case diff <= 2000:
			score += 15
		case diff <= 5000:
			score += 10
		case diff <= 10000:
			score += 5
		case diff <= 20000:
			score += 0
		case diff <= 60000:
			score -= 12
		default:
			score -= 25
		}
	}
	if c.HasLyrics {
		score += 5
	}
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	return score
}

// normalize 去掉常见括号内容、标点与大小写差异，便于比较。
func normalize(s string) string {
	s = stripBracketed(s)
	s = strings.ToLower(s)
	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func stripBracketed(s string) string {
	var b strings.Builder
	depth := 0
	for _, r := range s {
		switch r {
		case '(', '（', '[', '［', '【', '〔', '《':
			depth++
			continue
		case ')', '）', ']', '］', '】', '〕', '》':
			if depth > 0 {
				depth--
			}
			continue
		}
		if depth == 0 {
			b.WriteRune(r)
		}
	}
	return b.String()
}

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

// Fetch 按 provider+id 获取指定候选的歌词。
func (a *Aggregator) Fetch(ctx context.Context, providerName, id string) (Result, error) {
	p := a.provider(providerName)
	if p == nil {
		return Result{}, fmt.Errorf("unknown lyric provider: %s", providerName)
	}
	res, err := p.Fetch(ctx, Candidate{Provider: providerName, ID: id})
	if err != nil {
		return Result{}, err
	}
	if res.Provider == "" {
		res.Provider = providerName
	}
	if res.Source == "" {
		res.Source = providerName
	}
	return res, nil
}
