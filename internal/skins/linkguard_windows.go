//go:build windows

package skins

import "syscall"

/* ==========================================================================
   linkguard_windows.go — 判断一个路径本身是不是「链接」

   为什么要单独一个平台文件（第六轮审查 §2.7）：
     · Windows 上有两类链接要挡：符号链接（symlink）与**目录联接**（junction，
       `mklink /J`，不需要任何权限）；
     · Go 的 `os.Lstat` 对目录联接**不报 `ModeSymlink`**（联接在 Win32 语义里
       是透明的，实测 `Lstat(<junction>).Mode()` 就是普通目录），所以只看
       `Mode()` 会漏掉它；
     · 统一用文件属性里的 `FILE_ATTRIBUTE_REPARSE_POINT`：符号链接、目录联接、
       以及将来别的重解析点都会置这一位。
   ========================================================================== */

// pathIsLink 报告 path 自身是不是重解析点（符号链接 / 目录联接）。
//
// 取不到属性时返回 false：文件不存在、无权访问都走这条分支，那两种情况交给
// 调用方后面的 os.Stat 去决定成败。若把「读不到」当成「是链接」，正常的权限
// 错误会被误报成「越界」，反而更难排查。
func pathIsLink(path string) bool {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return false
	}
	attrs, err := syscall.GetFileAttributes(p)
	if err != nil {
		return false
	}
	return attrs&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0
}
