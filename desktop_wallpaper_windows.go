//go:build windows

package main

import (
	"errors"
	"fmt"
	"log"
	"syscall"
	"unsafe"
)

/* ==========================================================================
   把窗口垫到桌面图标之下（Windows）
   --------------------------------------------------------------------------
   目标：让一个自己的窗口显示在「壁纸之上、桌面图标之下」的那一层。

   桌面在这一层不是普通窗口，而是资源管理器搭出来的一棵树。要挂进去必须：
     1. 先让 Progman 把壁纸层（WorkerW）建出来 —— 靠未公开消息 0x052C；
     2. 把这棵树找出来，挑出「图标下面那一层」；
     3. SetParent 把窗口塞进去，把样式改成 WS_CHILD，再压到 z 序最底。

   为什么代码里有好几个候选（而不是硬编码一个 HWND）：
   这棵树的结构在 Windows 版本之间变过（Win7/10 与 Win11 24H2 就不一样），
   而且「哪个 WorkerW 在图标后面」取决于当前 z 序。所以这里按
   「越贴近图标视图的候选越优先」排了一遍，逐个试，全部失败才算不支持。

   全部走 syscall.NewLazyDLL，不额外引入 Windows 绑定依赖 ——
   与 Wails 自带的 w32 包保持同一种写法（见 backdrop_windows.go 的用法）。
   ========================================================================== */

const (
	progmanClass   = "Progman"
	workerWClass   = "WorkerW"
	shellViewClass = "SHELLDLL_DefView"

	// wmSpawnWorkerW 是发给 Progman 的未公开消息（0x052C）：让资源管理器
	// 在桌面图标后面再建一层 WorkerW。所有壁纸类程序都靠它拿到那块画布。
	wmSpawnWorkerW = 0x052C

	// SendMessageTimeout 的标志：超时就返回，不要卡死在自己的启动流程里
	smtoAbortIfHung = 0x0002
	wmSpawnTimeout  = 2000

	// GetWindowLong / SetWindowLong 的下标
	gwlStyle   = -16
	gwlExStyle = -20

	// 窗口样式
	wsChild        = 0x40000000
	wsVisible      = 0x10000000
	wsPopup        = 0x80000000
	wsCaption      = 0x00C00000
	wsThickFrame   = 0x00040000
	wsSysMenu      = 0x00080000
	wsMinimizeBox  = 0x00020000
	wsMaximizeBox  = 0x00010000
	wsClipSiblings = 0x04000000
	wsClipChildren = 0x02000000

	// 扩展样式
	wsExTopmost     = 0x00000008
	wsExTransparent = 0x00000020
	wsExToolWindow  = 0x00000080
	wsExAppWindow   = 0x00040000
	wsExLayered     = 0x00080000
	wsExNoActivate  = 0x08000000

	// SetWindowPos
	// 刻意没有 SWP_SHOWWINDOW：挂载阶段只摆位置、不动可见性
	//（见 attachDesktopWallpaperWindow 的说明）。
	hwndBottom      = 1 // HWND_BOTTOM
	swpNoZOrder     = 0x0004
	swpNoActivate   = 0x0010
	swpFrameChanged = 0x0020
)

var (
	modUser32 = syscall.NewLazyDLL("user32.dll")

	procFindWindowW         = modUser32.NewProc("FindWindowW")
	procFindWindowExW       = modUser32.NewProc("FindWindowExW")
	procEnumWindows         = modUser32.NewProc("EnumWindows")
	procGetClassNameW       = modUser32.NewProc("GetClassNameW")
	procGetParent           = modUser32.NewProc("GetParent")
	procSetParent           = modUser32.NewProc("SetParent")
	procIsWindow            = modUser32.NewProc("IsWindow")
	procGetWindowLongW      = modUser32.NewProc("GetWindowLongW")
	procSetWindowLongW      = modUser32.NewProc("SetWindowLongW")
	procSetWindowPos        = modUser32.NewProc("SetWindowPos")
	procGetClientRect       = modUser32.NewProc("GetClientRect")
	procGetSystemMetrics    = modUser32.NewProc("GetSystemMetrics")
	procSendMessageTimeoutW = modUser32.NewProc("SendMessageTimeoutW")
)

