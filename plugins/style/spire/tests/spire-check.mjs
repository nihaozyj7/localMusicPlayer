/* ==========================================================================
   spire-check.mjs —— 「塔」的浏览器自检
   --------------------------------------------------------------------------
   自带静态服务（**不要**对 Vite 跑：Vite 给模块 URL 加查询串，import() 会拿到
   第二个空实例）+ 假宿主 + 无头 Edge（CDP，随机端口）。

   它回答的是纯逻辑测不出来的那几件事：
     · 真实 CSS 下 preserve-3d 有没有被宿主包的那层 @scope/@layer 影响；
     · 投影是否**真的**生效（用 getBoundingClientRect 的投影尺寸判定，而不是相信 computed 值）；
     · 换句时镜头是否真的在飞（时长由行间隔反算），逐字进度是否真的写进 --g；
     · 点击某一层是否 seek 到那一句；静音/暂停/切后台是否正确停帧；
     · 静态档（animations:false）是否"一帧都不画但画面完整"；性能档窗口与限帧；
     · destroy 之后舞台与整窗背景层有没有残留。

   跑法： node plugins/style/spire/tests/spire-check.mjs
   ========================================================================== */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

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
 * 假宿主 + 全部场景（骨架与真实 skinhost.js#makeCtx 一致）。
 *
 * 歌词刻意安排成：
 *   第 0 行 7 个字素（逐字，0..5500ms）
 *   第 1 行 5 个字素（逐字，8000..12000ms）—— 与第 0 行**字素数不同**但行高相同
 *   第 2 行没有 words（必须退回整行一起亮）
 *   第 3 行更远（用来验窗口/淡出）
 */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>spire check</title>
<style>
  html, body { margin: 0; background: #000; }
  .playerview { position: fixed; left: 0; top: 0; width: 1100px; height: 700px; }
  .playerview__stage { position: relative; height: 100%; overflow: hidden; }
  .skin-bg { position: fixed; left: 0; top: 0; right: 0; bottom: 0; }
</style>
</head>
<body>
<div class="skin-bg" data-skin="spire"></div>
<div class="playerview" data-skin="spire"><div class="playerview__stage" id="stage"></div></div>
<script type="module">
import skin from "/skin.js";

const stage = document.getElementById("stage");
const bgRoot = document.querySelector(".skin-bg");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = (el, name) => (el ? el.style.getPropertyValue(name).trim() : "");
const computed = (el, name) => (el ? getComputedStyle(el).getPropertyValue(name).trim() : "");

/* 按宿主的方式加载样式：@layer skin + @scope(舞台根) */
const cssText = await (await fetch("/skin.css")).text();
const styleEl = document.createElement("style");
styleEl.textContent = '@layer skin { @scope (.playerview[data-skin="spire"], .skin-bg[data-skin="spire"]) { ' + cssText + ' } }';
document.head.appendChild(styleEl);

function makeCover(a, b) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = a; g.fillRect(0, 0, 64, 32);
  g.fillStyle = b; g.fillRect(0, 32, 64, 32);
  return c.toDataURL("image/png");
}
const COVER = makeCover("#2b4fa8", "#d2541e");
const COVER2 = makeCover("#e8d9a0", "#3a5a2a");
const DEFAULT_COVER = makeCover("#101828", "#070a12");

const LINES = [
  { time: 0, text: "第一层已经唱过", words: [0, 800, 1600, 2400, 3200, 4000, 4800] },
  { time: 8000, text: "第二层开唱", words: [8000, 8800, 9600, 10400, 11200] },
  { time: 14000, text: "下一层" },
  { time: 20000, text: "再下一层" },
  { time: 26000, text: "最后一层" },
];

