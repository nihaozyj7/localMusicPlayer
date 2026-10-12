module localmusicplayer

go 1.25.0

// ★ 构建用的工具链固定到具体补丁版本，而不是只写最低版本 `go 1.25.0`。
//
// 为什么：标准库漏洞只随**实际构建用的** Go 版本修复，而 `go` 指令是
// 「最低版本」语义 —— 它既不保证补丁版本，也不会让 go 命令去升级。
// 实测 go1.27.0 下 govulncheck 报 10 项标准库漏洞（net/http 的 http2 Trailer
// 内存耗尽、crypto/tls、net/textproto 等，见 GO-2026-6603/6605/6607/6608/
// 6609/6610/6611/6612/6613/6617），全部在 go1.27.2 修复，而它们全都在
// 试听 / 更新检查 / 歌词抓取这些真的会发 HTTP 请求的路径上。
//
// 写 toolchain 之后，GOTOOLCHAIN=auto 的机器（含 CI）会自动取用 1.27.2；
// 两端因此被钉在同一个补丁版本上，不会再出现「本地 1.27.0、CI 最新 1.25.x」
// 各修各的局面。CI 另有 govulncheck 步骤把这件事变成红灯而不是靠人记得。
toolchain go1.27.2

require (
	github.com/dhowden/tag v0.0.0-20240417053706-3d75831295e8
	github.com/fsnotify/fsnotify v1.9.0
	github.com/gen2brain/malgo v0.11.26
	github.com/wailsapp/wails/v3 v3.0.0-beta.14
	golang.design/x/hotkey v0.6.1
)

require (
	github.com/adrg/xdg v0.5.3 // indirect
	github.com/coder/websocket v1.8.14 // indirect
	github.com/go-ole/go-ole v1.3.0 // indirect
	github.com/godbus/dbus/v5 v5.2.2 // indirect
	github.com/jchv/go-winloader v0.0.0-20250406163304-c1995be93bd1 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	golang.org/x/sys v0.46.0 // indirect
)
