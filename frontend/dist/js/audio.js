/* ==========================================================================
   audio.js — 真实音频播放（对接 Go 的本地音频服务）
   --------------------------------------------------------------------------
   播放链路：
     Media.URL(songId) → 带 token 的本地 http 地址 → <audio>
       → MediaElementSource → GainNode(响度补偿) → AudioContext.destination

   两个要点：
   1. CORS：打包后前端在 http://wails.localhost，音频在 http://127.0.0.1:port，
      属于跨源。若不加 crossorigin="anonymous" 且服务端不给 CORS 头，
      <audio> 能出声，但 Web Audio 会读到纯静音（实测 peakDeviation=0），
      响度均衡就完全失效。Go 侧已补齐 CORS 头，这里必须配套设置 crossorigin。
   2. 增益：响度补偿用静态线性增益（Go 侧 loudnorm 测出的 LUFS 差值），
      经 GainNode 实时套用，切歌零延迟；用户音量也从这条链路走，
      避免出现「元素 volume × GainNode」两处相乘导致音量阶跃不一致。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { commit, currentSong, notify, playNext, state } from "./store.js";
import { toast } from "./dom.js";

let el = null;
let loadedFor = null; // 已经设置过 src 的歌曲 id
let requestSeq = 0;
let pendingSeek = null; // 切歌后待执行的跳转位置（毫秒）

/* --------------------------------------------------------------------------
   Web Audio 图
   -------------------------------------------------------------------------- */
let ctx = null;
let gainNode = null;
let sourceNode = null;
let graphBroken = false; // 跨源等原因导致无法建图时退回元素音量

/** 建立（或复用）Web Audio 链路 */
function ensureGraph(node) {
  if (graphBroken) return false;
  if (ctx && gainNode) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    graphBroken = true;
    return false;
  }
  try {
    ctx = new AC();
    gainNode = ctx.createGain();
    gainNode.gain.value = 1;
    sourceNode = ctx.createMediaElementSource(node);

    // 链路：source → 增益 → 输出。增益里同时含用户音量与响度补偿
    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);
    return true;
  } catch (err) {
    console.warn("[audio] Web Audio 链路建立失败，退回元素音量", err);
    graphBroken = true;
    return false;
  }
}

/** 当前应套用的线性增益（用户音量 × 响度补偿） */
function targetGain() {
  const mode = state.config.loudnessMode || "off";
  let gainDB = 0;
  if (mode !== "off" && state.currentId) {
    gainDB = state.loudnessGains?.[state.currentId] ?? 0;
  }
  const linear = 10 ** (gainDB / 20);
  const volume = state.muted ? 0 : state.volume;
  return volume * linear;
}

/** 把音量/补偿写进音频链路 */
export function applyVolume() {
  const node = el;
  const value = targetGain();
  if (ctx && gainNode && !graphBroken) {
    // 用短斜坡避免拖动音量时出现爆音
    const now = ctx.currentTime;
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(value, now, 0.015);
    } catch {
      gainNode.gain.value = value;
    }
    // 元素音量固定为 1，全部交给 GainNode
    if (node) node.volume = 1;
    return;
  }
  if (node) node.volume = Math.max(0, Math.min(1, value));
}

/** 歌曲切换后重新套用补偿增益 */
export function applyGainForSong() {
  applyVolume();
}

/* --------------------------------------------------------------------------
   <audio> 元素
   -------------------------------------------------------------------------- */

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
  // 跨源媒体：必须显式声明，否则 Web Audio 拿不到可用样本
  el.crossOrigin = "anonymous";
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
    if (pendingSeek != null) {
      const target = pendingSeek;
      pendingSeek = null;
      try {
        node.currentTime = Math.max(0, Math.min(target, (state.duration || 0)) / 1000);
      } catch {
        /* 转码流不支持精确定位时忽略 */
      }
    }
  });

  node.addEventListener("timeupdate", () => {
    const bar = document.getElementById("progress");
    if (bar?.dataset.dragging === "true") return;
    state.position = node.currentTime * 1000;
    notify();
  });

  node.addEventListener("play", () => {
    state.playing = true;
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
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
        ? "格式无法播放（解码失败）"
        : code === 3
          ? "音频数据损坏"
          : code === 2
            ? "网络中断"
            : "音频加载失败";
    toast(`${reason}：${song.title}`, { tone: "error", duration: 4000 });
  });
}

