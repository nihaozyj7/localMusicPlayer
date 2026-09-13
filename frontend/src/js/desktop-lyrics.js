/* ==========================================================================
   desktop-lyrics.js — 主窗口侧的桌面歌词控制
   --------------------------------------------------------------------------
   桌面歌词现在是**独立的透明窗口**（见 Go 侧 desktop_lyrics.go 与
   lyrics.html / desktop-lyrics-window.js）：

     主窗口（这里）                      桌面歌词窗口
       │ 当前歌词行 / 播放状态               │
       ├── WindowService.UpdateDesktopLyrics ┤
       │        （Go 侧保存 + 广播）         │
       └──── app.Event.Emit("desktop:lyrics") ─────► 渲染这一行

   为什么把「当前行」推给后端再广播，而不是主窗口直接发事件：
   Wails v3 的前端只能在收到事件时被动接收，没有「向其它窗口发事件」的
   公开接口；经由 Go 服务转一次最直接，也顺带让新开的歌词窗口能拉到
   当前状态（不用等下一次换行）。

   预览模式（浏览器、没有 Go 后端）下降级为主窗口内的一条悬浮歌词，
   保证预览界面仍然能演示这个功能。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { state } from "./store.js";

/** 上次推给后端的快照签名：歌词行每帧都在算，不去重会变成每帧一次 IPC */
let lastSignature = "";

/** 桌面歌词是否开启（配置项，主窗口与歌词窗口共用）。 */
export function desktopLyricsEnabled() {
  return state.config.showDesktopLyrics === true;
}

/**
 * 打开/关闭桌面歌词窗口。返回后端的执行结果（预览模式返回 {preview:true}）。
 */
export async function applyDesktopLyrics(on) {
  const enabled = Boolean(on);
  state.config.showDesktopLyrics = enabled;
  lastSignature = ""; // 重新打开时把当前行再推一次

  // 同步底栏按钮与设置里开关的按下态
  const btn = document.getElementById("btn-desktop-lyrics");
  if (btn) btn.setAttribute("aria-pressed", String(enabled));
  const sw = document.getElementById("opt-desktop-lyrics");
  if (sw) sw.setAttribute("aria-checked", String(enabled));

  if (!isWails()) {
    paintPreviewBar();
    return { ok: true, preview: true, enabled };
  }
  try {
    return await backend.desktopLyrics(enabled);
  } catch (err) {
    console.warn("[desktop-lyrics] 打开/关闭桌面歌词失败", err);
    return { ok: false, enabled, error: String(err?.message ?? err) };
  }
}

/**
 * 主窗口每次 tick 调用：把当前歌词行推给桌面歌词窗口。
 *
 * 内部按内容去重 —— 不变量时一次 IPC 都不发。
 */
export function pushDesktopLyrics({ text = "", playing = false, fontSize = 26 } = {}) {
  if (!desktopLyricsEnabled()) {
    paintPreviewBar();
    return;
  }
  const signature = [text, playing ? 1 : 0, Math.round(fontSize)].join("|");
  if (signature === lastSignature) return;
  lastSignature = signature;

  if (!isWails()) {
    paintPreviewBar({ text, playing });
    return;
  }
  backend.updateDesktopLyrics({ text, playing, fontSize }).catch((err) => {
    console.warn("[desktop-lyrics] 同步歌词失败", err?.message ?? err);
  });
}

/**
 * 浏览器预览下的降级：主窗口内的悬浮歌词条（index.html 里的 #desktop-lyrics）。
 *
 * 真实应用里这条永远不显示 —— 歌词在独立窗口里，主窗口里再画一条会重复。
 */
function paintPreviewBar({ text = "", playing = false } = {}) {
  const layer = document.getElementById("desktop-lyrics");
  if (!layer) return;
  const line = document.getElementById("desktop-lyrics-line");
  const show = !isWails() && desktopLyricsEnabled() && playing && Boolean(text);
  if (show) {
    if (line) line.textContent = text;
    layer.hidden = false;
  } else {
    layer.hidden = true;
  }
}
