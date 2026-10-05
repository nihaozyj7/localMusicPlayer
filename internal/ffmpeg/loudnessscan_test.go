package ffmpeg

import (
	"math"
	"testing"
)

/* --------------------------------------------------------------------------
   转码顺手扫描的正确性锚点
   --------------------------------------------------------------------------
   LoudnessScanner 是 internal/loudness 那套 BS.1770 实现的流式兄弟：一个跑在
   「转码时顺手算」这条零成本路径上，一个跑在「起 ffmpeg 兜底测量」上。
   两者必须给出同一组数 —— 否则用户会看到「同一首歌，播放时算的和批量算的
   不一样」，而那种不一致极难排查。

   这组测试用**已知解析解**的信号来锚定，不依赖另一个实现对不对：

     · 满量程 997Hz 正弦的整合响度 = -3.01 LKFS（BS.1770 的标定锚点）
     · 立体声同信号比单声道响 3.01 LU（左右声道能量相加）
     · 幅度减半低 6.02 LU
   -------------------------------------------------------------------------- */

// scannerFill 用 997Hz 正弦填满扫描器（交错立体声，幅度 amp）
func scannerFill(rate int, seconds float64, amp float64) *LoudnessScanner {
	sc := NewLoudnessScanner(rate, 2)
	n := int(float64(rate) * seconds)
	pcm := make([]byte, n*4)
	for i := 0; i < n; i++ {
		v := int16(amp * math.Sin(2*math.Pi*997*float64(i)/float64(rate)) * 32767)
		put := func(off int) {
			pcm[off] = byte(uint16(v))
			pcm[off+1] = byte(uint16(v) >> 8)
		}
		put(i * 4)
		put(i*4 + 2)
	}
	// 按 256KB 分块喂，模拟转码时的真实喂法
	const chunk = 256 << 10
	for i := 0; i < len(pcm); i += chunk {
		end := i + chunk
		if end > len(pcm) {
			end = len(pcm)
		}
		sc.Write(pcm[i:end])
	}
	return sc
}

// TestScanLoudnessAnchor 满量程 997Hz 立体声正弦：单声道 -3.01、立体声约 0
//
// 与 internal/loudness/bs1770_test.go 用的是同一条标准锚点。
// 这条测试是「顺手扫描」不能算错的第一道防线 —— 曾经这里虚高近 8 LU。
func TestScanLoudnessAnchor(t *testing.T) {
	sc := scannerFill(48000, 10, 1.0)
	got := sc.Result().Integrated

	// 立体声同信号 = 单声道 + 3.01 LU = -3.01 + 3.01 ≈ 0
	if math.Abs(got-0.0) > 0.15 {
		t.Errorf("满量程 997Hz 立体声 = %.2f LUFS，期望约 0.00（偏差超过 0.15，"+
			"说明块功率的滑动窗口算错了）", got)
	}
}

// TestScanLoudnessHalfAmplitude 幅度减半应恰好低 6.02 LU
func TestScanLoudnessHalfAmplitude(t *testing.T) {
	full := scannerFill(48000, 8, 1.0).Result().Integrated
	half := scannerFill(48000, 8, 0.5).Result().Integrated
	if diff := full - half; math.Abs(diff-6.02) > 0.15 {
		t.Errorf("幅度减半应低 6.02 LU，实际差 %.2f（full=%.2f half=%.2f）", diff, full, half)
	}
}

// TestScanLoudnessMonovsStereo 立体声同信号比单声道响 3.01 LU
func TestScanLoudnessMonovsStereo(t *testing.T) {
	rate := 48000
	mono := NewLoudnessScanner(rate, 1)
	n := rate * 8
	pcm := make([]byte, n*2)
	for i := 0; i < n; i++ {
		v := int16(0.5 * math.Sin(2*math.Pi*997*float64(i)/float64(rate)) * 32767)
		pcm[i*2] = byte(uint16(v))
		pcm[i*2+1] = byte(uint16(v) >> 8)
	}
	mono.Write(pcm)

	stereo := scannerFill(rate, 8, 0.5).Result().Integrated
	monoV := mono.Result().Integrated

	if diff := stereo - monoV; math.Abs(diff-3.01) > 0.15 {
		t.Errorf("双声道同信号应响 3.01 LU，实际差 %.2f（mono=%.2f stereo=%.2f）",
			diff, monoV, stereo)
	}
}

