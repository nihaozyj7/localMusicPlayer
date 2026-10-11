/* ==========================================================================
   pulse · 浏览器自检（自带静态服务 + 假宿主 + 无头 Edge，走 CDP）
   --------------------------------------------------------------------------
   跑法：node plugins/style/pulse/tests/pulse-check.mjs

   这一款不能只测 DOM 长得对不对 —— 它的核心是**同步与预测**，所以自检里有三件
   必须真的量出来的事：

     1. 合成 onset 流（每 500ms 一次宽带突变）喂进去，PLL 是否真的收敛到 120BPM，
        拍点网格是否真的按 500ms 的间距落在屏幕上（量 DOM 的 rect）；
     2. 字级刻度是否真的**吸**到拍点上（吸附过的刻度与拍点标记的 rect 必须重合）；
     3. 换歌那种"抖动的间隔"是否真的落到 free（而不是编一个 BPM 出来）。

   歌词用的是宿主的**真模块**（`frontend/packages/player-skins/src/lyrics-view.js`），
   按 /sdk/ 路由托管 —— 因为这一款是第一个真的调 `ctx.sdk.createLyricsView` 的样式包，
   假一个替身就等于没验过它。

   皮肤模块是单例（`S` 指向最后一次挂载的实例），所以每个场景都**新挂一个**实例，
   并且不 destroy 别人的实例（那会 destroy 掉当前这个）。
   ========================================================================== */

