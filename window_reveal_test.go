package main

import (
	"testing"
	"time"
	"unsafe"
)

/* ==========================================================================
   摘启动遮罩必须重试
   --------------------------------------------------------------------------
   showPrepared 用 DWM 的 cloak 把窗口遮住（窗口已经是 WS_VISIBLE，但屏幕上
   什么都没有），前端画好首帧之后再摘掉。摘不掉的表现极严重：
   进程活着、托盘图标在、任务栏按钮也在，屏幕上**没有窗口** ——
   用户只能去任务管理器杀进程，而且完全联想不到「DWM 遮罩没摘掉」。

   而 cloakNativeWindow(hwnd,false) 返回 false 有两种成因，其中一种是
   瞬时状态（刚清掉时 DWMWA_CLOAKED 仍读到非 0），也就是「再试一次就好了」。
   原实现只试一次就放弃，这里守住「必须重试」。
   ========================================================================== */

func TestRevealWithRetrySucceedsAfterTransientFailures(t *testing.T) {
	old := revealRetryBaseDelay
	revealRetryBaseDelay = time.Millisecond
	defer func() { revealRetryBaseDelay = old }()

	attempts := 0
	ok := revealWithRetry(nil, func(unsafe.Pointer, bool) bool {
		attempts++
		return attempts >= 3 // 前两次是瞬时失败
	})
	if !ok {
		t.Fatal("第 3 次成功时应当返回 true —— 瞬时失败必须靠重试救回来")
	}
	if attempts != 3 {
		t.Fatalf("成功之后应当立刻停止，实际尝试了 %d 次", attempts)
	}
}

func TestRevealWithRetryGivesUpAfterBudget(t *testing.T) {
	old := revealRetryBaseDelay
	revealRetryBaseDelay = time.Millisecond
	defer func() { revealRetryBaseDelay = old }()

	attempts := 0
	ok := revealWithRetry(nil, func(unsafe.Pointer, bool) bool {
		attempts++
		return false
	})
	if ok {
		t.Fatal("始终失败时不能返回 true（调用方据此把遮罩标记放回去重试）")
	}
	if attempts != revealRetryAttempts {
		t.Fatalf("应当正好尝试 %d 次，实际 %d 次", revealRetryAttempts, attempts)
	}
}

func TestRevealWithRetrySucceedsImmediately(t *testing.T) {
	attempts := 0
	ok := revealWithRetry(nil, func(unsafe.Pointer, bool) bool {
		attempts++
		return true
	})
	if !ok || attempts != 1 {
		t.Fatalf("第一次就成功时应当只调一次、不等待重试（实际 %d 次，ok=%v）", attempts, ok)
	}
}

func TestRevealWithRetryAlwaysAsksToUncloak(t *testing.T) {
	// 每次重试的意图都必须是「摘掉」（cloaked=false）——
	// 传成 true 会把本来正常的窗口遮起来，比不重试还糟。
	var seen []bool
	_ = revealWithRetry(nil, func(_ unsafe.Pointer, cloaked bool) bool {
		seen = append(seen, cloaked)
		return len(seen) >= 2 // 第二次成功，只观察前两次
	})
	for i, v := range seen {
		if v {
			t.Fatalf("第 %d 次尝试传的是「遮罩(true)」，应当是「摘遮罩(false)」", i+1)
		}
	}
}
