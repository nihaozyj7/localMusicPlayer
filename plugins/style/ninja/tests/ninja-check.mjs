/* ==========================================================================
   ninja-check.mjs — 「水果忍者」的无头浏览器自检
   --------------------------------------------------------------------------
   ★ 这个脚本属于**第三方样式包自己**，与播放器项目源码零耦合：

     · 它自己起一个只读静态服务，只把本样式包目录暴露出去；
     · 它自己在页面里搭一个「假宿主」（ctx 的取值函数 + sdk + actions），
       不 import 宿主的 store / playerhost / 契约包；
     · 歌词直接按契约形态构造（`{ time, text, trans?, words? }`），连 LRC
       解析器都不需要 —— 验的是样式自己的责任；
     · **样式表按真机的样子注入**：`@layer skin { @scope (#stage, #bg) { … } }`
       （宿主就是这么包的）。这一条不能省：abyss 曾经在"没有宿主歌词 CSS 的
       假环境"里全绿，真机上却因为未分层的宿主规则永远赢而整块失效。

   跑法（仓库根）：

     node plugins/style/ninja/tests/ninja-check.mjs
     node plugins/style/ninja/tests/ninja-check.mjs --shots   # 另存 4 张整页 PNG

   为什么把 rAF 换成定时器：headless 下合成器不给 BeginFrame（实测 rAF 一次都
   不来，`document.hidden` 还是 false），样式自己的帧循环会一帧都不跑。换成定时器
   之后这条循环与合成器无关，能稳定推进。

   这个脚本要盯住的都是"单测全绿但真机难看 / 白烧 CPU"的那类事：
     · 安全区：HUD 与歌词不许压进宿主的标题栏 / 底栏两条带子（S11，量 rect）；
     · 「顶点 == 切开 == 起唱」：位置推过去时，水果真的在飞、真的裂成两半、
       果汁真的在往下掉（读的是**画布像素**与池子读数，不是自己报的计数）；
     · 文字的对比度**按像素**量（abyss 的教训：39 条纯逻辑 + 125 条浏览器断言
       全绿的那一版，真机上是 1.31:1 的灰雾）；
     · 省电：暂停 6s 停帧、切后台停帧、关动效**一帧都不起**、performance 档
       按清单 budgetFps 数**真帧数**（数 rAF 回调会得到刷新率那个假数）；
     · 拖进度条不许补喷果汁 / 补加连击（"静默登记"那条路）。
   ========================================================================== */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv.includes("--shots");
const SHOT_DIR = SHOTS ? resolve(process.cwd(), ".tmp-ninja-shots") : join(tmpdir(), "ninja-shots");

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/* --------------------------------------------------------------------------
   页面里的假宿主 + 全部断言素材
   -------------------------------------------------------------------------- */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>ninja check</title>
<style>
  html, body { margin: 0; background: #05060a; }
  /* #pv 扮演真机里的 .playerview：**安全区变量就写在它上面**（舞台 root 继承），
     背景层 #bg 扮演 .skin-bg。@scope 的两个根也是这样。
     真机里 1280px 宽时是 88 / 92（标题栏 36 + 头部行 52 / 底栏 92）。 */
  #pv {
    position: fixed; inset: 0;
    --skin-inset-top: 88px;
    --skin-inset-bottom: 92px;
  }
  #bg { position: fixed; inset: 0; }
  #stage { position: absolute; inset: 0; }
</style>
</head>
<body>
<div id="pv"><div id="bg"></div><div id="stage"></div></div>
<script type="module">
/* 样式表按真机的样子注入：@layer skin + @scope(两个根) */
const cssText = await (await fetch("/skin.css")).text();
const styleEl = document.createElement("style");
styleEl.textContent = "@layer skin { @scope (#stage, #bg) { " + cssText + " } }";
document.head.appendChild(styleEl);

const skinMod = await import("/skin.js");
const skin = skinMod.default;
const probeRaw = skinMod.__probe;
const stage = document.getElementById("stage");
const pv = document.getElementById("pv");
const bg = document.getElementById("bg");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 歌词样本（含逐字行 / 长间奏 / 长句 / 空行） ---------------- */
const SONG = { id: "accept-1", title: "验收测试曲", artist: "验收歌手", album: "验收专辑", duration: 200000, kind: "local" };
const WORDS_LINE = { time: 1000, text: "刀光切水果", words: [1000, 1600, 2200, 2800, 3400] };
const LYRICS = [
  WORDS_LINE,
  { time: 6000, text: "果汁染亮每个字" },            // 没有 words ⇒ 走合成时间轴
  { time: 60000, text: "长间奏之后的一句" },          // 与上一句差 51 秒 ⇒ 抛炸弹
  { time: 70000, text: "一把很长的歌词用来验收窄窗口里的等比缩放与安全区" },
  { time: 80000, text: "" },
];

/** 一张真封面（渐变），用来验"果盘跟着封面偏色" */
function makeCover() {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 96;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 96, 96);
  grad.addColorStop(0, "#1b4bd8");
  grad.addColorStop(0.55, "#7a2bd8");
  grad.addColorStop(1, "#d82b6a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  return c.toDataURL("image/png");
}

