/* ==========================================================================
   magic-circle/lib/util.js — 数学与小工具（零依赖，纯函数）
   ========================================================================== */

export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * 与帧率无关的指数平滑。
 *
 * 设计稿里写的是「每帧 lerp(cur, target, 0.6)」，那是绑定 60fps 的写法；
 * 这里把它换算成按毫秒推进的指数衰减，144Hz 与 30Hz 下观感一致。
 *
 * @param {number} cur 当前值
 * @param {number} target 目标值
 * @param {number} alpha 60fps 下每帧的靠近系数（0..1）
 * @param {number} dt 帧间隔（毫秒）
 */
export function smoothTo(cur, target, alpha, dt) {
  const k = 1 - Math.pow(1 - clamp(alpha, 0, 1), Math.max(dt, 0) / 16.6667);
  return cur + (target - cur) * k;
}

/* ---- 缓动曲线（转场表见 config.js） ---- */

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeInOutQuint(t) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInCubic(t) {
  return t * t * t;
}

export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** 稳定的伪随机（同一 seed 永远同序列：星域/符文每次挂载长得一样） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** hsla 字符串（画布每帧都要造色值，统一从这里走，方便统一量化） */
export function hsl(h, s, l, a) {
  return `hsla(${h.toFixed(1)},${s.toFixed(0)}%,${l.toFixed(0)}%,${(a ?? 1).toFixed(3)})`;
}

/** 数组分段均值（spec 的频段切片） */
export function avgRange(arr, from, to) {
  const start = Math.max(0, from | 0);
  const end = Math.min(arr.length - 1, (to | 0) - 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= end; i += 1) {
    sum += arr[i];
    n += 1;
  }
  return n ? sum / n : 0;
}

/** 二次贝塞尔（弧线运镜用） */
export function quadAt(p0, c, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}
