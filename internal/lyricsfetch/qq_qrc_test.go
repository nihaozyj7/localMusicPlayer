package lyricsfetch

import (
	"bytes"
	"compress/zlib"
	"encoding/hex"
	"strings"
	"testing"

	"localmusicplayer/internal/lyrics"
)

/* --------------------------------------------------------------------------
   QQ QRC 解密
   --------------------------------------------------------------------------
   这个算法是「QQ 自己那套位序重排过的 3DES」：任何一处照标准 DES 写都会
   悄悄解不出东西。所以这里钉的是**真实密文**，而不是自产自销的往返：

     · 下面两个 8 字节向量取自 2026-01 的《晴天》QRC 响应（songMid
       0039MnYb0qxYhV），明文是用上游 QQMusicApi 的 tripledes.py 跑出来的
       ground truth；
     · 第 1 组（block0）拼错置换就会红；
     · 第 2 组（block1）是**第一组之外唯一能抓住 S 盒那一格错的样本** ——
       tripledes 的 sbox[1][23] 是 15，不是标准 DES 的 14，照标准改回去时
       block0 仍然是对的，只有 block1 会变。
   -------------------------------------------------------------------------- */

func TestQQVariantDESMatchesRealCiphertext(t *testing.T) {
	cases := []struct {
		name     string
		cipher   string
		expected string
	}{
		{"block0", "E5D94A70C91F7022", "789c4d9a5baf56d7"}, // 解出来正好是 zlib 头 78 9c
		{"block1", "38E3DD4AEC7EC2A6", "7586eff91588abf5"}, // 抓住 sbox[1][23] 的差异
	}
	schedule := qqTripleDESKeySetup(qqQRCKey, qqDESDecrypt)
	for _, tc := range cases {
		in, err := hex.DecodeString(tc.cipher)
		if err != nil {
			t.Fatalf("%s: 向量不是 hex: %v", tc.name, err)
		}
		got := hex.EncodeToString(qqTripleDESBlock(in, schedule))
		if got != tc.expected {
			t.Fatalf("%s: 解出 %s，期望 %s —— 置换/S 盒/密钥编排被改动过了", tc.name, got, tc.expected)
		}
	}
}

// 标准 DES 的键编排（dShift=1）在真实密文上**必然**解错。
//
// 这条用例的作用是防止有人「顺手」把 `- 27` 改成 `- 28`（看起来更像标准 DES）：
// 那样改动不会让编译失败、也不会让往返测试失败，只会让线上所有逐字歌词变成乱码。
func TestQQKeyScheduleDiffersFromStandardDES(t *testing.T) {
	qq := qqTripleDESKeySetupWith(qqQRCKey, qqDESDecrypt, 0)
	std := qqTripleDESKeySetupWith(qqQRCKey, qqDESDecrypt, 1)
	if qq[0][0] == std[0][0] {
		t.Fatal("两套编排不该相等：QQ 变体与标准 DES 的差别正是这一位")
	}
	in, _ := hex.DecodeString("E5D94A70C91F7022")
	if got := hex.EncodeToString(qqTripleDESBlock(in, std)); got == "789c4d9a5baf56d7" {
		t.Fatal("标准编排竟然也解对了，说明上面的差异断言没有意义")
	}
}

