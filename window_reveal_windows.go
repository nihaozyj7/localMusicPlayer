//go:build windows

package main

import (
	"runtime"
	"syscall"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/w32"
)

// kernel32 只在抢前台时用到（GetCurrentThreadId）
var modKernel32 = syscall.NewLazyDLL("kernel32.dll")

/* ==========================================================================
   启动露面（Windows）：先把窗口「显示出来但用 DWM 遮住」，等第一帧画好再摘遮罩
   --------------------------------------------------------------------------
   问题：窗口是隐藏创建的（main.go 的 winOpts.Hidden，为的是躲开 Wails issue
   #4611 那个「WebView2 出首帧前先亮一块白底」）。但 WebView2 在
   controller.IsVisible == false 时**不再出帧** —— 前端 main.js 里那句
   「隐藏时 rAF 永远不派发」说的就是这件事。

   于是现在的时间线是：
     · 页面在隐藏状态下加载、JS 跑完、DOM 装配好；
     · MarkReady → Show() → SW_SHOW + controller.Show()；
     · 从 controller.Show() 到合成器真的吐出一帧之间，窗口里什么都没有，
       露出来的是窗口自己的底色 —— 肉眼看到的就是「黑一下」。

   做法：把顺序倒过来。应用一开始跑（ApplicationStarted）就
     1. 用 DwmSetWindowAttribute(DWMWA_CLOAK) 把窗口遮住；
     2. 再 Show() 把它变成 WS_VISIBLE。
   WS_VISIBLE 让 WebView2 正常运行合成、rAF 正常派发；DWM 的 cloak 只作用在
   显示层，不改窗口样式、不改位置、也不影响 Chromium 的遮挡判定，所以用户
   什么都看不见。前端画好第一帧后 MarkReady → 摘掉 cloak，窗口「啪」地出现
   时屏幕上已经是一张画完的帧，中间那个空档就不存在了。

   兜底：cloak 设置后会用 DWMWA_CLOAKED 读回来确认；不生效（老系统 / 远程
   桌面等）就整个退回旧行为 —— 继续隐藏创建、MarkReady 再 Show。
   ========================================================================== */

// DWM 圆角偏好（DWMWA_WINDOW_CORNER_PREFERENCE，Windows 11 才有）。
//
// w32 的常量表目前只到 DWMWA_FREEZE_REPRESENTATION(16)，所以这里自带；
// 值本身是微软文档里的 DWMWCP_*：
const (
	dwmwaWindowCornerPreference = 33

	dwmcpDefault    = 0 // 跟随系统（Win11 上就是标准圆角）
	dwmcpDoNotRound = 1 // 直角
	dwmcpRound      = 2 // 标准圆角
	dwmcpRoundSmall = 3 // 小圆角
)

// applyWindowDecorations 把主窗口的「外框装饰」按当前设置重设一次：
// 先补上 DWM 的外框延伸（Aero 阴影 + Win11 圆角就是它给的），再写圆角偏好。
//
// 为什么必须自己补这一下：Wails 只在 WM_NCACTIVATE / WM_ACTIVATE 里调
// DwmExtendFrameIntoClientArea —— 那一步才是「有系统外框、但不画标题栏」的
// 来源（见 w32.ExtendFrameIntoClientArea 的注释）。而首屏改成「先遮罩显示、
// 等第一帧画好再摘遮罩」之后，窗口的激活可能发生在被遮住的那一刻，而摘遮罩
// 本身不产生任何激活消息：那一步就有可能一直不执行，表现就是窗口没有阴影、
// 也没有圆角。这里每次露面都显式重设一次，幂等且与 Wails 的取值一致
// （margins 全 1；本窗口没有开 WebView2CompositionHosting）。
//
// 传 nil 句柄或系统不认这个属性（Windows 10 及更早、远程桌面等）都只是静默
// 不生效，不影响窗口显示。
func applyWindowDecorations(hwnd unsafe.Pointer, corners string) {
	if hwnd == nil {
		return
	}
	h := w32.HWND(uintptr(hwnd))

	// 1. 外框延伸：这一步给出系统外框（阴影 + 圆角）。
	_ = w32.ExtendFrameIntoClientArea(uintptr(hwnd), true)

	// 2. 圆角偏好：DWM 只有「默认 / 标准 / 小 / 直角」四档，没有连续半径。
	pref := int32(dwmcpDefault)
	switch corners {
	case "square":
		pref = dwmcpDoNotRound
	case "round":
		pref = dwmcpRound
	case "small":
		pref = dwmcpRoundSmall
	}
	_ = w32.DwmSetWindowAttribute(
		h,
		w32.DWMWINDOWATTRIBUTE(dwmwaWindowCornerPreference),
		unsafe.Pointer(&pref),
		unsafe.Sizeof(pref),
	)
}

