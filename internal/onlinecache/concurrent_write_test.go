package onlinecache

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

/* ==========================================================================
   并发写同一个 bvid
   --------------------------------------------------------------------------
   这不是理论问题：试听时用户一拖进度条就会再发一次请求，播放器自己也会重试，
   于是**同一个 bvid 的两条写入路径会真的同时在跑**。

   旧实现里两个写者共用固定的 `<name>.part`：
     · os.Create 会截断对方正在写的文件 → 两边字节交错；
     · 最后被改名出去的是「自己 2MB + 对方 4MB」拼起来的文件，而它会被
       Lookup 当成有效缓存、登记成「可播放」—— 播放到拼接点就断；
     · 先失败的一方还会把对方**正在写**的文件删掉 → 缓存整体消失。
   ========================================================================== */

// slowReader 每次只吐 4KB 并让出时间片：没有它，两个写者根本不会重叠
// （写盘太快），测试就成了空转。
type slowReader struct {
	data []byte
	pos  int
}

func (r *slowReader) Read(p []byte) (int, error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	end := r.pos + 4096
	if end > len(r.data) {
		end = len(r.data)
	}
	n := copy(p, r.data[r.pos:end])
	r.pos += n
	time.Sleep(time.Millisecond)
	return n, nil
}

// TestConcurrentWritesToOneBvidDoNotCorruptCache 是这次修复的核心用例：
// 两个写者（内容不同、长度不同）同时写同一个目标路径。
func TestConcurrentWritesToOneBvidDoNotCorruptCache(t *testing.T) {
	s := newTestStore(t)
	const bvid = "BVconcurrent"
	path, ok := s.Path(bvid, "m4a")
	if !ok {
		t.Fatal("夹具不成立：拿不到缓存路径")
	}

	payloads := [][]byte{
		bytes.Repeat([]byte("A"), 200_000),
		bytes.Repeat([]byte("B"), 300_000),
	}

	var wg sync.WaitGroup
	start := make(chan struct{})
	errs := make([]error, len(payloads))
	writtens := make([]int64, len(payloads))
	for i, p := range payloads {
		wg.Add(1)
		go func(i int, p []byte) {
			defer wg.Done()
			<-start // 一起冲，尽量重叠
			n, err := s.writeAtomic(path, &slowReader{data: p})
			errs[i], writtens[i] = err, n
		}(i, p)
	}
	close(start)
	wg.Wait()

	// ① 成功的写者必须写完自己的全部字节 —— 旧实现下会互相截断
	succeeded := 0
	for i, err := range errs {
		if err != nil {
			continue
		}
		succeeded++
		if writtens[i] != int64(len(payloads[i])) {
			t.Errorf("第 %d 个写者报告成功，却只写了 %d 字节（期望 %d）—— 两个写者互相截断了",
				i, writtens[i], len(payloads[i]))
		}
	}
	if succeeded == 0 {
		t.Fatalf("两个写者都失败了（缓存整体消失，旧实现的典型现象）：errs=%v", errs)
	}

	// ② 目录里不该留下任何半成品
	entries, err := os.ReadDir(s.Dir())
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), partSuffix) {
			t.Errorf("并发写之后留下了半成品: %s", e.Name())
		}
	}

	// ③ 最终缓存必须**完整地等于其中一份**，绝不能是拼接产物
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("最终缓存读不出来: %v", err)
	}
	for i, p := range payloads {
		if bytes.Equal(got, p) {
			return // 完整命中其中一份 = 正确（谁最后改名谁赢，内容都是完整的）
		}
		_ = i
	}
	t.Fatalf("最终缓存既不是 A（%d 字节）也不是 B（%d 字节），而是 %d 字节 —— 两份内容被交错写进了同一个文件",
		len(payloads[0]), len(payloads[1]), len(got))
}

