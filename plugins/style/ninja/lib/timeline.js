/* ==========================================================================
   ninja/lib/timeline.js — 「水果忍者」的时刻表（纯逻辑，无 DOM）
   --------------------------------------------------------------------------
   把"一句歌词 + 它的字级时间轴"翻译成一次**投掷方案**：

     每枚水果     tossAt ──(抛物线上升 560ms)──▶ apexAt == slashAt ──▶ 两半坠落
     每个字素     fillAt ──(果汁渗开 260ms)──▶ 整字染亮

   为什么顶点必须正好落在字素的起始时刻：抛物线的顶点是"速度为 0 的那一刻"，
   把它对在起唱点，读起来就是**水果被抛到位、刀同时到**。再往后就是切开与下坠，
   而果汁正好落在下面那个字上 —— 整条链只有一个时间输入（`words`）。

   还有一个第二输入：**间奏**。末字唱完到下一句之间超过 3.2s 就抛一枚炸弹，
   引线从头烧到尾，下一句开口时炸开。炸弹不惩罚任何人（这是播放器，不是游戏），
   它只是把"这段空白有多长"变成看得见的东西。

   ★ 契约上没有 `flux`：频谱通量要自己从 `ctx.spectrum().bands` 算（见 util.fluxOf），
     拍点检测也要自己写 —— 这一款不用拍点，只用低频与通量，够用。
   ========================================================================== */

/** 单字时长的上限（合成的字级时间轴；长间奏里不许一个字慢慢亮几十秒） */
export const MAX_CHAR_MS = 420;
/** 单字时长的下限（避免半拍内的两个字挤在同一帧） */
export const MIN_CHAR_MS = 60;
/** 抛出到顶点（= 切开）的飞行时长 */
export const TOSS_MS = 560;
/** 顶点与"切"之间的极小延迟：让顶点那一下看得见 */
export const SLASH_DELAY_MS = 40;
/** 果汁把一个字染满的时长 */
export const FILL_MS = 260;
/** 两半的存活时长（之后从池子里回收） */
export const HALF_LIFE_MS = 1900;
/** 末字没有下一字可参照时的兜底时长 */
export const TAIL_MS = 400;
/** 末字唱完到下一句超过这个间隔 → 抛炸弹 */
export const BOMB_GAP_MS = 3200;
/** 炸弹从案板升到悬停位的时间 */
export const BOMB_RISE_MS = 900;
/** 连击窗口：两次切开间隔小于它就继续连 */
export const COMBO_GAP_MS = 1500;
/** 连击读数留白：超过它就归零（不显示一个早就断掉的连击） */
export const COMBO_IDLE_MS = 2600;
/** 每一刀的基础分；连击档乘上去（封顶 9 档） */
export const SCORE_PER_CUT = 10;

/* --------------------------------------------------------------------------
   字素分类与时长权重（与合成时间轴共用一套口径）
   -------------------------------------------------------------------------- */

export function classify(ch) {
  const c = String(ch ?? "");
  if (!c) return "space";
  if (/\s/.test(c)) return "space";
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(c)) return "cjk";
  if (/[0-9]/.test(c)) return "digit";
  if (/[a-z]/i.test(c)) return "latin";
  return "punct";
}

export function charWeight(ch) {
  switch (classify(ch)) {
    case "cjk":
      return 1;
    case "digit":
      return 0.6;
    case "latin":
      return 0.55;
    case "punct":
      return 0.15;
    default:
      return 0;
  }
}

