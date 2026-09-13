package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"musicplayer/internal/bootstrap"
)

// newCfgFixture 造一个独立数据目录的配置服务。
func newCfgFixture(t *testing.T) (*ConfigService, string) {
	t.Helper()
	dataDir := t.TempDir()
	t.Setenv("MUSICPLAYER_DATA_DIR", dataDir)
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("创建配置存储失败: %v", err)
	}
	return NewConfigService(store), dataDir
}

// TestLoudnessSettingsPersist 这是用户报过的 bug：
// 「设置 → 响度均衡 → 逐曲均衡」重启后又变回关闭。
//
// 根因有两个，缺一不可地都要覆盖：
//  1. 前端推的 loudnessMode / loudnessTarget / loudnessLimit 三个键
//     根本没写进后端的 applyPatch 白名单，于是被静默丢弃；
//  2. Config 结构体里也没有对应字段，落盘就没有它们。
//
// 所以断言必须跨进程读盘验证，而不是只看内存里的返回值。
func TestLoudnessSettingsPersist(t *testing.T) {
	svc, dataDir := newCfgFixture(t)

	if _, err := svc.Set(map[string]any{
		"loudnessMode":   "track",
		"loudnessTarget": float64(-14),
		"loudnessLimit":  false,
	}); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}

	// 当前返回的配置就得是新值
	got := svc.Get()
	if got.LoudnessMode != "track" {
		t.Fatalf("loudnessMode 未生效: %q", got.LoudnessMode)
	}
	if got.LoudnessTarget != -14 {
		t.Fatalf("loudnessTarget 未生效: %v", got.LoudnessTarget)
	}
	if got.LoudnessLimit {
		t.Fatal("loudnessLimit 未生效（应为 false）")
	}

	// 关键：模拟重启 —— 用同一个数据目录重新加载配置
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("重新加载配置失败: %v", err)
	}
	after := reopened.Get()
	if after.LoudnessMode != "track" {
		t.Fatalf("重启后 loudnessMode 丢失: %q（配置未落盘）", after.LoudnessMode)
	}
	if after.LoudnessTarget != -14 {
		t.Fatalf("重启后 loudnessTarget 丢失: %v", after.LoudnessTarget)
	}
	if after.LoudnessLimit {
		t.Fatal("重启后 loudnessLimit 丢失（应为 false）")
	}

	// 配置文件里必须真的有这三个键
	raw, err := os.ReadFile(filepath.Join(dataDir, "config.json"))
	if err != nil {
		t.Fatalf("读取配置文件失败: %v", err)
	}
	for _, key := range []string{"loudnessMode", "loudnessTarget", "loudnessLimit"} {
		if !containsKey(raw, key) {
			t.Errorf("config.json 里缺少 %q：%s", key, raw)
		}
	}
}

func containsKey(raw []byte, key string) bool {
	return strings.Contains(string(raw), `"`+key+`"`)
}

// TestLoudnessModeRejectsGarbage 非法模式要落回 off，而不是写进配置
// （写进去会让界面显示与实际行为不一致）。
func TestLoudnessModeRejectsGarbage(t *testing.T) {
	svc, _ := newCfgFixture(t)
	if _, err := svc.Set(map[string]any{"loudnessMode": "album"}); err != nil {
		t.Fatal(err)
	}
	if got := svc.Get().LoudnessMode; got != "album" {
		t.Fatalf("album 应被接受，实际 %q", got)
	}
	if _, err := svc.Set(map[string]any{"loudnessMode": "hacker"}); err != nil {
		t.Fatal(err)
	}
	if got := svc.Get().LoudnessMode; got != "off" {
		t.Fatalf("非法模式应落回 off，实际 %q", got)
	}
}

// TestDownloadDirDefaultAndPatch 下载目录默认值来自系统音乐目录，
// 且能被用户改掉并落盘。
func TestDownloadDirDefaultAndPatch(t *testing.T) {
	musicDir := t.TempDir()
	t.Setenv("MUSICPLAYER_MUSIC_DIR", musicDir)

	svc, _ := newCfgFixture(t)
	def := svc.Get().DownloadDir
	want := filepath.Join(musicDir, "downloads")
	if def != want {
		t.Fatalf("默认下载目录应为 %q，实际 %q", want, def)
	}

	custom := filepath.Join(t.TempDir(), "我的下载")
	if _, err := svc.Set(map[string]any{"downloadDir": custom}); err != nil {
		t.Fatal(err)
	}
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if got := reopened.Get().DownloadDir; got != custom {
		t.Fatalf("重启后下载目录丢失: %q（期望 %q）", got, custom)
	}
}

// TestOnlineCoverTogglePersists 在线封面开关同样要落盘。
func TestOnlineCoverTogglePersists(t *testing.T) {
	svc, _ := newCfgFixture(t)
	if _, err := svc.Set(map[string]any{"onlineCover": false}); err != nil {
		t.Fatal(err)
	}
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Get().OnlineCover {
		t.Fatal("onlineCover=false 未落盘")
	}
}

// TestAILyricsCleanTogglePersists 「自动匹配歌词时使用 AI 清洗元数据」开关要落盘。
//
// 这类布尔开关最容易踩设计约束 #8：前端 SYNCED_KEYS 里加了键，
// 但 Go 侧 Config 字段或 applyPatch 白名单漏了一处，就会被静默丢弃，
// 表现为「关掉它、重启又自动打开了」。
func TestAILyricsCleanTogglePersists(t *testing.T) {
	svc, _ := newCfgFixture(t)
	if !svc.Get().AILyricsClean {
		t.Fatal("AILyricsClean 默认应为 true（与加入开关之前的行为一致）")
	}
	if _, err := svc.Set(map[string]any{"aiLyricsClean": false}); err != nil {
		t.Fatal(err)
	}
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Get().AILyricsClean {
		t.Fatal("aiLyricsClean=false 未落盘")
	}
}
