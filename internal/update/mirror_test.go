package update

import (
	"path/filepath"
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

// ★ 这些测试必须按**运行平台**构造资产，不能只造 Windows 的。
//
// PickAsset 内部按 runtime.GOOS 选一档平台特征（见 release.go 的
// platformKinds），所以喂一个纯 Windows 的资产列表、却在 Linux 上跑，
// 得到的正确结果就是「找不到安装包」。发版只在 Windows 上做，
// 但 CI 跑在 Linux 上 —— 早期这两条测试写死了 windows-exe，
// 在 Linux 上必然失败（此前 gofmt 一直红灯，测试从没真正跑过，
// 所以一直没暴露）。
//
// 这里提供按平台的构造器，让断言在两种平台上都仍然有意义：
// 测的是「能挑出当前平台的包」，而不是「能挑出 Windows 的包」。
const (
	windowsAssetName = "LMPlayer-v0.1.1-windows-x64.exe"
	// ★ 必须用 "darwin" 而不是 "macos"：platformKinds 里 darwin 的**首选**
	// 档位是 {os:"darwin"}，{os:"macos"} 只是次选。currentPlatformAssetName
	// 的语义是「首选档位应当挑中的那个」，写 macos 会让断言与首选档位错位。
	darwinAssetName = "LMPlayer-v0.1.1-darwin-arm64.dmg"
	linuxAssetName  = "LMPlayer-v0.1.1-linux-x64.AppImage"
)

// currentPlatformAssetName 返回当前平台**应当**被挑中的那个资产名。
//
// 与 platformKinds 一一对应：每个平台的首选档位对应的文件名。
func currentPlatformAssetName() string {
	switch runtime.GOOS {
	case "windows":
		return windowsAssetName
	case "darwin":
		return darwinAssetName
	case "linux":
		return linuxAssetName
	default:
		return ""
	}
}

// realAssets 是发布里真实存在的资产（名字与体积取自 GitHub API）。
//
// 在真实的两项之外，按当前平台补一个该平台的包 —— 这样
// TestPickAssetFindsWindowsExe 在哪个平台上都测得到「能挑出本平台的包」。
func realAssets() []Asset {
	sets := []Asset{
		{
			Name:               windowsAssetName,
			Size:               17851904,
			BrowserDownloadURL: "https://github.com/nihaozyj7/localMusicPlayer/releases/download/v0.1.1/" + windowsAssetName,
		},
		{
			Name:               "SHA256SUMS.txt",
			Size:               98,
			BrowserDownloadURL: "https://github.com/nihaozyj7/localMusicPlayer/releases/download/v0.1.1/SHA256SUMS.txt",
		},
	}
	// 非 Windows 平台再补一条本平台的（Windows 上已经有了，不重复加）
	if name := currentPlatformAssetName(); name != "" && name != windowsAssetName {
		sets = append(sets, Asset{
			Name:               name,
			Size:               17000000,
			BrowserDownloadURL: "https://github.com/nihaozyj7/localMusicPlayer/releases/download/v0.1.1/" + name,
		})
	}
	return sets
}

// TestPickAssetFindsWindowsExe 验证能从真实资产列表里挑出**本平台**的安装包。
//
// 函数名保留了 Windows 字样（历史原因），但断言已经改成平台无关：
// 它测的是 PickAsset 能在真实形状的列表里挑中当前平台该装的那个。
func TestPickAssetFindsWindowsExe(t *testing.T) {
	want := currentPlatformAssetName()
	if want == "" {
		t.Skipf("未知平台 %s，platformKinds 没有对应档位", runtime.GOOS)
	}

	a, ok := PickAsset(realAssets())
	if !ok {
		t.Fatalf("应当能从真实资产列表里挑出安装包（平台 %s）", runtime.GOOS)
	}
	if a.Name != want {
		t.Fatalf("挑错了资产：得到 %s，期望 %s（平台 %s）", a.Name, want, runtime.GOOS)
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
	//
	// ★ 文件名必须带**当前平台**的关键字，否则 PickAsset 一档都匹配不上
	//（它按 runtime.GOOS 选档位）。这里只拼两段后缀，平台关键字由
	// currentPlatformAssetName() 提供。
	base := currentPlatformAssetName()
	if base == "" {
		t.Skipf("未知平台 %s，platformKinds 没有对应档位", runtime.GOOS)
	}
	// 去掉扩展名再拼 "-installer"，保证两条资产落在**同一档**里
	ext := ""
	stem := base
	if i := strings.LastIndex(base, "."); i > 0 {
		stem, ext = base[:i], base[i:]
	}

	assets := []Asset{
		{Name: stem + ext, Size: 100},
		{Name: stem + "-installer" + ext, Size: 9000},
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
	//
	// ★ 断言的是**安全性质**（结果里不含任何路径分隔符、且不是 "." / ".."），
	// 而不是某个写死的期望字符串。原因是 filepath.Base 的行为**依平台而异**：
	//
	//	· Windows 上 `\` 与 `/` 都是分隔符，Base("..\\..\\evil.exe") = "evil.exe"；
	//	· Linux 上只有 `/` 是分隔符，Base 得到整串 "..\\..\\evil.exe"，
	//	  随后实现里的 ReplaceAll("\\", "_") 把它变成 ".._.._evil.exe"。
	//
	// 两种结果都**安全**（都不含分隔符、都落在目标目录内），只是字面不同。
	// 原测试写死了 Windows 的字面结果，在 Linux 上必然失败 ——
	// 而它本该守住的是「不会逃出目录」这件事，不是某个平台的具体拼法。
	cases := []string{
		"../../evil.exe",
		"..\\..\\evil.exe",
		"/etc/passwd",
		"C:\\Windows\\x.exe",
		"",
		"..",
		".",
		"a/b/c.exe",
	}
	for _, in := range cases {
		got := safeFileName(in)

		if got == "" {
			t.Errorf("safeFileName(%q) 返回空串 —— 调用方会拼出一个目录路径", in)
			continue
		}
		// 结果里不能残留任何分隔符（两种平台的分隔符都要查）
		if strings.ContainsAny(got, `/\`) {
			t.Errorf("safeFileName(%q) = %q，仍含路径分隔符 —— 可能写出目录外", in, got)
		}
		// 不能是 "." / ".."（它们会让 filepath.Join 退到父目录）
		if got == "." || got == ".." {
			t.Errorf("safeFileName(%q) = %q，会让 Join 退到父目录", in, got)
		}
		// 再加一道端到端保证：拼出来的路径必须仍在目标目录内
		base := t.TempDir()
		joined := filepath.Join(base, got)
		if filepath.Dir(joined) != base {
			t.Errorf("safeFileName(%q) = %q，Join 之后跑到了 %q 外面", in, got, base)
		}
	}

	// 正常文件名必须原样保留（不能为了安全把所有名字都改写）
	if got := safeFileName("LMPlayer-v0.1.4-windows-x64.exe"); got != "LMPlayer-v0.1.4-windows-x64.exe" {
		t.Errorf("正常文件名被改写了：%q", got)
	}
	// 空 / 点号这类退化输入要有兜底名
	if got := safeFileName(""); got != "update.bin" {
		t.Errorf("空名字应当兜底成 update.bin，得到 %q", got)
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
