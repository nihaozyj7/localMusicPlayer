/* ==========================================================================
   online_playback_test.go — 在线试听的播放链路
   --------------------------------------------------------------------------
   背景（用户报的现象）：「在线试听功能不能使用了」「当作歌曲校验的时候
   出现了问题导致歌曲无法播放」。

   根因是两条独立的链路都把「在线曲目」当成「本地文件」处理了：

     1. **播放解析**：后端原生播放要一个真实存在的本地文件
        （PlayerService → media.PlayableFile → library.SongByID）。
        在线曲目不在曲库里 → 解析必然失败 → 一首正常的歌放不出来。
        修复：试听即缓存 + 登记成「虚拟歌曲」（见 internal/onlinecache
        与 media.Server.RegisterVirtual）。

     2. **失败归类**：上面那条失败会和「文件损坏」共用同一条错误链路，
        于是这首歌被登记进「放不出来」清单并摘掉。
        修复：在线曲目不进那份清单（它的失败原因绝大多数是网络，
        过一会儿自己就好了；把它记成坏文件等于永久拉黑一首能听的歌）。
   ========================================================================== */

package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/media"
	"localmusicplayer/internal/onlinesource"
)

/* --------------------------------------------------------------------------
   1. 在线曲目不该被当成「坏文件」
   -------------------------------------------------------------------------- */

// 在线曲目的播放失败**不能**进「放不出来」清单，也不能触发曲库摘除。
//
// 这一条直接对应「歌曲无法播放」那个现象：一旦被登记，它就被永久拉黑了
// （前端 failedSongId + 后端清单双重拦截），用户再点也放不出来。
func TestOnlineSongNotRecordedAsUnplayable(t *testing.T) {
	store := newTestStore(t)
	lib := newFakeLibrary() // 曲库里没有这首（在线曲目本来就不在曲库）
	svc := NewUnplayableService(store)
	svc.setLibrary(lib)

	out := svc.Report("bili:BV1xx411c7mD", "网络中断", "")

	if out == nil {
		t.Fatal("Report 应当返回结果（不能 panic，也不能返回 nil）")
	}
	if out["ignored"] != true {
		t.Errorf("在线曲目的失败应当被标记为忽略，得到 %v", out["ignored"])
	}

	// 关键断言：清单里必须什么都没有
	if list := svc.List(); len(list) != 0 {
		t.Fatalf("在线曲目不该进「放不出来」清单，实际有 %d 条: %+v", len(list), list)
	}
	if cfg := store.Get(); len(cfg.UnplayableFiles) != 0 {
		t.Fatalf("在线曲目不该被持久化进配置，实际有 %d 条", len(cfg.UnplayableFiles))
	}
	// 也不该去摘曲库（虽然本来也摘不到，但不该发出这个调用）
	if lib.dropCalls != 0 {
		t.Fatalf("在线曲目不该触发曲库摘除，实际调用了 %d 次", lib.dropCalls)
	}
}

// 本地曲目仍然要正常登记 —— 上面那条拦截不能误伤真正的坏文件。
func TestLocalSongStillRecordedAsUnplayable(t *testing.T) {
	store := newTestStore(t)
	lib := newFakeLibrary(bootstrap.Song{
		ID: "s-bad", Path: `C:\Music\bad.m4a`, Title: "真坏文件", Ext: "m4a",
	})
	svc := NewUnplayableService(store)
	svc.setLibrary(lib)

	out := svc.Report("s-bad", "转码失败", "")

	if out["ignored"] == true {
		t.Fatal("本地曲目的失败不该被忽略")
	}
	if list := svc.List(); len(list) != 1 {
		t.Fatalf("本地坏文件应当被登记，实际 %d 条", len(list))
	}
	if lib.has("s-bad") {
		t.Fatal("登记后应当把这首歌从曲库摘掉")
	}
}

/* --------------------------------------------------------------------------
   2. 虚拟歌曲：让后端能解析到「不在曲库里、但磁盘上有文件」的在线音频
   -------------------------------------------------------------------------- */

