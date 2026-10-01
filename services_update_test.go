package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/update"
)

/* ==========================================================================
   services_update_test.go — 更新服务的状态与闸门
   --------------------------------------------------------------------------
   这里不测网络（那是 internal/update 的职责），只测服务层多做的那几件事：
     · 「跳过此版本」真的能让 HasUpdate 变 false（否则用户关不掉这个提示）；
     · 通道写入 / 规范化（用户选过之后要记住，非法值不能让它下载失败）；
     · State() 的快照字段（界面重新打开时要靠它渲染）。
   ========================================================================== */

func newTestUpdateService(t *testing.T) *UpdateService {
	t.Helper()
	t.Setenv("LMPLAYER_DATA_DIR", t.TempDir())
	store, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("创建配置存储失败：%v", err)
	}
	return NewUpdateService(store)
}

func TestUpdateServiceVersionMatchesAppVersion(t *testing.T) {
	svc := newTestUpdateService(t)
	if got := svc.Version(); got != appVersion {
		t.Fatalf("Version() = %q，期望 appVersion = %q", got, appVersion)
	}
}

func TestUpdateServiceSkipVersionSuppressesHasUpdate(t *testing.T) {
	svc := newTestUpdateService(t)

	// 用一个假的 API 服务器返回「有新版」。
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]update.Release{{
			TagName: "v9.9.9",
			HTMLURL: "https://example.invalid/v9.9.9",
			Assets: []update.Asset{{
				Name:               "LMPlayer-v9.9.9-windows-x64.exe",
				Size:               1234,
				BrowserDownloadURL: "https://example.invalid/app.exe",
			}},
		}})
	}))
	defer srv.Close()
	svc.client = &update.Client{Repo: "o/r", APIBase: srv.URL, HTTP: &http.Client{Timeout: 5 * time.Second}}

	res, err := svc.Check(true)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if !res.HasUpdate {
		t.Fatal("前置条件不成立：应当报告有更新")
	}
	if res.Latest != "v9.9.9" {
		t.Fatalf("Latest = %q", res.Latest)
	}

	// 标记跳过：之后不应再当作「有更新」
	if err := svc.SkipVersion(res.Latest); err != nil {
		t.Fatalf("SkipVersion 失败：%v", err)
	}
	again, err := svc.Check(true)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if again.HasUpdate {
		t.Fatal("跳过这个版本之后不应再报告有更新（否则用户关不掉提示）")
	}
	if again.Available {
		t.Fatal("被跳过的版本不应再提供下载")
	}
	// 版本号仍然要如实带上，界面才能显示「已跳过 v9.9.9」
	if again.Latest != "v9.9.9" {
		t.Fatalf("跳过后仍应保留版本号，得到 %q", again.Latest)
	}

	// 取消跳过（传空）后恢复
	if err := svc.SkipVersion(""); err != nil {
		t.Fatalf("取消跳过失败：%v", err)
	}
	restored, err := svc.Check(true)
	if err != nil {
		t.Fatalf("Check 失败：%v", err)
	}
	if !restored.HasUpdate {
		t.Fatal("取消跳过后应当重新报告有更新")
	}
}

func TestUpdateServiceSkipVersionIgnoresPrefixDifference(t *testing.T) {
	// 用户跳过的可能是 "v0.2.0"，而配置里存的是 "v0.2.0"、比较时是 tag 原文。
	// `v` 前缀的差异不该让跳过失效。
	svc := newTestUpdateService(t)
	if err := svc.SkipVersion("v0.2.0"); err != nil {
		t.Fatal(err)
	}
	if !sameVersion(svc.skippedVersion(), "0.2.0") {
		t.Fatal("v0.2.0 与 0.2.0 应当被认作同一个版本")
	}
	if !sameVersion("0.1.1", "v0.1.1") {
		t.Fatal("带不带 v 前缀应当等价")
	}
	if sameVersion("0.1.1", "0.1.2") {
		t.Fatal("不同版本不应被认作相同")
	}
}

func TestUpdateServiceChannelPersistsAndNormalizes(t *testing.T) {
	svc := newTestUpdateService(t)

	// 默认是 auto
	if got := svc.State()["channel"]; got != update.ChannelAuto {
		t.Fatalf("默认通道应当是 auto，得到 %v", got)
	}

	if err := svc.SetChannel("ghfast.top"); err != nil {
		t.Fatalf("SetChannel 失败：%v", err)
	}
	if got := svc.State()["channel"]; got != "ghfast.top" {
		t.Fatalf("通道没有生效，得到 %v", got)
	}

	// 非法值必须被规范化成 auto，而不是原样存下去
	// （存下去的话下载会拿着一个查不到的通道名，表现为「点下载没反应」）
	if err := svc.SetChannel("bogus-mirror"); err != nil {
		t.Fatalf("SetChannel 失败：%v", err)
	}
	if got := svc.State()["channel"]; got != update.ChannelAuto {
		t.Fatalf("非法通道应当落回 auto，得到 %v", got)
	}
}

