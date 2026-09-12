/* ==========================================================================
   settings.js — 设置界面（音乐文件夹 / 过滤规则 / 外观 / 播放 / 歌词 / 关于）
   ========================================================================== */

import { $, icon, openModal, toast } from "./dom.js";
import { applyRules, compileRegex, state } from "./store.js";
import { backend, isWails } from "./bridge.js";
import { esc, fmtCount, fmtSize, uid } from "./utils.js";
import { applyResolvedTheme, discoverThemes, listThemes, resolvedGlassBlur } from "./theme.js";
import { refreshLoudnessGains, refreshLoudnessState } from "./audio.js";
import { setRuntimeToken, replaceStyleRules } from "./runtime-tokens.js";

/* --------------------------------------------------------------------------
   小组件
   -------------------------------------------------------------------------- */
function settingRow({ label, hint, control }) {
  return `
    <div class="setting">
      <div class="setting__main">
        <div class="setting__label">${esc(label)}</div>
        ${hint ? `<div class="setting__hint">${esc(hint)}</div>` : ""}
      </div>
      <div class="setting__control">${control}</div>
    </div>`;
}

function switchHtml(id, checked, label) {
  return `<button class="switch" type="button" role="switch" aria-checked="${checked}" data-toggle="${id}" aria-label="${esc(label)}"></button>`;
}

function segmented(id, options, current) {
  return `<div class="segmented" data-segment="${id}">
    ${options
      .map(
        (o) =>
          `<button class="segmented__btn" type="button" data-value="${o.value}" aria-pressed="${o.value === current}">${esc(o.label)}</button>`
      )
      .join("")}
  </div>`;
}

/* --------------------------------------------------------------------------
   各分区
   -------------------------------------------------------------------------- */
