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
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/executil"
	"localmusicplayer/internal/library"
	"localmusicplayer/internal/loudness"
	"localmusicplayer/internal/lyrics"
	"localmusicplayer/internal/media"
	"localmusicplayer/internal/metacache"
	"localmusicplayer/internal/theme"
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

	// OnScanFinished 每次后台扫描结束时调用（仅用于测试同步，生产环境为 nil）
	OnScanFinished func()
}

// NewLibraryService 构造服务（app 由 main 在创建应用后注入）
func NewLibraryService(lib *library.Manager, watch *library.Watcher, store *bootstrap.Store) *LibraryService {
	s := &LibraryService{lib: lib, watch: watch, store: store}
	// 曲库的每一次变化都在这里统一广播 scan:done：
	//   · 全量扫描（用户点重扫 / 添加文件夹 / 启动扫描）；
	//   · 增量扫描（文件夹监听、下载完成后 onFileAdded 调用的 RescanPaths）。
	// 下载入库走的就是第二条 —— 以前只更新了内存里的 songs，没人告诉前端，
	// 于是「刚下载的歌要重启才出现」。emit 会自己判断 app 是否就绪，
	// 所以此时（app 还没注入）注册回调是安全的。
	if lib != nil {
		lib.SetChangedFunc(func(res library.ScanResult) {
			s.emit("scan:done", res)
		})
	}
	return s
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

/* --------------------------------------------------------------------------
   曲库移除 / 反查（给 UnplayableService 用，见 services_unplayable.go）
   -------------------------------------------------------------------------- */

// DropSong 把一首歌从曲库里摘掉（不动磁盘文件）。
//
// 刻意**不导出**成 Wails 绑定：它是给 UnplayableService 用的内部能力，
// 前端不该有「凭 id 删任意一首歌」的入口 —— 曲库的增删只应由扫描决定。
func (s *LibraryService) DropSong(songID string) bool {
	return s.lib.DropSong(songID)
}

// LookupSong 按 id 反查路径/标题/歌手/扩展名。
//
// 同样刻意不导出：前端拿到的歌曲对象里本来就有这些字段，
// 这个方法只是让后端服务之间能互相补齐信息。
func (s *LibraryService) LookupSong(songID string) (path, title, artist, ext string, ok bool) {
	song, found := s.lib.SongByID(songID)
	if !found {
		return "", "", "", "", false
	}
	return song.Path, song.Title, song.Artist, song.Ext, true
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
	if _, err := s.lib.Scan(ctx, false); err != nil {
		s.emit("scan:failed", map[string]any{"message": err.Error()})
		return
	}
	// scan:done 由 NewLibraryService 注册的 SetChangedFunc 统一发出
	// （Scan 内部的 notifyChanged 会带上这次的 ScanResult），这里不再重复发送。
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
	// cancel 必须在 goroutine 里 defer：放在外面的话函数一 return 就把刚交给
	// 后台的 ctx 取消了，扫描必然以「context canceled」失败并弹一条红色 toast。
	go func() {
		defer cancel()
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
	roots := make([]string, 0, len(cfg.Folders)+1)
	if cfg.WatchFolders {
		// 用 EffectiveFolders 而不是 cfg.Folders：下载目录是一个**隐式扫描根**
		// （见 bootstrap.EffectiveFolders），而 Scan 就是这么取的。两边口径不一致
		// 会导致「下载目录里的新歌不会自动出现」。
		for _, f := range cfg.EffectiveFolders() {
			roots = append(roots, f.Path)
		}
	}
	// EnsureStarted 而不是 SetRoots：启动时若没有文件夹 / 监听是关的，
	// 事件循环从未启动，只 SetRoots 会得到「界面说在监听、实际收不到事件」。
	s.watch.EnsureStarted(roots)
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

// Get 读取当前配置。
//
// ★ 返回前会把 AIAPIKey 打码：这个结构体会被序列化后交给前端，
// 而前端的运行环境里可以加载**用户数据目录中的任意第三方皮肤 JS**
// （见 packages/player-skins 的动态 import），密钥一旦进入前端就等于
// 「任何能跑代码的界面组件都能读到它」。
//
// 前端真正需要的只是「配没配」（见 settings-view.js 的 configured 判断），
// 所以这里把密钥替换成固定占位串，另给一个 aiApiKeySet 布尔位。
// 写回路径不受影响：Set 收到占位串时会忽略（见 applyPatch），
// 用户不改密钥时原值保留。
func (s *ConfigService) Get() bootstrap.Config {
	cfg := s.store.Get()
	// 先算出「有没有配密钥」，再打码 —— 顺序反了会让布尔位永远为 false。
	cfg.AIAPIKeySet = strings.TrimSpace(cfg.AIAPIKey) != ""
	cfg.AIAPIKey = maskSecret(cfg.AIAPIKey)
	return cfg
}

// secretPlaceholder 是回传给前端的密钥占位串。前端不会把它写回
// （applyPatch 会识别并忽略），因此它只是一个「这里本来有值」的标记。
const secretPlaceholder = "\x00SET\x00"

// maskSecret 把非空密钥替换成占位串；空值保持空。
func maskSecret(v string) string {
	if strings.TrimSpace(v) == "" {
		return ""
	}
	return secretPlaceholder
}

// isMaskedSecret 判断前端回传的值是不是占位串（是则应当忽略、保留原值）。
func isMaskedSecret(v string) bool { return v == secretPlaceholder }

// Set 增量写入配置（只覆盖传入的键）
func (s *ConfigService) Set(patch map[string]any) (bootstrap.Config, error) {
	err := s.store.Update(func(c *bootstrap.Config) {
		applyPatch(c, patch)
	})
	if err != nil {
		return bootstrap.Config{}, err
	}
	return s.Get(), nil
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

	// virtual 按 id 取「不在曲库里、但磁盘上有真实文件」的歌曲（在线试听）。
	//
	// ★ 为什么响度服务也需要它（真实缺口）：
	//
	//	在线试听曲目的 id 形如 bili:BVxxx，而 lib.SongByID 只认扫描出来的
	//	本地曲目 —— 于是 Get/Measure 一律以「歌曲不存在」失败，在线试听
	//	**完全不受响度均衡约束**。
	//
	//	修这条链路时前端曾经用 `if (!song.online)` 把在线曲目挡在门外，
	//	那只让「查不到」变得不再报错，代价是功能彻底缺失。正解是让这类
	//	曲目也能被解析到：音频其实已经落在磁盘上（见
	//	media.Server.RegisterVirtual），响度测量只要有路径就能跑。
	//
	// 注入的是读取函数而不是 media.Server 本身：响度服务不该依赖 HTTP
	// 服务层，测试里也能用一个假函数喂虚拟曲目。为 nil 时安全降级为
	// 「只认曲库」（即修复前的行为）。
	virtual func(id string) (bootstrap.Song, bool)

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

// setVirtualResolver 注入「在线试听曲目」的来源（main.go 装配时调用）。
// 不注入时行为与修复前一致：只认曲库。
func (s *LoudnessService) setVirtualResolver(fn func(string) (bootstrap.Song, bool)) {
	s.mu.Lock()
	s.virtual = fn
	s.mu.Unlock()
}

// songByID 解析一首歌：先查曲库，再查在线虚拟表。
//
// 顺序与 media.Server.lookupSong 保持一致（曲库优先）。两者不可能撞 id：
// 本地 id 是路径派生，在线 id 带 bili: 前缀。
//
// 查不到时返回的 error 文案保持原样，前端依赖它区分「真的没有这首歌」
// 与「测量失败」。
func (s *LoudnessService) songByID(songID string) (bootstrap.Song, error) {
	if song, ok := s.lib.SongByID(songID); ok {
		return song, nil
	}
	// 在线曲目走这里。注意虚拟表只在音频**已经落到本地缓存**之后才有条目
	// （EnsureCached 下载完才登记），所以「查不到」是正常时序而非错误 ——
	// 前端稍后会重试一次，届时条目已就位。
	s.mu.Lock()
	lookup := s.virtual
	s.mu.Unlock()
	if lookup != nil {
		if song, ok := lookup(songID); ok {
			return song, nil
		}
	}
	return bootstrap.Song{}, fmt.Errorf("歌曲不存在: %s", songID)
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
	// ★ 「已测量」不再按标准统计：测量与挡位无关（见 internal/loudness 的
	// 包注释）。用户在四个挡位之间切换都不会让这个数字变化 —— 因为它本来
	// 描述的就是「有多少首歌已经量过响度」。
	measured := s.mgr.CountValid(songs)
	return map[string]any{
		"available": s.mgr.Available(),
		"source":    t.Source,
		"describe":  t.Describe(),
		"path":      t.FFmpeg,
		"measured":  measured,
		"cached":    s.mgr.Count(),
		"missing":   len(songs) - measured,
		"total":     len(songs),
		"target":    target,
		"algo":      loudness.AlgoVersion,
		"measuring": s.isMeasuring(),
		"cachePath": s.mgr.CachePath(),
		"onDemand":  true,
		// concurrency 是实际生效的测量并发（默认 2，刻意压小以免风扇狂转）
		"concurrency": s.mgr.Concurrency(),
		// gains 是已缓存的挡位增益条数（一万首 × 四挡 = 四万），
		// 用来回答「换挡位到底要不要重算」——正常情况下它只增不减。
		"gains": s.mgr.GainCount(),
	}
}

// Get 取一首歌的测量结果与补偿增益。
//
// ★ 换挡位是零成本的：测量结果与挡位无关，所以这里要么直接命中已缓存的
// 该挡位增益，要么用已有的测量结果现场算一次（纯算术），**绝不会**因为
// 「换了个挡位」就重新测量。
//
// 在线试听曲目也走这里（经 songByID 的虚拟表兜底）：它们的音频在本地
// 缓存里，测量条件与本地曲目完全一样。
func (s *LoudnessService) Get(songID string, targetLUFS float64) (map[string]any, error) {
	song, err := s.songByID(songID)
	if err != nil {
		return nil, err
	}
	target := s.normTarget(targetLUFS)

	gain, ok := s.mgr.GainFor(song, target)
	if !ok {
		return map[string]any{"measured": false, "target": target}, nil
	}
	item, _ := s.mgr.Get(song)
	_ = s.mgr.Save()
	return map[string]any{
		"measured":   true,
		"integrated": item.Integrated,
		"truePeak":   item.TruePeak,
		"lra":        item.LRA,
		"gainDB":     gain,
		"target":     target,
	}, nil
}

// Measure 测量单首歌 —— 这是常规路径：用户播到哪首就测哪首，不预先全库扫描。
// 前端在开始播放时调用，测完立刻套用补偿。
//
// 在线试听曲目同样支持：只要它的音频已经下载到本地缓存（前端播放在线曲目
// 时后端会先 EnsureCached），就能像本地文件一样测量。测出的记录按
// Path/Size/ModTime 进同一个缓存 —— 这几个量对在线曲目是稳定的，
// 所以第二次试听同一首歌会直接命中缓存，不会重复跑 ffmpeg。
//
// ★ 走的是**高优先级**队列（PriorityInterrupt）：如果后台正在批量预热整库，
// 这首歌会插到队首 —— 这正是「优先处理正在播放的那首歌」。
func (s *LoudnessService) Measure(songID string, targetLUFS float64) (map[string]any, error) {
	song, err := s.songByID(songID)
	if err != nil {
		return nil, err
	}
	target := s.normTarget(targetLUFS)

	// 已经测过（含转码时顺手算出来的）就直接返回，不进队列、不起 ffmpeg。
	if g, ok := s.mgr.GainFor(song, target); ok {
		item, _ := s.mgr.Get(song)
		_ = s.mgr.Save()
		return measureResult(item, g, target), nil
	}
	if !s.mgr.Available() {
		return nil, fmt.Errorf("ffmpeg 不可用，无法测量响度")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	item, err := s.mgr.Submit(ctx, song, loudness.PriorityInterrupt)
	if err != nil {
		return nil, err
	}
	gain, _ := s.mgr.GainFor(song, target)
	// 单曲测量也要落盘，下次播放直接命中缓存
	_ = s.mgr.Save()
	return measureResult(item, gain, target), nil
}

// measureResult 组装单曲测量的返回结构（字段名是前端契约，不要改）
func measureResult(item loudness.Measurement, gain, target float64) map[string]any {
	return map[string]any{
		"measured":   true,
		"integrated": item.Integrated,
		"truePeak":   item.TruePeak,
		"lra":        item.LRA,
		"gainDB":     gain,
		"target":     target,
	}
}

// InvalidateTarget 兼容旧接口。
//
// ★ 它现在**什么都不删**（返回 dropped=0）。
//
// 历史上这个方法是「把 target 不等于当前值的记录全删掉」，代价是用户每换
// 一次挡位就丢掉整库已算好的结果 —— 四个挡位来回切就是反复重算同一批歌，
// 那正是用户报的「从较响改回默认时，较响算好的补偿丢了」。
//
// 现在测量与挡位解耦：换挡位只意味着增益按新目标现算（纯算术，几纳秒），
// 没有任何缓存需要失效。保留这个方法只是为了不动前端绑定。
func (s *LoudnessService) InvalidateTarget(targetLUFS float64) map[string]any {
	target := s.normTarget(targetLUFS)
	// 仍然做一次自校验清理（只丢"目标值与自述不符"的坏条目），
	// 但正常情况下这里永远是 0 条。
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
//
// ★ 它走**低优先级**队列：一旦用户点开某首歌（走 Measure 的高优先级通道），
// 预热会让出槽位，先测用户正在听的那首。并发默认压到 2，避免把 CPU 铺满。
func (s *LoudnessService) MeasureAll(targetLUFS float64) map[string]any {
	s.normTarget(targetLUFS)
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

		done, failed, err := s.mgr.MeasureAll(ctx, songs, func(p loudness.Progress) {
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
// ★ 换挡位零成本的落点：这张表由**已有的测量结果**现算出来，
// 不需要为另一个挡位重新测量任何一首歌。用户从「较响」切到「默认」时，
// 整个曲库的补偿在这一个调用里就全部就位（每首几纳秒的算术），
// 而不是排一个几十分钟的队。
//
// 没测过的歌不在其中，前端播到那首时会走 Measure 按需补算。
//
// 注意这里刻意**只遍历曲库**：在线试听曲目没有稳定的「专辑归属」，
// 把它们塞进批量表既会让这张随曲库变化的映射多出易失条目，也会让
// 「按专辑统一」失去意义。在线曲目走 Get/Measure 的按需路径（track 模式），
// 测出来的记录同样进缓存、下次试听直接命中。
func (s *LoudnessService) GainMap(targetLUFS float64) map[string]float64 {
	target := s.normTarget(targetLUFS)
	out := map[string]float64{}
	for _, song := range s.lib.Songs() {
		if g, ok := s.mgr.GainFor(song, target); ok {
			out[song.ID] = g
		}
	}
	// 把这一挡位新算出的增益落盘，下次启动直接命中（每个挡位只写一次）
	_ = s.mgr.Save()
	return out
}

// AlbumGains 返回按专辑聚合的补偿增益（「整张专辑统一」模式）
//
// 与 GainMap 同理，只对曲库内歌曲分组：在线试听曲目不属于任何本地专辑，
// 在 album 模式下它们保持不补偿（「查不到就不抬升也不压低」，与
// frontend/src/js/audio.js#gainDBFor 的既有安全语义一致）。
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
		s.mgr.UpdateAlbum(name, songs)
		if g, ok := s.mgr.AlbumGainDB(name, target); ok {
			for _, song := range songs {
				out[song.ID] = g
			}
		}
	}
	_ = s.mgr.Save()
	return out
}

// StoreMeasurement 把「转码时顺手算出来」的测量结果记进缓存。
//
// 由 main 装配层挂在 media.Server 的扫描钩子上（见 SetLoudnessSink）。
// 它是响度测量**唯一不需要跑 ffmpeg 的入口**：转码播放本来就要解码整首歌，
// 顺手把响度算出来即可，不再需要第二遍解码。
//
// 这里同时把当前挡位的增益算好记下（GainFor 会做），这样播放到这首歌时
// 补偿已经就位 —— 用户感受到的是「响度均衡不需要等待」。
func (s *LoudnessService) StoreMeasurement(song bootstrap.Song, res loudness.Measurement) {
	if !res.Measured && res.Integrated == 0 && res.TruePeak == 0 {
		// 空结果（解码失败/全静音）：不写入，免得留下一条"测过但没有数据"
		// 的记录挡住后续的正常测量。
		return
	}
	res.Measured = true
	target := s.currentTarget()
	s.mgr.StoreAndGain(song, res, target)
	// 落盘：这一步很便宜（只有变化时才写），但能让结论跨进程复用。
	_ = s.mgr.Save()
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
	// themeMgr 读主题 CSS 用的管理器（由 main 注入，可能与 nil 比较）。
	//
	// 背景歌词窗口的创建底色要按当前主题的首帧底色算（见
	// desktopWallpaperFirstFrameColour），那个算法需要读主题文件里的 --bg-app。
	themeMgr *theme.Manager

	// —— 桌面歌词（独立透明窗口，见 desktop_lyrics.go）——
	desktopMu       sync.Mutex
	desktopOn       bool
	desktopText     string
	desktopPlaying  bool
	desktopFontSize int
	// posSaveTimer / posSaveSeq 是「记住桌面歌词窗口位置」的去抖状态
	// （见 desktop_lyrics.go#scheduleDesktopLyricsPosSave）。
	posSaveTimer *time.Timer
	posSaveSeq   uint64
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

	// wallpaperShown 记录「当前这个背景歌词窗口显示出来没有」。
	//
	// 窗口是**隐藏创建**的（见 desktop_wallpaper.go#ensureDesktopWallpaper）：
	// 页面自己的底色是深色，而皮肤要等主窗口把数据推过来才画得出东西，
	// 创建后立刻显示的话用户先看到的是一块纯色 —— 也就是「刚打开时黑一下」。
	// 所以显示时机推迟到「页面确认第一帧画进 DOM」（MarkDesktopWallpaperPainted），
	// 另有兜底定时器保证页面出任何问题时窗口也不会永远不出现。
	wallpaperShown atomic.Bool
	// wallpaperCloaked 记录「当前这个背景歌词窗口正处在遮罩显示状态」。
	//
	// 含意是两件事同时成立：窗口已经是 WS_VISIBLE 的（WebView2 因此正常出帧），
	// 但它被 DWM 遮住、而且**还没有**挂进桌面壁纸层。
	// 这是「先在后台把首帧渲染完，再放进桌面」的中间态，
	// 见 desktop_wallpaper.go#ensureDesktopWallpaper 与 showDesktopWallpaperNow。
	wallpaperCloaked atomic.Bool
	// wallpaperAttached 记录「当前这个背景歌词窗口已经挂进桌面壁纸层（WorkerW）」。
	//
	// 两阶段路径下挂载发生在窗口画好之后（showDesktopWallpaperNow），
	// 旧路径下发生在创建时（ensureDesktopWallpaper）—— 两条路都要幂等，
	// 所以用一个标志记住「挂过了」，而不是靠窗口样式去猜。
	wallpaperAttached atomic.Bool
	// wallpaperGen 每次创建新的背景歌词窗口就 +1。
	// 兜底定时器带着创建时的代数回调，用来判断「我等的是不是当前这个窗口」——
	// 否则「关掉很快又打开」时，上一个窗口留下的定时器会把新窗口提前显示出来。
	// 只在持有 wallpaperMu 时读写。
	wallpaperGen uint64

	// —— 主窗口显示时机 / 托盘 ——
	//
	// shown 记录「主窗口到底显示出来没有」。前端的 Ready 与 main.go 的兜底
	// 定时器都会调 MarkReady，只有真正显示成功才置位（见 MarkReady）。
	shown atomic.Bool
	// bootCloaked 记录「窗口已经是 WS_VISIBLE 的，只是被 DWM 遮住」这个中间态：
	// showPrepared 把它置位，ShowMain 负责摘遮罩（见 showPrepared）。
	bootCloaked atomic.Bool
	// booted 记录「前端界面已经装配完毕」（由 /boot/booted 置位，见 MarkBooted）。
	//
	// 与 shown 的区别：shown 只说明窗口可见（前端模块一跑起来就发了），而启动
	// 高峰 —— 解析 bundle、解码封面、套主题、建皮肤 —— 恰好落在「可见」与
	// 「装配完成」之间。桌面背景歌词的启动恢复要等的是后者，否则会和主窗口
	// 抢 CPU / GPU（见 early_theme.go#waitMainWindowBooted）。
	booted atomic.Bool
	// cloakUnsupported 记录「这台机器上遮不住」。只探测一次，之后彻底退回
	// 旧路径（隐藏创建 + 就绪后显示），不再每 8ms 重试一遍系统调用。
	cloakUnsupported atomic.Bool
	// bootPreparedOnce 保证「准备窗口」的轮询只跑一轮（托盘 / 第二次启动都
	// 可能再触发）。
	bootPreparedOnce sync.Once
	// revealRequested 记录「已经有人要求窗口真正露面了」（ShowMain 一进来就置位）。
	// 与 shown 分开：shown 只在确认窗口真的可见时才置位（允许重试，见 MarkReady），
	// 而「露面流程已经开始」这件事必须先于 Show 生效，否则 showPrepared 可能
	// 在 ShowMain 之后才把遮罩加上去，窗口就永远露不出来了。
	revealRequested atomic.Bool
	// bootMu 保护「遮住 / 摘遮罩」这个状态机。
	//
	// 不加锁有一个很难复现但很致命的交错：前端 ready 来得特别早时，
	// ShowMain 可能在 showPrepared 把 bootCloaked 置位**之前**跑完摘遮罩，
	// 紧接着 showPrepared 才遮上去 —— 遮罩就永远摘不掉了（窗口再也不出现）。
	//
	// 注意锁的范围**不包含** w.Show() / w.Focus()：它们内部是 InvokeSync，
	// 持有锁等主线程时，万一主线程正好在等同一个锁就是死锁。
	bootMu sync.Mutex
	// tray 是「关闭时最小化到托盘」用的系统托盘图标；开关关闭时为 nil。
	trayMu sync.Mutex
	tray   *application.SystemTray
	// quitting 由托盘菜单的「退出」置位。置位后关闭窗口不再被拦成「收进托盘」。
	quitting atomic.Bool
}

// NewWindowService 构造服务（app 由 main 在创建应用后注入）
//
// themeMgr 用来算窗口的创建底色（见 desktopWallpaperFirstFrameColour）；
// 传 nil 也安全 —— 那时一律退回近黑，与改动前一致。
func NewWindowService(store *bootstrap.Store, themeMgr *theme.Manager) *WindowService {
	return &WindowService{store: store, themeMgr: themeMgr}
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

/* --------------------------------------------------------------------------
   主窗口的显示时机 + 系统托盘
   -------------------------------------------------------------------------- */

// MarkReady 前端把 DOM 装配好之后调用：这时才让主窗口真正出现在屏幕上。
//
// 为什么窗口创建时是 Hidden（见 main.go 的 winOpts）：Wails 在不隐藏时会用
// 带 WS_VISIBLE 的样式创建窗口，而 WebView2 在页面渲染完成前会先亮一块白底 ——
// 那正是首屏那一下闪烁（Wails issue #4611 的修法就是创建时排除 WS_VISIBLE）。
//
// 「隐藏创建」只是躲开了白底，却换来了黑闪：controller 不可见时 WebView2 不出帧，
// 所以 Show() 之后还要等合成器吐出第一帧，这段时间窗口里是空的（露出来的就是
// 窗口底色）。真正的修法是 showPrepared —— 见那里的注释。
//
// 刻意**不用** sync.Once 锁死：前端的信号有可能到得太早 —— 窗口实现还在
// pendingRun 里没跑起来时，WebviewWindow.Show() 只会去 InvokeSync(w.Run)
// 然后**直接返回、不显示窗口**。锁死的话后面所有重试（包括 main.go 的兜底
// 定时器）都会被这次「假成功」吃掉，窗口就永远不出来了（表现为「第一次打不开、
// 再点一次才出来」）。这里改为「没真正显示过就继续试」。
func (s *WindowService) MarkReady() {
	if s.shown.Load() {
		return
	}
	s.ShowMain()
}

// showPrepared 在「用户看不见」的前提下把主窗口显示出来，让 WebView2 立刻开始出帧。
//
// 这是首屏那一下黑闪的正解：
//  1. 先用 DWM 的 cloak 把窗口遮住（window_reveal_windows.go）；
//  2. 再 Show()，让它变成 WS_VISIBLE —— WebView2 因此正常运行合成、rAF 正常派发，
//     前端那句「第一帧画好了」才有意义；
//  3. 用户什么都看不见；等 MarkReady 走到 ShowMain 时只多做一件事：摘掉遮罩。
//
// 于是窗口「出现」的那一帧已经是画好的帧，中间那个空档根本不存在。
//
// 返回 true 表示这件事已经尘埃落定（准备成功，或确认本机做不到），调用方不用重试。
func (s *WindowService) showPrepared() bool {
	if s.shown.Load() {
		return true
	}
	if s.cloakUnsupported.Load() {
		return true // 已经确认遮不住，保持旧路径
	}
	w := s.current()
	if w == nil {
		return false
	}

	// 锁里再确认一次「还没有人要求露面 / 还没遮过」：ShowMain 可能刚好抢在
	// 我们前面跑完（见 bootMu 的注释）。
	s.bootMu.Lock()
	if s.revealRequested.Load() || s.bootCloaked.Load() {
		s.bootMu.Unlock()
		return true
	}
	hwnd := w.NativeWindow()
	if hwnd == nil {
		// 原生窗口还没建出来（启动时窗口是在 Wails 的 goroutine 里创建的），
		// 交给调用方稍后再试。这里刻意不自己调 w.Run() 建窗口：那会和
		// pendingRun 抢着建，可能建出两个窗口实现。
		s.bootMu.Unlock()
		return false
	}
	if !cloakNativeWindow(hwnd, true) {
		s.cloakUnsupported.Store(true)
		s.bootMu.Unlock()
		// 遮不住就别遮了，但窗口照样提前显示：WebView2 还是得先出帧，
		// 露面时才是画好的画面（代价是这几百毫秒里露的是窗口底色）。
		w.Show()
		log.Printf("[boot] 本机不支持 DWM 隐身，改为「先显示、后出帧」")
		return true
	}
	s.bootCloaked.Store(true)
	s.bootMu.Unlock()

	// Show 必须在锁外：它内部走 InvokeSync。
	w.Show()
	// Show 之后任务栏才挂上按钮，所以紧接着摘掉：WebView2 还要几百毫秒才出首帧，
	// 那段时间图标孤零零挂着，用户看着就是「窗口迟迟不来」。
	// 露面时（ShowMain）再把它加回来（见 setTaskbarPresence）。
	setTaskbarPresence(hwnd, false)
	// 顺带把系统外框（阴影 + 圆角）补上：遮罩显示这一步吃掉了原本由
	// WM_ACTIVATE 触发的那次设置（见 applyWindowDecorations）。
	s.applyMainDecorations(w)
	log.Printf("[boot] 主窗口已遮罩显示：WebView2 现在开始出帧，首屏不再有空白窗口")
	return true
}

// applyMainDecorations 按当前配置重设主窗口的系统外框与圆角。
//
// 全屏时跳过：全屏要的就是「无边框、无阴影、方角」，Wails 进全屏时也会主动
// 把外框延伸关掉（webview_window_windows.go#fullscreen）。
func (s *WindowService) applyMainDecorations(w *application.WebviewWindow) {
	if w == nil || w.IsFullscreen() {
		return
	}
	mode := "system"
	if s.store != nil {
		mode = bootstrap.NormalizeWindowCorners(s.store.Get().WindowCorners)
	}
	applyWindowDecorations(w.NativeWindow(), mode)
}

// MainWindowShown 报告主窗口是不是真的显示出来了（ShowMain 里确认可见才置位）。
//
// 给启动恢复用：桌面背景歌词要等主窗口露面之后再恢复，免得在启动高峰里和
// 主窗口抢 CPU / GPU（见 early_theme.go#waitMainWindowShown）。
func (s *WindowService) MainWindowShown() bool {
	return s.shown.Load()
}

// startPreparedBoot 在应用跑起来之后尽早执行 showPrepared。
//
// 为什么要轮询：ApplicationStarted 是 Wails 消息循环刚起来时发的，而窗口本身
// 在另一个 goroutine 里创建（application.go 的 pendingRun），两者没有先后保证。
// 轮询窗口很窄（几毫秒一次、最多 3 秒），命中之后立刻退出。
func (s *WindowService) startPreparedBoot() {
	s.bootPreparedOnce.Do(func() {
		go func() {
			deadline := time.Now().Add(3 * time.Second)
			for time.Now().Before(deadline) {
				if s.shown.Load() || s.showPrepared() {
					return
				}
				time.Sleep(8 * time.Millisecond)
			}
			log.Printf("[boot] 等待原生窗口超时，首屏回到「隐藏创建 + 就绪后显示」")
		}()
	})
}

// bootRevealPath 是前端「首帧已经画好，可以露面了」的 HTTP 信号路径。
//
// 为什么不用 Wails 的 JS→Go 绑定：那条链路要把 web message 交给宿主线程再派发，
// 而启动阶段宿主主线程正忙着初始化 WebView2，实测信号能晚到近一秒 —— 窗口就
// 白等这么久（表现就是「任务栏图标都出来半天了，窗口才冒出来」）。
// 普通 HTTP 请求走网络栈，不受宿主主线程忙不忙影响，实测几十毫秒内到达。
const bootRevealPath = "/boot/reveal"

// bootBootedPath 是前端「界面已经装配完毕」的 HTTP 信号路径。
//
// 它与 bootRevealPath 是两个不同的时刻，差得很远：
//
//	· reveal —— 模块刚跑起来就发（过渡画面已经画好，窗口可以露面了）；
//	· booted —— bootstrap 跑完、主题套好、startRuntime 启动之后才发。
//
// 桌面背景歌词的启动恢复要等的是 booted：它要挂一整套播放界面皮肤、
// 渲染整屏画面，如果跟主窗口的启动高峰（解析 bundle、解码封面、套主题）
// 撞在一起，两边会真的互相拖慢（见 early_theme.go#waitMainWindowBooted）。
const bootBootedPath = "/boot/booted"

// MarkReadyAsync 与 MarkReady 等价，但不阻塞调用方（HTTP 处理器用）。
func (s *WindowService) MarkReadyAsync() {
	go s.MarkReady()
}

// MarkBooted 记下「前端界面已经装配完毕」（由 /boot/booted 调用）。
//
// 幂等：重复到达（刷新页面、第二个实例）只是再置一次位，没有副作用。
// 它是一个**一次性**的启动里程碑，不因为后续刷新而复位 —— 启动恢复等的是
// 「这一次启动已经过了高峰」，而不是「当前这一帧页面刚加载完」。
func (s *WindowService) MarkBooted() {
	if s.booted.CompareAndSwap(false, true) {
		log.Printf("[boot] 前端界面已装配完毕（桌面背景歌词的启动恢复可以从这里开始）")
	}
}

// MainWindowBooted 报告前端界面是不是已经装配完毕（见 MarkBooted）。
func (s *WindowService) MainWindowBooted() bool {
	return s.booted.Load()
}

// ShowMain 显示并聚焦主窗口（前端 ready / 兜底定时器 / 托盘点击 / 第二个实例）
//
// 可以重复调用：已经显示时只是再 Focus 一下（托盘点击、第二次启动都需要这个语义）。
func (s *WindowService) ShowMain() {
	w := s.current()
	if w == nil {
		return
	}
	// 记下「这次是不是从隐藏状态唤起」（托盘 / 第二次启动）：只有这种情形才需要
	// 后面那次补抢前台（见本函数末尾）。
	restoring := !w.IsVisible()
	if w.IsMinimised() {
		w.UnMinimise()
	}
	// 先声明「露面流程已经开始」，showPrepared 之后就不会再遮了（见 bootMu 注释）。
	s.bootMu.Lock()
	s.revealRequested.Store(true)
	reveal := s.bootCloaked.Swap(false)
	s.bootMu.Unlock()

	// 摘遮罩要排在 Show 前面：遮罩态下窗口已经是 WS_VISIBLE 的，摘掉的那一刻
	// 屏幕上直接就是 WebView2 已经画好的那一帧（见 showPrepared）。
	if reveal {
		if hwnd := w.NativeWindow(); hwnd != nil {
			if !cloakNativeWindow(hwnd, false) {
				log.Printf("[boot] 摘掉启动遮罩失败：窗口可能不会出现")
			}
			// 任务栏按钮与窗口同时回来（showPrepared 里摘掉的那一下）。
			// 放在摘遮罩之后：窗口还是遮着的时候 AddTab 会被资源管理器忽略。
			setTaskbarPresence(hwnd, true)
		}
	}
	w.Show()
	// 露面这一刻再确认一次外框与圆角：遮罩期间窗口可能一次都没被激活过，
	// Wails 那条「WM_ACTIVATE 里补外框」的路径就永远不会走（见 applyWindowDecorations）。
	s.applyMainDecorations(w)
	w.Focus()
	// w.Focus() 内部只有一句 SetForegroundWindow：从托盘唤起时窗口往往只是「显示」
	// 出来，z 序还停在原来的位置（被别的窗口压着）。这里再显式刷一次 z 序并抢前台
	// （见 raiseNativeWindow），让「托盘菜单唤起」和「第二次启动」都真的到最前。
	raiseNativeWindow(w.NativeWindow())
	// 托盘菜单 / 托盘图标那一下，我们自己的弹出层正在关闭，资源管理器可能在这之后
	// 又把前台还回去 —— 于是窗口「是显示出来了，但还压不住别的窗口」。稍后再确认
	// 一次：只在窗口仍然可见、而且前台确实不是本进程时才补一枪（避免顶掉用户
	// 这几百毫秒里刚点的窗口）。
	if restoring {
		go func() {
			time.Sleep(150 * time.Millisecond)
			if w.IsVisible() && !isSelfForeground() {
				raiseNativeWindow(w.NativeWindow())
			}
		}()
	}
	// IsVisible 读的是窗口实现的真实状态：显示成功才置位，
	// 这样「信号到得太早」的那一次不会把后续重试挡掉。
	if w.IsVisible() {
		s.shown.Store(true)
	}
}

// captureBootFrame 真正退出时抓一帧当前画面，缓存给下次启动当过渡图。
//
// 只在窗口可见且没最小化时抓：收进托盘之后再退出的话，窗口没有渲染内容，
// 抓出来是黑的或者过期的 —— 那还不如留着上一次那张。
func (s *WindowService) captureBootFrame() {
	if s.store == nil {
		return
	}
	w := s.current()
	if w == nil || !w.IsVisible() || w.IsMinimised() {
		return
	}
	start := time.Now()
	size, err := saveBootFrame(s.store, w.NativeWindow())
	if err != nil {
		log.Printf("[boot] 缓存首屏过渡图失败: %v", err)
		return
	}
	log.Printf("[boot] 已缓存首屏过渡图: %d KB（耗时 %s）", size/1024, time.Since(start).Round(time.Millisecond))
}

// HideMain 收起主窗口（「关闭时最小化到托盘」用）
func (s *WindowService) HideMain() {
	if w := s.current(); w != nil {
		w.Hide()
	}
}

// SetWindowCorners 设置主窗口圆角（system | round | small | square）并立刻生效。
//
// 圆角是运行期可写的 DWM 属性，所以这里点完立刻就能看到效果，不需要重启。
//
// 返回规范化之后的值，前端据此回写自己的配置（非法值会落回 system）。
func (s *WindowService) SetWindowCorners(mode string) string {
	clean := bootstrap.NormalizeWindowCorners(mode)
	if s.store != nil {
		if err := s.store.Update(func(c *bootstrap.Config) { c.WindowCorners = clean }); err != nil {
			log.Printf("[window] 保存窗口圆角失败: %v", err)
		}
	}
	s.applyMainDecorations(s.current())
	return clean
}

// SetMinimizeToTray 打开 / 关闭「关闭时最小化到托盘」，并立刻同步托盘图标。
//
// 值本身也会落盘，所以下次启动时托盘还在（main.go 启动时会读这个开关）。
// 前端开关走这条路径而不是只推配置：托盘图标必须马上出现 / 消失，
// 不能等下一次启动。
func (s *WindowService) SetMinimizeToTray(on bool) bool {
	if s.store != nil {
		if err := s.store.Update(func(c *bootstrap.Config) { c.MinimizeToTray = on }); err != nil {
			log.Printf("[tray] 保存托盘设置失败: %v", err)
		}
	}
	if on {
		s.ensureTray()
	} else {
		s.removeTray()
	}
	return on
}

// hideToTrayOnClose 报告「这次窗口关闭要不要收进托盘」（主窗口的关闭钩子用）。
//
// 真正退出（托盘菜单「退出」/ app.Quit）时 quitting 已经置位，这里返回 false，
// 让 Wails 按正常流程销毁窗口并退出进程。
func (s *WindowService) hideToTrayOnClose() bool {
	if s.app == nil || s.quitting.Load() {
		return false
	}
	return s.store != nil && s.store.Get().MinimizeToTray
}

// quitFromTray 托盘菜单的「退出」：先把 quitting 置位再退出，
// 否则 Quit 触发的关窗又会被拦成「收进托盘」，应用永远退不掉。
func (s *WindowService) quitFromTray() {
	s.quitting.Store(true)
	if s.app != nil {
		s.app.Quit()
	}
}

// ensureTray 创建托盘图标（已经存在就什么都不做）。
//
// SystemTray.New() 在应用 Run 之前调用也是安全的：Wails 会把 impl 的创建
// 推迟到 app.Run 之后（runOrDeferToAppRun），这里设置的图标与菜单都会被保留。
func (s *WindowService) ensureTray() {
	if s.app == nil {
		return
	}
	s.trayMu.Lock()
	defer s.trayMu.Unlock()
	if s.tray != nil {
		return
	}
	tray := s.app.SystemTray.New()
	tray.SetIcon(appIconPNG)
	tray.SetTooltip("LMPlayer")
	menu := s.app.NewMenu()
	menu.Add("显示主界面").OnClick(func(*application.Context) { s.ShowMain() })
	menu.AddSeparator()
	menu.Add("退出").OnClick(func(*application.Context) { s.quitFromTray() })
	tray.SetMenu(menu)
	// 左键直接显示主界面（Windows 上右键才是菜单，由 SetMenu 自动挂上）
	tray.OnClick(func() { s.ShowMain() })
	s.tray = tray
}

// removeTray 销毁托盘图标（关闭「最小化到托盘」时调）。
func (s *WindowService) removeTray() {
	s.trayMu.Lock()
	tray := s.tray
	s.tray = nil
	s.trayMu.Unlock()
	if tray != nil {
		tray.Destroy()
	}
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
		case "windowCorners":
			c.WindowCorners = bootstrap.NormalizeWindowCorners(asString(raw, c.WindowCorners))
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
		case "resumeProgress":
			// 播放进度本身由前端随快照保存，后端只记这个开关
			c.ResumeProgress = asBool(raw, c.ResumeProgress)
		case "rememberVolume":
			c.RememberVolume = asBool(raw, c.RememberVolume)
		case "listDensity":
			c.ListDensity = bootstrap.NormalizeListDensity(asString(raw, c.ListDensity))
		case "minimizeToTray":
			// 前端开关的落盘路径。运行时那半（创建 / 销毁托盘图标）走
			// WindowService.SetMinimizeToTray，与这里是同一个值，顺序无所谓。
			c.MinimizeToTray = asBool(raw, c.MinimizeToTray)
		case "showDesktopLyrics":
			c.ShowDesktopLyrics = asBool(raw, c.ShowDesktopLyrics)
		case "showDesktopWallpaper":
			// 前端（desktop-wallpaper.js）一直在推这个键，但这里以前没有对应分支，
			// 于是「桌面背景歌词」从未落盘：功能当场可用，重启就没了。
			// 与 showDesktopLyrics 对称；两者的互斥规范化在 config 层统一处理。
			//
			// 注意它只表示**本次运行**开着：要不要在下次启动时自动恢复由
			// autoStartDesktopWallpaper 决定（见 bootstrap.Config.StartupDesktopMode）。
			c.ShowDesktopWallpaper = asBool(raw, c.ShowDesktopWallpaper)
		case "autoStartDesktopWallpaper":
			// 「启动时自动打开桌面背景歌词」。关掉之后本次仍然可以手动打开，
			// 只是下次启动不再自动出现 —— 也就是「只在本次启动生效」。
			c.AutoStartDesktopWallpaper = asBool(raw, c.AutoStartDesktopWallpaper)
			// 顺手纠正一份自相矛盾的配置：自动启动关着、但「本次开着」却是 true，
			// 那多半是用户刚刚在设置里关掉自动启动、却又没有关掉当前这个窗口。
			// 这种状态本身是合法的（本次确实开着），所以**不**在这里改
			// ShowDesktopWallpaper；只在两者都为 false 时没有任何要做的。
			// （这里保留成显式的空分支说明，避免以后有人误以为漏写了什么。）
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
		// —— 跳过静音与切歌间隔 ——
		// 三个键都要有对应分支：前端 flushConfigSync 一直在推，
		// 漏掉任何一个都会变成「开关能动、看起来生效了，重启后什么都没变」
		//（这正是响度那几个键以前踩过的坑，见上面的注释）。
		case "skipSilenceHead":
			c.SkipSilenceHead = asBool(raw, c.SkipSilenceHead)
		case "skipSilenceTail":
			c.SkipSilenceTail = asBool(raw, c.SkipSilenceTail)
		case "trackGapSeconds":
			// 0 是合法值（不留间隔），规范化只在越界时收敛。
			c.TrackGapSeconds = bootstrap.NormalizeTrackGapSeconds(asFloat(raw, c.TrackGapSeconds))
		case "effectPreset":
			// 音效档位：非法值落回 off（见 NormalizeEffectPreset 的说明）。
			//
			// ★ 这个键必须有分支：前端 flushConfigSync 一直在推，
			// 漏掉它就变成「音效能用、看起来生效了，重启后回到关闭」——
			// 与下面注释里提到的响度那几个键踩过的是同一个坑。
			c.EffectPreset = bootstrap.NormalizeEffectPreset(asString(raw, c.EffectPreset))
		case "aiBaseUrl":
			c.AIBaseURL = strings.TrimSpace(asString(raw, c.AIBaseURL))
		case "aiApiKey":
			// ★ 忽略回传的占位串。
			//
			// Get() 交给前端的密钥是打码过的（见 maskSecret），前端在用户
			// 没改这个字段时会把占位串原样推回来。若这里照写，用户每改一次
			// 别的设置都会把自己的密钥抹成占位串 —— 属于静默的数据丢失。
			v := strings.TrimSpace(asString(raw, ""))
			if isMaskedSecret(v) {
				break
			}
			c.AIAPIKey = v
		case "aiThinking":
			c.AIThinking = asBool(raw, c.AIThinking)
		case "aiModelId":
			c.AIModelID = strings.TrimSpace(asString(raw, c.AIModelID))
		case "aiLyricsClean":
			// 自动匹配歌词时是否先用 AI 清洗元数据（AI 慢，用户可关）
			c.AILyricsClean = asBool(raw, c.AILyricsClean)
		case "aiDownloadTag":
			// 下载完成后是否用 AI 提取元数据并写回文件（会改写用户文件，可关）
			c.AIDownloadTag = asBool(raw, c.AIDownloadTag)
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
