/* ==========================================================================
   lyrics-panel.js — 兼容入口（实现已迁到 ui/lyrics.js）
   --------------------------------------------------------------------------
   底栏「歌词」按钮现在由 <mp-playerbar> 渲染并直接调用 toggleLyricsPanel()。
   这个入口保留给历史调用点（以及 `import "./lyrics-panel.js"` 这类副作用导入）。
   ========================================================================== */

export { openPanel, closePanel, toggleLyricsPanel, isLyricsPanelOpen } from "./ui/lyrics.js";
