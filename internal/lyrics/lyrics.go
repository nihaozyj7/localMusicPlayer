// Package lyrics 负责歌词获取。
//
// 来源优先级（可在设置界面调整顺序）：
//  1. lrc-file  同名 .lrc 文件（支持 song.lrc / song.zh.lrc）
//  2. embedded  音频内嵌歌词（ID3 USLT / Vorbis LYRICS）
//  3. online    在线匹配（v1 不实现，保留开关位）
//
// 返回内容统一为 LRC 文本，由前端 utils.js#parseLrc 解析时间轴。
package lyrics

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dhowden/tag"
)

// Result 歌词加载结果
type Result struct {
	LRC    string `json:"lrc"`
	Source string `json:"source"` // lrc-file | embedded | none
}

// Load 按优先级加载歌词
func Load(audioPath string, sources []string) Result {
	if len(sources) == 0 {
		sources = []string{"lrc-file", "embedded"}
	}
	for _, src := range sources {
		switch src {
		case "lrc-file":
			if text, ok := readLRCFile(audioPath); ok {
				return Result{LRC: text, Source: "lrc-file"}
			}
		case "embedded":
			if text, ok := readEmbedded(audioPath); ok {
				return Result{LRC: text, Source: "embedded"}
			}
		case "online":
			// v1 不实现在线匹配：留出位置，避免设置里的顺序失效
			continue
		}
	}
	return Result{LRC: "", Source: "none"}
}

// readLRCFile 找同名 .lrc
func readLRCFile(audioPath string) (string, bool) {
	dir := filepath.Dir(audioPath)
	base := strings.TrimSuffix(filepath.Base(audioPath), filepath.Ext(audioPath))

	candidates := []string{
		filepath.Join(dir, base+".lrc"),
		filepath.Join(dir, base+".LRC"),
	}
	// 形如 song.zh.lrc / song.chi.lrc 的翻译歌词也顺带支持
	if entries, err := os.ReadDir(dir); err == nil {
		prefix := strings.ToLower(base) + "."
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := strings.ToLower(e.Name())
			if strings.HasPrefix(name, prefix) && strings.HasSuffix(name, ".lrc") {
				candidates = append(candidates, filepath.Join(dir, e.Name()))
			}
		}
	}

	for _, c := range candidates {
		raw, err := os.ReadFile(c)
		if err != nil {
			continue
		}
		text := decodeText(raw)
		if strings.TrimSpace(text) != "" {
			return text, true
		}
	}
	return "", false
}

// readEmbedded 读内嵌歌词
func readEmbedded(audioPath string) (string, bool) {
	f, err := os.Open(audioPath)
	if err != nil {
		return "", false
	}
	defer f.Close()

	m, err := tag.ReadFrom(f)
	if err != nil {
		return "", false
	}
	// dhowden/tag 把非标准字段放进 Raw()；常见键名大小写不一
	raw := m.Raw()
	for _, key := range []string{"lyrics", "LYRICS", "unsyncedlyrics", "UNSYNCEDLYRICS", "USLT", "lyric"} {
		if v, ok := raw[key]; ok {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return s, true
			}
		}
	}
	// 部分格式把歌词放在 Lyrics 字段
	if lyr := strings.TrimSpace(m.Lyrics()); lyr != "" {
		return lyr, true
	}
	return "", false
}

// decodeText 处理 BOM 与常见编码（LRC 多为 UTF-8，少数是 GBK；GBK 交给前端按需处理）
func decodeText(raw []byte) string {
	s := string(raw)
	s = strings.TrimPrefix(s, "\ufeff")
	return s
}

// Describe 便于日志输出
func Describe(r Result, audioPath string) string {
	return fmt.Sprintf("lyrics(%s): %s", r.Source, filepath.Base(audioPath))
}
