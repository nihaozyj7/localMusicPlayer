/* ==========================================================================
   desktop-wallpaper-window.js — 桌面背景歌词窗口的渲染逻辑
   --------------------------------------------------------------------------
   这个文件只服务于 wallpaper.html：那个窗口铺满整个桌面、垫在桌面图标之下，
   内容就是「一层背景 + 几行歌词 + 一行曲目信息」。

   数据来源与桌面歌词完全一致：主窗口把「封面缩略图 / 当前歌词行 / 曲目信息」
   推给 Go 后端（WindowService.UpdateDesktopWallpaper），后端再用
   app.Event.Emit 广播 desktop:wallpaper 事件 —— Wails v3 的事件是广播给
   所有窗口的，所以这里订阅同一个事件名就能收到，不需要额外的通道。

   ★ 这个页面刻意「什么循环都不跑」。
   需求里担心的是「播放器渲染一份 + 桌面再渲染一份 = 双份资源」，这个页面的
   态度是：只在**内容真的变了**（换歌 / 换行 / 播放状态变化）时才写一次 DOM，
   其余时间不占 CPU、不占 GPU。所以这里没有 setInterval、没有
   requestAnimationFrame，也没有常驻 CSS 动画 —— 加任何一条之前请先想清楚
   它会不会让一张静止的壁纸每秒重绘 60 次。
   ========================================================================== */

import { backend, connect, on } from "./bridge.js";

const root = document.getElementById("wp");
const imgEl = document.getElementById("wp-img");
const metaEl = document.getElementById("wp-meta");
const titleEl = document.getElementById("wp-title");
const artistEl = document.getElementById("wp-artist");
const prevEl = document.getElementById("wp-prev");
const nowEl = document.getElementById("wp-now");
const nextEl = document.getElementById("wp-next");
const tipEl = document.getElementById("wp-tip");

/** 上一次画过的封面：同一张图不要重复赋值，否则浏览器会重新解码一次 */
let lastCover = null;
/** 上一次的当前行文本：只有换行才触发淡入动画 */
let lastText = null;

/* --------------------------------------------------------------------------
   字号
   --------------------------------------------------------------------------
   与桌面歌词一样，字号由主窗口算好推过来（它是「隔着整个桌面看」的，
   比详情页里的歌词字号要大）。这里只做一次边界收敛。
   -------------------------------------------------------------------------- */
function applyFontSize(size) {
  const px = Math.max(16, Math.min(160, Number(size) || 44));
  root.style.setProperty("--wp-size", px + "px");
}

/* --------------------------------------------------------------------------
   背景
   --------------------------------------------------------------------------
   图是主窗口降采样后的小图（几十像素宽）。这里把它铺满 + 一点模糊 + 提饱和，
   得到「详情页那种大范围模糊封面」的观感 —— 解码和模糊的代价都小一个数量级。
   -------------------------------------------------------------------------- */
function applyBackdrop(state) {
  if (Number.isFinite(state.blur)) root.style.setProperty("--wp-blur", `${state.blur}px`);
  if (Number.isFinite(state.scale)) root.style.setProperty("--wp-scale", String(state.scale));
  if (Number.isFinite(state.brightness)) {
    root.style.setProperty("--wp-brightness", String(state.brightness));
  }
  if (state.veil) root.style.setProperty("--wp-veil", state.veil);

  const cover = typeof state.cover === "string" ? state.cover : "";
  if (cover === lastCover) return;
  lastCover = cover;

  if (!cover) {
    // 没有封面（例如在线歌曲还没抓到图）：留纯色底，别显示破图图标
    imgEl.removeAttribute("src");
    imgEl.removeAttribute("data-ready");
    return;
  }
  imgEl.removeAttribute("data-ready");
  imgEl.src = cover;
}

// 图加载完再淡入：否则「背景已经铺开、图却突然砸上来」
imgEl.addEventListener("load", () => imgEl.setAttribute("data-ready", "1"));
imgEl.addEventListener("error", () => imgEl.removeAttribute("data-ready"));

/* --------------------------------------------------------------------------
   曲目信息
   -------------------------------------------------------------------------- */
function applyTrack(state) {
  const title = String(state.title || "").trim();
  const artist = String(state.artist || "").trim();
  if (!title && !artist) {
    metaEl.hidden = true;
    return;
  }
  titleEl.textContent = title;
  artistEl.textContent = artist;
  metaEl.hidden = false;
}

/* --------------------------------------------------------------------------
   歌词
   -------------------------------------------------------------------------- */
function applyLyrics(state) {
  const text = String(state.text || "").trim();
  const playing = Boolean(state.playing);

  prevEl.textContent = String(state.prev || "").trim();
  nextEl.textContent = String(state.next || "").trim();

  // 还没有歌词行时：在播就放个音符占位（说明「在唱，只是这句还没到」），
  // 没在播就明确写「未在播放」，不要留一大片空白让人以为坏了。
  const now = text || (playing ? "♪" : "未在播放");
  if (now !== lastText) {
    nowEl.textContent = now;
    lastText = now;
    // 切行淡入：整屏尺寸下直接换字会「跳」一下。
    // 先摘掉属性并强制重排，保证同名动画能重新触发。
    nowEl.removeAttribute("data-fresh");
    void nowEl.offsetWidth;
    nowEl.setAttribute("data-fresh", "1");
  }

  root.dataset.state = playing ? "singing" : "paused";
  if (tipEl) tipEl.hidden = true;
}

function render(state) {
  if (!state || typeof state !== "object") return;
  applyFontSize(state.fontSize);
  applyBackdrop(state);
  applyTrack(state);
  applyLyrics(state);
}

async function boot() {
  const ready = await connect();
  if (!ready) {
    // 浏览器预览：没有 Go 后端，这个页面本身也不会被打开
    if (tipEl) tipEl.textContent = "预览模式：桌面背景歌词窗口需要应用后端";
    return;
  }
  on("desktop:wallpaper", render);
  try {
    // 主动拉一次当前状态：创建窗口与页面注册监听之间有先后差，
    // 只等事件的话新窗口会一直空着，直到下一次换行。
    render(await backend.desktopWallpaperReady());
  } catch (err) {
    console.info("[desktop-wallpaper] 初始状态读取失败", err?.message ?? err);
  }
}

boot();
