/* ==========================================================================
   rubbing/lib/glyph.js — 文字 → 目标点集 / 填充时刻表（纯函数，无 DOM / 无 ctx）
   --------------------------------------------------------------------------
   拓印的粒子不是"围着字排版"，而是**落进字里**。整条链路分两半：

   一、几何（哪些像素上要落粒子）
     离屏 canvas 画字（skin.js 干，属于 DOM）
       ↓ ImageData.alpha
     coverageFromAlpha  → 0/1 掩码（1px 膨胀，笔画太细时粒子会漏）
       ↓
     inkIndex           → 把所有"有墨"的像素下标摊平成一维（一次性）
       ↓ 按 ink 数量等权抽样（笔画密的地方自然抽到的点多）
     pickTargets        → count 个归一化目标点（0..1，相对掩码框）
       ↓
     fitPoints          → 舞台像素坐标（居中、等比，不变形）
       ↓
     groupByX           → 每个点属于第几个字素（按 x 等墨量切段）

   ★ baseGeometry() 给出**同一套几何**下"灰字底层"该画在哪、多大 ——
     skin.js 用它 fillText 出底下那行灰字。目标点与灰字共用
     dx/dy/s（同一个掩码、同一次 fitPoints），所以粒子一定落在灰字上，
     不需要靠字体度量去对位。这是"粒子填充灰字"成立的前提。

   二、时间轴（每个粒子什么时候落下去）
     charSpans   → 每个字素的起止时间（末字用相邻间隔中位数收口）
     inkSchedule → 每个粒子的 inkAt（何时起飞）+ fly（飞多久）

   ★ 填充时刻表是**位置（pos）的纯函数**：拖进度条 / 切句 / 暂停后恢复
     都不会错位，也不会出现"粒子还在半路、下一句已经开唱"。
   ★ 全部纯函数、全部走预分配数组：粒子场每帧都要读它们，不能有 GC 抖动。
   ★ 随机数是**可重复**的（mulberry32）：同一张封面 + 同一句话，画面可复现，
     自检才能断言具体数值。
   ========================================================================== */

/** 掩码里"有墨"的判定阈值（alpha 0..255）。 */
export const INK_ALPHA = 40;

/** 末字拿不到相邻间隔时的兜底时长（ms）。 */
export const DEFAULT_TAIL_MS = 400;

/** 一个字素的填充窗口下限（ms）：再快的字也要看得见"填"的过程。 */
export const MIN_WINDOW_MS = 40;

/** 可重复的 32 位伪随机（同一个 seed 永远给同一串）。 */
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

function clamp(v, a, b) {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return n < a ? a : n > b ? b : n;
}

/**
 * alpha 通道 → 0/1 掩码（可选膨胀 dilate 圈）。
 *
 * @param {Uint8ClampedArray|number[]} rgba 长度 w*h*4
 * @returns {{mask: Uint8Array, w: number, h: number, ink: number}}
 */
export function coverageFromAlpha(rgba, w, h, { alphaMin = INK_ALPHA, dilate = 1 } = {}) {
  const mask = new Uint8Array(w * h);
  let ink = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3] ?? rgba[i] ?? 0;
      if (a >= alphaMin) {
        mask[y * w + x] = 1;
        ink += 1;
      }
    }
  }
  if (dilate > 0 && ink > 0) {
    const src = mask.slice();
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (src[y * w + x]) continue;
        let hit = false;
        for (let dy = -dilate; dy <= dilate && !hit; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -dilate; dx <= dilate; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            if (src[ny * w + nx]) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          mask[y * w + x] = 1;
          ink += 1;
        }
      }
    }
  }
  return { mask, w, h, ink };
}

/** 掩码的统计量：墨点数量、质心（归一化）、包围盒（像素）。 */
export function maskStats(mask, w, h) {
  let ink = 0;
  let sx = 0;
  let sy = 0;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      ink += 1;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (!ink) return { ink: 0, cx: 0.5, cy: 0.5, x0: 0, y0: 0, x1: Math.max(0, w - 1), y1: Math.max(0, h - 1), w, h };
  return { ink, cx: sx / ink / w, cy: sy / ink / h, x0, y0, x1, y1, w, h };
}

