/* ==========================================================================
   bridge.js — 前端 ↔ Go(Wails3) 后端桥接层
   --------------------------------------------------------------------------
   浏览器预览模式下自动降级为 mock（界面设计与联调无需后端即可进行）。
   接入真实后端时，只需让 Go 侧导出同名方法：
     Library.Scan(folderIds) -> ScanResult
     Library.Songs() -> Song[]
     Library.ListFolders() -> Folder[]
     Library.AddFolder() -> Folder
     Library.RemoveFolder(id) -> void
     Library.ToggleLike(songId) -> bool
     Playlist.List() -> Playlist[]
     Playlist.Create(name) -> Playlist
     Playlist.Rename(id, name) -> Playlist
     Playlist.Delete(id) -> void
     Playlist.AddSongs(id, songIds) -> void
     Playlist.RemoveSongs(id, songIds) -> void
     Playlist.Reorder(id, from, to) -> void
     Lyrics.Load(songId) -> string
     Themes.List() -> ThemeInfo[]
     Themes.Load(id) -> string(css)
     Config.Get() / Config.Set(patch)
   ========================================================================== */

const wails = globalThis.window?.go?.backend ?? null;
const wailsRuntime = globalThis.window?.runtime ?? null;

export const isWails = Boolean(wails);

/** 统一事件订阅：Wails 事件 或 浏览器 CustomEvent */
export function on(eventName, handler) {
  if (wailsRuntime?.EventsOn) {
    return wailsRuntime.EventsOn(eventName, handler);
  }
  const listener = (e) => handler(e.detail);
  window.addEventListener(`dsh:${eventName}`, listener);
  return () => window.removeEventListener(`dsh:${eventName}`, listener);
}

/** 浏览器预览时手动触发事件（mock 用） */
export function emit(eventName, payload) {
  window.dispatchEvent(new CustomEvent(`dsh:${eventName}`, { detail: payload }));
}

async function call(path, ...args) {
  if (!isWails) return null;
  const [group, method] = path.split(".");
  const target = wails[group];
  if (!target?.[method]) {
    console.warn(`[bridge] 后端方法不存在：${path}`);
    return null;
  }
  return target[method](...args);
}

export const backend = {
  async scan(folderIds = []) {
    return call("Library.Scan", folderIds);
  },
  async songs() {
    return call("Library.Songs");
  },
  async folders() {
    return call("Library.ListFolders");
  },
  async addFolder() {
    return call("Library.AddFolder");
  },
  async removeFolder(id) {
    return call("Library.RemoveFolder", id);
  },
  async toggleLike(songId) {
    return call("Library.ToggleLike", songId);
  },
  async playlists() {
    return call("Playlist.List");
  },
  async createPlaylist(name) {
    return call("Playlist.Create", name);
  },
  async renamePlaylist(id, name) {
    return call("Playlist.Rename", id, name);
  },
  async deletePlaylist(id) {
    return call("Playlist.Delete", id);
  },
  async addSongsToPlaylist(id, songIds) {
    return call("Playlist.AddSongs", id, songIds);
  },
  async removeSongsFromPlaylist(id, songIds) {
    return call("Playlist.RemoveSongs", id, songIds);
  },
  async reorderPlaylist(id, from, to) {
    return call("Playlist.Reorder", id, from, to);
  },
  async loadLyrics(songId) {
    return call("Lyrics.Load", songId);
  },
  async listThemes() {
    return call("Themes.List");
  },
  async loadTheme(id) {
    return call("Themes.Load", id);
  },
  async getConfig() {
    return call("Config.Get");
  },
  async setConfig(patch) {
    return call("Config.Set", patch);
  },
  async revealInExplorer(path) {
    return call("Library.RevealInExplorer", path);
  },
  async pickDirectory() {
    return call("Library.PickDirectory");
  },
  async windowMinimize() {
    return call("Window.Minimize");
  },
  async windowToggleMaximize() {
    return call("Window.ToggleMaximize");
  },
  async windowClose() {
    return call("Window.Close");
  },
  async windowSetFullscreen(on) {
    return call("Window.SetFullscreen", on);
  },
};

/* --------------------------------------------------------------------------
   浏览器预览模式下驱动界面的事件模拟
   -------------------------------------------------------------------------- */
let mockTimer = null;

export function startMockWatcher() {
  if (isWails) return () => {};
  mockTimer = setInterval(() => {
    emit("scan:progress", { phase: "watch", message: "已监听文件夹变化" });
  }, 60_000);
  return () => clearInterval(mockTimer);
}
