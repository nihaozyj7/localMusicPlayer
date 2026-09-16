package filter

import (
	"testing"

	"musicplayer/internal/bootstrap"
)

// TestApplyMatchesMatch 防止「批量预编译」重构与单曲 Match 的语义漂移。
//
// Apply 现在把 size 阈值与正则**只编译一次**再逐曲复用（matchCompiled），
// 而 Match 保持「每次重新编译」的旧行为。两者必须给出完全一致的判定。
func TestApplyMatchesMatch(t *testing.T) {
	rules := []bootstrap.FilterRule{
		{ID: "size-lt", Type: "size", Op: "lt", Value: "100", Unit: "KB", Scope: "exclude", Enabled: true},
		{ID: "re-tmp", Type: "regex", Value: `\.tmp$`, Scope: "exclude", Enabled: true},
		{ID: "size-gt", Type: "size", Op: "gt", Value: "1", Unit: "MB", Scope: "include", Enabled: true},
		{ID: "re-off", Type: "regex", Value: "x", Scope: "include", Enabled: false},
		{ID: "size-off", Type: "size", Op: "eq", Value: "10", Unit: "KB", Scope: "exclude", Enabled: false},
	}
	songs := []bootstrap.Song{
		{Path: `C:ma.mp3`, Size: 10},
		{Path: `C:m.mp3`, Size: 50 * 1024},
		{Path: `C:mc.mp3`, Size: 2 * 1024 * 1024},
		{Path: `C:md.tmp`, Size: 3 * 1024 * 1024},
		{Path: `C:me.mp3`, Size: 10 * 1024},
	}

	res := Apply(songs, rules)
	if len(res.Kept)+res.Excluded != res.Total {
		t.Fatalf("统计不守恒: kept=%d excluded=%d total=%d", len(res.Kept), res.Excluded, res.Total)
	}

	keptByApply := map[string]bool{}
	for _, s := range res.Kept {
		keptByApply[s.Path] = true
	}
	for _, s := range songs {
		excluded, _ := Match(s.Path, s.Size, rules)
		if excluded == keptByApply[s.Path] {
			t.Errorf("%s: Match 判 excluded=%v，Apply 判保留=%v —— 两者必须一致",
				s.Path, excluded, keptByApply[s.Path])
		}
	}
}

// TestApplyIncludeSemantics include 规则存在时「必须命中至少一条才保留」，
// 且 exclude 优先。这是容易在重构里写错的一条。
func TestApplyIncludeSemantics(t *testing.T) {
	rules := []bootstrap.FilterRule{
		{ID: "inc", Type: "regex", Value: "keep", Scope: "include", Enabled: true},
	}
	songs := []bootstrap.Song{
		{Path: `C:mkeep-me.mp3`},
		{Path: `C:mdrop-me.mp3`},
	}
	res := Apply(songs, rules)
	if len(res.Kept) != 1 || res.Kept[0].Path != songs[0].Path {
		t.Fatalf("include 语义错误: kept=%v", res.Kept)
	}
	if res.Excluded != 1 {
		t.Fatalf("excluded=%d, want 1", res.Excluded)
	}
}
