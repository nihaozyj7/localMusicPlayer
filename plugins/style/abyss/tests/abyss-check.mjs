/* ==========================================================================
   abyss · 浏览器自检（自带静态服务 + 假宿主 + 无头 Edge，走 CDP）
   --------------------------------------------------------------------------
   跑法：node plugins/style/abyss/tests/abyss-check.mjs

   这一款不能只测"DOM 长得对不对" —— 它的核心是**像素与着色器**，所以自检里
   有三件必须真的量出来的事（探针 P1 的结论在这里变成断言）：

     1. **GL 真的在画**：直接把 `WebGL2RenderingContext.prototype.drawArrays` 打上点，
        并在"成画那一笔"（默认帧缓冲）之后立刻 `readPixels` 取 16×4 的像素指纹 ——
        指纹随时间变化 = 水真的在流（自己报的计数不算证据，要读回真像素）；
     2. **一份排版渲染两次对得上**：字形遮罩的墨迹包围盒 vs DOM 文字的包围盒，
        逐像素量出来（真机要求 ≤ 2px，这里放宽到 4px）；
     3. **GL 不成立时不许白屏**：一种是把 `getContext("webgl2")` 关掉，
        另一种是**真的**把上下文丢给 `WEBGL_lose_context` —— 两条路都必须无缝切
        Canvas2D 伪流体（数 2D 画布的 clearRect = 真的在重画），而且 destroy 时
        `loseContext()` 必须被调到（显存不是等 GC 的）。

   歌词用的是宿主的**真模块**（frontend/packages/player-skins/src/lyrics-view.js），
   按 /sdk/ 路由托管 —— 遮罩就是照着它排出来的版量的，替身等于没验。
   ========================================================================== */

import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..", "..");
const SDK_ROOT = join(REPO_ROOT, "frontend", "packages", "player-skins", "src");

/** 纯逻辑借本包的 water.js（自检不许抄一份算法：抄的那份会跟着漂） */
const wa = await import(pathToFileURL(join(PKG_ROOT, "lib", "water.js")).href);
const MANIFEST = JSON.parse(readFileSync(join(PKG_ROOT, "skin.json"), "utf8"));

/** WCAG 相对亮度（0..1） */
function lumOf(rgb) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

