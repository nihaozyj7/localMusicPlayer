/* ==========================================================================
   tracks.js — 曲目表格渲染与交互（所有歌曲 / 播放列表 / 歌单 共用）
   ========================================================================== */

import Sortable from "sortablejs";
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
  toggleSelectedSong,
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
  // 歌单多选模式：把「#」列换成勾选框，点整行即勾选
  const selecting = state.view === "playlist" && state.playlistSelecting;
  const checked = selecting && state.selectedIds.has(song.id);
  const handle =
    mode === "playlist"
      ? `<div class="track__handle" data-handle="1" title="拖动排序">${icon("grip")}</div>`
      : `<div class="col-handle"></div>`;
  // 「选中行」与「正在播放行」是同一件事：唯一真源是 state.currentId
  // （同一份数据也驱动底栏与播放详情页，不再各维护一个选中态）。
  const indexCell = selecting
    ? `<span class="track__check" role="checkbox" aria-checked="${checked}">${icon("check")}</span>`
    : `<span class="track__num u-num">${index + 1}</span>
        <div class="track__bars"><span></span><span></span><span></span><span></span></div>
        <button class="track__play" type="button" data-act="play" aria-label="播放 ${esc(song.title)}">${icon("play")}</button>`;
  return `
    <div class="track" data-id="${song.id}" data-index="${index}" data-selectable="${selecting ? "1" : "0"}" aria-selected="${checked}" aria-current="${isCurrent}" data-playing="${
      isCurrent && state.playing ? "true" : "false"
    }">
      ${handle}
      <div class="track__index">
        ${indexCell}
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
  // 播放列表（队列）的顺序由用户拖拽决定，表头排序对它没有意义：
  // 这里渲染成静态文本，避免出现「点了排序没反应」的假按钮。
  const sortable = mode !== "playlist";
  const sortCell = (key, label, cls = "") =>
    sortable
      ? `<button class="tracks__sort ${cls}" type="button" data-sort="${key}">${label}${icon("chevron-down")}</button>`
      : `<div class="tracks__sort ${cls}" data-static="1">${label}</div>`;
  container.innerHTML = `
    <div class="tracks" data-mode="${mode}" data-density="${state.config.listDensity || "cozy"}"
         data-album="${state.config.showAlbumColumn === false ? "off" : "on"}">
      <div class="tracks__head" data-mode="${mode}">
        <div class="col-handle"></div>
        <div class="col-index">#</div>
        <div class="col-cover"></div>
        ${sortCell("title", "标题")}
        ${sortCell("album", "专辑", "col-album")}
        ${sortCell("duration", "时长")}
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

  // 队列的拖拽排序交给 SortableJS（需求：不要自己实现拖拽逻辑）。
  // 只在队列视图绑定：本地歌曲 / 歌单的顺序由排序字段决定，拖拽没有意义。
  if (state.view === "queue") bindQueueSort(container);
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
    // 拖拽排序刚结束时会跟着冒泡一个 click：不拦的话会误判成「单击歌曲行」，
    // 把刚拖过的那首歌设为「下一首播放」。
    if (shouldIgnoreRowClick()) return;

    // 歌单多选模式：点整行 = 勾选 / 取消勾选。
    // 这个判断放在最前面，连「播放 / 爱心 / 更多」按钮也一起拦截 ——
    // 多选时用户的目标就是勾选，误触发别的动作反而更烦。
    const selectRow = e.target.closest(".track");
    if (selectRow && state.view === "playlist" && state.playlistSelecting) {
      e.preventDefault();
      toggleSelectedSong(selectRow.dataset.id);
      return;
    }

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
    // 多选模式下双击不进入播放（否则选歌时会被突然切歌打断）
    if (state.view === "playlist" && state.playlistSelecting) return;
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
   定位到当前播放
   --------------------------------------------------------------------------
   需求：歌单 / 曲库这种长列表里换歌之后，列表**不会跟着滚动**，用户根本
   不知道现在播到哪一首（正在播的那一行在滚动区之外）。这里给出统一的
   「定位」能力，三个地方共用：

     · 曲库 / 歌单的工具条按钮（shell.js）
     · 底栏「播放列表」面板（playerbar.js）
     · 播放列表（队列）视图 —— 用的就是同一套曲目表格

   当前播放行在列表里存在时：滚到它、闪一下（.is-located，让用户确认
   「找的就是这一行」）。不存在时如实说明，不做「静默什么都不发生」。
   -------------------------------------------------------------------------- */

/** 落点提示的动画时长：与 tracktable.css 的 track-locate 保持一致 */
const LOCATE_HIGHLIGHT_MS = 1500;

/** 给一个条目加上「刚定位到这里」的落点提示 */
export function highlightLocated(el) {
  if (!el) return;
  el.classList.remove("is-located");
  void el.offsetWidth; // 强制重排：连续点两次也能重新触发动画
  el.classList.add("is-located");
  window.setTimeout(() => el.classList.remove("is-located"), LOCATE_HIGHLIGHT_MS);
}

/**
 * 把某个元素滚进视野。
 *
 * 优先用 scrollIntoView：它自己认 sticky 表头与 scroll-padding，
 * 不用手写偏移量。队列视图里那个条目已经可见时会产生「真实滚动」，
 * 被外层容器拦下来会抛异常（浏览器差异），因此兜底按容器滚。
 */