// winRect 是 Win32 的 RECT（这里只用到这几个字段）
type winRect struct {
	Left, Top, Right, Bottom int32
}

// GetSystemMetrics 的下标（拿整屏尺寸用，作为壁纸层尺寸取不到时的兜底）
const (
	smCxScreen = 0
	smCyScreen = 1
)

/* --------------------------------------------------------------------------
   对外能力探测
   -------------------------------------------------------------------------- */

// desktopWallpaperSupport 报告当前系统能不能把窗口垫到桌面图标之下。
//
// 判据只有一条：桌面窗口（Progman）在不在。真正能不能挂上去要等 SetParent，
// 那一步失败会在打开时给出具体原因，而不是在这里假装不支持。
func desktopWallpaperSupport() (bool, string) {
	if findWindow(progmanClass, "") == 0 {
		return false, "找不到桌面窗口（Progman），当前 shell 可能不是资源管理器"
	}
	return true, ""
}

/* --------------------------------------------------------------------------
   挂载 / 卸载
   -------------------------------------------------------------------------- */

// armDesktopWallpaperOffscreen 让背景歌词窗口在「用户看不见」的前提下开始渲染首帧。
//
// 这是「刚打开的时候黑一下」的正解，与主窗口是同一套（services.go#showPrepared）：
// WebView2 的合成器要等窗口可见才出帧，所以「窗口显示出来」与「第一帧真的被合成
// 出来」之间必然有一段空档，那段时间窗口里什么都没有，露出来的是窗口自己的底色。
// DWM 的 cloak 只作用在显示层 —— 窗口照样 WS_VISIBLE、合成器照样出帧、
// 页面的 rAF 照样派发，但屏幕上什么都没有，空档就藏在这里面。
//
// ★ 为什么必须在**挂进壁纸层之前**做：
// DWM 只对顶层窗口负责 —— 实测一旦 SetParent 成 WS_CHILD，
// DwmSetWindowAttribute(DWMWA_CLOAK) 就会返回 0x80070006(E_HANDLE)，
// 遮罩再也摘不掉。所以顺序只能是「遮着当顶层窗口渲染」→（页面确认首帧已提交）→
// 「摘遮罩 + 挂进壁纸层」（见 revealAndAttachDesktopWallpaper），
// 而不是主窗口那种「遮住自己 → 就绪后摘掉」。
//
// 返回 false 表示本机做不到（找不到壁纸层 / 遮不住），调用方退回旧路径。
func armDesktopWallpaperOffscreen(raw unsafe.Pointer) bool {
	hwnd := uintptr(raw)
	if hwnd == 0 || !isWindow(hwnd) {
		return false
	}
	// 壁纸层现在就找：它同时用来定尺寸。此刻找不到就不该走这条路 ——
	// 挂载要等到页面画好之后才做，那时已经没法把「开不了」告诉用户了
	//（openDesktopWallpaperWindow 早就返回了）。
	layer, _ := findWallpaperLayer()
	if layer == 0 {
		return false
	}
	// 遮不住就老老实实按旧路径来：宁可黑一下，也不要让用户看见一个提前
	// 露出来的空窗口（那比原来还糟）。
	if !cloakNativeWindow(raw, true) {
		return false
	}

	// 阶段一它是个铺满屏幕的顶层窗口，这三件事得自己保证
	//（挂载那一步还会再设一次，那一次是给 WS_CHILD 用的）：
	//   · WS_EX_TOOLWINDOW   不进任务栏、不进 Alt+Tab；
	//   · WS_EX_NOACTIVATE   永远不会把用户正在用的窗口踢到后台；
	//   · WS_EX_TRANSPARENT  鼠标命中也穿透过去。
	// 最后一条不是可选项：这段时间它盖住整块屏幕，而用户根本看不见它 ——
	// DWM 的遮罩只作用于显示层，命中测试照样会命中它。
	// 不穿透的话，从「点了开关」到「首帧画好」这几百毫秒里（启动时恢复这个模式
	// 甚至有几秒）用户点什么都会落在一块看不见的窗口上，像卡住了一样。
	// 挂载时会把这一位清掉，恢复成和以前完全一样的窗口样式。
	exStyle := uint32(getWindowLong(hwnd, gwlExStyle))
	exStyle &^= wsExTopmost | wsExAppWindow | wsExLayered
	exStyle |= wsExToolWindow | wsExNoActivate | wsExTransparent
	setWindowLong(hwnd, gwlExStyle, exStyle)

	// 顺手把外框拆掉、改成一个没有非客户区的 WS_POPUP：
	// 于是「窗口矩形 == 客户区矩形」，WebView2 从现在起就按**最终的**尺寸排版与渲染。
	// 这一步很重要 —— 挂载时只改父子关系、尺寸一个像素都不动，
	// 合成器因此不需要重建渲染表面，遮罩后面画好的那一帧可以直接被搬进桌面。
	// 要是等到挂载时再从头排版，那一下又会露出没画好的一帧。
	style := uint32(getWindowLong(hwnd, gwlStyle))
	style &^= wsCaption | wsThickFrame | wsSysMenu | wsMinimizeBox | wsMaximizeBox
	style |= wsPopup
	setWindowLong(hwnd, gwlStyle, style)

	// 摆到壁纸层一样大。刻意不动 WS_VISIBLE（窗口是隐藏创建的，本来就还没可见）：
	// 显示由调用方紧接着的那次 Show() 负责，那是「遮罩 + 显示」的组合拳。
	width, height := wallpaperLayerSize(layer)
	procSetWindowPos.Call(hwnd, 0, 0, 0, uintptr(width), uintptr(height),
		swpNoZOrder|swpNoActivate|swpFrameChanged)

	log.Printf("[desktop-wallpaper] 已遮罩显示（后台渲染首帧，尺寸 %dx%d），待首帧就绪后挂进壁纸层",
		width, height)
	return true
}

