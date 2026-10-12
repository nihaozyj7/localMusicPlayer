package main

import (
	"errors"
	"net/http"
	"os"
	"strings"
	"sync"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

/* ==========================================================================
   AI 接口地址：安全闸门（审查报告第 8 条 / 高危）
   --------------------------------------------------------------------------
   这个地址来自用户配置，而用它发出的请求带着**真实 Bearer 密钥**。旧实现只
   做了一句 `strings.TrimSpace` + 「看着不像 URL 就补 https://」，于是：

     · `http://evil.example/v1` → 密钥明文出网卡；
     · 第三方样式 JS（同源 import 就能拿到 setConfig）把地址改成自己的服务器
       → 下一次「元数据清洗 / 下载后整理」就把密钥送到那里。

   这里测的是**闸门**，不是字符串处理（规则本身在
   internal/bootstrap/ai_base_url_test.go）：
     1. 地址不合法时，一个字节都不许发出去；
     2. 本机模型服务（http://127.0.0.1:port）必须照旧可用 —— 闸门不能变成
        「谁都发不出去」；
     3. 非法地址要**留在配置里**（不许静默清空），否则用户看到的是
        「我填的地址没了、AI 还不工作」，而且无从排查。
   ========================================================================== */

// recordingTransport 记录「到底有没有请求真的发出去」，并且绝不放行。
type recordingTransport struct {
	mu    sync.Mutex
	calls []string
}

func (rt *recordingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	rt.mu.Lock()
	rt.calls = append(rt.calls, req.URL.String())
	rt.mu.Unlock()
	return nil, errors.New("测试用传输层：请求不该被发出去")
}

func (rt *recordingTransport) count() int {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	return len(rt.calls)
}

func (rt *recordingTransport) urls() []string {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	return append([]string(nil), rt.calls...)
}

// TestExtractMetaNeverSendsKeyToDisallowedBaseURL 闸门的核心：非法地址 → 零请求。
func TestExtractMetaNeverSendsKeyToDisallowedBaseURL(t *testing.T) {
	const key = "sk-real-key-must-not-leak-123456"
	cases := []struct{ name, base string }{
		{"明文 http 指向外部主机", "http://evil.example/v1"},
		{"明文 http 指向局域网 IP（密钥会明文出网卡）", "http://192.168.1.5:1234/v1"},
		{"https 但用 IP 字面量（证书无法验证）", "https://10.0.0.9/v1"},
		{"地址里塞了用户名密码", "https://attacker:secret@api.example/v1"},
		{"非 http 协议", "ftp://files.example/v1"},
		{"根本不是地址", "不是地址"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newAITagTestStore(t, tc.base)
			if _, err := NewConfigService(store).Set(map[string]any{"aiApiKey": key}); err != nil {
				t.Fatalf("写密钥失败: %v", err)
			}
			ai := NewAiService(store)
			rt := &recordingTransport{}
			ai.client = &http.Client{Transport: rt}

			_, err := ai.ExtractMeta("脏标题", "脏歌手", "", "a.mp3")
			if err == nil {
				t.Fatal("非法接口地址必须直接报错，而不是硬着头皮发请求")
			}
			if got := rt.count(); got != 0 {
				t.Fatalf("非法地址下发出了 %d 个请求（Authorization 头会带着真实密钥）：%v", got, rt.urls())
			}
			// 报告要求：出错信息里永不回显 URL 与密钥。
			msg := err.Error()
			if strings.Contains(msg, key) {
				t.Fatalf("出错信息回显了密钥：%q", msg)
			}
			if strings.Contains(msg, "evil.example") || strings.Contains(msg, "192.168.1.5") ||
				strings.Contains(msg, "10.0.0.9") || strings.Contains(msg, "attacker") {
				t.Fatalf("出错信息回显了地址本身：%q", msg)
			}
			// 非法地址必须留在配置里（用户能在设置页看到并改），不能被清空。
			if got := store.Get().AIBaseURL; strings.TrimSpace(got) == "" {
				t.Fatal("非法地址被静默清空了：用户会看到「我填的地址没了」，且不知道原因")
			}
		})
	}
}

