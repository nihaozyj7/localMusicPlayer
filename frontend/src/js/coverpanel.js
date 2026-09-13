/* ==========================================================================
   coverpanel.js — 封面面板（搜索 / 多选 / 多封面管理 / 轮播）
   --------------------------------------------------------------------------
   入口：
     · 播放详情页头部「封面」按钮（与轮播开关同一个按钮组）；
     · 每首歌的「更多」菜单里的「更换封面…」。

   面板能做四件事：
     1. **联网搜索**：只填一个关键词（需求：去掉歌手/专辑输入框），
        后端多来源聚合（iTunes / 网易云 / Deezer / MusicBrainz）一次返回全部候选；
     2. **多选 + 应用**：候选可以勾选多张，点「应用」一次性加入这首歌的封面集合；
     3. **管理已有封面**：切当前生效、删除、把文件内嵌封面收进缓存；点应用后
        **立刻写入**（缓存 + 按开关写进歌曲文件），没有第二道确认；
     4. **轮播开关**：与头部按钮组里的开关是同一份状态（都落在后端缓存索引里）。

   为什么封面要经过后端：
     页面 CSP 是 img-src 'self'，第三方图片直连会被浏览器拒绝；
     而且多数图床校验 Referer。后端 /online/cover 做同源代理，
     这里展示的候选图是后端下载后回传的 data URL，同样不涉及跨源。
   ========================================================================== */

import { icon, toast } from "./dom.js";
import { backend, isWails } from "./bridge.js";
import { coverOfRaw } from "./utils.js";
import { commit, setCoverSet, state } from "./store.js";
import { notifyCoverChanged } from "./playerhost.js";
let built = false;
let layer = null;
let bodyEl = null;
let songId = null;
/** 搜索回来的候选（含 preview data URL） */
let candidates = [];
/** 候选的勾选集合（下标） */
let selected = new Set();
/** 当前封面集合（后端返回的权威结构） */
let currentSet = null;
let busy = false;

/* --------------------------------------------------------------------------
   DOM
   -------------------------------------------------------------------------- */
function build() {
  if (built) return;
  built = true;
  layer = document.getElementById("cover-layer");
  if (!layer) throw new Error("缺少 #cover-layer 容器");
  bodyEl = layer.querySelector("#cover-layer-body");

  layer.addEventListener("click", (e) => {
    if (e.target.closest("[data-cover-close]") || e.target === layer) {
      closeCoverPanel();
      return;
    }
    // 封面集合里的操作（设当前 / 删除 / 收编内嵌图）
    const itemAct = e.target.closest("[data-set-act]");
    if (itemAct) {
      const idx = Number(itemAct.closest("[data-set-index]")?.dataset.setIndex);
      if (itemAct.dataset.setAct === "use") useExisting(idx);
      if (itemAct.dataset.setAct === "remove") removeExisting(idx);
      return;
    }
    const act = e.target.closest("[data-cover-act]")?.dataset.coverAct;
    if (!act) return;
    if (act === "search") runSearch();
    if (act === "url") applyURL();
    if (act === "reset") resetCover();
    if (act === "toggle") toggleCandidate(Number(e.target.closest("[data-cover-idx]")?.dataset.coverIdx));
    if (act === "select-all") selectAll();
    if (act === "apply") applySelected();
    if (act === "carousel") toggleCarousel();
    if (act === "embed") toggleEmbed();
    if (act === "open-cache") backend.coverOpenCacheDir("covers");
  });

  layer.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // Esc：搜索框有内容时先清输入，否则关面板
    const input = layer.querySelector("#cover-keyword");
    if (input && document.activeElement === input && input.value.trim()) {
      input.value = "";
      return;
    }
    closeCoverPanel();
  });
}

/* --------------------------------------------------------------------------
   打开 / 关闭
   -------------------------------------------------------------------------- */
export function openCoverPanel(id) {
  build();
  songId = id;
  candidates = [];
  selected = new Set();
  currentSet = state.coverSets.get(id) || null;
  const song = state.songs.find((s) => s.id === id);
  if (!song) {
    toast("这首歌不在本地曲库里，无法更换封面", { tone: "warning" });
    return;
  }
  render(song);
  layer.hidden = false;
  requestAnimationFrame(() => layer.setAttribute("data-state", "opened"));
  // 后端才是封面集合的真相来源（可能有文件内嵌的多张），打开时拉一次
  refreshSet();
  // 来源列表用于提示文案（设置页也会拉，但用户可能没开过设置）
  ensureProviders();
}

