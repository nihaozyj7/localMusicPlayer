/* ==========================================================================
   ui/track-table.js — 曲目表格（所有歌曲 / 播放列表 / 歌单 / 队列 共用）
   --------------------------------------------------------------------------
   迁移前后对比：

     迁移前（tracks.js）           迁移后（本文件）
     ─────────────────────────     ────────────────────────────────────────
     tableStates(WeakMap)          无（Lit 自己就是 keyed repeat）
     rowFields 快照 + 逐字段比较   Lit 的 part 级 diff
     patchRowEl 手写 setter        模板表达式
     reconcileRows + insertBefore  repeat(songs, s => s.id, …)
     dataset.rendered / headMode   一个 keyed(mode) 分支

   行为完全保留：切歌只改 aria-current / data-playing，
   封面变了才换 img src（且先在游离 Image 上预加载，避免列表整片闪白）。
   ========================================================================== */

import Sortable from "sortablejs";
import { noChange } from "lit";
import { Directive, directive } from "lit/directive.js";
import { MpElement, define, html, nothing, repeat, icon } from "./base.js";
import { toast } from "./overlays.js";
import { bindCoverFallback } from "./overlays.js";
import {
  coverVersion,
  commit,
  freshDownloadsKey,
  isFreshDownload,
  isLiked,
  reorderQueue,
  state,
  toggleSelectedSong,
  toggleSort,
} from "../store.js";
import { activateRow, markDragEnd, openColumnMenu, openTrackMenu, shouldIgnoreRowClick } from "../tracks.js";
import { currentContext, playContext, toggleLike } from "../store.js";
import { DEFAULT_COVER, coverOf, fmtTime } from "../utils.js";

/* --------------------------------------------------------------------------
   封面地址指令
   --------------------------------------------------------------------------
   为什么不直接写 src：那样浏览器会先丢掉旧图，新图解码完成之前那一格是空的 ——
   几十行同时换封面看起来就是「整个列表闪了一下」。除了 data:（同源内存图，
   本来就快），其余地址先在一个游离的 Image 上预加载，就绪之后再替换。

   指令的 update() 拿到的是 AttributePart，可以从 part.element 拿到 <img> 本身；
   返回 noChange 表示「属性由我自己写，Lit 不要插手」。
   -------------------------------------------------------------------------- */
const coverSrcDirective = directive(
  class extends Directive {
    render() {
      return noChange;
    }
    update(part, [src]) {
      const img = part.element;
      if (!img) return noChange;
      bindCoverFallback(img);
      const want = src || DEFAULT_COVER;
      if (img.getAttribute("src") === want) return noChange;
      if (want.startsWith("data:")) {
        img.src = want;
        return noChange;
      }
      img.__coverWant = want;
      const probe = new Image();
      probe.decoding = "async";
      // 加载成功与失败都换过去：失败时由 bindCoverFallback 兜底成默认封面。
      // 不换的话这一行会一直停在上一首歌的封面上，比空白更糟。
      const swap = () => {
        if (img.__coverWant === want) img.src = want;
      };
      probe.addEventListener("load", swap);
      probe.addEventListener("error", swap);
      probe.src = want;
      return noChange;
    }
  }
);

/** 用法：<img src=${coverSrc(url)} /> */
const coverSrc = (url) => coverSrcDirective(url);

/* --------------------------------------------------------------------------
   窗口化（只渲染滚动位置附近的行）
   --------------------------------------------------------------------------
   为什么需要：lit-html 的 repeat 指令**每次 update 都会对每一行调用行模板**
   （node_modules/lit-html/directives/repeat.js 的 dt()），再逐行 diff。这份
   开销与行数成正比：实测 8000 首时「切一首歌」是一次 234~343ms 的主线程长
   任务、首屏首绘 1336ms（16000 首 6536ms）。tracktable.css 里的
   content-visibility 只省掉视口外行的布局与绘制，JS 这一份它管不到。

   做法：只渲染「滚动位置附近的行」，上下各放一个占位块把滚动条撑到正确高度。

   ★ 只在 library 模式且行数超过 WINDOW_MIN_ROWS 时启用：
     · 队列（playlist 模式）要保持全部行都在 DOM 里 —— 拖拽排序依赖它；
     · 小列表本来就便宜，全量渲染能保住所有既有 DOM 契约
       （tools/*.mjs 自检脚本与 probe.js 都按 .track 行查询）；
     · 行的 DOM 结构、data-* / aria-* / class 与事件委托一律不变，
       所以对「看得见的那部分」是零改动。
   -------------------------------------------------------------------------- */

