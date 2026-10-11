package media

import (
	"os"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

/* ==========================================================================
   转码缓存的记账与磁盘必须一致
   --------------------------------------------------------------------------
   两处曾经的偏差都会让缓存目录无声地涨过预算（600MB）：

   ① 淘汰时忽略 os.Remove 的错误：文件还在磁盘上，记账却已经减掉 →
      预算永远算不够，而且该条目已被移出 s.cache，从此再也不会被淘汰。

   ② 重启后 s.cache 是空的，而磁盘上的 tc_*.wav 还在：LRU 只按内存记账
      淘汰，看不见这些文件 → 每次运行都会净增，设置界面还显示「占用 0 字节」。
   ========================================================================== */

func newBareServer() *Server {
	return New(func(string) (bootstrap.Song, bool) { return bootstrap.Song{}, false })
}

func TestEvictKeepsAccountingWhenRemoveFails(t *testing.T) {
	s := newBareServer()

	// 造一个「删不掉」的条目：路径是一个**非空目录**。
	// os.Remove 对非空目录必然失败，这比伪造权限错误更跨平台、更稳定。
	dir := t.TempDir()
	undeletable := filepath.Join(dir, "tc_locked.wav")
	if err := os.MkdirAll(undeletable, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(undeletable, "inner"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	s.cacheMu.Lock()
	// 单条就超过预算 → 必然进入淘汰
	s.cache["k1"] = &cacheItem{path: undeletable, size: transcodeBudgetBytes + 1, usedAt: 1}
	s.cacheMu.Unlock()

	s.evictIfNeeded()

	s.cacheMu.Lock()
	_, still := s.cache["k1"]
	s.cacheMu.Unlock()
	if !still {
		t.Fatal("删除失败时不能把记账删掉 —— 磁盘上的文件还在占空间，" +
			"记账一丢预算就永远算不够，缓存会无声地涨到超预算")
	}

	count, bytes := s.CacheStats()
	if count != 1 || bytes < transcodeBudgetBytes {
		t.Fatalf("占用统计必须仍然包含这条没能删掉的产物，实际 count=%d bytes=%d", count, bytes)
	}
}

func TestEvictRemovesAccountingWhenFileAlreadyGone(t *testing.T) {
	// 反向：文件本来就不存在（被用户手动删了）时，应当把记账一起清掉，
	// 否则会永远卡在「超预算但无可删」的状态。
	s := newBareServer()
	s.cacheMu.Lock()
	s.cache["k1"] = &cacheItem{path: filepath.Join(t.TempDir(), "tc_missing.wav"), size: transcodeBudgetBytes + 1, usedAt: 1}
	s.cacheMu.Unlock()

	s.evictIfNeeded()

	s.cacheMu.Lock()
	_, still := s.cache["k1"]
	s.cacheMu.Unlock()
	if still {
		t.Fatal("文件已经不存在时应当把记账清掉")
	}
}

func TestSetCacheDirPurgesStaleTranscodes(t *testing.T) {
	s := newBareServer()
	dir := t.TempDir()

	// 上一次运行遗留的转码产物
	stale := filepath.Join(dir, "tc_stale1.wav")
	if err := os.WriteFile(stale, make([]byte, 1024), 0o644); err != nil {
		t.Fatal(err)
	}
	// 别人的文件：cacheDir 是用户可配置的，绝不能碰
	foreign := filepath.Join(dir, "song.wav")
	if err := os.WriteFile(foreign, []byte("precious"), 0o644); err != nil {
		t.Fatal(err)
	}
	other := filepath.Join(dir, "tc_notes.txt")
	if err := os.WriteFile(other, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}

	s.SetCacheDir(dir)

	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Error("上一次运行遗留的 tc_*.wav 没有被清掉（会随每次运行累积，且不计入 LRU）")
	}
	if _, err := os.Stat(foreign); err != nil {
		t.Error("不能删掉目录里不属于转码缓存的 wav（cacheDir 可能被用户指到音乐目录）")
	}
	if _, err := os.Stat(other); err != nil {
		t.Error("非 .wav 的文件不该被删")
	}
}

func TestSetCacheDirDoesNotPurgeWhileTranscoding(t *testing.T) {
	// 已经转码过（或正在转码）之后重新设置目录，不能把正在用的产物删掉。
	s := newBareServer()
	dir := t.TempDir()
	inUse := filepath.Join(dir, "tc_inuse.wav")
	if err := os.WriteFile(inUse, []byte("in-use"), 0o644); err != nil {
		t.Fatal(err)
	}

	s.cacheMu.Lock()
	s.cache["k"] = &cacheItem{path: inUse, size: 8}
	s.cacheMu.Unlock()

	s.SetCacheDir(dir)

	if _, err := os.Stat(inUse); err != nil {
		t.Error("有活动条目时不该清理目录（可能删掉正在播放/转码的产物）")
	}
}