function createHost(o) {
  const rec = { seeks: [], backdrops: [], spectrumCalls: 0 };
  const opt = Object.assign(
    { showLyrics: true, interactive: true, animations: true, lyricsFontSize: 21, performanceMode: "smooth" },
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
  let dpr = o.dpr || 1;
  let w = 1100, h = 700;

  const ctx = {
    root: o.root,
    backgroundRoot: bgRoot,
    defaultCover: DEFAULT_COVER,
    env: () => ({ width: w, height: h, dpr, reducedMotion: !!o.reducedMotion }),
    options: () => opt,
    media: () => media,
    track: () => media.song,
    lyrics: () => media.lyrics,
    playback: () => pb,
    spectrum: () => {
      rec.spectrumCalls += 1;
      return spec ? { bands: spec, at: performance.now() } : null;
    },
    sdk: {
      splitGraphemes: (t) => Array.from(String(t == null ? "" : t)),
      manifest: { id: "spire", colors: { bg: "#070a12", fg: "#e9eefb", accent: "#6f9dff" } },
      util: { clamp: (v, a, b) => Math.min(b, Math.max(a, v)) },
    },
    actions: {
      seek: (ms) => rec.seeks.push(ms),
      reportBackdrop: (pal) => rec.backdrops.push(pal),
    },
  };

  return {
    ctx, rec, media,
    setSize: (nw, nh) => { w = nw; h = nh; },
    setOptions: (patch) => Object.assign(opt, patch),
    setSpectrum: (bands) => { spec = bands; },
    setPosition: (p, playing) => {
      pb.position = p;
      pb.playing = playing === undefined ? pb.playing : playing;
    },
    setLines: (lines) => { media.lyrics.lines = lines; },
    setCover: (c) => { media.cover = c; },
  };
}

/* 帧计数用**注入脚本**里那个对象（它在页面最前面给 rAF 打了点）；
   这里再自己建一个 const counters 只会数到 0 —— 那是最容易自欺的一种假绿灯。 */
const counters = window.__counters || { frames: 0 };

/* mount 是 async 的（它要先加载子模块），必须 await —— 否则拿到的 .sp 还是 null */
const INSTANCES = [];
async function mountInstance(o) {
  const root = document.createElement("div");
  stage.appendChild(root);
  const host = createHost(Object.assign({ root }, o));
  await skin.mount(host.ctx);
  const inst = { root, host, sp: root.querySelector(".sp") };
  INSTANCES.push(inst);
  return inst;
}

function push(inst, patch) {
  skin.update(inst.host.ctx, patch);
}

/** 走一步进度并等画面跟上（视觉滞后 70ms + 补丁 4Hz，等 280ms 足够） */
async function at(inst, ms, playing) {
  const p = playing === undefined ? true : playing;
  inst.host.setPosition(ms, p);
  push(inst, { type: "progress", position: ms, duration: 240000, playing: p });
  await wait(280);
}

/** 一层的投影尺寸（getBoundingClientRect 是**变换后**的框，用它判定投影有没有真的生效） */
function projected(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, l: Math.round(r.left), t: Math.round(r.top) };
}

function cardOf(inst, i) {
  return inst.sp.querySelector('.sp__card[data-i="' + i + '"]');
}
function zOf(inst, i) {
  const tf = prop(cardOf(inst, i), "--c-tf");
  const m = /translate3d\\(([-\\d.]+)px, ([-\\d.]+)px, ([-\\d.]+)px\\)/.exec(tf);
  return m ? { x: +m[1], y: +m[2], z: +m[3] } : null;
}
function gOf(inst, i) {
  const card = cardOf(inst, i);
  if (!card) return [];
  return Array.from(card.querySelectorAll(".sp__u")).map((u) => Number(prop(u, "--g") || 0));
}
function state(inst) {
  const sp = inst.sp;
  return {
    cam: sp.dataset.cam, flying: sp.dataset.flying, flightMs: sp.dataset.flightMs,
    line: sp.dataset.line, floor: sp.dataset.floor, lit: sp.dataset.lit, glyphs: sp.dataset.glyphs,
    empty: sp.dataset.empty, idle: sp.dataset.idle, perf: sp.dataset.perf,
    animations: sp.dataset.animations, interactive: sp.dataset.interactive,
    narrow: sp.dataset.narrow, frames: counters.frames,
  };
}

async function waitFor(fn, ms, step) {
  const t0 = performance.now();
  for (;;) {
    let v = null;
    try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (performance.now() - t0 > (ms || 1500)) return null;
    await wait(step || 60);
  }
}

