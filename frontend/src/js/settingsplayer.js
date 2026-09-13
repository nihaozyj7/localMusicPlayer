/* ==========================================================================
   settingsplayer.js — 设置弹出层里的紧凑播放控件
   --------------------------------------------------------------------------
   为什么单独一个模块，而不是复用 playerbar.js：

   · 底栏那套是「唯一一份」的（进度条 / 音量滑杆都持有自己的 slider 实例、
     还带一堆 lastPainted 缓存），把同一份实例搬到两个地方会互相打架；
   · 这里需要的只是「操作播放」这件事，动作全部来自 store / audio，
     没有新的状态 —— 所以复制的是**绑定**，不是**状态**。

   两处共用同一个 state，因此这里点播放，底栏与详情页会立刻跟上。
   重绘由 main.js 的 tick 调用 paintSettingsPlayer() 驱动（与底栏同一节拍），
   本模块只在设置层打开时做实际工作，关着时几乎零开销。
   ========================================================================== */

import { $, bindCoverFallback, toast } from "./dom.js";
import { createSlider } from "./slider.js";
import { applyVolume, seekTo } from "./audio.js";
import {
  currentSong,
  cyclePlayMode,
  playNext,
  playPrev,
  setVolume,
  state,
  toggleMute,
  togglePlay,
} from "./store.js";
import { coverOf, fmtTime } from "./utils.js";

const MODE_META = {
  sequence: { icon: "list-order", label: "顺序播放" },
  "loop-all": { icon: "repeat", label: "列表循环" },
  "loop-one": { icon: "repeat-one", label: "单曲循环" },
  shuffle: { icon: "shuffle", label: "随机播放" },
};

let bound = false;
let progressSlider = null;
let volumeSlider = null;

const last = {
  id: null,
  pos: -1,
  dur: -1,
  playing: null,
  volume: -1,
  muted: null,
  mode: null,
};

function els() {
  return {
    cover: $("#sp-cover"),
    coverImg: $("#sp-cover-img"),
    meta: $("#sp-meta"),
    title: $("#sp-title"),
    sub: $("#sp-sub"),
    prev: $("#sp-prev"),
    play: $("#sp-play"),
    playIcon: $("#sp-icon-play"),
    next: $("#sp-next"),
    current: $("#sp-time-current"),
    total: $("#sp-time-total"),
    progress: $("#sp-progress"),
    mute: $("#sp-mute"),
    volumeIcon: $("#sp-icon-volume"),
    volume: $("#sp-volume"),
    mode: $("#sp-mode"),
    modeIcon: $("#sp-icon-mode"),
  };
}

/** 设置层打开时初始化一次（slider 实例挂在真实 DOM 上，重绘设置内容不会动它） */
export function initSettingsPlayer({ onOpenPlayer } = {}) {
  if (bound) return;
  const el = els();
  if (!el.progress) return;
  bound = true;

  bindCoverFallback(el.coverImg);

  progressSlider = createSlider(el.progress, {
    min: 0,
    max: 1000,
    step: 1,
    value: 0,
    format: (v) => fmtTime((v / 1000) * (state.duration || 0)),
    onChange: (v) => {
      if (!state.duration) return;
      state.position = (v / 1000) * state.duration;
      el.current.textContent = fmtTime(state.position);
    },
    onCommit: (v) => {
      if (!state.duration) return;
      seekTo((v / 1000) * state.duration);
    },
  });

  volumeSlider = createSlider(el.volume, {
    min: 0,
    max: 1,
    step: 0.01,
    value: state.volume,
    format: (v) => `${Math.round(v * 100)}`,
    onChange: (v) => {
      setVolume(v);
      applyVolume();
      paintVolumeIcon(v, state.muted);
    },
  });

  el.prev.addEventListener("click", () => playPrev());
  el.play.addEventListener("click", () => togglePlay());
  el.next.addEventListener("click", () => playNext(false));
  el.mute.addEventListener("click", () => {
    toggleMute();
    applyVolume();
  });
  el.mode.addEventListener("click", () => {
    cyclePlayMode();
    toast(MODE_META[state.playMode].label, { duration: 1400 });
  });
  // 需求：歌词不提供隐藏入口，所以这里没有歌词显隐按钮
  // （详情页那块歌词区由设置 → 歌词里的开关控制）
  el.cover.addEventListener("click", () => onOpenPlayer?.());
  el.meta.addEventListener("click", () => onOpenPlayer?.());

  paintSettingsPlayer({ force: true });
}

function paintVolumeIcon(value, muted) {
  const el = els();
  const effective = muted ? 0 : value;
  const ic = effective === 0 ? "volume-mute" : effective < 0.5 ? "volume-low" : "volume-high";
  if (el.volumeIcon) el.volumeIcon.innerHTML = `<use href="#i-${ic}"/>`;
  el.mute?.setAttribute("aria-label", muted ? "取消静音" : "静音");
}

/** 每个 tick 调用；设置层关着时直接返回 */
export function paintSettingsPlayer({ force = false } = {}) {
  const layer = document.getElementById("settings-layer");
  if (!bound || !layer || layer.hidden) return;
  const el = els();
  const song = currentSong();

  if (song && (force || song.id !== last.id)) {
    el.coverImg.src = coverOf(song);
    el.coverImg.alt = `${song.title} 封面`;
    el.title.textContent = song.title;
    el.sub.textContent = `${song.artist}${song.album ? ` · ${song.album}` : ""}`;
    last.id = song.id;
  } else if (!song && (force || last.id !== null)) {
    el.coverImg.removeAttribute("src");
    el.title.textContent = "未在播放";
    el.sub.textContent = "选择一首歌曲开始";
    last.id = null;
  }

  const pos = Math.round(state.position);
  const dur = Math.round(state.duration || 0);
  if (pos !== last.pos || force) {
    last.pos = pos;
    el.current.textContent = fmtTime(pos);
    if (dur > 0 && el.progress.dataset.dragging !== "true") {
      progressSlider?.set((pos / dur) * 1000, { silent: true });
    }
  }
  if (dur !== last.dur || force) {
    last.dur = dur;
    el.total.textContent = fmtTime(dur);
    progressSlider?.setDisabled(dur <= 0);
  }

  if (state.playing !== last.playing || force) {
    last.playing = state.playing;
    el.playIcon.innerHTML = `<use href="#i-${state.playing ? "pause" : "play"}"/>`;
    el.play.setAttribute("aria-label", state.playing ? "暂停" : "播放");
    el.play.dataset.tip = state.playing ? "暂停" : "播放";
  }

  if (state.volume !== last.volume || state.muted !== last.muted || force) {
    last.volume = state.volume;
    last.muted = state.muted;
    volumeSlider?.set(state.muted ? 0 : state.volume, { silent: true });
    paintVolumeIcon(state.volume, state.muted);
  }

  if (state.playMode !== last.mode || force) {
    last.mode = state.playMode;
    const meta = MODE_META[state.playMode] || MODE_META.sequence;
    el.modeIcon.innerHTML = `<use href="#i-${meta.icon}"/>`;
    el.mode.dataset.mode = state.playMode;
    el.mode.dataset.tip = meta.label;
    el.mode.setAttribute("aria-label", meta.label);
  }
}

/** 供设置层打开时调用：立刻画一次，不等下一个 tick（层打开后画面才可见） */
export function refreshSettingsPlayer() {
  paintSettingsPlayer({ force: true });
}
