package main

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"localmusicplayer/internal/bilibili"
	"localmusicplayer/internal/onlinecache"
)

/* ==========================================================================
   试听转发（边播边缓存）的两个死结
   --------------------------------------------------------------------------
   背景：试听时音频字节要「一边转发给播放器、一边写进缓存」，用 io.Pipe 把
   写盘放到旁路 goroutine（磁盘慢不拖累播放）。这套设计有两个真实缺陷：

   ① 缓存已经存在时仍然套了 TeeReader。io.Pipe **没有缓冲**：写端一旦没有
      读者就会永久阻塞。旧实现把「已有缓存」的判断放在 WriteTo 内部直接
      return —— pipe 的读端再也没人读，于是 TeeReader 的每次写都卡死，
      连带 io.Copy(w, body) 卡死。现象是「第二次播同一首在线歌曲，进度条
      走到某处就不动了」。

   ② 转发侧从不关闭 pipe 写端。客户端提前断开（切歌 / 关窗口）时，
      io.Copy 是在**写端**失败的，转发侧读不到 EOF —— 旁路 goroutine 永远
      等不到 EOF，半成品 .part 也永远留在缓存目录里。每断开一次泄漏一个。
   ========================================================================== */

// TestTeeToCacheDoesNotHangWhenAlreadyCached 守 ①。
func TestTeeToCacheDoesNotHangWhenAlreadyCached(t *testing.T) {
	cache := onlinecache.New(t.TempDir())
	const bvid = "BV1cachedtest"

	path, ok := cache.Path(bvid, "m4a")
	if !ok {
		t.Fatal("夹具不成立：拿不到缓存路径")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := bytes.Repeat([]byte("A"), 200_000) // 远大于任何 pipe 内部缓冲
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatal(err)
	}

	svc := &OnlineService{files: cache}
	teed := svc.teeToCache(&bilibili.AudioStream{BVID: bvid}, bytes.NewReader(content))
	defer teed.Close()

	done := make(chan []byte, 1)
	go func() {
		got, _ := io.ReadAll(teed)
		done <- got
	}()

	select {
	case got := <-done:
		if !bytes.Equal(got, content) {
			t.Fatalf("转发的字节数不对：%d，期望 %d", len(got), len(content))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("缓存已经存在时转发被卡死了：pipe 没有读者，" +
			"TeeReader 的写在阻塞（用户可见的现象是「第二次播这首在线歌曲进度条不动了」）")
	}
}

// TestPipeTeeEOFClosesWriter 守「正常读完也要关写端」——
// 不关的话旁路 goroutine 等不到 EOF，缓存文件永远不会落盘。
func TestPipeTeeEOFClosesWriter(t *testing.T) {
	payload := []byte("cache-me-please")
	pr, pw := io.Pipe()
	tee := newPipeTee(bytes.NewReader(payload), pw)

	got := make(chan []byte, 1)
	go func() {
		b, _ := io.ReadAll(pr)
		got <- b
	}()

	read, err := io.ReadAll(tee)
	if err != nil {
		t.Fatalf("转发失败: %v", err)
	}
	if !bytes.Equal(read, payload) {
		t.Fatalf("转发内容不对: %q", read)
	}

	select {
	case b := <-got:
		if !bytes.Equal(b, payload) {
			t.Fatalf("旁路收到的内容不对: %q", b)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("读到 EOF 之后没有关闭 pipe 写端：旁路 goroutine 会永远等不到 EOF，" +
			"缓存文件永远不落盘，goroutine 也永不退出")
	}

	// 写端确实关了：再写必须失败（Close 是幂等的，重复调用无害）
	if _, err := pw.Write([]byte("x")); err == nil {
		t.Error("读完之后 pipe 写端仍然是开着的")
	}
	if err := tee.Close(); err != nil {
		t.Fatalf("Close 应当幂等: %v", err)
	}
}

// TestPipeTeeCloseUnblocksAbortedTransfer 守 ②。
func TestPipeTeeCloseUnblocksAbortedTransfer(t *testing.T) {
	pr, pw := io.Pipe()
	tee := newPipeTee(bytes.NewReader(make([]byte, 500_000)), pw)

	finished := make(chan error, 1)
	go func() {
		// 扮演 s.files.WriteTo：消费 pipe 读端
		_, err := io.Copy(io.Discard, pr)
		finished <- err
	}()

	// 只读一点点就当作「客户端断开了」
	buf := make([]byte, 1024)
	if _, err := tee.Read(buf); err != nil {
		t.Fatal(err)
	}
	if err := tee.Close(); err != nil {
		t.Fatal(err)
	}

	select {
	case err := <-finished:
		if err == nil {
			// 正常 EOF 会走另一条分支：这里必须是**错误**，
			// 否则 writeAtomic 会把一个残缺文件改名成正式缓存。
			t.Fatal("提前中止时旁路应当收到错误（否则半成品会被当成完好的缓存落盘）")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Close 没有让旁路退出：客户端每次断开都会泄漏一个 goroutine + 一个 .part 文件")
	}
}

// TestPipeTeeWithoutPipeForwardsPlainly 保证「不缓存」这条路径不受影响。
func TestPipeTeeWithoutPipeForwardsPlainly(t *testing.T) {
	payload := []byte("no-cache-path")
	tee := &pipeTee{r: bytes.NewReader(payload)}
	got, err := io.ReadAll(tee)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("转发内容不对: %q", got)
	}
	if err := tee.Close(); err != nil {
		t.Fatalf("没有 pipe 时 Close 应当是安全的空操作: %v", err)
	}
}

/* ==========================================================================
   ③ 旁路**先**退出时，转发侧不能跟着卡死
   --------------------------------------------------------------------------
   这是与 ①② 相反方向的第三个死结，且它更严重：①② 的后果是「缓存丢了」，
   ③ 的后果是「正在播的这一首永久卡住」（用户只能切歌）。

   触发条件都是**缓存这一路失败**，而缓存只是可选的加速手段：
     · 磁盘满 / %TEMP% 被清理 / 目录没有写权限 → WriteTo 第一步就失败；
     · 写到一半失败（配额、断电式错误）→ WriteTo 中途返回。
   旧实现里旁路一退出，pipe 就再没有读者，转发侧的下一次 pw.Write 永久阻塞。
   ========================================================================== */

// TestTeeSinkDiscardsAfterCacheGaveUp ③ 的最短路径：旁路已经退出，写入必须丢弃而不是阻塞。
func TestTeeSinkDiscardsAfterCacheGaveUp(t *testing.T) {
	pr, pw := io.Pipe()
	// ★ pr 故意**只在测试结束时**关闭：旧实现的旁路 goroutine 就是这样 ——
	// WriteTo 直接 return，读端既不读也不关。若测试自己在旁路里先关读端，
	// 卡死就会变成「写端报错」，测不出真正的**永久阻塞**（那是用户看到的现象）。
	defer pr.Close()
	tee := newPipeTee(bytes.NewReader(bytes.Repeat([]byte("B"), 300_000)), pw)

	// 扮演「WriteTo 第一步就失败」的旁路：立刻退出，且不读不关 pr
	exited := make(chan struct{})
	go func() {
		defer close(exited)
		defer tee.sink.stop(errTeeCacheFailed)
	}()

	select {
	case <-exited:
	case <-time.After(3 * time.Second):
		t.Fatal("夹具不成立：旁路没能退出")
	}

	done := make(chan int, 1)
	go func() {
		n, _ := io.Copy(io.Discard, tee)
		done <- int(n)
	}()
	select {
	case n := <-done:
		if n != 300_000 {
			t.Fatalf("转发字节数 = %d，期望 300000", n)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("缓存已经放弃后，转发侧仍然被卡死：pipe 没有读者，" +
			"TeeReader 的写永远等不到返回（现象是「这一首试听永久停在某处」）")
	}
}

// TestCacheWriteFailureMidStreamDoesNotBreakPlayback ③ 的中途失败：
// 缓存写到一半失败，**播放仍必须收到完整字节**（缓存失败不能变成播放中断）。
func TestCacheWriteFailureMidStreamDoesNotBreakPlayback(t *testing.T) {
	payload := bytes.Repeat([]byte("C"), 400_000)
	pr, pw := io.Pipe()
	defer pr.Close() // 同上一个用例：不在旁路里关，忠实还原旧实现
	tee := newPipeTee(bytes.NewReader(payload), pw)

	// 扮演写到一半就失败的 WriteTo：只消费 4096 字节然后退出
	cacheGone := make(chan struct{})
	go func() {
		defer close(cacheGone)
		defer tee.sink.stop(errors.New("模拟磁盘满"))
		buf := make([]byte, 4096)
		if _, err := io.ReadFull(pr, buf); err != nil {
			t.Errorf("夹具不成立：旁路没能读到前 4KB: %v", err)
		}
	}()

	got := make(chan []byte, 1)
	go func() {
		b, _ := io.ReadAll(tee)
		got <- b
	}()

	select {
	case b := <-got:
		if !bytes.Equal(b, payload) {
			t.Fatalf("转发内容不完整：%d 字节，期望 %d（缓存失败不该影响播放）", len(b), len(payload))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("缓存中途写失败之后，转发被卡死或提前中断了")
	}
	<-cacheGone
}

// TestTeeSinkKeepsDeliveringWhileCacheAlive 兜底：缓存正常时字节必须照样到达旁路
// （别为了修死锁把 tee 本身修没了）。
func TestTeeSinkKeepsDeliveringWhileCacheAlive(t *testing.T) {
	payload := []byte("both-sides-must-see-this")
	pr, pw := io.Pipe()
	tee := newPipeTee(bytes.NewReader(payload), pw)

	cached := make(chan []byte, 1)
	go func() {
		b, _ := io.ReadAll(pr)
		cached <- b
	}()

	got, err := io.ReadAll(tee)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("转发内容不对: %q", got)
	}
	select {
	case b := <-cached:
		if !bytes.Equal(b, payload) {
			t.Fatalf("旁路拿到的内容不对: %q", b)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("正常路径下旁路没收到字节：tee 被修坏了")
	}
}

// TestCacheStreamFailureDoesNotStallTransfer ③ 的**端到端**版本：
// 真的让 s.files.WriteTo 第一步就失败，整条 teeToCache 必须照样把字节读完。
//
// 与上面两个用例的分工：那两个直接驱动 teeSink（证明「写端退役后丢弃而不是报错」
// 是必要条件），这一个跑**真实的旁路方法** s.cacheStream —— 它同时钉住
// 「旁路退出前必须 stop 写端」这一句：删掉那句 defer，转发侧就会在下一次写入
// 永久阻塞，本用例会在超时后失败（旧实现正是如此）。
func TestCacheStreamFailureDoesNotStallTransfer(t *testing.T) {
	// 让「缓存目录」的位置是一个**普通文件**：MkdirAll / Create 必然失败，
	// 于是旁路第一步就退出。对应真实场景：缓存目录被清理、无写权限、磁盘满。
	blocker := filepath.Join(t.TempDir(), "not-a-dir")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	cache := onlinecache.New(blocker)

	const bvid = "BV1cachefail"
	if _, ok := cache.Path(bvid, "m4a"); !ok {
		t.Fatal("夹具不成立：拿不到缓存路径")
	}

	payload := bytes.Repeat([]byte("D"), 300_000)
	svc := &OnlineService{files: cache}
	teed := svc.teeToCache(&bilibili.AudioStream{BVID: bvid}, bytes.NewReader(payload))
	defer teed.Close()

	done := make(chan []byte, 1)
	go func() {
		b, _ := io.ReadAll(teed)
		done <- b
	}()

	select {
	case b := <-done:
		if !bytes.Equal(b, payload) {
			t.Fatalf("转发内容不完整：%d 字节，期望 %d", len(b), len(payload))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("缓存写失败后转发被永久阻塞：旁路 goroutine 已经退出，" +
			"pipe 没有读者，TeeReader 的写永远等不到返回" +
			"（现象是「这一首试听永久停在某处，只能切歌」）")
	}
}
