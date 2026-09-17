package coverfetch

import (
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
func TestSetCacheKeepsOlderEntriesInsteadOfWiping(t *testing.T) {
	a := New()

	const early = 100
	for i := 0; i < early; i++ {
		a.setCache(cacheTestKey(i), Cover{URL: "u", Score: 1}, true)
	}

	// 继续写到远超容量上限，触发淘汰。
	for i := early; i < maxCacheEntries+200; i++ {
		a.setCache(cacheTestKey(i), Cover{URL: "u", Score: 1}, true)
	}

	// 这些「早期但远未过期」的条目：整体清空实现会让它们全部消失。
	survived := 0
	for i := 0; i < early; i++ {
		if _, ok := a.getCache(cacheTestKey(i)); ok {
			survived++
		}
	}
	if survived == 0 {
		t.Fatalf("早期条目全部消失 —— 容量保护退回了「整体清空」")
	}

	a.mu.Lock()
	n := len(a.cache)
	a.mu.Unlock()
	if n > maxCacheEntries {
		t.Fatalf("缓存超过上限：%d > %d", n, maxCacheEntries)
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

func cacheTestKey(i int) string {
	return "key-" + string(rune('a'+i%26)) + "-" + time.Now().Format("") + string(rune(i))
}