export function median(list) {
  const a = (Array.isArray(list) ? list : []).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** 字素数组归一化：允许传数组、允许传个数、允许什么都不传 */
export function graphemesOf(text, split) {
  const t = String(text ?? "");
  if (!t) return [];
  if (typeof split === "function") {
    const arr = split(t);
    if (Array.isArray(arr) && arr.length) return arr;
  }
  return Array.from(t);
}

/**
 * 一行 → 逐字素的 [起点, 终点]。
 *
 * `words` 长度与字素数**对不上就整行退回合成**：宁可平均分配，
 * 也绝不能错位点亮（多语言行的 `words` 只对应原文那一半，是最常见的错位来源）。
 */
export function timedLine(line, nextLine, { chars = null, count = 0, text = "" } = {}) {
  const arr = Array.isArray(chars) && chars.length ? chars : graphemesOf(text || line?.text, null);
  const n = arr.length || Math.max(0, Math.round(Number(count) || 0));
  const t0 = Math.max(0, Number(line?.time) || 0);
  const rawNext = Number(nextLine?.time);
  const next = Number.isFinite(rawNext) && rawNext > t0 ? rawNext : Infinity;
  const words = Array.isArray(line?.words) ? line.words.map((v) => Number(v) || 0) : null;
  const starts = new Array(n);
  const ends = new Array(n);
  let synth = true;

  if (n > 0 && words && words.length === n) {
    synth = false;
    let prev = -Infinity;
    for (let k = 0; k < n; k += 1) {
      // 倒挂的起点要被抹平（否则会出现负时长）
      const s = Math.max(Number.isFinite(prev) ? prev : 0, words[k], t0);
      starts[k] = s;
      prev = s;
    }
    const tail = Math.max(tailMsFromWords(starts), 1);
    for (let k = 0; k < n; k += 1) {
      const nextStart = k + 1 < n ? starts[k + 1] : Number.POSITIVE_INFINITY;
      const cap = Number.isFinite(next) ? next : Number.POSITIVE_INFINITY;
      ends[k] = Math.min(Number.isFinite(nextStart) ? nextStart : starts[k] + tail, cap);
      if (!(ends[k] > starts[k])) ends[k] = starts[k] + tail;
    }
  } else if (n > 0) {
    const weights = arr.length ? arr.map(charWeight) : new Array(n).fill(1);
    let total = weights.reduce((a, b) => a + b, 0);
    if (!(total > 0)) {
      for (let k = 0; k < n; k += 1) weights[k] = 1;
      total = n;
    }
    const gap = Number.isFinite(next) ? Math.max(0, next - t0) : MAX_CHAR_MS * n;
    // 长间奏里不许一个字慢慢亮几十秒：总量封顶 = 单字上限 × 字数
    const spread = Math.max(MIN_CHAR_MS, Math.min(gap, MAX_CHAR_MS * n));
    const unit = spread / total;
    const dur = new Array(n);
    for (let k = 0; k < n; k += 1) {
      dur[k] = Math.max(MIN_CHAR_MS, Math.min(MAX_CHAR_MS, (weights[k] || 0) * unit));
    }
    starts[0] = t0;
    for (let k = 1; k < n; k += 1) starts[k] = starts[k - 1] + dur[k - 1];
    for (let k = 0; k < n; k += 1) {
      ends[k] = k + 1 < n ? starts[k + 1] : starts[k] + dur[k];
    }
  }

  // words 可能越过下一句的开始（重叠的两行歌词）：夹回去，不能"唱到下一句里去"
  if (n > 0 && Number.isFinite(next)) {
    for (let k = 0; k < n; k += 1) {
      if (starts[k] >= next) starts[k] = Math.max(t0, next - 20);
      if (ends[k] > next) ends[k] = next;
      if (!(ends[k] > starts[k])) ends[k] = starts[k] + MIN_CHAR_MS;
    }
  }
  return {
    count: n,
    chars: arr,
    starts,
    ends,
    synth,
    lineStart: t0,
    lineEnd: n ? ends[n - 1] : t0,
    nextStart: next,
  };
}

/** 末字时长兜底：相邻正间隔的中位数（不被长音拖走） */
function tailMsFromWords(starts) {
  const gaps = [];
  for (let k = 1; k < starts.length; k += 1) {
    const d = starts[k] - starts[k - 1];
    if (d > 0) gaps.push(d);
  }
  const m = median(gaps);
  return m > 0 ? Math.min(m, MAX_CHAR_MS * 2) : TAIL_MS;
}

/**
 * 一字素一枚水果：投掷/顶点/切开三时刻。
 * `apexAt == slashAt`：水果到顶那一下就是被切的那一下。
 */
export function throwAt(starts, k, { tossMs = TOSS_MS, slashDelayMs = SLASH_DELAY_MS } = {}) {
  const slashAt = (Number(starts?.[k]) || 0) + Math.max(0, Number(slashDelayMs) || 0);
  return {
    apexAt: slashAt,
    slashAt,
    tossAt: slashAt - Math.max(60, Number(tossMs) || TOSS_MS),
    fillAt: Number(starts?.[k]) || 0,
  };
}

/** 一行的完整方案（skin.js 只认这一个入口） */
export function planLine(line, nextLine, opts = {}) {
  const tl = timedLine(line, nextLine, opts);
  const throws = [];
  for (let k = 0; k < tl.count; k += 1) throws.push(throwAt(tl.starts, k, opts));
  const bomb = bombPlan(tl, nextLine, opts);
  return { ...tl, throws, bomb };
}

/**
 * 间奏炸弹：末字唱完 → 下一句开口之间的空白。
 *
 * 升到悬停位之后**停在那里**（引线继续烧），所以 60 秒的间奏也一直有东西可看，
 * 而不是"抛上去 3 秒、剩下 57 秒空舞台"。
 */
export function bombPlan(tl, nextLine, { gapMs = BOMB_GAP_MS, riseMs = BOMB_RISE_MS } = {}) {
  const next = Number(nextLine?.time);
  if (!Number.isFinite(next)) return null;
  const from = Number(tl?.lineEnd) || 0;
  const gap = next - from;
  if (!(gap >= Math.max(600, Number(gapMs) || BOMB_GAP_MS))) return null;
  const riseAt = from + Math.min(320, gap * 0.15);
  const apexAt = Math.min(next - 120, riseAt + Math.max(200, Number(riseMs) || BOMB_RISE_MS));
  return { riseAt, apexAt, detonateAt: next, gapMs: gap };
}

/* --------------------------------------------------------------------------
   播放钟 / 行号
   -------------------------------------------------------------------------- */

/**
 * 把 4Hz 且被量化到 250ms 的进度补丁变成连续位置。
 * `maxExtrapolate` 是"补丁不来就冻住"的上限 —— 没有它的时候，一次卡顿会让
 * 画面自己往前跑到歌还没唱到的地方。
 */
export function createClock(opts = {}) {
  const maxExtrapolate = Number.isFinite(opts.maxExtrapolate) ? opts.maxExtrapolate : 1200;
  return {
    pos: 0,
    at: 0,
    playing: true,
    set(pos, playing, now) {
      this.pos = Math.max(0, Number(pos) || 0);
      this.playing = playing !== false;
      this.at = Number(now) || 0;
    },
    value(now) {
      const t = Number(now) || 0;
      if (!this.playing) return this.pos;
      const dt = Math.min(Math.max(0, t - this.at), maxExtrapolate);
      return this.pos + dt;
    },
  };
}

/** 当前行：最后一条 time ≤ pos（lines 已按时间升序；第一句之前是 -1） */
export function lineIndexAt(lines, pos) {
  const list = Array.isArray(lines) ? lines : [];
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((Number(list[mid]?.time) || 0) <= pos) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function nextLineTime(lines, index) {
  const list = Array.isArray(lines) ? lines : [];
  const t = Number(list[index + 1]?.time);
  return Number.isFinite(t) && t > 0 ? t : Infinity;
}

/* --------------------------------------------------------------------------
   连击（纯状态机：只吃"切开的时刻"，不碰画面）
   -------------------------------------------------------------------------- */

/**
 * 连击与分数。
 *
 * ★ 只有**歌驱动的切开**计入连击：指针划过水果提前切开会爆果汁，
 *   但不加连击/分数 —— 否则读数就不再是"这首歌的节奏"了。
 */
export function createCombo({ gapMs = COMBO_GAP_MS, idleMs = COMBO_IDLE_MS, perCut = SCORE_PER_CUT } = {}) {
  return {
    combo: 0,
    best: 0,
    cuts: 0,
    score: 0,
    lastAt: -Infinity,
    pushAt(pos) {
      const t = Number(pos) || 0;
      this.cuts += 1;
      this.combo = t - this.lastAt <= gapMs ? this.combo + 1 : 1;
      this.lastAt = t;
      this.best = Math.max(this.best, this.combo);
      this.score += perCut * Math.min(9, this.combo);
      return this.combo;
    },
    value(t) {
      const now = Number(t) || 0;
      const live = now - this.lastAt <= idleMs;
      return { combo: live ? this.combo : 0, best: this.best, cuts: this.cuts, score: this.score, live };
    },
    reset() {
      this.combo = 0;
      this.best = 0;
      this.cuts = 0;
      this.score = 0;
      this.lastAt = -Infinity;
    },
  };
}
