// @ts-check
/* ==========================================================================
   index.js — @localmusicplayer/player-skins 包入口（契约 v3）
   --------------------------------------------------------------------------
   包职责：
     · 定义**插件接口**（contract.js）；
     · 提供插件可复用的渲染零件（sdk.js → ctx.sdk）；
     · 提供配色契约的实现（colors.js → 宿主壳层 --chrome-*）；
     · 提供**加载器**：把「清单 + 入口 + CSS」变成一个注册表里的插件，
       并把插件 CSS 包成 `@layer skin { @scope (<舞台根>) { … } }` 注入；
     · 提供一个注册表：宿主用它列样式、按 id 取样式。

   ★ v3 起本包**不再内置任何具体样式**：
     内置样式与第三方样式都走同一条运行期加载路径（唯一的区别是来源根目录，
     见 Go 侧 internal/skins 的双根扫描）。于是"加/删一款内置样式"不再需要
     改这个包的源码、也不需要重新打包前端 —— 这正是插件系统该有的样子。
     `BUILTIN_SKINS` 由宿主加载器在发现内置样式时填充。
   ========================================================================== */

import {
  SKIN_API_VERSION,
  HOST_API_VERSION,
  PATCH_TYPES,
  composeSkin,
  defineSkin,
  inspectSkinModule,
  parseApiVersion,
  apiStatus,
} from "./contract.js";
import { deriveChrome, applyChromeVars, clearChromeVars, CHROME_VAR_NAMES } from "./colors.js";
import { createSdk } from "./sdk.js";
// SDK 的「骨架样式表」：它们给 ctx.sdk 里的渲染零件提供基础布局
//（.lyric / .fxl / .skin-bg 这些类名）。由宿主一起加载、**不在 skin 层**里 ——
// 也就是说插件 CSS 改不动它们：想定制就传零件选项或设它读的 CSS 变量
//（例如 --lyric-size），想完全自己来就别用这些零件。
import "./lyrics.css";
import "./fx-lyrics.css";
import "./background-layer.css";

/* --------------------------------------------------------------------------
   公开的零件（宿主内部用 / 测试用；插件通过 ctx.sdk 拿，不要从包里 import）
   -------------------------------------------------------------------------- */

export { SKIN_API_VERSION, HOST_API_VERSION, PATCH_TYPES, defineSkin, inspectSkinModule, composeSkin };
export { parseApiVersion, apiStatus };
export { deriveChrome, applyChromeVars, clearChromeVars, CHROME_VAR_NAMES };
export { createSdk };
export { createLyricsView } from "./lyrics-view.js";
export { createFxLyrics } from "./fx-lyrics.js";
export { createCamera } from "./fx-camera.js";
export { createBackgroundLayer } from "./background-layer.js";
export { applyFit, fitScale, fitScaleOf, FIT_REFERENCE, FIT_MIN, FIT_MAX } from "./fit.js";
export {
  parseLrc,
  parseLyricDraft,
  serializeLrc,
  shiftLrc,
  lrcTimeRange,
  mergeDraftTimes,
  formatLrcTime,
  findLyricIndex,
  lyricDisplayText,
} from "./lrc.js";
export { EMPTY_TRACK, escapeHtml, setCoverImage, subtitleOf, lyricsEmptyText } from "./html.js";

/** 兜底样式：配置里写的 id 不认识时用它 */
export const DEFAULT_SKIN_ID = "classic";

/* --------------------------------------------------------------------------
   注册表
   -------------------------------------------------------------------------- */

/** @type {Map<string, import("./contract.js").PlayerSkin>} */
const registry = new Map();

/**
 * 内置样式清单（**由宿主加载器填充**）。
 *
 * 它不再是"源码里写死的六款"，而是"这次扫描里标了 builtin 的那几款"：
 * 内置样式随包分发在只读资源目录，与数据目录里的第三方样式一起被扫描。
 *
 * @type {import("./contract.js").PlayerSkin[]}
 */
export const BUILTIN_SKINS = [];

