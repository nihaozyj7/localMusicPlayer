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
  removeSongFromLibrary,
  seek,
  setRealAudioProbe,
  setUserPlayProbe,
  songById,
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

/** 前端**希望**装载的歌曲 id（发出 playerLoad 时就更新） */
let loadedFor = null;
/**
 * 后端**确实已经装载**的歌曲 id（playerLoad 返回后才更新）。
 *
 * 与 loadedFor 分开是必要的：两者在切歌途中会不一致 ——
 * loadedFor 已指向新歌，而后端仍在放旧歌（它还要把环形缓冲里约 3 秒的
 * 旧音频吐完）。任何「按歌推增益」的动作都必须认 backendSongId，
 * 否则就会把新歌的补偿安到正在出声的旧歌头上，听感上就是
 * 「切歌瞬间上一首突然变响」。
 */
let backendSongId = null;
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

/**
 * 「下一首要来了」——从切歌开始，到最后一次把位置写进 store 为止。
 *
 * ★ 它解决的是切歌瞬间进度条的乱跳（真实报障：「进度条会反复横跳一下」）。
 *
 * 切歌发生时 state.position 会被 store 清零，但**旧歌的锚点还挂在本模块里**：
 * 后端的 tick 每 200ms 就会按旧歌的位置推一个锚点过来，外推也仍在按旧锚点
 * 算位置。这些数字写进 store 就是「清零 → 又跳回旧位置 → 再清零」的横跳。
 * 更糟的是它还会被写进 noteProgress（记忆播放进度）——于是刚播的新歌
 * 可能带着旧歌的位置被记下来，下次打开就跑到了中间。
 *
 * 所以从切歌那一刻起，直到新歌真正装载完成，一律**不接受**锚点：
 *   · applyAnchor 直接丢掉（那一定是旧歌的）；
 *   · 外推停摆，位置停在 store 刚清零的 0 上。
 */
let switchPending = false;

/** 取消订阅函数集合 */
const unsubscribers = [];

/* --------------------------------------------------------------------------
   播放失败的处理状态（见 handlePlaybackFailure）
   -------------------------------------------------------------------------- */

/**
 * 已经处理过失败的歌曲 id。
 *
 * ★ 为什么必须有它（真实事故：坏文件导致错误提示刷屏）
 *
 * 一次装载失败**不是一次事件**，而是一连串：
 *   · 后端 playerLoad 返回错误（并广播 player:error）；
 *   · player:error 订阅、loadSong 的 catch 会**分别**收到同一件事；
 *   · 更糟的是失败后 state.playing 仍是 true、currentId 仍是这首坏歌，
 *     而 runtime 的依赖键每 250ms 变一次 → 每个 tick 都重跑 syncAudio()
 *     → 重新 playerLoad → 再失败 → 又弹一条 toast。
 * 用户看到的就是「疯狂弹错误提示」。
 *
 * 记下这个 id，同一首歌的后续失败一律吞掉，直到用户重新点播它为止。
 */
let failedSongId = null;

/**
 * 连续失败次数。装载成功时清零。
 *
 * 队列里坏文件一多（比如整库都是损坏的流），「失败就跳下一首」会变成
 * 一路刷到底、把整个列表弹一遍。超过 FAILURE_STREAK_LIMIT 就停下并说明，
 * 让用户知道是「一批文件有问题」而不是「播放器坏了」。
 */
let consecutiveFailures = 0;

/** 连续失败到这个数就停止自动跳转（避免坏文件刷屏式连跳） */
const FAILURE_STREAK_LIMIT = 5;

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

/**
 * 用户主动点播一首歌时，解除「这首歌已判定放不出来」的闸门。
 *
 * 与上面的 probe 同一个理由（避免 store import 本模块）。没有这一步的话，
 * 用户修好文件（或换了张能读的盘）之后再点这首歌会**完全没反应** ——
 * syncAudio 会因为闸门而直接 return，连提示都没有。
 */
