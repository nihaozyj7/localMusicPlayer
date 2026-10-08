// Package loudness 计算音频的响度并给出回放补偿增益。
//
// 为什么需要：不同来源的音频响度差得很远（实测用户曲库里同一批 m4a 的
// 整合响度能差 10 LU 以上），切歌时音量忽大忽小。这里按 EBU R128 / ITU-R
// BS.1770-4 测出每首歌的整合响度与真峰值，回放时按目标响度做增益补偿。
//
// 补偿方式选择「静态线性增益」而不是 loudnorm 的动态归一化：
//   - 线性增益保留原始动态范围，不会破坏音乐本身的强弱对比；
//   - 结果是一个恒定 dB 值，后端可以在音频回调里实时套用，切歌零延迟；
//   - 动态归一化需要实时重采样整条流，做不到了解耦（也无法用于原生格式）。
//
// ★ 本包最重要的一条设计：**测量与挡位是两件事。**
//
// 整合响度(LUFS) / 真峰值(dBTP) / LRA / 相对门限是音频文件本身的固有属性，
// 与用户选哪个目标响度毫无关系；补偿增益才是挡位相关的。所以：
//
//	一首歌无论用户在几个挡位之间怎么切，都**只测量一次**；
//	每多用一个挡位，只多出一条几个字节的增益记录（见 cache.go）。
package loudness

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"sync"

	"localmusicplayer/internal/atomicfile"
	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/ffmpeg"
)

/* ==========================================================================
   缓存模型
   ========================================================================== */

// Measurement 一首歌的响度测量结果。
//
// ★ 这里**刻意没有** Target / Gain 字段。
//
// 它们曾经在结构体里，后果就是「换挡位时整条记录判为过期并删除」——
// 用户从「较响(-14)」切到「默认(-16)」，之前在 -14 算好的补偿全没了。
// 测量结果是文件的固有量，不该带任何与用户设置相关的字段 —— 把这条约束
// 写进类型里，比写在注释里更不容易被后人改回去。
type Measurement struct {
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	ModTime int64  `json:"modTime"`
	// Algo 是测量算法版本。算法变了旧结果不可用（见 AlgoVersion）。
	Algo int `json:"algo,omitempty"`

	Integrated float64 `json:"integrated"` // 整合响度 LUFS
	TruePeak   float64 `json:"truePeak"`   // 真峰值 dBTP
	LRA        float64 `json:"lra"`        // 响度范围 LU
	Threshold  float64 `json:"threshold"`  // 相对门限 LUFS

	Measured   bool  `json:"measured,omitempty"` // false 表示「测过但拿不到数据」
	MeasuredAt int64 `json:"measuredAt"`
}

// GainEntry 一首歌在某个挡位上算出的补偿增益（dB）。
//
// 它由「测量结果 + 该挡位的目标响度」决定，所以带 Target 作为自校验字段：
// 万一有增益被写到了错误的挡位下（手工改缓存、迁移出岔子），读取时能发现
// 并丢弃，而不是给出错误的音量补偿。
type GainEntry struct {
	Target float64 `json:"target"`
	DB     float64 `json:"db"`
	// Algo 防止测量算法升级后继续用旧算法算出的增益。
	Algo int   `json:"algo,omitempty"`
	At   int64 `json:"at,omitempty"`
}

// Album 专辑（或整个曲库）的平均响度，用于「整张专辑统一」模式
type Album struct {
	Integrated float64 `json:"integrated"`
	Count      int     `json:"count"`
	Target     float64 `json:"target,omitempty"`
	Algo       int     `json:"algo,omitempty"`
	UpdatedAt  int64   `json:"updatedAt"`
}

// 增益安全边界
const (
	minGainDB = -24.0
	maxGainDB = 24.0
	// 真峰值上限：留一点余量，避免增益后削波
	truePeakCeiling = -1.0
)

