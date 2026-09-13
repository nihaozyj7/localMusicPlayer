package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"musicplayer/internal/bilibili"
	"musicplayer/internal/bootstrap"
	"musicplayer/internal/coverfetch"
	"musicplayer/internal/lyricsfetch"
)

type OnlineService struct {
	store  *bootstrap.Store
	client *bilibili.Client
	lyrics *lyricsfetch.Aggregator
	// covers 在线封面聚合器（iTunes / 网易云 / Deezer / MusicBrainz …）。
	// 单独一个包，第三方接口变动时只改 internal/coverfetch。
	covers *coverfetch.Aggregator
	token  string
	// ai 自动匹配前清洗元数据（可选，见 services_ai.go）
	ai *AiService

	mu    sync.Mutex
	cache map[string]*onlineAudioCache
}

// setAI 注入 AI 元数据清洗服务（可选）。故意不导出，避免出现在前端绑定里。
func (s *OnlineService) setAI(ai *AiService) { s.ai = ai }

// cleanMeta 用 AI 清洗元数据；未配置或失败时原样返回。
func (s *OnlineService) cleanMeta(title, artist, album string) (string, string, string) {
	if s.ai == nil || !s.ai.Enabled() {
		return title, artist, album
	}
	cleaned, err := s.ai.ExtractMeta(title, artist, album, "")
	if err != nil {
		return title, artist, album
	}
	if strings.TrimSpace(cleaned.Title) != "" {
		title = cleaned.Title
	}
	if strings.TrimSpace(cleaned.Artist) != "" {
		artist = cleaned.Artist
	}
	if strings.TrimSpace(cleaned.Album) != "" {
		album = cleaned.Album
	}
	return title, artist, album
}

type onlineAudioCache struct {
	stream *bilibili.AudioStream
	at     time.Time
}

func NewOnlineService(store *bootstrap.Store, client *bilibili.Client, aggregate *lyricsfetch.Aggregator, covers *coverfetch.Aggregator) *OnlineService {
	return &OnlineService{
		store:  store,
		client: client,
		lyrics: aggregate,
		covers: covers,
		token:  bootstrap.RandomID("ol"),
		cache:  map[string]*onlineAudioCache{},
	}
}

const onlinePrefix = "/online/"

// coverTTL 封面图片的浏览器缓存时长。封面基本不变，缓存久一点能省掉大量重复请求。
const coverTTL = 7 * 24 * time.Hour

func (s *OnlineService) Search(keyword string, page, pageSize int) ([]map[string]any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	res, err := s.client.Search(ctx, keyword, page, pageSize)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(res.Tracks))
	for _, t := range res.Tracks {
		bvid := url.QueryEscape(t.BVID)
		out = append(out, map[string]any{
			"id":          "bili:" + t.BVID,
			"source":      "bilibili",
			"title":       t.Title,
			"artist":      t.Artist,
			"album":       t.Album,
			"duration":    t.Duration,
			"cover":       t.Cover,
			"bvid":        t.BVID,
			"aid":         t.AID,
			"pubdate":     t.PubDate,
			"play":        t.Play,
			"description": t.Description,
			"online":      true,
			"ext":         "m4a",
			"addedAt":     time.Now().UnixMilli(),
			"playCount":   0,
			"streamUrl":   onlinePrefix + "audio?id=" + bvid + "&t=" + s.token,
			"downloadUrl": onlinePrefix + "download?id=" + bvid + "&t=" + s.token,
			// 封面走本地代理：前端 CSP 是 img-src 'self'，第三方图片直连会被拦掉
			"coverUrl": s.coverURLForTrack(t),
		})
	}
	return out, nil
}

// coversEnabled 判断是否应该联网抓封面。
func (s *OnlineService) coversEnabled() bool {
	if s.covers == nil {
		return false
	}
	return s.store.Get().OnlineCover
}

// coverURLForTrack 给一首在线曲目生成「同源封面地址」。
//
// 直接把标题/歌手/专辑作为查询参数带过去，代理端再用 coverfetch 解析出真实图源。
// 这样前端只需要一个 <img src>，不需要任何跨域或 CSP 例外。
func (s *OnlineService) coverURLForTrack(t bilibili.Track) string {
	if !s.coversEnabled() {
		return ""
	}
	q := url.Values{
		"title":  {t.Title},
		"artist": {t.Artist},
		"album":  {t.Album},
		"t":      {s.token},
	}
	if t.Cover != "" {
		q.Set("fallback", t.Cover)
	}
	return onlinePrefix + "cover?" + q.Encode()
}

