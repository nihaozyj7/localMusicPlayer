/* ==========================================================================
   ninja/lib/palette.js — 「水果忍者」的果盘配色（封面 → 果皮/果肉/果汁）
   --------------------------------------------------------------------------
   这一款**没有一张图片素材**：水果、果肉、果汁全是 canvas 现场画的。
   于是"配色"就是设计本身，而它的输入有两个：

     1. **清单 colors**（静态兜底）：`bg` = 案板的深木色、`fg` = 案板上的字、
        `accent` = 果汁的朱红。它同时是宿主壳（标题栏 / 底栏 / 侧栏）的配色来源。
     2. **当前封面**（每首歌采样一次）：不是拿来当底图的，而是拿来把**整套果盘**
        的色相往封面偏一点（`tintKind`，只偏 22%）并选出"果汁色"。

   ★ 一条铁律（abyss / rubbing 用真机代价换来的）：**要给人读的东西必须按
     "实际画出来的底"算对比度**。这里所有字色都由 `contrastRatio` 对着**案板色**
     选出来，而不是对着封面主色 —— 封面再亮，案板也是深木，选浅字才对。

   纯函数，无 DOM、无 canvas（`samplePixels` 只吃 `Uint8ClampedArray`）。
   ========================================================================== */

/** 默认果盘（无封面 / 灰阶封面时的兜底）：直接来自清单 colors 的口径 */
export const BOWL_BASE = Object.freeze({
  bg: [27, 16, 8], // 案板的深木色（= 清单 colors.bg）
  fg: [247, 236, 216], // 案板上的字（= 清单 colors.fg）
  accent: [226, 84, 58], // 果汁朱红（= 清单 colors.accent）
});

/**
 * 案板"受光的那一片"：文字实际压在上面的颜色（比 bg 亮一档的暖木）。
 *
 * ★ 这个值必须与 `skin.css` 里那一组 `--nj-wood-*` **对得上**：字色的对比度是拿
 *   它算的，CSS 把案板调亮而这里没跟，就会选出一组"以为底很暗"的浅字 —— 看着还行，
 *   实际对比度掉到 2:1（rubbing 就是这么掉进 1.08:1 的）。
 *   口径：文字落在舞台 ~70% 高处，也就是 `mix(wood-1, wood-2, 0.7)` 再叠一层暗角，
 *   所以 `board = mix(bg, BOARD_LIT, 0.5)` 正好落在那里。
 */
export const BOARD_LIT = [113, 72, 36];

export function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function clamp(v, a, b) {
  const n = Number(v);
  if (Number.isNaN(n)) return a;
  return n < a ? a : n > b ? b : n;
}

