package audioplay

import (
	"os"
	"strings"
	"testing"
)

/* ==========================================================================
   音频设备/上下文的释放点必须唯一
   --------------------------------------------------------------------------
   Open() 里 e.ctx / e.device 是在 Start() **之前**赋值的（好让失败路径能拿到
   它们去回收）。一旦某条失败路径「释放了但没清字段」，之后 Close() 就会照着
   这两个字段再释放一次：设备双重 Uninit、上下文 Free 两次 ——
   use-after-free / 堆损坏，而且崩在**退出路径**上（用户看到的只是「闪退」）。
   触发条件是「声卡打不开」，恰好是最不容易在开发机上复现的一类环境。

   为什么这里用源码断言而不是行为测试：
   能真正复现双重释放的场景是「设备 init 成功但 start 失败」—— 需要一个能初始化
   却启动不了的声卡，而 malgo 的设备/上下文是具体类型，没有接口可以替身
   （测试机上有没有声卡也不确定，行为测试会变成「有时测到、有时测不到」）。
   这条不变量的可审计形态就是「释放点只有一个」，那正好可以用源码守住。
   ========================================================================== */

func TestDeviceReleaseHappensInExactlyOnePlace(t *testing.T) {
	raw, err := os.ReadFile("engine.go")
	if err != nil {
		t.Fatalf("读源码失败: %v", err)
	}
	src := stripGoLineComments(string(raw))

	// 按 "\nfunc " 切开就够用：只要能把「哪个函数里出现了释放调用」定位出来。
	chunks := strings.Split(src, "\nfunc ")
	if len(chunks) < 2 {
		t.Fatal("解析 engine.go 失败（一个函数都没切出来）")
	}
	var offenders []string
	for _, chunk := range chunks[1:] {
		if !strings.Contains(chunk, ".Uninit()") && !strings.Contains(chunk, ".Free()") {
			continue
		}
		// 允许的那个：releaseDeviceLocked（它负责释放 + 清字段）
		if strings.HasPrefix(chunk, "(e *Engine) releaseDeviceLocked(") {
			continue
		}
		// 报告时用「func + 签名首行」：方法签名以接收者的 "(" 开头，
		// 按第一个 "(" 截断会截出空名字（踩过一次）。
		sig := chunk
		if nl := strings.IndexByte(chunk, '\n'); nl >= 0 {
			sig = chunk[:nl]
		}
		offenders = append(offenders, "func "+strings.TrimSpace(sig))
	}
	if len(offenders) > 0 {
		t.Fatalf("释放音频设备/上下文只允许出现在 releaseDeviceLocked 里（它同时清字段），"+
			"但还在这些地方发现了 Uninit/Free：%v\n"+
			"在别处手写释放会留下非 nil 的悬空字段，Close() 再释放一次就是双重释放/use-after-free",
			offenders)
	}

	// 反向确认：releaseDeviceLocked 确实存在且真的在释放（否则上面的检查会空转）
	if !strings.Contains(src, "func (e *Engine) releaseDeviceLocked()") {
		t.Fatal("找不到 releaseDeviceLocked —— 释放逻辑被挪到别处了？")
	}
	if !strings.Contains(src, "e.device = nil") || !strings.Contains(src, "e.ctx = nil") {
		t.Fatal("releaseDeviceLocked 必须把字段清空（「释放即清字段」是唯一不变量）")
	}
}

// stripGoLineComments 去掉行注释，避免注释里提到的写法触发断言。
func stripGoLineComments(src string) string {
	lines := strings.Split(src, "\n")
	for i, line := range lines {
		if at := strings.Index(line, "//"); at >= 0 {
			lines[i] = line[:at]
		}
	}
	return strings.Join(lines, "\n")
}

// Close 必须幂等，且失败之后引擎仍然可用 —— 这是 releaseDeviceLocked
// 「释放即清字段」对外可见的那部分契约。
func TestCloseIsIdempotent(t *testing.T) {
	e := New()
	// 有声卡的机器上 Open 成功（覆盖成功路径的两次 Close），
	// 没有声卡的机器上 Open 在 InitContext/InitDevice 就失败（覆盖失败路径的收尾）。
	err := e.Open()
	if err == nil {
		t.Log("这台机器有声卡，Open 成功")
	} else {
		t.Logf("Open 失败（无可用输出设备是正常情况）: %v", err)
	}

	e.Close()
	e.Close() // 第二次：绝不能再去释放已经释放过的设备/上下文

	if e.Started() {
		t.Fatal("Close 之后 Started 必须是 false")
	}

	// 收尾之后还能再开一次：字段没有残留（有残留的话这里会拿着悬空指针去操作）
	_ = e.Open()
	e.Close()
}
