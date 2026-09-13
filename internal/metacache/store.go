// Package metacache 负责歌曲封面与歌词的本地缓存，以及（可选的）写回歌曲元数据。
//
// 为什么单独成包：
//   - 「缓存」与「写标签」是两件独立的事，但都围绕同一份数据（封面字节、LRC 文本），
//     放在一起才能保证「用户看到的」与「写进文件的」是同一份内容；
//   - 写标签是**有损操作**（会改写用户的音乐文件），失败必须只降级成「缓存成功、
//     嵌入失败」，绝不能因此让封面功能整体不可用。这个包把两种结果的边界划清楚：
//     Save* 永远成功（只要缓存目录可写），Embed* 单独返回结果。
//
// 缓存目录布局（位于配置的 cacheDir 下）：
//
//	covers/<songID>.<ext>           旧（v1）封面原图，只读，不再新增
//	covers/<songID>-<hash8><ext>    v2 多封面：一张一个文件，hash 去重
//	covers/index.json               songID → {v1 字段, items[], active}
//	lyrics/<songID>.lrc             歌词文本
//	lyrics/index.json               songID → {file, source, at}
//
// 文件名用 bootstrap.StableID 派生的 songID，天然避免了非法字符与路径穿越。
//
// # 关于索引的 v1 / v2
//
// v1 的索引是**扁平**的（{file,mime,source,at} 只有一张封面）。v2 改成
// items[] 数组 + active 指向「当前生效」的那一张，因为一首歌往往有多张封面
// （正面/背面/CD 盘面），用户还要在播放界面轮播它们。
//
// 兼容策略是双向的，缺一不可：
//   - **读**：loadIndexLocked 会把 v1 的扁平结构就地升级成 items[1]，
//     老的缓存目录不用迁移、不会读成「没有封面」；
//   - **写**：保存时把 v1 字段同步成「当前生效那一张」，这样万一用户回退到
//     旧版本（或者别的工具只认 v1），读到的也不是空。
package metacache

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Kind 缓存类别。
type Kind string

const (
	KindCover  Kind = "covers"
	KindLyrics Kind = "lyrics"
)

// CoverFile 一张已缓存的封面。
//
// 为什么不复用旧的 CoverEntry：v2 需要每张图自己的尺寸、内容 hash（去重）
// 与写入时间，而 v1 的四个字段只描述「唯一的那张」。
type CoverFile struct {
	File   string `json:"file"`
	MIME   string `json:"mime"`
	Source string `json:"source"`
	Width  int    `json:"width,omitempty"`
	Height int    `json:"height,omitempty"`
	Hash   string `json:"hash,omitempty"` // 内容 hash（去重用）
	At     int64  `json:"at"`
}

// CoverEntry 一首歌的封面集合（v2），同时携带 v1 兼容字段。
//
// v1 字段（File/MIME/Source/At）不参与 v2 的逻辑，只是在保存时被同步成
// 「当前生效那一张」的快照；读取时如果 items 为空则用它们做一次迁移。
//
// 这里**没有**「轮播开关」字段：轮播是全局偏好（设置 → 播放界面 →
// 封面轮播），存在 bootstrap.Config 里。一首歌有几张封面是数据，
// 「要不要轮着看」是习惯，放在每首歌里会长出「这首开、那首关」的两份真相。
type CoverEntry struct {
	// ---- v1 兼容字段（保存时同步为当前生效项）----
	File   string `json:"file,omitempty"`
	MIME   string `json:"mime,omitempty"`
	Source string `json:"source,omitempty"`
	At     int64  `json:"at,omitempty"`
	// ---- v2 ----
	Items  []CoverFile `json:"items,omitempty"`
	Active int         `json:"active"`
}

// LyricsEntry 一条歌词缓存记录。
type LyricsEntry struct {
	File   string `json:"file"`
	Source string `json:"source"`
	At     int64  `json:"at"`
}

// Store 缓存存储。零值不可用，请用 New。
type Store struct {
	mu      sync.Mutex
	dir     string
	covers  map[string]CoverEntry
	lyrics  map[string]LyricsEntry
	loaded  bool
	maxEach int64
}

