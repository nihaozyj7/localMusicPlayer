/* ==========================================================================
   services_mediakey_test.go — 媒体键分发的行为测试
   --------------------------------------------------------------------------
   这里**刻意不注册真实的系统热键**：RegisterHotKey 是进程级独占的，
   跑测试时真去注册会（a）在开发机上抢掉用户正在用的媒体键，
   （b）与并行跑的其它测试互相干扰。

   所以只测「按下之后发生了什么」这一段纯逻辑：
     · 前端在线  → 发 media:key 事件，**不**直接动引擎
     · 前端不在线 → 退化为直接翻转
     · 两个都没有 → 静默丢弃，不 panic

   真实按键链路由人工验证（跑起来按一下键盘）。
   ========================================================================== */

package main

import (
	"sync"
	"testing"
)

// TestMediaKeyDispatchEmitsToFrontend 验证「前端在线时只发事件、不碰引擎」。
//
// 这是本模块最要紧的一条约束：后端如果自己动了引擎，前端下一次收到
// 位置锚点就会按自己的 state.playing 把状态覆盖回去，体感是「按一下弹回去」。
func TestMediaKeyDispatchEmitsToFrontend(t *testing.T) {
	var (
		mu       sync.Mutex
		gotEvent string
		gotPay   map[string]any
		fallback int
	)

	svc := NewMediaKeyService(func() {
		mu.Lock()
		fallback++
		mu.Unlock()
	})
	svc.setEmitter(func(name string, payload any) {
		mu.Lock()
		gotEvent = name
		gotPay, _ = payload.(map[string]any)
		mu.Unlock()
	})

	svc.dispatch()

	mu.Lock()
	defer mu.Unlock()
	if gotEvent != mediaKeyEvent {
		t.Fatalf("事件名 = %q，期望 %q", gotEvent, mediaKeyEvent)
	}
	if gotPay == nil || gotPay["action"] != mediaKeyToggleAction {
		t.Fatalf("载荷 = %v，期望 action=%q", gotPay, mediaKeyToggleAction)
	}
	// 前端在线时**不能**走退化路径，否则两边都会改状态
	if fallback != 0 {
		t.Fatalf("前端在线时不该走退化路径，实际调用了 %d 次", fallback)
	}
}

// TestMediaKeyDispatchFallsBackWhenNoFrontend 验证前端缺席时的退化行为。
//
// 场景：热键已注册，但界面还没装配完（startMediaKeys 挂在
// ApplicationStarted 上，比前端 startMediaKeys 早）。此时按键不该被吞掉。
func TestMediaKeyDispatchFallsBackWhenNoFrontend(t *testing.T) {
	var (
		mu    sync.Mutex
		calls int
	)

	svc := NewMediaKeyService(func() {
		mu.Lock()
		calls++
		mu.Unlock()
	})
	// 刻意不 setEmitter：模拟前端未就绪

	svc.dispatch()

	mu.Lock()
	defer mu.Unlock()
	if calls != 1 {
		t.Fatalf("前端缺席时应退化调用一次，实际 %d 次", calls)
	}
}

// TestMediaKeyDispatchWithoutAnySink 验证两个出口都为空时不会 panic。
//
// 媒体键是增强功能，任何情况下都不该让程序崩掉。
func TestMediaKeyDispatchWithoutAnySink(t *testing.T) {
	svc := NewMediaKeyService(nil)
	svc.dispatch() // 不该 panic
}

// TestMediaKeyStopIsIdempotent 验证 Stop 可重复调用。
//
// 退出流程里 OnShutdown 可能被多路径触发，重复 Stop 不能 panic ——
// Hotkey.Unregister 在未注册时返回错误，所以要靠 stopOnce 挡住。
func TestMediaKeyStopIsIdempotent(t *testing.T) {
	svc := NewMediaKeyService(func() {})
	svc.Stop()
	svc.Stop()
	svc.Stop()
}

// TestMediaKeyStatusReportsUnregistered 验证未启动时状态如实上报。
func TestMediaKeyStatusReportsUnregistered(t *testing.T) {
	svc := NewMediaKeyService(func() {})
	st := svc.status()
	if st["registered"] != false {
		t.Fatalf("未启动时 registered 应为 false，实际 %v", st["registered"])
	}
	if st["key"] != "MediaPlayPause" {
		t.Fatalf("key = %v，期望 MediaPlayPause", st["key"])
	}
}
