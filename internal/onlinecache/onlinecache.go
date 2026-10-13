// Package onlinecache 保存在线试听曲目**已经下载下来的原始音频文件**。
//
// # 为什么必须落盘（这不是可选的优化）
//
// 在线试听以前只是把 `/online/audio?id=…` 这个代理地址交给前端，后端自己
// 不留任何文件。于是「在线歌曲」在后端等于**不存在**：
//
//   - 后端原生播放走 PlayerService.Load → media.Server.PlayableFile →
//     library.SongByID("bili:BVxxx")，曲库里根本没有这条记录，
//     解析必然失败（「歌曲不存在」）；
//   - 而这个失败会和「文件损坏」共用同一条错误链路（handlePlaybackFailure），
//     于是一首完全正常的在线歌曲会被登记进「放不出来」清单并被摘掉 ——
//     用户看到的就是「在线试听不能用了」。
//
// 缓存落盘之后，后端就有一个**真实存在的本地文件**可以解析、转码、播放，
// 顺带也让「下载」不必再走一遍网络（直接从缓存搬过去）。
//
// # 为什么放在系统临时目录
//
// 试听缓存是**可丢弃**的派生数据，和用户的音乐库、下载目录都不该混在一起：
//   - 不放进 DownloadDir —— 否则「试听过的歌」会自己出现在下载目录里，
//     而用户从没点过下载；
//   - 不放进 cacheDir/transcode —— 那里存的是转码后的 WAV（体积大、随 LRU
//     淘汰），而下载要的是**原始**音频文件，两者不能互相顶替。
//
// 放在临时目录的代价是「系统清理临时目录后缓存消失」，这是可以接受的：
// 命中失败就当作没缓存，重新下载一次即可（见 Lookup 的说明）。
//
// # 命名
//
//	<dir>/<bvid><ext>                  例如 …\LocalMusicPlayer\online\BV1xx411c7mD.m4a
//	<dir>/<bvid><ext>.<随机>.part       写入中的半成品（永远不是合法的缓存文件）
//
// 半成品名里的随机后缀是为了让**并发写同一个 bvid** 的两个请求各写各的文件，
// 不会互相截断（见 writeAtomic）。旧版本的固定名 `<bvid><ext>.part` 仍然
// 会被清理逻辑认出来（见 cacheName / removeParts）。
//
// 用 bvid 直接做文件名：一个视频对应一份音频，天然去重；而且**可读**，
// 用户排查时一眼能认出是哪首歌。文件名要过滤（见 safeName），因为 bvid
// 来自远端/URL，不能直接当路径用。
package onlinecache

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// defaultSubdir 是缓存目录在系统临时目录下的相对位置。
//
// 带上一层 LocalMusicPlayer 是为了不和临时目录里别人的文件混在一起
// （临时目录是所有程序共用的）。
const defaultSubdir = "LocalMusicPlayer"

// EnvDir 允许通过环境变量指定缓存目录（测试用，避免污染真实临时目录）。
const EnvDir = "LMPLAYER_ONLINE_CACHE_DIR"

// minValidBytes 是「这份缓存能不能用」的字节下限。
//
// 取 1KB 而不是 0：一次中断的代理请求完全可能留下一个 0 字节或几百字节的
// 残file，把它当成有效缓存会让播放拿到一个必然失败的输入，
// 用户看到的还是「这首歌放不了」—— 正是本包要消灭的那个现象。
const minValidBytes = 1024

// cacheBudgetBytes 是试听缓存的总预算（512MB）。
//
// 为什么要设上限：临时目录虽然会被系统清理，但清理时机不可预期 ——
// 用户连续试听几百首而不重启，缓存可以涨到几个 GB。超出后按最久未使用
// 淘汰（与 media.Server 的转码缓存同一思路）。
const cacheBudgetBytes = 512 << 20

