// Package filter 实现音乐文件的过滤规则。
//
// 语义必须与前端 frontend/src/js/store.js#matchRules 完全一致，
// 否则预览界面与打包后的行为会不一致：
//
//  1. 只考虑 Enabled=true 的规则；
//  2. 任意 scope=exclude 的规则命中 → 立即排除（排除优先，短路返回）；
//  3. 若存在启用中的 scope=include 规则，则必须至少命中一条才保留；
//  4. regex 规则同时匹配「完整路径」与「文件名」，忽略大小写，使用 Go 正则语法；
//  5. 正则非法 → 该条规则视为失效（跳过），不影响其它规则。
package filter

import (
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"musicplayer/internal/bootstrap"
)

// regexCache 缓存编译好的正则；非法 pattern 缓存为 nil（不重复尝试编译）。
//
// 用「加锁的普通 map」而不是 sync.Map，是为了能给缓存**设上限**：
// key 是用户输入的正则源码，设置页的实时预览会为每次按键产生一个新 pattern，
// 而 sync.Map 没有任何淘汰 —— 以前每个敲过的 pattern 都会留到进程结束。
var (
	regexMu    sync.Mutex
	regexCache = map[string]*regexp.Regexp{}
)

// maxRegexCacheEntries 正则缓存上限。规则数量本身是个位数，256 足以覆盖
// 「编辑中反复试错」；超限时整体清空（重建代价 = 每条规则重新编译一次）。
const maxRegexCacheEntries = 256

// compiled 编译并缓存正则；非法时缓存 nil
func compiled(pattern string) *regexp.Regexp {
	regexMu.Lock()
	defer regexMu.Unlock()

	if re, ok := regexCache[pattern]; ok {
		return re
	}
	if len(regexCache) >= maxRegexCacheEntries {
		regexCache = map[string]*regexp.Regexp{}
	}
	re, err := regexp.Compile("(?i)" + pattern)
	if err != nil {
		// 前端用 JS 正则，Go 语法略有差异；尝试去掉常见的不兼容写法再编译一次
		re2, err2 := regexp.Compile("(?i)" + strings.ReplaceAll(pattern, `\/`, `/`))
		if err2 != nil {
			regexCache[pattern] = nil
			return nil
		}
		re = re2
	}
	// *regexp.Regexp 可安全并发使用，因此解锁后调用方继续持有它没有问题
	regexCache[pattern] = re
	return re
}

// normalizeSize 把「数值 + 单位」换算为字节；非法返回 -1
func normalizeSize(value, unit string) int64 {
	cleaned := strings.Map(func(r rune) rune {
		if (r >= '0' && r <= '9') || r == '.' || r == '-' || r == '+' {
			return r
		}
		return -1
	}, value)
	if cleaned == "" {
		return -1
	}
	n, err := strconv.ParseFloat(cleaned, 64)
	if err != nil {
		return -1
	}
	switch strings.ToUpper(strings.TrimSpace(unit)) {
	case "KB":
		return int64(n * 1024)
	case "MB":
		return int64(n * 1024 * 1024)
	case "GB":
		return int64(n * 1024 * 1024 * 1024)
	default:
		return int64(n)
	}
}

func sizeMatch(op string, actual, threshold int64) bool {
	switch op {
	case "lt":
		return actual < threshold
	case "lte":
		return actual <= threshold
	case "gt":
		return actual > threshold
	case "gte":
		return actual >= threshold
	case "eq":
		return actual == threshold
	default:
		return actual < threshold // 缺省与前端一致：小于
	}
}

// compiledRule 是一条规则「编译后」的形态：字节阈值与正则只算一次。
//
// 为什么需要它：normalizeSize 每次都要做 strings.Map + strconv.ParseFloat，
// compiled() 每次都要查一次缓存 —— 而 Match 是**按曲目**调用的。
// 10 万首 × 1 条 size 规则 = 10 万次多余的解析。
type compiledRule struct {
	rule  bootstrap.FilterRule
	re    *regexp.Regexp
	bytes int64
}

// compileRules 把规则列表编译成可复用的形态（只保留启用中的规则）
func compileRules(rules []bootstrap.FilterRule) []compiledRule {
	out := make([]compiledRule, 0, len(rules))
	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		c := compiledRule{rule: rule}
		switch rule.Type {
		case "size":
			c.bytes = normalizeSize(rule.Value, rule.Unit)
		case "regex":
			c.re = compiled(rule.Value)
		}
		out = append(out, c)
	}
	return out
}

// matchCompiled 用已编译的规则判断单个文件。语义与旧实现完全一致：
//   - exclude 命中即短路排除（优先）；
//   - 存在启用中的 include 规则时，必须命中至少一条才保留。
func matchCompiled(path string, size int64, rules []compiledRule) (bool, string) {
	hasInclude := false
	for _, c := range rules {
		if c.rule.Scope == "include" {
			hasInclude = true
			break
		}
	}
	fileName := filepath.Base(path)
	hitInclude := false

	for _, c := range rules {
		hit := false
		switch c.rule.Type {
		case "size":
			if c.bytes < 0 {
				continue
			}
			hit = sizeMatch(c.rule.Op, size, c.bytes)
		case "regex":
			if c.re == nil {
				continue
			}
			hit = c.re.MatchString(path) || c.re.MatchString(fileName)
		default:
			continue
		}

		if !hit {
			continue
		}

		if c.rule.Scope == "include" {
			hitInclude = true
			continue
		}
		// 排除优先：命中即短路
		return true, c.rule.ID
	}

	if hasInclude && !hitInclude {
		return true, "include-miss"
	}
	return false, ""
}

// Match 判断单个文件是否被规则过滤。
// 返回 (是否排除, 命中的规则 id 或原因)
//
// 注意：批量判断请用 Apply —— 这里每次调用都会重新编译一遍规则。
func Match(path string, size int64, rules []bootstrap.FilterRule) (bool, string) {
	return matchCompiled(path, size, compileRules(rules))
}

// Result 过滤统计
type Result struct {
	Kept     []bootstrap.Song
	Excluded int
	Total    int
}

// Apply 对一批歌曲应用规则（规则只编译一次，然后逐曲复用）
func Apply(songs []bootstrap.Song, rules []bootstrap.FilterRule) Result {
	compiledRules := compileRules(rules)
	res := Result{Kept: make([]bootstrap.Song, 0, len(songs)), Total: len(songs)}
	for _, s := range songs {
		if excluded, _ := matchCompiled(s.Path, s.Size, compiledRules); excluded {
			res.Excluded++
			continue
		}
		res.Kept = append(res.Kept, s)
	}
	return res
}

// InvalidRegexRules 返回正则非法的规则 id（用于设置界面提示）
func InvalidRegexRules(rules []bootstrap.FilterRule) []string {
	out := []string{}
	for _, r := range rules {
		if r.Type != "regex" || strings.TrimSpace(r.Value) == "" {
			continue
		}
		if compiled(r.Value) == nil {
			out = append(out, r.ID)
		}
	}
	return out
}
