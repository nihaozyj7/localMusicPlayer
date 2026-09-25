//go:build !windows

/* ==========================================================================
   app_icon_other.go — 非 Windows 平台的空实现
   --------------------------------------------------------------------------
   图标设置是 Windows 专有的（Win32 的 WM_SETICON / HICON）。
   macOS 的图标来自 .app bundle 的 Info.plist，Linux 的来自 .desktop 文件，
   都不需要在代码里改窗口 —— 所以这里什么都不做。

   存在的意义只是让 main.go 能无条件调用 applyWindowIcon，
   不必在各处写 runtime.GOOS 判断（那种分散的判断很容易漏掉一处）。
   ========================================================================== */

package main

import "github.com/wailsapp/wails/v3/pkg/application"

// applyWindowIcon 非 Windows 平台是空操作，理由见文件头。
func applyWindowIcon(_ *application.WebviewWindow, _ []byte) {}

// applyWindowIconWithRetry 非 Windows 平台同样是空操作。
func applyWindowIconWithRetry(_ *application.WebviewWindow, _ []byte) {}
