/* ==========================================================================
   onlinesource_test.go — 来源记账（jsonl）的性质
   --------------------------------------------------------------------------
   守的是四件事，每一件都对着一个真实会发生的场景：

     1. **后者胜**：同一首歌重新缓存到新路径 / 重新下载到别的目录之后，
        最新那条才是事实（否则界面会一直指向一个旧路径）。
     2. **存在性是读的时候判定的**：下载目录里那份被用户删掉之后，
        Downloaded 必须变成 false —— 搜索结果里的「已下载」正是靠它。
     3. **残行不能毁掉整份记账**：追加写被中断（进程被杀）时最后一行可能是
        半截 JSON，读取要跳过它、保留前面的记录。
     4. **压实**：反复试听/下载同一首歌会让文件线性增长，压实后每个键只剩一行，
        且顺序与内容都还是可解析的 jsonl。
   ========================================================================== */

package onlinesource

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// newTestLedger 造一个指向临时目录的记账。
func newTestLedger(t *testing.T) *Ledger {
	t.Helper()
	l, err := Open(filepath.Join(t.TempDir(), "online-sources.jsonl"))
	if err != nil {
		t.Fatalf("Open 失败: %v", err)
	}
	return l
}

// writeFile 造一个「已存在的文件」，返回路径。
func writeFile(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("造文件失败: %v", err)
	}
	return path
}

// readLines 返回文件里的非空行。
func readLines(t *testing.T, path string) []string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读记账失败: %v", err)
	}
	var out []string
	for _, line := range strings.Split(string(raw), "\n") {
		if strings.TrimSpace(line) != "" {
			out = append(out, line)
		}
	}
	return out
}

func TestRecordAndReloadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "online-sources.jsonl")
	cacheFile := writeFile(t, dir, "BV1cache.m4a", "audio")

	l, err := Open(path)
	if err != nil {
		t.Fatalf("Open 失败: %v", err)
	}
	if err := l.Record(Record{
		BVID:   "BV1cache",
		Kind:   KindCache,
		Title:  "试听过的歌",
		Artist: "某歌手",
		Ext:    "m4a",
		Path:   cacheFile,
		Origin: "https://example.invalid/audio/BV1cache.m4a",
	}); err != nil {
		t.Fatalf("Record 失败: %v", err)
	}

	// 重新打开：记录必须从文件里读回来（记账是跨进程的）
	l2, err := Open(path)
	if err != nil {
		t.Fatalf("二次 Open 失败: %v", err)
	}
	rec, ok := l2.Lookup("BV1cache", KindCache)
	if !ok {
		t.Fatal("重新打开后记录丢了")
	}
	if rec.Title != "试听过的歌" || rec.Artist != "某歌手" || rec.Ext != "m4a" {
		t.Errorf("曲目信息没能往返: %+v", rec)
	}
	if rec.Path != cacheFile || rec.Origin == "" {
		t.Errorf("路径/来源没能往返: %+v", rec)
	}
	if rec.At <= 0 {
		t.Errorf("At 应当被补成当前时间，得到 %d", rec.At)
	}
	if l2.BadLines() != 0 {
		t.Errorf("正常文件不该有坏行，得到 %d", l2.BadLines())
	}
}

func TestLaterRecordWinsForSameKey(t *testing.T) {
	dir := t.TempDir()
	l := newTestLedger(t)
	oldPath := writeFile(t, dir, "old.m4a", "old")
	newPath := writeFile(t, dir, "new.m4a", "new")

	if err := l.Record(Record{BVID: "BV1x", Kind: KindDownload, Path: oldPath, Dir: "D:\\下载"}); err != nil {
		t.Fatal(err)
	}
	if err := l.Record(Record{BVID: "BV1x", Kind: KindDownload, Path: newPath, Dir: "E:\\音乐"}); err != nil {
		t.Fatal(err)
	}

	// 内存里是最新的
	if got, _ := l.Lookup("BV1x", KindDownload); got.Path != newPath || got.Dir != "E:\\音乐" {
		t.Fatalf("内存索引不是后者胜: %+v", got)
	}
	// 重新读盘也是最新的（而不是第一条）
	l2, err := Open(l.Path())
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := l2.Lookup("BV1x", KindDownload); got.Path != newPath {
		t.Fatalf("重新读盘后不是后者胜: %+v", got)
	}
	if got := l2.Downloads(); len(got) != 1 {
		t.Fatalf("同一个键应当只有一条记录（快照去重），得到 %d 条", len(got))
	}
}

