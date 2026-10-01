package update

import (
	"runtime"
	"strings"
	"testing"
)

/* ==========================================================================
   mirror_test.go — 代理地址拼接
   --------------------------------------------------------------------------
   这里出错的后果是「拼出一个废地址」：请求会失败，但错误信息看起来
   像是网络问题，用户和开发者都会先去怀疑网络 —— 所以拼接规则要测死。
   ========================================================================== */

func TestMirrorApplyPrefixesRawURL(t *testing.T) {
	const raw = "https://github.com/o/r/releases/download/v1.0.0/app.exe"
	m, ok := MirrorByID("ghproxy.net")
	if !ok {
		t.Fatal("名单里应当有 ghproxy.net")
	}
	got := m.Apply(raw)
	want := "https://ghproxy.net/" + raw
	if got != want {
		t.Fatalf("Apply = %q，期望 %q", got, want)
	}
	// 前缀必须以 / 结尾，否则会拼出 "nethttps://..."
	if !strings.HasSuffix(m.Prefix, "/") {
		t.Fatalf("通道 %s 的前缀没有以 / 结尾：%q", m.ID, m.Prefix)
	}
}

func TestDirectMirrorDoesNotModifyURL(t *testing.T) {
	m, ok := MirrorByID("direct")
	if !ok {
		t.Fatal("名单里应当有 direct")
	}
	const raw = "https://github.com/o/r/releases/download/v1.0.0/app.exe"
	if got := m.Apply(raw); got != raw {
		t.Fatalf("直连通道不应改写地址，得到 %q", got)
	}
	if m.Prefix != "" {
		t.Fatalf("直连通道的前缀应为空，得到 %q", m.Prefix)
	}
}

func TestCandidatesAutoPutsDirectFirst(t *testing.T) {
	const raw = "https://github.com/o/r/releases/download/v1.0.0/app.exe"
	got := Candidates(raw, ChannelAuto)
	if len(got) == 0 {
		t.Fatal("auto 应当返回候选地址")
	}
	if got[0] != raw {
		t.Fatalf("auto 模式下直连应当排第一，得到 %q", got[0])
	}
	// 名单里每个通道都应当出现在候选里（去重后）
	if len(got) != len(Mirrors) {
		t.Fatalf("候选数 = %d，期望 %d（每个通道一条）", len(got), len(Mirrors))
	}
}

func TestCandidatesPutsChosenFirstButKeepsFallbacks(t *testing.T) {
	const raw = "https://github.com/o/r/releases/download/v1.0.0/app.exe"
	got := Candidates(raw, "ghfast.top")
	want := "https://ghfast.top/" + raw
	if got[0] != want {
		t.Fatalf("指定通道应当排第一，得到 %q，期望 %q", got[0], want)
	}
	// 关键性质：指定了通道**仍然**保留其它兜底。
	// 只认一个通道的话，那个代理一挂用户就只能手动改设置。
	if len(got) < 2 {
		t.Fatalf("指定通道后仍应有兜底候选，得到 %d 条", len(got))
	}
	if !contains(got, raw) {
		t.Fatal("指定通道后仍应保留直连作为兜底")
	}
	// 不应有重复
	seen := map[string]bool{}
	for _, u := range got {
		if seen[u] {
			t.Fatalf("候选里有重复地址：%q", u)
		}
		seen[u] = true
	}
}

func TestCandidatesFallsBackWhenChannelUnknown(t *testing.T) {
	const raw = "https://github.com/o/r/releases/download/v1.0.0/app.exe"
	// 用户配置里存着一个已经从名单删掉的通道 id：必须安全退化到 auto，
	// 而不是返回空列表让下载直接失败。
	got := Candidates(raw, "this-mirror-no-longer-exists")
	if len(got) != len(Mirrors) {
		t.Fatalf("未知通道应当退化成 auto（%d 条），得到 %d 条", len(Mirrors), len(got))
	}
	if got[0] != raw {
		t.Fatalf("退化成 auto 后直连应排第一，得到 %q", got[0])
	}
}

func TestNormalizeChannel(t *testing.T) {
	cases := map[string]string{
		"":             ChannelAuto,
		"   ":          ChannelAuto,
		"auto":         ChannelAuto,
		" ghfast.top ": "ghfast.top",
		"nope":         ChannelAuto,
		"ghproxy.net":  "ghproxy.net",
	}
	for in, want := range cases {
		if got := NormalizeChannel(in); got != want {
			t.Errorf("NormalizeChannel(%q) = %q，期望 %q", in, got, want)
		}
	}
}

