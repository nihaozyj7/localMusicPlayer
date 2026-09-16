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
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/ffmpeg"
)

// WAV 输出参数（采样率 / 声道 / 头长度 / 帧长 / 字节率的约定）全部由
// internal/ffmpeg 拥有并导出，见 ffmpeg.WAVHeaderSize 与 TranscodeToWAV。
// 这里曾经把 5 个常量再别名一遍，但没有任何一处引用 —— 转码缓存是「转好落盘
// 后按普通文件提供」，本服务并不需要自己推算 PCM 偏移或 Content-Length。

// transcodeBudgetBytes 转码缓存的总预算。
// 一首 4 分钟的曲子转成 WAV 约 42MB，因此这里按 MB 级别限制，
// 超出后按最久未使用淘汰（正在被读取的条目不会被删）。
const transcodeBudgetBytes = 600 << 20 // 600MB

// Server 本地音频服务
type Server struct {
	token  string
	listen string
	srv    *http.Server
	songs  func(id string) (bootstrap.Song, bool)
	ffmpeg string
	// ffmpegResolved 表示「ffmpeg 已经解析过一次，结论是权威的」。
	// 构造时不再同步解析（会把内置二进制解包压到建窗口之前），所以必须先分清
	// 「还没解析」和「解析过、确实没有」—— 前者要补一次解析，后者直接报不可用。
	ffmpegResolved bool
	mu             sync.Mutex
	running        bool

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
	return &Server{
		token: bootstrap.RandomID("tk"),
		songs: songs,
		// 刻意不在这里同步 Resolve()：内置 ffmpeg 的解包会发生在 main() 建窗口
		// 之前，把首帧拖慢好几秒。启动流程里有后台 goroutine 调 RefreshFFmpeg()
		// （见 main.go 的 ffmpeg prewarm）；在那之前需要 ffmpeg 的路径也会先
		// 看到空值并如实报「不可用」，不会给出错误结果。
		cache: map[string]*cacheItem{},
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
	s.ffmpegResolved = true
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

	s.srv = &http.Server{
		Handler:           s.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	s.running = true
	base := s.listen
	s.mu.Unlock()

	go func() {
		if err := s.srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[media] 服务退出: %v", err)
		}
	}()
	// 不在这里打印 ffmpeg 路径：它现在由后台 prewarm 解析，此处还没就绪，
	// 打印出来只会是「未找到」。真正就绪时 main.go 的 prewarm goroutine 会打一条。
	log.Printf("[media] 独立端口已启动：%s", base)
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

// AudioPrefix 是音频路由前缀。
//
// 重要：音频必须由**页面同源**提供，而不是另开端口。
// 实测（Windows 11 + WebView2 152）跨源加载音频会被 Chromium 直接拦掉：
//
//	MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check
//
// 请求甚至不会出现在网络日志里（在渲染进程内就被拒绝），
// 且这个行为在无头 Edge 里复现不出来。把音频挂到 Wails 自己的
// asset server 上（http://wails.localhost/audio/...）就完全绕开了这一限制，
// 顺带也不再需要 CORS、crossorigin 和 Web Audio 的跨源取数。
const AudioPrefix = "/audio/"

// Handler 返回只处理音频路由的 http.Handler（不含监听端口）。
// 供 Wails 的 asset server 以中间件方式挂载，或由 Start 起独立端口。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(AudioPrefix, s.handleAudio)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		setCORS(w, r)
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}

// URLFor 生成某首歌的播放地址。
//
// sameOriginBase 非空时（打包运行）返回同源地址，形如 /audio/xxx?t=...；
// 为空时（独立端口模式，如 tools/realcheck.go）返回完整 http://127.0.0.1:port 地址。
func (s *Server) URLFor(songID string) string {
	s.mu.Lock()
	base := s.listen
	s.mu.Unlock()
	if base == "" {
		// 未监听端口：给出相对路径，由同源 asset server 提供
		return fmt.Sprintf("%s%s?t=%s", AudioPrefix, songID, s.token)
	}
	return fmt.Sprintf("%s%s%s?t=%s", base, AudioPrefix, songID, s.token)
}

// SameOriginURL 返回相对路径形式（页面同源）的播放地址
func (s *Server) SameOriginURL(songID string) string {
	return fmt.Sprintf("%s%s?t=%s", AudioPrefix, songID, s.token)
}

// ffmpegPath 返回当前可用的 ffmpeg 路径。
//
// 构造 Server 时不再同步解析 ffmpeg（那会把内置二进制的解包压到建窗口之前），
// 所以这里在「后台 prewarm 还没填上」时自己补一次解析，保证调用方拿到的结果
// 与旧实现一致 —— 否则启动最初那一小段时间里转码会误报「ffmpeg 不可用」。
func (s *Server) ffmpegPath() string {
	s.mu.Lock()
	if s.ffmpegResolved {
		ff := s.ffmpeg
		s.mu.Unlock()
		return ff
	}
	s.mu.Unlock()
	ff := ffmpeg.Resolve().FFmpeg
	s.mu.Lock()
	s.ffmpeg = ff
	s.ffmpegResolved = true
	s.mu.Unlock()
	return ff
}

// CanTranscode 是否具备转码能力
func (s *Server) CanTranscode() bool {
	return s.ffmpegPath() != ""
}

/* --------------------------------------------------------------------------
   HTTP 处理
   -------------------------------------------------------------------------- */

// handleAudio 处理播放请求。
//
// CORS 仍然保留：即使现在的默认路径是同源，独立端口模式
// （tools/realcheck.go、外部播放器）下仍可能是跨源访问，
// 且同源请求本来就不受影响。
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
	id := strings.TrimPrefix(r.URL.Path, AudioPrefix)
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
		dir = filepath.Join(os.TempDir(), "LocalMusicPlayer", "transcode")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("创建转码缓存目录失败: %w", err)
	}

	key := cacheKey(song)
	out := filepath.Join(dir, bootstrap.StableID(key, "tc")+".wav")

	// 用循环而不是递归重试：等别人转码完成后再查一次。
	// 递归版本在「同一个文件反复失败 + 并发请求」下会持续加深调用栈。
	for {
		s.cacheMu.Lock()
		if existing, ok := s.cache[key]; ok {
			if existing.inflight {
				done := existing.done
				s.cacheMu.Unlock()
				select {
				case <-done:
					continue // 等前一个转码完成后再查一次
				case <-ctx.Done():
					return "", ctx.Err()
				}
			}
			if existing.err == nil && existing.size > 0 {
				if st, err := os.Stat(existing.path); err == nil && st.Size() == existing.size {
					existing.usedAt = time.Now().UnixMilli()
					s.cacheMu.Unlock()
					return existing.path, nil
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
}

// transcode 把不能原生播放的格式转成 16bit/44.1kHz/立体声 WAV。
// 实现放在 internal/ffmpeg，供本服务与诊断工具共用一套参数。
func (s *Server) transcode(ctx context.Context, song bootstrap.Song, out string) error {
	ff := s.ffmpegPath()
	if ff == "" {
		return fmt.Errorf("ffmpeg 不可用")
	}
	tctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	return ffmpeg.TranscodeToWAV(tctx, ff, song.Path, out)
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
	// 只删**我们自己生成的**转码产物：文件名是 StableID(key,"tc") + ".wav"，
	// 即 "tc_<base36>.wav"。
	//
	// 为什么必须收窄：cacheDir 是用户可配置的（见 ToolsInfo 的 cacheDir），
	// 设置界面里也会展示它。以前这里是「删掉目录下所有 *.wav」——用户一旦把
	// 缓存目录指到音乐目录，「清空转码缓存」就会删掉无关的 WAV 文件，
	// 属于不可恢复的数据丢失，而不只是性能问题。
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".wav") || !strings.HasPrefix(name, "tc_") {
			continue
		}
		_ = os.Remove(filepath.Join(dir, name))
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
