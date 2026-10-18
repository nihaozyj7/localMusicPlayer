package main

import (
	"path/filepath"
	"strings"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

/* ==========================================================================
   转码缓存的落点必须跟着 config.cacheDir 走
   --------------------------------------------------------------------------
   老版本在 main.go 里写死 DataDir/cache/transcode：设置界面展示的「缓存目录」
   是 cacheDir，但体量最大的那份缓存（600MB 预算的转码产物）不受它控制 ——
   用户把缓存挪到大盘上，几百 MB 仍然堆在 C 盘。

   现在由 transcodeCacheDir 统一派生，main 装配时调用它（同时清一次老落点）。
   ========================================================================== */

func TestTranscodeCacheDirFollowsConfigCacheDir(t *testing.T) {
	cfg := bootstrap.Config{
		DataDir:  filepath.Join(t.TempDir(), "data"),
		CacheDir: filepath.Join(t.TempDir(), "my-cache"),
	}
	got := transcodeCacheDir(cfg)
	want := filepath.Join(cfg.CacheDir, "transcode")
	if got != want {
		t.Fatalf("转码缓存落点 = %q，期望跟着 config.cacheDir 走 = %q", got, want)
	}
	// 与老落点不同：这正是「改了缓存目录，转码缓存还留在 C 盘」的那个 bug
	if got == filepath.Join(cfg.DataDir, "cache", "transcode") {
		t.Fatal("转码缓存仍然落在写死的数据目录下（cacheDir 形同虚设）")
	}
}

func TestTranscodeCacheDirFallsBackToDataDir(t *testing.T) {
	// cacheDir 没填上（理论上 normalize 会补，这里防的是装配顺序/异常配置）
	cfg := bootstrap.Config{DataDir: filepath.Join(t.TempDir(), "data")}
	if got, want := transcodeCacheDir(cfg), filepath.Join(cfg.DataDir, "cache", "transcode"); got != want {
		t.Fatalf("cacheDir 为空时应当退回默认位置 %q，得到 %q", want, got)
	}
}

func TestLegacyTranscodeCacheDirIsTheOldHardcodedPath(t *testing.T) {
	// 旧目录只用于「清一次遗留产物」，路径本身不能变（否则会新建一个死目录）
	t.Setenv("LMPLAYER_DATA_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if got, want := legacyTranscodeCacheDir(store), filepath.Join(store.DataDir(), "cache", "transcode"); got != want {
		t.Fatalf("旧转码缓存目录 = %q，期望 %q", got, want)
	}
}

func TestSameCleanPath(t *testing.T) {
	base := filepath.Join(t.TempDir(), "cache", "transcode")
	cases := []struct {
		a, b string
		want bool
	}{
		{base, base, true},
		{base, base + string(filepath.Separator), true},
		{base, filepath.Join(base, "..", "transcode"), true},
		{base, strings.ToUpper(base), true}, // Windows 路径大小写不敏感
		{base, base + "2", false},
	}
	for _, c := range cases {
		if got := sameCleanPath(c.a, c.b); got != c.want {
			t.Errorf("sameCleanPath(%q, %q) = %v，期望 %v", c.a, c.b, got, c.want)
		}
	}
}
