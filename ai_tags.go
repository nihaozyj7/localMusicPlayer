package main

import (
	"context"
	"log"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/library"
	"localmusicplayer/internal/metacache"
)

/* ==========================================================================
   下载完成后用 AI 提取元数据并回写文件
   --------------------------------------------------------------------------
   下载来的文件（B 站音频）几乎一定是「标题 = 视频标题，歌手/专辑为空」，
   文件名里往往还混着「【】」「- 完整版」「高音质」这类噪声。
   这些脏元数据会一路污染下游：曲库显示难看、在线匹配歌词/封面命中率低。

   所以下载完成后在**后台**做一次整理：把现有元数据 + 文件名交给 AI 还原出
   真正的 title / artist / album，再写回文件标签。

   三个关键设计：

     1. **不占用户等待时间**。下载已经完成、文件已经落盘、toast 也已经弹过，
        整理是之后才发生的（见 DownloadService 的 run/tryMoveFromCache），
        失败只写一条日志。所以这个开关可以默认开启。

     2. **两种下载方式都要触发**。「直接下载」与「从试听缓存搬运」只是拿到
        文件的手段不同，用户看到的结果必须一致 —— 所以触发点收在
        DownloadService.onDownloaded 一处，两条路径都调它，而不是各自实现。

     3. **写标签是不可撤销的**，所以只在开关打开、且 AI 真的给出了非空字段时
        才动文件；写不了的格式（mp3 / wav…）只更新曲库、不碰文件。
   ========================================================================== */

// DownloadTagResult 一次「下载后 AI 整理」的结果（供日志与测试断言）。
type DownloadTagResult struct {
	Path      string
	Applied   bool // 是否真的改了文件
	Tags      metacache.TextTags
	Message   string
	Skipped   string // 没有整理的原因（开关关闭 / AI 未配置 / 格式不支持…）
	LibraryOK bool   // 曲库是否已按新标签刷新
}

// AITagService 把「AI 提取元数据 + 写回文件 + 刷新曲库」串起来。
//
// 它只依赖三个已有组件：AI（提取）、曲库（查歌曲与刷新）、metacache（写标签），
// 自己不持有任何状态 —— 那些状态全都是别人已经在管的。
type AITagService struct {
	store *bootstrap.Store
	ai    *AiService
	lib   *library.Manager

	// mu 串行化整个流程。
	//
	// 为什么必须串行：一次 AI 调用要 8~18 秒，用户连续点十几首歌下载时
	// 会同时涌进十几个整理任务。并发写同一个文件、并发触发曲库重扫都会
	// 互相踩（重扫是先删目录条目再写入，交叉执行会把对方刚写进去的删掉）。
	// 串行之后总耗时更长，但每条都是后台跑的，用户感知不到。
	mu sync.Mutex
}

func NewAITagService(store *bootstrap.Store) *AITagService {
	return &AITagService{store: store}
}

func (s *AITagService) setAI(ai *AiService)             { s.ai = ai }
func (s *AITagService) setLibrary(lib *library.Manager) { s.lib = lib }

// enabled 开关打开、AI 已配置、曲库可用时才真的要做事。
//
// 开关（config.aiDownloadTag）与「AI 是否配置好」是两件事：前者是用户的意愿，
// 后者是能力。缺任何一个都直接跳过，不产生任何副作用与打扰。
func (s *AITagService) enabled() bool {
	if s == nil || s.store == nil || s.lib == nil {
		return false
	}
	if !s.store.Get().AIDownloadTag {
		return false
	}
	return s.ai != nil && s.ai.Enabled()
}

