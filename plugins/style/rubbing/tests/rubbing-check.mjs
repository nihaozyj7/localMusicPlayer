/* ==========================================================================
   rubbing-check.mjs — 「拓印」在真实浏览器里的观感与契约自检
   --------------------------------------------------------------------------
   ★ 这个脚本属于**第三方样式包自己**，与播放器项目源码零耦合：

     · 自己起一个只读静态服务，只把本样式包目录暴露出去；
     · 自己在页面里搭「假宿主」（ctx 的取值函数 + sdk + actions），
       不 import 宿主的 store / playerhost / 契约包；
     · 歌词直接按契约的 `lines` 形态构造（`{ time, text, words? }`）；
     · **按宿主的方式加载样式**：把 skin.css 包进
       `@layer skin { @scope (.playerview[data-skin="rubbing"], .skin-bg[data-skin="rubbing"]) { … } }`
       —— 验的是真实生效路径，而不是"裸 CSS 也能跑"的假象。

   跑法（不需要 npm run dev，也不需要装进播放器）：

     node plugins/style/rubbing/tests/rubbing-check.mjs

   加 `--shot <目录>` 会在断言之外**多截 4 张整页 PNG**（灰字刚压出来 → 第一个字快填满 →
   逐字推进 → 整句填满），给"逐粒填充灰字"留一份肉眼可核对的证据。

   为什么要换掉 rAF：headless 下合成器不给 BeginFrame（实测 rAF 一次都不来），
   样式自己的帧循环会一帧都不跑。换成定时器后它与合成器无关，能稳定推进；
   画布像素 / 计算样式直接读，**断言**不依赖截图（截图只是给人看的附录）。

   这一款特有的验收点（别的样式没有的）：
     · 画布上**真的出现了非背景像素**（粒子确实画出来了，不是空画布）；
     · **灰字底层一直在**（按"半透明 + 近灰 + 够亮"三条从画布上单独量出来）—— 这是
       "颗粒堆成字之后看不出是啥"那条反馈的判据：读得出来靠的是底层灰字，不是粒子的密度；
     · 灰字与粒子目标点是**同一套几何**（`data-base` vs 掩码中心映射点）；
     · 在**同一个字**的时间窗里连续采样，`data-fill`（已落定粒子的比例）**严格单调增加**
       —— "一粒一粒填"而不是"整块云一起飞"，也就是"跟不上节奏"那条反馈的判据；
     · 点击**不再跳进度**（界面上只有当前这一句）；
     · 已唱部分**在画面上从左往右推进**（亮像素的质心 x 递增）；
     · 暂停后**沙继续下落**（灰尘往下沉，不是冻结）—— 这是设计稿的硬要求；
     · 帧耗时超预算时 `data-lod` **真的退档**（探针 P5 的自适应降级）；
     · dpr 2 时 backing store 翻倍而 CSS 尺寸不变。

   纯逻辑（取色、字形采样、粒子物理、契约静态体检）在 rubbing-logic.test.js 里，
   用 node --test 跑。
   ========================================================================== */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
 * defaultCover / env / options / media / track / playback / spectrum / sdk / actions。
 */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>rubbing check</title>
<style>
  html, body { margin: 0; background: #000; }
  /* 假宿主的外壳：真实宿主里 .playerview__stage 由 playerview.css 定位 */
  .playerview { position: fixed; left: 0; top: 0; width: 1100px; height: 700px; }
  .playerview__stage { position: relative; height: 100%; overflow: hidden; }
  .skin-bg { position: fixed; left: 0; top: 0; right: 0; bottom: 0; }
</style>
</head>
<body>
<div class="skin-bg" data-skin="rubbing"></div>
<div class="playerview" data-skin="rubbing"><div class="playerview__stage" id="stage"></div></div>
<script type="module">
import skin from "/skin.js";

const stage = document.getElementById("stage");
const bgRoot = document.querySelector(".skin-bg");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = (el, name) => (el ? el.style.getPropertyValue(name).trim() : "");
const computed = (el, name) => (el ? getComputedStyle(el).getPropertyValue(name).trim() : "");

/* 按宿主的方式加载样式：@layer skin + @scope(舞台根)。 */
const cssText = await (await fetch("/skin.css")).text();
const styleEl = document.createElement("style");
styleEl.textContent = '@layer skin { @scope (.playerview[data-skin="rubbing"], .skin-bg[data-skin="rubbing"]) { ' + cssText + ' } }';
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
const COVER2 = makeCover("#e8d9a0", "#3a5a2a");
const DEFAULT_COVER = makeCover("#2b4fa8", "#12100e");

/* 契约形态的歌词：前两行有完整 words、第 3 行没有（必须退回整行一起亮）。
   时间取整秒级 —— 填充的提前量只有 90ms、墙钟还会继续外推，
   断言只落在"明显已经唱到 / 明显还没唱到"的位置上。 */
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
  let dpr = o.dpr || 1;

  const ctx = {
    root: o.root,
    backgroundRoot: bgRoot,
    defaultCover: DEFAULT_COVER,
    env: () => ({ width: 1100, height: 700, dpr, reducedMotion: !!o.reducedMotion }),
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
    setDpr: (v) => {
      dpr = v;
    },
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
  return { root, host, rb: root.querySelector(".rb") };
}

function push(inst, patch) {
  skin.update(inst.host.ctx, patch);
}

/** 走一步进度并等画面跟上 */
async function at(inst, ms, playing) {
  const p = playing === undefined ? true : playing;
  inst.host.setPosition(ms, p);
  push(inst, { type: "progress", position: ms, duration: 240000, playing: p });
  await wait(280);
}

/** 画布上的墨迹统计：any = 所有画上去的粒子，bright = 已经点亮（已被吸引）的粒子 */
function inkStats(canvas, alpha) {
  const a = alpha === undefined ? 0.6 : alpha;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const d = g.getImageData(0, 0, w, h).data;
  let any = 0;
  let bright = 0;
  let sx = 0;
  let sy = 0;
  // 16 列 × 4 行的粗直方图（诊断用：看清"亮的到底是哪一块"）
  const hist = new Array(64).fill(0);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const al = d[(y * w + x) * 4 + 3] / 255;
      if (al > 0.02) any += 1;
      if (al >= a) {
        bright += 1;
        sx += x;
        sy += y;
        const cx = Math.min(15, Math.floor((x / w) * 16));
        const cy = Math.min(3, Math.floor((y / h) * 4));
        hist[cy * 16 + cx] += 1;
      }
    }
  }
  return { any, bright, meanX: bright ? sx / bright : -1, meanY: bright ? sy / bright : -1, hist };
}