setUserPlayProbe((songId) => resetFailureGate(songId));

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
      handlePlaybackFailure(payload.songId || state.currentId, payload.reason, "backend");
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
  // 切歌途中：这一定是**上一首**的锚点（后端要到 playerLoad 返回才换成新歌），
  // 收下就会把进度条拉回旧歌的位置，还会污染「记忆播放进度」。直接丢。
  // 新歌的锚点由 loadSong 在装载完成后主动拉一次（见那里的 playerState）。
  if (switchPending) return;

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
  // 切歌途中不推进：此刻 anchor 还是上一首的，推进它就是在给进度条喂旧位置
  if (switchPending) return;

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
   跳过静音与切歌间隔
   --------------------------------------------------------------------------
   这两项都在**后端**生效（检测与计时都在音频线程上，见
   internal/audioplay/silence.go 与 services_player.go#SetPlaybackOptions），
   前端只负责「把开关同步下去」和「把跳过量显示对」。

   为什么不放在前端做：
     · 静音检测要读整首歌的 PCM —— 前端没有 raw PCM，且真做起来要把
       音频再解一遍，等于把刚搬到后端的工作又搬回来；
     · 切歌间隔是**音频时间**上的空白，只有音频时钟量得准。放前端的话，
       网页一卡（或窗口最小化被节流）间隔就会忽长忽短。
   -------------------------------------------------------------------------- */

/**
 * 把当前的跳过静音 / 切歌间隔设置推给后端。
 *
 * 设置界面改完开关与滑条后调用（见 settings-view.js 与 settings.js）。
 * 后端会把它应用到**下一次装载**与正在等待的切歌间隔上。
 */
export async function applyPlaybackOptions() {
  if (!backendReady) {
    // 回退路径（<audio>）：没有静音检测与音频时钟计时，
    // 只把「切歌间隔」在本地落实（见 scheduleLegacyGap）。
    return;
  }
  try {
    await backend.playerSetPlaybackOptions(
      state.config.skipSilenceHead === true,
      state.config.skipSilenceTail === true,
      Number(state.config.trackGapSeconds) || 0
    );
  } catch (err) {
    console.warn("[audio] 同步跳过静音/切歌间隔失败", err);
  }
}

/**
 * 把当前音效档位推给后端。
 *
 * 设置界面改完音效按钮后调用（见 settings.js 的 effect-preset 分支）。
 *
 * ★ 为什么音效不需要在切歌时重新推送（与响度补偿不同）：
 * 音效是**跨歌的偏好**，后端在换歌时只清空 DSP 状态（滤波器历史、
 * 混响延迟线）而保留档位（见 audioplay.Engine.Load 的注释）。
 * 响度补偿则是逐曲算出来的，换歌必须重推。
 *
 * 后端播放不可用时（回退到 <audio>）什么都不做：legacy 路径没有
 * DSP 链路，做不了音效。界面会据此显示"后端不可用"的说明。
 */
export async function applyEffectPreset() {
  if (!backendReady) return;
  const preset = state.config.effectPreset || "off";
  try {
    const res = await backend.playerSetEffect(preset);
    // 后端会做合法性收敛。若它返回的档位与我们推的不一致，说明本地
    // 配置里存了一个非法值（手改配置 / 旧版本遗留）—— 以**后端**为准
    // 写回本地，免得界面显示一套、实际生效另一套。
    if (res && typeof res.preset === "string" && res.preset !== preset) {
      console.warn(`[audio] 音效档位 ${preset} 非法，后端收敛为 ${res.preset}`);
      state.config.effectPreset = res.preset;
      commit?.();
    }
  } catch (err) {
    console.warn("[audio] 同步音效档位失败", err);
  }
}

