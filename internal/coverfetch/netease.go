package coverfetch

import (
	"context"
	"fmt"
	"net/url"
	"strings"
)

// NeteaseProvider 通过网易云的公开（web 端）接口取专辑封面。
//
// 为什么用「专辑搜索 + 歌曲详情」两段式，而不是像常见做法那样自己拼 picId：
// 网易图片地址里的路径段是对 picId 做私有编码得到的，逆向实现容易随前端改版失效，
// 而且失败时只会静默 404（很难发现）。公开接口的响应里本来就带现成的
// picUrl / blurPicUrl，直接用最稳：
//
//  1. https://music.163.com/api/search/get/web?type=10  搜索专辑 → blurPicUrl
//  2. 专辑没命中时退到歌曲搜索（type=1）拿 songId，
//     再用 https://music.163.com/api/song/detail 取 album.picUrl
//
// 这些是网页端在用的「公开但非官方」接口，字段可能变动；因此本来源只依赖
// 最少字段，一旦变动只会表现为「这个来源查不到」，其它来源照常工作。
type NeteaseProvider struct {
	// BaseURL 接口根地址（测试时可替换）。
	BaseURL string
}

// NewNetease 创建网易云来源。
func NewNetease() *NeteaseProvider { return &NeteaseProvider{BaseURL: "https://music.163.com"} }

// Name 来源标识。
func (p *NeteaseProvider) Name() string { return "netease" }

func (p *NeteaseProvider) base() string {
	if strings.TrimSpace(p.BaseURL) == "" {
		return "https://music.163.com"
	}
	return strings.TrimRight(p.BaseURL, "/")
}

// neteaseHeaders 网易接口对 Referer 敏感，统一带上。
func neteaseHeaders() map[string]string {
	return map[string]string{
		"Referer": "https://music.163.com/",
		"Origin":  "https://music.163.com",
	}
}

// Find 查询封面：先找专辑，找不到再退到单曲详情。
func (p *NeteaseProvider) Find(ctx context.Context, req Request) (FindResult, error) {
	req = req.Normalize()
	if req.Title == "" && req.Artist == "" && req.Album == "" {
		return FindResult{}, nil
	}

	candidates := make([]Cover, 0, 6)
	// 两段查询是「先专辑、不中再单曲」的回退关系，但要记住**为什么**没中：
	// 如果两段都是接口层报错（例如 code 405 限流），那这个来源就是坏了，
	// 必须把错误抛出去让熔断生效 —— 不能伪装成「没搜到」。
	var firstErr error
	if covers, err := p.searchAlbums(ctx, req); err == nil {
		candidates = append(candidates, covers...)
	} else {
		firstErr = err
	}
	if len(candidates) == 0 {
		if covers, err := p.searchSongDetails(ctx, req); err == nil {
			candidates = append(candidates, covers...)
		} else if firstErr == nil {
			firstErr = err
		}
	}
	candidates = dedupeCovers(candidates)
	if len(candidates) == 0 {
		if firstErr != nil {
			return FindResult{}, firstErr
		}
		return FindResult{}, nil
	}
	return FindResult{Cover: candidates[0], Candidates: candidates}, nil
}

// searchAlbums 用专辑搜索直接拿封面地址。
func (p *NeteaseProvider) searchAlbums(ctx context.Context, req Request) ([]Cover, error) {
	// 专辑搜索对「专辑名 + 歌手」最敏感；没有专辑名时用标题兜底
	keyword := strings.TrimSpace(strings.Join([]string{req.Album, req.Artist}, " "))
	if strings.TrimSpace(req.Album) == "" {
		keyword = req.Keyword()
	}
	if keyword == "" {
		return nil, nil
	}

	q := url.Values{
		"s":      {keyword},
		"type":   {"10"}, // 10 = 专辑
		"offset": {"0"},
		"limit":  {"10"},
	}
	var resp struct {
		// Code 是网易接口自己的业务状态码。**HTTP 200 不代表成功**：
		// 请求稍频繁时它会回 {"code":405,"msg":"操作频繁，请稍候再试"}，
		// 早期实现只看 HTTP 状态码，于是这类失败被当成「没搜到」静默吞掉，
		// 用户只觉得「封面老是搜不到」，熔断也永远不生效。
		Code   int `json:"code"`
		Result struct {
			Albums []struct {
				Name       string `json:"name"`
				PicURL     string `json:"picUrl"`
				BlurPicURL string `json:"blurPicUrl"`
				Artist     struct {
					Name string `json:"name"`
				} `json:"artist"`
				Artists []struct {
					Name string `json:"name"`
				} `json:"artists"`
			} `json:"albums"`
		} `json:"result"`
	}
	endpoint := p.base() + "/api/search/get/web?" + q.Encode()
	if err := getJSON(ctx, endpoint, &resp, neteaseHeaders()); err != nil {
		return nil, err
	}
	if err := neteaseCodeErr(resp.Code); err != nil {
		return nil, err
	}

	out := make([]Cover, 0, len(resp.Result.Albums))
	for _, album := range resp.Result.Albums {
		raw := firstNonEmpty(album.PicURL, album.BlurPicURL)
		if raw == "" {
			continue
		}
		artist := album.Artist.Name
		if artist == "" && len(album.Artists) > 0 {
			artist = album.Artists[0].Name
		}
		// 候选是专辑：按专辑名确认。请求里没有专辑名（只按曲名搜）时，
		// 退化成用曲名去比候选专辑名 —— 很多单曲的专辑名就等于曲名。
		titleForConfirm := req.Album
		if normalizeText(titleForConfirm) == "" {
			titleForConfirm = req.Title
		}
		if !confirmMatch(Request{Title: titleForConfirm, Artist: req.Artist}, album.Name, artist) {
			continue
		}
		out = append(out, Cover{
			URL:      neteaseSized(raw, 500),
			Provider: p.Name(),
			MIME:     "image/jpeg",
			Width:    500,
			Height:   500,
			// 候选是专辑，所以打分时同时参考「专辑名」与「曲名」两个维度：
			// 请求里曲名与专辑名都为空时 normalizeText 会得到空串，
			// scoreMatch 会走「信息不足」分支，不会误判。
			Score: scoreMatch(req, album.Name, artist, req.Album, 0) +
				scoreMatch(req, req.Title, artist, album.Name, 0),
		})
	}
	return out, nil
}

