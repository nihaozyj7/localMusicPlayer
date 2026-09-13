package skins

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

/* --------------------------------------------------------------------------
   皮肤扫描
   -------------------------------------------------------------------------- */

func writeFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestManagerScanAndManifest(t *testing.T) {
	dataDir := t.TempDir()
	root := filepath.Join(dataDir, "player-skins")

	// 1) 有清单的皮肤：名称/版本/入口/样式都从 skin.json 来
	writeFile(t, filepath.Join(root, "neon", "skin.json"),
		`{"name":"霓虹播放页","version":"1.2.0","module":"main.js","styles":["a.css","b.css"]}`)
	writeFile(t, filepath.Join(root, "neon", "main.js"), "export default {}")
	writeFile(t, filepath.Join(root, "neon", "a.css"), "/* a */")
	writeFile(t, filepath.Join(root, "neon", "b.css"), "/* b */")
	// 清单里没提到、但存在的 css 不应被带上
	writeFile(t, filepath.Join(root, "neon", "extra.css"), "/* extra */")
	// 清单里写了但文件不存在 —— 要跳过而不是让整个皮肤消失
	writeFile(t, filepath.Join(root, "neon", "absent.css"), "")

	// 2) 没有清单的皮肤：id/name 取目录名，module 默认 skin.js，styles 取全部 css
	writeFile(t, filepath.Join(root, "plain", "skin.js"), "export default {}")
	writeFile(t, filepath.Join(root, "plain", "z.css"), "")
	writeFile(t, filepath.Join(root, "plain", "a.css"), "")

	// 3) 没有 skin.js 的目录：跳过
	writeFile(t, filepath.Join(root, "not-a-skin", "readme.txt"), "hi")

	// 4) _ 与 . 开头的目录：跳过
	writeFile(t, filepath.Join(root, "_template", "skin.js"), "")
	writeFile(t, filepath.Join(root, ".hidden", "skin.js"), "")

	// 5) 坏清单：按「没有清单」处理，皮肤仍然可用
	writeFile(t, filepath.Join(root, "brokenjson", "skin.json"), "{ not json")
	writeFile(t, filepath.Join(root, "brokenjson", "skin.js"), "")

	m, err := NewManager(dataDir)
	if err != nil {
		t.Fatalf("创建皮肤管理器失败: %v", err)
	}
	list := m.List()
	ids := make([]string, 0, len(list))
	for _, s := range list {
		ids = append(ids, s.ID)
	}
	want := []string{"brokenjson", "neon", "plain"}
	if strings.Join(ids, ",") != strings.Join(want, ",") {
		t.Fatalf("皮肤列表 = %v，期望 %v", ids, want)
	}

	neon, ok := m.Get("neon")
	if !ok {
		t.Fatal("取不到 neon")
	}
	if neon.Name != "霓虹播放页" || neon.Version != "1.2.0" || neon.Module != "main.js" {
		t.Fatalf("清单字段没生效: %+v", neon)
	}
	if strings.Join(neon.Styles, ",") != "a.css,b.css" {
		t.Fatalf("styles 应只含清单里存在的两项，实际 %v", neon.Styles)
	}
	if neon.Dir == "" {
		t.Fatal("Dir 应填上绝对路径（供 handler 定位文件）")
	}

	plain, _ := m.Get("plain")
	if plain.Name != "plain" || plain.Module != "skin.js" {
		t.Fatalf("无清单时应用默认值: %+v", plain)
	}
	if strings.Join(plain.Styles, ",") != "a.css,z.css" {
		t.Fatalf("无清单时应收集全部 css 并排序，实际 %v", plain.Styles)
	}
}

