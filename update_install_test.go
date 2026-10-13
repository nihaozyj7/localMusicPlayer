package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

/* ==========================================================================
   update_install_test.go — 自替换脚本
   --------------------------------------------------------------------------
   这个脚本是唯一会「动用户程序文件」的东西，而它跑在应用已经退出的
   那一刻 —— 出问题时用户面前没有任何界面，只有（可能一闪而过的）
   黑窗口。所以脚本内容里的每一条不变量都要有测试兜着：
     · 正文只能是 ASCII，路径一律走环境变量（中文目录下拼路径会把程序换坏，
       实测表现是「目录里只剩一个 lmplayer.exe.old」）；
     · 路径使用点必须加引号（用户名带空格/中文是常态，不加引号必炸）；
     · 必须先等本进程退出（抢跑 = 用户程序被锁住，替换失败）；
     · 必须有回滚（新文件是坏的时候，用户不能只剩一个跑不起来的程序）。
   ========================================================================== */

func samplePlan(t *testing.T) installPlan {
	t.Helper()
	dir := t.TempDir()
	// 用中文路径做样本：这不是边角情况，而是中文用户的默认情况
	// （`C:\Users\<中文名>\Desktop\项目合集\音乐播放器\bin\`）。
	return installPlan{
		SourcePath:  filepath.Join(dir, "LMPlayer-v1.0.0-windows-x64.exe"),
		TargetPath:  `C:\Users\某个用户\Desktop\项目合集\音乐播放器\bin\lmplayer.exe`,
		ScriptPath:  filepath.Join(dir, "apply-update.bat"),
		RestartArgs: []string{"--foo", "bar baz"},
	}
}

// TestInstallScriptIsASCII 是这次「更新把程序换坏」故障的守卫用例。
//
// cmd.exe 按控制台代码页解码 .bat 的字节：正文里只要有一个非 ASCII 字节，
// 解码结果就随机器而变（中文系统 CP936），路径变乱码、换行被吞、
// 两行命令粘成一行 —— 替换与回滚都会失败。
func TestInstallScriptIsASCII(t *testing.T) {
	plan := samplePlan(t)
	script := buildInstallScript(plan)

	for i, r := range script {
		if r > 0x7f {
			t.Fatalf("脚本正文第 %d 个字符是 %q（U+%04X）：正文必须只含 ASCII\n---\n%s",
				i, r, r, script)
		}
	}
	// 反面证据：路径本身绝不能出现在正文里（它现在只走环境变量）。
	for _, p := range []string{plan.SourcePath, plan.TargetPath} {
		if strings.Contains(script, p) {
			t.Errorf("路径被写进了脚本正文：%s", p)
		}
	}
}

func TestInstallScriptReadsPathsFromEnv(t *testing.T) {
	plan := samplePlan(t)
	script := buildInstallScript(plan)

	// 三处路径都必须以环境变量（带引号）的形式出现。
	for _, line := range []string{
		`if exist "%LM_UPDATE_BAK%" del /f /q "%LM_UPDATE_BAK%" >nul 2>&1`,
		`if exist "%LM_UPDATE_DST%" move /y "%LM_UPDATE_DST%" "%LM_UPDATE_BAK%" >nul 2>&1`,
		`copy /y "%LM_UPDATE_SRC%" "%LM_UPDATE_DST%" >nul 2>&1`,
		`if exist "%LM_UPDATE_BAK%" move /y "%LM_UPDATE_BAK%" "%LM_UPDATE_DST%" >nul 2>&1`,
	} {
		if !strings.Contains(script, line) {
			t.Errorf("脚本缺少这一行（或没加引号）：%s\n---\n%s", line, script)
		}
	}
	// 重启参数同样走环境变量。
	if !strings.Contains(script, `start "" "%LM_UPDATE_DST%" %LM_UPDATE_ARGS%`) {
		t.Errorf("重启行没有带上环境变量里的参数\n---\n%s", script)
	}
}

