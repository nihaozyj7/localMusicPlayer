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
	"sync/atomic"
	"time"

	"localmusicplayer/internal/bilibili"
	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/coverfetch"
	"localmusicplayer/internal/lyrics"
	"localmusicplayer/internal/lyricsfetch"
	"localmusicplayer/internal/onlinecache"
	"localmusicplayer/internal/onlinesource"
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

	// sources 是在线歌曲的来源记账（试听缓存 / 已下载，见 internal/onlinesource）。
	//
	// 它回答的是「这首歌是从哪儿来的、那个来源现在还在不在」——
	// 搜索结果里的「已下载」标注、以及空闲清理「哪些缓存可以删」都读它。
	// 可以是 nil（记账文件打不开时），此时所有记录动作静默跳过：
	// 记账是辅助信息，绝不能因为它让试听或下载失败。
	sources *onlinesource.Ledger

	mu    sync.Mutex
	cache map[string]*onlineAudioCache

	// protected 是前端推过来的「正在被播放队列（播放列表）引用」的在线 id。
	//
	// ★ 为什么必须由前端推：播放队列只存在前端（localStorage 快照里），
	// 后端读不到。而空闲清理只删「没有被播放列表和歌单引用」的缓存 ——
	// 歌单在后端配置里能读到，播放列表只能靠前端报到。
	protected map[string]bool

	// busy 是「正在联网解析 / 正在写缓存」的计数（空闲清理的判据之一）。
	busy atomic.Int64

	// cleaner 是试听缓存的空闲清理器（main 装配之后回填）。
	//
	// ★ 方向说明：清理器**依赖**本服务（要引用集合、要列缓存目录），
	// 所以只能等两边都建好再回填这个指针，适合用结构体字段而不是构造参数。
	cleaner *onlineCacheCleanup
}

// sourceLedgerName 是来源记账的文件名（在数据目录下）。
//
// 为什么放数据目录而不是试听缓存目录：下载记录讲的是**用户目录里的文件**，
// 它的生命周期比临时目录长得多（缓存被系统清掉之后，那份记账仍然必须有效）。
const sourceLedgerName = "online-sources.jsonl"

// openSourceLedger 在数据目录下打开来源记账。
//
// 打不开（磁盘只读 / 权限异常）时返回 nil 并记日志：来源记账是辅助信息，
// 缺了它在线试听与下载仍然要能用。
func openSourceLedger(store *bootstrap.Store) *onlinesource.Ledger {
	if store == nil {
		return nil
	}
	ledger, err := onlinesource.Open(filepath.Join(store.DataDir(), sourceLedgerName))
	if err != nil {
		log.Printf("[online] 来源记账不可用（不影响试听与下载）: %v", err)
		return nil
	}
	return ledger
}

// sourceLedger 返回来源记账（供 main 注入给 DownloadService；可能为 nil）。
func (s *OnlineService) sourceLedger() *onlinesource.Ledger { return s.sources }

/* --------------------------------------------------------------------------
   引用集合与「忙不忙」：空闲清理的输入
   -------------------------------------------------------------------------- */

// ProtectIDs 记录「正在被播放列表（播放队列）引用」的在线歌曲 id。
//
// 前端在队列变化时推过来（见 frontend/src/js/online-cache.js）。传空数组
// 等于「队列里没有在线歌曲了」—— 会清掉上一次的集合，不会残留旧引用。
//
// 为什么需要它：清理只删「没有被播放列表和歌单引用」的缓存，而播放队列
// **不在后端**（前端 state.queue，随快照写 localStorage），后端读不到。
// 这份引用只能由前端报到；歌单与「我喜欢」在后端配置里，直接读。
func (s *OnlineService) ProtectIDs(ids []string) map[string]any {
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		// 前端可能把本地曲目 id 一起推过来（它不区分），这里只留在线曲目。
		if _, ok := onlineBVID(id); !ok {
			continue
		}
		set[id] = true
	}
	s.mu.Lock()
	s.protected = set
	s.mu.Unlock()
	return map[string]any{"protected": len(set)}
}

