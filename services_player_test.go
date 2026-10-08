/* ==========================================================================
   services_player_test.go — PlayerService 的桥接层测试
   --------------------------------------------------------------------------
   为什么单独测这一层：internal/audioplay 已经测得很细（引擎、频谱、
   真声卡播放），但前端**直接对话的是 PlayerService**，它自己有一套
   容易出错的逻辑：
     · 加锁范围（Load 里要在转码前后放锁/取锁、fail 会自己取锁）
     · 音量 × 响度补偿的合成与钳位
     · seek 的范围钳制
     · 事件锚点的节流（不该推的不推、该立刻推的不能吞）
     · 并发调用不能死锁

   这一层出错的表现都是「前端卡住」或「声音不对」，而且不会崩，
   所以必须有测试兜住。
   ========================================================================== */

package main

import (
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"localmusicplayer/internal/audioplay"
	"localmusicplayer/internal/bootstrap"
)

/* --------------------------------------------------------------------------
   测试替身
   -------------------------------------------------------------------------- */

// fakeEmitter 记录事件，供断言「该不该推、推了什么」。
type fakeEmitter struct {
	mu     sync.Mutex
	events []fakeEvent
}

type fakeEvent struct {
	name    string
	payload map[string]any
}

func (f *fakeEmitter) Emit(name string, payload any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	m, _ := payload.(map[string]any)
	f.events = append(f.events, fakeEvent{name: name, payload: m})
}

func (f *fakeEmitter) count(name string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, e := range f.events {
		if e.name == name {
			n++
		}
	}
	return n
}

func (f *fakeEmitter) last(name string) map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := len(f.events) - 1; i >= 0; i-- {
		if f.events[i].name == name {
			return f.events[i].payload
		}
	}
	return nil
}

func (f *fakeEmitter) reset() {
	f.mu.Lock()
	f.events = nil
	f.mu.Unlock()
}

/* --------------------------------------------------------------------------
   构造测试用 WAV（与 audioplay 包内的测试同一套约定：44 字节头 + PCM）
   -------------------------------------------------------------------------- */

func writeServiceTestWAV(t *testing.T, path string, seconds float64) {
	t.Helper()
	frames := int(float64(audioplay.SampleRate) * seconds)
	pcm := make([]byte, frames*audioplay.FrameSize)
	for i := 0; i < frames; i++ {
		v := int16(18000 * math.Sin(2*math.Pi*440*float64(i)/float64(audioplay.SampleRate)))
		binary.LittleEndian.PutUint16(pcm[i*audioplay.FrameSize:], uint16(v))
		binary.LittleEndian.PutUint16(pcm[i*audioplay.FrameSize+2:], uint16(v))
	}

	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("创建测试 WAV 失败: %v", err)
	}
	defer f.Close()

	dataLen := uint32(len(pcm))
	h := make([]byte, 0, 44)
	put32 := func(v uint32) { b := make([]byte, 4); binary.LittleEndian.PutUint32(b, v); h = append(h, b...) }
	put16 := func(v uint16) { b := make([]byte, 2); binary.LittleEndian.PutUint16(b, v); h = append(h, b...) }
	h = append(h, []byte("RIFF")...)
	put32(36 + dataLen)
	h = append(h, []byte("WAVE")...)
	h = append(h, []byte("fmt ")...)
	put32(16)
	put16(1)
	put16(audioplay.Channels)
	put32(audioplay.SampleRate)
	put32(audioplay.SampleRate * audioplay.FrameSize)
	put16(audioplay.FrameSize)
	put16(16)
	h = append(h, []byte("data")...)
	put32(dataLen)
	if _, err := f.Write(h); err != nil {
		t.Fatalf("写头失败: %v", err)
	}
	if _, err := f.Write(pcm); err != nil {
		t.Fatalf("写 PCM 失败: %v", err)
	}
}

// newPlayerSvcHarness 造一个后端可用的 PlayerService；声卡打不开就跳过（CI 场景）。
//
// 命名刻意带上 player：services_test.go 里已经有一个 newTestService
// （构造 LibraryService），同名会编译不过。
func newPlayerSvcHarness(t *testing.T, wavPath string, durationMs int64) (*PlayerService, *fakeEmitter, func()) {
	t.Helper()
	svc := NewPlayerService(func(songID string) (string, int64, error) {
		if wavPath == "" {
			return "", 0, fmt.Errorf("测试：没有可播放的文件")
		}
		return wavPath, durationMs, nil
	})
	em := &fakeEmitter{}
	svc.setApp(em)
	if !svc.Start() {
		t.Skip("本机没有可用的音频设备，跳过 PlayerService 端到端测试")
	}
	var once sync.Once
	cleanup := func() {
		once.Do(func() {
			svc.Stop()
			// 等 feeder 退出，避免 Windows 上文件句柄未释放导致删不掉
			time.Sleep(80 * time.Millisecond)
		})
	}
	t.Cleanup(cleanup)
	return svc, em, cleanup
}

func tempDirFor(t *testing.T) string {
	t.Helper()
	dir, err := os.MkdirTemp("", "playersvc-test")
	if err != nil {
		t.Fatalf("建临时目录失败: %v", err)
	}
	return dir
}

