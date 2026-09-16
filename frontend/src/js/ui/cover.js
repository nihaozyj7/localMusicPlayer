/* ==========================================================================
   ui/cover.js — 封面管理面板（Lit）
   --------------------------------------------------------------------------
   功能与 coverpanel.js 迁移前完全一致（联网搜索 / 本地图片 / 多选应用 /
   管理已有封面 / 轮播开关 / 写入歌曲文件开关），改动只在渲染方式：
     · 五个 renderXxx() 的 innerHTML 变成模板；
     · renderSet 里给「内嵌封面」单独挂监听的那段（迁移前只有 innerHTML
       才能这么写）变成普通的模板分支；
     · 勾选候选只更新那一张卡片与底部条，不再重建整个网格。
   ========================================================================== */

import { define, html, nothing, repeat, requestAppUpdate, icon } from "./base.js";
import { toast } from "./overlays.js";
import { backend, isWails } from "../bridge.js";
import { coverOfRaw } from "../utils.js";
import { commit, coverVersion, setCoverSet, state } from "../store.js";
import { notifyCoverChanged } from "../playerhost.js";
import { MpPanel } from "./panels.js";

class MpCoverLayer extends MpPanel {
  static deps = () => [
    coverPanelState.open,
    coverPanelState.songId,
    coverPanelState.rev,
    coverVersion(),
    state.config.coverCarousel,
    state.config.embedMeta,
  ];

  get open() {
    return coverPanelState.open;
  }

  get panelEl() {
    return this.querySelector("#cover-layer");
  }

  close() {
    closeCoverPanel();
  }

  render() {
    const song = this.song();
    return html`
      <div
        class="cover-layer"
        id="cover-layer"
        data-state="closed"
        hidden
        aria-label="封面管理"
        @click=${(e) => this.onClick(e)}
        @keydown=${(e) => this.onKey(e)}
      >
        <div class="cover-layer__panel" role="dialog" aria-modal="true" aria-label="封面管理">
          <div class="cover-layer__head">
            <svg class="cover-layer__icon" aria-hidden="true"><use href="#i-image"></use></svg>
            <span class="cover-layer__title">封面管理</span>
            <span class="u-spacer"></span>
            <button
              class="cover-layer__close"
              type="button"
              data-cover-close
              aria-label="关闭封面管理"
              @click=${() => closeCoverPanel()}
            >
              ${icon("close")}
            </button>
          </div>
          <div class="cover-layer__body" id="cover-layer-body">${song && this.open ? this.panel(song) : nothing}</div>
        </div>
      </div>
    `;
  }

  song() {
    const id = coverPanelState.songId;
    return id ? state.songs.find((x) => x.id === id) || null : null;
  }