// wallpaperLayerSize 返回壁纸层的客户区尺寸（物理像素），取不到时退回整屏尺寸。
//
// 取不到客户区是极少数 shell 组合，这时退回主屏物理尺寸 ——
// 至少铺满一块，而不是退化成一个 0×0 的隐形窗口。
func wallpaperLayerSize(layer uintptr) (int, int) {
	var rc winRect
	procGetClientRect.Call(layer, uintptr(unsafe.Pointer(&rc)))
	width := int(rc.Right - rc.Left)
	height := int(rc.Bottom - rc.Top)
	if width <= 0 || height <= 0 {
		width = int(getSystemMetrics(smCxScreen))
		height = int(getSystemMetrics(smCyScreen))
	}
	return width, height
}

// revealAndAttachDesktopWallpaper 把「已经画好首帧、还遮着」的窗口挂进壁纸层并露面。
//
// 顺序是本函数存在的全部理由，三步都不能换位置：
//
// ① 先找壁纸层。这一步要等资源管理器（SendMessageTimeout），期间窗口必须还是
// 遮着的 —— 否则那几毫秒里会有一个铺满屏幕的顶层窗口露出来。
// ② 在**还是顶层窗口**的时候摘遮罩。实测：一旦 SetParent 成 WS_CHILD，
// DwmSetWindowAttribute(DWMWA_CLOAK) 直接返回 0x80070006(E_HANDLE) ——
// 子窗口上遮罩根本摘不掉，读回值还停在「已遮」。所以「先挂载、后摘遮罩」
// 是行不通的。
// ③ 立刻改样式 + SetParent + 摆位置。这三下都是不派发消息的 Win32 调用，
// 「已摘遮罩」与「已经是子窗口」之间短到连一帧都凑不出来，
// 所以第 ② 步不会在屏幕上留下任何东西。
//
// 失败时（第 ③ 步挂不上）会把遮罩加回去再返回：此刻窗口仍是顶层窗口，
// 遮罩加得回来，也就不会留下一块盖住整个桌面的无边框窗口。
func revealAndAttachDesktopWallpaper(raw unsafe.Pointer) error {
	hwnd := uintptr(raw)
	if hwnd == 0 || !isWindow(hwnd) {
		return errors.New("窗口句柄无效")
	}

	layer, how := findWallpaperLayer()
	if layer == 0 {
		return errors.New("找不到桌面壁纸层（WorkerW）")
	}

	// 顶层状态下摘遮罩（这一步必须成功：摘不掉就说明它本来就不在遮罩里）
	if !cloakNativeWindow(raw, false) {
		log.Printf("[desktop-wallpaper] 摘掉启动遮罩失败（继续挂载，窗口可能一直不出现）")
	}

	if err := attachDesktopWallpaperWindowTo(hwnd, layer, how); err != nil {
		// 挂不上就遮回去：宁可什么都不出现，也不要一块盖住整个桌面的窗口。
		cloakNativeWindow(raw, true)
		return err
	}
	return nil
}

