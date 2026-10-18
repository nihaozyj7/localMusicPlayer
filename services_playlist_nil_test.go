package main

import (
	"encoding/json"
	"strings"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

/* ==========================================================================
   歌单列表的 JSON 形状
   --------------------------------------------------------------------------
   绑定层把 Go 的 nil 切片序列化成 null，而前端对 songs / songIds 这类列表是
   「Array.isArray(x) 才更新状态」—— null 会被当成「这次没拿到数据」，
   于是清空「我喜欢」后界面上原来那些歌还在（第 19 条约定）。

   修法在 PlaylistService.List：空切片一律 make([]T,0,len)（而不是
   append([]string(nil), ...)），并顺手挡掉配置里存着的 null。
   断言的是**序列化形状**，不是 Go 的 len()。
   ========================================================================== */

func TestPlaylistListNeverReturnsNilSongIDs(t *testing.T) {
	t.Setenv("LMPLAYER_DATA_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	svc := NewPlaylistService(store)

	// 一条歌都没有的「我喜欢」：LikedIDs 为空
	if err := store.Update(func(c *bootstrap.Config) { c.LikedIDs = []string{} }); err != nil {
		t.Fatal(err)
	}
	// 新建的空歌单：Create 里写的是 []string{}（非 nil），但 Store.Get 的深拷贝
	// 会把空切片还原成 nil —— 所以它同样要由 List 负责补回非 nil。
	if _, err := svc.Create("空歌单"); err != nil {
		t.Fatal(err)
	}

	list := svc.List()
	raw, err := json.Marshal(list)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("List() 序列化结果: %s", raw)
	if strings.Contains(string(raw), `"songIds":null`) {
		t.Fatalf("绑定返回了 songIds:null（前端会当成「没拿到数据」而保留旧列表）: %s", raw)
	}
	for _, p := range list {
		if p.SongIDs == nil {
			t.Fatalf("歌单 %q（%s）的 SongIDs 是 nil —— 绑定层会序列化成 null", p.Name, p.ID)
		}
	}
}
