package lyricsfetch

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"localmusicplayer/internal/lyrics"
)

/* --------------------------------------------------------------------------
   QQ 音乐 QRC（逐字）的**真实网络**回归（默认跳过）
   --------------------------------------------------------------------------
   这条用例的存在理由和酷狗那条一样：httptest 里的 JSON 是我自己写的，
   字段抄错、参数漏传、密钥编排抄错，假响应一律是绿的。

   它直接打 musicu.fcg 的 GetPlayLyricInfo（qrc=1, crypt=1），把
   hex 密文 → 3DES → zlib 整条链走一遍，并确认解出来的是**字级**歌词。

   默认不跑：`LMPLAYER_LIVE_QQ=1 go test ./internal/lyricsfetch/ -run Live -v`
   -------------------------------------------------------------------------- */

// qqMusicu 发一个 musicu.fcg 请求并返回 req.data（测试用，走真实网络）。
func qqMusicu(t *testing.T, ctx context.Context, req map[string]any) map[string]any {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"comm": map[string]any{"ct": 11, "cv": "1003006", "v": "1003006", "uin": "0", "format": "json"},
		"req":  req,
	})
	if err != nil {
		t.Fatalf("构造请求失败: %v", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://u.y.qq.com/cgi-bin/musicu.fcg", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("构造 HTTP 请求失败: %v", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Referer", "https://y.qq.com/")
	httpReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36")
	res, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		t.Fatalf("请求失败（网络问题？）: %v", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("HTTP %d: %s", res.StatusCode, truncate(string(raw), 200))
	}
	var out struct {
		Req struct {
			Data map[string]any `json:"data"`
		} `json:"req"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("响应不是 JSON: %v", err)
	}
	return out.Req.Data
}

func TestLiveQQQrcDecryptsToWordLevel(t *testing.T) {
	if os.Getenv("LMPLAYER_LIVE_QQ") != "1" {
		t.Skip("需要 LMPLAYER_LIVE_QQ=1 才跑真实网络测试")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	data := qqMusicu(t, ctx, map[string]any{
		"module": "music.musichallSong.PlayLyricInfo",
		"method": "GetPlayLyricInfo",
		"param": map[string]any{
			"format": "json", "songId": 97773, "songMid": "0039MnYb0qxYhV", "type": 1,
			"crypt": 1, "lrc_t": 0, "qrc": 1, "qrc_t": 0, "trans": 0, "trans_t": 0, "roma": 0, "roma_t": 0,
		},
	})
	hexed, _ := data["lyric"].(string)
	if strings.TrimSpace(hexed) == "" {
		t.Fatalf("没有拿到 QRC 密文: %+v", data)
	}
	if data["qrc"] != float64(1) {
		t.Logf("注意：接口这次没标 qrc=1（qrc=%v），仍然尝试解密", data["qrc"])
	}

	plain, err := qrcDecrypt(hexed)
	if err != nil {
		t.Fatalf("解密失败: %v（密文长度 %d，密钥编排抄错了？）", err, len(hexed))
	}
	if !lyrics.HasWordTiming(plain) {
		t.Fatalf("解出来的不是字级歌词：%q", truncate(plain, 200))
	}
	if FormatOf(plain) != FormatWord {
		t.Fatalf("FormatOf 判定不对: %s", FormatOf(plain))
	}
	t.Logf("解出字级歌词 %d 字节，开头：%s", len(plain), truncate(plain, 200))

	// 顺带确认 musicu 的**搜索**链路是通的（c.y.qq.com 那套会被整体 500）
	sdata := qqMusicu(t, ctx, map[string]any{
		"module": "music.search.SearchCgiService",
		"method": "DoSearchForQQMusicDesktop",
		"param":  map[string]any{"query": "晴天 周杰伦", "num_per_page": 3, "page_num": 1, "search_type": 0},
	})
	bodyMap, _ := sdata["body"].(map[string]any)
	songs, _ := bodyMap["song"].(map[string]any)["list"].([]any)
	if len(songs) == 0 {
		t.Fatalf("musicu 搜索没有结果: %s", truncate(toJSON(sdata), 300))
	}
	t.Logf("musicu 搜索到 %d 条，第一条：%s", len(songs), truncate(toJSON(songs[0]), 240))
}

func toJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