// maxCoverBytes 单张封面的缓存上限。超过就拒绝写入（避免把缓存撑爆）。
const maxCoverBytes = 6 << 20

// maxCoverCount 一首歌最多保留多少张封面。
//
// 多封面是给「正面/背面/盘面」这类少数几张用的，不是相册。设个上限是为了
// 挡住异常调用方（例如前端 bug 循环追加）把索引和缓存目录撑爆。
const maxCoverCount = 12

// coverHashLen hash 在文件名里保留的十六进制位数。
//
// 8 位（32 bit）看起来不长，但它是**每首歌内部**的去重键：同一首歌里两张
// 不同图片撞上同一个 32 位前缀的概率可以忽略，而短文件名更好读。
const coverHashLen = 8

// NewStore 创建（或复用）缓存存储；dir 是缓存根目录。
func NewStore(dir string) *Store {
	return &Store{
		dir:     dir,
		covers:  map[string]CoverEntry{},
		lyrics:  map[string]LyricsEntry{},
		maxEach: maxCoverBytes,
	}
}

// Dir 返回缓存根目录。
func (s *Store) Dir() string { return s.dir }

/*
--------------------------------------------------------------------------

	文件名安全化
	--------------------------------------------------------------------------
	本地歌曲的 id 是从路径派生的十六进制串，本来就是合法文件名；
	但在线试听曲目的 id 形如 "bili:BV1xx411c7mD" —— 冒号在 Windows 上是
	非法文件名字符，直接拿来当文件名会得到
	「rename ... The parameter is incorrect」（实测到的报错），
	于是「试听时匹配的歌词/封面」永远存不下来。

	这里只做两件事：把非法字符换成 _xxxx（码点），并在**改动过**时追加一个
	短哈希，避免「本来就叫 a_003ab」和「a:b 转义后」撞名。
	没改动时原样返回，这样老缓存（正常 id）的文件名完全不变。
	--------------------------------------------------------------------------
*/
func safeFileID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return id
	}
	changed := false
	var b strings.Builder
	b.Grow(len(id) + 8)
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '-', r == '_', r == '.', r == '@', r == '(', r == ')':
			b.WriteRune(r)
		default:
			changed = true
			fmt.Fprintf(&b, "_%04x", r)
		}
	}
	out := b.String()
	if out == "" {
		changed = true
		out = "id"
	}
	// 首字符是点会让文件变成隐藏文件，也不适合当 id
	if strings.HasPrefix(out, ".") {
		changed = true
		out = "id" + out
	}
	if len(out) > 120 {
		// 超长文件名在 Windows 上同样会失败
		changed = true
		out = out[:120]
	}
	if changed {
		h := fnv32a(id)
		out = fmt.Sprintf("%s_%08x", out, h)
	}
	return out
}

// fnv32a 一个小而稳定的哈希（仅用于文件名去重，不用于安全用途）。
func fnv32a(s string) uint32 {
	const (
		offset32 = 2166136261
		prime32  = 16777619
	)
	h := uint32(offset32)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= prime32
	}
	return h
}

/* --------------------------------------------------------------------------
   封面（多封面 + 当前生效 + 轮播）
   --------------------------------------------------------------------------
   存储约定：
     - 每张图一个文件，名字是 <safeID>-<hash8><ext>，hash 由内容算出，
       因此**同一张图重复添加不会重复占盘**，也不会在 items 里出现两条；
     - 旧版本留下的 <safeID><ext>（v1 命名）原样保留、照常能读，
       我们不再往那个名字上写（会被 hash 名覆盖语义搞乱）；
     - items 的顺序 = 写入顺序 = 写进歌曲文件时的顺序（第一张是封面正面）。
   -------------------------------------------------------------------------- */

