/* ==========================================================================
   shell.js — 侧边栏 / 内容头部工具条 / 内容区路由
   ========================================================================== */

import { $, $$, icon, openMenu, toast } from "./dom.js";
import { renderSettings, handleSettingsAction, handleSettingControl, bindSettingsSliders, scrollToSection } from "./settings.js";
import { addSongsTo } from "./playlists.js";
import { confirmDeletePlaylist, promptNewPlaylist, promptRenamePlaylist } from "./playlists.js";
import {
  LIKED_ID,
  clearQueue,
  commit,
  currentContext,
  flushConfigSync,
  movePlaylist,
  playlistById,
  playContext,
  removeSongsFromPlaylist,
  rescan,
  state,
} from "./store.js";
import { bindTrackEvents, playAllVisible, renderEmpty, renderTracks } from "./tracks.js";
import { esc, fmtCount, fmtDurationCn, fmtTime, naturalCompare } from "./utils.js";

const VIEW_TITLES = {
  library: "所有歌曲",
  queue: "播放列表",
  playlist: "歌单",
  settings: "设置",
};

/* --------------------------------------------------------------------------
   侧边栏
   -------------------------------------------------------------------------- */
export function renderSidebar() {
  const custom = state.playlists.filter((p) => p.id !== LIKED_ID);
  const liked = playlistById(LIKED_ID);

  const item = (pl) => {
    const selected = state.view === "playlist" && state.playlistId === pl.id;
    return `
      <button class="navitem" type="button" data-nav="playlist" data-playlist="${pl.id}"
        data-locked="${pl.locked}" draggable="${pl.locked ? "false" : "true"}"
        aria-selected="${selected}">
        <svg class="navitem__icon" aria-hidden="true"><use href="#i-${pl.id === LIKED_ID ? "heart" : "playlist"}"/></svg>
        <span class="navitem__text">${esc(pl.name)}</span>
        <span class="navitem__badge">${fmtCount(pl.songIds.length)}</span>
        ${pl.locked ? "" : `<span class="navitem__more" data-act="pl-more" data-id="${pl.id}" role="button" aria-label="歌单操作">${icon("more")}</span>`}
      </button>`;
  };

  const nav = $("#playlist-nav");
  nav.innerHTML = [liked, ...custom].filter(Boolean).map(item).join("");

  // 全部导航项的选中态
  $$("[data-nav]").forEach((btn) => {
    const key = btn.dataset.nav;
    if (key === "playlist") return;
    btn.setAttribute("aria-selected", String(state.view === key));
  });

  $("#badge-library").textContent = fmtCount(state.songs.length);
  $("#badge-queue").textContent = fmtCount(state.queue.length);
}

/* --------------------------------------------------------------------------
   内容头部
   -------------------------------------------------------------------------- */
function toolbarHtml() {
  const v = state.view;
  const searchBox = `
    <div class="search">
      ${icon("search", "search__icon")}
      <input class="search__input" id="input-search" type="search" placeholder="搜索歌曲、歌手、专辑" value="${esc(state.query)}" />
    </div>`;

  if (v === "settings") {
    return `
      <button class="btn" type="button" data-tool="add-folder">${icon("folder-plus")}<span>添加音乐文件夹</span></button>
      <button class="btn btn--primary" type="button" data-tool="rescan">${icon("refresh")}<span>重新扫描</span></button>`;
  }

  const playAll = `
    <button class="btn btn--primary" type="button" data-tool="play-all">${icon("play")}<span>播放全部</span></button>
    <button class="btn btn--icon" type="button" data-tool="shuffle" data-tip="随机播放">${icon("shuffle")}</button>`;

  const sortSel = `
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
        ]
          .map(([k, l]) => `<option value="${k}" ${state.sortKey === k ? "selected" : ""}>${l}</option>`)
          .join("")}
      </select>
      ${icon("chevron-down", "select__icon")}
    </div>`;

  const densityBtn = `
    <button class="btn btn--icon" type="button" data-tool="density" data-tip="${state.density === "compact" ? "舒适密度" : "紧凑密度"}">
      ${icon("list-order")}
    </button>`;

  if (v === "queue") {
    return `${searchBox}
      <button class="btn btn--icon" type="button" data-tool="queue-reverse" data-tip="反转顺序">${icon("shuffle")}</button>
      <button class="btn" type="button" data-tool="queue-clear">${icon("trash")}<span>清空列表</span></button>
      ${playAll}`;
  }

  if (v === "playlist") {
    return `${searchBox}${sortSel}${densityBtn}${playAll}
      <button class="btn btn--icon" type="button" data-tool="pl-more" data-tip="歌单操作">${icon("more")}</button>`;
  }

  return `${searchBox}
    <button class="btn" type="button" data-tool="rescan">${icon("refresh")}<span>重新扫描</span></button>
    ${sortSel}${densityBtn}${playAll}`;
}

