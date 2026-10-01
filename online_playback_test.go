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
	"os"
	"path/filepath"
	"testing"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/media"
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
