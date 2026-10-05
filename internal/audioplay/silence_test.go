/* ==========================================================================
   silence_test.go — 首尾静音检测与切歌间隔的单元测试
   --------------------------------------------------------------------------
   这两块都属于「错了不会崩，只会听起来不对」的逻辑，所以必须逐条钉住：

     · 静音检测  —— 多掐一点就是「歌的开头被吃掉」，少掐一点就是「功能没生效」；
     · 切歌间隔  —— 计时错了会让停顿忽长忽短，或者干脆吞掉整首歌。

   测试全部不依赖声卡：PCM 是现造的，间隔调度器是纯逻辑。
   ========================================================================== */

package audioplay

import (
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"testing"
)

/* --------------------------------------------------------------------------
   测试用 PCM 构造
   -------------------------------------------------------------------------- */

// pcmFramesOf 生成 n 帧指定幅度的样本（左右声道同值）
func pcmFramesOf(n int, amp int16) []byte {
	buf := make([]byte, n*FrameSize)
	for i := 0; i < n; i++ {
		binary.LittleEndian.PutUint16(buf[i*FrameSize:], uint16(amp))
		binary.LittleEndian.PutUint16(buf[i*FrameSize+2:], uint16(amp))
	}
	return buf
}

// silentFrames 生成 n 帧数字静音
func silentFrames(n int) []byte { return pcmFramesOf(n, 0) }

// loudFrames 生成 n 帧满幅度样本（肯定不是静音）
func loudFrames(n int) []byte { return pcmFramesOf(n, 20000) }

// concat 拼接若干段 PCM
func concat(parts ...[]byte) []byte {
	out := []byte{}
	for _, p := range parts {
		out = append(out, p...)
	}
	return out
}

// msFrames 把毫秒换算成帧数
func msFrames(ms int) int { return SampleRate * ms / 1000 }

// nearMs 判断两个毫秒值是否在容差之内。
//
// 为什么需要容差：扫描是把位置对齐到取样步长（64 帧 ≈ 1.45ms）的整数倍上的，
// 所以结论比真实值最多少一个步长。这个误差听不出来（1.5ms），
// 但断言必须容忍它 —— 否则测试会去追一个并不重要的精度。
const scanToleranceMs = 5

func nearMs(got, want int64) bool {
	d := got - want
	if d < 0 {
		d = -d
	}
	return d <= scanToleranceMs
}

// writeWAV 把一个 PCM 数据段写成带 44 字节标准头的 WAV 文件
func writeWAV(t *testing.T, path string, pcm []byte) {
	t.Helper()
	h := make([]byte, 0, 44)
	put32 := func(v uint32) { b := make([]byte, 4); binary.LittleEndian.PutUint32(b, v); h = append(h, b...) }
	put16 := func(v uint16) { b := make([]byte, 2); binary.LittleEndian.PutUint16(b, v); h = append(h, b...) }
	h = append(h, []byte("RIFF")...)
	put32(uint32(36 + len(pcm)))
	h = append(h, []byte("WAVE")...)
	h = append(h, []byte("fmt ")...)
	put32(16)
	put16(1)
	put16(Channels)
	put32(SampleRate)
	put32(SampleRate * FrameSize)
	put16(FrameSize)
	put16(16)
	h = append(h, []byte("data")...)
	put32(uint32(len(pcm)))
	if err := os.WriteFile(path, append(h, pcm...), 0o644); err != nil {
		t.Fatalf("写测试 WAV 失败: %v", err)
	}
}

/* --------------------------------------------------------------------------
   1. 扫描逻辑
   -------------------------------------------------------------------------- */

// TestScanSilenceHeadAndTail 基本形状：头 1 秒静音 + 2 秒声音 + 尾 3 秒静音。
func TestScanSilenceHeadAndTail(t *testing.T) {
	pcm := concat(silentFrames(msFrames(1000)), loudFrames(msFrames(2000)), silentFrames(msFrames(3000)))
	info := scanSilence(pcm)

	if got := info.HeadMs(); !nearMs(got, 1000) {
		t.Errorf("头部静音 = %dms，期望 ≈1000ms", got)
	}
	if got := info.TailMs(); !nearMs(got, 3000) {
		t.Errorf("尾部静音 = %dms，期望 ≈3000ms", got)
	}
	if want := int64(len(pcm) / FrameSize); info.TotalFrames != want {
		t.Errorf("总帧数 = %d，期望 %d", info.TotalFrames, want)
	}
}

