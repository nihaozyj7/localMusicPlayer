/**
 * 塔体几何（纯函数，无 DOM / 无 ctx）。
 *
 * 设计口径：每句歌词 = 一层玻璃板。层号 i 与「镜头层号 c」的差决定它在空间里的位置 ——
 * 镜头下方（还没唱到）的层沿着 Z 轴往上、往两侧铺开，镜头上方（唱过的）往下沉降淡出。
 * JS 每帧只把每层的 `{x,y,z,rot,op,shade}` 写进 CSS 变量，剩下的交给合成器（transform 不参与布局）。
 *
 * 单位：x/y/z 都是 CSS px；rot 是 deg；op / shade 是 0..1。
 */

/** 一层的基准几何参数（由清单与窗口尺寸推出来的"塔形"） */
export const SHAPE = {
  /** 层与层之间的 Z 间距（越大越"深"） */
  stepZ: 190,
  /** 层与层之间的 Y 间距 */
  stepY: 108,
  /** 螺旋半径（绕 Y 轴转一个小角度的同时沿 X 偏移） */
  radius: 92,
  /** 每层绕 Y 轴的旋转量（deg）—— 四层转一圈 */
  turn: 5.5,
  /** 远处层的缩放系数（透视之外的额外压缩，让塔看起来"收"进雾里） */
  farScale: 0.9,
  /** 镜头前后各保留多少层参与几何计算（DOM 窗口化的上限） */
  halfWindow: 12,
  /** 性能档的窗口 */
  halfWindowPerf: 6,
  /** 透视距离（写进 CSS 的 --sp-persp） */
  perspective: 900,
  /** 一层在屏幕上占据的"可见"比例（超出就淡出 → 窗口化不会突然消失） */
  fadeStart: 6,
  fadeEnd: 11,
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
/** +0 是为了把 -0 归一成 0（-0 在断言与 CSS 字符串里都是噪音） */
export const round3 = (v) => Math.round(v * 1000) / 1000 + 0;

/**
 * 层 i 相对镜头层 c 的几何。
 * @param {number} i 层号（0 起）
 * @param {number} c 镜头所在的层号（可以是小数：飞行途中）
 * @param {object} [shape] 覆盖 SHAPE
 * @param {number} [dy] 额外的镜头纵向偏移（层间插值时用）
 * @returns {{x:number,y:number,z:number,rot:number,scale:number,sign:number}}
 */
export function cardGeometry(i, c, shape = SHAPE, dy = 0) {
  const d = i - c; // >0 = 还没唱到（在镜头下方）
  const sign = d === 0 ? 0 : d > 0 ? 1 : -1;
  // 螺旋：层号差直接当角度用（不额外乘 sign —— 否则 ±d 会落到同一侧，螺旋退化成一条直线），
  // 于是"唱过的"与"还没唱到的"分列轴线两侧，正面看是一个螺旋上升的塔。
  const ang = (d * shape.turn * Math.PI) / 180;
  const z = -d * shape.stepZ;
  const x = Math.sin(ang) * shape.radius;
  const y = -d * shape.stepY + dy;
  // 越远越小（透视已经会缩放，这里只补一点点，避免远处层"炸"到屏幕外）
  const far = Math.abs(d) > 0 ? 1 - (1 - shape.farScale) * clamp01(Math.abs(d) / shape.fadeEnd) : 1;
  return { x: round3(x), y: round3(y), z: round3(z), rot: round3(-d * shape.turn), scale: round3(far), sign };
}

/**
 * 一层的可见度：镜头附近 1，越远越淡（窗口化时靠它收尾，而不是"啪"地消失）。
 * @returns {number} 0..1
 */
export function cardOpacity(dist, shape = SHAPE) {
  const a = Math.abs(dist);
  if (a <= shape.fadeStart) return 1;
  if (a >= shape.fadeEnd) return 0;
  return round3(1 - (a - shape.fadeStart) / (shape.fadeEnd - shape.fadeStart));
}

/** 深度着色：远处的层更暗更冷（0 = 最近，1 = 最远） */
export function depthShade(dist, shape = SHAPE) {
  return round3(clamp01(Math.abs(dist) / shape.fadeEnd));
}

/**
 * DOM 窗口：只保留 [c-half, c+half] 之间的层。
 * @returns {{from:number,to:number,count:number}}
 */
export function visibleRange(c, total, half = SHAPE.halfWindow) {
  const center = Math.round(c);
  const from = Math.max(0, center - half);
  const to = Math.min(total - 1, center + half);
  return { from, to, count: Math.max(0, to - from + 1) };
}

/** 性能档 / 静态档的窗口取值 */
export function halfWindowFor(opts = {}) {
  if (opts.performanceMode === "performance") return SHAPE.halfWindowPerf;
  if (opts.narrow) return Math.min(SHAPE.halfWindow, 8);
  return SHAPE.halfWindow;
}

/**
 * 换层的飞行时长（ms）：由"这两句之间的间隔"反算 ——
 * 长留白 → 慢慢爬（有段落感）；快节奏 → 干脆利落地跳过去。
 * @param {number} gapMs 相邻两行的时间差
 * @param {object} [cfg]
 * @returns {number} 600..1400
 */
export function flightDuration(gapMs, cfg = {}) {
  const min = cfg.min ?? 600;
  const max = cfg.max ?? 1400;
  const fast = cfg.fastGap ?? 1200;
  const slow = cfg.slowGap ?? 6000;
  if (!Number.isFinite(gapMs) || gapMs <= 0) return min;
  const t = clamp01((gapMs - fast) / (slow - fast));
  return Math.round(lerp(min, max, t));
}

/** 缓动：飞行用「先快后稳」的 easeOutCubic */
export function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/**
 * 把「上一句」到「这一句」的飞行算成当前镜头层号。
 * @param {number} from 起始层号
 * @param {number} to 目标层号
 * @param {number} elapsedMs 已经飞了多久
 * @param {number} durationMs 总共飞多久
 * @returns {{cam:number,done:boolean,t:number}}
 */
export function flightAt(from, to, elapsedMs, durationMs) {
  if (durationMs <= 0) return { cam: to, done: true, t: 1 };
  const t = clamp01(elapsedMs / durationMs);
  const e = easeOutCubic(t);
  return { cam: from + (to - from) * e, done: t >= 1, t: round3(t) };
}

/**
 * 窄窗口 / 性能档的塔形收缩：间距与透视一起收，避免层飞出屏幕。
 * @returns {{stepZ:number,stepY:number,radius:number,turn:number,perspective:number}}
 */
export function shapeFor({ width = 1280, performanceMode = "smooth", narrow = false } = {}) {
  const w = Number.isFinite(width) && width > 0 ? width : 1280;
  // 宽度系数：窄窗口把层间距与半径一起压到 0.7 左右
  const k = clamp(w / 1280, 0.62, 1.15);
  const perf = performanceMode === "performance" ? 0.88 : 1;
  // ⚠ 必须是**完整**塔形（先摊开 SHAPE 再覆盖）：缺了 farScale / fadeStart / fadeEnd，
  //   cardGeometry 会算出 scale=NaN，整条 transform 就成了非法值 —— CSS 直接忽略，
  //   表现是"所有层叠在同一个位置"，而且控制台一声不吭。自检里有这条防线。
  return {
    ...SHAPE,
    stepZ: Math.round(SHAPE.stepZ * (narrow ? 0.8 : 1) * perf),
    stepY: Math.round(SHAPE.stepY * k),
    radius: Math.round(SHAPE.radius * k),
    turn: round3(SHAPE.turn * (narrow ? 0.4 : 1)),
    perspective: Math.round(SHAPE.perspective * clamp(w / 1280, 0.72, 1.1)),
  };
}

/**
 * 逐字进度：每个字素的点亮量。
 * `words` 是字素起点（ms）数组，长度必须与 `graphemes` 对齐；不齐就整行一起亮（返回全 1 或全 0）。
 * 末字结束时间 = 行尾（若行尾未知）与「末字起点 + tail」取小 —— 与暗房/拓印同一套规则。
 * @param {number[]} words 每个字素的起始时间（ms）
 * @param {number} count 字素数
 * @param {number} pos 当前播放位置（ms）
 * @param {object} [opts] { lineEnd, tail }
 * @returns {number[]} 长度 count 的 0..1 数组
 */
export function unitLevels(words, count, pos, opts = {}) {
  const tail = opts.tail ?? 400;
  const out = new Array(count).fill(0);
  if (!count) return out;
  if (!Array.isArray(words) || words.length !== count) {
    const on = Number.isFinite(pos) ? 1 : 0;
    return out.fill(on);
  }
  // 末字时长：相邻正间隔的中位数（回退 tail）
  const gaps = [];
  for (let i = 1; i < words.length; i += 1) {
    const g = words[i] - words[i - 1];
    if (g > 0) gaps.push(g);
  }
  let step = tail;
  if (gaps.length) {
    const s = gaps.slice().sort((a, b) => a - b);
    step = s[Math.floor(s.length / 2)];
  }
  const lineEnd = Number.isFinite(opts.lineEnd) && opts.lineEnd > 0 ? opts.lineEnd : Infinity;
  for (let i = 0; i < count; i += 1) {
    const start = words[i];
    const next = i + 1 < count ? words[i + 1] : Math.min(lineEnd, start + step);
    const span = Math.max(1, next - start);
    out[i] = round3(clamp01((pos - start) / span));
  }
  return out;
}

/** 当前行下标：pos 落在哪一行（lines[].time 递增；pos 小于第一行返回 0） */
export function lineIndexAt(lines, pos) {
  if (!Array.isArray(lines) || !lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  if (pos < lines[0].time) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid].time <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** 下一行的开始时间（没有下一行 → null） */
export function nextLineTime(lines, index) {
  if (!Array.isArray(lines)) return null;
  const n = lines[index + 1];
  return n && Number.isFinite(n.time) ? n.time : null;
}

/** 层号高亮判定的容差（浮点层号） */
export function isCurrent(camIndex, i, tol = 0.35) {
  return Math.abs(camIndex - i) <= tol;
}

/** 时间码 mm:ss */
export function timecode(ms) {
  const t = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
