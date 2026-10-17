/* ==========================================================================
   diva/lib/palette.js — 封面取色（32×32 采样 → 冷色霓虹带内的 accent 家族）
   --------------------------------------------------------------------------
   目标不是「把封面主色原样搬上来」，而是**让封面轻微改变全息舞台的色相，
   但永远收在冷色霓虹带里**（COLOR.hueMin..hueMax）。所以流程是：

     封面 → 32×32 离屏画布 → 只统计「不透明 + 有彩度」的像素
          → 色相的圆均值 → 夹进霓虹带 → 得到 accent
          → 与 PALETTE.accent 按 COLOR.mix 混合（保住霓虹感）
          → violet = 色相 −55°，pink = 色相 +45°（同样夹取）
     灰度封面 / 没有封面 / 解码失败 / 跨域污染 → PALETTE 兜底。

   ★ 本模块不发网络请求、不建循环/计时器：封面 URL 由宿主给（data URL 或同源
     `/online/cover` 代理），只用一个 Image 去解码，没有任何请求 API。
   ★ 每张封面的采样只做一次（URL → 色板 的小缓存），同一 URL 不重复解码。
   ★ onApply 只在色板真的变了的时候调用 —— entry 拿它写 CSS 变量并低频上报
     宿主壳配色，每帧回调会把 reportBackdrop 的节流逻辑拖垮。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const { COLOR, PALETTE } = await import(`./config.js${Q}`);
const { clamp, hexToRgb, hslToHex, mixHex, rgbToHsl } = await import(`./util.js${Q}`);

/** 封面采样画布边长（32×32：每首歌只解码一次，够算圆均值又不拖启动）。 */
export const COVER_SAMPLE = 32;
/** 参与统计的最低不透明度（alpha > 128）。 */
export const SAMPLE_ALPHA_MIN = 128;
/** 参与统计的最低饱和度（灰像素的色相没有意义）。 */
export const SAMPLE_SAT_MIN = 0.25;
/** 色板缓存上限（封面轮播来回切时不至于无限涨）。 */
const CACHE_LIMIT = 8;

/** 色板兜底：直接拿清单配色（对象是新的一份，调用方改不到 PALETTE）。 */
export function fallbackPalette() {
  return {
    bg: PALETTE.bg,
    fg: PALETTE.fg,
    accent: PALETTE.accent,
    cyan: PALETTE.cyan,
    violet: PALETTE.violet,
    pink: PALETTE.pink,
  };
}

/** 色相归一化到 [0, 360)。 */
export function normalizeHue(hue) {
  const n = Number(hue);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
}

/** 两个色相之间的环形距离（0..180）。 */
export function hueDistance(a, b) {
  const diff = Math.abs(normalizeHue(a) - normalizeHue(b));
  return diff > 180 ? 360 - diff : diff;
}

/**
 * 把色相夹进霓虹带（默认 COLOR.hueMin..COLOR.hueMax）。
 *
 * 夹法是**环形最近端**而不是简单 min/max：暖色（比如 0° 红）离品红端更近，
 * 应该落到 318° 那侧；直接 min/max 会全丢到青色端，红封面会变成一片青，
 * 与封面的关系就看不出来了。
 */
export function clampHueToBand(hue, min = COLOR.hueMin, max = COLOR.hueMax) {
  const lo = normalizeHue(min);
  const hi = normalizeHue(max);
  const h = normalizeHue(hue);
  if (lo === hi) return lo;
  const inside = lo < hi ? h >= lo && h <= hi : h >= lo || h <= hi;
  if (inside) return h;
  return hueDistance(h, lo) <= hueDistance(h, hi) ? lo : hi;
}

/** 单个颜色 → 霓虹带内的六位 hex（色相 / 饱和 / 亮度都夹）。 */
export function neonColor(hue, saturation, lightness) {
  return hslToHex(
    clampHueToBand(hue),
    clamp(saturation, COLOR.satMin, COLOR.satMax),
    clamp(lightness, COLOR.lightMin, COLOR.lightMax)
  );
}

/**
 * 纯函数：RGBA 像素 → 色板（测试直接喂手写数组，不需要浏览器）。
 *
 * @param {Uint8ClampedArray|Uint8Array|number[]|null|undefined} pixels RGBA 连续数组
 * @param {{width?: number, height?: number}} [dims]
 * @returns {{bg:string,fg:string,accent:string,cyan:string,violet:string,pink:string}}
 */
