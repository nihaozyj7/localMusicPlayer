package main

import (
	"context"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
	"time"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/library"
)

// writeTestWAV 生成一个最小的可解析 WAV（时长 durationSec 秒）
func writeTestWAV(t *testing.T, path string, durationSec int) {
	t.Helper()
	const sampleRate = 8000
	dataSize := sampleRate * durationSec
	buf := make([]byte, 0, 44+dataSize)
	tmp := make([]byte, 4)

	buf = append(buf, []byte("RIFF")...)
	binary.LittleEndian.PutUint32(tmp, uint32(36+dataSize))
	buf = append(buf, tmp...)
	buf = append(buf, []byte("WAVEfmt ")...)
	binary.LittleEndian.PutUint32(tmp, 16)
	buf = append(buf, tmp...)
	binary.LittleEndian.PutUint16(tmp[:2], 1)
	buf = append(buf, tmp[:2]...)
	binary.LittleEndian.PutUint16(tmp[:2], 1)
	buf = append(buf, tmp[:2]...)
	binary.LittleEndian.PutUint32(tmp, sampleRate)
	buf = append(buf, tmp...)
	binary.LittleEndian.PutUint32(tmp, sampleRate)
	buf = append(buf, tmp...)
	binary.LittleEndian.PutUint16(tmp[:2], 1)
	buf = append(buf, tmp[:2]...)
	binary.LittleEndian.PutUint16(tmp[:2], 8)
	buf = append(buf, tmp[:2]...)
	buf = append(buf, []byte("data")...)
	binary.LittleEndian.PutUint32(tmp, uint32(dataSize))
	buf = append(buf, tmp...)
	buf = append(buf, make([]byte, dataSize)...)

	if err := os.WriteFile(path, buf, 0o644); err != nil {
		t.Fatalf("写入测试 WAV 失败: %v", err)
	}
}

func newTestService(t *testing.T) (*LibraryService, *bootstrap.Store, string) {
	t.Helper()
	dataDir := t.TempDir()
	t.Setenv("MUSICPLAYER_DATA_DIR", dataDir)

	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	// 清空默认过滤规则，避免小体积测试文件被「排除 <10KB」过滤
	if err := store.Update(func(c *bootstrap.Config) { c.FilterRules = []bootstrap.FilterRule{} }); err != nil {
		t.Fatal(err)
	}
	lib := library.NewManager(store)
	svc := NewLibraryService(lib, nil, store)
	// svc.app 保持 nil：事件发送会被安全忽略，正好用来验证「不依赖事件也能落盘」

	// 后台扫描每次结束都会通知。测试收尾时把积压的通知排空，
	// 保证临时目录不会因为仍有 goroutine 在写配置/缓存而清理失败。
	done := make(chan struct{}, 512)
	svc.OnScanFinished = func() {
		select {
		case done <- struct{}{}:
		default:
		}
	}
	t.Cleanup(func() {
		for {
			select {
			case <-done:
			case <-time.After(300 * time.Millisecond):
				return // 静默期满，说明后台扫描已全部结束
			}
		}
	})

	return svc, store, dataDir
}

