/* ==========================================================================
   wordlevel_toggle_test.go — 「优先使用逐字歌词」这个开关的行为
   --------------------------------------------------------------------------
   背景（见 docs/43 的 H2）：字级歌词只有 QQ 音乐（QRC）与酷狗（KRC）能给出，
   而这两家用的是第三方私有编码。设置里给了用户一个关掉它的开关，关掉之后：

     1. 聚合器不再把这两个来源当成「可能要字级」的来源（不再多花一次请求）；
     2. 两个来源自己也**不再请求、不再解析**那份私有编码 —— QQ 连密文都不要
        （crypt=0），酷狗直接跳过 KRC 只取 LRC；
     3. 已经缓存过的结果要作废，否则「关了开关这首还是逐字歌词」；
        但**只有值真的变化时**才清缓存 —— 调用方在每个调用点都会同步一次，
        无条件清会把 24h 的缓存变成每切一首歌清一次。

   这几条都是「错了也看不出来」的那一类（功能照常、只是行为与开关不符），
   所以逐条钉住。
   ========================================================================== */

package lyricsfetch

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

/* --------------------------------------------------------------------------
   1. 聚合器：开关传递 + 缓存失效语义
   -------------------------------------------------------------------------- */

// toggleStub 记录自己收到的开关值，用来证明聚合器把开关传下去了。
type toggleStub struct {
	name string
	on   bool
	got  []bool
}

func (s *toggleStub) Name() string { return s.name }

func (s *toggleStub) Search(context.Context, SearchRequest) ([]Candidate, error) { return nil, nil }

func (s *toggleStub) Fetch(context.Context, Candidate) (Result, error) { return Result{}, nil }

func (s *toggleStub) HasWordLevel() bool { return s.on }

func (s *toggleStub) SetWordLevelEnabled(on bool) {
	s.on = on
	s.got = append(s.got, on)
}

func TestAggregatorSetWordLevelEnabledPropagates(t *testing.T) {
	stub := &toggleStub{name: "stub", on: true}
	a := NewAggregator(stub)

	if !a.wordCapable("stub") {
		t.Fatal("前置条件：声明了字级能力的来源应当算 wordCapable")
	}
	a.SetWordLevelEnabled(false)
	if stub.on {
		t.Fatal("开关没有传到 provider —— 它仍会去请求私有编码的歌词")
	}
	if len(stub.got) != 1 || stub.got[0] != false {
		t.Fatalf("provider 收到的开关值不对: %v", stub.got)
	}
	if a.wordCapable("stub") {
		t.Fatal("关掉之后不该再把它当成可能要字级的来源（否则 Match 还会为它多抓一次）")
	}
}

func TestAggregatorInvalidatesOnlyWhenValueChanges(t *testing.T) {
	stub := &toggleStub{name: "stub", on: true}
	a := NewAggregator(stub)

	// 第一次同步（值从「未知」变成 true）：不该清缓存，只是记录下来。
	a.setCache("k", Result{LRC: "[00:01.00]行级"})
	a.SetWordLevelEnabled(true)
	if _, ok := a.cache["k"]; !ok {
		t.Fatal("首次同步不该清缓存（调用点每次都会同步，无条件清等于没有缓存）")
	}

	// 重复同一个值：仍然不该清。
	a.SetWordLevelEnabled(true)
	if _, ok := a.cache["k"]; !ok {
		t.Fatal("值没变时不该清缓存")
	}

	// 真的变了：必须清 —— 否则关掉开关之后，缓存里那份逐字歌词还会继续生效 24h。
	a.SetWordLevelEnabled(false)
	if len(a.cache) != 0 {
		t.Fatal("开关值变化时必须清掉匹配结果缓存")
	}
}

func TestAggregatorInvalidateClearsBothCaches(t *testing.T) {
	a := NewAggregator(&toggleStub{name: "stub", on: true})
	a.setCache("k", Result{LRC: "x"})
	a.setFetched("stub:1", Result{LRC: "y"})

	a.Invalidate()
	if len(a.cache) != 0 || len(a.fetched) != 0 {
		t.Fatalf("Invalidate 应当同时清掉两级缓存，实际 cache=%d fetched=%d", len(a.cache), len(a.fetched))
	}
}

/* --------------------------------------------------------------------------
   2. 酷狗：关掉之后不再要 KRC
   -------------------------------------------------------------------------- */