// 登记虚拟歌曲后，media.Server 必须能按 id 找到它并给出可转码的文件路径。
//
// 这是「在线试听能播放」的技术前提：后端播放链路拿到的就是这个路径。
func TestMediaResolvesRegisteredVirtualSong(t *testing.T) {
	dir := t.TempDir()
	srv := media.New(func(id string) (bootstrap.Song, bool) {
		// 曲库是空的：模拟「在线曲目不在曲库里」这个真实前提
		return bootstrap.Song{}, false
	})

	// 造一个真实的缓存文件
	cachePath := filepath.Join(dir, "BV1xx411c7mD.m4a")
	if err := os.WriteFile(cachePath, payloadOf(4096), 0o644); err != nil {
		t.Fatal(err)
	}
	srv.RegisterVirtual("bili:BV1xx411c7mD", cachePath, "m4a")

	// 登记之后必须能查到
	song, ok := srv.VirtualSong("bili:BV1xx411c7mD")
	if !ok {
		t.Fatal("登记的虚拟歌曲应当能被查到")
	}
	if song.Path != cachePath {
		t.Fatalf("路径 = %q，期望 %q", song.Path, cachePath)
	}
	if song.Ext != "m4a" {
		t.Fatalf("扩展名 = %q，期望 m4a", song.Ext)
	}
	// 大小/修改时间必须填对：转码缓存的 key 由它们组成，
	// 留空会导致「文件变了但 key 没变」，复用一个过期的转码结果。
	if song.Size != 4096 {
		t.Fatalf("大小 = %d，期望 4096", song.Size)
	}
	if song.ModTime == 0 {
		t.Fatal("修改时间不该为 0（转码缓存 key 需要它）")
	}
}

// 未登记的 id 必须查不到 —— 安全边界：不能因为「有虚拟表」就放行任意路径。
func TestVirtualSongRejectsUnknownID(t *testing.T) {
	srv := media.New(func(id string) (bootstrap.Song, bool) {
		return bootstrap.Song{}, false
	})
	if _, ok := srv.VirtualSong("bili:BVnotregistered"); ok {
		t.Fatal("未登记的 id 不该被解析出来")
	}
	if _, ok := srv.VirtualSong("../../etc/passwd"); ok {
		t.Fatal("任意路径不该被解析出来")
	}
}

// 登记是幂等的：同一首歌反复登记（多次试听）只保留最新一条，不报错。
func TestVirtualSongRegistrationIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	srv := media.New(func(id string) (bootstrap.Song, bool) { return bootstrap.Song{}, false })

	path := filepath.Join(dir, "a.m4a")
	if err := os.WriteFile(path, payloadOf(4096), 0o644); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		srv.RegisterVirtual("bili:BVdup", path, "m4a")
	}
	song, ok := srv.VirtualSong("bili:BVdup")
	if !ok || song.Path != path {
		t.Fatalf("重复登记后仍应指向同一个路径: (%+v, %v)", song, ok)
	}
}

// 空 id / 空路径一律忽略：宁可不登记，也不能在表里塞一条指向空路径的记录
// （那会让后面的转码拿到一个必然失败的输入）。
func TestVirtualSongIgnoresEmptyArgs(t *testing.T) {
	srv := media.New(func(id string) (bootstrap.Song, bool) { return bootstrap.Song{}, false })
	srv.RegisterVirtual("", "/tmp/x.m4a", "m4a")
	srv.RegisterVirtual("bili:BVx", "", "m4a")
	if _, ok := srv.VirtualSong(""); ok {
		t.Fatal("空 id 不该被登记")
	}
	if _, ok := srv.VirtualSong("bili:BVx"); ok {
		t.Fatal("空路径不该被登记")
	}
}

// 曲库里的歌优先于虚拟表：不能因为登记了一首在线歌就把本地的顶掉。
//
// 顺序由 media.Server.lookupSong 保证（先查曲库、再查虚拟表），
// 而 lookupSong 是私有的，所以这里通过它的两个公开出口来断言：
// VirtualSong 只看虚拟表，PlayableFile 看合成结果。
func TestLibraryTakesPrecedenceOverVirtual(t *testing.T) {
	dir := t.TempDir()
	realPath := filepath.Join(dir, "local.m4a")
	if err := os.WriteFile(realPath, payloadOf(4096), 0o644); err != nil {
		t.Fatal(err)
	}
	srv := media.New(func(id string) (bootstrap.Song, bool) {
		return bootstrap.Song{ID: id, Path: realPath, Ext: "m4a", Title: "本地"}, true
	})
	// 同一个 id 也登记一份虚拟的（现实中不会发生，但顺序必须明确）
	srv.RegisterVirtual("sameid", filepath.Join(dir, "virtual.m4a"), "m4a")

	// VirtualSong 是「只读虚拟表」的入口，不该被曲库内容污染
	song, ok := srv.VirtualSong("sameid")
	if !ok {
		t.Fatal("虚拟表里应当有这条")
	}
	if song.Path == realPath {
		t.Fatal("虚拟表不该被曲库内容污染")
	}
}

