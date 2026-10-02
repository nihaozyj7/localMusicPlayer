/* ==========================================================================
   skip-silence.test.js — 「跳过首尾静音 / 切歌间隔」的前端契约
   --------------------------------------------------------------------------
   真正的检测与计时都在 Go 侧（internal/audioplay/silence.go，
   以及 services_player.go 把开关接到装载路径上）。这个文件锁住的是
   **前端这一半**必须成立的三件事：

     1. 三个配置项的名字与默认值 —— 名字对不上，后端的 applyPatch 就认不出来，
        表现为「开关能动、看起来生效了，重启后什么都没变」
        （响度那几个键以前就是这样丢的，见 services.go 里的注释）；
     2. 它们必须在 SYNCED_KEYS 里 —— 漏掉的键永远不会被推给后端；
     3. 设置界面确实渲染了这三个开关，且切歌间隔的滑条量程是 0~10 秒。

   前端的其余职责（把值推下去、把跳过量显示对）由
   tools/check-app.mjs / verify:lit 这类需要真实后端的自检覆盖。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const storeSrc = read("frontend/src/js/store.js");
const audioSrc = read("frontend/src/js/audio.js");
const viewSrc = read("frontend/src/js/ui/settings-view.js");
const settingsSrc = read("frontend/src/js/settings.js");
const bridgeSrc = read("frontend/src/js/bridge.js");
const mainSrc = read("frontend/src/js/main.js");
const goConfigSrc = read("internal/bootstrap/config.go");
const goServicesSrc = read("services.go");
const goPlayerSrc = read("services_player.go");
const engineSrc = read("internal/audioplay/engine.go");

/* --------------------------------------------------------------------------
   1. 默认值（前后端必须一致）
   -------------------------------------------------------------------------- */

test("store.js：跳过静音默认关闭，切歌间隔默认 1.5 秒", () => {
  // 两个跳过开关默认关闭：它们会改变用户听到的音频（把头尾掐掉），
  // 必须由用户明确开启 —— 与「响度均衡」同一立场。
  assert.match(storeSrc, /skipSilenceHead:\s*false/, "skipSilenceHead 的默认值应当是 false");
  assert.match(storeSrc, /skipSilenceTail:\s*false/, "skipSilenceTail 的默认值应当是 false");
  // 切歌间隔默认 1.5 秒（需求指定的默认值）
  assert.match(storeSrc, /trackGapSeconds:\s*1\.5/, "trackGapSeconds 的默认值应当是 1.5");
});

test("Go 侧：默认值与前端一致（改一边忘另一边会让界面显示与实际不符）", () => {
  assert.match(goConfigSrc, /DefaultTrackGapSeconds\s*=\s*1\.5/, "Go 侧默认间隔应当是 1.5 秒");
  assert.match(goConfigSrc, /SkipSilenceHead:\s*false/, "Go 侧 skipSilenceHead 默认应当是 false");
  assert.match(goConfigSrc, /SkipSilenceTail:\s*false/, "Go 侧 skipSilenceTail 默认应当是 false");
  assert.match(goConfigSrc, /TrackGapSeconds:\s*DefaultTrackGapSeconds/, "Go 侧默认值应当引用同一个常量");
});

/* --------------------------------------------------------------------------
   2. 配置同步（三个键都必须能被推给后端 + 被后端认出来）
   -------------------------------------------------------------------------- */

test("store.js：三个键都在 SYNCED_KEYS 里", () => {
  // SYNCED_KEYS 是「哪些配置会推给后端」的唯一清单。
  // 漏一个的后果不是报错，而是这个设置**永远存不进 config.json**。
  const block = storeSrc.slice(storeSrc.indexOf("const SYNCED_KEYS"));
  const end = block.indexOf("];");
  const list = block.slice(0, end);
  for (const key of ["skipSilenceHead", "skipSilenceTail", "trackGapSeconds"]) {
    assert.ok(list.includes(`"${key}"`), `SYNCED_KEYS 缺少 ${key}（该设置将无法落盘）`);
  }
});

test("services.go：applyPatch 认识三个键", () => {
  // 后端 applyPatch 是白名单式的：没有分支的键会被**静默忽略**，
  // 症状正是「设置改了、界面显示了、重启就没了」。
  for (const key of ["skipSilenceHead", "skipSilenceTail", "trackGapSeconds"]) {
    assert.ok(goServicesSrc.includes(`case "${key}":`), `applyPatch 缺少 ${key} 分支（该设置无法落盘）`);
  }
});

test("bridge.js：跳转设置的绑定方法接线正确", () => {
  assert.match(bridgeSrc, /playerSetPlaybackOptions:/, "bridge 缺少 playerSetPlaybackOptions（设置界面推不下去）");
  assert.match(
    bridgeSrc,
    /Player\?\.SetPlaybackOptions/,
    "playerSetPlaybackOptions 必须指向绑定层的 SetPlaybackOptions"
  );
});

