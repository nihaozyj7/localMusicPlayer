package bilibili

/* ==========================================================================
   request_test.go — 请求装配的离线测试（第六轮审查 N-8）
   --------------------------------------------------------------------------
   这个包两百多行请求装配逻辑（拼 URL、带 cookie/UA、WBI 签名、先 WBI 后旧
   接口的降级重试、各错误分支）长期**零测试**，原因不是没人写，而是写不了：
   接口根地址是包内常量且被直接拼进 URL，没法指向 httptest。

   N-8 把 `Client.BaseURL` 改成可替换字段（空则回落默认值）之后，这里用假服务
   器覆盖真实装配过程：请求长什么样、签名吃进去哪些参数、失败时走哪条分支。

   全程离线：`httptest` 只监听 127.0.0.1，不发任何真实请求。
   ========================================================================== */

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strings"
	"sync"
	"testing"
)

const (
	fakeImgURL = "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png"
	fakeSubURL = "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png"
	navJSON    = `{"code":0,"data":{"wbi_img":{"img_url":"` + fakeImgURL + `","sub_url":"` + fakeSubURL + `"}}}`
)

// fakeAPI 记账用的假接口服务器：记下每个请求的路径与原始查询串。
type fakeAPI struct {
	*httptest.Server

	mu       sync.Mutex
	requests []*http.Request
	queries  []string
}

// newFakeAPI 起一个假接口服务器。handler 为 nil 时所有路径都返回 navJSON。
func newFakeAPI(t *testing.T, handler http.HandlerFunc) *fakeAPI {
	t.Helper()
	f := &fakeAPI{}
	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.requests = append(f.requests, r.Clone(context.Background()))
		f.queries = append(f.queries, r.URL.RawQuery)
		f.mu.Unlock()
		if handler == nil {
			_, _ = w.Write([]byte(navJSON))
			return
		}
		handler(w, r)
	}))
	t.Cleanup(f.Close)
	return f
}

// newFakeClient 造一个指向假服务器的客户端（生产装配之外唯一的用法差异）。
func newFakeClient(f *fakeAPI) *Client {
	c := NewClient()
	c.BaseURL = f.URL
	return c
}

func (f *fakeAPI) paths() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, 0, len(f.requests))
	for _, r := range f.requests {
		out = append(out, r.URL.Path)
	}
	return out
}

func (f *fakeAPI) lastQuery() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.queries) == 0 {
		return ""
	}
	return f.queries[len(f.queries)-1]
}

func (f *fakeAPI) firstRequestTo(path string) *http.Request {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, r := range f.requests {
		if r.URL.Path == path {
			return r
		}
	}
	return nil
}

/* ---------------------------------------------------------------- 搜索装配 */

