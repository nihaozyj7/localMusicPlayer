/* ==========================================================================
   store.js — 应用状态 + 过滤引擎 + 持久化
   --------------------------------------------------------------------------
   设计原则：
     · state 只存「数据」，不存 DOM；
     · 所有变更走 commit()，UI 通过 subscribe() 重绘；
     · 持久化只落 localStorage 中真正需要跨启动保留的部分。
   ========================================================================== */

import { MOCK_FOLDERS, MOCK_FILTER_RULES, MOCK_PLAYLISTS, MOCK_SONGS } from "./mock.js";
import { moveItem, setCoverOverrideGetter, uid, uniq } from "./utils.js";
import { backend, connect, emit, isWails, on } from "./bridge.js";

const LS_KEY = "music-player.state.v1";

/** 播放模式
 *  「sequence（顺序）」现在的语义就是「列表循环」——按列表顺序播完自动回到第一首，
 *  所以不再单独保留一个行为完全相同的 loop-all（旧配置里的 loop-all 仍能正常播放）。 */
export const PLAY_MODES = ["sequence", "loop-one", "shuffle"];

const DEFAULT_CONFIG = {
  theme: "dark-minimal", // 主题 id（= themes/ 下的文件名）
  themeMode: "dark", // dark | light | system
  glassBlur: 22,
  glassBlurCustom: false, // 用户是否手动调整过毛玻璃强度（true 才覆盖主题令牌）
  glassAlpha: 62,
  glassAlphaCustom: false, // 用户是否手动调整过面板透明度（true 才按配置实时合成）
  nativeBackdrop: "off", // 窗口原生材质：off | auto | mica | acrylic | tabbed（改了要重启）
  minimizeToTray: false, // 点关闭按钮时收进系统托盘而不是退出应用
  animations: true,
  // 过渡速度：fast（0.2s，默认）| medium（0.35s）| slow（0.5s）。
  // 与 Go 侧 bootstrap.Config.AnimationsSpeed 保持一致。
  animationsSpeed: "fast",
  sidebarWidth: 232,
  accentFromCover: false,
  // 封面取色的结果（#rrggbb）。由前端解码封面得到，然后随配置写回后端 ——
  // 后端在页面加载前用它生成首帧主题（见 early_theme.go），
  // 这样封面取色主题启动时不会先黑一下再重绘。
  coverSeed: "",
  coverSeed2: "",
  showAlbumColumn: true,
  showLyrics: true,
  playMode: "sequence",
  volume: 0.8,
  muted: false,
  autoScanOnStart: true,
  watchFolders: true,
  playerViewMode: "classic", // classic | immersive | minimal
  // 与 Go 侧 bootstrap.Config 的默认值保持一致：
  // 内嵌歌词 → 同目录 .lrc → 本程序缓存 → 在线自动匹配
  lyricsSources: ["embedded", "lrc-file", "cache", "online"],
  lyricsFontSize: 16,
  lyricsLines: 7,
  // 桌面歌词：独立的透明置顶窗口（区别于详情页里的歌词区）
  showDesktopLyrics: false,
  // 桌面背景歌词：与桌面歌词是二选一的一组单选按钮（见 desktop-mode.js）
  showDesktopWallpaper: false,
  // 定时停止：「歌曲播放完成后停止」= 倒计时到点后等当前这首播完再停（延长到歌曲结束）
  sleepAfterSong: false,

  /* 随机播放行为：reshuffle（打乱后播完重新打乱）| once（打乱后顺序播完即停） */
  shuffleMode: "reshuffle",

  /* AI 元数据清洗（设置 → AI 元数据） */
  aiBaseUrl: "",
  aiApiKey: "",
  // 思考模式默认关闭；开关字段按「模型类型」（aiVendor）选择，见 ai-vendors.js
  aiThinking: false,
  // 模型类型（厂商）：决定思考开关用哪家的请求体字段；auto = 自动识别
  aiVendor: "auto",
  aiModelId: "",
  // 自动匹配歌词时先用 AI 清洗元数据（关掉后只做本地整形，不再等 8~18 秒的 AI）
  aiLyricsClean: true,
  cacheDir: "%APPDATA%\\MusicPlayer\\cache",
  scanConcurrency: 4,

  /* 响度均衡（LUFS 补偿） */
  loudnessMode: "off", // off | track（逐曲） | album（同专辑统一）
  loudnessTarget: -16, // 目标整合响度 LUFS（-16 接近流媒体常用值）
  loudnessLimit: true, // 真峰值保护，避免抬升后削波

  /* 在线功能 */
  // 下载保存目录。后端默认给的是「系统音乐目录 / downloads」，
  // 启动后会用后端返回的真实值覆盖这个占位。
  downloadDir: "",
  // 是否为在线歌曲联网抓取封面（多来源，见 internal/coverfetch）
  onlineCover: true,
  // 是否把抓到的封面/歌词写回歌曲文件自身的标签。
  // 默认关闭：这会在用户的音乐文件上做修改，必须由用户明确开启。
  embedMeta: false,

  // 交互
  // 单击歌曲行的行为：next（加入下一首播放） | play（立即播放） | append（加入末尾）
  rowClickAction: "next",
  // 列表密度：compact（紧凑） | cozy（默认） | roomy（宽松）
  listDensity: "cozy",
  /* 封面轮播（详情页）：只影响详情页显示哪一张，不动「当前生效封面」 */
  coverCarousel: false,
  coverCarouselInterval: 10, // 秒
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

    /* 在线曲目登记表：songId → 曲目对象
       ------------------------------------------------------------------
       在线歌曲（试听）**不放进 songs**：songs 是「本地曲库」，
       「所有歌曲」视图只应该显示本地文件。试听时把曲目登记到这里，
       再把 id 压进播放队列，队列 / 底栏 / 播放详情页照样能查到它。
       在线登记表不落盘（链接有时效，跨启动没有意义）。 */
    onlineSongs: new Map(),

    /* 界面 */
    view: "library", // library | queue | playlist | settings
    playlistId: null,
    /* 歌单多选模式：勾选歌曲后可以批量移除 */
    playlistSelecting: false,
    selectedIds: new Set(),
    playerOpen: false,
    queueOpen: false,
    pvMode: "classic",
    query: "",
    // 搜索浮层：{ open: boolean, tab: 'local'|'online' }。
    // 放在 state 里是为了让「清空前不销毁、可复用」这个行为有唯一真源。
    searchOpen: false,
    searchTab: "online",
    sortKey: "addedAt",
    sortDir: "desc",

    /* 封面集合表：songId → { items:[{preview,source,provider,width,height}], active }
       ------------------------------------------------------------------
       一首歌现在可以有多张封面（需求：支持多封面的嵌入与读取 + 轮播）。
       缓存目录里的图片文件才是持久真相，这里只是内存里的即时预览：
       应用/切换封面后立刻重绘，不必等曲库重扫。
       `active` 是「当前生效」那张（列表缩略图 / 底栏 / 写回文件都用它）。
       轮播开关**不在这里**：它是全局偏好 config.coverCarousel（见 setCoverSet）。 */
    coverSets: new Map(),
    settingsOpen: false,

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
    // 定时停止：null | { type: "after-song" }
    sleepTimer: null,

    /* 响度均衡：songId → 补偿增益(dB)，由后端测量结果算出 */
    loudnessGains: {},
    loudnessState: null, // 后端响度能力/进度快照

    /* 在线封面：后端注册的来源与熔断状态（设置界面展示用） */
    coverProviders: [],
    coverBreaker: {},

    /* 窗口原生材质：后端给出的「当前生效值 / 是否支持 / 是否待重启」 */
    backdropState: null,

    /* 配置 */
    config: { ...DEFAULT_CONFIG },

    /* 派生 */
    visibleSongs: [],
    // visibleVersion 只在「可见列表内容真的变了」时 +1（见 recalcVisible）；
    // main.js 的渲染键用它判断要不要重绘曲目表。
    visibleFingerprint: "",
    visibleVersion: 0,
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
/**
 * 把规则预编译一次。
 *
 * 为什么必须预编译：matchRules 是按「一首歌」调用的，如果在里面 compileRegex，
 * 1000 首歌 × N 条正则就是 1000N 次 new RegExp（设置页改一个字就要全库重算一遍）。
 * 把编译挪到 applyRules 这一层，成本从 O(songs×rules) 降到 O(rules)。
 */
function compileRules(rules) {
  return (rules || [])
    .filter((r) => r.enabled)
    .map((rule) => ({
      rule,
      re: rule.type === "regex" ? compileRegex(rule.value) : null,
      bytes: rule.type === "size" ? normalizeSize(rule.value, rule.unit) : NaN,
    }));
}

/** 判断单首歌是否被已编译的规则过滤掉 */
function matchCompiled(song, compiled) {
  if (!compiled.length) return { excluded: false, reason: null };

  // 只要存在启用中的 include 规则，就必须参与「至少命中一条」的判定，
  // 因此 hasInclude 在看规则时无条件置位（与 Go 侧 filter.Match 保持一致）
  const hasInclude = compiled.some((c) => c.rule.scope === "include");
  let hitInclude = false;

  for (const c of compiled) {
    const rule = c.rule;
    let hit = false;

    if (rule.type === "size") {
      if (!Number.isFinite(c.bytes)) continue;
      const fn = SIZE_OPS[rule.op] || SIZE_OPS.lt;
      hit = fn(song.size, c.bytes);
    } else if (rule.type === "regex") {
      if (!c.re) continue;
      // 与 Go 侧 filter.Match 保持一致：匹配「完整路径」与「文件名」。
      // 以前这里用 `${title}.${ext}`（标签标题），于是「匹配标签但匹配不到文件名」
      // 的歌会被前端第二次过滤掉（后端其实保留了它），显示与统计都对不上。
      hit = c.re.test(song.path) || c.re.test(baseName(song.path));
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

/**
 * 判断单个文件是否被规则过滤掉（单首歌的便捷入口）。
 *
 * 语义：
 *   scope = "exclude" → 命中该规则的**排除**（不需要）
 *   scope = "include" → 只有命中至少一条 include 规则的才保留（include 为空时全部通过）
 *   exclude 优先于 include。
 * 返回值：{ excluded: boolean, reason: string|null }
 *
 * 注意：批量判断请用 applyRules —— 这里每次都会重新编译正则。
 */
export function matchRules(song, rules) {
  return matchCompiled(song, compileRules(rules));
}

/** 应用全部规则，返回可用歌曲与统计（供设置页「预览」使用） */
export function applyRules(songs, rules) {
  const compiled = compileRules(rules);
  const kept = [];
  let excluded = 0;
  for (const s of songs) {
    if (matchCompiled(s, compiled).excluded) excluded += 1;
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
    // 在线试听曲目不在 songs 里（见 initialState 的说明），但队列里有它的 id。
    // 只在 songs 里查会让整行消失，且 DOM 下标与 state.queue 下标错位 ——
    // 表现就是「拖拽移动的不是用户拖的那首」。
    return queue.map((id) => byId.get(id) || state.onlineSongs.get(id)).filter(Boolean);
  }
  if (view === "playlist" && playlistId) {
    const pl = playlists.find((p) => p.id === playlistId);
    return (pl?.songIds || []).map((id) => byId.get(id) || state.onlineSongs.get(id)).filter(Boolean);
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

  // 播放列表（队列）视图**不排序**：队列顺序本身就是数据（用户拖拽排序的结果），
  // 再按 sortKey 排一次会把拖拽效果整个抹掉 —— 这正是「拖拽后提示成功、
  // 界面却没变化」的原因。队列的排序由用户拖拽决定。
  if (state.view !== "queue" && state.sortKey && SORTERS[state.sortKey]) {
    const cmp = SORTERS[state.sortKey];
    const dir = state.sortDir === "desc" ? -1 : 1;
    out = out.slice().sort((a, b) => cmp(a, b) * dir);
  }

  state.visibleSongs = out;
  // 可见列表的「版本号」：main.js 的渲染键用它判断「列表到底变了没」。
  //
  // ★ 必须由**内容**决定，不能每次 recalcVisible 都自增。
  // recalcVisible 是 commit() 里无条件跑的，而 commit() 到处都是 ——
  // 切歌、调音量、播放/暂停、换封面、进度落盘都会来一次。以前这里写的是
  // 「每调一次就 +1」，等价于「任何一次状态变更都让曲目表整表重绘」，
  // 用户看到的就是「切一首歌列表闪一下」「进入界面闪一下」。
  // 现在改成：只有「可见曲目集合 / 顺序」真的变了，版本号才 +1。
  const fingerprint = visibleFingerprint(out);
  if (fingerprint !== state.visibleFingerprint) {
    state.visibleFingerprint = fingerprint;
    state.visibleVersion = (state.visibleVersion || 0) + 1;
  }
  // 顺带重建 id → song 索引：songById 在每帧的同步里被调用好几次，
  // 每次都 state.songs.find(...) 是 O(n)，1000 首时每帧要扫几千次。
  songIndex = new Map(state.songs.map((s) => [s.id, s]));
}

/**
 * 可见列表的内容指纹。
 *
 * 为什么是「指纹」而不是「把 id 拼成字符串」：拼接会为每一首歌分配一个字符串
 * 再拼成一条大串（1000 首 ≈ 每次 commit 几十 KB 垃圾），而 FNV-1a 只在整数上
 * 迭代，没有中间对象。为什么不是「只在 commit 时自增」：那正是上面注释里的 bug。
 *
 * 覆盖范围：
 *   · 长度 + 顺序 + 每一首的 id（成员与排序都算进去了）；
 *   · 曲库数组被整体替换时强制算「变了」（重扫 / 启动从后端灌数据）——
 *     这时即使 id 一个都没变，标题/封面这些展示字段也可能换了新的对象。
 *     state.songs 永远是整体替换、从不原地改字段，所以引用比较是可靠的判据。
 *
 * 注意：每首歌的**封面**不在指纹里（它在 state.coverSets 里，另有 coverVersion
 * 参与渲染键），这里只负责「列表本身」。
 */
function visibleFingerprint(list) {
  let h = 0x811c9dc5;
  h = Math.imul(h ^ list.length, 0x01000193) >>> 0;
  for (let i = 0; i < list.length; i += 1) {
    const id = String(list[i].id ?? "");
    for (let j = 0; j < id.length; j += 1) {
      h ^= id.charCodeAt(j);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // 分隔符：不然 ["ab","c"] 与 ["a","bc"] 会撞成同一个指纹
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const replaced = state.songs !== lastFingerprintSongs ? 1 : 0;
  lastFingerprintSongs = state.songs;
  return `${list.length}:${h >>> 0}:${replaced}`;
}

/** 上一次算指纹时看到的曲库数组（引用比较，见 visibleFingerprint 的说明） */
let lastFingerprintSongs = null;

/** 曲库 id → song 的索引，随 state.songs 变化在 recalcVisible 里重建 */
let songIndex = new Map();

/** 从完整路径里取文件名（与 Go 侧 filepath.Base 对齐， 与 / 都认） */
function baseName(path) {
  const s = String(path || "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i >= 0 ? s.slice(i + 1) : s;
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
  // immediate：爱心按钮的按下态要跟着这次点击立刻变化。
  // 默认的 rAF 合并会让底栏比点击慢一帧，用户看到的就是"点了没反应"。
  commit(undefined, { immediate: true });
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
   歌单多选（纯界面状态，不落盘）
   --------------------------------------------------------------------------
   需求：歌单里加「多选」按钮，勾选后可以批量移除。
   勾选状态放在 state 而不是各组件里：工具条（显示已选数量 / 全选 / 移除）
   与曲目行（勾选框）读的是同一份，避免两边各记一份而不同步。
   -------------------------------------------------------------------------- */
export function setPlaylistSelecting(on) {
  state.playlistSelecting = Boolean(on);
  if (!state.playlistSelecting) state.selectedIds = new Set();
  commit();
}

export function toggleSelectedSong(id) {
  if (!id) return;
  const next = new Set(state.selectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  state.selectedIds = next;
  commit();
}

export function setSelectedSongs(ids) {
  state.selectedIds = new Set(Array.isArray(ids) ? ids : []);
  commit();
}

export function clearSelectedSongs() {
  state.selectedIds = new Set();
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
  if (!songId) return;
  // 已经在播放的歌不需要再排到「下一首」：避免把当前歌自己挪到队首。
  if (songId === state.currentId) return;

  const queue = state.queue.filter((id) => id !== songId);
  const at = state.currentId ? queue.indexOf(state.currentId) : -1;
  if (at >= 0) queue.splice(at + 1, 0, songId);
  // 没有正在播放的歌时，排在队首 = 下一次开始播放就轮到它。
  else queue.unshift(songId);
  state.queue = queue;
  commit();
}

export function removeFromQueue(songId) {
  // 下标必须在**过滤之前**取：原来的写法先 filter 再 indexOf(songId)，
  // 而此时 songId 已经被删掉了，indexOf 必然返回 -1，于是 currentId 被置成
  // queue[-1] → null，播放直接停掉（而不是顺延到下一首）。
  const i = state.queue.indexOf(songId);
  state.queue = state.queue.filter((id) => id !== songId);
  if (state.currentId === songId) {
    // i 是移除前的下标，指向的正好是「原来那首的下一首」；越界时钳到末尾
    state.currentId = state.queue[Math.min(i, state.queue.length - 1)] ?? null;
  }
  commit();
}

export function reorderQueue(from, to) {
  state.queue = moveItem(state.queue, from, to);
  // 需求：用户拖拽调整播放顺序后，播放模式自动切回「列表循环」。
  // 拖拽表达的是「就按我排的这个顺序播」，单曲循环 / 随机都与它矛盾。
  setPlayMode("sequence");
  commit();
  // 只有「队列与来源歌单逐项一致」时，队列下标才等于歌单下标。
  // 往队列里插过歌之后两者就不再等价（addNextInQueue / appendToQueue 都不会
  // 清掉 queueOrigin），此时把队列下标写回歌单会**改错那一首歌的位置**，
  // 而且会落盘污染歌单。所以这里先比对内容，不一致就不写。
  const origin = state.queueOrigin?.id ? playlistById(state.queueOrigin.id) : null;
  if (isWails() && origin && sameIdOrder(origin.songIds, state.queue)) {
    backend.reorderPlaylist(origin.id, from, to);
  } else if (origin) {
    // 队列已经不等于歌单了：来源标记降级，避免后续拖拽继续误写歌单
    state.queueOrigin = null;
  }
}

/** 两个 id 序列是否逐项相同 */
function sameIdOrder(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function clearQueue() {
  state.queue = [];
  state.currentId = null;
  state.playing = false;
  state.position = 0;
  state.onlineSongs.clear();
  commit();
}

/* --------------------------------------------------------------------------
   播放控制（真实解码由 Go/Wails 侧完成，这里只维护状态）
   -------------------------------------------------------------------------- */

/**
 * 按 id 找曲目。
 *
 * 先查本地曲库，再查在线登记表 —— 在线试听曲目不在 songs 里（见 initialState），
 * 但队列 / 底栏 / 播放页 / 歌词都需要通过这个函数拿到它。
 */
export function songById(id) {
  if (!id) return null;
  return songIndex.get(id) || state.onlineSongs.get(id) || null;
}

/* --------------------------------------------------------------------------
   封面集合
   --------------------------------------------------------------------------
   前端只保存「预览用的 data URL + 元信息」，真正的图片文件在后端缓存目录里。
   所有变更都以后端返回的集合为准（见 coverpanel.js：应用封面后直接
   setCoverSets / setCoverSet 覆盖本地状态），这样多端状态不会漂。

   为什么要有一个统一入口 coverSetOf：封面在四个地方被消费 ——
   列表缩略图、底栏、播放详情页、封面面板自己。以前各自读不同的表
   （coverOverrides / song.cover），于是「列表和详情页显示的不是同一张」。
   现在统一读这里，单一真源。
   -------------------------------------------------------------------------- */

/* 封面版本号：每次封面表有任何变化都 +1。
   --------------------------------------------------------------------------
   为什么需要它：曲目列表是按「渲染键」增量重绘的（见 main.js#renderKey），
   而封面不在键里 —— 于是「应用了新封面但列表一行都不重绘」，
   用户看到的现象就是「匹配完封面，列表里还是默认封面」。
   把版本号写进渲染键，封面一变整张表就重绘；底栏也用它判断要不要换图。 */
let coverRevision = 0;

/** 当前封面版本号（只读，供渲染键与底栏比对） */
export function coverVersion() {
  return coverRevision;
}

function bumpCoverVersion() {
  coverRevision += 1;
}

/** 取某首歌的封面集合（永远是同一个形状，调用方不必判空） */
export function coverSetOf(id) {
  const set = state.coverSets.get(id);
  if (!set) return { items: [], active: 0 };
  if (!Array.isArray(set.items)) set.items = [];
  return set;
}

/** 当前生效封面的预览地址（空串 = 回落到文件自带封面） */
export function activeCoverOf(id) {
  if (!id) return "";
  const set = coverSetOf(id);
  const item = set.items[set.active] || set.items[0];
  return item?.preview || "";
}

/**
 * 整首覆盖（后端返回新集合时用）。
 *
 * 注意这里**不含轮播开关**：轮播是「详情页要不要轮换显示」的全局偏好
 * （config.coverCarousel），不是每首歌的属性。放进每首歌的集合里会出现
 * 「这首歌开、那首歌关」两个真源，用户根本记不住自己在哪首开的。
 */
export function setCoverSet(id, set) {
  if (!id) return;
  if (!set || !Array.isArray(set.items) || !set.items.length) {
    state.coverSets.delete(id);
  } else {
    const items = set.items.filter((i) => i && i.preview);
    state.coverSets.set(id, {
      items,
      active: Math.max(0, Math.min(Number(set.active) || 0, items.length - 1)),
    });
  }
  bumpCoverVersion();
  commit();
}

/** 批量覆盖（启动时从后端回填） */
export function setCoverSets(map) {
  if (!map || typeof map !== "object") return;
  for (const [id, set] of Object.entries(map)) {
    if (!set || !Array.isArray(set.items)) continue;
    const items = set.items.filter((i) => i && i.preview);
    if (!items.length) continue;
    state.coverSets.set(id, {
      items,
      active: Math.max(0, Math.min(Number(set.active) || 0, items.length - 1)),
    });
  }
  bumpCoverVersion();
  commit();
}

/** 兼容旧调用：设置「唯一一张」封面（空值 = 清空） */
export function setCoverOverride(id, dataURL) {
  if (!id) return;
  if (dataURL) setCoverSet(id, { items: [{ preview: dataURL, source: "user" }], active: 0 });
  else {
    state.coverSets.delete(id);
    bumpCoverVersion();
    commit();
  }
}

/** 兼容旧调用：取当前生效封面 */
export function coverOverrideOf(id) {
  return activeCoverOf(id);
}

// 让 utils.js#coverOf 能读到封面表（避免 utils ⇄ store 循环 import）
setCoverOverrideGetter(coverOverrideOf);

/* --------------------------------------------------------------------------
   列表密度
   --------------------------------------------------------------------------
   密度是全列表共用的显示设置，存在后端配置里（listDensity），
   这样所有列表（本地歌曲 / 播放列表 / 歌单）一起生效。
   -------------------------------------------------------------------------- */
export function setListDensity(value) {
  const ok = ["compact", "cozy", "roomy"];
  state.config.listDensity = ok.includes(value) ? value : "cozy";
  commit();
}

/**
 * 登记一首在线曲目（返回登记后的对象）。
 *
 * 同名同源的曲目会被合并，所以反复试听同一首歌不会让登记表无限增长。
 */
export function registerOnlineSong(song) {
  if (!song?.id) return null;
  const prev = state.onlineSongs.get(song.id);
  const merged = { ...(prev || {}), ...song, online: true };
  state.onlineSongs.set(song.id, merged);
  // 队列里已经引用了它就够；不 commit（调用方紧接着会 playContext）
  return merged;
}

/** 清掉不再被引用的在线曲目（切歌、清空队列后顺手回收）。 */
export function pruneOnlineSongs() {
  const keep = new Set(state.queue);
  if (state.currentId) keep.add(state.currentId);
  for (const id of [...state.onlineSongs.keys()]) {
    if (!keep.has(id) && id !== state.currentId) state.onlineSongs.delete(id);
  }
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

/* --------------------------------------------------------------------------
   随机播放：先把当前队列洗成一张「洗牌顺序表」，然后按表顺序播完；
   播到末尾后按设置决定是重新洗牌继续，还是就此停止。
   -------------------------------------------------------------------------- */
function shuffleIndices(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ensureShuffleOrder() {
  const n = state.queue.length;
  if (!n) {
    state.shuffleOrder = [];
    return;
  }
  if (state.shuffleOrder.length !== n) {
    state.shuffleOrder = shuffleIndices(n);
  }
}

function reshuffle() {
  state.shuffleOrder = shuffleIndices(state.queue.length);
}

export function nextIndex(step = 1) {
  const { queue, currentId, playMode } = state;
  if (!queue.length) return -1;
  const i = queue.indexOf(currentId);

  if (playMode === "shuffle") {
    ensureShuffleOrder();
    const order = state.shuffleOrder;
    if (!order.length) return -1;
    if (queue.length === 1) return 0;

    let pos = order.indexOf(i);
    if (pos < 0) pos = step > 0 ? -1 : order.length; // 未在序列里时，向前/向后各从一个合理位置开始
    let nextPos = pos + step;

    if (nextPos < 0) nextPos = order.length - 1;
    if (nextPos >= order.length) {
      if (step < 0) return -1;
      // 随机模式播到末尾：only-once 模式停下，否则重新洗牌从头再来
      if (state.config.shuffleMode === "once") return -1;
      reshuffle();
      nextPos = 0;
    }
    return order[nextPos];
  }

  // 顺序播放 / 列表循环：按列表顺序无限循环（需求：顺序播放即列表循环）。
  // loop-one 由 ended 处理（audio.js / mock ticker），这里按 next 语义前进。
  if (i < 0) return 0;
  return (i + step + queue.length) % queue.length;
}

export function playNext(auto = false) {
  // 定时停止：当前这首播完就停，不再进下一首。
  if (auto && state.sleepTimer?.type === "after-song") {
    state.sleepTimer = null;
    state.playing = false;
    state.position = state.duration || 0;
    commit();
    emit("player:pause", { songId: state.currentId });
    return;
  }
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
  setPlayMode(PLAY_MODES[(i + 1) % PLAY_MODES.length]);
}

/** 直接设定播放模式（"sequence" 即列表循环）。 */
export function setPlayMode(mode) {
  const next = PLAY_MODES.includes(mode) || mode === "loop-all" ? mode : "sequence";
  if (next !== state.playMode) state.playMode = next;
  state.config.playMode = state.playMode;
  if (state.playMode === "shuffle") reshuffle();
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
      if (state.sleepTimer?.type === "after-song") {
        // 定时停止：本首结束即停（loop-one 也一样）
        playNext(true);
        return;
      }
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

/**
 * 把状态快照写进 localStorage。
 *
 * commit() 会被音量滑条这类高频动作按 pointermove 反复调用（一次拖动几十上百次），
 * 每次都 JSON.stringify 整个快照 + 同步写 localStorage 会明显发卡。所以快照写盘
 * 走 180ms 去抖：拖动过程中最多每 180ms 写一次，最后一次一定写得进去
 *（flushConfigSync / beforeunload 会先 flush）。
 *
 * 注意：状态本身仍然是**同步**更新的，去抖的只有落盘。
 */
let persistTimer = null;

export function persist() {
  // 配置同步自己带 400ms 去抖，这里直接排期；只有快照写盘需要额外合并
  scheduleConfigSync();
  if (persistTimer) return;
  persistTimer = setTimeout(persistNow, 180);
}

/** 立刻把待写的快照落盘（页面关闭、显式保存时用） */
export function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  writeSnapshot();
}

function writeSnapshot() {
  try {
    const snap = {
      config: state.config,
      view: state.view,
      playlistId: state.playlistId,
      pvMode: state.pvMode,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
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
  "nativeBackdrop",
  "minimizeToTray",
  "animations",
  "animationsSpeed",
  "accentFromCover",
  "coverSeed",
  "coverSeed2",
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
  "showDesktopLyrics",
  "showDesktopWallpaper",
  "sleepAfterSong",
  "shuffleMode",
  "aiBaseUrl",
  "aiApiKey",
  "aiThinking",
  "aiVendor",
  "aiModelId",
  "aiLyricsClean",
  "cacheDir",
  "loudnessMode",
  "loudnessTarget",
  "loudnessLimit",
  "downloadDir",
  "onlineCover",
  "embedMeta",
  "rowClickAction",
  "listDensity",
  "coverCarousel",
  "coverCarouselInterval",
];

let syncTimer = null;

function scheduleConfigSync() {
  if (!isWails()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(flushConfigSync, 400);
}

/** 立即把需要落盘的配置推给后端 */
export async function flushConfigSync() {
  // 先把去抖中的快照写掉：这个函数是「立即落盘」的入口，
  // 页面关闭 / 显式保存都指望它，不能因为去抖丢掉最后一次改动。
  persistNow();
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
  // 队列与当前曲目**不能在这里校验**：此刻曲库还是空的（真实后端要先 await
  // hydrateFromBackend），任何 id 都会被判成「不存在」，于是队列被清空、
  // 当前曲目丢失 —— 启动永远落到「取前 5 首」的兜底上。
  // 表现就是「每次打开都是同一首」。这里只记下来，等曲库到位再落（见 applyPendingPlayback）。
  pendingPlayback = {
    queue: Array.isArray(saved.queue) ? saved.queue.slice() : [],
    currentId: saved.currentId || null,
  };
  // 注意这里**不能**顺手应用：此刻 state.songs 是刚 seed 的假数据，
  // 用它校验存档会把存档消费掉（真实后端稍后灌进来的 id 又对不上）。
  // 落盘点见 bootstrap() 结尾与 hydrateFromBackend() 结尾。
}

/**
 * 上次的队列 / 当前曲目（等曲库装载完才能校验）。
 *
 * 为什么必须延后：`bootstrap()` 的顺序是「seed 假数据 → 恢复本地快照 →
 * 拉后端曲库」，恢复时拿到的曲库要么是假数据、要么是空的。用错的曲库去过滤
 * 存档队列，结果永远是空 —— 这是「每次打开都从第一首开始」的根因。
 */
let pendingPlayback = null;

/**
 * 把存档的队列 / 当前曲目落到 state 上（曲库就位后调用，幂等）。
 * @returns {boolean} 是否真的应用了
 */
function applyPendingPlayback() {
  if (!pendingPlayback) return false;
  if (!state.songs.length) return false; // 曲库还没到，继续等
  const ids = new Set(state.songs.map((s) => s.id));
  const restored = pendingPlayback;
  pendingPlayback = null;

  const queue = restored.queue.filter((id) => ids.has(id));
  if (queue.length) state.queue = queue;
  if (restored.currentId && ids.has(restored.currentId)) {
    state.currentId = restored.currentId;
  } else if (!state.currentId && state.queue.length) {
    state.currentId = state.queue[0];
  }
  state.duration = songById(state.currentId)?.duration ?? 0;
  return true;
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

  // 队列与当前曲目可能引用了已不存在的 id，做一次清理。
  // 顺序要紧：**先**把本地存档的「上次播到哪儿」落下来（此刻曲库才刚有），
  // **再**做「队列为空就取前 5 首」的兜底 —— 反过来的话存档永远被兜底覆盖。
  const idSet = new Set(state.songs.map((s) => s.id));
  state.queue = state.queue.filter((id) => idSet.has(id));
  applyPendingPlayback();
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
  // 曲库到位（真实后端，或预览模式下的假数据）之后再把「上次播到哪儿」落下来。
  // 真实后端那条路径已经在 hydrateFromBackend 里落过了，这里是预览模式的路径。
  if (applyPendingPlayback()) commit();
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
