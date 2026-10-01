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
//
// ★ 刻意**不写死**「最新版本号是 vX.Y.Z」。
//
// 这里原来断言 `res.Latest == "v0.1.1"`，于是每次发新版本这条测试都会红 ——
// 而它红的原因不是代码坏了，只是发布了一个新版本。发版流程里出现「一条必然
// 失败的测试」是非常有害的：要么有人养成忽略它的习惯，要么有人把断言改成
// 新版本号，而后者并没有真正验证任何东西。
//
// 真正要验证的是**关系**而不是那个具体数字：
//
//	· 用一个远远落后的版本去查，必须报告「有更新」；
//	· 拿返回的"最新版本"再查一次，必须报告「已是最新」（自洽）；
//	· 必须挑出一个可下载的资产（名字与体积都合理）。
func TestLiveCheckAgainstRealRepo(t *testing.T) {
	if os.Getenv("LMPLAYER_LIVE_UPDATE") != "1" {
		t.Skip("需要 LMPLAYER_LIVE_UPDATE=1 才跑真实网络测试")
	}

	c := NewClient("nihaozyj7/localMusicPlayer")
	// 0.0.1 远低于任何已发布版本，因此「有更新」这个结论长期稳定成立
	res, err := c.Check(context.Background(), "0.0.1", false)
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
		t.Fatalf("0.0.1 相对已发布版本应当报告有更新（得到 Latest=%q）", res.Latest)
	}
	if res.Latest == "" {
		t.Fatal("应当返回最新版本号")
	}
	if res.DownloadURL == "" {
		t.Error("应当有下载地址")
	}
	if res.AssetSize <= 0 {
		t.Error("应当有资产体积")
	}

	// 自洽性：拿返回的「最新版本」再查一次，不该再报有更新。
	//
	// 这一条同时覆盖了「tag 的 v 前缀」与「构建元数据」两种写法能否对齐
	// （GitHub 给的是 `v0.1.3`，而 appVersion 常量是 `0.1.3`）。
	same, err := c.Check(context.Background(), res.Latest, false)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if same.HasUpdate {
		t.Errorf("拿最新版本号 %q 去查，不应再报有更新", res.Latest)
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
