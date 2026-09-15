// @ts-check
/* ==========================================================================
   lrc.js — LRC 解析与定位
   --------------------------------------------------------------------------
   为什么解析放在皮肤包里：宿主把「歌词文本」交给皮肤（可能是内嵌 / .lrc /
   缓存 / 在线匹配来的），而**怎么把它变成一行行带时间戳的歌词**属于呈现层。
   内置样式共用这一份实现，第三方皮肤也可以直接用（从包入口导出）。

   解析规则（与主流播放器一致）：
     · 一行可以带多个时间标签（`[00:12.00][01:20.00]同一句`），要展开成多行；
     · 分秒是 `mm:ss`，小数部分 `.xx` / `.xxx` / `:xx` 都接受，按毫秒补齐；
     · 没有时间标签的行（作词/作曲之类的元信息行）直接丢掉 —— 它们没有
       时间轴，留在列表里会永远停在高亮不到的位置。
   ========================================================================== */

const TIME_TAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/**
 * LRC 文本 → 按时间升序的 `[{ time, text }]`（time 单位毫秒）。
 * @param {string} text
 * @returns {Array<{time:number,text:string}>}
 */
export function parseLrc(text) {
  if (!text) return [];
  /** @type {Array<{time:number,text:string}>} */
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const times = [];
    TIME_TAG.lastIndex = 0;
    let m;
    while ((m = TIME_TAG.exec(raw))) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(`0.${m[3].padEnd(3, "0")}`) : 0;
      times.push((min * 60 + sec + frac) * 1000);
    }
    const content = raw.replace(TIME_TAG, "").trim();
    if (!times.length || !content) continue;
    for (const t of times) out.push({ time: t, text: content });
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * 二分查找当前播放位置对应的歌词行下标（-1 表示还没到第一句）。
 * @param {Array<{time:number}>} lines
 * @param {number} currentMs
 * @returns {number}
 */
