/* ==========================================================================
   atlas-check.mjs — 「铅字盘」的无头浏览器自检
   --------------------------------------------------------------------------
   ★ 这个脚本属于**第三方样式包自己**，与播放器项目源码零耦合：

     · 它自己起一个只读静态服务，只把本样式包目录暴露出去；
     · 它自己在页面里搭一个「假宿主」（ctx 的取值函数 + sdk + actions），
       不 import 宿主的 store / playerhost / 契约包；
     · 歌词直接按契约形态构造（`{ time, text, trans?, words? }`），连 LRC
       解析器都不需要 —— 验的是样式自己的责任。

   跑法：

     node plugins/style/atlas/tests/atlas-check.mjs
     node plugins/style/atlas/tests/atlas-check.mjs --shots   # 额外存几张截图供肉眼复核

   为什么要把 rAF 换成定时器：headless 下合成器不给 BeginFrame（实测 rAF 一次都
   不来，document.hidden 还是 false），样式自己的帧循环会一帧都不跑。换成定时器
   之后这条循环与合成器无关，能稳定推进。

   这个脚本要盯住的都是"测试全绿但真机难看/白烧 CPU"的那类事：
     · 装箱塌方：屏幕上的条明明不重叠，密度却从 0.93 掉到 0.67（候选位置精度）；
     · 逐字落版：`data-lit` 不涨 / 画布上不出现新墨点；
     · 对比度：当前条的挡板压不住邻居 ⇒ 字叠字（abyss 的教训：真实对比度 1.31:1
       而单测是绿的）—— 这里**按像素**量，量不出来就算失败；
     · 省电：静止时不许继续重画（draws 必须冻住），暂停 6s 后必须停帧，
       关动效档必须**一帧都不起**。
   ========================================================================== */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv.includes("--shots");
const SHOT_DIR = SHOTS ? resolve(process.cwd(), ".tmp-atlas-shots") : join(tmpdir(), "atlas-shots");

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/* --------------------------------------------------------------------------
   页面里的假宿主 + 全部断言素材
   -------------------------------------------------------------------------- */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>atlas check</title>
<!-- ★ 样式表是宿主注入的（真机里它还包着 @layer/@scope），这里必须自己挂上：
     少了它整套布局都退化成静态块，量出来的舞台高度、安全区、取景倍率全是错的。 -->
<link rel="stylesheet" href="/skin.css">
<style>
  html, body { margin: 0; background: #05060a; }
  /* 舞台 = 宿主给的挂载点；安全区变量由宿主写在舞台根上（这里照抄真机的 88/92） */
  #stage {
    position: fixed; left: 0; top: 0; width: 900px; height: 600px;
    --skin-inset-top: 88px;
    --skin-inset-bottom: 92px;
  }
</style>
</head>
<body>
<div id="stage"></div>
<script type="module">
import * as skinMod from "/skin.js";

const skin = skinMod.default;
const probe = skinMod.__probe;
const stage = document.getElementById("stage");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 歌词样本（含长句/短句/空行/英文行/双语行/逐字行） --------- */
const TEXT = [
  "夜空中最亮的星", "能否听清", "那仰望的人", "心底的孤独和叹息",
  "我祈祷拥有一颗透明的心灵", "和会流泪的眼睛", "给我再去相信的勇气",
  "越过谎言去拥抱你", "每当我找不到存在的意义", "每当我迷失在黑夜里",
  "Take me to your heart", "つきあかりのひかり", "Oh——", "", "  ",
  "请指引我靠近你", "夜空中最亮的星", "是否记起", "曾与我同行的身影",
];
function makeLyrics(n) {
  return Array.from({ length: n }, (_, i) => {
    const text = TEXT[i % TEXT.length];
    const line = { time: 1200 + i * 2600, text };
    if (text === "夜空中最亮的星") line.trans = ["The brightest star in the night sky"];
    return line;
  });
}
const LYRICS = makeLyrics(48);
/** 逐字时间轴：每个字素 420ms（与合成口径一致，便于对账 data-lit）；
    第一个字比整行晚 420ms —— 这样"整行已经亮出来但一个字都还没唱"是可测的状态 */
const WORD_LINE = {
  time: 6000,
  text: "逐字落版测试句",
  words: [6420, 6840, 7260, 7680, 8100, 8520, 8940],
};

