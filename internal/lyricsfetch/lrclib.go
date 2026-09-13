package lyricsfetch

import (
	"context"
	"net/url"
	"strconv"
	"strings"
)

type lrclibProvider struct{}

func NewLRCLIB() Provider { return &lrclibProvider{} }

func (p *lrclibProvider) Name() string { return "lrclib" }

type lrclibItem struct {
	ID           int
	TrackName    string
	ArtistName   string
	AlbumName    string
	Duration     float64
	Instrumental bool
	PlainLyrics  string
	SyncedLyrics string
}

func (p *lrclibProvider) Search(ctx context.Context, req SearchRequest) ([]Candidate, error) {
	q := strings.TrimSpace(req.Keyword)
	if q == "" {
		q = strings.TrimSpace(req.Title + " " + req.Artist)
	}
	if q == "" {
		return nil, nil
	}

	out := make([]Candidate, 0, 12)
	seen := map[int]bool{}

	// ① 先试精确接口 /api/get：它按 (artist_name, track_name, album_name, duration)
	// 做实体对齐，返回的是「确切的那一条」，而不是全文搜索里一堆同名/翻唱。
	// 实测同一个歌名（例如「晴天」）全文搜索会返回几十条，第一条未必是我们的；
	// 精确接口只要参数够就能一次命中，响应同样很快。
	// 查不到时它回 404，这属于正常情况（不是故障），直接忽略即可。
	if strings.TrimSpace(req.Title) != "" {
		params := url.Values{"track_name": {req.Title}}
		if a := strings.TrimSpace(req.Artist); a != "" {
			params.Set("artist_name", a)
		}
		if al := strings.TrimSpace(req.Album); al != "" {
			params.Set("album_name", al)
		}
		if req.Duration > 0 {
			params.Set("duration", strconv.FormatInt(req.Duration/1000, 10))
		}
		var item lrclibItem
		endpoint := "https://lrclib.net/api/get?" + params.Encode()
		if err := fetchJSON(ctx, endpoint, map[string]string{"User-Agent": sourceUA}, &item); err == nil && item.ID != 0 {
			if c, ok := lrclibCandidate(item); ok {
				out = append(out, c)
				seen[item.ID] = true
			}
		}
	}

	// ② 全文搜索补齐其余候选（手动挑选面板需要看到多种结果）
	endpoint := "https://lrclib.net/api/search?q=" + url.QueryEscape(q)
	var items []lrclibItem
	if err := fetchJSON(ctx, endpoint, map[string]string{"User-Agent": sourceUA}, &items); err != nil {
		// 精确接口已经命中时，全文搜索失败不该把结果整体变成错误
		if len(out) == 0 {
			return nil, err
		}
		return out, nil
	}
	for _, it := range items {
		if seen[it.ID] {
			continue
		}
		if c, ok := lrclibCandidate(it); ok {
			out = append(out, c)
			seen[it.ID] = true
		}
	}
	return out, nil
}

// lrclibCandidate 把一条 LRCLIB 记录转成候选；没有歌词内容的不算候选。
func lrclibCandidate(it lrclibItem) (Candidate, bool) {
	has := strings.TrimSpace(it.SyncedLyrics) != "" || strings.TrimSpace(it.PlainLyrics) != ""
	if it.Instrumental && !has {
		return Candidate{}, false
	}
	return Candidate{
		ID:        strconv.Itoa(it.ID),
		Provider:  "lrclib",
		Title:     it.TrackName,
		Artist:    it.ArtistName,
		Album:     it.AlbumName,
		Duration:  int64(it.Duration * 1000),
		HasLyrics: has,
		raw:       it,
	}, true
}

func (p *lrclibProvider) Fetch(ctx context.Context, c Candidate) (Result, error) {
	var it lrclibItem
	if c.raw != nil {
		if v, ok := c.raw.(lrclibItem); ok {
			it = v
		}
	}
	if it.ID == 0 {
		endpoint := "https://lrclib.net/api/get/" + url.PathEscape(c.ID)
		if err := fetchJSON(ctx, endpoint, map[string]string{"User-Agent": sourceUA}, &it); err != nil {
			return Result{}, err
		}
	}
	lrc := strings.TrimSpace(it.SyncedLyrics)
	if lrc == "" {
		lrc = strings.TrimSpace(it.PlainLyrics)
	}
	return Result{LRC: lrc, Provider: p.Name(), Source: p.Name()}, nil
}