/** 启用窗口化的最小行数；不超过它时行为与从前完全一致 */
export const WINDOW_MIN_ROWS = 300;
/** 视口上下各多渲染的行数（滚动时不会看到空白） */
export const WINDOW_BUFFER = 8;
/** 量不到真实行高时的兜底值（= tokens.css 的 --row-h） */
const ROW_H_FALLBACK = 56;

/**
 * 由「已经滚过的像素」算出要渲染的行区间与上下占位高度（纯函数，单测盯它）。
 *
 * @param {number} total 总行数
 * @param {number} scrollTop 已经滚过的像素（几何量法见 scrolledPx，不是 scrollTop 本身）
 * @param {number} viewportH 可视区高度（像素，已扣掉吸顶表头）
 * @param {number} rowH 行高（像素）
 * @param {number} [buffer] 视口外多渲染的行数
 * @returns {{start:number,end:number,padTop:number,padBottom:number,rowH:number}}
 */
export function computeWindow(total, scrollTop, viewportH, rowH, buffer = WINDOW_BUFFER) {
  const count = Math.max(0, Math.floor(Number(total)) || 0);
  const height = Number(rowH) > 0 ? Number(rowH) : ROW_H_FALLBACK;
  const gap = Math.max(0, Math.floor(Number(buffer)) || 0);
  const scrolled = Math.max(0, Number(scrollTop) || 0);
  const viewport = Math.max(0, Number(viewportH) || 0);
  // 至少覆盖「一屏 + 上下缓冲」。+1 是为了「滚动位置正好落在两行之间」时
  // 视口底部那一行也在窗口里（否则它会缺一条，滚动时闪一下）。
  const span = Math.max(1, Math.ceil(viewport / height) + gap * 2 + 1);
  let start = Math.min(count, Math.max(0, Math.floor(scrolled / height) - gap));
  let end = Math.min(count, start + span);
  // ★ 列表变短（筛选 / 切歌单 / 重扫）时滚动位置可能还停在旧的内容高度上：
  //   这时 start 会被夹到 count、end 也跟着等于 count —— 窗口空了、整块列表
  //   空白。宁可把窗口整体回退到「最后几屏」，也绝不能渲染 0 行。
  if (count > 0 && end <= start) {
    end = count;
    start = Math.max(0, count - span);
  }
  return {
    start,
    end,
    padTop: start * height,
    padBottom: Math.max(0, (count - end) * height),
    rowH: height,
  };
}

/**
 * 这个视图要不要窗口化（纯函数，单测盯阈值）。
 *
 * 只对 library 模式的大列表启用：
 *   · 队列（playlist 模式）必须保持全部行都在 DOM 里 —— 拖拽排序依赖它；
 *   · 行数不超过 WINDOW_MIN_ROWS 时全量渲染更省事，也保住所有既有 DOM 契约
 *     （tools/*.mjs 自检脚本与 probe.js 都按 .track 行查询）。
 *
 * @param {string} mode 表格模式（"library" / "playlist"）
 * @param {number} total 行数
 */
export function shouldWindow(mode, total) {
  return mode === "library" && (Math.floor(Number(total)) || 0) > WINDOW_MIN_ROWS;
}

export class MpTrackTable extends MpElement {
  static deps = (s) => [
    s.view,
    s.playlistId,
    s.visibleVersion,
    s.sortKey,
    s.sortDir,
    s.config.listDensity,
    s.config.showAlbumColumn,
    s.playlistSelecting,
    s.selectedIds,
    s.currentId,
    s.playing,
    s.likedIds,
    coverVersion(),
    s.visibleSongs.length,
    // 「刚下载」的「新」角标：置顶会改 visibleVersion，但角标本身可能在顺序上
    // 看不出来（那首歌本来就排第一），所以签名也要进依赖
    freshDownloadsKey(),
  ];

  /** 表格模式：队列视图要拖拽手柄 */
  get mode() {
    return state.view === "queue" ? "playlist" : "library";
  }

  get selecting() {
    return state.view === "playlist" && state.playlistSelecting;
  }

