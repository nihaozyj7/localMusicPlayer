package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/coverfetch"
	"musicplayer/internal/meta"
	"musicplayer/internal/metacache"
)

// CoverService 管理歌曲封面：联网搜索、本地缓存、以及（可选）写回歌曲元数据。
//
// 三个概念要分清：
//  1. **来源**（coverfetch）：从 iTunes / 网易云 / Deezer / MusicBrainz 找一个候选图；
//  2. **缓存**（metacache）：把选中的图存到缓存目录，这样离线也能用、
//     也不会每次进详情页都去联网；
//  3. **写回**（metacache.EmbedCover）：按用户设置决定要不要写进歌曲文件本身。
//
// 前两步永远成功（只要缓存目录可写），第三步失败只降级不影响功能。
type CoverService struct {
	store  *bootstrap.Store
	cache  *metacache.Store
	covers *coverfetch.Aggregator
	// aggregate 这里不用 —— 在线搜索的封面走 OnlineService；
	// CoverService 只处理「本地歌曲的封面」。

	// songs 由 main 注入：按 id 查本地歌曲（拿标题/歌手/专辑/路径）
	songs func(id string) (bootstrap.Song, bool)
	// ai 用于自动匹配前清洗脏元数据（可选，见 services_ai.go）
	ai *AiService
	// emitFn 事件发送
	emitFn func(string, any)
}

// NewCoverService 构造服务。
func NewCoverService(store *bootstrap.Store, cache *metacache.Store, covers *coverfetch.Aggregator,
	songs func(id string) (bootstrap.Song, bool)) *CoverService {
	return &CoverService{store: store, cache: cache, covers: covers, songs: songs}
}

func (s *CoverService) setEmitter(fn func(string, any)) { s.emitFn = fn }

// setAI 注入元数据清洗服务（可选）。注入后，自动匹配封面会先用 AI 清洗元数据。
// 故意不导出：这是内部装配，不该出现在前端绑定里。
func (s *CoverService) setAI(ai *AiService) { s.ai = ai }

func (s *CoverService) emit(name string, payload any) {
	if s.emitFn != nil {
		s.emitFn(name, payload)
	}
}

// Result 一次封面操作的结果（前端弹层直接用这个渲染）。
type CoverResult struct {
	OK       bool   `json:"ok"`
	Provider string `json:"provider"`
	Score    int    `json:"score"`
	Source   string `json:"source"`
	Preview  string `json:"preview"` // data URL，直接喂给 <img>
	Message  string `json:"message"`
	Embedded bool   `json:"embedded"` // 是否已写回歌曲文件
	// Width/Height 图片实际尺寸（校验时解出来的，界面可以显示「500×500」）
	Width  int `json:"width,omitempty"`
	Height int `json:"height,omitempty"`
}

// Lookup 联网为某首**本地歌曲**找封面。
//
// 只返回候选与预览，不落盘 —— 用户可能连着看几个候选再决定用哪个。
//
// override 允许调用方临时覆盖标题/歌手/专辑：下载下来的文件本来没有标签
// （标题是从文件名推出来的），直接拿去搜基本不可能命中，而用户往往
// 心里清楚这首歌是什么。传空 map 就按曲库里的元数据搜。
func (s *CoverService) Lookup(songID string, override map[string]any) (CoverResult, error) {
	list, err := s.LookupAll(songID, override)
	if err != nil {
		return CoverResult{}, err
	}
	if len(list) == 0 {
		return CoverResult{Message: "没有找到匹配的封面"}, nil
	}
	return list[0], nil
}

