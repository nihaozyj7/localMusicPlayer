/* ==========================================================================
   main.js — 应用入口
   --------------------------------------------------------------------------
   职责：装配 store / 主题 / 侧边栏 / 内容区 / 播放控件 / 播放界面 / 快捷键
   ========================================================================== */

import { $, closeMenu, initTooltips, toast } from "./dom.js";
import { backend, isWails, on, startMockWatcher } from "./bridge.js";
import {
  applyRules,
  bootstrap,
  commit,
  coverVersion,
  currentSong,
  flushConfigSync,
  isLiked,
  nextIndex,
  playNext,
  playPrev,
  rescan,
  setCoverSet,
  setCoverSets,
  setVolume,
  songById,
  state,
  subscribe,
  toggleLike,
  togglePlay,
  startMockTicker,
} from "./store.js";
import {
  bindShell,
  doRescan,
  navigate,
  renderShell,
  refreshSettingsLayer,
  settingsLayerOpen,
  toggleSettings,
  openSettings,
} from "./shell.js";
import { initPlayerBar, paintPlayerBar, toggleQueuePanel } from "./playerbar.js";
import {
  applyVolume,
  applyGainForSong,
  syncAudio,
  refreshLoudnessGains,
  refreshLoudnessState,
  seekTo,
} from "./audio.js";
import {
  closePlayer,
  currentLyricLine,
  ensureLyricsLoaded,
  nextCover,
  openPlayer,
  preloadSkins,
  renderPlayerView,
  setPlayerViewMode,
  syncPlaybackState,
  togglePlayer,
} from "./playerhost.js";
import {
  applyResolvedTheme,
  applyCoverSeed,
  discoverThemes,
  extractCoverSeed,
  getTheme,
  normalizeSeed,
  seedSourceUsable,
} from "./theme.js";
import { coverOf } from "./utils.js";
import { refreshBackdropState } from "./backdrop.js";
import { desktopLyricsEnabled, pushDesktopLyrics } from "./desktop-lyrics.js";
import {
  desktopWallpaperEnabled,
  probeDesktopWallpaperSupport,
  pushDesktopWallpaper,
} from "./desktop-wallpaper.js";
import { syncDesktopModeButtons } from "./desktop-mode.js";
import { initSearchPanel } from "./searchpanel.js";
import { initDownloads } from "./downloads.js";
// 只为副作用而导入：它把底栏「手动匹配歌词」按钮（#btn-lyrics-match，静态写在
// index.html 里）接到在线歌词搜索面板上。缺了这行按钮就变成点不动的死按钮，
// 所以别再删掉 —— 以前它是运行时 inject 的，模块没被导入时按钮会直接消失。
import "./online.js";

/** 下载中的 toast（bvid → toast 句柄），进度事件复用同一条 */
const downloadToasts = new Map();

/* --------------------------------------------------------------------------
   增量渲染：根据「渲染键」决定是否重绘主体
   -------------------------------------------------------------------------- */
let lastKey = "";
/** 上一次「选中行」同步过的状态（见 paintTrackSelection） */
let lastSelection = { id: "\u0000", playing: null };

function renderKey() {
  return [
    state.view,
    state.playlistId ?? "",
    state.sortKey,
    state.sortDir,
    state.config.listDensity,
    // 专辑列显隐是「表格结构」级别的变化，必须在键里：
    // 否则表头右键切完之后状态变了、DOM 却没重绘（实测就是这个原因）
    state.config.showAlbumColumn === false ? "no-album" : "album",
    // 可见列表版本号（recalcVisible 里自增）：等价于「把全部 id 拼起来」，
    // 但每帧是 O(1)。以前这里每帧 map+join 整个列表，长列表下是纯粹的浪费。
    state.visibleVersion ?? 0,
    state.playlists.map((p) => `${p.id}:${p.name}:${p.songIds.length}`).join(","),
    state.songs.length,
    state.lastScan?.at ?? "",
    state.scanning ? "scan" : "",
    state.config.theme,
    state.config.themeMode,
    // 封面版本：封面变了要整张表重绘，否则「匹配完封面列表还是默认图」
    coverVersion(),
    // 歌单多选：进入/退出多选、勾选变化都要重绘（勾选框在行内）
    state.playlistSelecting ? "sel" : "",
    [...state.selectedIds].join(","),
  ].join("|");
}