window.__scenarioA = async function () {
  const a = await mountInstance({ options: { interactive: true } });
  const out = {};
  await wait(500);

  const sp = a.sp;
  const tower = sp.querySelector(".sp__tower");
  const world = sp.querySelector(".sp__world");
  const sub = sp.querySelector(".sp__sub");
  out.mounted = {
    hasSp: !!sp,
    children: Array.from(sp.querySelectorAll(":scope > *")).map((el) => el.className),
    worldChildren: Array.from(world.querySelectorAll(":scope > *")).map((el) => el.className),
    pool: sp.querySelectorAll(".sp__card").length,
    visible: sp.querySelectorAll('.sp__card[data-off="0"]').length,
    title: sp.querySelector(".sp__title")?.textContent || "",
    artist: sp.querySelector(".sp__artist")?.textContent || "",
    floor: sp.querySelector(".sp__floor")?.textContent || "",
    tc: sp.querySelector(".sp__tc")?.textContent || "",
    subChildren: Array.from(sub?.children || []).map((el) => el.className),
    ghosts: sp.querySelectorAll(".sp__u").length,
    bgChildren: Array.from(bgRoot.querySelector(".spbg")?.children || []).map((el) => el.className),
    bgImg: (bgRoot.querySelector(".spbg__img")?.getAttribute("src") || "").slice(0, 24),
    slices: sp.querySelectorAll(".sp__slice").length,
    slicesBg: Array.from(sp.querySelectorAll(".sp__slice")).map((el) => el.style.backgroundImage || ""),
    perspective: computed(world, "perspective"),
    towerStyle: computed(tower, "transform-style"),
    stageOverflow: computed(sp, "overflow"),
    data: {
      perf: sp.dataset.perf, animations: sp.dataset.animations, interactive: sp.dataset.interactive,
      empty: sp.dataset.empty, narrow: sp.dataset.narrow, dpr: sp.dataset.dpr, playing: sp.dataset.playing,
    },
    vars: { persp: prop(sp, "--sp-persp"), ty: prop(sp, "--sp-ty"), step: prop(sp, "--sp-step") },
  };

  // 投影真的生效：镜头那层（i=0）比远处那层（i=2）**投影更大**
  out.proj = { z0: projected(cardOf(a, 0)), z1: projected(cardOf(a, 1)), z2: projected(cardOf(a, 2)) };
  out.geom = { i0: zOf(a, 0), i1: zOf(a, 1), i2: zOf(a, 2) };
  out.cssDebug = {
    transform: computed(cardOf(a, 0), "transform"),
    opacity: computed(cardOf(a, 0), "opacity"),
    inline: (cardOf(a, 0)?.style.cssText || "").slice(0, 90),
    viewport: [window.innerWidth, window.innerHeight],
  };

  // 逐字：开头只亮第一个字素
  await at(a, 200);
  out.early = { line: sp.dataset.line, lit: sp.dataset.lit, glyphs: sp.dataset.glyphs, g: gOf(a, 0) };
  await at(a, 4200);
  out.mid = { line: sp.dataset.line, lit: sp.dataset.lit, g: gOf(a, 0) };

  // 换层：飞行时长由行间隔反算（8000ms 间隔 → 上界 1400ms），镜头要**慢慢**过去
  a.host.setPosition(8100, true);
  push(a, { type: "progress", position: 8100, duration: 240000, playing: true });
  await wait(120);
  out.flightEarly = { ...state(a), cam: Number(sp.dataset.cam) };
  await wait(160);
  out.flightMid = { cam: Number(sp.dataset.cam), flying: sp.dataset.flying };
  await wait(1600);
  out.flightEnd = { ...state(a), cam: Number(sp.dataset.cam), floorText: sp.querySelector(".sp__floor").textContent };
  out.line1G = gOf(a, 1);

  // 没有 words 的行：整行一起亮
  await at(a, 15000);
  out.fallback = { line: sp.dataset.line, g: gOf(a, 2), lit: sp.dataset.lit, glyphs: sp.dataset.glyphs };

  // 频谱 → 呼吸
  a.host.setSpectrum(new Float32Array(128).fill(0.9));
  await wait(400);
  out.breathBass = prop(sp, "--sp-breath");
  a.host.setSpectrum(null);
  await wait(400);
  out.breathIdle = prop(sp, "--sp-breath");

  // 交互：点第 2 层跳那一句
  const c2 = cardOf(a, 2);
  c2?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const cardIds = Array.from(sp.querySelectorAll(".sp__card")).map((c) => c.dataset.i).join(",");
  out.seeks = a.host.rec.seeks.slice();
  out.cardIds = cardIds;
  // 点空白处不该 seek
  sp.querySelector(".sp__hud").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  out.seeksAfterHud = a.host.rec.seeks.slice();

  // 取色上报（400ms 防抖）
  out.backdrops = a.host.rec.backdrops.slice(0, 2);
  out.bgVars = { bg: prop(sp, "--sp-bg"), fg: prop(sp, "--sp-fg") };

  // 换封面 → 重新取色 + 再上报一次
  const before = a.host.rec.backdrops.length;
  a.host.setCover(COVER2);
  push(a, { type: "media" });
  await wait(700);
  out.coverSwapped = { reported: a.host.rec.backdrops.length > before, img: (bgRoot.querySelector(".spbg__img")?.getAttribute("src") || "").slice(0, 22), ready: bgRoot.querySelector(".spbg__img")?.dataset.ready || "" };

  // 空态
  a.host.setLines([]);
  push(a, { type: "lyrics" });
  await wait(300);
  out.empty = {
    data: sp.dataset.empty,
    text: sp.querySelector(".sp__empty").textContent,
    hidden: sp.querySelector(".sp__empty").hidden,
    towerVisibility: computed(tower, "visibility"),
    visibleCards: sp.querySelectorAll('.sp__card[data-off="0"]').length,
  };
  a.host.setLines(LINES);
  push(a, { type: "lyrics" });
  await wait(300);
  out.restored = { data: sp.dataset.empty, visible: sp.querySelectorAll('.sp__card[data-off="0"]').length };

  // 暂停 → 6 秒后停帧
  await at(a, 9000, false);
  const f0 = counters.frames;
  await wait(7000);
  const pausedFrames = counters.frames - f0;
  await wait(1000);
  out.paused = { idle: sp.dataset.idle, framesSince: pausedFrames, framesTotal: counters.frames, text: sp.querySelector(".sp__tc").textContent };
  const f1 = counters.frames;
  await wait(900);
  out.pausedFrames2 = counters.frames - f1;

  // 回前台再醒
  push(a, { type: "state", playing: true });
  await wait(600);
  out.afterResume = { idle: sp.dataset.idle, frames: counters.frames - f1 };

  // 切后台立即停帧
  push(a, { type: "visibility", foreground: false });
  const f2 = counters.frames;
  await wait(900);
  out.hidden = { foreground: sp.dataset.foreground, frames: counters.frames - f2 };
  push(a, { type: "visibility", foreground: true });
  const f3 = counters.frames;
  await wait(700);
  out.foreground = { frames: counters.frames - f3 };

  // close 补丁：藏起整窗背景层
  push(a, { type: "close" });
  out.closed = { bgHidden: bgRoot.hidden, frames: counters.frames };
  return out;
};

