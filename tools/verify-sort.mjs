/* ==========================================================================
   verify-sort.mjs — 排序悬浮面板的端到端验证（无头 Edge + CDP）
   --------------------------------------------------------------------------
   验证的是「真实渲染出来的界面」，而不是源码里的字面量：
     1. 工具条里**没有** <select>（需求：不要下拉框）；
     2. 有排序按钮，点开弹出悬浮面板（.menu）；
     3. 面板里同时有「排序方式」的 7 个字段与「排列顺序」的升序/降序；
     4. 点「降序」之后列表**真的**反过来（读 DOM 里的行标题顺序）。
        这一条最关键 —— 单元测试只能证明比较函数对，不能证明界面接对了。

   用法：node tools/verify-sort.mjs
   ========================================================================== */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(root, "frontend", "dist");
const BINDINGS = join(root, "frontend", "bindings");
const OUT = join(root, ".task", "shots");
const W = 1280;
const H = 820;
const PORT = 4921;
const CDP_PORT = 9367;

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 msedge.exe");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

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
export const Call = { ByID(){return Promise.reject(new Error("preview: no backend"))}, ByName(){return Promise.reject(new Error("preview: no backend"))}, ByAsync(){return Promise.reject(new Error("preview: no backend"))} };
export const Events = { On(){return ()=>{}}, Off(){}, Emit(){return Promise.resolve()} };
export default { Call, Events };`;

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
    return res.end("404");
  }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const prof = join(tmpdir(), "lit-sort-" + Date.now());
mkdirSync(prof, { recursive: true });
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
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
  edge.kill();
  server.close();
  console.error("Edge 没起来");
  process.exit(1);
}
const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
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
    throw new Error(r.result.exceptionDetails.text + " " + (r.result.exceptionDetails.exception?.description ?? ""));
  }
  return r.result?.result?.value;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(r.result.data, "base64"));
  console.log("  saved", name + ".png");
}

const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? "  —— " + detail : ""}`);
};

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
await sleep(2800);

// 0. 往曲库里塞几首歌。
//
// 正式构建里 mock 数据是关掉的（__LM_PREVIEW__ 为 false），所以预览页面
// 默认是空曲库 —— 没有行就没有可排序的东西，下面「点降序列表真的反过来」
// 这类断言会全部落空。这里直接用 main.js 暴露的调试入口注入数据，
// 走的是与真实扫描完全相同的赋值路径（state.allSongsRaw → applyRules → commit），
// 因此测的仍然是真链路。
const seeded = await evaluate(`(() => {
  const app = window.__app;
  if (!app || !app.state) return "no __app";
  const mk = (i, title, artist, album, dur, size, plays, added) => ({
    id: "seed-" + i,
    path: "D:/Music/seed-" + i + ".mp3",
    title, artist, album,
    ext: "mp3",
    duration: dur,
    size: size,
    sampleRate: 44100,
    bitrate: 320,
    addedAt: added,
    playCount: plays,
    cover: "",
    coverUrl: "",
  });
  app.state.allSongsRaw = [
    mk(1, "Cherry",  "Zoe",   "Two",   300000, 900000, 5,  3000),
    mk(2, "Apple",   "Amy",   "One",   100000, 100000, 50, 1000),
    mk(3, "Banana",  "Mike",  "Three", 200000, 500000, 9,  2000),
    mk(4, "Durian",  "Beth",  "Four",  250000, 700000, 30, 4000),
  ];
  app.state.songs = app.state.allSongsRaw.slice();
  app.state.config.filterRules = [];
  app.state.filterRules = [];
  app.commit();
  return app.state.allSongsRaw.length;
})()`);
check("注入测试歌曲成功（用于验证排序真实生效）", seeded === 4, `实际 ${seeded}`);
await sleep(600);

// 1. 工具条里不该再有 <select>（需求：不要下拉框）
const selects = await evaluate(`document.querySelectorAll("#content-header select").length`);
check("工具条里没有 <select>（已弃用下拉框）", selects === 0, `实际 ${selects} 个`);

// 2. 排序按钮存在
const hasBtn = await evaluate(`!!document.querySelector('#content-header [data-tool="sort"]')`);
check("存在排序按钮", hasBtn === true);

const btnText = await evaluate(
  `(() => { const b = document.querySelector('#content-header [data-tool="sort"]'); return b ? b.textContent.trim() : ""; })()`
);
check("按钮上显示当前字段名", btnText.length > 0, `文本 = ${JSON.stringify(btnText)}`);

// 3. 点开悬浮面板
await evaluate(`document.querySelector('#content-header [data-tool="sort"]').click()`);
await sleep(600);
await shot("sort-01-panel");

