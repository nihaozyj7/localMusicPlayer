/* ==========================================================================
   cover-accent.js — 封面取色与取色主题的整窗底图
   --------------------------------------------------------------------------
   这段逻辑原本长在 main.js 的主循环里。迁移后 main.js 不再有 tick()，
   于是把它独立出来：谁需要（runtime.js）就按「封面地址变了」调用一次。

   两个坑都保留原来的处理（都是踩过的）：
     1. 兜底封面会把 src 换成默认封面，靠 <img> 的 load 事件根本分不出
        「这首歌真的没有封面」和「这首歌有封面」——所以取色的门槛由
        theme.js#seedSourceUsable 把关，默认占位封面绝不取色；
     2. 底栏封面可能在监听挂上之前就已经 load 完成，所以不依赖 load 事件，
        改由调用方按「封面地址」驱动。
   ========================================================================== */

import { flushConfigSync, songById, state } from "./store.js";
import {
  applyCoverBackdrop,
  applyCoverSeed,
  applyResolvedTheme,
  extractCoverSeed,
  normalizeSeed,
  seedSourceUsable,
} from "./theme.js";
import { coverOf } from "./utils.js";

/** 上次取色的封面地址（同时也是「这一轮取到哪了」的状态） */
let accentCoverSrc = "";
/** coverSrc → 种子色；空串代表「这张取不到色」。避免同一张图反复解码。 */
const seedCache = new Map();
/** coverSrc → Promise<string>：同一张图并发只解码一次 */
const seedJobs = new Map();

function sameOriginSafeImage() {
  const img = new Image();
  // 与 <img> 走同一套缓存与 CSP
  img.decoding = "async";
  img.alt = "";
  return img;
}

/** 需要为这张封面取色吗？（开关 / 地址变没变 / 这个源能不能取色） */
function accentNeeded(src) {
  if (!state.config.accentFromCover) return false;
  if (!seedSourceUsable(src)) return false;
  return src !== accentCoverSrc;
}

/**
 * 取某张封面的主色（十六进制），结果进缓存。取不到时 resolve("")。
 * 优先让底栏那个 <img> 直接把像素交出来：它早就画出来了，省一次加载与解码。
 */
function extractSeed(src) {
  // 不能取色的源（默认占位封面）直接回空
  if (!seedSourceUsable(src)) return Promise.resolve("");
  if (seedCache.has(src)) return Promise.resolve(seedCache.get(src));
  if (seedJobs.has(src)) return seedJobs.get(src);

  const job = new Promise((resolve) => {
    const finish = (hex) => {
      seedCache.set(src, hex);
      seedJobs.delete(src);
      resolve(hex);
    };

    const el = document.getElementById("bar-cover-img");
    if (el && el.getAttribute("src") === src && el.complete && el.naturalWidth > 0) {
      finish(normalizeSeed(extractCoverSeed(el)));
      return;
    }

    // 底栏封面还没画好 / 已经不是这张了：用一个独立 Image 加载，
    // 不依赖底栏节点，也不怕它被重建替换。
    const probe = sameOriginSafeImage();
    probe.addEventListener("load", () =>
      finish(seedSourceUsable(src) ? normalizeSeed(extractCoverSeed(probe)) : "")
    );
    probe.addEventListener("error", () => finish(""));
    probe.src = src;
  });

  seedJobs.set(src, job);
  return job;
}

/** 把取色结果落到令牌 + 配置上；有变化时重套主题，让派生令牌跟着变 */
async function applySeed(hex) {
  if (!hex) return;
  if (!applyCoverSeed(hex, hex)) return;
  await flushConfigSync();
  await applyResolvedTheme(state.config);
}

/**
 * 启动时的取色。
 *
 * 必须在**第一次 applyResolvedTheme 之前**跑：主题里的 --bg-app / --glass-bg
 * 都是从 --seed 派生的，先用占位色套一遍、取完色再套一遍，就是肉眼可见的
 * 「先黑一下 / 先灰一下再变成真正的颜色」。
 *
 * 配置里保存着上次的取色结果时**直接用它**，绝不在启动阶段重新解码封面 ——
 * 这一刻底栏封面还没画出来，能拿到的很可能只是默认占位封面。
 */
export async function primeCoverAccent() {
  if (!state.config.accentFromCover) return;
  if (normalizeSeed(state.config.coverSeed)) return;
  const song = state.currentId ? songById(state.currentId) : null;
  const src = song ? coverOf(song) : "";
  if (!src) return;
  accentCoverSrc = src;
  await applySeed(await extractSeed(src));
}

/**
 * 封面地址变了就（重新）取色。
 *
 * 之所以跟着「封面地址」而不是只绑 load 事件：底栏封面可能「同一首歌也换了封面」
 * （手动匹配 / 自动匹配），把它绑在唯一的「封面地址」上最不容易漏。
 */
export function syncCoverAccent(src) {
  if (!state.config.accentFromCover) {
    accentCoverSrc = "";
    return;
  }
  if (!src) return;
  // 记下「已经放弃过取色的地址」：底栏停在默认占位封面上时，不能每帧都重试
  if (!seedSourceUsable(src)) {
    accentCoverSrc = src;
    return;
  }
  if (!accentNeeded(src)) return;
  accentCoverSrc = src;
  extractSeed(src).then(applySeed);
}

/**
 * 把底栏当前这张封面交给「封面取色」主题当整窗底图。
 *
 * 这一层不依赖任何取色结果，占位封面（没有真正封面时）直接跳过 ——
 * 拿默认 SVG 当整窗底图只会是一块没有意义的灰。
 */
export function syncThemeBackdrop(src) {
  applyCoverBackdrop(seedSourceUsable(src) ? src : "");
}
