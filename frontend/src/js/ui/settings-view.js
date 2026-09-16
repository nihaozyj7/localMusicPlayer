/* ==========================================================================
   ui/settings-view.js — 设置层（Lit）
   --------------------------------------------------------------------------
   迁移前后对比：

     迁移前                                     迁移后
     ────────────────────────────────────────   ─────────────────────────────
     10 个 xxxCard() 返回 HTML 字符串           10 个返回 Lit 模板的方法
     renderSettings() 整块 innerHTML 重建       组件按依赖数组增量更新
     点任何开关 → 重建 2600 行 + 重绑滑杆       只更新变化的那几个 part
     靠 refreshSettingsLayer 手工恢复           滚动位置 / 焦点 / 输入框天然保留
     scrollTop / 当前分区 / 焦点元素
     「就地刷新」靠 querySelector 找那处文案    模板表达式直接从 state 推导

   事件仍然是委托（迁移前就挂在层自己身上），动作逻辑照旧调用
   settings.js#handleSettingControl / handleSettingsAction —— 业务与视图分开了。
   ========================================================================== */

import { MpElement, define, html, nothing, icon } from "./base.js";
import { animationMs, setRuntimeToken } from "../runtime-tokens.js";
import { toast } from "./overlays.js";
import { applyRules, commit, compileRegex, flushConfigSync, state } from "../store.js";
import { fmtCount, fmtSize } from "../utils.js";
import {
  ANIMATION_SPEEDS,
  LIST_DENSITIES,
  ROW_CLICK_ACTIONS,
  WINDOW_CORNERS,
  cacheSummary,
  embedHintText,
  embedWriteHint,
  ensureSwatchStyles,
  handleSettingsAction,
  handleSettingControl,
  lyricsSourceLabels,
  ensureCoverProviders,
} from "../settings.js";
import { BACKDROP_MODES, backdropLabel } from "../backdrop.js";
import { listThemes, resolvedGlassAlpha, resolvedGlassBlur } from "../theme.js";
import { AI_VENDORS, aiVendorHint } from "../ai-vendors.js";
import { PLAYER_SKIN_API_VERSION, availableSkins, skinLoadFailures, skinRegistryVersion } from "../playerhost.js";
import { themeRegistryVersion } from "../theme.js";
import { closeSettings, doRescan, settingsLayerOpen } from "../shell.js";
import { applyGlassAlpha } from "../theme.js";
import { createSlider } from "../slider.js";

/* --------------------------------------------------------------------------
   设置分区
   --------------------------------------------------------------------------
   归类原则：
     · 曲库      —— 管「有哪些歌」：扫描文件夹 + 过滤规则；
     · 外观      —— 管「长什么样」：主题、播放界面样式（皮肤）、列表密度、
                    专辑列、动画、窗口材质；
     · 播放      —— 管「怎么播」：播放模式、随机方式、单击行为、记忆音量；
     · 歌词      —— 管「歌词怎么来、怎么显示」；
     · 音频      —— 管「听起来怎么样」：响度均衡；
     · 在线与缓存 —— 管「联网下载与本地缓存」；
     · AI 相关   —— 所有 AI 能力；
     · 关于      —— 统计与维护。
   -------------------------------------------------------------------------- */
export const SECTIONS = [
  { id: "library", label: "曲库" },
  { id: "appearance", label: "外观" },
  { id: "playback", label: "播放" },
  { id: "lyrics", label: "歌词" },
  { id: "loudness", label: "音频" },
  { id: "online", label: "在线与缓存" },
  { id: "ai", label: "AI 相关" },
  { id: "about", label: "关于" },
];

/** 响度均衡的目标响度档位 */
const LOUDNESS_TARGETS = [
  { value: -14, label: "-14 LUFS · 较响（流媒体常见）" },
  { value: -16, label: "-16 LUFS · 推荐（默认）" },
  { value: -18, label: "-18 LUFS · 温和" },
  { value: -23, label: "-23 LUFS · 广播标准（EBU R128）" },
];

/** 响度均衡模式 */
const LOUDNESS_MODES = [
  { value: "off", label: "关闭" },
  { value: "track", label: "逐曲均衡" },
  { value: "album", label: "同专辑统一" },
];

/* --------------------------------------------------------------------------
   小组件
   -------------------------------------------------------------------------- */
function settingRow({ label, hint, control }) {
  return html` <div class="setting">
    <div class="setting__main">
      <div class="setting__label">${label}</div>
      ${hint ? html`<div class="setting__hint">${hint}</div>` : nothing}
    </div>
    <div class="setting__control">${control}</div>
  </div>`;
}

function switchControl(id, checked, label) {
  return html`<button
    class="switch"
    type="button"
    role="switch"
    aria-checked=${String(Boolean(checked))}
    data-toggle=${id}
    aria-label=${label}
  ></button>`;
}

function segmented(id, options, current) {
  return html` <div class="segmented" data-segment=${id}>
    ${options.map(
      (o) =>
        html`<button
          class="segmented__btn"
          type="button"
          data-value=${o.value}
          aria-pressed=${String(String(o.value) === String(current))}
        >
          ${o.label}
        </button>`
    )}
  </div>`;
}

/**
 * 思考开关的说明文案。
 *
 * 各家对「关闭思考」的支持程度差别很大：有的能真关，有的最低只能降到
 * minimal，有的干脆没有关闭参数、或者在部分模型上直接报错。把当前厂商的
 * 限制写在开关旁边，比让用户自己试出 400 友好得多。
 */
function aiThinkingHint(cfg) {
  const vendor = cfg.aiVendor || "auto";
  const limit = aiVendorHint(vendor);
  const base = "开启后模型会先推理再给结论，响应更慢；关闭则直接作答";
  if (vendor === "auto") {
    return base + "；自动识别：" + (limit || "按接口地址与模型名判断厂商");
  }
  return limit ? base + "；该厂商：" + limit : base;
}

/** 通用滑条（数值由组件自己创建并同步，见 bindSliders） */
function rangeSlider(id, key, ariaLabel) {
  return html` <div class="rangeslider">
    <div class="slider" id=${id} role="slider" tabindex="0" aria-label=${ariaLabel} data-slider=${key}>
      <div class="slider__rail"><div class="slider__fill"></div></div>
      <div class="slider__thumb"></div>
      <div class="slider__bubble"></div>
    </div>
    <!-- 数值由滑杆自己写（见 sliderOptions 的 onChange）：同一个节点只允许一个写入方 -->
    <span class="rangeslider__value"></span>
  </div>`;
}

