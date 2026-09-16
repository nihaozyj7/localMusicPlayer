package main

import "testing"

// OpenURL 的参数最终会交给系统的 ShellExecute，因此这里对着「哪些串必须被挡下来」
// 逐条断言 —— 这条边界一旦破了，页面里任意一段脚本都能拉起本机程序。
func TestAppServiceOpenURLRejectsNonHTTP(t *testing.T) {
	svc := NewAppService()
	for _, raw := range []string{
		"",
		"   ",
		"file:///C:/Windows/System32/cmd.exe",
		"javascript:alert(1)",
		"ms-settings:",
		"http://",
		"https://",
		"ftp://example.com/x",
	} {
		if err := svc.OpenURL(raw); err == nil {
			t.Fatalf("OpenURL(%q) 应该报错，实际通过了", raw)
		}
	}
}

// 合法链接在没有应用句柄（测试环境）时也要给出可读的错误，而不是 panic。
func TestAppServiceOpenURLWithoutApp(t *testing.T) {
	svc := NewAppService()
	err := svc.OpenURL("https://example.com/")
	if err == nil {
		t.Fatal("没有应用句柄时应该报错")
	}
	if err.Error() != "应用未就绪" {
		t.Fatalf("错误信息不符合预期：%v", err)
	}
}

func TestAppServiceVersion(t *testing.T) {
	if got := NewAppService().Version(); got != appVersion {
		t.Fatalf("Version() = %q，期望 %q", got, appVersion)
	}
}
