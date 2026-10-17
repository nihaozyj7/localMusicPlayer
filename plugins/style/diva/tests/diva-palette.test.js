/* ==========================================================================
   diva/tests/diva-palette.test.js — 封面取色的纯逻辑自检
   --------------------------------------------------------------------------
   取色的核心是一个纯函数：RGBA 像素 → 色板。测试直接喂手写像素数组
   （与 canvas getImageData().data 同构），不需要浏览器、不需要真封面。

   要钉住的不变量：
     · accent / violet / pink 永远落在冷色霓虹带（COLOR.hueMin..hueMax）里；
     · 灰阶封面 / 无封面 / 失败 → PALETTE 兜底（不是黑，也不是空）；
     · 低不透明 / 低饱和度像素不参与统计；
     · 同输入同输出（确定性），输出全是六位 hex。

   运行：node --test "plugins/style/diva/tests/diva-palette.test.js"
   ========================================================================== */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { COLOR, PALETTE } from "../lib/config.js";
import { hexToRgb, hslToHex, rgbToHsl } from "../lib/util.js";
import {
  COVER_SAMPLE,
  SAMPLE_ALPHA_MIN,
  SAMPLE_SAT_MIN,
  clampHueToBand,
  derivePalette,
  fallbackPalette,
  hueDistance,
  normalizeHue,
} from "../lib/palette.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "lib", "palette.js"), "utf8");

const KEYS = ["bg", "fg", "accent", "cyan", "violet", "pink"];
const HEX = /^#[0-9a-f]{6}$/i;

/** hsl → {r,g,b}（测试造料用） */
function rgbOfHsl(hue, sat, light) {
  const rgb = hexToRgb(hslToHex(hue, sat, light));
  return { r: rgb.r, g: rgb.g, b: rgb.b };
}

/** 造一块 RGBA 像素（与 getImageData().data 同构） */
function pixelsOf(colors, { width = COVER_SAMPLE, height = COVER_SAMPLE, alpha = 255 } = {}) {
  const total = Math.max(1, width * height);
  const out = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i += 1) {
    const color = colors[i % colors.length];
    const p = i * 4;
    out[p] = color.r;
    out[p + 1] = color.g;
    out[p + 2] = color.b;
    out[p + 3] = color.alpha == null ? alpha : color.alpha;
  }
  return out;
}

/** 色板里某个色值的实际色相 */
function hueOfHex(hex) {
  const rgb = hexToRgb(hex);
  return rgbToHsl(rgb).h;
}

function saturationOfHex(hex) {
  return rgbToHsl(hexToRgb(hex)).s;
}

function lightnessOfHex(hex) {
  return rgbToHsl(hexToRgb(hex)).l;
}

function inBand(hue, tolerance = 3) {
  return (
    hue >= COLOR.hueMin - tolerance &&
    hue <= COLOR.hueMax + tolerance
  );
}

const fallbackOf = () => ({
  bg: PALETTE.bg,
  fg: PALETTE.fg,
  accent: PALETTE.accent,
  cyan: PALETTE.cyan,
  violet: PALETTE.violet,
  pink: PALETTE.pink,
});

/* ==========================================================================
   1. 兜底
   ========================================================================== */
test("fallbackPalette：清单配色的一份新对象（不是 PALETTE 的引用）", () => {
  const fb = fallbackPalette();
  assert.deepEqual(fb, fallbackOf());
  assert.notEqual(fb, PALETTE);
  for (const key of KEYS) assert.match(fb[key], HEX);
});

test("derivePalette：没有像素 / 空数组 / 全透明 → PALETTE 兜底", () => {
  assert.deepEqual(derivePalette(null), fallbackOf());
  assert.deepEqual(derivePalette(undefined), fallbackOf());
  assert.deepEqual(derivePalette(new Uint8ClampedArray(0)), fallbackOf());
  const transparent = pixelsOf([rgbOfHsl(240, 0.9, 0.6)], { alpha: 0 });
  assert.deepEqual(derivePalette(transparent, { width: 32, height: 32 }), fallbackOf());
});

