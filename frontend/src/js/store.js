/* ==========================================================================
   store.js — 应用状态 + 过滤引擎 + 持久化
   --------------------------------------------------------------------------
   设计原则：
     · state 只存「数据」，不存 DOM；
     · 所有变更走 commit()，UI 通过 subscribe() 重绘；
     · 持久化只落 localStorage 中真正需要跨启动保留的部分。
   ========================================================================== */

import { MOCK_FOLDERS, MOCK_FILTER_RULES, MOCK_PLAYLISTS, MOCK_SONGS } from "./mock.js";
import { moveItem, uid, uniq } from "./utils.js";
import { backend, connect, emit, isWails, on } from "./bridge.js";

const LS_KEY = "music-player.state.v1";

/** 播放模式 */
export const PLAY_MODES = ["sequence", "loop-all", "loop-one", "shuffle"];

const DEFAULT_CONFIG = {
  theme: "dark-minimal", // 主题 id（= themes/ 下的文件名）
  themeMode: "dark", // dark | light | system
  glassBlur: 22,
  glassBlurCustom: false, // 用户是否手动调整过毛玻璃强度（true 才覆盖主题令牌）
  glassAlpha: 62,
  animations: true,
  sidebarWidth: 232,
  accentFromCover: false,
  showAlbumColumn: true,
  showLyrics: true,
  playMode: "sequence",
  volume: 0.8,
  muted: false,
  autoScanOnStart: true,
  watchFolders: true,
  playerViewMode: "classic", // classic | immersive | minimal
  lyricsSources: ["lrc-file", "embedded", "online"],
  lyricsFontSize: 16,
  lyricsLines: 7,
  cacheDir: "%APPDATA%\\MusicPlayer\\cache",
  scanConcurrency: 4,

  /* 响度均衡（LUFS 补偿） */
  loudnessMode: "off", // off | track（逐曲） | album（同专辑统一）
  loudnessTarget: -16, // 目标整合响度 LUFS（-16 接近流媒体常用值）
  loudnessLimit: true, // 真峰值保护，避免抬升后削波
};

function initialState() {
  return {
    /* 数据 */
    songs: [],
    folders: [],
    playlists: [],
    filterRules: [],
    allSongsRaw: [],
    lastScan: null,
    scanning: false,

    /* 界面 */
    view: "library", // library | queue | playlist | settings
    playlistId: null,
    playerOpen: false,
    pvMode: "classic",
    query: "",
    sortKey: "addedAt",
    sortDir: "desc",
    density: "comfortable",

    /* 播放 */
    queue: [],
    queueOrigin: null, // { type:'library'|'playlist', id }
    currentId: null,
    playing: false,
    position: 0,
    duration: 0,
    playMode: "sequence",
    volume: 0.8,
    muted: false,
    shuffleOrder: [],

    /* 响度均衡：songId → 补偿增益(dB)，由后端测量结果算出 */
    loudnessGains: {},
    loudnessState: null, // 后端响度能力/进度快照

    /* 配置 */
    config: { ...DEFAULT_CONFIG },

    /* 派生 */
    visibleSongs: [],
    likedIds: new Set(),
  };
}

export const state = initialState();

/* --------------------------------------------------------------------------
   订阅
   -------------------------------------------------------------------------- */
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let frame = null;

/** 只通知订阅者（用于高频、无需重算与持久化的更新，如播放进度） */
export function notify() {
  for (const fn of listeners) fn(state);
}

export function commit(mutator, options = {}) {
  if (typeof mutator === "function") mutator(state);
  recalcVisible();
  if (options.persist !== false) persist();
  if (options.immediate) {
    notify();
    return;
  }
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    notify();
  });
}

/* --------------------------------------------------------------------------
   过滤引擎（对应需求 A3 / A4）
   -------------------------------------------------------------------------- */
const SIZE_OPS = {
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  eq: (a, b) => a === b,
};

function normalizeSize(value, unit) {
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  switch ((unit || "B").toUpperCase()) {
    case "KB":
      return n * 1024;
    case "MB":
      return n * 1024 * 1024;
    case "GB":
      return n * 1024 * 1024 * 1024;
    default:
      return n;
  }
}

