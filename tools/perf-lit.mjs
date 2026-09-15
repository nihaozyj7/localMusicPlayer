/* ==========================================================================
   perf-lit.mjs — 迁移前后的性能对比测量（无头 Edge + CDP）
   --------------------------------------------------------------------------
   用法：node tools/perf-lit.mjs <dist目录> <标签>

   测什么（全部在真实浏览器里跑，同一套 mock 曲库、同一个视口）：
     · 首屏：导航 → body[data-ready]（应用自己声明的「首屏就绪」）
     · 切歌一帧：点「下一曲」到界面稳定，期间的 DOM 变动数与墙钟耗时
     · 打开设置：点齿轮到设置层展开，期间的 DOM 变动数
     · 播放中的持续开销：播放 1.5 秒内的 DOM 变动数（迁移前这里是每帧全量 paint）
     · 长任务数（>50ms 的主线程阻塞）与首帧 DOM 节点数

   为什么要数 DOM 变动：迁移前的问题是「一次状态变化 → 整块重建」，
   这类问题在「耗时」上不一定明显（几百个节点重建可能只要几毫秒），
   但 DOM 变动数会直接高一个数量级，而它正是丢焦点 / 丢滚动 / 封面重新解码的根因。
   ========================================================================== */

import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join, dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, process.argv[2] || "frontend/dist");
const LABEL = process.argv[3] || "current";
const BINDINGS = join(root, "frontend", "bindings");
const W = 1280;
const H = 820;
const PORT = 4907;
const CDP_PORT = 9351;

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
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const SHIM = `export class CancellablePromise extends Promise { cancel(){} cancelOn(){return this} }
export const Call = { ByID(){return Promise.reject(new Error("preview: no backend"))}, ByName(){return Promise.reject(new Error("preview: no backend"))}, ByAsync(){return Promise.reject(new Error("preview: no backend"))} };
export const Events = { On(){return ()=>{}}, Off(){}, Emit(){return Promise.resolve()} };
export default { Call, Events };`;

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/wails/runtime.js") {
    res.writeHead(200, { "Content-Type": MIME[".js"] });
    return res.end(SHIM);
  }
  if (p === "/early-theme.js" || p === "/favicon.ico") {
    res.writeHead(404);
    return res.end("//");
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

const prof = join(tmpdir(), "lit-perf-" + Date.now());
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
  await sleep(400);
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
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description };
  return r.result?.result?.value;
};

