/* ==========================================================================
   活字 letterpress —— 排版曲线（纯逻辑，无 DOM）
   --------------------------------------------------------------------------
   这一款的全部"设计"都压缩成一个函数：把 128 段频谱的三个区段映射成
   四条**真实存在的 CSS 排版轴**（不打包字体、不用 font-variation-settings）：

     低频（0..12 段）   → font-weight（字重）+ font-size（字号）
     中频（13..44 段）  → letter-spacing（字距）+ 基线抬升
     高频（45..127 段） → skewX（斜切）+ 收字号

   为什么不做可变字体：CJK 可变字体子集化后仍有数 MB，而且首帧必跳字
   （字体没到就只能用兜底字体排一遍）。四个属性足以表达"排版在呼吸"。

   纯逻辑测试覆盖：值域 / 单调性 / performance 档只留低频 / 幅度收敛 /
   字素时间戳插值 / FLIP 增量 / 视窗与列位移 / 时间码。
   ========================================================================== */

/** 排版曲线的常量（唯一真源：CSS 不写死任何数值，全靠这里输出的自定义属性） */
export const CURVE = {
  weightMin: 300,
  weightMax: 820,
  /** 低频把字号放大（相对基准字号的比例），高频收一点回来 */
  sizeGain: 0.12,
  sizeBack: 0.055,
  /** 字距（em）：中频越大排得越松（活字加"空铅"） */
  spaceMin: -0.012,
  spaceMax: 0.2,
  /** 高频 → 斜切（负值 = 向右倾，像活字没夹紧） */
  skewMax: -7,
  /** 中频 → 基线上抬（px），"这一行被顶起来" */
  liftMax: 3.2,
  inkMin: 0.82,
  inkMax: 1,
  /** 当前行每个字素的相位（0.85..1.15 的确定性波动，让一行字不是一个整体在动） */
  unitPhaseAmp: 0.15,
  unitWave: 0.55,
  /** 版面：一行占多高、列位移过渡多长、几行开外开始淡出、重排保持多久 */
  leading: 54,
  moveMs: 420,
  halfWindow: 40,
  depthMax: 3,
  depthScale: 0.055,
  depthInk: 0.26,
  /** 重排时长（字越多，重排越久） */
  reflowMin: 280,
  reflowMax: 560,
  reflowBase: 200,
  reflowPerUnit: 9,
  /** "刚排好"标记保持多久（CSS 据此让铅块短暂显形） */
  setHoldMs: 320,
  /** 最后一个字素唱完所需的兜底时长（行内没有下一个时间戳时） */
  lastUnitMs: 420,
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
/** 归一化 -0（否则 CSS 会拿到 "-0deg" 这种看着怪、断言也怪的值） */
export const round3 = (v) => Math.round(v * 1000) / 1000 + 0;

/* --------------------------------------------------------------------------
   频谱 → 排版曲线
   -------------------------------------------------------------------------- */

/**
 * 128 段对数全谱切三段。区间与暗房 / 拓印 / 塔同一口径：
 * 0..12 是低频（鼓 / 贝斯），13..44 是人声与中频，45..127 是齿音与镲。
 *
 * @param {ArrayLike<number>|null|undefined} bands
 * @returns {{low:number, mid:number, high:number}} 三段均值（0..1）
 */
export function bandSplit(bands) {
  if (!bands || !bands.length) return { low: 0, mid: 0, high: 0 };
  return {
    low: meanRange(bands, 0, 12),
    mid: meanRange(bands, 13, 44),
    high: meanRange(bands, 45, bands.length - 1),
  };
}

function meanRange(bands, from, to) {
  const lo = Math.max(0, Math.min(bands.length - 1, from));
  const hi = Math.max(lo, Math.min(bands.length - 1, to));
  let sum = 0;
  for (let i = lo; i <= hi; i += 1) sum += Number(bands[i]) || 0;
  return sum / (hi - lo + 1);
}

/**
 * 排版曲线。
 *
 * @param {{low:number, mid:number, high:number}} split
 * @param {{base?:number, fit?:number, performance?:boolean, disabled?:boolean}} [opts]
 *   base       基准字号（px，来自宿主 `lyricsFontSize`）
 *   fit        幅度收敛（0..1，窄窗口调小；见 amplitudeFit）
 *   performance 性能档：只有低频轴在动（字重 / 字号），字距与斜切不动
 *   disabled   静态档（animations:false）：连低频也不动，返回中性版式
 * @returns {{weight:number, size:number, spacing:number, skew:number, lift:number, ink:number}}
 *   size 是**倍率**（乘在基准字号上），其余都是可直接写进 CSS 的值
 */
export function typesetCurve(split, opts = {}) {
  const fit = Number.isFinite(opts.fit) ? clamp(opts.fit, 0.2, 1) : 1;
  if (opts.disabled) return neutralCurve();
  const low = clamp01(Number(split?.low) || 0);
  const mid = performanceOff(opts) ? 0 : clamp01(Number(split?.mid) || 0);
  const high = performanceOff(opts) ? 0 : clamp01(Number(split?.high) || 0);
  return {
    // 字重取整到 10：浏览器本来也会把非整百字重吸附到最近的可用字重
    weight: Math.round((CURVE.weightMin + low * (CURVE.weightMax - CURVE.weightMin)) / 10) * 10,
    size: round3(1 + (CURVE.sizeGain * low - CURVE.sizeBack * high) * fit),
    spacing: round3((CURVE.spaceMin + mid * (CURVE.spaceMax - CURVE.spaceMin)) * fit),
    skew: round3(CURVE.skewMax * high * fit),
    lift: round3(CURVE.liftMax * mid * fit),
    ink: round3(CURVE.inkMin + low * (CURVE.inkMax - CURVE.inkMin)),
  };
}

const performanceOff = (opts) => opts?.performance === true;

/** 中性版式（静态档 / 拿不到频谱时用它，画面不会是"半截排版"） */
export function neutralCurve() {
  return {
    weight: 500,
    size: 1,
    spacing: round3(CURVE.spaceMin),
    skew: 0,
    lift: 0,
    ink: round3((CURVE.inkMin + CURVE.inkMax) / 2),
  };
}

/** 静态档的固定版式（一次算好，之后不再动） */
export const staticCurve = () => neutralCurve();

/**
 * 窄窗口的幅度收敛：不是归零，只是让曲线别把字挤出栏外。
 * @param {number} width 舞台宽（px）
 * @param {number} height 舞台高（px）
 */
export function fitFor(width, height) {
  const w = Number(width) > 0 ? width : 1280;
  const h = Number(height) > 0 ? height : 720;
  return clamp(Math.min(w / 1100, h / 620), 0.72, 1);
}

/** 曲线幅度（与"版面缩放"分开：版面缩到 0.72，曲线的摆动幅度再收敛一次） */
export function amplitudeFit(fit) {
  const f = Number.isFinite(fit) ? clamp(fit, 0.2, 1) : 1;
  return round3(0.55 + 0.45 * f);
}

/* --------------------------------------------------------------------------
   版面：视窗 / 列位移 / 深度
   -------------------------------------------------------------------------- */

/**
 * 当前行前后各留 half 行（默认 ±40）。
 * 为什么这么宽：列位移过渡只由 `cur - from` 决定，视窗滑动（from 变）不产生位移，
 * 所以滑动时"每个槽位的文字整体换了一行"这件事发生在**离当前行 40 行**的地方 ——
 * 屏幕上一共只看得见 7 行左右，于是这个换字永远看不见。
 *
 * @returns {{from:number, to:number}} 闭区间（行数为 0 时返回 {from:0,to:-1}）
 */
export function windowFor(cur, total, half = CURVE.halfWindow) {
  const n = Math.max(0, Number(total) || 0);
  if (!n) return { from: 0, to: -1 };
  const h = Math.max(0, Number(half) || 0);
  const c = clamp(Number(cur) || 0, 0, n - 1);
  if (n <= h * 2 + 1) return { from: 0, to: n - 1 };
  const from = clamp(c - h, 0, n - 1 - h * 2);
  return { from, to: from + h * 2 };
}

/**
 * 列的纵向位移：当前行要停在版面中央，于是整列按 (cur - from) 个行高上移。
 * 视窗滑动时 cur 与 from 同时 +1 → 位移不变 → 滑动本身不动画面。
 */
export function columnShift(cur, from, leading = CURVE.leading) {
  return round3(-(clamp(Number(cur) || 0, 0, 1e6) - (Number(from) || 0)) * leading);
}

/** 距离当前行几行（0 = 当前行；超出 depthMax 就按 depthMax 算） */
export function depthOf(i, cur, max = CURVE.depthMax) {
  const d = Math.abs((Number(i) || 0) - (Number(cur) || 0));
  return d > max ? max : d;
}

/** 越远的行越小越淡（当前行永远是满墨） */
export function depthStyle(depth) {
  const d = clamp(Number(depth) || 0, 0, CURVE.depthMax);
  return {
    scale: round3(1 - d * CURVE.depthScale),
    ink: round3(1 - d * CURVE.depthInk),
  };
}

/** 每个字素的确定性相位（同一行反复渲染结果一致，自检才能断言） */
export function unitPhase(i) {
  return round3(1 + CURVE.unitPhaseAmp * Math.sin((Number(i) || 0) * CURVE.unitWave));
}

/** 重排时长：字越多，活字要走的路越长 */
export function reflowMs(units) {
  const n = Math.max(0, Number(units) || 0);
  return Math.round(clamp(CURVE.reflowBase + n * CURVE.reflowPerUnit, CURVE.reflowMin, CURVE.reflowMax));
}

/* --------------------------------------------------------------------------
   进度 → 逐字点亮
   -------------------------------------------------------------------------- */

/**
 * 一行里每个字素的点亮量（0..1）。
 *
 * 有 `words` 就按字级时间戳插值；没有就把整行当成一个字素（一起亮）。
 * 最后一个字素没有"下一个时间戳"可插值，用 lastUnitMs 兜底 —— 否则它会
 * 永远停在 0，长间奏里看着像"最后一个字没唱"。
 *
 * @param {{time:number, graphemes:string[], words:number[]|null}} line
 * @param {number} pos 毫秒
 * @returns {number[]} 与 graphemes 等长
 */
export function litFor(line, pos) {
  const n = line?.graphemes?.length || 0;
  if (!n) return [];
  const p = Number(pos) || 0;
  const t = Number(line.time) || 0;
  const words = line.words;
  // 时间戳必须与字素一一对应、且都是有限数；任何一条不满足就整行一起亮
  // （防御性：调用方已经校验过一次，这里再挡一次"错位点亮"）
  const usable = Array.isArray(words) && words.length === n && words.every((v) => Number.isFinite(v));
  if (!usable) {
    const v = p >= t ? 1 : 0;
    return new Array(n).fill(v);
  }
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const start = words[i];
    const next = i + 1 < n ? words[i + 1] : start + CURVE.lastUnitMs;
    const span = next - start;
    out[i] = span > 0 ? clamp01((p - start) / span) : p >= start ? 1 : 0;
  }
  return out;
}

