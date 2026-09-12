package media

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"

	"musicplayer/internal/bootstrap"
)

func newTestServer(t *testing.T, ext string, size int) (*Server, bootstrap.Song) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "song."+ext)
	if err := os.WriteFile(path, make([]byte, size), 0o644); err != nil {
		t.Fatal(err)
	}
	st, _ := os.Stat(path)

	song := bootstrap.Song{
		ID:       bootstrap.StableID(path, "t"),
		Path:     path,
		Ext:      ext,
		Size:     st.Size(),
		Duration: 3000,
		ModTime:  st.ModTime().UnixMilli(),
	}
	srv := New(func(id string) (bootstrap.Song, bool) {
		if id == song.ID {
			return song, true
		}
		return bootstrap.Song{}, false
	})
	srv.SetCacheDir(filepath.Join(t.TempDir(), "transcode"))
	return srv, song
}

func do(srv *Server, target, rangeHeader, origin string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, target, nil)
	if rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	srv.handleAudio(rec, req)
	return rec
}

/* --------------------------------------------------------------------------
   CORS：这是响度均衡能否工作的前提
   -------------------------------------------------------------------------- */

func TestCORSHeadersPresent(t *testing.T) {
	srv, song := newTestServer(t, "mp3", 4096)
	rec := do(srv, "/audio/"+song.ID+"?t="+srv.Token(), "", "http://wails.localhost")

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://wails.localhost" {
		t.Errorf("Access-Control-Allow-Origin = %q，期望回显来源", got)
	}
	expose := rec.Header().Get("Access-Control-Expose-Headers")
	for _, want := range []string{"Content-Length", "Content-Range"} {
		if !strings.Contains(expose, want) {
			t.Errorf("Access-Control-Expose-Headers 缺少 %s（跨源时前端读不到）", want)
		}
	}
	if rec.Header().Get("Vary") != "Origin" {
		t.Error("缺少 Vary: Origin")
	}
	// 没有 CORS 头时 Web Audio 会读到纯静音，因此这条必须守住
	if !strings.Contains(rec.Header().Get("Access-Control-Allow-Methods"), "GET") {
		t.Error("Allow-Methods 应包含 GET")
	}
}

func TestCORSWithoutOrigin(t *testing.T) {
	srv, song := newTestServer(t, "mp3", 4096)
	rec := do(srv, "/audio/"+song.ID+"?t="+srv.Token(), "", "")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("无 Origin 时应返回 *，实际 %q", got)
	}
}

