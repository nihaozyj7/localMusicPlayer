// Package ffmpeg 负责解析可用的 ffmpeg 可执行文件。
//
// 解析优先级：
//  1. 环境变量 MUSICPLAYER_FFMPEG（排查问题或指定自编译版本时用）
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
	once     sync.Once
	resolved Tools
)

// Resolve 解析可用工具（结果缓存，进程内只算一次）
func Resolve() Tools {
	once.Do(func() { resolved = resolve() })
	return resolved
}

// Reset 清空缓存（测试用）
func Reset() {
	once = sync.Once{}
	resolved = Tools{}
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
	if p := strings.TrimSpace(os.Getenv("MUSICPLAYER_FFMPEG")); p != "" {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return Tools{FFmpeg: p, Source: "env"}
		}
		log.Printf("[ffmpeg] MUSICPLAYER_FFMPEG 指向的文件不可用: %s", p)
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
func extractBundled() (string, error) {
	extraction.once.Do(func() {
		data, err := embeddedFFmpeg()
		if err != nil {
			extraction.err = err
			return
		}
		if len(data) == 0 {
			// 开发构建：没有内置，交给系统查找
			return
		}
		path, err := writeCached(data)
		if err != nil {
			extraction.err = err
			return
		}
		extraction.path = path
	})
	return extraction.path, extraction.err
}

// writeCached 按内容哈希落盘：内容没变就直接复用，避免每次启动重写 155MB
func writeCached(data []byte) (string, error) {
	dir, err := cacheDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("创建缓存目录失败: %w", err)
	}

	sum := sha256.Sum256(data)
	short := hex.EncodeToString(sum[:8])
	name := fmt.Sprintf("%s-%s", short, BinaryName())
	target := filepath.Join(dir, name)

	// 已存在且大小一致 → 直接复用
	if st, err := os.Stat(target); err == nil && st.Size() == int64(len(data)) {
		return target, nil
	}

	// 先写临时文件再改名，避免解包中断留下半个可执行文件
	tmp := target + ".tmp"
	if err := os.WriteFile(tmp, data, 0o755); err != nil {
		// 磁盘满/被杀软拦截时给出可执行的降级信息
		return "", fmt.Errorf("写入内置 ffmpeg 失败（%s）: %w", dir, err)
	}
	if err := os.Rename(tmp, target); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("替换内置 ffmpeg 失败: %w", err)
	}
	log.Printf("[ffmpeg] 已解包内置 ffmpeg 到 %s（%d MB）", target, len(data)/(1<<20))
	return target, nil
}

// cacheDir 内置二进制的解包位置
func cacheDir() (string, error) {
	if dir := strings.TrimSpace(os.Getenv("MUSICPLAYER_FFMPEG_DIR")); dir != "" {
		return dir, nil
	}
	if base, err := os.UserCacheDir(); err == nil && base != "" {
		return filepath.Join(base, "MusicPlayer", "bin"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("无法定位缓存目录: %w", err)
	}
	return filepath.Join(home, ".musicplayer", "bin"), nil
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
func Probe(ctx context.Context, ffmpegPath, path string) (ProbeInfo, error) {
	if ffmpegPath == "" {
		return ProbeInfo{}, fmt.Errorf("ffmpeg 不可用")
	}
	cmd := exec.CommandContext(ctx, ffmpegPath,
		"-hide_banner", "-nostdin",
		"-i", path,
		"-vn", "-f", "null", "-",
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
//
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
	cmd := exec.CommandContext(ctx, ffmpegPath,
		"-hide_banner", "-nostdin", "-nostats",
		"-i", path,
		"-vn",
		"-af", "volumedetect",
		"-t", "0",
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