class MpSettingsLayer extends MpElement {
  static deps = (s) => [
    s.settingsOpen,
    s.settingsRev,
    s.settingsSection,
    s.view,
    s.folders,
    s.filterRules,
    s.songs,
    s.allSongsRaw,
    s.lastScan?.at ?? 0,
    s.scanning,
    themeRegistryVersion(),
    skinRegistryVersion(),
    s.config,
    s.coverProviders,
    s.coverBreaker,
    s.coverCache,
    s.loudnessState,
    s.ffmpegState,
    s.backdropState,
    // ★ 刻意**不含** s.volume：音量滑条按 pointermove 触发（一次拖动几十上百次），
    //   而 render() 会无条件重算三处随曲库规模线性增长的派生值
    //   （见 foldersCard 的 startsWith 统计、filtersCard 的 applyRules、
    //   aboutCard 的两个 reduce）。把它们挂在音量上等于「拖音量就全库扫一遍」。
  ];

  constructor() {
    super();
    this._activeSection = SECTIONS[0].id;
    this._navPausedUntil = 0;
    this._navResumeTimer = null;
    this._sliders = new WeakMap();
  }

  get open() {
    return settingsLayerOpen();
  }

  get panelEl() {
    return this.querySelector("#settings-layer");
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
        el.dataset.state = "";
        requestAnimationFrame(() => {
          if (this.open) el.dataset.state = "opened";
        });
        // 打开时把「上一个分区」的滚动位置复位，避免沿用上次的滚动让用户以为漏了内容
        const body = this.querySelector(".settings-layer__body");
        if (body) body.scrollTop = 0;
      }
      this.bindSliders();
      ensureCoverProviders();
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

  onConnected() {
    // 滚动事件（scroll）的 bubbles 为 false，挂在 <section> 上的 @scroll 收不到
    // .settings-layer__body 发出的滚动事件 —— 这正是「导航高亮不跟随滚动」的原因。
    // 捕获阶段与 bubbles 无关，后代元素的事件一定会经过宿主，所以在这里监听。
    this._onScrollCapture = (e) => this.onScroll(e);
    this.addEventListener("scroll", this._onScrollCapture, true);
  }

  onDisconnected() {
    if (this._onScrollCapture) {
      this.removeEventListener("scroll", this._onScrollCapture, true);
      this._onScrollCapture = null;
    }
    if (this._navResumeTimer) clearTimeout(this._navResumeTimer);
    this._navResumeTimer = null;
  }

  disconnectedCallback() {
    if (this._closeTimer) clearTimeout(this._closeTimer);
    this._closeTimer = null;
    super.disconnectedCallback();
  }

