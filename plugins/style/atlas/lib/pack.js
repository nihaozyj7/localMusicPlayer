/* ==========================================================================
   pack.js — 铅字盘的「世界」（**纯逻辑，无 DOM**）
   --------------------------------------------------------------------------
   把整篇歌词压进一条**宽度固定、高度不限**的带子里。这是本样式的世界坐标
   （单位一律是 **em**，与字号无关 —— 所以用户拖字号滑杆时不重排、不重新装箱）。

   一条歌词 = 一根**条**（bar）：

     · 长度两个方向各算一份：`len`（横排时的宽 = 整串实测宽度）、
       `vlen`（竖排时的高 = Σ max(最小字高, 该字实测宽)）；
       —— 竖排的每个字素都要占掉至少一个字高，直接用横排宽度当高度会让
          拉丁歌词的竖条挤成一坨。
     · 厚度 `thick`：有译文（`trans`）的条要厚出 0.8em 放副行，否则 1.25em；
     · 朝向二选一：0 = 横排（len × thick）、1 = 竖排（thick × vlen）。

   ★ 长度为什么不用「字符个数」：中文一字 ≈ 1em，拉丁字母 ≈ 0.5em，"WWW" 比
     "aaa" 宽一倍。按字符个数算，遇到拉丁行会把宽度算小、装箱直接失败。
     所以长度一律走注入的 `measure(text) -> em`。

   ★ 容器宽度：`W = 2 × (最长条 + 留缝)`。这个系数的含义是「**任意两根横条都能
     共享一行**」（每根 ≤ W/2），所以"最长的两根并排刚好填满一行"永远成立 ——
     密集度的地基。少算一个 gutter 就会让"最长两根"差 0.16em 排不下，密度掉一档。

   装箱算法：**天际线（skyline）bottom-left + 允许 90° 旋转 + 最小顶边**。
     · 为什么不是货架（shelf）：歌词里短行/空行极多，货架只能一行行排、留大片
       空隙；天际线能把竖条塞进横条留下的缝里，这才是"密集"的来源。
     · 为什么不是 MaxRects：高度不限的条带里，天际线以上的整片空间就是自由空间，
       不需要维护候选矩形列表，实现与验证都简单得多。
     · **确定性**：候选位置按 (顶边, 浪费面积, x) 排序；朝向打乱用 `hash01(i)`
       这种与输入无关的确定性哈希。同一份输入两次调用必须逐字节相同。
   ========================================================================== */

/** 条与条之间至少留的缝（em）。压到 0.12 以下横竖交界会糊成噪点。 */
export const DEFAULT_GUTTER = 0.16;
/** 条的厚度（em）：横排是行高，竖排是列宽。 */
export const DEFAULT_THICKNESS = 1.25;
/** 有译文时额外加出来的副行带（em）。 */
export const TRANS_BAND = 0.8;
/** 空行/间奏行的最小长度（em）—— 必须占位，丢了行号整篇就错位。 */
export const DEFAULT_MIN_LEN = 1.1;
/** 竖排里一个字素至少占掉的高度（em，≈ 字面高度）。 */
export const MIN_GLYPH_ADV = 0.66;
/** 朝向打乱的容忍度（em）：次优朝向的顶边只比最优高这么多时，才允许按 hash 翻。 */
export const MIX_TOLERANCE = 0.5;

/* --------------------------------------------------------------------------
   文本度量
   -------------------------------------------------------------------------- */

/**
 * 把一行文本切成字素，并给出**每个字素左边缘的偏移**（em）。
 *
 * 用「累积子串」测量而不是「逐字宽度累加」：拉丁字母之间有 kerning/连字，
 * 逐字累加会与整串宽度对不上，字素越往后错得越多（逐字落版就会整体漂移）。
 * 累积子串测量同时也让 `w` 恰好等于 `measure(整串)`，装箱尺寸与绘制位置一致。
 *
 * @param {string} text
 * @param {(s: string) => number} measure 文本 → 宽度（em）
 * @param {(s: string) => string[]} [split] 文本 → 字素数组（宿主 sdk.splitGraphemes）
 * @returns {{chars: string[], xs: number[], w: number, cum: number[], vlen: number}}
 */
