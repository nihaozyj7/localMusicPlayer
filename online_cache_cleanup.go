/* ==========================================================================
   online_cache_cleanup.go — 试听缓存的空闲清理
   --------------------------------------------------------------------------
   需求（用户原话）：「在线歌曲的缓存定期清理，对于没有被播放列表和歌单引用的
   歌曲，在空闲时间可能会触发清理，这个空闲时间你好好设计一下」。

   # 清什么

   只清**试听缓存**（`%TEMP%\LocalMusicPlayer\online\` 里的派生数据），
   绝不动下载目录里的用户文件（那是 internal/onlinesource 台账里
   Kind=download 记的东西，属于用户）。

   一次清理要同时满足三个条件才会删一个文件：
     ① 没有被引用（歌单 / 「我喜欢」/ 播放队列 / 正在播放的那首）；
     ② 闲置够久（默认 7 天没被重新下载过）；
     ③ 磁盘压力条款：缓存超过预算时，闲置门槛降到 1 天并清到预算以内。

   # 为什么是「闲置够久」而不是「没被引用就删」

   没被引用只说明「此刻不在任何歌单/队列里」，而用户完全可能过十分钟
   再点开同一首。缓存是可再生的派生数据，但重新下载要花用户的时间与流量，
   所以判据要偏保守：**先让 LRU 预算（512MB，写缓存时生效）兜住体积，
   空闲清理只负责剪长期没人碰的那条长尾**。

   # 空闲怎么判定（六个条件同时成立）

     1. **连续 5 分钟没有音频活动**（没有在播；且上次在播结束已超过 5 分钟）。
        这是最强的一条：用户在听歌时清理磁盘，只会给正在播放的这首添堵。
     2. **没有正在进行的下载**（DownloadService 的 running 集合为空）。
     3. **在线链路不忙**（没有在解析直链 / 写缓存 / 代理转发：OnlineService.Busy）。
     4. **启动满 3 分钟**（启动期在扫库、算响度、解包 ffmpeg，别凑热闹）。
     5. **距上次清理满 30 分钟**（节流：清理不是越勤越好）。
     6. **每次有上限**（默认一次最多 64 个文件 / 128MB）——
        空闲不等于可以长时间占磁盘；剩下的下一轮再说。

   检查间隔 1 分钟（`cleanupTickInterval`）。也就是说：用户停止操作 5 分钟后，
   最迟 1 分钟内的某一跳会真正动手，并且一次只动一小批。

   # 为什么要把「播放队列」从前端推过来

   歌单与「我喜欢」在后端配置里（`bootstrap.Config.Playlists/LikedIDs`），
   播放队列却在**前端**（`state.queue`，随快照写 localStorage），后端读不到。
   所以前端在队列变化时把在线 id 推给 `OnlineService.ProtectIDs`
   （见 frontend/src/js/online-cache.js），清理据此把队列里的歌排除在外。
   ========================================================================== */

package main

import (
	"log"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"localmusicplayer/internal/onlinecache"
)

/* --------------------------------------------------------------------------
   参数（都是「量出来的经验值」，不是随手写的）
   -------------------------------------------------------------------------- */

