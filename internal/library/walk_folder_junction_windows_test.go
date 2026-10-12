//go:build windows

/* ==========================================================================
   walk_folder_junction_windows_test.go — Windows 目录联接（junction）
   --------------------------------------------------------------------------
   为什么单独一个带 build tag 的文件：junction 是 Windows 独有的重解析点，
   而它的**Lstat 型别是 ModeIrregular**（既不是 ModeDir 也不是 regular）——
   这正是「junction 根静默 0 首」的成因。实测数据（`go run` 探针）：

     os.Lstat(junction).IsDir()  = false   ← 旧实现的门槛就看这个
     os.Lstat(junction).Mode()   = ?---------（ModeIrregular）
     os.Stat(junction).IsDir()   = true    ← 解引用之后才知道它是目录
     os.ReadDir(junction)        = 正常列出目标目录的内容
     filepath.WalkDir(junction)  = 只回调 1 次（根），dir=false regular=false
     filepath.EvalSymlinks(junction) = **原样返回链接路径**（不解析 junction！）
     os.SameFile(junction, 目标) = true

   最后两条决定了实现方式：不能靠 EvalSymlinks 去重，必须用 os.SameFile
   做身份比较（见 library.go#linkLoopsBack）。

   用 `cmd /c mklink /J` 造链接而不是 os.Symlink：前者普通用户就能做，
   后者需要开发者模式或管理员（实测本机报 "A required privilege is not held"）。
   ========================================================================== */

package library

import (
	"context"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"localmusicplayer/internal/bootstrap"
)

// makeJunction 造一个目录联接；失败则跳过（不是所有环境都允许）。
func makeJunction(t *testing.T, link, target string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		t.Fatalf("建目录失败: %v", err)
	}
	out, err := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput()
	if err != nil {
		t.Skipf("本机不能创建目录联接（mklink /J）: %v %s", err, out)
	}
}

// TestWalkFolderJunctionRootIsNotZeroSongs 把 junction 当扫描根。
//
// 修复前的实测结果：**0 首 + 状态 ok**（界面只显示「一首歌都没有」，不报错）。
func TestWalkFolderJunctionRootIsNotZeroSongs(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "real")
	writeFile(t, filepath.Join(real, "a.mp3"))
	writeFile(t, filepath.Join(real, "sub", "b.flac"))

	link := filepath.Join(dir, "link")
	makeJunction(t, link, real)

	got, status := walkFolder(link)
	if status != statusOK {
		t.Fatalf("状态 = %q，期望 %q", status, statusOK)
	}
	if len(got) != 2 {
		t.Fatalf("链接根下收集到 %d 个候选 %v，期望 2 个 —— 这就是「junction 静默 0 首」",
			len(got), pathsOf(got))
	}
	// 路径必须写成**链接路径**（而不是链接目标）：文件夹曲目数按
	// isUnder(song.Path, folder.Path) 统计，写成目标路径会让这个扫描根显示 0 首。
	for _, c := range got {
		if !filepath.IsAbs(c.path) {
			t.Errorf("候选路径不是绝对路径：%s", c.path)
		}
		if rel, err := filepath.Rel(link, c.path); err != nil || rel == ".." ||
			strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			t.Errorf("候选 %s 不在扫描根的路径前缀下（相对 %s = %q）", c.path, link, rel)
		}
		if c.folder != link {
			t.Errorf("folder = %q，期望链接路径 %q", c.folder, link)
		}
	}
}

// TestWalkFolderJunctionSubdirIsTraversed 扫描根里面的一个 junction
// 指向**根之外**的目录：那个目录里的歌必须被收进来（旧实现会整棵跳过）。
func TestWalkFolderJunctionSubdirIsTraversed(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "root")
	outside := filepath.Join(dir, "outside")
	writeFile(t, filepath.Join(root, "a.mp3"))
	writeFile(t, filepath.Join(outside, "b.mp3"))

	link := filepath.Join(root, "linked-albums")
	makeJunction(t, link, outside)

	got, status := walkFolder(root)
	if status != statusOK {
		t.Fatalf("状态 = %q，期望 %q", status, statusOK)
	}
	bPath := filepath.Join(link, "b.mp3")
	if !contains(pathsOf(got), bPath) {
		t.Errorf("链接目标里的歌没有被收进来：候选 = %v，期望包含 %s", pathsOf(got), bPath)
	}
}

// TestWalkFolderJunctionLoopIsCut root/self -> root。
//
// 必须被剪掉：解引用之后继续下钻就是无限递归（扫描线程再也回不来）。
// 注入的 readDir 带枚举次数上限，环没剪掉时用例会以「同一个目录被反复枚举」失败，
// 而不是把测试机拖死。
func TestWalkFolderJunctionLoopIsCut(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "a.mp3"))
	writeFile(t, filepath.Join(root, "sub", "b.mp3"))
	makeJunction(t, filepath.Join(root, "self"), root)

	calls := 0
	const maxCalls = 20
	got, status := walkFolderWith(root, func(dir string) ([]fs.DirEntry, error) {
		calls++
		if calls > maxCalls {
			return nil, errTooManyReads
		}
		return os.ReadDir(dir)
	})
	if status != statusOK {
		t.Fatalf("状态 = %q，期望 %q（calls=%d）", status, statusOK, calls)
	}
	if len(got) != 2 {
		t.Errorf("候选 = %v，期望恰好 2 个（绕回的链接不该重复收录）", pathsOf(got))
	}
	if calls > 5 {
		t.Errorf("枚举了 %d 次目录，期望 3 次以内 —— 绕回的目录联接被走进了", calls)
	}
}

