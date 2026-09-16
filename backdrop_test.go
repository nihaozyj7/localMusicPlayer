package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"

	"localmusicplayer/internal/bootstrap"
)

// 材质名 → Wails 枚举的映射必须一一对上，否则设置界面选 Mica 却拿到别的东西。
func TestBackdropTypeFor(t *testing.T) {
	cases := []struct {
		mode    string
		want    application.BackdropType
		wantSet bool
	}{
		{"off", application.None, false},
		{"auto", application.Auto, true},
		{"mica", application.Mica, true},
		{"acrylic", application.Acrylic, true},
		{"tabbed", application.Tabbed, true},
		// 大小写与空格无关，无法识别的值退回 off（= 不启用）
		{"Mica", application.Mica, true},
		{"  ACRYLIC ", application.Acrylic, true},
		{"", application.None, false},
		{"glass", application.None, false},
	}

	for _, c := range cases {
		got, ok := backdropTypeFor(c.mode)
		if ok != c.wantSet {
			t.Errorf("backdropTypeFor(%q) 启用标记 = %v，期望 %v", c.mode, ok, c.wantSet)
		}
		if got != c.want {
			t.Errorf("backdropTypeFor(%q) = %v，期望 %v", c.mode, got, c.want)
		}
	}
}

func TestNormalizeBackdropMode(t *testing.T) {
	cases := map[string]string{
		"":         "off",
		"off":      "off",
		"MICA":     "mica",
		" Acrylic": "acrylic",
		"blur":     "off",
	}
	for in, want := range cases {
		if got := bootstrap.NormalizeBackdropMode(in); got != want {
			t.Errorf("NormalizeBackdropMode(%q) = %q，期望 %q", in, got, want)
		}
	}
}

// 配置落盘后必须能被读回来（hand-edit 的 "Mica" 也要认）。
func TestConfigBackdropNormalize(t *testing.T) {
	cfg := bootstrap.DefaultConfig()
	if cfg.NativeBackdrop != "off" {
		t.Fatalf("默认材质应为 off，实际 %q", cfg.NativeBackdrop)
	}
	if !bootstrap.ValidBackdropMode(cfg.NativeBackdrop) {
		t.Fatalf("默认值 %q 不在受支持列表里", cfg.NativeBackdrop)
	}
}

// 系统探测在 Windows 上要给出可读的版本串（不支持时也不能是空串）。
func TestBackdropOSInfo(t *testing.T) {
	supported, label := backdropOSInfo()
	if label == "" {
		t.Error("系统描述不应为空")
	}
	t.Logf("原生材质支持=%v 系统=%s", supported, label)
}
