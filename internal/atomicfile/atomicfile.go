// Package atomicfile 提供「先写唯一临时文件 → fsync → 改名覆盖目标」的落盘方式。
//
// 为什么单独成包：仓库里原本有 7 处各自手写这套逻辑，且互不一致 ——
//
//   - bootstrap.Store.saveLocked 用**带序号**的临时名（唯一正确的一处）；
//   - loudness / library / metacache / ffmpeg 用的是固定的 "<target>.tmp"，
//     两个 goroutine 同时落盘就会互相覆盖同一个临时文件；Windows 上
//     os.Rename 还会直接失败（ERROR_SHARING_VIOLATION）。这不是理论问题：
//     services.go 有 4 处 LoudnessService 方法会调 mgr.Save()，
//     「播放时按需测量」与「后台全库测量」完全可能同时落盘；
//   - metacache/embed.go 的 writeFileAtomic 额外做了 fsync，是唯一有持久性
//     保证的版本。
//
// 统一到这里之后，「唯一临时名」和「fsync」对所有调用方都生效。
package atomicfile

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

// renameAttempts / renameBackoffBase 控制 Windows 上 rename 被瞬时占用时的重试。
// 退避序列 5,10,15,…,40ms，累计上限约 180ms（与 bootstrap.saveLocked 一致）。
const (
	renameAttempts    = 8
	renameBackoffBase = 5 * time.Millisecond
)

// seq 保证同一目标文件的临时名在进程内唯一。
var seq uint64

// pathLocks 让「同一个目标路径的写入」在进程内串行。
//
// ★ 为什么光有唯一临时名还不够（实测）：
// 4 个 goroutine 各写 20 轮同一个目标，即使每次都写自己的临时文件，
// `os.Rename` 仍会间歇性返回 `Access is denied`（Windows 上并发替换同一个
// 目标时的已知行为，见下面 rename 重试的注释）。8 次退避重试（约 180ms）
// 之后会退回非原子的直接覆盖写，而那一刻连覆盖写也可能失败 ——
// 实测 80 次写入里有 2 次**直接报错丢掉了这次落盘**
// （`internal/atomicfile/atomicfile_test.go` 的并发用例就是钉这一条的）。
//
// 串行化之后，退避重试只需要对付**进程外**的占用者（杀软、索引器、
// 另一个程序在读这个文件），那才是它原本的用途。
//
// 条目只增不减：key 是绝对路径，一个会话里最多等于「写过的不同文件数」
// （例如每首歌一个响度文件，8725 首 ≈ 每个条目几十字节）。**不能**在解锁时
// 删除条目 —— 等待者手里拿的是旧锁，删掉后新来的写者会造一把新锁，
// 两个写者就又能同时改名了，等于把刚修好的问题请回来。
var pathLocks sync.Map // map[string]*sync.Mutex

// lockPath 锁住一个目标路径，返回解锁函数。
func lockPath(path string) func() {
	key, err := filepath.Abs(path)
	if err != nil {
		key = path
	}
	v, _ := pathLocks.LoadOrStore(key, &sync.Mutex{})
	mu := v.(*sync.Mutex)
	mu.Lock()
	return mu.Unlock
}

// Write 原子地把 data 写到 path。
//
// 步骤：写 "<path>.<seq>.tmp" → fsync → rename。
// 目录不存在时会先建出来。
func Write(path string, data []byte, perm os.FileMode) error {
	// 同一目标的写入串行（见 pathLocks 的说明）：不串行的话，两个写者的
	// rename 会互相把对方顶成 Access is denied，退避重试也救不回来。
	defer lockPath(path)()

	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}

	// 唯一临时名：固定名在并发落盘时会被两个写者共用，既可能互相覆盖内容，
	// 也会让 rename 失败（Windows 的 ERROR_SHARING_VIOLATION）。
	tmp := fmt.Sprintf("%s.%d.tmp", path, atomic.AddUint64(&seq, 1))

	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	// fsync：rename 的原子性只保证「看到的是旧内容或新内容」，不保证新内容
	// 已经落到盘上 —— 断电可能留下一个长度正确但内容为空的文件。
	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	// rename 在 Windows 上可能因为目标文件被瞬时占用（另一个写者、杀软、
	// 索引器）而失败，返回 ERROR_ACCESS_DENIED / ERROR_SHARING_VIOLATION ——
	// 光有唯一的临时名还不够，**改名这一步本身也要串行化**。
	// 退避重试；仍然失败就退回直接覆盖写：那会有一个极短的非原子窗口，
	// 而且这条回退路径**不做 fsync**（上面那段 fsync 只管正常路径），
	// 但比整个落盘失败（用户看到「测量结果没保存」）更可取。
	var lastErr error
	for attempt := 0; attempt < renameAttempts; attempt++ {
		if err := os.Rename(tmp, path); err == nil {
			return nil
		} else {
			lastErr = err
		}
		time.Sleep(time.Duration(attempt+1) * renameBackoffBase)
	}

	// ★ 回退失败时两条原因都要报：以前这里只包 rename 的错误，于是「目标其实
	//   不可写 / 磁盘已满」这类真正的原因被丢掉，用户只看到一句
	//   「替换 xxx 失败: Access is denied」，而那句话大概率与真凶无关。
	//   两个 %w 让 errors.Is 对两条底层错误都能命中（Go 1.20+ 的多重包装）。
	writeErr := os.WriteFile(path, data, perm)
	_ = os.Remove(tmp)
	if writeErr == nil {
		return nil
	}
	return fmt.Errorf("替换 %s 失败: %w；回退覆盖写也失败: %w", filepath.Base(path), lastErr, writeErr)
}
