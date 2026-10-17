/* ==========================================================================
   diva/lib/lyrics.js — 底部卡拉 OK 提词器（逐字素点亮 + 多语言翻译 + 点击跳转）
   --------------------------------------------------------------------------
   结构固定为「上一句 / 当前句 / 下一句」三行：
     · 只有**当前句**会被拆成字素 span（`.dv-lrc__g`，`data-lit` 0/1/2）；
       整篇都拆会让一首歌凭空多出上千个节点，且离开当前句后它们毫无用处；
     · 有 `line.words`（每个字素一个起始毫秒，已经与 sdk.splitGraphemes 对齐）
       就用精确时刻；没有就把「本行 → 下一行」的时长均摊到每个字素；
     · 多语言 `line.trans`（同时间戳的其它语言行）用 " · " 连接后放在译文行；
     · 点击任意一行 = 跳到那一行（interactive=false 时一个监听器都不挂）。

   ★ 帧的来源：本模块**不持有任何循环**，也不建定时器。
       · setPosition(ms, { playing }) 是宿主 4Hz、250ms 量化的进度补丁；
       · tick(nowMs) 由 entry 的帧循环每帧调用（静止档也会调），在这里按墙钟
         把两次补丁之间的帧补出来，逐字点亮才不会一跳一跳；
       · 但**DOM 只在「当前行 / 已点亮字素数」变化时写**：每帧都写 textContent
         或 data-* 是这类模块最常见的性能坑。

   ★ 文本一律走 textContent：歌词来自用户文件 / 在线匹配，绝不能当 HTML 拼。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const { TIMING } = await import(`./config.js${Q}`);

/** 没有下一行时，一行歌词的兜底时长（毫秒）。长间奏里末字不会永远卡在「正在唱」。 */
export const FALLBACK_LINE_MS = 4200;

/** 点亮态：0 = 未唱（暗），1 = 正在唱（最亮 + 光晕），2 = 已唱（次亮） */
export const LIT_UNSUNG = 0;
export const LIT_SINGING = 1;
export const LIT_SUNG = 2;

/**
 * 宿主没给 `lyrics.status` 时，从空态文案反推状态（entry 只把 emptyText 递进来）。
 *
 * @param {Array<{time:number}>|null|undefined} lines
 * @param {{ status?: string, emptyText?: string }} [meta]
 * @returns {"ok"|"loading"|"failed"|"none"|string}
 */
export function emptyStatusOf(lines, meta = {}) {
  const custom = typeof meta.status === "string" ? meta.status.trim() : "";
  if (custom) return custom;
  if (Array.isArray(lines) && lines.length) return "ok";
  const text = String(meta.emptyText ?? "");
  if (/匹配中|加载中|正在加载/.test(text)) return "loading";
  if (/匹配失败|失败/.test(text)) return "failed";
  return "none";
}

/** 状态 → 空态默认文案（宿主没给 emptyText 时用）。 */
export function statusEmptyText(status) {
  switch (String(status ?? "")) {
    case "loading":
    case "matching":
      return "歌词匹配中…";
    case "failed":
      return "歌词匹配失败";
    default:
      return "暂无歌词";
  }
}

/** 一行歌词的结束时刻：下一行起点；没有下一行（或时间不前进）时用兜底时长。 */
export function lineEndAt(lines, index) {
  const list = Array.isArray(lines) ? lines : [];
  const cur = list[index];
  if (!cur) return 0;
  const start = lineStartOf(cur);
  const next = Number(list[index + 1]?.time);
  return Number.isFinite(next) && next > start ? next : start + FALLBACK_LINE_MS;
}

/**
 * 二分查找当前播放位置对应的行下标（-1 = 还没到第一句）。
 *
 * @param {Array<{time:number}>|null|undefined} lines
 * @param {number} ms
 * @returns {number}
 */
