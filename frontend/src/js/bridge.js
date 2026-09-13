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
     Window    Minimize / ToggleMaximize / Close / SetFullscreen / ToggleFullscreen /
               Backdrop / Restart
   ========================================================================== */

/* --------------------------------------------------------------------------
   绑定入口的说明符必须是「变量」
   --------------------------------------------------------------------------
   wails3 generate bindings 的产物不在源码树里按相对路径可达：
     · 浏览器里 `../bindings/…` 是**按 URL** 解析的（/js/bridge.js → /bindings/…），
       在构建产物里就是 dist/bindings/…，由 tools/build-frontend.mjs 原样拷贝；
     · 但打包器会按**文件路径**解析字符串字面量，于是找不到 src/bindings/ 而报错。
   所以这里统一用变量 + @vite-ignore：打包器不碰它，运行时由浏览器解析。
   -------------------------------------------------------------------------- */
const BINDINGS_ENTRY = "../bindings/musicplayer/index.js";
const WAILS_RUNTIME = "/wails/runtime.js";
const EVENTS_ENTRY = "../bindings/github.com/wailsapp/wails/v3/internal/eventcreate.js";

let bindings = null;
let active = false;

/** 是否连接到了真实的 Go 后端 */
export function isWails() {
  return active;
}

/** 后端只读快照（供界面提示「需安装 ffmpeg」等） */
export const backendState = {
  mediaBaseUrl: "",
  sameOrigin: true,
  canTranscode: false,
  configPath: "",
};

