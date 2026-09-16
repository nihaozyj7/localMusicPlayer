// Package ffmpeg 负责解析可用的 ffmpeg 可执行文件。
//
// 解析优先级：
//  1. 环境变量 LMPLAYER_FFMPEG（排查问题或指定自编译版本时用）
//  2. 内置二进制：把编译进 exe 的 ffmpeg 解包到缓存目录后使用
//  3. 系统已安装的 ffmpeg（PATH / 常见安装位置）
//
// 内置二进制只在带 `production` 构建标签时才会被编译进来
// （见 embed_production.go），日常 `go test` / 开发构建不受 155MB 影响。
// 这样打包后的应用不依赖用户机器上是否装了 ffmpeg。
//
// 关于许可：内置的是 GPL 构建版 ffmpeg，其许可证见
// internal/ffmpeg/bin/FFMPEG-LICENSE.txt，分发时请一并保留。
package ffmpeg

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"localmusicplayer/internal/atomicfile"
	"localmusicplayer/internal/executil"
)

// BinaryName 平台相关的可执行文件名
func BinaryName() string {
	if runtime.GOOS == "windows" {
		return "ffmpeg.exe"
	}
	return "ffmpeg"
}

// Tools 可用的外部工具路径
type Tools struct {
	FFmpeg string // 主程序路径，空表示不可用
	Source string // 来源：env | bundled | system
}

// Available 是否可用
func (t Tools) Available() bool { return t.FFmpeg != "" }

// Describe 人类可读的来源说明（用于设置界面/日志）
func (t Tools) Describe() string {
	switch t.Source {
	case "env":
		return "环境变量指定"
	case "bundled":
		return "内置"
	case "system":
		return "系统安装"
	default:
		return "未找到"
	}
}

var (
	ffMu    sync.RWMutex
	ffTools Tools
	ffReady bool
)

// Resolve 解析可用工具（结果缓存，进程内只解析一次）。
//
// 这里刻意**不用 sync.Once**：Reset 需要能被安全地重新触发（内置二进制解包
// 完成后、用户在设置里切换 ffmpeg 路径后都会调用），而给 sync.Once 赋值重置
// 本身就与并发调用构成数据竞争（go test -race 看不出来，因为没跑到）。
// 「双检 + 读写锁」能给出同样的一次性语义，同时让 Reset 也是并发安全的。
func Resolve() Tools {
	ffMu.RLock()
	if ffReady {
		t := ffTools
		ffMu.RUnlock()
		return t
	}
	ffMu.RUnlock()

	ffMu.Lock()
	defer ffMu.Unlock()
	if !ffReady {
		ffTools = resolve()
		ffReady = true
	}
	return ffTools
}

// Reset 清空缓存，让下一次 Resolve 重新解析（解包完成 / 用户改配置后调用）
func Reset() {
	ffMu.Lock()
	ffTools = Tools{}
	ffReady = false
	ffMu.Unlock()
}

// Prewarm 提前把内置二进制解包到磁盘。
// 155MB 的解包需要一两秒，放在启动流程里同步做会拖慢窗口显示，
// 因此在后台 goroutine 里调用它，完成后再 Resolve() 就能拿到路径。
func Prewarm() error {
	if _, err := extractBundled(); err != nil {
		return err
	}
	// 解包成功后清掉缓存，让下次 Resolve 重新计算（此时能找到内置版本）
	Reset()
	return nil
}

func resolve() Tools {
	if p := strings.TrimSpace(os.Getenv("LMPLAYER_FFMPEG")); p != "" {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return Tools{FFmpeg: p, Source: "env"}
		}
		log.Printf("[ffmpeg] LMPLAYER_FFMPEG 指向的文件不可用: %s", p)
	}

	if p, err := extractBundled(); err != nil {
		log.Printf("[ffmpeg] 内置二进制不可用: %v", err)
	} else if p != "" {
		return Tools{FFmpeg: p, Source: "bundled"}
	}

	if p := findSystem(); p != "" {
		return Tools{FFmpeg: p, Source: "system"}
	}
	return Tools{}
}

