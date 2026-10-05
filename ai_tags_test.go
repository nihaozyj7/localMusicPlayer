package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dhowden/tag"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/library"
	"localmusicplayer/internal/metacache"
)

/* ==========================================================================
   下载后 AI 整理元数据
   --------------------------------------------------------------------------
   需求（用户原话）：「在 ai 界面添加一个开关，允许用户下载歌曲时，让 ai
   提取歌曲的元数据并且回写，只在下载歌曲时生效（目前下载的实现有两种，
   一是直接下载，二是从缓存移动，这两种方式都触发 AI 整理歌曲元数据的操作）」

   这一组测试盯住四件事：
     1. 开关**真的能关**（关掉后一次 AI 请求都不发）；
     2. 两条下载路径**都会触发**（这里测的是回调链，见
        TestDownloadNotifiesOnDownloadedBothPaths）；
     3. 只有非空字段才写（空值不能把文件里原有标签清掉）；
     4. mp3 这类不支持写标签的格式**不碰文件**。
   ========================================================================== */

// newAITagTestStore 建一个隔离的配置存储（AI 已配置齐全）。
func newAITagTestStore(t *testing.T, baseURL string) *bootstrap.Store {
	t.Helper()
	t.Setenv("LMPLAYER_DATA_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("创建配置存储失败: %v", err)
	}
	if _, err := NewConfigService(store).Set(map[string]any{
		"aiBaseUrl":     baseURL,
		"aiApiKey":      "test-key",
		"aiModelId":     "test-model",
		"aiLyricsClean": false,
		"aiDownloadTag": true,
	}); err != nil {
		t.Fatalf("写配置失败: %v", err)
	}
	return store
}

// fakeAIServer 起一个只回固定 JSON 的假 AI 服务，并记录被调用了几次。
func fakeAIServer(t *testing.T, payload string, calls *int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": payload}},
			},
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

// buildTestM4AForAI 造一个能被 metacache 写标签的最小 m4a。
//
// 为什么不复用 internal/metacache 的测试构造器：它是包内私有的
// （buildTestM4A 未导出），而这里要测的是**跨包**的整条链路。
func buildTestM4AForAI() []byte {
	be32 := func(v uint32) []byte {
		return []byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)}
	}
	box := func(kind string, payload []byte) []byte {
		out := append([]byte{}, be32(uint32(len(payload)+8))...)
		out = append(out, []byte(kind)...)
		return append(out, payload...)
	}
	mvhd := make([]byte, 100)
	mvhd[0] = 0
	out := box("ftyp", append([]byte("M4A "), be32(0)...))
	out = append(out, box("moov", box("mvhd", mvhd))...)
	return append(out, box("mdat", make([]byte, 512))...)
}

// newAITagServiceForTest 把 store / AI / 曲库装配起来。
func newAITagServiceForTest(t *testing.T, baseURL string) (*AITagService, *bootstrap.Store) {
	t.Helper()
	store := newAITagTestStore(t, baseURL)
	svc := NewAITagService(store)
	svc.setAI(NewAiService(store))
	return svc, store
}

func TestAITagWritesTagsAfterDownload(t *testing.T) {
	var calls int
	srv := fakeAIServer(t, `{"title":"真的标题","artist":"真的歌手","album":"真的专辑"}`, &calls)
	svc, _ := newAITagServiceForTest(t, srv.URL+"/v1")

	dir := t.TempDir()
	path := filepath.Join(dir, "【高音质】某视频标题.m4a")
	if err := os.WriteFile(path, buildTestM4AForAI(), 0o644); err != nil {
		t.Fatal(err)
	}
	svc.setLibrary(newTestLibrary(t))

	res := svc.Process(path)
	if !res.Applied {
		t.Fatalf("应当真的写回文件，实际 %+v", res)
	}
	if res.Skipped != "" {
		t.Fatalf("不该被跳过：%s", res.Skipped)
	}
	if calls != 1 {
		t.Fatalf("应当只调用一次 AI，实际 %d 次", calls)
	}
	if res.Tags.Title != "真的标题" || res.Tags.Artist != "真的歌手" || res.Tags.Album != "真的专辑" {
		t.Fatalf("写回的字段不对: %+v", res.Tags)
	}

	// 用扫描时用的同一个解析库验证文件里真的有这些标签
	m := readSongTags(t, path)
	if m.Title() != "真的标题" || m.Artist() != "真的歌手" || m.Album() != "真的专辑" {
		t.Fatalf("文件里的标签不对: %q / %q / %q", m.Title(), m.Artist(), m.Album())
	}
}

