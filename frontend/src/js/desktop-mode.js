/* ==========================================================================
   desktop-mode.js — 「桌面歌词」与「桌面背景歌词」的单选入口（主窗口侧）
   --------------------------------------------------------------------------
   这两个模式各自要占一个真实窗口，需求要求它们是**二选一**的一组单选按钮：
   选了 a 就不能选 b。

   把关口收在这一个函数里，所有调用方（底栏按钮、设置开关、启动时的状态同步）
   都不可能绕过去把两个窗口同时打开 —— 那既费双份资源，画面上也是两条歌词
   叠在一起。Go 侧有一份一模一样的把关（WindowService.setDesktopMode），
   两边都收口是因为窗口毕竟在后端创建：前端漏了，后端还能兜住。

   与那两个模块的关系是**单向**的（本模块 import 它们，它们不 import 本模块），
   刻意避开循环依赖：各自只负责「自己那个窗口」，模式之间的取舍在这里做。
   ========================================================================== */

import { state } from "./store.js";
import { applyDesktopLyrics, syncDesktopLyricsButtons } from "./desktop-lyrics.js";
import { applyDesktopWallpaper, syncDesktopWallpaperButtons } from "./desktop-wallpaper.js";

/** 三个取值与 Go 侧 desktopModeOff / desktopModeLyrics / desktopModeWallpaper 一一对应 */
export const DESKTOP_MODE = Object.freeze({
  off: "off",
  lyrics: "lyrics",
  wallpaper: "wallpaper",
});

/** 当前生效的模式（以配置为准 —— 后端状态由配置驱动，两边不会各说各话）。 */
export function currentDesktopMode() {
  if (state.config.showDesktopWallpaper === true) return DESKTOP_MODE.wallpaper;
  if (state.config.showDesktopLyrics === true) return DESKTOP_MODE.lyrics;
  return DESKTOP_MODE.off;
}

/** 同步两个按钮的按下态（启动时调用一次；之后每次切换由各自模块负责）。 */
export function syncDesktopModeButtons() {
  syncDesktopLyricsButtons();
  syncDesktopWallpaperButtons();
}

/**
 * 切到指定模式。
 *
 * @param {"off"|"lyrics"|"wallpaper"} mode
 * @returns {Promise<{ok: boolean, mode: string, reason?: string, restored?: boolean}>}
 */
export async function applyDesktopMode(mode) {
  const want = normalizeMode(mode);
  const previous = currentDesktopMode();
  if (want === previous) return { ok: true, mode: want, unchanged: true };

  const res = await switchTo(want);
  if (res?.ok !== false) return { ok: true, ...res, mode: want };

  // 目标没能打开（系统不支持、找不到壁纸层、窗口创建失败…）：
  // 把用户原来的选择恢复回去，别留下「点了一下，两个都没了」。
  // 恢复本身再失败也不再纠缠，如实返回第一次的错误原因。
  if (previous !== DESKTOP_MODE.off) {
    const restored = await switchTo(previous);
    if (restored?.ok !== false) return { ok: false, ...res, mode: previous, restored: true };
  }
  return { ok: false, ...res, mode: DESKTOP_MODE.off };
}

/**
 * 真正的切换动作：**先关掉另一个，再打开目标**。
 *
 * 顺序固定是有意的 —— 任何一步失败都不会同时留下两个窗口（最多是短暂的全关，
 * 而那种情况上面会负责恢复）。已经处于目标状态的那一边会因为「没变化」直接返回，
 * 不会产生多余的 IPC。
 */
async function switchTo(mode) {
  if (mode !== DESKTOP_MODE.lyrics) await applyDesktopLyrics(false);
  if (mode !== DESKTOP_MODE.wallpaper) await applyDesktopWallpaper(false);
  if (mode === DESKTOP_MODE.lyrics) return applyDesktopLyrics(true);
  if (mode === DESKTOP_MODE.wallpaper) return applyDesktopWallpaper(true);
  return { ok: true };
}

function normalizeMode(mode) {
  if (mode === DESKTOP_MODE.lyrics) return DESKTOP_MODE.lyrics;
  if (mode === DESKTOP_MODE.wallpaper) return DESKTOP_MODE.wallpaper;
  return DESKTOP_MODE.off;
}
