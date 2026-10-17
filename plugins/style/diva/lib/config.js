/* ==========================================================================
   diva/lib/config.js — 「虚拟歌姬 · 全息演唱会」的设计常量（单一真源）
   --------------------------------------------------------------------------
   所有模块共享的布局 / 配色 / 时间 / 性能参数都放这里。改观感先改这里，
   不要去各模块里找散落的魔数。

   ★ 坐标口径：画布用 CSS 像素；diva 内部把人物画在「单位空间」里
     （脚底为原点，向上为 -y，人物高 1000），由 diva.js 自己缩放。
     舞台模块只认 layout 给的 cx / baseY / divaH / halo* 这一组锚点。
   ========================================================================== */

/** 画面基础配色。palette.js 会按封面微调 accent 家族，这三个是兜底值。 */
export const PALETTE = Object.freeze({
  bg: "#05060f",
  fg: "#eaf6ff",
  accent: "#57e6ff",
  cyan: "#57e6ff",
  violet: "#9b7bff",
  pink: "#ff7ad9",
});

/**
 * 舞台布局（占舞台宽高的比例）。
 *
 * `LYRIC_*` 只给 DOM 用（CSS 里再按 --skin-inset-* 让开宿主壳），
 * canvas 上的舞台 / 歌姬锚点全部由 computeLayout() 算出来。
 */
export const LAYOUT = Object.freeze({
  /** 地平线（舞台地面）在舞台高度上的位置 */
  horizon: 0.667,
  /** 歌姬高度上限：舞台高度的这个比例 */
  divaHeight: 0.545,
  /** 歌姬高度上限：舞台宽度的这个比例（超宽屏别让人物顶到天花板） */
  divaWidth: 0.48,
  /** 人物水平位置（0..1，0.5 = 正中） */
  divaX: 0.5,
  /** 光环半径相对人物高度的比例 */
  haloRadius: 0.5,
  /** 光环圆心相对人物高度的抬升比例（从脚底往上算） */
  haloLift: 0.56,
  /** 歌词块最大宽度（px）与占舞台宽度比例 */
  lyricMaxWidth: 880,
  lyricWidth: 0.84,
  /** 歌词块距底部（在 --skin-inset-bottom 之外再加这么多 px） */
  lyricBottom: 30,
});

/**
 * 计算一帧的舞台锚点。**只有这一处算几何**，stage 与 diva 都读它的返回值。
 *
 * @param {number} w 舞台宽（CSS px）
 * @param {number} h 舞台高（CSS px）
 * @returns {{
 *   w:number, h:number, cx:number, baseY:number, divaH:number, divaW:number,
 *   haloX:number, haloY:number, haloR:number,
 *   lyricW:number, horizon:number, narrow:boolean, tiny:boolean
 * }}
 */
export function computeLayout(w, h) {
  const W = Math.max(1, Number(w) || 0);
  const H = Math.max(1, Number(h) || 0);
  const divaH = Math.min((H * LAYOUT.divaHeight) | 0, (W * LAYOUT.divaWidth) | 0, 640);
  const baseY = Math.round(H * LAYOUT.horizon);
  const cx = Math.round(W * LAYOUT.divaX);
  return {
    w: W,
    h: H,
    cx,
    baseY,
    divaH,
    divaW: Math.round(divaH * 0.44),
    haloX: cx,
    haloY: Math.round(baseY - divaH * LAYOUT.haloLift),
    haloR: Math.round(divaH * LAYOUT.haloRadius),
    lyricW: Math.min((W * LAYOUT.lyricWidth) | 0, LAYOUT.lyricMaxWidth),
    horizon: baseY / H,
    narrow: W < 960,
    tiny: W < 720,
  };
}

/** 时间常量（毫秒）。 */
export const TIMING = Object.freeze({
  /** 暂停后多久停帧（docs/37 的约定：6 秒） */
  idleStopMs: 6000,
  /** 眨眼间隔范围 */
  blinkMinMs: 2400,
  blinkMaxMs: 6400,
  blinkMs: 140,
  /** 口型 attack / release（秒，spectrum.vocal 的平滑速度） */
  mouthAttack: 30,
  mouthRelease: 10,
  /** 宿主 progress 补丁之间位置外推的上限（防止暂停后位置继续跑） */
  maxInterpMs: 1200,
  /** 提示条显示时长 */
  hintMs: 7000,
});

/** 性能参数（清单 performance.budgetFps 与本文件的 budgetFps 必须一致）。 */
export const PERF = Object.freeze({
  budgetFps: 45,
  dprCap: 2,
  dprCapPerf: 1.5,
  /** 尘埃 / 光点数量：smooth 档与 performance 档 */
  dustSmooth: 88,
  dustPerf: 38,
  /** 光环刻度段数（smooth / performance） */
  ticksSmooth: 72,
  ticksPerf: 36,
});

/** HUD 文案与阈值。 */
export const UI = Object.freeze({
  live: "LIVE",
  paused: "PAUSED",
  standby: "STANDBY",
  stageLabel: "HOLOGRAM STAGE",
  bandLabel: "128 BAND",
  hintPlay: "点击舞台 播放 / 暂停　·　点击歌词 跳转",
  hintStatic: "全息投影待机",
  emptyTrack: "未在播放",
  /** 窄窗口下隐藏的次级文案宽度阈值由 layout.narrow 控制 */
});

/** 色彩推导的约束（palette.js 用：从封面取色但保持全息冷色带）。 */
export const COLOR = Object.freeze({
  /** 强调色相被约束到的范围（度）：青 → 品红 */
  hueMin: 172,
  hueMax: 318,
  /** 封面色混进基础色的比例（0 = 完全固定霓虹，1 = 完全跟封面） */
  mix: 0.34,
  /** 饱和度 / 亮度夹取范围 */
  satMin: 0.62,
  satMax: 0.94,
  lightMin: 0.56,
  lightMax: 0.72,
});