// Lyrics 自动匹配并抓取一首歌的歌词（在线试听曲目用）。
//
// 标题与歌手都要传给聚合器：评分靠它们做实体对齐，只给关键词会让所有候选
// 都落在「信息不足」的基础分上，翻唱/Live 版很容易被选成第一名。
func (s *OnlineService) Lyrics(title, artist string, duration int64) (map[string]any, error) {
	if s.lyrics == nil {
		return map[string]any{"lrc": "", "source": "none"}, nil
	}
	if strings.TrimSpace(title) == "" {
		return map[string]any{"lrc": "", "source": "none"}, nil
	}
	// 自动匹配前先让 AI 清洗元数据（脏标题会让在线匹配大幅跑偏）
	title, artist, _ = s.cleanMeta(title, artist, "")
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	res, err := s.lyrics.Match(ctx, lyricsfetch.SearchRequest{
		Title:    title,
		Artist:   artist,
		Duration: duration,
		Limit:    12,
	})
	if err != nil {
		return map[string]any{"lrc": "", "source": "none"}, nil
	}
	return map[string]any{
		"lrc":           res.LRC,
		"source":        "online:" + res.Provider,
		"provider":      res.Provider,
		"matchedTitle":  res.Candidate.Title,
		"matchedArtist": res.Candidate.Artist,
	}, nil
}

// CoverLookup 返回一首歌的封面地址（同源）。没找到时 available=false，
// 前端据此「不显示封面」而不是留一个破图。
//
// 走的是 coverfetch 的 Resolve（挑候选 → 下载 → 体检），因此返回的地址
// 一定是一张**能显示、且不是纯白占位图**的图；白图会被当成「没找到」。
func (s *OnlineService) CoverLookup(title, artist, album string, durationMS int64, fallback string) (map[string]any, error) {
	if !s.coversEnabled() {
		return map[string]any{"available": false, "reason": "disabled"}, nil
	}
	title, artist, album = s.cleanMeta(title, artist, album)
	req := coverfetch.Request{
		Title:       title,
		Artist:      artist,
		Album:       album,
		Duration:    durationMS,
		FallbackURL: fallback,
	}.Normalize()
	if req.Empty() {
		return map[string]any{"available": false, "reason": "no-keyword"}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), coverfetch.DefaultTotalTimeout+6*time.Second)
	defer cancel()
	cover, err := s.covers.Resolve(ctx, req)
	if err != nil || !cover.Valid() {
		return map[string]any{"available": false, "reason": "not-found"}, nil
	}
	return map[string]any{
		"available": true,
		"provider":  cover.Provider,
		"score":     cover.Score,
		"url":       onlinePrefix + "cover?src=" + url.QueryEscape(cover.URL) + "&t=" + s.token,
		"source":    cover.URL,
		"width":     cover.Info.Width,
		"height":    cover.Info.Height,
	}, nil
}

// CoverProviders 返回已注册的封面来源（设置界面展示用）。
func (s *OnlineService) CoverProviders() map[string]any {
	if s.covers == nil {
		return map[string]any{"enabled": false, "providers": []string{}}
	}
	return map[string]any{
		"enabled":   s.store.Get().OnlineCover,
		"providers": s.covers.Providers(),
		"breaker":   s.covers.BreakerStatus(),
	}
}

// InvalidateCovers 清空封面缓存（设置里改了来源或用户点「重新抓取」时用）。
func (s *OnlineService) InvalidateCovers() map[string]any {
	if s.covers != nil {
		s.covers.Invalidate()
	}
	return map[string]any{"ok": true}
}

func (s *OnlineService) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(onlinePrefix+"audio", s.handleAudio)
	mux.HandleFunc(onlinePrefix+"download", s.handleDownload)
	mux.HandleFunc(onlinePrefix+"cover", s.handleCover)
	return mux
}