/** 墨点下标摊平（一次性，之后抽样只在这个数组上做）。 */
export function inkIndex(mask) {
  let ink = 0;
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) ink += 1;
  const idx = new Int32Array(ink);
  let k = 0;
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) idx[k++] = i;
  return idx;
}

/**
 * 从掩码里抽 count 个目标点。
 *
 * @param {Int32Array} idx inkIndex() 的结果
 * @param {{w:number,h:number}} box
 * @param {number} count
 * @param {() => number} rng
 * @param {Float32Array} [out] 复用的输出（长度 ≥ count*2），避免每句都分配
 * @param {number} [jitter=0.35] 像素抖动（不然点会落在整数网格上，像马赛克；
 *   太大会把笔画糊开，0.35 是"看不出网格、字仍清晰"的分界）
 * @returns {Float32Array} 长度 count*2 的归一化 (x,y)，成对排列
 */
export function pickTargets(idx, box, count, rng, out, jitter = 0.35) {
  const n = Math.max(0, Math.round(count));
  const buf = out && out.length >= n * 2 ? out : new Float32Array(n * 2);
  const w = box.w || 1;
  const h = box.h || 1;
  const ink = idx.length;
  if (!ink || !n) {
    for (let i = 0; i < n * 2; i += 1) buf[i] = 0.5;
    return buf.subarray(0, n * 2);
  }
  for (let i = 0; i < n; i += 1) {
    const p = idx[Math.min(ink - 1, Math.floor(rng() * ink))];
    const px = p % w;
    const py = Math.floor(p / w);
    buf[i * 2] = (px + (rng() - 0.5) * jitter) / w;
    buf[i * 2 + 1] = (py + (rng() - 0.5) * jitter) / h;
  }
  return buf.subarray(0, n * 2);
}

/**
 * 把目标点映射到舞台上的矩形（居中、等比缩放，保持字不变形）。
 * 返回**预分配的**像素坐标数组（pn*2）。
 */
export function fitPoints(pts, count, rect, maskBox, out, { scale = 1 } = {}) {
  const buf = out && out.length >= count * 2 ? out : new Float32Array(count * 2);
  const mw = Math.max(1, maskBox.x1 - maskBox.x0 + 1);
  const mh = Math.max(1, maskBox.y1 - maskBox.y0 + 1);
  const s = Math.min(rect.w / mw, rect.h / mh) * scale;
  const dx = rect.x + (rect.w - mw * s) / 2;
  const dy = rect.y + (rect.h - mh * s) / 2;
  for (let i = 0; i < count; i += 1) {
    buf[i * 2] = dx + (pts[i * 2] * maskBox.w - maskBox.x0) * s;
    buf[i * 2 + 1] = dy + (pts[i * 2 + 1] * maskBox.h - maskBox.y0) * s;
  }
  return buf.subarray(0, count * 2);
}

/**
 * 灰字底层该画在哪、多大 —— **与 fitPoints 同一套几何**。
 *
 * skin.js 在掩码里把文字画在 (mask.w/2, mask.h/2)（textAlign center /
 * textBaseline middle），这里给出那一点映射到舞台后的位置，以及要用的字号。
 * 于是"fillText 画出来的灰字"与"粒子要落的目标点"逐像素重合，
 * 不需要任何字体度量对位 —— 这就是"粒子填充底下的灰字"能成立的原因。
 *
 * @param {object} stats maskStats() 的结果
 * @param {{x:number,y:number,w:number,h:number}} rect 字形带
 * @param {{w:number,h:number}} mask 掩码尺寸
 * @param {number} fontSize 掩码里用的字号
 * @returns {{x:number,y:number,fontSize:number,scale:number}}
 */