func TestUpdateServiceMirrorsListShape(t *testing.T) {
	svc := newTestUpdateService(t)
	list := svc.Mirrors()
	if len(list) != len(update.Mirrors) {
		t.Fatalf("Mirrors() 返回 %d 条，期望 %d 条", len(list), len(update.Mirrors))
	}
	for _, m := range list {
		if m["id"] == "" || m["name"] == "" {
			t.Errorf("通道条目缺字段：%+v", m)
		}
	}
	// 当前选中的那条要被标出来（界面靠它渲染选中态）
	_ = svc.SetChannel("ghproxy.net")
	found := false
	for _, m := range svc.Mirrors() {
		if m["id"] == "ghproxy.net" {
			found = true
			if m["current"] != true {
				t.Error("当前通道应当被标记 current=true")
			}
		} else if m["current"] == true {
			t.Errorf("非当前通道不应被标记：%v", m["id"])
		}
	}
	if !found {
		t.Fatal("名单里没有 ghproxy.net")
	}
}

func TestUpdateServiceStateSnapshot(t *testing.T) {
	svc := newTestUpdateService(t)
	st := svc.State()

	for _, key := range []string{"currentVersion", "channel", "checking", "downloading", "repo", "repoUrl", "checkOnStart"} {
		if _, ok := st[key]; !ok {
			t.Errorf("State() 缺少字段 %s", key)
		}
	}
	if st["currentVersion"] != appVersion {
		t.Errorf("currentVersion = %v，期望 %s", st["currentVersion"], appVersion)
	}
	// 还没检查过时不应有 check 字段（界面据此显示「尚未检查」）
	if _, ok := st["check"]; ok {
		t.Error("尚未检查时不应带上 check 字段")
	}

	// 下载目录应当落在数据目录下
	if dir := svc.installDir(); dir == "" {
		t.Error("installDir() 不应为空")
	}
}

func TestUpdateServiceDownloadRequiresCheckFirst(t *testing.T) {
	svc := newTestUpdateService(t)
	// 没有检查过就点下载：必须给出可操作的错误，而不是 panic 或静默失败
	if _, err := svc.Download(); err == nil {
		t.Fatal("未检查就下载应当返回错误")
	}
}

func TestUpdateServiceInstallRequiresDownload(t *testing.T) {
	svc := newTestUpdateService(t)
	if _, err := svc.Install(); err == nil {
		t.Fatal("没有下载过就安装应当返回错误")
	}
}

func TestUpdateServiceCancelWithoutDownload(t *testing.T) {
	svc := newTestUpdateService(t)
	// 没有下载在跑时点取消：返回 false，不报错
	if svc.CancelDownload() {
		t.Fatal("没有下载时 CancelDownload 应当返回 false")
	}
}

func TestUpdateServiceSetCheckOnStart(t *testing.T) {
	svc := newTestUpdateService(t)
	if err := svc.SetCheckOnStart(false); err != nil {
		t.Fatalf("SetCheckOnStart 失败：%v", err)
	}
	if got := svc.State()["checkOnStart"]; got != false {
		t.Fatalf("checkOnStart 没有生效，得到 %v", got)
	}
	if err := svc.SetCheckOnStart(true); err != nil {
		t.Fatalf("SetCheckOnStart 失败：%v", err)
	}
	if got := svc.State()["checkOnStart"]; got != true {
		t.Fatalf("checkOnStart 没有生效，得到 %v", got)
	}
}

func TestUpdateServiceCheckReportsNetworkFailure(t *testing.T) {
	// 网络不通时 Check 必须把错误写进结果（而不是返回 error 或假装最新）
	svc := newTestUpdateService(t)
	svc.client = &update.Client{
		Repo:    "o/r",
		APIBase: "http://127.0.0.1:1",
		HTTP:    &http.Client{Timeout: 2 * time.Second},
	}
	res, err := svc.Check(true)
	if err != nil {
		t.Fatalf("网络失败不该是 error：%v", err)
	}
	if res.Error == "" {
		t.Fatal("网络失败时结果里必须带上错误说明")
	}
	if res.HasUpdate {
		t.Fatal("检查失败时不应声称有更新")
	}
}
