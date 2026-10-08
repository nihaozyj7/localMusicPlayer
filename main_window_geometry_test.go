package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"

	"localmusicplayer/internal/bootstrap"
)

// newGeomStore 造一个用临时目录的配置存储（模拟一次全新的安装）。
func newGeomStore(t *testing.T) *bootstrap.Store {
	t.Helper()
	t.Setenv("LMPLAYER_DATA_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("创建配置存储失败: %v", err)
	}
	return store
}

// TestMainWindowGeometrySentinel 主窗口几何存档的哨兵值语义。
//
// 与桌面歌词同一个理由：0 是合法坐标（主屏左上角），「没存过」只能用 -1。
// 而尺寸相反 —— 0 宽/高的窗口没有意义，所以 W/H 用 >0 判断就够了。
func TestMainWindowGeometrySentinel(t *testing.T) {
	store := newGeomStore(t)

	_, _, w, h, okPos, okSize, maxed := store.MainWindowGeometry()
	if okPos {
		t.Error("默认配置里不该有位置存档")
	}
	if okSize {
		t.Errorf("默认配置里不该有尺寸存档，实际 w=%d h=%d", w, h)
	}
	if maxed {
		t.Error("默认配置里不该是最大化状态")
	}

	// (0,0) 必须被当成有效位置
	if err := store.SetMainWindowGeometry(0, 0, 1280, 820); err != nil {
		t.Fatalf("写入几何失败: %v", err)
	}
	x, y, w, h, okPos, okSize, _ := store.MainWindowGeometry()
	if !okPos || x != 0 || y != 0 {
		t.Fatalf("(0,0) 必须被当成有效位置，实际 ok=%v x=%d y=%d", okPos, x, y)
	}
	if !okSize || w != 1280 || h != 820 {
		t.Fatalf("尺寸存档不对，实际 ok=%v w=%d h=%d", okSize, w, h)
	}

	// 落盘再读（模拟重启）
	if err := store.Save(); err != nil {
		t.Fatal(err)
	}
	again, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, w2, h2, okPos, okSize, _ := again.MainWindowGeometry(); !okPos || !okSize || w2 != 1280 || h2 != 820 {
		t.Fatalf("重启后几何存档丢失，okPos=%v okSize=%v w=%d h=%d", okPos, okSize, w2, h2)
	}
}

// TestMainWindowGeometryPartialUpdate 位置与尺寸可以各自单独更新。
//
// 这条是核心：移动到新位置不应该顺手把尺寸覆盖成 0，反之亦然。
// move 与 resize 事件分别只更新自己那一项就依赖这个语义。
func TestMainWindowGeometryPartialUpdate(t *testing.T) {
	store := newGeomStore(t)

	if err := store.SetMainWindowGeometry(100, 200, 1280, 820); err != nil {
		t.Fatal(err)
	}

	// 只更新位置（尺寸传 0 = 别动）
	if err := store.SetMainWindowGeometry(300, 400, 0, 0); err != nil {
		t.Fatal(err)
	}
	x, y, w, h, _, okSize, _ := store.MainWindowGeometry()
	if x != 300 || y != 400 {
		t.Errorf("位置没更新到，得到 %d,%d", x, y)
	}
	if !okSize || w != 1280 || h != 820 {
		t.Errorf("只改位置时尺寸被破坏了，得到 w=%d h=%d", w, h)
	}

	// 只更新尺寸（位置传哨兵 = 别动）
	if err := store.SetMainWindowGeometry(bootstrap.MainWindowNoPos, bootstrap.MainWindowNoPos, 1600, 900); err != nil {
		t.Fatal(err)
	}
	x, y, w, h, okPos, _, _ := store.MainWindowGeometry()
	if !okPos || x != 300 || y != 400 {
		t.Errorf("只改尺寸时位置被破坏了，得到 okPos=%v x=%d y=%d", okPos, x, y)
	}
	if w != 1600 || h != 900 {
		t.Errorf("尺寸没更新到，得到 w=%d h=%d", w, h)
	}
}