/** 拉一次后端注册的封面来源，避免提示里写死来源名（加了 QQ 音乐后老文案就对不上了） */
async function ensureProviders() {
  if (state.coverProviders?.length || !isWails()) return;
  try {
    const res = await backend.coverProviders();
    if (Array.isArray(res?.providers) && res.providers.length) state.coverProviders = res.providers;
  } catch {
    /* 只是提示文案，拿不到就算了 */
  }
}

/** 提示文案里的来源列表 */
function providerLabel() {
  const list = state.coverProviders || [];
  return list.length ? list.join(" / ") : "iTunes / 网易云 / QQ 音乐 / Deezer / MusicBrainz";
}

export function closeCoverPanel() {
  if (!layer) return;
  layer.setAttribute("data-state", "closed");
  setTimeout(() => {
    if (layer.getAttribute("data-state") === "closed") layer.hidden = true;
  }, 200);
}

async function refreshSet() {
  if (!isWails() || !songId) return;
  try {
    const set = await backend.coverList(songId);
    if (set && Array.isArray(set.items)) {
      currentSet = set;
      setCoverSet(songId, set);
      renderSet();
      renderToolbar();
      notifyCoverChanged();
    }
  } catch (err) {
    status(`读取现有封面失败：${err?.message ?? err}`);
  }
}

/* --------------------------------------------------------------------------
   渲染
   -------------------------------------------------------------------------- */
function render(song) {
  const raw = coverOfRaw(song);
  bodyEl.innerHTML = `
    <div class="cover-panel">
      <div class="cover-panel__current">
        <div class="cover-panel__frame" id="cover-current-frame">
          ${
            raw
              ? `<img src="${escapeAttr(raw)}" alt="${escapeAttr(song.title)} 原始封面" />`
              : `<span class="cover-panel__none">${icon("music")}</span>`
          }
        </div>
        <div class="cover-panel__meta">
          <div class="cover-panel__title">${escapeHtml(song.title)}</div>
          <div class="cover-panel__sub">${escapeHtml(song.artist)}${
            song.album ? ` · ${escapeHtml(song.album)}` : ""
          }</div>
          <div class="cover-panel__hint">
            选中的封面会立刻写入（缓存目录 + 按下面的开关写进歌曲文件）。
            这首歌可以保存多张封面，右上角的轮播开关会让详情页按时间轮换显示。
          </div>
        </div>
      </div>

      <div class="cover-panel__section">
        <div class="cover-panel__section-head">
          <span class="cover-panel__section-title">这首歌的封面</span>
          <span class="u-spacer"></span>
          <button class="btn btn--sm" type="button" data-cover-act="embed" id="cover-embed-btn"
            aria-pressed="false">${icon("tag")}<span>写入歌曲文件</span></button>
          <button class="btn btn--sm" type="button" data-cover-act="carousel" id="cover-carousel-btn"
            aria-pressed="false">${icon("slideshow")}<span>轮播</span></button>
        </div>
        <div class="cover-set" id="cover-set"></div>
      </div>

      <div class="cover-panel__section">
        <div class="cover-panel__search">
          <input class="field" id="cover-keyword" type="text" placeholder="输入关键词（歌名 / 歌手 / 专辑都可以）"
            autocomplete="off" spellcheck="false" aria-label="封面搜索关键词"
            value="${escapeAttr(song.title || "")}" />
          <button class="btn btn--primary btn--sm" type="button" data-cover-act="search"
            ${busy ? "disabled" : ""}>${icon("search")}<span>联网搜索</span></button>
        </div>
        <div class="cover-panel__hint">
          下载来的文件常常没有标签，标题是从文件名推出来的，直接搜不容易命中；
          在这里填一个更准确的关键词会准很多。搜索结果可以多选，再点「应用」。
        </div>
      </div>

      <div class="cover-panel__status" id="cover-status"></div>
      <div class="cover-panel__grid" id="cover-grid"></div>
      <div class="cover-panel__selectbar" id="cover-selectbar" hidden></div>

      <div class="cover-panel__url">
        <input class="field" id="cover-url" type="text" placeholder="或粘贴一个图片地址（https://…）"
          autocomplete="off" spellcheck="false" aria-label="图片地址" />
        <button class="btn btn--sm" type="button" data-cover-act="url">${icon("file")}<span>使用这个地址</span></button>
      </div>

      <div class="cover-panel__foot">
        <button class="btn btn--sm btn--danger" type="button" data-cover-act="reset">
          ${icon("refresh")}<span>恢复原始封面</span>
        </button>
        <button class="btn btn--sm" type="button" data-cover-act="open-cache">
          ${icon("folder")}<span>打开缓存目录</span>
        </button>
      </div>
    </div>`;

  renderSet();
  renderToolbar();
  renderCandidates();
}