/**
 * 曲目列表的「选中行」= 当前播放行。
 *
 * 单一真源是 state.currentId：列表里不再各自维护一份选中状态
 * （以前 CSS 里有 .track[data-selected] 但没有任何代码写过它，而高亮用的是
 * aria-current —— 两个概念各写一半，于是「列表高亮和正在播放的不是一首歌」）。
 * 这里在**不重建整张表**的前提下把 aria-current / data-playing 对齐到 currentId，
 * 这样切歌（包括自动下一首、随机播放）都能立刻同步，长列表也不会全量重绘。
 */
function paintTrackSelection(rebuilt = false) {
  const current = state.currentId ?? "";
  // 每帧遍历整张表是没有意义的：只有「当前曲目 / 播放状态」变了才需要改，
  // 表格刚重建时行是新的，必须无条件重画一次。
  if (!rebuilt && lastSelection.id === current && lastSelection.playing === state.playing) return;
  lastSelection = { id: current, playing: state.playing };
  const rows = document.querySelectorAll(".track");
  if (!rows.length) return;
  rows.forEach((row) => {
    const isCurrent = row.dataset.id === current;
    const marked = row.getAttribute("aria-current") === "true";
    if (isCurrent !== marked) row.setAttribute("aria-current", String(isCurrent));
    const playing = isCurrent && state.playing ? "true" : "false";
    if (row.dataset.playing !== playing) row.dataset.playing = playing;
  });
}

function tick() {
  applyDensity();
  const key = renderKey();
  let rebuilt = false;
  if (key !== lastKey) {
    lastKey = key;
    renderShell();
    rebuilt = true;
  }
  // 选中行同步必须在 renderShell 之后：重建表格时行是新的，要重新对齐一次
  paintTrackSelection(rebuilt);
  paintPlayerBar();
  syncCoverAccent();
  renderPlayerView();
  paintDesktopLyrics();
  paintDesktopWallpaper();
  syncPlaybackState();
  // 真实播放：切歌 / 播放暂停状态变化时同步到 <audio>，并套用响度补偿
  syncAudio();
  applyGainForSong();
}

/**
 * 把「列表密度」写到根元素（<html>）上。
 *
 * 为什么挂在根元素而不是 #app 或各个 .tracks 上：密度是全局显示设置，要同时
 * 对曲目表格（本地歌曲 / 播放列表 / 歌单）、底部播放列表面板、搜索结果列表生效。
 *  - 只写在 .tracks 上的话，底部播放列表面板（.queue-item）完全不跟着变；
 *  - 只写在 #app 上的话也不行 —— 播放列表面板 / 选项面板 / 搜索弹层都是
 *    #app **之外**的浮层（见 index.html），同样漏掉。
 * 这里每次 tick 都写一次（值没变时直接返回，几乎零成本），
 * 这样任何改动密度的入口都不需要记得手动同步。
 */
function applyDensity() {
  const root = document.documentElement;
  const next = state.config.listDensity || "cozy";
  if (root.dataset.density !== next) root.dataset.density = next;
}

/**
 * 桌面歌词：每帧算出「当前该显示的一行」，推给独立的透明窗口。
 *
 * 真实应用里歌词画在**独立窗口**上（desktop-lyrics.js → Go 后端 → 事件广播）；
 * 浏览器预览没有第二个窗口，降级成主窗口内的悬浮条（见 desktop-lyrics.js）。
 * 这里只负责算当前行：具体推送到哪里由 desktop-lyrics.js 决定。
 */
function paintDesktopLyrics() {
  const enabled = desktopLyricsEnabled();
  // 详情页没打开时歌词还没装载，这里补一次（有缓存/进行中会直接返回）
  if (enabled && state.playing) ensureLyricsLoaded();
  const text = enabled && state.playing ? currentLyricLine() : "";
  pushDesktopLyrics({
    text,
    playing: Boolean(state.playing),
    // 桌面歌词是「隔着整个桌面看」的，比详情页里的歌词字号放大一点才看得清
    fontSize: Math.round((Number(state.config.lyricsFontSize) || 16) * 1.5),
  });
}