// partSuffix 是写入中的半成品后缀（正式名 + "." + 随机后缀 + 它）。
//
// 半成品必须是**独立的文件名**：正式名就是命中判据（Lookup 只看它），
// 一个写了一半的文件绝不能被 Lookup 看到；而随机后缀保证并发写同一条缓存时
// 各个写者互不覆盖（见 writeAtomic）。
const partSuffix = ".part"

// movingSuffix 是「跨盘符搬运」那个临时文件的后缀（正式名 + "." + 随机后缀 + 它）。
//
// 与 partSuffix 同一条不变量：**临时文件名必须唯一，不能只由目标名决定**。
// 见 copyThenRemove 的说明。
const movingSuffix = ".moving"

// namePattern 限制缓存文件名形态：字母数字/下划线/连字符 + 已知音频扩展名。
//
// 这是**目录穿越的第一道防线**：bvid 来自 URL 查询参数，直接把
// `../../foo` 拼进路径就能写到缓存目录之外。只接受我们自己生成过的形态
// 之后，`..`、绝对路径、UNC 前缀都不可能通过。
var namePattern = regexp.MustCompile(`^[A-Za-z0-9_-]+\.(m4a|mp4|mp3|aac|flac|wav|ogg|opus)$`)

// Store 是在线试听音频的磁盘缓存。
//
// 零值不可用，必须经 New 构造（dir 需要在构造时确定并缓存）。
type Store struct {
	dir string

	// mu 保护 map 与淘汰逻辑。文件本身的读写不加这个锁（那会串行化所有下载）；
	// 同一个 bvid 的并发写靠 writeAtomic 的**独占临时文件**互不破坏：
	// 各写各的 `<目标名>.<随机>.part`，最后完成的那个原子改名落盘，
	// 输的一方只是白写一遍，不会截断赢家的文件，也不会有半成品留在目录里。
	mu      sync.Mutex
	entries map[string]*entry
}

// entry 是一条缓存的记账（用于容量淘汰）。
type entry struct {
	path   string
	size   int64
	usedAt int64
}

// New 创建缓存；dir 为空时用系统临时目录下的默认位置。
func New(dir string) *Store {
	if strings.TrimSpace(dir) == "" {
		dir = DefaultDir()
	}
	return &Store{dir: dir, entries: map[string]*entry{}}
}

// DefaultDir 返回默认缓存目录：<临时目录>/LocalMusicPlayer/online。
//
// 可用 LMPLAYER_ONLINE_CACHE_DIR 覆盖（测试里必须覆盖，否则测试之间会
// 通过真实临时目录互相干扰）。
func DefaultDir() string {
	if dir := strings.TrimSpace(os.Getenv(EnvDir)); dir != "" {
		return dir
	}
	return filepath.Join(os.TempDir(), defaultSubdir, "online")
}

// Dir 返回缓存目录（供设置界面显示 / 排查）。
func (s *Store) Dir() string { return s.dir }

// Path 返回某个 bvid 的缓存文件路径（**不保证存在**）。
//
// 第二个返回值为 false 表示 bvid 规范化后不足以构成安全文件名 ——
// 调用方应当把它当成「没有缓存」，而不是去猜一个路径。
func (s *Store) Path(bvid, ext string) (string, bool) {
	name := safeName(bvid, ext)
	if name == "" {
		return "", false
	}
	return filepath.Join(s.dir, name), true
}

// Lookup 返回可用的缓存文件路径；第二个返回值为 false 表示没有可用缓存。
//
// 「可用」= 文件存在、是个普通文件、且不小于 minValidBytes。
// 任何一条不满足都返回 false 并**顺手清掉**那个文件：半成品留着只会
// 让下一次 Lookup 再白检查一遍，而且它会一直占着容量预算。
func (s *Store) Lookup(bvid, ext string) (string, bool) {
	path, ok := s.Path(bvid, ext)
	if !ok {
		return "", false
	}
	st, err := os.Stat(path)
	if err != nil || !st.Mode().IsRegular() {
		return "", false
	}
	if st.Size() < minValidBytes {
		// 残file：删掉，让后续走「重新下载」而不是反复命中一个坏文件
		_ = os.Remove(path)
		s.forget(bvid)
		return "", false
	}
	s.touch(bvid, path, st.Size())
	return path, true
}