// TestInstallEnvProvidesEveryVariableInScript 保证「脚本里引用的变量」
// 与「installEnv 提供的变量」是同一套 —— 少一个的后果是运行时展开成
// 字面量 `%LM_UPDATE_XXX%`，脚本去操作一个叫这个名字的路径。
func TestInstallEnvProvidesEveryVariableInScript(t *testing.T) {
	script := buildInstallScript(samplePlan(t))

	provided := map[string]bool{}
	for _, kv := range installEnv(samplePlan(t)) {
		name, _, _ := strings.Cut(kv, "=")
		provided[name] = true
	}
	// 脚本里所有 %NAME% 形式的引用。
	seen := map[string]bool{}
	rest := script
	for {
		i := strings.Index(rest, "%")
		if i < 0 {
			break
		}
		rest = rest[i+1:]
		j := strings.Index(rest, "%")
		if j < 0 {
			break
		}
		name := rest[:j]
		rest = rest[j+1:]
		if name == "" || name == "WAITED" || strings.HasPrefix(name, "~") {
			continue
		}
		seen[name] = true
	}
	if len(seen) == 0 {
		t.Fatal("脚本里没有任何 %VAR% 引用，用例失去意义")
	}
	for name := range seen {
		if !provided[name] {
			t.Errorf("脚本引用了 %%%s%%，但 installEnv 没有提供这个变量", name)
		}
	}
}

func TestInstallEnvCarriesRawPaths(t *testing.T) {
	plan := samplePlan(t)
	env := installEnv(plan)

	got := map[string]string{}
	for _, kv := range env {
		name, value, _ := strings.Cut(kv, "=")
		got[name] = value
	}
	// 值必须原样：环境变量不是脚本正文，再转义一次就会变成另一个路径。
	if got[envUpdateSrc] != plan.SourcePath {
		t.Errorf("%s = %q，期望原样 %q", envUpdateSrc, got[envUpdateSrc], plan.SourcePath)
	}
	if got[envUpdateDst] != plan.TargetPath {
		t.Errorf("%s = %q，期望原样 %q", envUpdateDst, got[envUpdateDst], plan.TargetPath)
	}
	if got[envUpdateBak] != plan.TargetPath+".old" {
		t.Errorf("%s = %q，期望 %q", envUpdateBak, got[envUpdateBak], plan.TargetPath+".old")
	}
	if got[envUpdateArgs] != ` "--foo" "bar baz"` {
		t.Errorf("%s = %q", envUpdateArgs, got[envUpdateArgs])
	}
}

func TestInstallScriptWaitsForProcessExit(t *testing.T) {
	script := buildInstallScript(samplePlan(t))

	// 必须用 tasklist 轮询自己的 PID 并带等待循环 ——
	// 不等就替换，正在运行的 exe 被内核锁着，copy 一定失败。
	if !strings.Contains(script, "tasklist") {
		t.Error("脚本里没有等待进程退出的逻辑（tasklist）")
	}
	if !strings.Contains(script, ":waitloop") || !strings.Contains(script, "goto waitloop") {
		t.Error("脚本里没有等待循环")
	}
	// 等待必须有上限，否则旧进程卡住不走时会留下一个永不退出的黑窗口
	if !strings.Contains(script, "GEQ 60") {
		t.Error("等待循环缺少超时上限")
	}
	// 每次循环的间隔不能用 timeout：子进程的 stdin 是 NUL，
	// `timeout /t 1` 在这种情况下**立刻返回**，循环会在几毫秒内空转 60 次，
	// 等于没等（实测）。ping 与 stdin 无关。
	// 只看真正的命令行 —— rem 注释里会出现 `timeout /t 1` 这种反例说明。
	for _, line := range strings.Split(script, "\r\n") {
		if strings.HasPrefix(line, "rem") || strings.HasPrefix(line, "echo") {
			continue
		}
		if strings.Contains(line, "timeout") {
			t.Errorf("等待/停顿不能用 timeout（stdin 是 NUL 时它立刻返回）：%q", line)
		}
	}
	if !strings.Contains(script, "ping -n 2 127.0.0.1") {
		t.Error("等待循环缺少与 stdin 无关的延时（ping）")
	}
	// 替换动作必须排在等待之后
	waitIdx := strings.Index(script, ":ready")
	copyIdx := strings.Index(script, "copy /y")
	if waitIdx < 0 || copyIdx < 0 || copyIdx < waitIdx {
		t.Error("替换动作必须排在等待进程退出之后")
	}
}

