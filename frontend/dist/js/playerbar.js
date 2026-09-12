/* ==========================================================================
   playerbar.js — 底部常驻播放控件
   ========================================================================== */

import { $, icon, toast } from "./dom.js";
import { createSlider } from "./slider.js";
import { applyVolume, seekAudio } from "./audio.js";
import {
  commit,
  currentSong,
  cyclePlayMode,
  isLiked,
  nextIndex,
  playNext,
  playPrev,
  seek,
  setVolume,
  state,
  toggleLike,
  togglePlay,
  toggleMute,
} from "./store.js";
import { esc, fmtTime } from "./utils.js";

const MODE_META = {
  sequence: { icon: "list-order", label: "顺序播放" },
  "loop-all": { icon: "repeat", label: "列表循环" },
  "loop-one": { icon: "repeat-one", label: "单曲循环" },
  shuffle: { icon: "shuffle", label: "随机播放" },
};

let progressSlider = null;
let volumeSlider = null;
let lastPainted = { id: null, pos: -1, dur: -1, playing: null, volume: -1, muted: null, mode: null, liked: null };

export function initPlayerBar({ onOpenPlayer, onToggleFullscreen }) {
  const els = {
    cover: $("#bar-cover"),
    coverImg: $("#bar-cover-img"),
    meta: $("#bar-meta"),
    title: $("#bar-title"),
    sub: $("#bar-sub"),
    heart: $("#bar-heart"),
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
    lyricsToggle: $("#btn-lyrics-toggle"),
    fullscreen: $("#btn-fullscreen"),
  };

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
      seek(ms);
      seekAudio(ms);
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
  els.cover.addEventListener("click", () => onOpenPlayer?.());
  els.meta.addEventListener("click", () => onOpenPlayer?.());
  els.fullscreen.addEventListener("click", () => onToggleFullscreen?.());
  els.lyricsToggle?.addEventListener("click", () => {
    state.config.showLyrics = !state.config.showLyrics;
    commit();
    toast(state.config.showLyrics ? "已显示歌词" : "已隐藏歌词", { duration: 1400 });
  });

  // 双击底栏封面 → 打开播放界面
  els.cover.addEventListener("dblclick", () => onOpenPlayer?.());
}

export function paintPlayerBar() {
  const song = currentSong();
  const els = {
    coverImg: $("#bar-cover-img"),
    title: $("#bar-title"),
    sub: $("#bar-sub"),
    heart: $("#bar-heart"),
    playIcon: $("#icon-play"),
    play: $("#btn-play"),
    current: $("#time-current"),
    total: $("#time-total"),
    progress: $("#progress"),
    mode: $("#btn-mode"),
    modeIcon: $("#icon-mode"),
    volume: $("#volume"),
    volumeIcon: $("#icon-volume"),
    lyricsToggle: $("#btn-lyrics-toggle"),
  };

  /* 曲目信息 */
  if (song && song.id !== lastPainted.id) {
    els.coverImg.src = song.cover;
    els.coverImg.alt = `${song.title} 封面`;
    els.title.textContent = song.title;
    els.sub.textContent = `${song.artist} · ${song.album}`;
    lastPainted.id = song.id;
  } else if (!song && lastPainted.id !== null) {
    els.coverImg.removeAttribute("src");
    els.title.textContent = "未在播放";
    els.sub.textContent = "选择一首歌曲开始";
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

  /* 歌词开关 */
  els.lyricsToggle?.setAttribute("aria-pressed", String(Boolean(state.config.showLyrics)));

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

export { MODE_META };
export const _icons = { icon, esc };
