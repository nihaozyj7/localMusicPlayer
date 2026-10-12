/* ==========================================================================
   abyss · 纯逻辑自检（node --test "plugins/style/abyss/tests/*.test.js"）
   --------------------------------------------------------------------------
   这一款所有"决定"都在 lib/water.js 里：频谱 → 泵浦/湍流/泡沫、封面 → 颜料密度场、
   位置 → 下潜深度、尺寸 → 流场分辨率、帧耗时 → 自适应降级档、泵浦相位积分、
   字形遮罩的坐标换算、换歌涌浪包络。这些都是纯函数，这里逐条钉死。

   最后一段是**静态扫描**（跟另外五款同一套纪律）：
   · 零项目依赖、`?t=` 透传、子模块之间不许静态 import（会绕开 token）
   · `ctx.*` 白名单、越权 API 禁令
   · 清单 background:true ⇒ **必须**自己填背景层、destroy **必须**自己清干净
   · CSS 纪律（不给宿主壳写前缀 / 不用 !important / 选择器相对舞台根）
   · 只有一条 rAF；GL 的三条硬规矩（查错误、不 finish、不自我反馈）
   ========================================================================== */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as wa from "../lib/water.js";
import { maskScaleFor } from "../lib/mask.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(HERE, "..");
const SKIN_JS = readFileSync(path.join(PKG, "skin.js"), "utf8");
const SKIN_CSS = readFileSync(path.join(PKG, "skin.css"), "utf8");
const MANIFEST = JSON.parse(readFileSync(path.join(PKG, "skin.json"), "utf8"));
const GL_JS = readFileSync(path.join(PKG, "lib/gl.js"), "utf8");
const C2D_JS = readFileSync(path.join(PKG, "lib/canvas2d.js"), "utf8");
const MASK_JS = readFileSync(path.join(PKG, "lib/mask.js"), "utf8");

const N = 128;
const flat = (v) => {
  const a = new Float32Array(N);
  a.fill(v);
  return a;
};
/** 只有低频有料（泵浦）/ 只有中频 / 只有高频 —— 用来确认三条通道互不串台 */
const withBand = (from, to, v) => {
  const a = new Float32Array(N);
  for (let i = from; i < to; i += 1) a[i] = v;
  return a;
};

/* ==========================================================================
   1. 小工具 / 颜色
   ========================================================================== */
test("clamp / clamp01 / round：边界与 NaN 都不产出坏值", () => {
  assert.equal(wa.clamp(5, 0, 3), 3);
  assert.equal(wa.clamp(-5, 0, 3), 0);
  assert.equal(wa.clamp(2, 0, 3), 2);
  assert.equal(wa.clamp01(-0.5), 0);
  assert.equal(wa.clamp01(1.5), 1);
  assert.equal(wa.round(1.23456, 2), 1.23);
  assert.equal(wa.round(1.235, 2), 1.24);
  assert.equal(wa.round(2, 0), 2);
});

test("颜色：normHex / hexToRgb / rgba / mixRgb", () => {
  assert.equal(wa.normHex("#AABBCC", "#000"), "#aabbcc");
  assert.equal(wa.normHex("abc", "#000"), "#aabbcc");
  assert.equal(wa.normHex("#04121bff", "#000"), "#04121b");
  assert.equal(wa.normHex("nope", "#111111"), "#111111");
  assert.equal(wa.normHex(undefined, "#222222"), "#222222");
  assert.deepEqual(wa.hexToRgb("#58c7ff"), [88, 199, 255]);
  assert.deepEqual(wa.hexToRgb("bad"), [187, 170, 221], "三位十六进制也是合法色");
  assert.deepEqual(wa.hexToRgb("zzz", [1, 2, 3]), [1, 2, 3]);
  assert.equal(wa.rgba("#04121b", 0.6), "rgba(4,18,27,0.6)");
  assert.equal(wa.rgba("#04121b", 5), "rgba(4,18,27,1)");
  assert.deepEqual(wa.mixRgb([0, 0, 0], [10, 20, 30], 0.5), [5, 10, 15]);
  assert.deepEqual(wa.mixRgb([0, 0, 0], [10, 20, 30], 9), [10, 20, 30]);
});

/* ==========================================================================
   2. 频谱 → 泵浦 / 湍流 / 泡沫
   ========================================================================== */
