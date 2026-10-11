/* ==========================================================================
   color.js — 封面取色与「暗房配色」推导（**纯函数，无 DOM**）
   --------------------------------------------------------------------------
   暗房的画面颜色全部来自封面：

     · 整窗背景 = 封面均色压暗（见 skin.js，用 createBackgroundLayer 的替身
       —— 本包自己往 ctx.backgroundRoot 里填模板，因此背景层也需要这份配色）；
     · 宿主壳（标题栏 / 底栏 / 浮层）的颜色 = 同一份样本推导出的 bg / fg，
       经 ctx.actions.reportBackdrop() 上报（契约里影响宿主观感的**唯一合法通道**）；
     · 画面强调色（时间码、片框边、铅字） = 封面主色提饱和。

   为什么单独成模块：这一段是可测的**纯计算**（喂 RGBA 数组、出颜色字符串），
   `tests/darkroom-logic.test.js` 用 node --test 直接跑，不需要浏览器。

   注意：本文件**不 import 其它模块**。插件包内的静态相对 import 会丢掉
   `/skins/...?t=` 的 token（见本包 README 的「子模块加载」），所以 lib 之间
   宁可各留几行小工具，也不互相 import。
   ========================================================================== */

/** 暗房的基础配色（清单 colors 的同源值；取不到封面时就用它） */
export const DARKROOM_PALETTE = Object.freeze({
  bg: "#12100e",
  fg: "#f0e6d8",
  accent: "#c8a165",
});

/** 夹到 0..1（非数字按 0 处理） */
export function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * `#rgb` / `#rrggbb` → `[r, g, b]`。非法输入返回 null（调用方负责兜底）。
 * @param {string} hex
 * @returns {number[]|null}
 */
