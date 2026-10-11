package packstore

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

/* ==========================================================================
   packstore 的单测
   --------------------------------------------------------------------------
   重点不在「顺利路径能装上」，而在三件会静默出错的事：
     1. 清单里的路径跑到安装目录之外（`../` / 绝对路径 / 盘符）；
     2. 某个文件校验失败，却在目标目录里留下半个包；
     3. 联网失败时把「缓存」当成「仓库里就这些」报给用户。
   这三条一旦漏掉，用户看到的现象分别是「文件被写到别处」「装上了但起不来」
   「明明有主题却显示没有」，都不会在开发机上自然复现。
   ========================================================================== */

// chAuto 是测试里统一使用的通道：这些用例都指向本地服务器，
// 代理分支由 TestCandidatesSkipsMirrorsForNonGitHubHosts 单独覆盖。
const chAuto = "auto"

func sum(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

// tracker 统计实际打进来的请求，用来证明「内存缓存真的省掉了网络」。
type tracker struct {
	hits atomic.Int64
}

// newServer 起一个只服务给定文件的静态服务器。
func newServer(t *testing.T, files map[string][]byte, tr *tracker) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if tr != nil {
			tr.hits.Add(1)
		}
		body, ok := files[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// themeCatalog 拼一份主题清单，内容与 files 对得上。
func themeCatalog(t *testing.T, name string, css []byte) []byte {
	t.Helper()
	doc := map[string]any{
		"spec": 1,
		"kind": "theme",
		"items": []map[string]any{{
			"id":          strings.TrimSuffix(name, ".css"),
			"name":        "测试主题",
			"version":     "1.0.0",
			"mode":        "dark",
			"swatch":      []string{"#111111", "#222222"},
			"files":       []map[string]any{{"path": name, "size": len(css), "sha256": sum(css)}},
			"description": "用来跑测试的主题",
		}},
	}
	raw, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("拼清单失败：%v", err)
	}
	return raw
}

const testCSS = `/* @theme-name 测试主题 */
:root[data-theme="packtest"] { color-scheme: dark; --bg-app: #000; }
`

/* --------------------------------------------------------------------------
   清单校验
   -------------------------------------------------------------------------- */

func TestParseCatalogAcceptsValid(t *testing.T) {
	raw := themeCatalog(t, "packtest.css", []byte(testCSS))
	doc, err := ParseCatalog(raw, KindTheme)
	if err != nil {
		t.Fatalf("合法清单被拒：%v", err)
	}
	if len(doc.Items) != 1 || doc.Items[0].ID != "packtest" {
		t.Fatalf("解析结果不对：%+v", doc.Items)
	}
}

func TestParseCatalogRejects(t *testing.T) {
	base := func(mutate func(map[string]any)) []byte {
		doc := map[string]any{
			"spec": 1,
			"kind": "theme",
			"items": []map[string]any{{
				"id":    "ok",
				"name":  "ok",
				"files": []map[string]any{{"path": "ok.css", "size": 3, "sha256": sum([]byte("abc"))}},
			}},
		}
		mutate(doc)
		raw, _ := json.Marshal(doc)
		return raw
	}
	item := func(mutate func(map[string]any)) func(map[string]any) {
		return func(doc map[string]any) {
			items := doc["items"].([]map[string]any)
			mutate(items[0])
		}
	}

	cases := []struct {
		name string
		raw  []byte
		want string
	}{
		{"不是 JSON", []byte("{"), "合法 JSON"},
		{"版本不支持", base(func(d map[string]any) { d["spec"] = 99 }), "不受支持"},
		{"类型不符", base(func(d map[string]any) { d["kind"] = "style" }), "不一致"},
		{"缺少 id", base(item(func(it map[string]any) { it["id"] = "" })), "缺少 id"},
		{"id 带斜杠", base(item(func(it map[string]any) { it["id"] = "a/b" })), "id 不合法"},
		{"id 是上级目录", base(item(func(it map[string]any) { it["id"] = ".." })), "id 不合法"},
		{"没有文件", base(item(func(it map[string]any) { it["files"] = []map[string]any{} })), "没有任何文件"},
		{
			"路径逃逸",
			base(item(func(it map[string]any) {
				it["files"] = []map[string]any{{"path": "../evil.css", "size": 1, "sha256": strings.Repeat("a", 64)}}
			})),
			"路径不合法",
		},
		{
			"绝对路径",
			base(item(func(it map[string]any) {
				it["files"] = []map[string]any{{"path": "/etc/passwd", "size": 1, "sha256": strings.Repeat("a", 64)}}
			})),
			"路径不合法",
		},
		{
			"盘符路径",
			base(item(func(it map[string]any) {
				it["files"] = []map[string]any{{"path": "C:/windows/x.css", "size": 1, "sha256": strings.Repeat("a", 64)}}
			})),
			"路径不合法",
		},
		{
			"sha256 长度不对",
			base(item(func(it map[string]any) {
				it["files"] = []map[string]any{{"path": "ok.css", "size": 1, "sha256": "abc"}}
			})),
			"sha256",
		},
		{
			"sha256 不是十六进制",
			base(item(func(it map[string]any) {
				it["files"] = []map[string]any{{"path": "ok.css", "size": 1, "sha256": strings.Repeat("z", 64)}}
			})),
			"sha256",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseCatalog(tc.raw, KindTheme)
			if err == nil {
				t.Fatalf("本该被拒绝，却通过了")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("错误信息里没有 %q：%v", tc.want, err)
			}
		})
	}
}

