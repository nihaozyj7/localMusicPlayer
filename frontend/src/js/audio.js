/* ==========================================================================
   audio.js — 播放控制（后端原生引擎客户端）
   --------------------------------------------------------------------------
   这里不再是「用 <audio> 出声」，而是**驱动 Go 侧的音频引擎**。

   为什么迁移（背景，避免以后有人改回去）：
     <audio> 的解码与输出跑在 WebView2 的渲染进程里。网页一卡（主线程被
     布局/绘制占满、GPU 进程抖动），音频线程就拿不到时间片，听感上就是
     「卡顿 / 沙哑」；而且声音从 WebView2 进程发出，Windows 音量合成器里
     显示的是 webview2 而不是本程序，没法单独调音量。
     搬到 Go 进程后，音频由独立线程驱动，网页再卡也不影响出声，
     合成器里也是本程序。

   --------------------------------------------------------------------------
   进度为什么用「锚点 + 本地外推」，而不是等后端推位置

   后端每 500ms 推一个锚点 { positionMs, atMs }。前端拿到后**自己**按
   经过的时间外推当前应该显示的位置：

       显示位置 = positionMs + (performance.now() - atMs)

   如果反过来——让后端按帧推位置、前端照单全收——那么 WebView2 一旦卡顿，
   消息就在队列里积压，恢复后前端会看到一串跳变的位置，歌词会一顿一顿地
   蹦。那等于把「音频卡顿」换成了「界面卡顿」，而界面流畅正是这次迁移的目标。

   外推的误差来源只有一个：前端的 performance.now() 与音频时钟有微小漂移。
   锚点每 500ms 重新对齐一次，漂移量级在毫秒级，肉耳与肉眼都看不出。

   --------------------------------------------------------------------------
   回退

   后端引擎可能因为「声卡打不开」「没有可用的 ffmpeg」而不可用。
   这时 available=false，本模块会退回原来的 <audio> 播放路径
   （见下面的 legacy 分支）—— 宁可退化成旧行为，也不能没声音。
   ========================================================================== */

import { backend, isWails, on } from "./bridge.js";
import {
  commit,
  currentSong,
  noteProgress,
  notify,
  persist,
  playNext,
  seek,
  setRealAudioProbe,
  state,
} from "./store.js";
import { toast } from "./dom.js";

/* --------------------------------------------------------------------------
   模块状态
   -------------------------------------------------------------------------- */

/** 后端引擎是否可用（由 Player.Available() 决定） */
let backendReady = false;
/** 已经探测过后端可用性（避免重复探测） */
let probed = false;
/** 探测失败的原因（设置界面显示用） */
let backendReason = "";

/** 当前已经装载到后端的歌曲 id */
let loadedFor = null;
/** 换源请求序号：切歌竞态时用来丢弃过期的结果 */
let requestSeq = 0;
/** 待执行的跳转位置（毫秒），装载完成后消费 */
let pendingSeek = null;

/** 最近一次从后端收到的位置锚点 */
let anchor = null; // { positionMs, atMs, durationMs, playing, at: performance.now() }

/** 上一次推给 store 的位置，避免每帧都触发渲染 */
let lastPushedPosition = -1;

/** 上次把进度写进 localStorage 的时刻（5 秒节流） */
let lastProgressPersistAt = 0;

/** 位置外推的定时器 */
let tickTimer = null;

/** 取消订阅函数集合 */
const unsubscribers = [];

/* --------------------------------------------------------------------------
   legacy <audio> 回退路径的状态（后端不可用时才用）
   -------------------------------------------------------------------------- */

let el = null;
let graphBroken = false;
let ctx = null;
let gainNode = null;
let sourceNode = null;
let analyserNode = null;
let analyserData = null;
let lastAppliedGain = null;
const SWITCH_IDLE = "idle";
const SWITCH_LOADING = "loading";
let switchPhase = SWITCH_IDLE;
let switchTimer = null;
let selfPause = false;
let endedAt = 0;
let srcChangedAt = 0;
const LOAD_SETTLE_MS = 1500;
const SWITCH_TIMEOUT_MS = 12_000;

/* --------------------------------------------------------------------------
   后端可用性探测
   -------------------------------------------------------------------------- */

