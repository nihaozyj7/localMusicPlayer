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

let registry = BUILTIN_THEMES.slice();

export function listThemes() {
  return registry;
}

export function getTheme(id) {
  return registry.find((t) => t.id === id) || registry[0];
}

/** 后端模式：扫描主题目录，动态注入 <link>，实现「丢文件即生效」 */
export async function discoverThemes() {
  if (!isWails) return registry;
  try {
    const res = await backend.listThemes();
    if (!Array.isArray(res)) return registry;
    for (const t of res) {
      if (!t?.id || registry.some((x) => x.id === t.id)) continue;
      const css = await backend.loadTheme(t.id);
      if (typeof css === "string") injectTheme(t.id, css);
      registry.push({ builtin: false, mode: t.mode || "dark", swatch: t.swatch || [], ...t });
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
  config.theme = themeId;

  // 动画开关始终生效；毛玻璃强度只有在用户手动调过之后才覆盖主题自带的值，
  // 否则无论切到哪个主题都会显示成配置里的 22px（主题自己的 26px 就看不到了）。
  setRuntimeTokens({
    "--glass-blur": config.glassBlurCustom ? `${config.glassBlur}px` : null,
    "--dur": config.animations === false ? "0.001ms" : null,
  });

  return themeId;
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
