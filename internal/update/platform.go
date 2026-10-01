package update

import "runtime"

// 这一层间接引用 runtime 包，是为了让「平台判断」集中在一处：
// release.go 里挑选资产、checker.go 里生成错误提示都要用到平台名，
// 两处若各自写一遍 switch，迟早会出现「挑的是 windows 资产、
// 提示里写的却是 macOS」这种不一致。

func runtimeGOOS() string { return runtime.GOOS }

func runtimeArchName() string {
	switch runtime.GOARCH {
	case "amd64":
		return "x64"
	case "arm64":
		return "arm64"
	case "386":
		return "x86"
	default:
		return runtime.GOARCH
	}
}
