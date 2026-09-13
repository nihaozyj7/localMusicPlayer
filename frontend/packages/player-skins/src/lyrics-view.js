// @ts-check
/* ==========================================================================
   lyrics-view.js — 歌词滚动区（皮肤共用的渲染器）
   --------------------------------------------------------------------------
   为什么放在包里而不是宿主里：需求把「播放详情界面的背景渲染和交互（含歌词）
   」整体划给皮肤包，宿主只提供音频与进度、封面与歌词数据。
   三种内置样式对歌词的要求完全一样（自动居中高亮 + 用户滚动时让位 +
   点行 seek），差别只在 CSS 令牌上，所以抽成一个共用渲染器，三种皮肤各建一份实例。

   两条必须同时成立的行为（从原 playerview.js 原样搬过来，都是踩过坑的）：
     1) 播放时自动把当前行滚到容器垂直中央；
     2) 用户可以用滚轮 / 拖动滚动条自己翻歌词 —— 此时自动滚动必须让位，
        停手约 1.2 秒后再自动接管。少了 2) 会出现「用户刚滚上去就被拽回来」。
   ========================================================================== */

import { findLyricIndex } from "./lrc.js";

/** 用户滚动之后，多久重新接管自动滚动 */
const USER_SCROLL_PAUSE_MS = 1200;

/** 歌词行之间做高亮时的最小重排间隔（同一步内重复调用直接跳过的依据） */
export const EMPTY_SOURCE_LABEL = {
  none: "暂无歌词",
  embedded: "内嵌歌词",
  "lrc-file": "同名 .lrc",
  cache: "本地缓存",
  online: "在线匹配",
};

/** 歌词行的最小结构（与 lrc.js 解析结果一致） */
/**
 * @typedef {{ time: number, text: string }} LyricLine
 */

/**
 * @typedef {Object} LyricsView
 * @property {HTMLElement} element `.lyrics` 根节点
 * @property {HTMLElement} scrollElement `.lyrics__scroll` 滚动容器
 * @property {(lines: LyricLine[], meta?: { emptyText?: string, emptyHint?: string, showOpenFolder?: boolean }) => void} setLines
 * @property {(index: number, opts?: { immediate?: boolean }) => void} setActive
 * @property {(positionMs: number, opts?: { immediate?: boolean }) => void} setPosition
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
 * @returns {LyricsView}
 */
export function createLyricsView(host, opts = {}) {
  const esc = opts.escape || defaultEscape;

  const root = document.createElement("div");
  root.className = "lyrics";
  root.id = "pv-lyrics";
  const scroll = document.createElement("div");
  scroll.className = "lyrics__scroll";
  root.appendChild(scroll);
  host.appendChild(root);

  /** @type {Array<{time:number,text:string}>} */
  let lines = [];
  let activeIndex = -1;
  let userScrollingUntil = 0;
  let resumeTimer = null;
  let destroyed = false;

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

  // passive：歌词区经常在滚，监听器不能拖慢滚动
  scroll.addEventListener("wheel", markUserScroll, { passive: true });
  scroll.addEventListener("touchmove", markUserScroll, { passive: true });
  scroll.addEventListener("pointerdown", markUserScroll, { passive: true });

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

  scroll.addEventListener("click", onClick);
  scroll.addEventListener("keydown", onKeydown);

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
   * 设定歌词内容。
   * @param {Array<{time:number,text:string}>} next
   * @param {{ emptyText?: string, emptyHint?: string, showOpenFolder?: boolean }} [meta]
   */
  function setLines(next, meta = {}) {
    lines = Array.isArray(next) ? next : [];
    activeIndex = -1;
    if (!lines.length) {
      renderEmpty(meta);
      return;
    }
    scroll.innerHTML = lines
      .map(
        (l, i) =>
          `<div class="lyric" role="button" tabindex="0" data-time="${l.time}" data-lyric-index="${i}">${esc(
            l.text
          )}</div>`
      )
      .join("");
    scroll.scrollTop = 0;
  }

  function renderEmpty(meta = {}) {
    const text = meta.emptyText || "暂无歌词";
    const hint = meta.emptyHint ? `<div class="lyrics__empty-text">${esc(meta.emptyHint)}</div>` : "";
    const btn =
      meta.showOpenFolder === false
        ? ""
        : `<button class="btn btn--sm" type="button" data-lyrics-act="open-folder"><span>打开所在文件夹</span></button>`;
    scroll.innerHTML = `
      <div class="lyrics__empty">
        <svg class="lyrics__empty-icon" aria-hidden="true"><use href="#i-lyrics"/></svg>
        <div class="lyrics__empty-text">${esc(text)}</div>
        ${hint}
        ${btn}
      </div>`;
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
    activeIndex = idx;

    scroll.querySelectorAll(".lyric").forEach((node, i) => {
      const active = i === idx;
      node.setAttribute("aria-current", String(active));
      /** @type {HTMLElement} */ (node).dataset.past = String(idx >= 0 && i < idx);
    });

    // 用户正在手动翻歌词时不抢滚动位置
    if (Date.now() < userScrollingUntil) return;
    scrollToLine(idx, { immediate: Boolean(o.immediate) });
  }

  /** 按播放进度推算出应该高亮的行（宿主只推进度，行号在这里算，避免两处各算一遍） */
  function setPosition(positionMs, o = {}) {
    setActive(findLyricIndex(lines, positionMs), o);
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
  }

  return {
    element: root,
    scrollElement: scroll,
    setLines,
    setActive,
    setPosition,
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
