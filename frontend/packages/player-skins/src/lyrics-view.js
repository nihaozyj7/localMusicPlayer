// @ts-check
/* ==========================================================================
   lyrics-view.js — 歌词滚动区（皮肤共用的渲染器）
   --------------------------------------------------------------------------
   为什么放在包里而不是宿主里：需求把「播放详情界面的背景渲染和交互（含歌词）
   」整体划给皮肤包，宿主只提供音频与进度、封面与歌词数据。
   经典 / 沉浸 / 简约三种内置样式对歌词的要求完全一样（自动居中高亮 + 用户滚动时让位 +
   点行 seek），差别只在 CSS 令牌上，所以抽成一个共用渲染器，各建一份实例。

   两条必须同时成立的行为（从原 playerview.js 原样搬过来，都是踩过坑的）：
     1) 播放时自动把当前行滚到容器垂直中央；
     2) 用户可以用滚轮 / 拖动滚动条自己翻歌词 —— 此时自动滚动必须让位，
        停手约 1.2 秒后再自动接管。少了 2) 会出现「用户刚滚上去就被拽回来」。

   字级（逐字）歌词：
     · 行上带 `words`（每个字素一个起始毫秒，见 lrc.js#parseLrc）时，
       **只把当前行**拆成 `.lyric__word` 字素 span，按时间点亮 —— 不给
       整篇歌词都拆开（一首歌几十行 × 每行几十个字就是上千个节点，
       而非当前行根本不需要逐字高亮）；
     · 离开当前行时还原成纯文本，DOM 形状与没有字级时完全一样。
   ========================================================================== */

import { findLyricIndex, splitGraphemes } from "./lrc.js";

/** 用户滚动之后，多久重新接管自动滚动 */
const USER_SCROLL_PAUSE_MS = 1200;

/** 歌词行的最小结构（与 lrc.js 解析结果一致；trans = 同时间的其它语言行） */
/**
 * @typedef {{ time: number, text: string, trans?: string[], words?: number[] }} LyricLine
 */

/**
 * @typedef {Object} LyricsView
 * @property {HTMLElement} element `.lyrics` 根节点
 * @property {HTMLElement} scrollElement `.lyrics__scroll` 滚动容器
 * @property {(lines: LyricLine[], meta?: { emptyText?: string, emptyHint?: string, showOpenFolder?: boolean }) => void} setLines
 * @property {(index: number, opts?: { immediate?: boolean, playing?: boolean }) => void} setActive
 * @property {(positionMs: number, opts?: { immediate?: boolean, playing?: boolean }) => void} setPosition
 * @property {(playing: boolean) => void} setPlaying
 * @property {() => void} destroy
 * @property {LyricLine[]} lines
 * @property {number} activeIndex
 */

/**
 * 创建一个歌词视图。
 *
 * @param {HTMLElement} host 放置 `.lyrics` 的容器（皮肤自己的 DOM）
 * @param {object} [opts]
 * @param {(text:string) => string} [opts.escape] 文本转义函数（默认内置一份最小实现）
 * @param {(ms:number) => void} [opts.onSeek] 点歌词 / 回车跳转到对应毫秒
 * @param {() => void} [opts.onOpenFolder] 空态里「打开所在文件夹」的回调
 * @param {boolean} [opts.interactive] 是否可交互（默认 true）。
 *        宿主把同一个皮肤挂到「只能看、点不到」的地方时传 false —— 例如桌面背景
 *        歌词窗口（窗口垫在桌面图标之下，本来就收不到鼠标事件）。这时行不做成
 *        role="button"、不挂任何监听、空态也不给「打开所在文件夹」，于是渲染出来
 *        的纯粹是「内容」。
 * @returns {LyricsView}
 */
