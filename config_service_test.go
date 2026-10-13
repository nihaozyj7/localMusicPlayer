package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

// newCfgFixture 造一个独立数据目录的配置服务。
func newCfgFixture(t *testing.T) (*ConfigService, string) {
	t.Helper()
	dataDir := t.TempDir()
	t.Setenv("LMPLAYER_DATA_DIR", dataDir)
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
	t.Setenv("LMPLAYER_MUSIC_DIR", musicDir)

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

// TestOnlineWordLyricsTogglePersists 「优先使用逐字歌词」开关要落盘。
//
// 这个开关决定要不要去解析第三方的私有歌词编码（QQ 的 QRC / 酷狗的 KRC，
// 见 docs/43 的 H2）。如果它被静默丢弃，用户关掉之后重启又「自动打开」——
// 那就等于这个开关根本不存在，而用户以为自己已经关掉了。
func TestOnlineWordLyricsTogglePersists(t *testing.T) {
	svc, _ := newCfgFixture(t)
	if !svc.Get().OnlineWordLyrics {
		t.Fatal("OnlineWordLyrics 默认应为 true（与加入开关之前的行为一致）")
	}
	if _, err := svc.Set(map[string]any{"onlineWordLyrics": false}); err != nil {
		t.Fatal(err)
	}
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Get().OnlineWordLyrics {
		t.Fatal("onlineWordLyrics=false 未落盘")
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

// TestAIDownloadTagTogglePersists 「下载歌曲时用 AI 整理元数据」开关要落盘。
//
// 与上一个开关同一类陷阱（设计约束 #8）：前端 SYNCED_KEYS 里加了键、
// Go 侧 Config 字段或 applyPatch 白名单漏了一处，就会被静默丢弃。
//
// 这个开关漏掉的后果比歌词清洗更严重：它管的是**写回用户文件**。
// 用户在设置里关掉它，重启后又被打开 —— 下次下载会在他不知情的情况下
// 改写文件标签，而且写回是不可撤销的。
func TestAIDownloadTagTogglePersists(t *testing.T) {
	svc, _ := newCfgFixture(t)
	if !svc.Get().AIDownloadTag {
		t.Fatal("AIDownloadTag 默认应为 true（整理在下载结束后后台进行，不占用户等待时间）")
	}
	if _, err := svc.Set(map[string]any{"aiDownloadTag": false}); err != nil {
		t.Fatal(err)
	}
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Get().AIDownloadTag {
		t.Fatal("aiDownloadTag=false 未落盘（重启后会自动改写用户的音乐文件）")
	}

	// 再打开也要落盘（两个方向都测，避免只写死了「false」这一条路径）
	if _, err := svc.Set(map[string]any{"aiDownloadTag": true}); err != nil {
		t.Fatal(err)
	}
	again, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if !again.Get().AIDownloadTag {
		t.Fatal("aiDownloadTag=true 未落盘")
	}
}

// TestAutoDownloadOnCollectTogglePersists 「收藏时自动下载到本地」开关要落盘。
//
// 同一类陷阱（设计约束 #8）：前端 SYNCED_KEYS、Go 字段、applyPatch 三处漏一处
// 就会被静默丢弃。这里漏掉的后果是「用户关掉了自动下载，重启后又开始下」——
// 而那会产生真实的网络请求与磁盘占用。
func TestAutoDownloadOnCollectTogglePersists(t *testing.T) {
	svc, _ := newCfgFixture(t)
	if !svc.Get().AutoDownloadOnCollect {
		t.Fatal("AutoDownloadOnCollect 默认应为 true（收藏是长期意图，试听缓存可丢弃）")
	}
	if _, err := svc.Set(map[string]any{"autoDownloadOnCollect": false}); err != nil {
		t.Fatal(err)
	}
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Get().AutoDownloadOnCollect {
		t.Fatal("autoDownloadOnCollect=false 未落盘（重启后会继续偷偷下载）")
	}

	if _, err := svc.Set(map[string]any{"autoDownloadOnCollect": true}); err != nil {
		t.Fatal(err)
	}
	again, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if !again.Get().AutoDownloadOnCollect {
		t.Fatal("autoDownloadOnCollect=true 未落盘")
	}
}

// TestResetKeepsWritingToDisk 「恢复默认设置」之后设置必须还能存进磁盘。
//
// 对应审查报告第 9 条（高危）。旧实现是 `*c = *def`，而 DefaultConfig() 里
// ConfigPath 是**空的**（真实路径由 NewStore 在运行时按 DataDir 拼出来），
// 于是 Reset 顺手把「往哪儿落盘」一起清掉了：此后所有设置改动都只改内存，
// 重启即丢，报错是 `rename .3.tmp : The system cannot find the path specified`。
//
// 断言必须跨进程读盘（重新 NewStore），只看内存返回值是看不出这个 bug 的。
func TestResetKeepsWritingToDisk(t *testing.T) {
	dataDir := t.TempDir()
	t.Setenv("LMPLAYER_DATA_DIR", dataDir)
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("创建配置存储失败: %v", err)
	}
	svc := NewConfigService(store)

	// 先放一个文件夹进去：Reset 的既有语义是「保留文件夹列表」。
	// （文件夹不走 applyPatch，是 LibraryService 的专属动作，这里直接写 store。）
	folder := filepath.Join(dataDir, "music")
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = append(c.Folders, bootstrap.Folder{ID: "f1", Path: folder})
	}); err != nil {
		t.Fatal(err)
	}

	cfgs := svc.Path()
	if strings.TrimSpace(cfgs) == "" {
		t.Fatal("Reset 之前配置路径就已经是空的")
	}
	if _, err := svc.Reset(); err != nil {
		t.Fatalf("恢复默认设置失败: %v", err)
	}

	// ① 路径当场就得还在
	if got := svc.Path(); got != cfgs {
		t.Fatalf("Reset 之后配置路径 = %q，期望仍是 %q", got, cfgs)
	}
	// ② 文件夹列表保留（既有语义）
	if got := svc.Get().Folders; len(got) != 1 || got[0].Path != folder {
		t.Fatalf("Reset 之后 folders = %+v，期望保留那一个文件夹", got)
	}

	// ③ 关键：Reset 之后再改设置，**重启还在**
	if _, err := svc.Set(map[string]any{"lyricsFontSize": 26}); err != nil {
		t.Fatalf("Reset 之后写配置失败: %v", err)
	}
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if got := reopened.Get().LyricsFontSize; got != 26 {
		t.Fatalf("重启后 lyricsFontSize = %d，期望 26 —— Reset 把配置路径清掉了，改动只留在内存里", got)
	}
}
