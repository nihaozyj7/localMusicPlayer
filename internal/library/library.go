// Package library 负责曲库：目录扫描、元数据缓存、过滤、文件夹监听。
package library

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"localmusicplayer/internal/atomicfile"
	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/covercache"
	"localmusicplayer/internal/ffmpeg"
	"localmusicplayer/internal/filter"
	"localmusicplayer/internal/meta"
)

// ScanResult 一次扫描的结果统计
type ScanResult struct {
	Found    int   `json:"found"`
	Kept     int   `json:"kept"`
	Excluded int   `json:"excluded"`
	Added    int   `json:"added"`
	Removed  int   `json:"removed"`
	At       int64 `json:"at"`
}

// ProgressFunc 扫描进度回调（进度阶段、当前、总数）
type ProgressFunc func(phase string, current, total int)

// cacheEntry 元数据缓存条目。
// 字段必须是「导出 + JSON tag」的：早先用未导出小写字段，
// encoding/json 会把每个条目序列化成 {}，缓存实际上从未生效
// （表现为每次重扫都把全部文件的标签重新解析一遍）。
type cacheEntry struct {
	Title    string `json:"title"`
	Artist   string `json:"artist"`
	Album    string `json:"album"`
	Duration int64  `json:"duration"`
	Sample   int    `json:"sample"`
	Bitrate  int    `json:"bitrate"`
	// CoverFile 是封面缓存目录里的文件名（内容 hash 命名，见 internal/covercache）。
	// 空字符串表示这首歌没有内嵌封面。
	//
	// ★ 这里以前是 Cover string（完整的 base64 data URL）—— 实测那份 5.59MB 的
	// 元数据缓存里 99.6% 是它，而同一张专辑封面会被逐首重复存 N 份。
	CoverFile string `json:"coverFile,omitempty"`
	// Cover 是 v1 遗留字段，只用于**一次性迁移**（读进来解码成图片塞进封面缓存，
	// 然后置空）；新写入的缓存永远是空的。见 migrateLegacyCovers。
	Cover   string `json:"cover,omitempty"`
	ModTime int64  `json:"modTime"`
	Size    int64  `json:"size"`
	// Probed 表示「已经用 ffmpeg 探测过且确实拿不到时长」。
	// 没有这个标记的话，每次重扫都会对同一批无时长文件反复起 ffmpeg 进程。
	Probed bool `json:"probed,omitempty"`
}

// Manager 曲库管理器，方法均可并发调用
type Manager struct {
	mu      sync.RWMutex
	songs   map[string]bootstrap.Song // id -> song
	folders []bootstrap.Folder
	cache   map[string]cacheEntry
	cacheMu sync.RWMutex
	// cacheOnce 保证磁盘上的缓存只读一次（懒加载，见 ensureCacheLoaded）
	cacheOnce sync.Once
	scanning  bool

	// sortedSnapshot 是 songs 的「按 AddedAt 倒序」快照，由 Songs() 使用。
	//
	// 为什么需要它：songs 是 map，迭代顺序随机，所以想按添加时间倒序返回就
	// **必须**每次排序。而 Songs() 被 6 处调用（Wails 绑定、Stats、响度 State/
	// MeasureAll/GainMap/AlbumGains），其中 GainMap 与 AlbumGains 还是相邻调用。
	// 实测（10,000 首）：每次调用 2.48ms / 分配 1.84MB，其中排序占约 5/6。
	//
	// 失效方式：任何改动 songs 的地方都要调 markSongsDirty()。约定与前端
	// store.js 的 songIndex 一致 —— 只在「曲库整体替换或增量增删」时重建。
	sortedSnapshot []bootstrap.Song
	songsDirty     bool

	// 扫描串行化：idle 在「没有任何扫描进行中」时是关闭状态
	scanMu sync.Mutex
	idle   chan struct{}

	// metaReads 实际读取文件元数据的次数（命中缓存不计），用于测试与诊断
	metaReads int64

	// cacheUsable 表示磁盘上的元数据缓存**或者**「它不存在」这件事实已经确认过。
	// 读失败 / JSON 解析失败时为 false —— 此时内存里的表是空的，但它不是真相。
	cacheUsable bool

	// 依赖
	store *bootstrap.Store
	// covers 是内嵌封面的内容寻址缓存（hash 命名，专用目录）
	covers *covercache.Store

	// 回调
	onProgress ProgressFunc
	onChanged  func(ScanResult)
}

// NewManager 创建曲库管理器
func NewManager(store *bootstrap.Store) *Manager {
	m := &Manager{
		songs: map[string]bootstrap.Song{},
		cache: map[string]cacheEntry{},
		store: store,
	}
	m.folders = store.Get().EffectiveFolders()
	// 专用封面缓存目录：<cacheDir>/covers。
	// 与 metacache 的 <cacheDir>/meta/covers 分开：那边是「用户管理过的封面」
	// （联网抓取 / 手动换 / 写回文件），有自己的索引与删除语义；这里是「从文件
	// 标签里解析出来的封面」，纯内容寻址、无索引、由扫描自动重建。
	m.covers = covercache.New(filepath.Join(store.Get().CacheDir, "covers"))
	// 元数据缓存**不在这里读**：它是 5.9MB 的 JSON（99% 是内嵌封面的 base64），
	// 同步 json.Unmarshal 会发生在 main() 建窗口之前，是首屏里最贵的一段。
	// 改成第一次真正用到缓存时再读（扫描 / 保存），见 ensureCacheLoaded。
	return m
}

/* --------------------------------------------------------------------------
   扫描串行化
   --------------------------------------------------------------------------
   同一次运行里可能有多个扫描来源：启动扫描、用户点「重新扫描」、
   新增文件夹后的自动扫描、文件夹监听触发的增量重扫。
   它们不能并行（会互相覆盖 songs 表），也不能直接丢弃后到的请求
   ——否则前端会一直等不到 scan:done 事件，界面停在空白。
   因此这里让后到的请求「排队等前一个跑完，再跑自己的」。
   -------------------------------------------------------------------------- */

