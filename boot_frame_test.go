package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"musicplayer/internal/bootstrap"
)

/* ==========================================================================
   启动过渡图（boot_frame.go）的回归测试
   --------------------------------------------------------------------------
   这一层有两个必须成立的约定：
     · 缓存文件的位置跟着配置的缓存目录走（用户改了缓存目录不能还写老地方）；
     · 文件不存在时必须是 404 —— 前端靠它把过渡层换成「加载动画」形态，
       返回 200 加空 body 的话，<img> 不会触发 error，页面会顶着一张空图。
   ========================================================================== */

func TestBootFrameFileFollowsCacheDir(t *testing.T) {
	store := newTestStore(t)
	cacheDir := filepath.Join(t.TempDir(), "my-cache")
	if err := store.Update(func(c *bootstrap.Config) { c.CacheDir = cacheDir }); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}

	got := bootFrameFile(store)
	if want := filepath.Join(cacheDir, "boot-frame.jpg"); got != want {
		t.Errorf("bootFrameFile = %q, 期望 %q", got, want)
	}
}

func TestBootFrameHandler(t *testing.T) {
	store := newTestStore(t)
	cacheDir := filepath.Join(t.TempDir(), "cache")
	if err := store.Update(func(c *bootstrap.Config) { c.CacheDir = cacheDir }); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}
	handler := bootFrameHandler(store)

	// 没有缓存（首次启动）：404
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, bootFramePath, nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("没有缓存图时应返回 404, 得到 %d", rec.Code)
	}

	// 有缓存：原样返回，并且禁止缓存（每次退出都会换一张）
	want := []byte{0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01}
	path := bootFrameFile(store)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("建目录失败: %v", err)
	}
	if err := os.WriteFile(path, want, 0o644); err != nil {
		t.Fatalf("写缓存图失败: %v", err)
	}

	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, bootFramePath, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("有缓存图时应返回 200, 得到 %d", rec.Code)
	}
	if !bytes.Equal(rec.Body.Bytes(), want) {
		t.Errorf("返回内容与缓存文件不一致")
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("Content-Type = %q, 期望 image/jpeg", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "no-store") {
		t.Errorf("Cache-Control = %q, 必须禁止缓存", cc)
	}
}
