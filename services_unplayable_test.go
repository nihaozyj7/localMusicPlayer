/* ==========================================================================
   services_unplayable_test.go — 「放不出来」清单的行为
   --------------------------------------------------------------------------
   这个模块的每条记录都来自一次真实的播放失败（用户真的点过那首歌、
   等过一次失败）。所以它必须做到三件事，缺一件就会变成新的困扰：

     1. **只记一次**：同一首歌反复上报要合并成一条（次数累加），
        否则清单会长成一堆重复行；
     2. **登记即移除**：登记后要把歌从曲库摘掉，否则用户每次点到
        又失败一次（那正是错误提示刷屏的来源）；
     3. **能反悔**：用户修好文件后要能清掉记录并让歌回到曲库。

   本文件覆盖这三点，外加「路径/标题补齐」与「持久化」。
   ========================================================================== */

package main

import (
	"sync"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

/* --------------------------------------------------------------------------
   测试替身：一个最小的曲库
   -------------------------------------------------------------------------- */

type fakeLibrary struct {
	mu    sync.Mutex
	songs map[string]bootstrap.Song
	// dropCalls 记录 DropSong 被调了几次（用于断言「登记时确实移除了」）
	dropCalls int
}

func newFakeLibrary(songs ...bootstrap.Song) *fakeLibrary {
	m := map[string]bootstrap.Song{}
	for _, s := range songs {
		m[s.ID] = s
	}
	return &fakeLibrary{songs: m}
}

func (f *fakeLibrary) DropSong(id string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.dropCalls++
	if _, ok := f.songs[id]; !ok {
		return false
	}
	delete(f.songs, id)
	return true
}

func (f *fakeLibrary) LookupSong(id string) (string, string, string, string, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, ok := f.songs[id]
	if !ok {
		return "", "", "", "", false
	}
	return s.Path, s.Title, s.Artist, s.Ext, true
}

func (f *fakeLibrary) has(id string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.songs[id]
	return ok
}

/* --------------------------------------------------------------------------
   测试替身：一个临时配置 store
   -------------------------------------------------------------------------- */

// 复用 early_theme_test.go 里已有的 newTestStore（临时目录 + LMPLAYER_DATA_DIR），
// 它已经保证了「每个用例一份干净配置、不碰真实用户配置」。
// 用真实的 bootstrap.Store 而不是手搓替身：清单的持久化路径
//（Update → 落盘）正是要测的东西之一，替身会把这条路径绕过去。

/* --------------------------------------------------------------------------
   1. 登记
   -------------------------------------------------------------------------- */

func TestUnplayableReportNew(t *testing.T) {
	store := newTestStore(t)
	lib := newFakeLibrary(bootstrap.Song{
		ID: "s1", Path: `C:\Music\bad.m4a`, Title: "坏文件", Artist: "某人", Ext: "m4a",
	})
	svc := NewUnplayableService(store)
	svc.setLibrary(lib)

	out := svc.Report("s1", "转码失败: exit status 69", "")

	if out == nil {
		t.Fatal("Report 应当返回登记后的条目")
	}
	if out["title"] != "坏文件" {
		t.Errorf("标题应从曲库补齐，得到 %v", out["title"])
	}
	if out["reason"] != "转码失败: exit status 69" {
		t.Errorf("原因不对: %v", out["reason"])
	}
	if out["isNew"] != true {
		t.Errorf("首次登记 isNew 应为 true")
	}
	// 路径没传，应当从曲库补上
	if out["path"] != `C:\Music\bad.m4a` {
		t.Errorf("路径应从曲库补齐，得到 %v", out["path"])
	}
}

// ★ 核心不变量：登记后必须把歌从曲库摘掉。
// 不摘的话用户每次点到那首歌都再失败一次 —— 那正是要消除的体验。
func TestUnplayableReportRemovesFromLibrary(t *testing.T) {
	store := newTestStore(t)
	lib := newFakeLibrary(bootstrap.Song{ID: "s1", Path: "/m/bad.m4a", Title: "坏文件", Ext: "m4a"})
	svc := NewUnplayableService(store)
	svc.setLibrary(lib)

	if !lib.has("s1") {
		t.Fatal("前置条件：歌应该在曲库里")
	}
	out := svc.Report("s1", "解码失败", "")
	if out["removedFromLibrary"] != true {
		t.Errorf("登记后应报告已从曲库移除，得到 %v", out["removedFromLibrary"])
	}
	if lib.has("s1") {
		t.Error("登记后这首歌不该还在曲库里（否则用户点到还会再失败一次）")
	}
}

// 同一首歌反复上报 → 合并成一条，次数累加。
func TestUnplayableReportDedup(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store)

	for i := 0; i < 5; i++ {
		svc.Report("s1", "解码失败", `C:\Music\bad.m4a`)
	}

	list := svc.List()
	if len(list) != 1 {
		t.Fatalf("同一首歌上报 5 次应只有 1 条记录，实际 %d 条", len(list))
	}
	if list[0]["attempts"] != 5 {
		t.Errorf("attempts 应累加到 5，实际 %v", list[0]["attempts"])
	}
	if svc.Count() != 1 {
		t.Errorf("Count = %d，期望 1", svc.Count())
	}
}