/**
 * 桌面背景歌词：每帧把当前画面推给那个铺在桌面图标之下的窗口。
 *
 * 与桌面歌词是**同构**的，区别只在推什么：那个窗口挂的是详情页的同一个皮肤，
 * 所以推过去的是皮肤契约里的整套数据（曲目 / 封面集合 / 已解析歌词 / 进度 /
 * 设置 / 主题），而不是「三行歌词 + 一张缩略图」。
 *
 * 数据的取用、去重与限流都在 desktop-wallpaper.js 里 —— 那边拿的是 playerhost
 * 的同一份快照，这里不重新算，避免「桌面上显示的是上一首」。
 *
 * 这里仍然要补一次 ensureLyricsLoaded：详情页没打开时歌词不会自己装载，
 * 而桌面上那个皮肤同样需要歌词行。
 */
function paintDesktopWallpaper() {
  if (desktopWallpaperEnabled() && state.playing) ensureLyricsLoaded();
  pushDesktopWallpaper();
}

/* --------------------------------------------------------------------------
   主题
   -------------------------------------------------------------------------- */
function updateThemeButton() {
  const t = getTheme(state.config.theme);
  const isDark = t?.mode !== "light";
  const btn = $("#btn-theme-toggle");
  if (!btn) return;
  btn.innerHTML = `<svg><use href="#i-${isDark ? "sun" : "moon"}"/></svg>`;
  btn.dataset.tip = isDark ? "切换到浅色" : "切换到深色";
}

async function initTheme() {
  await discoverThemes();
  // 取色必须在套主题之前：--bg-app / --glass-bg 都是从 --seed 派生的，
  // 先套一遍主题再用新种子套第二遍，就是启动时那一下「先黑再变色」。
  await primeCoverAccent();
  await applyResolvedTheme(state.config);
  updateThemeButton();
  // 之后每次换歌 / 换封面由主循环的 syncCoverAccent 兜住（见上）

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", async () => {
    if (state.config.themeMode === "system") {
      await applyResolvedTheme(state.config);
      updateThemeButton();
      commit();
    }
  });
}

async function toggleTheme() {
  const resolved = getTheme(state.config.theme);
  const nextMode = resolved?.mode === "light" ? "dark" : "light";
  state.config.themeMode = nextMode;
  await applyResolvedTheme(state.config);
  updateThemeButton();
  commit();
  toast(nextMode === "dark" ? "已切换到深色主题" : "已切换到浅色主题", { duration: 1500 });
}

/* --------------------------------------------------------------------------
   封面缓存回填
   --------------------------------------------------------------------------
   用户换过的封面写在缓存目录里（缓存才是真相来源），但前端的 coverOverrides
   只是一张内存表。不回填的话，重启应用后换过的封面就「消失」了（除非用户
   开了「把封面写进歌曲文件」）。这里启动时一次性把缓存里的封面灌回来。
   -------------------------------------------------------------------------- */
async function hydrateCachedCovers() {
  if (!isWails()) return;
  try {
    const map = await backend.coverCachedSets();
    if (!map || typeof map !== "object") return;
    setCoverSets(map);
    const n = Object.keys(map).length;
    if (n) console.info(`[cover] 已从缓存回填 ${n} 首歌的封面（含多封面）`);
  } catch (err) {
    console.info("[cover] 封面缓存回填跳过", err?.message ?? err);
  }
}

/* --------------------------------------------------------------------------
   封面取色 → 写入 --seed 令牌（开关打开时生效）
   --------------------------------------------------------------------------
   以前的写法是给底栏封面 <img> 挂一个 load 监听，在回调里取色。它有两个坑，
   症状都是「颜色卡在第一首」：

     1. 兜底封面会把 src 换成默认封面：一旦换过，靠 <img> 的 load 事件根本
        分不出「这首歌真的没有封面」和「这首歌有封面」，取色结果只能被默认
        封面的中性灰污染（漏掉真正的封面主色）。
     2. 时机不保证：底栏封面可能在监听挂上之前就已经 load 完成
        （complete=true 的图不会再触发 load），那一次取色就永久丢失。

   现在改为：主循环里发现「当前封面变了」就自己驱动一次取色 —— 用一个独立的
   Image 对象加载（失败就用底栏封面兜底），结果按封面地址缓存，切歌来回横跳
   也不会重复解码。取完色会重套一次主题，让依赖种子色的派生令牌同步更新。
   -------------------------------------------------------------------------- */
/** 上次取色的封面地址（同时也是「这一轮取到哪了」的状态） */
let accentCoverSrc = "";
/** coverSrc → 种子色；空串代表「这张取不到色」。避免同一张图反复解码。 */
const seedCache = new Map();
/** coverSrc → Promise<string>：同一张图并发只解码一次 */
const seedJobs = new Map();