// coversLocked 返回某首歌的封面条目副本（调用方必须已持锁）。
//
// 返回副本而不是切片本身：items 会被 SetActive / Remove 改写，
// 把内部切片暴露出去极易在别处被就地修改（这类 bug 很难查）。
// 「活跃下标」通过下方 resolveActive 统一夹取，避免各处重复判断越界。
func (s *Store) coversLocked(songID string) (CoverEntry, bool) {
	entry, ok := s.covers[songID]
	if !ok {
		return CoverEntry{}, false
	}
	entry.Items = append([]CoverFile(nil), entry.Items...)
	return entry, true
}

// resolveActive 把 active 下标夹到合法范围。
//
// 为什么要有这一层：索引是 JSON 文本，用户手改过、或者旧版本写下的
// 越界 active 都很常见。直接拿它去索引会 panic —— 一个坏索引不该让
// 整个播放器崩掉，夹一下就好了。
func resolveActive(entry CoverEntry) int {
	if len(entry.Items) == 0 {
		return 0
	}
	idx := entry.Active
	if idx < 0 {
		idx = 0
	}
	if idx >= len(entry.Items) {
		idx = len(entry.Items) - 1
	}
	return idx
}

// activeItem 取「当前生效」的那张（没有封面时返回零值与 false）。
func activeItem(entry CoverEntry) (CoverFile, bool) {
	if len(entry.Items) == 0 {
		return CoverFile{}, false
	}
	return entry.Items[resolveActive(entry)], true
}

// Covers 返回这首歌缓存里的全部封面（按写入顺序）。
func (s *Store) Covers(songID string) []CoverFile {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	entry, ok := s.coversLocked(songID)
	if !ok {
		return nil
	}
	return entry.Items
}

// CoverCount 返回这首歌缓存了多少张封面。
func (s *Store) CoverCount(songID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	return len(s.covers[songID].Items)
}

// ActiveCover 返回当前生效那张封面的下标（没有封面时返回 0）。
func (s *Store) ActiveCover(songID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	return resolveActive(s.covers[songID])
}

// SaveCover 把封面字节写入缓存，返回缓存文件路径。
//
// 保留这个名字是因为它被上层与测试大量调用（语义 = 加一张并设为当前生效）。
// 真正的实现在 AddCover 里。
func (s *Store) SaveCover(songID, mime string, data []byte, source string) (string, error) {
	item, err := s.AddCover(songID, mime, data, source, 0, 0)
	if err != nil {
		return "", err
	}
	return filepath.Join(s.dir, string(KindCover), item.File), nil
}

// AddCover 追加一张封面并把它设为当前生效，返回这一项的元数据。
//
// 内容 hash 相同的图**复用已有项**：不重复写文件、不重复追加，
// 只是把它切回当前生效。用户反复点同一张封面（或前端把同一张图
// 用不同来源报了两次）时，缓存目录不会长出一堆一模一样的文件。
func (s *Store) AddCover(songID, mime string, data []byte, source string, width, height int) (CoverFile, error) {
	songID = strings.TrimSpace(songID)
	if songID == "" {
		return CoverFile{}, errors.New("歌曲 id 为空")
	}
	if len(data) == 0 {
		return CoverFile{}, errors.New("封面数据为空")
	}
	if int64(len(data)) > s.maxEach {
		return CoverFile{}, fmt.Errorf("封面过大（%d 字节，上限 %d）", len(data), s.maxEach)
	}
	// mime 归一化：空值与 image/jpg 这类别名都会落到 .jpg，和 extForMIME 一致
	mime = strings.TrimSpace(mime)
	if mime == "" {
		mime = sniffMIME(data)
	}
	ext := extForMIME(mime)
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	short := hash
	if len(short) > coverHashLen {
		short = short[:coverHashLen]
	}
	safeID := safeFileID(songID)
	name := safeID + "-" + short + ext
	at := time.Now().UnixMilli()

	dir := filepath.Join(s.dir, string(KindCover))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return CoverFile{}, fmt.Errorf("创建封面缓存目录失败: %w", err)
	}
	full := filepath.Join(dir, name)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()

	entry := s.covers[songID]
	// 先去重：同一内容已经在 items 里就不再落盘
	for i, it := range entry.Items {
		if it.Hash == hash {
			entry.Active = i
			// 顺手修正缺失的尺寸（老索引里没有这两个字段）
			if entry.Items[i].Width == 0 && width > 0 {
				entry.Items[i].Width = width
			}
			if entry.Items[i].Height == 0 && height > 0 {
				entry.Items[i].Height = height
			}
			s.covers[songID] = syncV1(entry)
			if err := s.saveIndexLocked(KindCover); err != nil {
				return CoverFile{}, err
			}
			return entry.Items[i], nil
		}
	}
	if len(entry.Items) >= maxCoverCount {
		return CoverFile{}, fmt.Errorf("这首歌的封面数量已达上限（%d 张）", maxCoverCount)
	}

	// 先写临时文件再改名：避免读到写了一半的图片
	tmp := full + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return CoverFile{}, fmt.Errorf("写入封面缓存失败: %w", err)
	}
	if err := os.Rename(tmp, full); err != nil {
		_ = os.Remove(tmp)
		return CoverFile{}, fmt.Errorf("保存封面缓存失败: %w", err)
	}

	item := CoverFile{File: name, MIME: mime, Source: source, Width: width, Height: height, Hash: hash, At: at}
	entry.Items = append(entry.Items, item)
	entry.Active = len(entry.Items) - 1
	s.covers[songID] = syncV1(entry)
	if err := s.saveIndexLocked(KindCover); err != nil {
		return item, err
	}
	return item, nil
}

