package main

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"localmusicplayer/internal/bootstrap"
)

/* --------------------------------------------------------------------------
   下载目录 = 隐式扫描根
   -------------------------------------------------------------------------- */

// TestEffectiveFoldersIncludesDownloadDir 需求：「本地歌曲」要显示下载路径里的歌。
// 下载目录由程序管理，不该要求用户手动添加，也不能重复添加
// （用户很可能把 Music 整个目录加进来，而下载目录就在它下面）。
func TestEffectiveFoldersIncludesDownloadDir(t *testing.T) {
	music := t.TempDir()
	t.Setenv("LMPLAYER_MUSIC_DIR", music)
	downloads := bootstrap.DefaultDownloadDir()

	t.Run("默认会带上下载目录", func(t *testing.T) {
		cfg := bootstrap.Config{DownloadDir: downloads, Folders: []bootstrap.Folder{
			{ID: "f1", Path: filepath.Join(music, "album")},
		}}
		folders := cfg.EffectiveFolders()
		if len(folders) != 2 {
			t.Fatalf("应有两个扫描根，实际 %d: %+v", len(folders), folders)
		}
		last := folders[1]
		if last.ID != bootstrap.DownloadFolderID {
			t.Fatalf("下载目录的 id 应为 %q，实际 %q", bootstrap.DownloadFolderID, last.ID)
		}
		if !filepath.IsAbs(last.Path) {
			t.Fatalf("下载目录路径应为绝对路径: %q", last.Path)
		}
	})

	t.Run("用户已加同一个目录时不重复", func(t *testing.T) {
		cfg := bootstrap.Config{DownloadDir: downloads, Folders: []bootstrap.Folder{
			{ID: "f1", Path: downloads},
		}}
		if got := len(cfg.EffectiveFolders()); got != 1 {
			t.Fatalf("同目录不应重复添加，实际 %d 个", got)
		}
	})

	t.Run("用户加了上级目录时不重复", func(t *testing.T) {
		cfg := bootstrap.Config{DownloadDir: downloads, Folders: []bootstrap.Folder{
			{ID: "f1", Path: music},
		}}
		if got := len(cfg.EffectiveFolders()); got != 1 {
			t.Fatalf("上级目录已覆盖下载目录，不应重复添加，实际 %d 个", got)
		}
	})

	t.Run("大小写与尾部斜杠不影响判重", func(t *testing.T) {
		cfg := bootstrap.Config{DownloadDir: downloads, Folders: []bootstrap.Folder{
			{ID: "f1", Path: downloads + string(filepath.Separator)},
		}}
		if got := len(cfg.EffectiveFolders()); got != 1 {
			t.Fatalf("同一目录的不同写法不应被当成两个，实际 %d 个", got)
		}
	})

	t.Run("下载目录为空时不添加", func(t *testing.T) {
		cfg := bootstrap.Config{DownloadDir: "", Folders: []bootstrap.Folder{{ID: "f1", Path: music}}}
		if got := len(cfg.EffectiveFolders()); got != 1 {
			t.Fatalf("下载目录为空时不应添加扫描根，实际 %d 个", got)
		}
	})
}

/* --------------------------------------------------------------------------
   下载目录迁移
   -------------------------------------------------------------------------- */

