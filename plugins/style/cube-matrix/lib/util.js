/* ==========================================================================
   cube-matrix/lib/util.js — 数学与小工具（零依赖、纯函数）
   --------------------------------------------------------------------------
   这个文件被 node --test 直接加载，不许 import 任何外部模块。
   ========================================================================== */

export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 0..1 之间往返的三角波（相位取 0..1） */
export function tri01(p) {
  const x = p - Math.floor(p);
  return x < 0.5 ? x * 2 : 2 - x * 2;
}

/**
 * 与帧率无关的指数平滑。
 *
 * 「每帧 lerp(cur, target, 0.3)」是绑定 60fps 的写法，144Hz 与 30Hz 下观感会
 * 差很多；这里把它换算成按毫秒推进的指数衰减。
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

/**
 * 一阶低通在 dt 毫秒内走过的比例（时间常数 tauMs）。
 *
 * 与 smoothTo 的区别：这里直接给时间常数，于是「上升 / 下降用不同时间常数」
 * 这种包络（attack / release）写起来就是两次调用。
 *
 * @param {number} tauMs 时间常数（毫秒）
 * @param {number} dt 帧间隔（毫秒）
 */
export function expK(tauMs, dt) {
  const tau = Math.max(1, Number(tauMs) || 1);
  return 1 - Math.exp(-Math.max(dt, 0) / tau);
}

/**
 * 非对称包络平滑：往目标值走时用 rise，往回落时用 fall。
 *
 * 这是频谱可视化的关键：快升慢降。对称平滑（每帧固定 alpha）会把鼓点的峰值
 * 削平、把余音拖长，观感就变成「在原地游动」而不是「跟着节拍跳」。
 *
 * @param {number} cur 当前值
 * @param {number} target 目标值
 * @param {number} riseMs 上升时间常数（毫秒）
 * @param {number} fallMs 下落时间常数（毫秒）
 * @param {number} dt 帧间隔（毫秒）
 */
export function smoothRate(cur, target, riseMs, fallMs, dt) {
  const up = target > cur;
  return cur + (target - cur) * expK(up ? riseMs : fallMs, dt);
}

/** 数组分段均值（频谱切片） */
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

/** 稳定的伪随机（同一 seed 永远同序列：每格的相位抖动每次挂载一致） */
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

/** hsla 字符串（每帧每柱都要造色值，统一从这里走，方便统一量化） */
export function hsla(h, s, l, a = 1) {
  return `hsla(${h.toFixed(1)},${s.toFixed(0)}%,${l.toFixed(1)}%,${a.toFixed(3)})`;
}