// syncV1 把 v1 兼容字段同步成「当前生效那一张」的快照。
//
// 为什么每次都要同步：旧版本（以及只认 v1 的外部工具）读 index.json 时
// 只看 File/MIME/Source。如果这里不写，回退旧版本就会看到「这首没有封面」。
func syncV1(entry CoverEntry) CoverEntry {
	item, ok := activeItem(entry)
	if !ok {
		entry.File, entry.MIME, entry.Source, entry.At = "", "", "", 0
		return entry
	}
	entry.File, entry.MIME, entry.Source, entry.At = item.File, item.MIME, item.Source, item.At
	return entry
}

// CoverPath 返回**当前生效**那张封面的绝对路径；没有缓存时第二个返回值为 false。
func (s *Store) CoverPath(songID string) (string, bool) {
	return s.CoverPathAt(songID, -1)
}

// CoverPathAt 返回第 idx 张封面的绝对路径；idx 为 -1（或任意负数）时取当前生效那张。
func (s *Store) CoverPathAt(songID string, idx int) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	entry, ok := s.covers[songID]
	if !ok || len(entry.Items) == 0 {
		return "", false
	}
	if idx < 0 {
		idx = resolveActive(entry)
	}
	if idx >= len(entry.Items) {
		return "", false
	}
	full := filepath.Join(s.dir, string(KindCover), entry.Items[idx].File)
	if _, err := os.Stat(full); err != nil {
		return "", false
	}
	return full, true
}

// CoverDataURL 把**当前生效**那张封面读成 data URL（前端就能直接 <img src>）。
func (s *Store) CoverDataURL(songID string) (string, bool) {
	return s.CoverDataURLAt(songID, -1)
}

// CoverDataURLAt 把第 idx 张封面读成 data URL；idx 为负时取当前生效那张。
func (s *Store) CoverDataURLAt(songID string, idx int) (string, bool) {
	data, mime, ok := s.CoverBytesAt(songID, idx)
	if !ok {
		return "", false
	}
	return "data:" + mime + ";base64," + base64Encode(data), true
}

// CoverDataURLs 返回这首歌全部封面的 data URL（按 items 顺序）。
func (s *Store) CoverDataURLs(songID string) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	entry, ok := s.coversLocked(songID)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(entry.Items))
	for i := range entry.Items {
		if data, mime, ok := s.readItemLocked(entry.Items[i]); ok {
			out = append(out, "data:"+mime+";base64,"+base64Encode(data))
		}
	}
	return out
}

