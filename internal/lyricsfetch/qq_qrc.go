package lyricsfetch

import (
	"bytes"
	"compress/zlib"
	"encoding/hex"
	"fmt"
	"html"
	"io"
	"strings"
)

/* --------------------------------------------------------------------------
   QQ 音乐的 QRC（逐字）解密
   --------------------------------------------------------------------------
   「为什么不能直接用 crypto/des」——这是本文件存在的唯一理由：

   QQ 的 QRC 载荷用的不是标准 DES。它是一套**位序被重排过的 DES 变体**：
   密钥编排里 PC-2 对 D 半段的取位比标准少一位（`- 27` 而不是 `- 28`），
   初始/逆初始置换、E 扩展、P 置换的位取法也跟标准表逐位对不上。
   实测：同一份密文用 crypto/des（含标准 3DES）解出来，zlib 直接报
   "incorrect header check"；用下面这套就能得到正常的 zlib 流。

   所以本文件是「按 QQ 的变体逐字搬过来的 DES 本体」，不是教科书 DES，
   **不要**照标准 DES 的表去"修正"它 —— 那些看似别扭的位移正是兼容性本身。
   判据只有一条：真实密文能 inflate 出带时间戳的 QRC 文本（见 qq_qrc_test.go
   里冻结的真实向量与 live_qq_test.go）。

   整条链：hex → 8 字节分组 3DES 解密 → zlib inflate → UTF-8 文本。
   密文尾部可能有凑整填充，zlib 流结束即止，不需要（也没有）去填充。
   -------------------------------------------------------------------------- */

// qqQRCKey 是 QQ QRC 的 24 字节 3DES 密钥（三个 8 字节子密钥）。
var qqQRCKey = []byte("!@#)(*$%123ZXC!@!@#)(NHL")

const (
	qqDESEncrypt = 1
	qqDESDecrypt = 0
)

// qqSBox 是 DES 的 8 个 S 盒（此变体沿用标准 S 盒）。
var qqSBox = [8][64]int{
	{14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
		0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
		4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
		15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13},
	{15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
		3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5,
		0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
		13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9},
	{10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
		13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
		13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
		1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12},
	{7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
		13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
		10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
		3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14},
	{2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
		14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
		4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
		11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3},
	{12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
		10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
		9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
		4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13},
	{4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
		13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
		1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
		6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12},
	{13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
		1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
		7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
		2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11},
}

/** qqSBoxBit 把 6 位输入重排成 S 盒下标（「行 + 列」组合）。 */
func qqSBoxBit(a int) int { return (a & 32) | ((a & 31) >> 1) | ((a & 1) << 4) }

/**
 * qqInitialPermutation 做初始置换 IP。
 *
 * 注意：这不是标准 DES 的 IP —— 输入按小端读成两个 32 位字，取位按
 * 6/14/22/30、4/12/20/28… 的固定步长。照标准表写会解不出东西。
 */
func qqInitialPermutation(in []byte) (int, int) {
	v0 := int(in[0]) | int(in[1])<<8 | int(in[2])<<16 | int(in[3])<<24
	v1 := int(in[4]) | int(in[5])<<8 | int(in[6])<<16 | int(in[7])<<24
	bit := func(v, shift int, pos uint) int { return ((v >> uint(shift)) & 1) << pos }
	s0 := bit(v1, 6, 31) | bit(v1, 14, 30) | bit(v1, 22, 29) | bit(v1, 30, 28) |
		bit(v0, 6, 27) | bit(v0, 14, 26) | bit(v0, 22, 25) | bit(v0, 30, 24) |
		bit(v1, 4, 23) | bit(v1, 12, 22) | bit(v1, 20, 21) | bit(v1, 28, 20) |
		bit(v0, 4, 19) | bit(v0, 12, 18) | bit(v0, 20, 17) | bit(v0, 28, 16) |
		bit(v1, 2, 15) | bit(v1, 10, 14) | bit(v1, 18, 13) | bit(v1, 26, 12) |
		bit(v0, 2, 11) | bit(v0, 10, 10) | bit(v0, 18, 9) | bit(v0, 26, 8) |
		bit(v1, 0, 7) | bit(v1, 8, 6) | bit(v1, 16, 5) | bit(v1, 24, 4) |
		bit(v0, 0, 3) | bit(v0, 8, 2) | bit(v0, 16, 1) | bit(v0, 24, 0)
	s1 := bit(v1, 7, 31) | bit(v1, 15, 30) | bit(v1, 23, 29) | bit(v1, 31, 28) |
		bit(v0, 7, 27) | bit(v0, 15, 26) | bit(v0, 23, 25) | bit(v0, 31, 24) |
		bit(v1, 5, 23) | bit(v1, 13, 22) | bit(v1, 21, 21) | bit(v1, 29, 20) |
		bit(v0, 5, 19) | bit(v0, 13, 18) | bit(v0, 21, 17) | bit(v0, 29, 16) |
		bit(v1, 3, 15) | bit(v1, 11, 14) | bit(v1, 19, 13) | bit(v1, 27, 12) |
		bit(v0, 3, 11) | bit(v0, 11, 10) | bit(v0, 19, 9) | bit(v0, 27, 8) |
		bit(v1, 1, 7) | bit(v1, 9, 6) | bit(v1, 17, 5) | bit(v1, 25, 4) |
		bit(v0, 1, 3) | bit(v0, 9, 2) | bit(v0, 17, 1) | bit(v0, 25, 0)
	return s0, s1
}

