/* ==========================================================================
   app_icon_windows.go — 把应用图标真正装到窗口上（Windows）
   --------------------------------------------------------------------------
   为什么需要自己动手：Wails v3.0.0-beta.14 的
   `application.Options.Icon` 在 Windows 上**是空实现** ——
   `windowsApp.setIcon()` 的方法体是空的（pkg/application/application_windows.go:125），
   窗口类图标仍然取 `LoadIconWithResourceID(0, IDI_APPLICATION)`，
   也就是系统通用图标。

   后果正是需求里抱怨的那个现象：
     · 任务栏 / Alt-Tab 显示的是通用图标；
     · **Windows 音量合成器**里那一栏的图标也取自进程的主窗口图标，
       于是显示不出本程序的图标（早期甚至是 webview2 的图标，
       因为声音是 WebView2 进程发出来的 —— 音频搬到后端之后进程对了，
       但图标仍然是通用图标）。

   这里从内嵌的 build/appicon.png 生成 HICON 并显式设置：
     · ICON_BIG   —— 任务栏与 Alt-Tab 用的大图标
     · ICON_SMALL —— 标题栏与音量合成器用的**小图标**
   两个都要设：只设一个时 Windows 会在另一处回退到窗口类图标
   （即通用图标）。Wails 自带的 w32.SetWindowIcon 只设了 ICON_SMALL，
   不够用，所以这里自己发 WM_SETICON。

   调用时机很关键：必须在窗口**创建之后**。由 main 在窗口建好后调用
   （见 main.go 的 applyWindowIcon），太早拿不到 HWND。
   ========================================================================== */

package main

import (
	"log"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/w32"
)

// applyWindowIconWithRetry 等原生窗口建出来后再装图标。
//
// 为什么需要重试：NewWithOptions 返回时原生窗口还没创建
// （Wails 在自己的 goroutine 里建），此刻 NativeWindow() 是 nil。
// 直接调会静默什么都不做 —— 实测踩过：日志里只有一句
// 「拿不到窗口句柄，跳过图标设置」，图标始终是系统通用图标。
//
// 轮询而不是监听某个事件：Wails v3 beta 没有稳定的「原生窗口已创建」事件，
// 而启动流程里 cloakNativeWindow 已经有同样的轮询先例，保持一致。
// 20 次 × 150ms = 3 秒上限，足够覆盖启动高峰；超时就放弃（图标是外观问题，
// 不该影响启动）。装上了就立刻返回，不空转。
func applyWindowIconWithRetry(win *application.WebviewWindow, pngData []byte) {
	if win == nil || len(pngData) == 0 {
		return
	}
	for i := 0; i < 20; i++ {
		if win.NativeWindow() != nil {
			applyWindowIcon(win, pngData)
			return
		}
		time.Sleep(150 * time.Millisecond)
	}
	log.Printf("[icon] 3 秒内没等到原生窗口句柄，跳过图标设置")
}

// applyWindowIcon 把内嵌的应用图标装到窗口上（大小两种尺寸都装）。
//
// 失败只记日志不中断启动：图标不对是外观问题，不该让程序起不来。
func applyWindowIcon(win *application.WebviewWindow, pngData []byte) {
	if win == nil || len(pngData) == 0 {
		return
	}
	hwnd := win.NativeWindow()
	if hwnd == nil {
		log.Printf("[icon] 拿不到窗口句柄，跳过图标设置")
		return
	}
	h := w32.HWND(uintptr(hwnd))

	// 生成两种尺寸的 HICON。
	//
	// 用 Wails 提供的转换函数（它们内部按系统推荐尺寸解码 PNG），
	// 而不是自己调 CreateIconFromResourceEx —— 那要求传入的是
	// ICO/PE 资源格式，而这里手上是 PNG。
	large, err := w32.CreateLargeHIconFromImage(pngData)
	if err != nil {
		log.Printf("[icon] 生成大图标失败: %v", err)
	}
	small, err := w32.CreateSmallHIconFromImage(pngData)
	if err != nil {
		log.Printf("[icon] 生成小图标失败: %v", err)
	}

	// ICON_SMALL 是音量合成器/标题栏用的那个，ICON_BIG 是任务栏用的。
	// 两个都设，避免任何一处回退到窗口类的通用图标。
	if small != 0 {
		w32.SendMessage(h, w32.WM_SETICON, w32.ICON_SMALL, uintptr(small))
		w32.SendMessage(h, w32.WM_SETICON, w32.ICON_SMALL2, uintptr(small))
	}
	if large != 0 {
		w32.SendMessage(h, w32.WM_SETICON, w32.ICON_BIG, uintptr(large))
	}

	// 注意：这里**不**销毁 HICON。
	//
	// 窗口仍在使用这两个句柄（WM_SETICON 只是存了引用），
	// 提前 DestroyIcon 会让图标变成空白/花屏。它们的生命周期
	// 与窗口一致，进程退出时由系统回收 —— 一个常驻进程里这两个
	// 句柄的泄漏量可以忽略。
}
