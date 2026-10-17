/* ==========================================================================
   diva/tests/diva-check.mjs — 「虚拟歌姬 · 全息演唱会」无头浏览器自检
   --------------------------------------------------------------------------
   ★ 本脚本属于**样式包自己**，与播放器项目源码零耦合：
     · 自己起一个只读静态服务，只暴露 plugins/style/diva/ 这一个目录；
     · 自己在页面里搭「假宿主」（ctx 的取值函数 + sdk + actions + 频谱），
       不 import 宿主的 store / playerhost / player-skins；
     · 歌词只用契约形态 `{ time, text, trans?, words? }`，连 LRC 解析器都不用。

   因此不需要 `npm run dev`，也不要把样式装进播放器：

       node plugins/style/diva/tests/diva-check.mjs

   覆盖（对应交付台账 S2/S3/S6/S7/S11）：
     1. 挂载 / HUD / 逐字歌词 / 画布真的出画（像素指纹会变）；
     2. 频谱驱动：--dv-beat / data-dv-spec / data-dv-beat；
     3. 暂停 6 秒停帧、恢复播放重新起帧、前后台停帧；
     4. animations:false / reducedMotion → 静止形态（0 帧但画面完整）；
     5. performance 档按 budgetFps 限帧、dpr 上限收档；
     6. 安全区：1280/820 与 88/92、窄窗 820/86、归零档（桌面背景歌词窗口）；
     7. 点击舞台播放/暂停、点击歌词跳转；interactive:false 全禁用；
     8. 封面取色 → reportBackdrop（合法 hex、对比度、色相带）；
     9. 空态（无歌 / 无歌词）、resize 窄窗、destroy 零残留、可重挂。

   为什么把 rAF 换成定时器：headless 下合成器不给 BeginFrame（rAF 可能一次都不来），
   样式自己的帧循环会一帧都不跑；换掉之后循环与合成器无关，能稳定推进。
   ========================================================================== */

import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
};

/* ==========================================================================
   页面里的假宿主
   ========================================================================== */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>diva check</title>
<style>
  html, body { margin: 0; background: #04050c; overflow: hidden; }
  /* 与真宿主一致：整窗背景层在舞台**下面**（z-index 更低），否则截图只会拍到背景层 */
  .skin-bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
  .playerview { position: fixed; left: 0; top: 0; z-index: 1; overflow: hidden; background: #04050c; }
</style>
</head>
<body>
<script type="module">
import skin from "/skin.js";

/* 把 console.warn 收集起来：entry 把单帧绘制异常降级成 warn（不打断循环），
   截图/调试时要能看到它，否则只会看到一块空画布。 */
window.__warns = [];
{
  const origWarn = console.warn.bind(console);
  console.warn = (...args) => {
    window.__warns.push(args.map((a) => (a && a.message ? a.message : String(a))).join(" "));
    origWarn(...args);
  };
}

const rafOrig = window.requestAnimationFrame;
const cafOrig = window.cancelAnimationFrame;
let rafCount = 0;
window.requestAnimationFrame = (cb) => {
  rafCount += 1;
  return setTimeout(() => cb(performance.now()), 8);
};
window.cancelAnimationFrame = (id) => clearTimeout(id);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 5000, step = 60) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeout) {
    if (fn()) return true;
    await sleep(step);
  }
  return false;
}

/* ---- 契约形态的数据 ---- */
const SONG = { id: "t1", title: "星轨 · Starlight", artist: "全息歌姬", album: "HOLO DEMO", duration: 240000, kind: "local" };
const LINES = [
  { time: 4000, text: "第一句歌词", trans: ["first line of the song"], words: [4000, 4400, 4800, 5200, 5600] },
  { time: 8000, text: "第二句歌词", trans: ["second line"] },
  { time: 14000, text: "副歌开始的地方" },
];

function makeCoverDataUrl() {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 96;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 96, 96);
  grad.addColorStop(0, "#ff2a9d");
  grad.addColorStop(0.5, "#9b7bff");
  grad.addColorStop(1, "#57e6ff");
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  return c.toDataURL("image/png");
}

function splitGraphemes(text) {
  return Array.from(String(text == null ? "" : text));
}
function findLyricIndex(lines, pos) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].time <= pos) idx = i;
  return idx;
}

function makeBandFrame(now, amp = 1) {
  const bands = new Float32Array(128);
  const phase = (now % 620) / 620;
  const pulse = Math.exp(-phase * 5.5);
  for (let i = 0; i < 128; i++) {
    const tilt = Math.exp(-i / 26);
    const wob = 0.45 + 0.45 * Math.sin(now * 0.0035 + i * 0.37);
    bands[i] = Math.max(0, Math.min(1, (0.2 + 0.55 * wob) * tilt * amp + pulse * tilt * 0.9));
  }
  return bands;
}

function buildStage({ width = 1280, height = 820, insetTop = 88, insetBottom = 92 } = {}) {
  const pv = document.createElement("div");
  pv.className = "playerview";
  pv.dataset.skin = "diva";
  pv.style.width = width + "px";
  pv.style.height = height + "px";
  pv.style.setProperty("--skin-inset-top", insetTop + "px");
  pv.style.setProperty("--skin-inset-bottom", insetBottom + "px");
  const stage = document.createElement("div");
  stage.id = "stage";
  stage.style.cssText = "position:absolute;inset:0;";
  pv.appendChild(stage);
  document.body.appendChild(pv);

  const bg = document.createElement("div");
  bg.className = "skin-bg";
  bg.dataset.skin = "diva";
  document.body.appendChild(bg);
  return { pv, stage, bg };
}

