// @ts-check
/* ==========================================================================
   fit.js — 「窗口适配比例」：把固定 px 的设计尺寸变成随窗口等比缩放
   --------------------------------------------------------------------------
   为什么需要它（实测出来的问题）：
   整窗背景型样式（anime / magia）原先用 vmin 配一个固定 px 上限排版，
   例如 `--mg-disc: clamp(160px, 32vmin, 360px)`、歌词字号直接用用户设置的 px。
   在主窗口（默认 1280×820，舞台约短边 690）里比例正常；但同一套皮肤会被
   **桌面背景歌词**投到整块桌面（2560×1440 甚至 4K）上，短边一大，px 上限先到顶
   —— 封面还是三百来 px、歌词还是十六七 px，铺在两千多 px 宽的画面上就又小又空。
   反过来把窗口拖到最小（1000×680）时又偏大。

   解法：把「舞台短边 / 设计基准短边」算成一个**无量纲倍数**交给 CSS，
   皮肤把所有尺寸写成 `calc(<设计值> * var(--<皮肤>-fit))`：

     · 窗口越大 → 倍数越大 → 封面 / 歌词 / 间距整体等比放大；
     · 窗口越小 → 倍数越小 → 整体等比缩小；
     · 倍数被 FIT_MIN / FIT_MAX 夹住，避免极窄或极宽时畸变。

   为什么基准是「舞台短边」而不是 viewport：详情页里舞台要扣掉标题栏与底栏，
   桌面背景窗口里它铺满整屏，同一个窗口尺寸下两者不同；用舞台自己的尺寸，
   同一套设计值在两处才有相同的观感。

   ★ 尺寸读不到时不能返回 0。
   详情页关闭时 `#playerview-stage` 是 display:none，ResizeObserver 会推来
   0×0（见 docs/22 的已知问题）。倍数一旦变 0，封面与歌词会瞬间塌成一条线。
   所以这里在元素没有尺寸时退回窗口尺寸，窗口也没有时返回 1（= 设计原值）。
   ========================================================================== */

/** 设计基准短边：舞台短边等于它时倍数为 1（主窗口默认尺寸大约落在这里） */
export const FIT_REFERENCE = 700;
/** 倍数下限：最小窗口（1000×680，舞台短边约 550）也不会把内容缩得太厉害 */
export const FIT_MIN = 0.82;
/** 倍数上限：4K 桌面上不再无限放大（短边 2160 / 700 ≈ 3.09，夹到 2.8） */
export const FIT_MAX = 2.8;

/**
 * 由宽高算无量纲倍数（取短边）。只有一维有效时按那一维算；
 * 两维都读不到（0×0 / NaN）时返回 1（保持设计原值，避免把内容压成一条线）。
 *
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function fitScale(width, height) {
  const w = Number(width) > 0 ? Number(width) : 0;
  const h = Number(height) > 0 ? Number(height) : 0;
  const short = Math.min(w || Number.POSITIVE_INFINITY, h || Number.POSITIVE_INFINITY);
  if (!Number.isFinite(short)) return 1;
  return Math.max(FIT_MIN, Math.min(FIT_MAX, short / FIT_REFERENCE));
}

/**
 * 读一个元素的适配倍数；元素没有尺寸（隐藏 / 未布局）时退回窗口尺寸。
 *
 * @param {HTMLElement|null|undefined} el
 * @returns {number}
 */
export function fitScaleOf(el) {
  if (el && (el.clientWidth || el.clientHeight)) return fitScale(el.clientWidth, el.clientHeight);
  if (typeof window !== "undefined") return fitScale(window.innerWidth, window.innerHeight);
  return 1;
}

/**
 * 把适配倍数写到元素上（自定义属性名由皮肤给，例如 `--an-fit`）。
 *
 * 写成自定义属性而不是直接算 px：皮肤 CSS 里所有 `calc(设计值 * var(--x-fit))`
 * 会一起跟着变，JS 不需要知道任何一个具体尺寸。
 *
 * @param {HTMLElement|null|undefined} el
 * @param {string} name 自定义属性名（含 --）
 * @returns {number} 本次算出的倍数
 */
export function applyFit(el, name) {
  const scale = fitScaleOf(el);
  if (el && name) el.style.setProperty(name, scale.toFixed(4));
  return scale;
}