// —— 任务栏按钮的显隐（只用在「已经显示、但还遮着」的那几百毫秒里）——
//
// 为什么需要它：窗口一 Show()（哪怕处在 DWM 遮罩状态），任务栏上立刻就有图标了，
// 而 WebView2 还要几百毫秒才把页面画出来 —— 图标孤零零挂在那里，用户看到的就是
// 「任务栏图标都出来半天了，窗口才冒出来」。
//
// 做法：用 ITaskbarList 的 DeleteTab / AddTab —— 这是微软给「运行期增删任务栏
// 按钮」的正规接口，不改窗口样式、不需要隐藏再显示窗口。
//
// ★ 试过但**不能用**的办法：改 WS_EX_TOOLWINDOW / WS_EX_APPWINDOW。
//
//	摘掉那一下有效，但换回 APPWINDOW 时资源管理器不会把按钮加回来
//	（实测窗口一直到最后都没有任务栏按钮）—— 那是个更严重的回归。
//
// 为什么不干脆让窗口晚点显示（那样按钮自然也晚出现）：WebView2 的合成器要等
// 窗口可见才出帧，显示得越晚，首帧越晚（实测能差 300ms 以上）。
const (
	taskbarTabAdd    = 4 // ITaskbarList vtable: HrInit(3) AddTab(4) DeleteTab(5)
	taskbarTabDelete = 5
)

// 抢前台用的 Win32 常量（gwlExStyle / swpNoActivate 等已在
// desktop_wallpaper_windows.go 里定义，同一个包直接复用）
const (
	hwndTopmost    = ^uintptr(0) // (HWND)-1
	hwndNotTopmost = ^uintptr(1) // (HWND)-2
	swpNoSize      = 0x0001
	swpNoMove      = 0x0002
)

var (
	procSetForegroundWindow      = modUser32.NewProc("SetForegroundWindow")
	procGetForegroundWindow      = modUser32.NewProc("GetForegroundWindow")
	procBringWindowToTop         = modUser32.NewProc("BringWindowToTop")
	procGetWindowThreadProcessID = modUser32.NewProc("GetWindowThreadProcessId")
	procAttachThreadInput        = modUser32.NewProc("AttachThreadInput")
	procSetFocus                 = modUser32.NewProc("SetFocus")
	procGetCurrentThreadId       = modKernel32.NewProc("GetCurrentThreadId")
	procGetCurrentProcessId      = modKernel32.NewProc("GetCurrentProcessId")
)

// iunknownVtbl / taskbarVtbl 与 w32 内部的 taskbarList3Vtbl 前几项逐字段对齐：
// w32 只导出了 SetOverlayIcon 与 Release，而我们要的是 AddTab / DeleteTab，
// 所以这里按 COM 约定自己取 vtable（CLSID/IID 仍复用 w32 的常量）。
type iunknownVtbl struct {
	queryInterface uintptr
	addRef         uintptr
	release        uintptr
}

type taskbarVtbl struct {
	iunknownVtbl
	hrInit    uintptr
	addTab    uintptr
	deleteTab uintptr
}

type taskbarList struct {
	vtbl *taskbarVtbl
}

// setTaskbarPresence 控制窗口在任务栏上出现（true）/ 消失（false）。
//
// 失败只是返回 false，调用方不该因此改变别的行为：最坏情况就是回到原来的样子
// （图标早出来几百毫秒），而不是窗口出不出现这种致命问题。
func setTaskbarPresence(hwnd unsafe.Pointer, present bool) bool {
	if hwnd == nil {
		return false
	}
	// ITaskbarList 是 STA 里的进程内对象：创建与调用必须落在同一个线程上，
	// 而 goroutine 随时可能换线程 —— 把当前线程钉住，配合 w32 那里的
	// CoInitializeEx / CoUninitialize（NewTaskbarList3 / Release）成对使用。
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	list, err := w32.NewTaskbarList3()
	if err != nil {
		return false
	}
	defer list.Release()

	obj := (*taskbarList)(unsafe.Pointer(list))
	slot := uintptr(taskbarTabDelete)
	if present {
		slot = uintptr(taskbarTabAdd)
	}
	// vtable 里第 4 / 5 项就是 AddTab / DeleteTab（前 3 项是 IUnknown 的）
	call := *(*uintptr)(unsafe.Pointer(uintptr(unsafe.Pointer(obj.vtbl)) + slot*unsafe.Sizeof(uintptr(0))))
	ret, _, _ := syscall.SyscallN(call, uintptr(unsafe.Pointer(list)), uintptr(hwnd))
	return ret == 0
}