/* --------------------------------------------------------------------------
   3. 设置界面
   -------------------------------------------------------------------------- */

test("设置界面渲染了三个控件", () => {
  for (const key of ["skipSilenceHead", "skipSilenceTail"]) {
    assert.ok(viewSrc.includes(`switchControl("${key}"`), `设置界面缺少 ${key} 的开关`);
  }
  assert.ok(viewSrc.includes('rangeSlider("set-track-gap", "trackGapSeconds"'), "设置界面缺少切歌间隔的滑条");
});

test("切歌间隔的滑条量程是 0~10 秒、步进 0.1、保留一位小数", () => {
  // 用「方法定义」定位，而不是 indexOf("sliderOptions(root, key)") ——
  // 后者会先命中 bindSliders 里的**调用点**，截出来的是一段无关代码。
  const start = viewSrc.indexOf("  sliderOptions(root, key) {");
  assert.ok(start > 0, "settings-view.js 里没有找到 sliderOptions 的定义");
  const body = viewSrc.slice(start, viewSrc.indexOf("  sliderValue(key) {", start));
  assert.ok(body.length > 0, "sliderOptions 的方法体截取失败");

  // 0 必须可及：用户要能选「不留间隔」。
  assert.match(body, /isTrackGap\s*\n?\s*\?\s*0/, "切歌间隔的下限应当是 0（不留间隔）");
  assert.match(body, /isTrackGap\s*\n?\s*\?\s*10/, "切歌间隔的上限应当是 10 秒");
  // 默认 1.5 秒要求步进必须小于 1，否则用户调不出 1.5
  assert.match(body, /isTrackGap\s*\?\s*0\.1/, "切歌间隔的步进应当是 0.1 秒");
  // 显示 1.5 而不是 1（四舍五入会把默认值显示错）
  assert.match(body, /isTrackGap\s*\?\s*1\s*:\s*0/, "切歌间隔应当保留一位小数");
});

test("切换跳过静音的开关会立刻推给后端", () => {
  // 不推的话要等到下一次配置批量同步（400ms 去抖）——
  // 用户在这中间点了下一首，那首歌就会用旧设置播出来。
  assert.ok(
    settingsSrc.includes("applyPlaybackOptions()"),
    "settings.js 在切换跳过静音开关时必须调用 applyPlaybackOptions()"
  );
  assert.match(
    settingsSrc,
    /skipSilenceHead.*skipSilenceTail|skipSilenceTail.*skipSilenceHead/s,
    "settings.js 应当同时识别两个跳过静音开关"
  );
});

test("启动时就把设置推给后端（否则第一首歌不生效）", () => {
  // 跳过静音的方案是在**装载时**算好的，而 startRuntime 的第一次 run
  // 就可能装载并起播 —— 推晚了第一首会用默认值播出。
  //
  // 定位时要用带缩进的调用形式（`  startRuntime();`）：光是 indexOf("startRuntime()")
  // 会命中上方注释里提到它的那一行（"必须排在 startRuntime() 之前"），
  // 于是断言看起来失败、实际代码是对的。
  const probeIdx = mainSrc.indexOf("await probeBackend();");
  const applyIdx = mainSrc.indexOf("  applyPlaybackOptions();");
  const runtimeIdx = mainSrc.indexOf("  startRuntime();");
  assert.ok(probeIdx > 0, "main.js 里没有找到 await probeBackend()");
  assert.ok(applyIdx > 0, "main.js 启动流程里没有调用 applyPlaybackOptions()");
  assert.ok(runtimeIdx > 0, "main.js 里没有找到 startRuntime() 调用");
  assert.ok(applyIdx > probeIdx, "applyPlaybackOptions 必须在 probeBackend 之后（后端可用性未知时推下去没有意义）");
  assert.ok(applyIdx < runtimeIdx, "applyPlaybackOptions 必须在 startRuntime 之前（否则第一首歌不生效）");
});

/* --------------------------------------------------------------------------
   4. 前端不应该重复实现后端已经做的事
   -------------------------------------------------------------------------- */

test("前端不做静音检测（那是后端 PCM 扫描的职责）", () => {
  // 前端没有 raw PCM；真做起来要把音频再解一遍，等于把刚搬到后端的工作搬回来。
  // 这条断言是为了拦住「顺手在前端也加一个」这种改动。
  assert.ok(
    !/function\s+\w*[Ss]ilence\w*\s*\(/.test(audioSrc.replace(/lastSkippedSilence[\s\S]{0,200}?\}/, "")),
    "audio.js 不该自己实现静音检测（见 internal/audioplay/silence.go）"
  );
});

test("audio.js 提供了播放选项的同步接口与状态查询", () => {
  assert.match(audioSrc, /export async function applyPlaybackOptions\(\)/, "缺少 applyPlaybackOptions 导出");
  assert.match(
    audioSrc,
    /export function playbackOptionsState\(\)/,
    "缺少 playbackOptionsState 导出（设置界面展示用）"
  );
  assert.match(audioSrc, /export function lastSkippedSilence\(\)/, "缺少 lastSkippedSilence 导出");
});

