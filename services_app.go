package main

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// appVersion 是应用版本号的**唯一事实来源**。
//
// 「设置 → 关于」直接展示它。打包元数据里还各有一份同名值
// （build/config.yml、build/windows/info.json、build/linux/nfpm/fpm.yaml），
// 发版时一并改；之所以不在构建期注入，是因为这些文件也要能被直接手改核对。
const appVersion = "0.1.0"

// AppService 提供「设置 → 关于」需要的那点宿主能力：读版本号、
// 用系统默认浏览器打开外部链接。
//
// 为什么这两件事必须由 Go 侧做：
//   - 版本号写在前端就会和打包元数据各存一份，迟早对不上；
//   - 页面跑在 WebView2 里且受 CSP 限制，window.open 只会开一个受 WebView
//     管理的窗口（不是用户熟悉的浏览器），必须由宿主进程调 ShellExecute ——
//     Wails 把它暴露成 app.Browser.OpenURL。
type AppService struct {
	app *application.App
}

// NewAppService 构造服务。app 之后由 main 装配（测试时可以为 nil）。
func NewAppService() *AppService { return &AppService{} }

// Version 返回应用版本号，例如 "0.1.0"。
func (s *AppService) Version() string { return appVersion }

// OpenURL 用系统默认浏览器打开一个外部链接。
//
// 只放行 http / https，并且要求带主机名：这个参数最终会交给 ShellExecute，
// 不做校验的话，一个 file:// 或自定义协议就能被页面（或注入进来的脚本）
// 拿来拉起本机上的任意程序 —— 那已经不是「打开链接」了。
func (s *AppService) OpenURL(raw string) error {
	target := strings.TrimSpace(raw)
	if target == "" {
		return fmt.Errorf("链接为空")
	}
	u, err := url.Parse(target)
	if err != nil {
		return fmt.Errorf("链接无法解析：%w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("只允许打开 http / https 链接")
	}
	if u.Host == "" {
		return fmt.Errorf("链接缺少主机名")
	}
	if s == nil || s.app == nil {
		return fmt.Errorf("应用未就绪")
	}
	return s.app.Browser.OpenURL(u.String())
}