/**
 * 探测后端音频是否可用。启动时调用一次。
 * 不可用时把 backendReady 置 false，后续所有控制都走 legacy 路径。
 */
export async function probeBackend() {
  if (probed) return backendReady;
  probed = true;
  if (!isWails()) return false;
  try {
    const res = await backend.playerAvailable();
    backendReady = res?.available === true;
    backendReason = res?.reason || "";
    if (!backendReady) {
      console.warn("[audio] 后端音频不可用，回退到 <audio> 播放：", backendReason || "未知原因");
    }
  } catch (err) {
    backendReady = false;
    backendReason = err?.message || String(err);
    console.warn("[audio] 探测后端音频失败，回退到 <audio> 播放", err);
  }
  return backendReady;
}

/** 后端是否接管了播放（设置界面用来显示当前走的哪条链路） */
export function isBackendPlayback() {
  return backendReady;
}

/**
 * 告诉 store「真实音频已经接管进度」。
 *
 * store 里的模拟时钟（浏览器预览用的那个）在真实播放时必须让位，
 * 否则它会和这里的锚点外推同时改 state.position —— 两个来源打架，
 * 进度条会来回抖。判定逻辑注册过去而不是让 store import 本模块，
 * 是为了避免循环依赖（store 是底层）。
 */
setRealAudioProbe(() => {
  if (backendReady && state.currentId) return true;
  const node = document.getElementById("audio-engine");
  return Boolean(node && node.src);
});

/* --------------------------------------------------------------------------
   事件订阅
   -------------------------------------------------------------------------- */

/**
 * 订阅后端推来的播放事件。启动时调用一次。
 *
 * 三个事件：
 *   · player:state —— 位置锚点 + 播放状态（主链路）
 *   · player:error —— 播放失败（转码失败 / 文件损坏）
 *   · player:ended —— 播完（自动下一首）
 */
export function startAudioEvents() {
  if (!isWails()) return;

  unsubscribers.push(
    on("player:state", (payload) => {
      if (!payload) return;
      applyAnchor(payload);
    }),
  );

  unsubscribers.push(
    on("player:error", (payload) => {
      if (!payload) return;
      const song = currentSong();
      const title = song?.title || payload.songId || "当前歌曲";
      toast(`无法播放：${title}（${payload.reason || "未知原因"}）`, {
        tone: "error",
        duration: 5000,
      });
    }),
  );

  unsubscribers.push(
    on("player:ended", () => {
      handleEnded();
    }),
  );

  // 位置外推的心跳。这里只做「按锚点算出当前应该显示的位置」，
  // 不向后端请求任何东西 —— 所以即使 WebView2 卡顿，恢复后也不会积压。
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(extrapolate, 250);
}