/* ---------------- 假 ctx ---------------- */
const S = {
  lines: LYRICS,
  pos: 0,
  playing: false,
  cover: makeCover(),
  spectrum: null,
  options: {
    showLyrics: true,
    interactive: true,
    animations: true,
    lyricsFontSize: 20,
    /* ★ 契约里这是**字符串** "smooth" | "performance"，不是布尔值 ——
       Boolean("smooth") 恒真，曾经让真机一直在跑性能兜底档而自检全绿。 */
    performanceMode: "smooth",
    budgetFps: 30,
    coverCarousel: false,
  },
  env: { width: 1280, height: 820, dpr: 1, reducedMotion: false, foreground: true, themeId: "flat-dark", mode: "dark" },
  backdrops: [],
};
function lyricsSnapshot() {
  return {
    lines: S.lines,
    index: -1,
    source: S.lines.length ? "local" : "",
    status: S.lines.length ? "ok" : "none",
    statusText: "",
    text: "",
  };
}
function makeCtx(root) {
  return {
    root,
    backgroundRoot: bg,
    defaultCover: "",
    env: () => ({ ...S.env }),
    options: () => ({ ...S.options }),
    media: () => ({ song: { ...SONG }, cover: S.cover, covers: S.cover ? [S.cover] : [], coverIndex: 0, lyrics: lyricsSnapshot() }),
    track: () => ({ ...SONG }),
    lyrics: () => lyricsSnapshot(),
    covers: () => ({ list: S.cover ? [S.cover] : [], index: 0, current: S.cover }),
    playback: () => ({ position: S.pos, duration: SONG.duration, playing: S.playing, volume: 1, muted: false }),
    spectrum: () => S.spectrum,
    sdk: {
      splitGraphemes: (t) => Array.from(String(t == null ? "" : t)),
      marqueeText: (el, text) => { el.textContent = String(text == null ? "" : text); },
      html: {
        EMPTY_TRACK: { id: "", title: "", artist: "", album: "", duration: 0, kind: "local" },
        setCoverImage: (img, src, fallback) => { img.src = src || fallback || ""; },
        lyricsEmptyText: (l) => (l && l.status === "loading" ? "歌词匹配中…" : "暂无歌词"),
      },
    },
    actions: {
      reportBackdrop: (p) => S.backdrops.push(p),
      seek: () => { throw new Error("ninja 不该调用 seek（指针是刀，不是进度条）"); },
    },
  };
}
let ctxObj = makeCtx(stage);
let frames = 0;

const probe = () => probeRaw();
const attrs = () => { const el = document.querySelector(".nj"); return el ? { ...el.dataset } : null; };
const box = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
};
const hidden = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return el.hidden || cs.display === "none" || cs.visibility === "hidden";
};

/** 画布上"真的画了东西"的像素数（alpha 通道；舞台底色是 CSS，画布是透明的） */
function canvasInk(sel = ".nj__fx") {
  const cv = document.querySelector(sel);
  if (!cv) return -1;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n += 1;
  return n;
}
/** 只看某个 y 区间里的墨迹（"水果真的在字带上方飞"这类断言） */
function canvasInkBox(x, y, w, h) {
  const cv = document.querySelector(".nj__fx");
  if (!cv) return -1;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const X = Math.max(0, Math.round(x));
  const Y = Math.max(0, Math.round(y));
  const W = Math.max(1, Math.min(cv.width - X, Math.round(w)));
  const H = Math.max(1, Math.min(cv.height - Y, Math.round(h)));
  const d = g.getImageData(X, Y, W, H).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n += 1;
  return n;
}

/* ---------------- 驱动 ---------------- */
function setOpts(patch, type = "options") {
  Object.assign(S.options, patch);
  skin.update(ctxObj, { type });
}
function setEnv(patch, type = "resize") {
  Object.assign(S.env, patch);
  skin.update(ctxObj, { type });
}
function setPos(pos, opts = {}) {
  S.pos = pos;
  if (opts.playing !== undefined) S.playing = opts.playing !== false;
  skin.update(ctxObj, { type: "progress", position: pos, playing: S.playing, duration: SONG.duration, lyricIndex: -1 });
}
/** 以 ≤400ms 的步长推进（更大的跳变会被判成 seek = 静默登记）。
    间隔 55ms：帧预算在暂停时是 ~42ms，等太短会有几步根本没渲染过 —— 那样
    "推进量"会攒成一大跳，落到静默登记那条路上（自检里踩过一次）。 */
async function drive(to, { step = 250, ms = 55 } = {}) {
  while (S.pos < to - 1) {
    setPos(Math.min(to, S.pos + step));
    await wait(ms);
  }
}
async function mount({ keepState = false } = {}) {
  if (!keepState) {
    S.lines = LYRICS;
    S.pos = 0;
    S.playing = false;
    S.spectrum = null;
    S.cover = makeCover();
    S.backdrops = [];
    Object.assign(S.options, {
      showLyrics: true, interactive: true, animations: true, lyricsFontSize: 20,
      performanceMode: "smooth", budgetFps: 30, coverCarousel: false,
    });
    Object.assign(S.env, { width: 1280, height: 820, dpr: 1, reducedMotion: false, foreground: true, mode: "dark" });
  }
  // 真机的换样式路径就是「destroy 旧的 → mount 新的」；不销毁会留下第二条帧循环
  try {
    skin.destroy(ctxObj);
  } catch {
    /* 第一次挂载前 S 是 null，destroy 会直接返回 */
  }
  document.querySelector(".nj")?.remove();
  ctxObj = makeCtx(stage);
  skin.mount(ctxObj);
  skin.update(ctxObj, { type: "mount" });
  await wait(220);
}
/** 摆一个姿势（截图与像素量测用） */
async function pose(kind) {
  if (kind === "empty") {
    await mount();
    S.lines = [];
    skin.update(ctxObj, { type: "lyrics" });
    await wait(160);
  } else if (kind === "poster") {
    await mount();
    setOpts({ showLyrics: false });
    await wait(160);
  } else if (kind === "unlit") {
    await mount();
    setPos(1000);
    await wait(200);
  } else if (kind === "lit") {
    await mount();
    setPos(1200);
    await drive(3500, { step: 250, ms: 30 });
    await wait(120);
  }
  return true;
}

/* ---------------- 像素对比度：截当前行那一条，在页内解码后量 ---------------- */
/** 截图框：**取当前句所有字素的并集**（整行容器很宽，文字只占中间一小段，
    用容器当框会让"文字像素占比"低到 p99 都抓不到字） */
