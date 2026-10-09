// @ts-check
/* ==========================================================================
   sdk.js — 宿主提供给插件的可复用渲染零件（`ctx.sdk`）
   --------------------------------------------------------------------------
   存在的理由：v3 起插件**零 import**（不能 import 包内模块，也不能 import 宿主内部），
   但"自己从零画一套滚动歌词 / 整窗背景层"对第三方来说成本太高。于是把
   通用零件挂在 ctx 上：

     ctx.sdk.createLyricsView(host, opts)   滚动歌词（高亮 / 点击跳转 / 空态文案）
     ctx.sdk.createFxLyrics(host, opts)     特效歌词（逐字入场 / 卡拉OK / 残影）
     ctx.sdk.createCamera(target, opts)     运镜（分层视差 / 机位 / 手持微动）
     ctx.sdk.createBackgroundLayer(root)    整窗背景层（铺图 + 模糊 + 亮度 + 缩放）
     ctx.sdk.applyFit(el, "--xxx-fit")      窗口适配比例（桌面背景投屏时等比放大）
     ctx.sdk.parseLrc / findLyricIndex / formatLrcTime / lyricDisplayText / splitGraphemes
     ctx.sdk.html.{EMPTY_TRACK,escapeHtml,setCoverImage,subtitleOf,lyricsEmptyText}
     ctx.sdk.util.{clamp,esc,debounce}

   这些零件对应三张「骨架样式表」（lyrics.css / fx-lyrics.css / background-layer.css），
   它们随宿主一起加载、**不在 skin 层**里 —— 也就是说插件 CSS 改不动它们：
     · 想定制视觉：给零件传选项，或设置它读的 CSS 变量（例如 --lyric-size）；
     · 想完全自己来：不用这些零件，自己建 DOM + 自己的类名（那些类名归插件自己管）。
   ========================================================================== */

import { createLyricsView } from "./lyrics-view.js";
import { createFxLyrics } from "./fx-lyrics.js";
import { createCamera, prefersReducedMotion } from "./fx-camera.js";
import { createBackgroundLayer } from "./background-layer.js";
import { applyFit, fitScale, fitScaleOf } from "./fit.js";
import { parseLrc, findLyricIndex, formatLrcTime, lyricDisplayText, splitGraphemes } from "./lrc.js";
import { EMPTY_TRACK, escapeHtml, setCoverImage, subtitleOf, lyricsEmptyText } from "./html.js";
import { defineSkin, HOST_API_VERSION } from "./contract.js";

/** @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Number(v) || 0));
}

/**
 * 极简防抖（插件的"用户停止拖动后再做点什么"这类场景够用）。
 * @template {(...args:any[])=>void} F
 * @param {F} fn
 * @param {number} wait
 */
function debounce(fn, wait = 200) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/**
 * 造一份 SDK 实例。
 *
 * 每个宿主（主窗口 / 桌面背景歌词窗口）各造一份，但它们内容完全一致 ——
 * 插件拿到的东西不因舞台不同而不同（只有 `ctx.options().interactive` 会变）。
 *
 * @returns {import("./contract.js").SkinSdk}
 */
export function createSdk() {
  return {
    define: defineSkin,
    createLyricsView,
    createFxLyrics,
    createCamera,
    createBackgroundLayer,
    applyFit,
    fitScale,
    fitScaleOf,
    parseLrc,
    splitGraphemes,
    findLyricIndex,
    formatLrcTime,
    lyricDisplayText,
    html: { EMPTY_TRACK, escapeHtml, setCoverImage, subtitleOf, lyricsEmptyText },
    util: { clamp, esc: escapeHtml, debounce, prefersReducedMotion },
    version: HOST_API_VERSION,
  };
}