/**
 * 最近一次装载时后端报告的跳过量（毫秒）。
 *
 * 它只用于界面提示（设置界面的诊断信息），不参与任何播放决策 ——
 * 决策全在后端。取不到时是 null，界面据此显示「未知」而不是 0，
 * 免得让人误以为「没跳过任何东西」。
 */
let lastSkip = null;

/** 最近一次装载实际跳过的首/尾静音（毫秒）；未装载过时为 null */
export function lastSkippedSilence() {
  return lastSkip;
}

/** 播放选项的快照（设置界面展示用） */
export function playbackOptionsState() {
  if (!backendReady) {
    return {
      backend: false,
      skipSilenceHead: state.config.skipSilenceHead === true,
      skipSilenceTail: state.config.skipSilenceTail === true,
      trackGapSeconds: Number(state.config.trackGapSeconds) || 0,
      skippedHeadMs: null,
      skippedTailMs: null,
    };
  }
  return {
    backend: true,
    skipSilenceHead: state.config.skipSilenceHead === true,
    skipSilenceTail: state.config.skipSilenceTail === true,
    trackGapSeconds: Number(state.config.trackGapSeconds) || 0,
    skippedHeadMs: lastSkip?.headMs ?? null,
    skippedTailMs: lastSkip?.tailMs ?? null,
  };
}

/* --------------------------------------------------------------------------
   播放失败：提示一次 + 自动跳下一首
   -------------------------------------------------------------------------- */

/**
 * 统一处理「这首放不出来」（转码失败 / 解码失败 / 文件损坏 / 取不到地址）。
 *
 * ★ 设计要点
 *
 * 1. **只提示一次**。同一首歌的失败会被多个入口重复报告（后端 player:error
 *    事件、loadSong 的 catch、<audio> 的 error 事件），而且失败后若不改变状态，
 *    runtime 每 250ms 的 tick 会把同一首歌反复送去装载。这里用 failedSongId
 *    做闸门：处理过一次就直接返回，toast 不会再弹第二条。
 *
 * 2. **自动跳下一首**。坏文件不该让播放停下来 —— 这正是用户的诉求。
 *    跳转复用 store 的 playNext(true)，随机 / 列表循环 / 定时停止这些
 *    语义都由它统一处理，不在这里重写一遍。
 *
 * 3. **连败要能停**。队列里坏文件多的时候，「失败就跳」会一路刷到底。
 *    连续失败超过 FAILURE_STREAK_LIMIT 就停止自动跳转并说明原因。
 *
 * @param {string|null} songId 出问题的歌（取不到时退回当前曲目）
 * @param {string} reason      失败原因（后端给的原文，可为空）
 * @param {string} source      触发来源，仅用于日志排查：backend | load | legacy
 */
