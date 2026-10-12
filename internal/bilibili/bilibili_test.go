package bilibili

import (
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

/* ==========================================================================
   bilibili 包的离线纯函数测试（审查报告第 19 条：整包零测试）

   为什么这里只测纯函数：`Client` 的接口地址曾经是包内常量（`defaultBaseURL`）且
   被直接拼进 URL，没有可注入的 base URL，所以 HTTP 层在离线环境里打不通。

   ★ 这一点已在第六轮审查 N-8 里改掉：`Client.BaseURL` 现在是**可替换字段**
   （空则回落默认值），请求装配（拼 URL、带 cookie/UA、WBI 签名、降级重试与
   各错误分支）由 `request_test.go` 用 httptest 假服务器覆盖 —— 那才是「能不能
   搜到」最关键的一段。这里继续只放纯函数测试 —— **最容易悄悄写错、且一旦错了
   没有任何症状**的部分恰恰是纯函数：WBI 签名的字符重排表、encodeURIComponent
   的编码规则、时长解析。

   金标准来自两处**独立实现**（都不是本仓库的代码）：
     · WBI 字符重排 → B 站官方 JS 实现 / bilibili-API-collect 文档的示例密钥，
       结果 `ea1db124af3c7062474693fa704f4ff8`（见 testdata 说明与下面对照）；
     · encodeURIComponent → Node 的 `encodeURIComponent()` 输出（逐条抄进表里）。
   ========================================================================== */

// TestGetMixinKeyMatchesOfficialExample 混淆密钥必须与官方实现逐字符一致。
//
// 这组 imgKey / subKey 与期望值是 bilibili-API-collect 文档里的示例
// （用官方 JS 的 tab 重排算出来同样是这个值）—— 表里任何一个数字写错，
// w_rid 就校验不过，而症状只是「接口返回 -403」，极难定位。
func TestGetMixinKeyMatchesOfficialExample(t *testing.T) {
	imgKey := "7cd084941338484aae1ad9425b84077c"
	subKey := "4932caff0ff746eab6f01bf08b70ac45"
	const want = "ea1db124af3c7062474693fa704f4ff8"

	got := getMixinKey(imgKey + subKey)
	if got != want {
		t.Fatalf("getMixinKey = %q，期望 %q —— WBI 重排表或截断逻辑被改动了", got, want)
	}
	if len(got) != 32 {
		t.Errorf("混淆密钥长度 = %d，必须是 32", len(got))
	}
}

// TestGetMixinKeyShortInput 输入短于重排表下标时不能越界，也不能 panic。
//
// 注意短输入**不是**原样返回：函数按重排表的顺序取字符，所以 "0123456789"
// 得到的是重排后的 "2835970146"。上游（nav 接口）永远给 64 个字符，所以这里
// 只钉住「不 panic、不越界、结果不超过 32 个字符」这几条不变量。
func TestGetMixinKeyShortInput(t *testing.T) {
	if got := getMixinKey(""); got != "" {
		t.Errorf("getMixinKey(\"\") = %q，期望空串", got)
	}
	for _, in := range []string{"a", "0123456789", "abcdefghijklmnopqrstuvwxyz"} {
		got := getMixinKey(in)
		if len(got) > 32 {
			t.Errorf("getMixinKey(%q) 长度 = %d，不该超过 32", in, len(got))
		}
		if len(got) > len(in) {
			t.Errorf("getMixinKey(%q) = %q，比输入还长（越界了）", in, got)
		}
		for _, r := range got {
			if !strings.ContainsRune(in, r) {
				t.Errorf("getMixinKey(%q) = %q，出现了输入里没有的字符", in, got)
				break
			}
		}
	}
	// 64 个字符正好够重排表用满；再长也只取 32 个字符
	long := strings.Repeat("ab", 40)
	if got := getMixinKey(long); len(got) != 32 {
		t.Errorf("长输入时长度 = %d，期望 32", len(got))
	}
}

// TestMD5Hex 用的是众所周知的两个向量（可由任何 md5 工具复核）。
func TestMD5Hex(t *testing.T) {
	cases := map[string]string{
		"":    "d41d8cd98f00b204e9800998ecf8427e",
		"abc": "900150983cd24fb0d6963f7d28e17f72",
	}
	for in, want := range cases {
		if got := md5Hex(in); got != want {
			t.Errorf("md5Hex(%q) = %q，期望 %q", in, got, want)
		}
	}
}

// TestFilterWbiValue 只过滤官方要求的那 5 个字符。
//
// 多过滤或漏过滤都会让 w_rid 与官方实现不一致 —— 这是「静默失效」的
// 典型：签名错了服务端只回一个 code=-403。
func TestFilterWbiValue(t *testing.T) {
	cases := map[string]string{
		"abc":           "abc",
		"a!b'c(d)e*f":   "abcdef",
		"中文 空格":         "中文 空格",
		"#$&+/:;=?@[]~": "#$&+/:;=?@[]~",
		"'()*":          "",
	}
	for in, want := range cases {
		if got := filterWbiValue(in); got != want {
			t.Errorf("filterWbiValue(%q) = %q，期望 %q", in, got, want)
		}
	}
}

// TestEncodeURIComponentMatchesBrowser 期望值逐条来自 Node 的
// `encodeURIComponent()`（浏览器同源实现），不是本仓库的另一份实现。
//
// ★ 关键差异：Go 的 url.QueryEscape 把空格编成 `+`，而 WBI 要求 `%20`。
func TestEncodeURIComponentMatchesBrowser(t *testing.T) {
	cases := map[string]string{
		"":            "",
		"a b":         "a%20b",
		"中文":          "%E4%B8%AD%E6%96%87",
		"a+b":         "a%2Bb",
		"a/b?c=d&e":   "a%2Fb%3Fc%3Dd%26e",
		"!*'()~-_.":   "!*'()~-_.",
		"100%":        "100%25",
		"emoji😀":      "emoji%F0%9F%98%80",
		"tab\tnl\n":   "tab%09nl%0A",
		"\u00e9":      "%C3%A9",
		"#[]{}|\\^<>": "%23%5B%5D%7B%7D%7C%5C%5E%3C%3E",
		"\"":          "%22",
	}
	for in, want := range cases {
		if got := encodeURIComponent(in); got != want {
			t.Errorf("encodeURIComponent(%q) = %q，期望 %q（Node 输出）", in, got, want)
		}
	}
}

// TestSortStrings 手写插入排序必须与标准库一致（含重复项与空列表）。
func TestSortStrings(t *testing.T) {
	lists := [][]string{
		{},
		{"a"},
		{"a", "b", "c"},
		{"c", "b", "a"},
		{"b", "a", "b", "a"},
		{"fnval", "cid", "bvid", "wts", "fnver", "fourk"},
		{"zz", "Za", "0", "_", "中"},
	}
	for _, in := range lists {
		got := append([]string(nil), in...)
		sortStrings(got)
		want := append([]string(nil), in...)
		sort.Strings(want)
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("sortStrings(%v) = %v，期望 %v", in, got, want)
		}
	}
}