  panel(song) {
    const s = coverPanelState;
    const raw = coverOfRaw(song);
    return html`
      <div class="cover-panel">
        <div class="cover-panel__current">
          <div class="cover-panel__frame" id="cover-current-frame">
            ${
              raw
                ? html`<img src=${raw} alt=${song.title} 原始封面 />`
                : html`<span class="cover-panel__none">${icon("music")}</span>`
            }
          </div>
          <div class="cover-panel__meta">
            <div class="cover-panel__title">${song.title}</div>
            <div class="cover-panel__sub">${song.artist}${song.album ? ` · ${song.album}` : ""}</div>
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
            <button
              class="btn btn--sm"
              type="button"
              data-cover-act="embed"
              id="cover-embed-btn"
              aria-pressed=${String(state.config.embedMeta === true)}
              data-tip=${
                state.config.embedMeta
                  ? "关闭后封面只存在缓存目录里"
                  : "打开后封面会写进歌曲文件本身（会修改音乐文件）"
              }
              @click=${() => this.toggleEmbed()}
            >
              ${icon("tag")}<span>写入歌曲文件</span>
            </button>
            <button
              class="btn btn--sm"
              type="button"
              data-cover-act="carousel"
              id="cover-carousel-btn"
              aria-pressed=${String(state.config.coverCarousel === true)}
              @click=${() => this.toggleCarousel()}
            >
              ${icon("slideshow")}<span>轮播</span>
            </button>
          </div>
          <div class="cover-set" id="cover-set">${this.setItems()}</div>
        </div>

        <div class="cover-panel__section">
          <div class="cover-panel__search">
            <input
              class="field"
              id="cover-keyword"
              type="text"
              placeholder="输入关键词（歌名 / 歌手 / 专辑都可以）"
              autocomplete="off"
              spellcheck="false"
              aria-label="封面搜索关键词"
              .value=${s.keyword || song.title || ""}
              @input=${(e) => {
                coverPanelState.keyword = e.target.value;
              }}
            />
            <button
              class="btn btn--primary btn--sm"
              type="button"
              data-cover-act="search"
              ?disabled=${s.busy}
              @click=${() => this.runSearch()}
            >
              ${icon("search")}<span>联网搜索</span>
            </button>
            <button class="btn btn--sm" type="button" data-cover-act="local" @click=${() => this.pickLocal()}>
              ${icon("image")}<span>选择本地图片</span>
            </button>
          </div>
          <div class="cover-panel__hint">
            下载来的文件常常没有标签，标题是从文件名推出来的，直接搜不容易命中；
            在这里填一个更准确的关键词会准很多。也可以直接选一张本地图片 ——
            两种结果都会出现在下面：联网搜索默认不勾选，本地图片默认已勾选， 确认后点「应用」。
          </div>
        </div>

        <div class="cover-panel__status" id="cover-status">${s.status}</div>
        <div class="cover-panel__grid" id="cover-grid">${this.cards()}</div>
        <div class="cover-panel__selectbar" id="cover-selectbar" ?hidden=${!s.candidates.length}>
          ${s.candidates.length ? this.selectbar() : nothing}
        </div>

        <div class="cover-panel__foot">
          <button
            class="btn btn--sm"
            type="button"
            data-cover-act="open-cache"
            @click=${() => backend.coverOpenCacheDir("covers")}
          >
            ${icon("folder")}<span>打开缓存目录</span>
          </button>
        </div>
      </div>
    `;
  }

  setItems() {
    const s = coverPanelState;
    const cached = s.currentSet?.items || [];
    const embedded = s.currentSet?.embedded || [];
    const active = Number(s.currentSet?.active) || 0;

    if (!cached.length && !embedded.length) {
      return html`<div class="cover-set__empty">还没有换过封面，这首歌现在用的是文件自带的封面。</div>`;
    }

    return html`
      ${cached.map(
        (c, i) => html`
          <div class="cover-set__item" data-set-index=${i} data-active=${String(i === active)}>
            <img src=${c.preview} alt="" />
            ${i === active ? html`<span class="cover-set__badge">当前</span>` : nothing}
            <div class="cover-set__ops">
              <button class="btn btn--xs" type="button" data-set-act="use" ?disabled=${i === active}>
                ${icon("check")}<span>设为当前</span>
              </button>
              <button class="btn btn--xs btn--danger" type="button" data-set-act="remove">
                ${icon("trash")}<span>删除</span>
              </button>
            </div>
          </div>
        `
      )}
      ${embedded.map(
        (item) => html`
          <div class="cover-set__item cover-set__item--embedded" data-embedded="1">
            <img src=${item?.preview || ""} alt="" />
            <span class="cover-set__badge cover-set__badge--ghost">文件内嵌</span>
            <div class="cover-set__ops">
              <button class="btn btn--xs" type="button" data-set-act="use" @click=${() => this.useEmbedded(item)}>
                ${icon("plus")}<span>收进缓存</span>
              </button>
            </div>
          </div>
        `
      )}
    `;
  }

