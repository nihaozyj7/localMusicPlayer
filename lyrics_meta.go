package main

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

/* ==========================================================================
   在线歌词查询的「元数据整形」
   --------------------------------------------------------------------------
   为什么需要这一层（实测到的问题）：
   曲库扫描时没有标签的文件会用文件名兜底当标题，于是标题里混着歌词、编号、
   广告与各种标点，例如：

     《此去半生》-吴昊 “花开又花谢花漫天，是你忽隐又忽现，…”

   把这种标题原样发给在线歌词来源会同时踩两个坑：
     1. 各来源按这个关键词做全文搜索，返回的全是同名/翻唱/无关结果；
     2. 打分函数拿「标题」和候选标题做比较，一个字都对不上，于是**所有候选
        都塌成 0 分** —— Aggregator.Match 里「最高分 < 35 视为没匹配到」
        直接把结果判成「没有歌词」。表现就是「搜了一两秒就说没有歌词」。

   所以发请求之前先把标题整形：剥掉包裹标点、砍掉歌词尾巴、按分隔符拆出歌手。
   整形是纯本地的（不联网、不等 AI），保证歌词搜索的耗时不被元数据清洗拖垮。
   ========================================================================== */

// lyricTailMarkers 是「从这里开始已经是歌词，不再是标题」的标记。
// 只在标记前面已经有内容时才截断（否则会把以引号开头的正常标题清空）。
var lyricTailMarkers = []string{"“", "”", "♪", "「", "」", "『", "』", "【"}

// wrapPairs 成对包裹的标点：整串被它们包住时剥掉一层。
var wrapPairs = map[string]string{
	"《": "》", "〈": "〉", "「": "」", "『": "』", "【": "】",
	"(": ")", "（": "）", "[": "]", "{": "}", "“": "”", "\"": "\"", "'": "'",
}

// titleArtistSeparators 标题与歌手之间常见的分隔符（按优先级）。
//
// needCJK：两侧都不含中日韩文字时不生效。`Jay-Z` 里的连字符是歌名的一部分，
// 拆成「Jay / Z」比不拆更糟；而中文文件名里的 `《此去半生》-吴昊` 必须拆开。
var titleArtistSeparators = []struct {
	sep     string
	needCJK bool
}{
	{" - ", false}, {" – ", false}, {" — ", false},
	{"－", false}, {"—", false}, {"–", false}, {"_", false}, {"|", false}, {"｜", false},
	{"-", true},
}

// leadingIndexRe 去掉「01. 」「07 - 」这类用于排序的编号前缀。
var leadingIndexRe = regexp.MustCompile(`^\s*(?:\d{1,3}|[A-Da-d])\s*[.\-_)>、]\s*`)

// longTailCutRunes 标题超过这个长度就认为后面混进了歌词，在第一个句读处截断。
const longTailCutRunes = 30

// sanitizeLyricsMeta 把「像文件名的脏标题」整理成可用的（标题, 歌手）。
//
// 只为在线歌词/封面查询服务：它不做任何网络请求，也不依赖 AI，
// 因此可以在每次搜索前无成本地调用。返回的字段可能是空串（表示「这个字段
// 没有可用信息」），调用方据此决定要不要拿它去打分。
func sanitizeLyricsMeta(title, artist string) (string, string) {
	title = strings.TrimSpace(title)
	artist = strings.TrimSpace(artist)

	if isPlaceholderMeta(title) || isPlaceholderTitle(title) {
		title = ""
	}
	if isPlaceholderMeta(artist) {
		artist = ""
	}

	title = normalizeDirtyTitle(title)

	// 标题里带着「- 歌手」时拆开：这是中文文件名最常见的形态，
	// 拆开之后标题能精确比对、歌手能拿到 30 分，命中率完全不同。
	//   例：`《此去半生》-吴昊` → 标题「此去半生」+ 歌手「吴昊」
	if title != "" {
		t, a := splitTitleArtist(title)
		// 拆出来的两段各自还要再过一遍整形：书名号/引号可能只包住其中一段
		title = normalizeDirtyTitle(t)
		if artist == "" && a != "" {
			artist = normalizeDirtyTitle(a)
		}
	}

	title = strings.TrimSpace(title)
	artist = strings.TrimSpace(artist)
	if isPlaceholderMeta(title) {
		title = ""
	}
	if isPlaceholderMeta(artist) {
		artist = ""
	}
	// 整形之后仍然过长（没找到句读的歌词串）：这种标题拿去打分只会把所有
	// 候选打成 0 分，不如当成「没有标题信息」，让打分退回基础分。
	if utf8.RuneCountInString(title) > 48 {
		title = ""
	}
	return title, artist
}

// normalizeDirtyTitle 剥掉包裹标点、砍掉歌词尾巴、去掉编号前缀。
//
// 「剥壳」和「砍尾巴」要交替做：`《此去半生》-吴昊 “歌词…”`
// 一开始两头并不配对（尾巴是引号不是书名号），必须先砍掉歌词尾巴，
// 才能看到 `《此去半生》-吴昊` 这个包裹结构。
func normalizeDirtyTitle(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	for i := 0; i < 3; i++ {
		next := stripWrappers(s)
		next = cutLyricTail(next)
		if next == s {
			break
		}
		s = next
	}

	s = leadingIndexRe.ReplaceAllString(s, "")
	return strings.Trim(s, " \t-—_|｜·•*")
}

