// Package covercache 保存「从音频文件标签里解析出来的内嵌封面」的原始字节。
//
// # 为什么需要它
//
// 这些字节以前是**以 base64 data URL 的形式直接塞进 library 的元数据缓存**的
// （%APPDATA%\MusicPlayer\metadata-cache.json）。实测那份缓存 5.59MB，其中
// 5.57MB（99.6%）是 base64 封面：每次扫描结束都要把它整份序列化一遍，启动还要
// 整份解析；而同一张图（整张专辑共用一张封面是常态）会被逐首重复存 N 份。
//
// 现在改成内容寻址：
//   - 封面字节一张一个文件，放在专用目录里，文件名由内容 hash 决定；
//   - 元数据缓存只留一个文件名（十几字节），不再存 base64；
//   - 相同内容天然只存一份，写入是幂等的；
//   - 前端拿到的是同源 URL（见 URL/Handler），浏览器按 immutable 长缓存，
//     同一张封面只会被下载一次 —— 列表接口也就不必再传几百 MB 的 base64。
//
// # 命名
//
// `<fnv1a64(字节 ‖ 长度) 的 16 位小写十六进制><扩展名>`，例如
// `9f2a1c4b7d3e5081.jpg`。
//
// 为什么用非加密的 FNV-1a 而不是 sha256：这是纯内容寻址的**缓存名**，不是安全
// 边界，要求的是「算得快」（FNV-1a 每字节一次异或 + 一次乘法，对 143KB 的封面是
// 微秒级）。把字节长度一起混进摘要，保证「长度不同必然不同名」；同长度不同内容
// 发生 64 位碰撞的概率约 2^-64，在个人曲库量级（< 10 万张）下可以忽略。
package covercache

import (
	"encoding/binary"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"musicplayer/internal/atomicfile"
	"musicplayer/internal/bootstrap"
)

// Prefix 是同源封面路由前缀（与 media.AudioPrefix 一样挂在 asset server 上）。
const Prefix = "/cover/"

// FNV-1a 64 位参数
const (
	fnvOffset64 = 14695981039346656037
	fnvPrime64  = 1099511628211
)

// namePattern 限制文件名形态：16 位十六进制 + 已知图片扩展名。
//
// 这一层是**目录穿越的第一道防线**：只接受我们自己生成过的形态，
// 于是 `../`、绝对路径、UNC 前缀都不可能通过。
var namePattern = regexp.MustCompile(`^[0-9a-f]{16}.(jpg|png|gif|webp|avif|bmp|tiff?)$`)

// Store 是内容寻址的封面缓存。
type Store struct {
	dir   string
	token string
}

// New 创建缓存；dir 是专用封面缓存目录（通常是 <cacheDir>/covers）。
func New(dir string) *Store {
	return &Store{dir: dir, token: bootstrap.RandomID("ck")}
}

// Dir 返回缓存目录（供设置界面显示）。
func (s *Store) Dir() string { return s.dir }

// Put 写入封面字节并返回文件名；相同内容重复写入是幂等的（不重复落盘）。
// data 为空时返回空文件名与 nil（表示「这首歌没有封面」，不是错误）。
func (s *Store) Put(data []byte, declaredMIME string) (string, error) {
	if len(data) == 0 {
		return "", nil
	}
	name := Name(data, declaredMIME)
	full := filepath.Join(s.dir, name)
	// 命中条件带长度校验：万一出现摘要碰撞，也不会把不同内容当成同一张图
	if st, err := os.Stat(full); err == nil && st.Size() == int64(len(data)) {
		return name, nil
	}
	if err := atomicfile.Write(full, data, 0o644); err != nil {
		return "", err
	}
	return name, nil
}

// Name 由内容算出文件名（纯函数，便于测试与排查）。
//
// 扩展名**由内容嗅探得到**，而不是直接采信标签里声明的 MIME：
//   - 声明的 MIME 经常是错的（尤其抓取/转手过的文件），而名字决定 HTTP 的
//     Content-Type，写错会让浏览器直接拒绝渲染；
//   - 更要紧的是去重：同一张图在不同文件里可能被声明成不同 MIME，
//     若把声明值拼进名字，同一张图会落成两个文件，内容寻址就白做了。
//     （这条是测试逼出来的：迁移时同一张 PNG 分别被声明成 png/jpeg，落了两份。）
func Name(data []byte, declaredMIME string) string {
	h := uint64(fnvOffset64)
	var lenBuf [8]byte
	binary.LittleEndian.PutUint64(lenBuf[:], uint64(len(data)))
	for _, b := range lenBuf {
		h ^= uint64(b)
		h *= fnvPrime64
	}
	for _, b := range data {
		h ^= uint64(b)
		h *= fnvPrime64
	}
	return fmt.Sprintf("%016x", h) + sniffExt(data, declaredMIME)
}

