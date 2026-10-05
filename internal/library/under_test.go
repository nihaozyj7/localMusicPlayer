package library

import (
	"path/filepath"
	"runtime"
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
//
// ★ 根目录必须按**当前平台**构造，不能用写死的 `C:\Music`。
//
// 原来的写法是 filepath.Join("C:"+sep, "Music")：在 Windows 上那是
// `C:\Music`（绝对路径），在 Linux 上却是相对路径 `C:/Music`。
// 更要紧的是「同前缀的兄弟目录」与「无关绝对路径」两条用例：
// Linux 上 `D:/Other/a.mp3` 只是相对路径，与 `C:/Music` 之间
// 根本不存在「盘符不同」这层语义，断言的前提就不成立了。
//
// 用 t.TempDir() 拿到一个真实的绝对路径作 root，两种平台上语义完全一致：
// 测的仍然是 isUnder 的前缀边界，而不是某个平台的路径拼法。
func TestIsUnderPrefixBoundary(t *testing.T) {
	sep := string(filepath.Separator)
	// root 用真实绝对路径；再取一个**保证与 root 不同前缀**的兄弟目录名。
	base := t.TempDir()
	root := filepath.Join(base, "Music")

	cases := []struct {
		name string
		path string
		want bool
	}{
		{"root 本身", root, true},
		{"普通子目录", filepath.Join(root, "a", "b.mp3"), true},
		{"以 .. 开头的真实子目录", filepath.Join(root, "..hidden", "a.mp3"), true},
		{"以 .. 开头的文件名", filepath.Join(root, "..song.mp3"), true},
		// 同前缀的兄弟目录：这是这个函数最容易写错的一条
		//（朴素的 strings.HasPrefix(path, root) 会把它误判成子目录）
		{"同前缀的兄弟目录", filepath.Join(base, "Music2", "a.mp3"), false},
		{"父目录", filepath.Dir(root), false},
		// 完全无关的绝对路径（换一个临时根，避免依赖盘符语义）
		{"无关绝对路径", filepath.Join(t.TempDir(), "Other", "a.mp3"), false},
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

	// 大小写不同的处理是**平台相关**的，必须分开断言：
	//
	//	· Windows 的文件系统不区分大小写，isUnder 因此走「慢路径」
	//	  （逐段不区分大小写比较）并判为 true；
	//	· Linux / macOS(默认) 区分大小写，`music` 与 `Music` 是两个不同的
	//	  目录，判为 false 才是**正确**行为。
	//
	// 原来这条断言写死了 true（"大小写不同在 Windows 上应视为同一目录"），
	// 但没加平台判断，在 Linux 上必然失败 —— 而它描述的本来就是
	// Windows 的语义。
	mixed := filepath.Join(base, "music", "a.mp3")
	if runtime.GOOS == "windows" {
		if !isUnder(mixed, root) {
			t.Errorf("大小写不同在 Windows 上应视为同一目录（慢路径）")
		}
	} else if isUnder(mixed, root) {
		t.Errorf("在区分大小写的平台上（%s），大小写不同的目录不应判为子路径", runtime.GOOS)
	}
}