export function findLyricIndex(lines, currentMs) {
  if (!lines || !lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= currentMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
/* ==========================================================================
   编辑用工具（歌词工作台：微调 / 手动打轴）
   --------------------------------------------------------------------------
   下面这些只做「文本 ↔ 结构化行」的纯转换，不碰 DOM，也不认识任何 UI：
   宿主（lyrics-panel.js）与皮肤共用同一套 LRC 规则，避免出现第二份解析。

   为什么必须放在这个包里：parseLrc 已经在这里，而「怎么理解 LRC」一旦有
   两份实现，就会出现「界面里显示的时间」和「实际高亮的时间」不一致。
   ========================================================================== */

/**
 * 把毫秒格式化成 LRC 时间标签。
 *
 * 输出百分秒（`[mm:ss.xx]`）：这是 LRC 事实标准，兼容性最好，
 * 而人耳对 10ms 的差别没有分辨力（内部计算仍然保留毫秒）。
 * 负数钳到 0：负时间标签不是合法 LRC。
 * @param {number} ms
 * @returns {string} 形如 `[01:23.45]`
 */
export function formatLrcTime(ms) {
  const clamped = Math.max(0, Math.round(Number(ms) || 0));
  // 先化成整数百分秒再拆分：直接按秒算会出现 59.999 → "60.00"（非法时间标签）
  const cs = Math.round(clamped / 10);
  const min = Math.floor(cs / 6000);
  const rest = cs - min * 6000;
  const secText = (rest / 100).toFixed(2).padStart(5, "0");
  return `[${String(min).padStart(2, "0")}:${secText}]`;
}

/**
 * LRC 文本 → 编辑用的行列表（**保留没有时间标签的行**）。
 *
 * 与 parseLrc 的区别正是「保留未打轴的行」：渲染时没有时间的行必须丢掉
 * （它永远高亮不到），但编辑时它们是待打轴的内容，丢了就没法打轴了。
 * 一行带多个时间标签时展开成多行（与 parseLrc 一致）。
 *
 * @param {string} text
 * @returns {Array<{time: number|null, text: string}>}
 */
export function parseLyricDraft(text) {
  const out = [];
  if (!text) return out;
  for (const raw of String(text).split(/\r?\n/)) {
    const times = [];
    TIME_TAG.lastIndex = 0;
    let m;
    while ((m = TIME_TAG.exec(raw))) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(`0.${m[3].padEnd(3, "0")}`) : 0;
      times.push(Math.round((min * 60 + sec + frac) * 1000));
    }
    const content = raw.replace(TIME_TAG, "").trim();
    if (!content) continue;
    if (times.length) {
      for (const t of times) out.push({ time: t, text: content });
    } else {
      out.push({ time: null, text: content });
    }
  }
  return out;
}

/**
 * 行列表 → LRC 文本（按时间升序；没有时间的行不写入）。
 *
 * 没有时间的行**必须丢掉**：LRC 里没有时间标签的行是注释/元信息，
 * 写进去只会让解析器（包括本包自己的 parseLrc）忽略它，白白制造困惑。
 * 所以保存前的「还有 N 行没有时间」提示是必要的（见 lyrics-panel.js）。
 *
 * @param {Array<{time: number|null, text: string}>} lines
 * @returns {string}
 */
export function serializeLrc(lines) {
  return (lines || [])
    .filter((l) => l && l.text && typeof l.time === "number" && Number.isFinite(l.time))
    .slice()
    .sort((a, b) => a.time - b.time)
    .map((l) => `${formatLrcTime(l.time)}${l.text}`)
    .join("\n");
}

/**
 * 整体平移所有时间标签（微调：整首歌提前/延后）。
 *
 * 负数结果钳到 0 而不是丢掉该行 —— 丢掉会让用户「调一下少了三句」，
 * 钳到 0 只是那几句挤在开头，还能看出来并继续调整。
 *
 * @param {string} text LRC 文本
 * @param {number} deltaMs 正数 = 整体延后，负数 = 整体提前
 * @returns {string}
 */
export function shiftLrc(text, deltaMs) {
  const delta = Number(deltaMs) || 0;
  if (!delta) return String(text || "");
  return (text || "")
    .split(/\r?\n/)
    .map((raw) => {
      let any = false;
      // 一行可能有多个时间标签，要逐个平移
      const next = raw.replace(TIME_TAG, (_all, mm, ss, ff) => {
        any = true;
        const base = (Number(mm) * 60 + Number(ss) + (ff ? Number(`0.${String(ff).padEnd(3, "0")}`) : 0)) * 1000;
        return formatLrcTime(base + delta);
      });
      // 没有时间标签的行原样保留（作词/作曲之类的信息行）
      return any ? next : raw;
    })
    .join("\n");
}

/**
 * 最小/最大时间标签（微调面板用它算「还能往前挪多少」）。
 * @param {string} text
 * @returns {{min: number, max: number, count: number}}
 */
export function lrcTimeRange(text) {
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (const line of parseLrc(text)) {
    min = Math.min(min, line.time);
    max = Math.max(max, line.time);
    count += 1;
  }
  if (!count) return { min: 0, max: 0, count: 0 };
  return { min, max, count };
}

/**
 * 重新解析歌词文本时，把「上一版里已经打好的时间」尽量保留下来。
 *
 * 场景：用户打到第 12 行，发现第 3 行有个错别字，回去改了 —— 如果不做匹配，
 * 12 行的时间全没了，这是不能接受的。
 *
 * 规则（简单可预测，不猜语义）：
 *   1. 先按**文本完全相同**认领：同下标优先，其次就近（插入/删除一行时，
 *      后面的时间整体跟着走 —— 这正是期望行为）；「未被占用」保证重复行
 *      （副歌）不会两行抢同一个时间戳；
 *   2. **行数没变**时，剩下没认领到的行按位置补齐 —— 「改一个错别字」
 *      是最常见的编辑，文本已经不同了，只能靠位置认出「还是那一行」；
 *   3. 还认不到的行就不带时间（未打轴）。
 *
 * 第 2 条是**有意的取舍**：如果用户把整份歌词换成另一首、且行数刚好相同，
 * 位置补齐会把旧时间整套复制过去。这是唯一会「错得离谱」的情况，
 * 所以编辑界面必须提供「清空时间」，并在重新解析后把「沿用了几行」告诉用户。
 *
 * @param {Array<{time: number|null, text: string}>} prev 上一版行列表
 * @param {Array<{time: number|null, text: string}>} next 新解析出来的行列表
 * @returns {Array<{time: number|null, text: string}>}
 */
export function mergeDraftTimes(prev, next) {
  const old = Array.isArray(prev) ? prev : [];
  const used = new Array(old.length).fill(false);
  const kept = new Array(next.length).fill(null);

  // 第一轮：文本完全相同
  for (let i = 0; i < next.length; i += 1) {
    if (i < old.length && !used[i] && old[i].text === next[i].text) {
      kept[i] = old[i].time;
      used[i] = true;
      continue;
    }
    // 就近找：先看后面（插入一行的情况），再看前面（删除一行的情况）
    for (let d = 1; d < old.length; d += 1) {
      const a = i + d;
      const b = i - d;
      if (a < old.length && !used[a] && old[a].text === next[i].text) {
        kept[i] = old[a].time;
        used[a] = true;
        break;
      }
      // b 必须同时落在 old 的范围内：used 数组只有 old.length 项，
      // 而 i 可能远大于 old.length（把短草稿换成整首歌词），
      // 少了 b < old.length 会读到 old[b] === undefined 直接抛异常。
      if (b >= 0 && b < old.length && !used[b] && old[b].text === next[i].text) {
        kept[i] = old[b].time;
        used[b] = true;
        break;
      }
    }
  }

  // 第二轮：行数没变 → 剩下的按位置补齐（改错别字）
  if (old.length === next.length) {
    for (let i = 0; i < next.length; i += 1) {
      if (kept[i] === null && !used[i]) {
        kept[i] = old[i].time;
        used[i] = true;
      }
    }
  }

  return next.map((line, i) => ({
    // 新文本自己带了时间标签 → 以文本里的时间为准（用户在文本区手写/粘贴了时间）
    time: typeof line.time === "number" ? line.time : kept[i],
    text: line.text,
  }));
}