function inkOf(inst, alpha) {
  return inkStats(inst.rb.querySelector(".rb__canvas"), alpha);
}

/**
 * 灰字底层统计：**半透明、近灰、而且够亮**的像素 —— 就是"还没被彩色颗粒填到的字"。
 *
 * 这是「颗粒堆成字之后看不出是啥」那条反馈的判据。各层占一个不重叠的 alpha 窗口，
 * 所以能按 alpha 把它们分开量：
 *   灰尘 0.18（暗） · 灰字 0.52（本函数） · 飞行中 0.8 · 已落定 1.0
 * 近灰判定用 max-min ≤ 30（封面色相被强制拉进可见彩度带，彩色颗粒过不了这一关）；
 * 亮度下限是必须的：两粒暗灰沙叠起来会到 0.33 且近似中性色（米白那种颜料），
 * 不加亮度这一条就会把"叠在一起的沙"误判成灰字。
 */
function baseStats(canvas) {
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const d = g.getImageData(0, 0, w, h).data;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const al = d[i + 3] / 255;
      if (al < 0.32 || al > 0.7) continue;
      const r = d[i];
      const gg = d[i + 1];
      const b = d[i + 2];
      if (Math.max(r, gg, b) - Math.min(r, gg, b) > 30) continue;
      if ((r + gg + b) / 3 < 110) continue;
      n += 1;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { n, meanX: n ? sx / n : -1, meanY: n ? sy / n : -1, box: n ? [minX, minY, maxX, maxY] : null };
}

function baseOf(inst) {
  return baseStats(inst.rb.querySelector(".rb__canvas"));
}

/**
 * 灰尘统计：alpha ∈ [0.12, 0.5] 且**够暗**的像素（单粒 0.18、两粒重叠 0.33）。
 * 灰字 0.52 / 飞行 0.8 / 落定 1.0 都被排除；暗度这一条也是必须的 ——
 * 灰字的抗锯齿边缘同样落在 0.1~0.5 里，不挡掉就会把"沙下沉"量成"灰字不动"。
 */
function dustStats(canvas) {
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const d = g.getImageData(0, 0, w, h).data;
  let n = 0;
  let sy = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const al = d[i + 3] / 255;
      if (al < 0.12 || al > 0.5) continue;
      if ((d[i] + d[i + 1] + d[i + 2]) / 3 > 110) continue;
      n += 1;
      sy += y;
    }
  }
  return { n, meanY: n ? sy / n : -1 };
}

function dustOf(inst) {
  return dustStats(inst.rb.querySelector(".rb__canvas"));
}

const report = {};

/** 等一个条件成立 */
async function waitFor(fn, ms, step) {
  const t0 = performance.now();
  for (;;) {
    let v = null;
    try {
      v = fn();
    } catch {
      v = null;
    }
    if (v) return v;
    if (performance.now() - t0 > (ms || 1500)) return null;
    await wait(step || 60);
  }
}

