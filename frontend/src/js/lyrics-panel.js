// @ts-check
/* ==========================================================================
   lyrics-panel.js — 歌词工作台（在线匹配 / 微调 / 手动编辑）
   --------------------------------------------------------------------------
   历史说明：这个文件以前叫 online.js，只有「在线匹配歌词」一个面板。
   搜索改成「标题栏搜索框 + 结果弹层」之后（见 searchpanel.js），歌曲搜索
   的部分已经移走；本次又把「手动匹配歌词」升级成三个 tab 的工作台：

     [在线匹配]  搜索候选 → 应用（行为与以前完全一致）
     [微调]      整首歌的时间轴整体提前 / 延后
     [手动编辑]  粘贴歌词 → 一边播放一边打轴 → 保存

   为什么三个 tab 放在一起：它们是同一条工作流的前后步 ——
   先匹配（拿到一份歌词）→ 不对就微调 → 差得太多就自己打轴。
   放在一个面板里，用户不用回底栏换按钮，「保存后立刻看到效果」也天然成立。

   按钮本身写在 index.html 里（#btn-lyrics，夹在「播放模式」与「桌面歌词」
   之间）。以前它是运行时 inject 进来的：那样一旦本模块没被任何模块 import，
   按钮就会**静默消失**，而且从 HTML 里完全看不出少了什么（就是踩过的这个坑）。
   现在改为静态按钮 + 这里只做绑定，并在 main.js 里显式 import 本模块。

   两个容易踩的点，都写在对应函数的注释里：
     1. 歌词来源的**优先级**（内嵌 / .lrc 高于缓存）会让「保存了却不生效」，
        所以面板里有一条常驻提示与「同时写入歌曲文件」开关（见 renderNotice）；
     2. 空格是全局的播放/暂停，打轴也要用空格 —— 靠捕获阶段拦截解决
        （见 onPanelKeyDown）。
   ========================================================================== */

import { icon, openModal, toast } from "./dom.js";
import { seek, songById, state, subscribe, togglePlay } from "./store.js";
import {
  applyOnlineLyrics,
  currentLyricsInfo,
  ensureLyricsLoaded,
  lyricsOffsetOf,
  lyricsSourceLabel,
  setLyricsOffset,
} from "./playerhost.js";
import { coverOf, esc, fmtTime } from "./utils.js";
import {
  formatLrcTime,
  mergeDraftTimes,
  parseLyricDraft,
  serializeLrc,
  shiftLrc,
} from "@musicplayer/player-skins";

/* --------------------------------------------------------------------------
   面板骨架
   -------------------------------------------------------------------------- */
let root = null;
/** 当前 tab：online | nudge | edit */
let activeTab = "online";

/** 与 bridge.js 同理：绑定是按 URL 在运行时解析的，不能让打包器按文件路径解析 */
const BINDINGS_ENTRY = "../bindings/musicplayer/index.js";

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

// 面板里的元素查询都返回带类型的引用：checkJs 下 Element 上没有 value/checked/dataset，
// 到处都是断言会让代码更难读，所以按元素种类分成三个小工具。
const $panel = (sel) => /** @type {HTMLElement|null} */ (root ? root.querySelector(sel) : null);
const $input = (sel) => /** @type {HTMLInputElement|null} */ (root ? root.querySelector(sel) : null);
const $area = (sel) => /** @type {HTMLTextAreaElement|null} */ (root ? root.querySelector(sel) : null);

/* --------------------------------------------------------------------------
   入口
   -------------------------------------------------------------------------- */
function bindButton() {
  const btn = document.getElementById("btn-lyrics");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (root && !root.hidden) closePanel();
    else openPanel();
  });
}

bindButton();
subscribe(onTick);

/** 打开歌词工作台；tab 可以指定（不传就沿用上次用的那个） */
export function openPanel(tab) {
  if (!root) buildPanel();
  if (tab) activeTab = tab;
  root.hidden = false;
  root.dataset.open = "true";
  const btn = document.getElementById("btn-lyrics");
  if (btn) btn.setAttribute("aria-expanded", "true");
  void refreshAll();
}

export function closePanel() {
  if (!root) return;
  root.hidden = true;
  root.dataset.open = "false";
  const btn = document.getElementById("btn-lyrics");
  if (btn) btn.setAttribute("aria-expanded", "false");
  // 关面板时丢掉未应用的微调：偏移是「临时修正」，面板关了就没人能看见它，
  // 留着会让下次进面板的读数对不上（用户会以为程序记错了）
  const info = currentLyricsInfo();
  if (info.songId && lyricsOffsetOf(info.songId)) {
    setLyricsOffset(info.songId, 0);
    toast("未应用的微调已丢弃", { duration: 1800 });
  }
}

export function isLyricsPanelOpen() {
  return Boolean(root && !root.hidden);
}

/* --------------------------------------------------------------------------
   构建 DOM
   -------------------------------------------------------------------------- */
