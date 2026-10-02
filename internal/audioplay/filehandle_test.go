package audioplay

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestFileReleasedAfterClose 验证 Close 之后 WAV 文件句柄确实被释放。
//
// 单独隔离这个问题：Windows 上句柄没释放的表现是「文件删不掉」，
// 而删除通常发生在测试的 TempDir 清理里 —— 报错会指向清理过程，
// 掩盖真正的泄漏点。这里直接删，失败信息就落在引擎上。
func TestFileReleasedAfterClose(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "probe.wav")
	writeTestWAV(t, path, 440, 2.0)

	e := New()
	if err := e.Open(); err != nil {
		t.Skipf("没有音频设备: %v", err)
	}
	if err := e.Load(path, 0, 0, 1); err != nil {
		t.Fatalf("装载失败: %v", err)
	}
	e.Play()
	time.Sleep(300 * time.Millisecond)

	e.Close()

	// 句柄应当已释放：等一下让 Windows 的延迟删除生效
	deadline := time.Now().Add(3 * time.Second)
	var err error
	for time.Now().Before(deadline) {
		err = os.Remove(path)
		if err == nil {
			return // 成功
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("Close 之后文件仍无法删除（句柄没释放）: %v", err)
}

// TestSeekDoesNotLeakOldFileHandles 反复 seek 不应累积句柄。
func TestSeekDoesNotLeakOldFileHandles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "probe.wav")
	writeTestWAV(t, path, 440, 2.0)

	e := New()
	if err := e.Open(); err != nil {
		t.Skipf("没有音频设备: %v", err)
	}
	if err := e.Load(path, 0, 0, 1); err != nil {
		t.Fatalf("装载失败: %v", err)
	}
	e.Play()
	for i := 0; i < 10; i++ {
		if err := e.SeekToFrame(int64(i * 1000)); err != nil {
			t.Fatalf("第 %d 次 seek 失败: %v", i, err)
		}
		time.Sleep(30 * time.Millisecond)
	}
	e.Close()
	time.Sleep(200 * time.Millisecond)

	if err := os.Remove(path); err != nil {
		t.Fatalf("反复 seek 后文件无法删除: %v", err)
	}
	fmt.Println("seek 未泄漏句柄")
}
