package bootstrap

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeBrokenConfig 在临时数据目录里放一份 config.json（内容由调用方给）。
func writeBrokenConfig(t *testing.T, raw string) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("LMPLAYER_DATA_DIR", dir)
	path := filepath.Join(dir, "config.json")
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatalf("写配置失败: %v", err)
	}
	return path
}

// brokenBackups 列出 config.json 的损坏备份（名字里带时间戳那一种）。
func brokenBackups(t *testing.T, path string) []string {
	t.Helper()
	matches, err := filepath.Glob(path + ".broken*")
	if err != nil {
		t.Fatalf("列备份失败: %v", err)
	}
	return matches
}

// TestConfigCorruptedOneKeyKeepsTheRest 一个键的类型写坏，不该让整份配置回到默认值。
//
// 对应审查报告第 9 条的第二半（中危）。旧实现是整份 `json.Unmarshal`：只要有一个
// 字段类型不对就整份失败 → 备份后**立即写回默认值**。实测只把 `volume` 写成字符串，
// 读回来就是 `playlists=0 likedIds=0` —— 用户看到的是「我的歌单和收藏全没了」，
// 而坏掉的其实只是一个音量字段。
//
// 修法是逐键降级（decodeConfig）：坏键回落默认值，其余键照常生效，并留一份带
// 时间戳的现场。
func TestConfigCorruptedOneKeyKeepsTheRest(t *testing.T) {
	// volume 是 float64，这里故意给字符串；其余键都是合法且**非默认**的值，
	// 用来证明它们没有被连累。
	const raw = `{
		"theme": "flat-light",
		"volume": "loud",
		"likedIds": ["song-a", "song-b"],
		"playlists": [{"id": "p1", "name": "我的歌单", "locked": false, "builtin": false, "songIds": ["song-a"]}],
		"filterRules": [{"id": "r1", "type": "regex", "op": "match", "value": "\\.mp4$", "unit": "", "scope": "exclude", "enabled": true}]
	}`
	path := writeBrokenConfig(t, raw)

	store, err := NewStore()
	if err != nil {
		t.Fatalf("一个键坏掉不该让 NewStore 失败: %v", err)
	}
	cfg := store.Get()

	def := DefaultConfig()
	if cfg.Theme != "flat-light" {
		t.Errorf("theme = %q，期望 flat-light —— 别的键不该被一个坏键连累", cfg.Theme)
	}
	if len(cfg.LikedIDs) != 2 || cfg.LikedIDs[0] != "song-a" {
		t.Errorf("likedIds = %v，期望 2 条 —— 收藏被整份丢掉了", cfg.LikedIDs)
	}
	if len(cfg.Playlists) != 1 || cfg.Playlists[0].Name != "我的歌单" {
		t.Errorf("playlists = %+v，期望 1 个「我的歌单」—— 歌单被整份丢掉了", cfg.Playlists)
	}
	if len(cfg.FilterRules) != 1 || cfg.FilterRules[0].ID != "r1" {
		t.Errorf("filterRules = %+v，期望保留 r1", cfg.FilterRules)
	}
	// 坏掉的那个键回落默认值（而不是变成 0）
	if cfg.Volume != def.Volume {
		t.Errorf("volume = %v，期望回落默认值 %v", cfg.Volume, def.Volume)
	}

	backups := brokenBackups(t, path)
	if len(backups) == 0 {
		t.Fatal("损坏的配置必须留一份 .broken-<时间戳> 现场")
	}
	got, err := os.ReadFile(backups[0])
	if err != nil {
		t.Fatalf("读备份失败: %v", err)
	}
	if string(got) != raw {
		t.Error("备份必须是**原始内容**一个字节不改（否则现场就没意义了）")
	}
}

// TestConfigWholeFileGarbageFallsBackToDefaults 整份不是 JSON 时仍然回落默认值 + 现场。
func TestConfigWholeFileGarbageFallsBackToDefaults(t *testing.T) {
	path := writeBrokenConfig(t, "{oops, not json")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("整份坏掉时应当回落默认值，而不是启动失败: %v", err)
	}
	if got := store.Get().Theme; got != DefaultConfig().Theme {
		t.Errorf("theme = %q，期望默认值 %q", got, DefaultConfig().Theme)
	}
	if len(brokenBackups(t, path)) == 0 {
		t.Fatal("整份坏掉也要留现场")
	}
}

// TestDecodeConfigDropsOnlyBrokenKeys 直接盯 decodeConfig 的返回值（降级发生在哪些键上）。
func TestDecodeConfigDropsOnlyBrokenKeys(t *testing.T) {
	base := DefaultConfig()
	base.DataDir = `C:\fake\data`
	base.ConfigPath = `C:\fake\data\config.json`

	raw := []byte(`{"theme":"flat-light","volume":"loud","scanConcurrency":"many","likedIds":["x"]}`)
	cfg, wholeErr, dropped := decodeConfig(raw, base)

	if wholeErr == "" {
		t.Error("整份解析应当失败（有一个键的类型不对），wholeErr 不该为空")
	}
	if strings.Join(dropped, ",") != "scanConcurrency,volume" {
		t.Errorf("dropped = %v，期望只有 scanConcurrency 与 volume", dropped)
	}
	if cfg.Theme != "flat-light" || len(cfg.LikedIDs) != 1 {
		t.Errorf("好键应当照常生效，实际 theme=%q likedIds=%v", cfg.Theme, cfg.LikedIDs)
	}
	if cfg.Volume != DefaultConfig().Volume || cfg.ScanConcurrency != DefaultConfig().ScanConcurrency {
		t.Error("坏键应当回落默认值")
	}
	// 运行时字段永远以调用方给的为准（json:"-"，绝不能被文件内容影响）
	if cfg.DataDir != base.DataDir || cfg.ConfigPath != base.ConfigPath {
		t.Errorf("DataDir/ConfigPath 被文件影响了：%q / %q", cfg.DataDir, cfg.ConfigPath)
	}

	// 正常文件：不该走降级路径
	ok, err1, dropped2 := decodeConfig([]byte(`{"theme":"flat-light"}`), base)
	if err1 != "" || len(dropped2) != 0 {
		t.Errorf("正常文件不该报错或丢键：err=%q dropped=%v", err1, dropped2)
	}
	if ok.Theme != "flat-light" {
		t.Errorf("正常文件应当正常解析，theme=%q", ok.Theme)
	}

	// 非对象（数组）也走整份回落，且不 panic
	arr, err2, dropped3 := decodeConfig([]byte(`[1,2,3]`), base)
	if err2 == "" || len(dropped3) != 0 {
		t.Errorf("数组形式的配置应当整份回落：err=%q dropped=%v", err2, dropped3)
	}
	if arr.Theme != DefaultConfig().Theme {
		t.Error("整份回落时应当是默认值")
	}
	// 编译期确认 decodeConfig 的签名没有被悄悄改成「只返回配置」
	var _ func([]byte, *Config) (*Config, string, []string) = decodeConfig
	_ = json.Marshal
}
