/* ==========================================================================
   verify-no-flicker.mjs — 「列表区域闪一下」修复的真实验证
   --------------------------------------------------------------------------
   两个用户可见的现象：
     ① 进入界面时列表区域闪一下；② 切换歌曲时列表区域闪一下。

   修复前的成因（两条叠在一起）：
     · store.js 的 recalcVisible 每次调用都把 visibleVersion +1，而它是
       commit() 里无条件跑的 —— 于是**任何**状态变更（换歌、调音量、扫描
       结束、封面回填…）都会让渲染键变化、整张曲目表被 innerHTML 重建：
       所有 <img> 重新创建 + 重新解码 = 闪一下；
     · shell.js 每次渲染都新建 .page 容器，而 .page 上挂着 fade-in 入场
       动画 —— 整块列表跟着淡入一次 = 再闪一下。

   本脚本不看代码，直接量 DOM 有没有被重建：
     A. 换一首歌（列表内容没变）：.page / 每一行 .track / 每张 <img>
        必须还是**同一个对象**，且 .tracks__body 一个子节点都没增删；
     B. 模拟「扫描结束」（渲染键会变，列表内容不变）：同上；
     C. 真正切换视图（进入另一个列表）：.page 必须重建 —— 入场动画要有得播，
        别把该有的转场一起改掉。

   用法：node tools/verify-no-flicker.mjs      （需先 npm run build）
   ========================================================================== */

import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(root, "frontend", "dist");
const PORT = 4996;
const CDP_PORT = 9340;
const W = 1280;
const H = 820;

