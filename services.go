package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/executil"
	"musicplayer/internal/library"
	"musicplayer/internal/loudness"
	"musicplayer/internal/lyrics"
	"musicplayer/internal/media"
	"musicplayer/internal/metacache"
	"musicplayer/internal/theme"
)

// ---------------------------------------------------------------------------
// Library 服务：音乐文件夹、扫描、歌曲列表
// ---------------------------------------------------------------------------

// LibraryService 曲库相关的前端接口
type LibraryService struct {
	lib   *library.Manager
	watch *library.Watcher
	store *bootstrap.Store
	app   *application.App

	scanMu sync.Mutex

	// OnScanFinished 每次后台扫描结束时调用（仅用于测试同步，生产环境为 nil）
	OnScanFinished func()
}

// NewLibraryService 构造服务（app 由 main 在创建应用后注入）
func NewLibraryService(lib *library.Manager, watch *library.Watcher, store *bootstrap.Store) *LibraryService {
	return &LibraryService{lib: lib, watch: watch, store: store}
}

// ToggleLike 切换「我喜欢」状态，返回切换后的状态
func (s *LibraryService) ToggleLike(songID string) (bool, error) {
	if strings.TrimSpace(songID) == "" {
		return false, errors.New("歌曲 id 为空")
	}
	liked := false
	err := s.store.Update(func(c *bootstrap.Config) {
		for i, id := range c.LikedIDs {
			if id == songID {
				c.LikedIDs = append(c.LikedIDs[:i:i], c.LikedIDs[i+1:]...)
				liked = false
				return
			}
		}
		c.LikedIDs = append(c.LikedIDs, songID)
		liked = true
	})
	return liked, err
}

// Songs 返回过滤后的全部歌曲
func (s *LibraryService) Songs() []bootstrap.Song {
	return s.lib.Songs()
}

// Folders 返回已配置的音乐文件夹
func (s *LibraryService) Folders() []bootstrap.Folder {
	return s.lib.Folders()
}

// Scan 扫描指定文件夹（folderIds 为空表示全部）。
// 立即返回是否成功启动，实际进度通过 scan:progress / scan:done 事件推送。
// Scan 启动一次异步全量扫描。
// 返回 started=true 表示本次调用确实会跑一次扫描并最终发出 scan:done 事件。
// 注意：曲库内部会把并发的扫描请求排队（而不是丢弃），因此这里恒为 true，
// 前端只需等 scan:done 即可，不会出现「等不到事件」的情况。
func (s *LibraryService) Scan(folderIDs []string) map[string]any {
	s.emit("scan:start", map[string]any{"folderIds": folderIDs})
	s.lib.SetProgressFunc(func(phase string, current, total int) {
		s.emit("scan:progress", map[string]any{"phase": phase, "current": current, "total": total})
	})

	go s.runScan(30 * time.Minute)

	return map[string]any{"started": true}
}

// runScan 在后台跑一次全量扫描并广播结果（供 Scan / AddFolder 共用）
func (s *LibraryService) runScan(timeout time.Duration) {
	defer func() {
		if s.OnScanFinished != nil {
			s.OnScanFinished()
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	res, err := s.lib.Scan(ctx, false)
	if err != nil {
		s.emit("scan:failed", map[string]any{"message": err.Error()})
		return
	}
	s.emit("scan:done", res)
}

// AddFolder 弹出系统目录选择器并添加；用户取消时返回 cancelled=true。
// manualPath 非空时直接使用该路径（用于手输路径或自动化测试）。
func (s *LibraryService) AddFolder(manualPath string) (map[string]any, error) {
	path := strings.TrimSpace(manualPath)

	if path == "" {
		selected, err := s.pickDirectory()
		if err != nil {
			return nil, err
		}
		if selected == "" {
			return map[string]any{"cancelled": true}, nil
		}
		path = selected
	}

	clean, err := library.ValidateFolder(path)
	if err != nil {
		return nil, err
	}

	// 去重（同一目录不重复添加）
	for _, f := range s.lib.Folders() {
		if strings.EqualFold(f.Path, clean) {
			return map[string]any{"duplicated": true, "path": clean}, nil
		}
	}

	folder := bootstrap.Folder{
		ID:         bootstrap.StableID(clean, "folder"),
		Path:       clean,
		Status:     "ok",
		Watching:   s.store.Get().WatchFolders,
		AddedAt:    time.Now().UnixMilli(),
		TrackCount: 0,
	}
	if err := s.store.Update(func(c *bootstrap.Config) {
		c.Folders = append(c.Folders, folder)
	}); err != nil {
		return nil, err
	}

	// 让曲库立刻看到新文件夹（Manager 自己缓存了一份 folders 副本）
	s.lib.ReloadFolders()

	// 立刻生效：重新登记监听 + 走和「重新扫描」完全一致的扫描流程，
	// 这样前端收到的 scan:start / scan:progress / scan:done 事件顺序一致。
	s.refreshWatcher()
	s.emit("scan:start", map[string]any{"folderIds": []string{folder.ID}})
	go s.runScan(10 * time.Minute)

	return map[string]any{"folder": folder}, nil
}

// RemoveFolder 移除音乐文件夹（不动本地文件）
func (s *LibraryService) RemoveFolder(id string) error {
	var removed bool
	if err := s.store.Update(func(c *bootstrap.Config) {
		next := make([]bootstrap.Folder, 0, len(c.Folders))
		for _, f := range c.Folders {
			if f.ID == id {
				removed = true
				continue
			}
			next = append(next, f)
		}
		c.Folders = next
	}); err != nil {
		return err
	}
	if !removed {
		return fmt.Errorf("文件夹不存在: %s", id)
	}
	s.refreshWatcher()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	go func() {
		if _, err := s.lib.Scan(ctx, false); err != nil {
			s.emit("scan:failed", map[string]any{"message": err.Error()})
		}
	}()
	return nil
}

// SetWatchers 开/关文件夹实时监听
func (s *LibraryService) SetWatchers(enabled bool) error {
	if err := s.store.Update(func(c *bootstrap.Config) {
		c.WatchFolders = enabled
		for i := range c.Folders {
			c.Folders[i].Watching = enabled
		}
	}); err != nil {
		return err
	}
	s.refreshWatcher()
	return nil
}

// RevealInExplorer 在系统文件管理器中定位路径
func (s *LibraryService) RevealInExplorer(path string) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("路径为空")
	}
	target := path
	if st, err := os.Stat(target); err != nil || !st.IsDir() {
		target = filepath.Dir(path)
	}
	return revealPath(target)
}

// PickDirectory 单独暴露目录选择（设置界面「添加文件夹」用）
func (s *LibraryService) PickDirectory() (string, error) {
	return s.pickDirectory()
}

// Stats 曲库统计（关于页面用）
func (s *LibraryService) Stats() map[string]any {
	songs := s.lib.Songs()
	var totalMS int64
	var totalBytes int64
	for _, s := range songs {
		totalMS += s.Duration
		totalBytes += s.Size
	}
	return map[string]any{
		"count":      len(songs),
		"durationMs": totalMS,
		"bytes":      totalBytes,
		"folders":    len(s.lib.Folders()),
		"scanning":   s.lib.IsScanning(),
	}
}

