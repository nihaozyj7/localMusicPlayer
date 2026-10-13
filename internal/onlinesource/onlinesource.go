// Package onlinesource 记录在线歌曲的**来源**：哪些歌试听过（缓存落在哪）、
// 哪些歌下载过（文件在哪个目录、还在不在）。
//
// # 为什么需要单独记账
//
// 「试听过的歌」和「下载过的歌」在磁盘上是两种性质完全不同的东西：
//
//   - 试听缓存是**派生数据**：临时目录、可丢弃、随时能重新下载；
//   - 下载是**用户的文件**：在下载目录里，用户删了就是删了。
//
// 两者的对应关系以前只体现在一个副作用上 —— 下载会「搬走」试听缓存
// （见 services_download.go#tryMoveFromCache）。于是一首歌只要下载过一次，
// 缓存里那份就消失了，而**没有任何地方记得它已经下载过**：
//
//   - 搜索结果显示不出「已下载」，用户无法判断该不该再点一次下载；
//   - 下载目录里那份被用户删掉之后，也没有任何地方能察觉。
//
// 这份记账把「来源」变成显式数据（而不是某个动作的副作用）：每条记录都带着
// bvid、标题、路径、来源地址与时间。播放仍然走缓存（缓存是可再生的），
// 记账只回答「这首歌的来源是什么、那个来源现在还在不在」。
//
// # 文件格式：jsonl
//
// 一行一个 JSON 对象，字段见 Record。选 jsonl 而不是一个整体 JSON 数组：
//
//   - **追加写**。记录一次试听/一次下载各追加一行，不需要读改写整个文件 ——
//     断电或进程被杀最多丢最后一行，前面的记录完好（读的时候会跳过残行）。
//   - **可人工排查**。用户或维护者 `Get-Content` 就能逐行看懂。
//
// 同一个 (bvid, kind) 会被后来的记录覆盖（**后者胜**）：同一首歌重新缓存到
// 新路径、或者重新下载到另一个目录，最新那条才是事实。文件行数超过阈值时
// 自动压实（Compact）成「每个键一行」，所以它不会无限增长。
//
// # 存在性是**读的时候**判定的
//
// 记录里的 Path 只是「当时的路径」。文件可能已经被用户删掉（下载目录里的
// 那份）、或者被系统清理掉（临时目录里的缓存），所以 Exists / Size 一律在
// 读取时 stat 出来，`Prune` 可以把「文件已经不在了」的记录清掉 ——
// 这样记账自己会收敛，不需要用户手工清理。
package onlinesource

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"localmusicplayer/internal/atomicfile"
)

// 记录的两种来源。取值会落进 jsonl，改动等于改文件格式。
const (
	// KindCache 是试听缓存（临时目录里的派生数据）。
	KindCache = "cache"
	// KindDownload 是下载到用户目录的文件。
	KindDownload = "download"
)

// 下载的来源通道（Record.From）：说明这份文件是怎么来的。
const (
	// FromCache 表示下载是直接把试听缓存搬/复制过去的（没走网络）。
	FromCache = "cache"
	// FromNetwork 表示下载重新走了一次网络。
	FromNetwork = "network"
)

// maxLineBytes 是单行上限（Scanner 的缓冲上限）。
//
// 一条记录只有几百字节；给 1MB 是为了让「文件被别的程序写坏」时
// 读循环不会因为超长行直接报错退出，而是照常处理后面的记录。
const maxLineBytes = 1 << 20

// minCompactLines 是压实的最小行数门槛。
//
// 压实要重写整个文件，太频繁地做反而是噪音；几十行的规模直接压掉即可，
// 而「键多、重复少」时（每个键只有一行）压实没有收益，所以真正的门槛
// 是 compactThreshold 里那个与键数挂钩的式子。
const minCompactLines = 64

