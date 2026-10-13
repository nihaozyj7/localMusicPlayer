/* ==========================================================================
   online_cache_cleanup_test.go — 试听缓存的空闲清理
   --------------------------------------------------------------------------
   需求（用户原话）：「在线歌曲的缓存定期清理，对于没有被播放列表和歌单引用的
   歌曲，在空闲时间可能会触发清理，这个空闲时间你好好设计一下」。

   这里把两件事分开钉：

     1. **判据**（cleanupPlan，纯函数）：被引用的不删、还新鲜的不删、
        最旧的先删、单次上限生效、认不出名字的不碰。
        —— 这是「删错了要用户重新下载」的那一步，边界必须逐条钉死。

     2. **空闲怎么算**（Tick，注入假时钟）：在播 / 刚有声音 / 启动宽限期 /
        下载中 / 在线请求中 / 距上次清理不足 30 分钟 —— 六种情况都不许动手。
        —— 这是「别在用户听歌时给磁盘添堵」的那一步。

   真删文件的路径（List/RemoveName）由 internal/onlinecache 的用例守着，
   这里只断言「名单给对了」以及「不该动手时一个字节都没少」。
   ========================================================================== */

package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"

	"localmusicplayer/internal/onlinecache"
)

/* --------------------------------------------------------------------------
   工具
   -------------------------------------------------------------------------- */

// cleanupTestStore 建一个临时缓存目录，并按名字造出若干缓存文件。
//
// 直接写文件而不是走 Store.Store：Store 会写 index.json 与 LRU 记账，
// 而清理面对的是「上一轮运行留下的、本进程从没写过的文件」—— 那种状态
// 用 os.WriteFile 造最真实。内容 4KB（超过 minValidBytes，避免被判成残片）。
func cleanupTestStore(t *testing.T, files map[string]time.Time) (*onlinecache.Store, string) {
	t.Helper()
	dir := t.TempDir()
	for name, mod := range files {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, bytes.Repeat([]byte{7}, 4096), 0o644); err != nil {
			t.Fatalf("造缓存文件 %s 失败: %v", name, err)
		}
		if err := os.Chtimes(path, mod, mod); err != nil {
			t.Fatalf("设置 %s 的时间失败: %v", name, err)
		}
	}
	return onlinecache.New(dir), dir
}

func entryNames(entries []onlinecache.Entry) []string {
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		out = append(out, e.Name)
	}
	return out
}

func TestCleanupPlan(t *testing.T) {
	now := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	entry := func(name string, age time.Duration) onlinecache.Entry {
		return onlinecache.Entry{
			Name:    name,
			Path:    name,
			BVID:    name[:len(name)-4],
			Size:    4096,
			ModTime: now.Add(-age),
		}
	}

	t.Run("被引用的不删、还新鲜的不删", func(t *testing.T) {
		entries := []onlinecache.Entry{
			entry("BVkeep.m4a", 30*24*time.Hour),  // 在歌单/队列里
			entry("BVfresh.m4a", 2*time.Hour),     // 刚听过
			entry("BVold.m4a", 30*24*time.Hour),   // 又旧又没人引用 → 该删
			entry("BVliked.m4a", 60*24*time.Hour), // 在「我喜欢」里
		}
		plan := cleanupPlan(entries, cleanupOptions{
			Now:        now,
			MinAge:     cleanupMinIdleAge,
			Referenced: map[string]bool{onlineSongID("BVkeep"): true, onlineSongID("BVliked"): true},
			MaxFiles:   cleanupMaxFilesPerRun,
			MaxBytes:   cleanupMaxBytesPerRun,
		})
		got := entryNames(plan)
		if len(got) != 1 || got[0] != "BVold.m4a" {
			t.Fatalf("应当只删最旧且无人引用的那个，实际 %v", got)
		}
	})

	t.Run("最旧的先删，按上限截断", func(t *testing.T) {
		entries := []onlinecache.Entry{
			entry("BVnew.m4a", 8*24*time.Hour),
			entry("BVoldest.m4a", 90*24*time.Hour),
			entry("BVmid.m4a", 20*24*time.Hour),
		}
		plan := cleanupPlan(entries, cleanupOptions{
			Now:      now,
			MinAge:   cleanupMinIdleAge,
			MaxFiles: 2,
		})
		got := entryNames(plan)
		want := []string{"BVoldest.m4a", "BVmid.m4a"}
		if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
			t.Fatalf("最旧的先删且只删 2 个，实际 %v", got)
		}
	})

	t.Run("字节上限：超出的不删（宁可少删）", func(t *testing.T) {
		entries := []onlinecache.Entry{
			entry("BVa.m4a", 90*24*time.Hour),
			entry("BVb.m4a", 80*24*time.Hour),
			entry("BVc.m4a", 70*24*time.Hour),
		}
		for i := range entries {
			entries[i].Size = 4096
		}
		plan := cleanupPlan(entries, cleanupOptions{
			Now:      now,
			MinAge:   cleanupMinIdleAge,
			MaxFiles: 10,
			MaxBytes: 4096, // 只够删一个
		})
		got := entryNames(plan)
		if len(got) != 1 {
			t.Fatalf("字节上限只够删一个，实际 %v", got)
		}
	})

	t.Run("刚好到门槛就算够旧（边界含等号）", func(t *testing.T) {
		entries := []onlinecache.Entry{entry("BVedge.m4a", cleanupMinIdleAge)}
		plan := cleanupPlan(entries, cleanupOptions{Now: now, MinAge: cleanupMinIdleAge})
		if len(plan) != 1 {
			t.Fatal("闲置时间刚好等于门槛时应当可删（判据是「>= 门槛」，不是「> 门槛」）")
		}
	})

	t.Run("认不出 bvid 的文件不碰", func(t *testing.T) {
		entries := []onlinecache.Entry{
			{Name: "别人放的文件.dat", Path: "x", BVID: "", Size: 10, ModTime: now.Add(-999 * time.Hour)},
		}
		if plan := cleanupPlan(entries, cleanupOptions{Now: now, MinAge: cleanupMinIdleAge}); len(plan) != 0 {
			t.Fatalf("认不出 id 的文件必须跳过（不确定的东西不删），实际 %v", entryNames(plan))
		}
	})
}

