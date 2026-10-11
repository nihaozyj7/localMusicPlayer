/* ==========================================================================
   musicbrainz_test.go — MusicBrainz 的两条**条款要求**
   --------------------------------------------------------------------------
   见 docs/43 的 M4：MusicBrainz 的官方文档（MusicBrainz_API/Rate_Limiting）
   明确要求两件事，而这两件事都属于「错了也不会报错、只是慢慢被封」的类型：

     1. 每个请求都要带**能联系到维护者**的 User-Agent（应用名 + 版本 + 地址/邮箱）。
        以前这里复用的是全局的桌面浏览器 UA —— 既不符合条款，出问题时对方也
        联系不到我们；
     2. 平均不超过 1 请求/秒（按 IP），超了是 **100% 拒绝**（HTTP 503）而不是
        排队慢一点，所以必须在发请求**之前**自己排队。

   第 2 条用可调的 interval 测：默认 1.1s 会让测试慢得没法跑。
   ========================================================================== */

package coverfetch

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// mbReleasesBody 是 release 查询接口的最小合法响应。
func mbReleasesBody(w http.ResponseWriter) {
	io.WriteString(w, `{"releases":[{"id":"rg-1","title":"叶惠美",`+
		`"release-group":{"id":"rg-1"},"artist-credit":[{"name":"周杰伦"}]}]}`)
}

func TestMusicBrainzSendsIdentifiableUserAgent(t *testing.T) {
	old := appUserAgent
	SetAppUserAgent("LMPlayer/9.9.9 (+https://github.com/nihaozyj7/localMusicPlayer)")
	t.Cleanup(func() { SetAppUserAgent(old) })

	var gotUA string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUA = r.Header.Get("User-Agent")
		mbReleasesBody(w)
	}))
	defer srv.Close()

	// Throttle 显式给一个零值：本用例只关心 UA，不该被默认的 1.1s 拖慢。
	p := &MusicBrainzProvider{BaseURL: srv.URL, Throttle: &rateLimiter{}}
	if _, err := p.Find(context.Background(), Request{Title: "晴天", Artist: "周杰伦"}); err != nil {
		t.Fatalf("Find 失败: %v", err)
	}
	if !strings.Contains(gotUA, "LMPlayer/9.9.9") {
		t.Fatalf("MusicBrainz 必须收到带应用名与版本号的 UA，实际 %q", gotUA)
	}
	if strings.Contains(gotUA, "Mozilla") {
		t.Fatalf("不该再伪装成浏览器（对方要求 UA 里能看出是谁在请求），实际 %q", gotUA)
	}
	if !strings.Contains(gotUA, "https://") {
		t.Fatalf("UA 里应当带联系方式（仓库地址），实际 %q", gotUA)
	}
}

func TestMusicBrainzSpacesRequestsByInterval(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		mbReleasesBody(w)
	}))
	defer srv.Close()

	const interval = 40 * time.Millisecond
	p := &MusicBrainzProvider{BaseURL: srv.URL, Throttle: &rateLimiter{interval: interval}}

	start := time.Now()
	for i := 0; i < 3; i++ {
		if _, err := p.Find(context.Background(), Request{Title: "晴天", Artist: "周杰伦"}); err != nil {
			t.Fatalf("第 %d 次 Find 失败: %v", i+1, err)
		}
	}
	elapsed := time.Since(start)

	if got := atomic.LoadInt32(&hits); got != 3 {
		t.Fatalf("应当发出 3 次请求，实际 %d", got)
	}
	// 3 次请求之间有 2 个间隔
	if min := 2 * interval; elapsed < min {
		t.Fatalf("请求没有被节流：3 次共耗时 %v，至少应当 ≥ %v（每 %v 一次）", elapsed, min, interval)
	}
}

// 并发调用时不能算出同一个时刻一起冲出去（聚合器就是并发查各来源的）。
func TestRateLimiterSerializesConcurrentWaiters(t *testing.T) {
	const interval = 30 * time.Millisecond
	l := &rateLimiter{interval: interval}

	start := time.Now()
	done := make(chan time.Duration, 3)
	for i := 0; i < 3; i++ {
		go func() {
			_ = l.Wait(context.Background())
			done <- time.Since(start)
		}()
	}
	var last time.Duration
	for i := 0; i < 3; i++ {
		last = <-done
	}
	// 第 3 个时隙最早也要等 2 个间隔
	if last < 2*interval {
		t.Fatalf("并发调用被排到了同一个时隙（最后一个只等了 %v，应当 ≥ %v）", last, 2*interval)
	}
}

func TestRateLimiterWaitReturnsOnContextCancel(t *testing.T) {
	l := &rateLimiter{interval: time.Second}
	ctx, cancel := context.WithCancel(context.Background())

	// 占掉第一个时隙（立即返回），让下一次必须真的等
	if err := l.Wait(ctx); err != nil {
		t.Fatalf("第一次 Wait 不该报错: %v", err)
	}
	cancel()
	start := time.Now()
	err := l.Wait(ctx)
	if err == nil {
		t.Fatal("ctx 已取消时应当立刻返回错误，而不是等满一个间隔")
	}
	if elapsed := time.Since(start); elapsed > 300*time.Millisecond {
		t.Fatalf("ctx 取消后应当立刻返回，实际等了 %v", elapsed)
	}
}

// 零值 / 未配置节流器时不该阻塞（保持「只有 MusicBrainz 需要排队」这一点）。
func TestRateLimiterZeroValueNeverBlocks(t *testing.T) {
	var l rateLimiter
	start := time.Now()
	for i := 0; i < 5; i++ {
		if err := l.Wait(context.Background()); err != nil {
			t.Fatalf("零值节流器不该报错: %v", err)
		}
	}
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("零值节流器不该等待，实际耗时 %v", elapsed)
	}
}
