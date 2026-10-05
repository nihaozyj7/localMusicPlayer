package main

import (
	"math"
	"os"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/ffmpeg"
	"localmusicplayer/internal/library"
	"localmusicplayer/internal/loudness"
)

// newLoudnessFixture 造一个「有一首歌的曲库 + 响度服务」。
// 不依赖真实音乐文件：用 writeTestWAV 生成的 WAV 就够 ffmpeg 测。
func newLoudnessFixture(t *testing.T) (*LoudnessService, *library.Manager, string) {
	t.Helper()
	dataDir := t.TempDir()
	t.Setenv("LMPLAYER_DATA_DIR", dataDir)

	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	musicDir := t.TempDir()
	songPath := filepath.Join(musicDir, "tone.wav")
	writeTestWAV(t, songPath, 3)

	if err := store.Update(func(c *bootstrap.Config) {
		c.FilterRules = []bootstrap.FilterRule{} // 别把测试文件过滤掉
		c.DownloadDir = hermeticDownloadDir(t)   // 别扫到本机真实的下载目录
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
// 下次直接命中。
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
	// State 要暴露测量并发（用户要求「限制资源、并发 2」）
	if got := state["concurrency"].(int); got != 2 {
		t.Errorf("并发应为 2，实际 %d", got)
	}
	// 已记账的挡位增益条数（一万首 × 四挡 = 四万，用于回答"换挡位要不要重算"）
	if got := state["gains"].(int); got < 1 {
		t.Errorf("至少应有一条挡位增益，实际 %d", got)
	}
}

/* --------------------------------------------------------------------------
   ★ 换挡位不丢数据、不重算
   --------------------------------------------------------------------------
   用户报的问题：
     「我从较响改为默认的时候，以前在"较响"这个挡位计算的响度补偿丢失了。
       这显然是不对的，这些数据应该持久化复用得到。」
   根因是旧实现把 target 当作测量记录的有效性条件，换挡位时旧记录整条作废、
   还被 InvalidateTarget 删掉。现在测量与挡位解耦，下面这组测试钉住新语义。
   -------------------------------------------------------------------------- */

// TestLoudnessTargetChangeKeepsAllGains 换挡位必须立刻有值、且不丢旧挡位
func TestLoudnessTargetChangeKeepsAllGains(t *testing.T) {
	if !ffmpeg.Resolve().Available() {
		t.Skip("没有可用的 ffmpeg，跳过")
	}
	svc, lib, _ := newLoudnessFixture(t)
	song := lib.Songs()[0]

	// 先在「较响」(-14) 挡位算好
	if _, err := svc.Measure(song.ID, -14); err != nil {
		t.Fatalf("测量失败: %v", err)
	}
	if got := svc.State()["measured"].(int); got != 1 {
		t.Fatalf("measured 应为 1，实际 %d", got)
	}
	before, err := svc.Get(song.ID, -14)
	if err != nil {
		t.Fatalf("Get 失败: %v", err)
	}
	if before["measured"] != true {
		t.Fatal("-14 挡位应有值")
	}
	gain14 := before["gainDB"].(float64)

	// 切到「默认」(-16)：必须**立刻**有值（不需要重测、更不该是 measured=false）
	res, err := svc.Get(song.ID, -16)
	if err != nil {
		t.Fatalf("Get 失败: %v", err)
	}
	if res["measured"] != true {
		t.Fatal("换挡位后应立刻算出增益 —— 测量结果与挡位无关，不该失效")
	}
	gain16 := res["gainDB"].(float64)
	if math.Abs((gain14-gain16)-2) > 0.011 {
		t.Errorf("-14 与 -16 的增益差应为 2 dB，实际 %.2f", gain14-gain16)
	}

	// 前端换挡位时会调 InvalidateTarget —— 它现在什么都不该删
	out := svc.InvalidateTarget(-16)
	if out["dropped"].(int) != 0 {
		t.Errorf("换挡位不该丢弃任何记录，实际丢了 %v", out["dropped"])
	}
	st := out["state"].(map[string]any)
	if st["measured"].(int) != 1 {
		t.Errorf("换挡位后 measured 应保持 1（测量与挡位无关），实际 %v", st["measured"])
	}
	if st["target"].(float64) != -16 {
		t.Errorf("State 里的 target 应为 -16，实际 %v", st["target"])
	}

	// ★ 切回去时，旧挡位算好的补偿必须还在（这就是用户要的"持久化复用"）
	back, err := svc.Get(song.ID, -14)
	if err != nil {
		t.Fatalf("切回 -14 时 Get 失败: %v", err)
	}
	if back["measured"] != true {
		t.Fatal("切回旧挡位时，之前算好的补偿丢了 —— 这正是用户报的 bug")
	}
	if math.Abs(back["gainDB"].(float64)-gain14) > 1e-9 {
		t.Errorf("切回 -14 的增益 = %.4f，期望仍是 %.4f", back["gainDB"], gain14)
	}
}

// TestLoudnessGainMapCoversEveryTarget 每个挡位都能拿到整库增益（且不用重测）
func TestLoudnessGainMapCoversEveryTarget(t *testing.T) {
	if !ffmpeg.Resolve().Available() {
		t.Skip("没有可用的 ffmpeg，跳过")
	}
	svc, lib, _ := newLoudnessFixture(t)
	song := lib.Songs()[0]

	// 只测一次（-16）
	if _, err := svc.Measure(song.ID, -16); err != nil {
		t.Fatalf("测量失败: %v", err)
	}
	measuredAt := svc.mgr.Count()

	// 四个挡位都应当有整库增益 —— 且不产生任何新的测量
	for _, target := range []float64{-14, -16, -18, -23} {
		m := svc.GainMap(target)
		if len(m) != 1 {
			t.Errorf("挡位 %.0f 下应返回 1 条增益，实际 %d 条", target, len(m))
		}
	}
	if svc.mgr.Count() != measuredAt {
		t.Error("换挡位不该产生新的测量记录（说明发生了重测）")
	}
	// 用户要的规模：一首歌已在多个挡位留下记录，且这些记录会持久化
	if got := svc.mgr.GainCount(); got < 4 {
		t.Errorf("四个挡位各应留下一条增益记录，实际共 %d 条", got)
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

// TestLoudnessOnlineTrackIsMeasurable 在线试听曲目必须也能测量。
//
// 这是「在线试听不受响度均衡约束」这条用户报障的回归测试：
// 在线曲目的 id 形如 bili:BVxxx，**不在曲库里**，修复前 Get/Measure 会以
// 「歌曲不存在」直接失败，于是它永远拿不到补偿。
//
// 现在经 setVirtualResolver 注入的虚拟表兜底，只要音频已经落到本地缓存
// （其 Path/Size/ModTime 已登记）就能像本地文件一样测量。
func TestLoudnessOnlineTrackIsMeasurable(t *testing.T) {
	if !ffmpeg.Resolve().Available() {
		t.Skip("没有可用的 ffmpeg，跳过按需测量")
	}
	svc, _, _ := newLoudnessFixture(t)

	// 造一首「在线曲目」：一个真实的 WAV 文件 + 一个曲库里不存在的 id。
	// 形状照着 media.Server.RegisterVirtual 登记的 Song 来。
	onlinePath := filepath.Join(t.TempDir(), "online.m4a")
	writeTestWAV(t, onlinePath, 3)
	st, err := os.Stat(onlinePath)
	if err != nil {
		t.Fatal(err)
	}
	const onlineID = "bili:BV1xx411c7mD"
	onlineSong := bootstrap.Song{
		ID:      onlineID,
		Path:    onlinePath,
		Ext:     "wav",
		Title:   "在线试听",
		Size:    st.Size(),
		ModTime: st.ModTime().UnixMilli(),
	}

	svc.setVirtualResolver(func(id string) (bootstrap.Song, bool) {
		if id == onlineID {
			return onlineSong, true
		}
		return bootstrap.Song{}, false
	})

	// 修复前这里会报「歌曲不存在」
	res, err := svc.Get(onlineID, -16)
	if err != nil {
		t.Fatalf("在线曲目的 Get 不应失败: %v", err)
	}
	if res["measured"] != false {
		t.Error("首次查询应为未测量（按需路径的起点）")
	}

	m, err := svc.Measure(onlineID, -16)
	if err != nil {
		t.Fatalf("在线曲目应能测量: %v", err)
	}
	if m["measured"] != true {
		t.Error("测量后 measured 应为 true")
	}
	if gain, ok := m["gainDB"].(float64); !ok || math.IsNaN(gain) {
		t.Errorf("应给出可用的补偿增益，实际 %v", m["gainDB"])
	}

	// 测出来的记录要进同一个缓存，第二次直接命中（不重复跑 ffmpeg）
	again, err := svc.Get(onlineID, -16)
	if err != nil {
		t.Fatalf("二次 Get 失败: %v", err)
	}
	if again["measured"] != true {
		t.Error("二次查询应命中缓存")
	}

	// 换标准：同样应当**立刻**有值（测量与挡位无关）
	res3, _ := svc.Get(onlineID, -23)
	if res3["measured"] != true {
		t.Error("换标准后在线曲目也应立刻算出增益（测量已缓存）")
	}
}

// TestLoudnessOnlineTrackStaysOutOfBatchMaps 在线曲目不应进入 GainMap / AlbumGains。
//
// 「按专辑统一」对在线曲目没有意义（它们没有本地专辑归属），而 GainMap 是
// 随曲库变化的批量表 —— 把易失的在线条目混进去只会让前端拿到过期增益。
// 在线曲目只走 track 模式的按需路径。
func TestLoudnessOnlineTrackStaysOutOfBatchMaps(t *testing.T) {
	if !ffmpeg.Resolve().Available() {
		t.Skip("没有可用的 ffmpeg，跳过")
	}
	svc, _, _ := newLoudnessFixture(t)

	onlinePath := filepath.Join(t.TempDir(), "online.m4a")
	writeTestWAV(t, onlinePath, 3)
	st, err := os.Stat(onlinePath)
	if err != nil {
		t.Fatal(err)
	}
	const onlineID = "bili:BV1xx411c7mD"
	svc.setVirtualResolver(func(id string) (bootstrap.Song, bool) {
		if id == onlineID {
			return bootstrap.Song{
				ID: onlineID, Path: onlinePath, Ext: "wav",
				Size: st.Size(), ModTime: st.ModTime().UnixMilli(),
			}, true
		}
		return bootstrap.Song{}, false
	})

	if _, err := svc.Measure(onlineID, -16); err != nil {
		t.Fatalf("测量失败: %v", err)
	}

	// 曲库那一首还没测，所以两张批量表都应当是空的 ——
	// 若实现改成「遍历缓存」，在线条目就会漏进这里。
	if m := svc.GainMap(-16); len(m) != 0 {
		t.Errorf("在线曲目不该出现在 GainMap 里，实际 %v", m)
	}
	if m := svc.AlbumGains(-16); len(m) != 0 {
		t.Errorf("在线曲目不该出现在 AlbumGains 里，实际 %v", m)
	}
}

// TestLoudnessWithoutVirtualResolver 没注入虚拟表时行为与修复前一致。
// main.go 之外的调用方（测试、工具）不该因为这次改动而改变语义。
func TestLoudnessWithoutVirtualResolver(t *testing.T) {
	svc, _, _ := newLoudnessFixture(t)
	if _, err := svc.Get("bili:BVnope", -16); err == nil {
		t.Error("没有虚拟表时，在线 id 应仍报「歌曲不存在」")
	}
	// 曲库内的歌不受影响
	if _, err := svc.Get("t_nope", -16); err == nil {
		t.Error("不存在的歌曲应返回错误")
	}
}

// TestLoudnessStateAfterRestart 缓存要跨进程生效（重启后不用重算），
// 而且**所有挡位**的补偿都要回来 —— 用户要的「持久化复用」。
func TestLoudnessStateAfterRestart(t *testing.T) {
	if !ffmpeg.Resolve().Available() {
		t.Skip("没有可用的 ffmpeg，跳过")
	}
	svc, lib, dataDir := newLoudnessFixture(t)
	song := lib.Songs()[0]

	if _, err := svc.Measure(song.ID, -14); err != nil {
		t.Fatalf("测量失败: %v", err)
	}
	// 顺便把另外几个挡位也算一次（模拟用户切过挡位）
	for _, target := range []float64{-16, -18, -23} {
		svc.GainMap(target)
	}
	before, _ := svc.Get(song.ID, -14)
	gain14 := before["gainDB"].(float64)

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
	// ★ 重启后其它挡位也必须还在（用户切过的每一个挡位都持久化了）
	for _, target := range []float64{-14, -16, -18, -23} {
		r, err := svc2.Get(song.ID, target)
		if err != nil {
			t.Fatalf("挡位 %.0f 的 Get 失败: %v", target, err)
		}
		if r["measured"] != true {
			t.Errorf("重启后挡位 %.0f 的补偿丢了", target)
		}
	}
	back, _ := svc2.Get(song.ID, -14)
	if math.Abs(back["gainDB"].(float64)-gain14) > 1e-9 {
		t.Errorf("重启后 -14 的增益 = %.4f，期望 %.4f", back["gainDB"], gain14)
	}
}

// TestLoudnessStoreMeasurementFromTranscode 「转码时顺手测量」的入口要能落库。
//
// 这是测量提速的关键路径（见 media.Server.SetLoudnessSink）：
// 转码播放本来就要解码整首歌，顺手把响度算出来即可，不再需要第二遍解码。
func TestLoudnessStoreMeasurementFromTranscode(t *testing.T) {
	svc, lib, _ := newLoudnessFixture(t)
	song := lib.Songs()[0]

	if svc.mgr.Count() != 0 {
		t.Fatal("初始不该有任何测量记录")
	}

	// 模拟 media 转码钩子交回来的结果
	svc.StoreMeasurement(song, loudness.Measurement{
		Integrated: -20.5, TruePeak: -8, LRA: 3.2, Threshold: -30.5, Measured: true,
	})

	// 测量记录要进库，而且**不需要跑 ffmpeg**就能给出增益
	if svc.mgr.Count() != 1 {
		t.Fatalf("应有一条测量记录，实际 %d", svc.mgr.Count())
	}
	res, err := svc.Get(song.ID, -16)
	if err != nil {
		t.Fatalf("Get 失败: %v", err)
	}
	if res["measured"] != true {
		t.Fatal("顺手测出来的结果应能立刻用于补偿")
	}
	if got := res["integrated"].(float64); math.Abs(got-(-20.5)) > 1e-9 {
		t.Errorf("响度值 = %.2f，期望 -20.5", got)
	}
	// -16 目标、-20.5 实测 ⇒ +4.5 dB（真峰值 -8 允许抬到 +7，不触发保护）
	if got := res["gainDB"].(float64); math.Abs(got-4.5) > 1e-9 {
		t.Errorf("增益 = %.2f，期望 +4.50", got)
	}
	// State 要立刻反映出来（用户看到「已测量 1 首」）
	if got := svc.State()["measured"].(int); got != 1 {
		t.Errorf("measured 应为 1，实际 %d", got)
	}
}

// TestLoudnessStoreMeasurementSkipsEmpty 空结果不该留下「测过但没数据」的记录
func TestLoudnessStoreMeasurementSkipsEmpty(t *testing.T) {
	svc, lib, _ := newLoudnessFixture(t)
	song := lib.Songs()[0]

	svc.StoreMeasurement(song, loudness.Measurement{})
	if svc.mgr.Count() != 0 {
		t.Error("空结果不该写进缓存（否则会挡住后续的正常测量）")
	}

	res, _ := svc.Get(song.ID, -16)
	if res["measured"] != false {
		t.Error("没有有效测量结果时应返回 measured=false")
	}
}

// TestLoudnessSinkIgnoresOnlineSongs 转码钩子不该给在线曲目写缓存。
//
// 在线曲目的 Size/ModTime 来自虚拟表，与曲库记录口径不同 ——
// 硬写进去只会留下一条很快过期的记录。它们仍走按需测量路径。
//
// 这条规则实现在 main.go 的钩子里，判据就是既有的 onlineBVID
// （与播放链路识别在线曲目用的是同一个函数，避免两处判据分叉）。
func TestLoudnessSinkIgnoresOnlineSongs(t *testing.T) {
	const onlineID = "bili:BV1xx411c7mD"
	if _, ok := onlineBVID(onlineID); !ok {
		t.Error("bili: 前缀的 id 应被识别为在线曲目")
	}
	if _, ok := onlineBVID("t_abc123"); ok {
		t.Error("本地曲库 id 不该被当成在线曲目")
	}
	// 空 bvid 不算在线曲目（防止有人把 "bili:" 当成有效 id）
	if _, ok := onlineBVID("bili:"); ok {
		t.Error("只有前缀、没有 bvid 的 id 不该被当成在线曲目")
	}
}