// CoverBytesAt 直接读出第 idx 张封面的原始字节与类型；idx 为负时取当前生效那张。
//
// 「写回歌曲文件」需要原始字节（要重新编码进 covr / PICTURE），
// 走 data URL 再解回来纯属浪费，所以单独留这个方法。
func (s *Store) CoverBytesAt(songID string, idx int) ([]byte, string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	entry, ok := s.covers[songID]
	if !ok || len(entry.Items) == 0 {
		return nil, "", false
	}
	if idx < 0 {
		idx = resolveActive(entry)
	}
	if idx >= len(entry.Items) {
		return nil, "", false
	}
	return s.readItemLocked(entry.Items[idx])
}

// readItemLocked 读一张封面文件的字节，并补齐 MIME（索引里没有就按魔数嗅探）。
func (s *Store) readItemLocked(item CoverFile) ([]byte, string, bool) {
	data, err := os.ReadFile(filepath.Join(s.dir, string(KindCover), item.File))
	if err != nil || len(data) == 0 {
		return nil, "", false
	}
	mime := item.MIME
	if mime == "" {
		mime = sniffMIME(data)
	}
	return data, mime, true
}

// CoverMIME **当前生效**那张封面的类型。
func (s *Store) CoverMIME(songID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	item, ok := activeItem(s.covers[songID])
	if !ok {
		return ""
	}
	return item.MIME
}

// CoverSource 返回**当前生效**那张封面的来源（user 表示用户手动选的）。
func (s *Store) CoverSource(songID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	item, ok := activeItem(s.covers[songID])
	if !ok {
		return ""
	}
	return item.Source
}

// SetActiveCover 把第 idx 张设为当前生效。
//
// 越界返回错误而不是静默夹取：这是用户点出来的操作，落在一个不存在的
// 下标上说明前端的列表和缓存已经不一致，明确报错更好排查。
func (s *Store) SetActiveCover(songID string, idx int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	entry, ok := s.covers[songID]
	if !ok || len(entry.Items) == 0 {
		return errors.New("这首歌还没有缓存封面")
	}
	if idx < 0 || idx >= len(entry.Items) {
		return fmt.Errorf("封面下标越界: %d（共 %d 张）", idx, len(entry.Items))
	}
	entry.Active = idx
	s.covers[songID] = syncV1(entry)
	return s.saveIndexLocked(KindCover)
}

// RemoveCover 删掉第 idx 张封面（文件 + 索引项），并修正当前生效下标。
//
// 删掉唯一一张 = 这首歌没有封面了（条目也一并移除，免得留下空壳）。
func (s *Store) RemoveCover(songID string, idx int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	entry, ok := s.covers[songID]
	if !ok || len(entry.Items) == 0 {
		return errors.New("这首歌还没有缓存封面")
	}
	if idx < 0 || idx >= len(entry.Items) {
		return fmt.Errorf("封面下标越界: %d（共 %d 张）", idx, len(entry.Items))
	}

	old := entry.Items[idx]
	active := resolveActive(entry)
	entry.Items = append(entry.Items[:idx:idx], entry.Items[idx+1:]...)
	switch {
	case len(entry.Items) == 0:
		// 最后一张没了：整个条目删掉（不留空壳）
		delete(s.covers, songID)
	default:
		if idx < active {
			// 删的是当前生效项之前的一张：下标整体前移一位
			active--
		} else if idx == active && active > len(entry.Items)-1 {
			// 删的正是当前生效项：顺延到后一张（没了就退回最后一张）
			active = len(entry.Items) - 1
		}
		entry.Active = active
		s.covers[songID] = syncV1(entry)
	}
	if err := s.saveIndexLocked(KindCover); err != nil {
		return err
	}
	// 索引已经落盘，文件删失败最多是留下一个孤儿文件（不影响正确性），
	// 所以放在锁外、错误也不外抛。
	if old.File != "" {
		_ = os.Remove(filepath.Join(s.dir, string(KindCover), old.File))
	}
	return nil
}

