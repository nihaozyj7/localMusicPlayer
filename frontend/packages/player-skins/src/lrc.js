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
       时间轴，留在列表里会永远停在高亮不到的位置；
     · **同一时间戳上的多行是多语言歌词**（原唱 + 翻译 / 罗马音，两行用同一个
       `[22:22]` 标签），合成一行：第一行做主行 `text`，其余进 `trans`。
       不合并的后果是实打实的：`findLyricIndex` 只会命中最后一行，前面几种
       语言会被当成「已经唱过去的上一句」瞬间变暗，看起来就是多语言歌词在
       跳行、闪一下就没。
     · **字级（逐字）歌词**：行内带逐字时间戳时，行上多一个 `words`
       （每个**字素**一个起始毫秒，与 `splitGraphemes(text)` 一一对应），
       渲染层据此按字点亮；没有逐字时间轴的行**不带**这个键（形状与以前
       完全一样）。后端已经在读进来时把 QRC / KRC / YRC / klyric 归一化成
       增强 LRC（见 Go 侧 internal/lyrics/wordlevel.go），这里再认一遍是
       渲染层的最后一道防线（例如用户把 QRC 原文粘进歌词工作台的瞬间）。
   ========================================================================== */

const TIME_TAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** 行首时间标签（sticky：只吃行首连续的那几个，行内再出现的是字级标记） */
const HEAD_TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/y;
/** QRC / KRC / YRC 的行标签：[起始毫秒,时长] */
const HEAD_MS_TAG = /\[(\d{1,7}),(\d{1,7})\]/y;
/** 字级标记（时间形态）：<00:12.000> */
const WORD_TIME_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

/**
 * 把一行文本切成「字素单元」（保留空白，位置对得上）。
 *
 * 为什么必须全仓共用这一份：`line.words` 的下标就是按它排的，
 * 渲染层用另一套切法（或另一个分词粒度）就会逐字错位。
 * 优先用 Intl.Segmenter（emoji / 组合字符不会被劈成两半），老内核退回 Array.from。
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitGraphemes(text) {
  const s = String(text ?? "");
  if (!s) return [];
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    try {
      const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      return Array.from(seg.segment(s), (part) => part.segment);
    } catch (err) {
      /* 落到下面的兜底 */
    }
  }
  return Array.from(s);
}

/** "m:ss.x" / "m:ss:xx" → 毫秒（整数运算，避免 12.345*1000 的浮点尾数） */
function clockTagMs(s) {
  const colon = s.indexOf(":");
  if (colon <= 0) return null;
  const minPart = s.slice(0, colon);
  let rest = s.slice(colon + 1);
  let frac = "";
  const dot = rest.search(/[.:]/);
  if (dot >= 0) {
    frac = rest.slice(dot + 1);
    rest = rest.slice(0, dot);
  }
  if (!/^\d+$/.test(minPart) || !/^\d+$/.test(rest)) return null;
  let fracMs = 0;
  if (frac) {
    if (!/^\d+$/.test(frac)) return null;
    fracMs = Number(frac.slice(0, 3).padEnd(3, "0"));
  }
  return (Number(minPart) * 60 + Number(rest)) * 1000 + fracMs;
}

/** "a,b" / "a,b,c" → [a, b]（QRC/KRC/YRC 的数字对标记） */
function pairTag(s) {
  const parts = String(s).split(",");
  if (parts.length < 2 || parts.length > 3) return null;
  const a = parts[0].trim();
  const b = parts[1].trim();
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return null;
  return [Number(a), Number(b)];
}

/**
 * 一行歌词 → `{ stamps, text, words }`。
 *
 * 规则与 Go 侧 internal/lyrics/wordlevel.go 逐条对齐（两处不一致的表现是
 * 「界面显示的歌词和保存下来的歌词对不上」）：
 *   · **只有行首连续的时间标签算行标签**；行内再出现的时间标签是字级标记
 *     （网易云 klyric 的写法，也天然兼容「一行多个时间标签」）；
 *   · (a,b) / <a,b,c> / [a,b,c] 这类数字对标记**只在行标签是
 *     [起始毫秒,时长]（QRC/KRC/YRC）时才认**，行级歌词正文里的
 *     (2019,2020) 不会被吃掉；
 *   · `words` 是**每个字素一个起始毫秒**，只有真的识别到字级标记才有值。
 *
 * @param {string} raw
 * @returns {{stamps: number[], text: string, words: number[]|null}}
 */