func cleanupDir(dir string) {
	for i := 0; i < 20; i++ {
		if err := os.RemoveAll(dir); err == nil {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}

/* --------------------------------------------------------------------------
   1. 可用性与事件
   -------------------------------------------------------------------------- */

// TestPlayerServiceAvailableReportsReady Start 成功后 Available 必须为 true，
// 并广播 player:ready{available:true} —— 前端据此决定走哪条链路。
func TestPlayerServiceAvailableReportsReady(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 2.0)

	svc, em, closeSvc := newPlayerSvcHarness(t, wav, 2000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	av := svc.Available()
	if av["available"] != true {
		t.Fatalf("available = %v，期望 true", av["available"])
	}
	if av["sampleRate"] != audioplay.SampleRate {
		t.Errorf("sampleRate = %v，期望 %d", av["sampleRate"], audioplay.SampleRate)
	}
	if em.count(playerReadyEvent) != 1 {
		t.Errorf("player:ready 事件数 = %d，期望 1", em.count(playerReadyEvent))
	}
	if p := em.last(playerReadyEvent); p["available"] != true {
		t.Errorf("player:ready 载荷 available = %v，期望 true", p["available"])
	}
}

// TestPlayerServiceAvailableWithoutStart 没 Start 时必须是 available=false，
// 前端据此回退到 <audio>（不能假装可用然后播放没反应）。
func TestPlayerServiceAvailableWithoutStart(t *testing.T) {
	svc := NewPlayerService(func(string) (string, int64, error) { return "", 0, nil })
	av := svc.Available()
	if av["available"] != false {
		t.Errorf("未 Start 时 available = %v，期望 false", av["available"])
	}
	// 未就绪时 Load 应当报错而不是静默成功
	if _, err := svc.Load("song-1"); err == nil {
		t.Error("未就绪时 Load 应当返回错误")
	}
}

// TestPlayerServiceLoadEmptyID 空 id 必须直接报错（防前端传 undefined）
func TestPlayerServiceLoadEmptyID(t *testing.T) {
	svc := NewPlayerService(func(string) (string, int64, error) { return "", 0, nil })
	if _, err := svc.Load(""); err == nil {
		t.Error("空歌曲 id 应当返回错误")
	}
}

/* --------------------------------------------------------------------------
   2. 真实播放（端到端，经服务层）
   -------------------------------------------------------------------------- */

// TestPlayerServiceLoadPlayPause 走完整链路：Load → Play → 位置推进 → Pause 停住。
func TestPlayerServiceLoadPlayPause(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 3.0)

	svc, em, closeSvc := newPlayerSvcHarness(t, wav, 3000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	res, err := svc.Load("song-1")
	if err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	if d := res["durationMs"].(int64); d < 2900 || d > 3100 {
		t.Errorf("durationMs = %d，期望约 3000", d)
	}

	svc.Play()
	time.Sleep(700 * time.Millisecond)

	st := svc.State()
	if st["playing"] != true {
		t.Error("Play 后 playing 应当为 true")
	}
	pos := st["positionMs"].(int64)
	if pos < 300 {
		t.Errorf("播放 700ms 后位置只有 %dms，音频没推进", pos)
	}
	if em.count(playerStateEvent) == 0 {
		t.Error("应当推送过 player:state 锚点")
	}

	svc.Pause()
	time.Sleep(300 * time.Millisecond)
	pausePos := svc.State()["positionMs"].(int64)
	time.Sleep(400 * time.Millisecond)
	laterPos := svc.State()["positionMs"].(int64)
	if svc.State()["playing"] != false {
		t.Error("Pause 后 playing 应当为 false")
	}
	if laterPos-pausePos > 120 {
		t.Errorf("暂停后位置仍在推进：%d → %d", pausePos, laterPos)
	}
}

// TestPlayerServiceSeekClamps 越界 seek 必须被钳制，不能把播放搞乱。
func TestPlayerServiceSeekClamps(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 4.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 4000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	if _, err := svc.Load("song-1"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()

	// 负数 → 钳到 0
	if _, err := svc.Seek(-5000); err != nil {
		t.Fatalf("seek 负数报错: %v", err)
	}
	if p := svc.State()["positionMs"].(int64); p > 120 {
		t.Errorf("seek 负数后位置 = %d，期望接近 0", p)
	}

	// 超过时长 → 钳到末尾
	if _, err := svc.Seek(999999); err != nil {
		t.Fatalf("seek 超界报错: %v", err)
	}
	p := svc.State()["positionMs"].(int64)
	if p < 3900 || p > 4100 {
		t.Errorf("seek 超界后位置 = %d，期望约 4000（钳到末尾）", p)
	}

	// 正常值精确生效
	if _, err := svc.Seek(2000); err != nil {
		t.Fatalf("seek 2000 报错: %v", err)
	}
	p = svc.State()["positionMs"].(int64)
	if p < 1800 || p > 2250 {
		t.Errorf("seek 到 2000ms 后位置 = %d", p)
	}
}

// TestPlayerServiceSeekBeforeLoad 未装载时 seek 不该报错也不该崩
// （前端可能在还没切歌时拖进度条）。
func TestPlayerServiceSeekBeforeLoad(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 1.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 1000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	if _, err := svc.Seek(1000); err != nil {
		t.Errorf("未装载时 seek 不该报错，实际: %v", err)
	}
}

// TestPlayerServiceUnload 卸载后状态必须归零、不再播放。
func TestPlayerServiceUnload(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 3.0)

	svc, em, closeSvc := newPlayerSvcHarness(t, wav, 3000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	if _, err := svc.Load("song-1"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()
	time.Sleep(300 * time.Millisecond)

	em.reset()
	st := svc.Unload()
	if st["playing"] != false {
		t.Error("Unload 后 playing 应当为 false")
	}
	if st["loaded"] != false {
		t.Error("Unload 后 loaded 应当为 false")
	}
	if st["songId"] != "" {
		t.Errorf("Unload 后 songId = %v，期望空", st["songId"])
	}
	if em.count(playerStateEvent) == 0 {
		t.Error("Unload 应当立刻推一个锚点（位置归零）")
	}
}

/* --------------------------------------------------------------------------
   3. 音量 / 静音 / 响度补偿的合成
   -------------------------------------------------------------------------- */

// TestPlayerServiceGainComposition 验证「用户音量 × 响度补偿」确实合成到了引擎上。
//
// 这里直接读引擎的增益目标值（gainState 的 target）——
// 那是唯一能确认合成结果的地方。
func TestPlayerServiceGainComposition(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 2.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 2000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	cases := []struct {
		name      string
		volume    float64
		muted     bool
		gainDB    float64
		wantLin   float64
		tolerance float64
	}{
		{"音量1无补偿", 1.0, false, 0, 1.0, 0.001},
		{"音量0.5无补偿", 0.5, false, 0, 0.5, 0.001},
		{"音量1补偿+6dB", 1.0, false, 6, math.Pow(10, 6.0/20), 0.01},
		{"音量0.5补偿-6dB", 0.5, false, -6, 0.5 * math.Pow(10, -6.0/20), 0.01},
		{"静音（音量1）", 1.0, true, 0, 0, 0.001},
		{"静音但有补偿", 1.0, true, 12, 0, 0.001},
	}

	for _, c := range cases {
		svc.SetVolume(c.volume, c.muted)
		svc.SetLoudnessGain(c.gainDB)
		got := svc.engine.GainTarget()
		if math.Abs(got-c.wantLin) > c.tolerance {
			t.Errorf("%s：合成增益 = %.5f，期望 %.5f", c.name, got, c.wantLin)
		}
	}
}

// TestPlayerServiceVolumeClamped 音量越界必须被钳到 0..1。
func TestPlayerServiceVolumeClamped(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 1.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 1000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	svc.SetVolume(5.0, false)
	if g := svc.engine.GainTarget(); math.Abs(g-1.0) > 0.001 {
		t.Errorf("音量 5.0 应钳到 1.0，实际增益 %.4f", g)
	}
	svc.SetVolume(-3.0, false)
	if g := svc.engine.GainTarget(); math.Abs(g) > 0.001 {
		t.Errorf("音量 -3.0 应钳到 0，实际增益 %.4f", g)
	}
}

// TestPlayerServiceLoudnessClamped 响度补偿必须钳在 ±24dB（与前端 computeGain 一致）。
func TestPlayerServiceLoudnessClamped(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 1.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 1000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	svc.SetVolume(1.0, false)

	svc.SetLoudnessGain(100)
	want := math.Pow(10, 24.0/20)
	if g := svc.engine.GainTarget(); math.Abs(g-want) > 0.01 {
		t.Errorf("+100dB 应钳到 +24dB（增益 %.4f），实际 %.4f", want, g)
	}

	svc.SetLoudnessGain(-100)
	want = math.Pow(10, -24.0/20)
	if g := svc.engine.GainTarget(); math.Abs(g-want) > 0.01 {
		t.Errorf("-100dB 应钳到 -24dB（增益 %.4f），实际 %.4f", want, g)
	}
}

// TestPlayerServiceLoadDoesNotCarryGainAcrossSongs 这是用户报过的 bug：
// A 切 B 的瞬间，A 的结尾会突然变响（且不是每次都触发）。
//
// 根因有两层，这里锁住后端这一层：
//  1. audioplay.Engine.Load 之前只重置环形缓冲，**不碰增益**。于是
//     「装载新音频」与「前端把新歌补偿推过来」之间的回调窗口里，那一个缓冲
//     会用**上一首**的增益放出来。上一首若被明显压低（很响的歌），
//     那一段就是一次爆响。
//  2. Load 里若拿 s.loudnessGainDB 去合成增益，用的还是**上一首**的值。
//
// 修法：换歌时把增益与音频在同一个 Load 里原子地换掉，且新歌的补偿在
// 前端推过来之前一律按 0 dB（不补偿）处理。
func TestPlayerServiceLoadDoesNotCarryGainAcrossSongs(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 2.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 2000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	svc.SetVolume(1.0, false)

	// 第一首很响：被压低 8 dB
	svc.SetLoudnessGain(-8)
	if g := svc.engine.GainTarget(); math.Abs(g-math.Pow(10, -8.0/20)) > 0.001 {
		t.Fatalf("第一首的补偿没生效，实际增益 %v", g)
	}

	// 切到第二首（此时前端还没推它的补偿）
	if _, err := svc.Load("song-2"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}

	// 关键：装载完成后绝不能还留着上一首的 −8 dB；
	// 新歌补偿未知时必须是 1.0（0 dB，不抬升也不压低）
	got := svc.engine.GainTarget()
	if math.Abs(got-1.0) > 0.001 {
		t.Errorf(
			"换歌后增益 = %.4f，期望 1.0（新歌补偿未知时按 0 dB）—— "+
				"留着上一首的补偿会让新歌/旧歌尾巴以错误电平出声",
			got,
		)
	}
}

// TestPlayerServiceLoadAppliesGain 换歌后必须重新套用当前音量/补偿
// （上一首的补偿不能留在链路上）。
func TestPlayerServiceLoadAppliesGain(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 2.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 2000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	svc.SetVolume(0.4, false)
	svc.SetLoudnessGain(3)
	want := 0.4 * math.Pow(10, 3.0/20)

	if _, err := svc.Load("song-1"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	// 前端装载完成后会推新歌的补偿；这里模拟那次推送
	svc.SetLoudnessGain(3)
	if g := svc.engine.GainTarget(); math.Abs(g-want) > 0.01 {
		t.Errorf("Load 后增益 = %.4f，期望 %.4f（换歌应重新对齐增益）", g, want)
	}
}

/* --------------------------------------------------------------------------
   4. 锚点节流语义
   -------------------------------------------------------------------------- */

// TestPlayerServiceAnchorThrottle tick 必须被节流，但状态变化必须立刻推。
//
// 这是「界面流畅」的关键契约：如果 tick 不节流，播放时每秒会推几十条 IPC；
// 如果状态变化被节流吞掉，暂停后进度条还会继续走一段。
func TestPlayerServiceAnchorThrottle(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 5.0)

	svc, em, closeSvc := newPlayerSvcHarness(t, wav, 5000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	if _, err := svc.Load("song-1"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()
	time.Sleep(200 * time.Millisecond)
	em.reset()

	// 立刻连打 20 次 tick：只该推 0~1 条（节流窗口 500ms 还没到）
	for i := 0; i < 20; i++ {
		svc.Tick()
	}
	if n := em.count(playerStateEvent); n > 1 {
		t.Errorf("20 次 tick 推了 %d 条锚点，节流没生效", n)
	}

	// 等过节流窗口，tick 应当能推
	time.Sleep(anchorIntervalMs*time.Millisecond + 120*time.Millisecond)
	svc.Tick()
	if em.count(playerStateEvent) == 0 {
		t.Error("过了节流窗口后 tick 应当推一条锚点")
	}

	// 状态变化（暂停）必须立刻推，不受节流影响
	em.reset()
	svc.Pause()
	if em.count(playerStateEvent) == 0 {
		t.Error("暂停是状态变化，必须立刻推锚点（否则进度条会继续走）")
	}
}

// TestPlayerServiceTickWhenNotPlaying 没在播放时 tick 不该推任何东西。
func TestPlayerServiceTickWhenNotPlaying(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 2.0)

	svc, em, closeSvc := newPlayerSvcHarness(t, wav, 2000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	if _, err := svc.Load("song-1"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	// 不 Play
	em.reset()
	for i := 0; i < 10; i++ {
		svc.Tick()
	}
	if n := em.count(playerStateEvent); n != 0 {
		t.Errorf("未播放时 tick 推了 %d 条锚点，期望 0", n)
	}
}

/* --------------------------------------------------------------------------
   5. 错误路径
   -------------------------------------------------------------------------- */

// TestPlayerServiceLoadResolveError 解析失败（转码失败/文件丢失）必须
// 广播 player:error 且不把服务搞成「已装载」状态。
func TestPlayerServiceLoadResolveError(t *testing.T) {
	svc := NewPlayerService(func(songID string) (string, int64, error) {
		return "", 0, fmt.Errorf("模拟：ffmpeg 不可用")
	})
	em := &fakeEmitter{}
	svc.setApp(em)
	// 不开声卡也能测这条路径：resolve 在检查 available 之前就失败了
	_, err := svc.Load("song-x")
	if err == nil {
		t.Fatal("resolve 失败时 Load 应当返回错误")
	}
	if em.count(playerErrorEvent) != 1 {
		t.Errorf("player:error 事件数 = %d，期望 1", em.count(playerErrorEvent))
	}
	p := em.last(playerErrorEvent)
	if p["songId"] != "song-x" {
		t.Errorf("错误事件 songId = %v，期望 song-x", p["songId"])
	}
	if svc.loaded {
		t.Error("解析失败后不该处于已装载状态")
	}
}

// TestPlayerServiceFailDedup 同一首歌的同一个失败只广播一次。
//
// ★ 为什么必须有这条：失败后服务不会进入「已装载」状态，而前端每个 tick
// 都可能重新尝试装载同一首歌 —— 每失败一次就 Emit 一条 player:error，
// 用户看到的就是「疯狂弹错误提示」。这里从后端这一侧掐掉重复广播。
func TestPlayerServiceFailDedup(t *testing.T) {
	svc := NewPlayerService(func(songID string) (string, int64, error) {
		return "", 0, fmt.Errorf("模拟：转码失败")
	})
	em := &fakeEmitter{}
	svc.setApp(em)

	// 同一首歌反复失败：只有第一条该广播出去
	for i := 0; i < 10; i++ {
		if _, err := svc.Load("song-x"); err == nil {
			t.Fatal("resolve 失败时 Load 应当返回错误")
		}
	}
	if n := em.count(playerErrorEvent); n != 1 {
		t.Errorf("同一首歌反复失败广播了 %d 条 player:error，期望 1", n)
	}

	// 换一首歌：这是**新的**失败，必须报出来（抑制键是按歌生效的）
	if _, err := svc.Load("song-y"); err == nil {
		t.Fatal("resolve 失败时 Load 应当返回错误")
	}
	if n := em.count(playerErrorEvent); n != 2 {
		t.Errorf("换了一首歌后 player:error 总数 = %d，期望 2", n)
	}

	// 同一首歌但原因变了：也该报出来（原因不同 = 用户能据此做不同的事）
	svc2 := NewPlayerService(func(songID string) (string, int64, error) {
		return "", 0, fmt.Errorf("模拟：文件丢失")
	})
	em2 := &fakeEmitter{}
	svc2.setApp(em2)
	_, _ = svc2.Load("song-z")
	if n := em2.count(playerErrorEvent); n != 1 {
		t.Errorf("player:error 事件数 = %d，期望 1", n)
	}
}

// TestPlayerServiceFailDedupResetOnSuccess 装载成功后抑制键必须清掉，
// 否则「修好文件再试」会静默失败（用户看不到任何原因）。
func TestPlayerServiceFailDedupResetOnSuccess(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 1.0)

	var failFirst = true
	svc := NewPlayerService(func(songID string) (string, int64, error) {
		if songID == "bad" && failFirst {
			return "", 0, fmt.Errorf("模拟：转码失败")
		}
		return wav, 1000, nil
	})
	em := &fakeEmitter{}
	svc.setApp(em)
	if !svc.Start() {
		t.Skip("本机没有可用的音频设备，跳过 PlayerService 端到端测试")
	}
	defer svc.Stop()

	if _, err := svc.Load("bad"); err == nil {
		t.Fatal("第一次装载应当失败")
	}
	if em.count(playerErrorEvent) != 1 {
		t.Fatalf("首次失败应广播 1 条，实际 %d", em.count(playerErrorEvent))
	}

	// 再失败一次：被抑制，仍是 1 条
	_, _ = svc.Load("bad")
	if n := em.count(playerErrorEvent); n != 1 {
		t.Fatalf("重复失败被抑制后应仍是 1 条，实际 %d", n)
	}

	// 「修好了」：同一首歌现在能装载成功
	failFirst = false
	if _, err := svc.Load("bad"); err != nil {
		t.Fatalf("修好后装载应当成功: %v", err)
	}

	// 之后同一首歌再坏，必须重新广播（抑制键已被成功装载清掉）
	failFirst = true
	_, _ = svc.Load("bad")
	if n := em.count(playerErrorEvent); n != 2 {
		t.Errorf("成功装载后抑制键应被清掉，player:error 总数 = %d，期望 2", n)
	}
}

/* --------------------------------------------------------------------------
   6. 并发
   -------------------------------------------------------------------------- */

// TestPlayerServiceConcurrentCalls 并发调用不能死锁、不能触发竞态。
//
// 真实场景就是并发的：runtime 的 tick 调 SetVolume/Tick，
// 用户点界面调 Play/Pause/Seek，两边同时来是常态。
// 这个用例在 -race 下有实际意义。
func TestPlayerServiceConcurrentCalls(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 4.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 4000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	if _, err := svc.Load("song-1"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}

	done := make(chan struct{})
	var wg sync.WaitGroup

	// 一组：不停地推音量与补偿
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 200; i++ {
			svc.SetVolume(float64(i%100)/100, i%7 == 0)
			svc.SetLoudnessGain(float64(i%50) - 25)
			select {
			case <-done:
				return
			default:
			}
		}
	}()

	// 一组：不停地 tick 与读状态
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 200; i++ {
			svc.Tick()
			_ = svc.State()
			_ = svc.Available()
			select {
			case <-done:
				return
			default:
			}
		}
	}()

	// 一组：播放/暂停/跳转
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 60; i++ {
			svc.Play()
			if _, err := svc.Seek(float64(i * 50)); err != nil {
				t.Errorf("并发 seek 报错: %v", err)
			}
			svc.Pause()
			select {
			case <-done:
				return
			default:
			}
		}
	}()

	// 一组：读频谱（模拟皮肤在拉数据）
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 200; i++ {
			_ = svc.Spectrum(32)
			select {
			case <-done:
				return
			default:
			}
		}
	}()

	// 等一会儿再收尾，避免上面几组瞬间跑完导致「并发」名不副实
	time.Sleep(400 * time.Millisecond)
	close(done)

	waitCh := make(chan struct{})
	go func() { wg.Wait(); close(waitCh) }()
	select {
	case <-waitCh:
	case <-time.After(20 * time.Second):
		t.Fatal("并发调用死锁了（20 秒未结束）")
	}
}

// TestPlayerServiceConcurrentLoad 并发切歌不能死锁、不能串味。
func TestPlayerServiceConcurrentLoad(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	a := filepath.Join(dir, "a.wav")
	b := filepath.Join(dir, "b.wav")
	writeServiceTestWAV(t, a, 3.0)
	writeServiceTestWAV(t, b, 2.0)

	svc := NewPlayerService(func(songID string) (string, int64, error) {
		if songID == "a" {
			return a, 3000, nil
		}
		return b, 2000, nil
	})
	svc.setApp(&fakeEmitter{})
	if !svc.Start() {
		t.Skip("没有可用的音频设备")
	}
	defer func() {
		svc.Stop()
		time.Sleep(80 * time.Millisecond)
		cleanupDir(dir)
	}()

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		id := "a"
		if i%2 == 0 {
			id = "b"
		}
		go func(songID string) {
			defer wg.Done()
			if _, err := svc.Load(songID); err != nil {
				t.Errorf("并发 Load(%s) 报错: %v", songID, err)
			}
		}(id)
	}

	waitCh := make(chan struct{})
	go func() { wg.Wait(); close(waitCh) }()
	select {
	case <-waitCh:
	case <-time.After(20 * time.Second):
		t.Fatal("并发 Load 死锁了")
	}

	// 最终状态必须是「某一首」且自洽，不能是空
	st := svc.State()
	if st["loaded"] != true {
		t.Errorf("并发 Load 后 loaded = %v，期望 true", st["loaded"])
	}
	id, _ := st["songId"].(string)
	if id != "a" && id != "b" {
		t.Errorf("并发 Load 后 songId = %q，期望 a 或 b", id)
	}
}

/* --------------------------------------------------------------------------
   7. 频谱接口
   -------------------------------------------------------------------------- */

// TestPlayerServiceSpectrumBandsClamp 段数越界要钳到 1..128，
// 与前端 audio.js#spectrum 的口径一致。
func TestPlayerServiceSpectrumBandsClamp(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 3.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 3000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	if _, err := svc.Load("song-1"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.SetVolume(1.0, false)
	svc.Play()
	time.Sleep(400 * time.Millisecond)

	// 正常段数
	res := svc.Spectrum(32)
	bands, ok := res["bands"].([]float64)
	if !ok {
		t.Fatalf("播放中频谱应为 []float64，实际 %T（%v）", res["bands"], res["bands"])
	}
	if len(bands) != 32 {
		t.Errorf("段数 = %d，期望 32", len(bands))
	}

	// 越界：0 → 默认 32
	if r := svc.Spectrum(0); r["bands"] != nil {
		if b, ok := r["bands"].([]float64); ok && len(b) != 32 {
			t.Errorf("spectrum(0) 段数 = %d，期望 32", len(b))
		}
	}
	// 越界：1000 → 钳到 128
	if r := svc.Spectrum(1000); r["bands"] != nil {
		if b, ok := r["bands"].([]float64); ok && len(b) != 128 {
			t.Errorf("spectrum(1000) 段数 = %d，期望 128（钳制）", len(b))
		}
	}
}

// TestPlayerServiceSpectrumNilBeforePlay 还没播过时频谱应当是 nil
// （皮肤据此保持静态，而不是画一列 0）。
func TestPlayerServiceSpectrumNilBeforePlay(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 2.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 2000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	res := svc.Spectrum(32)
	if res["bands"] != nil {
		t.Errorf("未播放时频谱应为 nil，实际 %v", res["bands"])
	}
}

/* --------------------------------------------------------------------------
   8. 诊断
   -------------------------------------------------------------------------- */

// TestPlayerServiceDiagnostics 诊断信息必须真实反映状态（设置界面会显示它）。
func TestPlayerServiceDiagnostics(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "a.wav")
	writeServiceTestWAV(t, wav, 2.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 2000)
	defer func() { closeSvc(); cleanupDir(dir) }()

	if _, err := svc.Load("song-diag"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.SetVolume(0.6, false)
	svc.SetLoudnessGain(2)
	svc.Play()
	time.Sleep(250 * time.Millisecond)

	d := svc.Diagnostics()
	if d["available"] != true {
		t.Errorf("diagnostics.available = %v", d["available"])
	}
	if d["loaded"] != true {
		t.Errorf("diagnostics.loaded = %v", d["loaded"])
	}
	if d["songId"] != "song-diag" {
		t.Errorf("diagnostics.songId = %v", d["songId"])
	}
	if d["playing"] != true {
		t.Errorf("diagnostics.playing = %v", d["playing"])
	}
	if v, ok := d["userVolume"].(float64); !ok || math.Abs(v-0.6) > 0.001 {
		t.Errorf("diagnostics.userVolume = %v，期望 0.6", d["userVolume"])
	}
	if d["channels"] != audioplay.Channels {
		t.Errorf("diagnostics.channels = %v，期望 %d", d["channels"], audioplay.Channels)
	}
	// 欠载计数必须存在（排查「声音断续」要靠它）
	if _, ok := d["underruns"]; !ok {
		t.Error("diagnostics 缺少 underruns（排查断续的关键指标）")
	}
}

/* --------------------------------------------------------------------------
   9. EOF 回调
   -------------------------------------------------------------------------- */

// TestPlayerServiceEOFHandler 播完必须触发注入的回调（自动下一首靠它）。
func TestPlayerServiceEOFHandler(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "short.wav")
	writeServiceTestWAV(t, wav, 0.5)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 500)
	defer func() { closeSvc(); cleanupDir(dir) }()

	fired := make(chan struct{}, 1)
	svc.setEOFHandler(func() {
		select {
		case fired <- struct{}{}:
		default:
		}
	})

	if _, err := svc.Load("song-1"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()

	select {
	case <-fired:
	case <-time.After(5 * time.Second):
		t.Fatal("播完了却没有触发 EOF 回调（自动下一首会失效）")
	}
}

/* --------------------------------------------------------------------------
   10. 跳过首尾静音
   -------------------------------------------------------------------------- */

// writeSilenceWAV 造一个「头 headMs 静音 + 中间 440Hz + 尾 tailMs 静音」的 WAV。
func writeSilenceWAV(t *testing.T, path string, headMs, bodyMs, tailMs int) {
	t.Helper()
	frames := func(ms int) int { return audioplay.SampleRate * ms / 1000 }
	head := frames(headMs)
	body := frames(bodyMs)
	tail := frames(tailMs)

	total := head + body + tail
	pcm := make([]byte, total*audioplay.FrameSize)
	for i := head; i < head+body; i++ {
		v := int16(18000 * math.Sin(2*math.Pi*440*float64(i)/float64(audioplay.SampleRate)))
		binary.LittleEndian.PutUint16(pcm[i*audioplay.FrameSize:], uint16(v))
		binary.LittleEndian.PutUint16(pcm[i*audioplay.FrameSize+2:], uint16(v))
	}

	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("创建测试 WAV 失败: %v", err)
	}
	defer f.Close()

	dataLen := uint32(len(pcm))
	h := make([]byte, 0, 44)
	put32 := func(v uint32) { b := make([]byte, 4); binary.LittleEndian.PutUint32(b, v); h = append(h, b...) }
	put16 := func(v uint16) { b := make([]byte, 2); binary.LittleEndian.PutUint16(b, v); h = append(h, b...) }
	h = append(h, []byte("RIFF")...)
	put32(36 + dataLen)
	h = append(h, []byte("WAVE")...)
	h = append(h, []byte("fmt ")...)
	put32(16)
	put16(1)
	put16(audioplay.Channels)
	put32(audioplay.SampleRate)
	put32(audioplay.SampleRate * audioplay.FrameSize)
	put16(audioplay.FrameSize)
	put16(16)
	h = append(h, []byte("data")...)
	put32(dataLen)
	if _, err := f.Write(h); err != nil {
		t.Fatalf("写头失败: %v", err)
	}
	if _, err := f.Write(pcm); err != nil {
		t.Fatalf("写 PCM 失败: %v", err)
	}
}

