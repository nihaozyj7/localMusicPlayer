package lyricsfetch

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/url"
	"strconv"
	"strings"
)

/* ==========================================================================
   酷狗音乐（Kugou）—— 能匿名拿到「字级（逐字）」歌词的来源之一
   --------------------------------------------------------------------------
   为什么值得单独接一个来源：需求是「有逐字就播逐字，没有才用逐行」，而
   2026-10 实测下来，三个老来源**都拿不到字级歌词**：

     · 网易云 /api/song/lyric：返回体里一直有 klyric / yrc 两个字段，但带上
       yrcVersion=1（或 lv/kv=-1）之后对匿名请求一律是空的（连《晴天》《稻香》
       这种大热歌都是空的）；带逐字的那两份需要登录态。
     · QQ 音乐：老接口只回行级；带逐字的 QRC 走 musicu 接口，回的是一串密文，
       要先把那套「位序被重排过的 3DES」实现对（2026-01 才补上，见 qq_qrc.go）
       —— 在那之前 QQ 事实上只有行级。
     · LRCLIB：格式本身没有逐字，只有行级。

   酷狗这边两步都是公开接口、不需要登录：

     搜索  /song_search_v2?keyword=…             → 歌名/歌手/时长/FileHash
     反查  krcs.kugou.com/search?hash=…&duration=… → KRC 的 id + accesskey
     下载  lyrics.kugou.com/download?fmt=krc|lrc   → KRC（逐字）或 LRC（行级）

   反查时**必须带 hash**：只给关键词时接口回的两条字段（song/singer）会
   跟着关键词顺序漂移（实测把歌名和歌手写反），带上 hash 之后歌名/歌手
   就稳定正确了 —— 所以候选 ID 里存的是 hash 与时长，而不是关键词。
   ========================================================================== */

type kugouProvider struct {
	searchURL   string
	lookupURL   string
	downloadURL string
	// noWordLevel 为真时不要字级（KRC）歌词，只取行级 LRC。
	//
	// 用「反向」字段而不是 wordLevel：测试与调用方用复合字面量构造本类型，
	// 零值必须等于「行为与加入这个开关之前一致」（即要字级）。
	noWordLevel bool
}

func NewKugou() Provider {
	return &kugouProvider{
		searchURL:   "https://songsearch.kugou.com/song_search_v2",
		lookupURL:   "https://krcs.kugou.com/search",
		downloadURL: "https://lyrics.kugou.com/download",
	}
}

// Name 来源 id。
//
// 注意：frontend/tests/provider-names.test.js 用正则从本文件里抠
// `Name() string { return "…" }`，显示名与分组清单（provider-names.js）要跟着加。
func (p *kugouProvider) Name() string { return "kugou" }

// HasWordLevel 酷狗可能给出字级歌词（KRC）。
//
// 声明它的用处见 Aggregator.Match：自动匹配在拿到行级结果后，会为「声明了
// 字级能力」的来源多花一次请求 —— 否则酷狗会被排在前面的行级来源永远压住。
//
// 用户在设置里关掉字级歌词后返回 false（见 WordLevelToggle）。
func (p *kugouProvider) HasWordLevel() bool { return !p.noWordLevel }

// SetWordLevelEnabled 关掉后不再请求/解析 KRC（见 Fetch）。
func (p *kugouProvider) SetWordLevelEnabled(on bool) { p.noWordLevel = !on }

// kugouItem 一条酷狗搜索结果。
//
// 字段名是接口原样（大驼峰）；时长是**秒**，与库里的毫秒不一致，转换在
// kugouCandidate 里做，别在外面直接减。
type kugouItem struct {
	SongName   string `json:"SongName"`
	SingerName string `json:"SingerName"`
	AlbumName  string `json:"AlbumName"`
	Duration   int64  `json:"Duration"`
	FileHash   string `json:"FileHash"`
}

type kugouSearchResp struct {
	Status int `json:"status"`
	Data   struct {
		// song_search_v2 回 lists；接口的另一个版本回 info，两个都认。
		Lists []kugouItem `json:"lists"`
		Info  []kugouItem `json:"info"`
	} `json:"data"`
}