func TestInstallScriptHasRollback(t *testing.T) {
	script := buildInstallScript(samplePlan(t))

	if !strings.Contains(script, "move /y") {
		t.Error("脚本缺少备份旧版本的步骤（move）")
	}
	if !strings.Contains(script, ":rollback") {
		t.Error("脚本缺少回滚分支")
	}
	if !strings.Contains(script, "update failed") {
		t.Error("脚本应当告诉用户失败了，而不是静默退出")
	}
	// 回滚分支要能把备份移回去
	if !strings.Contains(script, "The previous version has been restored") {
		t.Error("回滚后应当明确告诉用户旧版本已恢复")
	}
	// 失败时要留下安装包路径，用户能自己手动重试
	if !strings.Contains(script, "Installer") {
		t.Error("失败提示里应当带上安装包位置")
	}
	// 提示必须写进 CON：这个进程的 stdout 是 NUL，直接 echo 用户什么都看不到。
	if !strings.Contains(script, ">CON echo") {
		t.Error("失败提示必须写到 CON，否则黑窗口里是空的")
	}
	// 写完要留住窗口（pause 不可用：stdin 是 NUL，立刻返回）。
	if !strings.Contains(script, "ping -n 21 127.0.0.1") {
		t.Error("失败提示之后应当留住窗口一段时间")
	}
}

func TestInstallScriptRestartsApp(t *testing.T) {
	script := buildInstallScript(samplePlan(t))

	if !strings.Contains(script, `start "" `) {
		t.Error("替换成功后应当重启新版本，否则用户面对的是一片空白")
	}
	// 重启参数走环境变量（正文是 ASCII，不能内联中文参数）。
	if !strings.Contains(script, `%LM_UPDATE_ARGS%`) {
		t.Errorf("重启行没有引用参数环境变量：\n%s", script)
	}
}

func TestInstallScriptUsesCRLF(t *testing.T) {
	script := buildInstallScript(samplePlan(t))
	// cmd.exe 对 LF-only 的批处理在带 goto/label 时会解析出错
	if !strings.Contains(script, "\r\n") {
		t.Fatal("脚本必须使用 CRLF 行尾")
	}
	if strings.Contains(strings.ReplaceAll(script, "\r\n", ""), "\n") {
		t.Fatal("脚本里存在裸 LF（没有配对的 CR）")
	}
}

func TestInstallScriptDisablesDelayedExpansion(t *testing.T) {
	script := buildInstallScript(samplePlan(t))
	// `!` 在延迟展开下是特殊字符，而注册表可以让每个 cmd 都打开延迟展开。
	if !strings.Contains(script, "setlocal DisableDelayedExpansion") {
		t.Error("脚本必须显式关掉延迟展开，否则路径里的 ! 会被吃掉")
	}
}

func TestFormatArgs(t *testing.T) {
	if got := formatArgs(nil); got != "" {
		t.Errorf("空参数应当返回空串，得到 %q", got)
	}
	if got := formatArgs([]string{"a"}); got != ` "a"` {
		t.Errorf("formatArgs 结果不对：%q", got)
	}
	if got := formatArgs([]string{"a", "b c"}); got != ` "a" "b c"` {
		t.Errorf("formatArgs 结果不对：%q", got)
	}
}

func TestFormatArgsDropsQuotesAndNewlines(t *testing.T) {
	// 参数里的引号会破坏「一个参数一对引号」的形状，
	// 换行会让这一行批处理提前结束 —— 都清掉。
	got := formatArgs([]string{`we"ird`, "two\nlines", "cr\rhere"})
	want := ` "weird" "two lines" "cr here"`
	if got != want {
		t.Errorf("formatArgs = %q，期望 %q", got, want)
	}
}