/* --------------------------------------------------------------------------
   Tick：六种「别动手」的情况
   -------------------------------------------------------------------------- */

// cleanupHarness 组一个可控的清理器（假时钟 + 可控的播放/忙状态）。
type cleanupHarness struct {
	cleanup *onlineCacheCleanup
	now     time.Time
	playing bool
	songID  string
	busy    bool
	refs    map[string]bool
}

func newCleanupHarness(t *testing.T, store *onlinecache.Store, start time.Time) *cleanupHarness {
	t.Helper()
	h := &cleanupHarness{now: start, refs: map[string]bool{}}
	h.cleanup = newOnlineCacheCleanup(onlineCleanupDeps{
		store:       store,
		referenced:  func() map[string]bool { return h.refs },
		playerState: func() (string, bool) { return h.songID, h.playing },
		busy:        func() bool { return h.busy },
		now:         func() time.Time { return h.now },
		budget:      1 << 40, // 默认远大于实际体积：不启用磁盘压力条款
	})
	return h
}

func (h *cleanupHarness) advance(d time.Duration) { h.now = h.now.Add(d) }

func TestCleanupTickGates(t *testing.T) {
	start := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

	old := map[string]time.Time{
		"BVstale.m4a": start.Add(-30 * 24 * time.Hour),
	}

	t.Run("启动宽限期内不动手", func(t *testing.T) {
		store, dir := cleanupTestStore(t, old)
		h := newCleanupHarness(t, store, start)
		h.advance(time.Minute)
		if rep := h.cleanup.Tick(); rep.Skipped == "" || rep.Deleted != 0 {
			t.Fatalf("启动 1 分钟内不该清理，实际 skipped=%q deleted=%d", rep.Skipped, rep.Deleted)
		}
		if _, err := os.Stat(filepath.Join(dir, "BVstale.m4a")); err != nil {
			t.Fatal("不该动手时文件必须还在")
		}
	})

	t.Run("正在播放时不动手（并刷新活动时刻）", func(t *testing.T) {
		store, dir := cleanupTestStore(t, old)
		h := newCleanupHarness(t, store, start)
		h.playing = true
		h.advance(10 * time.Minute)
		if rep := h.cleanup.Tick(); rep.Deleted != 0 {
			t.Fatalf("在播时不该删任何东西，实际删了 %d 个", rep.Deleted)
		}
		// 停止播放后 4 分钟仍然算「刚有音频活动」
		h.playing = false
		h.advance(4 * time.Minute)
		if rep := h.cleanup.Tick(); rep.Deleted != 0 {
			t.Fatal("停止播放不足 5 分钟不该动手")
		}
		if _, err := os.Stat(filepath.Join(dir, "BVstale.m4a")); err != nil {
			t.Fatal("不该动手时文件必须还在")
		}
	})

	t.Run("下载/在线请求进行中不动手", func(t *testing.T) {
		store, _ := cleanupTestStore(t, old)
		h := newCleanupHarness(t, store, start)
		h.advance(10 * time.Minute)
		h.busy = true
		if rep := h.cleanup.Tick(); rep.Deleted != 0 {
			t.Fatal("有下载或在线请求时不该动手")
		}
	})

	t.Run("30 分钟节流：清一次之后第二次跳过", func(t *testing.T) {
		store, dir := cleanupTestStore(t, map[string]time.Time{
			"BVa.m4a": start.Add(-30 * 24 * time.Hour),
			"BVb.m4a": start.Add(-29 * 24 * time.Hour),
		})
		h := newCleanupHarness(t, store, start)
		h.advance(10 * time.Minute)
		first := h.cleanup.Tick()
		if first.Deleted != 2 {
			t.Fatalf("首次空闲清理应当删掉两个陈旧缓存，实际 %d", first.Deleted)
		}
		// 再造一个陈旧文件，紧接着再跳一次 —— 应当被节流拦住
		stale := filepath.Join(dir, "BVc.m4a")
		if err := os.WriteFile(stale, bytes.Repeat([]byte{7}, 4096), 0o644); err != nil {
			t.Fatal(err)
		}
		old := start.Add(-30 * 24 * time.Hour)
		if err := os.Chtimes(stale, old, old); err != nil {
			t.Fatal(err)
		}
		h.advance(time.Minute)
		if rep := h.cleanup.Tick(); rep.Skipped == "" || rep.Deleted != 0 {
			t.Fatalf("同一次会话内 30 分钟内不该再清，实际 skipped=%q deleted=%d", rep.Skipped, rep.Deleted)
		}
		if _, err := os.Stat(stale); err != nil {
			t.Fatal("被节流时文件必须还在")
		}
		// 过了节流窗口再来一次：这次该动手了
		h.advance(cleanupThrottle)
		if rep := h.cleanup.Tick(); rep.Deleted != 1 {
			t.Fatalf("过了节流窗口应当删掉一个，实际 %d", rep.Deleted)
		}
	})

	t.Run("引用与新鲜度：只删该删的那个", func(t *testing.T) {
		store, dir := cleanupTestStore(t, map[string]time.Time{
			"BVreferenced.m4a": start.Add(-40 * 24 * time.Hour),
			"BVfresh.m4a":      start.Add(-2 * time.Hour),
			"BVstale.m4a":      start.Add(-40 * 24 * time.Hour),
		})
		h := newCleanupHarness(t, store, start)
		// 播放队列里那首（由前端推过来，见 ProtectIDs）
		h.refs[onlineSongID("BVreferenced")] = true
		h.advance(10 * time.Minute)
		rep := h.cleanup.Tick()
		if rep.Deleted != 1 {
			t.Fatalf("只该删那个又旧又没被引用的，实际 %d（scanned=%d referenced=%d fresh=%d）",
				rep.Deleted, rep.Scanned, rep.Referenced, rep.Fresh)
		}
		if _, err := os.Stat(filepath.Join(dir, "BVstale.m4a")); !os.IsNotExist(err) {
			t.Fatal("陈旧的应当被删掉")
		}
		for _, keep := range []string{"BVreferenced.m4a", "BVfresh.m4a"} {
			if _, err := os.Stat(filepath.Join(dir, keep)); err != nil {
				t.Fatalf("%s 不该被删：%v", keep, err)
			}
		}
		if rep.Total != 2 {
			t.Fatalf("清理后缓存应当剩 2 个，实际 %d", rep.Total)
		}
	})

	t.Run("正在播放的那首即使没人引用也不删", func(t *testing.T) {
		store, dir := cleanupTestStore(t, map[string]time.Time{
			"BVcurrent.m4a": start.Add(-40 * 24 * time.Hour),
		})
		h := newCleanupHarness(t, store, start)
		// 暂停着（playing=false）但装载着：点一下继续就能听，缓存不能删
		h.songID = onlineSongID("BVcurrent")
		h.advance(10 * time.Minute)
		if rep := h.cleanup.Tick(); rep.Deleted != 0 {
			t.Fatal("当前装载的那首的缓存不能删")
		}
		if _, err := os.Stat(filepath.Join(dir, "BVcurrent.m4a")); err != nil {
			t.Fatal("当前曲目的缓存必须还在")
		}
	})

	t.Run("磁盘压力条款：超过预算时门槛降到 1 天", func(t *testing.T) {
		store, dir := cleanupTestStore(t, map[string]time.Time{
			"BVday.m4a":  start.Add(-48 * time.Hour), // 闲置 2 天：常规门槛(7天)下留着，压力条款下可删
			"BVhour.m4a": start.Add(-2 * time.Hour),  // 闲置 2 小时：压力条款也不删
		})
		h := newCleanupHarness(t, store, start)
		h.cleanup.deps.budget = 1 // 任何体积都超预算
		h.advance(10 * time.Minute)
		rep := h.cleanup.Tick()
		if rep.Deleted != 1 {
			t.Fatalf("压力条款下应当只删闲置 1 天以上的那个，实际 %d", rep.Deleted)
		}
		if _, err := os.Stat(filepath.Join(dir, "BVhour.m4a")); err != nil {
			t.Fatal("闲置不足 1 天的必须留着（压力再大也不删刚听过的）")
		}
		if _, err := os.Stat(filepath.Join(dir, "BVday.m4a")); !os.IsNotExist(err) {
			t.Fatal("闲置超过 1 天且无人引用的应当被回收")
		}
	})
}

