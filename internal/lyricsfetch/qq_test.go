package lyricsfetch

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

/* --------------------------------------------------------------------------
   排序稳定性：同分时按来源声明顺序
   --------------------------------------------------------------------------
   声明顺序就是优先级。早期实现直接 sort.SliceStable 已经按到达顺序排过序，
   同分时谁先回来谁赢 —— 网络抖动会让同一首歌的匹配结果飘来飘去。
*/

type delayProvider struct {
	name   string
	delay  time.Duration
	title  string
	artist string
}

func (d *delayProvider) Name() string { return d.name }

func (d *delayProvider) Search(ctx context.Context, _ SearchRequest) ([]Candidate, error) {
	if d.delay > 0 {
		select {
		case <-time.After(d.delay):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return []Candidate{{ID: d.name, Title: d.title, Artist: d.artist, HasLyrics: true}}, nil
}

func (d *delayProvider) Fetch(_ context.Context, _ Candidate) (Result, error) {
	return Result{LRC: "[00:00.00]hi", Provider: d.name}, nil
}

func TestSearchTiesFollowProviderOrder(t *testing.T) {
	slow := &delayProvider{name: "slow", delay: 150 * time.Millisecond, title: "晴天", artist: "周杰伦"}
	fast := &delayProvider{name: "fast", title: "晴天", artist: "周杰伦"}
	agg := NewAggregator(slow, fast)

	got, err := agg.Search(context.Background(), SearchRequest{Title: "晴天", Artist: "周杰伦"})
	if err != nil {
		t.Fatalf("Search 失败: %v", err)
	}
	if len(got) < 2 {
		t.Fatalf("应收到两个来源的候选，实际 %d", len(got))
	}
	if got[0].Provider != "slow" {
		t.Fatalf("同分时应按声明顺序（slow 在前），实际第一位是 %q", got[0].Provider)
	}
}

// 拿到强命中后不再死等慢来源：否则一个卡住的源会让用户白等一个 8s 超时。
func TestSearchReturnsAfterStrongMatch(t *testing.T) {
	slow := &delayProvider{name: "slow", delay: 3 * time.Second, title: "完全不相关的歌", artist: "谁"}
	fast := &delayProvider{name: "fast", title: "晴天", artist: "周杰伦"}
	agg := NewAggregator(slow, fast)

	start := time.Now()
	got, err := agg.Search(context.Background(), SearchRequest{Title: "晴天", Artist: "周杰伦"})
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("Search 失败: %v", err)
	}
	if len(got) == 0 {
		t.Fatal("应至少拿到 fast 的候选")
	}
	if elapsed > 2500*time.Millisecond {
		t.Fatalf("强命中后应很快返回，实际等了 %v", elapsed)
	}
}

/* --------------------------------------------------------------------------
   没有候选 / 全部失败 的区分
   --------------------------------------------------------------------------
   「来源都正常但没有这首歌」是正常结果（返回 ErrNoMatch），
   上层据此显示「没有找到候选歌词」而不是弹「搜索失败」。
*/

type emptyProvider struct{ name string }

func (e *emptyProvider) Name() string { return e.name }

func (e *emptyProvider) Search(context.Context, SearchRequest) ([]Candidate, error) { return nil, nil }

func (e *emptyProvider) Fetch(context.Context, Candidate) (Result, error) { return Result{}, nil }

type failProvider struct{ name string }

func (f *failProvider) Name() string { return f.name }

func (f *failProvider) Search(context.Context, SearchRequest) ([]Candidate, error) {
	return nil, errors.New(f.name + " 挂了")
}

func (f *failProvider) Fetch(context.Context, Candidate) (Result, error) { return Result{}, nil }

func TestSearchNoMatchVsAllFailed(t *testing.T) {
	noMatch := NewAggregator(&emptyProvider{name: "a"}, &emptyProvider{name: "b"})
	_, err := noMatch.Search(context.Background(), SearchRequest{Title: "x"})
	if !errors.Is(err, ErrNoMatch) {
		t.Fatalf("全部来源正常但没结果时应返回 ErrNoMatch，实际 %v", err)
	}

	failed := NewAggregator(&failProvider{name: "a"}, &failProvider{name: "b"})
	_, err = failed.Search(context.Background(), SearchRequest{Title: "x"})
	if err == nil || errors.Is(err, ErrNoMatch) {
		t.Fatalf("全部来源失败时应返回真实错误，实际 %v", err)
	}
}

/* --------------------------------------------------------------------------
   QQ 音乐来源
   -------------------------------------------------------------------------- */

func qqTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Referer") == "" {
			t.Error("QQ 接口必须带 Referer，否则会被判成盗链")
		}
		switch r.URL.Path {
		case "/soso/fcgi-bin/client_search_cp":
			io.WriteString(w, `{"code":0,"data":{"song":{"list":[{"songmid":"0039MnYb0qxYhV","songname":"晴天","albumname":"叶惠美","interval":270,"singer":[{"name":"周杰伦"}]}]}}}`)
		case "/lyric/fcgi-bin/fcg_query_lyric_new.fcg":
			if r.URL.Query().Get("songmid") != "0039MnYb0qxYhV" {
				t.Errorf("songmid 传错: %q", r.URL.Query().Get("songmid"))
			}
			io.WriteString(w, `{"retcode":0,"code":0,"lyric":"[00:00.00]晴天 &amp; 你\n[00:01.00]第二行"}`)
		default:
			t.Errorf("未预期的路径: %s", r.URL.Path)
		}
	}))
}

func TestQQProviderSearchAndFetch(t *testing.T) {
	srv := qqTestServer(t)
	defer srv.Close()
	p := &qqProvider{baseURL: srv.URL}

	items, err := p.Search(context.Background(), SearchRequest{Keyword: "晴天 周杰伦"})
	if err != nil {
		t.Fatalf("Search 失败: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("应有 1 个候选，实际 %d", len(items))
	}
	if items[0].ID != "0039MnYb0qxYhV" || items[0].Provider != "qq" {
		t.Fatalf("候选字段不对: %+v", items[0])
	}
	if items[0].Duration != 270000 {
		t.Fatalf("时长应换算成毫秒，实际 %d", items[0].Duration)
	}

	res, err := p.Fetch(context.Background(), items[0])
	if err != nil {
		t.Fatalf("Fetch 失败: %v", err)
	}
	if res.Provider != "qq" || res.Source != "qq" {
		t.Fatalf("来源字段不对: %+v", res)
	}
	// 歌词里的 HTML 实体必须还原（直接展示会看到 &amp;）
	if !strings.Contains(res.LRC, "晴天 & 你") {
		t.Fatalf("歌词实体未还原: %q", res.LRC)
	}
}

func TestQQProviderRejectsBizCode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"code":1000,"data":{"song":{"list":[]}}}`)
	}))
	defer srv.Close()
	p := &qqProvider{baseURL: srv.URL}
	_, err := p.Search(context.Background(), SearchRequest{Keyword: "x"})
	if err == nil {
		t.Fatal("code != 0 时应返回错误，而不是当成没搜到")
	}
	if !strings.Contains(err.Error(), "1000") {
		t.Fatalf("错误里应带上业务状态码: %v", err)
	}
}