const (
	// cleanupTickInterval 是检查间隔。清理本身很轻（一次判据 + 偶尔读一次目录），
	// 所以这里刻意取**远小于**空闲门槛的 1 分钟。
	//
	// ★ 为什么不是 5 分钟（曾经就是 5 分钟，结果是「空闲了却一整轮不清理」）：
	// 两个计时器不是同一个起点 —— lastActive 在构造时起算，ticker 在 Start 时才起算，
	// 于是「启动后第一跳」与「空闲满 5 分钟」几乎同时到达。判据是严格小于才跳过
	// （`now.Sub(lastActive) < cleanupIdleAfter`），差几毫秒就会跳过这一跳，
	// 而下一跳要再等一整个间隔。实测过一次：应用空闲 9 分钟，缓存一个字节都没回收。
	// 间隔取 1 分钟之后，最坏情况也只是多等 1 分钟。
	// 不变量由 online_cache_cleanup_test.go 的 TestCleanupTickLeavesMargin 守住。
	cleanupTickInterval = 1 * time.Minute

	// cleanupIdleAfter 是「多久没有音频活动才算空闲」。
	//
	// 5 分钟的选择依据：一首歌的长度量级是 3~5 分钟 —— 5 分钟没有声音，
	// 基本可以断定用户不是在听歌（暂停超过 5 分钟、或者干脆走开了）。
	// 更短会在「暂停一下去倒水」时动手，更长则让「关掉声音去干别的」
	// 这种最常见的空闲场景等太久。
	cleanupIdleAfter = 5 * time.Minute

	// cleanupStartupGrace 是启动后的宽限期（避开扫库/解包/首屏那一阵子）。
	cleanupStartupGrace = 3 * time.Minute

	// cleanupThrottle 是两次清理之间的最小间隔。
	cleanupThrottle = 30 * time.Minute

	// cleanupMinIdleAge 是常规情况下的「闲置多久才允许删」。
	//
	// 7 天：一周没被重新下载过、又不在任何歌单/队列里，才是真正的长尾。
	// 这个门槛偏保守是刻意的 —— 删错了，用户要重新下载一遍（时间 + 流量）。
	cleanupMinIdleAge = 7 * 24 * time.Hour

	// cleanupPressureIdleAge 是磁盘压力条款下的门槛（缓存超过预算时）。
	//
	// 1 天：超过 512MB 预算说明缓存确实堆起来了，此时把「闲置 1 天以上且
	// 没被引用」的清掉，把体积拉回预算以内。仍然比「立刻删」保守得多。
	cleanupPressureIdleAge = 24 * time.Hour

	// cleanupMaxFilesPerRun / cleanupMaxBytesPerRun 是单次上限。
	//
	// 空闲清理发生在用户不用播放器的时候 —— 但那不等于磁盘可以长时间被打满：
	// 后台更新、索引器、杀软扫描都在抢 IO。一次只回收一小批，剩下的下一轮继续。
	cleanupMaxFilesPerRun = 64
	cleanupMaxBytesPerRun = 128 << 20 // 128MB
)

/* --------------------------------------------------------------------------
   决策：纯函数，输入全是快照
   -------------------------------------------------------------------------- */

// cleanupOptions 是一次清理的判据（全部显式传入，便于测试钉住边界）。
type cleanupOptions struct {
	// Now 是判定用的当前时刻。
	Now time.Time
	// MinAge 是「闲置多久才允许删」。
	MinAge time.Duration
	// Referenced 是此刻不能被清理的在线歌曲 id（`bili:<bvid>`）。
	Referenced map[string]bool
	// MaxFiles / MaxBytes 是单次上限（<=0 表示不限制）。
	MaxFiles int
	MaxBytes int64
}

// cleanupPlan 选出这次要删的缓存条目（**不删**，只给名单）。
//
// 返回的顺序是最旧的优先：调用方按顺序删到上限为止，于是「先回收最没用的」。
// 认不出 bvid 的名字（理论上不该有）一律跳过 —— 不确定的东西不删。
func cleanupPlan(entries []onlinecache.Entry, opts cleanupOptions) []onlinecache.Entry {
	candidates := make([]onlinecache.Entry, 0, len(entries))
	for _, e := range entries {
		if e.BVID == "" {
			continue
		}
		if opts.Referenced[onlineSongID(e.BVID)] {
			continue // 被歌单 / 喜欢 / 队列 / 正在播放引用
		}
		if opts.Now.Sub(e.ModTime) < opts.MinAge {
			continue // 还新鲜：用户可能马上就听
		}
		candidates = append(candidates, e)
	}

	// 最旧的先删
	sort.Slice(candidates, func(i, j int) bool {
		if !candidates[i].ModTime.Equal(candidates[j].ModTime) {
			return candidates[i].ModTime.Before(candidates[j].ModTime)
		}
		return candidates[i].Name < candidates[j].Name // 同一时刻按名字定序，结果可复现
	})

	if opts.MaxFiles > 0 && len(candidates) > opts.MaxFiles {
		candidates = candidates[:opts.MaxFiles]
	}
	if opts.MaxBytes > 0 {
		var total int64
		cut := len(candidates)
		for i, e := range candidates {
			total += e.Size
			if total > opts.MaxBytes {
				cut = i
				break
			}
		}
		candidates = candidates[:cut]
	}
	return candidates
}

