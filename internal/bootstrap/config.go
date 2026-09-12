// Package bootstrap 负责数据模型定义与配置持久化。
//
// 约定：本包中的结构体是前端与本地的唯一数据契约，
// 字段名必须与 frontend/src/js 下的读取字段保持一致（JSON tag 即字段名）。
package bootstrap

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

/* --------------------------------------------------------------------------
   数据模型（与前端 store.js / mock.js 字段一一对应）
   -------------------------------------------------------------------------- */

// Folder 一个被监听的本地音乐目录
type Folder struct {
	ID         string `json:"id"`
	Path       string `json:"path"`
	TrackCount int    `json:"trackCount"`
	Status     string `json:"status"` // ok | missing | denied
	Watching   bool   `json:"watching"`
	AddedAt    int64  `json:"addedAt"`
}

// Song 一首本地歌曲
type Song struct {
	ID         string `json:"id"`
	Path       string `json:"path"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	Album      string `json:"album"`
	Ext        string `json:"ext"`
	Duration   int64  `json:"duration"` // 毫秒
	Size       int64  `json:"size"`     // 字节
	SampleRate int    `json:"sampleRate"`
	Bitrate    int    `json:"bitrate"`
	AddedAt    int64  `json:"addedAt"`
	PlayCount  int    `json:"playCount"`
	Cover      string `json:"cover"` // data URL；无封面时为空字符串
	ModTime    int64  `json:"-"`     // 仅用于元数据缓存判定
}

// Playlist 歌单；「我喜欢」是受限歌单（Locked=true，不可删除）
type Playlist struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Locked    bool     `json:"locked"`
	Builtin   bool     `json:"builtin"`
	SongIDs   []string `json:"songIds"`
	CreatedAt int64    `json:"createdAt"`
}

// FilterRule 过滤规则，语义与前端 store.js#matchRules 完全一致：
//   - exclude 命中即排除（优先）
//   - 存在启用的 include 规则时，必须至少命中一条才保留
type FilterRule struct {
	ID      string `json:"id"`
	Type    string `json:"type"`  // size | regex
	Op      string `json:"op"`    // size: lt|lte|gt|gte|eq   regex: match
	Value   string `json:"value"` // size: 数字   regex: 正则源码
	Unit    string `json:"unit"`  // B | KB | MB | GB
	Scope   string `json:"scope"` // exclude | include
	Enabled bool   `json:"enabled"`
}

// CustomTheme 用户自定义主题的元信息（CSS 内容按需读取，不常驻内存）
type CustomTheme struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Mode    string   `json:"mode"` // dark | light
	Swatch  []string `json:"swatch"`
	Builtin bool     `json:"builtin"`
}

// Config 应用配置（落盘为 JSON，可直接手改）
type Config struct {
	Theme        string `json:"theme"`
	ThemeMode    string `json:"themeMode"` // dark | light | system
	GlassBlur    int    `json:"glassBlur"`
	GlassAlpha   int    `json:"glassAlpha"`
	Animations   bool   `json:"animations"`
	AccentFromCover bool `json:"accentFromCover"`
	ShowAlbumColumn bool `json:"showAlbumColumn"`
	ShowLyrics      bool `json:"showLyrics"`

	PlayMode       string  `json:"playMode"` // sequence | loop-all | loop-one | shuffle
	Volume         float64 `json:"volume"`
	Muted          bool    `json:"muted"`
	PlayerViewMode string  `json:"playerViewMode"` // classic | immersive | minimal

	AutoScanOnStart bool `json:"autoScanOnStart"`
	WatchFolders    bool `json:"watchFolders"`
	ScanConcurrency int  `json:"scanConcurrency"`

	LyricsFontSize int      `json:"lyricsFontSize"`
	LyricsLines    int      `json:"lyricsLines"`
	LyricsSources  []string `json:"lyricsSources"`

	Folders     []Folder     `json:"folders"`
	FilterRules []FilterRule `json:"filterRules"`
	LikedIDs    []string     `json:"likedIds"`
	Playlists   []Playlist   `json:"playlists"`

	CacheDir string `json:"cacheDir"`

	// 运行时字段，不落盘
	ConfigPath string `json:"-"`
	DataDir    string `json:"-"`
}

/* --------------------------------------------------------------------------
   默认值
   -------------------------------------------------------------------------- */

// DefaultConfig 返回内置默认配置
func DefaultConfig() *Config {
	dataDir := defaultDataDir()
	return &Config{
		Theme:           "dark-minimal",
		ThemeMode:       "dark",
		GlassBlur:       22,
		GlassAlpha:      62,
		Animations:      true,
		ShowAlbumColumn: true,
		ShowLyrics:      true,
		PlayMode:        "sequence",
		Volume:          0.8,
		PlayerViewMode:  "classic",
		AutoScanOnStart: true,
		WatchFolders:    true,
		ScanConcurrency: 4,
		LyricsFontSize:  16,
		LyricsLines:     7,
		LyricsSources:   []string{"lrc-file", "embedded", "online"},
		Folders:         []Folder{},
		FilterRules: []FilterRule{
			{ID: "rule_size", Type: "size", Op: "lt", Value: "10240", Unit: "B", Scope: "exclude", Enabled: true},
			{ID: "rule_mp4", Type: "regex", Op: "match", Value: `\.mp4$`, Scope: "exclude", Enabled: true},
		},
		LikedIDs:  []string{},
		Playlists: []Playlist{},
		DataDir:   dataDir,
		CacheDir:  filepath.Join(dataDir, "cache"),
	}
}

func defaultDataDir() string {
	if dir := os.Getenv("MUSICPLAYER_DATA_DIR"); dir != "" {
		return dir
	}
	switch runtime.GOOS {
	case "windows":
		base := os.Getenv("APPDATA")
		if base == "" {
			base = os.Getenv("LOCALAPPDATA")
		}
		if base == "" {
			base = "."
		}
		return filepath.Join(base, "MusicPlayer")
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "MusicPlayer")
	default:
		if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
			return filepath.Join(xdg, "musicplayer")
		}
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".config", "musicplayer")
	}
}

/* --------------------------------------------------------------------------
   读写
   -------------------------------------------------------------------------- */

// Store 配置存储，带读写锁
type Store struct {
	mu  sync.RWMutex
	cfg *Config
}

// NewStore 加载配置；文件不存在或损坏时落回默认值（不会覆盖坏文件，先备份）
func NewStore() (*Store, error) {
	cfg := DefaultConfig()
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建数据目录失败: %w", err)
	}
	cfg.ConfigPath = filepath.Join(cfg.DataDir, "config.json")

	if raw, err := os.ReadFile(cfg.ConfigPath); err == nil {
		parsed := DefaultConfig()
		parsed.DataDir = cfg.DataDir
		parsed.ConfigPath = cfg.ConfigPath
		if err := json.Unmarshal(raw, parsed); err != nil {
			backup := cfg.ConfigPath + ".broken"
			_ = os.WriteFile(backup, raw, 0o644)
			fmt.Fprintf(os.Stderr, "[config] 解析失败，已备份到 %s：%v\n", backup, err)
		} else {
			cfg = parsed
			cfg.DataDir = parsed.DataDir
			cfg.ConfigPath = parsed.ConfigPath
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("读取配置失败: %w", err)
	}

	normalize(cfg)
	s := &Store{cfg: cfg}
	if err := s.Save(); err != nil {
		return nil, err
	}
	return s, nil
}

// normalize 补齐空值、规范化路径，保证前端拿到的字段总是可用的
func normalize(cfg *Config) {
	def := DefaultConfig()

	if cfg.Theme == "" {
		cfg.Theme = def.Theme
	}
	if cfg.ThemeMode == "" {
		cfg.ThemeMode = def.ThemeMode
	}
	if cfg.GlassBlur <= 0 {
		cfg.GlassBlur = def.GlassBlur
	}
	if cfg.GlassAlpha <= 0 {
		cfg.GlassAlpha = def.GlassAlpha
	}
	if cfg.ScanConcurrency <= 0 {
		cfg.ScanConcurrency = def.ScanConcurrency
	}
	if cfg.LyricsFontSize <= 0 {
		cfg.LyricsFontSize = def.LyricsFontSize
	}
	if cfg.LyricsLines <= 0 {
		cfg.LyricsLines = def.LyricsLines
	}
	if len(cfg.LyricsSources) == 0 {
		cfg.LyricsSources = def.LyricsSources
	}
	if cfg.PlayMode == "" {
		cfg.PlayMode = def.PlayMode
	}
	if cfg.PlayerViewMode == "" {
		cfg.PlayerViewMode = def.PlayerViewMode
	}
	if cfg.Volume < 0 || cfg.Volume > 1 {
		cfg.Volume = def.Volume
	}
	if cfg.DataDir == "" {
		cfg.DataDir = def.DataDir
	}
	if cfg.CacheDir == "" {
		cfg.CacheDir = filepath.Join(cfg.DataDir, "cache")
	}
	if cfg.Folders == nil {
		cfg.Folders = []Folder{}
	}
	if cfg.Playlists == nil {
		cfg.Playlists = []Playlist{}
	}
	if cfg.LikedIDs == nil {
		cfg.LikedIDs = []string{}
	}
	if cfg.FilterRules == nil {
		cfg.FilterRules = def.FilterRules
	}

	for i := range cfg.Folders {
		cfg.Folders[i].Path = filepath.Clean(cfg.Folders[i].Path)
		if cfg.Folders[i].Status == "" {
			cfg.Folders[i].Status = "ok"
		}
	}
	for i := range cfg.Playlists {
		if cfg.Playlists[i].SongIDs == nil {
			cfg.Playlists[i].SongIDs = []string{}
		}
	}
}

// Get 返回配置快照（浅拷贝外壳 + 深拷贝切片，避免调用方改到内部状态）
func (s *Store) Get() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := *s.cfg
	out.Folders = append([]Folder(nil), s.cfg.Folders...)
	out.FilterRules = append([]FilterRule(nil), s.cfg.FilterRules...)
	out.Playlists = make([]Playlist, len(s.cfg.Playlists))
	for i, p := range s.cfg.Playlists {
		p.SongIDs = append([]string(nil), p.SongIDs...)
		out.Playlists[i] = p
	}
	out.LikedIDs = append([]string(nil), s.cfg.LikedIDs...)
	out.LyricsSources = append([]string(nil), s.cfg.LyricsSources...)
	return out
}

// Update 在写锁内修改配置并落盘
func (s *Store) Update(fn func(cfg *Config)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(s.cfg)
	normalize(s.cfg)
	return s.saveLocked()
}

// Save 落盘
func (s *Store) Save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked()
}

func (s *Store) saveLocked() error {
	raw, err := json.MarshalIndent(s.cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}
	tmp := s.cfg.ConfigPath + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return fmt.Errorf("写入配置失败: %w", err)
	}
	if err := os.Rename(tmp, s.cfg.ConfigPath); err != nil {
		return fmt.Errorf("替换配置失败: %w", err)
	}
	return nil
}

// Path 返回配置文件路径
func (s *Store) Path() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg.ConfigPath
}

// DataDir 返回数据目录
func (s *Store) DataDir() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg.DataDir
}

// Playlist 按 id 取歌单
func (s *Store) Playlist(id string) (Playlist, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.cfg.Playlists {
		if p.ID == id {
			return p, true
		}
	}
	return Playlist{}, false
}

// ExpandPath 展开 %VAR% 与 ~ 之类的路径写法
func ExpandPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return p
	}
	if strings.HasPrefix(p, "~") {
		if home, err := os.UserHomeDir(); err == nil {
			p = filepath.Join(home, strings.TrimPrefix(strings.TrimPrefix(p, "~"), string(os.PathSeparator)))
		}
	}
	return filepath.Clean(os.ExpandEnv(p))
}
