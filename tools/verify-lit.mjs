/* ==========================================================================
   verify-lit.mjs — Lit 迁移后的无头功能验证
   --------------------------------------------------------------------------
   用 headless Edge + CDP 打开**构建产物**（frontend/dist），逐项检查：
     · 控制台有没有报错（迁移最容易在这里翻车）
     · 骨架 / 曲目表 / 底栏 / 侧边栏是否渲染出来
     · 关键交互是否可用：切视图、打开设置并拨动一个开关、开关闭队列面板、
       右键菜单、多选、搜索弹层、播放详情页
     · 交互前后是否出现「整块重建」级别的 DOM 变动（迁移前的老问题）

   用法：node tools/verify-lit.mjs [宽度] [高度]
   ========================================================================== */

import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(root, "frontend", "dist");
const BINDINGS = join(root, "frontend", "bindings");
const W = Number(process.argv[2] || 1280);
const H = Number(process.argv[3] || 820);
const PORT = 4899;
const CDP_PORT = 9345;

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 msedge.exe");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const RUNTIME_SHIM = `export class CancellablePromise extends Promise { cancel(){} cancelOn(){return this} }
export const Call = { ByID(){return Promise.reject(new Error("preview: no backend"))}, ByName(){return Promise.reject(new Error("preview: no backend"))}, ByIDAsync(){return Promise.reject(new Error("preview: no backend"))}, ByNameAsync(){return Promise.reject(new Error("preview: no backend"))} };
export const Events = { On(){return ()=>{}}, Off(){}, Emit(){return Promise.resolve()} };
export const WML = { Enable(){}, OpenURL(){} };
export const Flags = { Get(){ return null } };
export const Window = { SetTitle(){} };
export default { Call, Events, WML, Flags, CancellablePromise };`;

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/wails/runtime.js") {
    res.writeHead(200, { "Content-Type": MIME[".js"] });
    return res.end(RUNTIME_SHIM);
  }
  if (p === "/early-theme.js") {
    res.writeHead(404);
    return res.end("// no backend");
  }
  const f = p.startsWith("/bindings/")
    ? join(BINDINGS, p.slice("/bindings/".length))
    : join(DIST, p === "/" ? "index.html" : p.replace(/^\//, ""));
  if (!existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end("404 " + p);
  }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const prof = join(tmpdir(), "lit-verify-" + Date.now());
mkdirSync(prof, { recursive: true });
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    `--user-data-dir=${prof}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--window-size=${W},${H}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let version = null;
for (let i = 0; i < 60; i += 1) {
  await sleep(500);
  try {
    version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    break;
  } catch {
    /* 还没起来 */
  }
}
if (!version) {
  console.error("CDP 端点未就绪");
  edge.kill();
  server.close();
  process.exit(1);
}

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let msgId = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.consoleAPICalled") {
    const type = m.params.type;
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ");
    logs.push({ type, text });
  }
  if (m.method === "Runtime.exceptionThrown") {
    logs.push({ type: "exception", text: m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text });
  }
  if (m.method === "Log.entryAdded") {
    logs.push({ type: m.params.entry.level, text: m.params.entry.text, url: m.params.entry.url });
  }
};

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    return { __error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
  }
  return r.result?.result?.value;
}

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
await sleep(2500);

const results = [];
function check(name, value) {
  results.push({ name, value });
}

/* ---- 1. 骨架与首屏 ---- */
const boot = await evaluate(`(() => {
  const q = (s) => document.querySelector(s);
  return {
    ready: document.body.dataset.ready,
    app: !!q("#app"),
    titlebar: !!q("#titlebar"),
    sidebar: !!q("#sidebar"),
    content: !!q("#content-body"),
    playerbar: !!q("#playerbar"),
    rows: document.querySelectorAll(".track").length,
    navItems: document.querySelectorAll(".navitem").length,
    playerview: !!q("#playerview"),
    skinButtons: document.querySelectorAll("#playerview-mode .viewmode__btn").length,
    hostDisplay: getComputedStyle(q("mp-app")).display,
    appRect: (() => { const r = q("#app").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
  };
})()`);
check("boot", boot);

