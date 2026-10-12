//go:build windows

package library

import "strings"

// foldPath 把路径折叠成**比较用**的形态：Windows 的路径比较不区分大小写，
// 而链接目标（尤其是 junction 的目标）回来的大小写常与扫描根原文不同
// （`C:\Users\…` vs `c:\users\…`），直接比字符串会把「同一个目录」判成两个。
//
// 只用于比较，绝不能拿折叠后的路径去访问文件系统 —— 真实路径另有原文。
func foldPath(p string) string {
	return strings.ToLower(p)
}