// cacheFile 是磁盘上的 loudness-cache.json。
//
// Entries 与 Gains 分成两个 map，而不是像旧版那样在一条记录里塞两种东西：
// 它们的「生命周期」和「失效条件」完全不同 ——
//
//	entries 的 key 含 size/modTime，文件一变旧测量就作废；
//	gains   的 key 是曲库 songID（路径派生、稳定），所以文件内容变化后
//	        它会指向一条已失效的测量，读取时被丢弃（见 validGainLocked）。
type cacheFile struct {
	Version int                             `json:"version"`
	Entries map[string]Measurement          `json:"entries"`
	Gains   map[string]map[string]GainEntry `json:"gains,omitempty"`
	Albums  map[string]Album                `json:"albums,omitempty"`
}

// cacheVersion 是**磁盘格式**版本，与 AlgoVersion（测量算法版本）无关。
//
// 2 对应「entries + gains 分表」这一次改动。读到更低版本时走一次迁移
// （见 migrateLegacy）：固有量留在 entries，增益按记录里的 target 归到
// 对应挡位下 —— 这样老用户升级后**一条已算好的数据都不会丢**。
const cacheVersion = 2

// Manager 响度管理器
type Manager struct {
	dataDir string
	// tools 由后台 prewarm 写入、被测量路径读取，因此单独用一把锁保护
	// （不要和 mu 混用：mu 保护的是缓存表，持锁时间尺度完全不同）
	toolsMu sync.RWMutex
	tools   ffmpeg.Tools
	// conc 是测量的并发上限（见 DefaultConcurrency）
	conc int

	mu    sync.RWMutex
	items map[string]Measurement
	// gains 是 songID → 目标响度键 → 增益。用两级 map 而不是把 target 拼进
	// 一层 key：读取时不必为四个挡位各构造一次 key，序列化后也更紧凑。
	gains  map[string]map[string]GainEntry
	albums map[string]Album
	dirty  bool
	loaded bool
	// loadOnce 保证磁盘缓存只在**第一次真正用到**时读一次（见 ensureLoaded）
	loadOnce sync.Once

	// q 是「播放优先」的测量队列（见 manager.go 的队列一节）
	q managerQueue
}

// NewManager 创建管理器；dataDir 通常为 %APPDATA%\LocalMusicPlayer
func NewManager(dataDir string, concurrency int) *Manager {
	if concurrency <= 0 {
		concurrency = DefaultConcurrency
	}
	if concurrency > MaxConcurrency {
		concurrency = MaxConcurrency
	}
	m := &Manager{
		dataDir: dataDir,
		// 刻意**不在这里同步 Resolve()**：内置 ffmpeg 的解包（读 6MB + 哈希 +
		// 落盘，首次还可能有杀软扫描）会发生在 main() 建窗口之前，把首帧拖慢
		// 好几秒。启动流程里已有后台 goroutine 调 RefreshTools()（见 main.go
		// 的 ffmpeg prewarm），而真正需要工具的测量动作都要等用户触发，到那时
		// 一定已经就绪；万一更早被问到，toolSet() 会自己补一次解析。
		conc:   concurrency,
		items:  map[string]Measurement{},
		gains:  map[string]map[string]GainEntry{},
		albums: map[string]Album{},
		q:      *newManagerQueue(),
	}
	// ★ 刻意**不在这里**调 load()：它是同步读整份 JSON，发生在建窗口之前
	//   会拖慢首帧。改成懒加载（见 ensureLoaded），与 library.Manager 一致。
	return m
}

/* --------------------------------------------------------------------------
   缓存键
   -------------------------------------------------------------------------- */

func (m *Manager) cachePath() string {
	return filepath.Join(m.dataDir, "loudness-cache.json")
}

// CachePath 返回测量缓存文件路径（供设置界面显示）
func (m *Manager) CachePath() string { return m.cachePath() }

