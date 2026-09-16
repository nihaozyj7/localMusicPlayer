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
import { seek, songById, state, togglePlay } from "../store.js";
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
import { formatLrcTime, mergeDraftTimes, parseLyricDraft, serializeLrc, shiftLrc } from "@localmusicplayer/player-skins";

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
  static deps = (s) => [
    s.lyricsOpen,
    s.currentId,
    s.position,
    s.playing,
    activeTab,
    lyricsPanelTick,
    state.config.embedMeta,
  ];

  constructor() {
    super();
    this._draftText = "";
    this._pendingText = null;
    this._nowIndex = -1;
    this._onlineMessage = "";
    this._candidates = [];
    this._searching = false;
    this._onlineKeyword = "";
    this._draftTimer = null;
    this._lastNowPaint = 0;
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
  }

  onDisconnected() {
    document.removeEventListener("keydown", this._onKeyDownCapture, true);
    if (this._draftTimer) clearTimeout(this._draftTimer);
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
    el.hidden = !this.open;
    el.dataset.open = this.open ? "true" : "false";

    // 文本框写入：只在「确实需要换文本」时写一次，避免每次重渲染重置插入符
    if (this._pendingText !== null) {
      const ta = this.querySelector("[data-editor-text]");
      if (ta) ta.value = this._pendingText;
      this._pendingText = null;
    }

    if (!this.open) return;
    if (activeTab === "nudge") this.paintNudgeFollow();
    if (activeTab === "edit") this.paintEditorFollow();
  }

  refreshAll() {
    this._refreshHeader();
    ensureLyricsLoaded().then(() => {
      this._refreshHeader();
      if (activeTab === "online") this.refreshOnlineHint();
      if (activeTab === "edit") this.ensureDraft().then(() => this.forceUpdate());
    });
  }

  _refreshHeader() {
    // 头部信息直接读 currentLyricsInfo()，模板表达式里用得到；
    // 这里只需要触发一次重绘（歌词装载完成是 store 之外的变化）
    bumpLyricsPanelTick();
  }

  render() {
    const info = currentLyricsInfo();
    const song = info.song;
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
                ${lyricsSourceLabel(info.source)}
              </span>
              <span class="lyricspanel__artist" data-song-artist>${song ? song.artist || "" : ""}</span>
            </div>
          </div>
          <button
            class="lyricspanel__close"
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
          />
          <button class="btn btn--primary" type="button" data-act="lyrics-search" @click=${() => this.searchLyrics()}>
            搜索
          </button>
        </div>
        <div class="lyricspanel__hint" data-online-hint>${this._lastOnlineHint}</div>
        <div class="lyricspanel__list" data-online-results>
          ${
            this._searching
              ? "搜索中…"
              : this._onlineMessage
                ? this._onlineMessage
                : this._candidates.length
                  ? repeat(
                      this._candidates,
                      (c, i) => `${c.provider || ""}-${c.id || i}`,
                      (c, i) => html`
                        <div class="candidate">
                          <div class="candidate__main">
                            <div class="candidate__title">
                              ${(c.title || "未命名") + " - " + (c.artist || "未知")}
                            </div>
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
                    )
                  : "搜索结果会显示在这里，点击「使用」应用歌词"
          }
        </div>
      </section>
    `;
  }

  /* ==========================================================================
     ② 微调（整体时间轴偏移）
     ========================================================================== */
  nudgePane(info) {
    const offset = info.songId ? lyricsOffsetOf(info.songId) : 0;
    const clamped = offset < 0 ? info.lines.filter((l) => l.time + offset < 0).length : 0;
    const bounds = { lower: -10000, upper: 10000 };
    return html`
      <section class="lyricspanel__pane" data-pane="nudge" ?hidden=${activeTab !== "nudge"}>
        <div class="nudge__readout">
          <span class="lyricspanel__hint">当前偏移</span>
          <b class="nudge__value" data-nudge-value>${(offset > 0 ? "+" : "") + (offset / 1000).toFixed(2)} 秒</b>
          <span class="nudge__dirty" data-nudge-dirty ?hidden=${offset === 0}>● 未应用</span>
          <span class="lyricspanel__hint" data-nudge-clamp ?hidden=${clamped === 0}>
            ${clamped ? `有 ${clamped} 行会被压到 0:00（已经不能再往前）` : ""}
          </span>
        </div>
        <div class="nudge__block">
          <div class="lyricspanel__hint">听感校准：一边听一边点，改的是歌词出现的时间</div>
          <div class="nudge__feel">
            <button class="btn" type="button" data-act="nudge-feel" data-delta="500" @click=${() => nudgeBy(500)}>
              歌词比声音<b>快</b>（出现太早）→ 整体延后 0.5s
            </button>
            <button class="btn" type="button" data-act="nudge-feel" data-delta="-500" @click=${() => nudgeBy(-500)}>
              歌词比声音<b>慢</b>（出现太晚）→ 整体提前 0.5s
            </button>
          </div>
        </div>
        <div class="nudge__block">
          <div class="lyricspanel__hint">精细调整（50ms 一档）</div>
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
        <div class="nudge__block nudge__block--grow">
          <div class="lyricspanel__hint">预览（点一行会跳到那一句）</div>
          <div class="lyricspanel__list" data-nudge-preview @scroll=${() => this.onFollowScroll()}>
            ${this.nudgePreview(info, offset)}
          </div>
        </div>
        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="nudge-reset" @click=${() => resetNudge()}>
            ${nothing}重置
          </button>
          <span class="lyricspanel__hint">微调不会自动保存</span>
          <button class="btn btn--primary" type="button" data-act="nudge-apply" @click=${() => this.applyNudge()}>
            应用到歌词
          </button>
        </div>
      </section>
    `;
  }

  /**
   预览窗口：当前行附近 ±5 行，给的是上下文而不是整首（整首在详情页里就能看）。
   窗口以当前行为中心，所以每次重建后当前行都落在中间 —— 行号推进一行，
   列表看起来就是「往上滚一行」，这正是预览该有的观感。
   */
  nudgePreview(info, offset) {
    if (!info.text) {
      return "这首歌还没有歌词。可以先用「在线匹配」找一份，或者切到「手动编辑」自己贴一份。";
    }
    const lines = info.lines;
    const active = activeLineIndex(lines, offset);
    const from = Math.max(0, active - 5);
    const to = Math.min(lines.length, active + 6);
    const rows = [];
    for (let i = from; i < to; i += 1) {
      const line = lines[i];
      const t = Math.max(0, line.time + offset);
      rows.push(html`
        <div
          class="nudge__line${i === active ? " is-active" : ""}"
          data-act="nudge-seek"
          data-ms=${t}
          @click=${() => seek(t)}
        >
          <span class="nudge__time">${formatLrcTime(line.time + offset).slice(1, -1)}</span>
          <span class="nudge__text">${line.text}</span>
        </div>
      `);
    }
    return rows;
  }

  /**
   微调预览跟随播放。
   以前这块只在重建时画一次，预览里的高亮永远停在打开面板那一刻。
   */
  paintNudgeFollow() {
    if (activeTab !== "nudge") return;
    const box = this.querySelector("[data-nudge-preview]");
    if (!box) return;
    const info = currentLyricsInfo();
    if (!info.lines.length) return;
    const offset = info.songId ? lyricsOffsetOf(info.songId) : 0;
    const active = activeLineIndex(info.lines, offset);
    const rows = box.querySelectorAll(".nudge__line");
    if (!rows.length) return;
    // 行号跑出当前窗口 → 组件整体重绘（render 会重算窗口，当前行仍居中）
    const firstIdx = Number(rows[0].dataset.index ?? -1);
    if (firstIdx < 0) return;
    if (active < firstIdx || active >= firstIdx + rows.length) {
      bumpLyricsPanelTick();
      return;
    }
    const at = active - firstIdx;
    rows.forEach((row, i) => row.classList.toggle("is-active", i === at));
    this.followScroll(box, rows[at]);
  }

  /* ==========================================================================
     ③ 手动编辑（贴歌词 → 打轴 → 保存）
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
          <div class="lyricspanel__row lyricspanel__row--between">
            <span class="lyricspanel__hint">歌词文本：粘贴纯文本即可（带时间标签也能识别）</span>
            <span class="lyricspanel__row-actions">
              <button class="btn btn--sm" type="button" data-act="editor-load" @click=${() => loadCurrentLyrics()}>
                载入当前歌词
              </button>
              <button class="btn btn--sm" type="button" data-act="editor-clear-times" @click=${() => clearAllTimes()}>
                清空全部时间
              </button>
              <button class="btn btn--sm" type="button" data-act="editor-clear" @click=${() => clearDraftText()}>
                清空文本
              </button>
            </span>
          </div>
          <textarea
            class="editor__text"
            data-editor-text
            spellcheck="false"
            placeholder="第一句&#10;第二句&#10;第三句&#10;…&#10;&#10;粘好之后点下面的「打轴并下一行」，一边听一边按空格"
            @input=${() => this.scheduleDraftSettle()}
          ></textarea>
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
      return html`<div class="editor__empty">还没有歌词文本。把歌词粘到上面的文本框里，或点「载入当前歌词」。</div>`;
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
    if (t.matches("[data-editor-text]")) {
      this.scheduleDraftSettle();
      return;
    }
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
      toast("在线歌词服务暂不可用，请稍后再试", { tone: "error" });
      return;
    }
    const song = currentTarget();
    this._searching = true;
    this._onlineMessage = "";
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
      this._onlineMessage = this._candidates.length ? "" : "没有找到候选歌词";
    } catch (err) {
      this._candidates = [];
      this._onlineMessage = "搜索失败：" + (err.message || err);
    } finally {
      this._searching = false;
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
    this._pendingText = info.text || "";
    bumpLyricsPanelTick();
  }

  /** 文本框改动 → 300ms 去抖后重新建行 */
  scheduleDraftSettle() {
    if (this._draftTimer) clearTimeout(this._draftTimer);
    this._draftTimer = setTimeout(() => {
      this._draftTimer = null;
      this.syncDraftFromText();
    }, 300);
  }

  syncDraftFromText() {
    const ta = this.querySelector("[data-editor-text]");
    if (!ta) return;
    const parsed = parseLyricDraft(ta.value);
    const merged = mergeDraftTimes(draft.lines, parsed);
    // 「沿用了几行」要告诉用户：按位置补齐（改错别字）会把旧时间搬过来
    const kept = merged.filter(
      (l, i) => typeof l.time === "number" && !(parsed[i] && typeof parsed[i].time === "number")
    ).length;
    pushUndo();
    draft.lines = merged;
    if (draft.cursor >= merged.length) draft.cursor = Math.max(0, merged.length - 1);
    draft.dirty = true;
    draft.kept = kept;
    bumpLyricsPanelTick();
  }

  /** 草稿文本：保留未打轴的行（serializeLrc 会把它们丢掉，那是对外格式） */
  serializeDraftText() {
    return draft.lines.map((l) => (typeof l.time === "number" ? formatLrcTime(l.time) + l.text : l.text)).join("\n");
  }

  setDraftText(next) {
    this._pendingText = next;
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
  bumpLyricsPanelTick();
  const el = component();
  if (el) {
    el._refreshHeader();
    // 打开时就把搜索词填成当前歌曲（迁移前行为）
    el.prefillOnlineKeyword();
    ensureLyricsLoaded().then(() => {
      el._pendingText = currentLyricsInfo().text || "";
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

export function isLyricsPanelOpen() {
  return state.lyricsOpen === true;
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
    toast("先把歌词粘到上面的文本框里", { tone: "warning", duration: 2200 });
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

function loadCurrentLyrics() {
  const info = currentLyricsInfo();
  if (!info.text) {
    toast("这首歌还没有歌词可载入", { duration: 2000 });
    return;
  }
  pushUndo();
  draft.lines = parseLyricDraft(info.text);
  draft.cursor = 0;
  draft.dirty = true;
  // 归属改成当前这首歌：用户点它就是在说「我要编辑的是这一首」
  draft.songId = info.songId;
  draft.title = info.song?.title || "";
  component()?.setDraftText(info.text);
  toast("已载入当前歌词，可以逐行修正时间", { duration: 2200 });
  bumpLyricsPanelTick();
}

function clearDraftText() {
  pushUndo();
  draft.lines = [];
  draft.cursor = 0;
  draft.dirty = true;
  component()?.setDraftText("");
  bumpLyricsPanelTick();
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