/* ---------------- 假 ctx ---------------- */
function makeCtx(root, state) {
  return {
    root,
    backgroundRoot: null,
    defaultCover: "",
    env: () => ({ ...state.env }),
    options: () => ({ ...state.options }),
    lyrics: () => ({
      lines: state.lines,
      index: -1,
      source: state.lines.length ? "local" : "",
      status: state.lines.length ? "ready" : "none",
      statusText: "",
    }),
    track: () => ({ title: "测试曲目", artist: "测试歌手", album: "" }),
    playback: () => ({
      position: state.pos,
      duration: 200000,
      playing: state.playing,
    }),
    media: () => ({ song: { title: "测试曲目", artist: "测试歌手" }, cover: "" }),
    covers: () => ({ current: "", list: [] }),
    spectrum: () => state.spectrum,
    sdk: {
      splitGraphemes: (t) => Array.from(String(t == null ? "" : t)),
      html: { lyricsEmptyText: (l) => (l && l.status === "loading" ? "歌词匹配中…" : "暂无歌词") },
    },
    actions: {
      seek(ms) {
        state.seeks.push(ms);
      },
      reportBackdrop(p) {
        state.backdrops.push(p);
      },
    },
  };
}

/* ---------------- 画布取像素的小工具 ---------------- */
const lum = (r, g, b) => {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

let ctxState = null;
let ctxObj = null;
let frames = 0;

/** 把两层画布 + 底色合成到一张临时画布上，再取某个盒子里的像素统计 */
function boxStats(box) {
  const st = probe();
  const wall = document.querySelector(".at__cv--wall");
  const live = document.querySelector(".at__cv--live");
  if (!wall || !live || !st) return null;
  const tmp = document.createElement("canvas");
  tmp.width = wall.width;
  tmp.height = wall.height;
  const g = tmp.getContext("2d", { willReadFrequently: true });
  g.fillStyle = st.colors.bg;
  g.fillRect(0, 0, tmp.width, tmp.height);
  g.drawImage(wall, 0, 0);
  g.drawImage(live, 0, 0);
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.max(1, Math.min(tmp.width - x, Math.round(box.w)));
  const h = Math.max(1, Math.min(tmp.height - y, Math.round(box.h)));
  const d = g.getImageData(x, y, w, h).data;
  const ls = [];
  let maxL = 0;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) {
    const L = lum(d[i], d[i + 1], d[i + 2]);
    ls.push(L);
    if (L > maxL) maxL = L;
    if (d[i] + d[i + 1] + d[i + 2] > 40) ink += 1;
  }
  ls.sort((a, b) => a - b);
  const medL = ls[ls.length >> 1] || 0;
  const contrast = (Math.max(maxL, medL) + 0.05) / (Math.min(maxL, medL) + 0.05);
  return { maxL, medL, contrast, ink, px: ls.length };
}

/** 当前条在屏幕上的盒子（用探针里的世界矩形 + 机位换算） */
function currentBox() {
  const st = probe();
  if (!st || st.lineIndex < 0 || !st.rects[st.lineIndex]) return null;
  const r = st.rects[st.lineIndex];
  const pad = 0.16 / 2;
  const t = { x: r.x + pad, y: r.y + pad, w: r.w - 0.16, h: r.h - 0.16 };
  const s = st.s;
  const f = st.view;
  const fx = f.left + f.w / 2;
  const fy = f.top + f.h * 0.55;
  const scale = 1 + 0.45 * st.lift;
  const cx = fx + (t.x + t.w / 2 - st.cam.cx) * s;
  const cy = fy + (t.y + t.h / 2 - st.cam.cy) * s;
  const w = t.w * s * scale;
  const h = t.h * s * scale;
  return { x: cx - w / 2 - 6, y: cy - h / 2 - 6, w: w + 12, h: h + 12 };
}

function canvasInk(sel) {
  const cv = document.querySelector(sel);
  if (!cv) return -1;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n += 1;
  return n;
}

/** 数"和底色不一样"的像素：底盘画布是**不透明**的纸，用 alpha 数不出内容 */
function canvasMark(sel) {
  const cv = document.querySelector(sel);
  const st = probe();
  if (!cv || !st) return -1;
  const n0 = parseInt(String(st.colors.bg).slice(1), 16);
  const br = (n0 >> 16) & 255;
  const bg = (n0 >> 8) & 255;
  const bb = n0 & 255;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 18) n += 1;
  }
  return n;
}

const attrs = () => {
  const el = document.querySelector(".at");
  return el ? { ...el.dataset } : null;
};

