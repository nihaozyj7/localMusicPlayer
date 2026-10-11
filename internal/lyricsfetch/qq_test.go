package lyricsfetch

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
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
   --------------------------------------------------------------------------
   QQ 有两套接口（musicu 为主、老 cgi 回退），抓取要试三次（逐字 → 行级 →
   老 cgi）。这条链上任何一环退化，表现都只是「有歌词但不能逐字」—— 界面上
   看不出来，所以每一环都要有用例钉住。
   -------------------------------------------------------------------------- */

const (
	qqTestMid   = "0039MnYb0qxYhV"
	qqTestLRC   = "[00:00.00]第一行 & 你\n[00:01.00]第二行"
	qqTestQRCTX = `<?xml version="1.0" encoding="utf-8"?>` + "\n" +
		`<QrcInfos>` + "\n" +
		`<QrcHeadInfo SaveTime="269" Version="100"/>` + "\n" +
		`<LyricInfo LyricCount="1">` + "\n" +
		`<Lyric_1 LyricType="1" LyricContent="[ti:晴天]` + "\n" +
		`[0,1000]<0,500,0>甲<500,500,0>乙"/>` + "\n" +
		`</LyricInfo>` + "\n" +
		`</QrcInfos>`
)

// qqTestOptions 决定假服务器上哪几条路能走通。
type qqTestOptions struct {
	musicuDown  bool // musicu 整站挂（模拟老 cgi 那种 HTTP 500）
	musicuNoQRC bool // musicu 可用，但这首只有行级歌词
	legacyDown  bool // 老 cgi 挂
	musicuCode  int  // 非 0 时 musicu 返回业务错误码
}

func qqTestProvider(t *testing.T, o qqTestOptions) (*qqProvider, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Referer") == "" {
			t.Error("QQ 接口必须带 Referer，否则会被判成盗链")
		}
		switch {
		case r.URL.Path == "/musicu":
			if o.musicuDown {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			if r.Method != http.MethodPost {
				t.Errorf("musicu 必须用 POST，实际 %s", r.Method)
			}
			body, _ := io.ReadAll(r.Body)
			var probe struct {
				Req struct {
					Module string         `json:"module"`
					Method string         `json:"method"`
					Param  map[string]any `json:"param"`
				} `json:"req"`
			}
			if err := json.Unmarshal(body, &probe); err != nil {
				t.Errorf("musicu 请求体不是 JSON: %v", err)
			}
			if o.musicuCode != 0 {
				io.WriteString(w, `{"code":`+strconv.Itoa(o.musicuCode)+`,"req":{"code":0}}`)
				return
			}
			switch probe.Req.Module {
			case "music.search.SearchCgiService":
				io.WriteString(w, `{"code":0,"req":{"code":0,"data":{"body":{"song":{"list":[`+
					`{"mid":"`+qqTestMid+`","name":"晴天","interval":270,"album":{"name":"叶惠美"},`+
					`"singer":[{"name":"周杰伦"}]}]}}}}}`)
			case "music.musichallSong.PlayLyricInfo":
				if qqInt(probe.Req.Param["qrc"]) == 1 {
					if o.musicuNoQRC {
						io.WriteString(w, `{"code":0,"req":{"code":0,"data":{"qrc":0,"lyric":""}}}`)
						return
					}
					io.WriteString(w, `{"code":0,"req":{"code":0,"data":{"qrc":1,"crypt":1,"lyric":"`+
						qqTestEncrypt(t, qqTestQRCTX)+`"}}}`)
					return
				}
				io.WriteString(w, `{"code":0,"req":{"code":0,"data":{"qrc":0,"crypt":1,"lyric":"`+
					qqTestEncrypt(t, qqTestLRC)+`"}}}`)
			default:
				t.Errorf("未预期的 musicu module: %s", probe.Req.Module)
			}
		case r.URL.Path == "/soso/fcgi-bin/client_search_cp":
			if o.legacyDown {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			io.WriteString(w, `{"code":0,"data":{"song":{"list":[{"songmid":"`+qqTestMid+
				`","songname":"晴天","albumname":"叶惠美","interval":270,"singer":[{"name":"周杰伦"}]}]}}}`)
		case r.URL.Path == "/lyric/fcgi-bin/fcg_query_lyric_new.fcg":
			if o.legacyDown {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			if r.URL.Query().Get("songmid") != qqTestMid {
				t.Errorf("songmid 传错: %q", r.URL.Query().Get("songmid"))
			}
			io.WriteString(w, `{"retcode":0,"code":0,"lyric":"[00:00.00]老接口 &amp; 歌词\n[00:01.00]第二行"}`)
		default:
			t.Errorf("未预期的路径: %s", r.URL.Path)
		}
	}))
	t.Cleanup(srv.Close)
	return &qqProvider{baseURL: srv.URL, musicuURL: srv.URL + "/musicu"}, srv
}