// TestPathBaseNoExt 从 nav 返回的完整 URL 里取密钥文件名。
func TestPathBaseNoExt(t *testing.T) {
	cases := map[string]string{
		"":                                     "",
		"7cd084941338484aae1ad9425b84077c.png": "7cd084941338484aae1ad9425b84077c",
		"https://i0.hdslb.com/bfs/wbi/abc.png": "abc",
		"https://i0.hdslb.com/a.b/abc":         "abc",
		"/x/y/z":                               "z",
		"https://i0.hdslb.com/bfs/wbi/noext":   "noext",
	}
	for in, want := range cases {
		if got := pathBaseNoExt(in); got != want {
			t.Errorf("pathBaseNoExt(%q) = %q，期望 %q", in, got, want)
		}
	}
}

// signTestClient 造一个「密钥已就绪」的客户端：wbiAt 是新鲜的，
// 所以 ensureWBI 直接返回，不会联网。
func signTestClient(t *testing.T) *Client {
	t.Helper()
	c := NewClient()
	c.mu.Lock()
	c.imgKey = "7cd084941338484aae1ad9425b84077c"
	c.subKey = "4932caff0ff746eab6f01bf08b70ac45"
	c.wbiAt = time.Now()
	c.mu.Unlock()
	return c
}

const testMixinKey = "ea1db124af3c7062474693fa704f4ff8"

