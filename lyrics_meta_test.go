package main

import "testing"

func TestSanitizeLyricsMeta(t *testing.T) {
	cases := []struct {
		name          string
		title, artist string
		wantT, wantA  string
	}{
		{
			name:   "文件名兜底的脏标题：歌词、引号、书名号",
			title:  "《此去半生》-吴昊 “花开又花谢花漫天 ，是你忽隐又忽现， 朝朝又暮暮朝暮间，却难勾勒你的脸”",
			artist: "未知歌手",
			wantT:  "此去半生", wantA: "吴昊",
		},
		{name: "编号前缀", title: "01.晴天 - 周杰伦", wantT: "晴天", wantA: "周杰伦"},
		{name: "正常元数据不动", title: "晴天", artist: "周杰伦", wantT: "晴天", wantA: "周杰伦"},
		{name: "英文元数据不动", title: "Yellow", artist: "Coldplay", wantT: "Yellow", wantA: "Coldplay"},
		{name: "占位歌手被丢弃", title: "晴天", artist: "未知歌手", wantT: "晴天", wantA: ""},
		{name: "占位标题被丢弃", title: "Track 07", artist: "", wantT: "", wantA: ""},
		{name: "书名号包裹", title: "《起风了》", artist: "买辣椒也用券", wantT: "起风了", wantA: "买辣椒也用券"},
		{name: "标题里的歌手不覆盖已有歌手", title: "晴天 - 某翻唱", artist: "周杰伦", wantT: "晴天", wantA: "周杰伦"},
	}
	for _, c := range cases {
		gotT, gotA := sanitizeLyricsMeta(c.title, c.artist)
		if gotT != c.wantT || gotA != c.wantA {
			t.Errorf("%s: sanitizeLyricsMeta(%q, %q) = (%q, %q)，期望 (%q, %q)",
				c.name, c.title, c.artist, gotT, gotA, c.wantT, c.wantA)
		}
	}
}

func TestUsableLyricsMetaForScore(t *testing.T) {
	yes := []string{"晴天", "Yellow", "起风了", "周杰伦", "Unravel"}
	for _, s := range yes {
		if !usableLyricsMetaForScore(s) {
			t.Errorf("%q 应该可用于打分", s)
		}
	}
	no := []string{
		"", "未知歌手", "，。！？“”",
		"《此去半生》-吴昊 “花开又花谢花漫天，是你忽隐又忽现，朝朝又暮暮朝暮间，却难勾勒你的脸”",
	}
	for _, s := range no {
		if usableLyricsMetaForScore(s) {
			t.Errorf("%q 不该用于打分", s)
		}
	}
}

func TestNeedsCleanMeta(t *testing.T) {
	if !needsCleanMeta("《此去半生》-吴昊 “花开又花谢花漫天”", "未知歌手") {
		t.Error("脏标题应该需要 AI 清洗")
	}
	if needsCleanMeta("晴天", "周杰伦") {
		t.Error("干净元数据不该触发 AI 请求（一次要 8~18 秒）")
	}
	if needsCleanMeta("", "") {
		t.Error("没有标题时不该触发 AI 请求")
	}
}
