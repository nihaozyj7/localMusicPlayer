/* ==========================================================================
   tracks.js — 曲目表格渲染与交互（所有歌曲 / 播放列表 / 歌单 共用）
   ========================================================================== */

import { icon, openMenu, openModal, toast } from "./dom.js";
import { addSongsTo } from "./playlists.js";
import {
  LIKED_ID,
  addNextInQueue,
  appendToQueue,
  commit,
  currentContext,
  isLiked,
  playContext,
  playlistById,
  removeFromQueue,
  removeSongsFromPlaylist,
  reorderQueue,
  state,
  toggleLike,
} from "./store.js";
import { esc, fmtCount, fmtTime } from "./utils.js";

export const SORT_LABELS = {
  addedAt: "添加时间",
  title: "标题",
  artist: "歌手",
  album: "专辑",
  duration: "时长",
  size: "文件大小",
  ext: "格式",
  playCount: "播放次数",
};

/* --------------------------------------------------------------------------
   渲染
   -------------------------------------------------------------------------- */

/** 队列视图需要拖拽手柄，因此按 playlist 模式渲染 */
export function trackTableMode() {
  return state.view === "queue" ? "playlist" : "library";
}

function rowHtml(song, index, mode) {
  const isCurrent = song.id === state.currentId;
  const liked = isLiked(song.id);
  const handle =
    mode === "playlist"
      ? `<div class="track__handle" data-handle="1" title="拖动排序">${icon("grip")}</div>`
      : `<div class="col-handle"></div>`;
  return `
    <div class="track" data-id="${song.id}" data-index="${index}" aria-current="${isCurrent}" data-playing="${state.playing}">
      ${handle}
      <div class="track__index">
        <span class="track__num u-num">${index + 1}</span>
        <div class="track__bars"><span></span><span></span><span></span><span></span></div>
        <button class="track__play" type="button" data-act="play" aria-label="播放 ${esc(song.title)}">${icon("play")}</button>
      </div>
      <div class="track__cover">
        <img src="${song.cover}" alt="" loading="lazy" draggable="false" />
      </div>
      <div class="track__main">
        <div class="track__title">${esc(song.title)}</div>
        <div class="track__sub">
          <span class="track__artist">${esc(song.artist)}</span>
          <span class="track__tag">${esc(song.ext)}</span>
        </div>
      </div>
      <div class="track__album u-ellipsis">${esc(song.album)}</div>
      <div class="track__time">${fmtTime(song.duration)}</div>
      <button class="track__heart" type="button" data-act="like" aria-pressed="${liked}" aria-label="加入我喜欢" data-tip="${liked ? "取消喜欢" : "加入我喜欢"}">
        ${icon("heart")}
      </button>
      <button class="track__more" type="button" data-act="more" aria-label="更多操作" aria-expanded="false">
        ${icon("more")}
      </button>
    </div>`;
}

export function renderTracks(container) {
  const mode = trackTableMode();
  const songs = state.visibleSongs;
  container.innerHTML = `
    <div class="tracks" data-mode="${mode}" data-density="${state.density}">
      <div class="tracks__head" data-mode="${mode}">
        <div class="col-handle"></div>
        <div class="col-index">#</div>
        <div class="col-cover"></div>
        <button class="tracks__sort" type="button" data-sort="title">标题${icon("chevron-down")}</button>
        <button class="tracks__sort col-album" type="button" data-sort="album">专辑${icon("chevron-down")}</button>
        <button class="tracks__sort" type="button" data-sort="duration">时长${icon("chevron-down")}</button>
        <div class="col-heart" title="我喜欢">${icon("heart")}</div>
        <div class="col-more"></div>
      </div>
      <div class="tracks__body">
        ${songs.map((s, i) => rowHtml(s, i, mode)).join("")}
      </div>
    </div>`;

  // 排序方向指示
  container.querySelectorAll(".tracks__sort").forEach((btn) => {
    if (btn.dataset.sort === state.sortKey) {
      btn.dataset.dir = state.sortDir;
      btn.classList.toggle("is-asc", state.sortDir === "asc");
    }
  });
}

/* --------------------------------------------------------------------------
   空态
   -------------------------------------------------------------------------- */
