package library

import (
	"testing"

	"localmusicplayer/internal/bootstrap"
)

// TestSafeParseDegradesPanic 钉住「单个畸形文件不得终止进程」这条约束。
//
// 背景：meta.Read 对极端文件可能 panic（历史故障是时长不足 1 秒时的整数除零）。
// readAll 的 worker 此前没有任何 recover，panic 会一路冒到 runtime 并**结束整个
// 应用** —— 现象是扫描到某个文件就闪退。
//
// 这里直接给 safeParse 传一个必定 panic 的闭包，验证它会返回一首「无标签但完整」
// 的歌，而不是把 panic 抛出去。
func TestSafeParseDegradesPanic(t *testing.T) {
	c := candidate{path: `C:\Music\坏文件.mp3`, size: 1234, ext: "mp3", mod: 1700000000000}

	song := safeParse(c, func() bootstrap.Song {
		panic("模拟解析器 panic")
	})

	if song.Path != c.path {
		t.Errorf("路径 = %q，期望 %q（降级后仍要保留这首歌）", song.Path, c.path)
	}
	if song.ID != bootstrap.StableID(c.path, "t") {
		t.Errorf("ID = %q，期望与正常路径一致的 StableID", song.ID)
	}
	if song.Size != c.size || song.ModTime != c.mod || song.Ext != c.ext {
		t.Errorf("文件属性丢失：size=%d mod=%d ext=%q", song.Size, song.ModTime, song.Ext)
	}
	if song.Duration != 0 || song.Bitrate != 0 {
		t.Errorf("降级结果不该带时长/码率：duration=%d bitrate=%d", song.Duration, song.Bitrate)
	}
	// fillFallback 的兜底：标题回落到文件名、歌手/专辑给「未知」
	if song.Title != "坏文件" {
		t.Errorf("标题 = %q，期望回落到文件名「坏文件」", song.Title)
	}
	if song.Artist == "" || song.Album == "" {
		t.Errorf("歌手/专辑应走 fillFallback 兜底，实际 %q / %q", song.Artist, song.Album)
	}
}

// TestSafeParsePassesThrough 正常路径必须原样透传（兜底不能影响正常结果）。
func TestSafeParsePassesThrough(t *testing.T) {
	c := candidate{path: `C:\Music\好文件.flac`, size: 999, ext: "flac", mod: 1}
	want := bootstrap.Song{ID: "x", Path: c.path, Title: "真标题", Duration: 12345}

	got := safeParse(c, func() bootstrap.Song { return want })
	if got != want {
		t.Errorf("正常路径被改动：得到 %+v，期望 %+v", got, want)
	}
}
