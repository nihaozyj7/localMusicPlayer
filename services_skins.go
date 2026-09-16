package main

import (
	"fmt"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"

	"localmusicplayer/internal/skins"
)

// SkinService 播放界面皮肤（样式包）接口。
//
// 与 ThemeService 的分工：
//   - ThemeService 管的是「只换颜色令牌的 CSS 主题」；
//   - SkinService 管的是「带 JS 入口 + 多份 CSS 的完整样式包」。
//
// 皮肤资源不通过 Wails 绑定回传（那会变成把整个皮肤塞进内存），
// 而是由 asset server 在 /skins/ 前缀下同源托管，前端直接 import 拿。
type SkinService struct {
	mgr *skins.Manager
	// app 用于「导入样式」时弹系统目录选择器（main 里装配，测试时可空）。
	app *application.App
}

// NewSkinService 构造服务。
func NewSkinService(mgr *skins.Manager) *SkinService {
	return &SkinService{mgr: mgr}
}

// List 皮肤列表
func (s *SkinService) List() []skins.SkinInfo {
	if s == nil || s.mgr == nil {
		return []skins.SkinInfo{}
	}
	return s.mgr.List()
}

// Reload 重新扫描皮肤目录（用户在外部新增/修改皮肤后调用）
func (s *SkinService) Reload() ([]skins.SkinInfo, error) {
	if s == nil || s.mgr == nil {
		return nil, nil
	}
	if err := s.mgr.Reload(); err != nil {
		return nil, err
	}
	return s.mgr.List(), nil
}

// Dir 皮肤根目录路径
func (s *SkinService) Dir() string {
	if s == nil || s.mgr == nil {
		return ""
	}
	return s.mgr.Dir()
}

// RevealDir 在资源管理器中打开皮肤目录
func (s *SkinService) RevealDir() error {
	if s == nil || s.mgr == nil {
		return nil
	}
	return revealPath(s.mgr.OpenFolderPath())
}

// Delete 删除一个第三方样式包（连同它的整个目录）。
//
// 内置三款样式打包在程序里、磁盘上没有对应目录，因此不在可删列表里
// （列表里也不会有它们）。删完 manager 会自己重扫，前端拿到最新状态。
func (s *SkinService) Delete(id string) error {
	if s == nil || s.mgr == nil {
		return fmt.Errorf("样式服务未就绪")
	}
	return s.mgr.Delete(id)
}

// Import 弹出系统目录选择器，把选中的样式包目录复制进皮肤目录。
//
// 返回 { cancelled, id, imported }：用户取消时只有 cancelled=true；
// 目录不是合法样式包 / 同名已存在时返回错误（前端弹错误提示）。
func (s *SkinService) Import() (map[string]any, error) {
	if s == nil || s.mgr == nil {
		return nil, fmt.Errorf("样式服务未就绪")
	}
	if s.app == nil {
		return nil, fmt.Errorf("当前环境不支持系统目录选择器")
	}
	selected, err := s.app.Dialog.OpenFile().
		SetTitle("选择要导入的样式包文件夹").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(false).
		PromptForSingleSelection()
	if err != nil {
		return nil, fmt.Errorf("打开目录选择器失败: %w", err)
	}
	if strings.TrimSpace(selected) == "" {
		return map[string]any{"cancelled": true}, nil
	}
	res, err := s.mgr.ImportDir(selected)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"cancelled": false,
		"id":        res.ID,
		"imported":  res.Imported,
	}, nil
}
