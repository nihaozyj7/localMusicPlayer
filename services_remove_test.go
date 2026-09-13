package main

import (
	"os"
	"path/filepath"
	"testing"

	"musicplayer/internal/skins"
	"musicplayer/internal/theme"
)

/* --------------------------------------------------------------------------
   主题 / 样式包的「移除」
   --------------------------------------------------------------------------
   需求：设置里要能直接移除一个主题或一个播放界面样式，而且删完再扫描
   不能还留在列表里（以前只删文件不重扫是「手动删了、列表还在」的根因）。

   这里验的是**服务层**：前端绑定打到这两个方法上，删完之后 List()
   必须立刻反映磁盘状态（说明内部重扫了）。
   -------------------------------------------------------------------------- */

func TestThemeServiceDelete(t *testing.T) {
	dataDir := t.TempDir()
	mgr, err := theme.NewManager(dataDir)
	if err != nil {
		t.Fatalf("创建主题管理器失败: %v", err)
	}
	svc := NewThemeService(mgr)

	// 用户主题：导入一个再删掉
	src := filepath.Join(t.TempDir(), "pack")
	if err := os.MkdirAll(src, 0o755); err != nil {
		t.Fatal(err)
	}
	body := []byte(":root[data-theme=\"sunset\"]{--accent:#f80}")
	if err := os.WriteFile(filepath.Join(src, "sunset.css"), body, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := mgr.ImportDir(src); err != nil {
		t.Fatalf("导入主题失败: %v", err)
	}

	if err := svc.Delete("sunset"); err != nil {
		t.Fatalf("删除主题失败: %v", err)
	}
	if _, err := os.Stat(filepath.Join(mgr.Dir(), "sunset.css")); !os.IsNotExist(err) {
		t.Fatal("删除后主题文件仍然存在")
	}
	for _, info := range svc.List() {
		if info.ID == "sunset" {
			t.Fatal("删除后主题列表里还有 sunset（说明没有重扫）")
		}
	}

	// 内置主题不给删：每次启动都会重新生成，删了只会让用户以为删不掉
	if err := svc.Delete("dark-minimal"); err == nil {
		t.Fatal("内置主题应拒绝删除")
	}
	// 不存在的主题
	if err := svc.Delete("no-such-theme"); err == nil {
		t.Fatal("不存在的主题应报错")
	}
	// 服务未就绪时不能 panic
	var nilSvc *ThemeService
	if err := nilSvc.Delete("sunset"); err == nil {
		t.Fatal("未就绪的主题服务应返回错误")
	}
}

func TestSkinServiceDelete(t *testing.T) {
	dataDir := t.TempDir()
	mgr, err := skins.NewManager(dataDir)
	if err != nil {
		t.Fatalf("创建样式管理器失败: %v", err)
	}
	svc := NewSkinService(mgr)

	pack := filepath.Join(mgr.Dir(), "aurora")
	if err := os.MkdirAll(pack, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pack, "skin.js"), []byte("export default {}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := mgr.Reload(); err != nil {
		t.Fatal(err)
	}
	if _, ok := mgr.Get("aurora"); !ok {
		t.Fatal("准备好的样式没被扫到")
	}

	if err := svc.Delete("aurora"); err != nil {
		t.Fatalf("删除样式失败: %v", err)
	}
	if _, err := os.Stat(pack); !os.IsNotExist(err) {
		t.Fatal("删除后样式目录仍然存在")
	}
	for _, info := range svc.List() {
		if info.ID == "aurora" {
			t.Fatal("删除后样式列表里还有 aurora（说明没有重扫）")
		}
	}

	// 不存在的样式 / 非法 id / 模板目录都不能删
	if err := svc.Delete("no-such-skin"); err == nil {
		t.Fatal("不存在的样式应报错")
	}
	if err := svc.Delete(".."); err == nil {
		t.Fatal("非法 id 应报错")
	}
	if err := svc.Delete(skins.TemplateDirName); err == nil {
		t.Fatal("模板目录应拒绝删除")
	}
	var nilSvc *SkinService
	if err := nilSvc.Delete("aurora"); err == nil {
		t.Fatal("未就绪的样式服务应返回错误")
	}
}