func TestParseCatalogRejectsDuplicateID(t *testing.T) {
	raw, _ := json.Marshal(map[string]any{
		"spec": 1,
		"kind": "theme",
		"items": []map[string]any{
			{"id": "dup", "files": []map[string]any{{"path": "a.css", "size": 1, "sha256": strings.Repeat("a", 64)}}},
			{"id": "dup", "files": []map[string]any{{"path": "b.css", "size": 1, "sha256": strings.Repeat("b", 64)}}},
		},
	})
	if _, err := ParseCatalog(raw, KindTheme); err == nil || !strings.Contains(err.Error(), "重复") {
		t.Fatalf("重复 id 本该被拒绝：%v", err)
	}
}

/* --------------------------------------------------------------------------
   取清单：内存缓存 / 离线兜底
   -------------------------------------------------------------------------- */

func TestCatalogUsesMemoryCacheThenRefreshBypassesIt(t *testing.T) {
	css := []byte(testCSS)
	tr := &tracker{}
	srv := newServer(t, map[string][]byte{
		"/theme/index.json":   themeCatalog(t, "packtest.css", css),
		"/theme/packtest.css": css,
	}, tr)

	c := NewClient(srv.URL, chAuto, t.TempDir())
	c.now = func() time.Time { return time.Unix(1000, 0) }

	if _, err := c.Catalog(context.Background(), KindTheme, false); err != nil {
		t.Fatalf("第一次取清单失败：%v", err)
	}
	if _, err := c.Catalog(context.Background(), KindTheme, false); err != nil {
		t.Fatalf("第二次取清单失败：%v", err)
	}
	if got := tr.hits.Load(); got != 1 {
		t.Fatalf("第二次应该命中内存缓存（只该打 1 次网络），实际 %d 次", got)
	}

	if _, err := c.Catalog(context.Background(), KindTheme, true); err != nil {
		t.Fatalf("refresh 取清单失败：%v", err)
	}
	if got := tr.hits.Load(); got != 2 {
		t.Fatalf("refresh=true 应该绕过缓存，实际 %d 次请求", got)
	}
}

func TestCatalogFallsBackToCacheWhenOffline(t *testing.T) {
	css := []byte(testCSS)
	srv := newServer(t, map[string][]byte{
		"/theme/index.json":   themeCatalog(t, "packtest.css", css),
		"/theme/packtest.css": css,
	}, nil)

	cacheDir := t.TempDir()
	c := NewClient(srv.URL, chAuto, cacheDir)

	first, err := c.Catalog(context.Background(), KindTheme, false)
	if err != nil {
		t.Fatalf("联网取清单失败：%v", err)
	}
	if first.Cached {
		t.Fatalf("第一次不该是缓存")
	}

	// 把服务器关掉，模拟「GitHub 打不开」
	srv.Close()

	second, err := c.Catalog(context.Background(), KindTheme, true)
	if err != nil {
		t.Fatalf("离线时应该退回磁盘缓存，而不是报错：%v", err)
	}
	if !second.Cached {
		t.Fatalf("应该标记为缓存")
	}
	if second.StaleReason == "" {
		t.Fatalf("应该说明这次联网为什么失败")
	}
	if len(second.Items) != 1 || second.Items[0].ID != "packtest" {
		t.Fatalf("缓存内容不对：%+v", second.Items)
	}
}