export function renderEmpty(container, { kind = "library" } = {}) {
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
      desc: "从「所有歌曲」或任意歌单里选择歌曲加入播放列表。",
      ok: "去所有歌曲",
      act: "goto-library",
    },
    playlist: {
      icon: "playlist",
      title: "这个歌单还没有歌曲",
      desc: "在「所有歌曲」里点击每首歌后面的爱心或更多菜单，把歌曲加进来。",
      ok: "去所有歌曲",
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
  container.innerHTML = `
    <div class="empty">
      <svg class="empty__art" aria-hidden="true"><use href="#i-${cfg.icon}"/></svg>
      <div class="empty__title">${esc(cfg.title)}</div>
      ${cfg.desc ? `<div class="empty__desc">${esc(cfg.desc)}</div>` : ""}
      ${
        cfg.ok
          ? `<div class="empty__actions"><button class="btn btn--primary" type="button" data-empty-act="${cfg.act}">${esc(cfg.ok)}</button></div>`
          : ""
      }
    </div>`;
}

/* --------------------------------------------------------------------------
   行内交互
   -------------------------------------------------------------------------- */
export function bindTrackEvents(container, handlers = {}) {
  if (container.dataset.bound === "1") return;
  container.dataset.bound = "1";
  container.__handlers = handlers;

  container.addEventListener("click", (e) => {
    const h = container.__handlers || {};
    const emptyAct = e.target.closest("[data-empty-act]")?.dataset.emptyAct;
    if (emptyAct === "add-folder") return h.onAddFolder?.();
    if (emptyAct === "goto-library") return h.onGotoLibrary?.();
    if (emptyAct === "clear-search") return h.onClearSearch?.();

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
      if (row) {
        const ids = state.visibleSongs.map((s) => s.id);
        playContext(ids, Number(row.dataset.index), currentContext());
      }
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
        actEl.setAttribute("aria-pressed", String(liked));
        actEl.dataset.tip = liked ? "取消喜欢" : "加入我喜欢";
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
  });

  container.addEventListener("dblclick", (e) => {
    const row = e.target.closest(".track");
    if (!row) return;
    const ids = state.visibleSongs.map((s) => s.id);
    playContext(ids, Number(row.dataset.index), currentContext());
    state.playerOpen = true;
    state.pvMode = state.config.playerViewMode;
    commit();
  });

  container.addEventListener("contextmenu", (e) => {
    const row = e.target.closest(".track");
    if (!row) return;
    e.preventDefault();
    openTrackMenu(null, row.dataset.id, { x: e.clientX, y: e.clientY });
  });

  bindDragSort(container);
}

/* --------------------------------------------------------------------------
   单曲「更多」菜单
   -------------------------------------------------------------------------- */
export function openTrackMenu(anchor, songId, pos = null) {
  const song = state.songs.find((s) => s.id === songId);
  if (!song) return;
  const liked = isLiked(songId);
  const inQueue = state.queue.includes(songId);

  const items = [
    { id: "play", label: "播放", icon: "play" },
    { id: "play-next", label: "下一首播放", icon: "arrow-right" },
    { id: "sep1", kind: "sep" },
    { id: "queue-add", label: inQueue ? "从播放列表移除" : "加入播放列表", icon: "queue" },
    { id: "like", label: liked ? "取消喜欢" : "加入我喜欢", icon: "heart" },
    { id: "add-to", label: "加入歌单…", icon: "plus" },
  ];

  if (state.view === "queue") {
    items.push({ id: "sep2", kind: "sep" });
    items.push({ id: "remove-here", label: "从播放列表移除", icon: "trash", danger: true });
  } else if (state.view === "playlist" && state.playlistId) {
    const pl = playlistById(state.playlistId);
    if (pl && !pl.locked) {
      items.push({ id: "sep2", kind: "sep" });
      items.push({ id: "remove-here", label: `从「${pl.name}」移除`, icon: "trash", danger: true });
    }
  }

  items.push({ id: "sep3", kind: "sep" });
  items.push({ id: "reveal", label: "在文件夹中显示", icon: "folder" });

  const onPick = (id) => {
    switch (id) {
      case "play": {
        const ids = state.visibleSongs.map((s) => s.id);
        playContext(ids, ids.indexOf(songId), currentContext());
        break;
      }
      case "play-next":
        addNextInQueue(songId);
        toast("已设为下一首播放", { tone: "success", duration: 1500 });
        break;
      case "queue-add":
        if (inQueue) {
          removeFromQueue(songId);
          toast("已从播放列表移除");
        } else {
          appendToQueue([songId]);
          toast("已加入播放列表", { tone: "success", duration: 1500 });
        }
        break;
      case "like":
        toggleLike(songId);
        toast(liked ? "已从「我喜欢」移除" : "已加入「我喜欢」", {
          tone: liked ? "info" : "success",
          duration: 1500,
        });
        break;
      case "add-to":
        openAddToPlaylist(songId);
        break;
      case "remove-here":
        if (state.view === "queue") {
          removeFromQueue(songId);
          toast("已从播放列表移除");
        } else if (state.playlistId) {
          removeSongsFromPlaylist(state.playlistId, [songId]);
          toast("已从歌单移除");
        }
        break;
      case "reveal":
        import("./bridge.js").then((m) => {
          m.backend.revealInExplorer(song.path);
          toast("已在文件夹中定位（需接入后端）", { duration: 1800 });
        });
        break;
      default:
        break;
    }
  };

  if (pos) {
    openMenu({ x: pos.x, y: pos.y, items, onPick });
  } else {
    const r = anchor.getBoundingClientRect();
    openMenu({ x: r.left, y: r.bottom + 6, items, onPick, align: "right" });
  }
}