/* --------------------------------------------------------------------------
   播放同步
   -------------------------------------------------------------------------- */

/** 播放状态变化时被 main 的 tick 调用 */
export async function syncAudio() {
  if (!isWails()) return;
  const node = audioEl();
  const song = currentSong();

  if (!song) {
    if (loadedFor !== null) {
      node.pause();
      node.removeAttribute("src");
      node.load();
      loadedFor = null;
    }
    return;
  }

  if (loadedFor !== song.id) {
    loadedFor = song.id;
    const seq = ++requestSeq;
    let url = null;
    try {
      url = await backend.mediaUrl(song.id);
    } catch (err) {
      toast(`无法播放：${err?.message ?? "取播放地址失败"}`, { tone: "error", duration: 5000 });
      return;
    }
    if (seq !== requestSeq) return; // 期间又切歌了
    if (!url) {
      toast("无法播放：后端没有返回地址", { tone: "error", duration: 5000 });
      return;
    }

    pendingSeek = 0;
    node.src = url;
    node.load();

    // 建立音频图（失败也不影响出声，只是没有响度均衡）
    ensureGraph(node);
    applyVolume();

    // 顺带把这首歌的响度补偿准备好（后续切回来就零延迟）
    requestLoudness(song.id);
  }

  if (state.playing && node.paused) {
    if (ctx?.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    try {
      await node.play();
    } catch (err) {
      // 这是「点了播放没反应」最常见的原因，必须让用户看见
      toast(`播放失败：${err?.message ?? err}`, { tone: "error", duration: 5000 });
    }
  } else if (!state.playing && !node.paused) {
    node.pause();
  }
}

/** 正在进行的按需测量：同一首歌被反复触发时合并成一次 */
const pendingMeasure = new Map();

/**
 * 按需获取某首歌的响度补偿 —— 这是常规路径。
 *
 * 不预先扫描全库：用户播到哪首就算哪首。若缓存命中（后端已经算过且补偿标准
 * 没变）就直接套用，零延迟；否则后台算一次，算完立刻作用到当前播放。
 * 测量很慢（要完整解码一遍），所以绝不能让播放等它 —— 先按原音量放，
 * 算好后再平滑过渡。
 */
export async function requestLoudness(songId) {
  const mode = state.config.loudnessMode || "off";
  if (mode === "off" || !isWails() || !songId) return;
  if (state.loudnessGains?.[songId] !== undefined) return;
  // 同一首歌可能被反复触发（切歌来回、界面重绘），做一个去重
  if (pendingMeasure.has(songId)) return pendingMeasure.get(songId);

  const job = (async () => {
    try {
      const target = state.config.loudnessTarget ?? -16;

      // 1) 先查缓存：这是「播放时零延迟」的关键
      const res = await backend.loudnessLookup(songId, target);
      if (res?.measured) {
        setGain(songId, res.gainDB);
        return;
      }

      // 2) 没算过（或补偿标准变了导致缓存失效）→ 后台按需测量
      if (mode === "album") return; // 专辑模式要整张一起算，交给 refreshLoudnessGains
      const m = await backend.loudnessMeasure(songId, target);
      if (m?.measured) {
        setGain(songId, m.gainDB ?? computeGain(m, target));
      }
    } catch (err) {
      console.warn("[audio] 响度补偿获取失败", err);
    } finally {
      pendingMeasure.delete(songId);
    }
  })();

  pendingMeasure.set(songId, job);
  return job;
}

/** 与 Go 侧 GainDB 保持同一算法，避免两端算出的增益不一致 */
export function computeGain(item, targetLUFS) {
  if (!item?.integrated) return 0;
  let gain = targetLUFS - item.integrated;
  if (item.truePeak) {
    const maxAllowed = -1.0 - item.truePeak;
    if (gain > maxAllowed) gain = maxAllowed;
  }
  if (gain > 24) gain = 24;
  if (gain < -24) gain = -24;
  return Math.round(gain * 100) / 100;
}

function setGain(songId, gainDB) {
  if (!state.loudnessGains) state.loudnessGains = {};
  state.loudnessGains[songId] = gainDB;
  if (songId === state.currentId) applyVolume();
  notify();
}

/** 批量补偿（后端返回 songId → dB） */
export function applyGainMap(map) {
  if (!map) return;
  state.loudnessGains = { ...(state.loudnessGains || {}), ...map };
  applyVolume();
  notify();
}

/**
 * 补偿标准（目标响度）变了 —— 之前算好的补偿全部作废。
 *
 * 这是用户明确要求的行为：改了标准，缓存就得失效并按新标准重算。
 * 后端按「文件 + 算法版本 + 目标响度」判有效性，所以这里先让后端清掉
 * 不匹配的记录，再清空前端的增益表，之后播放时会自动按新标准按需测量。
 */
export async function invalidateLoudnessForTarget() {
  const target = state.config.loudnessTarget ?? -16;
  state.loudnessGains = {};
  applyGainForSong();
  notify();
  if (!isWails()) return;
  try {
    await backend.loudnessInvalidateTarget(target);
  } catch (err) {
    console.warn("[loudness] 失效旧补偿失败", err);
  }
}

/**
 * 按当前模式重新拉取补偿增益表。
 * 放在 audio.js 而不是 main.js：main → shell → settings 已有依赖链，
 * settings 反过来引 main 会形成循环导入。
 */
export async function refreshLoudnessGains() {
  if (!isWails()) return;
  const mode = state.config.loudnessMode || "off";
  if (mode === "off") {
    state.loudnessGains = {};
    applyGainForSong();
    return;
  }
  const target = state.config.loudnessTarget ?? -16;
  try {
    const map =
      mode === "album"
        ? await backend.loudnessAlbumGains(target)
        : await backend.loudnessGainMap(target);
    // 后端返回的是当前标准下有效的补偿；直接替换（不要 merge，
    // 否则换标准后旧的补偿会残留下来）
    state.loudnessGains = map || {};
    applyGainForSong();
    notify();

    // 关键：上面只拿到「已经算过」的补偿。正在播放的这首歌可能还没测过，
    // 此时必须按需补测一次 —— 否则用户在播放中途打开逐曲均衡，
    // 当前这首歌会一直按原音量放，要等切歌才生效。
    if (mode === "track" && state.currentId) {
      requestLoudness(state.currentId);
    }
  } catch (err) {
    console.warn("[loudness] 拉取补偿增益失败", err);
  }
}

/** 拉取后端响度能力/进度快照 */
export async function refreshLoudnessState() {
  if (!isWails()) return null;
  try {
    const ls = await backend.loudnessState();
    if (ls) state.loudnessState = ls;
    return ls;
  } catch {
    return null;
  }
}

/** 拖动进度条结束时调用 */
export function seekAudio(ms) {
  if (!isWails()) return;
  const node = audioEl();
  if (!node.src) {
    pendingSeek = ms;
    return;
  }
  const target = Math.max(0, Math.min(ms, state.duration || 0)) / 1000;
  try {
    node.currentTime = target;
  } catch {
    pendingSeek = ms;
  }
}

export function stopAudio() {
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
  loadedFor = null;
}

/** 供设置界面显示「当前是否在用 Web Audio 增益」 */
export function audioGraphState() {
  return {
    graph: Boolean(ctx && gainNode) && !graphBroken,
    contextState: ctx?.state ?? "none",
    element: Boolean(el),
    currentSrc: el?.currentSrc ? "已加载" : "未加载",
  };
}
