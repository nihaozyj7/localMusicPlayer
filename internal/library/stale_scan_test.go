package library

/* ==========================================================================
   stale_scan_test.go — 遍历失败时不能把「没找到」当作「被删了」
   --------------------------------------------------------------------------
   第六轮审查 N-6：`walkFolder` 会如实返回 missing / denied / error / partial，
   但两条替换路径照旧拿本次结果覆盖：

     · 全量扫描：`m.songs = newSongs` —— 整个文件夹的歌直接消失；
     · 增量重扫：先删受影响目录的旧条目再写回。

   于是「网络盘临时掉线 / 目录被独占 / 权限被改」这类**瞬时**故障会让那一批歌
   从曲库里消失：界面只多一个状态提示，歌已经没了，而文件夹的曲目数 0 还会随
   `store.Update` 落进 config.json（下次扫描成功之前，歌单/收藏里那批全是断链）。

   这里不依赖 ACL / 掉线来造状态：**目录不存在**（`missing`）本身就是这类瞬时
   故障最典型的形态（网络盘没挂上时路径就查不到），而它在任何平台上都能确定性地
   复现，也不需要注入 readDir。
   ========================================================================== */

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

// offlineManager 建好一个含 2 首歌的曲库，然后把整个音乐目录删掉
// （模拟「盘没挂上 / 目录暂时读不到」），返回 Manager 与 store。
func offlineManager(t *testing.T) (*Manager, *bootstrap.Store, string) {
	t.Helper()
	m, store, _ := newTestManager(t)
	music := filepath.Join(t.TempDir(), "music")
	if err := os.MkdirAll(filepath.Join(music, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeWAV(t, filepath.Join(music, "a.wav"), 1)
	writeWAV(t, filepath.Join(music, "sub", "b.wav"), 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if n := len(m.Songs()); n != 2 {
		t.Fatalf("前置条件：首次扫描应有 2 首，实际 %d", n)
	}
	if err := os.RemoveAll(music); err != nil {
		t.Fatal(err)
	}
	return m, store, music
}

// ★ 全量扫描：文件夹读不出来时，旧条目必须留着，而不是被空结果覆盖。
func TestScanKeepsSongsWhenFolderUnreadable(t *testing.T) {
	m, _, _ := offlineManager(t)

	res, err := m.Scan(context.Background(), false)
	if err != nil {
		t.Fatalf("扫描不应报错: %v", err)
	}
	if n := len(m.Songs()); n != 2 {
		t.Fatalf("目录读不出来后曲库剩 %d 首（应为 2 首）—— 「没找到」被当成了「被删了」", n)
	}
	if res.Removed != 0 {
		t.Errorf("不应统计到移除，实际 Removed=%d", res.Removed)
	}
	if res.Kept != 2 {
		t.Errorf("Kept 应等于扫描后曲库的实际大小 2，实际 %d（界面会弹「保留 0 首」）", res.Kept)
	}
	// 文件夹的曲目数也要与曲库一致：它会被 store.Update 写进 config.json
	f := m.Folders()[0]
	if f.Status != statusMissing {
		t.Errorf("文件夹状态应为 %q，实际 %q（状态要如实报给用户）", statusMissing, f.Status)
	}
	if f.TrackCount != 2 {
		t.Errorf("文件夹曲目数应为 2，实际 %d（0 会被写进 config.json）", f.TrackCount)
	}
}

// ★ 增量重扫：同一个入口（监听触发的重扫会「先删受影响目录的旧条目再写回」）。
func TestRescanPathsKeepsSongsWhenDirUnreadable(t *testing.T) {
	m, _, music := offlineManager(t)

	// 监听事件里带着这个已经读不到的目录下的文件路径
	res, err := m.RescanPaths(context.Background(), []string{filepath.Join(music, "a.wav")})
	if err != nil {
		t.Fatalf("增量扫描不应报错: %v", err)
	}
	if n := len(m.Songs()); n != 2 {
		t.Fatalf("增量重扫后曲库剩 %d 首（应为 2 首）—— 读不到的目录被当成了空目录", n)
	}
	if res.Removed != 0 {
		t.Errorf("不应统计到移除，实际 Removed=%d", res.Removed)
	}
}

// ★ 与上一条配对：读不全时保留的旧条目**不能变成清不掉的幽灵**。
// 用户真正不要这个文件夹时，走的是「从曲库移除文件夹」——那次扫描里它不再是
// 扫描根（statuses 里没有它），条目就正常消失。
func TestRetainedSongsDisappearWhenFolderRemovedFromLibrary(t *testing.T) {
	m, store, _ := offlineManager(t)

	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if n := len(m.Songs()); n != 2 {
		t.Fatalf("前置条件：保留后应有 2 首，实际 %d", n)
	}

	if err := store.Update(func(c *bootstrap.Config) { c.Folders = nil }); err != nil {
		t.Fatal(err)
	}
	m.ReloadFolders()
	res, err := m.Scan(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if n := len(m.Songs()); n != 0 {
		t.Fatalf("从曲库移除文件夹后不应再有歌，实际 %d 首 %v —— 保留的旧条目变成了幽灵", n, songList(m))
	}
	if res.Removed != 2 {
		t.Errorf("应统计到 2 首被移除，实际 %d", res.Removed)
	}
}

// ★ 一个文件夹读不到时，**其它读得到的文件夹照旧正常增删**。
// 这条防的是「为了让失败文件夹不清空，结果把整库的删除都停掉了」这种过度修复。
//
// 用两个扫描根而不是两个子目录：子目录被删掉时 `walkFolder(根)` 根本看不到它
// （目录枚举里没有这一项 → 状态仍是 ok），只有「扫描根本身读不出来」才是 missing。
func TestPartialFailureStillAppliesDeletionInReadableFolder(t *testing.T) {
	m, store, _ := newTestManager(t)
	base := t.TempDir()
	gone := filepath.Join(base, "gone")
	ok := filepath.Join(base, "ok")
	for _, d := range []string{gone, ok} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	writeWAV(t, filepath.Join(gone, "g.wav"), 1)
	writeWAV(t, filepath.Join(ok, "keep.wav"), 1)
	writeWAV(t, filepath.Join(ok, "deleted.wav"), 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: gone}, {ID: "f2", Path: ok}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if n := len(m.Songs()); n != 3 {
		t.Fatalf("前置条件：应有 3 首，实际 %d", n)
	}

	// 扫描根一整个读不到，另一个扫描根里真的删了一首
	if err := os.RemoveAll(gone); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(ok, "deleted.wav")); err != nil {
		t.Fatal(err)
	}
	res, err := m.Scan(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if n := len(m.Songs()); n != 2 {
		t.Fatalf("应有 2 首（读不到的文件夹保留 + 读得到的文件夹照常删），实际 %d：%v", n, songList(m))
	}
	if res.Removed != 1 {
		t.Errorf("恰好应移除 1 首，实际 %d", res.Removed)
	}
}

// songList 仅用于失败信息。
func songList(m *Manager) []string {
	songs := m.Songs()
	out := make([]string, 0, len(songs))
	for _, s := range songs {
		out = append(out, s.Path)
	}
	return out
}