// RefreshWatchers 供「设置」修改后手动刷新监听
func (s *LibraryService) RefreshWatchers() {
	s.refreshWatcher()
}

func (s *LibraryService) refreshWatcher() {
	if s.watch == nil {
		return
	}
	cfg := s.store.Get()
	roots := make([]string, 0, len(cfg.Folders))
	if cfg.WatchFolders {
		for _, f := range cfg.Folders {
			roots = append(roots, f.Path)
		}
	}
	s.watch.SetRoots(roots)
}

func (s *LibraryService) pickDirectory() (string, error) {
	if s.app == nil {
		return "", errors.New("当前环境不支持系统目录选择器")
	}
	selected, err := s.app.Dialog.OpenFile().
		SetTitle("选择音乐文件夹").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(true).
		PromptForSingleSelection()
	if err != nil {
		return "", fmt.Errorf("打开目录选择器失败: %w", err)
	}
	return selected, nil
}

func (s *LibraryService) emit(name string, payload any) {
	if s.app == nil {
		return
	}
	s.app.Event.Emit(name, payload)
}

// ---------------------------------------------------------------------------
// Playlist 服务：歌单、我喜欢、队列顺序持久化
// ---------------------------------------------------------------------------

// PlaylistService 歌单接口
type PlaylistService struct {
	store *bootstrap.Store
}

// NewPlaylistService 构造服务
func NewPlaylistService(store *bootstrap.Store) *PlaylistService {
	return &PlaylistService{store: store}
}

const likedPlaylistID = "liked"

// List 返回全部歌单（第一个固定是「我喜欢」）
func (s *PlaylistService) List() []bootstrap.Playlist {
	cfg := s.store.Get()

	liked := bootstrap.Playlist{
		ID:        likedPlaylistID,
		Name:      "我喜欢",
		Locked:    true,
		Builtin:   true,
		SongIDs:   append([]string(nil), cfg.LikedIDs...),
		CreatedAt: 0,
	}
	out := []bootstrap.Playlist{liked}
	for _, p := range cfg.Playlists {
		if p.ID == likedPlaylistID {
			continue
		}
		out = append(out, p)
	}
	return out
}

// Create 新建歌单
func (s *PlaylistService) Create(name string) (bootstrap.Playlist, error) {
	clean := strings.TrimSpace(name)
	if clean == "" {
		return bootstrap.Playlist{}, errors.New("歌单名称不能为空")
	}
	cfg := s.store.Get()
	for _, p := range cfg.Playlists {
		if strings.EqualFold(p.Name, clean) {
			return bootstrap.Playlist{}, fmt.Errorf("已存在同名歌单：%s", clean)
		}
	}
	pl := bootstrap.Playlist{
		ID:        bootstrap.RandomID("pl"),
		Name:      clean,
		Locked:    false,
		Builtin:   false,
		SongIDs:   []string{},
		CreatedAt: time.Now().UnixMilli(),
	}
	if err := s.store.Update(func(c *bootstrap.Config) {
		c.Playlists = append(c.Playlists, pl)
	}); err != nil {
		return bootstrap.Playlist{}, err
	}
	return pl, nil
}

// Rename 重命名歌单
func (s *PlaylistService) Rename(id, name string) error {
	if id == likedPlaylistID {
		return errors.New("「我喜欢」是默认歌单，不可重命名")
	}
	clean := strings.TrimSpace(name)
	if clean == "" {
		return errors.New("歌单名称不能为空")
	}
	found := false
	err := s.store.Update(func(c *bootstrap.Config) {
		for i := range c.Playlists {
			if c.Playlists[i].ID == id {
				c.Playlists[i].Name = clean
				found = true
			}
		}
	})
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("歌单不存在: %s", id)
	}
	return nil
}

// Delete 删除歌单（不动本地文件）；「我喜欢」不可删除
func (s *PlaylistService) Delete(id string) error {
	if id == likedPlaylistID {
		return errors.New("「我喜欢」是默认歌单，不可删除")
	}
	removed := false
	err := s.store.Update(func(c *bootstrap.Config) {
		next := make([]bootstrap.Playlist, 0, len(c.Playlists))
		for _, p := range c.Playlists {
			if p.ID == id {
				removed = true
				continue
			}
			next = append(next, p)
		}
		c.Playlists = next
	})
	if err != nil {
		return err
	}
	if !removed {
		return fmt.Errorf("歌单不存在: %s", id)
	}
	return nil
}

// AddSongs 批量加入歌单（去重）
func (s *PlaylistService) AddSongs(id string, songIDs []string) (int, error) {
	added := 0
	err := s.store.Update(func(c *bootstrap.Config) {
		if id == likedPlaylistID {
			before := len(c.LikedIDs)
			c.LikedIDs = appendUnique(c.LikedIDs, songIDs...)
			added = len(c.LikedIDs) - before
			return
		}
		for i := range c.Playlists {
			if c.Playlists[i].ID != id {
				continue
			}
			before := len(c.Playlists[i].SongIDs)
			c.Playlists[i].SongIDs = appendUnique(c.Playlists[i].SongIDs, songIDs...)
			added = len(c.Playlists[i].SongIDs) - before
		}
	})
	return added, err
}

// RemoveSongs 从歌单移除（「我喜欢」请用 Library.ToggleLike）
func (s *PlaylistService) RemoveSongs(id string, songIDs []string) (int, error) {
	if id == likedPlaylistID {
		return 0, errors.New("请用爱心按钮取消喜欢")
	}
	removed := 0
	drop := map[string]bool{}
	for _, sid := range songIDs {
		drop[sid] = true
	}
	err := s.store.Update(func(c *bootstrap.Config) {
		for i := range c.Playlists {
			if c.Playlists[i].ID != id {
				continue
			}
			before := len(c.Playlists[i].SongIDs)
			next := make([]string, 0, before)
			for _, sid := range c.Playlists[i].SongIDs {
				if drop[sid] {
					continue
				}
				next = append(next, sid)
			}
			c.Playlists[i].SongIDs = next
			removed = before - len(next)
		}
	})
	return removed, err
}

// Reorder 调整歌单内歌曲顺序（前端拖拽排序后调用，用于持久化）
func (s *PlaylistService) Reorder(id string, from, to int) error {
	return s.store.Update(func(c *bootstrap.Config) {
		for i := range c.Playlists {
			if c.Playlists[i].ID != id {
				continue
			}
			c.Playlists[i].SongIDs = moveIndex(c.Playlists[i].SongIDs, from, to)
		}
	})
}

// ReorderPlaylists 调整侧边栏歌单顺序
func (s *PlaylistService) ReorderPlaylists(from, to int) error {
	return s.store.Update(func(c *bootstrap.Config) {
		c.Playlists = moveIndex(c.Playlists, from, to)
	})
}