// beginScan 标记扫描开始；若已有扫描在进行会先等到它结束
func (m *Manager) beginScan(ctx context.Context) error {
	for {
		m.scanMu.Lock()
		if m.idle == nil {
			m.idle = make(chan struct{})
			m.mu.Lock()
			m.scanning = true
			m.mu.Unlock()
			m.scanMu.Unlock()
			return nil
		}
		wait := m.idle
		m.scanMu.Unlock()

		// 已有扫描在跑：等它结束（或调用方取消）
		select {
		case <-wait:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

// endScan 标记扫描结束并唤醒排队者
func (m *Manager) endScan() {
	m.scanMu.Lock()
	m.mu.Lock()
	m.scanning = false
	m.mu.Unlock()
	if m.idle != nil {
		close(m.idle)
		m.idle = nil
	}
	m.scanMu.Unlock()
}

// IsScanning 是否有扫描在进行
func (m *Manager) IsScanning() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.scanning
}

// MetaReads 统计真正读取文件元数据的次数（命中缓存不计）。
// 用于验证缓存确实生效，以及排查「重扫很慢」类问题。
func (m *Manager) MetaReads() int64 {
	return atomic.LoadInt64(&m.metaReads)
}

// SetProgressFunc 注册扫描进度回调
func (m *Manager) SetProgressFunc(fn ProgressFunc) {
	m.mu.Lock()
	m.onProgress = fn
	m.mu.Unlock()
}

// SetChangedFunc 注册曲库变化回调
func (m *Manager) SetChangedFunc(fn func(ScanResult)) {
	m.mu.Lock()
	m.onChanged = fn
	m.mu.Unlock()
}

func (m *Manager) report(phase string, current, total int) {
	m.mu.RLock()
	fn := m.onProgress
	m.mu.RUnlock()
	if fn != nil {
		fn(phase, current, total)
	}
}

func (m *Manager) notifyChanged(res ScanResult) {
	m.mu.RLock()
	fn := m.onChanged
	m.mu.RUnlock()
	if fn != nil {
		fn(res)
	}
}

/* --------------------------------------------------------------------------
   元数据缓存（落盘为 JSON，放在数据目录）
   -------------------------------------------------------------------------- */

type cacheFile struct {
	Version int                   `json:"version"`
	Entries map[string]cacheEntry `json:"entries"`
}

const cacheVersion = 1

func (m *Manager) cachePath() string {
	return filepath.Join(m.store.DataDir(), "metadata-cache.json")
}

// ensureCacheLoaded 保证磁盘上的元数据缓存已经读过一次（懒加载）。
func (m *Manager) ensureCacheLoaded() {
	m.cacheOnce.Do(m.loadCache)
}

// scanCancelledErr 把「上下文已取消」统一成一个非 nil 的错误。
func scanCancelledErr(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return context.Canceled
}

// loadCache 读磁盘上的元数据缓存。
//
// ★ 关键约定：**读失败时必须把 cacheUsable 留成 false**。
//
// 以前这里四条件都是「静默 return」，于是「磁盘上的缓存读不动」与
// 「这台机器从来没有缓存」在内存里长得一模一样（都是空表）。而 SaveCache
// 最后会把这个空表整份写回 metadata-cache.json、pruneCoverCache 又会拿它当
// 「没有任何封面仍被引用」的依据去回收 —— 一次瞬时读失败（杀软扫描占住文件、
// 并发写、跨机器拷贝中）就足以让用户的整份元数据缓存**与全部内嵌封面文件**
// 一起消失。这与用户报的「缓存数据莫名消失」是同一类事故，必须有硬保护。
func (m *Manager) loadCache() {
	raw, err := os.ReadFile(m.cachePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			// 首次运行：空表确实就是真相
			m.cacheMu.Lock()
			m.cacheUsable = true
			m.cacheMu.Unlock()
			return
		}
		m.markCacheUnusable("读取", err)
		return
	}
	var cf cacheFile
	if err := json.Unmarshal(raw, &cf); err != nil {
		m.markCacheUnusable("解析", err)
		return
	}
	if cf.Version != cacheVersion || cf.Entries == nil {
		m.markCacheUnusable("版本/结构不符", nil)
		return
	}
	m.cacheMu.Lock()
	m.cache = cf.Entries
	m.cacheUsable = true
	m.cacheMu.Unlock()

	// v1 → v2：把 base64 封面搬进内容寻址的封面缓存目录
	m.migrateLegacyCovers()
}

// markCacheUnusable 记录「这份缓存这次没能用起来」，并把坏文件留一份现场。
//
// 只备份不改写：备份文件是排查用的，绝不覆盖原文件（下一次启动可能就读得动了）。
func (m *Manager) markCacheUnusable(action string, cause error) {
	m.cacheMu.Lock()
	m.cacheUsable = false
	m.cacheMu.Unlock()
	log.Printf("[library] 元数据缓存%s失败，本次运行只读不写（不会覆盖磁盘上的缓存）: %v", action, cause)
	if action == "解析" {
		if raw, err := os.ReadFile(m.cachePath()); err == nil {
			_ = os.WriteFile(m.cachePath()+".broken", raw, 0o644)
		}
	}
}

// cacheIsUsable 当前内存里的元数据缓存是否可以作为「磁盘真相」写回去。
func (m *Manager) cacheIsUsable() bool {
	m.cacheMu.RLock()
	defer m.cacheMu.RUnlock()
	return m.cacheUsable
}

// migrateLegacyCovers 把 v1 元数据缓存里的 base64 封面搬进封面缓存目录。
//
// 为什么必须**就地迁移**，而不是「直接丢掉 legacy 字段、等下次重扫」：缓存命中
// 路径只要 ModTime/Size 没变就认为记录仍然有效，不会再打开文件去解析封面 ——
// 于是老用户会在文件毫无变化的情况下**永久失去封面**。
func (m *Manager) migrateLegacyCovers() {
	type item struct {
		path string
		data []byte
		mime string
	}

	var todo []item
	m.cacheMu.Lock()
	for path, entry := range m.cache {
		if entry.Cover == "" {
			continue
		}
		if entry.CoverFile != "" {
			// 已经迁移过，只清掉体积大的遗留字段
			entry.Cover = ""
			m.cache[path] = entry
			continue
		}
		data, mime, ok := decodeDataURL(entry.Cover)
		if !ok {
			// 坏数据：清掉字段，别让它继续占体积
			entry.Cover = ""
			m.cache[path] = entry
			continue
		}
		todo = append(todo, item{path: path, data: data, mime: mime})
	}
	m.cacheMu.Unlock()

	if len(todo) == 0 {
		return
	}
	migrated := 0
	for _, it := range todo {
		name, err := m.covers.Put(it.data, it.mime)
		if err != nil {
			log.Printf("[library] 迁移封面失败（%s）: %v", it.path, err)
			continue
		}
		m.cacheMu.Lock()
		if entry, ok := m.cache[it.path]; ok {
			entry.CoverFile = name
			entry.Cover = ""
			m.cache[it.path] = entry
			migrated++
		}
		m.cacheMu.Unlock()
	}
	log.Printf("[library] 已把 %d 首的内嵌封面从 base64 迁移到内容寻址缓存（%s）", migrated, m.covers.Dir())
}

// decodeDataURL 解析 "data:image/jpeg;base64,xxxx"（只用于 v1 缓存迁移）。
func decodeDataURL(s string) ([]byte, string, bool) {
	comma := strings.IndexByte(s, ',')
	if comma < 0 {
		return nil, "", false
	}
	head := s[:comma]
	if !strings.HasPrefix(head, "data:") || !strings.Contains(head, "base64") {
		return nil, "", false
	}
	mime := strings.TrimSuffix(strings.TrimPrefix(head, "data:"), ";base64")
	data, err := base64.StdEncoding.DecodeString(s[comma+1:])
	if err != nil || len(data) == 0 {
		return nil, "", false
	}
	return data, mime, true
}

// CoversDir 返回内嵌封面缓存目录（供设置界面显示）。
func (m *Manager) CoversDir() string { return m.covers.Dir() }

// CoversHandler 返回 /cover/ 前缀的处理器（main.go 的中间件把它挂到同源 asset server）。
func (m *Manager) CoversHandler() http.Handler { return m.covers.Handler() }

// CoversStats 返回内嵌封面缓存的文件数与总字节数。
func (m *Manager) CoversStats() (int, int64) { return m.covers.Stats() }

// SaveCache 把元数据缓存落盘（扫描结束后调用）
func (m *Manager) SaveCache() error {
	// 保存前必须已经读过磁盘上的旧缓存：缓存现在是懒加载的，
	// 少了这一步就会把上一次的全部条目直接覆盖成「只有本次扫描碰过的那些」。
	m.ensureCacheLoaded()
	// 载入失败时直接放弃本次保存：内存里的空表不是真相，
	// 写回去就等于把用户的元数据缓存（以及它引用的封面）整份抹掉。
	if !m.cacheIsUsable() {
		return fmt.Errorf("元数据缓存未能载入，已跳过本次保存以免覆盖磁盘上的缓存")
	}
	// 与 loudness.Save 同样的理由：map 是引用类型，必须在锁内复制 ——
	// 否则下面 json.Marshal 会无锁遍历 m.cache，而扫描 worker 仍在写它。
	// 目前靠 beginScan/endScan 串行化侥幸不触发，但那是隐式约定，不该依赖。
	m.cacheMu.RLock()
	entries := make(map[string]cacheEntry, len(m.cache))
	for k, v := range m.cache {
		entries[k] = v
	}
	m.cacheMu.RUnlock()

	// 用 Marshal 而不是 MarshalIndent：这份文件里 99% 是内嵌封面的 base64，
	// 缩进既不可读也白花 CPU（实测这份缓存 5.6MB）。
	raw, err := json.Marshal(cacheFile{Version: cacheVersion, Entries: entries})
	if err != nil {
		return err
	}
	if err := atomicfile.Write(m.cachePath(), raw, 0o644); err != nil {
		return err
	}
	// 顺手回收不再被引用的封面文件（内容寻址的目录只增不减，必须有这一步）。
	m.pruneCoverCache()
	return nil
}

// pruneCoverCache 删掉不再被任何元数据条目引用的封面文件。
//
// 孤儿是怎么来的：用户在歌曲文件里换了内嵌封面、或删掉了歌 → 元数据条目的
// CoverFile 换成新的（或整条消失），旧图就没人引用了。
//
// 1 小时的年龄门槛是给「刚写完还没登记进元数据缓存」的文件留的窗口 ——
// 那种文件此刻必然不在 keep 里，不该被当成孤儿删掉。
func (m *Manager) pruneCoverCache() {
	// 载入失败时内存里的表是空的，用它当 keep 会把**所有**封面都判成孤儿删掉。
	if !m.cacheIsUsable() {
		return
	}
	m.cacheMu.RLock()
	keep := make(map[string]struct{}, len(m.cache))
	for _, entry := range m.cache {
		if entry.CoverFile != "" {
			keep[entry.CoverFile] = struct{}{}
		}
	}
	m.cacheMu.RUnlock()

	removed, freed := m.covers.Prune(keep, time.Hour)
	if removed > 0 {
		log.Printf("[library] 回收了 %d 个不再被引用的封面文件（%.1f KB）", removed, float64(freed)/1024)
	}
}

/* --------------------------------------------------------------------------
   查询
   -------------------------------------------------------------------------- */

// markSongsDirtyLocked 标记排序快照需要重建。**调用方必须持有 m.mu 写锁。**
func (m *Manager) markSongsDirtyLocked() { m.songsDirty = true }

// Songs 返回过滤后的全部歌曲（按添加时间倒序，与前端默认排序一致）。
//
// 返回的是一份**拷贝**：调用方（以及 Wails 的序列化层）可以安全持有。
// 排序结果按「曲库是否变过」缓存 —— map 的迭代顺序随机，所以排序本身无法省，
// 但可以只在曲库真的变化时做一次（见 Manager.sortedSnapshot 的说明）。
func (m *Manager) Songs() []bootstrap.Song {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.songsDirty || m.sortedSnapshot == nil {
		out := make([]bootstrap.Song, 0, len(m.songs))
		for _, s := range m.songs {
			out = append(out, s)
		}
		sort.Slice(out, func(i, j int) bool { return out[i].AddedAt > out[j].AddedAt })
		m.sortedSnapshot = out
		m.songsDirty = false
	}

	// 仍然拷贝一份给调用方：快照必须保持不可变，否则调用方一改就污染后续所有请求。
	// 这一份拷贝是必要的代价（实测 10k 首约 0.5ms）；排序那 2ms 才是省下来的大头。
	return append([]bootstrap.Song(nil), m.sortedSnapshot...)
}

// SongByID 按 id 取歌曲
func (m *Manager) SongByID(id string) (bootstrap.Song, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.songs[id]
	return s, ok
}

// DropSong 把一首歌从曲库里摘掉（**不动磁盘文件**），返回是否确实移除了。
//
// 用途见 services_unplayable.go：播放时确认放不出来的文件不该继续留在
// 曲库里 —— 留着只会让用户每次点到都再失败一次（那正是错误提示刷屏的来源）。
//
// ★ 元数据缓存条目也必须一起清掉，否则摘了等于没摘：
//
//	下次扫描会命中缓存 → 认为「这个文件没变，复用旧元数据」→ 这首歌又回到
//	曲库里。用户看到的现象就是「移除之后一扫描它又回来了」。
//	清掉条目才会真正重新读文件（而重读时若仍解析失败，扫描本来就会跳过它）。
//
// 注意这不改变「扫描以磁盘为准」的原则：文件仍在磁盘上、仍会被遍历到，
// 只是元数据要重新读一遍。用户修好文件后重新扫描，它就正常回来了。
func (m *Manager) DropSong(id string) bool {
	if id == "" {
		return false
	}
	m.mu.Lock()
	song, ok := m.songs[id]
	if ok {
		delete(m.songs, id)
		// ★ 必须标记快照失效，否则 Songs() 会继续返回已经摘掉的那首
		// （sortedSnapshot 是拷贝，不会跟着 map 的删除自动更新）。
		m.markSongsDirtyLocked()
	}
	m.mu.Unlock()
	if !ok {
		return false
	}

	if song.Path != "" {
		m.cacheMu.Lock()
		delete(m.cache, song.Path)
		m.cacheMu.Unlock()
	}
	return true
}

// Folders 返回当前文件夹列表（含曲目数统计）
func (m *Manager) Folders() []bootstrap.Folder {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return append([]bootstrap.Folder(nil), m.folders...)
}

// ReloadFolders 重新从配置读取文件夹列表。
// 新增/移除文件夹后必须调用，否则 Manager 里缓存的副本不会更新，
// 扫描就仍然只扫旧目录（表现为「加了文件夹却扫不到歌」）。
//
// 这里用的是 Config.EffectiveFolders（用户文件夹 + 下载目录），
// 所以「改了下载路径」之后调用它，新目录就会被纳入扫描范围。
func (m *Manager) ReloadFolders() {
	next := m.store.Get().EffectiveFolders()
	m.mu.Lock()
	m.folders = append([]bootstrap.Folder(nil), next...)
	m.mu.Unlock()
}

// sameFolders 判断两份文件夹列表是否等价（只比较会影响扫描的字段）
func sameFolders(a, b []bootstrap.Folder) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].ID != b[i].ID || !strings.EqualFold(a[i].Path, b[i].Path) {
			return false
		}
	}
	return true
}