// attachDesktopWallpaperWindow 自己找壁纸层，把窗口挂进去（旧路径与首建路径用）。
//
// raw 是 Wails 的 NativeWindow()（Windows 上就是 HWND）。
func attachDesktopWallpaperWindow(raw unsafe.Pointer) error {
	hwnd := uintptr(raw)
	if hwnd == 0 || !isWindow(hwnd) {
		return errors.New("窗口句柄无效")
	}

	layer, how := findWallpaperLayer()
	if layer == 0 {
		return errors.New("找不到桌面壁纸层（WorkerW）")
	}
	return attachDesktopWallpaperWindowTo(hwnd, layer, how)
}

// attachDesktopWallpaperWindowTo 是真正的挂载动作（壁纸层已经找好了）。
//
// 单独拆出来是为了让 revealAndAttachDesktopWallpaper 能把「找层」那一步
// （会等资源管理器）挪到摘遮罩之前，中间不留空隙。
func attachDesktopWallpaperWindowTo(hwnd, layer uintptr, how string) error {
	// 1) 先变成子窗口。
	//    只有 WS_CHILD 才能待在桌面那棵树里；同时把标题栏/边框那一套去掉，
	//    WS_EX_TOOLWINDOW 让它彻底不进任务栏与 Alt+Tab，
	//    WS_EX_NOACTIVATE 保证它永远不会抢焦点（抢了就会把用户正在用的窗口踢到后台）。
	//
	//    ★ 这里**不动 WS_VISIBLE**：可见性现在携带语义，而且两条路径要的不一样。
	//      · 两阶段路径：窗口此刻是 WS_VISIBLE 的（遮罩已经在
	//        revealAndAttachDesktopWallpaper 里摘掉了）—— 必须保持可见，
	//        挂进来才看得见；
	//      · 旧路径：窗口是隐藏创建的，这里也保持隐藏，等页面画好第一帧再 Show()。
	//    早先这里写死了一句 style &^= wsVisible，那会让两阶段路径的窗口在挂载的
	//    同一瞬间变回隐藏 —— 后台画好的首帧就白渲染了（露出来仍是黑的）。
	style := uint32(getWindowLong(hwnd, gwlStyle))
	style &^= wsPopup | wsCaption | wsThickFrame | wsSysMenu | wsMinimizeBox | wsMaximizeBox
	style |= wsChild | wsClipSiblings | wsClipChildren
	setWindowLong(hwnd, gwlStyle, style)

	// 顺手清掉 armDesktopWallpaperOffscreen 为「看不见的顶层窗口」加的
	// WS_EX_TRANSPARENT：挂进来之后它在壁纸层的最底下，鼠标本来也落不到它身上，
	// 清掉是为了让挂载后的窗口样式与旧实现逐位一致（少一个说不清的行为差异）。
	exStyle := uint32(getWindowLong(hwnd, gwlExStyle))
	exStyle &^= wsExTopmost | wsExAppWindow | wsExLayered | wsExTransparent
	exStyle |= wsExToolWindow | wsExNoActivate
	setWindowLong(hwnd, gwlExStyle, exStyle)

	// 2) 挂上去
	if r, _, err := procSetParent.Call(hwnd, layer); r == 0 {
		return fmt.Errorf("SetParent 失败: %v", err)
	}
	if got := getParent(hwnd); got != layer {
		return errors.New("SetParent 被系统拒绝（桌面壁纸层不接受外部窗口）")
	}

	// 3) 铺满壁纸层的客户区，并压到 z 序最底 —— 那才是「在桌面图标之下」。
	//    坐标是父窗口客户区坐标，壁纸层的原点就是 (0,0)，所以直接给 0,0。
	//
	//    尺寸与 armDesktopWallpaperOffscreen 里摆的那一次一致，所以窗口不会因为
	//    挂载而改变大小（合成器不用重建表面，遮罩后面画好的那一帧直接可用）。
	//    只摆位置、排 z 序，刻意**不带** SWP_SHOWWINDOW：
	//    显示时机由宿主决定，见函数开头第 1 步的说明。
	width, height := wallpaperLayerSize(layer)
	procSetWindowPos.Call(hwnd, hwndBottom, 0, 0, uintptr(width), uintptr(height),
		swpNoActivate|swpFrameChanged)

	log.Printf("[desktop-wallpaper] 已挂到桌面壁纸层（%s，父窗口 0x%X，尺寸 %dx%d）",
		how, layer, width, height)
	return nil
}

