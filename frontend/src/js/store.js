/* ==========================================================================
   store.js — 应用状态 + 过滤引擎 + 持久化
   --------------------------------------------------------------------------
   设计原则：
     · state 只存「数据」，不存 DOM；
     · 所有变更走 commit()，UI 通过 subscribe() 重绘；
     · 持久化只落 localStorage 中真正需要跨启动保留的部分。
   ========================================================================== */

import { toast } from "./dom.js";
import { MOCK_FOLDERS, MOCK_FILTER_RULES, MOCK_PLAYLISTS, MOCK_SONGS } from "./mock.js";
import { moveItem, setCoverOverrideGetter, uid, uniq } from "./utils.js";
import { backend, connect, emit, isWails, on } from "./bridge.js";
// 预览模式下没有后端，检查更新要拿它编一个「已是最新版」出来
import { APP_VERSION_FALLBACK } from "./about-info.js";

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
  windowCorners: "system", // 主窗口圆角：system | round | small | square（立刻生效，见 WindowService.SetWindowCorners）
  minimizeToTray: false, // 点关闭按钮时收进系统托盘而不是退出应用
  animations: true,
  // 过渡速度：fast（0.25s，默认）| medium（0.5s）| slow（0.75s）。
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
  // 内嵌歌词 → 同目录 .lrc → 歌词缓存 → 在线自动匹配
  lyricsSources: ["embedded", "lrc-file", "cache", "online"],
  lyricsFontSize: 16,
  lyricsLines: 7,
  // 桌面歌词：独立的透明置顶窗口（区别于详情页里的歌词区）
  showDesktopLyrics: false,
  // 桌面背景歌词：与桌面歌词是二选一的一组单选按钮（见 desktop-mode.js）
  showDesktopWallpaper: false,
  // 桌面背景歌词是否在**每次启动时**自动打开。
  //
  // showDesktopWallpaper 只表示「本次运行开着」，它不回答「下次启动要不要自动开」——
  // 后者由这个开关决定（默认开，与加入它之前的行为一致）。关掉它之后仍然可以
  // 手动打开背景歌词，只是重启后不再自动出现，也就是「只在本次启动生效」。
  autoStartDesktopWallpaper: true,
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
  cacheDir: "%APPDATA%\\LocalMusicPlayer\\cache",
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
  // 单击歌曲行的行为：play（播放并加入播放列表） | play-list（播放当前列表并替换队列） | next（下一首播放）
  rowClickAction: "next",
  // 保留歌曲播放进度：退出应用时记住每首歌的播放位置，下次打开回到上次听的地方。
  // 只恢复进度条位置，不会自动开始播放（见 applyPendingPlayback / audio.js）。
  resumeProgress: true,
  // 记忆音量：退出时保存当前音量，下次启动恢复；关掉则每次启动都用默认音量。
  rememberVolume: true,
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
    // 底栏两个浮层（选项 / 定时停止）的开合：以前存在各模块的局部变量里，
    // 现在是状态，组件照着渲染，也就不需要「谁去 hidden 哪个节点」的约定。
    optionsOpen: false,
    sleepOpen: false,

    /* 版本更新（见 Go 侧 services_update.go）
       ------------------------------------------------------------------
       这一块整体是「后端状态在前端的投影」：真正的事实全在 Go 侧
       （检查结果、进度、待安装的包），前端只负责把它渲染出来。
       所以这里没有「自己算」的字段，也没有乐观更新 ——
       更新这种会动用户程序文件的操作，界面显示的必须是后端确认过的事实。 */
    update: {
      // 最近一次检查的结果（null = 还没检查过）
      check: null,
      // 后端是否正在检查
      checking: false,
      // 正在下载时的进度对象；null 表示没有下载在进行
      progress: null,
      // 下载完成、等待安装的包：{ name, path, bytes, verified, mirrorId }
      pending: null,
      // 用户选的下载通道：auto | 某个代理 id
      channel: "auto",
      // 启动时是否自动检查
      checkOnStart: true,
      // 被用户「跳过」的版本号
      skippedVersion: "",
      // 最近一次操作的错误文案（下载失败等），成功时清空
      error: "",
    },
    /* updateRev 是「update 这一块变过几次」的计数器。
       ------------------------------------------------------------------
       必须单独有它，因为 state.update 是被**原地修改**的
       （state.update.check = …），引用永远不变 —— 而设置组件按引用比较
       依赖项，光把 s.update 放进依赖数组是**察觉不到变化**的。
       实测症状：后端明明推了 update:checked，卡片上的文案一动不动；
       手动 requestUpdate() 一下内容立刻就对了。

       所以每次改 update 都调 touchUpdate() 把版本号加一，
       让「变了」这件事在引用层面可见。 */
    updateRev: 0,
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
    // 设置层当前高亮的分区；settingsRev 是「强制重绘一次设置层」的显式信号
    // （重扫主题 / 导入样式这类不经过 state 的变更需要一个版本号来驱动组件）
    settingsSection: "library",
    settingsRev: 0,
    // 扫描进度文案（#scanning 覆盖层由组件按 state.scanning 渲染）
    scanText: "正在扫描音乐文件夹…",
    /* 「放不出来」的文件清单（播放时实测失败的那些，见 services_unplayable.go）。
       songId → { songId, path, title, artist, ext, reason, at, attempts }。
       用数组而不是 Map：清单通常只有几条，组件按顺序渲染，且要能整体替换。 */
    unplayableFiles: [],
    /* 清单是否已经拉过一次。没拉过之前不该显示「没有放不出来的文件」——
       那会让人误以为检查过了（其实只是还没问后端）。 */
    unplayableLoaded: false,
    /* 清单面板是否展开（设置页里点「查看是哪些文件」切换）。 */
    unplayableOpen: false,
    /* 歌单版本号：歌单数组与每首歌单的 songIds 都是**原地改**的，
       引用比较抓不到变化，所以用一个显式版本号让组件声明依赖。 */
    playlistVersion: 0,

    /* 播放 */
    queue: [],
    queueOrigin: null, // { type:'library'|'playlist', id }
    /* 每首歌的上次播放位置（毫秒）：songId → ms。
       只在「保留歌曲播放进度」打开时记录与恢复，随快照落盘（见 writeSnapshot）。 */
    progress: {},
    /* 本次启动要恢复的播放位置（毫秒，不落盘）。applyPendingPlayback 写入，
       audio.js 在装载恢复出来的那首歌时消费一次（见 consumeResumeSeek）。 */
    pendingResumeMs: 0,
    currentId: null,
    playing: false,
    position: 0,
    duration: 0,
    playMode: "sequence",
    volume: 0.8,
    muted: false,
    shuffleOrder: [],
    /* 「下一首播放」在随机模式下的落点。
       随机播放用的是 shuffleOrder 里的随机顺序，往 queue 里插到当前歌后面并不
       意味着它会真的下一个播，所以额外记一个显式标记，playNext 先消费它。 */
    forcedNextId: "",
    // 定时停止：null | { type: "after-song" }
    sleepTimer: null,

    /* 响度均衡：songId → 补偿增益(dB)，由后端测量结果算出 */
    loudnessGains: {},
    loudnessState: null, // 后端响度能力/进度快照

    /* 应用版本号：来自后端 AppService.Version()（设置 → 关于里展示）。
       空串表示还没问到（浏览器预览或后端尚未连接），视图用 about-info 的兜底值。 */
    appVersion: "",

    /* 在线封面：后端注册的来源与熔断状态（设置界面展示用） */
    coverProviders: [],
    coverBreaker: {},

    /* 窗口原生材质：后端给出的「当前生效值 / 是否支持 / 是否待重启」 */
    backdropState: null,

    /* 桌面背景歌词的可用性探测结果（不支持时按钮置灰并说明原因） */
    desktopWallpaperSupport: null,

    /* 浏览器预览下主窗口内的悬浮歌词条（真实应用里歌词在独立窗口上） */
    floatingLyrics: { show: false, text: "" },

    /* 歌词工作台（在线匹配 / 微调 / 手动编辑）的开合 */
    lyricsOpen: false,

    /* 配置 */
    config: { ...DEFAULT_CONFIG },

    // 封面缓存统计（后端 CoverService.CacheStats 的快照）。
    // 它由 settings.js 填充，以前**没有在这里声明** —— 于是「state 有哪些字段」
    // 在代码里没有唯一答案，只能靠全局搜索。
    coverCache: null,

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

