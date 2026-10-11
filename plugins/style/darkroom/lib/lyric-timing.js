/* ==========================================================================
   lyric-timing.js — 歌词时序（**纯函数，无 DOM**）
   --------------------------------------------------------------------------
   暗房的画面有两处"时间"：

     1. **播放时钟**：宿主每 ~4Hz 推一次进度、且位置按 250ms 量化。直接吃它
        会一跳一跳，所以要用墙钟把两次推送之间填满（clock.at(now)）；
     2. **逐字点亮**：歌词行带 `words`（每个字素一个起始毫秒）时按它点亮，
        没有就退回"整行线性插值"（与市面 LRC 播放器一致）。

   这两个都是可测的纯逻辑，所以单独成模块 —— 播放链路里最容易写错的就是它们。
   与包内其它 lib 一样：**不 import**（相对 import 会丢 /skins 的 token）。
   ========================================================================== */

/** 夹到 0..1 */
function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * 当前高亮行下标。position 早于第一行时返回 -1（"还没到第一句"）。
 *
 * 用二分：一首歌几百行、每帧都要问一次，线性扫在这个位置不值得。
 *
 * @param {{time?:number}[]|null} lines
 * @param {number} positionMs
 * @returns {number} 下标，或 -1
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
 * 播放时钟：把宿主 4Hz 的量化位置，用墙钟外推成连续值。
 *
 * 语义（和契约里其它皮肤的做法一致）：
 *   · `set(position, playing, now)` 每次收到 progress / state 补丁时调用 ——
 *     这是一次"对齐"，把外推基准钉回宿主的权威值；
 *   · `at(now)` 读当前值：播放中外推、暂停时原样返回；
 *   · 外推有上限（maxExtrapolateMs）：补丁长时间不来（切后台、卡顿）时宁可
 *     停住，也不要让画面比音乐跑出去太远。
 *
 * @param {{maxExtrapolateMs?: number}} [opts]
 */
export function createClock(opts = {}) {
  const maxExtra = Math.max(0, Number(opts.maxExtrapolateMs) || 1200);
  let pos = 0;
  let at = 0;
  let playing = false;
  let seen = false;

  return {
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
    /** 宿主最后一次给的权威位置（不外推） */
    peek() {
      return pos;
    },
    get playing() {
      return playing;
    },
  };
}

/**
 * 一行里每个字素的点亮进度（0..1，按 steps 量化）。
 *
 * 两条路径：
 *   · 行带 `words` 且**数量与字素数一致** → 按字级时间轴点亮
 *     （第 k 个字的区间是 [words[k], words[k+1])，最后一个字到下一行开始）；
 *   · 否则 → 整行从 line.time 到下一行 time 线性插值，再把进度摊到字素上。
 *
 * 数量不一致时**必须**走线性路径：words 的下标一旦错位，整行都会点错字。
 *
 * @param {number} count 字素个数
 * @param {{time?:number, words?:number[]}|null} line
 * @param {{time?:number}|null} nextLine
 * @param {number} positionMs
 * @param {number} [steps] 量化档数（默认 8）
 * @returns {number[]} 长度 = count，值 ∈ {0, 1/steps, ..., 1}
 */
export function graphemeProgress(count, line, nextLine, positionMs, steps = 8) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const out = new Array(n).fill(0);
  if (!n) return out;

  const q = (v) => {
    const s = Math.max(1, Math.floor(Number(steps) || 8));
    return Math.round(clamp01(v) * s) / s;
  };

  const start = Number(line?.time) || 0;
  const nextTime = Number(nextLine?.time);
  const end = Number.isFinite(nextTime) && nextTime > start ? nextTime : start + 4000;

  const words = Array.isArray(line?.words) && line.words.length === n ? line.words : null;

  if (words) {
    // 最后一个字的**时长**在增强 LRC 里是缺失的（只有起点）。若直接拉到下一行开始，
    // 遇到长间奏最后一个字会在十几秒里慢慢变亮 —— 看起来就是"卡住了"。
    // 所以用"这一行的典型字长"（相邻起点差的中位数，对拖长音不敏感）当它的时长，
    // 并且仍然不超过下一行的起点。
    let tail = 400;
    const gaps = [];
    for (let k = 1; k < n; k += 1) {
      const g = Number(words[k]) - Number(words[k - 1]);
      if (Number.isFinite(g) && g > 0) gaps.push(g);
    }
    if (gaps.length) {
      gaps.sort((x, y) => x - y);
      tail = gaps[gaps.length >> 1];
    }

    for (let k = 0; k < n; k += 1) {
      const s = Number(words[k]) || 0;
      let e;
      if (k + 1 < n) {
        const raw = Number(words[k + 1]);
        // 下一个字的起点必须严格大于当前字（同秒多字会让区间为 0 → NaN）
        e = Number.isFinite(raw) && raw > s ? raw : Math.max(s + 1, end);
      } else {
        e = Math.max(s + 1, Math.min(end, s + tail));
      }
      out[k] = q((Number(positionMs) - s) / (e - s));
    }
    return out;
  }

  const span = Math.max(1, end - start);
  const lineProgress = (Number(positionMs) - start) / span;
  for (let k = 0; k < n; k += 1) out[k] = q(lineProgress * n - k);
  return out;
}

/**
 * 一行要显示的文本：正文 + 译文（译文已由宿主折叠成一行）。
 *
 * 空行（纯间奏）要**保留**：丢掉它后面的行号就全错位了。
 *
 * @param {{text?:string, trans?:string[]}|null} line
 * @returns {{main:string, trans:string}}
 */
export function displayText(line) {
  const main = String(line?.text ?? "");
  const trans = Array.isArray(line?.trans)
    ? line.trans.map((t) => String(t ?? "").trim()).filter(Boolean)
    : [];
  return { main, trans: trans.join(" · ") };
}
