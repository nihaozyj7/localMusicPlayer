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
  loadUnplayableFiles,
  loadUpdateState,
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
  toggleUnplayableOpen,
  startMockTicker,
} from "./store.js";
import { doRescan, navigate, settingsLayerOpen, refreshSettingsLayer } from "./shell.js";
import {
  applyVolume,
  applyGainForSong,
  // 跳过首尾静音 / 切歌间隔（设置项，后端生效）
  applyPlaybackOptions,
  // 音效档位（设置项，后端生效）
  applyEffectPreset,
  refreshLoudnessGains,
  refreshLoudnessState,
  seekTo,
  probeBackend,
  startAudioEvents,
} from "./audio.js";
import { closePlayer, openPlayer, preloadSkins, setPlayerViewMode, togglePlayer } from "./playerhost.js";
import { applyResolvedTheme, discoverThemes, getTheme } from "./theme.js";
import { primeCoverAccent } from "./cover-accent.js";
import { refreshBackdropState } from "./backdrop.js";
import { probeDesktopWallpaperSupport } from "./desktop-wallpaper.js";
import { initSearchPanel } from "./searchpanel.js";
import { initDownloads } from "./downloads.js";
import { startRuntime } from "./runtime.js";
import { startMediaKeys } from "./media-keys.js";

/* --------------------------------------------------------------------------
   启动过渡画面（index.html#boot-splash）
   --------------------------------------------------------------------------
   Go 侧每次真正退出时用 PrintWindow 抓一张窗口画面缓存成 JPEG（见 boot_frame.go），
   下次启动由 /boot-frame.jpg 提供给这里的 <img>：窗口一露面看到的就是「刚才那个
   界面」，等真正的界面装配好再淡出（hideBootSplash），中间不会出现任何空档。

   它与「DWM 遮罩」（window_reveal_windows.go）是两件事，配合使用：
     · 遮罩保证窗口出现在屏幕上时「已经有画好的帧」，不会有空白窗口；
     · 过渡画面决定那一帧长什么样 —— 上一帧缓存 / 加载动画。

   抓不到缓存图（首次启动 / 非 Windows / 抓帧失败 / 浏览器预览）就退化成
   加载动画形态：默认那形态就是加载动画，只有确认缓存图真的加载出来了
   （naturalWidth > 0）才给容器打上 data-hasframe 切换过去。

   ★ 不能让 <img> 默认可见：404 时浏览器会给它画一个「碎图标」，用户看到的就是
   一张破图（CSS 里它默认 opacity:0，见 index.html#boot-splash-style）。
   -------------------------------------------------------------------------- */
const bootSplash = document.getElementById("boot-splash");
const bootSplashFrame = document.getElementById("boot-splash__frame");

/** 缓存图确实加载出来了 → 换成「上一帧」形态（CSS 的两个 data-hasframe 规则） */
function showBootFrame() {
  if (bootSplash) bootSplash.dataset.hasframe = "1";
}

if (bootSplashFrame) {
  // 模块跑到这里时图片可能已经有结果了：complete 且 naturalWidth 为 0 就是 404，
  // 那时 error 事件不会再补发，所以这里直接判一次。
  if (bootSplashFrame.complete) {
    if (bootSplashFrame.naturalWidth > 0) showBootFrame();
  } else {
    bootSplashFrame.addEventListener("load", showBootFrame, { once: true });
  }
}

let windowReadySent = false;

/** 让 Go 侧把主窗口露出来（只发一次；见 services.go#showPrepared/MarkReady） */
function markWindowReady() {
  if (windowReadySent) return;
  windowReadySent = true;
  // 首选：普通 HTTP 请求（见 services.go#bootRevealPath）。它走网络栈，
  // 不会像 Wails 的 JS→Go 绑定那样在启动阶段被积压近一秒。
  fetch("/boot/reveal", { cache: "no-store", keepalive: true }).catch(() => {});
  // 兜底：万一这条请求被拦（自定义 CSP / 资源协议），回到绑定调用。
  backend.windowReady().catch(() => {});
}

let bootSplashHidden = false;

/** 真正的界面已经画好：淡出过渡画面（只做一次） */
function hideBootSplash() {
  if (bootSplashHidden || !bootSplash) return;
  bootSplashHidden = true;
  bootSplash.dataset.hide = "1";
  // 过渡结束后摘掉节点：它铺满整窗，留着会一直占一层合成
  setTimeout(() => bootSplash.remove(), 400);
}

