/* ==========================================================================
   playerbar.js — 底栏的业务动作（渲染在 ui/playerbar.js）
   --------------------------------------------------------------------------
   迁移点：
     · 曲目信息 / 进度 / 音量 / 模式 / 爱心 / 角标以前是 paintPlayerBar() 每帧
       20 多次 querySelector + 一堆 lastPainted 比较，现在由组件的依赖数组接管；
     · 队列 / 选项 / 定时三个浮层以前各自维护 panelCloseTimer + hidden +
       data-state，现在统一开合状态（state.queueOpen / optionsOpen / sleepOpen），
       由组件渲染并处理过渡；
     · 定时停止的计时逻辑（到点检查、剩余时间文案）留在这里 —— 它是业务，
       与「面板怎么画」无关。
   ========================================================================== */

import { commit, currentSong, nextIndex, songById, state, togglePlay } from "./store.js";
import { toast } from "./ui/overlays.js";
import { applyDesktopMode } from "./desktop-mode.js";
import { DESKTOP_MODE } from "./desktop-mode.js";

export const MODE_META = {
  // 顺序播放 = 列表循环（按列表顺序播完回到开头）
  sequence: { icon: "repeat", label: "列表循环" },
  "loop-all": { icon: "repeat", label: "列表循环" }, // 旧配置兼容
  "loop-one": { icon: "repeat-one", label: "单曲循环" },
  shuffle: { icon: "shuffle", label: "随机播放" },
};

/* --------------------------------------------------------------------------
   浮层开合
   -------------------------------------------------------------------------- */
export function toggleQueuePanel(force) {
  const next = typeof force === "boolean" ? force : !state.queueOpen;
  state.queueOpen = next;
  // 打开队列面板时把「选项」面板收起来，避免两块浮层叠在一起
  if (next) state.optionsOpen = false;
  commit();
}

export function toggleOptionsPanel(force) {
  const next = typeof force === "boolean" ? force : !state.optionsOpen;
  state.optionsOpen = next;
  if (next) state.queueOpen = false;
  commit();
}

export function toggleSleepPanel(force) {
  const next = typeof force === "boolean" ? force : !state.sleepOpen;
  state.sleepOpen = next;
  commit();
}

/* --------------------------------------------------------------------------
   桌面歌词 / 桌面背景歌词（一组单选按钮）
   -------------------------------------------------------------------------- */
export function toggleDesktopLyrics() {
  return toggleDesktopModeWithToast(
    state.config.showDesktopLyrics ? DESKTOP_MODE.off : DESKTOP_MODE.lyrics,
    { on: "已开启桌面歌词", off: "已关闭桌面歌词" }
  );
}

export function toggleDesktopWallpaper() {
  return toggleDesktopModeWithToast(
    state.config.showDesktopWallpaper ? DESKTOP_MODE.off : DESKTOP_MODE.wallpaper,
    { on: "已开启桌面背景歌词", off: "已关闭桌面背景歌词" }
  );
}

/**
 * 切模式并提示结果。
 *
 * 为什么要等结果再提示、而不是点了就先说「已开启」：这两个模式都要真实创建
 * 窗口，而桌面背景歌词还依赖系统的桌面窗口结构 —— 它确实会失败。
 */
async function toggleDesktopModeWithToast(mode, { on, off }) {
  const res = await applyDesktopMode(mode);
  commit();
  if (res.ok !== false) {
    toast(mode === DESKTOP_MODE.off ? off : on, { duration: 1400 });
    return res;
  }
  toast(`打不开：${res.reason || res.error || "未知原因"}`, { tone: "warning", duration: 3200 });
  if (res.restored) toast("已保留原来的桌面歌词设置", { duration: 1800 });
  return res;
}

/* --------------------------------------------------------------------------
   定时停止
   -------------------------------------------------------------------------- */
/** 剩余时长文案：1 小时 05 分 / 05:20 */
export function fmtRemain(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} 小时 ${String(m).padStart(2, "0")} 分`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 把滑条读数落地成真正的定时器 */
export function applySleepMinutes(minutes) {
  const n = Math.round(Number(minutes) || 0);
  if (n <= 0) {
    clearSleepTimer("已取消定时停止");
    return;
  }
  state.sleepTimer = { type: "duration", until: Date.now() + n * 60000, minutes: n };
  commit();
  toast(`${n} 分钟后停止播放`, { duration: 1800 });
}

export function clearSleepTimer(message) {
  state.sleepTimer = null;
  commit();
  if (message) toast(message, { duration: 1400 });
}

export function setSleepAfterSong(next) {
  state.config.sleepAfterSong = Boolean(next);
  commit();
  toast(
    state.config.sleepAfterSong
      ? "已开启：倒计时结束后等当前歌曲播完再停"
      : "已关闭：倒计时结束后立即停止",
    { duration: 2200 }
  );
}

/**
 * 定时停止到点（由底栏组件的每次更新调用，等价于原来的每帧检查）。
 *
 * 「歌曲播放完成后停止」打开时**不立刻暂停**，而是切换成 after-song 状态：
 * 等当前这首自然播完，由 store/audio 的 ended 逻辑暂停。
 */
export function checkSleepTimer() {
  const timer = state.sleepTimer;
  if (timer?.type !== "duration" || Date.now() < timer.until) return;

  if (state.config.sleepAfterSong === true && state.playing && state.currentId) {
    state.sleepTimer = { type: "after-song" };
    commit();
    toast("定时到点：等这首播完就停", { duration: 2400 });
    return;
  }

  state.sleepTimer = null;
  if (state.playing) togglePlay();
  else commit();
  toast("已按定时停止播放", { duration: 1800 });
}

/** 供播放界面显示「下一曲」提示 */
export function nextSongPreview() {
  const i = nextIndex(1);
  return i >= 0 ? songById(state.queue[i]) : null;
}

export function modeLabel(mode = state.playMode) {
  return MODE_META[mode]?.label ?? "";
}

export { currentSong };
