package lyricsfetch

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"localmusicplayer/internal/lyrics"
)

/* --------------------------------------------------------------------------
   酷狗来源：能匿名拿到字级歌词的那个（另一个是 QQ 的 QRC）
   --------------------------------------------------------------------------
   这个来源有两个容易写错的地方，两条都有测试守着：

     · 反查 KRC 必须带 hash（只给关键词时 song/singer 会跟着关键词顺序漂移，
       实测把歌名与歌手写反）——候选 ID 里存的必须是 hash 与时长；
     · KRC 是「base64 → 去 "krc1" 头 → 异或 → zlib」的二进制，解错了就是
       一堆乱码，而乱码会当成歌词文本一路走进缓存。
   -------------------------------------------------------------------------- */

// encodeKRC 造一份真的 KRC（与解码相反的步骤），用来验证 decodeKRC。
func encodeKRC(t *testing.T, text string) string {
	t.Helper()
	var buf bytes.Buffer
	zw := zlib.NewWriter(&buf)
	if _, err := zw.Write([]byte(text)); err != nil {
		t.Fatalf("zlib 写入失败: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zlib 关闭失败: %v", err)
	}
	body := buf.Bytes()
	for i := range body {
		body[i] ^= krcKey[i%len(krcKey)]
	}
	return base64.StdEncoding.EncodeToString(append([]byte("krc1"), body...))
}

const kugouSampleKRC = "[id:0]\n[ar:周杰伦]\n[ti:晴天]\n[53795,3069]<0,897,0>随<897,431,0>记<1328,132,0>忆\n"

// 搜索：解析 lists、把秒换成毫秒、ID 里带 hash 与时长。
func TestKugouSearchParsesItems(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/song_search_v2" {
			t.Errorf("路径不对: %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("keyword"); got != "晴天 周杰伦" {
			t.Errorf("关键词不对: %q", got)
		}
		io.WriteString(w, `{"status":1,"data":{"lists":[
			{"SongName":"晴天","SingerName":"周杰伦","AlbumName":"叶惠美","Duration":269,"FileHash":"B3A52A7A958BF0AED0EBFBA2E9A818B7"},
			{"SongName":"没有 hash 的条目","SingerName":"x","Duration":100,"FileHash":""}
		]}}`)
	}))
	defer srv.Close()

	p := &kugouProvider{searchURL: srv.URL + "/song_search_v2", lookupURL: srv.URL, downloadURL: srv.URL}
	items, err := p.Search(context.Background(), SearchRequest{Keyword: "晴天 周杰伦"})
	if err != nil {
		t.Fatalf("Search 失败: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("没有 hash 的条目应当被丢掉，实际 %d 条", len(items))
	}
	got := items[0]
	if got.Provider != "kugou" || got.Title != "晴天" || got.Artist != "周杰伦" {
		t.Fatalf("候选字段不对: %+v", got)
	}
	if got.Duration != 269000 {
		t.Fatalf("时长应当是毫秒（269 → 269000），实际 %d", got.Duration)
	}
	if got.ID != "B3A52A7A958BF0AED0EBFBA2E9A818B7_269" {
		t.Fatalf("候选 ID 应当带 hash 与时长，实际 %q", got.ID)
	}
}

// 候选 ID 的解析：hash + 秒，缺时长时也要能用。
func TestKugouParseID(t *testing.T) {
	if ref := parseKugouID("ABC_269"); ref.hash != "ABC" || ref.seconds != 269 {
		t.Fatalf("解析结果不对: %+v", ref)
	}
	if ref := parseKugouID("ABC"); ref.hash != "ABC" || ref.seconds != 0 {
		t.Fatalf("没有时长时 hash 仍要解出来: %+v", ref)
	}
}

// KRC 解码（含 zlib 往返）—— 解错就会把乱码当歌词。
func TestKugouDecodeKRC(t *testing.T) {
	got, err := decodeKRC(encodeKRC(t, kugouSampleKRC))
	if err != nil {
		t.Fatalf("decodeKRC 失败: %v", err)
	}
	if got != kugouSampleKRC {
		t.Fatalf("解码结果不一致:\n%q\n%q", got, kugouSampleKRC)
	}
	if !lyrics.HasWordTiming(got) {
		t.Fatal("解出来的 KRC 应当被判成字级歌词")
	}
	if _, err := decodeKRC(base64.StdEncoding.EncodeToString([]byte("nope"))); err == nil {
		t.Fatal("头部不是 krc1 时应当报错")
	}
}

