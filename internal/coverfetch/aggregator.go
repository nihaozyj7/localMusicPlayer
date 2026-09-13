package coverfetch

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"
)

// 默认参数。
const (
	// DefaultPerProviderTimeout 单个来源的查询超时。
	// 封面是「有更好、没有也能忍」的附加信息，不能让某个慢站点拖住界面。
	DefaultPerProviderTimeout = 6 * time.Second

	// DefaultTotalTimeout 一次 Find 的总超时。
	DefaultTotalTimeout = 9 * time.Second

	// cacheTTL 命中缓存的存活时间。封面基本不会变，长一点没关系。
	cacheTTL = 6 * time.Hour

	// negativeTTL 没查到时的缓存时间。避免同一首查不到的歌被反复重试拖慢界面。
	negativeTTL = 30 * time.Minute
)

// Aggregator 并发查询多个封面来源，并按可信度挑一张。
type Aggregator struct {
	providers []Provider
	// PerProvider 单来源超时（<=0 用默认值）。
	PerProvider time.Duration
	// Total 总超时（<=0 用默认值）。
	Total time.Duration

	// 熔断：某个来源连续失败若干次后，在一段时间内直接跳过它。
	//
	// 为什么需要：个别站点在特定网络下会「连得上但一直不响应」，
	// 每次查询都要白等一个单来源超时。熔断后它们不再拖慢整体。
	// 冷却结束后会自动再试一次（半开），站点恢复了就能重新参与。
	breakerThreshold int
	breakerCooldown  time.Duration

	mu      sync.Mutex
	cache   map[string]cacheEntry
	breaker map[string]*breakerState
}

// breakerState 单个来源的熔断状态。
type breakerState struct {
	fails    int
	openTill time.Time
}

// 熔断默认参数。
const (
	defaultBreakerThreshold = 2
	defaultBreakerCooldown  = 5 * time.Minute
)

type cacheEntry struct {
	cover Cover
	found bool
	at    time.Time
}

// New 创建聚合器；不传来源时使用内置的全部来源。
//
// 顺序即优先级：分数相同时排在前面的胜出。
// iTunes / 网易云是标准音乐库接口，封面形态最接近「专辑封面」；
// Deezer 与 MusicBrainz 作为补充（前者在大陆网络常超时，后者有 1req/s 限流）。
func New(providers ...Provider) *Aggregator {
	if len(providers) == 0 {
		providers = []Provider{
			NewITunes(),
			NewNetease(),
			NewDeezer(),
			NewMusicBrainz(),
		}
	}
	return &Aggregator{
		providers:        providers,
		PerProvider:      DefaultPerProviderTimeout,
		Total:            DefaultTotalTimeout,
		breakerThreshold: defaultBreakerThreshold,
		breakerCooldown:  defaultBreakerCooldown,
		cache:            map[string]cacheEntry{},
		breaker:          map[string]*breakerState{},
	}
}

// Providers 返回已注册的来源名称（用于设置界面「在线封面来源」展示）。
func (a *Aggregator) Providers() []string {
	out := make([]string, 0, len(a.providers))
	for _, p := range a.providers {
		out = append(out, p.Name())
	}
	return out
}

// Find 查询一首歌的封面。
//
// 找不到时返回 ErrNotFound（而不是各来源的错误堆），因为「没找到」是正常结果。
func (a *Aggregator) Find(ctx context.Context, req Request) (Cover, error) {
	req = req.Normalize()
	if req.Empty() {
		return Cover{}, ErrNotFound
	}

	key := cacheKey(req)
	if cover, ok := a.getCache(key); ok {
		if !cover.Valid() {
			return Cover{}, ErrNotFound
		}
		return cover, nil
	}

	total := a.Total
	if total <= 0 {
		total = DefaultTotalTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, total)
	defer cancel()

	per := a.PerProvider
	if per <= 0 {
		per = DefaultPerProviderTimeout
	}

	results := runProviders(ctx, a.activeProviders(), req, per)

	var best Cover
	found := false
	// 每个来源只让它最好的一张参与总排序：来源内部的候选差异
	// （第 1 条 vs 第 8 条搜索结果）远大于来源之间的差异。
	for _, out := range results {
		a.observe(out)
		for _, c := range candidateList(out.res) {
			if !c.Valid() {
				continue
			}
			if !found || c.Score > best.Score {
				best, found = c, true
			}
			break
		}
	}

	// 联网来源全都没命中时，退回到调用方给的候选地址
	// （例如在线歌曲搜索结果自带的视频封面 —— 至少不会是空白）。
	if !found && req.FallbackURL != "" && AllowedImageURL(req.FallbackURL) {
		best = Cover{URL: req.FallbackURL, Provider: "fallback", Score: -1}
		found = true
	}

	if !found {
		a.setCache(key, Cover{}, false)
		return Cover{}, ErrNotFound
	}
	a.setCache(key, best, true)
	return best, nil
}

