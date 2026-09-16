// onlineprobe —— 排查在线（B 站）歌曲的封面到底拿到什么。
//
//	go run ./tools/onlineprobe "晴天 周杰伦"
package main

import (
	"bytes"
	"context"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"time"

	"localmusicplayer/internal/bilibili"
	"localmusicplayer/internal/coverfetch"
)

func stats(body []byte) string {
	img, format, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return fmt.Sprintf("%d B 解码失败 %v", len(body), err)
	}
	b := img.Bounds()
	var sum, n, maxV uint64
	for y := b.Min.Y; y < b.Max.Y; y += 4 {
		for x := b.Min.X; x < b.Max.X; x += 4 {
			r, g, bl, _ := img.At(x, y).RGBA()
			lum := (299*uint64(r) + 587*uint64(g) + 114*uint64(bl)) / 1000 >> 8
			sum += lum
			if lum > maxV {
				maxV = lum
			}
			n++
		}
	}
	avg := uint64(0)
	if n > 0 {
		avg = sum / n
	}
	warn := ""
	if avg >= 245 && maxV <= 252 {
		warn = "   <== 纯白！"
	}
	return fmt.Sprintf("%d B %s %dx%d 平均亮度=%d 峰值=%d%s", len(body), format, b.Dx(), b.Dy(), avg, maxV, warn)
}

func main() {
	kw := "晴天 周杰伦"
	if len(os.Args) > 1 {
		kw = os.Args[1]
	}
	client := bilibili.NewClient()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	res, err := client.Search(ctx, kw, 1, 6)
	if err != nil {
		fmt.Println("搜索失败:", err)
		return
	}
	fmt.Printf("关键词 %q 命中 %d 条\n", kw, len(res.Tracks))
	for i, t := range res.Tracks {
		fmt.Printf("\n[%d] %s\n    歌手=%s 专辑=%s 时长=%dms\n    bvid=%s\n    cover=%s\n",
			i, t.Title, t.Artist, t.Album, t.Duration, t.BVID, t.Cover)
		if t.Cover == "" {
			fmt.Println("    封面为空")
			continue
		}
		if !coverfetch.AllowedImageURL(t.Cover) {
			fmt.Println("    !! 封面域名不在白名单里，后端会直接拒绝")
			continue
		}
		dctx, dcancel := context.WithTimeout(context.Background(), 20*time.Second)
		img, derr := coverfetch.Download(dctx, t.Cover)
		dcancel()
		if derr != nil {
			fmt.Println("    下载失败:", derr)
			continue
		}
		fmt.Printf("    -> %s (%s)\n", stats(img.Body), img.ContentType)
	}
}
