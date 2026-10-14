/* ==========================================================================
   timing.js — 时间（**纯逻辑，无 DOM**）
   --------------------------------------------------------------------------
   铅字盘上有两个钟，绝不能混：

     1. **播放钟**（`createClock`）：宿主的 progress 补丁只有 ~4Hz，而且位置被
        量化到 250ms。不插值就是"字一跳一跳地亮"。用墙钟外推，并且有上限 ——
        补丁长时间不来（切后台、卡顿）时宁可冻住，也不要让字比声音先唱完。
     2. **字级时刻表**（`timedLine`）：一个字素一个起点。**只有增强 LRC 才有**
        （`line.words`，每个字素一个起始毫秒）。普通 LRC 只有行时间 —— 那就
        按字素类别加权合成一条，否则整篇歌词都只能"整行一起亮"。

   ★ 合成的那条必须有**上限**：一句 12 字的歌词跨 8 秒时，不加限制的话每字
     666ms，最后一个字会在间奏里慢慢亮十几秒 —— 看起来就像卡住了。所以单字
     时长封顶（`MAX_CHAR_MS`），唱完就停住等下一句；末字另有兜底（取相邻起点
     差的中位数，长间奏不吃亏）。
   ========================================================================== */

/** 单字时长上限（ms）：超过就"唱完停住"，不要拖到下一句 */
export const MAX_CHAR_MS = 420;
/** 落版动画时长（ms）：一个字从凹痕亮满所需的时间 */
export const REVEAL_MS = 180;
/** 没有下一行时，本行按这么长估算 */
export const TAIL_SPAN_MS = 4000;
/** 末字兜底时长（找不到相邻间距时用） */
export const TAIL_CHAR_MS = 400;

/**
 * 播放钟：把 4Hz 的量化位置用墙钟外推成连续值。
 * @param {{maxExtrapolateMs?: number}} [opts]
 */
export function createClock(opts = {}) {
  const maxExtra = Math.max(0, Number(opts.maxExtrapolateMs) || 1200);
  let pos = 0;
  let at = 0;
  let playing = false;
  let seen = false;
  return {
    /**
     * 宿主给了一次权威位置（每次 progress / state 补丁都调）。
     * @param {number} positionMs @param {boolean} isPlaying @param {number} nowMs
     */
    set(positionMs, isPlaying, nowMs) {
      const p = Number(positionMs);
      if (Number.isFinite(p)) pos = p;
      at = Number(nowMs) || 0;
      playing = Boolean(isPlaying);
      seen = true;
    },
    /** @param {number} nowMs @returns {number} */
    at(nowMs) {
      if (!seen || !playing) return pos;
      const extra = Math.min(maxExtra, Math.max(0, (Number(nowMs) || 0) - at));
      return pos + extra;
    },
    peek() {
      return pos;
    },
    get playing() {
      return playing;
    },
  };
}

/**
 * 字素类别：决定合成时间轴的权重，也决定竖排里哪些字要整体旋转。
 * @param {string} ch
 * @returns {"cjk"|"latin"|"digit"|"punct"|"space"}
 */
export function classify(ch) {
  const c = String(ch ?? "");
  if (!c) return "space";
  const cp = c.codePointAt(0) || 0;
  if (/\s/.test(c)) return "space";
  if (cp >= 0x30 && cp <= 0x39) return "digit";
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return "latin";
  if (
    (cp >= 0x2e80 && cp <= 0x9fff) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xff60)
  ) {
    // 全角标点（U+3000~303F / FF01~FF60 里的标点）单独算标点
    if (cp >= 0x3000 && cp <= 0x303f) return "punct";
    if (cp >= 0xff01 && cp <= 0xff20) return "punct";
    if (cp >= 0xff3b && cp <= 0xff40) return "punct";
    if (cp >= 0xff5b && cp <= 0xff65) return "punct";
    return "cjk";
  }
  return "punct";
}

/**
 * 合成时间轴的权重：中文一字一拍，拉丁短一些，标点几乎不占时间，空格不占。
 * @param {string} ch
 * @returns {number}
 */
export function charWeight(ch) {
  switch (classify(ch)) {
    case "cjk":
      return 1;
    case "latin":
      return 0.55;
    case "digit":
      return 0.6;
    case "punct":
      return 0.15;
    default:
      return 0;
  }
}

/**
 * 相邻起点差的中位数 —— 末字兜底时长用它（对拖长音不敏感）。
 * @param {number[]} starts
 * @returns {number}
 */
export function medianGap(starts) {
  const gaps = [];
  for (let k = 1; k < starts.length; k += 1) {
    const g = Number(starts[k]) - Number(starts[k - 1]);
    if (Number.isFinite(g) && g > 0) gaps.push(g);
  }
  if (!gaps.length) return TAIL_CHAR_MS;
  gaps.sort((a, b) => a - b);
  return gaps[gaps.length >> 1];
}

/**
 * 一行的字级时刻表。
 *
 * @param {{time?:number, words?:number[], text?:string}} line
 * @param {{time?:number}|null} next
 * @param {{chars?: string[], count?: number, maxCharMs?: number}} [opts]
 *   `chars` 给了就用它算权重（与 `words` 的下标口径一致）。
 * @returns {{starts:number[], ends:number[], count:number, synth:boolean, span:number, tail:number}}
 */
