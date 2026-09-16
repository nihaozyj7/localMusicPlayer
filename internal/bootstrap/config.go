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
	"sync/atomic"
	"time"

	"musicplayer/internal/lyrics"
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
	// CoverURL 是同源封面地址（形如 /cover/<内容hash>.jpg?t=…），指向封面缓存
	// 目录里的内容寻址文件。
	//
	// 为什么本地歌曲走 URL 而不是 Cover 里的 base64：内嵌封面平均 143KB，
	// base64 后还会膨胀 1/3 —— 整库塞进列表接口意味着 5,000 首约 484MB 的 IPC
	// 载荷（每次 scan:done 都要重来一遍，含文件夹监听触发的增量重扫）。
	// 给 URL 之后列表载荷只剩几十字节/首，图片由浏览器按 immutable 长缓存按需取，
	// 同一张封面只下载一次。Cover 字段保留给仍需要内嵌 data URL 的场景（在线曲目）。
	CoverURL string `json:"coverUrl,omitempty"`
	ModTime  int64  `json:"-"` // 仅用于元数据缓存判定
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
	Theme      string `json:"theme"`
	ThemeMode  string `json:"themeMode"` // dark | light | system
	GlassBlur  int    `json:"glassBlur"`
	GlassAlpha int    `json:"glassAlpha"`
	// NativeBackdrop 窗口原生材质：off | auto | mica | acrylic | tabbed。
	// 只有 Windows 会用得上，且必须在创建窗口时指定，改了要重启应用。
	NativeBackdrop string `json:"nativeBackdrop"`
	// WindowCorners 主窗口圆角：system | round | small | square（见 NormalizeWindowCorners）。
	// 同样是 Windows 11 的能力，但它改的是运行期可写的 DWM 属性，改完立刻生效、不用重启。
	WindowCorners string `json:"windowCorners"`
	Animations    bool   `json:"animations"`
	// AnimationsSpeed 界面过渡速度：fast（0.25s）| medium（0.5s）| slow（0.75s）。
	// 前端把它换算成 --dur 令牌，全站动效（含各种弹出层）都从这一个令牌取值。
	AnimationsSpeed string `json:"animationsSpeed"`
	AccentFromCover bool   `json:"accentFromCover"`
	ShowAlbumColumn bool   `json:"showAlbumColumn"`
	ShowLyrics      bool   `json:"showLyrics"`

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

	// —— 响度均衡 ——
	// 注意：这三个字段以前只存在前端的 localStorage 里，后端不认识，
	// 于是「设置里改了均衡模式 → 重启后又变回关闭」。它们必须落盘。
	LoudnessMode   string  `json:"loudnessMode"`   // off | track | album
	LoudnessTarget float64 `json:"loudnessTarget"` // 目标整合响度 LUFS
	LoudnessLimit  bool    `json:"loudnessLimit"`  // 真峰值保护

	// —— 在线功能 ——
	// DownloadDir 在线歌曲下载的保存目录。默认是系统「音乐」目录下的 downloads。
	DownloadDir string `json:"downloadDir"`
	// OnlineCover 是否联网为在线歌曲抓取封面（多来源，见 internal/coverfetch）。
	OnlineCover bool `json:"onlineCover"`
	// EmbedMeta 是否把抓到的封面/歌词写回歌曲文件自身的标签。
	// 默认关闭：写标签会改写用户的音乐文件，必须是用户明确开启的行为。
	// 关闭时封面与歌词仍然可用，只是放在缓存目录里（见 internal/metacache）。
	EmbedMeta bool `json:"embedMeta"`

	// —— 交互 ——
	// RowClickAction 单击歌曲行的行为（与前端 settings.js 的 ROW_CLICK_ACTIONS 一一对应）：
	//   play      —— 播放：播这一首，并把它加进播放列表（不动现有列表）
	//   play-list —— 播放当前列表：播这一首，并用当前整个列表替换播放队列
	//   next      —— 下一首播放：插到当前歌曲后面（默认，不打断当前播放）
	RowClickAction string `json:"rowClickAction"`
	// ResumeProgress 是否保留歌曲播放进度：打开后退出应用会记住每首歌播到哪儿，
	// 下次打开回到那个位置（只恢复进度条，不会自动播放）。
	// 每首歌的具体位置由前端随快照存在本地（localStorage），后端只保存这个开关。
	ResumeProgress bool `json:"resumeProgress"`
	// RememberVolume 是否记住上次的音量：关闭后每次启动都用默认音量。
	RememberVolume bool `json:"rememberVolume"`
	// ListDensity 列表密度：compact | cozy | roomy。
	// 原来每张表头各有一个密度按钮，现在统一到设置里，对所有列表生效。
	ListDensity string `json:"listDensity"`

	// MinimizeToTray 点窗口关闭按钮时「最小化到系统托盘」而不是退出应用。
	//
	// 关闭行为在主窗口的 WindowClosing **钩子**里判断（见 main.go）：钩子比
	// 监听器先跑，取消事件就能让 Wails 内建的「关窗 = 销毁窗口」不发生。
	// 托盘图标由 WindowService 按同一个开关创建 / 销毁（见 services.go#ensureTray）。
	MinimizeToTray bool `json:"minimizeToTray"`

	// —— 封面取色（cover-dark 主题）——
	// CoverSeed / CoverSeed2 是上一次从封面里提取得出的主色（十六进制）。
	//
	// 为什么要落盘：主题是在页面脚本跑起来之后才套用的，而取色还要等封面
	// 图片解码完 —— 于是「启动 → 先用主题里写死的占位灰 → 取完色再整体重绘」，
	// 肉眼看就是先黑一下、颜色还偏灰。把上次的取色结果记下来，Go 侧就能在
	// 页面首屏之前把它写进 <html>，首帧直接就是对的颜色（见 early_theme.go）。
	CoverSeed  string `json:"coverSeed"`
	CoverSeed2 string `json:"coverSeed2"`

	// ShowDesktopLyrics 是否显示桌面歌词（独立透明置顶窗口）。
	ShowDesktopLyrics bool `json:"showDesktopLyrics"`
	// DesktopLyricsX / DesktopLyricsY 桌面歌词窗口**上次被拖到哪儿**
	// （DIP 逻辑像素，与窗口 Position() 同一坐标系）。
	//
	// 为什么必须记：这个窗口的拖拽是系统级的（CSS --wails-draggable），
	// JS 收不到任何拖拽事件，窗口一销毁位置就彻底丢了 ——
	// 表现就是「每次启动都跑回屏幕底部中间，每次都要重拖」。
	//
	// 用 -1 表示「没存过」：0 是合法坐标（副屏在主屏左侧时 X 就是负的，
	// 而 0 是常见位置），不能拿 0 当哨兵值。
	DesktopLyricsX int `json:"desktopLyricsX"`
	DesktopLyricsY int `json:"desktopLyricsY"`
	// ShowDesktopWallpaper 是否显示桌面背景歌词（铺满桌面、压在桌面图标之下的
	// 壁纸层窗口，见 desktop_wallpaper.go）。
	//
	// 与 ShowDesktopLyrics 是**二选一**：两者都在回答同一个问题「歌词放在桌面的
	// 哪儿」，同时开着既是双份资源，视觉上也是两条歌词叠在一起。互斥由
	// WindowService.setDesktopMode 单点保证，配置里同时为 true 时以 wallpaper 优先
	// （见 main.go 的启动恢复）。
	ShowDesktopWallpaper bool `json:"showDesktopWallpaper"`
	// SleepAfterSong 定时停止的「播放完歌曲（延长到歌曲播放结束）」选项。
	//
	// 打开后：倒计时到点时**不立刻暂停**，而是等当前这首播完再停。
	// 这是「睡眠定时」的常见语义 —— 用户想听到正在听的这首结束，
	// 而不是在副歌中间被掐掉。
	SleepAfterSong bool `json:"sleepAfterSong"`
	// ShuffleMode 随机播放行为：reshuffle | once。
	ShuffleMode string `json:"shuffleMode"`

	// —— 封面轮播（播放详情页）——
	// CoverCarousel 是否轮播多张封面。
	// 刻意做成**全局偏好**而不是每首一份：一首歌有几张封面是数据，
	// 「要不要轮着看」是习惯；放进每首歌里会出现「这首开、那首关」，
	// 用户根本记不住自己在哪首开的。
	CoverCarousel bool `json:"coverCarousel"`
	// CoverCarouselInterval 轮播间隔（秒），下限 2 秒，默认 10 秒。
	CoverCarouselInterval int `json:"coverCarouselInterval"`

	// —— AI 元数据清洗（设置 → AI 元数据）——
	AIBaseURL  string `json:"aiBaseUrl"`
	AIAPIKey   string `json:"aiApiKey"`
	AIThinking bool   `json:"aiThinking"`
	AIModelID  string `json:"aiModelId"`
	// AIVendor 模型类型（厂商）。思考模式的开关字段各家不同
	// （reasoning_effort / thinking / enable_thinking / reasoning …），
	// 必须知道调的是哪家才能发出正确的请求体；auto = 按接口地址与模型名猜。
	// 取值见 ai_vendor.go 的 aiVendorCatalog。
	AIVendor string `json:"aiVendor"`
	// AILyricsClean 自动匹配歌词时，是否先用 AI 清洗元数据。
	//
	// AI 清洗能明显提高脏文件名的歌词命中率，但一次调用要 8~18 秒，
	// 而歌词自动匹配发生在每次切歌的路径上 —— 所以必须给用户一个开关，
	// 让他在「命中率」与「等待时间」之间自己选。
	AILyricsClean bool `json:"aiLyricsClean"`

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
   窗口原生材质
   -------------------------------------------------------------------------- */

