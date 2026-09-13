/* ==========================================================================
   verify-tracktable.mjs — 曲目表头的真实渲染验证（多断点）
   --------------------------------------------------------------------------
   一次跑完，输出简洁结论。检查项：
     · 表头 grid 隐式行高 ≤ 表头盒子高度（曾出现 150px 撑高导致文字下移）
     · 表头文字垂直居中于表头盒子内
     · 表头与数据行每一列 x 起点一致（横向不错位）
     · 表头内图标尺寸正常（不是 SVG 默认的 300×150）
   用法：node tools/verify-tracktable.mjs
   ========================================================================== */

import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { prepareMeasureDir } from "./measure-template.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CDP_PORT = 9338;

/* 覆盖所有断点：>1180、1180~1040、1040~900、<900 */
const WIDTHS = [1400, 1120, 1010, 860];
const H = 800;

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
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(4988, "127.0.0.1", r));

const prof = join(tmpdir(), "verify-" + Date.now());
mkdirSync(prof, { recursive: true });
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${prof}`, `--remote-debugging-port=${CDP_PORT}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = false;
for (let i = 0; i < 60 && !ok; i++) { await sleep(500); try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); ok = true; } catch {} }
if (!ok) { console.error("CDP 未就绪"); process.exit(1); }

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let msgId = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++msgId; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

const CHECK = `(() => {
  const head = document.querySelector(".tracks__head");
  const rows = [...document.querySelectorAll(".track")];
  if (!head) return { error: "no head" };
  const hr = head.getBoundingClientRect();
  const cs = getComputedStyle(head);
  const rowTracks = cs.gridTemplateRows.split(/\\s+/).map(parseFloat).filter((n) => !isNaN(n));
  const maxRow = rowTracks.length ? Math.max(...rowTracks) : 0;
  const svgs = [...head.querySelectorAll("svg")].map((s) => {
    const r = s.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });

  /* 横向对齐的正确判据：比较「网格列宽」而不是单元格内容盒的 x。
     表头第 6/7 列是空占位格，行里是 30px 的爱心按钮（justify-self:center），
     内容盒宽度本就不同，比 x 会误报。 */
  const headGrid = document.querySelector(".tracks");
  const row1 = rows[0];
  const headCols = cs.gridTemplateColumns;
  const rowCols = row1 ? getComputedStyle(row1).gridTemplateColumns : "";
  // 逐列算宽度差
  const hp = headCols.split(/\\s+/).map(parseFloat);
  const rp = rowCols.split(/\\s+/).map(parseFloat);

  /* 垂直居中判据：用「表头自身盒子的中线」和「文字单元格的中线」比。
     注意只能比有内容的列（.tracks__sort），空占位格 h=0 不参与。 */
  const textCells = [...head.querySelectorAll(".tracks__sort")].filter((c) => {
    const r = c.getBoundingClientRect();
    return r.height > 0 && getComputedStyle(c).display !== "none";
  });
  const offsets = textCells.map((c) => {
    const r = c.getBoundingClientRect();
    return Math.round((r.top + r.height / 2) - (hr.top + hr.height / 2));
  });
  const maxTextOffset = offsets.length ? Math.max(...offsets.map(Math.abs)) : 0;

  return {
    headH: Math.round(hr.height), headY: Math.round(hr.top),
    gridRowMax: Math.round(maxRow),
    textOffsets: offsets, maxTextOffset,
    svgs,
    headCols, rowCols,
    colDiff: hp.length === rp.length ? hp.map((v, i) => Math.round(v - rp[i])) : "列数不同",
    problems: [
      ...(maxRow > hr.height + 1 ? ["grid 行高 " + Math.round(maxRow) + "px > 表头 " + Math.round(hr.height) + "px"] : []),
      ...(maxTextOffset > 2 ? ["表头文字未垂直居中，偏移 " + maxTextOffset + "px（" + offsets.join(",") + "）"] : []),
      ...svgs.filter((s) => s.w > 100 || s.h > 50).map((s) => "图标尺寸失控 " + s.w + "×" + s.h),
      ...colProblem(hp, rp),
    ],
  };
  function colProblem(a, b) {
    if (a.length !== b.length || !a.length) return ["表头与数据行列数不同（" + a.length + " vs " + b.length + "）"];
    const bad = a.map((v, i) => Math.round(v - b[i])).filter((d) => Math.abs(d) > 1);
    return bad.length ? ["网格列宽不一致，差异 " + bad.join(",") + "px"] : [];
  }
})()`;