async function shotBox() {
  const els = Array.from(document.querySelectorAll(".nj__g"));
  if (!els.length) return null;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const el of els) {
    const q = el.getBoundingClientRect();
    l = Math.min(l, q.left);
    t = Math.min(t, q.top);
    r = Math.max(r, q.right);
    b = Math.max(b, q.bottom);
  }
  return { x: Math.max(0, l - 5), y: Math.max(0, t - 6), width: r - l + 10, height: b - t + 12 };
}
/** 窄窗口那一场的读数（由 Node 侧改视口与安全区后再取） */
async function narrowSetup() {
  await mount();
  setPos(70000); // 最长的那个句子（验收等比缩放）
  await wait(280);
  const csp = getComputedStyle(pv);
  return {
    attr: attrs().narrow,
    geometry: probe()?.geometry,
    stage: box("#stage"),
    lyric: box(".nj__lyric"),
    hudBottom: box(".nj__hud-bottom"),
    chips: box(".nj__chips"),
    scrollW: document.documentElement.scrollWidth,
    viewW: window.innerWidth,
    fs: parseFloat(getComputedStyle(document.querySelector(".nj__lyric")).fontSize),
    insets: {
      top: parseFloat(csp.getPropertyValue("--skin-inset-top")) || 0,
      bottom: parseFloat(csp.getPropertyValue("--skin-inset-bottom")) || 0,
    },
  };
}
async function analyzeShot(dataUrl, boxInfo) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const lum = (r, gg, b) => {
    const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
  };
  const ls = [];
  for (let i = 0; i < d.length; i += 4) ls.push(lum(d[i], d[i + 1], d[i + 2]));
  ls.sort((a, b) => a - b);
  const med = ls[ls.length >> 1] || 0;
  const p99 = ls[Math.min(ls.length - 1, Math.floor(ls.length * 0.99))] || 0;
  const maxL = ls[ls.length - 1] || 0;
  const contrast = (Math.max(p99, med) + 0.05) / (Math.min(p99, med) + 0.05);
  const contrastMax = (Math.max(maxL, med) + 0.05) / (Math.min(maxL, med) + 0.05);
  return { px: ls.length, med, p99, maxL, contrast, contrastMax, box: boxInfo };
}

/**
 * 取几个点的实际像素颜色（调试"这一块到底画出来没有"用）。
 * 全靠猜 CSS 叠出来的颜色是最容易自欺的一步 —— 打几个读数比看十遍渐变定义快。
 */
async function sampleAt(dataUrl, pts) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return pts.map((p) => {
    const d = g.getImageData(Math.round(p[0]), Math.round(p[1]), 1, 1).data;
    return { x: p[0], y: p[1], rgb: [d[0], d[1], d[2]] };
  });
}

/* ---------------- 主流程 ---------------- */
/* ★ 先把 rAF 换成定时器，**整场都开着**：headless 下合成器不给 BeginFrame
   （rAF 一次都不来），样式自己的帧循环会一帧都不跑。曾经把还原放进 run() 的
   finally 里 —— 结果 run() 之后的截图摆位（pose）一个帧都没有，画面停在挂载那一刻。 */
window.requestAnimationFrame = (cb) => setTimeout(() => { frames += 1; cb(performance.now()); }, 8);
window.cancelAnimationFrame = (tid) => clearTimeout(tid);

