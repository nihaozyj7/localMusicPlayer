/* ==========================================================================
   cube-matrix/lib/spectrum.js — 128 段全谱 → 每列的电平 + 驱动量
   --------------------------------------------------------------------------
   唯一的输入是 ctx.spectrum() 给的 128 段对数全谱（0..1，拉取式）。

   两条输出：

     1. **每列电平**（fillColumnLevels）：把 128 段按列等分取均值，再做高频
        倾斜补偿与 gamma。这是柱高的**唯一**来源 —— 横向就是频率轴，
        左低频右高频，不做「中间低频两侧高频」的花活。
     2. **驱动量**：三档包络（快 / 主 / 慢）+ 五个频段标量 + 质心 + 通量。
        用来给配色与打击检测用。

   ★ 包络是**快升慢降**（非对称），见 util.js#smoothRate。对称平滑会把瞬态
     削平，「跟着节奏」这件事首先取决于这里。
   ========================================================================== */

// 子模块依赖透传入口 URL 上的 token
const Q = new URL(import.meta.url).search;
const { avgRange, clamp, smoothRate } = await import(`./util.js${Q}`);
const { LEVEL, SMOOTH } = await import(`./config.js${Q}`);

/**
 * 创建一个分析器（一次挂载一个）。
 *
 * @param {number} bands 段数（宿主固定给 128）
 */
export function createAnalyser(bands = 128) {
  const n = Math.max(8, bands | 0);
  const fast = new Float32Array(n);
  const mid = new Float32Array(n);
  const slow = new Float32Array(n);
  const prev = new Float32Array(n);

  const out = {
    bands: n,
    fast,
    mid,
    slow,
    bass: 0,
    low: 0,
    midLo: 0,
    midHi: 0,
    high: 0,
    total: 0,
    /** 0..1（0.5 = 居中）：驱动色相偏移 */
    centroid: 0.5,
    /** 0..1：能量上涨的总量（打击检测用） */
    flux: 0,
    live: false,
    lastBeatAt: -10,
  };

  /**
   * @param {Float32Array|ArrayLike<number>|null} raw 宿主给的全谱（只读）
   * @param {number} dt 帧间隔（毫秒）
   */
  function update(raw, dt) {
    const live = Boolean(raw && raw.length >= 8);
    out.live = live;

    let fluxSum = 0;
    let sum = 0;
    let wsum = 0;

    for (let i = 0; i < n; i += 1) {
      const v = live ? clamp(raw[i] || 0, 0, 1) : 0;
      fast[i] = smoothRate(fast[i], v, SMOOTH.fast.riseMs, SMOOTH.fast.fallMs, dt);
      mid[i] = smoothRate(mid[i], v, SMOOTH.mid.riseMs, SMOOTH.mid.fallMs, dt);
      slow[i] = smoothRate(slow[i], v, SMOOTH.slow.riseMs, SMOOTH.slow.fallMs, dt);

      const d = v - prev[i];
      if (d > 0) fluxSum += d;
      prev[i] = v;

      sum += v;
      wsum += i * v;
    }

    out.bass = avgRange(slow, 0, 10);
    out.low = avgRange(slow, 10, 28);
    out.midLo = avgRange(mid, 28, 60);
    out.midHi = avgRange(mid, 60, 96);
    out.high = avgRange(fast, 96, n);
    out.total = avgRange(slow, 0, n);
    out.centroid = sum > 1e-6 ? clamp(wsum / sum / (n - 1), 0, 1) : 0.5;
    out.flux = clamp(fluxSum / 24, 0, 1);
    return out;
  }

  return { out, update };
}

/**
 * 把整条对数谱压成 cols 个「列电平」（0..1）。
 *
 * 列 c 覆盖谱的下标区间 `[(c + 0.5 - span/2)·step, (c + 0.5 + span/2)·step]`，
 * 取均值；再乘高频倾斜系数并做 gamma。
 *
 * 为什么是均值而不是取单个点：128 段 / 15 列 ≈ 每列 8.5 段，取单点会随
 * 分桶边界抖动（相邻两列一亮一灭的锯齿），均值才是这条谱在这段频率上的电平。
 *
 * @param {Float32Array} out 输出缓冲（长度 = 列数，原地写，避免每帧分配）
 * @param {Float32Array|ArrayLike<number>} bands 128 段全谱（通常是分析器的 mid）
 * @param {object} [cfg] LEVEL 常量
 * @returns {Float32Array} out
 */
export function fillColumnLevels(out, bands, cfg = LEVEL) {
  const cols = out.length;
  const n = bands ? bands.length : 0;
  if (!n || !cols) {
    out.fill(0);
    return out;
  }
  const step = n / cols;
  const span = Math.max(1, step * (cfg.span || 1));
  const gamma = cfg.gamma || 1;
  const tiltBase = cfg.tiltBase || 1;

  for (let c = 0; c < cols; c += 1) {
    const center = (c + 0.5) * step;
    const from = Math.max(0, Math.round(center - span / 2));
    const to = Math.min(n, Math.round(center + span / 2));
    let sum = 0;
    let k = 0;
    for (let i = from; i < to; i += 1) {
      sum += clamp(bands[i] || 0, 0, 1);
      k += 1;
    }
    const raw = k ? sum / k : 0;
    // 倾斜：最左列 ×1，最右列 ×tiltBase（对数谱的能量随频率下降，不补就一片贴地）
    const tilt = Math.pow(tiltBase, cols > 1 ? c / (cols - 1) : 0);
    out[c] = clamp(Math.pow(clamp(raw * tilt, 0, 1), gamma), 0, 1);
  }
  return out;
}

/**
 * 打击检测：够强 + 冷却过了才响一记。
 *
 * @param {object} a 分析器输出
 * @param {number} nowSec 当前秒
 * @param {number} threshold 通量阈值
 * @param {number} cooldownSec 冷却（秒）
 */
export function beatFire(a, nowSec, threshold, cooldownSec) {
  if (!a || a.flux < threshold) return false;
  if (nowSec - a.lastBeatAt < cooldownSec) return false;
  a.lastBeatAt = nowSec;
  return true;
}