// LookupAll 一次性返回**所有来源**的可用封面（按可信度降序，已下载并校验）。
//
// 与 Lookup 的区别：Lookup 只给「最可信的那一张」，这里把所有来源的候选
// 都给出来（iTunes 单曲/专辑、网易云、Deezer、MusicBrainz + 调用方给的候选地址），
// 前端「更换封面」面板就能一次展示多种获取结果，用户自己挑。
//
// 关键点：**白图不算命中**。某些图床在专辑没有封面时返回的不是 404，
// 而是一张纯白占位图；只看状态码完全发现不了（这正是「封面永远是白的」的成因）。
// 校验在 coverfetch.ResolveAll 里做，被丢弃的候选会带原因返回。
func (s *CoverService) LookupAll(songID string, override map[string]any) ([]CoverResult, error) {
	song, ok := s.songs(songID)
	if !ok {
		return nil, fmt.Errorf("歌曲不存在: %s", songID)
	}
	if !s.store.Get().OnlineCover {
		return nil, nil
	}

	title := firstNonEmptyStr(asString(override["title"], ""), song.Title)
	artist := firstNonEmptyStr(asString(override["artist"], ""), song.Artist)
	album := firstNonEmptyStr(asString(override["album"], ""), song.Album)

	// 只给一个关键词时（封面面板现在只有一个「关键词」输入框）：
	// 关键词当标题用，歌手/专辑**清空**而不是回退到曲目元数据。
	// 理由：用户输关键词就是想「按我说的搜」，如果还夹带原曲的歌手/专辑，
	// 搜出来的结果会被原元数据锁死（比如想给一首标错歌手的歌换封面时，
	// 关键词明明对了却搜不到）。这是前端把歌手/专辑输入框合并成一个之后的
	// 必要语义 —— 少了它，关键词搜索等于没生效。
	if kw := strings.TrimSpace(asString(override["keyword"], "")); kw != "" {
		title = kw
		artist = ""
		album = ""
	}

	// 「未知歌手 / 未知专辑」这类占位元数据会把搜索带偏（网易云的专辑搜索
	// 会真的命中一批叫「未知专辑」的盗版合辑，封面多半是白图）。
	// 与其拿它们去搜，不如只按标题搜。
	if isPlaceholderMeta(artist) {
		artist = ""
	}
	if isPlaceholderMeta(album) {
		album = ""
	}

	// 自动匹配（用户没填高级区关键词）时，先用 AI 清洗脏元数据，提升命中率。
	// 用户手动给了关键词就完全尊重用户，不做 AI 覆盖。
	hasManualOverride := asString(override["title"], "") != "" ||
		asString(override["artist"], "") != "" ||
		asString(override["album"], "") != "" ||
		asString(override["keyword"], "") != ""
	if s.ai != nil && s.ai.Enabled() && !hasManualOverride {
		if cleaned, err := s.ai.ExtractMeta(song.Title, song.Artist, song.Album, filepath.Base(song.Path)); err == nil {
			if !isPlaceholderMeta(cleaned.Title) {
				title = firstNonEmptyStr(cleaned.Title, title)
			}
			if !isPlaceholderMeta(cleaned.Artist) {
				artist = firstNonEmptyStr(cleaned.Artist, artist)
			}
			if !isPlaceholderMeta(cleaned.Album) {
				album = firstNonEmptyStr(cleaned.Album, album)
			}
		}
	}

	req := coverfetch.Request{
		Title:    title,
		Artist:   artist,
		Album:    album,
		Duration: song.Duration,
	}
	if v, ok := override["duration"].(float64); ok && v > 0 {
		req.Duration = int64(v)
	}

	list, skipped, err := s.covers.ResolveAll(context.Background(), req)
	if err != nil {
		if errors.Is(err, coverfetch.ErrNotFound) {
			// 全部候选都是白图/打不开时，把原因说出来，别让用户以为是网络问题
			for _, sk := range skipped {
				if errors.Is(skipErr(sk), coverfetch.ErrBlankImage) {
					return []CoverResult{{
						Message: "找到的图都是空白占位图，已丢弃；可以在这里手填歌曲名/歌手再搜，或直接粘贴图片地址",
					}}, nil
				}
			}
			return nil, nil
		}
		return nil, err
	}

	out := make([]CoverResult, 0, len(list))
	for _, item := range list {
		out = append(out, CoverResult{
			OK:       true,
			Provider: item.Provider,
			Score:    item.Score,
			Source:   item.URL,
			Preview:  dataURL(item.MIME, item.Image.Body),
			Width:    item.Info.Width,
			Height:   item.Info.Height,
		})
	}
	return out, nil
}

// skipErr 把 Skipped 的文本原因还原成可比较的错误（仅用于判断「是不是白图」）。
func skipErr(sk coverfetch.Skipped) error {
	if strings.Contains(sk.Reason, coverfetch.ErrBlankImage.Error()) {
		return coverfetch.ErrBlankImage
	}
	return errors.New(sk.Reason)
}

// isPlaceholderMeta 判断一个元数据字段是不是「占位值」。
//
// 曲库扫描时，没有标签的文件会被填成「未知歌手 / 未知专辑」（见 library.fillFallback）。
// 这些值拿去搜封面/歌词只会污染结果，必须当成「没有这个信息」。
func isPlaceholderMeta(v string) bool {
	v = strings.TrimSpace(strings.ToLower(v))
	switch v {
	case "", "未知歌手", "未知专辑", "未知", "unknown", "unknown artist", "unknown album",
		"various artists", "va", "n/a", "-", "无":
		return true
	}
	return false
}

// placeholderTitleRe 匹配「像文件名而不像歌名」的标题。
//
// 例：01 / 07 / track 07 / Track07 / audio 03 / 未知歌曲 / untitled。
// 这类标题来自没有标签的文件（标题是用文件名兜底的），拿去搜在线歌词
// 几乎必然匹配到别人的歌词 —— 错的歌词比没有歌词更糟。
var placeholderTitleRe = regexp.MustCompile(
	`^(?:\d{1,3}|track\s*\d{1,3}|audio\s*\d{1,3}|song\s*\d{1,3}|unknown|untitled|未命名|未知歌曲|未知|新录音|new recording)$`)

// isPlaceholderTitle 判断标题是不是「文件名式的占位标题」。
func isPlaceholderTitle(title string) bool {
	t := strings.ToLower(strings.TrimSpace(title))
	if t == "" {
		return true
	}
	// 去掉常见分隔符后再判断：01. / 01 - xxx 之类的编号前缀
	if placeholderTitleRe.MatchString(t) {
		return true
	}
	return false
}

