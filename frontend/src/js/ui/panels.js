/* ==========================================================================
   ui/panels.js — 底栏之上的四个浮层
     · <mp-queue-panel>     播放列表面板
     · <mp-options-panel>   播放选项（歌词字号 / 桌面歌词 / 音效 / 背景不透明度）
     · <mp-sleep-panel>     定时停止
     · <mp-download-panel>  下载任务
   --------------------------------------------------------------------------
   这四个面板的共同点：都是「浮层 + 开合过渡」。迁移前每个模块各自维护
   panelCloseTimer / hidden / data-state 三件套（一共四份几乎一样的代码，
   而且「关闭动画还没放完又被打开」这类边界各自处理得都不太一样）。
   这里抽成 MpPanel 基类：开合过渡一份实现，子类只写内容。
   ========================================================================== */

import Sortable from "sortablejs";
import { MpElement, define, html, nothing, repeat, icon } from "./base.js";
import { coverSrc } from "./track-table.js";
import { toast } from "./overlays.js";
import { animationMs } from "../runtime-tokens.js";
import { createSlider } from "../slider.js";
import { applyGlassAlpha, resolvedGlassAlpha } from "../theme.js";
import { setRuntimeToken } from "../runtime-tokens.js";
import { applyEffectPreset } from "../audio.js";
import { commit, coverVersion, isLiked, playSong, removeFromQueue, reorderQueue, songById, state } from "../store.js";
import { coverOf } from "../utils.js";
import { markDragEnd, shouldIgnoreRowClick } from "../tracks.js";
import { clearQueue } from "../store.js";
import { DESKTOP_MODE, applyDesktopMode, currentDesktopMode } from "../desktop-mode.js";
import { EFFECT_PRESETS } from "./effect-presets.js";
import { LYRIC_SIZE_MAX, LYRIC_SIZE_MIN } from "./lyric-size.js";
import {
  applySleepMinutes,
  clearSleepTimer,
  setSleepAfterSong,
  toggleOptionsPanel,
  toggleQueuePanel,
  toggleSleepPanel,
} from "../playerbar.js";
import {
  downloadsSnapshot,
  closeDownloadPanel,
  clearFinishedDownloads,
  openDownloadDir,
  openDownloadLocation,
} from "../downloads.js";
import { locateCurrentQueueItem } from "../tracks.js";

/* --------------------------------------------------------------------------
   桌面歌词三选一 [关闭 | 悬浮 | 背景]
   --------------------------------------------------------------------------
   取值与 Go 侧 desktopModeOff / desktopModeLyrics / desktopModeWallpaper
   一一对应（见 desktop-mode.js 的 DESKTOP_MODE）。
   -------------------------------------------------------------------------- */
const DESKTOP_MODE_OPTIONS = [
  {
    id: "opt-desktop-off",
    value: DESKTOP_MODE.off,
    label: "关闭",
    tip: "不在桌面上显示歌词",
  },
  {
    id: "opt-desktop-lyrics",
    value: DESKTOP_MODE.lyrics,
    label: "悬浮",
    tip: "在桌面上显示一行置顶歌词（独立透明窗口，可拖动）",
  },
  {
    id: "opt-desktop-wallpaper",
    value: DESKTOP_MODE.wallpaper,
    label: "背景",
    tip: "把播放界面的背景铺满桌面、垫在桌面图标之下，歌词跟着画在上面（仅 Windows）",
  },
];

/**
 * 切到指定桌面模式并提示结果。
 *
 * 为什么等结果再提示、而不是点了就先说「已开启」：这两个模式都要真实创建
 * 窗口，而桌面背景歌词还依赖系统的桌面窗口结构 —— 它确实会失败。
 * 底栏那两个入口已经搬到这里（见 ui/panels.js 的桌面模式分段控件），所以现在
 * 这是唯一实现；三选一需要直接指定目标模式，不是「开关取反」。
 */
