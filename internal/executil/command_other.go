//go:build !windows

package executil

import "os/exec"

// 非 Windows 平台子进程本来就没有「控制台窗口」的概念，无需处理。
func hideWindow(_ *exec.Cmd) {}
