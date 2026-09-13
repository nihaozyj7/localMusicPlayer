/* ==========================================================================
   playerbar.js — 底部常驻播放控件
   --------------------------------------------------------------------------
   结构（见 index.html）：
     上面一整行：进度条（已播时间 ── 轨道 ── 总时长）
     下面一行：  【封面】曲目名·歌手-专辑  喜欢  添加到歌单
                 上一首 播放/暂停 下一首
                 音量  播放顺序  桌面歌词  播放列表  全屏
   ========================================================================== */

import { $, bindCoverFallback, icon, openMenu, toast } from "./dom.js";
import { createSlider } from "./slider.js";
import { applyVolume, seekTo } from "./audio.js";
import { addSongsTo } from "./playlists.js";
import {
  LIKED_ID,
  clearQueue,
  commit,
  currentSong,
  cyclePlayMode,
  isLiked,
  nextIndex,
  playNext,
  playPrev,
  playSong,
  playlistById,
  removeFromQueue,
  setVolume,
  state,
  toggleLike,
  togglePlay,
  toggleMute,
} from "./store.js";
import { coverOf, esc, fmtTime } from "./utils.js";

const MODE_META = {
  sequence: { icon: "list-order", label: "顺序播放" },
  "loop-all": { icon: "repeat", label: "列表循环" },
  "loop-one": { icon: "repeat-one", label: "单曲循环" },
  shuffle: { icon: "shuffle", label: "随机播放" },
};

let progressSlider = null;
let volumeSlider = null;
let lastPainted = {
  id: null,
  pos: -1,
  dur: -1,
  playing: null,
  volume: -1,
  muted: null,
  mode: null,
  liked: null,
  queueLen: -1,
};

export function initPlayerBar({ onOpenPlayer, onToggleQueue }) {
  const els = {
    cover: $("#bar-cover"),
    coverImg: $("#bar-cover-img"),
    meta: $("#bar-meta"),
    title: $("#bar-title"),
    sub: $("#bar-sub"),
    heart: $("#bar-heart"),
    add: $("#bar-add"),
    prev: $("#btn-prev"),
    play: $("#btn-play"),
    playIcon: $("#icon-play"),
    next: $("#btn-next"),
    current: $("#time-current"),
    total: $("#time-total"),
    progress: $("#progress"),
    mode: $("#btn-mode"),
    modeIcon: $("#icon-mode"),
    mute: $("#btn-mute"),
    volumeIcon: $("#icon-volume"),
    volume: $("#volume"),
    desktopLyrics: $("#btn-desktop-lyrics"),
    playlist: $("#btn-playlist"),
  };

  // 封面兜底：后端没给封面 / 地址失效时换默认封面，不显示破碎图标
  bindCoverFallback(els.coverImg);

  progressSlider = createSlider(els.progress, {
    min: 0,
    max: 1000,
    step: 1,
    value: 0,
    format: (v) => fmtTime((v / 1000) * (state.duration || 0)),
    onChange: (v) => {
      if (!state.duration) return;
      state.position = (v / 1000) * state.duration;
      els.current.textContent = fmtTime(state.position);
    },
    onCommit: (v) => {
      if (!state.duration) return;
      const ms = (v / 1000) * state.duration;
      seekTo(ms);
    },
  });

  volumeSlider = createSlider(els.volume, {
    min: 0,
    max: 1,
    step: 0.01,
    value: state.volume,
    format: (v) => `${Math.round(v * 100)}`,
    onChange: (v) => {
      setVolume(v);
      applyVolume();
      const ic = v === 0 ? "volume-mute" : v < 0.5 ? "volume-low" : "volume-high";
      els.volumeIcon.innerHTML = `<use href="#i-${ic}"/>`;
    },
  });

  els.prev.addEventListener("click", () => playPrev());
  els.play.addEventListener("click", () => togglePlay());
  els.next.addEventListener("click", () => playNext(false));
  els.mode.addEventListener("click", () => {
    cyclePlayMode();
    const meta = MODE_META[state.playMode];
    toast(meta.label, { duration: 1400 });
  });
  els.mute.addEventListener("click", () => {
    toggleMute();
    applyVolume();
  });
  els.heart.addEventListener("click", () => {
    if (!state.currentId) return;
    toggleLike(state.currentId);
    const liked = isLiked(state.currentId);
    toast(liked ? "已加入「我喜欢」" : "已从「我喜欢」移除", {
      tone: liked ? "success" : "info",
      duration: 1500,
    });
  });
  els.add.addEventListener("click", () => openAddToPlaylistMenu(els.add));
  els.cover.addEventListener("click", () => onOpenPlayer?.());
  els.meta.addEventListener("click", () => onOpenPlayer?.());
  els.playlist.addEventListener("click", () => {
    if (onToggleQueue) onToggleQueue();
    else toggleQueuePanel();
  });
  /* 「桌面歌词」= 在桌面上单独开一个透明窗口显示歌词（尚未实现）。
     注意这里**没有**歌词显隐按钮：需求是歌词不提供隐藏入口，
     详情页那块歌词区由设置 → 歌词控制。 */
  els.desktopLyrics?.addEventListener("click", () => {
    toast("桌面歌词暂未实现：它会在桌面上单独开一个透明窗口显示歌词，不影响详情页里的歌词", {
      tone: "warning",
      duration: 4200,
    });
  });

  bindQueuePanel();
  renderQueuePanel();
}

