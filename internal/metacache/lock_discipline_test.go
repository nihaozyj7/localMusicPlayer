package metacache

/* --------------------------------------------------------------------------
   lock_discipline_test.go — 「删缓存文件必须在锁外」的机械守卫

   这条约定靠人眼看不出来：`defer s.mu.Unlock()` 写在函数开头，而删文件在函数
   结尾 —— 中间隔着几十行，读代码时很容易以为早就解锁了。第六轮审查 §4.2 抓到的
   正是这个：`RemoveCover` 的注释白纸黑字写着「所以放在锁外」，实现却因为开头那句
   defer 而把删除做在锁内，于是**每一次封面删除都会让所有封面读取等这次磁盘操作**。
   注释能被信任这件事在这个仓库里是硬需求（很多设计取舍只写在注释里），所以这里
   用源码扫描把这条约定变成会失败的用例，而不是靠下一次审查再抓一遍。
   -------------------------------------------------------------------------- */

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// goFunc 是一段「从 func 关键字起到下一个顶层 func 之前」的源码。
type goFunc struct {
	name string
	body string
}

// splitTopLevelFuncs 按顶层 `func ` 起头切分源码（够本包使用：
// store.go 里没有嵌套函数字面量跨行定义）。
func splitTopLevelFuncs(src string) []goFunc {
	var out []goFunc
	lines := strings.Split(src, "\n")
	var cur *goFunc
	for _, line := range lines {
		if strings.HasPrefix(line, "func ") {
			name := strings.TrimSpace(strings.TrimPrefix(line, "func "))
			name = strings.TrimSuffix(strings.TrimSpace(name), "{")
			out = append(out, goFunc{name: strings.TrimSpace(name)})
			cur = &out[len(out)-1]
			continue
		}
		if cur != nil {
			cur.body += line + "\n"
		}
	}
	return out
}

func TestCoverFileDeletionIsOutsideLock(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("取不到本测试文件路径")
	}
	dir := filepath.Dir(thisFile)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("读包目录失败: %v", err)
	}

	scanned := 0
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		src, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatalf("读 %s 失败: %v", name, err)
		}
		for _, fn := range splitTopLevelFuncs(string(src)) {
			idxRemove := strings.Index(fn.body, "os.Remove")
			if idxRemove < 0 {
				continue
			}
			scanned++
			idxLock := strings.Index(fn.body, "s.mu.Lock()")
			if idxLock < 0 {
				continue // 不碰 Store 锁的函数（纯文件操作），无约束
			}
			if strings.Contains(fn.body, "defer s.mu.Unlock()") {
				t.Errorf(
					"%s/%s：同一个函数里既 `defer s.mu.Unlock()` 又调 os.Remove —— "+
						"删除会一直持锁到函数返回（这正是这里注释说「放在锁外」却实现成锁内的原因）；"+
						"请像 DeleteCover 那样显式 Unlock 之后再删",
					name, fn.name,
				)
				continue
			}
			idxUnlock := strings.Index(fn.body, "s.mu.Unlock()")
			if idxUnlock < 0 || idxUnlock > idxRemove {
				t.Errorf(
					"%s/%s：os.Remove 出现在 s.mu.Unlock() 之前（或根本没有显式解锁）—— "+
						"注释承诺「放在锁外」，实现必须真的在锁外",
					name, fn.name,
				)
			}
		}
	}

	if scanned == 0 {
		t.Fatal("没有扫到任何删文件的函数 —— 守卫失效了（是不是把 os.Remove 挪走了？）")
	}
}
