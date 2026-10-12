// @ts-check
/* ==========================================================================
   ui/packstore.js — 「添加自定义主题 / 播放界面样式」的分页弹层
   --------------------------------------------------------------------------
   两个 tab（书写顺序 = 显示顺序）：

     · 从本地导入 —— 保留原来那套「复制 AI 提示词 + 选择文件夹导入」的引导，
       是**第一个 tab，也是打开弹层时的默认页**；
     · 从仓库获取 —— 读远端的 plugins/<kind>/index.json（见 internal/packstore），
       列出仓库里有什么，带「安装 / 更新 / 已安装」状态，点一下装到本机。

   为什么要把原来的引导弹层改成两个 tab：加进仓库获取之后，「自己要一个」与
   「去仓库拿一个」是并列的两件事，平铺在一屏里会互相稀释。
   为什么本地导入排第一：它是**离线也成立**的路径（断网、仓库地址不可达、自建插件
   都不受影响），仓库获取是需要联网的可选增强，不该排在必选路径前面。

   为什么组件自己管状态，而不放进 store：
     这些状态（远端清单、正在装哪一个、地址草稿）只在这个弹层活着的时候有意义，
     关掉就该消失。放进 store 会污染全局状态与持久化，还得逐个字段回答
     「重启后应该是什么」。组件与全局状态的关系只有**读**：列表里的「已安装」
     直接查 theme.js / playerhost.js 的注册表。

   ⚠️ 这里渲染的颜色来自网络（清单里的 swatch 数组），一律不进行内联 style：
     走 CSSOM 生成 [data-packswatch="i"]{background:…}（与主题色卡同一套做法），
     并且**只接受解析得出来的颜色字面量** —— 一份被塞了
     `red} .foo { display:none` 的清单不该有机会改到界面。见 safeColor。

   术语对照：这里的 kind 是 "theme" | "style"（与仓库目录、后端一致）；
   而「从本地导入」按钮带的 data-import 仍是老的 "theme" | "skin"
   （那是 settings.js#importPack 的动作名，两者互不相干，不要顺手统一）。
   ========================================================================== */

import { html, nothing, MpElement, define, icon } from "./base.js";
import { openModal, toast } from "./overlays.js";
import { backend } from "../bridge.js";
import { replaceStyleRules } from "../runtime-tokens.js";
import { discoverThemes, listThemes } from "../theme.js";
import { availableSkins, reloadSkins } from "../playerhost.js";

/**
 * 远端清单里的一个条目。
 * 字段与 Go 侧 packstore.Item 的 json tag 一一对应（见 internal/packstore）。
 * @typedef {{id?:string, dir?:string, name?:string, version?:string, author?:string,
 *            description?:string, mode?:string, apiVersion?:string,
 *            swatch?:string[], files?:unknown[]}} PackItem
 */

/* --------------------------------------------------------------------------
   色板：只接受能确定是颜色的字面量
   -------------------------------------------------------------------------- */

/** `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` */
const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** `rgb()/rgba()/hsl()/hsla()`，括号内只允许数字、逗号、点、百分号、斜杠、空格 */
const FUNC_RE = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/]+\)$/i;

/**
 * 把清单里的颜色值收敛成一个可以安全写进 CSS 的值。
 *
 * 这不是「校验清单」而是**防注入**：值会经 CSSOM insertRule 变成
 * `[data-packswatch="0"]{background:<值>}`，一个带 `}` 的花括号就能跳出这条规则、
 * 往页面里插任意声明（例如把某个面板藏掉或者盖住按钮）。
 * 认不出来的值一律丢掉 —— 少画一个色块，好过页面被远端数据改写。
 */
function safeColor(v) {
  const s = String(v ?? "").trim();
  return HEX_RE.test(s) || FUNC_RE.test(s) ? s : "";
}

/**
 * 给一批条目的色板生成 CSS 规则，返回「条目 → 色块下标数组」的映射。
 *
 * 与 settings.js#ensureSwatchStyles 同一套做法（那边只认本机主题的颜色，
 * 这边认远端清单的颜色，所以不能共用一份表 —— 共用会让两边互相覆盖规则）。
 */
function makeSwatchIndex(items) {
  const colors = [];
  for (const it of items) {
    for (const raw of it?.swatch || []) {
      const c = safeColor(raw);
      if (c && !colors.includes(c)) colors.push(c);
    }
  }
  replaceStyleRules(
    "packstore-swatches",
    colors.map((c, i) => `[data-packswatch="${i}"]{background:${c}}`).join("\n")
  );
  return (item) =>
    (item?.swatch || [])
      .map(safeColor)
      .filter(Boolean)
      .map((c) => colors.indexOf(c));
}

/* --------------------------------------------------------------------------
   组件
   -------------------------------------------------------------------------- */