test("bandAvg：分段平均、越界夹住、空数组与非数字都当 0", () => {
  const b = withBand(0, 128, 0);
  for (let i = 0; i < 8; i += 1) b[i] = 1;
  assert.equal(wa.bandAvg(b, 0, 8), 1);
  assert.equal(wa.bandAvg(b, 8, 16), 0);
  assert.equal(wa.bandAvg(b, 0, 999), wa.bandAvg(b, 0, 128));
  assert.equal(wa.bandAvg([], 0, 8), 0);
  assert.equal(wa.bandAvg(null, 0, 8), 0);
  assert.equal(wa.bandAvg([Number.NaN, Number.NaN], 0, 2), 0);
  assert.equal(wa.bandAvg([1, Number.NaN], 0, 2), 1);
});

test("pumpOf：三个通道互不串台（低频只推 lift、中频只推 turb、高频只推 foam）", () => {
  const a = wa.pumpOf(withBand(0, 8, 0.8), null);
  assert.ok(a.lift > 0.5, `低频该抬起 lift，实际 ${a.lift}`);
  assert.equal(a.turb, 0);
  assert.equal(a.foam, 0);
  const b = wa.pumpOf(withBand(32, 96, 0.8), null);
  assert.equal(b.lift, 0);
  assert.ok(b.turb > 0.5);
  const c = wa.pumpOf(withBand(96, 128, 0.8), null);
  assert.equal(c.lift, 0);
  assert.equal(c.turb, 0);
  assert.ok(c.foam > 0.5);
});

test("pumpOf：attack 快、release 慢（涌上来要立刻看见，退下去要慢慢落）", () => {
  const loud = withBand(0, 8, 1);
  const quiet = flat(0);
  let p = wa.pumpOf(loud, null);
  const rise = p.lift;
  assert.equal(wa.round(rise, 4), 0.55, "第一帧按 attack=0.55 上涨");
  for (let i = 0; i < 12; i += 1) p = wa.pumpOf(loud, p);
  assert.ok(p.lift > 0.99, `10 帧后该接近 1，实际 ${p.lift}`);
  const before = p.lift;
  const down = wa.pumpOf(quiet, p);
  assert.equal(wa.round(down.lift, 4), wa.round(before * 0.88, 4), "下降按 release=0.12");
  assert.ok(down.lift > before * 0.5, "一帧不该掉光");
});

test("pumpOf：音量无关（同一段频谱整体缩小 100 倍，标量几乎不变）", () => {
  const loud = withBand(0, 8, 1).map((v) => v * 1);
  const soft = withBand(0, 8, 0.01);
  let a = null;
  let b = null;
  for (let i = 0; i < 30; i += 1) {
    a = wa.pumpOf(loud, a);
    b = wa.pumpOf(soft, b);
  }
  assert.ok(Math.abs(a.lift - b.lift) < 1e-6, `相对量应与绝对响度无关：${a.lift} vs ${b.lift}`);
});

test("pumpOf：没有频谱（null）时缓慢落回 0，不会卡在历史峰值", () => {
  let p = null;
  for (let i = 0; i < 20; i += 1) p = wa.pumpOf(withBand(0, 8, 1), p);
  const peak = p.lift;
  assert.ok(peak > 0.99);
  for (let i = 0; i < 60; i += 1) p = wa.pumpOf(null, p);
  assert.ok(p.lift < 0.05, `静音 60 帧后该落回 0，实际 ${p.lift}`);
});

test("pumpOf：峰值衰减让「几十秒不换歌」不会把标量锁死在历史最高点", () => {
  let p = null;
  for (let i = 0; i < 10; i += 1) p = wa.pumpOf(withBand(0, 8, 1), p);
  const peak0 = p.lowPeak;
  for (let i = 0; i < 200; i += 1) p = wa.pumpOf(withBand(0, 8, 0.2), p);
  assert.ok(p.lowPeak < peak0, "峰值在衰减");
  assert.ok(p.lowPeak >= 0.2, "但不会低于当前实际电平");
});

/* ==========================================================================
   3. 封面 → 颜料密度场
   ========================================================================== */
test("densityFromCover：尺寸、通道、亮度→alpha 的映射", () => {
  const src = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i += 1) {
    src[i * 4] = 255;
    src[i * 4 + 1] = 255;
    src[i * 4 + 2] = 255;
    src[i * 4 + 3] = 255;
  }
  const out = wa.densityFromCover(src, 64, 256);
  assert.equal(out.length, 256 * 256 * 4);
  const o = (128 * 256 + 128) * 4;
  assert.equal(out[o], 255, "RGB 保持原色");
  assert.ok(out[o + 3] > 200, "亮色 → 高密度");
  const black = new Uint8Array(64 * 64 * 4);
  const ob = wa.densityFromCover(black, 64, 256);
  const ob0 = (10 * 256 + 10) * 4;
  assert.equal(ob[ob0], 0);
  assert.ok(ob[ob0 + 3] > 0 && ob[ob0 + 3] < 100, `黑色也有底噪密度，实际 ${ob[ob0 + 3]}`);
});