// runNow 是「用户主动点清理」的路径：不受空闲判据约束，但引用与闲置判据照旧。
func TestCleanupRunNowIgnoresIdleGates(t *testing.T) {
	start := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	store, dir := cleanupTestStore(t, map[string]time.Time{
		"BVold.m4a":  start.Add(-30 * 24 * time.Hour),
		"BVref.m4a":  start.Add(-30 * 24 * time.Hour),
		"BVnew.m4a":  start.Add(-time.Hour),
		"BVnew2.m4a": start.Add(-time.Hour),
	})
	h := newCleanupHarness(t, store, start)
	h.playing = true // 刚有音频活动：空闲判据会拦住 Tick，但不该拦住用户主动清理
	h.refs[onlineSongID("BVref")] = true

	rep := h.cleanup.runNow(cleanupMinIdleAge)
	if rep.Deleted != 1 {
		t.Fatalf("主动清理应当只删又旧又没被引用的那个，实际 %d", rep.Deleted)
	}
	if _, err := os.Stat(filepath.Join(dir, "BVref.m4a")); err != nil {
		t.Fatal("被引用的不能删（主动清理也不例外）")
	}
	if _, err := os.Stat(filepath.Join(dir, "BVnew.m4a")); err != nil {
		t.Fatal("还新鲜的不能删（主动清理也不删用户刚听过的）")
	}
}

