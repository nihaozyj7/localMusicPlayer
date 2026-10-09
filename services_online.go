package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"localmusicplayer/internal/bilibili"
	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/coverfetch"
	"localmusicplayer/internal/lyrics"
	"localmusicplayer/internal/lyricsfetch"
	"localmusicplayer/internal/onlinecache"
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

	// files 是试听音频的磁盘缓存（见 internal/onlinecache）。
	//
	// ★ 它是「在线试听能用」的前提，不是可选优化：后端原生播放需要一个
	// **真实存在的本地文件**去解析（PlayerService → media.PlayableFile →
	// library.SongByID）。在线曲目在曲库里没有记录，没有缓存时解析必然失败，
	// 而那条失败会和「文件损坏」共用同一条错误链路 —— 一首正常的在线歌曲会被
	// 登记进「放不出来」清单。落盘之后它才是一个普通可播放的本地文件。
	files *onlinecache.Store

	// resolveVirtual 用于把「已经缓存好的在线音频」登记成后端可解析的歌曲。
	// 由 main 注入（见 main.go 的 resolve 装配），nil 时只做缓存不登记。
	resolveVirtual func(bvid, path, ext string)

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
		files:  onlinecache.New(""),
	}
}

// setVirtualResolver 注入「把缓存文件登记成后端可解析歌曲」的回调。
//
// 故意不导出：它接收一个函数值，Wails 的绑定生成器会为导出方法报
// 「func type not supported by encoding/json」。它只该由 main 调用。
func (s *OnlineService) setVirtualResolver(fn func(bvid, path, ext string)) {
	s.mu.Lock()
	s.resolveVirtual = fn
	s.mu.Unlock()
}

// SetCacheDir 覆盖试听缓存目录（测试 / 设置界面用；空串落回默认位置）。
func (s *OnlineService) SetCacheDir(dir string) {
	s.files = onlinecache.New(dir)
}

// CacheDir 返回试听缓存目录（供设置界面显示 / 排查）。
func (s *OnlineService) CacheDir() string { return s.files.Dir() }

// CacheStats 返回试听缓存的占用（文件数 / 字节数）。
func (s *OnlineService) CacheStats() map[string]any {
	count, bytes := s.files.Stats()
	return map[string]any{"dir": s.files.Dir(), "count": count, "bytes": bytes}
}

// ClearCache 清空试听缓存（设置界面用）。
//
// 清完之后在线歌曲需要重新下载一次才能播放 —— 这是「可丢弃的派生数据」
// 应有的语义，缓存目录本来就在临时目录下。
func (s *OnlineService) ClearCache() map[string]any {
	_ = s.files.Clear()
	return s.CacheStats()
}

const onlinePrefix = "/online/"

// OnlineIDPrefix 是在线曲目 id 的前缀（形如 bili:BV1xx411c7mD）。
//
// 为什么要有前缀：在线曲目与本地曲目共用同一个 id 空间（播放队列、歌单、
// 收藏都只存 id）。本地 id 是路径派生出来的，不可能撞上这个形态。
const OnlineIDPrefix = "bili:"

// onlineSongID 由 bvid 生成在线曲目的 id（与 OnlineService.Search 下发的一致）。
func onlineSongID(bvid string) string { return OnlineIDPrefix + bvid }