function openAddToPlaylist(songId) {
  const body = `
    <div class="setting__hint">点击歌单即可把这首歌加进去。</div>
    <div class="u-row u-wrap">
      ${state.playlists
        .map(
          (p) => `<button class="btn btn--sm" type="button" data-pl="${p.id}">
            ${icon(p.id === LIKED_ID ? "heart" : "playlist")}<span>${esc(p.name)}</span>
          </button>`
        )
        .join("")}
    </div>`;
  const { root } = openModal({
    title: "加入歌单",
    body,
    okText: "完成",
    cancelText: "关闭",
    onOk: () => true,
  });
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pl]");
    if (!btn) return;
    addSongsTo(btn.dataset.pl, [songId]);
  });
}

/* --------------------------------------------------------------------------
   拖拽排序（需求 B4）
   -------------------------------------------------------------------------- */
function bindDragSort(container) {
  let dragIndex = -1;
  let armed = false;

  const cleanup = () => {
    armed = false;
    dragIndex = -1;
    container.dataset.dragging = "";
    container.querySelectorAll(".track").forEach((n) => {
      n.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
      n.draggable = false;
    });
  };

  container.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-handle]");
    if (!handle) return;
    const row = handle.closest(".track");
    if (!row) return;
    armed = true;
    dragIndex = Number(row.dataset.index);
    row.draggable = true;
  });

  container.addEventListener("pointerup", () => {
    if (!container.dataset.dragging) cleanup();
  });

  container.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".track");
    if (!armed || !row) {
      e.preventDefault();
      return;
    }
    row.classList.add("is-dragging");
    container.dataset.dragging = "1";
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", row.dataset.id || "");
  });

  container.addEventListener("dragover", (e) => {
    if (!container.dataset.dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const row = e.target.closest(".track");
    container
      .querySelectorAll(".is-drop-before,.is-drop-after")
      .forEach((n) => n.classList.remove("is-drop-before", "is-drop-after"));
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    row.classList.add(after ? "is-drop-after" : "is-drop-before");
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    const row = e.target.closest(".track");
    if (!row || dragIndex < 0) return cleanup();
    const targetIndex = Number(row.dataset.index);
    const after = row.classList.contains("is-drop-after");
    const from = dragIndex;
    cleanup();
    if (targetIndex === from) return;
    // moveItem 语义：先删除源元素，再插入到目标索引（drop-after 需要 +1）
    const to = after ? targetIndex + 1 : targetIndex;
    reorderQueue(from, to);
    toast("已更新播放顺序", { duration: 1400 });
  });

  container.addEventListener("dragend", cleanup);
}

/* --------------------------------------------------------------------------
   批量操作
   -------------------------------------------------------------------------- */
export function playAllVisible(shuffled = false) {
  const ids = state.visibleSongs.map((s) => s.id);
  if (!ids.length) return;
  if (shuffled) {
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  playContext(ids, 0, currentContext());
  toast(shuffled ? "已随机播放" : `开始播放 ${fmtCount(ids.length)} 首`, { duration: 1600 });
}
