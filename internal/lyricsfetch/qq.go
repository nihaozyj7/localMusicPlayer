package lyricsfetch

import (
	"context"
	"fmt"
	"html"
	"net/url"
	"strings"
)

// qqProvider 通过 QQ 音乐的公开接口搜索与抓取歌词（**含逐字 QRC**）。
//
// 两套接口并存，各有用处：
//
//	musicu（移动端，POST）
//	  搜索  https://u.y.qq.com/cgi-bin/musicu.fcg  module=music.search.SearchCgiService
//	  歌词  https://u.y.qq.com/cgi-bin/musicu.fcg  module=music.musichallSong.PlayLyricInfo
//	老 cgi（网页端，GET）
//	  搜索  https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=<关键词>&format=json
//	  歌词  https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=<mid>
//
// 为什么以 musicu 为主：老 cgi 在部分网络下会**整站返回 HTTP 500 + 空 body**
// （实测本机 c.y.qq.com 的两个接口、各种 Referer/UA/Cookie 组合都是 500），
// 而那正是「QQ 来源等于没有」的样子；musicu 同一时刻正常。反过来，musicu 是
// 移动端接口、参数可能变，所以老 cgi 保留为回退，两条路都走不通才报错。
//
// 字级歌词来自 musicu 的 qrc：请求带 `qrc:1, crypt:1`，返回的 `lyric` 是一串
// **hex 密文**（不是 base64、也不是明文），要过 qrcDecrypt（见 qq_qrc.go）——
// 那是 QQ 自己那套「位序被重排过的 3DES」，用标准 crypto/des 解不出来。
// 明文外面还套一层 XML，正文在 `LyricContent="…"` 属性里（见 qqUnwrapLyric）。
//
// 必须带的多余东西：
//   - Referer: https://y.qq.com/  不带会被 cgi 判成盗链；
//   - 老 cgi 的歌词要过一遍 html.UnescapeString —— 返回值是 JSON，但歌词里的
//     引号/& 会被转义成 &apos; / &amp;，直接展示会看到一堆实体。
type qqProvider struct {
	// baseURL 老 cgi 根地址（测试时可替换成 httptest 服务器）。
	baseURL string
	// musicuURL musicu.fcg 的地址（同样可替换）。
	musicuURL string
}

// QQ 的两套接口根地址。
const (
	qqLegacyBase = "https://c.y.qq.com"
	qqMusicuURL  = "https://u.y.qq.com/cgi-bin/musicu.fcg"
)

// NewQQ 创建 QQ 音乐歌词来源。
func NewQQ() Provider { return &qqProvider{baseURL: qqLegacyBase, musicuURL: qqMusicuURL} }

func (p *qqProvider) base() string {
	if strings.TrimSpace(p.baseURL) == "" {
		return qqLegacyBase
	}
	return strings.TrimRight(p.baseURL, "/")
}

func (p *qqProvider) musicu() string {
	if strings.TrimSpace(p.musicuURL) == "" {
		return qqMusicuURL
	}
	return p.musicuURL
}

func (p *qqProvider) Name() string { return "qq" }

// HasWordLevel QQ 能给出逐字歌词（QRC），见 qq_qrc.go。
//
// 注意措辞是「可能」：同一个来源里只有一部分歌有 QRC，其余只有行级 LRC。
// 聚合器不靠这个声明下结论，只拿它决定「要不要为这个来源多花一次请求」，
// 真正的判据永远是抓回来的文本（Aggregator.Match 里的 lyrics.HasWordTiming）。
func (p *qqProvider) HasWordLevel() bool { return true }

func qqHeaders() map[string]string {
	return map[string]string{
		"Referer": "https://y.qq.com/portal/player.html",
		// 老 cgi 对空 UA/自制 UA 更挑剔，这里统一给一个浏览器 UA。
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
	}
}

func qqKeyword(req SearchRequest) string {
	if q := strings.TrimSpace(req.Keyword); q != "" {
		return q
	}
	return strings.TrimSpace(req.Title + " " + req.Artist)
}

/* --------------------------------------------------------------------------
   musicu（主路径）
   -------------------------------------------------------------------------- */

