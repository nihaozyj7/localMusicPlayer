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
   逐字平滑填充（卡拉OK）
   --------------------------------------------------------------------------
   字级歌词（增强 LRC / QRC / KRC）里每个字素都有自己的起点，主窗口把
   「字素 + 起点 + 结束 + 位置锚点」一起推过来（见 playerhost.js#currentLyricFrame
   与 desktop-lyrics.js#pushDesktopLyrics），这里只做两件事：

     · 把这一行拆成 .dl__word（一个字素一个 span），每帧给它们写 `--w`（0→1）；
     · desktoplyrics.css 拿 `--w` 把「未唱到」的压暗层从左侧收走。

   为什么要自己外推：位置只有 250ms 一档的推送，只看推送的话边界是**一跳一跳**
   的。锚点 `{posMs, atMs}` 用 Date.now()（两个窗口同一个系统时钟），于是每帧都能
   算出当前真正的位置。
   -------------------------------------------------------------------------- */

/** 锚点最多外推多久：超过说明主窗口那侧停了（暂停没同步 / 卡缓冲），冻在锚点上 */
const SMOOTH_MAX_MS = 700;

/**
 * 某个字素在 posMs 时刻填了多少（0..1，量化到 1%）。
 *
 * 与皮肤包里的 lrc.js#wordFill 是同一套算法 —— 这里没有 import 那个包：
 * 歌词窗口是独立页面，为了一个 clamp 把整包（连它的三张骨架样式表）拉进来不值当。
 * 结束时刻由主窗口算好一起推过来（wordEndsOf 在那边只算一次），所以真正需要
 * 保证一致的「最后一个字 / 间奏」那段逻辑仍然只有一份实现。
 */
