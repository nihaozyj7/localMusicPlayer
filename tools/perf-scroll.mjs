/* ==========================================================================
   perf-scroll.mjs — 量「曲库列表滚动时的帧节奏」
   --------------------------------------------------------------------------
   为什么需要它：用户反馈「滚动起来卡卡的，帧率跟不上显示器」。这类问题
   靠读代码只能猜到嫌疑（吸顶表头上的 backdrop-filter、未虚拟化的长列表…），
   必须有一个可复现的数字来确认「改之前 / 改之后」到底有没有差别。

   做法：
     1. 起 tools/dev-server.js（零依赖静态预览，源码直接跑，import 与页面
        同一个 store 实例 —— Vite 会给模块 URL 加查询串，动态 import 会拿到
        另一个空实例，量出来的东西没意义）；
     2. 起 Edge（headless=new，独立 profile）并连 CDP；
     3. 在页面里把曲库撑到 --rows 首（默认 400），然后固定步长滚动
        #content-body，逐帧记录 rAF 间隔；
     4. 同时用 Performance.getMetrics 取主线程的 Script / Layout / Style /
        Task 时间增量，区分「JS 慢」还是「渲染慢」。

   输出：p50 / p95 / 最长帧、掉帧数（> 1.5 帧预算）、以及主线程时间分解。
   用法：
     node tools/perf-scroll.mjs                # 默认 400 行
     node tools/perf-scroll.mjs --rows 1000
     node tools/perf-scroll.mjs --label after  # 结果写到 .task/perf-scroll-<label>.json
   ========================================================================== */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const ROWS = Number(argOf("rows", "400"));
const LABEL = argOf("label", "");
const PORT = Number(argOf("port", "5199"));
const CDP_PORT = Number(argOf("cdp", "9341"));
const FRAMES = Number(argOf("frames", "150"));
const STEP = Number(argOf("step", "26"));

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 msedge.exe");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- 1) 预览服务器 ---- */
const server = spawn(process.execPath, [join(root, "tools", "dev-server.js"), String(PORT)], {
  stdio: "ignore",
});
process.on("exit", () => server.kill());

async function waitHttp(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await sleep(100);
  }
  return false;
}
if (!(await waitHttp(`http://127.0.0.1:${PORT}/`))) {
  console.error("预览服务器没起来");
  server.kill();
  process.exit(1);
}

/* ---- 2) Edge + CDP ---- */
const prof = join(tmpdir(), "perf-scroll-profile-" + Date.now());
mkdirSync(prof, { recursive: true });
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    `--user-data-dir=${prof}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" }
);
process.on("exit", () => edge.kill());

async function cdpTargets() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  return res.json();
}
let target = null;
for (let i = 0; i < 80; i += 1) {
  try {
    const list = await cdpTargets();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {
    /* 还没起来 */
  }
  await sleep(100);
}
if (!target) {
  console.error("CDP 端点没起来");
  edge.kill();
  server.kill();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
};
function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression, awaitPromise = true) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || "页面里抛出异常");
  }
  return res.result.value;
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?probe=0` });
await sleep(2500);

const MEASURE = `
(async () => {
  const mod = await import("/js/store.js");
  const state = mod.state;
  const commit = mod.commit;
  if (!state.songs.length) throw new Error("预览数据里没有歌曲");
  const base = state.songs.slice();
  const want = ${ROWS};
  const many = [];
  for (let i = 0; many.length < want; i += 1) {
    for (const s of base) {
      many.push({ ...s, id: s.id + "_" + i });
      if (many.length >= want) break;
    }
  }
  state.songs = many;
  commit(undefined, { persist: false });
  await new Promise((r) => setTimeout(r, 400));

  // 找出真正在滚动的那一个元素：优先 #content-body，其次任何
  // scrollHeight 明显大于 clientHeight 的元素（布局改动会让滚动容器换人，
  // 写死 id 的话量到的是「一个不会滚的盒子」，帧数据全是假的）。
  const overflow = (n) => (n ? n.scrollHeight - n.clientHeight : 0);
  let el = document.getElementById("content-body");
  if (overflow(el) < 100) {
    const all = [...document.querySelectorAll("div, main, section")];
    const best = all.sort((a, b) => overflow(b) - overflow(a))[0];
    if (overflow(best) > overflow(el)) el = best;
  }
  if (!el || overflow(el) < 100) {
    throw new Error("找不到可滚动容器（scrollHeight 与 clientHeight 差不足 100px）");
  }
  const rows = document.querySelectorAll(".track").length;
  const head = document.querySelector(".tracks__head");
  const headBlur = head ? getComputedStyle(head).backdropFilter || getComputedStyle(head).webkitBackdropFilter : "";

  el.scrollTop = 0;
  await new Promise((r) => requestAnimationFrame(() => r()));

  const frames = [];
  let last = performance.now();
  let n = 0;
  await new Promise((resolve) => {
    function tick(now) {
      frames.push(now - last);
      last = now;
      el.scrollTop += ${STEP};
      n += 1;
      if (n >= ${FRAMES}) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  frames.shift();
  const sorted = frames.slice().sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  // 帧预算按 60Hz 算（16.67ms）；超过 1.5 倍算掉帧
  const budget = 16.67;
  const jank = frames.filter((f) => f > budget * 1.5).length;
  return {
    rows,
    scrolled: el.scrollTop,
    nodes: document.getElementsByTagName("*").length,
    headBackdropFilter: headBlur,
    frames: frames.length,
    meanMs: +mean.toFixed(2),
    p50: +pick(0.5).toFixed(2),
    p95: +pick(0.95).toFixed(2),
    maxMs: +Math.max(...frames).toFixed(2),
    jankFrames: jank,
    jankPct: +((jank / frames.length) * 100).toFixed(1),
    fps: +(1000 / mean).toFixed(1),
  };
})()
`;

await send("Performance.enable");
const m0 = await send("Performance.getMetrics");
const scroll = await evaluate(MEASURE);
const m1 = await send("Performance.getMetrics");

function delta(a, b, name) {
  const fa = a.metrics.find((m) => m.name === name)?.value ?? 0;
  const fb = b.metrics.find((m) => m.name === name)?.value ?? 0;
  return +(fb - fa).toFixed(1);
}
const cpu = {
  scriptMs: delta(m0, m1, "ScriptDuration") * 1000,
  layoutMs: delta(m0, m1, "LayoutDuration") * 1000,
  styleMs: delta(m0, m1, "RecalcStyleDuration") * 1000,
  taskMs: delta(m0, m1, "TaskDuration") * 1000,
};

const out = { label: LABEL || "run", rows: ROWS, step: STEP, ...scroll, cpu };
console.log(JSON.stringify(out, null, 2));

if (LABEL) {
  mkdirSync(join(root, ".task"), { recursive: true });
  const file = join(root, ".task", `perf-scroll-${LABEL}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log("已写入 " + file);
}

ws.close();
edge.kill();
server.kill();
process.exit(0);