function status(text) {
  const node = bodyEl?.querySelector("#cover-status");
  if (node) node.textContent = text || "";
}

/* —— 这首歌的封面集合 —— */
function renderSet() {
  const box = bodyEl?.querySelector("#cover-set");
  if (!box) return;
  const cached = currentSet?.items || [];
  const embedded = currentSet?.embedded || [];
  const active = Number(currentSet?.active) || 0;

  if (!cached.length && !embedded.length) {
    box.innerHTML = `<div class="cover-set__empty">还没有换过封面，这首歌现在用的是文件自带的封面。</div>`;
    return;
  }

  const cachedHtml = cached
    .map(
      (c, i) => `
      <div class="cover-set__item" data-set-index="${i}" data-active="${i === active}">
        <img src="${escapeAttr(c.preview)}" alt="" />
        ${i === active ? `<span class="cover-set__badge">当前</span>` : ""}
        <div class="cover-set__ops">
          <button class="btn btn--xs" type="button" data-set-act="use" ${i === active ? "disabled" : ""}>
            ${icon("check")}<span>设为当前</span>
          </button>
          <button class="btn btn--xs btn--danger" type="button" data-set-act="remove">
            ${icon("trash")}<span>删除</span>
          </button>
        </div>
      </div>`
    )
    .join("");

  // 文件内嵌的封面：点「收进缓存」就把它加入集合（之后可以轮播 / 排序 / 删除）
  const embeddedHtml = embedded
    .map(
      () => `
      <div class="cover-set__item cover-set__item--embedded" data-embedded="1">
        <img src="" alt="" />
        <span class="cover-set__badge cover-set__badge--ghost">文件内嵌</span>
        <div class="cover-set__ops">
          <button class="btn btn--xs" type="button" data-set-act="use">
            ${icon("plus")}<span>收进缓存</span>
          </button>
        </div>
      </div>`
    )
    .join("");

  box.innerHTML = cachedHtml + embeddedHtml;

  // 内嵌项单独处理：它们没有缓存下标，而且图片是懒加载的（批量读文件不划算）
  box.querySelectorAll("[data-embedded='1']").forEach((node, i) => {
    const item = embedded[i];
    const img = node.querySelector("img");
    if (img && item?.preview) img.src = item.preview;
    node.querySelector("[data-set-act='use']")?.addEventListener("click", () => useEmbedded(item));
  });
}

function renderToolbar() {
  const carouselBtn = bodyEl?.querySelector("#cover-carousel-btn");
  if (carouselBtn) {
    carouselBtn.setAttribute("aria-pressed", String(state.config.coverCarousel === true));
  }
  const embedBtn = bodyEl?.querySelector("#cover-embed-btn");
  if (embedBtn) {
    embedBtn.setAttribute("aria-pressed", String(state.config.embedMeta === true));
    embedBtn.dataset.tip = state.config.embedMeta
      ? "关闭后封面只存在缓存目录里"
      : "打开后封面会写进歌曲文件本身（会修改音乐文件）";
  }
}

