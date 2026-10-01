// Package update 实现「检测 GitHub Release → 通过镜像代理下载 → 自替换安装」。
//
// 拆成独立包（而不是直接写进 services_update.go）的原因：这里的每一条规则
// 都是**纯函数**——版本号怎么比大小、从资产列表里挑哪个文件、代理地址怎么拼——
// 它们出错的后果是「静默地不更新」或「下载到错误的文件」，而这两种错误在
// 手工点一遍界面时都很难被发现（前者看起来就像「已经是最新版」）。
// 放进独立包，就能用单测把边界钉死。
package update

import (
	"fmt"
	"strconv"
	"strings"
)

// Version 是一个已解析的语义化版本号。
//
// 只保留比较大小真正需要的三段数字与预发布标记：
//   - 构建元数据（`+build`）按 SemVer 规范**不参与**优先级比较，解析时就丢掉；
//   - 预发布标识（`-beta.1`）只保留「有没有」这一个事实——本项目的实际用处是
//     「稳定版 > 预发布版」，不需要在预发布之间再排全序。
type Version struct {
	Major int
	Minor int
	Patch int
	// Pre 是预发布标识原文（`beta.14`），稳定版为空字符串。
	Pre string
	// raw 是用户看到的原始写法（`v0.1.1`），错误信息里要原样回显。
	raw string
}

// ParseVersion 解析版本号字符串。
//
// 接受带不带 `v` 前缀、段数不足三段（`0.2` → `0.2.0`）的写法：
// GitHub 的 tag_name 是 `v0.1.1`，而 appVersion 常量是 `0.1.1`，
// 两者必须能互相比较——这是这个函数存在的全部理由。
func ParseVersion(s string) (Version, error) {
	raw := strings.TrimSpace(s)
	if raw == "" {
		return Version{}, fmt.Errorf("版本号为空")
	}

	body := strings.TrimPrefix(raw, "v")
	body = strings.TrimPrefix(body, "V")

	// 构建元数据不参与比较（SemVer §10），先切掉。
	if idx := strings.IndexByte(body, '+'); idx >= 0 {
		body = body[:idx]
	}

	var pre string
	if idx := strings.IndexByte(body, '-'); idx >= 0 {
		pre = body[idx+1:]
		body = body[:idx]
	}

	parts := strings.Split(body, ".")
	if len(parts) > 3 {
		return Version{}, fmt.Errorf("版本号 %q 段数过多", raw)
	}

	nums := [3]int{}
	for i, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			return Version{}, fmt.Errorf("版本号 %q 的第 %d 段为空", raw, i+1)
		}
		n, err := strconv.Atoi(p)
		if err != nil {
			return Version{}, fmt.Errorf("版本号 %q 的第 %d 段不是数字", raw, i+1)
		}
		if n < 0 {
			return Version{}, fmt.Errorf("版本号 %q 的第 %d 段为负数", raw, i+1)
		}
		nums[i] = n
	}

	return Version{Major: nums[0], Minor: nums[1], Patch: nums[2], Pre: pre, raw: raw}, nil
}

// String 返回原始写法（不是规范化的三段式）——展示给用户时用原文更自然。
func (v Version) String() string { return v.raw }

// IsPreRelease 报告这是不是一个预发布版本。
func (v Version) IsPreRelease() bool { return v.Pre != "" }

// CompareTo 比较两个版本：v 新于 other 返回正数，相同返回 0，旧于返回负数。
//
// 为什么不能用字符串比较：`0.1.10` 在字典序里**小于** `0.1.9`
// （逐字符比到 `1` vs `9` 就分出胜负了）。那意味着 0.1.10 发布之后，
// 所有 0.1.9 的用户都会被判定成「已是最新版」——而且不会有任何报错。
func (v Version) CompareTo(other Version) int {
	if c := compareInt(v.Major, other.Major); c != 0 {
		return c
	}
	if c := compareInt(v.Minor, other.Minor); c != 0 {
		return c
	}
	if c := compareInt(v.Patch, other.Patch); c != 0 {
		return c
	}
	// 三段数字都相同时：稳定版 > 预发布版（1.0.0 > 1.0.0-rc.1）。
	// 预发布之间比不出大小就按相等处理——对本项目来说，
	// 「已经装了这个预发布」和「装了另一个预发布」都不该触发更新提示。
	switch {
	case v.Pre == "" && other.Pre != "":
		return 1
	case v.Pre != "" && other.Pre == "":
		return -1
	default:
		return 0
	}
}

// NewerThan 是 CompareTo 的可读封装。
func (v Version) NewerThan(other Version) bool { return v.CompareTo(other) > 0 }

func compareInt(a, b int) int {
	switch {
	case a > b:
		return 1
	case a < b:
		return -1
	default:
		return 0
	}
}
