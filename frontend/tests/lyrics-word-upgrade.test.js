/* ==========================================================================
   lyrics-word-upgrade.test.js — 逐字歌词的「发现」与「升级」接线
   --------------------------------------------------------------------------
   守的是这一次的两条用户可见需求：

     1. 播放时**优先用逐字歌词**，没有就回退行级；
     2. 歌词搜索界面要能看出每个候选是**逐字**还是**逐行**。

   后端的两半各有 Go 测试：internal/lyricsfetch（酷狗来源、自动匹配的字级优先）
   与根包（UpgradeWordLyrics 只在真拿到字级时才写缓存）。本文件锁的是前端这半
   接线 —— 这类「函数写好了但没人调用」的漏洞，单测与自检都看不出来：

     · playerhost 只在**本地来源**、**行级**、**开了在线**这三个条件同时成立时
       才去升级；升级结果里没有逐字时间轴就必须原样不动（否则会把行级歌词
       换成更差的一份，或者把「检测中」的假结果当真）；
     · 歌词搜索面板要真的渲染格式标签、真的发起探测，而且要**一条一条**探
       （并发探第三方接口会被限流，网易云 405 就是这么来的）。

   为什么用「读源码断言」而不是直接 import：playerhost.js 与 ui/lyrics.js 都依赖
   DOM / Lit，在 node:test 里跑不起来（与 track-switch.test.js 同一个理由）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

/** 去掉注释再断言：注释里正好会写到这些写法（「不要这么写」的说明） */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const playerhost = stripComments(read("frontend", "src", "js", "playerhost.js"));
const lyricsPanel = stripComments(read("frontend", "src", "js", "ui", "lyrics.js"));
const bridge = stripComments(read("frontend", "src", "js", "bridge.js"));

test("本地只有行级歌词时才会去升级，而且只在开了在线歌词时", () => {
  const at = playerhost.indexOf("void upgradeWordLyrics(song)");
  assert.ok(at > 0, "playerhost.js 里找不到「升级逐字」的调用");
  const before = playerhost.slice(Math.max(0, at - 400), at);
  assert.match(
    before,
    /fromLocal\s*&&\s*onlineLyricsEnabled\(\)\s*&&\s*!hasWordTiming\(payload\)/,
    "调用条件必须是「本地来源 + 开了在线 + 当前不是逐字」三个同时成立"
  );
});

test("升级结果里没有逐字时间轴就原样不动", () => {
  const at = playerhost.indexOf("async function upgradeWordLyrics(");
  assert.ok(at > 0, "playerhost.js 里找不到 upgradeWordLyrics");
  const body = playerhost.slice(at, at + 900);
  assert.match(body, /if \(!hasWordTiming\(payload\)\) return;/, "必须是字级歌词才允许替换");
  assert.match(body, /lyricsCache\.set\(song\.id, payload\)/, "替换后要更新歌词缓存（否则切回来又是旧的）");
  assert.match(body, /push\(\{ type: "lyrics"/, "替换后要立刻推给正在显示的样式");
});

test("hasWordTiming 判定的是解析结果里的逐字分段", () => {
  const at = playerhost.indexOf("function hasWordTiming(");
  assert.ok(at > 0, "playerhost.js 里找不到 hasWordTiming");
  const body = playerhost.slice(at, at + 200);
  assert.match(body, /line\.words/, "逐字的判据是行里带 words（逐字分段）");
});

test("歌词搜索面板：每个候选都要有格式标签，并且逐条探测", () => {
  assert.match(lyricsPanel, /formatChip\(c\)/, "候选行要渲染格式标签");
  assert.match(lyricsPanel, /candidate__format--word[\s\S]{0,80}逐字/, "「逐字」标签");
  assert.match(lyricsPanel, /class="candidate__format"[^>]*>逐行</, "「逐行」标签");
  assert.match(lyricsPanel, /service\.ProbeLyricsFormat\(/, "要真的去探测，而不是只留个占位");
  assert.match(lyricsPanel, /void this\.probeFormats\(service, this\._searchSeq\)/, "搜索完成后要发起探测");
});

test("探测必须一条一条来，网易云排在最后", () => {
  const at = lyricsPanel.indexOf("async probeFormats(");
  assert.ok(at > 0, "ui/lyrics.js 里找不到 probeFormats");
  const body = lyricsPanel.slice(at, at + 1400);
  assert.match(body, /for \(const candidate of queue\)/, "要顺序探测（并发打第三方接口会被限流）");
  assert.match(body, /await service\.ProbeLyricsFormat/, "循环里 await：上一条问完才问下一条");
  assert.match(body, /provider === "netease"/, "网易云被限流时会连着失败，要排到最后");
  assert.match(body, /seq !== this\._searchSeq/, "又搜了一次时旧的一轮探测要停下");
});

test("接线完整：Go 侧方法与前端调用一一对得上", () => {
  const services = read("services.go");
  assert.match(
    services,
    /func \(s \*LyricsService\) UpgradeWordLyrics\(/,
    "services.go 里缺少 LyricsService.UpgradeWordLyrics"
  );
  const online = read("services_online.go");
  assert.match(
    online,
    /func \(s \*OnlineService\) ProbeLyricsFormat\(/,
    "services_online.go 里缺少 OnlineService.ProbeLyricsFormat"
  );
  assert.match(
    bridge,
    /lyricsUpgradeWord:[\s\S]{0,80}Lyrics\?\.UpgradeWordLyrics/,
    "bridge.js 里缺少 lyricsUpgradeWord（playerhost 调的就是它）"
  );
});