async function switchDesktopMode(mode) {
  const res = await applyDesktopMode(mode);
  commit();
  const label = DESKTOP_MODE_OPTIONS.find((o) => o.value === mode)?.label || "";
  if (res.ok !== false) {
    toast(mode === DESKTOP_MODE.off ? "已关闭桌面歌词" : `桌面歌词：${label}`, { duration: 1400 });
    return res;
  }
  toast(`打不开：${res.reason || res.error || "未知原因"}`, { tone: "warning", duration: 3200 });
  if (res.restored) toast("已保留原来的桌面歌词设置", { duration: 1800 });
  return res;
}

/* ==========================================================================
   基类：浮层开合（hidden + data-state 两段式过渡）
   ========================================================================== */
export class MpPanel extends MpElement {
  /** 子类覆写：当前是否应该展示 */
  get open() {
    return false;
  }

  /** 子类覆写：面板根元素 */
  get panelEl() {
    return null;
  }

  updated() {
    const el = this.panelEl;
    if (!el) return;
    if (this.open) {
      if (this._closeTimer) {
        clearTimeout(this._closeTimer);
        this._closeTimer = null;
      }
      if (el.hidden) {
        // 注：壳层配色（--chrome-*）在**详情页开合时**就由 playerhost 同步好了
        // （见 skinhost.applyChrome），面板打开这一刻不需要再做什么 —— v2 时代
        // 这里要投影一次详情页色彩域，v3 起浮层直接继承 html 上的 --chrome-*。
        el.hidden = false;
        // 先解除 hidden 再翻 data-state，保证过渡真的发生
        el.dataset.state = "";
        requestAnimationFrame(() => {
          if (this.open) el.dataset.state = "opened";
        });
      } else if (el.dataset.state !== "opened") {
        el.dataset.state = "opened";
      }
      return;
    }
    if (el.hidden) return;
    el.dataset.state = "closed";
    if (this._closeTimer) return;
    this._closeTimer = setTimeout(() => {
      this._closeTimer = null;
      if (!this.open && el) el.hidden = true;
    }, animationMs() + 40);
  }

  disconnectedCallback() {
    if (this._closeTimer) clearTimeout(this._closeTimer);
    this._closeTimer = null;
    super.disconnectedCallback();
  }

  /** 点面板外 / Esc 关闭（四个面板统一） */
  bindDismiss(buttonSelector) {
    const onDown = (e) => {
      const el = this.panelEl;
      if (!el || el.hidden) return;
      if (el.contains(e.target) || e.target.closest?.(buttonSelector)) return;
      this.close();
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const el = this.panelEl;
      if (el && !el.hidden) this.close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    this._undismiss = () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }

  close() {}
}

/* ==========================================================================
   ① 播放列表面板
   ========================================================================== */
class MpQueuePanel extends MpPanel {
  static deps = (s) => [s.queueOpen, s.queue, s.currentId, s.playing, coverVersion()];

  get open() {
    return Boolean(state.queueOpen);
  }

  get panelEl() {
    return this.querySelector("#queue-panel");
  }

  close() {
    toggleQueuePanel(false);
  }

  firstUpdated() {
    this.bindDismiss("#btn-playlist");
    this.bindDrag();
  }

  updated() {
    super.updated();
    this.bindDrag();
  }

  bindDrag() {
    const body = this.querySelector("#queue-panel-body");
    if (!body) return;
    if (this._sortable && this._sortable.el === body) return;
    this._sortable?.destroy();
    this._sortable = Sortable.create(body, {
      draggable: ".queue-item",
      animation: 0,
      ghostClass: "is-dragging",
      onEnd: (evt) => {
        markDragEnd();
        const from = evt.oldIndex;
        const to = evt.newIndex;
        if (from == null || to == null || from === to) return;
        const parent = evt.from;
        const siblings = Array.from(parent.children).filter((n) => n !== evt.item);
        parent.insertBefore(evt.item, siblings[from] ?? null);
        reorderQueue(from, to);
        toast("已调整播放顺序 · 播放模式已切回列表循环", { duration: 1600 });
      },
    });
  }

  disconnectedCallback() {
    this._sortable?.destroy();
    this._sortable = null;
    this._undismiss?.();
    super.disconnectedCallback();
  }

