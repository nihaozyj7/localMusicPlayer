// @ts-check
/* ==========================================================================
   index.js — @musicplayer/player-skins 包入口
   --------------------------------------------------------------------------
   包职责（需求原文：「把内置的这三种播放器界面抽离出去作为一个单独的包，
   这个包里面提供播放详情界面的背景渲染和交互（歌词的渲染也包含在内）」）：
     · 定义**皮肤接口**（contract.js）；
     · 提供歌词渲染器与整窗背景层的可复用实现；
     · 内置八种样式：经典 / 沉浸 / 简约 / 二次元手绘 / 深邃宇宙 / 科幻末世 / 游戏风 / 魔法阵；
     · 提供一个注册表：宿主用它列样式、按 id 取样式，第三方皮肤也能注册进来。

   扩展方式（两条路，接口完全一样）：
     1. 源码内新增：在本包 src/skins/ 下加一个模块并在这里 import；
     2. 运行时新增：把皮肤目录丢进数据目录 `<数据目录>/player-skins/<id>/`
        （见 README.md），宿主启动时通过清单发现它并 import 进来。
   ========================================================================== */

import { SKIN_API_VERSION, defineSkin, inspectSkinModule } from "./contract.js";
import classic from "./skins/classic.js";
import immersive from "./skins/immersive.js";
import minimal from "./skins/minimal.js";
import anime from "./skins/anime.js";
import cosmos from "./skins/cosmos.js";
import wasteland from "./skins/wasteland.js";
import arcade from "./skins/arcade.js";
import magia from "./skins/magia.js";
import "./lyrics.css";
import "./background-layer.css";
// 特效歌词渲染器（fx-lyrics.js）的骨架样式：四个特效样式共用，必须有这一行，
// 否则 .fxl / .fxl__scroll 完全没有布局，歌词会退化成一列不可滚动的纯文本。
import "./fx-lyrics.css";

/** 内置样式（顺序即按钮组顺序的默认依据） */
export const BUILTIN_SKINS = [classic, immersive, minimal, anime, cosmos, wasteland, arcade, magia];

/** 兜底样式：配置里写的 id 不认识时用它 */
export const DEFAULT_SKIN_ID = "classic";

export { defineSkin, inspectSkinModule, SKIN_API_VERSION };
export { PATCH_TYPES } from "./contract.js";
export { parseLrc, findLyricIndex } from "./lrc.js";
export { createLyricsView } from "./lyrics-view.js";
export { createBackgroundLayer } from "./background-layer.js";
export { escapeHtml, setCoverImage, subtitleOf } from "./html.js";

/* --------------------------------------------------------------------------
   注册表
   -------------------------------------------------------------------------- */

/** @type {Map<string, import("./contract.js").PlayerSkin>} */
const registry = new Map();

for (const skin of BUILTIN_SKINS) registry.set(skin.id, skin);

/**
 * 注册（或覆盖）一个皮肤。
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
 * 注销一个**运行时加载**的第三方样式（内置样式不能注销）。
 *
 * 为什么需要它：注册表是「只加不减」的话，用户把样式包目录删掉、宿主重扫之后，
 * 按钮组里那个样式仍然在（点它还会去 import 一个已经不存在的模块）。
 * 宿主在重扫时用本函数把「这次没扫到的」清掉，注册表才是磁盘的真话。
 *
 * 连它注入过的 <link> 一起摘掉：留着的话下次用同名 id 重新导入时，
 * 旧样式表会继续生效，出现「同一个 id 两套 CSS 同时命中」的怪现象。
 *
 * @param {string} id
 * @returns {boolean} 是否真的移除了一个已注册的样式
 */
export function unregisterSkin(id) {
  const key = String(id ?? "").trim();
  if (!key) return false;
  // 内置样式来自包本身，磁盘上没有对应目录，永远不注销
  if (BUILTIN_SKINS.some((s) => s.id === key)) return false;

  // 无 DOM 环境（单测）里没有 <link> 可摘，只清注册表
  const links = typeof document === "undefined" ? [] : document.querySelectorAll(`link[data-skin="${cssAttr(key)}"]`);
  for (const link of links) link.remove();
  for (const used of [...injectedStyles]) {
    if (used.startsWith(`${key}:`)) injectedStyles.delete(used);
  }
  return registry.delete(key);
}

/** 把 id 安全地塞进属性选择器（id 来自磁盘目录名，可能带引号之类的怪字符） */
function cssAttr(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

/**
 * 取样式；id 不认识时退回默认样式（并把原因回传给调用方，便于提示用户）。
 * @param {string} id
 * @returns {{ skin: import("./contract.js").PlayerSkin, fellBack: boolean }}
 */
export function resolveSkin(id) {
  const found = getSkin(id);
  if (found) return { skin: found, fellBack: false };
  return { skin: getSkin(DEFAULT_SKIN_ID) || BUILTIN_SKINS[0], fellBack: true };
}

/* --------------------------------------------------------------------------
   运行时加载第三方皮肤
   -------------------------------------------------------------------------- */

/** 已经注入过的 <link>，避免重复插入（同一皮肤反复切换时不该反复请求 CSS） */
const injectedStyles = new Set();

/**
 * 给外部皮肤注入它声明的样式表。
 *
 * 为什么用 <link> 而不是在皮肤模块里 `import "./skin.css"`：
 * 浏览器原生 ESM 不能 import CSS（那需要打包器），而外部皮肤是运行时
 * 直接 import 的模块。所以约定「清单里声明 css 文件，宿主负责插 <link>」。
 *
 * @param {string} skinId
 * @param {string[]} hrefs 绝对/相对 URL
 */
export function injectSkinStyles(skinId, hrefs = []) {
  for (const href of hrefs) {
    const key = `${skinId}:${href}`;
    if (injectedStyles.has(key)) continue;
    injectedStyles.add(key);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.skin = skinId;
    document.head.appendChild(link);
  }
}

/**
 * 从 URL 动态加载一个外部皮肤并注册。
 *
 * 失败一律抛出可读错误：调用方（宿主）会把它显示在样式按钮组里/控制台，
 * 而不是留下一个「点了没反应」的按钮。
 *
 * @param {{id:string, name?:string, module:string, styles?:string[]}} info
 *        module / styles 必须是可直接 fetch 的 URL
 * @returns {Promise<import("./contract.js").PlayerSkin>}
 */
export async function loadExternalSkin(info) {
  if (!info?.id || !info?.module) throw new Error("皮肤清单缺少 id / module");
  const mod = await import(/* @vite-ignore */ info.module);
  const verdict = inspectSkinModule(mod);
  if (!verdict.ok) throw new Error(`皮肤 ${info.id} 不合法：${verdict.reason}`);

  const skin = verdict.skin;
  // 清单里的 name / styles 优先于模块内声明（清单是运维侧信息，模块是代码侧信息）
  if (info.name) skin.name = info.name;
  skin.builtin = false;
  skin.source = info.module;
  injectSkinStyles(skin.id, info.styles || skin.styles || []);
  registerSkin(skin);
  return skin;
}
