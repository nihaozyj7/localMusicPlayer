package update

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestLiveCheckAgainstRealRepo 是对真实 GitHub 的一次端到端验证。
//
// 默认跳过（go test 不该依赖外网）；显式跑：
//
//	LMPLAYER_LIVE_UPDATE=1 go test ./internal/update/ -run TestLiveCheck -v
func TestLiveCheckAgainstRealRepo(t *testing.T) {
	if os.Getenv("LMPLAYER_LIVE_UPDATE") != "1" {
		t.Skip("需要 LMPLAYER_LIVE_UPDATE=1 才跑真实网络测试")
	}

	c := NewClient("nihaozyj7/localMusicPlayer")
	res, err := c.Check(context.Background(), "0.1.0", false)
	if err != nil {
		t.Fatalf("Check 返回 error：%v", err)
	}
	t.Logf("当前=%s 最新=%s 有更新=%v 可下载=%v",
		res.Current, res.Latest, res.HasUpdate, res.Available)
	t.Logf("资产=%s (%s) 发布时间=%d",
		res.AssetName, res.AssetSizeText, res.PublishedAt)
	if res.Error != "" {
		t.Fatalf("检查失败：%s", res.Error)
	}
	if !res.HasUpdate {
		t.Fatalf("0.1.0 相对 v0.1.1 应当报告有更新（得到 Latest=%q）", res.Latest)
	}
	if res.Latest != "v0.1.1" {
		t.Errorf("最新版本应为 v0.1.1，得到 %q", res.Latest)
	}
	if res.DownloadURL == "" {
		t.Error("应当有下载地址")
	}
	if res.AssetSize <= 0 {
		t.Error("应当有资产体积")
	}

	// 已是最新
	same, err := c.Check(context.Background(), res.Latest, false)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if same.HasUpdate {
		t.Errorf("拿最新版本号去查，不应再报有更新")
	}
}

// TestLiveDownloadThroughRealMirrors 真的逐个通道下载一次（用 SHA256SUMS.txt，
// 只有 98 字节，不会消耗太多流量），验证降级链路在真实网络下能跑通。
func TestLiveDownloadThroughRealMirrors(t *testing.T) {
	if os.Getenv("LMPLAYER_LIVE_UPDATE") != "1" {
		t.Skip("需要 LMPLAYER_LIVE_UPDATE=1 才跑真实网络测试")
	}

	c := NewClient("nihaozyj7/localMusicPlayer")

	// 先拿到真实的资产地址
	res, err := c.Check(context.Background(), "0.1.0", false)
	if err != nil || res.Error != "" {
		t.Fatalf("先决条件失败：%v / %s", err, res.Error)
	}
	// 把资产名换成校验和文件（小、稳、真实存在）
	base := res.DownloadURL[:len(res.DownloadURL)-len(res.AssetName)]
	sumURL := base + "SHA256SUMS.txt"

	dir := t.TempDir()
	var attempts []string
	start := time.Now()
	out, err := c.Download(context.Background(), DownloadOptions{
		URL:       sumURL,
		AssetName: "SHA256SUMS.txt",
		TempDir:   dir,
		Channel:   ChannelAuto,
		OnAttempt: func(i int, m Mirror) { attempts = append(attempts, m.ID) },
	})
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("所有通道都失败（试过 %v，耗时 %s）：%v", attempts, elapsed, err)
	}
	t.Logf("成功通道=%s 试了 %d 条通道（%v）耗时=%s 字节=%d",
		out.MirrorName, out.Attempts, attempts, elapsed, out.Bytes)

	body, err := os.ReadFile(filepath.Join(dir, out.Path[len(dir)+1:]))
	if err != nil {
		// out.Path 已经是完整路径
		body, err = os.ReadFile(out.Path)
		if err != nil {
			t.Fatalf("读回文件失败：%v", err)
		}
	}
	sums := ParseChecksums(string(body))
	if len(sums) == 0 {
		t.Fatalf("校验和文件解析为空，内容：%q", string(body))
	}
	sum, ok := ChecksumFor(sums, res.AssetName)
	if !ok {
		t.Fatalf("校验和清单里没有 %s，解析出 %v", res.AssetName, sums)
	}
	fmt.Printf("[live] %s 的 SHA-256 = %s\n", res.AssetName, sum)
}
