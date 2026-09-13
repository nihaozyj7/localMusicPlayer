//go:build windows

package main

import (
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/w32"
)

// backdropOSInfo 报告当前系统对原生材质的支持情况。
//
// 判定标准与 Wails 内部一致（w32.SupportsBackdropTypes，即 Build >= 22621）：
// 不满足时 setBackdropType 会退化成 ACCENT_ENABLE_BLURBEHIND，
// 也就是「一层普通的背景模糊」，仍然半透明，只是没有 Mica 的材质噪点。
func backdropOSInfo() (bool, string) {
	supported := w32.SupportsBackdropTypes()

	label := "Windows（版本未知）"
	if info, err := w32.GetWindowsVersionInfo(); err == nil && info != nil {
		switch {
		case info.DisplayVersion != "" && info.Build > 0:
			label = fmt.Sprintf("Windows %s（Build %d）", info.DisplayVersion, info.Build)
		case info.Build > 0:
			label = fmt.Sprintf("Windows（Build %d）", info.Build)
		}
	}
	return supported, label
}