export function lineIndexAt(lines, ms) {
  const list = Array.isArray(lines) ? lines : [];
  const t = Number(ms);
  if (!list.length || !Number.isFinite(t)) return -1;
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const time = Number(list[mid]?.time);
    if (Number.isFinite(time) && time <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * 文本 → 字素数组。
 *
 * 必须用宿主的 `sdk.splitGraphemes`：`line.words` 的下标就是按它排的，
 * 自己换一套切法（或按 code unit 切）会让中文标点、emoji 全部错位。
 * 没有 sdk 时退回 `Array.from`（按码位切，至少不会把代理对劈成两半）。
 *
 * @param {string} text
 * @param {{ splitGraphemes?: (s: string) => string[] }|null} [sdk]
 * @returns {string[]}
 */
export function splitLyricText(text, sdk) {
  const s = String(text ?? "");
  if (!s) return [];
  const split = sdk?.splitGraphemes;
  if (typeof split === "function") {
    try {
      const out = split(s);
      if (Array.isArray(out) && out.length) return out;
    } catch {
      /* 宿主实现异常时走下面的兜底 */
    }
  }
  return Array.from(s);
}

/** 每个字素的起始毫秒（有 words 用精确时刻，没有就均摊到整行）。 */
export function glyphStarts(line, graphemes, lineEndMs) {
  const list = Array.isArray(graphemes) ? graphemes : [];
  const n = list.length;
  if (!n) return [];
  const start = lineStartOf(line);
  const end = lineEndOf(line, lineEndMs);
  const words = Array.isArray(line?.words) ? line.words : null;
  const out = new Array(n);
  if (words && words.length === n) {
    let aligned = true;
    for (let k = 0; k < n; k += 1) {
      const w = Number(words[k]);
      if (!Number.isFinite(w)) {
        aligned = false;
        break;
      }
      out[k] = w;
    }
    // 字素与 words 对不上（或含非法值）时退回均摊：错位点亮比不逐字更糟
    if (aligned) return out;
  }
  const step = (end - start) / n;
  for (let k = 0; k < n; k += 1) out[k] = start + k * step;
  return out;
}

/**
 * 每个字素此刻的点亮态数组（0/1/2）。
 *
 * 语义：`started` = 已经开口的字素数。第 started-1 个字素是「正在唱」，
 * 更早的全部「已唱」；本行唱完（位置越过行尾）之后最后一个也变成「已唱」。
 *
 * @param {{time:number, words?:number[]}} line
 * @param {string[]} graphemes
 * @param {number} ms
 * @param {number} lineEndMs
 * @returns {number[]}
 */
export function glyphProgress(line, graphemes, ms, lineEndMs) {
  const starts = glyphStarts(line, graphemes, lineEndMs);
  return statesFromStarts(starts, ms, lineStartOf(line), lineEndOf(line, lineEndMs));
}

/** 已点亮（正在唱 + 已唱）的字素数 —— 写进 data-dv-lit 的就是它。 */
export function litCountOf(states) {
  let n = 0;
  for (let k = 0; k < (states ? states.length : 0); k += 1) if (states[k] > 0) n += 1;
  return n;
}

/** 多语言译文：trans 用 " · " 连接；没有译文返回空串（交给 CSS 的 :empty 隐藏）。 */
export function transText(line, sep = " · ") {
  const trans = Array.isArray(line?.trans) ? line.trans : [];
  const parts = [];
  for (const item of trans) {
    const text = String(item ?? "").trim();
    if (text) parts.push(text);
  }
  return parts.join(sep);
}

/* --------------------------------------------------------------------------
   内部：时间归一化 / 点亮态
   -------------------------------------------------------------------------- */

function lineStartOf(line) {
  const t = Number(line?.time);
  return Number.isFinite(t) && t > 0 ? t : 0;
}

function lineEndOf(line, lineEndMs) {
  const start = lineStartOf(line);
  const end = Number(lineEndMs);
  return Number.isFinite(end) && end > start ? end : start + FALLBACK_LINE_MS;
}

function statesFromStarts(starts, ms, lineStart, lineEnd) {
  const n = Array.isArray(starts) ? starts.length : 0;
  const states = new Array(n).fill(LIT_UNSUNG);
  const t = Number(ms);
  if (!n || !Number.isFinite(t)) return states;
  let started = 0;
  for (let k = 0; k < n; k += 1) if (starts[k] <= t) started = k + 1;
  if (!started) return states;
  const finished = t >= lineEnd;
  const singing = started - 1;
  for (let k = 0; k < started; k += 1) {
    states[k] = k === singing && !finished ? LIT_SINGING : LIT_SUNG;
  }
  return states;
}

/* --------------------------------------------------------------------------
   视图
   -------------------------------------------------------------------------- */

/**
 * 创建歌词视图。
 *
 * @param {HTMLElement|null} root entry 给的 `.dv__lyrics` 容器
 * @param {object} [options]
 * @param {{ splitGraphemes?: (s:string)=>string[], html?: { lyricsEmptyText?: Function } }|null} [options.sdk]
 * @param {(ms:number)=>void} [options.onSeek] 点击某一行 → 跳到该行起始毫秒
 * @param {boolean} [options.interactive] false = 只读舞台：不挂点击监听、不响应
 * @returns {{ setLines: Function, setPosition: Function, tick: Function, setOptions: Function, destroy: Function }}
 */
export function createLyricsView(root, options = {}) {
  const container = root;
  if (!container) {
    return { setLines() {}, setPosition() {}, tick() {}, setOptions() {}, destroy() {} };
  }

  const sdk = options.sdk || null;
  const onSeek = typeof options.onSeek === "function" ? options.onSeek : null;
  let interactive = options.interactive !== false;
  let destroyed = false;

  /* —— 数据 —— */
  /** @type {Array<{time:number,text:string,trans?:string[],words?:number[]}>} */
  let lines = [];
  let empty = true;
  let emptyText = "";
  let status = "none";
  let show = true;
  let fontSize = 0;
  let playing = false;
  let basePos = 0;
  let baseAt = nowMs();

  /* —— DOM —— */
  const lrc = createEl("div", "dv-lrc");
  lrc.dataset.dvEmpty = "1";
  lrc.dataset.dvLines = "0";
  lrc.dataset.dvIndex = "-1";
  lrc.dataset.dvLit = "0";
  lrc.dataset.dvStatus = "none";

  const stack = createEl("div", "dv-lrc__stack");
  const prevEl = createEl("div", "dv-lrc__line dv-lrc__line--prev");
  prevEl.dataset.role = "prev";
  const curEl = createEl("div", "dv-lrc__line dv-lrc__line--cur");
  curEl.dataset.role = "cur";
  curEl.setAttribute("aria-current", "true");
  const nextEl = createEl("div", "dv-lrc__line dv-lrc__line--next");
  nextEl.dataset.role = "next";
  // 译文紧跟在当前行下面（不是整个栈的末尾）—— 否则它会掉到「下一句」下面，
  // 看起来像是下一句的翻译。
  const transEl = createEl("div", "dv-lrc__trans");
  stack.appendChild(prevEl);
  stack.appendChild(curEl);
  stack.appendChild(transEl);
  stack.appendChild(nextEl);

  const emptyEl = createEl("div", "dv-lrc__empty");
  emptyEl.hidden = true;
  emptyEl.appendChild(createEl("span", "dv-lrc__emptyRing"));
  const emptyTextEl = createEl("span", "dv-lrc__emptyText");
  emptyEl.appendChild(emptyTextEl);

  lrc.appendChild(stack);
  lrc.appendChild(emptyEl);
  container.appendChild(lrc);

  /* —— 渲染缓存（只在变化时写 DOM） —— */
  let cacheIdx = -1;
  let cacheLine = null;
  let cacheEnd = 0;
  let cacheGraphemes = [];
  let cacheStarts = [];
  let builtIdx = -1;
  /** @type {HTMLElement[]} */
  let glyphEls = [];
  let shownLit = -1;
  let shownIndex = -2;

  /* —— 监听 —— */
  let listening = false;

  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function createEl(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  /** 位置外推：播放时按墙钟补，暂停时冻在最后一次补丁的位置。 */
  function effectivePos(now) {
    let pos = basePos;
    if (playing) {
      const elapsed = Math.min(Math.max(Number(now) - baseAt, 0), TIMING.maxInterpMs);
      pos += elapsed;
    }
    return Math.max(0, pos);
  }

  function paintSide(node, line, index) {
    node.textContent = line ? String(line.text ?? "") : "";
    if (line) node.dataset.lineIndex = String(index);
    else delete node.dataset.lineIndex;
  }

  function rebuildCurrent(curIdx) {
    const line = lines[curIdx];
    const prevLine = curIdx > 0 ? lines[curIdx - 1] : null;
    const nextLine = curIdx + 1 < lines.length ? lines[curIdx + 1] : null;
    paintSide(prevEl, prevLine, curIdx - 1);
    paintSide(nextEl, nextLine, curIdx + 1);
    paintSide(curEl, null, -1);
    curEl.dataset.lineIndex = String(curIdx);
    glyphEls = [];
    for (let k = 0; k < cacheGraphemes.length; k += 1) {
      const span = createEl("span", "dv-lrc__g");
      span.dataset.lit = String(LIT_UNSUNG);
      span.textContent = cacheGraphemes[k];
      curEl.appendChild(span);
      glyphEls.push(span);
    }
    transEl.textContent = transText(line);
  }

  function paintGlyphs(states) {
    for (let k = 0; k < glyphEls.length; k += 1) {
      const want = String(states[k] ?? LIT_UNSUNG);
      if (glyphEls[k].dataset.lit !== want) glyphEls[k].dataset.lit = want;
    }
    lrc.dataset.dvLit = String(litCountOf(states));
  }

  function renderAt(pos) {
    if (destroyed || empty || !lines.length) return;
    const idx = lineIndexAt(lines, pos);
    const curIdx = idx >= 0 ? idx : 0;
    const line = lines[curIdx];
    if (!line) return;

    if (curIdx !== cacheIdx || line !== cacheLine) {
      cacheIdx = curIdx;
      cacheLine = line;
      cacheEnd = lineEndAt(lines, curIdx);
      cacheGraphemes = splitLyricText(line.text, sdk);
      cacheStarts = glyphStarts(line, cacheGraphemes, cacheEnd);
      builtIdx = -1;
    }

    const states = statesFromStarts(cacheStarts, pos, lineStartOf(line), cacheEnd);
    const lit = litCountOf(states);

    if (builtIdx !== curIdx) {
      rebuildCurrent(curIdx);
      builtIdx = curIdx;
      paintGlyphs(states);
      shownLit = lit;
    } else if (lit !== shownLit) {
      // 整行没换，只是又点亮了一个字素 —— 只写变化的那几个 data-lit
      paintGlyphs(states);
      shownLit = lit;
    }

    if (shownIndex !== idx) {
      shownIndex = idx;
      lrc.dataset.dvIndex = String(idx);
    }
  }

  function renderEmptyState() {
    cacheIdx = -1;
    cacheLine = null;
    cacheGraphemes = [];
    cacheStarts = [];
    builtIdx = -1;
    glyphEls = [];
    shownLit = -1;
    shownIndex = -2;
    prevEl.textContent = "";
    curEl.textContent = "";
    nextEl.textContent = "";
    delete prevEl.dataset.lineIndex;
    delete curEl.dataset.lineIndex;
    delete nextEl.dataset.lineIndex;
    transEl.textContent = "";
    stack.hidden = true;
    emptyEl.hidden = false;
    emptyTextEl.textContent = emptyText || statusEmptyText(status);
    lrc.dataset.dvEmpty = "1";
    lrc.dataset.dvIndex = "-1";
    lrc.dataset.dvLit = "0";
  }

  function applyShow() {
    lrc.hidden = !show;
  }

  function onClick(event) {
    if (!interactive || destroyed) return;
    const node = event.target && event.target.closest ? event.target.closest(".dv-lrc__line") : null;
    if (!node) return;
    const index = Number(node.dataset.lineIndex);
    const line = lines[index];
    if (line && Number.isFinite(Number(line.time))) onSeek?.(Number(line.time));
  }

  function syncListener() {
    const want = interactive && !destroyed;
    if (want === listening) return;
    listening = want;
    if (want) lrc.addEventListener("click", onClick);
    else lrc.removeEventListener("click", onClick);
  }

  /**
   * 设定歌词内容。`meta.show=false` 只把整块隐藏（DOM 保留，切回来不用重建）。
   *
   * `meta.status` 是可选字段：entry 目前只传 emptyText，这里会从文案反推状态；
   * 宿主以后直接把 lyrics.status 递进来时以它为准（data-dv-status 用它）。
   *
   * @param {Array<{time:number,text:string,trans?:string[],words?:number[]}>|null|undefined} next
   * @param {{ emptyText?: string, show?: boolean, status?: string }} [meta]
   */
  function setLines(next, meta = {}) {
    if (destroyed) return;
    const list = Array.isArray(next) ? next : [];
    lines = list.filter((line) => line && Number.isFinite(Number(line.time)));
    empty = lines.length === 0;
    status = emptyStatusOf(lines, { status: meta.status, emptyText: meta.emptyText });
    emptyText =
      meta.emptyText != null && String(meta.emptyText).trim()
        ? String(meta.emptyText)
        : statusEmptyText(status);
    if (meta.show !== undefined) show = meta.show !== false;
    applyShow();
    lrc.dataset.dvLines = String(lines.length);
    lrc.dataset.dvStatus = String(status);
    if (empty) {
      renderEmptyState();
      return;
    }
    stack.hidden = false;
    emptyEl.hidden = true;
    lrc.dataset.dvEmpty = "0";
    cacheIdx = -1;
    cacheLine = null;
    builtIdx = -1;
    shownIndex = -2;
    shownLit = -1;
    renderAt(effectivePos(nowMs()));
  }

  /**
   * 宿主进度补丁（约 4Hz、250ms 量化）。记下锚点，帧之间由 tick 补。
   *
   * @param {number} ms
   * @param {{ playing?: boolean }} [meta]
   */
  function setPosition(ms, meta = {}) {
    if (destroyed) return;
    const pos = Number(ms);
    basePos = Number.isFinite(pos) && pos > 0 ? pos : 0;
    baseAt = nowMs();
    if (typeof meta.playing === "boolean") playing = meta.playing;
    renderAt(effectivePos(baseAt));
  }

  /** entry 每帧调用一次（暂停、静止档也会调）：按墙钟补齐补丁之间的帧。 */
  function tick(now) {
    if (destroyed) return;
    renderAt(effectivePos(now));
  }

  /** 设置项：字号 / 显示 / 可交互。 */
  function setOptions(next = {}) {
    if (destroyed) return;
    const size = Number(next.fontSize);
    if (Number.isFinite(size) && size > 0 && size !== fontSize) {
      fontSize = size;
      // entry 也在 `.dv` 上写同一份变量；这里写在本块上只是为了接口自洽
      lrc.style.setProperty("--dv-lsize", `${size}px`);
    }
    if (typeof next.show === "boolean" && next.show !== show) {
      show = next.show;
      applyShow();
    }
    if (typeof next.interactive === "boolean" && next.interactive !== interactive) {
      interactive = next.interactive;
      syncListener();
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    interactive = false;
    syncListener();
    if (lrc.parentNode) lrc.parentNode.removeChild(lrc);
    lines = [];
    glyphEls = [];
    cacheLine = null;
    cacheGraphemes = [];
    cacheStarts = [];
  }

  syncListener();
  applyShow();

  return { setLines, setPosition, tick, setOptions, destroy };
}
