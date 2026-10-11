package metacache

import (
	"bytes"
	"crypto/md5"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

/* ==========================================================================
   真实文件回归：写回标签后**音频仍能解出完全相同的 PCM**
   --------------------------------------------------------------------------
   合成夹具（embed_offset_test.go）能守住偏移平移的算术，但守不住一件事：
   真实文件的结构比夹具复杂（ffmpeg 产出的 moov 里有 mvhd/trak/mdia/hdlr…
   多层嵌套、faststart 布局、FLAC 的 STREAMINFO/最后一块标志）。
   这两条用例用系统 ffmpeg 生成**真实**文件，比对改动前后解码出的 PCM 是否
   逐字节一致 —— 这正是用户感知到的「文件还能不能放」。

   没有系统 ffmpeg 时自动跳过（与 internal/ffmpeg、internal/loudness 的
   既有做法一致）。

   为什么值得为它付出这点时间：这两个 bug 都很隐蔽，而且历史上 CI 全绿 ——
   原夹具既没有 stco，也没有带 PICTURE 的 FLAC。
   ========================================================================== */

// TestEmbedCoverKeepsRealFaststartM4ADecodable 守 P0：
// moov 在 mdat 之前的 m4a 写封面后，chunk 偏移必须跟着平移。
//
// 修复前的行为（已实测）：写进去的封面让 moov 增长 N 字节，mdat 整体后移 N，
// 而 stco 里的偏移没变 —— ffmpeg 一帧都解不出来（`channel element 0.0 is not
// allocated` / `Decode error rate 1 …`），用户的音乐文件被永久写坏。
func TestEmbedCoverKeepsRealFaststartM4ADecodable(t *testing.T) {
	ff, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("没有系统 ffmpeg，跳过真实文件回归")
	}
	dir := t.TempDir()
	target := filepath.Join(dir, "faststart.m4a")

	runFFmpeg(t, ff, "-y", "-v", "error",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=3",
		"-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", target)

	raw, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("读取夹具失败: %v", err)
	}
	moovStart, moovEnd, ok := findTopLevelBoxAbs(raw, "moov")
	if !ok {
		t.Fatal("夹具没有 moov")
	}
	mdatStart, _, ok := findTopLevelBoxAbs(raw, "mdat")
	if !ok {
		t.Fatal("夹具没有 mdat")
	}
	if moovEnd > mdatStart {
		t.Fatalf("夹具不是 faststart 布局（moov 结束 %d > mdat 开始 %d），本用例无意义", moovEnd, mdatStart)
	}
	t.Logf("夹具 %d 字节：moov[%d,%d) 在 mdat@%d 之前", len(raw), moovStart, moovEnd, mdatStart)
	oldOffsets := readStco(t, raw)
	if len(oldOffsets) == 0 {
		t.Fatal("夹具没有 stco 条目")
	}

	basePCM, baseMD5 := decodePCM(t, ff, target)
	t.Logf("原文件解码：%d 字节 PCM，md5=%s", len(basePCM), baseMD5)

	// 用 JPEG 魔数 + 填充当封面：不依赖图片解码，只验证字节搬运与偏移正确性。
	cover := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{0x42}, 3000)...)
	res, err := EmbedCover(target, "image/jpeg", cover)
	if err != nil {
		t.Fatalf("写封面失败: %v", err)
	}
	if !res.OK {
		t.Fatalf("期望写入成功: %+v", res)
	}

	after, _ := os.ReadFile(target)
	assertTopLevelWalkExact(t, after)
	delta := len(after) - len(raw)
	newOffsets := readStco(t, after)
	if newOffsets[0] != oldOffsets[0]+uint32(delta) {
		t.Fatalf("stco 第一个偏移没有按 delta 平移：%d → %d（文件 %d → %d）",
			oldOffsets[0], newOffsets[0], len(raw), len(after))
	}
	t.Logf("文件 %d → %d（delta=%d），stco 第一个 %d → %d", len(raw), len(after), delta, oldOffsets[0], newOffsets[0])

	newPCM, newMD5 := decodePCM(t, ff, target)
	if newMD5 != baseMD5 || len(newPCM) != len(basePCM) {
		t.Fatalf("写回封面后解码结果变了：%d/%s → %d/%s（文件已被写坏）",
			len(basePCM), baseMD5, len(newPCM), newMD5)
	}
	if !containsBytes(after, []byte{0xFF, 0xD8, 0xFF, 0xE0}) {
		t.Fatal("封面没写进文件")
	}

	// 再写一次歌词：同样不能破坏解码，也不能把刚写进去的封面删掉。
	if _, err := EmbedLyrics(target, "[00:01.00]测试歌词\n"); err != nil {
		t.Fatalf("写歌词失败: %v", err)
	}
	lyrPCM, lyrMD5 := decodePCM(t, ff, target)
	if lyrMD5 != baseMD5 || len(lyrPCM) != len(basePCM) {
		t.Fatalf("写歌词后解码结果变了：%d/%s → %d/%s", len(basePCM), baseMD5, len(lyrPCM), lyrMD5)
	}
	afterLyrics, _ := os.ReadFile(target)
	if !containsBytes(afterLyrics, []byte{0xFF, 0xD8, 0xFF, 0xE0}) {
		t.Fatal("写歌词把封面删掉了（m4a）")
	}
}

