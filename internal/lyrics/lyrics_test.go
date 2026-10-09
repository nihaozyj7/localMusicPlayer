package lyrics

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeSourcesFillsCache(t *testing.T) {
	// 老配置（没有 cache 这一层）必须被补上，且补在 online 之前
	got := NormalizeSources([]string{"lrc-file", "embedded", "online"})
	want := []string{"lrc-file", "embedded", "cache", "online"}
	if len(got) != len(want) {
		t.Fatalf("长度不对: %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("第 %d 项 = %q，期望 %q（整体 %v）", i, got[i], want[i], got)
		}
	}
}

func TestNormalizeSourcesDropsUnknownAndDuplicates(t *testing.T) {
	got := NormalizeSources([]string{"online", "online", "bogus", "cache"})
	want := []string{"online", "cache"}
	if len(got) != len(want) {
		t.Fatalf("长度不对: %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("第 %d 项 = %q，期望 %q（整体 %v）", i, got[i], want[i], got)
		}
	}
}

// 不自动把 online 加回来：用户去掉它就是「只要本地歌词」。
func TestNormalizeSourcesKeepsOfflineOnly(t *testing.T) {
	got := NormalizeSources([]string{"embedded"})
	if WantOnline(got) {
		t.Fatalf("不该自动加回 online: %v", got)
	}
	if len(got) != 2 || got[0] != "embedded" || got[1] != "cache" {
		t.Fatalf("cache 应当被插进来: %v", got)
	}
}

// 缓存层必须真的参与读取链：这正是「手动匹配的歌词第二次打开又没有了」的修法。
func TestLoadPrefersCachePerSources(t *testing.T) {
	dir := t.TempDir()
	audio := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(audio, []byte("not really audio"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "song.lrc"), []byte("[00:01.00]来自同名 lrc"), 0o644); err != nil {
		t.Fatal(err)
	}

	cache := func(id string) (string, bool) {
		if id == "song" {
			return "[00:01.00]来自缓存", true
		}
		return "", false
	}

	// 默认顺序：lrc-file 在 cache 之前
	res := Load("song", audio, []string{"lrc-file", "cache"}, cache)
	if res.Source != SourceLRCFile {
		t.Fatalf("期望命中 lrc-file，实际 %q", res.Source)
	}

	// 用户把缓存拖到前面时以缓存为准
	res = Load("song", audio, []string{"cache", "lrc-file"}, cache)
	if res.Source != SourceCache {
		t.Fatalf("期望命中 cache，实际 %q", res.Source)
	}
	if res.LRC != "[00:01.00]来自缓存" {
		t.Fatalf("歌词内容不对: %q", res.LRC)
	}
}

// 需求：**优先使用字级歌词**。同为行级时仍按配置的来源顺序（上面那条已经
// 钉住），但只要后面某个来源带逐字时间轴，就用字级那一份。
func TestLoadPrefersWordLevelAcrossSources(t *testing.T) {
	dir := t.TempDir()
	audio := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(audio, []byte("not really audio"), 0o644); err != nil {
		t.Fatal(err)
	}
	// 排在 cache 前面的 lrc-file 是行级
	if err := os.WriteFile(filepath.Join(dir, "song.lrc"), []byte("[00:01.00]行级那份"), 0o644); err != nil {
		t.Fatal(err)
	}

	cache := func(id string) (string, bool) {
		return "[00:01.00]<00:01.000>字<00:01.300>级", true
	}

	// lrc-file 排在 cache 前面，但它是行级 → 字级的缓存胜出
	res := Load("song", audio, []string{"lrc-file", "cache"}, cache)
	if res.Source != SourceCache || !HasWordTiming(res.LRC) {
		t.Fatalf("应当优先返回字级结果，实际 %+v", res)
	}

	// 反过来（两边都是行级）就必须老老实实按来源顺序
	cacheLine := func(string) (string, bool) { return "[00:01.00]来自缓存", true }
	res = Load("song", audio, []string{"lrc-file", "cache"}, cacheLine)
	if res.Source != SourceLRCFile {
		t.Fatalf("同为行级时应按来源顺序，实际 %+v", res)
	}
}

// 同目录下既有 .lrc 又有字级的 .qrc/.krc/.yrc 时，取字级那一份。
func TestLoadPrefersWordLevelSidecar(t *testing.T) {
	dir := t.TempDir()
	audio := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(audio, []byte("not really audio"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "song.lrc"), []byte("[00:01.00]行级那份"), 0o644); err != nil {
		t.Fatal(err)
	}
	// QRC 原文：读进来要归一化成增强 LRC（前端只认这一种）
	if err := os.WriteFile(filepath.Join(dir, "song.qrc"), []byte("[1200,800]字(0,300)级(300,500)"), 0o644); err != nil {
		t.Fatal(err)
	}

	res := Load("song", audio, []string{"lrc-file"}, nil)
	if res.Source != SourceLRCFile {
		t.Fatalf("应当命中同名字级文件，实际 %+v", res)
	}
	if res.LRC != "[00:01.20]<00:01.200>字<00:01.500>级" {
		t.Fatalf("qrc 应当被归一化成增强 LRC，实际 %q", res.LRC)
	}
}

func TestLoadReturnsNoneWhenNothingFound(t *testing.T) {
	dir := t.TempDir()
	audio := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(audio, []byte("not really audio"), 0o644); err != nil {
		t.Fatal(err)
	}
	res := Load("song", audio, DefaultSources, nil)
	if res.Source != SourceNone || res.LRC != "" {
		t.Fatalf("期望空结果，实际 %+v", res)
	}
}

// online 是异步能力，Load 绝不会在这里同步等网络。
func TestLoadSkipsOnline(t *testing.T) {
	dir := t.TempDir()
	audio := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(audio, []byte("not really audio"), 0o644); err != nil {
		t.Fatal(err)
	}
	res := Load("song", audio, []string{"online"}, nil)
	if res.Source != SourceNone {
		t.Fatalf("Load 不该做在线匹配，实际 %+v", res)
	}
	if !WantOnline([]string{"online"}) {
		t.Fatal("WantOnline 应当为 true")
	}
	if WantOnline([]string{"embedded"}) {
		t.Fatal("WantOnline 应当为 false")
	}
}