test("derivePalette：灰阶封面没有色相可言 → PALETTE 兜底", () => {
  const grays = [
    { r: 0, g: 0, b: 0 },
    { r: 64, g: 64, b: 64 },
    { r: 128, g: 128, b: 128 },
    { r: 255, g: 255, b: 255 },
  ];
  assert.deepEqual(derivePalette(pixelsOf(grays), { width: 32, height: 32 }), fallbackOf());
});

/* ==========================================================================
   2. 已知色相 → 霓虹带内
   ========================================================================== */
test("derivePalette：色相在带内的封面保持色相，输出六位 hex", () => {
  const cover = rgbOfHsl(240, 0.8, 0.6);
  const palette = derivePalette(pixelsOf([cover]), { width: COVER_SAMPLE, height: COVER_SAMPLE });
  for (const key of KEYS) assert.match(palette[key], HEX, `${key} 必须是六位 hex`);
  assert.equal(palette.bg, PALETTE.bg, "bg 固定用清单底色");
  assert.equal(palette.fg, PALETTE.fg, "fg 固定用清单前景色");
  assert.equal(palette.cyan, PALETTE.cyan);
  assert.ok(inBand(hueOfHex(palette.accent)), `accent 色相跑出霓虹带：${hueOfHex(palette.accent)}`);
});

test("derivePalette：暖色 / 带外色相被夹进霓虹带（环形最近端）", () => {
  for (const hue of [0, 20, 90, 150, 330, 350]) {
    const palette = derivePalette(pixelsOf([rgbOfHsl(hue, 0.85, 0.6)]));
    const accentHue = hueOfHex(palette.accent);
    assert.ok(inBand(accentHue), `封面 ${hue}° → accent ${accentHue.toFixed(1)}° 跑出 ${COLOR.hueMin}..${COLOR.hueMax}`);
    for (const key of ["violet", "pink"]) {
      const h = hueOfHex(palette[key]);
      assert.ok(inBand(h), `${key} 色相 ${h.toFixed(1)}° 跑出霓虹带`);
    }
  }
});

test("derivePalette：accent 与封面色按 COLOR.mix 混合，但仍保持霓虹饱和度/亮度", () => {
  const cover = rgbOfHsl(240, 0.8, 0.6);
  const coverHex = hslToHex(240, 0.8, 0.6);
  const palette = derivePalette(pixelsOf([cover]));
  assert.notEqual(palette.accent, coverHex, "不能把封面主色原样搬上来（会花）");
  const sat = saturationOfHex(palette.accent);
  const light = lightnessOfHex(palette.accent);
  assert.ok(sat >= COLOR.satMin - 0.03, `accent 饱和度 ${sat} 低于霓虹带下限`);
  assert.ok(sat <= COLOR.satMax + 0.03, `accent 饱和度 ${sat} 高于霓虹带上限`);
  assert.ok(light >= COLOR.lightMin - 0.03 && light <= COLOR.lightMax + 0.03, `accent 亮度 ${light} 跑出霓虹带`);
});

test("derivePalette：violet = 色相 −55°，pink = 色相 +45°（同样夹取）", () => {
  const cases = [
    [240, 185, 285],
    [300, 245, 318], // pink 345° 夹到最近端 318°
    [180, 172, 225], // violet 125° 夹到最近端 172°
  ];
  for (const [coverHue, violetHue, pinkHue] of cases) {
    const palette = derivePalette(pixelsOf([rgbOfHsl(coverHue, 0.8, 0.6)]));
    assert.ok(
      hueDistance(hueOfHex(palette.violet), violetHue) <= 3,
      `封面 ${coverHue}° 的 violet 应≈${violetHue}°，实际 ${hueOfHex(palette.violet)}`
    );
    assert.ok(
      hueDistance(hueOfHex(palette.pink), pinkHue) <= 3,
      `封面 ${coverHue}° 的 pink 应≈${pinkHue}°，实际 ${hueOfHex(palette.pink)}`
    );
  }
});

