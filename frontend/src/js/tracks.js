/* ==========================================================================
   tracks.js — 曲目表格渲染与交互（所有歌曲 / 播放列表 / 歌单 共用）
   ========================================================================== */

import { bindCoverFallback, icon, openMenu, openModal, toast } from "./dom.js";
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
  songById,
  state,
  toggleLike,
} from "./store.js";
import { coverOf, esc, fmtCount, fmtTime } from "./utils.js";

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
  // 「选中行」与「正在播放行」是同一件事：唯一真源是 state.currentId
  // （同一份数据也驱动底栏与播放详情页，不再各维护一个选中态）。
  return `
    <div class="track" data-id="${song.id}" data-index="${index}" aria-current="${isCurrent}" data-playing="${
      isCurrent && state.playing ? "true" : "false"
    }">
      ${handle}
      <div class="track__index">
        <span class="track__num u-num">${index + 1}</span>
        <div class="track__bars"><span></span><span></span><span></span><span></span></div>
        <button class="track__play" type="button" data-act="play" aria-label="播放 ${esc(song.title)}">${icon("play")}</button>
      </div>
      <div class="track__cover">
        <img src="${esc(coverOf(song))}" alt="" loading="lazy" draggable="false" />
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
    <div class="tracks" data-mode="${mode}" data-density="${state.config.listDensity || "cozy"}"
         data-album="${state.config.showAlbumColumn === false ? "off" : "on"}">
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

  // 封面加载失败 → 默认封面（不要留下浏览器破碎图标）
  container.querySelectorAll(".track__cover img").forEach(bindCoverFallback);
}

/* --------------------------------------------------------------------------
   表头右键菜单：列显隐
   --------------------------------------------------------------------------
   需求：在歌曲列表表头右键，选择显示/隐藏某一列。
   目前开放「专辑」一列 —— 其余列（#/封面/标题/时长/爱心/更多）是列表的骨架，
   关掉任何一个表格都会失去意义，所以不做成可选项。
   以后要加列：往 COLUMN_TOGGLES 里加一条，并在 CSS 里写好对应的隐藏规则即可
   （隐藏统一用「列宽归零 + 内容 display:none」，表头与数据行才不会错位）。
   -------------------------------------------------------------------------- */
const COLUMN_TOGGLES = [
  {
    id: "album",
    label: "专辑",
    icon: "album",
    isOn: () => state.config.showAlbumColumn !== false,
    set: (on) => {
      state.config.showAlbumColumn = on;
    },
  },
];

export function openColumnMenu(x, y) {
  const items = [{ kind: "label", label: "显示的列" }];
  for (const col of COLUMN_TOGGLES) {
    items.push({ id: `col-${col.id}`, label: col.label, icon: col.icon, checked: col.isOn() });
  }
  items.push({ kind: "sep" });
  items.push({ id: "col-reset", label: "恢复默认列", icon: "refresh" });

  openMenu({
    x,
    y,
    items,
    onPick: (id) => {
      if (id === "col-reset") {
        for (const col of COLUMN_TOGGLES) col.set(true);
        commit();
        toast("已恢复默认列", { duration: 1400 });
        return;
      }
      const col = COLUMN_TOGGLES.find((c) => `col-${c.id}` === id);
      if (!col) return;
      const next = !col.isOn();
      col.set(next);
      commit();
      toast(next ? `已显示「${col.label}」列` : `已隐藏「${col.label}」列`, { duration: 1400 });
    },
  });
}

/* --------------------------------------------------------------------------
   单击行为
   --------------------------------------------------------------------------
   需求：点击歌曲默认「添加到下一首播放」，而不是「播放全部」；
   用户可以在设置里改回「立即播放」或「加到末尾」。

   双击始终是「立即播放并从这一首开始」—— 这是各地播放器的通用约定，
   不受设置影响（否则把设置改成 next 之后就没有「马上听这首」的入口了）。
   -------------------------------------------------------------------------- */
export function activateRow(row, { silent = false } = {}) {
  const songId = row?.dataset?.id;
  if (!songId) return;
  const action = state.config.rowClickAction || "next";

  if (action === "play") {
    const ids = state.visibleSongs.map((s) => s.id);
    playContext(ids, Number(row.dataset.index), currentContext());
    return;
  }

  if (action === "append") {
    appendToQueue([songId]);
    if (!silent) toast("已加入播放列表末尾", { tone: "success", duration: 1500 });
    return;
  }

  // next（默认）
  addNextInQueue(songId);
  if (!silent) toast("已设为下一首播放", { tone: "success", duration: 1500 });
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
        // 单击行为的默认值是「加入下一首播放」——之前在设置里可以改。
        // 双击才是「立即播放并从这一首开始」（见下面的 dblclick）。
        activateRow(row, { silent: false });
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
  });

  bindDragSort(container);
}

/* --------------------------------------------------------------------------
   单曲「更多」菜单
   -------------------------------------------------------------------------- */
export function openTrackMenu(anchor, songId, pos = null) {
  // 用 songById 而不是只查 state.songs：队列里可能是在线试听曲目，
  // 只查本地曲库会直接 return —— 表现为「在线歌曲右键没反应」。
  const song = songById(songId);
  if (!song) return;
  const online = Boolean(song.online);
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

  // 在线试听曲目：没有本地文件，换封面/嵌入标签/在文件夹中显示都没有意义
  if (!online) {
    items.push({ id: "cover", label: "更换封面…", icon: "image" });
  }

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

  // 在线曲目没有本地文件路径，最后这一组（在文件夹中显示）没有意义
  if (!online) {
    items.push({ id: "sep3", kind: "sep" });
    items.push({ id: "reveal", label: "在文件夹中显示", icon: "folder" });
  }

  const onPick = (id) => {
    switch (id) {
      case "play": {
        const ids = state.visibleSongs.map((s) => s.id);
        const at = ids.indexOf(songId);
        // 在线曲目不在 visibleSongs 里：直接单独播它
        if (at < 0) playContext([songId], 0, { type: "online", id: null });
        else playContext(ids, at, currentContext());
        break;
      }
      case "cover":
        import("./coverpanel.js").then((m) => m.openCoverPanel(songId));
        break;
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
    // moveItem 的 to 是「删掉源元素之后」的插入下标，因此向下拖时要减 1 抵消位移。
    let insertAt = after ? targetIndex + 1 : targetIndex;
    if (from < insertAt) insertAt -= 1;
    if (insertAt === from) return;
    reorderQueue(from, insertAt);
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