test("densityFromCover：坏输入不炸（空 / 太短 → 全 0 的合法数组）", () => {
  const out = wa.densityFromCover(null, 64, 32);
  assert.equal(out.length, 32 * 32 * 4);
  assert.equal(out.some((v) => v !== 0), false);
  const short = wa.densityFromCover(new Uint8Array(10), 64, 32);
  assert.equal(short.some((v) => v !== 0), false);
});

test("densityFromCover：双线性放大后仍然平滑（源里 4× 的硬边被摊平，整体没有锯齿感）", () => {
  const src = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const v = x < 32 ? 0 : 255;
      const i = (y * 64 + x) * 4;
      src[i] = v;
      src[i + 1] = v;
      src[i + 2] = v;
      src[i + 3] = 255;
    }
  }
  const out = wa.densityFromCover(src, 64, 256);
  let maxStep = 0;
  let sumStep = 0;
  let n = 0;
  for (let y = 40; y < 216; y += 9) {
    for (let x = 1; x < 256; x += 1) {
      const a = out[(y * 256 + x) * 4];
      const b = out[(y * 256 + x - 1) * 4];
      const d = Math.abs(a - b);
      maxStep = Math.max(maxStep, d);
      sumStep += d;
      n += 1;
    }
  }
  // 4× 放大时双线性的理论最大台阶 = 255/4 ≈ 64；平均台阶必须远小于它
  assert.ok(maxStep <= 70, `单像素跳变该被摊在 4 个像素上，实测 ${maxStep}`);
  assert.ok(sumStep / n < 2, `平均跳变该接近 0，实测 ${wa.round(sumStep / n, 3)}`);
  const left = out[(128 * 256 + 8) * 4];
  const right = out[(128 * 256 + 248) * 4];
  assert.ok(right - left > 200, "两侧仍然分得开（不是糊成一坨）");
});

/* ==========================================================================
   4. 深度读数 / 分辨率档 / 自适应降级
   ========================================================================== */
test("depthOf：整首歌 0..2400m，越界与非法值都夹住", () => {
  assert.deepEqual(wa.depthOf(0, 0), { m: 0, text: "− 0 m" });
  assert.equal(wa.depthOf(0, 240000).text, "− 0 m");
  assert.equal(wa.depthOf(120000, 240000).m, 1200);
  assert.equal(wa.depthOf(120000, 240000).text, "− 1200 m");
  assert.equal(wa.depthOf(999999, 240000).m, 2400, "超过时长不越界");
  assert.equal(wa.depthOf(-5, 240000).m, 0);
  assert.equal(wa.depthOf(Number.NaN, 240000).m, 0);
  assert.equal(wa.depthOf(1000, 0).m, 0);
  assert.match(wa.depthOf(60000, 240000).text, /^− \d+ m$/);
});

test("flowSize：档位比例 / dpr 封顶 / 最小 2px / 未知档退回 half", () => {
  assert.deepEqual(wa.flowSize(1200, 700, 1, "full"), { w: 1200, h: 700, ratio: 1, tier: "full" });
  assert.deepEqual(wa.flowSize(1200, 700, 1, "half"), { w: 600, h: 350, ratio: 0.5, tier: "half" });
  const third = wa.flowSize(1200, 700, 1, "third");
  assert.equal(third.w, 400);
  assert.equal(third.h, 233);
  assert.equal(third.tier, "third");
  // dpr 2 会被封在 1.5（4K 下不能让填充率跟着翻倍）
  assert.equal(wa.flowSize(1200, 700, 2, "half").ratio, 0.75);
  assert.equal(wa.flowSize(1200, 700, 2, "full").ratio, 1.5);
  assert.equal(wa.flowSize(1, 1, 1, "third").w, 2, "再小也不小于 2px");
  assert.equal(wa.flowSize(1200, 700, 1, "wat").tier, "half");
});