/**
 * qqInversePermutation 做逆初始置换。
 *
 * 输出字节 i 的取位基址不是顺序的：i=3,2,1,0 对应基址 0,1,2,3，
 * i=7,6,5,4 对应基址 4,5,6,7（即 `data[3]` 取最低的那些位）。
 */
func qqInversePermutation(s0, s1 int) []byte {
	byteAt := func(base int) byte {
		return byte(((s1>>uint(base+24))&1)<<7 | ((s0>>uint(base+24))&1)<<6 |
			((s1>>uint(base+16))&1)<<5 | ((s0>>uint(base+16))&1)<<4 |
			((s1>>uint(base+8))&1)<<3 | ((s0>>uint(base+8))&1)<<2 |
			((s1>>uint(base))&1)<<1 | ((s0 >> uint(base)) & 1))
	}
	data := make([]byte, 8)
	for i := 0; i < 8; i++ {
		base := 11 - i
		if i <= 3 {
			base = 3 - i
		}
		data[i] = byteAt(base)
	}
	return data
}

/** qqRoundF 是轮函数 F：E 扩展（t1/t2）→ 与子密钥异或 → S 盒 → P 置换。 */
func qqRoundF(state int, key [6]int) int {
	t1 := ((state & 1) << 31) | ((state & 0xF8000000) >> 1) | ((state & 0x1F800000) >> 3) |
		((state & 0x01F80000) >> 5) | ((state & 0x001F8000) >> 7)
	t2 := ((state & 0x0001F800) << 15) | ((state & 0x00001F80) << 13) | ((state & 0x000001F8) << 11) |
		((state & 0x0000001F) << 9) | ((state & 0x80000000) >> 23)
	k0 := ((t1 >> 24) & 0xFF) ^ key[0]
	k1 := ((t1 >> 16) & 0xFF) ^ key[1]
	k2 := ((t1 >> 8) & 0xFF) ^ key[2]
	k3 := ((t2 >> 24) & 0xFF) ^ key[3]
	k4 := ((t2 >> 16) & 0xFF) ^ key[4]
	k5 := ((t2 >> 8) & 0xFF) ^ key[5]
	state = (qqSBox[0][qqSBoxBit(k0>>2)] << 28) |
		(qqSBox[1][qqSBoxBit(((k0&0x03)<<4)|(k1>>4))] << 24) |
		(qqSBox[2][qqSBoxBit(((k1&0x0F)<<2)|(k2>>6))] << 20) |
		(qqSBox[3][qqSBoxBit(k2&0x3F)] << 16) |
		(qqSBox[4][qqSBoxBit(k3>>2)] << 12) |
		(qqSBox[5][qqSBoxBit(((k3&0x03)<<4)|(k4>>4))] << 8) |
		(qqSBox[6][qqSBoxBit(((k4&0x0F)<<2)|(k5>>6))] << 4) |
		qqSBox[7][qqSBoxBit(k5&0x3F)]
	return ((state>>16)&1)<<31 | ((state>>25)&1)<<30 | ((state>>12)&1)<<29 | ((state>>11)&1)<<28 |
		((state>>3)&1)<<27 | ((state>>20)&1)<<26 | ((state>>4)&1)<<25 | ((state>>15)&1)<<24 |
		((state>>31)&1)<<23 | ((state>>17)&1)<<22 | ((state>>9)&1)<<21 | ((state>>6)&1)<<20 |
		((state>>27)&1)<<19 | ((state>>14)&1)<<18 | ((state>>1)&1)<<17 | ((state>>22)&1)<<16 |
		((state>>30)&1)<<15 | ((state>>24)&1)<<14 | ((state>>8)&1)<<13 | ((state>>18)&1)<<12 |
		((state>>0)&1)<<11 | ((state>>5)&1)<<10 | ((state>>29)&1)<<9 | ((state>>23)&1)<<8 |
		((state>>13)&1)<<7 | ((state>>19)&1)<<6 | ((state>>2)&1)<<5 | ((state>>26)&1)<<4 |
		((state>>10)&1)<<3 | ((state>>21)&1)<<2 | ((state>>28)&1)<<1 | ((state >> 7) & 1)
}