/** 加载器发现一款内置样式时调用（保持 BUILTIN_SKINS 与实际注册表一致） */
export function noteBuiltin(skin) {
  if (!skin) return;
  const i = BUILTIN_SKINS.findIndex((s) => s.id === skin.id);
  if (i >= 0) BUILTIN_SKINS[i] = skin;
  else BUILTIN_SKINS.push(skin);
}

/** 内置清单整体对齐（重扫时用：先清空再逐个 noteBuiltin） */
export function resetBuiltins() {
  BUILTIN_SKINS.length = 0;
}

/**
 * 注册（或覆盖）一个插件。
 * @param {import("./contract.js").PlayerSkin} skin
 */
export function registerSkin(skin) {
  const normalized = defineSkin(skin);
  registry.set(normalized.id, normalized);
  return normalized;
}

/**
 * 已注册的全部样式，按 order 升序（order 相同按 id，保证顺序稳定）。
 * @returns {import("./contract.js").PlayerSkin[]}
 */
export function listSkins() {
  return [...registry.values()].sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id)));
}

/**
 * 按 id 取样式；不认识时返回 null（调用方决定要不要兜底）。
 * @param {string} id
 */
export function getSkin(id) {
  return registry.get(id) ?? null;
}

/**
 * 注销一个样式（重扫时把"这次没扫到的"清掉，注册表才是磁盘的真话）。
 *
 * 内置样式**不能**注销：它们来自只读资源目录，磁盘上没有可删的目录；
 * 把它们的 <style> 一起摘掉会让"重扫"变成"把内置样式弄丢"。
 *
 * @param {string} id
 * @returns {boolean} 是否真的移除了一个已注册的样式
 */
export function unregisterSkin(id) {
  const key = String(id ?? "").trim();
  if (!key) return false;
  if (BUILTIN_SKINS.some((s) => s.id === key)) return false;
  removeSkinStyles(key);
  return registry.delete(key);
}

/**
 * 取样式；id 不认识时退回默认样式（并把原因回传给调用方，便于提示用户）。
 * @param {string} id
 * @returns {{ skin: import("./contract.js").PlayerSkin, fellBack: boolean }}
 */
export function resolveSkin(id) {
  const found = getSkin(id);
  if (found) return { skin: found, fellBack: false };
  const fallback = getSkin(DEFAULT_SKIN_ID) || listSkins()[0];
  return { skin: /** @type {any} */ (fallback), fellBack: true };
}

/* --------------------------------------------------------------------------
   CSS 注入：宿主强制包裹 @layer + @scope
   --------------------------------------------------------------------------
   ★ 这一层是 v3 隔离机制的一半（另一半是"颜色只能通过声明影响宿主"）：
     · `@layer skin`  —— 插件 CSS 落在最低优先级的层里，压不过宿主壳的规则；
     · `@scope (...)` —— 插件选择器只在**自己的舞台**里生效，
       写 `.playerbar { … }`、`* { … }` 都匹配不到宿主的控件栏与浮层。
   于是插件既不用自己写作用域前缀（写错也不会污染别的界面），
   也不可能改到宿主 UI —— 从"约定"升级成"机制"。
   -------------------------------------------------------------------------- */

/** @type {Map<string, HTMLStyleElement>} */
const styleEls = new Map();