await send("Runtime.enable");
await send("Page.enable");
await send("Performance.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    // ★ 按**子树**计数，而不是只看 MutationRecord.addedNodes 的顶层节点：
    //   innerHTML = "<div>…几千个节点…</div>" 在记录里只是「加了 1 个节点」，
    //   只看顶层会把「整块重建」这种最严重的抖动漏掉。
    window.__subtreeCount = (n) => (n.nodeType === 1 ? 1 + n.querySelectorAll("*").length : 1);
    window.__mut = {
      added: 0, removed: 0, attrs: 0, chars: 0, nodesRemoved: 0, nodesAdded: 0,
      reset() { this.added = 0; this.removed = 0; this.attrs = 0; this.chars = 0; this.nodesRemoved = 0; this.nodesAdded = 0; },
      snapshot() { return { addedTop: this.added, removedTop: this.removed, attrs: this.attrs, chars: this.chars,
        nodesAdded: this.nodesAdded, nodesRemoved: this.nodesRemoved,
        total: this.nodesAdded + this.nodesRemoved + this.attrs + this.chars }; },
    };
    window.__longTasks = [];
    window.__readyAt = null;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration)); })
        .observe({ entryTypes: ["longtask"], buffered: true });
    } catch (e) { /* 不支持就算了 */ }
    document.addEventListener("DOMContentLoaded", () => {
      const obs = new MutationObserver((recs) => {
        for (const r of recs) {
          if (r.type === "childList") {
            window.__mut.added += r.addedNodes.length;
            window.__mut.removed += r.removedNodes.length;
            for (const n of r.addedNodes) window.__mut.nodesAdded += window.__subtreeCount(n);
            for (const n of r.removedNodes) window.__mut.nodesRemoved += window.__subtreeCount(n);
          }
          else if (r.type === "attributes") window.__mut.attrs += 1;
          else if (r.type === "characterData") window.__mut.chars += 1;
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      const t = setInterval(() => {
        if (document.body && document.body.dataset.ready === "true") {
          window.__readyAt = Math.round(performance.now());
          clearInterval(t);
        }
      }, 10);
    });
  `,
});

const settle = async () => {
  await evalJs(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 80))))`);
};

async function run() {
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?playing=1` });
  await sleep(3200);

  const boot = await evalJs(`({
    ready: window.__readyAt,
    domNodes: document.getElementsByTagName("*").length,
    rows: document.querySelectorAll(".track").length,
    longTasks: window.__longTasks.length,
    longTaskMs: window.__longTasks.reduce((a, b) => a + b, 0),
  })`);

  // 静置期（不播放）的持续 DOM 变动：迁移前后都应该接近 0
  await evalJs("window.__mut.reset()");
  await sleep(1500);
  const idle = await evalJs("window.__mut.snapshot()");

  // 播放中 3 秒的持续开销：DOM 变动 + 浏览器侧的真实 CPU 时间
  const metricsOf = async () => {
    const m = await send("Performance.getMetrics");
    const out = {};
    for (const x of m.result.metrics) out[x.name] = x.value;
    return out;
  };
  // 明确把播放打开（不能盲点 #btn-play：?playing=1 可能已经让它在播，再点就是暂停）
  const ensurePlaying = await evalJs(`(async () => {
    const s = window.__app.state;
    if (!s.playing) document.querySelector("#btn-play").click();
    await new Promise((r) => setTimeout(r, 300));
    return { playing: window.__app.state.playing, position: Math.round(window.__app.state.position) };
  })()`);

  const cpu0 = await metricsOf();
  await evalJs("window.__mut.reset()");
  await sleep(3000);
  const playing = await evalJs("window.__mut.snapshot()");
  const cpu1 = await metricsOf();
  const cpu = {
    scriptMs: Math.round((cpu1.ScriptDuration - cpu0.ScriptDuration) * 1000),
    taskMs: Math.round((cpu1.TaskDuration - cpu0.TaskDuration) * 1000),
    layoutMs: Math.round((cpu1.LayoutDuration - cpu0.LayoutDuration) * 1000),
    styleMs: Math.round((cpu1.RecalcStyleDuration - cpu0.RecalcStyleDuration) * 1000),
  };
  // 播放确实在推进（不然测到的「0 变动」只是暂停时的静止）
  const posAfter = await evalJs("Math.round(window.__app.state.position)");
  cpu.advancedMs = posAfter - (ensurePlaying.position || 0);
  cpu.playing = Boolean((await evalJs("window.__app.state.playing")));
  await evalJs("window.__app.state.playing && document.querySelector('#btn-play').click()");
  await settle();

  // 切歌一帧
  const switchSong = await evalJs(`(async () => {
    window.__mut.reset();
    const t0 = performance.now();
    document.querySelector("#btn-next").click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));
    return { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };
  })()`);

  // 打开设置层
  const openSettings = await evalJs(`(async () => {
    window.__mut.reset();
    const t0 = performance.now();
    document.querySelector("#btn-settings").click();
    await new Promise((r) => setTimeout(r, 500));
    return { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot(), cards: document.querySelectorAll("#settings-layer .card").length };
  })()`);

  // 拨一个开关（迁移前会整块重建设置界面）
  const toggleSwitch = await evalJs(`(async () => {
    window.__mut.reset();
    const t0 = performance.now();
    document.querySelector('#settings-layer [data-toggle="animations"]').click();
    await new Promise((r) => setTimeout(r, 400));
    return { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };
  })()`);

  // 列表密度：紧凑（会让 40 行都重算）
  const density = await evalJs(`(async () => {
    window.__mut.reset();
    const t0 = performance.now();
    document.querySelector('#settings-layer [data-segment="listDensity"] [data-value="compact"]').click();
    await new Promise((r) => setTimeout(r, 400));
    return { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };
  })()`);

  // 切换视图（曲库 ↔ 播放列表 ↔ 歌单）
  const switchView = await evalJs(`(async () => {
    document.querySelector("#btn-settings [data-settings-close], [data-settings-close]").click();
    await new Promise((r) => setTimeout(r, 500));
    window.__mut.reset();
    const t0 = performance.now();
    document.querySelector('[data-nav="playlist"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const out = { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };
    document.querySelector('[data-nav="library"]').click();
    await new Promise((r) => setTimeout(r, 300));
    return out;
  })()`);

  // 打开歌词工作台
  const openLyrics = await evalJs(`(async () => {
    window.__mut.reset();
    const t0 = performance.now();
    document.querySelector("#btn-lyrics").click();
    await new Promise((r) => setTimeout(r, 700));
    const out = { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };
    document.querySelector("#lyrics-panel [data-act='close']").click();
    await new Promise((r) => setTimeout(r, 300));
    return out;
  })()`);

  // 打开播放列表浮层
  const openQueue = await evalJs(`(async () => {
    window.__mut.reset();
    const t0 = performance.now();
    document.querySelector("#btn-playlist").click();
    await new Promise((r) => setTimeout(r, 500));
    const out = { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };
    document.querySelector("#queue-close").click();
    await new Promise((r) => setTimeout(r, 400));
    return out;
  })()`);

  // 单击某一行（选中 / 设为下一首）
  const clickRow = await evalJs(`(async () => {
    window.__mut.reset();
    const t0 = performance.now();
    const rows = document.querySelectorAll(".track");
    rows[5].click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))));
    return { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };
  })()`);

  // ---- 大曲库（1000 首）：直接在页面里把曲库撑大，两边用完全相同的脚本 ----
  const bigLibrary = await evalJs(`(async () => {
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));
    const s = window.__app.state;
    const base = s.songs.slice();
    while (s.songs.length < 1000) {
      const i = s.songs.length;
      const t = base[i % base.length];
      s.songs.push({ ...t, id: "bench_" + i, path: "C:/bench/" + i + ".mp3" });
    }
    s.allSongsRaw = s.songs.slice();
    window.__mut.reset();
    let t0 = performance.now();
    window.__app.commit();
    await raf2();
    const firstPaint = {
      ms: Math.round((performance.now() - t0) * 10) / 10,
      mut: window.__mut.snapshot(),
      nodes: document.getElementsByTagName("*").length,
    };

    window.__mut.reset();
    t0 = performance.now();
    document.querySelector("#btn-next").click();
    await raf2();
    const switchSong = { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };

    window.__mut.reset();
    t0 = performance.now();
    document.querySelectorAll(".track")[500].click();
    await raf2();
    const clickRow = { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };

    window.__mut.reset();
    t0 = performance.now();
    document.querySelector("#btn-settings").click();
    await new Promise((r) => setTimeout(r, 600));
    const openSettings = { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };

    window.__mut.reset();
    t0 = performance.now();
    document.querySelector('#settings-layer [data-segment="listDensity"] [data-value="compact"]').click();
    await new Promise((r) => setTimeout(r, 500));
    const density = { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };

    window.__mut.reset();
    t0 = performance.now();
    document.querySelector('#settings-layer [data-toggle="showAlbumColumn"]').click();
    await new Promise((r) => setTimeout(r, 500));
    const albumToggle = { ms: Math.round((performance.now() - t0) * 10) / 10, mut: window.__mut.snapshot() };

    return {
      rows: document.querySelectorAll(".track").length,
      domNodes: document.getElementsByTagName("*").length,
      firstPaint, switchSong, clickRow, openSettings, density, albumToggle,
    };
  })()`);

  const totalLong = await evalJs("({ count: window.__longTasks.length, ms: window.__longTasks.reduce((a,b)=>a+b,0) })");

  return {
    label: LABEL,
    dist: DIST.replace(root, ""),
    boot, idle, playing, cpu, switchSong, openSettings, toggleSwitch, density,
    switchView, openLyrics, openQueue, clickRow, bigLibrary, totalLong,
  };
}

const result = await run();
// 也可以把结果落盘（避免 PowerShell 重定向写出 UTF-16 的坑）
if (process.env.PERF_OUT) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.PERF_OUT, JSON.stringify(result, null, 2), "utf8");
}
console.log(JSON.stringify(result, null, 2));
ws.close();
edge.kill();
server.close();
