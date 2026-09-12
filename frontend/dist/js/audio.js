/* ==========================================================================
   audio.js — 真实音频播放（对接 Go 的本地音频服务）
   --------------------------------------------------------------------------
   工作方式：
     · playSong / next / prev 时向 Media.URL 取播放地址（带 token 的本地 http 地址）；
     · 用隐藏的 <audio> 播放；
       - 原生可解码格式由 Go 侧 ServeContent 提供，支持 Range → 可以精确 seek；
       - ape/wma 等由 Go 侧调用 ffmpeg 转码为 WAV 流；
     · <audio> 的 loadedmetadata / timeupdate / ended 事件回写 store，
       因此进度条显示的是真实播放进度，而不是预览用的模拟时钟。
   浏览器预览模式下没有后端，playSong 会静默跳过，进度仍由 store 的模拟时钟驱动。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { commit, currentSong, notify, playNext, state } from "./store.js";
import { toast } from "./dom.js";

let el = null;
let loadedFor = null; // 已经设置过 src 的歌曲 id
let requestSeq = 0;

function audioEl() {
  if (el) return el;
  el = document.getElementById("audio-engine");
  if (!el) {
    el = document.createElement("audio");
    el.id = "audio-engine";
    el.preload = "auto";
    el.hidden = true;
    document.body.appendChild(el);
  }
  bindEvents(el);
  return el;
}

function bindEvents(node) {
  if (node.dataset.bound === "1") return;
  node.dataset.bound = "1";

  node.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(node.duration) && node.duration > 0) {
      state.duration = node.duration * 1000;
      notify();
      commit();
    }
  });

  node.addEventListener("timeupdate", () => {
    // 拖动进度条时不回写，避免和用户操作打架
    const bar = document.getElementById("progress");
    if (bar?.dataset.dragging === "true") return;
    state.position = node.currentTime * 1000;
    notify();
  });

  node.addEventListener("play", () => {
    state.playing = true;
    notify();
  });

  node.addEventListener("pause", () => {
    if (node.ended) return;
    state.playing = false;
    notify();
  });

  node.addEventListener("ended", () => {
    if (state.playMode === "loop-one") {
      node.currentTime = 0;
      node.play().catch(() => {});
      return;
    }
    playNext(true);
  });

  node.addEventListener("error", () => {
    const song = currentSong();
    if (!song) return;
    const code = node.error?.code;
    const reason =
      code === 4
        ? "该格式无法播放（可能需要安装 ffmpeg 转码）"
        : "音频加载失败";
    toast(`${reason}：${song.title}`, { tone: "error", duration: 4000 });
  });
}

/** 播放状态变化时被 main 的 tick 调用 */
export async function syncAudio() {
  if (!isWails()) return;
  const node = audioEl();
  const song = currentSong();

  // 没有当前曲目：停止
  if (!song) {
    if (loadedFor !== null) {
      node.pause();
      node.removeAttribute("src");
      node.load();
      loadedFor = null;
    }
    return;
  }

  // 切歌：取新的播放地址
  if (loadedFor !== song.id) {
    loadedFor = song.id;
    const seq = ++requestSeq;
    let url = null;
    try {
      url = await backend.mediaUrl(song.id);
    } catch (err) {
      toast(`无法播放：${err?.message ?? "取播放地址失败"}`, { tone: "error", duration: 4000 });
      return;
    }
    if (seq !== requestSeq) return; // 期间又切歌了，丢弃这次结果
    if (!url) return;

    node.src = url;
    node.currentTime = 0;
    node.load();
  }

  // 同步播放/暂停
  if (state.playing && node.paused) {
    try {
      await node.play();
    } catch {
      /* 用户未交互等情况下浏览器可能拒绝，忽略 */
    }
  } else if (!state.playing && !node.paused) {
    node.pause();
  }
}

/** 进度条拖动结束时调用：把真实播放位置跳过去 */
export function seekAudio(ms) {
  if (!isWails()) return;
  const node = audioEl();
  if (!node.src) return;
  const target = Math.max(0, Math.min(ms, (state.duration || 0)) / 1000);
  try {
    node.currentTime = target;
  } catch {
    /* 转码流不支持精确 seek 时忽略 */
  }
}

/** 音量/静音变化时调用 */
export function applyVolume() {
  if (!isWails()) return;
  const node = audioEl();
  node.volume = state.muted ? 0 : state.volume;
}

export function stopAudio() {
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
  loadedFor = null;
}
