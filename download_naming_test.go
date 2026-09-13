package main

import "testing"

// TestSafeFilenameWindowsReserved Windows 保留设备名不能直接当文件名主体：
// 否则 os.Create 会失败，用户只看到「下载失败」而不知道原因。
func TestSafeFilenameWindowsReserved(t *testing.T) {
	cases := map[string]string{
		"CON":     "_CON",
		"nul":     "_nul",
		"Aux":     "_Aux",
		"com1":    "_com1",
		"LPT9":    "_LPT9",
		"正常歌名":    "正常歌名",
		"Console": "Console", // 只是以 CON 开头，不是保留名
	}
	for in, want := range cases {
		if got := safeFilename(in); got != want {
			t.Errorf("safeFilename(%q) = %q，期望 %q", in, got, want)
		}
	}
}