function makeHost({ width = 1280, height = 820, dpr = 1, env = {}, options = {}, song = SONG, cover = "", lyrics = null, playback = null } = {}) {
  const { pv, stage, bg } = buildStage({ width, height, insetTop: env.insetTop ?? 88, insetBottom: env.insetBottom ?? 92 });
  const host = {
    pv,
    stage,
    bg,
    calls: [],
    reports: [],
    played: false,
    opts: {
      showLyrics: true,
      lyricsFontSize: 30,
      animations: true,
      coverCarousel: false,
      coverCarouselInterval: 8000,
      interactive: true,
      performanceMode: "smooth",
      budgetFps: 45,
      ...options,
    },
    envData: {
      themeId: "holo-diva",
      mode: "dark",
      width,
      height,
      dpr,
      reducedMotion: false,
      foreground: true,
      ...env,
    },
    media: {
      song,
      cover,
      covers: cover ? [cover] : [],
      coverIndex: 0,
      lyrics: {
        lines: lyrics ? lyrics.lines : LINES,
        text: "x",
        source: lyrics ? lyrics.source || "lrc-file" : "lrc-file",
        status: lyrics ? lyrics.status || "ok" : "ok",
        statusText: lyrics ? lyrics.statusText || "" : "",
        index: 0,
      },
    },
    state: {
      position: playback ? playback.position : 0,
      duration: playback ? playback.duration : 240000,
      playing: playback ? playback.playing : true,
      volume: 1,
      muted: false,
    },
    spectrumMode: "off",
    spectrum: null,
    _lastSpecAt: 0,
  };

  const actions = new Proxy(
    {},
    {
      get(_t, key) {
        if (key === "reportBackdrop") {
          return (colors) => {
            host.reports.push(colors);
          };
        }
        return (...args) => {
          host.calls.push({ name: String(key), args });
          if (String(key) === "togglePlay") host.played = !host.played;
        };
      },
    }
  );

  const ctx = {
    root: stage,
    backgroundRoot: bg,
    sdk: {
      version: "3.0",
      define: (s) => s,
      splitGraphemes,
      findLyricIndex,
      lyricDisplayText: (line) => (line && line.text ? line.text : ""),
      formatLrcTime: (ms) => String(ms),
      parseLrc: () => ({ lines: LINES, offset: 0 }),
      applyFit: (el) => el,
      fitScale: () => 1,
      fitScaleOf: () => 1,
      marqueeText: (el, text) => {
        if (el) el.textContent = String(text ?? "");
      },
      createLyricsView: () => null,
      createFxLyrics: () => null,
      createCamera: () => null,
      createBackgroundLayer: () => null,
      html: {
        EMPTY_TRACK: {},
        escapeHtml: (s) => String(s ?? ""),
        setCoverImage: (el, src) => {
          if (el && src) el.src = src;
        },
        subtitleOf: (a, b) => [a, b].filter(Boolean).join(" · "),
        lyricsEmptyText: (l) => (l && (l.statusText || (l.status === "loading" ? "歌词加载中…" : "暂无歌词"))) || "暂无歌词",
      },
      util: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)), esc: (s) => String(s), debounce: (f) => f },
    },
    actions,
    on: () => () => {},
    defaultCover: "",
    get themeId() {
      return host.envData.themeId;
    },
    get mode() {
      return host.envData.mode;
    },
    get interactive() {
      return host.opts.interactive !== false;
    },
    playback: () => ({ ...host.state }),
    env: () => ({ ...host.envData }),
    options: () => ({ ...host.opts }),
    media: () => ({
      song: host.media.song,
      cover: host.media.cover,
      covers: host.media.covers.slice(),
      coverIndex: 0,
      lyrics: { ...host.media.lyrics },
    }),
    track: () => host.media.song,
    lyrics: () => ({ ...host.media.lyrics }),
    covers: () => ({ list: host.media.covers.slice(), index: 0, current: host.media.cover }),
    spectrum() {
      if (host.spectrumMode === "off") return null;
      const now = performance.now();
      if (host.spectrum && now - host._lastSpecAt < 33) return host.spectrum;
      host._lastSpecAt = now;
      host.spectrum = { bands: makeBandFrame(now, host.spectrumMode === "loud" ? 1 : 0.55), at: now };
      return host.spectrum;
    },
  };

  host.ctx = ctx;
  host.mount = () => skin.mount(ctx);
  host.destroy = () => skin.destroy(ctx);
  host.push = (patch) => skin.update(ctx, patch);
  host.setProgress = (position, playing = host.state.playing, duration = host.state.duration) => {
    host.state.position = position;
    host.state.playing = playing;
    host.state.duration = duration;
    host.media.lyrics.index = findLyricIndex(host.media.lyrics.lines, position);
    host.push({ type: "progress", position, duration, playing, lyricIndex: host.media.lyrics.index });
  };
  host.setState = (playing) => {
    host.state.playing = playing;
    host.push({ type: "state", playing, volume: 1, muted: false });
  };
  host.setOptions = (patch) => {
    Object.assign(host.opts, patch);
    host.push({ type: "options", options: { ...host.opts } });
  };
  host.setEnv = (patch, { pushResize = true } = {}) => {
    Object.assign(host.envData, patch);
    if (patch.width || patch.height || patch.dpr) {
      host.pv.style.width = host.envData.width + "px";
      host.pv.style.height = host.envData.height + "px";
    }
    if (pushResize) host.push({ type: "resize", width: host.envData.width, height: host.envData.height });
  };
  host.teardown = () => {
    try {
      host.destroy();
    } catch {
      /* 已经拆过 */
    }
    host.pv.remove();
    host.bg.remove();
  };
  return host;
}