async function scenarioA() {
  const a = mountInstance({ options: { interactive: true } });
  const out = { mounted: {} };
  await wait(500);

  const cvs = a.rb.querySelector(".rb__canvas");
  out.mounted = {
    hasRb: !!a.rb,
    layers: Array.from(a.rb.querySelectorAll(":scope > *")).map((el) => el.className || el.tagName),
    title: a.rb.querySelector(".rb__title")?.textContent || "",
    artist: a.rb.querySelector(".rb__artist")?.textContent || "",
    tc: a.rb.querySelector(".rb__tc")?.textContent || "",
    tcConnected: !!a.rb.querySelector(".rb__tc")?.isConnected,
    subChildren: Array.from(a.rb.querySelector(".rb__sub")?.children || []).map((el) => el.className),
    ticks: a.rb.querySelectorAll(".rb__tick").length,
    canvasCss: [Math.round(cvs.getBoundingClientRect().width), Math.round(cvs.getBoundingClientRect().height)],
    canvasBacking: [cvs.width, cvs.height],
    data: {
      lod: a.rb.dataset.lod,
      static: a.rb.dataset.static,
      perf: a.rb.dataset.perf,
      interactive: a.rb.dataset.interactive,
      empty: a.rb.dataset.empty,
      line: a.rb.dataset.line,
      glyphs: a.rb.dataset.glyphs,
      lit: a.rb.dataset.lit,
    },
    bgLayers: Array.from(bgRoot.querySelectorAll(".rbbg > *")).map((el) => el.className),
    bgImgSrc: (bgRoot.querySelector(".rbbg__img")?.getAttribute("src") || "").slice(0, 22),
    canvasCursor: computed(cvs, "cursor"),
    canvasFilter: computed(cvs, "filter"),
    baseAttr: a.rb.dataset.base || "",
  };

  // 画布上真的画了东西（这是 canvas 类样式最容易"看着挂了其实是空画布"的地方）
  out.inkIdle = inkOf(a);
  // ★ 反馈 1：灰字底层必须一直在、而且一眼能读出来（粒子还没填到的时候也读得出来）
  out.baseIdle = baseOf(a);
  out.baseGeom = (out.mounted.baseAttr || "").split(",").map(Number);

  // ★ 反馈 3/4：逐粒填充 —— 在**同一个字**的时间窗里连续采样，
  // 已经落定的像素必须严格单调增加（"一粒一粒填"而不是"整块云一起飞"）。
  // 用 paused 采样：墙钟不外推，位置就是给的那个数，窗口才对得上。
  out.fill = [];
  for (const ms of [100, 320, 540, 760, 980]) {
    a.host.setPosition(ms, false);
    push(a, { type: "progress", position: ms, duration: 240000, playing: false });
    await wait(140);
    out.fill.push({
      ms,
      fill: Number(a.rb.dataset.fill || "0"),
      ink: inkStats(cvs, 0.9).bright,
      base: baseStats(cvs).n,
    });
  }
  a.host.setPosition(0, true);
  push(a, { type: "progress", position: 0, duration: 240000, playing: true });
  await wait(200);

  // ★ 反馈 4 的"填满"判据：整句唱完时，灰字底层必须有**大半**被颗粒盖掉。
  // 量的是同一句的笔画像素在"刚开始唱"与"整句唱完"两个时刻的灰字量之比。
  // 这条在颗粒还是 1.85×1.85 的时候只有 30% —— 看起来是"往灰字上撒了彩砂"，
  // 不是"把灰字填成彩色的"（见 field.GRAIN 的注释）。
  out.cover = [];
  for (const ms of [200, 6200]) {
    a.host.setPosition(ms, true);
    push(a, { type: "progress", position: ms, duration: 240000, playing: true });
    await wait(320);
    out.cover.push({ ms, lit: a.rb.dataset.lit, fill: a.rb.dataset.fill, base: baseStats(cvs).n });
  }

  // 取色上报（400ms 防抖）
  await wait(500);
  out.backdrops = a.host.rec.backdrops.slice(0, 3);
  out.bgVars = {
    bg: prop(a.rb, "--rb-bg"),
    fg: prop(a.rb, "--rb-fg"),
    accent: prop(a.rb, "--rb-accent"),
  };

  // 逐字进度：亮像素从左边往右边推进（用 0.95 以上：只量**已落定**的颗粒，
  // 飞行途中的沙铺满整条带，会把质心拉平）
  await at(a, 300);
  out.early = { lit: a.rb.dataset.lit, glyphs: a.rb.dataset.glyphs, ink: inkOf(a, 0.95) };
  await at(a, 5000);
  out.mid = { lit: a.rb.dataset.lit, ink: inkOf(a, 0.95) };
  await at(a, 9500);
  out.line1 = { line: a.rb.dataset.line, lit: a.rb.dataset.lit, glyphs: a.rb.dataset.glyphs, ink: inkOf(a) };
  out.tcAfter = a.rb.querySelector(".rb__tc").textContent;

  // 没有 words 的行：整行一起亮
  await at(a, 15000);
  out.fallback = { line: a.rb.dataset.line, lit: a.rb.dataset.lit, glyphs: a.rb.dataset.glyphs };

  // 频谱接线：低频给湍流
  a.host.setSpectrum(new Float32Array(128).fill(0.9));
  await wait(400);
  out.turbHigh = prop(a.rb, "--rb-turb");
  a.host.setSpectrum(null);
  await wait(400);
  out.turbIdle = prop(a.rb, "--rb-turb");

  // 交互：指针磁铁还在（interactive:true），但**点击不再跳进度**
  const band = a.rb.getBoundingClientRect();
  cvs.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: band.left + band.width / 2,
      clientY: band.top + band.height * 0.45,
    })
  );
  cvs.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
  cvs.dispatchEvent(
    new MouseEvent("click", { bubbles: true, clientX: band.left + band.width / 2, clientY: band.top + band.height * 0.45 })
  );
  await wait(150);
  out.clickSeeks = a.host.rec.seeks.slice();
  out.afterPointer = inkOf(a);

  // 空态：无歌词
  a.host.setLines([], "loading");
  push(a, { type: "lyrics" });
  await wait(200);
  out.empty = {
    text: a.rb.querySelector(".rb__empty").textContent,
    emptyHidden: a.rb.querySelector(".rb__empty").hidden,
    canvasHidden: cvs.hidden,
    data: a.rb.dataset.empty,
    // ★ 没有歌词时必须真的把灰字底层清掉（否则会留一句上一首的灰字）
    base: baseOf(a),
  };
  a.host.setLines(LINES, "ok");
  push(a, { type: "lyrics" });
  await wait(200);
  out.restored = { data: a.rb.dataset.empty, base: baseOf(a) };

  // showLyrics:false → 一个字都不显示（沙还在飘）
  a.host.setOptions({ showLyrics: false });
  push(a, { type: "options" });
  await wait(300);
  out.noLyrics = {
    data: a.rb.dataset.empty,
    emptyHidden: a.rb.querySelector(".rb__empty").hidden,
    canvasHidden: cvs.hidden,
    base: baseOf(a),
    ink: inkOf(a),
  };
  a.host.setOptions({ showLyrics: true });
  push(a, { type: "options" });
  await wait(300);
  out.lyricsBack = { data: a.rb.dataset.empty, canvasHidden: cvs.hidden, base: baseOf(a) };

  // 换封面：背景层换图 + 配色变量变化
  a.host.media.cover = COVER2;
  const before = out.bgVars.bg;
  push(a, { type: "media" });
  await wait(900);
  out.coverSwap = {
    changed: prop(a.rb, "--rb-bg") !== before,
    bg: prop(a.rb, "--rb-bg"),
    img: (bgRoot.querySelector(".rbbg__img")?.getAttribute("src") || "").slice(0, 22),
    backdrops: a.host.rec.backdrops.length,
  };

  // 暂停：灰尘往下沉（质心继续下落，不是冻结）
  a.host.setSpectrum(null);
  await at(a, 9500, true);
  const dustBefore = dustOf(a);
  a.host.setPosition(9500, false);
  push(a, { type: "progress", position: 9500, duration: 240000, playing: false });
  await wait(900);
  out.pause = { before: dustBefore.meanY, after: dustOf(a).meanY, n: dustBefore.n };

  // 暂停 6 秒后停帧（宿主约定）
  await wait(6000);
  const framesAtIdle = counters.frames;
  await wait(400);
  out.idle = { dataIdle: a.rb.dataset.idle === "1", frozen: counters.frames === framesAtIdle };

  // 切到后台必须停帧，回前台要醒过来（宿主约定 S6）
  a.host.setPosition(9500, true);
  push(a, { type: "progress", position: 9500, duration: 240000, playing: true });
  push(a, { type: "visibility", foreground: true });
  await wait(300);
  const framesVisible = counters.frames;
  await wait(400);
  out.visibleFrames = counters.frames - framesVisible;
  push(a, { type: "visibility", foreground: false });
  await wait(300);
  const framesHidden = counters.frames;
  await wait(500);
  out.hiddenFrozen = counters.frames === framesHidden;
  push(a, { type: "visibility", foreground: true });
  await wait(500);
  out.wokeUp = counters.frames > framesHidden;

  // close（详情页收起）→ 背景层藏起来
  push(a, { type: "close" });
  out.closed = { bgHidden: bgRoot.hidden === true };

  const framesBeforeDestroy = counters.frames;
  // 卸载：舞台与整窗背景层都必须干净
  skin.destroy(a.host.ctx);
  await wait(300);
  out.destroy = {
    stageRb: !!stage.querySelector(".rb"),
    rootHtml: a.root.innerHTML,
    bgHtml: bgRoot.innerHTML,
    bgHidden: bgRoot.hidden === true,
    framesStop: counters.frames === framesBeforeDestroy,
  };
  a.root.remove();
  return out;
}

