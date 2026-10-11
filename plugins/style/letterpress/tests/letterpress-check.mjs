/* ==========================================================================
   letterpress-check.mjs —— 「活字」的浏览器自检
   --------------------------------------------------------------------------
   自带静态服务（**不要**对 Vite 跑：Vite 给模块 URL 加查询串，import() 会拿到
   第二个空实例）+ 假宿主 + 无头 Edge（CDP，随机端口）。

   它回答的是纯逻辑测不出来的那几件事：
     · 宿主那层 @layer + @scope 包下去之后，排版曲线是否**真的**落在了 CSS 上
       （读 computed 值，不是读我们写进去的行内值 —— 那是最容易自欺的绿灯）；
     · 逐字素 span 是不是**只有当前行**有（浏览器里数 DOM，不是看代码）；
     · 换行是不是真的播了 FLIP（拦 Element.prototype.animate，看 keyframes 只动 transform）；
     · 当前行是不是永远停在版面中央（分页推进不能把读者看丢）；
     · 点击某一行是否 seek 到那一句；暂停 6 秒 / 切后台是否正确停帧；
     · 静态档（animations:false）是否"一帧都不进循环但画面完整"；性能档是否只剩低频轴；
     · destroy 之后舞台有没有残留，以及**有没有越权去动宿主的背景容器**。

   跑法： node plugins/style/letterpress/tests/letterpress-check.mjs
   ========================================================================== */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** 对比度判定直接借本包的纯逻辑（自检不许抄一份算法，抄的那份会跟着漂） */
const inkLib = await import(pathToFileURL(join(PKG_ROOT, "lib", "ink.js")).href);

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
 *   第 0 行 6 个字素（逐字，0..4000ms）
 *   第 1 行 5 个字素（逐字，8000..12000ms）—— 与第 0 行**字素数不同**
 *   第 2 行 7 个字素但**没有 words**（必须退回整行一起亮）
 *   第 3 行没有 words、行间隔很长（验空档与行定位）
 */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>letterpress check</title>
<style>
  html, body { margin: 0; background: #202020; }
  .playerview { position: fixed; left: 0; top: 0; width: 1100px; height: 700px; }
  .playerview__stage { position: relative; height: 100%; overflow: hidden; }
  .skin-bg { position: fixed; left: 0; top: 0; right: 0; bottom: 0; }
</style>
</head>
<body>
<div class="skin-bg" data-skin="letterpress"></div>
<div class="playerview" data-skin="letterpress"><div class="playerview__stage" id="stage"></div></div>
<script type="module">
import skin from "/skin.js";

const stage = document.getElementById("stage");
const bgRoot = document.querySelector(".skin-bg");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = (el, name) => (el ? el.style.getPropertyValue(name).trim() : "");
const computed = (el, name) => (el ? getComputedStyle(el).getPropertyValue(name).trim() : "");
const computedAfter = (el, name) => (el ? getComputedStyle(el, "::after").getPropertyValue(name).trim() : "");

/* 按宿主的方式加载样式：@layer skin + @scope(舞台根) */
const cssText = await (await fetch("/skin.css")).text();
const styleEl = document.createElement("style");
styleEl.textContent = '@layer skin { @scope (.playerview[data-skin="letterpress"], .skin-bg[data-skin="letterpress"]) { ' + cssText + ' } }';
document.head.appendChild(styleEl);

/* FLIP 只能动 transform：把 animate 拦下来记一笔（否则"飞了没有"全凭相信） */
const anims = [];
window.__anims = anims;
const origAnimate = Element.prototype.animate;
Element.prototype.animate = function (kf, opt) {
  try {
    const frames = Array.isArray(kf) ? kf : [kf];
    anims.push({
      cls: this.className,
      props: Object.keys(frames[0] || {}).sort().join(","),
      duration: opt && opt.duration,
      frames: frames.length,
      first: JSON.stringify(frames[0] || {}),
    });
  } catch { /* 记录失败不影响正事 */ }
  return origAnimate.call(this, kf, opt);
};
const takeAnims = () => anims.splice(0, anims.length);

function makeCover(a, b, spot) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = a; g.fillRect(0, 0, 64, 24);
  g.fillStyle = b; g.fillRect(0, 24, 64, 16);
  g.fillStyle = spot; g.fillRect(0, 40, 64, 24);
  return c.toDataURL("image/png");
}
const COVER = makeCover("#f2efe7", "#171610", "#8f3b52");
const COVER2 = makeCover("#e8e2d4", "#2b2b28", "#2f6f4f");
const DEFAULT_COVER = makeCover("#e6e2d8", "#1b1a17", "#8a5a2b");