// ★ N-8 的主用例：搜索请求必须带上正确的路径、参数、请求头与 WBI 签名，
// 并且把响应整理成 Track。
func TestSearchAssemblesRequest(t *testing.T) {
	const searchJSON = `{"code":0,"data":{"page":1,"page_size":20,"total":1,"numPages":1,"result":[
		{"type":"video","id":1,"author":"某UP","title":"<em class=\"keyword\">夜曲</em> 钢琴版","pic":"//i0.hdslb.com/x.jpg",
		 "description":"描述 <b>加粗</b>","play":1234,"duration":"03:24","pubdate":1700000000,"bvid":"BV1xx411c7mD","aid":99}
	]}}`
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/x/web-interface/wbi/search/type" {
			_, _ = w.Write([]byte(searchJSON))
			return
		}
		_, _ = w.Write([]byte(navJSON))
	})

	res, err := newFakeClient(f).Search(context.Background(), "夜曲 钢琴", 2, 30)
	if err != nil {
		t.Fatalf("搜索失败: %v", err)
	}

	// 先取 WBI 密钥、再搜
	if got := f.paths(); len(got) != 2 || got[0] != "/x/web-interface/nav" || got[1] != "/x/web-interface/wbi/search/type" {
		t.Fatalf("请求路径 = %v，期望先 nav 再搜索", got)
	}

	req := f.firstRequestTo("/x/web-interface/wbi/search/type")
	if req == nil {
		t.Fatal("没有发出搜索请求")
	}
	q := req.URL.Query()
	for k, want := range map[string]string{
		"search_type":  "video",
		"keyword":      "夜曲 钢琴",
		"page":         "2",
		"page_size":    "30",
		"order":        "totalrank",
		"platform":     "pc",
		"web_location": "1430650",
	} {
		if got := q.Get(k); got != want {
			t.Errorf("查询参数 %s = %q，期望 %q", k, got, want)
		}
	}
	// 签名：wts 是时间戳、w_rid 是 32 位十六进制
	if q.Get("wts") == "" {
		t.Error("缺少 wts —— 没走 WBI 签名")
	}
	if len(q.Get("w_rid")) != 32 {
		t.Errorf("w_rid = %q，期望 32 位十六进制", q.Get("w_rid"))
	}
	// 独立复算 w_rid：验证「签名吃进去的参数集合」就是请求里带的那一批
	//（顺序、编码、wts 都参与），而不是只检查「有没有 w_rid 这个字段」。
	wantRid := expectedWRID(q, getMixinKey(pathBaseNoExt(fakeImgURL)+pathBaseNoExt(fakeSubURL)))
	if got := q.Get("w_rid"); got != wantRid {
		t.Errorf("w_rid = %q，独立复算 = %q —— 签名与请求参数不一致", got, wantRid)
	}

	// 请求头：少了 UA / Referer / Cookie 会被接口拒（搜不到，且无任何症状）
	if req.Header.Get("User-Agent") != desktopUA {
		t.Errorf("User-Agent = %q", req.Header.Get("User-Agent"))
	}
	if req.Header.Get("Referer") != "https://www.bilibili.com/" {
		t.Errorf("Referer = %q", req.Header.Get("Referer"))
	}
	if req.Header.Get("Origin") != "https://www.bilibili.com" {
		t.Errorf("Origin = %q", req.Header.Get("Origin"))
	}
	cookie := req.Header.Get("Cookie")
	if !strings.Contains(cookie, "buvid3=") || !strings.Contains(cookie, "b_nut=") {
		t.Errorf("Cookie = %q，缺少 buvid3 或 b_nut", cookie)
	}

	// 响应整理
	if res.Page != 1 || res.PageSize != 20 || res.Total != 1 || len(res.Tracks) != 1 {
		t.Fatalf("搜索结果 = %+v", res)
	}
	tr := res.Tracks[0]
	if tr.ID != "bili:BV1xx411c7mD" || tr.BVID != "BV1xx411c7mD" || tr.Source != "bilibili" {
		t.Errorf("Track 标识 = %+v", tr)
	}
	if tr.Title != "夜曲 钢琴版" {
		t.Errorf("标题未清洗 HTML 标签/实体: %q", tr.Title)
	}
	if tr.Cover != "https://i0.hdslb.com/x.jpg" {
		t.Errorf("封面未补 https: %q", tr.Cover)
	}
	if tr.Duration != 204000 {
		t.Errorf("时长 = %d 毫秒，期望 204000（03:24）", tr.Duration)
	}
	if tr.Description != "描述 加粗" {
		t.Errorf("描述未清洗: %q", tr.Description)
	}
	if !tr.Online || tr.Ext != "m4a" {
		t.Errorf("Track 在线标记/扩展名 = %+v", tr)
	}
}

// 关键词为空、分页越界都不该发请求（参数规范化在装配之前完成）。
func TestSearchValidatesInputBeforeRequesting(t *testing.T) {
	f := newFakeAPI(t, nil)
	c := newFakeClient(f)

	if _, err := c.Search(context.Background(), "   ", 1, 20); err == nil {
		t.Error("空关键词应当报错")
	}
	if got := f.paths(); len(got) != 0 {
		t.Fatalf("空关键词不该发请求，实际 %v", got)
	}

	// page<=0 / page_size>50 会被规范化（这条走完请求，检查参数）
	f2 := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/x/web-interface/wbi/search/type" {
			_, _ = w.Write([]byte(`{"code":0,"data":{"result":[]}}`))
			return
		}
		_, _ = w.Write([]byte(navJSON))
	})
	if _, err := newFakeClient(f2).Search(context.Background(), "x", 0, 999); err != nil {
		t.Fatalf("搜索失败: %v", err)
	}
	q := mustQuery(t, f2.lastQuery())
	if q.Get("page") != "1" || q.Get("page_size") != "50" {
		t.Errorf("参数未规范化: page=%s page_size=%s", q.Get("page"), q.Get("page_size"))
	}
}

// 接口返回 code != 0 时要如实报出来（这是最常见的失败形态）。
func TestSearchReportsAPICode(t *testing.T) {
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/x/web-interface/wbi/search/type" {
			_, _ = w.Write([]byte(`{"code":-412,"message":"请求被拦截"}`))
			return
		}
		_, _ = w.Write([]byte(navJSON))
	})
	_, err := newFakeClient(f).Search(context.Background(), "x", 1, 20)
	if err == nil || !strings.Contains(err.Error(), "-412") || !strings.Contains(err.Error(), "请求被拦截") {
		t.Fatalf("错误信息 = %v，期望带上 code 与 message", err)
	}
}

/* ------------------------------------------------------------ WBI / 错误分支 */