// 原因要跟着最后一次走：文件可能被换成另一种坏法。
func TestUnplayableReportUpdatesReason(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store)

	svc.Report("s1", "第一次的原因", "/m/a.m4a")
	svc.Report("s1", "第二次的原因", "/m/a.m4a")

	list := svc.List()
	if len(list) != 1 {
		t.Fatalf("期望 1 条记录，实际 %d", len(list))
	}
	if list[0]["reason"] != "第二次的原因" {
		t.Errorf("原因应更新为最后一次，实际 %v", list[0]["reason"])
	}
}

// 空 songId 不该产生记录（前端偶尔会拿不到 id）。
func TestUnplayableReportIgnoresEmptyID(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store)

	if out := svc.Report("", "原因", "/m/a.m4a"); out != nil {
		t.Errorf("空 id 应返回 nil，实际 %v", out)
	}
	if svc.Count() != 0 {
		t.Errorf("空 id 不该产生记录，Count = %d", svc.Count())
	}
}

// 原因缺失时要给一个兜底文案，不能是空字符串（界面上会显示成空白）。
func TestUnplayableReportFillsEmptyReason(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store)

	svc.Report("s1", "   ", "/m/a.m4a")
	list := svc.List()
	if len(list) != 1 {
		t.Fatalf("期望 1 条记录，实际 %d", len(list))
	}
	if list[0]["reason"] == "" {
		t.Error("原因为空时应填入兜底文案")
	}
}

// 拿不到曲库信息时，至少要用路径推断出文件名与扩展名 ——
// 用户得能认出是哪个文件。
func TestUnplayableReportFallsBackToPath(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store) // 不注入曲库

	out := svc.Report("s1", "解码失败", `C:\Music\Album\某首歌.m4a`)

	if out["title"] != "某首歌.m4a" {
		t.Errorf("标题应退回文件名，实际 %v", out["title"])
	}
	if out["ext"] != "m4a" {
		t.Errorf("扩展名应从路径推断，实际 %v", out["ext"])
	}
}

/* --------------------------------------------------------------------------
   2. 持久化：重启后清单还在
   -------------------------------------------------------------------------- */

func TestUnplayablePersistsAcrossReload(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store)
	svc.Report("s1", "解码失败", "/m/a.m4a")

	// 直接读回落的配置文件，确认真的写盘了
	cfg := store.Get()
	if len(cfg.UnplayableFiles) != 1 {
		t.Fatalf("配置里应有 1 条记录，实际 %d", len(cfg.UnplayableFiles))
	}
	if cfg.UnplayableFiles[0].SongID != "s1" {
		t.Errorf("落盘的 SongID = %q，期望 s1", cfg.UnplayableFiles[0].SongID)
	}
}

/* --------------------------------------------------------------------------
   3. 移除 / 清空
   -------------------------------------------------------------------------- */