// TestScanLoudnessChunkingIsIrrelevant 喂块大小不能影响结果
//
// 这是「转码顺手扫描」最现实的失效模式：转码时是按 256KB 一块喂的，
// 而一次性喂整首歌不会暴露块边界上的错位。这条测试专门盯住这一点。
func TestScanLoudnessChunkingIsIrrelevant(t *testing.T) {
	rate := 44100
	seconds := 3
	n := rate * seconds
	pcm := make([]byte, n*4)
	for i := 0; i < n; i++ {
		v := int16(0.7 * math.Sin(2*math.Pi*440*float64(i)/float64(rate)) * 32767)
		for c := 0; c < 2; c++ {
			off := i*4 + c*2
			pcm[off] = byte(uint16(v))
			pcm[off+1] = byte(uint16(v) >> 8)
		}
	}

	var results []float64
	for _, chunk := range []int{1, 4096, 256 << 10, len(pcm)} {
		sc := NewLoudnessScanner(rate, 2)
		for i := 0; i < len(pcm); i += chunk {
			end := i + chunk
			if end > len(pcm) {
				end = len(pcm)
			}
			sc.Write(pcm[i:end])
		}
		results = append(results, sc.Result().Integrated)
	}
	for i := 1; i < len(results); i++ {
		if math.Abs(results[i]-results[0]) > 0.05 {
			t.Errorf("喂块大小改变了响度结果：%v（第 %d 个与第 1 个不同）", results, i+1)
		}
	}
}

// TestScanTruePeakAnchor 真峰值应量在**原始样本**上（不是 K 加权之后）
//
// 满量程正弦的真峰值应当是 0 dBTP 左右。如果实现拿滤波后的信号去算，
// 会得到一个大于 0 的数（K 加权在低频有提升），真峰值保护就会误判。
func TestScanTruePeakAnchor(t *testing.T) {
	sc := scannerFill(48000, 2, 1.0)
	tp := sc.Result().TruePeak
	if tp > 0.1 {
		t.Errorf("满量程正弦的真峰值 = %.2f dBTP，不该超过约 0 dBTP"+
			"（大于 0 说明量在了 K 加权之后的信号上）", tp)
	}
	if tp < -0.5 {
		t.Errorf("满量程正弦的真峰值 = %.2f dBTP，期望接近 0", tp)
	}
}

// TestScanSilenceDetection 首尾静音检测（顺手做的另一半工作）
func TestScanSilenceDetection(t *testing.T) {
	rate := 44100
	// 0.5 秒静音 + 1 秒声音 + 0.4 秒静音
	build := func() []byte {
		totalFrames := int(float64(rate) * 1.9)
		total := totalFrames * 4
		pcm := make([]byte, total)
		for i := 0; i < totalFrames; i++ {
			sec := float64(i) / float64(rate)
			if sec >= 0.5 && sec < 1.5 {
				v := int16(0.5 * math.Sin(2*math.Pi*440*float64(i)/float64(rate)) * 32767)
				for c := 0; c < 2; c++ {
					off := i*4 + c*2
					pcm[off] = byte(uint16(v))
					pcm[off+1] = byte(uint16(v) >> 8)
				}
			}
		}
		return pcm
	}
	sc := NewLoudnessScanner(rate, 2)
	pcm := build()
	const chunk = 256 << 10
	for i := 0; i < len(pcm); i += chunk {
		end := i + chunk
		if end > len(pcm) {
			end = len(pcm)
		}
		sc.Write(pcm[i:end])
	}

	head, tail, total := sc.Silence()
	if wantHead := int64(rate) * 500 / 1000; math.Abs(float64(head-wantHead)) > float64(rate)/100 {
		t.Errorf("头部静音 = %d 帧，期望约 %d 帧", head, wantHead)
	}
	if wantTail := int64(rate) * 400 / 1000; math.Abs(float64(tail-wantTail)) > float64(rate)/100 {
		t.Errorf("尾部静音 = %d 帧，期望约 %d 帧", tail, wantTail)
	}
	if wantTotal := int64(rate) * 1900 / 1000; math.Abs(float64(total-wantTotal)) > float64(rate)/50 {
		t.Errorf("总帧数 = %d，期望约 %d", total, wantTotal)
	}
}

// TestScanSilenceNone 有声音的歌不该报出成规模的静音段。
//
// 注意阈值：这里给的是**原始事实**（逐帧看门限），而 997Hz 正弦的第 0 个
// 采样点恰好是 0，所以头部会数到 1 帧 —— 这是事实，不是 bug。
// 「连续 ≥200ms 才算一段静音」那条业务规则由 audioplay.PlanSilenceTrim
// 应用（它会把 1 帧的"静音"直接判为 0）。所以这里按"远小于一段静音"来断言。
func TestScanSilenceNone(t *testing.T) {
	rate := 44100
	sc := scannerFill(rate, 2, 0.6)
	head, tail, _ := sc.Silence()

	// 一段真正的静音至少 200ms（8820 帧）。检出的必须远小于它，
	// 否则 audioplay 那边就会把开头/结尾的音乐误判成静音掐掉。
	threshold := int64(rate) * 200 / 1000
	if head >= threshold {
		t.Errorf("整首都有声音时头部静音 = %d 帧，远超一段静音的 %d 帧", head, threshold)
	}
	if tail >= threshold {
		t.Errorf("整首都有声音时尾部静音 = %d 帧，远超一段静音的 %d 帧", tail, threshold)
	}
}