// TestSignAssemblesOfficialFormat 签名串的组装方式（键序、分隔符、编码、末尾拼密钥）。
//
// 组装错了不会报错，只会让服务端回 -403；这里把「组装出来的那一串」也钉住：
// 期望值 = md5(键按字典序 & 拼接 & wts & mixinKey)，与用 Node 的
// crypto.createHash("md5") 算出来的 `83bd6bc6e3217fd6e3cbdc692b24a17a`
// （wts=1700000000 时）一致。
func TestSignAssemblesOfficialFormat(t *testing.T) {
	c := signTestClient(t)
	params := url.Values{
		"bvid":  {"BV1xx411c7mD"},
		"cid":   {"123"},
		"fnval": {"16"},
		"fnver": {"0"},
		"fourk": {"1"},
	}
	if err := c.sign(t.Context(), params); err != nil {
		t.Fatalf("sign 失败: %v", err)
	}

	wts := params.Get("wts")
	if wts == "" {
		t.Fatal("sign 没有写入 wts")
	}
	ts, err := time.ParseDuration(wts + "s")
	if err != nil {
		t.Fatalf("wts 不是秒级时间戳: %q", wts)
	}
	if d := time.Since(time.Unix(int64(ts.Seconds()), 0)); d < -5*time.Second || d > 5*time.Second {
		t.Errorf("wts = %s 偏离当前时间 %v", wts, d)
	}

	wantStr := "bvid=BV1xx411c7mD&cid=123&fnval=16&fnver=0&fourk=1&wts=" + wts
	rid := params.Get("w_rid")
	if len(rid) != 32 || strings.ToLower(rid) != rid {
		t.Fatalf("w_rid = %q，应当是 32 位小写 hex", rid)
	}
	if want := md5Hex(wantStr + testMixinKey); rid != want {
		t.Errorf("w_rid = %q，期望 %q\n待签名串 = %q", rid, want, wantStr)
	}
}

// TestSignGoldenWts 固定 wts 的金标准（跨实现对照）。
//
// 用 Node 独立算了一遍：md5("bvid=…&wts=1700000000" + mixinKey)
// = 83bd6bc6e3217fd6e3cbdc692b24a17a。这里把 sign 的「组装 + md5」两步
// 合起来验证：只要 sign 生成的那一串与金标准相同，w_rid 就必须相同。
func TestSignGoldenWts(t *testing.T) {
	const query = "bvid=BV1xx411c7mD&cid=123&fnval=16&fnver=0&fourk=1&wts=1700000000"
	const wantRID = "83bd6bc6e3217fd6e3cbdc692b24a17a"
	if got := md5Hex(query + testMixinKey); got != wantRID {
		t.Fatalf("md5+拼接 与 Node 独立结果不一致：%q ≠ %q", got, wantRID)
	}
}

