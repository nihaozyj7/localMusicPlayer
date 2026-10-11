package audioplay

import (
	"sync"
	"testing"
)

/* ==========================================================================
   音效链的跨线程安全
   --------------------------------------------------------------------------
   背景（这是一条真实审查结论）：Chain.Reset() 会清空滤波器的历史样本与
   延迟线内容，而这些结构**没有任何锁** —— ProcessStereo 在 malgo 的实时
   线程上直接读写它们。而 Reset() 以前是由控制线程调用的（切歌 Load /
   跳转 SeekToFrame），于是「控制线程整片改写 + 音频线程逐样本读写」
   同时发生：

     · 轻则音频线程读到半更新的状态 —— 混响尾巴没清干净，或者某个
       biquad 的历史里混进上一首的样本（听感是爆音 / 底噪）；
     · 重则把音频线程刚装载好的系数一起清掉，那正是
       「切歌后没声音、进度条照走」那个最严重 bug 的形态。

   -race 之前抓不到它，是因为没有任何测试**同时**做这两件事。
   本文件的用例补上这一点：它们在有竞争时必然报 race。
   ========================================================================== */

// TestChainCrossThreadRequestsAreRaceFree 让音频线程持续处理缓冲，
// 同时控制线程反复请求「清历史 / 换档位 / 读当前档位」——
// 这就是「切歌 + 用户点音效」在真实运行时的并发形态。
//
// ★ 修复前的实现（RequestReset 直接调 Reset、档位用 string 交换）在这条
// 用例下会被 -race 判为数据竞争；现在的实现只做原子标志交换，
// 真正的状态改动全部发生在音频线程的缓冲边界上。
func TestChainCrossThreadRequestsAreRaceFree(t *testing.T) {
	var c Chain
	c.prepare(SampleRate)

	// 音频线程用一份固定输入：不关心音质，只关心「有没有并发读写同一片内存」。
	buf := make([]byte, PeriodFrames*FrameSize)
	for i := range buf {
		buf[i] = byte(i % 251)
	}

	done := make(chan struct{})
	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-done:
				return
			default:
			}
			c.ProcessStereo(buf) // 音频线程：唯一允许改 DSP 状态的地方
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		defer close(done)
		presets := []EffectPreset{EffectSurround, EffectOff, EffectVocal, EffectBass}
		for i := 0; i < 300; i++ {
			c.RequestReset()                         // 切歌 / seek 做的事
			c.RequestPreset(presets[i%len(presets)]) // 用户点音效做的事
			_ = c.CurrentPreset()                    // 诊断信息做的事（控制线程读）
		}
	}()

	wg.Wait()
}

// TestChainRequestResetIsAppliedAtBufferBoundary 验证「请求 → 缓冲边界生效」
// 这条语义本身：RequestReset 只记标志，清空动作由音频线程的
// ProcessStereo 落实。
func TestChainRequestResetIsAppliedAtBufferBoundary(t *testing.T) {
	var c Chain
	c.prepare(SampleRate)
	c.RequestPreset(EffectSurround)
	// 跑几个缓冲，让环绕档把延迟线 / 混响历史填起来
	for i := 0; i < 5; i++ {
		c.ProcessStereo(makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
			v := sineAt(i, 440, 0.5)
			return v, v
		}))
	}

	c.RequestReset()
	// 请求还没被落实：标志应当处于 pending 状态（控制线程不直接改 DSP 状态）
	if !c.resetRequest.Load() {
		t.Fatal("RequestReset 没有留下待落实的标志")
	}

	c.ProcessStereo(makeStereoSamples(PeriodFrames, func(i int) (float64, float64) {
		v := sineAt(i, 440, 0.5)
		return v, v
	}))
	if c.resetRequest.Load() {
		t.Fatal("缓冲边界没有把「清历史」请求消费掉")
	}

	// 未 prepare 的链上请求应当是安全的 no-op（不能 panic、不能置位）
	var fresh Chain
	fresh.RequestReset()
	if fresh.resetRequest.Load() {
		t.Fatal("未 prepare 的链不该接受清历史请求")
	}
}

// TestPresetCodeRoundTrip 保证整数编码是 EffectPresets 上的双射。
//
// 这个映射是跨线程交换档位的唯一通道，一旦漏了某个档位，
// 症状是「点这个音效没反应」—— 而且只在新加的档位上出现，
// 很难联想到「编码表没更新」。
func TestPresetCodeRoundTrip(t *testing.T) {
	seen := map[int32]EffectPreset{}
	for _, p := range EffectPresets {
		code := presetCode(p)
		if other, dup := seen[code]; dup {
			t.Fatalf("档位 %q 与 %q 编码相同（%d），原子交换会互相冒充", p, other, code)
		}
		seen[code] = p
		if got := presetFromCode(code); got != p {
			t.Errorf("presetFromCode(presetCode(%q)) = %q，编码表不是双射", p, got)
		}
	}
	// 未知值必须落回 off（与 NormalizeEffectPreset 同一立场）
	if got := presetFromCode(presetCode("future-preset")); got != EffectOff {
		t.Errorf("未知档位应当落回 off，实际 %q", got)
	}
	// noPendingPreset 不能与任何真实档位的编码冲突
	if _, bad := seen[noPendingPreset]; bad {
		t.Fatalf("哨兵值 %d 与某个真实档位撞了", noPendingPreset)
	}
}

// TestChainRequestPresetDedupesRepeatedRequests 保证调用方的 no-op 判定没退化
// （诊断接口 SetEffect 的返回值依赖它）。
func TestChainRequestPresetDedupesRepeatedRequests(t *testing.T) {
	var c Chain
	c.prepare(SampleRate)

	if !c.RequestPreset(EffectVocal) {
		t.Fatal("首次请求应当返回 true")
	}
	if c.RequestPreset(EffectVocal) {
		t.Fatal("重复请求同一个档位应当返回 false（连续点同一个按钮）")
	}
	// 落实之后，再请求同一个档位仍然是 no-op
	c.ProcessStereo(makeStereoSamples(PeriodFrames, func(i int) (float64, float64) { return 0, 0 }))
	if c.CurrentPreset() != EffectVocal {
		t.Fatalf("档位没有生效，实际 %q", c.CurrentPreset())
	}
	if c.RequestPreset(EffectVocal) {
		t.Fatal("已生效的档位再次请求应当返回 false")
	}
	if !c.RequestPreset(EffectBass) {
		t.Fatal("切换到别的档位应当返回 true")
	}
}