// TestScanSilenceNoneWhenStartsAndEndsLoud 开头结尾都是声音时不能掐任何东西。
func TestScanSilenceNoneWhenStartsAndEndsLoud(t *testing.T) {
	pcm := concat(loudFrames(msFrames(500)), silentFrames(msFrames(2000)), loudFrames(msFrames(500)))
	info := scanSilence(pcm)

	// ★ 中间那 2 秒静音**不该**被算进去：跳过中间的静音会让歌词与音频错位，
	// 那不是这个功能的语义（它只管首尾）。
	if info.HeadFrames != 0 {
		t.Errorf("开头是声音，头部静音应为 0，实际 %dms", info.HeadMs())
	}
	if info.TailFrames != 0 {
		t.Errorf("结尾是声音，尾部静音应为 0，实际 %dms", info.TailMs())
	}
}

// TestScanSilenceIgnoresShortGaps 不足最短长度的静音不算「无声片段」。
//
// 这是最容易误伤用户的一处：乐句之间的呼吸只有几十毫秒，
// 把它当静音掐掉，听感就是「每次播放开头都被咬掉一口」。
func TestScanSilenceIgnoresShortGaps(t *testing.T) {
	// 头部只有 100ms 静音（低于 200ms 的门限）
	pcm := concat(silentFrames(msFrames(100)), loudFrames(msFrames(1000)))
	info := scanSilence(pcm)
	if info.HeadFrames != 0 {
		t.Errorf("100ms 的短静音不该算作可跳过的头部静音，实际 %dms", info.HeadMs())
	}

	// 尾部同理
	pcm2 := concat(loudFrames(msFrames(1000)), silentFrames(msFrames(100)))
	info2 := scanSilence(pcm2)
	if info2.TailFrames != 0 {
		t.Errorf("100ms 的短静音不该算作可跳过的尾部静音，实际 %dms", info2.TailMs())
	}
}

// TestScanSilenceBelowThresholdIsSilent 低于门限的底噪应当算静音。
//
// 真实场景：黑胶转录 / 老磁带抓轨的「空白段」并不是数字零，而是很低的底噪。
// 只认严格零的话，这类文件的功能等于没开。
func TestScanSilenceBelowThresholdIsSilent(t *testing.T) {
	// 幅度 50 ≈ -56 dBFS，在 -50 dBFS 门限之下
	noise := pcmFramesOf(msFrames(1000), 50)
	info := scanSilence(concat(noise, loudFrames(msFrames(500))))
	if got := info.HeadMs(); !nearMs(got, 1000) {
		t.Errorf("低电平底噪应判为静音，头部静音 = %dms，期望 ≈1000ms", got)
	}
}

// TestScanSilenceAboveThresholdIsNotSilent 正常弱奏不能被当成静音。
func TestScanSilenceAboveThresholdIsNotSilent(t *testing.T) {
	// 幅度 500 ≈ -36 dBFS：音乐里的弱奏段落大致在这个量级
	quietMusic := pcmFramesOf(msFrames(1000), 500)
	info := scanSilence(concat(quietMusic, loudFrames(msFrames(500))))
	if info.HeadFrames != 0 {
		t.Errorf("弱奏（-36dBFS）不是静音，不该被跳过，实际 %dms", info.HeadMs())
	}
}

// TestScanSilenceAllSilent 整首都是静音时头尾不能重叠（相加超过总长）。
func TestScanSilenceAllSilent(t *testing.T) {
	pcm := silentFrames(msFrames(3000))
	info := scanSilence(pcm)

	if info.HeadFrames+info.TailFrames > info.TotalFrames {
		t.Fatalf("头尾静音相加（%d+%d）超过了总长 %d —— 会让掐完的区间变成负数",
			info.HeadFrames, info.TailFrames, info.TotalFrames)
	}
	if info.TotalFrames != int64(msFrames(3000)) {
		t.Errorf("总帧数 = %d，期望 %d", info.TotalFrames, msFrames(3000))
	}
}

// TestScanSilenceEmpty 空输入不能 panic。
func TestScanSilenceEmpty(t *testing.T) {
	info := scanSilence(nil)
	if info.TotalFrames != 0 || info.HeadFrames != 0 || info.TailFrames != 0 {
		t.Errorf("空输入应当得到全零结果，实际 %+v", info)
	}
}

