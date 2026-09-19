package library

import (
	"context"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"

	"localmusicplayer/internal/bootstrap"
)

// Watcher 监听音乐文件夹变化（需求 A2）。
//
// fsnotify 本身不递归，因此对每个子目录分别 Add，并在新建目录时动态补登记。
// 事件在 500ms 窗口内合并，避免大批量拷贝时反复触发增量扫描。
type Watcher struct {
	lib     *Manager
	fsw     *fsnotify.Watcher
	mu      sync.Mutex
	roots   []string
	watched map[string]bool // 已 Add 的目录
	pending map[string]bool // 待处理的变更路径
	timer   *time.Timer
	// started 表示事件循环已经跑起来。SetRoots 只能改监听根，**不会**启动循环；
	// 所以「后补监听」必须走 EnsureStarted，否则会出现「设置里显示在监听，
	// 实际一个事件都收不到」。
	started bool
	ctx     context.Context
	cancel  context.CancelFunc
	// done 在事件循环退出时被关闭。Stop() 用它确认「loop 已经不再碰 fsw」
	// 之后才替换实例，避免与运行中的 loop 构成数据竞争。
	done chan struct{}
}

// NewWatcher 创建监听器（不启动）
func NewWatcher(lib *Manager) (*Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &Watcher{
		lib:     lib,
		fsw:     fsw,
		watched: map[string]bool{},
		pending: map[string]bool{},
		ctx:     ctx,
		cancel:  cancel,
	}, nil
}

// Start 开始监听指定目录（重复调用不会起第二个循环）
func (w *Watcher) Start(roots []string) error {
	w.SetRoots(roots)
	w.mu.Lock()
	already := w.started
	w.started = true
	if !already {
		w.done = make(chan struct{})
	}
	done := w.done
	w.mu.Unlock()
	if !already {
		go w.loop(done)
	}
	return nil
}

// EnsureStarted 幂等地保证「循环已启动 + 监听根已更新」。
//
// 场景：应用启动那一刻没有音乐文件夹（或「实时监听」是关的），startWatchers
// 直接 return，Start 从未被调用；之后用户在设置里添加文件夹 / 打开监听时
// 只会走到 SetRoots —— 那样只会 fsw.Add，事件循环根本不存在，监听看起来是开的
// 却完全不工作。refreshWatcher 因此改走这个入口。
func (w *Watcher) EnsureStarted(roots []string) {
	w.SetRoots(roots)
	w.mu.Lock()
	already := w.started
	w.started = true
	if !already {
		w.done = make(chan struct{})
	}
	done := w.done
	w.mu.Unlock()
	if !already {
		go w.loop(done)
	}
}

// SetRoots 全量替换监听的根目录集合
func (w *Watcher) SetRoots(roots []string) {
	w.mu.Lock()
	w.roots = append([]string(nil), roots...)
	// 清空旧登记，简单可靠（目录数量级很小）。
	// fsw 在锁内取出：Stop() 会替换它，裸读会构成数据竞争。
	fsw := w.fsw
	for dir := range w.watched {
		if fsw != nil {
			_ = fsw.Remove(dir)
		}
		delete(w.watched, dir)
	}
	w.mu.Unlock()

	for _, root := range roots {
		w.addRecursive(root)
	}
}

// Stop 停止监听。
//
// ★ 必须把 started 重置为 false，并重建 context。
//
// 原实现只 cancel + Close，started 仍是 true，于是之后任何
// EnsureStarted / Start 都会因为 `already := w.started` 为真而**不启动
// 新的 loop** —— 结果就是「登记了一堆目录、界面显示正在监听、却一个事件都
// 收不到」的僵尸监听。stop 之后再 start 是合法用法（用户在设置里关掉再打开
// 「实时监听」），必须支持。
//
// ★ 并发要求：fsnotify 的 Close 会让 loop 里的 Events/Errors 通道关闭并退出。
// 但「关闭通道」与「loop 真的不再碰 w.fsw」之间没有先后保证 ——
// 直接在这里替换 w.fsw 会与仍在运行的 loop 构成数据竞争（go test -race 实测
// 报出过）。所以这里用 done 通道**等 loop 确认退出**之后再换实例。
func (w *Watcher) Stop() {
	w.mu.Lock()
	if w.cancel != nil {
		w.cancel()
	}
	// 取出旧实例与它的退出信号：后面要在锁外 Close 并等待
	old := w.fsw
	done := w.done
	w.done = nil
	w.started = false
	// 重建 ctx：让后续 EnsureStarted 能起一个可用的新循环
	w.ctx, w.cancel = context.WithCancel(context.Background())
	// 登记表属于旧实例，一并清掉
	w.watched = map[string]bool{}
	w.mu.Unlock()

	if old != nil {
		// Close 会让 Events/Errors 通道关闭，loop 随之退出
		_ = old.Close()
	}
	if done != nil {
		// 等 loop 真正退出，避免它在退出前还去读 w.fsw
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			// loop 卡住也不能永远阻塞 Stop（它可能从界面线程调用）
			log.Printf("[watcher] 等待事件循环退出超时，继续执行")
		}
	}

	// Close 之后 fsnotify 的 Add 会失败，所以必须换一个新的 watcher 实例，
	// 否则「停止后再启动」只会得到一堆 Add 失败、依然收不到事件。
	if fsw, err := fsnotify.NewWatcher(); err == nil {
		w.mu.Lock()
		w.fsw = fsw
		w.mu.Unlock()
	} else {
		log.Printf("[watcher] 重启监听失败: %v", err)
	}
}