// DeleteCover 清空某首歌的全部封面缓存（用户点「恢复原始封面」时用）。
func (s *Store) DeleteCover(songID string) error {
	s.mu.Lock()
	entry, ok := s.covers[songID]
	delete(s.covers, songID)
	var saveErr error
	if ok {
		saveErr = s.saveIndexLocked(KindCover)
	}
	s.mu.Unlock()
	if ok {
		for _, item := range entry.Items {
			if item.File != "" {
				_ = os.Remove(filepath.Join(s.dir, string(KindCover), item.File))
			}
		}
		// v1 兼容：老索引迁移过来的项也在 Items 里，这里不用再单独删 File
	}
	return saveErr
}

// CoverIDs 返回所有已缓存封面的歌曲 id。
func (s *Store) CoverIDs() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	out := make([]string, 0, len(s.covers))
	for id := range s.covers {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

/* --------------------------------------------------------------------------
   歌词
   -------------------------------------------------------------------------- */

// SaveLyrics 把歌词文本写入缓存，返回缓存文件路径。
func (s *Store) SaveLyrics(songID, text, source string) (string, error) {
	songID = strings.TrimSpace(songID)
	if songID == "" {
		return "", errors.New("歌曲 id 为空")
	}
	if strings.TrimSpace(text) == "" {
		return "", errors.New("歌词内容为空")
	}
	dir := filepath.Join(s.dir, string(KindLyrics))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("创建歌词缓存目录失败: %w", err)
	}
	name := safeFileID(songID) + ".lrc"
	full := filepath.Join(dir, name)
	tmp := full + ".tmp"
	if err := os.WriteFile(tmp, []byte(text), 0o644); err != nil {
		return "", fmt.Errorf("写入歌词缓存失败: %w", err)
	}
	if err := os.Rename(tmp, full); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("保存歌词缓存失败: %w", err)
	}

	s.mu.Lock()
	s.ensureLoadedLocked()
	s.lyrics[songID] = LyricsEntry{File: name, Source: source, At: time.Now().UnixMilli()}
	err := s.saveIndexLocked(KindLyrics)
	s.mu.Unlock()
	if err != nil {
		return full, err
	}
	return full, nil
}

// LyricsPath 返回歌词缓存路径。
func (s *Store) LyricsPath(songID string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	entry, ok := s.lyrics[songID]
	if !ok {
		return "", false
	}
	full := filepath.Join(s.dir, string(KindLyrics), entry.File)
	if _, err := os.Stat(full); err != nil {
		return "", false
	}
	return full, true
}

// Lyrics 读取缓存歌词。
func (s *Store) Lyrics(songID string) (string, bool) {
	path, ok := s.LyricsPath(songID)
	if !ok {
		return "", false
	}
	data, err := os.ReadFile(path)
	if err != nil || len(strings.TrimSpace(string(data))) == 0 {
		return "", false
	}
	return string(data), true
}

