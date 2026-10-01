/* ==========================================================================
   services_unplayable.go — 「放不出来」的文件清单
   --------------------------------------------------------------------------
   需求（用户原话）：
     「可以触发扫描的时候判断音乐是损坏吗，在设置中的扫描结果哪里显示扫描到的
      不合法文件，点击可以查看是哪些文件」
     「只在播放的时候查，这样性能最优，播放的时候如果播放不了自动移除并在
      设置的扫描目录哪里提示出来」

   ★ 为什么不在扫描时校验（这是刻意的设计选择，别改成扫描时校验）

   扫描要遍历整个曲库（用户的库是 8725 首）。对每首都跑一次解码校验意味着：
     · 每首至少起一个 ffmpeg 进程（内置版本走 gcc 静态链接，启动 50~200ms），
       全库就是十几分钟起步；
     · 而且这个开销是**白花**的 —— 绝大多数文件永远是好的，检测结果也一样。

   播放时校验则是**零额外成本**的：那首歌的解码本来就要发生，失败了才知道
   它坏了。所以本模块不主动检测，只负责「登记播放时确实失败的那些文件」，
   也就是把已经付过的代价变成可见的信息。

   数据落在配置文件里（unplayableFiles），这样重启后仍在，且不占用曲库 IPC
   载荷 —— 曲库接口每首歌只有几十字节，塞不进失败原因这种长文本。
   ========================================================================== */

package main

import (
	"log"
	"strings"
	"sync"
	"time"

	"localmusicplayer/internal/bootstrap"
)

/* --------------------------------------------------------------------------
   事件名（与前端 frontend/src/js/audio.js 对齐）
   -------------------------------------------------------------------------- */

// unplayableEvent 是「有新的文件被判定放不出来」的通知。
//
// 前端收到后刷新清单缓存并弹一条可点击的提示（点击直达设置页的清单）。
// 载荷与 UnplayableService.List() 的元素同构，前端不必再拉一次。
const unplayableEvent = "library:unplayable"

/* --------------------------------------------------------------------------
   UnplayableService
   -------------------------------------------------------------------------- */

// UnplayableService 记录并管理「播放失败」的文件清单。
type UnplayableService struct {
	store *bootstrap.Store
	// lib 用于在登记后把这首歌从曲库里摘掉（可选，nil 时只登记不移除）
	lib unplayableLibrary
	// emit 发事件（可为 nil，见 setEmitter）
	emit func(name string, payload any)

	mu sync.Mutex
}

// unplayableLibrary 是本服务需要的曲库能力。
//
// 只抽三个方法而不是直接依赖 *LibraryService：这里既方便测试替身，
// 也把「本服务只该登记 / 移除 / 查询、不该做别的」写在类型上。
type unplayableLibrary interface {
	// DropSong 从曲库里移除一首歌（不动磁盘文件），返回是否确实移除了
	DropSong(songID string) bool
	// LookupSong 按 id 反查路径/标题/歌手/扩展名，第二个返回值是「找到没有」
	LookupSong(songID string) (path, title, artist, ext string, ok bool)
}

// NewUnplayableService 构造服务。
func NewUnplayableService(store *bootstrap.Store) *UnplayableService {
	return &UnplayableService{store: store}
}

// setLibrary 注入曲库（不导出：接收的是接口值，暴露给前端会让
// Wails 的绑定生成器报「non-empty interface type not supported」）。
func (s *UnplayableService) setLibrary(lib unplayableLibrary) {
	s.mu.Lock()
	s.lib = lib
	s.mu.Unlock()
}

// setEmitter 注入事件发送器（不导出，理由同 setLibrary）
func (s *UnplayableService) setEmitter(emit func(name string, payload any)) {
	s.mu.Lock()
	s.emit = emit
	s.mu.Unlock()
}

/* --------------------------------------------------------------------------
   暴露给前端的方法（Wails 绑定）
   -------------------------------------------------------------------------- */