// referencedOnlineIDs 返回「此刻不能被清理」的在线歌曲 id 集合。
//
// 三个来源缺一不可：
//   - 歌单（含「我喜欢」，它是 id=liked 的受限歌单）；
//   - 前端推来的播放队列（ProtectIDs）；
//   - 正在播放/已装载的那首（即使它不在任何歌单里，也绝不能删缓存）。
func (s *OnlineService) referencedOnlineIDs() map[string]bool {
	out := map[string]bool{}

	if s.store != nil {
		cfg := s.store.Get()
		for _, id := range cfg.LikedIDs {
			out[id] = true
		}
		for _, pl := range cfg.Playlists {
			for _, id := range pl.SongIDs {
				out[id] = true
			}
		}
	}

	s.mu.Lock()
	for id := range s.protected {
		out[id] = true
	}
	s.mu.Unlock()
	return out
}

// beginBusy / endBusy 标记「在线链路正在干活」（解析直链、写缓存、代理转发）。
//
// 用途只有一个：空闲清理要避开这些时刻（磁盘与网络正忙时再去删几十个文件，
// 只会让当前这次播放卡顿，而清理本身一点也不急）。
func (s *OnlineService) beginBusy() { s.busy.Add(1) }
func (s *OnlineService) endBusy()   { s.busy.Add(-1) }

// Busy 报告在线链路此刻是否有活干。
func (s *OnlineService) Busy() bool { return s.busy.Load() > 0 }

// setCleaner 注入空闲清理器（main 装配）。
func (s *OnlineService) setCleaner(c *onlineCacheCleanup) { s.cleaner = c }

// CleanupCache 立即清理一次试听缓存（只删「没被引用 + 闲置够久」的那些）。
//
// 与后台空闲清理的区别：这里是**用户主动触发**，不受「空闲」判据约束
// （在播时也可以点，判据里的引用保护照旧）。返回清理报告。
func (s *OnlineService) CleanupCache() map[string]any {
	if s.cleaner == nil {
		return map[string]any{"deleted": 0, "skipped": "清理器未启用"}
	}
	rep := s.cleaner.runNow(cleanupMinIdleAge)
	return map[string]any{
		"deleted":    rep.Deleted,
		"bytes":      rep.Bytes,
		"scanned":    rep.Scanned,
		"total":      rep.Total,
		"totalBytes": rep.TotalBytes,
	}
}

// setSourceLedger 注入来源记账（装配与测试用）。
func (s *OnlineService) setSourceLedger(l *onlinesource.Ledger) { s.sources = l }

// recordSource 追加一条来源记录。
//
// 所有失败都只记日志：「记录来源」不是功能路径，写不进去不该让用户的操作失败。
func (s *OnlineService) recordSource(rec onlinesource.Record) {
	if s.sources == nil {
		return
	}
	if err := s.sources.Record(rec); err != nil {
		log.Printf("[online] 来源记账写入失败（不影响本次操作）: %v", err)
	}
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
		// 来源记账（试听缓存 / 已下载）：搜索结果里的「已下载」与空闲清理都靠它。
		sources: openSourceLedger(store),
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
	// 缓存文件没了，对应的来源记录也就没意义了（留着会让界面显示
	// 「已缓存」而实际点开要重下）。下载记录不受影响：那是用户的文件。
	if s.sources != nil {
		for _, rec := range s.sources.CacheEntries() {
			s.sources.Forget(rec.BVID, onlinesource.KindCache)
		}
	}
	return s.CacheStats()
}

// SourceIndex 返回在线歌曲的来源索引（前端搜索结果里标「已下载」用）。
//
// 结构：{ path, downloads: {bvid: {…, exists}}, cache: {bvid: {…, exists}} }。
//
// ★ exists 是**每次调用时 stat 出来的**，不是记录里存的：用户可能已经把
// 下载目录里的那份删了。界面必须按 exists 决定要不要显示「已下载」——
// 这正是「标注之前再判断一次这个文件还在不在」那条要求。
func (s *OnlineService) SourceIndex() map[string]any {
	out := map[string]any{
		"path":      "",
		"downloads": map[string]map[string]any{},
		"cache":     map[string]map[string]any{},
	}
	if s.sources == nil {
		return out
	}
	out["path"] = s.sources.Path()
	out["downloads"] = statusMap(s.sources.Downloads())
	out["cache"] = statusMap(s.sources.CacheEntries())
	return out
}

// PruneSources 清掉「文件已经不在」的来源记录（用户删了下载、系统清了临时目录）。
//
// 返回清掉的条数。前端不需要直接调它：空闲清理会顺带做这件事
// （见 online_cache_cleanup.go），这里是给设置界面/排查手动触发用的。
func (s *OnlineService) PruneSources() map[string]any {
	if s.sources == nil {
		return map[string]any{"pruned": 0, "path": ""}
	}
	dropped := s.sources.Prune()
	return map[string]any{"pruned": dropped, "path": s.sources.Path()}
}

