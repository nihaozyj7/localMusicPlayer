//go:build !windows

package library

// foldPath 在非 Windows 平台上原样返回：这些平台的文件系统一般区分大小写，
// 折叠会把两个不同目录判成同一个（那比不折叠更糟）。见 Windows 版的说明。
func foldPath(p string) string {
	return p
}
