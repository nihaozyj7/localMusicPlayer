//go:build ignore

// loudcheck.go —— 用真实曲库跑一遍响度测量与补偿计算，人工验收用。
//
//	go run tools/loudcheck.go "C:\Users\Example\Music" 6
//
// 第二个参数是最多测几首（默认 5）。会打印每首的 LUFS、真峰值与补偿增益，
// 并把增益差异（最响与最轻之差）算出来 —— 这个差值就是「响度均衡」能抹平的幅度。
package main

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strconv"
	"time"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/ffmpeg"
	"musicplayer/internal/library"
	"musicplayer/internal/loudness"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("用法: go run tools/loudcheck.go <音乐文件夹> [测几首]")
		os.Exit(1)
	}
	dir := os.Args[1]
	limit := 5
	if len(os.Args) > 2 {
		if v, err := strconv.Atoi(os.Args[2]); err == nil && v > 0 {
			limit = v
		}
	}

	tools := ffmpeg.Resolve()
	fmt.Printf("ffmpeg: 可用=%v 来源=%s\n", tools.Available(), tools.Describe())
	if !tools.Available() {
		fmt.Println("!! 没有可用的 ffmpeg，无法测量")
		os.Exit(1)
	}

	// 用临时数据目录，避免污染真实配置
	tmp, err := os.MkdirTemp("", "loudcheck-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(tmp)
	os.Setenv("MUSICPLAYER_DATA_DIR", tmp)

	store, err := bootstrap.NewStore()
	if err != nil {
		panic(err)
	}
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "lc", Path: dir, Status: "ok"}}
	}); err != nil {
		panic(err)
	}
	lib := library.NewManager(store)
	lib.ReloadFolders()
	if _, err := lib.Scan(context.Background(), false); err != nil {
		panic(err)
	}
	songs := lib.Songs()
	fmt.Printf("曲库: %d 首\n\n", len(songs))
	if len(songs) == 0 {
		os.Exit(2)
	}

	mgr := loudness.NewManager(tmp, 4)
	if !mgr.Available() {
		fmt.Println("!! 响度管理器报告 ffmpeg 不可用")
		os.Exit(1)
	}

	const target = -16.0
	type row struct {
		title string
		lufs  float64
		tp    float64
		gain  float64
	}
	rows := []row{}
	start := time.Now()

	n := limit
	if n > len(songs) {
		n = len(songs)
	}
	for i := 0; i < n; i++ {
		song := songs[i]
		t0 := time.Now()
		item, err := mgr.Measure(context.Background(), song)
		if err != nil {
			fmt.Printf("  ! %-28s 测量失败: %v\n", trunc(song.Title, 28), err)
			continue
		}
		gain := loudness.GainDB(item, target)
		rows = append(rows, row{song.Title, item.Integrated, item.TruePeak, gain})
		fmt.Printf("  %-30s %7.2f LUFS  真峰值 %6.2f dBTP  补偿 %+6.2f dB  (%s)\n",
			trunc(song.Title, 30), item.Integrated, item.TruePeak, gain, time.Since(t0).Round(time.Millisecond))
	}

	if len(rows) < 2 {
		fmt.Println("\n样本太少，无法比较响度差异")
		return
	}

	// 测得的响度差异 = 响度均衡能抹平的幅度
	sorted := append([]row(nil), rows...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].lufs < sorted[j].lufs })
	spread := sorted[len(sorted)-1].lufs - sorted[0].lufs

	var sumGain float64
	for _, r := range rows {
		sumGain += r.gain
	}

	fmt.Printf("\n结论（目标 %.0f LUFS）:\n", target)
	fmt.Printf("  实测响度范围: %.2f ~ %.2f LUFS（相差 %.2f LU，这就是切歌时的音量落差）\n",
		sorted[0].lufs, sorted[len(sorted)-1].lufs, spread)
	fmt.Printf("  补偿增益范围: 最轻 %+.2f dB，最响 %+.2f dB\n", sorted[len(sorted)-1].gain, sorted[0].gain)
	fmt.Printf("  平均|改善|幅度: %.2f LU（均衡后各曲目标响度一致）\n", spread)
	fmt.Printf("  平均测量耗时: %s/首，总耗时 %s\n",
		(time.Since(start) / time.Duration(len(rows))).Round(time.Millisecond), time.Since(start).Round(time.Millisecond))

	// 缓存验证
	if err := mgr.Save(); err != nil {
		fmt.Printf("  ! 保存缓存失败: %v\n", err)
	}
	mgr2 := loudness.NewManager(tmp, 4)
	hit := 0
	for i := 0; i < n; i++ {
		if _, ok := mgr2.Get(songs[i]); ok {
			hit++
		}
	}
	fmt.Printf("  缓存命中: %d/%d（重启后无需重新测量）\n", hit, n)
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}
