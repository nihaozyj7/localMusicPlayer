//go:build !production

package ffmpeg

// bundledIdentity / embeddedFFmpeg 在开发构建下都表示「没有内置版本」：
// 解析流程会退回系统安装的 ffmpeg。
//
// 这样 go test ./... 与 wails3 task run 都不必携带 6MB 的二进制，
// 而正式打包（production 标签）才有内置版本，保证终端用户开箱即用。
func bundledIdentity() ([]byte, int64, bool) {
	return nil, 0, false
}

func embeddedFFmpeg() ([]byte, error) {
	return nil, nil
}
