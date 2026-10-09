/* ==========================================================================
   magic-circle/lib/spectrum.js — 128 段全谱 → 魔法阵的全部驱动量
   --------------------------------------------------------------------------
   整套动效只有**一个**输入：ctx.spectrum() 给的 128 段对数全谱。
   这里把它拆成三类东西：

     1. 逐段数组的**三套平滑**（快 / 中 / 慢）+ 历史峰值
        —— 同一份数据驱动刻度 / 符文 / 光晕，看起来像三种不同的东西；
     2. 五个频段标量（bass / low / midLo / midHi / high）+ 总能量
        —— 分别驱动节点缩放、中环、内核、符文、粒子、光晕；
     3. 两个事件量（频谱质心 → 色相、频谱通量 → 打击触发）。

   拿不到频谱（没在播放 / 样本没攒够）时按“全 0 输入”走，
   所有平滑值自然衰减到 0 —— 舞台退成待机的暗转，不需要额外分支。
   ========================================================================== */

import { avgRange, clamp, smoothTo } from "./util.js";

/**
 * 创建一个分析器（一次挂载一个）。
 *
 * @param {number} bands 段数（宿主固定给 128，写成参数只是为了少写魔法数）
 */
export function createAnalyser(bands = 128) {
  const n = bands;
  const fast = new Float32Array(n); // 灵敏：外环刻度
  const mid = new Float32Array(n); // 中等：符文 / 内核
  const slow = new Float32Array(n); // 缓慢：光晕 / 整体缩放
  const peak = new Float32Array(n); // 峰值保持：刻度顶部的亮点
  const prev = new Float32Array(n); // 上一帧原始值：算通量用

  const out = {
    bands: n,
    fast,
    mid,
    slow,
    peak,
    bass: 0,
    low: 0,
    midLo: 0,
    midHi: 0,
    high: 0,
    total: 0,
    /** 0..1（0.5 = 居中）：驱动整体色相偏移 */
    centroid: 0.5,
    /** 0..1：超过阈值触发涟漪 / 粒子爆发 */
    flux: 0,
    /** 本次有没有拿到真实频谱（没有 → 待机暗转） */
    live: false,
    /** 上一次通量超阈值的时刻（秒），用来给涟漪做冷却 */
    lastRippleAt: -10,
  };

  /**
   * @param {Float32Array|null} raw 宿主给的全谱（0..1，只读）
   * @param {number} dt 帧间隔（毫秒）
   */
  function update(raw, dt) {
    const live = Boolean(raw && raw.length);
    out.live = live;

    let fluxSum = 0;
    let sum = 0;
    let wsum = 0;

    for (let i = 0; i < n; i += 1) {
      const v = live ? clamp(raw[i] || 0, 0, 1) : 0;
      fast[i] = smoothTo(fast[i], v, 0.6, dt);
      mid[i] = smoothTo(mid[i], v, 0.15, dt);
      slow[i] = smoothTo(slow[i], v, 0.03, dt);
      // 峰值衰减同样是按毫秒推进的（0.98^（dt/16.7））
      peak[i] = Math.max(peak[i] * Math.pow(0.98, dt / 16.6667), v);

      const d = v - prev[i];
      if (d > 0) fluxSum += d;
      prev[i] = v;

      sum += v;
      wsum += i * v;
    }

    out.bass = avgRange(slow, 0, 8);
    out.low = avgRange(slow, 8, 24);
    out.midLo = avgRange(mid, 24, 56);
    out.midHi = avgRange(mid, 56, 96);
    out.high = avgRange(fast, 96, 128);
    out.total = avgRange(slow, 0, 128);
    out.centroid = sum > 1e-6 ? clamp(wsum / sum / (n - 1), 0, 1) : 0.5;
    // 128 段各自往上涨的总量 → 归一到 0..1（实测一记重拍约 10~40）
    out.flux = clamp(fluxSum / 24, 0, 1);
    return out;
  }

  return { out, update };
}

/**
 * 通量触发判定（打击检测）：够强 + 冷却过了才响一记。
 *
 * @param {object} a analyze() 的输出
 * @param {number} now 当前秒
 * @param {number} threshold 阈值
 * @param {number} cooldownSec 冷却（秒）
 */
export function beatFire(a, now, threshold, cooldownSec) {
  if (a.flux < threshold) return false;
  if (now - a.lastRippleAt < cooldownSec) return false;
  a.lastRippleAt = now;
  return true;
}