// Report 登记一首「播放失败」的歌。前端在 playback failure 时调用。
//
// 参数：
//   - songID  歌曲 id（必填）
//   - reason  失败原因原文（来自后端错误或 <audio> 的错误码说明）
//   - path    文件路径（前端已知时传，便于用户在清单里认出是哪个文件）
//
// 返回登记后的条目（同一首歌重复上报会合并：次数累加、时间刷新、
// 原因以最新一次为准 —— 因为文件可能被换成另一种坏法）。
func (s *UnplayableService) Report(songID, reason, path string) map[string]any {
	if strings.TrimSpace(songID) == "" {
		return nil
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "未知原因"
	}

	// 路径与标题能从曲库补齐就补齐：前端有时拿不到（比如列表还没加载完）
	title, artist, ext := "", "", ""
	if p, t, a, e := s.lookupSong(songID); p != "" {
		if path == "" {
			path = p
		}
		title, artist, ext = t, a, e
	} else {
		ext = extOf(path)
	}
	if title == "" {
		title = fileNameOf(path)
	}

	now := time.Now().UnixMilli()
	entry := bootstrap.UnplayableFile{
		SongID:   songID,
		Path:     path,
		Title:    title,
		Artist:   artist,
		Ext:      ext,
		Reason:   reason,
		At:       now,
		Attempts: 1,
	}

	// 写进配置。Update 会落盘，所以重启后清单还在。
	var saved bootstrap.UnplayableFile
	existed := false
	_ = s.store.Update(func(c *bootstrap.Config) {
		for i := range c.UnplayableFiles {
			if c.UnplayableFiles[i].SongID != songID {
				continue
			}
			existed = true
			c.UnplayableFiles[i].Reason = reason
			c.UnplayableFiles[i].At = now
			c.UnplayableFiles[i].Attempts++
			// 路径/标题这次拿到了就补上（原来是空的时候）
			if c.UnplayableFiles[i].Path == "" {
				c.UnplayableFiles[i].Path = path
			}
			if c.UnplayableFiles[i].Title == "" {
				c.UnplayableFiles[i].Title = title
			}
			if c.UnplayableFiles[i].Artist == "" {
				c.UnplayableFiles[i].Artist = artist
			}
			saved = c.UnplayableFiles[i]
			return
		}
		// 新条目放最前面：清单按「最近失败」排序更符合排查习惯
		c.UnplayableFiles = append([]bootstrap.UnplayableFile{entry}, c.UnplayableFiles...)
		saved = entry
	})

	if existed {
		log.Printf("[unplayable] %s 再次播放失败（第 %d 次）：%s —— %s",
			saved.SongID, saved.Attempts, saved.Title, reason)
	} else {
		log.Printf("[unplayable] 记录放不出来的文件：%s（%s）—— %s", saved.Title, saved.Path, reason)
	}

	// 从曲库摘掉：这首歌已经确认放不出来，留在列表里只会让用户
	// 每次点到都再失败一次（那正是错误提示刷屏的来源之一）。
	// 磁盘文件**不动** —— 只是不进曲库，用户修好后重新扫描即可回来。
	removed := false
	s.mu.Lock()
	lib := s.lib
	s.mu.Unlock()
	if lib != nil {
		removed = lib.DropSong(songID)
	}

	out := unplayableToMap(saved)
	out["removedFromLibrary"] = removed
	out["isNew"] = !existed

	if emit := s.emitter(); emit != nil {
		emit(unplayableEvent, out)
	}
	return out
}

// List 返回全部「放不出来」的文件（最近失败的在前）。
func (s *UnplayableService) List() []map[string]any {
	cfg := s.store.Get()
	out := make([]map[string]any, 0, len(cfg.UnplayableFiles))
	for _, f := range cfg.UnplayableFiles {
		out = append(out, unplayableToMap(f))
	}
	return out
}

// Count 返回条目数（前端启动时用来决定要不要显示提示角标）。
func (s *UnplayableService) Count() int {
	return len(s.store.Get().UnplayableFiles)
}

// Remove 把一条记录从清单里删掉（用户在设置页点「忽略 / 已知悉」）。
//
// 语义：**只删记录，不改曲库**。用户想让这首歌重回曲库就点「重新扫描」
// （见 Restore），这里不做隐式的事情。
func (s *UnplayableService) Remove(songID string) bool {
	if strings.TrimSpace(songID) == "" {
		return false
	}
	removed := false
	_ = s.store.Update(func(c *bootstrap.Config) {
		kept := make([]bootstrap.UnplayableFile, 0, len(c.UnplayableFiles))
		for _, f := range c.UnplayableFiles {
			if f.SongID == songID {
				removed = true
				continue
			}
			kept = append(kept, f)
		}
		c.UnplayableFiles = kept
	})
	if removed {
		log.Printf("[unplayable] 已从清单移除：%s", songID)
	}
	return removed
}

// Clear 清空整个清单。
func (s *UnplayableService) Clear() int {
	n := len(s.store.Get().UnplayableFiles)
	if n == 0 {
		return 0
	}
	_ = s.store.Update(func(c *bootstrap.Config) { c.UnplayableFiles = nil })
	log.Printf("[unplayable] 已清空清单（%d 条）", n)
	return n
}

// Forget 忘掉一首歌的失败记录，**并让它可以重新进曲库**。
//
// 与 Remove 的区别：Remove 只是把提示抹掉（不动曲库），Forget 是
// 「我修好文件了，让它回来」。前端在重新扫描前调用。
//
// 曲库那边不需要额外动作：重新扫描本来就会重新遍历磁盘，
// 之前被 DropSong 摘掉的歌会被重新发现。
func (s *UnplayableService) Forget(songID string) bool {
	return s.Remove(songID)
}

/* --------------------------------------------------------------------------
   内部
   -------------------------------------------------------------------------- */

func (s *UnplayableService) emitter() func(string, any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.emit
}

// lookupSong 从曲库查一首歌的路径/标题/歌手/扩展名。
//
// 用注入的 lib 反查而不是自己读磁盘：曲库是内存表，查一次是 O(1)。
// lib 未注入或查不到时返回空串，调用方会退回「用传入的 path 推断」。
func (s *UnplayableService) lookupSong(songID string) (path, title, artist, ext string) {
	s.mu.Lock()
	lib := s.lib
	s.mu.Unlock()
	if lib == nil {
		return "", "", "", ""
	}
	p, t, a, e, ok := lib.LookupSong(songID)
	if !ok {
		return "", "", "", ""
	}
	return p, t, a, e
}

func unplayableToMap(f bootstrap.UnplayableFile) map[string]any {
	return map[string]any{
		"songId":   f.SongID,
		"path":     f.Path,
		"title":    f.Title,
		"artist":   f.Artist,
		"ext":      f.Ext,
		"reason":   f.Reason,
		"at":       f.At,
		"attempts": f.Attempts,
	}
}

// extOf 从路径取扩展名（小写、不含点）
func extOf(p string) string {
	i := strings.LastIndex(p, ".")
	if i < 0 || i == len(p)-1 {
		return ""
	}
	return strings.ToLower(p[i+1:])
}

// fileNameOf 从路径取文件名（用户至少能认出是哪个文件）
func fileNameOf(p string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[i+1:]
	}
	return p
}