// FindAll 返回所有来源的候选封面（按分数降序），供「换一张封面」这类功能使用。
func (a *Aggregator) FindAll(ctx context.Context, req Request) ([]Cover, error) {
	req = req.Normalize()
	if req.Empty() {
		return nil, ErrNotFound
	}
	total := a.Total
	if total <= 0 {
		total = DefaultTotalTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, total)
	defer cancel()

	results := runProviders(ctx, a.providers, req, a.PerProvider)

	var out []Cover
	for _, res := range results {
		out = append(out, candidateList(res.res)...)
	}
	if req.FallbackURL != "" && AllowedImageURL(req.FallbackURL) {
		out = append(out, Cover{URL: req.FallbackURL, Provider: "fallback", Score: -1})
	}
	out = dedupeCovers(out)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	if len(out) == 0 {
		return nil, ErrNotFound
	}
	return out, nil
}

// candidateList 把单来源结果摊平成候选列表（结果里可能只填了 Cover）。
func candidateList(res FindResult) []Cover {
	if len(res.Candidates) > 0 {
		return res.Candidates
	}
	if res.Cover.Valid() {
		return []Cover{res.Cover}
	}
	return nil
}

func (a *Aggregator) getCache(key string) (Cover, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	entry, ok := a.cache[key]
	if !ok {
		return Cover{}, false
	}
	ttl := cacheTTL
	if !entry.found {
		ttl = negativeTTL
	}
	if time.Since(entry.at) > ttl {
		delete(a.cache, key)
		return Cover{}, false
	}
	return entry.cover, true
}

func (a *Aggregator) setCache(key string, cover Cover, found bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	// 简单的容量保护：超过 512 条就整体丢弃重来（封面缓存不值得做 LRU）
	if len(a.cache) > 512 {
		a.cache = map[string]cacheEntry{}
	}
	a.cache[key] = cacheEntry{cover: cover, found: found, at: time.Now()}
}

// Invalidate 清空缓存（设置里改了来源或需要重新抓取时用）。
func (a *Aggregator) Invalidate() {
	a.mu.Lock()
	a.cache = map[string]cacheEntry{}
	a.mu.Unlock()
}

// cacheKey 生成缓存键：标题 + 歌手 + 专辑，全部小写去噪。
func cacheKey(req Request) string {
	parts := []string{
		normalizeText(req.Title),
		normalizeText(req.Artist),
		normalizeText(req.Album),
	}
	return strings.Join(parts, "|")
}

/* --------------------------------------------------------------------------
   熔断
   -------------------------------------------------------------------------- */

// activeProviders 返回当前未被熔断的来源。
func (a *Aggregator) activeProviders() []Provider {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make([]Provider, 0, len(a.providers))
	for _, p := range a.providers {
		if st, ok := a.breaker[p.Name()]; ok && time.Now().Before(st.openTill) {
			continue // 熔断中，跳过
		}
		out = append(out, p)
	}
	return out
}

// observe 记录一次查询结果，维护熔断计数。
func (a *Aggregator) observe(out indexedResult) {
	name := out.provider.Name()
	a.mu.Lock()
	defer a.mu.Unlock()
	st := a.breaker[name]
	if st == nil {
		st = &breakerState{}
		a.breaker[name] = st
	}
	if !out.failed {
		st.fails = 0
		st.openTill = time.Time{}
		return
	}
	st.fails++
	threshold := a.breakerThreshold
	if threshold <= 0 {
		threshold = defaultBreakerThreshold
	}
	if st.fails >= threshold {
		cooldown := a.breakerCooldown
		if cooldown <= 0 {
			cooldown = defaultBreakerCooldown
		}
		st.openTill = time.Now().Add(cooldown)
		st.fails = 0
	}
}

// BreakerStatus 返回各来源的熔断状态（诊断/设置界面展示用）。
func (a *Aggregator) BreakerStatus() map[string]bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make(map[string]bool, len(a.providers))
	now := time.Now()
	for _, p := range a.providers {
		if st, ok := a.breaker[p.Name()]; ok && now.Before(st.openTill) {
			out[p.Name()] = true
			continue
		}
		out[p.Name()] = false
	}
	return out
}