/* ---- 量具 ---- */
const el = (host, sel) => host.stage.querySelector(sel);
const rect = (node) => {
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
};
const css = (node, prop) => (node ? getComputedStyle(node).getPropertyValue(prop) : "");
const attr = (host, sel, name) => {
  const node = el(host, sel);
  return node ? node.getAttribute(name) : null;
};
const text = (host, sel) => {
  const node = el(host, sel);
  return node ? (node.textContent || "").trim() : null;
};
const parseColor = (str) => {
  const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(String(str || ""));
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
};
const lum = (c) => {
  if (!c) return 0;
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const contrast = (a, b) => {
  const la = lum(a);
  const lb = lum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};
const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return null;
  return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
};
const rgbToHue = (c) => {
  if (!c) return -1;
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h * 360;
};

function canvasStats(host) {
  const canvas = el(host, ".dv__canvas");
  if (!canvas) return null;
  const g = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const box = { x: Math.floor(w * 0.28), y: Math.floor(h * 0.12), w: Math.max(2, Math.floor(w * 0.44)), h: Math.max(2, Math.floor(h * 0.62)) };
  const data = g.getImageData(box.x, box.y, box.w, box.h).data;
  let bright = 0, warm = 0, sum = 0, cyan = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], gg = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, gg, b);
    if (mx > 120) bright += 1;
    if (r > 140 && r > b + 20) warm += 1;
    if (b > 120 && b > r + 15) cyan += 1;
    sum = (sum * 31 + r * 7 + gg * 13 + b * 17) % 2147483647;
  }
  return { bright, warm, cyan, sum, w, h, canvasW: w, canvasH: h };
}

/* ==========================================================================
   场景
   ========================================================================== */
async function scenarioBasics() {
  const host = makeHost({ lyrics: null });
  const out = { name: "basics" };
  host.mount();
  host.setProgress(6000, true);
  await sleep(420);
  out.root = !!el(host, ".dv");
  out.ready = attr(host, ".dv", "data-dv-ready");
  out.frames = Number(attr(host, ".dv", "data-dv-frames") || 0);
  out.title = text(host, ".dv-hud__title");
  out.artist = text(host, ".dv-hud__artist");
  out.badge = attr(host, ".dv-hud__badge", "data-state");
  out.timeCur = text(host, ".dv-hud__cur");
  out.timeDur = text(host, ".dv-hud__dur");
  out.lineCur = text(host, ".dv-lrc__line--cur");
  out.glyphs = host.stage.querySelectorAll(".dv-lrc__g").length;
  out.lit = Number(attr(host, ".dv-lrc__line--cur", "data-dv-lit") || attr(host, ".dv-lrc__lyrics", "data-dv-lit") || 0);
  out.lyricsRootLit = host.stage.querySelector(".dv-lrc")?.getAttribute("data-dv-lit");
  out.empty = host.stage.querySelector(".dv-lrc")?.getAttribute("data-dv-empty");
  const s1 = canvasStats(host);
  out.stats1 = s1;
  await sleep(260);
  const s2 = canvasStats(host);
  out.stats2 = s2;
  out.animating = !!(s1 && s2 && s1.sum !== s2.sum);
  host.teardown();
  return out;
}

async function scenarioEmpty() {
  const host = makeHost({ song: null, lyrics: { lines: [], status: "none", statusText: "暂无歌词，点这里去匹配" } });
  const out = { name: "empty" };
  host.mount();
  await sleep(360);
  out.title = text(host, ".dv-hud__title");
  out.badge = attr(host, ".dv-hud__badge", "data-state");
  out.emptyText = text(host, ".dv-lrc__emptyText");
  out.emptyHidden = host.stage.querySelector(".dv-lrc__empty")?.hidden;
  out.stackHidden = host.stage.querySelector(".dv-lrc__stack")?.hidden;
  out.emptyAttr = host.stage.querySelector(".dv-lrc")?.getAttribute("data-dv-empty");
  const s = canvasStats(host);
  out.hasScene = !!(s && s.bright > 50);
  host.teardown();
  return out;
}

async function scenarioSpectrum() {
  const host = makeHost({ lyrics: null });
  const out = { name: "spectrum" };
  host.mount();
  host.spectrumMode = "loud";
  host.setProgress(6000, true);
  await sleep(900);
  const root = el(host, ".dv");
  out.spec = root?.getAttribute("data-dv-spec");
  out.beats = Number(root?.getAttribute("data-dv-beat") || 0);
  out.beatVar = css(root, "--dv-beat");
  out.energyVar = css(root, "--dv-energy");
  out.frames = Number(root?.getAttribute("data-dv-frames") || 0);
  const a = canvasStats(host);
  await sleep(240);
  const b = canvasStats(host);
  out.changed = !!(a && b && a.sum !== b.sum);
  out.stats = b;
  host.spectrumMode = "off";
  await sleep(360);
  out.specAfterOff = root?.getAttribute("data-dv-spec");
  host.teardown();
  return out;
}

async function scenarioIdle() {
  const host = makeHost({ lyrics: null });
  const out = { name: "idle" };
  host.mount();
  host.setProgress(3000, false);
  await sleep(500);
  const f0 = Number(attr(host, ".dv", "data-dv-frames") || 0);
  await sleep(6400);
  out.idle = attr(host, ".dv", "data-dv-idle");
  const f1 = Number(attr(host, ".dv", "data-dv-frames") || 0);
  await sleep(520);
  const f2 = Number(attr(host, ".dv", "data-dv-frames") || 0);
  out.framesBefore = f0;
  out.framesAfterIdle = f1;
  out.framesFrozen = f2 - f1;
  host.setState(true);
  await sleep(360);
  out.resumedIdle = attr(host, ".dv", "data-dv-idle");
  const f3 = Number(attr(host, ".dv", "data-dv-frames") || 0);
  out.framesResumed = f3 > f2;
  host.teardown();
  return out;
}