// qqTestEncrypt 是测试用的反向链路：zlib 压缩 → 补零对齐 → QQ 变体 3DES → hex。
//
// 有了它才能在没有网络的情况下测整条 qrcDecrypt（往返自洽性）；
// 算法本身对不对由上面那条真实密文用例负责。
func qqTestEncrypt(t *testing.T, plain string) string {
	t.Helper()
	var buf bytes.Buffer
	zw := zlib.NewWriter(&buf)
	if _, err := zw.Write([]byte(plain)); err != nil {
		t.Fatalf("压缩失败: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("压缩收尾失败: %v", err)
	}
	data := buf.Bytes()
	for len(data)%8 != 0 {
		data = append(data, 0)
	}
	schedule := qqTripleDESKeySetup(qqQRCKey, qqDESEncrypt)
	out := make([]byte, 0, len(data))
	for i := 0; i < len(data); i += 8 {
		out = append(out, qqTripleDESBlock(data[i:i+8], schedule)...)
	}
	return strings.ToUpper(hex.EncodeToString(out))
}

const qqTestXML = `<?xml version="1.0" encoding="utf-8"?>
<QrcInfos>
<QrcHeadInfo SaveTime="269" Version="100"/>
<LyricInfo LyricCount="1">
<Lyric_1 LyricType="1" LyricContent="[ti:示例]
[ar:示例歌手]
[0,1000]<0,500,0>甲<500,500,0>乙"/>
</LyricInfo>
</QrcInfos>`

func TestQRCDecryptRoundTrip(t *testing.T) {
	got, err := qrcDecrypt(qqTestEncrypt(t, qqTestXML))
	if err != nil {
		t.Fatalf("解密失败: %v", err)
	}
	if got != qqTestXML {
		t.Fatalf("往返结果不一致:\n拿到 %q\n期望 %q", got, qqTestXML)
	}
	// 端到端：剥壳之后的正文必须被认成**字级**歌词，否则「逐字播放」就是空话
	inner := qqUnwrapLyric(got)
	if !strings.Contains(inner, "甲") {
		t.Fatalf("剥壳没拿到正文: %q", inner)
	}
	if !lyrics.HasWordTiming(inner) {
		t.Fatalf("剥壳后的正文应被识别为字级歌词: %q", inner)
	}
}

// 解不开时必须报错，绝不能把 hex 密文原样当歌词交出去 ——
// 那会在界面上显示成一整串十六进制（比没有歌词更糟）。
func TestQRCDecryptRejectsGarbage(t *testing.T) {
	cases := []struct {
		name string
		in   string
	}{
		{"空串", ""},
		{"长度奇数", "abc"},
		{"不是 hex", "[00:00.00]歌词"},
		{"长度不是 8 的倍数", "deadbe"},
		{"合法 hex 但解不开", strings.Repeat("deadbeef", 40)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := qrcDecrypt(tc.in)
			if tc.in == "" {
				if err != nil || got != "" {
					t.Fatalf("空串应安静地返回空: %q, %v", got, err)
				}
				return
			}
			if err == nil {
				t.Fatalf("应报错，却返回了 %q", got)
			}
			if got != "" {
				t.Fatalf("失败时必须返回空串，实得 %q", got)
			}
			if strings.Contains(err.Error(), tc.in) && len(tc.in) > 16 {
				t.Fatalf("错误信息里不该把整段密文带上: %v", err)
			}
		})
	}
}

func TestQQUnwrapLyric(t *testing.T) {
	const inner = "[ti:晴天]\n[0,1000]甲(0,500)乙(500,500)"
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "XML 外壳",
			in:   "<?xml version=\"1.0\"?>\n<QrcInfos><LyricInfo><Lyric_1 LyricType=\"1\" LyricContent=\"" + inner + "\"/></LyricInfo></QrcInfos>",
			want: inner,
		},
		{
			name: "没有外壳（行级 LRC 就是这样）",
			in:   "[00:00.00]第一行\n[00:01.00]第二行",
			want: "[00:00.00]第一行\n[00:01.00]第二行",
		},
		{
			name: "正文里的实体要还原",
			in:   `<QrcInfos><Lyric_1 LyricContent="[ti:A &amp; B]&quot;引号&quot;"/>`,
			want: "[ti:A & B]\"引号\"",
		},
		{
			name: "属性没闭合就原样返回，不吞内容",
			in:   `<QrcInfos><Lyric_1 LyricContent="[ti:坏的`,
			want: `<QrcInfos><Lyric_1 LyricContent="[ti:坏的`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := qqUnwrapLyric(tc.in); got != tc.want {
				t.Fatalf("得到 %q，期望 %q", got, tc.want)
			}
		})
	}
}
