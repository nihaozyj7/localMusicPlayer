/* ==========================================================================
   活字 letterpress —— 墨色（纯逻辑，无 DOM）
   --------------------------------------------------------------------------
   活字印刷的规矩：**纸白、墨黑，只有一个专色**（spot color）。
   所以这一款不跟封面走整体配色，而是从封面里挑出一个最像"专色"的颜色，
   用在当前行的强调与铅块上；纸白与墨黑是固定的（浅色舞台，见清单 colors）。

   取色不是"平均色"（那是暗房 / 拓印的做法，会把画面染成一片灰），
   而是：**跳过接近纸白与接近墨黑的像素**，在剩下的里按"饱和度 × 中间明度"
   打分，取分数最高那个色桶的均色。

   顺带把 WCAG 对比度放在这里：签收规则 S5 要求上报的 bg/fg 对比度达标，
   这条断言就靠 contrast()。
   ========================================================================== */

/** 纸白（清单 colors.bg）/ 墨黑（清单 colors.fg）：固定不随封面变 */
export const PAPER = "#f2efe7";
export const INK = "#171610";
/** 取不到专色时的兜底（朱红，清单 colors.accent） */
export const SPOT_FALLBACK = "#a8452c";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** "#rrggbb" → [r,g,b]；非法输入给中性灰（不抛异常：取色链路上不该因为一张怪图炸掉画面） */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return [127, 127, 127];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** [r,g,b] → "#rrggbb"（越界会被夹到 0..255） */
export function rgbToHex(rgb) {
  const p = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, "0");
  return `#${p(rgb?.[0])}${p(rgb?.[1])}${p(rgb?.[2])}`;
}

/** 相对亮度（WCAG 2.x：先做 sRGB 反伽马再加权） */
export function luma(rgb) {
  const [r, g, b] = Array.isArray(rgb) ? rgb : hexToRgb(rgb);
  const f = (c) => {
    const s = clamp01((Number(c) || 0) / 255);
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 对比度（1..21）。两个参数都可以传 hex 或 [r,g,b] */
export function contrast(a, b) {
  const l1 = luma(a);
  const l2 = luma(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** 在给定底色上，黑墨和白墨哪个更清楚（返回 hex） */
export function bestInk(bg, dark = INK, light = PAPER) {
  return contrast(bg, dark) >= contrast(bg, light) ? dark : light;
}

/** RGB → HSV 里的 s 与 v 的中间度（挑专色用） */
export function saturation(rgb) {
  const r = (Number(rgb?.[0]) || 0) / 255;
  const g = (Number(rgb?.[1]) || 0) / 255;
  const b = (Number(rgb?.[2]) || 0) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  return { s: max <= 0 ? 0 : d / max, v: max };
}

/** 一个颜色"够不够像个专色"：饱和度要高，明度要在中间（太亮像纸、太暗像墨） */
export function spotScore(rgb) {
  const { s, v } = saturation(rgb);
  if (s < 0.18) return 0; // 灰阶不是专色
  const mid = 1 - Math.abs(v - 0.5) * 1.6; // 中间明度最高分
  return s * Math.max(0, mid);
}

/**
 * 从（降采样后的）封面像素里挑专色。
 *
 * @param {Uint8ClampedArray|Uint8Array|number[]} px RGBA 像素（getImageData().data）
 * @param {number} w
 * @param {number} h
 * @param {{buckets?:number, stride?:number, fallback?:string}} [opts]
 * @returns {string} hex 专色
 */
export function pickSpot(px, w, h, opts = {}) {
  const n = Math.max(0, Math.floor(w * h));
  const data = px || [];
  if (n <= 0 || data.length < 4) return opts.fallback || SPOT_FALLBACK;
  const stride = Math.max(1, Math.floor(opts.stride || 1));
  const buckets = new Map();
  for (let i = 0; i < n; i += stride) {
    const o = i * 4;
    if (o + 3 > data.length) break;
    if (data[o + 3] < 8) continue; // 全透明的像素当没有
    const rgb = [data[o], data[o + 1], data[o + 2]];
    const score = spotScore(rgb);
    if (score <= 0) continue;
    // 4 bit / 通道分桶：同类色聚到一起，桶内取均色（避免取到某个孤立像素）
    const key = ((rgb[0] >> 4) << 8) | ((rgb[1] >> 4) << 4) | (rgb[2] >> 4);
    let b = buckets.get(key);
    if (!b) {
      b = { r: 0, g: 0, b: 0, n: 0, score: 0 };
      buckets.set(key, b);
    }
    b.r += rgb[0];
    b.g += rgb[1];
    b.b += rgb[2];
    b.n += 1;
    b.score += score;
  }
  if (!buckets.size) return opts.fallback || SPOT_FALLBACK;
  let best = null;
  for (const b of buckets.values()) {
    // 桶分 = 平均分 × 桶内像素数开方（既要颜色够正，也不要只有一个像素）
    const s = (b.score / b.n) * Math.sqrt(b.n);
    if (!best || s > best.s) best = { s, rgb: [b.r / b.n, b.g / b.n, b.b / b.n] };
  }
  if (!best) return opts.fallback || SPOT_FALLBACK;
  let out = rgbToHex(best.rgb);
  // 专色不能跟墨黑太近（否则当前行的强调看不出来）—— 太暗就提亮
  if (contrast(out, INK) < 2.2) out = rgbToHex(best.rgb.map((v) => Math.min(255, v * 1.55 + 30)));
  return out;
}

/** 专色落在纸上够不够清楚；不够就用兜底专色（保证强调永远看得见） */
export function readableSpot(spot, paper = PAPER, fallback = SPOT_FALLBACK, min = 2.6) {
  const s = /^#[0-9a-f]{6}$/i.test(String(spot || "")) ? spot : fallback;
  return contrast(s, paper) >= min ? s : fallback;
}