  cards() {
    const s = coverPanelState;
    return repeat(
      s.candidates,
      (c) => c.preview,
      (c, i) => {
        const on = s.selected.has(c);
        return html`
          <button
            class="cover-card"
            type="button"
            role="checkbox"
            aria-checked=${String(on)}
            data-cover-act="toggle"
            data-cover-idx=${i}
            data-selected=${String(on)}
            @click=${() => this.toggleCandidate(i)}
          >
            <img src=${c.preview} alt="" loading="lazy" />
            <span class="cover-card__check">${icon("check")}</span>
            <span class="cover-card__meta">
              <span class="cover-card__provider">${c.provider || "来源"}</span>
              <span class="cover-card__score">
                ${c.width && c.height ? `${c.width}×${c.height}` : `匹配度 ${Number(c.score) || 0}`}
              </span>
            </span>
          </button>
        `;
      }
    );
  }

  selectbar() {
    const s = coverPanelState;
    const all = s.selected.size === s.candidates.length;
    return html`
      <span class="cover-panel__selectinfo">已选 ${s.selected.size} / ${s.candidates.length} 张</span>
      <span class="u-spacer"></span>
      <button class="btn btn--sm" type="button" data-cover-act="select-all" @click=${() => this.selectAll()}>
        ${icon("check")}<span>${all ? "取消全选" : "全选"}</span>
      </button>
      <button
        class="btn btn--primary btn--sm"
        type="button"
        data-cover-act="apply"
        ?disabled=${!s.selected.size}
        @click=${() => this.applySelected()}
      >
        ${icon("plus")}<span>应用${s.selected.size ? `（${s.selected.size}）` : ""}</span>
      </button>
    `;
  }

  /* ------------------------------------------------------------------------
     交互
     ------------------------------------------------------------------------ */
  onClick(e) {
    if (e.target.closest("[data-cover-close]") || e.target === this.panelEl) {
      closeCoverPanel();
      return;
    }
    const itemAct = e.target.closest("[data-set-act]");
    if (itemAct) {
      const idx = Number(itemAct.closest("[data-set-index]")?.dataset.setIndex);
      if (itemAct.dataset.setAct === "use") this.useExisting(idx);
      if (itemAct.dataset.setAct === "remove") this.removeExisting(idx);
    }
  }

  onKey(e) {
    if (e.key !== "Escape") return;
    // Esc：搜索框有内容时先清输入，否则关面板
    const input = this.querySelector("#cover-keyword");
    if (input && document.activeElement === input && input.value.trim()) {
      coverPanelState.keyword = "";
      input.value = "";
      return;
    }
    closeCoverPanel();
  }

  toggleCandidate(index) {
    const item = coverPanelState.candidates[index];
    if (!item) return;
    if (coverPanelState.selected.has(item)) coverPanelState.selected.delete(item);
    else coverPanelState.selected.add(item);
    bumpCoverPanel();
  }

  selectAll() {
    const s = coverPanelState;
    if (s.selected.size === s.candidates.length) s.selected.clear();
    else s.candidates.forEach((c) => s.selected.add(c));
    bumpCoverPanel();
  }

  async runSearch() {
    const s = coverPanelState;
    if (s.busy) return;
    if (!isWails()) {
      setCoverStatus("浏览器预览下没有联网封面后端，请在应用里试");
      return;
    }
    s.busy = true;
    // 本地选的图是用户明确挑的，搜索只是「再找几张」，不该把它冲掉
    const locals = s.candidates.filter((c) => c.local);
    s.candidates = [...locals];
    s.selected = new Set(locals);
    bumpCoverPanel();
    const keyword = (this.querySelector("#cover-keyword")?.value || "").trim();
    setCoverStatus(
      keyword
        ? `正在按「${keyword}」同时查询多个来源（${providerLabel()}）…`
        : `正在同时查询多个来源（${providerLabel()}）…`
    );
    try {
      const override = keyword ? { keyword } : {};
      const list = await backend.coverLookupSongAll(s.songId, override);
      const arr = Array.isArray(list) ? list.filter((c) => c?.ok && c.preview) : [];
      if (arr.length) {
        // 搜索回来的**默认全不选**：一次列出很多张，替用户全选容易误加一堆噪声图
        s.candidates = [...locals, ...arr.map((c) => ({ ...c, local: false }))];
        const providers = [...new Set(arr.map((c) => c.provider).filter(Boolean))];
        setCoverStatus(`找到 ${arr.length} 张（来源：${providers.join(" / ") || "未知"}），勾选后点「应用」`);
      } else {
        s.candidates = [...locals];
        const msg = Array.isArray(list) ? list.find((c) => c?.message)?.message : "";
        setCoverStatus(msg || "没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）");
      }
    } catch (err) {
      setCoverStatus(`搜索失败：${err?.message ?? err}`);
    } finally {
      s.busy = false;
      bumpCoverPanel();
    }
  }