// Export 导出 m3u 到歌单所在目录（返回写入的文件路径）
func (s *PlaylistService) Export(id string) (string, error) {
	cfg := s.store.Get()

	var name string
	var ids []string
	if id == likedPlaylistID {
		name = "我喜欢"
		ids = cfg.LikedIDs
	} else {
		for _, p := range cfg.Playlists {
			if p.ID == id {
				name = p.Name
				ids = p.SongIDs
			}
		}
	}
	if name == "" {
		return "", fmt.Errorf("歌单不存在: %s", id)
	}

	// 通过 library 查路径：这里注入一个只读回调更省事，因此直接读配置里的歌曲缓存文件
	songs := readSongCache(s.store.DataDir())

	var b strings.Builder
	b.WriteString("#EXTM3U\n")
	for _, sid := range ids {
		if path, ok := songs[sid]; ok {
			fmt.Fprintf(&b, "#EXTINF:-1,%s\n%s\n", filepath.Base(path), path)
		}
	}

	out := filepath.Join(s.store.DataDir(), sanitizeFileName(name)+".m3u")
	if err := os.WriteFile(out, []byte(b.String()), 0o644); err != nil {
		return "", fmt.Errorf("写入 m3u 失败: %w", err)
	}
	return out, nil
}

/* --------------------------------------------------------------------------
   Lyrics 服务
   --------------------------------------------------------------------------
   读取链（与设置里的「歌词来源优先级」一致）：
     内嵌歌词 → 同目录同名 .lrc → 歌词缓存 → 在线自动匹配

   写回的两种情形：
     · 用户手动匹配（前端搜索候选 → 应用）→ Save()
     · 播放时自动匹配成功 → AutoMatch() 内部顺手写缓存
   两者都会按设置里的「把封面/歌词写进歌曲文件」决定是否同时嵌入音频文件。
   没有缓存这一层是实测的 bug：手动匹配的歌词只存在前端内存里，
   关掉应用再打开就没了。
   -------------------------------------------------------------------------- */

// LyricsService 歌词接口
type LyricsService struct {
	store *bootstrap.Store
	songs func(id string) (bootstrap.Song, bool)
	// cache 歌词缓存（可空：为空时跳过缓存层）
	cache *metacache.Store
	// online 在线歌词聚合器（可空：为空时不做在线自动匹配）
	online LyricsMatcher
	// ai 元数据清洗（可选）
	ai *AiService
}

// LyricsMatcher 在线歌词匹配的最小接口。
//
// 用接口而不是直接依赖 lyricsfetch.Aggregator：测试里可以塞一个假的，
// 而且「在线歌词」这件事将来换实现（换源、加缓存）不会牵动本服务。
type LyricsMatcher interface {
	Match(ctx context.Context, title, artist string, durationMS int64) (lrc, provider, matchedTitle, matchedArtist string, err error)
}

// NewLyricsService 构造服务
func NewLyricsService(store *bootstrap.Store, songs func(id string) (bootstrap.Song, bool)) *LyricsService {
	return &LyricsService{store: store, songs: songs}
}

// setCache 注入歌词缓存（main 里装配）。
func (s *LyricsService) setCache(cache *metacache.Store) { s.cache = cache }

// setOnline 注入在线歌词匹配器（main 里装配）。
func (s *LyricsService) setOnline(m LyricsMatcher) { s.online = m }

// setAI 注入元数据清洗服务（可选）。
func (s *LyricsService) setAI(ai *AiService) { s.ai = ai }

// cachedLyrics 返回「按 id 读缓存」的闭包，供 internal/lyrics 使用。
func (s *LyricsService) cachedLyrics(songID string) lyrics.Cache {
	if s.cache == nil {
		return nil
	}
	return func(id string) (string, bool) { return s.cache.Lyrics(id) }
}

// Load 按设置里的优先级加载歌词（**只读本地**，不联网）。
//
// 之所以不在这里联网：本方法在「每次切歌」时都会被调用，联网等待会把
// 播放界面卡住十几秒。在线自动匹配走 AutoMatch，由前端在本地读不到时再触发。
//
// 在线试听曲目（不在本地曲库里）也走这里：它们没有本地文件，但可能有缓存
// （用户手动匹配过），所以查不到歌曲时不去报错，而是继续读缓存。
func (s *LyricsService) Load(songID string) (lyrics.Result, error) {
	song, ok := s.songs(songID)
	if !ok {
		// 不是本地歌曲：只可能命中缓存
		if text, hit := s.cacheGet(songID); hit {
			return lyrics.Result{LRC: text, Source: lyrics.SourceCache}, nil
		}
		return lyrics.Result{LRC: "", Source: lyrics.SourceNone}, nil
	}
	return lyrics.Load(songID, song.Path, s.store.Get().LyricsSources, s.cachedLyrics(songID)), nil
}

