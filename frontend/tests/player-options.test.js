/* ==========================================================================
   player-options.test.js — 「音效搬进播放选项面板」与「下载后用 AI 整理元数据」
   --------------------------------------------------------------------------
   这一批改动牵动三处**必须一起改**的地方，任何一处漏掉都会让界面与后端起分歧：

     1. 音效卡片从设置页搬进播放选项面板（底栏「选项」）：
        档位表只能有一份（effect-presets.js），设置页里不能再渲染它；
     2. 桌面歌词 / 桌面背景歌词合成一组三选一，底栏那两个独立按钮消失；
     3. 歌词字号量程改为 14~72，且设置页与面板必须用同一份常量。

   还有 AI 那个新开关：它管的是**写回用户文件**，所以「默认值一致」
   「在 SYNCED_KEYS 里」「后端 applyPatch 认这个键」三件事一件都不能少 ——
   少了任何一件，用户在设置里关掉它，重启后又会自动打开。

   做法说明：这里大量使用**源码断言**而不是渲染后断言。原因是这几个约束
   的本质都是「某处代码必须/不能存在」，源码层面能精确守住；
   而渲染断言要拉起整个 Lit 组件树 + 模拟后端，反而更容易漏掉
   「设置页里还留着一段没人调用的渲染代码」这类问题。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { LYRIC_SIZE_MAX, LYRIC_SIZE_MIN } from "../src/js/ui/lyric-size.js";
import { EFFECT_PRESETS } from "../src/js/ui/effect-presets.js";
import { DEFAULT_CONFIG } from "../src/js/store.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const panelsSrc = read("frontend/src/js/ui/panels.js");
const playerbarSrc = read("frontend/src/js/ui/playerbar.js");
const settingsViewSrc = read("frontend/src/js/ui/settings-view.js");
const storeSrc = read("frontend/src/js/store.js");
const goConfigSrc = read("internal/bootstrap/config.go");
const goServicesSrc = read("services.go");

/* ==========================================================================
   一、音效搬进播放选项面板
   ========================================================================== */

test("音效档位表只有一份，且在选项面板里渲染", () => {
  // 面板要用这份表渲染按钮
  assert.ok(EFFECT_PRESETS.length > 0, "effect-presets.js 应当导出档位表");
  assert.match(panelsSrc, /EFFECT_PRESETS/, "播放选项面板必须用 EFFECT_PRESETS 渲染音效档位");
  assert.match(
    panelsSrc,
    /import\s*\{[^}]*EFFECT_PRESETS[^}]*\}\s*from\s*"\.\/effect-presets\.js"/,
    "选项面板应当从 effect-presets.js 取档位表（而不是自己再抄一份）"
  );
  // 设置页不能再自己定义一份（两份列表一定会漂移）
  assert.doesNotMatch(
    settingsViewSrc,
    /const\s+EFFECT_PRESETS\s*=/,
    "settings-view.js 里不该再有 EFFECT_PRESETS 的字面量定义（应当从 effect-presets.js 转发）"
  );
});

