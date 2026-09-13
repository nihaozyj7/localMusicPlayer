/* ==========================================================================
   desktop-lyrics-window.js — 桌面歌词窗口（独立透明页面）的渲染逻辑
   --------------------------------------------------------------------------
   这个文件只服务于 lyrics.html：那个窗口是全透明的，除了几行歌词什么都不画。

   数据来源：主窗口把「当前歌词行 / 是否在播 / 字号」推给 Go 后端
   （WindowService.UpdateDesktopLyrics），后端再用 app.Event.Emit 广播
   desktop:lyrics 事件 —— Wails v3 的事件是广播给所有窗口的，所以这里
   订阅同一个事件名就能收到，不需要额外的通道。
   ========================================================================== */

import { backend, connect, on } from "./bridge.js";

const root = document.getElementById("dl");
const lineEl = document.getElementById("dl-line");
const tipEl = document.getElementById("dl-tip");
const styleSelect = document.getElementById("dl-style");

let lastText = null;

/* --------------------------------------------------------------------------
   桌面歌词样式（下拉框）
   --------------------------------------------------------------------------
   样式只影响「歌词文字怎么画」，与主窗口配置无关，所以存在 localStorage 里：
   歌词窗口与主窗口同源，样式切换后重新打开歌词窗口仍然生效。
   -------------------------------------------------------------------------- */
const STYLE_KEY = "music-player.desktop-lyrics.style.v1";

/** 可选样式；id 必须与 desktoplyrics.css 里的 [data-style="…"] 一一对应 */
const LYRIC_STYLES = [
  { id: "classic", label: "经典描边" },
  { id: "outline", label: "纯描边" },
  { id: "shadow", label: "柔和投影" },
  { id: "glow", label: "霓虹发光" },
  { id: "gradient", label: "渐变色" },
];
const STYLE_IDS = new Set(LYRIC_STYLES.map((s) => s.id));

function loadStyle() {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    return STYLE_IDS.has(saved) ? saved : "classic";
  } catch {
    return "classic";
  }
}

function applyStyle(id) {
  const next = STYLE_IDS.has(id) ? id : "classic";
  root.dataset.style = next;
  if (styleSelect && styleSelect.value !== next) styleSelect.value = next;
  try {
    localStorage.setItem(STYLE_KEY, next);
  } catch {
    /* 隐私模式等写不进去时忽略：只影响持久化，不影响本次显示 */
  }
}

function initStyleControl() {
  if (!styleSelect) return;
  styleSelect.innerHTML = LYRIC_STYLES.map(
    (s) => `<option value="${s.id}">${s.label}</option>`
  ).join("");
  applyStyle(loadStyle());
  styleSelect.addEventListener("change", () => applyStyle(styleSelect.value));
}

initStyleControl();

function applyFontSize(size) {
  const px = Math.max(12, Math.min(64, Number(size) || 26));
  root.style.setProperty("--dl-size", px + "px");
}

function render(state) {
  if (!state || typeof state !== "object") return;
  applyFontSize(state.fontSize);
  const text = String(state.text || "").trim();

  if (!text) {
    // 没有歌词行：显示提示语（暂停时也保持这个状态，不要留一片空白）
    lineEl.textContent = "";
    lastText = null;
    root.dataset.state = "idle";
    return;
  }

  if (text !== lastText) {
    lineEl.textContent = text;
    lastText = text;
    // 切行淡入：直接换字在桌面上看会「跳」一下
    lineEl.removeAttribute("data-fresh");
    // 强制重排，保证动画能重新触发
    void lineEl.offsetWidth;
    lineEl.setAttribute("data-fresh", "1");
  }
  root.dataset.state = state.playing ? "singing" : "paused";
  if (tipEl) tipEl.hidden = true;
}

async function boot() {
  const ready = await connect();
  if (!ready) {
    // 浏览器预览：没有 Go 后端，这个页面本身也不会被打开
    if (tipEl) tipEl.textContent = "预览模式：桌面歌词窗口需要应用后端";
    return;
  }
  on("desktop:lyrics", render);
  try {
    // 主动拉一次当前状态：创建窗口与页面注册监听之间有先后差，
    // 只等事件的话新窗口会一直空着，直到下一次换行。
    const state = await backend.desktopLyricsReady();
    render(state);
  } catch (err) {
    console.info("[desktop-lyrics] 初始状态读取失败", err?.message ?? err);
  }
}

boot();
