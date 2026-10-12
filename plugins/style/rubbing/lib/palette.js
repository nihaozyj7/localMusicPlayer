/* ==========================================================================
   rubbing/lib/palette.js — 封面 → 色板（纯函数，无 DOM / 无 ctx）
   --------------------------------------------------------------------------
   拓印的粒子颜色**来自这张封面的像素**：每个目标点（字形上的一点）在封面上
   取一个位置，就用那个位置的颜色。所以这里要的不是"主色"这一个值，而是
   一张**按亮度排序的颜色阶梯（LUT）**：

     · LUT 让"暗部粒子 / 亮部粒子"有稳定的层次（沙 → 铁屑 → 高光）；
     · 主色只用于 HUD 与 reportBackdrop（宿主壳的配色兜底）；
     · 采样只做一次（每首歌一次），结果缓存起来 —— data URL 反复解码很贵。

   坐标约定：所有像素数组都是 `Uint8ClampedArray`，长度 = w*h*4（RGBA），
   与 `ctx.getImageData()` 的输出同构 —— 这样测试可以直接喂手写的数组。
   ========================================================================== */

/** 默认阶梯层数：24 层足够表现"沙的层次"，再多也看不出差别。 */
export const LUT_LEVELS = 24;

export function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function clamp(v, a, b) {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return n < a ? a : n > b ? b : n;
}