async function mount() {
  document.querySelector(".at")?.remove();
  ctxState = {
    lines: LYRICS,
    pos: 1200,
    playing: false,
    options: {
      showLyrics: true,
      interactive: true,
      animations: true,
      lyricsFontSize: 20,
      /* ★ 契约里这是**字符串**，"smooth" 或 "performance"，不是布尔值 ——
         曾经自检喂 false、真机喂 "smooth"，于是真机一直在跑性能兜底档而自检全绿。 */
      performanceMode: "smooth",
      budgetFps: 30,
      coverCarousel: false,
    },
    env: { width: 900, height: 600, dpr: 1, reducedMotion: false, foreground: true, themeId: "flat-dark", mode: "dark" },
    seeks: [],
    backdrops: [],
    spectrum: null,
  };
  ctxObj = makeCtx(stage, ctxState);
  skin.mount(ctxObj);
  skin.update(ctxObj, { type: "mount" });
  await wait(150);
}
const apply = async (patch, ms = 260) => {
  skin.update(ctxObj, patch);
  await wait(ms);
};

/* ---------------- 主流程 ---------------- */
async function run() {
  const rafOrig = window.requestAnimationFrame;
  const cafOrig = window.cancelAnimationFrame;
  window.requestAnimationFrame = (cb) => setTimeout(() => { frames += 1; cb(performance.now()); }, 8);
  window.cancelAnimationFrame = (tid) => clearTimeout(tid);

  const out = { steps: {}, errors: [] };
  const step = async (name, fn) => {
    try {
      out.steps[name] = await fn();
    } catch (err) {
      out.steps[name] = { error: String((err && err.message) || err) };
      out.errors.push(name + ": " + String((err && err.message) || err));
    }
  };

  try {
    await step("mount", async () => {
      await mount();
      const st = probe();
      return { probe: st, attrs: attrs(), frames, canvasInk: canvasMark(".at__cv--wall") };
    });

    await step("world", async () => {
      const st = probe();
      const rects = st.rects;
      let overlap = 0;
      let minGap = Infinity;
      for (let a = 0; a < rects.length; a += 1) {
        for (let b = a + 1; b < rects.length; b += 1) {
          const A = rects[a];
          const B = rects[b];
          if (!A || !B) continue;
          const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
          const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
          if (ox > 1e-6 && oy > 1e-6) overlap += 1;
          if (ox <= 1e-6 && oy <= 1e-6) minGap = Math.min(minGap, -Math.max(ox, oy));
        }
      }
      return {
        bars: st.world?.n ?? rects.length,
        lines: ctxState.lines.length,
        W: st.world?.W,
        H: st.world?.H,
        density: st.world?.density,
        vert: rects.filter((r) => r && r.dir === 1).length,
        overlap,
        minGap,
        attrs: attrs(),
        view: st.view,
        insetTop: getComputedStyle(document.querySelector(".at")).getPropertyValue("--skin-inset-top").trim(),
        hudTop: document.querySelector(".at__hud-top").getBoundingClientRect().top,
        hudBottom: document.querySelector(".at__hud-bottom").getBoundingClientRect().bottom,
      };
    });

    await step("camera", async () => {
      /* 切到某一句，看摄像机是不是单调收敛（不许过冲） */
      ctxState.pos = 1200 + 6 * 2600 + 400;
      ctxState.playing = true;
      skin.update(ctxObj, { type: "progress", position: ctxState.pos, playing: true, duration: 200000 });
      const samples = [];
      for (let i = 0; i < 12; i += 1) {
        await wait(90);
        const st = probe();
        samples.push({ cx: st.cam.cx, cy: st.cam.cy, k: st.cam.k, t: st.target });
      }
      const dist = samples.map((s) => Math.hypot(s.cx - s.t.cx, s.cy - s.t.cy));
      const mono = dist.every((d, i) => i === 0 || d <= dist[i - 1] + 1e-6);
      const last = samples[samples.length - 1];
      const rest = Math.hypot(last.cx - last.t.cx, last.cy - last.t.cy);
      /* 远处 seek：一帧之内必须"切镜"到位，而不是慢慢平移过去 */
      const before = probe().cam;
      ctxState.pos = 1200 + 44 * 2600;
      skin.update(ctxObj, { type: "progress", position: ctxState.pos, playing: true, duration: 200000 });
      await wait(40);
      const after = probe();
      const jump = Math.hypot(after.cam.cx - before.cx, after.cam.cy - before.cy);
      const jumpNeed = Math.hypot(after.target.cx - before.cx, after.target.cy - before.cy);
      return { mono, dist, rest, jump, jumpNeed, cut: jump > jumpNeed * 0.8 };
    });

    await step("reveal", async () => {
      await mount();
      /* 前面先垫一句行级歌词：这样"还没开口"时也有当前行，
         才能量到"凹痕"状态本身的对比度（4.5:1 是硬指标，不能只亮着的时候达标）。 */
      ctxState.lines = [{ time: 1200, text: "前一句歌词" }, WORD_LINE];
      ctxState.playing = false;
      await apply({ type: "lyrics" }, 200);
      const lits = [];
      const contrast = [];
      for (const ms of [6000, 6840, 7260, 8100, 9000]) {
        ctxState.pos = ms;
        await apply({ type: "progress", position: ms, playing: false, duration: 60000 }, 420);
        const box = currentBox();
        const s = box ? boxStats(box) : null;
        lits.push(Number(attrs().lit));
        contrast.push(s ? Number(s.contrast.toFixed(2)) : 0);
      }
      return { lits, contrast, attrs: attrs() };
    });

    await step("still", async () => {
      /* 先等机位与落版都彻底到站，再量一段窗口：窗口里不许再有任何重画 */
      await wait(2000);
      const a = { frames, draws: probe().draws };
      await wait(1200);
      const b = { frames, draws: probe().draws };
      return { framesA: a.frames, framesB: b.frames, drawsA: a.draws, drawsB: b.draws };
    });

    await step("longsong", async () => {
      await mount();
      ctxState.lines = makeLyrics(420);
      await apply({ type: "lyrics" }, 300);
      ctxState.playing = true;
      ctxState.pos = 1200 + 300 * 2600;
      skin.update(ctxObj, { type: "progress", position: ctxState.pos, playing: true, duration: 999999 });
      await wait(400);
      const st = probe();
      /* 一帧到底多贵：**每次先跳到很远的一句**（触发切镜 ⇒ 摄像机真的换地方），
         再用 resize 补丁逼出同步的整帧绘制（paintOnce），连做 12 次取均值。
         不跳的话机位早就到站了，签名不变 ⇒ 一个像素都不画，量出来的 0.03ms 是假数。 */
      const t0 = performance.now();
      for (let i = 0; i < 12; i += 1) {
        ctxState.pos = 1200 + (i % 2 === 0 ? 40 : 320) * 2600;
        skin.update(ctxObj, { type: "progress", position: ctxState.pos, playing: true, duration: 999999 });
        skin.update(ctxObj, { type: "resize" });
      }
      const paintMs = (performance.now() - t0) / 12;
      return {
        bars: st.world?.n,
        H: st.world?.H,
        density: st.world?.density,
        drew: st.drew,
        culled: st.culled,
        attrDrew: Number(attrs().drew),
        attrCulled: Number(attrs().culled),
        paintMs: Number(paintMs.toFixed(2)),
      };
    });

    await step("empty", async () => {
      await mount();
      ctxState.lines = [];
      await apply({ type: "lyrics" }, 400);
      const st = probe();
      const el = document.querySelector(".at__empty");
      return {
        mode: st.mode,
        attrs: attrs(),
        text: el ? el.textContent : "",
        lattice: canvasMark(".at__cv--wall"),
        live: canvasInk(".at__cv--live"),
      };
    });

    await step("poster", async () => {
      await mount();
      ctxState.options.showLyrics = false;
      await apply({ type: "options" }, 400);
      const st = probe();
      const t = document.querySelector(".at__poster-title");
      return {
        mode: st.mode,
        attrs: attrs(),
        title: t ? t.textContent : "",
        wall: canvasMark(".at__cv--wall"),
        live: canvasInk(".at__cv--live"),
      };
    });

    await step("fontsize", async () => {
      await mount();
      const a = probe();
      ctxState.options.lyricsFontSize = 34;
      await apply({ type: "options" }, 250);
      const b = probe();
      return {
        emA: a.view.emPx,
        emB: b.view.emPx,
        wA: a.world?.W,
        wB: b.world?.W,
        hA: a.world?.H,
        hB: b.world?.H,
      };
    });

    await step("interaction", async () => {
      await mount();
      ctxState.pos = 1200 + 2 * 2600;
      await apply({ type: "progress", position: ctxState.pos, playing: false, duration: 200000 }, 700);
      const target = 5;
      /* 每次派发前**重新**算屏幕坐标：机位还在缓动，坐标会过期 */
      const pointAt = (i) => {
        const st = probe();
        const r = st.rects[i];
        const f = st.view;
        const s = st.s;
        const rect = stage.getBoundingClientRect();
        return {
          clientX: rect.left + f.left + f.w / 2 + (r.x + r.w / 2 - st.cam.cx) * s,
          clientY: rect.top + f.top + f.h * 0.55 + (r.y + r.h / 2 - st.cam.cy) * s,
        };
      };
      const ev = (type, extra = {}) =>
        new PointerEvent(type, { bubbles: true, cancelable: true, ...extra });
      const el = () => document.querySelector(".at");

      el().dispatchEvent(ev("pointermove", pointAt(target)));
      await wait(60);
      const hover = probe().hover;
      const hoverAttr = attrs().over;
      el().dispatchEvent(ev("click", pointAt(target)));
      await wait(60);
      const seeks = ctxState.seeks.slice();
      const expectSeek = ctxState.lines[target]?.time;

      /* 滚轮：手动取景偏移，随后自动回中 */
      el().dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 240 }));
      await wait(60);
      const manualY = probe().manualY;

      /* interactive:false ⇒ 一个监听器都不挂（点了也不该 seek） */
      ctxState.seeks.length = 0;
      ctxState.options.interactive = false;
      await apply({ type: "options" }, 200);
      el().dispatchEvent(ev("click", pointAt(target)));
      await wait(80);
      return {
        hover,
        hoverAttr,
        seeks,
        expectSeek,
        manualY,
        seeksOff: ctxState.seeks.length,
        attrInteractive: attrs().interactive,
      };
    });

    await step("finale", async () => {
      await mount();
      ctxState.playing = true;
      /* 先记下"跟着某一句"时的取景倍率，才能说清"拉远"拉了多少 */
      ctxState.pos = ctxState.lines[5].time + 900;
      await apply({ type: "progress", position: ctxState.pos, playing: true, duration: 200000 }, 1600);
      const kLine = probe().cam.k;
      const last = ctxState.lines[ctxState.lines.length - 1].time;
      ctxState.pos = last + 9000;
      skin.update(ctxObj, { type: "progress", position: ctxState.pos, playing: true, duration: 200000 });
      await wait(2800);
      const st = probe();
      const s = st.s;
      const fx = st.view.left + st.view.w / 2;
      const fy = st.view.top + st.view.h * 0.55;
      const inside = (p) => {
        const x = fx + (p.x - st.cam.cx) * s;
        const y = fy + (p.y - st.cam.cy) * s;
        return x >= 0 && x <= 900 && y >= 0 && y <= 600;
      };
      const cornerFit =
        inside({ x: 0, y: 0 }) &&
        inside({ x: st.world.W, y: 0 }) &&
        inside({ x: 0, y: st.world.H }) &&
        inside({ x: st.world.W, y: st.world.H });
      return { kLine, k: st.cam.k, cornerFit, attrs: attrs(), finale: st.finale, drew: st.drew };
    });

    await step("spectrum", async () => {
      await mount();
      ctxState.playing = true;
      ctxState.spectrum = new Array(128).fill(0);
      ctxState.pos = 1200 + 5 * 2600;
      await apply({ type: "progress", position: ctxState.pos, playing: true, duration: 200000 }, 500);
      const low = probe();
      const lowInk = canvasInk(".at__cv--live");
      /* 低频拉满：辉光/薄雾只能改绘制参数，几何必须一个像素都不动 */
      ctxState.spectrum = new Array(128).fill(0).map((_, i) => (i < 14 ? 1 : 0.2));
      await apply({ type: "progress", position: ctxState.pos, playing: true, duration: 200000 }, 500);
      const high = probe();
      const same =
        low.world.W === high.world.W &&
        low.world.H === high.world.H &&
        low.rects.every((r, i) => r.x === high.rects[i].x && r.y === high.rects[i].y && r.dir === high.rects[i].dir);
      return {
        geometryStable: same,
        bassLow: low.bass,
        bassHigh: high.bass,
        inkLow: lowInk,
        inkHigh: canvasInk(".at__cv--live"),
      };
    });

    await step("idle", async () => {
      await mount();
      ctxState.playing = false;
      ctxState.pos = 1200 + 3 * 2600;
      await apply({ type: "progress", position: ctxState.pos, playing: false, duration: 200000 }, 900);
      /* 先等过 6s 的停帧线，再量一段窗口：窗口里必须**零帧** */
      await wait(6500);
      const before = frames;
      await wait(1200);
      const after = frames;
      return { before, after, attrs: attrs(), idle: probe().idle, framesWhileIdle: after - before };
    });

    await step("noanim", async () => {
      await mount();
      ctxState.options.animations = false;
      await apply({ type: "options" }, 300);
      const before = frames;
      ctxState.playing = true;
      for (let i = 0; i < 6; i += 1) {
        ctxState.pos += 900;
        skin.update(ctxObj, { type: "progress", position: ctxState.pos, playing: true, duration: 200000 });
        await wait(120);
      }
      const st = probe();
      return { framesBefore: before, framesAfter: frames, attrs: attrs(), lineIndex: st.lineIndex, k: st.cam.k };
    });

    await step("perf", async () => {
      await mount();
      const smooth = probe();
      ctxState.options.performanceMode = "performance";
      ctxState.options.budgetFps = 30;
      ctxState.playing = true;
      await apply({ type: "options" }, 400);
      const st = probe();
      return {
        attrs: attrs(),
        smoothPerf: smooth.performance,
        performance: st.performance,
        animations: st.animations,
        live: canvasInk(".at__cv--live"),
      };
    });

    await step("destroy", async () => {
      await mount();
      await apply({ type: "progress", position: ctxState.pos, playing: false, duration: 200000 }, 200);
      skin.destroy(ctxObj);
      await wait(300);
      const before = frames;
      await wait(600);
      const leftover = {
        children: stage.children.length,
        html: stage.innerHTML.length,
      };
      ctxState.seeks.length = 0;
      stage.dispatchEvent(new PointerEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
      return { leftover, framesFrozen: frames === before, seeksAfterDestroy: ctxState.seeks.length, probe: probe() };
    });
  } finally {
    window.requestAnimationFrame = rafOrig;
    window.cancelAnimationFrame = cafOrig;
    out.frames = frames;
    out.backdrops = ctxState?.backdrops?.length || 0;
  }
  return out;
}