// TestMainWindowGeometryMaximizedToggle 最大化标志与几何互不干扰。
func TestMainWindowGeometryMaximizedToggle(t *testing.T) {
	store := newGeomStore(t)

	if err := store.SetMainWindowGeometry(100, 200, 1280, 820); err != nil {
		t.Fatal(err)
	}
	if err := store.SetMainWindowMaximized(true); err != nil {
		t.Fatal(err)
	}
	// 最大化过程中系统发的 resize 不该把「最大化」这个标志冲掉
	if err := store.SetMainWindowGeometry(bootstrap.MainWindowNoPos, bootstrap.MainWindowNoPos, 1920, 1040); err != nil {
		t.Fatal(err)
	}
	_, _, _, _, okPos, _, maxed := store.MainWindowGeometry()
	if !okPos || !maxed {
		t.Errorf("最大化标志被几何更新冲掉了，okPos=%v maxed=%v", okPos, maxed)
	}
}

// TestMainWindowResetGeometry 重置必须把四项一起清干净。
func TestMainWindowResetGeometry(t *testing.T) {
	store := newGeomStore(t)

	if err := store.SetMainWindowGeometry(500, 600, 1400, 900); err != nil {
		t.Fatal(err)
	}
	if err := store.SetMainWindowMaximized(true); err != nil {
		t.Fatal(err)
	}
	if err := store.ResetMainWindowGeometry(); err != nil {
		t.Fatal(err)
	}

	_, _, _, _, okPos, okSize, maxed := store.MainWindowGeometry()
	if okPos || okSize || maxed {
		t.Errorf("重置后应当回到「没存过」，实际 okPos=%v okSize=%v maxed=%v", okPos, okSize, maxed)
	}
}

// geomTestScreens 造一套「主屏 + 左侧副屏」的屏幕布局。
func geomTestScreens() []*application.Screen {
	primary := &application.Screen{
		IsPrimary: true,
		Bounds:    application.Rect{X: 0, Y: 0, Width: 1920, Height: 1080},
		WorkArea:  application.Rect{X: 0, Y: 0, Width: 1920, Height: 1040},
	}
	left := &application.Screen{
		Bounds:   application.Rect{X: -1920, Y: 0, Width: 1920, Height: 1080},
		WorkArea: application.Rect{X: -1920, Y: 0, Width: 1920, Height: 1040},
	}
	return []*application.Screen{primary, left}
}

