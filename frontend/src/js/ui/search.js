/* ==========================================================================
   ui/search.js — 搜索弹层（在线歌曲搜索）
   --------------------------------------------------------------------------
   交互（按需求逐条实现）：
     1. 点标题栏的搜索图标（或 Ctrl+F）→ 打开**搜索弹层**；
     2. 搜索框就在弹层顶部，打开时光标自动聚焦；
     3. 输入关键词按回车 → 在同一个弹层里显示结果；
     4. 搜索框右侧有清空按钮，点它 → 输入与结果一起清空；
     5. 没有点清空之前，结果不会被销毁 —— 关掉弹层再打开还是上次的结果。

   迁移点：
     · 弹层外壳以前是 buildOverlay() 里的一次性 innerHTML + 一堆
       addEventListener；现在事件是模板绑定，结果区是 keyed repeat；
     · 「输入时只更新清空按钮的可见性」这条约束不再需要 —— 输入框的 value
       由组件持有（.value 绑定 + input 事件回写），重渲染不会重建输入框，
       焦点与输入法状态天然不丢。
   ========================================================================== */

import { MpElement, define, html, nothing, repeat, requestAppUpdate, icon } from "./base.js";
import { toast } from "./overlays.js";
import { backend, isWails } from "../bridge.js";
import { playContext, registerOnlineSong, state } from "../store.js";
import { commit } from "../store.js";
import { fmtCount, fmtTime } from "../utils.js";

/* --------------------------------------------------------------------------
   搜索历史（localStorage 持久化，可单条删除 / 一键清空）
   -------------------------------------------------------------------------- */
const HISTORY_KEY = "music-player.search.history.v1";
const HISTORY_MAX = 20;

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string" && x.trim()) : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {
    /* 隐私模式等情况下写不进去就静默失败 */
  }
}

/** 弹层内部状态（不是应用状态：关掉弹层也不需要保留到下次启动） */
const searchState = {
  keyword: "",
  /** 在线搜索的请求序号：晚发出的请求回来得早时会覆盖新结果，必须丢弃 */
  seq: 0,
  results: [],
  query: "",
  loading: false,
  message: "",
  rev: 0,
};

function bump() {
  searchState.rev += 1;
  // 关键词 / 候选 / 历史都在模块级状态里：广播一次让组件重绘
  requestAppUpdate();
}

class MpSearchOverlay extends MpElement {
  static deps = (s) => [s.searchOpen, searchState.rev];

  get panelEl() {
    return this.querySelector("#search-overlay");
  }

  updated() {
    const el = this.panelEl;
    if (!el) return;
    if (state.searchOpen) {
      if (this._closeTimer) {
        clearTimeout(this._closeTimer);
        this._closeTimer = null;
      }
      if (el.hidden) {
        el.hidden = false;
        el.dataset.state = "";
        requestAnimationFrame(() => {
          if (state.searchOpen) el.dataset.state = "opened";
        });
        // 光标自动聚焦到搜索框
        requestAnimationFrame(() => {
          const input = this.querySelector("#search-input");
          input?.focus();
          input?.select();
        });
      }
      return;
    }
    if (!el.hidden) {
      el.dataset.state = "closed";
      if (!this._closeTimer) {
        this._closeTimer = setTimeout(() => {
          this._closeTimer = null;
          if (!state.searchOpen && el) el.hidden = true;
        }, 220 + 40);
      }
    }
  }

  disconnectedCallback() {
    if (this._closeTimer) clearTimeout(this._closeTimer);
    super.disconnectedCallback();
  }