func TestMirrorForIdentifiesLongestPrefix(t *testing.T) {
	m, ok := MirrorFor("https://ghproxy.net/https://github.com/o/r/releases/download/v1/app.exe")
	if !ok || m.ID != "ghproxy.net" {
		t.Fatalf("MirrorFor 应当识别出 ghproxy.net，得到 %+v ok=%v", m, ok)
	}
	// 直连地址没有任何前缀，MirrorFor 应报告「没匹配上」——
	// 调用方据此把它当直连处理。
	if _, ok := MirrorFor("https://github.com/o/r/releases/download/v1/app.exe"); ok {
		t.Fatal("直连地址不应匹配到任何代理前缀")
	}
}

func TestMirrorTableIntegrity(t *testing.T) {
	// 名单是手写的，这几条不变量保证它不会因为手滑而坏掉。
	if len(Mirrors) < 6 {
		t.Fatalf("代理数量只有 %d 个，疑似漏了", len(Mirrors))
	}
	ids := map[string]bool{}
	prefixes := map[string]bool{}
	for _, m := range Mirrors {
		if strings.TrimSpace(m.ID) == "" {
			t.Error("有通道缺少 ID")
		}
		if ids[m.ID] {
			t.Errorf("通道 ID 重复：%s", m.ID)
		}
		ids[m.ID] = true

		if strings.TrimSpace(m.Name) == "" {
			t.Errorf("通道 %s 缺少显示名", m.ID)
		}
		if strings.TrimSpace(m.Note) == "" {
			t.Errorf("通道 %s 缺少说明", m.ID)
		}
		if m.ID == ChannelAuto {
			t.Errorf("通道 ID 不能是保留值 %q", ChannelAuto)
		}
		if m.Prefix != "" {
			if !strings.HasPrefix(m.Prefix, "https://") {
				t.Errorf("通道 %s 的前缀不是 https：%q", m.ID, m.Prefix)
			}
			if !strings.HasSuffix(m.Prefix, "/") {
				t.Errorf("通道 %s 的前缀没有以 / 结尾：%q", m.ID, m.Prefix)
			}
			if prefixes[m.Prefix] {
				t.Errorf("通道前缀重复：%s", m.Prefix)
			}
			prefixes[m.Prefix] = true
		}
	}
	// direct 必须在名单里且排第一（auto 模式依赖这个顺序）
	if Mirrors[0].ID != "direct" {
		t.Fatalf("名单第一项应当是 direct，得到 %s", Mirrors[0].ID)
	}
	if !ValidChannel(ChannelAuto) || !ValidChannel("direct") || ValidChannel("bogus") {
		t.Fatal("ValidChannel 判定不正确")
	}
}

/* ==========================================================================
   release_test.go — 资产挑选
   -------------------------------------------------------------------------- */

// realAssets 是 v0.1.1 发布里真实存在的资产（名字与体积取自 GitHub API）。
func realAssets() []Asset {
	return []Asset{
		{
			Name:               "LMPlayer-v0.1.1-windows-x64.exe",
			Size:               17851904,
			BrowserDownloadURL: "https://github.com/nihaozyj7/localMusicPlayer/releases/download/v0.1.1/LMPlayer-v0.1.1-windows-x64.exe",
		},
		{
			Name:               "SHA256SUMS.txt",
			Size:               98,
			BrowserDownloadURL: "https://github.com/nihaozyj7/localMusicPlayer/releases/download/v0.1.1/SHA256SUMS.txt",
		},
	}
}

func TestPickAssetFindsWindowsExe(t *testing.T) {
	a, ok := PickAsset(realAssets())
	if !ok {
		t.Fatal("应当能从真实资产列表里挑出安装包")
	}
	if a.Name != "LMPlayer-v0.1.1-windows-x64.exe" {
		t.Fatalf("挑错了资产：%s", a.Name)
	}
}

func TestPickAssetNeverPicksChecksumFile(t *testing.T) {
	// 只有校验和文件时（或者清单被命名为像可执行文件时），
	// 必须报告「找不到」，而不是把 98 字节的 txt 当安装包下载。
	only := []Asset{{Name: "SHA256SUMS.txt", Size: 98}}
	if _, ok := PickAsset(only); ok {
		t.Fatal("不应把 SHA256SUMS.txt 当作安装包")
	}
	tricky := []Asset{{Name: "LMPlayer-windows-x64.exe.sha256", Size: 100}}
	if _, ok := PickAsset(tricky); ok {
		t.Fatal("不应把 .sha256 文件当作安装包")
	}
}

func TestIsChecksumAsset(t *testing.T) {
	yes := []string{"SHA256SUMS.txt", "sha256sums.txt", "app.exe.sha256", "app.zip.sha256sum", "checksums.txt"}
	no := []string{"LMPlayer-v0.1.1-windows-x64.exe", "app.dmg", "app.AppImage", ""}
	for _, n := range yes {
		if !IsChecksumAsset(n) {
			t.Errorf("IsChecksumAsset(%q) 应当为 true", n)
		}
	}
	for _, n := range no {
		if IsChecksumAsset(n) {
			t.Errorf("IsChecksumAsset(%q) 应当为 false", n)
		}
	}
}