  render() {
    // 用 songById：在线试听曲目不在 state.songs 里，只在 songs 里查会让这一行
    // 消失、计数少 1，并让 DOM 下标与 state.queue 下标错位（拖拽会移错那首）。
    // 面板关着的时候不渲染列表：否则往队列里加一首歌就会连隐藏面板一起更新。
    // 打开时 state.queueOpen 变化会触发重绘，内容照样是齐的。
    const list = state.queueOpen ? state.queue.map((id) => songById(id)).filter(Boolean) : [];
    // ★ id → 在 state.queue 里的下标，一次建好。
    //
    // 为什么不能像原来那样在 item() 里写 state.queue.indexOf(song.id)：
    // item() 被 repeat() **每行调一次**，于是渲染队列是 O(n²) ——
    // 5,000 首队列就是 1,250 万次比较，而且这个面板的 deps 含 currentId/playing，
    // 每次切歌、每次播放暂停都要重渲染一遍。建一次 Map 是 O(n)。
    //
    // 注意必须用 state.queue 的下标（而不是 list 的下标）：list 过滤掉了
    // songById 查不到的项，两者长度可能不同，而拖拽与「第几首」都按 queue 走。
    const posById = new Map();
    if (state.queueOpen) {
      for (let i = 0; i < state.queue.length; i += 1) posById.set(state.queue[i], i);
    }
    return html`
      <section
        class="queue-panel"
        id="queue-panel"
        hidden
        data-state="closed"
        aria-label="播放列表"
      >
        <div class="queue-panel__head">
          <span class="queue-panel__title">播放列表</span>
          <span class="u-spacer"></span>
          <span class="queue-panel__count" id="queue-panel-count">${list.length} 首</span>
          <button
            class="queue-panel__btn u-hit"
            id="queue-locate"
            type="button"
            data-tip="定位到当前播放"
            aria-label="定位到当前播放"
            @click=${() => locateCurrentQueueItem()}
          >
            ${icon("disc")}
          </button>
          <button
            class="queue-panel__btn u-hit"
            id="queue-clear"
            type="button"
            data-tip="清空列表"
            aria-label="清空列表"
            @click=${() => {
              clearQueue();
              toast("播放列表已清空");
            }}
          >
            ${icon("trash")}
          </button>
          <button
            class="queue-panel__btn u-hit"
            id="queue-close"
            type="button"
            data-tip="关闭"
            aria-label="关闭播放列表"
            @click=${() => this.close()}
          >
            ${icon("close")}
          </button>
        </div>
        <div
          class="queue-panel__body"
          id="queue-panel-body"
          @click=${(e) => this.onClick(e)}
          @keydown=${(e) => this.onKey(e)}
        >
          ${
            list.length
              ? repeat(
                  list,
                  (song) => song.id,
                  (song) => this.item(song, posById.get(song.id) ?? -1)
                )
              : html`<div class="queue-panel__empty">播放列表是空的<br />从曲库把歌曲加进来</div>`
          }
        </div>
      </section>
    `;
  }

  /**
   * 一行队列项。
   * @param {object} song
   * @param {number} index 该曲在 state.queue 里的下标（由 render 一次算好，
   *   避免每行一次 O(n) 的 indexOf —— 见 render 里的 posById 说明）。-1 表示查不到。
   */
  item(song, index) {
    const current = song.id === state.currentId;
    return html`
      <div
        class="queue-item"
        data-queue-id=${song.id}
        aria-current=${String(current)}
        role="button"
        tabindex="0"
        draggable="true"
      >
        <span class="queue-item__index">${current && state.playing ? icon("play") : index + 1}</span>
        <span class="queue-item__cover"><img src=${coverSrc(coverOf(song))} alt="" loading="lazy" /></span>
        <span class="queue-item__main">
          <span class="queue-item__title">${song.title}</span>
          <span class="queue-item__sub">${song.artist}${song.album ? ` · ${song.album}` : ""}</span>
        </span>
        <button
          class="queue-item__del"
          type="button"
          data-queue-del=${song.id}
          data-tip="从列表移除"
          aria-label="从列表移除"
        >
          ${icon("close")}
        </button>
      </div>
    `;
  }