// 半成品（下载中断留下的 .part / 旧式随机名）不该进清理名单：
// 它们由缓存自身的 LRU 与写入路径负责，清理只管成品。
func TestCleanupListIgnoresPartialFiles(t *testing.T) {
	start := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	store, dir := cleanupTestStore(t, map[string]time.Time{
		"BVok.m4a":        start.Add(-30 * 24 * time.Hour),
		"BVhalf.m4a.part": start.Add(-30 * 24 * time.Hour),
		"random.txt":      start.Add(-30 * 24 * time.Hour),
	})
	h := newCleanupHarness(t, store, start)
	h.advance(10 * time.Minute)
	rep := h.cleanup.Tick()
	if rep.Scanned != 1 || rep.Deleted != 1 {
		t.Fatalf("只该看到并删掉那个成品，实际 scanned=%d deleted=%d", rep.Scanned, rep.Deleted)
	}
	for _, keep := range []string{"BVhalf.m4a.part", "random.txt"} {
		if _, err := os.Stat(filepath.Join(dir, keep)); err != nil {
			t.Fatalf("%s 不该被空闲清理碰：%v", keep, err)
		}
	}
}

// 并发安全：Tick 会在后台 goroutine 里跑，而用户可能同时在播放/写缓存。
// 这里只钉「同时 Tick 不 panic、不重复删同一个文件」（-race 下会暴露数据竞争）。
func TestCleanupTickIsConcurrencySafe(t *testing.T) {
	start := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	store, _ := cleanupTestStore(t, map[string]time.Time{
		"BVa.m4a": start.Add(-30 * 24 * time.Hour),
		"BVb.m4a": start.Add(-30 * 24 * time.Hour),
	})
	h := newCleanupHarness(t, store, start)
	h.advance(10 * time.Minute)

	done := make(chan struct{})
	for i := 0; i < 4; i++ {
		go func() {
			defer func() { done <- struct{}{} }()
			h.cleanup.Tick()
		}()
	}
	for i := 0; i < 4; i++ {
		<-done
	}
	if _, bytes := store.Stats(); bytes != 0 {
		t.Fatalf("四个并发 Tick 应当把两个陈旧缓存都删掉，实际剩 %d 字节", bytes)
	}
}