// qqComm musicu 的公共参数。少了它接口会返回「参数错误」。
func qqComm() map[string]any {
	return map[string]any{"ct": 11, "cv": "1003006", "v": "1003006", "uin": "0", "format": "json"}
}

type qqMusicuResp struct {
	Code int `json:"code"`
	Req  struct {
		Code int            `json:"code"`
		Data map[string]any `json:"data"`
	} `json:"req"`
}

// qqMusicuCall 发一次 musicu 请求，返回 `req.data`。
func (p *qqProvider) qqMusicuCall(ctx context.Context, module, method string, param map[string]any) (map[string]any, error) {
	payload := map[string]any{
		"comm": qqComm(),
		"req":  map[string]any{"module": module, "method": method, "param": param},
	}
	var resp qqMusicuResp
	if err := postJSON(ctx, p.musicu(), qqHeaders(), payload, &resp); err != nil {
		return nil, err
	}
	if resp.Code != 0 || resp.Req.Code != 0 {
		return nil, fmt.Errorf("qq: musicu 返回 code %d/%d", resp.Code, resp.Req.Code)
	}
	if resp.Req.Data == nil {
		return nil, fmt.Errorf("qq: musicu 响应缺少 data")
	}
	return resp.Req.Data, nil
}

// searchMusicu 走 musicu 的搜索模块。
func (p *qqProvider) searchMusicu(ctx context.Context, keyword string) ([]Candidate, error) {
	data, err := p.qqMusicuCall(ctx, "music.search.SearchCgiService", "DoSearchForQQMusicDesktop", map[string]any{
		"query": keyword, "num_per_page": 20, "page_num": 1, "search_type": 0,
	})
	if err != nil {
		return nil, err
	}
	body, _ := data["body"].(map[string]any)
	song, _ := body["song"].(map[string]any)
	list, _ := song["list"].([]any)
	out := make([]Candidate, 0, len(list))
	for _, raw := range list {
		item, _ := raw.(map[string]any)
		if item == nil {
			continue
		}
		mid := qqString(item["mid"])
		if mid == "" {
			continue
		}
		artist := ""
		if singers, ok := item["singer"].([]any); ok && len(singers) > 0 {
			if first, ok := singers[0].(map[string]any); ok {
				artist = qqString(first["name"])
			}
		}
		album := ""
		if al, ok := item["album"].(map[string]any); ok {
			album = qqString(al["name"])
		}
		title := qqString(item["name"])
		if title == "" {
			title = qqString(item["title"])
		}
		out = append(out, Candidate{
			ID:        mid,
			Provider:  p.Name(),
			Title:     title,
			Artist:    artist,
			Album:     album,
			Duration:  qqInt(item["interval"]) * 1000, // 秒 → 毫秒
			HasLyrics: true,
		})
	}
	return out, nil
}

// fetchMusicu 取歌词。wantQRC 为真时要求逐字（QRC），拿不到就报错，
// 让上层退到行级那一次调用。
func (p *qqProvider) fetchMusicu(ctx context.Context, songMid string, wantQRC bool) (Result, error) {
	qrc := 0
	if wantQRC {
		qrc = 1
	}
	data, err := p.qqMusicuCall(ctx, "music.musichallSong.PlayLyricInfo", "GetPlayLyricInfo", map[string]any{
		"format": "json", "songMid": songMid, "type": 1,
		"crypt": 1, "lrc_t": 0, "qrc": qrc, "qrc_t": 0,
		"trans": 0, "trans_t": 0, "roma": 0, "roma_t": 0,
	})
	if err != nil {
		return Result{}, err
	}
	if wantQRC && qqInt(data["qrc"]) != 1 {
		return Result{}, fmt.Errorf("qq: 这首没有逐字歌词（qrc=%v）", data["qrc"])
	}
	raw := strings.TrimSpace(qqString(data["lyric"]))
	if raw == "" {
		return Result{}, fmt.Errorf("qq: 接口没有返回歌词")
	}
	// 带 crypt=1 时 lyric 是 hex 密文（逐字/行级都一样）；不带 crypt 时是明文。
	// 以「能不能解出文本」为准，不靠参数记忆：解不开就按明文处理。
	text := raw
	if plain, err := qrcDecrypt(raw); err == nil && strings.TrimSpace(plain) != "" {
		text = plain
	}
	text = strings.TrimSpace(qqUnwrapLyric(text))
	if text == "" {
		return Result{}, fmt.Errorf("qq: 歌词为空")
	}
	res := Result{
		LRC:      text,
		Provider: p.Name(),
		Source:   p.Name(),
	}
	if trans := strings.TrimSpace(qqString(data["trans"])); trans != "" {
		if plain, err := qrcDecrypt(trans); err == nil && strings.TrimSpace(plain) != "" {
			trans = plain
		}
		if v := strings.TrimSpace(qqUnwrapLyric(trans)); v != "" {
			res.Translation = v
		}
	}
	return res, nil
}