export function derivePalette(pixels, dims = {}) {
  const fallback = fallbackPalette();
  const data = pixels && typeof pixels.length === "number" ? pixels : null;
  if (!data || data.length < 4) return fallback;

  const width = Math.max(0, Math.floor(Number(dims.width) || 0));
  const height = Math.max(0, Math.floor(Number(dims.height) || 0));
  const total = width > 0 && height > 0 ? Math.min(data.length >> 2, width * height) : data.length >> 2;

  let count = 0;
  let sumSin = 0;
  let sumCos = 0;
  let sumSat = 0;
  let sumLight = 0;

  for (let i = 0; i < total; i += 1) {
    const p = i * 4;
    if (data[p + 3] <= SAMPLE_ALPHA_MIN) continue;
    const hsl = rgbToHsl({ r: data[p], g: data[p + 1], b: data[p + 2] });
    if (!(hsl.s > SAMPLE_SAT_MIN)) continue;
    const rad = (hsl.h * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
    sumSat += hsl.s;
    sumLight += hsl.l;
    count += 1;
  }

  if (!count) return fallback;

  // 圆均值：直接对角度求平均会在 0/360 边界上翻车
  const meanHue = normalizeHue((Math.atan2(sumSin, sumCos) * 180) / Math.PI);
  const hue = clampHueToBand(meanHue);
  const sat = clamp(sumSat / count, COLOR.satMin, COLOR.satMax);
  const light = clamp(sumLight / count, COLOR.lightMin, COLOR.lightMax);

  const coverAccent = hslToHex(hue, sat, light);
  // 混进基础霓虹色：完全跟封面会花，完全不跟又失去「这张封面」的存在感
  const mixed = hslOf(mixHex(PALETTE.accent, coverAccent, COLOR.mix));
  const accent = neonColor(mixed[0], mixed[1], mixed[2]);
  const violet = hslToHex(clampHueToBand(hue - 55), sat, light);
  const pink = hslToHex(clampHueToBand(hue + 45), sat, light);

  return { bg: PALETTE.bg, fg: PALETTE.fg, accent, cyan: PALETTE.cyan, violet, pink };
}

/** hex → [h, s, l]（非法色按 PALETTE.accent 处理）。 */
function hslOf(hex) {
  const rgb = hexToRgb(hex) || hexToRgb(PALETTE.accent);
  const hsl = rgbToHsl(rgb);
  return [hsl.h, hsl.s, hsl.l];
}

/** 色板指纹：判断「结果变没变」用，也避免每次回调都深比较。 */
function paletteKey(palette) {
  if (!palette) return "";
  return `${palette.bg}|${palette.fg}|${palette.accent}|${palette.cyan}|${palette.violet}|${palette.pink}`;
}

/**
 * 创建封面取色器。
 *
 * @param {{ onApply?: (palette: ReturnType<typeof fallbackPalette>) => void }} [options]
 * @returns {{ setCover: Function, setMode: Function, current: Function, destroy: Function }}
 */
export function createPalette(options = {}) {
  let notify = typeof options.onApply === "function" ? options.onApply : null;
  let cur = fallbackPalette();
  let currentKey = paletteKey(cur);
  let destroyed = false;
  let coverUrl = "";
  let requestId = 0;
  /** @type {HTMLImageElement|null} 正在解码的那张（destroy 时摘掉回调） */
  let image = null;
  /** 明暗模式：全息舞台恒定深空色，这里只记录（保留给后续微调）。 */
  let mode = "dark";
  /** URL → 色板 的小缓存；失败也记，避免同一张坏图反复解码。 */
  const cache = new Map();

  function apply(next) {
    if (destroyed) return;
    const key = paletteKey(next);
    if (key === currentKey) return;
    currentKey = key;
    cur = next;
    if (notify) {
      try {
        notify(next);
      } catch {
        /* 宿主的 onApply 出错不该把取色器带崩（状态已经更新过） */
      }
    }
  }

  function remember(url, palette) {
    cache.set(url, palette);
    if (cache.size > CACHE_LIMIT) {
      const first = cache.keys().next();
      if (!first.done) cache.delete(first.value);
    }
  }

  /** 解码一张图 → 32×32 像素 → 色板；任何异常（含跨域污染）返回 null。 */
  function sampleImage(img) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = COVER_SAMPLE;
      canvas.height = COVER_SAMPLE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.clearRect(0, 0, COVER_SAMPLE, COVER_SAMPLE);
      ctx.drawImage(img, 0, 0, COVER_SAMPLE, COVER_SAMPLE);
      const data = ctx.getImageData(0, 0, COVER_SAMPLE, COVER_SAMPLE).data;
      return derivePalette(data, { width: COVER_SAMPLE, height: COVER_SAMPLE });
    } catch {
      return null;
    }
  }

  /**
   * 换封面。同一 URL 直接复用缓存；空 URL / 解码失败 / 灰阶封面回到 PALETTE。
   * @param {string} url
   */
  function setCover(url) {
    if (destroyed) return;
    const next = typeof url === "string" ? url : "";
    if (next === coverUrl) return; // 同一 URL 不重复采样
    coverUrl = next;
    const id = (requestId += 1);
    image = null;

    if (!next) {
      apply(fallbackPalette());
      return;
    }
    const cached = cache.get(next);
    if (cached) {
      apply(cached);
      return;
    }
    if (typeof document === "undefined" || typeof Image === "undefined") {
      apply(fallbackPalette());
      return;
    }

    let img;
    try {
      img = new Image();
    } catch {
      apply(fallbackPalette());
      return;
    }
    image = img;
    img.onload = () => {
      if (destroyed || id !== requestId) return;
      const palette = sampleImage(img) || fallbackPalette();
      remember(next, palette);
      apply(palette);
      if (image === img) image = null;
    };
    img.onerror = () => {
      if (destroyed || id !== requestId) return;
      const palette = fallbackPalette();
      remember(next, palette);
      apply(palette);
      if (image === img) image = null;
    };
    try {
      img.src = next;
    } catch {
      const palette = fallbackPalette();
      remember(next, palette);
      apply(palette);
      if (image === img) image = null;
    }
  }

  /** 宿主主题明暗（保留：舞台恒定深空色，色板不随明暗翻转）。 */
  function setMode(next) {
    mode = next === "light" ? "light" : "dark";
  }

  /** 当前色板（**只读**：entry 每帧读它，返回的是稳定引用，不要改）。 */
  function current() {
    return cur;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    requestId += 1;
    notify = null;
    if (image) {
      image.onload = null;
      image.onerror = null;
      image = null;
    }
    cache.clear();
  }

  return { setCover, setMode, current, destroy };
}
