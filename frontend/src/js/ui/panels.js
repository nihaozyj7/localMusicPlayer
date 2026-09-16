/* ==========================================================================
   ui/panels.js — 底栏之上的四个浮层
     · <mp-queue-panel>     播放列表面板
     · <mp-options-panel>   播放选项（字号 / 桌面歌词 / 透明度 / 模糊）
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
import { applyGlassAlpha, resolvedGlassAlpha, resolvedGlassBlur } from "../theme.js";
import { setRuntimeToken } from "../runtime-tokens.js";
import { commit, coverVersion, isLiked, playSong, removeFromQueue, reorderQueue, songById, state } from "../store.js";
import { coverOf } from "../utils.js";
import { markDragEnd, shouldIgnoreRowClick } from "../tracks.js";
import { clearQueue } from "../store.js";
import {
  applySleepMinutes,
  clearSleepTimer,
  setSleepAfterSong,
  toggleDesktopLyrics,
  toggleDesktopWallpaper,
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
    return html`
      <section class="queue-panel" id="queue-panel" hidden data-state="closed" aria-label="播放列表">
        <div class="queue-panel__head">
          <span class="queue-panel__title">播放列表</span>
          <span class="u-spacer"></span>
          <span class="queue-panel__count" id="queue-panel-count">${list.length} 首</span>
          <button
            class="queue-panel__btn"
            id="queue-locate"
            type="button"
            data-tip="定位到当前播放"
            aria-label="定位到当前播放"
            @click=${() => locateCurrentQueueItem()}
          >
            ${icon("disc")}
          </button>
          <button
            class="queue-panel__btn"
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
            class="queue-panel__btn"
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
                  (song) => this.item(song)
                )
              : html`<div class="queue-panel__empty">播放列表是空的<br />从曲库把歌曲加进来</div>`
          }
        </div>
      </section>
    `;
  }

  item(song) {
    const index = state.queue.indexOf(song.id);
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
   ========================================================================== */
class MpOptionsPanel extends MpPanel {
  static deps = (s) => [
    s.optionsOpen,
    s.config.lyricsFontSize,
    s.config.glassAlpha,
    s.config.glassBlur,
    s.config.glassBlurCustom,
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
        min: 12,
        max: 26,
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
      blur: createSlider(this.querySelector("#opt-blur"), {
        min: 0,
        max: 48,
        step: 1,
        value: state.config.glassBlurCustom ? state.config.glassBlur : resolvedGlassBlur(),
        format: (v) => `${Math.round(v)}px`,
        onChange: (v) => {
          state.config.glassBlur = v;
          state.config.glassBlurCustom = true;
          setRuntimeToken("--glass-blur", `${v}px`);
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
    const blur = Math.round(state.config.glassBlurCustom ? state.config.glassBlur : resolvedGlassBlur());
    return html`
      <section class="options-panel" id="options-panel" hidden data-state="closed" aria-label="播放选项">
        <div class="options-panel__head">
          <span class="options-panel__title">播放选项</span>
          <span class="u-spacer"></span>
          <button
            class="options-panel__btn"
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
          <div class="option-row">
            <span class="option-row__label">歌词字号</span>
            <div class="rangeslider">
              <div class="slider" id="opt-lyric-size" role="slider" tabindex="0" aria-label="调节">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="rangeslider__value" id="opt-lyric-size-val">${size}px</span>
            </div>
          </div>
          <div class="option-row">
            <span class="option-row__label">桌面歌词</span>
            <button
              class="switch"
              id="opt-desktop-lyrics"
              type="button"
              role="switch"
              aria-checked=${String(Boolean(state.config.showDesktopLyrics))}
              @click=${() => toggleDesktopLyrics()}
            ></button>
          </div>
          <div class="option-row">
            <span class="option-row__label">桌面背景歌词</span>
            <button
              class="switch"
              id="opt-desktop-wallpaper"
              type="button"
              role="switch"
              aria-checked=${String(Boolean(state.config.showDesktopWallpaper))}
              @click=${() => toggleDesktopWallpaper()}
            ></button>
          </div>
          <div class="option-row">
            <span class="option-row__label">背景不透明度</span>
            <div class="rangeslider">
              <div class="slider" id="opt-alpha" role="slider" tabindex="0" aria-label="调节">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="rangeslider__value" id="opt-alpha-val">${alpha}%</span>
            </div>
          </div>
          <div class="option-row">
            <span class="option-row__label">模糊程度</span>
            <div class="rangeslider">
              <div class="slider" id="opt-blur" role="slider" tabindex="0" aria-label="调节">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="rangeslider__value" id="opt-blur-val">${blur}px</span>
            </div>
          </div>
        </div>
      </section>
    `;
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
      <section class="sleep-panel" id="sleep-panel" hidden data-state="closed" aria-label="定时停止">
        <div class="sleep-panel__head">
          <svg class="sleep-panel__icon" aria-hidden="true"><use href="#i-clock"></use></svg>
          <span class="sleep-panel__title">定时停止</span>
          <span class="u-spacer"></span>
          <button
            class="options-panel__btn"
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
            class="download-panel__btn"
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
            class="download-panel__btn"
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