// Request 用户手动指定一个封面地址（自己粘贴图片链接）。
func (s *CoverService) Fetch(rawURL string) (CoverResult, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return CoverResult{}, errors.New("图片地址不能为空")
	}
	if !coverfetch.AllowedImageURL(rawURL) {
		return CoverResult{Message: "这个地址不在允许的图床列表里"}, nil
	}
	data, err := coverfetch.Download(context.Background(), rawURL)
	if err != nil {
		return CoverResult{Message: "图片下载失败：" + err.Error()}, nil
	}
	info, err := coverfetch.InspectImage(data.Body)
	if err != nil {
		return CoverResult{Message: "这张图不能用：" + err.Error()}, nil
	}
	mime := coverfetch.NormalizeMIME(data.ContentType, data.Body)
	return CoverResult{
		OK: true, Provider: "manual", Source: rawURL,
		Preview: dataURL(mime, data.Body),
		Width:   info.Width, Height: info.Height,
	}, nil
}

// Apply 把用户选中的封面设为这首歌的封面。
//
// 传 imageURL 时先下载；传 previewDataURL 时直接解码（前端预览里已经有字节了，
// 不用再下一遍）。写完缓存后按设置决定是否写回歌曲文件。
//
// embed 由调用方显式传入（nil = 按配置走）。
func (s *CoverService) Apply(songID, imageURL, previewDataURL string) (CoverResult, error) {
	return s.ApplyWith(songID, imageURL, previewDataURL, nil)
}

// ApplyWith 与 Apply 相同，但可以显式指定是否写回歌曲文件。
//
// 为什么不让服务自己读配置：配置是从前端同步过来的，而前端是防抖 400ms
// 批量推送的。如果调用方刚改了设置就立刻换封面，服务这边读到的很可能还是旧值
// （实测就是这个原因导致「明明开了写回，结果没写」）。显式传入就没有这个竞态。
func (s *CoverService) ApplyWith(songID, imageURL, previewDataURL string, embed *bool) (CoverResult, error) {
	if _, ok := s.songs(songID); !ok {
		return CoverResult{}, fmt.Errorf("歌曲不存在: %s", songID)
	}

	var body []byte
	var mime string
	source := "user"

	switch {
	case strings.TrimSpace(previewDataURL) != "":
		b, m, err := decodeDataURL(previewDataURL)
		if err != nil {
			return CoverResult{}, err
		}
		body, mime = b, m
	case strings.TrimSpace(imageURL) != "":
		if !coverfetch.AllowedImageURL(imageURL) {
			return CoverResult{Message: "这个地址不在允许的图床列表里"}, nil
		}
		data, err := coverfetch.Download(context.Background(), imageURL)
		if err != nil {
			return CoverResult{Message: "图片下载失败：" + err.Error()}, nil
		}
		body, mime, source = data.Body, data.ContentType, imageURL
	default:
		return CoverResult{}, errors.New("缺少封面内容")
	}

	// 校验：白图/坏图不写进缓存，否则「封面是白的」会被固化下来，
	// 以后每次打开都还是那张白图（缓存目录里的文件才是真相来源）。
	info, err := coverfetch.InspectImage(body)
	if err != nil {
		return CoverResult{Message: "这张图不能用：" + err.Error()}, nil
	}
	mime = coverfetch.NormalizeMIME(mime, body)

	if _, err := s.cache.AddCover(songID, mime, body, source, info.Width, info.Height); err != nil {
		return CoverResult{}, err
	}

	res := CoverResult{
		OK:      true,
		Source:  source,
		Preview: dataURL(mime, body),
		Width:   info.Width,
		Height:  info.Height,
	}
	// 写回文件时把**全部**封面一起写：文件里存的是一整套（第一张=封面正面），
	// 只写当前这张会让「轮播」在别的播放器里丢失。
	// 注意这不会丢掉刚加的那张：AddCover 已经把 active 指向它了。
	if msg := s.triggerEmbed(songID, embed); msg != "" {
		res.Message = "封面已缓存；" + msg
		res.Embedded = strings.HasPrefix(msg, "已写入歌曲文件")
	}
	s.emitCoverChanged(songID, source, res.Embedded)
	return res, nil
}

// embedEnabled 当前设置里是否开启了「写回歌曲文件」。
func (s *CoverService) embedEnabled() bool {
	if s.store == nil {
		return false
	}
	return s.store.Get().EmbedMeta
}

// embedDecision 决定这次操作到底写不写文件。
//
// 为什么不让服务自己读配置：配置是从前端同步过来的，而前端是防抖 400ms
// 批量推送的。如果调用方刚改了设置就立刻换封面，服务这边读到的很可能还是旧值
// （实测就是这个原因导致「明明开了写回，结果没写」）。显式传入就没有这个竞态。
func embedDecision(configured bool, explicit *bool) bool {
	if explicit != nil {
		return *explicit
	}
	return configured
}