// BackdropModes 窗口原生材质可选值（与 Wails 的 BackdropType 对应）。
// 仅 Windows 支持：Mica / Tabbed 需要 Windows 11 Build 22621+，
// 更低的系统会被 Wails 退化成一层的背景模糊。
var BackdropModes = []string{"off", "auto", "mica", "acrylic", "tabbed"}

// ValidBackdropMode 判断材质值是否受支持
func ValidBackdropMode(mode string) bool {
	for _, m := range BackdropModes {
		if m == mode {
			return true
		}
	}
	return false
}

// NormalizeBackdropMode 规范化材质值：大小写/空格无关，非法值一律落回 off
func NormalizeBackdropMode(mode string) string {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if ValidBackdropMode(mode) {
		return mode
	}
	return "off"
}

/* --------------------------------------------------------------------------
   主窗口圆角
   -------------------------------------------------------------------------- */

// WindowCornerModes 主窗口圆角可选值。
//
// 为什么只有四档、没有「连续半径」：圆角是 DWM 画的，系统只给了
// DWMWA_WINDOW_CORNER_PREFERENCE 这一个开关（默认 / 圆角 / 小圆角 / 直角）。
// 想要任意像素的半径就得放弃系统外框（阴影 + 抗锯齿圆角）自己画，
// 那是另一个量级的改动，这里不碰。
var WindowCornerModes = []string{"system", "round", "small", "square"}