/** 两个 rgb 数组之间的 WCAG 对比度 */
function wcagRgb(a, b) {
  const l1 = lumOf(a);
  const l2 = lumOf(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** WCAG 对比度（颜色解析走本包的 hexToRgb） */
function wcag(bgHex, fgHex) {
  const lum = (hex) => {
    const [r, g, b] = wa.hexToRgb(hex, [0, 0, 0]);
    return lumOf([r, g, b]);
  };
  const l1 = lum(bgHex);
  const l2 = lum(fgHex);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * 假宿主 + 全部场景。
 *
 * 歌词安排：第 0 行 8 个字素（遮罩要对齐的就是它）→ 第 1 行短句 → 第 2 行更长
 * （换行判定 / 遮罩重画）→ 第 3 行在很后面（还没唱到）。
 * 封面给一张**真的 data URL**（页面里用渐变画出来的 96×96 PNG）：
 * 密度场、背景层、兜底的 drawImage 全都吃到真料。
 */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>abyss check</title>
<!-- 宿主真实的样式表，顺序与 frontend/src/styles/index.css 一致；lyrics.css 由宿主在运行时注入（未分层） -->
<link rel="stylesheet" href="/host/base.css">
<link rel="stylesheet" href="/host/tokens.css">
<link rel="stylesheet" href="/host/lyrics.css">
<style>
  html, body { margin: 0; background: #101418; }
  /* 宿主歌词骨架（components/lyrics.css 的最小同义版） */
  .lyrics { position: absolute; inset: 0; }
  .lyrics .lyrics__scroll { position: absolute; inset: 0; overflow-y: auto; }
  .playerview { position: fixed; left: 0; top: 0; width: 1100px; height: 700px; }
  .playerview__stage { position: relative; height: 100%; overflow: hidden; }
  .skin-bg { position: fixed; left: 0; top: 0; right: 0; bottom: 0; }
</style>
</head>
<body>
<div class="skin-bg" data-skin="abyss"><!-- 宿主给的整窗背景容器 --></div>
<div class="playerview" data-skin="abyss"><div class="playerview__stage" id="stage"></div></div>
<script type="module">
import skin from "/skin.js";
const SDK = await import("/sdk/lyrics-view.js?t=check");
const WA = await import("/lib/water.js");

const stage = document.getElementById("stage");
const bgRoot = document.querySelector(".skin-bg");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = (el, name) => (el ? el.style.getPropertyValue(name).trim() : "");
const computed = (el, name) => (el ? getComputedStyle(el).getPropertyValue(name).trim() : "");
const px = (v) => parseFloat(String(v));
const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };

/* 宿主怎么裹样式，这里就怎么裹：@layer skin + @scope(舞台根, 背景层根) */
const cssText = await (await fetch("/skin.css")).text();
const styleEl = document.createElement("style");
styleEl.textContent = '@layer skin { @scope (.playerview[data-skin="abyss"], .skin-bg[data-skin="abyss"]) { ' + cssText + ' } }';
document.head.appendChild(styleEl);

/* ---- 封面：页面里画一张真图，走 data URL（真机的封面也是 data URL 或同源代理） ---- */
function makeCover() {
  const cv = document.createElement("canvas");
  cv.width = 96; cv.height = 96;
  const g = cv.getContext("2d");
  const lg = g.createLinearGradient(0, 0, 96, 96);
  lg.addColorStop(0, "#123a5c");
  lg.addColorStop(0.5, "#2f7fb8");
  lg.addColorStop(1, "#0a1c2b");
  g.fillStyle = lg;
  g.fillRect(0, 0, 96, 96);
  g.fillStyle = "rgba(223,242,255,0.85)";
  g.fillRect(10, 60, 40, 8);
  return cv.toDataURL("image/png");
}
const COVER = makeCover();

/* ---- 合成频谱：低频涌浪 + 中频湍流 + 高频泡沫（都**按歌曲时间**走） ---- */
const N = 128;
function bandsAt(songMs, opts) {
  const o = opts || {};
  const a = new Float32Array(N);
  const w = o.lift === undefined ? 0.6 : o.lift;
  const m = o.turb === undefined ? 0.4 : o.turb;
  const h = o.foam === undefined ? 0.3 : o.foam;
  const slow = 0.5 + 0.5 * Math.sin(songMs / 900);
  for (let i = 0; i < 8; i++) a[i] = 0.02 + 0.9 * w * slow;
  for (let i = 32; i < 96; i++) a[i] = 0.02 + 0.7 * m * (0.5 + 0.5 * Math.sin(songMs / 120 + i / 24));
  for (let i = 96; i < 128; i++) a[i] = 0.02 + 0.6 * h * (0.5 + 0.5 * Math.sin(songMs / 60 + i / 9));
  return a;
}

const LINES = [
  { time: 0, text: "深水压出的第一句歌词", words: [80, 480, 880, 1280, 1680, 2080, 2480, 2880, 3280, 3680] },
  { time: 4000, text: "第二句短一些" },
  { time: 9000, text: "第三句稍微长一点用来验证换行与遮罩重画" },
  { time: 30000, text: "很后面才唱到的一句" },
];

function createHost(o) {
  const rec = { seeks: [], backdrops: [], spectrumCalls: 0 };
  const opt = Object.assign(
    { showLyrics: true, interactive: true, animations: true, performanceMode: "smooth" },
    o.options || {}
  );
  const media = {
    song: { id: "song-1", title: "深渊测试曲", artist: "某歌手", album: "某专辑", duration: 240000, kind: "local" },
    cover: o.cover === undefined ? COVER : o.cover,
    covers: [],
    coverIndex: 0,
    lyrics: { lines: o.lines || LINES, index: 0, source: "test", text: "", status: "ok", statusText: "" },
  };
  const pb = { position: o.position || 0, duration: 240000, playing: o.playing !== false, volume: 1, muted: false };
  let pbAt = performance.now();
  let dpr = o.dpr || 1;
  let w = 1100, h = 700;
  let fg = true;
  const bandsOpt = o.bands || {};

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
      if (o.noSpectrum) return null;
      const songMs = pb.position + (pb.playing ? Math.min(Math.max(performance.now() - pbAt, 0), 1200) : 0);
      return { bands: bandsAt(songMs, bandsOpt), at: songMs };
    },
    sdk: {
      createLyricsView: (host, o2) => SDK.createLyricsView(host, o2),
      splitGraphemes: (t) => Array.from(String(t == null ? "" : t)),
      html: { escapeHtml: (s) => String(s == null ? "" : s) },
      manifest: {
        id: "abyss",
        colors: { bg: "#04121b", fg: "#dff2ff", accent: "#58c7ff" },
        performance: { budgetFps: 45 },
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
    setPosition: (p, playing) => { pb.position = p; pbAt = performance.now(); pb.playing = playing === undefined ? pb.playing : playing; },
    setLines: (lines) => { media.lyrics.lines = lines; },
    setSong: (song) => { media.song = song; },
    setCover: (url) => { media.cover = url; },
    setForeground: (v) => { fg = v; },
  };
}

const counters = window.__counters;

/* 皮肤模块是**单例**（S 指向最后一次挂载的实例）。挂新的之前，先把上一个**真的卸载**并
   摘掉它的挂载点：这一款每个实例都要一个 WebGL2 上下文，一路 close 而不卸载会攒下 8~10 个
   活动上下文 —— 浏览器会在超限时**主动丢掉最老的那个**（表现为后面某个场景莫名切了兜底）。
   顺带也让"舞台上残留 13 个根节点"这种假失败消失。 */
const INSTANCES = [];
async function mountInstance(o) {
  const prev = INSTANCES[INSTANCES.length - 1];
  if (prev) {
    try {
      skin.destroy(prev.host.ctx);
    } catch {
      /* 卸载失败不该让下一个场景跑不起来 */
    }
    if (prev.root.parentNode) prev.root.parentNode.removeChild(prev.root);
    INSTANCES.pop();
  }
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;inset:0";
  stage.appendChild(root);
  const host = createHost(Object.assign({ root }, o));
  await skin.mount(host.ctx);
  const inst = { root, host, ab: root.querySelector(".ab") };
  INSTANCES.push(inst);
  return inst;
}
function push(inst, patch) { skin.update(inst.host.ctx, patch); }

async function at(inst, ms, playing, settle) {
  const p = playing === undefined ? true : playing;
  inst.host.setPosition(ms, p);
  push(inst, { type: "progress", position: ms, duration: 240000, playing: p });
  await wait(settle === undefined ? 120 : settle);
}
async function play(inst, ms, step) {
  const st = step || 50;
  const t0 = performance.now();
  const p0 = inst.host.pos.position;
  let left = ms;
  while (left > 0) {
    const dt = Math.min(st, left);
    await wait(dt);
    left -= dt;
    inst.host.setPosition(p0 + (performance.now() - t0), true);
    push(inst, { type: "progress", position: inst.host.pos.position, duration: 240000, playing: true });
  }
}

/* ---- 量具 ---- */
const fluid = (inst) => inst.ab.querySelector(".ab__fluid");
const maskCv = (inst) => inst.ab.querySelector(".ab__mask");
function state(inst) {
  const ab = inst.ab;
  return {
    gl: ab.dataset.gl, tier: ab.dataset.tier, flow: ab.dataset.flow, glerr: ab.dataset.glerr,
    glerrcode: ab.dataset.glerrcode, draws: ab.dataset.draws, glms: ab.dataset.glms,
    timer: ab.dataset.timer, halfFloat: ab.dataset.halfFloat, fallback: ab.dataset.fallback,
    glLost: ab.dataset.glLost, mask: ab.dataset.mask, maskerr: ab.dataset.maskerr,
    maskscale: ab.dataset.maskscale, depth: ab.dataset.depth, line: ab.dataset.line,
    maskrev: ab.dataset.maskrev, meas: ab.dataset.meas,
    total: ab.dataset.total, empty: ab.dataset.empty, playing: ab.dataset.playing,
    idle: ab.dataset.idle, perf: ab.dataset.perf, animations: ab.dataset.animations,
    interactive: ab.dataset.interactive, narrow: ab.dataset.narrow, dpr: ab.dataset.dpr,
    spec: ab.dataset.spec, coverReady: ab.dataset.coverReady, surge: ab.dataset.surge,
    flowState: ab.dataset.flowState, mode: ab.dataset.mode, lowMotion: ab.dataset.lowMotion,
    foreground: ab.dataset.foreground, glfail: ab.dataset.glFail, tierMove: ab.dataset.tierMove,
    frames: counters.frames,
  };
}
/** 遮罩墨迹包围盒（在遮罩像素坐标里扫 alpha） */
function inkBox(cv, threshold) {
  const g = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  if (!w || !h) return null;
  const d = g.getImageData(0, 0, w, h).data;
  let l = w, t = h, r = -1, b = -1, ink = 0;
  const th = threshold === undefined ? 40 : threshold;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > th) {
        ink++;
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
  }
  return r < 0 ? { empty: true, ink: 0 } : { l: l, t: t, r: r, b: b, w: r - l, h: b - t, ink: ink };
}
/** DOM 那一侧的文本包围盒（相对舞台，换算成遮罩像素） */
function domBox(inst) {
  const lineEl = inst.ab.querySelector('.ab__text .lyric[aria-current="true"]');
  const stageEl = fluid(inst);
  if (!lineEl || !stageEl) return null;
  const s = stageEl.getBoundingClientRect();
  const scale = px(inst.ab.dataset.maskscale) || 1;
  const walk = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
  let box = null;
  let n = null;
  while ((n = walk.nextNode())) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const r = rg.getBoundingClientRect();
    if (!r.width) continue;
    const l = (r.left - s.left) * scale, t = (r.top - s.top) * scale;
    const rr = (r.right - s.left) * scale, bb = (r.bottom - s.top) * scale;
    box = box ? { l: Math.min(box.l, l), t: Math.min(box.t, t), r: Math.max(box.r, rr), b: Math.max(box.b, bb) }
              : { l: l, t: t, r: rr, b: bb };
  }
  if (!box) return null;
  return { l: Math.round(box.l), t: Math.round(box.t), r: Math.round(box.r), b: Math.round(box.b), w: Math.round(box.r - box.l), h: Math.round(box.b - box.t) };
}

/**
 * 遮罩对齐的判据。
 *
 * 注意**不能**直接拿"墨迹包围盒"去比"行盒包围盒"：行盒含 ascent/descent 的留白
 * （本例 ink.h=20 / dom.h=28），而没有右边距的字形墨迹也必然比 advance 宽度窄一点。
 * 所以判据拆成三条，各自能抓到不同的错：
 *   · dl  —— 左边缘：这是**精确可对齐**的（同一段排版、同一个字体、同一个盒子）；
 *   · cy  —— 垂直中心：字体大小错了会立刻偏；
 *   · dw/ratio —— 宽度比例：字号错了这里会成比例地崩（21px vs 16px 差 24%）。
 * 外加一条包含关系：墨迹必须整体落在行盒（放宽 2px）里。
 */
function align(ink, dom) {
  if (!ink || ink.empty || !dom) return null;
  return {
    dl: ink.l - dom.l,
    cy: (ink.t + ink.b) / 2 - (dom.t + dom.b) / 2,
    dw: ink.w - dom.w,
    domW: dom.w,
    ratio: ink.w / dom.w,
    inside: ink.l >= dom.l - 2 && ink.r <= dom.r + 2 && ink.t >= dom.t - 2 && ink.b <= dom.b + 2,
  };
}

/* ==========================================================================
   场景 A：挂载 / 结构 / 层级 / GL 是否真的在画 / 字形遮罩对齐 / 读数 / 配色
   ========================================================================== */
window.__scenarioA = async function () {
  const a = await mountInstance({});
  const out = {};
  await wait(900);
  await play(a, 900, 60);
  const ab = a.ab;
  const cv = fluid(a);
  const st = state(a);
  const m0 = counters.glFrames;
  const p0 = counters.pixels.length;
  await play(a, 700, 60);
  out.mounted = {
    hasAb: !!ab,
    children: Array.from(ab.querySelectorAll(":scope > *")).map((el) => el.className),
    bgChildren: Array.from(bgRoot.querySelectorAll(".abbg > *")).map((el) => el.className),
    bgSkin: bgRoot.dataset.skin,
    bgHidden: bgRoot.hidden,
    cvW: cv.width,
    cvH: cv.height,
    cvClient: [Math.round(cv.clientWidth), Math.round(cv.clientHeight)],
    stageRect: rect(cv),
    tier: st.tier,
    flow: st.flow,
    gl: st.gl,
    render: ab.dataset.render,
    softVisibility: computed(ab.querySelector(".ab__soft"), "visibility"),
    hardVisibility: computed(cv, "visibility"),
    timer: st.timer,
    halfFloat: st.halfFloat,
    glerr: st.glerr,
    draws: st.draws,
    glms: st.glms,
    mask: st.mask,
    maskerr: st.maskerr,
    maskrev: st.maskrev,
    meas: st.meas,
    maskscale: st.maskscale,
    maskSize: [maskCv(a).width, maskCv(a).height],
    ink: inkBox(maskCv(a)),
    dom: domBox(a),
    depth: ab.querySelector(".ab__depth").textContent,
    depthAttr: st.depth,
    tc: ab.querySelector(".ab__tc").textContent,
    title: ab.querySelector(".ab__title").textContent,
    line: st.line,
    rows: ab.querySelectorAll(".ab__text .lyric").length,
    current: ab.querySelectorAll('.ab__text .lyric[aria-current="true"]').length,
    words: Array.from(ab.querySelectorAll('.ab__text .lyric[aria-current="true"] .lyric__word')).map((el) => ({ w: prop(el, "--w"), active: el.dataset.active })),
    lift: prop(ab, "--ab-lift"),
    turb: prop(ab, "--ab-turb"),
    foam: prop(ab, "--ab-foam"),
    phase: prop(ab, "--ab-phase"),
    surfaceY: rect(ab.querySelector(".ab__surface")).y,
    glowOpacity: computed(ab.querySelector(".ab__glow"), "opacity"),
    bgImgReady: bgRoot.querySelector(".abbg__img").dataset.ready,
    bgImgSrc: bgRoot.querySelector(".abbg__img").getAttribute("src") ? "set" : "",
    causticsAnim: computed(bgRoot.querySelector(".abbg__caustics"), "animation-name"),
    causticsDur: computed(bgRoot.querySelector(".abbg__caustics"), "animation-duration"),
    fluidBgAlpha: computed(cv, "background-color"),
    textBlend: computed(ab.querySelector(".ab__text"), "mix-blend-mode"),
    curFont: computed(ab.querySelector('.ab__text .lyric[aria-current="true"]'), "font-size"),
    otherFont: computed(ab.querySelector('.ab__text .lyric[aria-current="false"]'), "font-size"),
    /* ---- 观感 / 层次：这几条是"画出来到底看不看得见"的静态半边 ---- */
    /* 歌词配色必须是**本包的**（皮肤不能直接写 .lyric 的 color：lyrics.css 未分层，
       层级优先于特异性，写了也上不了屏）。这两条读的是变量落到字上的结果。 */
    curColor: computed(ab.querySelector('.ab__text .lyric[aria-current="true"]'), "color"),
    otherColor: computed(ab.querySelector('.ab__text .lyric[aria-current="false"]'), "color"),
    lyricDim: computed(ab.querySelector(".ab__text .lyrics__scroll"), "--lyric-dim"),
    lyricPad: computed(ab.querySelector(".ab__text .lyrics__scroll"), "--lyric-pad"),
    /* 暗角与遮罩必须在歌词**之前**（画在字下面）。写在字后面那圈黑会盖住字上，
       实测把 #58c7ff 压成 (27,60,77) —— 对比度 1.3:1，等于看不见。 */
    order: {
      vig: Array.from(ab.children).findIndex((el) => el.classList.contains("ab__vig")),
      scrim: Array.from(ab.children).findIndex((el) => el.classList.contains("ab__scrim")),
      text: Array.from(ab.children).findIndex((el) => el.classList.contains("ab__text")),
      hud: Array.from(ab.children).findIndex((el) => el.classList.contains("ab__hud")),
    },
    /* 当前行落在舞台的哪个高度上（0=顶 1=底）。量的是**结果**：
       --lyric-pad 曾经写死 34%（百分比内边距按**宽度**解析），首句被推到文本框最下沿，
       那里正好压着最重的暗角。 */
    curCenter: (() => {
      const el = ab.querySelector('.ab__text .lyric[aria-current="true"]') || ab.querySelector(".ab__text .lyric");
      if (!el) return -1;
      const r = el.getBoundingClientRect();
      const s = ab.getBoundingClientRect();
      return Math.round(((r.top + r.height / 2 - s.top) / s.height) * 1000) / 1000;
    })(),
    curTransform: computed(ab.querySelector('.ab__text .lyric[aria-current="true"]'), "transform"),
    surfaceBlur: computed(ab.querySelector(".ab__surface"), "filter"),
    noGlHidden: ab.querySelector(".ab__nogl").hidden,
    backdrop: a.host.rec.backdrops,
    coverReady: st.coverReady,
    maskrev: st.maskrev,
    glErrAfter: st.glerr,
  };
  out.render = { framesBefore: m0, framesAfter: counters.glFrames, c2dBefore: 0, c2dAfter: counters.c2dFrames, pixelsBefore: p0, pixels: counters.pixels.slice(p0) };
  out.state = state(a);
  /* 同一行里再跑一段：遮罩的**重画次数**不许涨 —— "每行只画一次"得能自己证明 */
  const rev1 = a.ab.dataset.maskrev;
  const lineBefore = a.ab.dataset.line;
  await play(a, 500, 60);
  out.maskRev = { rev1: rev1, rev2: a.ab.dataset.maskrev, lineBefore: lineBefore, lineAfter: a.ab.dataset.line };
  out.click = { seeks: [] };
  const r = rect(cv);
  ab.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.x + r.w * 0.5, clientY: r.y + r.h * 0.5 }));
  await wait(60);
  out.click.seeks = a.host.rec.seeks.slice();
  /* 点歌词：宿主 SDK 自己会 seek 到那一行（一次，不能重复）；
     点歌词列的空白处：根上的"按 x 求 seek"必须让路给 SDK，不许抢 */
  const before = a.host.rec.seeks.length;
  const lineEl = ab.querySelector('.ab__text .lyric[aria-current="true"]');
  lineEl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
  await wait(60);
  out.click.lineSeeks = a.host.rec.seeks.slice(before);
  const mid = a.host.rec.seeks.length;
  ab.querySelector(".ab__text .lyrics__scroll").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 4, clientY: 4 }));
  await wait(60);
  out.click.scrollSeeks = a.host.rec.seeks.length - mid;
  return out;
};