  render() {
    ensureSwatchStyles();
    return html`
      <section
        class="settings-layer"
        id="settings-layer"
        data-state="closed"
        hidden
        aria-label="设置"
        @click=${(e) => this.onClick(e)}
        @change=${(e) => this.onChange(e)}
        @input=${(e) => this.onInput(e)}
      >
        <div class="settings-layer__panel" role="dialog" aria-modal="true" aria-label="设置">
          <div class="settings-layer__head">
            <svg class="settings-layer__icon" aria-hidden="true"><use href="#i-settings"></use></svg>
            <span class="settings-layer__title">设置</span>
            <span class="u-spacer"></span>
            <button
              class="settings-layer__close"
              type="button"
              data-settings-close
              aria-label="关闭设置"
              @click=${() => closeSettings()}
            >
              ${icon("close")}
            </button>
          </div>
          <div class="settings-layer__body">
            <div class="settings">
              <div class="settings__nav" role="tablist">
                ${SECTIONS.map(
                  (s) =>
                    html`<button
                      class="settings__nav-item"
                      type="button"
                      role="tab"
                      data-goto=${s.id}
                      aria-selected=${String(s.id === this._activeSection)}
                    >
                      ${s.label}
                    </button>`
                )}
              </div>
              ${this.foldersCard()} ${this.rulesCard()} ${this.themeCard()} ${this.playerCard()}
              ${this.playbackCard()} ${this.lyricsCard()} ${this.loudnessCard()} ${this.onlineCard()} ${this.aiCard()}
              ${this.aboutCard()}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /* ========================================================================
     曲库
     ======================================================================== */
  foldersCard() {
    const rows = state.folders.length
      ? state.folders.map((f) => {
          const chip =
            f.status === "ok"
              ? html`<span class="chip chip--ok"
                  ><i class="chip__dot"></i>${f.watching ? "监听中" : "已停止监听"}</span
                >`
              : f.status === "missing"
                ? html`<span class="chip chip--error"><i class="chip__dot"></i>路径不存在</span>`
                : html`<span class="chip chip--warn"><i class="chip__dot"></i>无访问权限</span>`;
          const count = state.songs.filter((s) => s.path.startsWith(f.path)).length;
          return html` <div class="pathrow" data-folder=${f.id}>
            <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
            <div class="pathrow__main">
              <div class="pathrow__path u-selectable" title=${f.path}>${f.path}</div>
              <div class="pathrow__meta">${chip}<span>${fmtCount(count)} 首</span></div>
            </div>
            <button class="btn btn--ghost btn--sm" type="button" data-act="rescan-folder" data-id=${f.id}>
              ${icon("refresh")}<span>重扫</span>
            </button>
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="remove-folder"
              data-id=${f.id}
              aria-label="移除文件夹"
            >
              ${icon("trash")}
            </button>
          </div>`;
        })
      : html`<div class="setting__hint">还没有添加音乐文件夹。</div>`;

    return html` <section class="card" id="sec-folders" data-section="library">
      <div class="card__head">
        <div class="card__icon">${icon("folder")}</div>
        <div class="card__titles">
          <div class="card__title">音乐文件夹</div>
          <div class="card__desc">添加本地音乐目录，程序会扫描并实时监听其中的变化</div>
        </div>
        <div class="card__actions">
          <button class="btn" type="button" data-act="scan-now">${icon("refresh")}<span>立即重新扫描</span></button>
          <button class="btn btn--primary" type="button" data-act="add-folder">
            ${icon("folder-plus")}<span>添加文件夹</span>
          </button>
        </div>
      </div>
      <div class="card__body">
        ${rows}
        <div class="setting setting--group-start">
          <div class="setting__main">
            <div class="setting__label">启动时自动扫描</div>
            <div class="setting__hint">应用启动后在后台增量扫描一次</div>
          </div>
          <div class="setting__control">
            ${switchControl("autoScanOnStart", state.config.autoScanOnStart, "启动时自动扫描")}
          </div>
        </div>
        ${settingRow({
          label: "实时监听文件夹变化",
          hint: "新增、删除、重命名文件后自动更新曲库（需要后端文件监听）",
          control: switchControl("watchFolders", state.config.watchFolders, "实时监听"),
        })}
        ${settingRow({
          label: "元数据并发读取",
          hint: "同时解析的音频文件数量，机械硬盘建议调低",
          control: segmented(
            "scanConcurrency",
            [2, 4, 8].map((v) => ({ value: String(v), label: `${v}` })),
            String(state.config.scanConcurrency)
          ),
        })}
      </div>
      <div class="card__foot">
        <span>支持格式：mp3 · flac · wav · m4a · ogg · aac（ape / wma 需转码）</span>
        <span class="u-num">${fmtCount(state.folders.length)} 个文件夹</span>
      </div>
    </section>`;
  }

  ruleRow(rule) {
    const invalid = rule.type === "regex" && rule.value && !compileRegex(rule.value);
    return html` <div class="rule" data-rule=${rule.id} data-enabled=${String(rule.enabled)}>
      <button
        class="switch"
        type="button"
        role="switch"
        aria-checked=${String(rule.enabled)}
        data-act="rule-toggle"
        data-id=${rule.id}
        aria-label="启用规则"
      ></button>
      <select class="rule__field" data-act="rule-type" data-id=${rule.id}>
        <option value="size" ?selected=${rule.type === "size"}>按文件大小</option>
        <option value="regex" ?selected=${rule.type === "regex"}>按正则表达式</option>
      </select>
      <select class="rule__op" data-act="rule-op" data-id=${rule.id}>
        ${
          rule.type === "size"
            ? [
                ["lt", "小于"],
                ["lte", "小于等于"],
                ["gt", "大于"],
                ["gte", "大于等于"],
                ["eq", "等于"],
              ].map(([v, l]) => html`<option value=${v} ?selected=${rule.op === v}>${l}</option>`)
            : html`<option value="match" ?selected=${rule.op === "match"}>匹配</option>`
        }
      </select>
      <input
        class="rule__value${invalid ? " input--invalid" : ""}"
        type="text"
        data-act="rule-value"
        data-id=${rule.id}
        .value=${rule.value}
        placeholder=${rule.type === "size" ? "例如 10240" : "例如 \\.mp4$"}
      />
      <div class="rule__scope">
        <button
          class="rule__scope-btn"
          type="button"
          data-act="rule-scope"
          data-id=${rule.id}
          data-scope="exclude"
          aria-pressed=${String(rule.scope === "exclude")}
        >
          排除
        </button>
        <button
          class="rule__scope-btn"
          type="button"
          data-act="rule-scope"
          data-id=${rule.id}
          data-scope="include"
          aria-pressed=${String(rule.scope === "include")}
        >
          仅包含
        </button>
      </div>
      <button class="rule__del" type="button" data-act="rule-del" data-id=${rule.id} aria-label="删除规则">
        ${icon("trash")}
      </button>
    </div>`;
  }

  rulesCard() {
    const { kept, excluded, total } = applyRules(state.allSongsRaw, state.filterRules);
    return html` <section class="card" id="sec-filters" data-section="library">
      <div class="card__head">
        <div class="card__icon">${icon("filter")}</div>
        <div class="card__titles">
          <div class="card__title">过滤规则</div>
          <div class="card__desc">按文件大小或正则表达式排除不需要的文件，规则可开关、可组合</div>
        </div>
        <div class="card__actions">
          <button class="btn btn--sm" type="button" data-act="preset-small">
            ${icon("plus")}<span>排除 &lt;10KB</span>
          </button>
          <button class="btn btn--sm" type="button" data-act="preset-mp4">
            ${icon("plus")}<span>排除 *.mp4</span>
          </button>
          <button class="btn btn--primary btn--sm" type="button" data-act="rule-add">
            ${icon("plus")}<span>新增规则</span>
          </button>
        </div>
      </div>
      <div class="card__body">
        ${
          state.filterRules.length
            ? state.filterRules.map((r) => this.ruleRow(r))
            : html`<div class="setting__hint">还没有规则。下面的预置规则可以一键添加。</div>`
        }
        <div class="rule__preview">
          当前规则下：共扫描 <b>${fmtCount(total)}</b> 个文件，保留 <b>${fmtCount(kept)}</b> 首，过滤掉
          <b>${fmtCount(excluded)}</b> 个
        </div>
      </div>
      <div class="card__foot">
        <span>「排除」优先于「仅包含」；正则使用 JavaScript 语法（不区分大小写）</span>
        <span>大小单位在数值后填写，默认字节</span>
      </div>
    </section>`;
  }

  /* ========================================================================
     外观
     ======================================================================== */
  themeCard() {
    const themes = listThemes();
    const swatchIndex = ensureSwatchStyles();
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return html` <section class="card" id="sec-appearance" data-section="appearance">
      <div class="card__head">
        <div class="card__icon">${icon("palette")}</div>
        <div class="card__titles">
          <div class="card__title">外观</div>
          <div class="card__desc">主题以独立 CSS 文件存在，把文件放进主题目录即可自动出现</div>
        </div>
        <div class="card__actions">
          <button class="btn btn--sm" type="button" data-act="reload-themes">
            ${icon("refresh")}<span>重新扫描主题</span>
          </button>
          <button class="btn btn--sm" type="button" data-act="open-theme-dir">
            ${icon("folder")}<span>打开主题文件夹</span>
          </button>
        </div>
      </div>
      <div class="themes">
        ${themes.map((t) => {
          const active = state.config.theme === t.id;
          return html` <div class="themecard" data-active=${String(active)}>
            <!-- 卡片本体是一个 button：点它换主题。
                     删除按钮必须放在它**外面**（HTML 不允许 button 套 button）。 -->
            <button
              class="themecard__pick"
              type="button"
              data-act="theme-pick"
              data-id=${t.id}
              aria-pressed=${String(active)}
              aria-label=${`使用主题 ${t.name}`}
            >
              <span class="themecard__swatch">${swatchIndex(t).map((i) => html`<i data-swatch=${i}></i>`)}</span>
              <span class="themecard__name">${t.name}</span>
              <span class="themecard__id">${t.id}.css</span>
            </button>
            ${
              t.builtin
                ? html`<span class="themecard__badge">内置</span>`
                : html`<button
                    class="carddel"
                    type="button"
                    data-act="theme-remove"
                    data-id=${t.id}
                    data-name=${t.name}
                    data-tip="移除主题"
                    aria-label=${`移除主题 ${t.name}`}
                  >
                    ${icon("trash")}<span>移除</span>
                  </button>`
            }
          </div>`;
        })}
        <button class="themes__add" type="button" data-act="theme-help">
          ${icon("plus")}
          <span>添加自定义主题</span>
          <span class="u-num u-fs-xs">用 AI 写一个，或导入现成的 CSS</span>
        </button>
      </div>
      <div class="card__body">
        ${settingRow({
          label: "深浅色模式",
          hint: `当前系统偏好：${systemDark ? "深色" : "浅色"}`,
          control: segmented(
            "themeMode",
            [
              { value: "dark", label: "深色" },
              { value: "light", label: "浅色" },
              { value: "system", label: "跟随系统" },
            ],
            state.config.themeMode
          ),
        })}
        ${settingRow({
          label: "毛玻璃模糊强度",
          hint: "对应主题令牌 --glass-blur",
          control: rangeSlider("set-blur", "glassBlur", "模糊强度"),
        })}
        ${settingRow({
          label: "面板不透明度",
          hint: "对应主题令牌 --glass-bg 的透明度",
          control: rangeSlider("set-alpha", "glassAlpha", "不透明度"),
        })}
        ${settingRow({
          label: "窗口原生材质",
          hint: "用系统原生的半透明材质当窗口底色（桌面壁纸会透出来）。仅 Windows 11 Build 22621+ 有完整效果，改动需重启应用",
          control: html` <div class="select">
            <select class="select__field" data-act="backdrop-mode" aria-label="窗口原生材质">
              ${BACKDROP_MODES.map(
                (m) =>
                  html`<option value=${m} ?selected=${(state.config.nativeBackdrop || "off") === m}>
                    ${backdropLabel(m)}
                  </option>`
              )}
            </select>
            <svg class="select__icon"><use href="#i-chevron-down"></use></svg>
          </div>`,
        })}
        ${this.backdropNote()}
        ${settingRow({
          label: "窗口圆角",
          hint: "主窗口四角的圆角幅度。圆角由系统绘制，只有这几档（仅 Windows 11 有效）",
          control: segmented("windowCorners", WINDOW_CORNERS, state.config.windowCorners || "system"),
        })}
        ${settingRow({
          label: "关闭时最小化到托盘",
          hint: "打开后点关闭按钮只把窗口收进系统托盘（任务栏右下角），音乐照常播放；要真正退出请用托盘图标的右键菜单",
          control: switchControl("minimizeToTray", state.config.minimizeToTray, "关闭时最小化到托盘"),
        })}
        ${settingRow({
          label: "界面动画",
          hint: "关闭后取消过渡与旋转动画，低性能设备更流畅",
          control: switchControl("animations", state.config.animations, "界面动画"),
        })}
        ${settingRow({
          label: "过渡速度",
          hint: "弹出层、菜单、面板的进出动画时长；默认快速 0.25 秒",
          control: segmented("animationsSpeed", ANIMATION_SPEEDS, state.config.animationsSpeed || "fast"),
        })}
        ${settingRow({
          label: "主题色跟随封面",
          hint: "从当前封面提取主色，写入 --seed 令牌（需主题支持）",
          control: switchControl("accentFromCover", state.config.accentFromCover, "主题色跟随封面"),
        })}
        ${settingRow({
          label: "显示专辑列",
          hint: "窄窗口下会自动隐藏该列",
          control: switchControl("showAlbumColumn", state.config.showAlbumColumn, "显示专辑列"),
        })}
        ${settingRow({
          label: "列表密度",
          hint: "对「本地歌曲」「播放列表」「歌单」三个列表同时生效",
          control: segmented("listDensity", LIST_DENSITIES, state.config.listDensity || "cozy"),
        })}
      </div>
    </section>`;
  }

  /**
   原生材质的状态说明。
   --------------------------------------------------------------------------
   材质是「创建窗口时」定下的（Wails v3 没有运行期接口），所以这里必须把
   「窗口当前生效什么」「改了要不要重启」「系统支不支持」讲清楚，
   否则用户会觉得设置项点了没反应。
   */
  backdropNote() {
    const info = state.backdropState || {};
    const active = info.active || "off";
    const configured = state.config.nativeBackdrop || "off";
    const pending = configured !== active;
    const notes = [];

    if (info.preview) {
      notes.push("浏览器预览里没有原生窗口，材质只在打包后的应用里能看到。");
    } else {
      notes.push(html`窗口当前生效：<b>${backdropLabel(active)}</b>${info.os ? ` · ${info.os}` : ""}`);
      if (!info.supported && configured !== "off") {
        notes.push("当前系统不支持 Mica / Acrylic（需要 Windows 11 Build 22621 或更高），会退化成普通的背景模糊。");
      }
      if (pending) {
        notes.push(html`已保存为 <b>${backdropLabel(configured)}</b>，重启应用后生效。`);
      }
    }

    return html` <div class="setting setting--stack">
      <div class="setting__hint">${notes.map((n, i) => html`${i ? html`<br />` : nothing}${n}`)}</div>
      ${
        pending && !info.preview
          ? html`<div class="card__actions">
              <button class="btn btn--sm" type="button" data-act="backdrop-restart">
                ${icon("refresh")}<span>立即重启应用</span>
              </button>
            </div>`
          : nothing
      }
    </div>`;
  }

  /* ------------------------------------------------------------------------
     播放界面样式（皮肤）
     ------------------------------------------------------------------------
     内置样式已经从主程序抽到独立包 @musicplayer/player-skins，
     用户还可以往数据目录丢第三方样式。皮肤包本身**不参与迁移**，
     这里只负责把「有哪些样式」画出来。
     ------------------------------------------------------------------------ */
  playerCard() {
    const skins = availableSkins();
    const failures = skinLoadFailures();
    return html` <section class="card" id="sec-player" data-section="appearance">
      <div class="card__head">
        <div class="card__icon">${icon("disc")}</div>
        <div class="card__titles">
          <div class="card__title">播放界面样式</div>
          <div class="card__desc">
            内置样式来自独立包 player-skins（接口版本 ${PLAYER_SKIN_API_VERSION}）；把第三方样式放进样式目录即可扩展
          </div>
        </div>
        <div class="card__actions">
          <button class="btn btn--sm" type="button" data-act="reload-skins">
            ${icon("refresh")}<span>重新扫描样式</span>
          </button>
          <button class="btn btn--sm" type="button" data-act="open-skin-dir">
            ${icon("folder")}<span>打开样式目录</span>
          </button>
        </div>
      </div>
      <div class="themes">
        ${skins.map((s) => {
          const active = state.config.playerViewMode === s.id;
          return html` <div class="skincard" data-active=${String(active)}>
            <button
              class="skincard__pick"
              type="button"
              data-act="skin-pick"
              data-id=${s.id}
              aria-pressed=${String(active)}
              aria-label=${`使用样式 ${s.name}`}
            >
              <span class="skincard__icon">${icon(s.icon || "disc")}</span>
              <span class="skincard__name">${s.name}</span>
              <span class="skincard__id">${s.id}</span>
            </button>
            ${
              s.builtin
                ? nothing
                : html`<span class="skincard__badge">第三方</span>
                    <button
                      class="carddel"
                      type="button"
                      data-act="skin-remove"
                      data-id=${s.id}
                      data-name=${s.name}
                      data-tip="移除样式"
                      aria-label=${`移除样式 ${s.name}`}
                    >
                      ${icon("trash")}<span>移除</span>
                    </button>`
            }
          </div>`;
        })}
        <button class="themes__add" type="button" data-act="skin-help">
          ${icon("plus")}
          <span>自定义样式</span>
          <span class="u-num u-fs-xs">用 AI 帮你写一个</span>
        </button>
      </div>
      ${
        failures.length
          ? html`<div class="card__body">
              ${failures.map(
                (f) =>
                  html` <div class="setting">
                    <div class="setting__main">
                      <div class="setting__label">样式「${f.id}」加载失败</div>
                      <div class="setting__hint">${f.reason}</div>
                    </div>
                  </div>`
              )}
            </div>`
          : nothing
      }
      <div class="card__body">
        ${settingRow({
          label: "封面轮播",
          hint: "一首歌有多张封面时，播放详情页按下面的间隔轮换显示（不影响列表缩略图）",
          control: switchControl("coverCarousel", state.config.coverCarousel === true, "封面轮播"),
        })}
        ${settingRow({
          label: "轮播间隔",
          hint: "对应设置项 coverCarouselInterval（秒）",
          control: rangeSlider("set-carousel", "coverCarouselInterval", "轮播间隔"),
        })}
      </div>
    </section>`;
  }

  /* ========================================================================
     播放
     ======================================================================== */
  playbackCard() {
    return html` <section class="card" id="sec-playback" data-section="playback">
      <div class="card__head">
        <div class="card__icon">${icon("headphones")}</div>
        <div class="card__titles">
          <div class="card__title">播放</div>
          <div class="card__desc">播放模式、随机方式与单击行为（界面相关的设置都在「外观」里）</div>
        </div>
      </div>
      <div class="card__body">
        ${settingRow({
          label: "默认播放模式",
          hint: "点击底栏循环按钮可随时切换",
          control: segmented(
            "playMode",
            [
              { value: "sequence", label: "列表循环" },
              { value: "loop-one", label: "单曲循环" },
              { value: "shuffle", label: "随机" },
            ],
            state.config.playMode === "loop-all" ? "sequence" : state.config.playMode
          ),
        })}
        ${settingRow({
          label: "随机播放方式",
          hint: "随机播放会先打乱当前播放列表，再按打乱后的顺序播放",
          control: segmented(
            "shuffleMode",
            [
              { value: "reshuffle", label: "播完重新打乱" },
              { value: "once", label: "只打乱一次" },
            ],
            state.config.shuffleMode || "reshuffle"
          ),
        })}
        ${settingRow({
          label: "记忆音量",
          hint: `当前音量 ${Math.round(state.volume * 100)}%`,
          control: switchControl("rememberVolume", true, "记忆音量"),
        })}
        ${settingRow({
          label: "单击歌曲时的行为",
          hint:
            "双击始终是「立即播放这一首」；这个设置只影响单击：" +
            "播放＝播放它并把它加进播放列表；播放该歌单＝播放它并用当前列表替换播放列表；添加为一首播放＝插到当前歌曲后面，点了「下一曲」就播它",
          control: segmented("rowClickAction", ROW_CLICK_ACTIONS, state.config.rowClickAction || "next"),
        })}
      </div>
    </section>`;
  }

  /* ========================================================================
     歌词
     ======================================================================== */
  lyricsCard() {
    return html` <section class="card" id="sec-lyrics" data-section="lyrics">
      <div class="card__head">
        <div class="card__icon">${icon("lyrics")}</div>
        <div class="card__titles">
          <div class="card__title">歌词</div>
          <div class="card__desc">歌词来源优先级与显示效果</div>
        </div>
      </div>
      <div class="card__body">
        ${settingRow({
          label: "歌词来源优先级",
          hint: "内嵌歌词 → 同目录 .lrc → 歌词缓存 → 在线自动匹配；本地读不到时会自动联网匹配并存入缓存",
          control: html`<span class="chip"><i class="chip__dot"></i>${lyricsSourceLabels()}</span>`,
        })}
        ${settingRow({
          label: "显示歌词",
          hint: "关闭后播放界面只显示封面",
          control: switchControl("showLyrics", state.config.showLyrics, "显示歌词"),
        })}
        ${settingRow({
          label: "桌面歌词",
          hint: "在桌面上显示一行置顶歌词（独立透明窗口，可拖动；底栏「桌面歌词」按钮同效）。位置会被记住，换显示器后跑丢了可以在这里重置",
          control: html` ${switchControl("showDesktopLyrics", state.config.showDesktopLyrics, "桌面歌词")}
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="reset-desktop-lyrics-pos"
              data-tip="把桌面歌词窗口移回默认位置并清掉记忆"
            >
              重置位置
            </button>`,
        })}
        ${settingRow({
          label: "桌面背景歌词",
          hint: "把播放界面的背景铺满桌面、垫在桌面图标之下，歌词跟着画在上面（与「桌面歌词」二选一；仅 Windows）",
          control: switchControl("showDesktopWallpaper", state.config.showDesktopWallpaper, "桌面背景歌词"),
        })}
        ${settingRow({
          label: "歌词字号",
          hint: "对应 --lyric-size，当前行会额外放大",
          control: rangeSlider("set-lyric-size", "lyricsFontSize", "歌词字号"),
        })}
        ${settingRow({
          label: "居中高亮行数",
          hint: "当前行上下各显示的行数",
          control: segmented(
            "lyricsLines",
            [3, 5, 7, 9].map((v) => ({ value: String(v), label: String(v) })),
            String(state.config.lyricsLines)
          ),
        })}
      </div>
    </section>`;
  }

  /* ========================================================================
     音频
     ======================================================================== */
  loudnessCard() {
    const cfg = state.config;
    const ls = state.loudnessState || {};
    const measured = ls.measured ?? 0;
    const missing = ls.missing ?? Math.max(0, state.songs.length - measured);
    const total = ls.total ?? state.songs.length;
    const available = ls.available !== false;
    const tools = state.ffmpegState || {};
    const sourceText = tools.describe || ls.describe || "检测中…";

    return html` <section class="card" id="sec-loudness" data-section="loudness">
      <div class="card__head">
        <h2 class="card__title">${icon("scale")}<span>响度均衡</span></h2>
        <p class="card__desc">
          按 EBU R128 测量整合响度（LUFS），回放时按目标响度做增益补偿， 让不同来源的歌曲音量听起来一致。<br />
          <b>只在播放时按需测量</b>：播到哪首就测哪首，算好的补偿会缓存下来，
          之后播放零延迟；没有手动预热的入口。改了目标响度后旧补偿会自动失效并按新标准重算。
        </p>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>均衡模式</span>
          <small class="u-fs-xs u-dim"
            >逐曲：每首歌都拉到目标响度；同专辑：整张专辑用同一个增益，保留专辑内部的强弱对比</small
          >
        </div>
        <div class="setting__control">${segmented("loudnessMode", LOUDNESS_MODES, cfg.loudnessMode || "off")}</div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>目标响度</span>
          <small class="u-fs-xs u-dim">数字越小整体越轻。推荐 -16 LUFS。改动后已缓存的补偿会失效并重算</small>
        </div>
        <div class="setting__control">
          <div class="select">
            <select class="select__field" data-act="loudness-target" aria-label="目标响度">
              ${LOUDNESS_TARGETS.map(
                (t) =>
                  html`<option value=${t.value} ?selected=${Number(cfg.loudnessTarget) === t.value}>
                    ${t.label}
                  </option>`
              )}
            </select>
            ${icon("chevron-down", "select__icon")}
          </div>
        </div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>真峰值保护</span>
          <small class="u-fs-xs u-dim">抬升音量时限制增益，避免超过 -1 dBTP 造成削波失真</small>
        </div>
        <div class="setting__control">
          <button
            class="switch"
            type="button"
            role="switch"
            data-toggle="loudnessLimit"
            aria-checked=${String(Boolean(cfg.loudnessLimit))}
          >
            <span class="switch__thumb"></span>
          </button>
        </div>
      </div>

      <div class="setting setting--stack">
        <div class="card__actions">
          <button class="btn btn--sm" type="button" data-act="loudness-refresh">
            ${icon("refresh")}<span>重新拉取补偿</span>
          </button>
          <button class="btn btn--sm btn--danger" type="button" data-act="loudness-clear">
            ${icon("trash")}<span>清除测量数据</span>
          </button>
        </div>

        <div class="setting__hint">
          当前标准下已算好 <b>${measured}</b> / ${total}
          首${missing ? html`，其余 <b>${fmtCount(missing)}</b> 首会在播放时按需计算` : "（全部已算好）"}<br />
          缓存文件里另有 ${ls.cached ?? 0} 条记录（含其他标准下的旧结果，不会生效）<br />
          响度来源：<b>${available ? sourceText : "不可用"}</b>${available ? "" : " —— 转码与响度测量不可用"}
        </div>
      </div>
    </section>`;
  }

  /* ========================================================================
     在线与缓存
     ======================================================================== */
  onlineCard() {
    const dir = state.config.downloadDir || "（默认：系统音乐目录 / downloads）";
    const providers = state.coverProviders || [];
    const breaker = state.coverBreaker || {};
    const providerText = providers.length
      ? providers.map((p) => (breaker[p] ? `${p}（暂时不可用）` : p)).join(" · ")
      : "尚未连接后端";

    return html` <section class="card" id="sec-online" data-section="online">
      <div class="card__head">
        <div class="card__icon">${icon("music")}</div>
        <div class="card__titles">
          <div class="card__title">在线歌曲</div>
          <div class="card__desc">下载位置、封面来源与缓存。试听只加入播放列表，不会混进本地曲库</div>
        </div>
      </div>
      <div class="card__body">
        <div class="setting setting--stack">
          <div class="setting__main">
            <div class="setting__label">下载保存位置</div>
            <div class="setting__hint">
              这个目录会作为曲库的扫描根自动生效，下载完的歌直接出现在「本地歌曲」里， 不需要手动添加文件夹
            </div>
          </div>
          <div class="pathrow">
            <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
            <div class="pathrow__main">
              <div class="pathrow__path u-selectable" title=${dir}>${dir}</div>
            </div>
            <button class="btn btn--sm" type="button" data-act="download-dir-pick">
              ${icon("folder")}<span>更改</span>
            </button>
            <button class="btn btn--ghost btn--sm" type="button" data-act="download-dir-open">
              ${icon("expand")}<span>打开</span>
            </button>
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="download-dir-reset"
              data-tip="恢复默认（系统音乐目录 / downloads）"
            >
              ${icon("refresh")}
            </button>
          </div>
        </div>

        ${settingRow({
          label: "联网获取封面",
          hint: `在线搜索到的歌曲会自动去公开曲库匹配封面：${providerText}`,
          control: switchControl("onlineCover", state.config.onlineCover !== false, "联网获取封面"),
        })}
        ${settingRow({
          label: "把封面/歌词写进歌曲文件",
          hint: embedHintText(),
          control: switchControl("embedMeta", state.config.embedMeta === true, "写进歌曲文件"),
        })}

        <div class="setting setting--stack">
          <div class="setting__main">
            <div class="setting__label">把已有缓存补写进文件</div>
            <div class="setting__hint">${embedWriteHint()}</div>
          </div>
          <div class="card__actions">
            <button class="btn btn--sm" type="button" data-act="embed-cache-write">
              ${icon("tag")}<span>写入缓存到文件</span>
            </button>
          </div>
        </div>

        <div class="setting setting--stack">
          <div class="setting__main">
            <div class="setting__label">缓存目录</div>
            <div class="setting__hint">封面与歌词的缓存位置；${cacheSummary()}</div>
          </div>
          <div class="pathrow">
            <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
            <div class="pathrow__main">
              <div class="pathrow__path u-selectable" data-role="cache-dir" title=${state.coverCache?.dir || ""}>
                ${state.coverCache?.dir || "（连接后显示）"}
              </div>
            </div>
            <button class="btn btn--sm" type="button" data-act="cache-open-covers">
              ${icon("image")}<span>封面</span>
            </button>
            <button class="btn btn--ghost btn--sm" type="button" data-act="cache-open-lyrics">
              ${icon("lyrics")}<span>歌词</span>
            </button>
          </div>
        </div>
      </div>
      <div class="card__foot">
        <span>封面来自第三方公开接口（iTunes / 网易云 / Deezer / MusicBrainz），匹配不保证 100% 准确</span>
        <button class="btn btn--sm" type="button" data-act="cover-refresh">
          ${icon("refresh")}<span>清空封面缓存</span>
        </button>
      </div>
    </section>`;
  }

  /* ========================================================================
     AI 相关
     ======================================================================== */
  aiCard() {
    const cfg = state.config || {};
    const configured = Boolean(String(cfg.aiBaseUrl || "").trim() && String(cfg.aiApiKey || "").trim());
    const field = (label, hint, key, placeholder, type = "text") =>
      html` <div class="setting setting--stack">
        <div class="setting__main">
          <div class="setting__label">${label}</div>
          <div class="setting__hint">${hint}</div>
        </div>
        <input
          class="input"
          type=${type}
          data-act="ai-field"
          data-key=${key}
          .value=${cfg[key] || ""}
          placeholder=${placeholder}
          autocomplete="off"
          spellcheck="false"
        />
      </div>`;

    return html` <section class="card" id="sec-ai" data-section="ai">
      <div class="card__head">
        <div class="card__icon">${icon("settings")}</div>
        <div class="card__titles">
          <div class="card__title">AI 相关</div>
          <div class="card__desc">自动匹配歌词 / 封面时，用 AI 从脏文件名里提取真实元数据</div>
        </div>
      </div>
      <div class="card__body">
        ${field("接口地址（Base URL）", "OpenAI 兼容接口，例如 https://api.openai.com/v1", "aiBaseUrl", "https://api.openai.com/v1")}
        ${field("API Key", "只写入本地配置，不会发往该接口以外的任何地方", "aiApiKey", "sk-...", "password")}
        ${field("模型 ID", "例如 gpt-4o-mini、deepseek-chat；留空默认 gpt-4o-mini", "aiModelId", "gpt-4o-mini")}
        ${settingRow({
          label: "模型类型",
          hint: "思考模式的开关参数各家不同，必须选对厂商才会发出正确的请求体；选「自动识别」会按接口地址与模型名判断",
          control: html` <select class="select__field" data-act="ai-vendor" aria-label="模型类型">
            ${AI_VENDORS.map((v) => html`<option value=${v.id} ?selected=${v.id === (cfg.aiVendor || "auto")}>${v.label}</option>`)}
          </select>`,
        })}
        ${settingRow({
          label: "启用思考模式",
          hint: aiThinkingHint(cfg),
          control: switchControl("aiThinking", Boolean(cfg.aiThinking), "启用思考模式"),
        })}
        ${settingRow({
          label: "自动匹配歌词时使用 AI 清洗元数据",
          hint: "自动匹配歌词前先用 AI 从文件名里还原真实的标题/歌手。AI 一次调用可能要十几秒，关掉后只做本地整形：匹配更快，但脏文件名的命中率会低一些",
          control: switchControl(
            "aiLyricsClean",
            state.config.aiLyricsClean !== false,
            "自动匹配歌词时使用 AI 清洗元数据"
          ),
        })}
        <div class="setting__hint">
          ${
            configured
              ? "已配置：自动匹配封面时，会先把文件名与现有元数据交给 AI 清洗，再去匹配。"
              : "尚未配置：填入 Base URL 与 API Key 后自动启用。"
          }
        </div>
      </div>
    </section>`;
  }

  /* ========================================================================
     关于
     ======================================================================== */
  aboutCard() {
    const s = state.lastScan;
    const total = state.songs.reduce((sum, x) => sum + x.duration, 0);
    const bytes = state.songs.reduce((sum, x) => sum + x.size, 0);
    return html` <section class="card" id="sec-about" data-section="about">
      <div class="card__head">
        <div class="card__icon">${icon("info")}</div>
        <div class="card__titles">
          <div class="card__title">关于与数据</div>
          <div class="card__desc">曲库统计与缓存位置</div>
        </div>
      </div>
      <div class="kv">
        <div class="kv__k">曲库文件</div>
        <div class="kv__v">${fmtCount(state.allSongsRaw.length)} 个</div>
        <div class="kv__k">过滤后歌曲</div>
        <div class="kv__v">${fmtCount(state.songs.length)} 首</div>
        <div class="kv__k">被规则过滤</div>
        <div class="kv__v">${fmtCount(s?.excluded ?? 0)} 个</div>
        <div class="kv__k">总时长</div>
        <div class="kv__v">${Math.floor(total / 3600000)} 小时 ${Math.floor((total % 3600000) / 60000)} 分</div>
        <div class="kv__k">占用空间</div>
        <div class="kv__v">${fmtSize(bytes)}</div>
        <div class="kv__k">上次扫描</div>
        <div class="kv__v">${s ? new Date(s.at).toLocaleString("zh-CN") : "—"}</div>
        <div class="kv__k">缓存目录</div>
        <div class="kv__v">${state.config.cacheDir}</div>
        <div class="kv__k">版本</div>
        <div class="kv__v">0.1.0（Go + Wails3 · Lit 前端）</div>
      </div>
      <div class="card__foot">
        <span>清空缓存不会删除任何本地音乐文件</span>
        <button class="btn btn--danger btn--sm" type="button" data-act="clear-cache">
          ${icon("trash")}<span>清空缓存</span>
        </button>
      </div>
    </section>`;
  }

  /* ========================================================================
     事件（委托在层上，与迁移前一致）
     ======================================================================== */
  async onClick(e) {
    if (e.target.closest("[data-settings-close]") || e.target === this.panelEl) {
      closeSettings();
      return;
    }

    const goto = e.target.closest("[data-goto]")?.dataset.goto;
    if (goto) {
      this.scrollToSection(goto);
      return;
    }

    // 开关（switch）与分段控件统一走控制分支
    const control = e.target.closest("[data-toggle],[data-segment] .segmented__btn");
    if (control) {
      if (handleSettingControl(control, { commit })) {
        flushConfigSync();
      }
      // 开关 / 分段控件的选中态在模板里是从 state.config 推导的，而
      // state.config 是**原地修改**的对象（引用不变），靠依赖数组是抓不到
      // 「哪个字段变了」的。控制项自己知道自己改了东西，这里显式重绘一次：
      // Lit 只更新变化的那几个 part，不会重建整块设置界面。
      this.requestUpdate();
      return;
    }

    const actEl = e.target.closest("[data-act]");
    if (!actEl) return;
    await handleSettingsAction(actEl, {
      commit,
      render: () => {
        state.settingsRev = (state.settingsRev || 0) + 1;
        commit();
      },
      rescan: () => doRescan({ manual: true }),
    });
    flushConfigSync();
  }

  async onChange(e) {
    const act = e.target.dataset.act;
    if (!act) return;
    try {
      await handleSettingsAction(e.target, {
        commit,
        render: () => {
          state.settingsRev = (state.settingsRev || 0) + 1;
          commit();
        },
        rescan: () => doRescan({ manual: true }),
      });
      flushConfigSync();
      this.requestUpdate();
    } catch (err) {
      console.error("[settings] 处理下拉框失败", err);
      toast(`设置未生效：${err?.message ?? err}`, { tone: "error", duration: 5000 });
    }
  }

  onInput(e) {
    if (e.target.dataset.act !== "rule-value") return;
    const rule = state.filterRules.find((r) => r.id === e.target.dataset.id);
    if (!rule) return;
    rule.value = e.target.value;
    commit();
    // 规则值变化后刷新预览统计：模板里就是 applyRules 的表达式，重绘即生效。
    // 不必整页重绘 —— Lit 只改那一个统计文本节点，输入框焦点也不会丢
    // （这正是迁移前必须靠「记住焦点元素再补回去」才能做到的事）。
    this.requestUpdate();
  }

  /* ------------------------------------------------------------------------
     导航条跟随滚动
     ------------------------------------------------------------------------
     滚动内容时高亮跟着走，点导航条时高亮立刻过去 —— 两者不能互相打架：
     程序化滚动（点导航条）期间先暂停跟随，等滚动停下来再交还给跟随逻辑。
     ------------------------------------------------------------------------ */
  onScroll(e) {
    const scroll = e.target;
    if (!scroll.classList?.contains("settings-layer__body")) return;
    if (this._navPausedUntil) {
      // 程序化滚动（点导航条）期间不跟随：滚动还在继续就不断续期，
      // 直到它真正停下来再把跟随交还回去 —— 平滑滚动的尾帧不会改写刚点中的高亮。
      this.deferNavResume();
      return;
    }
    const top = scroll.getBoundingClientRect().top + 80;
    let current = SECTIONS[0].id;
    for (const s of SECTIONS) {
      const node = this.querySelector(`[data-section="${s.id}"]`);
      if (node && node.getBoundingClientRect().top <= top) current = s.id;
    }
    // 滚到底时最后一张卡片可能还没顶到阈值线（卡片比一屏矮），不改的话高亮会一直
    // 停在倒数第二个分区。真的能滚时才兜底选中最后一个分区。
    if (
      scroll.scrollHeight > scroll.clientHeight + 2 &&
      scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2
    ) {
      current = SECTIONS[SECTIONS.length - 1].id;
    }
    if (current !== this._activeSection) {
      this._activeSection = current;
      this.paintNav();
    }
  }

  paintNav() {
    for (const b of this.querySelectorAll(".settings__nav-item")) {
      b.setAttribute("aria-selected", String(b.dataset.goto === this._activeSection));
    }
  }

  /** 程序化滚动结束后恢复「跟随」：滚动事件每来一次就推迟 140ms */
  deferNavResume() {
    clearTimeout(this._navResumeTimer);
    this._navResumeTimer = setTimeout(() => {
      this._navResumeTimer = null;
      this._navPausedUntil = 0;
    }, 140);
  }

  scrollToSection(id) {
    const node = this.querySelector(`[data-section="${id}"]`);
    const body = this.querySelector(".settings-layer__body");
    if (!node || !body) return;
    this._activeSection = id;
    this.paintNav();
    this._navPausedUntil = 1;
    // 已经在目标位置（不会再产生滚动事件）时也要能解锁
    this.deferNavResume();
    // 自己算目标位置而不是 scrollIntoView：
    //   · 导航条是 sticky 的，卡片顶部必须落在它下面，否则会被挡住；
    //   · scrollIntoView 有时会停在离底部差几像素的地方，滚到底时
    //     滚动跟随（onScroll）算出来的分区就会和点中的不一致。
    // 目标位置夹在 [0, max] 内，滚到底时由 onScroll 的「到底」兜底选中最后一个分区。
    const nav = this.querySelector(".settings__nav");
    const navH = nav ? nav.offsetHeight : 0;
    const offset = node.getBoundingClientRect().top - body.getBoundingClientRect().top;
    const target = Math.max(0, body.scrollTop + offset - navH - 8);
    body.scrollTo({ top: target, behavior: "smooth" });
  }

  /* ------------------------------------------------------------------------
     设置里的滑条
     ------------------------------------------------------------------------
     与原 bindSettingsSliders 完全同参（范围 / 单位 / 副作用），
     但实例跟着组件走：同一个 .slider 元素只创建一次。
     ------------------------------------------------------------------------ */
  bindSliders() {
    for (const root of this.querySelectorAll("[data-slider]")) {
      const key = root.dataset.slider;
      if (!key) continue;
      let slider = this._sliders.get(root);
      if (!slider) {
        slider = createSlider(root, this.sliderOptions(root, key));
        this._sliders.set(root, slider);
        // 创建时刷一次读数：模板里那个 span 是空的，值由滑杆自己写
        const label = root.parentElement.querySelector(".rangeslider__value");
        if (label) label.textContent = slider.text(this.sliderValue(key));
      }
      slider.set(this.sliderValue(key), { silent: true });
    }
  }

  sliderOptions(root, key) {
    const isBlur = key === "glassBlur";
    const isAlpha = key === "glassAlpha";
    const isCarousel = key === "coverCarouselInterval";
    const min = isCarousel ? 2 : key === "lyricsFontSize" ? 12 : isBlur ? 0 : isAlpha ? 20 : 0;
    const max = isCarousel ? 60 : key === "lyricsFontSize" ? 26 : isBlur ? 48 : isAlpha ? 95 : 100;
    // 单位跟着键走：轮播是秒，字号/模糊是像素，透明度是百分比
    const unit = isCarousel ? " 秒" : isBlur ? "px" : isAlpha ? "%" : "px";
    return {
      min,
      max,
      step: 1,
      value: this.sliderValue(key),
      format: (v) => `${Math.round(v)}${unit}`,
      onChange: (v) => {
        state.config[key] = v;
        const label = root.parentElement.querySelector(".rangeslider__value");
        if (label) label.textContent = `${Math.round(v)}${unit}`;
        if (isBlur) {
          state.config.glassBlurCustom = true;
          setRuntimeToken("--glass-blur", `${v}px`);
        }
        if (isAlpha) {
          state.config.glassAlphaCustom = true;
          applyGlassAlpha(v);
        }
        if (key === "lyricsFontSize") setRuntimeToken("--lyric-size", `${v}px`);
      },
      onCommit: () => commit(),
    };
  }

  sliderValue(key) {
    if (key === "glassBlur") return state.config.glassBlurCustom ? state.config.glassBlur : resolvedGlassBlur();
    if (key === "glassAlpha") return state.config.glassAlphaCustom ? state.config.glassAlpha : resolvedGlassAlpha();
    return state.config[key] ?? 0;
  }
}

define("mp-settings-layer", MpSettingsLayer);

export const _internals = { settingRow, switchControl, segmented, rangeSlider };