func TestKugouWordLevelOffRequestsOnlyLRC(t *testing.T) {
	var formats []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/search":
			io.WriteString(w, `{"status":200,"candidates":[{"id":"1","accesskey":"AK","duration":1000}]}`)
		case "/download":
			formats = append(formats, r.URL.Query().Get("fmt"))
			if r.URL.Query().Get("fmt") == "krc" {
				t.Error("关掉字级歌词后不该再请求 KRC（那是第三方私有编码）")
			}
			io.WriteString(w, `{"status":200,"fmt":"lrc","content":"`+
				base64.StdEncoding.EncodeToString([]byte("[00:01.00]行级那份\n"))+`"}`)
		default:
			t.Errorf("多余的请求: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	p := &kugouProvider{searchURL: srv.URL, lookupURL: srv.URL + "/search", downloadURL: srv.URL + "/download"}
	if p.HasWordLevel() != true {
		t.Fatal("零值应当是「要字级」，否则会静默改变既有调用方的行为")
	}
	p.SetWordLevelEnabled(false)
	if p.HasWordLevel() {
		t.Fatal("关掉之后 HasWordLevel 应当为 false")
	}

	res, err := p.Fetch(context.Background(), Candidate{Provider: "kugou", ID: "HASH_10"})
	if err != nil {
		t.Fatalf("Fetch 失败: %v", err)
	}
	if strings.TrimSpace(res.LRC) != "[00:01.00]行级那份" {
		t.Fatalf("应当拿到行级歌词，实际 %q", res.LRC)
	}
	if len(formats) != 1 || formats[0] != "lrc" {
		t.Fatalf("只应当请求一次 lrc，实际 %v", formats)
	}
}

/* --------------------------------------------------------------------------
   3. QQ：关掉之后既不要逐字、也不要密文
   -------------------------------------------------------------------------- */

// qqPlainServer 返回明文行级歌词（crypt=0 时接口就该回明文）。
// 它同时断言请求里 qrc=0 且 crypt=0。
func qqPlainServer(t *testing.T, hits *int, lastParam *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*hits++
		body, _ := io.ReadAll(r.Body)
		var probe struct {
			Req struct {
				Param map[string]any `json:"param"`
			} `json:"req"`
		}
		_ = json.Unmarshal(body, &probe)
		*lastParam = probe.Req.Param
		io.WriteString(w, `{"code":0,"req":{"code":0,"data":{"qrc":0,"crypt":0,"lyric":`+
			`"<?xml version=\"1.0\"?><QrcInfos><LyricInfo><Lyric_1 LyricContent=\"[00:01.00]明文行级\"/>`+
			`</LyricInfo></QrcInfos>"}}}`)
	}))
}

func TestQQWordLevelOffAsksForPlainLineOnly(t *testing.T) {
	hits := 0
	var param map[string]any
	srv := qqPlainServer(t, &hits, &param)
	defer srv.Close()

	p := &qqProvider{baseURL: srv.URL, musicuURL: srv.URL + "/musicu"}
	p.SetWordLevelEnabled(false)

	res, err := p.Fetch(context.Background(), Candidate{ID: "mid", Provider: "qq"})
	if err != nil {
		t.Fatalf("Fetch 失败: %v", err)
	}
	if !strings.Contains(res.LRC, "明文行级") {
		t.Fatalf("应当直接拿到明文歌词，实际 %q", res.LRC)
	}
	if hits != 1 {
		t.Fatalf("关掉字级后只该发一次请求（不试 qrc、不试密文），实际 %d 次", hits)
	}
	if qqInt(param["qrc"]) != 0 {
		t.Fatalf("不该请求逐字歌词，实际 qrc=%v", param["qrc"])
	}
	if qqInt(param["crypt"]) != 0 {
		t.Fatalf("不该要密文（要了就得解密第三方私有编码），实际 crypt=%v", param["crypt"])
	}
}

// 开启时（默认）仍然先要逐字 —— 开关不能反过来把默认行为改掉。
func TestQQWordLevelOnStillAsksForQRC(t *testing.T) {
	var param map[string]any
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		body, _ := io.ReadAll(r.Body)
		var probe struct {
			Req struct {
				Param map[string]any `json:"param"`
			} `json:"req"`
		}
		_ = json.Unmarshal(body, &probe)
		// 只记**第一次**请求的参数：后面还会退到行级与老 cgi，覆盖掉就测不到「先要逐字」了。
		if param == nil && probe.Req.Param != nil {
			param = probe.Req.Param
		}
		io.WriteString(w, `{"code":0,"req":{"code":0,"data":{"qrc":0,"crypt":1,"lyric":""}}}`)
	}))
	defer srv.Close()

	p := &qqProvider{baseURL: srv.URL, musicuURL: srv.URL + "/musicu"}
	if !p.HasWordLevel() {
		t.Fatal("零值应当是「要字级」")
	}
	// 第一次（逐字）拿不到 → 会再试行级；这里只关心第一次请求的参数。
	_, _ = p.Fetch(context.Background(), Candidate{ID: "mid", Provider: "qq"})
	if qqInt(param["qrc"]) != 1 {
		t.Fatalf("默认应当先请求逐字歌词，实际 qrc=%v", param["qrc"])
	}
	if qqInt(param["crypt"]) != 1 {
		t.Fatalf("逐字那次本来就带密文，实际 crypt=%v", param["crypt"])
	}
	if hits == 0 {
		t.Fatal("应当至少发过一次请求")
	}
}