const LINES = [
  { time: 0, text: "活字排版开场", words: [0, 800, 1600, 2400, 3200, 4000] },
  { time: 8000, text: "第二句来了", words: [8000, 8800, 9600, 10400, 11200] },
  { time: 14000, text: "这一句没有逐字" },
  { time: 26000, text: "隔了很久的一句" },
  { time: 40000, text: "最后一句" },
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
    mode: "light",
    interactive: true,
    env: () => ({ width: w, height: h, dpr, reducedMotion: !!o.reducedMotion, foreground: true }),
    options: () => opt,
    media: () => media,
    track: () => media.song,
    lyrics: () => media.lyrics,
    covers: () => ({ current: media.cover, list: [], index: 0 }),
    playback: () => pb,
    spectrum: () => {
      rec.spectrumCalls += 1;
      return spec ? { bands: spec, at: performance.now() } : null;
    },
    sdk: {
      splitGraphemes: (t) => Array.from(String(t == null ? "" : t)),
      manifest: {
        id: "letterpress",
        colors: { bg: "#f2efe7", fg: "#171610", accent: "#a8452c" },
        performance: { budgetFps: 30 },
      },
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

/* 帧计数用**注入脚本**里那个对象（它在页面最前面给 rAF 打了点） */
const counters = window.__counters || { frames: 0 };

/* mount 是 async 的（它要先加载子模块），必须 await */
const INSTANCES = [];
async function mountInstance(o) {
  const root = document.createElement("div");
  // 真机上挂载点是铺满舞台的（position:absolute; inset:0）；
  // 这里必须照做，否则 .lp 的 height:100% 会算成 0，布局塌了会以莫名其妙的方式失败
  root.style.cssText = "position:absolute;inset:0";
  stage.appendChild(root);
  const host = createHost(Object.assign({ root }, o));
  await skin.mount(host.ctx);
  const inst = { root, host, lp: root.querySelector(".lp") };
  INSTANCES.push(inst);
  return inst;
}

function push(inst, patch) {
  skin.update(inst.host.ctx, patch);
}

/** 走一步进度并等画面跟上（视觉滞后 70ms + 过渡 420ms，等 620ms 足够看清"稳定态"） */
async function at(inst, ms, playing, settle) {
  const p = playing === undefined ? true : playing;
  inst.host.setPosition(ms, p);
  push(inst, { type: "progress", position: ms, duration: 240000, playing: p });
  await wait(settle === undefined ? 620 : settle);
}

const linesOf = (inst) => Array.from(inst.lp.querySelectorAll(".lp__line"));
const activeLine = (inst) => inst.lp.querySelector('.lp__line[data-state="active"]');
const unitsOf = (inst) => Array.from(inst.lp.querySelectorAll('.lp__line[data-state="active"] .lp__u'));
const gOf = (inst) => unitsOf(inst).map((u) => Number(prop(u, "--g") || 0));
const topOf = (el) => (el ? Math.round(el.getBoundingClientRect().top) : null);

function state(inst) {
  const lp = inst.lp;
  return {
    line: lp.dataset.line, total: lp.dataset.total, lit: lp.dataset.lit, glyphs: lp.dataset.glyphs,
    weight: lp.dataset.weight, size: lp.dataset.size, empty: lp.dataset.empty, poster: lp.dataset.poster,
    idle: lp.dataset.idle, perf: lp.dataset.perf, set: lp.dataset.set,
    animations: lp.dataset.animations, interactive: lp.dataset.interactive, narrow: lp.dataset.narrow,
    dpr: lp.dataset.dpr, playing: lp.dataset.playing, showLyrics: lp.dataset.showLyrics,
    frames: counters.frames,
  };
}

window.__scenarioA = async function () {
  const a = await mountInstance({ options: {} });
  const out = {};
  await wait(700);

  const lp = a.lp;
  const sheet = lp.querySelector(".lp__sheet");
  const col = lp.querySelector(".lp__col");
  out.mounted = {
    hasLp: !!lp,
    children: Array.from(lp.querySelectorAll(":scope > *")).map((el) => el.className),
    sheetChildren: Array.from(sheet.querySelectorAll(":scope > *")).map((el) => el.className),
    pool: linesOf(a).length,
    visible: linesOf(a).filter((el) => el.dataset.off === "0").length,
    slots: linesOf(a).map((el) => prop(el, "--slot")).join(",").slice(0, 40),
    slotStyles: linesOf(a).slice(0, 3).map((el) => el.getAttribute("style") || ""),
    tops: linesOf(a).slice(0, 6).map((el) => Math.round(el.getBoundingClientRect().top)),
    colTop: Math.round(sheet.querySelector(".lp__col").getBoundingClientRect().top),
    title: lp.querySelector(".lp__hud-title")?.textContent || "",
    num: lp.querySelector(".lp__num")?.textContent || "",
    read: lp.querySelector(".lp__read")?.textContent || "",
    tc: lp.querySelector(".lp__tc")?.textContent || "",
    emptyEl: lp.querySelector(".lp__empty"),
    posterHidden: lp.querySelector(".lp__poster")?.hidden,
    elideTop: lp.querySelector(".lp__elide--top")?.textContent || "",
    elideBottom: lp.querySelector(".lp__elide--bottom")?.textContent || "",
    // 页面真的被宿主的 @layer/@scope 包过之后还照样生效（读 computed，不读行内）
    paper: computed(lp, "background-color"),
    lineFontSize: computed(activeLine(a), "font-size"),
    colTransform: computed(col, "transform"),
    colTransition: computed(col, "transition-duration"),
    lineTransform: computed(activeLine(a), "transform"),
    rulesFilter: computed(lp.querySelector(".lp__rules"), "filter"),
    bodyFilter: computed(lp, "filter"),
    stageOverflow: computed(lp, "overflow"),
    data: { perf: lp.dataset.perf, animations: lp.dataset.animations, interactive: lp.dataset.interactive, narrow: lp.dataset.narrow, dpr: lp.dataset.dpr, showLyrics: lp.dataset.showLyrics },
    vars: {
      base: prop(lp, "--lp-base"), fit: prop(lp, "--lp-fit"), leading: prop(lp, "--lp-leading"),
      shift: prop(lp, "--lp-shift"), spot: prop(lp, "--lp-spot"), move: prop(lp, "--lp-move"),
    },
  };
  out.unitScope = {
    activeUnits: unitsOf(a).length,
    activeText: activeLine(a)?.textContent || "",
    linesWithUnits: linesOf(a).filter((el) => el.dataset.units === "1").length,
    totalUnits: lp.querySelectorAll(".lp__u").length,
    // 非当前行必须是**纯文本**（没有 span）
    otherUnits: linesOf(a).filter((el) => el.dataset.units !== "1").reduce((n, el) => n + el.querySelectorAll(".lp__u").length, 0),
    deps: linesOf(a).map((el) => el.dataset.depth).join(","),
  };

  /* 排版曲线真的要落到 CSS 上：喂满频谱 vs 静音 */
  await at(a, 200, true, 400);
  const f0 = takeAnims();
  out.early = { line: lp.dataset.line, g: gOf(a), glyphs: lp.dataset.glyphs, lit: lp.dataset.lit, anims: f0.length };
  a.host.setSpectrum(new Float32Array(128).fill(0.85));
  await wait(700);
  out.loud = {
    wt: prop(lp, "--lp-wt"), sz: prop(lp, "--lp-sz"), sp: prop(lp, "--lp-sp"),
    sk: prop(lp, "--lp-sk"), lift: prop(lp, "--lp-lift"), inkv: prop(lp, "--lp-inkv"),
    read: lp.querySelector(".lp__read")?.textContent || "",
    fontSize: computed(activeLine(a), "font-size"),
    fontWeight: computed(activeLine(a), "font-weight"),
    letterSpacing: computed(activeLine(a), "letter-spacing"),
    transform: computed(activeLine(a), "transform"),
  };
  a.host.setSpectrum(new Float32Array(128).fill(0));
  await wait(1200);
  out.quiet = { wt: prop(lp, "--lp-wt"), sz: prop(lp, "--lp-sz"), sp: prop(lp, "--lp-sp"), sk: prop(lp, "--lp-sk"), lift: prop(lp, "--lp-lift"), fontSize: computed(activeLine(a), "font-size") };
  await at(a, 3800, true, 500);
  out.late = { g: gOf(a), lit: lp.dataset.lit };

  /* 换行 = 一次活字重排：FLIP 只动 transform，位移约一个行高，当前行停在同一位置 */
  const topBefore = topOf(activeLine(a));
  const shiftBefore = prop(lp, "--lp-shift");
  takeAnims();
  a.host.setPosition(8100, true);
  push(a, { type: "progress", position: 8100, duration: 240000, playing: true });
  await wait(140);
  const midAnims = takeAnims();
  out.reflow = {
    line: lp.dataset.line,
    set: lp.dataset.set,
    composingAfter: computedAfter(activeLine(a)?.querySelector(".lp__u"), "opacity"),
    anims: midAnims,
    shiftBefore,
    shiftAfter: prop(lp, "--lp-shift"),
  };
  await wait(700);
  out.reflowSettled = {
    topBefore,
    topAfter: topOf(activeLine(a)),
    line: lp.dataset.line,
    set: lp.dataset.set || "",
    g: gOf(a),
    float: linesOf(a).map((el) => prop(el, "--lp-ds") + "/" + prop(el, "--lp-di")).join(","),
  };

  /* 没有 words 的行：整行一起亮 */
  await at(a, 15000, true, 500);
  out.fallback = { line: lp.dataset.line, g: gOf(a), lit: lp.dataset.lit, glyphs: lp.dataset.glyphs };

  /* 交互：点某一行跳那一句；点 HUD 不跳 */
  const target = lp.querySelector('.lp__line[data-i="3"]');
  target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  out.seeks = a.host.rec.seeks.slice();
  out.clicked = { i: target?.dataset.i ?? "", text: (target?.textContent || "").slice(0, 8) };
  lp.querySelector(".lp__hud")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  out.seeksAfterHud = a.host.rec.seeks.slice();
  // 点空行（data-i="-1"）不该 seek
  lp.querySelector('.lp__line[data-i="-1"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  out.seeksAfterBlank = a.host.rec.seeks.slice();

  /* 取色上报：纸白/墨黑固定，专色从封面里挑 */
  out.backdrops = a.host.rec.backdrops.slice(0, 2);
  out.contrast = a.host.rec.backdrops.length ? inkContrast(a.host.rec.backdrops[0]) : 0;
  const before = a.host.rec.backdrops.length;
  a.host.setCover(COVER2);
  push(a, { type: "media" });
  await wait(900);
  out.coverSwapped = {
    reported: a.host.rec.backdrops.length > before,
    accent: a.host.rec.backdrops[a.host.rec.backdrops.length - 1]?.accent || "",
    spotVar: prop(lp, "--lp-spot"),
  };

  /* 海报形态（showLyrics:false） */
  a.host.setOptions({ showLyrics: false });
  push(a, { type: "options" });
  await wait(400);
  out.poster = {
    data: lp.dataset.poster,
    hidden: lp.querySelector(".lp__poster").hidden,
    title: lp.querySelector(".lp__poster-title")?.textContent || "",
    sub: lp.querySelector(".lp__poster-sub")?.textContent || "",
    colDisplay: computed(col, "display"),
    units: lp.querySelectorAll(".lp__u").length,
  };
  a.host.setOptions({ showLyrics: true });
  push(a, { type: "options" });
  await wait(400);
  out.posterOff = { data: lp.dataset.poster, colDisplay: computed(col, "display") };

  /* 长歌：行数再多也不许把 DOM 撑爆，版口省略号要把"没排出来的行数"标出来 */
  const MANY = Array.from({ length: 300 }, (_, i) => ({ time: i * 3000, text: "第" + (i + 1) + "句排好的字" }));
  a.host.setLines(MANY);
  push(a, { type: "lyrics" });
  await wait(500);
  out.many = {
    total: lp.dataset.total,
    pool: linesOf(a).length,
    visible: linesOf(a).filter((el) => el.dataset.off === "0").length,
    line: lp.dataset.line,
    elideTop: lp.querySelector(".lp__elide--top")?.textContent || "",
    elideBottom: lp.querySelector(".lp__elide--bottom")?.textContent || "",
    shift: prop(lp, "--lp-shift"),
  };
  a.host.setLines(LINES);
  push(a, { type: "lyrics" });
  await wait(500);

  /* 空态 */
  a.host.setLines([]);
  push(a, { type: "lyrics" });
  await wait(400);
  out.empty = {
    data: lp.dataset.empty,
    text: lp.querySelector(".lp__empty-text")?.textContent || "",
    sub: lp.querySelector(".lp__empty-sub")?.textContent || "",
    hidden: lp.querySelector(".lp__empty").hidden,
    visibleLines: linesOf(a).filter((el) => el.dataset.off === "0").length,
  };
  a.host.setLines(LINES);
  push(a, { type: "lyrics" });
  await wait(400);
  out.restored = { data: lp.dataset.empty, visible: linesOf(a).filter((el) => el.dataset.off === "0").length, line: lp.dataset.line };

  /* 暂停 → 6 秒停帧 */
  await at(a, 9000, false, 500);
  const f1 = counters.frames;
  await wait(7000);
  out.paused = { idle: lp.dataset.idle, frames: counters.frames - f1, tc: lp.querySelector(".lp__tc")?.textContent || "" };
  const f2 = counters.frames;
  await wait(900);
  out.pausedMore = counters.frames - f2;
  /* 回前台再醒 */
  push(a, { type: "state", playing: true });
  await wait(700);
  out.afterResume = { idle: lp.dataset.idle || "", frames: counters.frames - f2 };
  /* 切后台立即停帧 */
  push(a, { type: "visibility", foreground: false });
  const f3 = counters.frames;
  await wait(900);
  out.hidden = { foreground: lp.dataset.foreground, frames: counters.frames - f3 };
  push(a, { type: "visibility", foreground: true });
  const f4 = counters.frames;
  await wait(700);
  out.foreground = { frames: counters.frames - f4 };

  /* 主题补丁：换主题不该炸（浅色纸面会被压成灰纸） */
  push(a, { type: "theme", themeId: "flat-dark", mode: "dark" });
  await wait(300);
  out.theme = { mode: lp.dataset.mode, theme: lp.dataset.theme, paper: computed(lp, "background-color") };
  out.spectrumCalls = a.host.rec.spectrumCalls;
  /* 这个实例到此为止：帧计数器是**全局**的，它还开着就会把它的帧算到 B/C 头上 */
  push(a, { type: "close" });
  await wait(400);
  return out;
};

window.__scenarioB = async function () {
  /* 静态档（animations:false）：一帧都不进帧循环，但画面要完整、要中性 */
  const b = await mountInstance({ options: { animations: false } });
  await wait(700);
  const lp = b.lp;
  const out = { static: state(b) };
  out.dom = {
    pool: linesOf(b).length,
    visible: linesOf(b).filter((el) => el.dataset.off === "0").length,
    active: activeLine(b)?.dataset.i ?? "",
    units: unitsOf(b).length,
    g: gOf(b),
    lineFontSize: computed(activeLine(b), "font-size"),
    colTransition: computed(lp.querySelector(".lp__col"), "transition-duration"),
    lineTransition: computed(activeLine(b), "transition-duration"),
    leadAfter: computedAfter(unitsOf(b)[0], "display"),
  };
  /* 喂满频谱：静态档也不许动（曲线被 disabled） */
  const fBase = counters.frames;
  b.host.setSpectrum(new Float32Array(128).fill(1));
  await wait(900);
  out.neutral = {
    wt: prop(lp, "--lp-wt"), sz: prop(lp, "--lp-sz"), sp: prop(lp, "--lp-sp"),
    sk: prop(lp, "--lp-sk"), lift: prop(lp, "--lp-lift"),
    frames: counters.frames - fBase,
  };
  /* 补丁来了要画**一帧**，但不是进帧循环 */
  const f0 = counters.frames;
  b.host.setPosition(4200, true);
  push(b, { type: "progress", position: 4200, duration: 240000, playing: true });
  await wait(600);
  out.staticUpdate = { frames: counters.frames - f0, line: lp.dataset.line, lit: lp.dataset.lit, g: gOf(b) };
  const f1 = counters.frames;
  await wait(1300);
  out.staticIdleFrames = counters.frames - f1;
  /* 换行也不飞（不调 animate） */
  takeAnims();
  b.host.setPosition(9000, true);
  push(b, { type: "progress", position: 9000, duration: 240000, playing: true });
  await wait(500);
  out.staticReflow = { frames: counters.frames - f1, anims: takeAnims().length, line: lp.dataset.line, set: lp.dataset.set || "" };
  return out;
};

window.__scenarioC = async function () {
  /* 性能档 + 关闭交互 */
  const c = await mountInstance({ options: { performanceMode: "performance", interactive: false } });
  await wait(700);
  const lp = c.lp;
  const out = { perf: state(c) };
  out.cursor = computed(activeLine(c), "cursor");
  out.colTransition = computed(lp.querySelector(".lp__col"), "transition-duration");
  out.rulesFilter = computed(lp.querySelector(".lp__rules"), "filter");
  /* 限帧：按清单 30fps。**不能数 rAF 回调** —— 被限掉的那些帧照样会再排一次
     rAF（回调次数≈刷新率），那是"打了点的 rAF 没有被逐帧放行"这句谎话的来源。
     要数就数真正画了几帧：频谱是拉取式的，每个 renderFrame 恰好拉一次。 */
  const s0 = c.host.rec.spectrumCalls;
  const f0 = counters.frames;
  await wait(1000);
  out.perfRenders = c.host.rec.spectrumCalls - s0;
  out.perfRafCalls = counters.frames - f0;
  /* 性能档只剩低频轴：中高频拉满也不许动字距/斜切/抬升 */
  c.host.setSpectrum(new Float32Array(128).fill(0));
  await wait(800);
  out.perfQuiet = { wt: prop(lp, "--lp-wt"), sp: prop(lp, "--lp-sp"), sk: prop(lp, "--lp-sk"), lift: prop(lp, "--lp-lift") };
  const high = new Float32Array(128).fill(0);
  for (let i = 13; i < 128; i += 1) high[i] = 1;
  c.host.setSpectrum(high);
  await wait(900);
  out.perfHigh = { wt: prop(lp, "--lp-wt"), sp: prop(lp, "--lp-sp"), sk: prop(lp, "--lp-sk"), lift: prop(lp, "--lp-lift") };
  c.host.setSpectrum(new Float32Array(128).fill(1));
  await wait(900);
  out.perfLow = { wt: prop(lp, "--lp-wt"), sz: prop(lp, "--lp-sz") };
  /* 交互关闭：点了不 seek */
  c.host.setPosition(8100, true);
  push(c, { type: "progress", position: 8100, duration: 240000, playing: true });
  await wait(700);
  lp.querySelector('.lp__line[data-i="3"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  out.seeks = c.host.rec.seeks.slice();

  /* 窄窗口 */
  c.host.setSize(820, 560);
  stage.style.width = "820px";
  stage.style.height = "560px";
  push(c, { type: "resize" });
  await wait(700);
  out.narrow = {
    data: lp.dataset.narrow,
    fit: prop(lp, "--lp-fit"),
    leading: prop(lp, "--lp-leading"),
    base: prop(lp, "--lp-base"),
    pageScroll: document.documentElement.scrollWidth - window.innerWidth,
    active: { top: topOf(activeLine(c)), w: Math.round(activeLine(c).getBoundingClientRect().width), fontSize: computed(activeLine(c), "font-size") },
    sheetWidth: Math.round(lp.querySelector(".lp__sheet").getBoundingClientRect().width),
  };

  /* 宿主字号设置必须被尊重（曲线只是乘上去的相对量） */
  c.host.setOptions({ lyricsFontSize: 40 });
  c.host.setSize(1100, 700);
  stage.style.width = "1100px";
  stage.style.height = "700px";
  push(c, { type: "options" });
  await wait(500);
  out.hostSize = { base: prop(lp, "--lp-base"), fontSize: computed(activeLine(c), "font-size"), read: lp.querySelector(".lp__read")?.textContent || "" };
  c.host.setOptions({ lyricsFontSize: 21 });
  push(c, { type: "options" });
  await wait(300);
  out.dpr = lp.dataset.dpr;
  return out;
};

window.__scenarioD = async function () {
  /* 卸载：舞台要清干净，宿主的背景容器**一个字节都不该被我们碰过**。
     两个前提：
       · 皮肤模块是**单例**（S 只记最后一个挂载的实例，真机一次只挂一个样式），
         所以前面的实例只能发 close 停帧、由自检自己摘掉挂载点，不能去 destroy 它们
         （那会 destroy 到当前这个实例上 —— 这是最容易"假绿"的一种写法）；
       · 帧计数器是全局的，前几个实例必须停掉，否则帧会被算到 D 头上。 */
  for (const other of INSTANCES.slice(0, -1)) {
    push(other, { type: "close" });
    other.root.remove();
  }
  // 兜底清一次舞台：单例皮肤被"跨实例"发补丁时会把内部 ctx 指到别的实例上
  // （update 的 ctx 变更处理），所以前面的挂载点由自检自己负责摘干净 —— 判据是
  // **本实例**的挂载点是否真的断开，而不是"舞台上有没有别人的东西"
  for (const el of stage.querySelectorAll(":scope > div")) el.remove();
  await wait(300);
  const d = await mountInstance({ options: {} });
  await wait(700);
  const bgBefore = bgRoot.children.length;
  const lp = d.lp;
  lp.querySelector('.lp__line[data-i="3"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  takeAnims();
  const before = counters.frames;
  const ctx = d.host.ctx;
  const lpEl = lp; // destroy 之后要能证明**这个**节点已经脱离文档
  skin.destroy(ctx);
  await wait(800);
  const rootConnected = d.root.isConnected; // 宿主的挂载点：皮肤只清空它，**不该删它**
  const lpConnected = lpEl.isConnected; // 皮肤自己那棵树：destroy 后必须脱离文档
  d.root.remove(); // 宿主摘掉挂载点（真机上就是这一步）
  const out = {
    stageChildren: stage.querySelectorAll(":scope > div").length,
    rootConnected,
    lpConnected,
    rootHtml: d.root.innerHTML,
    hasLp: !!d.root.querySelector(".lp"),
    bgChildrenBefore: bgBefore,
    bgChildrenAfter: bgRoot.children.length,
    bgHidden: bgRoot.hidden === true,
    pageAnims: document.getAnimations().length,
    framesAfter: counters.frames - before,
  };
  let threw = "";
  try {
    skin.update(ctx, { type: "progress", position: 1000, playing: true });
    skin.update(ctx, { type: "lyrics" });
    skin.update(ctx, { type: "resize" });
  } catch (err) {
    threw = String(err && err.message ? err.message : err);
  }
  out.updateAfterDestroy = threw;
  return out;
};

window.__report = { counters: window.__counters, errors: [] };
window.__sceneErrors = window.__report.errors;

/** 用本包的纯逻辑核对上报的对比度（自检不许自己抄一份算法） */
function inkContrast(pal) {
  return pal ? INK.contrast(pal.bg, pal.fg) : 0;
}
const INK = await import("/lib/ink.js");
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(ok, name, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "[OK ]" : "[!! ]"} ${name}${detail ? `  → ${detail}` : ""}`);
}
const j = (v) => (typeof v === "string" ? v : JSON.stringify(v));
const brief = (e) => ({ error: String(e && e.message ? e.message : e) });
const num = (v) => Number(v);
/** CSS 长度（"--lp-leading: 54px" 这类是带单位的字符串，Number() 会得到 NaN） */
const px = (v) => parseFloat(String(v));
const deg = (v) => parseFloat(String(v));

if (!EDGE) {
  console.error("找不到 msedge.exe —— 这一项自检需要本机装 Edge（系统自带）。");
  check(false, "本机有 Edge", "未找到 msedge.exe");
  server.close();
  process.exitCode = 1;
} else {
  const OUT = join(tmpdir(), "letterpress-check-" + Date.now());
  mkdirSync(OUT, { recursive: true });
  // 随机端口：上一次跑挂了留下的 Edge 可能还占着固定端口，CDP 会连到旧进程上
  const CDP_PORT = 9500 + Math.floor(Math.random() * 400);
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
      "--window-size=1200,760",
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
    check(false, "无头 Edge 起来并接上 CDP", "");
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

    // 在页面**最前面**把 rAF 换成可控定时器（只数帧；这一款不需要人为拖帧）
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          const counters = { frames: 0 };
          window.__counters = counters;
          const raf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (cb) => raf((t) => { counters.frames += 1; cb(t); });
        })();
      `,
    });

    // 固定视口：headless 新档有时给 0×0 的默认窗口，那样页面根本没排版、rAF 也不跑
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

    if (ready !== true) {
      console.error("页面没准备好：", j(ready));
      check(false, "自检页面加载", j(ready));
    } else {
      /* ---------------- 场景 A ---------------- */
      console.log("\n[1] 挂载 / 结构 / 宿主的 @layer+@scope 之后样式是否真的生效");
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
        check(M.hasLp === true, "样式能挂载并渲染");
        check(M.children.join("|") === "lp__paper|lp__sheet|lp__empty|lp__hud", "舞台根里四层齐全（纸/版面/空态/HUD）", j(M.children));
        check(M.sheetChildren.join("|") === "lp__elide lp__elide--top|lp__col|lp__elide lp__elide--bottom|lp__poster", "版面区四层齐全（上省略/列/下省略/海报）", j(M.sheetChildren));
        check(M.pool === 81, "行池 = 2×40+1（默认 81，DOM 数量与歌词行数无关）", j(M.pool));
        check(M.visible === 5, "窗口内的行都排出来了", j(M.visible));
        check(M.slots.startsWith("0,1,2,3,4"), "槽位号在建池时写死（不做每行每帧的写）", j(M.slots));
        check(M.slotStyles.every((s) => s.includes("--slot")) && M.slotStyles[0].includes("--slot: 0"), "换歌词之后 --slot 仍在（清掉它整页会叠在一起）", j(M.slotStyles));
        check(
          M.tops.slice(0, 3).every((t) => t > 0 && t < 700) && M.tops[1] - M.tops[0] === 54 && M.tops[2] - M.tops[1] === 54,
          "五行按行高依次落位（54px 一个槽位，没有叠在一起）",
          j(M.tops)
        );
        check(Math.abs(M.tops[0] - M.colTop) <= 1, "第 0 行落在列的基准位置上（位移是 transform，不动布局）", j([M.tops[0], M.colTop]));
        check(M.title === "旧梦一场", "HUD 曲名在", j(M.title));
        check(/^§ \d+ \/ 5$/.test(M.num), "行号「§ n / N」在 DOM 上", j(M.num));
        check(/^字 \d+\.\d · \d+$/.test(M.read), "字号读数在 DOM 上（字 21.0 · 500）", j(M.read));
        check(/^\d\d:\d\d \/ \d\d:\d\d$/.test(M.tc), "时间码在 DOM 上", j(M.tc));
        check(M.elideTop === "" && M.elideBottom === "", "短歌没有没排出来的部分（版口省略号为空）", j([M.elideTop, M.elideBottom]));
        check(M.posterHidden === true, "歌词模式下海报是收着的", j(M.posterHidden));
        check(M.paper === "rgb(242, 239, 231)", "纸白来自清单 colors 并穿过 @scope 生效（读 computed）", j(M.paper));
        check(px(M.lineFontSize) >= 15 && px(M.lineFontSize) <= 30, "正文行有真实字号（布局没塌）", j(M.lineFontSize));
        check(/matrix\(1, 0, 0, 1/.test(M.colTransform), "列的位移真的落在了 transform 上", j(M.colTransform));
        check(M.colTransition !== "0s", "平滑档有分页过渡（420ms）", j(M.colTransition));
        check(M.lineTransform !== "none" && M.lineTransform.includes("matrix"), "当前行带着斜切/抬升的 transform", j(M.lineTransform));
        check(M.rulesFilter.includes("blur"), "纸纹那一层有模糊（唯一的 filter）", j(M.rulesFilter));
        check(M.bodyFilter === "none", "正文整层零滤镜（字必须矢量清晰）", j(M.bodyFilter));
        check(M.stageOverflow === "hidden", "舞台裁掉排出版面的行（overflow:hidden）", j(M.stageOverflow));
        check(M.data.perf === "0" && M.data.animations === "1" && M.data.interactive === "1" && M.data.showLyrics === "1", "状态属性与设置一致", j(M.data));
        check(px(M.vars.base) === 21 && px(M.vars.leading) === 54 && px(M.vars.move) === 420, "基准字号/行高/过渡时长都写进了变量", j(M.vars));
        check(/^#[0-9a-f]{6}$/i.test(M.vars.spot) && M.vars.spot.toLowerCase() !== "#a8452c", "专色已经从封面取出来了（不是清单兜底色）", j(M.vars.spot));
        const U = A.unitScope;
        check(U.linesWithUnits === 1, "**只有当前行**切成逐字素 span", j(U));
        check(U.activeUnits === 6 && U.activeText === "活字排版开场", "当前行的字素数与其文字一致", j([U.activeUnits, U.activeText]));
        check(U.otherUnits === 0, "其余行是纯文本（没有 span）", j(U.otherUnits));
        check(U.totalUnits === 6, "页面上总共只有当前行那些 span", j(U.totalUnits));
        check(U.deps.split(",").slice(0, 3).join(",") === "0,1,2", "离当前行的距离写进了 data-depth（越远越小越淡）", j(U.deps));

        console.log("\n[2] 排版曲线（频谱 → 字号/字重/字距/斜切）");
        check(num(A.early.line) === 0 && A.early.g.length === 6, "挂载后停在第 0 行且切了 6 个字素", j(A.early));
        check(A.early.g.filter((v) => v > 0).length >= 1 && A.early.g.filter((v) => v > 0).length <= 3, "开头只亮了开头的字素（不是整行一起亮）", j(A.early.g));
        check(px(A.loud.wt) > px(A.quiet.wt), "低频把字重压上去（满频谱 > 静音）", j([A.quiet.wt, A.loud.wt]));
        check(px(A.loud.sz) > px(A.quiet.sz), "低频把字号放大", j([A.quiet.sz, A.loud.sz]));
        check(px(A.loud.sp) > px(A.quiet.sp), "中频把字距排松", j([A.quiet.sp, A.loud.sp]));
        check(deg(A.loud.sk) < deg(A.quiet.sk) && deg(A.loud.sk) < 0, "高频给出斜切（更负）", j([A.quiet.sk, A.loud.sk]));
        check(px(A.loud.lift) > px(A.quiet.lift), "中频把基线顶起来", j([A.quiet.lift, A.loud.lift]));
        check(px(A.quiet.wt) === 300 && deg(A.quiet.sk) === 0 && px(A.quiet.lift) === 0, "静音时是干净的第一版（无斜切无抬升）", j(A.quiet));
        check(px(A.loud.fontSize) > px(A.quiet.fontSize), "字号变化真的穿过 CSS 生效（computed font-size）", j([A.quiet.fontSize, A.loud.fontSize]));
        check(String(A.loud.letterSpacing).includes("px") && px(A.loud.letterSpacing) > 0, "字距真的生效（computed letter-spacing）", j(A.loud.letterSpacing));
        check(num(A.loud.fontWeight) >= 700, "字重真的生效（computed font-weight）", j(A.loud.fontWeight));
        check(/matrix\(1, 0, 0, 1/.test(A.quiet.transform) === false || A.loud.transform !== A.quiet.transform, "当前行的斜切/抬升随频谱变", j([A.quiet.transform, A.loud.transform]));
        check(A.late.g.filter((v) => v === 1).length > A.early.g.filter((v) => v === 1).length, "逐字进度往后走了", j([A.early.g, A.late.g]));
        check(A.late.g.every((v) => v >= 0 && v <= 1), "逐字档位都在 0..1", j(A.late.g));

        console.log("\n[3] 换行 = 一次活字重排（FLIP）");
        const R = A.reflow;
        const flip = (R.anims || []).filter((x) => String(x.cls).includes("lp__u"));
        check(flip.length >= 1, "换行时真的播了 FLIP（拦到了 animate 调用）", j(R.anims?.slice(0, 2)));
        check(flip.length === 0 || flip.every((x) => x.props === "opacity,transform"), "FLIP 只动 transform/opacity（不碰布局属性）", j(flip[0]));
        check(flip.every((x) => num(x.duration) >= 280 && num(x.duration) <= 560), "重排时长在 280..560ms（按字数）", j(flip.map((x) => x.duration).slice(0, 3)));
        check(num(R.line) === 1, "行号推进到第 2 行", j(R.line));
        check(R.set === "1", "换行时进入「刚排好」状态（铅块短暂显形）", j(R.set));
        check(px(R.shiftAfter) === px(R.shiftBefore) - 54, "列上移一个行高（分页推进）", j([R.shiftBefore, R.shiftAfter]));
        const S = A.reflowSettled;
        check(Math.abs(S.topAfter - S.topBefore) <= 3, "当前行换行后仍停在版面中央（读者不会看丢）", j([S.topBefore, S.topAfter]));
        check(S.set === "", "「刚排好」状态会自动退掉", j(S.set));
        check(S.float.split(",")[1] === "1/1" && S.float.split(",")[4] === "0.835/0.22", "越远的行越小越淡（深度样式真的写下去了）", j(S.float));
        check(num(A.fallback.line) === 2 && A.fallback.g.length === 7 && A.fallback.g.every((v) => v === 1), "没有 words 的行整行一起亮（且字素数正确）", j([A.fallback.line, A.fallback.g]));

        console.log("\n[4] 交互 / 取色 / 形态切换");
        check(A.seeks.length === 1 && A.seeks[0] === 26000, "点某一行 seek 到那一句", j({ seeks: A.seeks, clicked: A.clicked }));
        check(A.seeksAfterHud.length === 1, "点 HUD 不触发 seek", j(A.seeksAfterHud));
        check(A.seeksAfterBlank.length === 1, "点没有歌词的槽位不触发 seek", j(A.seeksAfterBlank));
        check((A.backdrops || []).length >= 1, "reportBackdrop 上报了", j(A.backdrops));
        check(A.backdrops?.[0]?.bg === "#f2efe7" && A.backdrops?.[0]?.fg === "#171610", "上报的纸白/墨黑与清单一致（固定不随封面变）", j(A.backdrops?.[0]));
        check(/^#[0-9a-f]{6}$/i.test(A.backdrops?.[0]?.accent || ""), "上报带一个专色 accent", j(A.backdrops?.[0]?.accent));
        check(A.contrast >= 3.9, "上报的 bg/fg 对比度达标", j(A.contrast));
        check(A.coverSwapped.reported === true && A.coverSwapped.accent !== A.backdrops?.[0]?.accent, "换封面后重新取专色并再上报一次（专色跟着封面变）", j(A.coverSwapped));
        check(A.poster.data === "1" && A.poster.colDisplay === "none" && A.poster.units === 0, "showLyrics:false → 切成排版海报并收起歌词列", j(A.poster));
        check(A.poster.title === "旧梦一场" && A.poster.sub === "某歌手", "海报上有曲名与歌手", j([A.poster.title, A.poster.sub]));
        check(A.posterOff.data === "0" && A.posterOff.colDisplay !== "none", "歌词开关切回来就恢复版面", j(A.posterOff));
        check(A.empty.data === "1" && A.empty.text === "暂无歌词" && A.empty.sub === "旧梦一场", "无歌词时显示空态（提示语也走排版）", j(A.empty));
        check(A.empty.visibleLines === 0, "空态下没有排出来的行", j(A.empty.visibleLines));
        check(A.restored.data === "0" && A.restored.visible === 5, "歌词回来后正常恢复", j(A.restored));
        check(num(A.many.total) === 300 && A.many.pool === 81, "300 行的长歌：行池仍是 81（DOM 与行数无关）", j([A.many.total, A.many.pool]));
        check(A.many.visible === 81, "长歌里只排出窗口内那 81 行", j(A.many.visible));
        check(A.many.elideTop === "" && /^后 \d+ 行 ⋯$/.test(A.many.elideBottom), "版口省略号标出后面还有多少行没排", j([A.many.elideTop, A.many.elideBottom]));
        check(px(A.many.shift) <= 0 && px(A.many.shift) % 54 === 0, "长歌的列位移是行高的整数倍（分页推进不会漂）", j(A.many.shift));
        check(A.theme.mode === "dark" && A.theme.theme === "flat-dark", "主题补丁换掉了模式标记", j(A.theme));
        check(A.theme.paper === "rgb(242, 239, 231)", "深色主题下纸面**不变**（印好的纸不随房间灯变，对比度不会被做坏）", j(A.theme.paper));
        check(A.spectrumCalls > 30, "频谱是**拉取式**调用（每帧拉一次，不是等推送）", j(A.spectrumCalls));

        console.log("\n[5] 暂停 / 停帧 / 前后台");
        check(num(A.paused.idle) === 1, "暂停 6 秒后进入停帧状态（data-idle）", j(A.paused));
        check(A.pausedMore <= 2, "停帧后确实不再画", j(A.pausedMore));
        check(A.afterResume.frames > 3 && A.afterResume.idle === "", "重新播放后帧循环醒过来", j(A.afterResume));
        check(A.hidden.foreground === "0" && A.hidden.frames <= 2, "切后台立即停帧", j(A.hidden));
        check(A.foreground.frames > 3, "回前台再醒", j(A.foreground));

        /* ---------------- 场景 B ---------------- */
        console.log("\n[6] 静态档（animations:false）");
        let B;
        try {
          B = await evaluate("window.__scenarioB()");
        } catch (e) {
          B = brief(e);
        }
        if (B?.__error || B?.error) {
          check(false, "场景 B 跑通", j(B.__error || B.error));
        } else {
          check(num(B.static.frames) >= 0 && B.static.animations === "0", "静态档标记正确", j(B.static));
          check(B.dom.pool === 81 && B.dom.visible === 5, "静态档仍然建出完整版面", j([B.dom.pool, B.dom.visible]));
          check(B.dom.active === "0" && B.dom.units === 6, "静态档也标出当前行并切了字素", j([B.dom.active, B.dom.units]));
          check(B.dom.g.every((v) => v >= 0 && v <= 1) && B.dom.g.length === 6, "静态档的逐字档位是有效的", j(B.dom.g));
          check(B.dom.colTransition === "0s" && B.dom.lineTransition === "0s", "静态档关掉所有过渡", j([B.dom.colTransition, B.dom.lineTransition]));
          check(B.dom.lineFontSize !== "0px" && px(B.dom.lineFontSize) > 10, "静态档版面有真实尺寸", j(B.dom.lineFontSize));
          check(B.neutral.frames === 0, "静态档没有任何 rAF 帧", j(B.neutral));
          check(px(B.neutral.wt) === 500 && deg(B.neutral.sk) === 0 && px(B.neutral.lift) === 0, "静态档给中性版式（喂满频谱也不动）", j(B.neutral));
          check(B.staticUpdate.frames === 0 && num(B.staticUpdate.line) === 0 && B.staticUpdate.g.some((v) => v > 0), "补丁来了立刻重画（同步画完，不进帧循环）", j(B.staticUpdate));
          check(B.staticIdleFrames === 0, "静态档长时间也不会有帧", j(B.staticIdleFrames));
          check(B.staticReflow.anims === 0 && num(B.staticReflow.line) === 1, "静态档换行不飞（不调 animate）但行号照走", j(B.staticReflow));
        }

        /* ---------------- 场景 C ---------------- */
        console.log("\n[7] 性能档 / 宿主字号 / 窄窗口");
        let C;
        try {
          C = await evaluate("window.__scenarioC()");
        } catch (e) {
          C = brief(e);
        }
        if (C?.__error || C?.error) {
          check(false, "场景 C 跑通", j(C.__error || C.error));
        } else {
          check(C.perf.perf === "1" && C.perf.interactive === "0", "性能档与关闭交互的标记都在", j(C.perf));
          check(C.perfRenders >= 20 && C.perfRenders <= 44, "按清单 30fps 限帧（数的是真画了几帧，不是 rAF 回调）", j({ renders: C.perfRenders, rafCalls: C.perfRafCalls }));
          check(px(C.perfQuiet.sp) === -0.012 && deg(C.perfQuiet.sk) === 0 && px(C.perfQuiet.lift) === 0, "性能档静音时字距/斜切/抬升都锁在中性值", j(C.perfQuiet));
          check(C.perfHigh.sp === C.perfQuiet.sp && C.perfHigh.sk === C.perfQuiet.sk && C.perfHigh.lift === C.perfQuiet.lift, "性能档里中高频**完全不动**（只剩低频轴）", j(C.perfHigh));
          check(px(C.perfLow.wt) > px(C.perfQuiet.wt) && px(C.perfLow.sz) > 1, "性能档的低频轴照常工作", j(C.perfLow));
          check(C.cursor === "default" && C.seeks.length === 0, "interactive:false 时不可点、也不 seek", j([C.cursor, C.seeks]));
          check(C.narrow.data === "1", "窄窗口标记生效", j(C.narrow.data));
          check(px(C.narrow.fit) < 1 && px(C.narrow.fit) >= 0.7, "窄窗口收敛了曲线幅度", j(C.narrow.fit));
          check(px(C.narrow.leading) === 44, "窄窗口把行高压到 44px", j(C.narrow.leading));
          check(px(C.narrow.base) === 21, "宿主字号没有被版面改动（曲线只是相对量）", j(C.narrow.base));
          check((C.narrow.pageScroll ?? 99) <= 1, "窄窗口下页面没有横向滚动", j(C.narrow.pageScroll));
          check(C.narrow.active.w > 100 && C.narrow.active.w < 900, "窄窗口下当前行仍是有尺寸的（布局没塌）", j(C.narrow.active));
          check(px(C.hostSize.base) === 40 && px(C.hostSize.fontSize) > 30, "宿主把字号调到 40 时正文跟着变大", j(C.hostSize));
          check(/^字 4\d\.\d · /.test(C.hostSize.read), "字号读数跟着宿主设置走", j(C.hostSize.read));
          check(["1", "2"].includes(C.dpr), "dpr 属性跟着环境走", j(C.dpr));
        }

        /* ---------------- 场景 D ---------------- */
        console.log("\n[8] 卸载（舞台清干净 + 不越权碰宿主的背景容器）");
        let D;
        try {
          D = await evaluate("window.__scenarioD()");
        } catch (e) {
          D = brief(e);
        }
        if (D?.__error || D?.error) {
          check(false, "场景 D 跑通", j(D.__error || D.error));
        } else {
          check(D.rootConnected === true, "皮肤没有去删宿主给的挂载点（清空是自己的事，摘节点是宿主的）", j(D.rootConnected));
          check(D.hasLp === false && D.rootHtml === "" && D.lpConnected === false, "自己那棵树清空并脱离文档（.lp 已经不在了）", j([D.hasLp, D.rootHtml, D.lpConnected]));
          check(D.stageChildren === 0, "宿主摘掉挂载点后舞台上什么都不剩", j(D.stageChildren));
          check(D.bgChildrenBefore === 0 && D.bgChildrenAfter === 0, "宿主的背景容器一个字节都没被碰过（background:false）", j([D.bgChildrenBefore, D.bgChildrenAfter]));
          check(D.framesAfter <= 2, "destroy 之后不再有帧", j(D.framesAfter));
          check(D.pageAnims === 0, "destroy 之后没有残留的 WAAPI 动画", j(D.pageAnims));
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
}
