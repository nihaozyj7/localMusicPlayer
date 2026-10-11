package metacache

import (
	"os"
	"strings"
	"testing"
)

/* ==========================================================================
   FLAC 写回前的结构校验
   --------------------------------------------------------------------------
   本包的 FLAC 路径是「重建整个 metadata 区」：解析原文件的块 → 丢掉/替换
   PICTURE 与 VORBIS_COMMENT → 重新拼装 → 原样接上音频帧。

   缺少校验时，一个「第一个块不是 STREAMINFO」的文件（截断、被别的工具改坏、
   或者只是前四字节凑巧是 "fLaC"）会被**照原样重写**成一份必然无法播放的文件，
   而音频帧是原样拷贝的 —— 用户只会看到「写完标签后这首歌放不出来了」，
   完全查不出原因。规范要求 STREAMINFO 必须是第一个块且恰好 34 字节，
   所以这里是明确的拒绝条件，不是尽力而为的兼容。
   ========================================================================== */

func TestEmbedRefusesFLACWithoutStreamInfoFirst(t *testing.T) {
	raw := buildFlacWithPicture(t, "TITLE", []byte("PIC"))
	if len(raw) < 8 {
		t.Fatal("夹具不成立")
	}
	// 把第一个块的类型从 0（STREAMINFO）改成 1（PADDING），长度字段不变
	corrupt := append([]byte{}, raw...)
	corrupt[4] = 0x01

	path := writeTempFile(t, corrupt, "no-streaminfo.flac")
	res, err := EmbedLyrics(path, "[00:01.00]第一句\n")
	if err == nil {
		t.Fatalf("第一个块不是 STREAMINFO 时应当放弃写入，实际成功: %+v", res)
	}
	if !strings.Contains(err.Error(), "STREAMINFO") {
		t.Fatalf("错误信息应当点明 STREAMINFO，实际: %v", err)
	}

	after, readErr := os.ReadFile(path)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if string(after) != string(corrupt) {
		t.Fatal("放弃写入时原始文件被改动了")
	}
}

func TestEmbedRefusesFLACWithReservedBlockType(t *testing.T) {
	// 合法 STREAMINFO 之后跟一个保留类型 127 的块
	raw := []byte("fLaC")
	si := make([]byte, flacStreamInfoLen)
	raw = append(raw, 0x00, 0x00, 0x00, byte(len(si))) // STREAMINFO，非最后一块
	raw = append(raw, si...)
	raw = append(raw, 0x80|flacBlockInvalid) // 非法类型 + 最后一块
	raw = append(raw, 0, 0, 4)
	raw = append(raw, []byte("junk")...)
	raw = append(raw, []byte{0xFF, 0xF8, 0x00, 0x00}...)

	path := writeTempFile(t, raw, "reserved-block.flac")
	res, err := EmbedLyrics(path, "[00:01.00]第一句\n")
	if err == nil {
		t.Fatalf("出现保留块类型时应当放弃写入，实际成功: %+v", res)
	}
	if !strings.Contains(err.Error(), "127") {
		t.Fatalf("错误信息应当点明非法块类型 127，实际: %v", err)
	}
	after, _ := os.ReadFile(path)
	if string(after) != string(raw) {
		t.Fatal("放弃写入时原始文件被改动了")
	}
}

func TestEmbedRefusesFLACWithWrongStreamInfoLength(t *testing.T) {
	// 类型对但长度不是 34：说明这不是真正的 STREAMINFO 块
	raw := []byte("fLaC")
	raw = append(raw, 0x80, 0x00, 0x00, 0x10) // STREAMINFO（最后一块）但长度 16
	raw = append(raw, make([]byte, 16)...)
	raw = append(raw, []byte{0xFF, 0xF8, 0x00, 0x00}...)

	path := writeTempFile(t, raw, "short-streaminfo.flac")
	if _, err := EmbedCover(path, "image/png", []byte("PNG")); err == nil {
		t.Fatal("STREAMINFO 长度不对时应当放弃写入")
	}
}
