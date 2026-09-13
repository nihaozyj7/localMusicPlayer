/* ==========================================================================
   coverpanel.js — 封面搜索弹层
   --------------------------------------------------------------------------
   入口（需求）：
     · 播放详情页「返回」按钮右边新增一个封面按钮；
     · 每首歌的「更多」菜单里也有「更换封面…」。
   面板里可以：
     · 联网搜索这首歌的封面（后端多来源聚合，见 internal/coverfetch）；
     · 粘贴一个图片地址；
     · 恢复原始封面。
   选中的封面会写进缓存目录；是否同时写进歌曲文件由设置里的
   「把封面/歌词写进歌曲文件」决定（默认关闭）。

   为什么封面要经过后端：
     页面 CSP 是 img-src 'self'，第三方图片直连会被浏览器拒绝；
     而且多数图床校验 Referer。后端 /online/cover 做同源代理。
     这里展示的预览图是后端下载后回传的 data URL，同样不涉及跨源。
   ========================================================================== */

import { icon, toast } from "./dom.js";
import { backend, isWails } from "./bridge.js";
import { coverOfRaw } from "./utils.js";
import { setCoverOverride, state } from "./store.js";

let built = false;
let layer = null;
let bodyEl = null;
let songId = null;
let candidates = [];
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
    const act = e.target.closest("[data-cover-act]")?.dataset.coverAct;
    if (!act) return;
    if (act === "search") runSearch();
    if (act === "url") applyURL();
    if (act === "reset") resetCover();
    if (act === "pick") pickCandidate(Number(e.target.closest("[data-cover-idx]")?.dataset.coverIdx));
    if (act === "apply-preview") applyPreview();
  });

  layer.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // Esc：输入框有内容时先清输入，否则关面板
    const input = layer.querySelector("#cover-url");
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
  const song = state.songs.find((s) => s.id === id);
  if (!song) {
    toast("这首歌不在本地曲库里，无法更换封面", { tone: "warning" });
    return;
  }
  render(song);
  layer.hidden = false;
  requestAnimationFrame(() => layer.setAttribute("data-state", "opened"));
}

export function closeCoverPanel() {
  if (!layer) return;
  layer.setAttribute("data-state", "closed");
  setTimeout(() => {
    if (layer.getAttribute("data-state") === "closed") layer.hidden = true;
  }, 200);
}

/* --------------------------------------------------------------------------
   渲染
   -------------------------------------------------------------------------- */
function render(song) {
  const override = state.coverOverrides.get(songId);
  const current = override || coverOfRaw(song);

  bodyEl.innerHTML = `
    <div class="cover-panel">
      <div class="cover-panel__current">
        <div class="cover-panel__frame">
          ${
            current
              ? `<img src="${current}" alt="${escapeAttr(song.title)} 封面" />`
              : `<span class="cover-panel__none">${icon("music")}</span>`
          }
        </div>
        <div class="cover-panel__meta">
          <div class="cover-panel__title">${escapeHtml(song.title)}</div>
          <div class="cover-panel__sub">${escapeHtml(song.artist)}${
            song.album ? ` · ${escapeHtml(song.album)}` : ""
          }</div>
          <div class="cover-panel__hint">
            封面保存在缓存目录里；是否写进歌曲文件由设置里的
            「把封面/歌词写进歌曲文件」决定。
          </div>
          <div class="cover-panel__row">
            <button class="btn btn--primary btn--sm" type="button" data-cover-act="search"
              ${busy ? "disabled" : ""}>${icon("search")}<span>联网搜索封面</span></button>
            <button class="btn btn--sm" type="button" data-cover-act="reset">${icon("refresh")}<span>恢复原始封面</span></button>
          </div>
        </div>
      </div>

      <div class="cover-panel__url">
        <input class="field" id="cover-url" type="text" placeholder="或粘贴一个图片地址（https://…）"
          autocomplete="off" spellcheck="false" aria-label="图片地址" />
        <button class="btn btn--sm" type="button" data-cover-act="url">${icon("file")}<span>使用这个地址</span></button>
      </div>

      <details class="cover-panel__advanced">
        <summary>按别的关键词搜索</summary>
        <div class="cover-panel__fields">
          <input class="field" id="cover-title" type="text" value="${escapeAttr(song.title || "")}"
            placeholder="歌曲名" aria-label="搜索用的歌曲名" />
          <input class="field" id="cover-artist" type="text" value="${escapeAttr(song.artist || "")}"
            placeholder="歌手" aria-label="搜索用的歌手" />
          <input class="field" id="cover-album" type="text" value="${escapeAttr(song.album || "")}"
            placeholder="专辑" aria-label="搜索用的专辑" />
        </div>
        <div class="cover-panel__hint">
          下载下来的文件往往没有标签，标题是从文件名推出来的，直接搜不容易命中，
          在这里填上正确的歌曲名/歌手再搜会准很多。
        </div>
      </details>

      <div class="cover-panel__status" id="cover-status"></div>
      <div class="cover-panel__grid" id="cover-grid"></div>
    </div>`;
}