class MpPackStore extends MpElement {
  /** 只依赖自己：store 的变化不触发重渲染（跨模块的刷新由调用方显式驱动） */
  static deps() {
    return [];
  }

  constructor() {
    super();
    /** @type {"theme"|"style"} */
    this.kind = "theme";
    /**
     * 「从本地导入」那一页的内容，由调用方（settings.js）组装后传进来
     * @type {unknown}
     */
    this.localBody = nothing;
    /** 装完之后通知调用方（设置卡片要重画） @type {null | (() => void)} */
    this.onChanged = null;

    this._tab = "local";
    /** idle | preview | loading | ok | error */
    this._status = "idle";
    /** @type {PackItem[]} */
    this._items = [];
    /** 清单色板 → 色块下标（见 makeSwatchIndex） @type {(item:PackItem)=>number[]} */
    this._swatchIndex = () => [];
    this._cached = false;
    this._stale = "";
    this._error = "";
    this._busy = "";
    this._source = { source: "", default: "", channel: "" };
    this._editing = false;
    this._draft = "";
  }

  /**
   * 打开这个弹层的这一份内容。
   * @param {{kind:"theme"|"style", localBody:unknown, onChanged?:()=>void}} opts
   */
  open(opts) {
    this.kind = opts.kind === "style" ? "style" : "theme";
    this.localBody = opts.localBody ?? nothing;
    this.onChanged = opts.onChanged ?? null;
    // 默认停在「从本地导入」：它不依赖网络，是这个弹层里唯一永远可用的那页
    this._tab = "local";
    // 仓库清单不在这里拉：用户可能根本不去第二页，见 _ensureRepo
    this._status = "idle";
  }

  /* ------------------------------------------------------------------------
     数据
     ------------------------------------------------------------------------ */

  get _kindLabel() {
    return this.kind === "style" ? "样式包" : "主题";
  }

  /**
   * 首次切到「从仓库获取」时才拉清单。
   *
   * 默认页是「从本地导入」，而拉清单要联网、要等后端 —— 用户只是来导入一个
   * 本地文件时，不该替他发这次请求。切到第二页才取，失败也只在那一页里显示。
   */
  _ensureRepo() {
    if (this._status !== "idle") return;
    void this._loadSource();
    void this.load(false);
  }

  /**
   * 能不能改仓库地址。
   *
   * 判据是「后端答过话」，而不是 `isWails()`：改地址要落盘，没有后端就没有意义；
   * 而「后端答过话」这件事本身就是后端存在的证据，还能顺带让浏览器预览里的
   * 自检脚本用同样的路径验证这段交互。
   */
  get _canEditSource() {
    return this._status === "ok" || this._status === "error";
  }

  async _loadSource() {
    try {
      const res = await backend.packSource();
      if (res) {
        this._source = {
          source: String(res.source || ""),
          default: String(res.default || ""),
          channel: String(res.channel || ""),
          // 用户填的地址不会被使用时的原因（后端算的，规则只有一份）。
          // 不显示的话，「地址被落回默认」看起来就像「没保存成功」。
          problem: String(res.problem || ""),
        };
        this._draft = this._source.source;
        this.requestUpdate();
      }
    } catch (err) {
      console.warn("[packstore] 读取插件仓库地址失败", err);
    }
  }

  /**
   * 取清单。
   *
   * 「有没有后端」不靠 `isWails()` 猜，而是直接看后端有没有回话：
   * 浏览器预览、后端刚起来还没注册好，都会走到同一个提示态，
   * 而用户点一下「刷新」就能重试 —— 比开面板时就认定「没后端」更耐用。
   *
   * @param {boolean} refresh 用户点了刷新（绕过后端的内存缓存）
   */
  async load(refresh) {
    this._status = "loading";
    this._error = "";
    this.requestUpdate();

    void this._loadSource();
    try {
      const res = await backend.packCatalog(this.kind, refresh === true);
      if (!res) {
        this._status = "preview";
        this.requestUpdate();
        return;
      }
      this._items = Array.isArray(res.items) ? res.items : [];
      this._swatchIndex = makeSwatchIndex(this._items);
      this._cached = res.cached === true;
      this._stale = String(res.staleReason || "");
      this._status = "ok";
    } catch (err) {
      this._error = err?.message || String(err);
      // 这次没取到清单，上一次那份「本机缓存」的提示也就不作数了
      this._cached = false;
      this._stale = "";
      this._status = "error";
    }
    this.requestUpdate();
  }

  /** 本机已有的 id 集合（从各注册表读，与列表卡片用的是同一份数据） */
  _installedIds() {
    const list = this.kind === "style" ? availableSkins() : listThemes();
    return new Set(list.map((x) => x.id));
  }

