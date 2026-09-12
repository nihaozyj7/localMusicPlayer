/* ==========================================================================
   bridge.js — 前端 ↔ Go(Wails3) 后端桥接层
   --------------------------------------------------------------------------
   工作方式：
     · 在 Wails 应用里：加载由 `wails3 generate bindings -b -i` 生成的绑定
       （frontend/bindings/musicplayer/*），所有调用打到 Go 服务。
     · 在浏览器预览里（node tools/dev-server.js）：绑定里的 /wails/runtime.js
       不存在，import 会失败，此时自动降级为 mock，界面照样能跑。

   后端服务与方法（Go 侧见 services.go）：
     Library   Scan / Songs / Folders / AddFolder / RemoveFolder / SetWatchers /
               ToggleLike / RevealInExplorer / PickDirectory / Stats
     Playlist  List / Create / Rename / Delete / AddSongs / RemoveSongs /
               Reorder / ReorderPlaylists / Export
     Lyrics    Load
     Themes    List / Load / Reload / Dir / RevealDir
     Config    Get / Set / Path / Reset
     Media     URL / State
     Window    Minimize / ToggleMaximize / Close / SetFullscreen / ToggleFullscreen
   ========================================================================== */

let bindings = null;
let active = false;

/** 是否连接到了真实的 Go 后端 */
export function isWails() {
  return active;
}

/** 后端只读快照（供界面提示「需安装 ffmpeg」等） */
export const backendState = {
  mediaBaseUrl: "",
  canTranscode: false,
  configPath: "",
};

/** 加载真实绑定；成功返回 true。失败（浏览器预览）返回 false，不抛异常。 */
export async function connect() {
  if (active) return true;
  try {
    const mod = await import("../bindings/musicplayer/index.js");
    if (!mod?.LibraryService) return false;

    // 这里必须真调一次后端：预览服务器也提供 /wails/runtime.js 桩，
    // 仅“import 成功”并不能说明 Go 后端存在。
    await mod.LibraryService.Folders();

    bindings = {
      Library: mod.LibraryService,
      Playlist: mod.PlaylistService,
      Lyrics: mod.LyricsService,
      Themes: mod.ThemeService,
      Config: mod.ConfigService,
      Media: mod.MediaService,
      Window: mod.WindowService,
    };
    active = true;
    try {
      const state = await bindings.Media.State();
      backendState.mediaBaseUrl = state?.baseUrl ?? "";
      backendState.canTranscode = Boolean(state?.canTranscode);
    } catch {
      /* 后端未提供 State 时忽略 */
    }
    try {
      backendState.configPath = await bindings.Config.Path();
    } catch {
      /* 忽略 */
    }
    console.info("[bridge] 已连接 Go 后端，播放服务:", backendState.mediaBaseUrl || "不可用");
    return true;
  } catch (err) {
    bindings = null;
    active = false;
    console.info("[bridge] 未检测到 Go 后端，使用浏览器预览数据：", err?.message ?? err);
    return false;
  }
}

/* --------------------------------------------------------------------------
   事件
   -------------------------------------------------------------------------- */

let eventsMod = null;

async function ensureEvents() {
  if (eventsMod) return eventsMod;
  if (!active) return null;
  try {
    eventsMod = await import("/wails/runtime.js");
  } catch {
    try {
      eventsMod = await import("../bindings/github.com/wailsapp/wails/v3/internal/eventcreate.js");
    } catch {
      eventsMod = null;
    }
  }
  return eventsMod;
}

/** 订阅后端事件；返回取消订阅函数 */
export function on(eventName, handler) {
  if (active) {
    let off = null;
    ensureEvents().then((mod) => {
      if (mod?.Events?.On) off = mod.Events.On(eventName, (payload) => handler(payload?.data ?? payload));
    });
    return () => off?.();
  }
  const listener = (e) => handler(e.detail);
  window.addEventListener(`dsh:${eventName}`, listener);
  return () => window.removeEventListener(`dsh:${eventName}`, listener);
}

