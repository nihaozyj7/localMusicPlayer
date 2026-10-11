package main

import (
	"bytes"
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
	tee := &pipeTee{r: io.TeeReader(bytes.NewReader(payload), pw), pw: pw}

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
	tee := &pipeTee{r: io.TeeReader(bytes.NewReader(make([]byte, 500_000)), pw), pw: pw}

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