/* --------------------------------------------------------------------------
   内置二进制解包
   -------------------------------------------------------------------------- */

// extraction 保证同一次运行里只解包一次
var extraction struct {
	once sync.Once
	path string
	err  error
}

// extractBundled 把内置 ffmpeg 写到缓存目录并返回路径。
// 返回空字符串表示这个构建没有内置二进制（开发构建）。
//
// 内置的是 **gzip 压缩**后的二进制（exe 里少放约 3.8MB）。缓存文件名来自
// 压缩数据的摘要，而「缓存能不能直接复用」用 gzip 尾部的 ISIZE（解压后长度）
// 判断 —— 两者都不需要真的解压，所以热启动一次解压都不会发生。
func extractBundled() (string, error) {
	extraction.once.Do(func() {
		key, wantSize, ok := bundledIdentity()
		if !ok {
			// 开发构建：没有内置，交给系统查找
			return
		}

		dir, err := cacheDir()
		if err != nil {
			extraction.err = err
			return
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			extraction.err = fmt.Errorf("创建缓存目录失败: %w", err)
			return
		}
		sum := sha256.Sum256(key)
		target := filepath.Join(dir, fmt.Sprintf("%s-%s", hex.EncodeToString(sum[:8]), BinaryName()))

		// 已经落盘且长度对得上 → 直接复用（连解压都不做）
		if st, err := os.Stat(target); err == nil && st.Size() == wantSize {
			extraction.path = target
			return
		}

		// 只有这时才真的解压
		data, err := embeddedFFmpeg()
		if err != nil {
			extraction.err = err
			return
		}
		if len(data) == 0 {
			return
		}
		path, err := writeCached(target, data)
		if err != nil {
			extraction.err = err
			return
		}
		extraction.path = path
	})
	return extraction.path, extraction.err
}

// writeCached 把解压后的二进制原子地写到 target（唯一临时名 + fsync + 改名）。
func writeCached(target string, data []byte) (string, error) {
	if err := atomicfile.Write(target, data, 0o755); err != nil {
		// 磁盘满/被杀软拦截时给出可执行的降级信息
		return "", fmt.Errorf("写入内置 ffmpeg 失败（%s）: %w", filepath.Dir(target), err)
	}
	log.Printf("[ffmpeg] 已解包内置 ffmpeg 到 %s（%d MB）", target, len(data)/(1<<20))
	return target, nil
}

