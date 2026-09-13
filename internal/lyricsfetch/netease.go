package lyricsfetch

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

type neteaseProvider struct{}

func NewNetease() Provider { return &neteaseProvider{} }

func (p *neteaseProvider) Name() string { return "netease" }

type neteaseSong struct {
	ID       int64
	Name     string
	Duration int64
	Artists  []neteaseArtist
	Album    neteaseAlbum
}

type neteaseArtist struct {
	Name string
}

type neteaseAlbum struct {
	Name   string
	PicURL string
}

type neteaseSearchResp struct {
	Code   int
	Result struct {
		Songs []neteaseSong
	}
}

func (p *neteaseProvider) Search(ctx context.Context, req SearchRequest) ([]Candidate, error) {
	q := strings.TrimSpace(req.Keyword)
	if q == "" {
		q = strings.TrimSpace(req.Title + " " + req.Artist)
	}
	if q == "" {
		return nil, nil
	}
	endpoint := "https://music.163.com/api/search/get/web?s=" + url.QueryEscape(q) + "&type=1&offset=0&limit=20"
	headers := map[string]string{"Referer": "https://music.163.com/", "User-Agent": sourceUA}
	var resp neteaseSearchResp
	if err := fetchJSON(ctx, endpoint, headers, &resp); err != nil {
		return nil, err
	}
	out := make([]Candidate, 0, len(resp.Result.Songs))
	for _, song := range resp.Result.Songs {
		artist := ""
		if len(song.Artists) > 0 {
			artist = song.Artists[0].Name
		}
		out = append(out, Candidate{
			ID:        strconv.FormatInt(song.ID, 10),
			Provider:  p.Name(),
			Title:     song.Name,
			Artist:    artist,
			Album:     song.Album.Name,
			Duration:  song.Duration,
			Cover:     song.Album.PicURL,
			HasLyrics: true,
		})
	}
	return out, nil
}

type neteaseLyricResp struct {
	Code   int
	LRC    struct{ Lyric string }
	Tlyric struct{ Lyric string }
	Klyric struct{ Lyric string }
}

func (p *neteaseProvider) Fetch(ctx context.Context, c Candidate) (Result, error) {
	endpoint := "https://music.163.com/api/song/lyric?id=" + url.QueryEscape(c.ID) + "&lv=1&kv=1&tv=-1"
	headers := map[string]string{"Referer": "https://music.163.com/", "User-Agent": sourceUA}
	var resp neteaseLyricResp
	if err := fetchJSON(ctx, endpoint, headers, &resp); err != nil {
		return Result{}, err
	}
	lrc := strings.TrimSpace(resp.LRC.Lyric)
	if lrc == "" {
		lrc = strings.TrimSpace(resp.Klyric.Lyric)
	}
	if lrc == "" {
		return Result{}, fmt.Errorf("netease: empty lyrics")
	}
	return Result{
		LRC:         lrc,
		Translation: strings.TrimSpace(resp.Tlyric.Lyric),
		Provider:    p.Name(),
		Source:      p.Name(),
	}, nil
}
