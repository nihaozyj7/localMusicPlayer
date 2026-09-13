/* ==========================================================================
   desktop-wallpaper.js — 主窗口侧的桌面背景歌词控制
   --------------------------------------------------------------------------
   桌面背景歌词 = 开一个铺满桌面、垫在桌面图标之下的窗口（见 Go 侧
   desktop_wallpaper.go 与 wallpaper.html / desktop-wallpaper-window.js）：

     主窗口（这里）                        桌面背景歌词窗口
       │ 封面缩略图 / 三行歌词 / 曲目信息      │
       ├── WindowService.UpdateDesktopWallpaper ┤
       │        （Go 侧保存 + 广播）           │
       └──── app.Event.Emit("desktop:wallpaper") ──► 画成一张壁纸

   ★ 关于「双份资源」——这是这个模块存在的另一半理由。
   如果把整个播放详情页投到桌面上，就等于同时跑两个完整界面：两套 DOM、
   两次全尺寸封面解码、两套界面动效，而桌面那一份用户根本点不到，全是纯浪费。
   所以这里做的三件事都是省资源的：

     1. **只推小图**：封面先用 canvas 降采样成最长边 64px 的 JPEG（几 KB）
        再推过去。桌面背景本来就是大范围模糊的，用原图既慢一个数量级，
        肉眼也看不出区别（见 coverThumb）。
     2. **只在内容真的变了才推**：每帧调用，但内部按签名去重 —— 不变时
        一次 IPC 都不发，那边也就一次 DOM 都不用写。
     3. **另一边不渲染**：桌面歌词与桌面背景歌词是单选（desktop-mode.js），
        永远不会同时存在两个额外窗口。

   预览模式（浏览器、没有 Go 后端）下没有第二个窗口，降级成主窗口内那条
   悬浮歌词条，保证预览界面仍然能演示这个功能。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { commit, state } from "./store.js";
import { paintFloatingLyricBar } from "./desktop-lyrics.js";

/** 上次推给后端的快照签名：歌词行每帧都在算，不去重会变成每帧一次 IPC */
let lastSignature = "";
/** 上一次推的内容：封面缩略图算完之后要拿它重推一次 */
let lastPayload = {};

/** 封面缩略图最长边（px）。够大到「放大后仍是一团柔和的颜色」，又小到解码几乎免费。 */
const THUMB_SIZE = 64;
/** 桌面背景上用的固定模糊半径：小图放大本来就已经很糊，这里只抹掉放大产生的块状感 */
const THUMB_BLUR = 12;

/** 桌面背景歌词是否开启（配置项，主窗口与背景窗口共用）。 */
export function desktopWallpaperEnabled() {
  return state.config.showDesktopWallpaper === true;
}

/** 把「桌面背景歌词」按钮与设置里同名开关的按下态同步成当前配置值。 */
export function syncDesktopWallpaperButtons() {
  const on = desktopWallpaperEnabled();
  const btn = document.getElementById("btn-desktop-wallpaper");
  if (btn) btn.setAttribute("aria-pressed", String(on));
  const sw = document.getElementById("opt-desktop-wallpaper");
  if (sw) sw.setAttribute("aria-checked", String(on));
}

/**
 * 探一次「当前系统支不支持把窗口垫到桌面图标之下」，不支持就把入口禁掉。
 *
 * 这个能力是 Windows 资源管理器的桌面窗口结构，别的平台没有。
 * 与其让用户点了没反应，不如一开始就把按钮置灰并说明原因。
 */