function sameOriginSafeImage() {
  const img = new Image();
  // 与 <img> 走同一套缓存与 CSP
  img.decoding = "async";
  img.alt = "";
  return img;
}

/**
 * 需要为这张封面取色吗？
 *
 * 门槛（开关 / 地址变没变 / 这个源能不能取色）都来自主题层：取色是主题能力，
 * 这里只负责「什么时候问一次」。
 */
function accentNeeded(src) {
  if (!state.config.accentFromCover) return false;
  if (!seedSourceUsable(src)) return false;
  return src !== accentCoverSrc;
}

/**
 * 取某张封面的主色（十六进制），结果进缓存。取不到时 resolve("")。
 *
 * 优先让底栏那个 <img> 直接把像素交出来：它早就画出来了，省一次加载与解码。
 */
function extractSeed(src) {
  // 不能取色的源（默认占位封面）直接回空：把这条规则也放在入口上，
  // 免得将来新增调用点绕过上面的门槛、又拿占位图算出中性灰。
  if (!seedSourceUsable(src)) return Promise.resolve("");
  if (seedCache.has(src)) return Promise.resolve(seedCache.get(src));
  if (seedJobs.has(src)) return seedJobs.get(src);

  const job = new Promise((resolve) => {
    const finish = (hex) => {
      seedCache.set(src, hex);
      seedJobs.delete(src);
      resolve(hex);
    };

    const el = $("#bar-cover-img");
    if (el && el.getAttribute("src") === src && el.complete && el.naturalWidth > 0) {
      finish(normalizeSeed(extractCoverSeed(el)));
      return;
    }

    // 底栏封面还没画好 / 已经不是这张了：用一个独立 Image 加载，
    // 不依赖底栏节点，也不怕它被重建替换。
    const probe = sameOriginSafeImage();
    // 取到的是不能取色的源（默认占位封面）→ 当作「没有主色」，绝不写进 --seed / 配置
    probe.addEventListener("load", () =>
      finish(seedSourceUsable(src) ? normalizeSeed(extractCoverSeed(probe)) : "")
    );
    // 取不到色（地址失效、跨域被拦）就记为「没有」，别再试
    probe.addEventListener("error", () => finish(""));
    probe.src = src;
  });

  seedJobs.set(src, job);
  return job;
}

/** 把取色结果落到令牌 + 配置上；有变化时重套主题，让派生令牌跟着变 */
async function applySeed(hex) {
  if (!hex) return;
  if (!applyCoverSeed(hex, hex)) return;
  await flushConfigSync();
  await applyResolvedTheme(state.config);
  updateThemeButton();
}

/* --------------------------------------------------------------------------
   启动时的取色
   --------------------------------------------------------------------------
   必须在**第一次 applyResolvedTheme 之前**跑：主题里的 --bg-app / --glass-bg
   都是从 --seed 派生出来的，先用占位色套一遍、取完色再套一遍，就是肉眼可见的
   「先黑一下 / 先灰一下再变成真正的颜色」。先把种子拿到手，第一帧就是对的。

   上一次的种子由 Go 侧在页面加载前就写在 <html> 上了（early_theme.go），
   所以这一步通常只是「确认一致」，真正的重绘只在换歌或换了封面时发生。
   -------------------------------------------------------------------------- */
async function primeCoverAccent() {
  if (!state.config.accentFromCover) return;
  // 配置里保存着上次的取色结果时**直接用它**，绝不在启动阶段重新解码封面。
  // 为什么要这么克制：这一刻底栏封面还没画出来（它要等首次渲染），能拿到的
  // 很可能只是默认占位封面 —— 拿它取色会算出中性灰，把上次保存的颜色顶掉，
  // 于是启动时就是「上次的颜色 → 中性灰 → 真正的取色」闪两下。
  // 真正的取色交给主循环的 syncCoverAccent：那时底栏已经画出当前封面了。
  if (normalizeSeed(state.config.coverSeed)) return;
  const song = state.currentId ? songById(state.currentId) : null;
  const src = song ? coverOf(song) : "";
  if (!src) return;
  accentCoverSrc = src;
  await applySeed(await extractSeed(src));
}

