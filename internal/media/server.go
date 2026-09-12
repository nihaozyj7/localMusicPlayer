// Package media 提供音频给 WebView 播放的本地 HTTP 服务。
//
// 为什么需要它：
//   - 打包后前端运行在 Wails 的虚拟主机 http://wails.localhost 上，
//     无法直接读取任意本地路径（会被当成 file:// 跨源请求拦截）；
//   - ape/wma 等格式 WebView2 无法解码，需要 ffmpeg 转码。
//
// 安全：只监听 127.0.0.1，随机端口 + 每次启动随机 token，
// 只允许访问曲库中登记过的文件，杜绝任意路径读取。
package media

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/ffmpeg"
)

// WAV 输出参数：44.1kHz / 立体声 / 16bit → 176400 字节每秒
const (
	wavSampleRate  = 44100
	wavChannels    = 2
	wavBits        = 16
	wavHeaderSize  = 44
	wavFrameSize   = wavChannels * wavBits / 8 // 一帧 = 声道数 × 位深/8 = 4 字节
	wavBytesPerSec = wavSampleRate * wavFrameSize
)

// transcodeBudgetBytes 转码缓存的总预算。
// 一首 4 分钟的曲子转成 WAV 约 42MB，因此这里按 MB 级别限制，
// 超出后按最久未使用淘汰（正在被读取的条目不会被删）。
const transcodeBudgetBytes = 600 << 20 // 600MB

// Server 本地音频服务
type Server struct {
	token   string
	listen  string
	srv     *http.Server
	songs   func(id string) (bootstrap.Song, bool)
	ffmpeg  string
	mu      sync.Mutex
	running bool

	// 转码缓存：把不能原生播放的格式一次性转成 WAV 落到临时目录，
	// 之后按普通文件提供，从而拥有准确的 Content-Length 与字节级 seek。
	cacheDir string
	cacheMu  sync.Mutex
	cache    map[string]*cacheItem
}

type cacheItem struct {
	path     string
	size     int64
	usedAt   int64
	inflight bool
	done     chan struct{}
	err      error
}

// New 创建服务；songs 用于按 id 反查歌曲（避免暴露任意路径）
func New(songs func(id string) (bootstrap.Song, bool)) *Server {
	tools := ffmpeg.Resolve()
	return &Server{
		token:  bootstrap.RandomID("tk"),
		songs:  songs,
		ffmpeg: tools.FFmpeg,
		cache:  map[string]*cacheItem{},
	}
}

// SetCacheDir 设置转码缓存目录（通常在数据目录下的 cache/transcode）
func (s *Server) SetCacheDir(dir string) {
	s.mu.Lock()
	s.cacheDir = dir
	s.mu.Unlock()
}

func (s *Server) getCacheDir() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cacheDir
}

// RefreshFFmpeg 重新解析 ffmpeg（内置版本解包完成或用户改配置后调用）
func (s *Server) RefreshFFmpeg() {
	ffmpeg.Reset()
	s.mu.Lock()
	s.ffmpeg = ffmpeg.Resolve().FFmpeg
	s.mu.Unlock()
}

// Start 启动监听，返回可访问的基线地址（形如 http://127.0.0.1:52341）
func (s *Server) Start() (string, error) {
	s.mu.Lock()
	if s.running {
		base := s.listen
		s.mu.Unlock()
		return base, nil
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		s.mu.Unlock()
		return "", fmt.Errorf("音频服务监听失败: %w", err)
	}
	s.listen = "http://" + ln.Addr().String()

	mux := http.NewServeMux()
	mux.HandleFunc("/audio/", s.handleAudio)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		setCORS(w, r)
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok"))
	})

	s.srv = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	s.running = true
	base := s.listen
	ff := s.ffmpeg
	s.mu.Unlock()

	go func() {
		if err := s.srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[media] 服务退出: %v", err)
		}
	}()
	log.Printf("[media] 音频服务已启动：%s（ffmpeg: %s）", base, orNone(ff))
	return base, nil
}

// Stop 关闭服务
func (s *Server) Stop() {
	s.mu.Lock()
	if s.srv != nil {
		_ = s.srv.Close()
	}
	s.running = false
	s.mu.Unlock()
}

// BaseURL 返回服务地址（未启动时为空）
func (s *Server) BaseURL() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listen
}

// Token 返回访问令牌
func (s *Server) Token() string { return s.token }

// URLFor 生成某首歌的播放地址
func (s *Server) URLFor(songID string) string {
	s.mu.Lock()
	base := s.listen
	s.mu.Unlock()
	if base == "" {
		return ""
	}
	return fmt.Sprintf("%s/audio/%s?t=%s", base, songID, s.token)
}

// CanTranscode 是否具备转码能力
func (s *Server) CanTranscode() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.ffmpeg != ""
}