// nav 没给出 wbi_img 时必须报错，而不是拿着空密钥去签名（症状会是接口 -403）。
func TestEnsureWBIrejectsMissingKeys(t *testing.T) {
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":0,"data":{"wbi_img":{"img_url":"","sub_url":""}}}`))
	})
	_, err := newFakeClient(f).Search(context.Background(), "x", 1, 20)
	if err == nil || !strings.Contains(err.Error(), "wbi_img") {
		t.Fatalf("错误 = %v，期望指出 nav 没返回 wbi_img", err)
	}
}

// WBI 密钥缓存：12 小时内只取一次 nav（登录态接口被频繁调用会被风控）。
func TestEnsureWBICachesKeys(t *testing.T) {
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/x/web-interface/wbi/search/type" {
			_, _ = w.Write([]byte(`{"code":0,"data":{"result":[]}}`))
			return
		}
		_, _ = w.Write([]byte(navJSON))
	})
	c := newFakeClient(f)
	for i := 0; i < 3; i++ {
		if _, err := c.Search(context.Background(), "x", 1, 20); err != nil {
			t.Fatalf("第 %d 次搜索失败: %v", i+1, err)
		}
	}
	navCalls := 0
	for _, p := range f.paths() {
		if p == "/x/web-interface/nav" {
			navCalls++
		}
	}
	if navCalls != 1 {
		t.Errorf("nav 被调用了 %d 次，期望 1 次（密钥应缓存 12 小时）", navCalls)
	}
}

// HTTP 状态码非 200：错误里要带状态码与响应体摘要（且摘要要有长度上限）。
func TestGetJSONErrorBranches(t *testing.T) {
	longBody := strings.Repeat("啊", 900) // 每字 3 字节，远超 512 字节上限
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/x/web-interface/view" {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(longBody))
			return
		}
		_, _ = w.Write([]byte(navJSON))
	})
	_, err := newFakeClient(f).View(context.Background(), "BV1")
	if err == nil {
		t.Fatal("HTTP 500 应当报错")
	}
	msg := err.Error()
	if !strings.Contains(msg, "HTTP 500") {
		t.Errorf("错误信息 = %q，期望带状态码", msg)
	}
	if !strings.HasSuffix(msg, "…") {
		t.Errorf("超长响应体应被截断并以省略号结尾: %q", msg)
	}
	if len([]rune(msg)) > maxErrBody+64 {
		t.Errorf("错误信息过长（%d 字节）—— 截断失效，整段响应体会进日志与界面", len(msg))
	}
	// 截断后不能把 UTF-8 码点劈开（否则错误信息里是乱码）
	if !strings.Contains(msg, "啊") || strings.ContainsRune(msg, '\uFFFD') {
		t.Errorf("截断劈开了 UTF-8 码点: %q", msg)
	}

	// 200 但不是 JSON
	f2 := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/x/web-interface/view" {
			_, _ = w.Write([]byte("<html>坏网关</html>"))
			return
		}
		_, _ = w.Write([]byte(navJSON))
	})
	if _, err := newFakeClient(f2).View(context.Background(), "BV1"); err == nil ||
		!strings.Contains(err.Error(), "解析 JSON 失败") {
		t.Errorf("非 JSON 响应的错误 = %v，期望「解析 JSON 失败」", err)
	}
}

// 连不上（服务器已关）时错误要标明是「请求失败」，而不是当成业务错误。
func TestGetJSONConnectionFailure(t *testing.T) {
	f := newFakeAPI(t, nil)
	c := newFakeClient(f)
	f.Close() // 立刻关掉：端口不再有人监听

	_, err := c.View(context.Background(), "BV1")
	if err == nil || !strings.Contains(err.Error(), "请求失败") {
		t.Fatalf("错误 = %v，期望「bilibili: 请求失败: …」", err)
	}
}

// 已取消的 context 不该被当成「接口没数据」—— 必须原样失败。
func TestSearchHonoursContextCancellation(t *testing.T) {
	f := newFakeAPI(t, nil)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := newFakeClient(f).Search(ctx, "x", 1, 20); err == nil {
		t.Fatal("已取消的 context 应当报错")
	}
}

/* ------------------------------------------------------------ 播放地址降级 */

