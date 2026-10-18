package update

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

/* ==========================================================================
   下载产物必须有一个能双击运行的最终文件名
   --------------------------------------------------------------------------
   旧实现把 <asset>.partN 直接当结果返回（Path 指向它）。这个目录正是
   「设置 → 关于 → 打开下载目录」里的那一个，安装失败时界面让用户去双击
   安装包手动更新 —— 而 .part1 在 Windows 上没有关联程序、双击不会运行。

   现在校验通过后同目录原子改名成最终名；目标已存在时不覆盖（加序号）。
   失败路径（校验不过 / 截断 / 中途出错）仍然清掉 .partN。
   ========================================================================== */

func TestDownloadArtifactHasFinalName(t *testing.T) {
	payload := []byte("fake-installer-content-for-testing")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "34")
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dir := t.TempDir()
	c := localClient(srv)
	res, err := c.Download(context.Background(), DownloadOptions{
		URL:       "https://github.com/o/r/releases/download/v0.2.0/LMPlayer-1.0-windows-x64.exe",
		AssetName: "LMPlayer-1.0-windows-x64.exe",
		TempDir:   dir,
		Channel:   ChannelAuto,
	})
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(res.Path) != "LMPlayer-1.0-windows-x64.exe" {
		t.Fatalf("下载产物名 = %q，期望最终文件名（.partN 双击运行不了）", filepath.Base(res.Path))
	}
	if ext := filepath.Ext(res.Path); ext != ".exe" {
		t.Fatalf("落盘文件名后缀是 %q，双击执行不了：%s", ext, res.Path)
	}
	got, err := os.ReadFile(res.Path)
	if err != nil {
		t.Fatalf("读回下载文件失败：%v", err)
	}
	if string(got) != string(payload) {
		t.Fatal("文件内容与预期不一致")
	}
	// 目录里不能再有 .partN 残渣（改名是原子的，旧名不该留下）
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.Contains(e.Name(), ".part") {
			t.Errorf("成功下载后仍留下临时文件 %s", e.Name())
		}
	}
}

func TestDownloadDoesNotOverwriteExistingFile(t *testing.T) {
	payload := []byte("new-installer-content")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(len(payload)))
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dir := t.TempDir()
	// 用户/上一次下载留在更新目录里的同名文件：绝不能被覆盖
	existing := filepath.Join(dir, "LMPlayer-1.0-windows-x64.exe")
	if err := os.WriteFile(existing, []byte("do-not-touch"), 0o644); err != nil {
		t.Fatal(err)
	}

	c := localClient(srv)
	res, err := c.Download(context.Background(), DownloadOptions{
		URL:       "https://github.com/o/r/releases/download/v0.2.0/LMPlayer-1.0-windows-x64.exe",
		AssetName: "LMPlayer-1.0-windows-x64.exe",
		TempDir:   dir,
		Channel:   ChannelAuto,
	})
	if err != nil {
		t.Fatal(err)
	}
	if same, _ := filepath.Abs(res.Path); same == existing {
		t.Fatalf("下载覆盖了已存在的文件：%s", existing)
	}
	kept, err := os.ReadFile(existing)
	if err != nil {
		t.Fatalf("已存在的文件被删掉了：%v", err)
	}
	if string(kept) != "do-not-touch" {
		t.Fatalf("已存在的文件内容被改写：%q", kept)
	}
	if ext := filepath.Ext(res.Path); ext != ".exe" {
		t.Fatalf("加序号后的文件名丢了扩展名，双击执行不了：%s", res.Path)
	}
	got, err := os.ReadFile(res.Path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(payload) {
		t.Fatal("新下载文件内容与预期不一致")
	}
}

func TestDownloadFailureLeavesNoPartFile(t *testing.T) {
	// 服务端声明 1000 字节却只发 5 字节：必须失败，且目录里什么都不留
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "1000")
		_, _ = w.Write([]byte("short"))
	}))
	defer srv.Close()

	dir := t.TempDir()
	_, err := localClient(srv).Download(context.Background(), DownloadOptions{
		URL:       "https://github.com/o/r/releases/download/v1/app.exe",
		AssetName: "app.exe",
		TempDir:   dir,
		Channel:   "direct",
	})
	if err == nil {
		t.Fatal("传输不完整时必须失败")
	}
	entries, readErr := os.ReadDir(dir)
	if readErr != nil {
		t.Fatal(readErr)
	}
	for _, e := range entries {
		t.Errorf("失败路径留下的文件：%s", e.Name())
	}
}