// LookupAny 按 bvid 探测任意扩展名的缓存（下载时不知道原始扩展名时用）。
//
// 顺序固定为 ext 优先、其余按 extensions 的顺序 —— 同一个 bvid 正常只会有
// 一份缓存，这个循环主要是为了兼容「早期版本用别的扩展名存过」。
func (s *Store) LookupAny(bvid, preferExt string) (string, string, bool) {
	exts := Extensions(preferExt)
	for _, ext := range exts {
		if path, ok := s.Lookup(bvid, ext); ok {
			return path, ext, true
		}
	}
	return "", "", false
}

// extensions 是会被缓存的音频扩展名（顺序即 LookupAny 的探测顺序）。
var extensions = []string{".m4a", ".mp4", ".mp3", ".aac", ".flac", ".wav", ".ogg", ".opus"}

// Extensions 返回探测顺序：preferExt 在最前（去重）。
func Extensions(preferExt string) []string {
	prefer := NormalizeExt(preferExt)
	out := make([]string, 0, len(extensions))
	if prefer != "" {
		out = append(out, prefer)
	}
	for _, e := range extensions {
		if e != prefer {
			out = append(out, e)
		}
	}
	return out
}

// NormalizeExt 规范化扩展名（小写、带点）；空值落回 .m4a。
//
// 默认 .m4a 而不是空：B 站返回的音频流本来就是 m4a/AAC，
// 这是绝大多数情况下的正确值（见 internal/bilibili 的 dash 解析）。
func NormalizeExt(ext string) string {
	ext = strings.ToLower(strings.TrimSpace(ext))
	ext = strings.TrimPrefix(ext, ".")
	if ext == "" {
		return ".m4a"
	}
	return "." + ext
}

// Store 把 r 的内容写成 bvid 的缓存文件，返回落盘字节数。
//
// 写入策略与下载服务一致：先写独占的半成品 `<name>.<随机>.part`，
// 成功后**原子改名**。这样 Lookup 永远不会看到一个写了一半的文件 ——
// 而「半成品被当成有效缓存」正是「试听没声音」最隐蔽的一种成因。
//
// 已存在可用缓存时直接返回（不重复下载）。注意这个判断与写入之间没有加锁：
// 并发进来的两个请求可能都判定「没有缓存」而各写一遍 —— 这是可以接受的
// （缓存只有一份、内容相同），前提是两者的临时文件互不覆盖，见 writeAtomic。
func (s *Store) Store(bvid, ext string, r io.Reader) (int64, error) {
	if path, ok := s.Lookup(bvid, ext); ok {
		st, err := os.Stat(path)
		if err == nil {
			return st.Size(), nil
		}
	}
	path, ok := s.Path(bvid, ext)
	if !ok {
		return 0, fmt.Errorf("无法为 %q 生成缓存文件名", bvid)
	}
	return s.writeAtomic(path, r)
}

// WriteTo 把 r 写入一个指定的缓存路径（调用方已经算好路径时用）。
//
// 单独导出是因为 services_online 的试听代理是「边转发边旁路写盘」，
// 它自己持有目标路径，不需要再经 Path 算一次。
func (s *Store) WriteTo(path string, r io.Reader) (int64, error) {
	if st, err := os.Stat(path); err == nil && st.Mode().IsRegular() && st.Size() >= minValidBytes {
		return st.Size(), nil
	}
	return s.writeAtomic(path, r)
}