window.__scenarioB = async function () {
  // 静态档：animations:false —— 一帧都不该画，但画面要完整
  const b = await mountInstance({ options: { animations: false } });
  await wait(600);
  const sp = b.sp;
  const out = { static: { frames: counters.frames, ...state(b) } };
  out.dom = {
    pool: sp.querySelectorAll(".sp__card").length,
    visible: sp.querySelectorAll('.sp__card[data-off="0"]').length,
    texts: Array.from(sp.querySelectorAll(".sp__card")).map((c) => (c.querySelector(".sp__line")?.textContent || "").slice(0, 12)),
    towerStyle: computed(sp.querySelector(".sp__tower"), "transform-style"),
    fogDisplay: computed(sp.querySelector(".sp__fog"), "display"),
    slicesDisplay: computed(sp.querySelector(".sp__slices"), "display"),
    active: sp.querySelector('.sp__card[data-state="active"]')?.dataset.i ?? "",
    activeFontSize: computed(sp.querySelector('.sp__card[data-state="active"] .sp__line'), "font-size"),
    cam: sp.dataset.cam,
  };
  out.earlyG = gOf(b, 0);
  // 静态档里补丁来了要画**一帧**（不是一帧都不画）
  const f0 = counters.frames;
  b.host.setPosition(4200, true);
  push(b, { type: "progress", position: 4200, duration: 240000, playing: true });
  await wait(500);
  out.staticUpdate = { frames: counters.frames - f0, line: sp.dataset.line, lit: sp.dataset.lit, g: gOf(b, 0) };
  // 再等一会儿：不该有循环在跑
  const f1 = counters.frames;
  await wait(1200);
  out.staticIdleFrames = counters.frames - f1;
  // 换层也不做 3D
  const f2 = counters.frames;
  b.host.setPosition(9000, true);
  push(b, { type: "progress", position: 9000, duration: 240000, playing: true });
  await wait(400);
  out.staticFlight = { frames: counters.frames - f2, cam: sp.dataset.cam, floor: sp.querySelector(".sp__floor").textContent, flying: sp.dataset.flying };
  return out;
};

window.__scenarioC = async function () {
  // 性能档 + 交互关闭
  const c = await mountInstance({ options: { performanceMode: "performance", interactive: false } });
  await wait(500);
  const sp = c.sp;
  const out = { perf: { ...state(c), pool: sp.querySelectorAll(".sp__card").length } };
  out.slicesDisplay = computed(sp.querySelector(".sp__slices"), "display");
  out.cursor = computed(sp.querySelector(".sp__card"), "cursor");
  // 限帧：40 帧的窗口里应当被压到 45fps 附近（打点 rAF 是 8ms 一帧）
  const f0 = counters.frames;
  await wait(1000);
  out.perfFrames = counters.frames - f0;
  // 性能档不做飞行：换层直接到位
  c.host.setPosition(8100, true);
  push(c, { type: "progress", position: 8100, duration: 240000, playing: true });
  await wait(150);
  out.perfJump = { cam: sp.dataset.cam, flying: sp.dataset.flying, floor: sp.querySelector(".sp__floor").textContent };
  // 交互关闭：点了不 seek
  cardOf(c, 2)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  out.seeks = c.host.rec.seeks.slice();

  // 窄窗口
  c.host.setSize(820, 560);
  stage.style.width = "820px";
  stage.style.height = "560px";
  sp.style.width = "820px";
  sp.style.height = "560px";
  push(c, { type: "resize" });
  await wait(600);
  out.narrow = {
    data: sp.dataset.narrow,
    persp: prop(sp, "--sp-persp"),
    ty: prop(sp, "--sp-ty"),
    pageScroll: document.documentElement.scrollWidth - window.innerWidth,
    cards: [0, 1, 2].map((i) => projected(cardOf(c, i))),
  };

  // dpr2：塔是 DOM 3D，不画 canvas，只要属性跟上
  c.host.setSize(1100, 700);
  sp.style.width = "";
  sp.style.height = "";
  push(c, { type: "resize" });
  await wait(300);
  out.dpr = sp.dataset.dpr;
  return out;
};

/* 安全区：主界面里舞台铺满整窗（清单 background:true），宿主的**标题栏 + 详情页头部行**
   与**底部播放控件栏**压在画面上，两块的高度由宿主写成 --skin-inset-top / -bottom。
   这一场按真机的 88px / 92px 把它挂到舞台根上，量 HUD 的**文字**到底落在哪 ——
   让开以前，.sp__hud 是 bottom:0 + padding-bottom:30px，曲名与时间码正压在底栏底下。 */
