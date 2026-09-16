/* ==========================================================================
   shot-lit.mjs — 迁移后的界面截图（无头 Edge + CDP）
   --------------------------------------------------------------------------
   用与 verify-lit.mjs 相同的方式起静态服务 + headless Edge，
   依次定格几个关键界面并截图到 .task/shots/，用于人工比对布局没有跑偏。

   用法：node tools/shot-lit.mjs
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
const PORT = 4901;
const CDP_PORT = 9347;

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

const prof = join(tmpdir(), "lit-shot-" + Date.now());
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
  return r.result?.result?.value;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(r.result.data, "base64"));
  console.log("saved", name);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?playing=1` });
await sleep(2600);

await shot("01-library");

await evaluate(`document.querySelector("#btn-settings").click()`);
await sleep(900);
await shot("02-settings");
await evaluate(`document.querySelector("[data-settings-close]").click()`);
await sleep(500);

await evaluate(`document.querySelector("#btn-playlist").click()`);
await sleep(700);
await shot("03-queue-panel");
await evaluate(`document.querySelector("#queue-close").click()`);
await sleep(600);

await evaluate(`document.querySelector("#bar-cover").click()`);
await sleep(1400);
await shot("04-playerview");
await evaluate(`document.querySelector("#btn-player-back").click()`);
await sleep(900);

await evaluate(`document.querySelector("#btn-lyrics").click()`);
await sleep(900);
await shot("05-lyrics-online");
await evaluate(`document.querySelector('#lyrics-panel [data-tab="nudge"]').click()`);
await sleep(600);
await shot("06-lyrics-nudge");
await evaluate(`document.querySelector('#lyrics-panel [data-tab="edit"]').click()`);
await sleep(700);
await shot("07-lyrics-edit");
await evaluate(`document.querySelector("#lyrics-panel [data-act='close']").click()`);
await sleep(400);

await evaluate(`document.querySelector("#btn-search").click()`);
await sleep(700);
await shot("08-search");
await evaluate(`document.querySelector(".search-overlay__close").click()`);
await sleep(400);

await evaluate(
  `document.querySelectorAll(".track")[2].dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:260,clientY:280}))`
);
await sleep(500);
await shot("09-context-menu");

ws.close();
edge.kill();
server.close();