// embedCoversFor 把某首歌缓存里的全部封面（+ 可选歌词）一次写进歌曲文件。
//
// 顺序严格按 items（第一张 = 封面正面），因为文件里的封面顺序就是
// 「哪个是正面」的唯一依据。
func (s *CoverService) embedCoversFor(songID, lyrics string) (metacache.EmbedResult, error) {
	song, ok := s.songs(songID)
	if !ok {
		return metacache.EmbedResult{}, fmt.Errorf("歌曲不存在: %s", songID)
	}
	entryItems := s.cache.Covers(songID)
	covers := make([]metacache.CoverImage, 0, len(entryItems))
	for i := range entryItems {
		data, mime, ok := s.cache.CoverBytesAt(songID, i)
		if !ok {
			continue
		}
		covers = append(covers, metacache.CoverImage{MIME: mime, Data: data})
	}
	return metacache.EmbedCovers(song.Path, covers, lyrics)
}

// coverItems 把缓存里的全部封面转成可展示项（预览 data URL + 尺寸 + 字节数）。
//
// 读不到文件的项直接跳过：索引里记着、文件却没了（用户手动删过缓存），
// 把它列出来只会得到一个破图。
func (s *CoverService) coverItems(songID string) ([]CoverItem, int) {
	entryItems := s.cache.Covers(songID)
	out := make([]CoverItem, 0, len(entryItems))
	for i, it := range entryItems {
		url, ok := s.cache.CoverDataURLAt(songID, i)
		if !ok {
			continue
		}
		size := 0
		if path, ok := s.cache.CoverPathAt(songID, i); ok {
			if st, err := os.Stat(path); err == nil {
				size = int(st.Size())
			}
		}
		out = append(out, CoverItem{
			Index:    i,
			Preview:  url,
			Source:   it.Source,
			Provider: coverProvider(it.Source),
			MIME:     it.MIME,
			Width:    it.Width,
			Height:   it.Height,
			Bytes:    size,
			At:       it.At,
			Active:   i == s.cache.ActiveCover(songID),
		})
	}
	return out, s.cache.ActiveCover(songID)
}

// coverProvider 把 v1 时代混在 source 里的「来源类型:地址」拆出来。
//
// 历史原因：source 字段同时承担了两个含义 —— 用户手动选的是 "user"，
// 从图床下载的存的是图片地址（甚至 "itunes:https://…"）。这里只做**展示用**
// 的宽松拆分，不改缓存里的原值（改了会让旧索引与新索引不一致）。
func coverProvider(source string) string {
	src := strings.TrimSpace(source)
	if src == "" {
		return ""
	}
	if i := strings.Index(src, ":"); i > 0 {
		head := src[:i]
		// 只有「看起来像来源名」的前缀才算 provider：http/https 本身就是地址
		if !strings.Contains(head, "/") && !strings.EqualFold(head, "http") && !strings.EqualFold(head, "https") {
			return head
		}
	}
	if strings.EqualFold(src, "user") {
		return "user"
	}
	return "url"
}

// embeddedItems 读取歌曲文件里**内嵌**的封面（只读展示项）。
//
// 在线试听曲目（没有本地文件）与文件被删掉的情况都直接跳过，不报错 ——
// 「文件里有没有图」是锦上添花，不该让封面面板整体失败。
func (s *CoverService) embeddedItems(song bootstrap.Song) []CoverItem {
	path := strings.TrimSpace(song.Path)
	if path == "" {
		return nil
	}
	if st, err := os.Stat(path); err != nil || st.IsDir() {
		return nil
	}
	pics := meta.ReadPictures(path)
	out := make([]CoverItem, 0, len(pics))
	for i, p := range pics {
		out = append(out, CoverItem{
			// 负数下标是「只读项」的标记：缓存项是 0..n-1，内嵌项是 -1-i。
			// 前端据此决定「切换/删除」这两个动作能不能点。
			Index:    -1 - i,
			Preview:  dataURL(p.MIME, p.Data),
			Source:   path,
			Provider: "embedded",
			MIME:     p.MIME,
			Bytes:    len(p.Data),
			Embedded: true,
			Active:   false,
		})
	}
	return out
}

// coverSetOf 组装一首歌的完整封面集合（缓存项 + 文件内嵌项）。
func (s *CoverService) coverSetOf(songID string) CoverSet {
	song, ok := s.songs(songID)
	if !ok {
		return CoverSet{ID: songID, Items: []CoverItem{}, Embedded: []CoverItem{},
			Message: "歌曲不在曲库里（可能已被移除或重命名）"}
	}
	items, active := s.coverItems(songID)
	return CoverSet{
		ID:       songID,
		Items:    items,
		Embedded: s.embeddedItems(song),
		Active:   active,
	}
}