// Start/Stop 必须能在没有缓存目录、也没被 Start 过的情况下安全收尾
// （装配失败、窗口没起来就退出的路径）。
func TestCleanupStartStopWithoutStore(t *testing.T) {
	c := newOnlineCacheCleanup(onlineCleanupDeps{})
	c.Start() // store 为 nil → 不起 goroutine
	c.Stop()  // 没起过也必须不阻塞
	var nilCleanup *onlineCacheCleanup
	nilCleanup.Start()
	nilCleanup.Stop()
}

// 检查间隔必须**明显短于**空闲门槛。
//
// 为什么值得单独钉住：这两个计时器起点不同 —— lastActive 在构造时起算，
// ticker 在 Start 时才起算，于是「启动后第一跳」几乎正好落在「空闲满 5 分钟」
// 那一刻。判据是 `now.Sub(lastActive) < cleanupIdleAfter` 才跳过，差几毫秒
// 就跳过这一跳，而下一跳要等一整个间隔。历史上间隔就是 5 分钟，
// 实测出现「应用空闲 9 分钟、缓存一个字节都没回收」（那一跳被边界吃掉，
// 下一跳已经超出观察窗口）。
//
// 这条不变量保证：最坏情况下「空闲门槛到了却没过判据」只会多等 1 分钟。
func TestCleanupTickLeavesMarginBelowIdleThreshold(t *testing.T) {
	if cleanupTickInterval >= cleanupIdleAfter {
		t.Fatalf("检查间隔 %s 不能 ≥ 空闲门槛 %s：判据边界会吃掉一整轮机会",
			cleanupTickInterval, cleanupIdleAfter)
	}
	if cleanupTickInterval > cleanupIdleAfter/3 {
		t.Fatalf("检查间隔 %s 相对空闲门槛 %s 太长：空闲后最坏要多等 %s",
			cleanupTickInterval, cleanupIdleAfter, cleanupTickInterval)
	}
	if cleanupTickInterval > cleanupStartupGrace {
		t.Fatalf("检查间隔 %s 比启动宽限期 %s 还长：宽限期结束后迟迟不检查",
			cleanupTickInterval, cleanupStartupGrace)
	}
	// 间隔再小也不能小到「每一跳都真的去扫目录」—— 那要靠 lastRun 节流。
	if cleanupThrottle <= cleanupTickInterval {
		t.Fatalf("节流 %s 必须大于检查间隔 %s，否则每一跳都在扫目录",
			cleanupThrottle, cleanupTickInterval)
	}
}

// 边界情形：空闲刚好卡在门槛上时**必须动手**（不能因为差几毫秒就跳过）。
//
// 上一条钉的是「间隔留了余量」；这一条钉「判据本身是 >= 就算空闲」，
// 免得将来有人把它改成 <= 或者加个莫名其妙的容差。
func TestCleanupTickAcceptsExactlyIdleThreshold(t *testing.T) {
	start := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	store, _ := cleanupTestStore(t, map[string]time.Time{
		"BVboundary.m4a": start.Add(-30 * 24 * time.Hour),
	})
	h := newCleanupHarness(t, store, start)
	// 宽限期已过，而空闲时长**正好**等于门槛（不多不少）
	h.advance(cleanupIdleAfter)
	if rep := h.cleanup.Tick(); rep.Deleted != 1 {
		t.Fatalf("空闲正好到达门槛时应当动手，实际 skipped=%q deleted=%d", rep.Skipped, rep.Deleted)
	}
}
