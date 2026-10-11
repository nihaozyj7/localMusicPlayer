/* ==========================================================================
   magic-circle-word.test.js — 魔法阵样式「逐字点亮」的纯逻辑单测
   --------------------------------------------------------------------------
   覆盖三块**不画布也能验**的东西：
     1. wordLitCount：从「行上有 words」到「该点亮到第几个字素」的判定 ——
        words 缺失 / 个数对不上 / 位置不是有限数，一律返回 -1（= 回退逐行）；
     2. withAlpha：已唱位图的整体压暗是**乘**在颜色自带 alpha 上的；
     3. WORD 配色契约：点亮色必须和未唱色真的不一样，且压暗系数在 (0,1)。

   画布上的那部分（金色像素真的逐字长出来、行级歌词一像素不变）只能靠无头浏览器：
     node tools/check-word-lyrics.mjs   §[7] 魔法阵

   注意 import 路径：player-skins/magic-circle 是**示例样式包**，不是 npm workspace
   成员，所以这里按相对路径引；它也是零 import 的（契约 18/10 条），能在 Node 里直接跑。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import { wordLitCount } from "../../player-skins/magic-circle/lib/render.js";
import { withAlpha } from "../../player-skins/magic-circle/lib/util.js";
import { WORD } from "../../player-skins/magic-circle/lib/config.js";

/** 五个字、每 100ms 一个（增强 LRC 归一化后的形态） */
const LINE = { text: "第二句开唱", words: [6000, 6100, 6200, 6300, 6400] };

test("wordLitCount：有字级时间轴时按位置推进（含边界）", () => {
  assert.equal(wordLitCount(LINE, 5, 5900), 0, "还没唱到第一个字");
  assert.equal(wordLitCount(LINE, 5, 6000), 1, "正好唱到第一个字（含等号）");
  assert.equal(wordLitCount(LINE, 5, 6100), 2, "正好唱到第二个字");
  assert.equal(wordLitCount(LINE, 5, 6350), 4, "中间位置");
  assert.equal(wordLitCount(LINE, 5, 6400), 5, "整句唱完");
  assert.equal(wordLitCount(LINE, 5, 99999), 5, "越过后不能超过字素数");
});

test("wordLitCount：三种情况一律 -1 = 回退逐行歌词", () => {
  assert.equal(wordLitCount({ text: "第二句开唱" }, 5, 6300), -1, "行级歌词（没有 words）");
  assert.equal(wordLitCount({ text: "第二句开唱", words: [] }, 5, 6300), -1, "空时间轴");
  assert.equal(wordLitCount(null, 5, 6300), -1, "没有行");
  // 多语言行：skin.js#withDisplayText 把译文拼进了正文（`原文 · 译文`），
  // words 只对应原文 → 下标一律错位，宁可不点亮也不能点错字
  assert.equal(wordLitCount(LINE, 9, 6300), -1, "字素数对不上（译文被拼进正文）");
  assert.equal(wordLitCount(LINE, 5, undefined), -1, "位置缺失");
  assert.equal(wordLitCount(LINE, 5, Number.NaN), -1, "位置不是有限数");
});

test("withAlpha：整体透明度是乘上去的，认不出的色值原样返回", () => {
  assert.equal(withAlpha("rgba(255, 196, 120, 0.55)", 0.5), "rgba(255,196,120,0.275)");
  assert.equal(withAlpha("rgba(236, 240, 255, 1)", 0.62), "rgba(236,240,255,0.620)");
  assert.equal(withAlpha("rgb(10, 20, 30)", 0.5), "rgba(10,20,30,0.500)", "没有 alpha 就按 1 算");
  assert.equal(withAlpha("rgba(1,2,3,0.5)", 4), "rgba(1,2,3,1.000)", "越界要夹到 1");
  assert.equal(withAlpha("rgba(1,2,3,0.5)", 0), "rgba(1,2,3,0.000)");
  assert.equal(withAlpha("#ecf0ff", 0.5), "#ecf0ff", "认不出就不动它");
  assert.equal(withAlpha("hsla(210, 50%, 60%, 0.5)", 0.5), "hsla(210, 50%, 60%, 0.5)");
});

test("WORD 配色契约：点亮色与未唱色必须能区分，压暗系数在 (0,1)", () => {
  assert.notEqual(WORD.litBody, WORD.body, "已唱本体色不能和未唱一样");
  assert.notEqual(WORD.litGlow, WORD.glow, "已唱辉光色不能和未唱一样");
  assert.ok(WORD.dimUnlit > 0 && WORD.dimUnlit < 1, `dimUnlit 要在 (0,1)，现在是 ${WORD.dimUnlit}`);
});