// Process 对刚下载完的文件做一次元数据整理。返回值只用于日志与测试。
//
// 调用方（DownloadService）在**下载任务收尾之后**调它，且必须放在自己的
// goroutine 里 —— 本函数会在 AI 调用上阻塞十几秒。
func (s *AITagService) Process(path string) DownloadTagResult {
	path = strings.TrimSpace(path)
	if path == "" {
		return DownloadTagResult{Skipped: "路径为空"}
	}
	if !s.enabled() {
		// 这里刻意区分两种「没做事」：开关关掉是用户的明确选择，
		// AI 没配置是他还没填 —— 日志里说清楚，排查时不用猜。
		if s != nil && s.store != nil && !s.store.Get().AIDownloadTag {
			return DownloadTagResult{Path: path, Skipped: "开关已关闭"}
		}
		return DownloadTagResult{Path: path, Skipped: "AI 未配置"}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// 先等文件入库。下载完成时 onFileAdded 已经触发了重扫，但那是异步的，
	// 而重扫要读标签才能拿到 Title/Artist —— 拿不到歌曲就不知道该把什么
	// 交给 AI 清洗（只剩文件名，效果差很多）。
	//
	// ★ 等不到**不是**错误路径的终点：awaitSong 会退回「用文件名当标题」，
	//   整理照样能做，只是少了「现有元数据」这一路输入。直接放弃的话，
	//   「重扫慢了一拍」就会变成「这首歌永远不被整理」（用户看到的现象是
	//   「有时候整理、有时候不整理」，极难排查）。
	song, _ := s.awaitSong(path)

	// 把现有元数据 + 文件名交给 AI 还原真实字段。
	//
	// 这里**不**做「元数据够干净就跳过」的预判：下载来的文件几乎总是脏的
	// （标题 = B 站视频标题，歌手/专辑为空），预判省下的那点调用换来的是
	// 「有的歌整理了、有的没整理」这种不可预期的行为。真正该省的地方在
	// 下面 —— 算出来的值若与现有值相同就不写文件（buildDownloadTags）。
	cleaned, err := s.ai.ExtractMeta(song.Title, song.Artist, song.Album, filepath.Base(path))
	if err != nil {
		log.Printf("[ai-tag] %s 元数据整理失败: %v", filepath.Base(path), err)
		return DownloadTagResult{Path: path, Skipped: "AI 调用失败"}
	}

	tags := buildDownloadTags(song, cleaned)
	if tags.Empty() {
		return DownloadTagResult{Path: path, Skipped: "AI 没有给出可用的字段"}
	}

	res := DownloadTagResult{Path: path, Tags: tags}
	if !metacache.SupportedEmbed(filepath.Ext(path)) {
		// 不支持写标签的格式（mp3 / wav / ogg…）：
		// 曲库里的元数据仍然值得更新（用户看到的就是对的），但**绝不碰文件**。
		res.Message = "该格式不支持写回标签，仅刷新曲库"
		res.LibraryOK = s.refreshLibrary(path)
		return res
	}

	if _, err := metacache.EmbedTextTags(path, tags); err != nil {
		log.Printf("[ai-tag] 写回标签失败（%s）: %v", filepath.Base(path), err)
		res.Message = "写回标签失败：" + err.Error()
		return res
	}
	res.Applied = true
	// 写标签改了文件的 Size/ModTime，曲库的元数据缓存会因此失效并重新解析 ——
	// 但**必须显式触发一次重扫**：不重扫的话曲库内存里还是旧标题，
	// 用户会看到「文件里改了、列表里没变」，直到下次扫描才对上。
	res.LibraryOK = s.refreshLibrary(path)
	log.Printf("[ai-tag] %s 元数据已回写：%s / %s / %s", filepath.Base(path), tags.Title, tags.Artist, tags.Album)
	return res
}

// awaitSong 在曲库里等这首刚下载的歌出现。
//
// 为什么要等：onFileAdded 触发的重扫是后台 goroutine，下载流程与它没有先后
// 保证。等不到也不是错误路径的终点 —— 曲库里没这首歌时退回「只用文件名」，
// 仍然能整理（只是少了现有元数据这一路输入）。
func (s *AITagService) awaitSong(path string) (bootstrap.Song, bool) {
	// 轮询几轮：重扫通常是几十毫秒级别的，短等即可。
	// 上限设得很小（约 1 秒）：再久就说明这首歌根本不会入库（被过滤规则
	// 排除了、或文件已经不在），继续等只是白拖后台任务。
	const (
		rounds  = 10
		backoff = 100 * time.Millisecond
	)
	for i := 0; i < rounds; i++ {
		for _, song := range s.lib.Songs() {
			if strings.EqualFold(song.Path, path) {
				return song, true
			}
		}
		if i < rounds-1 {
			time.Sleep(backoff)
		}
	}
	// 没找到就退回按文件名构造一个最小可用的 Song：
	// Title 留空会退化（AI 只拿得到文件名），所以把文件名当标题传下去，
	// 与曲库扫描时「没有标签就用文件名兜底」的行为一致。
	return bootstrap.Song{
		Path:  path,
		Title: strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)),
	}, false
}

// refreshLibrary 让曲库重新读取这个文件的标签（增量重扫一个路径）。
func (s *AITagService) refreshLibrary(path string) bool {
	if s.lib == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := s.lib.RescanPaths(ctx, []string{path}); err != nil {
		log.Printf("[ai-tag] 刷新曲库失败（%s）: %v", filepath.Base(path), err)
		return false
	}
	return true
}

// buildDownloadTags 决定「哪些字段真的要写」。
//
// 规则不是「AI 说什么就写什么」，而是：
//   - 空 / 占位值（"未知歌手"…）一律不写 —— 写了等于把文件里可能还有的
//     正确值清掉，而且这类值对用户没有任何意义；
//   - 新值与现有值相同也不写 —— 白写一遍文件（每个都要整份读写）。
func buildDownloadTags(song bootstrap.Song, cleaned CleanMeta) metacache.TextTags {
	tags := metacache.TextTags{}
	if v := usableTagValue(cleaned.Title); v != "" && v != strings.TrimSpace(song.Title) {
		tags.Title = v
	}
	if v := usableTagValue(cleaned.Artist); v != "" && v != strings.TrimSpace(song.Artist) {
		tags.Artist = v
	}
	if v := usableTagValue(cleaned.Album); v != "" && v != strings.TrimSpace(song.Album) {
		tags.Album = v
	}
	return tags
}

// usableTagValue 过滤掉空值与占位值，返回可直接写进文件的字符串。
func usableTagValue(v string) string {
	v = strings.TrimSpace(v)
	if isPlaceholderMeta(v) || isPlaceholderTitle(v) {
		return ""
	}
	return v
}
