/* ==========================================================================
   darkroom-logic.test.js — 「暗房」的纯逻辑自检
   --------------------------------------------------------------------------
   跑法（仓库根目录）：

     node --test "plugins/style/darkroom/tests/*.test.js"

   这份用例**不开浏览器**，只测三件事：

     1. lib/*.js 的纯计算（取色 / 频谱 / 歌词时序）—— 这三处是最容易写错的地方；
     2. 契约静态体检：入口与 lib 里不许出现裸包名 import、网络与存储 API、
        eval、轮询定时器、documentElement/body/window 直操作；CSS 里不许出现
        :root / !important / 裸标签 / * / 带 .playerview[data-skin] 前缀（宿主的
        @layer + @scope 会让这些**静默失效**，必须在这里拦下来）；
     3. 清单（skin.json）与目录结构：第三方样式 order ≥ 200、capabilities 与
        实际用到的 ctx 能力一致、声明过的文件都真的存在。

   浏览器里的观感由同目录的 darkroom-check.mjs 负责（自带静态服务 + 假宿主）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DARKROOM_PALETTE,
  backdropFromSample,
  boost,
  clamp01,
  contrastRatio,
  hslToRgb,
  luminance,
  mix,
  parseHex,
  rgbToHsl,
  samplePixels,
  toHex,
} from "../lib/color.js";
import {
  approach,
  bandSummary,
  clamp,
  clampDt,
  createFluxWindow,
  cssUrl,
  fluxOf,
  fmt3,
  frameBudgetMs,
  idleExpired,
  quantize,
  shouldOnset,
  timecode,
} from "../lib/film.js";
import { createClock, displayText, graphemeProgress, lineIndexAt } from "../lib/lyric-timing.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(HERE, "..");

/** 浮点近似比较 */
function approx(actual, expected, eps = 1e-6, msg) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    msg || `期望 ${expected}（±${eps}），实际 ${actual}`
  );
}

/** 造一段 RGBA 像素：colors 是 [r,g,b,a] 数组 */
function pixels(colors) {
  const out = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((c, i) => {
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = c.length > 3 ? c[3] : 255;
  });
  return out;
}

/* ==========================================================================
   1. color.js
   ========================================================================== */

test("color: parseHex / toHex", () => {
  assert.deepEqual(parseHex("#fff"), [255, 255, 255]);
  assert.deepEqual(parseHex("#c8a165"), [200, 161, 101]);
  assert.deepEqual(parseHex("  #000000  "), [0, 0, 0]);
  assert.equal(parseHex("c8a165"), null);
  assert.equal(parseHex("#gg0000"), null);
  assert.equal(parseHex(""), null);
  assert.equal(parseHex(null), null);

  assert.equal(toHex([255, 255, 255]), "#ffffff");
  assert.equal(toHex([1.4, 254.6, -3]), "#01ff00");
  assert.equal(toHex([300, 0, 12]), "#ff000c");
  assert.equal(toHex(null), "#000000");
});

test("color: 亮度与对比度符合 WCAG 定义", () => {
  approx(luminance([255, 255, 255]), 1, 1e-9);
  approx(luminance([0, 0, 0]), 0, 1e-9);
  approx(contrastRatio([0, 0, 0], [255, 255, 255]), 21, 1e-6);
  // 同色对比度恒为 1
  approx(contrastRatio([18, 16, 14], [18, 16, 14]), 1, 1e-9);
  // 方向无关
  approx(
    contrastRatio([240, 230, 216], [18, 16, 14]),
    contrastRatio([18, 16, 14], [240, 230, 216]),
    1e-9
  );
});