// writeAtomic 写一个**独占的**临时文件，再原子改名到 path。
//
// ★ 临时文件名必须唯一（`<目标名>.<随机>.part`，用 O_EXCL 创建），
// 不能是固定的 `path + ".part"`。
//
// 为什么：同一条试听路径会并发重入 —— 用户在播放中拖动进度条就会再发一次
// 请求，播放器的重试也可能叠加。两个写者共用同一个固定名 .part 时，
// os.Create 会**截断对方正在写的文件**，两边字节交错，最后被改名出去的是
// 「自己 2MB + 对方 4MB」拼起来的坏文件，而且它会被 Lookup 当成有效缓存、
// 登记成「可播放」；先失败的那一方还会把对方**正在写**的文件 Remove 掉，
// 于是缓存整体消失（实测 8 轮并发 8/8 至少一方失败）。
//
// 各自独占一个临时文件之后，两个写者互不干扰：谁最后改名谁赢，而那一份
// 一定是**完整**的文件（内容相同，谁赢都一样），失败也只清掉自己的临时文件。
func (s *Store) writeAtomic(path string, r io.Reader) (int64, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return 0, fmt.Errorf("创建试听缓存目录失败: %w", err)
	}
	f, err := createPart(path)
	if err != nil {
		return 0, err
	}
	tmp := f.Name()
	// 失败路径一律清掉半成品：缓存目录里不该留垃圾
	cleanup := func() {
		_ = f.Close()
		_ = os.Remove(tmp)
	}

	written, err := io.Copy(f, r)
	if err != nil {
		cleanup()
		return written, err
	}
	if written < minValidBytes {
		cleanup()
		return written, fmt.Errorf("缓存内容过小（%d 字节），视为无效", written)
	}
	if err := f.Sync(); err != nil {
		cleanup()
		return written, err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return written, err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return written, fmt.Errorf("写入缓存失败: %w", err)
	}
	s.touch(nameOf(path), path, written)
	s.evictIfNeeded()
	return written, nil
}

// createPart 独占创建一个半成品文件：`<目标名>.<随机后缀>.part`。
//
// 用 O_EXCL 而不是 os.Create：名字撞车时必须**报错重试**，而不是打开别人
// 正在写的文件往下截断（见 writeAtomic 的说明）。
// 返回的文件由调用方负责改名落盘或删除。
func createPart(path string) (*os.File, error) {
	return createUnique(path, partSuffix)
}

// createUnique 独占创建一个「<目标名>.<随机后缀><suffix>」形态的临时文件。
//
// 唯一性由随机后缀 + O_EXCL 共同保证：调用方拿到的文件在这个进程之外
// 也可能被别人占着（残留文件、另一个进程），O_EXCL 会把这种情况变成
// 「换个名字重试」而不是「打开别人的文件往下写」。
func createUnique(path, suffix string) (*os.File, error) {
	dir := filepath.Dir(path)
	base := filepath.Base(path)
	// 随机后缀 + O_EXCL 之后，撞车概率已经可以忽略；这里仍然重试，
	// 是为了不让「随机数源异常」变成「缓存永远写不进去」。
	for attempt := 0; attempt < 16; attempt++ {
		name := base + "." + randomSuffix() + suffix
		f, err := os.OpenFile(filepath.Join(dir, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err == nil {
			return f, nil
		}
		if !errors.Is(err, os.ErrExist) {
			return nil, fmt.Errorf("创建临时文件失败: %w", err)
		}
	}
	return nil, errors.New("创建临时文件失败：临时文件名连续冲突")
}

// partCounter 是 randomSuffix 在随机源不可用时的退化序号。
var partCounter atomic.Uint64

// randomSuffix 返回 8 个十六进制字符的随机后缀（用于半成品文件名的唯一性）。
func randomSuffix() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand 失败极罕见；退化值加上自增序号，仍保证同进程内不重名
		return strconv.FormatInt(time.Now().UnixNano(), 36) + strconv.FormatUint(partCounter.Add(1), 36)
	}
	return hex.EncodeToString(b[:])
}

