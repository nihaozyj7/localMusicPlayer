//go:build !windows

package skins

import "os"

/* ==========================================================================
   linkguard_other.go — 判断一个路径本身是不是「链接」（非 Windows 分支）

   Windows 用重解析点属性判断（见 linkguard_windows.go，那里解释了为什么
   `ModeSymlink` 在联接上不可靠）；其它平台（CI 跑在 Linux 上）符号链接就是
   普通的符号链接，`Lstat` 的 `ModeSymlink` 位足够。
   ========================================================================== */

// pathIsLink 报告 path 自身是不是符号链接。
func pathIsLink(path string) bool {
	fi, err := os.Lstat(path)
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeSymlink != 0
}