/** 停止事件订阅与外推定时器（退出/热重载用） */
export function stopAudioEvents() {
  while (unsubscribers.length) {
    try {
      unsubscribers.pop()();
    } catch {
      /* 忽略 */
    }
  }
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

/* --------------------------------------------------------------------------
   锚点与外推
   -------------------------------------------------------------------------- */

/**
 * 收到一个后端锚点：记下来，并立刻把状态对齐一次。
 *
 * atMs 是后端的单调时钟（自后端进程启动起的毫秒数），与本地的
 * performance.now() 起点不同 —— 但外推只用**差值** (now - atMs)，
 * 所以只要单位一致、各自单调即可。这里记下收到锚点时的本地时刻，
 * 之后用它做外推基准。
 */
function applyAnchor(payload) {
  const durationMs = Number(payload.durationMs) || 0;
  const positionMs = Number(payload.positionMs) || 0;

  anchor = {
    positionMs,
    atMs: Number(payload.atMs) || 0,
    durationMs,
    playing: payload.playing === true,
    // 记下「本地」收到锚点的时刻，外推以它为基准
    at: performance.now(),
  };

  // 播放状态以后端为准：后端是唯一真源（前端不再自己维护 playing）
  let changed = false;
  if (durationMs > 0 && state.duration !== durationMs) {
    state.duration = durationMs;
    changed = true;
  }
  if (state.playing !== anchor.playing) {
    state.playing = anchor.playing;
    changed = true;
  }

  pushPosition(positionMs, true);

  if (changed) {
    commit();
    // 停止定时器的判定也要跟着走：播完即停 / 单曲循环都由后端事件驱动，
    // 这里只需保证 UI 状态一致。
  } else {
    notify();
  }
}

/**
 * 按锚点外推出「现在」应该显示的位置，并推给 store。
 *
 * 只在位置真的变了（按 250ms 量化）时才推，避免每 250ms 都触发一次
 * 整条渲染链 —— 那正是原来 <audio>.timeupdate 的毛病。
 */
function extrapolate() {
  if (!anchor || !backendReady) return;
  if (!state.currentId) return;

  let pos = anchor.positionMs;
  if (anchor.playing) {
    pos = anchor.positionMs + (performance.now() - anchor.at);
  }
  // 不允许越过总时长（后端还没播完时前端不能先跑到头）
  if (anchor.durationMs > 0) {
    pos = Math.min(pos, anchor.durationMs);
  }
  pushPosition(pos, false);
}

/**
 * 把位置写进 store。
 *
 * @param {number} pos 毫秒
 * @param {boolean} force 忽略「位置没变」的去重（锚点到达时必须强制对齐）
 */
function pushPosition(pos, force) {
  if (!Number.isFinite(pos) || pos < 0) return;
  const rounded = Math.round(pos);
  // 250ms 量化：与 audio.js 原来 runtime.js 的依赖键频率一致，
  // 歌词高亮与进度条不需要更细。
  if (!force && Math.round(rounded / 250) === Math.round(lastPushedPosition / 250)) {
    return;
  }
  lastPushedPosition = rounded;
  state.position = rounded;
  noteProgress(rounded);

  if (state.config.resumeProgress === true && performance.now() - lastProgressPersistAt > 5000) {
    lastProgressPersistAt = performance.now();
    persist();
  }
  notify();
}

/** 播完：交给 store 的 playNext（与原来 <audio> 的 ended 分支同一逻辑） */
function handleEnded() {
  // 定时停止优先：本首结束即停，即使处于单曲循环也不重播。
  if (state.sleepTimer?.type === "after-song") {
    playNext(true);
    return;
  }
  if (state.playMode === "loop-one") {
    // 单曲循环：重新从 0 播这一首
    playFrom(0);
    return;
  }
  playNext(true);
}

/* --------------------------------------------------------------------------
   播放控制（对外的唯一入口）
   -------------------------------------------------------------------------- */

/**
 * 播放状态变化时被 runtime 的 tick 调用。
 *
 * 现在的职责变成了「把前端的意图同步给后端」：换歌时装载新曲目，
 * 播放/暂停状态变化时通知后端。位置**不**在这里推（那是锚点的事）。
 */
export async function syncAudio() {
  if (!isWails()) return;

  // 后端不可用：走原来的 <audio> 路径
  if (!backendReady) {
    await syncLegacy();
    return;
  }

  const song = currentSong();

  if (!song) {
    if (loadedFor !== null) {
      loadedFor = null;
      anchor = null;
      try {
        await backend.playerUnload();
      } catch {
        /* 卸载失败不影响后续装载 */
      }
    }
    return;
  }

  if (loadedFor !== song.id) {
    await loadSong(song);
    return;
  }

  // 同一首歌：把播放/暂停意图同步给后端（幂等，后端自己判重）
  syncPlayState();
}

/** 装载一首歌并起播 */
async function loadSong(song) {
  loadedFor = song.id;
  const seq = ++requestSeq;
  anchor = null;
  lastPushedPosition = -1;

  try {
    const res = await backend.playerLoad(song.id);
    if (seq !== requestSeq) return; // 期间又切歌了

    // 装载完成：后端返回准确的时长与起始位置
    if (res?.durationMs > 0) state.duration = res.durationMs;

    // 恢复上次的播放位置（仅启动时那一首）
    const resumeMs = consumeResumeSeek(song);
    if (resumeMs > 0) {
      await backend.playerSeek(resumeMs);
    }

    // 套用音量与响度补偿，再起播
    await pushVolumeToBackend();
    await pushLoudnessToBackend(song.id);

    if (state.playing) {
      await backend.playerPlay();
    }
    // 立刻拉一次状态：不等下一个锚点，避免刚切歌时进度条停在旧位置
    const st = await backend.playerState();
    if (seq === requestSeq && st) applyAnchor(st);
  } catch (err) {
    if (seq !== requestSeq) return;
    loadedFor = null;
    toast(`无法播放：${err?.message ?? "装载失败"}`, { tone: "error", duration: 5000 });
  }
}

/** 把「该播还是该停」同步给后端 */
async function syncPlayState() {
  try {
    if (state.playing) {
      await backend.playerPlay();
    } else {
      await backend.playerPause();
    }
  } catch (err) {
    console.warn("[audio] 同步播放状态失败", err);
  }
}

/** 从某个位置开始播放当前曲目 */
async function playFrom(ms) {
  if (!backendReady) return;
  try {
    await backend.playerSeek(ms);
    await backend.playerPlay();
  } catch (err) {
    console.warn("[audio] 重新起播失败", err);
  }
}

/* --------------------------------------------------------------------------
   音量与响度补偿
   -------------------------------------------------------------------------- */

/** 当前应套用的线性增益（用户音量 × 响度补偿），供设置界面显示 */
export function currentGain() {
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
  if (!backendReady) {
    applyVolumeLegacy();
    return;
  }
  pushVolumeToBackend();
}

/** 把用户音量与静音状态推给后端 */
async function pushVolumeToBackend() {
  try {
    await backend.playerSetVolume(state.volume ?? 1, state.muted === true);
  } catch (err) {
    console.warn("[audio] 同步音量失败", err);
  }
}

/** 把当前歌曲的响度补偿推给后端（后端负责与用户音量相乘） */
async function pushLoudnessToBackend(songId) {
  const mode = state.config.loudnessMode || "off";
  let gainDB = 0;
  if (mode !== "off" && songId) {
    gainDB = state.loudnessGains?.[songId] ?? 0;
  }
  try {
    await backend.playerSetLoudness(gainDB);
  } catch (err) {
    console.warn("[audio] 同步响度补偿失败", err);
  }
}

/**
 * 歌曲切换后重新套用补偿增益。
 * main 的 tick 每帧都会调用它，所以这里做去重。
 */
export function applyGainForSong() {
  if (!backendReady) {
    applyGainForSongLegacy();
    return;
  }
  const value = currentGain();
  if (value === lastAppliedGain) return;
  lastAppliedGain = value;
  pushVolumeToBackend();
  pushLoudnessToBackend(state.currentId);
}

/* --------------------------------------------------------------------------
   跳转
   -------------------------------------------------------------------------- */

/**
 * 跳转到指定位置（毫秒）—— 界面上的所有跳转都必须走这里。
 *
 * 先写状态（UI 立即响应），再让后端跟上来；同时把本地锚点前移，
 * 否则外推会在跳转后的下一次 tick 里把位置又拉回旧值（进度条会弹回去）。
 */
export function seekTo(ms) {
  seek(ms);
  seekAudio(ms);
}

/** 把位置作用到真实的播放链路上 */
export function seekAudio(ms) {
  if (!isWails()) return;
  const target = Math.max(0, Math.min(ms, state.duration || 0));

  // 先移动本地锚点：让外推立刻从新位置继续，而不是等后端回包
  if (anchor) {
    anchor = { ...anchor, positionMs: target, at: performance.now() };
  }
  lastPushedPosition = target;

  if (!backendReady) {
    seekAudioLegacy(ms);
    return;
  }
  backend.playerSeek(target).catch((err) => {
    console.warn("[audio] 跳转失败", err);
  });
}

export function stopAudio() {
  if (!backendReady) {
    stopAudioLegacy();
    return;
  }
  loadedFor = null;
  anchor = null;
  backend.playerUnload().catch(() => {});
}

/* --------------------------------------------------------------------------
   频谱
   -------------------------------------------------------------------------- */

/**
 * 取当前频谱（0..1 的归一化幅度数组）。
 *
 * 后端可用时由 Go 侧算（internal/audioplay 的 Analyzer，逐语义复刻了原来
 * 前端 AnalyserNode 的算法：同样的对数分桶、同样的字节域平滑），
 * 所以皮肤的观感与迁移前一致。
 *
 * 这是**同步**接口（皮肤在 rAF 里直接调），所以这里返回的是最近一次
 * 异步拉取的缓存值 —— 真正的数据由 refreshSpectrum() 按需刷新。
 *
 * @param {number} [bands] 想要的频段数（1..128）
 * @returns {Float32Array|null}
 */
let spectrumCache = null;
let spectrumBands = 0;

export function spectrum(bands = 32) {
  if (!backendReady) {
    // 回退路径：仍然用 Web Audio 的 AnalyserNode
    return spectrumLegacy(bands);
  }
  const n = Math.max(1, Math.min(128, Math.floor(bands) || 32));
  if (!spectrumCache || spectrumBands !== n) return null;
  return spectrumCache;
}

/**
 * 向后端拉一次频谱并更新缓存。由需要频谱的调用方按自己的节奏调
 * （桌面背景歌词是 30Hz，详情页皮肤由宿主每帧调）。
 *
 * 用「拉」而不是「推」：频谱是 30Hz 的高频数据，推给前端意味着每秒
 * 30 次 web message 编解码；而它只在「详情页打开 + 皮肤声明了 spectrum」
 * 时才有用。拉的方式让不需要时完全没有开销。
 */
export async function refreshSpectrum(bands = 32) {
  if (!backendReady) return null;
  const n = Math.max(1, Math.min(128, Math.floor(bands) || 32));
  try {
    const res = await backend.playerSpectrum(n);
    const arr = res?.bands;
    if (!arr || !arr.length) {
      spectrumCache = null;
      return null;
    }
    // 复用同一个 Float32Array，避免每帧分配
    if (!spectrumCache || spectrumCache.length !== arr.length) {
      spectrumCache = new Float32Array(arr.length);
      spectrumBands = n;
    }
    for (let i = 0; i < arr.length; i += 1) spectrumCache[i] = arr[i];
    return spectrumCache;
  } catch {
    return null;
  }
}

/** 低频能量（0..1）：给「整体随鼓点放大」这类效果用 */
export function bassLevel() {
  const bands = spectrum(8);
  if (!bands) return null;
  let sum = 0;
  for (let i = 0; i < 3; i += 1) sum += bands[i];
  return sum / 3;
}

/* --------------------------------------------------------------------------
   响度补偿（与后端响度服务对接，逻辑未变）
   -------------------------------------------------------------------------- */

/** 正在进行的按需测量：同一首歌被反复触发时合并成一次 */
const pendingMeasure = new Map();

export async function requestLoudness(songId) {
  const mode = state.config.loudnessMode || "off";
  if (mode === "off" || !isWails() || !songId) return;
  if (state.loudnessGains?.[songId] !== undefined) {
    // 已有补偿：直接推给后端（切歌场景）
    if (backendReady) pushLoudnessToBackend(songId);
    return;
  }
  if (pendingMeasure.has(songId)) return pendingMeasure.get(songId);

  const job = (async () => {
    try {
      const target = state.config.loudnessTarget ?? -16;
      const res = await backend.loudnessLookup(songId, target);
      if (res?.measured) {
        setGain(songId, res.gainDB);
        return;
      }
      if (mode === "album") return;
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
  if (songId === state.currentId) {
    if (backendReady) {
      pushLoudnessToBackend(songId);
      pushVolumeToBackend();
    } else {
      applyVolumeLegacy();
    }
  }
  notify();
}

/** 批量补偿（后端返回 songId → dB） */
export function applyGainMap(map) {
  if (!map) return;
  state.loudnessGains = { ...(state.loudnessGains || {}), ...map };
  applyGainForSong();
  notify();
}

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
    const map = mode === "album" ? await backend.loudnessAlbumGains(target) : await backend.loudnessGainMap(target);
    state.loudnessGains = map || {};
    applyGainForSong();
    notify();
    if (mode === "track" && state.currentId) {
      requestLoudness(state.currentId);
    }
  } catch (err) {
    console.warn("[loudness] 拉取补偿增益失败", err);
  }
}

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

/* --------------------------------------------------------------------------
   启动恢复
   -------------------------------------------------------------------------- */

/**
 * 本次启动要恢复的播放位置（毫秒）。取值后立刻清零 —— 只恢复「启动时那一首」。
 */
function consumeResumeSeek(song) {
  const saved = Number(state.pendingResumeMs) || 0;
  state.pendingResumeMs = 0;
  if (!saved || state.config.resumeProgress !== true) return 0;
  const dur = song?.duration || state.duration || 0;
  if (dur && saved >= dur - 3000) return 0;
  return saved;
}

/* --------------------------------------------------------------------------
   状态查询（设置界面）
   -------------------------------------------------------------------------- */

/** 供设置界面显示当前走的是哪条音频链路 */
export function audioGraphState() {
  if (backendReady) {
    return {
      graph: true,
      contextState: "native",
      element: false,
      currentSrc: loadedFor ? "后端引擎已装载" : "未装载",
      backend: true,
      reason: backendReason,
    };
  }
  return {
    graph: Boolean(ctx && gainNode) && !graphBroken,
    contextState: ctx?.state ?? "none",
    element: Boolean(el),
    currentSrc: el?.currentSrc ? "已加载" : "未加载",
    backend: false,
    reason: backendReason,
  };
}

/** 后端诊断信息（设置界面排查「声音断续」） */
export async function backendDiagnostics() {
  if (!backendReady) return null;
  try {
    return await backend.playerDiagnostics();
  } catch {
    return null;
  }
}

/** 真实音频元素：后端播放时没有 <audio>，返回 null（皮肤契约已移除这一项） */
export function audioElement() {
  if (backendReady) return null;
  try {
    return audioEl();
  } catch {
    return null;
  }
}

/* ==========================================================================
   legacy <audio> 回退路径
   --------------------------------------------------------------------------
   后端不可用（声卡打不开 / 没有 ffmpeg）时用的老路径，逻辑与迁移前一致。
   保留它而不是直接删掉，是为了「宁可退化成旧行为，也不能没声音」。
   日常运行不会走到这里，所以这里只维持基本可用（播放/暂停/进度/音量）。
   ========================================================================== */

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
  el.crossOrigin = "anonymous";
  bindLegacyEvents(el);
  return el;
}

function bindLegacyEvents(node) {
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
        node.currentTime = Math.max(0, Math.min(target, state.duration || 0) / 1000);
      } catch {
        /* 转码流不支持精确定位时忽略 */
      }
    }
    endLegacySwitch(node);
  });

  node.addEventListener("timeupdate", () => {
    const bar = document.getElementById("progress");
    if (bar?.dataset.dragging === "true") return;
    state.position = node.currentTime * 1000;
    noteProgress(state.position);
    if (state.config.resumeProgress === true && performance.now() - lastProgressPersistAt > 5000) {
      lastProgressPersistAt = performance.now();
      persist();
    }
    notify();
  });

  node.addEventListener("play", () => {
    if (switchPhase === SWITCH_LOADING) return;
    selfPause = false;
    state.playing = true;
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
    notify();
  });

  node.addEventListener("pause", () => {
    if (selfPause) {
      selfPause = false;
      return;
    }
    if (switchPhase === SWITCH_LOADING) return;
    if (node.ended) return;
    const durMs = Number.isFinite(node.duration) && node.duration > 0 ? node.duration * 1000 : state.duration || 0;
    if (durMs) {
      const posMs = Number.isFinite(node.currentTime) ? node.currentTime * 1000 : state.position;
      if (posMs >= durMs - 300) return;
    }
    if (endedAt && performance.now() - endedAt < LOAD_SETTLE_MS) return;
    state.playing = false;
    notify();
  });

  node.addEventListener("ended", () => {
    endedAt = performance.now();
    handleEnded();
  });

  node.addEventListener("error", () => {
    switchPhase = SWITCH_IDLE;
    selfPause = false;
    const song = currentSong();
    if (!song) return;
    if (srcChangedAt && performance.now() - srcChangedAt < LOAD_SETTLE_MS) return;
    if (!node.error || !node.error.code) return;
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

async function syncLegacy() {
  const node = audioEl();
  const song = currentSong();

  if (!song) {
    if (loadedFor !== null) {
      node.pause();
      node.removeAttribute("src");
      node.load();
      loadedFor = null;
      switchPhase = SWITCH_IDLE;
    }
    return;
  }

  if (loadedFor !== song.id) {
    loadedFor = song.id;
    switchPhase = SWITCH_LOADING;
    selfPause = false;
    if (switchTimer) clearTimeout(switchTimer);
    switchTimer = setTimeout(() => {
      switchTimer = null;
      if (switchPhase === SWITCH_LOADING) endLegacySwitch(el);
    }, SWITCH_TIMEOUT_MS);

    const seq = ++requestSeq;
    let url = null;
    try {
      url = song.streamUrl || (await backend.mediaUrl(song.id));
    } catch (err) {
      switchPhase = SWITCH_IDLE;
      toast(`无法播放：${err?.message ?? "取播放地址失败"}`, { tone: "error", duration: 5000 });
      return;
    }
    if (seq !== requestSeq) return;
    if (!url) {
      switchPhase = SWITCH_IDLE;
      return;
    }

    pendingSeek = consumeResumeSeek(song);
    node.src = url;
    srcChangedAt = performance.now();
    node.load();
    ensureLegacyGraph(node);
    applyVolumeLegacy();
    if (!song.online) requestLoudness(song.id);
    if (state.playing && node.paused) {
      node.play().catch((err) => {
        const name = err?.name || "";
        if (name === "AbortError" || name === "NotAllowedError") return;
        console.warn("[audio] 播放失败", err);
      });
    }
    return;
  }

  if (switchPhase === SWITCH_LOADING) return;
  if (state.playing && node.paused) {
    node.play().catch(() => {});
  } else if (!state.playing && !node.paused) {
    selfPause = true;
    node.pause();
  }
}

function endLegacySwitch(node) {
  if (switchTimer) {
    clearTimeout(switchTimer);
    switchTimer = null;
  }
  if (switchPhase !== SWITCH_LOADING) return;
  switchPhase = SWITCH_IDLE;
  const n = node || el;
  if (!n) return;
  if (state.playing && n.paused) n.play().catch(() => {});
  else if (!state.playing && !n.paused) {
    selfPause = true;
    n.pause();
  }
}

function ensureLegacyGraph(node) {
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
    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);
    try {
      analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 512;
      analyserNode.smoothingTimeConstant = 0.76;
      analyserData = new Uint8Array(analyserNode.frequencyBinCount);
      gainNode.connect(analyserNode);
    } catch {
      analyserNode = null;
      analyserData = null;
    }
    lastAppliedGain = null;
    return true;
  } catch (err) {
    console.warn("[audio] Web Audio 链路建立失败，退回元素音量", err);
    graphBroken = true;
    return false;
  }
}