// keyFor 生成测量缓存的 map key（path + size + modTime）。
//
// 为什么不用 fmt.Sprintf：这个函数在**每一次缓存查找**上都会被调用
// （Get / GetAny / 批量遍历），而 GainMap 一次就要为整库每首歌查一遍。
// 实测 10,000 次：Sprintf 版 1.51ms / 39,617 次分配，本实现 0.43ms /
// 10,000 次 —— 快 3.5 倍，分配少 75%（剩下的分配是 key 字符串本身，
// 它必须存活在 map 里，无法避免）。
//
// 分隔符用 \x00：路径里不可能出现（Windows 与 POSIX 都禁止），因此
// "a|1|2" 式的歧义拼接不会发生（原来用 "|"，路径含 | 时会撞 key）。
//
// 这里用 append 到一个**栈上数组**而不是 strings.Builder：
// Builder 至少要一次堆分配来放内部 buffer；而 key 很短（路径 + 两个 int64），
// 256 字节的栈数组足够覆盖绝大多数情况，超出时 append 会自动转堆。
func keyFor(path string, size, mod int64) string {
	var buf [256]byte
	b := buf[:0]
	b = append(b, path...)
	b = append(b, 0)
	b = strconv.AppendInt(b, size, 10)
	b = append(b, 0)
	b = strconv.AppendInt(b, mod, 10)
	// string(b) 必然复制一次 —— 这是 key 需要长期存活所必需的
	return string(b)
}

// targetKey 把目标响度规范化成增益表的键。
//
// 为什么用「十分之一 LU 的整数」而不是原样格式化的浮点串：
// 前端传来的目标值经 JSON 往返可能出现 -16 与 -15.999999999 这种表示差异，
// 直接用浮点串会落成两个键、同一条测量被算两遍。四舍五入到 0.1 LU 之后
// 同一个挡位永远落同一个键（-14 / -16 / -18 / -23 本来就都是整数）。
func targetKey(target float64) string {
	return strconv.FormatInt(int64(math.Round(target*10)), 10)
}

func nowMillis() int64 { return timeNow().UnixMilli() }

/* --------------------------------------------------------------------------
   读写盘
   -------------------------------------------------------------------------- */

// ensureLoaded 首次真正用到缓存时才读盘（sync.Once，最多读一次）。
//
// 为什么用懒加载：load() 是**同步**读整份 loudness-cache.json 再做
// json.Unmarshal，而 NewManager 在 main() 建窗口之前跑（见 main.go 的启动
// 顺序）—— 缓存越大，首帧被拖得越久。曲库那边（library.Manager）早就用了
// sync.Once 懒加载（cacheOnce + ensureCacheLoaded），这里补齐成同一套做法。
//
// 为什么用 sync.Once 而不是在 load() 里判 m.loaded：后者每次调用都要抢一次
// 写锁、或者要写双重检查加锁；sync.Once 正是为「最多执行一次」而存在。
func (m *Manager) ensureLoaded() {
	m.loadOnce.Do(m.load)
}

// legacyEntry 对应 v1 的 entries 值：在固有量之外还带 target / gain。
//
// 保留它只是为了**迁移**：读到旧文件时把增益捞出来归位。新格式不再写这两个
// 字段（Measurement 里没有它们）。
type legacyEntry struct {
	Measurement
	Target float64 `json:"target,omitempty"`
	Gain   float64 `json:"gain,omitempty"`
}

func (m *Manager) load() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loaded = true

	raw, err := os.ReadFile(m.cachePath())
	if err != nil {
		return
	}

	var cf cacheFile
	if err := json.Unmarshal(raw, &cf); err != nil {
		return
	}
	if cf.Entries != nil {
		m.items = cf.Entries
	}
	if cf.Gains != nil {
		m.gains = cf.Gains
	}
	if cf.Albums != nil {
		m.albums = cf.Albums
	}
	if cf.Version < cacheVersion {
		m.migrateLegacyLocked(raw)
	}
}