/* --------------------------------------------------------------------------
   扫描
   -------------------------------------------------------------------------- */

type candidate struct {
	path   string
	size   int64
	ext    string
	folder string
	mod    int64
}

// Scan 全量扫描所有配置的文件夹。
// force=true 时忽略元数据缓存（用于用户点「重新扫描」并希望刷新标签的场景）。
//
// 若已有扫描在进行，本调用会先排队等它结束再执行自己的扫描
// （不能直接丢弃：调用方在等 scan:done 事件）。
func (m *Manager) Scan(ctx context.Context, force bool) (ScanResult, error) {
	if err := m.beginScan(ctx); err != nil {
		return ScanResult{}, err
	}
	defer m.endScan()
	m.ensureCacheLoaded()

	m.mu.RLock()
	folders := append([]bootstrap.Folder(nil), m.folders...)
	m.mu.RUnlock()

	// 自愈：配置里的文件夹列表（含下载目录）才是真源。若外部改过配置却忘了通知曲库，
	// 这里补一次同步，避免「加了文件夹却扫不到歌」「改了下载路径却扫不到下载的歌」。
	if cfgFolders := m.store.Get().EffectiveFolders(); !sameFolders(folders, cfgFolders) {
		m.ReloadFolders()
		m.mu.RLock()
		folders = append([]bootstrap.Folder(nil), m.folders...)
		m.mu.RUnlock()
	}

	concurrency := m.store.Get().ScanConcurrency

	m.report("walk", 0, 0)

	// 1) 遍历文件
	candidates := make([]candidate, 0, 1024)
	statuses := map[string]string{}
	for _, folder := range folders {
		if ctx.Err() != nil {
			return ScanResult{}, ctx.Err()
		}
		files, status := walkFolder(folder.Path)
		statuses[folder.ID] = status
		candidates = append(candidates, files...)
	}

	// 2) 并发读取元数据
	m.report("meta", 0, len(candidates))
	results, cancelled := m.readAll(ctx, candidates, concurrency, force)
	if cancelled {
		// 被取消时 readAll 只能给出残缺的结果。**绝不能**拿它去覆盖 m.songs ——
		// 那会把整个曲库清空，同时还发一条 scan:done（Kept=0）告诉前端「扫完了」。
		// 保留旧曲库并如实返回错误，让上层决定要不要提示。
		return ScanResult{}, scanCancelledErr(ctx)
	}

	// 3) 应用过滤规则并统计
	cfg := m.store.Get()
	res := filter.Apply(results, cfg.FilterRules)

	// 3.5) 对 meta 没有解析器的容器（wma/ape/dsf…）用 ffmpeg 补时长。
	//      时长缺失会让转码流拿不到 Content-Length，前端进度条就没法用。
	m.enrichDurations(ctx, res.Kept, force)
	if ctx.Err() != nil {
		// 补时长阶段被取消：曲库本体不提交，宁可这次什么都没更新。
		//
		// 但**必须**把元数据缓存落一次盘：enrichDurations 探测过的文件在内存缓存里
		// 已经被打上 Probed 标记（见那里的注释），而它只在 Scan 末尾的 SaveCache
		// 才落盘。这里直接 return 的话那些标记全部丢失 —— 下次扫描会把同一批
		// 「确实没有时长」的文件（wma/ape/dsf…）再起一遍 ffmpeg 子进程，
		// 而 maxProbePerScan=48 正说明单次探测很贵。
		// SaveCache 由 cacheIsUsable 保护，载入失败时它会自行拒绝写入。
		_ = m.SaveCache()
		return ScanResult{}, scanCancelledErr(ctx)
	}

	// 4) 与旧数据对比，得出新增/移除
	m.mu.Lock()
	prevIDs := make(map[string]bool, len(m.songs))
	for id := range m.songs {
		prevIDs[id] = true
	}
	newSongs := make(map[string]bootstrap.Song, len(res.Kept))
	for _, s := range res.Kept {
		newSongs[s.ID] = s
	}
	added := 0
	for id := range newSongs {
		if !prevIDs[id] {
			added++
		}
	}
	removed := 0
	for id := range prevIDs {
		if _, ok := newSongs[id]; !ok {
			removed++
		}
	}
	m.songs = newSongs
	m.markSongsDirtyLocked()

	// 5) 更新文件夹状态与曲目数
	//
	// ★ 曲目数是 O(文件夹 × 曲库) 且**与 m.songs 无关**（只依赖本次扫描结果
	//   res.Kept 和文件夹路径），所以在进锁之前先把 folderPaths 快照出来、
	//   在锁外算完，锁内只做赋值 —— 这样这段二次循环不再拉长写锁持有时间。
	//   原来它整个在 m.mu 里跑，10 万首 × 20 文件夹会让所有 Songs()/SongByID()
	//   在这几毫秒里全部阻塞（RescanPaths 侧早已做了同类优化，见其注释）。
	folderPaths := make([]string, len(m.folders))
	for i := range m.folders {
		folderPaths[i] = m.folders[i].Path
	}
	counts := countSongsInFolders(res.Kept, folderPaths)
	for i := range m.folders {
		if status, ok := statuses[m.folders[i].ID]; ok {
			m.folders[i].Status = status
		}
		m.folders[i].TrackCount = counts[i]
	}
	// ★ 只把「扫描得到的 status / trackCount」回填到配置里对应 id 的文件夹，
	// **不要**整份覆盖 c.Folders。
	//
	// 为什么不能整份覆盖（以前正是 `c.Folders = foldersCopy`）：foldersCopy 是
	// 扫描**开始时**的快照，而一次全量扫描可能跑几十秒到几分钟。这期间用户
	// 新增或删除文件夹（AddFolder / RemoveFolder 会各自写一次配置）都会被这个
	// 旧快照整体抹掉 —— 用户看到「刚加的文件夹自己消失了」，
	// 而 m.folders 与 config.json 从此不一致（扫描根、界面列表各说各话）。
	//
	// 顺带解决「合成出来的下载目录」：它是从 DownloadDir 派生的，一旦落进
	// config.Folders 就变成了"用户手动添加的文件夹"，改下载位置之后旧目录会
	// 永远留在扫描根里，还会出现两条同 id 的记录。只回填已有条目的字段，
	// 天然不会再把它写进配置。
	type folderStat struct {
		status string
		count  int
	}
	stats := make(map[string]folderStat, len(m.folders))
	for _, f := range m.folders {
		if f.ID == bootstrap.DownloadFolderID {
			continue
		}
		stats[f.ID] = folderStat{status: f.Status, count: f.TrackCount}
	}
	m.mu.Unlock()

	_ = m.store.Update(func(c *bootstrap.Config) {
		for i := range c.Folders {
			st, ok := stats[c.Folders[i].ID]
			if !ok {
				continue // 扫描快照里没有它（扫描期间新加的）→ 原样保留
			}
			c.Folders[i].Status = st.status
			c.Folders[i].TrackCount = st.count
		}
	})
	_ = m.SaveCache()

	out := ScanResult{
		Found:    res.Total,
		Kept:     len(res.Kept),
		Excluded: res.Excluded,
		Added:    added,
		Removed:  removed,
		At:       time.Now().UnixMilli(),
	}
	m.notifyChanged(out)
	return out, nil
}

