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
   黑窗口。所以脚本内容里的每一条不变量的都要有测试兜着：
     · 路径必须加引号（用户名带空格/中文是常态，不加引号必炸）；
     · 必须先等本进程退出（抢跑 = 用户程序被锁住，替换失败）；
     · 必须有回滚（新文件是坏的时候，用户不能只剩一个跑不起来的程序）。
   ========================================================================== */

func samplePlan(t *testing.T) installPlan {
	t.Helper()
	dir := t.TempDir()
	return installPlan{
		SourcePath:  filepath.Join(dir, "LMPlayer-v0.2.0-windows-x64.exe"),
		TargetPath:  `C:\Users\Some User\AppData\Local\Programs\LMPlayer\lmplayer.exe`,
		ScriptPath:  filepath.Join(dir, "apply-update.bat"),
		RestartArgs: []string{"--foo", "bar baz"},
	}
}

func TestInstallScriptQuotesEveryPath(t *testing.T) {
	plan := samplePlan(t)
	script := buildInstallScript(plan)

	// 源、目标、备份三个路径都必须以带引号的形式出现。
	// 用户目录里带空格（"Some User"）时，不加引号的 copy 会把
	// 一个路径拆成两个参数，脚本于是去操作一个不存在的路径。
	for _, p := range []string{plan.SourcePath, plan.TargetPath, plan.TargetPath + ".old"} {
		if !strings.Contains(script, `"`+p+`"`) {
			t.Errorf("脚本里没有找到带引号的路径 %q\n---\n%s", p, script)
		}
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
	if !strings.Contains(script, "更新失败") {
		t.Error("脚本应当告诉用户失败了，而不是静默退出")
	}
	// 回滚分支要能把备份移回去
	if !strings.Contains(script, "旧版本已恢复") {
		t.Error("回滚后应当明确告诉用户旧版本已恢复")
	}
	// 失败时要留下安装包路径，用户能自己手动重试
	if !strings.Contains(script, "安装包位置") {
		t.Error("失败提示里应当带上安装包路径")
	}
}

func TestInstallScriptRestartsApp(t *testing.T) {
	script := buildInstallScript(samplePlan(t))

	if !strings.Contains(script, "start \"\" ") {
		t.Error("替换成功后应当重启新版本，否则用户面对的是一片空白")
	}
	// 重启参数要原样带过去（含空格的参数必须加引号）
	if !strings.Contains(script, `"bar baz"`) {
		t.Errorf("重启参数没有正确转义：\n%s", script)
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

func TestInstallScriptStripsQuotesFromArgs(t *testing.T) {
	// 参数里带引号会破坏拼接（把一个参数拆成两个），必须被清掉
	plan := samplePlan(t)
	plan.RestartArgs = []string{`we"ird`}
	script := buildInstallScript(plan)
	if strings.Contains(script, `we"ird`) {
		t.Error("参数里的引号应当被清掉")
	}
	if !strings.Contains(script, `"weird"`) {
		t.Errorf("清理后的参数应当保留并被引号包住：\n%s", script)
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
	if !strings.Contains(string(body), src) {
		t.Error("脚本里应当包含源文件路径")
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