test("color: mix 与 hsl 往返", () => {
  assert.deepEqual(mix([0, 0, 0], [100, 200, 40], 0), [0, 0, 0]);
  assert.deepEqual(mix([0, 0, 0], [100, 200, 40], 1), [100, 200, 40]);
  assert.deepEqual(mix([0, 0, 0], [100, 200, 40], 0.5), [50, 100, 20]);
  // k 越界按 0..1 夹
  assert.deepEqual(mix([0, 0, 0], [10, 10, 10], 5), [10, 10, 10]);

  for (const rgb of [
    [200, 161, 101],
    [12, 40, 200],
    [0, 0, 0],
    [255, 255, 255],
  ]) {
    const back = hslToRgb(rgbToHsl(rgb));
    for (let i = 0; i < 3; i += 1) approx(back[i], rgb[i], 0.6, `${rgb} 往返第 ${i} 通道`);
  }
  // 灰色的饱和度必须是 0（否则 accent 推不出来）
  assert.equal(rgbToHsl([128, 128, 128])[1], 0);
});

test("color: boost 只动饱和与亮度，不动色相", () => {
  const src = [120, 90, 60];
  const out = boost(src, 1.3, 1.1);
  approx(rgbToHsl(out)[0], rgbToHsl(src)[0], 1e-9);
  assert.ok(rgbToHsl(out)[1] >= rgbToHsl(src)[1]);
  assert.ok(rgbToHsl(out)[2] >= rgbToHsl(src)[2]);
  // 中性灰不会因为 boost 而染色
  const grey = boost([128, 128, 128], 3, 1.2);
  assert.equal(grey[0], grey[1]);
  assert.equal(grey[1], grey[2]);
});

test("color: samplePixels 的边界与统计", () => {
  assert.equal(samplePixels(null), null);
  assert.equal(samplePixels(new Uint8ClampedArray(0)), null);
  // 全透明：说明"这张封面没有可用像素"，必须返回 null 而不是黑色
  assert.equal(samplePixels(pixels([[10, 20, 30, 0], [40, 50, 60, 3]])), null);

  const red = samplePixels(pixels([[255, 0, 0], [255, 0, 0], [255, 0, 0]]));
  assert.equal(red.count, 3);
  approx(red.avg[0], 255, 1e-6);
  approx(red.avg[1], 0, 1e-6);
  approx(red.saturation, 1, 1e-6);
  approx(red.warmth, 1, 1e-6);
  approx(red.luminance, 0.2126, 1e-3);

  // 半黑半白：均色是中灰、冷暖中性
  const grey = samplePixels(
    pixels([
      [0, 0, 0],
      [0, 0, 0],
      [255, 255, 255],
      [255, 255, 255],
    ])
  );
  approx(grey.avg[0], 127.5, 1e-6);
  approx(grey.luminance, 0.5, 0.02);
  approx(grey.warmth, 0.5, 1e-6);

  // step 抽样：只读一个像素里的第 0 个
  const stepped = samplePixels(
    pixels([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
    ]),
    { step: 2 }
  );
  assert.equal(stepped.count, 2);
  approx(stepped.avg[0], 127.5, 1e-6);
  approx(stepped.avg[1], 0, 1e-6);
  approx(stepped.avg[2], 127.5, 1e-6);

  // step 非法（0 / NaN / 负数）必须退回"逐个读"，而不是死循环
  assert.equal(samplePixels(pixels([[1, 2, 3], [4, 5, 6]]), { step: 0 }).count, 2);
});

test("color: samplePixels 的主色不是被近黑近白带跑", () => {
  // 95% 的纯黑 + 5% 的橙：主色应当仍是黑（权重大），但均色明显偏橙
  const many = [];
  for (let i = 0; i < 95; i += 1) many.push([0, 0, 0]);
  for (let i = 0; i < 5; i += 1) many.push([230, 120, 20]);
  const s = samplePixels(pixels(many));
  assert.equal(s.count, 100);
  assert.ok(s.avg[0] > 5, "均色应当被那 5% 的橙拉起来");
  assert.ok(s.dominant[0] <= 32, "主色应当仍是黑桶（它占了 95% 的面积）");
});

