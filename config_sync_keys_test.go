package main

/* ==========================================================================
   配置键一致性守卫：store.js#SYNCED_KEYS ⊆ applyPatch 的 case
   --------------------------------------------------------------------------
   项目不变量 #1：一个配置键必须三处同步 ——
     · internal/bootstrap/config.go 的字段
     · services.go#applyPatch 的 case
     · frontend/src/js/store.js 的 SYNCED_KEYS

   漏掉任何一处都**不会报错**：前端照样把它推到后端，后端静默丢弃；
   下次启动 hydrateFromBackend 再用后端的旧值覆盖界面 ——
   用户看到的现象是「改了设置，重启就没了」。

   这个 bug 在真实代码里出现过至少两次（响度三兄弟、skinPerformanceMode），
   两次都是靠人肉比对发现的。所以这里把它变成机器检查：

     1. SYNCED_KEYS 里的每个键，applyPatch 必须有对应的 case；
     2. applyPatch 的每个 case，Config 里必须有对应的 json 字段；
     3. 白名单本身必须真的存在（防止测试自己空转通过）。
   ========================================================================== */

import (
	"os"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

func readRepoFile(t *testing.T, rel string) string {
	t.Helper()
	// go test 的工作目录就是包目录（仓库根），所以直接相对路径即可。
	raw, err := os.ReadFile(rel)
	if err != nil {
		t.Fatalf("读取 %s 失败: %v", rel, err)
	}
	return string(raw)
}

// parseSyncedKeys 从 store.js 里解析 `const SYNCED_KEYS = [ ... ];`
func parseSyncedKeys(t *testing.T) []string {
	t.Helper()
	src := readRepoFile(t, "frontend/src/js/store.js")
	at := strings.Index(src, "const SYNCED_KEYS = [")
	if at < 0 {
		t.Fatal("store.js 里找不到 SYNCED_KEYS —— 它是配置同步的键清单，改名要同步改这个测试")
	}
	end := strings.Index(src[at:], "];")
	if end < 0 {
		t.Fatal("SYNCED_KEYS 数组没有正常结束")
	}
	body := src[at : at+end]
	re := regexp.MustCompile(`"([A-Za-z0-9]+)"`)
	var keys []string
	for _, m := range re.FindAllStringSubmatch(body, -1) {
		keys = append(keys, m[1])
	}
	if len(keys) < 30 {
		// 解析失败（比如改成了从别处 import）时不能静默通过：那样这个测试就永远绿。
		t.Fatalf("只解析到 %d 个键，SYNCED_KEYS 的写法变了？请同步更新这个测试", len(keys))
	}
	return keys
}

// goFunctionBody 按大括号配对截出 Go 顶层函数的函数体。
func goFunctionBody(t *testing.T, src, signature string) string {
	t.Helper()
	at := strings.Index(src, signature)
	if at < 0 {
		t.Fatalf("源码里找不到 %s", signature)
	}
	open := strings.Index(src[at:], "{")
	if open < 0 {
		t.Fatalf("%s 没有函数体", signature)
	}
	open += at
	depth := 0
	for i := open; i < len(src); i++ {
		switch src[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return src[open : i+1]
			}
		}
	}
	t.Fatalf("%s 的大括号没有配对", signature)
	return ""
}

// applyPatchSwitchCases 返回 applyPatch 里**第一层** switch 的 case 键。
//
// 必须只取第一层：里面还有一个 `switch mode { case "off", "track", "album": }`
// —— 那是**值**的白名单，不是配置键，混进来会让「case 里有没有这个键」的判断失真。
func applyPatchSwitchCases(t *testing.T) map[string]bool {
	t.Helper()
	body := goFunctionBody(t, readRepoFile(t, "services.go"), "func applyPatch(")
	sw := strings.Index(body, "switch ")
	if sw < 0 {
		t.Fatal("applyPatch 里找不到 switch（实现方式变了？）")
	}
	open := strings.Index(body[sw:], "{")
	if open < 0 {
		t.Fatal("applyPatch 的 switch 没有函数体")
	}
	open += sw
	out := map[string]bool{}
	depth := 0
	for i := open; i < len(body); i++ {
		switch body[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return out
			}
		}
		if depth != 1 {
			continue // 嵌套 switch 里的 case 是「值」，跳过
		}
		if !strings.HasPrefix(body[i:], "case ") {
			continue
		}
		colon := strings.Index(body[i:], ":")
		if colon < 0 {
			continue
		}
		for _, m := range regexp.MustCompile(`"([A-Za-z0-9]+)"`).FindAllStringSubmatch(body[i:i+colon], -1) {
			out[m[1]] = true
		}
		i += colon
	}
	t.Fatal("applyPatch 的 switch 大括号没有配对")
	return nil
}

