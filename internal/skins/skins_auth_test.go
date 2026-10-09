package skins

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

/* --------------------------------------------------------------------------
   /skins/ 的鉴权：token + 会话票（cookie）

   背景（2026-10 实测踩到）：入口模块是带 `?t=<token>` 加载的，而 **ES 模块
   解析相对说明符时只保留路径、丢掉 query** —— 插件包内 `lib/*.js` 的相对
   导入因此拿到不带 t 的 URL，被逐文件 token 校验打成 403，表现为
   「Failed to fetch dynamically imported module」，报错还挂在**入口**上。

   契约（docs/42 §4.1、设置页的 AI 提示词）明确允许插件带私有模块，所以
   「拿对 token 进来」的那次响应签一张 `Path=/skins` 的会话票，子资源凭票
   放行。下面四条用例把这个口径钉死：票必须签、票能用、没票依然 403、
   空 token 不许等于放行。
   -------------------------------------------------------------------------- */

// 找出响应里签发的会话票（没有就返回 nil）。
func sessionTicket(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == authCookie {
			return c
		}
	}
	return nil
}

// 带对 token 的响应必须签发会话票，且票的属性不能松（Path / HttpOnly / SameSite）。
func TestHandlerIssuesSessionCookie(t *testing.T) {
	m := newTestManagerWithFiles(t)

	req := httptest.NewRequest(http.MethodGet, "/skins/neon/skin.js?t="+m.Token(), nil)
	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("带正确 token 状态码 = %d，期望 200", rec.Code)
	}
	ticket := sessionTicket(t, rec)
	if ticket == nil {
		t.Fatal("带 token 的响应应当签发会话票（否则包内相对 import 永远 403）")
	}
	if ticket.Value != m.Token() {
		t.Errorf("票值 = %q，期望与 token 一致", ticket.Value)
	}
	if ticket.Path != Prefix {
		t.Errorf("票的 Path = %q，期望 %q（只覆盖样式路由）", ticket.Path, Prefix)
	}
	if !ticket.HttpOnly {
		t.Error("票必须 HttpOnly：页面 JS 不该拿得到它")
	}
	if ticket.SameSite != http.SameSiteStrictMode {
		t.Errorf("票的 SameSite = %v，期望 Strict（跨站请求不许带上）", ticket.SameSite)
	}
}

// 只带票、不带 query —— 这正是包内相对导入的处境，必须放行。
func TestHandlerAcceptsSessionCookie(t *testing.T) {
	m := newTestManagerWithFiles(t)
	h := m.Handler()

	for _, target := range []string{
		"/skins/neon/skin.css", // 入口 skin.js 之后的第二份资源
		"/skins/neon/icon.svg",
	} {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		req.AddCookie(&http.Cookie{Name: authCookie, Value: m.Token()})
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("%s 只带会话票：状态码 = %d，期望 200", target, rec.Code)
		}
	}
}

// 没有票、没有 token、token 错、票错 —— 一律 403（口径不能因为加票而变松）。
func TestHandlerStillRejectsWithoutCredentials(t *testing.T) {
	m := newTestManagerWithFiles(t)
	h := m.Handler()

	cases := []struct {
		label  string
		target string
		bad    bool // 是否附一张**错**值的票
	}{
		{"无 token 无票", "/skins/neon/skin.js", false},
		{"错 token", "/skins/neon/skin.js?t=wrong-token", false},
		{"空 token 参数", "/skins/neon/skin.js?t=", false},
		{"无 token 但带错票", "/skins/neon/skin.js", true},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, c.target, nil)
		if c.bad {
			req.AddCookie(&http.Cookie{Name: authCookie, Value: "wrong-ticket"})
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Errorf("%s：状态码 = %d，期望 403", c.label, rec.Code)
		}
	}
}

// Manager 没初始化好（token 为空）时必须拒绝：
// 空 query `?t=` 与空 token 相等，若不显式挡掉就等于没有鉴权。
func TestHandlerRejectsWhenTokenEmpty(t *testing.T) {
	m := &Manager{}
	for _, target := range []string{"/skins/neon/skin.js", "/skins/neon/skin.js?t="} {
		rec := httptest.NewRecorder()
		m.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, nil))
		if rec.Code != http.StatusForbidden {
			t.Errorf("空 token 的 Manager：%s 状态码 = %d，期望 403", target, rec.Code)
		}
	}
}
