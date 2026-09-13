/* ==========================================================================
   playerbar.js — 底部常驻播放控件
   --------------------------------------------------------------------------
   结构（见 index.html）：
     上面一整行：进度条（已播时间 ── 轨道 ── 总时长）
     下面一行：  【封面】曲目名·歌手-专辑  喜欢  添加到歌单
                 上一首 播放/暂停 下一首
                 音量  播放顺序  桌面歌词  播放列表  全屏
   ========================================================================== */

import Sortable from "sortablejs";
import { $, bindCoverFallback, icon, openMenu, toast } from "./dom.js";
import { createSlider } from "./slider.js";
import { applyVolume, seekTo } from "./audio.js";
import { addSongsTo } from "./playlists.js";
import { locateCurrentQueueItem } from "./tracks.js";
import { animationMs, setRuntimeToken } from "./runtime-tokens.js";
import { applyGlassAlpha, resolvedGlassAlpha, resolvedGlassBlur } from "./theme.js";
import { applyDesktopMode, DESKTOP_MODE } from "./desktop-mode.js";
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
  reorderQueue,
  setVolume,
  songById,
  state,
  toggleLike,
  togglePlay,
  toggleMute,
} from "./store.js";
import { coverOf, esc, fmtTime } from "./utils.js";

const MODE_META = {
  // 顺序播放 = 列表循环（按列表顺序播完回到开头）
  sequence: { icon: "repeat", label: "列表循环" },
  "loop-all": { icon: "repeat", label: "列表循环" }, // 旧配置兼容
  "loop-one": { icon: "repeat-one", label: "单曲循环" },
  shuffle: { icon: "shuffle", label: "随机播放" },
};

