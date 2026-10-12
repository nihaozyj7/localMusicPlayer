package main

/* --------------------------------------------------------------------------
   atomic_flags_test.go — 「只写不读的原子量」守卫

   这一类缺陷在第六轮审查 §4.3 里被点名：`WindowService` 上曾有
   `mainGeomUserTouched` / `mainGeomSelfMove` / `mainGeomTrackingReady` 三个
   `atomic.Bool`，各自被 `Store` 写过，而**没有任何地方读**。它们的注释还在
   认真地解释「这个标志决定启动时要不要恢复最大化」—— 读代码的人会以为那条
   判断起作用，实际它早就被另一个机制（启动期间的门）取代、只剩写入。

   删掉容易，重新长出来更容易：给结构体加个 `atomic.Bool`、在某处 `Store(true)`、
   忘了写读取方，编译器与 lint 都不会说话（写一个没人看的标志是合法的 Go）。
   所以这里把它变成机械检查：**根包里凡是声明成 `atomic.*` 的结构体字段，
   必须至少被读过一次**（Load / Swap / CompareAndSwap / Add 都算读）。

   只扫根包而不是全仓：`internal/loudness` 里有 `m.Store(song, res)` 这种
   自定义类型的同名方法，全仓按名字匹配会误报。根包正是这类窗口/启动标志的
   聚居地（也是这条缺陷的来源），把范围写明比放宽规则更有用。
   -------------------------------------------------------------------------- */

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// atomicFieldDecl 匹配结构体里的原子字段声明，例如 `mainGeomUserTouched atomic.Bool`。
var atomicFieldDecl = regexp.MustCompile(`(?m)^\s*([A-Za-z_]\w*)\s+atomic\.[A-Za-z]+\s*$`)

func TestNoWriteOnlyAtomicFields(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("读根目录失败: %v", err)
	}

	type usage struct {
		writes int
		reads  int
	}
	sources := map[string]string{}
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(".", name))
		if err != nil {
			t.Fatalf("读 %s 失败: %v", name, err)
		}
		sources[name] = string(b)
	}
	if len(sources) == 0 {
		t.Fatal("没有读到任何 .go 源文件 —— 守卫失效了")
	}

	// ① 收集「声明成 atomic.* 的字段名」及其所在文件
	fields := map[string]string{}
	for name, src := range sources {
		for _, m := range atomicFieldDecl.FindAllStringSubmatch(src, -1) {
			fields[m[1]] = name
		}
	}
	if len(fields) == 0 {
		t.Fatal("没有扫到任何 atomic 字段 —— 声明写法变了？守卫失效了")
	}

	// ② 统计每个字段的读写次数
	used := map[string]*usage{}
	for f := range fields {
		used[f] = &usage{}
	}
	for _, src := range sources {
		for f := range fields {
			re := regexp.MustCompile(`\b` + regexp.QuoteMeta(f) + `\.(Store|Load|Swap|CompareAndSwap|Add)\(`)
			for _, m := range re.FindAllStringSubmatch(src, -1) {
				if m[1] == "Store" {
					used[f].writes++
				} else {
					used[f].reads++
				}
			}
		}
	}

	var dead []string
	for f, u := range used {
		if u.writes > 0 && u.reads == 0 {
			dead = append(dead, f+"（声明于 "+fields[f]+"，写了 "+strconv.Itoa(u.writes)+" 次、读了 0 次）")
		}
	}
	if len(dead) > 0 {
		t.Errorf(
			"以下原子字段只写不读（等于什么都没做，但注释会让人以为它在起作用）：\n  %s\n"+
				"要么补上读取方，要么连同写入方一起删掉。",
			strings.Join(dead, "\n  "),
		)
	}
}
