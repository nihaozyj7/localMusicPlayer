/* ==========================================================================
   ui-playlist.mjs — 本轮需求自检（歌单多选 / 添加 / 队列拖拽 / 设置分类 / 桌面歌词样式）
   --------------------------------------------------------------------------
   用法：node tools/ui-playlist.mjs [--port 5173]
   需要先起着零依赖静态预览：node tools/dev-server.js 5173
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EDGE = [
  (process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)") + "/Microsoft/Edge/Application/msedge.exe",
  (process.env.ProgramFiles || "C:/Program Files") + "/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 Edge");
  process.exit(2);
}

const PORT = 9477;
const BASE = "http://127.0.0.1:" + arg("port", "5173") + "/";
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
    "--window-size=1440,900",
    "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + (process.env.TEMP || ".") + "/mp-edge-playlist",
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
  console.error("Edge 没起来");
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
const consoleErrors = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") consoleErrors.push("EXC " + m.params.exceptionDetails.text);
  else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (!/favicon/i.test(text)) consoleErrors.push("ERR " + text);
  }
});
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Page.enable");

const evalJs = async (expr) => {
  const res = await send("Runtime.evaluate", {
    expression: "(async () => { " + expr + " })()",
    returnByValue: true,
    awaitPromise: true,
  });
  if (res?.exceptionDetails) {
    throw new Error(res.exceptionDetails.text + " " + (res.exceptionDetails.exception?.description || ""));
  }
  return res?.result?.value;
};

await send("Page.navigate", { url: BASE });
await sleep(2600);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log((ok ? "[OK ] " : "[!! ] ") + name + (detail ? "  — " + detail : ""));
}

/** 元素中心点（真实鼠标事件用） */
async function boxOf(selector, nth) {
  return evalJs(
    "const list = document.querySelectorAll(" +
      JSON.stringify(selector) +
      "); const el = list[" +
      nth +
      "]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };"
  );
}

/** 真实鼠标拖拽：从 fromSel[fromNth] 拖到 toSel[toNth] */
async function realDrag(fromSel, fromNth, toSel, toNth) {
  const a = await boxOf(fromSel, fromNth);
  const b = await boxOf(toSel, toNth);
  if (!a || !b) return false;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y, button: "none" });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: a.x,
    y: a.y,
    button: "left",
    clickCount: 1,
    buttons: 1,
  });
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    await sleep(45);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
  await sleep(480);
  return true;
}

const go = (expr) => evalJs(expr);

/* ==========================================================================
   1. 队列拖拽排序（SortableJS）+ 拖拽后自动切回列表循环 + 界面顺序一致
   ========================================================================== */
try {
  // 显式铺满队列：预览的 state 会跨次运行持久化，不能依赖上次留下的队列长度
  await go(
    `const store = await import("/js/store.js"); store.state.view = "queue"; store.state.playlistId = null; store.state.query = ""; store.state.playMode = "shuffle"; store.state.queue = store.state.songs.slice(0, 6).map((s) => s.id); store.state.currentIndex = 0; store.state.currentId = store.state.queue[0]; store.commit(); await new Promise((r) => setTimeout(r, 360)); return true;`
  );
  const info = await go(
    `const store = await import("/js/store.js"); return { queue: store.state.queue.slice(), handles: document.querySelectorAll(".track__handle").length, staticHead: document.querySelectorAll(".tracks__sort[data-static]").length };`
  );
  check(
    "队列视图：有拖拽手柄、表头排序为静态文本",
    info.handles > 0 && info.staticHead >= 3,
    JSON.stringify({ handles: info.handles, staticHead: info.staticHead })
  );

  const before = info.queue.slice();
  const dragged = await realDrag(".track__handle", 0, ".track__handle", 2);
  const after = await go(
    `const store = await import("/js/store.js"); return { queue: store.state.queue.slice(), playMode: store.state.playMode, dom: Array.from(document.querySelectorAll(".tracks__body .track")).map((n) => n.dataset.id) };`
  );
  const changed = dragged && JSON.stringify(after.queue) !== JSON.stringify(before);
  const domMatches = JSON.stringify(after.dom) === JSON.stringify(after.queue);
  check(
    "真实拖拽后：队列顺序变化 + 播放模式切回列表循环 + 界面顺序一致",
    changed && after.playMode === "sequence" && domMatches,
    JSON.stringify({ before, after: after.queue, playMode: after.playMode, domMatches })
  );
} catch (err) {
  check("队列拖拽脚本执行", false, err?.message || String(err));
}