  render() {
    const s = searchState;
    const history = loadHistory();
    const hasText = Boolean(s.keyword.trim());
    return html`
      <section
        class="search-overlay"
        id="search-overlay"
        data-state="closed"
        hidden
        aria-label="搜索"
        @click=${(e) => this.onClick(e)}
        @keydown=${(e) => this.onKey(e)}
      >
        <div class="search-overlay__panel" role="dialog" aria-modal="true" aria-label="搜索">
          <div class="search-overlay__search">
            <div class="search-overlay__field">
              ${icon("search", "search-overlay__search-icon")}
              <input
                class="search-overlay__input"
                id="search-input"
                type="text"
                placeholder="输入关键词后按回车搜索"
                autocomplete="off"
                spellcheck="false"
                aria-label="搜索关键词"
                .value=${s.keyword}
                @input=${(e) => {
                  searchState.keyword = e.target.value;
                  bump();
                }}
                @keydown=${(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    this.submitSearch();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    // Esc 的语义是「先清输入，再关层」
                    if (searchState.keyword.trim()) this.clearSearch({ focus: true });
                    else closeOverlay();
                  }
                }}
              />
              <button
                class="search-overlay__clear"
                id="search-clear"
                type="button"
                data-tip="清空搜索"
                aria-label="清空搜索"
                ?hidden=${!hasText}
                @click=${() => this.clearSearch({ focus: true })}
              >
                ${icon("close")}
              </button>
            </div>
            <button
              class="search-overlay__close"
              type="button"
              data-search-close
              data-tip="关闭（结果会保留）"
              aria-label="关闭搜索"
              @click=${() => closeOverlay()}
            >
              ${icon("close")}
            </button>
          </div>

          <div class="search-overlay__history" id="search-history" ?hidden=${hasText || !history.length}>
            ${
              !hasText && history.length
                ? html`
                    <div class="search-overlay__history-title">
                      <span>搜索历史</span>
                      <button
                        type="button"
                        class="search-overlay__history-clear"
                        data-history-act="clear"
                        @click=${() => this.clearHistory()}
                      >
                        清空
                      </button>
                    </div>
                    <div class="search-overlay__history-list">
                      ${history.map(
                        (k) => html`
                          <span class="search-overlay__history-chip" data-history-keyword=${k}>
                            <button
                              type="button"
                              class="search-overlay__history-key"
                              data-history-act="use"
                              @click=${() => this.useHistory(k)}
                            >
                              ${k}
                            </button>
                            <button
                              type="button"
                              class="search-overlay__history-del"
                              data-history-act="del"
                              aria-label="删除「${k}」"
                              @click=${() => this.removeHistory(k)}
                            >
                              ${icon("close")}
                            </button>
                          </span>
                        `
                      )}
                    </div>
                  `
                : nothing
            }
          </div>

          <div class="search-overlay__head">
            <span class="search-overlay__headline" id="search-headline">${this.headline()}</span>
          </div>
          <div class="search-overlay__body" id="search-body">${this.bodyContent()}</div>
        </div>
      </section>
    `;
  }

  headline() {
    const s = searchState;
    if (s.loading) return "搜索中…";
    return s.query ? `在线「${s.query}」${fmtCount(s.results.length)} 个结果` : "";
  }

  bodyContent() {
    const s = searchState;
    if (s.loading) {
      return html`<div class="search-overlay__loading">
        <span class="search-overlay__spinner"></span>正在搜索「${s.keyword.trim()}」…
      </div>`;
    }
    if (s.message) return this.empty(s.message);
    if (!s.results.length) {
      return this.empty(s.query ? "没有搜到在线歌曲，换个关键词试试" : "输入关键词后按回车搜索在线歌曲");
    }
    return repeat(
      s.results,
      (song) => song.id,
      (song) => html`
        <div
          class="search-row"
          data-search-id=${song.id}
          data-search-online="1"
          role="button"
          tabindex="0"
          @click=${() => previewOnline(song.id)}
        >
          <span class="search-row__cover">
            ${
              song.coverUrl
                ? html`<img src=${song.coverUrl} alt="" loading="lazy" />`
                : html`<span class="search-row__cover-fallback">${icon("music")}</span>`
            }
          </span>
          <span class="search-row__main">
            <span class="search-row__title">${song.title || "未命名"}</span>
            <span class="search-row__sub">${song.artist || "未知"} · ${fmtTime(song.duration)}</span>
          </span>
          <span class="search-row__actions">
            <button
              class="btn btn--sm btn--primary"
              type="button"
              data-search-act="preview"
              data-id=${song.id}
              @click=${(e) => {
                e.stopPropagation();
                previewOnline(song.id);
              }}
            >
              ${icon("play")}<span>试听</span>
            </button>
            <button
              class="btn btn--sm"
              type="button"
              data-search-act="download"
              data-id=${song.id}
              @click=${(e) => {
                e.stopPropagation();
                downloadOnline(song);
              }}
            >
              ${icon("file")}<span>下载</span>
            </button>
          </span>
        </div>
      `
    );
  }

  empty(text) {
    return html`<div class="search-overlay__empty">${icon("search")}<span>${text}</span></div>`;
  }

  /* ------------------------------------------------------------------------
     交互
     ------------------------------------------------------------------------ */
  onClick(e) {
    if (e.target.closest("[data-search-close]") || e.target === this.panelEl) closeOverlay();
  }

  onKey(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest?.("[data-search-id]");
    if (!row) return;
    e.preventDefault();
    previewOnline(row.dataset.searchId);
  }

  /* —— 历史 —— */
  addHistory(keyword) {
    const k = (keyword || "").trim();
    if (!k) return;
    const list = loadHistory().filter((x) => x !== k);
    list.unshift(k);
    saveHistory(list);
    bump();
  }

  removeHistory(keyword) {
    saveHistory(loadHistory().filter((x) => x !== keyword));
    bump();
  }