/* --------------------------------------------------------------------------
   老 cgi（回退路径）
   -------------------------------------------------------------------------- */

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

func (p *qqProvider) searchLegacy(ctx context.Context, keyword string) ([]Candidate, error) {
	params := url.Values{
		"p":      {"1"},
		"n":      {"20"},
		"w":      {keyword},
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

func (p *qqProvider) fetchLegacy(ctx context.Context, songMid string) (Result, error) {
	params := url.Values{
		"songmid":  {songMid},
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

/* --------------------------------------------------------------------------
   对外：搜索与抓取
   -------------------------------------------------------------------------- */

func (p *qqProvider) Search(ctx context.Context, req SearchRequest) ([]Candidate, error) {
	q := qqKeyword(req)
	if q == "" {
		return nil, nil
	}
	musicuItems, musicuErr := p.searchMusicu(ctx, q)
	if len(musicuItems) > 0 {
		return musicuItems, nil
	}
	legacyItems, legacyErr := p.searchLegacy(ctx, q)
	if legacyErr == nil {
		return legacyItems, nil
	}
	// 两条路都没结果：优先报主路径的错误（它才是「为什么没搜到」的原因）。
	if musicuErr != nil {
		return nil, musicuErr
	}
	return nil, legacyErr
}

// Fetch 抓歌词：**先逐字（QRC）再行级**。
//
// 三次尝试的顺序是有意义的：同一个候选，逐字版本信息最全（行级是它的子集），
// 所以先把 qrc:1 试掉；拿不到逐字再退行级 —— 这正是需求里的
// 「有逐字就播放逐字歌词，没有就逐行」。
func (p *qqProvider) Fetch(ctx context.Context, c Candidate) (Result, error) {
	songMid := strings.TrimSpace(c.ID)
	if songMid == "" {
		return Result{}, fmt.Errorf("qq: 缺少 songmid")
	}
	res, qrcErr := p.fetchMusicu(ctx, songMid, true)
	if qrcErr == nil && strings.TrimSpace(res.LRC) != "" {
		return res, nil
	}
	res, lineErr := p.fetchMusicu(ctx, songMid, false)
	if lineErr == nil && strings.TrimSpace(res.LRC) != "" {
		return res, nil
	}
	res, legacyErr := p.fetchLegacy(ctx, songMid)
	if legacyErr == nil && strings.TrimSpace(res.LRC) != "" {
		return res, nil
	}
	// 三次都失败：报最能说明问题的那一个 —— 行级那次失败通常意味着「这首没有
	// 歌词」，逐字那次失败可能只是「这首没有逐字」。
	if lineErr != nil {
		return Result{}, lineErr
	}
	if qrcErr != nil {
		return Result{}, qrcErr
	}
	return Result{}, legacyErr
}

// qqString 安全地取一个字符串字段（musicu 的 JSON 里同名字段类型并不稳定）。
func qqString(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case fmt.Stringer:
		return x.String()
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", x)
	}
}

// qqInt 安全地取一个整数字段（JSON 数字解出来是 float64）。
func qqInt(v any) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int:
		return int64(x)
	case int64:
		return x
	case string:
		var n int64
		if _, err := fmt.Sscanf(strings.TrimSpace(x), "%d", &n); err == nil {
			return n
		}
	}
	return 0
}