// AutoMatch 本地读不到歌词时，联网自动匹配一次，并把结果写进缓存。
//
// 返回的 Result.Source 形如 online:lrclib；没匹配到返回 source=none 而不是错误
// （「这首歌没有歌词」是正常结果，不该让前端弹错误）。
func (s *LyricsService) AutoMatch(songID string) (lyrics.Result, error) {
	song, ok := s.songs(songID)
	if !ok {
		return lyrics.Result{LRC: "", Source: lyrics.SourceNone}, nil
	}
	if !lyrics.WantOnline(s.store.Get().LyricsSources) {
		return lyrics.Result{LRC: "", Source: lyrics.SourceNone}, nil
	}
	if s.online == nil {
		return lyrics.Result{LRC: "", Source: lyrics.SourceNone}, nil
	}

	title, artist := s.cleanMetaFor(song)
	if strings.TrimSpace(title) == "" {
		return lyrics.Result{LRC: "", Source: lyrics.SourceNone}, nil
	}
	// 文件名当标题的「无标签文件」（Track 07 / 01 / unknown…）匹配在线歌词
	// 只会撞上别人的歌词 —— 错的歌词比没有歌词更糟，直接不搜。
	if isPlaceholderTitle(title) && strings.TrimSpace(artist) == "" {
		return lyrics.Result{LRC: "", Source: lyrics.SourceNone}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	lrc, provider, matchedTitle, matchedArtist, err := s.online.Match(ctx, title, artist, song.Duration)
	if err != nil || strings.TrimSpace(lrc) == "" {
		return lyrics.Result{LRC: "", Source: lyrics.SourceNone}, nil
	}

	// 有的来源会给「字级」歌词（逐字时间戳 / QRC / KRC）。本程序只认行级，
	// 而且这份文本之后可能被写进歌曲文件，所以在落缓存之前先归一化一次。
	lrc = lyrics.NormalizeLineLevel(lrc)
	if strings.TrimSpace(lrc) == "" {
		return lyrics.Result{LRC: "", Source: lyrics.SourceNone}, nil
	}

	// 匹配到就落缓存：下一次打开（甚至离线）也还在，这是「第二次打开又没有了」的修法。
	// 写缓存失败不影响本次显示，所以忽略错误只记日志。
	s.saveToCache(songID, lrc, "online:"+provider)

	src := lyrics.SourceOnline
	if provider != "" {
		src = "online:" + provider
	}
	return lyrics.Result{LRC: lrc, Source: src, Title: matchedTitle, Artist: matchedArtist}, nil
}

// Save 保存用户手动匹配到的歌词：写缓存，并按设置决定是否嵌入音频文件。
//
// embed 是显式传入的（nil = 按配置走）：前端配置是防抖同步的，
// 「刚开开关就应用歌词」时后端读到的可能还是旧值。
func (s *LyricsService) Save(songID, lrc, source string, embed *bool) (map[string]any, error) {
	raw := strings.TrimSpace(lrc)
	if raw == "" {
		return nil, errors.New("歌词内容为空")
	}
	if strings.TrimSpace(source) == "" {
		source = "user"
	}
	if s.cache == nil {
		return nil, errors.New("歌词缓存不可用")
	}

	// 用户点「应用」时把字级歌词筛成行级：本程序只支持行级高亮，
	// 而且下一步可能把它内嵌进歌曲文件 —— 逐字标记进了文件就会变成
	// 别的播放器里的「正文」，所以必须在写入之前处理。
	wasWordLevel := lyrics.HasWordTiming(raw)
	lrc = lyrics.NormalizeLineLevel(raw)
	if strings.TrimSpace(lrc) == "" {
		return nil, errors.New("歌词内容为空")
	}

	if _, err := s.cache.SaveLyrics(songID, lrc, source); err != nil {
		return nil, err
	}

	out := map[string]any{
		"ok":        true,
		"cached":    true,
		"source":    source,
		"embedded":  false,
		"lrc":       lrc,
		"lineLevel": !wasWordLevel,
		"converted": wasWordLevel,
	}
	song, ok := s.songs(songID)
	if !ok {
		// 在线试听曲目：没有本地文件可写，缓存就是全部
		out["note"] = "已缓存歌词（在线曲目没有本地文件，不写嵌入）"
		return out, nil
	}

	embedEnabled := s.store.Get().EmbedMeta
	if embed != nil {
		embedEnabled = *embed
	}
	if !embedEnabled {
		out["note"] = "已缓存歌词"
		return out, nil
	}
	if !metacache.SupportedEmbed(song.Ext) {
		out["note"] = "歌词已缓存；该格式暂不支持写入文件"
		return out, nil
	}
	res, err := metacache.EmbedLyrics(song.Path, lrc)
	switch {
	case err == nil && res.OK:
		out["embedded"] = true
		out["note"] = "已写入歌曲文件：" + res.Message
	case errors.Is(err, metacache.ErrUnsupported):
		out["note"] = "歌词已缓存；该格式暂不支持写入文件"
	default:
		out["note"] = "歌词已缓存，但写入文件失败：" + errText(err)
	}
	return out, nil
}

// LoadCached 只读缓存（前端在「本地 + 在线」都拿不到时用它确认一次）。
func (s *LyricsService) LoadCached(songID string) map[string]any {
	if text, ok := s.cacheGet(songID); ok {
		return map[string]any{"lrc": text, "source": lyrics.SourceCache, "cached": true}
	}
	return map[string]any{"lrc": "", "source": lyrics.SourceNone, "cached": false}
}

func (s *LyricsService) saveToCache(songID, text, source string) {
	if s.cache == nil {
		return
	}
	if _, err := s.cache.SaveLyrics(songID, text, source); err != nil {
		log.Printf("[lyrics] 写入缓存失败 %s: %v", songID, err)
	}
}

func (s *LyricsService) cacheGet(songID string) (string, bool) {
	if s.cache == nil {
		return "", false
	}
	return s.cache.Lyrics(songID)
}

// cleanMetaFor 准备「拿去联网匹配」的标题与歌手。
//
// 顺序：本地整形（不联网、不等 AI）→ 仍然脏才花一次 AI 请求 → 再整形一次。
//
// 为什么本地整形必须在最前面：文件名兜底的标题里混着歌词与编号
// （例：《此去半生》-吴昊 “花开又花谢花漫天…”），这种标题发出去
// 既搜不到东西、又会让打分把所有候选打成 0 分，最后被判成「没有歌词」。
// 本地整形能把这类标题还原成「此去半生 / 吴昊」，且完全不需要等网络。
// aiEnabled 判断「自动匹配歌词时用 AI 清洗元数据」是否开启。
//
// 开关（config.aiLyricsClean）是用户可见的行为：关掉后歌词匹配只走
// 本地整形（sanitizeLyricsMeta），不再等待 8~18 秒的 AI 请求。
func (s *LyricsService) aiEnabled() bool {
	if s.ai == nil || !s.ai.Enabled() {
		return false
	}
	if s.store != nil && !s.store.Get().AILyricsClean {
		return false
	}
	return true
}

func (s *LyricsService) cleanMetaFor(song bootstrap.Song) (string, string) {
	title, artist := sanitizeLyricsMeta(song.Title, song.Artist)
	if s.aiEnabled() && needsCleanMeta(title, artist) {
		if cleaned, err := s.ai.ExtractMeta(title, artist, song.Album, filepath.Base(song.Path)); err == nil {
			title, artist, _ = mergeCleanMeta(title, artist, "", cleaned)
		}
	}
	title, artist = sanitizeLyricsMeta(title, artist)
	return title, artist
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// ---------------------------------------------------------------------------
// Themes 服务
// ---------------------------------------------------------------------------

// ThemeService 主题接口
type ThemeService struct {
	mgr *theme.Manager
	// app 用于「导入主题」时弹系统目录选择器（main 里装配，测试时可空）。
	app *application.App
}

// NewThemeService 构造服务
func NewThemeService(mgr *theme.Manager) *ThemeService {
	return &ThemeService{mgr: mgr}
}

// List 主题列表
func (s *ThemeService) List() []theme.Info {
	return s.mgr.List()
}

// Load 主题 CSS 原文
func (s *ThemeService) Load(id string) (string, error) {
	return s.mgr.CSS(id)
}

// Reload 重新扫描主题目录（用户在外部新增文件后调用）
func (s *ThemeService) Reload() ([]theme.Info, error) {
	if err := s.mgr.Reload(); err != nil {
		return nil, err
	}
	return s.mgr.List(), nil
}

// Dir 主题目录路径
func (s *ThemeService) Dir() string { return s.mgr.Dir() }

// RevealDir 在资源管理器中打开主题目录
func (s *ThemeService) RevealDir() error { return revealPath(s.mgr.Dir()) }

// Delete 删除一个主题（只删主题目录里的那个 CSS 文件，不碰其它任何东西）。
//
// 内置主题不能删（每次启动都会重新生成），由 internal/theme 给出可读原因。
// 删完 manager 会自己重扫，前端拿到的是磁盘的最新状态。
func (s *ThemeService) Delete(id string) error {
	if s == nil || s.mgr == nil {
		return errors.New("主题服务未就绪")
	}
	return s.mgr.Delete(id)
}

// Import 弹出系统目录选择器，把选中的文件夹里的主题 CSS 导入主题目录。
//
// 返回 { cancelled, imported: []string, skipped: []string }：
// 用户取消时只有 cancelled=true；校验不通过时返回错误（前端弹错误提示），
// 部分文件不合格时 imported/skipped 会同时有值，让前端能如实汇报。
func (s *ThemeService) Import() (map[string]any, error) {
	if s == nil || s.mgr == nil {
		return nil, errors.New("主题服务未就绪")
	}
	if s.app == nil {
		return nil, errors.New("当前环境不支持系统目录选择器")
	}
	selected, err := s.app.Dialog.OpenFile().
		SetTitle("选择要导入的主题文件夹").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(false).
		PromptForSingleSelection()
	if err != nil {
		return nil, fmt.Errorf("打开目录选择器失败: %w", err)
	}
	if strings.TrimSpace(selected) == "" {
		return map[string]any{"cancelled": true}, nil
	}
	res, err := s.mgr.ImportDir(selected)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"cancelled": false,
		"imported":  res.Imported,
		"skipped":   res.Skipped,
	}, nil
}

// ---------------------------------------------------------------------------
// Config 服务
// ---------------------------------------------------------------------------

// ConfigService 配置接口
type ConfigService struct {
	store *bootstrap.Store
}

// NewConfigService 构造服务
func NewConfigService(store *bootstrap.Store) *ConfigService {
	return &ConfigService{store: store}
}

// Get 读取当前配置
func (s *ConfigService) Get() bootstrap.Config {
	return s.store.Get()
}

// Set 增量写入配置（只覆盖传入的键）
func (s *ConfigService) Set(patch map[string]any) (bootstrap.Config, error) {
	err := s.store.Update(func(c *bootstrap.Config) {
		applyPatch(c, patch)
	})
	if err != nil {
		return bootstrap.Config{}, err
	}
	return s.store.Get(), nil
}

// Path 配置文件路径
func (s *ConfigService) Path() string { return s.store.Path() }

// Reset 恢复默认配置（保留文件夹列表）
func (s *ConfigService) Reset() (bootstrap.Config, error) {
	def := bootstrap.DefaultConfig()
	err := s.store.Update(func(c *bootstrap.Config) {
		folders := c.Folders
		*c = *def
		c.Folders = folders
		c.DataDir = def.DataDir
		c.ConfigPath = def.ConfigPath
	})
	if err != nil {
		return bootstrap.Config{}, err
	}
	return s.store.Get(), nil
}

// ---------------------------------------------------------------------------
// Media 服务
// ---------------------------------------------------------------------------

// MediaService 音频播放地址
type MediaService struct {
	srv   *media.Server
	songs func(id string) (bootstrap.Song, bool)
}

// NewMediaService 构造服务
func NewMediaService(srv *media.Server, songs func(id string) (bootstrap.Song, bool)) *MediaService {
	return &MediaService{srv: srv, songs: songs}
}

// URL 返回某首歌的播放地址。
//
// 返回的是**页面同源**的相对路径（/audio/xxx?t=...），由 Wails 的 asset server
// 提供。原因：WebView2 会拒绝从 http://wails.localhost 页面加载
// http://127.0.0.1:port 的媒体（"Media load rejected by URL safety check"），
// 跨源音频在这个环境下根本发不出请求。
func (s *MediaService) URL(songID string) (string, error) {
	song, ok := s.songs(songID)
	if !ok {
		return "", fmt.Errorf("歌曲不存在: %s", songID)
	}
	if !bootstrap.NeedsTranscode(song.Ext) || s.srv.CanTranscode() {
		return s.srv.SameOriginURL(songID), nil
	}
	return "", fmt.Errorf("格式 .%s 需要 ffmpeg 转码，请先安装 ffmpeg", song.Ext)
}

// State 返回播放服务状态（前端据此提示「需安装 ffmpeg」）
func (s *MediaService) State() map[string]any {
	return map[string]any{
		"baseUrl":      "",
		"sameOrigin":   true,
		"canTranscode": s.srv.CanTranscode(),
		"tools":        s.srv.ToolsInfo(),
	}
}

// ClearTranscodeCache 清空转码缓存（不能原生播放的格式转出的 WAV）
func (s *MediaService) ClearTranscodeCache() (map[string]any, error) {
	if err := s.srv.ClearCache(); err != nil {
		return nil, err
	}
	count, bytes := s.srv.CacheStats()
	return map[string]any{"count": count, "bytes": bytes}, nil
}

// CacheStats 转码缓存占用
func (s *MediaService) CacheStats() map[string]any {
	count, bytes := s.srv.CacheStats()
	return map[string]any{"count": count, "bytes": bytes}
}

// ---------------------------------------------------------------------------
// Loudness 服务（响度均衡：EBU R128 测量 + 回放增益补偿）
// ---------------------------------------------------------------------------

// LoudnessService 响度测量与补偿
type LoudnessService struct {
	mgr *loudness.Manager
	lib *library.Manager
	app *application.App

	mu        sync.Mutex
	cancel    context.CancelFunc
	measuring bool
	// lastTarget 记住最近一次用到的目标响度，供 State() 在没有入参时判断
	// 「已测量」到底是多少首（缓存有效性与目标响度绑定）。
	lastTarget float64
}

// NewLoudnessService 构造服务
func NewLoudnessService(mgr *loudness.Manager, lib *library.Manager) *LoudnessService {
	return &LoudnessService{mgr: mgr, lib: lib, lastTarget: defaultTarget}
}

// defaultTarget 前端没给目标值时的兜底（与前端 DEFAULT_CONFIG 保持一致）
const defaultTarget = -16.0

// normTarget 归一化目标响度，并记住它
func (s *LoudnessService) normTarget(t float64) float64 {
	if t == 0 {
		t = defaultTarget
	}
	s.mu.Lock()
	s.lastTarget = t
	s.mu.Unlock()
	return t
}

func (s *LoudnessService) currentTarget() float64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.lastTarget == 0 {
		return defaultTarget
	}
	return s.lastTarget
}