/* —— 搜索候选（多选） —— */
function renderCandidates() {
  const grid = bodyEl?.querySelector("#cover-grid");
  if (!grid) return;
  if (!candidates.length) {
    grid.innerHTML = "";
    renderSelectbar();
    return;
  }
  grid.innerHTML = candidates
    .map((c, i) => {
      const on = selected.has(i);
      return `
      <button class="cover-card" type="button" role="checkbox" aria-checked="${on}"
        data-cover-act="toggle" data-cover-idx="${i}" data-selected="${on}">
        <img src="${escapeAttr(c.preview)}" alt="" loading="lazy" />
        <span class="cover-card__check">${icon("check")}</span>
        <span class="cover-card__meta">
          <span class="cover-card__provider">${escapeHtml(c.provider || "来源")}</span>
          <span class="cover-card__score">${
            c.width && c.height ? `${c.width}×${c.height}` : `匹配度 ${Number(c.score) || 0}`
          }</span>
        </span>
      </button>`;
    })
    .join("");
  renderSelectbar();
}

function renderSelectbar() {
  const bar = bodyEl?.querySelector("#cover-selectbar");
  if (!bar) return;
  if (!candidates.length) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;
  bar.innerHTML = `
    <span class="cover-panel__selectinfo">已选 ${selected.size} / ${candidates.length} 张</span>
    <span class="u-spacer"></span>
    <button class="btn btn--sm" type="button" data-cover-act="select-all">
      ${icon("check")}<span>${selected.size === candidates.length ? "取消全选" : "全选"}</span>
    </button>
    <button class="btn btn--primary btn--sm" type="button" data-cover-act="apply"
      ${selected.size ? "" : "disabled"}>
      ${icon("plus")}<span>应用${selected.size ? `（${selected.size}）` : ""}</span>
    </button>`;
}

/* --------------------------------------------------------------------------
   动作
   -------------------------------------------------------------------------- */

function toggleCandidate(index) {
  if (!Number.isFinite(index)) return;
  if (selected.has(index)) selected.delete(index);
  else selected.add(index);
  const card = bodyEl?.querySelector(`[data-cover-idx="${index}"]`);
  if (card) {
    const on = selected.has(index);
    card.dataset.selected = String(on);
    card.setAttribute("aria-checked", String(on));
  }
  renderSelectbar();
}

function selectAll() {
  if (selected.size === candidates.length) selected.clear();
  else candidates.forEach((_, i) => selected.add(i));
  renderCandidates();
}

async function runSearch() {
  if (busy) return;
  if (!isWails()) {
    status("浏览器预览下没有联网封面后端，请在应用里试");
    return;
  }
  busy = true;
  candidates = [];
  selected = new Set();
  renderCandidates();
  const keyword = (bodyEl?.querySelector("#cover-keyword")?.value || "").trim();
  status(
    keyword
      ? `正在按「${keyword}」同时查询多个来源（${providerLabel()}）…`
      : `正在同时查询多个来源（${providerLabel()}）…`
  );
  try {
    // 只传关键词：需求要求面板上不再有歌手/专辑输入框。
    // 后端看到 keyword 就按「纯关键词」搜索（标题=keyword，不带可能错误的歌手/专辑）。
    const override = keyword ? { keyword } : {};
    // 用 LookupAll 而不是 Lookup：一次把所有来源的候选都取回来（后端已下载并
    // 校验过，纯白占位图会被丢掉），用户自己在缩略图里挑，而不是被动接受一张。
    const list = await backend.coverLookupSongAll(songId, override);
    const arr = Array.isArray(list) ? list.filter((c) => c?.ok && c.preview) : [];
    if (arr.length) {
      candidates = arr;
      // 默认全部勾选：常见诉求就是「把这几张都存下来」，一键应用即可
      arr.forEach((_, i) => selected.add(i));
      const providers = [...new Set(arr.map((c) => c.provider).filter(Boolean))];
      status(`找到 ${arr.length} 张（来源：${providers.join(" / ") || "未知"}），勾选后点「应用」`);
    } else {
      const msg = Array.isArray(list) ? list.find((c) => c?.message)?.message : "";
      status(msg || "没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）");
    }
  } catch (err) {
    status(`搜索失败：${err?.message ?? err}`);
  } finally {
    busy = false;
    renderCandidates();
  }
}