// ★ 第二个 N-8 主用例：WBI 接口失败时**必须回退旧接口**，并用带宽最高的
// DASH 音轨（选错音轨 = 音质变差，且没有任何提示）。
func TestResolveAudioFallsBackToLegacyEndpoint(t *testing.T) {
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/x/web-interface/view":
			_, _ = w.Write([]byte(`{"code":0,"data":{"bvid":"BV1","aid":9,"cid":77,"duration":204,
				"title":"<em>夜曲</em>","pic":"//i0.hdslb.com/p.jpg","owner":{"name":"某UP"}}}`))
		case "/x/player/wbi/playurl":
			// 旧版签名接口挂了（真实世界里很常见）
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("boom"))
		case "/x/player/playurl":
			_, _ = w.Write([]byte(`{"code":0,"data":{"dash":{"audio":[
				{"baseUrl":"https://a.hdslb.com/low.m4s","bandwidth":64000,"mimeType":"audio/mp4","codecs":"mp4a.40.5"},
				{"base_url":"https://a.hdslb.com/high.m4s","backup_url":["https://b.hdslb.com/high.m4s"],
				 "bandwidth":256000,"mime_type":"audio/mp4","codecs":"mp4a.40.2"}
			]}}}`))
		default:
			_, _ = w.Write([]byte(navJSON))
		}
	})

	st, err := newFakeClient(f).ResolveAudio(context.Background(), "BV1")
	if err != nil {
		t.Fatalf("解析播放地址失败（降级没生效）: %v", err)
	}
	// 先 view；第一次带 WBI 的尝试会先取密钥（nav）；wbi 接口 500 之后回退旧接口
	got := f.paths()
	want := []string{"/x/web-interface/view", "/x/web-interface/nav", "/x/player/wbi/playurl", "/x/player/playurl"}
	if len(got) != len(want) {
		t.Fatalf("请求路径 = %v，期望 %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("请求路径 = %v，期望 %v", got, want)
		}
	}
	if st.URL != "https://a.hdslb.com/high.m4s" {
		t.Errorf("选中的音轨 = %q，期望带宽最高的那一条", st.URL)
	}
	if len(st.BackupURLs) != 1 || st.BackupURLs[0] != "https://b.hdslb.com/high.m4s" {
		t.Errorf("备用地址 = %v", st.BackupURLs)
	}
	if st.Bandwidth != 256000 || st.MimeType != "audio/mp4" {
		t.Errorf("音轨参数 = %+v", st)
	}
	if st.Title != "夜曲" || st.Cover != "https://i0.hdslb.com/p.jpg" || st.Artist != "某UP" {
		t.Errorf("视频信息未清洗/未规范化: %+v", st)
	}
	if st.Duration != 204000 || st.Ext != "m4a" || st.CID != 77 || st.AID != 9 {
		t.Errorf("时长/扩展名/标识 = %+v", st)
	}
}

// 两个接口都不给音频流时，错误要指出「没有可用的音频流」（而不是返回空 URL）。
func TestResolveAudioWithoutStream(t *testing.T) {
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/x/web-interface/view" {
			_, _ = w.Write([]byte(`{"code":0,"data":{"bvid":"BV1","cid":77,"duration":1}}`))
			return
		}
		if strings.HasPrefix(r.URL.Path, "/x/player") {
			_, _ = w.Write([]byte(`{"code":0,"data":{}}`))
			return
		}
		_, _ = w.Write([]byte(navJSON))
	})
	_, err := newFakeClient(f).ResolveAudio(context.Background(), "BV1")
	if err == nil || !strings.Contains(err.Error(), "没有返回可用的音频流") {
		t.Fatalf("错误 = %v", err)
	}
}

// 视频没有 cid（投稿被删/仅剩封面）时要在 view 这一步就停下并说明原因。
func TestViewRequiresCID(t *testing.T) {
	f := newFakeAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/x/web-interface/view" {
			_, _ = w.Write([]byte(`{"code":0,"data":{"bvid":"BV1","duration":1}}`))
			return
		}
		_, _ = w.Write([]byte(navJSON))
	})
	_, err := newFakeClient(f).View(context.Background(), "BV1")
	if err == nil || !strings.Contains(err.Error(), "没有可用 cid") {
		t.Fatalf("错误 = %v", err)
	}
}

/* -------------------------------------------------------------------- 工具 */

// expectedWRID 用**独立写法**复算签名（排序、逐个编码、拼 mixinKey 后取 md5）。
// 与实现共用 getMixinKey / encodeURIComponent / filterWbiValue 这三个已单独
// 用官方示例与 Node 输出验证过的纯函数，但拼装过程在测试里重写一遍 ——
// 守的是「签名吃进去的参数集合与顺序就是请求里带的那一批」。
func expectedWRID(q map[string][]string, mixinKey string) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		if k == "w_rid" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var sb strings.Builder
	for i, k := range keys {
		if i > 0 {
			sb.WriteByte('&')
		}
		sb.WriteString(encodeURIComponent(k))
		sb.WriteByte('=')
		sb.WriteString(encodeURIComponent(filterWbiValue(q[k][0])))
	}
	sum := md5.Sum([]byte(sb.String() + mixinKey))
	return hex.EncodeToString(sum[:])
}

func mustQuery(t *testing.T, rawQuery string) url.Values {
	t.Helper()
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		t.Fatalf("查询串 %q 解析失败: %v", rawQuery, err)
	}
	return values
}