// 有 KRC 时取 KRC（字级），并且反查请求要带上 hash。
//
// 注意这里的 status：**歌词接口（krcs / download）真实回的是 200**，而搜索接口
// 回的是 1。假响应照抄真实形状才有意义 —— 只用自己顺手写的 1 做单测，
// 「只认 1」这种错就永远抓不到（真实网络回归 live_kugou_test.go 抓到过一次）。
func TestKugouFetchPrefersKRC(t *testing.T) {
	var sawHash string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/search":
			sawHash = r.URL.Query().Get("hash")
			io.WriteString(w, `{"status":200,"candidates":[{"id":"274944371","accesskey":"AK","duration":269792,"song":"晴天","singer":"周杰伦"}]}`)
		case "/download":
			if r.URL.Query().Get("fmt") != "krc" {
				t.Errorf("应当先要 krc，实际 %s", r.URL.Query().Get("fmt"))
			}
			io.WriteString(w, `{"status":200,"fmt":"krc","content":"`+encodeKRC(t, kugouSampleKRC)+`"}`)
		default:
			t.Errorf("多余的请求: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	p := &kugouProvider{searchURL: srv.URL, lookupURL: srv.URL + "/search", downloadURL: srv.URL + "/download"}
	res, err := p.Fetch(context.Background(), Candidate{Provider: "kugou", ID: "B3A52A7A958BF0AED0EBFBA2E9A818B7_269"})
	if err != nil {
		t.Fatalf("Fetch 失败: %v", err)
	}
	if res.LRC != kugouSampleKRC {
		t.Fatalf("应拿到解开的 KRC，实际 %q", res.LRC)
	}
	if FormatOf(res.LRC) != FormatWord {
		t.Fatalf("KRC 应当被判成字级，实际 %s", FormatOf(res.LRC))
	}
	if sawHash != "B3A52A7A958BF0AED0EBFBA2E9A818B7" {
		t.Fatalf("反查必须带上 hash，实际 %q", sawHash)
	}
}

// 没有 KRC（酷狗很多歌都没有）时回落到行级 LRC，而不是报错。
func TestKugouFetchFallsBackToLineLevel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/search":
			io.WriteString(w, `{"status":200,"candidates":[{"id":"1","accesskey":"AK","duration":1000}]}`)
		case "/download":
			if r.URL.Query().Get("fmt") == "krc" {
				io.WriteString(w, `{"status":0,"fmt":"krc","content":""}`)
				return
			}
			io.WriteString(w, `{"status":200,"fmt":"lrc","content":"`+base64.StdEncoding.EncodeToString([]byte("[00:01.00]行级那份\n"))+`"}`)
		default:
			t.Errorf("多余的请求: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	p := &kugouProvider{searchURL: srv.URL, lookupURL: srv.URL + "/search", downloadURL: srv.URL + "/download"}
	res, err := p.Fetch(context.Background(), Candidate{Provider: "kugou", ID: "HASH_10"})
	if err != nil {
		t.Fatalf("KRC 缺失时应当回落到 LRC，实际报错 %v", err)
	}
	if strings.TrimSpace(res.LRC) != "[00:01.00]行级那份" {
		t.Fatalf("行级歌词不对: %q", res.LRC)
	}
	if FormatOf(res.LRC) != FormatLine {
		t.Fatalf("这份应当被判成行级，实际 %s", FormatOf(res.LRC))
	}
}

// 候选里带了 raw（搜索阶段的原始条目）时，用它补 hash 与时长。
// 这一条刻意用 status=1（搜索接口那套写法）：两套 status 都要认。
func TestKugouFetchUsesRawItem(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/search":
			if r.URL.Query().Get("hash") != "RAWHASH" {
				t.Errorf("应当用 raw 里的 hash，实际 %q", r.URL.Query().Get("hash"))
			}
			if r.URL.Query().Get("duration") != "200" {
				t.Errorf("应当用 raw 里的秒数，实际 %q", r.URL.Query().Get("duration"))
			}
			io.WriteString(w, `{"status":1,"candidates":[{"id":"1","accesskey":"AK"}]}`)
		case "/download":
			io.WriteString(w, `{"status":1,"fmt":"lrc","content":"`+base64.StdEncoding.EncodeToString([]byte("[00:01.00]x"))+`"}`)
		}
	}))
	defer srv.Close()

	p := &kugouProvider{searchURL: srv.URL, lookupURL: srv.URL + "/search", downloadURL: srv.URL + "/download"}
	_, err := p.Fetch(context.Background(), Candidate{
		Provider: "kugou",
		ID:       "ignored",
		raw:      kugouItem{FileHash: "RAWHASH", Duration: 200},
	})
	if err != nil {
		t.Fatalf("Fetch 失败: %v", err)
	}
}

// 两套 status 都要认：搜索回 1、歌词回 200。
func TestKugouAcceptsBothStatusShapes(t *testing.T) {
	for _, ok := range []int{1, 200} {
		if !kugouOK(ok) {
			t.Fatalf("status=%d 应当算成功", ok)
		}
	}
	for _, bad := range []int{0, 404, 301} {
		if kugouOK(bad) {
			t.Fatalf("status=%d 不该算成功", bad)
		}
	}
}

// 声明了字级能力：Match 靠它决定「拿到行级之后还要不要再试一次」。
func TestKugouDeclaresWordLevel(t *testing.T) {
	p, ok := NewKugou().(WordProvider)
	if !ok {
		t.Fatal("酷狗应当实现 WordProvider（否则自动匹配不会为逐字多试一次）")
	}
	if !p.HasWordLevel() {
		t.Fatal("酷狗的 HasWordLevel 应当是 true")
	}
	if Name := NewKugou().Name(); Name != "kugou" {
		t.Fatalf("来源 id 应当是 kugou，实际 %q", Name)
	}
}
