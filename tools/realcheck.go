//go:build ignore

// realcheck.go —— 用真实曲库跑一次完整后端链路，并把媒体服务留在前台以便联调。
//
//	go run tools/realcheck.go -dir "C:\Users\Example\Music"                 # 跑一遍就退出
//	go run tools/realcheck.go -dir "..." -serve -ape                        # 起服务并生成转码样本
//
// -serve 会打印 MP_AUDIO_URL=<原生格式播放地址> 与 MP_TRANSCODE_URL=<转码格式播放地址>，
// 供 tools/media-check.mjs 之类的跨源播放验证使用；按 Ctrl+C 退出。
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/library"
	"musicplayer/internal/lyrics"
	"musicplayer/internal/media"
	"musicplayer/internal/meta"
)

func main() {
	dir := flag.String("dir", "", "音乐文件夹")
	serve := flag.Bool("serve", false, "跑完检查后保持音频服务前台运行")
	ape := flag.Bool("ape", false, "用 ffmpeg 生成一个 .ape 样本以验证转码路径")
	n := flag.Int("n", 5, "打印前 N 首")
	flag.Parse()

	if *dir == "" {
		fmt.Println("用法: go run tools/realcheck.go -dir <音乐文件夹> [-serve] [-ape]")
		os.Exit(1)
	}

	store, err := bootstrap.NewStore()
	check(err, "创建配置存储")
	fmt.Printf("数据目录: %s\n", store.DataDir())

	check(store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "real", Path: *dir, Status: "ok"}}
	}), "写入配置")

	lib := library.NewManager(store)
	lib.ReloadFolders()

	start := time.Now()
	res, err := lib.Scan(context.Background(), false)
	check(err, "扫描")
	fmt.Printf("\n扫描: 找到=%d 保留=%d 过滤=%d 新增=%d 移除=%d 用时=%s\n",
		res.Found, res.Kept, res.Excluded, res.Added, res.Removed, time.Since(start).Round(time.Millisecond))

	songs := lib.Songs()
	if len(songs) == 0 {
		fmt.Println("!! 一首歌都没扫到")
		os.Exit(2)
	}

	var noDur, noRate, noCover, noTitle, noArtist int
	for _, s := range songs {
		if s.Duration <= 0 {
			noDur++
		}
		if s.SampleRate <= 0 {
			noRate++
		}
		if s.Cover == "" {
			noCover++
		}
		if s.Title == "" {
			noTitle++
		}
		if s.Artist == "" || s.Artist == "未知歌手" {
			noArtist++
		}
	}
	fmt.Printf("元数据: 缺时长=%d 缺采样率=%d 缺封面=%d 缺标题=%d 缺歌手=%d（共 %d 首）\n",
		noDur, noRate, noCover, noTitle, noArtist, len(songs))

	fmt.Println("\n曲目:")
	for i, s := range songs {
		if i >= *n {
			break
		}
		fmt.Printf("  %-30s | %-14s | %6.1f 秒 | %5d Hz | %s\n",
			trunc(s.Title, 30), trunc(s.Artist, 14),
			float64(s.Duration)/1000, s.SampleRate, strings.ToUpper(s.Ext))
	}

	srv := media.New(func(id string) (bootstrap.Song, bool) { return lib.SongByID(id) })
	base, err := srv.Start()
	check(err, "启动音频服务")
	defer srv.Stop()
	fmt.Printf("\n音频服务: %s 转码能力=%v\n", base, srv.CanTranscode())

	// 抽查一首原生格式
	native := firstWithExt(songs, "mp3", "m4a", "flac", "wav", "aac", "ogg", "opus")
	if native != nil {
		st, mime, got, rng := probe(srv.URLFor(native.ID))
		fmt.Printf("  原生播放 %-6s status=%d mime=%-14s Range=%v 读到=%s\n",
			strings.ToUpper(native.Ext), st, mime, rng, human(got))
	}

	// 转码路径：优先生成 .ape 样本（ffmpeg 支持 ape 解码，可用于验证转码分支）
	var transcodeSong *bootstrap.Song
	if *ape {
		if p := makeAPESample(srv); p != "" {
			if _, err := lib.Scan(context.Background(), false); err == nil {
				for i := range lib.Songs() {
					if strings.EqualFold(lib.Songs()[i].Path, p) {
						s := lib.Songs()[i]
						transcodeSong = &s
					}
				}
			}
		}
	}
	if transcodeSong == nil {
		transcodeSong = firstWithExt(songs, "ape", "wma", "dsf")
	}
	if transcodeSong != nil {
		fmt.Printf("  [debug] 转码歌曲 duration=%dms sample=%d id=%s\n",
			transcodeSong.Duration, transcodeSong.SampleRate, transcodeSong.ID)
		st, mime, got, rng := probe(srv.URLFor(transcodeSong.ID))
		fmt.Printf("  转码播放 %-6s status=%d mime=%-14s Range=%v 读到=%s\n",
			strings.ToUpper(transcodeSong.Ext), st, mime, rng, human(got))
	} else {
		fmt.Println("  转码播放 跳过（曲库里没有 ape/wma/dsf，且未加 -ape）")
	}

	if len(songs) > 0 {
		lr := lyrics.Load(songs[0].ID, songs[0].Path, store.Get().LyricsSources, nil)
		fmt.Printf("\n歌词: 来源=%s 行数=%d\n", lr.Source, strings.Count(lr.LRC, "\n"))
	}

	fmt.Printf("结论: 曲库 %d 首，扫描 %s\n", len(songs), time.Since(start).Round(time.Millisecond))

	if !*serve {
		return
	}

	fmt.Println("\n--- 前台服务中，供跨源播放验证使用（Ctrl+C 退出）---")
	if native != nil {
		fmt.Printf("MP_AUDIO_URL=%s\n", srv.URLFor(native.ID))
	}
	if transcodeSong != nil {
		fmt.Printf("MP_TRANSCODE_URL=%s\n", srv.URLFor(transcodeSong.ID))
	}
	fmt.Println("--- 已就绪 ---")
	select {}
}