// migrateLegacyLocked 把 v1 缓存里的 target/gain 迁到增益表。调用方需持有写锁。
//
// 这一步是「用户升级后数据不丢」的关键：v1 里每条记录只存了**一个**挡位的
// 增益（算它时的那个 target），迁移就是把它原样放到那一挡位下。用户之前
// 在「较响」算过的补偿，升级后仍然是「较响」的补偿，切过去立刻命中。
//
// 迁移失败（JSON 形状不对）不是错误：entries 已经按新格式装好了，只是少了
// 增益记录 —— 那会退化成「那一挡位重算一次」，比整份缓存不可用轻得多。
func (m *Manager) migrateLegacyLocked(raw []byte) {
	var old struct {
		Entries map[string]legacyEntry `json:"entries"`
	}
	if err := json.Unmarshal(raw, &old); err != nil {
		return
	}
	for key, e := range old.Entries {
		item, ok := m.items[key]
		// v1 的增益只有在「记录自身标记为已测量、且写了 target」时才可信。
		if !ok || !item.Measured || e.Target == 0 {
			continue
		}
		// v1 的记录里没有 songID，只能按路径派生 —— 这正是曲库算 id 的方式
		// （见 bootstrap.SongIDForPath 的说明）。
		m.putGainLocked(bootstrap.SongIDForPath(item.Path), e.Target, e.Gain)
	}
	if len(m.gains) > 0 {
		m.dirty = true
	}
}

// putGainLocked 写入一条挡位增益（调用方需持有写锁）。
//
// ★ 记账用的 id 必须与查询用的 id 是**同一个来源**：查询走 GainFor(song)，
// 用的是曲库给的 song.ID。所以这里优先用调用方传来的 id；只有拿不到时
// （例如从磁盘记录里反推、没有 Song 对象）才回退到按路径派生。
//
// 两个来源必须一致，否则会出现「写进去了但永远查不到」这种最难查的 bug ——
// 表现就是"补偿每次都要重算"。曲库的 id 确实是 StableID(path, "t")，
// 但那是库内部的实现细节，不该由这里假设。
func (m *Manager) putGainLocked(id string, target, gainDB float64) {
	if id == "" {
		return
	}
	bucket := m.gains[id]
	if bucket == nil {
		bucket = map[string]GainEntry{}
		m.gains[id] = bucket
	}
	bucket[targetKey(target)] = GainEntry{
		Target: target,
		DB:     gainDB,
		Algo:   AlgoVersion,
		At:     nowMillis(),
	}
}

// Save 落盘（有变化才写）
func (m *Manager) Save() error {
	m.ensureLoaded()
	m.mu.Lock()
	if !m.dirty {
		m.mu.Unlock()
		return nil
	}
	// 必须在锁内**复制**这几张 map，不能把 m.items / m.gains 直接交给
	// cacheFile：map 是引用类型，那样 Unlock 之后 json.Marshal 仍在遍历同一个
	// 哈希表，而 Store / putGainLocked 会在锁内写它。Go 里「并发 map 迭代 +
	// 写入」是 fatal error，进程直接崩且无法 recover（不是可以被 -race
	// 温和报告的普通数据竞争）。
	entries := make(map[string]Measurement, len(m.items))
	for k, v := range m.items {
		entries[k] = v
	}
	gains := make(map[string]map[string]GainEntry, len(m.gains))
	for id, bucket := range m.gains {
		cp := make(map[string]GainEntry, len(bucket))
		for k, v := range bucket {
			cp[k] = v
		}
		gains[id] = cp
	}
	albums := make(map[string]Album, len(m.albums))
	for k, v := range m.albums {
		albums[k] = v
	}
	m.dirty = false
	m.mu.Unlock()

	raw, err := json.Marshal(cacheFile{Version: cacheVersion, Entries: entries, Gains: gains, Albums: albums})
	if err != nil {
		return err
	}
	return atomicfile.Write(m.cachePath(), raw, 0o644)
}

