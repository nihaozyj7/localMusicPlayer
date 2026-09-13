/* ==========================================================================
   theme.js — 主题注册与切换
   --------------------------------------------------------------------------
   · 一个主题 = styles/themes/ 下的一个 CSS 文件（文件名即 data-theme 值）
   · 浏览器预览无法列目录，故内置主题在此登记；接入 Go 后端后，
     backend.listThemes() 会扫描 themes/ 目录并把新主题自动注入 <link>，
     无需修改任何组件代码（满足需求 A8）。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { setRuntimeTokens, replaceStyleRules } from "./runtime-tokens.js";

/** 内置主题登记表（新增主题时可在此追加，或依赖后端自动扫描） */
const BUILTIN_THEMES = [
  {
    id: "dark-minimal",
    name: "深色 · 黑白极简",
    mode: "dark",
    builtin: true,
    swatch: ["#08080a", "#1b1b1f", "#3a3a42", "#f4f4f6", "#ff4d6d"],
  },
  {
    id: "light-minimal",
    name: "浅色 · 黑白极简",
    mode: "light",
    builtin: true,
    swatch: ["#f2f2f4", "#ffffff", "#d8d8dd", "#14141a", "#e8384f"],
  },
  {
    id: "cover-dark",
    name: "封面取色 · 深色",
    mode: "dark",
    builtin: true,
    swatch: ["#0b0b12", "#2a2a31", "#6b6b76", "#f7f7fa", "#ff4d6d"],
  },
];

const registry = BUILTIN_THEMES.slice();

export function listThemes() {
  return registry;
}

export function getTheme(id) {
  return registry.find((t) => t.id === id) || registry[0];
}

/**
 * 后端模式：扫描用户主题目录并把每个主题的 CSS 注入为独立样式表。
 * 这样用户往 %APPDATA%\MusicPlayer\themes\ 丢一个 CSS 文件，
 * 打开设置界面就能看到新主题 —— 不需要改任何前端文件（需求 A8）。
 */
export async function discoverThemes() {
  if (!isWails()) return registry;
  try {
    const res = await backend.listThemes();
    if (!Array.isArray(res) || !res.length) return registry;

    for (const t of res) {
      if (!t?.id) continue;
      const css = await backend.loadTheme(t.id);
      if (typeof css === "string" && css.trim()) injectTheme(t.id, css);

      const existing = registry.find((x) => x.id === t.id);
      const entry = {
        id: t.id,
        name: t.name || t.id,
        mode: t.mode || "dark",
        swatch: Array.isArray(t.swatch) ? t.swatch : [],
        builtin: Boolean(t.builtin) || Boolean(existing?.builtin),
      };
      if (existing) Object.assign(existing, entry);
      else registry.push(entry);
    }
  } catch (err) {
    console.warn("[theme] 主题目录扫描失败", err);
  }
  return registry;
}

/**
 * 把后端返回或用户自定义的主题 CSS 挂载为样式表。
 * 用 CSSOM 的 insertRule 写入，避免 CSP 对 <style>.textContent 与 blob: 样式表的拦截。
 */
export function injectTheme(id, css) {
  replaceStyleRules(`theme-file-${id}`, css);
}

/** 读取 CSS 变量（如封面取色时回读 --accent） */
function rootVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * 应用主题：
 *  1. 解析深浅模式（dark / light / system）
 *  2. 写入 data-theme
 *  3. 应用毛玻璃强度与不透明度覆盖
 *  4. 处理封面取色主题的种子色
 */
export async function applyResolvedTheme(config) {
  const html = document.documentElement;
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  let themeId = config.theme || "dark-minimal";
  if (config.themeMode === "system") {
    const wanted = sysDark ? "dark" : "light";
    const fallback = registry.find((t) => t.mode === wanted && t.id !== "cover-dark");
    if (fallback) themeId = fallback.id;
  } else if (registry.find((t) => t.id === themeId)?.mode !== config.themeMode) {
    const fallback = registry.find((t) => t.mode === config.themeMode && t.id !== "cover-dark");
    if (fallback) themeId = fallback.id;
  }

  html.dataset.theme = themeId;
  // 解析出来的深浅模式也写进 DOM：播放界面皮肤通过 ctx.mode 读它
  // （皮肤拿不到 config，也不该为了知道深浅色去 import 主题模块）
  html.dataset.mode = registry.find((t) => t.id === themeId)?.mode || config.themeMode || "dark";
  config.theme = themeId;

  // 动画开关始终生效；毛玻璃强度只有在用户手动调过之后才覆盖主题自带的值，
  // 否则无论切到哪个主题都会显示成配置里的 22px（主题自己的 26px 就看不到了）。
  setRuntimeTokens({
    "--glass-blur": config.glassBlurCustom ? `${config.glassBlur}px` : null,
    "--dur": config.animations === false ? "0.001ms" : null,
  });

  forceStyleRefresh();
  // 用户手动调过面板透明度时，换主题后按新主题的底色重新套一遍
  if (config.glassAlphaCustom) applyGlassAlpha(config.glassAlpha);
  return themeId;
}