// musicu 这条路要能搜到、能拿到**逐字**歌词。
func TestQQProviderMusicuSearchAndFetchWordLevel(t *testing.T) {
	p, _ := qqTestProvider(t, qqTestOptions{})

	items, err := p.Search(context.Background(), SearchRequest{Keyword: "晴天 周杰伦"})
	if err != nil {
		t.Fatalf("Search 失败: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("应有 1 个候选，实际 %d", len(items))
	}
	if items[0].ID != qqTestMid || items[0].Provider != "qq" {
		t.Fatalf("候选字段不对: %+v", items[0])
	}
	if items[0].Duration != 270000 {
		t.Fatalf("时长应换算成毫秒，实际 %d", items[0].Duration)
	}
	if items[0].Artist != "周杰伦" || items[0].Album != "叶惠美" {
		t.Fatalf("歌手/专辑解析不对: %+v", items[0])
	}

	res, err := p.Fetch(context.Background(), items[0])
	if err != nil {
		t.Fatalf("Fetch 失败: %v", err)
	}
	if res.Provider != "qq" || res.Source != "qq" {
		t.Fatalf("来源字段不对: %+v", res)
	}
	if FormatOf(res.LRC) != FormatWord {
		t.Fatalf("应拿到逐字歌词，实际 %q", res.LRC)
	}
	if strings.Contains(res.LRC, "<QrcInfos") || strings.Contains(res.LRC, `LyricContent=`) {
		t.Fatalf("XML 外壳没剥掉: %q", res.LRC)
	}
	if !strings.Contains(res.LRC, "[ti:晴天]") {
		t.Fatalf("元数据行丢了: %q", res.LRC)
	}
	if !hasWordProviderWordLevel(p) {
		t.Fatal("QQ 声明了逐字能力，聚合器要靠它决定是否多抓一次")
	}
}

// 这首没有 QRC 时必须退到行级，而且不能报错（不能因为「没有逐字」就当失败）。
func TestQQProviderFallsBackToLineLevelWhenNoQRC(t *testing.T) {
	p, _ := qqTestProvider(t, qqTestOptions{musicuNoQRC: true})
	res, err := p.Fetch(context.Background(), Candidate{ID: qqTestMid, Provider: "qq"})
	if err != nil {
		t.Fatalf("Fetch 失败: %v", err)
	}
	if FormatOf(res.LRC) != FormatLine {
		t.Fatalf("应回退成行级歌词，实际 %q", res.LRC)
	}
	if !strings.Contains(res.LRC, "第一行 & 你") {
		t.Fatalf("行级歌词内容不对: %q", res.LRC)
	}
}

// musicu 整站 500 时（本机实测 c.y.qq.com 就是这个样子）必须走老 cgi。
func TestQQProviderFallsBackToLegacy(t *testing.T) {
	p, _ := qqTestProvider(t, qqTestOptions{musicuDown: true})

	items, err := p.Search(context.Background(), SearchRequest{Keyword: "晴天 周杰伦"})
	if err != nil {
		t.Fatalf("Search 应回退到老 cgi，实际失败: %v", err)
	}
	if len(items) != 1 || items[0].ID != qqTestMid {
		t.Fatalf("老 cgi 候选不对: %+v", items)
	}

	res, err := p.Fetch(context.Background(), items[0])
	if err != nil {
		t.Fatalf("Fetch 应回退到老 cgi，实际失败: %v", err)
	}
	// 歌词里的 HTML 实体必须还原（直接展示会看到 &amp;）
	if !strings.Contains(res.LRC, "老接口 & 歌词") {
		t.Fatalf("歌词实体未还原: %q", res.LRC)
	}
	if FormatOf(res.LRC) != FormatLine {
		t.Fatalf("老 cgi 只有行级: %q", res.LRC)
	}
}

// 业务错误码不能当成「没搜到」：上层要能看到原因并退避。
func TestQQProviderRejectsBizCode(t *testing.T) {
	p, _ := qqTestProvider(t, qqTestOptions{musicuCode: 1000, legacyDown: true})
	_, err := p.Search(context.Background(), SearchRequest{Keyword: "x"})
	if err == nil {
		t.Fatal("code != 0 时应返回错误，而不是当成没搜到")
	}
	if !strings.Contains(err.Error(), "1000") {
		t.Fatalf("错误里应带上业务状态码: %v", err)
	}
}

// 两条路都不通时报错（不是静默返回空歌词）。
func TestQQProviderErrorsWhenEverythingFails(t *testing.T) {
	p, _ := qqTestProvider(t, qqTestOptions{musicuDown: true, legacyDown: true})
	if _, err := p.Fetch(context.Background(), Candidate{ID: qqTestMid}); err == nil {
		t.Fatal("三条抓取路径全挂时应报错")
	}
	if _, err := p.Fetch(context.Background(), Candidate{ID: ""}); err == nil {
		t.Fatal("缺 songmid 时应报错")
	}
}

// hasWordProviderWordLevel 读一个来源是否声明了逐字能力（没有声明就不算）。
func hasWordProviderWordLevel(p Provider) bool {
	wp, ok := p.(WordProvider)
	return ok && wp.HasWordLevel()
}
