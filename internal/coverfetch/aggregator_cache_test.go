package coverfetch

import (
	"strconv"
	"testing"
	"time"
)

// 修复前 setCache 在超过容量时会整体清空 a.cache（a.cache = map[string]cacheEntry{}），
// 把**所有**已写入的有效条目一起丢掉；修复后只淘汰最旧的若干条。
//
// 断言「早期写入的条目在跨过容量上限后仍然存在」才能区分这两种行为：
// 只断言「最后写入的 key 还在」是没有区分度的 —— 整体清空发生在写入**之前**，
// 最后那一条无论哪种实现都必然在缓存里（这个测试的第一版就踩了这个坑，
// 用旧实现跑同样 PASS）。
//
// ★ 这里必须让写入量**刚过**容量上限，才能观察到差异。
// 如果写到远超上限（原版是 maxCacheEntries+200，共 712 次写入），
// 会发生 4 轮淘汰、每轮删掉最旧的 evictBatch(64) 条，早期条目**本来就该**
// 被全部淘汰 —— 那是正确的「按年龄淘汰」，不是「整体清空」。
// 也就是说：原版测试的写入规模把「正确行为」也算成了失败，
// 它能通过只是因为 cacheTestKey 生成的键大量重复、
// 实际条目数远少于写入次数（详见该函数的注释）。
func TestSetCacheKeepsOlderEntriesInsteadOfWiping(t *testing.T) {
	a := New()

	// 先写少量「早期」条目（远少于一次淘汰批量），
	// 再把总量推到刚好超过上限：这批早期条目还远不该被淘汰。
	const early = 8
	for i := 0; i < early; i++ {
		a.setCache(cacheTestKey(i), Cover{URL: "u", Score: 1}, true)
	}

	// 推到「刚好跨过上限」：只触发一次淘汰（一次删 64 条）。
	// 8 + 505 = 513 > 512 → 触发且仅触发一轮。
	for i := early; i < maxCacheEntries+1; i++ {
		a.setCache(cacheTestKey(i), Cover{URL: "u", Score: 1}, true)
	}

	// 早期条目在最旧的一批里，会被这一轮淘汰删掉；但关键是
	// **不该只剩最后一条** —— 一次淘汰 64 条，缓存里应当仍有约 449 条。
	survived := 0
	for i := 0; i < early; i++ {
		if _, ok := a.getCache(cacheTestKey(i)); ok {
			survived++
		}
	}

	a.mu.Lock()
	n := len(a.cache)
	a.mu.Unlock()

	// 整体清空实现的表现是 n 变成 1（只剩刚写的那条）；
	// 正确实现应当保留几百条。
	if n <= 1 {
		t.Fatalf("缓存被整体清空：只剩 %d 条（早期条目存活 %d/%d）", n, survived, early)
	}
	if n > maxCacheEntries {
		t.Fatalf("缓存超过上限：%d > %d", n, maxCacheEntries)
	}
	// 淘汰只该删掉最旧的一批，不该把绝大多数条目都删掉
	if n < maxCacheEntries-evictBatch-1 {
		t.Fatalf("淘汰过多：剩 %d 条，一轮只该删 %d 条", n, evictBatch)
	}
}

func TestEvictPrefersExpiredEntries(t *testing.T) {
	a := New()
	stale := time.Now().Add(-cacheTTL - time.Hour)

	a.mu.Lock()
	for i := 0; i < maxCacheEntries; i++ {
		a.cache[cacheTestKey(i)] = cacheEntry{cover: Cover{URL: "old"}, found: true, at: stale}
	}
	a.mu.Unlock()

	a.setCache("fresh-key", Cover{URL: "new"}, true)

	if _, ok := a.getCache("fresh-key"); !ok {
		t.Fatal("新写入的条目不应被自己触发的淘汰删掉")
	}
	a.mu.Lock()
	remaining := len(a.cache)
	a.mu.Unlock()
	if remaining > evictBatch+1 {
		t.Fatalf("过期条目没有被优先淘汰：剩余 %d 条", remaining)
	}
}

// cacheTestKey 生成第 i 个测试用的缓存键。
//
// 原实现是 `"key-" + string(rune('a'+i%26)) + "-" + string(rune(i))`，
// 有两个问题：
//  1. string(rune(i)) 对 i<32 产生的是**控制字符**，i 更大时也不是人类可读的；
//  2. 更致命的是它**不保证唯一** —— 早期 i（0..99）与后续 i 会撞到同一个键，
//     于是「写入 N 个不同条目」的测试前提根本不成立，淘汰断言随机成败。
//
// 改成 strconv.Itoa 之后每个 i 对应唯一且可读的键。
func cacheTestKey(i int) string {
	return "key-" + strconv.Itoa(i)
}