// findWallpaperLayer 找出「图标下面那一层」的窗口，并说明是哪个候选命中的。
//
// 桌面那棵树的结构在 Windows 版本之间反复变过，实测至少有三种形态：
//
//	A) Progman → SHELLDLL_DefView（图标），另有排在它后面的兄弟 WorkerW
//	B) Progman → WorkerW → SHELLDLL_DefView（Win11 24H2）
//	C) Progman → SHELLDLL_DefView，壁纸层是排在图标宿主后面的顶层 WorkerW（老 Win10）
//
// 三种形态说的是同一句话：**壁纸层就是紧跟在图标视图后面的那一层**。
// 所以这里以图标视图为锚点，按「离它有多近」逐个试，命中即返回，
// 并带一个来源标记（出问题时日志里能直接看出走的是哪条路径）。
//
// 全部失败也不硬撑：最后退回 Progman 自己 —— 图标视图终究是它的后代，
// 压到最底同样在图标之下。
func findWallpaperLayer() (uintptr, string) {
	progman := findWindow(progmanClass, "")
	if progman == 0 {
		return 0, ""
	}

	// 先请资源管理器把壁纸层建出来。
	// 老版本 Windows 上不做这一步，下面这些候选根本不存在；
	// 新版本上这一步是无害的（消息没人处理，超时即返回）。
	// 实测 Win11 24H2 上这一下会真的多出一个 Progman 的子 WorkerW —— 正是壁纸层。
	sendMessageTimeout(progman, wmSpawnWorkerW, 0, 0)
	sendMessageTimeout(progman, wmSpawnWorkerW, 0x0D, 1)

	// ① 以图标视图（SHELLDLL_DefView）为锚点，找它「后面一层」。
	if defView, found := findDescendant(progman, shellViewClass, 0); found {
		parent := getParent(defView)

		// ①-a 图标视图的下一个兄弟 WorkerW（形态 A，实测本机命中的就是这条）
		if next := findWindowEx(parent, defView, workerWClass, ""); next != 0 {
			return next, "图标视图之后的兄弟 WorkerW"
		}
		// ①-b 图标视图就住在 WorkerW 里（形态 B）：那个 WorkerW 本身就是壁纸层
		if parent != 0 && className(parent) == workerWClass {
			return parent, "图标视图所在 WorkerW"
		}
		// ①-c 形态 C：壁纸层是排在图标宿主后面的顶层 WorkerW
		if parent != 0 {
			if next := findWindowEx(0, parent, workerWClass, ""); next != 0 {
				return next, "图标宿主之后的顶层 WorkerW"
			}
		}
	}

	// ② 兜底：Progman 的子 WorkerW 里最后一个（它一定排在图标视图后面）
	if last := lastChildWindow(progman, workerWClass); last != 0 {
		return last, "兜底：Progman 的最后一个子 WorkerW"
	}
	// ③ 兜底：顶层 WorkerW 里最后一个。
	// 这条**不能**提到前面去：机器上常年存在一堆别的小程序建的 WorkerW
	// （实测有二十多个 136×39 的隐藏窗口，分属不同进程），盲选一个会把窗口
	// 挂进一个永远不可见的壳里 —— 「日志说挂载成功、桌面上却什么都没有」
	// 就是这么来的。
	if last := lastTopLevelWindow(workerWClass); last != 0 {
		return last, "兜底：最后一个顶层 WorkerW"
	}
	return progman, "兜底：Progman"
}

/* --------------------------------------------------------------------------
   Win32 薄封装
   -------------------------------------------------------------------------- */

