package library

import (
	"testing"
	"time"
)

/* ==========================================================================
   监听器的「状态必须如实反映现实」
   --------------------------------------------------------------------------
   两个曾经的不一致：

   ① started 只在 Stop() 里归位，但循环还有另一条退出路径：fsnotify 的
      Events/Errors 通道被关闭时 loop 直接 return。此时 started 仍是 true，
      于是之后每次 EnsureStarted / Start 都以为「循环已经起来了」而不启动新的
      —— 界面显示「实时监听已开启」，新落盘的文件却一个事件都收不到。
      这与 Stop() 注释里写的「僵尸监听」是同一种故障，只是触发点不同。

   ② flush() 在锁外读 w.ctx，而 Stop() 在锁内**替换**它：context.Context 是
      接口值（两个机器字），裸读可能拿到半新半旧的组合（数据竞争，甚至崩溃）。
   ========================================================================== */

// watcherStarted 读一下 started（同包白盒，避免为测试加导出接口）。
func watcherStarted(w *Watcher) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.started
}

func TestWatcherLoopExitResetsStarted(t *testing.T) {
	lib, _, _ := newTestManager(t)
	w, err := NewWatcher(lib)
	if err != nil {
		t.Fatalf("创建监听器失败: %v", err)
	}
	defer w.Stop()

	if err := w.Start(nil); err != nil {
		t.Fatal(err)
	}
	if !watcherStarted(w) {
		t.Fatal("Start 之后 started 应当是 true")
	}

	// 模拟「fsnotify 实例被关掉」：Events/Errors 通道随之关闭，
	// 事件循环会走 `if !ok { return }` 这条退出路径（不经过 Stop）。
	w.mu.Lock()
	fsw := w.fsw
	w.mu.Unlock()
	if err := fsw.Close(); err != nil {
		t.Fatalf("关闭监听实例失败: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if !watcherStarted(w) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if watcherStarted(w) {
		t.Fatal("事件循环已经退出，started 却还是 true —— 之后再也起不了新循环：" +
			"用户看到的是「实时监听开着，但新歌永远不出现」")
	}

	// 归位之后必须能重新启动（换一个可用实例，模拟上层的开关切换路径）
	w.Stop()
	if err := w.Start(nil); err != nil {
		t.Fatal(err)
	}
	if !watcherStarted(w) {
		t.Fatal("停止后重新启动失败（僵尸监听）")
	}
}

func TestWatcherStopClearsPendingAndTimer(t *testing.T) {
	lib, _, _ := newTestManager(t)
	w, err := NewWatcher(lib)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Stop()

	// 造一个待处理的变更 + 防抖定时器
	w.enqueue("D:\\Music\\x.flac")
	w.mu.Lock()
	hadTimer := w.timer != nil
	pending := len(w.pending)
	w.mu.Unlock()
	if !hadTimer || pending == 0 {
		t.Fatal("夹具不成立：没能在入队后拿到定时器与待处理集合")
	}

	w.Stop()

	w.mu.Lock()
	defer w.mu.Unlock()
	if w.timer != nil {
		t.Error("Stop 之后防抖定时器还挂着：它可能在 Stop 之后触发一次属于上一代的增量扫描")
	}
	if len(w.pending) != 0 {
		t.Errorf("Stop 之后待处理集合应当清空，实际还有 %d 条", len(w.pending))
	}
}

func TestWatcherFlushUsesContextTakenUnderLock(t *testing.T) {
	// flush 必须在锁内取 ctx：这里只验证「Stop 之后 flush 仍然安全」
	// （不死锁、不 panic）。真正的数据竞争由 -race 在并发用例里抓。
	lib, _, _ := newTestManager(t)
	w, err := NewWatcher(lib)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Stop()

	w.enqueue("D:\\Music\\y.flac")
	w.Stop()  // 替换 ctx、停定时器
	w.flush() // 直接调用（模拟定时器已经在跑）
}
