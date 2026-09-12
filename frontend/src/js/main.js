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
  seek,
  setVolume,
  state,
  subscribe,
  toggleLike,
  togglePlay,
  startMockTicker,
} from "./store.js";
import { bindShell, doRescan, navigate, renderShell } from "./shell.js";
import { initPlayerBar, paintPlayerBar } from "./playerbar.js";
import { applyVolume, applyGainForSong, syncAudio, refreshLoudnessGains, refreshLoudnessState } from "./audio.js";
import {
  closePlayer,
  openPlayer,
  renderPlayerView,
  setPlayerViewMode,
  syncPlaybackState,
  togglePlayer,
} from "./playerview.js";
import { applyResolvedTheme, applyCoverSeed, discoverThemes, extractCoverSeed, getTheme } from "./theme.js";

/* --------------------------------------------------------------------------
   增量渲染：根据「渲染键」决定是否重绘主体
   -------------------------------------------------------------------------- */
let lastKey = "";

function renderKey() {
  return [
    state.view,
    state.playlistId ?? "",
    state.query,
    state.sortKey,
    state.sortDir,
    state.density,
    state.visibleSongs.map((s) => s.id).join(","),
    state.playlists.map((p) => `${p.id}:${p.name}:${p.songIds.length}`).join(","),
    state.songs.length,
    state.lastScan?.at ?? "",
    state.scanning ? "scan" : "",
    state.config.theme,
    state.config.themeMode,
  ].join("|");
}

let settingsDirty = false;

function tick() {
  const key = renderKey();
  if (key !== lastKey) {
    lastKey = key;
    renderShell();
    // 设置页内部有输入框，避免整页重绘打断输入
    if (state.view === "settings" && settingsDirty) settingsDirty = false;
  }
  paintPlayerBar();
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
        else seek(state.position + 5000);
        break;
      case "ArrowLeft":
        if (e.ctrlKey || e.metaKey) playPrev();
        else seek(state.position - 5000);
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

  $("#btn-player-back")?.addEventListener("click", closePlayer);
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
    state.view = "settings";
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

  bindShell();
  initPlayerBar({
    onOpenPlayer: openPlayer,
    onToggleFullscreen: toggleFullscreen,
  });
  bindWindowControls();
  bindShortcuts();
  bindBackendEvents();

  // 在事件绑定后再套用一次预览参数：避免 store 的 commit/persist 把 URL 指定的
  // 视图（歌单 / 播放界面 / 主题）覆盖回默认值。
  applyPreviewParams();

  subscribe(() => tick());
  tick();
  applyVolume();

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