test("nextTier：慢了一格就降、连快三窗才升、floor/ceil 夹住、NaN 不动", () => {
  const o = { floor: "third", ceil: "full" };
  assert.deepEqual(wa.nextTier(40, { tier: "full", streak: 0 }, o), { tier: "half", streak: 0, moved: 1, reason: "slow" });
  assert.deepEqual(wa.nextTier(40, { tier: "half", streak: 2 }, o), { tier: "third", streak: 0, moved: 1, reason: "slow" });
  assert.equal(wa.nextTier(40, { tier: "third", streak: 0 }, o).moved, 0, "到底了就不再降");
  assert.deepEqual(wa.nextTier(5, { tier: "half", streak: 2 }, o), { tier: "full", streak: 0, moved: -1, reason: "fast" });
  assert.equal(wa.nextTier(5, { tier: "half", streak: 0 }, o).tier, "half", "第一窗只记账不升");
  assert.equal(wa.nextTier(5, { tier: "half", streak: 0 }, o).streak, 1);
  assert.equal(wa.nextTier(5, { tier: "full", streak: 5 }, o).moved, 0, "到顶了就不再升");
  assert.deepEqual(wa.nextTier(16, { tier: "half", streak: 2 }, o), { tier: "half", streak: 0, moved: 0, reason: "hold" });
  assert.deepEqual(wa.nextTier(Number.NaN, { tier: "half", streak: 2 }, o), { tier: "half", streak: 0, moved: 0 });
  assert.equal(wa.nextTier(5, { tier: "third", streak: 9 }, { floor: "third", ceil: "third" }).tier, "third", "ceil=third 时不许升级");
});

test("flowSpeed：播放时由低频加速，暂停时只剩静置微流", () => {
  assert.equal(wa.flowSpeed(false, 1), 0.06);
  assert.equal(wa.flowSpeed(false, 0), 0.06);
  assert.equal(wa.flowSpeed(true, 0), 0.35);
  assert.equal(wa.flowSpeed(true, 1), 1);
  assert.ok(wa.flowSpeed(true, 0.5) > wa.flowSpeed(true, 0));
  assert.ok(wa.flowSpeed(true, 0) > wa.flowSpeed(false, 1), "播放总比静置快");
});

test("pumpPhase：按真实毫秒积分、落在 [0,2π)、单帧跳变被夹住", () => {
  assert.equal(wa.round(wa.pumpPhase(0, 1000, 1), 4), 0.3142, "1 秒 × 速率 1 ≈ 1/10 圈");
  assert.equal(wa.round(wa.pumpPhase(0, 1000, 2), 4), 0.6283, "速率翻倍、相位翻倍");
  const p1 = wa.pumpPhase(0, 16, 0.5);
  const p2 = wa.pumpPhase(p1, 16, 0.5);
  assert.ok(p2 > p1, "单调推进");
  const wrapped = wa.pumpPhase(6.2, 100, 1);
  assert.ok(wrapped >= 0 && wrapped < Math.PI * 2, `必须落在 [0,2π)，实际 ${wrapped}`);
  assert.equal(wa.pumpPhase(0, -100, 1), 0, "负 dt 不动");
  assert.equal(wa.pumpPhase(Number.NaN, 16, 1).toFixed(4), "0.0503", "NaN 起点当 0");
  assert.equal(wa.round(wa.pumpPhase(3, 100000, 1), 4), wa.round(wa.pumpPhase(3, 100, 1), 4), "dt 封在 100ms（切后台回来不许跳一圈）");
});

test("liftOf：指数逼近目标，非法输入不炸", () => {
  assert.equal(wa.liftOf({ lift: 1 }, 0, 0.5), 0.5);
  assert.equal(wa.round(wa.liftOf({ lift: 1 }, 0.5, 0.5), 4), 0.75);
  assert.equal(wa.liftOf(null, 0.4, 0.5), 0.2, "没有泵浦就往 0 落");
  assert.ok(wa.liftOf({ lift: 5 }, 0, 0.5) <= 0.5, "目标夹在 0..1");
});

test("surgeAt：换歌涌浪是一次 0 → 峰 → 0 的包络", () => {
  assert.equal(wa.surgeAt(1000, 900, 900), 0, "还没开始");
  assert.equal(wa.surgeAt(1000, 1000, 900), 0);
  assert.ok(wa.surgeAt(1000, 1900, 900) < 1e-9, "结束时归零");
  const mid = wa.surgeAt(1000, 1450, 900);
  assert.ok(mid > 0.7 && mid <= 1, `顶点附近该接近 1，实际 ${mid}`);
  assert.ok(wa.surgeAt(1000, 1200, 900) < mid);
  assert.equal(wa.surgeAt(0, 500, 900), 0, "没有起点就不涌");
  assert.equal(wa.surgeAt(1000, 500, 0), 0, "时长 0 不涌");
  assert.ok(wa.surgeAt(1000, 1100, 900) > 0 && wa.surgeAt(1000, 1100, 900) < 1, "中间有值");
});

