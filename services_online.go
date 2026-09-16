package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"localmusicplayer/internal/bilibili"
	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/coverfetch"
	"localmusicplayer/internal/lyricsfetch"
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

// cleanMeta 用 AI 清洗元数据；未配置、元数据已经够干净、或失败时原样返回。
//
// 「够干净就不调用 AI」这条很关键：实测一次 AI 调用要 8~18 秒，
// 而歌词自动匹配发生在每次切歌的路径上 —— 无条件调用它会让
// 「这首歌到底有没有歌词」变得完全不可预期（用户看到的现象就是
// 「等一两秒提示没有歌词」或「等十几秒才出歌词」）。
func (s *OnlineService) cleanMeta(title, artist, album string) (string, string, string) {
	if s.ai == nil || !s.ai.Enabled() || !needsCleanMeta(title, artist) {
		return title, artist, album
	}
	cleaned, err := s.ai.ExtractMeta(title, artist, album, "")
	if err != nil {
		return title, artist, album
	}
	return mergeCleanMeta(title, artist, album, cleaned)
}

// mergeCleanMeta 把 AI 结果合并回原元数据。
//
// 空值/占位值不覆盖原值：AI 只输出 JSON，模型不听话时会返回空字段或者
// 「未知歌手」，直接覆盖等于把本来还能用的元数据也弄没了。
func mergeCleanMeta(title, artist, album string, cleaned CleanMeta) (string, string, string) {
	if !isPlaceholderMeta(cleaned.Title) {
		title = cleaned.Title
	}
	if !isPlaceholderMeta(cleaned.Artist) {
		artist = cleaned.Artist
	}
	if !isPlaceholderMeta(cleaned.Album) {
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
	// 先做本地整形（不联网、不等 AI），再按需让 AI 兜底清洗脏标题。
	// 顺序不能反：AI 很慢，本地整形能解决的那部分不该花一次网络往返。
	title, artist = sanitizeLyricsMeta(title, artist)
	title, artist, _ = s.cleanMeta(title, artist, "")
	title, artist = sanitizeLyricsMeta(title, artist)
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

	// 总超时按聚合器的**最坏情况**给（查询阶段 + 下载阶段）：只给查询阶段的
	// 9s 会在「某个来源吃满单来源超时」时把下载那一步直接掐断，
	// 表现就是「明明搜到了候选，却一张都返回不了」。
	ctx, cancel := context.WithTimeout(context.Background(), coverfetch.DefaultWorstCase+2*time.Second)
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

// LyricsProviders 返回已注册的在线歌词来源（界面展示/排查用）。
func (s *OnlineService) LyricsProviders() map[string]any {
	if s.lyrics == nil {
		return map[string]any{"providers": []string{}}
	}
	return map[string]any{"providers": s.lyrics.Providers()}
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
	// 同 CoverLookup：按聚合器最坏情况给，别把下载阶段掐断
	ctx, cancel := context.WithTimeout(r.Context(), coverfetch.DefaultWorstCase+2*time.Second)
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

// SearchLyrics 手动匹配歌词：按用户给的关键词搜索候选。
//
// 三个参数各有用途，**不要合并**：
//   - keyword 是用户在输入框里写/改的搜索词，喂给各来源做全文搜索；
//   - title / artist 是这首歌的元数据，用于**打分排序**。
//
// 三个必须遵守的规则（每一条都对应一个实测到的问题）：
//
//  1. 用户填了关键词就不调用 AI。以前的实现无条件 cleanMeta，而 AI 一次要
//     8~18 秒 —— 用户按回车之后十几秒界面还停在「搜索中…」，很容易被当成
//     「搜索坏了」。用户亲手输入的关键词本来就比模型猜的准，没必要再洗。
//
//  2. 元数据先过本地整形（sanitizeLyricsMeta）。文件名兜底的标题往往是
//     「《此去半生》-吴昊 “歌词歌词…”」这种脏串，直接拿去打分会让**所有候选
//     一起塌成 0 分**（标题一个字都对不上），于是「搜了一两秒就说没有歌词」。
//
//  3. 整形之后仍然不可信的字段当成「没有」。打分函数对没有标题的情况给
//     基础分，对错误标题却是直接否定（0 分）；两者相比后者更糟。
func (s *OnlineService) SearchLyrics(keyword, title, artist string, duration int64) ([]map[string]any, error) {
	if s.lyrics == nil {
		return nil, fmt.Errorf("lyrics service disabled")
	}
	keyword = strings.TrimSpace(keyword)
	title, artist = sanitizeLyricsMeta(title, artist)

	if keyword == "" {
		// 没有关键词（自动匹配走到这里）：这时才值得花一次 AI 清洗
		title, artist, _ = s.cleanMeta(title, artist, "")
		title, artist = sanitizeLyricsMeta(title, artist)
		keyword = strings.TrimSpace(title + " " + artist)
	}

	// 打分用的字段：不可信的一律当成空，避免「全 0 分」把结果判死
	scoreTitle, scoreArtist := title, artist
	if !usableLyricsMetaForScore(scoreTitle) {
		scoreTitle = ""
	}
	if !usableLyricsMetaForScore(scoreArtist) {
		scoreArtist = ""
	}
	// 元数据完全不可信时，用用户输入的关键词当排序基准 —— 他输入的就是他想要的
	if scoreTitle == "" && scoreArtist == "" && usableLyricsMetaForScore(keyword) {
		scoreTitle = keyword
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	items, err := s.lyrics.Search(ctx, lyricsfetch.SearchRequest{
		Keyword:  keyword,
		Title:    scoreTitle,
		Artist:   scoreArtist,
		Duration: duration,
		Limit:    20,
	})
	if err != nil {
		// 「来源都正常，但没有这首歌词」是正常结果，不是错误：
		// 返回空列表让界面显示「没有找到候选歌词」，而不是弹一句吓人的「搜索失败」。
		// 只有真的全部失败了（网络/限流）才把错误抛给界面。
		if errors.Is(err, lyricsfetch.ErrNoMatch) {
			return []map[string]any{}, nil
		}
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
