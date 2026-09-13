package main

import (
	"musicplayer/internal/skins"
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
