package covercache

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNameIsContentAddressed(t *testing.T) {
	a := []byte("fake-jpeg-bytes")
	b := []byte("fake-jpeg-bytes")
	c := []byte("fake-jpeg-bytez") // 只差最后一个字节
	d := []byte("fake-jpeg-bytes-longer")

	if Name(a, "image/jpeg") != Name(b, "image/jpeg") {
		t.Fatal("相同内容必须得到相同文件名")
	}
	if Name(a, "image/jpeg") == Name(c, "image/jpeg") {
		t.Fatal("不同内容不应得到相同文件名")
	}
	if Name(a, "image/jpeg") == Name(d, "image/jpeg") {
		t.Fatal("长度不同不应得到相同文件名（长度已混入摘要）")
	}
	if ext := filepath.Ext(Name(a, "image/jpeg")); ext != ".jpg" {
		t.Fatalf("jpeg 扩展名 = %q", ext)
	}
	if ext := filepath.Ext(Name(a, "image/png")); ext != ".png" {
		t.Fatalf("png 扩展名 = %q", ext)
	}

	// 真实 PNG 字节 + 错误的声明 MIME：应以内容嗅探为准，且与正确声明同名
	realPNG := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 32)...)
	if Name(realPNG, "image/jpeg") != Name(realPNG, "image/png") {
		t.Fatal("同一份字节不应因声明的 MIME 不同而得到不同文件名")
	}
	if ext := filepath.Ext(Name(realPNG, "image/jpeg")); ext != ".png" {
		t.Fatalf("内容嗅探应覆盖错误的声明 MIME，实际扩展名 %q", ext)
	}
}

func TestPutDedupesAndIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	data := []byte("same-album-art-for-every-track")

	first, err := s.Put(data, "image/jpeg")
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	second, err := s.Put(data, "image/jpeg")
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if first != second {
		t.Fatalf("同内容重复写入应得到同一个名字: %q vs %q", first, second)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("整张专辑共用一张封面时只应落一个文件，实际 %d 个", len(entries))
	}

	count, bytes := s.Stats()
	if count != 1 || bytes != int64(len(data)) {
		t.Fatalf("Stats = (%d, %d)，期望 (1, %d)", count, bytes, len(data))
	}
}

func TestPruneKeepsReferencedAndYoungFiles(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)

	keepMe, err := s.Put([]byte("still-referenced-cover"), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	orphan, err := s.Put([]byte("no-longer-referenced"), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	justWritten, err := s.Put([]byte("written-this-second"), "image/png")
	if err != nil {
		t.Fatal(err)
	}

	// minAge=0：孤儿立刻回收；被引用的与「刚写完」的都要留着
	removed, _ := s.Prune(map[string]struct{}{keepMe: {}, justWritten: {}}, 0)
	if removed != 1 {
		t.Fatalf("应回收 1 个孤儿，实际 %d", removed)
	}
	if _, ok := s.Path(orphan); ok {
		t.Fatal("孤儿封面应已被删除")
	}
	if _, ok := s.Path(keepMe); !ok {
		t.Fatal("被引用的封面不该被删除")
	}

	// 关键：一个「还没登记进元数据缓存」的新文件（keep 里没有它）不能因为
	// 年龄门槛而幸存 —— 反过来，minAge 足够大时它必须幸存，避免与写入竞争。
	removed, _ = s.Prune(map[string]struct{}{}, time.Hour)
	if removed != 0 {
		t.Fatalf("年龄门槛内的文件不应被回收，实际删了 %d 个", removed)
	}
	if _, ok := s.Path(justWritten); !ok {
		t.Fatal("刚写完的文件被误删（会与 Put → 登记 之间的窗口竞争）")
	}

	// 年龄门槛过了之后，剩下的全部是孤儿，应被清空
	removed, freed := s.Prune(map[string]struct{}{}, -time.Second)
	if removed != 2 || freed <= 0 {
		t.Fatalf("应回收 2 个并释放字节数，实际 (%d, %d)", removed, freed)
	}
	if count, _ := s.Stats(); count != 0 {
		t.Fatalf("回收后不该还有文件，实际 %d 个", count)
	}
}

func TestPutEmptyIsNotAnError(t *testing.T) {
	s := New(t.TempDir())
	name, err := s.Put(nil, "image/jpeg")
	if err != nil || name != "" {
		t.Fatalf("无封面应返回空名字与 nil，实际 (%q, %v)", name, err)
	}
}

func TestValidNameRejectsTraversal(t *testing.T) {
	bad := []string{
		"",
		"../secret.jpg",
		"..\\secret.jpg",
		"sub/dir.jpg",
		"C:\\windows\\win.ini",
		"//server/share/x.jpg",
		"9f2a1c4b7d3e5081.exe",
		"9f2a1c4b7d3e5081",
		"9F2A1C4B7D3E5081.jpg", // 大写：不是本包生成的形态
		"9f2a1c4b7d3e508.jpg",  // 位数不足
	}
	for _, name := range bad {
		if ValidName(name) {
			t.Errorf("ValidName(%q) 应为 false", name)
		}
		if _, ok := New(t.TempDir()).Path(name); ok {
			t.Errorf("Path(%q) 不应命中", name)
		}
	}
	if !ValidName("9f2a1c4b7d3e5081.jpg") {
		t.Error("合法名字被判为非法")
	}
}

func TestHandlerRequiresTokenAndServesImmutable(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	data := []byte("cover-bytes-here")
	name, err := s.Put(data, "image/png")
	if err != nil {
		t.Fatal(err)
	}
	h := s.Handler()

	get := func(target string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	if rec := get(Prefix + name); rec.Code != http.StatusForbidden {
		t.Fatalf("缺 token 应 403，实际 %d", rec.Code)
	}
	rec := get(s.URL(name))
	if rec.Code != http.StatusOK {
		t.Fatalf("带 token 应 200，实际 %d", rec.Code)
	}
	if got := rec.Body.String(); got != string(data) {
		t.Fatalf("响应体 = %q", got)
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Fatalf("内容寻址资源应给 immutable 缓存头，实际 %q", cc)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Fatalf("Content-Type = %q", ct)
	}
	// ServeMux 自己会把含 ".." 的路径 307 重定向到清理后的路径，
	// 所以这里只断言「没有把文件内容吐出来」。
	if rec := get(Prefix + "../covercache.go?t=" + s.token); rec.Code == http.StatusOK {
		t.Fatal("目录穿越不应返回 200")
	}

	// 关键的一道防线（我们自己那道）：直接调用 handler，绕过 ServeMux 的路径清理。
	for _, evil := range []string{
		Prefix + "../covercache.go",
		Prefix + "..%2fcovercache.go",
		Prefix + "sub/../../covercache.go",
		Prefix + "9f2a1c4b7d3e5081.jpg/../../covercache.go",
	} {
		req := &http.Request{Method: http.MethodGet, URL: &url.URL{Path: evil}, RequestURI: evil}
		rec := httptest.NewRecorder()
		s.handle(rec, req)
		if rec.Code == http.StatusOK {
			t.Fatalf("handler 不应为 %q 返回内容", evil)
		}
	}
}