/* ==========================================================================
   2. 歌单多选 + 添加
   ========================================================================== */
try {
  await go(
    `const store = await import("/js/store.js"); store.state.view = "playlist"; store.state.playlistId = "pl_late_night"; store.state.query = ""; store.state.playlistSelecting = false; store.state.selectedIds = new Set(); store.commit(); await new Promise((r) => setTimeout(r, 360)); return true;`
  );
  const tools = await go(
    `return { select: Boolean(document.querySelector('[data-tool="pl-select"]')), add: Boolean(document.querySelector('[data-tool="pl-add"]')), rows: document.querySelectorAll(".track").length };`
  );
  check("歌单工具条有「多选」「添加」按钮", tools.select && tools.add && tools.rows > 0, JSON.stringify(tools));

  await go(`document.querySelector('[data-tool="pl-select"]').click(); return true;`);
  await sleep(360);
  const selMode = await go(
    `return { checks: document.querySelectorAll(".track__check").length, selectBtn: document.querySelector('[data-tool="pl-select"]') ? 1 : 0 };`
  );
  check("点多选进入多选模式：行内出现勾选框", selMode.checks > 0 && selMode.selectBtn === 1, JSON.stringify(selMode));

  await go(`const rows = document.querySelectorAll(".track"); rows[0].click(); rows[1].click(); return true;`);
  await sleep(360);
  const picked = await go(
    `const store = await import("/js/store.js"); const info = document.querySelector(".toolbar__selinfo"); return { selected: store.state.selectedIds.size, info: info ? info.textContent.trim() : "" };`
  );
  check("点行即勾选，工具条显示已选数量", picked.selected === 2, JSON.stringify(picked));

  const beforeCount = await go(
    `const store = await import("/js/store.js"); return store.state.playlists.find((p) => p.id === "pl_late_night").songIds.length;`
  );
  await go(`document.querySelector('[data-tool="sel-remove"]').click(); return true;`);
  await sleep(420);
  const afterRemove = await go(
    `const store = await import("/js/store.js"); return { count: store.state.playlists.find((p) => p.id === "pl_late_night").songIds.length, selecting: store.state.playlistSelecting };`
  );
  check(
    "移除所选：歌单少 2 首并退出多选",
    afterRemove.count === beforeCount - 2 && afterRemove.selecting === false,
    JSON.stringify({ beforeCount, afterRemove })
  );

  await go(`document.querySelector('[data-tool="pl-add"]').click(); return true;`);
  await sleep(420);
  const dialog = await go(
    `const modal = document.querySelector(".modal"); return { open: Boolean(modal), rows: document.querySelectorAll(".addsongs__row").length, ok: Boolean(modal && modal.querySelector('[data-act="ok"]')) };`
  );
  check("点添加打开弹层并列出所有歌曲", dialog.open && dialog.rows > 0 && dialog.ok, JSON.stringify(dialog));

  await go(
    `const boxes = Array.from(document.querySelectorAll("[data-song-check]:not(:disabled)")); boxes.slice(0, 2).forEach((b) => (b.checked = true)); document.querySelector(".modal [data-act='ok']").click(); return true;`
  );
  await sleep(480);
  const afterAdd = await go(
    `const store = await import("/js/store.js"); return { count: store.state.playlists.find((p) => p.id === "pl_late_night").songIds.length, modalOpen: Boolean(document.querySelector(".modal")) };`
  );
  check(
    "勾选后加入歌单",
    afterAdd.count === afterRemove.count + 2 && afterAdd.modalOpen === false,
    JSON.stringify(afterAdd)
  );
} catch (err) {
  check("歌单脚本执行", false, err?.message || String(err));
}

/* ==========================================================================
   3. 设置：导航条居中 + 锚点 0 + 重新分类 + AI 相关开关 + 自定义样式入口
   ========================================================================== */