func TestOptionsPreflight(t *testing.T) {
	srv, song := newTestServer(t, "mp3", 4096)
	req := httptest.NewRequest(http.MethodOptions, "/audio/"+song.ID+"?t="+srv.Token(), nil)
	req.Header.Set("Origin", "http://wails.localhost")
	rec := httptest.NewRecorder()
	srv.handleAudio(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("预检应返回 204，实际 %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") == "" {
		t.Error("预检缺少 CORS 头")
	}
}

/* --------------------------------------------------------------------------
   鉴权
   -------------------------------------------------------------------------- */

func TestTokenRequired(t *testing.T) {
	srv, song := newTestServer(t, "mp3", 4096)

	if rec := do(srv, "/audio/"+song.ID, "", ""); rec.Code != http.StatusForbidden {
		t.Errorf("无 token 应 403，实际 %d", rec.Code)
	}
	if rec := do(srv, "/audio/"+song.ID+"?t=wrong", "", ""); rec.Code != http.StatusForbidden {
		t.Errorf("错误 token 应 403，实际 %d", rec.Code)
	}
	if rec := do(srv, "/audio/nope?t="+srv.Token(), "", ""); rec.Code != http.StatusNotFound {
		t.Errorf("未知歌曲应 404，实际 %d", rec.Code)
	}
}

func TestFileMissing(t *testing.T) {
	srv, song := newTestServer(t, "mp3", 4096)
	if err := os.Remove(song.Path); err != nil {
		t.Fatal(err)
	}
	if rec := do(srv, "/audio/"+song.ID+"?t="+srv.Token(), "", ""); rec.Code != http.StatusNotFound {
		t.Errorf("文件不存在应 404，实际 %d", rec.Code)
	}
}

/* --------------------------------------------------------------------------
   原生格式：Range / seek
   -------------------------------------------------------------------------- */

func TestNativeRangeRequest(t *testing.T) {
	srv, song := newTestServer(t, "mp3", 4096)
	url := "/audio/" + song.ID + "?t=" + srv.Token()

	rec := do(srv, url, "bytes=0-1023", "")
	if rec.Code != http.StatusPartialContent {
		t.Fatalf("Range 请求应 206，实际 %d", rec.Code)
	}
	if got := rec.Body.Len(); got != 1024 {
		t.Errorf("应返回 1024 字节，实际 %d", got)
	}
	if cr := rec.Header().Get("Content-Range"); !strings.HasPrefix(cr, "bytes 0-1023/") {
		t.Errorf("Content-Range = %q", cr)
	}
	if rec.Header().Get("Content-Type") != "audio/mpeg" {
		t.Errorf("Content-Type = %q", rec.Header().Get("Content-Type"))
	}

	full := do(srv, url, "", "")
	if full.Code != http.StatusOK {
		t.Fatalf("完整请求应 200，实际 %d", full.Code)
	}
	if got := full.Header().Get("Content-Length"); got != "4096" {
		t.Errorf("Content-Length = %q，期望 4096", got)
	}
}

/* --------------------------------------------------------------------------
   转码
   -------------------------------------------------------------------------- */

func TestTranscodeWithoutFFmpeg(t *testing.T) {
	srv, song := newTestServer(t, "ape", 2048)
	srv.ffmpeg = ""

	rec := do(srv, "/audio/"+song.ID+"?t="+srv.Token(), "", "")
	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("缺少 ffmpeg 时应 501，实际 %d（正文: %s）", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "ffmpeg") {
		t.Error("错误信息里应说明是 ffmpeg 问题")
	}
}

/* --------------------------------------------------------------------------
   假 ffmpeg
   --------------------------------------------------------------------------
   转码测试需要「一个能被 exec 的程序」。这里用经典的测试自复用技巧：
   把测试二进制自己当作 ffmpeg 调用，靠环境变量识别并执行 helper 逻辑。
   好处是不依赖 PowerShell、cmd 或任何外部工具，跨平台一致。
   -------------------------------------------------------------------------- */

const (
	helperEnv    = "MP_FAKE_FFMPEG"
	helperSizeEn = "MP_FAKE_FFMPEG_SIZE"
	helperCallEn = "MP_FAKE_FFMPEG_CALLS"
)

func TestMain(m *testing.M) {
	if os.Getenv(helperEnv) == "1" {
		fakeFFmpegHelper()
		return
	}
	os.Exit(m.Run())
}

// fakeFFmpegHelper 模拟 wails 被调用的 ffmpeg：往最后一个参数（输出文件）写 WAV
func fakeFFmpegHelper() {
	size := 844
	if v := os.Getenv(helperSizeEn); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			size = n
		}
	}
	args := os.Args
	out := args[len(args)-1]

	// 记录调用次数，用于验证并发只转码一次
	if calls := os.Getenv(helperCallEn); calls != "" {
		f, err := os.OpenFile(calls, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err == nil {
			_, _ = f.WriteString("call\n")
			_ = f.Close()
		}
	}

	buf := make([]byte, size)
	if size >= 4 {
		copy(buf, "RIFF")
	}
	if err := os.WriteFile(out, buf, 0o644); err != nil {
		os.Exit(1)
	}
	os.Exit(0)
}

// fakeFFmpeg 返回一个可被当作 ffmpeg 执行的路径（即测试二进制本身）
func fakeFFmpeg(t *testing.T, wavSize int, callsFile string) string {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatalf("无法定位测试二进制: %v", err)
	}
	t.Setenv(helperEnv, "1")
	t.Setenv(helperSizeEn, strconv.Itoa(wavSize))
	if callsFile != "" {
		t.Setenv(helperCallEn, callsFile)
	}
	return exe
}

