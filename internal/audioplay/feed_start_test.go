package audioplay

import (
	"encoding/binary"
	"path/filepath"
	"testing"
	"time"
)

/* --------------------------------------------------------------------------
   feeder（喂数据的 goroutine）的两个既有缺陷 —— 审查报告第 12 / 47 条

   这两条的共同点是**无声**：一个让「跳过开头静音」完全不生效，一个让整条
   播放链停在一个 5ms 空转里。两条都没有任何日志与报错，所以必须用「读环形
   缓冲里的真实 PCM」与「生产端有没有结束」来断言，而不是看接口返回值。

   测试不打开声卡（New() + Load，与 silence_test.go 的做法一致）：feeder 的行为
   与设备无关，CI 上没有声卡也能跑。
   -------------------------------------------------------------------------- */

// waitBuffered 等环形缓冲里至少攒到 want 帧（feeder 是异步的）。
func waitBuffered(t *testing.T, e *Engine, want int) bool {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if e.ring.buffered() >= want {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return false
}

// TestLoadFeederStartsAtStartFrame 「跳过开头静音」必须真的从 startFrame 开始读。
//
// 缺陷现象（审查报告第 12 条）：`Load` 只 Seek 到 WAV 头就起 feeder，
// `startFeedLocked` 的 startFrame 参数**全文没被使用** —— 实测「以 1.9 秒为起点
// 装载 2 秒 WAV」，出声位置仍是 0。
//
// 判据：音频前 1.9 秒是满幅样本（20000）、最后 0.1 秒是低幅样本（1000）。
// 以 1.9 秒为起点装载后，缓冲里读出来的**第一帧必须是低幅**，而且总量只有约
// 0.1 秒 —— 读到 20000 就说明 feeder 读的是文件开头。
func TestLoadFeederStartsAtStartFrame(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "trim.wav")

	const startMs = 1900
	pcm := concat(loudFrames(msFrames(startMs)), pcmFramesOf(msFrames(100), 1000))
	writeWAV(t, path, pcm)

	e := New()
	defer e.Close()
	if err := e.Load(path, int64(msFrames(startMs)), 0, 1); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}

	if !waitBuffered(t, e, msFrames(50)) {
		t.Fatalf("feeder 没有把数据读进缓冲（可读帧数 = %d）", e.ring.buffered())
	}

	out := make([]byte, FrameSize)
	frames, _ := e.ring.read(out)
	if frames != 1 {
		t.Fatalf("从缓冲里读 1 帧失败（读到 %d 帧）", frames)
	}
	amp := int16(binary.LittleEndian.Uint16(out))
	if amp != 1000 {
		t.Fatalf("起播处第一帧幅度 = %d，期望 1000（%dms 处）—— startFrame 没生效，跳过开头静音等于没开", amp, startMs)
	}

	// 起点之后的余量也必须对得上：2 秒的文件从 1.9 秒起只剩约 0.1 秒。
	// （读到 2 秒就说明定位没生效，见上面的幅度断言。）
	if got := framesInRing(e) + 1; got > msFrames(150) {
		t.Errorf("起播后可读帧数约 %d 帧（%dms），期望约 %d 帧（100ms）", got, frameToMs(int64(got)), msFrames(100))
	}
}

// framesInRing 是当前可读帧数的小包装（只为了让断言读起来像一句话）。
func framesInRing(e *Engine) int { return e.ring.buffered() }

// TestFeederFinishesOnUnalignedTail 不足一帧的尾巴不能让 feeder 永久空转。
//
// 缺陷现象（审查报告第 47 条）：`ringBuffer.write` 对 `len(pcm)/FrameSize == 0`
// 返回 0，而写循环遇 0 只 `sleep 5ms; continue`，`written` 不前进使内层 for
// 永不退出 —— PCM 长度为非 4 整数倍（尾部剩 1~3 字节）即命中，后果是**整条
// 播放链无声且无日志**。
//
// 判据：生产端必须走到 EOF（`ring.closed` 为真）。旧实现下它永远不结束。
func TestFeederFinishesOnUnalignedTail(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tail.wav")

	pcm := append(loudFrames(msFrames(100)), 0xAB, 0xCD) // 多出 2 字节：凑不满一帧
	writeWAV(t, path, pcm)

	e := New()
	defer e.Close()
	if err := e.Load(path, 0, 0, 1); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	closed := false
	for time.Now().Before(deadline) {
		if _, c := e.ring.state(); c {
			closed = true
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if !closed {
		t.Fatalf("结束标记始终没有设置（可读帧数 = %d）—— feeder 在不足一帧的尾巴上空转，播放链会停在那里且无日志", e.ring.buffered())
	}

	// 尾巴被丢掉，但完整的那 100ms 一帧不少
	if got := e.ring.buffered(); got != msFrames(100) {
		t.Errorf("有效数据 = %d 帧，期望 %d 帧（只该丢掉那 2 个凑不满一帧的字节）", got, msFrames(100))
	}
}