// statusMap 把来源快照转成「bvid → 状态」的映射（前端按 bvid 查）。
func statusMap(list []onlinesource.Status) map[string]map[string]any {
	out := make(map[string]map[string]any, len(list))
	for _, st := range list {
		out[st.BVID] = map[string]any{
			"bvid":   st.BVID,
			"title":  st.Title,
			"artist": st.Artist,
			"kind":   st.Kind,
			"path":   st.Path,
			"dir":    st.Dir,
			"from":   st.From,
			"at":     st.At,
			"exists": st.Exists,
			"size":   st.Size,
		}
	}
	return out
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

// applyLyricsPrefs 把「在线歌词偏好」同步给歌词聚合器。
//
// 为什么在**调用点**读配置而不是启动时读一次：配置是前端 400ms 防抖推过来的，
// 用户刚拨完「优先使用逐字歌词」就该立刻生效；调用点读到的永远是最新值。
// 聚合器内部只在值真的变化时才清缓存，所以重复同步接近零成本。
func (s *OnlineService) applyLyricsPrefs() {
	if s.lyrics == nil {
		return
	}
	s.lyrics.SetWordLevelEnabled(s.store.Get().OnlineWordLyrics)
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
	s.applyLyricsPrefs()
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
	// 在线链路正在干活（空闲清理要避开这些时刻，见 beginBusy 的说明）
	s.beginBusy()
	defer s.endBusy()
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
			teed := s.teeToCache(stream, body)
			// ★ 必须 defer 关闭：客户端提前断开时，io.Copy 是在**写端**失败的，
			// 转发侧永远读不到 EOF，旁路 goroutine 就再也不会醒（见 teeToCache）。
			defer teed.Close()
			body = teed
		}
		_, _ = io.Copy(w, body)
		return
	}
	http.Error(w, "online audio unavailable", http.StatusBadGateway)
}

// teeToCache 把响应体同时写进试听缓存并回给调用方。
//
// 返回的 reader 只负责「转发」；写盘在**旁路 goroutine** 里进行。
// 两侧之间是**有界内存缓冲**（bytePipe，见 cachePipeBufferBytes）：
// 磁盘抖动（杀软扫描 / 寻道 / 索引器占用）由缓冲吸收，转发不必等写盘；
// 缓冲满了仍然回压 —— 磁盘持续比网络慢时宁可慢，也不让内存无上限增长。
//
// ★ 调用方必须 Close 返回值（见下面的 pipeTee.Close 与返回语句处的 defer）。
func (s *OnlineService) teeToCache(stream *bilibili.AudioStream, body io.Reader) *pipeTee {
	path, ok := s.files.Path(stream.BVID, "m4a")
	if !ok {
		return &pipeTee{r: body} // 拿不到安全文件名：只播放，不缓存
	}
	// ★ 已有可用缓存时**绝不能**再套 TeeReader。
	//
	// 旧实现把「缓存已存在」的判断放在 WriteTo 内部：它会直接 return，
	// 而此时 pipe 已经套在返回路径上了 —— 没有任何人在读 pipe 的读端。
	// 管道一旦没有读者，写端就会一直等下去，于是
	// TeeReader 的每一次 Write 都卡死，连带把 io.Copy(w, body) 卡死：
	// 表现是「第二次播放同一首在线歌曲时，进度条走到某处就再也不动了」。
	// （Lookup 顺带刷新 LRU，所以这里用它而不是再 stat 一次。）
	if _, hit := s.files.Lookup(stream.BVID, "m4a"); hit {
		return &pipeTee{r: body}
	}

	pr, pw := newBytePipe(cachePipeBufferBytes)
	// 先把 pipeTee（连同 teeSink）建好，旁路 goroutine 才引用得到同一个 sink。
	teed := newPipeTee(body, pw)
	go s.cacheStream(stream, path, pr, teed.sink)
	// TeeReader：读到的字节顺手喂给 teeSink（写端由上面那个 goroutine 消费）。
	// 旁路先退出时，teeSink 会转为丢弃而不是阻塞或报错。
	return teed
}

