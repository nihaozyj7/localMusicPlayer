package audioplay

import (
	"encoding/binary"
	"testing"
)

/* ==========================================================================
   增益斜坡的**组装**测试
   --------------------------------------------------------------------------
   为什么单独一个文件：applyGainRampS16 与 gainState.valueFor 各自都有测试
   （见 engine_test.go 的 TestApplyGainRampS16 / TestGainRampIsGradual），
   而且都是对的 —— 但把它们组装进音频回调时写反了顺序：

     applyGainRampS16(buf, e.gain.currentValue(), e.gain.valueFor(n))

   valueFor 会**推进并返回** current，currentValue 读的也是同一个 current，
   所以两个实参永远是同一个数 → 走 `from == to` 的退化分支 →
   缓冲内插值一次都没生效过：拖动音量条 / 响度补偿切换时听到的正是它注释里
   说要消除的那串细碎「咔」声。

   这类「单元都对、组装错」的 bug 只有组装层的测试能抓到，所以这里直接测
   gainState.applyGain（回调现在调用的就是它）。
   ========================================================================== */

// s16Buffer 造一个「每帧两个声道都是同一常量」的缓冲。
func s16Buffer(frames int, value int16) []byte {
	buf := make([]byte, frames*FrameSize)
	for i := 0; i < frames; i++ {
		for c := 0; c < Channels; c++ {
			binary.LittleEndian.PutUint16(buf[i*FrameSize+c*BytesPerSample:], uint16(value))
		}
	}
	return buf
}

// channelValues 取出左声道每帧的样本值。
func channelValues(buf []byte, frames int) []int16 {
	out := make([]int16, frames)
	for i := 0; i < frames; i++ {
		out[i] = int16(binary.LittleEndian.Uint16(buf[i*FrameSize:]))
	}
	return out
}

func TestGainApplyGainInterpolatesWithinBuffer(t *testing.T) {
	const frames = 64
	const amp = int16(12000)

	g := &gainState{}
	g.set(1) // 目标拉满，但 current 还在 0：斜坡必然跨好几个缓冲
	if g.current == g.target {
		t.Fatal("夹具不成立：初始 current 应当与 target 不同")
	}

	buf := s16Buffer(frames, amp)
	before := g.current
	g.applyGain(buf, frames)

	vals := channelValues(buf, frames)

	// ① 块内必须**不是**同一个值（这正是修复前退化成阶跃的样子）
	distinct := map[int16]bool{}
	for _, v := range vals {
		distinct[v] = true
	}
	if len(distinct) < 2 {
		t.Fatalf("缓冲内增益没有插值：%d 帧只有 %d 个不同值（整块乘了同一个增益）", frames, len(distinct))
	}

	// ② 而且必须单调递增：斜坡的方向是 0 → target
	for i := 1; i < len(vals); i++ {
		if vals[i] < vals[i-1] {
			t.Fatalf("第 %d 帧比前一帧小（%d < %d），斜坡不是单调的", i, vals[i], vals[i-1])
		}
	}

	// ③ 起点必须接近**本缓冲开始前**的增益，而不是结束时的增益。
	//    修复前的写法会让第一帧就已经乘上了终点增益，于是这里会显著偏大。
	wantFirst := int16(float64(amp) * before)
	if diff := int(vals[0]) - int(wantFirst); diff < -2 || diff > 2 {
		t.Fatalf("首帧幅度 %d 与「缓冲起点增益 × %d」(%d) 不符 —— 起点增益取错了（多半是先推进再取值）",
			vals[0], amp, wantFirst)
	}

	// ④ 末尾必须更接近终点增益（证明斜坡真的往前走了）
	if vals[frames-1] <= vals[0] {
		t.Fatalf("末帧(%d)没有比首帧(%d)更接近目标增益", vals[frames-1], vals[0])
	}
	if g.current <= before {
		t.Fatalf("applyGain 没有推进 current：%v → %v", before, g.current)
	}
}

func TestGainApplyGainSteadyStateIsPlainMultiplication(t *testing.T) {
	// 增益稳定时（current == target）不应当有斜坡：整块乘同一个值。
	g := &gainState{}
	g.setHard(0.5)
	buf := s16Buffer(32, 10000)
	g.applyGain(buf, 32)
	for i, v := range channelValues(buf, 32) {
		if v != 5000 {
			t.Fatalf("第 %d 帧是 %d，期望 5000（稳态应当是一次普通乘法）", i, v)
		}
	}
}

func TestGainValueForAdvancesCurrentSoOrderMatters(t *testing.T) {
	// 这条用例的作用是**文档化那个陷阱**：valueFor 推进 current，
	// 所以「先 valueFor 再 currentValue」拿到的是同一个值。
	// 如果将来有人把 applyGain 里的两行换回来，上面那条组装测试会红，
	// 而这一条能解释红在哪里。
	g := &gainState{}
	g.set(1)

	to := g.valueFor(64)
	from := g.currentValue()
	if from != to {
		t.Fatalf("valueFor 之后 currentValue 应当等于返回值（这正是顺序陷阱）：%v vs %v", from, to)
	}

	// 顺序正确时两者必须不同（否则斜坡根本没有存在意义）
	g2 := &gainState{}
	g2.set(1)
	from2 := g2.currentValue()
	to2 := g2.valueFor(64)
	if from2 == to2 {
		t.Fatalf("正确顺序下起点与终点必须不同：%v vs %v", from2, to2)
	}
}
