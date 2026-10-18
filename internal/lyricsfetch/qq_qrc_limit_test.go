package lyricsfetch

import (
	"bytes"
	"compress/zlib"
	"encoding/hex"
	"strings"
	"testing"
)

// qqQRCTestBombHex 造一段「高压缩比」的合法 QRC 密文：
// 全零明文 → zlib → 补零对齐 → QQ 变体 3DES → hex。
//
// 这里只构造压缩流本身（几十万字节），**不**在测试里分配压缩前的巨大明文 ——
// 那正是要被拒绝的东西。
func qqQRCTestBombHex(t *testing.T, plainBytes int) string {
	t.Helper()
	var buf bytes.Buffer
	zw := zlib.NewWriter(&buf)
	chunk := make([]byte, 64<<10)
	for written := 0; written < plainBytes; written += len(chunk) {
		if _, err := zw.Write(chunk); err != nil {
			t.Fatalf("压缩失败: %v", err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("压缩收尾失败: %v", err)
	}
	data := append([]byte(nil), buf.Bytes()...)
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

// TestQRCDecryptRejectsDecompressionBomb 盯住 qrcDecrypt 的解压上限。
//
// 原来那一句是无上限的 io.ReadAll(zr)：QRC 正常只有几百 KB，而 zlib 的压缩比
// 可以到 500x 以上，上游一旦返回一个被构造过的响应（HTTP 体上限 12MB），
// 解压结果就是 GB 级内存分配 → 进程 OOM。这条用例投喂 64MiB 高压缩比密文
// （压缩后只有一百多 KB），断言它被**清楚报错拒绝**、不返回任何内容，
// 而不是把 64MiB 解出来。
func TestQRCDecryptRejectsDecompressionBomb(t *testing.T) {
	enc := qqQRCTestBombHex(t, 64<<20)
	if len(enc) > 512<<10 {
		t.Fatalf("密文构造异常：hex 长度 %d 远超预期", len(enc))
	}
	got, err := qrcDecrypt(enc)
	if err == nil {
		t.Fatalf("高压缩比密文必须被上限拒绝，实际解出 %d 字节", len(got))
	}
	if got != "" {
		t.Fatalf("失败时必须返回空串，实得 %d 字节", len(got))
	}
	if !strings.Contains(err.Error(), "上限") {
		t.Fatalf("错误信息应当说明「超过上限」，实际: %v", err)
	}
}
