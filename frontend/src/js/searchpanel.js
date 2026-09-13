/* ==========================================================================
   searchpanel.js — 搜索弹层（搜索框在弹层里）
   --------------------------------------------------------------------------
   交互（按需求逐条实现）：
     1. 点标题栏的搜索图标（或 Ctrl+F）→ 打开**搜索弹层**；
     2. 搜索框就在弹层顶部，打开时光标自动聚焦；
     3. 输入关键词按回车 → 在同一个弹层里显示结果；
     4. 搜索框右侧有清空按钮，点它 → 输入与结果一起清空；
     5. 没有点清空之前，结果不会被销毁 —— 关掉弹层再打开还是上次的结果
        （DOM 与已加载的封面都不重建）。

   为什么结果要「复用」而不是每次重建：
     在线搜索每次都要打第三方接口、每张封面都要过一次本地代理，
     关掉再打开就全部重来既慢又浪费。这里把弹层实例挂在模块级变量上，
     只换里面的结果区内容。

   历史：早期版本把搜索框放在标题栏、结果放在另一个浮层里，两个东西
   分处两地，用户要先点图标、再点输入框，还容易和窗口按钮抢位置。
   现在合成一个弹层。

   两种结果（弹层里的标签页）：
     · 在线歌曲：调 OnlineService.Search，可试听（加入播放列表）或下载；
     · 本地曲库：对本地曲库做关键词匹配，点一下就地起播。
   ========================================================================== */

import { $, bindCoverFallback, icon, toast } from "./dom.js";
import { backend, isWails } from "./bridge.js";
import { playContext, registerOnlineSong, state } from "./store.js";
import { esc, fmtCount, fmtTime } from "./utils.js";

/* --------------------------------------------------------------------------
   模块状态（弹层实例只创建一次）
   -------------------------------------------------------------------------- */
let built = false;
let overlay = null;
let input = null;
let clearBtn = null;
let body = null;
let headline = null;

/** 在线搜索的请求序号：晚发出的请求回来得早时会覆盖新结果，必须丢弃 */
let searchSeq = 0;
/** 当前展示的在线结果 */
let onlineResults = [];
/** 已完成的在线搜索关键词（用于复用结果，不重复打接口） */
let onlineQuery = "";

/* --------------------------------------------------------------------------
   搜索历史（localStorage 持久化，可单条删除 / 一键清空）
   -------------------------------------------------------------------------- */
const HISTORY_KEY = "music-player.search.history.v1";
const HISTORY_MAX = 20;
let historyEl = null;

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

function addHistory(keyword) {
  const k = (keyword || "").trim();
  if (!k) return;
  const list = loadHistory().filter((x) => x !== k);
  list.unshift(k);
  saveHistory(list);
  renderHistory();
}

function removeHistory(keyword) {
  const list = loadHistory().filter((x) => x !== keyword);
  saveHistory(list);
  renderHistory();
}

function clearHistory() {
  saveHistory([]);
  renderHistory();
}

function renderHistory() {
  if (!historyEl) return;
  const list = loadHistory();
  if (!list.length) {
    historyEl.hidden = true;
    historyEl.innerHTML = "";
    return;
  }
  historyEl.hidden = false;
  historyEl.innerHTML = `
    <div class="search-overlay__history-title">
      <span>搜索历史</span>
      <button type="button" class="search-overlay__history-clear" data-history-act="clear">清空</button>
    </div>
    <div class="search-overlay__history-list">
      ${list
        .map(
          (k) => `
        <span class="search-overlay__history-chip" data-history-keyword="${esc(k)}">
          <button type="button" class="search-overlay__history-key" data-history-act="use">${esc(k)}</button>
          <button type="button" class="search-overlay__history-del" data-history-act="del" aria-label="删除「${esc(k)}」">${icon("close")}</button>
        </span>`
        )
        .join("")}
    </div>`;
}