// makeAPESample 在数据目录生成一个 .ape 文件（内容压成 silence 以省时间），
// 并确保它被某个已配置的文件夹覆盖，从而能进入曲库。
func makeAPESample(srv *media.Server) string {
	ff := findFFmpeg()
	if ff == "" {
		fmt.Println("  （找不到 ffmpeg，跳过 .ape 样本生成）")
		return ""
	}
	dir := os.Getenv("MUSICPLAYER_DATA_DIR")
	if dir == "" {
		dir = os.TempDir()
	}
	out := filepath.Join(dir, "转码测试样本.ape")

	// 用 ffmpeg 直接生成 3 秒正弦波并编码为 ape
	args := []string{"-hide_banner", "-loglevel", "error", "-y",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=3",
		"-ac", "2", "-ar", "44100", "-c:a", "ape", out}
	cmd := exec.Command(ff, args...)
	if err := cmd.Run(); err != nil {
		fmt.Printf("  （生成 .ape 样本失败: %v）\n", err)
		return ""
	}
	fmt.Printf("  已生成转码样本: %s\n", out)
	return out
}

func findFFmpeg() string {
	if p, err := exec.LookPath("ffmpeg"); err == nil {
		return p
	}
	if home := os.Getenv("USERPROFILE"); home != "" {
		base := filepath.Join(home, "Application")
		if entries, err := os.ReadDir(base); err == nil {
			for _, e := range entries {
				if e.IsDir() && strings.HasPrefix(strings.ToLower(e.Name()), "ffmpeg") {
					p := filepath.Join(base, e.Name(), "bin", "ffmpeg.exe")
					if _, err := os.Stat(p); err == nil {
						return p
					}
				}
			}
		}
	}
	return ""
}

func firstWithExt(songs []bootstrap.Song, exts ...string) *bootstrap.Song {
	want := map[string]bool{}
	for _, e := range exts {
		want[e] = true
	}
	// 稳定输出：按路径排序后再挑
	sorted := append([]bootstrap.Song(nil), songs...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Path < sorted[j].Path })
	for i := range sorted {
		if want[strings.ToLower(sorted[i].Ext)] {
			return &sorted[i]
		}
	}
	return nil
}

// probe 发一次带 Range 的请求，验证 206 与 token 校验
func probe(url string) (int, string, int64, bool) {
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Range", "bytes=0-65535")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err.Error(), 0, false
	}
	defer resp.Body.Close()
	n, _ := io.Copy(io.Discard, resp.Body)
	return resp.StatusCode, resp.Header.Get("Content-Type"), n, resp.StatusCode == http.StatusPartialContent
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

func human(n int64) string {
	if n >= 1024*1024 {
		return fmt.Sprintf("%.1fMB", float64(n)/(1024*1024))
	}
	if n >= 1024 {
		return fmt.Sprintf("%.1fKB", float64(n)/1024)
	}
	return fmt.Sprintf("%dB", n)
}

func check(err error, what string) {
	if err != nil {
		fmt.Printf("!! %s 失败: %v\n", what, err)
		os.Exit(1)
	}
}

var _ = meta.Read