/* ---- 2. 切视图（队列） ---- */
const nav = await evaluate(`(async () => {
  document.querySelector('[data-nav="queue"]').click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return {
    appView: document.querySelector("#app").dataset.view,
    title: document.querySelector("#content-title").textContent.trim(),
    rows: document.querySelectorAll(".track").length,
    head: document.querySelector(".tracks__head")?.dataset.mode,
    navSelected: document.querySelector('[data-nav="queue"]').getAttribute("aria-selected"),
  };
})()`);
check("navigate-queue", nav);

/* ---- 3. 回曲库 + 打开设置 + 拨一个开关 ---- */
const settings = await evaluate(`(async () => {
  document.querySelector('[data-nav="library"]').click();
  document.querySelector("#btn-settings").click();
  await new Promise(r => setTimeout(r, 400));
  const layer = document.querySelector("#settings-layer");
  const cards = layer.querySelectorAll(".card").length;
  const scrollBody = layer.querySelector(".settings-layer__body");
  scrollBody.scrollTop = 400;
  const before = scrollBody.scrollTop;
  // 拨动「界面动画」开关
  const sw = layer.querySelector('[data-toggle="animations"]');
  const beforeChecked = sw.getAttribute("aria-checked");
  sw.click();
  await new Promise(r => setTimeout(r, 300));
  const afterChecked = layer.querySelector('[data-toggle="animations"]').getAttribute("aria-checked");
  const after = scrollBody.scrollTop;
  // 切一个分段控件
  layer.querySelector('[data-segment="listDensity"] [data-value="compact"]').click();
  await new Promise(r => setTimeout(r, 200));
  const density = document.documentElement.dataset.density;
  // 再切回来
  layer.querySelector('[data-segment="listDensity"] [data-value="cozy"]').click();
  layer.querySelector('[data-toggle="animations"]').click();
  await new Promise(r => setTimeout(r, 200));
  // 导航跳转
  layer.querySelector('[data-goto="about"]').click();
  await new Promise(r => setTimeout(r, 700));
  const activeNav = layer.querySelector('.settings__nav-item[aria-selected="true"]')?.textContent.trim();
  return { cards, beforeChecked, afterChecked, scrollBefore: before, scrollAfter: after, density, activeNav };
})()`);
check("settings", settings);

/* ---- 4. 关闭设置 + 底栏播放列表浮层 ---- */
const panels = await evaluate(`(async () => {
  document.querySelector("[data-settings-close]").click();
  await new Promise(r => setTimeout(r, 400));
  document.querySelector("#btn-playlist").click();
  await new Promise(r => setTimeout(r, 400));
  const panel = document.querySelector("#queue-panel");
  const open = !panel.hidden && panel.dataset.state === "opened";
  const items = panel.querySelectorAll(".queue-item").length;
  document.querySelector("#queue-close").click();
  await new Promise(r => setTimeout(r, 500));
  const closed = panel.hidden;
  return { open, items, closed };
})()`);
check("queue-panel", panels);

/* ---- 5. 播放详情页（皮肤宿主） ---- */
const player = await evaluate(`(async () => {
  document.querySelector("#bar-cover").click();
  await new Promise(r => setTimeout(r, 900));
  const view = document.querySelector("#playerview");
  const stage = document.querySelector("#playerview-stage");
  return {
    open: !view.hidden && view.dataset.state === "opened",
    skin: view.dataset.skin,
    stageChildren: stage.children.length,
    appView: document.querySelector("#app").dataset.view,
  };
})()`);
check("playerview", player);
const closePlayer = await evaluate(`(async () => {
  document.querySelector("#btn-player-back").click();
  await new Promise(r => setTimeout(r, 800));
  return { hidden: document.querySelector("#playerview").hidden, appView: document.querySelector("#app").dataset.view };
})()`);
check("playerview-close", closePlayer);