/* ==========================================================================
   5. 字形遮罩：坐标换算 / 复用判据
   ========================================================================== */
test("maskPlan：相对舞台的盒子 × dpr，空文本与台外盒子被剔掉", () => {
  const stage = { width: 800, height: 400 };
  const plan = wa.maskPlan(
    [
      { x: 10, y: 20, w: 100, h: 30, text: "你好" },
      { x: 30, y: 20, w: 10, h: 30, text: "   " },
      { x: 2000, y: 10, w: 40, h: 20, text: "台外" },
      { x: 5, y: 5, w: 0, h: 20, text: "零宽" },
    ],
    stage,
    2
  );
  assert.equal(plan.items.length, 1);
  assert.deepEqual(plan.items[0], { x: 20, y: 40, w: 200, h: 60, text: "你好", font: "" });
  assert.equal(plan.w, 1600);
  assert.equal(plan.h, 800);
  assert.equal(plan.scale, 2);
});

test("maskPlan：遮罩分辨率可以比舞台低（scale<1），坐标仍按同一比例换算", () => {
  const plan = wa.maskPlan([{ x: 100, y: 50, w: 200, h: 40, text: "字" }], { width: 1200, height: 700 }, 1, 0.5);
  assert.equal(plan.items[0].x, 50);
  assert.equal(plan.items[0].w, 100);
  assert.equal(plan.w, 600);
});

test("maskPlan：坏输入返回空计划而不是抛异常", () => {
  assert.deepEqual(wa.maskPlan(null, null, 1).items, []);
  assert.equal(wa.maskPlan([], { width: 10, height: 10 }, 1).w, 10);
});

test("maskKey：行号 / 文本 / 尺寸任一变化都要重画，否则复用", () => {
  const a = wa.maskKey(3, "一句歌词", 1200, 700);
  assert.equal(wa.maskKey(3, "一句歌词", 1200, 700), a);
  assert.notEqual(wa.maskKey(4, "一句歌词", 1200, 700), a);
  assert.notEqual(wa.maskKey(3, "另一句歌词", 1200, 700), a);
  assert.notEqual(wa.maskKey(3, "一句歌词", 800, 700), a);
  assert.equal(wa.maskKey(-1, "", 1200, 700), wa.maskKey(-1, "", 1200, 700));
});

test("maskScaleFor：跟 dpr 走，长边封在 2048", () => {
  assert.equal(maskScaleFor(1200, 700, 1), 1);
  assert.equal(maskScaleFor(1200, 700, 1.5), 1.5);
  assert.equal(wa.round(maskScaleFor(3840, 1000, 2, 2048), 4), 0.5333, "4K+dpr2 必须被压下来");
  assert.equal(wa.round(maskScaleFor(3840, 1000, 2, 3840), 4), 1, "上限只放到 3840 时仍然压到一半");
  assert.equal(maskScaleFor(3840, 1000, 2, 7680), 2, "上限完全放开才是原样");
});

/* ==========================================================================
   6. 契约纪律（静态扫描）
   ========================================================================== */
test("包结构齐全（清单 / 入口 / 样式 / 图标 / 四个子模块 / README / 自检）", () => {
  for (const f of [
    "skin.json",
    "skin.js",
    "skin.css",
    "assets/icon.svg",
    "lib/water.js",
    "lib/gl.js",
    "lib/canvas2d.js",
    "lib/mask.js",
    "README.md",
    "tests/abyss-logic.test.js",
    "tests/abyss-check.mjs",
  ]) {
    assert.ok(existsSync(path.join(PKG, f)), `缺 ${f}`);
  }
  const icon = readFileSync(path.join(PKG, "assets/icon.svg"), "utf8");
  assert.match(icon, /<svg/);
  assert.ok(icon.length > 200, "图标不能是空壳");
  assert.deepEqual(readdirSync(path.join(PKG, "tests")).sort(), ["abyss-check.mjs", "abyss-logic.test.js"]);
});