window.__scenarioE = async function () {
  const pv = document.querySelector(".playerview");
  const setInset = (t, b) => {
    pv.style.setProperty("--skin-inset-top", t);
    pv.style.setProperty("--skin-inset-bottom", b);
  };
  const box = (sp, sel) => {
    const el = sp.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };
  const stageRect = () => {
    const r = stage.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };

  setInset("88px", "92px");
  /* 复用上一个场景的实例，**不要新挂一个**：本包的帧循环是模块级单例，再 mount 一个
     会把上一个的 rAF 留在后台（场景 D 的"卸载后零帧"就会被它污染成假红）。 */
  const e = INSTANCES[INSTANCES.length - 1];
  const sp = e.sp;
  stage.style.width = "1100px";
  stage.style.height = "700px";
  sp.style.width = "";
  sp.style.height = "";
  e.host.setSize(1100, 700);
  push(e, { type: "resize" });
  await wait(400);
  const out = {
    inset: [computed(sp, "--skin-inset-top"), computed(sp, "--skin-inset-bottom")],
    stage: stageRect(),
    hud: box(sp, ".sp__hud"),
    title: box(sp, ".sp__title"),
    sub: box(sp, ".sp__sub"),
  };

  // 窄窗口：底栏变矮（真机是 86px），窄窗档的 padding 覆盖最容易把安全区吃掉
  e.host.setSize(820, 560);
  stage.style.width = "820px";
  stage.style.height = "560px";
  sp.style.width = "820px";
  sp.style.height = "560px";
  setInset("88px", "86px");
  push(e, { type: "resize" });
  await wait(500);
  out.narrow = {
    data: sp.dataset.narrow,
    stage: stageRect(),
    hud: box(sp, ".sp__hud"),
    title: box(sp, ".sp__title"),
    sub: box(sp, ".sp__sub"),
  };

  // 归零（桌面背景歌词窗口没有这两块 chrome）：HUD 要贴回底边
  stage.style.width = "1100px";
  stage.style.height = "700px";
  sp.style.width = "";
  sp.style.height = "";
  e.host.setSize(1100, 700);
  setInset("0px", "0px");
  push(e, { type: "resize" });
  await wait(400);
  out.zero = { stage: stageRect(), sub: box(sp, ".sp__sub") };
  pv.style.removeProperty("--skin-inset-top");
  pv.style.removeProperty("--skin-inset-bottom");
  return out;
};

window.__scenarioD = async function () {
  // 卸载：舞台 + 整窗背景层都要清干净，帧循环也要停。
  // 先停掉前面几个实例：帧计数器是**全局**的，别人还在跑就没法判断"这一个"停没停
  // （第一版就是这么假绿/假红的：C 还在动，被算到 D 头上）。
  for (const other of INSTANCES.slice(0, -1)) skin.update(other.host.ctx, { type: "close" });
  await wait(250);
  const d = await mountInstance({ options: {} });
  await wait(600);
  const before = counters.frames;
  window.__skin = skin;
  const ctx = d.host.ctx;
  skin.destroy(ctx);
  await wait(700);
  const out = {
    stageChildren: stage.querySelectorAll(":scope > div").length,
    rootHtml: d.root.innerHTML,
    hasSp: !!d.root.querySelector(".sp"),
    bgChildren: bgRoot.children.length,
    bgHidden: bgRoot.hidden,
    framesAfter: counters.frames - before,
    framesBefore: before,
  };
  // 卸载后 update 不该抛
  let threw = "";
  try {
    skin.update(ctx, { type: "progress", position: 1000, playing: true });
  } catch (err) {
    threw = String(err && err.message ? err.message : err);
  }
  out.updateAfterDestroy = threw;
  return out;
};