// LyricsIDs 返回所有已缓存歌词的歌曲 id（「把缓存写进文件」要遍历它）。
func (s *Store) LyricsIDs() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	out := make([]string, 0, len(s.lyrics))
	for id := range s.lyrics {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

/* --------------------------------------------------------------------------
   统计
   -------------------------------------------------------------------------- */

// Stats 缓存占用概况（设置界面展示用）。
//
// 注意必须先 ensureLoadedLocked：索引是在第一次访问时才读盘的，
// 少了这一步在「刚启动还没查过封面」时会报成 0 张，设置界面就会显示
// 「还没有可写的缓存」——而实际上缓存目录里躺着几百张封面。
func (s *Store) Stats() map[string]any {
	s.mu.Lock()
	s.ensureLoadedLocked()
	covers := len(s.covers)
	lyrics := len(s.lyrics)
	s.mu.Unlock()

	return map[string]any{
		"dir":       s.dir,
		"covers":    covers,
		"lyrics":    lyrics,
		"coverDir":  filepath.Join(s.dir, string(KindCover)),
		"lyricsDir": filepath.Join(s.dir, string(KindLyrics)),
		"bytes":     dirSize(s.dir),
	}
}

/* --------------------------------------------------------------------------
   索引读写
   -------------------------------------------------------------------------- */

func (s *Store) indexPath(kind Kind) string {
	return filepath.Join(s.dir, string(kind), "index.json")
}

func (s *Store) ensureLoadedLocked() {
	if s.loaded {
		return
	}
	s.loaded = true
	_ = s.loadIndexLocked(KindCover)
	_ = s.loadIndexLocked(KindLyrics)
}

func (s *Store) loadIndexLocked(kind Kind) error {
	raw, err := os.ReadFile(s.indexPath(kind))
	if err != nil {
		return err
	}
	switch kind {
	case KindCover:
		var payload struct {
			Entries map[string]CoverEntry `json:"entries"`
		}
		if err := json.Unmarshal(raw, &payload); err != nil {
			return err
		}
		for id, entry := range payload.Entries {
			s.covers[id] = migrateCoverEntry(entry)
		}
	case KindLyrics:
		var payload struct {
			Entries map[string]LyricsEntry `json:"entries"`
		}
		if err := json.Unmarshal(raw, &payload); err != nil {
			return err
		}
		for id, entry := range payload.Entries {
			s.lyrics[id] = entry
		}
	}
	return nil
}

// migrateCoverEntry 把一条封面记录升级成 v2 形态（v1 → v2 迁移）。
//
// 为什么迁移要在这里做（而不是「读的时候特判一下 v1 字段」）：
// 迁移之后整个包内部只有一种形态，SetActive / Remove / EmbedCovers 这些
// 新逻辑不用到处写 `if len(Items)==0 { 用 File }`，少一处分支就少一处漏改。
//
// 三种输入都要能处理：
//   - v1 扁平结构（Items 为空、File 非空）→ 合成 items[1]；
//   - v2 结构（Items 非空）→ 只夹取 active 下标，不动 items；
//   - 两边都空/异常（File 也是空）→ 直接丢掉，别在内存里留空壳。
func migrateCoverEntry(entry CoverEntry) CoverEntry {
	if len(entry.Items) == 0 {
		if strings.TrimSpace(entry.File) == "" {
			// v1 里被写坏的空记录：丢掉，否则 CoverIDs() 会报出一堆「有封面」的歌
			return CoverEntry{}
		}
		entry.Items = []CoverFile{{
			File:   entry.File,
			MIME:   entry.MIME,
			Source: entry.Source,
			At:     entry.At,
		}}
		entry.Active = 0
	} else {
		entry.Active = resolveActive(entry)
	}
	return syncV1(entry)
}

func (s *Store) saveIndexLocked(kind Kind) error {
	var payload any
	switch kind {
	case KindCover:
		// version 2：entries 里每首歌带着 items 数组；但 v1 字段同时被同步成
		// 「当前生效那一张」，所以旧代码/旧版本读这个文件依然能拿到封面。
		payload = map[string]any{"version": 2, "entries": s.covers}
	case KindLyrics:
		payload = map[string]any{"version": 1, "entries": s.lyrics}
	default:
		return fmt.Errorf("未知缓存类别: %s", kind)
	}
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(s.dir, string(kind)), 0o755); err != nil {
		return err
	}
	return os.WriteFile(s.indexPath(kind), raw, 0o644)
}

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */

func extForMIME(mime string) string {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "image/avif":
		return ".avif"
	default:
		return ".jpg"
	}
}

func sniffMIME(b []byte) string {
	if len(b) < 12 {
		return "image/jpeg"
	}
	switch {
	case b[0] == 0xFF && b[1] == 0xD8:
		return "image/jpeg"
	case string(b[0:8]) == "\x89PNG\r\n\x1a\n":
		return "image/png"
	case string(b[0:4]) == "RIFF" && string(b[8:12]) == "WEBP":
		return "image/webp"
	case string(b[0:6]) == "GIF87a" || string(b[0:6]) == "GIF89a":
		return "image/gif"
	case string(b[4:12]) == "ftypavif":
		return "image/avif"
	}
	return "image/jpeg"
}

// dirSize 递归统计目录占用（用于设置界面显示缓存大小）。
func dirSize(root string) int64 {
	var total int64
	_ = filepath.Walk(root, func(_ string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		total += info.Size()
		return nil
	})
	return total
}
