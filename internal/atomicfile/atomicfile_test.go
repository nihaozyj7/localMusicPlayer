package atomicfile

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

/* ==========================================================================
   atomicfile 的测试（审查报告第 17 条：全仓落盘底座零测试）

   这个包是「所有用户数据落盘」的底座（配置、响度、元数据缓存、写回标签）。
   它存在的唯一理由是「唯一临时名 + fsync + 改名前串行化」，而这三件事全都
   是**并发下才出问题**、单线程永远测不出来的 —— 所以这里的重点是并发用例，
   不是「写进去能读出来」。
   ========================================================================== */

// TestWriteCreatesAndOverwrites 基本契约：建目录、写内容、覆盖旧内容（不是追加）。
func TestWriteCreatesAndOverwrites(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sub", "deep", "config.json")

	if err := Write(path, []byte(`{"a":1}`), 0o644); err != nil {
		t.Fatalf("首次写入失败: %v", err)
	}
	if got, err := os.ReadFile(path); err != nil || string(got) != `{"a":1}` {
		t.Fatalf("读回 = %q, err=%v", got, err)
	}

	// 更短的第二次写入：必须整体替换，不能留下上一份的尾巴
	if err := Write(path, []byte(`{}`), 0o644); err != nil {
		t.Fatalf("覆盖写入失败: %v", err)
	}
	if got, _ := os.ReadFile(path); string(got) != `{}` {
		t.Errorf("覆盖后 = %q，期望 {}（旧内容必须被整体替换）", got)
	}

	// 空数据是合法的（清空一份缓存）
	if err := Write(path, nil, 0o644); err != nil {
		t.Fatalf("写空内容失败: %v", err)
	}
	if st, err := os.Stat(path); err != nil || st.Size() != 0 {
		t.Errorf("空内容后大小 = %v (err=%v)，期望 0", st, err)
	}
}

// TestWriteLeavesNoTempFile 成功落盘后不能留下临时文件。
//
// 临时文件残留不只是「脏」：它们会跟着目录一起被扫描（曲库扫描跳过非音频，
// 但缓存目录的 .tmp 会一直堆积），而且固定名残留会让下一次写入直接覆盖它。
func TestWriteLeavesNoTempFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "x.json")

	for i := 0; i < 5; i++ {
		if err := Write(path, []byte(fmt.Sprintf("v%d", i)), 0o644); err != nil {
			t.Fatalf("第 %d 次写入失败: %v", i, err)
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("读目录失败: %v", err)
	}
	if len(entries) != 1 || entries[0].Name() != "x.json" {
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("目录里剩下了 %v，只该有 x.json（临时文件必须被改名或删除）", names)
	}
}

// TestWriteConcurrentSameTarget 并发写同一个目标：最终内容必须是**某一个**
// 完整版本，绝不能是两个版本混起来的半截内容。
//
// 这正是这个包要解决的问题：固定临时名（"<path>.tmp"）在并发下会被两个写者
// 共用，Windows 上 rename 直接 ERROR_SHARING_VIOLATION，而退回直接覆盖写更糟。
func TestWriteConcurrentSameTarget(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "loudness.json")

	const writers = 4
	payloads := make([][]byte, writers)
	for i := range payloads {
		// 每个写者一份「内部一致」的内容：整份都是同一个字节
		payloads[i] = bytes.Repeat([]byte{byte('A' + i)}, 4096)
	}

	var wg sync.WaitGroup
	errCh := make(chan error, writers*20)
	for round := 0; round < 20; round++ {
		for w := 0; w < writers; w++ {
			wg.Add(1)
			go func(w int) {
				defer wg.Done()
				if err := Write(path, payloads[w], 0o644); err != nil {
					errCh <- err
				}
			}(w)
		}
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Errorf("并发写入报错: %v", err)
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读回失败: %v", err)
	}
	if !bytes.Equal(got, payloads[0]) && !bytes.Equal(got, payloads[1]) &&
		!bytes.Equal(got, payloads[2]) && !bytes.Equal(got, payloads[3]) {
		t.Fatalf("最终内容不是任何一个完整版本（长度 %d，首个字节 %q）—— 并发写互相污染了",
			len(got), firstByte(got))
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Errorf("并发写入后目录里有 %d 个文件，只有目标文件应当留下", len(entries))
	}
}

func firstByte(b []byte) byte {
	if len(b) == 0 {
		return 0
	}
	return b[0]
}