/* ==========================================================================
   场景 B：换行时遮罩重画并对齐 / 大音量与静音 / 无频谱 / 换歌涌浪 / interactive:false
   ========================================================================== */
window.__scenarioB = async function () {
  const b = await mountInstance({});
  const out = {};
  await wait(500);
  await at(b, 300, true, 300);
  const m1 = { rev: b.ab.dataset.maskrev, items: b.ab.dataset.mask, ink: inkBox(maskCv(b)), dom: domBox(b), line: b.ab.dataset.line };
  await at(b, 4600, true, 400);
  const m2 = { rev: b.ab.dataset.maskrev, items: b.ab.dataset.mask, ink: inkBox(maskCv(b)), dom: domBox(b), line: b.ab.dataset.line, err: b.ab.dataset.maskerr };
  await at(b, 9600, true, 400);
  const m3 = { rev: b.ab.dataset.maskrev, items: b.ab.dataset.mask, ink: inkBox(maskCv(b)), dom: domBox(b), line: b.ab.dataset.line, err: b.ab.dataset.maskerr };
  out.lines = { m1: m1, m2: m2, m3: m3 };
  out.align = { m1: align(m1.ink, m1.dom), m2: align(m2.ink, m2.dom), m3: align(m3.ink, m3.dom) };
  // 换歌：涌浪 + 封面重取 + 进度回零（位置由宿主给，皮肤只跟着走）
  const beforeSurge = b.ab.dataset.surge;
  const revBeforeSong = b.ab.dataset.maskrev;
  b.host.setCover(makeCover2());
  /* 真宿主换歌时补丁只带 type，曲名/封面是皮肤自己从 ctx.track()/ctx.covers() 重取的 */
  b.host.setSong({ id: "song-2", title: "第二首", artist: "", album: "", duration: 200000, kind: "local" });
  push(b, { type: "song" });
  b.host.setPosition(0, true);
  push(b, { type: "progress", position: 0, duration: 200000, playing: true });
  await wait(150);
  out.song = { surge: b.ab.dataset.surge, surgeVar: prop(b.ab, "--ab-surge"), depth: b.ab.querySelector(".ab__depth").textContent, coverReady: b.ab.dataset.coverReady, beforeSurge: beforeSurge, revChanged: b.ab.dataset.maskrev !== revBeforeSong };
  await wait(1200);
  out.song.afterSurge = b.ab.dataset.surge;
  out.song.title = b.ab.querySelector(".ab__title").textContent;
  // 静音（没有频谱）：水还在流但不涌
  const quiet = await mountInstance({ noSpectrum: true });
  await wait(700);
  const q0 = counters.glFrames;
  await wait(500);
  out.noSpec = {
    spec: quiet.ab.dataset.spec,
    hint: quiet.ab.querySelector(".ab__hint").textContent,
    lift: prop(quiet.ab, "--ab-lift"),
    frames: counters.glFrames - q0,
  };
  // interactive:false：点水面不 seek
  const passive = await mountInstance({ options: { interactive: false } });
  await wait(300);
  const rp = rect(fluid(passive));
  passive.ab.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: rp.x + 20, clientY: rp.y + 20 }));
  await wait(80);
  out.passive = { interactive: passive.ab.dataset.interactive, seeks: passive.host.rec.seeks.length };
  return out;
};

/** 第二张封面（换歌用，跟第一张不一样才算真的换了料） */
function makeCover2() {
  const cv = document.createElement("canvas");
  cv.width = 96; cv.height = 96;
  const g = cv.getContext("2d");
  g.fillStyle = "#3a1f4d";
  g.fillRect(0, 0, 96, 96);
  g.fillStyle = "#ffd166";
  g.fillRect(0, 0, 96, 40);
  return cv.toDataURL("image/png");
}

/* ==========================================================================
   场景 C：GL 不成立（把 webgl2 关掉）→ 必须无缝切 Canvas2D
   ========================================================================== */
window.__scenarioC = async function () {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, o) {
    if (String(type).indexOf("webgl") === 0) return null;
    return orig.call(this, type, o);
  };
  const out = {};
  try {
    const c = await mountInstance({});
    await wait(700);
    const f0 = counters.c2dFrames;
    const gf0 = counters.glFrames;
    await play(c, 600, 60);
    out.fallback = {
      gl: c.ab.dataset.gl,
      render: c.ab.dataset.render,
      fallback: c.ab.dataset.fallback,
      softVisibility: computed(c.ab.querySelector(".ab__soft"), "visibility"),
      hardVisibility: computed(fluid(c), "visibility"),
      tier: c.ab.dataset.tier,
      frames: counters.c2dFrames - f0,
      glFrames: counters.glFrames - gf0,
      inkReport: align(inkBox(maskCv(c)), domBox(c)),
      badgeHidden: c.ab.querySelector(".ab__nogl").hidden,
      badgeText: c.ab.querySelector(".ab__nogl").textContent,
      mask: c.ab.dataset.mask,
      ink: inkBox(maskCv(c)),
      dom: domBox(c),
      rows: c.ab.querySelectorAll(".ab__text .lyric").length,
      depth: c.ab.querySelector(".ab__depth").textContent,
      draws: c.ab.dataset.draws,
      glerr: c.ab.dataset.glerr,
      lift: prop(c.ab, "--ab-lift"),
      bgImgReady: bgRoot.querySelector(".abbg__img").dataset.ready,
    };
    const r = rect(fluid(c));
    c.ab.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.x + r.w * 0.5, clientY: r.y + r.h * 0.5 }));
    await wait(60);
    out.fallback.seeks = c.host.rec.seeks.length;
  } finally {
    HTMLCanvasElement.prototype.getContext = orig;
  }
  return out;
};

/* ==========================================================================
   场景 D：**真的**丢上下文 → 也必须无缝切（并记 glLost）
   ========================================================================== */