/** 浏览器预览时手动触发事件（mock 用） */
export function emit(eventName, payload) {
  window.dispatchEvent(new CustomEvent(`dsh:${eventName}`, { detail: payload }));
}

/* --------------------------------------------------------------------------
   调用封装：未连接后端时返回 null，由调用方走 mock 分支
   -------------------------------------------------------------------------- */

async function call(fn, ...args) {
  if (!active || !bindings || typeof fn !== "function") return null;
  return fn(...args);
}

export const backend = {
  /* ---- 曲库 ---- */
  scan: (folderIds = []) => call(bindings?.Library?.Scan, folderIds),
  songs: () => call(bindings?.Library?.Songs),
  folders: () => call(bindings?.Library?.Folders),
  addFolder: (manualPath = "") => call(bindings?.Library?.AddFolder, manualPath),
  removeFolder: (id) => call(bindings?.Library?.RemoveFolder, id),
  setWatchers: (enabled) => call(bindings?.Library?.SetWatchers, enabled),
  toggleLike: (songId) => call(bindings?.Library?.ToggleLike, songId),
  revealInExplorer: (path) => call(bindings?.Library?.RevealInExplorer, path),
  pickDirectory: () => call(bindings?.Library?.PickDirectory),
  stats: () => call(bindings?.Library?.Stats),
  refreshWatchers: () => call(bindings?.Library?.RefreshWatchers),

  /* ---- 歌单 ---- */
  playlists: () => call(bindings?.Playlist?.List),
  createPlaylist: (name) => call(bindings?.Playlist?.Create, name),
  renamePlaylist: (id, name) => call(bindings?.Playlist?.Rename, id, name),
  deletePlaylist: (id) => call(bindings?.Playlist?.Delete, id),
  addSongsToPlaylist: (id, songIds) => call(bindings?.Playlist?.AddSongs, id, songIds),
  removeSongsFromPlaylist: (id, songIds) => call(bindings?.Playlist?.RemoveSongs, id, songIds),
  reorderPlaylist: (id, from, to) => call(bindings?.Playlist?.Reorder, id, from, to),
  reorderPlaylists: (from, to) => call(bindings?.Playlist?.ReorderPlaylists, from, to),
  exportPlaylist: (id) => call(bindings?.Playlist?.Export, id),

  /* ---- 歌词 ---- */
  loadLyrics: (songId) => call(bindings?.Lyrics?.Load, songId),

  /* ---- 主题 ---- */
  listThemes: () => call(bindings?.Themes?.List),
  loadTheme: (id) => call(bindings?.Themes?.Load, id),
  reloadThemes: () => call(bindings?.Themes?.Reload),
  themeDir: () => call(bindings?.Themes?.Dir),
  revealThemeDir: () => call(bindings?.Themes?.RevealDir),

  /* ---- 配置 ---- */
  getConfig: () => call(bindings?.Config?.Get),
  setConfig: (patch) => call(bindings?.Config?.Set, patch),
  configPath: () => call(bindings?.Config?.Path),
  resetConfig: () => call(bindings?.Config?.Reset),

  /* ---- 播放地址 ---- */
  mediaUrl: (songId) => call(bindings?.Media?.URL, songId),
  mediaState: () => call(bindings?.Media?.State),

  /* ---- 窗口 ---- */
  windowMinimize: () => call(bindings?.Window?.Minimize),
  windowToggleMaximize: () => call(bindings?.Window?.ToggleMaximize),
  windowClose: () => call(bindings?.Window?.Close),
  windowSetFullscreen: (on) => call(bindings?.Window?.SetFullscreen, on),
  windowToggleFullscreen: () => call(bindings?.Window?.ToggleFullscreen),
  windowIsFullscreen: () => call(bindings?.Window?.IsFullscreen),
};

/* --------------------------------------------------------------------------
   浏览器预览模式下的事件模拟
   -------------------------------------------------------------------------- */
let mockTimer = null;

export function startMockWatcher() {
  if (active) return () => {};
  mockTimer = setInterval(() => {
    emit("scan:progress", { phase: "watch", message: "已监听文件夹变化" });
  }, 60_000);
  return () => clearInterval(mockTimer);
}