function status(text) {
  const node = bodyEl?.querySelector("#cover-status");
  if (node) node.textContent = text || "";
}

function readField(id) {
  return (bodyEl?.querySelector(`#${id}`)?.value || "").trim();
}

function renderCandidates() {
  const grid = bodyEl?.querySelector("#cover-grid");
  if (!grid) return;
  if (!candidates.length) {
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = candidates
    .map(
      (c, i) => `
      <button class="cover-card" type="button" data-cover-act="pick" data-cover-idx="${i}">
        <img src="${c.preview}" alt="" loading="lazy" />
        <span class="cover-card__meta">
          <span class="cover-card__provider">${escapeHtml(c.provider || "来源")}</span>
          <span class="cover-card__score">匹配度 ${Number(c.score) || 0}</span>
        </span>
      </button>`
    )
    .join("");
}

/* --------------------------------------------------------------------------
   动作
   -------------------------------------------------------------------------- */
async function runSearch() {
  if (busy) return;
  if (!isWails()) {
    status("浏览器预览下没有联网封面后端，请在应用里试");
    return;
  }
  busy = true;
  candidates = [];
  renderCandidates();
  status("正在联网搜索封面…");
  try {
    // 高级区里的关键词优先：下载来的文件没有标签，用户填的关键词更准
    const override = {
      title: readField("cover-title"),
      artist: readField("cover-artist"),
      album: readField("cover-album"),
    };
    const res = await backend.coverLookupSong(songId, override);
    if (res?.ok && res.preview) {
      candidates = [res];
      status(`找到 1 张（来源 ${res.provider || "未知"}，匹配度 ${res.score || 0}）`);
    } else {
      status(res?.message || "没有找到匹配的封面");
    }
  } catch (err) {
    status(`搜索失败：${err?.message ?? err}`);
  } finally {
    busy = false;
    renderCandidates();
  }
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
    await applyCover(url, fetched.preview);
  } catch (err) {
    status(`取图失败：${err?.message ?? err}`);
  }
}

async function pickCandidate(index) {
  const c = candidates[index];
  if (!c) return;
  await applyCover(c.source || "", c.preview);
}

async function applyPreview() {
  const override = state.coverOverrides.get(songId);
  if (!override) return;
  await applyCover("", override);
}

async function applyCover(imageURL, preview) {
  status("正在保存…");
  try {
    // 把「是否写进文件」显式传过去（见 bridge.js 的说明：设置是防抖同步的）
    const res = await backend.coverApply(songId, imageURL, preview || "", state.config.embedMeta === true);
    if (!res?.ok && !res?.preview) {
      status(res?.message || "保存失败");
      return;
    }
    // 立刻在界面上生效：写进内存覆盖表，然后重绘
    setCoverOverride(songId, res.preview || preview);
    status(res.message || "封面已更新");
    toast("封面已更新", { tone: "success", duration: 1800 });
  } catch (err) {
    status(`保存失败：${err?.message ?? err}`);
  }
}

async function resetCover() {
  status("正在恢复…");
  try {
    const res = await backend.coverReset(songId);
    setCoverOverride(songId, "");
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