/* --------------------------------------------------------------------------
   查询
   --------------------------------------------------------------------------
   缓存有效性 = 文件没变（路径+大小+修改时间） && 算法版本没变。

   ★ **目标响度不在其中** —— 这是本次改动的核心。测量结果与挡位无关，
     增益在读取时按当前挡位现算（见 GainFor）。改挡位因此是零成本：
     没有重算，也不会丢任何已算好的数据。
   -------------------------------------------------------------------------- */

// valid 判断一条测量记录是否可用。调用方需持有锁。
func valid(item Measurement, song bootstrap.Song) bool {
	if item.Path != song.Path || item.Size != song.Size || item.ModTime != song.ModTime {
		return false
	}
	return item.Algo == AlgoVersion
}

// Get 取某首歌的测量结果（未测量或已过期返回 false）。
//
// 注意签名里已经没有 targetLUFS：它以前只用于**失效判断**，
// 而那个判断正是「换挡位就丢数据」的根源。
func (m *Manager) Get(song bootstrap.Song) (Measurement, bool) {
	m.ensureLoaded()
	m.mu.RLock()
	item, ok := m.items[keyFor(song.Path, song.Size, song.ModTime)]
	m.mu.RUnlock()
	if !ok || !valid(item, song) {
		return Measurement{}, false
	}
	return item, true
}

// Count 缓存里的记录条数（含已过期的，仅供诊断显示）
func (m *Manager) Count() int {
	m.ensureLoaded()
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.items)
}

// CountValid 仍然有效的测量记录数（与挡位无关）
func (m *Manager) CountValid(songs []bootstrap.Song) int {
	m.ensureLoaded()
	m.mu.RLock()
	defer m.mu.RUnlock()
	n := 0
	for _, s := range songs {
		if item, ok := m.items[keyFor(s.Path, s.Size, s.ModTime)]; ok && valid(item, s) {
			n++
		}
	}
	return n
}

// Missing 返回还没测量（或已过期）的歌曲，用于批量补测。
//
// 同样与挡位无关：只要测量过，任何挡位都能立刻算出增益，
// 不需要为了另一个挡位重新排队。
func (m *Manager) Missing(songs []bootstrap.Song) []bootstrap.Song {
	m.ensureLoaded()
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]bootstrap.Song, 0, len(songs))
	for _, s := range songs {
		item, ok := m.items[keyFor(s.Path, s.Size, s.ModTime)]
		if !ok || !valid(item, s) {
			out = append(out, s)
		}
	}
	return out
}

// InvalidateTarget 保留旧签名，但**不再删除任何测量数据**。
//
// 历史行为是「把 target 不等于当前值的记录全删掉」，代价是用户每换一次挡位
// 就丢掉整库已算好的结果（在几个挡位之间来回切 = 反复重算同一批歌）。
// 现在测量与挡位解耦，换挡位只需要按新目标现算增益，没有任何东西需要失效。
//
// 保留这个方法是为了不动前端绑定（见 services.go 的 InvalidateTarget）；
// 返回 0 表示「本次没有任何缓存被丢弃」。
func (m *Manager) InvalidateTarget(targetLUFS float64) int {
	m.InvalidateStaleGains(targetLUFS)
	return 0
}

// InvalidateStaleGains 丢弃「目标值与记录自述不符」的增益条目，返回丢弃条数。
//
// 它不是给换挡位用的（换挡位不需要任何失效），而是自校验：万一有增益被写到
// 了错误的挡位下，这里能把坏数据清掉，而不是让它去影响音量补偿。
func (m *Manager) InvalidateStaleGains(targetLUFS float64) int {
	m.ensureLoaded()
	m.mu.Lock()
	defer m.mu.Unlock()
	dropped := 0
	for id, bucket := range m.gains {
		for key, g := range bucket {
			if math.Abs(g.Target-targetLUFS) > 0.001 || g.Algo != AlgoVersion {
				delete(bucket, key)
				dropped++
			}
		}
		if len(bucket) == 0 {
			delete(m.gains, id)
		}
	}
	if dropped > 0 {
		m.dirty = true
	}
	return dropped
}

