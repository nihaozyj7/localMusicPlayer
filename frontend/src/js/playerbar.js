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

import { commit, currentSong, state, togglePlay } from "./store.js";
import { toast } from "./ui/overlays.js";

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
   桌面歌词 / 桌面背景歌词（一组三选一）
   --------------------------------------------------------------------------
   两个原来的独立开关函数（toggleDesktopLyrics / toggleDesktopWallpaper）已经
   移除：桌面模式的入口现在只有两处，都直接调 applyDesktopMode ——
     · 播放选项面板的三选一（ui/panels.js）；
     · 设置界面的两个开关（settings.js，它是「开关取反」语义，本来就没用它们）。
   留着这两个「取反」包装只会多一份必须与三选一保持一致的语义。

   真正的切换把关在 desktop-mode.js（详见那里的说明）。
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   定时停止
   -------------------------------------------------------------------------- */
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
  toast(state.config.sleepAfterSong ? "已开启：倒计时结束后等当前歌曲播完再停" : "已关闭：倒计时结束后立即停止", {
    duration: 2200,
  });
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

export { currentSong };
