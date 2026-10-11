/* ==========================================================================
   rubbing/lib/glyph.js — 文字 → 目标点集（纯函数，无 DOM / 无 ctx）
   --------------------------------------------------------------------------
   拓印的粒子不是"围着字排版"，而是**组成字**：所以要把一行文字变成
   「一堆落在笔画上的目标点」。链路是：

     离屏 canvas 画字（skin.js 干，属于 DOM）
       ↓ ImageData.alpha
     coverageFromAlpha   → 0/1 掩码（可选 1px 膨胀，笔画太细时粒子会漏）
       ↓
     inkIndex            → 把所有"有墨"的像素下标摊平成一维（一次性）
       ↓ 按 ink 数量等权抽样（笔画密的地方自然抽到的点多）
     pickTargets         → count 个归一化目标点（0..1，相对掩码框）
       ↓
     groupByX            → 每个点属于第几个字素（按 x 排序切段）

   ★ 全部纯函数、全部走预分配数组：粒子场每帧都要读它们，不能有 GC 抖动。
   ★ 随机数是**可重复**的（mulberry32）：同一张封面 + 同一句话，画面可复现，
     自检才能断言具体数值。
   ========================================================================== */

/** 掩码里"有墨"的判定阈值（alpha 0..255）。 */
export const INK_ALPHA = 40;

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
 * @param {number} [jitter=0.5] 像素抖动（不然点会落在整数网格上，像马赛克）
 * @returns {Float32Array} 长度 count*2 的归一化 (x,y)，成对排列
 */
export function pickTargets(idx, box, count, rng, out, jitter = 0.5) {
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
  const g = Math.max(1, Math.round(groups));
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
 * 末字的"有限时长"：取相邻正间隔的**中位数**（回退 400ms），再用行尾/下一行
 * 起点夹住。理由与暗房同源：单纯用行尾当结束会让长间奏里最后一个字亮十几秒。
 */
export function tailMs(words, pos, fallback = 400) {
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
 * 每个字素此刻的强度（0..1）。**没有结束时间时的唯一正确做法**：
 *
 *   · 第 k 个字的结束 = 第 k+1 个字的开始（有下一个字时无需猜）；
 *   · 末字的结束 = max(起点+1, min(行尾, 起点+tail))，tail 见 tailMs()；
 *   · words 与字素对不上（多语言/无字级歌词）→ 整行一起亮（全部返回 1）。
 *
 * 分母给到 1ms 下限，避免"起止同毫秒"时出现 0/0。
 */
export function glyphLevels(words, graphemes, pos, { lineEnd = Infinity } = {}) {
  const g = Math.max(1, Math.round(graphemes));
  const out = new Float32Array(g);
  const w = Array.isArray(words) && words.length === g ? words.map((v) => Number(v) || 0) : null;
  if (!w) {
    out.fill(1);
    return out;
  }
  const tail = tailMs(w, pos);
  for (let i = 0; i < g; i += 1) {
    const s = w[i];
    const e = i + 1 < g ? Math.max(s + 1, w[i + 1]) : Math.max(s + 1, Math.min(Number(lineEnd) || Infinity, s + tail));
    const t = (pos - s) / Math.max(1, e - s);
    out[i] = t <= 0 ? 0 : t >= 1 ? 1 : t;
  }
  return out;
}

/** 已唱到的字素数（0..g）—— 决定"哪些粒子被吸引"。 */
export function litGroups(words, graphemes, pos) {
  const g = Math.max(1, Math.round(graphemes));
  const w = Array.isArray(words) && words.length === g ? words : null;
  if (!w) return g;
  let lit = 0;
  for (let i = 0; i < g; i += 1) if ((Number(w[i]) || 0) <= pos) lit = i + 1;
  return lit;
}
