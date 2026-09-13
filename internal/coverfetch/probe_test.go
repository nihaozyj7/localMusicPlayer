package coverfetch

import (
	"context"
	"testing"
	"time"
)

// TestProvidersProbe 逐个来源打一次真实请求，输出诊断信息。
// 依赖外网，用 -short 跳过；日常 `go test ./...` 不会跑它。
func TestProvidersProbe(t *testing.T) {
	if testing.Short() {
		t.Skip("短模式跳过联网用例")
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
func TestDownloadITunes(t *testing.T) {
	if testing.Short() {
		t.Skip("短模式跳过联网用例")
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
