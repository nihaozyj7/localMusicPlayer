package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"

	"localmusicplayer/internal/bootstrap"
)

// TestRectVisibleEnough 位置存档的校验规则：至少要三分之一面积落在某块屏幕里，
// 否则「启动后窗口看不见」，用户只会以为桌面歌词坏了。
func TestRectVisibleEnough(t *testing.T) {
	primary := &application.Screen{Bounds: application.Rect{X: 0, Y: 0, Width: 1920, Height: 1080}}
	left := &application.Screen{Bounds: application.Rect{X: -1920, Y: 0, Width: 1920, Height: 1080}}
	screens := []*application.Screen{primary, left}

	cases := []struct {
		name string
		x, y int
		want bool
	}{
		{"默认位置（主屏内）", 460, 840, true},
		{"副屏在主屏左侧（负坐标）", -1500, 300, true},
		{"跨屏边界，主屏这块可见", -200, 300, true},
		{"右下角完全在屏幕外", 4000, 2000, false},
		{"上方完全在屏幕外", 400, -400, false},
		{"左侧完全在屏幕外", -4000, 300, false},
		// 1000x132 的窗口需要 44000 像素可见面积：
		// 348*132 = 45936 ≥ 44000（刚好够），250*30 = 7500 不够
		{"只露出三分之一多一点", 1920 - 348, 1080 - 132, true},
		{"只露出一点点", 1920 - 250, 1080 - 30, false},
	}
	for _, c := range cases {
		got := rectVisibleEnough(c.x, c.y, desktopLyricsWidth, desktopLyricsHeight, screens)
		if got != c.want {
			t.Errorf("%s: rectVisibleEnough(%d,%d) = %v，期望 %v", c.name, c.x, c.y, got, c.want)
		}
	}
	if rectVisibleEnough(0, 0, desktopLyricsWidth, desktopLyricsHeight, nil) {
		t.Error("没有任何屏幕时应当判为不可见（拿不到屏幕信息就别冒险）")
	}
}

// TestDesktopLyricsPosSentinel 位置存档的哨兵值语义。
//
// 0 是合法坐标（主屏左上角就是 0，副屏在主屏左侧时 X 为负），
// 所以「没存过」只能用 -1 表示 —— 拿 0 当哨兵会把「拖到左上角」误判成没存过。
func TestDesktopLyricsPosSentinel(t *testing.T) {
	t.Setenv("LMPLAYER_DATA_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("创建配置存储失败: %v", err)
	}

	if _, _, ok := store.DesktopLyricsPos(); ok {
		t.Error("默认配置里不该有位置存档")
	}
	if err := store.SetDesktopLyricsPos(0, 0); err != nil {
		t.Fatalf("写入位置失败: %v", err)
	}
	x, y, ok := store.DesktopLyricsPos()
	if !ok || x != 0 || y != 0 {
		t.Fatalf("(0,0) 必须被当成有效存档，实际 ok=%v x=%d y=%d", ok, x, y)
	}
	// 落盘后再读一次（模拟重启）
	if err := store.Save(); err != nil {
		t.Fatal(err)
	}
	again, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if x, y, ok := again.DesktopLyricsPos(); !ok || x != 0 || y != 0 {
		t.Fatalf("重启后位置存档丢失，实际 ok=%v x=%d y=%d", ok, x, y)
	}
	if err := again.SetDesktopLyricsPos(bootstrap.DesktopLyricsNoPos, bootstrap.DesktopLyricsNoPos); err != nil {
		t.Fatal(err)
	}
	if _, _, ok := again.DesktopLyricsPos(); ok {
		t.Error("清掉存档后应当回到「没存过」")
	}
}