/* ---- 6. 播放 / 暂停 / 进度 ---- */
const playback = await evaluate(`(async () => {
  const before = document.querySelector("#icon-play use").getAttribute("href");
  document.querySelector("#btn-play").click();
  await new Promise(r => setTimeout(r, 500));
  const after = document.querySelector("#icon-play use").getAttribute("href");
  const t = document.querySelector("#time-current").textContent;
  document.querySelector("#btn-play").click();
  return { before, after, t };
})()`);
check("playback", playback);

/* ---- 7. 搜索弹层 ---- */
const search = await evaluate(`(async () => {
  document.querySelector("#btn-search").click();
  await new Promise(r => setTimeout(r, 500));
  const ov = document.querySelector("#search-overlay");
  const shown = !ov.hidden && ov.dataset.state === "opened";
  const input = document.querySelector("#search-input");
  const focused = document.activeElement === input;
  document.querySelector(".search-overlay__close").click();
  await new Promise(r => setTimeout(r, 400));
  return { shown, focused, closed: ov.dataset.state === "closed" };
})()`);
check("search", search);

/* ---- 8. 歌词工作台 ---- */
const lyrics = await evaluate(`(async () => {
  document.querySelector("#btn-lyrics").click();
  await new Promise(r => setTimeout(r, 700));
  const p = document.querySelector("#lyrics-panel");
  const open = !p.hidden;
  const tabs = p.querySelectorAll(".lyricspanel__tab").length;
  p.querySelector('[data-tab="nudge"]').click();
  await new Promise(r => setTimeout(r, 400));
  const nudgeVisible = !p.querySelector('[data-pane="nudge"]').hidden;
  p.querySelector('[data-tab="edit"]').click();
  await new Promise(r => setTimeout(r, 500));
  const editVisible = !p.querySelector('[data-pane="edit"]').hidden;
  const rows = p.querySelectorAll(".drow").length;
  p.querySelector("[data-act='close']").click();
  await new Promise(r => setTimeout(r, 300));
  return { open, tabs, nudgeVisible, editVisible, rows, closed: p.hidden };
})()`);
check("lyrics", lyrics);

/* ---- 9. 右键菜单 ---- */
const menu = await evaluate(`(async () => {
  const row = document.querySelector(".track");
  row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 200, clientY: 300 }));
  await new Promise(r => setTimeout(r, 300));
  const m = document.querySelector("#menu");
  const open = !m.hidden && m.dataset.state === "open";
  const items = m.querySelectorAll(".menu__item").length;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await new Promise(r => setTimeout(r, 400));
  return { open, items };
})()`);
check("context-menu", menu);

/* ---- 10. 主题 / 深浅色切换 ---- */
const theme = await evaluate(`(async () => {
  const before = document.documentElement.dataset.theme;
  document.querySelector("#btn-theme-toggle").click();
  await new Promise(r => setTimeout(r, 500));
  const after = document.documentElement.dataset.theme;
  document.querySelector("#btn-theme-toggle").click();
  await new Promise(r => setTimeout(r, 500));
  return { before, after, back: document.documentElement.dataset.theme };
})()`);
check("theme", theme);

/* ---- 11. 曲目表单行更新（不是整表重建） ---- */
const rowDelta = await evaluate(`(async () => {
  const body = document.querySelector(".tracks__body");
  const firstBefore = body.firstElementChild;
  let added = 0, removed = 0;
  const obs = new MutationObserver((recs) => {
    for (const r of recs) { added += r.addedNodes.length; removed += r.removedNodes.length; }
  });
  obs.observe(body, { childList: true, subtree: true });
  const rows = document.querySelectorAll(".track");
  rows[3].click();
  await new Promise(r => setTimeout(r, 400));
  obs.disconnect();
  const firstAfter = document.querySelector(".tracks__body").firstElementChild;
  return { added, removed, sameFirstNode: firstBefore === firstAfter, rowCount: document.querySelectorAll(".track").length };
})()`);
check("row-update", rowDelta);