// removeParts 删掉某个缓存路径对应的**所有**半成品文件。
//
// 临时名带随机后缀，所以不能再写死 `path + partSuffix`：漏删的话，
// 一次中断的写入会在缓存目录里留下永远没人清理的垃圾。
// 同时兼容旧版固定名 `<目标名>.part`（升级上来的用户目录里可能还有）。
func removeParts(path string) {
	dir := filepath.Dir(path)
	cacheName := filepath.Base(path)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if isPartOf(e.Name(), cacheName) {
			_ = os.Remove(filepath.Join(dir, e.Name()))
		}
	}
}

// isPartOf 判断目录里的一个文件是否是指定缓存名的半成品。
func isPartOf(name, cacheName string) bool {
	if name == cacheName+partSuffix { // 旧版固定名
		return true
	}
	return strings.HasPrefix(name, cacheName+".") && strings.HasSuffix(name, partSuffix)
}

// cacheName 判断目录里的一个文件是不是**我们自己命名的**缓存文件，
// 返回它对应的正式缓存文件名；不是则返回 ""。
//
// Clear 用它来决定「该删谁」：缓存目录理论上只属于本程序，但用户完全可能
// 把它指到一个共用目录（比如整个临时目录），清空缓存不该删掉无关文件。
// 半成品（新旧两种命名）同样要能被认出来并删掉，否则中断的写入会永远留在盘上。
func cacheName(name string) string {
	if namePattern.MatchString(name) {
		return name
	}
	if !strings.HasSuffix(name, partSuffix) {
		return ""
	}
	stem := strings.TrimSuffix(name, partSuffix) // <目标名> 或 <目标名>.<随机>
	if namePattern.MatchString(stem) {
		return stem
	}
	if i := strings.LastIndex(stem, "."); i > 0 && namePattern.MatchString(stem[:i]) {
		return stem[:i]
	}
	return ""
}

// Move 把 bvid 的缓存文件搬到 dst。
//
// 语义是**移动**：搬完缓存里就没有了。下载链路**不用它**（用的是 CopyPath ——
// 缓存必须留着，否则「下载之后再试听」就得重新联网，见 CopyPath 的说明）；
// 现在只剩「换下载目录时迁移用户文件」这一条路径会用到，那里源本就该消失。
// 跨盘符时 os.Rename 会失败，此时退化成「复制 + 删除」，复制没成功就绝不动原缓存。
func (s *Store) Move(bvid, dst string) error {
	path, _, ok := s.LookupAny(bvid, "")
	if !ok {
		return os.ErrNotExist
	}
	return s.MovePath(path, dst)
}

// MovePath 把一个已知的缓存路径搬到 dst（调用方已经 Lookup 过时用）。
//
// 注意：这条语义是**消费掉缓存**。下载链路已经不用它了（改用 CopyPath，
// 见那里的说明），现在只剩「换下载目录时迁移文件」（services_download.go
// #migrateDir）在用它 —— 那里搬的确实是用户目录里的文件，源本就该消失。
func (s *Store) MovePath(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	if err := MoveFile(src, dst); err != nil {
		return err
	}
	s.forget(nameOf(src))
	return nil
}

// CopyPath 把缓存文件**复制**到 dst，源缓存保留（调用方已经 Lookup 过时用）。
//
// 与 MovePath 的差别只有一条：源文件留不留。为什么需要「留」：
//
//	下载一首试听过的歌，以前是把缓存**搬走**（Move）—— 省一份磁盘，代价是
//	这首歌从此在缓存里消失了。于是「下载之后再点试听」就变成缓存未命中，
//	而命中判定与后端可播放性（虚拟表登记）都挂在缓存文件上：一旦中间任何一环
//	（重开进程后的虚拟表、重新解析直链失败）没接上，用户看到的就是
//	「找不到歌曲 / 无法播放」。
//
// 缓存是**可丢弃、可再生**的派生数据，而下载是用户的文件：让两者各自独立，
// 播放链路就再也不会被「下载」这个动作破坏。多占的那一份磁盘由缓存预算
// （cacheBudgetBytes）与空闲清理负责，见 internal/onlinesource 与
// online_cache_cleanup.go。
func (s *Store) CopyPath(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	if err := copyAndSync(in, dst); err != nil {
		_ = in.Close()
		return err
	}
	return in.Close()
}

