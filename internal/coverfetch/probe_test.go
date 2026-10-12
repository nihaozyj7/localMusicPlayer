package coverfetch

import (
	"context"
	"os"
	"testing"
	"time"
)

// liveEnabled 判断联网用例是否被显式打开。
//
// ★ 原先这里用的是 `testing.Short()`，而 CI 跑的是 `go test -race`（**不带**
// -short）—— 于是这两个联网探针在每次 CI 里都真的朝 itunes / netease /
// deezer / musicbrainz 发请求（审查报告第六轮 第 15 条：它是全仓唯一漏掉
// 门禁开关的联网用例）。第三方站点抖动或限流会让 CI 红，而这与本次提交无关。
//
// 现在与其它联网用例（LMPLAYER_LIVE_KUGOU / LMPLAYER_LIVE_QQ /
// LMPLAYER_LIVE_UPDATE）统一成一个显式开关，默认**跳过**。
func liveEnabled() bool { return os.Getenv("LMPLAYER_LIVE_COVERFETCH") == "1" }

// TestProvidersProbe 逐个来源打一次真实请求，输出诊断信息。
// 依赖外网：默认跳过，需要时用 `LMPLAYER_LIVE_COVERFETCH=1 go test ./internal/coverfetch/ -run TestProvidersProbe -v`。
func TestProvidersProbe(t *testing.T) {
	if !liveEnabled() {
		t.Skip("需要 LMPLAYER_LIVE_COVERFETCH=1 才跑真实网络测试")
	}
	req := Request{Title: "晴天", Artist: "周杰伦", Album: "叶惠美"}
	providers := []Provider{NewITunes(), NewNetease(), NewDeezer(), NewMusicBrainz()}
	ok := 0
	for _, p := range providers {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		res, err := p.Find(ctx, req)
		cancel()
		if err != nil {
			t.Logf("%-12s ERROR %v", p.Name(), err)
			continue
		}
		if !res.Cover.Valid() {
			t.Logf("%-12s 无结果（候选 %d）", p.Name(), len(res.Candidates))
			continue
		}
		t.Logf("%-12s OK score=%d url=%s", p.Name(), res.Cover.Score, res.Cover.URL)
		ok++
	}
	if ok == 0 {
		t.Fatal("所有来源都没查到封面")
	}
}

// TestDownloadITunes 真下载一张 iTunes 封面，确认图床白名单与下载路径可用。
// 同样默认跳过（见 liveEnabled 的说明）。
func TestDownloadITunes(t *testing.T) {
	if !liveEnabled() {
		t.Skip("需要 LMPLAYER_LIVE_COVERFETCH=1 才跑真实网络测试")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	agg := New(NewITunes())
	cover, err := agg.Find(ctx, Request{Title: "晴天", Artist: "周杰伦"})
	if err != nil {
		t.Fatalf("iTunes 查询失败: %v", err)
	}
	img, err := Download(ctx, cover.URL)
	if err != nil {
		t.Fatalf("封面下载失败: %v (%s)", err, cover.URL)
	}
	t.Logf("图片: %s %d bytes url=%s", img.ContentType, len(img.Body), img.URL)
	if len(img.Body) < 1000 {
		t.Fatalf("图片过小，可能不是有效封面: %d bytes", len(img.Body))
	}
}