/** 编译用户输入的正则；非法时返回 null（界面提示错误，不崩溃） */
export function compileRegex(pattern, flags = "i") {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * 判断单个文件是否被规则过滤掉。
 * 语义：
 *   scope = "exclude" → 命中该规则的**排除**（不需要）
 *   scope = "include" → 只有命中至少一条 include 规则的才保留（include 为空时全部通过）
 *   exclude 优先于 include。
 * 返回值：{ excluded: boolean, reason: string|null }
 */
export function matchRules(song, rules) {
  const active = (rules || []).filter((r) => r.enabled);
  if (!active.length) return { excluded: false, reason: null };

  // 只要存在启用中的 include 规则，就必须参与「至少命中一条」的判定，
  // 因此 hasInclude 在看规则时无条件置位（与 Go 侧 filter.Match 保持一致）
  const hasInclude = active.some((r) => r.scope === "include");
  let hitInclude = false;

  for (const rule of active) {
    let hit = false;

    if (rule.type === "size") {
      const bytes = normalizeSize(rule.value, rule.unit);
      if (!Number.isFinite(bytes)) continue;
      const fn = SIZE_OPS[rule.op] || SIZE_OPS.lt;
      hit = fn(song.size, bytes);
    } else if (rule.type === "regex") {
      const re = compileRegex(rule.value);
      if (!re) continue;
      hit = re.test(song.path) || re.test(`${song.title}.${song.ext}`);
    }

    if (!hit) continue;

    if (rule.scope === "include") {
      hitInclude = true;
      continue;
    }
    // 排除优先：命中即短路
    return { excluded: true, reason: rule.id };
  }

  if (hasInclude && !hitInclude) {
    return { excluded: true, reason: "include-miss" };
  }
  return { excluded: false, reason: null };
}

/** 应用全部规则，返回可用歌曲与统计（供设置页「预览」使用） */
export function applyRules(songs, rules) {
  const kept = [];
  let excluded = 0;
  for (const s of songs) {
    const r = matchRules(s, rules);
    if (r.excluded) excluded += 1;
    else kept.push(s);
  }
  return { kept, excluded, total: songs.length };
}

/* --------------------------------------------------------------------------
   排序 / 过滤 / 派生
   -------------------------------------------------------------------------- */
const SORTERS = {
  title: (a, b) => String(a.title).localeCompare(String(b.title), "zh-Hans-CN"),
  artist: (a, b) => String(a.artist).localeCompare(String(b.artist), "zh-Hans-CN"),
  album: (a, b) => String(a.album).localeCompare(String(b.album), "zh-Hans-CN"),
  duration: (a, b) => a.duration - b.duration,
  size: (a, b) => a.size - b.size,
  ext: (a, b) => String(a.ext).localeCompare(String(b.ext)),
  playCount: (a, b) => b.playCount - a.playCount,
  addedAt: (a, b) => b.addedAt - a.addedAt,
};

function currentSongList() {
  const { view, playlistId, playlists, queue, songs } = state;
  const byId = new Map(songs.map((s) => [s.id, s]));
  if (view === "queue") {
    return queue.map((id) => byId.get(id)).filter(Boolean);
  }
  if (view === "playlist" && playlistId) {
    const pl = playlists.find((p) => p.id === playlistId);
    return (pl?.songIds || []).map((id) => byId.get(id)).filter(Boolean);
  }
  return songs;
}

function recalcVisible() {
  const list = currentSongList();
  const q = state.query.trim().toLowerCase();
  let out = list;

  if (q) {
    out = out.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q) ||
        s.ext.toLowerCase().includes(q)
    );
  }

  if (state.sortKey && SORTERS[state.sortKey]) {
    const cmp = SORTERS[state.sortKey];
    const dir = state.sortDir === "desc" ? -1 : 1;
    out = out.slice().sort((a, b) => cmp(a, b) * dir);
  }

  state.visibleSongs = out;
}

/** 当前视图的播放上下文（用于「播放全部」与队列来源） */
export function currentContext() {
  if (state.view === "queue") return { type: "queue", id: null };
  if (state.view === "playlist" && state.playlistId) {
    return { type: "playlist", id: state.playlistId };
  }
  return { type: "library", id: null };
}

/* --------------------------------------------------------------------------
   歌单 / 我喜欢
   -------------------------------------------------------------------------- */
export function playlistById(id) {
  return state.playlists.find((p) => p.id === id) || null;
}

export const LIKED_ID = "liked";

export function isLiked(songId) {
  return state.likedIds.has(songId);
}