/* --------------------------------------------------------------------------
   执行：清理器
   -------------------------------------------------------------------------- */

// cleanupReport 是一次清理的结果（日志 / 诊断用）。
type cleanupReport struct {
	// Scanned / Referenced / Fresh / Deleted 是分类计数。
	Scanned    int `json:"scanned"`
	Referenced int `json:"referenced"`
	Fresh      int `json:"fresh"`
	Deleted    int `json:"deleted"`
	// Bytes 是这次回收的字节数。
	Bytes int64 `json:"bytes"`
	// Total / TotalBytes 是清理后缓存目录的规模。
	Total      int   `json:"total"`
	TotalBytes int64 `json:"totalBytes"`
	// Skipped 说明这次为什么没动手（空串表示动手了）。
	Skipped string `json:"skipped"`
	// At 是这次清理的时刻（毫秒）。
	At int64 `json:"at"`
}

// onlineCleanupDeps 是清理器的外部依赖（全部注入，便于测试替换）。
type onlineCleanupDeps struct {
	// store 是试听缓存（唯一会被删东西的地方）。
	store *onlinecache.Store
	// referenced 返回此刻被引用的在线 id 集合。
	referenced func() map[string]bool
	// playerState 返回当前装载的歌曲 id 与是否正在出声。
	playerState func() (songID string, playing bool)
	// busy 报告是否还有下载/在线请求在进行。
	busy func() bool
	// now 返回当前时间（测试注入固定时钟）。
	now func() time.Time
	// budget 是缓存预算（超过它才启用磁盘压力条款）。
	budget int64
}

// onlineCacheCleanup 是空闲清理器。
type onlineCacheCleanup struct {
	deps onlineCleanupDeps

	// lastActive 是「上一次音频活动」的时刻：在播时每跳刷新，
	// 停止播放后它就成为空闲计时的起点。
	lastActive time.Time
	// lastRun 是上一次真正清理的时刻（节流用）。
	lastRun time.Time
	// started 是启动时刻（宽限期用）。
	started time.Time

	stopCh chan struct{}
	doneCh chan struct{}
	// loopStarted 记录后台循环是否真的起过。
	//
	// ★ 为什么必须有这个标记：缓存目录不可用（或 deps 不全）时 Start 会直接返回，
	// 而 Stop 若无条件等 doneCh，就永远等不到 —— 退出流程会**死锁**在关窗那一刻。
	// 这个 bug 是被 TestCleanupStartStopWithoutStore 抓出来的（它超时 600 秒）。
	loopStarted atomic.Bool
	stopOnce    sync.Once

	// mu 保护 lastActive / lastRun：后台循环与「用户主动清理」会同时改它们。
	mu sync.Mutex
}

func newOnlineCacheCleanup(deps onlineCleanupDeps) *onlineCacheCleanup {
	if deps.now == nil {
		deps.now = time.Now
	}
	if deps.budget <= 0 {
		deps.budget = onlinecache.BudgetBytes()
	}
	now := deps.now()
	return &onlineCacheCleanup{
		deps:    deps,
		started: now,
		// lastActive 从「启动时刻」起算：启动后没有任何播放，也算空闲计时的一部分。
		lastActive: now,
		stopCh:     make(chan struct{}),
		doneCh:     make(chan struct{}),
	}
}

// Start 启动后台循环（幂等：重复调用只有第一次生效）。
func (c *onlineCacheCleanup) Start() {
	if c == nil || c.store() == nil {
		return
	}
	if !c.loopStarted.CompareAndSwap(false, true) {
		return
	}
	go c.loop()
}

// Stop 停止后台循环并等待退出（幂等，且「从没启动过」也能安全调用）。
func (c *onlineCacheCleanup) Stop() {
	if c == nil {
		return
	}
	c.stopOnce.Do(func() { close(c.stopCh) })
	if c.loopStarted.Load() {
		<-c.doneCh // 已经关掉的话这里是立刻返回的（channel 已关闭）
	}
}

