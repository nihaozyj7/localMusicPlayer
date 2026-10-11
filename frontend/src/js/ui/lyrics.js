/* ==========================================================================
   ui/lyrics.js — 歌词工作台（在线匹配 / 微调 / 手动编辑）
   --------------------------------------------------------------------------
   与迁移前 lyrics-panel.js 的行为一一对应，改动只有渲染方式：

     · 面板骨架：一次性 innerHTML（约 130 行模板）→ Lit 模板；
     · 微调预览 / 打轴行列表：以前是 innerHTML 重建 + 手工切 class，
       现在是 keyed repeat + 类名表达式；「当前播到哪一行」的高亮仍按 200ms
       节流计算（每帧线性扫上百行是白花的 CPU）；
     · 文本框：**不用 .value 绑定**（那会在每次重渲染时重置插入符），
       改成「需要写入时才写一次」的待写值队列。
   ========================================================================== */

import { MpElement, define, html, nothing, repeat, requestAppUpdate, icon } from "./base.js";
import { openModal, toast } from "./overlays.js";
import { seek, songById, state, subscribe, togglePlay } from "../store.js";
import {
  applyOnlineLyrics,
  currentLyricsInfo,
  ensureLyricsLoaded,
  lyricsOffsetOf,
  lyricsSourceLabel,
  setLyricsOffset,
} from "../playerhost.js";
import { coverOf, fmtTime } from "../utils.js";
import { providerListLabel } from "../provider-names.js";
import {
  formatLrcTime,
  lyricDisplayText,
  mergeDraftTimes,
  parseLyricDraft,
  serializeLrc,
  shiftLrc,
} from "@localmusicplayer/player-skins";

/** 与 bridge.js 同理：绑定是按 URL 在运行时解析的，不能让打包器按文件路径解析 */
const BINDINGS_ENTRY = "../bindings/localmusicplayer/index.js";

let bindings = null;
async function getBindings() {
  if (bindings) return bindings;
  try {
    const mod = await import(/* @vite-ignore */ BINDINGS_ENTRY);
    bindings = mod && mod.OnlineService ? mod.OnlineService : null;
  } catch (err) {
    console.info("[online] backend unavailable", err);
  }
  return bindings;
}

/** 能写回歌词标签的格式，与 Go 侧 metacache.SupportedEmbed 保持一致 */
const EMBED_EXTS = new Set(["m4a", "mp4", "m4b", "alac", "aac", "flac"]);

/** 当前 tab：online | nudge | edit */
let activeTab = "online";

/* --------------------------------------------------------------------------
   编辑草稿；songId 用来判断「换了歌，草稿要不要重来」
   -------------------------------------------------------------------------- */
const draft = {
  songId: "",
  title: "",
  lines: [],
  cursor: 0,
  undo: [],
  dirty: false,
  kept: 0,
  stale: false,
};
class MpLyricsPanel extends MpElement {
  // ★ deps 里**刻意没有** s.position（与 ui/playerbar.js 同一个理由）。
  //
  // position 每 250ms 变一次，而它是 commit/notify 都会碰的字段。把它放进 deps
  // 的代价是：**每 250ms 整个歌词面板模板重跑一遍** —— 包括三个面板的模板字面量、
  // 头部、标签数组，以及「手动编辑」页对**全部草稿行**的 repeat()。
  // 播放期间这是每秒 4 次的全量重绘，而实际变化的只有「当前唱到哪一行」。
  //
  // 位置相关的那点更新（微调预览跟随 / 编辑器当前行高亮）现在由下面的
  // _onTick() 直接调增量绘制函数完成 —— 那两个函数本来就是为这件事写的
  // （见 paintNudgeFollow / paintEditorFollow 的注释），放进 deps 等于让它们白写。
  static deps = (s) => [
    s.lyricsOpen,
    s.currentId,
    s.playing,
    activeTab,
    lyricsPanelTick,
    state.config.embedMeta,
  ];

  constructor() {
    super();
    this._nowIndex = -1;
    this._onlineError = "";
    this._searched = false;
    this._candidates = [];
    this._searching = false;
    this._onlineKeyword = "";
    this._lastNowPaint = 0;
    this._lastNudgeActive = -1;
    this._lastScrolledNow = -1;
    this._lastScrolledCursor = -1;
    this._followHold = 0;
    this._followAutoUntil = 0;
    this._lastOnlineHint = "在线歌词来源";
  }

  onConnected() {
    // 捕获阶段：空格是本程序全局的「播放/暂停」，打轴也要用空格，
    // 必须抢在快捷键之前拦下来
    this._onKeyDownCapture = (e) => this.onPanelKeyDown(e);
    document.addEventListener("keydown", this._onKeyDownCapture, true);

    // 位置相关的增量绘制（见 deps 上面的说明：position 不进 deps）。
    // 直接订阅 store，而不是靠整组件重绘 —— 与 playerbar 同一套做法
    // （base.js 的 _unsubscribers 会在 disconnectedCallback 里统一注销）。
    // 两个 paint 函数各自都有节流/变化判定，所以按 250ms 调用是安全的。
    this._unsubscribers.push(
      subscribe(() => {
        if (!this.open) return;
        if (activeTab === "nudge") this.paintNudgeFollow();
        else if (activeTab === "edit") this.paintEditorFollow();
      }),
    );
  }

  onDisconnected() {
    document.removeEventListener("keydown", this._onKeyDownCapture, true);
  }

  get open() {
    return state.lyricsOpen === true;
  }

  get panelEl() {
    return this.querySelector("#lyrics-panel");
  }

  /* ------------------------------------------------------------------------
     打开 / 关闭
     ------------------------------------------------------------------------ */
  updated() {
    const el = this.panelEl;
    if (!el) return;
    // 与底栏那四个面板同一个道理（见 panels.js#MpPanel.updated）：
    // 必须在解除 hidden *之前* 把详情页色彩域投影过来，否则会先闪一帧主题色
    el.hidden = !this.open;
    el.dataset.open = this.open ? "true" : "false";

    if (!this.open) return;
    if (activeTab === "nudge") this.paintNudgeFollow();
    if (activeTab === "edit") this.paintEditorFollow();
  }

  _refreshHeader() {
    // 头部信息直接读 currentLyricsInfo()，模板表达式里用得到；
    // 这里只需要触发一次重绘（歌词装载完成是 store 之外的变化）
    bumpLyricsPanelTick();
  }