test("后端返回的跳过量会被记下来（而不是丢掉）", () => {
  // 装载响应里的 skippedHeadMs / skippedTailMs 是唯一能告诉用户
  // 「这次实际跳了多少」的来源，丢了的话设置界面只能显示「未知」。
  assert.match(audioSrc, /skippedHeadMs/, "audio.js 没有读取后端返回的 skippedHeadMs");
  assert.match(audioSrc, /skippedTailMs/, "audio.js 没有读取后端返回的 skippedTailMs");
});

test("services_player.go：装载响应带上跳过量", () => {
  assert.match(goPlayerSrc, /"skippedHeadMs":\s*trim\.SkippedHeadMs/, "Load 响应缺少 skippedHeadMs");
  assert.match(goPlayerSrc, /"skippedTailMs":\s*trim\.SkippedTailMs/, "Load 响应缺少 skippedTailMs");
});

/* --------------------------------------------------------------------------
   4b. 「自动跳过」而不是「把歌变短」—— 时间轴不变式
   --------------------------------------------------------------------------
   用户澄清：跳过静音**仍然是整首歌的播放**，只是自动跳过了那两段。
   所以时长与进度条必须留在原曲时间轴上 —— 这不是实现细节，
   它直接决定歌词对不对得上、记忆进度能不能恢复。
   -------------------------------------------------------------------------- */

test("引擎：时长恒为整首歌，不因跳过静音而变短", () => {
  // ★ 本功能的语义核心：跳过的只是「会被播放的区间」，
  // 不是「这首歌的时间轴」—— 时长必须始终是整个文件。
  //
  // 抓法：Position() 的分母必须直接由 pcmSize 算，
  // 不能是 endFrame 或 (endFrame - startFrame)（那两种都会让歌「变短」）。
  const start = engineSrc.indexOf("func (e *Engine) Position() (posMs, durMs int64) {");
  assert.ok(start > 0, "engine.go 里没有找到 Position()");
  const body = engineSrc.slice(start, engineSrc.indexOf("\n}\n", start));

  assert.match(
    body,
    /frameToMs\(e\.pcmSize \/ FrameSize\)/,
    "Position() 的时长必须是整个文件（pcmSize）——否则跳过静音会让歌「变短」，歌词整体错位"
  );
  assert.ok(
    !/end\s*-\s*start/.test(body),
    "Position() 不该拿「跳过之后的区间长度」当分母（那是「把歌变短」，不是「自动跳过」）"
  );
});

test("引擎：位置是原时间轴上的绝对位置，不从 0 重新起算", () => {
  // 位置若从 0 起算，歌词会整体提前（开头静音多长就偏多少），
  // 「保留歌曲播放进度」存下来的位置也会对不上。
  const start = engineSrc.indexOf("func (e *Engine) Position() (posMs, durMs int64) {");
  const body = engineSrc.slice(start, engineSrc.indexOf("\n}\n", start));
  assert.match(
    body,
    /return frameToMs\(frame\),/,
    "位置必须是 frame 本身（原曲时间轴上的绝对位置），不能减去 trimStart"
  );
});

test("引擎：起播点单独可查（trimStart），不混进时长计算", () => {
  // 「实际从哪儿开始出声」要能被单独读到：诊断信息与前端提示都用它，
  // 而它**不能**参与时长/位置的计算（否则就是上面两条说的错误）。
  assert.match(engineSrc, /func \(e \*Engine\) TrimStart\(\) int64/, "缺少 TrimStart()");
});

test("services_player.go：注释里写明「自动跳过 ≠ 把歌变短」", () => {
  // 这条不变式很容易被后来的改动无意破坏（比如「顺手把时长也改成跳完之后」），
  // 所以要求源码里留下解释，改的人能看到代价。
  assert.match(goPlayerSrc, /自动跳过/, "services_player.go 应当写明跳过静音的语义是「自动跳过」");
});

/* --------------------------------------------------------------------------
   5. 两个开关必须分别生效
   -------------------------------------------------------------------------- */

test("Go 侧：两个开关分别传给检测与决策（不能被合并成一个）", () => {
  // 需求是「分别为跳过头部、尾部的静音区域」——合并成一个开关就违背了它。
  assert.match(
    goPlayerSrc,
    /PlanSilenceTrim\(info,\s*cfg\.SkipSilenceHead,\s*cfg\.SkipSilenceTail\)/,
    "两个开关必须**分别**传给 PlanSilenceTrim（顺序是 head, tail）"
  );
});

test("Go 侧：两个开关都关时不去扫文件（省掉一次整段读取）", () => {
  assert.match(
    goPlayerSrc,
    /if !cfg\.SkipSilenceHead && !cfg\.SkipSilenceTail/,
    "两个开关都关时应当短路，不调用 LoadSilenceInfo"
  );
});
