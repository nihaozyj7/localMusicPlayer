/* ==========================================================================
   cube-matrix/lib/palette.js — 彩虹流动的取色（纯函数）
   --------------------------------------------------------------------------
   颜色只有三个输入：动画时钟、频谱质心、总能量（外加一记重拍的冲量）。
   输出的是**色相 / 饱和 / 明度**三元组，由渲染层拼成 hsla —— 这样测试能直接验
   「能量越高越亮」「色相随时间流动」这类行为，不需要画布。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const { clamp } = await import(`./util.js${Q}`);

/** 把任意角度收敛到 [0, 360) */
export function wrapHue(h) {
  const x = h % 360;
  return x < 0 ? x + 360 : x;
}

/**
 * 这一帧的全局配色基调。
 *
 * @param {{timeSec:number, centroid:number, energy:number, beat:number, cfg:object}} p
 *        beat = 0..1 的重拍冲量
 * @returns {{hueBase:number, energy:number, beat:number, sat:number, light:number}}
 */
export function frameTone(p) {
  const cfg = p.cfg;
  const centroid = clamp(p.centroid ?? 0.5, 0, 1);
  const energy = clamp(p.energy ?? 0, 0, 1);
  const beat = clamp(p.beat ?? 0, 0, 1);
  const hueBase = wrapHue(
    p.timeSec * cfg.hueSpeed + centroid * cfg.hueByCentroid + beat * cfg.hueByBeat,
  );
  return {
    hueBase,
    energy,
    beat,
    sat: clamp(70 + energy * 24 + beat * 8, 45, 98),
    light: clamp(21 + energy * 13 + beat * 9, 12, 74),
  };
}

/**
 * 单根柱子的配色。
 *
 * @param {object} tone frameTone() 的结果
 * @param {object} cell layoutGrid() 的一格
 * @param {number} h01 高度归一化（0..1）
 * @param {object} cfg COLOR 常量
 * @returns {{hue:number, sat:number, light:number}}
 */
export function cubeTone(tone, cell, h01, cfg) {
  const t = clamp(h01, 0, 1);
  const hue = wrapHue(
    tone.hueBase +
      (cell.colNorm - 0.5) * cfg.hueSpan +
      cell.rowNorm * cfg.huePerRow +
      t * cfg.hueByHeight,
  );
  return {
    hue,
    sat: clamp(tone.sat + t * 8, 30, 99),
    light: clamp(tone.light + t * 30, 8, 88),
  };
}