async function run() {
  const out = { steps: {}, errors: [] };
  const step = async (name, fn) => {
    try {
      out.steps[name] = await fn();
    } catch (err) {
      out.steps[name] = { error: String((err && err.message) || err) };
      out.errors.push(name + ": " + String((err && err.message) || err));
    }
  };

  {
    /* ── 1) 挂载与几何 ─────────────────────────────────────────────── */
    await step("mount", async () => {
      await mount();
      // 干净状态：还没到第一句，画布上不该有任何东西
      const cleanInk = canvasInk();
      const cleanCount = probe()?.count;
      const cleanAttrs = attrs();
      setPos(1000);
      await wait(160);
      const p = probe();
      return {
        attrs: attrs(),
        cleanAttrs,
        cleanInk,
        cleanCount,
        geometry: p?.geometry,
        count: p?.count,
        texts: p?.texts?.join(""),
        bowl: p?.bowl,
        contrast: p?.contrast,
        canvasInk: canvasInk(),
        lines: document.querySelectorAll(".nj__g").length,
        discReady: !!document.querySelector(".nj__disc")?.src,
        frames,
      };
    });

    /* ── 2) 安全区（S11）：歌词与 HUD 都不许进两条 chrome 带子 ─────── */
    await step("safe", async () => {
      await mount();
      setPos(1000);
      await wait(120);
      const g = probe()?.geometry;
      return {
        stage: box("#stage"),
        lyric: box(".nj__lyric"),
        field: box(".nj__field"),
        hudTop: box(".nj__hud-top"),
        hudBottom: box(".nj__hud-bottom"),
        chips: box(".nj__chips"),
        top: 88,
        bottom: 92,
        h: g?.h,
      };
    });

    /* ── 3) 逐字染色：data-lit 单调涨、--g 单调、整句最终全亮 ───────── */
    await step("lit", async () => {
      await mount();
      setPos(6040);
      await wait(60);
      const samples = [];
      const fills = [];
      let mono = true;
      let downAt = -1;
      for (let t = 6040; t <= 9200; t += 200) {
        setPos(t);
        await wait(30);
        const p = probe();
        if (samples.length && p.lit < samples[samples.length - 1]) {
          mono = false;
          downAt = t;
        }
        samples.push(p.lit);
        fills.push(p.fills.slice());
      }
      const p = probe();
      let fillMono = true;
      let inRange = true;
      for (const row of fills) for (const v of row) if (!(v >= 0 && v <= 1)) inRange = false;
      for (let k = 0; k < p.count; k += 1) {
        for (let i = 1; i < fills.length; i += 1) {
          if (fills[i][k] < fills[i - 1][k] - 1e-9) fillMono = false;
        }
      }
      return {
        samples,
        mono,
        downAt,
        fillMono,
        inRange,
        lit: p.lit,
        count: p.count,
        glyphCount: document.querySelectorAll(".nj__g").length,
        finalFills: p.fills,
        attrs: attrs(),
      };
    });

    /* ── 4) 抛掷与切开：水果真的在飞、真的裂开、果汁真的在掉 ───────── */
    await step("flight", async () => {
      await mount();
      // 停在第一枚水果的飞行中段（换句有 760ms 提前量，所以这里已经在演第一句）
      setPos(760);
      await wait(140);
      const mid = probe();
      const midFruits = attrs().fruits;
      const g = mid.geometry;
      const seat = (mid.seats || []).find((s) => s.flying);
      const inkMid = seat ? canvasInkBox(seat.x - 44, seat.y - 44, 88, 88) : -1;
      // --g 必须**一开始就存在**（读到空串 = DOM 上没有这个属性，排查时会误判）
      const gInit = Array.from(document.querySelectorAll(".nj__g")).map((el) => el.style.getPropertyValue("--g"));
      // 推过切开点（步长 120ms、间隔 55ms ⇒ 每一步都真的渲染过 ⇒ 现场切）
      await drive(1200, { step: 120, ms: 55 });
      const cut = probe();
      const halves0 = cut.halves;
      const spread0 = cut.halfSpread;
      const juice0 = cut.juice;
      const cy0 = cut.juiceCentroid?.y ?? 0;
      await wait(170);
      const later = probe();
      const cy1 = later.juiceCentroid?.y ?? 0;
      return {
        mid: { pos: mid.pos, inFlight: mid.inFlight, flying: seat?.flying, fruits: midFruits, seat, inkMid, apexY: g.apexY, lineY: g.lineY, groundY: g.groundY },
        gInit,
        cut: { cuts: cut.cuts, halves: halves0, spread: spread0, juice: juice0, slashes: cut.slashes, cy0, stains: cut.stains },
        later: { halves: later.halves, spread: later.halfSpread, juice: later.juice, cy1, cuts: later.cuts, stains: later.stains },
      };
    });

    /* ── 5) 指针是刀：划过水果提前劈开，但**不进连击** ─────────────── */
    await step("pointer", async () => {
      await mount();
      setPos(700);
      await wait(140);
      const p0 = probe();
      const seat = (p0.seats || []).find((s) => s.flying);
      const before = { cuts: p0.cuts, pointerCuts: p0.pointerCuts, combo: p0.combo.cuts };
      const cv = document.querySelector(".nj__fx");
      const r = cv.getBoundingClientRect();
      const fire = (x, y) => cv.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerType: "mouse" }));
      if (seat) {
        fire(seat.x - 34, seat.y);
        await wait(30);
        fire(seat.x, seat.y);
        await wait(60);
      }
      const p1 = probe();
      const inkTrail = canvasInk();
      return {
        seat,
        before,
        after: { cuts: p1.cuts, pointerCuts: p1.pointerCuts, combo: p1.combo.cuts, juice: p1.juice, halves: p1.halves },
        inkTrail,
        interactive: attrs().interactive,
      };
    });

    /* ── 6) 连击与分数：歌驱动的切开才加读数；跳进度不许刷分刷汁 ────── */
    await step("combo", async () => {
      await mount();
      setPos(700);
      await drive(1200, { step: 120, ms: 55 });   // 第 1 枚
      const a = probe().combo;
      await drive(1800, { step: 150, ms: 55 });   // 第 2 枚
      const b = probe().combo;
      await drive(2400, { step: 150, ms: 55 });   // 第 3 枚 ⇒ 连击读数该出现了
      const c = probe().combo;
      const attrsA = attrs();
      const juiceA = probe().juice;
      // 跳进度（>420ms ⇒ 静默登记）：分数 / 连击不许被"补"出来，也不许补喷果汁
      setPos(8000);
      await wait(200);
      const d = probe();
      return {
        a, b, c,
        attrs: { combo: attrsA.combo, score: attrsA.score, cuts: attrsA.cuts },
        afterJump: { cuts: d.cuts, combo: d.combo, juice: d.juice, score: d.combo.score },
        juiceBefore: juiceA,
        line: d.lineIndex,
      };
    });

    /* ── 7) 间奏炸弹：引线在烧、下一句开口炸开 ────────────────────── */
    await step("bomb", async () => {
      await mount();
      setPos(9500); // 炸弹在 9260 抛起，这里它已经升到半空
      await wait(160);
      const p0 = probe();
      const f0 = parseFloat(attrs().bombfuse);
      const gB = p0.geometry;
      const ink0 = canvasInkBox(gB.w * 0.5 - 70, gB.fieldTop, 140, Math.max(80, gB.lineY - gB.fieldTop + 60));
      const inkAll = canvasInk();
      setPos(30000);
      await wait(160);
      const f1 = parseFloat(attrs().bombfuse);
      const p1 = probe();
      // 跳到下一句开口：炸弹开花
      setPos(60000);
      await wait(180);
      const p2 = probe();
      return {
        bomb: p0.bomb,
        attrBomb: attrs().bomb,
        f0,
        f1,
        ink0,
        inkAll,
        geo: { fieldTop: gB.fieldTop, lineY: gB.lineY, floorY: gB.floorY, apexY: gB.apexY, h: gB.h, w: gB.w },
        after: { fired: p2.bomb?.fired, bursts: p2.bursts, juice: p2.juice, moreJuice: p2.juice > p1.juice },
        fuseAttr: attrs().bombfuse,
      };
    });

    /* ── 8) 省电：暂停 6s 停帧 / 关动效零帧 / performance 档数真帧 ─── */
    await step("power", async () => {
      await mount();
      // 先沿途真的切两刀（留下果汁印），再暂停 —— 顺便验"停帧后画面不是空的"
      await drive(2000, { step: 220, ms: 55 });
      setPos(2000, { playing: false });
      await wait(400);
      const d0 = probe().drew;
      const ink0 = canvasInk();
      await wait(6300); // 越过 6 秒阈值
      const d1 = probe().drew;
      const f1 = frames;
      const idleAttr = attrs().idle;
      const inkIdle = canvasInk();
      const stainIdle = probe().stains;
      await wait(700); // 再等一会儿：必须完全冻住
      const d2 = probe().drew;
      const f2 = frames;
      const stillIdle = { drewA: d0, drewB: d1, drewC: d2, framesA: f1, framesB: f2, idleAttr, ink0, inkIdle, stainIdle, idleDrew: attrs().draws };

      // 关动效：一帧都不起（补丁来了同步画一帧）
      await mount();
      setOpts({ animations: false });
      setPos(2000);
      await wait(200);
      const nd0 = probe().drew;
      const nf0 = frames;
      await wait(500);
      const nd1 = probe().drew;
      const animAttr = attrs().animations;
      const stillInk = canvasInk();
      setPos(2400);
      await wait(120);
      const nd2 = probe().drew;
      const noanim = { drewA: nd0, drewB: nd1, drewC: nd2, framesA: nf0, framesB: frames, attr: animAttr, ink: stillInk };

      // performance 档：按清单 budgetFps 限帧，数**真帧数**
      await mount();
      setOpts({ performanceMode: "performance" });
      setPos(6000, { playing: true });
      await wait(300);
      const pf0 = probe().drew;
      const pr0 = frames;
      await wait(1000);
      const pf1 = probe().drew;
      const pr1 = frames;
      const perf = { perfAttr: attrs().perf, drewDelta: pf1 - pf0, rafDelta: pr1 - pr0 };

      // smooth 档不许被当成 performance（字符串口径）
      setOpts({ performanceMode: "smooth" });
      await wait(120);
      const smoothPerf = attrs().perf === "1";

      // 切后台：立刻停帧
      await mount();
      setPos(2000);
      await wait(160);
      const bg0 = probe().drew;
      setEnv({ foreground: false }, "progress");
      await wait(400);
      const bg1 = probe().drew;
      const fgAttr = probe().foreground;
      return { idle: stillIdle, noanim, perf, smoothPerf, background: { drewA: bg0, drewB: bg1, foreground: fgAttr } };
    });

    /* ── 9) 空态 / 海报 / 无封面回退 ───────────────────────────────── */
    await step("states", async () => {
      await mount();
      S.lines = [];
      skin.update(ctxObj, { type: "lyrics" });
      await wait(160);
      const empty = { attr: attrs().empty, text: document.querySelector(".nj__empty")?.textContent || "", hiddenField: hidden(".nj__field"), posterHidden: hidden(".nj__poster") };
      const emptyBox = box(".nj__empty");

      await mount();
      setOpts({ showLyrics: false });
      await wait(160);
      const poster = { attr: attrs().poster, title: document.querySelector(".nj__poster-title")?.textContent || "", hiddenField: hidden(".nj__field"), posterHidden: hidden(".nj__poster") };
      const posterBox = box(".nj__poster");

      await mount();
      S.cover = "";
      skin.update(ctxObj, { type: "song" });
      await wait(260);
      const p = probe();
      return {
        empty, emptyBox, poster, posterBox,
        noCover: { bowl: p.bowl, discHidden: hidden(".nj__disc"), boardHex: p.boardHex, contrast: p.contrast },
      };
    });

    /* ── 10) 窄窗口那一场由 Node 侧改视口后再跑（见 narrowProbe） ──── */

    /* ── 11) 封面取色：果盘跟着封面偏，且写字的那层仍读得清 ────────── */
    await step("palette", async () => {
      await mount();
      await wait(700); // 封面解码 + 400ms 防抖上报
      const p = probe();
      return {
        bowl: p.bowl,
        contrast: p.contrast,
        inkHex: p.inkHex,
        unlitHex: p.unlitHex,
        backdrops: S.backdrops.slice(),
      };
    });

    /* ── 12) 卸载：零残留、不再起帧 ────────────────────────────────── */
    await step("destroy", async () => {
      await mount();
      setPos(2000);
      await wait(160);
      skin.destroy(ctxObj);
      await wait(120);
      const d0 = frames;
      await wait(400);
      const d1 = frames;
      return {
        stageHtml: stage.innerHTML.length,
        bgHtml: bg.innerHTML.length,
        bgHidden: bg.hidden,
        probe: probe(),
        framesFrozen: d1 - d0 <= 1,
        drewFrozen: true,
      };
    });
  }
  return out;
}