// TestScanSilenceSingleClickEndsSilence 静音里的一声咔哒也算声音（用峰值判定）。
//
// 为什么用峰值而不是平均值：平均值会把「很长静音 + 一个短促咔哒」抹平，
// 于是那段被当静音掐掉，用户听到的是「开头少了一点东西」。
func TestScanSilenceSingleClickEndsSilence(t *testing.T) {
	head := silentFrames(msFrames(1000))
	// 在第 800ms 处塞 1 帧满幅度
	clickAt := msFrames(800) * FrameSize
	for i := 0; i < FrameSize; i++ {
		head[clickAt+i] = 0
	}
	binary.LittleEndian.PutUint16(head[clickAt:], uint16(int16(30000)))
	binary.LittleEndian.PutUint16(head[clickAt+2:], uint16(int16(30000)))

	info := scanSilence(concat(head, loudFrames(msFrames(200))))
	if info.HeadMs() >= 1000 {
		t.Errorf("第 800ms 处有咔哒声，头部静音不该超过 800ms，实际 %dms", info.HeadMs())
	}
	if info.HeadMs() == 0 {
		t.Log("咔哒声落在取样点之外，头部静音仍为整段（可接受：取样步长 1.5ms）")
	}
}

/* --------------------------------------------------------------------------
   2. 文件扫描（含 44 字节头）
   -------------------------------------------------------------------------- */

// TestLoadSilenceInfoFile 文件版扫描必须跳过 44 字节 WAV 头。
//
// 头里全是文本（"RIFF" / "WAVE"…），如果没跳过，头部静音会被判成 0 ——
// 表现为「差不多每首歌的开头静音都跳不掉」。
func TestLoadSilenceInfoFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "with-header.wav")
	pcm := concat(silentFrames(msFrames(1500)), loudFrames(msFrames(2000)), silentFrames(msFrames(2500)))
	writeWAV(t, path, pcm)

	info, err := LoadSilenceInfo(path)
	if err != nil {
		t.Fatalf("扫描失败: %v", err)
	}
	if got := info.HeadMs(); !nearMs(got, 1500) {
		t.Errorf("头部静音 = %dms，期望 ≈1500ms（WAV 头没被跳过？）", got)
	}
	if got := info.TailMs(); !nearMs(got, 2500) {
		t.Errorf("尾部静音 = %dms，期望 ≈2500ms", got)
	}
}

// TestLoadSilenceInfoCacheInvalidates 文件被替换后缓存必须失效。
//
// 判据是「路径 + 大小 + 修改时间」：同名文件换成另一首歌时结论会变，
// 缓存不失效的话用户会听到「换过的歌还用着上一首的掐点」。
func TestLoadSilenceInfoCacheInvalidates(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "swap.wav")

	writeWAV(t, path, concat(silentFrames(msFrames(1000)), loudFrames(msFrames(1000))))
	first, err := LoadSilenceInfo(path)
	if err != nil {
		t.Fatalf("首次扫描失败: %v", err)
	}
	if !nearMs(first.HeadMs(), 1000) {
		t.Fatalf("首次扫描头部静音 = %dms，期望 ≈1000ms", first.HeadMs())
	}

	// 换成一个「开头就是声音」的文件（大小也不同，触发失效）
	writeWAV(t, path, concat(loudFrames(msFrames(3000)), silentFrames(msFrames(500))))
	second, err := LoadSilenceInfo(path)
	if err != nil {
		t.Fatalf("再次扫描失败: %v", err)
	}
	if second.HeadMs() != 0 {
		t.Errorf("文件已替换，头部静音应为 0，实际 %dms（缓存没失效？）", second.HeadMs())
	}
}

// TestLoadSilenceInfoMissingFile 文件不存在时返回错误而不是 panic。
func TestLoadSilenceInfoMissingFile(t *testing.T) {
	if _, err := LoadSilenceInfo(filepath.Join(t.TempDir(), "nope.wav")); err == nil {
		t.Error("文件不存在时应当返回错误")
	}
}

/* --------------------------------------------------------------------------
   2b. 预登记（转码顺手扫出来的结论）
   --------------------------------------------------------------------------
   转码播放链路本来就要把整首歌解码一遍，顺手已把首尾静音扫了
   （见 internal/media 的 transcode）。装载时若再调 LoadSilenceInfo 去扫文件，
   就是拿同一份数据又读一次盘 —— 一首 10 分钟的歌是 105MB。
   PrimeSilenceInfo 让那份结论直接进缓存，于是装载路径一次盘都不用读。
   -------------------------------------------------------------------------- */