// cachePipeBufferBytes 是「边转发边写缓存」这条旁路的内存缓冲上限（第六轮审查 N-2）。
//
// 为什么需要：原来用 io.Pipe，它**没有缓冲** —— 写端要等读端把字节取走才返回，
// 而读端的下一步就是写盘，于是「磁盘慢」顺着 TeeReader 一路传回转发侧，播放跟着卡。
// 缓存是**可选**的加速手段，绝不该让播放卡顿。
//
// 为什么是 2 MiB：一次试听的 m4a 典型 3~6 MiB，2 MiB 足以吸收**抖动**
// （杀软扫描、机械盘寻道、fsync、目录被索引器占用，量级在毫秒到几十毫秒），
// 而不是做一整首歌的内存副本。磁盘持续比网络慢时仍然回压：
// 宁可这一首缓存得慢一点，也不能让内存随试听并发无上限增长。
const cachePipeBufferBytes = 2 << 20

// cacheStream 是试听缓存的**旁路**：消费 pipe 读端、写盘、登记缓存。
//
// 单独抽成方法是为了能直接测它：下面这个死锁发生在两个 goroutine 之间
// （转发侧与旁路），不把旁路真的跑起来就测不出来。见 online_tee_test.go 的 ③。
func (s *OnlineService) cacheStream(stream *bilibili.AudioStream, path string, pr *bytePipeReader, sink *teeSink) {
	// 正在写缓存（空闲清理要避开，见 beginBusy）
	s.beginBusy()
	defer s.endBusy()
	// ★ 旁路退出前必须**主动**放掉管道，否则转发侧会卡住。
	//
	// 管道是有界的（bytePipe）：写端要一直等到「缓冲区有空位」或「管道被关」
	// 才返回。旁路这里一旦退出（缓存目录不可写 / 磁盘满 / 被清理，WriteTo 会
	// 直接报错返回），读端就再没人读 —— 若不同时放掉管道，转发侧的写会一直
	// 等下去（缓冲区满之后），io.Copy(w, body) 跟着卡死，用户看到的是
	// 「这一首试听停在某处，只能切歌」。缓存只是可选加速手段，绝不该有这个后果。
	//
	// 下面两句是两种等价的「放掉管道」方式，**至少要有一种**（实测缺了就会卡死，
	// 见 online_tee_test.go 的 TestCacheStreamFailureDoesNotStallTransfer）：
	//   · stop 关写端：唤醒此刻正阻塞的 pw.Write，并让 teeSink 转为丢弃模式；
	//   · pr.Close 关读端：让后续写入立刻拿到 ErrClosedPipe。
	// 两句都留着是有意的冗余：stop 还负责给旁路自身兜底（panic 也会走到 defer），
	// pr.Close 则保证 WriteTo「不读就返回」（发现缓存已存在）时也不会留下悬空的管道。
	defer sink.stop(errTeeCacheFailed)
	defer pr.Close()

	if _, err := s.files.WriteTo(path, pr); err != nil {
		log.Printf("[online] 试听缓存写入失败（不影响播放）: %v", err)
		return
	}
	// 缓存就绪后立刻登记成后端可播放的歌曲：
	// 前端下一次「后端装载」才能解析到它（见 EnsureCached 的说明）。
	s.registerVirtual(stream.BVID, path, "m4a")
	// 顺手记一条来源（试听缓存）：搜索结果里的「已下载」判定、
	// 以及空闲清理「这条缓存是谁」都读它。
	s.recordSource(onlinesource.Record{
		BVID:   stream.BVID,
		Kind:   onlinesource.KindCache,
		Title:  stream.Title,
		Ext:    "m4a",
		Path:   path,
		Origin: stream.URL,
	})
}

// pipeTee 是「边转发边写缓存」的转发侧。
//
// 它存在的唯一目的是**保证旁路 goroutine 一定能退出、且它的死活绝不回头影响转发**：
//
//   - 管道的写端不关，读者（s.files.WriteTo 里的 io.Copy）就永远等不到 EOF ——
//     客户端提前断开（用户切歌、关窗口、拖动进度条重发请求）时，转发侧其实是在
//     写端失败的，Read 根本不会返回错误，于是那个 goroutine 加上半成品 .part
//     文件就会一直留着。每断开一次泄漏一个。
//   - 反过来，旁路**先**退出（缓存目录不可写 / 磁盘满 / 被清理）时管道就没有读者，
//     转发侧的写在缓冲区写满后会一直等，io.Copy(w, body) 跟着卡死：现象是
//     「这一首试听永远停在某个位置，只能切歌」。这一路以前完全没有防护，由 teeSink 兜住。
//
// 与磁盘的解耦程度：管道是**有界缓冲**的（bytePipe + cachePipeBufferBytes），
// 落盘抖动被缓冲吸收，转发不必等写盘；磁盘持续慢过网络时仍然回压（这是刻意的，
// 见 cachePipeBufferBytes 的说明）。
type pipeTee struct {
	r    io.Reader
	sink *teeSink // nil 表示这条路径不写缓存
}