// TestEmbedLyricsKeepsRealFlacPicture 守 P0：
// 只写歌词时，真实 FLAC 的内嵌封面必须保留，且解码结果不变。
func TestEmbedLyricsKeepsRealFlacPicture(t *testing.T) {
	ff, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("没有系统 ffmpeg，跳过真实文件回归")
	}
	dir := t.TempDir()
	plain := filepath.Join(dir, "plain.flac")
	cover := filepath.Join(dir, "cover.png")
	target := filepath.Join(dir, "withpic.flac")

	runFFmpeg(t, ff, "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "flac", plain)
	runFFmpeg(t, ff, "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1", cover)
	// 把图片作为 attached_pic 写进 flac 的 PICTURE 块
	runFFmpeg(t, ff, "-y", "-v", "error", "-i", plain, "-i", cover,
		"-map", "0:a", "-map", "1:v", "-c", "copy", "-disposition:v", "attached_pic", target)

	raw, _ := os.ReadFile(target)
	if !containsBytes(raw, []byte("image/png")) {
		t.Fatalf("夹具没有内嵌 PNG 封面（%d 字节）", len(raw))
	}
	basePCM, baseMD5 := decodePCM(t, ff, target)
	t.Logf("装好封面：%d 字节，解码 %d 字节 PCM md5=%s", len(raw), len(basePCM), baseMD5)

	res, err := EmbedLyrics(target, "[00:01.00]真实文件测试\n")
	if err != nil {
		t.Fatalf("写歌词失败: %v", err)
	}
	if !res.OK {
		t.Fatalf("期望写入成功: %+v", res)
	}

	after, _ := os.ReadFile(target)
	if !containsBytes(after, []byte("image/png")) {
		t.Fatal("写歌词把真实 FLAC 里的内嵌封面删掉了")
	}
	if !containsBytes(after, []byte("LYRICS=")) {
		t.Fatal("歌词没写进 VORBIS_COMMENT")
	}
	newPCM, newMD5 := decodePCM(t, ff, target)
	if newMD5 != baseMD5 || len(newPCM) != len(basePCM) {
		t.Fatalf("写歌词后解码结果变了：%d/%s → %d/%s", len(basePCM), baseMD5, len(newPCM), newMD5)
	}
	t.Logf("封面保留、解码一致：%d → %d 字节", len(raw), len(after))
}

func runFFmpeg(t *testing.T, ff string, args ...string) {
	t.Helper()
	cmd := exec.Command(ff, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("ffmpeg %v 失败: %v\n%s", args, err, out)
	}
}

// decodePCM 把文件解码成单声道 s16le PCM 并返回字节与 md5。
func decodePCM(t *testing.T, ff, path string) ([]byte, string) {
	t.Helper()
	cmd := exec.Command(ff, "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-")
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		t.Fatalf("解码 %s 失败: %v\n%s", filepath.Base(path), err, errBuf.String())
	}
	return out.Bytes(), fmt.Sprintf("%x", md5.Sum(out.Bytes()))
}
