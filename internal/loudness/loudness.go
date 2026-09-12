// Package loudness 计算音频的响度并给出回放补偿增益。
//
// 为什么需要：不同来源的音频响度差得很远（实测用户曲库里同一批 m4a 的
// 整合响度能差 10 LU 以上），切歌时音量忽大忽小。这里用 ffmpeg 的 loudnorm
// 滤镜按 EBU R128 测出每首歌的整合响度与真峰值，回放时按目标响度做增益补偿。
//
// 补偿方式选择「静态线性增益」而不是 loudnorm 的动态归一化：
//   - 线性增益保留原始动态范围，不会破坏音乐本身的强弱对比；
//   - 结果是一个恒定 dB 值，前端可以用 GainNode 实时套用，切歌零延迟；
//   - 动态归一化需要实时重采样整条流，做不到了解耦（也无法用于原生格式）。
//
// 测量结果按「路径 + 大小 + 修改时间」缓存到 data 目录，只测一次。
package loudness

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"musicplayer/internal/bootstrap"
	"musicplayer/internal/ffmpeg"
)

// Measurement 一首歌的响度测量结果
type Measurement struct {
	Path       string  `json:"path"`
	Size       int64   `json:"size"`
	ModTime    int64   `json:"modTime"`
	Integrated float64 `json:"integrated"` // 整合响度 LUFS
	TruePeak   float64 `json:"truePeak"`   // 真峰值 dBTP
	LRA        float64 `json:"lra"`        // 响度范围 LU
	Threshold  float64 `json:"threshold"`  // 相对门限 LUFS
	MeasuredAt int64   `json:"measuredAt"`
}

// Album 专辑（或整个曲库）的平均响度，用于「整张专辑统一」模式
type Album struct {
	Integrated float64 `json:"integrated"`
	Count      int     `json:"count"`
	UpdatedAt  int64   `json:"updatedAt"`
}

// 增益安全边界
const (
	minGainDB = -24.0
	maxGainDB = 24.0
	// 真峰值上限：留一点余量，避免增益后削波
	truePeakCeiling = -1.0
)

// Manager 响度管理器
type Manager struct {
	dataDir string
	tools   ffmpeg.Tools
	conc    int

	mu       sync.RWMutex
	items    map[string]Measurement
	albums   map[string]Album
	byPath   map[string]string // path -> key
	dirty    bool
	loaded   bool
	watchers []func()
}

// NewManager 创建管理器；dataDir 通常为 %APPDATA%\MusicPlayer
func NewManager(dataDir string, concurrency int) *Manager {
	if concurrency <= 0 {
		n := 4
		if c := os.Getenv("NUMBER_OF_PROCESSORS"); c != "" {
			if v, err := strconv.Atoi(c); err == nil && v > 0 {
				n = v / 2
				if n < 2 {
					n = 2
				}
			}
		}
		concurrency = n
	}
	if concurrency > 8 {
		concurrency = 8
	}
	m := &Manager{
		dataDir: dataDir,
		tools:   ffmpeg.Resolve(),
		conc:    concurrency,
		items:   map[string]Measurement{},
		albums:  map[string]Album{},
		byPath:  map[string]string{},
	}
	m.load()
	return m
}

// Available 是否具备测量能力
func (m *Manager) Available() bool { return m.tools.Available() }

// Tools 返回 ffmpeg 工具信息
func (m *Manager) Tools() ffmpeg.Tools { return m.tools }

// RefreshTools 重新解析 ffmpeg（设置里切换后调用）
func (m *Manager) RefreshTools() {
	ffmpeg.Reset()
	m.tools = ffmpeg.Resolve()
}

/* --------------------------------------------------------------------------
   缓存读写
   -------------------------------------------------------------------------- */

type cacheFile struct {
	Version int                    `json:"version"`
	Entries map[string]Measurement `json:"entries"`
	Albums  map[string]Album       `json:"albums,omitempty"`
}

const cacheVersion = 1

func (m *Manager) cachePath() string {
	return filepath.Join(m.dataDir, "loudness-cache.json")
}

// CachePath 返回测量缓存文件路径（供设置界面显示）
func (m *Manager) CachePath() string { return m.cachePath() }

func keyFor(path string, size, mod int64) string {
	return fmt.Sprintf("%s|%d|%d", path, size, mod)
}

func (m *Manager) load() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loaded = true

	raw, err := os.ReadFile(m.cachePath())
	if err != nil {
		return
	}
	var cf cacheFile
	if err := json.Unmarshal(raw, &cf); err != nil {
		return
	}
	if cf.Entries != nil {
		m.items = cf.Entries
		for _, it := range cf.Entries {
			m.byPath[it.Path] = keyFor(it.Path, it.Size, it.ModTime)
		}
	}
	if cf.Albums != nil {
		m.albums = cf.Albums
	}
}