export function toggleLike(songId) {
  const liked = playlistById(LIKED_ID);
  const set = new Set(state.likedIds);
  if (set.has(songId)) set.delete(songId);
  else set.add(songId);
  state.likedIds = set;
  if (liked) {
    liked.songIds = set.has(songId)
      ? uniq([...liked.songIds, songId])
      : liked.songIds.filter((id) => id !== songId);
  }
  commit();
  if (isWails()) backend.toggleLike(songId);
}

export function createPlaylist(name) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  const pl = {
    id: uid("pl"),
    name: clean,
    locked: false,
    builtin: false,
    songIds: [],
    createdAt: Date.now(),
  };
  state.playlists = [...state.playlists, pl];
  commit();
  if (isWails()) backend.createPlaylist(clean);
  return pl;
}

export function renamePlaylist(id, name) {
  const pl = playlistById(id);
  if (!pl || pl.locked) return false;
  const clean = String(name || "").trim();
  if (!clean) return false;
  pl.name = clean;
  commit();
  if (isWails()) backend.renamePlaylist(id, clean);
  return true;
}

export function deletePlaylist(id) {
  const pl = playlistById(id);
  if (!pl || pl.locked) return false;
  state.playlists = state.playlists.filter((p) => p.id !== id);
  if (state.playlistId === id) {
    state.view = "library";
    state.playlistId = null;
  }
  commit();
  if (isWails()) backend.deletePlaylist(id);
  return true;
}

export function addSongsToPlaylist(id, songIds) {
  const pl = playlistById(id);
  if (!pl) return 0;
  const before = pl.songIds.length;
  pl.songIds = uniq([...pl.songIds, ...songIds]);
  if (id === LIKED_ID) state.likedIds = new Set(pl.songIds);
  commit();
  if (isWails()) backend.addSongsToPlaylist(id, songIds);
  return pl.songIds.length - before;
}

export function removeSongsFromPlaylist(id, songIds) {
  const pl = playlistById(id);
  if (!pl) return 0;
  const drop = new Set(songIds);
  const before = pl.songIds.length;
  pl.songIds = pl.songIds.filter((x) => !drop.has(x));
  if (id === LIKED_ID) state.likedIds = new Set(pl.songIds);
  commit();
  if (isWails()) backend.removeSongsFromPlaylist(id, songIds);
  return before - pl.songIds.length;
}

/**
 * 调整歌单在侧边栏中的顺序（from/to 为自定义歌单索引）
 * 「我喜欢」永远固定在第一位，不可移动、不可删除。
 */
export function movePlaylist(from, to) {
  const custom = state.playlists.filter((p) => p.id !== LIKED_ID);
  if (from < 0 || from >= custom.length) return;
  const next = moveItem(custom, from, to);
  const liked = playlistById(LIKED_ID);
  state.playlists = [liked, ...next].filter(Boolean);
  commit();
}

/* --------------------------------------------------------------------------
   播放队列（需求 B3 / B4 / B5）
   -------------------------------------------------------------------------- */
export function setQueue(songIds, origin = null) {
  state.queue = songIds.slice();
  state.queueOrigin = origin;
  commit();
}

export function appendToQueue(songIds) {
  state.queue = uniq([...state.queue, ...songIds]);
  commit();
}

export function addNextInQueue(songId) {
  const rest = state.queue.filter((id) => id !== songId);
  const at = state.currentId ? rest.indexOf(state.currentId) : -1;
  const next = rest.slice();
  next.splice(at + 1, 0, songId);
  state.queue = next;
  commit();
}

export function removeFromQueue(songId) {
  state.queue = state.queue.filter((id) => id !== songId);
  if (state.currentId === songId) {
    const i = state.queue.indexOf(songId);
    state.currentId = state.queue[Math.min(i, state.queue.length - 1)] ?? null;
  }
  commit();
}

export function reorderQueue(from, to) {
  state.queue = moveItem(state.queue, from, to);
  commit();
  if (isWails() && state.queueOrigin?.id) {
    backend.reorderPlaylist(state.queueOrigin.id, from, to);
  }
}

export function clearQueue() {
  state.queue = [];
  state.currentId = null;
  state.playing = false;
  state.position = 0;
  commit();
}

/* --------------------------------------------------------------------------
   播放控制（真实解码由 Go/Wails 侧完成，这里只维护状态）
   -------------------------------------------------------------------------- */
export function songById(id) {
  return state.songs.find((s) => s.id === id) || null;
}

export function currentSong() {
  return songById(state.currentId);
}

