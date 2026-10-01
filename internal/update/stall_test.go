package update

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

/* ==========================================================================
   stall_test.go — 「连接卡住」的检测
   --------------------------------------------------------------------------
   代理失效时最典型的表现**不是**立刻报错，而是 TCP 连得上、HTTP 头也回了，
   然后 body 一个字节都不来。此时 io.Copy 会永远阻塞 ——
   用户看到的是进度条停在原地，而且永远不会自动切到备用通道。

   这条路径在真实网络里已经复现过（直连 github.com 的资产会卡近 80 秒），
   所以它必须有一条**不依赖外网**的测试兜着。
   ========================================================================== */

// localClientDirect 与 localClient 类似，但让所有通道都指向同一个本地服务器。
//
// 注意它必须**不能**让第一个测试里的「卡住」被后续通道绕过：
// 那条测试的 Channel 是 "direct"，所以只会有一条候选。
func stallClient(srv *httptest.Server) *Client {
	return &Client{
		Repo:         "o/r",
		DownloadHTTP: &http.Client{Transport: redirectTransport{base: srv.URL}},
	}
}

// TestCopyWithStallBreaksIdleConnection 用一个「连上但不发数据」的服务器
// 验证卡住检测真的会生效。
//
// 关于超时长度：Download 在一条通道失败后**总是**会继续试剩下的通道
// （这是有意的兜底设计，见 Candidates）。所以这里给一个 30 秒的 ctx：
// 第一条卡住被打破之后，ctx 立刻到期，循环就停了。
// 不这么做的话这条测试要跑 8 × 25 秒 = 3 分 20 秒。
func TestCopyWithStallBreaksIdleConnection(t *testing.T) {
	if testing.Short() {
		t.Skip("这条测试要等 stallTimeout（25 秒），-short 下跳过")
	}

	// 服务器立刻回 200 和 Content-Length，但一个字节都不写，一直挂着。
	released := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "1000")
		w.WriteHeader(http.StatusOK)
		if f, ok := w.(http.Flusher); ok {
			f.Flush() // 让响应头真的发出去 —— 这正是「连上了但不发数据」的样子
		}
		select {
		case <-r.Context().Done():
		case <-released:
		}
	}))
	defer func() {
		close(released)
		srv.Close()
	}()

	c := stallClient(srv)
	// 30 秒：够第一条通道卡满 stallTimeout（25s），又不足以让后续通道再卡一轮。
	ctx, cancel := context.WithTimeout(context.Background(), stallTimeout+5*time.Second)
	defer cancel()

	start := time.Now()
	_, err := c.Download(ctx, DownloadOptions{
		URL:       "https://github.com/o/r/releases/download/v1/app.exe",
		AssetName: "app.exe",
		TempDir:   t.TempDir(),
		Channel:   ChannelAuto,
	})
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("连接卡住时应当失败，而不是永远挂着")
	}
	// stall 检测必须**先于** ctx 到期生效：错误里应当说「卡住」，
	// 而不是笼统的「context deadline exceeded」。
	// 后者意味着检测没生效、只是被外层超时兜住了 —— 那在真实场景下
	// 用户要多等好几倍时间才能看到换通道。
	if !strings.Contains(err.Error(), "卡住") {
		t.Fatalf("应当由 stall 检测打破僵局（得到：%v）", err)
	}
	if elapsed < stallTimeout-time.Second {
		t.Fatalf("过早判定为卡住（%s），stallTimeout=%s", elapsed, stallTimeout)
	}
	if elapsed > stallTimeout+8*time.Second {
		t.Fatalf("卡住检测太慢（%s），stallTimeout=%s", elapsed, stallTimeout)
	}
	t.Logf("卡住检测在 %s 后生效（stallTimeout=%s）", elapsed.Round(time.Second), stallTimeout)
}