function buildPanel() {
  root = document.createElement("section");
  root.className = "lyricspanel";
  root.id = "lyrics-panel";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "歌词工作台");
  root.innerHTML = `
    <header class="lyricspanel__head">
      <img class="lyricspanel__cover" data-song-cover alt="" />
      <div class="lyricspanel__meta">
        <div class="lyricspanel__title" data-song-title>未在播放</div>
        <div class="lyricspanel__sub">
          <span class="lyricspanel__badge" data-song-source>暂无歌词</span>
          <span class="lyricspanel__artist" data-song-artist></span>
        </div>
      </div>
      <button class="lyricspanel__close" type="button" data-act="close" aria-label="关闭"></button>
    </header>

    <nav class="lyricspanel__tabs" role="tablist">
      <button class="lyricspanel__tab" type="button" role="tab" data-tab="online">在线匹配</button>
      <button class="lyricspanel__tab" type="button" role="tab" data-tab="nudge">微调</button>
      <button class="lyricspanel__tab" type="button" role="tab" data-tab="edit">手动编辑</button>
    </nav>

    <!-- 来源优先级提示（内嵌 / .lrc 高于缓存）：微调与手动编辑都要用到 -->
    <div class="lyricspanel__notice" data-notice hidden>
      <div class="lyricspanel__notice-text" data-notice-text></div>
      <label class="lyricspanel__notice-opt" data-notice-opt hidden>
        <input type="checkbox" data-embed-toggle checked />
        <span>同时写入歌曲文件（否则下次打开仍显示旧歌词）</span>
      </label>
    </div>

    <div class="lyricspanel__body">
      <!-- ① 在线匹配 -->
      <section class="lyricspanel__pane" data-pane="online">
        <div class="lyricspanel__row">
          <input class="lyricspanel__input" data-online-input placeholder="输入歌词搜索关键词" />
          <button class="btn btn--primary" type="button" data-act="lyrics-search">搜索</button>
        </div>
        <div class="lyricspanel__hint" data-online-hint>在线歌词来源</div>
        <div class="lyricspanel__list" data-online-results>搜索结果会显示在这里，点击「使用」应用歌词</div>
      </section>

      <!-- ② 微调 -->
      <section class="lyricspanel__pane" data-pane="nudge">
        <div class="nudge__readout">
          <span class="lyricspanel__hint">当前偏移</span>
          <b class="nudge__value" data-nudge-value>0.00 秒</b>
          <span class="nudge__dirty" data-nudge-dirty hidden>● 未应用</span>
          <span class="lyricspanel__hint" data-nudge-clamp hidden></span>
        </div>
        <div class="nudge__block">
          <div class="lyricspanel__hint">听感校准：一边听一边点，改的是歌词出现的时间</div>
          <div class="nudge__feel">
            <button class="btn" type="button" data-act="nudge-feel" data-delta="500">
              歌词比声音<b>快</b>（出现太早）→ 整体延后 0.5s
            </button>
            <button class="btn" type="button" data-act="nudge-feel" data-delta="-500">
              歌词比声音<b>慢</b>（出现太晚）→ 整体提前 0.5s
            </button>
          </div>
        </div>
        <div class="nudge__block">
          <div class="lyricspanel__hint">精细调整（50ms 一档）</div>
          <div class="nudge__steps">
            <button class="btn btn--sm" type="button" data-act="nudge-step" data-delta="-1000">−1.0</button>
            <button class="btn btn--sm" type="button" data-act="nudge-step" data-delta="-500">−0.5</button>
            <button class="btn btn--sm" type="button" data-act="nudge-step" data-delta="-100">−0.1</button>
            <button class="btn btn--sm" type="button" data-act="nudge-step" data-delta="100">+0.1</button>
            <button class="btn btn--sm" type="button" data-act="nudge-step" data-delta="500">+0.5</button>
            <button class="btn btn--sm" type="button" data-act="nudge-step" data-delta="1000">+1.0</button>
          </div>
          <input class="nudge__range" type="range" min="-10000" max="10000" step="50" value="0"
            data-act="nudge-range" aria-label="整体偏移（毫秒）" />
        </div>
        <div class="nudge__block nudge__block--grow">
          <div class="lyricspanel__hint">预览（点一行会跳到那一句）</div>
          <div class="lyricspanel__list" data-nudge-preview></div>
        </div>
        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="nudge-reset">重置</button>
          <span class="lyricspanel__hint">微调不会自动保存</span>
          <button class="btn btn--primary" type="button" data-act="nudge-apply">应用到歌词</button>
        </div>
      </section>

      <!-- ③ 手动编辑 -->
      <section class="lyricspanel__pane" data-pane="edit">
        <div class="editor__source">
          <div class="lyricspanel__row lyricspanel__row--between">
            <span class="lyricspanel__hint">歌词文本：粘贴纯文本即可（带时间标签也能识别）</span>
            <span class="lyricspanel__row-actions">
              <button class="btn btn--sm" type="button" data-act="editor-load">载入当前歌词</button>
              <button class="btn btn--sm" type="button" data-act="editor-clear-times">清空全部时间</button>
              <button class="btn btn--sm" type="button" data-act="editor-clear">清空文本</button>
            </span>
          </div>
          <textarea class="editor__text" data-editor-text spellcheck="false"
            placeholder="第一句&#10;第二句&#10;第三句&#10;…&#10;&#10;粘好之后点下面的「打轴并下一行」，一边听一边按空格"></textarea>
        </div>

        <div class="editor__transport">
          <button class="btn btn--icon" type="button" data-act="editor-play" data-tip="播放 / 暂停"></button>
          <button class="btn btn--sm" type="button" data-act="editor-back">−5s</button>
          <button class="btn btn--sm" type="button" data-act="editor-fwd">+5s</button>
          <span class="editor__clock" data-editor-clock>00:00.00</span>
          <span class="editor__spacer"></span>
          <span class="lyricspanel__hint" data-editor-progress>已打轴 0 / 0</span>
        </div>

        <button class="editor__tap" type="button" data-act="editor-tap">
          <span class="editor__tap-main">打轴并下一行</span>
          <span class="editor__tap-hint"><kbd>空格</kbd> 或点这里</span>
        </button>

        <div class="editor__tools">
          <button class="btn btn--sm" type="button" data-act="editor-undo">撤销</button>
          <button class="btn btn--sm" type="button" data-act="editor-prev">上一行</button>
          <button class="btn btn--sm" type="button" data-act="editor-next">下一行</button>
          <span class="lyricspanel__hint" data-editor-tip></span>
        </div>

        <div class="editor__list" data-editor-list></div>

        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="editor-copy">复制 LRC</button>
          <span class="lyricspanel__hint" data-editor-save-hint></span>
          <button class="btn btn--primary" type="button" data-act="editor-save">保存并应用</button>
        </div>
      </section>
    </div>
  `;

  document.body.appendChild(root);
  // 图标用 JS 注入而不是写在 HTML 模板里：模板里写 icon("close") 就得在
  // 模板字符串里再套一层 ${}，可读性很差
  const closeBtn = $panel(".lyricspanel__close");
  if (closeBtn) closeBtn.innerHTML = icon("close");
  const playBtn = $panel('[data-act="editor-play"]');
  if (playBtn) playBtn.innerHTML = icon("play");

  bindPanelEvents();
  setTab(activeTab);
}