export function renderHeader() {
  const v = state.view;
  const pl = v === "playlist" ? playlistById(state.playlistId) : null;

  const title =
    v === "playlist" && pl ? pl.name : VIEW_TITLES[v] || "所有歌曲";
  $("#content-title").textContent = title;

  const songs = state.visibleSongs;
  const total = songs.reduce((sum, s) => sum + s.duration, 0);
  let subtitle = "";
  if (v === "settings") {
    subtitle = "音乐文件夹、过滤规则、主题与播放选项";
  } else if (v === "library") {
    const s = state.lastScan;
    subtitle = `${fmtCount(songs.length)} 首 · 共 ${fmtDurationCn(total)} · ${fmtCount(state.folders.length)} 个文件夹${
      s && s.excluded ? ` · 已过滤 ${fmtCount(s.excluded)} 个文件` : ""
    }`;
  } else if (v === "queue") {
    const cur = state.currentId ? songs.findIndex((s) => s.id === state.currentId) : -1;
    subtitle = `${fmtCount(songs.length)} 首 · 共 ${fmtDurationCn(total)}${
      cur >= 0 ? ` · 正在播放第 ${cur + 1} 首` : ""
    }`;
  } else if (v === "playlist" && pl) {
    subtitle = `${fmtCount(pl.songIds.length)} 首 · 共 ${fmtDurationCn(total)} · ${
      pl.locked ? "默认歌单（不可删除）" : "自定义歌单"
    }`;
  } else if (v === "playlist") {
    subtitle = "歌单不存在";
  }

  $("#content-subtitle").textContent = subtitle;
  $("#content-tools").innerHTML = toolbarHtml();
  $("#titlebar-caption").textContent = `${title}${state.scanning ? " · 扫描中…" : ""}`;
}

/* --------------------------------------------------------------------------
   内容区
   -------------------------------------------------------------------------- */
export function renderContent() {
  const body = $("#content-body");
  const v = state.view;

  if (v === "settings") {
    renderSettings(body);
    bindSettingsSliders(body, { commit });
    return;
  }

  if (!state.visibleSongs.length) {
    if (state.query.trim()) {
      renderEmpty(body, { kind: "search" });
    } else if (v === "library") {
      renderEmpty(body, { kind: "library" });
    } else if (v === "queue") {
      renderEmpty(body, { kind: "queue" });
    } else {
      renderEmpty(body, { kind: "playlist" });
    }
  } else {
    body.innerHTML = `<div class="page"></div>`;
    renderTracks(body.querySelector(".page"));
  }

  bindTrackEvents(body, {
    onAddFolder: () => handleSettingsAction({ dataset: { act: "add-folder" } }, { commit, rescan: doRescan }),
    onGotoLibrary: () => navigate("library"),
    onClearSearch: () => {
      state.query = "";
      commit();
    },
  });
}

/* --------------------------------------------------------------------------
   导航
   -------------------------------------------------------------------------- */
export function navigate(view, playlistId = null) {
  state.view = view;
  state.playlistId = view === "playlist" ? playlistId : null;
  state.playerOpen = false;
  commit();
}

/* --------------------------------------------------------------------------
   扫描
   -------------------------------------------------------------------------- */
export async function doRescan({ manual = false } = {}) {
  if (state.scanning) return;
  const scanning = $("#scanning");
  const text = $("#scanning-text");
  scanning.hidden = false;
  text.textContent = "正在扫描音乐文件夹…";
  const btn = $('[data-tool="rescan"]');
  btn?.classList.add("is-busy");
  try {
    const result = await rescan({ silent: !manual });
    if (result) {
      toast(
        `扫描完成：保留 ${fmtCount(result.kept)} 首${result.excluded ? `，过滤 ${fmtCount(result.excluded)} 个` : ""}${
          result.added ? `，新增 ${fmtCount(result.added)}` : ""
        }${result.removed ? `，移除 ${fmtCount(result.removed)}` : ""}`,
        { tone: "success", duration: 3600 }
      );
    }
  } finally {
    scanning.hidden = true;
    btn?.classList.remove("is-busy");
  }
}