  /**
   * 选择本地图片。
   *
   * 后端弹系统文件选择器、读文件、体检，然后把图片给成 data URL ——
   * 前端拿到的东西与联网候选**结构完全一样**，所以直接塞进候选列表即可。
   * 默认勾选（这是用户刚刚亲手挑的图），与搜索结果的「默认全不选」相反。
   */
  async pickLocal() {
    const s = coverPanelState;
    if (!isWails()) {
      setCoverStatus("浏览器预览下没有系统文件选择器，请在应用里试");
      return;
    }
    setCoverStatus("正在读取图片…");
    try {
      const res = await backend.coverPickLocal();
      if (!res || res.cancelled) {
        setCoverStatus(""); // 用户取消：不打扰，只把「正在读取」清掉
        return;
      }
      if (!res.ok || !res.preview) {
        setCoverStatus(res?.message || "这张图片没法用作封面");
        return;
      }
      const item = {
        preview: res.preview,
        provider: res.provider || "本地图片",
        source: res.source || "",
        width: res.width,
        height: res.height,
        local: true,
      };
      // 插到最前面：刚挑的图要立刻可见，而不是被一屏搜索结果挤到下面
      s.candidates.unshift(item);
      s.selected.add(item);
      bumpCoverPanel();
      setCoverStatus(`已加入本地图片${res.source ? `（${res.source}）` : ""}，确认后点「应用」`);
    } catch (err) {
      setCoverStatus(`选择图片失败：${err?.message ?? err}`);
    }
  }

  /** 应用勾选的候选：一次性加入封面集合并立刻写入 */
  async applySelected() {
    const previews = coverPanelState.candidates
      .filter((c) => coverPanelState.selected.has(c))
      .map((c) => c.preview)
      .filter(Boolean);
    if (!previews.length) {
      setCoverStatus("先勾选至少一张封面");
      return;
    }
    await this.writeCovers(() =>
      backend.coverAddMany(coverPanelState.songId, previews, state.config.embedMeta === true)
    );
  }

  /** 把已有的某张设为当前生效 */
  async useExisting(index) {
    if (!Number.isFinite(index)) return;
    await this.writeCovers(() => backend.coverSetActive(coverPanelState.songId, index));
  }

  /** 把「文件内嵌」的一张收进缓存（之后可以轮播 / 排序 / 删除） */
  async useEmbedded(item) {
    if (!item?.preview) return;
    await this.writeCovers(() =>
      backend.coverAdd(coverPanelState.songId, "", item.preview, state.config.embedMeta === true)
    );
  }

  async removeExisting(index) {
    if (!Number.isFinite(index)) return;
    await this.writeCovers(() => backend.coverRemove(coverPanelState.songId, index));
  }

  /**
   * 统一的「写封面」收口。
   *
   * 三个要点（都是踩过的坑）：
   *  1. 后端返回的是新的封面集合，**以后端为准**覆盖本地状态 ——
   *     前端自己猜下标会在删除/排序后错位；
   *  2. 写完立刻通知播放详情页（不必等下一帧）；
   *  3. 在线试听曲目没有本地文件，后端会报错，这里把消息显示出来即可。
   */
  async writeCovers(action) {
    const s = coverPanelState;
    if (!isWails()) {
      setCoverStatus("浏览器预览下没有封面后端，请在应用里试");
      return;
    }
    setCoverStatus("正在保存…");
    try {
      const set = await action();
      if (set && Array.isArray(set.items)) {
        s.currentSet = set;
        setCoverSet(s.songId, set);
      }
      setCoverStatus(set?.message || "已更新封面");
      notifyCoverChanged();
      toast(set?.message || "封面已更新", { tone: "success", duration: 1800 });
    } catch (err) {
      setCoverStatus(`保存失败：${err?.message ?? err}`);
    }
  }

