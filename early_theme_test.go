package main

import (
	"path/filepath"
	"strings"
	"testing"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/theme"
)

/* ==========================================================================
   首帧主题（early_theme.go）的回归测试
   --------------------------------------------------------------------------
   这段脚本是**页面首帧**的唯一依据，一旦它生成了非法 CSS（比如把用户手改的
   配置原样拼进去），表现是整个界面底色错乱，而且非常难查。
   所以这里把几个关键不变量固定下来。
   ========================================================================== */

// newTestStore 在临时目录里建一份干净配置（配置目录由 LMPLAYER_DATA_DIR 决定）
func newTestStore(t *testing.T) *bootstrap.Store {
	t.Helper()
	t.Setenv("LMPLAYER_DATA_DIR", filepath.Join(t.TempDir(), "data"))
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("创建配置失败: %v", err)
	}
	return store
}

func newTestThemeManager(t *testing.T) *theme.Manager {
	t.Helper()
	mgr, err := theme.NewManager(t.TempDir())
	if err != nil {
		t.Fatalf("创建主题管理器失败: %v", err)
	}
	return mgr
}

func TestEarlyThemeScriptAppliesSavedLightTheme(t *testing.T) {
	store := newTestStore(t)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Theme = "light-minimal"
		c.ThemeMode = "light"
	}); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}

	js := string(earlyThemeScript(store, newTestThemeManager(t)))
	if !strings.Contains(js, `setAttribute('data-theme',"light-minimal")`) {
		t.Fatalf("没有把保存的主题写进首帧脚本: %s", js)
	}
	if !strings.Contains(js, `setAttribute('data-mode',"light")`) {
		t.Fatalf("没有把深浅模式写进首帧脚本: %s", js)
	}
	// 非取色主题不该带种子色：否则 <html> 上会一直留着上一轮的 --seed
	if strings.Contains(js, "--seed") {
		t.Fatalf("非取色主题不该写种子色: %s", js)
	}
}

func TestEarlyThemeScriptCarriesCoverSeed(t *testing.T) {
	store := newTestStore(t)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Theme = "cover-dark"
		c.ThemeMode = "dark"
		c.AccentFromCover = true
		c.CoverSeed = "#3FA76B"
		c.CoverSeed2 = "#20503a"
	}); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}

	js := string(earlyThemeScript(store, newTestThemeManager(t)))
	if !strings.Contains(js, `'--seed',"#3FA76B"`) {
		t.Fatalf("封面取色主题必须带上保存的种子色: %s", js)
	}
	if !strings.Contains(js, `'--seed-2',"#20503a"`) {
		t.Fatalf("次色也要带上: %s", js)
	}
	// 近似底色必须是同色系（绿），而不是默认的近黑
	if !strings.Contains(js, "--bg-app") {
		t.Fatalf("缺少首帧近似底色: %s", js)
	}
}

func TestEarlyThemeScriptRejectsMalformedSeed(t *testing.T) {
	store := newTestStore(t)
	// 模拟用户手改配置：把一段 CSS 塞进颜色字段
	if err := store.Update(func(c *bootstrap.Config) {
		c.Theme = "cover-dark"
		c.CoverSeed = "red; } body { display:none"
		c.CoverSeed2 = "url(evil.png)"
	}); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}

	js := string(earlyThemeScript(store, newTestThemeManager(t)))
	if strings.Contains(js, "display:none") || strings.Contains(js, "evil.png") {
		t.Fatalf("非法颜色值必须被丢弃: %s", js)
	}
	if strings.Contains(js, "--seed") {
		t.Fatalf("没有合法种子时不该写种子令牌: %s", js)
	}
}

func TestEarlyThemeScriptFallsBackWhenThemeMissing(t *testing.T) {
	store := newTestStore(t)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Theme = "theme-that-was-deleted"
	}); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}

	js := string(earlyThemeScript(store, newTestThemeManager(t)))
	if !strings.Contains(js, `setAttribute('data-theme',"dark-minimal")`) {
		t.Fatalf("主题不存在时应回退到默认主题: %s", js)
	}
}