// NormalizeWindowCorners 规范化圆角值：大小写/空格无关，非法值落回 system。
func NormalizeWindowCorners(mode string) string {
	mode = strings.ToLower(strings.TrimSpace(mode))
	for _, m := range WindowCornerModes {
		if m == mode {
			return mode
		}
	}
	return "system"
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
		NativeBackdrop:  "off",
		WindowCorners:   "system",
		Animations:      true,
		AnimationsSpeed: "fast",
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
		// 歌词来源优先级：内嵌 → 同目录 .lrc → 本程序缓存 → 在线自动匹配。
		// 与 internal/lyrics.DefaultSources 保持一致；normalize() 会补齐缺项，
		// 因此从旧版本升级上来的配置也能拿到 cache 这一层。
		LyricsSources: []string{"embedded", "lrc-file", "cache", "online"},
		Folders:       []Folder{},
		FilterRules: []FilterRule{
			{ID: "rule_size", Type: "size", Op: "lt", Value: "10240", Unit: "B", Scope: "exclude", Enabled: true},
			{ID: "rule_mp4", Type: "regex", Op: "match", Value: `\.mp4$`, Scope: "exclude", Enabled: true},
		},
		LikedIDs:  []string{},
		Playlists: []Playlist{},
		DataDir:   dataDir,
		CacheDir:  filepath.Join(dataDir, "cache"),

		LoudnessMode:   "off",
		LoudnessTarget: -16,
		LoudnessLimit:  true,

		DownloadDir: DefaultDownloadDir(),
		OnlineCover: true,
		EmbedMeta:   false,

		RowClickAction: "next",
		// 默认开启：与加入这个开关之前「回到上次那首歌」的体验一致，
		// 只是把播放位置也一并恢复；不想要可以在设置里关掉。
		ResumeProgress: true,
		// 默认记住音量：与加入这个开关之前的行为一致，关掉即每次回到默认音量。
		RememberVolume: true,
		ListDensity:    "cozy",

		ShowDesktopLyrics:    false,
		DesktopLyricsX:       DesktopLyricsNoPos,
		DesktopLyricsY:       DesktopLyricsNoPos,
		ShowDesktopWallpaper: false,
		SleepAfterSong:       false,
		ShuffleMode:          "reshuffle",

		// 封面轮播默认关闭：多封面时才会有意义，用户明确打开才动
		CoverCarousel:         false,
		CoverCarouselInterval: 10,

		AIBaseURL:  "",
		AIAPIKey:   "",
		AIThinking: false,
		AIModelID:  "",
		// 默认自动识别；识别不出按 OpenAI 兼容处理
		AIVendor: "auto",
		// 默认开启：配置了 AI 的用户，自动匹配歌词时会先清洗元数据，
		// 与加入这个开关之前的行为一致（关掉即回到「只用本地整形」）。
		AILyricsClean: true,
	}
}

