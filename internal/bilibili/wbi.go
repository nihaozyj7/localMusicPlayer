package bilibili

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"strings"
	"unicode/utf8"
)

// mixinKeyEncTab 是 Bilibili WBI 签名使用的字符重排表。
// 必须与官方 JS 实现保持完全一致，否则 w_rid 校验不过。
var mixinKeyEncTab = []int{
	46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
	33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
	61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
	36, 20, 34, 44, 52,
}

func getMixinKey(orig string) string {
	var buf []byte
	for _, idx := range mixinKeyEncTab {
		if idx < len(orig) {
			buf = append(buf, orig[idx])
		}
		if len(buf) >= 32 {
			break
		}
	}
	if len(buf) < 32 {
		return string(buf)
	}
	return string(buf[:32])
}

func md5Hex(s string) string {
	sum := md5.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}

func filterWbiValue(s string) string {
	return strings.Map(func(r rune) rune {
		if strings.ContainsRune("!'()*", r) {
			return -1
		}
		return r
	}, s)
}

// encodeURIComponent 模拟浏览器 encodeURIComponent 的编码规则。
// Go 的 url.QueryEscape 会把空格编码成 +，而 WBI 算法要求 %20。
func encodeURIComponent(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			strings.ContainsRune("-_.!~*'()", r) {
			b.WriteRune(r)
			continue
		}
		var raw [4]byte
		n := utf8.EncodeRune(raw[:], r)
		for i := 0; i < n; i++ {
			fmt.Fprintf(&b, "%%%02X", raw[i])
		}
	}
	return b.String()
}