func TestCatalogRejectsUnknownKindAndMissingBaseURL(t *testing.T) {
	c := NewClient("http://example.invalid", "", "")
	if _, err := c.Catalog(context.Background(), "wat", false); err == nil {
		t.Fatalf("未知类型本该被拒绝")
	}
	empty := NewClient("", "", "")
	if _, err := empty.Catalog(context.Background(), KindTheme, false); err == nil {
		t.Fatalf("没配地址本该被拒绝")
	}
}

func TestCatalogReportsSpecMismatch(t *testing.T) {
	srv := newServer(t, map[string][]byte{
		"/theme/index.json": []byte(`{"spec":7,"kind":"theme","items":[]}`),
	}, nil)
	c := NewClient(srv.URL, chAuto, "")
	_, err := c.Catalog(context.Background(), KindTheme, true)
	if err == nil || !strings.Contains(err.Error(), "不受支持") {
		t.Fatalf("版本不符本该被拒绝：%v", err)
	}
}

/* --------------------------------------------------------------------------
   安装
   -------------------------------------------------------------------------- */

func TestInstallThemeWritesFileAndBacksUp(t *testing.T) {
	css := []byte(testCSS)
	other := []byte("/* @theme-name 旧版 */\n:root[data-theme=\"packtest\"] {}\n")

	tr := &tracker{}
	srv := newServer(t, map[string][]byte{
		"/theme/index.json":   themeCatalog(t, "packtest.css", css),
		"/theme/packtest.css": css,
	}, tr)

	target := t.TempDir()
	// 先放一份「用户手改过的旧文件」，验证会被备份而不是直接抹掉
	old := filepath.Join(target, "packtest.css")
	if err := os.WriteFile(old, other, 0o644); err != nil {
		t.Fatal(err)
	}

	c := NewClient(srv.URL, chAuto, "")
	cat, err := c.Catalog(context.Background(), KindTheme, true)
	if err != nil {
		t.Fatalf("取清单失败：%v", err)
	}
	res, err := c.Install(context.Background(), KindTheme, cat.Items[0], Target{Dir: target})
	if err != nil {
		t.Fatalf("安装失败：%v", err)
	}
	if res.Files != 1 || res.Bytes != int64(len(css)) {
		t.Fatalf("安装结果不对：%+v", res)
	}

	got, err := os.ReadFile(old)
	if err != nil {
		t.Fatalf("目标文件没写出来：%v", err)
	}
	if string(got) != string(css) {
		t.Fatalf("写入的内容不对")
	}
	bak, err := os.ReadFile(old + ".bak")
	if err != nil {
		t.Fatalf("没有留下备份：%v", err)
	}
	if string(bak) != string(other) {
		t.Fatalf("备份的应该是覆盖前的内容")
	}
	if len(res.Backups) != 1 {
		t.Fatalf("应该报告 1 个备份：%+v", res.Backups)
	}
}

func TestInstallStyleStripsPrefixAndCreatesDirs(t *testing.T) {
	skin := []byte(`{"id":"demo","name":"演示","version":"1.0.0","apiVersion":"3.0","entry":"skin.js"}`)
	js := []byte("export default function () {}\n")

	// 清单里文件的路径是**相对 style 根**的，带包目录前缀
	doc := map[string]any{
		"spec": 1,
		"kind": "style",
		"items": []map[string]any{{
			"id": "demo", "dir": "demo", "name": "演示",
			"files": []map[string]any{
				{"path": "demo/skin.json", "size": len(skin), "sha256": sum(skin)},
				{"path": "demo/lib/a.js", "size": len(js), "sha256": sum(js)},
			},
		}},
	}
	raw, _ := json.Marshal(doc)

	srv := newServer(t, map[string][]byte{
		"/style/index.json":     raw,
		"/style/demo/skin.json": skin,
		"/style/demo/lib/a.js":  js,
	}, nil)

	parent := t.TempDir()
	target := filepath.Join(parent, "demo")

	c := NewClient(srv.URL, chAuto, "")
	cat, err := c.Catalog(context.Background(), KindStyle, true)
	if err != nil {
		t.Fatalf("取清单失败：%v", err)
	}
	res, err := c.Install(context.Background(), KindStyle, cat.Items[0], Target{Dir: target, Prefix: "demo/"})
	if err != nil {
		t.Fatalf("安装失败：%v", err)
	}
	if res.Files != 2 {
		t.Fatalf("应该装 2 个文件：%+v", res)
	}

	// 前缀必须被去掉：落在 <target>/skin.json，而不是 <target>/demo/skin.json
	if _, err := os.Stat(filepath.Join(target, "skin.json")); err != nil {
		t.Fatalf("skin.json 位置不对：%v", err)
	}
	if _, err := os.Stat(filepath.Join(target, "lib", "a.js")); err != nil {
		t.Fatalf("子目录没建出来：%v", err)
	}
	if _, err := os.Stat(filepath.Join(target, "demo")); err == nil {
		t.Fatalf("前缀没被剥掉（出现了 target/demo/）")
	}
}

