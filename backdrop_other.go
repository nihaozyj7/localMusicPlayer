//go:build !windows

package main

// backdropOSInfo 在非 Windows 平台恒为「不支持」。
// Wails 的 BackdropType 是 Windows 专属能力（DWM 提供），
// 其它平台的窗口保持普通不透明外观。
func backdropOSInfo() (bool, string) {
	return false, "当前系统不是 Windows，原生材质不可用"
}