func (c *onlineCacheCleanup) store() *onlinecache.Store { return c.deps.store }

// playerState 报告当前装载的歌曲与是否正在出声（依赖缺失时按「什么都没放」处理）。
func (c *onlineCacheCleanup) playerState() (string, bool) {
	if c.deps.playerState == nil {
		return "", false
	}
	return c.deps.playerState()
}

func (c *onlineCacheCleanup) loop() {
	defer close(c.doneCh)
	ticker := time.NewTicker(cleanupTickInterval)
	defer ticker.Stop()
	for {
		select {
		case <-c.stopCh:
			return
		case <-ticker.C:
			c.Tick()
		}
	}
}

// Tick 走一次判据并（可能）清理一轮。
//
// 独立成方法是为了能直接测它：不测 ticker，只测「这一跳该不该动手」。
//
// ★ 为什么要加锁：Tick 跑在后台循环里，而「用户主动清理」（OnlineService.
// CleanupCache → runNow）跑在 Wails 的调用线程上 —— 两者会同时改 lastActive /
// lastRun。这个竞态是被 `go test -race -run TestCleanupTickIsConcurrencySafe`
// 抓出来的（真实存在的路径，不是测试造出来的）。
func (c *onlineCacheCleanup) Tick() cleanupReport {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.tickLocked()
}

func (c *onlineCacheCleanup) tickLocked() cleanupReport {
	now := c.deps.now()

	// 在播 → 刷新活动时刻，并且这一跳一定不动手。
	if songID, playing := c.playerState(); playing {
		c.lastActive = now
		_ = songID
		return cleanupReport{At: now.UnixMilli(), Skipped: "正在播放"}
	}

	// 正在播放/已装载的那首永远保护（即使暂停着）—— 用户点一下继续就能听，
	// 此时删掉缓存会让「继续播放」变成一次完整的重新下载。
	protected := map[string]bool{}
	if songID, _ := c.playerState(); songID != "" {
		protected[songID] = true
	}

	referenced := map[string]bool{}
	if c.deps.referenced != nil {
		for id := range c.deps.referenced() {
			referenced[id] = true
		}
	}
	for id := range protected {
		referenced[id] = true
	}

	switch {
	case now.Sub(c.started) < cleanupStartupGrace:
		return cleanupReport{At: now.UnixMilli(), Skipped: "启动宽限期内"}
	case now.Sub(c.lastActive) < cleanupIdleAfter:
		return cleanupReport{At: now.UnixMilli(), Skipped: "刚有音频活动"}
	case c.deps.busy != nil && c.deps.busy():
		return cleanupReport{At: now.UnixMilli(), Skipped: "下载或在线请求进行中"}
	case !c.lastRun.IsZero() && now.Sub(c.lastRun) < cleanupThrottle:
		return cleanupReport{At: now.UnixMilli(), Skipped: "距上次清理不足 30 分钟"}
	}

	entries := c.store().List()
	minAge := cleanupMinIdleAge
	total := int64(0)
	for _, e := range entries {
		total += e.Size
	}
	// 磁盘压力条款：超过预算才把门槛降到 1 天（见文件头的说明）。
	if total > c.deps.budget {
		minAge = cleanupPressureIdleAge
	}

	plan := cleanupPlan(entries, cleanupOptions{
		Now:        now,
		MinAge:     minAge,
		Referenced: referenced,
		MaxFiles:   cleanupMaxFilesPerRun,
		MaxBytes:   cleanupMaxBytesPerRun,
	})

	report := cleanupReport{At: now.UnixMilli(), Scanned: len(entries)}
	for _, e := range entries {
		switch {
		case referenced[onlineSongID(e.BVID)]:
			report.Referenced++
		case now.Sub(e.ModTime) < minAge:
			report.Fresh++
		}
	}

	// 这一轮确实动手了（无论删了几个）都要记节流时刻：否则「计划为空」
	// 会让每一跳都重扫一遍目录。
	c.lastRun = now

	for _, e := range plan {
		if err := c.store().RemoveName(e.Name); err != nil {
			log.Printf("[online] 空闲清理：删除 %s 失败（下一轮再试）: %v", e.Name, err)
			continue
		}
		report.Deleted++
		report.Bytes += e.Size
	}
	if report.Deleted > 0 {
		log.Printf("[online] 空闲清理：删除 %d 个试听缓存（回收 %.1f MB，闲置门槛 %s）",
			report.Deleted, float64(report.Bytes)/(1<<20), minAge)
	}

	// 清理后重新统计（设置界面显示的占用要跟着变）
	report.Total, report.TotalBytes = c.store().Stats()
	return report
}