window.__scenarioD = async function () {
  const d = await mountInstance({});
  await wait(600);
  const cv = fluid(d);
  const gl = cv.getContext("webgl2");
  const out = { supported: !!gl, before: state(d) };
  if (!gl) return out;
  const ext = gl.getExtension("WEBGL_lose_context");
  out.hasExt = !!ext;
  const f0 = counters.c2dFrames;
  ext.loseContext();
  await wait(400);
  const mid = { state: state(d), c2d: counters.c2dFrames - f0 };
  await play(d, 500, 60);
  out.after = {
    gl: d.ab.dataset.gl,
    render: d.ab.dataset.render,
    glLost: d.ab.dataset.glLost,
    fallback: d.ab.dataset.fallback,
    softVisibility: computed(d.ab.querySelector(".ab__soft"), "visibility"),
    framesAfterLoss: counters.c2dFrames - f0,
    badge: d.ab.querySelector(".ab__nogl").hidden === false,
    rows: d.ab.querySelectorAll(".ab__text .lyric").length,
    mask: d.ab.dataset.mask,
    mid: mid,
  };
  out.loses = counters.loseContextCalls;
  return out;
};

/* ==========================================================================
   场景 E：档位（performance / 静态 / 低动效）/ 切后台 / 暂停 6 秒 / 窄窗口
   ========================================================================== */
window.__scenarioE = async function () {
  const out = {};
  /* --- performance 档：1/3 分辨率 + 24fps（数的是**真的画了几帧**） --- */
  const perf = await mountInstance({ options: { performanceMode: "performance" } });
  await wait(500);
  const pf0 = counters.glFrames + counters.c2dFrames;
  const rf0 = counters.frames;
  await play(perf, 1000, 50);
  out.perf = {
    perf: perf.ab.dataset.perf,
    tier: perf.ab.dataset.tier,
    flow: perf.ab.dataset.flow,
    rendered: counters.glFrames + counters.c2dFrames - pf0,
    rafCalls: counters.frames - rf0,
    state: state(perf),
  };
  /* --- 静态档：一个 rAF 都不进 --- */
  const still = await mountInstance({ options: { animations: false } });
  await wait(600);
  const sf0 = counters.frames;
  const sg0 = counters.glFrames + counters.c2dFrames;
  await wait(700);
  out.static = {
    animations: still.ab.dataset.animations,
    framesIdle: counters.frames - sf0,
    glIdle: counters.glFrames + counters.c2dFrames - sg0,
    canvasW: fluid(still).width,
    rows: still.ab.querySelectorAll(".ab__text .lyric").length,
    caustics: computed(bgRoot.querySelector(".abbg__caustics"), "animation-name"),
    depth0: still.ab.querySelector(".ab__depth").textContent,
  };
  const g0 = counters.glFrames + counters.c2dFrames;
  await at(still, 9600, true, 200);
  out.static.framesAfterPatch = counters.glFrames + counters.c2dFrames - g0;
  out.static.depthAfter = still.ab.querySelector(".ab__depth").textContent;
  out.static.lineAfter = still.ab.dataset.line;
  out.static.maskAfter = still.ab.dataset.mask;
  /* --- reducedMotion 也当静态档 --- */
  const low = await mountInstance({ reducedMotion: true });
  await wait(500);
  out.lowMotion = { lowMotion: low.ab.dataset.lowMotion, animations: low.ab.dataset.animations };
  /* --- 切后台 / 回前台 --- */
  const vis = await mountInstance({});
  await wait(400);
  const v0 = counters.glFrames + counters.c2dFrames;
  push(vis, { type: "visibility", foreground: false });
  await wait(700);
  const vStopped = counters.glFrames + counters.c2dFrames - v0;
  push(vis, { type: "visibility", foreground: true });
  await wait(900);
  out.visibility = { stopped: vStopped, resumed: counters.glFrames + counters.c2dFrames - v0 - vStopped, flag: vis.ab.dataset.foreground };
  /* --- 暂停 6 秒后停帧 --- */
  const idle = await mountInstance({ playing: true });
  await wait(300);
  await at(idle, 2000, false, 200);
  out.pausedAt = { idle: idle.ab.dataset.idle, playing: idle.ab.dataset.playing, flowState: idle.ab.dataset.flowState, gl: idle.ab.dataset.gl, fallback: idle.ab.dataset.fallback };
  await wait(6500);
  out.idle = { idle: idle.ab.dataset.idle };
  const i0 = counters.glFrames + counters.c2dFrames;
  await wait(600);
  out.idleFrames = counters.glFrames + counters.c2dFrames - i0;
  await at(idle, 2600, true, 400);
  out.wake = {
    idle: idle.ab.dataset.idle,
    frames: counters.glFrames + counters.c2dFrames - i0,
    flowState: idle.ab.dataset.flowState,
    gl: idle.ab.dataset.gl,
    fallback: idle.ab.dataset.fallback,
  };
  /* --- close --- */
  const close = await mountInstance({});
  await wait(300);
  push(close, { type: "close" });
  const c0 = counters.glFrames + counters.c2dFrames;
  await wait(500);
  out.close = { frames: counters.glFrames + counters.c2dFrames - c0, closed: close.ab.dataset.closed };
  /* --- 窄窗口 --- */
  const narrow = await mountInstance({});
  await wait(400);
  await at(narrow, 9600, true, 300); // 先让某一行的 aria-current 落位，再量字号
  for (let i = 0; i < 20; i += 1) {
    if (narrow.ab.querySelector('.ab__text .lyric[aria-current="true"]')) break;
    await wait(100);
  }
  narrow.host.setSize(760, 560);
  const cvEl = fluid(narrow);
  narrow.host.ctx.root.style.width = "760px";
  narrow.host.ctx.root.style.height = "560px";
  const pv = document.querySelector(".playerview");
  pv.style.width = "760px";
  pv.style.height = "560px";
  push(narrow, { type: "resize" });
  await wait(500);
  /* 无头环境里 rAF 偶尔要过两三拍才被放行：不等"当前行真的被标上"就量字号，
     量到的是还没渲染的中间态（curFont 空串）—— 那是量具抖，不是窄窗档坏了。
     有界轮询：真没渲染的话这里会超时，下面的断言照样会红。 */
  for (let i = 0; i < 30 && !narrow.ab.querySelector('.ab__text .lyric[aria-current="true"]'); i += 1) await wait(100);
  out.narrowDiag = {
    idle: narrow.ab.dataset.idle,
    line: narrow.ab.dataset.line,
    rows: narrow.ab.querySelectorAll(".ab__text .lyric").length,
    withAttr: Array.from(narrow.ab.querySelectorAll(".ab__text .lyric")).map((el) => el.getAttribute("aria-current")),
    scroller: !!narrow.ab.querySelector(".ab__text .lyrics__scroll"),
    frames: counters.frames,
    glFrames: counters.glFrames + counters.c2dFrames,
    /* 舞台里还剩几个 .ab：>1 说明卸载没清干净（有活着的僵尸实例） */
    abs: stage.querySelectorAll(".ab").length,
  };
  out.narrow = {
    narrow: narrow.ab.dataset.narrow,
    flow: narrow.ab.dataset.flow,
    cvW: cvEl.width,
    cvClient: [Math.round(cvEl.clientWidth), Math.round(cvEl.clientHeight)],
    stageRight: rect(cvEl).x + rect(cvEl).w,
    viewport: window.innerWidth,
    pageScroll: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    depthFont: computed(narrow.ab.querySelector(".ab__depth"), "font-size"),
    rows: narrow.ab.querySelectorAll(".ab__text .lyric").length,
    curFont: computed(narrow.ab.querySelector('.ab__text .lyric[aria-current="true"]'), "font-size"),
    /* 变量侧的值：窄窗口这一档**必须**走残留变量，直接给 .lyric 写 font-size 是死规则 */
    curVar: computed(narrow.ab.querySelector(".ab__text .lyrics__scroll"), "--lyric-size-active"),
    hudPad: computed(narrow.ab.querySelector(".ab__hud"), "padding-left"),
  };
  pv.style.width = "1100px";
  pv.style.height = "700px";
  return out;
};

/* ==========================================================================
   场景 G：安全区（宿主标题栏 + 详情页头部行 / 底部播放控件栏压在画面上）
   --------------------------------------------------------------------------
   清单声明了 background:true ⇒ 舞台铺满整窗（inset:0），宿主的标题栏 + 头部行
   与底栏浮在画面上，两块的高度由宿主写成 --skin-inset-top / -bottom。
   这一场按真机的 88px / 92px 挂到舞台根上，量 HUD 的**文字**落在哪 ——
   让开以前 .ab__hud 是 inset:0 + padding:22px，深度读数压在标题栏下、
   曲名与时间码压在底栏下，右下角的兜底角标（bottom:46px）也一样。
   ========================================================================== */
