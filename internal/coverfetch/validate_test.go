package coverfetch

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func encodePNG(t *testing.T, w, h int, c color.Color) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

func encodeJPEG(t *testing.T, w, h int, c color.Color) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	return buf.Bytes()
}

// 纯白占位图必须被识别出来 —— 这是「封面永远是白的」的正面防线。
func TestInspectImageRejectsWhitePlaceholder(t *testing.T) {
	body := encodePNG(t, 300, 300, color.RGBA{255, 255, 255, 255})
	info, err := InspectImage(body)
	if !errors.Is(err, ErrBlankImage) {
		t.Fatalf("纯白图应当报 ErrBlankImage，实际 err=%v info=%+v", err, info)
	}
	if !info.Blank() {
		t.Fatalf("Blank() 应当为 true: %+v", info)
	}
}

func TestInspectImageRejectsTinyImage(t *testing.T) {
	body := encodePNG(t, 16, 16, color.RGBA{10, 20, 30, 255})
	if _, err := InspectImage(body); !errors.Is(err, ErrImageTooSmall) {
		t.Fatalf("小图应当报 ErrImageTooSmall，实际 %v", err)
	}
}

// 正常的多色图片必须通过校验（不能把真实封面误杀）。
func TestInspectImageAcceptsRealCover(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 512, 512))
	for y := 0; y < 512; y++ {
		for x := 0; x < 512; x++ {
			img.Set(x, y, color.RGBA{uint8(x % 256), uint8(y % 256), uint8((x + y) % 256), 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	info, err := InspectImage(buf.Bytes())
	if err != nil {
		t.Fatalf("正常封面不该被拒: %v", err)
	}
	if info.Width != 512 || info.Height != 512 {
		t.Fatalf("尺寸解析错误: %+v", info)
	}
	if info.Uniform {
		t.Fatalf("彩色渐变图不该被判成纯色: %+v", info)
	}
}

// 纯黑极简封面是真实存在的设计，不能因为「纯色」就丢掉。
func TestInspectImageKeepsSolidBlackCover(t *testing.T) {
	body := encodeJPEG(t, 300, 300, color.RGBA{0, 0, 0, 255})
	info, err := InspectImage(body)
	if err != nil {
		t.Fatalf("纯黑封面不该被拒: %v", err)
	}
	if !info.Uniform {
		t.Logf("提示：JPEG 压缩后可能不再严格纯色，info=%+v", info)
	}
}

func TestInspectImageRejectsGarbage(t *testing.T) {
	body := []byte("<html><body>404 not found</body></html>")
	if _, err := InspectImage(body); err == nil {
		t.Fatal("HTML 内容不该被当成图片")
	}
}

// 网易云的图床会把 PNG 内容标成 image/jpg，必须按魔数纠正。
func TestNormalizeMIME(t *testing.T) {
	png := encodePNG(t, 100, 100, color.RGBA{1, 2, 3, 255})
	cases := []struct {
		in, want string
		body     []byte
	}{
		{"image/jpg", "image/png", png},  // 声明与内容不符 → 以内容为准
		{"image/jpeg", "image/png", png}, // 同上
		{"", "image/png", png},           // 没有声明 → 嗅探
		{"image/png", "image/png", png},  // 一致
		{"image/jpg", "image/jpeg", []byte{0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}},
	}
	for _, c := range cases {
		if got := NormalizeMIME(c.in, c.body); got != c.want {
			t.Errorf("NormalizeMIME(%q) = %q，期望 %q", c.in, got, c.want)
		}
	}
}
