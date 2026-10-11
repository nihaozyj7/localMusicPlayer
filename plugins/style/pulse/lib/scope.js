/* ==========================================================================
   心跳 pulse · lib/scope.js —— 示波器的**纯几何**（无 DOM、无 canvas 上下文）
   --------------------------------------------------------------------------
   把"过去 SPAN_MS 的包络 / 质心 / flux"与"预测拍点"映射成像素坐标。
   这个文件里没有一次绘制调用 —— 只有坐标。理由很简单：坐标是可测的
   （单调、有界、拍点落在窗口里），绘制不是。

   坐标口径（和 CSS 里那些 `--pl-*` 变量一致）：
     x：时间轴，右端 = 现在，左端 = 现在 - span
     y：包络以基线为准向上长（能量越大越高）；质心在上方一条独立的窄带里；
        flux 在基线下方浅浅地映一层（"闸门"的感觉）
   ========================================================================== */

export const PAD = { t: 12, r: 10, b: 22, l: 10 };
/** 画布里的时间标注条高度 */
export const RULER_H = 14;

export function layoutOf(w, h) {
  const width = Math.max(1, Math.round(w || 0));
  const height = Math.max(1, Math.round(h || 0));
  const plotW = Math.max(1, width - PAD.l - PAD.r);
  const plotH = Math.max(1, height - PAD.t - PAD.b);
  const midY = PAD.t + plotH * 0.66;
  return {
    w: width,
    h: height,
    plotW,
    plotH,
    left: PAD.l,
    right: PAD.l + plotW,
    top: PAD.t,
    bottom: PAD.t + plotH,
    midY,
    ampH: plotH * 0.54,
    fluxH: plotH * 0.16,
    centTop: PAD.t + plotH * 0.04,
    centH: plotH * 0.3,
    rulerY: height - PAD.b + 4,
  };
}

/** 时间 → x：**不钳**（标记的元素要能跑到窗口外面去，靠容器的 overflow 裁） */
export function xAtRaw(layout, t, t0, spanMs) {
  if (!(spanMs > 0)) return layout.left;
  return layout.left + ((t - t0) / spanMs) * layout.plotW;
}

/** 时间 → x（钳在画布内：越界的样本不该画到画布外面去） */
export function xAt(layout, t, t0, spanMs) {
  const x = xAtRaw(layout, t, t0, spanMs);
  return x < layout.left ? layout.left : x > layout.right ? layout.right : x;
}

/** 能量 0..1 → y（基线往上） */
export function yEnv(layout, e) {
  const v = e < 0 ? 0 : e > 1 ? 1 : e;
  return layout.midY - v * layout.ampH;
}

/** 谱质心 0..1 → y（上方窄带；0.5 = 中间） */
export function yCent(layout, c) {
  const v = c < 0 ? 0 : c > 1 ? 1 : c;
  return layout.centTop + (1 - v) * layout.centH;
}

/** flux 0..1 → y（基线下方一层，浅浅的） */
export function yFlux(layout, f) {
  const v = f < 0 ? 0 : f > 1 ? 1 : f;
  return layout.midY + Math.sqrt(v) * layout.fluxH;
}

/**
 * 一条折线：返回 [x0,y0,x1,y1,…]（长度 2n）。
 * `key` 决定用哪条映射：e → yEnv，c → yCent，f → yFlux。
 */
export function polylineOf(series, layout, t0, spanMs, key = "e") {
  const n = series ? series.n : 0;
  const out = new Float64Array(Math.max(0, n * 2));
  const yOf = key === "c" ? yCent : key === "f" ? yFlux : yEnv;
  const arr = series ? series[key] : null;
  for (let i = 0; i < n; i += 1) {
    out[i * 2] = xAt(layout, series.t[i], t0, spanMs);
    out[i * 2 + 1] = yOf(layout, arr[i]);
  }
  return out;
}

/** 竖直刻度线（等分 plotW）的 x 坐标 */
export function gridColumns(layout, count = 8) {
  const n = Math.max(0, Math.floor(count));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = layout.left + (layout.plotW * (i + 0.5)) / n;
  }
  return out;
}

