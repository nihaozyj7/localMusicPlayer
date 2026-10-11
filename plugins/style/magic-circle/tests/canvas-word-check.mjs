/* ==========================================================================
   canvas-word-check.mjs — 魔法阵「画布上的逐字点亮」无头浏览器自检
   --------------------------------------------------------------------------
   ★ 这个脚本属于**第三方样式包自己**，与播放器项目源码零耦合：

     · 它自己起一个只读的静态服务，只把本样式包目录暴露出去；
     · 它自己在页面里搭一个「假宿主」（ctx 的六个取值函数 + sdk + actions），
       不 import 宿主的 store / playerhost / 契约包；
     · 歌词直接用契约的 `lines` 形态构造（`{ time, text, words? }`），
       连 LRC 解析器都不需要 —— 验的就是「有了 words 该逐字亮、
       没有 words 必须一像素不变」这条样式自己的责任。

   因此不需要先 npm run dev，也不需要把样式装进播放器：

     node plugins/style/magic-circle/tests/canvas-word-check.mjs

   为什么要换掉 rAF：headless 下合成器不给 BeginFrame（实测 rAF 一次都不来，
   document.hidden 还是 false），样式自己的帧循环会一帧都不跑 —— 换成定时器后
   这条循环与合成器无关，能稳定推进；画布像素直接 getImageData 数出来，
   不依赖截图。

   纯逻辑部分（wordLitCount / withAlpha / shouldLeave / withDisplayText）在
   magic-circle-logic.test.js 里，用 node --test 跑，不需要浏览器。
   ========================================================================== */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

/* --------------------------------------------------------------------------
   1. 把这个样式包目录用静态服务暴露出去
   -------------------------------------------------------------------------- */
const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

/**
 * 页面里的假宿主。
 *
 * 骨架与宿主真实传进来的 ctx 一致（见样式契约 v3 / 本包 README 的「宿主给了什么」），
 * 只保留这个样式真正会读的那几个：env / options / lyrics / track / spectrum / sdk。
 * 歌词是**直接构造**的契约形态，不走 LRC 解析 —— 这样脚本不依赖宿主任何代码。
 */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>magic-circle canvas check</title>
<style>
  html, body { margin: 0; background: #05060a; }
  #stage { position: fixed; left: 0; top: 0; width: 900px; height: 600px; }
</style>
</head>
<body>
<div id="stage"></div>
<script type="module">
import skin from "/skin.js";

const stage = document.getElementById("stage");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 契约形态的歌词行：words 是逐字时间轴（增强 LRC 归一化后的样子） */
const WORD_LINES = [
  { time: 6000, text: "第二句开唱", words: [6000, 6100, 6200, 6300, 6400] },
  { time: 12000, text: "下一句" },
];
const PLAIN_LINES = [
  { time: 6000, text: "第二句开唱" },
  { time: 12000, text: "下一句" },
];

function makeCtx(root) {
  let lines = WORD_LINES;
  let src = "w1";
  return {
    root,
    backgroundRoot: null,
    env: () => ({ width: 900, height: 600, dpr: 1, reducedMotion: false }),
    options: () => ({
      showLyrics: true,
      interactive: false,
      animations: false,
      lyricsFontSize: 16,
      performanceMode: "smooth",
    }),
    lyrics: () => ({ lines, index: 0, source: src, text: "x", status: "ready", statusText: "" }),
    track: () => ({ title: "T", artist: "A", album: "" }),
    spectrum: () => null,
    sdk: { splitGraphemes: (t) => Array.from(String(t == null ? "" : t)) },
    actions: { seek() {} },
    setLines(next, source) {
      lines = next;
      src = source;
    },
  };
}

async function run() {
  const rafOrig = window.requestAnimationFrame;
  const cafOrig = window.cancelAnimationFrame;
  let frames = 0;
  window.requestAnimationFrame = (cb) =>
    setTimeout(() => {
      frames += 1;
      cb(performance.now());
    }, 8);
  window.cancelAnimationFrame = (tid) => clearTimeout(tid);

  let root = null;
  let ctx = null;
  try {
    root = document.createElement("div");
    stage.appendChild(root);
    ctx = makeCtx(root);
    skin.mount(ctx);

    const canvas = root.querySelector(".mc__canvas");
    if (!canvas) return { error: "挂载后没有 .mc__canvas" };
    const g = canvas.getContext("2d");

    /** 整幅画面的两个判据：金色像素（已唱）与亮像素（字画出来了） */
    const stats = () => {
      const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let warm = 0;
      let bright = 0;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] >= 200) bright += 1;
        if (d[i] - d[i + 2] >= 30 && d[i] >= 150) warm += 1;
        sum = (sum + d[i] * 31 + d[i + 1] * 17 + d[i + 2] * 7) % 2147483647;
      }
      return { warm, bright, sum };
    };
    const setLines = (next, source) => {
      ctx.setLines(next, source);
      skin.update(ctx, { type: "lyrics" });
    };
    const at = async (ms) => {
      skin.update(ctx, { type: "progress", position: ms, lyricIndex: 0, duration: 40000, playing: false });
      await wait(400);
      return stats();
    };

    setLines(WORD_LINES, "w1");
    await wait(1400);
    const wordPre = await at(5900); // 还没开口：整行压暗，一个字都不该亮
    const word0 = await at(6050); // 唱到第 1 个字
    const word2 = await at(6300); // 唱到第 4 个字
    const word4 = await at(6500); // 整句唱完

    setLines(PLAIN_LINES, "p1");
    await wait(900);
    const plain0 = await at(6050);
    const plain2 = await at(6300);
    const plain4 = await at(6500);

    return {
      frames,
      canvas: { w: canvas.width, h: canvas.height },
      wordPre,
      word0,
      word2,
      word4,
      plain0,
      plain2,
      plain4,
      // 行级歌词在不同进度下必须**一像素不变**（外推 / 点亮都不该发生）
      plainSame: plain0.sum === plain2.sum && plain2.sum === plain4.sum,
    };
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  } finally {
    window.requestAnimationFrame = rafOrig;
    window.cancelAnimationFrame = cafOrig;
    try {
      if (ctx) skin.destroy(ctx);
    } catch {
      /* 已经拆过了 */
    }
    if (root) root.remove();
  }
}

