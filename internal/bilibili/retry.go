package bilibili

import (
	"context"
	"errors"
	"fmt"
	"time"
)

/* ==========================================================================
   retry.go — 瞬时失败的重试与错误分类
   --------------------------------------------------------------------------
   为什么需要它（真实症状）：用户第一次提交在线搜索时**偶尔**会立刻失败（像
   根本没发出请求），紧接着重搜同一个关键词就好。链路实测（直连客户端跑 20 个
   全新客户端各一次首搜）从不失败，说明不是每次必现的确定性 bug，而是**单次
   请求的瞬时失败**被原样报成了最终结果：

     · 首次搜索要先取 WBI 密钥（nav），这一步失败 = 搜索请求一次都没发出，
       表现正是「特别快就失败」；
     · 上游偶发 5xx / 429（风控限流 -352、-412 也属于这一类），一条 200 响应
       里带个非零 code 就完事了；
     · keep-alive 复用到一个已被对端关闭的连接，几十毫秒内 EOF / connection reset。

   GET 是幂等请求，这些情况重试一次就过。所以这里只做最小的一件事：
   **分类错误，只重试瞬时失败**。确定性错误（参数非法、4xx、context 已取消）
   一次都不重试 —— 重试它们只会让用户多等，结果一字不变。

   注意 WBI 签名与重试的关系：每次尝试都要重新签名（getJSON 里 withWBI 分支会
   用新的 wts 覆盖），否则拿旧时间戳重放反而更容易被判风控。
   ========================================================================== */

// retryDelays 是第 n 次重试前的等待。次数用 attempts 控制，超过数组长度就取最后一个。
//
// 量级选在「用户几乎无感」（首次搜索本身要 400~700ms）：退避太短等于同时打两次，
// 太短还会叠加上游限流；总耗时上限见调用方的 context。
var retryDelays = []time.Duration{250 * time.Millisecond, 700 * time.Millisecond}

// apiError 是接口返回的**业务错误**（HTTP 200 但 body 里的 code 非 0）。
//
// 单独成型是为了让重试判据能拿到 Code：上游的风控/限流码（-352 请求被风控、
// -412 请求被拦截、-509 限流）与「视频不存在」这类确定性错误必须区别对待。
type apiError struct {
	// Op 是操作名（"搜索" / "视频信息" / "播放地址"），进错误文案便于定位。
	Op      string
	Code    int
	Message string
}

func (e *apiError) Error() string {
	return fmt.Sprintf("bilibili %s失败: code=%d %s", e.Op, e.Code, e.Message)
}

// codeError 构造业务错误（文案与各调用方原来手拼的一致）。
func codeError(op string, code int, message string) error {
	return &apiError{Op: op, Code: code, Message: message}
}

// httpStatusError 是非 200 响应（文案与 getJSON 原来的 fmt.Errorf 一致）。
type httpStatusError struct {
	Status int
	Body   string
}

func (e *httpStatusError) Error() string {
	return fmt.Sprintf("bilibili: HTTP %d: %s", e.Status, e.Body)
}

// transient 判断一个错误值不值得重试。
//
// 只有「换一次请求可能就好了」的才返回 true：
//   - 风控 / 限流业务码（-352 / -412 / -500 / -503 / -509）；
//   - HTTP 429 与 5xx；
//   - 传输层错误（连接重置、EOF、读取响应失败）；
//   - 响应体不是 JSON（网关的错误页，上游偶发）。
//
// 明确不重试：context 已取消/已超时（再试也没有预算）、非法接口地址、
// 其它业务码（视频不存在、参数错误 —— 重试结果一字不变）、其它 4xx。
func transient(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	var api *apiError
	if errors.As(err, &api) {
		switch api.Code {
		case -352, -412, -500, -503, -509:
			return true
		}
		return false
	}
	var hs *httpStatusError
	if errors.As(err, &hs) {
		return hs.Status == 429 || hs.Status >= 500
	}
	return true
}

// retrying 执行 fn，最多 attempts 次；只对 transient 错误重试。
//
// 返回值永远是**最后一次**的错误（中途的错误对用户没有意义），所以调用方拿到
// 的错误文案与「只尝试一次」时完全一致。ctx 已结束时立刻收手，不再消耗退避。
func retrying(ctx context.Context, attempts int, fn func() error) error {
	if attempts < 1 {
		attempts = 1
	}
	var err error
	for i := 0; i < attempts; i++ {
		if err = fn(); err == nil {
			return nil
		}
		if i == attempts-1 || !transient(err) || ctx.Err() != nil {
			return err
		}
		delay := retryDelays[len(retryDelays)-1]
		if i < len(retryDelays) {
			delay = retryDelays[i]
		}
		select {
		case <-time.After(delay):
		case <-ctx.Done():
			return err
		}
	}
	return err
}

// searchAttempts 是一次搜索最多的尝试次数（首发 + 2 次重试）。
//
// 为什么是 3 而不是更多：首次搜索已经要等 nav + 搜索两个往返（约 0.5s），
// 上限 3 次再加最多 ~1s 退避仍在「用户愿意等一次重试」的范围里；上游真的
// 挂了时，多试几次也不会变好，只会把失败提示推迟。
const searchAttempts = 3

// navAttempts 是取 WBI 密钥的尝试次数。它失败等于「搜索请求一次都没发出」，
// 所以同样给重试机会（但比搜索少一次：密钥取不到通常意味着网络整体不通）。
const navAttempts = 2