// triggerEmbed 按需把全部封面写回歌曲文件，并返回一句给人看的说明。
//
// 写回是可选的增强：失败只影响「文件里有没有图」，缓存里的封面始终有效，
// 所以这里把错误转成 Message 而不是往上抛。
func (s *CoverService) triggerEmbed(songID string, embed *bool) string {
	if !embedDecision(s.embedEnabled(), embed) {
		return ""
	}
	res, err := s.embedCoversFor(songID, "")
	switch {
	case err == nil && res.OK:
		return "已写入歌曲文件：" + res.Message
	case errors.Is(err, metacache.ErrUnsupported):
		return "该格式暂不支持写入文件，播放器仍会显示新封面"
	default:
		return "写入文件失败：" + errText(err)
	}
}

// emitCoverChanged 通知前端某首歌的封面变了。
//
// payload 里补上 count（这首歌现在有几张封面）：前端做轮播与缩略图列表时
// 需要它来决定要不要重新拉列表，没有 count 就只能每次都拉一遍 List。
func (s *CoverService) emitCoverChanged(songID, source string, embedded bool) {
	s.emit("cover:changed", map[string]any{
		"id":       songID,
		"source":   source,
		"embedded": embedded,
		"count":    s.cache.CoverCount(songID),
	})
}

/* --------------------------------------------------------------------------
   多封面的对外接口（会被 wails3 生成前端绑定）
   -------------------------------------------------------------------------- */

// CoverItem 一张封面（缓存里的可编辑项，或文件内嵌的只读项）。
type CoverItem struct {
	Index    int    `json:"index"`   // 缓存项=0..n-1；内嵌项=-1-i（负数，只读）
	Preview  string `json:"preview"` // data URL
	Source   string `json:"source"`
	Provider string `json:"provider,omitempty"`
	MIME     string `json:"mime,omitempty"`
	Width    int    `json:"width,omitempty"`
	Height   int    `json:"height,omitempty"`
	Bytes    int    `json:"bytes,omitempty"`
	At       int64  `json:"at,omitempty"`
	Embedded bool   `json:"embedded,omitempty"`
	Active   bool   `json:"active"`
}

// CoverSet 一首歌的封面集合。
//
// 这里没有「轮播开关」：轮播是全局偏好（bootstrap.Config.CoverCarousel），
// 前端根据自己的设置决定要不要轮换显示 Items。服务端只负责给数据。
type CoverSet struct {
	ID       string      `json:"id"`
	Items    []CoverItem `json:"items"`    // 缓存里的（可增删/切换）
	Embedded []CoverItem `json:"embedded"` // 文件内嵌的（只读展示）
	Active   int         `json:"active"`
	Message  string      `json:"message,omitempty"`
}

// List 返回一首歌的封面集合（缓存项 + 文件内嵌项）。
//
// 内嵌项是**只读**的展示：它们来自歌曲文件本身，我们只能整体重写文件，
// 没法单独改其中一张，所以下标用负数标记出来给前端区分。
func (s *CoverService) List(songID string) (CoverSet, error) {
	if _, ok := s.songs(songID); !ok {
		return CoverSet{}, fmt.Errorf("歌曲不存在: %s", songID)
	}
	set := s.coverSetOf(songID)
	if len(set.Items) == 0 && len(set.Embedded) == 0 {
		set.Message = "这首歌还没有封面（可以联网搜索、粘贴图片地址，或从文件内嵌相册里挑一张）"
	}
	return set, nil
}

// Add 追加一张封面并把它设为当前生效，返回新的封面集合。
//
// 参数与 ApplyWith 一致：imageURL 会先下载，previewDataURL 直接解码
// （前端预览里已经有字节了，不用再下一遍）。校验失败的图**不进缓存** ——
// 白图一旦落盘，本地缓存目录就成了新的「真相来源」，之后每次打开都还是白的。
func (s *CoverService) Add(songID, imageURL, previewDataURL string, embed *bool) (CoverSet, error) {
	if _, ok := s.songs(songID); !ok {
		return CoverSet{}, fmt.Errorf("歌曲不存在: %s", songID)
	}

	var body []byte
	var mime string
	source := "user"

	switch {
	case strings.TrimSpace(previewDataURL) != "":
		b, m, err := decodeDataURL(previewDataURL)
		if err != nil {
			return CoverSet{}, err
		}
		body, mime = b, m
	case strings.TrimSpace(imageURL) != "":
		if !coverfetch.AllowedImageURL(imageURL) {
			return CoverSet{}, errors.New("这个地址不在允许的图床列表里")
		}
		data, err := coverfetch.Download(context.Background(), imageURL)
		if err != nil {
			return CoverSet{}, fmt.Errorf("图片下载失败: %w", err)
		}
		body, mime, source = data.Body, data.ContentType, imageURL
	default:
		return CoverSet{}, errors.New("缺少封面内容")
	}

	info, err := coverfetch.InspectImage(body)
	if err != nil {
		return CoverSet{}, fmt.Errorf("这张图不能用: %w", err)
	}
	mime = coverfetch.NormalizeMIME(mime, body)

	if _, err := s.cache.AddCover(songID, mime, body, source, info.Width, info.Height); err != nil {
		return CoverSet{}, err
	}

	set := s.coverSetOf(songID)
	if msg := s.triggerEmbed(songID, embed); msg != "" {
		set.Message = msg
	} else {
		set.Message = fmt.Sprintf("已添加封面，共 %d 张", len(s.cache.Covers(songID)))
	}
	s.emitCoverChanged(songID, source, strings.HasPrefix(set.Message, "已写入歌曲文件"))
	return set, nil
}

