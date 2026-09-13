/* ==========================================================================
   shell.js — 侧边栏 / 内容头部工具条 / 内容区路由
   ========================================================================== */

import Sortable from "sortablejs";
import { $, $$, icon, openMenu, toast } from "./dom.js";
import {
  renderSettings,
  handleSettingsAction,
  handleSettingControl,
  bindSettingsSliders,
  scrollToSection,
  currentSettingsSection,
  setSettingsSection,
} from "./settings.js";
import { addSongsTo } from "./playlists.js";
import {
  confirmDeletePlaylist,
  promptAddSongs,
  promptNewPlaylist,
  promptRenamePlaylist,
} from "./playlists.js";
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
  setPlaylistSelecting,
  setSelectedSongs,
  state,
} from "./store.js";
import { bindTrackEvents, playAllVisible, renderEmpty, renderTracks } from "./tracks.js";
import { esc, fmtCount, fmtDurationCn, fmtTime, naturalCompare } from "./utils.js";

const VIEW_TITLES = {
  library: "本地歌曲",
  queue: "播放列表",
  playlist: "歌单",
};

/* --------------------------------------------------------------------------
   侧边栏
   -------------------------------------------------------------------------- */
export function renderSidebar() {
  const custom = state.playlists.filter((p) => p.id !== LIKED_ID);
  const liked = playlistById(LIKED_ID);

  // 所有歌单（含内置的「我喜欢」）用同一套结构：数量标记 + 悬浮才出现的
  // 「更多」按钮。两者绝对定位叠在同一个位置、同一时刻只显示一个，
  // 因此每一行的宽度完全一致 —— 这正是之前「我喜欢」看起来没对齐的原因。
  const item = (pl) => {
    const selected = state.view === "playlist" && state.playlistId === pl.id;
    return `
      <button class="navitem" type="button" data-nav="playlist" data-playlist="${pl.id}"
        data-locked="${pl.locked}" draggable="${pl.locked ? "false" : "true"}"
        aria-selected="${selected}">
        <svg class="navitem__icon" aria-hidden="true"><use href="#i-${pl.id === LIKED_ID ? "heart" : "playlist"}"/></svg>
        <span class="navitem__text">${esc(pl.name)}</span>
        <span class="navitem__tail">
          <span class="navitem__badge">${fmtCount(pl.songIds.length)}</span>
          <span class="navitem__more" data-act="pl-more" data-id="${pl.id}" role="button"
            aria-label="${esc(pl.name)}操作">${icon("more")}</span>
        </span>
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

/**
 * 工具条内容。
 *
 * 搜索框不在这里 —— 它已经移到标题栏中间（见 searchpanel.js）。
 * 以前它长在这个工具条里，而工具条的 innerHTML 会随着 state.query 变化整体重建，
 * 于是「每输入一个字符就重绘一次输入框」，焦点与输入法状态全被打断。
 * 现在工具条内容与 query 无关，从根上避免了这个问题。
 */
function toolbarHtml() {
  const v = state.view;

  // 「播放全部」保留；随机播放按钮已移除（需求：那个随机播放按钮移除掉）。
  // 随机播放仍然可用：底栏的循环模式里有「随机」。
  const playAll = `
    <button class="btn btn--primary" type="button" data-tool="play-all">${icon("play")}<span>播放全部</span></button>`;

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

  // 列表密度按钮已移到设置界面（对所有列表生效），工具条上不再有它
  if (v === "queue") {
    // 反转顺序按钮已移除（需求）：排序改为在列表里直接拖拽。
    return `
      <button class="btn" type="button" data-tool="queue-clear">${icon("trash")}<span>清空列表</span></button>
      ${playAll}`;
  }

  if (v === "playlist") {
    // 多选模式：工具条换成「已选 N 首 / 全选 / 移除所选 / 完成」，
    // 这时排序与播放全部先让位，避免误触。
    if (state.playlistSelecting) {
      const n = state.selectedIds.size;
      const all = state.visibleSongs.length > 0 && state.visibleSongs.every((s) => state.selectedIds.has(s.id));
      return `
        <span class="toolbar__selinfo">已选 ${fmtCount(n)} 首</span>
        <button class="btn btn--sm" type="button" data-tool="sel-all">${icon("check")}<span>${all ? "取消全选" : "全选"}</span></button>
        <button class="btn btn--sm btn--danger" type="button" data-tool="sel-remove" ${n ? "" : "disabled"}>${icon("trash")}<span>移除所选</span></button>
        <button class="btn btn--sm btn--primary" type="button" data-tool="pl-select">${icon("close")}<span>完成</span></button>`;
    }
    return `${sortSel}${playAll}
      <button class="btn" type="button" data-tool="pl-select">${icon("check")}<span>多选</span></button>
      <button class="btn" type="button" data-tool="pl-add">${icon("plus")}<span>添加</span></button>
      <button class="btn btn--icon" type="button" data-tool="pl-more" data-tip="歌单操作">${icon("more")}</button>`;
  }

  return `
    <button class="btn" type="button" data-tool="rescan">${icon("refresh")}<span>重新扫描</span></button>
    ${sortSel}${playAll}`;
}

/**
 * 上一次真正写进 DOM 的工具条内容。
 * 只有内容变了才重绘：避免每次 commit 都重建按钮（那样会打断悬停、
 * 让正在交互的按钮丢失焦点）。
 */
let lastTools = "";

/* --------------------------------------------------------------------------
   本地歌曲筛选栏
   --------------------------------------------------------------------------
   需求：本地搜索从「在线搜索弹层」里独立出来，放在本地歌曲上方。
   关键词存在 state.query（store 的 recalcVisible 已经在用它过滤）。
   输入框是 #content-body 之外的静态节点，所以输入时不会重绘输入框本身，
   焦点与输入法状态都不会被打断。
   -------------------------------------------------------------------------- */
function filterEls() {
  return {
    bar: $("#content-filter"),
    input: $("#content-filter-input"),
    clear: $("#content-filter-clear"),
    count: $("#content-filter-count"),
  };
}

/** 把筛选栏的显隐 / 文案同步到当前视图（每次 renderHeader 都会调） */
function syncFilterBar() {
  const { bar, input, clear, count } = filterEls();
  if (!bar) return;
  const show = state.view === "library";
  bar.hidden = !show;
  if (!show) return;
  if (input && input.value !== state.query) input.value = state.query;
  if (clear) clear.hidden = state.query.length === 0;
  if (count) count.textContent = state.query.trim() ? `匹配 ${fmtCount(state.visibleSongs.length)} 首` : "";
}

/** 清空本地筛选（空态里的「清空筛选」按钮用） */
export function clearLocalFilter() {
  state.query = "";
  const { input } = filterEls();
  if (input) input.value = "";
  commit();
}

export function renderHeader() {
  const v = state.view;
  const pl = v === "playlist" ? playlistById(state.playlistId) : null;

  const title = v === "playlist" && pl ? pl.name : VIEW_TITLES[v] || "本地歌曲";  $("#content-title").textContent = title;

  const songs = state.visibleSongs;
  const total = songs.reduce((sum, s) => sum + s.duration, 0);
  let subtitle = "";
  if (v === "library") {
    const s = state.lastScan;
    subtitle = `${fmtCount(songs.length)} 首 · 共 ${fmtDurationCn(total)} · ${fmtCount(
      state.folders.filter((f) => f.id !== "auto_downloads").length
    )} 个文件夹${s && s.excluded ? ` · 已过滤 ${fmtCount(s.excluded)} 个文件` : ""}`;
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
  // 扫描中的提示原本挂在标题栏文字后面，现在标题栏不再显示页面名，
  // 改为挂在内容区副标题上（信息不丢，只是换了位置）。
  $("#content-subtitle").dataset.scanning = String(state.scanning);
  $("#scanning")?.setAttribute("data-title", title);

  const tools = toolbarHtml();
  if (tools !== lastTools) {
    lastTools = tools;
    $("#content-tools").innerHTML = tools;
  }

  syncFilterBar();
}

/* --------------------------------------------------------------------------
   内容区
   -------------------------------------------------------------------------- */
export function renderContent() {
  const body = $("#content-body");
  const v = state.view;

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
    // 「没有匹配的歌曲」空态里的「清空筛选」：清掉上方筛选框里的关键词，
    // 否则用户会看到「列表空了但输入框里还有字」的矛盾状态
    onClearSearch: () => clearLocalFilter(),
  });
}

/* --------------------------------------------------------------------------
   设置：弹出层
   --------------------------------------------------------------------------
   需求：设置界面改为弹出层。
   实现上不再切换 state.view（内容区始终是曲库/队列/歌单），
   而是渲染到一个覆盖在内容区之上的层里 —— 好处是关闭设置后
   列表的滚动位置、选中行、正在播放的进度都不会因为换视图而丢。
   -------------------------------------------------------------------------- */
export function openSettings(section = null) {
  const layer = document.getElementById("settings-layer");
  if (!layer) return;
  layer.hidden = false;
  // 先解除 hidden 再改 data-state，保证过渡动画真的发生
  requestAnimationFrame(() => layer.setAttribute("data-state", "opened"));
  const body = layer.querySelector(".settings-layer__body");
  if (body) {
    renderSettings(body);
    bindSettingsSliders(body, { commit });
    if (section) scrollToSection(section);
  }
  layer.querySelector(".settings-layer__close")?.focus({ preventScroll: true });
}
export function closeSettings() {
  const layer = document.getElementById("settings-layer");
  if (!layer) return;
  layer.setAttribute("data-state", "closed");
  setTimeout(() => {
    if (layer.getAttribute("data-state") === "closed") layer.hidden = true;
  }, 220);
}

export function toggleSettings(section = null) {
  const layer = document.getElementById("settings-layer");
  if (!layer) return;
  if (layer.hidden) openSettings(section);
  else closeSettings();
}

export function settingsLayerOpen() {
  const layer = document.getElementById("settings-layer");
  return Boolean(layer && !layer.hidden);
}

/**
 * 重绘设置层内容，并保持「用户正在看的位置」。
 *
 * 只恢复 scrollTop 是不够的：重绘会把导航条的选中态打回第一个，所以
 * 这里同时把当前分区写回高亮。两件事都做，才是「点开关不跳页」。
 */
export function refreshSettingsLayer() {
  const layer = document.getElementById("settings-layer");
  if (!layer || layer.hidden) return;
  const body = layer.querySelector(".settings-layer__body");
  if (!body) return;
  const scroll = body.scrollTop;
  const section = currentSettingsSection();
  const active = document.activeElement;
  const focusAct = active?.dataset?.act ? { act: active.dataset.act, id: active.dataset.id || "" } : null;

  renderSettings(body);
  bindSettingsSliders(body, { commit });
  body.scrollTop = scroll;
  setSettingsSection(section);

  if (focusAct) {
    const sel = focusAct.id
      ? `[data-act="${focusAct.act}"][data-id="${focusAct.id}"]`
      : `[data-act="${focusAct.act}"]`;
    body.querySelector(sel)?.focus({ preventScroll: true });
  }
}

/* --------------------------------------------------------------------------
   导航
   -------------------------------------------------------------------------- */
export function navigate(view, playlistId = null) {
  // 设置是弹出层，不是视图：任何导航都先把设置收起来
  if (settingsLayerOpen()) closeSettings();
  if (view === "settings") {
    openSettings();
    return;
  }
  state.view = view;
  state.playlistId = view === "playlist" ? playlistId : null;
  state.playerOpen = false;
  // 切视图时清掉本地筛选与歌单多选：否则会出现「切到歌单还被上一页的关键词
  // 过滤着」「多选模式下换了另一个歌单」这类错位状态。
  state.query = "";
  state.playlistSelecting = false;
  state.selectedIds = new Set();
  // 换视图时把播放列表面板收起来，避免它孤零零浮在主界面上。
  // 这里直接收 DOM（不入 playerbar 的依赖，避免 shell ← playerbar 的循环 import）；
  // 动画结束后由 paintPlayerBar 的渲染循环收尾。
  state.queueOpen = false;
  const panel = document.getElementById("queue-panel");
  if (panel) {
    panel.setAttribute("data-state", "closed");
    setTimeout(() => {
      if (!state.queueOpen) panel.hidden = true;
    }, 220);
  }
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
  });

  $("#sidebar").addEventListener("contextmenu", (e) => {
    const nav = e.target.closest('[data-nav="playlist"]');
    if (!nav) return;
    e.preventDefault();
    openPlaylistMenu(nav.dataset.playlist, nav);
  });

  // 歌单拖拽排序（自定义歌单之间）：交给 SortableJS
  bindPlaylistDrag();

  /* 本地歌曲筛选框（在本地歌曲列表上方） */
  const filterInput = $("#content-filter-input");
  filterInput?.addEventListener("input", () => {
    state.query = filterInput.value;
    const clear = $("#content-filter-clear");
    if (clear) clear.hidden = filterInput.value.length === 0;
    commit();
  });
  filterInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    clearLocalFilter();
    filterInput.blur();
  });
  $("#content-filter-clear")?.addEventListener("click", () => {
    clearLocalFilter();
    filterInput?.focus();
  });

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

  $("#content-body").addEventListener("click", async (e) => {
    const control = e.target.closest("[data-toggle],[data-segment] .segmented__btn");
    if (control && handleSettingControl(control, { commit })) {
      // 设置项改动后把配置刷回后端（含过滤规则、监听开关等）
      flushConfigSync();
      return;
    }
  });

  /* 设置层：事件委托挂在层自己身上。
     以前设置是「视图」，所以委托挂在 #content-body 上；现在它是覆盖层，
     不在 content-body 里，挂在那里就一个事件都收不到。 */
  const settingsLayer = document.getElementById("settings-layer");
  settingsLayer?.addEventListener("click", async (e) => {
    // 点「关闭」按钮或遮罩空白处：收起设置层
    if (e.target.closest("[data-settings-close]") || e.target === settingsLayer) {
      closeSettings();
      return;
    }

    const goto = e.target.closest("[data-goto]")?.dataset.goto;
    if (goto) {
      // 高亮与滚动都在 scrollToSection 里处理（并会把「当前分区」记下来，
      // 这样紧接着的整块重绘不会把选中态打回第一个）
      scrollToSection(goto);
      return;
    }

    // 开关（switch）与分段控件统一走控制分支
    const control = e.target.closest("[data-toggle],[data-segment] .segmented__btn");
    if (control) {
      if (handleSettingControl(control, { commit })) {
        flushConfigSync();
        refreshSettingsLayer();
      }
      return;
    }

    const actEl = e.target.closest("[data-act]");
    if (actEl) {
      const act = actEl.dataset.act;
      await handleSettingsAction(actEl, {
        commit,
        render: () => refreshSettingsLayer(),
        rescan: () => doRescan({ manual: true }),
      });
      flushConfigSync();
      if (act?.startsWith("rule") || act?.startsWith("preset") || act === "reload-themes") {
        refreshSettingsLayer();
        renderContent();
        renderHeader();
      }
    }
  });

  settingsLayer?.addEventListener("change", async (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    try {
      await handleSettingsAction(e.target, {
        commit,
        render: () => refreshSettingsLayer(),
        rescan: () => doRescan({ manual: true }),
      });
      flushConfigSync();
    } catch (err) {
      console.error("[settings] 处理下拉框失败", err);
      toast(`设置未生效：${err?.message ?? err}`, { tone: "error", duration: 5000 });
    }
  });

  settingsLayer?.addEventListener("input", (e) => {
    if (e.target.dataset.act !== "rule-value") return;
    const rule = state.filterRules.find((r) => r.id === e.target.dataset.id);
    if (!rule) return;
    rule.value = e.target.value;
    commit();
    refreshRulePreview();
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

  $("#content-body").addEventListener("change", async (e) => {
    const act = e.target.dataset.act;

    if (act === "rule-type" || act === "rule-op") {
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
      return;
    }

    // 设置页里的下拉框（窗口原生材质、响度目标…）统一走 handleSettingsAction。
    // 以前只有 click 分支，下拉框改了值不会有人处理，表现为「选了没反应」。
    if (act && e.target.closest(".settings")) {
      try {
        await handleSettingsAction(e.target, { commit, render: renderContent, rescan: () => doRescan({ manual: true }) });
        flushConfigSync();
      } catch (err) {
        console.error("[settings] 处理下拉框失败", err);
        toast(`设置未生效：${err?.message ?? err}`, { tone: "error", duration: 5000 });
      }
    }
  });
}

function refreshRulePreview() {
  const node = document.querySelector(".settings-layer .rule__preview, #content-body .rule__preview");
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
      const all =
        state.visibleSongs.length > 0 && state.visibleSongs.every((s) => state.selectedIds.has(s.id));
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
  // 「我喜欢」也是歌单，只是内置的：它照样有菜单，只是没有重命名/删除。
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
/** 拖拽结束的时间戳：抑制紧随其后的 click，否则拖动后会被当成「点击歌单」而导航 */
let lastPlaylistDragEndAt = 0;

function bindPlaylistDrag() {
  const nav = $("#playlist-nav");
  if (!nav) return;
  // 需求：拖拽排序不要自己实现，统一用 SortableJS。
  Sortable.create(nav, {
    draggable: ".navitem",
    // 「我喜欢」固定在第一位：禁止拖动它本身（仍可作为落点）
    filter: '[data-locked="true"]',
    animation: 150,
    ghostClass: "is-dragging",
    onEnd(evt) {
      lastPlaylistDragEndAt = Date.now();
      const from = evt.oldIndex;
      const to = evt.newIndex;
      if (from == null || to == null || from === to) return;
      // #playlist-nav 里第 0 项是「我喜欢」（locked），自定义歌单下标要减 1
      movePlaylist(from - 1, to - 1);
      toast("已调整歌单顺序", { duration: 1400 });
    },
  });
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