export async function probeDesktopWallpaperSupport() {
  if (!isWails()) return true;
  let supported = true;
  let reason = "";
  try {
    const snapshot = await backend.desktopWallpaperState();
    supported = snapshot?.supported !== false;
    reason = snapshot?.reason || "";
  } catch (err) {
    console.info("[desktop-wallpaper] 能力探测失败", err?.message ?? err);
    return true; // 探测失败不当成「不支持」：宁可让用户试一次
  }
  if (supported) return true;

  for (const id of ["btn-desktop-wallpaper", "opt-desktop-wallpaper"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.disabled = true;
    el.setAttribute("aria-disabled", "true");
    el.dataset.tip = reason || "当前系统不支持桌面背景歌词";
  }
  return false;
}

/**
 * 打开/关闭桌面背景歌词窗口。返回后端的执行结果（预览模式返回 {preview:true}）。
 *
 * 与 applyDesktopLyrics 一样是**单向**的：单选关系由
 * desktop-mode.js#applyDesktopMode 统一协调。
 *
 * @param {boolean} on
 * @param {{force?: boolean}} [opts]
 */
export async function applyDesktopWallpaper(on, { force = false } = {}) {
  const enabled = Boolean(on);
  const changed = desktopWallpaperEnabled() !== enabled;
  state.config.showDesktopWallpaper = enabled;

  syncDesktopWallpaperButtons();

  if (!changed && !force) return { ok: true, enabled, unchanged: true };

  if (!isWails()) {
    if (!enabled) paintFloatingLyricBar({ enabled: false });
    return { ok: true, preview: true, enabled };
  }

  try {
    const res = await backend.desktopWallpaper(enabled);
    if (enabled && res?.ok === false) {
      // 后端没开成（找不到壁纸层等）：回滚配置，别让按钮显示「已开启」
      state.config.showDesktopWallpaper = false;
      syncDesktopWallpaperButtons();
      commit();
    } else if (enabled) {
      // 刚开的窗口还是空的，立刻把当前画面推一次（不用等下一次换行）
      lastSignature = "";
      pushDesktopWallpaper(lastPayload);
    }
    return res;
  } catch (err) {
    console.warn("[desktop-wallpaper] 打开/关闭桌面背景歌词失败", err);
    state.config.showDesktopWallpaper = false;
    syncDesktopWallpaperButtons();
    commit();
    return { ok: false, enabled, error: String(err?.message ?? err) };
  }
}

/**
 * 主窗口每次 tick 调用：把当前画面推给背景歌词窗口。
 *
 * 内部按内容去重 —— 不变量时一次 IPC 都不发。
 *
 * @param {{prev?:string, text?:string, next?:string, playing?:boolean,
 *          fontSize?:number, cover?:string, title?:string, artist?:string}} [payload]
 */
export function pushDesktopWallpaper(payload = {}) {
  // 关着就什么都不做（理由同 pushDesktopLyrics：每帧收一次会把另一个模式的
  // 预览条一起抹掉，收起动作只在 applyDesktopWallpaper 里做）。
  if (!desktopWallpaperEnabled()) return;
  lastPayload = payload;

  // 封面缩略图是异步算的。还没算好时先不发这一帧 ——
  // 发一个空的 cover 会把上一张背景清掉，切歌瞬间就会闪一下黑。
  const thumb = coverThumb(payload.cover || "");
  if (thumb === null) return;

  const body = {
    prev: payload.prev || "",
    text: payload.text || "",
    next: payload.next || "",
    playing: Boolean(payload.playing),
    fontSize: Math.round(Number(payload.fontSize) || 0) || 44,
    cover: thumb,
    title: payload.title || "",
    artist: payload.artist || "",
    ...backdropStyle(),
  };

  const signature = [
    body.prev,
    body.text,
    body.next,
    body.playing ? 1 : 0,
    body.fontSize,
    // 缩略图只比「换了没有」，不比内容：data URL 很长，拼进签名没意义
    body.cover ? body.cover.length : 0,
    body.title,
    body.artist,
  ].join("|");
  if (signature === lastSignature) return;
  lastSignature = signature;

  if (!isWails()) {
    paintFloatingLyricBar({ text: body.text, playing: body.playing });
    return;
  }
  backend.updateDesktopWallpaper(body).catch((err) => {
    console.warn("[desktop-wallpaper] 同步背景歌词失败", err?.message ?? err);
  });
}

/* --------------------------------------------------------------------------
   封面降采样
   --------------------------------------------------------------------------
   桌面背景是一张「大范围模糊的封面」，原图和 64px 的小图铺开之后几乎没区别，
   但后者解码快一个数量级、显存占用可以忽略。所以在这里（主窗口已经把封面
   解码过一次的地方）顺手缩好再推过去。
   -------------------------------------------------------------------------- */

/** src -> 小图 data URL（已算好）。跨域图失败时退化成原地址。 */
const thumbCache = new Map();
/** 正在计算的 src，避免同一张图排好几次队 */
const thumbPending = new Set();

/**
 * 取封面缩略图。
 *
 * @param {string} src 原始封面地址（http / data URL / 本地图）
 * @returns {string|null} 算好了返回地址；`""` 表示没有封面；
 *          `null` 表示还在算（调用方这一帧先别推）
 */
function coverThumb(src) {
  if (!src) return "";
  const cached = thumbCache.get(src);
  if (cached !== undefined) return cached;
  if (thumbPending.has(src)) return null;
  thumbPending.add(src);

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.addEventListener("load", () => {
    thumbPending.delete(src);
    thumbCache.set(src, drawThumb(img, src));
    // 图好了，拿最近一次的内容重推一遍（签名会变，不会被去重挡掉）
    if (desktopWallpaperEnabled()) pushDesktopWallpaper(lastPayload);
  });
  img.addEventListener("error", () => {
    thumbPending.delete(src);
    thumbCache.set(src, ""); // 这张图取不到：当作没有封面，别反复重试
  });
  img.src = src;
  return null;
}

/**
 * 把图片画到小 canvas 上。
 *
 * 画布被跨域图「污染」时 toDataURL 会抛 SecurityError —— 这时退回原始地址：
 * 大不了让桌面那一边多解码一次，也不能因此什么都不显示。
 */
function drawThumb(img, src) {
  try {
    const natural = { w: img.naturalWidth || THUMB_SIZE, h: img.naturalHeight || THUMB_SIZE };
    const ratio = natural.w / Math.max(1, natural.h);
    const canvas = document.createElement("canvas");
    canvas.width = ratio >= 1 ? THUMB_SIZE : Math.max(8, Math.round(THUMB_SIZE * ratio));
    canvas.height = ratio >= 1 ? Math.max(8, Math.round(THUMB_SIZE / ratio)) : THUMB_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch (err) {
    console.info("[desktop-wallpaper] 封面降采样失败，改用原图", err?.message ?? err);
    return src;
  }
}

/* --------------------------------------------------------------------------
   背景观感
   --------------------------------------------------------------------------
   桌面上的背景要和窗口里那张对得上，所以明暗/饱和度直接读皮肤写在
   `.skin-bg` 上的自定义属性（见 packages/player-skins/src/background-layer.css）。
   读不到（非沉浸类皮肤、或详情页还没挂载）就用一套中性默认值。

   模糊半径**故意不跟着皮肤走**：皮肤那边是 54px，那是配全尺寸封面用的；
   我们这边是小图放大，54px 会把整张图糊成一个纯色块。
   -------------------------------------------------------------------------- */
function backdropStyle() {
  const fallback = { veil: "rgba(0, 0, 0, 0.42)", blur: THUMB_BLUR, scale: 1.06, brightness: 0.85 };
  const host = document.querySelector(".skin-bg");
  if (!host) return fallback;
  try {
    const cs = getComputedStyle(host);
    const veil = cs.getPropertyValue("--skin-bg-veil").trim();
    const scale = Number.parseFloat(cs.getPropertyValue("--skin-bg-scale"));
    const brightness = Number.parseFloat(cs.getPropertyValue("--skin-bg-brightness"));
    return {
      veil: veil || fallback.veil,
      blur: THUMB_BLUR,
      scale: Number.isFinite(scale) && scale > 1 ? Math.min(1.2, scale) : fallback.scale,
      brightness: Number.isFinite(brightness) ? brightness : fallback.brightness,
    };
  } catch {
    return fallback;
  }
}