function handlePlaybackFailure(songId, reason, source = "unknown") {
  const song = songId ? (songById(songId) || currentSong()) : currentSong();
  const id = song?.id || songId || null;
  const title = song?.title || id || "当前歌曲";
  const why = String(reason || "").trim() || "未知原因";

  // 闸门：这首歌已经处理过失败了，后续重复报告一律吞掉
  if (id && id === failedSongId) {
    console.warn(`[audio] 忽略重复的播放失败报告（${source}）：${title}`);
    return;
  }
  if (id) failedSongId = id;

  console.warn(`[audio] 播放失败（${source}）：${title} —— ${why}`);

  // 报给后端登记进「放不出来」清单（设置 → 音乐文件夹里可查看）。
  //
  // 为什么在这里登记而不是扫描时校验：解码本来就已经发生过了，登记它是
  // 零额外成本；扫描时逐首校验要为全库每首起一个 ffmpeg 进程
  // （8725 首 = 十几分钟起步），而且那份开销对这个文件是白花的。
  //
  // 后端会顺手把这首歌从曲库里摘掉（见 services_unplayable.go#Report）——
  // 留着它只会让用户每次点到都再失败一次。
  // 不 await：这里是失败路径，不该让提示与跳转等一次 IPC 往返。
  reportUnplayable(song, why);

  // 状态回收：清掉「已装载」的记账，否则 tick 会以为这首歌还在后端
  if (backendSongId === id) backendSongId = null;
  if (loadedFor === id) loadedFor = null;
  anchor = null;

  consecutiveFailures += 1;
  const giveUp = consecutiveFailures >= FAILURE_STREAK_LIMIT;

  // 先判断这次到底会不会跳 —— 提示文案要与实际行为一致，否则用户会以为
  // 已经跳过去了，实际却停在原地（暂停 / 单曲循环 / 播完即停这三种情况）。
  const willSkip =
    !giveUp && state.playing && state.sleepTimer?.type !== "after-song" && state.playMode !== "loop-one";

  if (giveUp) {
    // 一批文件都放不出来：停下并说清楚，比一路跳到列表末尾更有用
    state.playing = false;
    commit();
    // 放开闸门：连败已经清零，下一轮不该被卡在最后那首歌上
    failedSongId = null;
    consecutiveFailures = 0;
    toast(`连续 ${FAILURE_STREAK_LIMIT} 首都无法播放（${why}），已停止自动跳过`, {
      tone: "error",
      duration: 8000,
    });
    return;
  }

  // 提示一条：说明这首歌放不了、以及接下来是跳过还是停下
  toast(`无法播放：${title}（${why}）${willSkip ? "，已跳到下一首" : ""}`, {
    tone: "error",
    duration: 5000,
  });

  if (!willSkip) {
    // 不跳的三种情况：暂停中点的坏歌 / 播完即停 / 单曲循环。
    // 都就地停下，只是前一种本来就该停着。
    if (state.playing) {
      state.playing = false;
      commit();
    }
    return;
  }

  playNext(true);
}

/** 装载成功时清零连败计数（坏文件之间夹着能播的歌就不该熔断） */
function noteLoadSucceeded() {
  consecutiveFailures = 0;
  failedSongId = null;
}

/**
 * 把一首「放不出来」的歌报给后端登记。
 *
 * 后端会把条目写进配置（重启后仍在）并把这首歌从曲库摘掉，
 * 前端这边同步把它从内存列表里去掉 —— 否则列表里还留着，
 * 用户再点一次又是同样的失败。
 *
 * 失败不影响主流程：这只是「记账」，记不上也不该干扰播放。
 */
function reportUnplayable(song, reason) {
  if (!isWails() || !song?.id) return;
  // 在线曲目不上报：它不是磁盘上的文件，失败原因通常是网络（限流/无版权/
  // 临时抽风）。上报会让它被当成「坏文件」永久拉黑，还会在设置里的
  // 「放不出来」清单中堆出一条指向不存在的文件的记录。
  // 后端 services_unplayable.go#Report 也有同样的拦截，这里是第一道。
  if (song.online) return;
  try {
    backend
      .unplayableReport(song.id, String(reason || ""), song.path || "")
      .then(() => {
        // 从内存曲库里摘掉（后端已经摘了，这里保持两边一致）
        removeSongFromLibrary(song.id);
      })
      .catch((err) => {
        console.warn("[audio] 登记「放不出来」失败（不影响播放）", err);
      });
  } catch (err) {
    console.warn("[audio] 登记「放不出来」失败（不影响播放）", err);
  }
}

/**
 * 放开「这首歌已判定放不出来」的闸门。
 *
 * 用户**主动**点播一首歌时必须调它：可能是修好了文件、换了外置盘、
 * 或者上次的失败只是一次偶发的 IO 抖动。不放开的话这首歌会被永久拉黑，
 * 表现成「点了完全没反应」——那是比弹提示更糟的体验。
 *
 * 自动跳转链路（playNext / player:ended）**不**调它：那正是要避免的
 * 「坏文件被反复重试」。
 *
 * 调用时机由 store 的 playSong 经 setUserPlayProbe 注入，避免 store → audio
 * 的反向 import（store 是底层模块，见上方 setRealAudioProbe 的说明）。
 */