export function playSong(songId, options = {}) {
  const song = songById(songId);
  if (!song) return;
  if (options.queue && options.queue.length) {
    state.queue = options.queue.slice();
    state.queueOrigin = options.origin ?? null;
  } else if (!state.queue.includes(songId)) {
    state.queue = uniq([...state.queue, songId]);
  }
  state.currentId = songId;
  state.position = 0;
  state.duration = song.duration || 0;
  state.playing = true;
  commit();
  emit("player:play", { songId });
}

export function playContext(songIds, startIndex = 0, origin = null) {
  if (!songIds.length) return;
  state.queue = songIds.slice();
  state.queueOrigin = origin;
  playSong(songIds[startIndex], { queue: songIds, origin });
}

export function togglePlay() {
  if (!state.currentId) {
    if (state.visibleSongs.length) playContext(state.visibleSongs.map((s) => s.id), 0, currentContext());
    return;
  }
  state.playing = !state.playing;
  commit();
  emit(state.playing ? "player:play" : "player:pause", { songId: state.currentId });
}

export function nextIndex(step = 1) {
  const { queue, currentId, playMode } = state;
  if (!queue.length) return -1;
  const i = queue.indexOf(currentId);
  if (i < 0) return 0;
  if (playMode === "shuffle") {
    if (queue.length === 1) return i;
    let n = i;
    while (n === i) n = Math.floor(Math.random() * queue.length);
    return n;
  }
  if (playMode === "sequence" && i + step >= queue.length) return -1;
  return (i + step + queue.length) % queue.length;
}

export function playNext(auto = false) {
  const i = nextIndex(1);
  if (i < 0) {
    if (auto) {
      state.playing = false;
      state.position = 0;
      commit();
    }
    return;
  }
  playSong(state.queue[i]);
}

export function playPrev() {
  const i = nextIndex(-1);
  if (i < 0) return;
  playSong(state.queue[i]);
}

export function seek(ms) {
  state.position = Math.max(0, Math.min(ms, state.duration || 0));
  commit();
  emit("player:seek", { ms });
}

export function setVolume(v) {
  state.volume = Math.max(0, Math.min(1, v));
  state.muted = state.volume === 0;
  state.config.volume = state.volume;
  state.config.muted = state.muted;
  commit();
  emit("player:volume", { volume: state.volume, muted: state.muted });
}

export function toggleMute() {
  state.muted = !state.muted;
  commit();
  emit("player:volume", { volume: state.volume, muted: state.muted });
}

export function cyclePlayMode() {
  const i = PLAY_MODES.indexOf(state.playMode);
  state.playMode = PLAY_MODES[(i + 1) % PLAY_MODES.length];
  state.config.playMode = state.playMode;
  commit();
}

/* --------------------------------------------------------------------------
   播放进度模拟（仅浏览器预览使用）
   接上真实音频后（<audio id="audio-engine"> 已在播放），进度由 <audio> 的
   timeupdate 事件驱动，这里的模拟时钟自动让位，避免两个来源互相打架。
   -------------------------------------------------------------------------- */
let tickTimer = null;

/** 是否已有真实音频在驱动进度 */
function audioEngineActive() {
  const node = document.getElementById("audio-engine");
  return Boolean(node && node.src);
}

export function startMockTicker() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    if (!state.playing || !state.currentId) return;
    if (audioEngineActive()) return; // 真实播放中，交给 <audio> 事件
    state.position += 250;
    if (state.position >= state.duration) {
      if (state.playMode === "loop-one") {
        state.position = 0;
      } else {
        playNext(true);
        return;
      }
    }
    // 进度高频刷新：不重算列表、不写存储，只通知订阅者
    notify();
  }, 250);
}

export function stopMockTicker() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

/* --------------------------------------------------------------------------
   数据装载 / 扫描
   -------------------------------------------------------------------------- */