window.__mc = { run };
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/" || url.pathname === "/__harness.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS);
    return;
  }
  // 只服务本样式包目录之内，且只读
  const file = resolve(PKG_ROOT, decodeURIComponent(url.pathname).replace(/^\/+/, ""));
  if (file !== PKG_ROOT && !file.startsWith(PKG_ROOT + sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (!existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream" });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* --------------------------------------------------------------------------
   2. 起无头 Edge 并接上 CDP
   -------------------------------------------------------------------------- */
const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 msedge.exe —— 这一项自检需要本机装 Edge（系统自带）。");
  server.close();
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(tmpdir(), "magic-circle-check-" + Date.now());
mkdirSync(OUT, { recursive: true });

const CDP_PORT = 9431;
const W = 1440;
const H = 900;
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--user-data-dir=${join(OUT, "profile")}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--window-size=${W},${H}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let targets = null;
for (let i = 0; i < 60; i += 1) {
  await sleep(500);
  try {
    targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    if (targets.some((t) => t.type === "page")) break;
  } catch {
    /* 还没起来 */
  }
}
const page = (targets || []).find((t) => t.type === "page");
if (!page) {
  console.error("CDP 起不来");
  edge.kill();
  server.close();
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await Promise.race([
  new Promise((r) => (ws.onopen = r)),
  sleep(8000).then(() => {
    throw new Error("CDP WebSocket 连不上");
  }),
]);

let msgId = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    errors.push(`exception: ${d?.exception?.description || d?.text}`);
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (text && !/404/.test(text)) errors.push(`error: ${text}`);
  }
};

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve_, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP 超时：${method}`));
    }, 25000);
    pending.set(id, (m) => {
      clearTimeout(timer);
      resolve_(m);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    throw new Error(d?.exception?.description || d.text);
  }
  return r.result?.result?.value;
}

/* --------------------------------------------------------------------------
   3. 断言
   -------------------------------------------------------------------------- */
let pass = 0;
let fail = 0;
function check(ok, label, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}  ${detail}`);
  }
}

try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE + "/__harness.html" });

  // 等页面里的 module 把 window.__mc 挂上
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    ready = (await evaluate("!!window.__mc")) === true;
    if (ready) break;
  }
  if (!ready) throw new Error("harness 页面没准备好（window.__mc 未定义）");

  console.log("\n[1] 挂载与帧循环");
  const mc = await evaluate("window.__mc.run()");
  console.log("   ", JSON.stringify(mc));
  check(!mc?.error, "魔法阵能挂载并渲染", String(mc?.error || ""));
  check(mc?.frames > 0, "样式自己的帧循环跑起来了（rAF 已换成定时器）", `frames=${mc?.frames}`);

  console.log("\n[2] 有字级时间轴：金色像素随进度变多");
  check(
    mc?.wordPre && mc.wordPre.warm === 0 && mc.wordPre.bright < mc.plain0.bright,
    "还没唱到这一句：没有金色字，且未唱字被压暗",
    JSON.stringify(mc?.wordPre)
  );
  check(mc?.word0?.warm > 0, "唱到第 1 个字：金色开始出现", JSON.stringify(mc?.word0));
  check(mc?.word2?.warm > mc?.word0?.warm, "唱到第 4 个字：点亮的字更多", JSON.stringify(mc?.word2));
  check(mc?.word4?.warm > mc?.word2?.warm, "整句唱完：整行都点亮", JSON.stringify(mc?.word4));

  console.log("\n[3] 没有字级时间轴：一像素不变（回退逐行）");
  check(mc?.plain0?.warm === 0, "行级歌词一个金色像素都不产生", JSON.stringify(mc?.plain0));
  check(mc?.plainSame === true, "行级歌词在不同进度下渲染完全一致", String(mc?.plainSame));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  console.log(errors.length ? `—— 控制台报错 ${errors.length} 条 ——` : "—— 控制台无 error ——");
  for (const e of [...new Set(errors.map((x) => x.split("\n")[0]))].slice(0, 20)) console.log(" ", e);
} finally {
  try {
    ws.close();
  } catch {
    /* 已关 */
  }
  edge.kill();
  server.close();
}

process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
