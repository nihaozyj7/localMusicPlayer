package bilibili

/* ==========================================================================
   retry_test.go — 瞬时失败重试的离线测试
   --------------------------------------------------------------------------
   症状来源：用户第一次提交在线搜索时偶尔「立刻就失败」，重搜同一个关键词就好。
   链路实测不是确定性 bug，而是单次请求的瞬时失败被原样报成了最终结果。

   这里覆盖四条边界：5xx 会重试、风控码会重试、确定性错误一次都不重试、
   nav（取密钥）失败也会重试（它失败意味着搜索请求一次都没发出）。
   ========================================================================== */

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// flakyAPI 让前 n 次请求返回指定状态码/响应体，之后返回成功响应。
func flakyAPI(t *testing.T, path string, fails int32, failBody string, failStatus int, okBody string) (*fakeAPI, *int32) {
	t.Helper()
	var hits int32
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != path {
			_, _ = w.Write([]byte(navJSON))
			return
		}
		n := atomic.AddInt32(&hits, 1)
		if n <= fails {
			if failStatus != 0 && failStatus != http.StatusOK {
				w.WriteHeader(failStatus)
			}
			_, _ = w.Write([]byte(failBody))
			return
		}
		_, _ = w.Write([]byte(okBody))
	})
	return f, &hits
}

const okSearchBody = `{"code":0,"data":{"page":1,"page_size":20,"total":0,"result":[]}}`

// HTTP 5xx 是瞬时失败：必须重试，并且最终成功时不能把错误抛给用户。
func TestSearchRetriesServerError(t *testing.T) {
	f, hits := flakyAPI(t, "/x/web-interface/wbi/search/type", 2, "boom", http.StatusBadGateway, okSearchBody)
	if _, err := newFakeClient(f).Search(context.Background(), "x", 1, 20); err != nil {
		t.Fatalf("5xx 重试后应当成功，实际: %v", err)
	}
	if got := atomic.LoadInt32(hits); got != 3 {
		t.Errorf("搜索请求 %d 次，期望 3 次（首发 + 2 次重试）", got)
	}
}

// 风控/限流业务码（-352 请求被风控）同样是瞬时失败。
func TestSearchRetriesRiskControlCode(t *testing.T) {
	f, hits := flakyAPI(t, "/x/web-interface/wbi/search/type", 1, `{"code":-352,"message":"风控校验失败"}`, 0, okSearchBody)
	if _, err := newFakeClient(f).Search(context.Background(), "x", 1, 20); err != nil {
		t.Fatalf("风控码重试后应当成功，实际: %v", err)
	}
	if got := atomic.LoadInt32(hits); got != 2 {
		t.Errorf("搜索请求 %d 次，期望 2 次", got)
	}
}

// 确定性错误不重试：重试结果一字不变，只会让用户多等。
func TestSearchDoesNotRetryDeterministicCode(t *testing.T) {
	f, hits := flakyAPI(t, "/x/web-interface/wbi/search/type", 99, `{"code":-404,"message":"啥都木有"}`, 0, okSearchBody)
	_, err := newFakeClient(f).Search(context.Background(), "x", 1, 20)
	if err == nil || !strings.Contains(err.Error(), "-404") {
		t.Fatalf("错误 = %v，期望如实报出 -404", err)
	}
	if got := atomic.LoadInt32(hits); got != 1 {
		t.Errorf("确定性错误被重试了 %d 次（应当只发 1 次）", got)
	}
}

// 4xx 不重试（429 例外，见 TestSearchRetriesRateLimit）。
func TestSearchDoesNotRetryClientError(t *testing.T) {
	f, hits := flakyAPI(t, "/x/web-interface/wbi/search/type", 99, "no", http.StatusForbidden, okSearchBody)
	if _, err := newFakeClient(f).Search(context.Background(), "x", 1, 20); err == nil {
		t.Fatal("403 应当报错")
	}
	if got := atomic.LoadInt32(hits); got != 1 {
		t.Errorf("403 被重试了 %d 次（应当只发 1 次）", got)
	}
}

// 429 是限流，属于瞬时失败。
func TestSearchRetriesRateLimit(t *testing.T) {
	f, hits := flakyAPI(t, "/x/web-interface/wbi/search/type", 1, "slow down", http.StatusTooManyRequests, okSearchBody)
	if _, err := newFakeClient(f).Search(context.Background(), "x", 1, 20); err != nil {
		t.Fatalf("429 重试后应当成功，实际: %v", err)
	}
	if got := atomic.LoadInt32(hits); got != 2 {
		t.Errorf("搜索请求 %d 次，期望 2 次", got)
	}
}

// ★ nav 失败 = 搜索请求一次都没发出 —— 这正是「提交后立刻失败」的形态，
// 所以它必须自带重试，否则用户会看到一次都没发出请求的失败。
func TestEnsureWBIRetriesNav(t *testing.T) {
	var navHits int32
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/x/web-interface/nav":
			if atomic.AddInt32(&navHits, 1) == 1 {
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte("boom"))
				return
			}
			_, _ = w.Write([]byte(navJSON))
		default:
			_, _ = w.Write([]byte(okSearchBody))
		}
	})
	if _, err := newFakeClient(f).Search(context.Background(), "x", 1, 20); err != nil {
		t.Fatalf("nav 首次失败后应当重试成功，实际: %v", err)
	}
	if got := atomic.LoadInt32(&navHits); got != 2 {
		t.Errorf("nav 请求 %d 次，期望 2 次", got)
	}
}

// WBI 密钥已缓存时，nav 的重试不该影响既有请求次数（回归：别把缓存判据写坏）。
func TestNavNotRefetchedWhenKeysCached(t *testing.T) {
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/x/web-interface/wbi/search/type" {
			_, _ = w.Write([]byte(okSearchBody))
			return
		}
		_, _ = w.Write([]byte(navJSON))
	})
	c := newFakeClient(f)
	for i := 0; i < 2; i++ {
		if _, err := c.Search(context.Background(), "x", 1, 20); err != nil {
			t.Fatalf("第 %d 次搜索失败: %v", i+1, err)
		}
	}
	nav := 0
	for _, p := range f.paths() {
		if p == "/x/web-interface/nav" {
			nav++
		}
	}
	if nav != 1 {
		t.Errorf("nav 请求 %d 次，期望 1 次（密钥缓存 12 小时）", nav)
	}
}

// context 已取消时不重试（再试也没有预算）。
func TestRetryStopsOnCancelledContext(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	c := NewClient()
	c.BaseURL = srv.URL

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := c.Search(ctx, "x", 1, 20); err == nil {
		t.Fatal("已取消的 context 应当报错")
	}
	if got := atomic.LoadInt32(&hits); got != 0 {
		t.Errorf("context 已取消仍发出了 %d 次请求", got)
	}
}