// TestValidateMainWindowGeometry 存档校验：屏幕外 / 尺寸越界都要被拒。
//
// 这是「换显示器之后窗口启动了但看不见」的防线 —— 那比不记忆还糟，
// 因为用户完全不知道发生了什么、也没有明显办法救回来。
func TestValidateMainWindowGeometry(t *testing.T) {
	screens := geomTestScreens()

	cases := []struct {
		name       string
		x, y, w, h int
		hasPos     bool
		hasSize    bool
		maximized  bool
		wantPos    bool
		wantSize   bool
		wantW      int
		wantH      int
		wantMax    bool
	}{
		{
			name: "正常存档（主屏内、尺寸合法）",
			x:    100, y: 100, w: 1280, h: 820,
			hasPos: true, hasSize: true,
			wantPos: true, wantSize: true, wantW: 1280, wantH: 820,
		},
		{
			name: "副屏在主屏左侧（负坐标必须被接受）",
			x:    -1500, y: 200, w: 1280, h: 820,
			hasPos: true, hasSize: true,
			wantPos: true, wantSize: true, wantW: 1280, wantH: 820,
		},
		{
			name: "位置完全在屏幕外",
			x:    5000, y: 3000, w: 1280, h: 820,
			hasPos: true, hasSize: true,
			wantPos: false, wantSize: true, wantW: 1280, wantH: 820,
		},
		{
			name: "只露出一点点（不足三分之一）",
			x:    1920 - 200, y: 1080 - 40, w: 1280, h: 820,
			hasPos: true, hasSize: true,
			wantPos: false, wantSize: true, wantW: 1280, wantH: 820,
		},
		{
			name: "尺寸小于最小值",
			x:    100, y: 100, w: 800, h: 600,
			hasPos: true, hasSize: true,
			wantPos: true, wantSize: false,
		},
		{
			// 尺寸越界时位置仍然保留：位置本身往往还是对的，
			// 整个放弃存档会让用户白丢一次摆放。
			name: "尺寸过大（8K 屏存档搬到笔记本上）",
			x:    100, y: 100, w: 12000, h: 8000,
			hasPos: true, hasSize: true,
			wantPos: true, wantSize: false,
		},
		{
			name: "只存了位置没存尺寸（用默认尺寸算可见面积）",
			x:    200, y: 300, w: 0, h: 0,
			hasPos: true, hasSize: false,
			wantPos: true, wantSize: false,
		},
		{
			name: "只存了尺寸没存位置（位置交给 Wails 居中）",
			x:    0, y: 0, w: 1400, h: 900,
			hasPos: false, hasSize: true,
			wantPos: false, wantSize: true, wantW: 1400, wantH: 900,
		},
		{
			// 位置存档坏掉不该把「上次是最大化」一起丢掉 ——
			// 那两件事没有关系。
			name: "位置在屏幕外但上次是最大化",
			x:    9999, y: 9999, w: 0, h: 0,
			hasPos: true, hasSize: false, maximized: true,
			wantPos: false, wantSize: false, wantMax: true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, _, gotW, gotH, okPos, okSize, gotMax := validateMainWindowGeometry(
				c.x, c.y, c.w, c.h, c.hasPos, c.hasSize, c.maximized, screens,
			)
			if okPos != c.wantPos {
				t.Errorf("okPos = %v，期望 %v", okPos, c.wantPos)
			}
			if okSize != c.wantSize {
				t.Errorf("okSize = %v，期望 %v", okSize, c.wantSize)
			}
			if gotMax != c.wantMax {
				t.Errorf("maximized = %v，期望 %v", gotMax, c.wantMax)
			}
			if okSize && (gotW != c.wantW || gotH != c.wantH) {
				t.Errorf("尺寸 = %dx%d，期望 %dx%d", gotW, gotH, c.wantW, c.wantH)
			}
		})
	}
}

// TestValidateMainWindowGeometryNoScreens 屏幕信息还没就绪时要保守放行位置。
//
// 这条很容易搞反：启动时 app.Screen.GetAll() 在窗口创建那一刻**必然是空的**
// （屏幕枚举要等 Wails 原生 side 初始化完才跑，而 winOpts 必须在那之前填好）。
// 若把「空屏幕列表」当成「窗口不可见」，每次启动都会丢掉位置存档、永远居中 ——
// 功能看起来完全没生效。实测踩过这个坑（日志表现为 screens=0 且 okPos=false）。
//
// 真正的「屏幕外」判定只在确实拿到屏幕列表时才做；拿不到时先信任存档，
// 由 ensureMainWindowOnScreen 在屏幕信息就绪后纠正。
func TestValidateMainWindowGeometryNoScreens(t *testing.T) {
	x, y, w, h, okPos, okSize, _ := validateMainWindowGeometry(
		100, 200, 1280, 820, true, true, false, nil,
	)
	if !okPos {
		t.Error("拿不到屏幕信息时应当保守放行位置（信任存档）")
	}
	if x != 100 || y != 200 {
		t.Errorf("位置应原样返回，得到 %d,%d", x, y)
	}
	if !okSize || w != 1280 || h != 820 {
		t.Errorf("尺寸校验不该受屏幕信息影响，okSize=%v w=%d h=%d", okSize, w, h)
	}

	// 空切片（不是 nil）也要同样放行
	if _, _, _, _, okPos, _, _ := validateMainWindowGeometry(
		100, 200, 1280, 820, true, true, false, []*application.Screen{},
	); !okPos {
		t.Error("空屏幕列表也应当保守放行位置")
	}

	// 但「拿不到屏幕」不能凭空造出位置：没存过依然是没存过
	if _, _, _, _, okPos, _, _ := validateMainWindowGeometry(
		0, 0, 0, 0, false, false, false, nil,
	); okPos {
		t.Error("没有位置存档时不该放行")
	}
}