func TestPickAssetPrefersLargestInSameTier(t *testing.T) {
	// 同档命中多个时取体积最大的：发行时可能同时留了安装包与历史副本，
	// 大的那个才是真正要装的绿色版。
	assets := []Asset{
		{Name: "LMPlayer-windows-x64.exe", Size: 100},
		{Name: "LMPlayer-windows-x64-installer.exe", Size: 9000},
	}
	a, ok := PickAsset(assets)
	if !ok {
		t.Fatal("应当挑得出资产")
	}
	if a.Size != 9000 {
		t.Fatalf("应当取同档里最大的那个，得到 %s（%d）", a.Name, a.Size)
	}
}

func TestPickAssetRejectsOtherPlatforms(t *testing.T) {
	if runtime.GOOS == "windows" {
		// 只有 macOS/Linux 包时，Windows 上必须报告「没有可用安装包」
		others := []Asset{
			{Name: "LMPlayer-v0.1.1-macos-arm64.dmg", Size: 20000000},
			{Name: "LMPlayer-v0.1.1-linux-x64.AppImage", Size: 18000000},
		}
		if _, ok := PickAsset(others); ok {
			t.Fatal("Windows 上不应挑出 macOS/Linux 的包")
		}
	}
}

/* ==========================================================================
   checksum 解析
   ========================================================================== */

func TestParseChecksums(t *testing.T) {
	body := `# 这是注释
d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2  LMPlayer-v0.1.1-windows-x64.exe
a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1 *SHA256SUMS.txt

这一行不是校验和
zzzz  bad
`
	sums := ParseChecksums(body)
	if len(sums) != 2 {
		t.Fatalf("应当解析出 2 条，得到 %d 条：%v", len(sums), sums)
	}
	got, ok := ChecksumFor(sums, "LMPlayer-v0.1.1-windows-x64.exe")
	if !ok {
		t.Fatal("应当能查到安装包的哈希")
	}
	if !strings.HasPrefix(got, "d2d2") {
		t.Fatalf("哈希不对：%s", got)
	}
	// `*` 前缀（二进制模式标记）要去掉
	if _, ok := ChecksumFor(sums, "SHA256SUMS.txt"); !ok {
		t.Fatal("带 * 前缀的文件名应当能查到")
	}
	// 不区分大小写
	if _, ok := ChecksumFor(sums, "lmplayer-V0.1.1-WINDOWS-X64.EXE"); !ok {
		t.Fatal("文件名匹配应当不区分大小写")
	}
	if _, ok := ChecksumFor(sums, "not-there.exe"); ok {
		t.Fatal("不存在的文件不应查到哈希")
	}
}

func TestChecksumForHandlesPathPrefixes(t *testing.T) {
	sums := ParseChecksums("d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2  ./dist/app.exe\n")
	if _, ok := ChecksumFor(sums, "app.exe"); !ok {
		t.Fatal("清单里写完整路径时，按文件名也应当能查到")
	}
}

/* ==========================================================================
   格式化小工具
   ========================================================================== */

func TestHumanSize(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0 B"},
		{512, "512 B"},
		{1024, "1.0 KB"},
		{17851904, "17.0 MB"},
		{-1, "—"},
	}
	for _, c := range cases {
		if got := HumanSize(c.in); got != c.want {
			t.Errorf("HumanSize(%d) = %q，期望 %q", c.in, got, c.want)
		}
	}
}

func TestFormatTag(t *testing.T) {
	cases := map[string]string{"v0.1.1": "0.1.1", "0.1.1": "0.1.1", "V1.0.0": "1.0.0", " v2.0.0 ": "2.0.0"}
	for in, want := range cases {
		if got := FormatTag(in); got != want {
			t.Errorf("FormatTag(%q) = %q，期望 %q", in, got, want)
		}
	}
}

func TestSafeFileNameBlocksTraversal(t *testing.T) {
	// 资产名来自远端 JSON：一个 "../../evil.exe" 不能写到临时目录外面去。
	cases := map[string]string{
		"../../evil.exe":     "evil.exe",
		"..\\..\\evil.exe":   "evil.exe",
		"/etc/passwd":        "passwd",
		"C:\\Windows\\x.exe": "x.exe",
		"":                   "update.bin",
		"..":                 "update.bin",
	}
	for in, want := range cases {
		if got := safeFileName(in); got != want {
			t.Errorf("safeFileName(%q) = %q，期望 %q", in, got, want)
		}
	}
}

func contains(list []string, want string) bool {
	for _, x := range list {
		if x == want {
			return true
		}
	}
	return false
}
