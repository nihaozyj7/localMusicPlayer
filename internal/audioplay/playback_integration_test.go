/* ==========================================================================
   playback_integration_test.go — 真声卡端到端验证
   --------------------------------------------------------------------------
   前面的单元测试都不碰声卡，只验证纯逻辑。但这次迁移最核心的风险恰恰是
   「声卡到底能不能出声、位置会不会推进」—— 那是纯逻辑测不出来的。

   这个文件做真正的端到端验证：
     生成一段已知的 WAV → 装进引擎 → 播放 → 确认位置在推进、频谱非空。

   注意：它会**真的打开声卡**（能听到声音）。所以在没有音频设备的
   CI 环境里应当跳过而不是失败 —— 这也是叫 Integration 而不是普通测试的原因。
   ========================================================================== */

package audioplay

import (
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"
)

/* --------------------------------------------------------------------------
   构造测试用 WAV
   -------------------------------------------------------------------------- */

// writeTestWAV 写一个 16bit/44.1kHz/立体声的 WAV，内容是给定频率的正弦。
//
// 必须自己写这个头：引擎假定「头长恰好 44 字节、其后全是 PCM」
// （见 internal/ffmpeg 对头长的硬保证），用别的库生成可能插入元数据块
// 导致 PCM 偏移不再是 44，测试就测不到真实路径了。
func writeTestWAV(t *testing.T, path string, freq float64, seconds float64) {
	t.Helper()
	frames := int(float64(SampleRate) * seconds)
	pcm := make([]byte, frames*FrameSize)
	for i := 0; i < frames; i++ {
		v := int16(20000 * math.Sin(2*math.Pi*freq*float64(i)/float64(SampleRate)))
		binary.LittleEndian.PutUint16(pcm[i*FrameSize:], uint16(v))
		binary.LittleEndian.PutUint16(pcm[i*FrameSize+2:], uint16(v))
	}

	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("创建测试 WAV 失败: %v", err)
	}
	defer f.Close()

	// 标准 44 字节头
	dataLen := uint32(len(pcm))
	header := make([]byte, 0, 44)
	put32 := func(v uint32) {
		b := make([]byte, 4)
		binary.LittleEndian.PutUint32(b, v)
		header = append(header, b...)
	}
	put16 := func(v uint16) {
		b := make([]byte, 2)
		binary.LittleEndian.PutUint16(b, v)
		header = append(header, b...)
	}
	header = append(header, []byte("RIFF")...)
	put32(36 + dataLen)
	header = append(header, []byte("WAVE")...)
	header = append(header, []byte("fmt ")...)
	put32(16)
	put16(1) // PCM
	put16(Channels)
	put32(SampleRate)
	put32(SampleRate * FrameSize)
	put16(FrameSize)
	put16(16)
	header = append(header, []byte("data")...)
	put32(dataLen)
	if len(header) != 44 {
		t.Fatalf("WAV 头长度 = %d，必须是 44（引擎按此定位 PCM）", len(header))
	}

	if _, err := f.Write(header); err != nil {
		t.Fatalf("写 WAV 头失败: %v", err)
	}
	if _, err := f.Write(pcm); err != nil {
		t.Fatalf("写 PCM 失败: %v", err)
	}
}

// openEngineOrSkip 打开引擎；设备不可用就跳过（CI 场景）。
//
// 返回的 cleanup 必须在测试体结束前**显式调用**，不要指望 t.Cleanup 的顺序：
// Windows 上「文件正在被另一个进程使用」会让删除失败，而报错落在
// TempDir 的清理里，看起来像断言错了。显式关闭 + 显式删目录最不容易误判。
func openEngineOrSkip(t *testing.T) (*Engine, func()) {
	t.Helper()
	e := New()
	if err := e.Open(); err != nil {
		t.Skipf("本机没有可用的音频设备，跳过端到端测试: %v", err)
	}
	closed := false
	closeOnce := func() {
		if closed {
			return
		}
		closed = true
		e.Close()
		// 等 feeder goroutine 真正退出（它持有同一个文件句柄）
		time.Sleep(80 * time.Millisecond)
	}
	t.Cleanup(closeOnce)
	return e, closeOnce
}

// tempAudioDir 建一个临时目录，并在其中生成测试 WAV。
// 返回 (目录, WAV 路径)；目录的清理交给调用方的 cleanup 顺序保证。
func tempAudioDir(t *testing.T, name string, freq, seconds float64) (string, string) {
	t.Helper()
	dir, err := os.MkdirTemp("", "audioplay-test")
	if err != nil {
		t.Fatalf("建临时目录失败: %v", err)
	}
	path := filepath.Join(dir, name)
	writeTestWAV(t, path, freq, seconds)
	return dir, path
}