// addRecursive 递归登记目录
func (w *Watcher) addRecursive(root string) {
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if d != nil && d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		name := d.Name()
		if path != root && (strings.HasPrefix(name, ".") || strings.HasPrefix(name, "$")) {
			return fs.SkipDir
		}
		w.add(path)
		return nil
	})
}

func (w *Watcher) add(dir string) {
	w.mu.Lock()
	if w.watched[dir] {
		w.mu.Unlock()
		return
	}
	fsw := w.fsw
	if fsw == nil {
		w.mu.Unlock()
		return
	}
	w.watched[dir] = true
	w.mu.Unlock()

	// 在锁外调用 Add（它内部可能阻塞）；即使期间 Stop 换了实例，
	// 这里操作的也是自己取到的那一个，不会踩到新实例。
	if err := fsw.Add(dir); err != nil {
		w.mu.Lock()
		delete(w.watched, dir)
		w.mu.Unlock()
	}
}

func (w *Watcher) remove(dir string) {
	w.mu.Lock()
	delete(w.watched, dir)
	fsw := w.fsw
	w.mu.Unlock()
	if fsw != nil {
		_ = fsw.Remove(dir)
	}
}

// loop 是事件循环。
//
// ★ 它把「自己这一代」的 fsnotify 实例与 context 在启动时**捕获成局部变量**，
// 之后不再读 w.fsw / w.ctx。原因是 Stop() 会替换这两个字段，
// 而 loop 可能还在收尾 —— 直接读字段就是数据竞争（go test -race 实测抓到过）。
// 局部捕获之后，旧 loop 只会操作旧实例，与新实例彻底隔离。
//
// done 在退出时关闭，供 Stop() 等待「这一代确实结束了」。
func (w *Watcher) loop(done chan struct{}) {
	if done != nil {
		defer close(done)
	}

	w.mu.Lock()
	fsw := w.fsw
	ctx := w.ctx
	w.mu.Unlock()
	if fsw == nil {
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-fsw.Events:
			if !ok {
				return
			}
			w.handle(event)
		case err, ok := <-fsw.Errors:
			if !ok {
				return
			}
			if err != nil {
				log.Printf("[watcher] %v", err)
			}
		}
	}
}

func (w *Watcher) handle(event fsnotify.Event) {
	// 目录被删除/改名：清理登记
	if event.Op&(fsnotify.Remove|fsnotify.Rename) != 0 {
		if _, err := os.Stat(event.Name); err != nil {
			w.remove(event.Name)
		}
	}

	// 新建目录：递归登记并立即扫一次
	if event.Op&fsnotify.Create != 0 {
		if st, err := os.Stat(event.Name); err == nil && st.IsDir() {
			w.addRecursive(event.Name)
			w.enqueue(event.Name)
			return
		}
	}

	// 只处理音频文件
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(event.Name), "."))
	if !bootstrap.IsAudioExt(ext) {
		return
	}

	// Write 事件可能只写了一半，交给防抖窗口统一处理
	if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Rename|fsnotify.Remove) != 0 {
		w.enqueue(event.Name)
	}
}

func (w *Watcher) enqueue(path string) {
	w.mu.Lock()
	w.pending[path] = true
	if w.timer != nil {
		w.timer.Stop()
	}
	w.timer = time.AfterFunc(500*time.Millisecond, w.flush)
	w.mu.Unlock()
}

func (w *Watcher) flush() {
	w.mu.Lock()
	paths := make([]string, 0, len(w.pending))
	for p := range w.pending {
		paths = append(paths, p)
	}
	w.pending = map[string]bool{}
	w.mu.Unlock()

	if len(paths) == 0 {
		return
	}
	if _, err := w.lib.RescanPaths(w.ctx, paths); err != nil {
		log.Printf("[watcher] 增量扫描失败: %v", err)
	}
}
