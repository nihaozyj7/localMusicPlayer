//go:build !windows

package main

import (
	"errors"
	"unsafe"
)

// captureWindowFrame 在非 Windows 平台不可用：GDI 的 PrintWindow 是 Windows
// 专有接口。没有这能力时启动过渡层会自动退化成「加载动画」形态
// （见 index.html#boot-splash 与 js/main.js）。
func captureWindowFrame(_ unsafe.Pointer, _, _ int) ([]byte, error) {
	return nil, errors.New("当前平台不支持窗口抓帧")
}