/* --------------------------------------------------------------------------
   tab 切换与整体刷新
   -------------------------------------------------------------------------- */
function setTab(tab) {
  activeTab = tab === "nudge" || tab === "edit" ? tab : "online";
  if (!root) return;
  root.dataset.tab = activeTab;
  const tabs = /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll("[data-tab]"));
  tabs.forEach((b) => {
    const on = b.dataset.tab === activeTab;
    b.setAttribute("aria-selected", String(on));
    b.classList.toggle("is-active", on);
  });
  const panes = /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll("[data-pane]"));
  panes.forEach((p) => {
    p.hidden = p.dataset.pane !== activeTab;
  });
  renderNotice();
  if (activeTab === "edit") {
    void ensureDraft().then(() => {
      renderDraftList();
      renderDraftMeta();
    });
  } else if (activeTab === "nudge") {
    renderNudge();
  }
}

async function refreshAll() {
  renderSongHeader();
  // 面板可能在「歌词还没装载」时被打开（详情页没开过、刚启动就点了按钮）
  await ensureLyricsLoaded();
  renderSongHeader();
  renderNotice();
  if (activeTab === "online") await refreshOnlineHint();
  if (activeTab === "nudge") renderNudge();
  if (activeTab === "edit") {
    await ensureDraft();
    renderDraftList();
    renderDraftMeta();
  }
}

function renderSongHeader() {
  const info = currentLyricsInfo();
  const song = info.song;
  const cover = $panel("[data-song-cover]");
  const title = $panel("[data-song-title]");
  const artist = $panel("[data-song-artist]");
  const badge = $panel("[data-song-source]");
  if (cover) {
    const next = song ? coverOf(song) : "";
    if (cover.getAttribute("src") !== next) cover.setAttribute("src", next);
  }
  if (title) title.textContent = song ? song.title || "未命名" : "未在播放";
  if (artist) artist.textContent = song ? song.artist || "" : "";
  if (badge) {
    badge.textContent = lyricsSourceLabel(info.source);
    badge.dataset.src = info.source;
    badge.classList.toggle("is-empty", !info.text);
  }
}

/* --------------------------------------------------------------------------
   来源优先级提示
   --------------------------------------------------------------------------
   本程序的歌词读取顺序是：内嵌歌词 → 同名 .lrc → 程序缓存 → 在线匹配。
   微调 / 手动编辑的结果只能写进**缓存**（第三位），所以对「带内嵌歌词」或
   「有同名 .lrc」的歌，只写缓存会导致下次打开又变回旧歌词。

   这里选择**明说 + 给出口**，而不是假装没问题：把冲突摆在面板上，
   并给一个「同时写入歌曲文件」的开关（默认开）。
   -------------------------------------------------------------------------- */
/** 能写回歌词标签的格式，与 Go 侧 metacache.SupportedEmbed 保持一致 */
const EMBED_EXTS = new Set(["m4a", "mp4", "m4b", "alac", "aac", "flac"]);

function songExt(song) {
  return String(song?.ext || "").replace(/^\./, "").toLowerCase();
}

