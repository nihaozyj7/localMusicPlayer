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
import { coverVersion, commit, isLiked, reorderQueue, state, toggleSelectedSong } from "../store.js";
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
  ];

  /** 表格模式：队列视图要拖拽手柄 */
  get mode() {
    return state.view === "queue" ? "playlist" : "library";
  }

  get selecting() {
    return state.view === "playlist" && state.playlistSelecting;
  }

  updated() {
    if (state.view === "queue") this.bindQueueSort();
    else if (this._sortable) {
      this._sortable.destroy();
      this._sortable = null;
    }
  }

  disconnectedCallback() {
    this._sortable?.destroy();
    this._sortable = null;
    super.disconnectedCallback();
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
          ${repeat(
            songs,
            (song) => song.id,
            (song, index) => this.rowTemplate(song, index, mode)
          )}
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
          <div class="track__title">${song.title}</div>
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
      const key = sortBtn.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = key === "addedAt" ? "desc" : "asc";
      }
      commit();
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
