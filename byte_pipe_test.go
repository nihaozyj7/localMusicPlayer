package main

import (
	"bytes"
	"errors"
	"io"
	"sync"
	"testing"
	"time"
)

/* ==========================================================================
   byte_pipe_test.go — 有界内存管道（第六轮审查 N-2）
   --------------------------------------------------------------------------
   N-2：「边播边存」并没有真正与磁盘解耦。io.Pipe 没有缓冲，写端要等读端把
   字节取走才返回，而读端的下一步就是写盘 —— 磁盘一慢，播放跟着卡。
   修法是两侧之间加一层**有界**缓冲（byte_pipe.go），满时仍然回压。

   这里守三件事：
     ① 语义与 io.Pipe 一一对应（EOF / 中止原因 / 读端关闭 / 关闭后再写）；
     ② **解耦**：缓存侧完全不消费时，转发侧至少还能送出「一个缓冲区」的字节；
     ③ **有界**：超出缓冲区就必须回压（否则内存会随试听无限增长）。
   ========================================================================== */

// ① 语义：字节按序到达，写端 Close 之后读端先取空缓冲再拿到 io.EOF。
func TestBytePipePassesBytesInOrderAndEndsWithEOF(t *testing.T) {
	pr, pw := newBytePipe(64)

	payload := bytes.Repeat([]byte("0123456789"), 50) // 500 字节 > 缓冲
	var got bytes.Buffer
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		buf := make([]byte, 7) // 故意用「不整齐」的块大小
		for {
			n, err := pr.Read(buf)
			got.Write(buf[:n])
			if err != nil {
				if !errors.Is(err, io.EOF) {
					t.Errorf("读端错误 = %v，期望 io.EOF", err)
				}
				return
			}
		}
	}()

	if n, err := pw.Write(payload); n != len(payload) || err != nil {
		t.Fatalf("Write = (%d, %v)，期望 (%d, nil)", n, err, len(payload))
	}
	if err := pw.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	<-readDone

	if !bytes.Equal(got.Bytes(), payload) {
		t.Fatalf("字节流不一致：%d 字节，期望 %d", got.Len(), len(payload))
	}
}

// ① 语义：CloseWithError 的原因要原样交给读端（旁路靠它决定「半成品要删掉」）。
func TestBytePipeCloseWithErrorIsDelivered(t *testing.T) {
	pr, pw := newBytePipe(32)
	sentinel := errors.New("客户端断开")

	if _, err := pw.Write([]byte("part")); err != nil {
		t.Fatal(err)
	}
	if err := pw.CloseWithError(sentinel); err != nil {
		t.Fatal(err)
	}

	// 先取空缓冲（io.Pipe 也是这个次序：最后一个块不能丢）
	buf := make([]byte, 8)
	if n, err := pr.Read(buf); n != 4 || err != nil {
		t.Fatalf("Read = (%d, %v)，期望 (4, nil)", n, err)
	}
	if _, err := pr.Read(buf); !errors.Is(err, sentinel) {
		t.Fatalf("读端错误 = %v，期望 %v", err, sentinel)
	}

	// 关闭后再写：与 io.Pipe 一样报 ErrClosedPipe
	if _, err := pw.Write([]byte("x")); !errors.Is(err, io.ErrClosedPipe) {
		t.Fatalf("关闭后写入错误 = %v，期望 io.ErrClosedPipe", err)
	}
	// 幂等：第一次的原因不被覆盖
	_ = pw.CloseWithError(errors.New("第二次原因"))
	if _, err := pr.Read(buf); !errors.Is(err, sentinel) {
		t.Fatalf("重复 CloseWithError 覆盖了第一次的原因：%v", err)
	}
}