// AddMany 批量追加 data URL 形式的封面，返回最终集合。
//
// 语义是「尽量加」：空白/非法/校验不过的项跳过并计数，最后在 Message 里
// 说清楚「成功 n 张、跳过 m 张」。这样前端可以放心地把整批候选图丢进来
// （用户一次多选几张），不必自己先筛一遍。
func (s *CoverService) AddMany(songID string, previews []string, embed *bool) (CoverSet, error) {
	if _, ok := s.songs(songID); !ok {
		return CoverSet{}, fmt.Errorf("歌曲不存在: %s", songID)
	}

	added, skipped, lastSource := 0, 0, "user"
	for _, raw := range previews {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			skipped++
			continue
		}
		body, mime, err := decodeDataURL(raw)
		if err != nil {
			skipped++
			continue
		}
		info, err := coverfetch.InspectImage(body)
		if err != nil {
			// 白图/坏图：和单张添加一样，绝不让它落进缓存
			skipped++
			continue
		}
		mime = coverfetch.NormalizeMIME(mime, body)
		if _, err := s.cache.AddCover(songID, mime, body, "user", info.Width, info.Height); err != nil {
			skipped++
			continue
		}
		added++
		lastSource = "user"
	}

	set := s.coverSetOf(songID)
	// 写回只做一次（放在循环外）：每张都写一遍等于把整个文件读写 N 次，
	// 而结果完全一样 —— 文件里最终就是这一整套封面。
	embedMsg := s.triggerEmbed(songID, embed)
	parts := []string{fmt.Sprintf("成功添加 %d 张，跳过 %d 张", added, skipped)}
	if embedMsg != "" {
		parts = append(parts, embedMsg)
	}
	set.Message = strings.Join(parts, "；")
	s.emitCoverChanged(songID, lastSource, strings.HasPrefix(embedMsg, "已写入歌曲文件"))
	return set, nil
}

// SetActive 切换当前生效的那张封面。
func (s *CoverService) SetActive(songID string, index int) (CoverSet, error) {
	if _, ok := s.songs(songID); !ok {
		return CoverSet{}, fmt.Errorf("歌曲不存在: %s", songID)
	}
	if err := s.cache.SetActiveCover(songID, index); err != nil {
		return s.coverSetOf(songID), err
	}
	set := s.coverSetOf(songID)
	set.Message = "已切换到第 " + itoa(index+1) + " 张"
	s.emitCoverChanged(songID, s.cache.CoverSource(songID), false)
	return set, nil
}

// Remove 删除第 index 张**缓存**封面（内嵌项删不掉，只能用 Reset 清缓存）。
func (s *CoverService) Remove(songID string, index int) (CoverSet, error) {
	if _, ok := s.songs(songID); !ok {
		return CoverSet{}, fmt.Errorf("歌曲不存在: %s", songID)
	}
	if index < 0 {
		return s.coverSetOf(songID), errors.New("文件内嵌的封面是只读的，不能删除")
	}
	if err := s.cache.RemoveCover(songID, index); err != nil {
		return s.coverSetOf(songID), err
	}
	set := s.coverSetOf(songID)
	set.Message = fmt.Sprintf("已删除，还剩 %d 张", len(s.cache.Covers(songID)))
	s.emitCoverChanged(songID, "", false)
	return set, nil
}

// itoa 小整数转字符串（避免为一个数字引入 fmt 的开销与格式差异）。
func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// Reset 恢复原始封面：删掉缓存里的全部封面。
//
// 注意写回文件的封面**无法撤销**（我们不会备份用户的原始标签），
// 所以这里明确告诉前端：只清缓存，文件里已经写进去的不动。
func (s *CoverService) Reset(songID string) (map[string]any, error) {
	if _, ok := s.songs(songID); !ok {
		return nil, fmt.Errorf("歌曲不存在: %s", songID)
	}
	if err := s.cache.DeleteCover(songID); err != nil {
		return nil, err
	}
	s.emitCoverChanged(songID, "", false)
	return map[string]any{"ok": true, "note": "已恢复原始封面（写入文件的部分不会撤销）"}, nil
}

// Current 读取这首歌当前生效的封面（缓存优先）。
//
// 保留这个 map 形态的接口是因为前端还有旧调用点；新代码请用 List，
// 它把「全部封面 + 内嵌封面」一次给全。
func (s *CoverService) Current(songID string) map[string]any {
	out := map[string]any{
		"id":     songID,
		"cached": false,
		"count":  s.cache.CoverCount(songID),
		"active": s.cache.ActiveCover(songID),
	}
	if url, ok := s.cache.CoverDataURL(songID); ok {
		out["cached"] = true
		out["preview"] = url
		out["source"] = s.cache.CoverSource(songID)
	}
	return out
}

