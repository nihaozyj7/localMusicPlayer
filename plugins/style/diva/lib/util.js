/* ==========================================================================
   diva/lib/util.js — 纯函数工具（无 DOM、无副作用，可直接单测）
   --------------------------------------------------------------------------
   只放通用数学 / 颜色 / 时间格式化；与「歌姬」「舞台」有关的业务函数
   留在各自模块里。
   ========================================================================== */

export const TAU = Math.PI * 2;

/** @param {number} v @param {number} lo @param {number} hi */
export function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

/** @param {number} v */
export function clamp01(v) {
  return clamp(v, 0, 1);
}

/** @param {number} a @param {number} b @param {number} t */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 反向插值；a === b 时返回 0（不产生 NaN）。 */
export function invLerp(a, b, v) {
  return a === b ? 0 : (v - a) / (b - a);
}

/**
 * 帧率无关的指数平滑：rate 越大追得越快。
 * dt 用秒；返回值保证落在 [min(cur,target), max(cur,target)] 内。
 * @param {number} cur @param {number} target @param {number} dt @param {number} rate
 */
export function smoothTo(cur, target, dt, rate) {
  const c = Number(cur) || 0;
  const t = Number(target) || 0;
  const d = Math.max(0, Number(dt) || 0);
  const k = 1 - Math.exp(-Math.max(0, rate) * d);
  return c + (t - c) * k;
}

/** @param {number} t 0..1 */
export function easeOutCubic(t) {
  const x = 1 - clamp01(t);
  return 1 - x * x * x;
}

/** @param {number} t 0..1 */
export function easeInOutSine(t) {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
}

/** @param {number} t 0..1 */
export function easeOutBack(t) {
  const x = clamp01(t);
  const c = 1.70158;
  const y = x - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
}

/** 32 位整数哈希（字符串 → uint32）；用于把曲目 id 变成确定性随机种子。 */
export function hashString(str) {
  const s = String(str ?? "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 确定性伪随机流（mulberry32），同一 seed 永远同一串数。 */
export function mulberry32(seed) {
  let a = (Number(seed) || 0) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 一维平滑值噪声（-1..1）。确定性、无状态、开销可忽略。 */
export function noise1D(x, seed = 0) {
  const nx = Number(x) || 0;
  const i = Math.floor(nx);
  const f = nx - i;
  const u = f * f * (3 - 2 * f);
  const h = (n) => {
    let v = Math.imul((n | 0) ^ (Number(seed) | 0), 2246822519) >>> 0;
    v = Math.imul(v ^ (v >>> 13), 3266489917) >>> 0;
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

/**
 * #rgb / #rrggbb → {r,g,b}；非法输入返回 null。
 * @param {string} hex
 * @returns {{r:number,g:number,b:number}|null}
 */
export function hexToRgb(hex) {
  const s = String(hex ?? "").trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** {r,g,b}（0..255）→ #rrggbb。 */
export function rgbToHex(rgb) {
  const c = (v) => {
    const n = Math.round(clamp(v, 0, 255));
    return n.toString(16).padStart(2, "0");
  };
  return `#${c(rgb?.r)}${c(rgb?.g)}${c(rgb?.b)}`;
}

/** #rrggbb + alpha(0..1) → "rgba(r, g, b, a)"。非法色返回透明黑。 */
export function rgba(hex, alpha = 1) {
  const rgb = hexToRgb(hex);
  const a = clamp01(alpha);
  if (!rgb) return `rgba(0, 0, 0, ${a})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

/** {r,g,b} → {h:0..360, s:0..1, l:0..1} */
export function rgbToHsl(rgb) {
  const r = clamp(rgb?.r, 0, 255) / 255;
  const g = clamp(rgb?.g, 0, 255) / 255;
  const b = clamp(rgb?.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/** {h:0..360, s:0..1, l:0..1} → #rrggbb（h 自动取模）。 */
export function hslToHex(h, s, l) {
  const hue = ((((Number(h) || 0) % 360) + 360) % 360) / 360;
  const sat = clamp01(s);
  const lit = clamp01(l);
  if (sat === 0) {
    const v = Math.round(lit * 255);
    return rgbToHex({ r: v, g: v, b: v });
  }
  const q = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat;
  const p = 2 * lit - q;
  const channel = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return rgbToHex({ r: channel(hue + 1 / 3) * 255, g: channel(hue) * 255, b: channel(hue - 1 / 3) * 255 });
}

/** 两个 hex 颜色按 t 混合（RGB 空间，够用且快）。 */
export function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca) return String(b);
  if (!cb) return String(a);
  const k = clamp01(t);
  return rgbToHex({
    r: lerp(ca.r, cb.r, k),
    g: lerp(ca.g, cb.g, k),
    b: lerp(ca.b, cb.b, k),
  });
}

/**
 * 毫秒 → "mm:ss"（小时以上也按分钟继续累加）。
 * 非法 / 负数按 0 处理。
 */
export function formatTime(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 按宽高比把字号收一档（窄窗 / 超宽屏都别让文字炸开）。 */
export function fontSizeFor(base, w) {
  const k = clamp((Number(w) || 1280) / 1280, 0.78, 1.12);
  return Math.round(clamp(base * k, 16, 46));
}
