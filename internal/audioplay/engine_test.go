/* ==========================================================================
   engine_test.go — 环形缓冲与增益斜坡的单元测试
   --------------------------------------------------------------------------
   这两块是引擎里最容易出微妙错误的部分，而且错了不会崩、只会「听起来不对」：
     · 环形缓冲写错 → 声音断续 / 重复上一段（回绕边界最危险）
     · 增益斜坡写错 → 拖音量条时爆音，或者音量永远到不了目标值
   所以它们不依赖声卡，纯逻辑直接测。
   ========================================================================== */

package audioplay

import (
	"encoding/binary"
	"testing"
)

/* --------------------------------------------------------------------------
   环形缓冲
   -------------------------------------------------------------------------- */

// pcmFrames 生成 n 帧递增的样本，便于校验「读出来的顺序是否与写进去的一致」。
func pcmFrames(n int) []byte {
	buf := make([]byte, n*FrameSize)
	for i := 0; i < n; i++ {
		v := int16(i % 20000) // 不越过 int16 范围
		binary.LittleEndian.PutUint16(buf[i*FrameSize:], uint16(v))
		binary.LittleEndian.PutUint16(buf[i*FrameSize+2:], uint16(v))
	}
	return buf
}

// frameAt 取出第 i 帧的（左声道）样本值
func frameAt(buf []byte, i int) int16 {
	return int16(binary.LittleEndian.Uint16(buf[i*FrameSize:]))
}

func TestRingBufferRoundTrip(t *testing.T) {
	r := newRingBuffer(64)
	in := pcmFrames(32)
	if got := r.write(in); got != 32 {
		t.Fatalf("写入帧数 = %d，期望 32", got)
	}
	if r.buffered() != 32 {
		t.Fatalf("buffered = %d，期望 32", r.buffered())
	}

	out := make([]byte, 32*FrameSize)
	n, underrun := r.read(out)
	if underrun {
		t.Error("数据充足时不该报告欠载")
	}
	if n != 32 {
		t.Fatalf("读出帧数 = %d，期望 32", n)
	}
	for i := 0; i < 32; i++ {
		if frameAt(out, i) != int16(i) {
			t.Fatalf("第 %d 帧 = %d，期望 %d", i, frameAt(out, i), i)
		}
	}
}

// TestRingBufferWraparound 是这里最重要的用例：反复写入超过容量、
// 让读写下标都绕回好几圈，校验数据顺序始终正确。
func TestRingBufferWraparound(t *testing.T) {
	const cap = 64
	r := newRingBuffer(cap)

	// 用一个单调递增的计数器当「全局帧号」，读出时比对即可发现错位。
	var produced int64
	nextFrame := func() int16 {
		v := int16(produced % 20000)
		produced++
		return v
	}

	var consumed int64
	out := make([]byte, 16*FrameSize)

	// 写 7 帧、读 7 帧地推进，故意让读写下标错开，逼出回绕。
	for round := 0; round < 200; round++ {
		chunk := make([]byte, 7*FrameSize)
		for i := 0; i < 7; i++ {
			v := uint16(nextFrame())
			binary.LittleEndian.PutUint16(chunk[i*FrameSize:], v)
			binary.LittleEndian.PutUint16(chunk[i*FrameSize+2:], v)
		}
		if w := r.write(chunk); w != 7 {
			t.Fatalf("第 %d 轮写入 %d 帧，期望 7", round, w)
		}

		n, _ := r.read(out[:7*FrameSize])
		if n != 7 {
			t.Fatalf("第 %d 轮读出 %d 帧，期望 7", round, n)
		}
		for i := 0; i < 7; i++ {
			want := int16(consumed % 20000)
			if got := frameAt(out, i); got != want {
				t.Fatalf("第 %d 轮第 %d 帧 = %d，期望 %d（回绕后数据错位）",
					round, i, got, want)
			}
			consumed++
		}
	}
}

