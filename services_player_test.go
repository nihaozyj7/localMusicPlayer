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

func (f *fakeEmitter) names() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, 0, len(f.events))
	for _, e := range f.events {
		out = append(out, e.name)
	}
	return out
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