/* ==========================================================================
   3. 采样过滤
   ========================================================================== */
test("derivePalette：alpha 必须 > 128 才参与统计", () => {
  const cover = rgbOfHsl(240, 0.9, 0.6);
  const atLimit = pixelsOf([{ ...cover, alpha: SAMPLE_ALPHA_MIN }]);
  assert.deepEqual(derivePalette(atLimit), fallbackOf(), "正好 128 不算");
  const above = pixelsOf([{ ...cover, alpha: SAMPLE_ALPHA_MIN + 1 }]);
  const palette = derivePalette(above);
  assert.notDeepEqual(palette, fallbackOf(), "129 要参与统计");
  assert.ok(inBand(hueOfHex(palette.accent)));
});

test("derivePalette：饱和度必须 > 0.25 才参与统计（灰调像素不投票）", () => {
  const lowSat = rgbOfHsl(240, 0.2, 0.6);
  assert.deepEqual(derivePalette(pixelsOf([lowSat])), fallbackOf(), "低饱和封面按灰阶处理");
  const justAbove = rgbOfHsl(240, SAMPLE_SAT_MIN + 0.12, 0.6);
  assert.notDeepEqual(derivePalette(pixelsOf([justAbove])), fallbackOf());
});

test("derivePalette：混色彩封面的色相取圆均值（0/360 边界不翻车）", () => {
  // 一半 350° 一半 10°：算术平均会得到 180°（反色），圆均值应该≈0°→夹到 318°
  const px = pixelsOf([rgbOfHsl(350, 0.85, 0.6), rgbOfHsl(10, 0.85, 0.6)]);
  const palette = derivePalette(px);
  const hue = hueOfHex(palette.accent);
  assert.ok(inBand(hue), `圆均值色相 ${hue.toFixed(1)}° 跑出霓虹带`);
  assert.ok(hueDistance(hue, PALETTE.accent === palette.accent ? 0 : hue) <= 180);
});

/* ==========================================================================
   4. 确定性与维度
   ========================================================================== */
test("derivePalette：同输入同输出（确定性，不依赖随机）", () => {
  const px = pixelsOf([rgbOfHsl(210, 0.7, 0.55), rgbOfHsl(280, 0.8, 0.62)]);
  assert.deepEqual(derivePalette(px), derivePalette(px));
  assert.deepEqual(derivePalette(px, { width: 32, height: 32 }), derivePalette(px));
});

test("derivePalette：width/height 只用来限定扫描范围，缺省时按数组长度推", () => {
  const cover = rgbOfHsl(240, 0.9, 0.6);
  const size = 8;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const p = i * 4;
    // 前 4 个像素是彩色，其余透明（alpha 0）
    if (i < 4) {
      data[p] = cover.r;
      data[p + 1] = cover.g;
      data[p + 2] = cover.b;
      data[p + 3] = 255;
    }
  }
  const palette = derivePalette(data, { width: size, height: size });
  assert.notDeepEqual(palette, fallbackOf(), "前 4 个彩色像素要被统计");
  const none = derivePalette(data, { width: 2, height: 2 });
  assert.notDeepEqual(none, fallbackOf(), "只扫前 4 个像素也够出一个色板");
  const onlyFirst = derivePalette(data, { width: 1, height: 1 });
  assert.notDeepEqual(onlyFirst, fallbackOf());
});

/* ==========================================================================
   5. 色相工具
   ========================================================================== */
test("clampHueToBand：带内原样，带外吸到最近的一端（环形距离）", () => {
  assert.equal(clampHueToBand(240), 240);
  assert.equal(clampHueToBand(COLOR.hueMin), COLOR.hueMin);
  assert.equal(clampHueToBand(COLOR.hueMax), COLOR.hueMax);
  assert.equal(clampHueToBand(100), COLOR.hueMin);
  assert.equal(clampHueToBand(0), COLOR.hueMax, "红色离品红端更近");
  assert.equal(clampHueToBand(350), COLOR.hueMax);
  assert.equal(clampHueToBand(179), 179);
});