// ★ 开关关掉后不能再发一次 AI 请求（用户明确关掉了这个能力）。
func TestAITagDisabledSkipsWithoutRequest(t *testing.T) {
	var calls int
	srv := fakeAIServer(t, `{"title":"真的标题"}`, &calls)
	svc, store := newAITagServiceForTest(t, srv.URL+"/v1")
	svc.setLibrary(newTestLibrary(t))

	if _, err := NewConfigService(store).Set(map[string]any{"aiDownloadTag": false}); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	original := buildTestM4AForAI()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}

	res := svc.Process(path)
	if res.Applied {
		t.Fatal("开关关掉后不该改写文件")
	}
	if calls != 0 {
		t.Fatalf("开关关掉后不该请求 AI，实际请求 %d 次", calls)
	}
	if res.Skipped != "开关已关闭" {
		t.Fatalf("跳过原因应为「开关已关闭」，实际 %q", res.Skipped)
	}
	// 文件必须一字未动
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(original) {
		t.Fatal("开关关掉后文件被改动了")
	}
}

// 没配 AI（缺 baseUrl/apiKey）时同样不该动文件。
func TestAITagWithoutConfigSkips(t *testing.T) {
	t.Setenv("LMPLAYER_DATA_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	svc := NewAITagService(store)
	svc.setAI(NewAiService(store))
	svc.setLibrary(newTestLibrary(t))

	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(path, buildTestM4AForAI(), 0o644); err != nil {
		t.Fatal(err)
	}
	res := svc.Process(path)
	if res.Applied || res.Skipped != "AI 未配置" {
		t.Fatalf("未配置 AI 时应跳过，实际 %+v", res)
	}
}

// ★ 空字段不能被写进文件：AI 返回空值时，文件里已有的正确标签必须原样保留。
func TestAITagEmptyFieldsDoNotClearExisting(t *testing.T) {
	var calls int
	srv := fakeAIServer(t, `{"title":"新标题","artist":"","album":""}`, &calls)
	svc, _ := newAITagServiceForTest(t, srv.URL+"/v1")
	svc.setLibrary(newTestLibrary(t))

	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	if err := os.WriteFile(path, buildTestM4AForAI(), 0o644); err != nil {
		t.Fatal(err)
	}
	// 先写一组完整的标签，模拟「文件里本来就有正确的歌手/专辑」
	if _, err := metacache.EmbedTextTags(path, metacache.TextTags{
		Title: "旧标题", Artist: "原歌手", Album: "原专辑",
	}); err != nil {
		t.Fatal(err)
	}

	res := svc.Process(path)
	if !res.Applied {
		t.Fatalf("标题有变化，应当写回，实际 %+v", res)
	}
	m := readSongTags(t, path)
	if m.Title() != "新标题" {
		t.Fatalf("标题应被更新，实际 %q", m.Title())
	}
	if m.Artist() != "原歌手" || m.Album() != "原专辑" {
		t.Fatalf("AI 返回空值不该清掉原有标签：%q / %q", m.Artist(), m.Album())
	}
}

// 占位值（"未知歌手" / "未知专辑"）同样不写：写了只会污染文件。
func TestAITagPlaceholderValuesAreIgnored(t *testing.T) {
	var calls int
	srv := fakeAIServer(t, `{"title":"未知歌曲","artist":"未知歌手","album":"未知专辑"}`, &calls)
	svc, _ := newAITagServiceForTest(t, srv.URL+"/v1")
	svc.setLibrary(newTestLibrary(t))

	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	original := buildTestM4AForAI()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}
	res := svc.Process(path)
	if res.Applied {
		t.Fatalf("全是占位值时不该写文件，实际 %+v", res)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(original) {
		t.Fatal("全是占位值时文件被改动了")
	}
}

// ★ 不支持的格式（mp3 等）绝不碰文件，但也别把整件事判成失败。
func TestAITagUnsupportedFormatDoesNotTouchFile(t *testing.T) {
	var calls int
	srv := fakeAIServer(t, `{"title":"真的标题","artist":"真的歌手"}`, &calls)
	svc, _ := newAITagServiceForTest(t, srv.URL+"/v1")
	svc.setLibrary(newTestLibrary(t))

	dir := t.TempDir()
	path := filepath.Join(dir, "song.mp3")
	original := []byte("ID3 fake mp3 payload")
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}
	res := svc.Process(path)
	if res.Applied {
		t.Fatal("mp3 不支持写标签，不该报告已写回")
	}
	if res.Tags.Empty() {
		t.Fatal("应当仍然记录了 AI 给出的字段（只是没写进文件）")
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(original) {
		t.Fatal("不支持的格式绝不能被改写")
	}
}

// AI 调用失败时不能改文件，也不能崩。
func TestAITagAIFailureLeavesFileAlone(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":{"message":"boom"}}`))
	}))
	t.Cleanup(srv.Close)

	svc, _ := newAITagServiceForTest(t, srv.URL+"/v1")
	svc.setLibrary(newTestLibrary(t))

	dir := t.TempDir()
	path := filepath.Join(dir, "song.m4a")
	original := buildTestM4AForAI()
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}
	res := svc.Process(path)
	if res.Applied || res.Skipped != "AI 调用失败" {
		t.Fatalf("AI 失败时应跳过，实际 %+v", res)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(original) {
		t.Fatal("AI 失败时文件被改动了")
	}
}

