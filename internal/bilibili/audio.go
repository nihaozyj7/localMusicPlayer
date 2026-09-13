package bilibili

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// AudioStream 是解析后的可播放音频流。
type AudioStream struct {
	BVID       string    `json:"bvid"`
	CID        int64     `json:"cid"`
	AID        int64     `json:"aid"`
	Title      string    `json:"title"`
	Artist     string    `json:"artist"`
	Cover      string    `json:"cover"`
	Duration   int64     `json:"duration"` // 毫秒
	URL        string    `json:"-"`
	BackupURLs []string  `json:"-"`
	MimeType   string    `json:"mimeType"`
	Codecs     string    `json:"codecs"`
	Bandwidth  int64     `json:"bandwidth"`
	ExpiresAt  time.Time `json:"-"`
	Ext        string    `json:"ext"`
}

type dashAudio struct {
	ID             int      `json:"id"`
	BaseURL        string   `json:"baseUrl"`
	BaseURLSnake   string   `json:"base_url"`
	BackupURL      []string `json:"backupUrl"`
	BackupURLSnake []string `json:"backup_url"`
	Bandwidth      int64    `json:"bandwidth"`
	MimeType       string   `json:"mimeType"`
	MimeTypeSnake  string   `json:"mime_type"`
	Codecs         string   `json:"codecs"`
}

func (a dashAudio) url() string {
	if a.BaseURL != "" {
		return a.BaseURL
	}
	return a.BaseURLSnake
}

func (a dashAudio) backups() []string {
	out := append([]string{}, a.BackupURL...)
	return append(out, a.BackupURLSnake...)
}

func (a dashAudio) mime() string {
	if a.MimeType != "" {
		return a.MimeType
	}
	return a.MimeTypeSnake
}

type durlItem struct {
	URL            string   `json:"url"`
	BackupURL      []string `json:"backup_url"`
	BackupURLSnake []string `json:"backupUrl"`
	Length         int64    `json:"length"`
	Size           int64    `json:"size"`
}

func (d durlItem) backups() []string {
	out := append([]string{}, d.BackupURL...)
	return append(out, d.BackupURLSnake...)
}

type playURLResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    struct {
		Quality    int    `json:"quality"`
		Format     string `json:"format"`
		Timelength int64  `json:"timelength"`
		Dash       *struct {
			Duration int64       `json:"duration"`
			Audio    []dashAudio `json:"audio"`
		} `json:"dash"`
		Durl []durlItem `json:"durl"`
	} `json:"data"`
}

// View 获取视频基础信息（主分 P）。
func (c *Client) View(ctx context.Context, bvid string) (*ViewInfo, error) {
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
		return nil, err
	}
	if resp.Code != 0 {
		return nil, fmt.Errorf("bilibili 视频信息失败: code=%d %s", resp.Code, resp.Message)
	}
	if resp.Data.CID == 0 {
		return nil, fmt.Errorf("bilibili: 视频 %s 没有可用 cid", bvid)
	}
	return &ViewInfo{
		BVID:     resp.Data.BVID,
		AID:      resp.Data.AID,
		CID:      resp.Data.CID,
		Title:    stripHTML(resp.Data.Title),
		Artist:   resp.Data.Owner.Name,
		Cover:    normalizePic(resp.Data.Pic),
		Duration: resp.Data.Duration * 1000,
	}, nil
}

// ResolveAudio 解析指定视频的音频流地址。
//
// 返回的 URL 有时效性（约 2 小时）；调用方应缓存并支持失败时回退 BackupURLs。
func (c *Client) ResolveAudio(ctx context.Context, bvid string) (*AudioStream, error) {
	view, err := c.View(ctx, bvid)
	if err != nil {
		return nil, err
	}

	baseParams := url.Values{
		"bvid":  {view.BVID},
		"cid":   {strconv.FormatInt(view.CID, 10)},
		"fnval": {"16"}, // DASH
		"fourk": {"1"},
		"qn":    {"0"},
		"otype": {"json"},
	}

	var resp playURLResponse
	var lastErr error
	// 先试 WBI 接口，再回退旧接口。
	for _, attempt := range []struct {
		endpoint string
		withWBI  bool
	}{
		{defaultBaseURL + "/x/player/wbi/playurl", true},
		{defaultBaseURL + "/x/player/playurl", false},
	} {
		params := cloneValues(baseParams)
		if err := c.getJSON(ctx, attempt.endpoint, params, &resp, attempt.withWBI); err != nil {
			lastErr = err
			continue
		}
		if resp.Code != 0 {
			lastErr = fmt.Errorf("bilibili 播放地址失败: code=%d %s", resp.Code, resp.Message)
			continue
		}
		lastErr = nil
		break
	}
	if lastErr != nil {
		return nil, lastErr
	}

	stream := &AudioStream{
		BVID:      view.BVID,
		CID:       view.CID,
		AID:       view.AID,
		Title:     view.Title,
		Artist:    view.Artist,
		Cover:     view.Cover,
		Duration:  view.Duration,
		Ext:       "m4a",
		ExpiresAt: time.Now().Add(90 * time.Minute),
	}

	// 优先选择带宽最高的 DASH 音频轨。
	if resp.Data.Dash != nil && len(resp.Data.Dash.Audio) > 0 {
		audios := append([]dashAudio{}, resp.Data.Dash.Audio...)
		sort.SliceStable(audios, func(i, j int) bool { return audios[i].Bandwidth > audios[j].Bandwidth })
		for _, a := range audios {
			u := a.url()
			if strings.TrimSpace(u) == "" {
				continue
			}
			stream.URL = u
			stream.BackupURLs = a.backups()
			stream.MimeType = a.mime()
			if stream.MimeType == "" {
				stream.MimeType = "audio/mp4"
			}
			stream.Codecs = a.Codecs
			stream.Bandwidth = a.Bandwidth
			return stream, nil
		}
	}

	// 兼容没有 DASH 的旧响应。
	if len(resp.Data.Durl) > 0 {
		d := resp.Data.Durl[0]
		if strings.TrimSpace(d.URL) != "" {
			stream.URL = d.URL
			stream.BackupURLs = d.backups()
			stream.MimeType = "audio/mp4"
			stream.Ext = "m4a"
			return stream, nil
		}
	}
	return nil, fmt.Errorf("bilibili: 视频 %s 没有返回可用的音频流", bvid)
}

func cloneValues(src url.Values) url.Values {
	out := make(url.Values, len(src))
	for k, v := range src {
		out[k] = append([]string(nil), v...)
	}
	return out
}