// withSilenceConfig 给 PlayerService 注入一份指定的播放选项。
func withSilenceConfig(svc *PlayerService, head, tail bool, gap float64) {
	svc.setConfigProvider(func() bootstrap.Config {
		c := *bootstrap.DefaultConfig()
		c.SkipSilenceHead = head
		c.SkipSilenceTail = tail
		c.TrackGapSeconds = gap
		return c
	})
}

// TestPlayerServiceSkipSilenceDisabledIsUntouched 两个开关都关时，
// 装载必须**原样播放**（这是加入这个功能之前的默认行为，也是最该稳住的路径）。
func TestPlayerServiceSkipSilenceDisabledIsUntouched(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "silence-off.wav")
	// 头 1 秒静音 + 2 秒声音 + 尾 1 秒静音
	writeSilenceWAV(t, wav, 1000, 2000, 1000)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 4000)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, false, false, 0)

	res, err := svc.Load("song-off")
	if err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	if got := res["durationMs"].(int64); got < 3900 || got > 4100 {
		t.Errorf("关掉开关时时长 = %dms，期望约 4000（整个文件，不该被掐）", got)
	}
	if got := res["skippedHeadMs"].(int64); got != 0 {
		t.Errorf("关掉开关时 skippedHeadMs = %d，期望 0", got)
	}
	if got := res["skippedTailMs"].(int64); got != 0 {
		t.Errorf("关掉开关时 skippedTailMs = %d，期望 0", got)
	}
}