  render() {
    const info = currentLyricsInfo();
    const song = info.song;
    // 字级（逐字）歌词：行上带 words 就说明这首歌拿到的是逐字时间轴 ——
    // 来源徽标上明说，用户才看得出「优先用字级」这条规则真的生效了。
    const wordLevel = info.lines.some((l) => Array.isArray(l.words) && l.words.length > 0);
    return html`
      <section
        class="lyricspanel"
        id="lyrics-panel"
        role="dialog"
        aria-label="歌词工作台"
        data-open=${this.open ? "true" : "false"}
        data-tab=${activeTab}
        hidden
        @click=${(e) => this.onClick(e)}
        @input=${(e) => this.onInput(e)}
      >
        <header class="lyricspanel__head">
          <img class="lyricspanel__cover" data-song-cover alt="" src=${song ? coverOf(song) : nothing} />
          <div class="lyricspanel__meta">
            <div class="lyricspanel__title" data-song-title>${song ? song.title || "未命名" : "未在播放"}</div>
            <div class="lyricspanel__sub">
              <span
                class="lyricspanel__badge${info.text ? "" : " is-empty"}"
                data-song-source
                data-src=${info.source}
              >
                ${info.status === "matching" || info.status === "loading"
                  ? "歌词匹配中…"
                  : info.status === "failed"
                    ? "歌词匹配失败"
                    : `${lyricsSourceLabel(info.source)}${wordLevel ? " · 逐字" : ""}`}
              </span>
              <span class="lyricspanel__artist" data-song-artist>${song ? song.artist || "" : ""}</span>
            </div>
          </div>
          <button
            class="lyricspanel__close u-hit"
            type="button"
            data-act="close"
            aria-label="关闭"
            @click=${() => closePanel()}
          >
            ${icon("close")}
          </button>
        </header>

        <nav class="lyricspanel__tabs" role="tablist">
          ${["online", "nudge", "edit"].map(
            (t) => html`
              <button
                class="lyricspanel__tab${activeTab === t ? " is-active" : ""}"
                type="button"
                role="tab"
                data-tab=${t}
                aria-selected=${String(activeTab === t)}
                @click=${() => setTab(t)}
              >
                ${t === "online" ? "在线匹配" : t === "nudge" ? "微调" : "手动编辑"}
              </button>
            `
          )}
        </nav>

        ${this.noticeTemplate(info)}
        <div class="lyricspanel__body">
          ${this.open ? html`${this.onlinePane()} ${this.nudgePane(info)} ${this.editPane()}` : nothing}
        </div>
      </section>
    `;
  }

  /**
   来源优先级提示
   --------------------------------------------------------------------------
   本程序的歌词读取顺序是：内嵌歌词 → 同目录 .lrc → 歌词缓存 → 在线自动匹配。
   微调 / 手动编辑的结果只能写进**缓存**（第三位），所以对「带内嵌歌词」或
   「有同名 .lrc」的歌，只写缓存会导致下次打开又变回旧歌词。
   这里选择**明说 + 给出口**，而不是假装没问题。
   */
  noticeTemplate(info) {
    const relevant = activeTab === "nudge" || activeTab === "edit";
    const conflict = info.source === "embedded" || info.source === "lrc-file";
    if (!relevant || !conflict) return nothing;
    const label = lyricsSourceLabel(info.source);
    const ext = songExt(info.song);
    const canEmbed = EMBED_EXTS.has(ext);
    return html`
      <div class="lyricspanel__notice" data-notice>
        <div class="lyricspanel__notice-text" data-notice-text>
          ${
            canEmbed
              ? html`这首歌的歌词来自「${label}」，它的优先级高于歌词缓存：只保存到缓存的话，下次打开仍会显示旧歌词。建议同时写入歌曲文件。`
              : html`这首歌的歌词来自「${label}」，它的优先级高于歌词缓存；而 ${ext ? "." + ext : "该格式"}
                不支持写入歌词标签，所以本次改动只在<b>本次运行内</b>生效（重启后会变回旧歌词）。`
          }
        </div>
        ${
          canEmbed
            ? html`<label class="lyricspanel__notice-opt" data-notice-opt>
                <input type="checkbox" data-embed-toggle checked />
                <span>同时写入歌曲文件（否则下次打开仍显示旧歌词）</span>
              </label>`
            : nothing
        }
      </div>
    `;
  }

  /* ==========================================================================
     ① 在线匹配
     ========================================================================== */
  onlinePane() {
    return html`
      <section class="lyricspanel__pane" data-pane="online" ?hidden=${activeTab !== "online"}>
        <div class="lyricspanel__row">
          <input
            class="lyricspanel__input"
            data-online-input
            placeholder="输入歌词搜索关键词"
            .value=${this._onlineKeyword}
            @input=${(e) => {
              this._onlineKeyword = e.target.value;
            }}
            @keydown=${(e) => {
              if (e.key === "Enter") this.searchLyrics();
            }}
          />
          <button
            class="btn btn--primary"
            type="button"
            data-act="lyrics-search"
            ?disabled=${this._searching}
            @click=${() => this.searchLyrics()}
          >
            ${this._searching ? "搜索中" : "搜索"}
          </button>
        </div>
        <div class="lyricspanel__hint" data-online-hint>${this._lastOnlineHint}</div>
        <div class="lyricspanel__list" data-online-results>${this.onlineResults()}</div>
      </section>
    `;
  }

  /**
   候选区：命中 / 搜索中 / 搜不到 / 还没搜 四种状态。
   --------------------------------------------------------------------------
   以前这四种状态都是「一行灰字」，空的时候整块区域看起来像个没渲染完的
   破框。这里统一走 .lyricspanel__state（与搜索层的空态同一套观感）：
   图标 + 标题 + 一句说明，能给出口的（重搜 / 去手动编辑）再带上按钮。
   */
  onlineResults() {
    if (this._searching) {
      return html`
        <div class="lyricspanel__state" data-online-state="searching">
          <span class="lyricspanel__spinner"></span>
          <div class="lyricspanel__state-title">正在搜索歌词</div>
          <div class="lyricspanel__state-desc">正在已启用的在线歌词来源里查找候选…</div>
        </div>
      `;
    }
    if (this._onlineError) {
      return html`
        <div class="lyricspanel__state lyricspanel__state--error" data-online-state="error">
          ${icon("warning")}
          <div class="lyricspanel__state-title">搜索失败</div>
          <div class="lyricspanel__state-desc">在线歌词来源没有响应。检查网络后重试，或者切到「手动编辑」自己贴一份。</div>
          <div class="lyricspanel__state-detail">${this._onlineError}</div>
          <div class="lyricspanel__state-actions">
            <button class="btn btn--sm" type="button" data-act="lyrics-search" @click=${() => this.searchLyrics()}>
              重试
            </button>
            <button class="btn btn--sm" type="button" @click=${() => setTab("edit")}>手动编辑歌词</button>
          </div>
        </div>
      `;
    }
    if (this._candidates.length) {
      return repeat(
        this._candidates,
        (c, i) => `${c.provider || ""}-${c.id || i}`,
        (c, i) => html`
          <div class="candidate">
            <div class="candidate__main">
              <div class="candidate__title">${(c.title || "未命名") + " - " + (c.artist || "未知")}</div>
              <div class="candidate__sub">
                ${(c.provider || "") + " · score " + (c.score || 0) + " · " + fmtTime(c.duration)}
              </div>
            </div>
            <button
              class="btn btn--sm btn--primary"
              type="button"
              data-act="use-lyric"
              data-i=${i}
              @click=${() => this.applyCandidate(i)}
            >
              使用
            </button>
          </div>
        `
      );
    }
    if (this._searched) {
      const title = currentTarget()?.title || "";
      const canRetryByTitle = Boolean(title) && title !== this._onlineKeyword;
      return html`
        <div class="lyricspanel__state" data-online-state="empty">
          ${icon("lyrics")}
          <div class="lyricspanel__state-title">没有找到候选歌词</div>
          <div class="lyricspanel__state-desc">
            换个更短的关键词通常更有效（只留歌名、去掉括号里的后缀）。
          </div>
          <div class="lyricspanel__state-actions">
            ${
              canRetryByTitle
                ? html`<button class="btn btn--sm" type="button" @click=${() => this.retryWithTitle()}>
                    只用歌名重搜
                  </button>`
                : nothing
            }
            <button class="btn btn--sm" type="button" @click=${() => setTab("edit")}>手动编辑歌词</button>
          </div>
        </div>
      `;
    }
    return html`
      <div class="lyricspanel__state" data-online-state="idle">
        ${icon("search")}
        <div class="lyricspanel__state-title">还没有开始搜索</div>
        <div class="lyricspanel__state-desc">搜索框里已经填好了当前歌曲，点「搜索」或按回车就能在线匹配歌词。</div>
        <div class="lyricspanel__state-actions">
          <button class="btn btn--sm btn--primary" type="button" data-act="lyrics-search" @click=${() => this.searchLyrics()}>
            搜索歌词
          </button>
        </div>
      </div>
    `;
  }