/**
 * 每帧同步一次：底栏封面地址变了就（重新）取色。
 *
 * 之所以每帧看一眼而不是只绑 load 事件：底栏封面可能「同一首歌也换了封面」
 * （手动匹配 / 自动匹配），把它绑在唯一的「封面地址」上最不容易漏。
 */
function syncCoverAccent() {
  if (!state.config.accentFromCover) {
    accentCoverSrc = "";
    return;
  }
  const img = $("#bar-cover-img");
  const src = img?.getAttribute("src") || "";
  if (!src) return;
  // 记下「已经放弃过取色的地址」：底栏停在默认占位封面上时，不能每帧都重试
  if (!seedSourceUsable(src)) {
    accentCoverSrc = src;
    return;
  }
  if (!accentNeeded(src)) return;

  accentCoverSrc = src;
  extractSeed(src).then(applySeed);
}


/* --------------------------------------------------------------------------
   快捷键
   -------------------------------------------------------------------------- */
function bindShortcuts() {
  document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable;

    if (e.key === "Escape") {
      if ($("#modal-backdrop")?.hidden === false) return; // 弹窗自己处理
      closeMenu();
      if (state.playerOpen) closePlayer();
      return;
    }

    if (typing) return;

    switch (e.key) {
      case " ":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowRight":
        if (e.ctrlKey || e.metaKey) playNext(false);
        else seekTo(state.position + 5000);
        break;
      case "ArrowLeft":
        if (e.ctrlKey || e.metaKey) playPrev();
        else seekTo(state.position - 5000);
        break;
      case "ArrowUp":
        e.preventDefault();
        setVolume(state.volume + 0.05);
        break;
      case "ArrowDown":
        e.preventDefault();
        setVolume(state.volume - 0.05);
        break;
      case "l":
      case "L":
        if (state.currentId) toggleLike(state.currentId);
        break;
      case "p":
      case "P":
        togglePlayer();
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      default:
        break;
    }
  });
}

/* --------------------------------------------------------------------------
   窗口控制（Wails 注入的方法优先，浏览器预览降级为无操作）

   全屏：底栏原来有个 ⛶ 按钮，按需求已移除（详情页仍可全屏）。
   这里刻意保留 `F` 键与窗口控制实现：需求只说了去掉那个按钮，
   把快捷键一起删掉属于顺手扩大范围。
   -------------------------------------------------------------------------- */
async function toggleFullscreen() {
  if (isWails()) {
    const next = !document.fullscreenElement;
    await backend.windowSetFullscreen(next);
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen().catch(() => {});
}

function bindWindowControls() {
  $("#btn-win-min")?.addEventListener("click", () => isWails() && backend.windowMinimize());
  $("#btn-win-max")?.addEventListener("click", () => isWails() && backend.windowToggleMaximize());
  $("#btn-win-close")?.addEventListener("click", () => (isWails() ? backend.windowClose() : window.close()));
  $("#btn-theme-toggle")?.addEventListener("click", toggleTheme);
  // 设置入口在标题栏主题切换右侧；设置是弹出层（不是视图切换）
  $("#btn-settings")?.addEventListener("click", () => toggleSettings());

  $("#btn-player-back")?.addEventListener("click", closePlayer);
  // 播放详情页头部：「封面」按钮 → 打开封面面板（与轮播开关同属一个按钮组）
  $("#btn-player-cover")?.addEventListener("click", async () => {
    const song = state.currentId ? songById(state.currentId) : null;
    if (!song || song.online) return;
    const { openCoverPanel } = await import("./coverpanel.js");
    openCoverPanel(song.id);
  });
  // 轮播开关：与「封面」按钮同一个按钮组（样式与旁边的播放界面样式组一致）
  $("#btn-cover-carousel")?.addEventListener("click", () => setCoverCarousel(!state.config.coverCarousel));
  // 点播放详情页上的封面：多封面时手动切下一张
  $("#playerview-stage")?.addEventListener("click", (e) => {
    if (!e.target.closest(".disc__label, .disc__platter")) return;
    nextCover();
  });
  $("#playerview-mode")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pv-skin]");
    if (!btn) return;
    setPlayerViewMode(btn.dataset.pvSkin);
  });
}

/**
 * 开关封面轮播。
 *
 * 轮播是全局设置（详情页显示哪一张），但「这首歌有几张封面」是逐曲的：
 * 只有一张时按钮会被置灰，所以这里不必额外判断。
 */
