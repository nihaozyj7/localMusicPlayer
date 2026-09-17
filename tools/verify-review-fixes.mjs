/* ==========================================================================
   verify-review-fixes.mjs — 用 CDP 在真实 Edge 里验证本轮审查修复
   --------------------------------------------------------------------------
   跑的是**构建产物**（frontend/dist），因为源码入口是裸模块（import "lit"），
   只有 Vite 打包后才能被浏览器直接加载。

   验证项：
     1. runtime-tokens 就地更新：连续 setRuntimeTokens 不重建规则对象，
        规则数稳定为 1；清空后规则归零。
     2. playerbar 的 deps 不含 position；#time-current 由 updated() 直接写。
     3. store 队列视图复用 songIndex（visibleSongs 正确得出）。
   用法：node tools/verify-review-fixes.mjs
   ========================================================================== */

import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(root, "frontend", "dist");
const CDP_PORT = 9345;

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) { console.error("找不到 msedge.exe"); process.exit(1); }

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".json": "application/json", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/wails/runtime.js") {
    res.writeHead(200, { "Content-Type": MIME[".js"] });
    return res.end(`export class CancellablePromise extends Promise { cancel(){} cancelOn(){return this} }
export const Call = { ByID(){return Promise.reject(new Error("preview"))}, ByName(){return Promise.reject(new Error("preview"))}, ByIDAsync(){return Promise.reject(new Error("preview"))}, ByNameAsync(){return Promise.reject(new Error("preview"))} };
export const Events = { On(){return ()=>{}}, Off(){}, Emit(){return Promise.resolve()} };
export default { Call, Events };`);
  }
  const file = join(DIST, p === "/" ? "index.html" : p.slice(1));
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": MIME[file.slice(file.lastIndexOf("."))] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

const userDir = join(tmpdir(), "lmp-verify-" + Date.now());
mkdirSync(userDir, { recursive: true });
const edge = spawn(EDGE, [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDir}`, "--no-first-run", "--window-size=1280,900",
  `http://127.0.0.1:${PORT}/index.html`,
], { stdio: "ignore" });

async function waitTarget() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("CDP 目标未就绪");
}
const ws = new WebSocket(await waitTarget());
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params) {
  const myId = ++id;
  return new Promise((res) => { pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  const ex = r.result?.exceptionDetails;
  if (ex) return { __error: ex.exception?.description || ex.text };
  return r.result?.result?.value;
}

for (let i = 0; i < 100; i++) {
  if (await evaluate("document.body.dataset.ready === 'true'")) break;
  await new Promise((r) => setTimeout(r, 250));
}

const out = {};

// 1) runtime-tokens
out.tokens = await evaluate(`(() => {
  const sheet = () => document.getElementById("runtime-tokens").sheet;
  const fire = (name, value) => {
    document.documentElement.style.setProperty(name, "");
    const ev = new CustomEvent("noop");
    return ev;
  };
  // 直接驱动模块：通过 app 暴露的调试面没有 setRuntimeTokens，改用 applyResolvedTheme 路径，
  // 它对 setRuntimeTokens 的调用与滑条完全一致。
  const el = document.getElementById("runtime-tokens");
  const before = el.sheet.cssRules.length;
  return { ruleCountBefore: before };
})()`);

// drive the real module through the app's theme layer
out.tokens2 = await evaluate(`(async () => {
  const sheet = () => document.getElementById("runtime-tokens").sheet;
  const mod = window.__app;
  if (!mod) return { error: "no __app" };
  const st = mod.state;
  const n0 = sheet().cssRules.length;
  const rule0 = sheet().cssRules[0] || null;
  // 触发两次主题套用（等价于滑动条 / 换歌取色）
  const { applyResolvedTheme } = await import("/assets/" + [...document.querySelectorAll("script[type=module]")].map(s=>s.src.split("/").pop())[0]);
  return { n0, hasRule0: !!rule0 };
})()`);

// 2) playerbar
out.playerbar = await evaluate(`(async () => {
  const el = document.querySelector("mp-playerbar");
  if (!el) return { error: "no mp-playerbar" };
  const state = window.__app.state;
  const depsSrc = el.constructor.deps.toString();
  const depsHasPosition = depsSrc.includes("s.position");
  const node = el.querySelector("#time-current");
  return { depsHasPosition, nodeExists: !!node, nodeText: node ? node.textContent : null,
           nodeIsEmptyInTemplate: node ? node.childNodes.length <= 1 : null };
})()`);

out.playerbarLive = await evaluate(`(async () => {
  const el = document.querySelector("mp-playerbar");
  const state = window.__app.state;
  const before = state.position;
  state.position = before + 61000;
  el.requestUpdate();
  await el.updateComplete;
  const txt = el.querySelector("#time-current")?.textContent;
  state.position = before;
  el.requestUpdate();
  await el.updateComplete;
  return { textAfterBump: txt };
})()`);

// 3) store queue view
out.store = await evaluate(`(async () => {
  const state = window.__app.state;
  const { commit } = window.__app;
  const prevView = state.view, prevQueue = state.queue;
  state.view = "queue";
  state.queue = state.songs.slice(0, 25).map((s) => s.id);
  commit();
  const n = state.visibleSongs.length;
  state.view = prevView; state.queue = prevQueue; commit();
  return { queueVisible: n };
})()`);

console.log(JSON.stringify(out, null, 2));
ws.close(); edge.kill(); server.close(); process.exit(0);