// MoveFile 把一个文件搬到 dst：优先 os.Rename（同盘符时原子完成），
// 跨盘符 Rename 会失败，此时退化为「复制 + 删除」，复制没成功就绝不动原文件。
//
// ★ 临时文件名必须唯一，不能写死成 `dst + ".moving"`（第六轮审查 N-3）。
//
// 为什么：固定名是**所有调用者共享**的一个名字 —— 两个搬运同时指向同一个 dst
// 时（下载侧在真正 Move 之前会先把 `uniquePath` 预留的占位文件删掉，预留窗口
// 并不覆盖搬运本身；目录迁移那边也可能被点两次），两个 os.Create 会截断对方
// 正在写的文件，字节交错后改名出去的是**谁都不是**的坏文件，而目标名会被当成
// 一份完好的下载。（同一个教训在写缓存那条路上已经吃过一次：见 writeAtomic。）
//
// 另外，固定名一旦被别的什么东西占住（残留文件、被占用、恰是个目录），
// 这条回退路径就会**永久失败**；随机名 + O_EXCL 把这种情况变成换个名字重试。
func MoveFile(src, dst string) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	return copyThenRemove(src, dst)
}

// copyThenRemove 是跨盘符那一条回退路径：复制到独占的临时文件，成功后原子改名。
//
// 单独拆出来是为了**能被测到**：正常机器上同一个盘符内 Rename 永远成功，
// 这条路径平时跑不到，而它恰恰是最容易写错的一条（见 MoveFile 的说明）。
//
// ★ 源文件句柄必须在 os.Remove(src) **之前**关掉（第六轮审查 N-3 顺带发现）：
// Windows 不允许删除正被打开的文件（`being used by another process`），而
// 旧实现写的是 `defer in.Close()` —— defer 活到函数返回之后，函数最后一步
// 却是删源文件，于是这条回退路径**永远**在最后一步失败：复制和改名其实都
// 成功了，函数却报错，调用方当成「搬运失败」把刚搬好的文件删掉重下（下载）
// 或报「迁移失败」（换下载目录）。也就是说跨盘符搬运此前根本走不通。
func copyThenRemove(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	if err := copyAndSync(in, dst); err != nil {
		_ = in.Close()
		return err
	}
	if err := in.Close(); err != nil {
		return err
	}
	return os.Remove(src)
}

// copyAndSync 把 r 的内容写进 dst 的**独占**临时文件，落盘后原子改名到 dst。
func copyAndSync(r io.Reader, dst string) error {
	out, err := createUnique(dst, movingSuffix)
	if err != nil {
		return err
	}
	tmp := out.Name()

	if _, err := io.Copy(out, r); err != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Sync(); err != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// Remove 删掉某个 bvid 的缓存（含可能存在的半成品）。
func (s *Store) Remove(bvid string) {
	for _, ext := range extensions {
		if path, ok := s.Path(bvid, ext); ok {
			_ = os.Remove(path)
			removeParts(path) // 临时名带随机后缀，必须按前缀扫，不能写死一个名字
		}
	}
	s.forget(bvid)
}

// Clear 清空整个缓存目录。
//
// 只删**我们自己命名的**文件（见 namePattern 与 cacheName，含新旧两种半成品名）：
// 缓存目录理论上只属于本程序，但用户完全可能把它指到一个共用目录
// （比如整个临时目录）—— 「清空试听缓存」不该删掉无关文件。
func (s *Store) Clear() error {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if cacheName(name) == "" {
			continue
		}
		_ = os.Remove(filepath.Join(s.dir, name))
	}
	s.mu.Lock()
	s.entries = map[string]*entry{}
	s.mu.Unlock()
	return nil
}