// searchSongDetails 歌曲搜索 → 取 songId → 单曲详情里拿 album.picUrl。
func (p *NeteaseProvider) searchSongDetails(ctx context.Context, req Request) ([]Cover, error) {
	keyword := req.Keyword()
	if keyword == "" {
		return nil, nil
	}
	q := url.Values{
		"s":      {keyword},
		"type":   {"1"},
		"offset": {"0"},
		"limit":  {"5"},
	}
	var search struct {
		Code   int `json:"code"`
		Result struct {
			Songs []struct {
				ID      int64  `json:"id"`
				Name    string `json:"name"`
				Artists []struct {
					Name string `json:"name"`
				} `json:"artists"`
			} `json:"songs"`
		} `json:"result"`
	}
	endpoint := p.base() + "/api/search/get/web?" + q.Encode()
	if err := getJSON(ctx, endpoint, &search, neteaseHeaders()); err != nil {
		return nil, err
	}
	if err := neteaseCodeErr(search.Code); err != nil {
		return nil, err
	}
	if len(search.Result.Songs) == 0 {
		return nil, nil
	}

	ids := make([]string, 0, len(search.Result.Songs))
	meta := make(map[int64]struct {
		name   string
		artist string
	}, len(search.Result.Songs))
	for _, song := range search.Result.Songs {
		ids = append(ids, itoa(song.ID))
		artist := ""
		if len(song.Artists) > 0 {
			artist = song.Artists[0].Name
		}
		meta[song.ID] = struct {
			name   string
			artist string
		}{name: song.Name, artist: artist}
	}

	var detail struct {
		Songs []struct {
			ID    int64 `json:"id"`
			Album struct {
				Name       string `json:"name"`
				PicURL     string `json:"picUrl"`
				BlurPicURL string `json:"blurPicUrl"`
			} `json:"album"`
		} `json:"songs"`
	}
	detailURL := p.base() + "/api/song/detail?" + url.Values{"ids": {"[" + strings.Join(ids, ",") + "]"}}.Encode()
	if err := getJSON(ctx, detailURL, &detail, neteaseHeaders()); err != nil {
		return nil, err
	}

	out := make([]Cover, 0, len(detail.Songs))
	for _, song := range detail.Songs {
		raw := firstNonEmpty(song.Album.PicURL, song.Album.BlurPicURL)
		if raw == "" {
			continue
		}
		item := meta[song.ID]
		if !confirmMatch(req, item.name, item.artist) {
			continue
		}
		out = append(out, Cover{
			URL:      neteaseSized(raw, 500),
			Provider: p.Name(),
			MIME:     "image/jpeg",
			Width:    500,
			Height:   500,
			Score:    scoreMatch(req, item.name, item.artist, song.Album.Name, 0),
		})
	}
	return out, nil
}

// neteaseSized 给网易图片地址加上尺寸参数（原图可能是 1000+ 的大图）。
func neteaseSized(raw string, size int) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	// 去掉可能已有的 param 参数再重新拼，避免出现两个 param
	if i := strings.Index(raw, "?"); i >= 0 {
		raw = raw[:i]
	}
	return raw + "?param=" + itoa(int64(size)) + "y" + itoa(int64(size))
}

// neteaseCodeErr 把网易接口的业务状态码翻成 error。
//
// 为什么必须看它：网易的搜索接口在请求偏频繁时返回的是
// **HTTP 200 + {"code":405,"msg":"操作频繁，请稍候再试"}**。
// 只看 HTTP 状态码会把它当成「这次没搜到」，于是：
//   - 用户看到的是「封面/歌词老是搜不到」，而不是「这个源被限流了」；
//   - 熔断永远不生效，每次搜索都要白等它一次。
//
// code 为 0 或 200 都表示成功（不同接口用的取值不一样）。
func neteaseCodeErr(code int) error {
	if code == 0 || code == 200 {
		return nil
	}
	return fmt.Errorf("netease: 接口返回 code %d（可能被限流）", code)
}
