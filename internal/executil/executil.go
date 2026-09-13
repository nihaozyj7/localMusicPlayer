// Package executil 统一创建外部进程的方式，保证不弹出控制台窗口。
//
// 背景：本程序在 Windows 上是 GUI 子系统（wails 构建带 -H windowsgui）。
// 这类进程调用 os/exec 启动控制台程序（ffmpeg.exe、explorer.exe…）时，
// Windows 会为子进程分配一个新的控制台，用户侧看到的就是「播放歌曲时
// 闪出一个黑色命令行窗口」。exec.CommandContext 的 SysProcAttr 默认是
// nil，因此必须显式设置隐藏窗口标志。
//
// 非 Windows 平台在 command_other.go 里是空实现。
package executil

import (
	"context"
	"os/exec"
)

// CommandContext 等价于 exec.CommandContext，但创建的子进程不会显示窗口。
func CommandContext(ctx context.Context, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	hideWindow(cmd)
	return cmd
}

// Command 等价于 exec.Command，但创建的子进程不会显示窗口。
func Command(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	hideWindow(cmd)
	return cmd
}

// CommandVisible 等价于 exec.Command，**不**对子进程设置任何隐藏窗口标志。
//
// 为什么需要它：Command 会往 STARTUPINFO 里写 SW_HIDE（SysProcAttr.HideWindow）
// 并加上 CREATE_NO_WINDOW。这对 ffmpeg 这类控制台程序是必需的（否则闪黑窗），
// 但 explorer.exe 是 GUI 程序：它新建「文件夹窗口」时用的正是启动信息里的
// nCmdShow，隐藏标志会把窗口创建成隐藏的 —— 用户侧看到的就是
// 「提示已打开，实际什么都没发生」。
//
// 资源管理器窗口本来就是用户要看的，所以打开目录 / 定位文件必须走这里。
func CommandVisible(name string, args ...string) *exec.Cmd {
	return exec.Command(name, args...)
}