// TestRingBufferUnderrunPadsSilence 校验欠载时补静音而不是重复旧数据。
// 重复旧数据在 WASAPI 下的听感就是「卡带」。
func TestRingBufferUnderrunPadsSilence(t *testing.T) {
	r := newRingBuffer(64)
	// 只写 4 帧，却要读 8 帧
	in := make([]byte, 4*FrameSize)
	for i := 0; i < 4; i++ {
		v := uint16(1000 + i)
		binary.LittleEndian.PutUint16(in[i*FrameSize:], v)
		binary.LittleEndian.PutUint16(in[i*FrameSize+2:], v)
	}
	r.write(in)

	out := make([]byte, 8*FrameSize)
	// 先填成非零，验证「补静音」确实覆盖了脏数据
	for i := range out {
		out[i] = 0xAB
	}
	n, underrun := r.read(out)
	if !underrun {
		t.Error("数据不足时应当报告欠载")
	}
	if n != 4 {
		t.Fatalf("读出帧数 = %d，期望 4", n)
	}
	for i := 0; i < 4; i++ {
		if got := frameAt(out, i); got != int16(1000+i) {
			t.Errorf("第 %d 帧 = %d，期望 %d", i, got, 1000+i)
		}
	}
	for i := 4; i < 8; i++ {
		if got := frameAt(out, i); got != 0 {
			t.Errorf("第 %d 帧（欠载补位）= %d，期望 0", i, got)
		}
	}
}

func TestRingBufferWriteRespectsCapacity(t *testing.T) {
	r := newRingBuffer(8)
	in := pcmFrames(20)
	w := r.write(in)
	if w != 8 {
		t.Fatalf("容量 8 时写入 %d 帧，期望只写入 8", w)
	}
	// 剩余空间已满，再写应当写入 0
	if w2 := r.write(in); w2 != 0 {
		t.Fatalf("缓冲已满时写入 %d 帧，期望 0", w2)
	}
}

func TestRingBufferReset(t *testing.T) {
	r := newRingBuffer(32)
	r.write(pcmFrames(16))
	r.setClosed(true)
	r.reset()
	if r.buffered() != 0 {
		t.Fatalf("reset 后 buffered = %d，期望 0", r.buffered())
	}
	// reset 之后应当可以重新写入满容量
	if w := r.write(pcmFrames(32)); w != 32 {
		t.Fatalf("reset 后写入 %d 帧，期望 32", w)
	}
}

// TestRingBufferStateClosed 校验 state() 能一次取回「可读帧数 + 已结束」。
// 分两次加锁会让「读空」与「已结束」之间出现竞争窗口，导致提前判定播完。
func TestRingBufferStateClosed(t *testing.T) {
	r := newRingBuffer(16)
	if n, closed := r.state(); n != 0 || closed {
		t.Fatalf("初始 state = (%d, %v)，期望 (0, false)", n, closed)
	}
	r.write(pcmFrames(4))
	r.setClosed(true)
	n, closed := r.state()
	if n != 4 || !closed {
		t.Fatalf("state = (%d, %v)，期望 (4, true)", n, closed)
	}
}

/* --------------------------------------------------------------------------
   增益斜坡
   -------------------------------------------------------------------------- */

// TestGainRampIsGradual 是防爆音的核心断言。
//
// 一次回调覆盖 PeriodFrames(1024) ≈ 23ms 的音乐，而斜坡时间常数是 15ms，
// 所以「一次回调就走完」本身是合理的 —— 真正的阶跃风险在于**缓冲内部**：
// 如果整块 1024 帧共用同一个增益值，音量变化在波形上仍然是台阶。
// 因此这里按**单帧**推进来验证斜坡确实是逐帧逼近的。
func TestGainRampIsGradual(t *testing.T) {
	var g gainState
	g.current = 1.0
	g.target = 1.0

	g.set(0.0) // 用户瞬间把音量拉到 0

	// 只推进 1 帧：增益只该移动极小的一步，绝不能直接到 0
	first := g.valueFor(1)
	if first == 0.0 {
		t.Fatal("单帧内增益就跳到 0，会造成爆音；应当做斜坡")
	}
	if first >= 1.0 {
		t.Fatalf("增益没有下降（%v）", first)
	}
	// 15ms 对应的帧数约 661，单帧步长应当约为 1/661
	if first < 1.0-0.01 {
		t.Fatalf("单帧步长过大（增益降到 %v），斜坡没有起作用", first)
	}

	// 持续推进，最终必须精确到达目标值（不能永远逼近却差一点点）
	for i := 0; i < 2000; i++ {
		g.valueFor(PeriodFrames)
	}
	if g.current != 0.0 {
		t.Fatalf("经过足够多次回调后增益 = %v，期望精确到达 0", g.current)
	}
}