let progressSlider = null;
let volumeSlider = null;
const lastPainted = {
  id: null,
  // cover 记录上次画进底栏的封面地址：同一首歌换了封面（手动 / 自动匹配）
  // 也必须重画，否则底栏会一直停在默认封面 —— 这就是「匹配后底栏元数据不更新」。
  cover: "",
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
    desktopWallpaper: $("#btn-desktop-wallpaper"),
    playlist: $("#btn-playlist"),
    sleep: $("#btn-sleep"),
    options: $("#btn-options"),
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
  // 桌面歌词 / 桌面背景歌词：一组单选按钮，切换的是两个真实窗口
  // （真正的开/关与互斥交给 desktop-mode.js，这里只负责转发点击）
  els.desktopLyrics?.addEventListener("click", () => toggleDesktopLyrics());
  els.desktopWallpaper?.addEventListener("click", () => toggleDesktopWallpaper());
  els.sleep?.addEventListener("click", () => toggleSleepPanel());
  els.options?.addEventListener("click", () => {
    if (state.queueOpen) toggleQueuePanel(false);
    toggleOptionsPanel();
  });

  bindQueuePanel();
  renderQueuePanel();
  initOptionsPanel();
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
let panelCloseTimer = null;
let panelBound = false;
let panelKey = "";
/** SortableJS 实例（#queue-panel-body 是常驻节点，只创建一次） */
let queuePanelSortable = null;
/** 刚刚拖拽结束的时间戳：抑制紧随其后的 click，避免误触「播放这一首」 */
let lastQueueDragEndAt = 0;

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
      }, animationMs() + 40);
    }
  }

  // 内容只在「队列 / 当前曲目 / 播放状态」变化时重建，避免每次进度更新都重排
  const key = `${state.queue.join(",")}|${state.currentId ?? ""}|${state.playing ? 1 : 0}`;
  if (key === panelKey) return;
  panelKey = key;

  // 用 songById：在线试听曲目不在 state.songs 里，只在 songs 里查会让这一行
  // 消失、计数少 1，并让 DOM 下标与 state.queue 下标错位（拖拽会移错那首）。
  const songs = state.queue.map((id) => songById(id)).filter(Boolean);
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
      <div class="queue-item" data-queue-id="${esc(song.id)}" aria-current="${current}" role="button" tabindex="0" draggable="true">
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
  // 「定位到当前播放」：面板里队列可能很长（几百首），换歌之后一样找不到
  // 正在播的那一条。与曲库 / 歌单工具条上的同名按钮是同一个能力。
  $("#queue-locate")?.addEventListener("click", () => locateCurrentQueueItem());
  $("#queue-clear")?.addEventListener("click", () => {
    clearQueue();
    toast("播放列表已清空");
  });

  panel.addEventListener("click", (e) => {
    // 拖拽结束会跟着冒泡一个 click：不拦的话会误判成「点选这首歌」而切歌
    if (Date.now() - lastQueueDragEndAt < 260) return;
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

  // 播放列表（队列）拖拽排序：交给 SortableJS（需求：不要自己实现拖拽）。
  // 整行可拖；onEnd 之后再改数据，reorderQueue() 会把播放模式切回「列表循环」。
  const body = $("#queue-panel-body");
  if (body && !queuePanelSortable) {
    queuePanelSortable = Sortable.create(body, {
      draggable: ".queue-item",
      animation: 150,
      ghostClass: "is-dragging",
      onEnd(evt) {
        lastQueueDragEndAt = Date.now();
        const from = evt.oldIndex;
        const to = evt.newIndex;
        if (from == null || to == null || from === to) return;
        reorderQueue(from, to);
        toast("已调整播放顺序 · 播放模式已切回列表循环", { duration: 1600 });
      },
    });
  }
}

/* --------------------------------------------------------------------------
   桌面歌词 / 桌面背景歌词（一组单选按钮）
   -------------------------------------------------------------------------- */

export function toggleDesktopLyrics() {
  toggleDesktopModeWithToast(
    state.config.showDesktopLyrics ? DESKTOP_MODE.off : DESKTOP_MODE.lyrics,
    { on: "已开启桌面歌词", off: "已关闭桌面歌词" }
  );
}

export function toggleDesktopWallpaper() {
  toggleDesktopModeWithToast(
    state.config.showDesktopWallpaper ? DESKTOP_MODE.off : DESKTOP_MODE.wallpaper,
    { on: "已开启桌面背景歌词", off: "已关闭桌面背景歌词" }
  );
}

/**
 * 切模式并提示结果。
 *
 * 为什么要等结果再提示、而不是点了就先说「已开启」：这两个模式都要真实创建
 * 窗口，而桌面背景歌词还依赖系统的桌面窗口结构 —— 它确实会失败。
 * 先报成功再让用户看到桌面上什么都没有，比不提示更糟。
 */
async function toggleDesktopModeWithToast(mode, { on, off }) {
  const res = await applyDesktopMode(mode);
  commit();
  if (res.ok !== false) {
    toast(mode === DESKTOP_MODE.off ? off : on, { duration: 1400 });
    return res;
  }
  toast(`打不开：${res.reason || res.error || "未知原因"}`, { tone: "warning", duration: 3200 });
  if (res.restored) toast("已保留原来的桌面歌词设置", { duration: 1800 });
  return res;
}

/** 剩余时长文案：1 小时 05 分 / 05:20 */
function fmtRemain(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} 小时 ${String(m).padStart(2, "0")} 分`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 定时停止面板的滑条实例（拖动同步倒计时要用它） */
let sleepSlider = null;

/**
 * 定时停止面板（需求：把原来的菜单改成一个面板，上方是一条可拖拽的
 * 0~300 分钟滑条）。
 *
 * 为什么不再用菜单：菜单只能选几档预设，用户想要「47 分钟后停」就不行了；
 * 而滑条天然表达「0~300 连续可调」，0 = 关闭也和「拖到最左就是关」一致。
 * 拖动过程中只改文案不落地：否则每像素都会重起一次倒计时。
 */
function openSleepPanel() {
  const panel = $("#sleep-panel");
  const body = $("#sleep-panel-body");
  if (!panel || !body) return;
  initSleepPanel(body);
  panel.hidden = false;
  requestAnimationFrame(() => panel.setAttribute("data-state", "opened"));
  $("#btn-sleep")?.setAttribute("aria-pressed", "true");
  syncSleepPanel();
}

function closeSleepPanel() {
  const panel = $("#sleep-panel");
  if (!panel) return;
  panel.setAttribute("data-state", "closed");
  setTimeout(() => {
    if (panel.getAttribute("data-state") === "closed") panel.hidden = true;
  }, animationMs() + 40);
  $("#btn-sleep")?.setAttribute("aria-pressed", String(Boolean(state.sleepTimer)));
}

function toggleSleepPanel() {
  const panel = $("#sleep-panel");
  if (!panel) return;
  if (panel.hidden) openSleepPanel();
  else closeSleepPanel();
}

let sleepPanelBound = false;

function initSleepPanel(body) {
  if (sleepPanelBound) return;
  sleepPanelBound = true;

  body.innerHTML = `
    <div class="sleep-panel__bar">
      <div class="sleep-panel__readout">
        <span class="sleep-panel__value" id="sleep-value">未开启</span>
        <span class="sleep-panel__sub" id="sleep-sub">拖动下面的条设置分钟数</span>
      </div>
      <div class="slider sleep-panel__slider" id="sleep-slider" role="slider" tabindex="0"
        aria-label="定时停止分钟数" aria-valuemin="0" aria-valuemax="300" aria-valuenow="0">
        <div class="slider__rail"><div class="slider__fill"></div></div>
        <div class="slider__thumb"></div>
        <div class="slider__bubble">0</div>
      </div>
      <div class="sleep-panel__scale"><span>0</span><span>150</span><span>300 分钟</span></div>
    </div>
    <div class="sleep-panel__option">
      <div class="sleep-panel__option-main">
        <span class="sleep-panel__option-label">歌曲播放完成后停止</span>
        <span class="sleep-panel__option-sub">倒计时结束后不立刻停，等这首播完再停</span>
      </div>
      <button class="switch" type="button" role="switch" data-sleep-act="after-song"
        aria-checked="false" aria-label="歌曲播放完成后停止"></button>
    </div>
    <div class="sleep-panel__row">
      <button class="btn btn--sm" type="button" data-sleep-act="off">
        <svg><use href="#i-close" /></svg><span>取消定时</span>
      </button>
    </div>
    <div class="sleep-panel__hint">
      「歌曲播放完成后停止」打开时，倒计时到点如果这首还没播完，会等它播完再停
      （不会在副歌中间掐掉）。拖到 0 分钟即取消定时；设置从松手那一刻开始倒计时。
    </div>`;

  sleepSlider = createSlider($("#sleep-slider"), {
    min: 0,
    max: 300,
    step: 1,
    value: 0,
    format: (v) => `${Math.round(v)} 分钟`,
    onChange: (v) => {
      // 拖动中只更新读数（不 commit）：否则每动一像素都会重起倒计时
      const valueEl = $("#sleep-value");
      if (valueEl) valueEl.textContent = Math.round(v) <= 0 ? "未开启" : `${Math.round(v)} 分钟`;
      const subEl = $("#sleep-sub");
      if (subEl) subEl.textContent = Math.round(v) <= 0 ? "松手即关闭定时" : "松手开始倒计时";
    },
    onCommit: (v) => applySleepMinutes(v),
  });

  body.addEventListener("click", (e) => {
    const act = e.target.closest("[data-sleep-act]")?.dataset.sleepAct;
    if (!act) return;
    if (act === "off") {
      clearSleepTimer("已取消定时停止");
      return;
    }
    if (act === "after-song") {
      // 「歌曲播放完成后停止」是倒计时的一个修饰项，不是独立的定时模式：
      // 打开后倒计时到点不会立刻停，而是等当前这首播完（见 checkSleepTimer）。
      const next = !state.config.sleepAfterSong;
      state.config.sleepAfterSong = next;
      commit();
      syncSleepPanel();
      toast(
        next ? "已开启：倒计时结束后等当前歌曲播完再停" : "已关闭：倒计时结束后立即停止",
        { duration: 2200 }
      );
    }
  });

  $("#sleep-close")?.addEventListener("click", () => closeSleepPanel());

  // 点面板外 / Esc 关闭（与选项面板一致）
  document.addEventListener("pointerdown", (e) => {
    const panel = $("#sleep-panel");
    if (!panel || panel.hidden) return;
    if (panel.contains(e.target) || e.target.closest?.("#btn-sleep")) return;
    closeSleepPanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const panel = $("#sleep-panel");
    if (panel && !panel.hidden) closeSleepPanel();
  });
}

/** 把滑条读数落地成真正的定时器 */
function applySleepMinutes(minutes) {
  const n = Math.round(Number(minutes) || 0);
  if (n <= 0) {
    clearSleepTimer("已取消定时停止");
    return;
  }
  state.sleepTimer = { type: "duration", until: Date.now() + n * 60000, minutes: n };
  commit();
  syncSleepPanel();
  toast(`${n} 分钟后停止播放`, { duration: 1800 });
}

function clearSleepTimer(message) {
  state.sleepTimer = null;
  commit();
  syncSleepPanel();
  if (message) toast(message, { duration: 1400 });
}

/** 把面板上的读数与滑条同步到当前定时器（倒计时进行中时也要跟着走） */
function syncSleepPanel() {
  const panel = $("#sleep-panel");
  if (!panel || panel.hidden) return;
  const timer = state.sleepTimer;
  const valueEl = $("#sleep-value");
  const subEl = $("#sleep-sub");
  syncSleepAfterToggle();
  if (timer?.type === "after-song") {
    // 倒计时已经到点，正在等这首播完
    if (valueEl) valueEl.textContent = "等待本首播完";
    if (subEl) subEl.textContent = "倒计时已结束，这首播完就暂停";
    sleepSlider?.set(0, { silent: true });
    return;
  }
  if (timer?.type === "duration") {
    const remainMs = Math.max(0, timer.until - Date.now());
    if (valueEl) valueEl.textContent = `剩余 ${fmtRemain(remainMs)}`;
    if (subEl) subEl.textContent = `共 ${timer.minutes} 分钟`;
    // 正在拖动时不抢滑块位置（否则手指和倒计时会互相打架）
    if (sleepSlider && $("#sleep-slider")?.dataset.dragging !== "true") {
      sleepSlider.set(Math.max(0, Math.round(remainMs / 60000)), { silent: true });
    }
    return;
  }
  if (valueEl) valueEl.textContent = "未开启";
  if (subEl) subEl.textContent = "拖动上面的条设置分钟数";
}

/** 「歌曲播放完成后停止」开关的状态跟随配置 */
function syncSleepAfterToggle() {
  const btn = document.querySelector("[data-sleep-act='after-song']");
  if (btn) btn.setAttribute("aria-checked", String(state.config.sleepAfterSong === true));
}

/**
 * 定时停止到点。
 *
 * 「歌曲播放完成后停止」（延长到歌曲播放结束）打开时**不立刻暂停**，而是切换成
 * after-song 状态：等当前这首自然播完，由 store/audio 的 ended 逻辑暂停。
 * 不开就是老行为：到点立即暂停。
 */
function checkSleepTimer() {
  const timer = state.sleepTimer;
  if (timer?.type !== "duration" || Date.now() < timer.until) return;

  if (state.config.sleepAfterSong === true && state.playing && state.currentId) {
    // 交给「本首播完就停」那条既有通路处理（store.js / audio.js 都认这个 type）
    state.sleepTimer = { type: "after-song" };
    commit();
    syncSleepPanel();
    toast("定时到点：等这首播完就停", { duration: 2400 });
    return;
  }

  state.sleepTimer = null;
  if (state.playing) togglePlay();
  else commit();
  syncSleepPanel();
  toast("已按定时停止播放", { duration: 1800 });
}

function toggleOptionsPanel() {
  const panel = $("#options-panel");
  if (!panel) return;
  const open = panel.hidden;
  if (open) {
    panel.hidden = false;
    requestAnimationFrame(() => panel.setAttribute("data-state", "opened"));
  } else {
    panel.setAttribute("data-state", "closed");
    setTimeout(() => {
      if (panel.getAttribute("data-state") === "closed") panel.hidden = true;
    }, animationMs() + 40);
  }
  $("#btn-options")?.setAttribute("aria-pressed", String(open));
}

let optionsPanelBound = false;
function initOptionsPanel() {
  const body = $("#options-panel-body");
  if (!body || optionsPanelBound) return;
  optionsPanelBound = true;
  body.dataset.bound = "1";

  const sliderHtml = (id) => `
    <div class="slider" id="${id}" role="slider" tabindex="0" aria-label="调节">
      <div class="slider__rail"><div class="slider__fill"></div></div>
      <div class="slider__thumb"></div>
      <div class="slider__bubble"></div>
    </div>`;

  body.innerHTML = `
    <div class="option-row">
      <span class="option-row__label">歌词字号</span>
      <div class="rangeslider">
        ${sliderHtml("opt-lyric-size")}
        <span class="rangeslider__value" id="opt-lyric-size-val">${Math.round(state.config.lyricsFontSize)}px</span>
      </div>
    </div>
    <div class="option-row">
      <span class="option-row__label">桌面歌词</span>
      <button class="switch" id="opt-desktop-lyrics" type="button" role="switch" aria-checked="${state.config.showDesktopLyrics}"></button>
    </div>
    <div class="option-row">
      <span class="option-row__label">桌面背景歌词</span>
      <button class="switch" id="opt-desktop-wallpaper" type="button" role="switch" aria-checked="${state.config.showDesktopWallpaper}"></button>
    </div>
    <div class="option-row">
      <span class="option-row__label">背景不透明度</span>
      <div class="rangeslider">
        ${sliderHtml("opt-alpha")}
        <span class="rangeslider__value" id="opt-alpha-val">${Math.round(state.config.glassAlpha)}%</span>
      </div>
    </div>
    <div class="option-row">
      <span class="option-row__label">模糊程度</span>
      <div class="rangeslider">
        ${sliderHtml("opt-blur")}
        <span class="rangeslider__value" id="opt-blur-val">${state.config.glassBlurCustom ? Math.round(state.config.glassBlur) : Math.round(resolvedGlassBlur())}px</span>
      </div>
    </div>`;

  $("#options-close")?.addEventListener("click", () => toggleOptionsPanel());
  $("#opt-desktop-lyrics")?.addEventListener("click", () => toggleDesktopLyrics());
  $("#opt-desktop-wallpaper")?.addEventListener("click", () => toggleDesktopWallpaper());

  // 点击面板外 / 按 Esc 关闭选项面板
  document.addEventListener("pointerdown", (e) => {
    const panel = $("#options-panel");
    if (!panel || panel.hidden) return;
    if (panel.contains(e.target) || e.target.closest?.("#btn-options")) return;
    toggleOptionsPanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const panel = $("#options-panel");
    if (panel && !panel.hidden) toggleOptionsPanel();
  });

  createSlider($("#opt-lyric-size"), {
    min: 12,
    max: 26,
    step: 1,
    value: state.config.lyricsFontSize,
    format: (v) => `${Math.round(v)}px`,
    onChange: (v) => {
      state.config.lyricsFontSize = v;
      const label = $("#opt-lyric-size-val");
      if (label) label.textContent = `${Math.round(v)}px`;
      setRuntimeToken("--lyric-size", `${v}px`);
    },
    onCommit: () => commit(),
  });

  createSlider($("#opt-alpha"), {
    min: 20,
    max: 95,
    step: 1,
    value: state.config.glassAlphaCustom ? state.config.glassAlpha : resolvedGlassAlpha(),
    format: (v) => `${Math.round(v)}%`,
    onChange: (v) => {
      state.config.glassAlpha = v;
      state.config.glassAlphaCustom = true;
      const label = $("#opt-alpha-val");
      if (label) label.textContent = `${Math.round(v)}%`;
      applyGlassAlpha(v);
    },
    onCommit: () => commit(),
  });

  createSlider($("#opt-blur"), {
    min: 0,
    max: 48,
    step: 1,
    value: state.config.glassBlurCustom ? state.config.glassBlur : resolvedGlassBlur(),
    format: (v) => `${Math.round(v)}px`,
    onChange: (v) => {
      state.config.glassBlur = v;
      state.config.glassBlurCustom = true;
      const label = $("#opt-blur-val");
      if (label) label.textContent = `${Math.round(v)}px`;
      setRuntimeToken("--glass-blur", `${v}px`);
    },
    onCommit: () => commit(),
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
    desktopWallpaper: $("#btn-desktop-wallpaper"),
    playlist: $("#btn-playlist"),
  };

  /* 曲目信息 */
  const coverSrc = song ? coverOf(song) : "";
  if (song && (song.id !== lastPainted.id || coverSrc !== lastPainted.cover)) {
    if (coverSrc !== lastPainted.cover) els.coverImg.src = coverSrc;
    els.coverImg.alt = `${song.title} 封面`;
    els.title.textContent = song.title;
    els.sub.textContent = `${song.artist} · ${song.album}`;
    els.add.disabled = false;
    lastPainted.id = song.id;
    lastPainted.cover = coverSrc;
  } else if (!song && lastPainted.id !== null) {
    els.coverImg.removeAttribute("src");
    els.title.textContent = "未在播放";
    els.sub.textContent = "选择一首歌曲开始";
    els.add.disabled = true;
    lastPainted.id = null;
    lastPainted.cover = "";
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

  /* 桌面歌词 / 桌面背景歌词（两个独立开关，互斥由 desktop-mode.js 保证）的按下态。
     每帧重写是有意的：后端有可能开窗失败并把配置回滚，
     这里跟着配置走，按钮就不会停在「已开启」上骗人。 */
  els.desktopLyrics?.setAttribute("aria-pressed", String(Boolean(state.config.showDesktopLyrics)));
  els.desktopWallpaper?.setAttribute("aria-pressed", String(Boolean(state.config.showDesktopWallpaper)));
  // 到点就停：放在每帧的轻量同步里，倒计时结束后立刻暂停
  checkSleepTimer();
  const sleepBtn = $("#btn-sleep");
  if (sleepBtn) {
    const timer = state.sleepTimer;
    sleepBtn.setAttribute("aria-pressed", String(Boolean(timer)));
    const tip =
      timer?.type === "duration"
        ? `定时停止 · 剩余 ${fmtRemain(timer.until - Date.now())}`
        : timer?.type === "after-song"
          ? "定时停止 · 播完当前歌曲"
          : "定时停止";
    if (sleepBtn.dataset.tip !== tip) sleepBtn.dataset.tip = tip;
    if (timer?.type === "duration") {
      const badge = $("#sleep-count");
      if (badge) {
        badge.hidden = false;
        badge.textContent = String(Math.max(1, Math.ceil((timer.until - Date.now()) / 60000)));
      }
    } else {
      const badge = $("#sleep-count");
      if (badge) badge.hidden = true;
    }
    // 面板开着时读数/滑条也要跟着秒级刷新（剩余 12:34 这种）
    if (!$("#sleep-panel")?.hidden) syncSleepPanel();
  }

  /* 正在播放行的音柱动画（data-playing）由 main.js#paintTrackSelection 统一维护。
     这里以前每帧做一次全文属性查询 document.querySelectorAll(".track[aria-current='true']")，
     而它要改的东西 paintTrackSelection 已经改过了（两者语义等价：只有
     data-playing="false" 会暂停动画），所以整段删掉。 */
}

/** 供播放界面显示「下一曲」提示 */
export function nextSongPreview() {
  const i = nextIndex(1);
  return i >= 0 ? songById(state.queue[i]) : null;
}

export function modeLabel(mode = state.playMode) {
  return MODE_META[mode]?.label ?? "";
}

export { MODE_META, playlistById };
export const _icons = { icon, esc };
