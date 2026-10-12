package main

import (
	"bytes"
	"io"
	"sync"
)

/* ==========================================================================
   byte_pipe.go — 有界内存管道（io.Pipe 的「带缓冲」替身）
   --------------------------------------------------------------------------
   第六轮审查 N-2：「边播边存」并没有真正与磁盘解耦。

   原实现用 io.Pipe 把写盘挪进旁路 goroutine，但 io.Pipe **没有缓冲**：
   写端必须等到读端把这一批字节取走才返回，而读端的下一步就是写盘 ——
   于是「磁盘慢」顺着 TeeReader 一路传回转发侧，播放跟着卡。
   典型场景：杀软实时扫描、机械盘寻道、网络盘抖动、目录被索引器占用。

   这里给管道加一层**有界**内存缓冲：写端只要缓冲区还有地方就立刻返回，
   磁盘抖动被缓冲吸收；缓冲区满了仍然回压（宁可慢，也不能让内存无上限增长）。
   语义与 io.Pipe 保持一一对应，替换时上层不需要改任何判断：

     io.Pipe 行为                         | bytePipe 行为
     -------------------------------------|--------------------------------------
     Write 阻塞到读者取走                  | Write 阻塞到缓冲区有空位（cap<=0 时退化成前者）
     写端 Close() → 读者读完得到 io.EOF    | 同
     写端 CloseWithError(e) → 读者得到 e   | 同
     读端 Close() → 写端立刻得到 ErrClosedPipe | 同
     写端关闭后再写 → ErrClosedPipe        | 同

   为什么不用 bufio.Writer 顶替：写盘那一段在 internal/onlinecache 的 WriteTo
   里（它同时负责临时文件、原子改名与失败清理），把缓冲塞进那边要改它的接口；
   而「转发侧不被磁盘拖住」这件事的归属地本来就是这条转发路径。
   ========================================================================== */

// bytePipeReader / bytePipeWriter 是同一个管道的两端（与 io.Pipe 一样成对出现）。
type bytePipeReader struct{ p *bytePipe }

type bytePipeWriter struct{ p *bytePipe }

type bytePipe struct {
	mu       sync.Mutex
	notFull  *sync.Cond // 写端等待「缓冲区有空位」
	notEmpty *sync.Cond // 读端等待「缓冲区有数据 / 写端已关闭」

	capacity int
	buf      bytes.Buffer

	werr         error // 写端已关闭：读者取空缓冲后拿到它（io.EOF 或中止原因）
	rerr         error // 读端已关闭：写者立刻拿到 io.ErrClosedPipe
	readerClosed bool
}

// newBytePipe 建一只有 capacity 字节缓冲的管道。
//
// capacity <= 0 表示**无缓冲**：写端要等读端把刚写进去的字节取走才返回 ——
// 与 io.Pipe 完全相同的同步交接语义。保留这个模式有两个用处：一层是给
// 「缓冲到底有没有用」的对照用例一个开关，另一层是万一缓冲量需要临时关掉
// （排查内存问题时）不必改调用点的结构。
func newBytePipe(capacity int) (*bytePipeReader, *bytePipeWriter) {
	b := &bytePipe{capacity: capacity}
	b.notFull = sync.NewCond(&b.mu)
	b.notEmpty = sync.NewCond(&b.mu)
	if capacity > 0 {
		// 预分配：后面每一块都保证不超过 capacity，因此不会再触发扩容。
		b.buf.Grow(capacity)
	}
	return &bytePipeReader{p: b}, &bytePipeWriter{p: b}
}

// Read 实现 io.Reader：没有数据就等，直到有数据、或写端关闭。
//
// 写端关闭后**先取空缓冲**再返回错误 —— io.Pipe 也是这个次序（Close 之后
// 读者必须还能拿到最后一批字节，否则缓存会缺尾巴，而缓存缺尾巴比不缓存更糟）。
func (r *bytePipeReader) Read(p []byte) (int, error) {
	b := r.p
	b.mu.Lock()
	defer b.mu.Unlock()

	for b.buf.Len() == 0 {
		if b.werr != nil {
			return 0, b.werr
		}
		if b.readerClosed {
			return 0, io.ErrClosedPipe
		}
		b.notEmpty.Wait()
	}

	n, _ := b.buf.Read(p) // 缓冲区非空时 bytes.Buffer.Read 不会失败
	b.notFull.Broadcast() // 让出空间：唤醒可能正阻塞的写端
	return n, nil
}

// Close 关闭读端：写端立刻得到 io.ErrClosedPipe（等价 io.PipeReader.Close）。
func (r *bytePipeReader) Close() error {
	b := r.p
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.readerClosed {
		b.readerClosed = true
		b.rerr = io.ErrClosedPipe
	}
	// 两侧都唤醒：写端可能正等在「有空位」上，读端可能正等在「有数据」上。
	b.notFull.Broadcast()
	b.notEmpty.Broadcast()
	return nil
}

// Write 实现 io.Writer：缓冲区有空位就写进去并返回，满了就等。
//
// 返回的 n 一定是 len(p)（除非管道已退役）—— 上层 io.TeeReader 会**忽略**
// 「写了一半但没报错」这种情况，半途返回等于静默丢缓存字节。
func (w *bytePipeWriter) Write(p []byte) (int, error) {
	b := w.p
	b.mu.Lock()
	defer b.mu.Unlock()

	total := 0
	for total < len(p) {
		// ★ 必须同时查「写端已关」：缓冲区满 + 旁路退出时，写端是被
		// CloseWithError 关掉的，此时不会再有读者来腾空位 —— 只查读端会
		// 在这里等一个永远不会来的空位（真死锁）。io.Pipe 同样是报 ErrClosedPipe。
		if b.werr != nil || b.rerr != nil {
			return total, io.ErrClosedPipe
		}

		n := 0
		if b.capacity > 0 {
			space := b.capacity - b.buf.Len()
			if space <= 0 {
				b.notFull.Wait()
				continue
			}
			chunk := p[total:]
			if len(chunk) > space {
				chunk = chunk[:space] // 只写装得下的部分，剩下的下一轮继续（不丢字节）
			}
			n, _ = b.buf.Write(chunk)
		} else {
			n, _ = b.buf.Write(p[total:])
		}
		total += n
		b.notEmpty.Broadcast()

		if b.capacity <= 0 {
			// 无缓冲模式：等读端把这批字节取走，等价 io.Pipe 的同步交接
			for b.buf.Len() > 0 && b.werr == nil && b.rerr == nil {
				b.notFull.Wait()
			}
		}
	}
	return total, nil
}

// Close 正常收尾：读者取空缓冲后拿到 io.EOF。幂等。
func (w *bytePipeWriter) Close() error {
	return w.CloseWithError(io.EOF)
}

// CloseWithError 中止收尾：读者取空缓冲后拿到 err（nil 视为 io.EOF）。幂等。
//
// 已关闭时再调用**不覆盖**第一次的原因：第一次调用说明了这条管道为什么结束
// （正常读完 / 客户端断开 / 缓存写失败），后续的 defer 收尾不该把它改掉。
func (w *bytePipeWriter) CloseWithError(err error) error {
	b := w.p
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.werr == nil {
		if err == nil {
			err = io.EOF
		}
		b.werr = err
	}
	b.notFull.Broadcast()
	b.notEmpty.Broadcast()
	return nil
}
