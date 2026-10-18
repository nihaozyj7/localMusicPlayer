package media

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

/* ==========================================================================
   转码中间产物的回收
   --------------------------------------------------------------------------
   internal/ffmpeg 的转码是两步：先让 ffmpeg 把整首歌写成裸 PCM（<out>.pcm），
   再由 Go 侧补 44 字节 WAV 头（先写 <out>.part，写完原子改名成 out）。

   正常路径两者都会被删/改名，但进程被强杀就会留下它们 —— 而旧的清理规则
   （「tc_ 前缀 + .wav 结尾」）一条都不匹配，于是磁盘上的几 GB 半成品
   （强杀现场的 .pcm 就是整首歌大小）永远没人回收，CacheStats 还报 0。
   这里的用例守住「每一条清理路径都能回收它们、且绝不误删用户文件」。

   并发纪律：ClearCache 不能删掉正在转码中的条目的 .pcm（见 ClearCache 注释），
   因此 testClearCacheKeepsInflight 用真实的 inflight 记账来验证。
   ========================================================================== */

// writeCacheFile 在 dir 下写一个指定大小的文件，返回路径。
func writeCacheFile(t *testing.T, dir, name string, size int) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, make([]byte, size), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

// mustGone 断言路径已被删除。
func mustGone(t *testing.T, path, why string) {
	t.Helper()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("%s：%s 仍然存在", why, filepath.Base(path))
	}
}

// mustExist 断言路径还在。
func mustExist(t *testing.T, path, why string) {
	t.Helper()
	if _, err := os.Stat(path); err != nil {
		t.Errorf("%s：%s 不应被删除（%v）", why, filepath.Base(path), err)
	}
}

// TestSetCacheDirPurgesTranscodeIntermediates 启动装配阶段调用的 SetCacheDir
// 必须把上次强杀留下的 .pcm/.part 一并回收（旧实现只看 .wav）。
func TestSetCacheDirPurgesTranscodeIntermediates(t *testing.T) {
	dir := t.TempDir()
	done := writeCacheFile(t, dir, "tc_done.wav", 4096)
	pcm := writeCacheFile(t, dir, "tc_killed.wav.pcm", 1<<20)
	part := writeCacheFile(t, dir, "tc_killed.wav.part", 1<<20)
	song := writeCacheFile(t, dir, "song.wav", 16)

	s := New(nil)
	s.SetCacheDir(dir)

	mustGone(t, done, "上一次运行留下的转码产物")
	mustGone(t, pcm, "强杀留下的裸 PCM")
	mustGone(t, part, "强杀留下的 .part")
	mustExist(t, song, "同目录里别人的 WAV")
}

// TestClearCacheReclaimsTranscodeIntermediates 用户点「清空转码缓存」这条路径
// 同样要回收中间产物（这次在 SetCacheDir 之后写入，确保考的是 ClearCache）。
func TestClearCacheReclaimsTranscodeIntermediates(t *testing.T) {
	dir := t.TempDir()
	s := New(nil)
	s.SetCacheDir(dir)

	done := writeCacheFile(t, dir, "tc_done.wav", 4096)
	pcm := writeCacheFile(t, dir, "tc_killed.wav.pcm", 1<<20)
	part := writeCacheFile(t, dir, "tc_killed.wav.part", 1<<20)
	song := writeCacheFile(t, dir, "song.wav", 16)
	// 没有 tc_ 前缀的都是别人的文件（用户自己的录音、别的工具），必须留下
	foreign := writeCacheFile(t, dir, "用户录的.wav", 32)
	notWav := writeCacheFile(t, dir, "tc_x.log", 32)

	if err := s.ClearCache(); err != nil {
		t.Fatalf("ClearCache: %v", err)
	}

	mustGone(t, done, "转码产物")
	mustGone(t, pcm, "强杀留下的裸 PCM")
	mustGone(t, part, "强杀留下的 .part")
	mustExist(t, song, "同目录里别人的 WAV")
	mustExist(t, foreign, "用户的音频文件")
	mustExist(t, notWav, "非 wav 的 tc_ 文件")
}

