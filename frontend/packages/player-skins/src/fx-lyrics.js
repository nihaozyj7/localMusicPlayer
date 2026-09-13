// @ts-check
/* ==========================================================================
   fx-lyrics.js — 带「文字动效」的歌词渲染器（四个特效样式共用）
   --------------------------------------------------------------------------
   与 lyrics-view.js 的分工：
     · lyrics-view.js 是**朴素**渲染器（每行一个节点），给经典 / 沉浸 / 简约用；
     · 本文件是**特效**渲染器，把每行拆成「字素单元」，从而支持：
         1) 逐字入场（错峰 + 模糊 + 缩放入场，逐字单位可各有一条 CSS 动画）；
         2) 逐字点亮（卡拉OK）：按行内进度给单元打 data-hold="done|now|todo"，
            只改当前那一行，不碰整篇 DOM；
         3) 运动残影（motion echo）：行上带 data-text，样式用 ::after + attr() 复制
            一份做拖尾，不需要第二份 DOM；
         4) 扫光（sweep）：由各皮肤用 background-clip:text + 动画自己实现。

   为什么拆字素要自己算行内进度：宿主只推「当前毫秒」，逐字时间戳在 LRC 里
   本来就没有（只有行级）。这里用「本行起点 → 下一行起点」做线性插值 ——
   与市面上绝大多数 LRC 播放器一致，行内节奏均匀，不会越走越偏。
   字素切分优先用 Intl.Segmenter（emoji / 组合字符不会被劈成两半），
   老内核退回 Array.from。

   性能约定（照抄 folia 的 guardrail）：
     · setPosition 每帧被调用，但只有「高亮行变了」或「点亮位置变了」才写 DOM；
     · 逐字点亮只操作**当前行**的单元，历史行冻结在 done；
     · 不在 rAF 里创建任何新对象（切分结果在 setLines 时一次算好）。
   ========================================================================== */

import { findLyricIndex } from "./lrc.js";

/** 用户手动滚动后，多久重新接管自动滚动 */
const USER_SCROLL_PAUSE_MS = 1200;

/**
 * @typedef {{ time: number, text: string }} LyricLine
 */

/** 把一行文本切成「字素单元」（保留空白，位置对得上） */
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

/** 最小 HTML 转义（包不依赖宿主 utils） */
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

/**
 * 创建一个特效歌词视图。
 *
 * @param {HTMLElement} host 放置根节点的容器
 * @param {object} [opts]
 * @param {(ms:number) => void} [opts.onSeek]
 * @param {boolean} [opts.interactive] 默认 true（桌面背景歌词窗口会传 false）
 * @param {(text:string) => string} [opts.escape]
 * @param {string} [opts.emptyText]
 * @returns {object}
 */
