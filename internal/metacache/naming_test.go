package metacache

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// encodeTestPNG 造一张最小的合法 PNG（缓存只做字节搬运，不看内容）。
func encodeTestPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, color.RGBA{uint8(x * 20), uint8(y * 20), 40, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

/* --------------------------------------------------------------------------
   缓存文件的命名安全化
   --------------------------------------------------------------------------
   在线试听曲目的 id 形如 "bili:BV1xx411c7mD"。冒号在 Windows 上是非法文件名
   字符，早期直接用 songID 当文件名，于是「试听时匹配到的歌词 / 换的封面」
   根本存不下来（报 rename: The parameter is incorrect）。
   -------------------------------------------------------------------------- */

func TestSafeFileID(t *testing.T) {
	cases := []struct {
		in       string
		wantSame bool
	}{
		{"abc123def", true},          // 常见本地 id：原样
		{"t_9f8e7d6c", true},         // 原样
		{"bili:BV1xx411c7mD", false}, // 冒号必须被替换
		{"a/b", false},               // 路径分隔符
		{"a\\b", false},              // Windows 路径分隔符
		{"..", false},                // 不能是目录引用
		{"", true},                   // 空串保持空（调用方另有校验）
		{"歌名", false},                // 中文按码点转义
	}
	for _, c := range cases {
		got := safeFileID(c.in)
		if c.in == "" {
			if got != "" {
				t.Errorf("safeFileID(%q) = %q，期望空", c.in, got)
			}
			continue
		}
		same := got == c.in
		if same != c.wantSame {
			t.Errorf("safeFileID(%q) = %q，期望改动=%v", c.in, got, !c.wantSame)
		}
		if got == "." || got == ".." {
			t.Errorf("safeFileID(%q) = %q，不能是目录引用", c.in, got)
		}
		if strings.HasPrefix(got, ".") {
			t.Errorf("safeFileID(%q) = %q，不该以点开头", c.in, got)
		}
		if strings.ContainsAny(got, `<>:"/\|?*`) {
			t.Errorf("safeFileID(%q) = %q 仍含非法字符", c.in, got)
		}
	}
}

// 转义后的名字不能和「本来就叫这个名字」的 id 撞车。
func TestSafeFileIDAvoidsCollision(t *testing.T) {
	a := safeFileID("bili:BV1xx")
	b := safeFileID("bili_003aBV1xx")
	if a == b {
		t.Fatalf("两个不同 id 得到了同一个文件名: %q", a)
	}
}

func TestSafeFileIDIsStable(t *testing.T) {
	for _, id := range []string{"bili:BV1xx411c7mD", "abc", "歌名-01"} {
		if safeFileID(id) != safeFileID(id) {
			t.Fatalf("同名调用结果不稳定: %q", id)
		}
	}
}

// 端到端：带冒号的 id 也能真的写进缓存目录并读回来。
func TestSaveLyricsWithOnlineID(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	const id = "bili:BV1xx411c7mD"

	path, err := s.SaveLyrics(id, "[00:01.00]试听歌词", "online:lrclib")
	if err != nil {
		t.Fatalf("在线 id 保存歌词失败: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("缓存文件不存在: %v", err)
	}
	if filepath.Dir(path) != filepath.Join(dir, string(KindLyrics)) {
		t.Fatalf("缓存文件不在歌词目录里: %s", path)
	}

	// 换一个 Store 实例（相当于重启）也要读得到
	fresh := NewStore(dir)
	got, ok := fresh.Lyrics(id)
	if !ok || got != "[00:01.00]试听歌词" {
		t.Fatalf("重启后读不到歌词: ok=%v got=%q", ok, got)
	}
}

func TestSaveCoverWithOnlineID(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	const id = "bili:BV1xx411c7mD"

	png := encodeTestPNG(t)
	if _, err := s.SaveCover(id, "image/png", png, "user"); err != nil {
		t.Fatalf("在线 id 保存封面失败: %v", err)
	}
	fresh := NewStore(dir)
	url, ok := fresh.CoverDataURL(id)
	if !ok || !strings.HasPrefix(url, "data:image/png;base64,") {
		t.Fatalf("重启后读不到封面: ok=%v url=%.40s", ok, url)
	}
}
