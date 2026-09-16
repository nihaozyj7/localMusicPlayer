//go:build windows

package main

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"syscall"
	"unsafe"
)

/* ==========================================================================
   窗口抓帧（Windows，GDI + PrintWindow）
   --------------------------------------------------------------------------
   为什么是 PrintWindow 而不是从屏幕 DC 上 BitBlt：
     · 退出时窗口可能被别的窗口挡住、只露出一部分、甚至在另一块屏上 ——
       从屏幕抓会抓到别人的窗口或者黑边；
     · PrintWindow 是「让窗口把自己画进一个内存 DC」，与遮挡无关。

   PW_RENDERFULLCONTENT(2) 是关键：DWM 合成的窗口（WebView2 就是）不加这个
   标志拿到的是一张空白图。加上之后由 DWM 负责渲染，不依赖窗口自己响应
   WM_PRINT —— 这也意味着在退出流程里同步调用它是安全的。

   本文件的 GDI 调用刻意不经过 w32 包：w32 里没有 CreateCompatibleBitmap /
   GetDIBits / PrintWindow，混着用反而要在 uintptr 与它的别名之间来回转。
   ========================================================================== */

var (
	bootUser32 = syscall.NewLazyDLL("user32.dll")
	bootGdi32  = syscall.NewLazyDLL("gdi32.dll")

	procPrintWindow            = bootUser32.NewProc("PrintWindow")
	procGetWindowRect          = bootUser32.NewProc("GetWindowRect")
	procGetDC                  = bootUser32.NewProc("GetDC")
	procReleaseDC              = bootUser32.NewProc("ReleaseDC")
	procCreateCompatibleDC     = bootGdi32.NewProc("CreateCompatibleDC")
	procCreateCompatibleBitmap = bootGdi32.NewProc("CreateCompatibleBitmap")
	procSelectObject           = bootGdi32.NewProc("SelectObject")
	procDeleteObject           = bootGdi32.NewProc("DeleteObject")
	procDeleteDC               = bootGdi32.NewProc("DeleteDC")
	procGetDIBits              = bootGdi32.NewProc("GetDIBits")
)

// PW_RENDERFULLCONTENT：让 DWM 把窗口（含 WebView2 合成内容）完整画出来
const pwRenderFullContent = 2

// BI_RGB：不压缩的 32 位 DIB
const biRGB = 0

type bootRect struct {
	left, top, right, bottom int32
}

type bootBitmapInfoHeader struct {
	size          uint32
	width         int32
	height        int32
	planes        uint16
	bitCount      uint16
	compression   uint32
	sizeImage     uint32
	xPelsPerMeter int32
	yPelsPerMeter int32
	clrUsed       uint32
	clrImportant  uint32
}

type bootBitmapInfo struct {
	header bootBitmapInfoHeader
	colors [1]uint32
}

// captureWindowFrame 把 hwnd 当前画面抓成 JPEG（宽度超过 maxWidth 时按整数倍
// 盒式缩小）。只在窗口真的可见时调用 —— 隐藏窗口抓出来是黑的。
func captureWindowFrame(hwnd unsafe.Pointer, maxWidth, quality int) ([]byte, error) {
	h := uintptr(hwnd)

	var r bootRect
	if ret, _, _ := procGetWindowRect.Call(h, uintptr(unsafe.Pointer(&r))); ret == 0 {
		return nil, fmt.Errorf("GetWindowRect 失败")
	}
	width := int(r.right - r.left)
	height := int(r.bottom - r.top)
	// 尺寸异常（最小化、刚创建、句柄已经失效）直接放弃，别去申请一块荒唐的内存
	if width <= 0 || height <= 0 || width > 20000 || height > 20000 {
		return nil, fmt.Errorf("窗口尺寸异常: %dx%d", width, height)
	}

	screenDC, _, _ := procGetDC.Call(0)
	if screenDC == 0 {
		return nil, fmt.Errorf("GetDC 失败")
	}
	defer procReleaseDC.Call(0, screenDC)

	memDC, _, _ := procCreateCompatibleDC.Call(screenDC)
	if memDC == 0 {
		return nil, fmt.Errorf("CreateCompatibleDC 失败")
	}
	defer procDeleteDC.Call(memDC)

	bitmap, _, _ := procCreateCompatibleBitmap.Call(screenDC, uintptr(width), uintptr(height))
	if bitmap == 0 {
		return nil, fmt.Errorf("CreateCompatibleBitmap 失败")
	}
	defer procDeleteObject.Call(bitmap)

	old, _, _ := procSelectObject.Call(memDC, bitmap)
	if old == 0 {
		return nil, fmt.Errorf("SelectObject 失败")
	}
	defer procSelectObject.Call(memDC, old)

	if ret, _, _ := procPrintWindow.Call(h, memDC, pwRenderFullContent); ret == 0 {
		return nil, fmt.Errorf("PrintWindow 失败")
	}

	// 取像素：32 位、自上而下（biHeight 为负）
	info := bootBitmapInfo{}
	info.header.size = uint32(unsafe.Sizeof(info.header))
	info.header.width = int32(width)
	info.header.height = int32(-height)
	info.header.planes = 1
	info.header.bitCount = 32
	info.header.compression = biRGB

	pixels := make([]byte, width*height*4)
	if ret, _, _ := procGetDIBits.Call(
		memDC,
		bitmap,
		0,
		uintptr(height),
		uintptr(unsafe.Pointer(&pixels[0])),
		uintptr(unsafe.Pointer(&info)),
		0,
	); ret == 0 {
		return nil, fmt.Errorf("GetDIBits 失败")
	}

	// DIB 是 BGRA（且 32 位 BI_RGB 的 alpha 位不可信），转成 RGBA 并补上不透明
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		src := pixels[y*width*4 : (y+1)*width*4]
		dst := img.Pix[y*img.Stride : y*img.Stride+width*4]
		for x := 0; x < width; x++ {
			dst[x*4+0] = src[x*4+2]
			dst[x*4+1] = src[x*4+1]
			dst[x*4+2] = src[x*4+0]
			dst[x*4+3] = 0xff
		}
	}

	if maxWidth > 0 && width > maxWidth {
		factor := (width + maxWidth - 1) / maxWidth
		if factor > 1 {
			img = boxDownscale(img, factor)
		}
	}

	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: quality}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// boxDownscale 按整数倍做盒式降采样。
//
// 只是给缓存图用，所以不引入图像缩放依赖：factor 倍的均值就足够，而且
// UI 截图里大量是纯色块，盒式缩放在这类图上不会像最近邻那样出锯齿。
func boxDownscale(src *image.RGBA, factor int) *image.RGBA {
	if factor < 2 {
		return src
	}
	b := src.Bounds()
	width := b.Dx() / factor
	height := b.Dy() / factor
	if width <= 0 || height <= 0 {
		return src
	}
	out := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			var sumR, sumG, sumB, n uint32
			for dy := 0; dy < factor; dy++ {
				for dx := 0; dx < factor; dx++ {
					i := src.PixOffset(b.Min.X+x*factor+dx, b.Min.Y+y*factor+dy)
					sumR += uint32(src.Pix[i])
					sumG += uint32(src.Pix[i+1])
					sumB += uint32(src.Pix[i+2])
					n++
				}
			}
			o := out.PixOffset(x, y)
			out.Pix[o] = uint8(sumR / n)
			out.Pix[o+1] = uint8(sumG / n)
			out.Pix[o+2] = uint8(sumB / n)
			out.Pix[o+3] = 0xff
		}
	}
	return out
}
