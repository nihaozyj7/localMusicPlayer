package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"localmusicplayer/internal/bilibili"
	"localmusicplayer/internal/bootstrap"
)

// DownloadService 把在线歌曲保存到本地。
//
// 为什么下载要放到后端而不是前端 <a download>：
//  1. 下载目录要可配置（默认是系统「音乐」目录下的 downloads），只有 Go 侧知道真实路径；
//  2. 前端 <a download> 受同源/重定向限制，且无法反馈「存到哪了」「下了多少」；
//  3. 后端可以直接复用音频流解析（bilibili.ResolveAudio），写入目标目录时还能
//     做重名处理与「临时文件 + 原子改名」（中途失败不会留下半个文件）。
type DownloadService struct {
	store *bootstrap.Store
	// client 与在线搜索共用同一个 bilibili 客户端，才能复用它缓存的 WBI 密钥。
	client *bilibili.Client
	app    *application.App

	// emitFn 由 main 注入（与 LibraryService 一致，避免服务直接依赖应用生命周期）
	emitFn func(string, any)

	// onDirChanged 下载目录变化后通知曲库重载文件夹并重扫（main 注入）
	onDirChanged func()

	mu      sync.Mutex
	running map[string]bool
	// tasks 是「下载任务面板」的真相来源：每一次下载都留一条快照，
	// 前端按钮的显隐、面板里的进度与结果全部从它读，而不是各自维护一份。
	tasks []*DownloadTask
	// seq 给任务生成稳定且唯一的 id（同一首歌先后下载两次是两条任务）。
	seq int
	// onFileAdded 下载成功后的回调（把新文件纳入曲库）。由主程序注入。
	onFileAdded func(path string)
}

// 下载任务状态。
const (
	DownloadRunning = "running"
	DownloadDone    = "done"
	DownloadFailed  = "failed"
)

// maxFinishedTasks 面板里最多保留多少条**已结束**的任务。
//
// 只保留已结束的：正在下载的任务永远不会被挤掉，否则用户会看到
// 「下到一半的那条突然消失」。
const maxFinishedTasks = 50

// DownloadTask 一个下载任务的快照。
//
// 为什么要有一个独立的任务结构（而不是只看 running 集合）：
//  1. 标题栏按钮要「有任务才显示」，而 running 集合在下载结束的瞬间就空了，
//     用户还没看到「已完成」就什么也没有了；
//  2. 面板要显示进度、大小、目标路径与失败原因，这些都不属于「正在下载」这一状态。
type DownloadTask struct {
	ID    string `json:"id"`
	BVID  string `json:"bvid"`
	Title string `json:"title"`
	// State running | done | failed
	State string `json:"state"`
	// Done/Total 已写入 / 总字节数；总长未知时 Total 为 0。
	Done  int64 `json:"done"`
	Total int64 `json:"total"`
	// Path 落盘后的完整路径（成功后才有），Dir 是下载目录。
	Path string `json:"path"`
	Dir  string `json:"dir"`
	// Message 失败原因（成功时为空）。
	Message    string `json:"message"`
	DurationMS int64  `json:"duration"`
	StartedAt  int64  `json:"startedAt"`
	FinishedAt int64  `json:"finishedAt"`
}

// NewDownloadService 构造服务。
func NewDownloadService(store *bootstrap.Store, client *bilibili.Client) *DownloadService {
	return &DownloadService{
		store:   store,
		client:  client,
		running: map[string]bool{},
		tasks:   []*DownloadTask{},
	}
}

// setEmitter 注入事件发送函数（main 在创建应用后调用）。
//
// 故意不导出：Wails 会把服务的所有导出方法生成到前端绑定里，
// 而这个方法的入参是函数，走 JSON 序列化一定会失败（生成绑定时会告警）。
// setOnFileAdded 注册「下载成功」回调（主程序用它把新文件纳入曲库）
func (s *DownloadService) setOnFileAdded(fn func(path string)) {
	s.mu.Lock()
	s.onFileAdded = fn
	s.mu.Unlock()
}

func (s *DownloadService) setEmitter(fn func(string, any)) {
	s.emitFn = fn
}

