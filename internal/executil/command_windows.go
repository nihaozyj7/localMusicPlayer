//go:build windows

package executil

import (
	"os/exec"
	"syscall"
)

// CREATE_NO_WINDOW：子进程不创建控制台窗口（比 HideWindow 更彻底，
// 对控制台程序尤其重要）。CREATE_NEW_PROCESS_GROUP 让子进程不受父进程
// 的 Ctrl+C 影响，便于用 context 单独取消。
const (
	createNewProcessGroup = 0x00000200
	createNoWindow        = 0x08000000
)

func hideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags |= createNewProcessGroup | createNoWindow
}