test("清单：order 270 / apiVersion 3.0 / background:true / 帧预算 45", () => {
  assert.equal(MANIFEST.id, "abyss");
  assert.equal(MANIFEST.apiVersion, "3.0");
  assert.ok(MANIFEST.order >= 200, "第三方样式的 order 必须 ≥ 200");
  assert.equal(MANIFEST.order, 270);
  assert.equal(MANIFEST.entry, "skin.js");
  assert.deepEqual(MANIFEST.styles, ["skin.css"]);
  assert.equal(MANIFEST.capabilities.spectrum, true);
  assert.equal(MANIFEST.capabilities.background, true, "这一款要整窗背景层（水的颜料）");
  assert.equal(MANIFEST.capabilities.interactive, true);
  for (const k of ["bg", "fg", "accent"]) {
    assert.match(MANIFEST.colors[k], /^#[0-9a-f]{6}$/i, `colors.${k} 必须是六位十六进制`);
  }
  assert.equal(MANIFEST.performance.budgetFps, 45);
});

test("零项目依赖：只有包内相对路径的动态子模块 import，且透传 ?t=", () => {
  const specifiers = [...SKIN_JS.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(specifiers, [], "skin.js 不该有静态 import");
  assert.match(SKIN_JS, /new URL\(import\.meta\.url\)\.search/);
  assert.match(SKIN_JS, /import\(`\.\/lib\/\$\{file\}\$\{Q\}`\)/);
  for (const bad of ["../", "player-skins", "store.js", "utils.js", "frontend/"]) {
    assert.ok(!SKIN_JS.includes(`"${bad}`) && !SKIN_JS.includes(`'${bad}`), `不许 import ${bad}`);
  }
});

test("子模块之间不许静态 import（相对 import 会丢掉 ?t= token 而 404）", () => {
  for (const [name, src] of [
    ["lib/water.js", readFileSync(path.join(PKG, "lib/water.js"), "utf8")],
    ["lib/gl.js", GL_JS],
    ["lib/canvas2d.js", C2D_JS],
    ["lib/mask.js", MASK_JS],
  ]) {
    assert.deepEqual([...src.matchAll(/^\s*import\s/gm)], [], `${name} 里不许有静态 import`);
    assert.ok(!/from\s+["']\.\//.test(src), `${name} 里不许有相对 import`);
  }
  // 依赖全部由 skin.js 注入
  assert.match(SKIN_JS, /glm\.createGL\([^)]*flowSize/);
  assert.match(SKIN_JS, /maskPlan:\s*wa\.maskPlan/);
});

test("纯逻辑模块不碰 DOM（mask.js 例外：它的工作就是量 DOM 排版）", () => {
  for (const [name, src] of [
    ["lib/water.js", readFileSync(path.join(PKG, "lib/water.js"), "utf8")],
    ["lib/gl.js", GL_JS],
    ["lib/canvas2d.js", C2D_JS],
  ]) {
    assert.ok(!/\bdocument\b/.test(src), `${name} 不许碰 document`);
    assert.ok(!/\bwindow\b/.test(src), `${name} 不许碰 window`);
  }
  assert.match(MASK_JS, /\bdocument\b/, "mask.js 就是靠 Range 量排版");
});

test("越权 API：fetch / eval / 定时器 / 存储 / Worker 一个都不许有", () => {
  const all = SKIN_JS + GL_JS + C2D_JS + MASK_JS;
  for (const bad of [
    /\bfetch\s*\(/,
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
    /\bsetInterval\s*\(/,
    /\bXMLHttpRequest\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bWorker\b/,
  ]) {
    assert.ok(!bad.test(all), `不许出现 ${bad}`);
  }
  assert.match(SKIN_JS, /\bsetTimeout\s*\(/, "只允许 setTimeout（防抖上报）");
});

test("ctx.* 白名单：只用契约里有的成员", () => {
  const allowed = new Set([
    "root",
    "backgroundRoot",
    "sdk",
    "themeId",
    "mode",
    "interactive",
    "playback",
    "media",
    "track",
    "lyrics",
    "covers",
    "options",
    "env",
    "spectrum",
    "actions",
    "defaultCover",
  ]);
  const src = SKIN_JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const used = new Set([...src.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const stUsed = new Set([...src.matchAll(/\bst\.ctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  for (const name of [...used, ...stUsed]) assert.ok(allowed.has(name), `ctx.${name} 不在契约里`);
  assert.ok(used.size >= 6, `确认真的扫到了 ctx 用法（${used.size} 个）`);
  assert.ok(used.has("backgroundRoot"), "background:true 必须真的用背景层");
});

test("声明 background:true → 必须自己填、也必须自己清干净", () => {
  const src = SKIN_JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(src, /bgRoot\.innerHTML\s*=\s*BG_SHELL/, "背景层内容是本包填的");
  assert.match(src, /bgRoot\.hidden\s*=\s*false/);
  const body = src.slice(src.indexOf("function destroySkin"));
  assert.match(body, /st\.bgRoot\.innerHTML\s*=\s*""/, "destroy 必须清掉背景层内容");
  assert.match(body, /st\.bgRoot\.hidden\s*=\s*true/, "destroy 必须把背景层收回去");
  const css = SKIN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.abbg\b/, "背景层要有自己的类名（宿主按 data-skin 给作用域）");
});

test("CSS 纪律：不给宿主壳写前缀 / 不用 !important / 不写 :root 与裸标签", () => {
  const css = SKIN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/!important/.test(css), "不许用 !important");
  assert.ok(!/:root/.test(css), "不许写 :root");
  assert.ok(!/\.playerview\[/.test(css), "不许写 .playerview[data-skin=…] 前缀（宿主会包 @scope）");
  assert.ok(!/^\s*(html|body|\*)\s*[,{]/m.test(css), "不许写 html / body / *");
  const selLines = css
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith("{") && !l.startsWith("@"));
  assert.ok(selLines.length > 25, `确认真的扫到了选择器（${selLines.length} 条）`);
  for (const l of selLines) {
    const sel = l.slice(0, -1).trim();
    if (/^(from|to|\d+(\.\d+)?%)$/.test(sel)) continue; // 关键帧步进
    for (const part of sel.split(",")) {
      assert.ok(/^\.(ab|abbg)/.test(part.trim()), `选择器 ${part.trim()} 不是相对舞台根的`);
    }
  }
  assert.match(css, /@keyframes ab-caustics/, "背景光斑用 CSS animation（不写每帧位移）");
});

test("歌词当前行只许改字号/颜色，不许 transform 缩放（一缩遮罩就对不齐）", () => {
  const css = SKIN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const i = css.indexOf('.ab__text .lyric[aria-current="true"]');
  assert.ok(i > 0, "必须显式定义当前行");
  const block = css.slice(i, css.indexOf("}", i));
  assert.ok(!/transform/.test(block), "当前行不许用 transform（会缩放字形）");
  assert.match(block, /font-size\s*:\s*\d+px/);
  assert.match(css, /mix-blend-mode\s*:\s*screen/, "文字要跟水混合（咬进去）");
});

test("只有一条 rAF：皮肤自己不额外开循环（SDK 的平滑推进被关掉）", () => {
  const calls = [...SKIN_JS.matchAll(/requestAnimationFrame\(/g)].length;
  assert.ok(calls <= 3, `requestAnimationFrame 只该出现在 wake/frame 里，实际 ${calls} 处`);
  assert.match(SKIN_JS, /cancelAnimationFrame/);
  assert.match(SKIN_JS, /setPosition\([^)]*\{[^}]*playing:\s*false[^}]*\}/, "每帧自己喂位置，SDK 不开循环");
  assert.ok(!/st\.view\.setPlaying/.test(SKIN_JS), "皮肤不调 view.setPlaying");
  // GPU 计时器的结果必须在同一个循环里顺手取（gl.js 里不许出现 rAF）
  assert.ok(!/requestAnimationFrame/.test(GL_JS), "计时窗口不许自己开 rAF");
});

test("GL 三条硬规矩：查错误 / 不靠 finish 测耗时 / 不自我反馈", () => {
  const src = GL_JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(src, /gl\.getError\(\)/, "每帧必须查一次 GL 错误（反馈环会静默丢帧）");
  assert.ok(!/gl\.finish\(/.test(src), "不许用 finish 测耗时（探针 P1：ANGLE 上它基本不等 GPU）");
  assert.match(src, /EXT_disjoint_timer_query_webgl2/, "耗时用 GPU 计时器");
  assert.match(src, /EXT_color_buffer_float/, "RGBA16F 拿不到要能退回 RGBA8");
  assert.match(src, /WEBGL_lose_context/, "destroy 要主动还上下文");
  // ping-pong：两张纹理，不能一边采样一边写
  assert.match(src, /rt\[0\] = b;[\s\S]{0,40}rt\[1\] = a;/, "推进与成画用的纹理必须交换");
  assert.match(src, /ensureRT/, "两张纹理 + 两个 FBO");
});

test("字形遮罩每行只传一次，不是每帧（逐帧上传全屏纹理纯属浪费）", () => {
  const body = SKIN_JS.slice(SKIN_JS.indexOf("function renderFrame"), SKIN_JS.indexOf("function destroySkin"));
  assert.ok(!/setMask/.test(body), "renderFrame 里不许上传遮罩");
  assert.match(SKIN_JS, /function refreshMask/, "遮罩只在换行/换尺寸时重画");
  const calls = [...SKIN_JS.matchAll(/setMask\?\.\(/g)].length;
  assert.ok(calls <= 2, `setMask 只该在 refreshMask 里出现（空行 / 有行），实际 ${calls}`);
  assert.match(SKIN_JS, /st\.maskKey/, "重画要有判据");
});

test("destroy 的清理清单：帧循环 / 计时器 / GL 资源 / 监听器 / 背景层 / 挂载点", () => {
  const src = SKIN_JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const body = src.slice(src.indexOf("function destroySkin"));
  assert.match(body, /stop\(st\)/, "停帧");
  assert.match(body, /clearTimeout\(st\.backdropTimer\)/, "清防抖定时器");
  assert.match(body, /st\.view\.destroy\(\)/, "销毁 SDK 歌词视图");
  assert.match(body, /dropRenderer\(st\)/, "GL / 兜底渲染器都要释放");
  assert.match(body, /removeEventListener\("click", st\.onClick\)/, "摘掉点击监听");
  assert.match(body, /st\.bgRoot\.innerHTML\s*=\s*""/, "清背景层");
  assert.match(body, /st\.elRoot\.remove\(\)/, "摘掉自己的挂载点");
  assert.match(body, /st\.alive = false/);
  // 渲染器释放必须包含：显存对象 + 监听器
  const drop = src.slice(src.indexOf("function dropRenderer"), src.indexOf("function applyEnv"));
  assert.match(drop, /removeEventListener\("webglcontextlost"/);
  assert.match(drop, /dispose\?\.\(\)/);
});

test("兜底不是装饰：拿不到 webgl2 / 上下文丢了都要切 Canvas2D 且画面继续", () => {
  assert.match(SKIN_JS, /function buildFallback/);
  assert.match(SKIN_JS, /webglcontextlost/, "要监听上下文丢失");
  assert.match(SKIN_JS, /dropRenderer\(st\);\s*st\.elRoot\.dataset\.glLost/s, "丢了先落标记再切兜底");
  assert.match(SKIN_JS, /dataset\.fallback = "1"/);
  assert.match(C2D_JS, /drawImage/, "兜底就是双层位移贴图");
  assert.match(C2D_JS, /globalCompositeOperation = "multiply"|globalCompositeOperation = "lighter"/, "兜底要有遮罩暗刻与亮边");
});

test("诚实暴露可观测状态（自检与真机探针靠它断言，不靠看起来正常）", () => {
  const src = SKIN_JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const key of [
    "dataset.gl",
    "dataset.tier",
    "dataset.flow",
    "dataset.glerr",
    "dataset.draws",
    "dataset.mask",
    "dataset.maskerr",
    "dataset.depth",
    "dataset.line",
    "dataset.idle",
    "dataset.perf",
    "dataset.fallback",
  ]) {
    assert.ok(src.includes(key), `要暴露 ${key}`);
  }
});

test("每个文件都要能被解析（遗言式：GLSL 写在 JS 模板串里，注释里一个反引号就整包炸）", async () => {
  // 真发生过两次：着色器源码是 JS 模板串，改注释时顺手写了个 `反引号`，
  // 模板串当场提前闭合 —— 静态扫描（只读文本）看不出来，只有真机报
  // "SyntaxError: Unexpected identifier"。所以这里**真的 import 一遍**。
  const files = [
    "skin.js",
    "skin.json",
    "lib/water.js",
    "lib/gl.js",
    "lib/canvas2d.js",
    "lib/mask.js",
  ];
  for (const f of files) assert.ok(existsSync(path.join(PKG, f)), `缺文件 ${f}`);
  for (const f of files.filter((x) => x.endsWith(".js"))) {
    await assert.doesNotReject(import(`../${f}`), `${f} 解析失败`);
  }
  // 顺带钉住"模板串本身在 JS 里也是合法的"：模块能 import 就说明没有提前闭合的模板串。
  const skin = await import("../skin.js");
  assert.ok(skin.default, "skin.js 要有默认导出");
});
