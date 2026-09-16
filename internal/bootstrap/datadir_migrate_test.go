package bootstrap

import (
	"os"
	"path/filepath"
	"testing"
)

// 数据目录改名（MusicPlayer → LocalMusicPlayer）之后，老用户升级时不能“设置全没了”，
// 所以 NewStore 会先做一次整体搬迁。这里对着三种情况逐条断言。
func TestMigrateLegacyDataDirMovesOldOne(t *testing.T) {
	base := t.TempDir()
	legacy := filepath.Join(base, "MusicPlayer")
	newDir := filepath.Join(base, "LocalMusicPlayer")

	if err := os.MkdirAll(legacy, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacy, "config.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	migrateLegacyDataDir(newDir)

	if _, err := os.Stat(filepath.Join(newDir, "config.json")); err != nil {
		t.Fatalf("旧数据目录没有被迁移过来：%v", err)
	}
	if _, err := os.Stat(legacy); !os.IsNotExist(err) {
		t.Fatal("迁移之后旧目录应该已经不在了")
	}
}

// 新目录已经在用（例如已经升级过一次）时，绝不能被旧目录覆盖。
func TestMigrateLegacyDataDirKeepsExisting(t *testing.T) {
	base := t.TempDir()
	legacy := filepath.Join(base, "MusicPlayer")
	newDir := filepath.Join(base, "LocalMusicPlayer")

	if err := os.MkdirAll(legacy, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(newDir, 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(legacy, "config.json"), []byte(`{"old":true}`), 0o644)
	_ = os.WriteFile(filepath.Join(newDir, "config.json"), []byte(`{"new":true}`), 0o644)

	migrateLegacyDataDir(newDir)

	raw, err := os.ReadFile(filepath.Join(newDir, "config.json"))
	if err != nil || string(raw) != `{"new":true}` {
		t.Fatalf("新目录被覆盖了：%s (%v)", raw, err)
	}
	if _, err := os.Stat(legacy); err != nil {
		t.Fatal("新目录已在用时，旧目录应当原样留着")
	}
}

// 全新安装：两边都没有，不应该凭空创建任何目录。
func TestMigrateLegacyDataDirNoLegacy(t *testing.T) {
	newDir := filepath.Join(t.TempDir(), "LocalMusicPlayer")
	migrateLegacyDataDir(newDir)
	if _, err := os.Stat(newDir); !os.IsNotExist(err) {
		t.Fatal("没有旧目录时不该创建新目录（那是 MkdirAll 的活）")
	}
}

// 认不出来的路径（测试用 LMPLAYER_DATA_DIR 指到临时目录）必须原样返回空串，
// 否则会误伤别的目录。
func TestLegacyDataDirName(t *testing.T) {
	base := t.TempDir()
	cases := []struct {
		newDir string
		want   string
	}{
		{filepath.Join(base, "LocalMusicPlayer"), filepath.Join(base, "MusicPlayer")},
		{filepath.Join(base, "localmusicplayer"), filepath.Join(base, "musicplayer")},
		{filepath.Join(base, "something-else"), ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := legacyDataDir(c.newDir); got != c.want {
			t.Errorf("legacyDataDir(%q) = %q，期望 %q", c.newDir, got, c.want)
		}
	}
}