func (s *DownloadService) emit(name string, payload any) {
	if s.emitFn != nil {
		s.emitFn(name, payload)
	}
}

// Dir 返回当前下载目录（并确保它存在）。
func (s *DownloadService) Dir() (string, error) {
	dir := bootstrap.ExpandPath(s.store.Get().DownloadDir)
	if strings.TrimSpace(dir) == "" {
		dir = bootstrap.DefaultDownloadDir()
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("创建下载目录失败: %w", err)
	}
	return dir, nil
}

// PickDir 弹出系统目录选择器，**先不写入配置**，把决定权留给用户。
//
// 为什么不在选完目录就直接改：用户要求「更改下载路径时提示是否把已下载的歌曲
// 迁移过去」。所以这里只返回候选目录与现状统计，由前端弹确认框，用户选完再调
// ApplyDir（含是否迁移）。
// 用户取消选择时返回 cancelled=true。
func (s *DownloadService) PickDir() (map[string]any, error) {
	if s.app == nil {
		return nil, errors.New("当前环境不支持系统目录选择器")
	}
	selected, err := s.app.Dialog.OpenFile().
		SetTitle("选择下载保存位置").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(true).
		PromptForSingleSelection()
	if err != nil {
		return nil, fmt.Errorf("打开目录选择器失败: %w", err)
	}
	if strings.TrimSpace(selected) == "" {
		return map[string]any{"cancelled": true}, nil
	}
	return s.dirChangeProposal(selected), nil
}

// SetDir 直接指定下载目录（手动输入路径 / 恢复默认）。同样只返回提案，不落盘。
func (s *DownloadService) SetDir(dir string) (map[string]any, error) {
	clean := bootstrap.ExpandPath(dir)
	if strings.TrimSpace(clean) == "" {
		return nil, errors.New("目录不能为空")
	}
	return s.dirChangeProposal(clean), nil
}

// dirChangeProposal 汇总「换到新目录」这件事的全部信息，交给前端弹确认框。
func (s *DownloadService) dirChangeProposal(next string) map[string]any {
	current, _ := s.Dir()
	count, size := dirMusicStats(current)
	nextCount, _ := dirMusicStats(next)
	same := samePath(current, next)
	return map[string]any{
		"cancelled": false,
		"current":   current,
		"next":      next,
		"same":      same,
		"count":     count,
		"bytes":     size,
		"nextCount": nextCount,
	}
}

// ApplyDir 真正应用新的下载目录；migrate=true 时把已有文件搬过去。
//
// 返回 {dir, migrated, failed, skipped}：
//   - migrated 成功搬走的文件数；
//   - skipped  目标目录已存在同名文件（不覆盖，保留原文件）；
//   - failed   迁移失败的文件名。
//
// 无论迁移结果如何，目录本身一定会切换成功 —— 迁移失败不该阻止用户改设置。
func (s *DownloadService) ApplyDir(dir string, migrate bool) (map[string]any, error) {
	clean := bootstrap.ExpandPath(dir)
	if strings.TrimSpace(clean) == "" {
		return nil, errors.New("目录不能为空")
	}
	if err := os.MkdirAll(clean, 0o755); err != nil {
		return nil, fmt.Errorf("目录不可用: %w", err)
	}

	current, _ := s.Dir()
	result := map[string]any{"dir": clean, "migrated": 0, "skipped": 0, "failed": []string{}}

	if migrate && !samePath(current, clean) {
		moved, skipped, failed := migrateDir(current, clean)
		result["migrated"] = moved
		result["skipped"] = skipped
		result["failed"] = failed
	}

	if err := s.store.Update(func(c *bootstrap.Config) {
		c.DownloadDir = clean
	}); err != nil {
		return nil, err
	}
	// 新目录要立刻进入扫描范围（EffectiveFolders 会把它算进去），
	// 并且搬过去的歌要能被曲库看到 —— 所以通知曲库重载文件夹并重扫。
	s.notifyDirChanged()
	return result, nil
}

