/* ==========================================================================
   main.js — 应用入口（装配 + 后端事件）
   --------------------------------------------------------------------------
   迁移前这里还有一个 tick() 主循环：每一次 store 广播都会串行跑
   applyDensity → renderKey → renderShell → paintTrackSelection →
   paintPlayerBar → syncCoverAccent → syncThemeBackdrop → renderPlayerView →
   paintDesktopLyrics → paintDesktopWallpaper → syncPlaybackState → syncAudio →
   applyGainForSong，一共 13 个函数、其中好几个每帧都要查 20 多次 DOM。

   迁移后：
     · 渲染全部由 Lit 组件按自己的依赖数组完成（见 js/ui/*），**没有主循环**；
     · 只剩「与渲染无关的运行时副作用」在 runtime.js 里按 250ms 一档同步；
     · 这个文件只负责装配、后端事件与启动时序。
   ========================================================================== */

import "./ui/app.js";
import { closeMenu, initTooltips, toast } from "./dom.js";
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
  setCoverSet,
  setCoverSets,
  setVolume,
  state,
  toggleLike,
  togglePlay,
  startMockTicker,
} from "./store.js";
import { doRescan, navigate, settingsLayerOpen, refreshSettingsLayer } from "./shell.js";
import {
  applyVolume,
  applyGainForSong,
  refreshLoudnessGains,
  refreshLoudnessState,
  seekTo,
} from "./audio.js";
import { closePlayer, openPlayer, preloadSkins, setPlayerViewMode, togglePlayer } from "./playerhost.js";
import { applyResolvedTheme, discoverThemes, getTheme } from "./theme.js";
import { primeCoverAccent } from "./cover-accent.js";
import { refreshBackdropState } from "./backdrop.js";
import { probeDesktopWallpaperSupport } from "./desktop-wallpaper.js";
import { initSearchPanel } from "./searchpanel.js";
import { initDownloads } from "./downloads.js";
import { startRuntime } from "./runtime.js";

/** 下载中的 toast（bvid → toast 句柄），进度事件复用同一条 */
const downloadToasts = new Map();

/* --------------------------------------------------------------------------
   主题
   -------------------------------------------------------------------------- */
async function initTheme() {
  await discoverThemes();
  // 取色必须在套主题之前：--bg-app / --glass-bg 都是从 --seed 派生的，
  // 先套一遍主题再用新种子套第二遍，就是启动时那一下「先黑再变色」。
  await primeCoverAccent();
  await applyResolvedTheme(state.config);
  // 之后每次换歌 / 换封面由 runtime.js#syncCoverAccent 兜住

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", async () => {
    if (state.config.themeMode === "system") {
      await applyResolvedTheme(state.config);
      commit();
    }
  });
}

/* --------------------------------------------------------------------------
   封面缓存回填
   --------------------------------------------------------------------------
   用户换过的封面写在缓存目录里（缓存才是真相来源），但前端的 coverSets
   只是一张内存表。不回填的话，重启应用后换过的封面就「消失」了。
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
   快捷键
   -------------------------------------------------------------------------- */
