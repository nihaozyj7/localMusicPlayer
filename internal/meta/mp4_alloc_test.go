package meta

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

/* ==========================================================================
   mp4Duration 的读取缓冲按文件实际大小分配
   --------------------------------------------------------------------------
   旧实现固定 make([]byte, 2<<20)：扫描一首 100KB 的 m4a 也要白白分配并清零
   2MB。全库扫描（每首一次 meta 解析）时这是可观的瞬时内存与 GC 压力。
   这里断言的是**平均每次调用的分配量**，用 runtime.MemStats 的 TotalAlloc
   差值衡量（TotalAlloc 单调递增，不受 GC 影响）。
   ========================================================================== */

// mvhdVersion0 生成 version 0 的 mvhd 负载（不含 box 头）。
// 结构：version/flags(4) creation(4) modification(4) timescale(4) duration(4)。
func mvhdVersion0(timescale, duration uint32) []byte {
	b := make([]byte, 20)
	binary.BigEndian.PutUint32(b[12:16], timescale)
	binary.BigEndian.PutUint32(b[16:20], duration)
	return b
}

func TestMP4DurationAllocatesByFileSize(t *testing.T) {
	data := buildM4A(1000, 60000, nil)
	// 补到 100KB：真实的小 m4a（语音、试听片段）就是这个体量
	if pad := (100 << 10) - len(data); pad > 0 {
		data = append(data, make([]byte, pad)...)
	}
	p := filepath.Join(t.TempDir(), "small.m4a")
	if err := os.WriteFile(p, data, 0o644); err != nil {
		t.Fatal(err)
	}
	if got := mp4Duration(p).durationMS; got != 60000 {
		t.Fatalf("解析时长 = %d ms，期望 60000（夹具不成立，后面的分配断言无意义）", got)
	}

	// 热身一次，把一次性开销（页分配、文件信息缓存）排除在测量之外
	_ = mp4Duration(p)

	const runs = 20
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	for i := 0; i < runs; i++ {
		_ = mp4Duration(p)
	}
	runtime.ReadMemStats(&after)
	avg := (after.TotalAlloc - before.TotalAlloc) / runs
	if avg > 1<<20 {
		t.Fatalf("100KB 的 m4a 每次调用平均分配 %d 字节（旧实现固定 make 2MB）：应当按文件实际大小分配", avg)
	}
}

// TestMP4DurationStillReadsMovAtTail 按大小分配后，moov 在文件尾部（超过头部
// 缓冲）的路径必须仍然能整读兜底解析出时长 —— 这是 2MB 固定缓冲唯一真正
// 服务的场景，收窄分配不能把它弄丢。
func TestMP4DurationStillReadsMovAtTail(t *testing.T) {
	// 前面塞 3MB 的 mdat（超过 2MB 头部缓冲），再把带 mvhd 的 moov 放到尾部
	data := append([]byte("ftypM4A "), make([]byte, 3<<20)...)
	data = append(data, box("moov", box("mvhd", mvhdVersion0(1000, 123000)))...)
	p := filepath.Join(t.TempDir(), "tail.m4a")
	if err := os.WriteFile(p, data, 0o644); err != nil {
		t.Fatal(err)
	}
	if got := mp4Duration(p).durationMS; got != 123000 {
		t.Fatalf("moov 在尾部时时长 = %d ms，期望 123000（整文件兜底路径被破坏了）", got)
	}
}
