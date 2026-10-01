package update

import (
	"fmt"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Release 是 GitHub Release API 的一个子集，只保留更新功能真正用到的字段。
//
// 为什么不直接定义完整结构：完整的 release 响应有三十多个字段，
// 其中大部分（author、reactions、uploader…）我们永远不看。字段越少，
// 反序列化时越不容易因为某个字段的类型变化整体失败。
type Release struct {
	TagName     string  `json:"tag_name"`
	Name        string  `json:"name"`
	Body        string  `json:"body"`
	HTMLURL     string  `json:"html_url"`
	Draft       bool    `json:"draft"`
	Prerelease  bool    `json:"prerelease"`
	PublishedAt string  `json:"published_at"`
	Assets      []Asset `json:"assets"`
}

// Asset 是 release 里的一个可下载文件。
//
// 两个 URL 的用途不同，必须都留着：
//   - BrowserDownloadURL 是**要交给代理**的地址（`github.com/.../releases/download/...`）——
//     代理只认这种 GitHub 网页地址；
//   - APIURL 是 GitHub API 自己的地址（`api.github.com/.../assets/<id>`），
//     它**不能**过代理（代理转发的是 github.com），只在直连兜底时才有意义。
type Asset struct {
	Name               string `json:"name"`
	Size               int64  `json:"size"`
	BrowserDownloadURL string `json:"browser_download_url"`
	APIURL             string `json:"url"`
	ContentType        string `json:"content_type"`
}

// PublishedTime 把 published_at 解析成时间；解析不了就返回零值时间。
func (r Release) PublishedTime() time.Time {
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(r.PublishedAt))
	if err != nil {
		return time.Time{}
	}
	return t
}

// Version 解析 tag_name。tag 不是合法版本号时返回错误。
func (r Release) Version() (Version, error) { return ParseVersion(r.TagName) }

/* --------------------------------------------------------------------------
   资产挑选
   -------------------------------------------------------------------------- */

// assetKind 描述一个资产对应哪个平台，用于在当前平台上挑选正确的文件。
type assetKind struct {
	os   string
	arch string
	ext  []string
}

// platformKinds 按「优先级从高到低」列出当前平台可接受的资产特征。
//
// 为什么是一个列表而不是精确匹配：发布时可能同时提供安装包（NSIS .exe）
// 与绿色版（裸 .exe），也可能只有其中一种。列表让「首选没有就退而求其次」
// 变成数据，而不是一串 if。
func platformKinds() []assetKind {
	switch runtime.GOOS {
	case "windows":
		return []assetKind{
			{os: "windows", arch: "x64", ext: []string{".exe"}},
			{os: "windows", arch: "amd64", ext: []string{".exe"}},
			{os: "windows", arch: "", ext: []string{".exe"}},
		}
	case "darwin":
		return []assetKind{
			{os: "darwin", arch: "arm64", ext: []string{".dmg", ".zip"}},
			{os: "macos", arch: "arm64", ext: []string{".dmg", ".zip"}},
		}
	case "linux":
		return []assetKind{
			{os: "linux", arch: "x64", ext: []string{".AppImage", ".appimage"}},
			{os: "linux", arch: "amd64", ext: []string{".AppImage", ".appimage"}},
		}
	default:
		return nil
	}
}

// IsChecksumAsset 报告这个资产是不是校验和清单（而不是程序本体）。
//
// 必须在挑选安装包时排掉它：`SHA256SUMS.txt` 排在资产列表里，
// 而挑选逻辑要找的是「当前平台的可执行文件」—— 万一哪天校验和文件
// 被命名成 `...-windows-x64.exe.txt` 之类，不排掉就会把清单当安装包下载。
func IsChecksumAsset(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	if lower == "" {
		return false
	}
	if strings.HasSuffix(lower, ".txt") || strings.HasSuffix(lower, ".sha256") ||
		strings.HasSuffix(lower, ".sha256sum") || strings.HasSuffix(lower, ".sha256sums") {
		return true
	}
	return strings.Contains(lower, "sha256sum")
}