export function measureOffsets(text, measure, split) {
  const s = String(text ?? "");
  const chars = split ? split(s) : Array.from(s);
  const n = chars.length;
  /** @type {number[]} */
  const cum = new Array(n + 1);
  cum[0] = measure("");
  for (let k = 1; k <= n; k += 1) cum[k] = measure(chars.slice(0, k).join(""));
  /** @type {number[]} */
  const xs = new Array(n);
  let vlen = 0;
  for (let k = 0; k < n; k += 1) {
    xs[k] = cum[k];
    vlen += Math.max(MIN_GLYPH_ADV, measure(chars[k]));
  }
  return { chars, xs, w: cum[n], cum, vlen };
}

/**
 * 造条：把歌词行变成「长度 + 厚度 + 朝向候选」的条。
 *
 * @param {Array<{text?: string, trans?: string[], time?: number}>} lines
 * @param {{measure: (s: string) => number, split?: (s: string) => string[],
 *          thickness?: number, transBand?: number, minLen?: number, gutter?: number,
 *          maxMeasure?: number}} opts
 *   `maxMeasure` 可选：测量次数上限（长歌保护，见 skin.js 的调用）
 * @returns {{bars: Array<{i:number, text:string, trans:string, len:number, vlen:number, thick:number}>,
 *            width:number, thickness:number, maxLen:number}}
 */
export function buildBars(lines, opts) {
  const measure = opts.measure;
  const split = opts.split;
  const thickness = Number.isFinite(opts.thickness) ? Number(opts.thickness) : DEFAULT_THICKNESS;
  const transBand = Number.isFinite(opts.transBand) ? Number(opts.transBand) : TRANS_BAND;
  const minLen = Number.isFinite(opts.minLen) ? Number(opts.minLen) : DEFAULT_MIN_LEN;
  const gutter = Number.isFinite(opts.gutter) ? Number(opts.gutter) : DEFAULT_GUTTER;
  const rows = Array.isArray(lines) ? lines : [];

  let maxLen = 0;
  const bars = rows.map((line, i) => {
    const text = String(line?.text ?? "");
    const off = measureOffsets(text, measure, split);
    const trans = Array.isArray(line?.trans)
      ? line.trans.map((t) => String(t ?? "").trim()).filter(Boolean).join(" · ")
      : "";
    const len = Math.max(minLen, off.w);
    const vlen = Math.max(minLen, off.vlen);
    if (len > maxLen) maxLen = len;
    return { i, text, trans, len, vlen, thick: thickness + (trans ? transBand : 0) };
  });

  /* 容器宽度 = 两根**带留缝的**最长条并排（少算一个 gutter 就会让"最长两根"
     差 0.16em 排不下，密度直接掉一档）。留一点余量，免得浮点误差刚好卡住。 */
  const width = Math.max(2 * (thickness + gutter) + 1e-6, 2 * (maxLen + gutter) + 1e-6);
  return { bars, width, thickness, maxLen };
}

/* --------------------------------------------------------------------------
   确定性哈希（朝向打乱用；与输入顺序绑定，换歌不会跳）
   -------------------------------------------------------------------------- */

/**
 * 第 i 根条的「打乱倾向」，恒在 [0,1)。
 * 不用 Math.random：布局必须是位置/序号纯函数，否则每次重算画面都会跳。
 * @param {number} i
 * @returns {number}
 */