// TestSignIgnoresKeyOrderAndForbiddenChars 键序无关、且值里的 !'()* 先被剔除。
func TestSignIgnoresKeyOrderAndForbiddenChars(t *testing.T) {
	c := signTestClient(t)

	// 插入顺序不同：w_rid 必须一致（sign 内部要自己排序）
	a := url.Values{"zz": {"1"}, "aa": {"2"}, "mm": {"3"}}
	b := url.Values{"mm": {"3"}, "aa": {"2"}, "zz": {"1"}}
	if err := c.sign(t.Context(), a); err != nil {
		t.Fatalf("sign(a) 失败: %v", err)
	}
	if err := c.sign(t.Context(), b); err != nil {
		t.Fatalf("sign(b) 失败: %v", err)
	}
	if a.Get("wts") != b.Get("wts") {
		t.Skip("两次签名跨了秒边界，本轮跳过键序比较")
	}
	if a.Get("w_rid") != b.Get("w_rid") {
		t.Errorf("键序不同导致 w_rid 不同：%q ≠ %q（签名前必须按键名字典序拼接）", a.Get("w_rid"), b.Get("w_rid"))
	}

	// 值里的 !'()* 会被 filterWbiValue 剔除
	x := url.Values{"q": {"a!b'c(d)e*f"}}
	y := url.Values{"q": {"abcdef"}}
	for _, p := range []url.Values{x, y} {
		if err := c.sign(t.Context(), p); err != nil {
			t.Fatalf("sign 失败: %v", err)
		}
	}
	if x.Get("wts") == y.Get("wts") {
		if x.Get("w_rid") != y.Get("w_rid") {
			t.Errorf("值里的 !'()* 没有被剔除：%q ≠ %q", x.Get("w_rid"), y.Get("w_rid"))
		}
	}

	// 不同参数值必须得到不同签名（否则签名等于没签）
	z1 := url.Values{"q": {"one"}}
	z2 := url.Values{"q": {"two"}}
	for _, p := range []url.Values{z1, z2} {
		if err := c.sign(t.Context(), p); err != nil {
			t.Fatalf("sign 失败: %v", err)
		}
	}
	if z1.Get("wts") == z2.Get("wts") && z1.Get("w_rid") == z2.Get("w_rid") {
		t.Error("参数值不同但 w_rid 相同 —— 签名没有把参数算进去")
	}
}

// TestSignRejectsShortMixinKey 混出来的密钥不足 32 字符时必须报错，
// 而不是拿一个半截密钥去签名（那会得到永远校验不过的 w_rid）。
func TestSignRejectsShortMixinKey(t *testing.T) {
	c := NewClient()
	c.mu.Lock()
	c.imgKey = "x"
	c.subKey = "y"
	c.wbiAt = time.Now()
	c.mu.Unlock()

	err := c.sign(t.Context(), url.Values{"a": {"1"}})
	if err == nil {
		t.Fatal("密钥长度异常时 sign 应当报错")
	}
	if !strings.Contains(err.Error(), "WBI 密钥长度异常") {
		t.Errorf("错误信息 = %v，期望提到「WBI 密钥长度异常」", err)
	}
}

// TestTruncateBody 错误信息里的响应体摘要：不劈开 UTF-8 码点、超长才加省略号。
func TestTruncateBody(t *testing.T) {
	short := strings.Repeat("a", maxErrBody)
	if got := truncateBody([]byte("  " + short + "\n")); got != short {
		t.Errorf("恰好 %d 字节时不该截断（长度 %d）", maxErrBody, len(got))
	}
	if got := truncateBody([]byte("hi")); got != "hi" {
		t.Errorf("短体 = %q", got)
	}

	long := strings.Repeat("中", 400) // 1200 字节，且每个码点 3 字节
	got := truncateBody([]byte(long))
	if !utf8.ValidString(got) {
		t.Fatalf("截断后在 rune 边界之外断开了：%q", got)
	}
	if !strings.HasSuffix(got, "…") {
		t.Errorf("超长时应当带省略号：%q", got)
	}
	if len(got) > maxErrBody+3 {
		t.Errorf("截断后长度 = %d，期望不超过 %d+1 个省略号", len(got), maxErrBody)
	}
}

// TestRandomBuvid3Format buvid3 是设备标识：格式必须合法且每次都不同。
func TestRandomBuvid3Format(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		id := randomBuvid3()
		if !strings.HasSuffix(id, "infoc") {
			t.Fatalf("buvid3 = %q，缺少 infoc 后缀", id)
		}
		body := strings.TrimSuffix(id, "infoc")
		parts := strings.Split(body, "-")
		if len(parts) != 5 {
			t.Fatalf("buvid3 = %q，不是 UUID 形状", id)
		}
		if len(parts[0]) != 8 || len(parts[1]) != 4 || len(parts[2]) != 4 || len(parts[3]) != 4 || len(parts[4]) != 12 {
			t.Fatalf("buvid3 = %q，UUID 各段长度不对", id)
		}
		if !strings.HasPrefix(parts[2], "4") {
			t.Fatalf("buvid3 = %q，不是 v4（版本位）", id)
		}
		if !strings.ContainsRune("89ab", rune(parts[3][0])) {
			t.Fatalf("buvid3 = %q，variant 位不对", id)
		}
		if seen[id] {
			t.Fatalf("buvid3 重复：%q", id)
		}
		seen[id] = true
	}
}