// ① 语义：读端关闭 → 正阻塞的写端必须立刻拿到 ErrClosedPipe（不能等下去）。
func TestBytePipeReaderCloseUnblocksWriter(t *testing.T) {
	pr, pw := newBytePipe(16)
	if _, err := pw.Write(bytes.Repeat([]byte("A"), 16)); err != nil {
		t.Fatal(err)
	}

	// 缓冲区已满：这次写必然阻塞，直到读端被关掉
	blocked := make(chan error, 1)
	go func() {
		_, err := pw.Write([]byte("B"))
		blocked <- err
	}()

	// 给写端一点时间真的进入等待（不是断言用，只是让下面的 Close 有对象可唤醒）
	time.Sleep(20 * time.Millisecond)
	if err := pr.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	select {
	case err := <-blocked:
		if !errors.Is(err, io.ErrClosedPipe) {
			t.Fatalf("写端错误 = %v，期望 io.ErrClosedPipe", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("读端关闭后写端仍然在等：这条路径会把「缓存放弃」变成「播放卡死」")
	}
}

/* --------------------------------------------------------------------------
   ② 解耦 + ③ 有界：这条用例就是 N-2 的回归守卫
   -------------------------------------------------------------------------- */

// TestBytePipeAbsorbsSlowCache 缓存侧**完全不消费**时：
//   - 转发侧必须能送完「一个缓冲区」的字节（解耦：这段延迟与磁盘无关）；
//   - 再多送一个字节就必须回压（有界：不然内存会随试听无限增长）。
//
// 修复前（io.Pipe 无缓冲）第一半就做不到：第一个 Write 就会卡在那里等读者，
// 于是转发侧的 Read 也永远不返回 —— 用户看到的是「这一首试听停在某处」。
func TestBytePipeAbsorbsSlowCache(t *testing.T) {
	const cap = 64 << 10
	pr, pw := newBytePipe(cap)
	defer pr.Close()

	// 转发侧：把 cap 个字节写进去。缓存侧此刻**一个字节都没读**（模拟磁盘卡住）。
	written := make(chan error, 1)
	go func() {
		_, err := pw.Write(bytes.Repeat([]byte("X"), cap))
		written <- err
	}()

	select {
	case err := <-written:
		if err != nil {
			t.Fatalf("写入缓冲区失败：%v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("缓存侧没有消费时，转发侧连一个缓冲区的字节都送不出去：" +
			"这正是 N-2 的现象（磁盘慢 → 播放卡），说明缓冲没起作用")
	}

	// ③ 有界：再写一个字节必须**等**（回压），不能无限吃进内存
	extra := make(chan error, 1)
	go func() {
		_, err := pw.Write([]byte("Y"))
		extra <- err
	}()
	select {
	case err := <-extra:
		t.Fatalf("超出缓冲上限后仍然立刻写入成功（err=%v）：缓冲必须是有界的，"+
			"否则试听并发会把内存吃光", err)
	case <-time.After(150 * time.Millisecond):
		// 期望：卡在这里等读者 —— 这才是回压
	}

	// 读者取走第一批，积压的写必须被放行（证明回压能在消费后解除）
	buf := make([]byte, 4096)
	if _, err := pr.Read(buf); err != nil {
		t.Fatalf("Read: %v", err)
	}
	select {
	case err := <-extra:
		if err != nil {
			t.Fatalf("读者取走字节后写入仍报错：%v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("读者已经开始消费，写端却没被唤醒")
	}
}

// TestBytePipeUnbufferedIsSynchronous 无缓冲模式（capacity <= 0）必须退化成
// io.Pipe 的同步交接：读者不取走，写端就不返回。
//
// 这条同时是上面那条用例的**对照**：证明「能一次送完 cap 字节」确实来自缓冲，
// 而不是因为实现其实根本没在等读者。
func TestBytePipeUnbufferedIsSynchronous(t *testing.T) {
	pr, pw := newBytePipe(0)
	defer pr.Close()

	done := make(chan struct{})
	go func() {
		_, _ = pw.Write([]byte("hello"))
		close(done)
	}()

	select {
	case <-done:
		t.Fatal("无缓冲模式下写入立刻就返回了：这等于没有等待读者，语义与 io.Pipe 不符")
	case <-time.After(100 * time.Millisecond):
	}

	buf := make([]byte, 8)
	if n, err := pr.Read(buf); n != 5 || err != nil {
		t.Fatalf("Read = (%d, %v)，期望 (5, nil)", n, err)
	}
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("读者取走之后写端仍然没返回")
	}
}

// TestBytePipeCloseWriteUnblocksFullBufferWriter 守一个**由缓冲引入的新风险**：
// 缓冲区已经满了，此时写端被关（旁路退出时 `teeSink.stop` 就是这么做的），
// 正等在「有空位」上的写必须立刻报 ErrClosedPipe，而不是等一个永远不会来的空位。
//
// 为什么这条必须有：无缓冲的 io.Pipe 里「写端被关」和「读端不再读」是同一件事，
// 加了缓冲之后两者分开了 —— 只查读端会在缓冲区满时留下真死锁（goroutine 泄漏 +
// 转发卡死）。调用点的 teeSink 用 done 标志挡掉了绝大多数情况，但那一句
// 「先查 done、再 stop」的竞态窗口是存在的。
func TestBytePipeCloseWriteUnblocksFullBufferWriter(t *testing.T) {
	pr, pw := newBytePipe(16)
	defer pr.Close()

	if _, err := pw.Write(bytes.Repeat([]byte("A"), 16)); err != nil {
		t.Fatal(err)
	}

	blocked := make(chan error, 1)
	go func() {
		_, err := pw.Write([]byte("B"))
		blocked <- err
	}()
	time.Sleep(20 * time.Millisecond) // 让它真的等在「有空位」上

	if err := pw.CloseWithError(errTeeAborted); err != nil {
		t.Fatal(err)
	}

	select {
	case err := <-blocked:
		if !errors.Is(err, io.ErrClosedPipe) {
			t.Fatalf("写端错误 = %v，期望 io.ErrClosedPipe", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("缓冲区已满 + 写端被关时，写端在等一个永远不会来的空位：" +
			"这条路径会把「缓存放弃」变成「转发卡死 + goroutine 泄漏」")
	}
}

// TestBytePipeConcurrentTransfer 并发读写（-race 下跑）：字节必须一字节不差。
func TestBytePipeConcurrentTransfer(t *testing.T) {
	pr, pw := newBytePipe(1024)

	payload := bytes.Repeat([]byte("abcdefgh"), 4096) // 32 KiB
	var wg sync.WaitGroup
	wg.Add(1)
	var got bytes.Buffer
	go func() {
		defer wg.Done()
		_, _ = io.Copy(&got, pr) // 读到 io.EOF 结束
	}()

	for off := 0; off < len(payload); off += 300 {
		end := off + 300
		if end > len(payload) {
			end = len(payload)
		}
		if n, err := pw.Write(payload[off:end]); err != nil || n != end-off {
			t.Fatalf("Write(%d..%d) = (%d, %v)", off, end, n, err)
		}
	}
	if err := pw.Close(); err != nil {
		t.Fatal(err)
	}
	wg.Wait()

	if !bytes.Equal(got.Bytes(), payload) {
		t.Fatalf("并发传输后字节流不一致：%d 字节，期望 %d", got.Len(), len(payload))
	}
}