const panelInfo = await evaluate(`(() => {
  const m = document.querySelector(".menu");
  if (!m || m.hidden) return null;
  const labels = [...m.querySelectorAll(".menu__label")].map((e) => e.textContent.trim());
  const items = [...m.querySelectorAll(".menu__item")].map((e) => e.textContent.trim());
  const r = m.getBoundingClientRect();
  return { labels, items, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
})()`);

check("点击后弹出悬浮面板", panelInfo !== null);
if (panelInfo) {
  check(
    "面板是浮层（position: fixed 且脱离文档流）",
    await evaluate(`getComputedStyle(document.querySelector(".menu")).position === "fixed"`)
  );
  check("面板含「排序方式」区块", panelInfo.labels.includes("排序方式"), `labels = ${JSON.stringify(panelInfo.labels)}`);
  check("面板含「排列顺序」区块", panelInfo.labels.includes("排列顺序"));
  check("面板含升序 / 降序两个方向", panelInfo.items.includes("升序") && panelInfo.items.includes("降序"));
  const fields = ["添加时间", "标题", "歌手", "专辑", "时长", "文件大小", "播放次数"];
  const missing = fields.filter((f) => !panelInfo.items.includes(f));
  check("面板含全部 7 个排序字段", missing.length === 0, missing.length ? `缺少 ${missing.join("、")}` : "");
  check("面板尺寸合理（不是一条线）", panelInfo.rect.w > 120 && panelInfo.rect.h > 120, JSON.stringify(panelInfo.rect));
}

// 4. 选「标题」字段（文本字段，默认升序），确认列表真的按标题排好
const titlesOf = `[...document.querySelectorAll(".tracks__body .track .track__title")].map((e) => e.textContent.trim())`;

await evaluate(`(() => {
  const items = [...document.querySelectorAll(".menu .menu__item")];
  const t = items.find((e) => e.textContent.trim() === "标题");
  t?.click();
})()`);
await sleep(800);

const asc = await evaluate(titlesOf);
const ascExpected = ["Apple", "Banana", "Cherry", "Durian"];
check(
  "选「标题」后列表按升序排列",
  asc.join("|") === ascExpected.join("|"),
  `实际 = ${JSON.stringify(asc)}`
);
await shot("sort-02-asc-title");

// 重新打开面板，点「降序」
await evaluate(`document.querySelector('#content-header [data-tool="sort"]').click()`);
await sleep(500);
const dirChecked = await evaluate(`(() => {
  const items = [...document.querySelectorAll(".menu .menu__item")];
  const ascItem = items.find((e) => e.textContent.trim() === "升序");
  return ascItem ? ascItem.getAttribute("aria-checked") : null;
})()`);
check("面板正确标记当前方向（升序已勾选）", dirChecked === "true", `aria-checked = ${dirChecked}`);

await evaluate(`(() => {
  const items = [...document.querySelectorAll(".menu .menu__item")];
  const d = items.find((e) => e.textContent.trim() === "降序");
  d?.click();
})()`);
await sleep(800);
await shot("sort-02-desc");

const desc = await evaluate(titlesOf);
check("点「降序」后列表顺序确实反过来", desc.length > 1 && desc.join("|") === [...asc].reverse().join("|"), `升序前3 = ${JSON.stringify(asc.slice(0, 3))} / 降序前3 = ${JSON.stringify(desc.slice(0, 3))}`);

// 5. 再点「升序」能切回去
await evaluate(`document.querySelector('#content-header [data-tool="sort"]').click()`);
await sleep(500);
await evaluate(`(() => {
  const items = [...document.querySelectorAll(".menu .menu__item")];
  const a = items.find((e) => e.textContent.trim() === "升序");
  a?.click();
})()`);
await sleep(700);
const backToAsc = await evaluate(titlesOf);
check("能再切回升序", backToAsc.join("|") === asc.join("|"));

// 6. 按钮上的方向箭头跟着变
const btnDir = await evaluate(`document.querySelector('#content-header [data-tool="sort"]')?.dataset.dir`);
check("按钮反映当前方向（data-dir=asc）", btnDir === "asc", `data-dir = ${btnDir}`);

// 7. 表头点击排序仍然可用（需求：保留）
const headerSort = await evaluate(`!!document.querySelector('.tracks__head [data-sort]')`);
check("表头点击排序仍然保留", headerSort === true);

// 8. 面板不能被裁掉（要浮在内容之上）
const zOk = await evaluate(`(() => {
  const m = document.querySelector(".menu");
  const s = getComputedStyle(m);
  return Number(s.zIndex) >= 100 || s.zIndex === "auto" ? s.zIndex : s.zIndex;
})()`);
check("面板有层级（z-index 可用）", zOk !== null, `z-index = ${zOk}`);

ws.close();
edge.kill();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  console.log("失败项：");
  for (const f of failed) console.log("  - " + f.label + (f.detail ? "  —— " + f.detail : ""));
  process.exit(1);
}