func TestUnplayableRemove(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store)
	svc.Report("s1", "解码失败", "/m/a.m4a")
	svc.Report("s2", "解码失败", "/m/b.m4a")

	if !svc.Remove("s1") {
		t.Error("Remove 存在的条目应返回 true")
	}
	if svc.Count() != 1 {
		t.Errorf("移除后应剩 1 条，实际 %d", svc.Count())
	}
	// 移除不存在的条目返回 false（幂等，不算错误）
	if svc.Remove("s1") {
		t.Error("重复移除应返回 false")
	}
	if svc.Remove("") {
		t.Error("空 id 应返回 false")
	}
}

func TestUnplayableClear(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store)
	svc.Report("s1", "解码失败", "/m/a.m4a")
	svc.Report("s2", "解码失败", "/m/b.m4a")

	if n := svc.Clear(); n != 2 {
		t.Errorf("Clear 应返回清掉的条数 2，实际 %d", n)
	}
	if svc.Count() != 0 {
		t.Errorf("清空后 Count = %d，期望 0", svc.Count())
	}
	// 空清单上再清一次不该出错
	if n := svc.Clear(); n != 0 {
		t.Errorf("空清单 Clear 应返回 0，实际 %d", n)
	}
}

/* --------------------------------------------------------------------------
   4. 排序：最近失败的在前
   -------------------------------------------------------------------------- */

func TestUnplayableListNewestFirst(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store)

	svc.Report("s1", "原因", "/m/a.m4a")
	svc.Report("s2", "原因", "/m/b.m4a")
	svc.Report("s3", "原因", "/m/c.m4a")

	list := svc.List()
	if len(list) != 3 {
		t.Fatalf("期望 3 条，实际 %d", len(list))
	}
	// 新条目插在最前面：清单按「最近失败」排序更符合排查习惯
	if list[0]["songId"] != "s3" {
		t.Errorf("最新的应排在最前，实际首条是 %v", list[0]["songId"])
	}
}

/* --------------------------------------------------------------------------
   5. 事件
   -------------------------------------------------------------------------- */

type evtRecorder struct {
	mu     sync.Mutex
	events []string
	last   map[string]any
}

func (e *evtRecorder) emit(name string, payload any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.events = append(e.events, name)
	m, _ := payload.(map[string]any)
	e.last = m
}

func (e *evtRecorder) count(name string) int {
	e.mu.Lock()
	defer e.mu.Unlock()
	n := 0
	for _, x := range e.events {
		if x == name {
			n++
		}
	}
	return n
}

// 每次登记都要广播一条事件（前端据此刷新清单并提示用户）。
func TestUnplayableEmitsEvent(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store)
	rec := &evtRecorder{}
	svc.setEmitter(rec.emit)

	svc.Report("s1", "解码失败", "/m/a.m4a")
	svc.Report("s2", "解码失败", "/m/b.m4a")

	if n := rec.count(unplayableEvent); n != 2 {
		t.Errorf("两次登记应广播 2 条事件，实际 %d", n)
	}
	if rec.last["songId"] != "s2" {
		t.Errorf("最后一条事件的 songId = %v，期望 s2", rec.last["songId"])
	}
}

// 没注入 emitter 时不能 panic（服务要能独立构造）。
func TestUnplayableNilEmitterSafe(t *testing.T) {
	store := newTestStore(t)
	svc := NewUnplayableService(store)
	// 不调 setEmitter
	if out := svc.Report("s1", "解码失败", "/m/a.m4a"); out == nil {
		t.Error("没有 emitter 时 Report 仍应正常返回")
	}
}

/* --------------------------------------------------------------------------
   6. 工具函数
   -------------------------------------------------------------------------- */

func TestExtOfAndFileNameOf(t *testing.T) {
	cases := []struct {
		path string
		ext  string
		name string
	}{
		{`C:\Music\a.m4a`, "m4a", "a.m4a"},
		{"/m/Album/b.MP3", "mp3", "b.MP3"},
		{`C:\Music\no-ext`, "", "no-ext"},
		{`C:\Music\trailing.`, "", "trailing."},
		{"", "", ""},
	}
	for _, c := range cases {
		if got := extOf(c.path); got != c.ext {
			t.Errorf("extOf(%q) = %q，期望 %q", c.path, got, c.ext)
		}
		if got := fileNameOf(c.path); got != c.name {
			t.Errorf("fileNameOf(%q) = %q，期望 %q", c.path, got, c.name)
		}
	}
}