function renderNotice() {
  const notice = $panel("[data-notice]");
  if (!notice) return;
  const info = currentLyricsInfo();
  const relevant = activeTab === "nudge" || activeTab === "edit";
  const conflict = info.source === "embedded" || info.source === "lrc-file";
  if (!relevant || !conflict) {
    notice.hidden = true;
    return;
  }
  notice.hidden = false;
  const label = lyricsSourceLabel(info.source);
  const text = $panel("[data-notice-text]");
  const opt = $panel("[data-notice-opt]");
  const toggle = $input("[data-embed-toggle]");
  const ext = songExt(info.song);
  if (EMBED_EXTS.has(ext)) {
    if (text) {
      text.innerHTML = `这首歌的歌词来自「${esc(label)}」，它的优先级高于程序缓存：只保存到缓存的话，下次打开仍会显示旧歌词。建议同时写入歌曲文件。`;
    }
    if (opt) opt.hidden = false;
    if (toggle) toggle.checked = true;
  } else {
    if (text) {
      text.innerHTML = `这首歌的歌词来自「${esc(label)}」，它的优先级高于程序缓存；而 ${esc(ext ? "." + ext : "该格式")} 不支持写入歌词标签，所以本次改动只在<b>本次运行内</b>生效（重启后会变回旧歌词）。`;
    }
    if (opt) opt.hidden = true;
  }
}

/** 这次保存要不要同时写进歌曲文件 */
function embedChoice(info) {
  const toggle = $input("[data-embed-toggle]");
  const opt = $panel("[data-notice-opt]");
  const conflict = info.source === "embedded" || info.source === "lrc-file";
  if (conflict && opt && !opt.hidden && toggle) return Boolean(toggle.checked);
  // 没有冲突时尊重设置里的全局开关（embedMeta）
  return state.config.embedMeta === true;
}
/* --------------------------------------------------------------------------
   ① 在线匹配（行为与改造前完全一致，只是搬进了 tab）
   -------------------------------------------------------------------------- */
function currentTarget() {
  return songById(state.currentId) || null;
}

async function refreshOnlineHint() {
  const hint = $panel("[data-online-hint]");
  if (!hint) return;
  const service = await getBindings();
  if (!service) return;
  try {
    const res = await service.LyricsProviders?.();
    const list = Array.isArray(res?.providers) ? res.providers : [];
    if (list.length) hint.textContent = "在线歌词来源：" + list.join(" / ");
  } catch {
    /* 拿不到来源列表不影响搜索 */
  }
}

async function searchLyrics() {
  const input = $input("[data-online-input]");
  const box = $panel("[data-online-results]");
  if (!input || !box) return;
  const keyword = input.value.trim();
  if (!keyword) {
    toast("请输入歌词搜索关键词", { duration: 1500 });
    return;
  }
  const service = await getBindings();
  if (!service) {
    toast("在线歌词后端未就绪", { tone: "error" });
    return;
  }
  const song = currentTarget();
  box.textContent = "搜索中…";
  try {
    // keyword 是用户在输入框里写/改的搜索词；title/artist 是这首歌的元数据，
    // 一起传过去是为了让后端**按它们给候选打分排序** —— 只给关键词时所有候选
    // 都是同一个基础分，翻唱版会跑到原唱前面（这就是「搜到的一堆但都不是想要的」）。
    const list = await service.SearchLyrics(
      keyword,
      song ? song.title : "",
      song ? song.artist : "",
      song ? song.duration : 0
    );
    renderCandidates(Array.isArray(list) ? list : []);
  } catch (err) {
    box.textContent = "搜索失败：" + (err.message || err);
  }
}

function renderCandidates(list) {
  const box = $panel("[data-online-results]");
  if (!box) return;
  box.textContent = "";
  if (!list.length) {
    box.textContent = "没有找到候选歌词";
    return;
  }
  const html = list
    .map((c, i) => {
      const title = (c.title || "未命名") + " - " + (c.artist || "未知");
      const sub = (c.provider || "") + " · score " + (c.score || 0) + " · " + fmtTime(c.duration);
      return `
        <div class="candidate">
          <div class="candidate__main">
            <div class="candidate__title">${esc(title)}</div>
            <div class="candidate__sub">${esc(sub)}</div>
          </div>
          <button class="btn btn--sm btn--primary" type="button" data-act="use-lyric" data-i="${i}">使用</button>
        </div>`;
    })
    .join("");
  box.innerHTML = html;
  // 候选数据留在闭包里，避免把整段歌词塞进 DOM 属性
  lastCandidates = list;
}

let lastCandidates = [];

async function applyCandidate(candidate) {
  const song = currentTarget();
  if (!song) {
    toast("请先播放一首歌曲", { tone: "warning" });
    return;
  }
  const service = await getBindings();
  if (!service) {
    toast("在线歌词后端未就绪", { tone: "error" });
    return;
  }
  try {
    const res = await service.FetchLyrics(candidate.provider, candidate.id);
    if (!res || !res.lrc) {
      toast("没有取到歌词", { tone: "warning" });
      return;
    }
    // applyOnlineLyrics 内部会把歌词写进后端缓存（并按设置决定是否嵌入文件），
    // 所以「第二次打开又没有了」不会再发生。
    const saved = await applyOnlineLyrics(song.id, res.lrc, res.source || "online", {
      embed: state.config.embedMeta === true,
    });
    setLyricsOffset(song.id, 0);
    draft.songId = ""; // 歌词换了，手动编辑里的草稿作废，下次进 tab 会重载
    toast(saved?.note || "歌词已应用并保存", { tone: "success", duration: 2000 });
    renderSongHeader();
  } catch (err) {
    toast("获取歌词失败：" + (err.message || err), { tone: "error" });
  }
}