func TestFirstFrameWindowColourFollowsSavedTheme(t *testing.T) {
	store := newTestStore(t)
	mgr := newTestThemeManager(t)

	// 深色主题：用内置 dark-minimal 自己声明的 --bg-app(#0b0c12)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Theme = "dark-minimal"
		c.ThemeMode = "dark"
	}); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}
	if got := firstFrameWindowColour(store, mgr); got.Red != 0x0b || got.Green != 0x0c || got.Blue != 0x12 {
		t.Errorf("深色主题的窗口底色应取 --bg-app(#0b0c12), 得到 %+v", got)
	}

	// 浅色主题必须跟着变 —— 否则窗口露出来的那一下还是黑的（这正是本次修复）
	if err := store.Update(func(c *bootstrap.Config) {
		c.Theme = "light-minimal"
		c.ThemeMode = "light"
	}); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}
	if got := firstFrameWindowColour(store, mgr); got.Red != 0xec || got.Green != 0xee || got.Blue != 0xf4 {
		t.Errorf("浅色主题的窗口底色应取 --bg-app(#eceef4), 得到 %+v", got)
	}

	// 主题被删掉时回退到默认主题的底色，而不是随便一个值
	if err := store.Update(func(c *bootstrap.Config) { c.Theme = "gone-theme" }); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}
	if got := firstFrameWindowColour(store, mgr); got.Red != 0x0b || got.Green != 0x0c || got.Blue != 0x12 {
		t.Errorf("主题不存在时应回退到默认主题底色, 得到 %+v", got)
	}
}

func TestFirstFrameHexMatchesEarlyThemeScript(t *testing.T) {
	store := newTestStore(t)
	mgr := newTestThemeManager(t)
	if err := store.Update(func(c *bootstrap.Config) {
		c.Theme = "cover-dark"
		c.ThemeMode = "dark"
		c.AccentFromCover = true
		c.CoverSeed = "#3FA76B"
		c.CoverSeed2 = "#20503a"
	}); err != nil {
		t.Fatalf("写入配置失败: %v", err)
	}

	// 窗口底色与 /early-theme.js 写给 --bg-app 的值必须**一模一样**：
	// 不一致就等于把「黑闪」换成了「另一种颜色的闪」。
	hex := firstFrameHex(resolveEarlyTheme(store, mgr), mgr)
	if hex == "" {
		t.Fatal("取色主题应能算出一个近似底色")
	}
	if js := string(earlyThemeScript(store, mgr)); !strings.Contains(js, hex) {
		t.Errorf("窗口底色 %s 没有出现在首帧脚本里: %s", hex, js)
	}

	// 最后兜底：主题目录不可用时不能 panic，也不能凭空编颜色
	if got := firstFrameWindowColour(store, nil); got.Red == 0 && got.Green == 0 && got.Blue == 0 {
		t.Errorf("没有主题管理器时应回退到默认底色, 得到 %+v", got)
	}
}

func TestSanitizeSeedColor(t *testing.T) {
	cases := map[string]string{
		"#3fa76b":             "#3fa76b",
		"  #3FA76B ":          "#3fa76b",
		"#abc":                "#abc",
		"#abcd":               "",
		"3fa76b":              "",
		"rgb(1,2,3)":          "",
		"#gggggg":             "",
		"":                    "",
		"#fff !important":     "",
		"red;--x:#000;body{}": "",
	}
	for in, want := range cases {
		if got := sanitizeSeedColor(in); got != want {
			t.Errorf("sanitizeSeedColor(%q) = %q, 期望 %q", in, got, want)
		}
	}
}

func TestMixHexMovesTowardsTarget(t *testing.T) {
	// 纯白混 0% 黑还是白，混 100% 黑就是黑；中间值必须落在两者之间
	if got := mixHex("#ffffff", "#000000", 0); got != "#ffffff" {
		t.Errorf("ratio=0 应保持原色, 得到 %s", got)
	}
	if got := mixHex("#ffffff", "#000000", 1); got != "#000000" {
		t.Errorf("ratio=1 应变成目标色, 得到 %s", got)
	}
	if got := mixHex("#ffffff", "#000000", 0.5); got != "#808080" {
		t.Errorf("ratio=0.5 应得到中灰, 得到 %s", got)
	}
	// 认不出来的颜色原样返回，绝不产生非法 CSS
	if got := mixHex("nope", "#000000", 0.5); got != "nope" {
		t.Errorf("非法输入应原样返回, 得到 %s", got)
	}
}
