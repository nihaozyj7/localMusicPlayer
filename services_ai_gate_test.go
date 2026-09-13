package main

import (
	"testing"

	"musicplayer/internal/bootstrap"
)

// TestAiLyricsCleanGate 「自动匹配歌词时使用 AI 清洗元数据」开关必须真的能关掉 AI。
//
// 用户报过：自动匹配歌词要等 8~18 秒（AI 清洗元数据）。开关关掉后，
// cleanMetaFor 只能走本地整形 sanitizeLyricsMeta，不再请求 AI。
//
// 这里不联网，只断言闸门本身：配置齐全（baseUrl + apiKey）时，
// aiLyricsClean=false 必须让 aiEnabled() 为 false。
func TestAiLyricsCleanGate(t *testing.T) {
	t.Setenv("MUSICPLAYER_DATA_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("创建配置存储失败: %v", err)
	}

	svc := NewConfigService(store)
	if _, err := svc.Set(map[string]any{
		"aiBaseUrl":     "https://example.invalid/v1",
		"aiApiKey":      "test-key",
		"aiLyricsClean": true,
	}); err != nil {
		t.Fatalf("写配置失败: %v", err)
	}

	ai := NewAiService(store)
	if !ai.Enabled() {
		t.Fatal("前置条件不成立：配好 baseUrl/apiKey 后 AiService.Enabled() 应为 true")
	}

	ls := &LyricsService{store: store, ai: ai}
	if !ls.aiEnabled() {
		t.Fatal("aiLyricsClean=true 时 aiEnabled() 应为 true")
	}

	// 关掉开关：即便 AI 配置齐全，也不该再清洗元数据
	if _, err := svc.Set(map[string]any{"aiLyricsClean": false}); err != nil {
		t.Fatalf("关闭开关失败: %v", err)
	}
	if ls.aiEnabled() {
		t.Fatal("aiLyricsClean=false 时 aiEnabled() 必须为 false（否则用户关不掉 AI 等待）")
	}

	// 重新打开后恢复
	if _, err := svc.Set(map[string]any{"aiLyricsClean": true}); err != nil {
		t.Fatalf("重新打开失败: %v", err)
	}
	if !ls.aiEnabled() {
		t.Fatal("重新打开后 aiEnabled() 应为 true")
	}
}