export function createFxLyrics(host, opts = {}) {
  const esc = opts.escape || defaultEscape;
  const interactive = opts.interactive !== false;

  const root = document.createElement("div");
  root.className = "fxl";
  if (!interactive) root.dataset.passive = "1";
  const scroll = document.createElement("div");
  scroll.className = "fxl__scroll";
  const inner = document.createElement("div");
  inner.className = "fxl__inner";
  scroll.appendChild(inner);
  root.appendChild(scroll);
  host.appendChild(root);

  /** @type {LyricLine[]} */
  let lines = [];
  /** 每行的字素数组（setLines 时一次算好，帧循环里不再做字符串切分） */
  let units = [];
  /** @type {HTMLElement[]} */
  let lineEls = [];
  let activeIndex = -1;
  let holdUnit = -1;
  let userScrollingUntil = 0;
  let resumeTimer = null;
  let destroyed = false;
  let lastWanted = -1;

  const markUserScroll = () => {
    userScrollingUntil = Date.now() + USER_SCROLL_PAUSE_MS;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      if (destroyed) return;
      activeIndex = -2; // 哨兵：强制下一次重算滚动
      setActive(lastWanted, { immediate: true });
    }, USER_SCROLL_PAUSE_MS + 40);
  };

  if (interactive) {
    scroll.addEventListener("wheel", markUserScroll, { passive: true });
    scroll.addEventListener("touchmove", markUserScroll, { passive: true });
    scroll.addEventListener("pointerdown", markUserScroll, { passive: true });
  }

  function onClick(e) {
    const line = e.target.closest?.(".fxl__line");
    if (!line) return;
    const t = Number(line.dataset.time);
    if (Number.isFinite(t)) opts.onSeek?.(t);
  }

  function onKeydown(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const line = e.target.closest?.(".fxl__line");
    if (!line) return;
    e.preventDefault();
    const t = Number(line.dataset.time);
    if (Number.isFinite(t)) opts.onSeek?.(t);
  }

  if (interactive) {
    scroll.addEventListener("click", onClick);
    scroll.addEventListener("keydown", onKeydown);
  }

  /** 把某一行滚到容器垂直中央（跳过已经在目标附近的，避免每帧发起平滑滚动） */
  function scrollToLine(idx, immediate) {
    if (idx < 0) {
      scroll.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
      return;
    }
    const target = lineEls[idx];
    if (!target) return;
    const top = target.offsetTop - (scroll.clientHeight - target.offsetHeight) / 2;
    const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const clamped = Math.max(0, Math.min(top, max));
    if (Math.abs(scroll.scrollTop - clamped) < 4) return;
    scroll.scrollTo({ top: clamped, behavior: immediate ? "auto" : "smooth" });
  }

  /**
   * 设定歌词内容。
   * @param {LyricLine[]} next
   * @param {{ emptyText?: string, emptyHint?: string }} [meta]
   */
  function setLines(next, meta = {}) {
    lines = Array.isArray(next) ? next : [];
    units = [];
    lineEls = [];
    activeIndex = -1;
    holdUnit = -1;
    lastWanted = -1;

    if (!lines.length) {
      inner.innerHTML = `<div class="fxl__empty">${esc(meta.emptyText || "暂无歌词")}</div>`;
      return;
    }

    const parts = [];
    for (let i = 0; i < lines.length; i += 1) {
      const text = lines[i].text ?? "";
      const chars = splitGraphemes(text);
      units.push(chars);
      // data-text 给「运动残影」用（CSS ::after + attr()），不做第二份 DOM
      const body = chars
        .map((ch, k) => {
          const safe = esc(ch);
          // 空白单元不参与入场动画（否则整行会先塌一下）
          const isSpace = /^\s+$/.test(ch);
          return `<span class="fxl__u"${isSpace ? ' data-space="1"' : ""} style="--i:${k};--n:${chars.length}">${safe}</span>`;
        })
        .join("");
      const open = interactive
        ? `<div class="fxl__line" role="button" tabindex="0" data-index="${i}" data-time="${lines[i].time}" data-state="todo" data-text="${esc(text)}">`
        : `<div class="fxl__line" data-index="${i}" data-time="${lines[i].time}" data-state="todo" data-text="${esc(text)}">`;
      parts.push(`${open}<span class="fxl__text">${body}</span></div>`);
    }
    inner.innerHTML = parts.join("");
    lineEls = /** @type {HTMLElement[]} */ (Array.from(inner.children));
  }

  /** 只更新「当前行」的逐字点亮位置；历史行在切行时一次性冻结 */
  function paintHold(idx, positionMs) {
    const el = lineEls[idx];
    if (!el) return;
    const chars = units[idx] || [];
    const n = chars.length;
    if (!n) return;
    const start = lines[idx].time;
    const end = lines[idx + 1]?.time ?? start + 4000;
    const span = Math.max(1, end - start);
    const progress = Math.max(0, Math.min(1, (positionMs - start) / span));
    const hold = Math.max(0, Math.min(n, Math.ceil(progress * n)));
    if (hold === holdUnit) return;
    holdUnit = hold;
    const nodes = /** @type {HTMLElement[]} */ (Array.from(el.querySelector(".fxl__text").children));
    for (let k = 0; k < nodes.length; k += 1) {
      const node = nodes[k];
      const want = k < hold - 1 ? "done" : k === hold - 1 ? "now" : "todo";
      if (node.dataset.hold !== want) node.dataset.hold = want;
    }
  }

  /**
   * 高亮第 idx 行（并把视图滚过去）。
   * @param {number} idx
   * @param {{ immediate?: boolean }} [o]
   */
  function setActive(idx, o = {}) {
    lastWanted = idx;
    if (destroyed) return;
    if (!lineEls.length) return;
    if (idx === activeIndex && !o?.immediate) return;

    // 离开旧行：把它的单元冻结成 done（不再每帧重写历史行）
    if (activeIndex >= 0 && activeIndex < lineEls.length) {
      const prev = lineEls[activeIndex];
      prev.dataset.state = "past";
      prev.removeAttribute("aria-current");
      const prevNodes = /** @type {HTMLElement[]} */ (Array.from(prev.querySelector(".fxl__text").children));
      for (let k = 0; k < prevNodes.length; k += 1) {
        if (prevNodes[k].dataset.hold !== "done") prevNodes[k].dataset.hold = "done";
      }
    }

    activeIndex = idx;
    holdUnit = -1;

    if (idx >= 0 && lineEls[idx]) {
      const el = lineEls[idx];
      el.dataset.state = "active";
      el.setAttribute("aria-current", "true");
      // 重新触发入场动画（同一行反复成为当前行时也要重放）
      el.dataset.enter = String(Number(el.dataset.enter || 0) + 1);
    }

    if (Date.now() < userScrollingUntil) return;
    scrollToLine(idx, Boolean(o?.immediate));
  }

  /** 按播放进度推进（宿主每帧调用一次） */
  function setPosition(positionMs, o = {}) {
    const idx = findLyricIndex(lines, positionMs);
    if (idx !== activeIndex) setActive(idx, o);
    if (idx >= 0) paintHold(idx, positionMs);
  }

  function markMeasure() {
    if (activeIndex >= 0) scrollToLine(activeIndex, true);
  }

  function destroy() {
    destroyed = true;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = null;
    scroll.removeEventListener("wheel", markUserScroll);
    scroll.removeEventListener("touchmove", markUserScroll);
    scroll.removeEventListener("pointerdown", markUserScroll);
    scroll.removeEventListener("click", onClick);
    scroll.removeEventListener("keydown", onKeydown);
    root.remove();
    lines = [];
    units = [];
    lineEls = [];
  }

  return {
    element: root,
    scrollElement: scroll,
    setLines,
    setActive,
    setPosition,
    markMeasure,
    destroy,
    get lines() {
      return lines;
    },
    get activeIndex() {
      return activeIndex;
    },
  };
}
