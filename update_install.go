package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"localmusicplayer/internal/update"
)

/* ==========================================================================
   update_install.go — 把下载好的安装包换成正在运行的程序
   --------------------------------------------------------------------------
   这是整个更新功能里唯一有「弄坏用户程序」风险的环节，所以先把约束写清楚。

   为什么不能直接 os.Rename 覆盖自己：
     Windows 上正在运行的 exe 被内核锁住，任何写入/改名都会失败
     （ERROR_SHARING_VIOLATION），而且**不能自己解锁**。
     所以必须借助一个外部进程：本进程退出后，由它把新 exe 覆盖上去。

   为什么用 .bat 而不是「复制一个 helper.exe」：
     1. 绿色版要尽量小，多带一个 helper 二进制不值得；
     2. cmd.exe 一定存在，而且这段逻辑只有十几行；
     3. 关键点是**等本进程退出**——用 `tasklist` 轮询自己就行，
        不需要任何额外依赖。

   安全要点（每条都对应一个真实会踩的坑）：
     · 脚本路径与目标路径都要加引号：路径里有空格（"Program Files"、
       中文用户名下的目录）时，不加引号会被拆成多个参数，脚本会去操作
       一个根本不存在的路径；
     · 脚本要**先等进程退出再替换**：抢跑会失败，而失败时用户已经
       关了程序，看到的是「程序没了，更新也没成功」；
     · 替换前先备份旧 exe，替换失败时能回滚 —— 否则一旦新文件是坏的，
       用户手上就只剩一个跑不起来的程序、和一段看不懂的报错；
     · 成功后要重新启动新版本，而不是留用户对着一片空白的桌面。
   ========================================================================== */

// installPlan 描述一次「用某个文件替换当前程序」的全部输入。
type installPlan struct {
	// SourcePath 是下载并校验通过的安装包。
	SourcePath string
	// TargetPath 是当前正在运行的可执行文件。
	TargetPath string
	// ScriptPath 是要写出的引导脚本。
	ScriptPath string
	// RestartArgs 是重启新版本时透传的命令行参数。
	RestartArgs []string
}

// buildInstallScript 生成 Windows 上的替换脚本（.bat）。
//
// 用 CRLF 行尾：cmd.exe 对 LF-only 的批处理文件在某些情况下会解析出错
// （尤其是带 goto/label 的脚本），这是 Windows 批处理的经典坑。
//
// ★ 路径不是原样拼进去的：`%` 在引号里照样被 cmd 当变量展开（见 batPercent），
// 提示行还要额外挡 `& | < > ^ ( )`（见 batEchoText）。两条路径都可能带中文、
// 空格、`%`（用户名/目录名），这不是理论问题。
func buildInstallScript(plan installPlan) string {
	srcRaw := plan.SourcePath
	dstRaw := plan.TargetPath
	backupRaw := dstRaw + ".old"

	// 进脚本（都在引号里）用的转义形式
	src := batPercent(srcRaw)
	dst := batPercent(dstRaw)
	backup := batPercent(backupRaw)

	var lines []string
	lines = append(lines,
		"@echo off",
		"chcp 65001 >nul 2>&1",
		// 显式关掉延迟展开：`!` 在延迟展开下是特殊字符，而 Windows 文件名里
		// 允许出现 `!`。默认虽然就是关的，但注册表
		// HKCU\Software\Microsoft\Command Processor\DelayedExpansion=1
		// 会让每个 cmd 实例都打开它，setlocal 继承该状态 —— 写死了才不靠用户环境。
		"setlocal DisableDelayedExpansion",
		"rem ===== LMPlayer 自动更新引导脚本（可安全删除） =====",
		"rem 它由 LMPlayer 生成，唯一职责是：等旧进程退出 → 替换 exe → 重启。",
		"",
		"rem 等旧进程释放文件锁。最多等约 60 秒；超时就去替换（可能失败，",
		"rem 但至少不会无限期挂着一个黑窗口）。",
		"set /a WAITED=0",
		":waitloop",
		fmt.Sprintf("tasklist /FI \"PID eq %d\" 2>nul | find \"%d\" >nul", os.Getpid(), os.Getpid()),
		"if errorlevel 1 goto ready",
		"set /a WAITED+=1",
		"if %WAITED% GEQ 60 goto ready",
		"timeout /t 1 /nobreak >nul 2>&1",
		"goto waitloop",
		"",
		":ready",
		"rem 再稳一下：文件锁的释放和进程退出之间有一点延迟。",
		"timeout /t 1 /nobreak >nul 2>&1",
		"",
		"rem 先备份旧版本，替换失败时能回滚。",
		fmt.Sprintf("if exist \"%s\" del /f /q \"%s\" >nul 2>&1", backup, backup),
		fmt.Sprintf("if exist \"%s\" move /y \"%s\" \"%s\" >nul 2>&1", dst, dst, backup),
		"",
		"rem 用 copy 而不是 move：源文件（临时目录里的下载包）留着，",
		"rem 万一需要人工重试，用户手上还有一份完好的安装包。",
		fmt.Sprintf("copy /y \"%s\" \"%s\" >nul 2>&1", src, dst),
		"if errorlevel 1 goto rollback",
		"",
		"rem 替换成功：清掉备份，启动新版本。",
		fmt.Sprintf("del /f /q \"%s\" >nul 2>&1", backup),
		fmt.Sprintf("start \"\" \"%s\"%s", dst, formatArgs(plan.RestartArgs)),
		"goto cleanup",
		"",
		":rollback",
		"rem 替换失败：把备份恢复回去，并告诉用户发生了什么。",
		fmt.Sprintf("if exist \"%s\" move /y \"%s\" \"%s\" >nul 2>&1", backup, backup, dst),
		"echo.",
		"echo   LMPlayer 更新失败：无法替换程序文件。",
		"echo   旧版本已恢复，可以继续使用。",
		"echo   安装包位置：",
		fmt.Sprintf("echo     %s", batEchoText(srcRaw)),
		"echo.",
		"pause",
		"",
		":cleanup",
		"endlocal",
		"rem 自删除：脚本不能删掉正在执行的自己，用 start 起一个延迟删除。",
		"start /b \"\" cmd /c ping -n 2 127.0.0.1 >nul & del /f /q \"%~f0\"",
		"",
	)

	// 逐行 join 再统一补 CRLF，避免上面每条都要手写 \r\n。
	return strings.Join(lines, "\r\n") + "\r\n"
}

