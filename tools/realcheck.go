//go:build ignore

// realcheck.go —— 用真实曲库跑一次完整后端链路，人工验证用：
//
//	$env:MUSICPLAYER_DATA_DIR="$env:TEMP\mp-realcheck"
//	go run tools/realcheck.go "C:\Users\Example\Music"
//
// 它会：写入配置 → 全量扫描 → 打印统计与若干首元数据 →
// 启动音频服务 → 用 HTTP 请求验证原生播放与转码两条路径 → 打印结论。
// 这个文件带 ignore 构建标签，不参与正常构建。
package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/library"
	"musicplayer/internal/lyrics"
	"musicplayer/internal/media"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("用法: go run tools/realcheck.go <音乐文件夹>")
		os.Exit(1)
	}
	folder := os.Args[1]

	store, err := bootstrap.NewStore()
	check(err, "创建配置存储")
	fmt.Printf("数据目录: %s\n", store.DataDir())

	// 只保留这一个文件夹
	check(store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "real", Path: folder, Status: "ok"}}
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

	// 元数据质量
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

	fmt.Println("\n前 5 首:")
	for i, s := range songs {
		if i >= 5 {
			break
		}
		fmt.Printf("  %-28s | %-14s | %6.1f 秒 | %5d Hz | %s | 封面 %dKB\n",
			trunc(s.Title, 28), trunc(s.Artist, 14),
			float64(s.Duration)/1000, s.SampleRate, strings.ToUpper(s.Ext), len(s.Cover)/1024)
	}

	// 音频服务
	srv := media.New(func(id string) (bootstrap.Song, bool) { return lib.SongByID(id) })
	base, err := srv.Start()
	check(err, "启动音频服务")
	defer srv.Stop()
	fmt.Printf("\n音频服务: %s 转码能力=%v\n", base, srv.CanTranscode())

	// 原生播放 + 转码 两条路径都实测一次
	for _, s := range songs {
		url := srv.URLFor(s.ID)
		status, mime, got, rangeOK := probe(url, srv.Token())
		fmt.Printf("  播放探测 %-10s %-22s status=%d mime=%-24s Range=%v 读到=%s\n",
			strings.ToUpper(s.Ext), trunc(s.Title, 22), status, mime, rangeOK, human(got))
	}

	// 歌词
	if len(songs) > 0 {
		lr := lyrics.Load(songs[0].Path, store.Get().LyricsSources)
		fmt.Printf("\n歌词: 来源=%s 行数=%d\n", lr.Source, strings.Count(lr.LRC, "\n"))
	}

	// 文件夹监听
	w, err := library.NewWatcher(lib)
	if err == nil {
		if err := w.Start([]string{folder}); err == nil {
			fmt.Println("文件夹监听: 已启动")
			time.Sleep(300 * time.Millisecond)
		}
		w.Stop()
	} else {
		fmt.Printf("文件夹监听: 不可用 (%v)\n", err)
	}

	fmt.Printf("\n全部结论: 曲库 %d 首，扫描 %s\n", len(songs), time.Since(start).Round(time.Millisecond))
}

// probe 发一次带 Range 的请求，同时验证 206 与 token 校验
func probe(url, token string) (int, string, int64, bool) {
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Basic "+basic(token))
	req.Header.Set("Range", "bytes=0-65535")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err.Error(), 0, false
	}
	defer resp.Body.Close()
	n, _ := io.Copy(io.Discard, resp.Body)
	return resp.StatusCode, resp.Header.Get("Content-Type"), n, resp.StatusCode == http.StatusPartialContent
}

func basic(token string) string {
	const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	src := []byte(token)
	var b strings.Builder
	for i := 0; i < len(src); i += 3 {
		var chunk [3]byte
		n := copy(chunk[:], src[i:])
		b.WriteByte(table[chunk[0]>>2])
		b.WriteByte(table[(chunk[0]&0x03)<<4|chunk[1]>>4])
		if n > 1 {
			b.WriteByte(table[(chunk[1]&0x0F)<<2|chunk[2]>>6])
		} else {
			b.WriteByte('=')
		}
		if n > 2 {
			b.WriteByte(table[chunk[2]&0x3F])
		} else {
			b.WriteByte('=')
		}
	}
	return b.String()
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

func human(n int64) string {
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
