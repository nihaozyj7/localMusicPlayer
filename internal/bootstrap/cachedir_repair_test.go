package bootstrap

import (
	"os"
	"path/filepath"
	"testing"
)

// 改名之后 config.json 里遗留的**绝对** cacheDir 必须被修正回新数据目录，
// 否则封面/歌词会被写到一个空目录里，用户之前匹配好的缓存全部读不到。
// 这是实测到的数据丢失（41 张内嵌封面里 40 张 404），所以要有回归测试。
func TestRepairLegacyCacheDirRepointsAndMerges(t *testing.T) {
	base := t.TempDir()
	legacyDir := filepath.Join(base, "MusicPlayer")
	newDir := filepath.Join(base, "LocalMusicPlayer")

	// 旧目录里是用户以前匹配好的封面与歌词
	oldCover := filepath.Join(legacyDir, "cache", "covers")
	if err := os.MkdirAll(oldCover, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldCover, "aaaa1111bbbb2222.jpg"), []byte("OLD-COVER"), 0o644); err != nil {
		t.Fatal(err)
	}
	// 新目录里已经有本次运行写入的封面（不能被旧内容覆盖）
	newCover := filepath.Join(newDir, "cache", "covers")
	if err := os.MkdirAll(newCover, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(newCover, "cccc3333dddd4444.jpg"), []byte("NEW-COVER"), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := &Config{
		DataDir:  newDir,
		CacheDir: filepath.Join(legacyDir, "cache"),
	}
	repairLegacyCacheDir(cfg)

	want := filepath.Join(newDir, "cache")
	if cfg.CacheDir != want {
		t.Fatalf("cacheDir = %q，期望 %q", cfg.CacheDir, want)
	}
	// 旧图补过来了
	raw, err := os.ReadFile(filepath.Join(newCover, "aaaa1111bbbb2222.jpg"))
	if err != nil || string(raw) != "OLD-COVER" {
		t.Fatalf("旧封面没有被补进新目录：%s (%v)", raw, err)
	}
	// 新图没有被覆盖
	raw, err = os.ReadFile(filepath.Join(newCover, "cccc3333dddd4444.jpg"))
	if err != nil || string(raw) != "NEW-COVER" {
		t.Fatalf("新目录里已有的封面被覆盖了：%s (%v)", raw, err)
	}
	// 旧目录保留（删用户文件不是我们的活）
	if _, err := os.Stat(filepath.Join(legacyDir, "cache")); err != nil {
		t.Fatalf("旧缓存目录不该被删掉：%v", err)
	}
}

// 用户自己把缓存指到别处（不在旧数据目录之内）时，必须原样不动。
func TestRepairLegacyCacheDirKeepsCustomLocation(t *testing.T) {
	base := t.TempDir()
	newDir := filepath.Join(base, "LocalMusicPlayer")
	custom := filepath.Join(base, "elsewhere", "my-cache")

	cfg := &Config{DataDir: newDir, CacheDir: custom}
	repairLegacyCacheDir(cfg)

	if cfg.CacheDir != custom {
		t.Fatalf("自定义缓存位置被改动了：%q", cfg.CacheDir)
	}
}

// 目录名认不出来（测试里用临时目录）时不能动 cacheDir。
func TestRepairLegacyCacheDirNoLegacyName(t *testing.T) {
	base := t.TempDir()
	cfg := &Config{DataDir: filepath.Join(base, "whatever"), CacheDir: filepath.Join(base, "whatever", "cache")}
	repairLegacyCacheDir(cfg)
	if cfg.CacheDir != filepath.Join(base, "whatever", "cache") {
		t.Fatalf("认不出旧目录名时不该改动：%q", cfg.CacheDir)
	}
}

// 空 cacheDir 不该 panic（normalize 会在它之前补默认值，但函数本身要稳）。
func TestRepairLegacyCacheDirEmpty(t *testing.T) {
	repairLegacyCacheDir(&Config{DataDir: filepath.Join(t.TempDir(), "LocalMusicPlayer")})
}