function setCoverCarousel(on) {
  state.config.coverCarousel = Boolean(on);
  commit();
  toast(
    state.config.coverCarousel
      ? `已开启封面轮播（每 ${Number(state.config.coverCarouselInterval) || 10} 秒换一张）`
      : "已关闭封面轮播",
    { duration: 1600 }
  );
}

/* --------------------------------------------------------------------------
   后端事件
   -------------------------------------------------------------------------- */
function bindBackendEvents() {
  on("scan:start", () => {
    state.scanning = true;
    const box = $("#scanning");
    if (box) box.hidden = false;
    commit();
  });

  on("scan:progress", (payload) => {
    const text = $("#scanning-text");
    if (!text || !payload) return;
    if (payload.phase === "walk") text.textContent = "正在遍历音乐文件夹…";
    else if (payload.total) text.textContent = `正在读取元数据 ${payload.current} / ${payload.total}`;
  });

  on("scan:done", async (payload) => {
    state.scanning = false;
    const box = $("#scanning");
    if (box) box.hidden = true;
    // 后端扫完把最新曲库拉回来（增量监听也走这条路径）
    const songs = await backend.songs();
    if (Array.isArray(songs)) {
      const prev = new Set(state.songs.map((s) => s.id));
      state.allSongsRaw = songs;
      const { kept, excluded } = applyRules(songs, state.filterRules);
      state.songs = kept;
      state.lastScan = {
        at: Date.now(),
        found: songs.length,
        kept: kept.length,
        excluded,
        added: kept.filter((s) => !prev.has(s.id)).length,
        removed: [...prev].filter((id) => !kept.some((s) => s.id === id)).length,
      };
    }
    const folders = await backend.folders();
    if (Array.isArray(folders)) state.folders = folders;
    commit();

    if (payload?.added && !payload?.firstRun) {
      toast(`文件夹变化：新增 ${payload.added} 首`, { tone: "success" });
    }
  });

  on("scan:failed", (payload) => {
    state.scanning = false;
    const box = $("#scanning");
    if (box) box.hidden = true;
    commit();
    toast(`扫描失败：${payload?.message ?? "未知错误"}`, { tone: "error", duration: 5000 });
  });

  on("theme:changed", (id) => {
    state.config.theme = id;
    applyResolvedTheme(state.config).then(updateThemeButton);
    commit();
  });

  on("player:state", (payload) => {
    if (!payload) return;
    if (typeof payload.position === "number") state.position = payload.position;
    if (typeof payload.duration === "number") state.duration = payload.duration;
    if (typeof payload.playing === "boolean") state.playing = payload.playing;
  });

  /* ---- 封面变化 ----
     后端在「自动匹配 / 手动应用 / 写回文件 / 清空缓存」后都会广播 cover:changed。
     以前前端完全不订阅它，于是自动匹配出来的封面只写进了缓存，
     界面（歌曲列表 + 底栏封面）永远停在默认封面 —— 必须订阅并把新集合拉回来。
     空 id 表示批量变更（清空缓存 / 批量写回），直接整表回填。 */
  on("cover:changed", async (payload) => {
    const id = String(payload?.id || "");
    try {
      if (!id) {
        const map = await backend.coverCachedSets();
        if (map && typeof map === "object") setCoverSets(map);
        return;
      }
      const set = await backend.coverList(id);
      if (set && Array.isArray(set.items)) setCoverSet(id, set);
    } catch (err) {
      console.info("[cover] 同步封面失败", err?.message ?? err);
    }
  });

  /* ---- 响度均衡 ---- */
  on("loudness:progress", (payload) => {
    if (!payload) return;
    state.loudnessState = { ...(state.loudnessState || {}), ...payload };
    const box = $("#loudness-progress");
    if (box) {
      box.hidden = false;
      const text = box.querySelector("[data-role='text']");
      const bar = box.querySelector("[data-role='bar']");
      if (text) text.textContent = `正在测量响度 ${payload.done} / ${payload.total}${payload.current ? ` · ${payload.current}` : ""}`;
      if (bar && payload.total) bar.dataset.value = String(Math.round((payload.done / payload.total) * 100));
    }
  });

  on("loudness:done", async (payload) => {
    const box = $("#loudness-progress");
    if (box) box.hidden = true;
    const failed = payload?.failed ?? 0;
    toast(
      failed
        ? `响度测量完成：成功 ${payload?.done - failed} 首，失败 ${failed} 首`
        : `响度测量完成：共 ${payload?.done ?? 0} 首`,
      { tone: failed ? "warning" : "success", duration: 4000 }
    );
    await refreshLoudnessState();
    await refreshLoudnessGains();
  });

  on("loudness:failed", (payload) => {
    const box = $("#loudness-progress");
    if (box) box.hidden = true;
    toast(`响度测量失败：${payload?.message ?? "未知错误"}`, { tone: "error", duration: 6000 });
  });

  on("ffmpeg:ready", (payload) => {
    if (!payload) return;
    state.ffmpegState = payload;
    console.info(`[ffmpeg] ${payload.available ? payload.describe : "不可用"}`);
  });

  /* ---- 在线歌曲下载 ---- */
  on("download:progress", (payload) => {
    if (!payload?.bvid) return;
    // 进度只更新已有的那条 toast（没有就创建一条），避免刷屏
    const label = payload.title || payload.bvid;
    const total = Number(payload.total) || 0;
    const done = Number(payload.done) || 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const text = total > 0 ? `下载中 ${pct}% · ${label}` : `下载中 ${label}`;
    if (downloadToasts.has(payload.bvid)) {
      downloadToasts.get(payload.bvid).update(text);
    } else {
      downloadToasts.set(payload.bvid, toast(text, { duration: 0 }));
    }
  });

  on("download:done", (payload) => {
    const item = downloadToasts.get(payload?.bvid);
    downloadToasts.delete(payload?.bvid);
    const text = `已下载：${payload?.title || payload?.bvid} → ${payload?.path || payload?.dir || ""}`;
    if (item) item.update(text, "success");
    else toast(text, { tone: "success", duration: 5000 });
    // 让这条成功提示自然消失
    setTimeout(() => item?.close(), 4000);
  });

  on("download:failed", (payload) => {
    const item = downloadToasts.get(payload?.bvid);
    downloadToasts.delete(payload?.bvid);
    const text = `下载失败：${payload?.message ?? "未知错误"}`;
    if (item) item.update(text, "error");
    else toast(text, { tone: "error", duration: 6000 });
    setTimeout(() => item?.close(), 6000);
  });
}