// State 返回响度测量能力与进度概况
func (s *LoudnessService) State() map[string]any {
	t := s.mgr.Tools()
	songs := s.lib.Songs()
	target := s.currentTarget()
	// 注意：「已测量」必须按当前标准统计 —— 用户换了补偿标准后
	// 旧缓存全部失效，这里要立刻反映出来，否则界面会撒谎。
	valid := s.mgr.CountValid(songs, target)
	return map[string]any{
		"available": s.mgr.Available(),
		"source":    t.Source,
		"describe":  t.Describe(),
		"path":      t.FFmpeg,
		"measured":  valid,
		"cached":    s.mgr.Count(),
		"missing":   len(songs) - valid,
		"total":     len(songs),
		"target":    target,
		"algo":      loudness.AlgoVersion,
		"measuring": s.isMeasuring(),
		"cachePath": s.mgr.CachePath(),
		"onDemand":  true,
	}
}

// Get 取一首歌的测量结果与补偿增益（当前标准下未测量则 measured=false）
func (s *LoudnessService) Get(songID string, targetLUFS float64) (map[string]any, error) {
	song, ok := s.lib.SongByID(songID)
	if !ok {
		return nil, fmt.Errorf("歌曲不存在: %s", songID)
	}
	target := s.normTarget(targetLUFS)

	item, ok := s.mgr.Get(song, target)
	if !ok {
		return map[string]any{"measured": false, "target": target}, nil
	}
	return map[string]any{
		"measured":   true,
		"integrated": item.Integrated,
		"truePeak":   item.TruePeak,
		"lra":        item.LRA,
		"gainDB":     loudness.GainDB(item, target),
		"target":     target,
	}, nil
}

