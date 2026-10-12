/* ==========================================================================
   walk_folder_test.go — 目录遍历：收集什么、状态怎么定
   --------------------------------------------------------------------------
   为什么单独测 walkFolder：它有两个**对外契约**，出错都不是崩溃而是静默错数据。

   ① 候选文件列表。漏一个文件 = 曲库里少一首歌；更糟的是 RescanPaths 会拿
      这份结果先删受影响目录的旧条目再写回 —— 少了就真的删掉了。
   ② 状态字符串。前端文件夹卡片（settings-view.js#foldersCard）按它出提示，
      两边的字面量必须一一对应。

   本文件覆盖：
     · 正常收集（音频扩展名 / 隐藏目录 / 非音频文件）
     · 扫描根不存在、扫描根不是目录
     · 扫描根读失败 → denied / error（以前一律吞成 ok）
     · 子目录读失败 → partial（结果可能不完整，必须让用户看见）
     · 指向祖先的目录链接 → 必须被剪掉，而不是无限递归

   Windows 上 junction 的行为（Lstat 型别是 ModeIrregular 而不是 ModeDir）
   另有一个带 build tag 的文件：walk_folder_junction_windows_test.go。
   ========================================================================== */

package library

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// errTooManyReads 是注入 readDir 的枚举上限报错：环没被剪掉时用它让用例
// 快速失败，而不是等 OOM 或超时（见两个「绕回的链接」用例）。
var errTooManyReads = errors.New("同一个目录被反复枚举 —— 目录链接的环没有被剪掉")

// writeFile 造一个内容无关紧要的文件（遍历只看扩展名与大小）。
func writeFile(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("建目录失败: %v", err)
	}
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatalf("写文件失败: %v", err)
	}
}

func TestWalkFolderCollectsAudioFiles(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "a.mp3"))
	writeFile(t, filepath.Join(root, "b.flac"))
	writeFile(t, filepath.Join(root, "cover.jpg")) // 非音频
	writeFile(t, filepath.Join(root, "sub", "c.wav"))
	writeFile(t, filepath.Join(root, ".git", "d.mp3")) // 隐藏目录
	writeFile(t, filepath.Join(root, "$RECYCLE.BIN", "e.mp3"))

	got, status := walkFolder(root)
	if status != statusOK {
		t.Fatalf("状态 = %q，期望 %q", status, statusOK)
	}
	want := []string{
		filepath.Join(root, "a.mp3"),
		filepath.Join(root, "b.flac"),
		filepath.Join(root, "sub", "c.wav"),
	}
	if len(got) != len(want) {
		t.Fatalf("收集到 %d 个候选 %v，期望 %d 个 %v", len(got), pathsOf(got), len(want), want)
	}
	for i, w := range want {
		if got[i].path != w {
			t.Errorf("第 %d 个候选 = %q，期望 %q", i, got[i].path, w)
		}
		if got[i].folder != root {
			t.Errorf("%q 的 folder = %q，期望扫描根 %q（文件夹曲目数按它归属）",
				got[i].path, got[i].folder, root)
		}
	}
}

// pathsOf 只取路径，便于在失败信息里读。
func pathsOf(cs []candidate) []string {
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = c.path
	}
	return out
}

func TestWalkFolderMissingRoot(t *testing.T) {
	dir := t.TempDir()

	// ① 路径不存在
	got, status := walkFolder(filepath.Join(dir, "nope"))
	if status != statusMissing {
		t.Errorf("不存在的路径：状态 = %q，期望 %q", status, statusMissing)
	}
	if got == nil {
		t.Error("候选列表必须是空切片而不是 nil（JSON 要序列化成 []）")
	}

	// ② 路径存在但是个文件
	file := filepath.Join(dir, "a.mp3")
	writeFile(t, file)
	if _, status := walkFolder(file); status != statusMissing {
		t.Errorf("把文件当扫描根：状态 = %q，期望 %q", status, statusMissing)
	}
}

// TestWalkFolderRootReadFailureIsNotSwallowed 扫描根本身读不了时，
// 状态必须报出去 —— 旧实现里这种情况同样是「0 首 + ok」，
// 而 Scan 会拿这份空结果整体替换该文件夹的歌（用户的目录就这样一首不剩）。
func TestWalkFolderRootReadFailureIsNotSwallowed(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "a.mp3"))

	cases := []struct {
		name string
		err  error
		want string
	}{
		{"无权限", &fs.PathError{Op: "open", Path: root, Err: fs.ErrPermission}, statusDenied},
		{"磁盘错误", &fs.PathError{Op: "open", Path: root, Err: errors.New("设备未就绪")}, statusError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, status := walkFolderWith(root, func(string) ([]fs.DirEntry, error) {
				return nil, tc.err
			})
			if status != tc.want {
				t.Errorf("状态 = %q，期望 %q（读失败不能被吞成 ok）", status, tc.want)
			}
		})
	}
}