// TestPrimeSilenceInfoSkipsFileRead 预登记后 LoadSilenceInfo 必须直接命中，
// 不再去读文件。
//
// 验法是「先把文件删掉」：如果实现仍然去扫描文件，就会因为文件不存在而报错；
// 而正确的实现应当照样返回预登记的那份结论。
func TestPrimeSilenceInfoSkipsFileRead(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "primed.wav")
	// 文件内容故意与预登记的值**不一致**：如果实现真去扫了文件，
	// 拿到的就会是扫描结果（全静音 → 头尾都被判成静音），而不是我们填的值。
	writeWAV(t, path, silentFrames(msFrames(5000)))

	wantHead := int64(msFrames(1200))
	wantTail := int64(msFrames(800))
	wantTotal := int64(msFrames(20000))
	PrimeSilenceInfo(path, wantHead, wantTail, wantTotal)

	// 删掉文件：扫描路径必然失败，只有"命中缓存"才能成功
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	info, err := LoadSilenceInfo(path)
	if err != nil {
		t.Fatalf("预登记后应当直接命中缓存（文件已删，说明还是去扫了盘）: %v", err)
	}
	if info.HeadFrames != wantHead || info.TailFrames != wantTail || info.TotalFrames != wantTotal {
		t.Errorf("返回的是 %+v，期望 head=%d tail=%d total=%d（预登记的值没生效？）",
			info, wantHead, wantTail, wantTotal)
	}
}

// TestPrimeSilenceInfoInvalidatedByFileChange 文件变了之后预登记必须失效。
//
// key 与真扫描共用「路径 + 大小 + 修改时间」，所以换过文件之后不能再采用
// 旧结论 —— 否则用户会听到「换过的歌还用着上一首的掐点」。
func TestPrimeSilenceInfoInvalidatedByFileChange(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "swapped.wav")

	writeWAV(t, path, concat(silentFrames(msFrames(1000)), loudFrames(msFrames(2000))))
	// 预登记一份"头部 1000ms 静音"（与真实内容一致）
	PrimeSilenceInfo(path, int64(msFrames(1000)), 0, int64(msFrames(3000)))

	info, err := LoadSilenceInfo(path)
	if err != nil {
		t.Fatal(err)
	}
	if !nearMs(info.HeadMs(), 1000) {
		t.Fatalf("预登记应生效：头部 = %dms，期望 ≈1000ms", info.HeadMs())
	}

	// 换成"开头就是声音"的文件（大小不同 → key 变了）
	writeWAV(t, path, concat(loudFrames(msFrames(4000)), silentFrames(msFrames(300))))
	after, err := LoadSilenceInfo(path)
	if err != nil {
		t.Fatal(err)
	}
	if after.HeadMs() != 0 {
		t.Errorf("文件已替换，头部静音应为 0，实际 %dms（预登记没失效？）", after.HeadMs())
	}
}

// TestPrimeSilenceInfoRejectsBadInput 非法输入必须被忽略，而不是写进坏结论。
//
// 「跳过静音」一旦拿到错的结论就会掐掉音乐本身 —— 那比慢一点严重得多，
// 所以这里宁可什么都不做（退回真扫描）。
func TestPrimeSilenceInfoRejectsBadInput(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.wav")
	writeWAV(t, path, concat(silentFrames(msFrames(1000)), loudFrames(msFrames(2000))))

	// 负数：忽略
	PrimeSilenceInfo(path, -1, 0, 100)
	PrimeSilenceInfo(path, 0, -1, 100)
	PrimeSilenceInfo(path, 0, 0, -1)
	// 空路径：忽略
	PrimeSilenceInfo("", 10, 10, 100)

	// 上面都不该写进缓存 —— 真扫描拿到的应当是文件真实内容（头 1000ms）
	info, err := LoadSilenceInfo(path)
	if err != nil {
		t.Fatal(err)
	}
	if !nearMs(info.HeadMs(), 1000) {
		t.Errorf("非法预登记不该生效：头部 = %dms，期望真扫描得到的 ≈1000ms", info.HeadMs())
	}
}

