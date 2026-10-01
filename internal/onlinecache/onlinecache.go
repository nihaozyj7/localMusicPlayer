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
//	<dir>/<bvid><ext>            例如 …\LocalMusicPlayer\online\BV1xx411c7mD.m4a
//	<dir>/<bvid><ext>.part       写入中的半成品（永远不是合法的缓存文件）
//
// 用 bvid 直接做文件名：一个视频对应一份音频，天然去重；而且**可读**，
// 用户排查时一眼能认出是哪首歌。文件名要过滤（见 safeName），因为 bvid
// 来自远端/URL，不能直接当路径用。
package onlinecache

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
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

// partSuffix 是写入中的半成品后缀。
//
// 用独立后缀而不是「先写目标名再改名」：目标是**命中判据**，
// 一个写了一半的文件绝不能被 Lookup 看到。
const partSuffix = ".part"

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

	// mu 保护 map 与淘汰逻辑。文件本身的读写不加这个锁（那会串行化所有下载），
	// 并发写同一个 bvid 由 ensureWriter 的 O_EXCL 占位来挡。
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
// 写入策略与下载服务一致：先写 <name>.part，成功后**原子改名**。
// 这样 Lookup 永远不会看到一个写了一半的文件 —— 而「半成品被当成有效缓存」
// 正是「试听没声音」最隐蔽的一种成因。
//
// 已存在可用缓存时直接返回（不重复下载）。
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

// writeAtomic 写 <path>.part 再原子改名到 path。
func (s *Store) writeAtomic(path string, r io.Reader) (int64, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return 0, fmt.Errorf("创建试听缓存目录失败: %w", err)
	}
	tmp := path + partSuffix
	f, err := os.Create(tmp)
	if err != nil {
		return 0, fmt.Errorf("创建缓存文件失败: %w", err)
	}
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

// Move 把 bvid 的缓存文件搬到 dst（下载时用）。
//
// 语义是**移动**而不是复制：缓存是派生数据，搬到下载目录之后就该从缓存里
// 消失（否则同一首歌在磁盘上存在两份）。跨盘符时 os.Rename 会失败，
// 此时退化成「复制 + 删除」，复制没成功就绝不动原缓存。
func (s *Store) Move(bvid, dst string) error {
	path, _, ok := s.LookupAny(bvid, "")
	if !ok {
		return os.ErrNotExist
	}
	return s.MovePath(path, dst)
}

// MovePath 把一个已知的缓存路径搬到 dst（调用方已经 Lookup 过时用）。
func (s *Store) MovePath(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	if err := moveFile(src, dst); err != nil {
		return err
	}
	s.forget(nameOf(src))
	return nil
}

// moveFile 优先 Rename；跨盘符时退化为复制 + 删除。
func moveFile(src, dst string) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".moving"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
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
	return os.Remove(src)
}

// Remove 删掉某个 bvid 的缓存（含可能存在的半成品）。
func (s *Store) Remove(bvid string) {
	for _, ext := range extensions {
		if path, ok := s.Path(bvid, ext); ok {
			_ = os.Remove(path)
			_ = os.Remove(path + partSuffix)
		}
	}
	s.forget(bvid)
}

// Clear 清空整个缓存目录。
//
// 只删**我们自己命名的**文件（见 namePattern）与 .part 半成品：
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
		if !namePattern.MatchString(strings.TrimSuffix(name, partSuffix)) {
			continue
		}
		_ = os.Remove(filepath.Join(s.dir, name))
	}
	s.mu.Lock()
	s.entries = map[string]*entry{}
	s.mu.Unlock()
	return nil
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