/* ---- 12. 歌单多选 + 队列拖拽句柄 ---- */
const playlist = await evaluate(`(async () => {
  document.querySelector('[data-nav="playlist"]').click();
  await new Promise(r => setTimeout(r, 300));
  const plId = document.querySelector('[data-nav="playlist"]')?.dataset.playlist;
  // 找一个自定义歌单（不是「我喜欢」）
  const custom = [...document.querySelectorAll("[data-nav='playlist']")].find(n => n.dataset.locked !== "true");
  (custom || document.querySelector("[data-nav='playlist']")).click();
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-tool="pl-select"]').click();
  await new Promise(r => setTimeout(r, 300));
  const rows = [...document.querySelectorAll(".track")];
  if (rows[0]) rows[0].click();
  if (rows[1]) rows[1].click();
  await new Promise(r => setTimeout(r, 300));
  const selInfo = document.querySelector(".toolbar__selinfo")?.textContent.trim();
  const checked = document.querySelectorAll('.track[aria-selected="true"]').length;
  document.querySelector('[data-tool="pl-select"]').click();
  await new Promise(r => setTimeout(r, 300));
  return { selInfo, checked, afterDone: document.querySelectorAll(".toolbar__selinfo").length };
})()`);
check("playlist-multiselect", playlist);

const queueDrag = await evaluate(`(async () => {
  document.querySelector('[data-nav="queue"]').click();
  await new Promise(r => setTimeout(r, 500));
  const table = document.querySelector("mp-track-table");
  return { hasSortable: Boolean(table && table._sortable), handles: document.querySelectorAll(".track__handle").length };
})()`);
check("queue-drag", queueDrag);

/* ---- 13. 封面管理面板 ---- */
const cover = await evaluate(`(async () => {
  document.querySelector('[data-nav="library"]').click();
  await new Promise(r => setTimeout(r, 400));
  const more = document.querySelector(".track .track__more");
  more.click();
  await new Promise(r => setTimeout(r, 300));
  const item = [...document.querySelectorAll("#menu .menu__item")].find((b) => b.textContent.includes("更换封面"));
  if (!item) return { menuItems: [...document.querySelectorAll("#menu .menu__item")].map((b) => b.textContent.trim()) };
  item.click();
  await new Promise(r => setTimeout(r, 600));
  const layer = document.querySelector("#cover-layer");
  const out = {
    open: !layer.hidden && layer.dataset.state === "opened",
    hasKeyword: Boolean(layer.querySelector("#cover-keyword")),
    hasGrid: Boolean(layer.querySelector("#cover-grid")),
    hasSet: Boolean(layer.querySelector("#cover-set")),
  };
  layer.querySelector("[data-cover-close]").click();
  await new Promise(r => setTimeout(r, 400));
  return out;
})()`);
check("cover-panel", cover);

/* ---- 14. 桌面歌词窗口（独立页面） ---- */
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/lyrics.html` });
await sleep(1500);
const dlWindow = await evaluate(`(() => {
  const host = document.querySelector("mp-desktop-lyrics");
  return {
    host: !!host,
    root: !!document.querySelector("#dl"),
    styles: document.querySelectorAll("#dl-style option").length,
    state: document.querySelector("#dl")?.dataset.state,
    styleAttr: document.querySelector("#dl")?.dataset.style,
    tip: document.querySelector("#dl-tip")?.textContent.trim(),
    hostDisplay: host ? getComputedStyle(host).display : null,
  };
})()`);
check("desktop-lyrics-window", dlWindow);

/* ---- 15. 下载面板（预览假数据） ---- */
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?downloads=1` });
await sleep(2000);
const downloads = await evaluate(`(async () => {
  const btn = document.querySelector("#btn-downloads");
  const visible = btn && !btn.hidden;
  const panel = document.querySelector("#download-panel");
  const openState = !panel.hidden;
  const items = panel.querySelectorAll(".download-item").length;
  const badge = document.querySelector("#download-badge")?.textContent;
  btn?.click();
  await new Promise(r => setTimeout(r, 400));
  return { btnVisible: visible, panelInitiallyOpen: openState, items, badge, afterToggle: !panel.hidden };
})()`);
check("downloads", downloads);

