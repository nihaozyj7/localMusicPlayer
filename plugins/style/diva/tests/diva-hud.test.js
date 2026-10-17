/* ==========================================================================
   diva/tests/diva-hud.test.js — HUD 的纯逻辑自检
   --------------------------------------------------------------------------
   HUD 的状态机（live / paused / standby）与文案全部抽在 describeTrack() 里，
   不依赖 DOM；时间码格式化与「秒没变就不写 DOM」的纪律用纯函数 + 静态扫描
   分别钉住。

   运行：node --test "plugins/style/diva/tests/diva-hud.test.js"
   ========================================================================== */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UI } from "../lib/config.js";
import { ONLINE_KIND, describeTrack, kindOf, timeText } from "../lib/hud.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "lib", "hud.js"), "utf8");

const TRACK = Object.freeze({
  id: "t1",
  title: "全息夜想曲",
  artist: "初音未来",
  album: "HOLOGRAM",
  duration: 245000,
  kind: "local",
});

/* ==========================================================================
   1. 三态
   ========================================================================== */
test("describeTrack：没有曲目 → STANDBY + 未在播放", () => {
  const desc = describeTrack(null);
  assert.deepEqual(desc, {
    state: "standby",
    label: UI.standby,
    title: UI.emptyTrack,
    artist: "",
  });
  assert.equal(desc.state, "standby");
  assert.equal(desc.label, "STANDBY");
  assert.equal(desc.title, "未在播放");
});

test("describeTrack：有曲目且正在播放 → LIVE", () => {
  const desc = describeTrack(TRACK, { playing: true });
  assert.equal(desc.state, "live");
  assert.equal(desc.label, UI.live);
  assert.equal(desc.label, "LIVE");
  assert.equal(desc.title, "全息夜想曲");
  assert.equal(desc.artist, "初音未来");
});

test("describeTrack：有曲目但暂停 → PAUSED", () => {
  const desc = describeTrack(TRACK, { playing: false });
  assert.equal(desc.state, "paused");
  assert.equal(desc.label, UI.paused);
  assert.equal(desc.label, "PAUSED");
  assert.equal(desc.title, "全息夜想曲");
});

test("describeTrack：播放器还没就绪 → STANDBY（loading 阶段不该显示 PAUSED）", () => {
  const desc = describeTrack(TRACK, { playing: false, ready: false });
  assert.equal(desc.state, "standby");
  assert.equal(desc.label, UI.standby);
  assert.equal(desc.title, "全息夜想曲", "曲目信息仍然要显示出来");
  const alsoLoading = describeTrack(TRACK, { playing: true, ready: false });
  assert.equal(alsoLoading.state, "standby", "没就绪时就算宿主说 playing 也按待机显示");
});

test("describeTrack：playing 缺省视为暂停（不把 undefined 当成在播）", () => {
  assert.equal(describeTrack(TRACK).state, "paused");
  assert.equal(describeTrack(TRACK, {}).state, "paused");
});

/* ==========================================================================
   2. 文案兜底
   ========================================================================== */
test("describeTrack：歌手为空用专辑，再空用空串（不留孤零零的分隔点）", () => {
  const noArtist = describeTrack({ title: "x", artist: "", album: "某专辑" }, { playing: true });
  assert.equal(noArtist.artist, "某专辑");
  const bare = describeTrack({ title: "x", artist: "  ", album: "" }, { playing: true });
  assert.equal(bare.artist, "");
  const blank = describeTrack({ title: "", artist: "", album: "" }, { playing: true });
  assert.equal(blank.title, UI.emptyTrack, "曲名全空时给明确的「未在播放」");
  assert.equal(blank.artist, "");
});

test("describeTrack：空白字符串要 trim，不能把空格当曲名", () => {
  const desc = describeTrack({ title: "   ", artist: "  ", album: "  " }, { playing: true });
  assert.equal(desc.title, UI.emptyTrack);
  assert.equal(desc.artist, "");
});

/* ==========================================================================
   3. 在线试听角标
   ========================================================================== */
test("kindOf：在线试听标记只在「有曲目 + online」时出现，文案固定", () => {
  assert.equal(ONLINE_KIND, "在线试听");
  assert.equal(kindOf(TRACK, { online: true }), ONLINE_KIND);
  assert.equal(kindOf(TRACK, { online: false }), "");
  assert.equal(kindOf(TRACK, {}), "");
  assert.equal(kindOf(null, { online: true }), "", "没有曲目时不该出现角标");
  assert.equal(kindOf(undefined, { online: true }), "");
});

