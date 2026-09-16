package bilibili

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// Track 是在线音乐搜索结果中的一首歌曲。
// 哔哩哔哩没有独立的音乐库，本项目把视频的音频轨当作可试听/下载的单曲。
type Track struct {
	ID          string `json:"id"`
	Source      string `json:"source"`
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	Album       string `json:"album"`
	Duration    int64  `json:"duration"` // 毫秒
	Cover       string `json:"cover"`
	BVID        string `json:"bvid"`
	AID         int64  `json:"aid"`
	CID         int64  `json:"cid,omitempty"`
	PubDate     int64  `json:"pubdate"`
	Play        int64  `json:"play"`
	Description string `json:"description"`
	Online      bool   `json:"online"`
	Ext         string `json:"ext"`
}

// SearchResult 是搜索接口的分页结果。
type SearchResult struct {
	Tracks   []Track `json:"tracks"`
	Page     int     `json:"page"`
	PageSize int     `json:"pageSize"`
	Total    int     `json:"total"`
	NumPages int     `json:"numPages"`
}

// Search 调用哔哩哔哩 WBI 搜索接口搜索视频，并把结果整理成 Track。
func (c *Client) Search(ctx context.Context, keyword string, page, pageSize int) (*SearchResult, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return nil, fmt.Errorf("搜索关键词不能为空")
	}
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 50 {
		pageSize = 50
	}

	params := url.Values{
		"search_type":  {"video"},
		"keyword":      {keyword},
		"page":         {strconv.Itoa(page)},
		"page_size":    {strconv.Itoa(pageSize)},
		"order":        {"totalrank"},
		"platform":     {"pc"},
		"web_location": {"1430650"},
	}

	var resp struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			Page     int `json:"page"`
			PageSize int `json:"page_size"`
			Total    int `json:"total"`
			NumPages int `json:"numPages"`
			Result   []struct {
				Type        string          `json:"type"`
				ID          int64           `json:"id"`
				Author      string          `json:"author"`
				Mid         int64           `json:"mid"`
				Title       string          `json:"title"`
				Pic         string          `json:"pic"`
				Description string          `json:"description"`
				Play        int64           `json:"play"`
				Duration    json.RawMessage `json:"duration"`
				PubDate     int64           `json:"pubdate"`
				BVID        string          `json:"bvid"`
				AID         int64           `json:"aid"`
				Arcurl      string          `json:"arcurl"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := c.getJSON(ctx, defaultBaseURL+"/x/web-interface/wbi/search/type", params, &resp, true); err != nil {
		return nil, err
	}
	if resp.Code != 0 {
		return nil, fmt.Errorf("bilibili 搜索失败: code=%d %s", resp.Code, resp.Message)
	}

	out := &SearchResult{
		Page:     resp.Data.Page,
		PageSize: resp.Data.PageSize,
		Total:    resp.Data.Total,
		NumPages: resp.Data.NumPages,
	}
	if out.Page <= 0 {
		out.Page = page
	}
	if out.PageSize <= 0 {
		out.PageSize = pageSize
	}

	for _, item := range resp.Data.Result {
		if item.Type != "" && item.Type != "video" {
			continue
		}
		bvid := strings.TrimSpace(item.BVID)
		if bvid == "" {
			continue
		}
		title := stripHTML(html.UnescapeString(item.Title))
		if title == "" {
			title = "未命名视频"
		}
		dur := parseDurationRaw(item.Duration)
		out.Tracks = append(out.Tracks, Track{
			ID:          "bili:" + bvid,
			Source:      "bilibili",
			Title:       title,
			Artist:      strings.TrimSpace(item.Author),
			Album:       "哔哩哔哩",
			Duration:    dur,
			Cover:       normalizePic(item.Pic),
			BVID:        bvid,
			AID:         item.AID,
			PubDate:     item.PubDate,
			Play:        item.Play,
			Description: stripHTML(html.UnescapeString(item.Description)),
			Online:      true,
			Ext:         "m4a",
		})
	}
	if out.Tracks == nil {
		out.Tracks = []Track{}
	}
	return out, nil
}

var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

func stripHTML(s string) string {
	s = htmlTagRe.ReplaceAllString(s, "")
	return strings.TrimSpace(strings.Join(strings.Fields(s), " "))
}

func normalizePic(pic string) string {
	pic = strings.TrimSpace(pic)
	if pic == "" {
		return ""
	}
	if strings.HasPrefix(pic, "//") {
		return "https:" + pic
	}
	if strings.HasPrefix(pic, "http://") {
		return "https://" + strings.TrimPrefix(pic, "http://")
	}
	return pic
}

// parseDurationRaw 兼容搜索接口的 "03:24" 字符串与秒数数字。
func parseDurationRaw(raw json.RawMessage) int64 {
	if len(raw) == 0 {
		return 0
	}
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		return parseDurationText(asString)
	}
	var asNumber float64
	if err := json.Unmarshal(raw, &asNumber); err == nil {
		if asNumber > 0 {
			return int64(asNumber * 1000)
		}
	}
	return 0
}

func parseDurationText(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	// 纯数字字符串按秒处理
	if n, err := strconv.ParseFloat(s, 64); err == nil {
		return int64(n * 1000)
	}
	parts := strings.Split(s, ":")
	var total int64
	for _, p := range parts {
		v, err := strconv.ParseInt(strings.TrimSpace(p), 10, 64)
		if err != nil {
			return 0
		}
		total = total*60 + v
	}
	return total * 1000
}

// CidFromView 通过 view 接口查询视频主分 P 的 cid 与元数据。
func (c *Client) CidFromView(ctx context.Context, bvid string) (int64, int64, error) {
	var resp struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			BVID     string `json:"bvid"`
			AID      int64  `json:"aid"`
			CID      int64  `json:"cid"`
			Duration int64  `json:"duration"`
			Title    string `json:"title"`
			Pic      string `json:"pic"`
			Owner    struct {
				Name string `json:"name"`
			} `json:"owner"`
		} `json:"data"`
	}
	params := url.Values{"bvid": {bvid}}
	if err := c.getJSON(ctx, defaultBaseURL+"/x/web-interface/view", params, &resp, false); err != nil {
		return 0, 0, err
	}
	if resp.Code != 0 {
		return 0, 0, fmt.Errorf("bilibili 视频信息失败: code=%d %s", resp.Code, resp.Message)
	}
	if resp.Data.CID == 0 {
		return 0, 0, fmt.Errorf("bilibili: 视频 %s 没有可用 cid", bvid)
	}
	return resp.Data.CID, resp.Data.Duration, nil
}

// ViewInfo 是 view 接口中播放器需要的少量字段。
type ViewInfo struct {
	BVID     string
	AID      int64
	CID      int64
	Title    string
	Artist   string
	Cover    string
	Duration int64 // 毫秒
}
