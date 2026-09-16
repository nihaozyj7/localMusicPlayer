package media

import (
	"os"
	"path/filepath"
	"testing"
)

// TestClearCacheOnlyRemovesTranscodeArtifacts
//
// 「清空转码缓存」只能删本服务生成的 tc_*.wav。cacheDir 是用户可配置的，
// 而且会展示在设置界面里（见 ToolsInfo）—— 以前这里删掉目录下**所有** *.wav，
// 用户一旦把缓存目录指到音乐目录，「清空缓存」就是不可恢复的数据丢失。
func TestClearCacheOnlyRemovesTranscodeArtifacts(t *testing.T) {
	dir := t.TempDir()
	mine := filepath.Join(dir, "tc_abc123.wav")
	unrelated := filepath.Join(dir, "用户自己的录音.wav")
	otherTool := filepath.Join(dir, "t_other.wav")
	for _, p := range []string{mine, unrelated, otherTool} {
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	s := New(nil)
	s.SetCacheDir(dir)
	if err := s.ClearCache(); err != nil {
		t.Fatalf("ClearCache: %v", err)
	}

	if _, err := os.Stat(mine); !os.IsNotExist(err) {
		t.Errorf("本服务生成的转码产物应被删除")
	}
	for _, p := range []string{unrelated, otherTool} {
		if _, err := os.Stat(p); err != nil {
			t.Errorf("无关文件不应被删除: %s", filepath.Base(p))
		}
	}
}
