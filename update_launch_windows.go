package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

/* ==========================================================================
   update_launch_windows.go — 启动更新引导脚本（Windows）
   --------------------------------------------------------------------------
   为什么要单独一个文件：这里的启动方式与项目里其它子进程**都不一样**，
   而差异刚好是最容易搞错的地方。

   executil.Command 会给子进程加 CREATE_NO_WINDOW + SW_HIDE（那是为
   ffmpeg 这类后台工具准备的，避免闪黑窗）。但更新脚本不一样：
     · 它必须能被用户看见 —— 替换失败时要显示「已回滚、安装包在哪」，
       那个控制台窗口是唯一的沟通渠道。隐藏掉的话，用户看到的就是
       「程序关了又开、版本没变」，完全不知道发生了什么。
     所以这里不走 executil，直接构造 exec.Command。

   另一个关键点是「脱离」：脚本要活到本进程退出之后，因此
     · 用 Start() 而不是 Run()（不等它结束）；
     · 设 CREATE_NEW_PROCESS_GROUP，让脚本不受本进程控制台事件的影响。
       本进程退出时 Windows 会给同组进程发 CTRL_CLOSE_EVENT ——
       不隔离的话脚本可能被一起终止，替换动作就永远不发生了；
     · 立刻 Release 进程句柄（我们不等它，也不看它的退出码）。

   为什么用 `cmd /c` 而不是直接执行 .bat：
     Go 在 Windows 上不能直接执行批处理文件（会报
     "not a valid Win32 application"），必须显式交给 cmd.exe。

   环境变量承载了源 / 目标 / 备份路径与重启参数（见 update_install.go）：
   这些值**不能**写进脚本正文，否则中文路径会被 cmd 按控制台代码页解错。
   环境块是 UTF-16，和代码页无关 —— 这一条是实测出来的（旧实现会在中文
   目录下把程序换坏，只剩一个 lmplayer.exe.old）。
   ========================================================================== */

// createNewProcessGroup 与 internal/executil 里用的是同一个常量，
// 但这里要的是「隔离」而不是「隐藏」，所以没复用它。
const createNewProcessGroup = 0x00000200

// launchInstallScript 用一条独立的 cmd 进程执行引导脚本，然后立刻返回。
func launchInstallScript(plan installPlan) error {
	cmd := exec.Command("cmd.exe", "/c", plan.ScriptPath)

	// 工作目录设成脚本所在目录：脚本里用到的都是环境变量里的绝对路径，
	// 但把 cwd 放在这里能让「用户手动重跑这个脚本」的行为完全一致。
	cmd.Dir = filepath.Dir(plan.ScriptPath)

	// 路径与参数走环境块（UTF-16，与代码页无关）。
	// 追加而不是替换：cmd.exe 自己要用 SystemRoot 之类的变量。
	cmd.Env = append(os.Environ(), installEnv(plan)...)

	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNewProcessGroup,
		// 刻意不设 HideWindow：脚本失败时用户要看得到提示。
		HideWindow: false,
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("无法启动 cmd.exe：%w", err)
	}

	// 立刻释放句柄：我们不需要等待它，也不关心它的退出码。
	_ = cmd.Process.Release()
	return nil
}
