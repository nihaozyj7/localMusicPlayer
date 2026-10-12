package filter

import (
	"testing"

	"localmusicplayer/internal/bootstrap"
)

/* --------------------------------------------------------------------------
   空值规则的两端一致性
   --------------------------------------------------------------------------
   前端引擎是 frontend/src/js/store.js#applyRules，测试在
   frontend/tests/filter-parity.test.js（两张表逐字对应，改一边请改两边）。

   ★ 这里钉住的是一个**会清空整个曲库且不报错**的缺陷：
   空 pattern 如果直接交给 regexp.Compile，得到的是「匹配一切」的正则，
   于是一条 value 为空、scope=exclude 的启用规则会让 Scan 返回 Kept=0、err=nil。
   而设置页点「添加规则」新建的正则规则 value 就是空串（settings.js#rule-add），
   所以这不是理论问题。
   -------------------------------------------------------------------------- */

// paritySong 造一首与前端测试同形状的歌（字段一致，便于两端对照）。
func paritySong() bootstrap.Song {
	return bootstrap.Song{
		ID:       "s1",
		Path:     "D:/Music/a.mp3",
		Title:    "标题",
		Artist:   "歌手",
		Album:    "专辑",
		Ext:      "mp3",
		Size:     5000,
		Duration: 1000,
	}
}

// TestEmptyValueRulesParity 空 value 的规则在两端必须给出同样的判定。
//
// 每条 case 的期望值是在前端引擎上**实测**出来的（见文件头），不是猜的。
func TestEmptyValueRulesParity(t *testing.T) {
	cases := []struct {
		name     string
		rule     bootstrap.FilterRule
		excluded bool // 前端实测结果
	}{
		{
			name:     "空正则 + exclude → 规则失效，歌保留",
			rule:     rule("r1", "regex", "match", "", "", "exclude"),
			excluded: false,
		},
		{
			// include 空规则 = 「谁都不要」：两端都是 have-include 但一条都不命中，
			// 于是全部排除。这不是 bug 而是 include 的既有语义（前端实测一致）。
			name:     "空正则 + include → 全部排除（include-miss）",
			rule:     rule("r2", "regex", "match", "", "", "include"),
			excluded: true,
		},
		{
			name:     "纯空白正则 + exclude → 只是匹配不到东西，不是「匹配一切」",
			rule:     rule("r3", "regex", "match", "   ", "", "exclude"),
			excluded: false,
		},
		{
			name:     "非法正则 + exclude → 规则失效",
			rule:     rule("r4", "regex", "match", "([a", "", "exclude"),
			excluded: false,
		},
		{
			name:     "空 size + lt + exclude → 规则失效",
			rule:     rule("r5", "size", "lt", "", "B", "exclude"),
			excluded: false,
		},
	}

	song := paritySong()
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, id := Match(song.Path, song.Size, []bootstrap.FilterRule{c.rule})
			if got != c.excluded {
				t.Fatalf("excluded = %v（命中 %q），期望 %v —— 与前端不一致", got, id, c.excluded)
			}
			// 批量入口必须与单曲入口一致
			res := Apply([]bootstrap.Song{song}, []bootstrap.FilterRule{c.rule})
			if (len(res.Kept) == 0) != c.excluded {
				t.Fatalf("Apply 判定与 Match 不一致：kept=%d excluded=%d", len(res.Kept), res.Excluded)
			}
		})
	}
}

// TestEmptyRegexDoesNotWipeLibrary 端到端：默认规则 + 一条空正则，
// 曲库必须原样保留（这正是历史缺陷的表现面）。
func TestEmptyRegexDoesNotWipeLibrary(t *testing.T) {
	rules := []bootstrap.FilterRule{
		// 与 bootstrap.DefaultConfig 的默认规则同形
		rule("rule_size", "size", "lt", "10240", "B", "exclude"),
		rule("rule_mp4", "regex", "match", `\.mp4$`, "", "exclude"),
		// 用户在设置页点「添加规则」后立即产生的空规则
		rule("rule_new", "regex", "match", "", "", "exclude"),
	}
	songs := []bootstrap.Song{
		{Path: "D:/Music/a.flac", Size: 30 << 20},
		{Path: "D:/Music/b.mp3", Size: 8 << 20},
		{Path: "D:/Music/c.wav", Size: 40 << 20},
	}

	res := Apply(songs, rules)
	if len(res.Kept) != len(songs) {
		t.Fatalf("空正则规则不该筛掉任何歌：kept=%d excluded=%d（期望 kept=%d）",
			len(res.Kept), res.Excluded, len(songs))
	}
}