function bindShortcuts() {
  document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable;

    if (e.key === "Escape") {
      if (document.getElementById("modal-backdrop")?.hidden === false) return; // 弹窗自己处理
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

/* --------------------------------------------------------------------------
   后端事件
   -------------------------------------------------------------------------- */
function bindBackendEvents() {
  on("scan:start", () => {
    state.scanning = true;
    state.scanText = "正在扫描音乐文件夹…";
    commit();
  });

  on("scan:progress", (payload) => {
    if (!payload) return;
    if (payload.phase === "walk") state.scanText = "正在遍历音乐文件夹…";
    else if (payload.total) state.scanText = `正在读取元数据 ${payload.current} / ${payload.total}`;
    commit();
  });

  on("scan:done", async (payload) => {
    state.scanning = false;
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
    commit();
    toast(`扫描失败：${payload?.message ?? "未知错误"}`, { tone: "error", duration: 5000 });
  });

  on("theme:changed", (id) => {
    state.config.theme = id;
    applyResolvedTheme(state.config);
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
    state.loudnessState = { ...(state.loudnessState || {}), ...payload, running: true };
    commit();
  });

  on("loudness:done", async (payload) => {
    state.loudnessState = { ...(state.loudnessState || {}), running: false };
    commit();
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
    state.loudnessState = { ...(state.loudnessState || {}), running: false };
    commit();
    toast(`响度测量失败：${payload?.message ?? "未知错误"}`, { tone: "error", duration: 6000 });
  });

  on("ffmpeg:ready", (payload) => {
    if (!payload) return;
    state.ffmpegState = payload;
    commit();
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
      commit();
    }, 8000);
  }
  if (q.get("query")) state.query = q.get("query");
  // 曲库规模：?songs=1000 —— 把假数据复制到指定条数，用于性能压测
  // （只影响浏览器预览；真实应用里曲库由后端扫描决定）
  const songs = Number(q.get("songs"));
  if (!isWails() && Number.isFinite(songs) && songs > state.songs.length) {
    const base = state.songs.slice();
    while (state.songs.length < songs) {
      const i = state.songs.length;
      const t = base[i % base.length];
      state.songs.push({ ...t, id: `bench_${i}`, path: `C:/bench/${i}.${t.ext || "mp3"}` });
    }
    state.allSongsRaw = state.songs.slice();
    // 可见列表是在 commit() 里由 recalcVisible() 派生的，改完曲库要主动跑一次
    commit();
  }
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

  // 封面缓存回填必须赶在首帧之前（它是「用户换过的封面」的唯一真相）
  const coversReady = hydrateCachedCovers();

  await initTheme();
  // 第三方播放界面样式在启动时就扫一遍（不 await：样式要动态 import，扫慢了不该拖住首屏）
  void preloadSkins().then(() => {
    if (settingsLayerOpen()) refreshSettingsLayer();
  });
  // 窗口原生材质（Mica / Acrylic）现在是否生效，决定了页面要不要让出底色
  await refreshBackdropState();

  initTooltips();
  // 搜索必须早于首次渲染：它注册 Ctrl+F 快捷键并构建结果弹层
  initSearchPanel();
  // 标题栏「下载任务」入口 + 下载面板（按钮初始 hidden，有任务时才出现）
  await initDownloads();
  // 桌面背景歌词依赖系统桌面窗口结构，探一次并把能力写进 state
  void probeDesktopWallpaperSupport();
  bindShortcuts();
  bindBackendEvents();

  // 在事件绑定后再套用一次预览参数：避免 store 的 commit/persist 把 URL 指定的
  // 视图（歌单 / 播放界面 / 主题）覆盖回默认值。
  applyPreviewParams();

  // 运行时副作用（音频对齐 / 桌面窗口推送 / 封面取色）
  startRuntime();

  // 收口封面回填：首帧之前把它落进 state，第一帧画出来就是对的封面
  await coversReady;
  await applyResolvedTheme(state.config);
  applyVolume();

  // DOM 已经装配好：让 Go 侧把主窗口显示出来。
  //
  // ★ 这里**不能**用 requestAnimationFrame 等首帧：窗口是隐藏的时候 WebView2
  // 根本不派发 BeginFrame，rAF 回调永远不会执行 —— 而 document.visibilityState
  // 仍然是 "visible"，从 JS 侧完全看不出异常。
  // 所以：宏任务立刻发；窗口若已经可见，rAF 那一帧再补发一次（只发一次）。
  let windowReadySent = false;
  const markWindowReady = () => {
    if (windowReadySent) return;
    windowReadySent = true;
    backend.windowReady().catch(() => {});
  };
  setTimeout(markWindowReady, 0);
  requestAnimationFrame(() => requestAnimationFrame(markWindowReady));

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
      // 同时挂到 window 上：无头自检脚本（tools/verify-lit.mjs）按值读取，
      // 控制台里的对象在 CDP 里只能拿到 "[probe] Object"。
      window.__probeReport = report;
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
  setPlayerViewMode,
  applyGainForSong,
};
