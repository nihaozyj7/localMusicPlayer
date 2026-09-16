package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unsafe"

	"musicplayer/internal/bootstrap"
)

/* ==========================================================================
   启动过渡图（上一帧缓存）
   --------------------------------------------------------------------------
   首屏那一下「黑」已经由 window_reveal_*.go 的 DWM 遮罩消掉了（窗口出现时
   屏幕上已经是画好的帧）。这一层再往前一步：**把上次退出时的画面留在磁盘上**，
   下次启动时先用它当过渡（配合一个淡出），观感上就是「窗口一出现就是刚才那个
   界面」，真正的界面装配好之后再淡入接管。

   数据流：
     · 退出：WindowService.captureBootFrame 用 PrintWindow 抓当前画面
       （见 boot_frame_windows.go），压成 JPEG 原子写入 <CacheDir>/boot-frame.jpg；
     · 启动：/boot-frame.jpg 由这里提供给 index.html 里的过渡层（#boot-splash），
       第一帧就能看到；抓不到文件（首次启动 / 抓帧失败）时页面退化成加载动画。

   为什么用 JPEG 而不是 PNG：这是一张「马上会被淡出」的过渡图，UI 截图里
   大块渐变很多，PNG 动辄 2~3MB，而 JPEG q80 只有两三百 KB，解码也更快。
   ========================================================================== */

// bootFramePath 过渡图的请求路径（index.html 里直接当 <img src> 用）
const bootFramePath = "/boot-frame.jpg"

// 抓帧参数：宽度上限与 JPEG 质量。
//
// 上限是为了别把 4K 屏的整窗原样存下来（那种尺寸的 JPEG 也要好几 MB）；
// 过渡图最终是铺满窗口显示的，缩到 1600px 宽肉眼看不出差别。
const (
	bootFrameMaxWidth = 1600
	bootFrameQuality  = 80
)

// bootFrameFile 过渡图的落盘路径（跟其它缓存放在一起，清缓存时一起走）
func bootFrameFile(store *bootstrap.Store) string {
	if store == nil {
		return ""
	}
	cfg := store.Get()
	dir := strings.TrimSpace(cfg.CacheDir)
	if dir == "" {
		dir = filepath.Join(cfg.DataDir, "cache")
	}
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, "boot-frame.jpg")
}

// bootFrameHandler 提供过渡图；文件不存在时返回 404，页面据此换成加载动画。
func bootFrameHandler(store *bootstrap.Store) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := bootFrameFile(store)
		if path == "" {
			http.NotFound(w, r)
			return
		}
		data, err := os.ReadFile(path)
		if err != nil || len(data) == 0 {
			http.NotFound(w, r)
			return
		}
		// 每次退出都会换一张，绝对不能让 WebView2 缓存上一轮的
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "no-store, max-age=0")
		_, _ = w.Write(data)
	})
}

// saveBootFrame 抓一帧窗口画面并落盘。
//
// 写盘走「临时文件 + 改名」：启动时读到的永远是完整文件，不会撞上写了一半的。
func saveBootFrame(store *bootstrap.Store, hwnd unsafe.Pointer) (int, error) {
	path := bootFrameFile(store)
	if path == "" || hwnd == nil {
		return 0, os.ErrInvalid
	}
	data, err := captureWindowFrame(hwnd, bootFrameMaxWidth, bootFrameQuality)
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return 0, err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return 0, err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return 0, err
	}
	return len(data), nil
}