// TestClearCacheKeepsInflightTranscodeLeftovers 清空缓存不能动「正在转码中」
// 条目的文件：它的 .pcm 此刻正被写盘，删掉（换到能删打开文件的文件系统上）
// 会直接毁掉这次转码。
func TestClearCacheKeepsInflightTranscodeLeftovers(t *testing.T) {
	dir := t.TempDir()
	s := New(nil)
	s.SetCacheDir(dir)

	out := filepath.Join(dir, "tc_inflight.wav")
	inflightPCM := writeCacheFile(t, dir, "tc_inflight.wav.pcm", 4096)
	// 模拟 ensureTranscoded 在转码前登记的记账
	item := &cacheItem{path: out, inflight: true, done: make(chan struct{})}
	s.cacheMu.Lock()
	s.cache["inflight-key"] = item
	s.cacheMu.Unlock()

	// 同一次清理里，别的（非 inflight）产物仍应被回收
	stale := writeCacheFile(t, dir, "tc_stale.wav.pcm", 4096)

	if err := s.ClearCache(); err != nil {
		t.Fatalf("ClearCache: %v", err)
	}

	mustExist(t, inflightPCM, "正在转码中的 .pcm")
	mustGone(t, stale, "非 inflight 的遗留产物")
	// 记账也要留着：转码完成的回调还会往这条记录里写结果
	s.cacheMu.Lock()
	_, kept := s.cache["inflight-key"]
	s.cacheMu.Unlock()
	if !kept {
		t.Error("ClearCache 不应删掉正在转码中的记账（确保转码完成后仍能命中缓存）")
	}

	// 转码完成后就不再是 inflight，下一次清空应当把它清掉
	s.cacheMu.Lock()
	item.inflight = false
	s.cacheMu.Unlock()
	if err := s.ClearCache(); err != nil {
		t.Fatalf("ClearCache: %v", err)
	}
	mustGone(t, inflightPCM, "转码完成后遗留的 .pcm")
	close(item.done)
}

// TestTranscodeLeavesNoIntermediateFiles 正常完成路径本身不能残留 .pcm/.part：
// 否则「缓存目录里只有 tc_*.wav」这条不变量就不成立。
func TestTranscodeLeavesNoIntermediateFiles(t *testing.T) {
	srv, song := newTestServer(t, "ape", 2048)
	dir := t.TempDir()
	srv.SetCacheDir(dir)
	srv.setFFmpegForTest(fakeFFmpeg(t, 4096, ""))

	if _, err := srv.ensureTranscoded(context.Background(), song); err != nil {
		t.Fatalf("转码失败: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	wavs := 0
	for _, e := range entries {
		name := e.Name()
		switch {
		case filepath.Ext(name) == ".wav":
			wavs++
		case filepath.Ext(name) == ".pcm" || filepath.Ext(name) == ".part":
			t.Errorf("正常转码完成后残留中间文件：%s", name)
		}
	}
	if wavs != 1 {
		t.Errorf("缓存目录里应当只有 1 个 WAV 产物，实际 %d 个", wavs)
	}
}

// TestClearCacheConcurrentWithTranscode 清空缓存与转码并发跑：既要没有数据
// 竞争（-race 下验证 s.cache 的加锁），也不能因为互删文件而让转码卡死。
// 这里是压力用例，只要求不 panic、不泄漏锁；转码失败是允许的 —— 清空缓存
// 本来就可能把刚转好的产物删掉，下次播放会重新转。
func TestClearCacheConcurrentWithTranscode(t *testing.T) {
	srv, song := newTestServer(t, "ape", 8192)
	dir := t.TempDir()
	srv.SetCacheDir(dir)
	srv.setFFmpegForTest(fakeFFmpeg(t, 1<<20, ""))

	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 15; j++ {
				_ = srv.ClearCache()
			}
		}()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for j := 0; j < 15; j++ {
			_, _ = srv.ensureTranscoded(context.Background(), song)
		}
	}()
	wg.Wait()
}