// newPipeTee 组装「转发 + 旁路写盘」：写端必须包成 teeSink 后再交给 TeeReader，
// 否则缓存写失败会演变成转发侧的死锁（见 teeSink 的说明）。
func newPipeTee(body io.Reader, pw *bytePipeWriter) *pipeTee {
	sink := &teeSink{pw: pw}
	return &pipeTee{r: io.TeeReader(body, sink), sink: sink}
}

func (t *pipeTee) Read(p []byte) (int, error) {
	n, err := t.r.Read(p)
	if err != nil {
		// io.EOF → 正常读完，让旁路把临时文件改名落盘
		// 其它错误 → 让旁路中止并清掉半成品
		t.finish(err)
	}
	return n, err
}

// Close 由调用方 defer 调用，保证「转发提前结束」时旁路也能收尾。
func (t *pipeTee) Close() error {
	t.finish(errTeeAborted)
	return nil
}

func (t *pipeTee) finish(cause error) {
	if t.sink == nil {
		return
	}
	if cause == io.EOF {
		t.sink.closeWrite() // 正常读完：旁路收到 EOF，写盘并改名
		return
	}
	t.sink.stop(cause) // 中止：旁路清掉 .part
}

// teeSink 是喂给 io.TeeReader 的写端：管道还活着就写进去，管道已经退役就**丢弃**。
//
// ★ 为什么不能直接把管道的写端交给 TeeReader：
//
//  1. 旁路 goroutine 提前退出（缓存写失败）后，管道再无读者。缓冲区写满之后，
//     Write 会一直等下去，TeeReader.Read 不返回 → io.Copy(w, body) 卡死，
//     而这条路是「试听正在播放」的唯一数据通道：缓存写不进去，播放也跟着死。
//  2. 那让旁路在退出前 Close 读端行不行？不行：读端一关，Write 会返回
//     ErrClosedPipe，TeeReader 把它当作**本次 Read 的错误**往上抛，io.Copy 立刻
//     中止 —— 等于「缓存失败就把播放掐断」，同样不可接受。
//
// 所以「要不要继续喂缓存」这件事必须由写端自己决定：一旦管道退役（无论谁先退出），
// 后续字节一律丢弃并报告写入成功，转发与播放不受任何影响。
type teeSink struct {
	pw   *bytePipeWriter
	done atomic.Bool
}

// Write 实现 io.Writer。pipe 退役后返回 (len(p), nil) —— 这个「假装写成功」
// 是刻意的：io.TeeReader 见到错误就会中断上游 Read，而缓存是可选的，不该拖垮播放。
func (t *teeSink) Write(p []byte) (int, error) {
	if t.done.Load() {
		return len(p), nil
	}
	if _, err := t.pw.Write(p); err != nil {
		// 旁路已经走了（Close 过 pipe / 读端已关）：退役并丢弃这批字节。
		// 这里不能把 err 传上去 —— 见类型注释第 2 点。
		t.done.Store(true)
		return len(p), nil
	}
	return len(p), nil
}

// closeWrite 正常收尾：关掉 pipe 写端，让旁路读到 EOF 后写盘并改名。
func (t *teeSink) closeWrite() {
	if t.done.Swap(true) {
		return
	}
	_ = t.pw.Close()
}

// stop 中止收尾：旁路会拿到 cause 并清掉半成品；同时唤醒可能正阻塞在 Write 上的转发侧。
// 幂等，可以安全地在 defer 与 finish 两处都调用。
func (t *teeSink) stop(cause error) {
	if t.done.Swap(true) {
		return
	}
	if cause == nil {
		cause = errTeeAborted
	}
	_ = t.pw.CloseWithError(cause)
}

// errTeeAborted 表示转发在读完之前就结束了（客户端断开 / 用户在切歌）。
var errTeeAborted = errors.New("试听转发提前结束")

// errTeeCacheFailed 表示缓存这一路写失败了（磁盘满 / 目录不可写 / 被清理）。
// 旁路 goroutine 退出时用它收尾：转发侧会转为「只播放、不再写缓存」。
var errTeeCacheFailed = errors.New("试听缓存写入失败")