/**
 * 「下一帧广播」的句柄：rAF 一条、宏任务兜底一条。
 *
 * ★ 为什么不能只认 requestAnimationFrame（真实事故：最小化 / 托盘后播完不切歌）
 *
 * 窗口最小化、或收进托盘时，WebView 判定页面不可见，**rAF 会被挂起**
 * ——不是变慢，是这一帧永远不来。而「自动下一首」这条链路只有一处异步：
 *
 *   <audio> 的 ended → playNext() → playSong() → commit() →（rAF）→ notify()
 *     → runtime.run() → syncAudio() → 给 <audio> 换 src 并起播
 *
 * 于是表现成：歌播完了，state.currentId 已经指向下一首，但 rAF 不回调 →
 * notify 不跑 → 音频元素还停在旧歌上 →「卡住不切」。一旦把主界面打开，
 * 攒着的那一帧立刻执行，下一首就"自己"接上了 —— 这正是那条反馈的现象。
 *
 * 规则：
 *   · 页面可见 → 走 rAF（保持"合并到一帧"的节流语义），并挂一条 200ms 的
 *     宏任务兜底（窗口被遮挡但 visibilityState 仍是 visible 时 rAF 同样会停）；
 *   · 页面不可见 → 直接走宏任务。后台页面的定时器最多被节流到 1s 一次，
 *     对"切歌"完全够用。
 */
const HIDDEN_FLUSH_MS = 200;
let frame = null; // requestAnimationFrame 的 id
let frameTimer = null; // 兜底 / 后台用的 setTimeout id

function flushNotify() {
  if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
  if (frameTimer !== null) clearTimeout(frameTimer);
  frame = null;
  frameTimer = null;
  notify();
}

function scheduleNotify() {
  if (frame !== null || frameTimer !== null) return;
  const hidden =
    typeof document !== "undefined" && typeof document.visibilityState === "string"
      ? document.visibilityState === "hidden"
      : false;
  if (hidden || typeof requestAnimationFrame !== "function") {
    frameTimer = setTimeout(flushNotify, 0);
    return;
  }
  frame = requestAnimationFrame(flushNotify);
  frameTimer = setTimeout(flushNotify, HIDDEN_FLUSH_MS);
}

/** 只通知订阅者（用于高频、无需重算与持久化的更新，如播放进度） */
export function notify() {
  for (const fn of listeners) {
    // 逐个隔离：一个订阅者抛异常不能让后面的订阅者被跳过（表现是
    // 「界面某一块从此不再更新」，而且异常会被抛回 audio/rAF 回调里，
    // 没有明确线索）。playerhost.js 对皮肤监听器已经是这个策略。
    try {
      fn(state);
    } catch (err) {
      console.error("[store] 订阅者抛出异常（已跳过，其余订阅者继续）", err);
    }
  }
}