// CarouselIntervalBounds 轮播间隔的合法范围（秒）
const (
	MinCarouselInterval = 2
	MaxCarouselInterval = 300
)

// NormalizeCarouselInterval 把轮播间隔夹到 [2, 300] 秒，非法值落回 10 秒。
// 下限 2 秒是因为更快的轮播只会变成闪烁；上限 300 秒与定时停止的滑条量程一致。
func NormalizeCarouselInterval(seconds int) int {
	if seconds <= 0 {
		return 10
	}
	if seconds < MinCarouselInterval {
		return MinCarouselInterval
	}
	if seconds > MaxCarouselInterval {
		return MaxCarouselInterval
	}
	return seconds
}

// RowClickActions 单击歌曲行的可选行为
var RowClickActions = []string{"play", "play-list", "next"}

// NormalizeRowClickAction 规范化单击行为，非法值落回 next（默认不打断播放）
func NormalizeRowClickAction(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	for _, ok := range RowClickActions {
		if ok == v {
			return v
		}
	}
	return "next"
}

// ListDensities 列表密度可选值
var ListDensities = []string{"compact", "cozy", "roomy"}

// AnimationsSpeeds 界面过渡速度可选值（与前端 settings.js 的分段控件一一对应）。
// 默认 fast = 0.2s；medium / slow 分别是 0.35s / 0.5s。
var AnimationsSpeeds = []string{"fast", "medium", "slow"}

// NormalizeAnimationsSpeed 规范化过渡速度，非法值落回 fast（与历史默认 200ms 一致）。
func NormalizeAnimationsSpeed(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	for _, ok := range AnimationsSpeeds {
		if ok == v {
			return v
		}
	}
	return "fast"
}

// normalizeLyricsSources 规范化歌词来源优先级。
//
// 复用 internal/lyrics 里的同一份实现：设置界面展示的顺序、读取时真正用的顺序
// 必须是同一个真相，所以不能各写一遍。
func normalizeLyricsSources(sources []string) []string {
	return lyrics.NormalizeSources(sources)
}

// NormalizeListDensity 规范化列表密度，非法值落回 cozy
func NormalizeListDensity(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	for _, ok := range ListDensities {
		if ok == v {
			return v
		}
	}
	return "cozy"
}

// DefaultDownloadDir 在线歌曲的默认下载目录：系统「音乐」目录下的 downloads。
//
// 放在音乐目录里是有意的：下载下来的本来就是音乐文件，用户后续想把它加进曲库
// 只需要在选择文件夹时点一下「音乐」；而独立的 downloads 子目录又保证它
// 不会和用户自己整理好的曲库混在一起。
func DefaultDownloadDir() string {
	music := systemMusicDir()
	if music == "" {
		// 拿不到系统音乐目录时退到数据目录，至少保证有地方可写
		return filepath.Join(defaultDataDir(), "downloads")
	}
	return filepath.Join(music, "downloads")
}