// onlineBVID 判断一个 id 是否是在线曲目，是则返回其 bvid。
//
// 前后端必须用同一套判据：前端注册在线曲目时用的是 `bili:` + bvid
// （见 frontend/src/js/ui/search.js#previewOnline），后端解析时要能认出来。
func onlineBVID(songID string) (string, bool) {
	songID = strings.TrimSpace(songID)
	if !strings.HasPrefix(songID, OnlineIDPrefix) {
		return "", false
	}
	bvid := strings.TrimSpace(strings.TrimPrefix(songID, OnlineIDPrefix))
	if bvid == "" {
		return "", false
	}
	return bvid, true
}

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
	// 在线来源可能给的是 QRC/KRC/klyric 这类字级写法：归一化成增强 LRC
	// 再交给前端（前端与歌词工作台只认这一种格式），逐字时间轴不会丢。
	return map[string]any{
		"lrc":           lyrics.NormalizeWordLevel(res.LRC),
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
	// 命中缓存就直接按普通文件提供：不用再解析一次远端地址，也支持 Range/seek。
	// 这条路径同时让「试听两次」只下载一次。
	if path, _, ok := s.files.LookupAny(bvid, "m4a"); ok {
		serveCachedAudio(w, r, path, "audio/mp4")
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
		resp, err := streamClient.Do(req)
		if err != nil {
			continue
		}
		if resp.StatusCode >= 400 {
			resp.Body.Close()
			continue
		}
		defer resp.Body.Close()
		h := w.Header()
		// ★ 不要把在线音频代理设成 Access-Control-Allow-Origin: *。
		//
		// 这条响应是**带 token 鉴权**的本机代理（页面同源取用，本就不需要 CORS）。
		// 写成 `*` 的意义只有一个：允许任意网页用 JS 读取本机代理返回的音频流 ——
		// 而代理的目标 URL 由 bvid 决定，等于把一个「能按 id 取任意 B 站音频」的
		// 能力开放给浏览器里的任何站点（配合 r.URL.Query().Get("t") 泄露即可滥用）。
		// 同源请求不读这个头，删掉它不影响任何正常功能。
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

		// ★ 试听的音频要**顺便落盘**（见 internal/onlinecache 的说明）。
		//
		// 为什么必须在这一条路径上做：这是音频字节唯一经过本进程的地方，
		// 不在这里存就等于没有缓存 —— 而后端原生播放需要一个真实的本地文件。
		//
		// 两个前提才写缓存：
		//   · 只写完整响应（206 Partial / 带 Range 的请求只是取一段，
		//     写下去会得到一个残缺文件，比不缓存更糟）；
		//   · 下载接口（download=true）不写 —— 那是「另存为」，
		//     用户要的是下载目录里的文件，不是又占一份缓存。
		//
		// 写失败只记日志：缓存是加速手段，绝不能因为它让试听本身失败
		// （临时目录可能不可写、可能满）。
		body := io.LimitReader(resp.Body, maxRemoteAudioBytes)
		if !download && resp.StatusCode == http.StatusOK && r.Header.Get("Range") == "" {
			body = s.teeToCache(stream, body)
		}
		_, _ = io.Copy(w, body)
		return
	}
	http.Error(w, "online audio unavailable", http.StatusBadGateway)
}

// teeToCache 把响应体同时写进试听缓存并回给调用方。
//
// 返回的 reader 只负责「转发」；写盘在**旁路 goroutine** 里进行，这样
// 落盘速度（可能慢，尤其是大文件 + 机械盘）不会拖住播放 —— 用户按下试听
// 应当立刻听到声音，而不是等下载完。
//
// 用 io.Pipe 而不是简单包一层 MultiWriter：MultiWriter 会让 Write 变成
// 「两边都写完才返回」，磁盘一慢就把播放拖成卡顿。
func (s *OnlineService) teeToCache(stream *bilibili.AudioStream, body io.Reader) io.Reader {
	path, ok := s.files.Path(stream.BVID, "m4a")
	if !ok {
		return body // 拿不到安全文件名：只播放，不缓存
	}
	pr, pw := io.Pipe()
	go func() {
		// 写缓存；失败只是没缓存，不影响正在播放的这一路
		if _, err := s.files.WriteTo(path, pr); err != nil {
			log.Printf("[online] 试听缓存写入失败（不影响播放）: %v", err)
			return
		}
		// 缓存就绪后立刻登记成后端可播放的歌曲：
		// 前端下一次「后端装载」才能解析到它（见 EnsureCached 的说明）。
		s.registerVirtual(stream.BVID, path, "m4a")
	}()
	// TeeReader：读到的字节顺手喂给 pipe（写端由上面那个 goroutine 消费）。
	// 读端出错（客户端断开）时 pipe 写端也会收到错误并结束上面那个 goroutine。
	return io.TeeReader(body, pw)
}