export function parseHex(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  const h = m[1];
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * `[r, g, b]`（可为浮点）→ `#rrggbb`，各通道四舍五入并夹到 0..255。
 * @param {number[]} rgb
 * @returns {string}
 */
export function toHex(rgb) {
  const ch = (v) => {
    const n = Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
    return n.toString(16).padStart(2, "0");
  };
  const [r, g, b] = Array.isArray(rgb) ? rgb : [0, 0, 0];
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

/** 线性插值：k=0 取 a、k=1 取 b */
export function mix(a, b, k) {
  const t = clamp01(k);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** sRGB 通道（0..255）→ 线性光（0..1），WCAG 相对亮度用 */
export function srgbToLinear(v) {
  const c = (Number(v) || 0) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 相对亮度（0..1） */
export function luminance(rgb) {
  return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}

/** WCAG 对比度（1..21）。宿主对插件 colors 做的是同一套判定 */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** `[r,g,b]` → `[h(0..1), s(0..1), l(0..1)]` */
export function rgbToHsl(rgb) {
  const r = (Number(rgb[0]) || 0) / 255;
  const g = (Number(rgb[1]) || 0) / 255;
  const b = (Number(rgb[2]) || 0) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

/** `[h,s,l]`（都 0..1）→ `[r,g,b]`（0..255） */
export function hslToRgb(hsl) {
  const h = ((Number(hsl[0]) || 0) % 1 + 1) % 1;
  const s = clamp01(hsl[1]);
  const l = clamp01(hsl[2]);
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t0) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** 提饱和度 / 提亮度（把封面主色变成"能当强调色用"的颜色） */
export function boost(rgb, satMul = 1, lumMul = 1) {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([h, clamp01(s * satMul), clamp01(l * lumMul)]);
}

/**
 * 从 RGBA 像素里取「均色 + 主色 + 平均饱和度 / 亮度 / 冷暖」。
 *
 * @param {Uint8ClampedArray|Uint8Array} data RGBA 连续数组（canvas getImageData().data）
 * @param {{step?: number}} [opts] step = 抽样步长（1 = 每个像素都读）
 * @returns {{avg:number[], dominant:number[], count:number, saturation:number,
 *            luminance:number, warmth:number}|null}
 *   全透明（或空数组）时返回 null —— 调用方必须按"取不到颜色"处理。
 */
export function samplePixels(data, opts = {}) {
  const step = Math.max(1, Math.floor(Number(opts.step) || 1));
  if (!data || !data.length) return null;

  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let satSum = 0;
  let lumSum = 0;
  /** @type {Map<number, {w:number, r:number, g:number, b:number, n:number}>} */
  const bins = new Map();

  for (let i = 0; i + 3 < data.length; i += 4 * step) {
    if (data[i + 3] < 8) continue; // 近乎全透明：不算数（PNG 封面有透明边）
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];
    r += R;
    g += G;
    b += B;
    n += 1;

    const mx = Math.max(R, G, B);
    const mn = Math.min(R, G, B);
    const sat = mx <= 0 ? 0 : (mx - mn) / mx;
    const lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
    satSum += sat;
    lumSum += lum;

    // 3 位/通道 = 512 个桶：够粗，才能让"主色"是画面里真正成片的颜色
    const key = ((R >> 5) << 6) | ((G >> 5) << 3) | (B >> 5);
    // 权重：饱和的更"主"；过暗/过亮的桶降权（近黑近白不配当主色）
    const w = (0.25 + sat) * (lum > 0.06 && lum < 0.97 ? 1 : 0.25);
    const cur = bins.get(key);
    if (cur) {
      cur.w += w;
      cur.r += R;
      cur.g += G;
      cur.b += B;
      cur.n += 1;
    } else {
      bins.set(key, { w, r: R, g: G, b: B, n: 1 });
    }
  }

  if (!n) return null;

  let best = null;
  for (const v of bins.values()) if (!best || v.w > best.w) best = v;

  const avg = [r / n, g / n, b / n];
  const dominant = best ? [best.r / best.n, best.g / best.n, best.b / best.n] : avg;
  return {
    avg,
    dominant,
    count: n,
    saturation: satSum / n,
    luminance: lumSum / n,
    // 冷暖：0 = 偏蓝、0.5 = 中性、1 = 偏暖（暗房的底色与 halation 都吃它）
    warmth: clamp01((avg[0] - avg[2] + 255) / 510),
  };
}

/**
 * 封面样本 → 宿主壳配色（bg / fg）+ 画面强调色（accent）。
 *
 * 规则（与 pending-designs.md 01 的「降级矩阵」一致）：
 *   · bg：封面均色压暗 72%，再往基础底色靠 35% —— 保证画面一定是"暗房"；
 *   · fg：暖白 / 纯白 / 纯黑 三者里与 bg 对比度最高的那个（宿主还会再兜一次底）；
 *   · accent：封面主色与金色混合后提饱和提亮。
 *
 * @param {ReturnType<typeof samplePixels>} sample
 * @param {{bg:string, fg:string, accent:string}} [palette]
 */
export function backdropFromSample(sample, palette = DARKROOM_PALETTE) {
  const base = parseHex(palette?.bg) || [18, 16, 14];
  const warmFg = parseHex(palette?.fg) || [240, 230, 216];
  const gold = parseHex(palette?.accent) || [200, 161, 101];

  if (!sample || !Array.isArray(sample.avg) || !sample.avg.length) {
    return { bg: toHex(base), fg: toHex(warmFg), accent: toHex(gold), derived: false };
  }

  let bg = mix(sample.avg, [10, 8, 7], 0.72);
  bg = mix(bg, base, 0.35);

  const candidates = [warmFg, [255, 255, 255], [0, 0, 0]];
  let fg = candidates[0];
  for (const c of candidates) if (contrastRatio(c, bg) > contrastRatio(fg, bg)) fg = c;

  const accent = boost(mix(sample.dominant, gold, 0.3), 1.25, 1.12);
  return { bg: toHex(bg), fg: toHex(fg), accent: toHex(accent), derived: true };
}