func TestPrepareInstallWritesScript(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "new.exe")
	if err := os.WriteFile(src, []byte("binary"), 0o644); err != nil {
		t.Fatal(err)
	}

	plan := installPlan{
		SourcePath: src,
		TargetPath: filepath.Join(dir, "app.exe"),
		ScriptPath: filepath.Join(dir, "apply-update.bat"),
	}
	got, err := prepareInstall(plan)
	if err != nil {
		t.Fatalf("prepareInstall 失败：%v", err)
	}
	if got != plan.ScriptPath {
		t.Fatalf("返回的脚本路径不对：%s", got)
	}
	body, err := os.ReadFile(got)
	if err != nil {
		t.Fatalf("脚本没有写出来：%v", err)
	}
	if len(body) == 0 {
		t.Fatal("脚本是空的")
	}
	// 写出来的字节也必须全是 ASCII：路径在这里只是环境变量的值。
	for i, b := range body {
		if b > 0x7f {
			t.Fatalf("脚本第 %d 个字节是 0x%02X，正文必须是纯 ASCII", i, b)
		}
	}
	if strings.Contains(string(body), src) {
		t.Error("源文件路径不该被写进脚本正文")
	}
}

func TestPrepareInstallRejectsMissingInputs(t *testing.T) {
	dir := t.TempDir()

	// 源文件不存在：必须在**启动脚本之前**就失败。
	// 否则用户会看到「更新中」然后程序关了、什么也没发生。
	if _, err := prepareInstall(installPlan{
		SourcePath: filepath.Join(dir, "nope.exe"),
		TargetPath: filepath.Join(dir, "app.exe"),
		ScriptPath: filepath.Join(dir, "s.bat"),
	}); err == nil {
		t.Error("源文件不存在时应当失败")
	}

	src := filepath.Join(dir, "new.exe")
	_ = os.WriteFile(src, []byte("x"), 0o644)
	if _, err := prepareInstall(installPlan{
		SourcePath: src,
		TargetPath: "",
		ScriptPath: filepath.Join(dir, "s.bat"),
	}); err == nil {
		t.Error("目标路径为空时应当失败")
	}
	if _, err := prepareInstall(installPlan{
		SourcePath: "",
		TargetPath: filepath.Join(dir, "app.exe"),
		ScriptPath: filepath.Join(dir, "s.bat"),
	}); err == nil {
		t.Error("源路径为空时应当失败")
	}
}

func TestPrepareInstallRejectsUnescapablePaths(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "new.exe")
	if err := os.WriteFile(src, []byte("x"), 0o644); err != nil {
		t.Fatalf("准备源文件失败：%v", err)
	}

	// 双引号：它闭掉 `"%LM_UPDATE_DST%"` 的引号后，后面的内容会变成新命令。
	if _, err := prepareInstall(installPlan{
		SourcePath: src,
		TargetPath: `C:\Apps\bad"name\lmplayer.exe`,
		ScriptPath: filepath.Join(dir, "s.bat"),
	}); err == nil {
		t.Error(`目标路径里含 " 时应当拒绝，而不是拼出一段可能被拆开的命令`)
	}

	// 换行：Windows 允许文件名叫这个，但写进环境变量后会把命令行提前结束。
	nl := filepath.Join(dir, "bad\nname.exe")
	if err := os.WriteFile(nl, []byte("x"), 0o644); err == nil {
		if _, err := prepareInstall(installPlan{
			SourcePath: nl,
			TargetPath: `C:\Apps\LMPlayer\lmplayer.exe`,
			ScriptPath: filepath.Join(dir, "s2.bat"),
		}); err == nil {
			t.Error("源路径里含换行时应当拒绝")
		}
	}
}

func TestDefaultInstallDirIsUnderDataDir(t *testing.T) {
	dataDir := t.TempDir()
	got := defaultInstallDir(dataDir)
	if !strings.HasPrefix(got, dataDir) {
		t.Fatalf("更新目录应当落在数据目录下，得到 %s", got)
	}
}

func TestDescribeChannel(t *testing.T) {
	if got := describeChannel("direct"); got != "直连 GitHub" {
		t.Errorf("describeChannel(direct) = %q", got)
	}
	if got := describeChannel("ghproxy.net"); got != "ghproxy.net" {
		t.Errorf("describeChannel(ghproxy.net) = %q", got)
	}
	if got := describeChannel("unknown"); got != "自动选择" {
		t.Errorf("未知通道应当回落到「自动选择」，得到 %q", got)
	}
}
