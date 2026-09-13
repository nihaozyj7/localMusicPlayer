// Package coverfetch 联网获取歌曲封面，并在多个公开图源之间做主备切换。
//
// 为什么单独成为一个包：
//
//	封面来源全部是第三方公开接口（iTunes / Deezer / MusicBrainz+Cover Art
//	Archive / 网易云 / 哔哩哔哩…），它们的地址、参数和可用性都会随时变化。
//	把「怎么从第 N 个站点拿封面」全部收在这个包里，上游（services_online.go）
//	只依赖 Aggregator.Find 一个方法，将来某个源失效时只需要改/删一个文件，
//	不会牵动业务代码。
//
// 使用约定：
//   - 每个来源实现 Provider 接口；
//   - Aggregator 并发查询所有来源，取得分最高的一张图（封面不要求太精确，
//     所以只做轻量打分，不做逐像素比对）；
//   - 一定要经过 Aggregator.Image 下载，不要直接让 WebView 去加载外链：
//     前端 CSP 是 img-src 'self' data:，第三方图片本来就会被拦掉。
package coverfetch

import (
	"context"
	"errors"
	"strings"
)

// ErrNotFound 表示所有来源都没有拿到封面。
var ErrNotFound = errors.New("没有找到封面")

// Request 描述要寻找封面的一首歌。
type Request struct {
	Title  string
	Artist string
	Album  string
	// Duration 毫秒；部分来源（Deezer / iTunes）可以用它做更准的匹配。
	Duration int64
	// FallbackURL 已知的候选封面（例如在线歌曲搜索结果里自带的视频封面）。
	// 它排在所有联网来源之后：联网来源能给出更"像专辑封面"的图。
	FallbackURL string
}

// Normalize 去掉首尾空白，便于比较与做缓存键。
func (r Request) Normalize() Request {
	r.Title = strings.TrimSpace(r.Title)
	r.Artist = strings.TrimSpace(r.Artist)
	r.Album = strings.TrimSpace(r.Album)
	r.FallbackURL = strings.TrimSpace(r.FallbackURL)
	return r
}

// Keyword 返回给搜索型来源用的关键词。
func (r Request) Keyword() string {
	parts := make([]string, 0, 2)
	if r.Title != "" {
		parts = append(parts, r.Title)
	}
	// 标题里常常已经带了歌手，重复拼接反而会拉低搜索命中率
	if r.Artist != "" && !strings.Contains(strings.ToLower(r.Title), strings.ToLower(r.Artist)) {
		parts = append(parts, r.Artist)
	}
	return strings.Join(parts, " ")
}

// Empty 判断这次请求是否完全没信息可查。
func (r Request) Empty() bool {
	return r.Title == "" && r.Artist == "" && r.Album == "" && r.FallbackURL == ""
}

// Cover 一张可用的封面图。
type Cover struct {
	// URL 图片地址；前端不直接使用，只作为后端代理的入参。
	URL string
	// Provider 来源标识（itunes / deezer / musicbrainz / netease / fallback…）。
	Provider string
	// MIME 已知的内容类型，未知时为空。
	MIME string
	// Width/Height 已知尺寸，未知时为 0。
	Width  int
	Height int
	// Score 匹配度，越大越可信（仅用于排序，不对外承诺具体数值）。
	Score int
}

// Valid 判断这张封面是否可用。
func (c Cover) Valid() bool { return strings.TrimSpace(c.URL) != "" }

// Provider 一个封面来源。
//
// 约定：
//   - 拿不到就返回 FindResult{}（不要返回 error），err 只用于真正的故障；
//   - ctx 已经带了超时，Provider 内部不需要再套一层长超时；
//   - 不要在 Provider 里下载图片，那是 Aggregator.Image 的职责。
type Provider interface {
	// Name 来源标识，小写英文。
	Name() string
	// Find 查询一首歌的封面。
	Find(ctx context.Context, req Request) (FindResult, error)
}

// FindResult 单个来源的查询结果。
type FindResult struct {
	Cover Cover
	// Candidates 该来源返回的全部候选（按可信度降序），用于需要备选时回退。
	Candidates []Cover
}

// ImageData 一次下载到的图片数据。
type ImageData struct {
	Body        []byte
	ContentType string
	// URL 实际命中的图片地址（可能是重定向后的）。
	URL string
}
