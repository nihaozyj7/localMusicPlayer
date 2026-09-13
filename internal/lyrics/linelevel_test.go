package lyrics

import "testing"

func TestNormalizeLineLevel(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "标准行级 LRC 原样保留（语义不变）",
			in:   "[00:03.00]第一句\n[00:07.50]第二句",
			want: "[00:03.00]第一句\n[00:07.50]第二句",
		},
		{
			name: "增强 LRC（逐字 <...>）剥成整行",
			in:   "[00:12.00]<00:12.00>你<00:12.30>好\n[00:14.00]<00:14.00>世<00:14.40>界",
			want: "[00:12.00]你好\n[00:14.00]世界",
		},
		{
			name: "一行多个时间标签展开成多行",
			in:   "[00:12.00][01:20.00]同一句",
			want: "[00:12.00]同一句\n[01:20.00]同一句",
		},
		{
			name: "QRC 行标签 + 词级时长标注",
			in:   "[12000,800]你(0,300)好(300,500)",
			want: "[00:12.00]你好",
		},
		{
			name: "KRC 行标签 + 字级标记",
			in:   "[12000,800]<0,300,0>你<300,500,0>好",
			want: "[00:12.00]你好",
		},
		{
			name: "没有时间轴只剥不删（纯文本原样）",
			in:   "第一句\n第二句",
			want: "第一句\n第二句",
		},
		{
			name: "字级与行级混排",
			in:   "[00:01.00]普通句\n[00:02.00]<00:02.00>逐<00:02.50>字句",
			want: "[00:01.00]普通句\n[00:02.00]逐字句",
		},
		{
			name: "空文本",
			in:   "   ",
			want: "   ",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := NormalizeLineLevel(c.in)
			if got != c.want {
				t.Fatalf("NormalizeLineLevel(%q) =\n%q\nwant\n%q", c.in, got, c.want)
			}
			// 幂等：已经归一化过的文本再跑一遍不应变化
			if again := NormalizeLineLevel(got); again != got {
				t.Fatalf("幂等性失败：%q -> %q", got, again)
			}
		})
	}
}

func TestHasWordTiming(t *testing.T) {
	if !HasWordTiming("[00:12.00]<00:12.00>你") {
		t.Fatal("增强 LRC 应被判为字级")
	}
	if !HasWordTiming("[12000,800]<0,300,0>你") {
		t.Fatal("KRC 应被判为字级")
	}
	if HasWordTiming("[00:12.00]普通行级歌词") {
		t.Fatal("普通行级 LRC 不该被判为字级")
	}
}
