/* ==========================================================================
   ui/titlebar.js — 标题栏（品牌 / 搜索 / 下载 / 主题 / 设置 / 窗口按钮）
   --------------------------------------------------------------------------
   迁移说明：这棵子树以前是 index.html 里的静态节点 + 三四个模块各自
   `$("#btn-xxx")` 手工同步属性（主题图标在 main.js、下载角标在 downloads.js、
   搜索按下态在 searchpanel.js）。现在全部由本组件按 state 推导，
   没有「谁负责更新哪个属性」的隐性分工。
   ========================================================================== */

import { MpElement, define, html, nothing, icon } from "./base.js";
import { backend, isWails } from "../bridge.js";
import { commit, state } from "../store.js";
import { getTheme, toggleTheme } from "../theme.js";
import { toggleSettings } from "../shell.js";
import { toggleSearchBox } from "../searchpanel.js";
import { downloadsSnapshot, toggleDownloadPanel } from "../downloads.js";
import { fmtCount } from "../utils.js";

class MpTitlebar extends MpElement {
  static deps = () => {
    const t = getTheme(state.config.theme);
    const dark = t?.mode !== "light";
    const d = downloadsSnapshot();
    return [dark, state.config.themeMode, state.searchOpen, d.visible, d.badge];
  };

  render() {
    const t = getTheme(state.config.theme);
    const dark = t?.mode !== "light";
    const d = downloadsSnapshot();
    return html`
      <header class="titlebar" id="titlebar">
        <div class="titlebar__brand">
          <svg class="titlebar__logo"><use href="#i-music"></use></svg>
          <span>音乐播放器</span>
        </div>
        <span class="titlebar__sep"></span>
        <div class="titlebar__drag"></div>
        <div class="titlebar__actions">
          <button
            class="titlebar__btn"
            id="btn-search"
            type="button"
            data-tip="搜索（Ctrl+F）"
            aria-label="搜索"
            aria-pressed=${String(state.searchOpen)}
            @click=${() => toggleSearchBox()}
          >
            ${icon("search")}
          </button>
          <button
            class="titlebar__btn titlebar__btn--download"
            id="btn-downloads"
            type="button"
            data-tip="下载任务"
            aria-label="下载任务"
            aria-pressed="false"
            ?hidden=${!d.visible}
            @click=${() => toggleDownloadPanel()}
          >
            ${icon("download")}
            <span class="titlebar__badge" id="download-badge" ?hidden=${!d.badge}>${d.badge}</span>
          </button>
          <button
            class="titlebar__btn"
            id="btn-theme-toggle"
            type="button"
            data-tip=${dark ? "切换到浅色" : "切换到深色"}
            aria-label="切换深浅色"
            @click=${() => toggleTheme()}
          >
            ${icon(dark ? "sun" : "moon")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-settings"
            type="button"
            data-tip="设置"
            aria-label="设置"
            @click=${() => toggleSettings()}
          >
            ${icon("settings")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-min"
            type="button"
            aria-label="最小化"
            @click=${() => windowControl("min")}
          >
            ${icon("minimize")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-max"
            type="button"
            aria-label="最大化"
            @click=${() => windowControl("max")}
          >
            ${icon("maximize")}
          </button>
          <button
            class="titlebar__btn titlebar__btn--close"
            id="btn-win-close"
            type="button"
            aria-label="关闭"
            @click=${() => windowControl("close")}
          >
            ${icon("close")}
          </button>
        </div>
      </header>
    `;
  }
}

function windowControl(what) {
  if (!isWails()) {
    if (what === "close") window.close();
    return;
  }
  if (what === "min") backend.windowMinimize();
  else if (what === "max") backend.windowToggleMaximize();
  else backend.windowClose();
}

define("mp-titlebar", MpTitlebar);

/** 便于自检脚本读取（保持与迁移前一致的标题栏信息） */
export const _internals = { fmtCount, nothing, commit };
