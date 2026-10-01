package onlinecache

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// newTestStore 建一个指向临时目录的缓存（t.TempDir 保证互不干扰）。
func newTestStore(t *testing.T) *Store {
	t.Helper()
	return New(t.TempDir())
}

// payload 生成一段超过 minValidBytes 的内容，模拟一首真实的音频文件。
func payload(n int) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte(i % 251)
	}
	return b
}

func TestStoreAndLookupRoundTrip(t *testing.T) {
	s := newTestStore(t)
	const bvid = "BV1xx411c7mD"
	data := payload(4096)

	written, err := s.Store(bvid, "m4a", bytes.NewReader(data))
	if err != nil {
		t.Fatalf("Store 失败: %v", err)
	}
	if written != int64(len(data)) {
		t.Fatalf("写入字节数 = %d，期望 %d", written, len(data))
	}

	path, ok := s.Lookup(bvid, "m4a")
	if !ok {
		t.Fatal("刚写入的缓存应当命中")
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读取缓存失败: %v", err)
	}
	if !bytes.Equal(got, data) {
		t.Fatal("缓存内容与写入内容不一致")
	}
}

func TestLookupMissOnEmptyAndMissing(t *testing.T) {
	s := newTestStore(t)
	if _, ok := s.Lookup("BVmissing", "m4a"); ok {
		t.Fatal("不存在的缓存不该命中")
	}
	if s.Exists("BVmissing") {
		t.Fatal("Exists 对不存在的缓存应当为 false")
	}
}

// 残file（小于下限）必须被当成「没有缓存」并被清掉。
//
// 这是「试听没声音」最隐蔽的成因：一次中断的请求留下的几百字节文件，
// 如果被当成有效缓存，播放就会拿到一个必然失败的输入。
func TestLookupRejectsAndRemovesStub(t *testing.T) {
	s := newTestStore(t)
	const bvid = "BVstub"
	path, ok := s.Path(bvid, "m4a")
	if !ok {
		t.Fatal("应当能生成缓存路径")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, payload(10), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, ok := s.Lookup(bvid, "m4a"); ok {
		t.Fatal("过小的残file不该被当成有效缓存")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("残file应当被顺手删掉")
	}
}

// Store 拒绝过小内容，并且不留下 .part。
func TestStoreRejectsTinyContent(t *testing.T) {
	s := newTestStore(t)
	const bvid = "BVtiny"
	if _, err := s.Store(bvid, "m4a", bytes.NewReader(payload(10))); err == nil {
		t.Fatal("过小内容应当报错")
	}
	if s.Exists(bvid) {
		t.Fatal("写入失败后不该存在缓存")
	}
	entries, _ := os.ReadDir(s.Dir())
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), partSuffix) {
			t.Fatalf("写入失败后不该留下半成品: %s", e.Name())
		}
	}
}

// 写入过程中失败（读取端出错）同样不能留下 .part，也不能留下目标文件。
func TestStoreCleansUpOnReadError(t *testing.T) {
	s := newTestStore(t)
	const bvid = "BVreaderr"
	// 先给足数据超过下限，再让读取报错 —— 覆盖「写到一半失败」这条路径
	_, err := s.Store(bvid, "m4a", &failingReader{data: payload(4096)})
	if err == nil {
		t.Fatal("读取端出错时 Store 应当返回错误")
	}
	if s.Exists(bvid) {
		t.Fatal("失败后不该留下缓存文件")
	}
	entries, _ := os.ReadDir(s.Dir())
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), partSuffix) {
			t.Fatalf("失败后不该留下半成品: %s", e.Name())
		}
	}
}

type failingReader struct {
	data []byte
	read bool
}

func (f *failingReader) Read(p []byte) (int, error) {
	if f.read {
		return 0, io.ErrUnexpectedEOF
	}
	f.read = true
	n := copy(p, f.data)
	return n, nil
}

// Store 对已存在的有效缓存是幂等的：不重复下载。
func TestStoreIdempotent(t *testing.T) {
	s := newTestStore(t)
	const bvid = "BVidem"
	first := payload(4096)
	if _, err := s.Store(bvid, "m4a", bytes.NewReader(first)); err != nil {
		t.Fatal(err)
	}
	// 第二次给不同的内容：既然已有缓存，就不该被覆盖
	second := payload(8192)
	n, err := s.Store(bvid, "m4a", bytes.NewReader(second))
	if err != nil {
		t.Fatal(err)
	}
	if n != int64(len(first)) {
		t.Fatalf("命中已有缓存时应当返回其大小 %d，实际 %d", len(first), n)
	}
	path, _ := s.Lookup(bvid, "m4a")
	got, _ := os.ReadFile(path)
	if !bytes.Equal(got, first) {
		t.Fatal("已有缓存不该被第二次写入覆盖")
	}
}

// 下载语义：Move 之后缓存消失、目标出现，内容是同一份。
func TestMoveConsumesCache(t *testing.T) {
	s := newTestStore(t)
	const bvid = "BVmove"
	data := payload(4096)
	if _, err := s.Store(bvid, "m4a", bytes.NewReader(data)); err != nil {
		t.Fatal(err)
	}

	dst := filepath.Join(t.TempDir(), "song.m4a")
	if err := s.Move(bvid, dst); err != nil {
		t.Fatalf("Move 失败: %v", err)
	}

	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("目标文件不存在: %v", err)
	}
	if !bytes.Equal(got, data) {
		t.Fatal("移动后的内容不一致")
	}
	if s.Exists(bvid) {
		t.Fatal("移动到下载目录后，缓存里不该还留着一份")
	}
}

