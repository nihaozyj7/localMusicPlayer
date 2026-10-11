/* ==========================================================================
   magic-circle-logic.test.js — 魔法阵样式「纯逻辑」单测
   --------------------------------------------------------------------------
   ★ 这个文件属于**第三方样式包自己**，不是播放器项目的测试：
     它不 import 宿主任何模块（store / playerhost / 契约包都不碰），
     只测样式包里那几个「不画布也能验」的纯函数。因此它可以在
     项目外面单独跑：

       node --test plugins/style/magic-circle/tests/

   覆盖五块：
     1. wordLitCount：从「行上有 words」到「该点亮到第几个字素」的判定 ——
        words 缺失 / 个数对不上 / 位置不是有限数，一律返回 -1（= 回退逐行）；
     2. withAlpha：已唱位图的整体压暗是**乘**在颜色自带 alpha 上的；
     3. WORD 配色契约：点亮色必须和未唱色真的不一样，且压暗系数在 (0,1)；
     4. shouldLeave：onSing 的「上一句该不该退场」判据
        （正常推进要退、往回 seek 也要退、第一句不退、没换行不退）；
     5. withDisplayText：多语言副行拼进主行（只改文本，不动时间轴），
        老宿主没有 sdk 零件时退回本地拼接。

   画布上的那部分（金色像素真的逐字长出来、行级歌词一像素不变）只能靠无头浏览器：
     node plugins/style/magic-circle/tests/canvas-word-check.mjs [预览地址]
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import { wordLitCount } from "../lib/render.js";
import { withAlpha } from "../lib/util.js";
import { WORD } from "../lib/config.js";
import { shouldLeave, withDisplayText } from "../skin.js";

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

/* --------------------------------------------------------------------------
   4. 退场判据（onSing 用）
   画布上的字只能截图给人工看，但「什么时候该退场」这条判据是纯函数，直接打它。
   这里守的是一段真实回归：曾经写成 `prev > sing`，恒为 false，上一句永远不退场。
   -------------------------------------------------------------------------- */
test("shouldLeave：正常推进 / 往回 seek 都要退场，第一句与没换行不退", () => {
  assert.equal(shouldLeave(0, 1), true, "正常推进 0→1 要退场（以前写成 prev > sing，恒 false）");
  assert.equal(shouldLeave(3, 1), true, "往回 seek 3→1 也要退场");
  assert.equal(shouldLeave(-1, 0), false, "第一句（prev = -1）不退场");
  assert.equal(shouldLeave(2, 2), false, "没换行就不退场");
});

/* --------------------------------------------------------------------------
   5. 多语言副行拼接（画布上没有 DOM 副行可查，直接打它的拼接函数）
   -------------------------------------------------------------------------- */
test("withDisplayText：有副行拼成一行，只改文本不动时间轴，并能退回本地拼接", () => {
  const viaSdk = withDisplayText({ sdk: { lyricDisplayText: (l) => [l.text, ...(l.trans || [])].join(" · ") } }, [
    { time: 0, text: "Hello", trans: ["你好"] },
    { time: 1, text: "Solo" },
  ]);
  assert.equal(viaSdk.length, 2, "行数不变（只改文本，不改时间轴）");
  assert.equal(viaSdk[0].text, "Hello · 你好", "有副行 → 拼成一行");
  assert.equal(viaSdk[1].text, "Solo", "没副行 → 原样返回");
  assert.equal(viaSdk[0].time, 0, "时间不动");

  const fallback = withDisplayText({ sdk: {} }, [{ time: 0, text: "A", trans: ["B"] }]);
  assert.equal(fallback[0].text, "A · B", "老宿主没有 sdk 零件时退回本地拼接");
});