test("color: backdropFromSample 的兜底与对比度保证", () => {
  const fallback = backdropFromSample(null);
  assert.equal(fallback.derived, false);
  assert.equal(fallback.bg, DARKROOM_PALETTE.bg);
  assert.equal(fallback.fg, DARKROOM_PALETTE.fg);
  assert.equal(fallback.accent, DARKROOM_PALETTE.accent);

  // 各种封面（极亮 / 极暗 / 高饱和）推出来的前景都必须可读
  const covers = [
    [[255, 255, 255], [255, 255, 255]],
    [[0, 0, 0], [0, 0, 0]],
    [[250, 240, 10], [255, 250, 0]],
    [[10, 40, 240], [20, 60, 255]],
    [[90, 90, 90], [110, 110, 110]],
  ];
  for (const colors of covers) {
    const sample = samplePixels(pixels(colors));
    const pal = backdropFromSample(sample);
    assert.equal(pal.derived, true);
    assert.match(pal.bg, /^#[0-9a-f]{6}$/);
    assert.match(pal.fg, /^#[0-9a-f]{6}$/);
    assert.match(pal.accent, /^#[0-9a-f]{6}$/);
    const ratio = contrastRatio(parseHex(pal.fg), parseHex(pal.bg));
    assert.ok(ratio >= 4.5, `前景对比度只有 ${ratio.toFixed(2)}（封面 ${colors[0]}）`);
    // 画面必须是"暗房"：底色亮度压得住
    assert.ok(luminance(parseHex(pal.bg)) < 0.2, `底色太亮：${pal.bg}`);
  }
});

/* ==========================================================================
   2. film.js
   ========================================================================== */

test("film: bandSummary 的分段与质心", () => {
  assert.deepEqual(bandSummary(null), { low: 0, mid: 0, high: 0, total: 0, centroid: 0 });
  assert.deepEqual(bandSummary([]), { low: 0, mid: 0, high: 0, total: 0, centroid: 0 });

  const flat = new Float32Array(128).fill(1);
  const f = bandSummary(flat);
  approx(f.low, 1, 1e-6);
  approx(f.mid, 1, 1e-6);
  approx(f.high, 1, 1e-6);
  approx(f.total, 1, 1e-6);
  approx(f.centroid, 0.5, 1e-6);

  const bass = new Float32Array(128);
  for (let i = 0; i < 12; i += 1) bass[i] = 1;
  const b = bandSummary(bass);
  approx(b.low, 1, 1e-6);
  approx(b.high, 0, 1e-6);
  assert.ok(b.centroid < 0.1, `低频堆满时质心应当很低，实际 ${b.centroid}`);

  const treble = new Float32Array(128);
  for (let i = 96; i < 128; i += 1) treble[i] = 1;
  const t = bandSummary(treble);
  approx(t.low, 0, 1e-6);
  approx(t.high, 1, 1e-6);
  assert.ok(t.centroid > 0.85, `高频堆满时质心应当很高，实际 ${t.centroid}`);
});

test("film: fluxOf 只认上升", () => {
  const a = new Float32Array([0.1, 0.2, 0.3]);
  const up = new Float32Array([0.2, 0.4, 0.3]);
  const down = new Float32Array([0.05, 0.1, 0.2]);
  approx(fluxOf(a, up), (0.1 + 0.2 + 0) / 3, 1e-6);
  approx(fluxOf(a, down), 0, 1e-6);
  approx(fluxOf(a, a), 0, 1e-6);
  // 长度不一致 / 空：不制造假事件
  approx(fluxOf(a, new Float32Array([1, 2])), 0, 1e-6);
  approx(fluxOf(null, up), 0, 1e-6);
  approx(fluxOf(a, null), 0, 1e-6);
});

test("film: createFluxWindow 是环形缓冲且阈值自适应", () => {
  const w = createFluxWindow(8);
  assert.equal(w.capacity, 8);
  assert.equal(w.count, 0);
  assert.equal(w.mean(), 0);
  assert.equal(w.std(), 0);

  for (let i = 0; i < 20; i += 1) w.push(0.5);
  assert.equal(w.count, 8, "写满后 count 不该超过容量");
  approx(w.mean(), 0.5, 1e-6);
  approx(w.std(), 0, 1e-6);
  approx(w.threshold(1.6), 0.5, 1e-6);

  const w2 = createFluxWindow(4);
  [0, 0.1, 0.2, 0.3].forEach((v) => w2.push(v));
  const mean = w2.mean();
  const std = w2.std();
  assert.ok(std > 0);
  approx(w2.threshold(2), mean + 2 * std, 1e-6);
  // 容量下限：给小了也要能跑
  assert.ok(createFluxWindow(1).capacity >= 4);
});

test("film: shouldOnset 三道闸", () => {
  const base = { flux: 0.05, threshold: 0.02, lastOnsetAt: -1e9, now: 1000 };
  assert.equal(shouldOnset(base), true);
  // 低于绝对下限（静音抖动）
  assert.equal(shouldOnset({ ...base, flux: 0.001 }), false);
  // 低于自适应阈值
  assert.equal(shouldOnset({ ...base, flux: 0.01 }), false);
  // 冷却期内不再认
  assert.equal(shouldOnset({ ...base, lastOnsetAt: 900, now: 1000 }), false);
  assert.equal(shouldOnset({ ...base, lastOnsetAt: 700, now: 1000 }), true);
  // 非数字输入
  assert.equal(shouldOnset({ ...base, flux: NaN }), false);
  assert.equal(shouldOnset({}), false);
});

test("film: approach 与帧率无关", () => {
  assert.equal(approach(0, 1, 16, 0), 1, "tau=0 表示直接跟上");
  const one = approach(0, 1, 16, 100);
  const two = approach(approach(0, 1, 8, 100), 1, 8, 100);
  approx(one, two, 1e-9, "16ms 一步 ≈ 8ms 两步（否则 30/144fps 观感不一致）");
  assert.ok(approach(0, 1, 1000, 100) > 0.99);
  assert.ok(approach(0.5, 0, 1, 5000) < 0.5);
  // 负 dt（时钟回退）不该反向跑
  assert.equal(approach(0.3, 1, -50, 100), 0.3);
});

test("film: clamp / clampDt / quantize / fmt3", () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(NaN, 2, 9), 2, "非数字退回下界");
  assert.equal(clampDt(1000), 50);
  assert.equal(clampDt(-3), 0);
  assert.equal(clampDt(12), 12);

  assert.equal(quantize(0.4, 8), 0.375);
  assert.equal(quantize(1, 8), 1);
  assert.equal(quantize(-1, 8), 0);
  assert.equal(quantize(5, 8), 1);
  assert.equal(quantize(0.3, 0), 0.25, "steps 非法退回 8 档"); // 0.3*8=2.4 → 2/8
  assert.equal(fmt3(0.123456), "0.123");
  assert.equal(fmt3(NaN), "0.000");
});

test("film: 帧预算与停帧", () => {
  assert.equal(frameBudgetMs("smooth", true), 0, "smooth 不限帧");
  assert.equal(frameBudgetMs(undefined, true), 0);
  approx(frameBudgetMs("performance", true, 30), 1000 / 30 - 1, 1e-9);
  approx(frameBudgetMs("performance", false, 30, 20), 1000 / 20 - 1, 1e-9);
  approx(frameBudgetMs("performance", true, 30, 60), 1000 / 30 - 1, 1e-9, "暂停档不会比播放档更费");

  assert.equal(idleExpired(7000, 0), true);
  assert.equal(idleExpired(5999, 0), false);
  assert.equal(idleExpired(1000, 0, 500), true);
});

test("film: timecode 与 cssUrl", () => {
  assert.equal(timecode(0), "00:00");
  assert.equal(timecode(999), "00:00");
  assert.equal(timecode(65000), "01:05");
  assert.equal(timecode(59999), "00:59");
  assert.equal(timecode(3600000), "60:00");
  assert.equal(timecode(-100), "00:00");
  assert.equal(timecode(NaN), "00:00");

  assert.equal(cssUrl(""), "none");
  assert.equal(cssUrl(null), "none");
  assert.equal(cssUrl("https://x/y.png"), 'url("https://x/y.png")');
  // data URL 里的 ; = + / ? & 都合法，不该被改
  const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(cssUrl(dataUrl), `url("${dataUrl}")`);
  // 引号 / 反斜杠 / 换行必须转义（否则整条声明失效）
  assert.equal(cssUrl('a"b'), 'url("a\\"b")');
  assert.equal(cssUrl("a\\b"), 'url("a\\\\b")');
  assert.equal(cssUrl("a\nb"), 'url("ab")');
});

/* ==========================================================================
   3. lyric-timing.js
   ========================================================================== */

test("lyric-timing: lineIndexAt", () => {
  const lines = [{ time: 0 }, { time: 1000 }, { time: 2000 }];
  assert.equal(lineIndexAt(lines, -1), -1);
  assert.equal(lineIndexAt(lines, 0), 0);
  assert.equal(lineIndexAt(lines, 999), 0);
  assert.equal(lineIndexAt(lines, 1000), 1);
  assert.equal(lineIndexAt(lines, 1999.9), 1);
  assert.equal(lineIndexAt(lines, 99999), 2);
  assert.equal(lineIndexAt([], 100), -1);
  assert.equal(lineIndexAt(null, 100), -1);
  // 缺 time 字段按 0 处理（不抛、不返回 -1 之外的怪值）
  assert.equal(lineIndexAt([{}, { time: 500 }], 10), 0);
});

test("lyric-timing: createClock 外推与上限", () => {
  const c = createClock({ maxExtrapolateMs: 300 });
  assert.equal(c.at(1000), 0, "还没 set 过：0");
  c.set(5000, true, 1000);
  assert.equal(c.peek(), 5000);
  assert.equal(c.playing, true);
  approx(c.at(1000), 5000, 1e-9);
  approx(c.at(1100), 5100, 1e-9);
  approx(c.at(1400), 5300, 1e-9, "外推上限 300ms");
  approx(c.at(99999), 5300, 1e-9);
  // 暂停：原样返回（并且不再外推）
  c.set(5000, false, 2000);
  approx(c.at(2500), 5000, 1e-9);
  // 时钟回退（宿主重发旧位置）不该出现负数增量
  c.set(1000, true, 5000);
  approx(c.at(4000), 1000, 1e-9);
  // 非法位置不覆盖上一次的权威值
  c.set(NaN, true, 6000);
  approx(c.peek(), 1000, 1e-9);
});

test("lyric-timing: graphemeProgress 走字级时间轴", () => {
  const line = { time: 1000, words: [1000, 1200, 1400] };
  const next = { time: 2000 };
  assert.deepEqual(graphemeProgress(3, line, next, 1000, 8), [0, 0, 0]);
  // 第 1 个字唱完、第 2 个字一半、第 3 个还没到
  assert.deepEqual(graphemeProgress(3, line, next, 1300, 8), [1, 0.5, 0]);
  // 最后一个字用"这一行的典型字长"（200ms）收尾，不是一直拖到下一行
  assert.deepEqual(graphemeProgress(3, line, next, 1500, 8), [1, 1, 0.5]);
  assert.deepEqual(graphemeProgress(3, line, next, 1600, 8), [1, 1, 1]);
  // 负数位置（位置被外推成负）不产生负进度
  assert.deepEqual(graphemeProgress(3, line, next, -500, 8), [0, 0, 0]);
});

test("lyric-timing: 长间奏时最后一个字也在一句之内唱完", () => {
  // 末字起点 5500、下一行 20000（14.5 秒间奏）：
  // 用中位字长 1000ms 收尾 → 6500 就该点满，而不是到 20000 才慢慢亮。
  const line = { time: 0, words: [0, 1000, 2000, 3000, 4000, 5000, 5500] };
  const long = { time: 20000 };
  const at6500 = graphemeProgress(7, line, long, 6500, 8);
  assert.deepEqual(at6500, [1, 1, 1, 1, 1, 1, 1]);
  const at6000 = graphemeProgress(7, line, long, 6000, 8);
  assert.equal(at6000[6], 0.5);
  // 单个字（没有相邻间隔可用）也必须收尾，不能拖到下一行
  const single = graphemeProgress(1, { time: 0, words: [0] }, { time: 100000 }, 500, 8);
  assert.equal(single[0], 1);
});

test("lyric-timing: graphemeProgress 的字数不一致必须退回逐行", () => {
  const line = { time: 0, words: [0] }; // words 只有 1 个，但字素 4 个
  const next = { time: 400 };
  // 线性路径：点亮进度 = 整行比例 × 字数，再逐个相减（走到一半就亮一半）
  assert.deepEqual(graphemeProgress(4, line, next, 200, 8), [1, 1, 0, 0]);
  const near = graphemeProgress(4, line, next, 390, 8);
  assert.deepEqual(near, [1, 1, 1, 0.875]);
});

test("lyric-timing: graphemeProgress 的其它边界", () => {
  assert.deepEqual(graphemeProgress(0, { time: 0 }, null, 500), []);
  // 没有下一行：默认给 4 秒的窗口（不至于 0 除）
  const solo = graphemeProgress(2, { time: 0 }, null, 2000, 8);
  assert.deepEqual(solo, [1, 0]);
  // 同秒多字：区间为 0 时不能出 NaN
  const same = graphemeProgress(2, { time: 0, words: [0, 0] }, { time: 100 }, 50, 8);
  assert.ok(same.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), `出了非法值 ${same}`);
  // steps=4：档位只落在 0.25 的倍数上
  const coarse = graphemeProgress(4, { time: 0 }, { time: 400 }, 250, 4);
  assert.ok(coarse.every((v) => Math.abs(v * 4 - Math.round(v * 4)) < 1e-9));
  // 位置超过整行：全部点满
  assert.deepEqual(graphemeProgress(3, { time: 0 }, { time: 100 }, 5000, 8), [1, 1, 1]);
});

