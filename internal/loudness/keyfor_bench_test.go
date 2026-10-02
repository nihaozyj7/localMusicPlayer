package loudness

import (
	"fmt"
	"strconv"
	"strings"
	"testing"
)

func keyForSprintf(path string, size, mod int64) string {
	return fmt.Sprintf("%s|%d|%d", path, size, mod)
}

// BenchmarkKeyForSprintf 迁移前的实现（作为对照基线）
func BenchmarkKeyForSprintf(b *testing.B) {
	paths := make([]string, 10000)
	for i := range paths {
		paths[i] = fmt.Sprintf("D:/Music/album%d/track%d.flac", i%500, i)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for j, p := range paths {
			_ = keyForSprintf(p, int64(j), int64(j*2))
		}
	}
}

// BenchmarkKeyForCurrent 当前实现（strconv + strings.Builder）
func BenchmarkKeyForCurrent(b *testing.B) {
	paths := make([]string, 10000)
	for i := range paths {
		paths[i] = fmt.Sprintf("D:/Music/album%d/track%d.flac", i%500, i)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for j, p := range paths {
			_ = keyFor(p, int64(j), int64(j*2))
		}
	}
}

// TestKeyForMatchesLegacyShape 新旧 key 的「可判定性」等价：
// 三要素任一不同 → key 必不同（这是缓存失效判定的正确性基础）
func TestKeyForMatchesLegacyShape(t *testing.T) {
	base := keyFor(`D:\m\a.flac`, 100, 200)
	cases := []struct {
		name       string
		path       string
		size, mod  int64
		wantDiffer bool
	}{
		{"同路径同大小同时间", `D:\m\a.flac`, 100, 200, false},
		{"大小不同", `D:\m\a.flac`, 101, 200, true},
		{"修改时间不同", `D:\m\a.flac`, 100, 201, true},
		{"路径不同", `D:\m\b.flac`, 100, 200, true},
		// 迁移前用 "|" 分隔，路径含 | 时会与拼接歧义撞 key；现在用 \x00 不会
		{"路径含竖线", `D:\m\a|b.flac`, 100, 200, true},
	}
	for _, c := range cases {
		got := keyFor(c.path, c.size, c.mod)
		if (got != base) != c.wantDiffer {
			t.Errorf("%s: key=%q, 期望与 %q %s", c.name, got, base,
				map[bool]string{true: "不同", false: "相同"}[c.wantDiffer])
		}
	}
}

// TestKeyForNoCollisionAcrossFields 字段边界不能串味
// （"ab"+1 与 "a"+"b1" 这类拼接歧义）
func TestKeyForNoCollisionAcrossFields(t *testing.T) {
	a := keyFor("ab", 1, 0)
	b := keyFor("a", 11, 0)
	if a == b {
		t.Errorf("不同 (path,size) 组合撞了同一个 key：%q", a)
	}
	c := keyFor("x", 1, 2)
	d := keyFor("x", 12, 0)
	if c == d {
		t.Errorf("不同 (size,mod) 组合撞了同一个 key：%q", c)
	}
	// 与旧实现的形状对照：分隔符必须是 \x00
	if !strings.Contains(a, "\x00") {
		t.Errorf("key 应使用 \\x00 分隔：%q", a)
	}
	if _, err := strconv.Atoi("1"); err != nil {
		t.Fatal(err)
	}
}