window.__nj = {
  run, pose, probe, attrs, frames: () => frames,
  shotBox, analyzeShot, canvasInk, narrowSetup, sampleAt,
  setPos, setOpts, setEnv,
  getState: () => ({ pos: S.pos, playing: S.playing, backdrops: S.backdrops.slice(), options: { ...S.options }, env: { ...S.env } }),
  reset: () => { S.backdrops = []; return true; },
};
</script>
</body>
</html>`;

/* --------------------------------------------------------------------------
   静态服务（只服务本样式包目录）
   -------------------------------------------------------------------------- */
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/" || url.pathname === "/__harness.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS);
    return;
  }
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
   无头 Edge + CDP
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
const OUT = join(tmpdir(), "ninja-check-" + Date.now());
mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

const CDP_PORT = 9441;
const W = 1280;
const H = 820;
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
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

async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const file = join(SHOT_DIR, `${name}.png`);
  writeFileSync(file, Buffer.from(r.result.data, "base64"));
  console.log(`   截图：${file}`);
}

/* --------------------------------------------------------------------------
   断言
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
  await send("Page.navigate", { url: `${BASE}/__harness.html` });

  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    await sleep(250);
    ready = (await evaluate("!!window.__nj")) === true;
    if (ready) break;
  }
  if (!ready) throw new Error("harness 页面没准备好（window.__nj 未定义）");

  console.log("\n[1] 挂载、几何与首帧");
  const r = await evaluate("window.__nj.run()");
  const S = r?.steps || {};
  console.log(
    "   ",
    JSON.stringify({
      mount: S.mount && { count: S.mount.count, lines: S.mount.lines, ink: S.mount.canvasInk, bowlSrc: S.mount.bowl?.source },
      safe: S.safe && { lyric: S.safe.lyric, top: S.safe.top, bottom: S.safe.bottom },
      lit: S.lit && { samples: S.lit.samples, lit: S.lit.lit, mono: S.lit.mono },
      flight: S.flight && S.flight.mid,
      power: S.power && { idle: S.power.idle, perf: S.power.perf },
    })
  );

  check(!r?.errors?.length, "十二个场景全程无异常", JSON.stringify(r?.errors));
  check(
    S.mount && S.mount.count === Array.from("刀光切水果").length && S.mount.lines === S.mount.count,
    "一字素一个 span（DOM 与方案的数目一致）",
    JSON.stringify({ count: S.mount?.count, lines: S.mount?.lines })
  );
  check(S.mount?.texts === "刀光切水果", "歌词文本真的是 DOM（可选中、可缩放）", S.mount?.texts);
  check(S.mount?.cleanInk === 0, "挂载那一刻画布是干净的（还没有水果被抛起来）", `ink=${S.mount?.cleanInk}`);
  check(S.mount?.discReady === true, "封面圆牌拿到了图");
  check(
    S.mount?.geometry?.groundY > S.mount?.geometry?.lineY &&
      S.mount?.geometry?.apexY < S.mount?.geometry?.lineY,
    "抛掷基线在字带下方、顶点在字带上方（水果是抛上来的）",
    JSON.stringify(S.mount?.geometry && { lineY: S.mount.geometry.lineY, apexY: S.mount.geometry.apexY, groundY: S.mount.geometry.groundY })
  );
  const gx = S.mount?.geometry?.glyphX || [];
  check(
    gx.length > 1 && gx.every((v, i) => i === 0 || v > gx[i - 1]),
    "逐字素的中心是严格递增的（对齐没算错）",
    JSON.stringify(gx)
  );
  check(S.mount?.bowl?.source === "cover", "封面被真的采到了（果盘跟着封面走）", JSON.stringify(S.mount?.bowl));
  check(S.mount?.contrast?.unlit >= 4.2, "未唱到的字对比度 ≥ 4.2:1", JSON.stringify(S.mount?.contrast));
  check(S.mount?.attrs?.empty === "0" && S.mount?.attrs?.poster === "0", "有歌词时不是空态 / 海报", JSON.stringify(S.mount?.attrs));

  console.log("\n[2] 安全区：歌词与 HUD 都不许进宿主的两条带子（S11）");
  const sf = S.safe || {};
  const topLine = sf.stage?.top + sf.top;
  const botLine = sf.stage?.bottom - sf.bottom;
  check(sf.lyric && sf.lyric.top >= topLine - 0.6, "歌词没有压进标题栏带子", JSON.stringify({ lyricTop: sf.lyric?.top, topLine }));
  check(sf.lyric && sf.lyric.bottom <= botLine + 0.6, "歌词没有压进播放控件带子", JSON.stringify({ lyricBottom: sf.lyric?.bottom, botLine }));
  check(sf.hudTop && sf.hudTop.top >= topLine - 0.6, "HUD 上排没有压进标题栏带子", JSON.stringify({ hudTop: sf.hudTop?.top, topLine }));
  check(sf.hudBottom && sf.hudBottom.bottom <= botLine + 0.6, "HUD 下排没有压进播放控件带子", JSON.stringify({ hudBottom: sf.hudBottom?.bottom, botLine }));
  check(sf.chips && sf.chips.top >= topLine - 0.6 && sf.chips.bottom <= botLine + 0.6, "右上角的封面牌 / 分数 / 连击也在安全区里", JSON.stringify(sf.chips));
  check(sf.field && sf.field.top >= topLine - 0.6 && sf.field.bottom <= botLine + 0.6, "歌词带容器本身就是安全区（top/bottom 就是两条带子的内沿）", JSON.stringify(sf.field));

  console.log("\n[3] 逐字染色：果汁从左往右把字染亮");
  const lit = S.lit || {};
  check(lit.samples?.[0] === 0 && lit.samples?.[lit.samples.length - 1] === lit.count && lit.count === 7, "data-lit 从 0 涨到整句（7 个字素）", JSON.stringify(lit.samples));
  check(lit.mono === true, "点亮字数单调不减", JSON.stringify(lit.samples));
  check(lit.fillMono === true, "每个字素的 --g 单调不减（果汁只往前渗）", JSON.stringify(lit.finalFills));
  check(lit.inRange === true, "所有 --g 都落在 0..1", JSON.stringify(lit.finalFills));
  check(lit.glyphCount === 7 && lit.count === 7, "DOM 字数与方案字数一致（换句没串行）", JSON.stringify({ dom: lit.glyphCount, plan: lit.count }));

  console.log("\n[4] 抛掷与切开：顶点 == 切开 == 起唱");
  const fl = S.flight || {};
  check(fl.mid?.inFlight === 1 && fl.mid?.fruits === "1", "起唱前水果真的在飞（读数 + data-fruits）", JSON.stringify(fl.mid && { inFlight: fl.mid.inFlight, fruits: fl.mid.fruits }));
  check(fl.mid?.inkMid > 60, "画布上真的画出了那枚水果（按像素数它）", `ink=${fl.mid?.inkMid}`);
  check(fl.cut?.cuts >= 1, "推到切开点时它被切了", JSON.stringify(fl.cut));
  check(fl.cut?.halves === 2, "切开得到两半", `halves=${fl.cut?.halves}`);
  check(fl.cut?.slashes >= 1, "同时出了一道刀光", `slashes=${fl.cut?.slashes}`);
  check(fl.cut?.juice > 40, "切开喷出了果汁", `juice=${fl.cut?.juice}`);
  check(fl.later?.spread > fl.cut?.spread, "两半在分离（间距变大）", JSON.stringify({ a: fl.cut?.spread, b: fl.later?.spread }));
  check(fl.later?.cy1 > fl.cut?.cy0 + 3, "果汁在往下掉（重心下移）", JSON.stringify({ y0: fl.cut?.cy0, y1: fl.later?.cy1 }));
  check(
    (fl.gInit || []).length > 0 && fl.gInit.every((v) => v !== "" && Number.isFinite(parseFloat(v))),
    "每个字素的 --g 从一开始就是个数（DOM 上不存在会被读成空串/NaN）",
    JSON.stringify(fl.gInit)
  );
  check(fl.later?.stains >= 1 && fl.later?.stains <= 44, "切开在案板上留下了果汁印（这一款唯一的永久痕迹）", JSON.stringify({ stains: fl.later?.stains }));

  console.log("\n[5] 指针是刀：划过会提前劈开，但不进连击");
  const pt = S.pointer || {};
  check(pt.after?.pointerCuts >= 1, "指针划过水果把它提前劈开了", JSON.stringify(pt.after));
  check(pt.after?.juice > 0, "提前劈开同样会爆果汁", JSON.stringify({ juice: pt.after?.juice }));
  check(pt.after?.combo === pt.before?.combo, "指针切的刀**不**进连击/分数（读数必须只反映这首歌）", JSON.stringify({ before: pt.before, after: pt.after }));
  check(pt.interactive === "1" && pt.inkTrail > 0, "交互开关是可观测的，且刀痕真的画在画布上", JSON.stringify({ interactive: pt.interactive, ink: pt.inkTrail }));

  console.log("\n[6] 连击与分数：跳进度不许刷分刷汁");
  const cb = S.combo || {};
  check(cb.a?.combo === 1 && cb.b?.combo === 2 && cb.c?.combo === 3, "窗口内连续切开 → 连击 1→2→3", JSON.stringify([cb.a?.combo, cb.b?.combo, cb.c?.combo]));
  check(cb.attrs?.combo === "3", "连击读数（≥3 才显示）写进了 data-combo", JSON.stringify(cb.attrs));
  check(Number(cb.attrs?.score) === 60, "分数 = 10×(1+2+3)", JSON.stringify(cb.attrs));
  check(cb.afterJump?.combo?.cuts === 3, "跳进度之后，已唱过的字只被**静默登记**（连击刀数不变）", JSON.stringify(cb.afterJump?.combo));
  check(cb.afterJump?.combo?.score === 60, "跳进度不会把分数补出来", JSON.stringify({ score: cb.afterJump?.combo?.score }));
  check(cb.afterJump?.juice <= cb.juiceBefore + 4, "跳进度不会补喷果汁", JSON.stringify({ before: cb.juiceBefore, after: cb.afterJump?.juice }));

  console.log("\n[7] 间奏炸弹：引线在烧，下一句开口炸开");
  const bm = S.bomb || {};
  check(bm.attrBomb === "1" && !!bm.bomb, "长间奏抛出了炸弹", JSON.stringify(bm.bomb));
  check(bm.ink0 > 40, "炸弹按像素真画出来了", JSON.stringify({ ink0: bm.ink0, inkAll: bm.inkAll, geo: bm.geo }));
  check(bm.f1 > bm.f0, "引线一直在烧（bombfuse 变大）", JSON.stringify({ f0: bm.f0, f1: bm.f1 }));
  check(bm.after?.fired === true && bm.after?.bursts >= 1, "下一句开口时炸开了（烟花真的在画）", JSON.stringify(bm.after));

  console.log("\n[8] 省电：暂停 6s 停帧 / 关动效零帧 / performance 档数真帧 / 切后台停帧");
  const pw = S.power || {};
  check(pw.idle?.drewB > pw.idle?.drewA, "暂停后到 6 秒之前**还在**画（果汁要继续落完）", JSON.stringify({ a: pw.idle?.drewA, b: pw.idle?.drewB }));
  check(pw.idle?.drewC === pw.idle?.drewB && pw.idle?.idleAttr === "1", "暂停 6 秒后彻底停帧（画布真的冻住且 data-idle=1）", JSON.stringify(pw.idle));
  check(pw.idle?.inkIdle > 100, "停帧后案板上的东西还在（不是被清屏）", JSON.stringify({ ink0: pw.idle?.ink0, inkIdle: pw.idle?.inkIdle, stains: pw.idle?.stainIdle }));
  check(pw.noanim?.drewB === pw.noanim?.drewA && pw.noanim?.attr === "0", "关动效档：一帧都不起（连 rAF 都不进）", JSON.stringify(pw.noanim));
  check(pw.noanim?.drewC === pw.noanim?.drewA + 1, "关动效档下补丁来了同步画一帧（画面仍然完整）", JSON.stringify({ a: pw.noanim?.drewA, c: pw.noanim?.drewC }));
  check(pw.noanim?.ink > 100, "关动效档的静态画面不是白屏（水果停在案板上）", `ink=${pw.noanim?.ink}`);
  check(pw.perf?.perfAttr === "1" && pw.perf?.drewDelta >= 30 && pw.perf?.drewDelta <= 52, "performance 档按清单 45fps 出帧（数的是**真帧数**）", JSON.stringify(pw.perf));
  check(pw.perf?.rafDelta > pw.perf?.drewDelta * 1.6, "限帧是真的在限（rAF 回调远多于实际出帧）", JSON.stringify({ drew: pw.perf?.drewDelta, raf: pw.perf?.rafDelta }));
  check(pw.smoothPerf === false, '"smooth" 档不许被当成 performance（契约里它是字符串）', JSON.stringify({ smoothPerf: pw.smoothPerf }));
  check(pw.background?.drewB === pw.background?.drewA && pw.background?.foreground === false, "切后台立刻停帧", JSON.stringify(pw.background));

  console.log("\n[9] 空态 / 海报 / 无封面回退");
  const stt = S.states || {};
  check(stt.empty?.attr === "1" && (stt.empty?.text || "").length > 0, "无歌词 ⇒ 空态并且有话说", JSON.stringify(stt.empty));
  check(stt.empty?.hiddenField === true, "空态时歌词带不显示", JSON.stringify({ hidden: stt.empty?.hiddenField }));
  check(stt.poster?.attr === "1" && stt.poster?.title === "验收测试曲", "关歌词 ⇒ 海报形态（只剩曲名）", JSON.stringify(stt.poster));
  check(
    stt.posterBox && stt.posterBox.top >= sf.stage?.top + sf.top - 0.6 && stt.posterBox.bottom <= sf.stage?.bottom - sf.bottom + 0.6,
    "海报文字也在安全区里",
    JSON.stringify(stt.posterBox)
  );
  check(stt.noCover?.bowl?.source === "manifest" && stt.noCover?.bowl?.gray === true, "没有封面 ⇒ 整套退回清单配色", JSON.stringify(stt.noCover?.bowl));
  check(stt.noCover?.discHidden === true, "没有封面时封面牌收起来（不留一个破图）", JSON.stringify({ hidden: stt.noCover?.discHidden }));
  check(stt.noCover?.contrast?.ink >= 4.5 && stt.noCover?.contrast?.unlit >= 4.2, "兜底配色的正文与凹痕都过对比度下限", JSON.stringify(stt.noCover?.contrast));

  console.log("\n[10] 窄窗口：安全区与不溢出");
  await send("Emulation.setDeviceMetricsOverride", { width: 820, height: 560, deviceScaleFactor: 1, mobile: false });
  // 真机在 820px 宽时只有底栏变矮（--h-playerbar: 86px），标题栏 + 头部行仍是 88
  await evaluate('document.getElementById("pv").style.setProperty("--skin-inset-bottom", "86px")');
  await evaluate('window.__nj.setEnv({ width: 820, height: 560 }, "resize")');
  const nw = (await evaluate("window.__nj.narrowSetup()")) || {};
  check(nw.attr === "1", "窄窗口可观测（data-narrow）", JSON.stringify({ attr: nw.attr }));
  const nTop = nw.stage?.top + (nw.insets?.top || 0);
  const nBot = nw.stage?.bottom - (nw.insets?.bottom || 0);
  check(nw.insets?.top === 88 && nw.insets?.bottom === 86, "假宿主的安全区就是真机那一套（88 / 86）", JSON.stringify(nw.insets));
  check(nw.lyric && nw.lyric.top >= nTop - 0.6 && nw.lyric.bottom <= nBot + 0.6, "窄窗档歌词仍在安全区（86px 那条）", JSON.stringify({ lyric: nw.lyric, nTop, nBot }));
  check(nw.hudBottom && nw.hudBottom.bottom <= nBot + 0.6, "窄窗档 HUD 下排仍在安全区", JSON.stringify(nw.hudBottom));
  check(nw.chips && nw.chips.top >= nTop - 0.6 && nw.chips.bottom <= nBot + 0.6, "窄窗档封面牌 / 分数 / 连击仍在安全区", JSON.stringify(nw.chips));
  check(nw.scrollW <= nw.viewW, "页面不横向溢出", JSON.stringify({ scrollW: nw.scrollW, viewW: nw.viewW }));
  check(nw.fs > 0 && nw.fs <= 40, "长句被等比缩过（字号仍由宿主令牌驱动）", JSON.stringify({ fs: nw.fs }));
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await evaluate('document.getElementById("pv").style.setProperty("--skin-inset-bottom", "92px")');
  await evaluate(`window.__nj.setEnv({ width: ${W}, height: ${H} }, "resize")`);
  await sleep(200);
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await evaluate(`window.__nj.setEnv({ width: ${W}, height: ${H} }, "resize")`);
  await sleep(200);

  console.log("\n[11] 配色上报（宿主壳的可读性输入）");
  const pal = S.palette || {};
  check((pal.backdrops || []).length >= 1, "上报了 reportBackdrop", JSON.stringify(pal.backdrops));
  const bd = (pal.backdrops || [])[pal.backdrops?.length - 1];
  check(
    bd && /^#[0-9a-f]{6}$/i.test(bd.bg) && /^#[0-9a-f]{6}$/i.test(bd.fg) && /^#[0-9a-f]{6}$/i.test(bd.accent),
    "上报的三项都是合法颜色（bg/fg/accent）",
    JSON.stringify(bd)
  );
  check(pal.contrast?.ink >= 4.5, "上报的 fg 在 bg 上读得清", JSON.stringify(pal.contrast));

  console.log("\n[12] 卸载：零残留");
  const dz = S.destroy || {};
  check(dz.stageHtml === 0 && dz.bgHtml === 0 && dz.bgHidden === true, "destroy 后挂载点与整窗背景层都清空了", JSON.stringify(dz));
  check(dz.probe === null, "内部状态归零", JSON.stringify({ probe: dz.probe }));
  check(dz.framesFrozen === true, "销毁后不再起帧", JSON.stringify(dz));

  /* ── 像素对比度：按真截图量"字到底看不看得清"（abyss 的教训） ────── */
  console.log("\n[13] 按像素量对比度（截当前行那一条）");
  for (const kind of ["unlit", "lit"]) {
    await evaluate(`window.__nj.pose(${JSON.stringify(kind)})`);
    await sleep(400);
    const b = await evaluate('window.__nj.shotBox(".nj__lyric")');
    if (!b) {
      const diag = await evaluate(
        'JSON.stringify({ glyphs: document.querySelectorAll(".nj__g").length, texts: window.__nj.probe()?.texts, attrs: window.__nj.attrs(), state: window.__nj.getState(), stage: document.getElementById("stage").innerHTML.length })'
      );
      check(false, `${kind}：取不到歌词带的盒子`, diag);
      continue;
    }
    const cap = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.max(8, b.width), height: Math.max(8, b.height), scale: 1 },
    });
    const dataUrl = `data:image/png;base64,${cap.result.data}`;
    const res = await evaluate(`window.__nj.analyzeShot(${JSON.stringify(dataUrl)}, ${JSON.stringify(b)})`);
    const need = kind === "unlit" ? 4.2 : 4.0;
    check(
      res && res.contrast >= need,
      `${kind}：文字在案板上的对比度 ≥ ${need}:1（量的截图像素）`,
      JSON.stringify(res && { contrast: Number(res.contrast.toFixed(2)), med: Number(res.med.toFixed(3)), p99: Number(res.p99.toFixed(3)), px: res.px })
    );
  }

  if (SHOTS) {
    console.log("\n[14] 截图（供肉眼复核）+ 几个点的实际像素");
    for (const kind of ["lit", "empty", "poster", "unlit"]) {
      await evaluate(`window.__nj.pose(${JSON.stringify(kind)})`);
      await sleep(500);
      await shot(kind);
    }
    const full = await send("Page.captureScreenshot", { format: "png" });
    const dataUrl = `data:image/png;base64,${full.result.data}`;
    const pts = [
      [640, 8],
      [640, 40],
      [645, 90],
      [640, 190],
      [640, 300],
      [640, 425],
      [640, 470],
      [640, 560],
      [640, 700],
      [640, 800],
    ];
    const samples = await evaluate(`window.__nj.sampleAt(${JSON.stringify(dataUrl)}, ${JSON.stringify(pts)})`);
    for (const s of samples || []) console.log(`   (${s.x},${s.y}) → rgb(${s.rgb.join(",")})`);
    const cssDiag = await evaluate(
      '(function(){const el=document.querySelector(".nj");const a=getComputedStyle(el,"::before");const b=getComputedStyle(el,"::after");return JSON.stringify({before:{content:a.content,bg:String(a.backgroundImage).slice(0,90),size:a.backgroundSize,z:a.zIndex,pos:a.position},after:{content:b.content,bg:String(b.backgroundImage).slice(0,90),size:b.backgroundSize}});})()'
    );
    console.log("   ::before/::after →", cssDiag);
  }

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