  onClick(e) {
    // 拖拽结束会跟着冒泡一个 click：不拦的话会误判成「点选这首歌」而切歌
    if (shouldIgnoreRowClick()) return;
    const del = e.target.closest("[data-queue-del]");
    if (del) {
      e.stopPropagation();
      removeFromQueue(del.dataset.queueDel);
      return;
    }
    const item = e.target.closest("[data-queue-id]");
    if (item) playSong(item.dataset.queueId);
  }

  onKey(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest?.("[data-queue-id]");
    if (!item) return;
    e.preventDefault();
    playSong(item.dataset.queueId);
  }
}
define("mp-queue-panel", MpQueuePanel);

/* ==========================================================================
   ② 播放选项面板
   ==========================================================================
   面板内容刻意保持**简洁**：只有「边听边调」的几个控制，不放任何说明文字。

   现在有四项：
     · 歌词字号       —— 滑条（14~72）
     · 显示歌词       —— 开关（这一项是从设置页搬过来的）
     · 桌面歌词       —— 三选一：[关闭 | 悬浮 | 背景]
     · 音效           —— 档位按钮（这一组是从设置页搬过来的）
     · 背景不透明度   —— 滑条

   每一项都是一张小卡片：图标头（图标按功能选：A = 字号、歌词 = 显示歌词、
   显示器 = 桌面歌词、波形 = 音效、半填的圆 = 不透明度）+ 控件。两个滑条的读数
   放在卡片头右侧（不拖动时滑条自己不显示数值），滑条两端放的是**这项专属**的
   量程提示：
     · 字号两端是量程 14 / 72（等宽数字）；
     · 不透明度两端是空心 → 实心两块小方，直接把「透明 → 不透明」画出来。
   卡片样式与定时停止面板（sleep-panel__option）同一套语言：surface 底 + hairline 边。

   「显示歌词」是**开关**，所以它没有第二行控件：图标头右侧直接放开关，
   卡片只有一行高 —— 与另外几项的视觉重量保持一致。

   「桌面歌词 / 桌面背景歌词」合成一组三选一，是因为它们在**后端本来就是
   互斥的**（见 desktop-mode.js：两个各占一个真实窗口，同时开会叠成一团）。
   原来表示成两个独立开关，用户完全看不出这层约束，只能靠点了之后
   「另一个怎么自己灭了」去猜。三段式单选把约束直接画在界面上。
   ========================================================================== */
class MpOptionsPanel extends MpPanel {
  static deps = (s) => [
    s.optionsOpen,
    s.config.lyricsFontSize,
    s.config.glassAlpha,
    s.config.glassAlphaCustom,
    s.config.effectPreset,
    s.config.showLyrics,
    s.config.showDesktopLyrics,
    s.config.showDesktopWallpaper,
  ];

  get open() {
    return Boolean(state.optionsOpen);
  }

  get panelEl() {
    return this.querySelector("#options-panel");
  }

  close() {
    toggleOptionsPanel(false);
  }

  firstUpdated() {
    this.bindDismiss("#btn-options");
    this._sliders = {
      size: createSlider(this.querySelector("#opt-lyric-size"), {
        min: LYRIC_SIZE_MIN,
        max: LYRIC_SIZE_MAX,
        step: 1,
        value: state.config.lyricsFontSize,
        format: (v) => `${Math.round(v)}px`,
        onChange: (v) => {
          state.config.lyricsFontSize = v;
          setRuntimeToken("--lyric-size", `${v}px`);
          this.requestUpdate();
        },
        onCommit: () => commit(),
      }),
      alpha: createSlider(this.querySelector("#opt-alpha"), {
        min: 20,
        max: 95,
        step: 1,
        value: state.config.glassAlphaCustom ? state.config.glassAlpha : resolvedGlassAlpha(),
        format: (v) => `${Math.round(v)}%`,
        onChange: (v) => {
          state.config.glassAlpha = v;
          state.config.glassAlphaCustom = true;
          applyGlassAlpha(v);
          this.requestUpdate();
        },
        onCommit: () => commit(),
      }),
    };
  }

  disconnectedCallback() {
    this._undismiss?.();
    super.disconnectedCallback();
  }

