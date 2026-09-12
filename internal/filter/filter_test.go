package filter

import (
	"testing"

	"musicplayer/internal/bootstrap"
)

func rule(id, typ, op, value, unit, scope string) bootstrap.FilterRule {
	return bootstrap.FilterRule{ID: id, Type: typ, Op: op, Value: value, Unit: unit, Scope: scope, Enabled: true}
}

// TestMatchExcludeSize 需求 A3：排除小于 10KB 的文件
func TestMatchExcludeSize(t *testing.T) {
	rules := []bootstrap.FilterRule{rule("r1", "size", "lt", "10240", "B", "exclude")}

	small := int64(7 * 1024)
	big := int64(9 * 1024 * 1024)

	if excluded, id := Match(`D:\m\a.mp3`, small, rules); !excluded || id != "r1" {
		t.Errorf("小文件应被排除，得到 excluded=%v id=%q", excluded, id)
	}
	if excluded, _ := Match(`D:\m\a.mp3`, big, rules); excluded {
		t.Error("大文件不应被排除")
	}
}

// TestMatchExcludeRegexMP4 需求 A4：排除 *.mp4
func TestMatchExcludeRegexMP4(t *testing.T) {
	rules := []bootstrap.FilterRule{rule("r2", "regex", "match", `\.mp4$`, "", "exclude")}

	if excluded, _ := Match(`D:\m\video.mp4`, 5*1024*1024, rules); !excluded {
		t.Error(".mp4 应被排除")
	}
	if excluded, _ := Match(`D:\m\song.MP4`, 5*1024*1024, rules); !excluded {
		t.Error("正则应忽略大小写")
	}
	if excluded, _ := Match(`D:\m\song.mp3`, 5*1024*1024, rules); excluded {
		t.Error(".mp3 不应被排除")
	}
}

// TestCombinedSmallMP4 需求原文的「排除小于 10KB 的 .mp4」
func TestCombinedSmallMP4(t *testing.T) {
	rules := []bootstrap.FilterRule{
		rule("r1", "size", "lt", "10240", "B", "exclude"),
		rule("r2", "regex", "match", `\.mp4$`, "", "exclude"),
	}
	// 小 mp4 → 命中大小规则（排除）
	if excluded, id := Match(`D:\m\tiny.mp4`, 7600, rules); !excluded || id != "r1" {
		t.Errorf("小 mp4 应被排除且命中大小规则，得到 excluded=%v id=%q", excluded, id)
	}
	// 大 mp4 → 命中正则
	if excluded, id := Match(`D:\m\big.mp4`, 50*1024*1024, rules); !excluded || id != "r2" {
		t.Errorf("大 mp4 应被排除且命中正则规则，得到 excluded=%v id=%q", excluded, id)
	}
	// 正常音频 → 保留
	if excluded, _ := Match(`D:\m\ok.flac`, 30*1024*1024, rules); excluded {
		t.Error("正常音频不应被排除")
	}
}

// TestExcludeBeatsInclude 排除优先于仅包含
func TestExcludeBeatsInclude(t *testing.T) {
	rules := []bootstrap.FilterRule{
		rule("inc", "regex", "match", `\.flac$`, "", "include"),
		rule("exc", "regex", "match", `sample`, "", "exclude"),
	}
	if excluded, id := Match(`D:\m\song_sample.flac`, 1024, rules); !excluded || id != "exc" {
		t.Errorf("排除规则应优先，得到 excluded=%v id=%q", excluded, id)
	}
	if excluded, _ := Match(`D:\m\song.flac`, 1024, rules); excluded {
		t.Error("命中 include 且未命中 exclude，应保留")
	}
	if excluded, id := Match(`D:\m\song.mp3`, 1024, rules); !excluded || id != "include-miss" {
		t.Errorf("有 include 规则时未命中的应被排除，得到 excluded=%v id=%q", excluded, id)
	}
}

// TestDisabledRuleIgnored 关闭的规则不生效
func TestDisabledRuleIgnored(t *testing.T) {
	r := rule("r1", "regex", "match", `\.mp4$`, "", "exclude")
	r.Enabled = false
	if excluded, _ := Match(`D:\m\v.mp4`, 100, []bootstrap.FilterRule{r}); excluded {
		t.Error("已关闭的规则不应生效")
	}
}

// TestInvalidRegexSkipped 非法正则只跳过自己，不影响其它规则
func TestInvalidRegexSkipped(t *testing.T) {
	rules := []bootstrap.FilterRule{
		rule("bad", "regex", "match", `([unclosed`, "", "exclude"),
		rule("good", "size", "lt", "10240", "B", "exclude"),
	}
	if excluded, id := Match(`D:\m\a.mp3`, 100, rules); !excluded || id != "good" {
		t.Errorf("非法正则应被跳过，正常规则仍生效，得到 excluded=%v id=%q", excluded, id)
	}
	if ids := InvalidRegexRules(rules); len(ids) != 1 || ids[0] != "bad" {
		t.Errorf("应报告 1 条非法正则，得到 %v", ids)
	}
}

// TestSizeUnitConversion 单位换算
func TestSizeUnitConversion(t *testing.T) {
	rules := []bootstrap.FilterRule{rule("r1", "size", "lt", "10", "KB", "exclude")}
	if excluded, _ := Match(`D:\m\a.mp3`, 9*1024, rules); !excluded {
		t.Error("9KB < 10KB 应被排除")
	}
	if excluded, _ := Match(`D:\m\a.mp3`, 11*1024, rules); excluded {
		t.Error("11KB 不应被排除")
	}
}

// TestNoRulesKeepsEverything 没有规则时全部保留
func TestNoRulesKeepsEverything(t *testing.T) {
	if excluded, _ := Match(`D:\m\a.mp4`, 1, nil); excluded {
		t.Error("没有规则时不应排除任何文件")
	}
}