// TestEmptyRegexRuleIsSkippedNotInvalid 空正则「不生效」，但不算「非法」——
// 设置界面只对后者报错，别让用户点一下「添加规则」就看到一条红色错误。
func TestEmptyRegexRuleIsSkippedNotInvalid(t *testing.T) {
	rules := []bootstrap.FilterRule{
		rule("empty", "regex", "match", "", "", "exclude"),
		rule("blank", "regex", "match", "  ", "", "exclude"),
		rule("broken", "regex", "match", "([a", "", "exclude"),
	}
	got := InvalidRegexRules(rules)
	if len(got) != 1 || got[0] != "broken" {
		t.Fatalf("InvalidRegexRules = %v，期望只有 broken", got)
	}
}

// TestCompiledEmptyPatternIsNil 直接钉住 compiled 的契约本身。
func TestCompiledEmptyPatternIsNil(t *testing.T) {
	if re := compiled(""); re != nil {
		t.Fatalf("compiled(%q) 应为 nil，实际得到匹配一切的正则 %v", "", re)
	}
	if re := compiled("a"); re == nil {
		t.Fatal("非空 pattern 应能编译成功")
	}
}

/* --------------------------------------------------------------------------
   size 规则的阈值语义（第六轮审查 N-1）
   --------------------------------------------------------------------------
   表逐条对应 frontend/tests/filter-parity.test.js 里的同名表（改一边请改两边）。

   钉住的是：**空值/非法值/负数/越界 = 这条规则不生效**，而不是「阈值 0」。
   反例（修复前的行为）：`value: ""` + `op: "gt"` 在前端会被解析成 0，于是
   「size > 0」把**所有非空文件**都排除掉 —— 而后端只是把这条规则跳过。
   同一份配置，设置页预览与真实扫描给出相反结果。
   -------------------------------------------------------------------------- */