export function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(rgb) {
  const c = Array.isArray(rgb) ? rgb : [0, 0, 0];
  const b = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
  return `#${[b(c[0]), b(c[1]), b(c[2])].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function mix(a, b, t) {
  const k = clamp01(t);
  const x = Array.isArray(a) ? a : [0, 0, 0];
  const y = Array.isArray(b) ? b : [0, 0, 0];
  return [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
}

export function srgbToLinear(v) {
  const x = clamp01(Number(v) / 255);
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

export function luminance(rgb) {
  const c = Array.isArray(rgb) ? rgb : [0, 0, 0];
  return 0.2126 * srgbToLinear(c[0]) + 0.7152 * srgbToLinear(c[1]) + 0.0722 * srgbToLinear(c[2]);
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** RGB → HSL（h 0..360、s/l 0..1） */
export function rgbToHsl(rgb) {
  const c = Array.isArray(rgb) ? rgb : [0, 0, 0];
  const r = clamp01(c[0] / 255);
  const g = clamp01(c[1] / 255);
  const b = clamp01(c[2] / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

export function hue2rgb(p, q, t) {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

/** HSL → RGB（h 任意角度，s/l 会被夹到 0..1） */
export function hslToRgb(hsl) {
  const arr = Array.isArray(hsl) ? hsl : [0, 0, 0];
  const h = (((Number(arr[0]) || 0) % 360) + 360) % 360 / 360;
  const s = clamp01(arr[1]);
  const l = clamp01(arr[2]);
  if (s < 1e-6) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

/** 两个色相之间的最短夹角（-180..180） */
export function hueDelta(from, to) {
  let d = ((Number(to) || 0) - (Number(from) || 0)) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * 把封面像素采成一个"果盘基调"。
 *
 * 只做三件事，不做任何像素级材质（那是 rubbing / abyss 的做法，这一款不需要）：
 *   · 平均色（用来判断封面是不是灰阶 —— 灰阶封面就整套退回清单配色）；
 *   · 有效色相（按饱和度加权的圆均值：深色封面的"黑"与"灰"不能把色相拉歪）；
 *   · 果汁色（把有效色相夹到**可见彩度带** S 0.6~0.88 / L 0.46~0.62 ——
 *     深色封面直接取像素会取到一团看不清的深褐，见 rubbing 的教训）。
 *
 * @param {Uint8ClampedArray|null} data RGBA 像素
 * @param {number} w
 * @param {number} h
 * @param {{step?:number, alphaMin?:number, base?:{bg:number[],fg:number[],accent:number[]}}} [opts]
 */
export function bowlFromCover(data, w, h, opts = {}) {
  const base = opts.base || BOWL_BASE;
  const step = Math.max(1, Math.round(Number(opts.step) || 4));
  const alphaMin = Number.isFinite(opts.alphaMin) ? opts.alphaMin : 24;
  const out = {
    gray: true,
    hue: 18,
    mean: [0, 0, 0],
    juice: [...base.accent],
    bg: [...base.bg],
    fg: [...base.fg],
    source: "manifest",
  };
  if (!data || !w || !h) return finish(out);

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  // 色相直方图（12 格，按饱和度加权）：比"平均色"稳得多
  const bins = new Float64Array(12);
  let satSum = 0;
  let satMax = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (alphaMin > 0 && data[i + 3] < alphaMin) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
      const [hh, ss, ll] = rgbToHsl([data[i], data[i + 1], data[i + 2]]);
      if (ll > 0.06 && ll < 0.97) {
        const weight = ss * (1 - Math.abs(ll - 0.5) * 1.2);
        if (weight > 0) {
          bins[Math.min(11, Math.floor((hh / 360) * 12))] += weight;
          satSum += ss;
          satMax = Math.max(satMax, ss);
        }
      }
    }
  }
  if (!n) return finish(out);
  out.mean = [r / n, g / n, b / n];
  const meanSat = satSum / n;
  out.gray = satMax < 0.2 || meanSat < 0.06;
  if (!out.gray) {
    // 直方图的圆均值（用每格的中心角）
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < 12; i += 1) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      sx += Math.cos(a) * bins[i];
      sy += Math.sin(a) * bins[i];
    }
    if (sx !== 0 || sy !== 0) {
      const ang = Math.atan2(sy, sx);
      out.hue = ((ang / (Math.PI * 2)) * 360 + 360) % 360;
    }
    // 果汁色：把有效色相夹到**可见彩度带**（深色封面直接取像素会取到一团看不清的深褐）
    out.juice = hslToRgb([out.hue, 0.74, 0.54]);
    out.source = "cover";
  }
  // 灰阶封面 / 采样失败：整套退回清单配色（连果汁色也是那个静态专色）
  return finish(out);
}

function finish(out) {
  out.juiceHex = toHex(out.juice);
  out.bgHex = toHex(out.bg);
  out.fgHex = toHex(out.fg);
  // 案板受光面 = 深木 + 一档暖光：文字压在这一层上
  out.board = mix(out.bg, BOARD_LIT, 0.5);
  return out;
}

/**
 * 果盘色调：把封面色相**只偏 22%** 地混进某个水果的基色。
 * 为什么要偏：整盘水果跟着封面走，画面才像"这一首歌的果盘"；
 * 为什么只偏 22%：西瓜偏成蓝色就不是西瓜了 —— 品种的可辨认性优先。
 */
export function tintKind(base, hue, { gray = false, shift = 0.22 } = {}) {
  const src = Array.isArray(base) ? base : [200, 200, 200];
  const [h, s, l] = rgbToHsl(src);
  if (gray) {
    // 灰阶封面：不偏色，只把彩度抬一点点（不然整盘像旧照片）
    return hslToRgb([h, clamp01(s * 1.06), l]);
  }
  const d = hueDelta(h, hue) * clamp01(shift);
  return hslToRgb([h + d, clamp01(s * 1.02), l]);
}

/**
 * 案板上的字该用哪个颜色。
 * @param {number[]} board 文字实际压着的底色
 * @param {number[]} prefer 首选色（清单 fg / 封面派生色）
 * @param {{light?:number[], dark?:number[], min?:number}} [opts]
 */
export function inkOnBoard(board, prefer, opts = {}) {
  const light = opts.light || [247, 236, 216];
  const dark = opts.dark || [22, 14, 8];
  const min = Number.isFinite(opts.min) ? opts.min : 4.5;
  const cand = [prefer, light, dark].filter(Boolean);
  let best = cand[0] || light;
  let bestC = 0;
  for (const c of cand) {
    const k = contrastRatio(board, c);
    if (k > bestC) {
      bestC = k;
      best = c;
    }
  }
  if (bestC >= min) return { rgb: [...best], contrast: bestC };
  const fallback = contrastRatio(board, light) >= contrastRatio(board, dark) ? light : dark;
  return { rgb: [...fallback], contrast: contrastRatio(board, fallback) };
}

/**
 * 「还没唱到的字」的颜色：果皮拓印在案板上的凹痕。
 *
 * abyss 的教训：未唱的字**必须仍然读得清**（那一款做出 1.31:1 的灰雾，
 * 39 条纯逻辑 + 125 条浏览器断言全绿）。所以这里返回的色是"从字色往案板色退
 * `back` 比例"，并由 `inkReadable` 保证退到对比度下限为止。
 */
export function unlitOf(fg, board, back = 0.42, min = 4.2) {
  let t = clamp01(back);
  let c = mix(fg, board, t);
  // 退得太多就把对比度拉回来（最多退到 0.62）
  while (contrastRatio(board, c) < min && t > 0) {
    t = Math.max(0, t - 0.04);
    c = mix(fg, board, t);
  }
  return { rgb: c, contrast: contrastRatio(board, c), back: t };
}

/** WCAG 对比度（自检与皮肤自己都用它，避免两处各算一遍） */
export function inkReadable(board, fg, min = 4.2) {
  return contrastRatio(board, fg) >= min;
}