// RescanPaths 只重新读取指定路径（文件夹监听触发的增量更新）。
// 与全量扫描共用同一把「串行化」闸门，避免两者交叉覆盖 songs 表。
func (m *Manager) RescanPaths(ctx context.Context, paths []string) (ScanResult, error) {
	if len(paths) == 0 {
		return ScanResult{}, nil
	}
	if err := m.beginScan(ctx); err != nil {
		return ScanResult{}, err
	}
	defer m.endScan()
	m.ensureCacheLoaded()

	cfg := m.store.Get()

	m.mu.RLock()
	folders := append([]bootstrap.Folder(nil), m.folders...)
	oldSongs := make(map[string]bootstrap.Song, len(m.songs))
	for k, v := range m.songs {
		oldSongs[k] = v
	}
	m.mu.RUnlock()

	// 收集受影响的目录
	dirs := map[string]bool{}
	for _, p := range paths {
		dirs[filepath.Dir(p)] = true
	}
	candidates := []candidate{}
	statuses := map[string]string{}
	for dir := range dirs {
		files, status := walkFolder(dir)
		candidates = append(candidates, files...)
		for _, f := range folders {
			if isUnder(dir, f.Path) {
				statuses[f.ID] = status
			}
		}
	}

	results, cancelled := m.readAll(ctx, candidates, cfg.ScanConcurrency, false)
	if cancelled {
		// 同上：增量重扫会「先删受影响目录的旧条目再写入新结果」，
		// 拿残缺结果往下走会直接把那个目录的歌全部删掉。
		return ScanResult{}, scanCancelledErr(ctx)
	}
	res := filter.Apply(results, cfg.FilterRules)

	m.mu.Lock()
	// 先记下受影响目录里原本有哪些 id，用于统计「真正新增」
	affectedBefore := map[string]bool{}
	for id, s := range oldSongs {
		for dir := range dirs {
			if isUnder(s.Path, dir) {
				affectedBefore[id] = true
				break
			}
		}
	}
	// 用新结果替换受影响目录下的旧条目
	for id := range affectedBefore {
		delete(m.songs, id)
	}
	added := 0
	for _, s := range res.Kept {
		if !affectedBefore[s.ID] {
			added++
		}
		m.songs[s.ID] = s
	}
	m.markSongsDirtyLocked()
	// 只重算**本次真的被影响到**的文件夹。
	//
	// 为什么不能整表重算：这里是 O(文件夹 × 全库曲目)，而且整段在写锁内。
	// 本函数由文件夹监听触发（watcher.go#flush），也就是说「往音乐目录里丢一个
	// 文件」就会引发一次全库 × 全文件夹的扫描 —— 实测 10 万首 × 20 个文件夹
	// 单次约 10ms，期间所有 Songs() / SongByID() 全部阻塞。
	//
	// 增量重扫只会改动 dirs 之下的曲目，因此只有「与某个 affected dir 有包含
	// 关系」的文件夹，其曲目数才可能变化；其余的沿用旧值即可。
	// 实测同一场景：10.2ms → 0.58ms（约 17 倍），且持锁时间同比例缩短。
	for i := range m.folders {
		if status, ok := statuses[m.folders[i].ID]; ok {
			m.folders[i].Status = status
		}
		touched := false
		for dir := range dirs {
			if isUnder(dir, m.folders[i].Path) {
				touched = true
				break
			}
		}
		if !touched {
			continue
		}
		count := 0
		for _, s := range m.songs {
			if isUnder(s.Path, m.folders[i].Path) {
				count++
			}
		}
		m.folders[i].TrackCount = count
	}
	m.mu.Unlock()

	out := ScanResult{
		Found:    res.Total,
		Kept:     len(res.Kept),
		Excluded: res.Excluded,
		Added:    added,
		At:       time.Now().UnixMilli(),
	}
	m.notifyChanged(out)
	return out, nil
}