// handleCover 封面代理。
//
// 两种入参：
//   - src=<第三方图片地址>：直接代理下载（地址必须在 coverfetch 的图床白名单内）
//   - title/artist/album[&fallback]：现场联网抓一张，然后代理
//
// 为什么必须代理而不是让 WebView 直接加载第三方图片：
// 页面 CSP 是 img-src 'self' data:，外链图片会被浏览器直接拒绝；
// 而且不少图床校验 Referer，浏览器直连也会 403。
//
// 「白图」处理：图床在专辑没有封面时常常不返回 404，而是回一张纯白占位图。
// 这里在写出响应之前做一次体检（coverfetch.InspectImage），发现是白图就当
// 「这次没有封面」返回 204 —— 前端会显示「无封面」而不是一块白方块。
// 走 title/artist 这条路时还会继续往下试其它候选（Resolve）。
func (s *OnlineService) handleCover(w http.ResponseWriter, r *http.Request) {
	if !s.checkToken(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	q := r.URL.Query()
	ctx, cancel := context.WithTimeout(r.Context(), 24*time.Second)
	defer cancel()

	src := strings.TrimSpace(q.Get("src"))
	var body []byte
	var contentType, finalURL string

	if src == "" {
		req := coverfetch.Request{
			Title:       q.Get("title"),
			Artist:      q.Get("artist"),
			Album:       q.Get("album"),
			Duration:    parseInt64(q.Get("duration")),
			FallbackURL: q.Get("fallback"),
		}
		resolved, err := s.covers.Resolve(ctx, req)
		if err != nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		body = resolved.Image.Body
		contentType = resolved.MIME
		finalURL = resolved.Image.URL
	} else {
		if !coverfetch.AllowedImageURL(src) {
			http.Error(w, "image host not allowed", http.StatusForbidden)
			return
		}
		img, err := coverfetch.Download(ctx, src)
		if err != nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if _, err := coverfetch.InspectImage(img.Body); err != nil {
			// 空白占位图 / 坏图：当成「没有封面」，别把白块发给前端
			w.WriteHeader(http.StatusNoContent)
			return
		}
		body = img.Body
		contentType = coverfetch.NormalizeMIME(img.ContentType, img.Body)
		finalURL = img.URL
	}

	h := w.Header()
	h.Set("Content-Type", contentType)
	h.Set("Cache-Control", fmt.Sprintf("private, max-age=%d", int(coverTTL.Seconds())))
	h.Set("Content-Length", fmt.Sprint(len(body)))
	h.Set("X-Cover-Source", finalURL)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func parseInt64(s string) int64 {
	var v int64
	for _, r := range strings.TrimSpace(s) {
		if r < '0' || r > '9' {
			return 0
		}
		v = v*10 + int64(r-'0')
	}
	return v
}

func (s *OnlineService) checkToken(r *http.Request) bool {
	return r.URL.Query().Get("t") == s.token
}

func (s *OnlineService) handleAudio(w http.ResponseWriter, r *http.Request) {
	if !s.checkToken(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	bvid := strings.TrimSpace(r.URL.Query().Get("id"))
	if bvid == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	stream, err := s.resolve(r.Context(), bvid)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	s.proxyStream(w, r, stream, false)
}

func (s *OnlineService) handleDownload(w http.ResponseWriter, r *http.Request) {
	if !s.checkToken(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	bvid := strings.TrimSpace(r.URL.Query().Get("id"))
	if bvid == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	stream, err := s.resolve(r.Context(), bvid)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	s.proxyStream(w, r, stream, true)
}

func (s *OnlineService) resolve(ctx context.Context, bvid string) (*bilibili.AudioStream, error) {
	s.mu.Lock()
	if item, ok := s.cache[bvid]; ok && time.Since(item.at) < 80*time.Minute {
		s.mu.Unlock()
		return item.stream, nil
	}
	s.mu.Unlock()
	stream, err := s.client.ResolveAudio(ctx, bvid)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.cache[bvid] = &onlineAudioCache{stream: stream, at: time.Now()}
	s.mu.Unlock()
	return stream, nil
}

func (s *OnlineService) proxyStream(w http.ResponseWriter, r *http.Request, stream *bilibili.AudioStream, download bool) {
	urls := append([]string{stream.URL}, stream.BackupURLs...)
	for _, rawURL := range urls {
		if strings.TrimSpace(rawURL) == "" {
			continue
		}
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, rawURL, nil)
		if err != nil {
			continue
		}
		if rg := r.Header.Get("Range"); rg != "" {
			req.Header.Set("Range", rg)
		}
		req.Header.Set("Referer", "https://www.bilibili.com/")
		req.Header.Set("Origin", "https://www.bilibili.com")
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			continue
		}
		if resp.StatusCode >= 400 {
			resp.Body.Close()
			continue
		}
		defer resp.Body.Close()
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Accept-Ranges", "bytes")
		h.Set("Cache-Control", "no-store")
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			h.Set("Content-Type", ct)
		} else {
			h.Set("Content-Type", stream.MimeType)
		}
		for _, key := range []string{"Content-Length", "Content-Range", "Last-Modified", "ETag"} {
			if v := resp.Header.Get(key); v != "" {
				h.Set(key, v)
			}
		}
		if download {
			name := safeFilename(stream.Title)
			if name == "" {
				name = stream.BVID
			}
			h.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name+".m4a"))
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
		return
	}
	http.Error(w, "online audio unavailable", http.StatusBadGateway)
}

func (s *OnlineService) SearchLyrics(title, artist string, duration int64) ([]map[string]any, error) {
	if s.lyrics == nil {
		return nil, fmt.Errorf("lyrics service disabled")
	}
	title, artist, _ = s.cleanMeta(title, artist, "")
	keyword := title
	if strings.TrimSpace(artist) != "" {
		keyword = title + " " + artist
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	items, err := s.lyrics.Search(ctx, lyricsfetch.SearchRequest{
		Keyword:  keyword,
		Duration: duration,
		Limit:    12,
	})
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(items))
	for _, c := range items {
		out = append(out, map[string]any{
			"key":      c.Key(),
			"provider": c.Provider,
			"id":       c.ID,
			"title":    c.Title,
			"artist":   c.Artist,
			"album":    c.Album,
			"duration": c.Duration,
			"score":    c.Score,
		})
	}
	return out, nil
}

func (s *OnlineService) FetchLyrics(provider, id string) (map[string]any, error) {
	if s.lyrics == nil {
		return nil, fmt.Errorf("lyrics service disabled")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	item, err := s.lyrics.Fetch(ctx, provider, id)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(item.LRC) == "" {
		return nil, fmt.Errorf("no lyrics returned")
	}
	return map[string]any{
		"lrc":      item.LRC,
		"source":   "online:" + item.Provider,
		"provider": item.Provider,
	}, nil
}
