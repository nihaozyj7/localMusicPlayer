// 窗口原生材质（Windows 11 的 Mica / Acrylic / Tabbed）。
//
// 为什么要有这个文件：
// Wails v3 的背景材质**只能在创建窗口时**通过 WebviewWindowOptions 指定，
// 运行期没有对应的接口（webview_window_windows.go 里 setBackdropType 只在
// 窗口 run() 时按 options 调一次）。因此这里的映射结果决定窗口的最终外观，
// 设置界面改了材质之后必须重启应用 —— 前端会据此提示用户。
//
// 两个字段缺一不可：
//   - BackgroundType: BackgroundTypeTranslucent  → WebView2 底色设为全透明
//   - Windows.BackdropType                        → DWM 在窗口背后画材质
//
// 只设 BackdropType 而窗口仍是不透明的，材质会被网页自己挡得严严实实。
package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"localmusicplayer/internal/bootstrap"
)

// backdropTypeFor 把配置里的材质名映射成 Wails 的 BackdropType。
// ok=false 表示不启用原生材质（窗口按普通不透明窗口渲染）。
func backdropTypeFor(mode string) (application.BackdropType, bool) {
	switch bootstrap.NormalizeBackdropMode(mode) {
	case "auto":
		// Auto：交给系统决定（Win11 上就是 Mica）
		return application.Auto, true
	case "mica":
		return application.Mica, true
	case "acrylic":
		return application.Acrylic, true
	case "tabbed":
		return application.Tabbed, true
	default:
		return application.None, false
	}
}
