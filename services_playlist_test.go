package main

import (
	"strings"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

/* ==========================================================================
   歌单服务：id 必须两端一致、且**匹配不到时必须报错**
   --------------------------------------------------------------------------
   这组用例守的是一个曾经真实存在的静默失败：

     前端新建歌单时自己造了一个 id（uid("pl")），后端 Create 又生成了另一个
     （bootstrap.RandomID("pl")）。之后前端带着自己的 id 调 AddSongs，
     后端在 config.Playlists 里找不到它 —— 旧实现返回 (0, nil)，
     既不报错也不加歌。界面上显示「已添加 5 首到『新歌单』」，
     config.json 里一首都没有；重启后新歌单是空的，日志里没有任何线索。

   所以「找不到 → 返回错误」是这组用例的核心断言：它是前后端状态
   不再静默分叉的最后一道防线。
   ========================================================================== */

func newPlaylistService(t *testing.T) *PlaylistService {
	t.Helper()
	t.Setenv("LMPLAYER_DATA_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	return NewPlaylistService(store)
}

func TestPlaylistCreateUsesBackendGeneratedID(t *testing.T) {
	svc := newPlaylistService(t)
	pl, err := svc.Create("  新歌单  ")
	if err != nil {
		t.Fatalf("创建失败: %v", err)
	}
	if strings.TrimSpace(pl.Name) != "新歌单" {
		t.Fatalf("名称应当被 trim：%q", pl.Name)
	}
	if pl.ID == "" {
		t.Fatal("后端必须返回生成的 id（前端就是要用这个 id 才能对齐）")
	}
	if !strings.HasPrefix(pl.ID, "pl") {
		t.Fatalf("id 前缀应当是 pl：%q", pl.ID)
	}
	// 同名（大小写不敏感）应当被拒绝
	if _, err := svc.Create("新歌单"); err == nil {
		t.Fatal("同名歌单应当报错")
	}
	if _, err := svc.Create("   "); err == nil {
		t.Fatal("空名字应当报错")
	}
}

func TestPlaylistAddSongsReportsUnknownPlaylist(t *testing.T) {
	svc := newPlaylistService(t)

	// 关键用例：id 匹配不到时必须报错，而不是 (0, nil)。
	added, err := svc.AddSongs("uid-frontend-made-up", []string{"s1", "s2"})
	if err == nil {
		t.Fatalf("歌单不存在时 AddSongs 必须报错，实际 added=%d err=nil（前端会以为「本来就在里面」）", added)
	}
	if !strings.Contains(err.Error(), "歌单不存在") {
		t.Fatalf("错误信息应当说明歌单不存在，实际: %v", err)
	}
	if added != 0 {
		t.Fatalf("失败时 added 应当是 0，实际 %d", added)
	}

	if _, err := svc.RemoveSongs("uid-frontend-made-up", []string{"s1"}); err == nil {
		t.Fatal("歌单不存在时 RemoveSongs 必须报错")
	}
	if err := svc.Reorder("uid-frontend-made-up", 0, 1); err == nil {
		t.Fatal("歌单不存在时 Reorder 必须报错")
	}
	if err := svc.Rename("uid-frontend-made-up", "x"); err == nil {
		t.Fatal("歌单不存在时 Rename 必须报错")
	}
	if err := svc.Delete("uid-frontend-made-up"); err == nil {
		t.Fatal("歌单不存在时 Delete 必须报错")
	}
}

func TestPlaylistAddSongsRoundTripWithReturnedID(t *testing.T) {
	svc := newPlaylistService(t)
	pl, err := svc.Create("对齐 id")
	if err != nil {
		t.Fatal(err)
	}
	// 用后端返回的 id 加歌：这是前端修复后的调用路径
	added, err := svc.AddSongs(pl.ID, []string{"s1", "s2"})
	if err != nil {
		t.Fatalf("用后端 id 加歌失败: %v", err)
	}
	if added != 2 {
		t.Fatalf("应当 added=2，实际 %d", added)
	}
	// 重复添加去重
	added, err = svc.AddSongs(pl.ID, []string{"s2", "s3"})
	if err != nil {
		t.Fatal(err)
	}
	if added != 1 {
		t.Fatalf("去重后应当 added=1，实际 %d", added)
	}
	// 落盘校验：重新读一遍配置（模拟重启）
	reopened := newPlaylistServiceForStore(t, svc)
	found := false
	for _, p := range reopened.List() {
		if p.ID == pl.ID {
			found = true
			if len(p.SongIDs) != 3 {
				t.Fatalf("落盘后应当有 3 首歌，实际 %d 首：%v", len(p.SongIDs), p.SongIDs)
			}
		}
	}
	if !found {
		t.Fatal("歌单没有落盘")
	}
}

// newPlaylistServiceForStore 复用同一个数据目录重新构造 store（等价于重启读盘）。
func newPlaylistServiceForStore(t *testing.T, svc *PlaylistService) *PlaylistService {
	t.Helper()
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("重新读盘失败: %v", err)
	}
	_ = svc
	return NewPlaylistService(store)
}

func TestPlaylistReorderPersistsForLikedAndCustom(t *testing.T) {
	svc := newPlaylistService(t)

	// 「我喜欢」的歌顺序存在 LikedIDs 里，过去 Reorder 完全不处理它：
	// 拖拽「我喜欢」的队列时后端静默什么都不做。
	if _, err := svc.AddSongs(likedPlaylistID, []string{"a", "b", "c"}); err != nil {
		t.Fatal(err)
	}
	if err := svc.Reorder(likedPlaylistID, 0, 2); err != nil {
		t.Fatalf("重排「我喜欢」应当成功: %v", err)
	}
	liked := svc.List()[0]
	if got := strings.Join(liked.SongIDs, ","); got != "b,c,a" {
		t.Fatalf("「我喜欢」的顺序应当变成 b,c,a，实际 %s", got)
	}

	// 自定义歌单 + 侧边栏顺序
	p1, _ := svc.Create("一")
	p2, _ := svc.Create("二")
	p3, _ := svc.Create("三")
	if _, err := svc.AddSongs(p1.ID, []string{"x", "y", "z"}); err != nil {
		t.Fatal(err)
	}
	if err := svc.Reorder(p1.ID, 2, 0); err != nil {
		t.Fatal(err)
	}
	for _, p := range svc.List() {
		if p.ID == p1.ID && strings.Join(p.SongIDs, ",") != "z,x,y" {
			t.Fatalf("歌单内顺序应当变成 z,x,y，实际 %s", strings.Join(p.SongIDs, ","))
		}
	}

	// 侧边栏顺序：from/to 的下标空间**不含「我喜欢」**
	if err := svc.ReorderPlaylists(0, 2); err != nil { // 一 → 移到最后
		t.Fatal(err)
	}
	var order []string
	for _, p := range svc.List() {
		if p.ID != likedPlaylistID {
			order = append(order, p.Name)
		}
	}
	if strings.Join(order, ",") != "二,三,一" {
		t.Fatalf("侧边栏顺序应当变成 二,三,一，实际 %v（p2=%s p3=%s）", order, p2.Name, p3.Name)
	}
}

func TestPlaylistDeleteKeepsConfigConsistent(t *testing.T) {
	svc := newPlaylistService(t)
	pl, _ := svc.Create("要删掉的")
	if _, err := svc.AddSongs(pl.ID, []string{"s1"}); err != nil {
		t.Fatal(err)
	}
	if err := svc.Delete(pl.ID); err != nil {
		t.Fatal(err)
	}
	for _, p := range svc.List() {
		if p.ID == pl.ID {
			t.Fatal("歌单没被删掉")
		}
	}
	// 「我喜欢」不可删、不可改名
	if err := svc.Delete(likedPlaylistID); err == nil {
		t.Fatal("「我喜欢」不可删除")
	}
	if err := svc.Rename(likedPlaylistID, "x"); err == nil {
		t.Fatal("「我喜欢」不可重命名")
	}
}