// runNow 立即按判据清理一轮（忽略空闲判据里的时间门槛，只保留引用与闲置判据）。
//
// 设置界面/排查用：用户点「清理」时不该被「刚有音频活动」这类条件拦住。
// 与 Tick 共用同一把锁（见 Tick 的说明）。
func (c *onlineCacheCleanup) runNow(minAge time.Duration) cleanupReport {
	if c == nil || c.store() == nil {
		return cleanupReport{Skipped: "没有试听缓存"}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.runNowLocked(minAge)
}

// runAll 清掉**所有没被引用**的试听缓存（设置界面的「清理未引用缓存」按钮）。
//
// 与后台清理 / runNow 的两点区别，都是从「用户已经明确按下了按钮」推出来的：
//
//	· 闲置门槛为 0：判据只剩「有没有被引用」。后台那 7 天门槛是为了少让用户
//	  重下 —— 他可能过十分钟又来听同一首；而按下按钮意味着他此刻要的是空间。
//	· 单轮上限解除：64 个 / 128MB 是为了让后台清理不长时间占磁盘。手动清理
//	  只跑一次，清一半会让用户以为按钮失效，只能反复点。
//
// 引用保护照旧（歌单 / 「我喜欢」/ 播放队列 / 正在播放的那首）—— 需求原话是
// 「清理掉播放器中没有引用的缓存歌曲，比如还在播放列表的歌曲」。
func (c *onlineCacheCleanup) runAll() cleanupReport {
	if c == nil || c.store() == nil {
		return cleanupReport{Skipped: "没有试听缓存"}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.runLocked(0, 0, 0)
}

func (c *onlineCacheCleanup) runNowLocked(minAge time.Duration) cleanupReport {
	return c.runLocked(minAge, cleanupMaxFilesPerRun, cleanupMaxBytesPerRun)
}

// runLocked 是一次「立刻清理」的共用实现。
//
// maxFiles / maxBytes 为 0 表示不设上限（手动清理用）。分类计数（referenced /
// fresh）在这里补齐 —— 设置界面的回执要能说出「保留了几首还在歌单里的」，
// 而「保留了」比「删掉了几个」更能让用户确认按钮干对了事。
//
// 调用方必须已持有 c.mu。
func (c *onlineCacheCleanup) runLocked(minAge time.Duration, maxFiles int, maxBytes int64) cleanupReport {
	now := c.deps.now()
	referenced := map[string]bool{}
	if c.deps.referenced != nil {
		for id := range c.deps.referenced() {
			referenced[id] = true
		}
	}
	if songID, _ := c.playerState(); songID != "" {
		referenced[songID] = true
	}
	entries := c.store().List()
	plan := cleanupPlan(entries, cleanupOptions{
		Now:        now,
		MinAge:     minAge,
		Referenced: referenced,
		MaxFiles:   maxFiles,
		MaxBytes:   maxBytes,
	})
	report := cleanupReport{At: now.UnixMilli(), Scanned: len(entries)}
	for _, e := range entries {
		switch {
		case referenced[onlineSongID(e.BVID)]:
			report.Referenced++
		case now.Sub(e.ModTime) < minAge:
			report.Fresh++
		}
	}
	for _, e := range plan {
		if err := c.store().RemoveName(e.Name); err != nil {
			log.Printf("[online] 手动清理：删除 %s 失败: %v", e.Name, err)
			continue
		}
		report.Deleted++
		report.Bytes += e.Size
	}
	report.Total, report.TotalBytes = c.store().Stats()
	c.lastRun = now
	return report
}