// TestPlayerServiceSkipSilenceHeadOnly 只开「跳过开头」时只跳头、尾部不动。
//
// ★ 这条是国内需求「分别为跳过头部、尾部的静音区域」的核心断言：
// 两个开关必须是**独立**的，做成一个「跳过静音」总开关就违背了需求。
func TestPlayerServiceSkipSilenceHeadOnly(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "silence-head.wav")
	writeSilenceWAV(t, wav, 1000, 2000, 1000)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 4000)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, true, false, 0)

	res, err := svc.Load("song-head")
	if err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	head := res["skippedHeadMs"].(int64)
	tail := res["skippedTailMs"].(int64)
	if head < 950 || head > 1050 {
		t.Errorf("skippedHeadMs = %d，期望约 1000", head)
	}
	if tail != 0 {
		t.Errorf("只开了「跳过开头」，尾部不该被跳：skippedTailMs = %d", tail)
	}
	// ★ 时长仍是**整首歌**：跳过静音是「自动跳过」，不是「把歌变短」
	if got := res["durationMs"].(int64); got < 3900 || got > 4100 {
		t.Errorf("时长 = %dms，期望约 4000（整首歌原长）", got)
	}
	// ★ 起播位置落在跳过之后：用户听到的第一声就是音乐，
	// 而「这首歌的时间轴」没有被改动（歌词/记忆进度都按原曲算）
	if got := res["positionMs"].(int64); got < 950 || got > 1050 {
		t.Errorf("起播位置 = %dms，期望约 1000（自动跳过开头静音之后的落点）", got)
	}
}

