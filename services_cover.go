package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/coverfetch"
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
	// emitFn 事件发送
	emitFn func(string, any)
}

// NewCoverService 构造服务。
func NewCoverService(store *bootstrap.Store, cache *metacache.Store, covers *coverfetch.Aggregator,
	songs func(id string) (bootstrap.Song, bool)) *CoverService {
	return &CoverService{store: store, cache: cache, covers: covers, songs: songs}
}

func (s *CoverService) setEmitter(fn func(string, any)) { s.emitFn = fn }

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
}

// Lookup 联网为某首**本地歌曲**找封面。
//
// 只返回候选与预览，不落盘 —— 用户可能连着看几个候选再决定用哪个。
//
// override 允许调用方临时覆盖标题/歌手/专辑：下载下来的文件本来没有标签
// （标题是从文件名推出来的），直接拿去搜基本不可能命中，而用户往往
// 心里清楚这首歌是什么。传空 map 就按曲库里的元数据搜。
func (s *CoverService) Lookup(songID string, override map[string]any) (CoverResult, error) {
	song, ok := s.songs(songID)
	if !ok {
		return CoverResult{}, fmt.Errorf("歌曲不存在: %s", songID)
	}
	if !s.store.Get().OnlineCover {
		return CoverResult{Message: "在线封面已在设置中关闭"}, nil
	}

	req := coverfetch.Request{
		Title:    firstNonEmptyStr(asString(override["title"], ""), song.Title),
		Artist:   firstNonEmptyStr(asString(override["artist"], ""), song.Artist),
		Album:    firstNonEmptyStr(asString(override["album"], ""), song.Album),
		Duration: song.Duration,
	}
	if v, ok := override["duration"].(float64); ok && v > 0 {
		req.Duration = int64(v)
	}
	cover, err := s.covers.Find(context.Background(), req)
	if err != nil {
		if errors.Is(err, coverfetch.ErrNotFound) {
			return CoverResult{Message: "没有找到匹配的封面"}, nil
		}
		return CoverResult{}, err
	}

	data, err := coverfetch.Download(context.Background(), cover.URL)
	if err != nil {
		return CoverResult{Message: "封面下载失败：" + err.Error()}, nil
	}
	return CoverResult{
		OK:       true,
		Provider: cover.Provider,
		Score:    cover.Score,
		Source:   cover.URL,
		Preview:  dataURL(data.ContentType, data.Body),
	}, nil
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
	return CoverResult{OK: true, Provider: "manual", Source: rawURL, Preview: dataURL(data.ContentType, data.Body)}, nil
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
	song, ok := s.songs(songID)
	if !ok {
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

	if _, err := s.cache.SaveCover(songID, mime, body, source); err != nil {
		return CoverResult{}, err
	}

	res := CoverResult{OK: true, Source: source, Preview: dataURL(mime, body)}
	embedEnabled := s.store.Get().EmbedMeta
	if embed != nil {
		embedEnabled = *embed
	}
	if embedEnabled {
		embedRes, err := metacache.EmbedCover(song.Path, mime, body)
		switch {
		case err == nil && embedRes.OK:
			res.Embedded = true
			res.Message = "已写入歌曲文件：" + embedRes.Message
		case errors.Is(err, metacache.ErrUnsupported):
			res.Message = "封面已缓存；该格式暂不支持写入文件，播放器仍会显示新封面"
		default:
			res.Message = "封面已缓存，但写入文件失败：" + err.Error()
		}
	}
	s.emit("cover:changed", map[string]any{"id": songID, "source": source, "embedded": res.Embedded})
	return res, nil
}

// Reset 恢复原始封面：删掉缓存里的覆盖图。
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
	s.emit("cover:changed", map[string]any{"id": songID, "source": ""})
	return map[string]any{"ok": true, "note": "已恢复原始封面（写入文件的部分不会撤销）"}, nil
}

// Current 读取这首歌当前生效的封面（缓存优先）。
func (s *CoverService) Current(songID string) map[string]any {
	out := map[string]any{"id": songID, "cached": false}
	if url, ok := s.cache.CoverDataURL(songID); ok {
		out["cached"] = true
		out["preview"] = url
		out["source"] = s.cache.CoverSource(songID)
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

		var coverBytes []byte
		var mime string
		if e.hasCover {
			path, ok := s.cache.CoverPath(id)
			if ok {
				if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
					coverBytes = data
					mime = s.cache.CoverMIME(id)
				}
			}
		}
		var text string
		if e.hasLyrics {
			if cached, ok := s.cache.Lyrics(id); ok {
				text = cached
			}
		}
		if len(coverBytes) == 0 && strings.TrimSpace(text) == "" {
			skipped++
			continue
		}

		// 一次写入封面 + 歌词：分两次写会把整个文件读两遍、moov 重建两遍
		embedRes, err := metacache.EmbedMeta(song.Path, mime, coverBytes, text)
		switch {
		case err == nil && embedRes.OK:
			written++
			if len(coverBytes) > 0 {
				covers++
				bytes += len(coverBytes)
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
		s.emit("cover:changed", map[string]any{"id": "", "source": "", "embedded": true})
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

func dataURL(mime string, body []byte) string {	if strings.TrimSpace(mime) == "" {
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