// TestServiceAddFolderEndToEnd 端到端：添加文件夹 → 配置落盘 → 扫描出歌曲。
// 这条链路就是用户在设置界面点「添加文件夹」后发生的事。
func TestServiceAddFolderEndToEnd(t *testing.T) {
	svc, _, dataDir := newTestService(t)

	music := t.TempDir()
	writeTestWAV(t, filepath.Join(music, "one.wav"), 3)
	writeTestWAV(t, filepath.Join(music, "two.wav"), 4)

	res, err := svc.AddFolder(music)
	if err != nil {
		t.Fatalf("AddFolder 失败: %v", err)
	}
	if res["cancelled"] == true {
		t.Fatal("不应被当作取消")
	}
	folder, ok := res["folder"].(bootstrap.Folder)
	if !ok {
		t.Fatalf("返回值里没有 folder: %#v", res)
	}
	if folder.Path != music {
		t.Errorf("文件夹路径不对: %s != %s", folder.Path, music)
	}

	// 1) 配置必须已经落盘
	onDisk, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	saved := onDisk.Get().Folders
	if len(saved) != 1 {
		t.Fatalf("config.json 里应有 1 个文件夹，实际 %d", len(saved))
	}
	if saved[0].Path != music {
		t.Errorf("落盘的路径不对: %s", saved[0].Path)
	}
	_ = dataDir

	// 2) 曲库必须已经看到这个文件夹（服务内部会 ReloadFolders）。
	//    这里按「用户配置的文件夹」计数：Folders() 里还会包含下载目录
	//    这个程序管理的隐式扫描根（见 bootstrap.EffectiveFolders）。
	userFolders := 0
	for _, f := range svc.Folders() {
		if f.ID != bootstrap.DownloadFolderID {
			userFolders++
		}
	}
	if userFolders != 1 {
		t.Fatalf("曲库应有 1 个用户文件夹，实际 %d", userFolders)
	}

	// 3) 扫描能扫到歌（AddFolder 已触发异步扫描，这里同步跑一次以确保断言稳定）
	if _, err := svc.lib.Scan(context.Background(), false); err != nil {
		t.Fatalf("扫描失败: %v", err)
	}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if len(svc.Songs()) == 2 {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	songs := svc.Songs()
	if len(songs) != 2 {
		t.Fatalf("应扫到 2 首，实际 %d", len(songs))
	}
	for _, s := range songs {
		if s.Duration <= 0 {
			t.Errorf("时长解析失败: %s -> %dms", s.Title, s.Duration)
		}
	}

	// 4) 同一个文件夹重复添加应被识别为重复，而不是加出第二个
	dup, err := svc.AddFolder(music)
	if err != nil {
		t.Fatalf("重复添加报错: %v", err)
	}
	if dup["duplicated"] != true {
		t.Errorf("重复添加应返回 duplicated=true，实际 %#v", dup)
	}
	after := 0
	for _, f := range svc.Folders() {
		if f.ID != bootstrap.DownloadFolderID {
			after++
		}
	}
	if after != 1 {
		t.Errorf("重复添加后仍应只有 1 个用户文件夹，实际 %d", after)
	}
}

// TestServiceAddFolderRejectsInvalid 不存在的路径必须报错（界面才能提示用户）
func TestServiceAddFolderRejectsInvalid(t *testing.T) {
	svc, _, _ := newTestService(t)
	bogus := filepath.Join(t.TempDir(), "not-exist")

	if _, err := svc.AddFolder(bogus); err == nil {
		t.Fatal("不存在的路径应报错")
	}

	// 指向文件而不是目录也要报错
	file := filepath.Join(t.TempDir(), "a.wav")
	writeTestWAV(t, file, 1)
	if _, err := svc.AddFolder(file); err == nil {
		t.Fatal("选择文件而不是文件夹时应报错")
	}
}

// TestServiceAddFolderTrimsAndExpands 路径首尾空格应被清理
func TestServiceAddFolderTrimsAndExpands(t *testing.T) {
	svc, _, _ := newTestService(t)
	music := t.TempDir()
	writeTestWAV(t, filepath.Join(music, "x.wav"), 1)

	res, err := svc.AddFolder("  " + music + "  ")
	if err != nil {
		t.Fatalf("带空格的路径应能正常添加: %v", err)
	}
	if f, ok := res["folder"].(bootstrap.Folder); !ok || f.Path != music {
		t.Errorf("路径未正确清理: %#v", res["folder"])
	}

	// 等后台扫描结束（t.Cleanup 里还会再排空一次）
	waitIdle(t, svc, 15*time.Second)
}

// waitIdle 等待曲库扫描全部结束（测试收尾用，避免与临时目录清理打架）
func waitIdle(t *testing.T, svc *LibraryService, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !svc.lib.IsScanning() {
			time.Sleep(20 * time.Millisecond)
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("等待扫描结束超时")
}

// TestServiceScanAlwaysReportsStarted 扫描语义：只要调用 Scan 就一定会有
// 一次扫描并最终发出 scan:done（曲库内部排队），不会出现
// 「started=false 导致前端永远等不到事件」的情况。
func TestServiceScanAlwaysReportsStarted(t *testing.T) {
	svc, _, _ := newTestService(t)
	music := t.TempDir()
	writeTestWAV(t, filepath.Join(music, "a.wav"), 1)
	if _, err := svc.AddFolder(music); err != nil {
		t.Fatal(err)
	}

	// 连续快速调用多次（模拟用户连点「重新扫描」）
	for i := 0; i < 3; i++ {
		res := svc.Scan(nil)
		if res["started"] != true {
			t.Fatalf("第 %d 次 Scan 应返回 started=true，实际 %#v", i, res)
		}
	}

	// 最终必须全部跑完，曲库有数据
	waitIdle(t, svc, 15*time.Second)
	if len(svc.Songs()) != 1 {
		t.Fatalf("扫描后应有 1 首，实际 %d（scanning=%v）", len(svc.Songs()), svc.lib.IsScanning())
	}
}