// readAll 并发读取元数据。
//
// 第二个返回值 cancelled=true 表示「被 ctx 取消了，结果不完整」——调用方必须
// 据此放弃本次结果，绝不能当成「这些就是全部歌曲」。之前只返回切片，取消时返回
// out[:0]（非 nil 的空切片），调用方无法区分「取消」与「真的没有歌」，
// 于是把整个曲库覆盖成了空。
func (m *Manager) readAll(ctx context.Context, items []candidate, concurrency int, force bool) ([]bootstrap.Song, bool) {
	if concurrency <= 0 {
		concurrency = 4
	}
	type job struct {
		idx int
		c   candidate
	}
	jobs := make(chan job)
	out := make([]bootstrap.Song, len(items))
	var wg sync.WaitGroup
	var done int64
	var cancelled atomic.Bool
	var mu sync.Mutex

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				if ctx.Err() != nil {
					// 注意：worker 提前退出会留下零值空槽，所以这里必须
					// 显式记下「取消」，不能只靠 ctx.Err() 事后判断
					//（发送循环可能刚好在所有 job 发完之后 ctx 才被取消）。
					cancelled.Store(true)
					return
				}
				out[j.idx] = m.songFromCandidate(j.c, force)
				mu.Lock()
				done++
				n := int(done)
				mu.Unlock()
				if n%40 == 0 {
					m.report("meta", n, len(items))
				}
			}
		}()
	}

	for i, c := range items {
		select {
		case jobs <- job{idx: i, c: c}:
		case <-ctx.Done():
			cancelled.Store(true)
			close(jobs)
			wg.Wait()
			return nil, true
		}
	}
	close(jobs)
	wg.Wait()
	if cancelled.Load() || ctx.Err() != nil {
		return nil, true
	}
	m.report("meta", len(items), len(items))

	// 丢掉空槽（防御性：正常情况下不应该有）
	final := make([]bootstrap.Song, 0, len(out))
	for _, s := range out {
		if s.ID != "" {
			final = append(final, s)
		}
	}
	return final, false
}

