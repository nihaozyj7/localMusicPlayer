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

	"musicplayer/internal/bootstrap"
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
	ctx     context.Context
	cancel  context.CancelFunc
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

// Start 开始监听指定目录
func (w *Watcher) Start(roots []string) error {
	w.SetRoots(roots)
	go w.loop()
	return nil
}

// SetRoots 全量替换监听的根目录集合
func (w *Watcher) SetRoots(roots []string) {
	w.mu.Lock()
	w.roots = append([]string(nil), roots...)
	// 清空旧登记，简单可靠（目录数量级很小）
	for dir := range w.watched {
		_ = w.fsw.Remove(dir)
		delete(w.watched, dir)
	}
	w.mu.Unlock()

	for _, root := range roots {
		w.addRecursive(root)
	}
}

// Stop 停止监听
func (w *Watcher) Stop() {
	w.cancel()
	_ = w.fsw.Close()
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
	w.watched[dir] = true
	w.mu.Unlock()

	if err := w.fsw.Add(dir); err != nil {
		w.mu.Lock()
		delete(w.watched, dir)
		w.mu.Unlock()
	}
}

func (w *Watcher) remove(dir string) {
	w.mu.Lock()
	delete(w.watched, dir)
	w.mu.Unlock()
	_ = w.fsw.Remove(dir)
}

func (w *Watcher) loop() {
	for {
		select {
		case <-w.ctx.Done():
			return
		case event, ok := <-w.fsw.Events:
			if !ok {
				return
			}
			w.handle(event)
		case err, ok := <-w.fsw.Errors:
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