// TestPlayerServiceSkipSilenceTailOnly 只开「跳过结尾」时只跳尾、头部不动。
func TestPlayerServiceSkipSilenceTailOnly(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "silence-tail.wav")
	writeSilenceWAV(t, wav, 1000, 2000, 1000)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 4000)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, false, true, 0)

	res, err := svc.Load("song-tail")
	if err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	if got := res["skippedHeadMs"].(int64); got != 0 {
		t.Errorf("只开了「跳过结尾」，头部不该被跳：skippedHeadMs = %d", got)
	}
	tail := res["skippedTailMs"].(int64)
	if tail < 950 || tail > 1050 {
		t.Errorf("skippedTailMs = %d，期望约 1000", tail)
	}
}

// TestPlayerServiceSkipSilenceBoth 两个都开时首尾都跳，但时长仍是整首歌。
func TestPlayerServiceSkipSilenceBoth(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "silence-both.wav")
	writeSilenceWAV(t, wav, 1000, 2000, 1000)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 4000)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, true, true, 0)

	res, err := svc.Load("song-both")
	if err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	// 时长仍是 4 秒：跳过静音只是「不去播」那两段，不改变这首歌的长度
	if got := res["durationMs"].(int64); got < 3900 || got > 4100 {
		t.Errorf("时长 = %dms，期望约 4000（整首歌原长）", got)
	}
	// 起播落到头部静音之后
	if got := res["positionMs"].(int64); got < 950 || got > 1050 {
		t.Errorf("起播位置 = %dms，期望约 1000", got)
	}
}

// TestPlayerServiceUsesPrimedSilenceInfo 预登记的首尾静音必须真的被装载路径采用。
//
// ★ 这是「转码顺手扫的结论不许白算」的端到端回归测试。
//
// 转码时已经扫过首尾静音（media.Server.transcode），装配层把它喂给
// audioplay.PrimeSilenceInfo（见 main.go 的 resolve）。这条链路如果断了，
// 装载会退回"自己再扫一遍文件"—— 结果一样、但白做一次 I/O，
// 而且**这种"悄悄退回去"是不会有任何报错的**，只能靠测试钉住。
//
// 验法：喂一份与文件真实内容**故意不同**的结论（文件开头就是声音，
// 但预登记说"头部静音 1 秒"）。装载后起播位置应当落在 1 秒处 ——
// 说明用的是预登记的值，而不是扫描出来的 0。
func TestPlayerServiceUsesPrimedSilenceInfo(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "primed.wav")
	// 文件真实内容：0.5 秒声音 + 0.5 秒声音（全程有声，真扫描会得到 head=0）
	writeSilenceWAV(t, wav, 0, 1000, 0)

	// 预登记一份"头部静音 600ms"的结论（与文件真实内容不一致，便于区分来源）
	const primedHeadMs = 600
	audioplay.PrimeSilenceInfo(wav, int64(audioplay.SampleRate)*primedHeadMs/1000, 0,
		int64(audioplay.SampleRate)*1000/1000)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 1000)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, true, false, 0)

	res, err := svc.Load("song-primed")
	if err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	if got := res["positionMs"].(int64); got < 550 || got > 650 {
		t.Errorf("起播位置 = %dms，期望约 %d（预登记的值没被采用，说明装载时又去扫了文件）",
			got, primedHeadMs)
	}
	if got := res["skippedHeadMs"].(int64); got < 550 || got > 650 {
		t.Errorf("skippedHeadMs = %d，期望约 %d（同一条链路）", got, primedHeadMs)
	}
}