// Measure 测量单首歌 —— 这是常规路径：用户播到哪首就测哪首，不预先全库扫描。
// 前端在开始播放时调用，测完立刻套用补偿。
func (s *LoudnessService) Measure(songID string, targetLUFS float64) (map[string]any, error) {
	song, ok := s.lib.SongByID(songID)
	if !ok {
		return nil, fmt.Errorf("歌曲不存在: %s", songID)
	}
	target := s.normTarget(targetLUFS)
	if !s.mgr.Available() {
		return nil, fmt.Errorf("ffmpeg 不可用，无法测量响度")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	item, err := s.mgr.Measure(ctx, song, target)
	if err != nil {
		return nil, err
	}
	// 单曲测量也要落盘，下次播放直接命中缓存
	_ = s.mgr.Save()
	return map[string]any{
		"measured":   true,
		"integrated": item.Integrated,
		"truePeak":   item.TruePeak,
		"lra":        item.LRA,
		"gainDB":     loudness.GainDB(item, target),
		"target":     target,
	}, nil
}

// InvalidateTarget 让不等于给定标准的缓存全部失效。
// 设置界面改了目标响度/算法后调用：清掉旧补偿，之后播放时按需重算。
func (s *LoudnessService) InvalidateTarget(targetLUFS float64) map[string]any {
	target := s.normTarget(targetLUFS)
	dropped := s.mgr.InvalidateTarget(target)
	if dropped > 0 {
		_ = s.mgr.Save()
	}
	return map[string]any{
		"dropped": dropped,
		"target":  target,
		"state":   s.State(),
	}
}

// MeasureAll 后台批量预热整个曲库（可选，正常使用不需要）。
// 异步执行，进度通过 loudness:progress 事件推送。
func (s *LoudnessService) MeasureAll(targetLUFS float64) map[string]any {
	target := s.normTarget(targetLUFS)
	if !s.mgr.Available() {
		return map[string]any{"started": false, "reason": "ffmpeg 不可用"}
	}
	s.mu.Lock()
	if s.measuring {
		s.mu.Unlock()
		return map[string]any{"started": false, "reason": "already-measuring"}
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.measuring = true
	s.mu.Unlock()

	songs := s.lib.Songs()
	go func() {
		defer func() {
			s.mu.Lock()
			s.measuring = false
			s.cancel = nil
			s.mu.Unlock()
			_ = s.mgr.Save()
		}()

		done, failed, err := s.mgr.MeasureAll(ctx, songs, target, func(p loudness.Progress) {
			s.emit("loudness:progress", map[string]any{
				"done": p.Done, "total": p.Total,
				"failed": p.Failed, "current": p.Current, "finished": p.Finished,
			})
		})
		payload := map[string]any{"done": done, "failed": failed, "total": len(songs)}
		if err != nil && !errors.Is(err, context.Canceled) {
			payload["message"] = err.Error()
			s.emit("loudness:failed", payload)
			return
		}
		s.emit("loudness:done", payload)
	}()

	return map[string]any{"started": true, "total": len(songs)}
}

// Cancel 中止批量测量
func (s *LoudnessService) Cancel() {
	s.mu.Lock()
	cancel := s.cancel
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

// Clear 清空测量缓存
func (s *LoudnessService) Clear() error {
	return s.mgr.Clear()
}

// GainMap 返回「songId → 补偿增益 dB」映射，供前端批量套用。
//
// 只包含当前标准下**有效**的缓存；没测过的歌不在其中，
// 前端播到那首时会走 Measure 按需补算。
func (s *LoudnessService) GainMap(targetLUFS float64) map[string]float64 {
	target := s.normTarget(targetLUFS)
	out := map[string]float64{}
	for _, song := range s.lib.Songs() {
		if g, ok := s.mgr.GainFor(song, target); ok {
			out[song.ID] = g
		}
	}
	return out
}

// AlbumGains 返回按专辑聚合的补偿增益（「整张专辑统一」模式）
func (s *LoudnessService) AlbumGains(targetLUFS float64) map[string]float64 {
	target := s.normTarget(targetLUFS)
	// 按专辑分组
	groups := map[string][]bootstrap.Song{}
	for _, song := range s.lib.Songs() {
		album := strings.TrimSpace(song.Album)
		if album == "" || album == "未知专辑" {
			album = "__unknown__"
		}
		groups[album] = append(groups[album], song)
	}

	out := map[string]float64{}
	for name, songs := range groups {
		s.mgr.UpdateAlbum(name, songs, target)
		if g, ok := s.mgr.AlbumGainDB(name, target); ok {
			for _, song := range songs {
				out[song.ID] = g
			}
		}
	}
	_ = s.mgr.Save()
	return out
}

// RefreshTools 重新探测 ffmpeg（设置界面点「重新检测」时用）
func (s *LoudnessService) RefreshTools() map[string]any {
	s.mgr.RefreshTools()
	return s.State()
}

func (s *LoudnessService) isMeasuring() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.measuring
}

func (s *LoudnessService) emit(name string, payload any) {
	if s.app == nil {
		return
	}
	s.app.Event.Emit(name, payload)
}

// ---------------------------------------------------------------------------
// Window 服务（自绘标题栏用）
// ---------------------------------------------------------------------------

// WindowService 窗口控制
type WindowService struct {
	app   *application.App
	store *bootstrap.Store

	// activeBackdrop 创建窗口时实际生效的原生材质（由 main 注入）。
	// 配置里的值只能等下次创建窗口时才起作用，两者不一致就是「待重启」。
	activeBackdrop string

	// —— 桌面歌词（独立透明窗口，见 desktop_lyrics.go）——
	desktopMu       sync.Mutex
	desktopOn       bool
	desktopText     string
	desktopPlaying  bool
	desktopFontSize int
	// desktopTouched 记录「用户/前端是否已经自己操作过桌面歌词开关」。
	//
	// 启动恢复（early_theme.go#restoreDesktopLyricsOnStartup）在超时兜底那条
	// 路径上会晚 20 秒才动手。如果这期间用户已经手动关掉了歌词窗口，恢复逻辑
	// 不能再把它打开 —— 那个「我刚关掉它又自己冒出来」比不出现还烦人。
	desktopTouched bool

	// —— 桌面背景歌词（垫在桌面图标之下的壁纸层，见 desktop_wallpaper.go）——
	//
	// 与上面那组是**同一组单选按钮的两个选项**，所以两边的开关状态各自独立、
	// 但任意时刻至多只有一个是开的。互斥由 setDesktopMode 单点保证。
	wallpaperMu      sync.Mutex
	wallpaperOn      bool
	wallpaperTouched bool
	// wallpaper 是合并后的**全量状态**（键值都由前端按皮肤契约决定，
	// 后端不认识其中任何一项，见 desktop_wallpaper.go 的类型注释）。
	wallpaper map[string]any
	// wallpaperProbed 记录「平台能力是不是已经探测过」。
	// 探测要枚举桌面窗口，没必要每次换行（每几秒一次）都做。
	wallpaperProbed    bool
	wallpaperSupported bool
	wallpaperReason    string
}

// NewWindowService 构造服务（app 由 main 在创建应用后注入）
func NewWindowService(store *bootstrap.Store) *WindowService {
	return &WindowService{store: store, activeBackdrop: "off"}
}

// current 返回主窗口。
//
// 不能直接用 app.Window.Current()：那是「当前获得焦点的窗口」，
// 桌面歌词窗口一旦被拖动/点击就会变成 current，于是最小化、最大化、
// 关闭、全屏这些按钮会作用到歌词窗口上。这里固定按名字取主窗口。
func (s *WindowService) current() *application.WebviewWindow {
	if s.app == nil {
		return nil
	}
	if w, ok := s.app.Window.GetByName("main"); ok {
		if ww, ok := w.(*application.WebviewWindow); ok {
			return ww
		}
	}
	if w, ok := s.app.Window.Current().(*application.WebviewWindow); ok {
		return w
	}
	return nil
}

// Minimize 最小化
func (s *WindowService) Minimize() {
	if w := s.current(); w != nil {
		w.Minimise()
	}
}

// ToggleMaximize 最大化 / 还原
func (s *WindowService) ToggleMaximize() {
	w := s.current()
	if w == nil {
		return
	}
	if w.IsMaximised() {
		w.UnMaximise()
		return
	}
	w.Maximise()
}

// Close 关闭窗口
func (s *WindowService) Close() {
	if w := s.current(); w != nil {
		w.Close()
	}
}

// SetFullscreen 全屏开关
func (s *WindowService) SetFullscreen(on bool) {
	w := s.current()
	if w == nil {
		return
	}
	if on {
		w.Fullscreen()
		return
	}
	w.UnFullscreen()
}

// ToggleFullscreen 全屏切换
func (s *WindowService) ToggleFullscreen() {
	if w := s.current(); w != nil {
		w.ToggleFullscreen()
	}
}

// IsFullscreen 当前是否全屏
func (s *WindowService) IsFullscreen() bool {
	if w := s.current(); w != nil {
		return w.IsFullscreen()
	}
	return false
}

// IsMaximized 当前是否最大化
func (s *WindowService) IsMaximized() bool {
	if w := s.current(); w != nil {
		return w.IsMaximised()
	}
	return false
}

// Backdrop 返回窗口原生材质（Mica / Acrylic…）的状态。
//
// 材质只能在创建窗口时指定，所以这里同时给出「配置里的值」和「窗口当前
// 真正生效的值」，前端据此提示用户是否需要重启。
func (s *WindowService) Backdrop() map[string]any {
	configured := "off"
	if s.store != nil {
		configured = bootstrap.NormalizeBackdropMode(s.store.Get().NativeBackdrop)
	}
	active := s.activeBackdrop
	if active == "" {
		active = "off"
	}
	supported, osLabel := backdropOSInfo()
	return map[string]any{
		"configured":      configured,
		"active":          active,
		"supported":       supported,
		"os":              osLabel,
		"restartRequired": configured != active,
		"modes":           bootstrap.BackdropModes,
	}
}

// Restart 重启应用：先拉起一个新的自己，再退出当前进程。
//
// 原生材质这类「只能在创建窗口时指定」的选项靠它生效。启动失败时不会退出，
// 把错误交回前端提示，免得用户点了重启反而把应用关掉。
func (s *WindowService) Restart() error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("定位可执行文件失败: %w", err)
	}

	// 先把元数据缓存落盘，避免旧进程退出时的回写和新实例的启动扫描打架
	if state != nil && state.lib != nil {
		if err := state.lib.SaveCache(); err != nil {
			log.Printf("重启前保存元数据缓存失败: %v", err)
		}
	}

	cmd := executil.Command(exe, os.Args[1:]...)
	cmd.Dir = filepath.Dir(exe)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动新实例失败: %w", err)
	}

	if s.app != nil {
		s.app.Quit()
	}
	return nil
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