// TestWalkFolderJunctionInsideRootIsNotScannedTwice 扫描根**内部**的目录联接
// 指向同一个根里的另一个目录（`root\A` 与 `root\linkA -> root\A`）。
//
// ★ 第六轮审查 N-5：修复前这种情况整棵被跳过（`IsDir()` 门槛），第 7 条修复开始
// 解引用之后，同一批歌会以**两个路径各进库一次** —— 同一首歌两条记录，路径不同、
// StableID 也不同。判据是「链接目标是否落在本次扫描根之下」，与遍历顺序无关。
func TestWalkFolderJunctionInsideRootIsNotScannedTwice(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "A", "a.mp3"))
	writeFile(t, filepath.Join(root, "A", "sub", "b.mp3"))
	makeJunction(t, filepath.Join(root, "linkA"), filepath.Join(root, "A"))

	got, status := walkFolder(root)
	if status != statusOK {
		t.Fatalf("状态 = %q，期望 %q", status, statusOK)
	}
	if len(got) != 2 {
		t.Fatalf("收集到 %d 个候选 %v，期望 2 个 —— 树内链接让同一批歌各进库一次",
			len(got), pathsOf(got))
	}
	// 歌必须记在**真实目录**那条路径上，而不是链接路径：链接删掉之后歌不该消失。
	for _, c := range got {
		if rel, err := filepath.Rel(filepath.Join(root, "linkA"), c.path); err == nil &&
			rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			t.Errorf("候选 %s 记在了链接路径下（应记在真实目录 %s 下）", c.path, filepath.Join(root, "A"))
		}
	}
}

// TestRescanPathsThroughInsideRootLinkKeepsTargetPath 增量重扫的同一个入口。
//
// 监听按**文件路径**入队，增量重扫扫的是「文件所在目录」而不是整个扫描根
// （刻意的性能取舍）。事件名带着链接路径时（`root\linkA\sub\b.mp3`），
// 重扫会以链接路径再收一次歌 —— 与全量扫描是同一条不变量。
func TestRescanPathsThroughInsideRootLinkKeepsTargetPath(t *testing.T) {
	m, store, _ := newTestManager(t)
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "A"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeWAV(t, filepath.Join(root, "A", "a.wav"), 1)
	makeJunction(t, filepath.Join(root, "linkA"), filepath.Join(root, "A"))

	if err := store.Update(func(c *bootstrap.Config) {
		c.Folders = []bootstrap.Folder{{ID: "f1", Path: root}}
	}); err != nil {
		t.Fatal(err)
	}
	m = NewManager(store)
	if _, err := m.Scan(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if n := len(m.Songs()); n != 1 {
		t.Fatalf("首次扫描后应有 1 首，实际 %d：%v", n, songPaths(m))
	}

	// 模拟监听：事件名带链接路径
	throughLink := filepath.Join(root, "linkA", "a.wav")
	if _, err := m.RescanPaths(context.Background(), []string{throughLink}); err != nil {
		t.Fatalf("增量扫描失败: %v", err)
	}
	if n := len(m.Songs()); n != 1 {
		t.Fatalf("增量重扫后应有 1 首，实际 %d：%v —— 树内链接让同一首歌多出一条", n, songPaths(m))
	}
	for _, s := range m.Songs() {
		if rel, err := filepath.Rel(filepath.Join(root, "linkA"), s.Path); err == nil &&
			rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			t.Errorf("曲目路径 %s 记到了链接路径下（应记在 %s 下）", s.Path, filepath.Join(root, "A"))
		}
	}
}

// songPaths 把当前曲库路径排成切片，仅用于失败信息。
func songPaths(m *Manager) []string {
	songs := m.Songs()
	out := make([]string, 0, len(songs))
	for _, s := range songs {
		out = append(out, s.Path)
	}
	return out
}

// TestWatcherRegistersJunctionSubdir 监听侧同一类修复：
// 目录联接必须被登记，否则它里面的文件改了不会触发重扫。
func TestWatcherRegistersJunctionSubdir(t *testing.T) {
	lib, _, _ := newTestManager(t)
	w, err := NewWatcher(lib)
	if err != nil {
		t.Fatalf("创建监听器失败: %v", err)
	}
	defer w.Stop()

	dir := t.TempDir()
	root := filepath.Join(dir, "root")
	outside := filepath.Join(dir, "outside")
	if err := os.MkdirAll(outside, 0o755); err != nil {
		t.Fatalf("建目录失败: %v", err)
	}
	link := filepath.Join(root, "linked")
	makeJunction(t, link, outside)

	w.addRecursive(root)

	w.mu.Lock()
	_, ok := w.watched[link]
	w.mu.Unlock()
	if !ok {
		t.Errorf("目录联接没有被登记监听：%s（旧实现用 IsDir() 作门槛，会整棵跳过）", link)
	}
}
