package update

import "strings"

// Mirror 是一个 GitHub 下载加速代理。
//
// 为什么需要这份名单：GitHub 的 release 资产走的是 objects.githubusercontent.com，
// 在国内网络下经常慢到不可用甚至完全连不上；而这些代理只是把原始 URL
// 拼在自己域名后面转发，**资产内容不变**，所以可以随时切换、互相兜底。
//
// Prefix 末尾一定带 `/`：拼接规则是「前缀 + 完整的原始 URL」，
// 少一个斜杠就会拼出 `https://ghproxy.nethttps://github.com/...` 这种废地址。
//
// 名单顺序 = 尝试顺序（直连永远排在最前，见 Candidates）。
// 顺序是按实测可用性排的，但**不能依赖它**：代理是第三方服务，
// 随时可能挂掉或限流，所以下载逻辑必须能逐个降级，而不是只信任第一个。
type Mirror struct {
	// ID 是稳定标识，会被写进配置文件，所以不要随便改。
	ID string
	// Name 是界面上显示的名字。
	Name string
	// Prefix 是拼在原始 URL 前面的前缀（末尾带 `/`）。
	Prefix string
	// Note 是一句说明（界面上作为附注展示）。
	Note string
}

// Mirrors 是可用的下载通道，按推荐顺序排列。
//
// 「直连」也是其中一员（Prefix 为空串），它排在第一位：
// 网络正常时直连是最快的，代理只应该是「直连不行」时的退路。
var Mirrors = []Mirror{
	{ID: "direct", Name: "直连 GitHub", Prefix: "", Note: "不使用代理；网络通畅时最快"},
	{ID: "ghproxy.net", Name: "ghproxy.net", Prefix: "https://ghproxy.net/", Note: "通用加速，稳定性较好"},
	{ID: "ghfast.top", Name: "ghfast.top", Prefix: "https://ghfast.top/", Note: "通用加速，速度较快"},
	{ID: "githubproxy.cc", Name: "githubproxy.cc", Prefix: "https://githubproxy.cc/", Note: "通用加速"},
	{ID: "gh-proxy.com", Name: "gh-proxy.com", Prefix: "https://gh-proxy.com/", Note: "通用加速，偶有限流"},
	{ID: "ghproxy.homeboyc.cn", Name: "ghproxy.homeboyc.cn", Prefix: "https://ghproxy.homeboyc.cn/", Note: "对大文件支持较好"},
	{ID: "gh.llkk.cc", Name: "gh.llkk.cc", Prefix: "https://gh.llkk.cc/", Note: "通用加速，可用性波动较大"},
	{ID: "ghp.ci", Name: "ghp.ci", Prefix: "https://ghp.ci/", Note: "老牌代理，部分地区已不可用"},
}

// ChannelAuto 表示「自动选择通道」：按 Mirrors 顺序逐个尝试。
const ChannelAuto = "auto"

// MirrorByID 按 id 查通道；第二个返回值表示是否找到。
func MirrorByID(id string) (Mirror, bool) {
	clean := strings.TrimSpace(id)
	for _, m := range Mirrors {
		if m.ID == clean {
			return m, true
		}
	}
	return Mirror{}, false
}

// ValidChannel 判断一个通道 id 是否合法（含 "auto"）。
func ValidChannel(id string) bool {
	if strings.TrimSpace(id) == ChannelAuto {
		return true
	}
	_, ok := MirrorByID(id)
	return ok
}

// NormalizeChannel 规范化通道 id，非法值一律落回 auto。
//
// 用户指定的代理可能已经从名单里删掉了（配置文件是持久化的，
// 而这份名单会随版本变化），那时必须能安全退化，而不是让下载直接失败。
func NormalizeChannel(id string) string {
	clean := strings.TrimSpace(id)
	if ValidChannel(clean) {
		return clean
	}
	return ChannelAuto
}

// Apply 把代理前缀拼到原始 URL 上。
//
// 直连（Prefix 为空）时原样返回，这样调用方不需要为「没有代理」写分支。
func (m Mirror) Apply(rawURL string) string {
	if m.Prefix == "" {
		return rawURL
	}
	return m.Prefix + rawURL
}

// Candidates 按「应该尝试的顺序」返回原始 URL 的全部下载地址。
//
// 入参 channel 是用户选的通道：
//   - "auto"：直连优先，然后依次是名单里的每个代理；
//   - 具体代理：**那个代理排第一**（用户的选择要优先尊重），
//     但直连与其它代理仍然作为兜底跟在后面。
//
// 为什么指定了代理还要保留兜底：用户选它是因为「上次用它成功过」，
// 但代理随时会挂。只认一个通道的话，代理一挂用户就只能手动改设置 ——
// 而这时他恰恰可能正打不开设置里的那个列表。
func Candidates(rawURL, channel string) []string {
	chosen := NormalizeChannel(channel)

	out := make([]string, 0, len(Mirrors))
	seen := map[string]bool{}
	add := func(m Mirror) {
		url := m.Apply(rawURL)
		if seen[url] {
			return
		}
		seen[url] = true
		out = append(out, url)
	}

	if chosen != ChannelAuto {
		if m, ok := MirrorByID(chosen); ok {
			add(m)
		}
	}
	for _, m := range Mirrors {
		add(m)
	}
	return out
}

// MirrorFor 返回一个下载地址对应的通道（按前缀匹配），供界面回显
// 「这次实际走的是哪条通道」。
func MirrorFor(url string) (Mirror, bool) {
	// 从最长的前缀开始比，避免 ghproxy.net 这种前缀把更长的
	// ghproxy.homeboyc.cn 抢走匹配。这里的名单里暂时没有互为前缀的项，
	// 但按长度排序能让以后加代理时不会踩到这个坑。
	best := Mirror{}
	found := false
	for _, m := range Mirrors {
		if m.Prefix == "" || !strings.HasPrefix(url, m.Prefix) {
			continue
		}
		if !found || len(m.Prefix) > len(best.Prefix) {
			best, found = m, true
		}
	}
	return best, found
}