func TestMigrateDirMovesAudioOnly(t *testing.T) {
	oldDir := t.TempDir()
	newDir := t.TempDir()

	write := func(dir, name, body string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}

	write(oldDir, "a.m4a", "audio-a")
	write(oldDir, "b.mp3", "audio-b")
	write(oldDir, "cover.jpg", "not-audio")
	write(oldDir, "notes.txt", "not-audio")
	// 新目录里已有一个同名文件：不能被覆盖
	write(newDir, "b.mp3", "existing")

	moved, skipped, failed := migrateDir(oldDir, newDir)
	if moved != 1 {
		t.Fatalf("应搬走 1 个文件，实际 %d", moved)
	}
	if skipped != 1 {
		t.Fatalf("同名文件应跳过 1 个，实际 %d", skipped)
	}
	if len(failed) != 0 {
		t.Fatalf("不应有失败: %v", failed)
	}

	if _, err := os.Stat(filepath.Join(newDir, "a.m4a")); err != nil {
		t.Fatalf("a.m4a 应该已经在新目录: %v", err)
	}
	if b, _ := os.ReadFile(filepath.Join(newDir, "b.mp3")); string(b) != "existing" {
		t.Fatal("同名文件被覆盖了（不能覆盖用户已有的文件）")
	}
	// 非音频文件不搬
	if _, err := os.Stat(filepath.Join(oldDir, "cover.jpg")); err != nil {
		t.Fatal("非音频文件不应被搬走")
	}
	if _, err := os.Stat(filepath.Join(oldDir, "notes.txt")); err != nil {
		t.Fatal("非音频文件不应被搬走")
	}
	// 成功搬走的文件不应留在原处
	if _, err := os.Stat(filepath.Join(oldDir, "a.m4a")); err == nil {
		t.Fatal("搬走的文件不应还留在旧目录")
	}
}

func TestMigrateDirSamePathIsNoop(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.m4a"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	moved, skipped, failed := migrateDir(dir, dir)
	if moved != 0 || skipped != 0 || len(failed) != 0 {
		t.Fatalf("同一个目录不应做任何事: moved=%d skipped=%d failed=%v", moved, skipped, failed)
	}
	if _, err := os.Stat(filepath.Join(dir, "a.m4a")); err != nil {
		t.Fatal("文件不应被删掉")
	}
}

