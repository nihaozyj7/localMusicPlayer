package library

import (
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

// 元数据缓存里记的封面文件已经不在时（换过缓存目录、清过缓存、
// 或者把数据目录拷到了另一台机器），不能继续复用那条缓存 —— 否则
// coverUrl 会指向一个 404 的名字，用户看到的是「这首歌明明有内嵌封面，
// 却只显示默认图」。这条测试锁住「退回完整读取一次」的自愈行为。
func TestStaleCoverRefIsNotReused(t *testing.T) {
	m, _, _ := newTestManager(t)
	music := t.TempDir()
	songPath := filepath.Join(music, "plain.wav")
	writeWAV(t, songPath, 1)

	st, err := os.Stat(songPath)
	if err != nil {
		t.Fatal(err)
	}
	mod := st.ModTime().UnixMilli()

	// 伪造一条「封面文件已经没了」的元数据缓存
	m.cacheMu.Lock()
	m.cache[songPath] = cacheEntry{
		Title:     "陈旧缓存",
		CoverFile: "deadbeefdeadbeef.jpg",
		Size:      st.Size(),
		ModTime:   mod,
	}
	m.cacheMu.Unlock()

	m.cacheMu.RLock()
	_, existed := m.cache[songPath]
	m.cacheMu.RUnlock()
	if !existed {
		t.Fatal("测试前置条件失败：缓存条目没写进去")
	}

	before := atomic.LoadInt64(&m.metaReads)
	song := m.songFromCandidate(candidate{path: songPath, size: st.Size(), ext: "wav", mod: mod}, false)

	if strings.Contains(song.CoverURL, "deadbeef") {
		t.Fatalf("复用了已经不存在的封面文件：%q", song.CoverURL)
	}
	if atomic.LoadInt64(&m.metaReads) == before {
		t.Fatal("封面缺失时应当退回完整读取一次，但 metaReads 没变")
	}
	// 缓存里的死引用必须被替换掉（这台机器上这首歌确实没有内嵌封面）
	m.cacheMu.RLock()
	entry := m.cache[songPath]
	m.cacheMu.RUnlock()
	if entry.CoverFile == "deadbeefdeadbeef.jpg" {
		t.Fatal("缓存里的死引用没有被修正")
	}
}

// coverAvailable：空名字 = 「本来就没有封面」，属于可用（不该触发重新解析）。
func TestCoverAvailableEmptyIsTrue(t *testing.T) {
	m, _, _ := newTestManager(t)
	if !m.coverAvailable("") {
		t.Fatal("空封面名应当视为可用")
	}
	if m.coverAvailable("deadbeefdeadbeef.jpg") {
		t.Fatal("不存在的封面名应当视为不可用")
	}
	if m.coverAvailable("not-a-valid-name") {
		t.Fatal("非法文件名应当视为不可用")
	}
}