export function resetFailureGate(songId) {
  if (!songId || songId === failedSongId) {
    failedSongId = null;
    consecutiveFailures = 0;
  }
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
      await unloadCurrent();
    }
    return;
  }

  if (loadedFor !== song.id) {
    // 已经确认放不出来的歌不再重试。
    //
    // runtime 的依赖键每 250ms 可能变一次（位置在走），每个 tick 都会走到
    // 这里。若不拦住，坏文件会被反复送进 playerLoad（每次都要等一次转码
    // 失败，几秒到几分钟不等），而且每次失败都再弹一条提示。
    // failedSongId 只在用户主动点播这首歌时才会被清掉（见 resetFailureGate）。
    if (song.id === failedSongId) return;
    await loadSong(song);
    return;
  }

  // 同一首歌：把播放/暂停意图同步给后端（幂等，后端自己判重）
  syncPlayState();
}

/**
 * 停止当前播放（清空队列 / 停止时走这里）。
 *
 * 顺序是刻意的：**先**让后端停下来，**再**清本地的记账。
 *
 * 反过来（先清空再调用）会留下一个真实的安全洞：switchPending 被置上之后，
 * 下一次 syncAudio 会因为 loadedFor === null 而**直接返回、根本不调
 * playerUnload**（那段判定的目的正是「已经卸载过就别重复卸载」）。
 * 于是引擎还在出声，界面却显示已停止。写状态与卸载必须成对出现，
 * 不能依赖一个「之后一定会再跑一次」的同步。
 */
async function unloadCurrent() {
  switchPending = false;
  loadedFor = null;
  backendSongId = null;
  anchor = null;
  lastPushedPosition = -1;
  try {
    await backend.playerUnload();
  } catch {
    /* 卸载失败不影响后续装载 */
  }
}

