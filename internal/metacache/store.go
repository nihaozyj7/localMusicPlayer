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
//	covers/<songID>.<ext>    封面原图
//	covers/index.json        songID → {file, mime, source, at}
//	lyrics/<songID>.lrc      歌词文本
//	lyrics/index.json        songID → {file, source, at}
//
// 文件名用 bootstrap.StableID 派生的 songID，天然避免了非法字符与路径穿越。
package metacache

import (
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

// CoverEntry 一条封面缓存记录。
type CoverEntry struct {
	File   string `json:"file"`   // 相对 covers/ 的文件名
	MIME   string `json:"mime"`   // image/jpeg 等
	Source string `json:"source"` // 来源：itunes / netease / user / bilibili …
	At     int64  `json:"at"`     // 写入时间（毫秒）
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

/* --------------------------------------------------------------------------
   封面
   -------------------------------------------------------------------------- */

// SaveCover 把封面字节写入缓存，返回缓存文件路径。
//
// 同 songID 重复写入会直接覆盖（用户换封面时就是要覆盖）。
func (s *Store) SaveCover(songID, mime string, data []byte, source string) (string, error) {
	songID = strings.TrimSpace(songID)
	if songID == "" {
		return "", errors.New("歌曲 id 为空")
	}
	if len(data) == 0 {
		return "", errors.New("封面数据为空")
	}
	if int64(len(data)) > s.maxEach {
		return "", fmt.Errorf("封面过大（%d 字节，上限 %d）", len(data), s.maxEach)
	}
	ext := extForMIME(mime)
	dir := filepath.Join(s.dir, string(KindCover))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("创建封面缓存目录失败: %w", err)
	}
	name := songID + ext
	full := filepath.Join(dir, name)

	// 先写临时文件再改名：避免读到写了一半的图片
	tmp := full + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return "", fmt.Errorf("写入封面缓存失败: %w", err)
	}
	if err := os.Rename(tmp, full); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("保存封面缓存失败: %w", err)
	}

	s.mu.Lock()
	s.ensureLoadedLocked()
	s.covers[songID] = CoverEntry{File: name, MIME: mime, Source: source, At: time.Now().UnixMilli()}
	err := s.saveIndexLocked(KindCover)
	s.mu.Unlock()
	if err != nil {
		return full, err
	}
	return full, nil
}

// CoverPath 返回某首歌封面缓存的绝对路径；没有缓存时第二个返回值为 false。
func (s *Store) CoverPath(songID string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	entry, ok := s.covers[songID]
	if !ok {
		return "", false
	}
	full := filepath.Join(s.dir, string(KindCover), entry.File)
	if _, err := os.Stat(full); err != nil {
		return "", false
	}
	return full, true
}

// CoverDataURL 把缓存里的封面读成 data URL（前端就能直接 <img src>）。
func (s *Store) CoverDataURL(songID string) (string, bool) {
	path, ok := s.CoverPath(songID)
	if !ok {
		return "", false
	}
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return "", false
	}
	mime := s.CoverMIME(songID)
	if mime == "" {
		mime = sniffMIME(data)
	}
	return "data:" + mime + ";base64," + base64Encode(data), true
}

// CoverMIME 缓存里记录的封面类型。
func (s *Store) CoverMIME(songID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	return s.covers[songID].MIME
}

// CoverSource 返回这张封面的来源（user 表示用户手动选的）。
func (s *Store) CoverSource(songID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureLoadedLocked()
	return s.covers[songID].Source
}

// DeleteCover 删除某首歌的封面缓存（用户点「恢复原始封面」时用）。
func (s *Store) DeleteCover(songID string) error {
	s.mu.Lock()
	entry, ok := s.covers[songID]
	delete(s.covers, songID)
	var saveErr error
	if ok {
		saveErr = s.saveIndexLocked(KindCover)
	}
	s.mu.Unlock()
	if ok && entry.File != "" {
		_ = os.Remove(filepath.Join(s.dir, string(KindCover), entry.File))
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
	name := songID + ".lrc"
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
			s.covers[id] = entry
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

func (s *Store) saveIndexLocked(kind Kind) error {
	var payload any
	switch kind {
	case KindCover:
		payload = map[string]any{"version": 1, "entries": s.covers}
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