// notifyDirChanged 让曲库重新读取文件夹列表并重扫。
//
// 用回调而不是直接依赖 library.Manager：DownloadService 只负责下载，
// 曲库的扫描时机由 main 装配时决定（也方便测试里不接回调）。
func (s *DownloadService) notifyDirChanged() {
	if s.onDirChanged != nil {
		s.onDirChanged()
	}
}

// OpenDir 在系统文件管理器里打开下载目录。
func (s *DownloadService) OpenDir(path string) error {
	target := strings.TrimSpace(path)
	if target == "" {
		dir, err := s.Dir()
		if err != nil {
			return err
		}
		target = dir
	}
	if st, err := os.Stat(target); err != nil || !st.IsDir() {
		target = filepath.Dir(target)
	}
	return revealPath(target)
}

// Start 开始下载一首在线歌曲（异步）。
//
// 立即返回 started=true；进度与结果通过 download:progress / download:done /
// download:failed 事件推送，与扫描的交互方式保持一致。
func (s *DownloadService) Start(bvid, title string, durationMS int64) (map[string]any, error) {
	bvid = strings.TrimSpace(bvid)
	if bvid == "" {
		return nil, errors.New("缺少视频 id")
	}

	dir, err := s.Dir()
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	if s.running[bvid] {
		s.mu.Unlock()
		return map[string]any{"started": false, "reason": "already-running"}, nil
	}
	s.running[bvid] = true
	task := s.newTaskLocked(bvid, title, dir, durationMS)
	s.mu.Unlock()
	s.emitTasks()

	// 先解析出文件名（同时确认这首歌确实能取到音频流），解析失败就直接报错，
	// 不要先给用户一个「开始下载」再失败。
	go s.run(task.ID, bvid, title, durationMS, dir)

	s.mu.Lock()
	snap := *task
	s.mu.Unlock()
	return map[string]any{"started": true, "dir": dir, "task": snap}, nil
}

/* --------------------------------------------------------------------------
   下载任务面板
   -------------------------------------------------------------------------- */

// newTaskLocked 创建一条任务并加入列表（调用方必须已经持有 s.mu）。
func (s *DownloadService) newTaskLocked(bvid, title, dir string, durationMS int64) *DownloadTask {
	s.seq++
	task := &DownloadTask{
		ID:         fmt.Sprintf("%s-%d", bvid, s.seq),
		BVID:       bvid,
		Title:      strings.TrimSpace(title),
		State:      DownloadRunning,
		Dir:        dir,
		DurationMS: durationMS,
		StartedAt:  time.Now().UnixMilli(),
	}
	if task.Title == "" {
		task.Title = bvid
	}
	s.tasks = append(s.tasks, task)
	return task
}

// Tasks 返回全部下载任务（前端面板打开时先拉一次，之后靠事件增量刷新）。
func (s *DownloadService) Tasks() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.tasksLocked()
}

func (s *DownloadService) tasksLocked() map[string]any {
	out := make([]DownloadTask, 0, len(s.tasks))
	active := 0
	for _, t := range s.tasks {
		out = append(out, *t)
		if t.State == DownloadRunning {
			active++
		}
	}
	return map[string]any{"tasks": out, "active": active}
}

// ClearFinished 只清掉已结束（成功/失败）的任务，正在下载的不动。
func (s *DownloadService) ClearFinished() map[string]any {
	s.mu.Lock()
	kept := make([]*DownloadTask, 0, len(s.tasks))
	for _, t := range s.tasks {
		if t.State == DownloadRunning {
			kept = append(kept, t)
		}
	}
	s.tasks = kept
	snapshot := s.tasksLocked()
	s.mu.Unlock()
	s.emit("download:tasks", snapshot)
	return snapshot
}

// updateTask 修改一条任务并广播新快照。
func (s *DownloadService) updateTask(id string, fn func(*DownloadTask)) {
	s.mu.Lock()
	found := false
	for _, t := range s.tasks {
		if t.ID == id {
			fn(t)
			found = true
			break
		}
	}
	if found {
		s.trimFinishedLocked()
	}
	s.mu.Unlock()
	if found {
		s.emitTasks()
	}
}