  /** 搜不到时的一键补救：只拿歌名再搜一次（括号后缀、多余歌手名最容易搜偏） */
  async retryWithTitle() {
    const title = currentTarget()?.title?.trim();
    if (!title) return;
    this._onlineKeyword = title;
    bumpLyricsPanelTick();
    await this.searchLyrics();
  }

  /* ==========================================================================
     ② 微调（整体时间轴偏移）
     --------------------------------------------------------------------------
     版面分配：上方两行紧凑控件（偏移读数 / 档位 / 听感按钮 / 滑条），
     其余高度全部留给预览列表 —— 微调是「一边听一边看预览」的操作，
     说明文字一律搬进「说明」弹层（见 openNudgeGuide），不占界面。
     ========================================================================== */
  nudgePane(info) {
    const offset = info.songId ? lyricsOffsetOf(info.songId) : 0;
    const clamped = offset < 0 ? info.lines.filter((l) => l.time + offset < 0).length : 0;
    const bounds = nudgeBounds();
    return html`
      <section class="lyricspanel__pane lyricspanel__pane--nudge" data-pane="nudge" ?hidden=${activeTab !== "nudge"}>
        <div class="nudge__bar">
          <span class="nudge__label">偏移</span>
          <b class="nudge__value" data-nudge-value>${(offset > 0 ? "+" : "") + (offset / 1000).toFixed(2)} 秒</b>
          <span class="nudge__dirty" data-nudge-dirty ?hidden=${offset === 0}>未应用</span>
          <span class="nudge__warn" data-nudge-clamp ?hidden=${clamped === 0}>
            ${clamped ? `有 ${clamped} 行被压到 0:00` : ""}
          </span>
          <span class="nudge__spacer"></span>
          <div class="nudge__steps">
            ${[-1000, -500, -100, 100, 500, 1000].map(
              (d) =>
                html`<button
                  class="btn btn--sm"
                  type="button"
                  data-act="nudge-step"
                  data-delta=${d}
                  @click=${() => nudgeBy(d)}
                >
                  ${d > 0 ? "+" : "−"}${(Math.abs(d) / 1000).toFixed(1)}
                </button>`
            )}
          </div>
        </div>
        <div class="nudge__bar">
          <button
            class="btn btn--sm nudge__feel"
            type="button"
            data-act="nudge-feel"
            data-delta="500"
            data-tip="歌词出现得太早：整体往后挪 0.5 秒"
            @click=${() => nudgeBy(500)}
          >
            歌词快了 ${icon("arrow-right")} 延后 0.5s
          </button>
          <button
            class="btn btn--sm nudge__feel"
            type="button"
            data-act="nudge-feel"
            data-delta="-500"
            data-tip="歌词出现得太晚：整体往前挪 0.5 秒"
            @click=${() => nudgeBy(-500)}
          >
            歌词慢了 ${icon("arrow-left")} 提前 0.5s
          </button>
          <input
            class="nudge__range"
            type="range"
            min=${String(bounds.lower)}
            max=${String(bounds.upper)}
            step="50"
            .value=${String(offset)}
            ?disabled=${!info.text}
            data-act="nudge-range"
            aria-label="整体偏移（毫秒）"
            @input=${(e) => nudgeTo(Number(e.target.value))}
          />
        </div>
        <div class="lyricspanel__list nudge__preview" data-nudge-preview @scroll=${() => this.onFollowScroll()}>
          ${this.nudgePreview(info, offset)}
        </div>
        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="nudge-reset" @click=${() => resetNudge()}>重置</button>
          <button
            class="btn btn--sm"
            type="button"
            data-act="nudge-guide"
            data-tip="微调介绍与使用指引"
            @click=${() => openNudgeGuide()}
          >
            ${icon("info")}说明
          </button>
          <span class="nudge__spacer"></span>
          <button class="btn btn--primary" type="button" data-act="nudge-apply" @click=${() => this.applyNudge()}>
            应用到歌词
          </button>
        </div>
      </section>
    `;
  }

  /**
   预览列表：**整首歌词**，当前唱到的那一行高亮并自动滚进可视区。

   早先这里是「以当前行为中心的 ±5 行窗口」，重建窗口时当前行永远落在中间 ——
   用户看到的是「行号推进一行、列表整体上移一行」，既没有进度感，也无法
   拿它对照真实播放位置。整首列出来之后，高亮会真的从上一行走到下一行，
   微调的效果（整体提前/延后了多少）一眼可见。

   行数 = 列表下标，所以跟随只需要切 class + 滚动，不需要重绘（见 paintNudgeFollow）。
   */
  nudgePreview(info, offset) {
    if (!info.text) {
      return html`
        <div class="lyricspanel__state">
          ${icon("lyrics")}
          <div class="lyricspanel__state-title">这首歌还没有歌词</div>
          <div class="lyricspanel__state-desc">先用「在线匹配」找一份，或者切到「手动编辑」自己贴一份。</div>
          <div class="lyricspanel__state-actions">
            <button class="btn btn--sm" type="button" @click=${() => setTab("online")}>去在线匹配</button>
            <button class="btn btn--sm" type="button" @click=${() => setTab("edit")}>去手动编辑</button>
          </div>
        </div>
      `;
    }
    const lines = info.lines;
    const active = activeLineIndex(lines, offset);
    return repeat(
      lines,
      (_line, i) => i,
      (line, i) => {
        // 偏移后不能小于 0：负偏移会把 0:00 附近的几行压到一起，显示成负数
        // 只会让人以为算错了
        const t = Math.max(0, line.time + offset);
        return html`
          <div
            class="nudge__line${i === active ? " is-active" : ""}"
            data-act="nudge-seek"
            data-ms=${t}
            data-index=${i}
            @click=${() => seek(t)}
          >
            <span class="nudge__time">${formatLrcTime(t).slice(1, -1)}</span>
            <span class="nudge__text">${lyricDisplayText(line)}</span>
          </div>
        `;
      }
    );
  }

