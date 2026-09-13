// coverprobe —— 联网封面体检工具。
//
// 排查「封面永远是白的」这类问题时用：
//   - 列出所有来源的候选，并把每张图真的下载下来；
//   - 解码后统计尺寸与平均亮度，**纯白占位图会被直接点名**；
//   - 再跑一遍 coverfetch.ResolveAll（服务层实际走的路径），
//     看最终会选中哪一张、哪些候选被丢弃以及原因。
//
// 用法：
//
//	go run ./tools/coverprobe "晴天" "周杰伦" "叶惠美"
//	go run ./tools/coverprobe "夜曲"          # 歌手/专辑留空
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"musicplayer/internal/coverfetch"
)

func main() {
	args := os.Args[1:]
	title, artist, album := "晴天", "周杰伦", "叶惠美"
	if len(args) > 0 {
		title = args[0]
	}
	if len(args) > 1 {
		artist = args[1]
	}
	if len(args) > 2 {
		album = args[2]
	}

	req := coverfetch.Request{Title: title, Artist: artist, Album: album, Duration: 269000}
	fmt.Printf("查询: %q / %q / %q\n", title, artist, album)

	agg := coverfetch.New()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	all, err := agg.FindAll(ctx, req)
	if err != nil {
		fmt.Println("FindAll:", err)
	}
	fmt.Printf("\n候选 %d 张（未校验，只按可信度排序）：\n", len(all))
	for i, c := range all {
		if i >= 10 {
			fmt.Println("  …")
			break
		}
		fmt.Printf("  [%d] %-12s score=%-4d %s\n", i, c.Provider, c.Score, c.URL)
	}

	fmt.Println("\nResolveAll（服务层实际路径：下载 + 体检）：")
	good, skipped, err := agg.ResolveAll(ctx, req)
	if err != nil {
		fmt.Println("  ResolveAll:", err)
	}
	for i, r := range good {
		fmt.Printf("  ✔ [%d] %-12s score=%-4d %s  %s  %dB\n",
			i, r.Provider, r.Score, r.Info.Describe(), r.MIME, len(r.Image.Body))
	}
	for i, sk := range skipped {
		if i >= 8 {
			fmt.Println("  …")
			break
		}
		fmt.Printf("  ✘ %-12s %s\n      原因: %s\n", sk.Cover.Provider, sk.Cover.URL, sk.Reason)
	}
	if len(good) == 0 && len(skipped) == 0 {
		fmt.Println("  （没有任何候选）")
	}
}
