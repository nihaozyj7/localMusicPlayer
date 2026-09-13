package coverfetch

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

/* --------------------------------------------------------------------------
   熔断：FindAll 这条路径也必须喂状态
   --------------------------------------------------------------------------
   这是实测出来的 bug：「更换封面」面板走的是 FindAll → ResolveAll，
   而早期只有 Find 会上报结果。于是一个整条超时的来源（Deezer 在大陆网络）
   在面板路径上永远不被跳过，每次搜索都要白等一个 6s 的单来源超时。
*/

type countingProvider struct {
	name  string
	fail  bool
	calls atomic.Int32
}

func (c *countingProvider) Name() string { return c.name }

func (c *countingProvider) Find(_ context.Context, _ Request) (FindResult, error) {
	c.calls.Add(1)
	if c.fail {
		return FindResult{}, errStub
	}
	return FindResult{Cover: Cover{URL: "https://p1.music.126.net/a.jpg", Provider: c.name, Score: 60}}, nil
}

func TestFindAllFeedsBreaker(t *testing.T) {
	boom := &countingProvider{name: "boom", fail: true}
	ok := &countingProvider{name: "ok"}
	agg := New(boom, ok)

	// 连续两次失败 -> 达到阈值（2）
	for i := 0; i < 2; i++ {
		if _, err := agg.FindAll(context.Background(), Request{Title: "x"}); err != nil {
			t.Fatalf("FindAll 不应因为一个来源失败就报错: %v", err)
		}
	}
	if !agg.BreakerStatus()["boom"] {
		t.Fatal("连续失败的来源在 FindAll 路径上也应被熔断")
	}

	before := boom.calls.Load()
	if _, err := agg.FindAll(context.Background(), Request{Title: "y"}); err != nil {
		t.Fatal(err)
	}
	if boom.calls.Load() != before {
		t.Fatalf("熔断期间不应再查询该来源，实际又调用了 %d 次", boom.calls.Load()-before)
	}
	// 其它来源照常工作
	if ok.calls.Load() < 3 {
		t.Fatalf("健康来源不应被牵连，实际调用 %d 次", ok.calls.Load())
	}
}

// 「没查到」不是「坏了」：否则连续两首冷门歌就会把一个健康来源停用 5 分钟。
func TestNotFoundDoesNotTripBreaker(t *testing.T) {
	agg := New(&stubProvider{name: "empty"})
	for i := 0; i < 3; i++ {
		// 没有候选时 FindAll 会如实返回 ErrNotFound —— 这是正常结果，不是故障
		if _, err := agg.FindAll(context.Background(), Request{Title: "x"}); err != nil && !errors.Is(err, ErrNotFound) {
			t.Fatalf("FindAll: %v", err)
		}
	}
	if agg.BreakerStatus()["empty"] {
		t.Fatal("没有命中不应触发熔断（那会把健康来源停用 5 分钟）")
	}
}

/* --------------------------------------------------------------------------
   QQ 音乐来源
   -------------------------------------------------------------------------- */

func TestQQProviderParsesSearch(t *testing.T) {
	var gotPath, gotReferer, gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotReferer = r.Header.Get("Referer")
		gotQuery = r.URL.Query().Get("w")
		io.WriteString(w, "{\"code\":0,\"data\":{\"song\":{\"list\":["+
			"{\"songname\":\"晴天\",\"songmid\":\"0039MnYb0qxYhV\",\"albummid\":\"000MkMni19ClKG\",\"albumname\":\"叶惠美\",\"interval\":270,"+
			"\"singer\":[{\"name\":\"周杰伦\"}]},"+
			"{\"songname\":\"Poker Face\",\"songmid\":\"x\",\"albummid\":\"y\",\"albumname\":\"z\",\"interval\":200,"+
			"\"singer\":[{\"name\":\"Lady Gaga\"}]}]}}}")
	}))
	defer srv.Close()

	p := NewQQ()
	p.BaseURL = srv.URL
	res, err := p.Find(context.Background(), Request{Title: "晴天", Artist: "周杰伦"}.Normalize())
	if err != nil {
		t.Fatalf("Find 失败: %v", err)
	}
	if gotPath != "/soso/fcgi-bin/client_search_cp" {
		t.Fatalf("接口路径不对: %q", gotPath)
	}
	if gotReferer == "" {
		t.Fatal("必须带 Referer，否则 QQ 的 cgi 会返回空列表")
	}
	if gotQuery != "晴天 周杰伦" {
		t.Fatalf("关键词不对: %q", gotQuery)
	}
	if !res.Cover.Valid() {
		t.Fatal("应命中晴天")
	}
	// 封面地址必须由 albummid 拼成，且在 y.gtimg.cn（.cn！）
	want := "https://y.gtimg.cn/music/photo_new/T002R500x500M000000MkMni19ClKG.jpg"
	if res.Cover.URL != want {
		t.Fatalf("封面地址不对: %q，期望 %q", res.Cover.URL, want)
	}
	if !AllowedImageURL(res.Cover.URL) {
		t.Fatal("QQ 的封面域名必须在图床白名单里，否则代理会直接拒绝")
	}
	if len(res.Candidates) != 1 {
		t.Fatalf("不相关的 Poker Face 应被 confirmMatch 挡掉，实际 %d 个候选", len(res.Candidates))
	}
}

// HTTP 200 + code != 0 必须当成失败（否则熔断永远不生效、也看不到原因）。
func TestQQProviderDetectsAPICode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "{\"code\":1000,\"data\":{}}")
	}))
	defer srv.Close()
	p := NewQQ()
	p.BaseURL = srv.URL
	_, err := p.Find(context.Background(), Request{Title: "晴天", Artist: "周杰伦"}.Normalize())
	if err == nil {
		t.Fatal("code != 0 时应返回错误")
	}
	if !strings.Contains(err.Error(), "1000") {
		t.Fatalf("错误里应带上业务状态码: %v", err)
	}
}