func (p *kugouProvider) Search(ctx context.Context, req SearchRequest) ([]Candidate, error) {
	q := strings.TrimSpace(req.Keyword)
	if q == "" {
		q = strings.TrimSpace(req.Title + " " + req.Artist)
	}
	if q == "" {
		return nil, nil
	}

	params := url.Values{
		"keyword":          {q},
		"page":             {"1"},
		"pagesize":         {"10"},
		"platform":         {"WebFilter"},
		"userid":           {"-1"},
		"clientver":        {"2000"},
		"iscorrection":     {"1"},
		"privilege_filter": {"0"},
		"filter":           {"10"},
		"appid":            {"1014"},
	}
	var resp kugouSearchResp
	if err := fetchJSON(ctx, p.searchURL+"?"+params.Encode(), kugouHeaders(), &resp); err != nil {
		return nil, err
	}
	if !kugouOK(resp.Status) {
		return nil, fmt.Errorf("kugou: 搜索接口返回 status %d", resp.Status)
	}

	items := resp.Data.Lists
	if len(items) == 0 {
		items = resp.Data.Info
	}
	out := make([]Candidate, 0, len(items))
	for _, it := range items {
		if c, ok := kugouCandidate(it); ok {
			out = append(out, c)
		}
	}
	return out, nil
}

// kugouCandidate 把一条搜索结果转成候选；没有 hash 的条目用不了（反查 KRC 要它）。
func kugouCandidate(it kugouItem) (Candidate, bool) {
	hash := strings.TrimSpace(it.FileHash)
	if hash == "" || strings.TrimSpace(it.SongName) == "" {
		return Candidate{}, false
	}
	return Candidate{
		ID:        hash + "_" + strconv.FormatInt(it.Duration, 10),
		Provider:  "kugou",
		Title:     it.SongName,
		Artist:    it.SingerName,
		Album:     it.AlbumName,
		Duration:  it.Duration * 1000,
		HasLyrics: true,
		raw:       it,
	}, true
}

// kugouRef 从候选 ID 里解出来的「反查 KRC 要用的东西」。
//
// ID 形如 <FileHash>_<时长秒>，例如 B3A52A…_269。之所以把时长也塞进 ID：
// krcs 反查在只给 hash 时最好再带一个时长，能避开同名翻唱的歌词。
type kugouRef struct {
	hash    string
	seconds int64
}

func parseKugouID(id string) kugouRef {
	hash, tail, found := strings.Cut(strings.TrimSpace(id), "_")
	ref := kugouRef{hash: hash}
	if found {
		if n, err := strconv.ParseInt(tail, 10, 64); err == nil && n > 0 {
			ref.seconds = n
		}
	}
	return ref
}

type kugouLookupResp struct {
	Status     int `json:"status"`
	Candidates []struct {
		ID        string `json:"id"`
		AccessKey string `json:"accesskey"`
		Duration  int64  `json:"duration"` // 毫秒
		Song      string `json:"song"`
		Singer    string `json:"singer"`
	} `json:"candidates"`
}

type kugouDownloadResp struct {
	Status  int    `json:"status"`
	Fmt     string `json:"fmt"`
	Content string `json:"content"` // base64
}

func (p *kugouProvider) Fetch(ctx context.Context, c Candidate) (Result, error) {
	ref := parseKugouID(c.ID)
	if it, ok := c.raw.(kugouItem); ok {
		if h := strings.TrimSpace(it.FileHash); h != "" {
			ref.hash = h
		}
		if it.Duration > 0 {
			ref.seconds = it.Duration
		}
	}
	if ref.hash == "" {
		return Result{}, fmt.Errorf("kugou: 候选缺少 hash（id=%q）", c.ID)
	}

	// ① 反查 KRC 的 id / accesskey。
	lookup := url.Values{
		"ver":      {"1"},
		"man":      {"yes"},
		"client":   {"mobi"},
		"keyword":  {strings.TrimSpace(c.Title + " - " + c.Artist)},
		"duration": {strconv.FormatInt(ref.seconds, 10)},
		"hash":     {ref.hash},
	}
	var found kugouLookupResp
	if err := fetchJSON(ctx, p.lookupURL+"?"+lookup.Encode(), kugouHeaders(), &found); err != nil {
		return Result{}, err
	}
	if !kugouOK(found.Status) || len(found.Candidates) == 0 {
		return Result{}, fmt.Errorf("kugou: 这首没有歌词（status=%d）", found.Status)
	}
	best := found.Candidates[0]

	// ② 先要 KRC（字级）；拿不到再退到 LRC（行级）。
	//    「拿不到」是常态而不是故障：酷狗只有一部分歌有 KRC 歌词。
	//
	//    关掉字级歌词时直接跳过 KRC 那一步：KRC 是第三方私有编码（异或 + zlib），
	//    不是我们要解析的东西（见 docs/43 的 H2）。
	if !p.noWordLevel {
		if text, err := p.download(ctx, best.ID, best.AccessKey, "krc"); err == nil {
			if decoded, derr := decodeKRC(text); derr == nil && strings.TrimSpace(decoded) != "" {
				return Result{LRC: decoded, Provider: p.Name(), Source: p.Name()}, nil
			}
		}
	}
	lrc, err := p.download(ctx, best.ID, best.AccessKey, "lrc")
	if err != nil {
		return Result{}, err
	}
	decoded, err := decodeBase64Text(lrc)
	if err != nil {
		return Result{}, err
	}
	if strings.TrimSpace(decoded) == "" {
		return Result{}, fmt.Errorf("kugou: 歌词内容为空")
	}
	return Result{LRC: decoded, Provider: p.Name(), Source: p.Name()}, nil
}