/* --------------------------------------------------------------------------
   浏览器预览：支持通过 URL 参数直接定格某个界面状态（方便截图与自检）
   例：?theme=light-minimal&view=player&pv=immersive&tab=filters&scan=1
   -------------------------------------------------------------------------- */
function applyPreviewParams() {
  const q = new URLSearchParams(location.search);
  if (!q.toString()) return;

  const theme = q.get("theme");
  if (theme) {
    state.config.theme = theme;
    const t = getTheme(theme);
    if (t?.mode) state.config.themeMode = t.mode;
  }
  const tab = q.get("tab");
  if (tab === "settings") {
    // 设置是弹出层：记下来，等挂载完成后再打开
    state.settingsOpen = true;
  } else if (tab === "queue") {
    state.view = "queue";
  } else if (tab === "playlist") {
    state.view = "playlist";
    state.playlistId = q.get("pl") || state.playlists[1]?.id || null;
  }
  const pv = q.get("pv");
  if (pv) {
    state.pvMode = pv;
    state.config.playerViewMode = pv;
  }
  if (q.get("view") === "player") {
    state.playerOpen = true;
  }
  if (q.get("playing") === "1") {
    state.playing = true;
    state.position = Number(q.get("pos") || 62_000);
  }
  if (q.get("scan") === "1") {
    state.scanning = true;
    setTimeout(() => {
      state.scanning = false;
    }, 8000);
  }
  if (q.get("query")) state.query = q.get("query");
  // 列表密度：?density=compact —— 给无头浏览器自检用（见 tools/*.mjs）
  const density = q.get("density");
  if (density && ["compact", "cozy", "roomy"].includes(density)) {
    state.config.listDensity = density;
  }
  // 专辑列显隐：?album=off
  if (q.get("album") === "off") state.config.showAlbumColumn = false;
}

/* --------------------------------------------------------------------------
   启动
   -------------------------------------------------------------------------- */