async function scenarioB() {
  // animations:false → 完全不进帧循环（一帧都不画），但画面必须仍然正确（瞬移 + 画一帧）
  const start = counters.frames;
  const b = mountInstance({ options: { animations: false, interactive: false }, position: 10000, playing: false });
  await wait(400);
  const paintCalls = b.host.rec.spectrumCalls;
  const out = {
    paintsAfterMount: paintCalls,
    framesAfterMount: counters.frames - start,
    staticAttr: b.rb.dataset.static || "",
    interactiveAttr: b.rb.dataset.interactive || "",
    canvasTransform: computed(b.rb.querySelector(".rb__canvas"), "transform"),
    base: baseOf(b),
    ink: inkOf(b),
    lit: b.rb.dataset.lit,
    glyphs: b.rb.dataset.glyphs,
  };
  // 暂停 + 瞬移：进度补丁来了要立刻重画一帧（但依然不进循环）
  const paintsBefore = b.host.rec.spectrumCalls;
  await at(b, 11500, false);
  out.paintsAfterPush = b.host.rec.spectrumCalls - paintsBefore;
  out.lit2 = b.rb.dataset.lit;
  out.ink2 = inkOf(b);
  // interactive:false → 指针事件完全不接、点击更不该跳转
  b.rb
    .querySelector(".rb__canvas")
    .dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 100, clientY: 300 }));
  b.rb
    .querySelector(".rb__canvas")
    .dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 100, clientY: 300 }));
  out.seeks = b.host.rec.seeks.slice();
  out.cursor = computed(b.rb.querySelector(".rb__canvas"), "cursor");
  // 关动效 → 还没有停帧标记（停帧标记是"暂停 6 秒"才有）也不该有 rAF 循环
  await wait(600);
  out.paintsStillFlat = b.host.rec.spectrumCalls - paintsBefore;
  skin.destroy(b.host.ctx);
  b.root.remove();
  return out;
}

async function scenarioC() {
  const bands = new Float32Array(128).fill(0.4);
  const out = {};

  // ── performance 档：按清单 budgetFps 限帧 ──
  const perf = mountInstance({ options: { performanceMode: "performance" }, playing: true, spectrum: bands });
  const perfStart = perf.host.rec.spectrumCalls;
  await wait(1400);
  out.perf = {
    attr: perf.rb.dataset.perf || "",
    paints: perf.host.rec.spectrumCalls - perfStart,
    filter: computed(perf.rb.querySelector(".rb__canvas"), "filter"),
  };
  skin.destroy(perf.host.ctx);
  perf.root.remove();

  const smooth = mountInstance({ options: { performanceMode: "smooth" }, playing: true, spectrum: bands });
  const smoothStart = smooth.host.rec.spectrumCalls;
  await wait(1400);
  out.smooth = {
    paints: smooth.host.rec.spectrumCalls - smoothStart,
    filter: computed(smooth.rb.querySelector(".rb__canvas"), "filter"),
  };
  skin.destroy(smooth.host.ctx);
  smooth.root.remove();

  // ── 自适应降级：把 fillRect 拖慢 → 连续两帧超预算 → data-lod 退档 ──
  const slow = mountInstance({ options: { performanceMode: "smooth" }, playing: true, spectrum: bands });
  await wait(300);
  out.lodStart = slow.rb.dataset.lod || "";
  const proto = CanvasRenderingContext2D.prototype;
  const origFill = proto.fillRect;
  let lastBurn = 0;
  proto.fillRect = function (...args) {
    const now = Date.now();
    if (now - lastBurn > 40) {
      lastBurn = now;
      const t0 = Date.now();
      // 忙等 40ms：让这一帧的画布耗时（EMA）超过 paintBudgetMs(45) ≈ 30ms
      while (Date.now() - t0 < 40) {
        /* burn */
      }
    }
    return origFill.apply(this, args);
  };
  const lod = await waitFor(() => {
    const v = Number(slow.rb.dataset.lod || 0);
    return v >= 1 ? v : null;
  }, 6000, 120);
  proto.fillRect = origFill;
  out.lodDegraded = lod === null ? -1 : lod;
  // 恢复之后先确认帧循环还活着，再读画布（诊断用，也顺手当成"退档后没死"的证据）
  await wait(400);
  const f1 = counters.frames;
  await wait(400);
  out.lodFrames = counters.frames - f1;
  out.lodInk = inkOf(slow);
  out.lodRes = [slow.rb.querySelector(".rb__canvas").width, slow.rb.querySelector(".rb__canvas").height];
  skin.destroy(slow.host.ctx);
  slow.root.remove();

  // ── dpr 2：backing store 翻倍，CSS 尺寸不变 ──
  const hi = mountInstance({ options: {}, playing: true, dpr: 2 });
  await wait(500);
  const hc = hi.rb.querySelector(".rb__canvas");
  out.dpr = {
    backing: [hc.width, hc.height],
    css: [Math.round(hc.getBoundingClientRect().width), Math.round(hc.getBoundingClientRect().height)],
    ink: inkOf(hi),
  };
  skin.destroy(hi.host.ctx);
  hi.root.remove();

  // ── 窄窗口：不横向溢出，字形带仍在画布内 ──
  const narrow = mountInstance({ options: {}, playing: true });
  const pv = document.querySelector(".playerview");
  pv.style.width = "360px";
  stage.style.width = "360px";
  push(narrow, { type: "resize", width: 360, height: 700 });
  await wait(600);
  const nc = narrow.rb.querySelector(".rb__canvas");
  const nb = baseOf(narrow);
  out.narrow = {
    canvasCss: [Math.round(nc.getBoundingClientRect().width), Math.round(nc.getBoundingClientRect().height)],
    backing: [nc.width, nc.height],
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    rootOverflow: narrow.rb.scrollWidth - narrow.rb.clientWidth,
    base: nb.n,
    box: nb.box,
    ink: inkOf(narrow),
  };
  skin.destroy(narrow.host.ctx);
  narrow.root.remove();
  pv.style.width = "1100px";
  stage.style.width = "";
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

  // 注意：这一整段是外层模板字符串的**内容**，反斜杠要写两次，
  // 否则 \\n 会在 Node 侧就被解释成真换行，页面脚本里就多出一个未闭合的字符串。
  const brief = (err) => ({
    error: String(err && err.message ? err.message : err),
    stack: String(err && err.stack ? err.stack : "").split("\\n").slice(0, 5).join(" | "),
  });

  try {
    report.A = await scenarioA();
  } catch (err) {
    report.A = brief(err);
  }
  try {
    report.B = await scenarioB();
  } catch (err) {
    report.B = brief(err);
  }
  try {
    report.C = await scenarioC();
  } catch (err) {
    report.C = brief(err);
  }

  window.requestAnimationFrame = rafOrig;
  window.cancelAnimationFrame = cafOrig;
  report.frames = counters.frames;
  return report;
}

