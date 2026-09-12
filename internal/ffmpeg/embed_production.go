//go:build production

package ffmpeg

import _ "embed"

// embeddedFFmpeg 返回编译进程序的 ffmpeg 二进制。
//
// 文件位置：internal/ffmpeg/bin/ffmpeg.exe
// 该文件体积较大（约 155MB），因此没有入库，需要先执行：
//
//	wails3 task ffmpeg:fetch
//
// 只有带 `production` 标签（wails3 build 默认会加）的构建才会编译它，
// 日常开发与测试不会受影响。
//
//go:embed bin/ffmpeg.exe
var bundledFFmpeg []byte

func embeddedFFmpeg() ([]byte, error) {
	return bundledFFmpeg, nil
}