/* --------------------------------------------------------------------------
   ② 微调（整体时间轴偏移）
   --------------------------------------------------------------------------
   偏移只作用于**定位**（见 playerhost.lyricPositionMs），不改歌词文本：
   用户一边听一边拧，高亮行当场跟着变。点「应用到歌词」时才把偏移
   烙进时间戳写回缓存，写完之后读数归零 —— 存偏移量的话，桌面歌词、
   桌面背景歌词、第三方皮肤各自都要记得加一次，迟早会漏掉一处。
   -------------------------------------------------------------------------- */
/**
 * 允许的偏移范围：恒定 ±10 秒。
 *
 * 早先这里收紧成「最早一行不能被推到 0 之前」，结果**第一句就在 0:00 的歌
 * 根本不能往前调**（下限算出来是 0）—— 而那恰恰是最常需要往前调的情况
 *（歌词整体比人声晚出来）。现在恒定 ±10s，真被压到 0 的行由 shiftLrc 钳住，
 * 并在界面里明确告诉用户有几行贴到了开头（见 renderNudge）。
 */
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
  renderNudge();
}

function nudgeTo(ms) {
  const info = currentLyricsInfo();
  if (!info.songId || !info.text) return;
  const bounds = nudgeBounds();
  const next = Math.max(bounds.lower, Math.min(bounds.upper, Math.round(Number(ms) || 0)));
  setLyricsOffset(info.songId, next);
  renderNudge();
}

function renderNudge() {
  const info = currentLyricsInfo();
  const offset = info.songId ? lyricsOffsetOf(info.songId) : 0;
  const value = $panel("[data-nudge-value]");
  const dirty = $panel("[data-nudge-dirty]");
  const clampHint = $panel("[data-nudge-clamp]");
  const range = $input('[data-act="nudge-range"]');
  if (value) value.textContent = (offset > 0 ? "+" : "") + (offset / 1000).toFixed(2) + " 秒";
  if (dirty) dirty.hidden = offset === 0;
  if (clampHint) {
    // 往前调到头时会有若干行被压到 0:00（shiftLrc 的钳位规则）——
    // 不提示的话用户会以为「这几句还是慢了」，其实已经到顶了
    const clamped = offset < 0 ? info.lines.filter((l) => l.time + offset < 0).length : 0;
    clampHint.hidden = clamped === 0;
    clampHint.textContent = clamped ? "有 " + clamped + " 行会被压到 0:00（已经不能再往前）" : "";
  }
  if (range) {
    const bounds = nudgeBounds();
    range.min = String(bounds.lower);
    range.max = String(bounds.upper);
    range.value = String(offset);
    range.disabled = !info.text;
  }
  renderNudgePreview(offset);
}

function renderNudgePreview(offset) {
  const box = $panel("[data-nudge-preview]");
  if (!box) return;
  const info = currentLyricsInfo();
  if (!info.text) {
    box.textContent = "这首歌还没有歌词。可以先用「在线匹配」找一份，或者切到「手动编辑」自己贴一份。";
    return;
  }
  const lines = info.lines;
  // 当前行附近 ±5 行：给的是上下文，不是整首歌（整首在详情页里就能看）
  let active = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time + offset <= state.position) active = i;
    else break;
  }
  const from = Math.max(0, active - 5);
  const to = Math.min(lines.length, active + 6);
  const rows = [];
  for (let i = from; i < to; i += 1) {
    const line = lines[i];
    const t = line.time + offset;
    const cls = i === active ? "nudge__line is-active" : "nudge__line";
    rows.push(
      `<div class="${cls}" data-act="nudge-seek" data-ms="${Math.max(0, t)}">
        <span class="nudge__time">${formatLrcTime(t).slice(1, -1)}</span>
        <span class="nudge__text">${esc(line.text)}</span>
      </div>`
    );
  }
  box.innerHTML = rows.join("");
}

function resetNudge() {
  const info = currentLyricsInfo();
  if (!info.songId) return;
  setLyricsOffset(info.songId, 0);
  renderNudge();
}

async function applyNudge() {
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
    embed: embedChoice(info),
  });
  if (saved === false) return;
  setLyricsOffset(info.songId, 0);
  renderNudge();
  renderSongHeader();
  toast(saved?.note || "已应用并保存", { tone: "success", duration: 2600 });
}

/* --------------------------------------------------------------------------
   ③ 手动编辑（贴歌词 → 打轴 → 保存）
   -------------------------------------------------------------------------- */
/** 编辑草稿；songId 用来判断「换了歌，草稿要不要重来」 */
const draft = { songId: "", title: "", lines: [], cursor: 0, undo: [], dirty: false, kept: 0, stale: false };
let draftRows = [];
let draftTimer = null;
let lastNowIndex = -1;
let lastNowPaint = 0;

/** 换歌时重建草稿；同一首歌则保留（用户可能只是切了下 tab） */
async function ensureDraft(force = false) {
  const info = currentLyricsInfo();
  const songId = info.songId;
  const ta = $area("[data-editor-text]");
  if (!force && draft.songId === songId && draft.lines.length) return;
  draft.songId = songId;
  draft.title = info.song?.title || "";
  draft.lines = info.text ? parseLyricDraft(info.text) : [];
  draft.cursor = 0;
  draft.undo = [];
  draft.dirty = false;
  draft.kept = 0;
  draft.stale = false;
  lastNowIndex = -1;
  if (ta) ta.value = info.text || "";
  scheduleDraftSettle();
}