function applyVolumeLegacy() {
  const node = el;
  const value = currentGain();
  if (ctx && gainNode && !graphBroken) {
    const now = ctx.currentTime;
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(value, now, 0.015);
    } catch {
      gainNode.gain.value = value;
    }
    if (node) node.volume = 1;
    lastAppliedGain = value;
    return;
  }
  if (node) node.volume = Math.max(0, Math.min(1, value));
  lastAppliedGain = value;
}

function applyGainForSongLegacy() {
  const value = currentGain();
  if (value === lastAppliedGain) return;
  applyVolumeLegacy();
}

function seekAudioLegacy(ms) {
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

function stopAudioLegacy() {
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
  loadedFor = null;
  switchPhase = SWITCH_IDLE;
  selfPause = false;
}

function spectrumLegacy(bands = 32) {
  if (!analyserNode || !analyserData) return null;
  analyserNode.getByteFrequencyData(analyserData);
  const n = Math.max(1, Math.min(128, Math.floor(bands) || 32));
  const out = new Float32Array(n);
  const bins = analyserData.length;
  for (let i = 0; i < n; i += 1) {
    const lo = Math.floor(bins * (i / n) ** 1.7);
    const hi = Math.min(bins, Math.max(lo + 1, Math.floor(bins * ((i + 1) / n) ** 1.7)));
    let sum = 0;
    for (let j = lo; j < hi; j += 1) sum += analyserData[j];
    out[i] = sum / ((hi - lo) * 255);
  }
  return out;
}