export function baseGeometry(stats, rect, mask, fontSize, { scale = 1 } = {}) {
  const mw = Math.max(1, stats.x1 - stats.x0 + 1);
  const mh = Math.max(1, stats.y1 - stats.y0 + 1);
  const s = Math.min(rect.w / mw, rect.h / mh) * scale;
  const dx = rect.x + (rect.w - mw * s) / 2;
  const dy = rect.y + (rect.h - mh * s) / 2;
  return {
    x: dx + ((mask.w || 1) / 2 - stats.x0) * s,
    y: dy + ((mask.h || 1) / 2 - stats.y0) * s,
    fontSize: Math.max(8, Number(fontSize) * s),
    scale: s,
  };
}

/**
 * 每个目标点属于第几个字素：按 x 排序后**等墨量**切段。
 *
 * 为什么不按字体度量切：字形宽度拿不到（契约里没有字素级度量），而按点数
 * 等分天然跟着笔画密度走 —— "木"这种笔画多的字会分到更多粒子，正好是我们
 * 想要的观感。切段只做一次（换行/换歌时才重算）。
 *
 * @param {Float32Array} pts 归一化目标点
 * @param {number} groups 字素数
 * @returns {Uint8Array} 长度 count，值 ∈ [0, groups-1]
 */
export function groupByX(pts, count, groups) {
  // ★ 必须把非数字挡在门外：`Math.round(NaN)` 会让 g 变 NaN，
  //   于是 `Math.min(NaN-1, …)` 也是 NaN，写进 Uint8Array 全部变成 0 ——
  //   表现是"整行在一个窗口里填完"（逐字效果静默消失，很难查）。
  const g = Math.max(1, Math.round(Number(groups) || 0));
  const out = new Uint8Array(count);
  if (!count) return out;
  const order = new Int32Array(count);
  for (let i = 0; i < count; i += 1) order[i] = i;
  const arr = Array.from(order);
  arr.sort((a, b) => pts[a * 2] - pts[b * 2] || pts[a * 2 + 1] - pts[b * 2 + 1]);
  for (let k = 0; k < count; k += 1) {
    out[arr[k]] = Math.min(g - 1, Math.floor((k * g) / count));
  }
  return out;
}

