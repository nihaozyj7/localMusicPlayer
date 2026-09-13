package metacache

import (
	"bytes"
	"encoding/binary"
	"testing"

	"github.com/dhowden/tag"
)

// TestCovrLayout 用真实的解析库反推 covr→data box 的字节布局。
// 结论见 embed.go 里的注释：类型字节放在 box 内偏移 3。
func TestCovrLayout(t *testing.T) {
	cover := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0xFF, 0xD9}
	mvhd := make([]byte, 100)
	binary.BigEndian.PutUint32(mvhd[12:16], 44100)
	binary.BigEndian.PutUint32(mvhd[16:20], 44100)

	for _, tc := range []struct {
		name string
		hdr  []byte
	}{
		{"typeAt3", []byte{0, 0, 0, 13, 0, 0, 0, 0}},
		{"typeAt1", []byte{0, 13, 0, 0, 0, 0, 0, 0}},
	} {
		dataBox := append(boxHeader("data", len(cover)+16), tc.hdr...)
		dataBox = append(dataBox, cover...)
		inner := append(append([]byte{}, box("mvhd", mvhd)...), box("udta", boxFull("meta", box("ilst", box("covr", dataBox))))...)
		raw := append(buildTestM4A(), box("moov", inner)...)

		m, err := tag.ReadFrom(bytes.NewReader(raw))
		if err != nil {
			t.Logf("%s: 解析失败 %v", tc.name, err)
			continue
		}
		pic := m.Picture()
		t.Logf("%s: 解析通过 picture=%v", tc.name, pic != nil)
	}
}