/* --------------------------------------------------------------------------
   截图模式（可选，见文件头的 --shot）：挂一个干净实例，按关键时刻把画面推到位，
   由 Node 侧用 CDP Page.captureScreenshot 抓整页。
   ★ 必须 playing:true —— 暂停会触发"灰尘下沉到地板"，截出来不是正常观感。
   -------------------------------------------------------------------------- */
async function shotInit() {
  const rafOrig = window.requestAnimationFrame;
  const cafOrig = window.cancelAnimationFrame;
  window.requestAnimationFrame = (cb) =>
    setTimeout(() => {
      counters.frames += 1;
      cb(performance.now());
    }, 8);
  window.cancelAnimationFrame = (tid) => clearTimeout(tid);
  counters.frames = 0;
  window.__shotInst = mountInstance({});
  window.__shotOrig = { rafOrig, cafOrig };
  await wait(600);
  return true;
}

async function shotAt(ms, hold) {
  const inst = window.__shotInst;
  inst.host.setPosition(ms, true);
  push(inst, { type: "progress", position: ms, duration: 240000, playing: true });
  await wait(hold || 400);
  return {
    lit: inst.rb.dataset.lit,
    fill: inst.rb.dataset.fill,
    line: inst.rb.dataset.line,
    tc: inst.rb.querySelector(".rb__tc").textContent,
    base: baseOf(inst).n,
    ink: inkOf(inst, 0.6).any,
  };
}