// stripWrappers 剥掉一层成对的包裹标点：《"晴天"》 → 晴天。
func stripWrappers(s string) string {
	runes := []rune(strings.TrimSpace(s))
	if len(runes) < 2 {
		return s
	}
	close, ok := wrapPairs[string(runes[0])]
	if !ok || string(runes[len(runes)-1]) != close {
		return s
	}
	inner := strings.TrimSpace(string(runes[1 : len(runes)-1]))
	if inner == "" {
		return s
	}
	return inner
}

// cutLyricTail 砍掉标题后面跟着的歌词。
func cutLyricTail(s string) string {
	// 引号/音符等「这里是歌词」的标记处截断（位置 > 0，保留标记前的内容）
	if idx := indexOfAnyString(s, lyricTailMarkers, 1); idx > 0 {
		s = s[:idx]
	}
	// 过长才在句读处截断：短标题里的逗号可能真的是标题的一部分
	if utf8.RuneCountInString(s) > longTailCutRunes {
		if idx := indexOfAnyRune(s, "，。！？；,;"); idx > 0 {
			s = s[:idx]
		}
	}
	return strings.TrimSpace(s)
}

// splitTitleArtist 在分隔符处把「标题 - 歌手」拆开；拆不开时返回 (原串, "")。
func splitTitleArtist(s string) (string, string) {
	for _, item := range titleArtistSeparators {
		i := strings.Index(s, item.sep)
		if i <= 0 {
			continue
		}
		left := strings.TrimSpace(s[:i])
		right := strings.TrimSpace(s[i+len(item.sep):])
		if left == "" || right == "" {
			continue
		}
		// 右边不能是「另一个标题」（太长就当作是标题的一部分）
		if utf8.RuneCountInString(right) > 32 {
			continue
		}
		if item.needCJK && !hasCJK(left) && !hasCJK(right) {
			continue
		}
		return left, right
	}
	return s, ""
}

// hasCJK 判断字符串里是否有中日韩文字。
func hasCJK(s string) bool {
	for _, r := range s {
		if isWordRune(r) && r > 0x2E80 {
			return true
		}
	}
	return false
}

// usableLyricsMetaForScore 判断一个字段能不能拿去给候选打分。
//
// 打分用的是「精确/包含/相似度」，脏字段会让所有候选一起塌到 0 分；
// 这种情况下宁愿当成「没有这个信息」，让打分退回基础分而不是否定一切。
func usableLyricsMetaForScore(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" || isPlaceholderMeta(s) {
		return false
	}
	if utf8.RuneCountInString(s) > 48 {
		return false
	}
	// 还带着包裹标点/引号/句读的串一定是没整形干净的脏数据：
	// 拿它去打分只会把所有候选打成 0 分。
	if strings.ContainsAny(s, "《》〈〉「」『』【】“”♪，。！？；") {
		return false
	}
	// 标点占比过高的标题多半是歌词串：统计字母/数字/汉字的比例
	total, word := 0, 0
	for _, r := range s {
		if r == ' ' || r == '\t' {
			continue
		}
		total++
		if isWordRune(r) {
			word++
		}
	}
	if total == 0 {
		return false
	}
	return float64(word)/float64(total) >= 0.5
}

func isWordRune(r rune) bool {
	switch {
	case r >= '0' && r <= '9', r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
		return true
	case r >= 0x4E00 && r <= 0x9FFF: // CJK 统一表意文字
		return true
	case r >= 0x3040 && r <= 0x30FF: // 日文假名
		return true
	case r >= 0xAC00 && r <= 0xD7AF: // 韩文
		return true
	case r >= 0x0400 && r <= 0x04FF: // 西里尔
		return true
	}
	return false
}

// needsCleanMeta 判断元数据是否「脏到值得花一次 AI 请求」。
//
// 干净的标题/歌手直接跳过 AI：歌词自动匹配在播放路径上，每次切歌都等一次
// AI 会让「有没有歌词」变得完全不可预期（实测一次 AI 调用 8~18 秒）。
func needsCleanMeta(title, artist string) bool {
	title = strings.TrimSpace(title)
	artist = strings.TrimSpace(artist)
	if title == "" {
		return false
	}
	if artist == "" || isPlaceholderMeta(artist) || isPlaceholderTitle(title) {
		return true
	}
	if utf8.RuneCountInString(title) > longTailCutRunes {
		return true
	}
	if strings.ContainsAny(title, "《》「」『』【】“”\"♪") {
		return true
	}
	// 标题里出现句读，多半混了歌词
	return strings.ContainsAny(title, "，。！？；")
}

func indexOfAnyString(s string, needles []string, from int) int {
	best := -1
	for _, n := range needles {
		i := strings.Index(s[from:], n)
		if i < 0 {
			continue
		}
		i += from
		if best < 0 || i < best {
			best = i
		}
	}
	return best
}

func indexOfAnyRune(s string, chars string) int {
	for i, r := range s {
		if strings.ContainsRune(chars, r) {
			return i
		}
	}
	return -1
}
