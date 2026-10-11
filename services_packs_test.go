package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/packstore"
	"localmusicplayer/internal/skins"
)

/* ==========================================================================
   PackService（从仓库获取主题 / 样式包）的端到端测试
   --------------------------------------------------------------------------
   这一层的价值不是重复 internal/packstore 的用例，而是验证**接线**：

     · 装主题时落点确实是 themeMgr.Dir()、装完 themeMgr 立刻能扫到它；
     · 装样式包时前缀剥对了（<player-skins>/<id>/skin.json 而不是嵌一层）；
     · 来源地址改完真的落盘（重启还在）—— 这是「配置键必须三处同步」那条
       不变量最容易漏的一环，而漏了的表现是「改了地址，重启就忘了」。

   全部指向 httptest 起的本地服务器，不碰网络。
   ========================================================================== */

func sumHex(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

// packServer 起一个只服务给定文件的静态服务器，并统计请求数。
func packServer(t *testing.T, files map[string][]byte) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		body, ok := files[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv, &hits
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("拼清单失败：%v", err)
	}
	return raw
}

const packThemeCSS = `/* @theme-name 仓库主题 */
:root[data-theme="fromrepo"] { color-scheme: dark; --bg-app: #101010; }
`

/* --------------------------------------------------------------------------
   主题
   -------------------------------------------------------------------------- */

func TestPackServiceInstallsThemeFromRepo(t *testing.T) {
	store := newTestStore(t)
	themeMgr := newTestThemeManager(t)

	css := []byte(packThemeCSS)
	manifest := mustJSON(t, map[string]any{
		"spec": 1,
		"kind": "theme",
		"items": []map[string]any{{
			"id": "fromrepo", "name": "仓库主题", "version": "2.0.0", "mode": "dark",
			"swatch": []string{"#101010"},
			"files":  []map[string]any{{"path": "fromrepo.css", "size": len(css), "sha256": sumHex(css)}},
		}},
	})
	srv, _ := packServer(t, map[string][]byte{
		"/theme/index.json":   manifest,
		"/theme/fromrepo.css": css,
	})

	svc := NewPackService(store, themeMgr, nil)
	if _, err := svc.SetSource(srv.URL); err != nil {
		t.Fatalf("设置来源失败：%v", err)
	}

	cat, err := svc.Catalog(packstore.KindTheme, true)
	if err != nil {
		t.Fatalf("取清单失败：%v", err)
	}
	if len(cat.Items) != 1 || cat.Items[0].ID != "fromrepo" {
		t.Fatalf("清单内容不对：%+v", cat.Items)
	}

	res, err := svc.Install(packstore.KindTheme, "fromrepo")
	if err != nil {
		t.Fatalf("安装失败：%v", err)
	}
	if res["id"] != "fromrepo" || res["files"] != 1 {
		t.Fatalf("安装结果不对：%+v", res)
	}

	// 落点必须是主题目录，而且内容与仓库一致
	data, err := os.ReadFile(filepath.Join(themeMgr.Dir(), "fromrepo.css"))
	if err != nil {
		t.Fatalf("主题文件没落到主题目录：%v", err)
	}
	if string(data) != packThemeCSS {
		t.Fatalf("写入的内容不对")
	}
	// 装完立刻重扫过：管理器现在应该能看到它（前端就是靠这个刷新列表的）
	var ids []string
	for _, info := range themeMgr.List() {
		ids = append(ids, info.ID)
	}
	if !contains(ids, "fromrepo") {
		t.Fatalf("主题管理器没扫到刚装的 fromrepo，现有：%v", ids)
	}
}

/* --------------------------------------------------------------------------
   样式包
   -------------------------------------------------------------------------- */