/* ---- 16. 皮肤切换（插件域不被破坏） ---- */
const skin = await evaluate(`(async () => {
  document.querySelector("#bar-cover").click();
  await new Promise(r => setTimeout(r, 900));
  const btns = [...document.querySelectorAll("#playerview-mode .viewmode__btn")];
  const immersive = btns.find((b) => b.dataset.pvSkin === "immersive") || btns[1];
  immersive.click();
  await new Promise(r => setTimeout(r, 900));
  const view = document.querySelector("#playerview");
  const out = {
    skin: view.dataset.skin,
    pressed: immersive.getAttribute("aria-pressed"),
    stageChildren: document.querySelector("#playerview-stage").children.length,
    appMode: document.querySelector("#app").dataset.mode,
    skinBgDisplay: getComputedStyle(document.querySelector("#skin-background")).display,
  };
  document.querySelector("#btn-player-back").click();
  await new Promise(r => setTimeout(r, 700));
  // 切回默认样式，避免影响后续检查
  document.querySelector("#bar-cover").click();
  await new Promise(r => setTimeout(r, 700));
  (document.querySelector('[data-pv-skin="classic"]') || btns[0]).click();
  await new Promise(r => setTimeout(r, 700));
  document.querySelector("#btn-player-back").click();
  await new Promise(r => setTimeout(r, 700));
  return out;
})()`);
check("player-skin-switch", skin);

/* ---- 16.5 排序 / 本地筛选 ---- */
const sortFilter = await evaluate(`(async () => {
  document.querySelector('[data-nav="library"]').click();
  await new Promise(r => setTimeout(r, 400));
  const first = () => [...document.querySelectorAll(".track .track__title")].slice(0, 3).map((n) => n.textContent.trim()).join(" / ");
  const before = first();
  document.querySelector('[data-sort="title"]').click();
  await new Promise(r => setTimeout(r, 400));
  const afterAsc = first();
  document.querySelector('[data-sort="title"]').click();
  await new Promise(r => setTimeout(r, 400));
  const afterDesc = first();
  const aria = document.querySelector('[data-sort="title"]').getAttribute("data-dir") + "|" + document.querySelector('[data-sort="title"]').className;
  // 本地筛选
  const input = document.querySelector("#content-filter-input");
  input.value = "夜";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  const filtered = document.querySelectorAll(".track").length;
  const count = document.querySelector("#content-filter-count")?.textContent.trim();
  const clear = document.querySelector("#content-filter-clear");
  const clearVisible = clear && !clear.hidden;
  clear.click();
  await new Promise(r => setTimeout(r, 400));
  return { before, afterAsc, afterDesc, aria, filtered, count, clearVisible, restored: document.querySelectorAll(".track").length };
})()`);
check("sort-filter", sortFilter);

/* ---- 17. 内置界面自检（probe.js：?probe=1 会把布局体检报告打到控制台） ---- */
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?probe=1` });
await sleep(2600);
const probeReport = await evaluate("window.__probeReport ? JSON.stringify(window.__probeReport).slice(0, 1500) : null");
check("probe", probeReport || "（没有输出）");

/* ---- 18. 控制台错误 ---- */
const errors = logs.filter((l) => l.type === "error" || l.type === "exception");
check("console-errors", errors.slice(0, 10));
check("console-summary", { total: logs.length, errors: errors.length });

/* ---- 输出 ---- */
console.log(JSON.stringify(results, null, 2));

ws.close();
edge.kill();
server.close();