/** qqDESBlock 用已编排的 16 组子密钥对 8 字节分组做一次 DES（15 轮 + 末轮不换位）。 */
func qqDESBlock(in []byte, key [16][6]int) []byte {
	s0, s1 := qqInitialPermutation(in)
	for idx := 0; idx < 15; idx++ {
		prev := s1
		s1 = qqRoundF(s1, key[idx]) ^ s0
		s0 = prev
	}
	s0 = qqRoundF(s1, key[15]) ^ s0
	return qqInversePermutation(s0, s1)
}

// PC-1 / PC-2 与每轮左移位数（沿用标准表数值，但取位方式是本文件自己的约定）。
var (
	qqKeyPermC    = [28]int{56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35}
	qqKeyPermD    = [28]int{62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3}
	qqKeyCompress = [48]int{13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1, 40, 51, 30, 36, 46, 54, 29, 39, 50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31}
	qqKeyShifts   = [16]int{1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1}
)

/**
 * qqKeySchedule 是 **QQ 变体**的密钥编排。
 *
 * dShift 是全部差异所在：
 *
 *	dShift = 0（QQ）：D 半段取 `31-(t-27)` 位；
 *	dShift = 1（标准）：取 `31-(t-28)` 位。
 *
 * 只认标准那一种的话，解出来的字节看着像随机数，inflate 会报
 * "incorrect header check" —— 那不是「密钥抄错了」，而是这个偏移。
 * 保留参数只为让测试能证明「差异确实就在这一位上」。
 */
func qqKeySchedule(key []byte, mode int, dShift int) [16][6]int {
	var schedule [16][6]int
	v0 := int(key[0]) | int(key[1])<<8 | int(key[2])<<16 | int(key[3])<<24
	v1 := int(key[4]) | int(key[5])<<8 | int(key[6])<<16 | int(key[7])<<24
	bitAt := func(b int) int {
		if b < 32 {
			return (v0 >> uint(31-b)) & 1
		}
		return (v1 >> uint(63-b)) & 1
	}
	c, d := 0, 0
	for i := 0; i < 28; i++ {
		c |= bitAt(qqKeyPermC[i]) << uint(31-i)
		d |= bitAt(qqKeyPermD[i]) << uint(31-i)
	}
	for i := 0; i < 16; i++ {
		c = ((c << uint(qqKeyShifts[i])) | (c >> uint(28-qqKeyShifts[i]))) & 0xFFFFFFF0
		d = ((d << uint(qqKeyShifts[i])) | (d >> uint(28-qqKeyShifts[i]))) & 0xFFFFFFF0
		target := i
		if mode == qqDESDecrypt {
			target = 15 - i
		}
		schedule[target] = [6]int{}
		for j := 0; j < 24; j++ {
			schedule[target][j/8] |= ((c >> uint(31-qqKeyCompress[j])) & 1) << uint(7-(j%8))
		}
		for j := 24; j < 48; j++ {
			// ★ 那位之差：标准 DES 是 qqKeyCompress[j] - 28。
			schedule[target][j/8] |= ((d >> uint(31-(qqKeyCompress[j]-27+dShift))) & 1) << uint(7-(j%8))
		}
	}
	return schedule
}

