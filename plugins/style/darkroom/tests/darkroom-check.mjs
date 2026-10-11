/* ==========================================================================
   darkroom-check.mjs — 「暗房」在真实浏览器里的观感与契约自检
   --------------------------------------------------------------------------
   ★ 这个脚本属于**第三方样式包自己**，与播放器项目源码零耦合：

     · 自己起一个只读静态服务，只把本样式包目录暴露出去；
     · 自己在页面里搭「假宿主」（ctx 的取值函数 + sdk + actions），
       不 import 宿主的 store / playerhost / 契约包；
     · 歌词直接按契约的 `lines` 形态构造（`{ time, text, words? }`）；
     · **按宿主的方式加载样式**：把 skin.css 包进
       `@layer skin { @scope (.playerview[data-skin="darkroom"], .skin-bg[data-skin="darkroom"]) { … } }`
       —— 这样验的是真实生效路径，而不是"裸 CSS 也能跑"的假象。

   跑法（不需要 npm run dev，也不需要装进播放器）：

     node plugins/style/darkroom/tests/darkroom-check.mjs

   为什么要换掉 rAF：headless 下合成器不给 BeginFrame（实测 rAF 一次都不来），
   样式自己的帧循环会一帧都不跑。换成定时器后它与合成器无关，能稳定推进；
   像素 / 计算样式直接读，不依赖截图。

   纯逻辑（取色、频谱、歌词时序、契约静态体检）在 darkroom-logic.test.js 里，
   用 node --test 跑。
   ========================================================================== */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

/* --------------------------------------------------------------------------
   1. 把样式包目录用静态服务暴露出去（只读、越界 403）
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
 * 页面里的假宿主 + 全部场景。
 *
 * 骨架与宿主真实传进来的 ctx 一致（见 skinhost.js#makeCtx）：root / backgroundRoot /
 * defaultCover / env / options / media / track / lyrics / playback / spectrum / sdk / actions。
 */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>darkroom check</title>