// TestGainRampReachesTargetExactly 目标值是可到达的，斜坡必须收敛而不是无限逼近。
func TestGainRampReachesTargetExactly(t *testing.T) {
	var g gainState
	g.current = 0.2
	g.target = 0.2
	g.set(0.9)
	for i := 0; i < 2000; i++ {
		g.valueFor(PeriodFrames)
	}
	if g.current != 0.9 {
		t.Fatalf("增益 = %v，期望精确到达 0.9", g.current)
	}
}

// TestGainRampRateMatchesTimeConstant 斜坡时长应当接近 gainRampTime（与前端手感一致）。
func TestGainRampRateMatchesTimeConstant(t *testing.T) {
	var g gainState
	g.current = 0
	g.target = 0
	g.set(1.0)

	// 按 PeriodFrames 推进，统计到达目标所需的帧数
	total := 0
	for i := 0; i < 10000 && g.current != 1.0; i++ {
		g.valueFor(PeriodFrames)
		total += PeriodFrames
	}
	if g.current != 1.0 {
		t.Fatal("增益始终没有到达目标值")
	}

	// 允许 3 倍余量：这里只要求「量级正确」，不要求精确等于 15ms。
	// 目的是防住「写成了 15 秒」或「一步到位」这两种明显错误。
	wantMs := gainRampTime.Seconds() * 1000
	gotMs := float64(total) / SampleRate * 1000
	if gotMs < wantMs/3 || gotMs > wantMs*3 {
		t.Errorf("斜坡用时 %.1fms，期望在 %.1fms 附近（时间常数写错了？）", gotMs, wantMs)
	}
}

func TestGainClampsNegative(t *testing.T) {
	var g gainState
	g.current = 1
	g.target = 1
	g.set(-5)
	if g.target != 0 {
		t.Fatalf("负增益应被钳到 0，实际 %v", g.target)
	}
}

/* --------------------------------------------------------------------------
   定点缩放
   -------------------------------------------------------------------------- */

func TestApplyGainS16(t *testing.T) {
	// 三个样本：1000, -1000, 32767（用满量程验证钳位）
	buf := make([]byte, 3*FrameSize)
	put := func(i int, v int16) {
		binary.LittleEndian.PutUint16(buf[i*FrameSize:], uint16(v))
		binary.LittleEndian.PutUint16(buf[i*FrameSize+2:], uint16(v))
	}
	put(0, 1000)
	put(1, -1000)
	put(2, 32767)

	applyGainS16(buf, 0.5)

	if got := frameAt(buf, 0); got != 500 {
		t.Errorf("1000 * 0.5 = %d，期望 500", got)
	}
	if got := frameAt(buf, 1); got != -500 {
		t.Errorf("-1000 * 0.5 = %d，期望 -500", got)
	}
	if got := frameAt(buf, 2); got != 16383 {
		t.Errorf("32767 * 0.5 = %d，期望 16383", got)
	}
}

// TestApplyGainS16ClampsInsteadOfWrapping 是防「反相噪声」的关键：
// int16 溢出回绕会把很响的正样本变成很响的负样本，听起来是刺耳的破裂声。
func TestApplyGainS16ClampsInsteadOfWrapping(t *testing.T) {
	buf := make([]byte, 2*FrameSize)
	binary.LittleEndian.PutUint16(buf, uint16(30000))
	binary.LittleEndian.PutUint16(buf[2:], uint16(30000))
	// 用变量打破常量折叠：编译期 uint16(-30000) 会直接报溢出
	negVal := -30000
	neg := uint16(int16(negVal))
	binary.LittleEndian.PutUint16(buf[FrameSize:], neg)
	binary.LittleEndian.PutUint16(buf[FrameSize+2:], neg)

	applyGainS16(buf, 2.0) // 增益 2 倍 → 必然溢出

	if got := frameAt(buf, 0); got != 32767 {
		t.Errorf("正溢出应钳到 32767，实际 %d", got)
	}
	if got := frameAt(buf, 1); got != -32768 {
		t.Errorf("负溢出应钳到 -32768，实际 %d", got)
	}
}