// TestPlayerServiceSilencePlaysToTrimmedEnd 开了跳过结尾之后，
// EOF 必须在掐点触发，而不是等整首文件播完。
//
// 这是「跳过尾部静音」唯一真正有意义的行为：用户要的是「播到最后一个声音
// 就切下一首」，而不是「听完那段空白再切」。
func TestPlayerServiceSilencePlaysToTrimmedEnd(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "trim-eof.wav")
	// 声音 0.4 秒 + 尾部 3 秒静音：开着跳过结尾时应当很快播完
	writeSilenceWAV(t, wav, 0, 400, 3000)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 3400)
	defer func() { closeSvc(); cleanupDir(dir) }()
	// 间隔设 0：这个用例要验的是「掐点触发 EOF」，不该被切歌间隔拖慢
	withSilenceConfig(svc, false, true, 0)

	fired := make(chan struct{}, 1)
	svc.setEOFHandler(func() {
		select {
		case fired <- struct{}{}:
		default:
		}
	})

	start := time.Now()
	if _, err := svc.Load("song-trim"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()

	select {
	case <-fired:
		// 掐掉 3 秒尾部 → 应当在 0.4 秒左右就结束，给足余量但远小于 3.4 秒
		if elapsed := time.Since(start); elapsed > 2500*time.Millisecond {
			t.Errorf("播完用了 %v，期望约 0.4 秒（尾部 3 秒静音应当被跳过）", elapsed)
		}
	case <-time.After(4 * time.Second):
		t.Fatal("开着「跳过结尾静音」时没有在掐点触发 EOF（等于功能没生效）")
	}
}

// TestPlayerServiceAllSilentFileStillPlays 整首歌都是静音时不能掐成零长度。
//
// 零长度区间会让位置/时长计算失效（前端拿 duration=0 做除法就是 NaN），
// 用户看到的是「点了完全没反应」。正确行为是退回「原样播放」。
func TestPlayerServiceAllSilentFileStillPlays(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "all-silent.wav")
	writeSilenceWAV(t, wav, 3000, 0, 0) // 3 秒全静音

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 3000)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, true, true, 0)

	res, err := svc.Load("song-silent")
	if err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	dur := res["durationMs"].(int64)
	if dur <= 0 {
		t.Fatalf("整首静音的文件时长为 %dms —— 掐成了零长度（前端进度条会坏掉）", dur)
	}
	if dur < 2900 || dur > 3100 {
		t.Errorf("时长 = %dms，期望约 3000（退回原样播放）", dur)
	}
}

// TestPlayerServiceSilenceDetectionFailureIsNotFatal 文件读不了时退回原样播放，
// 而不是让一首本来能播的歌变成播不了。
func TestPlayerServiceSilenceDetectionFailureIsNotFatal(t *testing.T) {
	svc := NewPlayerService(func(string) (string, int64, error) {
		return "", 0, fmt.Errorf("测试：没有可播放的文件")
	})
	withSilenceConfig(svc, true, true, 0)
	// 没 Start（声卡不可用）时 Load 会返回「后端音频不可用」，
	// 但重点是它**不能 panic**、也不能因为静音检测而多出一种失败。
	if _, err := svc.Load("song-x"); err == nil {
		t.Log("声卡可用时这里会成功；不可用时返回错误，两者都可接受")
	}
}

/* --------------------------------------------------------------------------
   11. 切歌间隔
   -------------------------------------------------------------------------- */

// TestPlayerServiceSkipSilenceKeepsOriginalTimeline 位置必须留在**原曲时间轴**上。
//
// ★ 这是「自动跳过」与「把歌变短」的分水岭，也是本功能最重要的一条不变式。
//
// 歌词是按原曲时间轴打轴的。如果开了跳过开头之后位置从 0 重新起算，
// 那么**所有歌词都会整体提前**（开头静音多长就偏多少），越往后越对不上；
// 「保留歌曲播放进度」存下来的位置也会对不上。
//
// 正确的语义：掐掉的只是「会被播放的区间」，不是「这首歌的时间轴」——
//
//	· 时长 = 整首歌；
//	· 起播位置 = 跳过开头静音之后的原曲位置。
func TestPlayerServiceSkipSilenceKeepsOriginalTimeline(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "timeline.wav")
	// 头 3 秒静音 + 4 秒声音 + 尾 2 秒静音 = 共 9 秒
	writeSilenceWAV(t, wav, 3000, 4000, 2000)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 9000)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, true, false, 0) // 只跳开头，便于单独观察

	res, err := svc.Load("song-timeline")
	if err != nil {
		t.Fatalf("Load 失败: %v", err)
	}

	// 时长 = 整首歌 9 秒（**不是** 6 秒）
	if got := res["durationMs"].(int64); got < 8900 || got > 9100 {
		t.Errorf("时长 = %dms，期望约 9000（整首歌；跳过静音不该让歌变短——"+
			"否则歌词会整体提前 3 秒）", got)
	}
	// 起播位置 = 3 秒（原曲时间轴上的绝对位置，**不是** 0）
	if got := res["positionMs"].(int64); got < 2900 || got > 3100 {
		t.Errorf("起播位置 = %dms，期望约 3000（原曲时间轴上的绝对位置）", got)
	}

	// 诊断信息也要能分别回答「从哪儿开始播」与「跳过了多少」
	d := svc.Diagnostics()
	if got := d["trimStartMs"].(int64); got < 2900 || got > 3100 {
		t.Errorf("diagnostics.trimStartMs = %d，期望约 3000", got)
	}
}

// TestPlayerServiceTrackGapDelaysEOF 配了切歌间隔时，EOF 回调必须**推迟**
// 到间隔走完才触发（自动切歌的停顿就是这么来的）。
func TestPlayerServiceTrackGapDelaysEOF(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "gap.wav")
	writeServiceTestWAV(t, wav, 0.4)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 400)
	defer func() { closeSvc(); cleanupDir(dir) }()
	// 1.0 秒间隔：够长到能明显量出来，又不至于让用例太慢
	withSilenceConfig(svc, false, false, 1.0)

	fired := make(chan time.Duration, 1)
	start := time.Now()
	svc.setEOFHandler(func() {
		select {
		case fired <- time.Since(start):
		default:
		}
	})

	if _, err := svc.Load("song-gap"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()

	select {
	case elapsed := <-fired:
		// 音频本身 0.4 秒 + 间隔 1.0 秒 ≈ 1.4 秒。
		// 下限卡在 1.2 秒：明显大于「没有间隔」时的 0.4 秒，
		// 说明间隔确实生效了；上限不卡太死（调度抖动是正常的）。
		if elapsed < 1200*time.Millisecond {
			t.Errorf("EOF 在 %v 就触发了，期望约 1.4 秒（0.4 秒音频 + 1 秒间隔）—— 间隔没生效", elapsed)
		}
	case <-time.After(6 * time.Second):
		t.Fatal("配了切歌间隔后 EOF 一直没触发（等于播放卡死了）")
	}
}

// TestPlayerServiceZeroTrackGapFiresImmediately 间隔设为 0 时必须立刻触发 EOF
// （与历史行为一致，不留任何多余停顿）。
func TestPlayerServiceZeroTrackGapFiresImmediately(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "nogap.wav")
	writeServiceTestWAV(t, wav, 0.3)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 300)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, false, false, 0)

	fired := make(chan struct{}, 1)
	svc.setEOFHandler(func() {
		select {
		case fired <- struct{}{}:
		default:
		}
	})

	if _, err := svc.Load("song-nogap"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()

	select {
	case <-fired:
	case <-time.After(4 * time.Second):
		t.Fatal("间隔为 0 时 EOF 没有被触发")
	}
}

// TestPlayerServiceSetPlaybackOptions 公开的设置接口必须夹住非法值。
func TestPlayerServiceSetPlaybackOptions(t *testing.T) {
	svc := NewPlayerService(func(string) (string, int64, error) { return "", 0, nil })
	em := &fakeEmitter{}
	svc.setApp(em)

	// 负数间隔 → 钳到 0
	res := svc.SetPlaybackOptions(true, false, -3)
	if got := res["trackGapSeconds"].(float64); got != 0 {
		t.Errorf("负间隔应被钳到 0，实际 %v", got)
	}
	// 超大间隔 → 钳到上限 10
	res = svc.SetPlaybackOptions(false, true, 999)
	if got := res["trackGapSeconds"].(float64); got != 10 {
		t.Errorf("超大间隔应被钳到 10，实际 %v", got)
	}
	// 正常值原样保留
	res = svc.SetPlaybackOptions(true, true, 2.5)
	if got := res["trackGapSeconds"].(float64); got != 2.5 {
		t.Errorf("间隔应保持 2.5，实际 %v", got)
	}
	if res["skipSilenceHead"] != true || res["skipSilenceTail"] != true {
		t.Errorf("两个跳过开关都应回显 true，实际 %+v", res)
	}
	if svc.engine == nil || svc.engine.GapSeconds() != 2.5 {
		t.Error("间隔没有同步到引擎")
	}
}

