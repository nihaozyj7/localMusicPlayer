/* ==========================================================================
   check-playerbar-tools.mjs — 底栏按钮清单自检（无头浏览器 / 预览数据）
   --------------------------------------------------------------------------
   盯的是「按钮被谁悄悄地删掉 / 加回来」这类回归：

     · 歌词入口（#btn-lyrics）必须在，而且点了真能打开歌词工作台，
       工作台里三个 tab（在线匹配 / 微调 / 手动编辑）都要在 ——
       它以前是运行时 inject 的，模块一旦没被任何地方 import，
       按钮会**静默消失**（HTML 里也看不出来少了什么，就是踩过的那个坑）；
     · 不能有歌词显隐按钮（#btn-lyrics-visible / #sp-lyrics-toggle）——
       需求：歌词不提供隐藏入口，详情页那块歌词区只由设置 → 歌词控制；
     · 不能有全屏按钮（#btn-fullscreen）；
     · 「桌面歌词」（#btn-desktop-lyrics）保留（桌面独立透明窗口，暂未实现）。

   用法：node tools/check-playerbar-tools.mjs [--port 5173]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 Edge");
  process.exit(2);
}

const PORT = 9479;
const BASE = `http://127.0.0.1:${arg("port", "5173")}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const get = (p) =>
  new Promise((res, rej) =>
    http
      .get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res(d));
      })
      .on("error", rej)
  );

const child = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    "--window-size=1416,808",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\mp-edge-pbtools`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let target = null;
for (let i = 0; i < 80 && !target; i += 1) {
  await sleep(250);
  try {
    target = JSON.parse(await get("/json/list")).find((t) => t.type === "page");
  } catch {
    /* 等 DevTools */
  }
}
if (!target) {
  console.error("连不上 Edge DevTools");
  child.kill();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;
const send = (m, p = {}) =>
  new Promise((r) => {
    id += 1;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result ?? {});
    pending.delete(m.id);
  }
});
await new Promise((r) => ws.addEventListener("open", r));

const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok, name });
  console.log(`[${ok ? "OK " : "!! "}] ${name}${detail ? "  — " + detail : ""}`);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: BASE });
for (let i = 0; i < 60; i += 1) {
  const ready = await evalJs(`document.body?.dataset.ready === "true"`);
  if (ready === true) break;
  await sleep(400);
}
await sleep(600);

const tools = await evalJs(`(() => {
  const bar = [...document.querySelectorAll(".playerbar__tools .mode-btn")].map((b) => b.id);
  const sp = [...document.querySelectorAll(".settings-player__tools .mode-btn")].map((b) => b.id);
  const match = document.getElementById("btn-lyrics");
  return {
    bar,
    sp,
    hasLyricsVisible: !!document.getElementById("btn-lyrics-visible"),
    hasFullscreen: !!document.getElementById("btn-fullscreen"),
    hasDesktop: !!document.getElementById("btn-desktop-lyrics"),
    hasSpLyrics: !!document.getElementById("sp-lyrics-toggle"),
    matchIcon: match?.querySelector("use")?.getAttribute("href") || null,
    matchTip: match?.dataset.tip || null,
    settingsLayerTools: document.querySelectorAll(".settings-layer .mode-btn, .settings-layer .transport__btn").length,
  };
})()`);

check(
  "底栏没有歌词显隐按钮（需求：歌词不提供隐藏入口）",
  tools.hasLyricsVisible === false,
  JSON.stringify(tools.bar)
);
check("底栏没有全屏按钮", tools.hasFullscreen === false, JSON.stringify(tools.bar));
check("底栏保留「桌面歌词」按钮", tools.hasDesktop === true, JSON.stringify(tools.bar));
check("歌词入口在（不再依赖运行时 inject）", tools.bar.includes("btn-lyrics"), JSON.stringify(tools.bar));
// 需求：图标是「词」字（放大镜/歌词线条都表达不出「歌词」）
check(
  "歌词按钮图标/提示正确",
  tools.matchIcon === "#i-lyric-match" && tools.matchTip === "歌词",
  `${tools.matchIcon} / ${tools.matchTip}`
);
// 控件顺序：播放模式 / 歌词 / 桌面歌词 / 桌面背景歌词 / 定时停止 / 选项 / 播放列表
// （桌面歌词与桌面背景歌词是互斥的一组，但外观上各自独立，见 index.html 的说明）
check(
  "底栏控件顺序符合需求",
  JSON.stringify(tools.bar) ===
    JSON.stringify([
      "btn-mode",
      "btn-lyrics",
      "btn-desktop-lyrics",
      "btn-desktop-wallpaper",
      "btn-sleep",
      "btn-options",
      "btn-playlist",
    ]),
  JSON.stringify(tools.bar)
);
check("设置层紧凑控件里没有歌词显隐按钮", tools.hasSpLyrics === false, JSON.stringify(tools.sp));
// 设置层里不再放一套重复的播放控件（底栏那套被遮罩盖住即可，见 index.html 的说明）
check("设置层里没有重复的播放控件", tools.settingsLayerTools === 0, `找到 ${tools.settingsLayerTools} 个`);

const opened = await evalJs(`(() => {
  document.getElementById("btn-lyrics").click();
  const panel = document.getElementById("lyrics-panel");
  if (!panel) return { found: false };
  const tabs = [...panel.querySelectorAll("[data-tab]")].map((b) => b.dataset.tab);
  const panes = [...panel.querySelectorAll("[data-pane]")].filter((p) => !p.hidden).map((p) => p.dataset.pane);
  return {
    found: true,
    display: getComputedStyle(panel).display,
    expanded: document.getElementById("btn-lyrics").getAttribute("aria-expanded"),
    tabs,
    visiblePanes: panes,
  };
})()`);
check(
  "点「歌词」真的打开了歌词工作台",
  opened.found === true && opened.display !== "none" && opened.expanded === "true",
  JSON.stringify(opened)
);
check(
  "工作台有「在线匹配 / 微调 / 手动编辑」三个 tab，且只显示当前那个",
  JSON.stringify(opened.tabs) === JSON.stringify(["online", "nudge", "edit"]) &&
    JSON.stringify(opened.visiblePanes) === JSON.stringify(["online"]),
  JSON.stringify({ tabs: opened.tabs, visiblePanes: opened.visiblePanes })
);

const switched = await evalJs(`(() => {
  const panel = document.getElementById("lyrics-panel");
  panel.querySelector('[data-tab="edit"]').click();
  const panes = [...panel.querySelectorAll("[data-pane]")].filter((p) => !p.hidden).map((p) => p.dataset.pane);
  return { panes, hasTap: !!panel.querySelector('[data-act="editor-tap"]') };
})()`);
check(
  "切到「手动编辑」能显示编辑器与打轴按钮",
  JSON.stringify(switched.panes) === JSON.stringify(["edit"]) && switched.hasTap === true,
  JSON.stringify(switched)
);

const panelClosed = await evalJs(`(() => {
  const panel = document.getElementById("lyrics-panel");
  const close = panel.querySelector('[data-act="close"]');
  close.click();
  return { display: getComputedStyle(panel).display, expanded: document.getElementById("btn-lyrics").getAttribute("aria-expanded") };
})()`);
check(
  "歌词工作台可以关掉",
  panelClosed.display === "none" && panelClosed.expanded === "false",
  JSON.stringify(panelClosed)
);

ws.close();
child.kill();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? `全部通过（${results.length} 项）` : `失败 ${failed} / ${results.length} 项`}`);
process.exit(failed === 0 ? 0 : 1);
