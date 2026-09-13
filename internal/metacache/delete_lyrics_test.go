package metacache

import (
	"os"
	"testing"
)

// TestDeleteLyricsClearsIndexAndFile 回归测试：删歌词必须同时清掉
// 文件与索引条目（内存 + 磁盘），否则设置界面里的「已缓存歌词」不归零，
// 重启后幽灵条目还在，并会被「写入缓存到文件」重新计入。
func TestDeleteLyricsClearsIndexAndFile(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	if _, err := s.SaveLyrics("t_one", "[00:01.00]hello", "online:lrclib"); err != nil {
		t.Fatalf("保存歌词失败: %v", err)
	}
	path, ok := s.LyricsPath("t_one")
	if !ok {
		t.Fatal("刚保存的歌词应当能取到路径")
	}

	deleted, err := s.DeleteLyrics("t_one")
	if err != nil {
		t.Fatalf("删除歌词失败: %v", err)
	}
	if !deleted {
		t.Fatal("删除已存在的歌词应当返回 true")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("歌词文件应当已被删除: %v", err)
	}
	if _, ok := s.LyricsPath("t_one"); ok {
		t.Fatal("内存索引里不应再有这条歌词")
	}

	// 重新打开（模拟重启）：磁盘索引里也不能再有
	s2 := NewStore(dir)
	if _, ok := s2.LyricsPath("t_one"); ok {
		t.Fatal("重启后歌词索引里不该再有这条（索引条目没有落盘清理）")
	}

	// 幂等：再删一次返回 false 且不报错
	if deleted, err := s2.DeleteLyrics("t_one"); err != nil || deleted {
		t.Fatalf("重复删除应当返回 (false, nil)，实际 (%v, %v)", deleted, err)
	}
}