window.__rb = { run, shotInit, shotAt };
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
  process.exitCode = 1;
} else {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const OUT = join(tmpdir(), "rubbing-check-" + Date.now());
  mkdirSync(OUT, { recursive: true });
  // 可选截图目录：node …/rubbing-check.mjs --shot .tmp-rubbing-shots
  const shotArg = process.argv.indexOf("--shot");
  const SHOT_DIR = shotArg >= 0 && process.argv[shotArg + 1] ? resolve(process.argv[shotArg + 1]) : "";

  // 随机端口：上一次跑挂了留下的 Edge 可能还占着固定端口，
  // 那样新实例绑不上，CDP 会连到**旧进程**的 about:blank 上（表现为"页面没准备好"）
  const CDP_PORT = 9900 + Math.floor(Math.random() * 500);
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
    process.exitCode = 1;
  } else {
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
        const where = `${d?.url || ""}:${d?.lineNumber ?? ""}:${d?.columnNumber ?? ""}`;
        errors.push(`exception @${where}: ${d?.exception?.description || d?.text}`);
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
        }, 120000);
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

    /* --------------------------------------------------------------------
       3. 断言
       -------------------------------------------------------------------- */
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

    /** WCAG 相对亮度（独立算一遍当"第二意见"） */
    function luma(hex) {
      const lin = (c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    }

    /** WCAG 对比度（独立算一遍当"第二意见"） */
    function contrast(hexA, hexB) {
      const la = luma(hexA);
      const lb = luma(hexB);
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
        ready = (await evaluate("!!window.__rb")) === true;
        if (ready) break;
      }
      if (!ready) {
        console.error("harness 页面没准备好（window.__rb 未定义）");
        console.error("  location:", await evaluate("location.href").catch(() => "?"));
        for (const e of errors) console.error("  ", e.split("\n").slice(0, 3).join(" | "));
        throw new Error("harness 页面没准备好（window.__rb 未定义）");
      }

      console.log("跑场景（约 30 秒）…");
      const r = await evaluate("window.__rb.run()");
      const A = r?.A || {};
      const B = r?.B || {};
      const C = r?.C || {};

      console.log("\n[1] 挂载与骨架");
      check(!A.error, "样式能挂载并渲染", j(A.error || "") + " " + (A.stack || ""));
      check(A.mounted?.hasRb === true, "舞台根里出现了 .rb");
      check(
        j(A.mounted?.layers) === j(["rb__canvas", "rb__empty", "rb__hud"]),
        "叠层顺序（画布在下、HUD 在上；灰字底层已经画在画布里，没有 DOM 文本层）",
        j(A.mounted?.layers)
      );
      check(A.mounted?.title === "旧梦一场", "曲名进了 HUD", j(A.mounted?.title));
      check(/某歌手/.test(A.mounted?.artist || ""), "副行有歌手", j(A.mounted?.artist));
      check(/^\d\d:\d\d \/ \d\d:\d\d$/.test(A.mounted?.tc || ""), "时间码已就位", j(A.mounted?.tc));
      // 回归守卫：写整行 textContent 会把同一行的时间码变成游离节点
      check(
        j(A.mounted?.subChildren) === j(["rb__artist", "rb__badge", "rb__tc"]) && A.mounted?.tcConnected === true,
        "HUD 副行的三个块（歌手 · 角标 · 时间码）都还挂在 DOM 上",
        j({ children: A.mounted?.subChildren, connected: A.mounted?.tcConnected })
      );
      check(A.mounted?.ticks === 48, "进度刻度 48 格", j(A.mounted?.ticks));
      check(
        A.mounted?.canvasCss?.[0] === 1100 && A.mounted?.canvasCss?.[1] === 700,
        "画布铺满舞台（CSS 尺寸）",
        j(A.mounted?.canvasCss)
      );
      check(
        j(A.mounted?.canvasBacking) === j([1100, 700]),
        "dpr1 时 backing store = CSS 尺寸",
        j(A.mounted?.canvasBacking)
      );
      check(
        A.mounted?.data?.static === "0" && A.mounted?.data?.perf === "0" && A.mounted?.data?.interactive === "1",
        "状态属性（static/perf/interactive）与设置一致",
        j(A.mounted?.data)
      );
      check(A.mounted?.data?.glyphs === "7" && A.mounted?.data?.line === "0", "读到了当前行的字素数与行号", j(A.mounted?.data));
      check(
        j(A.mounted?.bgLayers) === j(["rbbg__img", "rbbg__veil", "rbbg__grain"]),
        "整窗背景层的三层内容都是本包填的",
        j(A.mounted?.bgLayers)
      );
      check((A.mounted?.bgImgSrc || "").startsWith("data:image/"), "背景层拿到封面（data URL 形态）", j(A.mounted?.bgImgSrc));
      check(A.mounted?.canvasCursor === "crosshair", "interactive 时画布是磁铁光标", j(A.mounted?.canvasCursor));
      check(/contrast/.test(A.mounted?.canvasFilter || ""), "smooth 档画布叠了对度滤镜", j(A.mounted?.canvasFilter));

      console.log("\n[2] 粒子真的画出来了");
      check((A.inkIdle?.any || 0) > 200, "画布上有成片的粒子像素", j(A.inkIdle));
      check(/^\d+,\d+,\d+$/.test(A.mounted?.baseAttr || ""), "灰字底层的几何（x,y,fontSize）被暴露出来（自检/排查用）", j(A.mounted?.baseAttr));
      check(
        A.baseGeom?.[0] > 0 && A.baseGeom?.[0] < 1100 && A.baseGeom?.[1] > 0 && A.baseGeom?.[1] < 700 && A.baseGeom?.[2] > 40,
        "灰字落在画布内、字号够大（一眼能读）",
        j(A.baseGeom)
      );

      console.log("\n[2b] 反馈 1：灰字底层一直在，颗粒只是把它盖成彩色");
      // 半透明且近灰的像素 = 还没被颗粒填到的字。这是"看不出是啥"那条反馈的判据：
      // 有字（>1500 像素、铺开成整句宽）、无歌词时立刻消失。
      check((A.baseIdle?.n || 0) > 1500, "画布上有一层读得出来的灰字（不是只有一堆粒子）", j(A.baseIdle));
      check(
        (A.baseIdle?.box?.[2] || 0) - (A.baseIdle?.box?.[0] || 0) > 300,
        "灰字铺开成整句宽度（是字，不是一团）",
        j(A.baseIdle?.box)
      );
      check(
        (A.baseIdle?.box?.[3] || 0) - (A.baseIdle?.box?.[1] || 0) > 40,
        "灰字有正常字高",
        j(A.baseIdle?.box)
      );

      console.log("\n[2c] 反馈 3/4：颗粒是一粒一粒把字填满的（同一个字内单调推进）");
      const fills = (A.fill || []).map((f) => f.fill);
      const fillPx = (A.fill || []).map((f) => f.ink);
      check(fills.length === 5 && fills.every((v) => typeof v === "number"), "取到了同一个字窗内的连续采样", j(A.fill));
      let monotone = fills.length === 5;
      for (let i = 1; i < fills.length; i += 1) if (!(fills[i] > fills[i - 1])) monotone = false;
      check(monotone, "已填到位的颗粒比例逐次严格增加（逐粒填充，不是整块一起落）", j(fills));
      check(fills[0] < fills[4] * 0.5, "窗口开头大部分还没填上、结尾几乎填满", j(fills));
      // 像素数会随"落地的闪光"起落，所以只要求整体上是涨的
      check(fillPx[4] > fillPx[0], "已落定像素整体上随进度增长", j(fillPx));
      // 灰字必须**一直在**（每个采样都远大于零）、随填充被盖掉一部分
      // （整体减少），但不能凭空消失或凭空多出来（±25% 抖动是尘埃遮挡造成的）
      const bases = (A.fill || []).map((f) => f.base);
      check(
        bases.length === 5 && bases.every((v) => v > 1000) && bases[4] < bases[0],
        "灰字全程都在，并且随填充被盖掉一部分（填的是覆盖，不是把灰字挪走）",
        j(bases)
      );
      check(
        bases.every((v) => Math.abs(v - bases[0]) < bases[0] * 0.25),
        "灰字量级稳定（没有整片消失或重复叠加）",
        j(bases)
      );
      // ★ 整句尺度：唱完时必须盖掉大半（这一条是"填满"的定义，不是手感）
      const cover = (A.cover || []).map((c) => c.base);
      const covered = cover.length === 2 && cover[0] > 0 ? 1 - cover[1] / cover[0] : 0;
      check(
        covered >= 0.5,
        "整句唱完时灰字被盖掉大半（填满，不是撒了几粒麻点）",
        j({ cover: A.cover, covered: Number(covered.toFixed(3)) })
      );

      console.log("\n[3] 封面取色 → 宿主壳配色");
      check((A.backdrops || []).length >= 1, "reportBackdrop 上报了", j(A.backdrops));
      const pal = (A.backdrops || [])[0] || {};
      check(/^#[0-9a-f]{6}$/.test(pal.bg || ""), "上报的 bg 是 hex", j(pal.bg));
      check(/^#[0-9a-f]{6}$/.test(pal.fg || ""), "上报的 fg 是 hex", j(pal.fg));
      check(
        pal.bg && pal.fg && contrast(pal.bg, pal.fg) >= 3.9,
        "上报配色的对比度够用（壳文字读得清）",
        j(pal.bg && pal.fg ? contrast(pal.bg, pal.fg).toFixed(2) : "")
      );
      // 回归（真机暴露的那次）：上报的 bg 必须是"实际画出来的底"（封面压暗 + 暗纱 → 近黑），
      // 不是封面主色本身；否则亮封面下会选出深色字，宿主壳与 HUD 一起看不见。
      check(
        pal.bg && luma(pal.bg) < 0.08,
        "上报的 bg 是合成底（近黑），不是封面主色",
        j({ bg: pal.bg, luma: pal.bg ? luma(pal.bg).toFixed(3) : "" })
      );
      check(
        pal.fg && luma(pal.fg) > 0.5,
        "近乎黑的底上选的是亮色字",
        j({ fg: pal.fg, luma: pal.fg ? luma(pal.fg).toFixed(3) : "" })
      );
      // accent 必须一起报：宿主壳的进度条 / 音量条 / 播放键 / 播放模式按钮走 --accent 家族
      check(/^#[0-9a-f]{6}$/.test(pal.accent || ""), "上报的 accent 是 hex", j(pal.accent));
      check(
        pal.accent && pal.accent === A.bgVars?.accent,
        "上报的 accent 与画面里的 --rb-accent 同源（不是清单里的静态专色）",
        j({ reported: pal.accent, stage: A.bgVars?.accent })
      );
      check(/^#[0-9a-f]{6}$/.test(A.bgVars?.bg || "") && /^#[0-9a-f]{6}$/.test(A.bgVars?.accent || ""), "取色变量已落到舞台根", j(A.bgVars));
      check((A.coverSwap?.changed || false) === true && (A.coverSwap?.backdrops || 0) > (A.backdrops || []).length - 1, "换封面后配色跟着变、又上报了一次", j(A.coverSwap));

      console.log("\n[4] 逐字进度：亮的部分真的往右推进");
      check(A.early?.lit === "1" && A.early?.glyphs === "7", "刚开唱时只有第 1 个字素已唱", j(A.early));
      check(Number(A.mid?.lit) > Number(A.early?.lit), "进度推进后已唱字素数增加", j({ early: A.early?.lit, mid: A.mid?.lit }));
      check(
        (A.mid?.ink?.meanX || 0) > (A.early?.ink?.meanX || 0) + 20,
        "亮像素的质心往右移动（不是整行一起亮）",
        j({ earlyX: Math.round(A.early?.ink?.meanX || 0), midX: Math.round(A.mid?.ink?.meanX || 0) })
      );
      check(A.line1?.line === "1" && A.line1?.glyphs === "5", "进入第 2 行后字素数与行号都换了", j(A.line1));
      check(Number(A.line1?.lit) >= 1 && Number(A.line1?.lit) < 5, "第 2 行唱到一半", j(A.line1));
      check(/^\d\d:\d\d/.test(A.tcAfter || ""), "时间码跟着进度走", j(A.tcAfter));
      check(A.fallback?.line === "2" && A.fallback?.lit === A.fallback?.glyphs, "没有 words 的行整行一起亮", j(A.fallback));

      console.log("\n[5] 频谱 / 交互 / 空态");
      check(Number(A.turbHigh) > 0.5, "低频喂进了湍流变量", j({ high: A.turbHigh, idle: A.turbIdle }));
      check(Number(A.turbIdle) === 0, "拿不到频谱时湍流回到 0", j(A.turbIdle));
      // ★ 反馈 2：点击不再跳进度（界面上只有当前这一句，跳转没有意义）
      check((A.clickSeeks || []).length === 0, "点击字形带不再跳进度", j(A.clickSeeks));
      check((A.afterPointer?.any || 0) > 200, "指针磁铁事件之后画面照画", j(A.afterPointer));
      check(
        A.empty?.text === "歌词匹配中…" && A.empty?.emptyHidden === false && A.empty?.canvasHidden === true && A.empty?.data === "1",
        "无歌词时显示空态文案并收起画布",
        j(A.empty)
      );
      check((A.empty?.base?.n || 0) < 200, "无歌词时灰字底层被清掉（不留上一首的残字）", j(A.empty?.base));
      check(A.restored?.data === "0" && (A.restored?.base?.n || 0) > 1000, "歌词回来后被正常恢复", j(A.restored));
      check(
        A.noLyrics?.data === "1" && A.noLyrics?.emptyHidden === true && A.noLyrics?.canvasHidden === true,
        "showLyrics:false 时收起画布与文案",
        j(A.noLyrics)
      );
      check(
        (A.noLyrics?.ink?.bright || 0) < 80 && (A.noLyrics?.base?.n || 0) < 200,
        "showLyrics:false 时一个字都不显示，只剩沙",
        j({ ink: A.noLyrics?.ink, base: A.noLyrics?.base?.n })
      );
      check(A.lyricsBack?.data === "0" && (A.lyricsBack?.base?.n || 0) > 1000, "打开歌词后灰字回来", j(A.lyricsBack));

      console.log("\n[6] 暂停 = 灰尘下沉（不是冻结）");
      check(
        (A.pause?.after || 0) > (A.pause?.before || 0) + 3,
        "暂停后沙的质心继续下落",
        j({ before: Math.round(A.pause?.before || 0), after: Math.round(A.pause?.after || 0), n: A.pause?.n, hist: A.pause?.hist })
      );
      check(A.idle?.dataIdle === true && A.idle?.frozen === true, "暂停 6 秒后停帧", j(A.idle));
      check(A.visibleFrames > 10, "回前台帧循环醒过来", j(A.visibleFrames));
      check(A.hiddenFrozen === true && A.wokeUp === true, "切后台停帧、回前台再醒", j({ frozen: A.hiddenFrozen, woke: A.wokeUp }));
      check(A.closed?.bgHidden === true, "close 补丁把整窗背景层藏起来", j(A.closed));

      console.log("\n[7] 卸载必须自己清干净（背景层容器是宿主的）");
      check(A.destroy?.stageRb === false && A.destroy?.rootHtml === "", "舞台挂载点清空", j(A.destroy?.rootHtml));
      check(A.destroy?.bgHtml === "" && A.destroy?.bgHidden === true, "整窗背景层被清空并隐藏", j({ html: A.destroy?.bgHtml, hidden: A.destroy?.bgHidden }));
      check(A.destroy?.framesStop === true, "destroy 之后不再有帧", j(A.destroy?.framesStop));

      console.log("\n[8] animations:false / reducedMotion（静态但完整）");
      check(!B.error, "静态档不报错", j(B.error || "") + " " + (B.stack || ""));
      check((B.paintsAfterMount || 0) === 0 && (B.framesAfterMount || 0) === 0, "挂载后一帧都不画（不进循环）", j({ paints: B.paintsAfterMount, frames: B.framesAfterMount }));
      check((B.ink?.any || 0) > 200 && (B.base?.n || 0) > 1000, "但画布上仍然有正确的画面（灰字 + 粒子，瞬移后画一帧）", j({ ink: B.ink, base: B.base?.n }));
      check(B.staticAttr === "1" && B.interactiveAttr === "0", "静态档属性正确", j({ static: B.staticAttr, interactive: B.interactiveAttr }));
      check(B.canvasTransform === "none", "静态档关掉了画布过渡", j(B.canvasTransform));
      check((B.paintsAfterPush || 0) === 0 && Number(B.lit2) > Number(B.lit || 0), "进度补丁来了只重画一帧、逐字进度照样推进", j({ lit: B.lit, lit2: B.lit2 }));
      check((B.seeks || []).length === 0, "interactive:false / 点击都不跳转", j(B.seeks));
      check(B.cursor !== "crosshair", "interactive:false 时没有磁铁光标", j(B.cursor));
      check((B.paintsStillFlat || 0) === 0, "静态档长时间也不会有帧", j(B.paintsStillFlat));

      console.log("\n[9] performance 档 / 自适应降级 / dpr / 窄窗口");
      check(!C.error, "性能场景不报错", j(C.error || "") + " " + (C.stack || ""));
      check(C.perf?.attr === "1", "performance 档属性生效", j(C.perf?.attr));
      check((C.perf?.paints || 0) > 5 && (C.perf?.paints || 0) < (C.smooth?.paints || 0) * 0.75, "performance 档真的按 budgetFps 限帧了", j({ perf: C.perf?.paints, smooth: C.smooth?.paints }));
      check(C.perf?.filter === "none" && /contrast/.test(C.smooth?.filter || ""), "performance 档去掉了画布滤镜", j({ perf: C.perf?.filter, smooth: C.smooth?.filter }));
      check(C.lodStart === "0" && C.lodDegraded >= 1, "帧耗时超预算后 data-lod 退档", j({ start: C.lodStart, degraded: C.lodDegraded }));
      check((C.lodFrames || 0) > 5, "退档之后帧循环仍然在跑（降级不是停摆）", j(C.lodFrames));
      check((C.lodInk?.any || 0) > 100, "退档之后画面仍然在画（不是黑屏）", j({ frames: C.lodFrames, lod: C.lodDegraded, ink: C.lodInk, res: C.lodRes }));
      check(C.dpr?.backing?.[0] === C.dpr?.css?.[0] * 2, "dpr2 时 backing store 翻倍", j(C.dpr));
      check((C.dpr?.ink?.any || 0) > 200, "dpr2 时画面正常", j(C.dpr?.ink));
      check(C.narrow?.backing?.[0] === 360 && C.narrow?.canvasCss?.[0] === 360, "窄窗口下画布跟着舞台缩放", j(C.narrow?.canvasCss));
      check(C.narrow?.pageOverflow <= 1 && C.narrow?.rootOverflow <= 0, "窄窗口不横向溢出", j({ page: C.narrow?.pageOverflow, root: C.narrow?.rootOverflow }));
      check(
        (C.narrow?.box?.[0] || -1) >= 0 && (C.narrow?.box?.[2] || 9999) <= 360 && (C.narrow?.base || 0) > 100,
        "窄窗口下灰字仍然在舞台内（没有跑出去、也不是空的）",
        j({ box: C.narrow?.box, base: C.narrow?.base })
      );
      check((C.narrow?.ink?.any || 0) > 100, "窄窗口下粒子照画", j(C.narrow?.ink));

      console.log("\n[10] 控制台必须干净");
      check(errors.length === 0, "无未捕获异常 / console.error", errors.slice(0, 3).join(" | "));

      // ── 可选：截图（--shot <目录>）。给"逐粒填充灰字"留一份肉眼可核对的证据 ──
      if (SHOT_DIR) {
        mkdirSync(SHOT_DIR, { recursive: true });
        await evaluate("window.__rb.shotInit()");
        // 第一句 words = [0,1000,…,5500]：0.1s 时第 1 个字刚开始填、0.9s 快填满、
        // 2.6s 前两个字填完第三个在填、6.2s 整句都已填完（等下一句）
        const marks = [
          { ms: 100, hold: 260, slug: "a-第一个字-刚开始填" },
          { ms: 900, hold: 300, slug: "b-第一个字-快填满" },
          { ms: 2600, hold: 400, slug: "c-逐字推进" },
          { ms: 6200, hold: 400, slug: "d-整句填满" },
        ];
        for (const mk of marks) {
          const info = await evaluate(`window.__rb.shotAt(${mk.ms}, ${mk.hold})`);
          const shot = await send("Page.captureScreenshot", { format: "png" });
          const file = join(SHOT_DIR, `${mk.slug}.png`);
          writeFileSync(file, Buffer.from(shot.result.data, "base64"));
          console.log(`  📷 ${file}  ${j(info)}`);
        }
      }
    } catch (err) {
      fail += 1;
      console.error("  FAIL 自检本身中断：", err && err.message ? err.message : err);
      if (err && err.stack) console.error(String(err.stack).split("\n").slice(0, 4).join("\n"));
    } finally {
      ws.close();
      edge.kill();
      server.close();
    }

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exitCode = fail === 0 ? 0 : 1;
  }
}