function seedFromMock() {
  state.allSongsRaw = MOCK_SONGS.slice();
  state.folders = MOCK_FOLDERS.slice();
  state.filterRules = MOCK_FILTER_RULES.slice();
  state.playlists = MOCK_PLAYLISTS.map((p) => ({ ...p, songIds: p.songIds.slice() }));
  state.likedIds = new Set(playlistById(LIKED_ID)?.songIds || []);
  const { kept, excluded } = applyRules(state.allSongsRaw, state.filterRules);
  state.songs = kept;
  state.lastScan = {
    at: Date.now(),
    found: state.allSongsRaw.length,
    kept: kept.length,
    excluded,
    added: 0,
    removed: 0,
  };
  const byId = new Map(state.songs.map((s) => [s.id, s]));
  state.queue = state.songs.slice(0, 5).map((s) => s.id);
  state.currentId = state.songs[0]?.id ?? null;
  state.duration = byId.get(state.currentId)?.duration ?? 0;
  state.position = 0;
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persist() {
  try {
    const snap = {
      config: state.config,
      view: state.view,
      playlistId: state.playlistId,
      pvMode: state.pvMode,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      density: state.density,
      playMode: state.playMode,
      volume: state.volume,
      muted: state.muted,
      queue: state.queue,
      currentId: state.currentId,
      filterRules: state.filterRules,
      folders: state.folders,
      userPlaylists: state.playlists.filter((p) => !p.builtin),
      liked: [...state.likedIds],
    };
    localStorage.setItem(LS_KEY, JSON.stringify(snap));
  } catch {
    /* 忽略配额错误 */
  }
  scheduleConfigSync();
}

/* --------------------------------------------------------------------------
   配置同步到 Go 后端
   --------------------------------------------------------------------------
   后端是配置的唯一真源（%APPDATA%\MusicPlayer\config.json）；
   localStorage 只在浏览器预览时兜底。
   -------------------------------------------------------------------------- */
const SYNCED_KEYS = [
  "theme",
  "themeMode",
  "glassBlur",
  "glassAlpha",
  "animations",
  "accentFromCover",
  "showAlbumColumn",
  "showLyrics",
  "playMode",
  "volume",
  "muted",
  "playerViewMode",
  "autoScanOnStart",
  "watchFolders",
  "scanConcurrency",
  "lyricsFontSize",
  "lyricsLines",
  "lyricsSources",
  "cacheDir",
  "loudnessMode",
  "loudnessTarget",
  "loudnessLimit",
];

let syncTimer = null;

function scheduleConfigSync() {
  if (!isWails()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(flushConfigSync, 400);
}

/** 立即把需要落盘的配置推给后端 */
export async function flushConfigSync() {
  if (!isWails()) return;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  const patch = {};
  for (const key of SYNCED_KEYS) {
    if (key in state.config) patch[key] = state.config[key];
  }
  patch.playMode = state.playMode;
  patch.volume = state.volume;
  patch.muted = state.muted;
  try {
    await backend.setConfig(patch);
  } catch (err) {
    console.warn("[store] 配置写入后端失败", err);
  }
}

function applyPersisted(saved) {
  if (!saved) return;
  Object.assign(state.config, saved.config || {});
  state.view = saved.view || state.view;
  state.playlistId = saved.playlistId ?? null;
  state.pvMode = saved.pvMode || state.pvMode;
  state.sortKey = saved.sortKey || state.sortKey;
  state.sortDir = saved.sortDir || state.sortDir;
  state.density = saved.density || state.density;
  state.playMode = saved.playMode || state.playMode;
  state.volume = typeof saved.volume === "number" ? saved.volume : state.volume;
  state.muted = Boolean(saved.muted);
  if (Array.isArray(saved.filterRules) && saved.filterRules.length) {
    state.filterRules = saved.filterRules;
  }
  if (Array.isArray(saved.folders) && saved.folders.length) {
    state.folders = saved.folders;
  }
  if (Array.isArray(saved.userPlaylists)) {
    const liked = state.playlists.find((p) => p.id === LIKED_ID);
    state.playlists = [liked, ...saved.userPlaylists].filter(Boolean);
  }
  if (Array.isArray(saved.liked)) {
    const liked = playlistById(LIKED_ID);
    if (liked) liked.songIds = saved.liked.slice();
    state.likedIds = new Set(saved.liked);
  }
  if (Array.isArray(saved.queue) && saved.queue.length) {
    state.queue = saved.queue.filter((id) => state.songs.some((s) => s.id === id));
  }
  if (saved.currentId && state.songs.some((s) => s.id === saved.currentId)) {
    state.currentId = saved.currentId;
    state.duration = songById(saved.currentId)?.duration ?? 0;
  }
}

/**
 * 连接 Go 后端（若存在）并把真实数据灌进 state。
 * 浏览器预览下 connect() 会失败，直接返回 false，界面继续用假数据。
 */
export async function hydrateFromBackend() {
  const ok = await connect();
  if (!ok) return false;

  const [songs, folders, cfg, playlists] = await Promise.all([
    backend.songs(),
    backend.folders(),
    backend.getConfig(),
    backend.playlists(),
  ]);

  if (Array.isArray(songs)) {
    state.allSongsRaw = songs;
    state.songs = songs;
    state.likedIds = new Set(cfg?.likedIds || []);
    state.lastScan = {
      at: Date.now(),
      found: songs.length,
      kept: songs.length,
      excluded: 0,
      added: 0,
      removed: 0,
    };
  }
  if (Array.isArray(folders)) state.folders = folders;
  if (cfg) {
    // 后端配置为准（后端是唯一真源），视图类临时状态不受影响
    Object.assign(state.config, cfg);
    state.playMode = cfg.playMode || state.playMode;
    state.volume = typeof cfg.volume === "number" ? cfg.volume : state.volume;
    state.muted = Boolean(cfg.muted);
    if (Array.isArray(cfg.filterRules) && cfg.filterRules.length) state.filterRules = cfg.filterRules;
  }
  if (Array.isArray(playlists) && playlists.length) {
    state.playlists = playlists.map((p) => ({
      id: p.id,
      name: p.name,
      locked: Boolean(p.locked),
      builtin: Boolean(p.builtin),
      songIds: Array.isArray(p.songIds) ? p.songIds.slice() : [],
      createdAt: p.createdAt ?? 0,
    }));
    const liked = state.playlists.find((p) => p.id === LIKED_ID);
    if (liked) state.likedIds = new Set(liked.songIds);
  }

  // 队列与当前曲目可能引用了已不存在的 id，做一次清理
  const idSet = new Set(state.songs.map((s) => s.id));
  state.queue = state.queue.filter((id) => idSet.has(id));
  if (state.queue.length === 0 && state.songs.length) {
    state.queue = state.songs.slice(0, 5).map((s) => s.id);
  }
  if (state.currentId && !idSet.has(state.currentId)) {
    state.currentId = state.queue[0] ?? null;
  }
  if (!state.currentId && state.queue.length) {
    state.currentId = state.queue[0];
  }
  state.duration = songById(state.currentId)?.duration ?? 0;

  commit();
  return true;
}

/** 首次装载数据（真实后端优先，失败回退 mock） */
export async function bootstrap() {
  seedFromMock();
  const saved = loadPersisted();
  applyPersisted(saved);
  if (state.view === "playlist" && !playlistById(state.playlistId)) {
    state.view = "library";
    state.playlistId = null;
  }
  commit();
  await hydrateFromBackend();
}

/**
 * 重新扫描（需求 B2）。
 * 真实后端：Scan 是异步的，进度通过 scan:progress / scan:done 事件推送，
 * 这里等事件回来后刷新歌曲列表。
 * 预览模式：模拟一次耗时扫描。
 */
export async function rescan({ silent = false } = {}) {
  if (state.scanning) return null;
  if (!silent) state.scanning = true;
  commit();

  let raw = null;
  if (isWails()) {
    const started = await backend.scan(state.folders.map((f) => f.id));
    if (started?.started) {
      const songs = await waitForScanDone();
      if (Array.isArray(songs)) raw = songs;
    } else {
      raw = await backend.songs();
    }
  }
  if (!raw) {
    // 预览模式：模拟一次耗时扫描
    await new Promise((r) => setTimeout(r, silent ? 400 : 1500));
    raw = MOCK_SONGS.slice();
  }

  const prevIds = new Set(state.songs.map((s) => s.id));
  state.allSongsRaw = raw;
  const { kept, excluded } = applyRules(raw, state.filterRules);
  state.songs = kept;
  const nowIds = new Set(kept.map((s) => s.id));
  const added = kept.filter((s) => !prevIds.has(s.id));
  const removed = [...prevIds].filter((id) => !nowIds.has(id));
  state.lastScan = {
    at: Date.now(),
    found: raw.length,
    kept: kept.length,
    excluded,
    added: added.length,
    removed: removed.length,
  };
  state.scanning = false;
  commit();
  return state.lastScan;
}

/** 等待后端扫描结束并取回最新歌曲（最长等 10 分钟） */
function waitForScanDone() {
  return new Promise((resolve) => {
    let off = () => {};
    const timer = setTimeout(() => {
      off();
      backend.songs().then(resolve);
    }, 10 * 60 * 1000);

    off = on("scan:done", async () => {
      clearTimeout(timer);
      off();
      resolve(await backend.songs());
    });
  });
}

export { DEFAULT_CONFIG, SORTERS };
