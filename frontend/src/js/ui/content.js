/* ==========================================================================
   ui/content.js — 主内容区（头部工具条 + 曲目列表 / 空态）
   --------------------------------------------------------------------------
   迁移前后：
     · 头部标题 / 副标题以前用 textContent 一处处写，现在就是模板表达式；
     · 工具条以前是字符串 + `lastTools` 去重 + innerHTML，现在是模板；
     · 内容区以前手工判断「要不要重建 .page」以免重播入场动画，
       现在用 lit 的 keyed() 把「换列表」这件事表达得很直接：
       只有 key（视图 + 歌单）变了，.page 才会被重新创建（动画才重播）。
     · 空态以前靠 dataset.empty 去重，现在是一个普通分支。
   ========================================================================== */

import { keyed } from "lit/directives/keyed.js";
import { MpElement, define, html, nothing, icon } from "./base.js";
import { toast } from "./overlays.js";
import {
  clearQueue,
  commit,
  playlistById,
  removeSongsFromPlaylist,
  setPlaylistSelecting,
  setSelectedSongs,
  state,
} from "../store.js";
import { LIKED_ID, currentContext, playlistById as playlistOf } from "../store.js";
import { clearLocalFilter, doRescan, navigate } from "../shell.js";
import { handleSettingsAction } from "../settings.js";
import { locateCurrentSong, playAllVisible } from "../tracks.js";
import { openPlaylistMenu, promptAddSongs } from "../playlists.js";
import { fmtCount, fmtDurationCn } from "../utils.js";

export const VIEW_TITLES = {
  library: "本地歌曲",
  queue: "播放列表",
  playlist: "歌单",
};

/** 「添加音乐文件夹」空态按钮要走的设置动作 */
const SETTINGS_CTX = { commit, rescan: () => doRescan({ manual: true }) };

class MpContent extends MpElement {
  static deps = (s) => [
    s.view,
    s.playlistId,
    s.playlistVersion,
    s.query,
    s.visibleVersion,
    s.visibleSongs.length,
    s.sortKey,
    s.sortDir,
    s.songs.length,
    s.folders.length,
    s.scanning,
    s.playlistSelecting,
    s.selectedIds,
    s.lastScan?.at ?? 0,
    s.config.listDensity,
  ];

  render() {
    const v = state.view;
    const pl = v === "playlist" ? playlistById(state.playlistId) : null;
    return html`
      <main class="main" id="main">
        <div
          class="content-header"
          id="content-header"
          @click=${(e) => this.onHeaderClick(e)}
          @change=${(e) => this.onHeaderChange(e)}
        >
          <div class="content-header__titles">
            <h1 class="content-header__title" id="content-title">
              ${v === "playlist" && pl ? pl.name : VIEW_TITLES[v] || "本地歌曲"}
            </h1>
            <p class="content-header__subtitle" id="content-subtitle" data-scanning=${String(state.scanning)}>
              ${this.subtitle(v, pl)}
            </p>
          </div>
          <div class="content-header__actions">
            <div class="content-filter" id="content-filter" ?hidden=${v !== "library"}>
              <div class="content-filter__field">
                ${icon("search", "content-filter__icon")}
                <input
                  class="content-filter__input"
                  id="content-filter-input"
                  type="text"
                  placeholder="筛选本地歌曲"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="筛选本地歌曲"
                  .value=${state.query}
                  @input=${(e) => {
                    state.query = e.target.value;
                    commit();
                  }}
                  @keydown=${(e) => {
                    if (e.key !== "Escape") return;
                    e.preventDefault();
                    clearLocalFilter();
                    e.target.blur();
                  }}
                />
                <button
                  class="content-filter__clear"
                  id="content-filter-clear"
                  type="button"
                  aria-label="清空筛选"
                  ?hidden=${state.query.length === 0}
                  @click=${() => {
                    clearLocalFilter();
                    this.querySelector("#content-filter-input")?.focus();
                  }}
                >
                  ${icon("close")}
                </button>
              </div>
              <span class="content-filter__count" id="content-filter-count">
                ${state.query.trim() ? `匹配 ${fmtCount(state.visibleSongs.length)} 首` : ""}
              </span>
            </div>
            <div class="content-header__tools" id="content-tools">${this.toolbar()}</div>
          </div>
        </div>
        <div class="content-body" id="content-body">${this.body()}</div>
      </main>
    `;
  }