window.__scenarioG = async function () {
  const out = {};
  const pv = document.querySelector(".playerview");
  const setInset = (t, b) => {
    pv.style.setProperty("--skin-inset-top", t);
    pv.style.setProperty("--skin-inset-bottom", b);
  };
  const stageR = () => {
    const r = stage.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };
  const boxOf = (ab, sel) => {
    const el = ab.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };

  setInset("88px", "92px");
  const g = await mountInstance({});
  await wait(700);
  const ab = g.ab;
  /* 推进度是为了让 HUD 的读数有机会被写出来。**但安全区这条不靠它**：
     帧循环有没有在这一刻出帧是环境的事（本文件里同一份断言曾经量到 0 高的空盒子），
     所以判据是「盒子的位置」+「HUD 自己的内边距」，文字有没有写进 span 都不影响结论。 */
  await at(g, 60000, true);
  await wait(400);
  out.inset = [computed(ab, "--skin-inset-top"), computed(ab, "--skin-inset-bottom")];
  out.diag = {
    depthText: ab.querySelector(".ab__depth").textContent,
    titleText: ab.querySelector(".ab__title").textContent,
    playing: ab.dataset.playing,
    depthAttr: ab.dataset.depth,
  };
  out.main = {
    stage: stageR(),
    top: boxOf(ab, ".ab__hud-top"),
    bottom: boxOf(ab, ".ab__hud-bottom"),
    depth: boxOf(ab, ".ab__depth"),
    title: boxOf(ab, ".ab__title"),
    padTop: computed(ab.querySelector(".ab__hud"), "padding-top"),
    padBottom: computed(ab.querySelector(".ab__hud"), "padding-bottom"),
    noglBottom: computed(ab.querySelector(".ab__nogl"), "bottom"),
  };

  /* 窄窗：底栏变矮（真机 86px），而 HUD 的 padding 会被窄窗档整条覆盖 —— 最容易漏的一处 */
  g.host.setSize(760, 560);
  g.root.style.width = "760px";
  g.root.style.height = "560px";
  pv.style.width = "760px";
  pv.style.height = "560px";
  setInset("88px", "86px");
  push(g, { type: "resize" });
  await wait(600);
  out.narrow = {
    narrow: ab.dataset.narrow,
    stage: stageR(),
    top: boxOf(ab, ".ab__hud-top"),
    bottom: boxOf(ab, ".ab__hud-bottom"),
    title: boxOf(ab, ".ab__title"),
    padLeft: computed(ab.querySelector(".ab__hud"), "padding-left"),
    padTop: computed(ab.querySelector(".ab__hud"), "padding-top"),
    padBottom: computed(ab.querySelector(".ab__hud"), "padding-bottom"),
  };

  /* inset 归零（桌面背景歌词窗口没有这两块 chrome）：HUD 贴回边的 22px */
  g.root.style.width = "";
  g.root.style.height = "";
  pv.style.width = "1100px";
  pv.style.height = "700px";
  g.host.setSize(1100, 700);
  setInset("0px", "0px");
  push(g, { type: "resize" });
  await wait(500);
  out.zero = {
    stage: stageR(),
    top: boxOf(ab, ".ab__hud-top"),
    bottom: boxOf(ab, ".ab__hud-bottom"),
    padTop: computed(ab.querySelector(".ab__hud"), "padding-top"),
    padBottom: computed(ab.querySelector(".ab__hud"), "padding-bottom"),
  };
  pv.style.removeProperty("--skin-inset-top");
  pv.style.removeProperty("--skin-inset-bottom");
  return out;
};

/* ==========================================================================
   场景 F：卸载（自己清干净 + 背景层归还 + GL 资源真的还了 + 之后不许再有帧）
   ========================================================================== */