func TestDownloadedIsFalseAfterUserDeletesFile(t *testing.T) {
	dir := t.TempDir()
	l := newTestLedger(t)
	file := writeFile(t, dir, "song.m4a", "audio")

	if err := l.Record(Record{BVID: "BV1del", Kind: KindDownload, Title: "下载的歌", Path: file, Dir: dir, From: FromNetwork}); err != nil {
		t.Fatal(err)
	}

	st, ok := l.Downloaded("BV1del")
	if !ok || !st.Exists {
		t.Fatalf("刚下载完应当报「已下载且文件存在」，得到 ok=%v exists=%v", ok, st.Exists)
	}
	if st.Size != int64(len("audio")) {
		t.Errorf("大小应当 stat 出来，得到 %d", st.Size)
	}

	// 用户把下载目录里那份删了
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	st, ok = l.Downloaded("BV1del")
	if ok {
		t.Fatal("文件被删掉之后不该再报「已下载」")
	}
	if st.Exists {
		t.Error("Status.Exists 应当为 false（界面据此去掉标注）")
	}
	// 记录本身还在（Prune 才是清理它的人），所以能查到 Exists=false 的状态
	if rec, found := l.Lookup("BV1del", KindDownload); !found || rec.Path != file {
		t.Fatalf("记录不该被读取动作删掉: found=%v %+v", found, rec)
	}

	// 空闲清理会顺手丢掉这条「文件已不在」的记录
	if dropped := l.Prune(); dropped != 1 {
		t.Fatalf("Prune 应当清掉 1 条失效记录，得到 %d", dropped)
	}
	if _, found := l.Lookup("BV1del", KindDownload); found {
		t.Fatal("Prune 之后记录应当消失")
	}
	l3, err := Open(l.Path())
	if err != nil {
		t.Fatal(err)
	}
	if _, found := l3.Lookup("BV1del", KindDownload); found {
		t.Fatal("Prune 必须落盘：重新打开也不该看到它")
	}
}

func TestTruncatedLastLineDoesNotBreakEarlierRecords(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "online-sources.jsonl")
	good := writeFile(t, dir, "good.m4a", "audio")

	l, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := l.Record(Record{BVID: "BVgood", Kind: KindCache, Path: good}); err != nil {
		t.Fatal(err)
	}

	// 模拟「追加到一半进程被杀」：文件尾部多了一段半截 JSON
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString(`{"bvid":"BVtru`); err != nil {
		t.Fatal(err)
	}
	f.Close()

	l2, err := Open(path)
	if err != nil {
		t.Fatalf("残行不该让 Open 失败: %v", err)
	}
	if l2.BadLines() != 1 {
		t.Errorf("应当跳过 1 行坏行，得到 %d", l2.BadLines())
	}
	if _, ok := l2.Lookup("BVgood", KindCache); !ok {
		t.Fatal("坏行之后的读取把前面的有效记录弄丢了")
	}

	// 跳过坏行之后还能继续追加
	if err := l2.Record(Record{BVID: "BVnext", Kind: KindCache, Path: good}); err != nil {
		t.Fatalf("坏行之后追加失败: %v", err)
	}
	l3, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := l3.Lookup("BVnext", KindCache); !ok {
		t.Fatal("追加的记录读不回来")
	}
}