/** 装载一首歌并起播 */
async function loadSong(song) {
  loadedFor = song.id;
  const seq = ++requestSeq;
  anchor = null;
  lastPushedPosition = -1;

  // ★★★ 从这一行开始，界面不再显示任何旧位置（见 switchPending 的说明）。
  //
  // 置位要**早**于下面那次 await：pushLoudnessToBackend 是一次 IPC 往返，
  // 在它返回之前旧歌的锚点完全可能先到（后端 tick 是 200ms 一次），
  // 那个锚点会把进度条拽回旧位置。
  switchPending = true;

  // ★ 手动切歌是即时意图：先取消后端可能还挂着的「切歌间隔」。
  //
  // 不管它，用户会看到「下一首要过一会儿才被播放」：引擎在间隔中只输出静音
  // 且不读缓冲、不推进位置（见 audioplay.Engine.onData 的间隔分支），
  // 于是新歌即便几毫秒就装载好了，也要等**剩下的**间隔走完才出声
  //（默认间隔就是 1.5 秒，而且那期间听不到任何东西）。
  //
  // 后端的 Load 与 Play 各自也会取消间隔，所以这一发不是唯一的一道 ——
  // 它只是把「用户意图 → 出声」的窗口压到最短。
  try {
    await backend.playerCancelGap();
  } catch {
    /* 后端没这个接口（旧版本）时忽略：Load 里还有一道 */
  }
  // 取消间隔是异步的：这期间可能又切了一次歌。这时别再往下走 ——
  // 否则两次 playerLoad 会并发压在同一个解析/转码上，白白多跑一遍。
  if (seq !== requestSeq) return;

  // 换歌期间先把响度补偿压到 0 dB（不抬升也不压低）。
  //
  // 为什么必须做这一步：playerLoad 是异步的，而**后端此刻仍在放上一首**，
  // 它的环形缓冲里还积压着约 3 秒的音频，会继续吐给声卡。如果这时链路
  // 上还留着上一首的补偿（比如上一首很响、被压了 −8 dB），那么当下面
  // 装载完成、我们把新歌的补偿推下去时，缓冲里那一段**旧歌**的电平就会
  // 从一个已经"过期"的增益跳到另一个，听感上就是「切歌瞬间上一首突然变响」。
  //
  // 更糟的是新歌还没测量时增益是 0：旧歌的 −8 dB 会被直接冲成 0，
  // 旧歌尾部以原始电平放出来 —— 正是用户报的那个现象，也解释了为什么
  // 它不是每次都触发（只有上一首确实被明显压低、且尾部还在缓冲里时才听得见）。
  //
  // 先压到 0 相当于一个「安全的中间态」：旧歌尾巴不再被错误增益修饰，
  // 新歌起播后再立刻套上它自己的补偿（见下面装载完成后的那一次推送）。
  //
  // 去重键也要一起清掉：紧接着的 applyGainForSong（每 tick 都跑）会按
  // 新歌重新算值，若不清它就可能因为"看起来没变"而跳过推送。
  lastAppliedGain = null;
  await pushLoudnessToBackend(null);

  try {
    const res = await backend.playerLoad(song.id);
    if (seq !== requestSeq) return; // 期间又切歌了

    // 这首歌装载成功：连败计数清零，失败闸门也放开
    // （否则「坏歌 A、好歌 B、坏歌 A」这种顺序里 A 会被永久拉黑）
    noteLoadSucceeded();

    // 到这一步后端才真正换成了这首歌，增益的归属也随之切换
    backendSongId = song.id;

    // 装载完成：后端返回准确的时长与起始位置。
    //
    // ★ 时长是**整首歌**，起播位置可能不是 0。
    //
    // 开了「跳过开头静音」时，后端会把起播点自动挪到出声处 ——
    // 于是下面的 playerState() 拿到的 positionMs 会是「3 秒」这类值，
    // 而 durationMs 仍是整首歌。这是**预期行为**（不是位置错乱）：
    // 进度条与歌词都留在原曲时间轴上，只是开头那几秒不会被播放。
    //
    // 这里刻意**不**把位置强行归零：那会让歌词与进度条整体提前
    // （前端显示的位置与后端音频的实际位置对不上）。
    if (res?.durationMs > 0) state.duration = res.durationMs;

    // 记下这次实际跳过了多少（设置界面展示 + 排查「开头怎么直接是音乐」）。
    // 后端在**没跳过**时返回 0 而不是省略字段，所以这里能区分
    // 「确认没跳过」与「后端没告诉我」。
    lastSkip = {
      headMs: Number(res?.skippedHeadMs) || 0,
      tailMs: Number(res?.skippedTailMs) || 0,
    };

    // 恢复上次的播放位置（仅启动时那一首）
    const resumeMs = consumeResumeSeek(song);
    if (resumeMs > 0) {
      await backend.playerSeek(resumeMs);
    }

    // 套用音量与响度补偿，再起播。
    // 注意顺序：先响度后音量 —— 两者在后端是相乘合成的一个增益，
    // 补偿必须在起播前就位，否则新歌的头几十毫秒会以 0 dB 露出来。
    await pushLoudnessToBackend(song.id);
    await pushVolumeToBackend();
    // 记下"已经推下去的值"，让随后的 applyGainForSong 不再重复推一遍
    lastAppliedGain = backendGain();

    // ★ 按需测量。以前这里**没有**这一步，于是走引擎链路的曲目（也就是
    // 现在的常态路径，含全部在线试听）只可能在别处被顺手测过 —— 结果是
    // 「响度均衡对在线试听不生效」。
    //
    // 为什么不 await：测量要跑一次 ffmpeg（几百毫秒到数秒），await 会把
    // 起播一起拖住。补偿在测出来之后由 setGain 即时套上（它会走
    // applyGainForSong 推送），所以「先以 0 dB 起播、几百毫秒后落到正确
    // 电平」是这里刻意接受的取舍 —— 换来的是起播不被测量阻塞。
    requestLoudness(song.id);

    if (state.playing) {
      await backend.playerPlay();
    }
    // 立刻拉一次状态：不等下一个锚点，避免刚切歌时进度条停在旧位置。
    //
    // ★ 顺序要紧：必须**先**解除 switchPending 再 applyAnchor，否则这条
    // 新歌的锚点会被 applyAnchor 自己的「切歌途中」判定丢掉。
    // 这也是整条链路上唯一一次解除 —— 位置从这一刻起才允许再写进 store。
    const st = await backend.playerState();
    if (seq !== requestSeq) return; // 期间又切歌了：新歌的这条状态已经过期
    switchPending = false;
    if (st) applyAnchor(st);
  } catch (err) {
    if (seq !== requestSeq) return;
    // 装载失败（转码失败 / 文件损坏 / 取不到地址）走统一处理：
    // 提示一条并自动跳到下一首。这里**不再**自己 toast —— 那条提示由
    // handlePlaybackFailure 统一发，顺便把去重与熔断一起做了。
    loadedFor = null;
    backendSongId = null;
    // 失败也要收尾：handlePlaybackFailure 会接着 playNext(true)，
    // 那会立刻再进一次 loadSong 并重新置位。但熔断（连续失败就停下）与
    // 「暂停中点了首坏歌」这两种情况不会再装载 —— 留在置位状态会让
    // 界面永远冻结在「加载中」。
    switchPending = false;
    handlePlaybackFailure(song.id, err?.message ?? "装载失败", "load");
  }
}