/* ==========================================================================
   4. 秒级时间码
   ========================================================================== */
test("timeText：mm:ss，分钟持续累加；负数 / 非法值按 0", () => {
  assert.equal(timeText(0), "00:00");
  assert.equal(timeText(999), "00:00", "不足一秒不进位");
  assert.equal(timeText(1000), "00:01");
  assert.equal(timeText(59999), "00:59");
  assert.equal(timeText(60000), "01:00");
  assert.equal(timeText(61234), "01:01");
  assert.equal(timeText(3599000), "59:59");
  assert.equal(timeText(3600000), "60:00", "小时以上按分钟继续累加");
  assert.equal(timeText(-500), "00:00");
  assert.equal(timeText(Number.NaN), "00:00");
  assert.equal(timeText(undefined), "00:00");
});

/* ==========================================================================
   5. 静态扫描：契约纪律
   ========================================================================== */
test("不建任何计时器 / 循环：时间码由 entry 的帧循环喂进来", () => {
  assert.doesNotMatch(SRC, /\bsetInterval\s*\(/, "HUD 不建计时器");
  assert.doesNotMatch(SRC, /\bsetTimeout\s*\(/, "HUD 不建计时器");
  assert.doesNotMatch(SRC, /requestAnimationFrame/, "HUD 不持有帧循环");
  assert.match(SRC, /function tick\(/, "只被动接受 tick(pos, dur, playing)");
});

test("不拼 HTML / 不发请求 / 不碰整窗对象", () => {
  assert.doesNotMatch(SRC, /innerHTML/);
  assert.doesNotMatch(SRC, /outerHTML/);
  assert.doesNotMatch(SRC, /insertAdjacentHTML/);
  assert.match(SRC, /textContent/, "文字一律 textContent");
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /\beval\s*\(/, /new\s+Function\s*\(/, /\bwindow\./, /document\.documentElement/, /Math\.random\s*\(/]) {
    assert.doesNotMatch(SRC, bad, `hud.js 不许出现 ${bad}`);
  }
});

test("秒级去重：格式化结果缓存，秒没变就不写 DOM", () => {
  assert.match(SRC, /let lastCur = ""/);
  assert.match(SRC, /let lastDur = ""/);
  assert.match(SRC, /if \(cur !== lastCur\)/);
  assert.match(SRC, /if \(dur !== lastDur\)/);
  assert.match(SRC, /timeText\(positionMs\)/);
  assert.match(SRC, /timeText\(durationMs\)/);
});

test("没有静态 import：子模块必须透传 ?t=（/skins/ 逐文件鉴权）", () => {
  const staticImports = [...SRC.matchAll(/^\s*import\s+[^("]/gm)];
  assert.equal(staticImports.length, 0);
  assert.match(SRC, /new URL\(import\.meta\.url\)\.search/);
  assert.match(SRC, /\$\{Q\}/);
  assert.match(SRC, /import\(`\.\/config\.js\$\{Q\}`\)/);
  assert.match(SRC, /import\(`\.\/util\.js\$\{Q\}`\)/);
});

test("观测契约：DOM 类名 / data-state / 文案取 UI", () => {
  for (const cls of [
    "dv-hud",
    "dv-hud__left",
    "dv-hud__badge",
    "dv-hud__dot",
    "dv-hud__badgeText",
    "dv-hud__meta",
    "dv-hud__title",
    "dv-hud__artist",
    "dv-hud__right",
    "dv-hud__stage",
    "dv-hud__stageDot",
    "dv-hud__stageLabel",
    "dv-hud__band",
    "dv-hud__time",
    "dv-hud__cur",
    "dv-hud__slash",
    "dv-hud__dur",
    "dv-hud__kind",
  ]) {
    assert.ok(SRC.includes(cls), `缺少 DOM 类名 ${cls}`);
  }
  assert.match(SRC, /badge\.dataset\.state/, "状态徽章必须写 data-state");
  for (const label of ["UI.live", "UI.paused", "UI.standby", "UI.stageLabel", "UI.bandLabel", "UI.emptyTrack"]) {
    assert.ok(SRC.includes(label), `文案必须取 config 的 ${label}`);
  }
  assert.match(SRC, /return \{ setTrack, setEmpty, tick, destroy \}/, "接口冻结");
  assert.match(SRC, /function setTrack\(/);
  assert.match(SRC, /function setEmpty\(/);
  assert.match(SRC, /function destroy\(/);
});
