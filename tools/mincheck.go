//go:build ignore

// mincheck.go —— 用精简版 ffmpeg 验证应用的三条真实调用路径：
//
//	1) 响度测量（loudnorm）
//	2) 转码播放（解码 → wav，媒体服务用）
//	3) 元数据兜底探测（Probe / SoundDurationMS）
//
//	go run tools/mincheck.go "C:\path\to\sample.wma"
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"musicplayer/internal/ffmpeg"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("用法: go run tools/mincheck.go <媒体文件>")
		os.Exit(1)
	}
	path := os.Args[1]

	tools := ffmpeg.Resolve()
	fmt.Printf("ffmpeg: 可用=%v 来源=%s\n", tools.Available(), tools.Describe())
	fmt.Printf("路径  : %s\n\n", tools.FFmpeg)
	if !tools.Available() {
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// 1) 元数据探测（无解析器的容器靠它拿时长）
	fmt.Println("[1] Probe（元数据兜底探测）")
	info, err := ffmpeg.Probe(ctx, tools.FFmpeg, path)
	if err != nil {
		fmt.Printf("    ✗ %v\n", err)
	} else {
		fmt.Printf("    ✓ 时长=%.3fs 采样率=%d 声道=%d 码率=%d codec=%s\n",
			info.DurationSec, info.SampleRate, info.Channels, info.Bitrate, info.Codec)
	}

	// 2) 精确时长（转码长度计算用）
	fmt.Println("[2] SoundDurationMS（精确时长）")
	ms, err := ffmpeg.SoundDurationMS(ctx, tools.FFmpeg, path)
	if err != nil {
		fmt.Printf("    ✗ %v\n", err)
	} else {
		fmt.Printf("    ✓ %.1f ms\n", ms)
	}

	// 3) 转码到 WAV（媒体服务转码缓存的实际做法）
	fmt.Println("[3] 转码为 WAV（16bit/44.1k/立体声）")
	out := os.TempDir() + "/mincheck-out.wav"
	_ = os.Remove(out)
	if err := ffmpeg.TranscodeToWAV(ctx, tools.FFmpeg, path, out); err != nil {
		fmt.Printf("    ✗ %v\n", err)
	} else {
		st, statErr := os.Stat(out)
		if statErr != nil {
			fmt.Printf("    ✗ 产物不存在: %v\n", statErr)
		} else {
			// 校验 WAV 头是否自洽（都是小端 32 位字段，别按单字节读）
			raw, _ := os.ReadFile(out)
			le32 := func(b []byte, off int) uint32 {
				if len(b) < off+4 {
					return 0
				}
				return uint32(b[off]) | uint32(b[off+1])<<8 | uint32(b[off+2])<<16 | uint32(b[off+3])<<24
			}
			if len(raw) < 44 {
				fmt.Printf("    ✗ 产物过短（%d 字节），不是合法 WAV\n", len(raw))
			} else {
				riffSize := le32(raw, 4)
				rate := le32(raw, 24)
				dataSize := le32(raw, 40)
				okLen := int64(dataSize)+44 == st.Size()
				okRiff := int64(riffSize)+8 == st.Size()
				fmt.Printf("    ✓ %d 字节，采样率 %d Hz，data=%d，RIFF=%d\n", st.Size(), rate, dataSize, riffSize)
				fmt.Printf("      长度自洽: data %v / RIFF %v\n",
					map[bool]string{true: "一致", false: "不一致 !!"}[okLen],
					map[bool]string{true: "一致", false: "不一致 !!"}[okRiff])
			}
			_ = os.Remove(out)
		}
	}
}