function updateHistoryVisibility() {
  const hasText = Boolean((input?.value || "").trim());
  if (hasText && historyEl) historyEl.hidden = true;
  else renderHistory();
}

/* --------------------------------------------------------------------------
   标题栏搜索按钮
   -------------------------------------------------------------------------- */
export function buildTitlebarSearch() {
  const bar = $("#titlebar");
  if (!bar) return;
  const actions = bar.querySelector(".titlebar__actions");
  if (!actions || $("#btn-search")) return;

  const btn = document.createElement("button");
  btn.className = "titlebar__btn";
  btn.id = "btn-search";
  btn.type = "button";
  btn.dataset.tip = "搜索（Ctrl+F）";
  btn.setAttribute("aria-label", "搜索");
  btn.innerHTML = icon("search");
  btn.addEventListener("click", () => toggleSearchBox());
  actions.insertBefore(btn, actions.firstChild);
}

/* --------------------------------------------------------------------------
   搜索弹层
   -------------------------------------------------------------------------- */
function buildOverlay() {
  if (built) return;
  built = true;

  overlay = document.createElement("section");
  overlay.className = "search-overlay";
  overlay.id = "search-overlay";
  overlay.hidden = true;
  overlay.dataset.state = "closed";
  overlay.setAttribute("aria-label", "搜索");
  overlay.innerHTML = `
    <div class="search-overlay__panel" role="dialog" aria-modal="true" aria-label="搜索">
      <div class="search-overlay__search">
        <!-- 搜索图标与「清空」按钮都放进输入框内部（.search-overlay__field）：
             以前它们和「关闭」按钮排成一排，看起来是三个并排按钮，
             既分不清哪个是输入框，两个 × 也容易被认成重复的关闭按钮。 -->
        <div class="search-overlay__field">
          ${icon("search", "search-overlay__search-icon")}
          <input class="search-overlay__input" id="search-input" type="text"
            placeholder="输入关键词后按回车搜索" autocomplete="off" spellcheck="false"
            aria-label="搜索关键词" />
          <button class="search-overlay__clear" id="search-clear" type="button"
            data-tip="清空搜索" aria-label="清空搜索" hidden>${icon("close")}</button>
        </div>
        <button class="search-overlay__close" type="button" data-search-close
          data-tip="关闭（结果会保留）" aria-label="关闭搜索">${icon("close")}</button>
      </div>
      <div class="search-overlay__history" id="search-history" hidden></div>
      <div class="search-overlay__head">
        <!-- 需求：本地搜索已挪到「本地歌曲」列表上方的筛选框，
             这里只保留在线搜索，不再有「在线 / 本地」标签页。 -->
        <span class="search-overlay__headline" id="search-headline"></span>
      </div>
      <div class="search-overlay__body" id="search-body"></div>
    </div>`;

  document.body.appendChild(overlay);

  body = overlay.querySelector("#search-body");
  headline = overlay.querySelector("#search-headline");
  input = overlay.querySelector("#search-input");
  clearBtn = overlay.querySelector("#search-clear");
  historyEl = overlay.querySelector("#search-history");

  clearBtn.addEventListener("click", () => clearSearch({ focus: true }));

  // 搜索历史：点关键词复用、点 × 删除该条、点「清空」全部删除
  historyEl?.addEventListener("click", (e) => {
    const actEl = e.target.closest("[data-history-act]");
    if (!actEl) return;
    const act = actEl.dataset.historyAct;
    if (act === "clear") {
      clearHistory();
      return;
    }
    const keyword = e.target.closest("[data-history-keyword]")?.dataset.historyKeyword || "";
    if (act === "del") {
      removeHistory(keyword);
      return;
    }
    if (act === "use") {
      if (input) input.value = keyword;
      syncClearButton();
      submitSearch();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitSearch();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      // Esc 的语义是「先清输入，再关层」：输入框非空时先清掉，
      // 空的时候再关，避免手滑一下把搜索结果全丢了。
      if ((input.value || "").trim()) clearSearch({ focus: true });
      else closeOverlay();
    }
  });

  // 输入时只更新「清空按钮」的可见性，绝不让外壳整体重渲染（那会丢焦点）
  // 输入时只更新「清空按钮」的可见性，绝不让外壳整体重渲染（那会丢焦点）
  input.addEventListener("input", () => {
    syncClearButton();
    updateHistoryVisibility();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target.closest("[data-search-close]") || e.target === overlay) {
      closeOverlay();
      return;
    }
    // 结果行里的动作按钮优先
    const act = e.target.closest("[data-search-act]")?.dataset.searchAct;
    if (act) {
      e.stopPropagation();
      const id = e.target.closest("[data-id]")?.dataset.id;
      const song = onlineResults.find((s) => s.id === id);
      if (!song) return;
      if (act === "preview") previewOnline(id);
      if (act === "download") downloadOnline(song);
      return;
    }
    // 整行点击 = 试听
    const row = e.target.closest("[data-search-id]");
    if (!row) return;
    previewOnline(row.dataset.searchId);
  });

  // 键盘可达：结果行支持 Enter / 空格
  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest?.("[data-search-id]");
    if (!row) return;
    e.preventDefault();
    previewOnline(row.dataset.searchId);
  });

  syncClearButton();
  updateHistoryVisibility();
}