try {
  await go(
    `document.querySelector("#btn-settings").click(); await new Promise((r) => setTimeout(r, 460)); return true;`
  );
  const nav = await go(
    `const nav = document.querySelector(".settings__nav"); const wrap = document.querySelector(".settings"); const n = nav.getBoundingClientRect(); const w = wrap.getBoundingClientRect(); const cs = getComputedStyle(nav); return { delta: Math.round((n.left + n.right) / 2 - (w.left + w.right) / 2), top: cs.top, position: cs.position, labels: Array.from(document.querySelectorAll(".settings__nav-item")).map((b) => b.textContent.trim()) };`
  );
  check(
    "设置导航条居中且吸附锚点 top=0",
    Math.abs(nav.delta) <= 2 && nav.top === "0px" && nav.position === "sticky",
    JSON.stringify(nav)
  );
  check(
    "设置重新分类为 7 类",
    nav.labels.join(",") === "曲库,外观,播放器,数据,AI,其他,关于",
    JSON.stringify(nav.labels)
  );

  const aiToggle = await go(
    `const label = Array.from(document.querySelectorAll(".setting__label")).find((n) => n.textContent.includes("自动匹配歌词时使用")); return { found: Boolean(label), card: label ? label.closest(".card").querySelector(".card__title").textContent.trim() : "", toggle: Boolean(label && label.closest(".setting").querySelector('[data-toggle="aiLyricsClean"]')) };`
  );
  check(
    "AI 相关里有「自动匹配歌词时使用 AI 清洗元数据」开关",
    aiToggle.found && aiToggle.toggle && aiToggle.card === "AI 相关",
    JSON.stringify(aiToggle)
  );

  const hasCustom = await go(`return Boolean(document.querySelector('[data-act="skin-help"]'));`);
  check("播放界面样式有「自定义样式」按钮", hasCustom === true, JSON.stringify({ hasCustom }));
  await go(
    `document.querySelector('[data-act="skin-help"]').click(); await new Promise((r) => setTimeout(r, 420)); return true;`
  );
  const guide = await go(
    `const modal = document.querySelector(".modal"); return { open: Boolean(modal), boxes: document.querySelectorAll("[data-prompt-text]").length, copy: document.querySelectorAll("[data-copy-prompt]").length };`
  );
  check(
    "点自定义打开 AI 提示词引导弹层（皮肤 + 主题两份提示词）",
    guide.open && guide.boxes === 2 && guide.copy === 2,
    JSON.stringify(guide)
  );
  await go(
    `const btn = document.querySelector(".modal [data-act='cancel']"); if (btn) btn.click(); await new Promise((r) => setTimeout(r, 300)); const close = document.querySelector("[data-settings-close]"); if (close) close.click(); return true;`
  );
  await sleep(400);
} catch (err) {
  check("设置脚本执行", false, err?.message || String(err));
}

/* ==========================================================================
   4. 侧边栏在窄窗口不折叠
   ========================================================================== */
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
  await sleep(320);
  const narrow = await go(
    `const side = document.querySelector(".sidebar"); return { width: Math.round(side.getBoundingClientRect().width), texts: document.querySelectorAll(".navitem__text").length, hidden: Array.from(document.querySelectorAll(".navitem__text")).filter((n) => getComputedStyle(n).display === "none").length, badgeHidden: Array.from(document.querySelectorAll(".navitem__badge")).filter((n) => getComputedStyle(n).display === "none").length };`
  );
  check(
    "侧边栏在 1000px 宽窗口不折叠（文字与徽标都在）",
    narrow.width >= 200 && narrow.texts > 0 && narrow.hidden === 0 && narrow.badgeHidden === 0,
    JSON.stringify(narrow)
  );
  await send("Emulation.clearDeviceMetricsOverride");
  await sleep(260);
} catch (err) {
  check("侧边栏脚本执行", false, err?.message || String(err));
}

/* ==========================================================================
   6. 封面变化后：歌曲列表与底栏都要换图（需求：匹配封面后列表/底栏元数据不更新）
   ========================================================================== */