window.__report = { counters: window.__counters, errors: [] };
window.__sceneErrors = window.__report.errors;
</script>
</body>
</html>`;

/* --------------------------------------------------------------------------
   1. 静态服务（只服务本样式包目录之内，且只读）
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
   2. 起无头 Edge 并接上 CDP
   -------------------------------------------------------------------------- */
const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 msedge.exe —— 这一项自检需要本机装 Edge（系统自带）。");
  server.close();
  process.exitCode = 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(tmpdir(), "spire-check-" + Date.now());
mkdirSync(OUT, { recursive: true });

// 随机端口：上一次跑挂了留下的 Edge 可能还占着固定端口，
// 那样新实例绑不上，CDP 会连到**旧进程**上（表现为"页面没准备好"）
const CDP_PORT = 9900 + Math.floor(Math.random() * 500);
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
    "--window-size=1100,700",
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
  process.exitCode = 1;
} else {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 0;
  const waiting = new Map();
  const errors = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)(m.result);
      waiting.delete(m.id);
      return;
    }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      errors.push("exception: " + (d?.exception?.description || d?.text || "?"));
    }
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
      const text = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
      if (text) errors.push(`${m.params.type}: ${text}`);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      msgId += 1;
      waiting.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Runtime.enable");
  await send("Page.enable");

  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res?.exceptionDetails) {
      return { __error: res.exceptionDetails.exception?.description || res.exceptionDetails.text };
    }
    return res?.result?.value;
  };

  // 在页面**最前面**把 rAF 换成可控定时器：既能数帧，又能给一帧加人为耗时
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        const counters = { frames: 0 };
        window.__counters = counters;
        const raf = window.requestAnimationFrame.bind(window);
        let burn = 0;
        window.__setBurn = (ms) => { burn = ms; };
        window.requestAnimationFrame = (cb) => raf((t) => {
          counters.frames += 1;
          if (burn > 0) {
            const until = performance.now() + burn;
            while (performance.now() < until) { /* 人为拖帧 */ }
          }
          cb(t);
        });
      })();
    `,
  });

  // 固定视口：headless 新档有时给一个 0×0 或 500×320 的默认窗口
  // （那就成了"页面根本没排版、rAF 也不跑"，断言会以莫名其妙的方式失败）
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 760,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await send("Page.navigate", { url: BASE + "/__harness.html" });
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    await sleep(300);
    ready = await evaluate("!!window.__scenarioA && !!window.__counters");
    if (ready === true) break;
  }

  const results = [];
  function check(ok, name, detail = "") {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? "[OK ]" : "[!! ]"} ${name}${detail ? `  → ${detail}` : ""}`);
  }
  const j = (v) => (typeof v === "string" ? v : JSON.stringify(v));
  const brief = (e) => ({ error: String(e && e.message ? e.message : e) });
  const num = (v) => Number(v);
  /** CSS 长度（--sp-persp 这类是带 px 的字符串，Number() 会得到 NaN） */
  const px = (v) => parseFloat(String(v).replace("px", ""));

  if (ready !== true) {
    console.error("页面没准备好：", j(ready));
    check(false, "自检页面加载", j(ready));
  } else {
    /* ---- 场景 A ---- */
    console.log("\n[1] 挂载 / 结构 / 投影");
    let A;
    try {
      A = await evaluate("window.__scenarioA()");
    } catch (e) {
      A = brief(e);
    }
    if (A?.__error || A?.error) {
      check(false, "场景 A 跑通", j(A.__error || A.error));
    } else {
      const M = A.mounted;
      check(M.hasSp === true, "样式能挂载并渲染", j(M.error || ""));
      check(M.children.length === 2, "舞台根里是「世界 + HUD」两层", j(M.children));
      check(M.worldChildren.join("|") === "sp__fog|sp__slices|sp__tower|sp__empty", "世界里四层齐全（雾/切片/塔/空态）", j(M.worldChildren));
      check(M.perspective !== "none" && /px$/.test(M.perspective), "透视生效（perspective 是 px 值）", j(M.perspective));
      check(M.towerStyle === "preserve-3d", "塔体是 preserve-3d（没被宿主那层 @scope 影响）", j(M.towerStyle));
      check(M.stageOverflow === "hidden", "舞台根裁掉飞出去的层（overflow:hidden）", j(M.stageOverflow));
      check(M.pool === 25 && M.visible <= 25 && M.visible >= 5, "卡片池 = 2×半窗+1（默认 25），且只显示窗口内的层", j([M.pool, M.visible]));
      check(M.title === "旧梦一场" && M.artist === "某歌手", "HUD 曲名与歌手都在", j([M.title, M.artist]));
      check(/^第 \d+ \/ \d+ 层$/.test(M.floor), "层号「第 n / N 层」在 DOM 上", j(M.floor));
      check(/^\d\d:\d\d \/ \d\d:\d\d$/.test(M.tc), "时间码在 DOM 上", j(M.tc));
      check(M.subChildren.length === 3, "HUD 副行的三个块都还挂着", j(M.subChildren));
      check(M.ghosts > 0, "歌词已切成逐字素 span", j(M.ghosts));
      check(M.slices === 3, "封面视差切片 ×3", j(M.slices));
      check(
        M.slicesBg.filter((v) => v.includes("data:") || v.includes("/online/cover")).length === 3,
        "三片切片都拿到了封面（不是空壳）",
        j(M.slicesBg.map((v) => (v.includes("data:") ? "cover" : v.slice(0, 12))))
      );
      check(M.bgChildren.length === 3, "整窗背景层三层内容都是本包填的", j(M.bgChildren));
      check(M.bgImg.includes("data:image"), "背景层拿到了封面（真 <img> 的 src）", j(M.bgImg));
      check(M.data.perf === "0" && M.data.animations === "1" && M.data.interactive === "1", "状态属性与设置一致", j(M.data));
      check(/px$/.test(M.vars.persp) && /px$/.test(M.vars.ty), "塔形参数（透视/层距）已写进变量", j(M.vars));

      const p0 = A.proj?.z0, p2 = A.proj?.z2;
      check(p0 && p2 && p0.h > p2.h, "投影真的生效：镜头那层比远处那层投影更大", j(A.proj) + " " + j(A.cssDebug));
      check(A.geom.i0.z === 0 && A.geom.i1.z < 0 && A.geom.i2.z < 0, "远处的层在 -Z 方向（z 递减）", j(A.geom));
      check(A.geom.i1.x !== A.geom.i0.x, "螺旋：层沿 X 有偏移（不是一条直线）", j([A.geom.i0.x, A.geom.i1.x]));

      console.log("\n[2] 逐字进度 / 换层飞行");
      check(num(A.early.line) === 0, "挂载后停在第 0 层", j(A.early.line));
      check(num(A.early.lit) >= 1 && num(A.early.lit) < num(A.early.glyphs), "开头只亮了开头的字素（不是整层一起亮）", j([A.early.lit, A.early.glyphs, A.early.g]));
      check(A.mid.g.filter((v) => v > 0).length > A.early.g.filter((v) => v > 0).length, "进度推进后亮起的字素变多", j([A.early.g, A.mid.g]));
      check(A.mid.g.every((v) => v >= 0 && v <= 1), "逐字档位都在 0..1", j(A.mid.g));
      check(num(A.flightEarly.flightMs) === 1400, "飞行时长由行间隔反算（8s 间隔 → 1400ms 上界）", j(A.flightEarly.flightMs));
      check(A.flightMid.flying === "1" && A.flightMid.cam > 0 && A.flightMid.cam < 1, "换层时镜头在路上（不是直接跳）", j(A.flightMid));
      check(A.flightEnd.cam >= 0.999 && num(A.flightEnd.line) === 1, "飞完之后恰好停在目标层", j([A.flightEnd.cam, A.flightEnd.line]));
      check(num(A.flightEnd.floor) === 2, "层号跟着换到第 2 层", j([A.flightEnd.floor, A.flightEnd.floorText]));
      check(A.line1G.filter((v) => v > 0).length >= 1, "第 2 层的逐字进度也在写", j(A.line1G));
      check(A.fallback.g.length > 0 && A.fallback.g.every((v) => v === 1), "没有 words 的行整层一起亮", j([A.fallback.line, A.fallback.g]));

      console.log("\n[3] 频谱 / 交互 / 取色 / 空态");
      check(px(A.breathBass) > 2, "低频喂进了呼吸量", j(A.breathBass));
      check(px(A.breathIdle) < 0.6, "拿不到频谱时呼吸衰减回 0（EMA 不会瞬间归零）", j(A.breathIdle));
      check(A.seeks.length === 1 && A.seeks[0] === 14000, "点第 3 层跳到那一句（seek 收到该行的 time）", j({ seeks: A.seeks, cards: A.cardIds }));
      check(A.seeksAfterHud.length === 1, "点 HUD 不触发 seek", j(A.seeksAfterHud));
      check((A.backdrops || []).length >= 1, "reportBackdrop 上报了", j(A.backdrops));
      check(/^#[0-9a-f]{6}$/i.test(A.backdrops?.[0]?.bg || "") && /^#[0-9a-f]{6}$/i.test(A.backdrops?.[0]?.fg || ""), "上报的是 bg/fg 两个 hex", j(A.backdrops?.[0]));
      check(A.coverSwapped.reported === true && A.coverSwapped.ready !== "0", "换封面后重设图片、重新取色并再上报一次", j(A.coverSwapped));
      check(A.empty.data === "1" && A.empty.text.length > 0 && A.empty.towerVisibility === "hidden", "无歌词时显示空态并收起塔体", j(A.empty));
      check(A.restored.data === "0" && A.restored.visible > 0, "歌词回来后正常恢复", j(A.restored));

      console.log("\n[4] 暂停 / 停帧 / 前后台");
      check(num(A.paused.idle) === 1 || A.paused.idle === "1", "暂停 6 秒后进入停帧状态（data-idle）", j(A.paused.idle));
      check(A.pausedFrames2 <= 2, "停帧后确实不再画", j(A.pausedFrames2));
      check(A.afterResume.frames > 3 && (A.afterResume.idle === "" || A.afterResume.idle === undefined), "重新播放后帧循环醒过来", j(A.afterResume));
      check(A.hidden.frames <= 2, "切后台立即停帧", j(A.hidden));
      check(A.foreground.frames > 3, "回前台再醒", j(A.foreground));
      check(A.closed.bgHidden === true, "close 补丁把整窗背景层藏起来", j(A.closed.bgHidden));

      console.log("\n[5] 静态档（animations:false）");
      let B;
      try {
        B = await evaluate("window.__scenarioB()");
      } catch (e) {
        B = brief(e);
      }
      if (B?.__error || B?.error) {
        check(false, "场景 B 跑通", j(B.__error || B.error));
      } else {
        check(B.dom.pool === 25 && B.dom.visible > 0, "静态档仍然建出完整的层", j([B.dom.pool, B.dom.visible]));
        check(B.dom.texts.some((t) => t.length > 0), "静态档每层都有文字", j(B.dom.texts.slice(0, 3)));
        check(B.dom.towerStyle === "flat", "静态档关掉 preserve-3d", j(B.dom.towerStyle));
        check(B.dom.fogDisplay === "none" && B.dom.slicesDisplay === "none", "静态档关掉雾与切片", j([B.dom.fogDisplay, B.dom.slicesDisplay]));
        check(B.dom.active !== "", "静态档标出了当前层", j(B.dom.active));
        check(
          B.staticUpdate.frames === 0 && num(B.staticUpdate.line) === 0 && B.staticUpdate.g.some((v) => v > 0),
          "静态档补丁来了立刻重画（但不进帧循环）",
          j(B.staticUpdate)
        );
        check(num(B.staticUpdate.line) === 0 && B.staticUpdate.g.some((v) => v > 0), "静态档的逐字进度照样推进", j([B.staticUpdate.line, B.staticUpdate.g]));
        check(B.staticIdleFrames <= 2, "静态档长时间也不会有帧", j(B.staticIdleFrames));
        check(B.staticFlight.flying === "0" && num(B.staticFlight.cam) === 1, "静态档换层直接到位（不飞）", j(B.staticFlight));
      }

      console.log("\n[6] 性能档 / 窄窗口");
      let C;
      try {
        C = await evaluate("window.__scenarioC()");
      } catch (e) {
        C = brief(e);
      }
      if (C?.__error || C?.error) {
        check(false, "场景 C 跑通", j(C.__error || C.error));
      } else {
        check(num(C.perf.pool) === 13, "性能档半窗 6 → 13 张卡片", j(C.perf.pool));
        check(C.perf.perf === "1" && C.slicesDisplay === "none", "性能档关掉切片", j([C.perf.perf, C.slicesDisplay]));
        check(C.perfFrames > 5 && C.perfFrames < 80, "按清单 45fps 限帧（打了点的 rAF 没有被逐帧放行）", j(C.perfFrames));
        check(C.perfJump.flying === "0" && num(C.perfJump.cam) === 1, "性能档换层直接跳（不做飞行）", j(C.perfJump));
        check(C.cursor === "default" && C.seeks.length === 0, "interactive:false 时不可点、也不 seek", j([C.cursor, C.seeks]));
        check(C.narrow.data === "1", "窄窗口标记生效", j(C.narrow.data));
        check(px(C.narrow.persp) < 900 && px(C.narrow.ty) < 108, "窄窗口透视收敛 + 层距压缩", j([C.narrow.persp, C.narrow.ty]));
        check((C.narrow.pageScroll ?? 99) <= 1, "窄窗口下页面没有横向滚动", j(C.narrow.pageScroll));
        const cw = C.narrow.cards.filter(Boolean);
        check(cw.length >= 2 && cw.every((r) => r.w > 100 && r.w < 1100), "窄窗口下层仍是有尺寸的（布局没塌）", j(cw));
        check(["1", "2"].includes(C.dpr), "dpr 属性跟着环境走", j(C.dpr));
      }

      console.log("\n[7] 安全区（宿主标题栏 + 头部行 / 底栏压在画面上）");
      let E;
      try {
        E = await evaluate("window.__scenarioE()");
      } catch (e) {
        E = brief(e);
      }
      if (E?.__error || E?.error) {
        check(false, "场景 E 跑通", j(E.__error || E.error));
      } else {
        check(E.inset[0] === "88px" && E.inset[1] === "92px", "舞台根把 --skin-inset-* 传到了插件里", j(E.inset));
        check(E.sub && E.sub.bottom <= E.stage.bottom - 92, "主窗口：HUD 文字整个落在底栏之上（底栏 92px）", j({ sub: E.sub, stage: E.stage }));
        check(E.title && E.title.top >= E.stage.top + 88, "主窗口：HUD 首行也在顶部 chrome（88px）之下", j({ title: E.title, stage: E.stage }));
        // HUD 自己（含那层渐变暗底）允许铺到舞台底 —— 底栏盖住的那一段本来就是它的背景
        check(E.hud && E.hud.bottom >= E.stage.bottom - 1, "HUD 的暗底仍然铺到舞台底（只抬文字，不留硬边）", j({ hud: E.hud, stage: E.stage }));
        check(E.narrow.data === "1", "窄窗档标记生效", j(E.narrow.data));
        check(
          E.narrow.sub && E.narrow.sub.bottom <= E.narrow.stage.bottom - 86,
          "窄窗档：padding 覆盖没有把安全区吃掉（底栏 86px）",
          j({ sub: E.narrow.sub, stage: E.narrow.stage })
        );
        check(
          E.zero.sub && E.zero.sub.bottom >= E.zero.stage.bottom - 34,
          "inset 归零（桌面背景歌词窗口）后 HUD 贴回底边",
          j({ sub: E.zero.sub, stage: E.zero.stage })
        );
      }

      console.log("\n[8] 卸载（舞台与整窗背景层都要清干净）");
      let D;
      try {
        D = await evaluate("window.__scenarioD()");
      } catch (e) {
        D = brief(e);
      }
      if (D?.__error || D?.error) {
        check(false, "场景 D 跑通", j(D.__error || D.error));
      } else {
        check(D.hasSp === false && D.rootHtml === "", "舞台挂载点清空", j([D.hasSp, D.rootHtml]));
        check(D.bgChildren === 0 && D.bgHidden === true, "整窗背景层被清空并隐藏", j([D.bgChildren, D.bgHidden]));
        check(D.framesAfter <= 2, "destroy 之后不再有帧", j(D.framesAfter));
        check(D.updateAfterDestroy === "", "destroy 之后再收 update 不抛异常", j(D.updateAfterDestroy));
      }
    }
  }

  console.log("\n[9] 控制台必须干净");
  const noisy = errors.filter((e) => !/404|Failed to load resource|net::ERR/.test(e));
  check(noisy.length === 0, "无未捕获异常 / console.error", noisy.slice(0, 4).map((e) => String(e).split("\n")[0]).join(" | "));

  ws.close();
  edge.kill();
  server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n结果：${results.length - failed} 通过 / ${failed} 失败`);
  process.exitCode = failed > 0 ? 1 : 0;
}
