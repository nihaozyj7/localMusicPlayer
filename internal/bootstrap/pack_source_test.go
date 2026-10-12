package bootstrap

import (
	"strings"
	"testing"
)

// TestNormalizePackSourceCases 插件仓库地址的允许 / 落回规则。
//
// 对应审查报告第 41 条（中危）：旧实现只判断 `https://` / `http://` **前缀**，
// 于是 `http://evil.example/plugins` 被原样接受。这个地址取回的是
// `index.json` + 一个个 **JS 文件**，装完之后在同源页面里执行（docs/42 §8.4），
// 而清单里的 sha256 是随清单一起送来的（自证）—— 明文链路能被任何一跳改写，
// 等于把「在同源页面执行任意 JS」的权力交给中间人。
//
// 与 AI 接口地址共用一套判据（parseSecureEndpoint），所以两张表的期望一致：
// 唯一的区别是这里的非法值**落回默认地址**（这个键没有「拒绝保存」这个选择，
// 见 NormalizePackSource 的注释），并由 PackSourceProblem 说明原因。
func TestNormalizePackSourceCases(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string // 期望结果；wantDefault 为真时忽略
		// wantDefault 为真表示「落回 DefaultPackSource」。
		wantDefault bool
	}{
		{name: "默认地址原样", in: DefaultPackSource, want: DefaultPackSource},
		{name: "空 = 用默认地址", in: "  ", wantDefault: true},
		{name: "漏协议补 https", in: "github.com/x/y", want: "https://github.com/x/y"},
		{name: "末尾斜杠去掉", in: "https://raw.githubusercontent.com/o/r/main/plugins/", want: "https://raw.githubusercontent.com/o/r/main/plugins"},
		{name: "首尾空白去掉", in: " https://github.com/x/y ", want: "https://github.com/x/y"},
		{name: "本机回环 http 放行（本地调试自己的静态服务器）", in: "http://127.0.0.1:8080/plugins", want: "http://127.0.0.1:8080/plugins"},
		{name: "localhost 放行", in: "http://localhost:5173/plugins", want: "http://localhost:5173/plugins"},

		{name: "★明文 http 指向外部主机：落回默认（报告里的那一例）", in: "http://evil.example/plugins", wantDefault: true},
		{name: "明文 http 指向局域网 IP：落回默认", in: "http://192.168.1.5/plugins", wantDefault: true},
		{name: "https 用非回环 IP 字面量：落回默认", in: "https://10.0.0.9/plugins", wantDefault: true},
		{name: "非 http 协议：落回默认", in: "ftp://files.example/plugins", wantDefault: true},
		{name: "file 协议：落回默认", in: "file:///C:/plugins", wantDefault: true},
		{name: "地址里带用户名密码：落回默认", in: "https://user:pass@github.com/x/y", wantDefault: true},
		{name: "带查询串：落回默认", in: "https://github.com/x/y?token=secret", wantDefault: true},
		{name: "带 # 锚点：落回默认", in: "https://github.com/x/y#frag", wantDefault: true},
		{name: "单标签主机名：落回默认", in: "https://packsrv/plugins", wantDefault: true},
		{name: "非 URL 的纯文本：落回默认", in: "不是地址", wantDefault: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := NormalizePackSource(tc.in)
			if tc.wantDefault {
				if got != DefaultPackSource {
					t.Fatalf("NormalizePackSource(%q) = %q，期望落回默认地址", tc.in, got)
				}
				return
			}
			if got != tc.want {
				t.Fatalf("NormalizePackSource(%q) = %q，期望 %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestPackSourceProblem 「地址被落回默认」必须给出原因，且不回显地址。
//
// 落回默认而不说明原因，用户看到的现象是「我改了地址，刷新一下又变回去了」，
// 第一反应是「没保存成功」—— 于是他会反复重试，而问题其实在地址本身。
func TestPackSourceProblem(t *testing.T) {
	// 可用（或为空 = 用默认）时没有提示
	for _, ok := range []string{"", "   ", DefaultPackSource, "github.com/x/y", "http://127.0.0.1:8080/plugins"} {
		if got := PackSourceProblem(ok); got != "" {
			t.Errorf("PackSourceProblem(%q) 不该有提示，实际 %q", ok, got)
		}
	}

	const bad = "http://evil.example/plugins"
	got := PackSourceProblem(bad)
	if strings.TrimSpace(got) == "" {
		t.Fatal("明文 http 地址必须给出提示，否则用户以为是自己没保存成功")
	}
	if strings.Contains(got, "evil.example") {
		t.Fatalf("提示里不该回显地址本身：%q", got)
	}
	if !strings.Contains(got, "https") || !strings.Contains(got, "127.0.0.1") {
		t.Fatalf("提示要说清规则（https / 本机回环），实际 %q", got)
	}
	// 与规范化结论必须一致：有提示 ⇔ 地址会落回默认
	for _, in := range []string{bad, "https://github.com/x/y", "http://192.168.1.5/p", "https://user:pass@github.com/x/y"} {
		problem := PackSourceProblem(in)
		normalized := NormalizePackSource(in)
		if (problem != "") != (normalized == DefaultPackSource && strings.TrimSpace(in) != "") {
			t.Errorf("PackSourceProblem(%q)=%q 与 NormalizePackSource(%q)=%q 的结论不一致", in, problem, in, normalized)
		}
	}
}