function parseLyricLine(raw) {
  const empty = { stamps: [], text: "", words: null };
  let rest = String(raw).replace(/^[ \t]+/, "");
  /** @type {number[]} */
  const stamps = [];
  let qrcForm = false;

  for (;;) {
    HEAD_TIME_TAG.lastIndex = 0;
    const m1 = HEAD_TIME_TAG.exec(rest);
    if (m1 && m1.index === 0) {
      stamps.push(clockTagMs(m1[0].slice(1, -1)) ?? 0);
      rest = rest.slice(m1[0].length);
      continue;
    }
    HEAD_MS_TAG.lastIndex = 0;
    const m2 = HEAD_MS_TAG.exec(rest);
    if (m2 && m2.index === 0) {
      stamps.push(Number(m2[1]));
      qrcForm = true;
      rest = rest.slice(m2[0].length);
      continue;
    }
    break;
  }
  if (!stamps.length) return empty;

  rest = rest.replace(/^[ \t]+/, "");
  const { segs, wordy } = tokenizeWords(rest, stamps[0], qrcForm);
  if (!segs.length) return { stamps, text: "", words: null };

  segs[0].text = segs[0].text.replace(/^[ \t]+/, "");
  segs[segs.length - 1].text = segs[segs.length - 1].text.replace(/[ \t]+$/, "");
  while (segs.length && !segs[0].text) segs.shift();
  while (segs.length && !segs[segs.length - 1].text) segs.pop();
  if (!segs.length) return { stamps, text: "", words: null };

  const text = segs.map((s) => s.text).join("");
  if (!text) return { stamps, text: "", words: null };

  const words = wordy ? wordStartsByGrapheme(segs, text) : null;
  // 行标签与逐字时间轴对不上（典型场景：用户在歌词工作台里给这一行**重新
  // 打了轴**，只改了行时间）时，把整段逐字时间平移到行首。保住的是行内的
  // 相对节奏；不平移的话逐字时间全落在行时间之前，一开口整行就「瞬间全亮」。
  if (words && words.length && words[0] < stamps[0]) {
    const shift = stamps[0] - words[0];
    for (let i = 0; i < words.length; i += 1) words[i] += shift;
  }
  return { stamps, text, words };
}

/**
 * 把字级分段摊成「每个字素一个起始毫秒」。
 *
 * 对不上（分段与整行的字素切分不一致，例如 emoji 恰好横跨两个词）时返回
 * null —— 与其点亮错位，不如退回行级插值。
 *
 * @param {{start:number,text:string}[]} segs
 * @param {string} text
 * @returns {number[]|null}
 */
function wordStartsByGrapheme(segs, text) {
  /** @type {number[]} */
  const out = [];
  for (const seg of segs) {
    const n = splitGraphemes(seg.text).length;
    for (let k = 0; k < n; k += 1) out.push(seg.start);
  }
  if (!out.length || out.length !== splitGraphemes(text).length) return null;
  return out;
}

/**
 * 正文 → 字级分段。
 *
 * 前缀标记（<…> / 行内 […]）表示「后面这段文字从这个时刻开始」；
 * 后缀标记（(偏移,时长)，QRC）表示「它前面那段文字从这个时刻开始」。
 *
 * @param {string} s
 * @param {number} lineStart
 * @param {boolean} qrcForm
 */
function tokenizeWords(s, lineStart, qrcForm) {
  /** @type {{start:number,text:string}[]} */
  const segs = [];
  let pending = "";
  let cur = lineStart;
  let wordy = false;

  const flush = (start) => {
    if (!pending) return;
    segs.push({ start, text: pending });
    pending = "";
  };

  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c !== "<" && c !== "(" && c !== "[") {
      pending += c;
      i += 1;
      continue;
    }
    const closing = c === "<" ? ">" : c === "(" ? ")" : "]";
    const j = s.indexOf(closing, i + 1);
    if (j < 0) {
      pending += c;
      i += 1;
      continue;
    }
    const content = s.slice(i + 1, j);
    const next = j + 1;

    // (偏移,时长) —— QRC 的词级后缀标记
    if (c === "(") {
      const pair = pairTag(content);
      if (pair && qrcForm) {
        flush(lineStart + pair[0]);
        cur = lineStart + pair[0] + pair[1];
        wordy = true;
        i = next;
        continue;
      }
      pending += c;
      i += 1;
      continue;
    }

    // <mm:ss.xxx> / 行内 [mm:ss.xxx] —— 绝对时刻的字级标记
    const clock = clockTagMs(content);
    if (clock !== null) {
      flush(cur);
      cur = clock;
      wordy = true;
      i = next;
      continue;
    }

    // <偏移,时长>（KRC，相对行首） / 行内 [起始毫秒,时长]（YRC，绝对）
    const pair = pairTag(content);
    if (pair && qrcForm) {
      const start = c === "<" ? lineStart + pair[0] : pair[0];
      flush(cur);
      cur = start;
      wordy = true;
      i = next;
      continue;
    }

    // 认不出来的标记当正文原样保留
    pending += c;
    i += 1;
  }
  flush(cur);
  return { segs, wordy };
}