// TestPrimeSilenceInfoClampsOverlap 头尾相加超过总长时要收口。
//
// 整首歌都静音时，头尾各自都会被判成"全部"；相加超过总长会让
// PlanSilenceTrim 算出一个负长度区间（EndFrame < StartFrame），
// 进而让进度条除以零长度、用户看到"点了没反应"。
func TestPrimeSilenceInfoClampsOverlap(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "overlap.wav")
	writeWAV(t, path, silentFrames(msFrames(1000)))

	total := int64(msFrames(1000))
	// 头 900 + 尾 900 > total 1000：必须被收口
	PrimeSilenceInfo(path, 900, 900, total)

	info, err := LoadSilenceInfo(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.HeadFrames+info.TailFrames > info.TotalFrames {
		t.Errorf("头 %d + 尾 %d 超过了总长 %d（没收口）",
			info.HeadFrames, info.TailFrames, info.TotalFrames)
	}
	// 掐点方案必须是合法的（不能出现 EndFrame < StartFrame）
	trim := PlanSilenceTrim(info, true, true)
	if trim.EndFrame < trim.StartFrame {
		t.Errorf("掐点区间非法: [%d, %d)", trim.StartFrame, trim.EndFrame)
	}
}

// TestPrimeSilenceInfoMissingFileNoop 文件不存在时预登记应当安静地什么都不做。
//
// 这条路会在"转码产物被 LRU 淘汰掉"时走到：那时 ScanSilence 给的路径已经
// 不在了，预登记无从谈起（拿不到 size/modTime 做 key），直接跳过即可。
func TestPrimeSilenceInfoMissingFileNoop(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gone.wav")
	// 不该 panic，也不该产生任何缓存条目
	PrimeSilenceInfo(path, 100, 100, 1000)
	if _, err := LoadSilenceInfo(path); err == nil {
		t.Error("文件不存在时 LoadSilenceInfo 仍应报错（说明预登记凭空造了条目）")
	}
}

/* --------------------------------------------------------------------------
   3. 决策（开关 → 掐点）
   -------------------------------------------------------------------------- */

// TestPlanSilenceTrimSwitches 两个开关必须**分别**生效。
func TestPlanSilenceTrimSwitches(t *testing.T) {
	info := SilenceInfo{
		HeadFrames:  int64(msFrames(1000)),
		TailFrames:  int64(msFrames(2000)),
		TotalFrames: int64(msFrames(10000)),
	}

	// 都关：原样播放
	both := PlanSilenceTrim(info, false, false)
	if both.StartFrame != 0 || both.EndFrame != info.TotalFrames {
		t.Errorf("开关都关时应原样播放，实际 [%d, %d)", both.StartFrame, both.EndFrame)
	}
	if both.SkippedHeadMs != 0 || both.SkippedTailMs != 0 {
		t.Errorf("开关都关时不该报告跳过，实际头 %d / 尾 %d", both.SkippedHeadMs, both.SkippedTailMs)
	}

	// 只开头
	head := PlanSilenceTrim(info, true, false)
	if head.StartFrame != info.HeadFrames {
		t.Errorf("只开「跳过开头」时起播位置 = %d，期望 %d", head.StartFrame, info.HeadFrames)
	}
	if head.EndFrame != info.TotalFrames {
		t.Errorf("只开「跳过开头」时结束位置不该变，实际 %d", head.EndFrame)
	}
	if head.SkippedTailMs != 0 {
		t.Errorf("只开「跳过开头」时不该报告跳过尾部，实际 %dms", head.SkippedTailMs)
	}

	// 只结尾
	tail := PlanSilenceTrim(info, false, true)
	if tail.StartFrame != 0 {
		t.Errorf("只开「跳过结尾」时起播位置应为 0，实际 %d", tail.StartFrame)
	}
	if tail.EndFrame != info.TotalFrames-info.TailFrames {
		t.Errorf("只开「跳过结尾」时结束位置 = %d，期望 %d", tail.EndFrame, info.TotalFrames-info.TailFrames)
	}

	// 都开
	bothOn := PlanSilenceTrim(info, true, true)
	if bothOn.SkippedHeadMs != 1000 || bothOn.SkippedTailMs != 2000 {
		t.Errorf("都开时跳过量 = 头 %d / 尾 %d，期望 1000 / 2000", bothOn.SkippedHeadMs, bothOn.SkippedTailMs)
	}
	if !bothOn.Playing() {
		t.Error("掐完还有内容，Playing 应为 true")
	}
}

