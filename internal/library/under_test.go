package library

import (
	"path/filepath"
	"testing"
)

// TestIsUnderPrefixBoundary 覆盖两类曾经判错的边界：
//
//   - 以 ".." 开头的**真实子目录**（"..hidden"）：原先用
//     strings.HasPrefix(rel, "..") 判断，filepath.Rel 对
//     <root>/..hidden/a.mp3 会返回 "..hidden/a.mp3"，同样以 ".." 开头，
//     于是真实存在的子目录被判成「不在 root 之下」，影响 TrackCount 统计与
//     RescanPaths 的「受影响目录」判定；
//   - 同前缀的兄弟目录（"Music2" 之于 "Music"）必须判成不在 root 之下。
func TestIsUnderPrefixBoundary(t *testing.T) {
	sep := string(filepath.Separator)
	root := filepath.Join("C:"+sep, "Music")

	cases := []struct {
		name string
		path string
		want bool
	}{
		{"root 本身", root, true},
		{"普通子目录", filepath.Join(root, "a", "b.mp3"), true},
		{"以 .. 开头的真实子目录", filepath.Join(root, "..hidden", "a.mp3"), true},
		{"以 .. 开头的文件名", filepath.Join(root, "..song.mp3"), true},
		{"同前缀的兄弟目录", filepath.Join("C:"+sep, "Music2", "a.mp3"), false},
		{"父目录", filepath.Dir(root), false},
		{"无关绝对路径", filepath.Join("D:"+sep, "Other", "a.mp3"), false},
	}

	for _, c := range cases {
		if got := isUnder(c.path, root); got != c.want {
			t.Errorf("%s: isUnder(%q, %q) = %v, want %v", c.name, c.path, root, got, c.want)
		}
	}

	// root 自带尾分隔符时也应成立（快速路径里的 isSep(root[last]) 分支）
	if !isUnder(root+sep+"x.mp3", root+sep) {
		t.Errorf("root 带尾分隔符时应判为子路径")
	}
	// 大小写不同时走慢路径，语义与旧实现一致
	if !isUnder(filepath.Join("C:"+sep, "music", "a.mp3"), root) {
		t.Errorf("大小写不同在 Windows 上应视为同一目录（慢路径）")
	}
}