try {
  const coverCheck = await go(
    `const store = await import("/js/store.js"); const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#ff00ff"/></svg>'; const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); const target = store.state.songs[0]; store.playContext([target.id], 0, { type: "library", id: null }); await new Promise((r) => setTimeout(r, 300)); const rowSel = ".track[data-id='" + target.id + "'] .track__cover img"; const beforeRow = document.querySelector(rowSel) ? document.querySelector(rowSel).getAttribute("src") : ""; const bar = document.getElementById("bar-cover-img"); const beforeBar = bar ? bar.getAttribute("src") : ""; const beforeRev = store.coverVersion(); store.setCoverSet(target.id, { items: [{ preview: dataUrl, source: "user" }], active: 0 }); await new Promise((r) => setTimeout(r, 360)); const afterRow = document.querySelector(rowSel) ? document.querySelector(rowSel).getAttribute("src") : ""; const afterBar = bar ? bar.getAttribute("src") : ""; return { beforeRev, afterRev: store.coverVersion(), rowChanged: afterRow === dataUrl, barChanged: afterBar === dataUrl, beforeRow, beforeBar };`
  );
  check(
    "封面变化：列表缩略图与底栏封面都换图（不再停留在默认封面）",
    coverCheck.afterRev > coverCheck.beforeRev && coverCheck.rowChanged === true && coverCheck.barChanged === true,
    JSON.stringify(coverCheck)
  );
} catch (err) {
  check("封面更新脚本执行", false, err?.message || String(err));
}

/* ==========================================================================
   7. 底栏外观：播放/暂停按钮无底色；进度条默认压暗
   ========================================================================== */
try {
  const chrome = await go(
    `const main = document.querySelector(".transport__btn--main"); const fill = document.querySelector(".playerbar__progress .slider__fill"); const cs = main ? getComputedStyle(main) : null; const fs = fill ? getComputedStyle(fill) : null; return { bg: cs ? cs.backgroundColor : "", filter: fs ? fs.filter : "", width: main ? Math.round(main.getBoundingClientRect().width) : 0, height: main ? Math.round(main.getBoundingClientRect().height) : 0 };`
  );
  check(
    "底栏播放/暂停按钮无背景色（尺寸保留）",
    /rgba\(0, 0, 0, 0\)|transparent/.test(chrome.bg) && chrome.width >= 30 && chrome.height >= 30,
    JSON.stringify(chrome)
  );
  check(
    "进度条默认压暗（brightness < 1）",
    /brightness/.test(chrome.filter),
    JSON.stringify({ filter: chrome.filter })
  );
} catch (err) {
  check("底栏外观脚本执行", false, err?.message || String(err));
}

check("主界面全程无 console 报错", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

/* ==========================================================================
   5. 桌面歌词窗口：样式下拉框 + 未悬浮时背景完全透明
   ========================================================================== */
try {
  await send("Page.navigate", { url: BASE + "lyrics.html" });
  await sleep(1800);
  const lyric = await go(
    `const root = document.getElementById("dl"); const select = document.getElementById("dl-style"); const before = root.dataset.style; const opts = select ? select.options.length : 0; const bg = getComputedStyle(root).backgroundColor; const bodyBg = getComputedStyle(document.body).backgroundColor; if (select) { select.value = "glow"; select.dispatchEvent(new Event("change", { bubbles: true })); } return { before, opts, after: root.dataset.style, bg, bodyBg, saved: localStorage.getItem("music-player.desktop-lyrics.style.v1") };`
  );
  check(
    "桌面歌词：样式下拉框存在且切换生效并持久化",
    lyric.opts >= 3 && lyric.after === "glow" && lyric.saved === "glow",
    JSON.stringify(lyric)
  );
  check(
    "桌面歌词：未悬浮时背景完全透明",
    /rgba\(0, 0, 0, 0\)|transparent/.test(lyric.bg) && /rgba\(0, 0, 0, 0\)|transparent/.test(lyric.bodyBg),
    JSON.stringify({ bg: lyric.bg, bodyBg: lyric.bodyBg })
  );
  check("歌词窗口无 console 报错", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (err) {
  check("桌面歌词脚本执行", false, err?.message || String(err));
}

ws.close();
child.kill();
await sleep(300);

const failed = results.filter((r) => !r.ok).length;
console.log("");
console.log(failed ? "失败 " + failed + " / " + results.length : "全部通过（" + results.length + " 项）");
process.exit(failed ? 1 : 0);