export function timedLine(line, next, opts = {}) {
  const start = Number(line?.time) || 0;
  const nextTime = Number(next?.time);
  const end = Number.isFinite(nextTime) && nextTime > start ? nextTime : start + TAIL_SPAN_MS;
  const count = Math.max(
    0,
    Math.floor(Number(opts.count ?? (Array.isArray(opts.chars) ? opts.chars.length : 0)) || 0)
  );
  /** @type {number[]} */
  const starts = new Array(count).fill(start);
  /** @type {number[]} */
  const ends = new Array(count).fill(start);
  if (!count) return { starts, ends, count: 0, synth: false, span: 0, tail: TAIL_CHAR_MS };

  const maxChar = Math.max(40, Number(opts.maxCharMs) || MAX_CHAR_MS);
  const words = Array.isArray(line?.words) && line.words.length === count ? line.words : null;

  if (words) {
    for (let k = 0; k < count; k += 1) starts[k] = Number(words[k]) || start;
    // 起点必须单调不减（同秒多字会让区间为 0）
    for (let k = 1; k < count; k += 1) if (starts[k] < starts[k - 1]) starts[k] = starts[k - 1];
    const tail = medianGap(starts);
    for (let k = 0; k < count; k += 1) {
      if (k + 1 < count) {
        const raw = starts[k + 1];
        ends[k] = raw > starts[k] ? raw : Math.max(starts[k] + 1, Math.min(end, starts[k] + maxChar));
      } else {
        ends[k] = Math.max(starts[k] + 1, Math.min(end, starts[k] + Math.min(tail, maxChar)));
      }
    }
    return { starts, ends, count, synth: false, span: Math.max(0, end - start), tail };
  }

  /* 合成：按权重摊到 [start, end)，单字封顶后就停下等下一句（见文件头注释） */
  const chars = Array.isArray(opts.chars) ? opts.chars : null;
  let totalW = 0;
  const w = new Array(count);
  for (let k = 0; k < count; k += 1) {
    w[k] = chars ? charWeight(chars[k]) : 1;
    totalW += w[k];
  }
  if (totalW <= 0) {
    for (let k = 0; k < count; k += 1) w[k] = 1;
    totalW = count;
  }
  const per = Math.min(maxChar, Math.max(1, (end - start) / totalW));
  let acc = 0;
  for (let k = 0; k < count; k += 1) {
    starts[k] = start + acc * per;
    acc += w[k];
    ends[k] = Math.min(end, start + acc * per);
    if (ends[k] <= starts[k]) ends[k] = starts[k] + Math.min(maxChar, per);
  }
  return { starts, ends, count, synth: true, span: Math.max(0, end - start), tail: per };
}

/**
 * 已唱到第几个字素。
 * @param {number[]} starts @param {number} ms
 * @returns {number}
 */
export function litCount(starts, ms) {
  if (!Array.isArray(starts) || !starts.length) return 0;
  const t = Number(ms) || 0;
  let n = 0;
  for (let k = 0; k < starts.length; k += 1) if (starts[k] <= t) n += 1;
  return n;
}

/** 缓出：落版用（进去快、落定慢） */
export function easeOutCubic(x) {
  const t = Math.max(0, Math.min(1, Number(x) || 0));
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 每个字素的"落版"进度（0..1）。量化到 steps 档 —— 每帧写 DOM/画布之前先比对，
 * 值没变就不重画（静止的句子零成本）。
 * @param {number[]} starts @param {number} ms
 * @param {{durMs?:number, steps?:number}} [opts]
 * @returns {number[]}
 */
export function revealProgress(starts, ms, opts = {}) {
  const dur = Math.max(1, Number(opts.durMs) || REVEAL_MS);
  const steps = Math.max(1, Math.floor(Number(opts.steps) || 16));
  const t = Number(ms) || 0;
  const out = new Array(Array.isArray(starts) ? starts.length : 0).fill(0);
  for (let k = 0; k < out.length; k += 1) {
    const p = (t - starts[k]) / dur;
    const q = Math.round(Math.max(0, Math.min(1, p)) * steps) / steps;
    out[k] = q;
  }
  return out;
}

/**
 * 墨点晕开（落版那一瞬的一圈墨）：p=0 与 p=1 都是 0，中途最大。
 * @param {number} p
 */
export function inkBloom(p) {
  const t = Number(p) || 0;
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * t);
}

/**
 * 当前高亮行（二分；position 早于第一行时返回 -1）。
 * @param {{time?:number}[]|null} lines @param {number} positionMs
 * @returns {number}
 */
export function lineIndexAt(lines, positionMs) {
  if (!Array.isArray(lines) || !lines.length) return -1;
  const pos = Number(positionMs) || 0;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = Number(lines[mid]?.time) || 0;
    if (t <= pos) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * 曲末：最后一句唱完这么久之后，拉远看全貌（这是"歌词展示器"的收尾）。
 * @param {{time?:number}[]|null} lines @param {number} ms @param {number} [holdMs]
 * @returns {boolean}
 */
export function isFinale(lines, ms, holdMs = 6000) {
  if (!Array.isArray(lines) || !lines.length) return false;
  const last = Number(lines[lines.length - 1]?.time) || 0;
  return (Number(ms) || 0) > last + holdMs;
}

/**
 * 长间奏：当前句与下一句之间空得太久（拉远、漂移用）。
 * @param {{time?:number}[]|null} lines @param {number} index @param {number} [gapMs]
 * @returns {boolean}
 */
export function isInterlude(lines, index, gapMs = 7000) {
  if (!Array.isArray(lines) || index < 0 || index >= lines.length - 1) return false;
  const a = Number(lines[index]?.time) || 0;
  const b = Number(lines[index + 1]?.time) || 0;
  return b - a > gapMs;
}