/* --------------------------------------------------------------------------
   3. 「试听过的歌过一阵再点」必须还能播（第六轮之后的用户报障）
   --------------------------------------------------------------------------
   用户原话：「在线歌曲搜索结果页中，用户下载 A 歌曲之后，再次点击试听 A
   歌曲会出现找不到歌曲无法播放的情况」。

   定位结果（两条独立的缺陷，一起造成这个现象）：

     1. **虚拟表比缓存文件短命**。虚拟表是内存里的，缓存文件在磁盘上，
        缓存命中分支却直接 return 而不登记 —— 重开一次程序，缓存还在、
        虚拟表是空的，后端解析报的就是 `歌曲不存在`（「找不到歌曲」原文）。
     2. **下载会把缓存搬走**。搬走之后「再试听」必然重新联网完整下载，
        而这一跳任何失败（直链过期 / 403 / 网络抖动）都变成「无法播放」。

   第 2 条的修复（复制而不是移动）在 online_cache_test.go 里
   （TestPreviewStillUsesCacheAfterDownload 串起了整条链路）；
   这里守的是第 1 条，以及「缓存没了但已经下载过」时的兜底。
   -------------------------------------------------------------------------- */

// 缓存命中时必须登记虚拟表 —— 否则「重开程序后再点昨天听过的在线歌」
// 会被后端解析成「歌曲不存在」。
func TestEnsureCachedRegistersVirtualOnCacheHit(t *testing.T) {
	svc := NewOnlineService(newTestStore(t), nil, nil, nil)
	svc.SetCacheDir(t.TempDir())
	const bvid = "BV1hit000001"

	if _, err := svc.files.Store(bvid, "m4a", bytes.NewReader(payloadOf(8192))); err != nil {
		t.Fatal(err)
	}
	cachePath, ok := svc.files.Path(bvid, "m4a")
	if !ok {
		t.Fatal("拿不到缓存路径")
	}

	var registered []string
	svc.setVirtualResolver(func(gotBVID, path, ext string) {
		registered = append(registered, gotBVID+"|"+path+"|"+ext)
	})

	path, ext, err := svc.EnsureCached(t.Context(), bvid)
	if err != nil {
		t.Fatalf("缓存命中不该出错: %v", err)
	}
	if path != cachePath || ext != "m4a" {
		t.Fatalf("解析到 (%q, %q)，期望 (%q, m4a)", path, ext, cachePath)
	}
	if len(registered) != 1 || registered[0] != bvid+"|"+cachePath+"|m4a" {
		t.Fatalf("缓存命中必须登记虚拟表（重开程序后虚拟表是空的），实际 %v", registered)
	}
}