// TestPlanSilenceTrimNeverNegative 掐点顺序颠倒时不能出现负区间。
//
// 场景：文件几乎全是静音，头 + 尾的静音长度超过了总长。
// 让 EndFrame < StartFrame 会让位置计算出现零长度区间，
// 前端拿 duration=0 去做除法就是 NaN（进度条直接坏掉）。
func TestPlanSilenceTrimNeverNegative(t *testing.T) {
	info := SilenceInfo{
		HeadFrames:  int64(msFrames(900)),
		TailFrames:  int64(msFrames(900)),
		TotalFrames: int64(msFrames(1000)), // 头尾相加超过总长
	}
	trim := PlanSilenceTrim(info, true, true)
	if trim.EndFrame < trim.StartFrame {
		t.Fatalf("结束位置 %d 小于起播位置 %d —— 区间为负", trim.EndFrame, trim.StartFrame)
	}
}

// TestSilenceTrimPlayingZeroLength 掐成零长度时必须能被识别出来。
//
// 调用方据此退回「不掐」：否则用户点播放会看到「没反应」
// （零长度的音频区间什么都放不出来）。
func TestSilenceTrimPlayingZeroLength(t *testing.T) {
	empty := SilenceTrim{StartFrame: 100, EndFrame: 100, TotalFrames: 100}
	if empty.Playing() {
		t.Error("零长度区间不该报告「还有内容可放」")
	}
	ok := SilenceTrim{StartFrame: 0, EndFrame: 100, TotalFrames: 100}
	if !ok.Playing() {
		t.Error("有长度区间应当报告可播放")
	}
}

/* --------------------------------------------------------------------------
   4. 切歌间隔调度器
   -------------------------------------------------------------------------- */

// TestGapSchedulerNoGapFiresImmediately 没配置间隔时 Arm 必须返回 false
// （调用方据此立刻切歌，与历史行为一致）。
func TestGapSchedulerNoGapFiresImmediately(t *testing.T) {
	g := NewGapScheduler()
	if g.Arm(func() { t.Error("不该在没配置间隔时被调用") }) {
		t.Error("没配置间隔时 Arm 应返回 false（立刻切歌）")
	}
	if g.Active() {
		t.Error("没配置间隔时不该处于间隔中")
	}
}

// TestGapSchedulerWaitsFullInterval 间隔必须按「音频帧数」走满。
func TestGapSchedulerWaitsFullInterval(t *testing.T) {
	g := NewGapScheduler()
	g.SetGapSeconds(1.5)

	if got := g.GapSeconds(); math.Abs(got-1.5) > 0.001 {
		t.Fatalf("间隔 = %v 秒，期望 1.5", got)
	}

	fired := 0
	if !g.Arm(func() { fired++ }) {
		t.Fatal("配置了间隔时 Arm 应返回 true（先别切歌）")
	}
	if !g.Active() {
		t.Fatal("Arm 之后应当处于间隔中")
	}

	// 走 1.4 秒：还没到点
	consumed := 0
	total := int(1.5 * SampleRate)
	for consumed+PeriodFrames < int(1.4*SampleRate) {
		if !g.Tick(PeriodFrames) {
			t.Fatalf("才走了 %.2f 秒就结束了间隔", float64(consumed)/SampleRate)
		}
		consumed += PeriodFrames
	}
	if fired != 0 {
		t.Fatalf("间隔未走完就触发了回调（已走 %d 帧，需要 %d 帧）", consumed, total)
	}

	// 走满：必须触发且只触发一次
	for consumed < total {
		g.Tick(PeriodFrames)
		consumed += PeriodFrames
	}
	// 再多走几个回调：不能重复触发（否则会连跳好几首）
	g.Tick(PeriodFrames)
	g.Tick(PeriodFrames)

	if fired != 1 {
		t.Errorf("间隔走完后回调次数 = %d，期望恰好 1 次", fired)
	}
	if g.Active() {
		t.Error("间隔走完后不该仍处于间隔中")
	}
}

// TestGapSchedulerCancel 取消后不能再触发切歌。
//
// 真实场景：用户在间隔里点了「下一首」或按了暂停 —— 那一下是明确的即时意图，
// 不该等剩下的半秒，更不该在之后又被自动切走一首。
func TestGapSchedulerCancel(t *testing.T) {
	g := NewGapScheduler()
	g.SetGapSeconds(2)
	g.Arm(func() { t.Error("间隔已取消，不该触发切歌回调") })
	g.Cancel()

	if g.Active() {
		t.Error("Cancel 之后不该仍处于间隔中")
	}
	for i := 0; i < 200; i++ {
		g.Tick(PeriodFrames)
	}
}