test("normalizeHue / hueDistance：负数与超圈都归一，距离取环形最短", () => {
  assert.equal(normalizeHue(-30), 330);
  assert.equal(normalizeHue(360), 0);
  assert.equal(normalizeHue(725), 5);
  assert.equal(normalizeHue(Number.NaN), 0);
  assert.equal(hueDistance(350, 10), 20);
  assert.equal(hueDistance(10, 350), 20);
  assert.equal(hueDistance(0, 180), 180);
  assert.equal(hueDistance(90, 90), 0);
});

/* ==========================================================================
   6. 静态扫描：契约纪律
   ========================================================================== */
test("不发网络请求：封面只用 Image 解码（URL 由宿主给）", () => {
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /\beval\s*\(/, /new\s+Function\s*\(/, /Math\.random\s*\(/, /localStorage/]) {
    assert.doesNotMatch(SRC, bad, `palette.js 不许出现 ${bad}`);
  }
  assert.match(SRC, /new Image\(\)/, "封面解码走 Image");
  assert.match(SRC, /getImageData\(/, "采样要回读像素");
  assert.match(SRC, /drawImage\(/, "先把封面缩到采样画布");
  assert.match(SRC, /COVER_SAMPLE = 32/, "采样固定 32×32");
});

test("不建循环 / 计时器：取色由 setCover 事件驱动，屏上动画不在这里", () => {
  assert.doesNotMatch(SRC, /requestAnimationFrame/);
  assert.doesNotMatch(SRC, /\bsetInterval\s*\(/);
  assert.doesNotMatch(SRC, /\bsetTimeout\s*\(/);
  assert.doesNotMatch(SRC, /\bwindow\./);
  assert.doesNotMatch(SRC, /document\.documentElement/);
  assert.doesNotMatch(SRC, /innerHTML/);
});

test("同一 URL 不重复采样 + onApply 只在变化时回调 + destroy 后不再回调", () => {
  assert.match(SRC, /if \(next === coverUrl\) return;/, "同一 URL 直接返回");
  assert.match(SRC, /new Map\(\)/);
  assert.match(SRC, /cache\.get\(next\)/);
  assert.match(SRC, /if \(key === currentKey\) return;/, "结果没变就不回调");
  assert.match(SRC, /function paletteKey\(/);
  assert.match(SRC, /if \(destroyed\) return;/, "destroy 之后一切回调静默");
  assert.match(SRC, /notify = null/);
  assert.match(SRC, /requestId \+= 1/, "换封面时让在途解码失效");
});

test("没有静态 import：子模块必须透传 ?t=（/skins/ 逐文件鉴权）", () => {
  const staticImports = [...SRC.matchAll(/^\s*import\s+[^("]/gm)];
  assert.equal(staticImports.length, 0);
  assert.match(SRC, /new URL\(import\.meta\.url\)\.search/);
  assert.match(SRC, /\$\{Q\}/);
  assert.match(SRC, /import\(`\.\/config\.js\$\{Q\}`\)/);
  assert.match(SRC, /import\(`\.\/util\.js\$\{Q\}`\)/);
});

test("接口齐全（冻结契约）：setCover / setMode / current / destroy + bg/fg 固定", () => {
  assert.match(SRC, /return \{ setCover, setMode, current, destroy \}/);
  assert.match(SRC, /function setCover\(/);
  assert.match(SRC, /function setMode\(/);
  assert.match(SRC, /function current\(/);
  assert.match(SRC, /function destroy\(/);
  assert.match(SRC, /bg: PALETTE\.bg/);
  assert.match(SRC, /fg: PALETTE\.fg/);
  assert.match(SRC, /cyan: PALETTE\.cyan/);
  assert.match(SRC, /COLOR\.hueMin/);
  assert.match(SRC, /COLOR\.satMin/);
  assert.match(SRC, /COLOR\.mix/);
});