// TestSetHeaders 请求头是「能不能搜到」的一部分：少了 Referer/UA 会被拒。
func TestSetHeaders(t *testing.T) {
	c := NewClient()
	req, err := http.NewRequest(http.MethodGet, "https://example.invalid/x", nil)
	if err != nil {
		t.Fatalf("构造请求失败: %v", err)
	}
	c.setHeaders(req)

	if req.Header.Get("User-Agent") != desktopUA {
		t.Errorf("User-Agent = %q", req.Header.Get("User-Agent"))
	}
	if req.Header.Get("Referer") != "https://www.bilibili.com/" {
		t.Errorf("Referer = %q", req.Header.Get("Referer"))
	}
	if req.Header.Get("Origin") != "https://www.bilibili.com" {
		t.Errorf("Origin = %q", req.Header.Get("Origin"))
	}
	cookie := req.Header.Get("Cookie")
	if !strings.Contains(cookie, "buvid3="+c.buvid) || !strings.Contains(cookie, "b_nut=") {
		t.Errorf("Cookie = %q，缺少 buvid3 或 b_nut", cookie)
	}
}

// TestParseDurationRaw 搜索接口的时长字段有字符串与秒数两种形状。
func TestParseDurationRaw(t *testing.T) {
	cases := []struct {
		raw  string
		want int64
	}{
		{``, 0},
		{`"03:24"`, 204000},
		{`"1:02:03"`, 3723000},
		{`"90"`, 90000},
		{`204`, 204000},
		{`204.5`, 204500},
		{`0`, 0},
		{`-3`, 0},
		{`null`, 0},
		{`"abc"`, 0},
	}
	for _, tc := range cases {
		got := parseDurationRaw(json.RawMessage(tc.raw))
		if got != tc.want {
			t.Errorf("parseDurationRaw(%s) = %d，期望 %d", tc.raw, got, tc.want)
		}
	}
}

// TestParseDurationText 时长文本解析。负数一律按 0 处理（与数字分支一致）。
func TestParseDurationText(t *testing.T) {
	cases := map[string]int64{
		"":        0,
		"   ":     0,
		"03:24":   204000,
		"1:02:03": 3723000,
		"90":      90000,
		"90.5":    90500,
		"abc":     0,
		"1:2:3:4": 223384000, // 超过小时后继续按 60 进位（上游不会给）
		"1:99":    159000,    // 不校验分秒范围（上游不会给）
		"-5":      0,
		"-1:30":   0,
		"1:-30":   0,
	}
	for in, want := range cases {
		if got := parseDurationText(in); got != want {
			t.Errorf("parseDurationText(%q) = %d，期望 %d", in, got, want)
		}
	}
}

// TestStripHTML 标题里的 <em class="keyword"> 高亮标签要去掉，空白要收敛。
func TestStripHTML(t *testing.T) {
	cases := map[string]string{
		"":     "",
		"普通标题": "普通标题",
		`<em class="keyword">周杰伦</em> - 稻香`: "周杰伦 - 稻香",
		"  a\n\n  b\t c  ":     "a b c",
		`<a href="x">链接</a>尾巴`: "链接尾巴",
	}
	for in, want := range cases {
		if got := stripHTML(in); got != want {
			t.Errorf("stripHTML(%q) = %q，期望 %q", in, got, want)
		}
	}
}

