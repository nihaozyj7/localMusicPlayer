package coverfetch

import (
	"context"
	"net/url"
	"strings"
)

// DeezerProvider 通过 Deezer 的公开搜索接口取封面。
//
// 接口：https://api.deezer.com/search?q=<关键词>&limit=N
// 特点：无需鉴权，cover_xl 直接是 1000×1000，欧美/日韩覆盖较好。
//
// 注意：实测在中国大陆网络下该接口经常整个超时（连 TLS 握手都过不去）。
// 因此它只是「多一个来源」，绝不能让它拖慢整体 —— 由 Aggregator 的
// 单来源超时兜住，超时后其它来源的结果照常返回。
type DeezerProvider struct {
	// BaseURL 接口根地址（测试时可替换）。
	BaseURL string
}

// NewDeezer 创建 Deezer 来源。
func NewDeezer() *DeezerProvider { return &DeezerProvider{BaseURL: "https://api.deezer.com"} }

// Name 来源标识。
func (p *DeezerProvider) Name() string { return "deezer" }

func (p *DeezerProvider) base() string {
	if strings.TrimSpace(p.BaseURL) == "" {
		return "https://api.deezer.com"
	}
	return strings.TrimRight(p.BaseURL, "/")
}

// Find 查询封面。
func (p *DeezerProvider) Find(ctx context.Context, req Request) (FindResult, error) {
	req = req.Normalize()
	keyword := req.Keyword()
	if keyword == "" {
		keyword = req.Album
	}
	if keyword == "" {
		return FindResult{}, nil
	}

	q := url.Values{"q": {keyword}, "limit": {"15"}}
	var resp struct {
		Data []struct {
			Title    string `json:"title"`
			Duration int64  `json:"duration"` // 秒
			Artist   struct {
				Name string `json:"name"`
			} `json:"artist"`
			Album struct {
				Title  string `json:"title"`
				Cover  string `json:"cover_xl"`
				CoverL string `json:"cover_big"`
				CoverM string `json:"cover_medium"`
			} `json:"album"`
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := getJSON(ctx, p.base()+"/search?"+q.Encode(), &resp, nil); err != nil {
		return FindResult{}, err
	}
	if resp.Error != nil || len(resp.Data) == 0 {
		return FindResult{}, nil
	}

	candidates := make([]Cover, 0, len(resp.Data))
	for _, item := range resp.Data {
		raw := firstNonEmpty(item.Album.Cover, item.Album.CoverL, item.Album.CoverM)
		if raw == "" {
			continue
		}
		if !confirmMatch(req, item.Title, item.Artist.Name) {
			continue
		}
		candidates = append(candidates, Cover{
			URL:      raw,
			Provider: p.Name(),
			MIME:     "image/jpeg",
			Width:    1000,
			Height:   1000,
			// Deezer 的 duration 是秒，统一换成毫秒再打分
			Score: scoreMatch(req, item.Title, item.Artist.Name, item.Album.Title, item.Duration*1000),
		})
	}
	candidates = dedupeCovers(candidates)
	if len(candidates) == 0 {
		return FindResult{}, nil
	}
	sortCovers(candidates)
	return FindResult{Cover: candidates[0], Candidates: candidates}, nil
}

/* --------------------------------------------------------------------------
   MusicBrainz + Cover Art Archive
   -------------------------------------------------------------------------- */

// MusicBrainzProvider 通过 MusicBrainz 检索 release，再去 Cover Art Archive 取图。
//
// 接口：
//   - https://musicbrainz.org/ws/2/release?query=…&fmt=json   （检索 release group）
//   - https://coverartarchive.org/release-group/<mbid>/front   （图片重定向到实际地址）
//
// 特点：完全开放、覆盖极广、有明确的实体 ID；图片资源由 Internet Archive 托管，稳定。
// 局限：请求必须带可识别的 User-Agent（本包统一 UA 已满足），且限流 1 req/s，
// 因此只在其他来源失败时才有实际意义 —— 它参与并发查询，超时/被限流都不影响别人。
type MusicBrainzProvider struct{}

// NewMusicBrainz 创建 MusicBrainz 来源。
func NewMusicBrainz() *MusicBrainzProvider { return &MusicBrainzProvider{} }

// Name 来源标识。
func (p *MusicBrainzProvider) Name() string { return "musicbrainz" }

// Find 查询封面。
func (p *MusicBrainzProvider) Find(ctx context.Context, req Request) (FindResult, error) {
	req = req.Normalize()
	if req.Title == "" && req.Album == "" {
		return FindResult{}, nil
	}

	// 用 release 查询：歌词/标题里的 "feat."、"（Live）" 之类会干扰 Lucene 语法，
	// 这里做个最简清洗，避免查询串本身语法出错。
	title := luceneEscape(stripNoise(req.Album))
	if title == "" {
		title = luceneEscape(stripNoise(req.Title))
	}
	if title == "" {
		return FindResult{}, nil
	}
	query := "release:" + title
	if artist := luceneEscape(stripNoise(req.Artist)); artist != "" {
		query += " AND artist:" + artist
	}

	q := url.Values{"query": {query}, "fmt": {"json"}, "limit": {"6"}}
	var resp struct {
		Releases []struct {
			ID           string `json:"id"`
			Title        string `json:"title"`
			ReleaseGroup *struct {
				ID string `json:"id"`
			} `json:"release-group"`
			ArtistCredit []struct {
				Name string `json:"name"`
			} `json:"artist-credit"`
		} `json:"releases"`
	}
	if err := getJSON(ctx, "https://musicbrainz.org/ws/2/release?"+q.Encode(), &resp, nil); err != nil {
		return FindResult{}, err
	}
	if len(resp.Releases) == 0 {
		return FindResult{}, nil
	}

	candidates := make([]Cover, 0, len(resp.Releases))
	for _, rel := range resp.Releases {
		mbid := rel.ID
		if rel.ReleaseGroup != nil && rel.ReleaseGroup.ID != "" {
			mbid = rel.ReleaseGroup.ID
		}
		if mbid == "" {
			continue
		}
		artist := ""
		if len(rel.ArtistCredit) > 0 {
			artist = rel.ArtistCredit[0].Name
		}
		if !confirmMatch(req, rel.Title, artist) {
			continue
		}
		candidates = append(candidates, Cover{
			// 这个地址会 302 到 archive.org 的实际图片，本包的下载器会跟随重定向
			URL:      "https://coverartarchive.org/release-group/" + mbid + "/front-500",
			Provider: p.Name(),
			MIME:     "image/jpeg",
			Width:    500,
			Height:   500,
			Score:    scoreMatch(req, rel.Title, artist, rel.Title, 0),
		})
	}
	candidates = dedupeCovers(candidates)
	if len(candidates) == 0 {
		return FindResult{}, nil
	}
	return FindResult{Cover: candidates[0], Candidates: candidates}, nil
}

// luceneEscape 转义 Lucene 查询语法里的保留字符。
func luceneEscape(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	replacer := strings.NewReplacer(
		`\`, `\\`, `"`, `\"`, `+`, ` `, `-`, ` `, `!`, ` `, `(`, ` `, `)`, ` `,
		`{`, ` `, `}`, ` `, `[`, ` `, `]`, ` `, `^`, ` `, `~`, ` `, `*`, ` `,
		`?`, ` `, `:`, ` `, `/`, ` `, `&`, ` `, `|`, ` `,
	)
	return strings.Join(strings.Fields(replacer.Replace(s)), " ")
}

// stripNoise 去掉标题里的括号补充信息（feat. / Live / 伴奏 等），提高检索命中率。
func stripNoise(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var b strings.Builder
	depth := 0
	for _, r := range s {
		switch r {
		case '(', '（', '[', '［', '【', '〔', '《':
			depth++
			continue
		case ')', '）', ']', '］', '】', '〕', '》':
			if depth > 0 {
				depth--
			}
			continue
		}
		if depth == 0 {
			b.WriteRune(r)
		}
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return s // 整个标题都在括号里时保留原文，总比空串好
	}
	return out
}
