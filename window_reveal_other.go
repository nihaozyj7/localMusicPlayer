//go:build !windows

package main

import "unsafe"

// cloakNativeWindow 在非 Windows 平台恒为「不支持」。
//
// DWM 的 cloak 是 Windows 专有属性，其它平台直接走旧路径：窗口隐藏创建、
// 前端 MarkReady 之后才 Show（见 services.go#ShowMain）。
func cloakNativeWindow(_ unsafe.Pointer, _ bool) bool { return false }

// applyWindowDecorations 在非 Windows 平台是空实现：圆角与外框都由系统自己
// 决定（macOS 的圆角是 AppKit 给的，没有对应开关）。
func applyWindowDecorations(_ unsafe.Pointer, _ string) {}

// setTaskbarPresence 在非 Windows 平台是空实现：任务栏按钮的显隐是 Windows
// 独有的启动细节（见 window_reveal_windows.go）。
func setTaskbarPresence(_ unsafe.Pointer, _ bool) bool { return false }

// raiseNativeWindow 在非 Windows 平台是空实现：窗口的 z 序与前台交给各自的桌面
// 环境管理，Wails 的 Focus() 已经够用。
func raiseNativeWindow(_ unsafe.Pointer) {}

// isSelfForeground 在非 Windows 平台恒为 true（没有需要补抢前台的情形）。
func isSelfForeground() bool { return true }