/**
 * 当前是否正处于「切歌中」（新歌还没装载完成）。
 *
 * 给界面用：切歌期间进度条不显示（此刻既没有可信的位置，也没有可信的时长，
 * 画出来的任何一帧都是错的）。它只是**展示**用的判定，不参与任何播放决策。
 */
export function switchingTrack() {
  return switchPending;
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
  const gainDB = gainDBFor(state.currentId);
  const linear = 10 ** (gainDB / 20);
  const volume = state.muted ? 0 : state.volume;
  return volume * linear;
}

/**
 * 后端链路上**此刻实际**该有的线性增益（按后端装载的那首歌算）。
 *
 * 与 currentGain 的区别只在于用哪首歌查补偿表：UI 显示要用「用户认为的
 * 当前歌」（currentGain），而给后端推值必须用「后端真正在放的那首」
 * （本函数）。切歌那几百毫秒里两者不同，混用就会把新歌的补偿安到旧歌头上。
 */
function backendGain() {
  const gainDB = gainDBFor(backendSongId);
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

/**
 * 这首歌当前该用多少 dB 补偿。
 *
 * 表里没有这首歌时返回 0（不补偿），而不是沿用上一首的值 ——
 * 「查不到」的语义是「还没测」，此时唯一安全的做法是不抬升也不压低。
 */
function gainDBFor(songId) {
  const mode = state.config.loudnessMode || "off";
  if (mode === "off" || !songId) return 0;
  const g = state.loudnessGains?.[songId];
  return Number.isFinite(g) ? g : 0;
}

/**
 * 把**指定的**这首歌的响度补偿推给后端（后端负责与用户音量相乘）。
 *
 * songId 显式传入，而不是在里面读 state.currentId：切歌过程中
 * 「前端认为的当前歌」与「后端真正装载的歌」会短暂不一致，补偿必须按
 * 后者推，否则会张冠李戴（详见 loadSong 与下面的长注释）。
 */
async function pushLoudnessToBackend(songId) {
  const gainDB = gainDBFor(songId);
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
  // 去重键用的是「后端实际该有的增益」（backendGain），而不是 UI 上的
  // currentGain：切歌期间后者已经指向新歌，若拿它去重，会出现
  // 「算出来一样 → 直接 return」而把新歌的补偿漏推给后端的情况。
  const value = backendGain();
  if (value === lastAppliedGain) return;
  lastAppliedGain = value;
  pushVolumeToBackend();
  // 这里推的是**后端已装载的那首**的补偿。切歌途中 loadedFor 已经指向新歌、
  // 但 playerLoad 还没返回，此刻后端仍在放旧歌 —— 推新歌的补偿就会让旧歌
  // 的尾巴以错误电平出声（loadSong 里会先把增益压到 0 兜住这个窗口）。
  pushLoudnessToBackend(backendSongId);
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

/* --------------------------------------------------------------------------
   响度补偿（与后端响度服务对接，逻辑未变）
   -------------------------------------------------------------------------- */

/** 正在进行的按需测量：同一首歌被反复触发时合并成一次 */
const pendingMeasure = new Map();

export async function requestLoudness(songId) {
  const mode = state.config.loudnessMode || "off";
  if (mode === "off" || !isWails() || !songId) return;
  if (state.loudnessGains?.[songId] !== undefined) {
    // 已有补偿：直接推给后端。
    //
    // 但**只有当后端装载的正是这首歌**时才推 —— 否则会把新歌的补偿安到
    // 当前还在出声的旧歌头上。切歌途中新歌的补偿由 loadSong 在装载完成后
    // 统一套用（它知道确切的时序），这里只负责"同一首歌内"的更新。
    if (backendReady && backendSongId === songId) pushLoudnessToBackend(songId);
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

/**
 * 把一首歌测出来的补偿记账，并在「后端正在放这首歌」时立刻套用。
 *
 * 判定条件是 backendSongId（后端真正装载的歌）而**不是** state.currentId：
 * 用户点了切歌之后、playerLoad 返回之前，两者会不一致（state.currentId 已是
 * 新歌，后端还在放旧歌）。这时若按 currentId 判断，就会把新歌的补偿推给
 * 仍在出声的旧歌 —— 与 loadSong 里那个"尾部突然变响"是同一类错误。
 *
 * 补偿只写进表里（供切歌时查表）也不会丢：loadSong 装载完成后会重新推一次。
 */
function setGain(songId, gainDB) {
  if (!state.loudnessGains) state.loudnessGains = {};
  state.loudnessGains[songId] = gainDB;
  if (songId === backendSongId) {
    if (backendReady) {
      // 走 applyGainForSong 而不是直接推：它顺手维护 lastAppliedGain
      // 这个去重键，绕过它会让后续 tick 误判"已经推过了"而漏掉这次更新。
      // 它内部按 backendGain 重算，此处 songId 已确认等于 backendSongId，
      // 所以推下去的一定是刚记下的这个值。
      applyGainForSong();
    } else {
      applyVolumeLegacy();
    }
  }
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
    // 刚换源后的短暂错误是换源过程中的噪声（旧 src 被中断），不是真的放不了。
    // 但它必须被**吞掉**而不是放过去 —— 放过去会让 handlePlaybackFailure
    // 把这首歌拉黑，而它其实马上就能播。
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
    // 与后端链路同一套处理：提示一条 + 自动下一首（不再自己 toast）
    handlePlaybackFailure(song.id, reason, "legacy");
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
    // 已判定放不出来的歌不再重设 src：否则每次 error → 下一 tick 又重新装载
    // → 再 error，既刷提示也反复起 HTTP 请求（与后端链路的闸门同一目的）。
    if (song.id === failedSongId) return;
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
      loadedFor = null;
      handlePlaybackFailure(song.id, err?.message ?? "取播放地址失败", "legacy-url");
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
    // 在线曲目同样要请求响度补偿 —— 它以前在这里被 `if (!song.online)`
    // 排除掉，而那只是「后端查不到在线曲目」的症状回避：真正的修法是让
    // 后端能解析到它（见 services.go#songByID 的虚拟表兜底）。
    requestLoudness(song.id);
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