export function hash01(i) {
  const x = Math.sin((Number(i) + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/* --------------------------------------------------------------------------
   天际线装箱
   -------------------------------------------------------------------------- */

/** @typedef {{x:number, w:number, y:number}} Seg */

/**
 * 在天际线上把宽 w 的矩形放到 x 处：给出需要的顶边 y 与"多余空隙"面积。
 * @param {Seg[]} sky
 * @param {number} x
 * @param {number} w
 * @returns {{y:number, waste:number}}
 */
export function skylineFitAt(sky, x, w) {
  let y = 0;
  for (const s of sky) {
    if (s.x + s.w <= x || s.x >= x + w) continue;
    if (s.y > y) y = s.y;
  }
  let waste = 0;
  for (const s of sky) {
    const a = Math.max(x, s.x);
    const b = Math.min(x + w, s.x + s.w);
    if (b <= a) continue;
    waste += (y - s.y) * (b - a);
  }
  return { y, waste };
}

/**
 * 放下一块：把 [x, x+w] 区间的天际线全部抬到 y+h，并合并同高的相邻段。
 * @param {Seg[]} sky
 * @param {number} x
 * @param {number} w
 * @param {number} y
 * @param {number} h
 * @returns {Seg[]}
 */
export function skylinePlace(sky, x, w, y, h) {
  const top = y + h;
  /** @type {Seg[]} */
  const out = [];
  for (const s of sky) {
    if (s.x + s.w <= x || s.x >= x + w) {
      out.push({ x: s.x, w: s.w, y: s.y });
      continue;
    }
    if (s.x < x) out.push({ x: s.x, w: x - s.x, y: s.y });
    if (s.x + s.w > x + w) out.push({ x: x + w, w: s.x + s.w - (x + w), y: s.y });
  }
  out.push({ x, w, y: top });
  out.sort((a, b) => a.x - b.x);
  /** @type {Seg[]} */
  const merged = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.y - s.y) < 1e-9 && Math.abs(last.x + last.w - s.x) < 1e-9) {
      last.w += s.w;
    } else {
      merged.push({ x: s.x, w: s.w, y: s.y });
    }
  }
  return merged;
}

/**
 * 候选位置：每个天际线段的左端，以及"右对齐"（s.x + s.w − w）。
 * 最优位置总是落在某个段的端点上。
 *
 * ★ 不四舍五入：候选必须是**精确浮点**。曾经把 x 圆到 3 位小数，结果
 *   `s.x + s.w` 比候选大 3e-16，"贴着上一条右边缘"的位置被判成重叠，
 *   整条天际线塌成阶梯 —— 密度从 0.93 掉到 0.67（同一个 bug：四根等长的条
 *   会排成一横一竖的阶梯）。自检里有一条专门盯着它。
 * @param {Seg[]} sky
 * @param {number} w
 * @param {number} W
 * @returns {number[]}
 */
export function skylineCandidates(sky, w, W) {
  const limit = W - w;
  if (limit < -1e-9) return [];
  const raw = [0];
  for (const s of sky) {
    raw.push(s.x);
    raw.push(s.x + s.w - w);
  }
  /** @type {number[]} */
  const out = [];
  for (const x of raw) out.push(Math.max(0, Math.min(limit, x)));
  out.sort((a, b) => a - b);
  /** @type {number[]} */
  const uniq = [];
  for (const x of out) {
    if (!uniq.length || Math.abs(x - uniq[uniq.length - 1]) > 1e-9) uniq.push(x);
  }
  return uniq;
}

/**
 * 一根条在某个朝向下的外形（含留缝）。
 * @param {{len:number, vlen:number, thick:number}} bar
 * @param {number} dir 0 = 横排，1 = 竖排
 * @param {number} gutter
 * @returns {{w:number, h:number}}
 */
export function sizeFor(bar, dir, gutter) {
  const t = bar.thick + gutter;
  return dir === 0
    ? { w: bar.len + gutter, h: t }
    : { w: t, h: bar.vlen + gutter };
}

/**
 * 给一根条找最好的落点（两种朝向都试）。
 * @param {Seg[]} sky
 * @param {{len:number, vlen:number, thick:number}} bar
 * @param {number} W
 * @param {number} gutter
 * @returns {{dir:number, x:number, y:number, w:number, h:number, top:number, waste:number, dirTop:number[]}|null}
 */
export function bestPlacement(sky, bar, W, gutter) {
  /** @type {number[]} */
  const dirTop = [Infinity, Infinity];
  let best = null;
  for (const dir of [0, 1]) {
    const { w, h } = sizeFor(bar, dir, gutter);
    if (w > W + 1e-9) continue;
    for (const x of skylineCandidates(sky, w, W)) {
      const { y, waste } = skylineFitAt(sky, x, w);
      const top = y + h;
      if (top < dirTop[dir]) dirTop[dir] = top;
      if (!best) {
        best = { dir, x, y, w, h, top, waste, dirTop };
        continue;
      }
      // 先比顶边，再比浪费，最后比 x —— 三级排序保证确定性
      if (top < best.top - 1e-9) best = { dir, x, y, w, h, top, waste, dirTop };
      else if (Math.abs(top - best.top) < 1e-9 && waste < best.waste - 1e-9)
        best = { dir, x, y, w, h, top, waste, dirTop };
      else if (
        Math.abs(top - best.top) < 1e-9 &&
        Math.abs(waste - best.waste) < 1e-9 &&
        x < best.x - 1e-9
      )
        best = { dir, x, y, w, h, top, waste, dirTop };
    }
  }
  return best;
}