func TestApplyGainS16UnityIsNoop(t *testing.T) {
	buf := make([]byte, 4*FrameSize)
	for i := range buf {
		buf[i] = byte(i)
	}
	orig := append([]byte(nil), buf...)
	applyGainS16(buf, 1.0)
	for i := range buf {
		if buf[i] != orig[i] {
			t.Fatalf("增益为 1 时不该改动缓冲（偏移 %d）", i)
		}
	}
}

// TestApplyGainRampS16 校验缓冲内插值：起止增益不同时，
// 前半段应当接近 from、后半段应当接近 to，而不是整块都用同一个值。
func TestApplyGainRampS16(t *testing.T) {
	const frames = 100
	buf := make([]byte, frames*FrameSize)
	for i := 0; i < frames; i++ {
		binary.LittleEndian.PutUint16(buf[i*FrameSize:], uint16(10000))
		binary.LittleEndian.PutUint16(buf[i*FrameSize+2:], uint16(10000))
	}

	applyGainRampS16(buf, 0.0, 1.0)

	// 第一个样本接近 0（增益从 0 起步），最后一个接近原值
	if got := frameAt(buf, 0); got > 200 {
		t.Errorf("起始样本 = %d，期望接近 0（从 0 增益起步）", got)
	}
	if got := frameAt(buf, frames-1); got < 9500 {
		t.Errorf("末尾样本 = %d，期望接近 10000（插值到 1.0）", got)
	}
	// 整体应当单调不减
	prev := int16(-1)
	for i := 0; i < frames; i++ {
		got := frameAt(buf, i)
		if got < prev {
			t.Fatalf("第 %d 帧 = %d 小于上一帧 %d，插值不单调", i, got, prev)
		}
		prev = got
	}
}

// TestApplyGainRampS16EqualEndsIsPlainGain 起止相同时应退化成普通乘法。
func TestApplyGainRampS16EqualEndsIsPlainGain(t *testing.T) {
	mk := func() []byte {
		buf := make([]byte, 8*FrameSize)
		for i := 0; i < 8; i++ {
			binary.LittleEndian.PutUint16(buf[i*FrameSize:], uint16(1000))
			binary.LittleEndian.PutUint16(buf[i*FrameSize+2:], uint16(1000))
		}
		return buf
	}
	a, b := mk(), mk()
	applyGainRampS16(a, 0.5, 0.5)
	applyGainS16(b, 0.5)
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("起止相同时应与 applyGainS16 结果一致（偏移 %d）", i)
		}
	}
}

/* --------------------------------------------------------------------------
   frameToMs
   -------------------------------------------------------------------------- */

func TestFrameToMs(t *testing.T) {
	cases := []struct {
		frames int64
		want   int64
	}{
		{0, 0},
		{SampleRate, 1000},
		{SampleRate / 2, 500},
		{SampleRate * 60, 60000},
	}
	for _, c := range cases {
		if got := frameToMs(c.frames); got != c.want {
			t.Errorf("frameToMs(%d) = %d，期望 %d", c.frames, got, c.want)
		}
	}
}

/* --------------------------------------------------------------------------
   常量自洽性：这些值必须与 internal/ffmpeg 的转码输出参数一致，
   写错任何一个都会让 PCM 解析整体错位。
   -------------------------------------------------------------------------- */

func TestOutputConstants(t *testing.T) {
	if SampleRate != 44100 {
		t.Errorf("SampleRate = %d，必须与 ffmpeg.WAVSampleRate(44100) 一致", SampleRate)
	}
	if Channels != 2 {
		t.Errorf("Channels = %d，必须与 ffmpeg.WAVChannels(2) 一致", Channels)
	}
	if BytesPerSample != 2 {
		t.Errorf("BytesPerSample = %d，必须是 16bit", BytesPerSample)
	}
	if FrameSize != 4 {
		t.Errorf("FrameSize = %d，立体声 16bit 应为 4", FrameSize)
	}
	if PeriodFrames <= 0 || PeriodFrames > SampleRate {
		t.Errorf("PeriodFrames = %d，不合理", PeriodFrames)
	}
	// 缓冲必须是整数帧，否则回绕会错位
	if len(newRingBuffer(100).data)%FrameSize != 0 {
		t.Error("环形缓冲长度不是帧的整数倍")
	}
}
