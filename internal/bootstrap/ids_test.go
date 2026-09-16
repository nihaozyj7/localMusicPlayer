package bootstrap

import "testing"

// TestStableIDMatchesFrontend 确保 Go 侧生成的 id 与前端 utils.js#stableId 完全一致。
// 测试向量由 tools/gen-id-vectors.mjs 用前端同一算法生成。
// 如果这条测试挂了，说明重扫后歌单 / 收藏 / 播放队列会集体失效，务必先修这里。
func TestStableIDMatchesFrontend(t *testing.T) {
	cases := []struct {
		input  string
		prefix string
		want   string
	}{
		{`D:\Music\音乐库\陈默\静默频率\夜航西飞.flac`, "t", "t_1geb140"},
		{`D:\Music\Downloads\Aurora Lane\Paper Cities\Rooftop Rain.flac`, "t", "t_1k2uor"},
		{"/home/user/music/a.mp3", "t", "t_1jlkyrx"},
		{`D:\Music\音乐库`, "t", "t_iwkvkg"},
		{"", "t", "t_ztntfp"},
		{"x", "t", "t_1y7mkjr"},
		{`E:\Backup\FLAC\2024\周叙\玻璃海\玻璃海.flac`, "t", "t_1yappt7"},
		{`D:\Music\音乐库`, "folder", "folder_iwkvkg"},
		{`D:\Music\音乐库\陈默\静默频率\夜航西飞.flac`, "folder", "folder_1geb140"},
	}
	for _, c := range cases {
		if got := StableID(c.input, c.prefix); got != c.want {
			t.Errorf("StableID(%q, %q) = %q, 期望 %q", c.input, c.prefix, got, c.want)
		}
	}
}

func TestIsAudioExt(t *testing.T) {
	yes := []string{"mp3", "MP3", ".flac", "m4a", "opus", "ape", "wma", "dsf"}
	no := []string{"mp4", "txt", "ini", "", "jpg", "lrc"}
	for _, e := range yes {
		if !IsAudioExt(e) {
			t.Errorf("IsAudioExt(%q) 应为 true", e)
		}
	}
	for _, e := range no {
		if IsAudioExt(e) {
			t.Errorf("IsAudioExt(%q) 应为 false", e)
		}
	}
}

func TestNeedsTranscode(t *testing.T) {
	if NeedsTranscode("mp3") || NeedsTranscode("flac") || NeedsTranscode("m4a") {
		t.Error("mp3/flac/m4a 应可原生播放，无需转码")
	}
	if !NeedsTranscode("ape") || !NeedsTranscode("wma") || !NeedsTranscode("dsf") {
		t.Error("ape/wma/dsf 应需要转码")
	}
}

func TestExpandPath(t *testing.T) {
	if got := ExpandPath("  D:\\Music\\x  "); got != `D:\Music\x` {
		t.Errorf("ExpandPath 去空格/清理失败: %q", got)
	}
}