import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { extname, join, resolve, dirname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..", "..");
const SDK_ROOT = join(REPO_ROOT, "frontend", "packages", "player-skins", "src");

/** 对比度 / 颜色 / 时间码判定借本包的纯逻辑（自检不许抄一份算法，抄的那份会跟着漂） */
const scLib = await import(pathToFileURL(join(PKG_ROOT, "lib", "scope.js")).href);
const MANIFEST = JSON.parse(readFileSync(join(PKG_ROOT, "skin.json"), "utf8"));

/** WCAG 对比度（颜色解析走本包的 hexToRgb） */
function wcag(bgHex, fgHex) {
  const lum = (hex) => {
    const [r, g, b] = scLib.hexToRgb(hex, [0, 0, 0]);
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const l1 = lum(bgHex);
  const l2 = lum(fgHex);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

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
 *   第 0 行 6 个字素，字级时刻**故意偏在拍点后 40ms**（合成拍点是 500ms 一拍）——
 *     锁定之后这 6 个刻度必须全部吸附（data-snap="1"），且与拍点标记重合；
 *   第 1 行 5 个字素（与第 0 行字素数不同）；
 *   第 2 行没有 words（刻度一条都不该画 —— 不猜字素时刻）；
 *   第 3/4 行在很后面（验窗口外不画）。
 */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>pulse check</title>
<style>
  html, body { margin: 0; background: #202020; }
  /* 宿主歌词骨架（components/lyrics.css 的最小同义版）：SDK 只管语义，排版交宿主与样式包 */
  .lyrics { position: absolute; inset: 0; }
  .lyrics .lyrics__scroll { position: absolute; inset: 0; overflow-y: auto; }
  .playerview { position: fixed; left: 0; top: 0; width: 1100px; height: 700px; }
  .playerview__stage { position: relative; height: 100%; overflow: hidden; }
  .skin-bg { position: fixed; left: 0; top: 0; right: 0; bottom: 0; }
</style>
</head>
<body>
<div class="skin-bg" data-skin="pulse"></div>
<div class="playerview" data-skin="pulse"><div class="playerview__stage" id="stage"></div></div>
<script type="module">
import skin from "/skin.js";
/* 宿主的真歌词视图（按 /sdk/ 路由托管整个 player-skins/src） */
const SDK = await import("/sdk/lyrics-view.js?t=check");
/* 本包自己的几何工具：画布内边距要取真值，不能自检里再抄一份 */
const SCL = await import("/lib/scope.js");

const stage = document.getElementById("stage");
const bgRoot = document.querySelector(".skin-bg");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = (el, name) => (el ? el.style.getPropertyValue(name).trim() : "");
const computed = (el, name) => (el ? getComputedStyle(el).getPropertyValue(name).trim() : "");
const computedAfter = (el, name) => (el ? getComputedStyle(el, "::after").getPropertyValue(name).trim() : "");
const px = (v) => parseFloat(String(v));
/** computed 的时长可能是 "4s" 也可能是 "4000ms" */
const ms = (v) => (/ms$/i.test(String(v)) ? parseFloat(v) : parseFloat(v) * 1000);
const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };

/* 按宿主的方式加载样式：@layer skin + @scope(舞台根)（清单 background:false，所以没有 .skin-bg 那一份） */
const cssText = await (await fetch("/skin.css")).text();
const styleEl = document.createElement("style");
styleEl.textContent = '@layer skin { @scope (.playerview[data-skin="pulse"]) { ' + cssText + ' } }';
document.head.appendChild(styleEl);

/* ---- 合成频谱：宽带脉冲（"鼓点"）与安静底噪 ---- */
const N = 128;
const LOUD = new Float32Array(N).fill(1);
const QUIET = new Float32Array(N).fill(0.01);

/** 每 periodMs 一次 40ms 宽的宽带脉冲（**按歌曲位置**对齐 —— 真音乐里的鼓点也是按歌曲走的） */
function beatProvider(periodMs, offsetMs) {
  const off = offsetMs || 0;
  return (songMs) => {
    const ph = (songMs - off) % periodMs;
    return ph >= 0 && ph < 40 ? LOUD : QUIET;
  };
}

/** 间隔忽长忽短（180..900ms）—— 这是"散板"，必须判 free。
    时刻是**相对第一次取谱**算的（不是相对页面加载）：否则同一页里晚挂的实例
    会拿到一整条已经过去的时刻表，永远等不到 onset。 */
const RANDOM_GAP = [180, 640, 330, 900, 250, 730, 420, 880, 210, 690];
function randomProvider() {
  let base = null;
  let at = null;
  return (songMs) => {
    if (base === null) {
      base = songMs;
      at = [];
      let acc = 0;
      for (const p of RANDOM_GAP) {
        acc += p;
        at.push(acc);
      }
    }
    const t = songMs - base;
    let last = -1000;
    for (const s of at) {
      if (s <= t) last = s;
      else break;
    }
    return t - last < 40 ? LOUD : QUIET;
  };
}

/** 第 0 行 7 个字素（"心跳开场第一句"），字级时刻故意偏在合成拍点后 40ms */
const LINES = [
  { time: 0, text: "心跳开场第一句", words: [40, 540, 1040, 1540, 2040, 2540, 3040] },
  { time: 8000, text: "第二句来了", words: [8040, 9040, 10040, 11040, 12040] },
  { time: 14000, text: "这一句没有逐字" },
  { time: 26000, text: "隔了很久的一句" },
  { time: 40000, text: "最后一句" },
];

function createHost(o) {
  const rec = { seeks: [], backdrops: [], spectrumCalls: 0 };
  const opt = Object.assign(
    { showLyrics: true, interactive: true, animations: true, performanceMode: "smooth" },
    o.options || {}
  );
  const media = {
    song: { id: "song-1", title: "脉搏测试曲", artist: "某歌手", album: "某专辑", duration: 240000, kind: "local" },
    cover: "",
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
  let pbAt = performance.now();
  let spec = o.spectrum || null;
  let dpr = o.dpr || 1;
  let w = 1100, h = 700;
  let fg = true;

  const ctx = {
    root: o.root,
    backgroundRoot: bgRoot,
    defaultCover: "",
    mode: "dark",
    interactive: true,
    env: () => ({ width: w, height: h, dpr, reducedMotion: !!o.reducedMotion, foreground: fg }),
    options: () => opt,
    media: () => media,
    track: () => media.song,
    lyrics: () => media.lyrics,
    covers: () => ({ current: media.cover, list: [], index: 0 }),
    playback: () => pb,
    spectrum: () => {
      rec.spectrumCalls += 1;
      /* 取谱时按皮肤同一套办法估一下"此刻的歌曲位置"：
         宿主 4Hz 推进度，中间外推 —— 合成鼓点要对齐的是**歌曲时间**（真鼓点也是） */
      const songMs = pb.position + (pb.playing ? Math.min(Math.max(performance.now() - pbAt, 0), 1200) : 0);
      const v = typeof spec === "function" ? spec(songMs) : spec;
      return v ? { bands: v, at: songMs } : null;
    },
    sdk: {
      /* 真的宿主模块：这一款是第一个真的用它造歌词的样式包 */
      createLyricsView: (host, opts) => SDK.createLyricsView(host, opts),
      splitGraphemes: (t) => Array.from(String(t == null ? "" : t)),
      html: { escapeHtml: (s) => String(s == null ? "" : s) },
      manifest: {
        id: "pulse",
        colors: { bg: "#05070a", fg: "#7cfc9b", accent: "#7cfc9b" },
        performance: { budgetFps: 60 },
      },
      util: { clamp: (v, a, b) => Math.min(b, Math.max(a, v)) },
    },
    actions: {
      seek: (ms) => rec.seeks.push(ms),
      openFolder: () => rec.seeks.push("folder"),
      reportBackdrop: (pal) => rec.backdrops.push(pal),
    },
  };

  return {
    ctx, rec, media, pos: pb,
    setSize: (nw, nh) => { w = nw; h = nh; },
    setOptions: (patch) => Object.assign(opt, patch),
    setSpectrum: (bands) => { spec = bands; },
    setPosition: (p, playing) => {
      pb.position = p;
      pbAt = performance.now();
      pb.playing = playing === undefined ? pb.playing : playing;
    },
    setLines: (lines) => { media.lyrics.lines = lines; },
    setForeground: (v) => { fg = v; },
  };
}

/* 帧计数用**注入脚本**里那个对象（它在页面最前面给 rAF 打了点） */
const counters = window.__counters || { frames: 0 };

/* mount 是 async 的（它要先加载子模块），必须 await。
   皮肤模块是**单例**（S 指向最后一次挂载的实例），所以：
     · 新挂一个之前，先给"当前这个"发 close 把它的帧循环停掉（此刻 S 还指向它）——
       否则旧实例的 rAF 会一直跑，全局帧计数就没法用来判断"静态档零帧"；
     · 不要 destroy 别人的实例（那会 destroy 掉当前这个）。 */
const INSTANCES = [];
async function mountInstance(o) {
  const prev = INSTANCES[INSTANCES.length - 1];
  if (prev) push(prev, { type: "close" });
  const root = document.createElement("div");
  /* 真机上挂载点是铺满舞台的（position:absolute; inset:0）；
     这里必须照做，否则 .pl 的 inset:0 会算成 0 */
  root.style.cssText = "position:absolute;inset:0";
  stage.appendChild(root);
  const host = createHost(Object.assign({ root }, o));
  await skin.mount(host.ctx);
  const inst = { root, host, pl: root.querySelector(".pl") };
  INSTANCES.push(inst);
  return inst;
}

function push(inst, patch) {
  skin.update(inst.host.ctx, patch);
}

/** 走一步进度 */
async function at(inst, ms, playing, settle) {
  const p = playing === undefined ? true : playing;
  inst.host.setPosition(ms, p);
  push(inst, { type: "progress", position: ms, duration: 240000, playing: p });
  await wait(settle === undefined ? 200 : settle);
}

/**
 * 让时间"真的往前走"。
 * 皮肤的位置钟是**外推**的：宿主按 ~4Hz 推进度补丁，中间靠 position + (now − at) 补，
 * 并且外推有上限（1.2 秒）。测试里干等 3 秒什么都不推，位置钟 1.2 秒后就冻住了 ——
 * 那不是皮肤的问题，是假宿主不像真宿主。所以这里按真宿主的方式一边等一边推。
 */
async function play(inst, ms, step = 50) {
  const t0 = performance.now();
  const p0 = inst.host.pos.position;
  let left = ms;
  while (left > 0) {
    const dt = Math.min(step, left);
    await wait(dt);
    left -= dt;
    const pb = inst.host.pos;
    /* 位置按**真实经过的时间**走（不是"每步加 50"）：setTimeout 会漂，
       累加名义步长会让歌曲钟比墙上钟慢，测出来的 BPM 就成了 132。
       走 setPosition 是为了让假宿主也更新"最后一次推进度"的时刻（取谱时要外推）。 */
    inst.host.setPosition(p0 + (performance.now() - t0), true);
    push(inst, { type: "progress", position: pb.position, duration: 240000, playing: true });
  }
}

const marksOf = (inst) => Array.from(inst.pl.querySelectorAll(".pl__beat")).filter((el) => el.dataset.off === "0");
const ticksOf = (inst) => Array.from(inst.pl.querySelectorAll(".pl__tick")).filter((el) => el.dataset.off === "0");
const lyricsRoot = (inst) => inst.pl.querySelector(".pl__lyrics .lyrics");
const lyricRows = (inst) => Array.from(inst.pl.querySelectorAll(".pl__lyrics .lyric"));
const scopeRect = (inst) => inst.pl.querySelector(".pl__scope").getBoundingClientRect();

function state(inst) {
  const pl = inst.pl;
  return {
    beat: pl.dataset.beat, flash: pl.dataset.flash, playing: pl.dataset.playing, idle: pl.dataset.idle,
    perf: pl.dataset.perf, animations: pl.dataset.animations, interactive: pl.dataset.interactive,
    narrow: pl.dataset.narrow, dpr: pl.dataset.dpr, total: pl.dataset.total, empty: pl.dataset.empty,
    line: pl.dataset.line, marks: pl.dataset.marks, ticks: pl.dataset.ticks, snapped: pl.dataset.snapped,
    onsets: pl.dataset.onsets, cv: pl.dataset.cv,
    mode: pl.dataset.mode, lowMotion: pl.dataset.lowMotion, foreground: pl.dataset.foreground,
    frames: counters.frames,
  };
}

/* ==========================================================================
   场景 A：挂载 / 结构 / 宿主 @layer+@scope 之后样式是否真的生效 / 真歌词视图
   ========================================================================== */
window.__scenarioA = async function () {
  const a = await mountInstance({ spectrum: null, position: 0 });
  const out = {};
  await wait(700);
  const pl = a.pl;
  const scope = pl.querySelector(".pl__scope");
  const cv = pl.querySelector(".pl__cv");
  out.mounted = {
    hasPl: !!pl,
    children: Array.from(pl.querySelectorAll(":scope > *")).map((el) => el.className),
    scopeChildren: Array.from(scope.querySelectorAll(":scope > *")).map((el) => el.className),
    marks: pl.querySelectorAll(".pl__beat").length,
    ticks: pl.querySelectorAll(".pl__tick").length,
    canvasW: cv.width,
    canvasH: cv.height,
    scopeW: Math.round(scope.clientWidth),
    scopeH: Math.round(scope.clientHeight),
    cvClient: [Math.round(cv.clientWidth), Math.round(cv.clientHeight)],
    bg: computed(pl, "background-color"),
    scanlines: computedAfter(scope, "background-image"),
    gearAnim: computed(pl.querySelector(".pl__gear"), "animation-name"),
    gearDur: computed(pl.querySelector(".pl__gear"), "animation-duration"),
    gearBg: computed(pl.querySelector(".pl__gear"), "background-image").slice(0, 40),
    sweepRight: rect(pl.querySelector(".pl__sweep")).x,
    scopeRect: rect(scope),
    lyricsRoot: !!lyricsRoot(a),
    lyricRows: lyricRows(a).length,
    current: pl.querySelectorAll('.pl__lyrics .lyric[aria-current="true"]').length,
    hudBpm: pl.querySelector(".pl__bpm").textContent,
    hudHint: pl.querySelector(".pl__hint").textContent,
    hudTitle: pl.querySelector(".pl__title").textContent,
    hudTc: pl.querySelector(".pl__tc").textContent,
    hudPhase: pl.querySelector(".pl__phase").textContent,
    nospecHidden: pl.querySelector(".pl__nospec").hidden,
    backdrop: a.host.rec.backdrops.slice(),
    pulse: prop(pl, "--pl-pulse"),
    slide: prop(pl, "--pl-slide"),
    fgVar: prop(pl, "--pl-fg"),
    fg15: prop(pl, "--pl-fg-15"),
    state: state(a),
  };
  return out;
};

/* ==========================================================================
   场景 B：合成 500ms onset 流 → 收敛 120BPM / 拍点网格 / 刻度吸附 / 窗口平移连续
   ========================================================================== */
window.__scenarioB = async function () {
  const b = await mountInstance({ spectrum: beatProvider(500, 0), position: 1000 });
  const out = {};
  await play(b, 400);
  out.warmup = { beat: b.pl.dataset.beat, marks: b.pl.dataset.marks };
  /* 攒够 onset（≥6 个 = 3 秒） */
  await play(b, 3200);
  const pl = b.pl;
  const scope = pl.querySelector(".pl__scope");
  /* 画布的绘图区要减掉内边距（PAD.t/r/b/l 是本包导出的真值） */
  const plotW = scope.clientWidth - SCL.PAD.l - SCL.PAD.r;
  const marks = marksOf(b);
  const xs = marks.map((el) => Math.round(el.getBoundingClientRect().left * 10) / 10);
  const gaps = [];
  for (let i = 1; i < xs.length; i += 1) gaps.push(Math.round((xs[i] - xs[i - 1]) * 10) / 10);
  /* 间距对应的是**估出来的**周期（锁定后 120±3 → 500±13ms），不是 500ms 的名义值 */
  const want = (plotW * px(prop(pl, "--pl-period"))) / 6000;
  /* 屏幕上最右边那个（屏幕外的池子元素不算） */
  const inScope = marks.map((el) => el.getBoundingClientRect().left).filter((x) => x <= scope.getBoundingClientRect().right + 1);
  const lastVisible = inScope.length ? inScope[inScope.length - 1] : null;
  out.locked = {
    state: state(b),
    bpmText: pl.querySelector(".pl__bpm").textContent,
    markCount: marks.length,
    xs,
    gaps,
    wantGap: Math.round(want * 10) / 10,
    period: prop(pl, "--pl-period"),
    phaseMs: px(prop(pl, "--pl-phase-ms")),
    slide: px(prop(pl, "--pl-slide")),
    plotW,
    markOffsets: marks.map((el) => Math.round((el.getBoundingClientRect().left - scope.getBoundingClientRect().left) * 10) / 10),
    rightEdge: Math.round(scope.getBoundingClientRect().right * 10) / 10,
    lastVisible: lastVisible === null ? null : Math.round(lastVisible * 10) / 10,
    scrollTop: Math.round(pl.querySelector(".pl__lyrics .lyrics__scroll").scrollTop),
    currentText: (pl.querySelector('.pl__lyrics .lyric[aria-current="true"]') || {}).textContent || "",
    words: Array.from(pl.querySelectorAll('.pl__lyrics .lyric[aria-current="true"] .lyric__word')).map((el) => ({
      t: el.textContent, active: el.dataset.active, w: prop(el, "--w"),
    })),
  };
  /* 刻度吸附：拍点后 40ms 的 6 个刻度都应该吸上，并且与拍点标记重合 */
  const ticks = ticksOf(b).map((el) => ({
    x: Math.round(el.getBoundingClientRect().left * 10) / 10,
    snap: el.dataset.snap,
    cx: Math.round((el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2) * 10) / 10,
  }));
  const snapXs = ticks.filter((t) => t.snap === "1").map((t) => t.cx);
  const markXs = marks.map((el) => { const r = el.getBoundingClientRect(); return Math.round((r.left + r.width / 2) * 10) / 10; });
  const near = snapXs.map((x) => Math.min(...markXs.map((m) => Math.abs(m - x))));
  out.snap = {
    ticks,
    snappedCount: snapXs.length,
    markXs,
    near,
    allSnapped: ticks.length > 0 && ticks.every((t) => t.snap === "1"),
    slide: px(prop(pl, "--pl-slide")),
    snappedAttr: pl.dataset.snapped,
    tickCount: pl.dataset.ticks,
  };
  /* 脉冲：盯 700ms，采样 --pl-pulse（峰值必须在拍点前 40ms 出现） */
  let peak = 0;
  let minSeen = 1;
  let flashOn = 0;
  for (let i = 0; i < 45; i += 1) {
    const v = Number(prop(pl, "--pl-pulse") || 0);
    if (v > peak) peak = v;
    if (v < minSeen) minSeen = v;
    if (pl.dataset.flash === "1") flashOn += 1;
    await play(b, 16, 16);
  }
  out.pulse = { peak, minSeen, flashOn };
  /* 窗口平移：采样 --pl-slide（50ms 一步 ≈ −plotW×50/6000；窗口重设那一下是 +plotW 的复位），
     同时看一条"看得见的拍点"是否按预期往左走（用最近邻匹配，不受池子里下标变化影响） */
  const slideBefore = px(prop(pl, "--pl-slide"));
  const before = marksOf(b).map((el) => el.getBoundingClientRect().left);
  const samples = [slideBefore];
  /* 每 50ms 采一次：位移的步长 + 拍点是不是"整体刚性左移"（用最近邻配对，
     不依赖池子里的下标 —— 重锚/窗口重设都会换元素，但屏幕位置是连续的） */
  const shifts = [];
  let prevRects = before;
  for (let i = 0; i < 14; i += 1) {
    await play(b, 50);
    samples.push(px(prop(pl, "--pl-slide")));
    const cur = marksOf(b).map((el) => el.getBoundingClientRect().left);
    const ds = cur.map((x) => {
      let best = Infinity;
      for (const y of prevRects) if (Math.abs(y - x) < Math.abs(best - x)) best = y;
      return best - x;
    });
    ds.sort((a2, b2) => a2 - b2);
    if (ds.length) shifts.push(Math.round(ds[Math.floor(ds.length / 2)] * 10) / 10);
    prevRects = cur;
  }
  const deltas = [];
  for (let i = 1; i < samples.length; i += 1) deltas.push(Math.round((samples[i] - samples[i - 1]) * 10) / 10);
  out.slideStep = {
    deltas,
    shifts,
    per50: Math.round(((-plotW * 50) / 6000) * 10) / 10,
    reset: Math.round(plotW),
    slideBefore,
    slideAfter: px(prop(pl, "--pl-slide")),
    range: [samples.every((v) => v >= -plotW - 2), samples.every((v) => v <= 2)],
    plotW,
  };
  /* 点屏幕中间 = seek 到窗口中间那一刻 */
  const r = scopeRect(b);
  const ev = new MouseEvent("click", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true });
  scope.dispatchEvent(ev);
  out.click = { seeks: b.host.rec.seeks.slice(), plotMidFrac: 0.5 };
  return out;
};

/* ==========================================================================
   场景 C：随机间隔 → free（不谎报）/ 无频谱 / interactive:false
   ========================================================================== */
window.__scenarioC = async function () {
  const c = await mountInstance({ spectrum: randomProvider(), position: 0 });
  await play(c, 4200);
  const pl = c.pl;
  const out = {};
  out.free = {
    state: state(c),
    bpmText: pl.querySelector(".pl__bpm").textContent,
    hint: pl.querySelector(".pl__hint").textContent,
    marks: marksOf(c).length,
    markAttr: pl.dataset.marks,
    ticks: ticksOf(c).map((el) => el.dataset.snap),
    gearDur: computed(pl.querySelector(".pl__gear"), "animation-duration"),
    gearDelay: computed(pl.querySelector(".pl__gear"), "animation-delay"),
    pulse: prop(pl, "--pl-pulse"),
    gridStyle: computed(pl.querySelector(".pl__grid"), "border-style"),
  };
  /* 断掉频谱：必须如实说"无频谱输入"，而且画面照旧（不许假装在监听） */
  const framesBefore = c.host.rec.spectrumCalls;
  c.host.setSpectrum(null);
  await play(c, 400);
  out.nospec = {
    state: state(c),
    hidden: pl.querySelector(".pl__nospec").hidden,
    rendered: c.host.rec.spectrumCalls - framesBefore,
    bpmText: pl.querySelector(".pl__bpm").textContent,
    hint: pl.querySelector(".pl__hint").textContent,
  };
  /* interactive:false：不可点、无 seek */
  const d = await mountInstance({ spectrum: beatProvider(500, 0), options: { interactive: false }, position: 0 });
  await play(d, 300);
  const r = scopeRect(d);
  d.pl.querySelector(".pl__scope").dispatchEvent(
    new MouseEvent("click", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true })
  );
  out.passive = {
    interactive: d.pl.dataset.interactive,
    seeks: d.host.rec.seeks.length,
    cursor: computed(d.pl.querySelector(".pl__scope"), "cursor"),
  };
  return out;
};

/* ==========================================================================
   场景 D：performance 档（15Hz，数渲染帧）/ 静态档（零帧但信息完整）/
            切后台停帧 / 暂停 6 秒停帧 / 窄窗口
   ========================================================================== */
window.__scenarioD = async function () {
  const out = {};

  /* --- performance：清单 60 与设计稿 15 取严 → 15Hz --- */
  const p = await mountInstance({ spectrum: beatProvider(500, 0), options: { performanceMode: "performance" }, position: 0 });
  await play(p, 400);
  const pBase = p.host.rec.spectrumCalls;
  const pRafBase = counters.frames;
  await play(p, 1000);
  out.perf = {
    rendered: p.host.rec.spectrumCalls - pBase,
    rafCalls: counters.frames - pRafBase,
    perf: p.pl.dataset.perf,
    gearPlay: computed(p.pl.querySelector(".pl__gear"), "animation-play-state"),
    state: state(p),
  };

  /* --- 静态档：一帧 rAF 都不该有，但画面与读数必须完整 --- */
  const b = await mountInstance({ spectrum: beatProvider(500, 0), options: { animations: false }, position: 2500 });
  await wait(600);
  const bFrames = counters.frames;
  const bRenders = b.host.rec.spectrumCalls;
  await wait(700);
  const bAfter = counters.frames;
  await at(b, 9000, true, 120);
  out.static = {
    state: state(b),
    framesIdle: bAfter - bFrames,
    rendersOnMount: bRenders,
    rendersAfterPatch: b.host.rec.spectrumCalls - bRenders,
    framesAfterPatch: counters.frames - bAfter,
    canvasW: b.pl.querySelector(".pl__cv").width,
    hudTc: b.pl.querySelector(".pl__tc").textContent,
    lyricRows: lyricRows(b).length,
    current: b.pl.querySelectorAll('.pl__lyrics .lyric[aria-current="true"]').length,
    marks: marksOf(b).length,
    beat: b.pl.dataset.beat,
    gearAnim: computed(b.pl.querySelector(".pl__gear"), "animation-name"),
    gearDuration: computed(b.pl.querySelector(".pl__gear"), "animation-duration"),
  };

  /* --- 切后台：foreground:false 停帧，回来再动 --- */
  const v = await mountInstance({ spectrum: beatProvider(500, 0), position: 0 });
  await wait(400);
  push(v, { type: "visibility", patch: { foreground: false } });
  await wait(120);
  const f0 = counters.frames;
  await wait(500);
  const fStopped = counters.frames - f0;
  push(v, { type: "visibility", patch: { foreground: true } });
  await wait(300);
  const f1 = counters.frames;
  await wait(400);
  out.visibility = {
    stopped: fStopped,
    resumed: counters.frames - f1,
    flag: v.pl.dataset.foreground,
  };

  /* --- close：停帧 --- */
  push(v, { type: "close" });
  await wait(120);
  const c0 = counters.frames;
  await wait(400);
  out.close = { frames: counters.frames - c0, closed: v.pl.dataset.closed };

  /* --- 暂停 6 秒：停帧并打上 idle --- */
  const i = await mountInstance({ spectrum: beatProvider(500, 0), position: 0, playing: false });
  await wait(400);
  await at(i, 0, false, 100);
  out.pausedAt = { idle: i.pl.dataset.idle || "0" };
  await wait(6800);
  out.idle = { idle: i.pl.dataset.idle, playing: i.pl.dataset.playing };
  const i0 = counters.frames;
  await wait(400);
  out.idleFrames = counters.frames - i0;
  /* 唤醒：喂一个 progress（播放） */
  await at(i, 1200, true, 300);
  const i1 = counters.frames;
  await wait(400);
  out.wake = { frames: counters.frames - i1, idle: i.pl.dataset.idle || "0" };

  /* --- 窄窗口：不溢出、齿轮缩小、画布跟着盒子走 --- */
  const n = await mountInstance({ spectrum: beatProvider(500, 0), position: 0 });
  await wait(300);
  /* 真机上窄窗口是宿主把 .playerview 缩了（env() 与元素尺寸一起变） */
  const view = document.querySelector(".playerview");
  view.style.width = "760px";
  view.style.height = "560px";
  n.host.setSize(760, 560);
  push(n, { type: "resize" });
  await wait(300);
  const scope = n.pl.querySelector(".pl__scope");
  const cv = n.pl.querySelector(".pl__cv");
  out.narrow = {
    narrow: n.pl.dataset.narrow,
    canvasW: cv.width,
    scopeW: Math.round(scope.clientWidth),
    /* 注意用 offsetWidth（布局尺寸）：齿轮在转，getBoundingClientRect 量的是旋转后的外接框 */
    gearW: n.pl.querySelector(".pl__gear").offsetWidth,
    gearCss: computed(n.pl.querySelector(".pl__gear"), "width"),
    pageScroll: Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth),
    scopeRight: Math.round(scope.getBoundingClientRect().right),
    viewport: window.innerWidth,
    bpmFont: computed(n.pl.querySelector(".pl__bpm"), "font-size"),
    markRange: marksOf(n).map((el) => Math.round(el.getBoundingClientRect().left)),
    slide: px(prop(n.pl, "--pl-slide")),
    plotW: scope.clientWidth,
  };
  /* 视口之外的标记要被容器裁掉（overflow:hidden），不能把页面撑宽 */
  out.narrowClipped = computed(scope, "overflow");
  return out;
};

/* ==========================================================================
   场景 E：卸载（舞台清干净 + 不越权碰宿主的背景容器）
   ========================================================================== */
window.__scenarioE = async function () {
  /* 先从舞台上摘掉之前那些实例的挂载点 —— 那是宿主的事，皮肤不做 */
  const last = INSTANCES[INSTANCES.length - 1];
  for (const inst of INSTANCES) if (inst !== last) inst.root.remove();
  const e = last;
  const bgBefore = bgRoot.childNodes.length;
  const framesBefore = counters.frames;
  const rootConnectedBefore = e.root.isConnected;
  const hasPlBefore = !!e.pl;
  skin.destroy(e.host.ctx);
  await wait(300);
  const out = {
    rootConnectedBefore,
    hasPlBefore,
    rootConnected: e.root.isConnected,
    rootHtml: e.root.innerHTML,
    hasPl: !!e.root.querySelector(".pl"),
    lpConnected: e.pl.isConnected,
    stageChildrenAfterDestroy: stage.childNodes.length,
    stageChildren: null,
    bgChildrenBefore: bgBefore,
    bgChildrenAfter: bgRoot.childNodes.length,
    bgHtml: bgRoot.innerHTML,
    framesAfter: counters.frames - framesBefore,
    updateAfterDestroy: (() => {
      try {
        skin.update(e.host.ctx, { type: "progress", position: 1000, playing: true });
        skin.update(e.host.ctx, { type: "resize" });
        skin.update(e.host.ctx, { type: "destroy" });
        return "";
      } catch (err) {
        return String(err && err.message ? err.message : err);
      }
    })(),
  };
  /* 挂载点是宿主的：皮肤不许摘它。摘掉之后舞台上才应该什么都不剩 */
  e.root.remove();
  out.stageChildren = stage.childNodes.length;
  await wait(200);
  out.framesAfter2 = counters.frames - framesBefore;
  return out;
};

/** 对比度用本包的颜色工具核对（自检不许自己抄一份算法） */
window.__wcag = function (a, b) {
  const lum = (hex) => {
    const [r, g, bl] = colorOf(hex);
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const colorOf = (hex) => {
  const s = String(hex || "").replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
</script>
</body>
</html>`;

/* --------------------------------------------------------------------------
   1. 静态服务（本样式包目录 + 宿主 SDK 源码，只读）
   -------------------------------------------------------------------------- */
function serve(root, req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const file = resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ""));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end("forbidden");
    return true;
  }
  if (!existsSync(file)) return false;
  res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream" });
  res.end(readFileSync(file));
  return true;
}

const server = createServer((req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (path === "/" || path === "/__harness.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS);
    return;
  }
  if (path.startsWith("/sdk/")) {
    if (!serve(SDK_ROOT, { url: req.url.replace(/^\/sdk/, "") }, res)) res.writeHead(404).end("not found");
    return;
  }
  if (!serve(PKG_ROOT, req, res)) res.writeHead(404).end("not found");
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
const px = (v) => parseFloat(String(v));
/** computed 的时长可能是 "4s" 也可能是 "4000ms" */
const ms = (v) => (/ms$/i.test(String(v)) ? parseFloat(v) : parseFloat(v) * 1000);

if (!EDGE) {
  console.error("找不到 msedge.exe —— 这一项自检需要本机装 Edge（系统自带）。");
  check(false, "本机有 Edge", "未找到 msedge.exe");
  server.close();
  process.exitCode = 1;
} else {
  const OUT = join(tmpdir(), "pulse-check-" + Date.now());
  mkdirSync(OUT, { recursive: true });
  /* 随机端口：上一次跑挂了留下的 Edge 可能还占着固定端口 */
  const CDP_PORT = 9800 + Math.floor(Math.random() * 150);
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

    /* 在页面**最前面**把 rAF 记个数（只数回调，不拖帧） */
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

    /* 固定视口：headless 新档有时给 0×0 的默认窗口 */
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
      console.log("\n[1] 挂载 / 结构 / 宿主的 @layer+@scope 之后样式与 keyframes 是否真的生效");
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
        check(M.hasPl === true, "样式能挂载并渲染");
        check(M.children.join("|") === "pl__scope|pl__grid|pl__gears|pl__lyrics|pl__hud", "舞台根里五层齐全（屏幕/框/齿轮/歌词/HUD）", j(M.children));
        check(
          M.scopeChildren.join("|") === "pl__cv|pl__beats|pl__rail|pl__sweep|pl__nospec",
          "屏幕里五件齐全（画布/拍点/刻度/指针/无频谱提示）",
          j(M.scopeChildren)
        );
        check(M.marks === 40 && M.ticks === 64, "拍点与刻度的池子按上限建好（DOM 数量与拍数无关）", j([M.marks, M.ticks]));
        check(M.canvasW > 0 && M.canvasH > 0 && M.canvasW === M.scopeW && M.canvasH === M.scopeH, "画布的像素尺寸 = 屏幕盒子（布局数字与 DOM 共用同一块盒子）", j([M.canvasW, M.canvasH, M.scopeW, M.scopeH]));
        check(M.cvClient[0] === M.scopeW && M.cvClient[1] === M.scopeH, "画布铺满屏幕盒子", j(M.cvClient));
        check(M.bg === "rgb(5, 7, 10)", "清单底色真的写进了 CSS（@scope 生效）", M.bg);
        check(M.scanlines.includes("repeating-linear-gradient"), "扫描线是纯渐变（不用 filter）", M.scanlines.slice(0, 46));
        check(M.gearAnim === "pl-spin", "齿轮的 @keyframes 被宿主包进 @layer+@scope 之后仍然有效（animation-name 读得到）", M.gearAnim);
        check(ms(M.gearDur) === 4000, "未锁定时齿轮按 4 秒一圈转（不是假装在打拍子）", M.gearDur);
        check(M.gearBg.includes("conic-gradient"), "刻度环是 conic-gradient 画的", M.gearBg);
        check(M.fgVar === "#7cfc9b" && M.fg15.startsWith("rgba(124,252,155"), "荧光色与它的透明度变体都在（JS 展开，不用 color-mix）", j([M.fgVar, M.fg15]));
        check(Math.abs(M.sweepRight - (M.scopeRect.x + M.scopeRect.w) + 2) <= 3, "扫描指针贴在屏幕右端", j([M.sweepRight, M.scopeRect.x + M.scopeRect.w]));
        check(M.lyricsRoot === true, "宿主 SDK 的 .lyrics 真的被建在 .pl__lyrics 里（用真模块，不是替身）");
        check(M.lyricRows === 5, "5 行歌词都渲染了", j(M.lyricRows));
        check(M.current === 1, "当前行有且只有一个 aria-current", j(M.current));
        check(M.hudTitle === "脉搏测试曲", "HUD 曲名在", j(M.hudTitle));
        check(M.hudTc === "00:00 / 04:00", "时间码在", j(M.hudTc));
        check(M.state.total === "5" && M.state.line === "0", "行数与当前行号在 data-* 上", j([M.state.total, M.state.line]));
        check(M.state.beat === "free" && M.hudBpm === "自由节拍", "拿不到频谱 → 自由节拍（**不谎报 BPM**）", j([M.state.beat, M.hudBpm]));
        check(/频谱/.test(M.hudHint), "提示里说明了原因", j(M.hudHint));
        check(M.nospecHidden === false, "屏内有「无频谱输入」", j(M.nospecHidden));
        check(M.state.marks === "0" && M.state.snapped === "0", "没锁上时一个拍点都不画、一条刻度都不吸附（不假装）", j([M.state.marks, M.state.snapped, M.state.ticks]));
        check(M.state.animations === "1" && M.state.perf === "0" && M.state.narrow === "0", "档位标记正确", j(M.state));
        check(M.state.dpr === "1", "dpr 标记跟着环境走", M.state.dpr);
        check(M.slide !== "" && px(M.slide) <= 0 && px(M.slide) >= -M.scopeW, "容器位移只往左走，且不超出屏幕宽度（滑动窗口每帧只写这一个量）", j([M.slide, M.scopeW]));
        check(M.pulse === "0.00" && M.state.flash === "0", "没锁上时没有脉冲（不假装在打拍子）", j([M.pulse, M.state.flash]));
        check(A.mounted.backdrop.length >= 1, "挂载后上报了宿主壳配色（防抖后一次）", j(A.mounted.backdrop.length));
        check(
          A.mounted.backdrop.every((p) => /^#[0-9a-f]{6}$/i.test(p.bg) && /^#[0-9a-f]{6}$/i.test(p.fg) && /^#[0-9a-f]{6}$/i.test(p.accent)),
          "上报的三项颜色都是合法的十六进制",
          j(A.mounted.backdrop[0])
        );
        const pal = A.mounted.backdrop[0] || MANIFEST.colors;
        const cInk = wcag(pal.bg, pal.fg);
        const cManifest = wcag(MANIFEST.colors.bg, MANIFEST.colors.fg);
        check(cInk >= 3.9, "上报的配色对比度 ≥ 3.9（深底荧光字）", cInk.toFixed(2));
        check(cManifest >= 4.5, "清单里的兜底配色对比度 ≥ 4.5", cManifest.toFixed(2));
      }

      /* ---------------- 场景 B ---------------- */
      console.log("\n[2] 合成 500ms onset 流 → 收敛 120BPM / 拍点网格 / 刻度吸附 / 窗口平移连续");
      let B;
      try {
        B = await evaluate("window.__scenarioB()");
      } catch (e) {
        B = brief(e);
      }
      if (B?.__error || B?.error) {
        check(false, "场景 B 跑通", j(B.__error || B.error));
      } else {
        const L = B.locked;
        check(B.warmup.beat === "listening", "预热时还在校准（没有立刻编 BPM）", j(B.warmup));
        check(L.state.beat === "locked", "500ms 一拍 → 锁定", j(L.state.beat));
        const bpm = num((L.bpmText.match(/(\d+)\s*BPM/) || [])[1]);
        check(/^\d{2,3} BPM$/.test(L.bpmText), "读数形如「120 BPM」（只有锁上才显示数字）", j(L.bpmText));
        check(Math.abs(bpm - 120) <= 3, "BPM 收敛到 120±3", j(bpm));
        check(L.markCount >= 10 && L.markCount === num(L.state.marks), "可见拍点数与 data-marks 一致（池子里含屏幕外的）", j([L.markCount, L.state.marks]));
        check(L.gaps.length >= 8 && L.gaps.every((g) => Math.abs(g - L.wantGap) <= 2), "拍点间距 = 估出来的周期（±2px）", j({ gaps: L.gaps.slice(0, 5), want: L.wantGap }));
        check(
          L.markOffsets.filter((o) => o >= -2 && o <= L.plotW + 2).length >= 11,
          "6 秒里该有 12 个拍点落在屏幕上（其余在屏幕外，由容器裁掉）",
          j(L.markOffsets.length)
        );
        check(
          L.markOffsets.every((o) => o >= -L.plotW * 2.2 && o <= L.plotW * 2.2),
          "屏幕外的拍点也不会跑到离谱的位置（双倍窗口 + 容器位移的上限）",
          j([Math.min(...L.markOffsets), Math.max(...L.markOffsets)])
        );
        check(
          Math.abs(L.lastVisible - L.rightEdge) <= L.wantGap + 2,
          "最右边可见的拍点就在扫描指针附近（右端 = 现在）",
          j([L.lastVisible, L.rightEdge])
        );
        check(px(L.period) > 480 && px(L.period) < 520, "齿轮转速 = 一拍一圈（--pl-period ≈ 500ms）", L.period);
        check(L.phaseMs >= 0 && L.phaseMs <= px(L.period) + 1, "相位用负 delay 对齐（--pl-phase-ms 落在一个周期内）", j(L.phaseMs));
        check(L.state.line === "0" && L.currentText === "心跳开场第一句", "当前行跟着进度走", j([L.state.line, L.currentText]));
        check(L.words.length === 7 && L.words.every((w) => w.w !== ""), "逐字填充量 --w 每帧都在写（7 个字素，字素数与 words 对上才会拆）", j(L.words.map((w) => w.w)));
        check(L.words.some((w) => w.active === "true"), "已经唱到的字素被点亮", j(L.words.map((w) => w.active)));
        check(L.slide <= 2 && L.slide >= -L.plotW - 2, "容器位移落在 [−plotW, 0]（滑动窗口而不是每帧改 x）", j(L.slide));
        const S = B.snap;
        check(S.tickCount === "7", "当前行的 7 条字级刻度都画出来了", j(S.tickCount));
        check(S.snappedCount >= 6, "偏在拍点后 40ms 的刻度**吸**了上去", j({ snapped: S.snappedCount, all: S.allSnapped }));
        check(S.near.every((d) => d <= 1.5), "吸附过的刻度与拍点标记重合（≤1.5px：两套坐标用的是同一套数字）", j(S.near));
        check(S.snappedAttr === String(S.snappedCount), "data-snapped 计数与 DOM 一致", j([S.snappedAttr, S.snappedCount]));
        check(B.pulse.peak > 0.9, "脉冲峰值接近 1（负延迟补偿的峰值在拍点之前）", j(B.pulse.peak));
        check(B.pulse.minSeen < 0.1, "两次拍点之间脉冲回到 0（不会一直亮着）", j(B.pulse.minSeen));
        check(B.pulse.flashOn > 0 && B.pulse.flashOn < 30, "data-flash 只在一拍里的一小段亮起", j(B.pulse.flashOn));
        const SS = B.slideStep;
        const per = Math.abs(SS.per50);
        check(
          SS.deltas.every((d) => (d <= -per * 0.4 && d >= -per * 1.8) || d >= SS.reset - 90),
          "每 50ms 位移都按 −plotW×50/6000 走（窗口重设那一下正好复位 +plotW）",
          j({ deltas: SS.deltas.slice(0, 7), per50: SS.per50, reset: SS.reset })
        );
        check(SS.range[0] === true && SS.range[1] === true, "位移全程都在合法范围内", j([SS.slideBefore, SS.slideAfter]));
        check(
          SS.shifts.length >= 10 && SS.shifts.every((s, i) => Math.abs(s + SS.deltas[i]) <= 1.5),
          "拍点整体跟着容器刚性左移（同一段里位移多少、标记就走多少：屏幕位置连续、不跳）",
          j({ shifts: SS.shifts.slice(0, 8), deltas: SS.deltas.slice(0, 8) })
        );
        const avgDelta = SS.deltas.reduce((a, b2) => a + b2, 0) / SS.deltas.length;
        check(Math.abs(avgDelta - SS.per50) <= 2, "平均步长就是 −plotW×50/6000（时间轴速度对得上歌曲时间）", j({ avg: Math.round(avgDelta * 10) / 10, per50: SS.per50 }));
        check(B.click.seeks.length === 1, "点屏幕中间 seek 了一次", j(B.click.seeks));        check(B.click.seeks[0] > 0 && B.click.seeks[0] < 240000, "seek 的时间在曲长范围内", j(B.click.seeks[0]));
      }

      /* ---------------- 场景 C ---------------- */
      console.log("\n[3] 随机间隔 → free（不谎报）/ 无频谱 / interactive:false");
      let C;
      try {
        C = await evaluate("window.__scenarioC()");
      } catch (e) {
        C = brief(e);
      }
      if (C?.__error || C?.error) {
        check(false, "场景 C 跑通", j(C.__error || C.error));
      } else {
        const F = C.free;
        check(F.state.beat === "free", "间隔 180..900ms 的散板判成 free", j(F.state.beat));
        check(F.bpmText === "自由节拍", "只显示「自由节拍」——**不谎报 BPM**", j(F.bpmText));
        check(F.markAttr === "0" && F.marks === 0, "free 时不画拍点网格", j([F.markAttr, F.marks]));
        check(F.ticks.every((s) => s === "0"), "free 时字级刻度全部不吸附（散板要保留）", j(F.ticks));
        check(ms(F.gearDur) === 4000, "free 时齿轮回到 4 秒一圈（不是假装跟着拍子）", F.gearDur);
        check(F.pulse === "0.00", "free 时没有脉冲", F.pulse);
        check(F.gridStyle === "dashed", "free 时屏幕框变虚线（一眼看出「这条线不准」）", F.gridStyle);
        check(num(F.state.snapped) === 0, "data-snapped 归零", F.state.snapped);
        check(C.nospec.hidden === false && C.nospec.state.beat === "free", "断掉频谱后如实显示「无频谱输入」，状态仍是 free", j([C.nospec.hidden, C.nospec.state.beat]));
        check(/频谱/.test(C.nospec.hint), "提示里写清了原因", j(C.nospec.hint));
        check(C.nospec.rendered >= 4, "没有频谱时画面照旧在动（不是整屏冻住）", j(C.nospec.rendered));
        check(C.passive.interactive === "0" && C.passive.seeks === 0, "interactive:false 时点屏幕不 seek", j(C.passive));
      }

      /* ---------------- 场景 D ---------------- */
      console.log("\n[4] performance 档 / 静态档 / 切后台 / 暂停 6 秒 / 窄窗口");
      let D;
      try {
        D = await evaluate("window.__scenarioD()");
      } catch (e) {
        D = brief(e);
      }
      if (D?.__error || D?.error) {
        check(false, "场景 D 跑通", j(D.__error || D.error));
      } else {
        check(D.perf.perf === "1", "performance 档标记在", j(D.perf.state));
        check(D.perf.rendered >= 11 && D.perf.rendered <= 20, "按 15Hz 渲染（数的是真画了几帧，不是 rAF 回调）", j({ renders: D.perf.rendered, rafCalls: D.perf.rafCalls }));
        check(D.perf.rafCalls > D.perf.rendered * 2, "rAF 回调明显多于渲染帧（限帧真的生效了）", j([D.perf.rafCalls, D.perf.rendered]));
        check(D.perf.gearPlay === "paused", "performance 档齿轮停转（信息不丢，只是不动）", D.perf.gearPlay);
        check(D.static.state.animations === "0", "静态档标记在", j(D.static.state));
        check(D.static.framesIdle === 0, "静态档没有任何 rAF 帧", j(D.static.framesIdle));
        check(D.static.rendersOnMount >= 1 && D.static.rendersAfterPatch >= 1 && D.static.framesAfterPatch === 0, "补丁来了同步画一帧（不进帧循环）", j(D.static));
        check(D.static.canvasW > 0 && D.static.lyricRows === 5, "静态档画面与歌词都是完整的", j([D.static.canvasW, D.static.lyricRows]));
        check(D.static.current === 1 && D.static.hudTc.startsWith("00:09"), "静态档读数也跟着进度走", j([D.static.current, D.static.hudTc]));
        check(D.static.marks === 0 && D.static.beat === "listening", "静态档不做 PLL（不画拍点、也不锁相）", j([D.static.marks, D.static.beat]));
        check(D.static.gearAnim === "none", "静态档关掉 CSS 动画", D.static.gearAnim);
        check(D.visibility.stopped <= 2, "切后台后停帧", j(D.visibility.stopped));
        check(D.visibility.resumed > 10, "回到前台后继续画", j(D.visibility.resumed));
        check(D.visibility.flag === "1", "前台标记回来了", D.visibility.flag);
        check(D.close.frames <= 2 && D.close.closed === "1", "close 之后停帧并打标记", j(D.close));
        check(D.pausedAt.idle === "0", "刚暂停时还没停帧", j(D.pausedAt));
        check(D.idle.idle === "1", "暂停 6 秒后打上 idle", j(D.idle));
        check(D.idleFrames <= 2, "idle 之后不再有帧", j(D.idleFrames));
        check(D.wake.frames > 10 && D.wake.idle === "0", "恢复播放后立刻继续画", j(D.wake));
        check(D.narrow.narrow === "1", "窄窗口标记生效", j(D.narrow.narrow));
        check(D.narrow.canvasW === D.narrow.scopeW, "窄窗口下画布仍然跟着屏幕盒子", j([D.narrow.canvasW, D.narrow.scopeW]));
        check(D.narrow.gearCss === "40px" && D.narrow.gearW < 46, "窄窗口齿轮缩到 40px（量布局尺寸，不算旋转外接框）", j([D.narrow.gearCss, D.narrow.gearW]));
        check(px(D.narrow.bpmFont) <= 21, "窄窗口 BPM 字号收了一档", D.narrow.bpmFont);
        check(D.narrowClipped === "hidden", "屏幕容器裁掉越界的标记（不会把页面撑宽）", D.narrowClipped);
        check((D.narrow.pageScroll ?? 99) <= 1, "窄窗口下页面没有横向滚动", j(D.narrow.pageScroll));
        check(D.narrow.scopeRight <= D.narrow.viewport, "屏幕右边界没有越出视口", j([D.narrow.scopeRight, D.narrow.viewport]));
        check(D.narrow.markRange.every((x) => x > -2200 && x < D.narrow.viewport + 100), "拍点标记不会跑到离谱的位置", j(D.narrow.markRange.slice(0, 5)));
      }

      /* ---------------- 场景 E ---------------- */
      console.log("\n[5] 卸载（舞台清干净 + 不越权碰宿主的背景容器）");
      let E;
      try {
        E = await evaluate("window.__scenarioE()");
      } catch (e) {
        E = brief(e);
      }
      if (E?.__error || E?.error) {
        check(false, "场景 E 跑通", j(E.__error || E.error));
      } else {
        check(E.rootConnectedBefore === true && E.hasPlBefore === true, "卸载前挂载点与 .pl 都在", j([E.rootConnectedBefore, E.hasPlBefore]));
        check(E.rootConnected === true, "皮肤没有去删宿主给的挂载点（清空是自己的事，摘节点是宿主的）", j(E.rootConnected));
        check(E.hasPl === false && E.lpConnected === false, "自己那棵树清空并脱离文档（.pl 已经不在了）", j([E.hasPl, E.lpConnected]));
        check(E.rootHtml === "", "挂载点里一个节点都不剩", j(E.rootHtml));
        check(E.stageChildrenAfterDestroy === 1, "皮肤不摘宿主的挂载点（destroy 后它还在舞台上）", j(E.stageChildrenAfterDestroy));
        check(E.stageChildren === 0, "宿主摘掉挂载点后舞台上什么都不剩", j(E.stageChildren));
        check(E.bgChildrenBefore === 0 && E.bgChildrenAfter === 0 && E.bgHtml === "", "宿主的背景容器一个字节都没被碰过（background:false）", j([E.bgChildrenBefore, E.bgChildrenAfter]));
        check(E.framesAfter <= 2 && E.framesAfter2 <= 2, "destroy 之后不再有帧", j([E.framesAfter, E.framesAfter2]));
        check(E.updateAfterDestroy === "", "destroy 之后再收 update 不抛异常", j(E.updateAfterDestroy));
        check(E.bgChildrenAfter === 0, "背景容器始终为空", j(E.bgChildrenAfter));
      }

      console.log("\n[6] 控制台必须干净");
      const noisy = errors.filter((e) => !/404|Failed to load resource|net::ERR/.test(e));
      check(noisy.length === 0, "无未捕获异常 / console.error", noisy.slice(0, 4).map((e) => String(e).split("\n")[0]).join(" | "));
    }

    ws.close();
    edge.kill();
    server.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n结果：${results.length - failed} 通过 / ${failed} 失败`);
    process.exitCode = failed > 0 ? 1 : 0;
  }
}