function scrollAndHighlight(el) {
  if (!el) return;
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch {
    scrollIntoContainer(el);
  }
  highlightLocated(el);
}

/**
 * 兜底：只让「最近的可滚动祖先」动，不牵扯整页。
 *
 * 为什么不直接算「祖先滚动容器」：在个别布局下让浏览器接管滚动没动静
 * （元素确实在滚动区之外、但祖先链上没有可滚动盒）。这时手工算一次，
 * 保证按钮不会变成「点了没反应」。
 */
function scrollIntoContainer(el) {
  const scroller = el.closest(".content-body, .queue-panel__body");
  if (!scroller) return;
  const elRect = el.getBoundingClientRect();
  const scRect = scroller.getBoundingClientRect();
  const stickyPad = scroller.classList.contains("content-body") ? 34 + 16 : 8;
  const visibleTop = scRect.top + stickyPad;
  if (elRect.top < visibleTop) {
    scroller.scrollTop -= visibleTop - elRect.top;
  } else if (elRect.bottom > scRect.bottom) {
    scroller.scrollTop += elRect.bottom - scRect.bottom;
  }
}

/** 在指定的曲目表格里找到当前播放行（没有就返回 null） */
function currentRowIn(root) {
  const id = state.currentId;
  if (!id) return null;
  const row = root.querySelector(`.track[data-id="${CSS.escape(id)}"]`);
  return row ? { el: row } : null;
}

/** 队列面板里的当前播放条目（没有就返回 null） */
function currentQueueItem() {
  const id = state.currentId;
  if (!id) return null;
  const body = document.querySelector("#queue-panel-body");
  return body?.querySelector(`.queue-item[data-queue-id="${CSS.escape(id)}"]`) || null;
}

/**
 * 曲库 / 歌单视图的「定位到当前播放」。
 *
 * 列表可能已经被搜素 / 筛选裁掉了那一行（state.visibleSongs 里没有它），
 * 这时不做任何越权操作 —— 只提示原因，避免用户以为按钮坏了。
 */
export function locateCurrentSong({ notify = true } = {}) {
  if (!state.currentId) {
    if (notify) toast("当前没有正在播放的歌曲", { tone: "info", duration: 1600 });
    return false;
  }
  const body = document.getElementById("content-body");
  const found = body ? currentRowIn(body) : null;
  if (!found) {
    if (notify) {
      toast("当前播放的歌曲不在这个列表里", {
        tone: "info",
        duration: 2200,
      });
    }
    return false;
  }
  scrollAndHighlight(found.el);
  return true;
}

/**
 * 播放列表面板（底栏「播放列表」按钮弹出的那块）的「定位到当前播放」。
 *
 * 面板没打开时会先打开它 —— 按钮就在面板标题栏上，正常不会走到这条路，
 * 但外部调用（例如以后的快捷键）也不该悄悄失败。
 */
export function locateCurrentQueueItem({ notify = true } = {}) {
  if (!state.queue.length) {
    if (notify) toast("播放列表是空的", { tone: "info", duration: 1600 });
    return false;
  }
  const item = currentQueueItem();
  if (!item) {
    if (notify) toast("当前播放的歌曲不在播放列表里", { tone: "info", duration: 2200 });
    return false;
  }
  scrollAndHighlight(item);
  return true;
}


/* --------------------------------------------------------------------------
   队列拖拽排序（SortableJS）
   --------------------------------------------------------------------------
   需求：不要自己实现拖拽逻辑；并且「拖拽排序后界面要真的看到效果」。
   以前是手写 HTML5 DnD，而队列视图还会再按 sortKey 排一次序，
   把拖拽结果整个盖掉 —— 于是提示成功、界面没变化。
   现在：
     · 拖拽交给 SortableJS（成熟库，触屏 / 键盘 / 自动滚动都已处理好）；
     · 队列视图不再二次排序（见 store.js#recalcVisible）；
     · onEnd 调用 reorderQueue()，它会顺手把播放模式切回「列表循环」。
   -------------------------------------------------------------------------- */

/** 容器会随视图重建，保留实例、重建前销毁，避免事件重复绑定 */
let queueSortable = null;

/** 刚刚拖拽结束的时间戳：抑制紧随其后的 click，否则会误触「加入下一首播放」 */
let lastDragEndAt = 0;

export function shouldIgnoreRowClick() {
  return Date.now() - lastDragEndAt < 260;
}

function bindQueueSort(container) {
  const body = container.querySelector(".tracks__body");
  if (!body) return;
  queueSortable?.destroy();
  queueSortable = Sortable.create(body, {
    handle: "[data-handle]",
    draggable: ".track",
    animation: 160,
    ghostClass: "is-dragging",
    chosenClass: "is-dragging",
    onEnd(evt) {
      lastDragEndAt = Date.now();
      const from = evt.oldIndex;
      const to = evt.newIndex;
      if (from == null || to == null || from === to) return;
      reorderQueue(from, to);
      toast("已调整播放顺序 · 播放模式已切回列表循环", { duration: 1800 });
    },
  });
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