export function commit(mutator, options = {}) {
  if (typeof mutator === "function") mutator(state);
  // ★ 自动推进 update 的版本号。
  //
  // state.update 里的字段是被**原地改**的（state.update.progress = …），
  // 对象引用从头到尾不变 —— 而设置组件按引用比较依赖项，光把 s.update
  // 放进依赖数组是察觉不到变化的。实测症状：后端推了 update:progress、
  // state 也确实改了，但界面上的进度条一动不动（手动 requestUpdate()
  // 一下立刻就对了）。
  //
  // 在这里统一推进而不是在每个写入点手动调：写入点有三十来处，
  // 漏掉任何一处都是「界面不更新且不报错」—— 那是这个功能里最难查的
  // 一类 bug。放在 commit 这个唯一漏斗里，就不可能漏。
  //
  // 代价是每次 commit 都会让 update 卡片重绘一次。这是可接受的：
  // 这张卡片只在设置层「关于」分区里，而且 Lit 只更新变化的那几个 part。
  state.updateRev = (state.updateRev || 0) + 1;
  recalcVisible();
  if (options.persist !== false) persist();
  if (options.immediate) {
    notify();
    return;
  }
  if (frame !== null || frameTimer !== null) return;
  scheduleNotify();
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
/**
 * 中文排序比较器。
 *
 * 用模块级复用的 Intl.Collator，而不是每次调用 localeCompare(x, locale)：
 * 后者在多数引擎里会为每次比较构造一个 collator 实例，而排序要做
 * n·log₂n 次比较 —— 5,000 首就是约 6 万次。实测（Node 22，中文标题）
 * 全量排序 23.4ms → 13.2ms。
 */
const textCollator = new Intl.Collator("zh-Hans-CN");

/**
 * 排序比较函数：一律以**升序**语义书写（返回值 < 0 表示 a 排在 b 前面）。
 *
 * ★ 为什么必须全部统一成升序（这是一个真实踩过的坑）：
 *
 * 原来 addedAt 写成 `b.addedAt - a.addedAt`、playCount 写成
 * `b.playCount - a.playCount` —— 它们本身已经是「降序」。这在只有
 * 「点一下就切」的旧逻辑里碰巧能用（因为默认方向和比较函数是配套的），
 * 但一旦引入显式的「升序 / 降序」选择，方向就变成了一个**乘数**：
 *
 *	排序结果 = cmp(a, b) × (dir === "desc" ? -1 : 1)
 *
 * 此时若 cmp 自身还是降序的，选「降序」就会得到**升序**的结果 ——
 * 用户点「降序」看到的却是最旧的排在前面。两处「降序」互相抵消了。
 *
 * 所以规则收敛成一句：SORTERS 只用升序语义，方向完全由 dir 决定。
 * 某个字段希望默认降序，通过 SORT_FIELDS 的 descFirst 表达（见下）。
 */
const SORTERS = {
  title: (a, b) => textCollator.compare(String(a.title), String(b.title)),
  artist: (a, b) => textCollator.compare(String(a.artist), String(b.artist)),
  album: (a, b) => textCollator.compare(String(a.album), String(b.album)),
  duration: (a, b) => a.duration - b.duration,
  size: (a, b) => a.size - b.size,
  ext: (a, b) => textCollator.compare(String(a.ext), String(b.ext)),
  playCount: (a, b) => (a.playCount ?? 0) - (b.playCount ?? 0),
  addedAt: (a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0),
};

/**
 * 排序字段的展示定义（顺序即悬浮面板里的顺序）。
 *
 * ★ 为什么要有 def 里这个 `descFirst`：
 *
 * 「升序 / 降序」对不同的字段意味着不同的「有用顺序」。用户点开排序面板，
 * 想要的是「哪个字段」+「哪个方向」，而不是先默认成升序再自己翻一次：
 *   · 时间类（添加时间、播放次数）：他关心「最近/最多」→ 默认降序；
 *   · 文本类（标题、歌手、专辑）：他关心「A→Z」→ 默认升序；
 *   · 时长/大小：查「最大的那几个」比「最小的」更常见，但也常用升序找短歌 ——
 *     这两个保持升序（与「从小到大」的直觉一致）。
 *
 * ★ descFirst 只决定「选中这个字段时初始用哪个方向」。
 *
 * 它**不影响**比较函数本身 —— SORTERS 一律是升序语义，方向统一由 dir 决定
 * （见上面 SORTERS 的说明）。所以 descFirst 与比较函数之间没有任何隐含耦合：
 * 改这里不会让某个字段的升降序反过来。
 */
export const SORT_FIELDS = [
  { key: "addedAt", label: "添加时间", descFirst: true },
  { key: "title", label: "标题", descFirst: false },
  { key: "artist", label: "歌手", descFirst: false },
  { key: "album", label: "专辑", descFirst: false },
  { key: "duration", label: "时长", descFirst: false },
  { key: "size", label: "文件大小", descFirst: false },
  { key: "playCount", label: "播放次数", descFirst: true },
];

/** 按 key 取字段定义（认不出来时返回 undefined）。 */
export function sortField(key) {
  return SORT_FIELDS.find((f) => f.key === key);
}

/** 方向的中文名（供菜单 aria-label / 提示文案使用）。 */
export function sortDirLabel(dir) {
  return dir === "desc" ? "降序" : "升序";
}

/**
 * 切换排序字段时应当采用的默认方向。
 *
 * 单独抽成函数是因为它被两处调用（表头点击、悬浮面板选字段），
 * 而两处必须给出**同一个**结果 —— 各写一遍就会出现「点表头和点面板
 * 同一字段得到不同方向」这种莫名其妙的行为。
 */
export function defaultSortDir(key) {
  return sortField(key)?.descFirst ? "desc" : "asc";
}

/** 规范化排序方向：只有 "asc" / "desc" 两个合法值，其它一律落回 asc。 */
export function normalizeSortDir(dir) {
  return dir === "desc" ? "desc" : "asc";
}

function currentSongList() {
  const { view, playlistId, playlists, queue, songs } = state;
  // 曲库视图不需要任何 id 映射（直接用 songs 本身），先把这个最常见的情况短路掉。
  if (view !== "queue" && !(view === "playlist" && playlistId)) return songs;

  // ★ 必须复用 songIndex，**绝不能**在这里再建一次 Map。
  //
  // 这里原来是 `const byId = new Map(songs.map((s) => [s.id, s]));`，而本函数
  // 由 commit() → recalcVisible() 无条件调用，commit() 又被 <audio>.timeupdate
  // 按约 4 次/秒驱动 —— 于是每帧广播都要为整个曲库重建一次 Map（每个元素还会
  // 先分配一个 [id, song] 二元数组，纯垃圾）。实测（node）：
  //   5,000 首 0.56ms/次、20,000 首 2.4ms/次、100,000 首 22ms/次，
  // 改走 songIndex 后同样的循环分别是 0.047 / 0.23 / 1.36ms，快 10~16 倍。
  //
  // songIndex 在 recalcVisible() 里维护，且已经有正确的重建条件
  //（state.songs 换了引用才重建），所以这里读它是安全的。
  const byId = songIndex;
  if (view === "queue") {
    // 在线试听曲目不在 songs 里（见 initialState 的说明），但队列里有它的 id。
    // 只在 songs 里查会让整行消失，且 DOM 下标与 state.queue 下标错位 ——
    // 表现就是「拖拽移动的不是用户拖的那首」。
    return queue.map((id) => byId.get(id) || state.onlineSongs.get(id)).filter(Boolean);
  }
  const pl = playlists.find((p) => p.id === playlistId);
  return (pl?.songIds || []).map((id) => byId.get(id) || state.onlineSongs.get(id)).filter(Boolean);
}

/**
 * 可见列表的**输入签名**。
 *
 * 用「引用 + 原始值」逐个比较（不是拼字符串：把对象引用拼成字符串会退化成
 * "[object Object]"，完全没有区分度）。这几项覆盖了列表内容的所有来源：
 *   · 视图 / 歌单 id / 查询词 / 排序键与方向 —— 原始值；
 *   · 曲库数组 / 队列数组 / 歌单的 songIds —— 引用（这三者都是整体替换，
 *     从不原地改元素，见 visibleFingerprint 的说明）；
 *   · playlistVersion / onlineSongs.size —— 兜底，覆盖原地修改的情况。
 */
function visibleInputs() {
  const pl = state.view === "playlist" && state.playlistId ? playlistById(state.playlistId) : null;
  return [
    state.view,
    state.playlistId,
    state.query,
    state.sortKey,
    state.sortDir,
    state.songs,
    state.songs.length,
    state.queue,
    state.queue.length,
    pl ? pl.songIds : null,
    pl ? pl.songIds.length : 0,
    state.playlistVersion,
    state.onlineSongs.size,
  ];
}

function sameVisibleInputs(next) {
  if (!visibleInputsCache || visibleInputsCache.length !== next.length) return false;
  for (let i = 0; i < next.length; i += 1) {
    if (visibleInputsCache[i] !== next[i]) return false;
  }
  return true;
}

/** 上一次 recalcVisible 的输入签名与结果 */
let visibleInputsCache = null;
let visibleResultCache = null;
/** 上一次重建 songIndex 时所依据的曲库数组（引用比较） */
let songIndexSource = null;

/**
 * 曲库 id → song 的索引。
 *
 * 声明位置必须在 currentSongList() **之前**：本模块是 ESM，`let` 有暂时性死区，
 * 虽然 recalcVisible() 只在模块求值完成后才可能被调用（不会被 TDZ 拦住），
 * 但把声明放在 200 行之后属于「靠调用时机侥幸成立」，很容易在后续重构里踩坑。
 *
 * 重建条件：state.songs 换了引用（曲库永远整体替换、从不原地改字段），
 * 由 recalcVisible() 在 computeVisible() 之前维护。
 */
let songIndex = new Map();

/* --------------------------------------------------------------------------
   曲库筛选的「小写索引」
   --------------------------------------------------------------------------
   为什么需要：筛选框每敲一个字都要拿 query 与每首歌的 title/artist/album/ext
   比一次，而原来的写法对**每首歌每次**都调 4 次 toLowerCase() ——
   10,000 首 × 每键 4 次 = 每次按键 4 万次字符串分配。

   改法：把「每首歌的小写拼接串」缓存成一张 Map，按 **曲库数组引用**失效
   （state.songs 永远整体替换、从不原地改字段，所以引用比较是可靠的判据，
   与 songIndex / visibleInputs 用的是同一套约定）。

   为什么拼成一个串而不是存 4 个字段：筛选语义是「任一项命中即保留」，
   拼成 `title\0artist\0album\0ext` 后一次 includes() 就能判定，
   把每首歌的比较从 4 次降到 1 次。用 \0 分隔是为了避免
   ["ab","c"] 与 ["a","bc"] 这种跨界误命中（与 visibleFingerprint 同思路）。
   -------------------------------------------------------------------------- */
let haystackSource = null;
let haystackIndex = new Map();

/** 筛选用的分隔符。用 \0 是避免 ["ab","c"] 与 ["a","bc"] 这种跨界误命中。 */
const HAY_SEP = "\u0000";

function ensureHaystack(list) {
  if (haystackSource === list) return haystackIndex;
  const next = new Map();
  for (const s of list) {
    next.set(
      s.id,
      `${s.title}${HAY_SEP}${s.artist}${HAY_SEP}${s.album}${HAY_SEP}${s.ext}`.toLowerCase()
    );
  }
  haystackSource = list;
  haystackIndex = next;
  return next;
}

/**
 * 按查询词筛选（导出以便直接测试 —— 这是「静默少歌」最该被钉住的一处）。
 *
 * 语义与迁移前逐字段比较**完全一致**：query 命中 title/artist/album/ext 任一项即保留。
 * 索引只是把「4 次 toLowerCase + 4 次 includes」换成「1 次 includes」。
 *
 * @param {Array} list 待筛选的歌曲
 * @param {string} query 原始查询词（内部自行 trim + 小写）
 */
export function filterByQuery(list, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return list;

  // 查询串含分隔符时不能走索引：\0 天然出现在拼接处，会让 includes("\0")
  // 命中**所有**歌曲，与逐字段比较的结果不同。正常输入不可能含 \0，
  // 但语义必须严格一致，所以这里显式退回慢路径。
  if (q.includes(HAY_SEP)) {
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q) ||
        s.ext.toLowerCase().includes(q)
    );
  }

  const hay = ensureHaystack(list);
  return list.filter((s) => {
    const h = hay.get(s.id);
    // 索引缺失（理论上不该发生）时退回逐字段比较，绝不因为索引问题漏歌
    if (h === undefined) {
      return (
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q) ||
        s.ext.toLowerCase().includes(q)
      );
    }
    return h.includes(q);
  });
}