// trimFinishedLocked 限制已结束任务的数量（调用方必须持有 s.mu）。
func (s *DownloadService) trimFinishedLocked() {
	finished := 0
	for _, t := range s.tasks {
		if t.State != DownloadRunning {
			finished++
		}
	}
	if finished <= maxFinishedTasks {
		return
	}
	drop := finished - maxFinishedTasks
	kept := make([]*DownloadTask, 0, len(s.tasks)-drop)
	for _, t := range s.tasks {
		if t.State != DownloadRunning && drop > 0 {
			drop--
			continue
		}
		kept = append(kept, t)
	}
	s.tasks = kept
}

// emitTasks 把整份任务快照推给前端。
//
// 推整份而不是「单条增量」：任务数量是个位数，合并逻辑留在前端反而更容易出错
// （漏合并就会出现「面板里的进度停住不动」）。
func (s *DownloadService) emitTasks() {
	s.mu.Lock()
	snapshot := s.tasksLocked()
	s.mu.Unlock()
	s.emit("download:tasks", snapshot)
}

func (s *DownloadService) run(taskID, bvid, title string, durationMS int64, dir string) {
	defer func() {
		s.mu.Lock()
		delete(s.running, bvid)
		s.mu.Unlock()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()

	stream, err := s.client.ResolveAudio(ctx, bvid)
	if err != nil {
		s.failTask(taskID, bvid, err.Error())
		return
	}
	if strings.TrimSpace(title) == "" {
		title = stream.Title
	}
	ext := strings.TrimSpace(stream.Ext)
	if ext == "" {
		ext = "m4a"
	}

	name := safeFilename(title)
	if name == "" {
		name = bvid
	}
	target, err := uniquePath(dir, name, "."+ext)
	if err != nil {
		s.failTask(taskID, bvid, err.Error())
		return
	}
	// 解析出真实标题后同步到任务上（用户点下载时标题可能还是空的）。
	s.updateTask(taskID, func(t *DownloadTask) {
		if strings.TrimSpace(t.Title) == "" || t.Title == bvid {
			t.Title = title
		}
		t.Path = target
	})

	size, err := s.fetchTo(ctx, stream, target, taskID, bvid, title)
	if err != nil {
		// 失败时清掉半成品，别在用户的音乐目录里留垃圾
		_ = os.Remove(target)
		s.failTask(taskID, bvid, err.Error())
		return
	}

	s.updateTask(taskID, func(t *DownloadTask) {
		t.State = DownloadDone
		t.Title = title
		t.Path = target
		t.Dir = dir
		t.Done = size
		if t.Total < size {
			t.Total = size
		}
		t.Message = ""
		t.FinishedAt = time.Now().UnixMilli()
	})

	s.emit("download:done", map[string]any{
		"bvid":     bvid,
		"title":    title,
		"path":     target,
		"dir":      dir,
		"bytes":    size,
		"duration": durationMS,
	})

	// 让刚下载的文件立刻进曲库。
	//
	// 为什么不能只靠「实时监听」：下载目录是**隐式扫描根**（用户不必把它加成
	// 音乐文件夹），而文件监听的根由 refreshWatcher 决定，两者未必都覆盖到它
	// （历史实现只监听 cfg.Folders）。这里显式做一次增量入库，最稳。
	if s.onFileAdded != nil {
		s.onFileAdded(target)
	}
}

// failTask 把一条任务标记为失败并广播。
//
// 失败原因要留在任务里（而不是只发一条 toast）：面板上会一直显示这条任务，
// 用户回头看时才知道「刚才那首为什么没下下来」。
func (s *DownloadService) failTask(taskID, bvid, message string) {
	s.updateTask(taskID, func(t *DownloadTask) {
		t.State = DownloadFailed
		t.Message = message
		t.FinishedAt = time.Now().UnixMilli()
	})
	s.emit("download:failed", map[string]any{"bvid": bvid, "message": message, "taskId": taskID})
}

// fetchTo 下载到一个临时文件再原子改名。
//
// 直接写目标文件的话，用户在中途打开目录会看到一个「大小还在涨」的半成品，
// 而且失败时留下的是看起来正常的文件。
func (s *DownloadService) fetchTo(ctx context.Context, stream *bilibili.AudioStream, target, taskID, bvid, title string) (int64, error) {
	tmp := target + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return 0, fmt.Errorf("创建文件失败: %w", err)
	}
	defer func() {
		_ = f.Close()
		_ = os.Remove(tmp)
	}()

	urls := append([]string{stream.URL}, stream.BackupURLs...)
	var lastErr error
	var written int64
	for _, rawURL := range urls {
		if strings.TrimSpace(rawURL) == "" {
			continue
		}
		written, lastErr = s.copyFrom(ctx, rawURL, f, taskID, bvid, title)
		if lastErr == nil {
			break
		}
		// 换备用地址前把文件截回 0，避免两次内容粘在一起
		if err := f.Truncate(0); err == nil {
			_, _ = f.Seek(0, io.SeekStart)
		}
	}
	if lastErr != nil {
		return 0, lastErr
	}
	if written == 0 {
		return 0, errors.New("下载到的内容为空")
	}
	if err := f.Sync(); err != nil {
		return 0, err
	}
	if err := f.Close(); err != nil {
		return 0, err
	}
	if err := os.Rename(tmp, target); err != nil {
		return 0, fmt.Errorf("保存文件失败: %w", err)
	}
	return written, nil
}