/** 加载真实绑定；成功返回 true。失败（浏览器预览）返回 false，不抛异常。 */
export async function connect() {
  if (active) return true;
  try {
    const mod = await import(/* @vite-ignore */ BINDINGS_ENTRY);
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
      Loudness: mod.LoudnessService,
      Window: mod.WindowService,
      Online: mod.OnlineService,
      Download: mod.DownloadService,
      Cover: mod.CoverService,
      Skins: mod.SkinService,
    };
    active = true;
    try {
      const state = await bindings.Media.State();
      // 音频与页面同源（走 Wails 的 asset server），因此没有独立端口地址
      backendState.sameOrigin = state?.sameOrigin !== false;
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
    console.info(
      `[bridge] 已连接 Go 后端（音频同源：${backendState.sameOrigin ? "是" : "否"}，转码：${backendState.canTranscode ? "可用" : "不可用"}）`
    );
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
    eventsMod = await import(/* @vite-ignore */ WAILS_RUNTIME);
  } catch {
    try {
      eventsMod = await import(/* @vite-ignore */ EVENTS_ENTRY);
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
  // 本地（内嵌 / .lrc / 缓存）都读不到时，联网自动匹配一次；后端会把结果写进缓存
  lyricsAutoMatch: (songId) => call(bindings?.Lyrics?.AutoMatch, songId),
  // 保存「用户手动匹配」的歌词：写缓存，并按设置决定是否嵌入音频文件
  lyricsSave: (songId, lrc, source = "user", embed = null) =>
    call(bindings?.Lyrics?.Save, songId, lrc, source, embed),
  lyricsCached: (songId) => call(bindings?.Lyrics?.LoadCached, songId),
  // 在线试听曲目没有本地文件，歌词只能在线匹配
  onlineLyrics: (title, artist, duration) => call(bindings?.Online?.Lyrics, title, artist, duration),

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

  /* ---- 响度均衡 ---- */
  loudnessState: () => call(bindings?.Loudness?.State),
  loudnessLookup: (songId, target) => call(bindings?.Loudness?.Get, songId, target),
  // 按需测量：播放某首歌时调用，不需要事先全库扫描
  loudnessMeasure: (songId, target) => call(bindings?.Loudness?.Measure, songId, target),
  loudnessMeasureAll: (target) => call(bindings?.Loudness?.MeasureAll, target),
  loudnessCancel: () => call(bindings?.Loudness?.Cancel),
  loudnessClear: () => call(bindings?.Loudness?.Clear),
  // 改补偿标准后让旧缓存失效
  loudnessInvalidateTarget: (target) => call(bindings?.Loudness?.InvalidateTarget, target),
  loudnessGainMap: (target) => call(bindings?.Loudness?.GainMap, target),
  loudnessAlbumGains: (target) => call(bindings?.Loudness?.AlbumGains, target),
  loudnessRefresh: () => call(bindings?.Loudness?.RefreshTools),

  /* ---- 窗口 ---- */
  windowMinimize: () => call(bindings?.Window?.Minimize),
  windowToggleMaximize: () => call(bindings?.Window?.ToggleMaximize),
  windowClose: () => call(bindings?.Window?.Close),
  windowSetFullscreen: (on) => call(bindings?.Window?.SetFullscreen, on),
  windowToggleFullscreen: () => call(bindings?.Window?.ToggleFullscreen),
  windowIsFullscreen: () => call(bindings?.Window?.IsFullscreen),
  // 原生材质（Mica / Acrylic）：读取窗口实际生效值 + 重启应用以让改动生效
  backdrop: () => call(bindings?.Window?.Backdrop),
  restartApp: () => call(bindings?.Window?.Restart),

  /* ---- 在线歌曲 ---- */
  onlineSearch: (keyword, page, pageSize) => call(bindings?.Online?.Search, keyword, page, pageSize),
  // 按标题/歌手/专辑联网找封面，返回同源代理地址
  coverLookup: (title, artist, album, duration, fallback) =>
    call(bindings?.Online?.CoverLookup, title, artist, album, duration, fallback),
  coverProviders: () => call(bindings?.Online?.CoverProviders),
  coverInvalidate: () => call(bindings?.Online?.InvalidateCovers),

  /* ---- 下载 ---- */
  downloadStart: (bvid, title, duration) => call(bindings?.Download?.Start, bvid, title, duration),
  downloadStatus: () => call(bindings?.Download?.Status),
  // PickDir / SetDir 只返回「换目录提案」（含现有文件数量），不落盘；
  // 用户确认是否迁移后再调 ApplyDir 真正生效
  downloadPickDir: () => call(bindings?.Download?.PickDir),
  downloadSetDir: (dir) => call(bindings?.Download?.SetDir, dir),
  downloadApplyDir: (dir, migrate) => call(bindings?.Download?.ApplyDir, dir, migrate),
  downloadOpenDir: (dir) => call(bindings?.Download?.OpenDir, dir),

  /* ---- 播放界面皮肤（样式包） ---- */
  // 用户数据目录里的第三方样式；文件由后端托管在 /skins/<id>/<file>
  listSkins: () => call(bindings?.Skins?.List),
  reloadSkins: () => call(bindings?.Skins?.Reload),
  skinDir: () => call(bindings?.Skins?.Dir),
  revealSkinDir: () => call(bindings?.Skins?.RevealDir),

  /* ---- 封面（本地歌曲，支持多张） ---- */
  // override 里可以给 keyword（纯关键词搜索）或 title/artist/album（精细搜索）
  coverLookupSong: (songId, override = {}) => call(bindings?.Cover?.Lookup, songId, override),
  // 一次把所有来源的候选都取回来（已下载 + 已校验），前端并排展示
  coverLookupSongAll: (songId, override = {}) => call(bindings?.Cover?.LookupAll, songId, override),
  coverFetchURL: (url) => call(bindings?.Cover?.Fetch, url),
  // 这首歌的封面集合：缓存里的（可增删/切换）+ 文件内嵌的（只读展示）
  coverList: (songId) => call(bindings?.Cover?.List, songId),
  // 追加一张并设为当前生效；embed 显式传入「是否写回歌曲文件」
  // （设置是防抖同步的，靠后端读配置会有竞态：刚开开关就换封面时后端可能还没收到）
  coverAdd: (songId, imageURL, preview, embed = null) =>
    call(bindings?.Cover?.Add, songId, imageURL, preview, embed),
  // 多选后一次应用：逐个 data URL 追加（第一张成为当前生效封面）
  coverAddMany: (songId, previews, embed = null) =>
    call(bindings?.Cover?.AddMany, songId, previews, embed),
  coverSetActive: (songId, index) => call(bindings?.Cover?.SetActive, songId, index),
  coverRemove: (songId, index) => call(bindings?.Cover?.Remove, songId, index),
  // 旧接口保留（单张语义 = 追加一张并设为当前）
  coverApply: (songId, imageURL, preview, embed = null) =>
    call(bindings?.Cover?.ApplyWith, songId, imageURL, preview, embed),
  coverReset: (songId) => call(bindings?.Cover?.Reset, songId),
  coverCurrent: (songId) => call(bindings?.Cover?.Current, songId),
  // 启动时一次性回填「缓存里已有的封面集合」，这样换过的封面重启后还在
  coverCachedSets: () => call(bindings?.Cover?.CachedSets),
  coverCachedPreviews: () => call(bindings?.Cover?.CachedPreviews),
  coverCacheStats: () => call(bindings?.Cover?.CacheStats),
  coverOpenCacheDir: (kind) => call(bindings?.Cover?.OpenCacheDir, kind),
  coverClearCache: () => call(bindings?.Cover?.ClearCache),
  // 一次性把缓存里已有的封面/歌词补写进歌曲文件（用户在设置里确认后才会调）
  coverWriteCacheToFiles: () => call(bindings?.Cover?.WriteCacheToFiles),
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
