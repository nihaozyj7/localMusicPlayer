package bootstrap

import (
	"os"
	"path/filepath"
	"testing"
)

// TestStableIDMatchesFrontend 确保 Go 侧生成的 id 与前端 utils.js#stableId 完全一致。
// 测试向量按前端 utils.js#stableId 的算法一次性生成后内联在下面（没有生成脚本）。
// 如果这条测试挂了，说明重扫后歌单 / 收藏 / 播放队列会集体失效，务必先修这里。
func TestStableIDMatchesFrontend(t *testing.T) {
	cases := []struct {
		input  string
		prefix string
		want   string
	}{
		{`D:\Music\音乐库\陈默\静默频率\夜航西飞.flac`, "t", "t_1geb140"},
		{`D:\Music\Downloads\Aurora Lane\Paper Cities\Rooftop Rain.flac`, "t", "t_1k2uor"},
		{"/home/user/music/a.mp3", "t", "t_1jlkyrx"},
		{`D:\Music\音乐库`, "t", "t_iwkvkg"},
		{"", "t", "t_ztntfp"},
		{"x", "t", "t_1y7mkjr"},
		{`E:\Backup\FLAC\2024\周叙\玻璃海\玻璃海.flac`, "t", "t_1yappt7"},
		{`D:\Music\音乐库`, "folder", "folder_iwkvkg"},
		{`D:\Music\音乐库\陈默\静默频率\夜航西飞.flac`, "folder", "folder_1geb140"},
	}
	for _, c := range cases {
		if got := StableID(c.input, c.prefix); got != c.want {
			t.Errorf("StableID(%q, %q) = %q, 期望 %q", c.input, c.prefix, got, c.want)
		}
	}
}

func TestIsAudioExt(t *testing.T) {
	yes := []string{"mp3", "MP3", ".flac", "m4a", "opus", "ape", "wma", "dsf"}
	no := []string{"mp4", "txt", "ini", "", "jpg", "lrc"}
	for _, e := range yes {
		if !IsAudioExt(e) {
			t.Errorf("IsAudioExt(%q) 应为 true", e)
		}
	}
	for _, e := range no {
		if IsAudioExt(e) {
			t.Errorf("IsAudioExt(%q) 应为 false", e)
		}
	}
}

func TestNeedsTranscode(t *testing.T) {
	if NeedsTranscode("mp3") || NeedsTranscode("flac") || NeedsTranscode("m4a") {
		t.Error("mp3/flac/m4a 应可原生播放，无需转码")
	}
	if !NeedsTranscode("ape") || !NeedsTranscode("wma") || !NeedsTranscode("dsf") {
		t.Error("ape/wma/dsf 应需要转码")
	}
}

func TestExpandPath(t *testing.T) {
	if got := ExpandPath("  D:\\Music\\x  "); got != `D:\Music\x` {
		t.Errorf("ExpandPath 去空格/清理失败: %q", got)
	}
	if got := ExpandPath(""); got != "" {
		t.Errorf("空路径应原样返回，得到 %q", got)
	}
	if got := ExpandPath("   "); got != "" {
		t.Errorf("纯空白应trim成空串，得到 %q", got)
	}
}

// TestExpandPathPercentEnv 守住「注释承诺的 %VAR% 写法」。
//
// 这里以前只有一句注释说支持 `%VAR%`，实现却是 os.ExpandEnv（**只认 `$VAR`**）：
// Windows 用户把 `%USERPROFILE%\Music\downloads` 粘进设置里，`%…%` 会原样留下，
// 变成一个不存在的相对路径（文件夹显示为找不到）。见第六轮审查 §4.2。
func TestExpandPathPercentEnv(t *testing.T) {
	t.Setenv("LMP_TEST_DIR", `D:\Music\下载`)

	cases := []struct {
		name string
		in   string
		want string
	}{
		{"整段替换", `%LMP_TEST_DIR%`, `D:\Music\下载`},
		{"前后拼接", `%LMP_TEST_DIR%\downloads`, `D:\Music\下载\downloads`},
		{"大小写不敏感", `%lmp_test_dir%\x`, `D:\Music\下载\x`},
		{"不存在的变量原样保留", `%LMP_TEST_NO_SUCH_VAR%\x`, `%LMP_TEST_NO_SUCH_VAR%\x`},
		{"单个百分号不动", `D:\100% Rock`, `D:\100% Rock`},
		{"$VAR 仍然支持", `$LMP_TEST_DIR\x`, `D:\Music\下载\x`},
		{"${VAR} 仍然支持", `${LMP_TEST_DIR}\x`, `D:\Music\下载\x`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ExpandPath(tc.in); got != tc.want {
				t.Errorf("ExpandPath(%q) = %q，期望 %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestExpandPathPercentEnvNotReExpanded 守住展开顺序：`%VAR%` 的值里带 `$`
// 时不能再被 os.ExpandEnv 吃一遍（否则一个目录名里含 `$` 就会变形）。
func TestExpandPathPercentEnvNotReExpanded(t *testing.T) {
	t.Setenv("LMP_TEST_DOLLAR", `D:\a$b`)
	if got := ExpandPath(`%LMP_TEST_DOLLAR%\x`); got != `D:\a$b\x` {
		t.Errorf("百分号展开结果不应二次展开，得到 %q", got)
	}
}

// TestExpandPathTilde 守住 `~` → 主目录（原先没有用例）。
func TestExpandPathTilde(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("取不到主目录，跳过 ~ 用例")
	}
	if got := ExpandPath("~"); got != filepath.Clean(home) {
		t.Errorf("ExpandPath(\"~\") = %q，期望 %q", got, filepath.Clean(home))
	}
	if got, want := ExpandPath("~/x"), filepath.Clean(filepath.Join(home, "x")); got != want {
		t.Errorf("ExpandPath(\"~/x\") = %q，期望 %q", got, want)
	}
}
