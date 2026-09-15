/* ==========================================================================
   runtime.js — 与界面渲染无关的「运行时副作用」同步
   --------------------------------------------------------------------------
   迁移前这些事都挤在 main.js#tick 里，于是「进度更新」会连带跑一遍
   renderKey / renderShell / paintPlayerBar… 整条渲染链。
   现在渲染交给 Lit 组件，这里只留下**真的需要跟着播放进度跑**的副作用：

     · <audio> 元素的换源与播放对齐（syncAudio）
     · 响度补偿增益的落盘（applyGainForSong）
     · 桌面歌词 / 桌面背景歌词窗口的推送
     · 封面取色与取色主题的整窗底图

   用一个「依赖键」把频率压到 250ms 一档（与原来的 notify 频率一致）：
   位置没跨过 250ms 的边界时一次都不跑。
   ========================================================================== */

import { subscribe, songById, state } from "./store.js";
import { applyGainForSong, syncAudio } from "./audio.js";
import { desktopLyricsEnabled, pushDesktopLyrics } from "./desktop-lyrics.js";
import { desktopWallpaperEnabled, pushDesktopWallpaper } from "./desktop-wallpaper.js";
import { currentLyricLine, ensureLyricsLoaded } from "./playerhost.js";
import { coverOf } from "./utils.js";
import { syncCoverAccent, syncThemeBackdrop } from "./cover-accent.js";

/** 上一次跑过的依赖键 */
let lastKey = "";

function runtimeKey(coverSrc) {
  return [
    state.currentId ?? "",
    state.playing ? 1 : 0,
    // 250ms 一档：歌词高亮 / 桌面推送不需要更细
    Math.round((state.position || 0) / 250),
    state.duration || 0,
    state.volume,
    state.muted ? 1 : 0,
    state.config.loudnessMode || "off",
    desktopLyricsEnabled() ? 1 : 0,
    desktopWallpaperEnabled() ? 1 : 0,
    Math.round(Number(state.config.lyricsFontSize) || 16),
    coverSrc,
  ].join("|");
}

function run() {
  const song = state.currentId ? songById(state.currentId) : null;
  const coverSrc = song ? coverOf(song) : "";
  const key = runtimeKey(coverSrc);
  if (key === lastKey) return;
  lastKey = key;

  // 真实播放：切歌 / 播放暂停状态变化时同步到 <audio>，并套用响度补偿
  syncAudio();
  applyGainForSong();

  // 桌面歌词：算「当前该显示的一行」推给独立的透明窗口
  if (desktopLyricsEnabled()) {
    if (state.playing) ensureLyricsLoaded();
    pushDesktopLyrics({
      text: state.playing ? currentLyricLine() : "",
      playing: Boolean(state.playing),
      // 桌面歌词是「隔着整个桌面看」的，比详情页里的歌词字号放大一点才看得清
      fontSize: Math.round((Number(state.config.lyricsFontSize) || 16) * 1.5),
    });
  }

  // 桌面背景歌词：整窗铺在桌面图标之下，数据形状与皮肤契约一致
  if (desktopWallpaperEnabled()) {
    if (state.playing) ensureLyricsLoaded();
    pushDesktopWallpaper();
  }

  // 主题：封面取色 + 取色主题的整窗底图
  syncCoverAccent(coverSrc);
  syncThemeBackdrop(coverSrc);
}

/** 启动运行时同步（订阅 store 的广播） */
export function startRuntime() {
  subscribe(run);
  run();
}

/** 强制下一次广播一定跑一遍（外部改了封面地址等场景） */
export function invalidateRuntime() {
  lastKey = "";
}