async function scenarioStatic() {
  const out = { name: "static" };
  // animations:false
  let host = makeHost({ lyrics: null, options: { animations: false } });
  host.mount();
  host.spectrumMode = "loud";
  host.setProgress(6000, true);
  await sleep(700);
  const root = el(host, ".dv");
  out.anim = root?.getAttribute("data-dv-anim");
  out.frames = Number(root?.getAttribute("data-dv-frames") || 0);
  out.rafDelta = rafCount;
  const s = canvasStats(host);
  out.hasScene = !!(s && s.bright > 50);
  // 静止档下进度补丁仍然要把歌词高亮更新掉（不是"画面死了"）
  host.setProgress(9000, true);
  await sleep(260);
  out.indexAfterPatch = host.stage.querySelector(".dv-lrc")?.getAttribute("data-dv-index");
  out.framesStill = Number(root?.getAttribute("data-dv-frames") || 0);
  host.teardown();

  // reducedMotion:true
  host = makeHost({ lyrics: null, env: { reducedMotion: true } });
  host.mount();
  await sleep(520);
  out.reducedAnim = attr(host, ".dv", "data-dv-anim");
  out.reducedFrames = Number(attr(host, ".dv", "data-dv-frames") || 0);
  out.reducedScene = !!(canvasStats(host)?.bright > 50);
  host.teardown();
  return out;
}

async function scenarioPerf() {
  const out = { name: "perf" };
  // smooth + dpr2：画布倍率封顶 2
  let host = makeHost({ lyrics: null, dpr: 2 });
  host.mount();
  host.setProgress(6000, true);
  await sleep(700);
  const canvas = el(host, ".dv__canvas");
  out.smoothDpr2 = { w: canvas.width, h: canvas.height, perf: attr(host, ".dv", "data-dv-perf") };
  host.teardown();

  // performance 档：45fps 限帧 + dpr 封顶 1.5
  host = makeHost({ lyrics: null, dpr: 2, options: { performanceMode: "performance" } });
  host.mount();
  host.setProgress(6000, true);
  host.spectrumMode = "loud";
  await sleep(1200);
  const root = el(host, ".dv");
  out.perfDpr2 = { w: canvasSize(host).w, h: canvasSize(host).h, attrPerf: root?.getAttribute("data-dv-perf") };
  out.perfFrames = Number(root?.getAttribute("data-dv-frames") || 0);
  host.teardown();
  return out;
}
function canvasSize(host) {
  const c = el(host, ".dv__canvas");
  return c ? { w: c.width, h: c.height } : { w: 0, h: 0 };
}

async function scenarioSafeArea() {
  const out = { name: "safeArea" };
  const host = makeHost({ lyrics: null });
  host.mount();
  host.setProgress(6000, true);
  await sleep(420);
  const stageRect = rect(host.stage);
  const measure = () => {
    const s = rect(host.stage);
    const pick = (sel) => rect(el(host, sel));
    return {
      stage: s,
      title: pick(".dv-hud__title"),
      artist: pick(".dv-hud__artist"),
      badge: pick(".dv-hud__badge"),
      time: pick(".dv-hud__time"),
      lyric: pick(".dv-lrc__line--cur"),
    };
  };
  out.main = measure();
  out.main.stage = stageRect;
  // 窄窗：820×700，底栏 86
  host.setEnv({ width: 820, height: 700, insetBottom: 86 });
  host.pv.style.setProperty("--skin-inset-bottom", "86px");
  await sleep(420);
  out.narrow = measure();
  out.narrow.narrowAttr = attr(host, ".dv", "data-dv-narrow");
  out.narrow.canvas = canvasSize(host);
  // 归零档（桌面背景歌词窗口：没有 chrome）
  host.pv.style.setProperty("--skin-inset-top", "0px");
  host.pv.style.setProperty("--skin-inset-bottom", "0px");
  await sleep(260);
  out.zero = measure();
  out.zero.rootBottom = rect(host.stage.querySelector(".dv__lyrics"))?.bottom ?? null;
  host.teardown();
  return out;
}

