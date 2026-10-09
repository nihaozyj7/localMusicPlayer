package lyrics

import (
	"sort"
	"strconv"
	"strings"
)

/* ==========================================================================
   字级（逐字）歌词 → 增强 LRC
   --------------------------------------------------------------------------
   本程序对外只认两种时间轴：

     行级 LRC  [00:12.00]你好
     字级 LRC  [00:12.00]<00:12.000>你<00:12.300>好   ← 增强 LRC（canonical）

   但来源并不都是这个样子。实测到的字级写法有五种：

     1. 增强 LRC：    [00:12.00]<00:12.00>你<00:12.30>好
     2. QRC（QQ音乐）：[12000,800]你(0,300)好(300,500)
     3. KRC（酷狗）：   [12000,800]<0,300,0>你<300,500,0>好
     4. 网易云 klyric：[00:12.00]你[00:12.30]好
     5. 网易云 YRC：   [12000,598]（只有时间的行头）
                       [12000,300]你[12300,300]好

   这些文本原样显示会把 <00:12.00>、(0,300) 变成歌词正文；而像旧实现那样
   「一律剥掉」又等于把逐字能力丢掉（需求要的是**优先使用字级歌词**）。

   所以在「读进来」的边界统一归一化成增强 LRC：

     · Load / AutoMatch / Save / 在线接口都过这一层，缓存、歌词工作台、
       皮肤、内嵌拿到的是同一种格式（其余环节不必再认识 QRC/KRC/YRC）；
     · 写进歌曲文件之前仍用 NormalizeLineLevel 剥成行级 —— 逐字标记进了
       别的播放器的标签里会变成正文（这是原有约束，不能破）；
     · 幂等：NormalizeWordLevel(NormalizeWordLevel(x)) == NormalizeWordLevel(x)。

   识别规则（防止把正文里的括号/尖括号误当成时间戳）：
     · **只有行首的时间标签算行标签**，行内再出现的时间标签一律按字级处理
       （这正是 klyric 的写法，也天然兼容「一行多个时间标签」的多段歌词）；
     · (a,b) / <a,b,c> / [a,b,c] 这类「数字对」标记**只在行标签是
       [起始毫秒,时长]（QRC/KRC/YRC 的写法）时**才认 —— 普通行级 LRC 的正文
       里出现 (2019,2020) 这种内容不会被吃掉。
   ========================================================================== */

// wordSpan 一段带时间的文字；start 是**绝对**毫秒。
type wordSpan struct {
	start int64
	text  string
}

// wordLine 一行歌词的解析结果。
type wordLine struct {
	stamps []int64 // 行级时间戳（同一行可能挂多个，要展开成多行）
	words  []wordSpan
	// wordy 这一行真的识别到了字级标记（决定这一行走不走字级输出）
	wordy bool
	// qrcForm 行标签是 [起始毫秒,时长] 形态（QRC/KRC/YRC 共用）
	qrcForm bool
}

// content 这一行最终要显示的文字（各段拼起来）。
func (ln wordLine) content() string {
	if len(ln.words) == 0 {
		return ""
	}
	if len(ln.words) == 1 {
		return ln.words[0].text
	}
	var b strings.Builder
	for _, seg := range ln.words {
		b.WriteString(seg.text)
	}
	return b.String()
}

// NormalizeWordLevel 把任意歌词文本归一化成「增强 LRC」（有字级时）或「行级 LRC」。
//
//   - 至少一行带字级时间轴 → 按增强 LRC 输出，逐字标记全部保留；
//   - 没有字级标记 → 与 NormalizeLineLevel 完全一致（行为不变）；
//   - 一点时间轴都没有（纯文本歌词）→ 原样返回，不丢内容。
func NormalizeWordLevel(text string) string {
	if strings.TrimSpace(text) == "" {
		return text
	}

	type entry struct {
		ms   int64
		body string
	}
	entries := make([]entry, 0, 64)
	wordy := false
	// YRC 的「行头」：只有时间、没有正文的那一行，正文写在下一行上。
	// 不记住它的话，没有自带行标签的正文行会被整行丢掉。
	var header struct {
		ms  int64
		set bool
	}

	for _, raw := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		ln := parseWordLine(raw)
		if len(ln.stamps) == 0 && header.set {
			// 没有自己的行标签，但上一行是 QRC/YRC 行头 → 归到行头那一行
			ln.stamps = []int64{header.ms}
		}
		if len(ln.stamps) == 0 {
			continue // 作词/作曲之类的非时间行
		}
		// 行头只对「紧随其后的第一行正文」有效
		if header.set {
			header.set = false
		}
		if strings.TrimSpace(ln.content()) == "" {
			// 只有时间、没有正文：当成 YRC/QRC 的行头记下来，本身不出现在结果里
			if ln.qrcForm && len(ln.stamps) == 1 {
				header.ms = ln.stamps[0]
				header.set = true
			}
			continue
		}
		if ln.wordy {
			wordy = true
		}
		for _, ms := range ln.stamps {
			entries = append(entries, entry{ms: ms, body: renderWordLine(ln, ms-ln.stamps[0])})
		}
	}

	if !wordy {
		// 全是行级：交给原来的行级归一化（它还负责剥掉不认识的 <…> 之类）
		return NormalizeLineLevel(text)
	}
	if len(entries) == 0 {
		return strings.TrimSpace(text)
	}

	sort.SliceStable(entries, func(i, j int) bool { return entries[i].ms < entries[j].ms })

	var b strings.Builder
	for _, e := range entries {
		b.WriteString(formatLrcStamp(e.ms))
		b.WriteString(e.body)
		b.WriteByte('\n')
	}
	return strings.TrimRight(b.String(), "\n")
}