func (m *Manager) songFromCandidate(c candidate, force bool) bootstrap.Song {
	id := bootstrap.StableID(c.path, "t")
	song := bootstrap.Song{
		ID:      id,
		Path:    c.path,
		Ext:     c.ext,
		Size:    c.size,
		ModTime: c.mod,
	}

	// 命中缓存则直接复用（同一文件重扫几乎零成本）。
	//
	// 复用前要确认「缓存里记的那张封面文件还在」：封面是内容寻址的独立文件，
	// 换过缓存目录、清理过缓存、或者把数据目录拷到另一台机器之后，索引还在
	// 但文件已经没了 —— 此时若照旧复用，coverUrl 会指向一个 404 的名字，
	// 用户看到的就是「这首歌有内嵌封面却只显示默认图」。封面缺失时退回完整
	// 读取一次（标签解析很便宜，封面会被重新 Put 回当前目录，自动自愈）。
	if !force {
		m.cacheMu.RLock()
		entry, ok := m.cache[c.path]
		m.cacheMu.RUnlock()
		if ok && entry.Size == c.size && entry.ModTime == c.mod && m.coverAvailable(entry.CoverFile) {
			song.Title = entry.Title
			song.Artist = entry.Artist
			song.Album = entry.Album
			song.Duration = entry.Duration
			song.SampleRate = entry.Sample
			song.Bitrate = entry.Bitrate
			song.CoverURL = m.covers.URL(entry.CoverFile)
			song.AddedAt = c.mod
			fillFallback(&song)
			return song
		}
	}

	info := meta.Read(c.path)
	song.Title = info.Title
	song.Artist = info.Artist
	song.Album = info.Album
	song.Duration = info.DurationMS
	song.SampleRate = info.SampleRate
	song.Bitrate = info.Bitrate
	song.AddedAt = c.mod
	fillFallback(&song)

	// 封面字节写进内容寻址的封面缓存目录，元数据里只留文件名。
	// 同内容（整张专辑共用一张封面）只写一次盘。
	coverFile, err := m.covers.Put(info.CoverData, info.CoverMIME)
	if err != nil {
		// 封面存不下不该让整首歌的元数据也失败：降级成「无封面」并记一条日志
		log.Printf("[library] 写入封面缓存失败（%s）: %v", c.path, err)
	} else if coverFile != "" {
		song.CoverURL = m.covers.URL(coverFile)
	}

	m.cacheMu.Lock()
	m.cache[c.path] = cacheEntry{
		Title:     song.Title,
		Artist:    song.Artist,
		Album:     song.Album,
		Duration:  song.Duration,
		Sample:    song.SampleRate,
		Bitrate:   song.Bitrate,
		CoverFile: coverFile,
		ModTime:   c.mod,
		Size:      c.size,
	}
	m.cacheMu.Unlock()
	atomic.AddInt64(&m.metaReads, 1)
	return song
}