// TestDownloadTransportDoesNotReuseIdleConnections 锁住一个实测出来的坑。
//
// Go 的 http 连接池会把「读超时/取消」的连接放回池子（它并不总能判断出
// 那条连接已经废了）。于是换通道时新请求又拿到同一条死连接，
// 再卡满一次超时…… 表现是 **8 条通道各卡 25 秒、总共 3 分 20 秒**，
// 最后报「所有通道都失败」，而其中好几条本来是可用的。
//
// 修法是给下载用一个不保持连接的 Transport（见 newDownloadTransport）。
// 这条测试直接从池子层面验证那个性质。
func TestDownloadTransportDoesNotReuseIdleConnections(t *testing.T) {
	tr := newDownloadTransport()
	if !tr.DisableKeepAlives {
		t.Fatal("下载用的 Transport 必须禁用 keep-alive，否则卡住的连接会被复用")
	}
	// 必须是独立的 Transport，不能是 http.DefaultTransport 本身 ——
	// 改 DefaultTransport 会影响到进程里所有其它使用者（包括 Wails 内部）。
	if tr == http.DefaultTransport {
		t.Fatal("必须是 DefaultTransport 的副本，不能直接改全局那个")
	}
}

// TestClientWithoutInjectedHTTPUsesNoKeepAliveClient 验证默认路径确实走的是
// 上面那个 Transport（注入 DownloadHTTP 时才会绕过）。
func TestClientWithoutInjectedHTTPUsesNoKeepAliveClient(t *testing.T) {
	c := NewClient("o/r")
	client := c.downloadClient()
	tr, ok := client.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("默认下载客户端的 Transport 类型不对：%T", client.Transport)
	}
	if !tr.DisableKeepAlives {
		t.Fatal("默认下载客户端必须禁用 keep-alive")
	}
	if client.Timeout != 0 {
		t.Fatalf("下载客户端不应设 Client.Timeout（会误杀慢速大文件），得到 %s", client.Timeout)
	}
}

// TestStallDetectionThenFailover 验证「第一条通道卡住 → 自动切到下一条」。
//
// 这是本功能最关键的用户可见行为：网络差的时候用户不该看到进度条永远不动，
// 而应该看到它自己换了一条通道然后开始下载。
func TestStallDetectionThenFailover(t *testing.T) {
	if testing.Short() {
		t.Skip("这条测试要等 stallTimeout（25 秒），-short 下跳过")
	}

	payload := []byte("recovered-after-stall")
	released := make(chan struct{})
	var hits int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 第一次请求（直连）卡住；第二次（代理）正常返回。
		if atomic.AddInt32(&hits, 1) == 1 {
			w.Header().Set("Content-Length", "1000")
			w.WriteHeader(http.StatusOK)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
			select {
			case <-r.Context().Done():
			case <-released:
			}
			return
		}
		w.Header().Set("Content-Length", "21")
		_, _ = w.Write(payload)
	}))
	defer func() {
		close(released)
		srv.Close()
	}()

	c := localClient(srv)
	start := time.Now()
	res, err := c.Download(context.Background(), DownloadOptions{
		URL:       "https://github.com/o/r/releases/download/v1/app.exe",
		AssetName: "app.exe",
		TempDir:   t.TempDir(),
		Channel:   ChannelAuto,
	})
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("第一条通道卡住后应当切到第二条并成功：%v", err)
	}
	if res.Attempts != 2 {
		t.Fatalf("应当在第二次尝试时成功，得到 Attempts=%d", res.Attempts)
	}
	if res.MirrorID != "ghproxy.net" {
		t.Fatalf("应当切到第一条代理，得到 %q", res.MirrorID)
	}
	if elapsed < stallTimeout-time.Second {
		t.Fatalf("切得太快了（%s），说明不是被 stall 检测打破的", elapsed)
	}
	t.Logf("卡住 %s 后自动切换通道并下载成功（通道=%s）", elapsed.Round(time.Second), res.MirrorName)
}