// renderWordLine 把一行渲染成「正文 + 字级标记」。
//
// delta 用于同一句挂多个时间标签的展开：第二遍及以后要把逐字时间整体平移
// （否则 [00:10.00][01:00.00]副歌 的第二次出现会沿用第一遍的逐字时间，
//
//	唱到那一句时字早就点亮完了）。
func renderWordLine(ln wordLine, delta int64) string {
	var b strings.Builder
	for _, seg := range ln.words {
		if ln.wordy {
			b.WriteString(formatWordStamp(seg.start + delta))
		}
		b.WriteString(seg.text)
	}
	return b.String()
}

// parseWordLine 拆出「行标签」与「字级分段」。
func parseWordLine(raw string) wordLine {
	var ln wordLine
	rest := strings.TrimLeft(raw, " \t")

	// ① 行首连续的标签：[mm:ss.xx] 是标准时间戳，[起始毫秒,时长] 是 QRC/KRC/YRC
	for rest != "" {
		if m := reLrcTimeTag.FindStringSubmatch(rest); m != nil && strings.HasPrefix(rest, m[0]) {
			ln.stamps = append(ln.stamps, lrcStampMillis(m[1], m[2], m[3]))
			rest = rest[len(m[0]):]
			continue
		}
		if m := reQrcLineTag.FindStringSubmatch(rest); m != nil {
			ms, err1 := strconv.ParseInt(m[1], 10, 64)
			_, err2 := strconv.ParseInt(m[2], 10, 64)
			if err1 == nil && err2 == nil {
				ln.stamps = append(ln.stamps, ms)
				ln.qrcForm = true
			}
			rest = rest[len(m[0]):]
			continue
		}
		break
	}
	if len(ln.stamps) == 0 {
		return ln
	}

	// ② 正文里扫字级标记
	rest = strings.TrimLeft(rest, " \t")
	ln.words = tokenizeWords(rest, ln.stamps[0], ln.qrcForm, &ln.wordy)

	// 首尾空白收到段里再统一去掉，保证拼回去的文字与原行一致（不多空格）
	if n := len(ln.words); n > 0 {
		ln.words[0].text = strings.TrimLeft(ln.words[0].text, " \t")
		ln.words[n-1].text = strings.TrimRight(ln.words[n-1].text, " \t")
		// 只剩空白的段丢掉（例如行尾一个没有正文的标记）
		for len(ln.words) > 0 && ln.words[0].text == "" {
			ln.words = ln.words[1:]
		}
		for len(ln.words) > 0 && ln.words[len(ln.words)-1].text == "" {
			ln.words = ln.words[:len(ln.words)-1]
		}
	}

	// 行标签与逐字时间轴对不上（典型场景：用户在歌词工作台里给这一行
	// **重新打了轴**，只改了行时间）时，把整段逐字时间平移到行首。
	// 保住的是行内的相对节奏；不平移的话逐字时间全落在行时间之前，
	// 一开口整行就「瞬间全亮」，逐字高亮等于没有。
	if len(ln.words) > 0 && ln.words[0].start < ln.stamps[0] {
		shift := ln.stamps[0] - ln.words[0].start
		for i := range ln.words {
			ln.words[i].start += shift
		}
	}
	return ln
}