/** 把 id 安全地塞进属性选择器（id 来自目录名，可能带引号之类的怪字符） */
function cssAttr(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

/** 当前内核是否支持 @scope（Chromium 118+ 暴露 CSSScopeRule） */
function supportsScope() {
  return typeof CSSScopeRule !== "undefined";
}

/**
 * 把一段插件 CSS 包成「skin 层 + 舞台作用域」。
 *
 * 不支持 @scope 的老内核上退化成只包 `@layer skin`（并让调用方 warn 一次）：
 * 这时作用域要靠插件自带的选择器前缀，安全性下降但不至于不能用。
 *
 * @param {string} css
 * @param {string} skinId
 * @param {boolean} background 是否声明了整窗背景层（背景层在 .playerview 之外）
 */
export function wrapPluginCss(css, skinId, background) {
  const roots = [`.playerview[data-skin="${cssAttr(skinId)}"]`];
  if (background) roots.push(`.skin-bg[data-skin="${cssAttr(skinId)}"]`);
  const scope = `@scope (${roots.join(", ")})`;
  if (!supportsScope()) {
    console.warn("[skins] 当前内核不支持 @scope，插件 CSS 只做了 @layer 包装（建议更新 WebView2）");
    return `@layer skin {\n${css}\n}`;
  }
  return `@layer skin {\n${scope} {\n${css}\n}\n}`;
}

/** 摘掉某个样式的 <style>（切换 / 卸载 / 重扫时用） */
export function removeSkinStyles(skinId) {
  const el = styleEls.get(skinId);
  if (el) {
    el.remove();
    styleEls.delete(skinId);
  }
}

/** 摘掉全部插件样式（重扫前清场） */
export function clearAllSkinStyles() {
  for (const id of [...styleEls.keys()]) removeSkinStyles(id);
}

/**
 * 注入插件的 CSS：**先把文本抓回来**再包层注入。
 *
 * 为什么不用 <link>：`@layer` / `@scope` 都是"包裹"语义，无法作用到外链样式表的内容；
 * 而外链样式表又必须能被包进层里，才能保证插件压不过宿主壳。
 * CSS 体积都不大（单款样式 2~70KB），一次 fetch + 一次 replace 完全可接受。
 *
 * @param {string} skinId
 * @param {string[]} hrefs 可直接 fetch 的 URL
 * @param {{background?:boolean}} [opts]
 */
export async function injectSkinStyles(skinId, hrefs, opts = {}) {
  removeSkinStyles(skinId);
  const list = (hrefs || []).filter(Boolean);
  if (!list.length) return;
  const texts = await Promise.all(
    list.map(async (href) => {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) throw new Error(`读取样式表失败（${res.status}）：${href}`);
      return res.text();
    })
  );
  const style = document.createElement("style");
  style.dataset.skin = skinId;
  style.textContent = wrapPluginCss(texts.join("\n"), skinId, opts.background === true);
  document.head.appendChild(style);
  styleEls.set(skinId, style);
}

/* --------------------------------------------------------------------------
   加载器
   -------------------------------------------------------------------------- */

/**
 * 加载一款插件（内置与第三方走同一条路）。
 *
 * @param {{
 *   manifest: import("./contract.js").SkinManifest,
 *   moduleUrl: string,
 *   cssUrls?: string[],
 *   iconUrl?: string,
 *   builtin?: boolean,
 *   source?: string,
 * }} info
 * @returns {Promise<import("./contract.js").PlayerSkin>}
 */
export async function loadSkin(info) {
  const manifest = info?.manifest;
  if (!manifest || !manifest.id) throw new Error("清单缺少 id");
  if (!manifest.name) throw new Error(`样式 ${manifest.id} 的清单缺少 name`);

  const st = apiStatus(manifest.apiVersion);
  if (!st.ok) throw new Error(st.reason);

  const mod = await import(/* @vite-ignore */ String(info.moduleUrl));
  // 配色先算：缺失/非法要在设置页能看见（警告图标），而"算出来的壳色"宿主马上要用
  const chrome = deriveChrome(manifest.colors);
  const verdict = inspectSkinModule(mod, manifest, {
    builtin: info.builtin === true,
    source: info.source || "",
    iconUrl: info.iconUrl || "",
    colorsMissing: chrome.missing,
  });
  if (!verdict.ok || !verdict.skin) throw new Error(verdict.reason || "插件不合法");

  const skin = verdict.skin;
  skin.chrome = chrome;
  await injectSkinStyles(skin.id, info.cssUrls || skin.styles, { background: skin.background });
  registerSkin(skin);
  if (skin.builtin) noteBuiltin(skin);
  return skin;
}

/**
 * 从磁盘清单加载一款第三方样式（桌面背景歌词窗口只需要 resolve 时用不到）。
 *
 * @deprecated v3 起用 {@link loadSkin}：它同时服务内置与第三方。
 */
export function loadExternalSkin() {
  throw new Error("loadExternalSkin 已在契约 v3 移除，请改用 loadSkin({ manifest, moduleUrl, cssUrls })");
}