// Record 是一条来源记录。零值无意义（BVID 与 Kind 必填）。
type Record struct {
	// BVID 是在线歌曲的视频 id（唯一键的一半）。
	BVID string `json:"bvid"`
	// Kind 是 KindCache / KindDownload（唯一键的另一半）。
	Kind string `json:"kind"`
	// Title / Artist 是当时的曲目信息，供界面直接显示（不保证最新）。
	Title  string `json:"title,omitempty"`
	Artist string `json:"artist,omitempty"`
	// Ext 是音频扩展名（不含点）。
	Ext string `json:"ext,omitempty"`
	// Path 是**当时**的文件路径：缓存条目是缓存文件，下载条目是下载目标。
	// 它是否还存在由读取方 stat 判定（见 Status.Exists）。
	Path string `json:"path,omitempty"`
	// Dir 只在下载条目里有意义：用户看到的下载目录。
	Dir string `json:"dir,omitempty"`
	// Origin 是来源音频地址（B 站音频流；解析出来的直链会过期，
	// 留着是为了排查「这份缓存是从哪儿来的」）。
	Origin string `json:"origin,omitempty"`
	// From 说明下载的来源通道（FromCache / FromNetwork）。
	From string `json:"from,omitempty"`
	// At 是记录时刻（毫秒时间戳）。
	At int64 `json:"at"`
}

// Status 是「记录 + 此刻的存在性」，给界面与清理逻辑用。
//
// 存在性不落盘：路径会过期，落盘的存在性只会变成一份更不可信的副本。
type Status struct {
	Record
	// Exists 表示 Path 现在还是一个可读的普通文件。
	Exists bool `json:"exists"`
	// Size 是此刻的文件大小（Exists 为假时是 0）。
	Size int64 `json:"size"`
}

// Ledger 是一份来源记账。
//
// 零值不可用，必须经 Open 构造。内部索引是「读的时候的快照 + 每次追加的增量」，
// 所以它同时是**写入口**与**查询口**，全进程共用一个实例
// （两个实例各读一份文件会让彼此的增量互相看不见）。
type Ledger struct {
	path string

	mu     sync.Mutex
	byKey  map[string]Record
	lines  int // 已读入的有效行数（压实判据）
	badSeq int // 跳过的坏行数（只用于诊断日志）
}

// Open 打开（或准备创建）path 处的记账文件。
//
// 文件不存在不是错误：第一次试听/下载时才会创建它。
// 已经存在的文件会被读进内存索引 —— 坏行（写到一半被杀、被别的程序改坏）
// 会被跳过而不是让整份记账不可用。
func Open(path string) (*Ledger, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, errors.New("onlinesource: 记账文件路径为空")
	}
	l := &Ledger{path: path, byKey: map[string]Record{}}
	if err := l.load(); err != nil {
		return nil, err
	}
	return l, nil
}

// Path 返回记账文件路径（供设置界面显示 / 排查）。
func (l *Ledger) Path() string { return l.path }

// BadLines 返回读取时跳过的坏行数（诊断用；正常应为 0）。
func (l *Ledger) BadLines() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.badSeq
}

// key 是「同一首歌的同一种来源」的唯一键。
func key(bvid, kind string) string { return kind + "\x00" + bvid }

// load 把文件读进内存索引（后者胜）。
func (l *Ledger) load() error {
	f, err := os.Open(l.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 8<<10), maxLineBytes)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 {
			continue
		}
		var rec Record
		if err := json.Unmarshal(line, &rec); err != nil {
			// 残行：追加写被中断时最后一行可能只有半截。跳过它，
			// 前面的记录仍然有效 —— 这正是选 jsonl 的理由。
			l.badSeq++
			continue
		}
		if !valid(rec) {
			l.badSeq++
			continue
		}
		l.lines++
		l.byKey[key(rec.BVID, rec.Kind)] = rec
	}
	if err := sc.Err(); err != nil {
		return fmt.Errorf("onlinesource: 读取 %s 失败: %w", l.path, err)
	}
	return nil
}

// valid 判断一条记录能不能进索引（bvid / kind 是必须的，其余可为空）。
func valid(rec Record) bool {
	if strings.TrimSpace(rec.BVID) == "" {
		return false
	}
	switch rec.Kind {
	case KindCache, KindDownload:
		return true
	default:
		return false
	}
}