function foldersCard() {
  const rows = state.folders.length
    ? state.folders
        .map((f) => {
          const chip =
            f.status === "ok"
              ? `<span class="chip chip--ok"><i class="chip__dot"></i>${f.watching ? "监听中" : "已停止监听"}</span>`
              : f.status === "missing"
                ? `<span class="chip chip--error"><i class="chip__dot"></i>路径不存在</span>`
                : `<span class="chip chip--warn"><i class="chip__dot"></i>无访问权限</span>`;
          const count = state.songs.filter((s) => s.path.startsWith(f.path)).length;
          return `
            <div class="pathrow" data-folder="${f.id}">
              <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"/></svg>
              <div class="pathrow__main">
                <div class="pathrow__path u-selectable" title="${esc(f.path)}">${esc(f.path)}</div>
                <div class="pathrow__meta">${chip}<span>${fmtCount(count)} 首</span></div>
              </div>
              <button class="btn btn--ghost btn--sm" type="button" data-act="rescan-folder" data-id="${f.id}">${icon("refresh")}<span>重扫</span></button>
              <button class="btn btn--ghost btn--sm" type="button" data-act="remove-folder" data-id="${f.id}" aria-label="移除文件夹">${icon("trash")}</button>
            </div>`;
        })
        .join("")
    : `<div class="setting__hint">还没有添加音乐文件夹。</div>`;

  return `
    <section class="card" id="sec-folders" data-section="folders">
      <div class="card__head">
        <div class="card__icon">${icon("folder")}</div>
        <div class="card__titles">
          <div class="card__title">音乐文件夹</div>
          <div class="card__desc">添加本地音乐目录，程序会扫描并实时监听其中的变化</div>
        </div>
        <div class="card__actions">
          <button class="btn" type="button" data-act="scan-now">${icon("refresh")}<span>立即重新扫描</span></button>
          <button class="btn btn--primary" type="button" data-act="add-folder">${icon("folder-plus")}<span>添加文件夹</span></button>
        </div>
      </div>
      <div class="card__body">
        ${rows}
        <div class="setting setting--group-start">
          <div class="setting__main">
            <div class="setting__label">启动时自动扫描</div>
            <div class="setting__hint">应用启动后在后台增量扫描一次</div>
          </div>
          <div class="setting__control">${switchHtml("autoScanOnStart", state.config.autoScanOnStart, "启动时自动扫描")}</div>
        </div>
        ${settingRow({
          label: "实时监听文件夹变化",
          hint: "新增、删除、重命名文件后自动更新曲库（需要后端文件监听）",
          control: switchHtml("watchFolders", state.config.watchFolders, "实时监听"),
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

const SIZE_UNITS = ["B", "KB", "MB", "GB"];

function ruleRowHtml(rule) {
  const invalid = rule.type === "regex" && rule.value && !compileRegex(rule.value);
  return `
    <div class="rule" data-rule="${rule.id}" data-enabled="${rule.enabled}">
      <button class="switch" type="button" role="switch" aria-checked="${rule.enabled}" data-act="rule-toggle" data-id="${rule.id}" aria-label="启用规则"></button>
      <select class="rule__field" data-act="rule-type" data-id="${rule.id}">
        <option value="size" ${rule.type === "size" ? "selected" : ""}>按文件大小</option>
        <option value="regex" ${rule.type === "regex" ? "selected" : ""}>按正则表达式</option>
      </select>
      <select class="rule__op" data-act="rule-op" data-id="${rule.id}">
        ${
          rule.type === "size"
            ? `
          <option value="lt" ${rule.op === "lt" ? "selected" : ""}>小于</option>
          <option value="lte" ${rule.op === "lte" ? "selected" : ""}>小于等于</option>
          <option value="gt" ${rule.op === "gt" ? "selected" : ""}>大于</option>
          <option value="gte" ${rule.op === "gte" ? "selected" : ""}>大于等于</option>
          <option value="eq" ${rule.op === "eq" ? "selected" : ""}>等于</option>`
            : `
          <option value="match" ${rule.op === "match" ? "selected" : ""}>匹配</option>`
        }
      </select>
      <input class="rule__value ${invalid ? "input--invalid" : ""}" type="text"
        data-act="rule-value" data-id="${rule.id}"
        value="${esc(rule.value)}"
        placeholder="${rule.type === "size" ? "例如 10240" : "例如 \\.mp4$"}" />
      <div class="rule__scope">
        <button class="rule__scope-btn" type="button" data-act="rule-scope" data-id="${rule.id}" data-scope="exclude" aria-pressed="${rule.scope === "exclude"}">排除</button>
        <button class="rule__scope-btn" type="button" data-act="rule-scope" data-id="${rule.id}" data-scope="include" aria-pressed="${rule.scope === "include"}">仅包含</button>
      </div>
      <button class="rule__del" type="button" data-act="rule-del" data-id="${rule.id}" aria-label="删除规则">${icon("trash")}</button>
    </div>`;
}

function rulesCard() {
  const { kept, excluded, total } = applyRules(state.allSongsRaw, state.filterRules);
  const rules = state.filterRules.length
    ? state.filterRules.map(ruleRowHtml).join("")
    : `<div class="setting__hint">还没有规则。下面的预置规则可以一键添加。</div>`;

  return `
    <section class="card" id="sec-filters" data-section="filters">
      <div class="card__head">
        <div class="card__icon">${icon("filter")}</div>
        <div class="card__titles">
          <div class="card__title">过滤规则</div>
          <div class="card__desc">按文件大小或正则表达式排除不需要的文件，规则可开关、可组合</div>
        </div>
        <div class="card__actions">
          <button class="btn btn--sm" type="button" data-act="preset-small">${icon("plus")}<span>排除 &lt;10KB</span></button>
          <button class="btn btn--sm" type="button" data-act="preset-mp4">${icon("plus")}<span>排除 *.mp4</span></button>
          <button class="btn btn--primary btn--sm" type="button" data-act="rule-add">${icon("plus")}<span>新增规则</span></button>
        </div>
      </div>
      <div class="card__body">
        ${rules}
        <div class="rule__preview">
          当前规则下：共扫描 <b>${fmtCount(total)}</b> 个文件，保留 <b>${fmtCount(kept)}</b> 首，过滤掉 <b>${fmtCount(excluded)}</b> 个
        </div>
      </div>
      <div class="card__foot">
        <span>「排除」优先于「仅包含」；正则使用 JavaScript 语法（不区分大小写）</span>
        <span>大小单位在数值后填写，默认字节</span>
      </div>
    </section>`;
}

function themeCard() {
  const themes = listThemes();
  const swatchIndex = ensureSwatchStyles();
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const cards = themes
    .map(
      (t) => `
      <button class="themecard" type="button" data-act="theme-pick" data-id="${t.id}" aria-pressed="${state.config.theme === t.id}">
        <span class="themecard__swatch">${swatchIndex(t)
          .map((i) => `<i data-swatch="${i}"></i>`)
          .join("")}</span>
        <span class="themecard__name">${esc(t.name)}</span>
        <span class="themecard__id">${esc(t.id)}.css</span>
        ${t.builtin ? `<span class="themecard__badge">内置</span>` : ""}
      </button>`
    )
    .join("");

  return `
    <section class="card" id="sec-appearance" data-section="appearance">
      <div class="card__head">
        <div class="card__icon">${icon("palette")}</div>
        <div class="card__titles">
          <div class="card__title">外观</div>
          <div class="card__desc">主题以独立 CSS 文件存在，把文件放进主题目录即可自动出现</div>
        </div>
        <div class="card__actions">
          <button class="btn btn--sm" type="button" data-act="reload-themes">${icon("refresh")}<span>重新扫描主题</span></button>
          <button class="btn btn--sm" type="button" data-act="open-theme-dir">${icon("folder")}<span>打开主题文件夹</span></button>
        </div>
      </div>
      <div class="themes">
        ${cards}
        <button class="themes__add" type="button" data-act="theme-help">
          ${icon("plus")}
          <span>添加自定义主题</span>
          <span class="u-num u-fs-xs">复制 _template.css 改名即可</span>
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
          control: `<div class="rangeslider">
            <div class="slider" id="set-blur" role="slider" tabindex="0" aria-label="模糊强度" data-slider="glassBlur">
              <div class="slider__rail"><div class="slider__fill"></div></div>
              <div class="slider__thumb"></div>
              <div class="slider__bubble"></div>
            </div>
            <span class="rangeslider__value">${Math.round(resolvedGlassBlur())}px</span>
          </div>`,
        })}
        ${settingRow({
          label: "面板不透明度",
          hint: "对应主题令牌 --glass-bg 的透明度",
          control: `<div class="rangeslider">
            <div class="slider" id="set-alpha" role="slider" tabindex="0" aria-label="不透明度" data-slider="glassAlpha">
              <div class="slider__rail"><div class="slider__fill"></div></div>
              <div class="slider__thumb"></div>
              <div class="slider__bubble"></div>
            </div>
            <span class="rangeslider__value">${Math.round(state.config.glassAlpha)}%</span>
          </div>`,
        })}
        ${settingRow({
          label: "界面动画",
          hint: "关闭后取消过渡与旋转动画，低性能设备更流畅",
          control: switchHtml("animations", state.config.animations, "界面动画"),
        })}
        ${settingRow({
          label: "主题色跟随封面",
          hint: "从当前封面提取主色，写入 --seed 令牌（需主题支持）",
          control: switchHtml("accentFromCover", state.config.accentFromCover, "主题色跟随封面"),
        })}
        ${settingRow({
          label: "显示专辑列",
          hint: "窄窗口下会自动隐藏该列",
          control: switchHtml("showAlbumColumn", state.config.showAlbumColumn, "显示专辑列"),
        })}
      </div>
    </section>`;
}

function playbackCard() {
  return `
    <section class="card" id="sec-playback" data-section="playback">
      <div class="card__head">
        <div class="card__icon">${icon("headphones")}</div>
        <div class="card__titles">
          <div class="card__title">播放</div>
          <div class="card__desc">播放模式、音量与播放界面默认样式</div>
        </div>
      </div>
      <div class="card__body">
        ${settingRow({
          label: "默认播放模式",
          hint: "点击底栏循环按钮可随时切换",
          control: segmented(
            "playMode",
            [
              { value: "sequence", label: "顺序" },
              { value: "loop-all", label: "列表循环" },
              { value: "loop-one", label: "单曲循环" },
              { value: "shuffle", label: "随机" },
            ],
            state.config.playMode
          ),
        })}
        ${settingRow({
          label: "播放界面默认样式",
          hint: "经典 / 沉浸 / 简约",
          control: segmented(
            "playerViewMode",
            [
              { value: "classic", label: "经典" },
              { value: "immersive", label: "沉浸" },
              { value: "minimal", label: "简约" },
            ],
            state.config.playerViewMode
          ),
        })}
        ${settingRow({
          label: "记忆音量",
          hint: `当前音量 ${Math.round(state.volume * 100)}%`,
          control: switchHtml("rememberVolume", true, "记忆音量"),
        })}
      </div>
    </section>`;
}

function lyricsCard() {
  return `
    <section class="card" id="sec-lyrics" data-section="lyrics">
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
          hint: "同名 .lrc 文件 → 音频内嵌歌词 → 在线匹配（可拖动排序，当前按此顺序）",
          control: `<span class="chip"><i class="chip__dot"></i>${state.config.lyricsSources.join(" → ")}</span>`,
        })}
        ${settingRow({
          label: "显示歌词",
          hint: "关闭后播放界面只显示封面",
          control: switchHtml("showLyrics", state.config.showLyrics, "显示歌词"),
        })}
        ${settingRow({
          label: "歌词字号",
          hint: "对应 --lyric-size，当前行会额外放大",
          control: `<div class="rangeslider">
            <div class="slider" id="set-lyric-size" role="slider" tabindex="0" aria-label="歌词字号" data-slider="lyricsFontSize">
              <div class="slider__rail"><div class="slider__fill"></div></div>
              <div class="slider__thumb"></div>
              <div class="slider__bubble"></div>
            </div>
            <span class="rangeslider__value">${Math.round(state.config.lyricsFontSize)}px</span>
          </div>`,
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

function aboutCard() {
  const s = state.lastScan;
  const total = state.songs.reduce((sum, x) => sum + x.duration, 0);
  const bytes = state.songs.reduce((sum, x) => sum + x.size, 0);
  return `
    <section class="card" id="sec-about" data-section="about">
      <div class="card__head">
        <div class="card__icon">${icon("info")}</div>
        <div class="card__titles">
          <div class="card__title">关于与数据</div>
          <div class="card__desc">曲库统计与缓存位置</div>
        </div>
      </div>
      <div class="kv">
        <div class="kv__k">曲库文件</div><div class="kv__v">${fmtCount(state.allSongsRaw.length)} 个</div>
        <div class="kv__k">过滤后歌曲</div><div class="kv__v">${fmtCount(state.songs.length)} 首</div>
        <div class="kv__k">被规则过滤</div><div class="kv__v">${fmtCount(s?.excluded ?? 0)} 个</div>
        <div class="kv__k">总时长</div><div class="kv__v">${Math.floor(total / 3600000)} 小时 ${Math.floor((total % 3600000) / 60000)} 分</div>
        <div class="kv__k">占用空间</div><div class="kv__v">${fmtSize(bytes)}</div>
        <div class="kv__k">上次扫描</div><div class="kv__v">${s ? new Date(s.at).toLocaleString("zh-CN") : "—"}</div>
        <div class="kv__k">缓存目录</div><div class="kv__v">${esc(state.config.cacheDir)}</div>
        <div class="kv__k">版本</div><div class="kv__v">0.1.0-ui-prototype（Go + Wails3）</div>
      </div>
      <div class="card__foot">
        <span>清空缓存不会删除任何本地音乐文件</span>
        <button class="btn btn--danger btn--sm" type="button" data-act="clear-cache">${icon("trash")}<span>清空缓存</span></button>
      </div>
    </section>`;
}

/* --------------------------------------------------------------------------
   主题色卡
   -------------------------------------------------------------------------- */
/**
 * 把主题色板写成样式表里的规则，而不是 HTML 行内 style。
 * 通过 CSSOM insertRule 写入（CSP style-src 'self' 允许），
 * 不用 <style>.textContent，也不用 blob: 样式表。
 */
function ensureSwatchStyles() {
  const themes = listThemes();
  const colors = [];
  for (const t of themes) {
    for (const c of t.swatch || []) if (!colors.includes(c)) colors.push(c);
  }
  const css = colors.map((c, i) => `[data-swatch="${i}"]{background:${c}}`).join("\n");
  replaceStyleRules("swatch-styles", css);

  return (t) => (t.swatch || []).map((c) => colors.indexOf(c));
}

/* --------------------------------------------------------------------------
   主渲染
   -------------------------------------------------------------------------- */
export function renderSettings(container) {
  ensureSwatchStyles();
  const sections = [
    { id: "folders", label: "音乐文件夹" },
    { id: "filters", label: "过滤规则" },
    { id: "appearance", label: "外观" },
    { id: "playback", label: "播放" },
    { id: "loudness", label: "响度均衡" },
    { id: "lyrics", label: "歌词" },
    { id: "about", label: "关于" },
  ];

  container.innerHTML = `
    <div class="settings">
      <div class="settings__nav" role="tablist">
        ${sections
          .map(
            (s, i) =>
              `<button class="settings__nav-item" type="button" role="tab" data-goto="${s.id}" aria-selected="${i === 0}">${esc(s.label)}</button>`
          )
          .join("")}
      </div>
      ${foldersCard()}
      ${rulesCard()}
      ${themeCard()}
      ${playbackCard()}
      ${loudnessCard()}
      ${lyricsCard()}
      ${aboutCard()}
    </div>`;
}

/* --------------------------------------------------------------------------
   响度均衡（EBU R128 测量 + 回放增益补偿）
   -------------------------------------------------------------------------- */
const LOUDNESS_TARGETS = [
  { value: -14, label: "-14 LUFS · 较响（流媒体常见）" },
  { value: -16, label: "-16 LUFS · 推荐（默认）" },
  { value: -18, label: "-18 LUFS · 温和" },
  { value: -23, label: "-23 LUFS · 广播标准（EBU R128）" },
];

const LOUDNESS_MODES = [
  { value: "off", label: "关闭" },
  { value: "track", label: "逐曲均衡" },
  { value: "album", label: "同专辑统一" },
];

function loudnessCard() {
  const cfg = state.config;
  const ls = state.loudnessState || {};
  const measured = ls.measured ?? 0;
  const missing = ls.missing ?? Math.max(0, state.songs.length - measured);
  const total = ls.total ?? state.songs.length;
  const available = ls.available !== false;
  const tools = state.ffmpegState || {};
  const sourceText = tools.describe || ls.describe || "检测中…";

  return `
    <section class="card" id="sec-loudness" data-section="loudness">
      <div class="card__head">
        <h2 class="card__title">${icon("scale")}<span>响度均衡</span></h2>
        <p class="card__desc">
          用 ffmpeg 按 EBU R128 测量每首歌的整合响度（LUFS），回放时按目标响度做增益补偿，
          让不同来源的歌曲音量听起来一致。测量结果会缓存，每首歌只测一次。
        </p>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>均衡模式</span>
          <small class="u-fs-xs u-dim">逐曲：每首歌都拉到目标响度；同专辑：整张专辑用同一个增益，保留专辑内部的强弱对比</small>
        </div>
        <div class="setting__control">
          <div class="segmented" data-segment="loudness-mode">
            ${LOUDNESS_MODES.map(
              (m) =>
                `<button class="segmented__btn" type="button" data-segment-value="${m.value}" aria-pressed="${cfg.loudnessMode === m.value}">${esc(m.label)}</button>`
            ).join("")}
          </div>
        </div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>目标响度</span>
          <small class="u-fs-xs u-dim">数字越小整体越轻。推荐 -16 LUFS</small>
        </div>
        <div class="setting__control">
          <select class="select" data-act="loudness-target">
            ${LOUDNESS_TARGETS.map(
              (t) =>
                `<option value="${t.value}" ${Number(cfg.loudnessTarget) === t.value ? "selected" : ""}>${esc(t.label)}</option>`
            ).join("")}
          </select>
        </div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>真峰值保护</span>
          <small class="u-fs-xs u-dim">抬升音量时限制增益，避免超过 ${-1} dBTP 造成削波失真</small>
        </div>
        <div class="setting__control">
          <button class="switch" type="button" role="switch" data-toggle="loudnessLimit" aria-checked="${Boolean(cfg.loudnessLimit)}">
            <span class="switch__thumb"></span>
          </button>
        </div>
      </div>

      <div class="setting setting--stack">
        <div class="progress-line" id="loudness-progress" hidden>
          <div class="progress-line__text" data-role="text">准备测量…</div>
          <div class="progress-line__track"><div class="progress-line__bar" data-role="bar" data-value="0"></div></div>
        </div>

        <div class="card__actions">
          <button class="btn btn--sm btn--primary" type="button" data-act="loudness-measure-all">${icon("bolt")}<span>测量全部歌曲</span></button>
          <button class="btn btn--sm" type="button" data-act="loudness-cancel">${icon("close")}<span>停止</span></button>
          <button class="btn btn--sm" type="button" data-act="loudness-refresh">${icon("refresh")}<span>重新拉取补偿</span></button>
          <button class="btn btn--sm btn--danger" type="button" data-act="loudness-clear">${icon("trash")}<span>清除测量数据</span></button>
        </div>

        <div class="setting__hint">
          已测量 <b>${measured}</b> / ${total} 首${missing ? `，还有 <b>${fmtCount(missing)}</b> 首未测量` : "（全部已测量）"}<br />
          ffmpeg：<b>${esc(available ? sourceText : "不可用")}</b>${available ? "（内置，开箱即用）" : " —— 转码与响度测量不可用"}
        </div>
      </div>
    </section>`;
}

/* --------------------------------------------------------------------------
   交互绑定（在 shell.js 中一次性绑定到内容容器上）
   -------------------------------------------------------------------------- */
export async function handleSettingsAction(actEl, ctx = {}) {
  const act = actEl.dataset.act;
  const id = actEl.dataset.id;

  switch (act) {
    /* 文件夹 */
    case "add-folder": {
      // 后端模式：由 Go 弹出系统目录选择器，选完直接写配置并开始扫描
      if (isWails()) {
        let res = null;
        try {
          res = await backend.addFolder("");
        } catch (err) {
          // 系统选择器打不开时（少见，但确实发生过）退化为手动输入，
          // 否则用户只会看到「点了没反应」。
          toast(`系统目录选择器不可用：${err?.message ?? err}`, { tone: "warning", duration: 5000 });
          res = null;
        }

        if (res === null) {
          const manual = await promptPath({ manual: true });
          if (!manual) return;
          try {
            res = await backend.addFolder(manual);
          } catch (err) {
            toast(`添加失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
            return;
          }
        }

        if (res?.cancelled) return;
        if (res?.duplicated) {
          toast(`该文件夹已在曲库中：${res.path}`, { tone: "warning" });
          return;
        }
        if (res?.folder) {
          state.folders = [...state.folders.filter((f) => f.id !== res.folder.id), res.folder];
          ctx.commit?.();
          toast(`已添加并开始扫描：${res.folder.path}`, { tone: "success" });
          // 扫描结果由后端 scan:done 事件推回来，这里不再重复触发 rescan，
          // 避免出现两次并发扫描（曲库会排队，但没必要让用户多等一轮）
        } else {
          toast("添加文件夹失败：后端没有返回结果", { tone: "error", duration: 6000 });
        }
        return;
      }

      // 预览模式：手动输入路径（无后端可用）
      const manual = await promptPath();
      if (!manual) return;
      state.folders.push({
        id: uid("folder"),
        path: manual,
        trackCount: 0,
        status: "ok",
        watching: state.config.watchFolders,
        addedAt: Date.now(),
      });
      ctx.commit?.();
      toast(`已添加文件夹：${manual}`, { tone: "success" });
      ctx.rescan?.();
      break;
    }
    case "remove-folder": {
      const folder = state.folders.find((f) => f.id === id);
      if (!folder) return;
      openModal({
        title: "移除音乐文件夹？",
        desc: `${folder.path}\n仅从曲库中移除，不会删除任何本地文件。`,
        okText: "移除",
        danger: true,
        onOk: async () => {
          if (isWails()) await backend.removeFolder(id);
          state.folders = state.folders.filter((f) => f.id !== id);
          ctx.commit?.();
          toast("已移除文件夹");
          ctx.rescan?.({ manual: false });
          return true;
        },
      });
      break;
    }
    case "scan-now":
      ctx.rescan?.({ manual: true });
      break;
    case "rescan-folder":
      toast("正在重新扫描该文件夹…");
      ctx.rescan?.({ manual: true });
      break;

    /* 规则 */
    case "rule-add":
      state.filterRules.push({
        id: uid("rule"),
        type: "regex",
        op: "match",
        value: "",
        scope: "exclude",
        enabled: true,
      });
      ctx.commit?.();
      break;
    case "rule-del":
      state.filterRules = state.filterRules.filter((r) => r.id !== id);
      ctx.commit?.();
      ctx.refreshRules?.();
      break;
    case "rule-toggle": {
      const rule = state.filterRules.find((r) => r.id === id);
      if (rule) rule.enabled = !rule.enabled;
      ctx.commit?.();
      ctx.refreshRules?.();
      break;
    }
    case "rule-scope": {
      const rule = state.filterRules.find((r) => r.id === id);
      if (rule) rule.scope = actEl.dataset.scope;
      ctx.commit?.();
      ctx.refreshRules?.();
      break;
    }
    case "preset-small":
      state.filterRules.push({
        id: uid("rule"),
        type: "size",
        op: "lt",
        value: "10240",
        unit: "B",
        scope: "exclude",
        enabled: true,
      });
      ctx.commit?.();
      ctx.refreshRules?.();
      toast("已添加：排除小于 10KB 的文件", { tone: "success" });
      break;
    case "preset-mp4":
      state.filterRules.push({
        id: uid("rule"),
        type: "regex",
        op: "match",
        value: "\\.mp4$",
        scope: "exclude",
        enabled: true,
      });
      ctx.commit?.();
      ctx.refreshRules?.();
      toast("已添加：排除 .mp4 文件", { tone: "success" });
      break;

    /* 外观 */
    case "theme-pick": {
      const themes = listThemes();
      const t = themes.find((x) => x.id === id);
      if (!t) return;
      state.config.theme = t.id;
      state.config.themeMode = t.mode;
      await applyResolvedTheme(state.config);
      ctx.commit?.();
      toast(`已切换到主题「${t.name}」`, { tone: "success", duration: 1600 });
      break;
    }
    case "open-theme-dir": {
      const dir = isWails() ? await backend.themeDir() : "";
      if (isWails()) await backend.revealThemeDir();
      toast(dir ? `已打开主题目录：${dir}` : "主题目录：frontend/src/styles/themes/", { duration: 3200 });
      break;
    }
    case "theme-help":
      openModal({
        title: "添加自定义主题",
        desc: "主题只声明设计令牌，不需要写组件样式，因此可以随便换皮肤而不会破坏布局。",
        body: `
          <div class="setting__hint setting__hint--steps">
            1. 点「打开主题文件夹」，复制里面的 <b>_template.css</b> 为目标文件，例如 <b>sunset.css</b><br />
            2. 把选择器改成 <b>:root[data-theme="sunset"]</b>（与文件名一致最省事）<br />
            3. 只改你关心的令牌，例如 <b>--glass-bg</b> / <b>--accent</b> / <b>--text-1</b><br />
            4. 回到设置界面重新打开本页，即可看到新主题卡片
          </div>
          <div class="setting__hint">未声明的令牌会自动回退到默认主题，缺失也不会写坏布局。</div>`,
        okText: "知道了",
        cancelText: "关闭",
        onOk: () => true,
      });
      break;
    case "reload-themes":
      if (isWails()) {
        const list = await backend.reloadThemes();
        await discoverThemes();
        ctx.commit?.();
        toast(`已重新扫描到 ${list?.length ?? 0} 个主题`, { tone: "success" });
      } else {
        toast("浏览器预览模式下仅内置主题可用", { tone: "warning" });
      }
      break;
    case "clear-cache":
      toast("缓存清理需在后端实现（当前仅保存元数据缓存文件）", { tone: "warning" });
      break;

    /* 响度均衡 */
    case "loudness-measure-all": {
      if (!isWails()) {
        toast("响度测量需要后端支持，浏览器预览不可用", { tone: "warning" });
        return;
      }
      const box = document.querySelector("#loudness-progress");
      if (box) box.hidden = false;
      try {
        const res = await backend.loudnessMeasureAll();
        if (!res?.started) {
          toast(res?.reason === "already-measuring" ? "已在测量中" : `无法开始测量：${res?.reason ?? "未知原因"}`, {
            tone: "warning",
          });
          if (box) box.hidden = true;
          return;
        }
        toast(`开始测量 ${res.total} 首歌曲的响度…`, { duration: 2500 });
      } catch (err) {
        if (box) box.hidden = true;
        toast(`无法开始测量：${err?.message ?? err}`, { tone: "error", duration: 6000 });
      }
      break;
    }
    case "loudness-cancel":
      if (isWails()) {
        await backend.loudnessCancel();
        toast("已请求停止测量");
      }
      break;
    case "loudness-refresh": {
      if (!isWails()) return;
      await refreshLoudnessGains();
      const ls = await refreshLoudnessState();
      ctx.commit?.();
      toast(`已重新拉取补偿（已测量 ${ls?.measured ?? 0} 首）`, { tone: "success" });
      break;
    }
    case "loudness-clear": {
      if (!isWails()) return;
      openModal({
        title: "清除响度测量数据？",
        desc: "只会删除测量缓存，不会动你的音乐文件。清除后再次启用响度均衡会重新测量。",
        okText: "清除",
        danger: true,
        onOk: async () => {
          await backend.loudnessClear();
          state.loudnessGains = {};
          await refreshLoudnessState();
          ctx.commit?.();
          renderContent();
          toast("已清除响度测量数据", { tone: "success" });
          return true;
        },
      });
      break;
    }

    case "loudness-target": {
      const v = Number(actEl.value);
      state.config.loudnessTarget = v;
      ctx.commit?.();
      await refreshLoudnessGains();
      toast(`目标响度已设为 ${v} LUFS`, { tone: "success", duration: 2000 });
      break;
    }

    default:
      break;
  }
}

function promptPath({ manual = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title: "添加音乐文件夹",
      desc: manual
        ? "系统目录选择器没能打开，请直接粘贴文件夹完整路径。"
        : "浏览器预览模式下无法调用系统目录选择器，请手动输入路径。",
      body: `<input class="input" data-field="path" type="text" placeholder="C:\\Users\\Example\\Music" />`,
      okText: "添加",
      onOk: (values) => {
        const p = String(values.path || "").trim();
        if (!p) return "请输入路径";
        resolve(p);
        return true;
      },
    });
  });
}

/* --------------------------------------------------------------------------
   通用设置控件（开关 / 分段 / 滑杆）
   -------------------------------------------------------------------------- */
export function handleSettingControl(actEl, ctx = {}) {
  const toggleKey = actEl.dataset.toggle;
  if (toggleKey) {
    const next = actEl.getAttribute("aria-checked") !== "true";
    actEl.setAttribute("aria-checked", String(next));
    if (toggleKey in state.config) {
      state.config[toggleKey] = next;
      if (toggleKey === "animations") {
        setRuntimeToken("--dur", next ? null : "0.001ms");
      }
      if (toggleKey === "watchFolders") {
        state.folders.forEach((f) => (f.watching = next));
      }
    }
    ctx.commit?.();
    return true;
  }

  const segKey = actEl.closest("[data-segment]")?.dataset.segment;
  if (segKey) {
    const value = actEl.dataset.value;
    actEl.parentElement.querySelectorAll(".segmented__btn").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === actEl));
    });
    if (segKey === "themeMode") {
      state.config.themeMode = value;
      const themes = listThemes();
      const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const preferred = value === "system" ? (sysDark ? "dark" : "light") : value;
      const t = themes.find((x) => x.mode === preferred && x.id !== "cover-dark") || themes[0];
      state.config.theme = t.id;
      applyResolvedTheme(state.config);
    } else if (segKey in state.config) {
      const numeric = ["lyricsLines", "scanConcurrency"];
      state.config[segKey] = numeric.includes(segKey) ? Number(value) : value;
      if (segKey === "lyricsLines") {
        setRuntimeToken("--lyric-pad", `${50 - Number(value) * 4}%`);
      }
      if (segKey === "loudnessMode") {
        // 模式切换后需要重新拉取补偿增益表（off→on 或 track↔album）
        refreshLoudnessGains();
      }
    }
    ctx.commit?.();
    return true;
  }

  return false;
}

export function bindSettingsSliders(container, ctx = {}) {
  container.querySelectorAll("[data-slider]").forEach((root) => {
    if (root.dataset.sliderBound === "1") return;
    root.dataset.sliderBound = "1";
    const key = root.dataset.slider;
    const isBlur = key === "glassBlur";
    const isAlpha = key === "glassAlpha";
    const min = key === "lyricsFontSize" ? 12 : isBlur ? 0 : isAlpha ? 20 : 0;
    const max = key === "lyricsFontSize" ? 26 : isBlur ? 48 : isAlpha ? 95 : 100;
    import("./slider.js").then(({ createSlider }) => {
      const label = root.parentElement.querySelector(".rangeslider__value");
      createSlider(root, {
        min,
        max,
        step: 1,
        value: isBlur && !state.config.glassBlurCustom ? resolvedGlassBlur() : state.config[key] ?? min,
        format: (v) => `${Math.round(v)}${isBlur ? "px" : isAlpha ? "%" : "px"}`,
        onChange: (v) => {
          state.config[key] = v;
          if (label) label.textContent = `${Math.round(v)}${isBlur ? "px" : isAlpha ? "%" : "px"}`;
          if (isBlur) {
            state.config.glassBlurCustom = true;
            setRuntimeToken("--glass-blur", `${v}px`);
          }
          if (isAlpha) setRuntimeToken("--glass-alpha", String(v / 100));
          if (key === "lyricsFontSize") setRuntimeToken("--lyric-size", `${v}px`);
        },
        onCommit: () => ctx.commit?.(),
      });
    });
  });
}

export function scrollToSection(id) {
  const node = document.querySelector(`[data-section="${id}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "start" });
}