// DownloadFolderID 下载目录作为扫描根时使用的固定 id。
//
// 它不出现在 config.Folders 里（用户在设置里看不到、也删不掉），
// 而是由 EffectiveFolders 每次动态拼进来 —— 这样「下载目录」始终只有一个
// 真相来源（DownloadDir），不会出现「改了下载路径但旧的还留在扫描列表里」。
const DownloadFolderID = "auto_downloads"

// EffectiveFolders 返回真正要扫描的文件夹列表 = 用户配置的文件夹 + 下载目录。
//
// 需求：「所有歌曲」要包含下载路径和用户要扫描的路径。下载目录由程序管理，
// 所以不能要求用户手动添加；同时要避免与用户手动添加的目录重复
// （用户完全可能把 Music 整个目录加进来，而下载目录就在它下面）。
//
// 用值接收者：调用点大多是 store.Get() 返回的临时副本（不可寻址）。
func (c Config) EffectiveFolders() []Folder {
	out := make([]Folder, 0, len(c.Folders)+1)

	downloadDir := cleanAbsPath(c.DownloadDir)
	downloadCovered := false
	for _, f := range c.Folders {
		path := cleanAbsPath(f.Path)
		if path == "" {
			continue
		}
		out = append(out, Folder{
			ID:       f.ID,
			Path:     f.Path,
			Status:   f.Status,
			Watching: f.Watching,
		})
		// 用户已经手动加了下载目录，或加了它的上级目录 → 不再重复添加
		if downloadDir != "" && (sameOrParent(path, downloadDir)) {
			downloadCovered = true
		}
	}
	if downloadDir == "" || downloadCovered {
		return out
	}
	out = append(out, Folder{
		ID:       DownloadFolderID,
		Path:     c.DownloadDir,
		Status:   "ok",
		Watching: false,
	})
	return out
}

func cleanAbsPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		abs = p
	}
	return strings.ToLower(filepath.Clean(abs))
}

// sameOrParent 判断 parent 是否是 child 本身或它的上级目录。
func sameOrParent(parent, child string) bool {
	if parent == child {
		return true
	}
	sep := string(filepath.Separator)
	return strings.HasPrefix(child, strings.TrimRight(parent, sep)+sep)
}