// maxCachedPreviews 一次回填的封面数量上限。
//
// 封面是 base64 的 data URL（每张几十~几百 KB），全量回填上千首会一次传几十 MB。
// 用户真正「换过封面」的歌通常只有几十首，因此上限设成 200 足够用，
// 超出时也不报错 —— 前端仍然可以在打开封面面板时按需取单首（Current / List）。
const maxCachedPreviews = 200

// CachedPreviews 返回缓存里已有的封面（songID → **当前生效**那张的 data URL）。
//
// 为什么需要它：用户换过的封面存在缓存目录（缓存才是真相来源），但前端的
// coverOverrides 只是内存表；不主动回填的话，重启应用后换过的封面就"消失"了
// （文件里嵌没嵌入取决于设置，默认是不嵌入的）。
func (s *CoverService) CachedPreviews() map[string]string {
	ids := s.cache.CoverIDs()
	out := make(map[string]string, len(ids))
	for _, id := range ids {
		if len(out) >= maxCachedPreviews {
			break
		}
		if url, ok := s.cache.CoverDataURL(id); ok {
			out[id] = url
		}
	}
	return out
}

// CachedSets 返回所有有缓存封面的歌的封面集合（启动时批量回填用）。
//
// 与 CachedPreviews 的区别：这里连 items 的预览一起给，前端一开机就能画出
// 每首歌的缩略图列表、并知道哪张在生效、轮播开没开。
//
// Embedded 刻意留空：内嵌封面要**逐个打开歌曲文件**去解析，几百首歌就是几百次
// 全文件读取（有些文件上百 MB）。那是打开封面面板时才该做的事（List 会做）。
func (s *CoverService) CachedSets() map[string]CoverSet {
	ids := s.cache.CoverIDs()
	out := make(map[string]CoverSet, len(ids))
	for _, id := range ids {
		if len(out) >= maxCachedPreviews {
			break
		}
		items, active := s.coverItems(id)
		if len(items) == 0 {
			continue
		}
		out[id] = CoverSet{
			ID:       id,
			Items:    items,
			Embedded: []CoverItem{},
			Active:   active,
		}
	}
	return out
}

// CacheStats 缓存目录概况（设置界面展示）。
func (s *CoverService) CacheStats() map[string]any {
	return s.cache.Stats()
}

/* --------------------------------------------------------------------------
   一次性把「已有的缓存」写进歌曲文件
   --------------------------------------------------------------------------
   场景：用户本来只把封面/歌词放在缓存目录里，后来打开了「把封面/歌词写进歌曲
   文件」。这时缓存里往往已经有一批算好的封面与歌词，逐个手动重设一遍不现实，
   所以要有一个「把缓存里的东西补写进文件」的动作。

   两条硬规则：
     1. **只在用户确认后执行**（前端会先弹一个确认框）—— 这会改写用户的音乐文件；
     2. 不支持写标签的格式（mp3 / wav / ogg…）明确计入 skipped，不尝试、不报错。
   -------------------------------------------------------------------------- */