  subtitle(v, pl) {
    const songs = state.visibleSongs;
    const total = songs.reduce((sum, s) => sum + s.duration, 0);
    if (v === "library") {
      const s = state.lastScan;
      return `${fmtCount(songs.length)} 首 · 共 ${fmtDurationCn(total)} · ${fmtCount(
        state.folders.filter((f) => f.id !== "auto_downloads").length
      )} 个文件夹${s && s.excluded ? ` · 已过滤 ${fmtCount(s.excluded)} 个文件` : ""}`;
    }
    if (v === "queue") {
      const cur = state.currentId ? songs.findIndex((s) => s.id === state.currentId) : -1;
      return `${fmtCount(songs.length)} 首 · 共 ${fmtDurationCn(total)}${
        cur >= 0 ? ` · 正在播放第 ${cur + 1} 首` : ""
      }`;
    }
    if (v === "playlist" && pl) {
      return `${fmtCount(pl.songIds.length)} 首 · 共 ${fmtDurationCn(total)} · ${
        pl.locked ? "默认歌单（不可删除）" : "自定义歌单"
      }`;
    }
    if (v === "playlist") return "歌单不存在";
    return "";
  }

  /* ------------------------------------------------------------------------
     工具条
     ------------------------------------------------------------------------ */
  toolbar() {
    const v = state.view;
    // 「播放全部」保留；随机播放按钮已移除（需求：那个随机播放按钮移除掉）。
    const playAll = html`<button class="btn btn--primary" type="button" data-tool="play-all">
      ${icon("play")}<span>播放全部</span>
    </button>`;
    // 「定位到当前播放」：长列表里换歌之后列表不会自己滚动，用户找不到正在播的那一行。
    const locate = html`<button
      class="btn btn--icon"
      type="button"
      data-tool="locate"
      data-tip="定位到当前播放"
      aria-label="定位到当前播放"
    >
      ${icon("disc")}
    </button>`;
    const sortSel = html`
      <div class="select">
        <select class="select__field" id="select-sort" aria-label="排序方式">
          ${[
            ["addedAt", "添加时间"],
            ["title", "标题"],
            ["artist", "歌手"],
            ["album", "专辑"],
            ["duration", "时长"],
            ["size", "文件大小"],
            ["playCount", "播放次数"],
          ].map(([k, l]) => html`<option value=${k} ?selected=${state.sortKey === k}>${l}</option>`)}
        </select>
        ${icon("chevron-down", "select__icon")}
      </div>
    `;

    if (v === "queue") {
      return html`
        <button class="btn" type="button" data-tool="queue-clear">${icon("trash")}<span>清空列表</span></button>
        ${playAll}${locate}
      `;
    }

    if (v === "playlist") {
      if (state.playlistSelecting) {
        const n = state.selectedIds.size;
        const all = state.visibleSongs.length > 0 && state.visibleSongs.every((s) => state.selectedIds.has(s.id));
        return html`
          <span class="toolbar__selinfo">已选 ${fmtCount(n)} 首</span>
          <button class="btn btn--sm" type="button" data-tool="sel-all">
            ${icon("check")}<span>${all ? "取消全选" : "全选"}</span>
          </button>
          <button class="btn btn--sm btn--danger" type="button" data-tool="sel-remove" ?disabled=${!n}>
            ${icon("trash")}<span>移除所选</span>
          </button>
          <button class="btn btn--sm btn--primary" type="button" data-tool="pl-select">
            ${icon("close")}<span>完成</span>
          </button>
        `;
      }
      return html`
        ${sortSel}${playAll}
        <button class="btn" type="button" data-tool="pl-select">${icon("check")}<span>多选</span></button>
        <button class="btn" type="button" data-tool="pl-add">${icon("plus")}<span>添加</span></button>
        ${locate}
        <button class="btn btn--icon" type="button" data-tool="pl-more" data-tip="歌单操作">${icon("more")}</button>
      `;
    }

    return html`
      <button class="btn" type="button" data-tool="rescan">${icon("refresh")}<span>重新扫描</span></button>
      ${sortSel}${playAll}${locate}
    `;
  }

  /* ------------------------------------------------------------------------
     内容体：空态 或 列表
     ------------------------------------------------------------------------ */
  body() {
    const v = state.view;
    if (!state.visibleSongs.length) {
      const kind = state.query.trim() ? "search" : v === "library" ? "library" : v === "queue" ? "queue" : "playlist";
      return this.empty(kind);
    }
    // .page 上挂着 fade-in 入场动画：只有「进入另一个列表」才该重建它。
    // keyed() 表达的正是这件事（key 变了才换节点）。
    return keyed(`${v}|${state.playlistId ?? ""}`, html`<div class="page"><mp-track-table></mp-track-table></div>`);
  }