// Save 落盘（有变化才写）
func (m *Manager) Save() error {
	m.mu.Lock()
	if !m.dirty {
		m.mu.Unlock()
		return nil
	}
	cf := cacheFile{Version: cacheVersion, Entries: m.items, Albums: m.albums}
	m.dirty = false
	m.mu.Unlock()

	raw, err := json.Marshal(cf)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(m.dataDir, 0o755); err != nil {
		return err
	}
	tmp := m.cachePath() + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, m.cachePath())
}

/* --------------------------------------------------------------------------
   查询
   -------------------------------------------------------------------------- */

// Get 取某首歌的测量结果（未测量过返回 false）
func (m *Manager) Get(song bootstrap.Song) (Measurement, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	item, ok := m.items[keyFor(song.Path, song.Size, song.ModTime)]
	return item, ok
}

// Count 已测量且仍有效的歌曲数
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.items)
}

// Missing 返回还没测量过的歌曲（用于批量测量）
func (m *Manager) Missing(songs []bootstrap.Song) []bootstrap.Song {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]bootstrap.Song, 0, len(songs))
	for _, s := range songs {
		if _, ok := m.items[keyFor(s.Path, s.Size, s.ModTime)]; !ok {
			out = append(out, s)
		}
	}
	return out
}

// Clear 清空测量缓存
func (m *Manager) Clear() error {
	m.mu.Lock()
	m.items = map[string]Measurement{}
	m.albums = map[string]Album{}
	m.byPath = map[string]string{}
	m.dirty = true
	m.mu.Unlock()
	if err := os.Remove(m.cachePath()); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// GainDB 计算把这首歌拉到目标响度所需的增益（dB）。
//
// 这里是「响度均衡」的核心：
//   gain = 目标响度 − 测得的整合响度
//
// 然后再按真峰值收一下，保证不会因为抬升而削波。
func GainDB(item Measurement, targetLUFS float64) float64 {
	if item.Integrated == 0 {
		return 0
	}
	gain := targetLUFS - item.Integrated

	// 真峰值保护：增益后真峰值不得超过上限
	if item.TruePeak != 0 {
		if maxAllowed := truePeakCeiling - item.TruePeak; gain > maxAllowed {
			gain = maxAllowed
		}
	}

	if gain > maxGainDB {
		gain = maxGainDB
	}
	if gain < minGainDB {
		gain = minGainDB
	}
	return math.Round(gain*100) / 100
}

// GainFor 直接按歌曲查询并计算增益；未测量时返回 (0,false)
func (m *Manager) GainFor(song bootstrap.Song, targetLUFS float64) (float64, bool) {
	item, ok := m.Get(song)
	if !ok {
		return 0, false
	}
	return GainDB(item, targetLUFS), true
}

/* --------------------------------------------------------------------------
   测量
   -------------------------------------------------------------------------- */

// Measure 测量一首歌（已缓存则直接返回缓存）
func (m *Manager) Measure(ctx context.Context, song bootstrap.Song) (Measurement, error) {
	if item, ok := m.Get(song); ok {
		return item, nil
	}
	return m.measureUncached(ctx, song)
}

func (m *Manager) measureUncached(ctx context.Context, song bootstrap.Song) (Measurement, error) {
	if !m.tools.Available() {
		return Measurement{}, fmt.Errorf("ffmpeg 不可用，无法测量响度")
	}
	res, err := analyse(ctx, m.tools.FFmpeg, song.Path)
	if err != nil {
		return Measurement{}, err
	}
	res.Path = song.Path
	res.Size = song.Size
	res.ModTime = song.ModTime
	res.MeasuredAt = time.Now().UnixMilli()

	m.mu.Lock()
	m.items[keyFor(song.Path, song.Size, song.ModTime)] = res
	m.byPath[song.Path] = keyFor(song.Path, song.Size, song.ModTime)
	m.dirty = true
	m.mu.Unlock()
	return res, nil
}

// Progress 批量测量的进度
type Progress struct {
	Done     int
	Total    int
	Failed   int
	Current  string
	Finished bool
}

// MeasureAll 并发测量一批歌曲，通过 onProgress 汇报进度。
//
// 只测缺失的部分，因此重复调用是廉价的。ctx 取消后会尽快返回，
// 已测好的部分仍然保留（下次继续，不会白干）。
func (m *Manager) MeasureAll(ctx context.Context, songs []bootstrap.Song, onProgress func(Progress)) (int, int, error) {
	todo := m.Missing(songs)
	total := len(todo)
	if onProgress != nil {
		onProgress(Progress{Done: 0, Total: total})
	}
	if total == 0 {
		if onProgress != nil {
			onProgress(Progress{Done: 0, Total: 0, Finished: true})
		}
		return 0, 0, nil
	}

	sem := make(chan struct{}, m.conc)
	var wg sync.WaitGroup
	var mu sync.Mutex
	done, failed := 0, 0

	for _, song := range todo {
		if ctx.Err() != nil {
			break
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(s bootstrap.Song) {
			defer wg.Done()
			defer func() { <-sem }()

			if ctx.Err() != nil {
				return
			}
			_, err := m.measureUncached(ctx, s)

			mu.Lock()
			done++
			if err != nil {
				failed++
			}
			p := Progress{Done: done, Total: total, Failed: failed, Current: s.Title}
			if done == total {
				p.Finished = true
			}
			mu.Unlock()
			if onProgress != nil {
				onProgress(p)
			}
		}(song)
	}
	wg.Wait()

	if err := m.Save(); err != nil {
		return done, failed, err
	}
	return done, failed, ctx.Err()
}

// UpdateAlbum 用一批测量结果更新某个专辑（或整个曲库）的平均响度
func (m *Manager) UpdateAlbum(name string, songs []bootstrap.Song) {
	var sum float64
	var n int
	for _, s := range songs {
		if item, ok := m.Get(s); ok && item.Integrated != 0 {
			sum += item.Integrated
			n++
		}
	}
	if n == 0 {
		return
	}
	m.mu.Lock()
	m.albums[name] = Album{Integrated: sum / float64(n), Count: n, UpdatedAt: time.Now().UnixMilli()}
	m.dirty = true
	m.mu.Unlock()
}

// AlbumGainDB 计算某个专辑/曲库的整体增益
func (m *Manager) AlbumGainDB(name string, targetLUFS float64) (float64, bool) {
	m.mu.RLock()
	al, ok := m.albums[name]
	m.mu.RUnlock()
	if !ok || al.Integrated == 0 {
		return 0, false
	}
	return GainDB(Measurement{Integrated: al.Integrated}, targetLUFS), true
}

/* --------------------------------------------------------------------------
   调用 ffmpeg 测量
   -------------------------------------------------------------------------- */

type loudnormJSON struct {
	InputI        string `json:"input_i"`
	InputTP       string `json:"input_tp"`
	InputLRA      string `json:"input_lra"`
	InputThresh   string `json:"input_thresh"`
	OutputI       string `json:"output_i"`
	Normalization string `json:"normalization_type"`
	TargetOffset  string `json:"target_offset"`
}

// analyse 跑一次 loudnorm 分析
func analyse(ctx context.Context, ffmpegPath, path string) (Measurement, error) {
	args := []string{
		"-hide_banner", "-nostdin", "-nostats",
		"-i", path,
		"-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
		"-f", "null", "-",
	}
	cmd := exec.CommandContext(ctx, ffmpegPath, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = nil

	runErr := cmd.Run()
	out := stderr.String()

	raw, ok := ffmpeg.ParseLoudnormJSON(out)
	if !ok {
		if runErr != nil {
			return Measurement{}, fmt.Errorf("ffmpeg 分析失败: %v（%s）", runErr, tail(out, 200))
		}
		return Measurement{}, fmt.Errorf("ffmpeg 未返回响度数据（%s）", tail(out, 200))
	}

	var parsed loudnormJSON
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return Measurement{}, fmt.Errorf("解析响度 JSON 失败: %w", err)
	}

	f, err := strconv.ParseFloat(strings.TrimSpace(parsed.InputI), 64)
	if err != nil {
		return Measurement{}, fmt.Errorf("响度值无效: %q", parsed.InputI)
	}
	// -inf 表示整段静音，此时不做任何补偿
	if math.IsInf(f, 0) || math.IsNaN(f) {
		return Measurement{Integrated: 0}, nil
	}

	m := Measurement{Integrated: f}
	if v, err := strconv.ParseFloat(strings.TrimSpace(parsed.InputTP), 64); err == nil && !math.IsInf(v, 0) {
		m.TruePeak = v
	}
	if v, err := strconv.ParseFloat(strings.TrimSpace(parsed.InputLRA), 64); err == nil && !math.IsInf(v, 0) {
		m.LRA = v
	}
	if v, err := strconv.ParseFloat(strings.TrimSpace(parsed.InputThresh), 64); err == nil && !math.IsInf(v, 0) {
		m.Threshold = v
	}
	return m, nil
}

func tail(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return "…" + s[len(s)-n:]
}