func TestCompactKeepsNewestPerKeyAndStaysParsable(t *testing.T) {
	dir := t.TempDir()
	l := newTestLedger(t)
	file := writeFile(t, dir, "song.m4a", "audio")

	// 反复试听同一首（最常见的重复来源）
	for i := 0; i < 120; i++ {
		if err := l.Record(Record{BVID: "BVhot", Kind: KindCache, Path: file, Title: "热门"}); err != nil {
			t.Fatal(err)
		}
	}
	// 再加一首别的
	if err := l.Record(Record{BVID: "BVother", Kind: KindDownload, Path: file, Dir: dir}); err != nil {
		t.Fatal(err)
	}

	lines := readLines(t, l.Path())
	if len(lines) >= 121 {
		t.Fatalf("反复记录应当触发压实，实际还有 %d 行", len(lines))
	}

	for _, line := range lines {
		var rec Record
		if err := json.Unmarshal([]byte(line), &rec); err != nil {
			t.Fatalf("压实后的行不是合法 JSON: %v (%s)", err, line)
		}
		if !valid(rec) {
			t.Fatalf("压实后的行缺少 bvid/kind: %s", line)
		}
	}

	l2, err := Open(l.Path())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := l2.Lookup("BVhot", KindCache); !ok {
		t.Fatal("压实把最新的记录弄丢了")
	}
	if got := len(l2.All()); got != 2 {
		t.Fatalf("压实后应当只剩 2 个键，得到 %d", got)
	}
}

func TestForgetRemovesRecordFromDisk(t *testing.T) {
	dir := t.TempDir()
	l := newTestLedger(t)
	file := writeFile(t, dir, "song.m4a", "audio")

	if err := l.Record(Record{BVID: "BV1", Kind: KindDownload, Path: file}); err != nil {
		t.Fatal(err)
	}
	if !l.Forget("BV1", KindDownload) {
		t.Fatal("Forget 应当报告删掉了东西")
	}
	if l.Forget("BV1", KindDownload) {
		t.Fatal("重复 Forget 应当返回 false")
	}
	l2, err := Open(l.Path())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := l2.Lookup("BV1", KindDownload); ok {
		t.Fatal("Forget 之后重新打开还能看到记录")
	}
}

func TestConcurrentRecordsDoNotInterleave(t *testing.T) {
	dir := t.TempDir()
	l := newTestLedger(t)
	file := writeFile(t, dir, "song.m4a", "audio")

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				bvid := "BV" + string(rune('a'+n))
				_ = l.Record(Record{BVID: bvid, Kind: KindCache, Path: file, Title: "并发"})
			}
		}(i)
	}
	wg.Wait()

	// 每一行都必须是完整合法的 JSON —— 交错写会造出半截行
	for _, line := range readLines(t, l.Path()) {
		var rec Record
		if err := json.Unmarshal([]byte(line), &rec); err != nil {
			t.Fatalf("并发追加产生了坏行: %v (%s)", err, line)
		}
	}
	l2, err := Open(l.Path())
	if err != nil {
		t.Fatal(err)
	}
	if l2.BadLines() != 0 {
		t.Errorf("并发追加不该产生坏行，得到 %d", l2.BadLines())
	}
	if got := len(l2.All()); got != 8 {
		t.Errorf("8 首各一条（后者胜），得到 %d 个键", got)
	}
}

func TestRecordRejectsRecordsWithoutKey(t *testing.T) {
	l := newTestLedger(t)
	if err := l.Record(Record{Kind: KindCache}); err == nil {
		t.Fatal("缺少 bvid 应当报错，而不是写一行无法索引的记录")
	}
	if err := l.Record(Record{BVID: "BV1", Kind: "unknown"}); err == nil {
		t.Fatal("未知 kind 应当报错")
	}
	if err := l.Record(Record{BVID: "BV1", Kind: KindCache, Path: "x"}); err != nil {
		t.Fatalf("合法记录不该报错: %v", err)
	}
}

func TestOpenRejectsEmptyPath(t *testing.T) {
	if _, err := Open("   "); err == nil {
		t.Fatal("空路径应当报错，而不是默默写到当前目录")
	}
}