/**
 * 指定朝向下的最优落点（朝向打乱用）。
 * @param {Seg[]} sky
 * @param {{len:number, vlen:number, thick:number}} bar
 * @param {number} W
 * @param {number} gutter
 * @param {number} dir
 * @returns {{x:number,y:number,top:number}|null}
 */
export function bestOfDir(sky, bar, W, gutter, dir) {
  const { w, h } = sizeFor(bar, dir, gutter);
  if (w > W + 1e-9) return null;
  let best = null;
  for (const x of skylineCandidates(sky, w, W)) {
    const { y, waste } = skylineFitAt(sky, x, w);
    const top = y + h;
    if (!best) best = { x, y, top, waste };
    else if (top < best.top - 1e-9 || (Math.abs(top - best.top) < 1e-9 && waste < best.waste - 1e-9))
      best = { x, y, top, waste };
  }
  return best ? { x: best.x, y: best.y, top: best.top } : null;
}

/** 天际线的当前高度（= 已占用区域的顶边） */
export function skyHeight(sky) {
  let h = 0;
  for (const s of sky) if (s.y > h) h = s.y;
  return h;
}

/**
 * 带状装箱：把全部条压进宽 W、高不限的带子里。
 *
 * @param {Array<{i:number, len:number, vlen:number, thick:number}>} bars
 * @param {object} opts
 * @param {number} opts.width 容器宽（em）
 * @param {number} [opts.gutter]
 * @param {number} [opts.mix] 0 = 纯密度优先；0.5 = 次优朝向只贵 ≤MIX_TOLERANCE×mix 时按 hash 翻；1 = 尽量按 hash
 * @param {(i:number)=>number} [opts.hash]
 * @returns {{rects: Array<{x:number,y:number,w:number,h:number,dir:number}>, order:number[],
 *            W:number, H:number, area:number, density:number, route: Array<{x:number,y:number}>,
 *            flipped:number, gutter:number}}
 */
export function packStrip(bars, opts) {
  const W = Number(opts.width);
  const gutter = Number.isFinite(opts.gutter) ? Number(opts.gutter) : DEFAULT_GUTTER;
  const mix = Math.max(0, Math.min(1, Number(opts.mix) || 0));
  const hash = opts.hash || hash01;
  const list = Array.isArray(bars) ? bars : [];

  /* 放置顺序：长度降序 + 序号升序（长条先落，短条填空）。
     这是密集度的关键启发式，也必须是确定的。 */
  const order = list
    .map((b) => b.i)
    .sort((a, c) => {
      const la = list[a] ? list[a].len : 0;
      const lc = list[c] ? list[c].len : 0;
      if (Math.abs(la - lc) > 1e-9) return lc - la;
      return a - c;
    });

  /** @type {Seg[]} */
  let sky = [{ x: 0, w: W, y: 0 }];
  /** @type {Array<{x:number,y:number,w:number,h:number,dir:number}>} */
  const rects = new Array(list.length);
  let flipped = 0;

  for (const i of order) {
    const bar = list[i];
    if (!bar) continue;
    const best = bestPlacement(sky, bar, W, gutter);
    if (!best) {
      // 理论上不可能：单根条最多只有 W/2 长。真发生了就把它放到最底下，绝不丢行。
      const s = sizeFor(bar, 0, gutter);
      const y = skyHeight(sky);
      rects[i] = { x: 0, y, w: s.w, h: s.h, dir: 0 };
      sky = skylinePlace(sky, 0, s.w, y, s.h);
      continue;
    }
    /* 朝向打乱：按 hash 决定"想不想翻"，但只在次优朝向的顶边不贵太多时才翻。
       mix 越大越容易翻 ⇒ 纹理越乱、密度越低（两者是同一个旋钮的两端）。 */
    let dir = best.dir;
    if (mix > 0) {
      const want = hash(i) < mix ? 1 - best.dir : best.dir;
      const wantTop = best.dirTop[want];
      if (Number.isFinite(wantTop) && wantTop <= best.top + MIX_TOLERANCE * mix && want !== best.dir) {
        flipped += 1;
        dir = want;
      }
    }
    let { x, y, w, h } = best;
    if (dir !== best.dir) {
      const target = bestOfDir(sky, bar, W, gutter, dir);
      if (target) {
        x = target.x;
        y = target.y;
        /* ★ 换了朝向就必须换成那个朝向的尺寸：留用旧 w/h 会让"预订的天空"
           与"实际占的地方"对不上（相邻条互相压过去，自检里量得到重叠）。 */
        ({ w, h } = sizeFor(bar, dir, gutter));
      } else {
        dir = best.dir;
        ({ x, y, w, h } = best);
      }
    }
    rects[i] = { x, y, w, h, dir };
    sky = skylinePlace(sky, x, w, y, h);
  }

  const H = skyHeight(sky);
  let area = 0;
  for (const r of rects) if (r) area += r.w * r.h;
  const route = rects.map((r) => (r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: 0, y: 0 }));

  return {
    rects,
    order,
    W,
    H,
    area,
    density: H > 0 && W > 0 ? area / (W * H) : 0,
    route,
    flipped,
    gutter,
  };
}