func appendUnique(base []string, items ...string) []string {
	seen := make(map[string]bool, len(base)+len(items))
	for _, b := range base {
		seen[b] = true
	}
	for _, it := range items {
		if it == "" || seen[it] {
			continue
		}
		seen[it] = true
		base = append(base, it)
	}
	return base
}

func moveIndex[T any](list []T, from, to int) []T {
	if from < 0 || from >= len(list) {
		return list
	}
	if to < 0 {
		to = 0
	}
	if to > len(list) {
		to = len(list)
	}
	out := make([]T, len(list))
	copy(out, list)
	item := out[from]
	rest := append(out[:from:from], out[from+1:]...)
	if to > len(rest) {
		to = len(rest)
	}
	res := make([]T, 0, len(list))
	res = append(res, rest[:to]...)
	res = append(res, item)
	res = append(res, rest[to:]...)
	return res
}

func sanitizeFileName(name string) string {
	replacer := strings.NewReplacer("\\", "_", "/", "_", ":", "_", "*", "_", "?", "_", "\"", "_", "<", "_", ">", "_", "|", "_")
	return replacer.Replace(strings.TrimSpace(name))
}

func revealPath(path string) error {
	// 用 executil.CommandVisible 而不是 Command：Windows 上 explorer 是 GUI
	// 程序，带 SW_HIDE / CREATE_NO_WINDOW 启动时它新建的文件夹窗口也会是隐藏的
	// （用户看到「提示成功但没反应」）。ffmpeg 这类控制台程序才需要隐藏窗口。
	switch runtime.GOOS {
	case "windows":
		return executil.CommandVisible("explorer", path).Start()
	case "darwin":
		return executil.CommandVisible("open", path).Start()
	default:
		return executil.CommandVisible("xdg-open", path).Start()
	}
}