// cleanupDir 在引擎关闭之后删临时目录（顺序由调用方保证）
func cleanupDir(dir string) {
	// 重试几次：Windows 的文件删除是延迟生效的
	for i := 0; i < 20; i++ {
		if err := os.RemoveAll(dir); err == nil {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}

/* --------------------------------------------------------------------------
   端到端
   -------------------------------------------------------------------------- */

// TestRealPlaybackAdvances 是本文件的核心：真开声卡、真播、真推进。
func TestRealPlaybackAdvances(t *testing.T) {
	e, closeEngine := openEngineOrSkip(t)
	defer closeEngine()

	dir, path := tempAudioDir(t, "tone.wav", 440, 3.0) // 3 秒 440Hz
	defer func() { closeEngine(); cleanupDir(dir) }()

	if err := e.Load(path, 0, 0, 1); err != nil {
		t.Fatalf("装载失败: %v", err)
	}
	e.SetGain(1.0)
	e.Play()

	// 等一会儿，位置必须明显推进。
	// 给 700ms 的余量：设备打开后的第一批回调可能有延迟，
	// 断言太紧会在慢机器上假失败。
	time.Sleep(700 * time.Millisecond)

	posMs, durMs := e.Position()
	if durMs < 2900 || durMs > 3100 {
		t.Errorf("时长 = %dms，期望约 3000ms", durMs)
	}
	if posMs < 300 {
		t.Errorf("播放 700ms 后位置只有 %dms，音频没有真正推进", posMs)
	}
	if posMs > 1500 {
		t.Errorf("位置 = %dms，推进过快（时间基准算错了？）", posMs)
	}
	if !e.Playing() {
		t.Error("应当处于播放状态")
	}

	// 欠载次数应当很少：持续欠载说明喂数据的速度跟不上，
	// 听感上就是「断续 / 沙哑」，正是这次迁移要消灭的问题。
	if u := e.Underruns(); u > 3 {
		t.Errorf("欠载 %d 次，喂数据跟不上（缓冲策略需要调整）", u)
	}
}

// TestRealPlaybackPauseStopsPosition 暂停后位置必须停住（不能继续走）。
func TestRealPlaybackPauseStopsPosition(t *testing.T) {
	e, closeEngine := openEngineOrSkip(t)
	defer closeEngine()

	dir, path := tempAudioDir(t, "tone.wav", 440, 5.0)
	defer func() { closeEngine(); cleanupDir(dir) }()
	if err := e.Load(path, 0, 0, 1); err != nil {
		t.Fatalf("装载失败: %v", err)
	}
	e.Play()
	time.Sleep(500 * time.Millisecond)

	e.Pause()
	afterPause, _ := e.Position()
	time.Sleep(400 * time.Millisecond)
	later, _ := e.Position()

	if e.Playing() {
		t.Error("暂停后 Playing() 应当为 false")
	}
	// 允许一点点余量：暂停瞬间可能还有一次回调在途
	if later-afterPause > 100 {
		t.Errorf("暂停后位置仍在推进：%dms → %dms", afterPause, later)
	}
}

// TestRealPlaybackSeekMovesPosition 跳转必须真的改变位置。
func TestRealPlaybackSeekMovesPosition(t *testing.T) {
	e, closeEngine := openEngineOrSkip(t)
	defer closeEngine()

	dir, path := tempAudioDir(t, "tone.wav", 440, 6.0) // 6 秒
	defer func() { closeEngine(); cleanupDir(dir) }()
	if err := e.Load(path, 0, 0, 1); err != nil {
		t.Fatalf("装载失败: %v", err)
	}
	e.Play()
	time.Sleep(300 * time.Millisecond)

	// 跳到 4 秒处
	targetFrame := int64(4 * SampleRate)
	if err := e.SeekToFrame(targetFrame); err != nil {
		t.Fatalf("跳转失败: %v", err)
	}

	posMs, _ := e.Position()
	if posMs < 3800 || posMs > 4300 {
		t.Errorf("跳转到 4 秒后位置 = %dms，期望约 4000ms", posMs)
	}

	// 跳转后应当继续推进
	time.Sleep(400 * time.Millisecond)
	later, _ := e.Position()
	if later <= posMs {
		t.Errorf("跳转后位置没有继续推进：%dms → %dms", posMs, later)
	}
}

// TestRealPlaybackSpectrumIsLive 频谱必须有数据且随信号变化。
// 这是皮肤可视化的数据源，迁到后端后必须仍然可用。
func TestRealPlaybackSpectrumIsLive(t *testing.T) {
	e, closeEngine := openEngineOrSkip(t)
	defer closeEngine()

	// 用一个低频正弦：能量应当集中在低频段
	dir, path := tempAudioDir(t, "bass.wav", 120, 3.0)
	defer func() { closeEngine(); cleanupDir(dir) }()
	if err := e.Load(path, 0, 0, 1); err != nil {
		t.Fatalf("装载失败: %v", err)
	}
	e.SetGain(1.0)
	e.Play()

	// 等分析器攒满一个窗口（512 帧 ≈ 12ms）+ 平滑起步
	time.Sleep(400 * time.Millisecond)

	bands := e.Spectrum(DefaultBands)
	if bands == nil {
		t.Fatal("播放中频谱为 nil，皮肤会拿不到数据")
	}
	if len(bands) != DefaultBands {
		t.Fatalf("段数 = %d，期望 %d", len(bands), DefaultBands)
	}

	// 必须有非零能量（真在出声），否则说明分析器没拿到样本
	total := 0.0
	for _, v := range bands {
		total += v
	}
	if total <= 0 {
		t.Fatal("频谱全为 0，分析器没有拿到音频数据")
	}

	// 低频正弦的能量应当偏在低段：低频段的均值要高于高频段
	lowSum, highSum := 0.0, 0.0
	for i := 0; i < len(bands)/3; i++ {
		lowSum += bands[i]
	}
	for i := len(bands) * 2 / 3; i < len(bands); i++ {
		highSum += bands[i]
	}
	lowAvg := lowSum / float64(len(bands)/3)
	highAvg := highSum / float64(len(bands)-len(bands)*2/3)
	if lowAvg <= highAvg {
		t.Errorf("120Hz 正弦的低频段均值(%.4f) 不高于高频段(%.4f)，分桶可能有问题",
			lowAvg, highAvg)
	}
}

// TestRealPlaybackEOF 播到结尾必须报告 EOF（自动切下一首依赖它）。
func TestRealPlaybackEOF(t *testing.T) {
	e, closeEngine := openEngineOrSkip(t)
	defer closeEngine()

	dir, path := tempAudioDir(t, "short.wav", 440, 0.5) // 0.5 秒，短一点让测试快
	defer func() { closeEngine(); cleanupDir(dir) }()

	eofCh := make(chan struct{}, 1)
	e.SetEOFHandler(func() {
		select {
		case eofCh <- struct{}{}:
		default:
		}
	})

	if err := e.Load(path, 0, 0, 1); err != nil {
		t.Fatalf("装载失败: %v", err)
	}
	e.Play()

	select {
	case <-eofCh:
		// 正常
	case <-time.After(4 * time.Second):
		t.Fatal("播完了却没有收到 EOF 回调（自动下一首会失效）")
	}

	if !e.EOF() {
		t.Error("EOF() 应当报告已播完")
	}
	if e.Playing() {
		t.Error("播完后 Playing() 应当为 false")
	}
}

// TestRealPlaybackGainAffectsOutput 验证增益真的作用到了输出上。
//
// 这里不看波形（那需要抓取声卡输出），而是验证「设了增益不报错、
// 播放继续推进」—— 真正的听感验证靠人工，但至少保证不会因为
// 增益计算引入 NaN/Inf 而把音频搞成静音。
func TestRealPlaybackGainDoesNotBreakAudio(t *testing.T) {
	e, closeEngine := openEngineOrSkip(t)
	defer closeEngine()

	dir, path := tempAudioDir(t, "tone.wav", 440, 3.0)
	defer func() { closeEngine(); cleanupDir(dir) }()
	if err := e.Load(path, 0, 0, 1); err != nil {
		t.Fatalf("装载失败: %v", err)
	}
	e.Play()

	// 反复大幅改变增益（模拟快速拖动音量条）
	for _, g := range []float64{1.0, 0.0, 2.0, 0.3, 1.5, 0.0, 1.0} {
		e.SetGain(g)
		time.Sleep(60 * time.Millisecond)
	}

	posMs, _ := e.Position()
	if posMs < 200 {
		t.Errorf("增益变化后位置只有 %dms，音频被搞停了", posMs)
	}
	// 增益出现 NaN 会让整条链路变静音，这里用频谱间接验证还有信号
	bands := e.Spectrum(DefaultBands)
	if bands == nil {
		t.Fatal("增益变化后频谱为 nil")
	}
	total := 0.0
	for _, v := range bands {
		total += v
	}
	// 最后一次增益是 1.0，应当有能量
	if total <= 0 {
		t.Error("增益来回变化后没有音频信号（可能引入了 NaN/Inf）")
	}
}

// TestRealPlaybackReloadSwitchesSong 换歌必须干净切换（位置归零、不出旧声音）。
func TestRealPlaybackReloadSwitchesSong(t *testing.T) {
	e, closeEngine := openEngineOrSkip(t)
	defer closeEngine()

	dir, err := os.MkdirTemp("", "audioplay-test")
	if err != nil {
		t.Fatalf("建临时目录失败: %v", err)
	}
	defer func() { closeEngine(); cleanupDir(dir) }()
	a := filepath.Join(dir, "a.wav")
	b := filepath.Join(dir, "b.wav")
	writeTestWAV(t, a, 440, 4.0)
	writeTestWAV(t, b, 880, 2.0)

	if err := e.Load(a, 0, 0, 1); err != nil {
		t.Fatalf("装载 a 失败: %v", err)
	}
	e.Play()
	time.Sleep(400 * time.Millisecond)

	// 换到 b：位置必须归零，时长必须变成 b 的
	if err := e.Load(b, 0, 0, 1); err != nil {
		t.Fatalf("装载 b 失败: %v", err)
	}
	posMs, durMs := e.Position()
	if posMs > 200 {
		t.Errorf("换歌后位置 = %dms，期望接近 0", posMs)
	}
	if durMs < 1900 || durMs > 2100 {
		t.Errorf("换歌后时长 = %dms，期望约 2000ms（还是上一首的？）", durMs)
	}
}

// TestRealPlaybackSwitchWithEffectStaysAudible 是"切歌后没声音"那个 bug
// 在**真实声卡**上的端到端回归测试。
//
// ★ 为什么在已有 TestRealPlaybackReloadSwitchesSong 之外还要这一条：
// 那条测试只验证"位置归零 + 时长正确"，也就是**进度条**的行为。
// 而被报的那个 bug 恰恰是"进度条完全正常、但没有任何声音"——
// 只断言位置的测试根本抓不到它。
//
// 这里补上真正的判据：**频谱能量**。Analyzer 喂的是送进声卡之前的
// 最终 PCM，所以它有能量就等于"真的在出声"。
//
// 覆盖影响面：那个 bug 在**所有档位**下都会发生（Reset 把 EQ 系数清零，
// 而每个档位的 off 之外都有 EQ 段），所以逐个档位都过一遍。
func TestRealPlaybackSwitchWithEffectStaysAudible(t *testing.T) {
	for _, preset := range []EffectPreset{EffectOff, EffectVocal, EffectBass, EffectSurround, EffectLive, EffectHall} {
		t.Run(string(preset), func(t *testing.T) {
			e, closeEngine := openEngineOrSkip(t)
			defer closeEngine()

			dir, err := os.MkdirTemp("", "audioplay-effect-switch")
			if err != nil {
				t.Fatalf("建临时目录失败: %v", err)
			}
			defer func() { closeEngine(); cleanupDir(dir) }()

			a := filepath.Join(dir, "a.wav")
			b := filepath.Join(dir, "b.wav")
			writeTestWAV(t, a, 440, 3.0)
			writeTestWAV(t, b, 660, 3.0)

			e.SetEffect(preset)

			// energy 取一段时间内频谱的总能量峰值。
			//
			// 用"多次采样取最大"而不是单次采样：频谱是 30Hz 的滑动窗口，
			// 起播初期窗口还没填满会返回 nil，单次采样容易假失败。
			// 只要**曾经**有过能量，就说明确实在出声。
			energy := func() float64 {
				var best float64
				for i := 0; i < 10; i++ {
					if bands := e.Spectrum(32); bands != nil {
						var sum float64
						for _, v := range bands {
							sum += v
						}
						if sum > best {
							best = sum
						}
					}
					time.Sleep(60 * time.Millisecond)
				}
				return best
			}

			if err := e.Load(a, 0, 0, 1); err != nil {
				t.Fatalf("装载 a 失败: %v", err)
			}
			e.SetGain(1.0)
			e.Play()
			first := energy()
			if first <= 0 {
				t.Fatalf("第一首（%s）就没有声音 —— 测试前提不成立", preset)
			}

			// ★ 切歌 —— 这正是触发 bug 的动作
			if err := e.Load(b, 0, 0, 1); err != nil {
				t.Fatalf("装载 b 失败: %v", err)
			}
			e.SetGain(1.0)
			e.Play()
			after := energy()

			if after <= 0 {
				t.Errorf("切歌后没有声音（频谱能量 %.4f，切歌前是 %.4f）—— "+
					"这正是「切歌后无声、进度条照走」的 bug", after, first)
			}
		})
	}
}