/**
 * 「添加到歌单」菜单：把当前播放的这首歌加入任意歌单。
 * 没有正在播放的歌曲时直接提示，不弹空菜单。
 */
function openAddToPlaylistMenu(anchor) {
  const song = currentSong();
  if (!song) {
    toast("还没有正在播放的歌曲", { duration: 1600 });
    return;
  }
  const playlists = state.playlists.filter((p) => !p.locked);
  const items = playlists.map((p) => ({
    id: p.id,
    label: p.name,
    icon: p.id === LIKED_ID ? "heart" : "playlist",
    checked: p.songIds.includes(song.id),
  }));
  if (!items.length) {
    items.push({ id: "__none", label: "还没有可用的歌单", disabled: true });
  }
  items.push({ id: "__sep", kind: "sep" });
  items.push({ id: "__new", label: "新建歌单…", icon: "plus" });

  openMenu({
    anchor,
    x: 0,
    y: 0,
    align: "right",
    items,
    onPick: async (id) => {
      if (id === "__none" || id === "__sep") return;
      if (id === "__new") {
        const { promptNewPlaylist } = await import("./playlists.js");
        promptNewPlaylist((pl) => {
          if (pl) addSongsTo(pl.id, [song.id]);
        });
        return;
      }
      addSongsTo(id, [song.id]);
    },
  });
}

/* --------------------------------------------------------------------------
   播放列表面板
   --------------------------------------------------------------------------
   底栏「播放列表」按钮打开：在播放控件上方浮出一块面板，列出当前队列。
   直接操作 state.queue，重绘由 paintPlayerBar 的节流驱动 —— 不做监听器堆叠。
   -------------------------------------------------------------------------- */
const PANEL_MS = 200;
let panelCloseTimer = null;
let panelBound = false;
let panelKey = "";

export function toggleQueuePanel(force) {
  const next = typeof force === "boolean" ? force : !state.queueOpen;
  state.queueOpen = next;
  commit();
  renderQueuePanel();
}