func TestPackServiceInstallsStyleFromRepo(t *testing.T) {
	store := newTestStore(t)
	skinMgr, err := skins.NewManager(store.DataDir())
	if err != nil {
		t.Fatalf("创建样式管理器失败：%v", err)
	}

	skin := []byte(`{"id":"demopack","name":"演示包","version":"1.0.0","apiVersion":"3.0","entry":"skin.js"}`)
	js := []byte("export default function () {}\n")
	manifest := mustJSON(t, map[string]any{
		"spec": 1,
		"kind": "style",
		"items": []map[string]any{{
			"id": "demopack", "dir": "demopack", "name": "演示包", "version": "1.0.0",
			"apiVersion": "3.0",
			"files": []map[string]any{
				{"path": "demopack/skin.json", "size": len(skin), "sha256": sumHex(skin)},
				{"path": "demopack/skin.js", "size": len(js), "sha256": sumHex(js)},
			},
		}},
	})
	srv, _ := packServer(t, map[string][]byte{
		"/style/index.json":         manifest,
		"/style/demopack/skin.json": skin,
		"/style/demopack/skin.js":   js,
	})

	svc := NewPackService(store, nil, skinMgr)
	if _, err := svc.SetSource(srv.URL); err != nil {
		t.Fatalf("设置来源失败：%v", err)
	}
	if _, err := svc.Install(packstore.KindStyle, "demopack"); err != nil {
		t.Fatalf("安装失败：%v", err)
	}

	// 前缀必须被剥掉：落在 <皮肤目录>/demopack/skin.json，而不是嵌成 demopack/demopack/
	root := filepath.Join(skinMgr.Dir(), "demopack")
	if _, err := os.Stat(filepath.Join(root, "skin.json")); err != nil {
		t.Fatalf("skin.json 位置不对：%v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "demopack")); err == nil {
		t.Fatalf("包目录前缀没被剥掉（出现了 demopack/demopack/）")
	}
	// 重扫过：列表里应该有它，且版本号来自清单
	found := false
	for _, info := range skinMgr.List() {
		if info.ID == "demopack" {
			found = true
			if info.Version != "1.0.0" {
				t.Fatalf("版本号没读出来：%q", info.Version)
			}
		}
	}
	if !found {
		t.Fatalf("样式管理器没扫到刚装的 demopack")
	}
}

/* --------------------------------------------------------------------------
   来源地址
   -------------------------------------------------------------------------- */

func TestPackServiceSetSourceNormalizesAndPersists(t *testing.T) {
	store := newTestStore(t)
	svc := NewPackService(store, nil, nil)

	// 少协议 + 末尾多一条斜杠：两种手滑都要被自动修好
	got, err := svc.SetSource("github.com/me/plugins/")
	if err != nil {
		t.Fatalf("设置来源失败：%v", err)
	}
	if got["source"] != "https://github.com/me/plugins" {
		t.Fatalf("地址没被规范化：%v", got["source"])
	}

	// 重启后还在（这条最容易漏：键加了字段却没落盘，表现是「重启就忘了」）
	again, err := bootstrap.NewStore()
	if err != nil {
		t.Fatalf("重新打开配置失败：%v", err)
	}
	if again.Get().PackSource != "https://github.com/me/plugins" {
		t.Fatalf("地址没落盘：%q", again.Get().PackSource)
	}
}

func TestPackServiceSourceDefaultsToRepoPlugins(t *testing.T) {
	store := newTestStore(t)
	svc := NewPackService(store, nil, nil)

	got := svc.Source()
	if got["source"] != bootstrap.DefaultPackSource {
		t.Fatalf("默认来源不对：%v", got["source"])
	}
	// 默认地址必须指向本项目仓库的 plugins 目录 —— 与 services_update.go 的
	// repoSlug 是同一个仓库，仓库改名时两处都要改，这条测试至少能拦住「只改了一处」
	if !strings.Contains(bootstrap.DefaultPackSource, repoSlug) {
		t.Fatalf("默认插件来源 %q 与仓库 %q 对不上", bootstrap.DefaultPackSource, repoSlug)
	}
	if !strings.HasSuffix(bootstrap.DefaultPackSource, "/plugins") {
		t.Fatalf("默认插件来源应该指向 plugins 目录：%q", bootstrap.DefaultPackSource)
	}
}

/* --------------------------------------------------------------------------
   失败与降级
   -------------------------------------------------------------------------- */

func TestPackServiceInstallUnknownID(t *testing.T) {
	store := newTestStore(t)
	themeMgr := newTestThemeManager(t)

	css := []byte(packThemeCSS)
	manifest := mustJSON(t, map[string]any{
		"spec": 1, "kind": "theme",
		"items": []map[string]any{{
			"id": "fromrepo", "name": "仓库主题",
			"files": []map[string]any{{"path": "fromrepo.css", "size": len(css), "sha256": sumHex(css)}},
		}},
	})
	srv, _ := packServer(t, map[string][]byte{
		"/theme/index.json":   manifest,
		"/theme/fromrepo.css": css,
	})

	svc := NewPackService(store, themeMgr, nil)
	if _, err := svc.SetSource(srv.URL); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Catalog(packstore.KindTheme, true); err != nil {
		t.Fatal(err)
	}
	_, err := svc.Install(packstore.KindTheme, "nope")
	if err == nil || !strings.Contains(err.Error(), "刷新") {
		t.Fatalf("装不存在的条目应该提示先刷新：%v", err)
	}
}

func TestPackServiceCatalogFallsBackToCacheWhenOffline(t *testing.T) {
	store := newTestStore(t)
	themeMgr := newTestThemeManager(t)

	css := []byte(packThemeCSS)
	manifest := mustJSON(t, map[string]any{
		"spec": 1, "kind": "theme",
		"items": []map[string]any{{
			"id": "fromrepo", "name": "仓库主题",
			"files": []map[string]any{{"path": "fromrepo.css", "size": len(css), "sha256": sumHex(css)}},
		}},
	})
	srv, _ := packServer(t, map[string][]byte{
		"/theme/index.json":   manifest,
		"/theme/fromrepo.css": css,
	})

	svc := NewPackService(store, themeMgr, nil)
	if _, err := svc.SetSource(srv.URL); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Catalog(packstore.KindTheme, true); err != nil {
		t.Fatalf("第一次取清单失败：%v", err)
	}

	// 关掉服务器 = GitHub 打不开。这在国内是常态，必须退回缓存而不是报空
	srv.Close()
	cat, err := svc.Catalog(packstore.KindTheme, true)
	if err != nil {
		t.Fatalf("离线时应该退回缓存而不是报错：%v", err)
	}
	if !cat.Cached {
		t.Fatalf("应该标记为缓存")
	}
	if cat.StaleReason == "" {
		t.Fatalf("应该说明这次为什么没连上")
	}
	if len(cat.Items) != 1 {
		t.Fatalf("缓存里应该有上次那份清单：%+v", cat.Items)
	}
}

func TestPackServiceCatalogRejectsUnknownKind(t *testing.T) {
	store := newTestStore(t)
	svc := NewPackService(store, newTestThemeManager(t), nil)
	if _, err := svc.Catalog("wat", true); err == nil {
		t.Fatalf("未知类型本该被拒绝")
	}
}

func contains(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}