let anyProblem = false;
for (const w of WIDTHS) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:4988/index.html" });
  await sleep(2800);
  const r = await evaluate(CHECK);
  const tag = r.problems?.length ? "✗" : "✓";
  if (r.problems?.length) anyProblem = true;
  console.log(
    `${tag} 视口 ${String(w).padStart(4)}px  表头 ${r.headH}px  grid行高 ${r.gridRowMax}px  ` +
      `文字竖直偏移 ${r.maxTextOffset}px  列宽差 ${JSON.stringify(r.colDiff)}  图标 ${JSON.stringify(r.svgs)}`
  );
  if (r.problems?.length) for (const p of r.problems) console.log("      · " + p);

  /* 先量「刚加载、未滚动」的状态：此时表头应在其数据行之上，绝不能被 sticky 推进正文。
     （放在滚动测试之前量，避免 smooth 滚动/滚动恢复带来的异步干扰） */
  const flow = await evaluate(`(() => {
    const cb = document.getElementById("content-body");
    const head = document.querySelector(".tracks__head");
    const row1 = document.querySelector(".tracks__body .track");
    if (!head || !row1) return { error: "缺少表头或数据行" };
    const hr = head.getBoundingClientRect();
    const r1 = row1.getBoundingClientRect();
    return { scrollTop: Math.round(cb.scrollTop),
             headTop: Math.round(hr.top), headBottom: Math.round(hr.bottom),
             rowTop: Math.round(r1.top), rowBottom: Math.round(r1.bottom),
             overlap: Math.round(hr.bottom - r1.top) };
  })()`);
  const noOverlap = flow.scrollTop === 0 && flow.overlap <= 0;
  if (!noOverlap) anyProblem = true;
  console.log(
    `      ${noOverlap ? "✓" : "✗"} 未滚动时表头在首行之上: scrollTop=${flow.scrollTop}，` +
      `表头 ${flow.headTop}→${flow.headBottom}，首行 ${flow.rowTop}→${flow.rowBottom}，重叠 ${flow.overlap}px`
  );

  /* 吸顶验证：滚动内容区后，表头应停在滚动容器顶边（sticky.top = 0）。
     注意：.content-body 有 scroll-behavior: smooth，scrollTop 赋值会变成动画，
     必须先在测试里禁掉平滑滚动，否则读到的是中途位置或 0。 */
  await evaluate(`(() => {
    const cb = document.getElementById("content-body");
    cb.style.scrollBehavior = "auto";
    cb.scrollTop = 600;
    return true;
  })()`);
  await sleep(400);
  const sticky = await evaluate(`(() => {
    const cb = document.getElementById("content-body");
    const head = document.querySelector(".tracks__head");
    const expectedTop = parseFloat(getComputedStyle(head).top) || 0;
    return { after: Math.round(head.getBoundingClientRect().top),
             cbTop: Math.round(cb.getBoundingClientRect().top),
             expectedTop,
             scrolled: Math.round(cb.scrollTop),
             maxScroll: Math.round(cb.scrollHeight - cb.clientHeight) };
  })()`);
  const want = sticky.cbTop + sticky.expectedTop;
  const stuckOk = sticky.scrolled > 50 && Math.abs(sticky.after - want) <= 2;
  if (!stuckOk) anyProblem = true;
  console.log(
    `      ${stuckOk ? "✓" : "✗"} 吸顶: 滚动 ${sticky.scrolled}px（可滚 ${sticky.maxScroll}px）后 ` +
      `表头 top=${sticky.after} (应为 ${want} = 容器顶 ${sticky.cbTop} + sticky.top ${sticky.expectedTop})`
  );
}

ws.close(); edge.kill(); server.close();
console.log(anyProblem ? "\n✗ 存在问题" : "\n✓ 全部断点通过：行高正常、文字居中、列对齐、图标尺寸正常");
process.exit(anyProblem ? 1 : 0);
