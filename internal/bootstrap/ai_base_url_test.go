package bootstrap

import (
	"strings"
	"testing"
)

// TestNormalizeAIBaseURLCases 「AI 接口地址」的允许 / 拒绝规则。
//
// 对应审查报告第 8 条（高危）：这个地址来自用户配置，而用它发出的请求带着
// **真实 Bearer 密钥**，旧代码却是 `/v := strings.TrimSpace(...)`：漏协议补
// `https://`，其余一律照发 —— `http://evil.example/v1` 会被原样接受，密钥
// 明文出网卡；第三方样式 JS（同源 import）也能改这个键。
//
// 这里的每一行都是**行为契约**：改规则请改这张表和
// frontend/tests/ai-base-url-parity.test.js（前端那份只用于提前提示用户，
// 真正的闸门是这份代码）。
func TestNormalizeAIBaseURLCases(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string // 期望的规范化结果（wantErr 为真时忽略）
		// wantErr 为真表示「不允许使用」。
		wantErr bool
	}{
		{name: "空 = 未配置，不算错误", in: "   ", want: ""},
		{name: "标准 https 地址原样通过", in: "https://api.openai.com/v1", want: "https://api.openai.com/v1"},
		{name: "末尾斜杠去掉（拼 /chat/completions 才不出现双斜杠）", in: "https://api.openai.com/v1/", want: "https://api.openai.com/v1"},
		{name: "漏协议补 https（与插件源一样只修手滑）", in: "api.deepseek.com/v1", want: "https://api.deepseek.com/v1"},
		{name: "去掉首尾空白", in: "  https://api.moonshot.cn/v1  ", want: "https://api.moonshot.cn/v1"},
		{name: "带端口保留端口", in: "https://gw.example.com:8443/v1", want: "https://gw.example.com:8443/v1"},
		{name: "根路径不带斜杠", in: "https://gw.example.com/", want: "https://gw.example.com"},

		{name: "本机回环 http 放行（LM Studio / Ollama）", in: "http://127.0.0.1:1234/v1", want: "http://127.0.0.1:1234/v1"},
		{name: "localhost 放行", in: "http://localhost:11434/v1", want: "http://localhost:11434/v1"},
		{name: "IPv6 回环放行", in: "http://[::1]:8080/v1", want: "http://[::1]:8080/v1"},
		{name: "*.localhost 也算本机", in: "http://ollama.localhost:11434/v1", want: "http://ollama.localhost:11434/v1"},

		{name: "★明文 http 指向外部主机：拒绝", in: "http://evil.example/plugins", wantErr: true},
		{name: "★明文 http 指向局域网 IP：拒绝", in: "http://192.168.1.5:1234/v1", wantErr: true},
		{name: "https 用非回环 IP 字面量：拒绝（证书无法验证）", in: "https://10.0.0.9/v1", wantErr: true},
		{name: "非 http 协议：拒绝", in: "ftp://files.example/v1", wantErr: true},
		{name: "file 协议：拒绝", in: "file:///C:/v1", wantErr: true},
		{name: "URL 里带用户名密码：拒绝（会被当主机名解析、并进日志）", in: "https://user:pass@api.example/v1", wantErr: true},
		{name: "带查询串：拒绝（拼路径会拼坏，且可能藏密钥）", in: "https://api.example/v1?key=sk-x", wantErr: true},
		{name: "带 # 锚点：拒绝", in: "https://api.example/v1#frag", wantErr: true},
		{name: "只有协议没主机：拒绝", in: "https://", wantErr: true},
		{name: "非 URL 的纯文本：拒绝", in: "不是地址", wantErr: true},
		{name: "打错的协议头（漏冒号）：拒绝", in: "https//api.example/v1", wantErr: true},
		{name: "单标签主机名：拒绝（靠 LLMNR 解析，可被冒充）", in: "https://llm-gateway/v1", wantErr: true},
		{name: "主机名带下划线等非法字符：拒绝", in: "https://api_evil.example/v1", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeAIBaseURL(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("NormalizeAIBaseURL(%q) 必须报错（不允许使用），实际通过并返回 %q", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("NormalizeAIBaseURL(%q) 不该报错: %v", tc.in, err)
			}
			if got != tc.want {
				t.Fatalf("NormalizeAIBaseURL(%q) = %q，期望 %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestNormalizeAIBaseURLErrorNeverEchoesValue 出错信息里不能回显地址。
//
// 报告的要求原话是「出错信息里永不回显 URL 与密钥」。这条不是为了好看：
// 这个错误会写进日志、也会经 errText 拼进给用户看的提示，而用户完全可能
// 把密钥直接写在地址的查询串里（`?api_key=sk-…`），一打印就跟着进日志。
func TestNormalizeAIBaseURLErrorNeverEchoesValue(t *testing.T) {
	const secret = "sk-do-not-log-me-0123456789"
	for _, in := range []string{
		"http://evil.example/v1?api_key=" + secret,
		"https://192.168.1.5/v1?api_key=" + secret,
		"https://" + secret + ":x@api.example/v1",
	} {
		_, err := NormalizeAIBaseURL(in)
		if err == nil {
			t.Fatalf("NormalizeAIBaseURL(%q) 应当被拒（它含明文 http / IP 字面量 / 用户名密码）", in)
		}
		msg := err.Error()
		if strings.Contains(msg, secret) {
			t.Fatalf("出错信息回显了地址里的密钥：%q", msg)
		}
		if strings.Contains(msg, "evil.example") || strings.Contains(msg, "192.168.1.5") {
			t.Fatalf("出错信息回显了地址本身：%q", msg)
		}
	}
}

// TestNormalizeAIBaseURLStoredKeepsInvalid 落盘路径：能修的修，不能修的**原样留着**。
//
// 这是「不许静默丢弃用户输入」的具体体现：非法地址如果在这里被清空，用户看到
// 的现象就是「我明明填了地址，界面上一刷新就空了、AI 还不工作」，而日志里没有
// 任何线索。留着它，用户至少能在设置页看到自己填的内容并按提示改。
func TestNormalizeAIBaseURLStoredKeepsInvalid(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{name: "漏协议补全", in: "api.openai.com/v1", want: "https://api.openai.com/v1"},
		{name: "多尾斜杠去掉", in: "https://api.openai.com/v1//", want: "https://api.openai.com/v1"},
		{name: "首尾空白去掉", in: "\t https://api.openai.com/v1 \n", want: "https://api.openai.com/v1"},
		{name: "非法值原样保留（只 trim）", in: "  http://192.168.1.5:1234/v1  ", want: "http://192.168.1.5:1234/v1"},
		{name: "非 URL 也原样保留", in: "不是地址", want: "不是地址"},
		{name: "空还是空", in: "   ", want: ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := NormalizeAIBaseURLStored(tc.in); got != tc.want {
				t.Fatalf("NormalizeAIBaseURLStored(%q) = %q，期望 %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestValidEndpointHost 主机名规则本身。
func TestValidEndpointHost(t *testing.T) {
	for _, h := range []string{"localhost", "127.0.0.1", "::1", "api.openai.com", "gw.example.com", "xn--fiqs8s.example"} {
		if !validEndpointHost(h) {
			t.Errorf("validEndpointHost(%q) 应为 true", h)
		}
	}
	for _, h := range []string{"", "llm-gateway", "不是地址", "a..b", ".example.com", "api_evil.example", "api example.com"} {
		if validEndpointHost(h) {
			t.Errorf("validEndpointHost(%q) 应为 false", h)
		}
	}
}

// TestIsLoopbackHost 回环判定本身（http 放行的唯一依据）。
func TestIsLoopbackHost(t *testing.T) {
	for _, h := range []string{"localhost", "LOCALHOST", "localhost.", "127.0.0.1", "127.0.0.5", "::1", "ollama.localhost"} {
		if !isLoopbackHost(h) {
			t.Errorf("isLoopbackHost(%q) 应为 true", h)
		}
	}
	for _, h := range []string{"", "example.com", "192.168.1.5", "10.0.0.9", "localhost.evil.com", "notlocalhost"} {
		if isLoopbackHost(h) {
			t.Errorf("isLoopbackHost(%q) 应为 false —— 它会把明文 http 放出网卡", h)
		}
	}
}