// sniffExt 先用内容嗅探决定扩展名，认不出来时再退回声明的 MIME。
//
// 只用前 512 字节（http.DetectContentType 的规定窗口），对 143KB 的封面
// 基本不构成开销。DetectContentType 不认 avif/tiff，那两种走声明值。
func sniffExt(data []byte, declaredMIME string) string {
	head := data
	if len(head) > 512 {
		head = head[:512]
	}
	switch http.DetectContentType(head) {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/bmp":
		return ".bmp"
	}
	return extForMIME(declaredMIME)
}

// Path 返回文件名对应的绝对路径；名字不合法或文件不存在时 ok=false。
func (s *Store) Path(name string) (string, bool) {
	if !ValidName(name) {
		return "", false
	}
	full := filepath.Join(s.dir, name)
	if st, err := os.Stat(full); err != nil || st.IsDir() {
		return "", false
	}
	return full, true
}

// URL 返回同源可访问地址（形如 /cover/<name>?t=<token>）。
//
// 相对地址就够了：这条路由挂在 asset server 上，与页面同源，所以主窗口、
// 桌面歌词窗口、桌面背景窗口都能直接用。
func (s *Store) URL(name string) string {
	if !ValidName(name) {
		return ""
	}
	return Prefix + name + "?t=" + s.token
}

// ValidName 判断文件名是否是本包生成的形态。
func ValidName(name string) bool { return namePattern.MatchString(name) }

// Handler 返回 `/cover/` 前缀的处理器（由 main.go 的中间件拦下来）。
func (s *Store) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(Prefix, s.handle)
	return mux
}

func (s *Store) handle(w http.ResponseWriter, r *http.Request) {
	// 与音频路由同样的口径：本机随机 token，避免同机其它进程随手读文件
	if r.URL.Query().Get("t") != s.token {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, Prefix)
	if !ValidName(name) {
		http.NotFound(w, r)
		return
	}
	f, err := os.Open(filepath.Join(s.dir, name))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || st.IsDir() {
		http.NotFound(w, r)
		return
	}
	// 内容寻址 ⇒ 同一个名字的内容永不改变：让浏览器永久缓存。
	// 这是「列表反复重绘不再重复取图」的关键。
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	if ct := mimeForName(name); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	// ServeContent 负责 Range / HEAD / If-Modified-Since
	http.ServeContent(w, r, name, st.ModTime(), f)
}

// Stats 返回缓存里的文件数与总字节数（供设置界面显示）。
func (s *Store) Stats() (count int, bytes int64) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return 0, 0
	}
	for _, e := range entries {
		if e.IsDir() || !ValidName(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		count++
		bytes += info.Size()
	}
	return count, bytes
}

// extForMIME 是嗅探失败时的兜底（见 sniffExt）。
// Prune 删除**未被引用**的封面文件，返回删除数与释放的字节数。
//
// keep 是「仍在使用」的文件名集合（由元数据缓存给出）。minAge 用于避开与新写入
// 竞争的窗口：刚 Put 进去、但还没写进元数据缓存的文件不会被误删（那些文件此
// 刻必然还没出现在 keep 里）。
//
// 为什么必须有回收：内容是寻址的目录天然只增不减 —— 用户换了内嵌封面、或删掉
// 了歌，旧图就变成孤儿，目录只会一直涨。
func (s *Store) Prune(keep map[string]struct{}, minAge time.Duration) (removed int, freed int64) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return 0, 0
	}
	cutoff := time.Now().Add(-minAge)
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !ValidName(name) {
			continue
		}
		if _, ok := keep[name]; ok {
			continue
		}
		info, err := e.Info()
		if err != nil || info.ModTime().After(cutoff) {
			continue
		}
		if err := os.Remove(filepath.Join(s.dir, name)); err == nil {
			removed++
			freed += info.Size()
		}
	}
	return removed, freed
}

func extForMIME(mime string) string {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "image/avif":
		return ".avif"
	case "image/bmp":
		return ".bmp"
	case "image/tiff":
		return ".tiff"
	default:
		return ".jpg"
	}
}

func mimeForName(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".avif":
		return "image/avif"
	case ".bmp":
		return "image/bmp"
	case ".tif", ".tiff":
		return "image/tiff"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	default:
		return ""
	}
}