/** 中位数（非空数组），末字时长规则用它。 */
export function median(list) {
  const a = (Array.isArray(list) ? list : []).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * 末字的"有限时长"：取相邻正间隔的**中位数**（回退 400ms）。
 * 理由：单纯用行尾当结束会让长间奏里最后一个字亮十几秒。
 */
export function tailMs(words, pos, fallback = DEFAULT_TAIL_MS) {
  const gaps = [];
  const w = Array.isArray(words) ? words : [];
  for (let i = 1; i < w.length; i += 1) {
    const d = Number(w[i]) - Number(w[i - 1]);
    if (Number.isFinite(d) && d > 0) gaps.push(d);
  }
  const base = gaps.length ? median(gaps) : fallback;
  return Math.max(80, base);
}

/**
 * 每个字素的时间窗 `[start, end]`（ms）。**没有结束时间时的唯一正确做法**：
 *
 *   · 第 k 个字的结束 = 第 k+1 个字的开始（有下一个字时无需猜）；
 *   · 末字的结束 = max(起点+1, min(行尾, 起点 + tail))，tail 见 tailMs()；
 *   · `words` 与字素对不上（多语言 / 纯行级歌词）→ 整行共用一个窗口，
 *     在 `[lineStart, lineStart + spread]` 内铺满（画面仍然是逐粒填出来的，
 *     只是不再逐字）。
 *
 * @param {number[]|null|undefined} words 字素起始时间
 * @param {number} graphemes 字素数
 * @param {{lineStart?:number,lineEnd?:number,fallbackMs?:number,uniformSpreadMs?:number,uniformMinMs?:number}} [opts]
 * @returns {{start:Float32Array,end:Float32Array,uniform:boolean}}
 */
export function charSpans(words, graphemes, opts = {}) {
  const { lineStart = 0, lineEnd = Infinity, fallbackMs = DEFAULT_TAIL_MS, uniformSpreadMs = 1400, uniformMinMs = 600 } = opts;
  const g = Math.max(0, Math.round(Number(graphemes) || 0));
  const start = new Float32Array(g);
  const end = new Float32Array(g);
  if (!g) return { start, end, uniform: true };
  const lineStartMs = Number.isFinite(lineStart) ? lineStart : 0;
  const lineEndMs = Number.isFinite(lineEnd) && lineEnd > 0 ? lineEnd : Infinity;
  const w = Array.isArray(words) && words.length === g ? words.map((v) => Number(v) || 0) : null;
  if (!w) {
    const room = Number.isFinite(lineEndMs) ? (lineEndMs - lineStartMs) * 0.6 : Infinity;
    const spread = Math.max(uniformMinMs, Math.min(uniformSpreadMs, Number.isFinite(room) && room > 0 ? room : uniformSpreadMs));
    for (let i = 0; i < g; i += 1) {
      start[i] = lineStartMs;
      end[i] = lineStartMs + spread;
    }
    return { start, end, uniform: true };
  }
  const tail = tailMs(w, lineStartMs, fallbackMs);
  for (let i = 0; i < g; i += 1) {
    const s = w[i];
    start[i] = s;
    end[i] = i + 1 < g ? Math.max(s + 1, w[i + 1]) : Math.max(s + 1, Math.min(lineEndMs, s + tail));
  }
  return { start, end, uniform: false };
}

/**
 * 逐粒填充时刻表：给每个粒子一个 `inkAt`（何时起飞）与 `fly`（飞多久）。
 *
 * 关键设计：`inkAt` 落在字素窗口**减去飞行时长**之后的区间里，所以
 *   · 一个字唱完时，属于它的粒子**刚好全部落到笔画上**（不会追不上节奏）；
 *   · 同一个字内部每一粒的时刻是随机的 → 画面是"一粒一粒填进去"，
 *     而不是"整块云一起飞"。
 *
 * @param {Uint8Array|Int16Array} groupOf 每粒所属字素
 * @param {number} count 粒子数
 * @param {{start:Float32Array,end:Float32Array}} spans charSpans() 的结果
 * @param {() => number} rnd
 * @param {Float32Array} inkOut 输出：inkAt（ms）
 * @param {Float32Array} flyOut 输出：飞行时长（ms）
 * @returns {number} 写了几粒
 */
export function inkSchedule(groupOf, count, spans, rnd, inkOut, flyOut, opts = {}) {
  const { flyMs = 150, flyJitterMs = 90, minWindowMs = MIN_WINDOW_MS, leadMs = 0 } = opts;
  const n = Math.max(0, Math.round(count));
  const g = spans?.start?.length || 0;
  if (!inkOut || inkOut.length < n) inkOut = new Float32Array(n);
  if (!flyOut || flyOut.length < n) flyOut = new Float32Array(n);
  if (!g) {
    for (let i = 0; i < n; i += 1) {
      inkOut[i] = Infinity;
      flyOut[i] = flyMs;
    }
    return n;
  }
  for (let i = 0; i < n; i += 1) {
    const gi = clamp(groupOf ? groupOf[i] : 0, 0, g - 1) | 0;
    const s = spans.start[gi] - leadMs;
    const e = spans.end[gi];
    const f = flyMs + rnd() * flyJitterMs;
    flyOut[i] = f;
    const win = Math.max(minWindowMs, e - s - f);
    inkOut[i] = s + rnd() * win;
  }
  return n;
}

/** 已唱到的字素数（0..g）—— 暴露给自检的进度读数。 */
export function litGroups(words, graphemes, pos) {
  const g = Math.max(1, Math.round(Number(graphemes) || 0));
  const w = Array.isArray(words) && words.length === g ? words : null;
  if (!w) return g;
  let lit = 0;
  for (let i = 0; i < g; i += 1) if ((Number(w[i]) || 0) <= pos) lit = i + 1;
  return lit;
}
