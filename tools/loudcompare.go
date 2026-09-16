//go:build ignore

// loudcompare.go —— 用真歌对比「纯 Go BS.1770」与「ffmpeg loudnorm」的结果。
//
//	go run tools/loudcompare.go "D:\Music" 8
//
// 这是纯 Go 实现能不能替代 ffmpeg 做测量的关键验证：两者测同一批文件，
// 整合响度与真峰值的差异应当很小（EBU R128 允差通常在 ±0.1 LU 量级）。
package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/ffmpeg"
	"musicplayer/internal/library"
	"musicplayer/internal/loudness"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("用法: go run tools/loudcompare.go <音乐文件夹> [比几首]")
		os.Exit(1)
	}
	dir := os.Args[1]
	limit := 8
	if len(os.Args) > 2 {
		if v, err := strconv.Atoi(os.Args[2]); err == nil && v > 0 {
			limit = v
		}
	}

	tools := ffmpeg.Resolve()
	if !tools.Available() {
		fmt.Println("需要 ffmpeg 作为参照")
		os.Exit(1)
	}
	fmt.Printf("参照实现: %s\n\n", tools.Describe())

	tmp, err := os.MkdirTemp("", "loudcompare-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(tmp)
	os.Setenv("MUSICPLAYER_DATA_DIR", tmp)

	store, _ := bootstrap.NewStore()
	_ = store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "lc", Path: dir, Status: "ok"}}
	})
	lib := library.NewManager(store)
	lib.ReloadFolders()
	if _, err := lib.Scan(context.Background(), false); err != nil {
		panic(err)
	}
	songs := lib.Songs()
	if len(songs) == 0 {
		fmt.Println("没有扫到歌曲")
		os.Exit(1)
	}
	if limit > len(songs) {
		limit = len(songs)
	}

	fmt.Printf("%-26s %10s %10s %8s | %9s %9s %8s\n",
		"曲目", "Go LUFS", "ffmpeg", "Δ LU", "Go TP", "ffmpeg TP", "Δ dB")
	fmt.Println(strings.Repeat("-", 100))

	var maxLU, maxTP float64
	var sumLU, sumTP float64
	n := 0

	for i := 0; i < limit; i++ {
		song := songs[i]

		goI, goTP, err := measureWithGo(tools.FFmpeg, song.Path)
		if err != nil {
			fmt.Printf("%-26s  Go 侧失败: %v\n", trunc(song.Title, 26), err)
			continue
		}
		ffI, ffTP, err := measureWithFFmpeg(tools.FFmpeg, song.Path)
		if err != nil {
			fmt.Printf("%-26s  ffmpeg 侧失败: %v\n", trunc(song.Title, 26), err)
			continue
		}

		dLU := goI - ffI
		dTP := goTP - ffTP
		sumLU += math.Abs(dLU)
		sumTP += math.Abs(dTP)
		if math.Abs(dLU) > maxLU {
			maxLU = math.Abs(dLU)
		}
		if math.Abs(dTP) > maxTP {
			maxTP = math.Abs(dTP)
		}
		n++

		fmt.Printf("%-26s %10.2f %10.2f %8.2f | %9.2f %9.2f %8.2f\n",
			trunc(song.Title, 26), goI, ffI, dLU, goTP, ffTP, dTP)
	}

	if n == 0 {
		fmt.Println("没有可比对的样本")
		os.Exit(2)
	}

	fmt.Println(strings.Repeat("-", 100))
	fmt.Printf("对比 %d 首：整合响度平均偏差 %.3f LU，最大 %.3f LU；真峰值平均偏差 %.3f dB，最大 %.3f dB\n",
		n, sumLU/float64(n), maxLU, sumTP/float64(n), maxTP)
	fmt.Println()
	if maxLU <= 0.2 && maxTP <= 0.3 {
		fmt.Println("结论：纯 Go 实现与 ffmpeg 一致（EBU R128 允差内），可以替代 ffmpeg 做响度测量")
	} else {
		fmt.Println("结论：偏差偏大，需要检查实现（门限/真峰值/重采样）")
	}
}

// measureWithGo 用 ffmpeg 只做「解码」，响度由纯 Go 计算。
// 这样对比的是响度算法本身，而不是解码差异。
func measureWithGo(ffmpegPath, path string) (lufs, tp float64, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// 解码成 48kHz 立体声 float32（便于与 BS.1770 的 48k 系数直接对应）
	cmd := exec.CommandContext(ctx, ffmpegPath,
		"-hide_banner", "-loglevel", "error", "-nostdin",
		"-i", path,
		"-vn", "-f", "f32le", "-acodec", "pcm_f32le",
		"-ac", "2", "-ar", "48000", "-",
	)
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return 0, 0, fmt.Errorf("%v: %s", err, strings.TrimSpace(errBuf.String()))
	}

	raw := out.Bytes()
	n := len(raw) / 4 / 2 // 每帧 2 声道 × 4 字节
	if n == 0 {
		return 0, 0, fmt.Errorf("解码结果为空")
	}
	left := make([]float64, n)
	right := make([]float64, n)
	for i := 0; i < n; i++ {
		left[i] = float64(math.Float32frombits(binary.LittleEndian.Uint32(raw[i*8:])))
		right[i] = float64(math.Float32frombits(binary.LittleEndian.Uint32(raw[i*8+4:])))
	}
	channels := [][]float64{left, right}
	return loudness.IntegratedLUFS(channels, 48000), loudness.TruePeakDBTP(channels, 48000), nil
}

// measureWithFFmpeg 用 loudnorm 滤镜测（作为参照）
func measureWithFFmpeg(ffmpegPath, path string) (lufs, tp float64, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, ffmpegPath,
		"-hide_banner", "-nostdin",
		"-i", path,
		"-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
		"-f", "null", "-",
	)
	var errBuf bytes.Buffer
	cmd.Stderr = &errBuf
	_ = cmd.Run()

	raw, ok := ffmpeg.ParseLoudnormJSON(errBuf.String())
	if !ok {
		return 0, 0, fmt.Errorf("未解析出 loudnorm 结果")
	}
	var v struct {
		InputI  string `json:"input_i"`
		InputTP string `json:"input_tp"`
	}
	if err := jsonUnmarshalImpl(raw, &v); err != nil {
		return 0, 0, err
	}
	i, err1 := strconv.ParseFloat(v.InputI, 64)
	t, err2 := strconv.ParseFloat(v.InputTP, 64)
	if err1 != nil || err2 != nil {
		return 0, 0, fmt.Errorf("数值解析失败: %q %q", v.InputI, v.InputTP)
	}
	return i, t, nil
}

func jsonUnmarshalImpl(raw string, v any) error {
	return json.Unmarshal([]byte(raw), v)
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}
