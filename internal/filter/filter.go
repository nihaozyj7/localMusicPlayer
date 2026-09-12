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

var regexCache sync.Map // pattern -> *regexp.Regexp | nil

// compiled 编译并缓存正则；非法时缓存 nil
func compiled(pattern string) *regexp.Regexp {
	if v, ok := regexCache.Load(pattern); ok {
		if v == nil {
			return nil
		}
		return v.(*regexp.Regexp)
	}
	re, err := regexp.Compile("(?i)" + pattern)
	if err != nil {
		// 前端用 JS 正则，Go 语法略有差异；尝试去掉常见的不兼容写法再编译一次
		re2, err2 := regexp.Compile("(?i)" + strings.ReplaceAll(pattern, `\/`, `/`))
		if err2 != nil {
			regexCache.Store(pattern, nil)
			return nil
		}
		re = re2
	}
	regexCache.Store(pattern, re)
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

// Match 判断单个文件是否被规则过滤。
// 返回 (是否排除, 命中的规则 id 或原因)
func Match(path string, size int64, rules []bootstrap.FilterRule) (bool, string) {
	hasInclude := false
	hitInclude := false
	fileName := filepath.Base(path)

	// 先看是否存在启用中的 include 规则：
	//   · 没有 → 只要命中任一条 exclude 即可短路返回（排除优先）
	//   · 有   → 需要完整遍历，判断是否至少命中一条 include（命中 include 后仍要检查 exclude）
	for _, rule := range rules {
		if rule.Enabled && rule.Scope == "include" {
			hasInclude = true
			break
		}
	}

	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}

		hit := false
		switch rule.Type {
		case "size":
			threshold := normalizeSize(rule.Value, rule.Unit)
			if threshold < 0 {
				continue
			}
			hit = sizeMatch(rule.Op, size, threshold)
		case "regex":
			re := compiled(rule.Value)
			if re == nil {
				continue
			}
			hit = re.MatchString(path) || re.MatchString(fileName)
		default:
			continue
		}

		if !hit {
			continue
		}

		if rule.Scope == "include" {
			hitInclude = true
			if !hasInclude {
				hasInclude = true
			}
			continue
		}
		// 排除优先：命中即短路
		return true, rule.ID
	}

	if hasInclude && !hitInclude {
		return true, "include-miss"
	}
	return false, ""
}

// Result 过滤统计
type Result struct {
	Kept     []bootstrap.Song
	Excluded int
	Total    int
}

// Apply 对一批歌曲应用规则
func Apply(songs []bootstrap.Song, rules []bootstrap.FilterRule) Result {
	res := Result{Kept: make([]bootstrap.Song, 0, len(songs)), Total: len(songs)}
	for _, s := range songs {
		if excluded, _ := Match(s.Path, s.Size, rules); excluded {
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