  render() {
    const size = Math.round(state.config.lyricsFontSize);
    const alpha = Math.round(state.config.glassAlphaCustom ? state.config.glassAlpha : resolvedGlassAlpha());
    const mode = currentDesktopMode();
    return html`
      <section
        class="options-panel"
        id="options-panel"
        hidden
        data-state="closed"
        aria-label="播放选项"
      >
        <div class="options-panel__head">
          <svg class="options-panel__icon" aria-hidden="true"><use href="#i-options"></use></svg>
          <span class="options-panel__title">播放选项</span>
          <span class="u-spacer"></span>
          <button
            class="options-panel__btn u-hit"
            id="options-close"
            type="button"
            data-tip="关闭"
            aria-label="关闭选项"
            @click=${() => this.close()}
          >
            ${icon("close")}
          </button>
        </div>
        <div class="options-panel__body" id="options-panel-body">
          <div class="opt" data-opt="lyric-size">
            <div class="opt__head">
              <span class="opt__icon">${icon("text-size")}</span>
              <span class="opt__label">歌词字号</span>
              <span class="opt__value" id="opt-lyric-size-val">${size}px</span>
            </div>
            <div class="opt__control">
              <span class="opt__range">${LYRIC_SIZE_MIN}</span>
              <div class="slider" id="opt-lyric-size" role="slider" tabindex="0" aria-label="歌词字号">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="opt__range">${LYRIC_SIZE_MAX}</span>
            </div>
          </div>
          <div class="opt" data-opt="show-lyrics">
            <div class="opt__head">
              <span class="opt__icon">${icon("lyrics")}</span>
              <span class="opt__label">显示歌词</span>
              <span class="u-spacer"></span>
              <button
                class="switch"
                type="button"
                role="switch"
                id="opt-show-lyrics"
                aria-checked=${String(state.config.showLyrics !== false)}
                aria-label="显示歌词"
                @click=${() => this.toggleShowLyrics()}
              ></button>
            </div>
          </div>
          <div class="opt" data-opt="desktop">
            <div class="opt__head">
              <span class="opt__icon">${icon("desktop-lyrics")}</span>
              <span class="opt__label">桌面歌词</span>
            </div>
            <div class="opt__control">
              <div class="segmented" role="radiogroup" aria-label="桌面歌词">
                ${DESKTOP_MODE_OPTIONS.map(
                  (opt) =>
                    html`<button
                      class="segmented__btn"
                      type="button"
                      role="radio"
                      id=${opt.id}
                      data-mode=${opt.value}
                      aria-checked=${String(opt.value === mode)}
                      ?disabled=${
                        opt.value === DESKTOP_MODE.wallpaper && state.desktopWallpaperSupport?.supported === false
                      }
                      data-tip=${
                        opt.value === DESKTOP_MODE.wallpaper && state.desktopWallpaperSupport?.supported === false
                          ? state.desktopWallpaperSupport.reason
                          : opt.tip
                      }
                      @click=${() => this.pickDesktopMode(opt)}
                    >
                      ${opt.label}
                    </button>`
                )}
              </div>
            </div>
          </div>
          <div class="opt" data-opt="effect">
            <div class="opt__head">
              <span class="opt__icon">${icon("eq")}</span>
              <span class="opt__label">音效</span>
            </div>
            <div class="opt__control">
              <div class="segmented segmented--wrap" data-segment="effectPreset">
                ${EFFECT_PRESETS.map(
                  (p) =>
                    html`<button
                      class="segmented__btn"
                      type="button"
                      data-value=${p.value}
                      aria-pressed=${String(p.value === (state.config.effectPreset || "off"))}
                      @click=${() => this.pickEffect(p.value)}
                    >
                      ${p.label}
                    </button>`
                )}
              </div>
            </div>
          </div>
          <div class="opt" data-opt="alpha">
            <div class="opt__head">
              <span class="opt__icon">${icon("opacity")}</span>
              <span class="opt__label">背景不透明度</span>
              <span class="opt__value" id="opt-alpha-val">${alpha}%</span>
            </div>
            <div class="opt__control">
              <span class="opt__swatch" aria-hidden="true"></span>
              <div class="slider" id="opt-alpha" role="slider" tabindex="0" aria-label="背景不透明度">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="opt__swatch opt__swatch--solid" aria-hidden="true"></span>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * 选一个桌面模式。
   *
   * 已在目标模式上时**不做事**：applyDesktopMode 内部虽然也会判「没变化」，
   * 但让它走一趟再弹一条「已开启桌面歌词」的提示，会让「点了没反应的东西」
   * 看起来像出了故障。这里提前挡掉，点当前项等于什么都没发生。
   */
  pickDesktopMode(opt) {
    if (opt.value === currentDesktopMode()) return;
    switchDesktopMode(opt.value);
  }

  /**
   * 切「显示歌词」。
   *
   * 它与详情页/桌面背景歌词共用同一个配置项（见 playerview.js 的 data-lyrics
   * 与 desktop-wallpaper-window.js），所以这里只改配置 + commit：
   * 详情页的 data-lyrics 由 Lit 的依赖数组跟着变，不需要额外通知谁。
   *
   * 默认是「显示」（配置里可能是 undefined），所以只有明确为 false 才算关 ——
   * 直接取反会把 undefined 变成 false 再变不回 true（`!undefined` 与
   * `undefined === false` 在这件事上语义不同）。
   */
  toggleShowLyrics() {
    state.config.showLyrics = state.config.showLyrics === false;
    commit();
  }

  /**
   * 切音效档位。
   *
   * 与设置界面原来的行为一致：立即生效（后端在下一个音频缓冲内切换，
   * 自带 30ms 交叉淡化），且**不等待** promise —— 切档位必须手感即时。
   */
  pickEffect(value) {
    if (value === (state.config.effectPreset || "off")) return;
    state.config.effectPreset = value;
    // 音效是跨歌的偏好，后端在换歌时会把它重新推下去（见 audio.js），
    // 这里只需要推这一次 + 让按钮的选中态跟上。
    applyEffectPreset();
    commit();
  }
}
define("mp-options-panel", MpOptionsPanel);

/* ==========================================================================
   ③ 定时停止面板
   ========================================================================== */
class MpSleepPanel extends MpPanel {
  static deps = (s) => [s.sleepOpen, s.sleepTimer, s.config.sleepAfterSong, s.playing, s.currentId];

  get open() {
    return Boolean(state.sleepOpen);
  }

  get panelEl() {
    return this.querySelector("#sleep-panel");
  }

  close() {
    toggleSleepPanel(false);
  }

  constructor() {
    super();
    this._tick = null;
    /** 拖动中的待应用分钟数（松手才真正开始倒计时） */
    this._pendingMinutes = null;
  }

  onConnected() {
    // 倒计时读数要秒级刷新（剩余 12:34 这种）
    this._tick = setInterval(() => {
      if (state.sleepOpen && state.sleepTimer) this.requestUpdate();
    }, 1000);
  }

  onDisconnected() {
    if (this._tick) clearInterval(this._tick);
    this._tick = null;
  }

  firstUpdated() {
    this.bindDismiss("#btn-sleep");
    this._slider = createSlider(this.querySelector("#sleep-slider"), {
      min: 0,
      max: 300,
      step: 1,
      value: 0,
      format: (v) => `${Math.round(v)} 分钟`,
      // 拖动中只更新读数（不 commit）：否则每动一像素都会重起倒计时
      // 拖动中先只改组件自己的「待应用分钟数」，由 Lit 重绘读数；
      // 松手（onCommit）才真正开始倒计时 —— 每动一像素都重起定时是错的。
      onChange: (v) => {
        this._pendingMinutes = Math.round(v);
        this.requestUpdate();
      },
      onCommit: (v) => {
        this._pendingMinutes = null;
        applySleepMinutes(v);
      },
    });
  }

  disconnectedCallback() {
    this._undismiss?.();
    super.disconnectedCallback();
  }

  updated() {
    super.updated();
    const timer = state.sleepTimer;
    const sliderEl = this.querySelector("#sleep-slider");
    if (timer?.type === "duration") {
      const remainMs = Math.max(0, timer.until - Date.now());
      if (sliderEl?.dataset.dragging !== "true") {
        this._slider?.set(Math.max(0, Math.round(remainMs / 60000)), { silent: true });
      }
    } else if (sliderEl?.dataset.dragging !== "true") {
      this._slider?.set(0, { silent: true });
    }
  }

  render() {
    const timer = state.sleepTimer;
    const readout = sleepReadout(timer, this._pendingMinutes);
    return html`
      <section
        class="sleep-panel"
        id="sleep-panel"
        hidden
        data-state="closed"
        aria-label="定时停止"
      >
        <div class="sleep-panel__head">
          <svg class="sleep-panel__icon" aria-hidden="true"><use href="#i-clock"></use></svg>
          <span class="sleep-panel__title">定时停止</span>
          <span class="u-spacer"></span>
          <button
            class="options-panel__btn u-hit"
            id="sleep-close"
            type="button"
            data-tip="关闭"
            aria-label="关闭定时停止"
            @click=${() => this.close()}
          >
            ${icon("close")}
          </button>
        </div>
        <div class="sleep-panel__body" id="sleep-panel-body">
          <div class="sleep-panel__bar">
            <div class="sleep-panel__readout">
              <span class="sleep-panel__value" id="sleep-value">${readout.value}</span>
              <span class="sleep-panel__sub" id="sleep-sub">${readout.sub}</span>
            </div>
            <div
              class="slider sleep-panel__slider"
              id="sleep-slider"
              role="slider"
              tabindex="0"
              aria-label="定时停止分钟数"
              aria-valuemin="0"
              aria-valuemax="300"
              aria-valuenow="0"
            >
              <div class="slider__rail"><div class="slider__fill"></div></div>
              <div class="slider__thumb"></div>
              <div class="slider__bubble"></div>
            </div>
            <div class="sleep-panel__scale"><span>0</span><span>150</span><span>300 分钟</span></div>
          </div>
          <div class="sleep-panel__option">
            <div class="sleep-panel__option-main">
              <span class="sleep-panel__option-label">歌曲播放完成后停止</span>
              <span class="sleep-panel__option-sub">倒计时结束后不立刻停，等这首播完再停</span>
            </div>
            <button
              class="switch"
              type="button"
              role="switch"
              data-sleep-act="after-song"
              aria-checked=${String(state.config.sleepAfterSong === true)}
              aria-label="歌曲播放完成后停止"
              @click=${() => setSleepAfterSong(!state.config.sleepAfterSong)}
            ></button>
          </div>
          <div class="sleep-panel__row">
            <button
              class="btn btn--sm"
              type="button"
              data-sleep-act="off"
              @click=${() => clearSleepTimer("已取消定时停止")}
            >
              ${icon("close")}<span>取消定时</span>
            </button>
          </div>
          <div class="sleep-panel__hint">
            「歌曲播放完成后停止」打开时，倒计时到点如果这首还没播完，会等它播完再停 （不会在歌曲中途打断）。拖到 0
            分钟即取消定时；设置从松手那一刻开始倒计时。
          </div>
        </div>
      </section>
    `;
  }
}

function sleepReadout(timer, pendingMinutes) {
  if (typeof pendingMinutes === "number") {
    return pendingMinutes <= 0
      ? { value: "未开启", sub: "拖到 0 即取消" }
      : { value: `${pendingMinutes} 分钟`, sub: "松手开始倒计时" };
  }
  if (timer?.type === "after-song") {
    return { value: "等待本首播完", sub: "倒计时已结束，这首播完就暂停" };
  }
  if (timer?.type === "duration") {
    const remain = Math.max(0, timer.until - Date.now());
    return { value: `剩余 ${fmtRemainShort(remain)}`, sub: `共 ${timer.minutes} 分钟` };
  }
  return { value: "未开启", sub: "拖动滑块设置时长" };
}

function fmtRemainShort(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} 小时 ${String(m).padStart(2, "0")} 分`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
define("mp-sleep-panel", MpSleepPanel);

/* ==========================================================================
   ④ 下载任务面板
   ========================================================================== */
class MpDownloadPanel extends MpPanel {
  static deps = () => {
    const d = downloadsSnapshot();
    return [d.open, d.revision];
  };

  get open() {
    return downloadsSnapshot().open;
  }

  get panelEl() {
    return this.querySelector("#download-panel");
  }

  close() {
    closeDownloadPanel();
  }

  firstUpdated() {
    this.bindDismiss("#btn-downloads");
  }

  disconnectedCallback() {
    this._undismiss?.();
    super.disconnectedCallback();
  }

  render() {
    const { tasks, running } = downloadsSnapshot();
    const hasFinished = tasks.some((t) => t?.state !== "running");
    return html`
      <section class="download-panel" id="download-panel" hidden data-state="closed" aria-label="下载任务">
        <div class="download-panel__head">
          <svg class="download-panel__icon" aria-hidden="true"><use href="#i-download"></use></svg>
          <span class="download-panel__title">下载任务</span>
          <span class="download-panel__count" id="download-panel-count">
            ${running ? `${running} 个下载中` : `共 ${tasks.length} 个`}
          </span>
          <button
            class="download-panel__btn"
            id="download-open-dir"
            type="button"
            data-tip="打开下载目录"
            aria-label="打开下载目录"
            @click=${() => openDownloadDir()}
          >
            ${icon("folder")}
          </button>
          <button
            class="download-panel__btn u-hit"
            id="download-clear"
            type="button"
            data-tip="清除已完成"
            aria-label="清除已完成"
            ?disabled=${!hasFinished}
            @click=${() => clearFinishedDownloads()}
          >
            ${icon("trash")}
          </button>
          <button
            class="download-panel__btn u-hit"
            id="download-close"
            type="button"
            data-tip="关闭"
            aria-label="关闭下载任务面板"
            @click=${() => this.close()}
          >
            ${icon("close")}
          </button>
        </div>
        <div class="download-panel__body" id="download-panel-body">
          ${
            tasks.length
              ? repeat(
                  tasks,
                  (t) => t.id,
                  (t) => this.item(t)
                )
              : html`<div class="download-panel__empty">还没有下载任务</div>`
          }
        </div>
      </section>
    `;
  }

  item(t) {
    const stateName = t.state === "running" ? "running" : t.state === "failed" ? "failed" : "done";
    const total = Number(t.total) || 0;
    const done = Number(t.done) || 0;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    // 条宽走 data-value + CSS（项目约束：不写行内 style），按 5% 取整
    const bucket = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
    const active = stateName === "running";

    let stateText = `${pct}%`;
    if (stateName === "done") stateText = "已完成";
    else if (stateName === "failed") stateText = "失败";
    else if (total <= 0) stateText = "下载中";

    let meta;
    if (active) meta = total > 0 ? `${fmtBytes(done)} / ${fmtBytes(total)}` : fmtBytes(done);
    else if (stateName === "done") meta = `${fmtBytes(done || total)} · ${t.path ? fileName(t.path) : t.dir || ""}`;
    else meta = t.message || "下载失败";

    return html`
      <div
        class="download-item"
        data-state=${stateName}
        data-download-id=${t.id}
        role=${stateName === "done" ? "button" : nothing}
        tabindex=${stateName === "done" ? "0" : nothing}
        data-tip=${stateName === "done" ? "在文件夹中显示" : nothing}
        @click=${() => openDownloadLocation(t.id)}
      >
        <div class="download-item__title">${t.title || t.bvid || "未命名"}</div>
        <div class="download-item__state">${stateText}</div>
        <div class="download-item__bar" ?hidden=${!active} data-unknown=${total > 0 ? "false" : "true"}>
          <div class="download-item__fill" data-value=${bucket}></div>
        </div>
        <div class="download-item__meta${stateName === "failed" ? " download-item__meta--error" : ""}">${meta}</div>
      </div>
    `;
  }
}
define("mp-download-panel", MpDownloadPanel);

function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x >= 10 || i === 0 ? Math.round(x) : x.toFixed(1)} ${units[i]}`;
}

function fileName(p) {
  const s = String(p || "");
  const at = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  return at >= 0 ? s.slice(at + 1) : s;
}

export const _internals = { fmtBytes, fileName, isLiked, MpPanel };