  /**
   微调预览跟随播放。

   整首歌词都在 DOM 里之后，跟随就只剩两件事：把 .is-active 挪到当前行、
   把它滚进可视区中部 —— 不需要任何重绘（早先的窗口版必须整块重渲染，
   而且「当前行落在窗口之外」还会反过来触发重绘，第一句还没到的时候
   这个循环根本停不下来）。
   */
  paintNudgeFollow() {
    if (activeTab !== "nudge") return;
    const box = this.querySelector("[data-nudge-preview]");
    if (!box) return;
    const info = currentLyricsInfo();
    if (!info.lines.length) return;
    // 列表被重建过（换 tab / 换歌 / 调偏移）：滚动位置本来就是 0，
    // 这时要无条件把当前行滚回来，不能受「用户刚滚过」的免打扰影响
    const rebuilt = this._nudgeBox !== box;
    this._nudgeBox = box;
    const offset = info.songId ? lyricsOffsetOf(info.songId) : 0;
    const active = activeLineIndex(info.lines, offset);
    // 行号没变就不动 DOM：这个函数每 250ms 被叫一次
    if (!rebuilt && active === this._lastNudgeActive) return;
    this._lastNudgeActive = active;
    const rows = box.querySelectorAll(".nudge__line");
    if (!rows.length) return;
    let target = null;
    rows.forEach((row) => {
      const hit = Number(row.dataset.index) === active;
      row.classList.toggle("is-active", hit);
      if (hit) target = row;
    });
    if (target) this.followScroll(box, target, rebuilt);
  }

  /* ==========================================================================
     ③ 手动编辑（打轴为主）
     --------------------------------------------------------------------------
     这一页的主职责是「给每一句打上时间」。歌词文本本身（粘贴 / 整批替换）
     不是打轴时要做的事，已经搬进「编辑歌词文本」弹层（见 openDraftTextModal），
     主界面因此只剩：文本入口 → 走带 → 打轴 → 行列表 → 保存。
     ========================================================================== */
  editPane() {
    const timed = draft.lines.filter((l) => typeof l.time === "number").length;
    const stale = draftIsStale();
    const untimed = draft.lines.length - timed;
    const saveHint = stale
      ? `草稿属于《${songById(draft.songId)?.title || "上一首"}》`
      : untimed > 0 && timed > 0
        ? `还有 ${untimed} 行没有时间`
        : "";
    const tip = stale
      ? "已切歌，草稿仍属于上一首"
      : draft.kept > 0
        ? `已沿用 ${draft.kept} 行原有时间`
        : draft.dirty
          ? "未保存"
          : "";
    return html`
      <section class="lyricspanel__pane" data-pane="edit" ?hidden=${activeTab !== "edit"}>
        <div class="editor__source">
          <button
            class="btn btn--sm"
            type="button"
            data-act="editor-text-open"
            data-tip="粘贴 / 修改歌词文本"
            @click=${() => openDraftTextModal()}
          >
            ${icon("edit")}编辑歌词文本
          </button>
          <span class="lyricspanel__hint" data-editor-source>
            ${draft.lines.length ? `共 ${draft.lines.length} 行` : "还没有歌词文本"}
          </span>
          <span class="editor__spacer"></span>
          <button class="btn btn--sm" type="button" data-act="editor-clear-times" @click=${() => clearAllTimes()}>
            清空全部时间
          </button>
        </div>

        <div class="editor__transport">
          <button
            class="btn btn--icon"
            type="button"
            data-act="editor-play"
            data-tip="播放 / 暂停"
            @click=${() => togglePlayback()}
          >
            ${icon(state.playing ? "pause" : "play")}
          </button>
          <button
            class="btn btn--sm"
            type="button"
            data-act="editor-back"
            @click=${() => seek(Math.max(0, state.position - 5000))}
          >
            −5s
          </button>
          <button class="btn btn--sm" type="button" data-act="editor-fwd" @click=${() => seek(state.position + 5000)}>
            +5s
          </button>
          <span class="editor__clock" data-editor-clock>${formatLrcTime(state.position).slice(1, -1)}</span>
          <span class="editor__spacer"></span>
          <span class="lyricspanel__hint" data-editor-progress>已打轴 ${timed} / ${draft.lines.length}</span>
        </div>

        <button class="editor__tap" type="button" data-act="editor-tap" @click=${() => tapLine()}>
          <span class="editor__tap-main">打轴并下一行</span>
          <span class="editor__tap-hint"><kbd>空格</kbd> 或点这里</span>
        </button>

        <div class="editor__tools">
          <button class="btn btn--sm" type="button" data-act="editor-undo" @click=${() => undoDraft()}>撤销</button>
          <button class="btn btn--sm" type="button" data-act="editor-prev" @click=${() => moveCursor(-1)}>
            上一行
          </button>
          <button class="btn btn--sm" type="button" data-act="editor-next" @click=${() => moveCursor(1)}>
            下一行
          </button>
          <span class="lyricspanel__hint" data-editor-tip>${tip}</span>
        </div>

        <div class="editor__list" data-editor-list @scroll=${() => this.onFollowScroll()}>${this.draftList()}</div>

        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="editor-copy" @click=${() => this.copyLrc()}>
            复制 LRC
          </button>
          <span class="lyricspanel__hint" data-editor-save-hint>${saveHint}</span>
          <button class="btn btn--primary" type="button" data-act="editor-save" @click=${() => this.saveDraft()}>
            保存并应用
          </button>
        </div>
      </section>
    `;
  }

  draftList() {
    if (!draft.lines.length) {
      return html`<div class="editor__empty">还没有歌词文本。点上面的「编辑歌词文本」粘贴一份，或载入这首歌已有的歌词。</div>`;
    }
    return repeat(
      draft.lines,
      (_line, i) => i,
      (line, i) => {
        const isTimed = typeof line.time === "number";
        const cls = ["drow"];
        if (i === draft.cursor) cls.push("is-cursor");
        if (!isTimed) cls.push("is-untimed");
        if (i === this._nowIndex) cls.push("is-now");
        return html`
          <div class=${cls.join(" ")} data-act="editor-cursor" data-i=${i} @click=${() => setCursor(i)}>
            <span class="drow__no">${i + 1}</span>
            <button
              class="drow__time"
              type="button"
              data-act="edit-seek"
              data-i=${i}
              data-tip="跳到这一句"
              @click=${(e) => {
                e.stopPropagation();
                seekDraftLine(i);
              }}
            >
              ${isTimed ? formatLrcTime(line.time).slice(1, -1) : "未打轴"}
            </button>
            <span class="drow__text">${line.text}</span>
            <button
              class="drow__clear"
              type="button"
              data-act="edit-clear"
              data-i=${i}
              aria-label="清除这一行的时间"
              ?hidden=${!isTimed}
              @click=${(e) => {
                e.stopPropagation();
                clearLineTime(i);
              }}
            >
              ${icon("close")}
            </button>
          </div>
        `;
      }
    );
  }

  /* ------------------------------------------------------------------------
     事件
     ------------------------------------------------------------------------ */
  onClick(e) {
    const el = e.target.closest("[data-act], [data-tab]");
    if (!el || !this.contains(el)) return;
    const act = el.dataset.act;
    const i = Number(el.dataset.i);
    switch (act) {
      case "close":
        closePanel();
        return;
      case "nudge-seek":
        seek(Number(el.dataset.ms));
        return;
      case "editor-cursor":
        setCursor(i);
        return;
      case "editor-tap":
        tapLine();
        return;
      default:
        // 其余动作由模板里的 @click 直接绑定处理
        break;
    }
  }

  onInput(e) {
    const t = e.target;
    if (t.matches('[data-act="nudge-range"]')) {
      nudgeTo(Number(t.value));
    }
  }