// TestPlayerServiceDiagnosticsReportsSilence 诊断信息要能回答
// 「这次到底跳了多少」——排查「开头怎么少了几秒」全靠它。
func TestPlayerServiceDiagnosticsReportsSilence(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "diag-silence.wav")
	writeSilenceWAV(t, wav, 1000, 2000, 1000)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 4000)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, true, true, 1.5)

	if _, err := svc.Load("song-diag-silence"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}

	d := svc.Diagnostics()
	if got := d["skippedHeadMs"].(int64); got < 950 || got > 1050 {
		t.Errorf("diagnostics.skippedHeadMs = %d，期望约 1000", got)
	}
	if got := d["skippedTailMs"].(int64); got < 950 || got > 1050 {
		t.Errorf("diagnostics.skippedTailMs = %d，期望约 1000", got)
	}
	if got := d["trackGapSeconds"].(float64); got != 1.5 {
		t.Errorf("diagnostics.trackGapSeconds = %v，期望 1.5", got)
	}
	if _, ok := d["trackGapActive"]; !ok {
		t.Error("diagnostics 缺少 trackGapActive（排查切歌卡顿要靠它）")
	}
}

// TestPlayerServiceUnloadCancelsGap 卸载时必须取消还挂着的切歌间隔。
//
// 不取消的话：用户点了停止，间隔走完的回调仍会把播放器推到下一首 ——
// 表现是「明明停了，过一秒自己又放起来了」，而且会连带触发一次自动跳歌。
func TestPlayerServiceUnloadCancelsGap(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "unload-gap.wav")
	writeServiceTestWAV(t, wav, 0.3)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 300)
	defer func() { closeSvc(); cleanupDir(dir) }()
	// 3 秒间隔：卸载发生在间隔期间
	withSilenceConfig(svc, false, false, 3.0)

	fired := make(chan struct{}, 1)
	svc.setEOFHandler(func() {
		select {
		case fired <- struct{}{}:
		default:
		}
	})

	if _, err := svc.Load("song-unload-gap"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()

	// 等音频播完、进入间隔
	time.Sleep(700 * time.Millisecond)
	svc.Unload()

	// 间隔本该在 3 秒后触发；等 1.5 秒确认它已经被取消
	select {
	case <-fired:
		t.Fatal("Unload 之后切歌间隔仍然触发了（用户已经停止，不该再自动切歌）")
	case <-time.After(1500 * time.Millisecond):
		// 正确：没有触发
	}
}

// TestPlayerServiceSeekCancelsGap 在间隔里拖进度条必须取消切歌。
func TestPlayerServiceSeekCancelsGap(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "seek-gap.wav")
	writeServiceTestWAV(t, wav, 0.3)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 300)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, false, false, 3.0)

	fired := make(chan struct{}, 1)
	svc.setEOFHandler(func() {
		select {
		case fired <- struct{}{}:
		default:
		}
	})

	if _, err := svc.Load("song-seek-gap"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()

	time.Sleep(700 * time.Millisecond) // 等进入间隔
	if _, err := svc.Seek(0); err != nil {
		t.Fatalf("Seek 失败: %v", err)
	}

	select {
	case <-fired:
		t.Fatal("在间隔里拖了进度条，切歌间隔仍然触发了（本该被 seek 取消）")
	case <-time.After(1500 * time.Millisecond):
		// 正确：seek 取消了间隔
	}
}

/* --------------------------------------------------------------------------
   12. 「人主动要它现在出声」不得被「切歌间隔」挡住（真实报障的回归测试）
   --------------------------------------------------------------------------
   用户报的现象：
     · 点下一首之后，当前歌曲还会继续播放一会儿，下一首要过一会儿才出声；
     · 进度条会反复横跳一下。

   现象拆成两半，各由一处负责：

     · **进度条横跳** — 前端的账。切歌时 store 把位置清零了，但 audio.js 里
       还挂着旧歌的锚点，外推与后端 tick 会继续把旧歌的位置写回去。
       修法见 audio.js 的 switchPending（本文件不测，Go 侧看不到它）。

     · **下一首要过一会儿才出声** — 后端的账。配了「切歌间隔」（默认 1.5 秒）
       之后，一首歌播完时引擎进入「间隔」：音频回调只输出静音、**不读缓冲、
       也不推进位置**（见 audioplay.Engine.onData 的间隔分支）。于是：

         t0  上一首播完 → 间隔 Armed，引擎不再出声；
         t1  用户点下一首 → 上层 Load 新歌（几毫秒就完成）+ Play；
         t2  若间隔还挂着，音频回调会一直停在「间隔中只输出静音」那一支：
             已经装载好的新歌被压着不出声，要等**剩下的**间隔走完才响。

       「同歌重播」（单曲循环播完重来、播完即停后手动重播）更彻底：
       它只调 Play、根本不调 Load，所以**任何**放在 Load 里的取消都救不了它。

     修法：引擎的两处都在「人主动要它现在出声」时作废间隔 ——
       · Engine.Load：换歌本来就要丢掉上一首的一切，间隔也不例外；
       · Engine.Play：覆盖「只 Play 不 Load」的重播路径。

     两者都不会削弱「间隔只作用于自动切歌」这条约定，因为真正区分「自动」
     与「手动」的不是谁取消了间隔，而是**谁先被调用** ——
     自动切歌是 markEOF 先 Arm，间隔跑完才回调上层，上层随后才 Load/Play；
     手动切歌则是在间隔还没跑完时就把 Play 发下来了。
     间隔留给自动切歌这件事由 TestPlayerServiceTrackGapDelaysEOF 守着。
   -------------------------------------------------------------------------- */

// TestPlayerServiceLoadCancelsPendingGap 间隔挂起时手动切歌（Load + Play）
// 必须立刻出声，而不是等间隔走完。
func TestPlayerServiceLoadCancelsPendingGap(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "load-during-gap.wav")
	writeServiceTestWAV(t, wav, 0.3)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 300)
	defer func() { closeSvc(); cleanupDir(dir) }()
	// 3 秒间隔：长到「没取消」时用例必然超时，短到用例不至于太慢
	withSilenceConfig(svc, false, false, 3.0)

	if _, err := svc.Load("song-gap-switch"); err != nil {
		t.Fatalf("首次 Load 失败: %v", err)
	}
	svc.Play()

	// 等音频播完、进入间隔（0.3 秒音频 + 一段余量）
	time.Sleep(700 * time.Millisecond)
	if !svc.engine.TrackGapActive() {
		t.Skip("没有进入切歌间隔（音频设备时序抖动），跳过本用例")
	}

	// 用户点「下一首」：这就是手动切歌
	start := time.Now()
	if _, err := svc.Load("song-gap-switch"); err != nil {
		t.Fatalf("间隔中 Load 失败: %v", err)
	}
	svc.Play()

	// 立刻就要在出声：间隔被取消后 engine.Playing() 必须为 true。
	// 不取消的话这里是 false（引擎还在间隔里），要等 2.3 秒才会变 true。
	if !svc.engine.Playing() {
		t.Fatalf("手动切歌后引擎仍在「切歌间隔」里（%v）—— 用户会听到点了没反应",
			time.Since(start))
	}
	if svc.engine.TrackGapActive() {
		t.Fatal("手动切歌没有取消挂起的切歌间隔（新歌会被静音压着不出声）")
	}
}