  clearHistory() {
    saveHistory([]);
    bump();
  }

  useHistory(keyword) {
    searchState.keyword = keyword;
    bump();
    this.submitSearch();
  }

  /* —— 搜索 —— */
  submitSearch() {
    const keyword = (searchState.keyword || "").trim();
    if (!keyword) {
      // 空关键词按回车 = 清空结果
      this.clearSearch({ focus: true });
      return;
    }
    this.addHistory(keyword);
    this.runOnlineSearch(keyword);
  }

  /** 清空：输入框与结果一起清掉 */
  clearSearch({ focus = false } = {}) {
    searchState.keyword = "";
    searchState.results = [];
    searchState.query = "";
    searchState.message = "";
    searchState.loading = false;
    searchState.seq += 1; // 作废进行中的请求
    bump();
    if (focus) requestAnimationFrame(() => this.querySelector("#search-input")?.focus());
  }

  async runOnlineSearch(keyword) {
    searchState.query = "";
    searchState.results = [];
    searchState.message = "";
    searchState.loading = true;
    bump();

    const seq = ++searchState.seq;
    if (!isWails()) {
      searchState.loading = false;
      searchState.message = "浏览器预览下没有在线搜索后端，请在应用里试";
      bump();
      return;
    }

    try {
      const list = await backend.onlineSearch(keyword, 1, 24);
      if (seq !== searchState.seq) return; // 期间又搜了别的关键词
      searchState.results = Array.isArray(list) ? list : [];
      searchState.query = keyword;
      searchState.loading = false;
      bump();
    } catch (err) {
      if (seq !== searchState.seq) return;
      searchState.results = [];
      searchState.query = keyword;
      searchState.loading = false;
      searchState.message = `在线搜索失败：${err?.message ?? err}`;
      bump();
    }
  }
}

define("mp-search-overlay", MpSearchOverlay);

/* ==========================================================================
   对外命令（与迁移前 searchpanel.js 的 API 一致）
   ========================================================================== */
export function toggleSearchBox(force) {
  const open = typeof force === "boolean" ? force : !state.searchOpen;
  if (open) openOverlay();
  else closeOverlay();
}

export function openOverlay() {
  state.searchOpen = true;
  commit();
}

/** 关闭只是隐藏，不清空结果 —— 下次搜索直接复用 */
export function closeOverlay() {
  state.searchOpen = false;
  commit();
}

/** 兼容入口：标题栏按钮已由 <mp-titlebar> 渲染，这里只负责全局快捷键 */
export function initSearchPanel() {
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
    e.preventDefault();
    openOverlay();
  });
}

export function buildTitlebarSearch() {}

/* --------------------------------------------------------------------------
   在线搜索结果的行内动作
   -------------------------------------------------------------------------- */

/**
 * 试听在线歌曲。
 *
 * 关键需求：**只加入播放列表，不进入「本地歌曲」**。
 * 「本地歌曲」= 本地曲库（state.songs），这里把在线曲目登记到
 * state.onlineSongs 并把 id 追加到队列尾部，songs 完全不动。
 */
function previewOnline(songId) {
  const song = searchState.results.find((s) => s.id === songId);
  if (!song) return;
  const online = registerOnlineSong({
    id: song.id,
    title: song.title || "未命名",
    artist: song.artist || "未知",
    album: song.album || "在线",
    ext: song.ext || "m4a",
    duration: song.duration || 0,
    size: 0,
    sampleRate: 0,
    bitrate: 0,
    addedAt: Date.now(),
    playCount: 0,
    path: "",
    cover: "",
    coverUrl: song.coverUrl || "",
    streamUrl: song.streamUrl || "",
    downloadUrl: song.downloadUrl || "",
    bvid: song.bvid || "",
    online: true,
  });

  // 队列里已有同一首就不重复追加，只把它切为当前播放
  const queue = state.queue.includes(online.id) ? state.queue.slice() : [...state.queue, online.id];
  const at = queue.indexOf(online.id);
  playContext(queue, at, { type: "online", id: null });
  toast(`已加入播放列表并开始试听：${online.title}`, { tone: "success", duration: 2200 });
}

async function downloadOnline(song) {
  if (!isWails()) {
    toast("浏览器预览无法下载", { tone: "warning" });
    return;
  }
  try {
    const res = await backend.downloadStart(
      song.bvid || String(song.id).replace(/^bili:/, ""),
      song.title || "",
      song.duration || 0
    );
    if (!res?.started) {
      toast(res?.reason === "already-running" ? "这首歌正在下载中" : "无法开始下载", { tone: "warning" });
      return;
    }
    toast(`开始下载到 ${res.dir}`, { duration: 2600 });
  } catch (err) {
    toast(`下载失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
  }
}

export { searchState };
