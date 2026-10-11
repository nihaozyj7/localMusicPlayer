package loudness

import (
	"os"
	"strings"
	"testing"
	"time"
)

/* ==========================================================================
   排队测量的上限
   --------------------------------------------------------------------------
   runRequest 曾经用 context.Background()：没有任何上限。
   一个让 ffmpeg 卡住的文件（损坏容器 / 掉线的网络驱动器 / 被杀软锁住）
   会**永久占住一个并发槽** —— 调度器从此凑不满并发，Submit 的调用方
   （界面上的「测量中…」）永远等不到 Done，只能重启进程。

   为什么单独测这件事：这个故障没有任何日志、没有任何报错，
   表现只是「响度均衡从此再也不出结果」，非常难联想到「一个 ffmpeg 进程卡住了」。
   ========================================================================== */

func TestMeasureContextHasDeadline(t *testing.T) {
	ctx, cancel := measureContext()
	defer cancel()

	dl, ok := ctx.Deadline()
	if !ok {
		t.Fatal("排队测量的上下文没有截止时间 —— 卡死的 ffmpeg 会永久占住并发槽")
	}
	left := time.Until(dl)
	if left <= 0 || left > measureTimeout {
		t.Fatalf("截止时间不合理：还有 %v（上限是 %v）", left, measureTimeout)
	}
}

// 说明 measureTimeout 为什么是变量而不是常量：要让「超时真的会发生」可测。
func TestMeasureContextHonorsConfiguredTimeout(t *testing.T) {
	old := measureTimeout
	measureTimeout = 20 * time.Millisecond
	defer func() { measureTimeout = old }()

	ctx, cancel := measureContext()
	defer cancel()

	select {
	case <-ctx.Done():
		// 期望：到点就取消
	case <-time.After(2 * time.Second):
		t.Fatal("measureContext 没有按 measureTimeout 超时（测试用的变量没被读到？）")
	}
}

// 源码断言：runRequest 里不能出现无上限的 context。
//
// 为什么不用行为测试：要真正触发超时得有个「会卡住的 ffmpeg」，
// 那需要一个假的可执行文件与进程管理，代价远大于收益。
// 这里守的是「调用点必须走 measureContext()」这一条 —— 它正是曾经写错的地方。
func TestRunRequestUsesBoundedContext(t *testing.T) {
	src, err := os.ReadFile("manager.go")
	if err != nil {
		t.Fatalf("读源码失败: %v", err)
	}
	body := stripLineComments(goFuncBody(t, string(src), "func (m *Manager) runRequest("))
	if strings.Contains(body, "context.Background()") {
		t.Fatal("runRequest 又用上了 context.Background()：卡死的 ffmpeg 会永久占住并发槽")
	}
	if !strings.Contains(body, "measureContext()") {
		t.Fatal("runRequest 没有用 measureContext() 构造上下文")
	}
	if !strings.Contains(body, "cancel()") {
		t.Fatal("runRequest 没有释放上下文（defer cancel()），会泄漏计时器")
	}
}

// stripLineComments 去掉行注释，避免**注释里提到**的写法触发上面的断言
// （runRequest 的注释里正好写了「不能写成 context.Background()」）。
// 它不处理字符串里的 "//"，这个测试的输入是固定的一小段函数体，够用。
func stripLineComments(src string) string {
	lines := strings.Split(src, "\n")
	for i, line := range lines {
		if at := strings.Index(line, "//"); at >= 0 {
			lines[i] = line[:at]
		}
	}
	return strings.Join(lines, "\n")
}

// goFuncBody 按大括号配对截出函数体。
func goFuncBody(t *testing.T, src, signature string) string {
	t.Helper()
	at := strings.Index(src, signature)
	if at < 0 {
		t.Fatalf("源码里找不到 %s", signature)
	}
	open := strings.Index(src[at:], "{")
	if open < 0 {
		t.Fatalf("%s 没有函数体", signature)
	}
	open += at
	depth := 0
	for i := open; i < len(src); i++ {
		switch src[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return src[open : i+1]
			}
		}
	}
	t.Fatalf("%s 的大括号没有配对", signature)
	return ""
}
