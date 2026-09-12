package main

import (
	"math"
	"os"
	"path/filepath"
	"testing"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/ffmpeg"
	"musicplayer/internal/library"
	"musicplayer/internal/loudness"
)

// newLoudnessFixture 造一个「有一首歌的曲库 + 响度服务」。
// 不依赖真实音乐文件：用 writeTestWAV 生成的 WAV 就够 ffmpeg 测。
func newLoudnessFixture(t *testing.T) (*LoudnessService, *library.Manager, string) {
	t.Helper()
	dataDir := t.TempDir()
	t.Setenv("MUSICPLAYER_DATA_DIR", dataDir)

	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	musicDir := t.TempDir()
	songPath := filepath.Join(musicDir, "tone.wav")
	writeTestWAV(t, songPath, 3)

	if err := store.Update(func(c *bootstrap.Config) {
		c.FilterRules = []bootstrap.FilterRule{} // 别把测试文件过滤掉
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: musicDir, Status: "ok"}}
	}); err != nil {
		t.Fatal(err)
	}

	lib := library.NewManager(store)
	lib.ReloadFolders()
	if _, err := lib.Scan(t.Context(), true); err != nil {
		t.Fatalf("扫描失败: %v", err)
	}
	if len(lib.Songs()) == 0 {
		t.Fatal("测试曲库应至少有一首歌")
	}

	mgr := loudness.NewManager(dataDir, 2)
	return NewLoudnessService(mgr, lib), lib, dataDir
}

// TestLoudnessOnDemandFlow 这是用户要求的核心行为：
// 不需要预先扫描；查询某首歌时若没算过就现算，算完缓存下来，
// 下次（同一标准）直接命中。
func TestLoudnessOnDemandFlow(t *testing.T) {
	if !ffmpeg.Resolve().Available() {
		t.Skip("没有可用的 ffmpeg，跳过按需测量")
	}
	svc, lib, _ := newLoudnessFixture(t)
	song := lib.Songs()[0]
	const target = -16.0

	// 一开始什么都没测
	state := svc.State()
	if state["measured"].(int) != 0 {
		t.Errorf("初始 measured 应为 0，实际 %v", state["measured"])
	}
	if state["onDemand"] != true {
		t.Error("State 应声明 onDemand=true（前端据此走按需路径）")
	}
	if state["total"].(int) != 1 {
		t.Errorf("total 应为 1，实际 %v", state["total"])
	}

	// 查询 → 尚未测量
	res, err := svc.Get(song.ID, target)
	if err != nil {
		t.Fatalf("Get 失败: %v", err)
	}
	if res["measured"] != false {
		t.Error("没算过时应返回 measured=false，而不是编一个增益")
	}

	// 按需测量（前端在开始播放时就是这么调的）
	m, err := svc.Measure(song.ID, target)
	if err != nil {
		t.Fatalf("按需测量失败: %v", err)
	}
	if m["measured"] != true {
		t.Fatalf("测量后 measured 应为 true，实际 %+v", m)
	}
	gainDB, ok := m["gainDB"].(float64)
	if !ok {
		t.Fatalf("应返回 gainDB，实际 %+v", m)
	}
	t.Logf("测得 integrated=%.2f truePeak=%.2f 补偿=%+.2f dB",
		m["integrated"], m["truePeak"], gainDB)

	// 再查应当命中缓存且数值一致
	res2, _ := svc.Get(song.ID, target)
	if res2["measured"] != true {
		t.Fatal("测量后 Get 应命中缓存")
	}
	if math.Abs(res2["gainDB"].(float64)-gainDB) > 1e-9 {
		t.Errorf("缓存里的增益与测量结果不一致: %v vs %v", res2["gainDB"], gainDB)
	}

	// State 应反映「已算好 1 首」
	state = svc.State()
	if state["measured"].(int) != 1 {
		t.Errorf("测量后 measured 应为 1，实际 %v", state["measured"])
	}
	if state["missing"].(int) != 0 {
		t.Errorf("测量后 missing 应为 0，实际 %v", state["missing"])
	}
}