// TestEnsureMainWindowOnScreenDecidesCorrectly 屏幕就绪后的纠正判定。
//
// 只测判定逻辑本身（不进 SetPosition）：给定窗口几何与屏幕列表，
// 回答「这个窗口在不在屏幕里」。与 rectVisibleEnough 的规则一致。
func TestEnsureMainWindowOnScreenDecidesCorrectly(t *testing.T) {
	screens := geomTestScreens()

	cases := []struct {
		name      string
		x, y      int
		wantFix   bool
		wantWhyIt string
	}{
		{"主屏内不需要纠正", 100, 100, false, "窗口本来就在屏幕里"},
		{"副屏（负坐标）不需要纠正", -1500, 300, false, "副屏也是屏幕"},
		{"屏幕外需要拉回来", 9000, 9000, true, "所有屏幕都看不见它"},
		{"只露出一点点需要拉回来", 1920 - 150, 1080 - 20, true, "可见面积不足三分之一"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			visible := rectVisibleEnough(c.x, c.y, 1280, 820, screens)
			if needFix := !visible; needFix != c.wantFix {
				t.Errorf("%s: 需要纠正 = %v，期望 %v（%s）", c.name, needFix, c.wantFix, c.wantWhyIt)
			}
		})
	}
}

// TestNoteGeometryTouchedGating 「用户动过窗口」的判定门。
//
// 这个标志决定了启动时要不要恢复最大化（动过就不抢控制权）。它必须排掉
// 两类不是用户操作的移动，否则会出现「最大化永远恢复不了」：
//
//  1. 启动序列期间框架/我们自己摆放窗口（门没开）；
//  2. 程序主动纠正位置/重置窗口时调的那几下 SetPosition。
//
// 这两条都是实测踩出来的：第一次实现没排除 (1)，日志里稳定出现
// 「用户在启动期间动过窗口，跳过最大化恢复」，场景 C 恒失败。
func TestNoteGeometryTouchedGating(t *testing.T) {
	t.Run("启动序列期间不算用户操作", func(t *testing.T) {
		s := &WindowService{}
		// 门没开（attachMainWindowGeometryTracking 之后、markGeometryTrackingReady 之前）
		s.noteGeometryTouched()
		if s.mainGeomUserTouched.Load() {
			t.Error("门没开时不该标记为用户操作")
		}
	})

	t.Run("开门后正常标记", func(t *testing.T) {
		s := &WindowService{}
		s.markGeometryTrackingReady()
		s.noteGeometryTouched()
		if !s.mainGeomUserTouched.Load() {
			t.Error("门开了之后用户的移动必须被标记")
		}
	})

	t.Run("程序自己发起的移动不算用户操作", func(t *testing.T) {
		s := &WindowService{}
		s.markGeometryTrackingReady()
		s.mainGeomSelfMove.Store(true) // 模拟 ensureMainWindowOnScreen 的 SetPosition
		s.noteGeometryTouched()
		if s.mainGeomUserTouched.Load() {
			t.Error("程序自己挪窗口不该算用户操作（否则纠正过位置就再也恢复不了最大化）")
		}
	})
}

// TestMarkGeometryTrackingReady 门一旦开了就不该再关上。
//
// 反过来的话（关门后忘了开），用户之后拖窗口永远标记不上，
// 下次启动就会跟用户抢控制权、强行最大化。
func TestMarkGeometryTrackingReady(t *testing.T) {
	s := &WindowService{}
	if s.mainGeomTrackingReady.Load() {
		t.Error("默认应当是关着的（启动序列先关门）")
	}
	s.markGeometryTrackingReady()
	if !s.mainGeomTrackingReady.Load() {
		t.Error("markGeometryTrackingReady 之后应当开着")
	}
}