/* --------------------------------------------------------------------------
   事件绑定（一次性）
   -------------------------------------------------------------------------- */
export function bindShell() {
  /* 侧边栏导航 + 歌单 */
  $("#sidebar").addEventListener("click", (e) => {
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
  });

  $("#sidebar").addEventListener("contextmenu", (e) => {
    const nav = e.target.closest('[data-nav="playlist"]');
    if (!nav) return;
    e.preventDefault();
    openPlaylistMenu(nav.dataset.playlist, nav);
  });

  $("#sidebar").addEventListener("pointerdown", (e) => {
    const handle = e.target.closest('[data-nav="playlist"]');
    if (!handle || handle.dataset.locked === "true") return;
    const dragging = e.target.closest(".navitem__more");
    if (dragging) return;
    handle.classList.add("is-dragging-handle");
  });

  $("#sidebar").addEventListener("pointerup", (e) => {
    $$("#playlist-nav .navitem").forEach((n) => n.classList.remove("is-dragging-handle"));
  });

  // 歌单拖拽排序（自定义歌单之间）
  bindPlaylistDrag();

  $("#btn-new-playlist")?.addEventListener("click", () => promptNewPlaylist((pl) => pl && navigate("playlist", pl.id)));
  $("#btn-new-playlist-sm")?.addEventListener("click", () => promptNewPlaylist((pl) => pl && navigate("playlist", pl.id)));

  /* 内容区：工具条 + 设置项 */
  $("#content-header").addEventListener("click", (e) => {
    const tool = e.target.closest("[data-tool]")?.dataset.tool;
    if (!tool) return;
    handleTool(tool);
  });

  $("#content-header").addEventListener("change", (e) => {
    if (e.target.id === "select-sort") {
      state.sortKey = e.target.value;
      commit();
    }
  });

  $("#content-header").addEventListener("input", (e) => {
    if (e.target.id === "input-search") {
      state.query = e.target.value;
      commit();
      // 输入焦点保持
      const input = $("#input-search");
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  });

  $("#content-body").addEventListener("click", async (e) => {
    const goto = e.target.closest("[data-goto]")?.dataset.goto;
    if (goto) {
      $$(".settings__nav-item").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.goto === goto)));
      scrollToSection(goto);
      return;
    }

    const control = e.target.closest("[data-toggle],[data-segment] .segmented__btn");
    if (control && handleSettingControl(control, { commit })) {
      // 设置项改动后把配置刷回后端（含过滤规则、监听开关等）
      flushConfigSync();
      return;
    }

    const actEl = e.target.closest("[data-act]");
    if (actEl && actEl.closest(".settings")) {
      const act = actEl.dataset.act;
      await handleSettingsAction(actEl, { commit, rescan: () => doRescan({ manual: true }) });
      flushConfigSync();
      if (["add-folder", "remove-folder", "scan-now", "rescan-folder"].includes(act)) return;
      if (act?.startsWith("rule") || act?.startsWith("preset")) {
        renderContent();
        renderHeader();
      }
      if (act === "reload-themes") {
        renderContent();
      }
      return;
    }
  });

  $("#content-body").addEventListener("input", (e) => {
    const act = e.target.dataset.act;
    if (act !== "rule-value") return;
    const rule = state.filterRules.find((r) => r.id === e.target.dataset.id);
    if (!rule) return;
    rule.value = e.target.value;
    commit();
    // 规则值变化后刷新预览统计（不整页重绘，避免丢失焦点）
    refreshRulePreview();
  });

  $("#content-body").addEventListener("change", (e) => {
    const act = e.target.dataset.act;
    if (act !== "rule-type" && act !== "rule-op") return;
    const rule = state.filterRules.find((r) => r.id === e.target.dataset.id);
    if (!rule) return;
    if (act === "rule-type") {
      rule.type = e.target.value;
      rule.op = e.target.value === "size" ? "lt" : "match";
      rule.value = e.target.value === "size" ? "10240" : "\\.mp4$";
      commit();
      renderContent();
    } else {
      rule.op = e.target.value;
      commit();
    }
  });
}

function refreshRulePreview() {
  const node = $("#content-body .rule__preview");
  if (!node) return;
  import("./store.js").then(({ applyRules }) => {
    const { kept, excluded, total } = applyRules(state.allSongsRaw, state.filterRules);
    node.innerHTML = `当前规则下：共扫描 <b>${fmtCount(total)}</b> 个文件，保留 <b>${fmtCount(kept)}</b> 首，过滤掉 <b>${fmtCount(excluded)}</b> 个`;
  });
}