// TestTranscodeCachedAndServedAsFile 转码结果落到缓存后按文件提供：
// 必须带准确的 Content-Length，并且第二次请求不再调用 ffmpeg。
func TestTranscodeCachedAndServedAsFile(t *testing.T) {
	srv, song := newTestServer(t, "ape", 2048)
	srv.SetCacheDir(filepath.Join(t.TempDir(), "tc"))

	const wavSize = 844
	srv.ffmpeg = fakeFFmpeg(t, wavSize, "")

	url := "/audio/" + song.ID + "?t=" + srv.Token()

	rec := do(srv, url, "", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("首次转码请求应 200，实际 %d（%s）", rec.Code, rec.Body.String())
	}
	if got := rec.Body.Len(); got != wavSize {
		t.Errorf("应返回 %d 字节，实际 %d", wavSize, got)
	}
	if got := rec.Header().Get("Content-Length"); got != strconv.Itoa(wavSize) {
		t.Errorf("Content-Length = %q，期望 %d（长度不准会让浏览器一直等）", got, wavSize)
	}
	if got := rec.Header().Get("Content-Type"); got != "audio/wav" {
		t.Errorf("Content-Type = %q", got)
	}

	// Range 请求：转码文件也应支持字节级 seek
	rr := do(srv, url, "bytes=100-199", "")
	if rr.Code != http.StatusPartialContent {
		t.Fatalf("转码文件 Range 应 206，实际 %d", rr.Code)
	}
	if got := rr.Body.Len(); got != 100 {
		t.Errorf("应返回 100 字节，实际 %d", got)
	}

	// 第二次完整请求应命中缓存：把 ffmpeg 换成一个不存在路径，仍然要能返回
	srv.ffmpeg = filepath.Join(t.TempDir(), "definitely-missing.exe")
	again := do(srv, url, "", "")
	if again.Code != http.StatusOK {
		t.Fatalf("第二次请求应命中缓存并返回 200，实际 %d（%s）", again.Code, again.Body.String())
	}
	if again.Body.Len() != wavSize {
		t.Errorf("缓存内容长度不对: %d", again.Body.Len())
	}
}

// TestTranscodeConcurrentSingleFlight 同一首歌并发请求只应转码一次
func TestTranscodeConcurrentSingleFlight(t *testing.T) {
	srv, song := newTestServer(t, "ape", 2048)
	srv.SetCacheDir(filepath.Join(t.TempDir(), "tc"))

	callsFile := filepath.Join(t.TempDir(), "calls.txt")
	srv.ffmpeg = fakeFFmpeg(t, 444, callsFile)

	var wg sync.WaitGroup
	codes := make([]int, 6)
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			rec := do(srv, "/audio/"+song.ID+"?t="+srv.Token(), "", "")
			codes[idx] = rec.Code
		}(i)
	}
	wg.Wait()

	for i, c := range codes {
		if c != http.StatusOK {
			t.Errorf("第 %d 个并发请求状态码 = %d，期望 200", i, c)
		}
	}
	raw, err := os.ReadFile(callsFile)
	if err != nil {
		t.Fatalf("读取调用计数失败: %v", err)
	}
	calls := strings.Count(string(raw), "call")
	if calls != 1 {
		t.Errorf("并发请求应只转码 1 次，实际 %d 次", calls)
	}
}

func TestClearCache(t *testing.T) {
	srv, song := newTestServer(t, "ape", 2048)
	srv.SetCacheDir(filepath.Join(t.TempDir(), "tc"))
	srv.ffmpeg = fakeFFmpeg(t, 200, "")

	if rec := do(srv, "/audio/"+song.ID+"?t="+srv.Token(), "", ""); rec.Code != http.StatusOK {
		t.Fatalf("转码请求失败: %d（%s）", rec.Code, rec.Body.String())
	}
	if n, _ := srv.CacheStats(); n != 1 {
		t.Errorf("缓存应有 1 条，实际 %d", n)
	}
	if err := srv.ClearCache(); err != nil {
		t.Fatalf("清空缓存失败: %v", err)
	}
	if n, b := srv.CacheStats(); n != 0 || b != 0 {
		t.Errorf("清空后缓存应为空，实际 n=%d b=%d", n, b)
	}
}

func TestMimeForExt(t *testing.T) {
	cases := map[string]string{
		"mp3":   "audio/mpeg",
		"flac":  "audio/flac",
		"m4a":   "audio/mp4",
		"wav":   "audio/wav",
		"opus":  "audio/opus",
		"weird": "application/octet-stream",
	}
	for ext, want := range cases {
		if got := mimeForExt(ext); got != want {
			t.Errorf("mimeForExt(%q) = %q，期望 %q", ext, got, want)
		}
	}
}

func TestExactSizeCacheKeyIncludesModTime(t *testing.T) {
	a := bootstrap.Song{Path: `D:\m\a.ape`, Size: 10, ModTime: 100}
	b := a
	b.ModTime = 200
	if cacheKey(a) == cacheKey(b) {
		t.Error("修改时间不同应产生不同的缓存 key")
	}
}

// TestEnsureTranscodedWithoutFFmpeg ffmpeg 不可用时应立刻报错而不是挂住
func TestEnsureTranscodedWithoutFFmpeg(t *testing.T) {
	srv, song := newTestServer(t, "ape", 100)
	srv.SetCacheDir(filepath.Join(t.TempDir(), "tc"))
	srv.ffmpeg = ""

	if _, err := srv.ensureTranscoded(context.Background(), song); err == nil {
		t.Error("ffmpeg 不可用时应报错")
	}
}
