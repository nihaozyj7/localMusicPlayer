package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

/* ==========================================================================
   AI 密钥「不回传前端」的回归测试
   --------------------------------------------------------------------------
   背景：ConfigService 是绑定给前端的 Wails 服务，它的返回值会被序列化后
   交给页面。而页面运行环境允许加载**用户数据目录中的任意第三方皮肤 JS**，
   所以密钥一旦回传就等于「任何能在界面里跑代码的组件都能读到」。

   这组测试锁定三条约定：
     1. Get() 不回传真密钥（打码），但用 aiApiKeySet 告诉前端「配了」；
     2. 前端把占位串推回来时**不能**覆盖掉真密钥（否则改一次别的设置就丢密钥）；
     3. 占位串与派生字段都不会写进磁盘上的配置文件。
   ========================================================================== */

// newSecretFixture 造一个带指定密钥的独立配置服务。
func newSecretFixture(t *testing.T, key string) *ConfigService {
	t.Helper()
	svc, _ := newCfgFixture(t)
	if _, err := svc.Set(map[string]any{"aiApiKey": key}); err != nil {
		t.Fatalf("写入密钥失败: %v", err)
	}
	return svc
}

func TestConfigServiceGetDoesNotLeakAPIKey(t *testing.T) {
	const secret = "sk-super-secret-value-1234567890"
	svc := newSecretFixture(t, secret)

	got := svc.Get()
	if got.AIAPIKey == secret {
		t.Fatal("Get() 把真实 API Key 原样回传给了前端")
	}
	if strings.Contains(got.AIAPIKey, "sk-super-secret") {
		t.Fatalf("回传的密钥里仍带有原文片段: %q", got.AIAPIKey)
	}
	if !got.AIAPIKeySet {
		t.Fatal("配了密钥时 aiApiKeySet 必须为 true，否则前端无法显示配置状态")
	}

	// 序列化之后也不能出现明文（前端拿到的就是这份 JSON）
	raw, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("序列化失败: %v", err)
	}
	if strings.Contains(string(raw), secret) {
		t.Fatal("序列化后的配置 JSON 里出现了明文密钥")
	}
}

func TestConfigServiceGetReportsUnsetKey(t *testing.T) {
	svc, _ := newCfgFixture(t)
	got := svc.Get()
	if got.AIAPIKeySet {
		t.Fatal("没配密钥时 aiApiKeySet 应为 false")
	}
	if got.AIAPIKey != "" {
		t.Fatalf("没配密钥时应回传空串，实际 %q", got.AIAPIKey)
	}
}

func TestConfigServiceSetIgnoresMaskedKey(t *testing.T) {
	const secret = "sk-original-key-abcdef"
	svc := newSecretFixture(t, secret)

	// 前端把 Get() 拿到的占位串原样推回来（用户没改这个字段）
	returned := svc.Get().AIAPIKey
	if returned == "" {
		t.Fatal("前置条件失败：Get() 应当返回非空占位串")
	}
	if _, err := svc.Set(map[string]any{"aiApiKey": returned}); err != nil {
		t.Fatalf("Set 失败: %v", err)
	}

	// 真密钥必须原封不动：读回来仍是同一把（Get 会再打码，所以比对 Set 后的落盘值）
	raw, err := os.ReadFile(strings.TrimSpace(svc.Path()))
	if err != nil {
		t.Fatalf("读取配置失败: %v", err)
	}
	if !strings.Contains(string(raw), secret) {
		t.Fatalf("占位串覆盖了真密钥，磁盘上已找不到原密钥")
	}
}

func TestConfigServiceSetAcceptsNewKey(t *testing.T) {
	svc := newSecretFixture(t, "sk-old")

	if _, err := svc.Set(map[string]any{"aiApiKey": "sk-new-value"}); err != nil {
		t.Fatalf("Set 失败: %v", err)
	}
	raw, err := os.ReadFile(strings.TrimSpace(svc.Path()))
	if err != nil {
		t.Fatalf("读取配置失败: %v", err)
	}
	if !strings.Contains(string(raw), "sk-new-value") {
		t.Fatal("用户输入的新密钥没有被保存")
	}
}

func TestConfigServiceSetAcceptsClearingKey(t *testing.T) {
	svc := newSecretFixture(t, "sk-to-be-cleared")

	// 清空是有效操作（= 删除密钥）
	if _, err := svc.Set(map[string]any{"aiApiKey": ""}); err != nil {
		t.Fatalf("Set 失败: %v", err)
	}
	if svc.Get().AIAPIKeySet {
		t.Fatal("清空密钥后 aiApiKeySet 应为 false")
	}
}

func TestMaskedKeyNeverPersisted(t *testing.T) {
	const secret = "sk-persist-check"
	svc := newSecretFixture(t, secret)

	// 连续 Get()（会打码副本）+ Set 其它字段 → 磁盘上仍是真密钥
	_ = svc.Get()
	if _, err := svc.Set(map[string]any{"volume": 0.5}); err != nil {
		t.Fatalf("Set 失败: %v", err)
	}
	_ = svc.Get()

	raw, err := os.ReadFile(strings.TrimSpace(svc.Path()))
	if err != nil {
		t.Fatalf("读取配置失败: %v", err)
	}
	if !strings.Contains(string(raw), secret) {
		t.Fatal("磁盘上的配置应当保留真实密钥（打码只针对回传，不影响落盘）")
	}
	if strings.Contains(string(raw), "aiApiKeySet") {
		t.Fatal("aiApiKeySet 是派生字段，不应落盘")
	}
}
