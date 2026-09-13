/* ==========================================================================
   main.js — 应用入口
   --------------------------------------------------------------------------
   职责：装配 store / 主题 / 侧边栏 / 内容区 / 播放控件 / 播放界面 / 快捷键
   ========================================================================== */

import { $, closeMenu, toast } from "./dom.js";
import { backend, isWails, on, startMockWatcher } from "./bridge.js";
import {
  applyRules,
  bootstrap,
  commit,
  currentSong,
  flushConfigSync,
  isLiked,
  nextIndex,
  playNext,
  playPrev,
  rescan,
  setVolume,
  songById,
  state,
  subscribe,
  toggleLike,
  togglePlay,
  startMockTicker,
} from "./store.js";
import { bindShell, doRescan, navigate, renderShell, toggleSettings, settingsLayerOpen, closeSettings, openSettings } from "./shell.js";
import { initPlayerBar, paintPlayerBar, toggleQueuePanel } from "./playerbar.js";
import { initSettingsPlayer, paintSettingsPlayer } from "./settingsplayer.js";
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
  openPlayer,
  renderPlayerView,
  setPlayerViewMode,
  syncPlaybackState,
  togglePlayer,
} from "./playerview.js";
import { applyResolvedTheme, applyCoverSeed, discoverThemes, extractCoverSeed, getTheme } from "./theme.js";
import { refreshBackdropState } from "./backdrop.js";
import { initSearchPanel } from "./searchpanel.js";
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

function renderKey() {
  return [
    state.view,
    state.playlistId ?? "",
    state.sortKey,
    state.sortDir,
    state.config.listDensity,
    state.visibleSongs.map((s) => s.id).join(","),
    state.playlists.map((p) => `${p.id}:${p.name}:${p.songIds.length}`).join(","),
    state.songs.length,
    state.lastScan?.at ?? "",
    state.scanning ? "scan" : "",
    state.config.theme,
    state.config.themeMode,
  ].join("|");
}

function tick() {
  const key = renderKey();
  if (key !== lastKey) {
    lastKey = key;
    renderShell();
  }
  paintPlayerBar();
  // 设置层自带的紧凑播放控件（层关着时它自己会直接返回）
  paintSettingsPlayer();
  renderPlayerView();
  syncPlaybackState();
  // 真实播放：切歌 / 播放暂停状态变化时同步到 <audio>，并套用响度补偿
  syncAudio();
  applyGainForSong();
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
  await applyResolvedTheme(state.config);
  updateThemeButton();
  bindCoverAccent();

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

/** 封面取色 → 写入 --seed 令牌（开关打开时生效） */
function bindCoverAccent() {
  const img = $("#bar-cover-img");
  if (!img) return;
  img.addEventListener("load", () => {
    if (!state.config.accentFromCover) return;
    // 默认封面是灰阶占位图，取色没有意义，跳过
    if (img.dataset.coverFallbackDone === "1") return;
    const seed = extractCoverSeed(img);
    if (seed) applyCoverSeed(seed, seed);
  });
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
  // 播放详情页：返回按钮右侧的「封面」按钮 → 打开封面搜索弹层
  $("#btn-player-cover")?.addEventListener("click", async () => {
    const song = state.currentId ? songById(state.currentId) : null;
    if (!song || song.online) return;
    const { openCoverPanel } = await import("./coverpanel.js");
    openCoverPanel(song.id);
  });
  $("#playerview-mode")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pv-mode]");
    if (!btn) return;
    setPlayerViewMode(btn.dataset.pvMode);
  });
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
}

/* --------------------------------------------------------------------------
   启动
   -------------------------------------------------------------------------- */
async function main() {
  await bootstrap();
  applyPreviewParams();
  await initTheme();
  // 窗口原生材质（Mica / Acrylic）现在是否生效，决定了页面要不要让出底色
  await refreshBackdropState();

  bindShell();
  // 搜索必须早于首次渲染：它往标题栏插入搜索按钮，并负责搜索结果弹层的构建
  initSearchPanel();
  initPlayerBar({
    onOpenPlayer: togglePlayer,
    onToggleQueue: () => toggleQueuePanel(),
  });
  // 设置层里的紧凑播放控件：动作与底栏共用同一套 store，只是少几个按钮
  initSettingsPlayer({ onOpenPlayer: togglePlayer });
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
