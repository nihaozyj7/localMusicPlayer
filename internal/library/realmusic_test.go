package library

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"musicplayer/internal/bootstrap"
)

// TestRealMusicFolder 真实曲库手工验证：
//
//	$env:MP_REAL_MUSIC="C:\Users\Example\Music"; go test ./internal/library -run TestRealMusicFolder -v
//
// 不设环境变量时自动跳过，因此不会影响 CI。
func TestRealMusicFolder(t *testing.T) {
	dir := os.Getenv("MP_REAL_MUSIC")
	if dir == "" {
		t.Skip("未设置 MP_REAL_MUSIC，跳过真实曲库验证")
	}
	if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
		t.Fatalf("目录不可用: %s (%v)", dir, err)
	}

	dataDir := t.TempDir()
	t.Setenv("MUSICPLAYER_DATA_DIR", dataDir)
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "real", Path: dir, Status: "ok"}}
	}); err != nil {
		t.Fatal(err)
	}

	m := NewManager(store)

	var lastPhase string
	m.SetProgressFunc(func(phase string, cur, total int) {
		if phase != lastPhase || cur == total {
			t.Logf("  进度 phase=%s %d/%d", phase, cur, total)
			lastPhase = phase
		}
	})

	start := time.Now()
	res, err := m.Scan(context.Background(), false)
	if err != nil {
		t.Fatalf("扫描失败: %v", err)
	}
	elapsed := time.Since(start)

	t.Logf("扫描结果: %+v（耗时 %s）", res, elapsed.Round(time.Millisecond))
	t.Logf("文件夹状态: %+v", m.Folders())

	songs := m.Songs()
	t.Logf("曲库曲目数: %d", len(songs))
	for i, s := range songs {
		if i >= 8 {
			break
		}
		t.Logf("  [%d] %s | %s | %s | %dms | %dHz | cover=%v",
			i, s.Title, s.Artist, s.Album, s.Duration, s.SampleRate, s.CoverURL != "")
	}

	// 元数据解析质量统计
	var noDuration, noCover, noTitle int
	for _, s := range songs {
		if s.Duration == 0 {
			noDuration++
		}
		// 封面现在以内容寻址的同源地址给出（CoverURL），不再走 Cover 里的 base64
		if s.CoverURL == "" {
			noCover++
		}
		if s.Title == "" {
			noTitle++
		}
	}
	t.Logf("解析质量: 无时长 %d / 无封面 %d / 无标题 %d", noDuration, noCover, noTitle)

	if res.Found == 0 {
		t.Fatalf("没有任何音频文件被找到 —— 目录遍历或扩展名判定有问题")
	}
	if res.Kept == 0 {
		t.Fatalf("找到 %d 个音频但全部被过滤规则排除", res.Found)
	}

	fmt.Fprintf(os.Stderr, "\n[REAL] 找到=%d 保留=%d 过滤=%d 解析用时=%s\n", res.Found, res.Kept, res.Excluded, elapsed.Round(time.Millisecond))
}