window.__scenarioF = async function () {
  const f = await mountInstance({});
  await wait(600);
  const before = {
    rootConnected: f.root.isConnected,
    hasAb: !!f.ab,
    bgChildren: bgRoot.querySelectorAll(".abbg").length,
    bgImg: !!bgRoot.querySelector(".abbg__img"),
    loses: counters.loseContextCalls,
  };
  const l0 = counters.loseContextCalls;
  const g0 = counters.glFrames;
  skin.destroy(f.host.ctx);
  await wait(500);
  const out = {
    before: before,
    rootConnected: f.root.isConnected,
    hasAb: !!f.ab,
    abConnected: f.ab ? f.ab.isConnected : false,
    rootHtml: f.root.innerHTML,
    rootStillConnected: f.root.isConnected,
    stageHadThisRoot: stage.contains(f.root),
    bgChildren: bgRoot.querySelectorAll(".abbg").length,
    bgHtml: bgRoot.innerHTML,
    bgHidden: bgRoot.hidden,
    bgSkin: bgRoot.dataset.skin || "",
    loses: counters.loseContextCalls - l0,
    framesAfter: counters.glFrames - g0,
    updateAfterDestroy: "",
  };
  await wait(500);
  out.framesAfter2 = counters.glFrames - g0;
  try {
    skin.update(f.host.ctx, { type: "progress", position: 1000, duration: 240000, playing: true });
    out.updateAfterDestroy = "ok";
  } catch (e) {
    out.updateAfterDestroy = String(e && e.message ? e.message : e);
  }
  stage.removeChild(f.root);
  out.stageChildrenGone = !stage.contains(f.root);
  return out;
};
</script>
</body>
</html>`;

/* --------------------------------------------------------------------------
   1. 静态服务
   -------------------------------------------------------------------------- */
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

function serve(baseDir, req, res) {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  const file = join(baseDir, decodeURIComponent(path));
  if (!file.startsWith(baseDir) || !existsSync(file) || !readFileSync) return false;
  try {
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
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
  /* 宿主的样式表必须按真机那样进来（未分层）：
     · lyrics.css 是**在宿主里注入的、未分层**的样式 —— @layer 里的声明永远赢不了它。
       旧版自检没加载它，于是"皮肤写的 .lyric 颜色到底上不上得了屏"这一条从来没被验过，
       而真机上正是它把当前行压成了主题的灰蓝。
     · base.css 给全局 `box-sizing: border-box`，直接决定 .lyrics__scroll 的高度怎么算
       （content-box 下 height:100% + 百分比内边距会撑成一个 1206px 的怪盒子）。
     · tokens.css 提供主题默认值 —— 本包的配色**必须**盖过它。 */
  if (path.startsWith("/host/")) {
    const f = path.slice("/host/".length);
    const files = {
      "base.css": join(REPO_ROOT, "frontend", "src", "styles", "base.css"),
      "tokens.css": join(REPO_ROOT, "frontend", "src", "styles", "tokens.css"),
      "lyrics.css": join(SDK_ROOT, "lyrics.css"),
    };
    const file = files[f];
    if (file && existsSync(file)) {
      res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
      res.end(readFileSync(file));
      return;
    }
    res.writeHead(404).end("not found");
    return;
  }
  if (!serve(PKG_ROOT, req, res)) res.writeHead(404).end("not found");
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* --------------------------------------------------------------------------
   2. 无头 Edge + CDP
   --------------------------------------------------------------------------
   注意：**不加 `--disable-gpu`** —— 这一款要验的就是真 WebGL2。
   （探针 P1 在真机 WebView2 上量到 ANGLE/D3D11；无头 Edge 走同一套 ANGLE。）
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
const px = (v) => parseFloat(String(v));
const num = (v) => Number(v);
const ms = (v) => (/ms$/i.test(String(v)) ? parseFloat(v) : parseFloat(v) * 1000);
/** 遮罩对齐的判据（页面里的 align() 是同一套算法，这里再算一遍给断言用） */
function align(ink, dom) {
  if (!ink || ink.empty || !dom) return null;
  return {
    dl: ink.l - dom.l,
    cy: (ink.t + ink.b) / 2 - (dom.t + dom.b) / 2,
    dw: ink.w - dom.w,
    domW: dom.w,
    ratio: ink.w / dom.w,
    inside: ink.l >= dom.l - 2 && ink.r <= dom.r + 2 && ink.t >= dom.t - 2 && ink.b <= dom.b + 2,
  };
}
function aligned(a) {
  if (!a) return false;
  return (
    Math.abs(a.dl) <= 2 &&
    Math.abs(a.cy) <= 3 &&
    Math.abs(a.dw) <= Math.max(6, 0.08 * a.domW) &&
    a.ratio > 0.9 &&
    a.inside === true
  );
}

if (!EDGE) {
  console.error("找不到 msedge.exe —— 这一项自检需要本机装 Edge（系统自带）。");
  check(false, "本机有 Edge", "未找到 msedge.exe");
  server.close();
  process.exitCode = 1;
} else {
  const OUT = join(tmpdir(), "abyss-check-" + Date.now());
  mkdirSync(OUT, { recursive: true });
  const CDP_PORT = 9950 + Math.floor(Math.random() * 40);
  const edge = spawn(
    EDGE,
    [
      "--headless=new",
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--use-angle=d3d11",
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

    /* 在页面**最前面**打点（只数不拖帧）：
       · rAF 回调数
       · GL 的 drawArrays：数笔数，并在**成画那一笔**（默认帧缓冲）之后立刻 readPixels
         取 16×4 的指纹 —— 这是"水真的在流"的唯一硬证据（自己报的计数不算）
       · 2D 画布的 clearRect：兜底渲染器每帧开头都会清屏，用它数"兜底真的画了几帧"
       · WEBGL_lose_context.loseContext：数 destroy 有没有真的还上下文 */
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          const counters = { frames: 0, glDraws: 0, glFrames: 0, c2dFrames: 0, pixels: [], loseContextCalls: 0, glAvailable: false };
          window.__counters = counters;
          const raf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (cb) => raf((t) => { counters.frames += 1; cb(t); });
          const sum = (b) => { let h = 0; for (let i = 0; i < b.length; i++) h = (h * 31 + b[i]) >>> 0; return h; };
          if (window.WebGL2RenderingContext) {
            counters.glAvailable = true;
            const orig = WebGL2RenderingContext.prototype.drawArrays;
            WebGL2RenderingContext.prototype.drawArrays = function () {
              const r = orig.apply(this, arguments);
              counters.glDraws += 1;
              try {
                if (this.getParameter(this.FRAMEBUFFER_BINDING) === null) {
                  counters.glFrames += 1;
                  const w = this.drawingBufferWidth, h = this.drawingBufferHeight;
                  if (w > 32 && h > 32 && counters.pixels.length < 400) {
                    const buf = new Uint8Array(16 * 4 * 4);
                    this.readPixels(Math.max(0, (w >> 1) - 8), Math.max(0, (h >> 1) - 2), 16, 4, this.RGBA, this.UNSIGNED_BYTE, buf);
                    counters.pixels.push(sum(buf));
                  }
                }
              } catch (e) { counters.pixelError = String(e && e.message ? e.message : e); }
              return r;
            };
          }
          const oc = CanvasRenderingContext2D.prototype.clearRect;
          CanvasRenderingContext2D.prototype.clearRect = function () {
            // 只数**兜底画布**的清屏：字形遮罩画布也会 clearRect，混在一起就不是"帧数"了
            const cls = this.canvas && this.canvas.className ? String(this.canvas.className) : "";
            if (cls.indexOf("ab__soft") >= 0) counters.c2dFrames += 1;
            return oc.apply(this, arguments);
          };
          const g2 = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
          if (g2) {
            const og = g2.getExtension;
            g2.getExtension = function (name) {
              const ext = og.apply(this, arguments);
              if (name === "WEBGL_lose_context" && ext && !ext.__wrapped) {
                const ol = ext.loseContext.bind(ext);
                ext.loseContext = function () { counters.loseContextCalls += 1; return ol(); };
                ext.__wrapped = 1;
              }
              return ext;
            };
          }
        })();
      `,
    });

    await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 760, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: BASE + "/__harness.html" });
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      await sleep(300);
      ready = await evaluate("!!window.__scenarioA && !!window.__scenarioF && !!window.__scenarioG && !!window.__counters");
      if (ready === true) break;
    }

    if (ready !== true) {
      console.error("页面没准备好：", j(ready));
      check(false, "自检页面加载", j(ready));
    } else {
      /* ---------------- A ---------------- */
      console.log("\n[1] 挂载 / 层次结构 / 背景层 / GL 真的在画 / 遮罩对齐 / 读数 / 配色 / 可读性");
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
        check(M.hasAb === true, "样式能挂载并渲染");
        check(
          M.children.join("|") ===
            "ab__fluid|ab__soft|ab__mask|ab__glow|ab__surface|ab__vig|ab__scrim|ab__text|ab__hud|ab__nogl",
          "舞台里十件齐全，且层次顺序正确（GL 水/兜底水/遮罩/光晕/液面/暗角/暗底/歌词/HUD/兜底角标）",
          j(M.children)
        );
        check(
          M.order.vig >= 0 && M.order.vig < M.order.scrim && M.order.scrim < M.order.text && M.order.text < M.order.hud,
          "暗角与暗底都画在歌词**下面**（画在上面就是把字压黑）",
          j(M.order)
        );
        check(M.render === "gl" && M.softVisibility === "hidden", "GL 档位下兜底画布是藏起来的（两张画布、布局一致）", j([M.render, M.softVisibility]));
        check(M.bgChildren.join("|") === "abbg__img|abbg__deep|abbg__caustics", "整窗背景层三件齐全（封面/深度分层/光斑）", j(M.bgChildren));
        check(M.bgSkin === "abyss" && M.bgHidden === false, "背景容器由本包接管（background:true）", j([M.bgSkin, M.bgHidden]));
        check(M.cvW > 0 && M.cvH > 0 && M.cvW === M.stageRect.w && M.cvH === M.stageRect.h, "画布像素尺寸 = 舞台盒子（dpr 1）", j([M.cvW, M.cvH, M.stageRect]));
        check(M.cvClient[0] === M.stageRect.w && M.cvClient[1] === M.stageRect.h, "画布铺满舞台", j(M.cvClient));
        check(M.gl === "1", "拿到了 webgl2（真机是 ANGLE/D3D11，探针 P1）", j([M.gl, A.state?.glFail, A.state?.glLost]));
        check(M.rows === 4 && M.current === 1, "宿主 SDK 的真歌词视图建在 .ab__text 里（4 行 / 一个当前行）", j([M.rows, M.current]));
        check(M.line === "0", "当前行跟着进度走", M.line);
        check(M.words.length === 10 && M.words.every((w) => w.w !== ""), "逐字填充量 --w 每帧在写（10 个字素）", j(M.words.map((w) => w.w)));
        check(M.words.some((w) => w.active === "true"), "唱到的字素被点亮", j(M.words.map((w) => w.active)));
        check(M.textBlend === "screen", "歌词与水混合（mix-blend-mode，@scope 之后仍生效）", M.textBlend);
        check(M.curFont === "32px" && M.otherFont === "23px", "当前行放大（只改字号，不改 transform）", j([M.curFont, M.otherFont]));
        check(
          /^rgba?\(88, 199, 255/.test(M.curColor) && /^rgba?\(223, 242, 255/.test(M.otherColor),
          "歌词配色走的是本包的配色（--accent / --text-1），盖过了主题 tokens（未分层的 lyrics.css 只能靠变量绕）",
          j([M.curColor, M.otherColor])
        );
        check(parseFloat(M.lyricDim) >= 0.35, "非当前行没有暗到看不见（--lyric-dim）", M.lyricDim);
        check(
          M.curCenter > 0.34 && M.curCenter < 0.66,
          "当前行落在舞台纵向中部（首句不被顶到框底、不顶到框顶）",
          j({ curCenter: M.curCenter, lyricPad: M.lyricPad })
        );
        check(M.curTransform === "none", "当前行没有 transform 缩放（一缩遮罩就对不齐）", M.curTransform);
        check(M.surfaceBlur.includes("blur"), "液面是渐变 + 模糊画的", M.surfaceBlur.slice(0, 30));
        check(M.causticsAnim === "ab-caustics", "@keyframes 被 @layer+@scope 包住之后仍然有效", M.causticsAnim);
        check(ms(M.causticsDur) >= 20000, "背景光斑极慢（42 秒级，不抢注意力）", M.causticsDur);
        check(M.bgImgReady === "1" && M.bgImgSrc === "set", "封面进了背景层（data-ready 由 load 事件置位）", j([M.bgImgReady, M.bgImgSrc]));
        check(M.coverReady === "1", "封面被采样成密度场（128×128 → 256×256，再抹一遍）", M.coverReady);
        check(px(M.lift) > 0.05, "低频把液面抬起来了（--ab-lift 在动）", M.lift);
        check(px(M.turb) > 0.05 && px(M.foam) > 0.05, "湍流与泡沫也在动", j([M.turb, M.foam]));
        check(M.phase !== "" && px(M.phase) >= 0, "泵浦相位在写（歌曲钟积分出来的）", M.phase);
        check(M.depth === "− 13 m" || /^− \d+ m$/.test(M.depth), "下潜深度读数（− N m）", M.depth);
        check(num(M.depthAttr) >= 0 && num(M.depthAttr) < 2400, "深度落在 0..2400m 内", M.depthAttr);
        check(/^\d\d:\d\d \/ \d\d:\d\d$/.test(M.tc), "时间码在", M.tc);
        check(M.title === "深渊测试曲", "HUD 曲名在", M.title);
        check(M.noGlHidden === true, "GL 正常时不显示兜底角标", j(M.noGlHidden));
        check(M.glerr === "0" && (M.glerrcode === "0" || M.glerrcode === undefined), "一整轮下来 GL 错误为 0（反馈环会留下 1282）", j([M.glerr, M.glerrcode]));
        check(A.render.framesAfter - A.render.framesBefore >= 6, "GL 真的在出帧（默认帧缓冲上的绘制次数）", j(A.render));
        const px0 = A.render.pixels;
        const uniq = new Set(px0).size;
        check(uniq >= 3, "成画那一笔的像素指纹随时间变化（水真的在流，不是一张静止的图）", j({ frames: px0.length, uniq }));
        check(["full", "half", "third"].includes(M.tier), "分辨率档位是三个合法档之一", M.tier);
        const factor = M.tier === "full" ? 1 : M.tier === "half" ? 0.5 : 1 / 3;
        const flow = (M.flow || "0x0").split("x").map(num);
        check(
          Math.abs(flow[0] - Math.round(M.cvW * factor)) <= 1 && Math.abs(flow[1] - Math.round(M.cvH * factor)) <= 1,
          "流场分辨率 = 舞台 × 当前档位（不是嘴上说说）",
          j([M.flow, M.tier, M.cvW, M.cvH, factor])
        );
        check(M.tier === "half" || A.state.tierMove === "up", "档位要么还在默认半分辨率，要么是被 GPU 时间证明够快才升上去的（data-tier-move）", j([M.tier, A.state.tierMove, A.state.glms]));
        check(M.timer === "1", "GPU 计时器扩展可用（探针 P1 在真机也量到）", M.timer);
        const glms = px(M.glms);
        check(Number.isFinite(glms) && glms > 0 && glms < 60, "GPU 时间被真的量出来（不是 finish 的假 0ms）", j([M.glms, M.meas]));
        /* --- 遮罩：一份排版渲染两次 --- */
        check(num(M.mask) === 10, "字形遮罩画了 10 段（当前行 10 个字素，一段一个盒子）", M.mask);
        check(M.ink && !M.ink.empty && M.ink.w > 40 && M.ink.h > 4, "遮罩里有真的墨迹", j(M.ink));
        check(M.dom && M.dom.w > 40, "DOM 那一侧的文本框也量到了", j(M.dom));
        const al = align(M.ink, M.dom);
        check(aligned(al), "**一份排版渲染两次对得上**：遮罩墨迹 vs DOM 文字（左边缘 ≤2px / 中心 ≤3px / 宽度比例 >0.9 / 整体包含）", j(al));
        check(num(M.maskerr) <= 4, "data-maskerr 也在 4px 内", M.maskerr);
        check(num(M.maskrev) >= 1, "遮罩重画次数可观测（data-maskrev）", M.maskrev);
        check(A.maskRev.rev2 === A.maskRev.rev1 && A.maskRev.lineAfter === A.maskRev.lineBefore, "同一行里跑 500ms 遮罩**一次都没重画**（每行只画一次）", j(A.maskRev));
        /* --- 交互 --- */
        check(A.click.seeks.length === 1 && A.click.seeks[0] > 0 && A.click.seeks[0] < 240000, "点水面 = 按 x 比例 seek", j(A.click.seeks));
        check(A.click.lineSeeks.length === 1 && A.click.lineSeeks[0] === 0, "点歌词行：宿主 SDK 自己 seek 到那一行（只一次，根上不重复处理）", j(A.click.lineSeeks));
        check(A.click.scrollSeeks === 0, "点歌词列的空白处也让路给 SDK（不抢成按 x 求 seek）", j(A.click.scrollSeeks));
        /* --- 配色 --- */
        check(A.mounted.backdrop.length >= 1, "挂载后上报了宿主壳配色（防抖后一次）", j(A.mounted.backdrop.length));
        const pal = A.mounted.backdrop[0] || MANIFEST.colors;
        const cInk = wcag(pal.bg, pal.fg);
        const cManifest = wcag(MANIFEST.colors.bg, MANIFEST.colors.fg);
        check(cInk >= 3.9, "上报的配色对比度 ≥ 3.9（深海底色与冰蓝字）", cInk.toFixed(2));
        check(cManifest >= 4.5, "清单里的配色对比度 ≥ 4.5", cManifest.toFixed(2));
        /* --- 真的画出来了吗 ---
           上面全是"DOM 属性对不对"。它们**全都绿也挡不住**"字被暗角盖成 1.3:1"
           这类事故（历史上一整轮 125 项全绿，而屏幕上的歌词对比度是 1.31:1）。
           这一条读的是 CDP 截下来的**合成后真实像素**：把当前行那一带截图，
           取亮度中位数当"底"、最亮 1% 当"字"，算 WCAG。 */
        const band = await evaluate(`(() => {
          const el = document.querySelector('.ab__text .lyric[aria-current="true"]') || document.querySelector('.ab__text .lyric');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: r.width + 12, height: r.height + 12 };
        })()`);
        if (!band?.width) {
          check(false, "当前行的盒子能量到（可读性断言的前提）", j(band));
        } else {
          const shot = await send("Page.captureScreenshot", {
            format: "png",
            clip: { x: band.x, y: band.y, width: band.width, height: band.height, scale: 1 },
          });
          const an = await evaluate(`(async () => {
            const bin = atob(${JSON.stringify(shot?.data || "")});
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i);
            const bmp = await createImageBitmap(new Blob([buf], { type: "image/png" }));
            const cv = new OffscreenCanvas(bmp.width, bmp.height);
            const g = cv.getContext("2d");
            g.drawImage(bmp, 0, 0);
            const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
            const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
            const rows = [];
            for (let i = 0; i < d.length; i += 4) {
              rows.push([0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]), d[i], d[i + 1], d[i + 2]]);
            }
            rows.sort((a, b) => a[0] - b[0]);
            const mid = rows[Math.floor(rows.length / 2)];
            const top = rows[Math.min(rows.length - 1, Math.floor(rows.length * 0.99))];
            return { bg: [mid[1], mid[2], mid[3]], fg: [top[1], top[2], top[3]], n: rows.length, w: bmp.width, h: bmp.height };
          })()`);
          if (!an || an.__error || !an.fg) {
            check(false, "截下来的像素读得出来（可读性断言）", j(an && (an.__error || an)));
          } else {
            const c = wcagRgb(an.bg, an.fg);
            check(
              c >= 4.5,
              "**当前行在合成后的真实像素上对比度 ≥ 4.5:1**（低于 3:1 就是「歌词看不清」）",
              `${c.toFixed(2)}:1  底=${an.bg} 字=${an.fg} 裁切=${an.w}x${an.h}`
            );
          }
        }
      }

      /* ---------------- B ---------------- */
      console.log("\n[2] 换行 → 遮罩重画并对齐 / 换歌涌浪 / 无频谱 / interactive:false");
      let B;
      try {
        B = await evaluate("window.__scenarioB()");
      } catch (e) {
        B = brief(e);
      }
      if (B?.__error || B?.error) {
        check(false, "场景 B 跑通", j(B.__error || B.error));
      } else {
        const L = B.lines;
        check(L.m1.line === "0" && L.m2.line === "1" && L.m3.line === "2", "三句各归各行", j([L.m1.line, L.m2.line, L.m3.line]));
        check(num(L.m1.items) === 10 && num(L.m2.items) === 1 && num(L.m3.items) === 1, "有字级的行按字素切（10 段），没字级的行退回整行（1 段）", j([L.m1.items, L.m2.items, L.m3.items]));
        check(L.m1.rev !== L.m2.rev && L.m2.rev !== L.m3.rev, "换行才重画遮罩（rev 递增，不是每帧重画）", j([L.m1.rev, L.m2.rev, L.m3.rev]));
        for (const k of ["m1", "m2", "m3"]) {
          check(aligned(B.align[k]), `第 ${k} 行的遮罩与 DOM 文字仍然对齐（左 ≤2px / 中心 ≤3px / 比例 >0.9）`, j({ a: B.align[k], err: L[k].err }));
        }
        check(B.song.surgeVar !== "" && px(B.song.surgeVar) >= 0, "换歌时水面涌浪变量在写", B.song.surgeVar);
        check(B.song.surge !== "0" || px(B.song.surgeVar) > 0, "换歌那一下真的涌起来了（不是只写了个 0）", j([B.song.surge, B.song.surgeVar]));
        check(B.song.revChanged === true, "换歌后遮罩也重画了", j(B.song.revChanged));
        check(num(B.song.depth.replace(/[^\d]/g, "")) <= 5, "换歌后深度读数回到水面附近（不是留在上一首的深度）", j(B.song.depth));
        check(B.song.title === "第二首", "HUD 曲名跟着换", B.song.title);
        check(B.song.coverReady === "1", "换歌后新封面被采样", B.song.coverReady);
        check(B.song.afterSurge === "0" || B.song.afterSurge === undefined, "涌浪是一次的（过后归零）", j(B.song.afterSurge));
        check(B.noSpec.spec === "0", "拿不到频谱时如实标记 data-spec=0", B.noSpec.spec);
        check(/频谱/.test(B.noSpec.hint), "提示写清了原因", B.noSpec.hint);
        check(px(B.noSpec.lift) < 0.3, "没有频谱时液面落回去（不假装在涌）", B.noSpec.lift);
        check(B.noSpec.frames >= 6, "但水还在流（不是整屏冻住）", j(B.noSpec.frames));
        check(B.passive.interactive === "0" && B.passive.seeks === 0, "interactive:false 时点水面不 seek", j(B.passive));
      }

      /* ---------------- C ---------------- */
      console.log("\n[3] 拿不到 webgl2 → 无缝切 Canvas2D 伪流体（不白屏）");
      let C;
      try {
        C = await evaluate("window.__scenarioC()");
      } catch (e) {
        C = brief(e);
      }
      if (C?.__error || C?.error) {
        check(false, "场景 C 跑通", j(C.__error || C.error));
      } else {
        const F = C.fallback;
        check(F.gl === "0" && F.fallback === "1", "如实标记 data-gl=0 / data-fallback=1", j([F.gl, F.fallback]));
        check(F.render === "2d" && F.softVisibility === "visible" && F.hardVisibility === "hidden", "切到兜底画布（GL 画布藏起来、布局盒子不变）", j([F.render, F.softVisibility, F.hardVisibility]));
        check(F.badgeHidden === false && /Canvas2D/.test(F.badgeText), "屏角给出兜底说明（不假装跑的是 GL）", F.badgeText);
        check(F.frames >= 6, "兜底真的在重画（数的是 2D 画布每帧的 clearRect）", j(F.frames));
        check(F.glFrames === 0, "这一段确实一次 GL 都没走", j(F.glFrames));
        check(F.tier === "fallback", "档位标记如实写成 fallback", F.tier);
        check(num(F.mask) >= 1 && F.ink && !F.ink.empty, "兜底下字形遮罩照样在画（暗刻要用它）", j([F.mask, F.ink]));
        check(aligned(F.inkReport), "兜底的字形遮罩与 DOM 文字也对齐", j(F.inkReport));
        check(F.rows === 4, "歌词照旧", F.rows);
        check(/^− \d+ m$/.test(F.depth), "读数照旧", F.depth);
        check(px(F.lift) > 0.05, "兜底也吃频谱（液面照抬）", F.lift);
        check(F.bgImgReady === "1", "背景层封面照旧", F.bgImgReady);
        check(F.seeks === 1, "兜底下交互照旧", j(F.seeks));
        check(F.glerr === undefined || F.glerr === "0", "没有 GL 就没有 GL 错误", j(F.glerr));
      }

      /* ---------------- D ---------------- */
      console.log("\n[4] 真的丢上下文（WEBGL_lose_context）→ 也必须无缝切");
      let D;
      try {
        D = await evaluate("window.__scenarioD()");
      } catch (e) {
        D = brief(e);
      }
      if (D?.__error || D?.error) {
        check(false, "场景 D 跑通", j(D.__error || D.error));
      } else if (!D.supported) {
        check(false, "无头 Edge 里 webgl2 可用（否则这一场景无从验起）", j(D.before));
      } else {
        const X = D.after;
        check(D.hasExt === true, "WEBGL_lose_context 可用（真机探针 P1 也量到）", j(D.hasExt));
        check(X.gl === "0" && X.fallback === "1", "上下文丢了之后如实切成兜底", j([X.gl, X.fallback]));
        check(X.render === "2d" && X.softVisibility === "visible", "兜底画布顶上来（GL 画布藏起来）", j([X.render, X.softVisibility]));
        check(X.glLost === "1", "记下 data-glLost=1（不是静默变糊）", X.glLost);
        check(X.framesAfterLoss >= 5, "丢上下文之后画面继续（兜底在重画）", j(X.framesAfterLoss));
        check(X.badge === true, "兜底角标出现", j(X.badge));
        check(X.rows === 4 && num(X.mask) >= 1, "歌词与字形遮罩照旧", j([X.rows, X.mask]));
      }

      /* ---------------- E ---------------- */
      console.log("\n[5] performance / 静态 / 低动效 / 切后台 / 暂停 6 秒 / 窄窗口");
      let E;
      try {
        E = await evaluate("window.__scenarioE()");
      } catch (e) {
        E = brief(e);
      }
      if (E?.__error || E?.error) {
        check(false, "场景 E 跑通", j(E.__error || E.error));
      } else {
        check(E.perf.perf === "1" && E.perf.tier === "third", "performance 档落到 1/3 分辨率", j([E.perf.perf, E.perf.tier]));
        const pf = (E.perf.flow || "0x0").split("x").map(num);
        check(pf[0] > 0 && pf[0] <= E.perf.state?.frames + 1e9, "流场分辨率有值", E.perf.flow);
        check(E.perf.rendered >= 15 && E.perf.rendered <= 30, "按 24fps 封顶渲染（数的是真的出帧数）", j({ rendered: E.perf.rendered, rafCalls: E.perf.rafCalls }));
        check(E.perf.rafCalls > E.perf.rendered, "rAF 回调多于出帧（限帧真的生效）", j([E.perf.rafCalls, E.perf.rendered]));
        check(E.static.animations === "0", "静态档标记在", j(E.static.animations));
        check(E.static.framesIdle === 0 && E.static.glIdle === 0, "静态档一个帧都没有（rAF 与画面两处都数了）", j(E.static));
        check(E.static.canvasW > 0 && E.static.rows === 4, "静态档画面与歌词都在", j([E.static.canvasW, E.static.rows]));
        check(E.static.caustics === "none", "静态档关掉 CSS 动画", E.static.caustics);
        check(E.static.framesAfterPatch >= 1, "补丁来了同步画一帧（不走帧循环）", j(E.static.framesAfterPatch));
        check(E.static.lineAfter === "2" && /^− \d+ m$/.test(E.static.depthAfter), "静态档读数也跟着进度走", j([E.static.lineAfter, E.static.depthAfter]));
        check(E.static.maskAfter !== undefined && num(E.static.maskAfter) >= 1, "静态档遮罩也重画了", j(E.static.maskAfter));
        check(E.lowMotion.lowMotion === "1" && E.lowMotion.animations === "0", "reducedMotion 当静态档（不硬播动画）", j(E.lowMotion));
        check(E.visibility.stopped <= 2, "切后台后停帧", j(E.visibility.stopped));
        check(E.visibility.resumed > 5, "回前台继续画", j(E.visibility.resumed));
        check(E.visibility.flag === "1", "前台标记回来了", E.visibility.flag);
        check(E.pausedAt.playing === "0" && E.pausedAt.idle !== "1", "刚暂停还没停帧（idle 未置位）", j(E.pausedAt));        check(E.pausedAt.flowState === "still", "暂停后水被标记成 still（读数不撒谎）", E.pausedAt.flowState);
        check(E.idle.idle === "1", "暂停 6 秒后打上 idle", j(E.idle));
        check(E.idleFrames <= 2, "idle 之后不再出帧", j(E.idleFrames));
        check(E.wake.idle !== "1" && E.wake.frames > 5, "恢复播放立刻继续画（idle 撤掉）", j(E.wake));
        check(E.close.frames <= 2 && E.close.closed === "1", "close 之后停帧并打标记", j(E.close));
        check(E.narrow.narrow === "1", "窄窗口标记生效", E.narrow.narrow);
        check(E.narrow.cvClient[0] <= 760 && E.narrow.cvW === E.narrow.cvClient[0], "窄窗口画布跟着新盒子（dpr 1）", j(E.narrow));
        check(E.narrow.stageRight <= E.narrow.viewport, "舞台没有越出视口", j([E.narrow.stageRight, E.narrow.viewport]));
        check(E.narrow.pageScroll <= 1, "窄窗口下没有横向滚动", j(E.narrow.pageScroll));
        check(
          E.narrow.rows === 4 && E.narrow.curFont === "26px" && E.narrow.curFont === E.narrow.curVar && E.narrow.depthFont === "13px",
          "窄窗口字号收了一档（32/23 → 26/19，走 --lyric-* 变量，不是给 .lyric 写 font-size）",
          j([E.narrow.rows, E.narrow.curFont, E.narrow.curVar, E.narrow.depthFont, E.narrowDiag])
        );
        const nf = (E.narrow.flow || "0x0").split("x").map(num);
        check(nf[0] > 0 && nf[0] < E.narrow.cvClient[0], "窄窗口流场分辨率仍然小于画布（半分辨率）", j([E.narrow.flow, E.narrow.cvW]));
      }

      /* ---------------- G ---------------- */
      console.log("\n[7] 安全区（宿主标题栏 + 头部行 / 底栏压在画面上）");
      let G;
      try {
        G = await evaluate("window.__scenarioG()");
      } catch (e) {
        G = brief(e);
      }
      if (G?.__error || G?.error) {
        check(false, "场景 G 跑通", j(G.__error || G.error));
      } else {
        check(G.inset[0] === "88px" && G.inset[1] === "92px", "舞台根把 --skin-inset-* 传到了插件里", j(G.inset));
        check(
          px(G.main.padTop) >= 88 && px(G.main.padBottom) >= 92,
          "主窗口：HUD 的内边距把安全区吃进了自己（上 ≥88 / 下 ≥92，不是只让外框躲开）",
          j([G.main.padTop, G.main.padBottom])
        );
        check(
          G.main.top && G.main.top.top >= G.main.stage.top + 88,
          "主窗口：顶部那行读数在标题栏 + 头部行（88px）之下",
          j([G.main.top, G.main.depth, G.main.stage])
        );
        check(
          G.main.title && G.main.title.h > 0 && G.main.title.bottom <= G.main.stage.bottom - 92,
          "主窗口：曲名真的渲染了、且整个落在底栏（92px）之上",
          j([G.main.title, G.main.stage, G.diag])
        );
        check(px(G.main.noglBottom) >= 92, "兜底角标也让开了底栏（bottom ≥ inset）", G.main.noglBottom);
        check(G.narrow.narrow === "1", "窄窗档标记生效", G.narrow.narrow);
        check(G.narrow.padLeft === "16px", "窄窗档仍然只收横向内边距", G.narrow.padLeft);
        check(
          px(G.narrow.padTop) >= 88 && px(G.narrow.padBottom) >= 86,
          "窄窗档：padding 覆盖没有把安全区吃掉（底栏 86px）",
          j([G.narrow.padTop, G.narrow.padBottom, G.narrow])
        );
        check(
          G.narrow.title && G.narrow.title.h > 0 && G.narrow.title.bottom <= G.narrow.stage.bottom - 86,
          "窄窗档：曲名整个落在底栏（86px）之上",
          j([G.narrow.title, G.narrow.stage])
        );
        check(
          G.zero.top && G.zero.bottom && G.zero.top.top <= G.zero.stage.top + 30 && G.zero.bottom.bottom >= G.zero.stage.bottom - 30,
          "inset 归零（桌面背景歌词窗口）后 HUD 贴回边的 22px",
          j(G.zero)
        );
      }

      /* ---------------- F ---------------- */
      console.log("\n[8] 卸载（自己清干净 / 背景层归还 / GL 资源真的还了 / 之后不许再有帧）");
      let F;
      try {
        F = await evaluate("window.__scenarioF()");
      } catch (e) {
        F = brief(e);
      }
      if (F?.__error || F?.error) {
        check(false, "场景 F 跑通", j(F.__error || F.error));
      } else {
        check(F.before.rootConnected === true && F.before.hasAb === true, "卸载前挂载点与 .ab 都在", j(F.before));
        check(F.rootStillConnected === true && F.stageHadThisRoot === true, "皮肤没有去删宿主给的挂载点（清空是自己的事，摘节点是宿主的）", j([F.rootStillConnected, F.stageHadThisRoot]));
        check(F.hasAb === true && F.abConnected === false, "自己那棵树脱离文档（引用还在，但已不在 DOM 上）", j([F.hasAb, F.abConnected]));
        check(F.rootHtml === "", "挂载点里一个节点都不剩", j(F.rootHtml));
        check(F.stageChildrenGone === true, "宿主摘掉挂载点后舞台上不再有它", j(F.stageChildrenGone));
        check(F.bgChildren === 0 && F.bgHtml === "" && F.bgHidden === true && F.bgSkin === "", "背景层内容清空、收回、data-skin 抹掉（background:true 的归还）", j([F.bgChildren, F.bgHtml, F.bgHidden, F.bgSkin]));
        check(F.loses >= 1, "destroy 时真的调了 WEBGL_lose_context.loseContext（显存不等 GC）", j(F.loses));
        check(F.framesAfter <= 2 && F.framesAfter2 <= 2, "destroy 之后不再出帧", j([F.framesAfter, F.framesAfter2]));
        check(F.updateAfterDestroy === "ok", "destroy 之后再收 update 不抛异常", j(F.updateAfterDestroy));
      }

      console.log("\n[9] 控制台必须干净");
      const noisy = errors.filter((e) => !/404|Failed to load resource|net::ERR|WebGL.*(lost|context)/i.test(e));
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