if (!existsSync(join(DIST, "index.html"))) {
  console.error("frontend/dist 不存在，先跑 npm run build");
  process.exit(1);
}

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
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const f = join(DIST, p.replace(/^\//, ""));
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end("404 " + p);
  }
  res.writeHead(200, { "Content-Type": MIME[extname(f).toLowerCase()] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const prof = join(tmpdir(), "vf-profile-" + Date.now());
mkdirSync(prof, { recursive: true });
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    `--user-data-dir=${prof}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--window-size=${W},${H}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error("FAIL:", msg);
  try {
    edge.kill();
    server.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
}

let version = null;
for (let i = 0; i < 60 && !version; i++) {
  await sleep(500);
  try {
    version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
  } catch {
    /* 还没起来 */
  }
}
if (!version) fail("CDP 端点未就绪");
console.log("浏览器:", version.Browser);

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) fail("没有 page target");

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
  const res = r.result;
  if (res?.exceptionDetails) {
    return { __error: res.exceptionDetails.exception?.description || res.exceptionDetails.text };
  }
  return res?.result?.value;
}

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
await sleep(3500);

/* --------------------------------------------------------------------------
   页面侧的量测代码
   -------------------------------------------------------------------------- */
const PROBE = `
(() => {
  const app = window.__app;
  if (!app) return { error: "window.__app 不存在" };
  const body = document.querySelector(".tracks__body");
  if (!body) return { error: "没有 .tracks__body" };

  const counter = { added: 0, removed: 0 };
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      counter.added += m.addedNodes.length;
      counter.removed += m.removedNodes.length;
    }
  });
  mo.observe(body, { childList: true });

  const snap = () => ({
    page: document.querySelector(".page"),
    rows: [...document.querySelectorAll(".track")],
    imgs: [...document.querySelectorAll(".track__cover img")],
    body,
  });
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sameList = (a, b) => a.length === b.length && a.every((el, i) => el === b[i]);

  const out = { rows: document.querySelectorAll(".track").length };

  return (async () => {
    /* ---- A. 换歌：列表内容没变，DOM 一个节点都不该重建 ---- */
    {
      const before = snap();
      const beforeId = app.state.currentId;
      const ids = app.state.visibleSongs.map((s) => s.id);
      const target = ids[3];

      counter.added = 0;
      counter.removed = 0;
      app.state.currentId = target;
      app.state.playing = true;
      app.commit();
      await frames();
      const after = snap();

      out.songSwitch = {
        pageKept: before.page === after.page,
        rowsKept: sameList(before.rows, after.rows),
        imgsKept: sameList(before.imgs, after.imgs),
        bodyMutations: counter.added + counter.removed,
        newMarked: document.querySelector('.track[data-id="' + target + '"]')?.getAttribute("aria-current") === "true",
        oldCleared: document.querySelector('.track[data-id="' + beforeId + '"]')?.getAttribute("aria-current") === "false",
      };
    }

    /* ---- B. 扫描结束（渲染键会变，列表内容不变）---- */
    {
      const before = snap();
      counter.added = 0;
      counter.removed = 0;
      app.state.lastScan = { at: Date.now(), found: out.rows, kept: out.rows, excluded: 0, added: 0, removed: 0 };
      app.commit();
      await frames();
      const after = snap();

      out.scanDone = {
        pageKept: before.page === after.page,
        rowsKept: sameList(before.rows, after.rows),
        imgsKept: sameList(before.imgs, after.imgs),
        bodyMutations: counter.added + counter.removed,
      };
    }

    /* ---- C. 连续多次无关提交（相当于启动期那一串 commit）---- */
    {
      const before = snap();
      counter.added = 0;
      counter.removed = 0;
      for (let i = 0; i < 8; i += 1) {
        app.state.volume = 0.5 + i / 100;
        app.state.position = i * 1000;
        app.commit();
      }
      await frames();
      const after = snap();

      out.idleCommits = {
        pageKept: before.page === after.page,
        rowsKept: sameList(before.rows, after.rows),
        imgsKept: sameList(before.imgs, after.imgs),
        bodyMutations: counter.added + counter.removed,
      };
    }

    /* ---- D. 排序：行的顺序变了，但要复用心智（不能重建）---- */
    {
      const before = snap();
      counter.added = 0;
      counter.removed = 0;
      app.state.sortKey = "title";
      app.state.sortDir = "asc";
      app.commit();
      await frames();
      const after = snap();
      const sameSet = after.rows.length === before.rows.length && after.rows.every((el) => before.rows.includes(el));

      out.sort = {
        pageKept: before.page === after.page,
        rowsReused: sameSet,
        bodyMutations: counter.added + counter.removed,
      };
    }

    /* ---- E. 真·切换视图：.page 应当重建（入场动画要有得播）---- */
    {
      const before = snap();
      app.navigate("queue");
      await frames();
      const after = snap();
      out.viewSwitch = {
        pageRecreated: before.page !== after.page,
        rows: after.rows.length,
        mode: document.querySelector(".tracks")?.dataset.mode || "",
      };
    }

    mo.disconnect();
    return out;
  })();
})()
`;

const result = await evaluate(PROBE);
console.log(JSON.stringify(result, null, 2));

ws.close();
edge.kill();
server.close();

if (result?.__error || result?.error) fail(result.__error || result.error);

const checks = [
  ["A 换歌 .page 复用", result.songSwitch.pageKept],
  ["A 换歌 行元素复用", result.songSwitch.rowsKept],
  ["A 换歌 封面 img 复用", result.songSwitch.imgsKept],
  ["A 换歌 .tracks__body 零增删", result.songSwitch.bodyMutations === 0],
  ["A 换歌 新行高亮", result.songSwitch.newMarked],
  ["A 换歌 旧行取消高亮", result.songSwitch.oldCleared],
  ["B 扫描结束 .page 复用", result.scanDone.pageKept],
  ["B 扫描结束 行元素复用", result.scanDone.rowsKept],
  ["B 扫描结束 封面 img 复用", result.scanDone.imgsKept],
  ["B 扫描结束 .tracks__body 零增删", result.scanDone.bodyMutations === 0],
  ["C 连续提交 .page 复用", result.idleCommits.pageKept],
  ["C 连续提交 行元素复用", result.idleCommits.rowsKept],
  ["C 连续提交 .tracks__body 零增删", result.idleCommits.bodyMutations === 0],
  ["D 排序 .page 复用", result.sort.pageKept],
  ["D 排序 行元素复用（不重建）", result.sort.rowsReused],
  ["E 切视图 .page 重建（入场动画保留）", result.viewSwitch.pageRecreated],
  ["E 切视图 队列表渲染出行", result.viewSwitch.rows > 0],
  ["E 切视图 模式=playlist", result.viewSwitch.mode === "playlist"],
];

let bad = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok  " : "FAIL"} - ${name}`);
  if (!ok) bad += 1;
}
console.log(bad ? `\n${bad} 项未通过` : "\n全部通过：换歌 / 扫描结束 / 连续提交都不再重建列表 DOM。");
process.exit(bad ? 1 : 0);
