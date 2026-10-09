package lyricsfetch

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

/* --------------------------------------------------------------------------
   网易云来源：**字级优先**
   --------------------------------------------------------------------------
   接口的一份返回里可能同时有三种歌词：lrc（行级）、klyric（卡拉OK）、
   yrc（逐字）。挑错顺序会把「有逐字歌词」降级成行级；而按字段顺序盲取
   又会在「klyric 是空的」时把有歌词的结果判成空 —— 两种错都实打实。
   -------------------------------------------------------------------------- */

func TestNeteaseLyricTextPrefersWordLevel(t *testing.T) {
	var resp neteaseLyricResp
	resp.LRC.Lyric = "[00:01.00]行级那份"
	resp.Klyric.Lyric = "[00:01.00]你[00:01.30]好"

	if got := neteaseLyricText(&resp); got != "[00:01.00]你[00:01.30]好" {
		t.Fatalf("klyric 带逐字时间轴时应优先用它，实际 %q", got)
	}
}

// 拿不到逐字歌词（klyric/yrc 都是空的）时必须回落到 lrc，不能返回空。
func TestNeteaseLyricTextFallsBackToLRC(t *testing.T) {
	var resp neteaseLyricResp
	resp.LRC.Lyric = "[00:01.00]行级那份"
	if got := neteaseLyricText(&resp); got != "[00:01.00]行级那份" {
		t.Fatalf("空的逐字字段不该顶掉 lrc，实际 %q", got)
	}
}

// yrc 排在 klyric 前面（逐字 > 卡拉OK > 行级）。
func TestNeteaseLyricTextYrcWins(t *testing.T) {
	var resp neteaseLyricResp
	resp.LRC.Lyric = "[00:01.00]行级那份"
	resp.Klyric.Lyric = "[00:01.00]卡拉OK"
	resp.Yrc.Lyric = "[00:01.00]<00:01.000>逐<00:01.300>字"
	if got := neteaseLyricText(&resp); got != resp.Yrc.Lyric {
		t.Fatalf("yrc 应当最优先，实际 %q", got)
	}
}

// 请求必须带上 yrcVersion=1（向接口要逐字歌词），且路径不变。
func TestNeteaseFetchAsksForWordLevel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/song/lyric" {
			t.Errorf("路径不对: %s", r.URL.Path)
		}
		if !strings.Contains(r.URL.RawQuery, "yrcVersion=1") {
			t.Error("请求里应当带 yrcVersion=1")
		}
		io.WriteString(w, `{"code":200,"lrc":{"lyric":"[00:01.00]行级那份"},"klyric":{"lyric":""},"yrc":{"lyric":""},"tlyric":{"lyric":""}}`)
	}))
	defer srv.Close()

	p := &neteaseProvider{baseURL: srv.URL}
	res, err := p.Fetch(context.Background(), Candidate{ID: "186016"})
	if err != nil {
		t.Fatalf("Fetch 失败: %v", err)
	}
	if res.LRC != "[00:01.00]行级那份" {
		t.Fatalf("应拿到 lrc，实际 %q", res.LRC)
	}
	if res.Provider != "netease" {
		t.Fatalf("来源字段不对: %+v", res)
	}
}
