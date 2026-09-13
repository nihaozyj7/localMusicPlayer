package lyricsfetch

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type neteaseProvider struct {
	// cooldownUntil 限流退避：网易云一旦开始回 405，短时间内再打只会继续
	// 吃到 405，白占一个并发请求位置、还会把「全部来源都失败」的错误
	// 拼进用户看到的提示里。命中限流后安静地退避几分钟再试。
	mu            sync.Mutex
	cooldownUntil time.Time
}

func NewNetease() Provider { return &neteaseProvider{} }

// neteaseCooldown 命中限流后的退避时长。
const neteaseCooldown = 5 * time.Minute

func (p *neteaseProvider) Name() string { return "netease" }

// cooling 当前是否处于限流退避中。
func (p *neteaseProvider) cooling() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return time.Now().Before(p.cooldownUntil)
}

// cooldown 进入限流退避。
func (p *neteaseProvider) cooldown() {
	p.mu.Lock()
	p.cooldownUntil = time.Now().Add(neteaseCooldown)
	p.mu.Unlock()
}

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
	if p.cooling() {
		return nil, fmt.Errorf("netease: 搜索接口正在限流退避中")
	}
	endpoint := "https://music.163.com/api/search/get/web?s=" + url.QueryEscape(q) + "&type=1&offset=0&limit=20"
	headers := map[string]string{"Referer": "https://music.163.com/", "User-Agent": sourceUA}
	var resp neteaseSearchResp
	if err := fetchJSON(ctx, endpoint, headers, &resp); err != nil {
		return nil, err
	}
	// HTTP 200 不等于成功：请求偏频繁时网易会回 {"code":405,"msg":"操作频繁"}。
	// 只看 HTTP 状态码会把它当成「没搜到」，于是既没有错误提示、也没有退避，
	// 用户看到的就是「歌词经常搜不到」。
	if resp.Code != 200 && resp.Code != 0 {
		if resp.Code == 405 {
			p.cooldown()
		}
		return nil, fmt.Errorf("netease: 搜索接口返回 code %d（可能被限流）", resp.Code)
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
	if resp.Code != 200 && resp.Code != 0 {
		return Result{}, fmt.Errorf("netease: 歌词接口返回 code %d（可能被限流）", resp.Code)
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
