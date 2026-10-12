package onlinecache

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

/* ==========================================================================
   跨盘符搬运的回退路径（第六轮审查 N-3）
   --------------------------------------------------------------------------
   `MoveFile` 在同一个盘符内靠 os.Rename 原子完成，跨盘符时 Rename 会失败，
   退化成「复制到临时文件 + 改名 + 删原文件」。这条回退路径：

     ① 平时跑不到（只有跨盘符才走），因此最容易写错又最没有覆盖；
     ② 曾经把临时文件名写死成 `dst + ".moving"` —— 一个**所有调用者共享**
        的名字。两个搬运同时指向同一个 dst 时会互相截断，最后改名出去的
        是「谁都不是」的坏文件，而目标名会被当成一份完好的下载。

   所以这里直接测 `copyThenRemove`（回退路径本身），不去设法制造两个盘符。
   ========================================================================== */

func moveFixture(t *testing.T, name string, data []byte) (src, dst string) {
	t.Helper()
	dir := t.TempDir()
	src = filepath.Join(dir, "src-"+name)
	if err := os.WriteFile(src, data, 0o644); err != nil {
		t.Fatal(err)
	}
	return src, filepath.Join(dir, "dst-"+name)
}

// 回退路径本身：内容一字不差、原文件被删掉、临时文件不留痕。
func TestCopyThenRemoveMovesContentAndCleansUp(t *testing.T) {
	data := bytes.Repeat([]byte("audio-bytes-"), 512)
	src, dst := moveFixture(t, "a.m4a", data)

	if err := copyThenRemove(src, dst); err != nil {
		t.Fatalf("跨盘符回退路径失败: %v", err)
	}

	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("目标文件不存在: %v", err)
	}
	if !bytes.Equal(got, data) {
		t.Fatalf("搬运后的内容不一致：%d 字节，期望 %d", len(got), len(data))
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Fatal("搬运成功后原文件应当消失（否则同一首歌在磁盘上存在两份）")
	}
	assertNoTempLeftovers(t, filepath.Dir(dst))
}

// ★ N-3 的回归守卫：`dst + ".moving"` 这个**固定名**被占住（残留文件 / 被
// 占用 / 恰是个目录）时，搬运必须照样成功 —— 新名字是「目标名 + 随机后缀
// + .moving」，与别人的名字无关。
//
// 修复前这里必然失败：os.Create(dst + ".moving") 打开不了那个目录，
// 于是这条回退路径**永久**搬不动这个文件（用户看到「迁移下载目录失败」）。
func TestCopyThenRemoveWorksWhenFixedNameIsTaken(t *testing.T) {
	data := bytes.Repeat([]byte("x"), 2048)
	src, dst := moveFixture(t, "taken.m4a", data)

	// 固定名上放一个目录：os.Create 打不开它（会报「是一个目录 / 拒绝访问」）
	if err := os.Mkdir(dst+".moving", 0o755); err != nil {
		t.Fatal(err)
	}

	if err := copyThenRemove(src, dst); err != nil {
		t.Fatalf("固定名被占住时搬运失败（旧实现就是写死这个名字）: %v", err)
	}
	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("目标文件不存在: %v", err)
	}
	if !bytes.Equal(got, data) {
		t.Fatal("搬运后的内容不一致")
	}
}

// ★ N-3 的第二个守卫：两个搬运同时指向**同一个 dst**（下载侧在真正搬运前会
// 删掉 uniquePath 预留的占位文件，预留窗口并不覆盖搬运本身；目录迁移也可能
// 被点两次）。结果必须是**两份完整内容之一**，绝不能是交错的混合体。
func TestConcurrentMovesToSameTargetPublishWholeFile(t *testing.T) {
	dir := t.TempDir()
	payloadA := bytes.Repeat([]byte{0xAA}, 4<<20)
	payloadB := bytes.Repeat([]byte{0xBB}, 4<<20)

	srcA := filepath.Join(dir, "a.m4a")
	srcB := filepath.Join(dir, "b.m4a")
	if err := os.WriteFile(srcA, payloadA, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(srcB, payloadB, 0o644); err != nil {
		t.Fatal(err)
	}
	dst := filepath.Join(dir, "song.m4a")

	// 两个搬运者各搬各的源文件到同一个目标
	var wg sync.WaitGroup
	errs := make([]error, 2)
	wg.Add(2)
	go func() { defer wg.Done(); errs[0] = copyThenRemove(srcA, dst) }()
	go func() { defer wg.Done(); errs[1] = copyThenRemove(srcB, dst) }()
	wg.Wait()

	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("目标文件不存在: %v", err)
	}
	wholeA := bytes.Equal(got, payloadA)
	wholeB := bytes.Equal(got, payloadB)
	if !wholeA && !wholeB {
		t.Fatalf("目标文件是两份内容的混合体（%d 字节，首字节 0x%02X）："+
			"两个搬运共用了同一个固定名的临时文件，互相截断后改名出去的坏文件"+
			"会被当成一份完好的下载", len(got), got[0])
	}
	// 至少一方应当成功（另一方失败也无妨：内容相同、谁赢都一样）
	if errs[0] != nil && errs[1] != nil {
		t.Fatalf("两个搬运都失败了: %v / %v", errs[0], errs[1])
	}
	assertNoTempLeftovers(t, dir)
}

// 回退路径失败时**绝不动原文件**（缓存/下载目录里的东西比这次搬运重要）。
func TestCopyThenRemoveKeepsSourceWhenTargetUnwritable(t *testing.T) {
	data := []byte("keep-me")
	src, dst := moveFixture(t, "ro.m4a", data)

	// 让目标位置是一个**目录**：改名必然失败
	if err := os.Mkdir(dst, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := copyThenRemove(src, dst); err == nil {
		t.Fatal("目标位置不可写时应当报错")
	}
	if got, err := os.ReadFile(src); err != nil || !bytes.Equal(got, data) {
		t.Fatalf("搬运失败后原文件必须完好无损（err=%v）", err)
	}
	assertNoTempLeftovers(t, filepath.Dir(src))
}

// assertNoTempLeftovers 断言目录里没有留下任何临时文件（.part / .moving）。
func assertNoTempLeftovers(t *testing.T, dir string) {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), partSuffix) || strings.HasSuffix(e.Name(), movingSuffix) {
			t.Errorf("留下了临时文件 %s：失败路径必须自己清理干净", e.Name())
		}
	}
}

// MoveFile 的正常路径（同盘符走 Rename，不经过回退）也要一字不差。
func TestMoveFileSameVolume(t *testing.T) {
	data := bytes.Repeat([]byte("z"), 1024)
	src, dst := moveFixture(t, "same.m4a", data)
	if err := MoveFile(src, dst); err != nil {
		t.Fatalf("MoveFile 失败: %v", err)
	}
	got, err := os.ReadFile(dst)
	if err != nil || !bytes.Equal(got, data) {
		t.Fatalf("内容不一致（err=%v）", err)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Fatal("移动后原文件应当消失")
	}
}