  empty(kind) {
    const map = {
      library: {
        icon: "music",
        title: "曲库还没有歌曲",
        desc: "在设置里添加本地音乐文件夹，程序会自动扫描并监听这些文件夹的变化。",
        ok: "添加音乐文件夹",
        act: "add-folder",
      },
      queue: {
        icon: "queue",
        title: "播放列表是空的",
        desc: "从「本地歌曲」或任意歌单里选择歌曲加入播放列表。",
        ok: "去本地歌曲",
        act: "goto-library",
      },
      playlist: {
        icon: "playlist",
        title: "这个歌单还没有歌曲",
        desc: "在「本地歌曲」里点击每首歌后面的爱心或更多菜单，把歌曲加进来。",
        ok: "去本地歌曲",
        act: "goto-library",
      },
      search: {
        icon: "search",
        title: "没有找到匹配的歌曲",
        desc: "换个关键词试试，或清空搜索框。",
        ok: "清空搜索",
        act: "clear-search",
      },
    };
    const cfg = map[kind] || map.library;
    return html`
      <div class="empty" data-empty=${kind}>
        <svg class="empty__art" aria-hidden="true"><use href="#i-${cfg.icon}"></use></svg>
        <div class="empty__title">${cfg.title}</div>
        ${cfg.desc ? html`<div class="empty__desc">${cfg.desc}</div>` : nothing}
        ${
          cfg.ok
            ? html`<div class="empty__actions">
                <button class="btn btn--primary" type="button" data-empty-act=${cfg.act}>${cfg.ok}</button>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  /* ------------------------------------------------------------------------
     事件
     ------------------------------------------------------------------------ */
  async onHeaderClick(e) {
    const emptyAct = e.target.closest("[data-empty-act]")?.dataset.emptyAct;
    if (emptyAct) {
      if (emptyAct === "add-folder") await handleSettingsAction({ dataset: { act: "add-folder" } }, SETTINGS_CTX);
      else if (emptyAct === "goto-library") navigate("library");
      else if (emptyAct === "clear-search") clearLocalFilter();
      return;
    }
    const tool = e.target.closest("[data-tool]")?.dataset.tool;
    if (!tool) return;
    await this.handleTool(tool);
  }

  onHeaderChange(e) {
    if (e.target.id === "select-sort") {
      state.sortKey = e.target.value;
      commit();
    }
  }

  async handleTool(tool) {
    switch (tool) {
      case "rescan":
        doRescan({ manual: true });
        break;
      case "add-folder":
        await handleSettingsAction({ dataset: { act: "add-folder" } }, SETTINGS_CTX);
        break;
      case "play-all":
        playAllVisible(false);
        break;
      case "locate":
        // 当前播放行在列表里就滚过去并闪一下；不在（被筛选裁掉 / 歌单里没有）
        // 就如实提示，而不是点了没反应。
        locateCurrentSong();
        break;
      case "queue-clear":
        clearQueue();
        toast("播放列表已清空");
        break;
      /* —— 歌单：多选 / 添加歌曲 —— */
      case "pl-select":
        setPlaylistSelecting(!state.playlistSelecting);
        break;
      case "pl-add":
        if (state.playlistId) promptAddSongs(state.playlistId);
        break;
      case "sel-all": {
        const all = state.visibleSongs.length > 0 && state.visibleSongs.every((s) => state.selectedIds.has(s.id));
        setSelectedSongs(all ? [] : state.visibleSongs.map((s) => s.id));
        break;
      }
      case "sel-remove": {
        const ids = [...state.selectedIds];
        if (!ids.length) break;
        const pl = playlistById(state.playlistId);
        const removed = removeSongsFromPlaylist(state.playlistId, ids);
        // 退出多选会同时清空勾选
        setPlaylistSelecting(false);
        toast(`已从「${pl?.name ?? "歌单"}」移除 ${fmtCount(removed)} 首`, { tone: "success" });
        break;
      }
      case "pl-more":
        openPlaylistMenu(state.playlistId, this.querySelector('#content-header [data-tool="pl-more"]'));
        break;
      default:
        break;
    }
  }
}

define("mp-content", MpContent);

export const _internals = { currentContext, playlistOf, LIKED_ID, nothing };