test("设置界面不再渲染音效卡片", () => {
  assert.doesNotMatch(
    settingsViewSrc,
    /effectCard\s*\(/,
    "effectCard 已删除：音效搬进了播放选项面板，设置页里不该还留着它的渲染函数"
  );
  assert.doesNotMatch(settingsViewSrc, /id="sec-effect"/, "设置页不该再有 sec-effect 这个分区锚点");
});

test("选项面板保留了音效档位的切换逻辑（立即生效，不等 promise）", () => {
  // 与设置页原来的行为一致：后端在下一个音频缓冲内完成切换，
  // 所以这里不 await —— 切档位必须手感即时。
  assert.match(panelsSrc, /applyEffectPreset/, "面板切音效档位时应当调用 applyEffectPreset");
  assert.doesNotMatch(panelsSrc, /await\s+applyEffectPreset\(\)/, "切档位不该 await（会卡住界面手感）");
});

test("面板的音效档位按钮在主面板渲染里（不是只 import 了却没用）", () => {
  // 抽取 render() 到下一个类定义之间的片段，确认档位按钮真的在里面。
  const start = panelsSrc.indexOf("class MpOptionsPanel");
  assert.ok(start > 0, "找不到 MpOptionsPanel");
  const end = panelsSrc.indexOf('define("mp-options-panel"', start);
  const body = panelsSrc.slice(start, end);
  assert.match(body, /EFFECT_PRESETS\.map\(/, "选项面板的模板里应当用 EFFECT_PRESETS.map 渲染按钮");
  assert.match(body, /data-segment="effectPreset"/, "档位按钮容器应当带 data-segment=effectPreset");
});

/* ==========================================================================
   二、桌面歌词三选一
   ========================================================================== */

test("选项面板里桌面歌词是一组三选一 [关闭 | 悬浮 | 背景]", () => {
  // 选项组常量定义在类**上方**（DESKTOP_MODE_OPTIONS），所以这里扫
  // 「文件开头 → mp-options-panel 定义」这一整段，而不是只看类体。
  const end = panelsSrc.indexOf('define("mp-options-panel"');
  assert.ok(end > 0, "找不到 mp-options-panel 的定义");
  const body = panelsSrc.slice(0, end);

  for (const label of ["关闭", "悬浮", "背景"]) {
    assert.ok(body.includes(`label: "${label}"`), `三选一里缺少「${label}」这一项`);
  }
  // 取值必须与 desktop-mode.js 的 DESKTOP_MODE 对应
  assert.match(body, /DESKTOP_MODE\.off/, "缺少 off 选项");
  assert.match(body, /DESKTOP_MODE\.lyrics/, "缺少 lyrics 选项");
  assert.match(body, /DESKTOP_MODE\.wallpaper/, "缺少 wallpaper 选项");
  // 三个选项要能表达「当前选中的是哪个」（三选一的核心）
  assert.match(body, /aria-checked=/, "三选一按钮必须有 aria-checked 表达选中态");
  assert.match(body, /currentDesktopMode\(\)/, "选中态应当从 currentDesktopMode() 推导");
  // 走的是那个把「互斥」收口的入口
  assert.match(body, /applyDesktopMode/, "切模式必须走 applyDesktopMode（它负责关掉另一个窗口）");
});

test("底栏不再有桌面歌词 / 桌面背景歌词按钮", () => {
  // 这两个按钮已经搬进选项面板。留着的话会出现**两处入口**，
  // 而它们的状态源不同（按钮 aria-pressed vs 面板三选一），很容易看起来不一致。
  assert.doesNotMatch(playerbarSrc, /id="btn-desktop-lyrics"/, "底栏不该再有桌面歌词按钮（已搬进选项面板）");
  assert.doesNotMatch(playerbarSrc, /id="btn-desktop-wallpaper"/, "底栏不该再有桌面背景歌词按钮（已搬进选项面板）");
  // 底栏的依赖数组里也不该再留着它们 —— 留着只会让切模式白白重建整条模板
  assert.doesNotMatch(playerbarSrc, /s\.config\.showDesktopLyrics/, "底栏 deps 里不该再依赖 showDesktopLyrics");
  assert.doesNotMatch(playerbarSrc, /s\.config\.showDesktopWallpaper/, "底栏 deps 里不该再依赖 showDesktopWallpaper");
});

/* ==========================================================================
   三、选项面板的项目增删
   ========================================================================== */

test("选项面板移除了桌面歌词开关 / 背景透明 / 模糊程度这几项", () => {
  const start = panelsSrc.indexOf("class MpOptionsPanel");
  const end = panelsSrc.indexOf('define("mp-options-panel"', start);
  const body = panelsSrc.slice(start, end);

  // 模糊程度整项删除（含它的滑条实例）
  assert.doesNotMatch(body, /opt-blur/, "模糊程度已移除，不该还留着 #opt-blur");
  assert.doesNotMatch(body, /模糊程度/, "模糊程度这一项已移除");
  // 「桌面歌词」不再是两个开关
  assert.doesNotMatch(body, /id="opt-desktop-lyrics"/, "桌面歌词不该还是单个开关（已改为三选一）");
  assert.doesNotMatch(body, /id="opt-desktop-wallpaper"/, "桌面背景歌词不该还是单个开关（已改为三选一）");

  // 保留的两项还在
  assert.match(body, /opt-lyric-size/, "歌词字号应当保留");
  assert.match(body, /opt-alpha/, "背景不透明度应当保留");
});

/* ==========================================================================
   四、歌词字号 14~72
   ========================================================================== */

test("歌词字号量程是 14~72", () => {
  assert.equal(LYRIC_SIZE_MIN, 14, "字号下限应为 14");
  assert.equal(LYRIC_SIZE_MAX, 72, "字号上限应为 72");
});

test("选项面板与设置页用同一份字号量程常量", () => {
  // 两处不一致的症状：在设置里拖到头了，面板里却能拖得更大 ——
  // 用户会把这当成故障。
  const start = panelsSrc.indexOf("class MpOptionsPanel");
  const end = panelsSrc.indexOf('define("mp-options-panel"', start);
  const body = panelsSrc.slice(start, end);
  assert.match(body, /LYRIC_SIZE_MIN/, "面板的音号滑条下限应当用 LYRIC_SIZE_MIN");
  assert.match(body, /LYRIC_SIZE_MAX/, "面板的字号滑条上限应当用 LYRIC_SIZE_MAX");

  assert.match(settingsViewSrc, /LYRIC_SIZE_MIN/, "设置页的字号滑条下限也应当用同一份常量");
  assert.match(settingsViewSrc, /LYRIC_SIZE_MAX/, "设置页的字号滑条上限也应当用同一份常量");
  // 旧的 12 / 26 硬编码不能还在
  assert.doesNotMatch(settingsViewSrc, /key === "lyricsFontSize"\s*\?\s*12/, "设置页还留着旧的字号下限 12");
  assert.doesNotMatch(settingsViewSrc, /key === "lyricsFontSize"\s*\?\s*26/, "设置页还留着旧的字号上限 26");
});

/* ==========================================================================
   五、下载后用 AI 整理元数据（新开关）
   ========================================================================== */

test("新开关：前端默认值与后端一致，且默认开启", () => {
  // 默认开启的理由：整理发生在**下载结束之后**的后台，不占用户等待时间。
  // 但它必须能被关掉 —— 写标签会改写用户的音乐文件，不可撤销。
  assert.equal(DEFAULT_CONFIG.aiDownloadTag, true, "前端默认应当是开启");
  assert.match(goConfigSrc, /AIDownloadTag:\s*true/, "Go 侧默认值也应当是 true（两边不一致会让界面显示与实际不符）");
  assert.match(
    goConfigSrc,
    /AIDownloadTag\s+bool\s+`json:"aiDownloadTag"`/,
    "Go 配置字段的 json tag 必须是 aiDownloadTag（前端读的就是这个名字）"
  );
});

test("新开关：前端在 SYNCED_KEYS 里，后端 applyPatch 认这个键", () => {
  // 少任何一处，这个开关都会被静默丢弃 —— 表现为「关掉、重启又自己开了」，
  // 而后果是「用户不知情的情况下音乐文件被改写」。
  assert.match(storeSrc, /"aiDownloadTag"/, "aiDownloadTag 必须在 SYNCED_KEYS 里（否则永远不会推给后端）");
  assert.match(
    goServicesSrc,
    /case\s+"aiDownloadTag":/,
    "services.go 的 applyPatch 必须认识 aiDownloadTag（否则会被静默丢弃）"
  );
});

test("新开关：设置界面 AI 卡片里有这个开关", () => {
  // 匹配**方法定义**而不是调用点：`this.aiCard()`（调用）在模板里先出现，
  // 用 indexOf("aiCard()") 会拿到调用处、切出一段完全无关的代码。
  const start = settingsViewSrc.indexOf("aiCard() {");
  assert.ok(start > 0, "找不到 aiCard 的定义");
  const end = settingsViewSrc.indexOf("\n  /* ====", start);
  const body = settingsViewSrc.slice(start, end > 0 ? end : start + 8000);
  assert.match(
    body,
    /switchControl\(\s*"aiDownloadTag"/,
    "AI 卡片里应当有这个开关（switchControl 的键名必须是 aiDownloadTag）"
  );
});

test("新开关：只作用于下载，不掺进歌词匹配的闸门", () => {
  // 「自动匹配歌词时用 AI 清洗」（aiLyricsClean）是另一个开关，
  // 它管的是用户盯着界面等的路径。两者混在一起会让
  // 「关掉下载整理」顺带把歌词清洗也关掉（或反过来）。
  const gateStart = goServicesSrc.indexOf("func (s *LyricsService) aiEnabled()");
  assert.ok(gateStart > 0, "找不到 aiEnabled()");
  const gate = goServicesSrc.slice(gateStart, gateStart + 600);
  assert.doesNotMatch(gate, /AIDownloadTag/, "歌词匹配的闸门不该受 AIDownloadTag 影响（两个开关职责不同）");
});

test("后端：两条下载路径都会触发整理", () => {
  const downloadSrc = read("services_download.go");
  // 两条路径的收尾标记之后都必须出现 notifyDownloaded
  for (const anchor of [`"fromCache": true`, `"duration": durationMS`]) {
    const idx = downloadSrc.indexOf(anchor);
    assert.ok(idx >= 0, `找不到下载路径的收尾标记 ${anchor}`);
    assert.ok(
      downloadSrc.slice(idx).includes("s.notifyDownloaded(target)"),
      `收尾标记 ${anchor} 所在的路径没有触发 onDownloaded`
    );
  }
  assert.match(
    downloadSrc,
    /go s\.notifyDownloaded\(target\)/,
    "notifyDownloaded 必须在 goroutine 里调用（回调链有 8~18 秒的 AI 请求）"
  );
});

test("后端：AI 整理会写回标题 / 歌手 / 专辑标签", () => {
  const aiTagSrc = read("ai_tags.go");
  assert.match(aiTagSrc, /EmbedTextTags|EmbedTags/, "整理结果必须写回文件标签");
  assert.match(aiTagSrc, /SupportedEmbed/, "要对「不支持写标签的格式」做判断，别硬写用户文件");
  // 开关与「AI 是否配置」都必须是闸门
  assert.match(aiTagSrc, /AIDownloadTag/, "必须读 AIDownloadTag 开关");
  assert.match(aiTagSrc, /s\.ai\.Enabled\(\)/, "必须确认 AI 已配置");
});
