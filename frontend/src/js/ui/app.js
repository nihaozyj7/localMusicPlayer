/* ==========================================================================
   ui/app.js — 应用根组件
   --------------------------------------------------------------------------
   迁移前这些节点静态写在 index.html 里，然后由七、八个模块各自
   `$("#xxx")` 去挂事件、改属性、写 innerHTML。现在整棵壳是**一个组件的模板**：
   谁渲染、谁更新一目了然，也不再需要「按钮必须静态写在 HTML 里」这条约束。

   保留的契约：
     · 所有 id / class 与迁移前一致（主题 CSS、皮肤包、tools/*.mjs 自检脚本都按它们查询）；
     · .app 的 data-mode 仍由皮肤宿主（playerhost.js）在挂载时写 —— 它属于皮肤；
       data-view 改由这里按 state.playerOpen 渲染（原本是宿主每帧写）。
   ========================================================================== */

import { MpElement, define, html } from "./base.js";
import { state } from "../store.js";
import "./titlebar.js";
import "./sidebar.js";
import "./content.js";
import "./track-table.js";
import "./playerview.js";
import "./playerbar.js";
import "./panels.js";
import "./search.js";
import "./lyrics.js";
import "./cover.js";
import "./settings-view.js";
import "./floating-lyrics.js";

class MpApp extends MpElement {
  static deps = (s) => [s.playerOpen, s.scanning, s.scanText, s.config.listDensity];

  updated() {
    // 列表密度挂在**根元素**上：它是全局显示设置，要同时命中曲目表格、底栏队列
    // 面板与搜索结果（后两者都是 #app 之外的浮层，挂 .tracks 上不会生效）。
    // 以前这段在主循环里每帧写一次，现在只在密度真的变了时由 Lit 驱动。
    const root = document.documentElement;
    const next = state.config.listDensity || "cozy";
    if (root.dataset.density !== next) root.dataset.density = next;
  }

  render() {
    return html`
      <div class="app-bg" id="app-bg" aria-hidden="true"></div>

      <div
        class="app"
        id="app"
        data-view=${state.playerOpen ? "player" : "library"}
        data-mode="classic"
        data-resolved-theme="dark-minimal"
      >
        <div class="skin-bg" id="skin-background" hidden aria-hidden="true"></div>
        <mp-titlebar></mp-titlebar>
        <mp-sidebar></mp-sidebar>
        <mp-content></mp-content>
        <mp-playerview></mp-playerview>
        <mp-playerbar></mp-playerbar>
      </div>

      <mp-queue-panel></mp-queue-panel>
      <mp-options-panel></mp-options-panel>
      <mp-sleep-panel></mp-sleep-panel>
      <mp-download-panel></mp-download-panel>
      <mp-search-overlay></mp-search-overlay>
      <mp-lyrics-panel></mp-lyrics-panel>
      <mp-cover-layer></mp-cover-layer>
      <mp-settings-layer></mp-settings-layer>
      <mp-floating-lyrics></mp-floating-lyrics>

      <div class="scanning" id="scanning" ?hidden=${!state.scanning}>
        <div class="scanning__box">
          <div class="scanning__ring"></div>
          <div class="scanning__text" id="scanning-text">${state.scanText || "正在扫描音乐文件夹…"}</div>
        </div>
      </div>
    `;
  }
}

define("mp-app", MpApp);