function fillAt(start, end, posMs) {
  const span = end - start;
  if (!(span > 0)) return posMs >= start ? 1 : 0;
  const raw = (posMs - start) / span;
  if (raw <= 0) return 0;
  if (raw >= 1) return 1;
  return Math.round(raw * 100) / 100;
}

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

    // —— 逐字平滑填充的状态（见文件头）——
    /** 这一行的字素（与 words / wordEnds 一一对应，由主窗口算好推来） */
    this.chars = [];
    this.words = [];
    this.wordEnds = [];
    this.trans = [];
    /** 位置锚点：posMs 是锚点时刻的真实进度，atMs 是那一刻的 Date.now() */
    this.posMs = 0;
    this.atMs = 0;
    /** 这一行是否按字渲染（字素与时间轴对得上才开） */
    this._wordsOn = false;
    this._wordNodes = null;
    this._fills = null;
    this._raf = 0;
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
    // 模板重建了字素 span：缓存的节点与已写过的填充值都作废
    this._wordNodes = null;
    this._fills = null;
    if (this.text !== this._lastText) {
      this._lastText = this.text;
      line.removeAttribute("data-fresh");
      void line.offsetWidth;
      if (this.text) line.setAttribute("data-fresh", "1");
    }
    this._syncSmooth();
  }

  /* --------------------------------------------------------------------------
     逐字填充：rAF 循环
     -------------------------------------------------------------------------- */

  /** 播放中且有字级时间轴才开循环；否则停掉并按锚点画最后一帧 */
  _syncSmooth() {
    const want = this._wordsOn && this.playing && typeof requestAnimationFrame === "function";
    if (!want) {
      this._stopSmooth();
      this._paint(this.posMs);
      return;
    }
    if (!this._raf) this._raf = requestAnimationFrame(this._tick);
  }

  _stopSmooth() {
    if (!this._raf) return;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  /** 箭头属性：绑定 this，才能直接交给 requestAnimationFrame */
  _tick = () => {
    this._raf = 0;
    const extra = Date.now() - this.atMs;
    this._paint(extra > SMOOTH_MAX_MS ? this.posMs : this.posMs + Math.max(0, extra));
    this._raf = requestAnimationFrame(this._tick);
  };

  /** 把每个字素的填充进度写进 `--w`（量化后只写真的变了的那些） */
  _paint(posMs) {
    if (!this._wordsOn) return;
    const nodes = this._wordNodes || (this._wordNodes = [...this.querySelectorAll(".dl__word")]);
    if (!this._fills || this._fills.length !== nodes.length) {
      this._fills = new Array(nodes.length).fill(-1);
    }
    for (let k = 0; k < nodes.length; k += 1) {
      const w = fillAt(this.words[k], this.wordEnds[k], posMs);
      if (this._fills[k] === w) continue;
      this._fills[k] = w;
      nodes[k].style.setProperty("--w", String(w));
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
    // ★ 保存取消订阅句柄。
    //
    // on() 返回的是 off()，原实现直接丢弃了它，而这个类只有 connectedCallback、
    // 没有 disconnectedCallback —— 订阅永远无法解除。
    // 本组件位于常驻的独立桌面歌词窗口（不是反复挂卸的列表项），
    // 所以影响面有限，但「注册了就必须能注销」是这里的硬约定：
    // 窗口重建 / 组件被移动时，旧实例仍会被事件回调持有，无法回收。
    this._offLyrics = on("desktop:lyrics", (state) => this.render2(state));
    try {
      // 主动拉一次当前状态：创建窗口与页面注册监听之间有先后差，
      // 只等事件的话新窗口会一直空着，直到下一次换行。
      this.render2(await backend.desktopLyricsReady());
    } catch (err) {
      console.info("[desktop-lyrics] 初始状态读取失败", err?.message ?? err);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopSmooth();
    if (this._offLyrics) {
      this._offLyrics();
      this._offLyrics = null;
    }
  }

  /** 应用一次推送（方法与组件渲染同名会打架，所以叫 render2） */
  render2(state) {
    if (!state || typeof state !== "object") return;
    const px = Math.max(12, Math.min(64, Number(state.fontSize) || 26));
    const text = String(state.text || "").trim();
    const words = Array.isArray(state.words) ? state.words.map(Number) : [];
    const wordEnds = Array.isArray(state.wordEnds) ? state.wordEnds.map(Number) : [];
    const chars = Array.isArray(state.chars) ? state.chars.map(String) : [];
    // 字素与时间轴必须一一对应，否则退回整行显示 —— 点亮错位比不逐字更糟。
    // 判据与播放详情页一致（见 player-skins/lyrics-view.js#enterWords）。
    this._wordsOn = words.length > 1 && words.length === chars.length && wordEnds.length === words.length;

    this.fontSize = px;
    this.text = text;
    this.playing = Boolean(state.playing);
    this.chars = this._wordsOn ? chars : [];
    this.words = this._wordsOn ? words : [];
    this.wordEnds = this._wordsOn ? wordEnds : [];
    this.trans = Array.isArray(state.trans) ? state.trans.filter(Boolean).map(String) : [];
    this.posMs = Math.round(Number(state.posMs) || 0);
    this.atMs = Math.round(Number(state.atMs) || 0);
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
    // 字级歌词：一个字素一个 span（`--w` 写在它们身上，见文件头）；
    // 行级歌词：与从前一样，整行一个字符串。
    const line = this._wordsOn
      ? html`${this.chars.map((ch, k) => html`<span class="dl__word" data-i=${k}>${ch}</span>`)}`
      : this.text;
    return html`
      <div
        class="dl"
        id="dl"
        data-state=${this.text ? (this.playing ? "singing" : "paused") : "idle"}
        data-style=${this.styleId}
        data-words=${this._wordsOn ? "1" : "0"}
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
        <p class="dl__line" id="dl-line">${line}</p>
        ${this.trans.length ? html`<p class="dl__trans" id="dl-trans">${this.trans.join(" · ")}</p>` : nothing}
        <p class="dl__tip" id="dl-tip" ?hidden=${this.tipHidden}>${this.tip}</p>
      </div>
    `;
  }
}

define("mp-desktop-lyrics", MpDesktopLyrics);
export const _internals = { LYRIC_STYLES, nothing };