  /** 轮播开关（与详情页头部按钮组里的开关是同一份状态） */
  toggleCarousel() {
    state.config.coverCarousel = !state.config.coverCarousel;
    commit();
    toast(
      state.config.coverCarousel
        ? `已开启封面轮播（每 ${Number(state.config.coverCarouselInterval) || 10} 秒换一张）`
        : "已关闭封面轮播",
      { duration: 1600 }
    );
  }

  /** 「写入歌曲文件」开关：直接改设置，之后的每次应用都按它执行 */
  toggleEmbed() {
    state.config.embedMeta = !state.config.embedMeta;
    // 立刻落盘：这个开关决定了「这次应用会不会改写音乐文件」，不能停在防抖里
    commit();
    toast(state.config.embedMeta ? "之后的封面会写进歌曲文件本身" : "封面只保存在缓存目录（不改动音乐文件）", {
      duration: 2200,
    });
  }

  async refreshSet() {
    const s = coverPanelState;
    if (!isWails() || !s.songId) return;
    try {
      const set = await backend.coverList(s.songId);
      if (set && Array.isArray(set.items)) {
        s.currentSet = set;
        setCoverSet(s.songId, set);
        notifyCoverChanged();
      }
    } catch (err) {
      setCoverStatus(`读取现有封面失败：${err?.message ?? err}`);
    }
  }
}

define("mp-cover-layer", MpCoverLayer);

/* ==========================================================================
   模块级状态 + 对外命令（与迁移前 coverpanel.js 的 API 一致）
   ========================================================================== */
const coverPanelState = {
  open: false,
  songId: "",
  candidates: [],
  selected: new Set(),
  currentSet: null,
  busy: false,
  status: "",
  keyword: "",
  rev: 0,
};

function bumpCoverPanel() {
  coverPanelState.rev += 1;
  // 封面候选是模块级状态（不在 store 里）：广播一次让组件重绘
  requestAppUpdate();
}

function setCoverStatus(text) {
  coverPanelState.status = text || "";
  bumpCoverPanel();
}

const component = () => document.querySelector("mp-cover-layer");

/** 提示文案里的来源列表 */
function providerLabel() {
  const list = state.coverProviders || [];
  return list.length ? list.join(" / ") : "iTunes / 网易云 / QQ 音乐 / Deezer / MusicBrainz";
}

export function openCoverPanel(id) {
  const song = state.songs.find((s) => s.id === id);
  if (!song) {
    toast("这首歌不在本地曲库里，无法更换封面", { tone: "warning" });
    return;
  }
  Object.assign(coverPanelState, {
    open: true,
    songId: id,
    candidates: [],
    selected: new Set(),
    currentSet: state.coverSets.get(id) || null,
    status: "",
    keyword: "",
  });
  bumpCoverPanel();
  // 后端才是封面集合的真相来源（可能有文件内嵌的多张），打开时拉一次
  const el = component();
  el?.refreshSet();
  ensureProviders();
}

export function closeCoverPanel() {
  coverPanelState.open = false;
  bumpCoverPanel();
}

/** 拉一次后端注册的封面来源，避免提示里写死来源名 */
async function ensureProviders() {
  if (state.coverProviders?.length || !isWails()) return;
  try {
    const res = await backend.coverProviders();
    if (Array.isArray(res?.providers) && res.providers.length) {
      state.coverProviders = res.providers;
      bumpCoverPanel();
    }
  } catch {
    /* 只是提示文案，拿不到就算了 */
  }
}

export { coverPanelState };
export const _internals = { providerLabel };
