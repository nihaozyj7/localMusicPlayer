package main

import (
	"os"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

/* ==========================================================================
   桌面模式「启动时恢复哪一个」的规则
   --------------------------------------------------------------------------
   需求：桌面背景歌词在启动时自动启用（如果用户已经启用）；关掉这个开关后，
   桌面背景歌词只在本次启动生效。

   于是配置里有两个字段要一起看：
     · ShowDesktopWallpaper      —— 本次运行开着吗
     · AutoStartDesktopWallpaper —— 下次启动要自动开吗

   StartupDesktopMode 是这两条规则的唯一实现，启动恢复（early_theme.go）与
   「用户中途改配置就退让」两条路径都读它。所以它值得单独钉住。
   ========================================================================== */

func TestStartupDesktopMode(t *testing.T) {
	cases := []struct {
		name      string
		show      bool
		autoStart bool
		lyrics    bool
		want      string
	}{
		{
			name: "背景歌词开着且允许自动启动 → 启动时恢复背景歌词",
			show: true, autoStart: true, want: desktopModeWallpaper,
		},
		{
			name: "背景歌词开着但关掉了自动启动 → 只在本次启动生效，启动时不恢复",
			show: true, autoStart: false, want: desktopModeOff,
		},
		{
			name: "背景歌词没开、自动启动开着 → 也不该凭空打开",
			show: false, autoStart: true, want: desktopModeOff,
		},
		{
			name: "两个都关 → 什么都不恢复",
			show: false, autoStart: false, want: desktopModeOff,
		},
		{
			name:   "桌面歌词不受自动启动开关影响（它的开关本身就是持久的）",
			lyrics: true, autoStart: false, want: desktopModeLyrics,
		},
		{
			name: "背景歌词与桌面歌词同时为真 → 以背景歌词为准（互斥由 normalize 收敛）",
			show: true, autoStart: true, lyrics: true, want: desktopModeWallpaper,
		},
		{
			name: "背景歌词开着但自动启动关着、桌面歌词也开着 → 退到桌面歌词",
			show: true, autoStart: false, lyrics: true, want: desktopModeLyrics,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := bootstrap.Config{
				ShowDesktopWallpaper:      tc.show,
				AutoStartDesktopWallpaper: tc.autoStart,
				ShowDesktopLyrics:         tc.lyrics,
			}
			if got := cfg.StartupDesktopMode(); got != tc.want {
				t.Fatalf("StartupDesktopMode() = %q，期望 %q", got, tc.want)
			}
		})
	}
}

// TestAutoStartDesktopWallpaperDefaultsOn 守住默认值。
//
// 默认必须是 true：加入这个开关之前的行为就是「上次开着，下次启动自动恢复」。
// 默认成 false 会让所有老用户在升级后觉得「背景歌词不再自动启动了」——
// 那是静默的行为回退，只有这个断言能挡住它。
func TestAutoStartDesktopWallpaperDefaultsOn(t *testing.T) {
	if !bootstrap.DefaultConfig().AutoStartDesktopWallpaper {
		t.Fatal("AutoStartDesktopWallpaper 默认值必须为 true（与加入开关之前的行为一致）")
	}
}

// TestAutoStartDesktopWallpaperPersists 确认这个开关真的会落盘。
//
// 它必须能被 setConfig（applyPatch）认出：前端推上来但后端没有对应分支的话，
// 表现就是「设置里关了，重启后又变回开着」——这正是 showDesktopWallpaper
// 曾经踩过的坑（见 services.go#applyPatch 里那段注释）。
func TestAutoStartDesktopWallpaperPersists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LMPLAYER_DATA_DIR", dir)

	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	// 走前端的落盘路径
	cfg := store.Get()
	applyPatch(&cfg, map[string]any{
		"showDesktopWallpaper":      true,
		"autoStartDesktopWallpaper": false,
	})
	if err := store.Update(func(c *bootstrap.Config) { *c = cfg }); err != nil {
		t.Fatalf("Update: %v", err)
	}

	// 重新读一遍磁盘上的配置：这才是「重启之后」看到的东西
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("重新加载配置: %v", err)
	}
	got := reopened.Get()
	if !got.ShowDesktopWallpaper {
		t.Fatalf("ShowDesktopWallpaper 没有落盘: %v", got.ShowDesktopWallpaper)
	}
	if got.AutoStartDesktopWallpaper {
		t.Fatalf("AutoStartDesktopWallpaper 没有落盘: %v", got.AutoStartDesktopWallpaper)
	}
	// 「本次开着 + 不自动启动」= 只在本次启动生效
	if mode := got.StartupDesktopMode(); mode != desktopModeOff {
		t.Fatalf("关掉自动启动后启动模式应为 %q，实际 %q", desktopModeOff, mode)
	}
}

// TestNormalizeKeepsAutoStart 确认 normalize 不会把自动启动开关弄丢。
//
// normalize 在每次 Update 之后都会跑（见 bootstrap.Store.Update），里面确实
// 会改写桌面歌词那一组开关。断言它没有顺手把这个字段一起清掉。
func TestNormalizeKeepsAutoStart(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LMPLAYER_DATA_DIR", dir)

	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	// 手写一份「背景歌词开着、自动启动关着」的配置，再让 Store 读进来 ——
	// 走的是真实的加载 + normalize 路径。
	cfgPath := filepath.Join(dir, "config.json")
	raw := `{"showDesktopWallpaper":true,"autoStartDesktopWallpaper":false}`
	if err := os.WriteFile(cfgPath, []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	got := store.Get()
	if !got.ShowDesktopWallpaper {
		t.Fatal("ShowDesktopWallpaper 被 normalize 清掉了")
	}
	if got.AutoStartDesktopWallpaper {
		t.Fatal("AutoStartDesktopWallpaper=false 被 normalize 改成了 true")
	}
	if mode := got.StartupDesktopMode(); mode != desktopModeOff {
		t.Fatalf("启动模式应为 %q，实际 %q", desktopModeOff, mode)
	}
}