// systemMusicDir 返回系统「音乐」目录（Windows 走 shell 已知文件夹）。
func systemMusicDir() string {
	if dir := os.Getenv("MUSICPLAYER_MUSIC_DIR"); dir != "" {
		return dir
	}
	switch runtime.GOOS {
	case "windows":
		// %USERPROFILE%\Music 是 Windows 的默认音乐库路径。
		// 注册表里可以查到被用户改过的值，但读取注册表需要额外依赖，
		// 而且绝大多数机器上就是 UserProfile\Music，这里直接拼。
		if profile := os.Getenv("USERPROFILE"); profile != "" {
			return filepath.Join(profile, "Music")
		}
		return ""
	case "darwin":
		home, _ := os.UserHomeDir()
		if home == "" {
			return ""
		}
		return filepath.Join(home, "Music")
	default:
		// Linux: XDG 用户目录规范
		if home, err := os.UserHomeDir(); err == nil && home != "" {
			return filepath.Join(home, "Music")
		}
		return ""
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
	mu     sync.RWMutex
	cfg    *Config
	tmpSeq uint64 // 临时文件名序号，避免并发写互相覆盖
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
	// 手改配置写成 "Mica" / "MICA" 也算数；无法识别的值落回默认（off）
	cfg.NativeBackdrop = NormalizeBackdropMode(cfg.NativeBackdrop)
	// 圆角同理：认不出来就跟随系统
	cfg.WindowCorners = NormalizeWindowCorners(cfg.WindowCorners)
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
	} else {
		cfg.LyricsSources = normalizeLyricsSources(cfg.LyricsSources)
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
	if strings.TrimSpace(cfg.DownloadDir) == "" {
		cfg.DownloadDir = DefaultDownloadDir()
	}
	cfg.RowClickAction = NormalizeRowClickAction(cfg.RowClickAction)
	cfg.ListDensity = NormalizeListDensity(cfg.ListDensity)
	cfg.AnimationsSpeed = NormalizeAnimationsSpeed(cfg.AnimationsSpeed)
	if cfg.ShuffleMode != "once" {
		cfg.ShuffleMode = "reshuffle"
	}
	// 响度均衡：模式与目标值都要收敛到合法范围，避免手改配置写坏后
	// 前端拿到奇怪的值（例如 target=0 会让补偿算成 +16dB 的巨响）。
	switch cfg.LoudnessMode {
	case "off", "track", "album":
	default:
		cfg.LoudnessMode = def.LoudnessMode
	}
	if cfg.LoudnessTarget == 0 {
		cfg.LoudnessTarget = def.LoudnessTarget
	}
	if cfg.LoudnessTarget > -5 {
		cfg.LoudnessTarget = -5
	}
	if cfg.LoudnessTarget < -40 {
		cfg.LoudnessTarget = -40
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

	// 桌面歌词 / 桌面背景歌词是一组**单选**按钮。手改配置（或者从更早的版本
	// 升上来）把它们同时写成 true 时，这里就地收敛成「以背景歌词为准」——
	// 否则每次启动都会同时恢复两个消费资源的窗口，画面上还是两条歌词叠着。
	if cfg.ShowDesktopWallpaper && cfg.ShowDesktopLyrics {
		cfg.ShowDesktopLyrics = false
	}
}

// DesktopLyricsNoPos 表示「桌面歌词还没有位置存档」。
//
// 用 -1 而不是 0：0 是完全合法的窗口坐标（副屏在主屏左侧时 X 为负，
// 主屏左上角就是 0），拿 0 当哨兵会把「拖到左上角」误判成「没存过」。
const DesktopLyricsNoPos = -1

// DesktopLyricsPos 返回桌面歌词窗口的位置存档；ok=false 表示还没有存过。
//
// 把「有没有存过」和「坐标是多少」一起返回，调用方就不必各自记住
// -1 这个哨兵值的语义（少一处就少一处写错的机会）。
func (s *Store) DesktopLyricsPos() (int, int, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	x, y := s.cfg.DesktopLyricsX, s.cfg.DesktopLyricsY
	if x == DesktopLyricsNoPos && y == DesktopLyricsNoPos {
		return 0, 0, false
	}
	return x, y, true
}

// SetDesktopLyricsPos 记住桌面歌词窗口的位置。
func (s *Store) SetDesktopLyricsPos(x, y int) error {
	return s.Update(func(c *Config) {
		c.DesktopLyricsX = x
		c.DesktopLyricsY = y
	})
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
	// 不用 MarshalIndent：配置文件里可能包含全部歌单的 songIds（大曲库下是
	// 数万个字符串），缩进会明显放大序列化开销与文件体积，而这份文件是给程序
	// 读写的（人类手改是次要场景，且 JSON 本身已经够可读）。
	raw, err := json.Marshal(s.cfg)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	// 用带序号的临时文件：即使上一次写入残留了 .tmp，也不会互相覆盖
	tmp := fmt.Sprintf("%s.%d.tmp", s.cfg.ConfigPath, atomic.AddUint64(&s.tmpSeq, 1))

	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return fmt.Errorf("写入配置失败: %w", err)
	}

	// Windows 上 os.Rename 覆盖已存在文件时，若目标正被杀毒软件 / 索引器
	// 或另一个写者短暂占用，会返回 ERROR_SHARING_VIOLATION。
	// 这里做几次退避重试，避免「扫描回写文件夹状态」这种后台写入偶发失败。
	var lastErr error
	for attempt := 0; attempt < 8; attempt++ {
		if err := os.Rename(tmp, s.cfg.ConfigPath); err == nil {
			return nil
		} else {
			lastErr = err
		}
		time.Sleep(time.Duration(5*(attempt+1)) * time.Millisecond)
	}

	// 兜底：直接覆盖写入。会有极短的「非原子」窗口，但比整个操作失败更可取。
	if err := os.WriteFile(s.cfg.ConfigPath, raw, 0o644); err == nil {
		_ = os.Remove(tmp)
		return nil
	}

	_ = os.Remove(tmp)
	return fmt.Errorf("替换配置失败: %w", lastErr)
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
