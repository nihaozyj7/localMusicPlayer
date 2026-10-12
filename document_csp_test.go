package main

import (
	"net/http/httptest"
	"testing"
)

/* ==========================================================================
   document_csp_test.go — HTML 文档的 frame-ancestors 响应头
   --------------------------------------------------------------------------
   第六轮审查 §2.5 要求补齐 `frame-ancestors 'none'`，而这条指令**不能**写在
   `<meta http-equiv>` 里 —— CSP 规范把它列为「仅响应头」指令，写在 meta 里会
   被浏览器忽略（控制台报 "ignored when delivered via a <meta> element"）。
   所以三个页面的 meta CSP 里都没有它，由 Go 侧给 HTML 响应补上。

   这里量的是**行为**（哪些路径加了、哪些没加），不是「main.go 里有没有那句话」
   —— 后者只要把代码注释掉就假通过了（本条的第一次反证就踩到了这个坑）。
   ========================================================================== */

func TestSetDocumentCSPHeaderOnlyForDocuments(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/", true},               // 主界面（asset server 把 / 映射到 index.html）
		{"/index.html", true},     //
		{"/lyrics.html", true},    // 桌面歌词窗口
		{"/wallpaper.html", true}, // 桌面背景歌词窗口
		{"/INDEX.HTML", true},     // 大小写不敏感
		{"/assets/index-abc.js", false},
		{"/skins/neon/skin.js", false},
		{"/audio/song?t=x", false},
		{"/boot-frame.jpg", false},
		{"/lyrics.html.bak", false}, // 后缀必须真的是 .html，别被中间匹配骗了
	}
	for _, c := range cases {
		w := httptest.NewRecorder()
		setDocumentCSPHeader(w, c.path)
		got := w.Header().Get("Content-Security-Policy")
		if c.want && got != "frame-ancestors 'none'" {
			t.Errorf("%s: 期望 frame-ancestors 响应头，得到 %q", c.path, got)
		}
		if !c.want && got != "" {
			t.Errorf("%s: 静态资源不该带 CSP 响应头，得到 %q", c.path, got)
		}
	}
}