// Record 追加一条记录并更新内存索引（同键覆盖）。
//
// 落盘采用「打开 → 追加一行 → 关闭」，不做长驻文件句柄：
// 记录的产生频率是「每次试听 / 每次下载一条」，为它维护一个持有的句柄
// 只会带来额外风险 —— 压实（Compact）会把文件整体替换掉，长驻句柄
// 之后写的就是那个已经被换掉的旧文件（追加成功、但内容再也读不到）。
//
// 写失败会原样返回错误，**调用方只应记日志**：来源记账是辅助信息，
// 不该因为它让试听或下载失败。
func (l *Ledger) Record(rec Record) error {
	rec.BVID = strings.TrimSpace(rec.BVID)
	rec.Kind = strings.TrimSpace(rec.Kind)
	if !valid(rec) {
		return fmt.Errorf("onlinesource: 记录缺少 bvid 或 kind（bvid=%q kind=%q）", rec.BVID, rec.Kind)
	}
	if rec.At <= 0 {
		rec.At = time.Now().UnixMilli()
	}
	line, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	line = append(line, '\n')

	l.mu.Lock()
	defer l.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(l.path), 0o755); err != nil {
		return err
	}
	// O_RDWR 而不是 O_WRONLY：下面的 ensureTrailingNewline 要读最后一个字节
	// （只写句柄读会直接拿到 Access is denied）。
	f, err := os.OpenFile(l.path, os.O_APPEND|os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return err
	}
	// ★ 追加前补一个换行（如果文件不是以换行结尾）。
	//
	// 上一次追加被中断（进程被杀、断电）时会留下**半截行且没有换行符**，
	// 此时直接追加会让新记录挂在残行后面，变成同一行的垃圾 ——
	// 结果是「刚记下的这条读不回来」，而且读到坏行的人根本不知道
	// 那条被吞掉的才是有效记录。补一个换行就把残行单独关进它自己那一行，
	// 读取时跳过它即可（本文件末尾的测试钉的就是这一幕）。
	if werr := ensureTrailingNewline(f); werr != nil {
		_ = f.Close()
		return werr
	}
	_, werr := f.Write(line)
	cerr := f.Close()
	if werr != nil {
		return werr
	}
	if cerr != nil {
		return cerr
	}

	l.byKey[key(rec.BVID, rec.Kind)] = rec
	l.lines++
	if l.lines > l.compactThresholdLocked() {
		// 压实失败不影响这次记录：文件里那条已经写进去了。
		_ = l.compactLocked()
	}
	return nil
}

// ensureTrailingNewline 保证文件以换行结尾（空文件或已是换行时什么都不做）。
//
// 为什么需要它：追加写被中断会留下没有换行的半截行，下一次追加会与它拼成
// 同一行，新记录随之被读取侧当成坏行丢掉（见 Record 里的说明）。
func ensureTrailingNewline(f *os.File) error {
	fi, err := f.Stat()
	if err != nil {
		return err
	}
	if fi.Size() == 0 {
		return nil
	}
	last := make([]byte, 1)
	if _, err := f.ReadAt(last, fi.Size()-1); err != nil {
		return err
	}
	if last[0] == '\n' {
		return nil
	}
	_, err = f.Write([]byte{'\n'})
	return err
}

// compactThresholdLocked 返回该压实时的行数。
//
// 与键数挂钩：键少而重复多（反复试听同一首）时压实收益最大，门槛低；
// 键数多（几百首各一条）时压实几乎不省东西，门槛跟着抬高。
func (l *Ledger) compactThresholdLocked() int {
	n := 2*len(l.byKey) + 32
	if n < minCompactLines {
		n = minCompactLines
	}
	return n
}

// Compact 把文件压实成「每个键一行」（最后一次记录）。
//
// 原子替换（临时文件 + 改名，见 internal/atomicfile）：压实过程中断电，
// 磁盘上要么是旧文件、要么是新文件，不会是半份。
func (l *Ledger) Compact() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.compactLocked()
}

func (l *Ledger) compactLocked() error {
	recs := l.snapshotLocked()
	var buf bytes.Buffer
	for _, rec := range recs {
		line, err := json.Marshal(rec)
		if err != nil {
			return err
		}
		buf.Write(line)
		buf.WriteByte('\n')
	}
	if err := atomicWrite(l.path, buf.Bytes()); err != nil {
		return err
	}
	l.lines = len(recs)
	return nil
}

// snapshotLocked 返回按 (kind, bvid) 排序的记录快照（顺序稳定，便于比对）。
func (l *Ledger) snapshotLocked() []Record {
	out := make([]Record, 0, len(l.byKey))
	for _, rec := range l.byKey {
		out = append(out, rec)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return out[i].Kind < out[j].Kind
		}
		return out[i].BVID < out[j].BVID
	})
	return out
}

// All 返回全部记录的快照（排序同 Compact）。
func (l *Ledger) All() []Record {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.snapshotLocked()
}