// cacheDir 内置二进制的解包位置
func cacheDir() (string, error) {
	if dir := strings.TrimSpace(os.Getenv("LMPLAYER_FFMPEG_DIR")); dir != "" {
		return dir, nil
	}
	if base, err := os.UserCacheDir(); err == nil && base != "" {
		return filepath.Join(base, "LocalMusicPlayer", "bin"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("无法定位缓存目录: %w", err)
	}
	return filepath.Join(home, ".localmusicplayer", "bin"), nil
}

/* --------------------------------------------------------------------------
   系统安装的 ffmpeg
   -------------------------------------------------------------------------- */

func findSystem() string {
	if p, err := exec.LookPath("ffmpeg"); err == nil {
		return p
	}
	var candidates []string
	if runtime.GOOS == "windows" {
		candidates = append(candidates,
			`C:\ffmpeg\bin\ffmpeg.exe`,
			`C:\Program Files\ffmpeg\bin\ffmpeg.exe`,
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
		)
		// 常见的手动解压位置：%USERPROFILE%\Application\ffmpeg-*\bin
		if home := os.Getenv("USERPROFILE"); home != "" {
			base := filepath.Join(home, "Application")
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
	} else {
		candidates = append(candidates, "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg")
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

/* --------------------------------------------------------------------------
   ffmpeg 输出解析
   -------------------------------------------------------------------------- */

// ParseLoudnormJSON 从 ffmpeg stderr 里取出 loudnorm 打印的 JSON 对象。
// loudnorm 会把测量结果以 JSON 形式打印在 stderr，前后可能有其它日志。
func ParseLoudnormJSON(stderr string) (string, bool) {
	start := strings.Index(stderr, "{")
	for start >= 0 {
		end := strings.LastIndex(stderr, "}")
		if end > start {
			candidate := stderr[start : end+1]
			if strings.Contains(candidate, "input_i") {
				return candidate, true
			}
		}
		next := strings.Index(stderr[start+1:], "{")
		if next < 0 {
			break
		}
		start = start + 1 + next
	}
	return "", false
}

// ParseDuration 从 ffmpeg stderr 的 "Duration: HH:MM:SS.xx" 里解析秒数
func ParseDuration(stderr string) (float64, bool) {
	const marker = "Duration:"
	idx := strings.Index(stderr, marker)
	if idx < 0 {
		return 0, false
	}
	rest := strings.TrimSpace(stderr[idx+len(marker):])
	if len(rest) < 11 {
		return 0, false
	}
	// 形如 00:03:02.05
	chunk := rest[:11]
	var h, m int
	var s float64
	if _, err := fmt.Sscanf(chunk, "%d:%d:%f", &h, &m, &s); err != nil {
		return 0, false
	}
	total := float64(h)*3600 + float64(m)*60 + s
	if total <= 0 {
		return 0, false
	}
	return total, true
}

// CopyWithLimit 把 r 拷贝到 w，最多 limit 字节（limit<=0 表示不限制）
func CopyWithLimit(w io.Writer, r io.Reader, limit int64) (int64, error) {
	buf := make([]byte, 64*1024)
	var total int64
	for {
		if limit > 0 && total >= limit {
			return total, nil
		}
		size := int64(len(buf))
		if limit > 0 && limit-total < size {
			size = limit - total
		}
		n, err := r.Read(buf[:size])
		if n > 0 {
			if _, werr := w.Write(buf[:n]); werr != nil {
				return total, werr
			}
			total += int64(n)
		}
		if err != nil {
			if err == io.EOF {
				return total, nil
			}
			return total, err
		}
	}
}

/* --------------------------------------------------------------------------
   用 ffmpeg 探测媒体信息
   --------------------------------------------------------------------------
   用于 meta 包没有手写解析器的容器（wma/ape/dsf/ogg/mka…）。
   走 `-f null -` 只解码不输出，因此不会产生磁盘写入；
   加上 -t 0 可以在多数情况下提前结束，避免为拿时长而解码整首歌。
   -------------------------------------------------------------------------- */

// ProbeInfo 一次探测得到的信息
type ProbeInfo struct {
	DurationSec float64
	SampleRate  int
	Channels    int
	Bitrate     int
	Codec       string
}

// Available 报告是否具备探测能力
func (t Tools) CanProbe() bool { return t.FFmpeg != "" }

// Probe 探测媒体文件。ctx 控制超时，建议给 5~10 秒。
//
// 注意 -vn 与 -c:a：m4a 里的内嵌封面是视频流，不禁掉会去选视频编码器；
// 而 null 复用器仍需要一个音频编码器，精简构建（只保留 pcm_s16le/flac）
// 必须显式指定，否则报 "Error selecting an encoder"。
func Probe(ctx context.Context, ffmpegPath, path string) (ProbeInfo, error) {
	if ffmpegPath == "" {
		return ProbeInfo{}, fmt.Errorf("ffmpeg 不可用")
	}
	// 用 executil：Windows 下 ffmpeg 是控制台程序，直接 exec 会闪出命令行窗口
	cmd := executil.CommandContext(ctx, ffmpegPath,
		"-hide_banner", "-nostdin",
		"-i", path,
		// -t 0：只读容器头、不解码音频。探测只需要 stderr 里的元信息，
		// 少了这个参数就会把整首歌解码到 null —— 耗时与曲目长度成正比，
		// 而批量扫描（library.enrichDurations）一次要探最多 48 个文件。
		"-t", "0",
		"-vn", "-map", "0:a",
		"-c:a", "pcm_s16le",
		"-f", "null", "-",
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = nil

	// 只关心 stderr 里的元信息，退出码不重要（-f null 正常返回 0）
	_ = cmd.Run()
	out := stderr.String()

	info := ProbeInfo{}
	if d, ok := ParseDuration(out); ok {
		info.DurationSec = d
	}
	info.Codec, info.SampleRate, info.Channels, info.Bitrate = parseStreamLine(out)
	if info.DurationSec == 0 {
		return info, fmt.Errorf("未能从 ffmpeg 输出解析出时长")
	}
	return info, nil
}

// SoundDurationMS 用 ffmpeg 求出**实际可解码**音频的精确时长（毫秒，含小数）。
// 为什么需要它：曲库里的时长是毫秒整数，而转码输出成 WAV 后必须给出准确字节数，
// 否则浏览器会一直等缺失的尾巴（表现为 loadedmetadata 永不触发、播放卡死）。
// ffmpeg 解码出的样本数受最后一块填充影响，与「毫秒 × 采样率」并不相等
// —— 实测一首 3 秒的 m4a 差 47ms，足以让 Chrome 挂住。
//
// 这里加 -t 0（配合 -f null）让 ffmpeg 在拿到流信息后立刻结束，
// 通常只要几十毫秒，不会真的解码整首歌。
func SoundDurationMS(ctx context.Context, ffmpegPath, path string) (float64, error) {
	if ffmpegPath == "" {
		return 0, fmt.Errorf("ffmpeg 不可用")
	}
	cmd := executil.CommandContext(ctx, ffmpegPath,
		"-hide_banner", "-nostdin", "-nostats",
		"-i", path,
		"-vn", "-map", "0:a",
		"-af", "volumedetect",
		"-t", "0",
		"-c:a", "pcm_s16le",
		"-f", "null", "-",
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	_ = cmd.Run()

	if d, ok := ParseDuration(stderr.String()); ok {
		return d * 1000, nil
	}
	return 0, fmt.Errorf("未能解析出时长")
}

/* --------------------------------------------------------------------------
   转码
   -------------------------------------------------------------------------- */

// 转码输出参数：16bit / 44.1kHz / 立体声 PCM
const (
	WAVSampleRate  = 44100
	WAVChannels    = 2
	WAVFrameSize   = WAVChannels * 16 / 8 // 一帧 = 声道数 × 位深/8
	WAVBytesPerSec = WAVSampleRate * WAVFrameSize
)

// TranscodeToWAV 把任意受支持的音频转成标准 WAV 落盘。
//
// 做法分两步，不要合并成 ffmpeg 直接输出 .wav：
//
//  1. ffmpeg 只输出**裸 PCM**（-f s16le）到 .pcm
//  2. Go 侧补一个 44 字节标准 WAV 头，再改名到 out
//
// 为什么不用 ffmpeg 的 wav 复用器：它会插入 LIST/INFO 元数据块，
// 于是 data 块不在偏移 40，而是往后挪（实测在 70）。这样文件头长度
// 就不再固定，任何"按 44 字节头推算 PCM 偏移"的代码（媒体服务算
// Content-Length、做 Range seek）全部会算错。
// 自己写头可以让「头长度 = 44、data 长度 = 文件大小 - 44」成为硬保证。
//
// 参数里的 -vn -map 0:a 也是必需的：m4a 的内嵌封面是视频流，
// 而精简构建关掉了所有视频编码器，不禁掉会报 "Error selecting an encoder"。
func TranscodeToWAV(ctx context.Context, ffmpegPath, src, out string) error {
	if ffmpegPath == "" {
		return fmt.Errorf("ffmpeg 不可用")
	}
	tmpPCM := out + ".pcm"
	_ = os.Remove(tmpPCM)

	cmd := executil.CommandContext(ctx, ffmpegPath,
		"-hide_banner", "-loglevel", "error", "-nostdin", "-y",
		"-i", src,
		"-vn", "-map", "0:a",
		"-acodec", "pcm_s16le",
		"-ar", strconv.Itoa(WAVSampleRate),
		"-ac", strconv.Itoa(WAVChannels),
		"-f", "s16le",
		tmpPCM,
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		_ = os.Remove(tmpPCM)
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("转码失败: %v（%s）", err, tailStr(msg, 300))
	}

	st, err := os.Stat(tmpPCM)
	if err != nil {
		_ = os.Remove(tmpPCM)
		return err
	}

	if err := writeWAV(tmpPCM, out, st.Size()); err != nil {
		_ = os.Remove(tmpPCM)
		return err
	}
	_ = os.Remove(tmpPCM)
	return nil
}

// writeWAV 把裸 PCM 文件包装成标准 44 字节头的 WAV。
// 全程流式拷贝，不会把整首歌读进内存。
func writeWAV(pcmPath, out string, dataBytes int64) error {
	src, err := os.Open(pcmPath)
	if err != nil {
		return err
	}
	defer src.Close()

	tmp := out + ".part"
	dst, err := os.Create(tmp)
	if err != nil {
		return err
	}

	if _, err := dst.Write(wavHeader(dataBytes)); err != nil {
		_ = dst.Close()
		_ = os.Remove(tmp)
		return err
	}
	if _, err := CopyWithLimit(dst, src, 0); err != nil {
		_ = dst.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, out)
}

// WAVHeaderSize 标准 WAV 头长度。转码产物保证是这个值，
// media 包据此推算 PCM 偏移与 Content-Length。
const WAVHeaderSize = 44

// wavHeader 生成 44 字节的 WAV 头（16bit PCM）
func wavHeader(dataBytes int64) []byte {
	h := make([]byte, 0, WAVHeaderSize)
	put32 := func(v uint32) { h = append(h, byte(v), byte(v>>8), byte(v>>16), byte(v>>24)) }
	put16 := func(v uint16) { h = append(h, byte(v), byte(v>>8)) }

	h = append(h, []byte("RIFF")...)
	put32(uint32(36 + dataBytes))
	h = append(h, []byte("WAVEfmt ")...)
	put32(16)                     // fmt 块长度
	put16(1)                      // PCM
	put16(uint16(WAVChannels))    // 声道数
	put32(uint32(WAVSampleRate))  // 采样率
	put32(uint32(WAVBytesPerSec)) // 字节率
	put16(uint16(WAVFrameSize))   // 块对齐
	put16(16)                     // 位深
	h = append(h, []byte("data")...)
	put32(uint32(dataBytes))
	return h
}

// tailStr 取字符串尾部若干字符（错误信息通常在后面）
func tailStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}

// parseStreamLine 解析形如下面的流信息行：
//
//	Stream #0:0: Audio: wmav2 (a[1][0][0] / 0x0161), 44100 Hz, stereo, fltp, 128 kb/s
func parseStreamLine(out string) (codec string, sampleRate, channels, bitrate int) {
	for _, line := range strings.Split(out, "\n") {
		idx := strings.Index(line, "Stream #")
		if idx < 0 || !strings.Contains(line, "Audio:") {
			continue
		}
		rest := line[strings.Index(line, "Audio:")+len("Audio:"):]

		// codec 名字在 Audio: 之后、逗号之前
		codec = strings.TrimSpace(strings.SplitN(rest, ",", 2)[0])
		if i := strings.Index(codec, "("); i > 0 {
			codec = strings.TrimSpace(codec[:i])
		}

		fields := strings.Split(rest, ",")
		for _, f := range fields {
			f = strings.TrimSpace(f)
			if sampleRate == 0 && strings.HasSuffix(f, "Hz") {
				if v, err := strconv.Atoi(strings.TrimSpace(strings.TrimSuffix(f, "Hz"))); err == nil {
					sampleRate = v
				}
				continue
			}
			lower := strings.ToLower(f)
			if channels == 0 {
				switch {
				case strings.HasPrefix(lower, "mono"):
					channels = 1
				case strings.HasPrefix(lower, "stereo"):
					channels = 2
				case strings.Contains(lower, "channels"):
					if v, err := strconv.Atoi(strings.Fields(f)[0]); err == nil {
						channels = v
					}
				}
			}
			if bitrate == 0 && strings.Contains(lower, "kb/s") {
				if v, err := strconv.Atoi(strings.Fields(f)[0]); err == nil {
					bitrate = v * 1000
				}
			}
		}
		return codec, sampleRate, channels, bitrate
	}
	return "", 0, 0, 0
}