/** 应用勾选的候选：一次性加入封面集合并立刻写入 */
async function applySelected() {
  const previews = [...selected].sort((a, b) => a - b).map((i) => candidates[i]?.preview).filter(Boolean);
  if (!previews.length) {
    status("先勾选至少一张封面");
    return;
  }
  await writeCovers(() => backend.coverAddMany(songId, previews, state.config.embedMeta === true));
}

async function applyURL() {
  const input = bodyEl?.querySelector("#cover-url");
  const url = (input?.value || "").trim();
  if (!url) {
    status("请先填写图片地址");
    return;
  }
  status("正在下载图片…");
  try {
    const fetched = await backend.coverFetchURL(url);
    if (!fetched?.ok || !fetched.preview) {
      status(fetched?.message || "这张图片取不到");
      return;
    }
    await writeCovers(() =>
      backend.coverAdd(songId, url, fetched.preview, state.config.embedMeta === true)
    );
  } catch (err) {
    status(`取图失败：${err?.message ?? err}`);
  }
}

/** 把已有的某张设为当前生效 */
async function useExisting(index) {
  if (!Number.isFinite(index)) return;
  await writeCovers(() => backend.coverSetActive(songId, index));
}

/** 把「文件内嵌」的一张收进缓存（之后可以轮播 / 排序 / 删除） */
async function useEmbedded(item) {
  if (!item?.preview) return;
  await writeCovers(() => backend.coverAdd(songId, "", item.preview, state.config.embedMeta === true));
}

async function removeExisting(index) {
  if (!Number.isFinite(index)) return;
  await writeCovers(() => backend.coverRemove(songId, index));
}

/**
 * 统一的「写封面」收口。
 *
 * 三个要点（都是踩过的坑）：
  1. 后端返回的是新的封面集合，**以后端为准**覆盖本地状态 ——
     前端自己猜下标会在删除/排序后错位；
  2. 写完立刻通知播放详情页（不必等下一帧），用户点了应用就能看到变化；
  3. 在线试听曲目没有本地文件，后端会报错，这里把消息显示出来即可。
 */
async function writeCovers(action) {
  if (!isWails()) {
    status("浏览器预览下没有封面后端，请在应用里试");
    return;
  }
  status("正在保存…");
  try {
    const set = await action();
    if (set && Array.isArray(set.items)) {
      currentSet = set;
      setCoverSet(songId, set);
      renderSet();
      renderToolbar();
      notifyCoverChanged();
    }
    status(set?.message || "已更新封面");
    toast(set?.message || "封面已更新", { tone: "success", duration: 1800 });
  } catch (err) {
    status(`保存失败：${err?.message ?? err}`);
  }
}

/** 轮播开关（与详情页头部按钮组里的开关是同一份状态） */
function toggleCarousel() {
  state.config.coverCarousel = !state.config.coverCarousel;
  renderToolbar();
  // commit 会立刻重绘底栏/详情页按钮组，并按防抖把配置同步给后端
  commit();
  toast(
    state.config.coverCarousel
      ? `已开启封面轮播（每 ${Number(state.config.coverCarouselInterval) || 10} 秒换一张）`
      : "已关闭封面轮播",
    { duration: 1600 }
  );
}

/** 「写入歌曲文件」开关：直接改设置，之后的每次应用都按它执行 */
function toggleEmbed() {
  state.config.embedMeta = !state.config.embedMeta;
  renderToolbar();
  // 立刻落盘：这个开关决定了「这次应用会不会改写音乐文件」，不能停在防抖里
  commit();
  toast(
    state.config.embedMeta
      ? "之后的封面会写进歌曲文件本身"
      : "封面只保存在缓存目录（不改动音乐文件）",
    { duration: 2200 }
  );
}

async function resetCover() {
  status("正在清空…");
  try {
    const res = await backend.coverReset(songId);
    currentSet = { items: [], embedded: currentSet?.embedded || [], active: 0 };
    setCoverSet(songId, null);
    renderSet();
    notifyCoverChanged();
    status(res?.note || "已恢复原始封面");
  } catch (err) {
    status(`恢复失败：${err?.message ?? err}`);
  }
}

/* --------------------------------------------------------------------------
   小工具（弹层里直接拼 HTML，做一次最小转义）
   -------------------------------------------------------------------------- */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function escapeAttr(s) {
  return escapeHtml(s);
}