// coverAvailable 判断元数据缓存里记的封面文件名是否仍然可用。
// 空文件名 = 「这首歌本来就没有内嵌封面」，属于可用（不需要重新解析）。
func (m *Manager) coverAvailable(name string) bool {
	if name == "" {
		return true
	}
	return m.covers.Exists(name)
}

// fillFallback 元数据缺失时的兜底：用文件名当标题，未知歌手/专辑
func fillFallback(s *bootstrap.Song) {
	if strings.TrimSpace(s.Title) == "" {
		base := filepath.Base(s.Path)
		s.Title = strings.TrimSuffix(base, filepath.Ext(base))
	}
	if strings.TrimSpace(s.Artist) == "" {
		s.Artist = "未知歌手"
	}
	if strings.TrimSpace(s.Album) == "" {
		s.Album = "未知专辑"
	}
}

/* --------------------------------------------------------------------------
   无时长文件的兜底探测
   --------------------------------------------------------------------------
   meta 包只手写了 mp3/flac/wav/m4a 的时长解析。wma/ape/dsf/ogg 等容器
   没有解析器，时长会是 0 —— 会导致转码流拿不到 Content-Length，
   前端连进度条都用不了。这里对这类文件用 ffmpeg 探测一次并写入缓存。
   -------------------------------------------------------------------------- */

// maxProbePerScan 单次扫描最多探测多少个文件，避免首次扫描被大量进程拖住；
// 剩下的会在后续扫描里陆续补齐（结果有缓存，不会重复探测）。
const maxProbePerScan = 48