func (s *DownloadService) copyFrom(ctx context.Context, rawURL string, dst *os.File, taskID, bvid, title string) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Referer", "https://www.bilibili.com/")
	req.Header.Set("Origin", "https://www.bilibili.com")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return 0, fmt.Errorf("下载失败: HTTP %d", resp.StatusCode)
	}

	total := resp.ContentLength
	if total < 0 {
		// 服务端没给 Content-Length（分块传输）：面板按「未知总长」显示，
		// 不去猜一个假的总数，否则进度条会算出 >100% 的怪值。
		total = 0
	}
	if total > 0 {
		s.updateTask(taskID, func(t *DownloadTask) { t.Total = total })
	}
	var written int64
	buf := make([]byte, 256<<10)
	lastReport := time.Now()
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := dst.Write(buf[:n]); werr != nil {
				return written, fmt.Errorf("写入失败: %w", werr)
			}
			written += int64(n)
			// 节流：最多每 400ms 报一次，避免大文件刷爆事件通道
			if time.Since(lastReport) > 400*time.Millisecond {
				lastReport = time.Now()
				s.updateTask(taskID, func(t *DownloadTask) { t.Done = written })
				s.emit("download:progress", map[string]any{
					"bvid":  bvid,
					"title": title,
					"done":  written,
					"total": total,
				})
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return written, readErr
		}
	}
	return written, nil
}

// Status 返回下载目录与正在下载的任务（供设置界面展示）。
func (s *DownloadService) Status() map[string]any {
	s.mu.Lock()
	ids := make([]string, 0, len(s.running))
	for id := range s.running {
		ids = append(ids, id)
	}
	snapshot := s.tasksLocked()
	s.mu.Unlock()
	dir, _ := s.Dir()
	snapshot["dir"] = dir
	snapshot["running"] = ids
	return snapshot
}

/* --------------------------------------------------------------------------
   下载目录迁移
   -------------------------------------------------------------------------- */

// audioExts 会被当成「已下载的歌曲」的扩展名（迁移时只搬这些）。
var audioExts = map[string]bool{
	".mp3": true, ".m4a": true, ".mp4": true, ".flac": true, ".wav": true,
	".ogg": true, ".opus": true, ".aac": true, ".wma": true, ".ape": true,
	".aiff": true, ".aif": true, ".alac": true, ".dsf": true, ".wv": true,
}

// dirMusicStats 统计目录里的音频文件数量与总字节数（只统计第一层，
// 下载目录是平铺的；子目录不搬，避免把用户自己放进去的东西卷走）。
func dirMusicStats(dir string) (int, int64) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, 0
	}
	count := 0
	var size int64
	for _, e := range entries {
		if e.IsDir() || !audioExts[strings.ToLower(filepath.Ext(e.Name()))] {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		count++
		size += info.Size()
	}
	return count, size
}

