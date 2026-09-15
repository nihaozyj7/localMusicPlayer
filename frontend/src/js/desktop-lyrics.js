/* ==========================================================================
   desktop-lyrics.js — 主窗口侧的桌面歌词控制
   --------------------------------------------------------------------------
   桌面歌词现在是**独立的透明窗口**（见 Go 侧 desktop_lyrics.go 与
   lyrics.html / ui/desktop-lyrics-window.js）：

     主窗口（这里）                      桌面歌词窗口
       │ 当前歌词行 / 播放状态               │
       ├── WindowService.UpdateDesktopLyrics ┤
       │        （Go 侧保存 + 广播）         │
       └──── app.Event.Emit("desktop:lyrics") ─────► 渲染这一行

   为什么把「当前行」推给后端再广播，而不是主窗口直接发事件：
   Wails v3 的前端只能在收到事件时被动接收，没有「向其它窗口发事件」的
   公开接口；经由 Go 服务转一次最直接，也顺带让新开的歌词窗口能拉到
   当前状态（不用等下一次换行）。

   预览模式（浏览器、没有 Go 后端）下降级为主窗口内的一条悬浮歌词
   （<mp-floating-lyrics>，按 state.floatingLyrics 渲染）。

   ★ 本模块是**单向**的：只管窗口歌词自己。它和「桌面背景歌词」
   （desktop-wallpaper.js）之间的单选关系由 desktop-mode.js#applyDesktopMode
   统一协调。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { state } from "./store.js";
import { requestAppUpdate } from "./ui/base.js";

/** 上次推给后端的快照签名：歌词行每帧都在算，不去重会变成每帧一次 IPC */
let lastSignature = "";

/** 桌面歌词是否开启（配置项，主窗口与歌词窗口共用）。 */
export function desktopLyricsEnabled() {
  return state.config.showDesktopLyrics === true;
}

/**
 * 打开/关闭桌面歌词窗口。返回后端的执行结果（预览模式返回 {preview:true}）。
 *
 * @param {boolean} on
 * @param {{force?: boolean}} [opts] force=true 时即使配置没变也真的调一次后端
 */
export async function applyDesktopLyrics(on, { force = false } = {}) {
  const enabled = Boolean(on);
  const changed = desktopLyricsEnabled() !== enabled;
  state.config.showDesktopLyrics = enabled;
  lastSignature = ""; // 重新打开时把当前行再推一次

  // 本来就是这个状态：不再往后端跑一趟（切模式时会连着调好几次，省掉无谓 IPC）
  if (!changed && !force) {
    requestAppUpdate();
    return { ok: true, enabled, unchanged: true };
  }

  if (!isWails()) {
    paintFloatingLyricBar({ enabled });
    return { ok: true, preview: true, enabled };
  }
  try {
    const res = await backend.desktopLyrics(enabled);
    // 后端没开成（窗口创建失败等）：把配置回滚，别让界面显示「已开启」而桌面上什么都没有
    if (enabled && res?.ok === false) {
      state.config.showDesktopLyrics = false;
      requestAppUpdate();
    }
    return res;
  } catch (err) {
    console.warn("[desktop-lyrics] 打开/关闭桌面歌词失败", err);
    state.config.showDesktopLyrics = false;
    requestAppUpdate();
    return { ok: false, enabled, error: String(err?.message ?? err) };
  }
}

/**
 * 主窗口每次同步调用：把当前歌词行推给桌面歌词窗口。
 *
 * 内部按内容去重 —— 不变量时一次 IPC 都不发。
 */
export function pushDesktopLyrics({ text = "", playing = false, fontSize = 26 } = {}) {
  // 关着就什么都不做。「把预览条收起来」这件事由 applyDesktopLyrics 负责 ——
  // 在这里每帧收一次的话，会连带把桌面背景歌词模式下那条正常的悬浮条也抹掉。
  if (!desktopLyricsEnabled()) return;
  const signature = [text, playing ? 1 : 0, Math.round(fontSize)].join("|");
  if (signature === lastSignature) return;
  lastSignature = signature;

  if (!isWails()) {
    paintFloatingLyricBar({ text, playing });
    return;
  }
  backend.updateDesktopLyrics({ text, playing, fontSize }).catch((err) => {
    console.warn("[desktop-lyrics] 同步歌词失败", err?.message ?? err);
  });
}

/**
 * 浏览器预览下的降级：主窗口内的悬浮歌词条。
 *
 * 真实应用里这条永远不显示 —— 歌词在独立窗口里，主窗口里再画一条会重复。
 * 桌面背景歌词（desktop-wallpaper.js）在预览下也复用它。
 *
 * 迁移点：以前直接改 #desktop-lyrics / #desktop-lyrics-line 的 DOM，
 * 现在只写 state.floatingLyrics，由 <mp-floating-lyrics> 渲染。
 */
export function paintFloatingLyricBar({ text = "", playing = false, enabled = null } = {}) {
  const wanted = enabled === null ? desktopLyricsEnabled() : Boolean(enabled);
  const show = !isWails() && wanted && playing && Boolean(text);
  state.floatingLyrics = { show, text };
  requestAppUpdate();
}
