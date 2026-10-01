//go:build !windows

package main

import (
	"fmt"
	"runtime"
)

/* ==========================================================================
   update_launch_other.go — 非 Windows 上的更新安装
   --------------------------------------------------------------------------
   自我替换在 Windows 上可行（借助一个等进程退出的 .bat），是因为
   Windows **允许**把已删除/已替换的文件从磁盘上摘掉，只要还有句柄开着。
   Unix 上恰好相反：正在执行的二进制文件被内核锁在 inode 上，
   `rename` 到它头上没问题，但当前进程仍会继续跑旧 inode，
   而「替换后重启」需要额外处理可执行位、AppImage 的挂载点等。

   本项目的发行方式目前是 Windows 绿色版（见 README 与 release 资产命名），
   所以这里不做假装能用的实现 —— 直接返回一句明确的错误，
   让界面把用户引导到发布页面手动下载。**假装成功要糟糕得多**：
   用户会以为更新装上了，然后发现版本没变。
   ========================================================================== */

// launchInstallScript 在非 Windows 平台不可用。
func launchInstallScript(scriptPath string) error {
	return fmt.Errorf("当前平台（%s）不支持自动替换安装，请到发布页面手动下载", runtime.GOOS)
}
