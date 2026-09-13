/* ==========================================================================
   cdp-measure.mjs — 用 Chrome DevTools 协议量取真实渲染结果
   --------------------------------------------------------------------------
   为什么走 CDP：--dump-dom / --screenshot 这两种无头模式在本机反复出现
   「进程挂死或 exit 21」，而 CDP 是「启动浏览器后用 WebSocket 问它」，
   不依赖 dump 时机，稳定得多（node 22 自带 WebSocket）。
   量什么：表头盒子的实际高度 vs 内部 grid 隐式行的实际高度、
   以及若把 align-items 改成 stretch 后的高度（用于验证成因）。
   用法：node tools/cdp-measure.mjs [宽度] [高度] [页面]
   ========================================================================== */

import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { prepareMeasureDir } from "./measure-template.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = Number(process.argv[2] || 1010);
const H = Number(process.argv[3] || 800);
const PAGE = process.argv[4] || "index.html";
const CDP_PORT = 9333;

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) { console.error("找不到 msedge.exe"); process.exit(1); }

/* ---- 复制最新的 frontend/src 并注入测量脚本（每次都重新复制，避免量到旧 CSS） ---- */
const dir = prepareMeasureDir(join(root, "frontend", "src"), join(root, ".task", "measure"));
console.log("已从 frontend/src 重新复制到 .task/measure（保证量的是最新源码）");
const BINDINGS = join(root, "frontend", "bindings");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json; charset=utf-8" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/wails/runtime.js") {
    res.writeHead(200, { "Content-Type": MIME[".js"] });
    return res.end(`export class CancellablePromise extends Promise { cancel(){} cancelOn(){return this} }
export const Call = { ByID(){return Promise.reject(new Error("preview"))}, ByName(){return Promise.reject(new Error("preview"))}, ByIDAsync(){return Promise.reject(new Error("preview"))}, ByNameAsync(){return Promise.reject(new Error("preview"))} };
export const Events = { On(){return ()=>{}}, Off(){}, Emit(){return Promise.resolve()} };
export default { Call, Events };`);
  }
  const f = p.startsWith("/bindings/")
    ? join(BINDINGS, p.slice("/bindings/".length))
    : join(dir, p === "/" ? "index.html" : p.replace(/^\//, ""));
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end("404 " + p); }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(4993, "127.0.0.1", r));

/* ---- 启动 Edge（独立 profile，每次全新） ---- */
const prof = join(tmpdir(), "cdp-profile-" + Date.now());
mkdirSync(prof, { recursive: true });
const edge = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  "--no-default-browser-check", "--disable-extensions",
  `--user-data-dir=${prof}`,
  `--remote-debugging-port=${CDP_PORT}`,
  `--window-size=${W},${H}`,
  "about:blank",
], { stdio: "ignore", detached: false });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 等 CDP 端点就绪 */
let version = null;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    version = await r.json();
    break;
  } catch { /* 还没起来 */ }
}
if (!version) { console.error("CDP 端点未就绪"); edge.kill(); server.close(); process.exit(1); }
console.log("浏览器:", version.Browser);

/* 连到 page target */
const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) { console.error("没有 page target"); edge.kill(); server.close(); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text + " " + (r.result.exceptionDetails.exception?.description || "") };
  return r.result?.result?.value;
}

/* 用 Emulation 精确设视口（window-size 在 headless 下不一定准） */
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.enable");
await send("Page.navigate", { url: `http://127.0.0.1:4993/${PAGE}` });
await sleep(4000); // 给应用渲染时间

const MEASURE = `(() => {
  const R = (n) => { if (!n) return null; const r = n.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; };
  const head = document.querySelector(".tracks__head");
  const rows = [...document.querySelectorAll(".track")];
  if (!head) return { error: "没有 .tracks__head", rows: rows.length };
  const cs = getComputedStyle(head);
  const out = {
    viewport: { w: innerWidth, h: innerHeight },
    rowCount: rows.length,
    head: R(head),
    headCss: { position: cs.position, top: cs.top, height: cs.height, alignItems: cs.alignItems,
               display: cs.display, padding: cs.padding, borderBottom: cs.borderBottomWidth },
    rows: { r1: R(rows[0]), r2: R(rows[1]) },
    rowH: getComputedStyle(document.documentElement).getPropertyValue("--row-h").trim(),
  };
  // 表头每个子元素的盒子：找出是谁把隐式行撑高了
  out.children = [...head.children].map((c) => {
    const r = c.getBoundingClientRect();
    const ccs = getComputedStyle(c);
    return { cls: c.className, text: (c.textContent||"").trim().slice(0,8),
             y: Math.round(r.top), h: Math.round(r.height), bottom: Math.round(r.bottom),
             width: Math.round(r.width),
             marginTop: ccs.marginTop, marginBottom: ccs.marginBottom,
             padding: ccs.padding, alignSelf: ccs.alignSelf, display: ccs.display };
  });
  // 实测：临时改成 stretch 看高度如何变化（验证成因，不改源码）
  const before = head.getBoundingClientRect().height;
  head.style.alignItems = "stretch";
  const afterStretch = head.getBoundingClientRect().height;
  const childAfter = [...head.children].map((c) => Math.round(c.getBoundingClientRect().height));
  head.style.alignItems = "";
  out.experiment = { headHeightWithCenter: Math.round(before), headHeightWithStretch: Math.round(afterStretch),
                     childHeightsWithStretch: childAfter };
  // 表头里哪个子元素最高
  out.tallestChild = out.children.reduce((a, b) => (b.h > (a?.h ?? -1) ? b : a), null);
  return out;
})()`;

const data = await evaluate(MEASURE);
console.log(JSON.stringify(data, null, 2));

ws.close();
edge.kill();
server.close();