  constructor() {
    super();
    /** 量到的真实行高；0 = 还没量过（用 tokens 兜底，下一次 update 纠正） */
    this._rowH = 0;
    /** 滚动容器（.content-body）；连接后挂 scroll 监听（见 syncScroller） */
    this._scroller = null;
    this._scrollRaf = 0;
    /** window resize 监听是否已经挂上（连接/断开之间切换，避免重复挂） */
    this._resizeBound = false;
    // 箭头属性：既能直接交给 addEventListener，也保证 this 正确。
    // ★ resize 与 scroll 走同一个入口 —— 视口变高之后必须重算窗口，
    //   否则「一屏能显示多少行」还是旧值：底部留一大片空白，
    //   要等用户随便滚一下（scroll 事件）才补上。
    this._onScroll = () => this.scheduleWindowUpdate();
    this._onResize = () => this.scheduleWindowUpdate();
  }

  onConnected() {
    // 视口尺寸变化（拉高/拉窄窗口、系统缩放、进入全屏）要重算窗口。
    // 同一个函数引用再挂一次是无操作（DOM 自身按 type+listener+capture 去重），
    // 这里再用一个标志收口，断开后重新连接时也不会叠着。
    if (this._resizeBound) return;
    window.addEventListener("resize", this._onResize);
    this._resizeBound = true;
  }