/* ---------------- 截图用的摆位 ---------------- */
async function pose(kind) {
  if (!ctxObj) {
    await mount();
  } else {
    skin.destroy(ctxObj);
    await mount();
  }
  if (kind === "empty") {
    ctxState.lines = [];
    skin.update(ctxObj, { type: "lyrics" });
  } else if (kind === "poster") {
    ctxState.options.showLyrics = false;
    skin.update(ctxObj, { type: "options" });
  } else if (kind === "plate") {
    ctxState.playing = true;
    ctxState.pos = 1200 + 8 * 2600 + 1400;
    skin.update(ctxObj, { type: "progress", position: ctxState.pos, playing: true, duration: 200000 });
  } else if (kind === "finale") {
    ctxState.playing = true;
    ctxState.pos = ctxState.lines[ctxState.lines.length - 1].time + 9000;
    skin.update(ctxObj, { type: "progress", position: ctxState.pos, playing: true, duration: 200000 });
    await wait(2800);
    return true;
  }
  await wait(1600);
  return true;
}

window.__atlas = { run, pose, probe, attrs, frames: () => frames };
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
const OUT = join(tmpdir(), "atlas-check-" + Date.now());
mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

const CDP_PORT = 9433;
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
    ready = (await evaluate("!!window.__atlas")) === true;
    if (ready) break;
  }
  if (!ready) throw new Error("harness 页面没准备好（window.__atlas 未定义）");

  console.log("\n[1] 挂载与世界");
  const r = await evaluate("window.__atlas.run()");
  const S = r?.steps || {};
  console.log(
    "   ",
    JSON.stringify({
      mount: S.mount && { attrs: S.mount.attrs, ink: S.mount.canvasInk },
      world: S.world && {
        bars: S.world.bars,
        lines: S.world.lines,
        W: S.world.W && Number(S.world.W.toFixed(2)),
        H: S.world.H && Number(S.world.H.toFixed(2)),
        density: S.world.density && Number(S.world.density.toFixed(3)),
        vert: S.world.vert,
        overlap: S.world.overlap,
      },
      camera: S.camera && { mono: S.camera.mono, rest: S.camera.rest, cut: S.camera.cut },
      reveal: S.reveal && { lits: S.reveal.lits, contrast: S.reveal.contrast },
      still: S.still,
      longsong: S.longsong,
    })
  );

  check(!r?.errors?.length, "九个场景全程无异常", JSON.stringify(r?.errors));
  check(S.mount && !S.mount.probe?.error && S.mount.probe?.mode === "plate", "能挂载并进入「铅字盘」形态", JSON.stringify(S.mount?.probe?.error));
  check(S.mount?.canvasInk > 500, "挂载后画布上真的有字（不是空白舞台）", `ink=${S.mount?.canvasInk}`);
  check(S.mount?.attrs?.["anim"] === "1" && S.mount?.attrs?.["mix"] === "0.5", "可观测读数齐全（anim/mix）", JSON.stringify(S.mount?.attrs));
  for (const key of ["bars", "cols", "h", "density", "line", "lit", "culled", "drew", "idle", "mix", "anim", "perf"]) {
    check(S.mount?.attrs?.[key] !== undefined, `暴露 data-${key}`, JSON.stringify(S.mount?.attrs));
  }

  console.log("\n[2] 装箱：不重叠、不掉行、有横有竖、密度达标");
  check(S.world?.bars === S.world?.lines, "行数一根不少", `${S.world?.bars}/${S.world?.lines}`);
  check(S.world?.overlap === 0, "任何两根条都不重叠", `overlap=${S.world?.overlap}`);
  check(S.world?.vert > 0, "盘面上真的有竖排条（朝向打乱生效）", `vert=${S.world?.vert}`);
  check(
    S.world?.density >= 0.6,
    "密度达标（用户要的「尽量密集」）",
    `density=${S.world?.density}`
  );
  check(
    Number(S.world?.attrs?.["cols"]) > 0 && Math.abs(Number(S.world?.attrs?.cols) - S.world?.W) < 0.01,
    "data-cols 与世界的实际宽度对得上"
  );

  console.log("\n[3] 安全区：HUD 让开宿主壳的两条带子");
  check(S.world?.view?.top === 88, "视口顶部让开 --skin-inset-top", `top=${S.world?.view?.top}`);
  check(
    S.world?.view?.h === 600 - 88 - 92,
    "歌词区域高度 = 舞台高 − 上下安全区",
    `h=${S.world?.view?.h}`
  );
  check(S.world?.hudTop >= 88, "HUD 上排没有压进标题栏带子", `hudTop=${S.world?.hudTop}`);
  check(S.world?.hudBottom <= 600 - 92, "HUD 下排没有压进播放控件带子", `hudBottom=${S.world?.hudBottom}`);

  console.log("\n[4] 摄像机：跟随不过冲、远处切镜");
  check(S.camera?.mono === true, "阻尼跟随逐帧单调收敛（不过冲）", JSON.stringify(S.camera?.dist));
  check(S.camera?.rest < 2, "400ms 内贴到目标（像素级）", `rest=${S.camera?.rest?.toFixed?.(2)}`);
  check(S.camera?.cut === true, "跨半首歌的 seek 是「切镜」而不是慢慢平移过去", JSON.stringify({ jump: S.camera?.jump, need: S.camera?.jumpNeed }));

  console.log("\n[5] 逐字落版：data-lit 单调涨、画布上真的有墨");
  const lits = S.reveal?.lits || [];
  check(lits.length === 5 && lits[0] === 0 && lits[lits.length - 1] === 7, "data-lit 从 0 涨到整句（7 个字素）", JSON.stringify(lits));
  check(lits.every((v, i) => i === 0 || v >= lits[i - 1]), "落版字数单调不减", JSON.stringify(lits));
  check(
    (S.reveal?.contrast || []).every((c) => c >= 4.5),
    "当前条按像素量的对比度 ≥ 4.5:1（挡板真的压住了邻居）",
    JSON.stringify(S.reveal?.contrast)
  );

  console.log("\n[6] 省电：静止不重画、暂停 6s 停帧、关动效零帧");
  check(
    S.still && S.still.framesB > S.still.framesA && S.still.drawsB === S.still.drawsA,
    "帧循环还在跑，但静止时**一次重画都没有**",
    JSON.stringify(S.still)
  );
  check(S.idle?.framesWhileIdle === 0 && S.idle?.idle === true, "暂停 6s 后彻底停帧", JSON.stringify(S.idle));
  check(S.noanim?.framesAfter === S.noanim?.framesBefore, "关动效档：一帧都不起（补丁驱动）", JSON.stringify(S.noanim));
  check(
    S.perf?.performance === true && S.perf?.attrs?.["perf"] === "1",
    "性能档可用且可观测",
    JSON.stringify(S.perf)
  );
  check(
    S.perf?.smoothPerf === false,
    "「smooth」档不许被当成性能档（契约里它是字符串，不是布尔）",
    JSON.stringify({ smoothPerf: S.perf?.smoothPerf })
  );

  console.log("\n[7] 长歌：剔除生效、单帧成本可控");
  check(S.longsong?.bars === 420, "420 行的歌词全部入盘", `bars=${S.longsong?.bars}`);
  check(S.longsong?.culled > 0, "视口剔除真的在剔（不是全盘重画）", `culled=${S.longsong?.culled} drew=${S.longsong?.drew}`);
  check(S.longsong?.drew < S.longsong?.bars / 2, "一帧只画视口里的那些条", `drew=${S.longsong?.drew}/${S.longsong?.bars}`);
  check(S.longsong?.paintMs < 40, "移动中的一整帧（重画整块盘子）< 40ms", `${S.longsong?.paintMs}ms`);
  check(S.longsong?.paintMs > 0.2, "这一帧是真画了东西（不是签名没变所以什么都没画）", `${S.longsong?.paintMs}ms`);
  check(S.longsong?.density >= 0.6, "长歌密度依然达标", `density=${S.longsong?.density}`);

  console.log("\n[8] 频谱只碰绘制参数");
  check(S.spectrum?.geometryStable === true, "低频拉满后世界几何一个像素都没动", JSON.stringify(S.spectrum));
  check(S.spectrum?.bassHigh > S.spectrum?.bassLow, "但辉光基线确实跟着低频走了", JSON.stringify({ lo: S.spectrum?.bassLow, hi: S.spectrum?.bassHigh }));

  console.log("\n[9] 交互：点条跳转、滚轮预览、关掉交互就不挂监听");
  check(S.interaction?.hover === 5 && S.interaction?.hoverAttr === "1", "指针悬停命中第 5 根条", JSON.stringify({ h: S.interaction?.hover, attr: S.interaction?.hoverAttr }));
  check(
    S.interaction?.seeks?.length === 1 && S.interaction.seeks[0] === S.interaction.expectSeek,
    "点击 seek 到那一行的时间",
    JSON.stringify(S.interaction?.seeks)
  );
  check(S.interaction?.manualY !== 0, "滚轮产生手动取景偏移（随后自动回中）", `manualY=${S.interaction?.manualY}`);
  check(S.interaction?.seeksOff === 0 && S.interaction?.attrInteractive === "0", "interactive:false 后点击不再 seek", JSON.stringify(S.interaction));

  console.log("\n[10] 空态 / 海报 / 字号 / 曲末 / 卸载");
  check(S.empty?.mode === "empty" && S.empty?.attrs?.["empty"] === "1", "无歌词 ⇒ 空态", JSON.stringify(S.empty?.attrs));
  check(S.empty?.text?.length > 0, "空态有话说（不是空白舞台）", S.empty?.text);
  check(S.empty?.lattice > 300 && S.empty?.live === 0, "空态画的是虚线底盘，不动图层干净", JSON.stringify({ lattice: S.empty?.lattice, live: S.empty?.live }));
  check(S.poster?.mode === "poster" && S.poster?.title === "测试曲目", "关歌词 ⇒ 海报形态（只剩曲名）", JSON.stringify(S.poster));
  check(S.poster?.wall === 0 && S.poster?.live === 0, "海报形态不画铅字盘", JSON.stringify({ w: S.poster?.wall, l: S.poster?.live }));
  check(
    S.fontsize?.emB === 34 && S.fontsize?.wA === S.fontsize?.wB && S.fontsize?.hA === S.fontsize?.hB,
    "用户歌词字号只换 emPx，世界不重排（装箱与字号无关）",
    JSON.stringify(S.fontsize)
  );
  check(
    S.finale?.finale === true && S.finale?.cornerFit === true && S.finale?.k < S.finale?.kLine * 0.8,
    "曲末拉远看全貌（整块盘子都进画面）",
    JSON.stringify({ k: S.finale?.k, kLine: S.finale?.kLine, fit: S.finale?.cornerFit })
  );
  check(S.destroy?.leftover?.html === 0 && S.destroy?.probe === null, "destroy 后挂载点清空、状态归零", JSON.stringify(S.destroy?.leftover));
  check(S.destroy?.framesFrozen === true && S.destroy?.seeksAfterDestroy === 0, "destroy 后不再起帧、点击不再 seek", JSON.stringify(S.destroy));

  if (SHOTS) {
    console.log("\n[11] 截图（供肉眼复核）");
    for (const kind of ["plate", "finale", "empty", "poster"]) {
      await evaluate(`window.__atlas.pose(${JSON.stringify(kind)})`);
      await sleep(500);
      const st = await evaluate("window.__atlas.probe()");
      console.log(
        `   ${kind}: k=${st?.cam?.k?.toFixed(3)} s=${st?.s?.toFixed(1)}px/em ` +
          `W=${st?.world?.W?.toFixed(2)} H=${st?.world?.H?.toFixed(2)} ` +
          `行=${st?.lineIndex} 曲末=${st?.finale ? "是" : "否"} 模式=${st?.mode}`
      );
      await shot(kind);
    }
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
