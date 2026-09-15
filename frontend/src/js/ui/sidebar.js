/* ==========================================================================
   ui/sidebar.js — 侧边栏（曲库导航 + 歌单列表 + 拖拽排序）
   --------------------------------------------------------------------------
   迁移前：shell.js 手工拼歌单 HTML，用 lastSidebarKey 字符串去重，
   再遍历 [data-nav] 单独同步选中态。现在歌单列表是一个 keyed repeat，
   选中态是模板里的一个表达式 —— 两者都不会漏。
   ========================================================================== */

import Sortable from "sortablejs";
import { MpElement, define, html, repeat, icon } from "./base.js";
import { toast } from "./overlays.js";
import {
  LIKED_ID,
  clearQueue,
  movePlaylist,
  playlistById,
  commit,
  state,
} from "../store.js";
import { navigate } from "../shell.js";
import { openPlaylistMenu, promptNewPlaylist } from "../playlists.js";
import { fmtCount } from "../utils.js";

/** 刚刚拖拽结束的时间戳：抑制紧随其后的 click，避免被当成「点击歌单」而导航 */
let lastPlaylistDragEndAt = 0;

class MpSidebar extends MpElement {
  static deps = (s) => [
    s.view,
    s.playlistId,
    s.playlistVersion,
    s.songs.length,
    s.queue.length,
  ];

  firstUpdated() {
    this.bindDrag();
  }

  bindDrag() {
    const nav = this.querySelector("#playlist-nav");
    if (!nav || this._sortable) return;
    // 需求：拖拽排序不要自己实现，统一用 SortableJS。
    this._sortable = Sortable.create(nav, {
      draggable: ".navitem",
      // 「我喜欢」固定在第一位：禁止拖动它本身（仍可作为落点）
      filter: '[data-locked="true"]',
      animation: 0,
      ghostClass: "is-dragging",
      onEnd: (evt) => this.onDragEnd(evt),
    });
  }

  /**
   * 拖拽结束。
   *
   * ★ 关键：SortableJS 已经把节点搬到了新位置，而 Lit 的 repeat 维护着自己的
   * 节点链表 —— 两边同时改 DOM 会错位。所以这里**先把节点搬回原位**，
   * 再改数据，让 Lit 按新顺序去移动节点：DOM 的真相只有一个来源。
   */
  onDragEnd(evt) {
    lastPlaylistDragEndAt = Date.now();
    const from = evt.oldIndex;
    const to = evt.newIndex;
    if (from == null || to == null || from === to) return;
    const parent = evt.from;
    const siblings = Array.from(parent.children).filter((n) => n !== evt.item);
    parent.insertBefore(evt.item, siblings[from] ?? null);
    // #playlist-nav 里第 0 项是「我喜欢」（locked），自定义歌单下标要减 1
    movePlaylist(from - 1, to - 1);
    toast("已调整歌单顺序", { duration: 1400 });
  }

  onSidebarClick(e) {
    // 拖拽排序刚结束时不要导航（拖动的歌单会被误判成一次点击）
    if (Date.now() - lastPlaylistDragEndAt < 260) return;
    const more = e.target.closest('[data-act="pl-more"]');
    if (more) {
      e.stopPropagation();
      openPlaylistMenu(more.dataset.id, more);
      return;
    }
    const nav = e.target.closest("[data-nav]");
    if (!nav) return;
    const key = nav.dataset.nav;
    if (key === "playlist") navigate("playlist", nav.dataset.playlist);
    else navigate(key);
  }

  render() {
    const custom = state.playlists.filter((p) => p.id !== LIKED_ID);
    const liked = playlistById(LIKED_ID);
    const all = [liked, ...custom].filter(Boolean);
    return html`
      <aside
        class="sidebar"
        id="sidebar"
        @click=${(e) => this.onSidebarClick(e)}
        @contextmenu=${(e) => {
          const nav = e.target.closest('[data-nav="playlist"]');
          if (!nav) return;
          e.preventDefault();
          openPlaylistMenu(nav.dataset.playlist, nav);
        }}
      >
        <div class="sidebar__scroll">
          <nav class="sidebar__group" aria-label="曲库">
            <div class="sidebar__label">曲库</div>
            <button class="navitem" type="button" data-nav="library" aria-selected=${String(state.view === "library")}>
              ${icon("music", "navitem__icon")}
              <span class="navitem__text">本地歌曲</span>
              <span class="navitem__tail">
                <span class="navitem__badge" id="badge-library">${fmtCount(state.songs.length)}</span>
              </span>
            </button>
            <button class="navitem" type="button" data-nav="queue" aria-selected=${String(state.view === "queue")}>
              ${icon("queue", "navitem__icon")}
              <span class="navitem__text">播放列表</span>
              <span class="navitem__tail">
                <span class="navitem__badge" id="badge-queue">${fmtCount(state.queue.length)}</span>
              </span>
            </button>
          </nav>

          <nav class="sidebar__group" aria-label="歌单">
            <div class="sidebar__label">
              <span>歌单</span>
              <button
                class="sidebar__label-btn"
                id="btn-new-playlist-sm"
                type="button"
                data-tip="新建歌单"
                aria-label="新建歌单"
                @click=${() => promptNewPlaylist((pl) => pl && navigate("playlist", pl.id))}
              >
                ${icon("plus")}
              </button>
            </div>
            <div id="playlist-nav">
              ${repeat(
                all,
                (pl) => pl.id,
                (pl) => this.playlistItem(pl)
              )}
            </div>
          </nav>
        </div>
      </aside>
    `;
  }

  /**
   * 歌单条目。
   *
   * 所有歌单（含内置的「我喜欢」）用同一套结构：数量标记 + 悬浮才出现的
   * 「更多」按钮。两者绝对定位叠在同一个位置、同一时刻只显示一个，
   * 因此每一行的宽度完全一致 —— 这正是之前「我喜欢」看起来没对齐的原因。
   */
  playlistItem(pl) {
    const selected = state.view === "playlist" && state.playlistId === pl.id;
    return html`
      <button
        class="navitem"
        type="button"
        data-nav="playlist"
        data-playlist=${pl.id}
        data-locked=${String(Boolean(pl.locked))}
        draggable=${pl.locked ? "false" : "true"}
        aria-selected=${String(selected)}
      >
        ${icon(pl.id === LIKED_ID ? "heart" : "playlist", "navitem__icon")}
        <span class="navitem__text">${pl.name}</span>
        <span class="navitem__tail">
          <span class="navitem__badge">${fmtCount(pl.songIds.length)}</span>
          <span
            class="navitem__more"
            data-act="pl-more"
            data-id=${pl.id}
            role="button"
            aria-label="${pl.name}操作"
          >${icon("more")}</span>
        </span>
      </button>
    `;
  }

}

define("mp-sidebar", MpSidebar);

export const _internals = { clearQueue, commit };