func TestInstallRejectsWrongPrefix(t *testing.T) {
	css := []byte(testCSS)
	srv := newServer(t, map[string][]byte{
		"/theme/index.json":   themeCatalog(t, "packtest.css", css),
		"/theme/packtest.css": css,
	}, nil)
	c := NewClient(srv.URL, chAuto, "")
	cat, err := c.Catalog(context.Background(), KindTheme, true)
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.Install(context.Background(), KindTheme, cat.Items[0], Target{Dir: t.TempDir(), Prefix: "other/"})
	if err == nil || !strings.Contains(err.Error(), "不在") {
		t.Fatalf("前缀不匹配本该被拒绝：%v", err)
	}
}

/* --------------------------------------------------------------------------
   失败时不能留下半个包
   -------------------------------------------------------------------------- */

func TestInstallHashMismatchLeavesNothing(t *testing.T) {
	// 清单里写的哈希与服务器实际提供的内容不一致
	doc := map[string]any{
		"spec": 1, "kind": "theme",
		"items": []map[string]any{{
			"id": "packtest", "name": "测试",
			"files": []map[string]any{
				{"path": "good.css", "size": len(testCSS), "sha256": sum([]byte(testCSS))},
				{"path": "bad.css", "size": 4, "sha256": strings.Repeat("0", 64)},
			},
		}},
	}
	raw, _ := json.Marshal(doc)
	srv := newServer(t, map[string][]byte{
		"/theme/index.json": raw,
		"/theme/good.css":   []byte(testCSS),
		"/theme/bad.css":    []byte("nope"),
	}, nil)

	target := t.TempDir()
	c := NewClient(srv.URL, chAuto, "")
	cat, _ := c.Catalog(context.Background(), KindTheme, true)
	if _, err := c.Install(context.Background(), KindTheme, cat.Items[0], Target{Dir: target}); err == nil {
		t.Fatalf("校验失败本该报错")
	}

	// 关键：第一个文件通过了校验，但**一个字节都不该落盘**
	entries, err := os.ReadDir(target)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("校验失败却留下了文件：%v", strings.Join(names, ", "))
	}
}

func TestInstallSizeMismatchIsReported(t *testing.T) {
	doc := map[string]any{
		"spec": 1, "kind": "theme",
		"items": []map[string]any{{
			"id": "packtest", "name": "测试",
			"files": []map[string]any{
				{"path": "x.css", "size": 999, "sha256": sum([]byte(testCSS))},
			},
		}},
	}
	raw, _ := json.Marshal(doc)
	srv := newServer(t, map[string][]byte{
		"/theme/index.json": raw,
		"/theme/x.css":      []byte(testCSS),
	}, nil)
	c := NewClient(srv.URL, chAuto, "")
	cat, _ := c.Catalog(context.Background(), KindTheme, true)
	_, err := c.Install(context.Background(), KindTheme, cat.Items[0], Target{Dir: t.TempDir()})
	if err == nil || !strings.Contains(err.Error(), "大小与清单不符") {
		t.Fatalf("大小不符本该被拒绝：%v", err)
	}
}

func TestInstall404IsNotRetriedAcrossChannels(t *testing.T) {
	// 文件不存在是「明确的否定回答」：换代理也一样，不该把 8 条通道都试一遍
	css := []byte(testCSS)
	doc := map[string]any{
		"spec": 1, "kind": "theme",
		"items": []map[string]any{{
			"id": "packtest", "name": "测试",
			"files": []map[string]any{
				{"path": "missing.css", "size": len(css), "sha256": sum(css)},
			},
		}},
	}
	raw, _ := json.Marshal(doc)
	tr := &tracker{}
	srv := newServer(t, map[string][]byte{"/theme/index.json": raw}, tr)

	c := NewClient(srv.URL, chAuto, "")
	cat, _ := c.Catalog(context.Background(), KindTheme, true)
	before := tr.hits.Load()
	if _, err := c.Install(context.Background(), KindTheme, cat.Items[0], Target{Dir: t.TempDir()}); err == nil {
		t.Fatalf("404 本该报错")
	}
	if got := tr.hits.Load() - before; got != 1 {
		t.Fatalf("404 不该重试，实际请求了 %d 次", got)
	}
}

