package main

import (
	"musicplayer/internal/bilibili"
	"musicplayer/internal/bootstrap"
	"musicplayer/internal/coverfetch"
	"musicplayer/internal/lyricsfetch"
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