  /**
   打轴时的空格处理。
   --------------------------------------------------------------------------
   空格在全局是「播放/暂停」（main.js 的快捷键）。打轴时它是「打轴并下一行」，
   必须抢在全局处理之前拦下来 —— 所以用捕获阶段，并且只在「焦点确实在面板里」
   且草稿行不为空时生效。
   */
  onPanelKeyDown(e) {
    if (!this.open || activeTab !== "edit") return;
    if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
    if (!this.contains(t)) return;
    e.preventDefault();
    e.stopPropagation();
    tapLine();
  }

  /** 记下「用户自己在滚」：给两块预览列表都挂上 */
  onFollowScroll() {
    // 平滑滚动会持续派发 scroll 事件；这些事件都是我们自己滚出来的，
    // 不能把它们当成「用户手动滚动」，否则之后 4 秒都不再跟随（列表就像卡住了）。
    if (Date.now() < this._followAutoUntil) return;
    this._followHold = Date.now() + 4000;
  }

  /**
   把某一行滚进容器可视区中部；用户刚滚过时不抢（force=true 时不看免打扰）。

   位置用 getBoundingClientRect 相对容器算：行与滚动容器之间隔着若干静态定位的
   祖先，直接用 row.offsetTop 会把容器上方所有内容的偏移也算进去（滚过头的元凶）。
   */
  followScroll(box, row, force = false) {
    if (!box || !row) return;
    if (!force && Date.now() < this._followHold) return;
    const boxRect = box.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const next = Math.max(0, box.scrollTop + (rowRect.top - boxRect.top) - (box.clientHeight - rowRect.height) / 2);
    if (Math.abs(box.scrollTop - next) < 2) return;
    // 覆盖平滑滚动的整个时长，避免它的尾帧被误判成「用户自己在滚」
    this._followAutoUntil = Date.now() + 700;
    box.scrollTo({ top: next, behavior: "smooth" });
  }

  /* ------------------------------------------------------------------------
     在线匹配
     ------------------------------------------------------------------------ */
  /**
   用当前曲目的「歌名 歌手」预填在线搜索框。
   迁移前的 online.js#openLyricsPanel 就是打开面板时填一次；三 tab 改造时丢了，
   结果每次搜歌词都要自己手打歌名（与「搜索」按钮并排的输入框一直是空的）。
   */
  prefillOnlineKeyword() {
    const song = currentTarget();
    if (!song) return;
    const next = [song.title, song.artist].filter(Boolean).join(" ").trim();
    if (!next || next === this._onlineKeyword) return;
    this._onlineKeyword = next;
    bumpLyricsPanelTick();
  }

  async refreshOnlineHint() {
    const service = await getBindings();
    if (!service) return;
    try {
      const res = await service.LyricsProviders?.();
      const list = Array.isArray(res?.providers) ? res.providers : [];
      if (list.length) {
        this._lastOnlineHint = "在线歌词来源：" + providerListLabel(list);
        bumpLyricsPanelTick();
      }
    } catch {
      /* 拿不到来源列表不影响搜索 */
    }
  }

  async searchLyrics() {
    const keyword = (this._onlineKeyword || "").trim();
    if (!keyword) {
      toast("请输入歌词搜索关键词", { duration: 1500 });
      return;
    }
    const service = await getBindings();
    if (!service) {
      // 候选区直接进入「搜索失败」状态：只弹一条 toast 的话，空状态还停在
      // 「还没有开始搜索」，用户会以为是自己的关键词没生效
      this._candidates = [];
      this._onlineError = "在线歌词服务不可用（需要应用后端）";
      this._searched = true;
      bumpLyricsPanelTick();
      return;
    }
    const song = currentTarget();
    this._searching = true;
    this._onlineError = "";
    bumpLyricsPanelTick();
    try {
      // keyword 是用户在输入框里写/改的搜索词；title/artist 是这首歌的元数据，
      // 一起传过去是为了让后端**按它们给候选打分排序**。
      const list = await service.SearchLyrics(
        keyword,
        song ? song.title : "",
        song ? song.artist : "",
        song ? song.duration : 0
      );
      this._candidates = Array.isArray(list) ? list : [];
    } catch (err) {
      this._candidates = [];
      this._onlineError = String(err?.message || err);
    } finally {
      // 无论成败都算「搜过了」：空状态要能区分「没搜」和「搜了没有」
      this._searching = false;
      this._searched = true;
      bumpLyricsPanelTick();
    }
  }

  async applyCandidate(index) {
    const candidate = this._candidates[index];
    if (!candidate) return;
    const song = currentTarget();
    if (!song) {
      toast("请先播放一首歌曲", { tone: "warning" });
      return;
    }
    const service = await getBindings();
    if (!service) {
      toast("在线歌词服务暂不可用，请稍后再试", { tone: "error" });
      return;
    }
    try {
      const res = await service.FetchLyrics(candidate.provider, candidate.id);
      if (!res || !res.lrc) {
        toast("没有取到歌词", { tone: "warning" });
        return;
      }
      // applyOnlineLyrics 内部会把歌词写进后端缓存（并按设置决定是否嵌入文件）
      const saved = await applyOnlineLyrics(song.id, res.lrc, res.source || "online", {
        embed: state.config.embedMeta === true,
      });
      setLyricsOffset(song.id, 0);
      draft.songId = ""; // 歌词换了，手动编辑里的草稿作废
      toast(saved?.note || "歌词已应用并保存", { tone: "success", duration: 2000 });
      bumpLyricsPanelTick();
    } catch (err) {
      toast("获取歌词失败：" + (err.message || err), { tone: "error" });
    }
  }

  /* ------------------------------------------------------------------------
     微调
     ------------------------------------------------------------------------ */
  async applyNudge() {
    const info = currentLyricsInfo();
    if (!info.songId) {
      toast("请先播放一首歌曲", { tone: "warning" });
      return;
    }
    const offset = lyricsOffsetOf(info.songId);
    if (!offset) {
      toast("当前没有需要应用的调整", { duration: 1800 });
      return;
    }
    if (!info.text) {
      toast("这首歌还没有歌词", { tone: "warning" });
      return;
    }
    const next = shiftLrc(info.text, offset);
    const saved = await applyOnlineLyrics(info.songId, next, "edit:offset", {
      embed: embedChoice(info, this),
    });
    if (saved === false) return;
    setLyricsOffset(info.songId, 0);
    bumpLyricsPanelTick();
    toast(saved?.note || "已应用并保存", { tone: "success", duration: 2600 });
  }

  /* ------------------------------------------------------------------------
     手动编辑
     ------------------------------------------------------------------------ */
  /** 换歌时重建草稿；同一首歌则保留（用户可能只是切了下 tab） */
  async ensureDraft(force = false) {
    const info = currentLyricsInfo();
    if (!force && draft.songId === info.songId && draft.lines.length) return;
    draft.songId = info.songId;
    draft.title = info.song?.title || "";
    draft.lines = info.text ? parseLyricDraft(info.text) : [];
    draft.cursor = 0;
    draft.undo = [];
    draft.dirty = false;
    draft.kept = 0;
    draft.stale = false;
    this._nowIndex = -1;
    this._lastScrolledNow = -1;
    this._lastScrolledCursor = -1;
    this._followHold = 0;
    this._followAutoUntil = 0;
    bumpLyricsPanelTick();
  }

