/* ==========================================================================
   ui/floating-lyrics.js — 预览模式下的悬浮歌词条
   --------------------------------------------------------------------------
   真实应用里歌词画在**独立的透明窗口**上（Go 侧 desktop_lyrics.go），
   主窗口这一条永远不显示。这里只为「浏览器预览 / 无头自检」保留：
   没有第二个窗口时至少能让「歌词确实在跟着走」这件事可见。

   迁移前它由 desktop-lyrics.js#paintFloatingLyricBar 直接改 DOM，
   现在只写 state.floatingLyrics，渲染交给本组件。
   ========================================================================== */

import { MpElement, define, html } from "./base.js";
import { state } from "../store.js";

class MpFloatingLyrics extends MpElement {
  static deps = (s) => [s.floatingLyrics?.show, s.floatingLyrics?.text];

  render() {
    const f = state.floatingLyrics || { show: false, text: "" };
    return html`
      <div class="desktop-lyrics" id="desktop-lyrics" ?hidden=${!f.show} aria-hidden="true">
        <div class="desktop-lyrics__line" id="desktop-lyrics-line">${f.text}</div>
      </div>
    `;
  }
}

define("mp-floating-lyrics", MpFloatingLyrics);