// download 取回 fmt（krc/lrc）对应的 base64 内容（还没解码）。
func (p *kugouProvider) download(ctx context.Context, id, accessKey, format string) (string, error) {
	params := url.Values{
		"ver":       {"1"},
		"client":    {"pc"},
		"id":        {id},
		"accesskey": {accessKey},
		"fmt":       {format},
		"charset":   {"utf8"},
	}
	var resp kugouDownloadResp
	if err := fetchJSON(ctx, p.downloadURL+"?"+params.Encode(), kugouHeaders(), &resp); err != nil {
		return "", err
	}
	if !kugouOK(resp.Status) || strings.TrimSpace(resp.Content) == "" {
		return "", fmt.Errorf("kugou: %s 歌词下载失败（status=%d）", format, resp.Status)
	}
	return resp.Content, nil
}

func kugouHeaders() map[string]string {
	return map[string]string{"Referer": "https://www.kugou.com/"}
}

// kugouOK 酷狗的 status 有**两套写法**：搜索接口回 1，歌词接口（krcs / download）
// 回 200（HTTP 状态码那个形状）。
//
// 两种都要认：只认其中一种时，真接口上的表现是「明明拿到了候选/歌词，却被判成
// 这首歌没有歌词」—— 而用自己写的假响应做单测是看不出来的（假响应里写的是哪种，
// 测试就只验证哪种）。这条是被真实网络回归用例抓出来的。
func kugouOK(status int) bool { return status == 1 || status == 200 }

// krcKey KRC 的固定异或密钥。
//
// 这不是「加密」：KRC 只是不想让人直接把歌词文本读出来，密钥是格式自带的
// 常量（各家第三方工具里都是这 16 字节）。
var krcKey = []byte{
	0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47,
	0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
}

// decodeKRC 把 KRC 正文解出来：base64 → 去掉 "krc1" 头 → 异或 → zlib 解压。
//
// 解出来是**原始 KRC 文本**（`[53795,3069]<0,897,0>随<897,431,0>记…`），
// 不是增强 LRC —— 归一化统一由上层做（lyrics.NormalizeWordLevel，这个包
// 本来就只负责「把歌词文本拿回来」）。
func decodeKRC(content string) (string, error) {
	raw, err := decodeBase64(content)
	if err != nil {
		return "", fmt.Errorf("kugou: KRC base64 解码失败: %w", err)
	}
	if len(raw) <= 4 || string(raw[:4]) != "krc1" {
		return "", fmt.Errorf("kugou: KRC 头部不对（%d 字节）", len(raw))
	}
	body := raw[4:]
	for i := range body {
		body[i] ^= krcKey[i%len(krcKey)]
	}
	zr, err := zlib.NewReader(bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("kugou: KRC 解压失败: %w", err)
	}
	defer zr.Close()
	out, err := io.ReadAll(io.LimitReader(zr, 4*1024*1024))
	if err != nil {
		return "", fmt.Errorf("kugou: KRC 读取失败: %w", err)
	}
	return string(out), nil
}

// decodeBase64Text 解码 LRC（标准 base64，个别响应会带换行）。
func decodeBase64Text(content string) (string, error) {
	out, err := decodeBase64(content)
	if err != nil {
		return "", fmt.Errorf("kugou: 歌词 base64 解码失败: %w", err)
	}
	return strings.TrimPrefix(string(out), "\ufeff"), nil
}

// decodeBase64 两种 base64 都试：接口平时给标准 base64，偶尔是 URL 安全变体。
func decodeBase64(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	s = strings.NewReplacer("\n", "", "\r", "", " ", "").Replace(s)
	if out, err := base64.StdEncoding.DecodeString(s); err == nil {
		return out, nil
	}
	return base64.RawURLEncoding.DecodeString(s)
}