// WriteCacheToFiles 把缓存目录里已有的封面 + 歌词写进对应的歌曲文件。
//
// 返回统计：total（有缓存可写的歌曲数）/ written / skipped（不支持写标签的格式）/
// failed / covers / lyrics（分别写成功的份数）/ bytes（读了多少缓存数据）。
func (s *CoverService) WriteCacheToFiles() (map[string]any, error) {
	// 一首歌可能只有封面、只有歌词，也可能两样都有 —— 先按 songID 归并
	type entry struct {
		hasCover  bool
		hasLyrics bool
	}
	merged := map[string]*entry{}
	order := []string{}
	push := func(id string, cover bool) {
		e, ok := merged[id]
		if !ok {
			e = &entry{}
			merged[id] = e
			order = append(order, id)
		}
		if cover {
			e.hasCover = true
		} else {
			e.hasLyrics = true
		}
	}
	for _, id := range s.cache.CoverIDs() {
		push(id, true)
	}
	for _, id := range s.cache.LyricsIDs() {
		push(id, false)
	}

	res := map[string]any{
		"total":   len(order),
		"written": 0,
		"skipped": 0,
		"failed":  0,
		"covers":  0,
		"lyrics":  0,
		"bytes":   0,
		"reasons": []string{},
	}
	if len(order) == 0 {
		return res, nil
	}

	const maxReasons = 8
	reasons := []string{}
	written, skipped, failed, covers, lyrics, bytes := 0, 0, 0, 0, 0, 0

	for i, id := range order {
		e := merged[id]
		song, ok := s.songs(id)
		if !ok {
			// 曲库里已经没有这首歌了（缓存是残留的），跳过即可
			skipped++
			continue
		}
		if !metacache.SupportedEmbed(song.Ext) {
			skipped++
			if len(reasons) < maxReasons {
				reasons = append(reasons, fmt.Sprintf("%s（%s 暂不支持写标签）", song.Title, strings.TrimPrefix(song.Ext, ".")))
			}
			continue
		}

		var coverImages []metacache.CoverImage
		coverBytes := 0
		if e.hasCover {
			// 多封面：把所有缓存项一起写进去（顺序 = items，第一张=封面正面）。
			// 只写「当前生效」那张的话，文件里就丢了其它几张，
			// 而「补写进文件」这个动作的承诺恰恰是「把缓存里的东西写进去」。
			entryItems := s.cache.Covers(id)
			for i := range entryItems {
				data, mime, ok := s.cache.CoverBytesAt(id, i)
				if !ok {
					continue
				}
				coverImages = append(coverImages, metacache.CoverImage{MIME: mime, Data: data})
				coverBytes += len(data)
			}
		}
		var text string
		if e.hasLyrics {
			if cached, ok := s.cache.Lyrics(id); ok {
				text = cached
			}
		}
		if len(coverImages) == 0 && strings.TrimSpace(text) == "" {
			skipped++
			continue
		}

		// 一次写入封面 + 歌词：分两次写会把整个文件读两遍、moov 重建两遍
		embedRes, err := metacache.EmbedCovers(song.Path, coverImages, text)
		switch {
		case err == nil && embedRes.OK:
			written++
			if len(coverImages) > 0 {
				covers++
				bytes += coverBytes
			}
			if strings.TrimSpace(text) != "" {
				lyrics++
				bytes += len(text)
			}
		case errors.Is(err, metacache.ErrUnsupported):
			skipped++
			if len(reasons) < maxReasons {
				reasons = append(reasons, fmt.Sprintf("%s（%s 暂不支持写标签）", song.Title, strings.TrimPrefix(song.Ext, ".")))
			}
		default:
			failed++
			if len(reasons) < maxReasons {
				reasons = append(reasons, fmt.Sprintf("%s：%v", song.Title, err))
			}
		}

		s.emit("meta:embed-progress", map[string]any{
			"done":    i + 1,
			"total":   len(order),
			"title":   song.Title,
			"written": written,
		})
	}

	res["written"] = written
	res["skipped"] = skipped
	res["failed"] = failed
	res["covers"] = covers
	res["lyrics"] = lyrics
	res["bytes"] = bytes
	res["reasons"] = reasons
	if written > 0 {
		s.emit("cover:changed", map[string]any{"id": "", "source": "", "embedded": true, "count": covers})
	}
	return res, nil
}

// OpenCacheDir 在文件管理器里打开缓存目录。
func (s *CoverService) OpenCacheDir(kind string) error {
	sub := metacache.KindCover
	if strings.EqualFold(strings.TrimSpace(kind), string(metacache.KindLyrics)) {
		sub = metacache.KindLyrics
	}
	dir := filepath.Join(s.cache.Dir(), string(sub))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return revealPath(dir)
}

// ClearCache 清空缓存（封面 + 歌词）。已经写回文件的标签不受影响。
func (s *CoverService) ClearCache() (map[string]any, error) {
	covers, lyrics := 0, 0
	for _, id := range s.cache.CoverIDs() {
		if err := s.cache.DeleteCover(id); err == nil {
			covers++
		}
	}
	// 歌词索引没有单独暴露删除接口，这里直接删文件 + 重建存储
	lyricsDir := filepath.Join(s.cache.Dir(), string(metacache.KindLyrics))
	entries, _ := os.ReadDir(lyricsDir)
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".lrc") {
			if err := os.Remove(filepath.Join(lyricsDir, e.Name())); err == nil {
				lyrics++
			}
		}
	}
	s.emit("cover:changed", map[string]any{"id": "", "source": ""})
	return map[string]any{"covers": covers, "lyrics": lyrics}, nil
}

/* --------------------------------------------------------------------------
   工具
   -------------------------------------------------------------------------- */

func firstNonEmptyStr(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func dataURL(mime string, body []byte) string {
	if strings.TrimSpace(mime) == "" {
		mime = "image/jpeg"
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(body)
}

// decodeDataURL 解析 "data:image/jpeg;base64,xxxx"。
func decodeDataURL(raw string) ([]byte, string, error) {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "data:") {
		return nil, "", errors.New("不是合法的 data URL")
	}
	comma := strings.Index(raw, ",")
	if comma < 0 {
		return nil, "", errors.New("data URL 缺少内容")
	}
	meta := raw[5:comma]
	payload := raw[comma+1:]
	if !strings.Contains(meta, "base64") {
		return nil, "", errors.New("只支持 base64 编码的 data URL")
	}
	mime := strings.TrimSuffix(meta, ";base64")
	if mime == "" {
		mime = "image/jpeg"
	}
	body, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, "", fmt.Errorf("data URL 解码失败: %w", err)
	}
	if len(body) == 0 {
		return nil, "", errors.New("封面内容为空")
	}
	return body, mime, nil
}
