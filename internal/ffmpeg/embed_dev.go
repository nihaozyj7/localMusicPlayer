//go:build !production

package ffmpeg

// embeddedFFmpeg 在开发构建下不内置任何二进制，返回空表示「没有内置版本」，
// 解析流程会退回系统安装的 ffmpeg。
//
// 这样 `go test ./...` 与 `wails3 task run` 都不必携带 155MB 的二进制，
// 而正式打包（production 标签）才有内置版本，保证终端用户开箱即用。
func embeddedFFmpeg() ([]byte, error) {
	return nil, nil
}