test("lyric-timing: displayText 保留空行", () => {
  assert.deepEqual(displayText({ text: "啊", trans: ["Ah", "", "  ", "Aah"] }), {
    main: "啊",
    trans: "Ah · Aah",
  });
  assert.deepEqual(displayText({ text: "" }), { main: "", trans: "" });
  assert.deepEqual(displayText(null), { main: "", trans: "" });
  // trans 是字符串（老宿主）时不该崩，也不该把它当数组用
  assert.deepEqual(displayText({ text: "x", trans: "y" }), { main: "x", trans: "" });
});

/* ==========================================================================
   4. 契约静态体检（宿主会包 @layer + @scope，很多写法会**静默失效**）
   ========================================================================== */

const JS_FILES = ["skin.js", ...readdirSync(path.join(PKG, "lib")).filter((f) => f.endsWith(".js")).map((f) => path.join("lib", f))];

function readPkg(rel) {
  return readFileSync(path.join(PKG, rel), "utf8");
}

test("契约: 入口与 lib 里没有裸包名 import（含动态 import）", () => {
  for (const rel of JS_FILES) {
    const src = readPkg(rel);
    const specs = [];
    const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(src))) specs.push(m[1]);
    for (const s of specs) {
      assert.ok(
        s.startsWith("./") || s.startsWith("../"),
        `${rel} 里出现了非相对说明符 "${s}"：第三方样式只能包内相对 import（见 AGENTS.md §6.10）`
      );
    }
    // 本包特有的写法：子模块必须透传入口的 query（否则 /skins 逐文件鉴权会 403）
    if (rel === "skin.js") {
      assert.match(src, /new URL\(import\.meta\.url\)\.search/, "入口必须取自己的 query");
      assert.match(src, /import\(`\.\/lib\/\$\{file\}\$\{Q\}`\)/, "子模块必须拼上 query");
    }
  }
});

