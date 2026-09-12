package bootstrap

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf16"
)

// FNV-1a 32bit 参数（与前端 utils.js#stableId 保持一致）
const (
	fnvOffset32 = 2166136261
	fnvPrime32  = 16777619
)

// StableID 由字符串派生稳定 id。
// 必须与前端 frontend/src/js/utils.js#stableId 输出完全一致，
// 否则重扫后歌单、播放队列、收藏的引用会全部失效。
//
// 关键点：JS 的 charCodeAt 按 UTF-16 码元取值，中文等字符占 2 个码元，
// 因此这里也用 utf16.Encode 取码元，而不能直接遍历 UTF-8 字节。
func StableID(input string, prefix string) string {
	h := uint32(fnvOffset32)
	for _, unit := range utf16.Encode([]rune(input)) {
		h ^= uint32(unit)
		h *= fnvPrime32
	}
	return prefix + "_" + strconv.FormatUint(uint64(h), 36)
}

// RandomID 生成随机 id（用于歌单等新建对象）
func RandomID(prefix string) string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return prefix + "_" + hex.EncodeToString([]byte(strconv.FormatInt(0, 10)))
	}
	return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(buf))
}

// AudioExtensions 支持的音频扩展名（小写，不含点）
var AudioExtensions = []string{
	"mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma", "ape", "alac", "aiff", "aif", "dsf",
}

// NativePlayableExtensions WebView2（Chromium）可原生解码的格式
var NativePlayableExtensions = map[string]bool{
	"mp3":  true,
	"flac": true,
	"wav":  true,
	"m4a":  true,
	"aac":  true,
	"ogg":  true,
	"opus": true,
	"alac": true,
}

// IsAudioExt 判断扩展名是否为受支持的音频
func IsAudioExt(ext string) bool {
	ext = strings.ToLower(strings.TrimPrefix(ext, "."))
	for _, e := range AudioExtensions {
		if e == ext {
			return true
		}
	}
	return false
}

// NeedsTranscode 判断某格式是否需要后端转码才能播放
func NeedsTranscode(ext string) bool {
	ext = strings.ToLower(strings.TrimPrefix(ext, "."))
	return !NativePlayableExtensions[ext]
}