// batPercent 把字面量里的 `%` 转义成 `%%`（.bat 里转义百分号的唯一办法）。
//
// 为什么必须做：cmd.exe 在**双引号内同样展开 `%VAR%`** —— 引号只挡得住
// 空格与 `& | < >` 这类命令分隔符，挡不住百分号。而 Windows 允许文件名里
// 出现 `%`，用户目录完全可能是 `C:\100% 音乐\LMPlayer\`，安装包路径也可能
// 带 `%TEMP%` 这样的字面量。不转义的表现是路径被展开成别的东西，
// 脚本去操作一个不存在的文件 —— 对更新流程来说就是「这次更新失败」。
func batPercent(s string) string {
	return strings.ReplaceAll(s, "%", "%%")
}

// batEchoText 转义要 `echo` 给用户看的一段文本。
//
// 除了 `%`，`echo` 之后仍然有特殊含义的是命令分隔符与重定向符
// （`& | < > ^ ( )`）：路径里带 `&` 时，不加 `^` 会把这一行**拆成两条命令**，
// 用户只会看到半句提示，后半段还可能被当成命令执行。加 `^` 后原样打印。
//
// 注意 `^` 必须放在最后判断：它是转义符本身，先加会把后面加的 `^` 再转义一次。
func batEchoText(s string) string {
	s = batPercent(s)
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '&', '|', '<', '>', '^', '(', ')':
			b.WriteByte('^')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// formatArgs 把重启参数拼成 ` "a" "b"`（每个都加引号，含空格也不会被拆开）。
func formatArgs(args []string) string {
	if len(args) == 0 {
		return ""
	}
	var b strings.Builder
	for _, a := range args {
		// 参数里的引号会破坏下面的拼接，直接丢掉并加引号兜底。
		clean := strings.ReplaceAll(a, "\"", "")
		// `%` 同样要转义：它在引号内也会被 cmd 展开。
		fmt.Fprintf(&b, " \"%s\"", batPercent(clean))
	}
	return b.String()
}

// prepareInstall 写出引导脚本，返回它的路径。
//
// 它**不执行**任何替换动作，也不结束进程 —— 那些交给调用方，
// 因为「什么时候退出应用」是服务层与界面约定的时序。
func prepareInstall(plan installPlan) (string, error) {
	if strings.TrimSpace(plan.SourcePath) == "" {
		return "", fmt.Errorf("没有待安装的文件")
	}
	if _, err := os.Stat(plan.SourcePath); err != nil {
		return "", fmt.Errorf("待安装的文件不存在：%w", err)
	}
	if strings.TrimSpace(plan.TargetPath) == "" {
		return "", fmt.Errorf("无法定位当前程序路径")
	}
	// 这两个字符在 cmd 的引号参数里**没有**合法转义方式：
	//   · `"` 会直接闭合参数、把后面的内容变成新命令（路径里不可能有它）；
	//   · 换行会让这行批处理提前结束（路径里也不可能有它）。
	// 与其赌它们不出现，不如在这里明确拒绝 —— 拒绝的代价是「这次更新没做」，
	// 放过去的代价是「脚本执行了半条被拼出来的命令」。
	for _, p := range []struct{ what, path string }{
		{"安装包路径", plan.SourcePath},
		{"程序路径", plan.TargetPath},
	} {
		if i := strings.IndexAny(p.path, "\"\r\n"); i >= 0 {
			return "", fmt.Errorf("%s里含有无法安全写入批处理脚本的字符 %q：%s",
				p.what, p.path[i], p.path)
		}
	}

	script := buildInstallScript(plan)
	if err := os.WriteFile(plan.ScriptPath, []byte(script), 0o644); err != nil {
		return "", fmt.Errorf("写入更新脚本失败：%w", err)
	}
	return plan.ScriptPath, nil
}

// defaultInstallDir 返回存放「下载中的安装包」与引导脚本的目录。
//
// 放在数据目录下而不是系统临时目录：
//   - 系统临时目录可能被清理工具随时删掉，而这个文件在用户下次启动前
//     都必须存在（替换动作发生在进程退出之后）；
//   - 排查问题时用户能在自己的数据目录里找到那个安装包。
func defaultInstallDir(dataDir string) string {
	return filepath.Join(dataDir, "update")
}

// describeChannel 把通道 id 变成一句人话（安装完成后的提示里用到）。
func describeChannel(id string) string {
	if m, ok := update.MirrorByID(id); ok {
		if m.ID == "direct" {
			return "直连 GitHub"
		}
		return m.Name
	}
	return "自动选择"
}