/**
 * 廉价基线：长度降序 + 逐行铺（一行能塞几根塞几根）。用来当密度的对照读数，
 * 自检里断言天际线不会比它还差。
 * @param {Array<{len:number, thick:number}>} bars
 * @param {number} W
 * @param {number} gutter
 * @returns {number} 总高（em）
 */
export function shelfHeight(bars, W, gutter) {
  const list = [...(bars || [])].sort((a, b) => b.len - a.len);
  let rows = 0;
  let x = 0;
  let rowThick = 0;
  for (const b of list) {
    const w = b.len + gutter;
    if (x > 0 && x + w > W + 1e-9) {
      rows += rowThick + gutter;
      x = 0;
      rowThick = 0;
    }
    x += w;
    rowThick = Math.max(rowThick, b.thick);
  }
  if (x > 0) rows += rowThick + gutter;
  return rows;
}

/* --------------------------------------------------------------------------
   取用
   -------------------------------------------------------------------------- */

/**
 * 去掉留缝、得到真正画文字的那个盒子（留缝由装箱负责，绘制要缩回来）。
 * @param {{x:number,y:number,w:number,h:number}} r
 * @param {number} gutter
 */
export function tightRect(r, gutter) {
  const pad = gutter / 2;
  return {
    x: r.x + pad,
    y: r.y + pad,
    w: Math.max(0.001, r.w - gutter),
    h: Math.max(0.001, r.h - gutter),
  };
}

/**
 * 命中测试：世界坐标（em）落在哪根条里。
 * 屏幕坐标由 camera.js 反投影成世界坐标，这里只做几何包含。
 * 重叠时命中面积小的（竖条更窄，优先给它）。
 * @param {Array<{x:number,y:number,w:number,h:number}>} rects
 * @param {number} x
 * @param {number} y
 * @param {number} [slop] 额外容差（em）
 * @returns {number} 条下标，-1 = 没命中
 */
export function hitTest(rects, x, y, slop = 0) {
  let hit = -1;
  let bestArea = Infinity;
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (!r) continue;
    if (x < r.x - slop || x > r.x + r.w + slop || y < r.y - slop || y > r.y + r.h + slop) continue;
    const a = r.w * r.h;
    if (a < bestArea) {
      bestArea = a;
      hit = i;
    }
  }
  return hit;
}

/**
 * 视口剔除：世界矩形是否与视口相交（绘制只需要这些条）。
 * @param {{x:number,y:number,w:number,h:number}} r
 * @param {{x0:number,y0:number,x1:number,y1:number}} view 世界坐标的视口
 * @returns {boolean}
 */
export function intersects(r, view) {
  if (!r) return false;
  return r.x < view.x1 && r.x + r.w > view.x0 && r.y < view.y1 && r.y + r.h > view.y0;
}
