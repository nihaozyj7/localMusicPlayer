/* ==========================================================================
   ui/desktop-lyrics.js — 桌面歌词窗口（独立透明页面）
   --------------------------------------------------------------------------
   这个组件只服务于 lyrics.html：整窗透明，除了几行歌词什么都不画。

   数据来源：主窗口把「当前歌词行 / 是否在播 / 字号」推给 Go 后端
   （WindowService.UpdateDesktopLyrics），后端再用 app.Event.Emit 广播
   desktop:lyrics 事件 —— Wails v3 的事件广播给所有窗口，所以这里订阅同一个
   事件名就能收到，不需要额外的通道。

   迁移点：以前是「拿到事件 → 直接写 #dl-line 的 textContent / 改 dataset」，
   现在事件只改组件状态，DOM 由模板推导；切行的淡入动效改成靠 keyed 的
   data-fresh 属性重触发（保留原来的「强制重排再挂属性」手法）。
   ========================================================================== */

import { LitElement, html, nothing } from "lit";
import { backend, connect, on } from "../bridge.js";
import { define } from "./base.js";

/* --------------------------------------------------------------------------
   桌面歌词样式（下拉框）
   --------------------------------------------------------------------------
   样式只影响「歌词文字怎么画」，与主窗口配置无关，所以存在 localStorage 里：
   歌词窗口与主窗口同源，样式切换后重新打开歌词窗口仍然生效。
   -------------------------------------------------------------------------- */
const STYLE_KEY = "music-player.desktop-lyrics.style.v1";

/** 可选样式；id 必须与 desktoplyrics.css 里的 [data-style="…"] 一一对应 */
const LYRIC_STYLES = [
  { id: "classic", label: "经典描边" },
  { id: "outline", label: "纯描边" },
  { id: "shadow", label: "柔和投影" },
  { id: "glow", label: "霓虹发光" },
  { id: "gradient", label: "渐变色" },
];
const STYLE_IDS = new Set(LYRIC_STYLES.map((s) => s.id));

function loadStyle() {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    return STYLE_IDS.has(saved) ? saved : "classic";
  } catch {
    return "classic";
  }
}

class MpDesktopLyrics extends LitElement {
  // light DOM：desktoplyrics.css 按 #dl / .dl__line 这类全局选择器写
  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.text = "";
    this.playing = false;
    this.fontSize = 26;
    this.styleId = loadStyle();
    this.tip = "桌面歌词 · 播放歌曲后逐行显示（鼠标移入可选择样式，拖动可移动）";
    this.tipHidden = false;
    this._lastText = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.boot();
  }

  updated() {
    // 切行淡入：直接换字在桌面上看会「跳」一下。
    // 只在这一行是**新内容**时挂 data-fresh（并先摘掉它触发重排），
    // 与迁移前 lineEl.removeAttribute + void offsetWidth + setAttribute 完全一致。
    const line = this.querySelector("#dl-line");
    if (!line) return;
    if (this.text !== this._lastText) {
      this._lastText = this.text;
      line.removeAttribute("data-fresh");
      void line.offsetWidth;
      if (this.text) line.setAttribute("data-fresh", "1");
    }
  }

  async boot() {
    const ready = await connect();
    if (!ready) {
      // 浏览器预览：没有 Go 后端，这个页面本身也不会被打开
      this.tip = "预览模式：桌面歌词窗口需要应用后端";
      this.requestUpdate();
      return;
    }
    on("desktop:lyrics", (state) => this.render2(state));
    try {
      // 主动拉一次当前状态：创建窗口与页面注册监听之间有先后差，
      // 只等事件的话新窗口会一直空着，直到下一次换行。
      this.render2(await backend.desktopLyricsReady());
    } catch (err) {
      console.info("[desktop-lyrics] 初始状态读取失败", err?.message ?? err);
    }
  }

  /** 应用一次推送（方法与组件渲染同名会打架，所以叫 render2） */
  render2(state) {
    if (!state || typeof state !== "object") return;
    const px = Math.max(12, Math.min(64, Number(state.fontSize) || 26));
    const text = String(state.text || "").trim();
    this.fontSize = px;
    this.text = text;
    this.playing = Boolean(state.playing);
    if (text) this.tipHidden = true;
    this.requestUpdate();
    // 字号是给整窗用的（提示语也一起缩放），挂在渲染根上
    this.style.setProperty("--dl-size", px + "px");
  }

  setStyle(id) {
    const next = STYLE_IDS.has(id) ? id : "classic";
    this.styleId = next;
    try {
      localStorage.setItem(STYLE_KEY, next);
    } catch {
      /* 隐私模式等写不进去时忽略：只影响持久化，不影响本次显示 */
    }
    this.requestUpdate();
  }

  render() {
    return html`
      <div
        class="dl"
        id="dl"
        data-state=${this.text ? (this.playing ? "singing" : "paused") : "idle"}
        data-style=${this.styleId}
      >
        <!-- 悬浮控制栏：鼠标移入窗口时才出现（"常规窗口"形态）。
             不悬浮时整块（含窗口背景）完全透明，不会在桌面上留下半透明色块。 -->
        <div class="dl__bar" id="dl-bar">
          <label class="dl__bar-label" for="dl-style">桌面歌词样式</label>
          <div class="dl__select-wrap">
            <select
              class="dl__select"
              id="dl-style"
              aria-label="桌面歌词样式"
              .value=${this.styleId}
              @change=${(e) => this.setStyle(e.target.value)}
            >
              ${LYRIC_STYLES.map((s) => html`<option value=${s.id} ?selected=${s.id === this.styleId}>${s.label}</option>`)}
            </select>
          </div>
        </div>
        <p class="dl__line" id="dl-line">${this.text}</p>
        <p class="dl__tip" id="dl-tip" ?hidden=${this.tipHidden}>${this.tip}</p>
      </div>
    `;
  }
}

define("mp-desktop-lyrics", MpDesktopLyrics);
export const _internals = { LYRIC_STYLES, nothing };