// PickAsset 从资产列表里挑出「当前平台应该下载的那一个」。
//
// 匹配规则（全部不区分大小写）：
//  1. 先按平台特征列表逐档尝试，每档要求文件名同时含有 os 与 arch 关键字、
//     以指定扩展名结尾；
//  2. 同一档里命中多个时，取体积最大的（发行时同时传了安装包和绿色版、
//     或者留了一个历史副本的情况下，大的那个才是真正要装的）。
//
// 找不到返回 ok=false —— 调用方应该把「有新版本但没有对应平台的安装包」
// 当作一种**明确的**状态告诉用户，而不是装作「没有更新」。
func PickAsset(assets []Asset) (Asset, bool) {
	for _, kind := range platformKinds() {
		var best Asset
		found := false
		for _, a := range assets {
			if !assetMatches(a, kind) {
				continue
			}
			if !found || a.Size > best.Size {
				best, found = a, true
			}
		}
		if found {
			return best, true
		}
	}
	return Asset{}, false
}

func assetMatches(a Asset, kind assetKind) bool {
	name := strings.ToLower(strings.TrimSpace(a.Name))
	if name == "" || IsChecksumAsset(name) {
		return false
	}
	if !strings.Contains(name, kind.os) {
		return false
	}
	if kind.arch != "" && !strings.Contains(name, kind.arch) {
		return false
	}
	for _, ext := range kind.ext {
		if strings.HasSuffix(name, strings.ToLower(ext)) {
			return true
		}
	}
	return false
}

/* --------------------------------------------------------------------------
   SHA256SUMS 解析
   -------------------------------------------------------------------------- */

// ParseChecksums 解析 `SHA256SUMS.txt`。
//
// 格式是 coreutils 的 `<64位十六进制>  <文件名>`，文件名可能带 `*` 前缀
// （二进制模式的标记）或 `./` 前缀，两种都要能认。
// 解析不出来的行直接跳过：这份清单里可能有我们不关心的文件，
// 没必要因为一行格式怪就整体失败。
func ParseChecksums(body string) map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// 用 Fields 而不是按两个空格切：实际文件里空格数不总是恰好两个。
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		sum := strings.ToLower(fields[0])
		if len(sum) != 64 || !isHex(sum) {
			continue
		}
		name := strings.TrimPrefix(fields[len(fields)-1], "*")
		name = strings.TrimPrefix(name, "./")
		out[strings.ToLower(name)] = sum
	}
	return out
}

// ChecksumFor 从解析好的清单里取某个文件名的期望哈希。
func ChecksumFor(sums map[string]string, assetName string) (string, bool) {
	if len(sums) == 0 {
		return "", false
	}
	key := strings.ToLower(strings.TrimSpace(assetName))
	if sum, ok := sums[key]; ok {
		return sum, true
	}
	// 兜底：清单里写的是完整路径（`./dist/xxx.exe`）时，只比文件名。
	base := key
	if idx := strings.LastIndexByte(base, '/'); idx >= 0 {
		base = base[idx+1:]
	}
	for k, v := range sums {
		if strings.HasSuffix(k, "/"+base) {
			return v, true
		}
	}
	return "", false
}

func isHex(s string) bool {
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
		case r >= 'a' && r <= 'f':
		default:
			return false
		}
	}
	return true
}

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */

// HumanSize 把字节数格式化成人看的字符串（下载进度里显示）。
func HumanSize(bytes int64) string {
	if bytes < 0 {
		return "—"
	}
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	units := []string{"KB", "MB", "GB", "TB"}
	value := float64(bytes)
	idx := -1
	for value >= unit && idx < len(units)-1 {
		value /= unit
		idx++
	}
	// 大于 100 时小数位没有意义（"512.3 MB" 与 "512 MB" 对用户是一样的）
	if value >= 100 {
		return fmt.Sprintf("%.0f %s", value, units[idx])
	}
	return fmt.Sprintf("%.1f %s", value, units[idx])
}

// FormatSpeed 把「字节/秒」格式化成 `1.2 MB/s`。
func FormatSpeed(bytesPerSec float64) string {
	if bytesPerSec <= 0 {
		return ""
	}
	return HumanSize(int64(bytesPerSec)) + "/s"
}

// FormatTag 把 tag_name 整理成展示用的版本号（去掉 `v` 前缀）。
func FormatTag(tag string) string {
	return strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(tag), "v"), "V")
}

// parseAssetID 从 API URL 里取出资产 id（诊断信息里用到）。
func parseAssetID(apiURL string) int64 {
	idx := strings.LastIndexByte(apiURL, '/')
	if idx < 0 {
		return 0
	}
	n, err := strconv.ParseInt(apiURL[idx+1:], 10, 64)
	if err != nil {
		return 0
	}
	return n
}
