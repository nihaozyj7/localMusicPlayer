//go:build ignore

// urlcheck.go —— 直接调用服务层，打印每首歌真实拿到的播放地址。
//
//	go run tools/urlcheck.go
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/library"
	"musicplayer/internal/media"
)

func main() {
	store, err := bootstrap.NewStore()
	if err != nil {
		panic(err)
	}
	lib := library.NewManager(store)
	lib.ReloadFolders()
	if _, err := lib.Scan(context.Background(), false); err != nil {
		panic(err)
	}
	songs := lib.Songs()
	fmt.Printf("曲库 %d 首\n\n", len(songs))

	srv := media.New(func(id string) (bootstrap.Song, bool) { return lib.SongByID(id) })
	srv.SetCacheDir(os.TempDir() + "/mp-urlcheck")
	base, err := srv.Start()
	if err != nil {
		panic(err)
	}
	defer srv.Stop()
	fmt.Printf("服务地址: %s\n\n", base)

	// 逐个验证 URL 与实际 HTTP 响应
	check := func(song bootstrap.Song) {
		url := srv.URLFor(song.ID)
		fmt.Printf("%-34s ext=%-4s\n  url=%s\n", trunc(song.Title, 34), song.Ext, url)

		req, _ := http.NewRequest(http.MethodGet, url, nil)
		req.Header.Set("Origin", "http://wails.localhost")
		req.Header.Set("Range", "bytes=0-1023")
		client := &http.Client{Timeout: 30 * time.Second}
		res, err := client.Do(req)
		if err != nil {
			fmt.Printf("  !! 请求失败: %v\n", err)
			return
		}
		defer res.Body.Close()
		buf := make([]byte, 1024)
		n, _ := res.Body.Read(buf)
		fmt.Printf("  status=%d mime=%s contentRange=%q allowOrigin=%q 读到=%dB\n",
			res.StatusCode, res.Header.Get("Content-Type"),
			res.Header.Get("Content-Range"), res.Header.Get("Access-Control-Allow-Origin"), n)
		if n >= 12 {
			fmt.Printf("  前12字节: % X\n", buf[:12])
		}
	}

	// 每种扩展名各看一首
	seen := map[string]bool{}
	for _, song := range songs {
		if seen[song.Ext] {
			continue
		}
		seen[song.Ext] = true
		check(song)
		fmt.Println()
		// 只看前 2 种扩展名，够定位问题
		if len(seen) >= 2 {
			break
		}
	}
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}
