// Package media 提供音频给 WebView 播放的本地 HTTP 服务。
//
// 为什么需要它：
//   - 打包后前端运行在 Wails 的虚拟主机 http://wails.localhost 上，
//     无法直接读取任意本地路径（会被当成 file:// 跨源请求拦截）；
//   - ape/wma 等格式 WebView2 无法解码，需要 ffmpeg 流式转码。
//
// 安全：只监听 127.0.0.1，随机端口 + 每次启动随机 token，
// 只允许访问曲库中登记过的文件，杜绝任意路径读取。
package media

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
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
)

// Server 本地音频服务
type Server struct {
	token   string
	listen  string
	srv     *http.Server
	songs   func(id string) (bootstrap.Song, bool)
	ffmpeg  string
	mu      sync.Mutex
	running bool
}

// New 创建服务；songs 用于按 id 反查歌曲（避免暴露任意路径）
func New(songs func(id string) (bootstrap.Song, bool)) *Server {
	token := bootstrap.RandomID("tk")
	return &Server{
		token:  token,
		songs:  songs,
		ffmpeg: findFFmpeg(),
	}
}

// Start 启动监听，返回可访问的基线地址（形如 http://127.0.0.1:52341）
func (s *Server) Start() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return s.listen, nil
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", fmt.Errorf("音频服务监听失败: %w", err)
	}
	s.listen = "http://" + ln.Addr().String()

	mux := http.NewServeMux()
	mux.HandleFunc("/audio/", s.handleAudio)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok"))
	})

	s.srv = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	s.running = true
	go func() {
		if err := s.srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[media] 服务退出: %v", err)
		}
	}()
	log.Printf("[media] 音频服务已启动：%s（ffmpeg: %s）", s.listen, orNone(s.ffmpeg))
	return s.listen, nil
}

// Stop 关闭服务
func (s *Server) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.srv != nil {
		_ = s.srv.Close()
	}
	s.running = false
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
func (s *Server) CanTranscode() bool { return s.ffmpeg != "" }

/* --------------------------------------------------------------------------
   HTTP 处理
   -------------------------------------------------------------------------- */

func (s *Server) handleAudio(w http.ResponseWriter, r *http.Request) {
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

	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "no-store")

	if !bootstrap.NeedsTranscode(song.Ext) {
		serveNative(w, r, song)
		return
	}

	if s.ffmpeg == "" {
		http.Error(w, "该格式需要 ffmpeg 转码，但系统未安装 ffmpeg", http.StatusNotImplemented)
		return
	}
	s.serveTranscoded(w, r, song)
}

// serveNative 原生可解码格式：交给 http.ServeContent 处理 Range / Seek
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
	// ServeContent 会依据 Range 头返回 206，从而支持前端 seek
	http.ServeContent(w, r, filepath.Base(song.Path), st.ModTime(), f)
}

// serveTranscoded 用 ffmpeg 转成 WAV(PCM) 流。
// 若浏览器请求了 Range，则用 -ss 从对应时间点开始转码，seek 精度约 0.1s。
func (s *Server) serveTranscoded(w http.ResponseWriter, r *http.Request, song bootstrap.Song) {
	startSec := 0.0
	if rng := r.Header.Get("Range"); rng != "" {
		if from, ok := parseRangeStart(rng); ok {
			// WAV 44 字节头 + 176400 字节/秒（44.1k * 2ch * 16bit）
			startSec = float64(from) / 176400.0
		}
	}

	args := []string{"-hide_banner", "-loglevel", "error", "-nostdin"}
	if startSec > 0 {
		args = append(args, "-ss", strconv.FormatFloat(startSec, 'f', 3, 64))
	}
	args = append(args, "-i", song.Path, "-vn", "-f", "wav", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2", "pipe:1")

	cmd := exec.CommandContext(r.Context(), s.ffmpeg, args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		http.Error(w, "transcode pipe failed", http.StatusInternalServerError)
		return
	}
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		http.Error(w, "transcode start failed", http.StatusInternalServerError)
		return
	}
	defer func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	}()

	// 转码流长度未知，返回 200 全量流；前端拖动进度条时按新请求处理
	w.Header().Set("Content-Type", "audio/wav")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = copyStream(w, stdout)
}

// parseRangeStart 解析 "bytes=START-" 中的 START
func parseRangeStart(header string) (int64, bool) {
	header = strings.TrimPrefix(header, "bytes=")
	start := strings.SplitN(header, "-", 2)[0]
	if start == "" {
		return 0, false
	}
	n, err := strconv.ParseInt(start, 10, 64)
	if err != nil || n < 0 {
		return 0, false
	}
	return n, true
}

func copyStream(w http.ResponseWriter, body io.Reader) (int64, error) {
	buf := make([]byte, 64*1024)
	var total int64
	for {
		n, err := body.Read(buf)
		if n > 0 {
			if _, werr := w.Write(buf[:n]); werr != nil {
				return total, werr
			}
			total += int64(n)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return total, nil
			}
			return total, err
		}
	}
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

/* --------------------------------------------------------------------------
   ffmpeg 探测
   -------------------------------------------------------------------------- */

func findFFmpeg() string {
	if p, err := exec.LookPath("ffmpeg"); err == nil {
		return p
	}
	candidates := []string{
		`C:\ffmpeg\bin\ffmpeg.exe`,
		`C:\Program Files\ffmpeg\bin\ffmpeg.exe`,
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
	}
	// 扫描 Application 目录下的 ffmpeg-* 发行包（本项目开发机上的常见位置）
	if app := os.Getenv("USERPROFILE"); app != "" {
		base := filepath.Join(app, "Application")
		if entries, err := os.ReadDir(base); err == nil {
			for _, e := range entries {
				if e.IsDir() && strings.HasPrefix(strings.ToLower(e.Name()), "ffmpeg") {
					candidates = append(candidates,
						filepath.Join(base, e.Name(), "bin", "ffmpeg.exe"),
						filepath.Join(base, e.Name(), "ffmpeg.exe"),
					)
				}
			}
		}
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

// BasicAuthHeader 供调试使用
func (s *Server) BasicAuthHeader() string {
	return "Bearer " + base64.StdEncoding.EncodeToString([]byte(s.token))
}
