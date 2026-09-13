package coverfetch

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"strings"

	// 解码器：封面实际见到的格式都在这里（网易云会把 PNG 标成 image/jpg，
	// 所以不能只看 Content-Type，必须真的解一遍）
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
)

// ErrBlankImage 表示这张图能解码，但内容是「空白图」（纯白/纯色占位）。
//
// 为什么必须单独一个错误：这是实际踩到的线上问题 —— 某些图床/CDN 在参数不对、
// 或者专辑本身没有封面时，返回的不是 404，而是一张**纯白**的占位图。
// 只看状态码和 Content-Type 完全发现不了，用户看到的就是「封面永远是白的」。
// 调用方应当把它当成「这个来源没命中」，继续试下一个候选，而不是展示白图。
var ErrBlankImage = errors.New("封面是空白占位图")

// ErrImageTooSmall 表示图片能解码但尺寸过小（基本是占位图/图标）。
var ErrImageTooSmall = errors.New("封面尺寸过小")

// 空白图判定阈值。
const (
	// minImageSide 最小可接受的边长。专辑封面不至于比这更小。
	minImageSide = 64

	// blankMeanLuma 平均亮度高于这个值，且对比度极低 → 判定为纯白占位图。
	blankMeanLuma = 246

	// uniformRange 采样点亮度的最大最小值之差小于它，说明整张图几乎是同一个颜色。
	uniformRange = 12
)

// ImageInfo 一次图片校验的结果（诊断用，也用于前端展示尺寸）。
type ImageInfo struct {
	Format string `json:"format"` // jpeg | png | gif（由魔数解出）
	Width  int    `json:"width"`
	Height int    `json:"height"`
	// MeanLuma 0~255 的平均亮度（按 4px 步长采样）。
	MeanLuma int `json:"meanLuma"`
	// Uniform 是否是「几乎单一颜色」的图。
	Uniform bool `json:"uniform"`
}

// Blank 判断这张图是否应当被当作空白占位图丢弃。
func (i ImageInfo) Blank() bool {
	return i.Uniform && i.MeanLuma >= blankMeanLuma
}

// Describe 给日志/界面用的一行描述。
func (i ImageInfo) Describe() string {
	return fmt.Sprintf("%s %dx%d 亮度=%d", i.Format, i.Width, i.Height, i.MeanLuma)
}

// InspectImage 解码并体检一张图片。
//
// 返回的错误有两种含义：
//   - 解码失败 / 尺寸过小 / 空白图 → 该候选不可用（调用方继续试下一个）；
//   - 其它 → 真的出了问题。
//
// 之所以「解码」而不是只嗅探魔数：网易云的图片 CDN 会把 PNG 内容标成
// image/jpg，只信头部信息会直接把可用的图判成不可用（或反过来）。
func InspectImage(body []byte) (ImageInfo, error) {
	info := ImageInfo{}
	if len(body) < 64 {
		return info, ErrImageTooSmall
	}

	img, format, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return info, fmt.Errorf("不是可解码的图片: %w", err)
	}
	b := img.Bounds()
	info.Format = format
	info.Width = b.Dx()
	info.Height = b.Dy()
	if info.Width < minImageSide || info.Height < minImageSide {
		return info, ErrImageTooSmall
	}

	// 采样统计亮度：4px 步长在 500×500 上是 ~1.5 万个点，足够判断且几乎不耗时
	var sum, n, minV, maxV uint32
	minV = 255
	for y := b.Min.Y; y < b.Max.Y; y += 4 {
		for x := b.Min.X; x < b.Max.X; x += 4 {
			r, g, bl, _ := img.At(x, y).RGBA()
			// RGBA() 返回的是 16 位预乘值，>>8 回到 8 位；亮度用 BT.601 权重
			lum := uint32((299*(r>>8) + 587*(g>>8) + 114*(bl>>8)) / 1000)
			sum += lum
			if lum < minV {
				minV = lum
			}
			if lum > maxV {
				maxV = lum
			}
			n++
		}
	}
	if n == 0 {
		return info, ErrImageTooSmall
	}
	info.MeanLuma = int(sum / n)
	info.Uniform = maxV-minV <= uniformRange

	// 只丢「几乎纯白」的整块图 —— 这正是「封面永远是白的」的那个占位图。
	//
	// 刻意不丢其它纯色图：纯黑、纯蓝的极简封面是真实存在的专辑封面
	// （例如白专辑/黑专辑那种设计），误杀比漏放更糟。白图不一样：
	// 它极大概率是 CDN 的占位图，而且用户一眼就能看出是错的。
	if info.Blank() {
		return info, ErrBlankImage
	}
	return info, nil
}

// NormalizeMIME 把图片类型收敛成浏览器认识的标准值。
//
// 现实里 image/jpg（少个 e）、image/pjpeg、text/plain 都很常见。
// 虽然 Chromium 解码时会自己嗅探字节，但同一个 MIME 会被写进缓存索引、
// data URL 和代理响应头，保持规范值可以避免下游出现各种意外。
func NormalizeMIME(mime string, body []byte) string {
	declared := strings.TrimSpace(mime)
	// 魔数最可信：网易云会把 PNG 内容标成 image/jpg，只信声明会误导下游
	if sniffed := sniffImageType(body); sniffed != "" {
		return sniffed
	}
	switch strings.ToLower(declared) {
	case "image/jpg", "image/pjpeg", "image/jpe":
		return "image/jpeg"
	case "image/x-png":
		return "image/png"
	}
	return declared
}