// —— 把窗口提到最前并抢到焦点（托盘唤起 / 第二次启动）——
//
// 为什么不能只靠 w.Focus()：它内部就是一句 SetForegroundWindow。而
//
//	· 从托盘「显示」出来的窗口走的是 Show() = SW_SHOW，只让它可见，**不动 z 序**；
//	· SetForegroundWindow 对「当前不是前台进程」的调用会被系统拒绝（顶多闪一下任务栏）。
//
// 表现出来就是用户说的「窗口出来了，但层级不对」（被别的窗口压着 / 没激活）。
//
// 所以这里按 Windows 的惯例做全套：
//  1. HWND_TOPMOST → HWND_NOTOPMOST 刷一次 z 序 —— 只挪位置，
//     不会给窗口留下「置顶」属性；
//  2. 把自己的输入队列临时挂到当前前台线程上，再 BringWindowToTop +
//     SetForegroundWindow + SetFocus：不挂的话第 1 步之后那句仍可能被拒。
//
// 刻意**不**在这里调 ShowWindow(SW_RESTORE)：那会把已经最大化的窗口还原成普通大小
// （托盘唤起时窗口常常是最大化的）。最小化的情况由调用方先 UnMinimise。
func raiseNativeWindow(hwnd unsafe.Pointer) {
	if hwnd == nil {
		return
	}
	h := uintptr(hwnd)

	// 1. 刷一次 z 序（TOPMOST 只用于「挤到最前」，随后立刻取消）。
	//    刻意**不**调 ShowWindow(SW_RESTORE)：那会把最大化的窗口还原成普通大小。
	//    最小化的情况由调用方（ShowMain 的 UnMinimise）先处理掉。
	const flags = swpNoSize | swpNoMove | swpNoActivate
	procSetWindowPos.Call(h, hwndTopmost, 0, 0, 0, 0, flags)
	procSetWindowPos.Call(h, hwndNotTopmost, 0, 0, 0, 0, flags)

	// 2. 抢前台：先把自己和「当前前台线程」的输入队列接上
	self, _, _ := procGetCurrentThreadId.Call()
	foreground, _, _ := procGetForegroundWindow.Call()
	fgThread, _, _ := procGetWindowThreadProcessID.Call(foreground, 0)
	attached := false
	if fgThread != 0 && fgThread != self {
		if ret, _, _ := procAttachThreadInput.Call(fgThread, self, 1); ret != 0 {
			attached = true
		}
	}
	procBringWindowToTop.Call(h)
	procSetForegroundWindow.Call(h)
	procSetFocus.Call(h)
	if attached {
		procAttachThreadInput.Call(fgThread, self, 0)
	}
}

// isSelfForeground 报告「当前前台窗口是不是本进程的窗口」。
//
// 用在托盘唤起的第二次确认上：如果前台已经是我们了就不必再抢，
// 免得把用户在这几百毫秒里刚点的窗口顶掉。
func isSelfForeground() bool {
	fg, _, _ := procGetForegroundWindow.Call()
	if fg == 0 {
		return false
	}
	var pid uint32
	procGetWindowThreadProcessID.Call(fg, uintptr(unsafe.Pointer(&pid)))
	self, _, _ := procGetCurrentProcessId.Call()
	return uintptr(pid) == self
}

// cloakNativeWindow 设置 / 清除窗口的 DWM 隐身标记，并返回「是否确认已生效」。
//
// 参数用 unsafe.Pointer 而不是 w32.HWND，是为了和 WebviewWindow.NativeWindow()
// 的返回值直接对齐（Windows 实现里它就是 hwnd）。
func cloakNativeWindow(hwnd unsafe.Pointer, cloaked bool) bool {
	if hwnd == nil {
		return false
	}
	h := w32.HWND(uintptr(hwnd))

	want := int32(0)
	if cloaked {
		want = 1
	}
	if hr := w32.DwmSetWindowAttribute(h, w32.DWMWA_CLOAK, unsafe.Pointer(&want), unsafe.Sizeof(want)); w32.FAILED(hr) {
		return false
	}

	// 读回来确认：DWMWA_CLOAKED 是非 0 的位标记（APP / SHELL / INHERITED）。
	// 只认「设置成功」不看实际状态的话，在 DWM 不认这个属性的系统上会直接
	// 把一块没画好的窗口亮给用户看 —— 那比原来还糟。
	got := uint32(0)
	if hr := w32.DwmGetWindowAttribute(h, w32.DWMWA_CLOAKED, unsafe.Pointer(&got), unsafe.Sizeof(got)); w32.FAILED(hr) {
		// 读不回来不算失败：某些 Windows 版本能设不能读。清除遮罩这条路上
		// 更不该因为读不到就把窗口留在遮住的状态（会变成「窗口永远不出现」）。
		return !cloaked
	}
	return (got != 0) == cloaked
}