  /** rAF 节流：滚动 / 尺寸变化都只是「重算一次窗口」，不重建整表 */
  scheduleWindowUpdate() {
    if (this._scrollRaf) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = 0;
      if (this.windowing()) this.requestUpdate();
    });
  }

  updated() {
    if (state.view === "queue") this.bindQueueSort();
    else if (this._sortable) {
      this._sortable.destroy();
      this._sortable = null;
    }
    this.syncWindowState();
  }

  disconnectedCallback() {
    if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf);
    this._scrollRaf = 0;
    if (this._resizeBound) {
      window.removeEventListener("resize", this._onResize);
      this._resizeBound = false;
    }
    this._scroller?.removeEventListener("scroll", this._onScroll);
    this._scroller = null;
    this._sortable?.destroy();
    this._sortable = null;
    super.disconnectedCallback();
  }

  /* ------------------------------------------------------------------------
     窗口化：区间计算与滚动同步
     ------------------------------------------------------------------------ */

  /** 这个视图要不要窗口化（只对 library 模式的大列表；队列必须全量渲染） */
  windowing() {
    return shouldWindow(this.mode, state.visibleSongs.length);
  }

  /** 绑定滚动容器（幂等；容器可能比组件晚一步就位，所以每次 updated 都试一次） */
  syncScroller() {
    const el = this.closest(".content-body");
    if (el === this._scroller) return;
    this._scroller?.removeEventListener("scroll", this._onScroll);
    this._scroller = el;
    el?.addEventListener("scroll", this._onScroll, { passive: true });
  }

  /**
   * 每次渲染之后同步两件「与渲染结果有关」的事：
   *   1. 绑定滚动容器；
   *   2. 量一次真实行高 —— 密度档位（compact / roomy）会改行高，代码里那份
   *      兜底值只用于「第一帧还没量到」的时候。量到的值变了要再排一次更新，
   *      否则占位高度会按旧行高算，滚动条长度与真实内容对不上。
   */
  syncWindowState() {
    this.syncScroller();
    const sample = this.querySelector(".track");
    if (!sample) return;
    const h = sample.getBoundingClientRect().height;
    if (!(h > 0) || Math.abs(h - this._rowH) <= 0.5) return;
    this._rowH = h;
    if (this.windowing()) this.requestUpdate();
  }

  /** 行高（优先用实测值；没量到就按 tokens 的 --row-h + 密度档位兜底） */
  rowHeight() {
    if (this._rowH > 0) return this._rowH;
    const cs = getComputedStyle(this.querySelector(".tracks") || this);
    const px = (name) => {
      const n = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const base = px("--row-h") || ROW_H_FALLBACK;
    if (state.config.listDensity === "compact") return px("--row-h-compact") || 44;
    if (state.config.listDensity === "roomy") return base + 12;
    return base;
  }

  /** 吸顶表头的高度（可视区与「已滚过的像素」都要扣掉它） */
  headHeight() {
    return this.querySelector(".tracks__head")?.getBoundingClientRect().height || 0;
  }

  /**
   * 「已经滚过了多少像素」。
   *
   * ★ 不能直接用 scroller.scrollTop：.tracks__body 未必与滚动容器内容顶端
   *   对齐（外层还有 .page / padding），而且窗口化之后占位块本身就在 body 里。
   *   用两个 rect 相减是几何事实，与 padding / 滚动位置都无关。
   */
  scrolledPx() {
    const scroller = this._scroller;
    const bodyEl = this.querySelector(".tracks__body");
    if (!scroller || !bodyEl) return 0;
    const scRect = scroller.getBoundingClientRect();
    const bodyRect = bodyEl.getBoundingClientRect();
    return Math.max(0, scRect.top + this.headHeight() - bodyRect.top);
  }

  /** 可视区高度（扣掉吸顶表头） */
  viewportH() {
    const scroller = this._scroller;
    if (!scroller) return Math.max(0, window.innerHeight * 0.6);
    return Math.max(0, scroller.clientHeight - this.headHeight());
  }

  /** 当前要渲染的行区间；不窗口化时返回 null（= 全量渲染） */
  windowRange() {
    if (!this.windowing()) return null;
    return computeWindow(state.visibleSongs.length, this.scrolledPx(), this.viewportH(), this.rowHeight());
  }

  /**
   * 把某一首歌的行滚进渲染窗口（「定位到当前播放」用，见 tracks.js#locateCurrentSong）。
   *
   * 窗口化之后目标行可能根本不在 DOM 里 —— 那里会查不到行，于是「定位」误报
   * 「当前播放的歌曲不在这个列表里」。这里把滚动容器滚到该行附近并重渲染，
   * 调用方等 updateComplete 之后就能查到那一行。
   *
   * @param {string} id
   * @returns {boolean} 这首歌是否属于当前列表（false = 真的不在这个列表里）
   */
  revealRow(id) {
    const index = state.visibleSongs.findIndex((s) => s.id === id);
    if (index < 0) return false;
    if (!this.windowing()) return true;
    const scroller = this._scroller;
    const bodyEl = this.querySelector(".tracks__body");
    if (!scroller || !bodyEl) return true;
    const rowH = this.rowHeight();
    const head = this.headHeight();
    const scRect = scroller.getBoundingClientRect();
    const bodyRect = bodyEl.getBoundingClientRect();
    // .tracks__body 顶边在滚动内容坐标里的位置
    const bodyTop = bodyRect.top - scRect.top + scroller.scrollTop;
    const rows = Math.max(1, Math.floor(Math.max(0, scroller.clientHeight - head) / rowH));
    // 让目标行落在视口中间：比贴边更好看，也给落点提示留出滚动余量
    const target = Math.max(0, bodyTop + Math.max(0, index - Math.floor(rows / 2)) * rowH - head);
    // ★ 必须**瞬时**跳过去，不能走 .content-body 的 scroll-behavior: smooth：
    //   平滑滚动下 scrollTop 要几百毫秒才到位，而这里紧接着就要按几何算渲染
    //   窗口 —— 那一次渲染会算出「还在旧位置」的窗口，目标行不在里面，
    //   调用方等 updateComplete 之后仍然查不到行（落点提示也就不出现了）。
    if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top: target, behavior: "instant" });
    else scroller.scrollTop = target;
    // 渲染窗口是 render() 里按几何算的：这里主动排一次更新，调用方 await
    // updateComplete 就能拿到这一行（不依赖 scroll 事件的时机）
    this.requestUpdate();
    return true;
  }

  /* ------------------------------------------------------------------------
     队列拖拽排序
     ------------------------------------------------------------------------
     需求：不要自己实现拖拽逻辑；并且「拖拽排序后界面要真的看到效果」。
     与侧边栏同一套做法：onEnd 时先把节点搬回原位，再由 Lit 按新数据顺序移动。
     ------------------------------------------------------------------------ */
  bindQueueSort() {
    const body = this.querySelector(".tracks__body");
    if (!body) return;
    if (this._sortable && this._sortable.el === body) return;
    this._sortable?.destroy();
    this._sortable = Sortable.create(body, {
      handle: "[data-handle]",
      draggable: ".track",
      animation: 0,
      ghostClass: "is-dragging",
      chosenClass: "is-dragging",
      onEnd: (evt) => {
        markDragEnd();
        const from = evt.oldIndex;
        const to = evt.newIndex;
        if (from == null || to == null || from === to) return;
        const parent = evt.from;
        const siblings = Array.from(parent.children).filter((n) => n !== evt.item);
        parent.insertBefore(evt.item, siblings[from] ?? null);
        reorderQueue(from, to);
        toast("已调整播放顺序 · 播放模式已切回列表循环", { duration: 1800 });
      },
    });
  }

  render() {
    const mode = this.mode;
    const songs = state.visibleSongs;
    // 窗口区间：null = 全量渲染（小列表 / 队列）。行模板拿到的一律是
    // **在整个列表里的绝对下标** —— data-index 是播放动作（playContext）
    // 与键盘/定位路径都依赖的契约，不能变成窗口内下标。
    const win = this.windowRange();
    return html`
      <!-- 事件委托挂在 .tracks 上（范围含表头）：排序按钮在 .tracks__head 里，
           只挂 .tracks__body 的话点表头排序会没有反应。 -->
      <div
        class="tracks"
        data-mode=${mode}
        data-density=${state.config.listDensity || "cozy"}
        data-album=${state.config.showAlbumColumn === false ? "off" : "on"}
        @click=${(e) => this.onClick(e)}
        @dblclick=${(e) => this.onDblClick(e)}
        @contextmenu=${(e) => this.onContextMenu(e)}
      >
        ${this.headTemplate(mode)}
        <div class="tracks__body">
          ${
            win
              ? html`<div
                    class="tracks__pad"
                    data-pad="top"
                    style=${"height:" + win.padTop + "px"}
                    aria-hidden="true"
                  ></div>
                  ${repeat(
                    songs.slice(win.start, win.end),
                    (song) => song.id,
                    (song, index) => this.rowTemplate(song, win.start + index, mode)
                  )}
                  <div
                    class="tracks__pad"
                    data-pad="bottom"
                    style=${"height:" + win.padBottom + "px"}
                    aria-hidden="true"
                  ></div>`
              : repeat(
                  songs,
                  (song) => song.id,
                  (song, index) => this.rowTemplate(song, index, mode)
                )
          }
        </div>
      </div>
    `;
  }

  /* ------------------------------------------------------------------------
     表头
     ------------------------------------------------------------------------
     队列（playlist 模式）的顺序由拖拽决定，表头渲染成静态文本。
     排序字段 / 方向只改属性（不重建表头），因此点排序不会丢掉按钮的 hover / 焦点。
     ------------------------------------------------------------------------ */
  headTemplate(mode) {
    const sortable = mode !== "playlist";
    const cell = (key, label, cls = "") => {
      if (!sortable) return html`<div class="tracks__sort ${cls}" data-static="1">${label}</div>`;
      const classes = ["tracks__sort", cls, state.sortKey === key && state.sortDir === "asc" ? "is-asc" : ""]
        .filter(Boolean)
        .join(" ");
      return html`<button
        class=${classes}
        type="button"
        data-sort=${key}
        data-dir=${state.sortKey === key ? state.sortDir : nothing}
      >
        ${label}${icon("chevron-down")}
      </button>`;
    };

    return html`
      <div class="tracks__head" data-mode=${mode}>
        <div class="col-handle"></div>
        <div class="col-index">#</div>
        <div class="col-cover"></div>
        ${cell("title", "标题")} ${cell("album", "专辑", "col-album")} ${cell("duration", "时长")}
        <div class="col-heart" title="我喜欢">${icon("heart")}</div>
        <div class="col-more"></div>
      </div>
    `;
  }

  /* ------------------------------------------------------------------------
     行
     ------------------------------------------------------------------------ */
  rowTemplate(song, index, mode) {
    const selecting = this.selecting;
    const isCurrent = song.id === state.currentId;
    const liked = isLiked(song.id);
    const checked = selecting && state.selectedIds.has(song.id);
    return html`
      <div
        class="track"
        data-id=${song.id}
        data-index=${index}
        data-selectable=${selecting ? "1" : "0"}
        aria-selected=${String(checked)}
        aria-current=${String(isCurrent)}
        data-playing=${isCurrent && state.playing ? "true" : "false"}
      >
        ${
          mode === "playlist"
            ? html`<div class="track__handle" data-handle="1" title="拖动排序">${icon("grip")}</div>`
            : html`<div class="col-handle"></div>`
        }
        <div class="track__index">${this.indexCell(song, index, selecting)}</div>
        <div class="track__cover">
          <img src=${coverSrc(coverOf(song))} alt="" loading="lazy" draggable="false" />
        </div>
        <div class="track__main">
          <div class="track__title" data-new=${isFreshDownload(song.id) ? "1" : nothing}>${song.title}</div>
          <div class="track__sub">
            <span class="track__artist">${song.artist}</span>
            <span class="track__tag">${song.ext}</span>
          </div>
        </div>
        <div class="track__album u-ellipsis">${song.album}</div>
        <div class="track__time">${fmtTime(song.duration)}</div>
        <button
          class="track__heart"
          type="button"
          data-act="like"
          aria-pressed=${String(liked)}
          aria-label="加入我喜欢"
          data-tip=${liked ? "取消喜欢" : "加入我喜欢"}
        >
          ${icon("heart")}
        </button>
        <button class="track__more" type="button" data-act="more" aria-label="更多操作" aria-expanded="false">
          ${icon("more")}
        </button>
      </div>
    `;
  }

  /** 「#」列：普通态是序号 + 播放按钮，多选态是勾选框 */
  indexCell(song, index, selecting) {
    if (selecting) {
      const checked = state.selectedIds.has(song.id);
      return html`<span class="track__check" role="checkbox" aria-checked=${String(checked)}>${icon("check")}</span>`;
    }
    return html`
      <span class="track__num u-num">${index + 1}</span>
      <div class="track__bars"><span></span><span></span><span></span><span></span></div>
      <button class="track__play" type="button" data-act="play" aria-label="播放 ${song.title}">
        ${icon("play")}
      </button>
    `;
  }

  /* ------------------------------------------------------------------------
     事件（在容器上委托，不给每一行挂监听）
     ------------------------------------------------------------------------ */
  onClick(e) {
    // 拖拽排序刚结束时会跟着冒泡一个 click：不拦的话会误判成「单击歌曲行」，
    // 把刚拖过的那首歌设为「下一首播放」。
    if (shouldIgnoreRowClick()) return;

    // 歌单多选模式：点整行 = 勾选 / 取消勾选，连行内按钮也一起拦截
    const selectRow = e.target.closest(".track");
    if (selectRow && state.view === "playlist" && state.playlistSelecting) {
      e.preventDefault();
      toggleSelectedSong(selectRow.dataset.id);
      return;
    }

    const sortBtn = e.target.closest("[data-sort]");
    if (sortBtn) {
      // 走 store 里统一的 toggleSort：点当前字段翻转方向、点别的字段换过去
      // 并用该字段的默认方向。以前这里自己写了一遍同样的逻辑 ——
      // 两份实现一旦不同步，就会出现「点表头和点排序面板结果不一致」。
      toggleSort(sortBtn.dataset.sort);
      return;
    }

    const actEl = e.target.closest("[data-act]");
    if (!actEl) {
      const row = e.target.closest(".track");
      if (row) activateRow(row, { silent: false });
      return;
    }

    const row = actEl.closest(".track");
    const songId = row?.dataset.id;
    if (!songId) return;

    switch (actEl.dataset.act) {
      case "play": {
        const ids = state.visibleSongs.map((s) => s.id);
        playContext(ids, Number(row.dataset.index), currentContext());
        break;
      }
      case "like": {
        toggleLike(songId);
        const liked = isLiked(songId);
        toast(liked ? "已加入「我喜欢」" : "已从「我喜欢」移除", {
          tone: liked ? "success" : "info",
          duration: 1500,
        });
        break;
      }
      case "more":
        openTrackMenu(actEl, songId);
        break;
      default:
        break;
    }
  }

  onDblClick(e) {
    // 多选模式下双击不进入播放（否则选歌时会被突然切歌打断）
    if (state.view === "playlist" && state.playlistSelecting) return;
    const row = e.target.closest(".track");
    if (!row) return;
    const ids = state.visibleSongs.map((s) => s.id);
    playContext(ids, Number(row.dataset.index), currentContext());
    state.playerOpen = true;
    state.pvMode = state.config.playerViewMode;
    commit();
  }

  onContextMenu(e) {
    // 表头右键 = 列显隐菜单（需求：表头右键可以选择显示/隐藏某一列）
    const head = e.target.closest(".tracks__head");
    if (head) {
      e.preventDefault();
      openColumnMenu(e.clientX, e.clientY);
      return;
    }
    const row = e.target.closest(".track");
    if (!row) return;
    e.preventDefault();
    openTrackMenu(null, row.dataset.id, { x: e.clientX, y: e.clientY });
  }
}

define("mp-track-table", MpTrackTable);

export { coverSrc };