  /** 本机那个条目的版本号（主题清单没写版本，返回空串表示「不知道」） */
  _localVersion(id) {
    if (this.kind !== "style") return "";
    const hit = availableSkins().find((s) => s.id === id);
    return String(hit?.version || "");
  }

  /* ------------------------------------------------------------------------
     动作
     ------------------------------------------------------------------------ */

  /**
   * 装一个条目。
   * @param {PackItem} item
   */
  async install(item) {
    if (this._busy) return;
    const id = String(item?.id || "");
    if (!id) return;
    this._busy = id;
    this.requestUpdate();

    const progress = toast(`正在安装「${item.name || id}」…`, { duration: 0 });
    try {
      const res = await backend.packInstall(this.kind, id);
      progress.close();
      // 重扫本机注册表：列表里的「已安装」状态要立刻跟着变
      await this._refreshLocal();
      const name = item.name || id;
      const backups = Array.isArray(res?.backups) ? res.backups.length : 0;
      toast(`已安装「${name}」${backups ? `（有 ${backups} 个原文件备份成了 .bak）` : ""}`, {
        tone: "success",
        duration: 4200,
      });
    } catch (err) {
      progress.close();
      toast(`安装失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
    }
    this._busy = "";
    this.requestUpdate();
  }

  async _refreshLocal() {
    try {
      if (this.kind === "style") await reloadSkins();
      else await discoverThemes();
    } catch (err) {
      console.warn("[packstore] 重扫本机插件失败（安装结果不受影响）", err);
    }
    this.onChanged?.();
  }

  _startEdit() {
    this._editing = true;
    this._draft = this._source.source;
    this.requestUpdate();
    void this.updateComplete.then(() => this.$(".packsrc__input")?.focus());
  }

  /** 地址输入框只在按键时记录草稿：不 requestUpdate，避免每敲一个字都重渲染 */
  _onSrcInput(e) {
    this._draft = String(e.target.value ?? "");
  }

  _cancelEdit() {
    this._editing = false;
    this.requestUpdate();
  }

  /** 地址输入框里的按键：Enter 保存、Esc 退出编辑，都不要冒泡到弹层 */
  _onSrcKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void this._saveSource();
      return;
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      this._editing = false;
      this.requestUpdate();
    }
  }

  async _saveSource() {
    const next = this._draft.trim();
    try {
      const res = await backend.packSetSource(next);
      if (res) {
        this._source = {
          source: String(res.source || ""),
          default: String(res.default || ""),
          channel: String(res.channel || ""),
          problem: String(res.problem || ""),
        };
      }
      this._editing = false;
      this.requestUpdate();
      // 地址不被接受时（后端已落回默认地址）用错误色说清原因，而不是
      // 报一句「已指向 <默认地址>」让用户以为保存成功了。
      if (this._source.problem) {
        toast(this._source.problem, { tone: "error", duration: 7000 });
      } else {
        toast(`插件仓库已指向 ${this._source.source}`, { tone: "success", duration: 3600 });
      }
      // 换地址等于换了一份仓库，旧的列表已经不作数
      this._items = [];
      this._status = "loading";
      void this.load(true);
    } catch (err) {
      toast(`保存失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
    }
  }

  /* ------------------------------------------------------------------------
     渲染
     ------------------------------------------------------------------------ */

  render() {
    return html` <div class="packdlg">
      <div class="packtabs" role="tablist">
        ${this._tabButton("local", "从本地导入")} ${this._tabButton("repo", "从仓库获取")}
      </div>
      ${this._tab === "repo" ? this._repoPanel() : this.localBody}
    </div>`;
  }

  _tabButton(id, label) {
    const active = this._tab === id;
    return html`<button
      class="packtab"
      type="button"
      role="tab"
      data-tab=${id}
      data-active=${String(active)}
      aria-selected=${String(active)}
      @click=${() => {
        this._tab = id;
        if (id === "repo") this._ensureRepo();
        this.requestUpdate();
      }}
    >
      ${label}
    </button>`;
  }

  _repoPanel() {
    return html`
      <div class="packsrc">
        <span class="packsrc__label">来源</span>
        ${
          this._editing
            ? html`<input
                  class="input packsrc__input"
                  type="text"
                  .value=${this._draft}
                  placeholder="https://raw.githubusercontent.com/<owner>/<repo>/<branch>/plugins"
                  @input=${(e) => this._onSrcInput(e)}
                  @keydown=${(e) => this._onSrcKey(e)}
                />
                <button class="btn btn--sm btn--primary" type="button" @click=${() => this._saveSource()}>
                  保存
                </button>
                <button class="btn btn--sm" type="button" @click=${() => this._cancelEdit()}>取消</button>`
            : html`<span class="packsrc__url" title=${this._source.source}
                  >${this._source.source || "（默认地址）"}</span
                >
                ${
                  this._canEditSource
                    ? html`<button class="btn btn--sm" type="button" @click=${() => this._startEdit()}>修改</button>`
                    : nothing
                }`
        }
        <button
          class="btn btn--sm"
          type="button"
          ?disabled=${this._status === "loading"}
          @click=${() => this.load(true)}
        >
          ${icon("refresh")}<span>刷新</span>
        </button>
      </div>

      ${
        this._source.problem
          ? html`<div class="packnote" data-tone="warn" role="alert">
              ${this._source.problem}（明文 http 取回的脚本会在同源页面里执行，链路上任何一跳都能改写它）
            </div>`
          : nothing
      }
      ${
        this._status === "preview"
          ? html`<div class="packnote" data-tone="warn">
              拿不到仓库清单：没有后端（浏览器预览），或者后端还没就绪。请在播放器里打开这个面板，或点「刷新」重试。
            </div>`
          : nothing
      }
      ${
        this._cached
          ? html`<div class="packnote" data-tone="warn">
              <b>这是本机缓存的清单</b>，刚才没能连上仓库：${this._stale}
            </div>`
          : nothing
      }
      ${
        this._status === "error"
          ? html`<div class="packnote" data-tone="error">获取清单失败：${this._error}</div>`
          : nothing
      }
      ${this._status === "loading" ? html`<div class="packnote">正在获取清单…</div>` : nothing}
      ${this._status === "ok" ? this._list() : nothing}
    `;
  }

  _list() {
    if (!this._items.length) {
      return html`<div class="packnote">仓库里还没有${this._kindLabel}。</div>`;
    }
    const installed = this._installedIds();
    return html` <div class="packlist">${this._items.map((it) => this._item(it, installed))}</div>`;
  }

  /**
   * @param {PackItem} item
   * @param {Set<string>} installed
   */
  _item(item, installed) {
    const id = String(item?.id || "");
    const has = installed.has(id);
    const localVersion = has ? this._localVersion(id) : "";
    const remoteVersion = String(item?.version || "");
    const canUpdate = has && remoteVersion && localVersion && remoteVersion !== localVersion;
    const busy = this._busy === id;
    const primary = !has || canUpdate;
    const files = Array.isArray(item?.files) ? item.files.length : 0;

    return html` <div class="packitem">
      <div class="packitem__main">
        <div class="packitem__name">
          <span>${item?.name || id}</span>
          ${remoteVersion ? html`<span class="packitem__ver">v${remoteVersion}</span>` : nothing}
          ${has ? html`<span class="packitem__badge">已安装</span>` : nothing}
        </div>
        <div class="packitem__meta">
          ${item?.author ? html`<span>${item.author}</span>` : nothing}
          <span>${files} 个文件</span>
          ${
            item?.mode === "light" || item?.mode === "dark"
              ? html`<span>${item.mode === "light" ? "浅色" : "深色"}</span>`
              : nothing
          }
        </div>
        ${item?.description ? html`<div class="packitem__desc">${item.description}</div>` : nothing}
        <div class="packitem__swatch">${this._swatchIndex(item).map((i) => html`<i data-packswatch=${i}></i>`)}</div>
      </div>
      <div class="packitem__side">
        <button
          class=${primary ? "btn btn--sm btn--primary" : "btn btn--sm"}
          type="button"
          data-id=${id}
          ?disabled=${busy || Boolean(this._busy)}
          @click=${() => this.install(item)}
        >
          ${busy ? "安装中…" : canUpdate ? "更新" : has ? "重新安装" : "安装"}
        </button>
      </div>
    </div>`;
  }
}

define("mp-pack-store", MpPackStore);

/* --------------------------------------------------------------------------
   对外入口
   -------------------------------------------------------------------------- */

/**
 * 打开「添加自定义主题 / 播放界面样式」分页弹层。
 *
 * 返回 openModal 的句柄；调用方（settings.js）拿到 root 之后还要绑
 * 「从本地导入」那一页里的 [data-copy-prompt] / [data-import] 两个动作。
 *
 * @param {{kind:"theme"|"style", title:string, localBody:unknown, onChanged?:()=>void}} opts
 * @returns {{close:()=>void, root:Element}}
 */
export function openPackDialog(opts) {
  const modal = openModal({
    title: opts.title,
    body: html`<mp-pack-store></mp-pack-store>`,
    okText: "关闭",
    onOk: () => true,
  });
  // 内容比确认框多得多：加宽 + 内容区自己滚 + 只留一个「关闭」按钮
  modal.root.classList.add("modal--wide", "modal--scroll", "modal--single");

  const el = /** @type {any} */ (modal.root.querySelector("mp-pack-store"));
  el?.open({ kind: opts.kind, localBody: opts.localBody, onChanged: opts.onChanged });
  return modal;
}