// 没有缓存时 Move 返回 os.ErrNotExist（下载侧据此回退到网络下载）。
func TestMoveWithoutCache(t *testing.T) {
	s := newTestStore(t)
	err := s.Move("BVnocache", filepath.Join(t.TempDir(), "x.m4a"))
	if !os.IsNotExist(err) {
		t.Fatalf("无缓存时 Move 应当返回 ErrNotExist，实际 %v", err)
	}
}

// 同一个 bvid 只留一份缓存：换扩展名写入后，LookupAny 仍能找到。
func TestLookupAnyFindsCache(t *testing.T) {
	s := newTestStore(t)
	const bvid = "BVany"
	if _, err := s.Store(bvid, "mp3", bytes.NewReader(payload(4096))); err != nil {
		t.Fatal(err)
	}
	path, ext, ok := s.LookupAny(bvid, "")
	if !ok {
		t.Fatal("LookupAny 应当找到缓存")
	}
	if ext != ".mp3" {
		t.Fatalf("扩展名 = %q，期望 .mp3", ext)
	}
	if filepath.Ext(path) != ".mp3" {
		t.Fatalf("路径扩展名不对: %s", path)
	}
}

// Remove / Clear 都要清干净。
func TestRemoveAndClear(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.Store("BVone", "m4a", bytes.NewReader(payload(4096))); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Store("BVtwo", "m4a", bytes.NewReader(payload(4096))); err != nil {
		t.Fatal(err)
	}

	s.Remove("BVone")
	if s.Exists("BVone") {
		t.Fatal("Remove 之后不该还有缓存")
	}
	if !s.Exists("BVtwo") {
		t.Fatal("Remove 不该动到别的歌")
	}

	if err := s.Clear(); err != nil {
		t.Fatalf("Clear 失败: %v", err)
	}
	if s.Exists("BVtwo") {
		t.Fatal("Clear 之后不该还有缓存")
	}
	count, bytes := s.Stats()
	if count != 0 || bytes != 0 {
		t.Fatalf("Clear 之后统计应为 0，实际 count=%d bytes=%d", count, bytes)
	}
}

// Clear 不能删掉目录里不属于本缓存的文件（用户可能把目录指到共用位置）。
func TestClearKeepsForeignFiles(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	if _, err := s.Store("BVmine", "m4a", bytes.NewReader(payload(4096))); err != nil {
		t.Fatal(err)
	}
	foreign := filepath.Join(dir, "用户的文件.txt")
	if err := os.WriteFile(foreign, []byte("keep me"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := s.Clear(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(foreign); err != nil {
		t.Fatal("Clear 不该删掉不属于缓存的文件")
	}
}

// bvid 来自 URL 查询参数：任何可能越界的输入都必须被拒绝，而不是拼出路径。
func TestPathRejectsUnsafeIDs(t *testing.T) {
	s := newTestStore(t)
	for _, bad := range []string{
		"../escape",
		"..\\escape",
		"a/b",
		`a\b`,
		"",
		"  ",
		"BV1;rm -rf",
		"BV1\x00null",
		strings.Repeat("A", 100),
	} {
		if path, ok := s.Path(bad, "m4a"); ok {
			t.Errorf("不安全的 id %q 不该生成路径，却得到 %q", bad, path)
		}
	}
	// 正常 bvid 必须通过
	if _, ok := s.Path("BV1xx411c7mD", "m4a"); !ok {
		t.Error("正常 bvid 应当能生成路径")
	}
}

// 生成的文件名必须落在缓存目录之内。
func TestPathStaysInsideDir(t *testing.T) {
	s := newTestStore(t)
	path, ok := s.Path("BV1xx411c7mD", "m4a")
	if !ok {
		t.Fatal("应当生成路径")
	}
	rel, err := filepath.Rel(s.Dir(), path)
	if err != nil || strings.HasPrefix(rel, "..") {
		t.Fatalf("缓存路径逃出了缓存目录: %s", path)
	}
}

// Stats 统计的是磁盘现状（跨进程有效），而不是本次进程的记账。
func TestStatsReadsFromDisk(t *testing.T) {
	dir := t.TempDir()
	first := New(dir)
	if _, err := first.Store("BVpersist", "m4a", bytes.NewReader(payload(4096))); err != nil {
		t.Fatal(err)
	}
	// 换一个 Store 实例（模拟重启）后仍应看到这份缓存
	second := New(dir)
	if !second.Exists("BVpersist") {
		t.Fatal("缓存应当跨 Store 实例可见")
	}
	count, bytes := second.Stats()
	if count != 1 || bytes != 4096 {
		t.Fatalf("Stats = (%d, %d)，期望 (1, 4096)", count, bytes)
	}
}

func TestNormalizeExt(t *testing.T) {
	cases := map[string]string{
		"":      ".m4a",
		"m4a":   ".m4a",
		".m4a":  ".m4a",
		"M4A":   ".m4a",
		" mp3 ": ".mp3",
	}
	for in, want := range cases {
		if got := NormalizeExt(in); got != want {
			t.Errorf("NormalizeExt(%q) = %q，期望 %q", in, got, want)
		}
	}
}

func TestDefaultDirHonoursEnv(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(EnvDir, dir)
	if got := DefaultDir(); got != dir {
		t.Fatalf("DefaultDir() = %q，期望 %q", got, dir)
	}
	// New("") 也要走同一个默认值
	if got := New("").Dir(); got != dir {
		t.Fatalf("New(\"\").Dir() = %q，期望 %q", got, dir)
	}
}
