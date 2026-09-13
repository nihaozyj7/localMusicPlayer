//go:build production

package ffmpeg

import (
	"bytes"
	"compress/gzip"
	_ "embed"
	"encoding/binary"
	"fmt"
	"io"
	"sync"
)

// bundledFFmpegGz 是编译进程序的 ffmpeg 二进制，**gzip 压缩后**的形态。
//
// 文件位置：internal/ffmpeg/bin/ffmpeg.exe.gz
// 由 tools/build-ffmpeg.mjs 在编译完 ffmpeg.exe 之后顺手生成，
// 因此该文件同样没有入库，需要先执行：
//
//	node tools/build-ffmpeg.mjs      # 或 wails3 task ffmpeg:build
//
// 为什么嵌压缩包而不是原始 exe：原始 5.99MB 会 1:1 进入产物；gzip 之后
// 只有 2.21MB（37%），产物直接少约 3.8MB。解压成本只在「缓存目录里还没有
// 这一份」时付一次，热启动连解压都不需要（见 bundledIdentity）。
//
// 只有带 production 构建标签（wails3 build 默认会加）的构建才会编译它，
// 日常开发与测试不会受影响。
//
//go:embed bin/ffmpeg.exe.gz
var bundledFFmpegGz []byte

// 解压结果缓存：一次进程内最多解压一次
var (
	decompressOnce sync.Once
	decompressed   []byte
	decompressErr  error
)

// bundledIdentity 返回「不解压就能拿到」的两件事：
//   - key：压缩数据本身，用来算缓存文件名（内容变了名字就变，天然去重）；
//   - rawSize：解压后的字节数，取自 gzip 尾部 4 字节的 ISIZE 字段。
//
// 有了它，热启动只需要 hash 2.21MB 再 stat 一次，完全不用解压 5.99MB。
// 唯一的前提是「单成员 gzip」—— 压缩包是构建脚本自己生成的，天然满足；
// 多成员 gzip 的 ISIZE 只表示最后一个成员的长度，这里不适用。
func bundledIdentity() ([]byte, int64, bool) {
	if len(bundledFFmpegGz) == 0 {
		return nil, 0, false
	}
	var rawSize int64
	if n := len(bundledFFmpegGz); n >= 4 {
		rawSize = int64(binary.LittleEndian.Uint32(bundledFFmpegGz[n-4:]))
	}
	return bundledFFmpegGz, rawSize, true
}

// embeddedFFmpeg 解压内置二进制。只有缓存缺失时才会被调用。
func embeddedFFmpeg() ([]byte, error) {
	decompressOnce.Do(func() {
		zr, err := gzip.NewReader(bytes.NewReader(bundledFFmpegGz))
		if err != nil {
			decompressErr = fmt.Errorf("内置 ffmpeg 压缩数据损坏: %w", err)
			return
		}
		defer zr.Close()
		raw, err := io.ReadAll(zr)
		if err != nil {
			decompressErr = fmt.Errorf("解压内置 ffmpeg 失败: %w", err)
			return
		}
		decompressed = raw
	})
	return decompressed, decompressErr
}