/* --------------------------------------------------------------------------
   工具条动作
   -------------------------------------------------------------------------- */
async function handleTool(tool) {
  switch (tool) {
    case "rescan":
      doRescan({ manual: true });
      break;
    case "add-folder":
      await handleSettingsAction({ dataset: { act: "add-folder" } }, { commit, rescan: () => doRescan({ manual: true }) });
      renderContent();
      renderHeader();
      break;
    case "play-all":
      playAllVisible(false);
      break;
    case "shuffle":
      playAllVisible(true);
      break;
    case "density":
      state.density = state.density === "compact" ? "comfortable" : "compact";
      commit();
      break;
    case "queue-clear":
      clearQueue();
      toast("播放列表已清空");
      break;
    case "queue-reverse":
      state.queue = state.queue.slice().reverse();
      commit();
      toast("已反转播放顺序");
      break;
    case "pl-more":
      openPlaylistMenu(state.playlistId, $("#content-header [data-tool='pl-more']"));
      break;
    default:
      break;
  }
}

/* --------------------------------------------------------------------------
   歌单菜单
   -------------------------------------------------------------------------- */
function openPlaylistMenu(id, anchor) {
  const pl = playlistById(id);
  if (!pl) return;
  const items = [
    { id: "play", label: "播放这个歌单", icon: "play" },
    { id: "queue", label: "加入播放列表", icon: "queue" },
    { id: "sep1", kind: "sep" },
  ];
  if (!pl.locked) {
    items.push({ id: "rename", label: "重命名", icon: "edit" });
    items.push({ id: "delete", label: "删除歌单", icon: "trash", danger: true });
    items.push({ id: "sep2", kind: "sep" });
  }
  items.push({ id: "export", label: "导出为 m3u", icon: "file" });

  const rect = anchor.getBoundingClientRect();
  openMenu({
    x: rect.left,
    y: rect.bottom + 6,
    align: "right",
    items,
    onPick: (action) => {
      switch (action) {
        case "play":
          playContext(pl.songIds.slice(), 0, { type: "playlist", id: pl.id });
          break;
        case "queue":
          import("./store.js").then((m) => {
            m.appendToQueue(pl.songIds);
            toast(`已把 ${fmtCount(pl.songIds.length)} 首加入播放列表`, { tone: "success" });
          });
          break;
        case "rename":
          promptRenamePlaylist(pl.id);
          break;
        case "delete":
          confirmDeletePlaylist(pl.id, () => navigate("library"));
          break;
        case "export":
          toast("导出 m3u 需要接入后端后实现", { duration: 2200 });
          break;
        default:
          break;
      }
    },
  });
}

/* --------------------------------------------------------------------------
   歌单拖拽排序
   -------------------------------------------------------------------------- */
function bindPlaylistDrag() {
  const nav = $("#playlist-nav");
  let from = -1;

  nav.addEventListener("dragstart", (e) => {
    const item = e.target.closest('.navitem[data-locked="false"]');
    if (!item) {
      e.preventDefault();
      return;
    }
    from = $$("#playlist-nav .navitem").indexOf(item);
    item.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  nav.addEventListener("dragover", (e) => {
    e.preventDefault();
    const item = e.target.closest(".navitem");
    $$("#playlist-nav .navitem").forEach((n) => n.classList.remove("is-drop-target"));
    if (item) item.classList.add("is-drop-target");
  });

  nav.addEventListener("drop", (e) => {
    e.preventDefault();
    const item = e.target.closest(".navitem");
    const to = item ? $$("#playlist-nav .navitem").indexOf(item) : -1;
    cleanup();
    if (from < 0 || to < 0 || from === to) return;
    movePlaylist(from, to);
    toast("已调整歌单顺序", { duration: 1400 });
  });

  nav.addEventListener("dragend", cleanup);

  function cleanup() {
    from = -1;
    $$("#playlist-nav .navitem").forEach((n) => n.classList.remove("is-dragging", "is-drop-target"));
  }
}

/* --------------------------------------------------------------------------
   全量刷新
   -------------------------------------------------------------------------- */
export function renderShell() {
  renderSidebar();
  renderHeader();
  renderContent();
}

export { VIEW_TITLES, naturalCompare, currentContext, addSongsTo, removeSongsFromPlaylist, fmtTime };