// 清单里的 module 必须是目录内的相对路径，带 .. 的写法要被忽略。
func TestManagerRejectsTraversalModule(t *testing.T) {
	dataDir := t.TempDir()
	root := filepath.Join(dataDir, "player-skins")
	writeFile(t, filepath.Join(root, "evil", "skin.json"), `{"module":"../../secret.js"}`)
	writeFile(t, filepath.Join(root, "evil", "skin.js"), "")
	writeFile(t, filepath.Join(dataDir, "secret.js"), "secret")

	m, err := NewManager(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	info, ok := m.Get("evil")
	if !ok {
		t.Fatal("evil 应该仍然是一个可用皮肤（fallback 到 skin.js）")
	}
	if info.Module != "skin.js" {
		t.Fatalf("穿越式 module 应回退到 skin.js，实际 %q", info.Module)
	}
}

// 新增/删除目录后 Reload 要能反映出来。
func TestManagerReload(t *testing.T) {
	dataDir := t.TempDir()
	root := filepath.Join(dataDir, "player-skins")
	writeFile(t, filepath.Join(root, "one", "skin.js"), "")

	m, err := NewManager(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(m.List()) != 1 {
		t.Fatalf("初始应有 1 个皮肤，实际 %d", len(m.List()))
	}

	writeFile(t, filepath.Join(root, "two", "skin.js"), "")
	if err := m.Reload(); err != nil {
		t.Fatal(err)
	}
	if len(m.List()) != 2 {
		t.Fatalf("Reload 后应有 2 个皮肤，实际 %d", len(m.List()))
	}
	if _, ok := m.Get("two"); !ok {
		t.Fatal("新皮肤没被发现")
	}

	if err := os.RemoveAll(filepath.Join(root, "one")); err != nil {
		t.Fatal(err)
	}
	if err := m.Reload(); err != nil {
		t.Fatal(err)
	}
	if _, ok := m.Get("one"); ok {
		t.Fatal("删掉的皮肤不该还在列表里")
	}
}

// NewManager 必须把目录建出来（否则用户第一次打开「皮肤文件夹」会是空的）。
func TestNewManagerCreatesDir(t *testing.T) {
	dataDir := t.TempDir()
	m, err := NewManager(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if m.Dir() != filepath.Join(dataDir, "player-skins") {
		t.Fatalf("目录不对: %s", m.Dir())
	}
	if st, err := os.Stat(m.Dir()); err != nil || !st.IsDir() {
		t.Fatalf("目录没被创建: %v", err)
	}
	if m.OpenFolderPath() != m.Dir() {
		t.Fatal("OpenFolderPath 应等于皮肤根目录")
	}
}

/* --------------------------------------------------------------------------
   示例样式（_template）
   -------------------------------------------------------------------------- */

// 示例样式要随首次启动落到用户目录，且**不参与扫描**、**不覆盖用户改动**。
func TestManagerWritesTemplateOnce(t *testing.T) {
	dataDir := t.TempDir()
	m, err := NewManager(dataDir)
	if err != nil {
		t.Fatal(err)
	}

	tpl := filepath.Join(m.Dir(), TemplateDirName)
	for _, name := range []string{"skin.js", "skin.css", "skin.json"} {
		if _, err := os.Stat(filepath.Join(tpl, name)); err != nil {
			t.Fatalf("示例样式缺少 %s: %v", name, err)
		}
	}
	// 下划线开头 = 不参与扫描（否则用户会在样式按钮组里看到它）
	if _, ok := m.Get(TemplateDirName); ok {
		t.Fatal("示例样式不该出现在皮肤列表里")
	}
	if len(m.List()) != 0 {
		t.Fatalf("空目录不该扫出皮肤，实际 %d", len(m.List()))
	}

	// 用户改了示例样式：再次启动不能被盖回去
	edited := filepath.Join(tpl, "skin.js")
	if err := os.WriteFile(edited, []byte("// 我自己改的"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewManager(dataDir); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(edited)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "// 我自己改的" {
		t.Fatal("第二次启动把用户的改动覆盖掉了")
	}
}

/* --------------------------------------------------------------------------
   同源托管
   -------------------------------------------------------------------------- */

func newTestManagerWithFiles(t *testing.T) *Manager {
	t.Helper()
	dataDir := t.TempDir()
	root := filepath.Join(dataDir, "player-skins")
	writeFile(t, filepath.Join(root, "neon", "skin.js"), "export const x = 1;")
	writeFile(t, filepath.Join(root, "neon", "skin.css"), ".a{color:red}")
	writeFile(t, filepath.Join(root, "neon", "skin.json"), `{"name":"neon"}`)
	writeFile(t, filepath.Join(root, "neon", "icon.svg"), "<svg/>")
	writeFile(t, filepath.Join(root, "neon", ".secret"), "top secret")
	writeFile(t, filepath.Join(root, ".hidden", "skin.js"), "hidden")
	writeFile(t, filepath.Join(dataDir, "outside.txt"), "outside")
	m, err := NewManager(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func doGet(h http.Handler, target string, method string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHandlerServesFiles(t *testing.T) {
	m := newTestManagerWithFiles(t)
	h := m.Handler()

	cases := []struct {
		path string
		body string
		ct   string
	}{
		{"/skins/neon/skin.js", "export const x = 1;", "text/javascript"},
		{"/skins/neon/skin.css", ".a{color:red}", "text/css"},
		{"/skins/neon/skin.json", `{"name":"neon"}`, "application/json"},
		{"/skins/neon/icon.svg", "<svg/>", "image/svg+xml"},
	}
	for _, c := range cases {
		rec := doGet(h, c.path, http.MethodGet)
		if rec.Code != http.StatusOK {
			t.Errorf("%s: 状态码 = %d，期望 200", c.path, rec.Code)
			continue
		}
		if rec.Body.String() != c.body {
			t.Errorf("%s: 内容 = %q，期望 %q", c.path, rec.Body.String(), c.body)
		}
		if got := rec.Header().Get("Content-Type"); !strings.Contains(got, c.ct) {
			t.Errorf("%s: Content-Type = %q，期望包含 %q", c.path, got, c.ct)
		}
		// 皮肤是用户正在改的文件，必须禁止缓存
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s: Cache-Control = %q，期望 no-store", c.path, got)
		}
	}

	// HEAD 允许（只需要头）
	if rec := doGet(h, "/skins/neon/skin.js", http.MethodHead); rec.Code != http.StatusOK {
		t.Errorf("HEAD 应允许，实际 %d", rec.Code)
	}
}

func TestHandlerRejectsWrites(t *testing.T) {
	m := newTestManagerWithFiles(t)
	h := m.Handler()
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch} {
		rec := doGet(h, "/skins/neon/skin.js", method)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s 应被拒绝，实际 %d", method, rec.Code)
		}
	}
}

func TestHandlerNotFound(t *testing.T) {
	m := newTestManagerWithFiles(t)
	h := m.Handler()
	for _, p := range []string{
		"/skins/neon/missing.js",
		"/skins/nosuchskin/skin.js",
		"/skins/",          // 空相对路径
		"/skins/neon",      // 目录不列
		"/skins/neon/",     // 目录不列
		"/skins/neon/sub/", // 不存在的子目录
	} {
		if rec := doGet(h, p, http.MethodGet); rec.Code != http.StatusNotFound {
			t.Errorf("%s: 状态码 = %d，期望 404", p, rec.Code)
		}
	}
}

// 路径穿越必须被挡住。
func TestHandlerBlocksTraversal(t *testing.T) {
	m := newTestManagerWithFiles(t)
	h := m.Handler()

	// 注意：真实服务器会在解析 URL 之前就拒绝裸 `../`（400），
	// 所以这里用**编码后**的形式，确保请求真的进到我们的 handler。
	paths := []string{
		"/skins/../outside.txt",
		"/skins/%2e%2e/outside.txt",
		"/skins/neon/%2e%2e/%2e%2e/outside.txt",
		"/skins/neon/..%2f..%2foutside.txt",
		"/skins/....//outside.txt",
	}
	for _, p := range paths {
		rec := doGet(h, p, http.MethodGet)
		if rec.Code == http.StatusOK {
			t.Errorf("%s: 不应返回 200（内容 %q）", p, rec.Body.String())
		}
		if strings.Contains(rec.Body.String(), "outside") {
			t.Errorf("%s: 泄露了根目录外的文件内容", p)
		}
	}
}

// 以点开头的文件/目录一律拒绝。
func TestHandlerBlocksHidden(t *testing.T) {
	m := newTestManagerWithFiles(t)
	h := m.Handler()
	for _, p := range []string{
		"/skins/neon/.secret",
		"/skins/.hidden/skin.js",
		"/skins/neon/.git/config",
	} {
		rec := doGet(h, p, http.MethodGet)
		if rec.Code == http.StatusOK {
			t.Errorf("%s: 隐藏文件不该可访问", p)
		}
	}
}

func TestHandlerPrefixConstant(t *testing.T) {
	// 中间件与 handler 内部裁剪必须用同一个前缀；这里顺带钉住它的形状
	if Prefix != "/skins/" {
		t.Fatalf("Prefix = %q", Prefix)
	}
}
