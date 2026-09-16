package main

import (
	"os"
	"path/filepath"
	"strings"

	"localmusicplayer/internal/skins"
)

/* --------------------------------------------------------------------------
   AI 提示词的「参考资料」：由后端给出本机真实路径
   --------------------------------------------------------------------------
   设置界面里的「复制提示词」会把一份产物规格交给 AI。规格里的参考资料原本写
   的是源码仓库里的文件（contract.js / _template.css / tokens.css…），可用户
   手上往往只有编译好的程序 —— 那些路径根本不存在，AI 照着找只会扑空，
   等于没有参考。

   所以这里由后端列出**运行时真实存在**的东西：
     · 样式：用户皮肤目录、示例样式包 _template、当前样式包、目录里已有的包；
     · 主题：主题目录、当前主题文件、目录里已有的主题 CSS。
   前端把结果嵌进提示词的「参考资料」一节，AI 只要能读文件就能直接打开这些
   文件当范例；读不到（纯聊天环境）也知道该让用户贴哪一份。

   注意：内置样式（classic / immersive / minimal）的源码打包在程序里，磁盘上
   没有对应目录，这里如实返回空，由提示词说明「以示例包为准」，不编造路径。
   -------------------------------------------------------------------------- */

// SkinPackRef 用户皮肤目录里的一个样式包。
type SkinPackRef struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Dir    string   `json:"dir"`    // 包目录绝对路径
	Module string   `json:"module"` // 入口 js 绝对路径
	Styles []string `json:"styles"` // 样式表绝对路径（可能为空）
}

// SkinReference 播放界面样式（皮肤）的参考资料。
type SkinReference struct {
	Dir       string        `json:"dir"`       // 样式根目录：第三方样式包都放这里
	Example   string        `json:"example"`   // 示例样式包 _template 的目录；空 = 本机没有
	Current   string        `json:"current"`   // 当前样式包目录；空 = 当前用的是内置样式
	CurrentID string        `json:"currentId"` // 前端传入的当前样式 id（原样回传，便于提示词里说明）
	Packs     []SkinPackRef `json:"packs"`     // 目录里已有的第三方样式包
}

// Reference 收集皮肤参考资料；currentID 是当前生效的样式 id（前端 state.pvMode）。
func (s *SkinService) Reference(currentID string) SkinReference {
	ref := SkinReference{Packs: []SkinPackRef{}, CurrentID: strings.TrimSpace(currentID)}
	if s == nil || s.mgr == nil {
		return ref
	}
	ref.Dir = s.mgr.Dir()

	// 示例包由 NewManager 在首次启动时写入，正常都在；万一被用户删了就如实留空。
	if example := filepath.Join(ref.Dir, skins.TemplateDirName); isDir(example) {
		ref.Example = example
	}

	for _, info := range s.mgr.List() {
		pack := SkinPackRef{
			ID:     info.ID,
			Name:   info.Name,
			Dir:    info.Dir,
			Module: filepath.Join(info.Dir, filepath.FromSlash(info.Module)),
			Styles: []string{},
		}
		for _, style := range info.Styles {
			pack.Styles = append(pack.Styles, filepath.Join(info.Dir, filepath.FromSlash(style)))
		}
		ref.Packs = append(ref.Packs, pack)
		if info.ID == ref.CurrentID {
			ref.Current = info.Dir
		}
	}
	return ref
}

// ThemeFileRef 主题目录里的一个主题文件。
type ThemeFileRef struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Mode    string `json:"mode"`
	File    string `json:"file"` // 主题 CSS 绝对路径
	Builtin bool   `json:"builtin"`
}

// ThemeReference 外观主题的参考资料。
type ThemeReference struct {
	Dir         string         `json:"dir"`
	CurrentID   string         `json:"currentId"`   // 当前主题 id（前端传入或按目录匹配）
	CurrentName string         `json:"currentName"` // 当前主题显示名
	CurrentFile string         `json:"currentFile"` // 当前主题 CSS 绝对路径；空 = 没匹配到
	Files       []ThemeFileRef `json:"files"`       // 目录里已有的主题（含内置三款）
}

// Reference 收集主题参考资料；currentID 是当前生效的主题 id。
//
// 主题 id 取自 CSS 里的 :root[data-theme="…"]，与文件名不一定相同，所以这里
// 直接返回**文件名对应的绝对路径**（Info.File），而不是让前端拿 id 去猜路径。
func (s *ThemeService) Reference(currentID string) ThemeReference {
	ref := ThemeReference{Files: []ThemeFileRef{}}
	if s == nil || s.mgr == nil {
		return ref
	}
	ref.Dir = s.mgr.Dir()
	ref.CurrentID = strings.TrimSpace(currentID)

	for _, info := range s.mgr.List() {
		item := ThemeFileRef{
			ID:      info.ID,
			Name:    info.Name,
			Mode:    info.Mode,
			File:    info.File,
			Builtin: info.Builtin,
		}
		ref.Files = append(ref.Files, item)
		if info.ID == ref.CurrentID {
			ref.CurrentName = info.Name
			ref.CurrentFile = info.File
		}
	}
	return ref
}

// isDir 判断路径是否存在且是目录（不关心权限错误：读不到就当没有）。
func isDir(path string) bool {
	st, err := os.Stat(path)
	return err == nil && st.IsDir()
}