func (m *Manager) enrichDurations(ctx context.Context, songs []bootstrap.Song, force bool) int {
	tools := ffmpeg.Resolve()
	if !tools.Available() {
		return 0
	}

	// 收集候选：时长为 0 且缓存里没有「已探测过」标记
	type task struct {
		idx int
		s   bootstrap.Song
	}
	tasks := make([]task, 0, len(songs))
	for i, s := range songs {
		if s.Duration > 0 {
			continue
		}
		if !force {
			m.cacheMu.RLock()
			entry, ok := m.cache[s.Path]
			m.cacheMu.RUnlock()
			if ok && entry.Probed && entry.Size == s.Size && entry.ModTime == s.ModTime {
				continue // 已经探测过且确实没有时长，不再重复
			}
		}
		tasks = append(tasks, task{idx: i, s: s})
		if len(tasks) >= maxProbePerScan {
			break
		}
	}
	if len(tasks) == 0 {
		return 0
	}

	m.report("probe", 0, len(tasks))
	sem := make(chan struct{}, 2) // ffmpeg 进程较重，并发压到 2
	var wg sync.WaitGroup
	var mu sync.Mutex
	var done, filled int

	for _, t := range tasks {
		if ctx.Err() != nil {
			break
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(t task) {
			defer wg.Done()
			defer func() { <-sem }()

			pctx, cancel := context.WithTimeout(ctx, 8*time.Second)
			info, err := ffmpeg.Probe(pctx, tools.FFmpeg, t.s.Path)
			cancel()

			mu.Lock()
			done++
			n := done
			if err == nil && info.DurationSec > 0 {
				songs[t.idx].Duration = int64(info.DurationSec * 1000)
				if songs[t.idx].SampleRate == 0 {
					songs[t.idx].SampleRate = info.SampleRate
				}
				if songs[t.idx].Bitrate == 0 {
					songs[t.idx].Bitrate = info.Bitrate
				}
				filled++
			}
			mu.Unlock()

			// 写回缓存：拿到时长的存时长，没拿到的存 Probed 标记
			m.cacheMu.Lock()
			entry := m.cache[t.s.Path]
			entry.Title = songs[t.idx].Title
			entry.Artist = songs[t.idx].Artist
			entry.Album = songs[t.idx].Album
			entry.Size = t.s.Size
			entry.ModTime = t.s.ModTime
			entry.Probed = true
			if err == nil && info.DurationSec > 0 {
				entry.Duration = int64(info.DurationSec * 1000)
				entry.Sample = info.SampleRate
				entry.Bitrate = info.Bitrate
			}
			m.cache[t.s.Path] = entry
			m.cacheMu.Unlock()

			if n%4 == 0 {
				m.report("probe", n, len(tasks))
			}
		}(t)
	}
	wg.Wait()
	m.report("probe", len(tasks), len(tasks))
	return filled
}

/* --------------------------------------------------------------------------
   目录遍历
   -------------------------------------------------------------------------- */

func walkFolder(root string) ([]candidate, string) {
	out := []candidate{}
	info, err := os.Stat(root)
	if err != nil {
		if os.IsNotExist(err) {
			return out, "missing"
		}
		if os.IsPermission(err) {
			return out, "denied"
		}
		return out, "missing"
	}
	if !info.IsDir() {
		return out, "missing"
	}

	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			// 单个子目录无权限时跳过，不中断整次扫描
			if d != nil && d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		// 跳过隐藏目录（.git / $RECYCLE.BIN 等）
		if d.IsDir() {
			name := d.Name()
			if path != root && (strings.HasPrefix(name, ".") || strings.HasPrefix(name, "$")) {
				return fs.SkipDir
			}
			return nil
		}
		if !d.Type().IsRegular() {
			return nil
		}
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
		if !bootstrap.IsAudioExt(ext) {
			return nil
		}
		fi, err := d.Info()
		if err != nil {
			return nil
		}
		out = append(out, candidate{
			path:   path,
			size:   fi.Size(),
			ext:    ext,
			folder: root,
			mod:    fi.ModTime().UnixMilli(),
		})
		return nil
	})
	if err != nil {
		if os.IsPermission(err) {
			return out, "denied"
		}
		// 以前这里返回 "ok"：磁盘 I/O 错误 / 路径过长 / 网络盘断开都会被当成
		// 「扫描成功」，曲库被静默截断而界面上没有任何提示，排查极其困难。
		log.Printf("[library] 遍历 %s 失败: %v", root, err)
		return out, "error"
	}
	return out, "ok"
}

// countSongsInFolders 统计每个文件夹下有多少首（返回的切片与 paths 等长）。
//
// 抽成独立函数有两个目的：
//  1. 让调用方能在**写锁之外**先算好（见 Scan 第 5 步的说明）—— 这段是
//     O(文件夹 × 曲库)，不该在锁里跑；
//  2. 语义集中一处，便于测试（嵌套文件夹时一首歌会被多个文件夹同时计入，
//     与原来的 `isUnder` 循环逐字一致）。
func countSongsInFolders(songs []bootstrap.Song, paths []string) []int {
	counts := make([]int, len(paths))
	for i, root := range paths {
		n := 0
		for _, s := range songs {
			if isUnder(s.Path, root) {
				n++
			}
		}
		counts[i] = n
	}
	return counts
}

// isUnder 判断 path 是否位于 root 之下（含 root 本身）
func isUnder(path, root string) bool {
	// 快速路径：root 是 path 的字符串前缀，且边界落在目录分隔符上。
	//
	// 为什么需要它：这个函数在 Scan / RescanPaths 里被调用 O(folders × songs) 次
	//（20 个文件夹 × 10 万首 = 200 万次），且整段在写锁内完成。filepath.Rel 会做
	// Clean/Abs 与字符串分配，是那条循环的主要成本。
	//
	// 快路径成立的前提在扫描路径上是硬保证的：song.Path 来自
	// filepath.WalkDir(folder.Path)，必然以 folder.Path 的原文开头。
	// 快路径不成立时（大小写不同、相对路径、含 . 或 ..）落到下面的慢路径，
	// 语义与原实现完全一致。
	if root != "" && strings.HasPrefix(path, root) {
		if len(path) == len(root) {
			return true
		}
		if isSep(root[len(root)-1]) || isSep(path[len(root)]) {
			return true
		}
	}

	rel, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	// 不能写成 !strings.HasPrefix(rel, "..")：filepath.Rel("C:/Music",
	// "C:/Music/..hidden/a.mp3") 得到 "..hidden/a.mp3"，它同样以 ".." 开头，
	// 于是**真实存在的子目录**会被判成「不在 root 之下」。
	// 只有恰好等于 ".." 或以 ".." + 分隔符开头才是真的越界。
	if rel == ".." {
		return false
	}
	return !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// isSep 判目录分隔符（Windows 上两种都认，便于比较外部传入的路径字符串）
func isSep(c byte) bool {
	return c == filepath.Separator || c == '/' || c == '\\'
}

// CountInFolder 统计某目录下的曲目数（供文件夹新增后立即回显）
func (m *Manager) CountInFolder(root string) int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	n := 0
	for _, s := range m.songs {
		if isUnder(s.Path, root) {
			n++
		}
	}
	return n
}

// ValidateFolder 新增目录前的校验
func ValidateFolder(path string) (string, error) {
	p := bootstrap.ExpandPath(path)
	if p == "" {
		return "", errors.New("路径不能为空")
	}
	info, err := os.Stat(p)
	if err != nil {
		return "", fmt.Errorf("路径不存在或无法访问: %w", err)
	}
	if !info.IsDir() {
		return "", errors.New("请选择一个文件夹，而不是文件")
	}
	return p, nil
}
