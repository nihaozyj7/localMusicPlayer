package lyrics

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

/* --------------------------------------------------------------------------
   字级歌词 → 行级歌词
   --------------------------------------------------------------------------
   本程序只支持「行」级别的歌词：一行一个时间戳，前端按行高亮。
   但部分在线来源会给「字」级别的歌词（每个字/词单独带时间），常见三种：

     1. 增强 LRC：      [00:12.00]<00:12.00>你<00:12.30>好
     2. QRC（QQ 音乐）：[12000,800]你(0,300)好(300,500)
     3. KRC（酷狗）：   [12000,800]<0,300,0>你<300,500,0>好

   这些文本直接内嵌进歌曲文件后，别的播放器（以及本程序自己的行高亮）
   会把 <00:12.00>、(0,300) 当成歌词正文显示出来，所以必须在**写入文件之前**
   把它们还原成标准的行级 LRC。

   规则：
     · 一行里的多个标准时间标签（[00:12.00][01:20.00]同一句）展开成多行；
     · 字级标记（<...>）与词级时长标注（(数,数)）一律剥掉；
     · QRC/KRC 的 [起始毫秒,时长] 行标签换算成 [mm:ss.xx]；
     · 没有任何时间标签的文本（纯文本歌词 / 只有元信息）原样返回 ——
       「不能把不识字级的歌词当成坏的删掉」。
   -------------------------------------------------------------------------- */

var (
	// 标准 LRC 时间标签：mm:ss.xx / mm:ss:xx / mm:ss
	reLrcTimeTag = regexp.MustCompile(`\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]`)
	// QRC / KRC 的行标签：[起始毫秒,时长]（两段都是纯数字，与 mm:ss 天然区分）
	reQrcLineTag = regexp.MustCompile(`^\[(\d{1,7}),(\d{1,7})\]`)
	// 字级标记：<00:12.00> 或 <0,300,0>
	reWordTag = regexp.MustCompile(`<[^>]*>`)
	// 词级时长标注：(0,300)
	reWordSpan = regexp.MustCompile(`\(\s*\d{1,6}\s*,\s*\d{1,6}\s*\)`)
)

// NormalizeLineLevel 把任意歌词文本归一化成「行级 LRC」。
//
// 已经是行级 LRC 的文本会保持语义不变（逐行重建）；
// 字级歌词会被剥离逐字标记并保留每一行的起始时间；
// 完全没有时间轴的纯文本原样返回。
func NormalizeLineLevel(text string) string {
	if strings.TrimSpace(text) == "" {
		return text
	}

	type entry struct {
		ms   int64
		text string
	}
	entries := make([]entry, 0, 64)
	timed := false

	for _, raw := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		if strings.TrimSpace(raw) == "" {
			continue
		}

		// ① 收集这一行所有标准时间标签
		var stamps []int64
		for _, m := range reLrcTimeTag.FindAllStringSubmatch(raw, -1) {
			stamps = append(stamps, lrcStampMillis(m[1], m[2], m[3]))
		}

		// ② 没有标准标签时，看它是不是 QRC / KRC 的 [毫秒,时长] 行标签
		if m := reQrcLineTag.FindStringSubmatch(raw); m != nil {
			if ms, err := strconv.ParseInt(m[1], 10, 64); err == nil {
				stamps = append(stamps, ms)
			}
		}

		// ③ 取出正文：剥掉时间标签、字级标记与词级时长标注
		body := reLrcTimeTag.ReplaceAllString(raw, "")
		body = reQrcLineTag.ReplaceAllString(body, "")
		if strings.Contains(body, "<") {
			body = reWordTag.ReplaceAllString(body, "")
		}
		if strings.Contains(body, "(") {
			body = reWordSpan.ReplaceAllString(body, "")
		}
		body = strings.TrimSpace(body)

		if len(stamps) == 0 || body == "" {
			continue
		}
		timed = true
		// 同一句挂多个时间标签：展开成多行（主流播放器的行为）
		for _, ms := range stamps {
			entries = append(entries, entry{ms: ms, text: body})
		}
	}

	// 一点时间轴都没有（纯文本歌词）：原样返回，别把内容弄丢
	if !timed {
		return strings.TrimSpace(text)
	}

	sort.SliceStable(entries, func(i, j int) bool { return entries[i].ms < entries[j].ms })

	var b strings.Builder
	for _, e := range entries {
		b.WriteString(formatLrcStamp(e.ms))
		b.WriteString(e.text)
		b.WriteByte('\n')
	}
	return strings.TrimRight(b.String(), "\n")
}

// HasWordTiming 判断文本是否带「逐字」标记（用于界面提示 / 日志）。
func HasWordTiming(text string) bool {
	return reWordTag.MatchString(text) || reQrcLineTag.MatchString(text) || reWordSpan.MatchString(text)
}

// lrcStampMillis 把 mm / ss / 小数 换算成毫秒。
func lrcStampMillis(min, sec, frac string) int64 {
	m, _ := strconv.ParseInt(min, 10, 64)
	s, _ := strconv.ParseInt(sec, 10, 64)
	var ms int64
	if frac != "" {
		// .5 = 500ms，.50 = 500ms，.500 = 500ms（按毫秒位右补零）
		f := frac
		if len(f) > 3 {
			f = f[:3]
		}
		for len(f) < 3 {
			f += "0"
		}
		ms, _ = strconv.ParseInt(f, 10, 64)
	}
	return (m*60+s)*1000 + ms
}

// formatLrcStamp 毫秒 → [mm:ss.xx]（分可以超过 99，保持 1 小时以上的歌曲可用）。
func formatLrcStamp(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	min := ms / 60000
	sec := (ms % 60000) / 1000
	centi := (ms % 1000) / 10
	return "[" + pad2(min) + ":" + pad2(sec) + "." + pad2(centi) + "]"
}

func pad2(v int64) string {
	if v < 0 {
		v = 0
	}
	if v < 10 {
		return "0" + strconv.FormatInt(v, 10)
	}
	return strconv.FormatInt(v, 10)
}