/** 搜索按钮：打开/关闭搜索弹层 */
export function toggleSearchBox(force) {
  buildOverlay();
  const open = typeof force === "boolean" ? force : !state.searchOpen;
  if (open) openOverlay();
  else closeOverlay();
}

export function openOverlay() {
  buildOverlay();
  state.searchOpen = true;
  overlay.hidden = false;
  // 先解除 hidden 再切 opened，否则同一帧内的过渡不触发
  requestAnimationFrame(() => overlay.setAttribute("data-state", "opened"));
  $("#btn-search")?.setAttribute("aria-pressed", "true");
  // 每次打开都按最新的历史重画一次（历史可能在别处被改动过）
  updateHistoryVisibility();
  // 光标自动聚焦到搜索框
  requestAnimationFrame(() => {
    input?.focus();
    input?.select();
  });
}

/** 关闭只是隐藏，不清空结果 —— 下次搜索直接复用 */
export function closeOverlay() {
  state.searchOpen = false;
  $("#btn-search")?.setAttribute("aria-pressed", "false");
  if (!overlay) return;
  overlay.setAttribute("data-state", "closed");
  setTimeout(() => {
    if (!state.searchOpen && overlay) overlay.hidden = true;
  }, 180);
}

function syncClearButton() {
  if (!clearBtn) return;
  clearBtn.hidden = !(input?.value || "").trim();
}

/* --------------------------------------------------------------------------
   提交搜索
   -------------------------------------------------------------------------- */
function submitSearch() {
  const keyword = (input?.value || "").trim();
  if (!keyword) {
    // 空关键词按回车 = 清空结果
    clearSearch({ focus: true });
    return;
  }
  addHistory(keyword);
  updateHistoryVisibility();
  runOnlineSearch(keyword);
}

/** 清空按钮：输入框与结果一起清掉 */
export function clearSearch({ focus = false } = {}) {
  if (input) input.value = "";
  onlineResults = [];
  onlineQuery = "";
  searchSeq += 1; // 作废进行中的请求
  syncClearButton();
  updateHistoryVisibility();
  if (built && body) {
    body.innerHTML = emptyHint("输入关键词后按回车开始搜索");
    headline.textContent = "";
  }
  if (focus) input?.focus();
}

/* --------------------------------------------------------------------------
   渲染
   -------------------------------------------------------------------------- */

function emptyHint(text) {
  return `<div class="search-overlay__empty">${icon("search")}<span>${esc(text)}</span></div>`;
}