/** qqTripleDESKeySetup 按加/解密模式编排三组子密钥（3DES = EDE，QQ 变体）。 */
func qqTripleDESKeySetup(key []byte, mode int) [3][16][6]int {
	return qqTripleDESKeySetupWith(key, mode, 0)
}

/** qqTripleDESKeySetupWith 允许指定密钥编排偏移（1 = 标准 DES，仅测试用）。 */
func qqTripleDESKeySetupWith(key []byte, mode, dShift int) [3][16][6]int {
	var out [3][16][6]int
	if mode == qqDESEncrypt {
		out[0] = qqKeySchedule(key[0:8], qqDESEncrypt, dShift)
		out[1] = qqKeySchedule(key[8:16], qqDESDecrypt, dShift)
		out[2] = qqKeySchedule(key[16:24], qqDESEncrypt, dShift)
		return out
	}
	out[0] = qqKeySchedule(key[16:24], qqDESDecrypt, dShift)
	out[1] = qqKeySchedule(key[8:16], qqDESEncrypt, dShift)
	out[2] = qqKeySchedule(key[0:8], qqDESDecrypt, dShift)
	return out
}

/** qqTripleDESBlock 对 8 字节分组依次过三组子密钥。 */
func qqTripleDESBlock(data []byte, key [3][16][6]int) []byte {
	out := data
	for i := 0; i < 3; i++ {
		out = qqDESBlock(out, key[i])
	}
	return out
}

/**
 * qqUnwrapLyric 剥掉 QQ 歌词的 XML 外壳，取出真正的歌词正文。
 *
 * 实测（2026-01，晴天 QRC）：解密后的明文长这样 ——
 *
 *	<?xml version="1.0" encoding="utf-8"?>
 *	<QrcInfos>
 *	<QrcHeadInfo SaveTime="269" Version="100"/>
 *	<LyricInfo LyricCount="1">
 *	<Lyric_1 LyricType="1" LyricContent="[ti:晴天]
 *	[ar:周杰伦]
 *	[0,2250]晴(0,160)天(160,160)"/>
 *	</LyricInfo>
 *	</QrcInfos>
 *
 * 注意 `LyricContent` 里是**真的换行**，不是 &#10;；正文里的引号才是实体。
 * 行级歌词（qrc=0）则没有外壳，直接就是 LRC 文本 —— 两种都要能过。
 */
func qqUnwrapLyric(raw string) string {
	const key = `LyricContent="`
	i := strings.Index(raw, key)
	if i < 0 {
		return raw
	}
	rest := raw[i+len(key):]
	j := strings.IndexByte(rest, '"')
	if j < 0 {
		return raw
	}
	return html.UnescapeString(rest[:j])
}

/**
 * qrcDecrypt 解出 QQ 的 QRC 文本（含字级时间戳）。
 *
 * 输入是接口返回的那串 **hex**（不是 base64），流程为
 * hex → 8 字节分组 3DES 解密 → zlib inflate → UTF-8。
 *
 * 失败一律返回 error，绝不「原样返回密文」：密文会被上层当成一行歌词推给界面
 * （一整串 hex），那比没有歌词更糟。
 */
func qrcDecrypt(encrypted string) (string, error) {
	raw := strings.TrimSpace(encrypted)
	if raw == "" {
		return "", nil
	}
	if len(raw)%2 != 0 {
		return "", fmt.Errorf("qrc: hex 长度为奇数")
	}
	buf, err := hex.DecodeString(raw)
	if err != nil {
		return "", fmt.Errorf("qrc: 不是 hex 密文: %w", err)
	}
	if len(buf) == 0 || len(buf)%8 != 0 {
		return "", fmt.Errorf("qrc: 密文长度 %d 不是 8 的倍数", len(buf))
	}
	schedule := qqTripleDESKeySetup(qqQRCKey, qqDESDecrypt)
	plain := make([]byte, 0, len(buf))
	for i := 0; i < len(buf); i += 8 {
		plain = append(plain, qqTripleDESBlock(buf[i:i+8], schedule)...)
	}
	zr, err := zlib.NewReader(bytes.NewReader(plain))
	if err != nil {
		return "", fmt.Errorf("qrc: 解密后不是 zlib 流（密钥或密文不对）: %w", err)
	}
	defer zr.Close()
	out, err := io.ReadAll(zr)
	if err != nil {
		return "", fmt.Errorf("qrc: zlib 解压失败: %w", err)
	}
	return string(out), nil
}