// BudgetBytes 是试听缓存的总预算（512MB），导出给空闲清理用。
//
// 为什么需要它：预算平时由写缓存时的 LRU 兜住（evictIfNeeded），但「上一轮
// 运行留下的、本进程从没写过的东西」不在这条路径上 —— 空闲清理要用同一个
// 数字判断「是不是该启用磁盘压力条款」。
func BudgetBytes() int64 { return cacheBudgetBytes }

// Entry 是缓存目录里的一个**成品**文件快照（供空闲清理决策用）。
//
// 为什么不复用内存里的 entries：那份记账只覆盖「本次进程写入过的东西」，
// 而缓存是跨进程的 —— 上次运行留下的文件同样是有效缓存，空闲清理必须
// 看到它们（它们恰恰是最可能长期没被碰过的那批）。
type Entry struct {
	// Name 是文件名（形如 `<bvid>.m4a`）。
	Name string
	// Path 是完整路径。
	Path string
	// BVID 是从文件名解析出来的视频 id（拿不到时为空，调用方应跳过）。
	BVID string
	// Size 是文件字节数。
	Size int64
	// ModTime 是文件最后修改时间 —— 也就是**最后一次写入**的时间。
	//
	// 它是清理判据里「闲置了多久」的依据：命中缓存播放只刷新内存 LRU，
	// 不会改文件时间；而判据要的正是「多久没重新下载过」，比 mtime 更保守
	// （宁可留着，也不删用户昨天刚听过的歌）。
	ModTime time.Time
}

// List 列出缓存目录里的成品文件（跳过半成品与不认识的名字）。
//
// 只读目录、不碰 index.json 之类的无关文件（见 Clear 的说明）。
func (s *Store) List() []Entry {
	list, err := os.ReadDir(s.dir)
	if err != nil {
		return nil
	}
	out := make([]Entry, 0, len(list))
	for _, e := range list {
		if e.IsDir() || !namePattern.MatchString(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, Entry{
			Name:    e.Name(),
			Path:    filepath.Join(s.dir, e.Name()),
			BVID:    bvidOfName(e.Name()),
			Size:    info.Size(),
			ModTime: info.ModTime(),
		})
	}
	return out
}

// RemoveName 按文件名删掉一个缓存文件，并同步内存记账。
//
// 只删**合法缓存名**的文件：调用方可能传进任意字符串（界面/清理逻辑），
// 这里再挡一道，绝不删缓存目录里不属于我们的东西。
func (s *Store) RemoveName(name string) error {
	if cacheName(name) == "" {
		return fmt.Errorf("onlinecache: %q 不是缓存文件名", name)
	}
	err := os.Remove(filepath.Join(s.dir, name))
	// 文件本来就不在也算删成功（清理的目标是「它不在」）。
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	s.forget(bvidOfName(name))
	return nil
}

// bvidOfName 从缓存文件名解析 bvid（形如 `BV1xx.m4a` → `BV1xx`）。
//
// 认不出时返回空串：调用方必须把空串当作「不认识这个名字」而不是
// 「一个叫空的歌曲」——否则清理会漏掉判断、误删。
func bvidOfName(name string) string {
	if !namePattern.MatchString(name) {
		return ""
	}
	return strings.TrimSuffix(name, filepath.Ext(name))
}