async function main() {
  await bootstrap();
  applyPreviewParams();
  await initTheme();
  // 第三方播放界面样式在启动时就扫一遍。
  // 以前样式只在「第一次打开播放详情页」时才扫描，于是刚启动就进设置的话，
  // 样式列表里永远只有内置三款 —— 用户会以为放进去的样式没被识别。
  // 这里不 await：样式要动态 import，扫慢了不该拖住首屏。
  void preloadSkins().then(() => {
    if (settingsLayerOpen()) refreshSettingsLayer();
  });
  // 窗口原生材质（Mica / Acrylic）现在是否生效，决定了页面要不要让出底色
  await refreshBackdropState();

  bindShell();
  initTooltips();
  // 搜索必须早于首次渲染：它往标题栏插入搜索按钮，并负责搜索结果弹层的构建
  initSearchPanel();
  // 标题栏「下载任务」入口 + 下载面板（按钮初始 hidden，有任务时才出现）
  await initDownloads();
  initPlayerBar({
    onOpenPlayer: togglePlayer,
    onToggleQueue: () => toggleQueuePanel(),
  });
  // 桌面歌词 / 桌面背景歌词是一组单选：先把两个按钮的选中态对齐配置，
  // 再探一次当前系统支不支持「窗口垫到桌面图标之下」（不支持就把入口置灰）。
  // 都不 await —— 它们不该拖住首屏。
  syncDesktopModeButtons();
  void probeDesktopWallpaperSupport();
  bindWindowControls();
  bindShortcuts();
  bindBackendEvents();

  // 在事件绑定后再套用一次预览参数：避免 store 的 commit/persist 把 URL 指定的
  // 视图（歌单 / 播放界面 / 主题）覆盖回默认值。
  applyPreviewParams();

  subscribe(() => tick());
  tick();
  applyVolume();

  // ?tab=settings 的预览：等首帧渲染完再打开设置层，否则层里的滚动定位算不准
  if (state.settingsOpen) {
    state.settingsOpen = false;
    openSettings();
  }

  // 响度能力与补偿表（后端可用时）
  await refreshLoudnessState();
  await refreshLoudnessGains();
  // 换过的封面存在缓存目录里，启动时回填，避免「重启后又变回原始封面」
  await hydrateCachedCovers();

  // 预览模式下的进度模拟（真实播放时自动让位给 <audio> 事件）
  startMockTicker();
  startMockWatcher();

  // 退出前把配置刷回后端，避免最后一次改动丢失
  window.addEventListener("beforeunload", () => {
    flushConfigSync();
  });

  document.body.dataset.ready = "true";

  // 界面自检：?probe=1 时输出布局体检报告（供无头浏览器 dump-dom 读取）
  if (new URLSearchParams(location.search).get("probe") === "1") {
    const { runProbe } = await import("./probe.js");
    setTimeout(() => {
      const report = runProbe();
      console.info("[probe]", report);
    }, 600);
  }

  if (!isWails()) {
    console.info(
      "%c浏览器预览模式%c\n当前使用假数据渲染界面。接入 Go + Wails3 后端后，同名前端的 store/bridge 会自动改走后端方法。",
      "background:#fff;color:#000;padding:2px 6px;border-radius:4px;font-weight:700",
      "color:#888"
    );
  }
}

main().catch((err) => {
  console.error("[app] 启动失败", err);
  toast(`启动失败：${err.message}`, { tone: "error", duration: 6000 });
});

/* --------------------------------------------------------------------------
   兜底错误提示
   --------------------------------------------------------------------------
   界面里大量 async 点击处理（添加文件夹、扫描、主题切换…）一旦抛出异常，
   默认只会是一条无人看见的 unhandled rejection —— 用户表现为「点了没反应」。
   这里统一兜住并弹提示，让失败原因可见。
   -------------------------------------------------------------------------- */
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  const msg = reason?.message || String(reason || "未知错误");
  // 后端不可用是预览模式的正常情况，不打扰用户
  if (/no backend|preview:/i.test(msg)) return;
  console.error("[app] 未处理的异步错误", reason);
  toast(msg.length > 120 ? `${msg.slice(0, 120)}…` : msg, { tone: "error", duration: 6000 });
});

window.addEventListener("error", (e) => {
  if (!e.message) return;
  console.error("[app] 运行时错误", e.error || e.message);
});

/* 便于调试 */
window.__app = {
  state,
  commit,
  navigate,
  openPlayer,
  closePlayer,
  rescan,
  doRescan,
  currentSong,
  isLiked,
  nextIndex,
};
