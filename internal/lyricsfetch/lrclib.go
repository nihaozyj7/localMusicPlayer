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
	endpoint := "https://lrclib.net/api/search?q=" + url.QueryEscape(q)
	var items []lrclibItem
	if err := fetchJSON(ctx, endpoint, map[string]string{"User-Agent": sourceUA}, &items); err != nil {
		return nil, err
	}
	out := make([]Candidate, 0, len(items))
	for _, it := range items {
		has := strings.TrimSpace(it.SyncedLyrics) != "" || strings.TrimSpace(it.PlainLyrics) != ""
		if it.Instrumental && !has {
			continue
		}
		out = append(out, Candidate{
			ID:        strconv.Itoa(it.ID),
			Provider:  p.Name(),
			Title:     it.TrackName,
			Artist:    it.ArtistName,
			Album:     it.AlbumName,
			Duration:  int64(it.Duration * 1000),
			HasLyrics: has,
			raw:       it,
		})
	}
	return out, nil
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
