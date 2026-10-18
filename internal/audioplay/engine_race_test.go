package audioplay

import (
	"path/filepath"
	"sync"
	"testing"
)

// TestEngineLoadAndPositionRaceFree 守「Load 换歌与位置查询可以并发」。
//
// 回归的缺陷：pcmSize 由 Load 在 e.mu 内写，而 Position / TrimRange 不持
// 任何锁读它 —— go test -race 报 Load 写 vs Position/TrimRange 读。
// pcmSize 现在与 positionFrame / endFrame 同由 posMu 保护。
func TestEngineLoadAndPositionRaceFree(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "race.wav")
	writeWAV(t, path, pcmFramesOf(msFrames(200), 8000))

	e := New()
	defer e.Close()

	stop := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
			}
			e.Position()
			e.TrimRange()
			e.Buffered()
		}
	}()

	for i := 0; i < 200; i++ {
		if err := e.Load(path, 0, 0, 1); err != nil {
			t.Fatalf("Load: %v", err)
		}
	}
	close(stop)
	wg.Wait()
}