/** 文本框改动 → 300ms 去抖后重新建行 */
function scheduleDraftSettle() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    draftTimer = null;
    syncDraftFromText();
  }, 300);
}

function syncDraftFromText() {
  const ta = $area("[data-editor-text]");
  if (!ta) return;
  const parsed = parseLyricDraft(ta.value);
  const merged = mergeDraftTimes(draft.lines, parsed);
  // 「沿用了几行」要告诉用户：按位置补齐（改错别字）会把旧时间搬过来，
  // 用户换成另一份歌词时得知道这件事，否则会以为程序乱填时间
  const kept = merged.filter((l, i) => typeof l.time === "number" && !(parsed[i] && typeof parsed[i].time === "number")).length;
  pushUndo();
  draft.lines = merged;
  if (draft.cursor >= merged.length) draft.cursor = Math.max(0, merged.length - 1);
  draft.dirty = true;
  renderDraftList();
  renderDraftMeta(kept);
}

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
  const ta = $area("[data-editor-text]");
  if (ta) ta.value = serializeDraftText();
  renderDraftList();
  renderDraftMeta();
}

/** 草稿文本：保留未打轴的行（serializeLrc 会把它们丢掉，那是对外格式） */
function serializeDraftText() {
  return draft.lines.map((l) => (typeof l.time === "number" ? formatLrcTime(l.time) + l.text : l.text)).join("\n");
}

function renderDraftList() {
  const list = $panel("[data-editor-list]");
  if (!list) return;
  draftRows = [];
  if (!draft.lines.length) {
    list.innerHTML = `<div class="editor__empty">还没有歌词文本。把歌词粘到上面的文本框里，或点「载入当前歌词」。</div>`;
    return;
  }
  const html = draft.lines
    .map((line, i) => {
      const timed = typeof line.time === "number";
      const cls = ["drow"];
      if (i === draft.cursor) cls.push("is-cursor");
      if (!timed) cls.push("is-untimed");
      return `
        <div class="${cls.join(" ")}" data-act="editor-cursor" data-i="${i}">
          <span class="drow__no">${i + 1}</span>
          <button class="drow__time" type="button" data-act="edit-seek" data-i="${i}"
            data-tip="跳到这一句">${timed ? formatLrcTime(line.time).slice(1, -1) : "未打轴"}</button>
          <span class="drow__text">${esc(line.text)}</span>
          <button class="drow__clear" type="button" data-act="edit-clear" data-i="${i}"
            aria-label="清除这一行的时间" ${timed ? "" : "hidden"}>${icon("close")}</button>
        </div>`;
    })
    .join("");
  list.innerHTML = html;
  draftRows = Array.from(list.querySelectorAll(".drow"));
  paintCursorRow();
  lastNowIndex = -1;
}

function paintCursorRow() {
  draftRows.forEach((row, i) => row.classList.toggle("is-cursor", i === draft.cursor));
}

function moveCursor(delta) {
  if (!draft.lines.length) return;
  const next = Math.max(0, Math.min(draft.lines.length - 1, draft.cursor + delta));
  if (next === draft.cursor) return;
  draft.cursor = next;
  paintCursorRow();
  scrollCursorIntoView();
  renderDraftMeta();
}

function setCursor(i) {
  if (!Number.isFinite(i) || i < 0 || i >= draft.lines.length || i === draft.cursor) return;
  draft.cursor = i;
  paintCursorRow();
  scrollCursorIntoView();
  renderDraftMeta();
}

function scrollCursorIntoView() {
  const row = draftRows[draft.cursor];
  if (!row) return;
  // 只滚行列表这个容器，不用 scrollIntoView —— 后者会把整个窗口/外层面板
  // 也一起滚（面板是 fixed 定位，滚动窗口会让它看起来在抖）
  const list = $panel("[data-editor-list]");
  if (!list) return;
  const top = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2;
  list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
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
  // 对齐到 10ms：输出是百分秒，取整后再存可以避免「界面显示 12.34、
  // 文本里却是 12.349」这种自己跟自己对不上的情况
  line.time = Math.round(state.position / 10) * 10;
  draft.dirty = true;
  if (draft.cursor < draft.lines.length - 1) draft.cursor += 1;
  const ta = $area("[data-editor-text]");
  if (ta) ta.value = serializeDraftText();
  renderDraftList();
  renderDraftMeta();
  scrollCursorIntoView();
}

function clearLineTime(i) {
  const line = draft.lines[i];
  if (!line || typeof line.time !== "number") return;
  pushUndo();
  line.time = null;
  draft.dirty = true;
  const ta = $area("[data-editor-text]");
  if (ta) ta.value = serializeDraftText();
  renderDraftList();
  renderDraftMeta();
}

function clearAllTimes() {
  if (!draft.lines.length) return;
  pushUndo();
  draft.lines.forEach((l) => {
    l.time = null;
  });
  draft.cursor = 0;
  draft.dirty = true;
  const ta = $area("[data-editor-text]");
  if (ta) ta.value = serializeDraftText();
  renderDraftList();
  renderDraftMeta();
  toast("已清空全部时间，可以重新打轴", { duration: 2000 });
}