function renderQueuePanel() {
  const panel = $("#queue-panel");
  if (!panel) return;

  if (state.queueOpen) {
    if (panelCloseTimer) {
      clearTimeout(panelCloseTimer);
      panelCloseTimer = null;
    }
    panel.hidden = false;
    // 先解除 hidden 再标 opened，否则同一帧内的类切换不会触发过渡
    requestAnimationFrame(() => panel.setAttribute("data-state", "opened"));
  } else if (!panel.hidden) {
    panel.setAttribute("data-state", "closed");
    if (!panelCloseTimer) {
      panelCloseTimer = setTimeout(() => {
        panelCloseTimer = null;
        if (!state.queueOpen) panel.hidden = true;
      }, PANEL_MS);
    }
  }

  // 内容只在「队列 / 当前曲目 / 播放状态」变化时重建，避免每次进度更新都重排
  const key = `${state.queue.join(",")}|${state.currentId ?? ""}|${state.playing ? 1 : 0}`;
  if (key === panelKey) return;
  panelKey = key;

  const songs = state.queue.map((id) => state.songs.find((s) => s.id === id)).filter(Boolean);
  const count = $("#queue-panel-count");
  if (count) count.textContent = `${songs.length} 首`;

  const body = $("#queue-panel-body");
  if (!body) return;
  if (!songs.length) {
    body.innerHTML = `<div class="queue-panel__empty">播放列表是空的<br />从曲库把歌曲加进来吧</div>`;
    return;
  }
  body.innerHTML = songs
    .map((song, i) => {
      const current = song.id === state.currentId;
      return `
      <div class="queue-item" data-queue-id="${esc(song.id)}" aria-current="${current}" role="button" tabindex="0">
        <span class="queue-item__index">${current && state.playing ? icon("play") : i + 1}</span>
        <span class="queue-item__cover"><img src="${esc(coverOf(song))}" alt="" loading="lazy" /></span>
        <span class="queue-item__main">
          <span class="queue-item__title">${esc(song.title)}</span>
          <span class="queue-item__sub">${esc(song.artist)}${song.album ? ` · ${esc(song.album)}` : ""}</span>
        </span>
        <button class="queue-item__del" type="button" data-queue-del="${esc(song.id)}" data-tip="从列表移除" aria-label="从列表移除">
          ${icon("close")}
        </button>
      </div>`;
    })
    .join("");
  body.querySelectorAll("img").forEach(bindCoverFallback);
}

function bindQueuePanel() {
  if (panelBound) return;
  panelBound = true;

  const panel = $("#queue-panel");
  if (!panel) return;

  $("#queue-close")?.addEventListener("click", () => toggleQueuePanel(false));
  $("#queue-clear")?.addEventListener("click", () => {
    clearQueue();
    toast("播放列表已清空");
  });
  $("#queue-reverse")?.addEventListener("click", () => {
    state.queue = state.queue.slice().reverse();
    commit();
    toast("已反转播放顺序");
  });

  panel.addEventListener("click", (e) => {
    const del = e.target.closest("[data-queue-del]");
    if (del) {
      e.stopPropagation();
      removeFromQueue(del.dataset.queueDel);
      return;
    }
    const item = e.target.closest("[data-queue-id]");
    if (item) playSong(item.dataset.queueId);
  });

  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest?.("[data-queue-id]");
    if (!item) return;
    e.preventDefault();
    playSong(item.dataset.queueId);
  });
}

