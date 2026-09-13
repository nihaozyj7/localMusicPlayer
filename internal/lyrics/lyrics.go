// Package lyrics 负责歌词获取。
//
// 来源优先级（可在设置界面调整顺序）：
//  1. embedded  音频内嵌歌词（ID3 USLT / MP4 ©lyr / Vorbis LYRICS）
//  2. lrc-file  同名 .lrc 文件（支持 song.lrc / song.zh.lrc）
//  3. cache     本程序的歌词缓存（用户手动匹配或自动匹配过的结果）
//  4. online    在线自动匹配（由上层调用 lyricsfetch，本包只负责「要不要试」）
//
// 返回内容统一为 LRC 文本，由前端 utils.js#parseLrc 解析时间轴。
//
// 为什么要加 cache 这一层：用户手动匹配到歌词之后，如果只放在前端内存里，
// 下次打开应用就没了（这是实测到的问题）。缓存目录才是持久真源，
// 因此读取链里必须有它，写入则统一走 Save。
package lyrics

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dhowden/tag"
)

// Result 歌词加载结果
type Result struct {
	LRC    string `json:"lrc"`
	Source string `json:"source"` // embedded | lrc-file | cache | online | none
	// Title/Artist 命中的在线候选（source=online 时才有值，供界面显示「匹配到的是哪首」）
	Title  string `json:"title,omitempty"`
	Artist string `json:"artist,omitempty"`
}

// Source 常量（与设置里的 LyricsSources 取值一一对应）
const (
	SourceEmbedded = "embedded"
	SourceLRCFile  = "lrc-file"
	SourceCache    = "cache"
	SourceOnline   = "online"
	SourceNone     = "none"
)

// DefaultSources 默认优先级。
//
// 内嵌歌词排第一：它是跟着文件走的，用户换机器、换播放器都还在，
// 可信度也最高（是这首歌打包时自带的）。同名 .lrc 第二（用户自己放的），
// 缓存第三（本程序之前匹配/保存的），在线最后（最不确定，也最慢）。
var DefaultSources = []string{SourceEmbedded, SourceLRCFile, SourceCache, SourceOnline}

// NormalizeSources 把配置里的来源列表规范化：去掉未知项与重复项。
//
// 唯一的「补项」是把 cache 插进列表（老配置里没有这一层，
// 不补的话升级上来的用户永远读不到自己之前匹配过的歌词）。
// 其余来源**不会**被自动加回来 —— 用户如果把 online 从列表里去掉，
// 那就是「只要本地歌词、不联网」，这个意图必须被尊重。
// 列表整个为空时落回 DefaultSources。
func NormalizeSources(sources []string) []string {
	known := map[string]bool{
		SourceEmbedded: true, SourceLRCFile: true, SourceCache: true, SourceOnline: true,
	}
	out := make([]string, 0, len(DefaultSources))
	seen := map[string]bool{}
	for _, s := range sources {
		s = strings.TrimSpace(strings.ToLower(s))
		if !known[s] || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	if len(out) == 0 {
		return append([]string(nil), DefaultSources...)
	}
	if seen[SourceCache] {
		return out
	}
	// cache 插在 online 之前（在线的代价最高，本地缓存应当先试）
	at := len(out)
	for i, s := range out {
		if s == SourceOnline {
			at = i
			break
		}
	}
	out = append(out, "")
	copy(out[at+1:], out[at:])
	out[at] = SourceCache
	return out
}

// Cache 歌词缓存的读取钩子（由 metacache.Store 提供）。
//
// 用函数而不是接口：调用方只需要「按 id 拿一段文本」这一件事，
// 传函数可以让 lyrics 包完全不依赖缓存实现（也方便测试）。
type Cache func(songID string) (string, bool)

// Load 按优先级加载歌词。
//
//	cache 可以为 nil（没有缓存层时自动跳过）。
func Load(songID, audioPath string, sources []string, cache Cache) Result {
	sources = NormalizeSources(sources)
	for _, src := range sources {
		switch src {
		case SourceEmbedded:
			if text, ok := readEmbedded(audioPath); ok {
				return Result{LRC: text, Source: SourceEmbedded}
			}
		case SourceLRCFile:
			if text, ok := readLRCFile(audioPath); ok {
				return Result{LRC: text, Source: SourceLRCFile}
			}
		case SourceCache:
			if cache != nil {
				if text, ok := cache(songID); ok {
					return Result{LRC: text, Source: SourceCache}
				}
			}
		case SourceOnline:
			// 在线匹配需要网络，不能在这里同步做：本函数会在「播放一首歌」时
			// 被直接调用，联网等待会把界面卡住。这里只是「这一个来源没有本地结果」，
			// 由上层（LyricsService.Load 之后 / AutoMatch）决定要不要联网。
			continue
		}
	}
	return Result{LRC: "", Source: SourceNone}
}

// WantOnline 判断配置里是否允许在线匹配。
func WantOnline(sources []string) bool {
	for _, s := range NormalizeSources(sources) {
		if s == SourceOnline {
			return true
		}
	}
	return false
}

// readLRCFile 找同名 .lrc
func readLRCFile(audioPath string) (string, bool) {
	dir := filepath.Dir(audioPath)
	base := strings.TrimSuffix(filepath.Base(audioPath), filepath.Ext(audioPath))

	candidates := []string{
		filepath.Join(dir, base+".lrc"),
		filepath.Join(dir, base+".LRC"),
	}
	// 形如 song.zh.lrc / song.chi.lrc 的翻译歌词也顺带支持
	if entries, err := os.ReadDir(dir); err == nil {
		prefix := strings.ToLower(base) + "."
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := strings.ToLower(e.Name())
			if strings.HasPrefix(name, prefix) && strings.HasSuffix(name, ".lrc") {
				candidates = append(candidates, filepath.Join(dir, e.Name()))
			}
		}
	}

	for _, c := range candidates {
		raw, err := os.ReadFile(c)
		if err != nil {
			continue
		}
		text := decodeText(raw)
		if strings.TrimSpace(text) != "" {
			return text, true
		}
	}
	return "", false
}

// readEmbedded 读内嵌歌词
func readEmbedded(audioPath string) (string, bool) {
	f, err := os.Open(audioPath)
	if err != nil {
		return "", false
	}
	defer f.Close()

	m, err := tag.ReadFrom(f)
	if err != nil {
		return "", false
	}
	// dhowden/tag 把非标准字段放进 Raw()；常见键名大小写不一
	raw := m.Raw()
	for _, key := range []string{"lyrics", "LYRICS", "unsyncedlyrics", "UNSYNCEDLYRICS", "USLT", "lyric"} {
		if v, ok := raw[key]; ok {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return s, true
			}
		}
	}
	// 部分格式把歌词放在 Lyrics 字段
	if lyr := strings.TrimSpace(m.Lyrics()); lyr != "" {
		return lyr, true
	}
	return "", false
}

// decodeText 处理 BOM 与常见编码（LRC 多为 UTF-8，少数是 GBK；GBK 交给前端按需处理）
func decodeText(raw []byte) string {
	s := string(raw)
	s = strings.TrimPrefix(s, "\ufeff")
	return s
}

// Describe 便于日志输出
func Describe(r Result, audioPath string) string {
	return fmt.Sprintf("lyrics(%s): %s", r.Source, filepath.Base(audioPath))
}