  /**
   把「文本弹层里改完的歌词」并进草稿。
   --------------------------------------------------------------------------
   与旧版一样按位置合并旧时间（见 mergeDraftTimes）：用户往往只是改错别字，
   整批清掉时间再打一遍轴是不可接受的。
   */
  applyDraftText(text) {
    const parsed = parseLyricDraft(text || "");
    const merged = mergeDraftTimes(draft.lines, parsed);
    if (!merged.length) {
      toast("文本是空的，没有可应用的歌词", { duration: 1800 });
      return false;
    }
    // 「沿用了几行」要告诉用户：按位置补齐（改错别字）会把旧时间搬过来
    const kept = merged.filter(
      (l, i) => typeof l.time === "number" && !(parsed[i] && typeof parsed[i].time === "number")
    ).length;
    pushUndo();
    draft.lines = merged;
    if (draft.cursor >= merged.length) draft.cursor = Math.max(0, merged.length - 1);
    draft.dirty = true;
    draft.kept = kept;
    // 用户明确编了这首歌的文本：草稿归属回当前曲目
    if (!draft.songId) draft.songId = currentLyricsInfo().songId;
    this._nowIndex = -1;
    this._lastScrolledNow = -1;
    this._lastScrolledCursor = -1;
    bumpLyricsPanelTick();
    toast(kept ? `已应用文本，沿用了 ${kept} 行原有时间` : "已应用文本", { duration: 2000 });
    return true;
  }

  /** 草稿改了 → 文本弹层若开着，同步过去（撤销 / 清空时间都要反映到文本上） */
  setDraftText(next) {
    const ta = document.querySelector("#modal-backdrop [data-editor-text]");
    if (ta) ta.value = next;
    bumpLyricsPanelTick();
  }

  async saveDraft() {
    // 关键：保存目标是**草稿所属的那首歌**，不是「当前正在播的那首」。
    // 用户在编辑途中切了歌时，如果按当前曲目保存，就会把 A 的歌词写到 B 上 ——
    // 这是静默的数据损坏，比任何报错都糟。
    const info = currentLyricsInfo(draft.songId);
    if (!info.songId) {
      toast("还没有可保存的内容：先播放一首歌再编辑", { tone: "warning" });
      return;
    }
    const timed = draft.lines.filter((l) => typeof l.time === "number" && Number.isFinite(l.time));
    if (!timed.length) {
      toast("至少要先给一行打上时间", { tone: "warning" });
      return;
    }
    const untimed = draft.lines.length - timed.length;
    let unsorted = false;
    let prev = -Infinity;
    for (const l of draft.lines) {
      if (typeof l.time !== "number") continue;
      if (l.time < prev) {
        unsorted = true;
        break;
      }
      prev = l.time;
    }
    if (untimed || unsorted) {
      const body = html`
        ${
          untimed
            ? html`<div class="lyricspanel__hint">
                还有 <b>${untimed}</b> 行没有时间：LRC 里没有时间标签的行会被忽略，保存后这些行不会显示。
              </div>`
            : nothing
        }
        ${unsorted ? html`<div class="lyricspanel__hint">时间不是升序，播放时高亮可能会跳来跳去。</div>` : nothing}
      `;
      const ok = await confirmModal({
        title: untimed ? "还有歌词没有打轴" : "时间不是升序",
        body,
        okText: "继续保存",
        cancelText: "返回编辑",
      });
      if (!ok) return;
    }
    const lrc = serializeLrc(draft.lines);
    const saved = await applyOnlineLyrics(info.songId, lrc, "manual", { embed: embedChoice(info, this) });
    if (saved === false) return;
    setLyricsOffset(info.songId, 0);
    draft.undo = [];
    draft.dirty = false;
    draft.songId = info.songId;
    bumpLyricsPanelTick();
    toast(saved?.note || "歌词已保存", { tone: "success", duration: 2600 });
  }

  async copyLrc() {
    const lrc = serializeLrc(draft.lines);
    if (!lrc) {
      toast("还没有可复制的歌词", { duration: 1800 });
      return;
    }
    try {
      await navigator.clipboard.writeText(lrc);
      toast("LRC 已复制到剪贴板", { tone: "success" });
    } catch {
      // 没有剪贴板权限（少见）时的兜底
      const ta = document.createElement("textarea");
      ta.value = lrc;
      ta.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
      toast(ok ? "LRC 已复制到剪贴板" : "复制失败，请手动选中文本", { tone: ok ? "success" : "warning" });
    }
  }

  /**
   标出「当前播到哪一行」（与选中行是两回事：选中行是"正在打轴的那行"）。
   200ms 节流：这个高亮跟手到 60fps 没有任何意义，而每帧线性扫一遍上百行是白花的 CPU。
   */
  paintNowRow() {
    const now = performance.now();
    if (now - this._lastNowPaint < 200) return;
    this._lastNowPaint = now;
    let idx = -1;
    for (let i = 0; i < draft.lines.length; i += 1) {
      const t = draft.lines[i].time;
      if (typeof t === "number" && t <= state.position) idx = i;
    }
    if (idx === this._nowIndex) return;
    this._nowIndex = idx;
    bumpLyricsPanelTick();
  }

  /**
   手动编辑页每次重渲染后的「跟随」：先算当前播放行高亮，再把光标行 /
   当前播放行滚进可视区。滚动只在目标行发生变化时发生一次，所以每次
   重渲染都调用是安全的（也正是光标被点选后能立刻滚过去的原因）。
   */
  paintEditorFollow() {
    this.paintNowRow();
    this.scrollDraftRows();
  }

  /** 把「打轴光标行」与「当前播放行」滚进可视区（只在它们变化时滚一次） */
  scrollDraftRows() {
    const list = this.querySelector("[data-editor-list]");
    if (!list) return;
    // 光标是用户自己点出来的，必须滚过去（force=true 不受「用户刚滚过」的免打扰影响）
    if (draft.cursor !== this._lastScrolledCursor) {
      const row = list.querySelector(`[data-i="${draft.cursor}"]`);
      if (row) {
        this._lastScrolledCursor = draft.cursor;
        this.followScroll(list, row, true);
      }
    }
    if (this._nowIndex !== this._lastScrolledNow) {
      const row = list.querySelector(`[data-i="${this._nowIndex}"]`);
      if (row && this._nowIndex >= 0) {
        this._lastScrolledNow = this._nowIndex;
        this.followScroll(list, row);
      }
    }
  }
}

define("mp-lyrics-panel", MpLyricsPanel);

/* ==========================================================================
   模块级状态与动作（与迁移前 lyrics-panel.js 的 API 一致）
   ========================================================================== */
/** 非 store 的变更信号：歌词装载完成 / 草稿改动 / 候选刷新都靠它驱动组件更新 */
let lyricsPanelTick = 0;

function bumpLyricsPanelTick() {
  lyricsPanelTick += 1;
  // 歌词缓存 / 草稿 / 候选都是 store 之外的数据：显式广播一次，
  // 组件在 deps() 里读到这个版本号就会重绘（与迁移前的 subscribe(onTick) 等价）。
  requestAppUpdate();
}

const component = () => document.querySelector("mp-lyrics-panel");

/* --------------------------------------------------------------------------
   入口
   -------------------------------------------------------------------------- */
