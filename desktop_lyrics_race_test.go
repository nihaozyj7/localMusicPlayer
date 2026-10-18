package main

import (
	"sync"
	"testing"
	"time"
)

// TestDesktopLyricsSchedulePosSaveRaceFree 守「桌面歌词位置去抖的世代序号
// 与窗口移动事件并发时无数据竞争」。
//
// 回归的缺陷：nextPosSaveSeq 在 desktopMu 之外对 posSaveSeq 做 ++，而
// time.AfterFunc 的闭包又在锁外读同一个字段 —— go test -race 报写/读竞争。
// 现在分配与读取都在 desktopMu 里（见 desktop_lyrics.go）。
//
// 传 nil 窗口：位置落盘本身会被 saveDesktopLyricsPos 短路，这里只验证
// 去抖状态（timer + seq）的并发安全。
func TestDesktopLyricsSchedulePosSaveRaceFree(t *testing.T) {
	s := &WindowService{}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 300; j++ {
				s.scheduleDesktopLyricsPosSave(nil)
			}
		}()
	}
	wg.Wait()
	// 让去抖定时器回调也参与进来（它们会读世代号）
	time.Sleep(700 * time.Millisecond)
}
