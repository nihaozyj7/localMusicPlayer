package library

import (
	"context"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

/* ==========================================================================
   扫描结束时对配置的写回：只能回填字段，不能覆盖整份文件夹列表
   --------------------------------------------------------------------------
   一次全量扫描要跑几十秒到几分钟（大曲库更久）。旧实现在扫描**开始**时把
   m.folders 拷一份快照，结束时 `c.Folders = foldersCopy` 整份写回去 ——
   于是这期间用户新增的文件夹会被旧快照抹掉，删除的文件夹会被"复活"，
   改过的路径会被改回去。

   故障现象（用户视角）：「我明明加了文件夹，扫完之后它自己没了。」
   而且 m.folders 与 config.json 从此不一致：界面按配置显示，扫描按内存扫。
   ========================================================================== */

// 在扫描进行中（进度回调里）往配置里加一个文件夹，扫描结束后它必须还在。
func TestScanDoesNotWipeFolderAddedMidScan(t *testing.T) {
	m, store, _ := newTestManager(t)

	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "a.wav"), 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music, Status: "ok"}}
	}); err != nil {
		t.Fatal(err)
	}
	m.ReloadFolders()

	late := t.TempDir()
	writeWAV(t, filepath.Join(late, "b.wav"), 1)

	// 第一次进度回调 = 扫描已经开始（快照已拍），此刻用户新增文件夹。
	injected := false
	m.SetProgressFunc(func(phase string, current, total int) {
		if injected {
			return
		}
		injected = true
		if err := store.Update(func(c *bootstrap.Config) {
			c.Folders = append(c.Folders, bootstrap.Folder{ID: "late", Path: late, Status: "ok"})
		}); err != nil {
			t.Errorf("扫描中途写配置失败: %v", err)
		}
	})

	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatalf("扫描失败: %v", err)
	}
	if !injected {
		t.Fatal("夹具不成立：进度回调一次都没触发，没能在扫描中途插入文件夹")
	}

	ids := map[string]bootstrap.Folder{}
	for _, f := range store.Get().Folders {
		ids[f.ID] = f
	}
	got, ok := ids["late"]
	if !ok {
		t.Fatalf("扫描期间新增的文件夹被扫描开始时的快照抹掉了（配置里现在只有 %v）", keysOf(ids))
	}
	if got.Path != late {
		t.Fatalf("新增文件夹的路径被改写了：%q，期望 %q", got.Path, late)
	}
	if _, ok := ids["f1"]; !ok {
		t.Fatal("原有的文件夹被弄丢了")
	}
	// 原有文件夹的 status/trackCount 仍然要被回填（这是这次写回的目的）
	if ids["f1"].TrackCount != 1 {
		t.Fatalf("原有文件夹的曲目数没有被回填：%d，期望 1", ids["f1"].TrackCount)
	}
}

// 扫描期间**删除**文件夹，结束后它不能被旧快照"复活"。
func TestScanDoesNotResurrectFolderRemovedMidScan(t *testing.T) {
	m, store, _ := newTestManager(t)

	music := t.TempDir()
	writeWAV(t, filepath.Join(music, "a.wav"), 1)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: music, Status: "ok"}}
	}); err != nil {
		t.Fatal(err)
	}
	m.ReloadFolders()

	removed := false
	m.SetProgressFunc(func(phase string, current, total int) {
		if removed {
			return
		}
		removed = true
		if err := store.Update(func(c *bootstrap.Config) { c.Folders = nil }); err != nil {
			t.Errorf("扫描中途写配置失败: %v", err)
		}
	})

	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatalf("扫描失败: %v", err)
	}
	if !removed {
		t.Fatal("夹具不成立：没能在扫描中途删除文件夹")
	}
	// 注意排除合成出来的下载目录（EffectiveFolders 会加上它）
	for _, f := range store.Get().Folders {
		if f.ID == "f1" {
			t.Fatal("扫描期间删除的文件夹被扫描快照复活了")
		}
	}
}

func keysOf(m map[string]bootstrap.Folder) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