// Lookup 取某个来源的记录（不带存在性检查）。
func (l *Ledger) Lookup(bvid, kind string) (Record, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	rec, ok := l.byKey[key(strings.TrimSpace(bvid), strings.TrimSpace(kind))]
	return rec, ok
}

// statusOf 把一条记录变成「记录 + 此刻的存在性」。
func statusOf(rec Record) Status {
	st := Status{Record: rec}
	if strings.TrimSpace(rec.Path) == "" {
		return st
	}
	if fi, err := os.Stat(rec.Path); err == nil && fi.Mode().IsRegular() {
		st.Exists = true
		st.Size = fi.Size()
	}
	return st
}

// Downloaded 返回某首歌的下载来源，以及**它的文件现在还在不在**。
//
// 文件被用户删掉时第二个返回值为 false —— 这正是搜索结果里「已下载」
// 标注必须先问一遍的原因：记录说的是「曾经下载过」，不是「现在有」。
func (l *Ledger) Downloaded(bvid string) (Status, bool) {
	rec, ok := l.Lookup(bvid, KindDownload)
	if !ok {
		return Status{}, false
	}
	st := statusOf(rec)
	if !st.Exists {
		// 记录还在但文件没了：对调用方等同于「没有下载」。
		return st, false
	}
	return st, true
}

// CacheEntry 返回某首歌的试听缓存来源（同样带存在性）。
func (l *Ledger) CacheEntry(bvid string) (Status, bool) {
	rec, ok := l.Lookup(bvid, KindCache)
	if !ok {
		return Status{}, false
	}
	st := statusOf(rec)
	if !st.Exists {
		return st, false
	}
	return st, true
}

// Downloads 返回全部下载记录（带存在性，含文件已消失的那些 —— 界面
// 自己按 Exists 判断要不要显示成「已下载」）。
func (l *Ledger) Downloads() []Status {
	return l.statusesOfKind(KindDownload)
}

// CacheEntries 返回全部缓存记录（带存在性）。
func (l *Ledger) CacheEntries() []Status {
	return l.statusesOfKind(KindCache)
}

func (l *Ledger) statusesOfKind(kind string) []Status {
	recs := l.All()
	out := make([]Status, 0, len(recs))
	for _, rec := range recs {
		if rec.Kind != kind {
			continue
		}
		out = append(out, statusOf(rec))
	}
	return out
}

// Forget 删掉一条记录（压实后才真正从文件里消失）。
//
// 返回是否真的删掉了东西。文件本身的删除由调用方负责 ——
// 「记账」与「文件」是两件事，混在一起会让调用方误以为删记录等于删文件。
func (l *Ledger) Forget(bvid, kind string) bool {
	bvid = strings.TrimSpace(bvid)
	kind = strings.TrimSpace(kind)
	l.mu.Lock()
	defer l.mu.Unlock()
	k := key(bvid, kind)
	if _, ok := l.byKey[k]; !ok {
		return false
	}
	delete(l.byKey, k)
	// 立刻压实，别让「已删除」的记录留在文件里被下一次 Open 读回来
	// （内存索引与文件不一致会让删除看起来没生效）。
	_ = l.compactLocked()
	return true
}

// Prune 清掉「路径已经不存在」的记录，返回清掉的条数。
//
// 为什么要有它：下载目录里的文件被用户删掉、临时目录被系统清理之后，
// 旧记录只会一直躺在文件里。清理逻辑在空闲时调用它，记账就会自己收敛。
func (l *Ledger) Prune() int {
	l.mu.Lock()
	dropped := 0
	for k, rec := range l.byKey {
		if strings.TrimSpace(rec.Path) == "" {
			continue
		}
		fi, err := os.Stat(rec.Path)
		if err != nil || !fi.Mode().IsRegular() {
			delete(l.byKey, k)
			dropped++
		}
	}
	if dropped > 0 {
		_ = l.compactLocked()
	}
	l.mu.Unlock()
	return dropped
}

// atomicWrite 用仓库统一的原子写盘实现（临时文件 + fsync + 改名，见
// internal/atomicfile）：压实过程中断电时，磁盘上要么是旧文件、要么是新文件，
// 不会是半份 —— 半份记账会让下一次 Open 读出一堆残行。
func atomicWrite(path string, data []byte) error {
	return atomicfile.Write(path, data, 0o644)
}
