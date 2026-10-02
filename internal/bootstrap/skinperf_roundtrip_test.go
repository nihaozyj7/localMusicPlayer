package bootstrap

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// 档位要真的能落盘并读回（设置项改完必须持久化）。
//
// 为什么单独测这一条：这个字段是「用户改一次、之后每次启动都要生效」的类型。
// 如果只写进内存而没进 SYNCED_KEYS / 配置结构，表现就是「改了，重启又回到默认」
// —— 而界面看起来完全正常（下拉框当场变了），非常容易漏。
func TestSkinPerformanceModeRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")

	cfg := DefaultConfig()
	cfg.SkinPerformanceMode = "performance"
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("序列化失败: %v", err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatalf("写入失败: %v", err)
	}

	// 读回并确认字段还在
	back, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读取失败: %v", err)
	}
	var got Config
	if err := json.Unmarshal(back, &got); err != nil {
		t.Fatalf("反序列化失败: %v", err)
	}
	if got.SkinPerformanceMode != "performance" {
		t.Errorf("落盘再读回后 = %q，期望 performance", got.SkinPerformanceMode)
	}

	// JSON 里的键名必须是前端 SYNCED_KEYS 用的那个（camelCase）
	var m map[string]any
	if err := json.Unmarshal(back, &m); err != nil {
		t.Fatal(err)
	}
	if _, ok := m["skinPerformanceMode"]; !ok {
		t.Error("JSON 里找不到 skinPerformanceMode 键（前端同步会失效）")
	}
}

// 两个合法档位经 normalize 都必须原样保留（不能把 performance 改掉）。
func TestSkinPerformanceModePreservesValidValues(t *testing.T) {
	for _, v := range SkinPerformanceModes {
		cfg := DefaultConfig()
		cfg.SkinPerformanceMode = v
		normalize(cfg)
		if cfg.SkinPerformanceMode != v {
			t.Errorf("合法值 %q 经 normalize 后变成了 %q", v, cfg.SkinPerformanceMode)
		}
	}
}