// TestWalkFolderSubdirReadFailureIsPartial 一个子目录读不了：
// 其余部分照常收（不能因为一个目录坏掉就整次作废），但状态要降级成 partial。
func TestWalkFolderSubdirReadFailureIsPartial(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "a.mp3"))
	writeFile(t, filepath.Join(root, "ok", "b.mp3"))
	writeFile(t, filepath.Join(root, "broken", "c.mp3"))

	broken := filepath.Join(root, "broken")
	got, status := walkFolderWith(root, func(dir string) ([]fs.DirEntry, error) {
		if dir == broken {
			return nil, &fs.PathError{Op: "open", Path: dir, Err: errors.New("网络盘断开")}
		}
		return os.ReadDir(dir)
	})

	if status != statusPartial {
		t.Errorf("状态 = %q，期望 %q（结果可能不完整必须让用户看见）", status, statusPartial)
	}
	if len(got) != 2 {
		t.Errorf("候选 = %v，期望 root/a.mp3 与 root/ok/b.mp3 都在（只有 broken 该被跳过）", pathsOf(got))
	}
	for _, c := range got {
		if strings.Contains(c.path, "broken") {
			t.Errorf("读不了的子目录不该产出候选：%s", c.path)
		}
	}
}

// TestWalkFolderLoopingLinkIsCut 指向祖先的目录链接必须被剪掉。
//
// 为什么这不是洁癖：旧实现用 WalkDir + IsDir() 作门槛，链接根本不会被下钻，
// 所以「环」是**无害地漏掉**；一旦开始解引用链接，环就变成无限递归 ——
// 扫描线程再也回不来。这里给注入的 readDir 加一个枚举次数上限，
// 万一环没被剪掉，用例会以「同一个目录被枚举了太多次」失败，而不是把机器拖死。
func TestWalkFolderLoopingLinkIsCut(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "a.mp3"))
	writeFile(t, filepath.Join(root, "sub", "b.mp3"))

	// root/self -> root
	self := filepath.Join(root, "self")
	if err := os.Symlink(root, self); err != nil {
		t.Skipf("本机不能创建符号链接（Windows 需要开发者模式或管理员）: %v", err)
	}

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
		t.Errorf("候选 = %v，期望恰好 root/a.mp3 与 root/sub/b.mp3（绕回的链接不该重复收录）", pathsOf(got))
	}
	if calls > 5 {
		t.Errorf("枚举了 %d 次目录，期望 3 次以内 —— 绕回的链接被走进了", calls)
	}
}

// TestWalkFolderSymlinkedFileIsNotCollected 记录一条**有意保留**的行为：
// 指向音频文件的符号链接不收。理由是同一个文件会以两个路径进库
// （同一首歌出现两次、播放进度与歌单各记一份）。目录链接已经修好了
// （见 junction 用例），文件链接留待单独评估。
func TestWalkFolderSymlinkedFileIsNotCollected(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "real")
	writeFile(t, filepath.Join(real, "a.mp3"))
	link := filepath.Join(dir, "link.mp3")
	if err := os.Symlink(filepath.Join(real, "a.mp3"), link); err != nil {
		t.Skipf("本机不能创建符号链接: %v", err)
	}

	got, status := walkFolder(real)
	if status != statusOK || len(got) != 1 {
		t.Fatalf("用例前提不成立：状态=%q 候选=%v", status, pathsOf(got))
	}
	if _, status := walkFolder(filepath.Dir(link)); status != statusOK {
		// dir 下的 real/ 会被正常收，link.mp3 不该收
		t.Fatalf("状态 = %q，期望 %q", status, statusOK)
	}
	up, _ := walkFolder(dir)
	for _, c := range up {
		if c.path == link {
			t.Errorf("指向音频文件的符号链接被收录了：%s（有意保留的行为是跳过）", link)
		}
	}
}

// TestWatcherRegistersSubdirs 监听器要登记所有子目录（含非隐藏的普通目录）。
func TestWatcherRegistersSubdirs(t *testing.T) {
	lib, _, _ := newTestManager(t)
	w, err := NewWatcher(lib)
	if err != nil {
		t.Fatalf("创建监听器失败: %v", err)
	}
	defer w.Stop()

	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "sub", "deep"), 0o755); err != nil {
		t.Fatalf("建目录失败: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".hidden"), 0o755); err != nil {
		t.Fatalf("建目录失败: %v", err)
	}

	w.addRecursive(root)

	w.mu.Lock()
	watched := make([]string, 0, len(w.watched))
	for dir := range w.watched {
		watched = append(watched, dir)
	}
	w.mu.Unlock()

	for _, want := range []string{root, filepath.Join(root, "sub"), filepath.Join(root, "sub", "deep")} {
		if !contains(watched, want) {
			t.Errorf("目录没有被登记监听：%s（实际登记 %v）", want, watched)
		}
	}
	if contains(watched, filepath.Join(root, ".hidden")) {
		t.Errorf("隐藏目录不该被登记：%v", watched)
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