function loadCurrentLyrics() {
  const info = currentLyricsInfo();
  const ta = $area("[data-editor-text]");
  if (!ta) return;
  if (!info.text) {
    toast("这首歌还没有歌词可载入", { duration: 2000 });
    return;
  }
  pushUndo();
  ta.value = info.text;
  draft.lines = parseLyricDraft(info.text);
  draft.cursor = 0;
  draft.dirty = true;
  // 归属改成当前这首歌：用户点它就是在说「我要编辑的是这一首」
  draft.songId = info.songId;
  draft.title = info.song?.title || "";
  renderDraftList();
  renderDraftMeta();
  toast("已载入当前歌词，可以逐行修正时间", { duration: 2200 });
}

function clearDraftText() {
  const ta = $area("[data-editor-text]");
  if (!ta) return;
  pushUndo();
  ta.value = "";
  draft.lines = [];
  draft.cursor = 0;
  draft.dirty = true;
  renderDraftList();
  renderDraftMeta();
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

function renderDraftMeta(kept) {
  if (typeof kept === "number") draft.kept = kept;
  const timed = draft.lines.filter((l) => typeof l.time === "number").length;
  const progress = $panel("[data-editor-progress]");
  if (progress) progress.textContent = "已打轴 " + timed + " / " + draft.lines.length;

  const stale = draftIsStale();
  const saveHint = $panel("[data-editor-save-hint]");
  if (saveHint) {
    if (stale) {
      const t = songById(draft.songId);
      saveHint.textContent = "草稿属于《" + (t?.title || "上一首") + "》";
    } else {
      const untimed = draft.lines.length - timed;
      saveHint.textContent = untimed > 0 && timed > 0 ? "还有 " + untimed + " 行没有时间" : "";
    }
  }
  const tip = $panel("[data-editor-tip]");
  if (tip) {
    if (stale) tip.textContent = "已切歌，草稿仍属于上一首";
    else if (draft.kept > 0) tip.textContent = "已沿用 " + draft.kept + " 行原有时间";
    else tip.textContent = draft.dirty ? "未保存" : "";
  }
}

async function saveDraft() {
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
  // 时间是否升序：允许保存（确实有歌词会回退），但要让用户知道
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
    const lines = [];
    if (untimed) {
      lines.push(`还有 <b>${untimed}</b> 行没有时间：LRC 里没有时间标签的行会被忽略，保存后这些行不会显示。`);
    }
    if (unsorted) lines.push("时间不是升序，播放时高亮可能会跳来跳去。");
    const ok = await confirmModal({
      title: untimed ? "还有歌词没有打轴" : "时间不是升序",
      body: lines.map((t) => `<div class="lyricspanel__hint">${t}</div>`).join(""),
      okText: "继续保存",
      cancelText: "返回编辑",
    });
    if (!ok) return;
  }
  const lrc = serializeLrc(draft.lines);
  const saved = await applyOnlineLyrics(info.songId, lrc, "manual", { embed: embedChoice(info) });
  if (saved === false) return;
  setLyricsOffset(info.songId, 0);
  draft.undo = [];
  draft.dirty = false;
  draft.songId = info.songId;
  renderSongHeader();
  renderNotice();
  renderDraftMeta();
  toast(saved?.note || "歌词已保存", { tone: "success", duration: 2600 });
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

async function copyLrc() {
  const lrc = serializeLrc(draft.lines);
  if (!lrc) {
    toast("还没有可复制的歌词", { duration: 1800 });
    return;
  }
  try {
    await navigator.clipboard.writeText(lrc);
    toast("LRC 已复制到剪贴板", { tone: "success" });
  } catch {
    // 没有剪贴板权限（少见）时的兜底：临时 textarea + execCommand
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

/* --------------------------------------------------------------------------
   每帧同步（只更新「会变的那几个字」，不做任何重建）
   -------------------------------------------------------------------------- */
function onTick() {
  if (!root || root.hidden) return;
  if (activeTab !== "edit") return;
  const clock = $panel("[data-editor-clock]");
  if (clock) {
    const text = formatLrcTime(state.position).slice(1, -1);
    if (clock.textContent !== text) clock.textContent = text;
  }
  const playBtn = $panel('[data-act="editor-play"]');
  if (playBtn) {
    const want = state.playing ? "pause" : "play";
    if (playBtn.dataset.icon !== want) {
      playBtn.dataset.icon = want;
      playBtn.innerHTML = icon(want);
    }
  }
  // 切歌只在「状态翻转」时更新一次：这个检查每帧都跑，但绝不能每帧写 DOM
  const stale = draftIsStale();
  if (stale !== draft.stale) {
    draft.stale = stale;
    renderDraftMeta();
    if (stale) {
      const t = songById(draft.songId);
      toast("已切歌：这份草稿仍属于《" + (t?.title || "上一首") + "》，保存会写到它上面", {
        tone: "warning",
        duration: 5000,
      });
    }
  }
  paintNowRow();
}

/**
 * 标出「当前播到哪一行」（与选中行是两回事：选中行是"正在打轴的那行"）。
 *
 * 200ms 节流：这个高亮跟手到 60fps 没有任何意义，而每帧线性扫一遍
 * 上百行是白花的 CPU（歌词行数在打轴时往往就是整首歌）。
 */
function paintNowRow() {
  const now = performance.now();
  if (now - lastNowPaint < 200) return;
  lastNowPaint = now;
  let idx = -1;
  for (let i = 0; i < draft.lines.length; i += 1) {
    const t = draft.lines[i].time;
    if (typeof t === "number" && t <= state.position) idx = i;
  }
  if (idx === lastNowIndex) return;
  const old = draftRows[lastNowIndex];
  if (old) old.classList.remove("is-now");
  const next = draftRows[idx];
  if (next) next.classList.add("is-now");
  lastNowIndex = idx;
}

/* --------------------------------------------------------------------------
   事件绑定
   -------------------------------------------------------------------------- */
function bindPanelEvents() {
  root.addEventListener("click", onPanelClick);
  root.addEventListener("input", onPanelInput);
  // 捕获阶段：空格是本程序全局的「播放/暂停」，打轴也要用空格，
  // 必须抢在 main.js#bindShortcuts 之前拦下来（见 onPanelKeyDown）
  document.addEventListener("keydown", onPanelKeyDown, true);
}

function onPanelInput(e) {
  const t = /** @type {HTMLElement} */ (e.target);
  if (t.matches("[data-editor-text]")) {
    scheduleDraftSettle();
    return;
  }
  if (t.matches('[data-act="nudge-range"]')) {
    nudgeTo(Number(/** @type {HTMLInputElement} */ (t).value));
  }
}

function onPanelClick(e) {
  // 注意两件事：
  //  1. 断言要包住 closest 的结果 —— 写成 /** @type {HTMLElement} */ (e.target).closest()
  //     断言的是 e.target，el 依然是 Element（dataset 就不存在了）；
  //  2. 选择器必须同时匹配 [data-tab]：tab 按钮没有 data-act，
  //     只匹配 [data-act] 的话点 tab 会被这里直接 return 掉（切不过去）。
  const el = /** @type {HTMLElement|null} */ (
    /** @type {Element} */ (e.target).closest("[data-act], [data-tab]")
  );
  if (!el || !root.contains(el)) return;
  const act = el.dataset.act;
  const i = Number(el.dataset.i);
  switch (act) {
    case "close":
      closePanel();
      return;
    case "lyrics-search":
      void searchLyrics();
      return;
    case "use-lyric": {
      const c = lastCandidates[i];
      if (c) void applyCandidate(c);
      return;
    }
    case "nudge-feel":
    case "nudge-step":
      nudgeBy(Number(el.dataset.delta) || 0);
      return;
    case "nudge-reset":
      resetNudge();
      return;
    case "nudge-apply":
      void applyNudge();
      return;
    case "nudge-seek":
      seek(Math.max(0, Number(el.dataset.ms) || 0));
      return;
    case "editor-load":
      loadCurrentLyrics();
      return;
    case "editor-clear-times":
      clearAllTimes();
      return;
    case "editor-clear":
      clearDraftText();
      return;
    case "editor-play":
      togglePlay();
      return;
    case "editor-back":
      seek(Math.max(0, state.position - 5000));
      return;
    case "editor-fwd":
      seek(state.position + 5000);
      return;
    case "editor-tap":
      tapLine();
      return;
    case "editor-undo":
      undoDraft();
      return;
    case "editor-prev":
      moveCursor(-1);
      return;
    case "editor-next":
      moveCursor(1);
      return;
    case "editor-cursor":
      setCursor(i);
      return;
    case "edit-seek":
      seekDraftLine(i);
      return;
    case "edit-clear":
      clearLineTime(i);
      return;
    case "editor-copy":
      void copyLrc();
      return;
    case "editor-save":
      void saveDraft();
      return;
    default:
      break;
  }
  // tab 按钮
  const tab = el.dataset.tab;
  if (tab) setTab(tab);
}

/**
 * 面板里的键盘操作。
 *
 * 用捕获阶段 + stopPropagation：main.js 的全局快捷键也监听 document 的
 * keydown，里面把空格绑成了「播放/暂停」。打轴时按空格必须只打轴、
 * 不能顺带暂停 —— 那两件事同时发生会让流程彻底没法用。
 * 焦点在文本框/输入框里时一律放行（那时空格就是打字）。
 */
function onPanelKeyDown(e) {
  if (!root || root.hidden) return;
  const t = /** @type {HTMLElement} */ (e.target);
  const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

  if (e.key === "Escape") {
    // 弹窗自己处理 Esc（确认框还开着的时候不要把面板也关了）
    if (document.getElementById("modal-backdrop")?.hidden === false) return;
    if (typing && t.tagName === "TEXTAREA") {
      t.blur();
      e.stopPropagation();
      return;
    }
    closePanel();
    e.stopPropagation();
    return;
  }
  if (activeTab !== "edit" || typing) return;

  switch (e.key) {
    case " ":
    case "s":
    case "S":
      e.preventDefault();
      e.stopPropagation();
      tapLine();
      return;
    case "Backspace":
    case "Delete":
      e.preventDefault();
      e.stopPropagation();
      clearLineTime(draft.cursor);
      return;
    case "ArrowUp":
      e.preventDefault();
      e.stopPropagation();
      moveCursor(-1);
      return;
    case "ArrowDown":
      e.preventDefault();
      e.stopPropagation();
      moveCursor(1);
      return;
    case "z":
    case "Z":
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        undoDraft();
      }
      return;
    default:
      break;
  }
}