function renderOnline() {
  const keyword = (input?.value || "").trim();
  headline.textContent = onlineQuery ? `在线「${onlineQuery}」${fmtCount(onlineResults.length)} 个结果` : "";
  if (!onlineResults.length) {
    if (keyword && onlineQuery === keyword) {
      body.innerHTML = emptyHint("没有搜到在线歌曲，换个关键词试试");
    } else if (!keyword) {
      body.innerHTML = emptyHint("输入关键词后按回车搜索在线歌曲");
    }
    return;
  }

  body.innerHTML = onlineResults
    .map((song) => {
      // 封面：后端只给同源代理地址；拿不到就是空字符串 —— 此时不显示封面，
      // 而不是留一个浏览器破图（需求明确要求）
      const cover = song.coverUrl
        ? `<img src="${esc(song.coverUrl)}" alt="" loading="lazy" />`
        : `<span class="search-row__cover-fallback">${icon("music")}</span>`;
      return `
      <div class="search-row" data-search-id="${esc(song.id)}" data-search-online="1" role="button" tabindex="0">
        <span class="search-row__cover">${cover}</span>
        <span class="search-row__main">
          <span class="search-row__title">${esc(song.title || "未命名")}</span>
          <span class="search-row__sub">${esc(song.artist || "未知")} · ${fmtTime(song.duration)}</span>
        </span>
        <span class="search-row__actions">
          <button class="btn btn--sm btn--primary" type="button" data-search-act="preview" data-id="${esc(song.id)}">
            ${icon("play")}<span>试听</span>
          </button>
          <button class="btn btn--sm" type="button" data-search-act="download" data-id="${esc(song.id)}">
            ${icon("file")}<span>下载</span>
          </button>
        </span>
      </div>`;
    })
    .join("");

  body.querySelectorAll(".search-row__cover img").forEach(bindCoverFallback);
}

/* --------------------------------------------------------------------------
   在线搜索
   -------------------------------------------------------------------------- */
async function runOnlineSearch(keyword) {
  onlineQuery = "";
  headline.textContent = "搜索中…";
  body.innerHTML = `<div class="search-overlay__loading"><span class="search-overlay__spinner"></span>正在搜索「${esc(keyword)}」…</div>`;

  const seq = ++searchSeq;
  if (!isWails()) {
    onlineResults = [];
    onlineQuery = keyword;
    headline.textContent = "";
    body.innerHTML = emptyHint("浏览器预览下没有在线搜索后端，请在应用里试");
    return;
  }

  try {
    const list = await backend.onlineSearch(keyword, 1, 24);
    if (seq !== searchSeq) return; // 期间又搜了别的关键词
    onlineResults = Array.isArray(list) ? list : [];
    onlineQuery = keyword;
    renderOnline();
  } catch (err) {
    if (seq !== searchSeq) return;
    onlineResults = [];
    onlineQuery = keyword;
    headline.textContent = "";
    body.innerHTML = emptyHint(`在线搜索失败：${err?.message ?? err}`);
  }
}

/* --------------------------------------------------------------------------
   行内动作
   -------------------------------------------------------------------------- */

/**
 * 试听在线歌曲。
 *
 * 关键需求：**只加入播放列表，不进入「本地歌曲」**。
 * 「本地歌曲」= 本地曲库（state.songs），这里把在线曲目登记到
 * state.onlineSongs 并把 id 追加到队列尾部，songs 完全不动。
 */
function previewOnline(songId) {
  const song = onlineResults.find((s) => s.id === songId);
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

/* --------------------------------------------------------------------------
   对外接口
   -------------------------------------------------------------------------- */
export function initSearchPanel() {
  buildTitlebarSearch();
  buildOverlay();

  // Ctrl+F / Cmd+F：打开搜索弹层
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
    e.preventDefault();
    openOverlay();
  });

  // 输入框失焦时不关弹层（用户要能点结果），只把清空按钮状态同步一下
  input?.addEventListener("blur", () => syncClearButton());
}
