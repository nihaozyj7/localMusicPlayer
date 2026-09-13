package coverfetch

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"
)

// Resolved 一张「已经下载并通过体检」的封面。
//
// 为什么不直接给 Cover（只有 URL）：白图占位这件事只有在**拿到字节之后**
// 才能发现。把「挑候选 → 下载 → 校验」合成一步，调用方拿到的就一定是能显示的图。
type Resolved struct {
	Cover
	Image ImageData
	Info  ImageInfo
	// MIME 规范化后的类型（image/jpeg / image/png …）。
	MIME string
}

// Skipped 一个被丢弃的候选及原因（诊断/界面提示用）。
type Skipped struct {
	Cover  Cover
	Reason string
}

// resolveBudget 一次 ResolveAll 最多下载几张图。
//
// 为什么要限量：校验必须下载，而下载是有成本的（每张几十~几百 KB）。
// 取前 8 张已经足够覆盖「前面几张是白图」的情况，又不会让一次搜索等太久。
const resolveBudget = 8

// Resolve 找到并下载**第一张通过体检**的封面。
//
// 与 Find 的区别：Find 只挑 URL（快，适合「先给个地址再去取」的场景），
// Resolve 会把候选按分数从高到低逐个下载校验，跳过
// 「下载失败 / 打不开 / 纯白占位图 / 尺寸过小」的候选。
// 这就是「封面永远是一张白图」的正面修法：白图不再算命中。
func (a *Aggregator) Resolve(ctx context.Context, req Request) (Resolved, error) {
	list, _, err := a.ResolveAll(ctx, req)
	if err != nil {
		return Resolved{}, err
	}
	return list[0], nil
}

// ResolveAll 下载并校验最多 resolveBudget 个候选，返回可用的那些（按可信度降序）
// 以及被丢弃的候选与原因。
//
// 返回的可用列表可能为空（全部候选都是白图/打不开）—— 此时第二个返回值里
// 会有原因，调用方可以据此给出「找到的都是空白图」这种更准确的提示。
func (a *Aggregator) ResolveAll(ctx context.Context, req Request) ([]Resolved, []Skipped, error) {
	req = req.Normalize()
	if req.Empty() {
		return nil, nil, ErrNotFound
	}

	candidates, err := a.FindAll(ctx, req)
	if err != nil || len(candidates) == 0 {
		// FindAll 里已经把 FallbackURL 拼进来了；实在没有候选就如实返回
		if err != nil && !errors.Is(err, ErrNotFound) {
			return nil, nil, err
		}
		return nil, nil, ErrNotFound
	}
	if len(candidates) > resolveBudget {
		candidates = candidates[:resolveBudget]
	}

	// 并发下载：候选之间互不依赖，串行下载 8 张会明显卡住界面。
	// 但**按分数顺序**返回，保证「第一个可用」就是最可信的那张。
	type outcome struct {
		idx  int
		res  Resolved
		skip Skipped
		ok   bool
	}

	perCtx, cancel := context.WithTimeout(ctx, a.totalOrDefault())
	defer cancel()

	results := make([]outcome, len(candidates))
	var wg sync.WaitGroup
	for i, c := range candidates {
		wg.Add(1)
		go func(i int, c Cover) {
			defer wg.Done()
			dctx, dcancel := context.WithTimeout(perCtx, a.perOrDefault()*2)
			defer dcancel()
			img, err := Download(dctx, c.URL)
			if err != nil {
				results[i] = outcome{idx: i, skip: Skipped{Cover: c, Reason: err.Error()}}
				return
			}
			info, err := InspectImage(img.Body)
			if err != nil {
				results[i] = outcome{idx: i, skip: Skipped{Cover: c, Reason: err.Error()}}
				return
			}
			results[i] = outcome{
				idx: i,
				ok:  true,
				res: Resolved{
					Cover: c,
					Image: img,
					Info:  info,
					MIME:  NormalizeMIME(img.ContentType, img.Body),
				},
			}
		}(i, c)
	}
	wg.Wait()

	good := make([]Resolved, 0, len(candidates))
	bad := make([]Skipped, 0, len(candidates))
	for _, r := range results {
		if r.ok {
			good = append(good, r.res)
		} else if r.skip.Cover.Valid() {
			bad = append(bad, r.skip)
		}
	}
	if len(good) == 0 {
		return nil, bad, ErrNotFound
	}
	return good, bad, nil
}

func (a *Aggregator) totalOrDefault() time.Duration {
	if a.Total > 0 {
		return a.Total
	}
	return DefaultTotalTimeout
}

func (a *Aggregator) perOrDefault() time.Duration {
	if a.PerProvider > 0 {
		return a.PerProvider
	}
	return DefaultPerProviderTimeout
}

// refererFor 给不同图床挑一个「不会被打回」的 Referer。
//
// 原来一律用图片自己的域名当 Referer，实测对部分站点（网易云 CDN、
// B 站图床）会被判成盗链 —— 轻则 403，重则返回一张占位图（就是白图）。
// 这些图床期待的是**站点首页**作为来源。
func refererFor(rawURL string) string {
	host := strings.ToLower(hostOf(rawURL))
	switch {
	case strings.HasSuffix(host, "126.net"), strings.HasSuffix(host, "music.163.com"):
		return "https://music.163.com/"
	case strings.HasSuffix(host, "hdslb.com"), strings.HasSuffix(host, "biliimg.com"), strings.HasSuffix(host, "bilivideo.com"):
		return "https://www.bilibili.com/"
	case strings.HasSuffix(host, "gtimg.com"), strings.HasSuffix(host, "y.qq.com"):
		return "https://y.qq.com/"
	case strings.HasSuffix(host, "mzstatic.com"):
		return "https://music.apple.com/"
	case strings.HasSuffix(host, "dzcdn.net"), strings.HasSuffix(host, "deezer.com"):
		return "https://www.deezer.com/"
	case strings.HasSuffix(host, "coverartarchive.org"), strings.HasSuffix(host, "archive.org"):
		return "https://musicbrainz.org/"
	default:
		return "https://" + host + "/"
	}
}
