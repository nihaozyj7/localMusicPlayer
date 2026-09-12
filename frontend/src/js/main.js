/* ==========================================================================
   main.js — 应用入口
   --------------------------------------------------------------------------
   职责：装配 store / 主题 / 侧边栏 / 内容区 / 播放控件 / 播放界面 / 快捷键
   ========================================================================== */

import { $, closeMenu, toast } from "./dom.js";
import { backend, isWails, on, startMockWatcher } from "./bridge.js";
import {
  bootstrap,
  commit,
  currentSong,
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
  if (isWails) {
    const next = !document.fullscreenElement;
    await backend.windowSetFullscreen(next);
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen().catch(() => {});
}

function bindWindowControls() {
  $("#btn-win-min")?.addEventListener("click", () => isWails && backend.windowMinimize());
  $("#btn-win-max")?.addEventListener("click", () => isWails && backend.windowToggleMaximize());
  $("#btn-win-close")?.addEventListener("click", () => (isWails ? backend.windowClose() : window.close()));
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
    $("#scanning").hidden = false;
    commit();
  });

  on("scan:done", (payload) => {
    state.scanning = false;
    $("#scanning").hidden = true;
    commit();
    if (payload?.added) {
      toast(`文件夹变化：新增 ${payload.added} 首`, { tone: "success" });
    }
  });

  on("library:changed", () => {
    rescan({ silent: true });
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

  // 预览模式下的进度模拟；接入后端后由真实播放事件驱动
  startMockTicker();
  startMockWatcher();

  if (state.config.autoScanOnStart && isWails) {
    doRescan({ manual: false });
  }

  document.body.dataset.ready = "true";

  // 界面自检：?probe=1 时输出布局体检报告（供无头浏览器 dump-dom 读取）
  if (new URLSearchParams(location.search).get("probe") === "1") {
    const { runProbe } = await import("./probe.js");
    setTimeout(() => {
      const report = runProbe();
      console.info("[probe]", report);
    }, 600);
  }

  if (!isWails) {
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