test("契约: 不用网络 / 存储 / eval / 轮询定时器", () => {
  const banned = [
    [/\bfetch\s*\(/, "fetch"],
    [/XMLHttpRequest/, "XMLHttpRequest"],
    [/\bWebSocket\b/, "WebSocket"],
    [/\blocalStorage\b/, "localStorage"],
    [/\bsessionStorage\b/, "sessionStorage"],
    [/\bindexedDB\b/, "indexedDB"],
    [/\beval\s*\(/, "eval"],
    [/new\s+Function\b/, "new Function"],
    [/\bsetInterval\b/, "setInterval（皮肤不该有轮询）"],
    [/\bdocument\.documentElement\b/, "document.documentElement（宿主壳不许碰）"],
    [/\bdocument\.body\b/, "document.body"],
    [/\bwindow\./, "window.*（拿不到宿主对象，也不该拿）"],
    [/\bglobalThis\b/, "globalThis"],
  ];
  for (const rel of JS_FILES) {
    const src = readPkg(rel);
    for (const [re, label] of banned) {
      assert.ok(!re.test(src), `${rel} 里出现了 ${label}`);
    }
  }
});

test("契约: 只用契约里的 ctx 能力，不碰不存在的东西", () => {
  const src = readPkg("skin.js");
  // 契约里**不存在**的成员（docs/42 §6.1 提到过，但宿主从未实现）：用了就是运行期 undefined
  for (const dead of ["ctx.assets", "ctx.log", "ctx.push(", "ctx.audio", "ctx.assets("]) {
    assert.ok(!src.includes(dead), `skin.js 用了契约里不存在的 ${dead}`);
  }
  // 用到的 ctx 成员必须都在这个白名单里（多一个就说明依赖了没核实的能力）
  const allowed = new Set([
    "ctx.root",
    "ctx.sdk",
    "ctx.backgroundRoot",
    "ctx.options",
    "ctx.env",
    "ctx.media",
    "ctx.playback",
    "ctx.spectrum",
    "ctx.actions",
    "ctx.defaultCover",
    "ctx.sdk.splitGraphemes",
  ]);
  const used = new Set();
  const re = /\bctx(?:\?)?\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) used.add(`ctx.${m[1]}`);
  for (const u of used) {
    assert.ok(allowed.has(u), `skin.js 用了没核实的 ${u}（要么补进白名单，要么别用）`);
  }
  // 清单声明的能力与实际用法必须一致
  const manifest = JSON.parse(readPkg("skin.json"));
  assert.equal(manifest.capabilities.spectrum, src.includes("ctx.spectrum"), "spectrum 能力与用法不一致");
  assert.equal(
    manifest.capabilities.background,
    src.includes("ctx.backgroundRoot"),
    "background 能力与用法不一致"
  );
  assert.equal(
    manifest.capabilities.interactive,
    src.includes("ctx.actions?.seek"),
    "interactive 能力与用法不一致"
  );
});

test("契约: CSS 没有会被宿主包层静默吃掉的写法", () => {
  const css = readPkg("skin.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/!important/.test(css), "CSS 里不许有 !important");
  assert.ok(!/:root\b/.test(css), "CSS 里不许有 :root");
  assert.ok(!/\bhtml\b\s*[,{]/.test(css), "CSS 里不许有裸 html 选择器");
  assert.ok(!/\bbody\b\s*[,{]/.test(css), "CSS 里不许有裸 body 选择器");
  assert.ok(!/\.playerview\b/.test(css), "不许写宿主 .playerview 前缀（宿主会加 @scope）");
  assert.ok(!/\[data-skin=/.test(css), "不许按 data-skin 属性自选（那正是 @scope 的事）");

  // 逐条规则检查选择器：不许裸标签、不许 *、不许空选择器
  for (const chunk of css.split("}")) {
    const selectorText = chunk.split("{")[0].trim();
    if (!selectorText || selectorText.startsWith("@")) continue;
    for (const sel of selectorText.split(",")) {
      const s = sel.trim();
      if (!s) continue;
      if (/^\d+%$/.test(s) || s === "from" || s === "to") continue; // keyframes 内部
      assert.ok(!s.includes("*"), `CSS 里不许用 * 选择器：${s}`);
      const first = s.split(/[\s>+~:.[#]+/)[0];
      assert.ok(
        !/^[a-z][a-z0-9-]*$/i.test(first),
        `CSS 里不许用裸标签选择器：${s}（宿主会加 @scope，裸标签会外溢）`
      );
    }
  }

  // 这一款特有的硬约束：filter 只能出现在"设一次"的两个静态层上
  const filterRules = css
    .split("}")
    .filter((c) => /(^|[;{\s])filter\s*:/.test(c))
    .map((c) => c.split("{")[0].trim());
  for (const r of filterRules) {
    assert.ok(
      /\.dr__bloom|\.drbg__img/.test(r),
      `filter 只允许出现在 .dr__bloom / .drbg__img 上（运行期不动 filter），实际出现在：${r}`
    );
  }
});

test("清单与目录结构", () => {
  const manifest = JSON.parse(readPkg("skin.json"));
  assert.equal(manifest.id, "darkroom");
  assert.equal(manifest.apiVersion, "3.0");
  assert.ok(Number.isFinite(manifest.order) && manifest.order >= 200, "第三方样式 order 必须 ≥ 200");
  assert.ok(manifest.order >= 200 && manifest.order < 300, "order 应当落在第三方区间（200..299）");
  // 配色必须是合法 hex（宿主会直接拿去做 CSS 变量）
  for (const key of ["bg", "fg", "accent"]) {
    assert.match(manifest.colors[key], /^#[0-9a-f]{6}$/, `colors.${key} 不是 hex`);
  }
  assert.ok(contrastRatio(parseHex(manifest.colors.fg), parseHex(manifest.colors.bg)) >= 4.5);
  assert.ok(manifest.performance.budgetFps > 0 && manifest.performance.budgetFps <= 60);

  // 声明过的文件必须都存在
  for (const f of [manifest.entry, ...manifest.styles, manifest.icon.file]) {
    assert.ok(existsSync(path.join(PKG, f)), `清单里声明的 ${f} 不存在`);
  }
  assert.ok(existsSync(path.join(PKG, "README.md")), "包必须带 README.md（安装与自检说明）");
  assert.ok(existsSync(path.join(PKG, "tests")), "包必须带自己的 tests/");

  // 图标是给 .skin-icon 当 mask 用的（mask-image + currentColor）：形状必须只由
  // **不透明度**决定 —— 不带颜色语义、不带渐变引用、不带内联样式。
  const icon = readPkg(manifest.icon.file);
  assert.match(icon, /viewBox="0 0 64 64"/);
  const iconMarkup = icon.replace(/<!--[\s\S]*?-->/g, "");
  assert.ok(!/currentColor/.test(iconMarkup), "mask 图标不该依赖 currentColor（颜色由宿主定）");
  assert.ok(!/url\(#|<style\b|\bstop-color\b/.test(iconMarkup), "mask 图标不该带渐变或内联样式");
  assert.ok(/fill="#fff"|stroke="#fff"/.test(iconMarkup), "mask 图标的形状应当是不透明白色");
});

test("入口导出的形状符合契约", () => {
  const src = readPkg("skin.js");
  assert.match(src, /export default \{/);
  assert.match(src, /\bid:\s*"darkroom"/);
  for (const fn of ["mount", "update", "destroy"]) {
    assert.match(src, new RegExp(`\\b${fn}\\s*\\(`), `契约要求导出 ${fn}()`);
  }
  // 顶层 await（拿 lib）只能在 ESM 里；入口必须能被 import() 加载
  assert.ok(!/module\.exports|require\(/.test(src), "入口必须是 ESM");
});