/* --------------------------------------------------------------------------
   防呆校验
   -------------------------------------------------------------------------- */

func TestInstallRejectsContentThatIsNotATheme(t *testing.T) {
	junk := []byte("body { color: red }\n")
	srv := newServer(t, map[string][]byte{
		"/theme/index.json": themeCatalog(t, "junk.css", junk),
		"/theme/junk.css":   junk,
	}, nil)
	c := NewClient(srv.URL, chAuto, "")
	cat, _ := c.Catalog(context.Background(), KindTheme, true)
	_, err := c.Install(context.Background(), KindTheme, cat.Items[0], Target{Dir: t.TempDir()})
	if err == nil || !strings.Contains(err.Error(), "不像一个主题") {
		t.Fatalf("非主题内容本该被拒绝：%v", err)
	}
}

func TestInstallRejectsStyleWithoutSkinJSON(t *testing.T) {
	js := []byte("export default function () {}\n")
	doc := map[string]any{
		"spec": 1, "kind": "style",
		"items": []map[string]any{{
			"id": "demo", "dir": "demo",
			"files": []map[string]any{{"path": "demo/skin.js", "size": len(js), "sha256": sum(js)}},
		}},
	}
	raw, _ := json.Marshal(doc)
	srv := newServer(t, map[string][]byte{
		"/style/index.json":   raw,
		"/style/demo/skin.js": js,
	}, nil)
	c := NewClient(srv.URL, chAuto, "")
	cat, _ := c.Catalog(context.Background(), KindStyle, true)
	_, err := c.Install(context.Background(), KindStyle, cat.Items[0], Target{Dir: t.TempDir(), Prefix: "demo/"})
	if err == nil || !strings.Contains(err.Error(), "skin.json") {
		t.Fatalf("缺 skin.json 本该被拒绝：%v", err)
	}
}

/* --------------------------------------------------------------------------
   路径与地址
   -------------------------------------------------------------------------- */

func TestSafeRelAndPathInside(t *testing.T) {
	bad := []string{"", "..", "../x", "a/../b", "a//b", "/abs", "C:/x", "a\\..\\b"}
	for _, p := range bad {
		if _, err := safeRel(p); err == nil {
			t.Fatalf("%q 本该被判为不安全", p)
		}
	}
	good := []string{"a.css", "dir/a.js", "a/b/c/d.css"}
	for _, p := range good {
		if got, err := safeRel(p); err != nil || got != p {
			t.Fatalf("%q 本该被接受，得到 %q / %v", p, got, err)
		}
	}

	root := t.TempDir()
	if inside, _ := pathInside(root, filepath.Join(root, "a", "b.txt")); !inside {
		t.Fatalf("目录内路径被判成了目录外")
	}
	if inside, _ := pathInside(root, filepath.Join(root, "..", "b.txt")); inside {
		t.Fatalf("目录外路径被判成了目录内")
	}
}

func TestCandidatesSkipsMirrorsForNonGitHubHosts(t *testing.T) {
	c := NewClient("http://127.0.0.1:1234/plugins", chAuto, "")
	got := c.candidates("http://127.0.0.1:1234/plugins/theme/index.json")
	if len(got) != 1 || got[0] != "http://127.0.0.1:1234/plugins/theme/index.json" {
		t.Fatalf("本地地址不该套代理：%v", got)
	}

	gh := c.candidates("https://raw.githubusercontent.com/o/r/main/plugins/theme/index.json")
	if len(gh) < 2 {
		t.Fatalf("GitHub 地址应该有直连 + 多条代理：%v", gh)
	}
	if gh[0] != "https://raw.githubusercontent.com/o/r/main/plugins/theme/index.json" {
		t.Fatalf("直连应该排在第一位：%v", gh[0])
	}
}

func TestCatalogAndFileURLs(t *testing.T) {
	c := NewClient("https://example.com/base/", "", "")
	if got := c.catalogURL(KindStyle); got != "https://example.com/base/style/index.json" {
		t.Fatalf("清单地址不对：%s", got)
	}
	if got := c.fileURL(KindStyle, "magic-circle/lib/a.js"); got != "https://example.com/base/style/magic-circle/lib/a.js" {
		t.Fatalf("文件地址不对：%s", got)
	}
	if got := c.fileURL(KindTheme, "/x.css"); got != "https://example.com/base/theme/x.css" {
		t.Fatalf("前导斜杠应该被吃掉：%s", got)
	}
}