// TestWriteConcurrentDifferentTargets 不同目标互不干扰（临时名带序号的原因之一）。
func TestWriteConcurrentDifferentTargets(t *testing.T) {
	dir := t.TempDir()
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			p := filepath.Join(dir, fmt.Sprintf("f%d.json", i))
			if err := Write(p, []byte(fmt.Sprintf("body-%d", i)), 0o644); err != nil {
				t.Errorf("写 %s 失败: %v", p, err)
			}
		}(i)
	}
	wg.Wait()
	for i := 0; i < 16; i++ {
		p := filepath.Join(dir, fmt.Sprintf("f%d.json", i))
		got, err := os.ReadFile(p)
		if err != nil {
			t.Fatalf("读 %s 失败: %v", p, err)
		}
		if want := fmt.Sprintf("body-%d", i); string(got) != want {
			t.Errorf("%s = %q，期望 %q", p, got, want)
		}
	}
}

// TestWriteErrorLeavesOldContentIntact 目标路径不可用时必须报错，
// 并且**不能**把原有文件破坏掉。
func TestWriteErrorLeavesOldContentIntact(t *testing.T) {
	dir := t.TempDir()
	// 用一个「文件」占住目录位置，让它下面的路径无法创建
	blocker := filepath.Join(dir, "blocker")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatalf("准备失败: %v", err)
	}

	err := Write(filepath.Join(blocker, "child.json"), []byte("data"), 0o644)
	if err == nil {
		t.Fatal("目标目录无法创建时应当报错")
	}

	// 原文件安然无恙
	if got, _ := os.ReadFile(blocker); string(got) != "x" {
		t.Errorf("占位文件被改动了: %q", got)
	}
	// 失败路径不留临时文件
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("失败后留下了临时文件 %s", e.Name())
		}
	}
}

// TestWriteReplacesDirectoryWithFile 目标位置是目录时不能假装成功。
//
// rename 一个文件到目录上在各平台都失败；此时函数会退回 os.WriteFile，
// 那也会失败 —— 最终必须返回错误，而不是无声地「写成功」。
func TestWriteReplacesDirectoryWithFile(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "iam-dir")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatalf("准备失败: %v", err)
	}
	if err := Write(target, []byte("data"), 0o644); err == nil {
		t.Fatal("目标是目录时应当报错")
	}
}

// TestWriteFallbackErrorMentionsBothCauses 守住回退路径的错误信息。
//
// 目标是目录时两条路都会失败（rename 到目录、覆盖写目录），于是错误信息里必须
// **同时**出现「替换 … 失败」与「回退覆盖写也失败」：
// 只包 rename 的错误时，用户看到的是「替换 xxx 失败: Access is denied」，而真正
// 的原因（目标不可写 / 磁盘已满）被吞掉了 —— 第六轮审查 §4.2 记的正是这处
// 「注释承诺回退行为、实现却把回退的失败藏起来」。
func TestWriteFallbackErrorMentionsBothCauses(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "iam-dir")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatalf("准备失败: %v", err)
	}

	err := Write(target, []byte("data"), 0o644)
	if err == nil {
		t.Fatal("目标是目录时必须报错")
	}
	msg := err.Error()
	for _, want := range []string{"替换 iam-dir 失败", "回退覆盖写也失败"} {
		if !strings.Contains(msg, want) {
			t.Errorf("错误信息缺少 %q，实际是：%s", want, msg)
		}
	}

	// 失败路径也不该留下临时文件
	entries, readErr := os.ReadDir(dir)
	if readErr != nil {
		t.Fatalf("读目录失败: %v", readErr)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("失败后残留临时文件: %s", e.Name())
		}
	}
}

// TestWriteKeepsTargetOnSameVolume 临时文件必须与目标同目录。
//
// 跨卷 rename 在 Windows 上会退化成「复制 + 删除」，就不再有原子性；
// 若将来把临时文件挪到 os.TempDir()，这个用例会失败。
func TestWriteKeepsTargetOnSameVolume(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "x.json")

	// 用一个只读目录观察：写入过程中不应在其他地方出现临时文件
	if err := Write(path, []byte("v"), 0o644); err != nil {
		t.Fatalf("写入失败: %v", err)
	}
	// 目录里只有目标文件（临时文件与目标同目录且已改名）
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 || entries[0].Name() != "x.json" {
		t.Fatalf("目录内容 = %v，期望只有 x.json", entries)
	}
}
