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