// configJSONTags 返回 bootstrap.Config 上所有 json 标签名。
func configJSONTags() map[string]bool {
	out := map[string]bool{}
	var walk func(rt reflect.Type)
	walk = func(rt reflect.Type) {
		for i := 0; i < rt.NumField(); i++ {
			f := rt.Field(i)
			if f.Anonymous && f.Type.Kind() == reflect.Struct {
				walk(f.Type)
			}
			name := strings.Split(f.Tag.Get("json"), ",")[0]
			if name == "" || name == "-" {
				continue
			}
			out[name] = true
		}
	}
	walk(reflect.TypeOf(bootstrap.Config{}))
	return out
}

func TestSyncedKeysAreAllHandledByApplyPatch(t *testing.T) {
	keys := parseSyncedKeys(t)
	handled := applyPatchSwitchCases(t)
	if len(handled) < 40 {
		t.Fatalf("applyPatch 只解析到 %d 个 case，解析逻辑可能失效（那这个测试就是假绿）", len(handled))
	}

	var missing []string
	for _, k := range keys {
		if !handled[k] {
			missing = append(missing, k)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		t.Fatalf("store.js#SYNCED_KEYS 里有 %d 个键在 applyPatch 里没有 case：%v\n"+
			"漏掉的后果：前端把它推上来、后端静默丢弃，用户改完设置重启发现变回去了。",
			len(missing), missing)
	}

	// 反向：applyPatch 处理了 Config 里不存在的键（打错字 / 字段已删）
	tags := configJSONTags()
	var orphans []string
	for k := range handled {
		if !tags[k] {
			orphans = append(orphans, k)
		}
	}
	if len(orphans) > 0 {
		sort.Strings(orphans)
		t.Errorf("applyPatch 处理了 Config 里没有的键（打错字或字段已删）：%v", orphans)
	}
}

func TestSyncKeysWhitelistItselfIsNonTrivial(t *testing.T) {
	// 防「测试空转」：SYNCED_KEYS 与 Config 的 json 标签必须有实质交集。
	keys := parseSyncedKeys(t)
	tags := configJSONTags()
	hits := 0
	for _, k := range keys {
		if tags[k] {
			hits++
		}
	}
	if hits*2 < len(keys) {
		t.Fatalf("SYNCED_KEYS 与 Config 的 json 标签只有 %d/%d 个对得上，检查一下解析逻辑", hits, len(keys))
	}
}

func TestApplyPatchSkinPerformanceMode(t *testing.T) {
	// 这一条是真跑逻辑，而不只是看源码：以前这个键根本没进 applyPatch，
	// 表现是「改完设置重启就变回 smooth」。
	cfg := bootstrap.DefaultConfig()
	if cfg.SkinPerformanceMode == "performance" {
		t.Fatal("默认值不该是 performance（否则这条测试证明不了什么）")
	}

	applyPatch(cfg, map[string]any{"skinPerformanceMode": "performance"})
	if cfg.SkinPerformanceMode != "performance" {
		t.Fatalf("applyPatch 没有落盘 skinPerformanceMode，实际 %q", cfg.SkinPerformanceMode)
	}

	// 非法值必须当场规范化（与 Load 时同一份白名单），不能存进去等下次启动才纠正
	applyPatch(cfg, map[string]any{"skinPerformanceMode": "turbo-9000"})
	if cfg.SkinPerformanceMode != "smooth" {
		t.Fatalf("非法档位应当当场落回 smooth，实际 %q", cfg.SkinPerformanceMode)
	}

	// 非字符串类型也不能把配置写坏
	applyPatch(cfg, map[string]any{"skinPerformanceMode": 123})
	if cfg.SkinPerformanceMode != "smooth" {
		t.Fatalf("非字符串应当落回 smooth，实际 %q", cfg.SkinPerformanceMode)
	}
}