export function createLyricsView(host, opts = {}) {
  const esc = opts.escape || defaultEscape;
  const interactive = opts.interactive !== false;

  const root = document.createElement("div");
  root.className = "lyrics";
  root.id = "pv-lyrics";
  if (!interactive) root.dataset.passive = "1";
  const scroll = document.createElement("div");
  scroll.className = "lyrics__scroll";
  root.appendChild(scroll);
  host.appendChild(root);

  /** @type {LyricLine[]} */
  let lines = [];
  let activeIndex = -1;
  let userScrollingUntil = 0;
  let resumeTimer = null;
  let destroyed = false;

  /* ---- 字级（逐字）歌词的状态：只作用于**当前行**（见文件头注释） ---- */
  /** 正在拆字素的那一行下标（-1 = 当前行没有字级或还没进入） */
  let wordIdx = -1;
  /** @type {HTMLElement[]} 该行的字素 span */
  let wordEls = [];
  /** @type {number[]|null} 该行每个字素的起始毫秒 */
  let wordStarts = null;
  /** 上一次点亮到第几个（不变化就不写 DOM） */
  let wordHold = -1;

  /* ---- 平滑推进（宿主的进度是 250ms 一跳，逐字点亮必须自己补齐中间帧） ---- */
  /** 最近一次 setPosition 的锚点：位置 + 它被推过来的时刻 */
  let basePos = 0;
  let baseAt = 0;
  let playing = false;
  let smoothRaf = 0;

  const markUserScroll = () => {
    userScrollingUntil = Date.now() + USER_SCROLL_PAUSE_MS;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      if (destroyed) return;
      // -2 是「强制重算」的哨兵：下一次 setActive 一定会重新定位
      activeIndex = -2;
      setActive(lastWanted, { immediate: true });
    }, USER_SCROLL_PAUSE_MS + 40);
  };

  // passive：歌词区经常在滚，监听器不能拖慢滚动。
  // 非交互模式下整个监听器都不挂 —— 不是为了省那点开销，而是因为「让位给用户
  // 滚动」这套逻辑在没有用户滚动的地方只会带来额外的定时器。
  if (interactive) {
    scroll.addEventListener("wheel", markUserScroll, { passive: true });
    scroll.addEventListener("touchmove", markUserScroll, { passive: true });
    scroll.addEventListener("pointerdown", markUserScroll, { passive: true });
  }

  function onClick(e) {
    const line = e.target.closest?.(".lyric");
    if (!line) {
      if (e.target.closest?.("[data-lyrics-act='open-folder']")) opts.onOpenFolder?.();
      return;
    }
    const t = Number(line.dataset.time);
    if (Number.isFinite(t)) opts.onSeek?.(t);
  }

  function onKeydown(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const line = e.target.closest?.(".lyric");
    if (!line) return;
    e.preventDefault();
    const t = Number(line.dataset.time);
    if (Number.isFinite(t)) opts.onSeek?.(t);
  }

  if (interactive) {
    scroll.addEventListener("click", onClick);
    scroll.addEventListener("keydown", onKeydown);
  }

  /** 上一次要求高亮的下标（用户滚动结束后要重新对齐它） */
  let lastWanted = -1;

  /** 把某一行滚到容器垂直中央 */
  function scrollToLine(idx, { immediate = false } = {}) {
    if (idx < 0) {
      scroll.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
      return;
    }
    const target = /** @type {HTMLElement|null} */ (scroll.querySelector(`.lyric[data-lyric-index="${idx}"]`));
    if (!target) return;
    // 用相对容器的 offsetTop 计算，避免受页面滚动 / 定位上下文影响
    const top = target.offsetTop - (scroll.clientHeight - target.offsetHeight) / 2;
    const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const clamped = Math.max(0, Math.min(top, max));
    // 已经在目标附近就不动，否则每帧都发起平滑滚动会看起来「卡住」
    if (Math.abs(scroll.scrollTop - clamped) < 4) return;
    scroll.scrollTo({ top: clamped, behavior: immediate ? "auto" : "smooth" });
  }

  /**
   * 一行的**内容**（不含行容器属性）：主行是原文，`trans` 里的每一行各画一条
   * 副行（`.lyric__trans`，样式在 lyrics.css）—— 多语言歌词必须显示在同一条里，
   * 否则同一时间戳的两种语言会被拆成两行，只有一行能拿到高亮。
   *
   * @param {{time:number,text:string,trans?:string[]}} l
   * @returns {string}
   */
  function lineInnerHtml(l) {
    const trans =
      Array.isArray(l.trans) && l.trans.length
        ? l.trans.map((t) => `<span class="lyric__trans">${esc(t)}</span>`).join("")
        : "";
    return `${esc(l.text)}${trans}`;
  }

  /**
   * 一行 → DOM。
   * @param {{time:number,text:string,trans?:string[]}} l
   * @param {number} i
   */
  function lineHtml(l, i) {
    const attrs = `data-time="${l.time}" data-lyric-index="${i}"`;
    return interactive
      ? `<div class="lyric" role="button" tabindex="0" ${attrs}>${lineInnerHtml(l)}</div>`
      : `<div class="lyric" ${attrs}>${lineInnerHtml(l)}</div>`;
  }

  /* --------------------------------------------------------------------------
     字级（逐字）：进入 / 点亮 / 还原
     -------------------------------------------------------------------------- */

  /**
   * 把当前行拆成字素 span（没有字级、或字素数与 words 对不上时什么都不做 ——
   * 对不上就退回行级，点亮错位比不逐字更糟）。
   * @param {number} idx
   */
  function enterWords(idx) {
    const l = lines[idx];
    const el = lineElAt(idx);
    const starts = l?.words;
    if (!el || !Array.isArray(starts) || !starts.length) return;
    const graphemes = splitGraphemes(l.text);
    if (!graphemes.length || graphemes.length !== starts.length) return;

    const trans =
      Array.isArray(l.trans) && l.trans.length
        ? l.trans.map((t) => `<span class="lyric__trans">${esc(t)}</span>`).join("")
        : "";
    const body = graphemes
      .map((ch, k) => `<span class="lyric__word" data-i="${k}" data-active="false">${esc(ch)}</span>`)
      .join("");
    el.innerHTML = body + trans;

    wordIdx = idx;
    wordEls = Array.from(el.querySelectorAll(".lyric__word"));
    wordStarts = starts;
    wordHold = -1;
  }

  /** 把某一行还原成纯文本（离开当前行时调用，DOM 形状回到没有字级的样子） */
  function leaveWords(idx) {
    if (idx < 0) return;
    const l = lines[idx];
    const el = lineElAt(idx);
    if (l && el) el.innerHTML = lineInnerHtml(l);
  }

  /** 保证「正在拆字素的那一行」就是当前行 */
  function syncWordLine() {
    if (wordIdx >= 0 && wordIdx !== activeIndex) {
      leaveWords(wordIdx);
      wordIdx = -1;
      wordEls = [];
      wordStarts = null;
      wordHold = -1;
    }
    if (activeIndex >= 0 && wordIdx !== activeIndex) enterWords(activeIndex);
  }

  /**
   * 按播放进度点亮当前行的字。只在位置真的推进了时才写 DOM。
   * @param {number} positionMs
   */
  function paintWords(positionMs) {
    if (wordIdx < 0 || !wordStarts || !wordEls.length) return;
    let hold = 0;
    while (hold < wordStarts.length && wordStarts[hold] <= positionMs) hold += 1;
    if (hold === wordHold) return;
    wordHold = hold;
    for (let k = 0; k < wordEls.length; k += 1) {
      const want = k < hold ? "true" : "false";
      const node = wordEls[k];
      if (node.dataset.active !== want) node.dataset.active = want;
    }
  }

  /* --------------------------------------------------------------------------
     平滑推进：宿主的进度按 250ms 量化（见宿主 audio.js），逐字点亮如果只吃
     这个节奏会明显「一跳一跳」。给过 playing 时自己按墙钟补齐中间帧；
     没给 playing 的皮肤（第三方样式）保持原样，按每次 setPosition 点亮。
     -------------------------------------------------------------------------- */

  /** 距上次进度推送最多外推多久：超过说明推送停了（暂停没同步 / 卡缓冲 / 窗口
   *  被隐藏），继续外推会让字比声音先唱完，所以冻在最后已知位置等下一次推送。 */
  const SMOOTH_MAX_MS = 700;

  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function hasWordLine() {
    return activeIndex >= 0 && wordIdx === activeIndex && Array.isArray(wordStarts) && wordStarts.length > 0;
  }

  function smoothTick() {
    smoothRaf = 0;
    if (destroyed || !playing || !hasWordLine()) return;
    const extra = nowMs() - baseAt;
    if (extra > SMOOTH_MAX_MS) {
      paintWords(basePos); // 推送停了：退回最后已知位置并停止外推
      return;
    }
    paintWords(basePos + extra);
    smoothRaf = requestAnimationFrame(smoothTick);
  }

  function syncSmooth() {
    const want =
      playing &&
      hasWordLine() &&
      typeof requestAnimationFrame === "function" &&
      typeof cancelAnimationFrame === "function";
    if (!want) {
      if (smoothRaf) {
        cancelAnimationFrame(smoothRaf);
        smoothRaf = 0;
      }
      return;
    }
    if (!smoothRaf) smoothRaf = requestAnimationFrame(smoothTick);
  }

  /** 播放状态（皮肤在 state / progress 补丁里带上）。给了才会开平滑推进。 */
  function setPlaying(value) {
    playing = Boolean(value);
    if (playing) {
      baseAt = nowMs();
    } else {
      paintWords(basePos); // 暂停时按最后已知位置落一次（外推值要清掉）
    }
    syncSmooth();
  }

  /**
   * 设定歌词内容。
   * @param {LyricLine[]} next
   * @param {{ emptyText?: string, emptyHint?: string, showOpenFolder?: boolean }} [meta]
   */
  function setLines(next, meta = {}) {
    lines = Array.isArray(next) ? next : [];
    activeIndex = -1;
    // 整块 DOM 重画：字素 span 也随之消失，状态必须一起清掉
    wordIdx = -1;
    wordEls = [];
    wordStarts = null;
    wordHold = -1;
    syncSmooth();
    if (!lines.length) {
      renderEmpty(meta);
      return;
    }
    scroll.innerHTML = lines.map((l, i) => lineHtml(l, i)).join("");
    scroll.scrollTop = 0;
  }

  function renderEmpty(meta = {}) {
    const text = meta.emptyText || "暂无歌词";
    const hint = meta.emptyHint ? `<div class="lyrics__empty-text">${esc(meta.emptyHint)}</div>` : "";
    const btn =
      interactive && meta.showOpenFolder !== false
        ? `<button class="btn btn--sm" type="button" data-lyrics-act="open-folder"><span>打开所在文件夹</span></button>`
        : "";
    scroll.innerHTML = `
      <div class="lyrics__empty">
        <svg class="lyrics__empty-icon" aria-hidden="true"><use href="#i-lyrics"/></svg>
        <div class="lyrics__empty-text">${esc(text)}</div>
        ${hint}
        ${btn}
      </div>`;
  }

  /** 按 data-lyric-index 取某一行的元素（下标来自 setLines 时写入的属性） */
  function lineElAt(i) {
    return /** @type {HTMLElement|null} */ (scroll.querySelector(`.lyric[data-lyric-index="${i}"]`));
  }

  /**
   * 高亮第 idx 行并把视图滚过去。
   * @param {number} idx
   * @param {{ immediate?: boolean }} [o]
   */
  function setActive(idx, o = {}) {
    lastWanted = idx;
    if (destroyed) return;
    if (!scroll.querySelector(".lyric")) return;
    if (idx === activeIndex && !o.immediate) return;
    // 上一句当前行是谁（先记下来：下面的循环会把 aria-current 洗掉）
    const prev = activeIndex >= 0 && activeIndex !== idx ? lineElAt(activeIndex) : null;
    activeIndex = idx;

    scroll.querySelectorAll(".lyric").forEach((node, i) => {
      const active = i === idx;
      node.setAttribute("aria-current", String(active));
      /** @type {HTMLElement} */ (node).dataset.past = String(idx >= 0 && i < idx);
      // 新的当前行要是还挂着上一次的退场状态，先摘掉（顺带让下一次退场能重播）
      if (active) node.removeAttribute("data-exit");
    });

    // 行退场：只给**上一句当前行**挂 data-exit —— seek 跳过去会让一整段行
    // 变成 past，那不该集体播一遍退场动画
    if (prev) prev.dataset.exit = "1";

    // 字级（逐字）：离开旧行要还原成纯文本，进入新行才拆字素
    syncWordLine();
    paintWords(basePos);

    // 用户正在手动翻歌词时不抢滚动位置
    if (Date.now() < userScrollingUntil) return;
    scrollToLine(idx, { immediate: Boolean(o.immediate) });
  }

  /**
   * 按播放进度推算出应该高亮的行（宿主只推进度，行号在这里算，避免两处各算一遍）。
   *
   * `o.playing` 给了才开「按墙钟补齐中间帧」的平滑推进（见 setPlaying）。
   * @param {number} positionMs
   * @param {{ immediate?: boolean, playing?: boolean }} [o]
   */
  function setPosition(positionMs, o = {}) {
    basePos = positionMs;
    baseAt = nowMs();
    if (typeof o.playing === "boolean") playing = o.playing;
    setActive(findLyricIndex(lines, positionMs), o);
    paintWords(positionMs);
    syncSmooth();
  }

  function destroy() {
    destroyed = true;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = null;
    if (smoothRaf) {
      cancelAnimationFrame(smoothRaf);
      smoothRaf = 0;
    }
    scroll.removeEventListener("wheel", markUserScroll);
    scroll.removeEventListener("touchmove", markUserScroll);
    scroll.removeEventListener("pointerdown", markUserScroll);
    scroll.removeEventListener("click", onClick);
    scroll.removeEventListener("keydown", onKeydown);
    root.remove();
  }

  return {
    element: root,
    scrollElement: scroll,
    setLines,
    setActive,
    setPosition,
    setPlaying,
    destroy,
    get lines() {
      return lines;
    },
    get activeIndex() {
      return activeIndex;
    },
  };
}

/** 最小 HTML 转义（包不能依赖宿主的 utils，第三方皮肤也可能用到） */
function defaultEscape(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]
  );
}
