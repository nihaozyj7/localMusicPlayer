//go:build !windows

package main

import (
	"errors"
	"unsafe"
)

/* ==========================================================================
   桌面背景歌词 · 非 Windows 平台
   --------------------------------------------------------------------------
   「把窗口垫到桌面图标之下」靠的是 Windows 资源管理器的桌面窗口树
   （Progman / WorkerW），这是 Windows 独有的结构，其它平台没有对应物：

     · macOS 要改桌面壁纸只能走 NSWorkspace.setDesktopImageURL（换一张静态图），
       没法把一个实时窗口垫在 Finder 图标之下；
     · Linux（X11 / Wayland）要由桌面环境自己支持，没有可移植的做法。

   所以这里一律报「不支持」，前端会把这个按钮禁掉并给出原因 ——
   这比让它点了没反应要好。
   ========================================================================== */

// desktopWallpaperSupport 在非 Windows 平台恒为「不支持」。
func desktopWallpaperSupport() (bool, string) {
	return false, "桌面背景歌词目前只支持 Windows（需要资源管理器的桌面壁纸层）"
}

// attachDesktopWallpaperWindow 在非 Windows 平台不会被调用
// （openDesktopWallpaperWindow 会先被 desktopWallpaperSupport 挡下），
// 这里保留同样的签名只是为了让 desktop_wallpaper.go 能跨平台编译。
func attachDesktopWallpaperWindow(_ unsafe.Pointer) error {
	return errors.New("桌面背景歌词目前只支持 Windows")
}
