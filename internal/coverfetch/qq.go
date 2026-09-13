package coverfetch

import (
	"context"
	"fmt"
	"net/url"
	"strings"
)

// QQProvider 通过 QQ 音乐的公开搜索接口取专辑封面。
//
// 接口：https://c.y.qq.com/soso/fcgi-bin/client_search_cp?...&format=json
// 每条结果带 songmid / albummid / interval，封面地址由 albummid 拼出来：
//
//	https://y.gtimg.cn/music/photo_new/T002R500x500M000<albummid>.jpg
//
// 为什么值得加这个来源（实测依据，不是「多一个总没坏处」）：
//
//  1. Deezer 在中国大陆网络下基本整条超时（连 TLS 握手都过不去），
//     实测每次查询稳定吃掉一个 6s 的单来源超时；
//  2. 网易云的网页搜索接口在请求稍频繁时会返回 **HTTP 200 + code 405**
//     （{"msg":"操作频繁，请稍候再试"}）—— 只看 HTTP 状态码完全发现不了，
//     而它一被限流，中文歌就只剩 iTunes 一个来源。
//
// 两者一起失效时，中文歌的封面命中率会掉得很明显。QQ 音乐对华语覆盖好、
// 接口稳定（实测 100~300ms），把这块补回来。
//
// 注意：封面图在 y.gtimg.cn（.cn，不是 .com），图床白名单与 Referer 都要单独放行，
// 否则下载会被 AllowedImageURL 直接挡掉（表现为「来源有结果但一张都显示不出来」）。
type QQProvider struct {
	// BaseURL 搜索接口根地址（测试时可替换）。
	BaseURL string
	// ImageBase 封面图床根地址（测试时可替换）。
	ImageBase string
}

// NewQQ 创建 QQ 音乐来源。
func NewQQ() *QQProvider {
	return &QQProvider{BaseURL: "https://c.y.qq.com", ImageBase: "https://y.gtimg.cn"}
}

// Name 来源标识。
func (p *QQProvider) Name() string { return "qq" }

func (p *QQProvider) base() string {
	if strings.TrimSpace(p.BaseURL) == "" {
		return "https://c.y.qq.com"
	}
	return strings.TrimRight(p.BaseURL, "/")
}

func (p *QQProvider) imageBase() string {
	if strings.TrimSpace(p.ImageBase) == "" {
		return "https://y.gtimg.cn"
	}
	return strings.TrimRight(p.ImageBase, "/")
}

// Find 查询封面。
func (p *QQProvider) Find(ctx context.Context, req Request) (FindResult, error) {
	req = req.Normalize()
	keyword := req.Keyword()
	if keyword == "" {
		keyword = req.Album
	}
	if keyword == "" {
		return FindResult{}, nil
	}

	q := url.Values{
		"p":      {"1"},
		"n":      {"10"},
		"w":      {keyword},
		"format": {"json"},
	}
	var resp struct {
		Code int `json:"code"`
		Data struct {
			Song struct {
				List []struct {
					SongName  string `json:"songname"`
					AlbumMid  string `json:"albummid"`
					AlbumName string `json:"albumname"`
					Interval  int64  `json:"interval"` // 秒
					Singer    []struct {
						Name string `json:"name"`
					} `json:"singer"`
				} `json:"list"`
			} `json:"song"`
		} `json:"data"`
	}

	// Referer 是必须的：不带会被 QQ 音乐的 cgi 判成盗链，返回空列表。
	endpoint := p.base() + "/soso/fcgi-bin/client_search_cp?" + q.Encode()
	if err := getJSON(ctx, endpoint, &resp, map[string]string{"Referer": "https://y.qq.com/"}); err != nil {
		return FindResult{}, err
	}
	// code != 0 是「接口层面失败了」，必须如实报错，不能当成「没搜到」——
	// 否则熔断永远不生效（网易云就是踩了这个坑才有这么多无声失败）。
	if resp.Code != 0 {
		return FindResult{}, fmt.Errorf("qq: 接口返回 code %d", resp.Code)
	}

	candidates := make([]Cover, 0, len(resp.Data.Song.List))
	for _, item := range resp.Data.Song.List {
		albumMid := strings.TrimSpace(item.AlbumMid)
		if albumMid == "" {
			continue
		}
		artist := ""
		if len(item.Singer) > 0 {
			artist = item.Singer[0].Name
		}
		if !confirmMatch(req, item.SongName, artist) {
			continue
		}
		candidates = append(candidates, Cover{
			URL:      p.imageBase() + "/music/photo_new/T002R500x500M000" + albumMid + ".jpg",
			Provider: p.Name(),
			MIME:     "image/jpeg",
			Width:    500,
			Height:   500,
			// interval 是秒，统一换成毫秒再打分（与其它来源保持一致）
			Score: scoreMatch(req, item.SongName, artist, item.AlbumName, item.Interval*1000),
		})
	}
	candidates = dedupeCovers(candidates)
	if len(candidates) == 0 {
		return FindResult{}, nil
	}
	sortCovers(candidates)
	return FindResult{Cover: candidates[0], Candidates: candidates}, nil
}
