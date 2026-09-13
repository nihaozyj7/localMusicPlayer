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
import { commit, currentSong, notify, playNext, seek, state } from "./store.js";
import { toast } from "./dom.js";

let el = null;
let loadedFor = null; // 已经设置过 src 的歌曲 id
let requestSeq = 0;
let pendingSeek = null; // 切歌后待执行的跳转位置（毫秒）
let lastAppliedGain = null; // 上一次写进链路的增益，避免每帧重复写入
let srcChangedAt = 0; // 最近一次换 src 的时刻（performance.now），用于识别被 abort 的旧请求

/** 换 src 之后多久内出现的媒体错误认定为"旧请求被取代"，不提示用户 */
const LOAD_SETTLE_MS = 1500;

/* --------------------------------------------------------------------------
   换源状态机 —— 「元素事件」与「播放意图」谁说了算
   --------------------------------------------------------------------------
   切歌要做 node.src = url + node.load()，而 load() 会把元素置为暂停并派发一个
   pause 事件；旧播放在换源途中被 abort 时元素也会补发 play/pause。这些事件都
   不是用户意图，但早期实现把它们当成了用户操作：pause 事件把 state.playing
   写成 false，而"继续播放"只在 state.playing 为 true 时才会发生 —— 结果是一首
   歌自然播完后，下一首明明已经加载好却永远停在暂停状态（表现为"播完就停掉"）。

   现在的规则：
     · 换源期间 switchPhase = "loading"，元素的 play/pause 一律不采信，
       state.playing 是唯一真源；
     · 新源 loadedmetadata 之后（endSwitch）再按 state.playing 把元素对齐一次。
   -------------------------------------------------------------------------- */
const SWITCH_IDLE = "idle";
const SWITCH_LOADING = "loading";
let switchPhase = SWITCH_IDLE;
let switchTimer = null;
/** 我们主动调用 pause() 引起的事件，不是用户暂停 */
let selfPause = false;
/** 最近一次自然播完的时刻：紧跟其后的 pause 属于切歌过程，同样不是用户暂停 */
let endedAt = 0;

/** 换源兜底时长：loadedmetadata 迟迟不来（损坏文件 / 卡住的转码）也不能永久锁死 */
const SWITCH_TIMEOUT_MS = 12_000;

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
    // 新建的链路增益是 1，缓存要作废，让下一次 applyGainForSong 真正写进去
    lastAppliedGain = null;
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
    lastAppliedGain = value;
    return;
  }
  if (node) node.volume = Math.max(0, Math.min(1, value));
  lastAppliedGain = value;
}

/**
 * 歌曲切换后重新套用补偿增益。
 *
 * main 的 tick 每帧都会调用它，所以这里必须做去重：否则每帧都往
 * AudioParam 上排一次斜坡，白白占 CPU，也让音量变化的手感变钝。
 */
export function applyGainForSong() {
  const value = targetGain();
  if (value === lastAppliedGain) return;
  applyVolume();
}

/* --------------------------------------------------------------------------
   播放对齐：state.playing 是唯一真源，元素跟着它走
   -------------------------------------------------------------------------- */

/** 启动播放（含 AudioContext 唤醒与良性错误过滤） */
function startPlayback(node) {
  if (!node) return Promise.resolve();
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  return node.play().catch((err) => {
    // play() 的 promise 会因为「被新的 load() 打断」而 reject（AbortError），
    // 这在自动切歌时每次都会发生，并不是播放失败 —— 只有真正的失败才提示。
    if (isBenignPlayError(err)) return;
    toast(`播放失败：${err?.message ?? err}`, { tone: "error", duration: 5000 });
  });
}

/** 把元素对齐到 state.playing（不采信元素自己的事件） */
function reconcilePlayback(node) {
  if (!node) return;
  if (state.playing && node.paused) {
    startPlayback(node);
    return;
  }
  if (!state.playing && !node.paused) {
    selfPause = true; // 这是我们按下的暂停，别把它当成用户操作回写状态
    node.pause();
  }
}

/** 元素是否已经播到尽头（有的浏览器在 ended 之前就派发 pause，且此时 ended 还是 false） */
function atEndOfMedia(node) {
  const durMs = Number.isFinite(node.duration) && node.duration > 0 ? node.duration * 1000 : state.duration || 0;
  if (!durMs) return false;
  const posMs = Number.isFinite(node.currentTime) ? node.currentTime * 1000 : state.position;
  return posMs >= durMs - 300;
}

/** 开始换源：此后元素自发的事件都不代表用户意图 */
function beginSwitch() {
  switchPhase = SWITCH_LOADING;
  selfPause = false;
  if (switchTimer) clearTimeout(switchTimer);
  switchTimer = setTimeout(() => {
    switchTimer = null;
    if (switchPhase === SWITCH_LOADING) endSwitch(el);
  }, SWITCH_TIMEOUT_MS);
}