// TestLoudnessTargetChangeInvalidates 改了补偿标准后，缓存必须失效并按新标准重算。
// 这是用户明确提出的要求。
func TestLoudnessTargetChangeInvalidates(t *testing.T) {
	if !ffmpeg.Resolve().Available() {
		t.Skip("没有可用的 ffmpeg，跳过")
	}
	svc, lib, _ := newLoudnessFixture(t)
	song := lib.Songs()[0]

	// 先用 -16 算好
	if _, err := svc.Measure(song.ID, -16); err != nil {
		t.Fatalf("测量失败: %v", err)
	}
	if got := svc.State()["measured"].(int); got != 1 {
		t.Fatalf("measured 应为 1，实际 %d", got)
	}

	// 换成 -23：同一标准下已算好的结果不该再被采用
	res, err := svc.Get(song.ID, -23)
	if err != nil {
		t.Fatalf("Get 失败: %v", err)
	}
	if res["measured"] != false {
		t.Error("换了目标响度后，旧补偿必须失效（否则用户改了标准却没生效）")
	}

	// 前端改标准时会调 InvalidateTarget，清掉不匹配的记录
	out := svc.InvalidateTarget(-23)
	if out["dropped"].(int) != 1 {
		t.Errorf("应丢弃 1 条旧记录，实际 %v", out["dropped"])
	}
	st := out["state"].(map[string]any)
	if st["measured"].(int) != 0 {
		t.Errorf("失效后 measured 应为 0，实际 %v", st["measured"])
	}
	if st["target"].(float64) != -23 {
		t.Errorf("State 里的 target 应为 -23，实际 %v", st["target"])
	}

	// 按新标准重算，增益方向应符合预期
	m, err := svc.Measure(song.ID, -23)
	if err != nil {
		t.Fatalf("按新标准测量失败: %v", err)
	}
	if m["target"].(float64) != -23 {
		t.Errorf("测量结果应记录新标准，实际 %v", m["target"])
	}
	if svc.State()["measured"].(int) != 1 {
		t.Error("重算后 measured 应回到 1")
	}
}

// TestLoudnessGainMapOnlyValidEntries 增益表只应包含当前标准下有效的条目
func TestLoudnessGainMapOnlyValidEntries(t *testing.T) {
	if !ffmpeg.Resolve().Available() {
		t.Skip("没有可用的 ffmpeg，跳过")
	}
	svc, lib, _ := newLoudnessFixture(t)
	song := lib.Songs()[0]

	if _, err := svc.Measure(song.ID, -16); err != nil {
		t.Fatalf("测量失败: %v", err)
	}

	// 当前标准：应有一条
	if m := svc.GainMap(-16); len(m) != 1 {
		t.Errorf("-16 下应返回 1 条增益，实际 %d", len(m))
	}
	// 别的标准：不应返回（否则前端会套用错误的补偿）
	if m := svc.GainMap(-23); len(m) != 0 {
		t.Errorf("-23 下不应返回任何旧补偿，实际 %d 条: %v", len(m), m)
	}
}

// TestLoudnessMeasureMissingSong 不存在的歌曲应报错而不是崩
func TestLoudnessMeasureMissingSong(t *testing.T) {
	svc, _, _ := newLoudnessFixture(t)
	if _, err := svc.Measure("t_nope", -16); err == nil {
		t.Error("不存在的歌曲应返回错误")
	}
	if _, err := svc.Get("t_nope", -16); err == nil {
		t.Error("不存在的歌曲应返回错误")
	}
}

// TestLoudnessStateAfterRestart 缓存要跨进程生效（重启后不用重算）
func TestLoudnessStateAfterRestart(t *testing.T) {
	if !ffmpeg.Resolve().Available() {
		t.Skip("没有可用的 ffmpeg，跳过")
	}
	svc, lib, dataDir := newLoudnessFixture(t)
	song := lib.Songs()[0]

	if _, err := svc.Measure(song.ID, -16); err != nil {
		t.Fatalf("测量失败: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, "loudness-cache.json")); err != nil {
		t.Fatalf("测量后应落盘缓存: %v", err)
	}

	// 新管理器读同一份缓存
	mgr2 := loudness.NewManager(dataDir, 2)
	svc2 := NewLoudnessService(mgr2, lib)
	res, err := svc2.Get(song.ID, -16)
	if err != nil {
		t.Fatalf("Get 失败: %v", err)
	}
	if res["measured"] != true {
		t.Error("重启后应命中缓存，不该重新测量")
	}
	// 但换标准就不该命中
	res3, _ := svc2.Get(song.ID, -23)
	if res3["measured"] != false {
		t.Error("重启后换标准仍应失效")
	}
}