async function scenarioInteract() {
  const out = { name: "interact" };
  let host = makeHost({ lyrics: null, playback: { position: 6000, duration: 240000, playing: true } });
  host.mount();
  await sleep(360);
  el(host, ".dv__canvas")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(80);
  out.toggleCalls = host.calls.filter((c) => c.name === "togglePlay").length;
  const line = host.stage.querySelectorAll(".dv-lrc__line")[1];
  line?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(80);
  const seek = host.calls.find((c) => c.name === "seek");
  out.seek = seek ? seek.args[0] : null;
  out.cursor = css(el(host, ".dv__canvas"), "cursor");
  host.teardown();

  // interactive:false：动作全禁用（桌面背景歌词窗口）
  host = makeHost({ lyrics: null, options: { interactive: false } });
  host.mount();
  await sleep(320);
  el(host, ".dv__canvas")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  host.stage.querySelectorAll(".dv-lrc__line")[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(80);
  out.staticCalls = host.calls.length;
  out.staticInteractive = attr(host, ".dv", "data-dv-interactive");
  out.staticHintHidden = host.stage.querySelector(".dv__hint")?.hidden;
  host.teardown();
  return out;
}

async function scenarioPalette() {
  const out = { name: "palette" };
  const cover = makeCoverDataUrl();
  const host = makeHost({ lyrics: null, cover });
  host.mount();
  host.setProgress(6000, true);
  await sleep(900);
  out.reports = host.reports.slice();
  const last = host.reports[host.reports.length - 1];
  if (last) {
    out.validHex = [last.bg, last.fg, last.accent].every((c) => /^#[0-9a-f]{6}$/i.test(c));
    out.contrast = contrast(hexToRgb(last.fg), hexToRgb(last.bg));
    out.hue = rgbToHue(hexToRgb(last.accent));
    out.accentVar = css(el(host, ".dv"), "--dv-accent");
    out.glowVar = css(el(host, ".dv"), "--dv-glow");
  }
  host.teardown();
  return out;
}

async function scenarioDestroy() {
  const out = { name: "destroy" };
  const host = makeHost({ lyrics: null });
  host.mount();
  await sleep(360);
  out.bgBefore = !!host.bg.querySelector(".dv-bg");
  out.rafBefore = rafCount;
  host.destroy();
  // 宿主自己会清空挂载点；这里故意再看一眼插件有没有清
  out.stageEmpty = host.stage.childNodes.length === 0;
  out.bgAfter = !!host.bg.querySelector(".dv-bg");
  const framesAtDestroy = Number(attr(host, ".dv", "data-dv-frames") || 0);
  await sleep(400);
  out.framesAfterDestroy = Number(attr(host, ".dv", "data-dv-frames") || 0);
  out.rafFrozen = rafCount - out.rafBefore < 8;
  // 重新挂载（宿主换样式 / 关详情页再打开）
  host.mount();
  await sleep(360);
  out.remountReady = attr(host, ".dv", "data-dv-ready");
  out.remountFrames = Number(attr(host, ".dv", "data-dv-frames") || 0);
  host.teardown();
  out.framesAtDestroy = framesAtDestroy;
  return out;
}

async function scenarioForeground() {
  const out = { name: "foreground" };
  const host = makeHost({ lyrics: null });
  host.mount();
  host.setProgress(6000, true);
  await sleep(520);
  const before = Number(attr(host, ".dv", "data-dv-frames") || 0);
  host.setEnv({ foreground: false });
  await sleep(700);
  const stopped = Number(attr(host, ".dv", "data-dv-frames") || 0);
  // 再等一段：帧数必须完全冻结（attr 每 8 帧才更新一次，第一次读数允许有滞后）
  await sleep(450);
  const stopped2 = Number(attr(host, ".dv", "data-dv-frames") || 0);
  out.foregroundAttr = attr(host, ".dv", "data-dv-foreground");
  out.stoppedDelta = stopped - before;
  out.frozenDelta = stopped2 - stopped;
  host.setEnv({ foreground: true });
  await sleep(420);
  out.resumed = Number(attr(host, ".dv", "data-dv-frames") || 0) > stopped2;
  host.teardown();
  return out;
}

async function scenarioLyricsModes() {
  const out = { name: "lyricsModes" };
  const host = makeHost({ lyrics: { lines: [{ time: 4000, text: "没有逐字时间轴的一行", trans: ["no word timing"] }, { time: 9000, text: "第二行" }] } });
  host.mount();
  host.setProgress(5000, true);
  await sleep(400);
  out.plainLine = text(host, ".dv-lrc__line--cur");
  out.plainGlyphs = host.stage.querySelectorAll(".dv-lrc__line--cur .dv-lrc__g").length;
  out.trans = text(host, ".dv-lrc__trans");
  out.prev = text(host, ".dv-lrc__line--prev");
  out.next = text(host, ".dv-lrc__line--next");
  // 无歌词 → 空态；再恢复
  host.media.lyrics = { lines: [], text: "", source: "none", status: "failed", statusText: "歌词匹配失败，点这里重试", index: -1 };
  host.push({ type: "lyrics", lyrics: host.media.lyrics });
  await sleep(260);
  out.emptyText = text(host, ".dv-lrc__emptyText");
  out.emptyAttr = host.stage.querySelector(".dv-lrc")?.getAttribute("data-dv-empty");
  out.emptyHidden = host.stage.querySelector(".dv-lrc__empty")?.hidden;
  // showLyrics:false 时歌词区隐藏
  host.media.lyrics = { lines: LINES, text: "", source: "lrc-file", status: "ok", statusText: "", index: 0 };
  host.push({ type: "lyrics", lyrics: host.media.lyrics });
  host.setOptions({ showLyrics: false });
  await sleep(260);
  out.hiddenWhenOff = host.stage.querySelector(".dv-lrc")?.hidden;
  host.setOptions({ showLyrics: true });
  await sleep(260);
  out.shownWhenOn = !host.stage.querySelector(".dv-lrc")?.hidden;
  host.teardown();
  return out;
}

async function runAll() {
  const results = {};
  const scenarios = [
    scenarioBasics,
    scenarioEmpty,
    scenarioSpectrum,
    scenarioIdle,
    scenarioStatic,
    scenarioPerf,
    scenarioSafeArea,
    scenarioInteract,
    scenarioPalette,
    scenarioDestroy,
    scenarioForeground,
    scenarioLyricsModes,
  ];
  for (const fn of scenarios) {
    try {
      const r = await fn();
      results[r.name] = r;
    } catch (err) {
      results[fn.name] = { name: fn.name, error: String(err && err.stack ? err.stack : err) };
    }
    await sleep(120);
  }
  results.meta = { rafCount, dpr: window.devicePixelRatio, ua: navigator.userAgent };
  return results;
}

// 先注入宿主会注入的那份 CSS（宿主会包 @layer skin + @scope，这里照做）
const cssText = await (await fetch("/skin.css")).text();
const style = document.createElement("style");
style.textContent = '@layer skin { @scope (.playerview[data-skin="diva"], .skin-bg[data-skin="diva"]) {\\n' + cssText + "\\n} }";
document.head.appendChild(style);

/* —— 截图用：留一个富状态的舞台在页面上（--shot 才会调用） —— */
let shotHost = null;
async function prepareShot({ width = 1440, height = 900, position = 6200 } = {}) {
  if (shotHost) {
    shotHost.teardown();
    shotHost = null;
  }
  const host = makeHost({ width, height, cover: makeCoverDataUrl(), playback: { position, duration: 240000, playing: true } });
  host.mount();
  host.spectrumMode = "loud";
  host.setProgress(position, true);
  await sleep(1800);
  shotHost = host;
  const canvas = el(host, ".dv__canvas");
  const dvRect = rect(el(host, ".dv"));
  const canvasRect = rect(canvas);
  return {
    ready: attr(host, ".dv", "data-dv-ready"),
    spec: attr(host, ".dv", "data-dv-spec"),
    frames: attr(host, ".dv", "data-dv-frames"),
    line: text(host, ".dv-lrc__line--cur"),
    canvas: canvas ? { w: canvas.width, h: canvas.height, css: canvasRect } : null,
    dv: dvRect,
    stats: canvasStats(host),
    warns: (window.__warns || []).slice(-5),
  };
}
function teardownShot() {
  if (shotHost) {
    shotHost.teardown();
    shotHost = null;
  }
}

/**
 * 截图辅助：headless + --disable-gpu 下 Page.captureScreenshot 拍不到 <canvas>，
 * 这里把画布像素转成 <img> 盖在同一位置（z-index 0），让整页截图能把
 * 人物/舞台与 HUD/歌词合成在一张图里。仅 --shot 用，不进入插件运行时。
 */
function composeCanvasAsImage() {
  if (!shotHost) return false;
  const dv = shotHost.stage.querySelector(".dv");
  const canvas = shotHost.stage.querySelector(".dv__canvas");
  if (!dv || !canvas) return false;
  const img = document.createElement("img");
  img.className = "dv__canvas-as-img";
  img.alt = "";
  img.src = canvas.toDataURL("image/png");
  img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:0;";
  canvas.style.visibility = "hidden";
  dv.insertBefore(img, dv.firstChild);
  return true;
}

window.__diva = { runAll, prepareShot, teardownShot, composeCanvasAsImage };
</script>
</body>
</html>`;

/* ==========================================================================
   静态服务
   ========================================================================== */
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

/* ==========================================================================
   无头 Edge + CDP
   ========================================================================== */
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
const OUT = join(tmpdir(), "diva-check-" + Date.now());
mkdirSync(OUT, { recursive: true });

const CDP_PORT = 9451 + (process.pid % 100);
const W = 1440;
const H = 900;
const SONG_TITLE = "星轨 · Starlight";
const SONG_ARTIST = "全息歌姬";
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

/**
 * 关掉无头 Edge 的**整棵进程树**并清掉 profile 目录。
 * 只 kill 父进程不够：Chromium 的 gpu/renderer/crashpad 子进程会变成孤儿留在后台
 * （实测一次成功的 check 也能留下几十个），下次跑会抢 CPU / 占 CDP 端口。
 */
function killEdgeTree() {
  // 顺序很重要：先 tree-kill（父进程还活着时 taskkill /T 才认得出整棵树），
  // 再对父进程补一刀。反过来的话父进程一死，子进程被挂到 init 上，/T 就找不到它们了。
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* taskkill 不可用就只靠下面的 kill */
    }
    // 兜底：Edge 有时会把真正的 browser 进程换一个壳，/T 追不到它留下的孤儿。
    // 按**本次独有的 profile 目录**精确清一次（不会碰到用户自己的 Edge）。
    try {
      const quoted = String(OUT).replace(/'/g, "''");
      const script =
        "$p = Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | " +
        `Where-Object { $_.CommandLine -like '*${quoted}*' }; ` +
        "$p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
      spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "ignore" });
    } catch {
      /* 清不掉孤儿的兜底失败也不影响断言 */
    }
  }
  try {
    edge.kill();
  } catch {
    /* 已退出 */
  }
  try {
    rmSync(OUT, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
  } catch {
    /* 临时目录清不掉不致命 */
  }
}

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
  killEdgeTree();
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
    const text2 = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (text2) errors.push(`error: ${text2}`);
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

/* ==========================================================================
   断言
   ========================================================================== */
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
const near = (v, target, tol) => typeof v === "number" && Math.abs(v - target) <= tol;

try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE + "/__harness.html" });

  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    await sleep(300);
    ready = (await evaluate("!!window.__diva")) === true;
    if (ready) break;
  }
  if (!ready) throw new Error("harness 页面没准备好（window.__diva 未定义）—— 多半是 skin.js / lib 加载失败");

  console.log("[挂载] 运行全部场景（约 20s）…");
  const R = await evaluate("window.__diva.runAll()");
  console.log("   meta:", JSON.stringify(R?.meta || null));

  const basics = R?.basics || {};
  console.log("\n[1] 挂载 / HUD / 当前行 / 画布真的在画");
  check(!basics.error, "basics 场景无异常", basics.error || "");
  check(basics.root === true && basics.ready === "1", "插件挂载并报告 ready", JSON.stringify({ root: basics.root, ready: basics.ready }));
  check(basics.frames > 10, "帧循环在跑", `frames=${basics.frames}`);
  check(basics.title === SONG_TITLE, "HUD 曲名正确", String(basics.title));
  check(basics.artist === SONG_ARTIST, "HUD 歌手正确", String(basics.artist));
  check(basics.badge === "live", "播放中徽标是 LIVE", String(basics.badge));
  check(basics.timeCur === "00:06", "时间码跟着进度走（00:06）", String(basics.timeCur));
  check(basics.lineCur === "第一句歌词", "当前行文本正确", String(basics.lineCur));
  check(basics.glyphs === 5, "当前行按字素拆成 5 个 span", `glyphs=${basics.glyphs}`);
  check(basics.empty === "0", "有歌词时 data-dv-empty=0", String(basics.empty));
  check(Number.isFinite(Number(basics.lyricsRootLit)) && Number(basics.lyricsRootLit) >= 1, "逐字点亮数 ≥ 1", `lit=${basics.lyricsRootLit}`);
  check(basics.stats1?.bright > 300, "舞台中央真的画出了人/光（亮像素足够多）", JSON.stringify(basics.stats1));
  check(basics.animating === true, "两帧画布指纹不同（画面在动）", JSON.stringify({ a: basics.stats1?.sum, b: basics.stats2?.sum }));

  const empty = R?.empty || {};
  console.log("\n[2] 空态（无歌 / 无歌词）");
  check(empty.title === "未在播放", "无歌时 HUD 文案是「未在播放」", String(empty.title));
  check(empty.badge === "standby", "无歌时徽标是 STANDBY", String(empty.badge));
  check(empty.emptyAttr === "1", "空态 data-dv-empty=1", String(empty.emptyAttr));
  check(typeof empty.emptyText === "string" && empty.emptyText.length > 0, "空态有明确文案", String(empty.emptyText));
  check(empty.emptyHidden === false && empty.stackHidden === true, "空态显示提示、隐藏歌词栈");
  check(empty.hasScene === true, "空态下舞台仍然有画面（不是白屏）");

  const spec = R?.spectrum || {};
  console.log("\n[3] 频谱驱动");
  check(spec.spec === "1", "读到频谱后 data-dv-spec=1", String(spec.spec));
  check(Number(spec.beats) > 0, "检测到节拍（data-dv-beat > 0）", `beats=${spec.beats}`);
  check(Number(spec.beatVar) > 0 || Number(spec.energyVar) > 0, "--dv-beat / --dv-energy 被写进 CSS 变量", JSON.stringify({ beat: spec.beatVar, energy: spec.energyVar }));
  check(spec.changed === true, "频谱变化时画面在变", JSON.stringify(spec.stats));

  const idle = R?.idle || {};
  console.log("\n[4] 暂停 6 秒停帧 / 恢复");
  check(idle.idle === "1", "暂停 6 秒后 data-dv-idle=1", String(idle.idle));
  check(idle.framesFrozen === 0, "停帧后帧数不再增长", `frozen=${idle.framesFrozen}`);
  check(idle.resumedIdle === "0" && idle.framesResumed === true, "播放补丁能把帧循环拉起来", JSON.stringify({ idle: idle.resumedIdle, resumed: idle.framesResumed }));

  const st = R?.static || {};
  console.log("\n[5] 静止形态（animations:false / reducedMotion）");
  check(st.anim === "0", "animations:false → data-dv-anim=0", String(st.anim));
  check(st.frames === 0 && st.framesStill === 0, "静止档不排帧循环（0 帧）", JSON.stringify({ f: st.frames, f2: st.framesStill }));
  check(st.hasScene === true, "静止档画面完整可读（不是白屏）", String(st.hasScene));
  check(String(st.indexAfterPatch) === "1", "静止档下进度补丁仍会更新歌词高亮", String(st.indexAfterPatch));
  check(st.reducedAnim === "0" && st.reducedFrames === 0 && st.reducedScene === true, "reducedMotion 同样静止但完整", JSON.stringify(st));

  const perf = R?.perf || {};
  console.log("\n[6] 性能档");
  check(perf.smoothDpr2?.w === 2560 && perf.smoothDpr2?.perf === "0", "smooth 档 dpr=2 时画布按 2× 背板", JSON.stringify(perf.smoothDpr2));
  check(perf.perfDpr2?.w === 1920 && perf.perfDpr2?.attrPerf === "1", "performance 档 dpr 封顶 1.5×（1920）", JSON.stringify(perf.perfDpr2));
  check(perf.perfFrames > 0 && perf.perfFrames <= 62, "performance 档 45fps 限帧生效（观测帧数 ≤ 上限，CPU 忙时只会更低）", `frames/1.2s=${perf.perfFrames}`);

  const safe = R?.safeArea || {};
  console.log("\n[7] 安全区（S11）");
  const inSafe = (r, stage, top, bottom) => r && stage && r.top >= stage.top + top - 2 && r.bottom <= stage.bottom - bottom + 2;
  check(inSafe(safe.main?.title, safe.main?.stage, 88, 92) && inSafe(safe.main?.artist, safe.main?.stage, 88, 92), "1280×820 / 88-92：曲名与歌手在安全区内", JSON.stringify(safe.main));
  check(inSafe(safe.main?.badge, safe.main?.stage, 88, 92) && inSafe(safe.main?.time, safe.main?.stage, 88, 92), "LIVE 徽标与时间码在安全区内");
  check(inSafe(safe.main?.lyric, safe.main?.stage, 88, 92), "当前歌词行在底栏之上", JSON.stringify(safe.main?.lyric));
  check(safe.narrow?.narrowAttr === "1" && safe.narrow?.canvas?.w > 0, "窄窗（820px）标记与画布都跟着收");
  check(inSafe(safe.narrow?.title, safe.narrow?.stage, 88, 86) && inSafe(safe.narrow?.lyric, safe.narrow?.stage, 88, 86), "窄窗安全区（88/86）仍成立", JSON.stringify(safe.narrow));
  check(
    safe.zero?.lyric?.top >= safe.zero?.stage?.top &&
      safe.zero?.rootBottom <= safe.zero?.stage?.bottom + 1 &&
      safe.zero?.stage?.bottom - (safe.zero?.rootBottom ?? 0) < 40,
    "归零档（桌面背景歌词窗口）歌词贴回底边且不越界",
    JSON.stringify({ rootBottom: safe.zero?.rootBottom, stage: safe.zero?.stage })
  );

  const inter = R?.interact || {};
  console.log("\n[8] 交互");
  check(inter.toggleCalls === 1, "点舞台 = 播放 / 暂停", `calls=${inter.toggleCalls}`);
  check(inter.seek === 4000, "点当前行 seek 到该句时间", String(inter.seek));
  check(inter.cursor === "pointer", "可交互舞台有 pointer 光标", String(inter.cursor));
  check(inter.staticCalls === 0 && inter.staticInteractive === "0", "interactive:false 时动作全禁用", JSON.stringify({ calls: inter.staticCalls, attr: inter.staticInteractive }));
  check(inter.staticHintHidden === true, "只读舞台不显示交互提示");

  const pal = R?.palette || {};
  console.log("\n[9] 封面取色 → 宿主壳配色上报");
  check(Array.isArray(pal.reports) && pal.reports.length >= 1, "取色后调用了 reportBackdrop", `reports=${pal.reports?.length}`);
  check(pal.validHex === true, "上报颜色是合法 6 位 hex", JSON.stringify(pal.reports?.[0]));
  check(pal.contrast >= 4.5, "上报的 fg/bg 对比度 ≥ 4.5:1", `contrast=${pal.contrast?.toFixed?.(2)}`);
  check(pal.hue >= 150 && pal.hue <= 340, "accent 落在全息冷色带内", `hue=${pal.hue?.toFixed?.(0)}`);
  check(/^#[0-9a-f]{6}$/i.test(pal.accentVar || ""), "--dv-accent 同步写进舞台 CSS 变量", String(pal.accentVar));

  const ly = R?.lyricsModes || {};
  console.log("\n[10] 歌词模式 / 翻译 / 空态 / 开关");
  check(ly.plainLine === "没有逐字时间轴的一行", "无 words 的行也逐字素渲染", String(ly.plainLine));
  check(ly.plainGlyphs === 10, "无 words 时按字素拆 span（10 个）", `glyphs=${ly.plainGlyphs}`);
  check(typeof ly.trans === "string" && ly.trans.includes("no word timing"), "多语言 trans 显示", String(ly.trans));
  check(typeof ly.prev === "string" && typeof ly.next === "string", "上一句 / 下一句上下文存在", JSON.stringify({ prev: ly.prev, next: ly.next }));
  check(ly.emptyAttr === "1" && typeof ly.emptyText === "string" && ly.emptyText.length > 0, "无歌词 → 空态文案", JSON.stringify({ attr: ly.emptyAttr, text: ly.emptyText }));
  check(ly.hiddenWhenOff === true && ly.shownWhenOn === true, "showLyrics 开关能隐藏 / 恢复歌词区", JSON.stringify({ off: ly.hiddenWhenOff, on: ly.shownWhenOn }));

  const fg = R?.foreground || {};
  console.log("\n[11] 前后台停帧");
  check(fg.foregroundAttr === "0", "env.foreground=false → data-dv-foreground=0", String(fg.foregroundAttr));
  check(fg.frozenDelta === 0, "切后台后帧数完全冻结", JSON.stringify({ delta: fg.stoppedDelta, frozen: fg.frozenDelta }));
  check(fg.resumed === true, "回前台后重新起帧", String(fg.resumed));

  const de = R?.destroy || {};
  console.log("\n[12] destroy 零残留 / 可重挂");
  check(de.bgBefore === true && de.bgAfter === false, "destroy 后整窗背景层里的 .dv-bg 被收回", JSON.stringify({ before: de.bgBefore, after: de.bgAfter }));
  check(de.stageEmpty === true, "destroy 后舞台节点清空", String(de.stageEmpty));
  check(de.rafFrozen === true, "destroy 后不再排帧", `rafDelta=${de.rafFrozen}`);
  check(de.remountReady === "1" && de.remountFrames > 0, "同一页面可以重新挂载", JSON.stringify({ ready: de.remountReady, frames: de.remountFrames }));

  // 可选：留几张实机截图给人工看观感（--shot）
  if (process.argv.includes("--shot")) {
    const ROOT_DIR = resolve(PKG_ROOT, "..", "..", "..");
    const shotPath = join(ROOT_DIR, ".tmp-diva-shot.png");
    const shotNarrowPath = join(ROOT_DIR, ".tmp-diva-shot-narrow.png");
    const s1 = await evaluate("window.__diva.prepareShot({ width: 1440, height: 900 })");
    await sleep(400);
    const png1 = await send("Page.captureScreenshot", { format: "png" });
    if (png1?.result?.data) writeFileSync(shotPath, Buffer.from(png1.result.data, "base64"));
    // 同时把画布自身的像素导出来：用来区分「画布没画」与「画布被合成层盖住」
    const canvasPng = await evaluate("document.querySelector('.dv__canvas')?.toDataURL('image/png') || ''");
    if (typeof canvasPng === "string" && canvasPng.startsWith("data:image/png")) {
      writeFileSync(join(ROOT_DIR, ".tmp-diva-canvas.png"), Buffer.from(canvasPng.split(",")[1], "base64"));
    }
    // 把画布像素换成 <img> 再拍一张整页：headless + --disable-gpu 下直接拍不到 canvas
    const composed = await evaluate("window.__diva.composeCanvasAsImage()");
    if (composed) {
      await sleep(350);
      const pngC = await send("Page.captureScreenshot", { format: "png" });
      if (pngC?.result?.data) {
        writeFileSync(join(ROOT_DIR, ".tmp-diva-composed.png"), Buffer.from(pngC.result.data, "base64"));
      }
      console.log("   shot composed →", join(ROOT_DIR, ".tmp-diva-composed.png"));
    }
    console.log("   shot:", JSON.stringify(s1), "→", shotPath);
    await evaluate("window.__diva.prepareShot({ width: 900, height: 760, position: 9200 })");
    await sleep(600);
    const png2 = await send("Page.captureScreenshot", { format: "png" });
    if (png2?.result?.data) writeFileSync(shotNarrowPath, Buffer.from(png2.result.data, "base64"));
    console.log("   shot narrow →", shotNarrowPath);
    await evaluate("window.__diva.teardownShot()");
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  console.log(errors.length ? `—— 控制台报错 ${errors.length} 条 ——` : "—— 控制台无 error ——");
  for (const e of [...new Set(errors.map((x) => String(x).split("\n")[0]))].slice(0, 20)) console.log(" ", e);
} finally {
  try {
    ws.close();
  } catch {
    /* 已关 */
  }
  killEdgeTree();
  server.close();
}

process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