/** 打开歌词工作台；tab 可以指定（不传就沿用上次用的那个） */
export function openPanel(tab) {
  if (tab) activeTab = tab;
  state.lyricsOpen = true;
  // 注：壳层配色在详情页开合时已由 playerhost 同步（见 skinhost.applyChrome），
  // 这里不再需要"打开前投影一次"（那是 v2 的 --pv-* 机制）。
  bumpLyricsPanelTick();
  const el = component();
  if (el) {
    el._refreshHeader();
    // 打开时就把搜索词填成当前歌曲（迁移前行为）
    el.prefillOnlineKeyword();
    ensureLyricsLoaded().then(() => {
      if (activeTab === "edit") el.ensureDraft(true);
      if (activeTab === "online") el.refreshOnlineHint();
      bumpLyricsPanelTick();
    });
  }
}

export function closePanel() {
  state.lyricsOpen = false;
  // 关面板时丢掉未应用的微调：偏移是「临时修正」，面板关了就没人能看见它
  const info = currentLyricsInfo();
  if (info.songId && lyricsOffsetOf(info.songId)) {
    setLyricsOffset(info.songId, 0);
    toast("未应用的微调已丢弃", { duration: 1800 });
  }
  bumpLyricsPanelTick();
}

export function toggleLyricsPanel(tab) {
  if (state.lyricsOpen) closePanel();
  else openPanel(tab);
}

/* --------------------------------------------------------------------------
   纯函数与小组件
   -------------------------------------------------------------------------- */
function setTab(tab) {
  activeTab = tab === "nudge" || tab === "edit" ? tab : "online";
  const el = component();
  if (el) {
    if (activeTab === "edit") el.ensureDraft().then(() => bumpLyricsPanelTick());
    if (activeTab === "online") el.refreshOnlineHint?.();
  }
  bumpLyricsPanelTick();
}

/** 当前播放的曲目（在线试听曲目也算） */
function currentTarget() {
  return songById(state.currentId) || null;
}

/** 这首歌的扩展名（判断能不能写回歌词标签） */
function songExt(song) {
  return String(song?.ext || "")
    .replace(/^\./, "")
    .toLowerCase();
}

/** 这次保存要不要同时写进歌曲文件 */
function embedChoice(info, el) {
  const toggle = el?.querySelector("[data-embed-toggle]");
  const opt = el?.querySelector("[data-notice-opt]");
  const conflict = info.source === "embedded" || info.source === "lrc-file";
  if (conflict && opt && toggle) return Boolean(toggle.checked);
  // 没有冲突时尊重设置里的全局开关（embedMeta）
  return state.config.embedMeta === true;
}

/** 当前播放到第几行（-1 = 还没到第一句），语义与 findLyricIndex 一致 */
function activeLineIndex(lines, offset) {
  let idx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time + offset <= state.position) idx = i;
    else break;
  }
  return idx;
}

/* --------------------------------------------------------------------------
   微调
   --------------------------------------------------------------------------
   允许的偏移范围：恒定 ±10 秒。早先这里收紧成「最早一行不能被推到 0 之前」，
   结果**第一句就在 0:00 的歌根本不能往前调**（下限算出来是 0）——
   而那恰恰是最常需要往前调的情况（歌词整体比人声晚出来）。
   -------------------------------------------------------------------------- */
function nudgeBounds() {
  return { lower: -10000, upper: 10000 };
}

function nudgeBy(delta) {
  const info = currentLyricsInfo();
  if (!info.songId) {
    toast("请先播放一首歌曲", { tone: "warning" });
    return;
  }
  if (!info.text) {
    toast("这首歌还没有歌词，先去在线匹配或手动编辑", { tone: "warning", duration: 2600 });
    return;
  }
  const bounds = nudgeBounds();
  const next = Math.max(bounds.lower, Math.min(bounds.upper, lyricsOffsetOf(info.songId) + delta));
  setLyricsOffset(info.songId, next);
  bumpLyricsPanelTick();
}

function nudgeTo(ms) {
  const info = currentLyricsInfo();
  if (!info.songId || !info.text) return;
  const bounds = nudgeBounds();
  const next = Math.max(bounds.lower, Math.min(bounds.upper, Math.round(Number(ms) || 0)));
  setLyricsOffset(info.songId, next);
  bumpLyricsPanelTick();
}

function resetNudge() {
  const info = currentLyricsInfo();
  if (!info.songId) return;
  setLyricsOffset(info.songId, 0);
  bumpLyricsPanelTick();
}

/**
 微调说明面板。
 --------------------------------------------------------------------------
 「微调」这个概念本身不自明（提前 / 延后各是什么效果、什么时候该用它、
 会不会自动保存），但这些说明放在常驻界面上会把预览区挤到只剩一条缝。
 所以界面上只留一个「说明」按钮，内容全部收在这里。
 */
function openNudgeGuide() {
  const modal = openModal({
    title: "歌词微调：介绍与指引",
    body: html`
      <div class="lguide">
        <section class="lguide__sec">
          <h4 class="lguide__title">微调在改什么</h4>
          <p class="lguide__text">
            把整首歌的歌词时间轴一起平移，<b>不改歌词文字</b>。适合「整首歌都偏早或都偏晚」的情况：
            歌词来源的时间轴本来就不准，或者蓝牙 / 外放有明显的出声延迟。
          </p>
        </section>
        <section class="lguide__sec">
          <h4 class="lguide__title">怎么判断该往哪边调</h4>
          <p class="lguide__text">听副歌的第一句，看是歌词先出来还是人声先出来：</p>
          <div class="lguide__kv"><span class="lguide__k">歌词先出现</span><span>歌词快了 → 点「歌词快了 → 延后 0.5s」</span></div>
          <div class="lguide__kv"><span class="lguide__k">歌词后出现</span><span>歌词慢了 → 点「歌词慢了 → 提前 0.5s」</span></div>
        </section>
        <section class="lguide__sec">
          <h4 class="lguide__title">界面上的数字</h4>
          <div class="lguide__kv"><span class="lguide__k">+0.50 秒</span><span>整体延后，歌词出现得更晚</span></div>
          <div class="lguide__kv"><span class="lguide__k">−0.50 秒</span><span>整体提前，歌词出现得更早</span></div>
          <p class="lguide__text">
            6 个按钮是常用档位（±0.1 / ±0.5 / ±1.0 秒），下面是连续滑条，范围 ±10 秒。
            负偏移时靠近开头的那几行会被压到 0:00，界面会提示有几行受影响。
          </p>
        </section>
        <section class="lguide__sec">
          <h4 class="lguide__title">预览区怎么用</h4>
          <p class="lguide__text">
            高亮的那一行就是当前唱到的那句，它会跟着播放实时前进 —— 调整偏移后盯着它，
            就能看出歌词是变早了还是变晚了。点任意一行会跳到那一句，方便反复对比。
          </p>
        </section>
        <section class="lguide__sec">
          <h4 class="lguide__title">微调还是手动编辑</h4>
          <p class="lguide__text">
            只有少数几句对不上（某句没打轴、某句错位）用「手动编辑」逐行修正；
            整首歌统一偏移才用微调。两者都改不了「来源优先级」——
            如果这首歌的歌词来自内嵌歌词或同目录 .lrc，界面会提示要不要同时写入歌曲文件。
          </p>
        </section>
        <section class="lguide__sec">
          <h4 class="lguide__title">什么时候真的写进去</h4>
          <p class="lguide__text">
            点「应用到歌词」才会保存：先写歌词缓存，设置允许时同时写入歌曲文件。
            直接关掉面板会丢弃未应用的调整，歌词回到原样。
          </p>
        </section>
      </div>
    `,
    okText: "知道了",
  });
  // 说明面板只有「知道了」一个按钮，且内容可能超出屏幕高度，需要可滚动
  modal.root.classList.add("modal--wide", "modal--scroll", "modal--single");
}