/** "#rrggbb" → [r,g,b]；非法输入回退成 null（调用方自己决定兜底色）。 */
export function parseHex(hex) {
  const s = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(s) && !/^[0-9a-fA-F]{3}$/.test(s)) return null;
  const full =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function toHex(rgb) {
  const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

/** Rec.709 相对亮度（0..255 输入 → 0..1 输出）。 */
export function luma(rgb) {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

export function mix(a, b, t) {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** HSL 饱和度（0..1）：用来挑"最有颜色的那一层"当强调色。 */
export function saturation(rgb) {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

/**
 * 把 RGBA 位图稀疏采样成像素列表（步长 step，跳过低 alpha 像素）。
 *
 * @param {Uint8ClampedArray|number[]} data RGBA
 * @returns {{rgb: Uint8Array, n: number}} 每 3 字节一个颜色
 */
export function samplePixels(data, w, h, { step = 4, alphaMin = 24 } = {}) {
  const s = Math.max(1, Math.round(step));
  const total = Math.max(1, Math.ceil((w * h) / (s * s)));
  const rgb = new Uint8Array(total * 3);
  let n = 0;
  for (let y = 0; y < h; y += s) {
    for (let x = 0; x < w; x += s) {
      const i = (y * w + x) * 4;
      if (i + 2 >= data.length) continue;
      if (data[i + 3] !== undefined && data[i + 3] < alphaMin) continue;
      rgb[n * 3] = data[i];
      rgb[n * 3 + 1] = data[i + 1];
      rgb[n * 3 + 2] = data[i + 2];
      n += 1;
    }
  }
  return { rgb, n };
}

/**
 * 按亮度分桶做**颜色阶梯**：暗 → 亮共 levels 层，每层是该桶内像素的均值。
 * 空桶用左右邻居插值补上（封面常常只有一两个色域，空桶不能让画面出现黑洞）。
 */
export function buildLut(sample, { levels = LUT_LEVELS, dark = [12, 10, 9], light = [232, 226, 214] } = {}) {
  const rgb = sample?.rgb || new Uint8Array(0);
  const n = Number(sample?.n) || 0;
  const L = clamp(Math.round(levels), 2, 64);
  const sum = new Float64Array(L * 3);
  const cnt = new Int32Array(L);
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const bin = clamp(Math.floor(luma([r, g, b]) * L), 0, L - 1);
    sum[bin * 3] += r;
    sum[bin * 3 + 1] += g;
    sum[bin * 3 + 2] += b;
    cnt[bin] += 1;
    total += 1;
  }
  const lut = [];
  // 先填有样本的桶，再补空桶
  const known = new Array(L).fill(null);
  for (let i = 0; i < L; i += 1) {
    if (cnt[i] > 0) known[i] = [sum[i * 3] / cnt[i], sum[i * 3 + 1] / cnt[i], sum[i * 3 + 2] / cnt[i]];
  }
  for (let i = 0; i < L; i += 1) {
    if (known[i]) {
      lut.push(known[i]);
      continue;
    }
    let lo = i - 1;
    while (lo >= 0 && !known[lo]) lo -= 1;
    let hi = i + 1;
    while (hi < L && !known[hi]) hi += 1;
    if (lo >= 0 && hi < L) {
      const t = (i - lo) / (hi - lo);
      lut.push(mix(known[lo], known[hi], t));
    } else if (lo >= 0) lut.push(known[lo].slice());
    else if (hi < L) lut.push(known[hi].slice());
    else lut.push(mix(dark, light, i / (L - 1)));
  }
  if (total === 0) {
    // 完全没有样本（无封面 / 全透明）：退化成"单色沙"—— 两端仍是清单配色
    for (let i = 0; i < L; i += 1) lut[i] = mix(dark, light, i / (L - 1));
  }
  return lut;
}

/** 出现次数最多的量化颜色（4bit/通道），用作主色。 */
export function dominantOf(sample) {
  const rgb = sample?.rgb || new Uint8Array(0);
  const n = Number(sample?.n) || 0;
  if (!n) return null;
  const hist = new Map();
  for (let i = 0; i < n; i += 1) {
    const key = ((rgb[i * 3] >> 4) << 8) | ((rgb[i * 3 + 1] >> 4) << 4) | (rgb[i * 3 + 2] >> 4);
    const e = hist.get(key);
    if (e) {
      e.s += rgb[i * 3];
      e.s2 += rgb[i * 3 + 1];
      e.s3 += rgb[i * 3 + 2];
      e.c += 1;
    } else {
      hist.set(key, { s: rgb[i * 3], s2: rgb[i * 3 + 1], s3: rgb[i * 3 + 2], c: 1 });
    }
  }
  let best = null;
  for (const e of hist.values()) if (!best || e.c > best.c) best = e;
  return best ? [best.s / best.c, best.s2 / best.c, best.s3 / best.c] : null;
}

/**
 * 强调色：从阶梯里挑"够亮又有颜色"的那一层。
 * 封面常常是灰阶（黑白照片），那时饱和度为 0 → 回退到 fallback（清单 accent）。
 */
export function accentOf(lut, fallback = [185, 163, 126]) {
  let best = null;
  let bestScore = 0;
  for (let i = Math.floor(lut.length * 0.35); i < lut.length; i += 1) {
    const c = lut[i];
    const sat = saturation(c);
    const lum = luma(c);
    if (lum < 0.18 || lum > 0.92) continue;
    const score = sat * (1 - Math.abs(lum - 0.6));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || bestScore < 0.08) return fallback.slice();
  return best.slice();
}

/**
 * 一次性把"封面位图"整理成粒子要用的一切。
 *
 * @param {Uint8ClampedArray|number[]|null} data RGBA 位图（通常是 64×64 或 96×96 的采样画布）
 * @returns {{lut:number[][], dominant:number[], accent:number[], sample:{rgb:Uint8Array,n:number}, hasCover:boolean}}
 */
export function paletteFrom(data, w, h, { levels = LUT_LEVELS, fallback = { dark: [13, 12, 11], light: [232, 226, 214], accent: [185, 163, 126] } } = {}) {
  const sample = data && data.length ? samplePixels(data, w, h, { step: 2 }) : { rgb: new Uint8Array(0), n: 0 };
  const lut = buildLut(sample, { levels, dark: fallback.dark, light: fallback.light });
  const dominant = dominantOf(sample) || mix(fallback.dark, fallback.light, 0.5);
  const accent = accentOf(lut, fallback.accent);
  return { lut, dominant, accent, sample, hasCover: sample.n > 0 };
}

/** 阶梯取色：t ∈ [0,1]（0 = 最暗一层）。 */
export function lutAt(lut, t) {
  if (!lut || !lut.length) return [200, 200, 200];
  const i = clamp(Math.round(clamp01(t) * (lut.length - 1)), 0, lut.length - 1);
  return lut[i];
}

/** 按亮度比例取一层（用于"粒子按它在封面上的亮度上色"）。 */
export function lutByLuma(lut, lum) {
  return lutAt(lut, luma([255 * clamp01(lum), 255 * clamp01(lum), 255 * clamp01(lum)]));
}

/** 打包成 0xRRGGBB 整数（粒子池里省内存：一条 Int32 就是一个颜色）。 */
export function packRgb(rgb) {
  return ((clamp(Math.round(rgb[0]), 0, 255) << 16) | (clamp(Math.round(rgb[1]), 0, 255) << 8) | clamp(Math.round(rgb[2]), 0, 255)) >>> 0;
}

/* ==========================================================================
   宿主壳 / HUD 真正压着的那层底
   --------------------------------------------------------------------------
   ★ 这里解决的问题：**别拿封面本身当"画面的底色"去选字色。**

   拓印的整窗背景不是封面原图，而是 skin.css 里这条链的结果：
     .rbbg__img    blur(34px) saturate(.85) brightness(.46)
     .rbbg__veil   暗纱 rgba(8,7,6, .72 → .5 → .86)（顶 → 中 → 底）
   也就是说：**再亮的封面压完也是近黑**（纯白封面合成出来只有 ~#261c19）。

   早期版本直接拿 `pal.dominant` 当选色依据，于是封面主色比 ~0.17 亮时就会
   选出"深色字"，配到近黑的底上（实测亮封面下 ~1.1:1）——宿主壳（标题栏 /
   底栏 / 侧栏）与 HUD 的字会一起消失。宿主那边还看不出来：它只按"声明的
   bg"算对比度，而声明的正是那个亮色封面主色（算出 7:1，看着完全达标）。

   参数取自上面那条链 —— **改 skin.css 的数值时必须同步改这里**。
   ========================================================================== */

/** 整窗背景图被压暗的倍数（= .rbbg__img 的 brightness） */
export const BACKDROP_BRIGHTNESS = 0.46;
/**
 * 暗纱最薄的那一段的 alpha（= .rbbg__veil 顶部）。
 *
 * 取**最薄**处是有意为之：那是背景最亮的地方，按它选字色是保守解；
 * 中部 .5→.86 与中央暗角只会更暗，对比度只会更高。
 */
export const BACKDROP_VEIL = 0.72;
/** 暗纱的颜色（= .rbbg__veil 的 rgba(8, 7, 6, …)） */
export const BACKDROP_VEIL_RGB = [8, 7, 6];

/**
 * 封面取样色 → 「宿主壳 / HUD 实际压在它上面」的那个颜色。
 *
 * @param {number[]|null|undefined} rgb 封面取样色（调用方给主色）；非法/缺省按清单底色处理
 * @param {{brightness?:number, veil?:number, veilRgb?:number[]}} [opts] 覆写链上参数（自检用）
 * @returns {number[]} `[r, g, b]`（浮点，调用方自己 toHex）
 */
export function backdropUnderCover(
  rgb,
  { brightness = BACKDROP_BRIGHTNESS, veil = BACKDROP_VEIL, veilRgb = BACKDROP_VEIL_RGB } = {}
) {
  const src = Array.isArray(rgb) && rgb.length >= 3 ? rgb : [13, 12, 11];
  const a = clamp01(veil);
  // 纱叠在被压暗的图上：结果 = 图 × brightness × (1 - α) + 纱色 × α
  const k = clamp01(brightness) * (1 - a);
  return [0, 1, 2].map((i) => src[i] * k + veilRgb[i] * a);
}

/** 颜色对比度（HUD 文字是否该反白）。 */
export function contrastWith(rgb, bg = [13, 12, 11]) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const rel = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const a = rel(rgb);
  const b = rel(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}