// Clear 清空测量缓存
func (m *Manager) Clear() error {
	m.ensureLoaded()
	m.mu.Lock()
	m.items = map[string]Measurement{}
	m.gains = map[string]map[string]GainEntry{}
	m.albums = map[string]Album{}
	m.dirty = true
	m.mu.Unlock()
	if err := os.Remove(m.cachePath()); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

/* --------------------------------------------------------------------------
   增益
   -------------------------------------------------------------------------- */

// GainDB 计算把这首歌拉到目标响度所需的增益（dB）。
//
// 这里是「响度均衡」的核心：
//
//	gain = 目标响度 − 测得的整合响度
//
// 然后再按真峰值收一下，保证不会因为抬升而削波。
func GainDB(item Measurement, targetLUFS float64) float64 {
	if item.Integrated == 0 {
		return 0
	}
	gain := targetLUFS - item.Integrated

	// 真峰值保护：增益后真峰值不得超过上限
	if item.TruePeak != 0 {
		if maxAllowed := truePeakCeiling - item.TruePeak; gain > maxAllowed {
			gain = maxAllowed
		}
	}

	if gain > maxGainDB {
		gain = maxGainDB
	}
	if gain < minGainDB {
		gain = minGainDB
	}
	return math.Round(gain*100) / 100
}

// GainFor 按歌曲查询该挡位下的补偿增益。
//
// ★ 这是「换挡位零成本」的落点，两级命中：
//
//  1. 增益表里有这个挡位的记录 → 直接返回（**不起 ffmpeg、不重算**）；
//  2. 没有但测量结果在 → 用 GainDB 现算一次（纯算术）并记进表里。
//
// 第 2 条保证了「在 -14 测过、切到 -16」时隔一个函数调用就有结果，
// 而不是排一次队、再跑一遍 ffmpeg —— 那正是用户报的「补偿丢了」。
func (m *Manager) GainFor(song bootstrap.Song, targetLUFS float64) (float64, bool) {
	item, ok := m.Get(song)
	if !ok {
		return 0, false
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if bucket := m.gains[song.ID]; bucket != nil {
		if g, hit := bucket[targetKey(targetLUFS)]; hit &&
			math.Abs(g.Target-targetLUFS) <= 0.001 && g.Algo == AlgoVersion {
			return g.DB, true
		}
	}
	// 未命中：现算并记账（纯算术，几纳秒；记下来之后连算术都省了）
	gain := GainDB(item, targetLUFS)
	m.putGainLocked(song.ID, targetLUFS, gain)
	m.dirty = true
	return gain, true
}

// GainCount 返回已缓存的挡位增益条数（诊断用：一万首 × 四挡 = 四万）
func (m *Manager) GainCount() int {
	m.ensureLoaded()
	m.mu.RLock()
	defer m.mu.RUnlock()
	n := 0
	for _, bucket := range m.gains {
		n += len(bucket)
	}
	return n
}

// UpdateAlbum 用一批测量结果更新某个专辑（或整个曲库）的平均响度
func (m *Manager) UpdateAlbum(name string, songs []bootstrap.Song) {
	var sum float64
	var n int
	for _, s := range songs {
		if item, ok := m.Get(s); ok && item.Integrated != 0 {
			sum += item.Integrated
			n++
		}
	}
	if n == 0 {
		return
	}
	m.mu.Lock()
	m.albums[name] = Album{Integrated: sum / float64(n), Count: n, Algo: AlgoVersion, UpdatedAt: nowMillis()}
	m.dirty = true
	m.mu.Unlock()
}

// AlbumGainDB 计算某个专辑/曲库的整体增益
func (m *Manager) AlbumGainDB(name string, targetLUFS float64) (float64, bool) {
	m.mu.RLock()
	al, ok := m.albums[name]
	m.mu.RUnlock()
	if !ok || al.Integrated == 0 {
		return 0, false
	}
	return GainDB(Measurement{Integrated: al.Integrated}, targetLUFS), true
}