// registerVirtual 把一个已缓存的在线音频登记成后端可解析的歌曲。
//
// 文件**已经不在**时不登记：虚拟表里放一条指向不存在文件的记录，只会让
// 后端解析给出 `文件不存在`（而不是「缓存未命中」），把调用方推向错误的
// 处理分支 —— 登记前先核实文件在不在，语义才对得上「登记的是可播放的东西」。
func (s *OnlineService) registerVirtual(bvid, path, ext string) {
	if _, err := os.Stat(path); err != nil {
		log.Printf("[online] 音频文件不存在，跳过登记（%s）: %v", bvid, err)
		return
	}
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
	// 可能正在联网下载整首歌（空闲清理要避开，见 beginBusy）
	s.beginBusy()
	defer s.endBusy()
	bvid = strings.TrimSpace(bvid)
	if bvid == "" {
		return "", "", errors.New("缺少视频 id")
	}
	if path, ext, ok := s.files.LookupAny(bvid, "m4a"); ok {
		// ★ 命中也要登记虚拟表（第六轮之后的用户报障修复）。
		//
		// 为什么命中必须登记：虚拟表（media.Server 的 virtual）是**内存里的**，
		// 而缓存文件在磁盘上、比进程活得久。重开一次程序，缓存还在、虚拟表却是空的，
		// 于是「昨天听过的在线歌今天再点」会命中这里直接返回 —— 后端解析时
		// 曲库查不到、虚拟表也没有，报 `歌曲不存在`，用户看到的就是
		// 「找不到歌曲、无法播放」。登记是幂等的（RegisterVirtual 已保证），
		// 命中路径每次登记一遍没有任何代价。
		normalized := onlinecache.NormalizeExt(ext)
		s.registerVirtual(bvid, path, strings.TrimPrefix(normalized, "."))
		return path, strings.TrimPrefix(normalized, "."), nil
	}

	// 缓存里没有 —— 但这首歌可能**已经下载到用户目录了**（用户先下载、
	// 之后缓存被清掉或被系统临时目录回收）。播放直接走那份已下载的文件：
	// 只登记、不动文件（那是用户的文件），比重新联网下载可靠得多 ——
	// 重新下载这一跳任何失败（直链过期、网络抖动、403）都会变成「无法播放」。
	if st, ok := s.sources.Downloaded(bvid); ok {
		ext := st.Ext
		if ext == "" {
			ext = strings.TrimPrefix(strings.ToLower(filepath.Ext(st.Path)), ".")
		}
		if ext == "" {
			ext = "m4a"
		}
		ext = onlinecache.NormalizeExt(ext)
		s.registerVirtual(bvid, st.Path, strings.TrimPrefix(ext, "."))
		log.Printf("[online] %s 的试听缓存已不在，改用已下载的文件播放: %s", bvid, st.Path)
		return st.Path, strings.TrimPrefix(ext, "."), nil
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
			s.recordSource(onlinesource.Record{
				BVID:   bvid,
				Kind:   onlinesource.KindCache,
				Title:  stream.Title,
				Artist: stream.Artist,
				Ext:    ext,
				Path:   path,
				Origin: rawURL,
			})
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
	s.applyLyricsPrefs()
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
	s.applyLyricsPrefs()
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

// ProbeLyricsFormat 只判断一个候选给的是「逐字」还是「逐行」，不改当前歌词。
//
// 歌词搜索界面用它给每个候选打标：**格式在抓取之前无从知道**（同一个来源
// 也可能这首有逐字、那首没有），抓一次是最直接的答案。界面按顺序一个一个问，
// 谁先问到谁先出标，不会因为探测拖慢搜索本身。
//
// 抓到的歌词会进聚合器的按候选缓存（见 lyricsfetch#Aggregator.Fetch），
// 用户随后点「使用」时是命中缓存，不会再下载一遍同一份歌词。
func (s *OnlineService) ProbeLyricsFormat(provider, id string) (map[string]any, error) {
	if s.lyrics == nil {
		return nil, fmt.Errorf("lyrics service disabled")
	}
	s.applyLyricsPrefs()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	item, err := s.lyrics.Fetch(ctx, provider, id)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(item.LRC) == "" {
		return nil, fmt.Errorf("no lyrics returned")
	}
	format := lyricsfetch.FormatOf(item.LRC)
	return map[string]any{
		"provider":  provider,
		"format":    string(format),
		"wordLevel": format == lyricsfetch.FormatWord,
	}, nil
}