/* --------------------------------------------------------------------------
   HTTP 处理
   -------------------------------------------------------------------------- */

// handleAudio 处理播放请求。
//
// 关键：打包后前端在 Wails 的虚拟主机上（http://wails.localhost），
// 音频服务在 http://127.0.0.1:port，属于跨源。实测结论：
//   - <audio> 不加 crossorigin 也能播放，但 Web Audio 会读到纯静音；
//   - fetch/XHR 直接失败。
// 响度均衡需要用 Web Audio 做增益，因此这里必须给出正确的 CORS 头。
func (s *Server) handleAudio(w http.ResponseWriter, r *http.Request) {
	setCORS(w, r)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.URL.Query().Get("t") != s.token {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/audio/")
	if id == "" {
		http.Error(w, "missing song id", http.StatusBadRequest)
		return
	}
	song, ok := s.songs(id)
	if !ok {
		http.Error(w, "song not found", http.StatusNotFound)
		return
	}
	if _, err := os.Stat(song.Path); err != nil {
		http.Error(w, "file missing", http.StatusNotFound)
		return
	}

	// 跨源媒体必须显式暴露这些头，否则前端读不到 Content-Range / Content-Length
	w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Content-Type, Accept-Ranges")
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "no-store")

	if !bootstrap.NeedsTranscode(song.Ext) {
		serveNative(w, r, song)
		return
	}

	if !s.CanTranscode() {
		http.Error(w, "该格式需要 ffmpeg 转码，但当前没有可用的 ffmpeg", http.StatusNotImplemented)
		return
	}

	// 不能原生播放：转成 WAV 落盘后再按普通文件提供（有准确长度、支持 seek）
	path, err := s.ensureTranscoded(r.Context(), song)
	if err != nil {
		http.Error(w, "转码失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	serveFile(w, r, path, "audio/wav")
}

// setCORS 回显请求来源并允许跨源读取。
// 服务只监听 127.0.0.1 且强制 token，因此这里放开来源是安全的。
func setCORS(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = "*"
	}
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", origin)
	h.Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Range, Content-Type")
	h.Set("Vary", "Origin")
}

// serveNative 原生可解码格式：交给 http.ServeContent 处理 Range / Seek。
// 这里固定为播放时的采样率转换参数，避免浏览器端再做一次重采样。
func serveNative(w http.ResponseWriter, r *http.Request, song bootstrap.Song) {
	f, err := os.Open(song.Path)
	if err != nil {
		http.Error(w, "open failed", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		http.Error(w, "stat failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", mimeForExt(song.Ext))
	http.ServeContent(w, r, filepath.Base(song.Path), st.ModTime(), f)
}

// serveFile 按普通文件提供内容（支持 Range）
func serveFile(w http.ResponseWriter, r *http.Request, path, contentType string) {
	f, err := os.Open(path)
	if err != nil {
		http.Error(w, "open failed", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		http.Error(w, "stat failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", contentType)
	http.ServeContent(w, r, filepath.Base(path), st.ModTime(), f)
}

/* --------------------------------------------------------------------------
   转码缓存
   -------------------------------------------------------------------------- */

func cacheKey(song bootstrap.Song) string {
	return fmt.Sprintf("%s|%d|%d", song.Path, song.Size, song.ModTime)
}

// ensureTranscoded 返回转码后 WAV 的路径（必要时先转码）。
// 同一首歌的并发请求只会真正转码一次。
func (s *Server) ensureTranscoded(ctx context.Context, song bootstrap.Song) (string, error) {
	dir := s.getCacheDir()
	if dir == "" {
		// 没有配置缓存目录就退回系统临时目录
		dir = filepath.Join(os.TempDir(), "MusicPlayer", "transcode")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("创建转码缓存目录失败: %w", err)
	}

	key := cacheKey(song)
	out := filepath.Join(dir, bootstrap.StableID(key, "tc")+".wav")

	s.cacheMu.Lock()
	if item, ok := s.cache[key]; ok {
		if item.inflight {
			done := item.done
			s.cacheMu.Unlock()
			select {
			case <-done:
				// 等前一个转码完成后再查一次
				return s.ensureTranscoded(ctx, song)
			case <-ctx.Done():
				return "", ctx.Err()
			}
		}
		if item.err == nil && item.size > 0 {
			if st, err := os.Stat(item.path); err == nil && st.Size() == item.size {
				item.usedAt = time.Now().UnixMilli()
				s.cacheMu.Unlock()
				return item.path, nil
			}
		}
		// 记录失效，删除后重来
		delete(s.cache, key)
	}

	item := &cacheItem{
		path:     out,
		inflight: true,
		done:     make(chan struct{}),
		usedAt:   time.Now().UnixMilli(),
	}
	s.cache[key] = item
	s.cacheMu.Unlock()

	// 真正转码（不持锁，避免阻塞其他歌曲）
	err := s.transcode(ctx, song, out)
	size := int64(0)
	if err == nil {
		if st, statErr := os.Stat(out); statErr == nil {
			size = st.Size()
		} else {
			err = statErr
		}
	}

	s.cacheMu.Lock()
	item.inflight = false
	item.err = err
	item.size = size
	close(item.done)
	if err != nil {
		delete(s.cache, key)
	}
	s.cacheMu.Unlock()

	if err != nil {
		return "", err
	}
	s.evictIfNeeded()
	return out, nil
}

// transcode 把不能原生播放的格式转成 16bit/44.1kHz/立体声 WAV。
//
// 先写临时文件再改名，避免中断留下半截文件被后续请求当成完整缓存。
func (s *Server) transcode(ctx context.Context, song bootstrap.Song, out string) error {
	s.mu.Lock()
	ff := s.ffmpeg
	s.mu.Unlock()
	if ff == "" {
		return fmt.Errorf("ffmpeg 不可用")
	}

	tmp := out + ".part"
	_ = os.Remove(tmp)

	args := []string{
		"-hide_banner", "-loglevel", "error", "-nostdin", "-y",
		"-i", song.Path,
		"-vn",
		"-acodec", "pcm_s16le",
		"-ar", strconv.Itoa(wavSampleRate),
		"-ac", strconv.Itoa(wavChannels),
		"-f", "wav",
		tmp,
	}
	tctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(tctx, ff, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		_ = os.Remove(tmp)
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		if len(msg) > 300 {
			msg = msg[len(msg)-300:]
		}
		return fmt.Errorf("%v（%s）", err, msg)
	}

	if err := os.Rename(tmp, out); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// evictIfNeeded 超出预算时按最久未使用淘汰（跳过正在转码的条目）
func (s *Server) evictIfNeeded() {
	s.cacheMu.Lock()
	var total int64
	for _, it := range s.cache {
		total += it.size
	}
	if total <= transcodeBudgetBytes {
		s.cacheMu.Unlock()
		return
	}

	type entry struct {
		key    string
		item   *cacheItem
		usedAt int64
	}
	list := make([]entry, 0, len(s.cache))
	for k, it := range s.cache {
		if it.inflight {
			continue
		}
		list = append(list, entry{key: k, item: it, usedAt: it.usedAt})
	}
	// 简单选择排序式淘汰：按使用时间从旧到新删，直到降到预算内
	for i := 0; i < len(list) && total > transcodeBudgetBytes; i++ {
		oldest := i
		for j := i + 1; j < len(list); j++ {
			if list[j].usedAt < list[oldest].usedAt {
				oldest = j
			}
		}
		list[i], list[oldest] = list[oldest], list[i]
		total -= list[i].item.size
		_ = os.Remove(list[i].item.path)
		delete(s.cache, list[i].key)
	}
	s.cacheMu.Unlock()
}

// ClearCache 清空转码缓存（设置界面用）
func (s *Server) ClearCache() error {
	dir := s.getCacheDir()
	s.cacheMu.Lock()
	s.cache = map[string]*cacheItem{}
	s.cacheMu.Unlock()
	if dir == "" {
		return nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".wav") {
			continue
		}
		_ = os.Remove(filepath.Join(dir, e.Name()))
	}
	return nil
}

// CacheStats 返回缓存占用（供设置界面显示）
func (s *Server) CacheStats() (count int, bytes int64) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	for _, it := range s.cache {
		if it.size > 0 {
			count++
			bytes += it.size
		}
	}
	return count, bytes
}

func mimeForExt(ext string) string {
	switch strings.ToLower(strings.TrimPrefix(ext, ".")) {
	case "mp3":
		return "audio/mpeg"
	case "flac":
		return "audio/flac"
	case "wav":
		return "audio/wav"
	case "m4a", "mp4", "alac":
		return "audio/mp4"
	case "aac":
		return "audio/aac"
	case "ogg":
		return "audio/ogg"
	case "opus":
		return "audio/opus"
	default:
		return "application/octet-stream"
	}
}

func orNone(s string) string {
	if s == "" {
		return "未找到"
	}
	return s
}

// ToolsInfo 返回当前解析到的 ffmpeg 信息（供设置界面显示）
func (s *Server) ToolsInfo() map[string]any {
	t := ffmpeg.Resolve()
	count, bytes := s.CacheStats()
	return map[string]any{
		"available":       t.Available(),
		"source":          t.Source,
		"path":            t.FFmpeg,
		"describe":        t.Describe(),
		"cacheCount":      count,
		"cacheBytes":      bytes,
		"cacheDir":        s.getCacheDir(),
		"transcodeBudget": transcodeBudgetBytes,
	}
}