/** 当前行内的整体进度（给 HUD 与强调下划线用） */
export function progressRatio(line, pos, nextTime) {
  const t = Number(line?.time) || 0;
  const end = Number.isFinite(nextTime) && nextTime > t ? nextTime : t + 6000;
  return round3(clamp01(((Number(pos) || 0) - t) / (end - t)));
}

/** 最后一个 time <= pos 的行；还没到第一句时返回 -1 */
export function lineIndexAt(lines, pos) {
  const list = lines || [];
  const p = Number(pos) || 0;
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = Number(list[mid]?.time) || 0;
    if (t <= p) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** 下一行的时间（没有就返回 null） */
export function nextLineTime(lines, i) {
  const list = lines || [];
  const n = Number(i);
  if (!Number.isFinite(n) || n < 0 || n + 1 >= list.length) return null;
  const t = Number(list[n + 1]?.time);
  return Number.isFinite(t) ? t : null;
}

/** 行与行之间的空档（毫秒）：HUD 的"停顿"读数与重排节奏都用它 */
export function gapAfter(lines, i) {
  const next = nextLineTime(lines, i);
  if (next === null) return 0;
  return Math.max(0, next - (Number(lines[i]?.time) || 0));
}

const pad2 = (n) => String(Math.floor(n)).padStart(2, "0");

/** 毫秒 → mm:ss */
export function timecode(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${pad2(total / 60)}:${pad2(total % 60)}`;
}

/* --------------------------------------------------------------------------
   FLIP（活字重排）
   -------------------------------------------------------------------------- */

/**
 * 从"旧位置"到"新位置"的位移（活字重排：新行从这个字素原来待的位置飞过来）。
 *
 * 两边的矩形都必须是**同一个坐标系**里的读数：先量旧行，改完版面后立刻量新行
 * （列位移的过渡要下一帧才开始走，所以两次读数在同一坐标系里）。
 * 字素数量不一致时按 i 夹取（多出来的字从旧行的最后一个字的位置出发）。
 *
 * @param {Array<{x:number,y:number,w:number,h:number}>} from
 * @param {Array<{x:number,y:number,w:number,h:number}>} to
 * @returns {Array<{dx:number,dy:number,sx:number,sy:number}>} 与 `to` 等长
 */
export function reflowDelta(from, to) {
  const src = from || [];
  const dst = to || [];
  if (!src.length) return dst.map(() => ({ dx: 0, dy: 0, sx: 1, sy: 1 }));
  return dst.map((t, i) => {
    const f = src[Math.min(i, src.length - 1)];
    const sx = t.w > 0 && f.w > 0 ? clamp(f.w / t.w, 0.4, 2.5) : 1;
    const sy = t.h > 0 && f.h > 0 ? clamp(f.h / t.h, 0.4, 2.5) : 1;
    return { dx: round3(f.x - t.x), dy: round3(f.y - t.y), sx: round3(sx), sy: round3(sy) };
  });
}
