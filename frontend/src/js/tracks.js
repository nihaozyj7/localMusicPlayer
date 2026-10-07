/* ==========================================================================
   tracks.js — 曲目行交互与菜单（纯逻辑，渲染在 ui/track-table.js）
   --------------------------------------------------------------------------
   迁移前这个文件同时是「表格渲染器」（tableStates / rowFields / patchRowEl /
   reconcileRows 近 200 行手写增量 diff）与「行交互」。迁移后渲染交给
   <mp-track-table>（Lit keyed repeat），这里只留动作。
   ========================================================================== */

import { html } from "lit";
import { openMenu, openModal, toast } from "./ui/overlays.js";
import { addSongsTo } from "./playlists.js";
import {
  LIKED_ID,
  addNextInQueue,
  appendToQueue,
  commit,
  currentContext,
  isLiked,
  playContext,
  playSong,
  playlistById,
  removeFromQueue,
  removeSongsFromPlaylist,
  songById,
  state,
  toggleLike,
} from "./store.js";
import { esc, fmtCount } from "./utils.js";

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
   单击 / 双击行为
   --------------------------------------------------------------------------
   单击有三种模式（与 Go 侧 bootstrap.RowClickActions 一一对应）：
     play       播放        —— 播这一首，并把它加进播放列表（不动现有列表）
     play-list  播放当前列表 —— 播这一首，并用当前整个列表替换播放队列
     next       下一首播放   —— 插到当前歌曲后面，下一次「下一曲」就播它（默认）

   双击始终是「立即播放并从这一首开始」—— 这是各地播放器的通用约定，
   不受设置影响（否则把设置改成 next 之后就没有「马上听这首」的入口了）。
   -------------------------------------------------------------------------- */
export function activateRow(row, { silent = false } = {}) {
  const songId = row?.dataset?.id;
  if (!songId) return;
  const action = state.config.rowClickAction || "next";

  if (action === "play") {
    // playSong 保证这首歌一定在播放列表里（不在就追加到末尾），但不会清掉现有列表
    playSong(songId);
    return;
  }

  if (action === "play-list") {
    const ids = state.visibleSongs.map((s) => s.id);
    playContext(ids, Number(row.dataset.index), currentContext());
    return;
  }

  // 下一首播放（默认）
  addNextInQueue(songId);
  if (!silent) toast("已设为下一首播放", { tone: "success", duration: 1500 });
}

/* --------------------------------------------------------------------------
   表头右键菜单：列显隐
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
        import("./bridge.js").then(async (m) => {
          try {
            await m.backend.revealInExplorer(song.path);
            toast("已在文件夹中显示", { duration: 1800 });
          } catch (err) {
            toast(`无法在文件夹中显示：${err?.message ?? err}`, { tone: "error", duration: 4000 });
          }
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
  const playlists = state.playlists;
  const { root } = openModal({
    title: "加入歌单",
    body: html`
      <div class="setting__hint">点击歌单即可把这首歌加进去。</div>
      <div class="u-row u-wrap">
        ${playlists.map(
          (p) =>
            html` <button class="btn btn--sm" type="button" data-pl=${p.id}>
              <svg aria-hidden="true"><use href="#i-${p.id === LIKED_ID ? "heart" : "playlist"}"></use></svg>
              <span>${p.name}</span>
            </button>`
        )}
      </div>
    `,
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
   曲库 / 歌单这种长列表里换歌之后，列表不会自己滚动，用户根本不知道
   现在播到哪一首。这里给出统一的「定位」能力，三个地方共用。

   落点提示（.is-located 的描边呼吸，样式见 locate.css）**必须等滚动停稳再放**：
   内容区是平滑滚动的（.content-body 有 scroll-behavior: smooth），滚到目标
   行要几百毫秒；提示若在点击瞬间就开演，等行滚进视野时动画早放完了 —— 这
   正是迁移前的老问题，各处列表都中招。所以时机统一由 scrollAndHighlight
   把关：滚动真正停下才给行加 class。播放列表面板那条路（点底栏按钮展开面板）
   还要额外等面板升起，见 ui/playerbar.js#locateAndToggleQueue。
   -------------------------------------------------------------------------- */

/** 落点提示的动画总时长：必须 ≥ locate.css 里 --locate-dur（1.4s）收尾的时刻 */
const LOCATE_HIGHLIGHT_MS = 1500;

/** 滚动「停稳」的判定：最后一次位移之后静止这么久（毫秒）就算滚完了 */
const SCROLL_IDLE_MS = 140;