// tokenizeWords 把正文切成字级分段。
//
// 前缀标记（<…> / 行内 […]）表示「后面这段文字从这个时刻开始」；
// 后缀标记（(偏移,时长)，QRC）表示「它前面那段文字从这个时刻开始」。
func tokenizeWords(s string, lineStart int64, qrcForm bool, wordy *bool) []wordSpan {
	var segs []wordSpan
	var pending strings.Builder
	cur := lineStart // pending 里文字的起始时刻

	flush := func(start int64) {
		if pending.Len() == 0 {
			return
		}
		segs = append(segs, wordSpan{start: start, text: pending.String()})
		pending.Reset()
	}

	for i := 0; i < len(s); {
		c := s[i]
		if c != '<' && c != '(' && c != '[' {
			pending.WriteByte(c)
			i++
			continue
		}
		closing := byte('>')
		switch c {
		case '(':
			closing = ')'
		case '[':
			closing = ']'
		}
		j := strings.IndexByte(s[i+1:], closing)
		if j < 0 { // 没有配对的结束符，当正文
			pending.WriteByte(c)
			i++
			continue
		}
		content := s[i+1 : i+1+j]
		next := i + 1 + j + 1

		// (偏移,时长) —— QRC 的词级后缀标记
		if c == '(' {
			if off, dur, ok := parsePairTag(content); ok && qrcForm {
				flush(lineStart + off)
				cur = lineStart + off + dur
				*wordy = true
				i = next
				continue
			}
			pending.WriteByte(c)
			i++
			continue
		}

		// <mm:ss.xx> / 行内 [mm:ss.xx] —— 绝对时刻的字级标记
		if ms, ok := parseClockTag(content); ok {
			flush(cur)
			cur = ms
			*wordy = true
			i = next
			continue
		}

		// <偏移,时长>（KRC，相对行首） / 行内 [起始毫秒,时长]（YRC，绝对）
		if off, _, ok := parsePairTag(content); ok && qrcForm {
			start := off
			if c == '<' {
				start = lineStart + off
			}
			flush(cur)
			cur = start
			*wordy = true
			i = next
			continue
		}

		// 认不出来的标记当正文原样保留
		pending.WriteByte(c)
		i++
	}
	flush(cur)
	return segs
}

// parseClockTag 解析 "m:ss" / "m:ss.x…" / "m:ss:x…" → 毫秒。
func parseClockTag(s string) (int64, bool) {
	s = strings.TrimSpace(s)
	colon := strings.IndexByte(s, ':')
	if colon <= 0 {
		return 0, false
	}
	minPart, rest := s[:colon], s[colon+1:]
	frac := ""
	if i := strings.IndexAny(rest, ".:"); i >= 0 {
		frac = rest[i+1:]
		rest = rest[:i]
	}
	m, err := strconv.ParseInt(minPart, 10, 64)
	if err != nil || m < 0 {
		return 0, false
	}
	sec, err := strconv.ParseInt(rest, 10, 64)
	if err != nil || sec < 0 {
		return 0, false
	}
	var ms int64
	if frac != "" {
		frac = strings.TrimSpace(frac)
		if len(frac) > 3 {
			frac = frac[:3]
		}
		for len(frac) < 3 {
			frac += "0"
		}
		ms, err = strconv.ParseInt(frac, 10, 64)
		if err != nil {
			ms = 0
		}
	}
	return (m*60+sec)*1000 + ms, true
}

// parsePairTag 解析 "a,b" / "a,b,c" → (a, b)。
func parsePairTag(s string) (int64, int64, bool) {
	parts := strings.Split(strings.TrimSpace(s), ",")
	if len(parts) < 2 || len(parts) > 3 {
		return 0, 0, false
	}
	a, err := strconv.ParseInt(strings.TrimSpace(parts[0]), 10, 64)
	if err != nil || a < 0 {
		return 0, 0, false
	}
	b, err := strconv.ParseInt(strings.TrimSpace(parts[1]), 10, 64)
	if err != nil || b < 0 {
		return 0, 0, false
	}
	return a, b, true
}

// formatWordStamp 毫秒 → <mm:ss.mmm>（字级标记用毫秒精度，行标签仍是百分秒）。
func formatWordStamp(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	min := ms / 60000
	sec := (ms % 60000) / 1000
	frac := ms % 1000
	return "<" + pad2(min) + ":" + pad2(sec) + "." + pad3(frac) + ">"
}

func pad3(v int64) string {
	if v < 0 {
		v = 0
	}
	s := strconv.FormatInt(v, 10)
	for len(s) < 3 {
		s = "0" + s
	}
	return s
}

// HasWordTiming 判断文本里是否真的有「逐字时间轴」（增强 LRC / QRC / KRC /
// klyric / YRC）。注意：**只有行标签的 [起始毫秒,时长] 不算** —— 那只是毫秒
// 精度的行级时间轴，剥掉之后并没有丢任何逐字信息。
//
// 这里不加正则预筛：字级标记有五种写法（含 klyric 那种「行内时间标签」），
// 预筛漏掉一种就等于把字级歌词降级成行级；而逐行扫一遍是纯字节遍历，
// 一份歌词几 KB，代价可以忽略。
func HasWordTiming(text string) bool {
	if strings.TrimSpace(text) == "" {
		return false
	}
	for _, raw := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		if ln := parseWordLine(raw); ln.wordy {
			return true
		}
	}
	return false
}