// TestGapSchedulerReArmDoesNotRestart 重复 Arm 不能把间隔重新计时。
//
// 音频回调可能因为缓冲边界连续判定两次「播完」（比如掐点恰好落在缓冲中间）。
// 重新计时会让间隔变成「1.5 秒 + 1.5 秒」，用户听到的是异常长的停顿。
func TestGapSchedulerReArmDoesNotRestart(t *testing.T) {
	g := NewGapScheduler()
	g.SetGapSeconds(1)
	fired := 0
	g.Arm(func() { fired++ })

	// 走掉一半
	half := int(0.5 * SampleRate)
	for c := 0; c < half; c += PeriodFrames {
		g.Tick(PeriodFrames)
	}
	// 再来一次 Arm：必须被无视（已经在间隔中）
	if !g.Arm(func() { fired++ }) {
		t.Fatal("已在间隔中时 Arm 应返回 true（继续等）")
	}

	// 再走完剩下的一半就该触发
	for c := 0; c < half; c += PeriodFrames {
		g.Tick(PeriodFrames)
	}
	if fired != 1 {
		t.Errorf("回调次数 = %d，期望 1（重复 Arm 不该重新计时）", fired)
	}
}

// TestGapSchedulerZeroGap 显式设 0 必须等价于「立刻切歌」。
func TestGapSchedulerZeroGap(t *testing.T) {
	g := NewGapScheduler()
	g.SetGapSeconds(0.0)
	if g.HasGap() {
		t.Error("0 秒间隔不该报告「有间隔」")
	}
	if g.Arm(nil) {
		t.Error("0 秒间隔时 Arm 应返回 false")
	}
}

// TestGapSchedulerNegativeGap 负值按 0 处理（不能变成「往回等」）。
func TestGapSchedulerNegativeGap(t *testing.T) {
	g := NewGapScheduler()
	g.SetGapSeconds(-5)
	if g.HasGap() {
		t.Error("负间隔应当按 0 处理")
	}
	if g.GapSeconds() < 0 {
		t.Errorf("间隔 = %v，不该为负", g.GapSeconds())
	}
}

/* --------------------------------------------------------------------------
   5. 引擎：掐点与结束位置
   -------------------------------------------------------------------------- */

func newEngineForSilenceTest(t *testing.T, path string, start, end int64) *Engine {
	t.Helper()
	e := New()
	// 不 Open 声卡：这些用例只验证区间计算（Position / TrimRange / EOF），
	// 它们全是纯记账逻辑，不需要设备。CI 上没有声卡时也能跑。
	if err := e.Load(path, start, end, 1); err != nil {
		t.Fatalf("Load 失败: %v", err)
	}
	return e
}

// TestEngineTrimRangeReported 装载时的掐点必须能被诊断接口读出来。
func TestEngineTrimRangeReported(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "trim.wav")
	pcm := concat(silentFrames(msFrames(1000)), loudFrames(msFrames(8000)), silentFrames(msFrames(1000)))
	writeWAV(t, path, pcm)

	e := newEngineForSilenceTest(t, path, int64(msFrames(1000)), int64(msFrames(9000)))
	defer e.Close()

	start, end, total := e.TrimRange()
	if start != int64(msFrames(1000)) {
		t.Errorf("起播帧 = %dms，期望 1000ms", frameToMs(start))
	}
	if end != int64(msFrames(9000)) {
		t.Errorf("结束帧 = %dms，期望 9000ms", frameToMs(end))
	}
	if total != int64(msFrames(10000)) {
		t.Errorf("总帧数 = %dms，期望 10000ms", frameToMs(total))
	}
}

