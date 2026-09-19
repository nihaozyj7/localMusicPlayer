package main

import (
	"io"
	"net/http"
	"time"
)

/* ==========================================================================
   流式下载用的 HTTP 客户端
   --------------------------------------------------------------------------
   为什么需要单独一个：这两个地方（在线试听代理、下载落盘）原来都用
   `http.DefaultClient` —— 那是**没有超时**的全局客户端，任何一个慢速对端
   都能把连接无限期挂着不放（DefaultClient 的 Timeout 为 0 = 永不超时）。
   同时下游都是 `io.Copy`，也没有字节上限，一个异常的大文件能把磁盘写满。

   注意这里的 Timeout 设得比较长（10 分钟）：它约束的是**整个请求**的时长，
   而正常下载一首歌也可能要几分钟。真正需要防的是「永远不结束」，
   而不是「慢」—— 所以：
     · Timeout   = 10 分钟，给正常大文件留足余量，同时兜住无限挂起；
     · 字节上限  = maxRemoteAudioBytes，在拷贝处用 io.LimitReader 施加。

   为什么不能直接改 http.DefaultClient：它是**包级全局**，进程里其它库
   （包括 Wails 内部）可能也在用，改它等于改别人的行为。必须用专用实例。
   ========================================================================== */

// streamClient 用于音频流代理与下载（有超时的专用客户端，不动 DefaultClient）
var streamClient = &http.Client{
	Timeout: 10 * time.Minute,
}

// maxRemoteAudioBytes 单次远端音频的字节上限（1 GB）。
//
// 一首歌不可能到这个量级（无损整轨一般 < 100 MB），越过它基本只可能是
// 「服务端返回了非音频内容」或「恶意/异常的超大响应」。
// 超限时拷贝会返回错误，调用方按下载失败处理并清理半成品。
const maxRemoteAudioBytes = 1 << 30

// limitRemoteAudio 给响应体套上字节上限。
//
// 用 LimitReader(body, max+1) 而不是 max 是刻意的：读到第 max+1 个字节
// 才能区分「恰好等于上限」与「确实超限」，否则一个正好 1GB 的响应会被
// 无声地截断成 1GB 的坏文件。调用方读完后用 remoteAudioExceeded 判断。
func limitRemoteAudio(body io.ReadCloser) io.ReadCloser {
	return &cappedReadCloser{Reader: io.LimitReader(body, maxRemoteAudioBytes+1), closer: body}
}

// remoteAudioExceeded 报告已读字节数是否已越过上限。
func remoteAudioExceeded(written int64) bool { return written > maxRemoteAudioBytes }

// cappedReadCloser 把 LimitReader 与原始 body 的 Close 组合起来。
type cappedReadCloser struct {
	io.Reader
	closer io.Closer
}

func (c *cappedReadCloser) Close() error { return c.closer.Close() }