// TestPlayerServicePlayCancelsPendingGap 同歌重播（只 Play 不 Load）也必须
// 立刻出声，不能被挂着的切歌间隔挡住。
//
// 这条路径与上一个用例不同：单曲循环播完重来、播完即停之后又点播放，
// 都是**只调 Play**。Engine.Load 里那次取消覆盖不到它们，
// 靠的是 Engine.Play 里新加的那一次取消。
func TestPlayerServicePlayCancelsPendingGap(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "play-during-gap.wav")
	writeServiceTestWAV(t, wav, 0.3)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 300)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, false, false, 3.0)

	if _, err := svc.Load("song-replay-gap"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()

	// 等音频播完、进入间隔
	time.Sleep(800 * time.Millisecond)
	if !svc.engine.TrackGapActive() {
		t.Skip("没有进入切歌间隔（音频设备时序抖动），跳过本用例")
	}

	// 用户点了播放（同歌重播，不换歌）
	svc.Play()
	if !svc.engine.Playing() {
		t.Fatal("间隔里点播放后引擎仍未进入播放态 —— 用户会听到点了没反应")
	}
	if svc.engine.TrackGapActive() {
		t.Fatal("Play 没有取消挂起的切歌间隔（重播会被静音压着不出声）")
	}
}

// TestPlayerServiceCancelTrackGapRPC 前端的 CancelTrackGap 接口必须真能取消间隔。
//
// 存在的意义：前端在「手动切歌」时会先发一次它（见 audio.js#loadSong），
// 让「用户意图 → 出声」的窗口不被多余的等待拉长。它必须是个安全的空操作 ——
// 没装载、没间隔时都不能报错。
func TestPlayerServiceCancelTrackGapRPC(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "cancel-gap.wav")
	writeServiceTestWAV(t, wav, 0.3)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 300)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, false, false, 3.0)

	// 还没装载就调：安全
	if res := svc.CancelTrackGap(); res == nil {
		t.Fatal("CancelTrackGap 应当返回状态快照，实际 nil")
	}

	if _, err := svc.Load("song-cancel-gap"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()

	time.Sleep(700 * time.Millisecond)
	if !svc.engine.TrackGapActive() {
		t.Skip("没有进入切歌间隔（音频设备时序抖动），跳过本用例")
	}

	svc.CancelTrackGap()
	if svc.engine.TrackGapActive() {
		t.Fatal("CancelTrackGap 之后间隔仍然挂着")
	}
}

/* --------------------------------------------------------------------------
   13. 切歌必须**立刻**让上一首安静下来（真实报障）
   --------------------------------------------------------------------------
   用户的原话：「a 切 b，a 还会播放一会儿」「如果是单纯切换一次实际上还行，
   但是用户可能短时间切换多次，这种切换了还要延迟播放一段时间的做法很不对」。

   实测根因（tools/probe-switch-cost.mjs 量出来的真实数字）：

     PlayerService.Load 的第一步是 resolve，而 resolve 可能要跑一次 ffmpeg
     转码。未命中转码缓存时实测：

         踏浪                                    842ms
         宅女disco                              1148ms
         宝石Gem本尊发布！《野狼Disco》MV来了！  1165ms

     在这 0.8~1.2 秒里，引擎里装的还是**上一首**：环形缓冲里积压的 PCM
     （最多 3 秒）+ 已经交给声卡的缓冲，会一直被放出来。用户听到的就是
     「点了下一首，上一首还接着唱一秒多」。

     而 Engine.Load 里的 ring.reset() 发生在 resolve **之后** ——
     恰恰救不了 resolve 这段等待。

   修法：Load 一进门（**早于** resolve）就调 Engine.PrepareSwitch()，
   丢掉缓冲并停掉 feeder，让这一秒里用户听到的是**静音**而不是上一首。

   这组用例锁住的核心不变量：
     · PrepareSwitch 之后，缓冲必须立刻为空（那正是「即将出声的旧数据」）；
     · 它**不能**改变播放意图（不能顺手把 playing 置 false —— 用户没要暂停）；
     · 它**不能**让引擎误报「播完了」（否则会触发一次自动切歌）。
   -------------------------------------------------------------------------- */

// TestEnginePrepareSwitchDropsBuffer 立刻丢掉缓冲里还没放出来的旧数据。
func TestEnginePrepareSwitchDropsBuffer(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "prepare.wav")
	writeServiceTestWAV(t, wav, 3.0)

	svc, _, closeSvc := newPlayerSvcHarness(t, wav, 3000)
	defer func() { closeSvc(); cleanupDir(dir) }()
	withSilenceConfig(svc, false, false, 0)

	if _, err := svc.Load("song-prepare"); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	svc.Play()

	// 等缓冲灌满（feeder 很快，几毫秒就够）
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if svc.engine.Buffered() > 100 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if got := svc.engine.Buffered(); got <= 100 {
		t.Fatalf("缓冲没有灌起来（%dms），用例前提不成立", got)
	}
	beforePlaying := svc.engine.Playing()

	svc.engine.PrepareSwitch()

	if got := svc.engine.Buffered(); got != 0 {
		t.Errorf("PrepareSwitch 之后缓冲应当立刻为空，实际还有 %dms —— "+
			"这些就是要被继续放出来的上一首", got)
	}
	// ★ 不能顺手暂停：用户点的是「下一首」，不是「暂停」。
	// 若这里变成 false，新歌装载完成后就没人再唤醒它了（表现为切完歌是静止的）。
	if svc.engine.Playing() != beforePlaying {
		t.Errorf("PrepareSwitch 不该改变播放意图：playing %v → %v",
			beforePlaying, svc.engine.Playing())
	}
	// ★ 不能误报播完：那会让上层收到一次自动切歌，用户就少听一首。
	if svc.engine.EOF() {
		t.Error("PrepareSwitch 不该把引擎标成「已播完」——那会触发一次多余的自动切歌")
	}
}

// TestPlayerServiceSwitchSilencesImmediately Load 必须在 resolve **之前**
// 就让上一首安静，而不是等 resolve 跑完。
//
// 抓法：用一个故意很慢的 resolve 模拟「未命中转码缓存」的那一秒，
// 在 Load 返回**之前**检查缓冲是否已经空了。修复前这里是满的。
func TestPlayerServiceSwitchSilencesImmediately(t *testing.T) {
	dir := tempDirFor(t)
	defer cleanupDir(dir)
	wav := filepath.Join(dir, "slow-resolve.wav")
	writeServiceTestWAV(t, wav, 3.0)

	svc := NewPlayerService(func(songID string) (string, int64, error) {
		// ★ 模拟转码：一次缓慢的 resolve
		time.Sleep(600 * time.Millisecond)
		return wav, 3000, nil
	})
	em := &fakeEmitter{}
	svc.setApp(em)
	if !svc.Start() {
		t.Skip("本机没有可用的音频设备，跳过 PlayerService 端到端测试")
	}
	defer func() {
		svc.Stop()
		time.Sleep(80 * time.Millisecond)
		cleanupDir(dir)
	}()

	if _, err := svc.Load("song-slow-1"); err != nil {
		t.Fatalf("首次 Load 失败: %v", err)
	}
	svc.Play()

	// 等缓冲灌满
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if svc.engine.Buffered() > 100 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if got := svc.engine.Buffered(); got <= 100 {
		t.Fatalf("缓冲没有灌起来（%dms），用例前提不成立", got)
	}

	// 切歌：Load 会在 resolve 里卡 600ms。在这期间采样缓冲。
	done := make(chan struct{})
	go func() {
		_, _ = svc.Load("song-slow-2")
		close(done)
	}()

	// 在 resolve 还在跑的时候看一眼：缓冲必须已经空了
	time.Sleep(200 * time.Millisecond)
	select {
	case <-done:
		t.Log("Load 比预期快，采样时机不理想（不影响结论）")
	default:
	}
	if got := svc.engine.Buffered(); got > 100 {
		t.Errorf("Load 期间缓冲还有 %dms —— 这就是「上一首还在唱」的来源。"+
			"PrepareSwitch 必须在 resolve **之前**调用", got)
	}

	<-done
	// 等新歌的 feeder 把缓冲重新灌起来（装载完成后 feeder 是重启过的）
	deadline = time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if svc.engine.Buffered() > 100 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if got := svc.engine.Buffered(); got <= 100 {
		t.Errorf("切歌完成后新歌的缓冲应当重新灌起来，实际只有 %dms（playing=%v）",
			got, svc.engine.Playing())
	}
}