/**
 * 时间窗口：`{ refT, spanMs, from, to }`。
 *   refT / spanMs 决定 **x 映射**：x = 左端 + (t − refT)/spanMs × plotW
 *   from / to 决定**保留哪些**（屏幕之外的可以不建元素；容器 overflow:hidden 兜底）
 *
 * 这两件事为什么要分开：拍点是用**滑动窗口**画的 —— `--x` 只在窗口重设时写一次，
 * 之后整层容器靠一个 CSS 变量的平移跟着时间走（一秒几十次属性写，而不是每秒改上百个 x）。
 * 于是"x 的参考点"（refT，一个周期才换一次）与"屏幕上该留哪些"（from/to）
 * 不是同一个区间，pad 就是给这个错位留的余量。
 */
export function winOf(refT, spanMs, pad = 0) {
  return { refT, spanMs, from: refT - pad, to: refT + spanMs + pad };
}

/**
 * 拍点标记的 x 坐标（只保留落在窗口里的）。
 * next 标记"下一个还没发生的拍点"（在窗口右侧、被钳在右边界上）—— CSS 拿它做呼吸。
 */
export function markXs(beats, layout, win, now = win.refT + win.spanMs) {
  const out = [];
  for (let i = 0; i < beats.length; i += 1) {
    const t = beats[i];
    if (t < win.from || t > win.to) continue;
    out.push({ t, x: xAtRaw(layout, t, win.refT, win.spanMs), next: t >= now });
  }
  return out;
}

/**
 * 当前行字级刻度（时间轴上的小竖线）。吸附由**调用方**把 `snapFn` 传进来
 * （`beat.js#snapTime`）—— 这样 scope.js 不需要 import 任何包内模块，
 * 也就不会绕开 `?t=` token（/skins/<id>/<file>?t=… 丢了查询串就 404）。
 */
export function railTicks(words, beats, layout, win, snapFn, maxMs = 90) {
  const out = [];
  const list = Array.isArray(words) ? words : [];
  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i];
    if (!Number.isFinite(raw)) continue;
    const s = snapFn ? snapFn(raw, beats, maxMs) : { time: raw, snapped: false, delta: 0 };
    if (s.time < win.from || s.time > win.to) continue;
    out.push({ t: s.time, raw, x: xAtRaw(layout, s.time, win.refT, win.spanMs), snapped: !!s.snapped, delta: s.delta, i });
  }
  return out;
}

/** 整条曲线的活跃度（0..1）：拿它写一个"画面在动"的自定义属性 */
export function activityOf(series) {
  const n = series ? series.n : 0;
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i += 1) s += series.e[i];
  return s / n;
}

/** 毫秒 → mm:ss（时间码；负值钳到 0） */
export function mmss(ms) {
  const v = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
  const total = Math.floor(v / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 能量 → 辉光强度（0..1，低频涌起来时整屏亮一分） */
export function glowOf(series) {
  const n = series ? series.n : 0;
  if (!n) return 0;
  let peak = 0;
  for (let i = 0; i < n; i += 1) if (series.e[i] > peak) peak = series.e[i];
  return peak;
}

/* --------------------------------------------------------------------------
   颜色（清单配色 → canvas 用的 rgba）
   -------------------------------------------------------------------------- */

/** #rrggbb / #rgb → [r,g,b]；不合法就返回兜底色 */
export function hexToRgb(hex, fallback = [255, 255, 255]) {
  const s = String(hex || "").trim();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m3) return [parseInt(m3[1] + m3[1], 16), parseInt(m3[2] + m3[2], 16), parseInt(m3[3] + m3[3], 16)];
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s);
  if (m6) return [parseInt(m6[1], 16), parseInt(m6[2], 16), parseInt(m6[3], 16)];
  return fallback.slice();
}

export const rgba = (rgb, alpha) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

/** 校验一个十六进制颜色（不合法的清单值会被换掉，CSS 里就不会出现坏值） */
export function normHex(v, fallback) {
  const s = String(v || "").trim();
  return /^#[0-9a-f]{6}$/i.test(s) || /^#[0-9a-f]{3}$/i.test(s) ? s : fallback;
}