// TestExtractMetaStillWorksWithLoopbackHTTPBase 反向对照：闸门不能把正常用法一起关掉。
//
// httptest 的地址就是 http://127.0.0.1:port —— 本地模型服务（LM Studio /
// Ollama）正是这个形状，必须照旧能发、能拿到结果。
func TestExtractMetaStillWorksWithLoopbackHTTPBase(t *testing.T) {
	calls := 0
	srv := fakeAIServer(t, `{"title":"干净的标题","artist":"歌手","album":""}`, &calls)
	store := newAITagTestStore(t, srv.URL+"/v1")

	ai := NewAiService(store)
	meta, err := ai.ExtractMeta("脏标题", "脏歌手", "", "a.mp3")
	if err != nil {
		t.Fatalf("本机回环 http 地址应当被放行，实际报错: %v", err)
	}
	if calls != 1 {
		t.Fatalf("应当恰好发出 1 次请求，实际 %d 次", calls)
	}
	if meta.Title != "干净的标题" {
		t.Fatalf("清洗结果没被解析出来: %+v", meta)
	}
}

// TestConfigServiceAIBaseURLNormalizeAndKeep 落盘：能修的修，不能修的原样留着。
func TestConfigServiceAIBaseURLNormalizeAndKeep(t *testing.T) {
	store := newAITagTestStore(t, "")
	svc := NewConfigService(store)

	if _, err := svc.Set(map[string]any{"aiBaseUrl": "api.openai.com/v1/"}); err != nil {
		t.Fatalf("写配置失败: %v", err)
	}
	if got := store.Get().AIBaseURL; got != "https://api.openai.com/v1" {
		t.Fatalf("漏协议 / 多尾斜杠应当被规范化，实际 %q", got)
	}

	const bad = "http://192.168.1.5:1234/v1"
	if _, err := svc.Set(map[string]any{"aiBaseUrl": bad}); err != nil {
		t.Fatalf("写配置失败: %v", err)
	}
	if got := store.Get().AIBaseURL; got != bad {
		t.Fatalf("非法地址必须原样保留（只 trim），实际 %q", got)
	}

	// 重新打开配置存储：normalize() 也不能把它清掉（否则「重启就没了」）。
	reopened, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("重新打开配置存储失败: %v", err)
	}
	if got := reopened.Get().AIBaseURL; got != bad {
		t.Fatalf("重新读盘后非法地址应当是 %q，实际 %q", bad, got)
	}
}

// TestConfigServiceGetReportsAIBaseURLProblem 界面上必须能看到「地址为什么不能用」。
//
// 只用后端闸门、界面上不说明原因的话，用户看到的是「AI 莫名不工作」：
// 地址不合法时后端拒绝发请求（密钥不出门），而设置页那一栏看起来一切正常。
// 所以 Get() 会把原因作为**派生字段**（aiBaseUrlProblem）交给前端显示。
func TestConfigServiceGetReportsAIBaseURLProblem(t *testing.T) {
	store := newAITagTestStore(t, "")
	svc := NewConfigService(store)

	// 合法地址：没有提示
	if _, err := svc.Set(map[string]any{"aiBaseUrl": "https://api.openai.com/v1"}); err != nil {
		t.Fatalf("写配置失败: %v", err)
	}
	if got := svc.Get().AIBaseURLProblem; got != "" {
		t.Fatalf("合法地址不该给提示，实际 %q", got)
	}

	// 非法地址：有提示，且提示里不回显地址
	const bad = "http://192.168.1.5:1234/v1"
	if _, err := svc.Set(map[string]any{"aiBaseUrl": bad}); err != nil {
		t.Fatalf("写配置失败: %v", err)
	}
	got := svc.Get().AIBaseURLProblem
	if strings.TrimSpace(got) == "" {
		t.Fatal("非法地址必须在配置里给出原因，否则用户只看到「AI 不工作」")
	}
	if strings.Contains(got, "192.168.1.5") {
		t.Fatalf("提示里不该回显地址本身：%q", got)
	}
	if !strings.Contains(got, "https") {
		t.Fatalf("提示要说清规则（必须是 https），实际 %q", got)
	}

	// 派生字段**不许落盘**：它只在 Get() 里按当前地址现算。
	raw, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatalf("读配置文件失败: %v", err)
	}
	if strings.Contains(string(raw), "aiBaseUrlProblem") {
		t.Fatal("派生字段 aiBaseUrlProblem 被写进了 config.json —— 它只是给前端看的")
	}
}