/**
 * LRC 文本 → 按时间升序的 `[{ time, text, trans?, words? }]`（time 单位毫秒）。
 *
 * 同时间戳的多行会折叠成一行：`text` 是文件里先出现的那行（通常是对白/原唱），
 * `trans` 是其余行（翻译 / 罗马音），只在真的有副行时才带这个键 —— 单语言歌词
 * 的行结构与以前完全一样。
 *
 * `words` 只有字级（逐字）歌词才有：每个字素一个起始毫秒，与
 * `splitGraphemes(text)` 一一对应。
 *
 * @param {string} text
 * @returns {Array<{time:number,text:string,trans?:string[],words?:number[]}>}
 */
export function parseLrc(text) {
  if (!text) return [];
  /** @type {Array<{time:number,text:string,words?:number[]}>} */
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const line = parseLyricLine(raw);
    if (!line.stamps.length || !line.text) continue;
    const base = line.stamps[0];
    for (const t of line.stamps) {
      /** @type {{time:number,text:string,words?:number[]}} */
      const item = { time: t, text: line.text };
      if (line.words) {
        // 同一句挂多个时间标签：展开的每一遍都要带上自己的逐字时间
        item.words = t === base ? line.words : line.words.map((w) => w + (t - base));
      }
      out.push(item);
    }
  }
  out.sort((a, b) => a.time - b.time);

  // 同时间戳折叠：Array#sort 在现代内核里是稳定排序，所以同刻度的行保持
  // 文件里的先后顺序 —— 第一行就是这一句的「原文」。
  /** @type {Array<{time:number,text:string,trans?:string[],words?:number[]}>} */
  const grouped = [];
  for (const line of out) {
    const last = grouped[grouped.length - 1];
    if (last && last.time === line.time) {
      if (last.trans) last.trans.push(line.text);
      else last.trans = [line.text];
    } else {
      grouped.push(line);
    }
  }
  return grouped;
}

/**
 * 一行歌词的**展示文本**：主行 + 同时间的其它语言行。
 *
 * 单语言时原样返回主行（不分配新字符串）。多语言时用分隔符拼起来 ——
 * 给「只能显示一行」的地方用：桌面歌词、悬浮歌词条、画布类皮肤。
 *
 * @param {{text?:string,trans?:string[]}|null|undefined} line
 * @param {string} [sep]
 * @returns {string}
 */
export function lyricDisplayText(line, sep = " · ") {
  if (!line) return "";
  const base = String(line.text ?? "");
  const trans = line.trans;
  if (!Array.isArray(trans) || !trans.length) return base;
  return [base, ...trans].join(sep);
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

/** 行级时间标签的毫秒数（整数运算，避免 12.345*1000 的浮点尾数） */
function stampMs(mm, ss, ff) {
  const frac = ff ? Number(String(ff).padEnd(3, "0")) : 0;
  return (Number(mm) * 60 + Number(ss)) * 1000 + frac;
}

/**
 * 毫秒 → 字级标记 `<mm:ss.mmm>`（与 Go 侧 formatWordStamp 逐字一致）。
 *
 * 字级用毫秒精度、行标签仍是百分秒：逐字点亮差 10ms 就能看出抖，
 * 而且两边格式一致才谈得上「微调一遍之后文本还能对上」。
 * @param {number} ms
 */
function formatWordTime(ms) {
  const clamped = Math.max(0, Math.round(Number(ms) || 0));
  const min = Math.floor(clamped / 60000);
  const rest = clamped % 60000;
  const sec = Math.floor(rest / 1000);
  const frac = rest % 1000;
  return `<${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(frac).padStart(3, "0")}>`;
}

/**
 * 整体平移所有时间标签（微调：整首歌提前/延后）。
 *
 * 负数结果钳到 0 而不是丢掉该行 —— 丢掉会让用户「调一下少了三句」，
 * 钳到 0 只是那几句挤在开头，还能看出来并继续调整。
 *
 * 字级（逐字）标记 `<00:12.000>` 必须跟着一起平移：只动行标签的话，
 * 微调之后「行高亮挪了、字却还按原时间点亮」，比不微调更糟。
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
        return formatLrcTime(stampMs(mm, ss, ff) + delta);
      });
      // 没有时间标签的行原样保留（作词/作曲之类的信息行）
      if (!any) return raw;
      return next.replace(WORD_TIME_TAG, (_all, mm, ss, ff) => formatWordTime(stampMs(mm, ss, ff) + delta));
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