/** 真正要花时间的那部分：取上下文 + 过滤 + 排序 */
function computeVisible() {
  const list = currentSongList();
  const out = filterByQuery(list, state.query);

  // 播放列表（队列）视图**不排序**：队列顺序本身就是数据（用户拖拽排序的结果），
  // 再按 sortKey 排一次会把拖拽效果整个抹掉 —— 这正是「拖拽后提示成功、
  // 界面却没变化」的原因。队列的排序由用户拖拽决定。
  if (state.view === "queue") return out;
  return computeSorted(out);
}

/**
 * 按当前（或指定）排序设置给歌曲列表排序。
 *
 * 抽成纯函数有两个理由：
 *  1. 它是「升序/降序到底对不对」这个问题的唯一判定点，必须能直接测
 *     （见 frontend/tests/sort.test.js）；
 *  2. 队列视图要**跳过**它 —— 把「跳不跳」留在调用点，比在这个函数里
 *     偷偷读 state.view 更容易看明白（也更难被误改）。
 *
 * @param {Array} list 待排序的歌曲
 * @param {{key?:string, dir?:string}} [sort] 排序设置；省略时读 state
 */
function computeSorted(list, sort) {
  const key = sort?.key ?? state.sortKey;
  const dir = normalizeSortDir(sort?.dir ?? state.sortDir);
  const cmp = SORTERS[key];
  if (!cmp) return list;
  const sign = dir === "desc" ? -1 : 1;
  // slice() 再排：不能就地改调用方传进来的数组（那是曲库/队列本身）
  //
  // ★ 比较函数相同时必须返回 0 的稳定性：Array.prototype.sort 在现代
  // 引擎里是稳定排序，所以「按添加时间」相同时会保留原有相对顺序 ——
  // 这正是「同一天导入的歌顺序不会莫名其妙变来变去」的依据。
  return list.slice().sort((a, b) => {
    const r = cmp(a, b);
    return r === 0 ? 0 : r * sign;
  });
}

