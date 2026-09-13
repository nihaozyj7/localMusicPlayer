package main

import (
	"os"
	"path/filepath"
	"testing"

	"musicplayer/internal/bootstrap"
)

/* --------------------------------------------------------------------------
   下载目录 = 隐式扫描根
   -------------------------------------------------------------------------- */

// TestEffectiveFoldersIncludesDownloadDir 需求：「本地歌曲」要显示下载路径里的歌。
// 下载目录由程序管理，不该要求用户手动添加，也不能重复添加
// （用户很可能把 Music 整个目录加进来，而下载目录就在它下面）。
func TestEffectiveFoldersIncludesDownloadDir(t *testing.T) {
	music := t.TempDir()
	t.Setenv("MUSICPLAYER_MUSIC_DIR", music)
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
	t.Setenv("MUSICPLAYER_DATA_DIR", dataDir)
	music := t.TempDir()
	t.Setenv("MUSICPLAYER_MUSIC_DIR", music)

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
	t.Setenv("MUSICPLAYER_DATA_DIR", dataDir)
	music := t.TempDir()
	t.Setenv("MUSICPLAYER_MUSIC_DIR", music)

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
		"rowClickAction": "append",
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
	if got.RowClickAction != "append" {
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