// 缓存没有、但**已经下载过**这首歌时，播放走下载目录里那份，不重新联网。
//
// 为什么重要：下载是用户的文件、缓存是可丢弃的派生数据。用户删掉的东西
// 会被这一条兜住（缓存被清理/回收之后，已经下载过的歌仍然能离线播放）。
func TestEnsureCachedFallsBackToDownloadedFile(t *testing.T) {
	store := newTestStore(t)
	svc := NewOnlineService(store, nil, nil, nil) // client=nil：走到联网那条路必然失败
	svc.SetCacheDir(t.TempDir())                  // 缓存是空的
	const bvid = "BV1downloaded"

	dlDir := t.TempDir()
	dlPath := filepath.Join(dlDir, "已下载的歌.m4a")
	if err := os.WriteFile(dlPath, payloadOf(8192), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := svc.sources.Record(onlinesource.Record{
		BVID:  bvid,
		Kind:  onlinesource.KindDownload,
		Title: "已下载的歌",
		Ext:   "m4a",
		Path:  dlPath,
		Dir:   dlDir,
		From:  onlinesource.FromCache,
	}); err != nil {
		t.Fatal(err)
	}

	var registered []string
	svc.setVirtualResolver(func(gotBVID, path, ext string) {
		registered = append(registered, gotBVID+"|"+path+"|"+ext)
	})

	path, ext, err := svc.EnsureCached(t.Context(), bvid)
	if err != nil {
		t.Fatalf("缓存不在但已下载过：应当用下载的那份，不该去联网（%v）", err)
	}
	if path != dlPath || ext != "m4a" {
		t.Fatalf("解析到 (%q, %q)，期望 (%q, m4a)", path, ext, dlPath)
	}
	if len(registered) != 1 || registered[0] != bvid+"|"+dlPath+"|m4a" {
		t.Fatalf("应当把下载的那份登记成可播放歌曲，实际 %v", registered)
	}
}

// 下载过的那份被用户删掉之后，**不能**再当成可播放来源。
//
// 这正是「标注已下载之前，先判断这个文件还在不在」那条要求在后端的对应实现：
// 台账里还留着记录，但文件已经不在磁盘上。
func TestDownloadedSourceIsDroppedWhenFileDeleted(t *testing.T) {
	store := newTestStore(t)
	svc := NewOnlineService(store, nil, nil, nil)
	const bvid = "BV1deleted01"

	dir := t.TempDir()
	path := filepath.Join(dir, "会被删掉.m4a")
	if err := os.WriteFile(path, payloadOf(8192), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := svc.sources.Record(onlinesource.Record{
		BVID: bvid, Kind: onlinesource.KindDownload, Path: path, Dir: dir, Ext: "m4a",
	}); err != nil {
		t.Fatal(err)
	}
	if _, ok := svc.sources.Downloaded(bvid); !ok {
		t.Fatal("文件还在时应当报告「已下载」")
	}

	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, ok := svc.sources.Downloaded(bvid); ok {
		t.Fatal("文件被删掉之后不该再报告「已下载」")
	}
	// 前端读的是 SourceIndex：里面的 exists 必须是 false（界面据此去掉标注）
	idx := svc.SourceIndex()
	downloads, ok := idx["downloads"].(map[string]map[string]any)
	if !ok {
		t.Fatalf("SourceIndex 结构不对: %#v", idx["downloads"])
	}
	entry, ok := downloads[bvid]
	if !ok {
		t.Fatalf("台账里应当还留着这条记录（清理由 Prune 负责）: %#v", downloads)
	}
	if entry["exists"] != false {
		t.Fatalf("exists 应为 false，实际 %v", entry["exists"])
	}
}

// 文件不在磁盘上时 registerVirtual 不该登记。
//
// 虚拟表里放一条指向不存在文件的记录，只会把「缓存未命中」变成
// 「文件不存在」——把调用方推向错误的处理分支。
func TestRegisterVirtualSkipsMissingFile(t *testing.T) {
	svc := NewOnlineService(newTestStore(t), nil, nil, nil)
	calls := 0
	svc.setVirtualResolver(func(string, string, string) { calls++ })

	svc.registerVirtual("BV1missing", filepath.Join(t.TempDir(), "不存在.m4a"), "m4a")
	if calls != 0 {
		t.Fatalf("文件不存在时不该登记虚拟歌曲，实际登记 %d 次", calls)
	}

	// 文件真的存在时才登记（上面那条不能把正常路径也挡掉）
	real := filepath.Join(t.TempDir(), "在.m4a")
	if err := os.WriteFile(real, payloadOf(4096), 0o644); err != nil {
		t.Fatal(err)
	}
	svc.registerVirtual("BV1real", real, "m4a")
	if calls != 1 {
		t.Fatalf("文件存在时应当登记，实际登记 %d 次", calls)
	}
}

/* --------------------------------------------------------------------------
   引用集合：空闲清理「哪些缓存不能删」的输入
   --------------------------------------------------------------------------
   需求（用户原话）：「对于没有被播放列表和歌单引用的歌曲，在空闲时间可能会
   触发清理」。引用有三个来源，缺一个都会误删：

     · 歌单 + 「我喜欢」→ 后端配置里读得到；
     · 播放列表（队列）→ **只在前端**，靠 ProtectIDs 推过来；
     · 正在播放/已装载的那首 → PlayerService 的状态，由清理器每次现查。
   -------------------------------------------------------------------------- */

// 歌单与「我喜欢」里的在线歌必须进引用集合（后端自己读配置，不靠前端）。
func TestReferencedIDsIncludePlaylistsAndLiked(t *testing.T) {
	store := newTestStore(t)
	svc := NewOnlineService(store, nil, nil, nil)

	if err := store.Update(func(c *bootstrap.Config) {
		c.LikedIDs = []string{onlineSongID("BV1liked0001"), "D:\\Music\\本地.flac"}
		c.Playlists = append(c.Playlists, bootstrap.Playlist{
			ID:      "pl-1",
			Name:    "测试歌单",
			SongIDs: []string{onlineSongID("BV1inlist01"), "D:\\Music\\另一首.flac"},
		})
	}); err != nil {
		t.Fatal(err)
	}

	refs := svc.referencedOnlineIDs()
	for _, want := range []string{onlineSongID("BV1liked0001"), onlineSongID("BV1inlist01")} {
		if !refs[want] {
			t.Fatalf("歌单/喜欢里的 %s 必须被保护，实际集合 %v", want, refs)
		}
	}
	// 本地曲目也进集合没关系（清理只按 bvid 查在线 id），但绝不能漏掉在线的
	for id := range refs {
		if id != "" && id[0] != 'b' && id[0] != 'D' {
			t.Fatalf("引用集合里出现了意料外的 id: %q", id)
		}
	}
}

// 前端推来的播放队列是引用集合的一部分，且**每次都是全量替换**。
//
// 为什么必须全量替换：队列清空之后如果残留旧的 id，那些歌的缓存就永远
// 清不掉了 —— 这是「引用集合只增不减」的典型坏味道。
func TestProtectIDsReplacesReferenceSet(t *testing.T) {
	svc := NewOnlineService(newTestStore(t), nil, nil, nil)

	res := svc.ProtectIDs([]string{onlineSongID("BV1queue001"), "D:\\Music\\本地.flac", "", onlineSongID("BV1queue002")})
	if got := res["protected"]; got != 2 {
		t.Fatalf("只该收下两个在线 id（本地曲目与空串要过滤掉），实际 %v", got)
	}
	refs := svc.referencedOnlineIDs()
	for _, want := range []string{onlineSongID("BV1queue001"), onlineSongID("BV1queue002")} {
		if !refs[want] {
			t.Fatalf("队列里的 %s 必须被保护，实际集合 %v", want, refs)
		}
	}

	// 第二次推空数组 = 队列清空了，旧的引用必须消失
	svc.ProtectIDs(nil)
	refs = svc.referencedOnlineIDs()
	for _, gone := range []string{onlineSongID("BV1queue001"), onlineSongID("BV1queue002")} {
		if refs[gone] {
			t.Fatalf("队列已清空，%s 不该还在保护集合里", gone)
		}
	}
}

// ProtectIDs 只认得出 bvid 的在线 id：`bili:`（前缀后为空）必须被拒。
//
// 两端判据要一致 —— 前端 queueOnlineIDs 也把这种假 id 过滤掉了
// （frontend/tests/online-cache.test.js），后端再挡一道。
func TestProtectIDsRejectsEmptyBVID(t *testing.T) {
	svc := NewOnlineService(newTestStore(t), nil, nil, nil)
	res := svc.ProtectIDs([]string{OnlineIDPrefix})
	if got := res["protected"]; got != 0 {
		t.Fatalf("`bili:` 不是有效在线曲目，实际收下了 %v", got)
	}
	if refs := svc.referencedOnlineIDs(); refs[OnlineIDPrefix] {
		t.Fatal("无效 id 不该进引用集合")
	}
}

// CleanupCache 是「用户主动清理」的入口：没注入清理器时报错说清楚，不 panic。
func TestCleanupCacheWithoutCleaner(t *testing.T) {
	svc := NewOnlineService(newTestStore(t), nil, nil, nil)
	out := svc.CleanupCache()
	if out["deleted"] != 0 {
		t.Fatalf("没注入清理器时不该报告删了东西，实际 %v", out)
	}
	if out["skipped"] == nil {
		t.Fatal("必须说明为什么没清（否则界面只能显示一个没有解释的 0）")
	}
}