function recalcVisible() {
  // ★ 输入没变就直接复用上一次的结果，整段重算跳过。
  //
  // 为什么必须加这一层：commit() 到处都在调（音量滑动、进度、开关、后端事件…），
  // 而下面原本无条件做 1~2 次全量 Map、一次带 localeCompare 的全量排序、
  // 一次全量指纹遍历，外加一次全量 Map 重建 songIndex。
  // 实测 5,000 首一次 ≈ 20ms（超过一帧预算）；扫描期间后端每 40 个文件推一次
  // 进度，20,000 首就是 500 次 ≈ 10 秒的纯主线程占用。
  //
  // 正确性：列表内容完全由 visibleInputs() 决定，输入相同则结果必然相同；
  // 而指纹只在输入变化时才重算，也就不会漏掉版本号自增（见下面的说明）。
  // ★ songIndex 必须在 computeVisible() **之前**重建：
  // currentSongList（队列 / 歌单视图）现在直接读它，顺序反了就会读到上一轮的
  // 索引 —— 曲库刚被整体替换（重扫完成）时表现为「列表少了几首 / 多了几首」。
  // 重建条件仍然是引用比较（曲库永远整体替换、从不原地改），所以正常情况下这里
  // 只是一次指针比较，不产生任何分配。
  if (songIndexSource !== state.songs) {
    songIndex = new Map(state.songs.map((s) => [s.id, s]));
    songIndexSource = state.songs;
  }

  const inputs = visibleInputs();
  if (!sameVisibleInputs(inputs)) {
    visibleInputsCache = inputs;
    visibleResultCache = computeVisible();
  }
  const out = visibleResultCache;

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
  // id → song 索引（songIndex）的重建已经提到 computeVisible() 之前，见上面的说明。
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

/**
 * 歌单数据变了（新增/改名/删除/增删歌曲/排序）。
 *
 * 为什么要显式版本号：歌单是**原地修改**的（`pl.name = …`、`pl.songIds = …`），
 * 组件做依赖比较时看引用永远相等，侧边栏就会停在旧内容上。
 * 迁移前靠 renderKey 里手工拼一长串 "id:name:count" 来兜住这件事。
 */
function bumpPlaylists() {
  state.playlistVersion = (state.playlistVersion || 0) + 1;
}

/**
 * 把「乐观更新」同步到后端；失败必须让用户知道。
 *
 * 这些调用以前是纯 fire-and-forget（不 await、不 catch）：失败时内存里已经是
 * 「成功」的样子，全局 unhandledrejection 只弹一条 toast，前后端状态**静默分叉**
 * —— 用户的改动重启后就没了，而且日志里没有任何线索指向「后端写入失败」。
 */
function syncToBackend(label, promise) {
  if (!promise || typeof promise.catch !== "function") return;
  promise.catch((err) => {
    console.error(`[store] ${label}写入后端失败，内存状态可能已与后端不一致`, err);
    toast(`${label}保存失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
  });
}

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
    liked.songIds = set.has(songId) ? uniq([...liked.songIds, songId]) : liked.songIds.filter((id) => id !== songId);
    bumpPlaylists();
  }
  // immediate：爱心按钮的按下态要跟着这次点击立刻变化。
  // 默认的 rAF 合并会让底栏比点击慢一帧，用户看到的就是"点了没反应"。
  commit(undefined, { immediate: true });
  if (isWails()) syncToBackend("收藏状态", backend.toggleLike(songId));
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
  bumpPlaylists();
  commit();
  if (isWails()) syncToBackend("新建歌单", backend.createPlaylist(clean));
  return pl;
}

export function renamePlaylist(id, name) {
  const pl = playlistById(id);
  if (!pl || pl.locked) return false;
  const clean = String(name || "").trim();
  if (!clean) return false;
  pl.name = clean;
  bumpPlaylists();
  commit();
  if (isWails()) syncToBackend("重命名歌单", backend.renamePlaylist(id, clean));
  return true;
}

export function deletePlaylist(id) {
  const pl = playlistById(id);
  if (!pl || pl.locked) return false;
  state.playlists = state.playlists.filter((p) => p.id !== id);
  bumpPlaylists();
  if (state.playlistId === id) {
    state.view = "library";
    state.playlistId = null;
  }
  commit();
  if (isWails()) syncToBackend("删除歌单", backend.deletePlaylist(id));
  return true;
}

export function addSongsToPlaylist(id, songIds) {
  const pl = playlistById(id);
  if (!pl) return 0;
  const before = pl.songIds.length;
  pl.songIds = uniq([...pl.songIds, ...songIds]);
  if (id === LIKED_ID) state.likedIds = new Set(pl.songIds);
  bumpPlaylists();
  commit();
  if (isWails()) syncToBackend("添加歌曲", backend.addSongsToPlaylist(id, songIds));
  return pl.songIds.length - before;
}

export function removeSongsFromPlaylist(id, songIds) {
  const pl = playlistById(id);
  if (!pl) return 0;
  const drop = new Set(songIds);
  const before = pl.songIds.length;
  pl.songIds = pl.songIds.filter((x) => !drop.has(x));
  if (id === LIKED_ID) state.likedIds = new Set(pl.songIds);
  bumpPlaylists();
  commit();
  if (isWails()) syncToBackend("移除歌曲", backend.removeSongsFromPlaylist(id, songIds));
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
  bumpPlaylists();
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
  state.forcedNextId = "";
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
  // 随机模式下队列位置决定不了下一个播哪首，用显式标记保证「下一曲」先放它
  if (state.playMode === "shuffle") state.forcedNextId = songId;
  commit();
}

export function removeFromQueue(songId) {
  // 下标必须在**过滤之前**取：原来的写法先 filter 再 indexOf(songId)，
  // 而此时 songId 已经被删掉了，indexOf 必然返回 -1，于是 currentId 被置成
  // queue[-1] → null，播放直接停掉（而不是顺延到下一首）。
  const i = state.queue.indexOf(songId);
  state.queue = state.queue.filter((id) => id !== songId);
  if (state.forcedNextId === songId) state.forcedNextId = "";
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
  state.forcedNextId = "";
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

/**
 * 把一首歌从内存曲库里摘掉（**不动磁盘文件**）。
 *
 * 场景：播放时确认某个文件放不出来（见 audio.js#reportUnplayable）。
 * 后端已经把它从曲库摘了，前端这边必须跟上 —— 否则列表里还留着，
 * 用户再点一次就是同样的失败，而「每次点到都失败」正是要消除的体验。
 *
 * 三处都要改，缺一处就会不一致：
 *   · allSongsRaw —— 过滤引擎的输入（设置页的「共扫描 N 个文件」也读它）
 *   · songs       —— 过滤后的结果，列表渲染读它
 *   · queue       —— 播放队列（留着会让「下一首」跳到一首已经没了歌）
 *
 * 刻意**不**走 recalcVisible 之外的捷径：改完统一 commit()，
 * songIndex 会按 songs 引用变化自动重建（见 recalcVisible 的说明）。
 */
export function removeSongFromLibrary(songId) {
  if (!songId) return false;
  const before = state.allSongsRaw.length;
  const keptRaw = state.allSongsRaw.filter((s) => s.id !== songId);
  if (keptRaw.length === before && !state.onlineSongs.has(songId)) return false;

  state.allSongsRaw = keptRaw;
  state.songs = state.songs.filter((s) => s.id !== songId);
  state.queue = state.queue.filter((id) => id !== songId);
  state.onlineSongs.delete(songId);

  // 被摘掉的正好是当前播放的那首：把 currentId 清掉（播放链路自己会处理
  // 跳转，这里只管状态一致，避免底栏显示一首已经不存在的歌）
  if (state.currentId === songId) state.currentId = null;

  // 列表重绘不需要额外版本号：commit 里 recalcVisible 会按**内容**算出
  // 新的可见指纹并自增 visibleVersion（见那里的说明）。这里改的是数组
  // 引用，所以 songIndex 的重建也会跟着发生。
  commit();
  return true;
}

/* --------------------------------------------------------------------------
   「放不出来」的文件清单
   --------------------------------------------------------------------------
   数据源是后端（见 Go 侧 services_unplayable.go）：只有在**播放时**实测
   失败的文件才会进这个清单 —— 扫描时逐首校验要为全库每首起一个 ffmpeg
   进程，而播放失败意味着解码本来就已经发生过了，登记它是零额外成本。

   清单展示在「设置 → 音乐文件夹」里，用户点一下能看到具体是哪些文件、
   失败原因是什么，并可以逐个忽略或清空。
   -------------------------------------------------------------------------- */

/** 从后端拉取清单（启动时与收到 library:unplayable 事件时调用） */
export async function loadUnplayableFiles() {
  if (!isWails()) {
    // 预览模式：没有后端，直接标成「已加载」以便界面显示空态
    state.unplayableLoaded = true;
    commit();
    return [];
  }
  const list = await backend.unplayableList();
  state.unplayableFiles = Array.isArray(list) ? list : [];
  state.unplayableLoaded = true;
  commit();
  return state.unplayableFiles;
}

/** 展开 / 收起清单面板（设置页里点「查看是哪些文件」） */
export function toggleUnplayableOpen(open = null) {
  state.unplayableOpen = open === null ? !state.unplayableOpen : Boolean(open);
  // 首次展开时如果还没拉到数据，顺手拉一次 —— 用户点了就该看到内容，
  // 而不是一个空面板加一句「加载中」停在那儿。
  if (state.unplayableOpen && !state.unplayableLoaded) {
    loadUnplayableFiles().catch(() => {});
  }
  commit();
}

/**
 * 从清单里移除一条记录（用户在设置页点「忽略」）。
 *
 * 语义：**只把提示抹掉，不改曲库**。这首歌仍然不在曲库里（后端登记时
 * 已经摘掉了）—— 想让它可以重新进曲库要用 restoreUnplayable()。
 */
export async function dismissUnplayable(songId) {
  if (!songId) return false;
  const before = state.unplayableFiles.length;
  state.unplayableFiles = state.unplayableFiles.filter((f) => f.songId !== songId);
  commit();
  if (!isWails()) return state.unplayableFiles.length !== before;

  try {
    await backend.unplayableRemove(songId);
  } catch (err) {
    // 后端删失败就把本地也还原，避免「界面上没了、重启又回来」
    console.warn("[store] 移除「放不出来」记录失败", err);
    await loadUnplayableFiles().catch(() => {});
    return false;
  }
  return true;
}

/**
 * 忘掉一首歌的失败记录，**并让它允许重新进曲库**。
 *
 * 用户修好了文件（或换了张能读的盘）之后走这条：清掉记录 → 重新扫描，
 * 这首歌就会正常回到曲库里。
 */
export async function restoreUnplayable(songId, { rescan = true } = {}) {
  if (!songId) return false;
  const ok = await dismissUnplayable(songId);
  if (ok && rescan) {
    // 重新扫描才会重新遍历磁盘、把它重新收进曲库
    rescan({ silent: false }).catch(() => {});
  }
  return ok;
}

/** 清空整个清单 */
export async function clearUnplayable() {
  const n = state.unplayableFiles.length;
  state.unplayableFiles = [];
  commit();
  if (!isWails()) return n;
  try {
    await backend.unplayableClear();
  } catch (err) {
    console.warn("[store] 清空「放不出来」清单失败", err);
    await loadUnplayableFiles().catch(() => {});
    return 0;
  }
  return n;
}

/* --------------------------------------------------------------------------
   版本更新（见 Go 侧 services_update.go）
   --------------------------------------------------------------------------
   前端在这里只是「后端状态的投影」：检查结果、下载进度、待安装的包
   全部由后端推事件过来，前端不自己算任何东西。

   为什么不做乐观更新：更新会替换用户的程序文件。界面上写「已是最新版」
   而实际检查失败，用户就再也不会去手动看一眼了 —— 这个方向上的错误
   代价很大，所以宁可显示「检查失败，点重试」。

   浏览器预览模式下这些方法都是安全的空操作（backend.* 返回 null），
   界面会显示「预览模式不支持」的提示。
   -------------------------------------------------------------------------- */

/** 拉一次后端状态（界面打开时调用，让刷新后的界面立刻有内容） */
export async function loadUpdateState() {
  if (!isWails()) return state.update;
  const snapshot = await backend.updateState();
  if (snapshot && typeof snapshot === "object") applyUpdateSnapshot(snapshot);
  return state.update;
}

/**
 * 标记「update 这一块变了」。
 *
 * 正常情况下**不需要手动调** —— commit() 会自动推进版本号（见那里的说明）。
 * 留着它是给「改了 state.update 但暂时不想 commit」这种少见场景用的
 * （例如批量改完再统一提交时，中途想让界面先反映一部分）。
 *
 * 注意：只改 state.update 的字段而既不 commit 也不调这个函数，
 * 界面就不会有任何反应，而且不会报错。
 */
export function touchUpdate() {
  state.updateRev = (state.updateRev || 0) + 1;
}

/** 把后端的状态快照合并进 state.update */
function applyUpdateSnapshot(snapshot) {
  const u = state.update;
  if (snapshot.check) u.check = snapshot.check;
  if (typeof snapshot.checking === "boolean") u.checking = snapshot.checking;
  if (typeof snapshot.downloading === "boolean") {
    // 后端说没在下载，而我们这边还挂着进度条：那是上一次下载结束后
    // 事件没收到（比如界面刷新过），清掉它，免得进度条永远停在那儿。
    if (!snapshot.downloading) u.progress = null;
  }
  if (snapshot.channel) u.channel = String(snapshot.channel);
  if (typeof snapshot.checkOnStart === "boolean") u.checkOnStart = snapshot.checkOnStart;
  if (typeof snapshot.skippedVersion === "string") u.skippedVersion = snapshot.skippedVersion;
  if (snapshot.pending) {
    u.pending = snapshot.pending;
  } else if (!snapshot.downloading) {
    u.pending = null;
  }
  touchUpdate();
  commit();
}

/** 检查更新。force=true 时忽略「跳过此版本」。 */
export async function checkForUpdate({ force = false } = {}) {
  const u = state.update;
  if (u.checking) return null;
  u.checking = true;
  u.error = "";
  commit();

  if (!isWails()) {
    // 预览模式：编一个「已是最新版」出来，让界面不至于卡在加载态。
    // 明确不写成「有更新」—— 那会让预览看起来像是真的能升级。
    u.checking = false;
    u.check = {
      current: state.appVersion || APP_VERSION_FALLBACK,
      latest: state.appVersion || APP_VERSION_FALLBACK,
      hasUpdate: false,
      assetAvailable: false,
      checkedAt: Date.now(),
      error: "浏览器预览模式无法联网检查更新",
    };
    commit();
    return u.check;
  }

  try {
    const res = await backend.updateCheck(force);
    if (res) {
      u.check = res;
      // 后端在检查失败时会带 error；如果这次检查成功了，清掉上一次的旧错误
      u.error = res.error || "";
    }
  } catch (err) {
    u.error = String(err?.message ?? err);
    console.warn("[store] 检查更新失败", err);
  } finally {
    u.checking = false;
    commit();
  }
  return u.check;
}

/** 下载上次检查发现的新版本 */
export async function downloadUpdate() {
  const u = state.update;
  if (!isWails()) {
    u.error = "浏览器预览模式无法下载更新";
    commit();
    return null;
  }
  if (!u.check?.downloadUrl) {
    u.error = "没有可下载的安装包";
    commit();
    return null;
  }

  u.error = "";
  // 先摆一个「0%，正在连接」的进度：后端的第一条事件要等它连上才来，
  // 中间那段时间界面什么都不显示的话，用户会以为按钮没生效。
  u.progress = { percent: -1, done: 0, total: u.check.assetSize || 0, message: "正在连接…", attempt: 1 };
  commit();

  try {
    const res = await backend.updateDownload();
    if (res?.path) {
      u.pending = {
        name: u.check.assetName,
        path: res.path,
        bytes: res.bytes,
        verified: res.verified,
        mirrorId: res.mirrorId,
      };
    }
    u.progress = null;
  } catch (err) {
    u.error = String(err?.message ?? err);
    u.progress = null;
    console.warn("[store] 下载更新失败", err);
  } finally {
    commit();
  }
  return u.pending;
}

/** 取消正在进行的下载 */
export async function cancelUpdateDownload() {
  if (!isWails()) return false;
  try {
    const ok = await backend.updateCancel();
    if (ok) {
      state.update.progress = null;
      commit();
    }
    return Boolean(ok);
  } catch (err) {
    console.warn("[store] 取消下载失败", err);
    return false;
  }
}

/**
 * 安装已下载的更新并重启。
 *
 * 调用之后应用会退出，因此这里**不会**有「安装成功」的返回值 ——
 * 成功表现为「程序重启并变成新版本」。失败（比如脚本起不来）
 * 才会返回错误，那时界面必须把原因显示出来，否则用户只知道
 * 「点了安装，然后什么都没发生」。
 */
export async function installUpdate() {
  const u = state.update;
  if (!isWails()) {
    u.error = "浏览器预览模式无法安装更新";
    commit();
    return false;
  }
  if (!u.pending) {
    u.error = "还没有下载好可安装的更新";
    commit();
    return false;
  }
  u.error = "";
  commit();
  try {
    await backend.updateInstall();
    return true;
  } catch (err) {
    u.error = String(err?.message ?? err);
    commit();
    console.warn("[store] 安装更新失败", err);
    return false;
  }
}

/** 切换下载通道（auto 或某个代理 id） */
export async function setUpdateChannel(id) {
  const u = state.update;
  const before = u.channel;
  u.channel = String(id || "auto");
  commit();
  if (!isWails()) return u.channel;

  try {
    await backend.updateSetChannel(u.channel);
  } catch (err) {
    // 后端拒绝就还原 —— 让界面显示的值始终是后端真正用的那个
    u.channel = before;
    commit();
    console.warn("[store] 设置下载通道失败", err);
  }
  return u.channel;
}

/** 开关「启动时自动检查更新」 */
export async function setUpdateCheckOnStart(on) {
  const u = state.update;
  const next = Boolean(on);
  u.checkOnStart = next;
  commit();
  if (!isWails()) return next;
  try {
    await backend.updateSetCheckOnStart(next);
  } catch (err) {
    u.checkOnStart = !next;
    commit();
    console.warn("[store] 设置自动检查失败", err);
  }
  return u.checkOnStart;
}

/** 跳过某个版本（传空字符串取消跳过） */
export async function skipUpdateVersion(version = "") {
  const u = state.update;
  const next = String(version ?? "");
  u.skippedVersion = next;
  if (u.check && !next) {
    // 取消跳过之后要重新算一次「有没有更新」——否则界面会一直显示
    // 「已跳过」，即使它的版本已经比当前新。
    u.check = { ...u.check, hasUpdate: false };
  }
  commit();
  if (!isWails()) return next;
  try {
    await backend.updateSkipVersion(next);
    // 跳过后重新检查一次，让界面（和后端）的状态一致。
    // 取消跳过时尤其必要：不重新检查的话，提示不会回来。
    await checkForUpdate({ force: true });
  } catch (err) {
    console.warn("[store] 跳过版本失败", err);
  }
  return next;
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

/* --------------------------------------------------------------------------
   排序
   --------------------------------------------------------------------------
   排序是「字段 + 方向」两个维度，而它有三个入口：表头点击、排序悬浮面板、
   以及（历史上）工具栏下拉框。三个入口如果各自改 state，很容易出现
   「点表头是升序、点面板却成了降序」这种对不上的行为。

   所以真正改状态的动作收敛到下面这一个函数，各入口只负责决定
   「要哪个字段 / 要哪个方向」。
   -------------------------------------------------------------------------- */

/**
 * 设置排序字段。
 *
 * 换字段时的方向由 defaultSortDir 决定（时间类默认降序、文本类默认升序）。
 * 传 dir 可以显式指定方向（悬浮面板里「先选字段、再选方向」的情形：
 * 用户点了字段本身，我们按该字段的偏好给一个合理默认，他再想翻转就点方向）。
 */
export function setSort(key, dir) {
  if (!key || !SORTERS[key]) return;
  const changing = state.sortKey !== key;
  state.sortKey = key;
  if (dir) {
    state.sortDir = normalizeSortDir(dir);
  } else if (changing) {
    // 只在**换字段**时套用默认方向。
    //
    // 不在这里「同字段再点一次就翻转」：那个语义属于「切换」，
    // 由 toggleSort 负责。把它混进来会让「明确指定字段」这个动作
    // 意外地翻转方向 —— 比如从面板里再点一次当前字段，本该无变化。
    state.sortDir = defaultSortDir(key);
  }
  commit();
}

/** 设置排序方向（升序 / 降序）。 */
export function setSortDir(dir) {
  state.sortDir = normalizeSortDir(dir);
  commit();
}

/**
 * 切换排序：点的是当前字段就翻转方向，是别的字段就换过去并用它的默认方向。
 *
 * 这是「点表头」与「点面板里当前字段」共用的行为。
 */
export function toggleSort(key) {
  if (!key || !SORTERS[key]) return;
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDir = defaultSortDir(key);
  }
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
  // 用户主动播了别的歌：之前记的「下一首」标记作废
  if (state.forcedNextId && state.forcedNextId !== songId) state.forcedNextId = "";
  if (options.queue && options.queue.length) {
    state.queue = options.queue.slice();
    state.queueOrigin = options.origin ?? null;
  } else if (!state.queue.includes(songId)) {
    state.queue = uniq([...state.queue, songId]);
  }
  // 用户主动点播（不是自动跳下一首）：解除「这首歌放不出来」的闸门，
  // 允许再试一次。auto 场景由 playNext 直接调 playSong，不会走到这里。
  if (!options.auto) noteUserPlay(songId);
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
  state.forcedNextId = "";
  playSong(songIds[startIndex], { queue: songIds, origin });
}

export function togglePlay() {
  if (!state.currentId) {
    if (state.visibleSongs.length)
      playContext(
        state.visibleSongs.map((s) => s.id),
        0,
        currentContext()
      );
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
  // 「下一首播放」：随机模式下队列下标不代表播放顺序，先消费显式标记
  if (state.playMode === "shuffle" && state.forcedNextId) {
    const forced = state.forcedNextId;
    state.forcedNextId = "";
    if (state.queue.includes(forced) && forced !== state.currentId) {
      playSong(forced);
      return;
    }
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
  // 暂停状态下拖动进度条也要记住落点：<audio> 的 timeupdate 只在播放时来。
  noteProgress(state.position);
  commit();
  emit("player:seek", { ms });
}

/**
 * 记下当前歌曲的播放位置（毫秒）。
 *
 * 高频调用（<audio> 的 timeupdate 约每秒 4 次），所以这里只写内存：
 * 真正的落盘交给 persist() 的去抖与 beforeunload 时的 flushConfigSync()，
 * 不会因为拖着进度条就把 localStorage 写穿。
 */
export function noteProgress(ms) {
  const id = state.currentId;
  if (!id || state.config.resumeProgress !== true) return;
  if (!Number.isFinite(ms) || ms < 0) return;
  if (!state.progress || typeof state.progress !== "object") state.progress = {};
  state.progress[id] = Math.round(ms);
}

/** 快照里最多保留多少首歌的进度，避免长期使用后 localStorage 无限膨胀 */
const PROGRESS_MAX = 1500;

function pruneProgress(map) {
  const keys = Object.keys(map || {});
  if (keys.length <= PROGRESS_MAX) return map || {};
  // 对象属性按插入顺序排列：保留最后写入的 PROGRESS_MAX 首。
  const out = {};
  for (const key of keys.slice(keys.length - PROGRESS_MAX)) out[key] = map[key];
  return out;
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
  if (next !== state.playMode) {
    state.playMode = next;
    // 换了播放模式，之前记下的「下一首播放」落点不再适用
    state.forcedNextId = "";
  }
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

/**
 * 「是否已有真实音频在驱动进度」的判定，由 audio.js 在启动时注入。
 *
 * 为什么不在这里直接 import audio.js：store 是底层模块，audio.js 依赖
 * store（要用 commit/notify/seek），反过来 import 会形成循环依赖
 * （项目里已经因为 main → shell → settings 的链条踩过一次）。
 * 用一个注入口代替 import，判定逻辑仍然只有一处。
 */
let realAudioActiveProbe = null;

/** 由 audio.js 注册「真实音频是否接管了进度」的判定 */
export function setRealAudioProbe(fn) {
  realAudioActiveProbe = typeof fn === "function" ? fn : null;
}

/**
 * 「用户主动点播了某首歌」的钩子，由 audio.js 注入（理由同上面的 probe：
 * 避免 store → audio 的反向依赖）。
 *
 * 为什么需要它：audio.js 有一个「这首歌已判定放不出来」的闸门，
 * 用来防止坏文件被 tick 反复重试、错误提示刷屏。但那个闸门必须能被
 * **用户的主动点播**打开 —— 否则修好文件后再点它就完全没反应了。
 * 自动跳下一首（playNext）不触发这个钩子，正是为了不解除闸门。
 */
let userPlayHook = null;

/** 由 audio.js 注册「用户主动点播」的钩子 */
export function setUserPlayProbe(fn) {
  userPlayHook = typeof fn === "function" ? fn : null;
}

/** 通知钩子：用户主动点了这首歌（失败时不能影响点播本身） */
function noteUserPlay(songId) {
  if (!userPlayHook) return;
  try {
    userPlayHook(songId);
  } catch (err) {
    console.warn("[store] 用户点播钩子抛出异常（已忽略）", err);
  }
}

/** 是否已有真实音频在驱动进度（后端引擎或 <audio>） */
function audioEngineActive() {
  if (realAudioActiveProbe) {
    try {
      if (realAudioActiveProbe()) return true;
    } catch {
      /* 判定失败时退回下面的 <audio> 检查 */
    }
  }
  const node = document.getElementById("audio-engine");
  return Boolean(node && node.src);
}

export function startMockTicker() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    if (!state.playing || !state.currentId) return;
    if (audioEngineActive()) return; // 真实播放中，交给 <audio> 事件
    state.position += 250;
    noteProgress(state.position);
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
  bumpPlaylists();
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
      // 关掉「记忆音量」时不落盘（对象展开而不是整体赋值，避免多写两个默认值）
      ...(state.config.rememberVolume !== false ? { volume: state.volume, muted: state.muted } : {}),
      queue: state.queue,
      currentId: state.currentId,
      // 每首歌上次播到哪儿（见 noteProgress）。只在开关打开时才有内容。
      progress: pruneProgress(state.progress),
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
   后端是配置的唯一真源（%APPDATA%\LocalMusicPlayer\config.json）；
   localStorage 只在浏览器预览时兜底。
   -------------------------------------------------------------------------- */
const SYNCED_KEYS = [
  "theme",
  "themeMode",
  "glassBlur",
  "glassAlpha",
  "nativeBackdrop",
  "windowCorners",
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
  "autoStartDesktopWallpaper",
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
  "resumeProgress",
  "rememberVolume",
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

/**
 * 返回「后端回传的密钥占位串」。
 *
 * 后端不会把真密钥交给前端（services.go#maskSecret），而是回一个固定的
 * 占位串。前端的责任是：把这个值当成「这里本来有值，但我不该看到它」，
 * 既不显示、也不推回后端。
 *
 * 为什么不去硬编码那个占位串：它是 Go 侧的实现细节，前端复制一份常量
 * 就会在两处之间产生隐式耦合（改了一边忘另一边）。这里改用「配了密钥
 * 但值明显不是用户输入」的判断 —— 后端用 aiApiKeySet 明确告知「配了」，
 * 而 UI 的输入框永远是空的（用户不输入就没有新值），
 * 因此只要 aiApiKeySet 为真且当前值非空，就说明这个值来自后端回传。
 */
function keyPlaceholderOf(config) {
  if (!config || !config.aiApiKeySet) return null;
  const v = config.aiApiKey;
  return typeof v === "string" && v !== "" ? v : null;
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
  // ★ 绝不把密钥占位串推回后端。
  //
  // 后端 Get() 回传的 aiApiKey 是打码占位串（services.go#maskSecret），
  // 不是真密钥。正常情况下 UI 不会把它写进 state.config（见 settings.js
  // 的 ai-field 分支），但这里再加一道兜底：只要值不是用户**真正输入**的
  // 新密钥，就不推 —— 漏了这一道，用户在设置里改任何一个开关都可能
  // 顺手把自己的密钥覆盖成占位串。
  // 用户想清除密钥时 UI 会传空串，属于有效操作，因此只拦「非空且未变更」。
  if (
    typeof patch.aiApiKey === "string" &&
    patch.aiApiKey !== "" &&
    patch.aiApiKey === keyPlaceholderOf(state.config)
  ) {
    delete patch.aiApiKey;
  }
  patch.playMode = state.playMode;
  // 关闭「记忆音量」时不把音量推给后端，避免下次启动又被旧值覆盖
  if (state.config.rememberVolume !== false) {
    patch.volume = state.volume;
    patch.muted = state.muted;
  }
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
  if (state.config.rememberVolume !== false) {
    state.volume = typeof saved.volume === "number" ? saved.volume : state.volume;
    state.muted = Boolean(saved.muted);
  }
  if (saved.progress && typeof saved.progress === "object") {
    state.progress = saved.progress;
  }
  if (Array.isArray(saved.filterRules) && saved.filterRules.length) {
    state.filterRules = saved.filterRules;
  }
  if (Array.isArray(saved.folders) && saved.folders.length) {
    state.folders = saved.folders;
  }
  if (Array.isArray(saved.userPlaylists)) {
    const liked = state.playlists.find((p) => p.id === LIKED_ID);
    state.playlists = [liked, ...saved.userPlaylists].filter(Boolean);
    bumpPlaylists();
  }
  if (Array.isArray(saved.liked)) {
    const liked = playlistById(LIKED_ID);
    if (liked) liked.songIds = saved.liked.slice();
    state.likedIds = new Set(saved.liked);
    bumpPlaylists();
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

  // 恢复上次退出时的播放位置：只把进度条放到那儿，不自动开始播放。
  // 距离歌曲结尾太近（<3 秒）的位置没有恢复价值，按「从头开始」处理。
  if (state.config.resumeProgress === true) {
    const saved = Number(state.progress?.[state.currentId]);
    const dur = state.duration || 0;
    if (Number.isFinite(saved) && saved > 1000 && (!dur || saved < dur - 3000)) {
      state.pendingResumeMs = saved;
      state.position = saved;
    }
  }
  return true;
}

/**
 * 连接 Go 后端（若存在）并把真实数据灌进 state。
 * 浏览器预览下 connect() 会失败，直接返回 false，界面继续用假数据。
 */
export async function hydrateFromBackend() {
  const ok = await connect();
  if (!ok) return false;

  const [songs, folders, cfg, playlists, version] = await Promise.all([
    backend.songs(),
    backend.folders(),
    backend.getConfig(),
    backend.playlists(),
    // 版本号只影响「关于」卡片里的一行文本，失败不该拖垮整个启动流程
    backend.appVersion().catch(() => null),
  ]);
  if (version) state.appVersion = String(version);

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
    // 「记忆音量」关闭时，后端存着的旧音量也不还原
    if (state.config.rememberVolume !== false) {
      state.volume = typeof cfg.volume === "number" ? cfg.volume : state.volume;
      state.muted = Boolean(cfg.muted);
    }
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
    bumpPlaylists();
  }

  // 「放不出来」清单：启动时拉一次（清单本身通常只有几条）。
  // 不等它 —— 拉失败也不该挡住启动流程（它只是提示性的信息）。
  loadUnplayableFiles().catch(() => {});

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
  // ★ 只在预览模式播种假数据。
  //
  // 原实现无条件 seedFromMock()，于是真后端下启动瞬间会把 40 首假歌填进
  // state.songs 并渲染一帧 —— 用户看得见「别人的歌单」闪一下；
  // 更糟的是若 hydrateFromBackend() 拿不到数据（后端慢/抛错），
  // 这些假数据会一直留在界面上，看起来就像「我的曲库变成了别人的」。
  // 真后端下正确的初始状态是「空 + 加载中」，由空态/扫描遮罩负责表达。
  if (!isWails()) seedFromMock();
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

  // 整段包在 try/finally 里：以前只有成功路径会把 scanning 置回 false，
  // 于是 backend.scan() / backend.songs() 一旦 reject，「正在扫描」遮罩
  // 就永久挂在界面上（用户只能重启）。
  try {
    return await runRescan({ silent });
  } finally {
    state.scanning = false;
    commit();
  }
}

/** rescan 的实际流程（由 rescan 包住，负责收尾状态的清理） */
async function runRescan({ silent }) {
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
    // ★ 真后端（Wails）下**绝不能**回落到假数据。
    //
    // 这里原来是无条件 `raw = MOCK_SONGS.slice()`。后果不只是「预览里看到假歌」：
    // 真实后端下如果这次扫描返回空（所有文件夹都被拔掉 / 路径全失效 /
    // scan 返回了 started=false 且 songs() 为空），整个曲库会被
    // **40 首假歌覆盖**，用户以为自己的歌全没了。
    // 真正的「后端说这次没有歌」应当原样保留空结果，让界面显示空态。
    if (isWails()) return state.lastScan;
    // 预览模式（浏览器、无 Go 后端）：模拟一次耗时扫描
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
  commit();
  return state.lastScan;
}

/** 等待后端扫描结束并取回最新歌曲（最长等 10 分钟） */
function waitForScanDone() {
  return new Promise((resolve) => {
    let off = () => {};
    const timer = setTimeout(
      () => {
        off();
        backend.songs().then(resolve);
      },
      10 * 60 * 1000
    );

    // ★ 只等信号，**不再自己拉一次 songs()**。
    //
    // main.js 的全局 `scan:done` 处理器（main.js:250）已经在同一个事件里做过
    // 「拉全库 + 重算 + commit」。这里原来又 `await backend.songs()` 拉了一遍 ——
    // 也就是用户点一次「重新扫描」要传两遍整个曲库（10 万首就是两倍 IPC 载荷），
    // 而且两次结果可能落在不同的时序上、互相覆盖 state.allSongsRaw。
    //
    // 现在这里等一小段让 main.js 的处理器把数据落好，再从 state 里取 ——
    // 单次 IPC，且两条路径不会打架。
    off = on("scan:done", async () => {
      clearTimeout(timer);
      off();
      // 让出一次微/宏任务，确保 main.js 的处理器（同样监听 scan:done）已完成 commit
      await new Promise((r) => setTimeout(r, 0));
      resolve(Array.isArray(state.allSongsRaw) ? state.allSongsRaw : null);
    });
  });
}

export { DEFAULT_CONFIG, SORTERS, computeSorted };