// TestConcurrentWriteTempNamesAreUnique 直接钉住「临时文件名唯一」：
// 旧实现里两个写者的临时文件名完全相同，这正是缺陷的根源。
func TestConcurrentWriteTempNamesAreUnique(t *testing.T) {
	s := newTestStore(t)
	path, ok := s.Path("BVuniq", "m4a")
	if !ok {
		t.Fatal("夹具不成立")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}

	const writers = 32
	names := make([]string, writers)
	var wg sync.WaitGroup
	var mu sync.Mutex
	seen := map[string]int{}
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			f, err := createPart(path)
			if err != nil {
				t.Errorf("createPart 失败: %v", err)
				return
			}
			name := filepath.Base(f.Name())
			_ = f.Close()
			mu.Lock()
			seen[name]++
			mu.Unlock()
			names[i] = name
			_ = os.Remove(f.Name())
		}(i)
	}
	wg.Wait()

	for name, count := range seen {
		if count > 1 {
			t.Errorf("临时文件名 %q 被 %d 个写者同时用到 —— 并发写会互相截断", name, count)
		}
	}
	for _, name := range names {
		if !strings.HasSuffix(name, partSuffix) || !strings.HasPrefix(name, filepath.Base(path)+".") {
			t.Errorf("临时文件名形态不对: %q", name)
		}
	}
}

// TestRemoveAndClearHandleRandomPartNames 半成品改名之后，清理逻辑必须跟上，
// 否则「中断的写入」会在缓存目录里变成永远没人管的垃圾。
func TestRemoveAndClearHandleRandomPartNames(t *testing.T) {
	s := newTestStore(t)
	const bvid = "BVcleanup"
	path, ok := s.Path(bvid, "m4a")
	if !ok {
		t.Fatal("夹具不成立")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}

	newPart := path + ".abc12345" + partSuffix // 新版：带随机后缀
	oldPart := path + partSuffix               // 旧版：固定名（升级上来的目录里可能还有）
	foreign := filepath.Join(s.Dir(), "别人的文件.part")
	for _, p := range []string{newPart, oldPart, foreign} {
		if err := os.WriteFile(p, payload(2048), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	s.Remove(bvid)
	if _, err := os.Stat(newPart); !os.IsNotExist(err) {
		t.Error("Remove 没有清掉新版半成品（带随机后缀）")
	}
	if _, err := os.Stat(oldPart); !os.IsNotExist(err) {
		t.Error("Remove 没有清掉旧版半成品")
	}
	if _, err := os.Stat(foreign); err != nil {
		t.Error("Remove 不该动别人的文件")
	}

	// Clear 同样要认出新旧两种半成品名，但仍然放过无关文件
	if err := os.WriteFile(newPart, payload(2048), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(oldPart, payload(2048), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := s.Clear(); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{newPart, oldPart} {
		if _, err := os.Stat(p); !os.IsNotExist(err) {
			t.Errorf("Clear 没有清掉半成品: %s", filepath.Base(p))
		}
	}
	if _, err := os.Stat(foreign); err != nil {
		t.Error("Clear 不该删掉无关文件")
	}
}

// TestCacheNameRecognizesOnlyOurFiles 钉住清理判据：只认我们生成过的名字。
func TestCacheNameRecognizesOnlyOurFiles(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{"BV1xx411c7mD.m4a", "BV1xx411c7mD.m4a"},
		{"BV1xx411c7mD.m4a.abc12345.part", "BV1xx411c7mD.m4a"},
		{"BV1xx411c7mD.m4a.part", "BV1xx411c7mD.m4a"}, // 旧版固定名
		{"别人的文件.part", ""},
		{"我的歌.mp3", ""},          // 不是我们生成的（bvid 形态不符）
		{"BV1xx411c7mD.txt", ""}, // 不认识的扩展名
		{"..", ""},
	}
	for _, c := range cases {
		if got := cacheName(c.name); got != c.want {
			t.Errorf("cacheName(%q) = %q，期望 %q", c.name, got, c.want)
		}
	}
}
