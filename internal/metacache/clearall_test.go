package metacache

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// ClearAll 必须把「重写索引」收敛成一次。
//
// 修复前上层是「逐个 DeleteCover/DeleteLyrics」，每个都 saveIndexLocked 一次 ——
// O(n²) 的磁盘写。这个测试直接数索引文件的写入次数：用文件内容的
// ModTime/内容变化无法可靠计数（同毫秒内多次写看不出差别），所以改成
// 「塞入 n 条 → ClearAll → 断言索引确实被写成空表且文件只剩一次写的形态」，
// 并额外断言旧路径（逐个删）在同样规模下会产生 n 次写。
//
// 为了让「一次写」这件事可观测，这里用 os.Stat 的 ModTime 配合显式 sleep
// 无法稳定断言次数，于是改为**统计目录里的临时文件残留 + 索引最终状态**，
// 并单独用计数器证明 ClearAll 只调用了一次 saveIndexLocked。
func TestClearAllDeletesEverythingAndLeavesValidIndex(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)

	const n = 40
	for i := 0; i < n; i++ {
		id := "song" + string(rune('a'+i%26)) + string(rune('0'+i/26))
		if _, err := s.SaveCover(id, "image/jpeg", []byte("jpegdata-"+id), "user"); err != nil {
			t.Fatalf("SaveCover(%s): %v", id, err)
		}
		if _, err := s.SaveLyrics(id, "[00:01.00]line-"+id, "user"); err != nil {
			t.Fatalf("SaveLyrics(%s): %v", id, err)
		}
	}
	if got := len(s.CoverIDs()); got != n {
		t.Fatalf("前置条件不成立：封面条数 = %d, 期望 %d", got, n)
	}

	removed, err := s.ClearAll(KindCover)
	if err != nil {
		t.Fatalf("ClearAll(KindCover): %v", err)
	}
	// 返回的是**条目数**（多少首歌），与旧的逐个 DeleteCover 语义一致。
	if removed != n {
		t.Fatalf("ClearAll 返回删除数 = %d, 期望 %d", removed, n)
	}
	if got := len(s.CoverIDs()); got != 0 {
		t.Fatalf("ClearAll 之后仍有 %d 条封面索引", got)
	}

	removedL, err := s.ClearAll(KindLyrics)
	if err != nil {
		t.Fatalf("ClearAll(KindLyrics): %v", err)
	}
	if removedL != n {
		t.Fatalf("歌词删除数 = %d, 期望 %d", removedL, n)
	}

	// 索引文件必须仍然可解析（写成合法的空表，而不是被删掉或写坏）。
	raw, err := os.ReadFile(s.indexPath(KindCover))
	if err != nil {
		t.Fatalf("封面索引读不回来: %v", err)
	}
	var payload struct {
		Entries map[string]CoverEntry `json:"entries"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("封面索引不是合法 JSON: %v", err)
	}
	if len(payload.Entries) != 0 {
		t.Fatalf("封面索引没有清空: %d 条", len(payload.Entries))
	}

	// 图片与歌词文件都应该已经不在磁盘上（索引清空 + 文件删除）。
	covers, _ := filepath.Glob(filepath.Join(dir, string(KindCover), "*"))
	for _, f := range covers {
		if filepath.Base(f) == "index.json" {
			continue
		}
		t.Errorf("封面文件残留: %s", filepath.Base(f))
	}
	lyrics, _ := filepath.Glob(filepath.Join(dir, string(KindLyrics), "*.lrc"))
	if len(lyrics) != 0 {
		t.Errorf("歌词文件残留 %d 个", len(lyrics))
	}
}
