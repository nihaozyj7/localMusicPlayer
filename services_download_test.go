package main

import (
	"bytes"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"localmusicplayer/internal/onlinecache"
)

// TestDownloadSameTitleFromCacheKeepsDistinctFiles 盯住一条真实的下载竞态。
//
// 「从试听缓存复制」这条路原来在 CopyPath 之前就把 uniquePath 建立的
// target / target.part 两个占位删掉了（注释还写着「名字已经预定过了，此刻
// 不会有人插进来」）。于是**整个复制期间** target 在文件系统里并不存在，
// 另一个同名任务进入 uniquePath 时会认为这个名字空闲、再次预订同一个名字，
// 两个 copyAndSync 各自改名到同一路径 —— 后者覆盖前者。
//
// 触发条件是两首**不同 bvid、标题相同**的歌（同名歌、Live 版、搜索结果里的
// 重复项）在复制窗口内先后点下载。下面用一个较大的缓存文件把复制窗口拉到
// 几十毫秒，并在 A 已经进入复制之后再放 B 进来，模拟真实「先后点两个下载」。
//
// 修好之后这条用例是**确定性**的：无论 A 复制到哪一步，B 都必须拿到
// 「同名歌曲 (2).m4a」，所以它不会因为机器快慢而间歇性失败。
func TestDownloadSameTitleFromCacheKeepsDistinctFiles(t *testing.T) {
	const (
		title = "同名歌曲"
		bvidA = "BV1same00001a"
		bvidB = "BV1same00001b"
		size  = 48 << 20 // 48MB：把复制窗口放大到足以容纳两次点击的间隔
	)
	payloadA := make([]byte, size)
	payloadB := make([]byte, size)
	for i := range payloadA {
		payloadA[i] = byte('A' + i%26)
		payloadB[i] = byte('a' + i%26)
	}

	cache := onlinecache.New(t.TempDir())
	if _, err := cache.Store(bvidA, "m4a", bytes.NewReader(payloadA)); err != nil {
		t.Fatalf("写入试听缓存（A）失败: %v", err)
	}
	if _, err := cache.Store(bvidB, "m4a", bytes.NewReader(payloadB)); err != nil {
		t.Fatalf("写入试听缓存（B）失败: %v", err)
	}

	dir := t.TempDir()
	svc := &DownloadService{files: cache}
	svc.tasks = []*DownloadTask{
		{ID: "a", BVID: bvidA, Title: title, State: DownloadRunning, Dir: dir},
		{ID: "b", BVID: bvidB, Title: title, State: DownloadRunning, Dir: dir},
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		if !svc.tryCopyFromCache("a", bvidA, title, dir) {
			t.Errorf("A 应当命中试听缓存")
		}
	}()
	// 等 A 真正进入复制（此时它已经预订过名字），再放 B 进来。
	time.Sleep(20 * time.Millisecond)
	go func() {
		defer wg.Done()
		if !svc.tryCopyFromCache("b", bvidB, title, dir) {
			t.Errorf("B 应当命中试听缓存")
		}
	}()
	wg.Wait()

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}

	// 1. 两首同名不同 bvid 的歌必须各留一份，且不能有半成品残留。
	if len(names) != 2 {
		t.Fatalf("应当产出 2 个文件，实际 %d 个：%v（同名下载被静默覆盖）", len(names), names)
	}
	for _, n := range names {
		lower := strings.ToLower(n)
		if strings.Contains(lower, ".part") || strings.HasSuffix(lower, ".moving") {
			t.Fatalf("下载目录里不该有半成品残留：%v", names)
		}
	}

	// 2. 两个任务必须收尾到不同路径。
	pathOf := map[string]string{}
	for _, tk := range svc.tasks {
		pathOf[tk.BVID] = tk.Path
	}
	if pathOf[bvidA] == "" || pathOf[bvidB] == "" {
		t.Fatalf("两个任务都应带着落盘路径收尾，实际 %v", pathOf)
	}
	if pathOf[bvidA] == pathOf[bvidB] {
		t.Fatalf("两个任务收尾到同一路径：%s", pathOf[bvidA])
	}

	// 3. 两份内容不能串（覆盖发生时至少有一份是错的）。
	check := func(bvid string, want []byte) {
		t.Helper()
		got, err := os.ReadFile(pathOf[bvid])
		if err != nil {
			t.Fatalf("读 %s 失败: %v", pathOf[bvid], err)
		}
		if !bytes.Equal(got, want) {
			t.Fatalf("%s 的内容与预期不符（长度 %d，期望 %d）—— 同名文件被覆盖/串写了", bvid, len(got), len(want))
		}
	}
	check(bvidA, payloadA)
	check(bvidB, payloadB)

	// 4. 缓存必须留着（复制语义，不是搬运）——防止将来有人又改成 Move。
	for _, bvid := range []string{bvidA, bvidB} {
		if !cache.Exists(bvid) {
			t.Fatalf("下载不该消费掉试听缓存：%s 的缓存消失了", bvid)
		}
	}
}
