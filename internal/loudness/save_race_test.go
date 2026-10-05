package loudness

import (
	"fmt"
	"path/filepath"
	"sync"
	"testing"
)

// TestSaveConcurrentWithWrites 是「锁内复制 map」修复的回归测试。
//
// 修复前 Save 把 m.items / m.albums 的**引用**放进 cacheFile，Unlock 之后才
// json.Marshal —— 也就是无锁遍历一张仍会被写入的 map。Go 里这是
// fatal error: concurrent map iteration and map write（不可 recover），
// 不是可以被 -race 温和报告的普通数据竞争。
//
// ★ 现在多了一张 gains（两级 map），Save 同样必须锁内深拷贝它 ——
// 这个用例把它一起覆盖了：写者会同时写 items / gains / albums。
//
// 这个用例必须与 -race 一起跑才有意义：
//
//	go test -race ./internal/loudness/
func TestSaveConcurrentWithWrites(t *testing.T) {
	m := NewManager(t.TempDir(), 2)

	const writers = 8
	const rounds = 40
	var wg sync.WaitGroup

	for w := 0; w < writers; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 0; i < rounds; i++ {
				path := filepath.Join("album", fmt.Sprintf("song-%d-%d.mp3", w, i))
				key := keyFor(path, int64(i), int64(w))
				id := fmt.Sprintf("t_%d_%d", w, i)
				item := Measurement{
					Path: path, Size: int64(i), ModTime: int64(w),
					Algo: AlgoVersion, Integrated: -14.5, Measured: true,
				}

				m.mu.Lock()
				m.items[key] = item
				// 每首歌写两个挡位的增益：Save 必须把两级 map 都深拷贝，
				// 不然 json.Marshal 会在第二层 map 上撞见并发写入。
				m.putGainLocked(id, -14, -0.5)
				m.putGainLocked(id, -16, -1.5)
				m.albums["album"] = Album{Integrated: -14, Count: i + 1, Target: -14}
				m.dirty = true
				m.mu.Unlock()

				// 与写入并发地反复落盘：修复前这里会（间歇性地）崩在
				// json.Marshal 遍历 map 上
				if err := m.Save(); err != nil {
					t.Errorf("Save: %v", err)
					return
				}
			}
		}(w)
	}
	wg.Wait()
}
