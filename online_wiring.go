package main

import (
	"context"
	"time"

	"localmusicplayer/internal/bilibili"
	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/coverfetch"
	"localmusicplayer/internal/lyricsfetch"
)

// newOnlineService 装配在线能力：音频/歌词/封面。
//
// 三个聚合器各自独立成包（bilibili / lyricsfetch / coverfetch），
// 因为它们依赖的都是「会变的第三方公开接口」：某个源失效时只改对应那个包。
func newOnlineService(store *bootstrap.Store, client *bilibili.Client) *OnlineService {
	return NewOnlineService(
		store,
		client,
		lyricsfetch.NewAggregator(),
		coverfetch.New(),
	)
}

// newLyricsMatcher 把在线歌词聚合器适配成 LyricsService 需要的匹配接口。
//
// 为什么不直接让 LyricsService 依赖 lyricsfetch：LyricsService 属于「本地歌词」
// 这一层（内嵌 / .lrc / 缓存），在线匹配是可选的增强能力。中间隔一层接口之后，
// 关掉在线能力（或者注入一个假的来做测试）都不需要改 LyricsService。
func newLyricsMatcher(svc *OnlineService) LyricsMatcher {
	return &onlineLyricsMatcher{svc: svc}
}

type onlineLyricsMatcher struct{ svc *OnlineService }

// Match 在线自动匹配一首歌的歌词。
//
// 标题/歌手都要传给聚合器（不能只给关键词）：评分逻辑靠 Title/Artist 做
// 实体对齐，只给 Keyword 会让所有候选都拿到「信息不足」的基础分，
// 于是「翻唱版」「Live 版」很容易被选成第一名。
func (m *onlineLyricsMatcher) Match(ctx context.Context, title, artist string, durationMS int64) (string, string, string, string, error) {
	if m == nil || m.svc == nil || m.svc.lyrics == nil {
		return "", "", "", "", nil
	}
	// LyricsService 已经整形+清洗过一轮（cleanMetaFor），这里再兜一次：
	// 直接调用本适配器（不经过 LyricsService）时也要拿到干净的元数据。
	// cleanMeta 内部有「够干净就不调用 AI」的判断与结果缓存，重复调用接近零成本。
	title, artist = sanitizeLyricsMeta(title, artist)
	title, artist, _ = m.svc.cleanMeta(title, artist, "")
	title, artist = sanitizeLyricsMeta(title, artist)
	if title == "" {
		return "", "", "", "", nil
	}
	cctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	res, err := m.svc.lyrics.Match(cctx, lyricsfetch.SearchRequest{
		Title:    title,
		Artist:   artist,
		Duration: durationMS,
		Limit:    12,
	})
	if err != nil {
		return "", "", "", "", err
	}
	return res.LRC, res.Provider, res.Candidate.Title, res.Candidate.Artist, nil
}