/* --------------------------------------------------------------------------
   手动编辑
   -------------------------------------------------------------------------- */
function pushUndo() {
  draft.undo.push({ lines: draft.lines.map((l) => ({ ...l })), cursor: draft.cursor });
  if (draft.undo.length > 50) draft.undo.shift();
}

function undoDraft() {
  const prev = draft.undo.pop();
  if (!prev) {
    toast("没有可撤销的操作", { duration: 1500 });
    return;
  }
  draft.lines = prev.lines;
  draft.cursor = Math.min(prev.cursor, Math.max(0, prev.lines.length - 1));
  draft.dirty = true;
  // 撤销也要反映到文本框：否则「文本区」和「行列表」会各说各话
  component()?.setDraftText(draftTextOf());
  bumpLyricsPanelTick();
}

/** 草稿文本（撤销 / 打轴后回填文本框用） */
function draftTextOf() {
  return draft.lines.map((l) => (typeof l.time === "number" ? formatLrcTime(l.time) + l.text : l.text)).join("\n");
}

function moveCursor(delta) {
  if (!draft.lines.length) return;
  const next = Math.max(0, Math.min(draft.lines.length - 1, draft.cursor + delta));
  if (next === draft.cursor) return;
  draft.cursor = next;
  bumpLyricsPanelTick();
}

function setCursor(i) {
  if (!Number.isFinite(i) || i < 0 || i >= draft.lines.length || i === draft.cursor) return;
  draft.cursor = i;
  bumpLyricsPanelTick();
}

/** 打轴：把当前播放时间写进当前行，然后自动进入下一行 */
function tapLine() {
  if (!draft.lines.length) {
    toast("先点「编辑歌词文本」把歌词贴进来", { tone: "warning", duration: 2600 });
    return;
  }
  // 已经切歌了就别再打轴：此时的播放位置属于**另一首歌**，打进去必然全是错的
  if (draftIsStale()) {
    toast("已切歌：先决定这份草稿怎么办（保存它，或点「载入当前歌词」重来）", {
      tone: "warning",
      duration: 4200,
    });
    return;
  }
  const line = draft.lines[draft.cursor];
  if (!line) return;
  pushUndo();
  // 对齐到 10ms：输出是百分秒，取整后再存可以避免「界面显示 12.34、文本里却是 12.349」
  line.time = Math.round(state.position / 10) * 10;
  draft.dirty = true;
  if (draft.cursor < draft.lines.length - 1) draft.cursor += 1;
  component()?.setDraftText(draftTextOf());
  bumpLyricsPanelTick();
}

function clearLineTime(i) {
  const line = draft.lines[i];
  if (!line || typeof line.time !== "number") return;
  pushUndo();
  line.time = null;
  draft.dirty = true;
  component()?.setDraftText(draftTextOf());
  bumpLyricsPanelTick();
}

function clearAllTimes() {
  if (!draft.lines.length) return;
  pushUndo();
  draft.lines.forEach((l) => {
    l.time = null;
  });
  draft.cursor = 0;
  draft.dirty = true;
  component()?.setDraftText(draftTextOf());
  toast("已清空全部时间，可以重新打轴", { duration: 2000 });
  bumpLyricsPanelTick();
}

/**
 歌词文本弹层。
 --------------------------------------------------------------------------
 主编辑界面是给「打轴」用的（走带 + 空格 + 行列表），文本本身的粘贴 / 整批
 替换是一件事先做、做完就走的一次性动作，占着一块常驻文本框只会把行列表挤小。
 所以文本编辑搬到这里：改完点「应用文本」并回打轴列表（按位置沿用旧时间）。
 */
function openDraftTextModal() {
  const info = currentLyricsInfo();
  const initial = draft.lines.length ? draftTextOf() : info.text || "";
  const modal = openModal({
    title: "编辑歌词文本",
    desc: "一行一句，纯文本即可；已经打过轴的行会带上 [mm:ss.xx] 时间标签。改完点「应用文本」回到打轴列表。",
    body: html`
      <div class="lyricspanel__row lyricspanel__row--between">
        <span class="lyricspanel__hint">共 ${draft.lines.length} 行</span>
        <span class="lyricspanel__row-actions">
          <button
            class="btn btn--sm"
            type="button"
            data-act="modal-load"
            @click=${(e) => fillDraftTextarea(e, info.text || "")}
          >
            载入当前歌词
          </button>
          <button class="btn btn--sm" type="button" data-act="modal-clear" @click=${(e) => fillDraftTextarea(e, "")}>
            清空文本
          </button>
        </span>
      </div>
      <textarea
        class="editor__text editor__text--modal"
        data-editor-text
        spellcheck="false"
        placeholder="第一句&#10;第二句&#10;第三句&#10;…"
      ></textarea>
    `,
    okText: "应用文本",
    cancelText: "取消",
    onOk: (_values, root) => {
      const ta = root.querySelector("[data-editor-text]");
      return component()?.applyDraftText(ta ? ta.value : "") === false ? false : true;
    },
  });
  modal.root.classList.add("modal--wide", "modal--scroll");
  // openModal 会异步聚焦第一个输入控件（就是这块文本框），这里只负责灌初值
  const ta = modal.root.querySelector("[data-editor-text]");
  if (ta) ta.value = initial;
}

/** 弹层里「载入当前歌词 / 清空文本」：只改文本框，点「应用文本」才落到草稿 */
function fillDraftTextarea(e, text) {
  const root = e.target.closest(".modal");
  const ta = root?.querySelector("[data-editor-text]");
  if (!ta) return;
  ta.value = text;
  ta.focus();
}

function seekDraftLine(i) {
  const line = draft.lines[i];
  if (!line) return;
  // 未打轴的行：跳到上一行的位置（比「什么都不做」有用）
  let ms = line.time;
  if (typeof ms !== "number") {
    for (let k = i - 1; k >= 0; k -= 1) {
      if (typeof draft.lines[k].time === "number") {
        ms = draft.lines[k].time;
        break;
      }
    }
  }
  if (typeof ms !== "number") {
    toast("这一行还没有时间，无法跳转", { duration: 1600 });
    return;
  }
  seek(ms);
  setCursor(i);
}

/** 草稿是不是属于「上一首」了（编辑途中切了歌） */
function draftIsStale() {
  return Boolean(draft.songId) && currentLyricsInfo().songId !== draft.songId && draftHasTimes();
}

function draftHasTimes() {
  return draft.lines.some((l) => typeof l.time === "number");
}

function togglePlayback() {
  togglePlay();
}

/** 两选一确认框（返回 true = 用户点了确认） */
function confirmModal({ title, body, okText, cancelText }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    openModal({
      title,
      body,
      okText,
      cancelText,
      onOk: () => {
        done(true);
        return true;
      },
      // 取消（点按钮 / Esc / 点背景）都算「不保存」
      onCancel: () => {
        done(false);
        return true;
      },
    });
  });
}

export { activeTab, draft };
export const _internals = { activeLineIndex, nudgeBounds };