// applyPatch 把前端传来的 map 写进配置（只处理已知键）
func applyPatch(c *bootstrap.Config, patch map[string]any) {
	for key, raw := range patch {
		switch key {
		case "theme":
			c.Theme = asString(raw, c.Theme)
		case "themeMode":
			c.ThemeMode = asString(raw, c.ThemeMode)
		case "glassBlur":
			c.GlassBlur = asInt(raw, c.GlassBlur)
		case "glassAlpha":
			c.GlassAlpha = asInt(raw, c.GlassAlpha)
		case "nativeBackdrop":
			c.NativeBackdrop = bootstrap.NormalizeBackdropMode(asString(raw, c.NativeBackdrop))
		case "animations":
			c.Animations = asBool(raw, c.Animations)
		case "animationsSpeed":
			c.AnimationsSpeed = bootstrap.NormalizeAnimationsSpeed(asString(raw, c.AnimationsSpeed))
		case "accentFromCover":
			c.AccentFromCover = asBool(raw, c.AccentFromCover)
		case "coverSeed":
			// 封面取色的结果（前端算好之后写回）：只接受 #rgb / #rrggbb，
			// 其它内容一律忽略 —— 这个值会被 early_theme.go 直接拼进 CSS。
			c.CoverSeed = sanitizeSeedColor(asString(raw, c.CoverSeed))
		case "coverSeed2":
			c.CoverSeed2 = sanitizeSeedColor(asString(raw, c.CoverSeed2))
		case "showAlbumColumn":
			c.ShowAlbumColumn = asBool(raw, c.ShowAlbumColumn)
		case "showLyrics":
			c.ShowLyrics = asBool(raw, c.ShowLyrics)
		case "playMode":
			c.PlayMode = asString(raw, c.PlayMode)
		case "volume":
			c.Volume = asFloat(raw, c.Volume)
		case "muted":
			c.Muted = asBool(raw, c.Muted)
		case "playerViewMode":
			c.PlayerViewMode = asString(raw, c.PlayerViewMode)
		case "autoScanOnStart":
			c.AutoScanOnStart = asBool(raw, c.AutoScanOnStart)
		case "watchFolders":
			prev := c.WatchFolders
			c.WatchFolders = asBool(raw, c.WatchFolders)
			if prev != c.WatchFolders {
				for i := range c.Folders {
					c.Folders[i].Watching = c.WatchFolders
				}
			}
		case "scanConcurrency":
			c.ScanConcurrency = asInt(raw, c.ScanConcurrency)
		case "lyricsFontSize":
			c.LyricsFontSize = asInt(raw, c.LyricsFontSize)
		case "lyricsLines":
			c.LyricsLines = asInt(raw, c.LyricsLines)
		case "lyricsSources":
			if list, ok := raw.([]any); ok {
				out := make([]string, 0, len(list))
				for _, v := range list {
					if s, ok := v.(string); ok {
						out = append(out, s)
					}
				}
				// 规范化：去重、去掉未知项、补齐 cache 等缺项。
				// 前端只会把「拖过的顺序」推上来，合法性由后端兜住。
				c.LyricsSources = lyrics.NormalizeSources(out)
			}
		case "filterRules":
			if list, ok := raw.([]any); ok {
				rules := make([]bootstrap.FilterRule, 0, len(list))
				for _, item := range list {
					m, ok := item.(map[string]any)
					if !ok {
						continue
					}
					rules = append(rules, bootstrap.FilterRule{
						ID:      asString(m["id"], bootstrap.RandomID("rule")),
						Type:    asString(m["type"], "regex"),
						Op:      asString(m["op"], "match"),
						Value:   asString(m["value"], ""),
						Unit:    asString(m["unit"], "B"),
						Scope:   asString(m["scope"], "exclude"),
						Enabled: asBool(m["enabled"], true),
					})
				}
				c.FilterRules = rules
			}
		case "cacheDir":
			c.CacheDir = asString(raw, c.CacheDir)
		// —— 响度均衡 ——
		// 这几个键以前被漏掉了：前端一直在推，后端不认，于是设置里的
		// 「均衡模式 / 目标响度 / 真峰值保护」重启后一律回到默认值。
		case "loudnessMode":
			mode := strings.TrimSpace(asString(raw, c.LoudnessMode))
			switch mode {
			case "off", "track", "album":
				c.LoudnessMode = mode
			default:
				// 非法值不静默接受，免得界面显示与实际行为不一致
				c.LoudnessMode = "off"
			}
		case "loudnessTarget":
			c.LoudnessTarget = asFloat(raw, c.LoudnessTarget)
		case "loudnessLimit":
			c.LoudnessLimit = asBool(raw, c.LoudnessLimit)
		// —— 在线功能 ——
		case "downloadDir":
			c.DownloadDir = bootstrap.ExpandPath(asString(raw, c.DownloadDir))
		case "onlineCover":
			c.OnlineCover = asBool(raw, c.OnlineCover)
		case "embedMeta":
			c.EmbedMeta = asBool(raw, c.EmbedMeta)
		// —— 交互 ——
		case "rowClickAction":
			c.RowClickAction = bootstrap.NormalizeRowClickAction(asString(raw, c.RowClickAction))
		case "listDensity":
			c.ListDensity = bootstrap.NormalizeListDensity(asString(raw, c.ListDensity))
		case "showDesktopLyrics":
			c.ShowDesktopLyrics = asBool(raw, c.ShowDesktopLyrics)
		case "sleepAfterSong":
			c.SleepAfterSong = asBool(raw, c.SleepAfterSong)
		case "aiVendor":
			// 非法值不静默接受：思考开关发错字段会被服务端直接拒
			if v := strings.TrimSpace(asString(raw, c.AIVendor)); isValidAIVendor(v) && v != "" {
				c.AIVendor = v
			}
		case "coverCarousel":
			c.CoverCarousel = asBool(raw, c.CoverCarousel)
		case "coverCarouselInterval":
			// 下限 2 秒：比这更快的轮播只会变成闪烁
			c.CoverCarouselInterval = bootstrap.NormalizeCarouselInterval(asInt(raw, c.CoverCarouselInterval))
		case "shuffleMode":
			if asString(raw, c.ShuffleMode) == "once" {
				c.ShuffleMode = "once"
			} else {
				c.ShuffleMode = "reshuffle"
			}
		case "aiBaseUrl":
			c.AIBaseURL = strings.TrimSpace(asString(raw, c.AIBaseURL))
		case "aiApiKey":
			c.AIAPIKey = strings.TrimSpace(asString(raw, c.AIAPIKey))
		case "aiThinking":
			c.AIThinking = asBool(raw, c.AIThinking)
		case "aiModelId":
			c.AIModelID = strings.TrimSpace(asString(raw, c.AIModelID))
		case "aiLyricsClean":
			// 自动匹配歌词时是否先用 AI 清洗元数据（AI 慢，用户可关）
			c.AILyricsClean = asBool(raw, c.AILyricsClean)
		}
	}
}

func asString(v any, def string) string {
	if s, ok := v.(string); ok {
		return s
	}
	return def
}

func asInt(v any, def int) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	}
	return def
}

func asFloat(v any, def float64) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	}
	return def
}

func asBool(v any, def bool) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	return def
}

// sanitizeSeedColor 规范化封面取色的结果：只保留 #rgb / #rrggbb，其它一律丢弃。
//
// 这个值会被 early_theme.go 直接拼进 <html> 的行内样式，所以必须在这里收紧；
// 非法输入（用户手改配置、旧版本字段）返回空串 = 「没有取色记录」。
func sanitizeSeedColor(v string) string {
	v = strings.TrimSpace(v)
	if len(v) != 4 && len(v) != 7 {
		return ""
	}
	if v[0] != '#' {
		return ""
	}
	for _, r := range v[1:] {
		isHex := (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')
		if !isHex {
			return ""
		}
	}
	return strings.ToLower(v)
}

// readSongCache 读取元数据缓存里登记过的文件路径（导出 m3u 用，避免再次扫盘）
func readSongCache(dataDir string) map[string]string {
	out := map[string]string{}
	raw, err := os.ReadFile(filepath.Join(dataDir, "metadata-cache.json"))
	if err != nil {
		return out
	}
	var payload struct {
		Entries map[string]json.RawMessage `json:"entries"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return out
	}
	for path := range payload.Entries {
		out[bootstrap.StableID(path, "t")] = path
	}
	return out
}