// TestEnginePositionDurationFollowsTrim 时长恒为整首歌，位置是原时间轴上的绝对位置。
//
// ★ 这是「跳过静音」的语义核心：**自动跳过 ≠ 把歌变短**。
//
//	一首 10 秒的歌（头 1 秒静音 + 6 秒声音 + 尾 3 秒静音），两个开关都开：
//	 · 时长仍然是 10 秒 —— 进度条按整首歌铺开；
//	 · 起播位置是 1 秒（用户听到的第一声就是音乐，但「这首歌从哪开始」不变）；
//	 · 位置走到 7 秒就结束（不去听那 3 秒空白）。
//
// 位置必须是原时间轴上的绝对位置，否则歌词会整体提前
// （歌词按原曲打轴，开头静音多长就偏多少），记忆进度也会对不上。
func TestEnginePositionDurationFollowsTrim(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "dur.wav")
	pcm := concat(silentFrames(msFrames(1000)), loudFrames(msFrames(6000)), silentFrames(msFrames(3000)))
	writeWAV(t, path, pcm)

	// 头掐 1 秒、尾掐 3 秒：可播放区间是 [1s, 7s)，但整首歌仍是 10 秒
	e := newEngineForSilenceTest(t, path, int64(msFrames(1000)), int64(msFrames(7000)))
	defer e.Close()

	// Position() 返回的**已经是毫秒**（不要再换算一次）
	pos, dur := e.Position()
	if !nearMs(pos, 1000) {
		t.Errorf("起播位置 = %dms，期望 ≈1000ms（原时间轴上，跳过开头静音之后的位置）", pos)
	}
	if !nearMs(dur, 10000) {
		t.Errorf("时长 = %dms，期望 ≈10000ms（整首歌原长，不该因为跳过静音而变短）", dur)
	}

	// 起播点要能单独查到：它就是「实际从哪里开始出声」
	if got := e.TrimStart(); !nearMs(got, 1000) {
		t.Errorf("TrimStart = %dms，期望 ≈1000ms", got)
	}

	// 掐点相对文件的位置仍然要能查到（诊断用）
	start, end, total := e.TrimRange()
	if !nearMs(frameToMs(start), 1000) || !nearMs(frameToMs(end), 7000) || !nearMs(frameToMs(total), 10000) {
		t.Errorf("TrimRange = [%d, %d) / %d，期望 ≈[1000, 7000) / 10000",
			frameToMs(start), frameToMs(end), frameToMs(total))
	}
}

// TestEngineLoadZeroEndMeansFullFile endFrame=0 必须表示「播到文件末尾」。
func TestEngineLoadZeroEndMeansFullFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "full.wav")
	writeWAV(t, path, loudFrames(msFrames(2000)))

	e := newEngineForSilenceTest(t, path, 0, 0)
	defer e.Close()

	_, end, total := e.TrimRange()
	if end != total {
		t.Errorf("endFrame=0 时结束位置 = %d，期望文件总长 %d", end, total)
	}
}

// TestEngineSeekClampedToTrimEnd 拖到最右必须停在掐点，而不是文件末尾的静音里。
func TestEngineSeekClampedToTrimEnd(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "seek.wav")
	pcm := concat(loudFrames(msFrames(5000)), silentFrames(msFrames(5000)))
	writeWAV(t, path, pcm)

	// 尾部 5 秒静音被跳过：**实际会播**的区间是 [0, 5000ms)，
	// 但整首歌的时间轴仍是 10 秒。
	e := newEngineForSilenceTest(t, path, 0, int64(msFrames(5000)))
	defer e.Close()

	// 请求跳到 9 秒（在跳过的那段尾部静音里）
	if err := e.SeekToFrame(int64(msFrames(9000))); err != nil {
		t.Fatalf("SeekToFrame 失败: %v", err)
	}
	// Position() 返回的已经是毫秒
	pos, dur := e.Position()
	if !nearMs(pos, 5000) {
		t.Errorf("seek 后的位置 = %dms，期望被钳到 5000ms（跳过区间的终点）", pos)
	}
	// 时长仍是整首歌：进度条走到 5000/10000 = 一半就结束，
	// 这是「自动跳过」的正常表现（后面那 5 秒本来就不会播）
	if !nearMs(dur, 10000) {
		t.Errorf("时长 = %dms，期望 ≈10000ms（整首歌原长）", dur)
	}
}

// TestEngineCancelTrackGap 手动切歌时必须能取消还挂着的间隔。
func TestEngineCancelTrackGap(t *testing.T) {
	e := New()
	defer e.Close()
	e.SetTrackGapSeconds(5)
	if !e.gap.HasGap() {
		t.Fatal("设置间隔后应当报告「有间隔」")
	}

	fired := 0
	e.gap.Arm(func() { fired++ })
	if !e.TrackGapActive() {
		t.Fatal("Arm 之后应当处于间隔中")
	}
	e.CancelTrackGap()
	if e.TrackGapActive() {
		t.Error("CancelTrackGap 之后不该仍处于间隔中")
	}
	if fired != 0 {
		t.Error("取消之后不该触发切歌回调")
	}
}