/** 兜底：scrollend 不来 / 滚动异常时，最迟这么久也必须把提示放出来
    （同时也是 verify-fixes.mjs 的时间预算：800 + 1500 必须留在它的检查窗口里） */
const SCROLL_MAX_WAIT_MS = 800;

/** 每个元素自己的提示定时器与「第几次定位」：连点两下时只有最后一次算数 */
const locatedTimers = new WeakMap();
const locatedSeq = new WeakMap();

export function highlightLocated(el) {
  if (!el) return;
  // 上一次的移除定时器要清掉，否则重播动画会被旧定时器提前摘掉 class
  clearTimeout(locatedTimers.get(el));
  el.classList.remove("is-located");
  void el.offsetWidth; // 强制重排：连续点两次也能重新触发动画
  el.classList.add("is-located");
  locatedTimers.set(
    el,
    window.setTimeout(() => el.classList.remove("is-located"), LOCATE_HIGHLIGHT_MS)
  );
}

/**
 * 把某个元素滚进视野，**等滚动真的停下来**再放落点提示。
 *
 * 优先用 scrollIntoView：它自己认 sticky 表头与 scroll-padding，不用手写偏移量。
 */
export function scrollAndHighlight(el) {
  if (!el) return;
  const seq = (locatedSeq.get(el) ?? 0) + 1;
  locatedSeq.set(el, seq);

  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch {
    scrollIntoContainer(el);
  }

  whenScrollSettled(el, () => {
    // 等待期间用户又点了一次定位 → 这次的回调作废，别覆盖更晚那次的提示
    if (locatedSeq.get(el) !== seq || !el.isConnected) return;
    highlightLocated(el);
  });
}

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

/** 找到 el 所在的滚动容器（曲目行 → .content-body，队列条目 → .queue-panel__body） */
function findScroller(el) {
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * 等滚动停稳再回调。三条信号，先到先得：
 *   1. scrollend —— 浏览器明确宣布「这次滚动结束了」（Chromium 114+ 支持）；
 *   2. 位移静默 —— 连续 SCROLL_IDLE_MS 毫秒 scrollTop/scrollLeft 不再变化。
 *      行本来就在视野里、压根没滚动的情况靠它：约 140ms 后直接回调，
 *      不用白等 scrollend（那种情况下它根本不会来）；
 *   3. 兜底超时 —— SCROLL_MAX_WAIT_MS，防止前两条永远不来把提示卡死。
 *
 * 轮询只在 rAF 里读 scrollTop（每帧一次、单元素），没有布局抖动；
 * scrollIntoView 是一次性的用户动作，本身读写布局不构成热路径。
 */
function whenScrollSettled(el, done) {
  const scroller = findScroller(el);
  if (!scroller) {
    requestAnimationFrame(done);
    return;
  }

  let finished = false;
  let raf = 0;
  let timer = 0;
  let lastTop = scroller.scrollTop;
  let lastLeft = scroller.scrollLeft;
  let lastMoveAt = performance.now();

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    scroller.removeEventListener("scrollend", finish);
    done();
  };

  const tick = () => {
    const top = scroller.scrollTop;
    const left = scroller.scrollLeft;
    if (top !== lastTop || left !== lastLeft) {
      lastTop = top;
      lastLeft = left;
      lastMoveAt = performance.now();
    }
    if (performance.now() - lastMoveAt >= SCROLL_IDLE_MS) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  scroller.addEventListener("scrollend", finish);
  raf = requestAnimationFrame(tick);
  timer = window.setTimeout(finish, SCROLL_MAX_WAIT_MS);
}

function currentRowIn(root) {
  const id = state.currentId;
  if (!id) return null;
  const row = root.querySelector(`.track[data-id="${CSS.escape(id)}"]`);
  return row ? { el: row } : null;
}

function currentQueueItem() {
  const id = state.currentId;
  if (!id) return null;
  const body = document.querySelector("#queue-panel-body");
  return body?.querySelector(`.queue-item[data-queue-id="${CSS.escape(id)}"]`) || null;
}

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
   拖拽抑制：拖完紧接着的 click 不是用户「点击行」
   -------------------------------------------------------------------------- */
let lastDragEndAt = 0;

export function markDragEnd() {
  lastDragEndAt = Date.now();
}

export function shouldIgnoreRowClick() {
  return Date.now() - lastDragEndAt < 260;
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

export const SORT_KEYS = ["addedAt", "title", "artist", "album", "duration", "size", "playCount"];

export { esc };