// Stats 返回缓存的文件数与总字节数（供设置界面显示）。
//
// 直接读目录而不是看 entries：entries 只在本次进程写入过才有记录，
// 而缓存是**跨进程**存在的（上次运行留下的文件同样是有效缓存）。
func (s *Store) Stats() (count int, bytes int64) {
	list, err := os.ReadDir(s.dir)
	if err != nil {
		return 0, 0
	}
	for _, e := range list {
		if e.IsDir() || !namePattern.MatchString(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		count++
		bytes += info.Size()
	}
	return count, bytes
}

// Exists 报告某个 bvid 是否有可用缓存（等价于 Lookup 的布尔部分）。
func (s *Store) Exists(bvid string) bool {
	_, _, ok := s.LookupAny(bvid, "")
	return ok
}

/* --------------------------------------------------------------------------
   记账与淘汰
   -------------------------------------------------------------------------- */

func (s *Store) touch(key, path string, size int64) {
	s.mu.Lock()
	s.entries[key] = &entry{path: path, size: size, usedAt: time.Now().UnixMilli()}
	s.mu.Unlock()
}

func (s *Store) forget(key string) {
	s.mu.Lock()
	delete(s.entries, key)
	s.mu.Unlock()
}

// evictIfNeeded 超出预算时按最久未使用淘汰。
//
// 与 media.Server 的转码缓存同一思路：只淘汰**本次进程记账过**的条目。
// 上次运行留下的文件不在 entries 里，因此不会被这里删掉 —— 那需要扫描目录，
// 而「为了淘汰去遍历整个缓存目录」在每次写入后都做一次是不划算的。
// 真正兜底的是系统对临时目录的清理。
func (s *Store) evictIfNeeded() {
	s.mu.Lock()
	var total int64
	for _, it := range s.entries {
		total += it.size
	}
	if total <= cacheBudgetBytes {
		s.mu.Unlock()
		return
	}
	type victim struct {
		key    string
		path   string
		size   int64
		usedAt int64
	}
	list := make([]victim, 0, len(s.entries))
	for k, it := range s.entries {
		list = append(list, victim{key: k, path: it.path, size: it.size, usedAt: it.usedAt})
	}
	s.mu.Unlock()

	// 简单选择排序式淘汰：建成临时切片后在锁外删文件，
	// 避免持锁做 IO（删大文件可能耗时）。
	for i := 0; i < len(list) && total > cacheBudgetBytes; i++ {
		oldest := i
		for j := i + 1; j < len(list); j++ {
			if list[j].usedAt < list[oldest].usedAt {
				oldest = j
			}
		}
		list[i], list[oldest] = list[oldest], list[i]
		_ = os.Remove(list[i].path)
		s.forget(list[i].key)
		total -= list[i].size
	}
}

/* --------------------------------------------------------------------------
   名字工具
   -------------------------------------------------------------------------- */

// safeName 由 bvid 与扩展名算出安全的缓存文件名；无法安全生成时返回空串。
func safeName(bvid, ext string) string {
	id := sanitizeID(bvid)
	if id == "" {
		return ""
	}
	e := NormalizeExt(ext)
	name := id + e
	if !namePattern.MatchString(name) {
		return ""
	}
	return name
}

// sanitizeID 把 bvid 收敛成「只含字母数字下划线连字符」的串。
//
// 不是简单替换非法字符而是要**保证结果依然唯一可辨**：bvid 本身就只有
// [A-Za-z0-9]，正常路径上这个函数是恒等的；它存在的意义是「万一远端给了
// 别的东西」，此时宁可返回空串（当作没有缓存）也不要拼出一个可能越界的路径。
func sanitizeID(bvid string) string {
	bvid = strings.TrimSpace(bvid)
	if bvid == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range bvid {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_', r == '-':
			b.WriteRune(r)
		default:
			// 出现任何其它字符就意味着这不是我们认识的 bvid：放弃，
			// 让调用方走「没有缓存」而不是冒险拼路径。
			return ""
		}
	}
	out := b.String()
	// 长度上限：bvid 是 12 位左右，超过 64 位的一定不是它
	if len(out) > 64 {
		return ""
	}
	return out
}

// nameOf 从完整路径取文件名去掉扩展名，作为记账键（= bvid）。
func nameOf(path string) string {
	base := filepath.Base(path)
	return strings.TrimSuffix(base, filepath.Ext(base))
}