/* --------------------------------------------------------------------------
   面板透明度（真正的「背景不透明度」）
   --------------------------------------------------------------------------
   内置主题把 --glass-bg 写成各自的 rgba/color-mix，直接改 --glass-alpha 没有主题
   会消费它（那只是预留令牌）。这里用一个小探针元素把当前主题的底色解析成 rgb，
   再按用户给的百分比重新合成 rgba 写回，于是「背景不透明度」能够真正生效，
   并且换主题时会基于新主题的底色重新计算。
   -------------------------------------------------------------------------- */
let alphaProbe = null;

function resolveThemeColor(expr) {
  if (!alphaProbe) {
    alphaProbe = document.createElement("div");
    alphaProbe.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;";
    document.body.appendChild(alphaProbe);
  }
  alphaProbe.style.backgroundColor = expr;
  return getComputedStyle(alphaProbe).backgroundColor;
}

function rgbaWithAlpha(color, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  const text = String(color);
  // 普通 rgb()/rgba()
  const rgb = text.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const parts = rgb[1].split(/[,/]/).map((s) => parseFloat(s.trim()));
    const [r, g, b] = parts;
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
    }
  }
  // color-mix 等会解析成 color(srgb r g b / a)，分量为 0-1
  const srgb = text.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (srgb) {
    const [r, g, b] = srgb.slice(1, 4).map((n) => Math.round(parseFloat(n) * 255));
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  return null;
}

/** 读当前主题实际生效的面板透明度百分比（用于滑块初值） */
export function resolvedGlassAlpha() {
  const text = String(resolveThemeColor("var(--glass-bg)"));
  const rgba = text.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
  const slash = text.match(/\/\s*([\d.]+)\s*\)/);
  const a = parseFloat((rgba && rgba[1]) || (slash && slash[1]) || "");
  return Number.isFinite(a) ? Math.round(a * 100) : 62;
}

/** 按百分比（0-100）设置面板背景的不透明度 */
export function applyGlassAlpha(percent) {
  const a = Math.max(0, Math.min(1, (Number(percent) || 0) / 100));
  // 先清掉上一轮覆盖，才能读到「当前主题真实的」底色
  setRuntimeTokens({ "--glass-bg": null, "--glass-bg-strong": null, "--glass-bg-weak": null });
  const bg = resolveThemeColor("var(--glass-bg)");
  const strong = resolveThemeColor("var(--glass-bg-strong)");
  const weak = resolveThemeColor("var(--glass-bg-weak)");
  setRuntimeTokens({
    "--glass-bg": rgbaWithAlpha(bg, a),
    "--glass-bg-strong": rgbaWithAlpha(strong, Math.min(1, a + 0.18)),
    "--glass-bg-weak": rgbaWithAlpha(weak, Math.max(0, a - 0.22)),
  });
}

/**
 * 强制重算全页样式。
 *
 * 为什么要这么绕：主题令牌来自样式表里的 import 语句（打包器会把它内联成真正的 CSS），
 * 实测在 WebView2/Chromium 上只改根节点的 data-theme 时，**已经存在的元素**不会重新解析
 * var(--…) —— 它们的计算样式停在旧主题上。症状就是切到浅色主题后，侧边栏文字仍然是
 * 深色主题的浅灰（还带着旧主题的旧数值），落在浅色背景上几乎看不见。
 * 新建的元素是正常的，所以这个问题只在"切换主题"时暴露。
 *
 * 改一下 body 上那个不参与任何样式的 data-route 属性，会让整棵子树失效重算，
 * 但不重建 DOM，因此不丢焦点、不闪屏。
 */
function forceStyleRefresh() {
  const body = document.body;
  if (!body) return;
  body.dataset.styleEpoch = String((Number(body.dataset.styleEpoch) || 0) + 1);
}

/** 读取当前主题实际生效的毛玻璃模糊半径（px） */
export function resolvedGlassBlur() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--glass-blur");
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 22;
}

/**
 * 把当前封面主色写入 --seed / --seed-2（供 cover-dark 等主题使用）。
 * 真实实现由 Go 侧解码封面取色；这里用占位色保证预览可用。
 */
export function applyCoverSeed(seedHex, seed2Hex) {
  setRuntimeTokens({
    "--seed": seedHex || null,
    "--seed-2": seed2Hex || null,
  });
}

/** 从图片元素提取平均色（浏览器预览用的简易取色） */
export function extractCoverSeed(imgEl) {
  try {
    const canvas = document.createElement("canvas");
    const size = 24;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(imgEl, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
    if (!n) return null;
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
  } catch {
    return null; // 跨域或 data URL 限制时静默失败
  }
}

export { rootVar };
