package lyricsfetch

import (
	"context"
	"fmt"
	"html"
	"net/url"
	"strings"
)

// qqProvider 通过 QQ 音乐的公开接口搜索与抓取歌词。
//
// 接口（都是网页端在用的公开 cgi）：
//
//	搜索  https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=<关键词>&format=json
//	歌词  https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=<mid>&format=json&nobase64=1
//
// 为什么需要它：内置的两个来源里，LRCLIB 对中文歌词覆盖一般（同一个歌名会有
// 大量同名/翻唱记录），而网易云的搜索接口一被限流就返回 HTTP 200 + code 405
// （见 netease.go 的注释），此时在线歌词实际上只剩一个可用来源。
// QQ 音乐对华语覆盖好、接口稳定，是这两个来源之外最值得补的一个。
//
// 两个必须带的东西：
//   - Referer: https://y.qq.com/  不带会被 cgi 判成盗链；
//   - 歌词要过一遍 html.UnescapeString —— 返回值是 JSON，但歌词里的引号/&
//     会被转义成 &apos; / &amp;，直接展示会看到一堆实体。
type qqProvider struct {
	// baseURL 接口根地址（测试时可替换成 httptest 服务器）。
	baseURL string
}

// NewQQ 创建 QQ 音乐歌词来源。
func NewQQ() Provider { return &qqProvider{baseURL: "https://c.y.qq.com"} }

func (p *qqProvider) base() string {
	if strings.TrimSpace(p.baseURL) == "" {
		return "https://c.y.qq.com"
	}
	return strings.TrimRight(p.baseURL, "/")
}

func (p *qqProvider) Name() string { return "qq" }

func qqHeaders() map[string]string {
	return map[string]string{"Referer": "https://y.qq.com/portal/player.html"}
}

type qqSearchResp struct {
	Code int `json:"code"`
	Data struct {
		Song struct {
			List []struct {
				SongMid   string `json:"songmid"`
				SongName  string `json:"songname"`
				AlbumName string `json:"albumname"`
				Interval  int64  `json:"interval"` // 秒
				Singer    []struct {
					Name string `json:"name"`
				} `json:"singer"`
			} `json:"list"`
		} `json:"song"`
	} `json:"data"`
}

func (p *qqProvider) Search(ctx context.Context, req SearchRequest) ([]Candidate, error) {
	q := strings.TrimSpace(req.Keyword)
	if q == "" {
		q = strings.TrimSpace(req.Title + " " + req.Artist)
	}
	if q == "" {
		return nil, nil
	}
	params := url.Values{
		"p":      {"1"},
		"n":      {"20"},
		"w":      {q},
		"format": {"json"},
	}
	endpoint := p.base() + "/soso/fcgi-bin/client_search_cp?" + params.Encode()
	var resp qqSearchResp
	if err := fetchJSON(ctx, endpoint, qqHeaders(), &resp); err != nil {
		return nil, err
	}
	// code != 0 是接口层失败（限流/参数变动），必须报错而不是当成「没搜到」，
	// 否则上层既看不到原因，也没有任何退避手段。
	if resp.Code != 0 {
		return nil, fmt.Errorf("qq: 搜索接口返回 code %d", resp.Code)
	}
	out := make([]Candidate, 0, len(resp.Data.Song.List))
	for _, item := range resp.Data.Song.List {
		if strings.TrimSpace(item.SongMid) == "" {
			continue
		}
		artist := ""
		if len(item.Singer) > 0 {
			artist = item.Singer[0].Name
		}
		out = append(out, Candidate{
			ID:        item.SongMid,
			Provider:  p.Name(),
			Title:     item.SongName,
			Artist:    artist,
			Album:     item.AlbumName,
			Duration:  item.Interval * 1000,
			HasLyrics: true,
		})
	}
	return out, nil
}

type qqLyricResp struct {
	RetCode int    `json:"retcode"`
	Code    int    `json:"code"`
	SubCode int    `json:"subcode"`
	Lyric   string `json:"lyric"`
	Trans   string `json:"trans"`
}

func (p *qqProvider) Fetch(ctx context.Context, c Candidate) (Result, error) {
	if strings.TrimSpace(c.ID) == "" {
		return Result{}, fmt.Errorf("qq: 缺少 songmid")
	}
	params := url.Values{
		"songmid":  {c.ID},
		"format":   {"json"},
		"nobase64": {"1"},
		"g_tk":     {"5381"},
	}
	endpoint := p.base() + "/lyric/fcgi-bin/fcg_query_lyric_new.fcg?" + params.Encode()
	var resp qqLyricResp
	if err := fetchJSON(ctx, endpoint, qqHeaders(), &resp); err != nil {
		return Result{}, err
	}
	if resp.Code != 0 {
		return Result{}, fmt.Errorf("qq: 歌词接口返回 code %d", resp.Code)
	}
	lyric := strings.TrimSpace(html.UnescapeString(resp.Lyric))
	if lyric == "" {
		return Result{}, fmt.Errorf("qq: 该曲目没有歌词")
	}
	return Result{
		LRC:         lyric,
		Translation: strings.TrimSpace(html.UnescapeString(resp.Trans)),
		Provider:    p.Name(),
		Source:      p.Name(),
	}, nil
}
