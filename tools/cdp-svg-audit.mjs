/* ==========================================================================
   cdp-svg-audit.mjs — 审计全页面 <svg> 图标是否漏了尺寸
   --------------------------------------------------------------------------
   背景：icon() 生成的是 <svg class="..." aria-hidden="true"><use .../></svg>，
   不带 width/height 属性。SVG 没有尺寸规则时浏览器会退到默认 300×150，
   把所在的 grid/flex 行撑高（表头文字"往下偏一行半"就是这么来的）。
   本脚本列出所有渲染尺寸异常（宽>100 或 高>50）的 svg 及其容器。
   用法：node tools/cdp-svg-audit.mjs [宽度] [高度]
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
const CDP_PORT = 9337;
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

/* 自己准备页面目录：不能依赖别的脚本留下的 .task/measure，
   否则目录不存在时会渲染 404 空页并报「没有异常」的假通过。 */
const dir = prepareMeasureDir(join(root, "frontend", "src"), join(root, ".task", "measure"));
const BINDINGS = join(root, "frontend", "bindings");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/wails/runtime.js") {
    res.writeHead(200, { "Content-Type": MIME[".js"] });
    return res.end(`export class CancellablePromise extends Promise { cancel(){} cancelOn(){return this} }
export const Call = { ByID(){return Promise.reject(new Error("preview"))}, ByName(){return Promise.reject(new Error("preview"))}, ByIDAsync(){return Promise.reject(new Error("preview"))}, ByNameAsync(){return Promise.reject(new Error("preview"))} };
export const Events = { On(){return ()=>{}}, Off(){}, Emit(){return Promise.resolve()} };
export default { Call, Events };`);
  }
  const f = p.startsWith("/bindings/") ? join(BINDINGS, p.slice("/bindings/".length)) : join(dir, p === "/" ? "index.html" : p.replace(/^\//, ""));
  if (!existsSync(f)) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(4989, "127.0.0.1", r));

const prof = join(tmpdir(), "cdp5-" + Date.now());
mkdirSync(prof, { recursive: true });
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${prof}`, `--remote-debugging-port=${CDP_PORT}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
for (let i = 0; i < 60 && !ok; i++) { await sleep(500); try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); ok = true; } catch {} }
if (!ok) { console.error("CDP 未就绪"); process.exit(1); }

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text + " " + (r.result.exceptionDetails.exception?.description || "") };
  return r.result?.result?.value;
};

await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.enable");
await send("Page.navigate", { url: "http://127.0.0.1:4989/index.html" });
await sleep(4000);

const AUDIT = `(() => {
  const pathOf = (el) => {
    const parts = [];
    let n = el;
    while (n && n !== document.body && parts.length < 5) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += "#" + n.id;
      if (n.className && typeof n.className === "string" && n.className.trim()) s += "." + n.className.trim().split(/\\s+/).join(".");
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(" > ");
  };
  const all = [...document.querySelectorAll("svg")];
  const bad = [], fine = [];
  for (const s of all) {
    const r = s.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0 && getComputedStyle(s).display !== "none";
    if (!visible) continue;
    const rec = { w: Math.round(r.width), h: Math.round(r.height), cls: s.getAttribute("class") || "",
                 href: s.querySelector("use")?.getAttribute("href") || "",
                 parent: pathOf(s.parentElement) };
    if (r.width > 100 || r.height > 50) bad.push(rec); else fine.push(rec);
  }
  return { total: all.length, visible: bad.length + fine.length, oversized: bad,
           oversizedCount: bad.length, sampleFine: fine.slice(0, 5) };
})()`;

const res = await evaluate(AUDIT);
console.log(`视口 ${W}×${H}`);
console.log(`svg 总数 ${res.total}，可见 ${res.visible}，尺寸异常 ${res.oversizedCount}\n`);

/* 防空转：页面没渲染出来时不能报「✓ 没有异常」，那是最危险的假通过 */
if (!res || res.total === 0) {
  console.log("✗ 页面上一个 svg 都没有 —— 页面很可能没加载成功（不是真的没问题）");
  if (res?.__error) console.log("  脚本错误:", res.__error);
  ws.close(); edge.kill(); server.close();
  process.exit(1);
}

if (res.oversized.length) {
  console.log("❌ 尺寸异常（宽>100 或 高>50，会撑高所在行）：");
  for (const b of res.oversized) {
    console.log(`  ${b.w}×${b.h}  ${b.href || "(no use)"}  class="${b.cls}"\n      容器: ${b.parent}`);
  }
} else {
  console.log("✓ 没有尺寸异常的 svg");
}
console.log("\n正常样本:", JSON.stringify(res.sampleFine?.slice(0, 3)));
if (res.__error) console.log("脚本错误:", res.__error);

ws.close(); edge.kill(); server.close();
