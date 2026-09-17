package library

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

// 增量重扫（文件夹监听触发）以前会对**每个**文件夹 × **全部**曲目重算曲目数，
// 整段在写锁内 —— O(文件夹 × 曲库)。现在只重算「被本次 dirs 影响到的」文件夹。
//
// 这个测试保证优化没有改变可观察结果：两个文件夹，各自下面有歌，
// 往其中一个子里加一首之后，两个文件夹的 TrackCount 都必须正确。
// （如果优化只更新「受影响」的那一个而另一个算错，这里会立刻失败。）
func TestRescanPathsUpdatesAllAffectedFolderCounts(t *testing.T) {
	m, store, _ := newTestManager(t)

	dirA := t.TempDir()
	dirB := t.TempDir()
	subA := filepath.Join(dirA, "sub")

	writeWAV(t, filepath.Join(dirA, "a1.wav"), 2)
	writeWAV(t, filepath.Join(dirB, "b1.wav"), 2)
	writeWAV(t, filepath.Join(dirB, "b2.wav"), 2)
	if err := os.MkdirAll(subA, 0o755); err != nil {
		t.Fatal(err)
	}
	writeWAV(t, filepath.Join(subA, "a2.wav"), 2)

	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{
			{ID: "fa", Path: dirA, Status: "ok"},
			{ID: "fb", Path: dirB, Status: "ok"},
		}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)

	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatalf("全量扫描失败: %v", err)
	}
	assertCounts := func(stage string, wantA, wantB int) {
		t.Helper()
		counts := map[string]int{}
		for _, f := range m.Folders() {
			counts[f.ID] = f.TrackCount
		}
		if counts["fa"] != wantA || counts["fb"] != wantB {
			t.Fatalf("%s：文件夹曲目数 = fa:%d fb:%d，期望 fa:%d fb:%d",
				stage, counts["fa"], counts["fb"], wantA, wantB)
		}
	}
	// dirA 含 sub 里的 a2（isUnder 语义包含子目录），dirB 两首。
	assertCounts("全量扫描后", 2, 2)

	// 往 dirA/sub 里加一首，触发增量重扫（模拟文件夹监听）。
	writeWAV(t, filepath.Join(subA, "a3.wav"), 2)
	if _, err := m.RescanPaths(context.Background(), []string{filepath.Join(subA, "a3.wav")}); err != nil {
		t.Fatalf("增量重扫失败: %v", err)
	}

	// fa 必须变成 3；fb 没被碰过，必须仍然是 2（而不是被清零/漏算）。
	assertCounts("增量重扫后", 3, 2)
}

// 反向保证：增量重扫**不能**因为「只更新受影响的文件夹」而漏掉状态同步 ——
// 受影响文件夹的 Status 仍要按本次 walk 的结果更新。
func TestRescanPathsStillUpdatesStatusForAffectedFolder(t *testing.T) {
	m, store, _ := newTestManager(t)
	dir := t.TempDir()
	sub := filepath.Join(dir, "album")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	writeWAV(t, filepath.Join(sub, "s.wav"), 2)

	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: dir, Status: "ok"}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatalf("全量扫描失败: %v", err)
	}

	if _, err := m.RescanPaths(context.Background(), []string{filepath.Join(sub, "s.wav")}); err != nil {
		t.Fatalf("增量重扫失败: %v", err)
	}
	// 注意：EffectiveFolders 会把「下载目录」也合成一个扫描根（ID = DownloadFolderID），
	// 所以这里会看到 2 个条目 —— 那是产品行为，不是测试污染。按 id 取我们关心的那个。
	var got *bootstrap.Folder
	for _, f := range m.Folders() {
		if f.ID == "f1" {
			cp := f
			got = &cp
		}
	}
	if got == nil {
		t.Fatal("找不到文件夹 f1")
	}
	if got.Status != "ok" {
		t.Fatalf("受影响文件夹的 Status = %q, 期望 %q", got.Status, "ok")
	}
	if got.TrackCount != 1 {
		t.Fatalf("受影响文件夹的 TrackCount = %d, 期望 1", got.TrackCount)
	}
}