// registerVirtual 把一个已缓存的在线音频登记成后端可解析的歌曲。
func (s *OnlineService) registerVirtual(bvid, path, ext string) {
	s.mu.Lock()
	fn := s.resolveVirtual
	s.mu.Unlock()
	if fn != nil {
		fn(bvid, path, ext)
	}
}

// EnsureCached 确保某个 bvid 的音频**已经落在本地**，返回（路径, 扩展名）。
//
// 这是后端播放解析（main.go 的 resolve）在曲库里查不到歌曲时走的兜底：
//   - 缓存命中 → 直接返回，零网络开销；
//   - 未命中   → 现在下载到缓存。注意这一步是**阻塞**的（要等整首歌下来），
//     调用方通常在前端已经显示「加载中」的切歌路径上，可以接受；
//     接口本身也有超时兜底。
func (s *OnlineService) EnsureCached(ctx context.Context, bvid string) (string, string, error) {
	bvid = strings.TrimSpace(bvid)
	if bvid == "" {
		return "", "", errors.New("缺少视频 id")
	}
	if path, ext, ok := s.files.LookupAny(bvid, "m4a"); ok {
		return path, strings.TrimPrefix(ext, "."), nil
	}

	stream, err := s.resolve(ctx, bvid)
	if err != nil {
		return "", "", err
	}
	ext := strings.TrimSpace(stream.Ext)
	if ext == "" {
		// B 站返回的是 m4a/AAC。拿不到扩展名时按 m4a 处理（见 onlinecache.NormalizeExt）
		ext = "m4a"
	}
	path, ok := s.files.Path(bvid, ext)
	if !ok {
		return "", "", fmt.Errorf("无法为 %s 生成缓存文件名", bvid)
	}

	urls := append([]string{stream.URL}, stream.BackupURLs...)
	var lastErr error
	for _, rawURL := range urls {
		if strings.TrimSpace(rawURL) == "" {
			continue
		}
		if lastErr = s.downloadToCache(ctx, rawURL, path); lastErr == nil {
			s.registerVirtual(bvid, path, ext)
			return path, strings.TrimPrefix(onlinecache.NormalizeExt(ext), "."), nil
		}
	}
	if lastErr == nil {
		lastErr = errors.New("没有可用的音频地址")
	}
	return "", "", lastErr
}

// downloadToCache 把一个远端音频地址的完整内容写进缓存。
func (s *OnlineService) downloadToCache(ctx context.Context, rawURL, path string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Referer", "https://www.bilibili.com/")
	req.Header.Set("Origin", "https://www.bilibili.com")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36")

	resp, err := streamClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("下载试听音频失败: HTTP %d", resp.StatusCode)
	}
	_, err = s.files.WriteTo(path, limitRemoteAudio(resp.Body))
	return err
}

// serveCachedAudio 把缓存文件按普通文件提供（支持 Range / seek）。
func serveCachedAudio(w http.ResponseWriter, r *http.Request, path, contentType string) {
	f, err := os.Open(path)
	if err != nil {
		http.Error(w, "open failed", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		http.Error(w, "stat failed", http.StatusInternalServerError)
		return
	}
	h := w.Header()
	h.Set("Accept-Ranges", "bytes")
	h.Set("Content-Type", contentType)
	h.Set("Cache-Control", "no-store")
	http.ServeContent(w, r, filepath.Base(path), st.ModTime(), f)
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
		"lrc":      lyrics.NormalizeWordLevel(item.LRC),
		"source":   "online:" + item.Provider,
		"provider": item.Provider,
	}, nil
}