export function paintPlayerBar() {
  const song = currentSong();
  const els = {
    coverImg: $("#bar-cover-img"),
    title: $("#bar-title"),
    sub: $("#bar-sub"),
    heart: $("#bar-heart"),
    add: $("#bar-add"),
    playIcon: $("#icon-play"),
    play: $("#btn-play"),
    current: $("#time-current"),
    total: $("#time-total"),
    progress: $("#progress"),
    mode: $("#btn-mode"),
    modeIcon: $("#icon-mode"),
    volume: $("#volume"),
    volumeIcon: $("#icon-volume"),
    desktopLyrics: $("#btn-desktop-lyrics"),
    playlist: $("#btn-playlist"),
  };

  /* 曲目信息 */
  if (song && song.id !== lastPainted.id) {
    els.coverImg.src = coverOf(song);
    els.coverImg.alt = `${song.title} 封面`;
    els.title.textContent = song.title;
    els.sub.textContent = `${song.artist} · ${song.album}`;
    els.add.disabled = false;
    lastPainted.id = song.id;
  } else if (!song && lastPainted.id !== null) {
    els.coverImg.removeAttribute("src");
    els.title.textContent = "未在播放";
    els.sub.textContent = "选择一首歌曲开始";
    els.add.disabled = true;
    lastPainted.id = null;
  }

  /* 进度 */
  const pos = Math.round(state.position);
  const dur = Math.round(state.duration || 0);
  if (pos !== lastPainted.pos) {
    lastPainted.pos = pos;
    els.current.textContent = fmtTime(pos);
    if (dur > 0 && els.progress.dataset.dragging !== "true") {
      progressSlider?.set((pos / dur) * 1000, { silent: true });
    }
  }
  if (dur !== lastPainted.dur) {
    lastPainted.dur = dur;
    els.total.textContent = fmtTime(dur);
    progressSlider?.setDisabled(dur <= 0);
  }

  /* 播放状态 */
  if (state.playing !== lastPainted.playing) {
    lastPainted.playing = state.playing;
    els.playIcon.innerHTML = `<use href="#i-${state.playing ? "pause" : "play"}"/>`;
    els.play.setAttribute("aria-label", state.playing ? "暂停" : "播放");
    els.play.dataset.tip = state.playing ? "暂停" : "播放";
  }

  /* 音量 */
  if (state.volume !== lastPainted.volume || state.muted !== lastPainted.muted) {
    lastPainted.volume = state.volume;
    lastPainted.muted = state.muted;
    const effective = state.muted ? 0 : state.volume;
    volumeSlider?.set(effective, { silent: true });
    const ic = effective === 0 ? "volume-mute" : effective < 0.5 ? "volume-low" : "volume-high";
    els.volumeIcon.innerHTML = `<use href="#i-${ic}"/>`;
    els.volumeIcon.parentElement?.setAttribute("aria-label", state.muted ? "取消静音" : "静音");
  }

  /* 播放模式 */
  if (state.playMode !== lastPainted.mode) {
    lastPainted.mode = state.playMode;
    const meta = MODE_META[state.playMode];
    els.modeIcon.innerHTML = `<use href="#i-${meta.icon}"/>`;
    els.mode.dataset.mode = state.playMode;
    els.mode.dataset.tip = meta.label;
    els.mode.setAttribute("aria-label", meta.label);
  }

  /* 爱心 */
  const liked = state.currentId ? isLiked(state.currentId) : false;
  if (liked !== lastPainted.liked) {
    lastPainted.liked = liked;
    els.heart.setAttribute("aria-pressed", String(liked));
    els.heart.dataset.tip = liked ? "取消喜欢" : "加入我喜欢";
  }

  /* 播放列表数量 */
  if (state.queue.length !== lastPainted.queueLen) {
    lastPainted.queueLen = state.queue.length;
    const badge = $("#queue-count");
    if (badge) {
      badge.textContent =
        state.queue.length === 0 ? "" : state.queue.length > 99 ? "99+" : String(state.queue.length);
    }
    // 打开状态下队列变了要跟着更新
    if (state.queueOpen) renderQueuePanel();
  }

  /* 播放列表按钮的按下态 + 面板内容 */
  els.playlist?.setAttribute("aria-pressed", String(Boolean(state.queueOpen)));
  if (state.queueOpen) renderQueuePanel();

  /* 正在播放行的音柱动画由 tracks.js 的重绘负责，这里只做轻量同步 */
  const bodyRows = document.querySelectorAll(".track[aria-current='true']");
  bodyRows.forEach((row) => {
    if (state.playing) row.removeAttribute("data-playing");
    else row.setAttribute("data-playing", "false");
  });
}

/** 供播放界面显示「下一曲」提示 */
export function nextSongPreview() {
  const i = nextIndex(1);
  return i >= 0 ? state.songs.find((s) => s.id === state.queue[i]) || null : null;
}

export function modeLabel(mode = state.playMode) {
  return MODE_META[mode]?.label ?? "";
}

export { MODE_META, playlistById };
export const _icons = { icon, esc };