// 页面一跑起来就立刻报「可以露面了」，一刻都不等。
//
// 这一段是模块里的第一句可执行代码（模块脚本在 </body> 前，属于 defer 执行），
// 而接口走的是普通 HTTP 请求而不是 Wails 的 JS→Go 绑定 —— 后者在启动阶段
// 会被宿主的 WebView2 初始化堵住近一秒，实测窗口因此白等 800ms（表现就是
// 「任务栏图标都出来半天了，窗口才冒出来」，见 services.go#bootRevealPath）。
//
// 为什么不怕「露早了」：过渡层是写死在 HTML 里的（样式也内联），首帧就会画出来；
// 就算早几毫秒，露出来的也只是与过渡层同色的窗口底色（窗口底色取自同一套主题令牌），
// 肉眼看不出差别。
markWindowReady();
// 兜底：后面万一哪里抛了异常，也不能把过渡画面永远糊在界面上。
setTimeout(hideBootSplash, 12000);

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
      const nowIds = new Set(kept.map((s) => s.id));
      state.lastScan = {
        at: Date.now(),
        found: songs.length,
        kept: kept.length,
        excluded,
        added: kept.filter((s) => !prev.has(s.id)).length,
        // 用 Set 而不是 kept.some(...)：后者是 O(prev × kept)，2 万首就是
        // 4 亿次比较，全部发生在主线程上。store.js 的 rescan() 早就是正确写法。
        removed: [...prev].filter((id) => !nowIds.has(id)).length,
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

  /* ---- 播放时发现放不出来的文件 ----
     后端在登记新条目后会广播这条事件（见 services_unplayable.go#Report）。
     曲库那条链路由 audio.js 负责（它会顺手把歌从内存列表里摘掉），
     这里只做两件事：刷新清单缓存 + 给用户一条指向清单的提示。 */
  on("library:unplayable", (payload) => {
    if (!payload) return;
    loadUnplayableFiles().catch(() => {});

    const title = payload.title || payload.songId || "这首歌";
    // 提示里说明「去哪儿看」，并把清单展开 —— 用户点一下通知（或稍后进设置）
    // 就能看到具体是哪个文件、什么原因。失败原因不塞进 toast：它可能很长
    // （ffmpeg 的 stderr），一闪而过的位置既看不完也没法复制。
    toast(`无法播放：${title}（已记入「音乐文件夹」清单）`, { tone: "error", duration: 6000 });
    // 同时把设置层的清单标记为展开：用户随后打开设置就是展开状态。
    // 注意这里**不**强行弹出设置层 —— 用户可能正在做别的事，
    // 播放器跳出来一个设置界面是打断（切歌本身已经自动继续了）。
    toggleUnplayableOpen(true);
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

  /* ---- 版本更新（见 Go 侧 services_update.go） ----
     这些事件全部由后端推：检查结果、下载进度、下载完成、失败、正在安装。
     界面（设置 → 关于）照着 state.update 渲染，这里只负责把事件落进 state。

     为什么要走事件而不是让界面轮询：下载可能持续几分钟，
     轮询要么太密（白耗 IPC）要么太疏（进度条一顿一顿）。 */
  on("update:checked", (payload) => {
    if (!payload) return;
    state.update.check = payload;
    state.update.checking = false;
    state.update.error = payload.error || "";
    commit();
    // 启动时的静默检查也会走到这里。**只有真的有更新才提示** ——
    // 「已是最新版」「检查失败」都不该在启动时打扰用户。
    if (payload.hasUpdate && payload.assetAvailable) {
      toast(`发现新版本 ${payload.latest}，可在「设置 → 关于」中更新`, {
        tone: "success",
        duration: 6000,
      });
    }
  });

  on("update:progress", (payload) => {
    if (!payload) return;
    state.update.progress = { ...(state.update.progress || {}), ...payload };
    commit();
  });

  on("update:downloaded", (payload) => {
    if (!payload) return;
    state.update.progress = null;
    state.update.pending = {
      name: payload.name,
      path: payload.path,
      bytes: payload.bytes,
      verified: payload.verified,
      mirrorId: payload.mirrorId,
    };
    commit();
    toast(`更新包已下载（${payload.verified ? "已校验" : "未校验"}）：${payload.name}`, {
      tone: payload.verified ? "success" : "warning",
      duration: 5000,
    });
  });

  on("update:failed", (payload) => {
    state.update.progress = null;
    state.update.error = payload?.message || "下载失败";
    commit();
  });

  on("update:installing", (payload) => {
    state.update.progress = null;
    commit();
    // 应用马上要退出了，这条提示要让用户知道「不是我按坏了，是在更新」。
    toast(`正在安装 ${payload?.name || "更新"} 并重启…`, { duration: 4000 });
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
    // 先建好新数组再**整体替换**，不要原地 push：
    // 「state.songs 永远整体替换、从不原地改」是 recalcVisible 记忆化与
    // visibleFingerprint 共同依赖的不变量（见 store.js）。
    const grown = base.slice();
    while (grown.length < songs) {
      const i = grown.length;
      const t = base[i % base.length];
      grown.push({ ...t, id: `bench_${i}`, path: `C:/bench/${i}.${t.ext || "mp3"}` });
    }
    state.songs = grown;
    state.allSongsRaw = grown.slice();
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

  // 探测后端原生音频是否可用，并订阅它推来的播放事件。
  //
  // 必须排在 startRuntime() **之前**：runtime 的第一次 run 就会调 syncAudio()，
  // 而 syncAudio 要按「后端是否可用」选链路 —— 探测晚了第一次播放会走错分支。
  await probeBackend();
  startAudioEvents();
  // 把「跳过首尾静音 / 切歌间隔」这两项设置推给后端。
  //
  // 必须在这里（探测之后、startRuntime 之前）：startRuntime 的第一次 run
  // 就可能装载并起播，而跳过静音的方案是**装载时**算好的 ——
  // 推晚了第一首歌会用默认值（不跳过）播出，用户听到的是「设置没生效」。
  applyPlaybackOptions();
  // 音效档位同样在起播之前推给后端。
  //
  // 与上面同理：音效是**跨歌的偏好**，后端在 Engine.Open 时把链初始化成
  // off。不在这里推的话，用户上次开着「3D 环绕」，这次启动就会变成
  //「设置界面显示开着、实际没有任何效果」，直到他重新点一次按钮。
  applyEffectPreset();

  // 键盘媒体键（⏯）：Go 侧用系统级全局热键接管，这里只接它转达的意图。
  // 必须等 store 就绪之后再挂 —— 处理器里直接调 togglePlay。
  startMediaKeys();

  // 运行时副作用（音频对齐 / 桌面窗口推送 / 封面取色）
  startRuntime();

  // 收口封面回填：首帧之前把它落进 state，第一帧画出来就是对的封面
  await coversReady;
  await applyResolvedTheme(state.config);
  applyVolume();

  // 界面已经装配好：让过渡画面淡出，把屏幕交给真正的界面。
  //
  // 露面时机**不在这里** —— 过渡画面（上一帧缓存 / 加载动画）一画好就已经
  // 让 Go 侧把窗口露出来了，见文件顶部的 bootSplash 那一段。
  requestAnimationFrame(() => requestAnimationFrame(hideBootSplash));

  // 响度能力与补偿表（后端可用时）
  await refreshLoudnessState();
  await refreshLoudnessGains();

  // 更新状态快照：让刷新过界面 / 重新打开设置时立刻能看到上次的检查结果。
  //
  // **不在这里发起检查** —— 启动检查由 Go 侧在窗口出来之后自己做
  // （见 main.go 的 ApplicationStarted），结果通过 update:checked 事件推过来。
  // 两边都发的话会重复请求 GitHub（匿名额度只有每小时 60 次）。
  loadUpdateState().catch(() => {});

  // 预览模式下的进度模拟（真实播放时自动让位给 <audio> 事件）
  startMockTicker();
  startMockWatcher();

  // 退出前把配置刷回后端，避免最后一次改动丢失
  window.addEventListener("beforeunload", () => {
    flushConfigSync();
  });

  document.body.dataset.ready = "true";

  // 告诉 Go 侧「界面已经装配完毕」——这是启动高峰的结束点，桌面背景歌词的
  // 启动恢复就等它（见 services.go#MarkBooted 与 early_theme.go#waitMainWindowBooted）。
  //
  // 必须排在这里，而不是上面 markWindowReady() 那里：那个信号只说明「过渡画面
  // 画好了、窗口可以露面」，而解析 bundle / 解码封面 / 套主题 / 建皮肤这一大段
  // 都还在它之后。背景歌词在那段时间里挂皮肤会真的和主窗口抢性能。
  //
  // 与 markWindowReady 同一套走法（普通 HTTP 请求，不走 Wails 绑定）：绑定那条
  // 链路在启动阶段会被积压，而这条信号越早到，桌面上的歌词就越早出现。
  fetch("/boot/booted", { cache: "no-store", keepalive: true }).catch(() => {});

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
