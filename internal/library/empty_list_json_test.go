package library

import (
	"encoding/json"
	"testing"
)

// TestEmptyListsMarshalAsArrayNotNil 守住「空的曲库 / 空的文件夹列表」的序列化形状。
//
// ★ 为什么值得单独测：Wails 把 Go 的 **nil 切片**序列化成 JSON `null`（不是 `[]`），
// 而前端对 `songs` / `folders` 这两个绑定一律是「`if (Array.isArray(x))` 才更新状态」——
// `null` 被当成「这次没拿到数据」，于是**保留旧列表**。
//
// 真实故障（用户报的「删掉的歌还在曲库里，只有播放时才说文件不存在」）：
// 把下载目录里的歌删干净后重扫，后端曲库已经是空的，Songs() 返回 nil 切片，
// 前端收到 null 就把旧歌曲列表原样留着。
//
// 所以这里断言的不是「空」也不是「非空」，而是**序列化后的形状必须是 `[]`**。
func TestEmptyListsMarshalAsArrayNotNil(t *testing.T) {
	// 曲库：newTestManager 之后还没扫过任何东西
	m, _, _ := newTestManager(t)
	assertJSONArray(t, "Songs", m.Songs())

	// 文件夹：newTestManager 一定会造出一个隐式下载根（EffectiveFolders），
	// 拿不到空列表；这里直接用零值 Manager 覆盖「一个扫描根都没有」的情况。
	assertJSONArray(t, "Folders", (&Manager{}).Folders())
}

// assertJSONArray 断言 v 序列化后是空数组而不是 null。
func assertJSONArray(t *testing.T, name string, v any) {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("序列化 %s 失败: %v", name, err)
	}
	if string(raw) != "[]" {
		t.Fatalf("%s 的空列表必须序列化成 []（Wails 会把 nil 切片变成 null，前端只认数组），实际 %s", name, raw)
	}
}