// migrateDir 把 oldDir 里的音频文件搬到 newDir。
//
// 规则：
//   - 同名文件不覆盖：目标已存在就跳过（用户可能在那边已经有同一首歌）；
//   - 单个文件失败不影响其他文件（收集文件名返回）；
//   - 只有整个文件都搬成功了才从原目录移除（os.Rename 是原子的）；
//     跨盘符时 Rename 会失败，此时退化成「复制 + 删除」，复制失败不动原文件。
func migrateDir(oldDir, newDir string) (moved, skipped int, failed []string) {
	if samePath(oldDir, newDir) {
		return 0, 0, nil
	}
	entries, err := os.ReadDir(oldDir)
	if err != nil {
		return 0, 0, []string{err.Error()}
	}
	for _, e := range entries {
		if e.IsDir() || !audioExts[strings.ToLower(filepath.Ext(e.Name()))] {
			continue
		}
		src := filepath.Join(oldDir, e.Name())
		dst := filepath.Join(newDir, e.Name())
		if fileExists(dst) {
			skipped++
			continue
		}
		if err := moveFile(src, dst); err != nil {
			failed = append(failed, fmt.Sprintf("%s（%v）", e.Name(), err))
			continue
		}
		moved++
	}
	return moved, skipped, failed
}

// moveFile 优先用 Rename；跨盘符时退化成复制 + 删除。
func moveFile(src, dst string) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".migrating"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Sync(); err != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Remove(src)
}

// samePath 判断两个路径是否指向同一个地方（大小写与冗余分隔符无关）。
func samePath(a, b string) bool {
	ca := cleanAbs(a)
	cb := cleanAbs(b)
	return ca != "" && ca == cb
}

func cleanAbs(p string) string {
	p = bootstrap.ExpandPath(strings.TrimSpace(p))
	if p == "" {
		return ""
	}
	if abs, err := filepath.Abs(p); err == nil {
		p = abs
	}
	return strings.ToLower(filepath.Clean(p))
}

/* --------------------------------------------------------------------------
   路径工具
   -------------------------------------------------------------------------- */

// safeFilename 生成安全的文件名（去掉路径分隔符与 Windows 保留字符）。
func safeFilename(s string) string {
	s = strings.TrimSpace(s)
	replacer := strings.NewReplacer(
		"/", "-", "\\", "-", ":", "：", "*", "-", "?", "？",
		"\"", "'", "<", "-", ">", "-", "|", "-",
		"\n", " ", "\r", " ", "\t", " ",
	)
	s = replacer.Replace(s)
	s = strings.Join(strings.Fields(s), " ")
	// Windows 不允许文件名以点或空格结尾
	s = strings.TrimRight(s, ". ")
	runes := []rune(s)
	if len(runes) > 90 {
		s = string(runes[:90])
	}
	s = strings.TrimSpace(s)
	// Windows 保留设备名：CON / NUL / COM1 … 不能作为文件名主体（带扩展名也不行）。
	// 不处理的话 os.Create 会直接失败，用户只看到「下载失败」而不知道原因。
	// 加下划线前缀保留原意，而不是把名字整个换掉。
	if windowsReservedNames[strings.ToUpper(s)] {
		s = "_" + s
	}
	return s
}

// windowsReservedNames Windows 保留设备名（大小写不敏感）
var windowsReservedNames = func() map[string]bool {
	m := map[string]bool{"CON": true, "PRN": true, "AUX": true, "NUL": true}
	for i := 1; i <= 9; i++ {
		m[fmt.Sprintf("COM%d", i)] = true
		m[fmt.Sprintf("LPT%d", i)] = true
	}
	return m
}()

// uniquePath 避免覆盖同名文件：a.m4a → a (2).m4a → a (3).m4a …
func uniquePath(dir, base, ext string) (string, error) {
	candidate := filepath.Join(dir, base+ext)
	if !fileExists(candidate) {
		return candidate, nil
	}
	for i := 2; i < 1000; i++ {
		candidate = filepath.Join(dir, fmt.Sprintf("%s (%d)%s", base, i, ext))
		if !fileExists(candidate) {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("同名文件过多，无法生成文件名: %s", base)
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