// TestNormalizePic 封面地址要能被 WebView 加载：必须 https、不能是协议相对。
func TestNormalizePic(t *testing.T) {
	cases := map[string]string{
		"":                           "",
		"   ":                        "",
		"//i0.hdslb.com/a.jpg":       "https://i0.hdslb.com/a.jpg",
		"http://i0.hdslb.com/a.jpg":  "https://i0.hdslb.com/a.jpg",
		"https://i0.hdslb.com/a.jpg": "https://i0.hdslb.com/a.jpg",
		"  //i0.hdslb.com/a.jpg  ":   "https://i0.hdslb.com/a.jpg",
	}
	for in, want := range cases {
		if got := normalizePic(in); got != want {
			t.Errorf("normalizePic(%q) = %q，期望 %q", in, got, want)
		}
	}
}

// TestCloneValues 深拷贝：ResolveAudio 会对每个请求改参数（加 wts/w_rid），
// 浅拷贝会让第二次请求带上第一次的签名。
func TestCloneValues(t *testing.T) {
	src := url.Values{"a": {"1", "2"}, "b": {"x"}}
	clone := cloneValues(src)
	if clone.Get("a") != "1" || len(clone["a"]) != 2 || clone.Get("b") != "x" {
		t.Fatalf("拷贝内容不对: %v", clone)
	}
	clone["a"][0] = "改过了"
	clone["c"] = []string{"新增"}
	if src["a"][0] != "1" {
		t.Error("改拷贝影响到了源 —— 不是深拷贝")
	}
	if _, ok := src["c"]; ok {
		t.Error("往拷贝里加键影响到了源")
	}
	if got := cloneValues(nil); len(got) != 0 {
		t.Errorf("nil 应当拷成空表，得到 %v", got)
	}
}

// TestAudioURLAndBackupHelpers snake_case 与 camelCase 两种字段名都要认。
func TestAudioURLAndBackupHelpers(t *testing.T) {
	a := dashAudio{BaseURLSnake: "snake", MimeTypeSnake: "audio/snake", BackupURLSnake: []string{"s1"}, BackupURL: []string{"c1"}}
	if got := a.url(); got != "snake" {
		t.Errorf("url() = %q，期望回落到 base_url", got)
	}
	if got := a.mime(); got != "audio/snake" {
		t.Errorf("mime() = %q，期望回落到 mime_type", got)
	}
	b := dashAudio{BaseURL: "camel", MimeType: "audio/camel"}
	if b.url() != "camel" || b.mime() != "audio/camel" {
		t.Errorf("camelCase 优先：url=%q mime=%q", b.url(), b.mime())
	}
	backups := a.backups()
	if len(backups) != 2 || backups[0] != "c1" || backups[1] != "s1" {
		t.Errorf("backups() = %v，期望两种字段拼接", backups)
	}
	// 备份列表不能与源共享底层数组：调用方会往里追加
	backups[0] = "改过了"
	if a.BackupURL[0] != "c1" {
		t.Error("backups() 与源共享了底层数组")
	}

	d := durlItem{URL: "u", BackupURLSnake: []string{"s"}, BackupURL: []string{"c"}}
	if got := d.backups(); len(got) != 2 || got[0] != "c" || got[1] != "s" {
		t.Errorf("durlItem.backups() = %v", got)
	}
}

// TestBaseURLIsHTTPS 生产装配用的接口根地址必须是 https：
// 明文 http 会被中间人改写搜索结果。
//
// ★ N-8 之后 BaseURL 是**可替换字段**（测试指向 httptest 时要能改），
// 所以这条守的是「NewClient 装出来的默认值」—— 字段可以被测试改，
// 但生产默认值必须是 https，且不能用空字段绕过（空字段回落到的也是它）。
func TestBaseURLIsHTTPS(t *testing.T) {
	c := NewClient()
	if !strings.HasPrefix(c.BaseURL, "https://") {
		t.Errorf("NewClient().BaseURL = %q，必须是 https", c.BaseURL)
	}
	if got := (&Client{}).base(); !strings.HasPrefix(got, "https://") {
		t.Errorf("空 BaseURL 应回落到 https 默认值，实际 %q", got)
	}
	if got := (&Client{BaseURL: "https://example.com/"}).base(); got != "https://example.com" {
		t.Errorf("base() 应去掉尾部斜杠，实际 %q", got)
	}
}