func TestDirMusicStats(t *testing.T) {
	dir := t.TempDir()
	for name, size := range map[string]int{"a.m4a": 100, "b.flac": 200, "c.jpg": 999} {
		body := make([]byte, size)
		if err := os.WriteFile(filepath.Join(dir, name), body, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	// 子目录不计入（只统计平铺的文件）
	if err := os.MkdirAll(filepath.Join(dir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "sub", "d.m4a"), make([]byte, 500), 0o644); err != nil {
		t.Fatal(err)
	}

	count, size := dirMusicStats(dir)
	if count != 2 {
		t.Fatalf("应统计到 2 个音频文件，实际 %d", count)
	}
	if size != 300 {
		t.Fatalf("总字节数应为 300，实际 %d", size)
	}
}

func TestApplyDirMigratesFiles(t *testing.T) {
	dataDir := t.TempDir()
	t.Setenv("LMPLAYER_DATA_DIR", dataDir)
	music := t.TempDir()
	t.Setenv("LMPLAYER_MUSIC_DIR", music)

	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	svc := NewDownloadService(store, nil)

	oldDir, _ := svc.Dir()
	if err := os.WriteFile(filepath.Join(oldDir, "song.m4a"), []byte("audio"), 0o644); err != nil {
		t.Fatal(err)
	}

	newDir := filepath.Join(music, "moved", "downloads")

	// 提案：不改配置，只报告现状
	proposal, err := svc.SetDir(newDir)
	if err != nil {
		t.Fatalf("SetDir 失败: %v", err)
	}
	if proposal["same"] == true {
		t.Fatal("新旧目录不同，same 应为 false")
	}
	if proposal["count"].(int) != 1 {
		t.Fatalf("提案里的文件数应为 1，实际 %v", proposal["count"])
	}
	if cur := store.Get().DownloadDir; cur == newDir {
		t.Fatal("SetDir 不应直接改配置（要先让用户确认是否迁移）")
	}

	applied, err := svc.ApplyDir(newDir, true)
	if err != nil {
		t.Fatalf("ApplyDir 失败: %v", err)
	}
	if applied["migrated"].(int) != 1 {
		t.Fatalf("应迁移 1 个文件，实际 %v", applied["migrated"])
	}
	if store.Get().DownloadDir != newDir {
		t.Fatalf("配置未更新: %q", store.Get().DownloadDir)
	}
	if _, err := os.Stat(filepath.Join(newDir, "song.m4a")); err != nil {
		t.Fatalf("文件未迁移到新目录: %v", err)
	}

	// 重启后仍然是新目录
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Get().DownloadDir != newDir {
		t.Fatalf("重启后下载目录丢失: %q", reopened.Get().DownloadDir)
	}
}

func TestApplyDirWithoutMigrationKeepsFiles(t *testing.T) {
	dataDir := t.TempDir()
	t.Setenv("LMPLAYER_DATA_DIR", dataDir)
	music := t.TempDir()
	t.Setenv("LMPLAYER_MUSIC_DIR", music)

	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	svc := NewDownloadService(store, nil)

	oldDir, _ := svc.Dir()
	if err := os.WriteFile(filepath.Join(oldDir, "keep.m4a"), []byte("audio"), 0o644); err != nil {
		t.Fatal(err)
	}
	newDir := filepath.Join(music, "other", "downloads")

	if _, err := svc.ApplyDir(newDir, false); err != nil {
		t.Fatalf("ApplyDir 失败: %v", err)
	}
	if store.Get().DownloadDir != newDir {
		t.Fatalf("目录未切换: %q", store.Get().DownloadDir)
	}
	if _, err := os.Stat(filepath.Join(oldDir, "keep.m4a")); err != nil {
		t.Fatal("选择「不迁移」时旧文件必须留在原地")
	}
}

/* --------------------------------------------------------------------------
   新增的交互设置
   -------------------------------------------------------------------------- */

func TestRowClickAndDensityPersist(t *testing.T) {
	svc, _ := newCfgFixture(t)

	if _, err := svc.Set(map[string]any{
		"rowClickAction": "play-list",
		"listDensity":    "roomy",
		"embedMeta":      true,
	}); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}

	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	got := reopened.Get()
	if got.RowClickAction != "play-list" {
		t.Fatalf("rowClickAction 未持久化: %q", got.RowClickAction)
	}
	if got.ListDensity != "roomy" {
		t.Fatalf("listDensity 未持久化: %q", got.ListDensity)
	}
	if !got.EmbedMeta {
		t.Fatal("embedMeta 未持久化")
	}
}

func TestRowClickAndDensityRejectGarbage(t *testing.T) {
	svc, _ := newCfgFixture(t)
	if _, err := svc.Set(map[string]any{
		"rowClickAction": "delete-everything",
		"listDensity":    "huge",
	}); err != nil {
		t.Fatal(err)
	}
	got := svc.Get()
	if got.RowClickAction != "next" {
		t.Fatalf("非法单击行为应落回 next，实际 %q", got.RowClickAction)
	}
	if got.ListDensity != "cozy" {
		t.Fatalf("非法密度应落回 cozy，实际 %q", got.ListDensity)
	}
}

/* --------------------------------------------------------------------------
   下载任务面板
   --------------------------------------------------------------------------
   标题栏「下载任务」入口的显隐、面板里的进度与结果全部读这份任务快照。
   早期只有 running 集合：下载一结束就什么都不剩，用户看不到「已完成」，
   失败原因也无处可查。
*/

func newDownloadFixture(t *testing.T) *DownloadService {
	t.Helper()
	t.Setenv("LMPLAYER_DATA_DIR", t.TempDir())
	t.Setenv("LMPLAYER_MUSIC_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	return NewDownloadService(store, nil)
}

func TestDownloadTasksLifecycle(t *testing.T) {
	svc := newDownloadFixture(t)
	var events []string
	svc.setEmitter(func(name string, _ any) { events = append(events, name) })

	dir := t.TempDir()
	svc.mu.Lock()
	running := svc.newTaskLocked("BV1", "正在下载", dir, 1000)
	done := svc.newTaskLocked("BV2", "已完成", dir, 2000)
	svc.mu.Unlock()

	svc.updateTask(done.ID, func(task *DownloadTask) {
		task.State = DownloadDone
		task.Done = 123
		task.Total = 123
		task.Path = filepath.Join(dir, "done.m4a")
		task.FinishedAt = time.Now().UnixMilli()
	})

	snap := svc.Tasks()
	tasks := snap["tasks"].([]DownloadTask)
	if len(tasks) != 2 {
		t.Fatalf("应有 2 条任务，实际 %d", len(tasks))
	}
	if snap["active"].(int) != 1 {
		t.Fatalf("进行中的任务数应为 1，实际 %v", snap["active"])
	}
	if tasks[0].ID != running.ID || tasks[0].State != DownloadRunning {
		t.Fatalf("第一条应是进行中的任务: %+v", tasks[0])
	}
	if tasks[1].State != DownloadDone || tasks[1].Path == "" || tasks[1].Done != 123 {
		t.Fatalf("完成的任务要带上状态/路径/字节数: %+v", tasks[1])
	}

	// 「清除已完成」不能把正在下载的那条一起删掉
	after := svc.ClearFinished()
	left := after["tasks"].([]DownloadTask)
	if len(left) != 1 || left[0].ID != running.ID {
		t.Fatalf("清除后应只剩进行中的任务，实际 %+v", left)
	}

	// 状态变化要广播整份快照（前端直接覆盖本地列表，不做增量合并）
	found := false
	for _, name := range events {
		if name == "download:tasks" {
			found = true
		}
	}
	if !found {
		t.Fatal("任务变化应广播 download:tasks 事件")
	}
}

// 同一首歌并发下载只允许一条：第二次 Start 直接返回 already-running，不再登记任务。
func TestDownloadStartRejectsDuplicate(t *testing.T) {
	svc := newDownloadFixture(t)
	svc.mu.Lock()
	svc.running["BV1"] = true
	svc.mu.Unlock()

	res, err := svc.Start("BV1", "x", 0)
	if err != nil {
		t.Fatalf("Start 失败: %v", err)
	}
	if res["started"] != false || res["reason"] != "already-running" {
		t.Fatalf("重复下载应被拒绝: %+v", res)
	}
	if got := len(svc.Tasks()["tasks"].([]DownloadTask)); got != 0 {
		t.Fatalf("被拒绝的请求不应登记任务，实际 %d 条", got)
	}
}

// 已结束的任务要限量，但**正在下载的永远不能被挤掉**。
func TestDownloadTasksTrimKeepsRunning(t *testing.T) {
	svc := newDownloadFixture(t)
	dir := t.TempDir()
	svc.mu.Lock()
	running := svc.newTaskLocked("BVRUN", "进行中", dir, 0)
	for i := 0; i < maxFinishedTasks+5; i++ {
		svc.newTaskLocked("BV"+strconv.Itoa(i), "已完成", dir, 0)
	}
	svc.mu.Unlock()

	// 把除 running 之外的全部标成已完成，并触发一次裁剪
	svc.mu.Lock()
	for _, task := range svc.tasks {
		if task.ID != running.ID {
			task.State = DownloadDone
		}
	}
	svc.trimFinishedLocked()
	remaining := len(svc.tasks)
	svc.mu.Unlock()

	if remaining != maxFinishedTasks+1 {
		t.Fatalf("应保留 %d 条（%d 条已完成 + 1 条进行中），实际 %d", maxFinishedTasks+1, maxFinishedTasks, remaining)
	}
	foundRunning := false
	for _, task := range svc.Tasks()["tasks"].([]DownloadTask) {
		if task.ID == running.ID {
			foundRunning = true
		}
	}
	if !foundRunning {
		t.Fatal("裁剪把正在下载的任务挤掉了")
	}
}