func findWindow(class, title string) uintptr {
	classPtr, err := syscall.UTF16PtrFromString(class)
	if err != nil {
		return 0
	}
	var titlePtr *uint16
	if title != "" {
		if titlePtr, err = syscall.UTF16PtrFromString(title); err != nil {
			return 0
		}
	}
	r, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(classPtr)), uintptr(unsafe.Pointer(titlePtr)))
	return r
}

func findWindowEx(parent, after uintptr, class, title string) uintptr {
	var classPtr, titlePtr *uint16
	if class != "" {
		classPtr, _ = syscall.UTF16PtrFromString(class)
	}
	if title != "" {
		titlePtr, _ = syscall.UTF16PtrFromString(title)
	}
	r, _, _ := procFindWindowExW.Call(parent, after,
		uintptr(unsafe.Pointer(classPtr)), uintptr(unsafe.Pointer(titlePtr)))
	return r
}

// findDescendant 在 root 的子树里找第一个指定类名的窗口（先查一层，再递归）。
//
// depth 既是递归层数也是安全阀：桌面那棵树很浅，超过几层说明结构已经不是
// 我们认识的样子了，继续翻只会浪费时间。
//
// 返回值刻意带一个 found：HWND 0 是「没找到」，用它当哨兵会让调用方写出
// `if defView := f(); defView != 0` 这种容易读错的判断，显式布尔更省事。
func findDescendant(root uintptr, class string, depth int) (uintptr, bool) {
	if root == 0 || depth > 6 {
		return 0, false
	}
	var child uintptr
	for {
		child = findWindowEx(root, child, "", "")
		if child == 0 {
			break
		}
		if className(child) == class {
			return child, true
		}
	}
	child = 0
	for {
		child = findWindowEx(root, child, "", "")
		if child == 0 {
			break
		}
		if found, ok := findDescendant(child, class, depth+1); ok {
			return found, true
		}
	}
	return 0, false
}

// lastTopLevelWindow 返回枚举到的最后一个指定类名的顶层窗口。
func lastTopLevelWindow(class string) uintptr {
	var last uintptr
	cb := syscall.NewCallback(func(hwnd, _ uintptr) uintptr {
		if className(hwnd) == class {
			last = hwnd
		}
		return 1 // 继续枚举
	})
	procEnumWindows.Call(cb, 0)
	return last
}

// lastChildWindow 返回 parent 的**直接**子窗口里最后一个指定类名的窗口。
//
// 用 FindWindowEx 逐个往后走而不是 EnumChildWindows：后者会把整棵子树都吐出来
// （孙窗口也算），而这里要的恰恰只是「Progman 的几个直接孩子里，谁在最后」。
func lastChildWindow(parent uintptr, class string) uintptr {
	var (
		last  uintptr
		child uintptr
	)
	for {
		child = findWindowEx(parent, child, class, "")
		if child == 0 {
			break
		}
		last = child
	}
	return last
}

func className(hwnd uintptr) string {
	buf := make([]uint16, 256)
	n, _, _ := procGetClassNameW.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	if n == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf[:n])
}

func getParent(hwnd uintptr) uintptr {
	r, _, _ := procGetParent.Call(hwnd)
	return r
}

func isWindow(hwnd uintptr) bool {
	r, _, _ := procIsWindow.Call(hwnd)
	return r != 0
}

func getWindowLong(hwnd uintptr, index int) int32 {
	r, _, _ := procGetWindowLongW.Call(hwnd, uintptr(index))
	return int32(uint32(r))
}

func setWindowLong(hwnd uintptr, index int, value uint32) {
	procSetWindowLongW.Call(hwnd, uintptr(index), uintptr(value))
}

func getSystemMetrics(index int) int32 {
	r, _, _ := procGetSystemMetrics.Call(uintptr(index))
	return int32(uint32(r))
}

// sendMessageTimeout 发一条超时就放弃的消息。
//
// 用 SendMessageTimeout 而不是 SendMessage：对方是资源管理器，
// 万一它正忙，SendMessage 会把我们自己也拖住。
func sendMessageTimeout(hwnd uintptr, msg uint32, wparam, lparam uintptr) {
	var result uintptr
	procSendMessageTimeoutW.Call(hwnd, uintptr(msg), wparam, lparam,
		smtoAbortIfHung, wmSpawnTimeout, uintptr(unsafe.Pointer(&result)))
}