<style>
  html, body { margin: 0; background: #000; }
  /* 假宿主的外壳：真实宿主里 .playerview__stage 由 playerview.css 定位 */
  .playerview { position: fixed; left: 0; top: 0; width: 1100px; height: 700px; }
  .playerview__stage { position: relative; height: 100%; overflow: hidden; }
  .skin-bg { position: fixed; left: 0; top: 0; right: 0; bottom: 0; }
</style>
</head>
<body>
<div class="skin-bg" data-skin="darkroom"></div>
<div class="playerview" data-skin="darkroom"><div class="playerview__stage" id="stage"></div></div>
<script type="module">
import skin from "/skin.js";

const stage = document.getElementById("stage");
const bgRoot = document.querySelector(".skin-bg");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = (el, name) => (el ? el.style.getPropertyValue(name).trim() : "");
const computed = (el, name) => (el ? getComputedStyle(el).getPropertyValue(name).trim() : "");

/* 把计算样式里的颜色（可能是 oklab() / color-mix() 的结果）落到真实 sRGB 像素上。
   直接用正则解析 oklab 太依赖引擎的实现细节；画到画布上读回来才是"用户看到的颜色"。 */
const probeCanvas = document.createElement("canvas");
probeCanvas.width = 1;
probeCanvas.height = 1;
const probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
function toRgb(css) {
  if (!css) return null;
  probeCtx.clearRect(0, 0, 1, 1);
  probeCtx.fillStyle = "#000000";
  probeCtx.fillStyle = css;
  probeCtx.fillRect(0, 0, 1, 1);
  const d = probeCtx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

/* 按宿主的方式加载样式：@layer skin + @scope(舞台根)。 */
const cssText = await (await fetch("/skin.css")).text();
const styleEl = document.createElement("style");
styleEl.textContent = '@layer skin { @scope (.playerview[data-skin="darkroom"], .skin-bg[data-skin="darkroom"]) { ' + cssText + ' } }';
document.head.appendChild(styleEl);

/** 封面：用 canvas 造一张真图（data URL 与真实封面同形态，getImageData 不会被污染） */
function makeCover(a, b) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = a;
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = b;
  g.fillRect(0, 32, 64, 32);
  return c.toDataURL("image/png");
}
const COVER = makeCover("#d2541e", "#2b4fa8");
const DEFAULT_COVER = makeCover("#2b4fa8", "#12100e");

/* 契约形态的歌词：
   前两行有完整 words、第 3 行没有（必须退回逐行点亮）。
   时间取整秒级 —— 视觉比声音慢 80ms、墙钟还会继续外推，
   断言只落在"明显已经唱到 / 明显还没唱到"的位置上，不卡在 1/16 的量化边界。
   第 0 行末字 5500 到下一行 8000 之间留了 2.5 秒空档，
   专门盯"长间奏时最后一个字会不会慢慢亮十几秒"。 */
const LINES = [
  { time: 0, text: "第一句已经唱过", words: [0, 1000, 2000, 3000, 4000, 5000, 5500] },
  { time: 8000, text: "第二句开唱", words: [8000, 9000, 10000, 11000, 12000] },
  { time: 14000, text: "下一句" },
];

function createHost(o) {
  const rec = { seeks: [], backdrops: [], spectrumCalls: 0 };
  const opt = Object.assign(
    {
      showLyrics: true,
      interactive: true,
      animations: true,
      lyricsFontSize: 21,
      performanceMode: "smooth",
    },
    o.options || {}
  );
  const media = {
    song: { id: "song-1", title: "旧梦一场", artist: "某歌手", album: "某专辑", duration: 240000, kind: "local" },
    cover: o.cover === undefined ? COVER : o.cover,
    covers: [],
    coverIndex: 0,
    lyrics: {
      lines: o.lines || LINES,
      index: 0,
      source: "test",
      text: "",
      status: (o.lines || LINES).length ? "ok" : "none",
      statusText: "",
    },
  };
  const pb = { position: o.position || 0, duration: 240000, playing: o.playing !== false, volume: 1, muted: false };
  let spec = o.spectrum || null;

  const ctx = {
    root: o.root,
    backgroundRoot: bgRoot,
    defaultCover: DEFAULT_COVER,
    env: () => ({ width: 1100, height: 700, dpr: 1, reducedMotion: false }),
    options: () => opt,
    media: () => media,
    track: () => media.song,
    lyrics: () => media.lyrics,
    playback: () => pb,
    spectrum: () => {
      // 样式每帧读一次频谱 → 这个计数就是"真正画了几帧"（rAF 回调数会被限掉的帧灌水）
      rec.spectrumCalls += 1;
      return spec ? { bands: spec, at: performance.now() } : null;
    },
    sdk: {
      splitGraphemes: (t) => Array.from(String(t == null ? "" : t)),
      html: {
        EMPTY_TRACK: { id: "", title: "", artist: "", album: "", duration: 0, kind: "local" },
        subtitleOf: (a, b) => [a, b].filter(Boolean).join(" · ") || "—",
        lyricsEmptyText: (ly) =>
          (ly && ly.statusText) ||
          (ly && ly.status === "loading" ? "歌词匹配中…" : ly && ly.status === "failed" ? "歌词匹配失败" : "暂无歌词"),
        setCoverImage: (img, src, fb) => {
          if (img) img.src = src || fb || "";
        },
      },
      util: { clamp: (v, a, b) => Math.min(b, Math.max(a, v)) },
    },
    actions: {
      seek: (ms) => rec.seeks.push(ms),
      reportBackdrop: (pal) => rec.backdrops.push(pal),
    },
  };

  return {
    ctx,
    rec,
    media,
    setOptions: (patch) => Object.assign(opt, patch),
    setPosition: (p, playing) => {
      pb.position = p;
      pb.playing = playing === undefined ? pb.playing : playing;
    },
    setLines: (lines, status) => {
      media.lyrics.lines = lines;
      media.lyrics.status = status || (lines.length ? "ok" : "none");
    },
    setSpectrum: (bands) => {
      spec = bands;
    },
  };
}

const counters = { frames: 0 };

function mountInstance(o) {
  const root = document.createElement("div");
  stage.appendChild(root);
  const host = createHost(Object.assign({ root }, o));
  skin.mount(host.ctx);
  return { root, host, dr: root.querySelector(".dr") };
}

function push(inst, patch) {
  skin.update(inst.host.ctx, patch);
}

/** 当前行的逐字进度（读**行内** --g：没写过就是 null） */
function glyphsOf(index) {
  const row = stage.querySelector('.dr__line[data-index="' + index + '"]');
  if (!row) return null;
  return Array.from(row.querySelectorAll(".dr__g")).map((g) => {
    const v = g.style.getPropertyValue("--g");
    return v === "" ? null : Number(v);
  });
}

function activeIndex() {
  const row = stage.querySelector('.dr__line[data-state="active"]');
  return row ? Number(row.dataset.index) : -1;
}

/** 走一步进度并等画面跟上 */
async function at(inst, ms, playing) {
  inst.host.setPosition(ms, playing === undefined ? true : playing);
  push(inst, { type: "progress", position: ms, duration: 240000, playing: playing === undefined ? true : playing });
  await wait(140);
}

const report = {};

/** 第 1 行里"已唱字"与"未唱字"的计算样式（顺带落到真实像素上） */
function colors() {
  const units = Array.from(stage.querySelectorAll('.dr__line[data-index="1"] .dr__g'));
  if (!units.length) return null;
  const first = computed(units[0], "color");
  const lastStr = computed(units[units.length - 1], "color");
  return {
    lit: first,
    unlit: lastStr,
    litRgb: toRgb(first),
    unlitRgb: toRgb(lastStr),
    transition: computed(units[0], "transition-property"),
  };
}

async function scenarioA() {
  const a = mountInstance({ options: { interactive: true } });
  const out = { mounted: {} };

  // ── 挂载 ──
  out.mounted = {
    hasDr: !!a.dr,
    title: a.dr?.querySelector(".dr__title")?.textContent || "",
    sub: a.dr?.querySelector(".dr__sub")?.textContent || "",
    lineCount: stage.querySelectorAll(".dr__line").length,
    glyphCounts: Array.from(stage.querySelectorAll(".dr__line")).map(
      (r) => r.querySelectorAll(".dr__g").length
    ),
    fontSizeVar: prop(a.dr, "--dr-fs"),
    interactiveRows: stage.querySelectorAll('.dr__line[role="button"]').length,
    bgImgSrc: bgRoot.querySelector(".drbg__img")?.getAttribute("src")?.slice(0, 24) || "",
    layers: Array.from(a.dr.querySelectorAll(":scope > *")).map((el) => el.className || el.tagName),
  };

  // ── 取色上报（400ms 防抖）──
  await wait(700);
  out.backdrops = a.host.rec.backdrops.slice(0, 3);
  out.accentVar = prop(a.dr, "--dr-accent");
  out.bgReady = bgRoot.querySelector(".drbg__img")?.dataset.ready === "1";

  // ── 逐字点亮（前两行都有 words）──
  // 读数时机：每次 at() 都等 140ms，期间墙钟仍在外推（视觉位置 ≈ 补丁位置 + 60ms）
  // —— 所以断言只落在"明显已经唱到 / 明显还没唱到"的位置上。
  await at(a, 7300); // 第 0 行：末字 5500 + 中位字长 1000 = 6500 就该点满
  out.line0Done = glyphsOf(0);
  await at(a, 8300); // 刚进第 1 行
  out.line1Start = { index: activeIndex(), g: glyphsOf(1) };
  await at(a, 9500);
  out.line1Step1 = glyphsOf(1);
  out.colors = colors();
  await at(a, 10500);
  out.line1Step2 = glyphsOf(1);
  await at(a, 11500);
  out.line1Step3 = glyphsOf(1);
  await at(a, 13500);
  out.line1Done = { index: activeIndex(), g: glyphsOf(1), prev: glyphsOf(0) };

  // ── 没有 words 的行：退回逐行线性点亮（14000 起 + 4 秒兜底窗口）──
  await at(a, 16000);
  out.line2Fallback = { index: activeIndex(), g: glyphsOf(2) };

  // ── 交互：点歌词跳转 ──
  const rows = Array.from(stage.querySelectorAll(".dr__line"));
  rows[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
  rows[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  out.seeks = a.host.rec.seeks.slice();

  // ── 布局位移与后期层（@scope 下真的生效）──
  const list = a.dr.querySelector(".dr__list");
  const grain = a.dr.querySelector(".dr__grain");
  const bloom = a.dr.querySelector(".dr__bloom");
  const shift = computed(a.dr, "--dr-shift");
  out.css = {
    shift,
    listTransform: computed(list, "transform"),
    listTransition: computed(list, "transition-property"),
    grainAnimation: computed(grain, "animation-name"),
    grainBlend: computed(grain, "mix-blend-mode"),
    bloomFilter: computed(bloom, "filter"),
    bloomImage: computed(bloom, "background-image").slice(0, 30),
    bgImgFilter: computed(bgRoot.querySelector(".drbg__img"), "filter"),
    gateTransition: computed(a.dr.querySelector(".dr__gate--top"), "transition-property"),
    shutter: a.dr.dataset.shutter || "",
  };

  // ── 频谱接线：低频喂 bloom、高频喂 grain、突变出一次 halation ──
  a.host.setSpectrum(new Float32Array(128).fill(0.1));
  await wait(500);
  out.halBefore = prop(a.dr, "--dr-hal");
  a.host.setSpectrum(new Float32Array(128).fill(0.95));
  await wait(90);
  out.halAfter = prop(a.dr, "--dr-hal");
  await wait(1400);
  out.bloomHigh = prop(a.dr, "--dr-bloom");
  out.grainHigh = prop(a.dr, "--dr-grain");
  a.host.setSpectrum(null);
  await wait(1500);
  out.bloomIdle = prop(a.dr, "--dr-bloom");

  // ── 歌词空态 ──
  a.host.setLines([], "loading");
  push(a, { type: "lyrics" });
  await wait(120);
  out.empty = {
    text: a.dr.querySelector(".dr__empty").textContent,
    emptyHidden: a.dr.querySelector(".dr__empty").hidden,
    lyHidden: a.dr.querySelector(".dr__ly").hidden,
  };
  a.host.setLines(LINES, "ok");
  push(a, { type: "lyrics" });
  await wait(120);

  // ── 暂停 6 秒后停帧（宿主约定）──
  a.host.setPosition(11000, false);
  push(a, { type: "progress", position: 11000, duration: 240000, playing: false });
  await wait(6300);
  const framesAtIdle = counters.frames;
  await wait(400);
  out.idle = { dataIdle: a.dr.dataset.idle === "1", frozen: counters.frames === framesAtIdle };

  const framesBeforeDestroy = counters.frames;

  // ── 卸载：舞台与整窗背景层都必须干净 ──
  skin.destroy(a.host.ctx);
  await wait(300);
  out.destroy = {
    stageDr: !!stage.querySelector(".dr"),
    rootHtml: a.root.innerHTML,
    bgHtml: bgRoot.innerHTML,
    bgHidden: bgRoot.hidden === true,
    framesStop: counters.frames === framesBeforeDestroy,
  };
  a.root.remove();
  return out;
}

async function scenarioB() {
  // animations:false → 完全不进帧循环，但画面必须仍然正确（只画一帧）
  const start = counters.frames;
  const b = mountInstance({ options: { animations: false, interactive: false }, position: 0, playing: false });
  await wait(400);
  const afterMount = counters.frames - start;
  // 暂停 = 不外推：值可以精确复现（10420ms → 第 3 个字半亮）
  await at(b, 10500, false);
  const out = {
    framesAfterMount: afterMount,
    glyphs: glyphsOf(1),
    staticAttr: b.dr.dataset.static || "",
    grainAnimation: computed(b.dr.querySelector(".dr__grain"), "animation-name"),
    listTransition: computed(b.dr.querySelector(".dr__list"), "transition-property"),
  };
  // interactive:false → 点歌词不该跳转
  const rows = Array.from(stage.querySelectorAll(".dr__line"));
  rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
  out.seeks = b.host.rec.seeks.slice();
  out.interactiveRows = stage.querySelectorAll('.dr__line[role="button"]').length;
  out.inputDisabled = b.dr.dataset.interactive || "";
  skin.destroy(b.host.ctx);
  b.root.remove();
  return out;
}

async function scenarioC() {
  // performance 档：按清单 budgetFps 限帧 + 颗粒层停转。
  // ★ 数的是"真正画了几帧"（每帧读一次 ctx.spectrum()），不是 rAF 回调数 ——
  //   被限掉的帧仍然会立刻重排 rAF，数回调会得到 100+，看不出限帧到底有没有生效。
  const bands = new Float32Array(128).fill(0.4);

  const perf = mountInstance({
    options: { performanceMode: "performance" },
    position: 0,
    playing: true,
    spectrum: bands,
  });
  const perfStart = perf.host.rec.spectrumCalls;
  await wait(1200);
  const out = {
    perfAttr: perf.dr.dataset.perf || "",
    grainAnimation: computed(perf.dr.querySelector(".dr__grain"), "animation-name"),
    perfPaints: perf.host.rec.spectrumCalls - perfStart,
  };
  skin.destroy(perf.host.ctx);
  perf.root.remove();

  const smooth = mountInstance({
    options: { performanceMode: "smooth" },
    position: 0,
    playing: true,
    spectrum: bands,
  });
  const smoothStart = smooth.host.rec.spectrumCalls;
  await wait(1200);
  out.smoothPaints = smooth.host.rec.spectrumCalls - smoothStart;
  out.smoothGrainAnimation = computed(smooth.dr.querySelector(".dr__grain"), "animation-name");
  skin.destroy(smooth.host.ctx);
  smooth.root.remove();
  return out;
}

async function run() {
  const rafOrig = window.requestAnimationFrame;
  const cafOrig = window.cancelAnimationFrame;
  window.requestAnimationFrame = (cb) =>
    setTimeout(() => {
      counters.frames += 1;
      cb(performance.now());
    }, 8);
  window.cancelAnimationFrame = (tid) => clearTimeout(tid);

  try {
    report.A = await scenarioA();
  } catch (err) {
    report.A = { error: String(err && err.message ? err.message : err) };
  }
  try {
    report.B = await scenarioB();
  } catch (err) {
    report.B = { error: String(err && err.message ? err.message : err) };
  }
  try {
    report.C = await scenarioC();
  } catch (err) {
    report.C = { error: String(err && err.message ? err.message : err) };
  }

  window.requestAnimationFrame = rafOrig;
  window.cancelAnimationFrame = cafOrig;
  report.frames = counters.frames;
  return report;
}

window.__dr = { run };
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
const OUT = join(tmpdir(), "darkroom-check-" + Date.now());
mkdirSync(OUT, { recursive: true });

const CDP_PORT = 9432;
const W = 1100;
const H = 700;
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
    }, 60000);
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
const j = (v) => JSON.stringify(v);
const num = (v) => Number(v);

/** WCAG 对比度（与 lib/color.js 同一套定义，这里独立算一遍当"第二意见"） */
function contrast(hexA, hexB) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = (h) => {
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const la = lum(hexA);
  const lb = lum(hexB);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE + "/__harness.html" });

  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    ready = (await evaluate("!!window.__dr")) === true;
    if (ready) break;
  }
  if (!ready) throw new Error("harness 页面没准备好（window.__dr 未定义）");

  console.log("跑场景（约 15 秒）…");
  const r = await evaluate("window.__dr.run()");
  const A = r?.A || {};
  const B = r?.B || {};
  const C = r?.C || {};

  console.log("\n[1] 挂载与骨架");
  check(!A.error, "样式能挂载并渲染", j(A.error || ""));
  check(A.mounted?.hasDr === true, "舞台根里出现了 .dr");
  check(A.mounted?.title === "旧梦一场", "曲名进了 HUD", j(A.mounted?.title));
  check(/某歌手/.test(A.mounted?.sub || ""), "副标题（歌手 · 专辑）进了 HUD", j(A.mounted?.sub));
  check(A.mounted?.lineCount === 3, "歌词行数 = lines 长度", j(A.mounted?.lineCount));
  check(
    j(A.mounted?.glyphCounts) === j([7, 5, 3]),
    "每行的字素数 = 字素切分结果（与 words 下标同一份切法）",
    j(A.mounted?.glyphCounts)
  );
  check(A.mounted?.fontSizeVar === "21px", "宿主设置的字号被尊重（--dr-fs）", j(A.mounted?.fontSizeVar));
  check(A.mounted?.interactiveRows === 3, "interactive 时每行都是可聚焦按钮", j(A.mounted?.interactiveRows));
  check(
    j(A.mounted?.layers) ===
      j([
        "dr__bloom",
        "dr__ly",
        "dr__empty",
        "dr__hud",
        "dr__frame",
        "dr__scan",
        "dr__grain",
        "dr__vig",
        "dr__gate dr__gate--top",
        "dr__gate dr__gate--bottom",
      ]),
    "叠层顺序（快门在最上层）",
    j(A.mounted?.layers)
  );

  console.log("\n[2] 封面取色 → 宿主壳配色");
  check((A.backdrops || []).length >= 1, "reportBackdrop 上报了", j(A.backdrops));
  const pal = (A.backdrops || [])[0] || {};
  check(/^#[0-9a-f]{6}$/.test(pal.bg || "") && /^#[0-9a-f]{6}$/.test(pal.fg || ""), "上报的是合法 hex", j(pal));
  if (pal.bg && pal.fg) {
    const ratio = contrast(pal.bg, pal.fg);
    check(ratio >= 4.5, `上报配色的对比度 ≥ 4.5（实际 ${ratio.toFixed(2)}）`, j(pal));
  }
  check(/^#[0-9a-f]{6}$/.test(A.accentVar || ""), "画面强调色来自封面主色（--dr-accent）", j(A.accentVar));
  check(A.bgReady === true, "整窗背景图解码完成后才淡入（data-ready）");

  console.log("\n[3] 逐字点亮（有 words 的行）");
  check(
    j(A.line0Done) === j([1, 1, 1, 1, 1, 1, 1]),
    "第 0 行：末字之后的 2.5 秒间奏里，最后一个字也已经在句内点满",
    j(A.line0Done)
  );
  check(A.line1Start?.index === 1, "进度走到第 2 行后高亮行随之切换", j(A.line1Start?.index));
  const g1 = A.line1Start?.g || [];
  check(
    g1[0] > 0 && g1[0] < 1,
    "刚进这一行：第 1 个字正在唱（0 < --g < 1）",
    j(g1)
  );
  check(
    g1.slice(1).every((v) => v === 0),
    "没唱到的字必须是 0（不能提前亮）",
    j(g1)
  );
  const fullCount = (arr) => (arr || []).filter((v) => v === 1).length;
  const partialCount = (arr) => (arr || []).filter((v) => v > 0 && v < 1).length;
  check(
    fullCount(A.line1Step1) === 1 &&
      fullCount(A.line1Step2) === 2 &&
      fullCount(A.line1Step3) === 3 &&
      fullCount(A.line1Done?.g) === 5,
    "点满的字数随进度单调增加",
    j([A.line1Step1, A.line1Step2, A.line1Step3, A.line1Done?.g])
  );
  check(
    partialCount(A.line1Step1) === 1 && partialCount(A.line1Step2) === 1 && partialCount(A.line1Step3) === 1,
    "任何时刻最多一个字在半亮（是逐字，不是整行渐显）",
    j([partialCount(A.line1Step1), partialCount(A.line1Step2), partialCount(A.line1Step3)])
  );
  check(j(A.line1Done?.g) === j([1, 1, 1, 1, 1]), "整句唱完 → 5 个字全亮", j(A.line1Done?.g));
  check(j(A.line1Done?.prev) === j(A.line0Done), "上一行不会被后续进度改写", j(A.line1Done?.prev));

  console.log("\n[4] 点亮的字真的更暖（color-mix + --g 生效）");
  check(A.colors?.lit && A.colors?.unlit && A.colors.lit !== A.colors.unlit, "点亮字与未唱字的计算颜色不同", j(A.colors));
  const warmOf = (rgb) => (Array.isArray(rgb) ? rgb[0] - rgb[2] : null);
  const wl = warmOf(A.colors?.litRgb);
  const wu = warmOf(A.colors?.unlitRgb);
  check(
    wl !== null && wu !== null && wl > wu,
    "把两个颜色画到画布上：点亮字更暖（R-B 更大）",
    j({ litRgb: A.colors?.litRgb, unlitRgb: A.colors?.unlitRgb })
  );
  check(/color/.test(A.colors?.transition || ""), "字素上有 color 过渡（平滑交给 CSS）", j(A.colors?.transition));

  console.log("\n[5] 没有 words 的行：退回逐行线性点亮");
  check(A.line2Fallback?.index === 2, "高亮行切到第 2 行", j(A.line2Fallback?.index));
  const fb = A.line2Fallback?.g || [];
  check(fb[0] === 1 && fb[1] > 0 && fb[1] < 1 && fb[2] === 0, "线性点亮：走到一半就亮一半", j(fb));

  console.log("\n[6] 交互");
  check(j(A.seeks) === j([14000, 0]), "点歌词 / 回车都能跳转，且取的是行时间", j(A.seeks));

  console.log("\n[7] CSS 在 @layer + @scope 下真的生效");
  check(/px$/.test(A.css?.shift || ""), "--dr-shift 是像素位移", j(A.css?.shift));
  check(
    (A.css?.listTransform || "none") !== "none" && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(A.css?.listTransform || ""),
    "歌词列表被位移到当前行居中",
    j(A.css?.listTransform)
  );
  check(/transform/.test(A.css?.listTransition || ""), "位移带过渡（换行是滑过去的）", j(A.css?.listTransition));
  check(A.css?.grainAnimation === "dr-grain", "@scope 里的 @keyframes 仍然注册了（颗粒在动）", j(A.css?.grainAnimation));
  check(A.css?.grainBlend === "overlay", "颗粒走 overlay 混合", j(A.css?.grainBlend));
  check(/blur\(38px\)/.test(A.css?.bloomFilter || ""), "光晕层只有这一处 filter（运行期不动它）", j(A.css?.bloomFilter));
  check(/data:image\/png/.test(A.css?.bloomImage || ""), "光晕层的底图是当前封面", j(A.css?.bloomImage));
  check(/blur\(40px\)/.test(A.css?.bgImgFilter || ""), "整窗背景层的大半径模糊也在", j(A.css?.bgImgFilter));
  check(/transform/.test(A.css?.gateTransition || ""), "快门两片有过渡", j(A.css?.gateTransition));
  check(A.css?.shutter === "open", "挂载后快门是打开的", j(A.css?.shutter));

  console.log("\n[8] 频谱接线");
  check(num(A.halBefore) < 0.05, "频谱平稳时没有 halation 脉冲", j(A.halBefore));
  check(num(A.halAfter) > 0.25, "频谱突变 → halation 立刻脉冲一次", j(A.halAfter));
  check(num(A.bloomHigh) > 0.8, "低频喂满 → 光晕呼吸到底", j(A.bloomHigh));
  check(num(A.grainHigh) > 0.8, "高频喂满 → 颗粒浓度到底", j(A.grainHigh));
  check(num(A.bloomIdle) < 0.4, "没有频谱（暂停）时回到静音值", j(A.bloomIdle));

  console.log("\n[9] 空态");
  check(A.empty?.text === "歌词匹配中…", "空态用宿主的 statusText/status（不是写死的「暂无歌词」）", j(A.empty));
  check(A.empty?.emptyHidden === false && A.empty?.lyHidden === true, "空态时藏歌词、显提示", j(A.empty));

  console.log("\n[10] 暂停 6 秒后停帧 / 卸载清理");
  check(A.idle?.dataIdle === true, "暂停 6 秒后进入停帧状态（data-idle）", j(A.idle));
  check(A.idle?.frozen === true, "停帧后 rAF 不再被调度（不是空转）", j(A.idle));
  check(A.destroy?.stageDr === false, "destroy 后舞台里没有残留节点", j(A.destroy?.stageDr));
  check(A.destroy?.rootHtml === "", "destroy 后挂载点被清空", j(A.destroy?.rootHtml));
  check(A.destroy?.bgHtml === "" && A.destroy?.bgHidden === true, "destroy 后整窗背景层被清空并隐藏（宿主不会替你清）", j(A.destroy));
  check(A.destroy?.framesStop === true, "destroy 后帧循环停止", j(A.destroy?.framesStop));

  console.log("\n[11] animations:false → 零帧，但画面仍然正确");
  check(B.framesAfterMount === 0, "完全没有进帧循环（不是「跑得少」）", j(B.framesAfterMount));
  check(
    j(B.glyphs) === j([1, 1, 0.375, 0, 0]),
    "静止形态下逐字点亮仍然正确（暂停 = 不外推，值可精确复现）",
    j(B.glyphs)
  );
  check(B.staticAttr === "1", "静止形态打了 data-static", j(B.staticAttr));
  check(B.grainAnimation === "none", "静止形态下颗粒不转", j(B.grainAnimation));
  check(B.listTransition === "none" || B.listTransition === "all", "静止形态下位移不带过渡", j(B.listTransition));
  check(j(B.seeks) === j([]), "interactive:false 时点歌词不跳转", j(B.seeks));
  check(B.interactiveRows === 0, "interactive:false 时不渲染按钮语义", j(B.interactiveRows));

  console.log("\n[12] performance 档");
  check(C.perfAttr === "1", "打了 data-perf", j(C.perfAttr));
  check(C.grainAnimation === "none", "performance 档颗粒停转（静态图）", j(C.grainAnimation));
  check(
    C.perfPaints > 20 && C.perfPaints < 60,
    `按清单 budgetFps=30 限帧（1.2 秒实际画了 ${C.perfPaints} 帧）`,
    j(C.perfPaints)
  );
  check(
    C.smoothPaints > C.perfPaints * 2.5,
    `smooth 档不限帧（同期画了 ${C.smoothPaints} 帧，> 2.5×performance）`,
    j({ perf: C.perfPaints, smooth: C.smoothPaints })
  );
  check(C.smoothGrainAnimation === "dr-grain", "smooth 档颗粒继续转", j(C.smoothGrainAnimation));

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