func TestSizeRuleThresholdParity(t *testing.T) {
	// 与前端测试同一个 size=5000 的对照歌曲（个别用例自带 size，见下表）
	const defaultSize int64 = 5000

	cases := []struct {
		name     string
		value    string
		unit     string
		op       string
		scope    string
		size     int64 // 0 = 用 defaultSize
		excluded bool
	}{
		// ★ 缺陷本体：空值 + gt。修复前前端这里是 true（「0 字节以上」全部排除）。
		{"空值 + gt + exclude → 规则失效，歌保留", "", "B", "gt", "exclude", 0, false},
		{"空值 + lt + exclude → 规则失效，歌保留", "", "B", "lt", "exclude", 0, false},
		{"空值 + eq + exclude → 规则失效，歌保留", "", "B", "eq", "exclude", 0, false},
		// include 的「存在即参与判定」语义不受规则是否失效影响（两端一致）
		{"空值 + gt + include → 一条都命中不了（include-miss）", "", "B", "gt", "include", 0, true},
		// 纯非法输入同样是「不生效」，而不是「0」
		{"字母 + gt + exclude → 不生效", "abc", "B", "gt", "exclude", 0, false},
		{"只有小数点 + gt + exclude → 不生效", ".", "B", "gt", "exclude", 0, false},
		{"连字符 + gt + exclude → 不生效", "--", "B", "gt", "exclude", 0, false},
		// 负数阈值没有意义 → 不生效（两端都用「负数 = 失效」这一条判据）
		{"负值 + gt + exclude → 不生效", "-5", "B", "gt", "exclude", 0, false},
		{"负值 + lt + include → 不生效且 include 落空", "-5", "B", "lt", "include", 0, true},
		// 越界 = 不生效（两端显式拒绝，不依赖「浮点转整数」的实现相关行为）
		{"超出 int64 + gt + exclude → 不生效", "99999999999999999999999999", "B", "gt", "exclude", 0, false},
		// 0 是**合法**阈值，必须与「空值」区分开
		{"0 + gt + exclude → 0 是合法阈值，非空文件被排除", "0", "B", "gt", "exclude", 0, true},
		{"0 + lt + exclude → 没有文件小于 0 字节", "0", "B", "lt", "exclude", 0, false},
		// 单位换算
		{"1KB + gt + exclude → 5000 > 1024", "1", "KB", "gt", "exclude", 0, true},
		{"5MB + lt + exclude → 5000 < 5242880", "5", "MB", "lt", "exclude", 0, true},
		{"1GB + lt + exclude → 5000 < 1073741824", "1", "GB", "lt", "exclude", 0, true},
		// ★ 截断必须一致：1.1KB = 1126.4 → 两端都截断成 1126
		{"1.1KB + eq + exclude（size=1126）→ 截断后相等", "1.1", "KB", "eq", "exclude", 1126, true},
		{"1.1KB + eq + exclude（size=1127）→ 截断后不等", "1.1", "KB", "eq", "exclude", 1127, false},
		// 单位大小写不敏感
		{"1kb + gt + exclude（小写单位）→ 5000 > 1024", "1", "kb", "gt", "exclude", 0, true},
		// 清洗规则一致：逗号被去掉 → "1,5" 读作 15（两端同一个清洗规则）
		{"1,5KB + lt + exclude（逗号被清洗 → 15KB）", "1,5", "KB", "lt", "exclude", 0, true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			size := c.size
			if size == 0 {
				size = defaultSize
			}
			r := rule("r", "size", c.op, c.value, c.unit, c.scope)
			got, id := Match("D:/Music/a.mp3", size, []bootstrap.FilterRule{r})
			if got != c.excluded {
				t.Fatalf("size=%d，value=%q unit=%q op=%q scope=%q：excluded=%v（命中 %q），期望 %v —— 与前端不一致",
					size, c.value, c.unit, c.op, c.scope, got, id, c.excluded)
			}
			// 批量入口必须与单曲入口给出同一结论
			songs := []bootstrap.Song{{Path: "D:/Music/a.mp3", Size: size}}
			res := Apply(songs, []bootstrap.FilterRule{r})
			if (len(res.Kept) == 0) != c.excluded {
				t.Fatalf("Apply 与 Match 不一致：kept=%d excluded=%d", len(res.Kept), res.Excluded)
			}
		})
	}
}

// TestNormalizeSizeSentinels 直接钉住换算函数的契约（含 Go/JS 共同的边界）。
func TestNormalizeSizeSentinels(t *testing.T) {
	cases := []struct {
		value string
		unit  string
		want  int64
	}{
		{"", "B", sizeRuleInert},
		{"   ", "B", sizeRuleInert},
		{"abc", "MB", sizeRuleInert},
		{".", "B", sizeRuleInert},
		{"-5", "B", -5}, // 负值由 matchCompiled 的 `< 0` 判成「不生效」
		{"0", "B", 0},   // 0 是合法阈值，不能与空值混为一谈
		{"1.1", "KB", 1126},
		{"5", "MB", 5 * 1024 * 1024},
		{"1", "gb", 1024 * 1024 * 1024},
		// 恰好 -2^63 属于 int64 范围之内，必须接受
		{"-9223372036854775808", "B", -9223372036854775808},
		// 2^63 越界 → 失效
		{"9223372036854775808", "B", sizeRuleInert},
		{"99999999999999999999999999", "GB", sizeRuleInert},
	}
	for _, c := range cases {
		if got := normalizeSize(c.value, c.unit); got != c.want {
			t.Errorf("normalizeSize(%q, %q) = %d，期望 %d", c.value, c.unit, got, c.want)
		}
	}
}
