package update

import (
	"strings"
	"testing"
)

/* ==========================================================================
   version_test.go — 版本号解析与比较
   --------------------------------------------------------------------------
   这组测试针对的是**静默失效**：比较逻辑写错不会报错，只会让用户
   永远收不到更新提示（或反复被提示同一个版本）。所以边界要钉死。
   ========================================================================== */

func mustParse(t *testing.T, s string) Version {
	t.Helper()
	v, err := ParseVersion(s)
	if err != nil {
		t.Fatalf("ParseVersion(%q) 意外失败：%v", s, err)
	}
	return v
}

func TestParseVersionAcceptsCommonForms(t *testing.T) {
	cases := []struct {
		in                  string
		major, minor, patch int
		pre                 string
	}{
		{"0.1.1", 0, 1, 1, ""},
		{"v0.1.1", 0, 1, 1, ""},
		{"V0.1.1", 0, 1, 1, ""},
		{"  v0.1.1  ", 0, 1, 1, ""},
		{"1.0.0", 1, 0, 0, ""},
		{"0.2", 0, 2, 0, ""},
		{"2", 2, 0, 0, ""},
		{"1.2.3-beta.14", 1, 2, 3, "beta.14"},
		{"v1.2.3-rc.1", 1, 2, 3, "rc.1"},
		// 构建元数据不参与比较，解析时丢掉
		{"1.2.3+build.5", 1, 2, 3, ""},
		{"1.2.3-rc.1+exp.sha.5114f85", 1, 2, 3, "rc.1"},
	}
	for _, c := range cases {
		v, err := ParseVersion(c.in)
		if err != nil {
			t.Fatalf("ParseVersion(%q) 失败：%v", c.in, err)
		}
		if v.Major != c.major || v.Minor != c.minor || v.Patch != c.patch || v.Pre != c.pre {
			t.Errorf("ParseVersion(%q) = {%d %d %d pre=%q}，期望 {%d %d %d pre=%q}",
				c.in, v.Major, v.Minor, v.Patch, v.Pre, c.major, c.minor, c.patch, c.pre)
		}
		// String() 必须回显原文（界面上展示的是用户熟悉的写法）
		if v.String() != strings.TrimSpace(c.in) {
			t.Errorf("ParseVersion(%q).String() = %q，期望原文", c.in, v.String())
		}
	}
}

func TestParseVersionRejectsGarbage(t *testing.T) {
	bad := []string{"", "   ", "abc", "1.2.x", "1.2.3.4", "v", "1..2", "-1.0.0", "1.-2.0", "1.2.-3"}
	for _, s := range bad {
		if _, err := ParseVersion(s); err == nil {
			t.Errorf("ParseVersion(%q) 应当失败，却成功了", s)
		}
	}
}

func TestVersionCompareNumericNotLexical(t *testing.T) {
	// 这是本功能最容易踩的坑：字符串比较会认为 "0.1.10" < "0.1.9"，
	// 于是 0.1.10 发布后所有 0.1.9 用户都被判定成「已是最新」。
	if !mustParse(t, "0.1.10").NewerThan(mustParse(t, "0.1.9")) {
		t.Fatal("0.1.10 应当新于 0.1.9（字典序比较会得出相反结论）")
	}
	if !mustParse(t, "0.2.0").NewerThan(mustParse(t, "0.1.99")) {
		t.Fatal("0.2.0 应当新于 0.1.99")
	}
	if !mustParse(t, "1.0.0").NewerThan(mustParse(t, "0.99.99")) {
		t.Fatal("1.0.0 应当新于 0.99.99")
	}
	if !mustParse(t, "0.10.0").NewerThan(mustParse(t, "0.9.0")) {
		t.Fatal("0.10.0 应当新于 0.9.0")
	}
}

func TestVersionCompareEquality(t *testing.T) {
	pairs := [][2]string{
		{"0.1.1", "v0.1.1"},
		{"0.1.1", "0.1.1+build.7"},
		{"0.2", "0.2.0"},
		{"v1.0.0", "1.0.0"},
	}
	for _, p := range pairs {
		a, b := mustParse(t, p[0]), mustParse(t, p[1])
		if a.CompareTo(b) != 0 {
			t.Errorf("%q 与 %q 应当相等，CompareTo = %d", p[0], p[1], a.CompareTo(b))
		}
	}
}

func TestVersionPrereleaseRanksBelowStable(t *testing.T) {
	stable := mustParse(t, "1.0.0")
	pre := mustParse(t, "1.0.0-rc.1")
	if !stable.NewerThan(pre) {
		t.Fatal("稳定版 1.0.0 应当新于预发布版 1.0.0-rc.1")
	}
	if pre.NewerThan(stable) {
		t.Fatal("预发布版不应被判为新于同号稳定版（否则会反复提示已装的版本）")
	}
	if !pre.IsPreRelease() || stable.IsPreRelease() {
		t.Fatal("IsPreRelease 判定不正确")
	}
}

func TestVersionCompareIsConsistent(t *testing.T) {
	// CompareTo 必须是反对称的：a>b 等价于 b<a。这里抽样验证，
	// 防止将来改动时引入单向比较错误的比较器。
	versions := []string{"0.1.0", "0.1.1", "0.1.9", "0.1.10", "0.2.0", "1.0.0", "1.0.0-rc.1", "2.0.0"}
	for _, x := range versions {
		for _, y := range versions {
			a, b := mustParse(t, x), mustParse(t, y)
			if a.CompareTo(b) != -b.CompareTo(a) {
				t.Errorf("CompareTo 不满足反对称：%q vs %q", x, y)
			}
		}
	}
}