/** 换源收尾：新源元数据已就绪，从这一刻起元素的事件才代表真实播放状态 */
function endSwitch(node) {
  if (switchTimer) {
    clearTimeout(switchTimer);
    switchTimer = null;
  }
  if (switchPhase !== SWITCH_LOADING) return;
  switchPhase = SWITCH_IDLE;
  reconcilePlayback(node || el);
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
    // 新源就绪：换源结束，按 state.playing 把元素对齐（该播就补一次 play）
    endSwitch(node);
  });

  node.addEventListener("timeupdate", () => {
    const bar = document.getElementById("progress");
    if (bar?.dataset.dragging === "true") return;
    state.position = node.currentTime * 1000;
    notify();
  });

  node.addEventListener("play", () => {
    // 换源期间元素的状态由我们驱动，不采信：否则"刚点下暂停又被打回播放"
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
    // load() 造成的暂停：换源期间不采信
    if (switchPhase === SWITCH_LOADING) return;
    if (node.ended) return;
    // 自然播完：有的浏览器先派发 pause（此时 ended 还没置位），交给 ended 处理
    if (atEndOfMedia(node)) return;
    // 播完之后的这一小段时间里，元素的暂停都是切歌引起的（旧实现就是被这条
    // 事件把 state.playing 打成 false，导致下一首加载完也不会开始播）
    if (endedAt && performance.now() - endedAt < LOAD_SETTLE_MS) return;
    state.playing = false;
    notify();
  });

  node.addEventListener("ended", () => {
    endedAt = performance.now();
    if (state.playMode === "loop-one") {
      node.currentTime = 0;
      node.play().catch(() => {});
      return;
    }
    playNext(true);
  });

  node.addEventListener("error", () => {
    // 换源失败：不要卡在 loading，否则之后再也无法把元素对齐回 state
    switchPhase = SWITCH_IDLE;
    selfPause = false;
    const song = currentSong();
    if (!song) return;
    // 切歌时上一次的请求必然被 abort，浏览器同样会在元素上派发 error。
    // 被后来的加载取代的报错不是播放失败，不能弹给用户看。
    if (wasSuperseded(node.error)) return;
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

/**
 * 这次媒体错误是不是"被新的加载取代"导致的？
 * 典型场景：一首歌播完 → 自动切下一首 → 旧请求被 abort。
 * 判定：src 刚被换掉（1.5 秒内），或浏览器没给出错误码（abort 就是这个样子）。
 */
function wasSuperseded(mediaError) {
  if (srcChangedAt && performance.now() - srcChangedAt < LOAD_SETTLE_MS) return true;
  return !mediaError || !mediaError.code;
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
      switchPhase = SWITCH_IDLE;
      selfPause = false;
    }
    return;
  }

  if (loadedFor !== song.id) {
    loadedFor = song.id;
    // 从这一刻起（含 await 取地址的这段时间）元素的事件都是我们造成的，一概不采信
    beginSwitch();
    const seq = ++requestSeq;
    let url = null;
    try {
      url = song.streamUrl || (await backend.mediaUrl(song.id));
    } catch (err) {
      switchPhase = SWITCH_IDLE;
      toast(`无法播放：${err?.message ?? "取播放地址失败"}`, { tone: "error", duration: 5000 });
      return;
    }
    if (seq !== requestSeq) return; // 期间又切歌了（新的 syncAudio 会接管换源状态）
    if (!url) {
      switchPhase = SWITCH_IDLE;
      toast("无法播放：后端没有返回地址", { tone: "error", duration: 5000 });
      return;
    }

    pendingSeek = 0;
    node.src = url;
    srcChangedAt = performance.now();
    node.load();

    // 建立音频图（失败也不影响出声，只是没有响度均衡）
    ensureGraph(node);
    applyVolume();

    // 顺带把这首歌的响度补偿准备好（后续切回来就零延迟）
    if (!song.online) requestLoudness(song.id);

    // 立刻尝试起播（元素会自己等缓冲）：load() 引发的 pause 已被 switchPhase 挡住，
    // 之后 loadedmetadata 会再对齐一次
    reconcilePlayback(node);
    // 关键：本次不要再走下面的对齐逻辑 —— 旧实现就是在取地址期间用旧源调了
    // play()，把上一首歌重新播了出来，并引发一串 play/pause 事件风暴
    return;
  }

  // 换源还没结束：不要拿元素做播放/暂停对齐
  if (switchPhase === SWITCH_LOADING) return;

  reconcilePlayback(node);
}

/**
 * play() 的哪些 rejection 不该报给用户：
 *   · AbortError —— 新的 load()/src 取代了这次播放（自动切歌必现）
 *   · NotAllowedError —— 自动播放策略拦下的第一次播放，用户点一下就好
 */
function isBenignPlayError(err) {
  const name = err?.name || "";
  if (name === "AbortError" || name === "NotAllowedError") return true;
  const msg = String(err?.message || "");
  return /abort|interrupted by a new load|play\(\) request was interrupted/i.test(msg);
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

/**
 * 跳转到指定位置（毫秒）—— 界面上的所有跳转都必须走这里。
 *
 * 只调 store 的 seek() 会只改状态，进度条会"闪一下又弹回原位"：
 * 元素没有真的 seek，下一次 timeupdate 立刻用真实播放位置把状态覆盖回去。
 * 进度条拖动 / 点击歌词 / 方向键都是同一个需求，所以统一收在这里：
 * 先写状态（UI 立即响应），再让 <audio> 跟上来。
 */
export function seekTo(ms) {
  seek(ms);
  seekAudio(ms);
}

/** 把位置作用到真实的 <audio> 元素上 */
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
  switchPhase = SWITCH_IDLE;
  selfPause = false;
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