// buildDownloadTags 的合并规则（不联网，纯函数）。
func TestBuildDownloadTags(t *testing.T) {
	song := bootstrap.Song{Title: "旧标题", Artist: "旧歌手", Album: "旧专辑"}

	t.Run("全都不同则全都写", func(t *testing.T) {
		got := buildDownloadTags(song, CleanMeta{Title: "新标题", Artist: "新歌手", Album: "新专辑"})
		if got.Title != "新标题" || got.Artist != "新歌手" || got.Album != "新专辑" {
			t.Fatalf("不对: %+v", got)
		}
	})

	t.Run("与现有值相同则不写", func(t *testing.T) {
		got := buildDownloadTags(song, CleanMeta{Title: "旧标题", Artist: "旧歌手", Album: "旧专辑"})
		if !got.Empty() {
			t.Fatalf("值没变化时不该写文件: %+v", got)
		}
	})

	t.Run("空值与占位值不写", func(t *testing.T) {
		got := buildDownloadTags(song, CleanMeta{Title: "", Artist: "未知歌手", Album: "  "})
		if !got.Empty() {
			t.Fatalf("空值/占位值不该写文件: %+v", got)
		}
	})

	t.Run("首尾空格不影响判等", func(t *testing.T) {
		got := buildDownloadTags(song, CleanMeta{Title: "  旧标题  "})
		if !got.Empty() {
			t.Fatalf("去掉空格后与现有值相同，不该写文件: %+v", got)
		}
	})
}

// usableTagValue 过滤空值与占位值。
func TestUsableTagValue(t *testing.T) {
	for _, bad := range []string{"", "   ", "未知歌手", "未知专辑", "unknown", "n/a"} {
		if got := usableTagValue(bad); got != "" {
			t.Errorf("usableTagValue(%q) = %q，期望空", bad, got)
		}
	}
	for _, good := range []string{"晴天", "Jay Chou", "叶惠美"} {
		if got := usableTagValue(good); got != good {
			t.Errorf("usableTagValue(%q) = %q，期望原值", good, got)
		}
	}
}

/* --------------------------------------------------------------------------
   两条下载路径都要触发
   -------------------------------------------------------------------------- */

// newTestLibrary 建一个指向临时目录的曲库管理器。
func newTestLibrary(t *testing.T) *library.Manager {
	t.Helper()
	t.Setenv("LMPLAYER_DATA_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatal(err)
	}
	return library.NewManager(store)
}

// readSongTags 打开文件并用扫描时用的同一个解析库读标签。
func readSongTags(t *testing.T, path string) tag.Metadata {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	m, err := tag.ReadFrom(f)
	if err != nil {
		t.Fatalf("解析标签失败: %v", err)
	}
	return m
}

// ★ onDownloaded 回调必须在**两条**下载路径上都被触发。
//
// 一条是「从试听缓存搬运」（tryMoveFromCache），另一条是「走网络下载」（run）。
// 网络那条需要真实的 B 站接口，这里不联网 —— 改为断言源头：
// 两个分支里都必须出现 notifyDownloaded 的调用。
//
// 为什么用源码断言而不是跑两条路径：网络下载分支要一个可用的 bilibili
// 客户端与真实音频流，测试里造不出来；而这条约束的本质是「别漏了某一处」，
// 源码层面正好能精确地守住它。
func TestDownloadNotifiesOnDownloadedBothPaths(t *testing.T) {
	src, err := os.ReadFile("services_download.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(src)

	// 两条路径各自的收尾标志：一条在 tryMoveFromCache 里（fromCache 事件），
	// 一条在 run 里（download:done 事件带上 duration）。
	markers := []struct {
		name   string
		anchor string
	}{
		{"从试听缓存搬运", `"fromCache": true`},
		{"走网络下载", `"duration": durationMS`},
	}
	for _, m := range markers {
		idx := strings.Index(text, m.anchor)
		if idx < 0 {
			t.Fatalf("找不到「%s」路径的收尾标记（%s）—— 实现改了？", m.name, m.anchor)
		}
		// 收尾标记之后必须出现 notifyDownloaded（它排在 onFileAdded 之后）
		if !strings.Contains(text[idx:], "s.notifyDownloaded(target)") {
			t.Fatalf("「%s」路径没有触发 onDownloaded —— 两种下载方式必须都整理元数据", m.name)
		}
	}

	// 而且必须在 goroutine 里调：回调链上有 8~18 秒的 AI 请求
	if !strings.Contains(text, "go s.notifyDownloaded(target)") {
		t.Fatal("notifyDownloaded 必须在 goroutine 里调用（否则会拖住下载流程十几秒）")
	}
}
