package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/library"
	"musicplayer/internal/loudness"
	"musicplayer/internal/lyrics"
	"musicplayer/internal/media"
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

// ---------------------------------------------------------------------------
// Lyrics 服务
// ---------------------------------------------------------------------------

// LyricsService 歌词接口
type LyricsService struct {
	store *bootstrap.Store
	songs func(id string) (bootstrap.Song, bool)
}

// NewLyricsService 构造服务
func NewLyricsService(store *bootstrap.Store, songs func(id string) (bootstrap.Song, bool)) *LyricsService {
	return &LyricsService{store: store, songs: songs}
}

// Load 按设置里的优先级加载歌词
func (s *LyricsService) Load(songID string) (lyrics.Result, error) {
	song, ok := s.songs(songID)
	if !ok {
		return lyrics.Result{}, fmt.Errorf("歌曲不存在: %s", songID)
	}
	return lyrics.Load(song.Path, s.store.Get().LyricsSources), nil
}

// ---------------------------------------------------------------------------
// Themes 服务
// ---------------------------------------------------------------------------

// ThemeService 主题接口
type ThemeService struct {
	mgr *theme.Manager
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

	mu       sync.Mutex
	cancel   context.CancelFunc
	measuring bool
}

// NewLoudnessService 构造服务
func NewLoudnessService(mgr *loudness.Manager, lib *library.Manager) *LoudnessService {
	return &LoudnessService{mgr: mgr, lib: lib}
}

// State 返回响度测量能力与进度概况
func (s *LoudnessService) State() map[string]any {
	t := s.mgr.Tools()
	songs := s.lib.Songs()
	missing := len(s.mgr.Missing(songs))
	return map[string]any{
		"available":   s.mgr.Available(),
		"source":      t.Source,
		"describe":    t.Describe(),
		"path":        t.FFmpeg,
		"measured":    s.mgr.Count(),
		"missing":     missing,
		"total":       len(songs),
		"measuring":   s.isMeasuring(),
		"cachePath":   s.mgr.CachePath(),
	}
}

// Get 取一首歌的测量结果与补偿增益
func (s *LoudnessService) Get(songID string, targetLUFS float64) (map[string]any, error) {
	song, ok := s.lib.SongByID(songID)
	if !ok {
		return nil, fmt.Errorf("歌曲不存在: %s", songID)
	}
	if targetLUFS == 0 {
		targetLUFS = -16
	}
	item, ok := s.mgr.Get(song)
	if !ok {
		return map[string]any{"measured": false}, nil
	}
	return map[string]any{
		"measured":   true,
		"integrated": item.Integrated,
		"truePeak":   item.TruePeak,
		"lra":        item.LRA,
		"gainDB":     loudness.GainDB(item, targetLUFS),
		"target":     targetLUFS,
	}, nil
}

// Measure 测量单首歌（前端在播放时按需调用）
func (s *LoudnessService) Measure(songID string) (map[string]any, error) {
	song, ok := s.lib.SongByID(songID)
	if !ok {
		return nil, fmt.Errorf("歌曲不存在: %s", songID)
	}
	if !s.mgr.Available() {
		return nil, fmt.Errorf("ffmpeg 不可用，无法测量响度")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	item, err := s.mgr.Measure(ctx, song)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"measured":   true,
		"integrated": item.Integrated,
		"truePeak":   item.TruePeak,
		"lra":        item.LRA,
	}, nil
}

// MeasureAll 后台测量整个曲库（异步，进度通过 loudness:progress 事件推送）
func (s *LoudnessService) MeasureAll() map[string]any {
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

// GainMap 返回「songId → 补偿增益 dB」映射，供前端批量套用
func (s *LoudnessService) GainMap(targetLUFS float64) map[string]float64 {
	if targetLUFS == 0 {
		targetLUFS = -16
	}
	out := map[string]float64{}
	for _, song := range s.lib.Songs() {
		if g, ok := s.mgr.GainFor(song, targetLUFS); ok {
			out[song.ID] = g
		}
	}
	return out
}

// AlbumGains 返回按专辑聚合的补偿增益（「整张专辑统一」模式）
func (s *LoudnessService) AlbumGains(targetLUFS float64) map[string]float64 {
	if targetLUFS == 0 {
		targetLUFS = -16
	}
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
		if g, ok := s.mgr.AlbumGainDB(name, targetLUFS); ok {
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
	app *application.App
}

// NewWindowService 构造服务（app 由 main 在创建应用后注入）
func NewWindowService() *WindowService {
	return &WindowService{}
}

func (s *WindowService) current() *application.WebviewWindow {
	if s.app == nil {
		return nil
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
	switch runtime.GOOS {
	case "windows":
		return exec.Command("explorer", path).Start()
	case "darwin":
		return exec.Command("open", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
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
		case "animations":
			c.Animations = asBool(raw, c.Animations)
		case "accentFromCover":
			c.AccentFromCover = asBool(raw, c.AccentFromCover)
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
				if len(out) > 0 {
					c.LyricsSources = out
				}
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
