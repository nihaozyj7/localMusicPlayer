/* ==========================================================================
   atlas/skin.js — 「铅字盘」  (player-skins 契约 v3 / SKIN_API_VERSION 3.0)
   --------------------------------------------------------------------------
   一句话：**把整篇歌词压进一张密集的活字盘，让摄像机跟着正在唱的那一根巡游。**

   世界（见 lib/pack.js）：
     一句歌词 = 一根铅字条。长度 = 实测文字宽度（em），厚度 = 1.25em
     （有译文时 +0.8em 放副行），朝向 横排 / 竖排（中文正立）二选一，
     在一个 **宽 = 2 × 最长条、高不限** 的条带里按天际线装箱铺满。

   摄像机（见 lib/camera.js）：
     视口大小固定（绝不死贴当前条 —— 那会把"铺满"这件事藏起来），
     临界阻尼跟随（τ≈220ms，永不过冲），目标离得太远就切镜，
     纵向移动带一点点滚转（≤1.2°）。

   时间（见 lib/timing.js）：
     宿主 progress 补丁只有 4Hz 且位置被量化到 250ms，所以播放钟必须用墙钟外推
     （上限 1200ms）。逐字时间轴优先用增强 LRC 的 `line.words`；没有就按字素类别
     合成一条（单字封顶 420ms，唱完停住等下一句）。

   —— 三层画布（为什么是两层 canvas 而不是一层）：
     · `.at__cv--wall`：**整个盘子**（航线 + 除当前条以外的所有条）。只在
       「摄像机位置 / 当前行 / 频谱包络」变化时重画，签名一致就一个像素都不碰。
     · `.at__cv--live`：**当前条**（挡板 + 凹痕 + 逐字落版 + 墨点晕开 + 悬停框）。
       它每帧清一次、只画一根条 —— 所以"逐字点亮"这件事的每帧成本是 O(字数)，
       而不是 O(整篇歌词)。静止时两个签名都不变 ⇒ 零绘制。
     · 十字准线之外的装饰（纸纹、暗角）在 CSS 里，一次性合成。

   —— 硬性纪律（自检逐条量；见 tests/atlas-check.mjs）：
     · 只有一个 rAF；`animations:false` / `prefers-reduced-motion` 一律**不起帧**，
       落版直接给终态、摄像机直接切镜（补丁来了才画一帧静态图）；
     · 暂停后 6s 停帧；`destroy` 后不留残留（监听器、canvas、定时器全撤）；
     · 频谱只影响**绘制参数**（辉光/薄雾 ±4~8%），绝不影响几何 —— 一旦让它
       参与装箱，"换帧重排"会把帧预算烧光，而且画面会因为频段抖动而抽筋；
     · 不写死宿主下发的用户设置（`options.lyricsFontSize` 就是 emPx，见 resize()）；
     · 安全区：给人读的 HUD 一律 `calc(var(--skin-inset-*, 0px) + Npx)`。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

/* 顶层 await：与 magic-circle 同样的理由（子模块要透传入口的 ?t= token，
   静态 import 会把 query 丢掉 → 403）。放在顶层而不是 mount 里，是为了让
   「依赖没加载完就收到 update」这种竞态根本不存在。 */
const pack = await load("pack.js");
const camera = await load("camera.js");
const timing = await load("timing.js");

/* --------------------------------------------------------------------------
   常量
   -------------------------------------------------------------------------- */

/** 铅字盘的字体：**必须与 measureText 用同一串**，否则装箱宽度与绘制宽度不一致 */
const PLATE_FONT =
  'Georgia, "Times New Roman", SimSun, "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", serif';
/** 量文字用的参考字号：按 em 归一，与用户实际字号无关 */
const REF_PX = 100;

const GUTTER = 0.16;
const MIN_LEN = 1.1;
const MIX = 0.5;

/** 当前条的放大倍数（沿条自身方向，**允许压到邻居身上** —— 密度不能因此变松） */
const EMPH_SCALE = 1.45;
/**
 * 当前条里"还没唱到"的字的不透明度。
 *
 * ★ 为什么是 0.5 而不是 0.11：这是**歌词展示器**，观众永远在提前读下一句。
 *   0.11 的凹痕在深底上只有约 1.5:1，等于把"还没唱的字"藏起来 —— 好看但没法用。
 *   0.5 压在挡板上是 4.8:1，读得清；"落版"的表现力改由**抬起来**承担：
 *   没唱的字略低一点、暗一半，唱到就升起来变满、并晕开一圈墨。
 */
const GHOST_A = 0.5;
/** 横排正文相对 1em 的收身。1.0 = 实测多宽就画多宽（装箱模型与绘制严格一致）；
    条高 1.25em 就是它的行距。 */
const ROW_FONT = 1;

const IDLE_STOP_MS = 6000;
const PERF_FPS = 24;
const REPORT_MS = 400;
const WHEEL_HOLD_MS = 1200;
const LIFT_TAU = 150;

/** 间奏：拉远 + 缓慢漂移 */
const INTERLUDE_MS = 7000;
/** 进度一次跳这么多毫秒 ⇒ 认定是 seek（宿主推的 progress 只有 4Hz、位置量化 250ms） */
const SEEK_JUMP_MS = 1500;
const DRIFT_EM = 0.7;
const DRIFT_PERIOD = 9000;
/** 曲末：最后一句唱完这么久之后拉远看全貌 */
const FINALE_AFTER = 6000;
const FINALE_ZOOM = 0.92;

/** 竖排条的离屏位图缓存条目上限（超出整批丢掉，不做 LRU —— 一次重排就全失效） */
const VCACHE_MAX = 140;
/** 航线最多往前后各画多少段（不设上限的话长歌会每帧遍历几百段） */
const ROUTE_BACK = 26;
const ROUTE_FWD = 8;

const COLORS = { bg: "#0b0a08", fg: "#f2e9d8", accent: "#e0a63c" };

const SHELL = `
  <canvas class="at__cv at__cv--wall" aria-hidden="true"></canvas>
  <canvas class="at__cv at__cv--live" aria-hidden="true"></canvas>
  <div class="at__hud" aria-hidden="true">
    <div class="at__hud-top">
      <span class="at__count"></span>
      <span class="at__hint"></span>
    </div>
    <div class="at__hud-bottom">
      <span class="at__title"></span>
      <span class="at__density"></span>
      <span class="at__tc"></span>
    </div>
  </div>
  <div class="at__empty" aria-live="polite"></div>
  <div class="at__poster">
    <div class="at__poster-title"></div>
    <div class="at__poster-sub"></div>
  </div>`;

const BG_SHELL = `<div class="at-bg"></div>`;

/** @type {object|null} 运行期状态（换样式 = 先 destroy 再 mount，所以是单例） */
let S = null;

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */

const nowMs = () =>
  typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function safe(fn, dflt) {
  try {
    const v = fn();
    return v == null ? dflt : v;
  } catch {
    return dflt;
  }
}

/** 只在变化时写 dataset（每帧无脑写会不停弄脏属性选择器的匹配缓存） */
function setAttr(el, name, value) {
  const v = String(value);
  if (el.dataset[name] !== v) el.dataset[name] = v;
}

function hexToRgb(hex, fb) {
  const s = /^#([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  const src = s ? s[1] : String(fb || "#000000").slice(1);
  const n = parseInt(src, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const rgba = (c, a) => `rgba(${c.r},${c.g},${c.b},${a})`;

function mixRgb(a, b, t) {
  const k = clamp(t, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

/** sRGB 相对亮度（对比度自检用；WCAG 口径） */
export function relLuminance(c) {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** WCAG 对比度（1..21） */
export function contrastRatio(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** 指数趋近；`snap` 为真时一步到位（关动效档） */
function easeTo(from, to, dtMs, tau, snap) {
  if (snap) return to;
  const t = Math.max(0, dtMs || 0);
  const next = to + (from - to) * Math.exp(-t / Math.max(1, tau));
  return Math.abs(next - to) < 1e-4 ? to : next;
}

const mmss = (ms) => {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

function roundRectPath(g, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  g.beginPath();
  g.moveTo(x + rad, y);
  g.lineTo(x + w - rad, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rad);
  g.lineTo(x + w, y + h - rad);
  g.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  g.lineTo(x + rad, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rad);
  g.lineTo(x, y + rad);
  g.quadraticCurveTo(x, y, x + rad, y);
  g.closePath();
}

/* --------------------------------------------------------------------------
   骨架
   -------------------------------------------------------------------------- */

function createState(ctx) {
  return {
    ctx,
    alive: true,
    el: null,
    bgEl: null,
    cvWall: null,
    cvLive: null,
    c2w: null,
    c2l: null,
    elCount: null,
    elHint: null,
    elTitle: null,
    elDensity: null,
    elTc: null,
    elEmpty: null,
    elPosterT: null,
    elPosterS: null,

    dpr: 1,
    w: 1,
    h: 1,
    view: null,
    cam: camera.createCamera(),
    target: null,
    roll: 0,
    lift: 0,
    s: 20,
    focus: { x: 0, y: 0 },
    viewport: { x0: 0, y0: 0, x1: 0, y1: 0 },
    prevK: 1,
    kStable: true,

    clock: timing.createClock({ maxExtrapolateMs: 1200 }),
    duration: 0,

    lines: [],
    texts: [],
    world: null,
    rects: [],
    ghost: null,
    worldKey: "",

    lineIndex: -2,
    lineOffsets: null,
    lineTiming: null,
    lineStamp: 0,

    vcache: new Map(),
    mcache: new Map(),
    offsets: new Map(),
    measureCv: null,
    measure: null,
    split: null,

    colors: { ...COLORS },
    colorsRgb: { bg: hexToRgb(COLORS.bg), fg: hexToRgb(COLORS.fg), accent: hexToRgb(COLORS.accent) },

    mode: "",
    emptyText: "",
    status: "",

    showLyrics: true,
    interactive: true,
    animations: true,
    reducedMotion: false,
    performance: false,
    budgetFps: 30,
    fontPx: 20,
    foreground: true,
    themeMode: "dark",

    idle: false,
    raf: 0,
    draws: 0,
    lastWall: 0,
    lastTick: 0,
    lastActive: 0,
    wallKey: "",
    liveKey: "",
    drew: 0,
    culled: 0,

    hover: -1,
    manualY: 0,
    wheelUntil: 0,
    pendingCut: true,

    finale: false,
    interlude: false,
    bass: 0,
    title: null,
    artist: null,

    lastFont: "",
    backdropTimer: 0,
    backdropPending: null,
    fontsHooked: false,
    detach: [],
  };
}

function build(st) {
  const root = st.ctx.root;
  if (!root) return;
  st.el = document.createElement("div");
  st.el.className = "at";
  st.el.innerHTML = SHELL;
  root.appendChild(st.el);

  const q = (sel) => st.el.querySelector(sel);
  st.cvWall = q(".at__cv--wall");
  st.cvLive = q(".at__cv--live");
  st.c2w = st.cvWall.getContext("2d");
  st.c2l = st.cvLive.getContext("2d");
  st.elCount = q(".at__count");
  st.elHint = q(".at__hint");
  st.elTitle = q(".at__title");
  st.elDensity = q(".at__density");
  st.elTc = q(".at__tc");
  st.elEmpty = q(".at__empty");
  st.elPosterT = q(".at__poster-title");
  st.elPosterS = q(".at__poster-sub");

  if (st.ctx.backgroundRoot) {
    st.ctx.backgroundRoot.innerHTML = BG_SHELL;
    st.bgEl = st.ctx.backgroundRoot.querySelector(".at-bg");
  }

  /* 量字用的离屏画布：只用来 measureText，永远不上屏 */
  st.measureCv = document.createElement("canvas");
  const mk = st.measureCv.getContext("2d");
  mk.font = `${REF_PX}px ${PLATE_FONT}`;
  st.measure = (text) => {
    const s = String(text ?? "");
    if (!s) return 0;
    let v = st.mcache.get(s);
    if (v == null) {
      v = mk.measureText(s).width / REF_PX;
      if (st.mcache.size > 8000) st.mcache.clear();
      st.mcache.set(s, v);
    }
    return v;
  };
  const sdk = st.ctx.sdk || {};
  st.split =
    typeof sdk.splitGraphemes === "function"
      ? (s) => sdk.splitGraphemes(s)
      : (s) => Array.from(s);

  /* 字体晚到会让 measureText 变一次 —— 重排一次就好，别每帧都量 */
  if (!st.fontsHooked && document.fonts && document.fonts.ready) {
    st.fontsHooked = true;
    document.fonts.ready
      .then(() => {
        if (!st.alive) return;
        st.mcache.clear();
        st.worldKey = "";
        refresh(st, { world: true, cut: true });
      })
      .catch(() => {});
  }

  /* 配色：清单里的 colors 是静态兜底；封面专色由 reportBackdrop 动态上报 */
  const declared = safe(() => st.ctx.sdk?.manifest?.colors, null) || {};
  st.colors = {
    bg: /^#[0-9a-f]{6}$/i.test(declared.bg || "") ? declared.bg : COLORS.bg,
    fg: /^#[0-9a-f]{6}$/i.test(declared.fg || "") ? declared.fg : COLORS.fg,
    accent: /^#[0-9a-f]{6}$/i.test(declared.accent || "") ? declared.accent : COLORS.accent,
  };
  st.colorsRgb = {
    bg: hexToRgb(st.colors.bg, COLORS.bg),
    fg: hexToRgb(st.colors.fg, COLORS.fg),
    accent: hexToRgb(st.colors.accent, COLORS.accent),
  };
  applyColors(st);

  bindEvents(st);
  applyEnv(st);
  refresh(st, { world: true, cut: true });
  scheduleBackdrop(st);
}

function applyColors(st) {
  if (!st.el) return;
  const { bg, fg, accent } = st.colorsRgb;
  const set = (k, v) => {
    if (st.el.style.getPropertyValue(k) === v) return;
    st.el.style.setProperty(k, v);
  };
  set("--at-bg", st.colors.bg);
  set("--at-fg", st.colors.fg);
  set("--at-accent", st.colors.accent);
  set("--at-fg-04", rgba(fg, 0.04));
  set("--at-fg-55", rgba(fg, 0.55));
  set("--at-fg-82", rgba(fg, 0.82));
  set("--at-vig", rgba({ r: 0, g: 0, b: 0 }, 0.72));
  set("--at-scrim", rgba(bg, 0.8));
  set("--at-chip", rgba(bg, 0.72));
  set("--at-fg-72", rgba(fg, 0.72));
  set("--at-plate", rgba(bg, 0.88));
  set("--at-plate-edge", rgba(accent, 0.3));
  if (st.bgEl) st.bgEl.style.background = st.colors.bg;
  void accent;
}

/* --------------------------------------------------------------------------
   环境 / 设置
   -------------------------------------------------------------------------- */

function applyEnv(st) {
  const env = safe(() => st.ctx.env(), {}) || {};
  const opt = safe(() => st.ctx.options(), {}) || {};

  st.dpr = clamp(Number(env.dpr) || (typeof devicePixelRatio === "number" ? devicePixelRatio : 1), 1, 2);
  st.reducedMotion = Boolean(env.reducedMotion);
  st.themeMode = env.mode === "light" ? "light" : "dark";
  st.foreground = env.foreground !== false;

  st.showLyrics = opt.showLyrics !== false;
  st.animations = opt.animations !== false && !st.reducedMotion;
  st.interactive = opt.interactive !== false;
  /* ★ performanceMode 是**字符串** `"smooth" | "performance"`（见契约 SkinOptions）。
     写成 Boolean(opt.performanceMode) 会把 "smooth" 也判成性能档 —— 真机上表现为
     逐字落版与墨点全没了、退回连续填充扫描（浏览器自检当时喂的是布尔值，没抓住）。 */
  st.performance = opt.performanceMode === "performance" || opt.performanceMode === true;
  st.budgetFps = clamp(Number(opt.budgetFps) || 30, 1, 60);
  /* ★ 用户设置的字号就是"1em 等于几像素"—— 只喂给摄像机/绘制，绝不进世界坐标 */
  const fs = Number(opt.lyricsFontSize);
  st.fontPx = clamp(Number.isFinite(fs) && fs > 0 ? fs : 20, 10, 96);

  setAttr(st.el, "anim", st.animations ? "1" : "0");
  setAttr(st.el, "perf", st.performance ? "1" : "0");
  setAttr(st.el, "mix", MIX);
  setAttr(st.el, "interactive", st.interactive ? "1" : "0");
  if (st.elHint) {
    st.elHint.textContent = st.interactive ? "点任意一根条跳转 · 滚轮预览 · 曲末拉远" : "";
  }
}

function readInset(st, name) {
  const v = safe(() => getComputedStyle(st.el).getPropertyValue(name), "") || "";
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function resize(st) {
  const host = st.el || st.ctx.root;
  const w = Math.max(1, Math.round(host.clientWidth || st.ctx.root?.clientWidth || 0));
  const h = Math.max(1, Math.round(host.clientHeight || st.ctx.root?.clientHeight || 0));
  const top = readInset(st, "--skin-inset-top");
  const bottom = readInset(st, "--skin-inset-bottom");
  /* ★ 每个补丁都会走 refresh→resize：尺寸没变就**必须原样返回**，
     否则 vcache 与两层画布的签名会被 4Hz 的进度补丁反复作废（每帧重排整盘）。 */
  const sig = `${w}|${h}|${st.dpr}|${st.fontPx}|${top}|${bottom}`;
  if (sig === st._rsig) return;
  st._rsig = sig;

  st.w = w;
  st.h = h;

  for (const cv of [st.cvWall, st.cvLive]) {
    if (!cv) continue;
    const pw = Math.max(1, Math.round(w * st.dpr));
    const ph = Math.max(1, Math.round(h * st.dpr));
    if (cv.width !== pw) cv.width = pw;
    if (cv.height !== ph) cv.height = ph;
  }

  /* 安全区：给人读的东西一律让开宿主壳的两条带子（兜底只能是 0px） */
  const region = Math.max(60, h - top - bottom);
  st.view = camera.makeView({ left: 0, top, w, h: region, emPx: st.fontPx });

  setAttr(st.el, "narrow", w < 620 ? "1" : "0");
  st.vcache.clear();
  st.wallKey = "";
  st.liveKey = "";
}

/* --------------------------------------------------------------------------
   数据同步
   -------------------------------------------------------------------------- */

function refresh(st, opts = {}) {
  if (!st.alive) return;
  if (opts.env !== false) applyEnv(st);
  if (opts.resize !== false) resize(st);

  const media = safe(() => st.ctx.media(), null) || {};
  const song = media.song || safe(() => st.ctx.track(), null) || {};
  const title = String(song.title || "");
  const artist = String(song.artist || "");
  if (title !== st.title || artist !== st.artist) {
    st.title = title;
    st.artist = artist;
    if (st.elTitle) st.elTitle.textContent = title ? `${title}${artist ? ` — ${artist}` : ""}` : "";
    if (st.elPosterT) st.elPosterT.textContent = title || "未选择曲目";
    if (st.elPosterS) st.elPosterS.textContent = artist || "";
  }

  const pb = safe(() => st.ctx.playback(), null) || {};
  if (Number.isFinite(Number(pb.position)) || typeof pb.playing === "boolean") {
    st.clock.set(Number(pb.position) || 0, pb.playing !== false, nowMs());
  }
  st.duration = Number(pb.duration) || st.duration || 0;

  syncWorld(st, opts.world === true);
  syncMode(st);
  syncHud(st);

  const cover = media.cover || safe(() => st.ctx.covers?.().current, "") || st.ctx.defaultCover || "";
  sampleAccent(st, cover);

  if (opts.cut) st.pendingCut = true;
  paintOnce(st);
  wake(st);
}

function syncWorld(st, force) {
  const lyr = safe(() => st.ctx.lyrics(), null) || {};
  const lines = Array.isArray(lyr.lines) ? lyr.lines : [];
  st.status = String(lyr.status || "");
  let chars = 0;
  for (const ln of lines) chars += String(ln?.text ?? "").length;
  const key = `${lines.length}|${chars}|${lines[0]?.time ?? -1}|${lines[lines.length - 1]?.time ?? -1}`;
  if (!force && key === st.worldKey && st.world) return;

  st.worldKey = key;
  st.lines = lines;
  st.texts = lines.map((ln) => ({
    main: String(ln?.text ?? "") || "·",
  }));

  if (!lines.length) {
    st.world = null;
    st.rects = [];
    st.lineIndex = -2;
    st.lineOffsets = null;
    st.lineTiming = null;
    st.vcache.clear();
    st.offsets.clear();
    return;
  }

  const built = pack.buildBars(lines, {
    measure: st.measure,
    split: st.split,
    gutter: GUTTER,
    minLen: MIN_LEN,
  });
  const packed = pack.packStrip(built.bars, { width: built.width, gutter: GUTTER, mix: MIX });
  st.world = { ...packed, bars: built.bars, maxLen: built.maxLen, thickness: built.thickness };
  st.rects = packed.rects;
  st.lineIndex = -2;
  st.lineOffsets = null;
  st.lineTiming = null;
  st.vcache.clear();
  st.offsets.clear();

  setAttr(st.el, "bars", st.rects.length);
  setAttr(st.el, "cols", packed.W.toFixed(2));
  setAttr(st.el, "h", packed.H.toFixed(2));
  setAttr(st.el, "density", packed.density.toFixed(3));
  if (st.elDensity) {
    st.elDensity.textContent = `密度 ${packed.density.toFixed(3)} · ${st.rects.length} 根`;
  }
}

function syncMode(st) {
  let mode;
  if (!st.lines.length) mode = "empty";
  else if (!st.showLyrics) mode = "poster";
  else mode = "plate";
  if (mode === st.mode && mode !== "empty") return;
  st.mode = mode;
  setAttr(st.el, "empty", mode === "empty" ? "1" : "0");
  setAttr(st.el, "poster", mode === "poster" ? "1" : "0");

  if (mode === "empty") {
    const lyr = safe(() => st.ctx.lyrics(), null) || {};
    let text = "";
    try {
      text = st.ctx.sdk?.html?.lyricsEmptyText?.(lyr) || "";
    } catch {
      text = "";
    }
    if (!text) text = st.title ? "这首歌还没有歌词" : "选一首歌，开始铺字";
    if (text !== st.emptyText) {
      st.emptyText = text;
      if (st.elEmpty) st.elEmpty.textContent = text;
    }
    setAttr(st.el, "bars", 0);
    if (st.elDensity) st.elDensity.textContent = "";
  }
  st.wallKey = "";
  st.liveKey = "";
}

function syncHud(st) {
  if (!st.elTc) return;
  const tc = st.duration > 0 ? `${mmss(st.clock.peek())} / ${mmss(st.duration)}` : mmss(st.clock.peek());
  if (tc !== st._tc) {
    st._tc = tc;
    st.elTc.textContent = tc;
  }
  if (st.elCount) {
    const total = st.lines.length;
    const idx = st.lineIndex >= 0 ? st.lineIndex + 1 : 0;
    const txt = total ? `§ ${String(idx).padStart(2, "0")} / ${total}` : "";
    if (txt !== st._count) {
      st._count = txt;
      st.elCount.textContent = txt;
    }
  }
}

/* --------------------------------------------------------------------------
   当前行：字素偏移 + 时间轴
   -------------------------------------------------------------------------- */

function ensureLine(st, index) {
  if (index === st.lineIndex) return;
  st.lineIndex = index;
  st.lineStamp += 1;
  if (index < 0 || !st.lines[index]) {
    st.lineOffsets = null;
    st.lineTiming = null;
    return;
  }
  const text = String(st.lines[index].text ?? "");
  const off = pack.measureOffsets(text, st.measure, st.split);
  /* 空行/纯空白行没有字素：给一个占位字素，好让"落版"仍然发生 */
  if (!off.chars.length) {
    off.chars = ["·"];
    off.xs = [0];
    off.cum = [0, st.measure("·")];
    off.w = off.cum[1];
    off.vlen = Math.max(pack.MIN_GLYPH_ADV, st.measure("·"));
  }
  st.lineOffsets = off;
  st.lineTiming = timing.timedLine(st.lines[index], st.lines[index + 1] || null, { chars: off.chars });
}

/* --------------------------------------------------------------------------
   摄像机
   -------------------------------------------------------------------------- */

function stepView(st, wall, dt, index) {
  const view = st.view;
  const rect = index >= 0 ? st.rects[index] : null;
  let target;
  if (st.finale && st.world) {
    target = camera.wholeWorldTarget(st.world.W, st.world.H, view);
  } else if (rect && st.world) {
    target = camera.cameraTarget(pack.tightRect(rect, GUTTER), view, {
      worldW: st.world.W,
      worldH: st.world.H,
      lift: st.lift,
    });
    if (st.interlude) {
      const phase = ((wall % DRIFT_PERIOD) / DRIFT_PERIOD) * Math.PI * 2;
      target.cy += Math.sin(phase) * DRIFT_EM;
      target.k *= FINALE_ZOOM;
    }
  } else if (st.world) {
    const k = camera.framingScale(st.world.W, st.world.H, view) * FINALE_ZOOM;
    target = {
      cx: st.world.W / 2,
      cy: Math.min(st.world.H / 2, (view.h * 0.42) / Math.max(4, view.emPx * k)),
      k,
    };
  } else {
    const ghost = ghostWorld(st);
    target = camera.wholeWorldTarget(ghost.W, ghost.H, view);
  }
  target.cy += st.manualY;
  if (st.world) target.cy = clamp(target.cy, -2, st.world.H + 2);
  st.target = target;

  const snap = !st.animations;
  const mode = camera.planMove(st.cam, target, view);
  const cut = st.pendingCut || snap || mode === "cut";
  st.pendingCut = false;

  const res = camera.stepCamera(st.cam, target, snap ? dt : dt, {
    cut,
    tau: camera.EASE_TAU,
    tauK: camera.EASE_TAU_K,
  });
  st.roll = st.animations && !st.performance ? res.roll : 0;

  st.kStable = Math.abs(st.cam.k - st.prevK) < 0.004;
  st.prevK = st.cam.k;
  st.s = view.emPx * st.cam.k;
  st.focus = camera.viewFocus(view);
  st.viewport = camera.viewportWorldRect(st.cam, view);
  return res.moved;
}

/* --------------------------------------------------------------------------
   帧循环
   -------------------------------------------------------------------------- */

function frameBudgetMs(st) {
  const fps = st.performance ? Math.min(st.budgetFps, PERF_FPS) : st.budgetFps;
  return 1000 / clamp(fps, 1, 60);
}

function wake(st) {
  if (!st.alive) return;
  st.idle = false;
  setAttr(st.el, "idle", "0");
  st.lastActive = nowMs();
  if (!st.animations) {
    /* 关动效：不起帧（补丁来了画一张静态图），并且要**掐掉已经在跑的那条链** */
    haltFrames(st);
    return;
  }
  if (!st.raf) st.raf = requestAnimationFrame(() => tick(st));
}

/** 掐掉帧链但**不**标记 idle（关动效时用：画面静态，但不是"暂停空转"） */
function haltFrames(st) {
  if (st.raf) cancelAnimationFrame(st.raf);
  st.raf = 0;
}

function stopFrames(st) {
  if (st.raf) cancelAnimationFrame(st.raf);
  st.raf = 0;
  st.idle = true;
  setAttr(st.el, "idle", "1");
}

function tick(st) {
  st.raf = 0;
  if (!st.alive) return;
  const wall = nowMs();
  if (!st.foreground) {
    stopFrames(st);
    return;
  }
  if (!st.clock.playing && wall - st.lastActive > IDLE_STOP_MS) {
    /* 暂停 6s 后彻底停帧：静止的画面不需要任何人去画它 */
    paintOnce(st);
    stopFrames(st);
    return;
  }
  const budget = frameBudgetMs(st);
  if (wall - st.lastTick < budget - 1.5) {
    st.raf = requestAnimationFrame(() => tick(st));
    return;
  }
  const dt = Math.min(64, Math.max(1, wall - st.lastTick));
  st.lastTick = wall;
  render(st, wall, dt);
  st.raf = requestAnimationFrame(() => tick(st));
}

/** 静态画一帧（不起帧）：关动效档与空闲停帧都用它 */
function paintOnce(st) {
  if (!st.alive || !st.view) return;
  const wall = nowMs();
  const dt = Math.max(1, wall - (st.lastTick || wall - 16));
  st.lastTick = wall;
  render(st, wall, dt);
}

/* --------------------------------------------------------------------------
   渲染
   -------------------------------------------------------------------------- */

function render(st, wall, dt) {
  const now = st.clock.at(wall);

  /* 频谱：只读参数（辉光/薄雾），绝不参与几何。
     ★ 契约给的是**快照对象** `{ bands: Float32Array(128), at }`，不是数组 ——
       写成 `sp.length` 会永远读到 undefined，频谱就静默变成 0（真机自检抓到的）。 */
  let bass = 0;
  if (st.clock.playing) {
    const snap = safe(() => st.ctx.spectrum?.(), null);
    const bands = snap?.bands || snap;
    if (bands && bands.length) {
      let sum = 0;
      const n = Math.min(14, bands.length);
      for (let i = 0; i < n; i += 1) sum += Number(bands[i]) || 0;
      bass = clamp(sum / n, 0, 1);
    }
  }
  st.bass = easeTo(st.bass, bass, dt, 180, !st.animations);

  let index = timing.lineIndexAt(st.lines, now);
  st.finale = st.animations && timing.isFinale(st.lines, now, FINALE_AFTER);
  st.interlude =
    !st.finale && st.clock.playing && timing.isInterlude(st.lines, index, INTERLUDE_MS);

  st.lift = easeTo(st.lift, index >= 0 && !st.finale ? 1 : 0, dt, LIFT_TAU, !st.animations);
  if (st.manualY && wall > st.wheelUntil) st.manualY = easeTo(st.manualY, 0, dt, 260, true);

  stepView(st, wall, dt, index);

  const changed = index !== st.lineIndex;
  ensureLine(st, index);
  if (changed) st.liveKey = "";
  st._lit = st.lineTiming ? timing.litCount(st.lineTiming.starts, now) : 0;
  setAttr(st.el, "lit", st._lit);
  setAttr(st.el, "glyphs", st.lineOffsets ? st.lineOffsets.chars.length : 0);
  /* 频谱的唯一可观测出口：它只喂绘制参数（辉光/薄雾），所以只报一个低频读数 ——
     真机自检靠它证明"真频谱真的进来了"，同时又没有任何几何读数跟着它变。 */
  setAttr(st.el, "bass", Math.round(st.bass * 100));

  const wk = wallKey(st, index, now);
  let painted = 0;
  if (wk !== st.wallKey) {
    drawWall(st, index, now);
    st.wallKey = wk;
    painted += 1;
  }
  const lk = liveKey(st, index);
  if (lk !== st.liveKey) {
    drawLive(st, index, now);
    st.liveKey = lk;
    painted += 1;
  }
  st.draws += painted;

  setAttr(st.el, "line", index);
  setAttr(st.el, "finale", st.finale ? "1" : "0");
  setAttr(st.el, "playing", st.clock.playing ? "1" : "0");
  syncHud(st);
}

function wallKey(st, index, now) {
  if (st.mode === "empty") {
    return `e|${st.w}|${st.h}|${st.dpr}`;
  }
  if (st.mode === "poster") return `p|${st.w}|${st.h}`;
  const sweep = st.finale ? Math.round(now / 250) : 0;
  return [
    st.w,
    st.h,
    st.dpr,
    index,
    st.finale ? 1 : 0,
    sweep,
    Math.round(st.bass * 24),
    st.cam.cx.toFixed(2),
    st.cam.cy.toFixed(2),
    st.cam.k.toFixed(3),
    Math.round(st.roll * 20),
    st.hover,
  ].join("|");
}

function liveKey(st, index) {
  if (st.mode !== "plate" || index < 0) return `n|${st.mode}`;
  const q = glyphReveal(st) ? 16 : 1;
  return [
    index,
    st.lineStamp,
    st._lit || 0,
    q,
    Math.round(st.lift * 40),
    Math.round(st.bass * 24),
    st.cam.cx.toFixed(2),
    st.cam.cy.toFixed(2),
    st.cam.k.toFixed(3),
    Math.round(st.roll * 20),
    st.finale ? 1 : 0,
    st.performance ? 1 : 0,
  ].join("|");
}

/** 逐字落版是否需要动画（空档/关动效/性能档都不走） */
function glyphReveal(st) {
  return st.animations && !st.performance;
}

function applyRoll(c2, st) {
  if (!st.roll) return;
  const f = st.focus;
  c2.translate(f.x, f.y);
  c2.rotate((st.roll * Math.PI) / 180);
  c2.translate(-f.x, -f.y);
}

/**
 * 各根条的明暗。**下限 0.62** 是有原因的（不只是好看）：
 *   · 观众永远在提前读下一句 ⇒ 太暗就等于把歌词藏起来；
 *   · 真机自检按"亮像素（α ≥ 0.6）不许减少"判断"画布还在跟着歌画"，
 *     如果远处的句子压在 0.3~0.4，换行时这个计数会因为"谁的条更长"而抖。
 * 过去/将来靠**色相**区分（唱过的偏强调色一点），不靠明暗。
 */
function barAlpha(st, i, index) {
  if (st.finale) return 0.86;
  if (index < 0) return 0.62;
  if (i < index) return i >= index - 2 ? 0.74 : 0.66;
  const d = i - index;
  if (d === 1) return 0.7;
  if (d === 2) return 0.65;
  return 0.62;
}

function drawWall(st, index, now) {
  const c2 = st.c2w;
  if (!c2) return;
  c2.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  c2.clearRect(0, 0, st.w, st.h);

  /* 这一层是**纸**：先整块铺底色（不透明）。
     好处有三：① 盘面之外的地方也是"纸"，不会露出宿主别的层；
     ② 纸上贴的装饰（CSS 的纸纹/暗角）可以放心压在画布**上面**；
     ③ 真机自检按"亮像素不许减少"判断"画布还在跟着歌画"时，
        不透明的底让这个计数只反映"字还在"，而不是"镜头刚好扫到多少字"。 */
  c2.fillStyle = st.colors.bg;
  c2.fillRect(0, 0, st.w, st.h);

  if (st.mode === "poster") {
    st.drew = 0;
    st.culled = 0;
    setAttr(st.el, "drew", 0);
    setAttr(st.el, "culled", 0);
    return;
  }
  if (st.mode === "empty") {
    drawGhostLattice(st, c2);
    st.drew = 0;
    setAttr(st.el, "drew", 0);
    setAttr(st.el, "culled", 0);
    return;
  }

  c2.save();
  applyRoll(c2, st);
  c2.textBaseline = "middle";
  c2.textAlign = "left";
  c2.lineCap = "round";

  drawTray(st, c2);
  drawRoute(st, c2, index, now);

  const world = st.world;
  if (!world) {
    c2.restore();
    return;
  }
  const fg = st.colorsRgb.fg;
  const accent = st.colorsRgb.accent;
  const haze = 1 + (st.bass - 0.5) * 0.08;
  let drew = 0;
  let culled = 0;

  for (let i = 0; i < st.rects.length; i += 1) {
    if (i === index) continue;
    const r = st.rects[i];
    if (!r) continue;
    if (!pack.intersects(r, st.viewport)) {
      culled += 1;
      continue;
    }
    const bar = world.bars[i];
    if (!bar) continue;
    const alpha = clamp(barAlpha(st, i, index) * haze, 0, 1);
    const near = index >= 0 && Math.abs(i - index) <= 1;
    const tint = mixRgb(fg, accent, i < index ? 0.16 : near ? 0.1 : 0);
    const t = pack.tightRect(r, GUTTER);
    if (r.dir === 0) drawRowBar(st, c2, bar, t, 1, alpha, tint);
    else drawColBar(st, c2, i, bar, t, 1, alpha, tint);
    drew += 1;
  }

  /* 预热：下一两句给一点余光，让"切镜"看起来是被预告过的 */
  if (index >= 0 && !st.finale && st.animations) {
    for (const d of [1, 2]) {
      const r = st.rects[index + d];
      if (!r || !pack.intersects(r, st.viewport)) continue;
      const t = pack.tightRect(r, GUTTER);
      glowRect(st, c2, t, rgba(accent, d === 1 ? 0.07 : 0.04));
    }
  }

  c2.restore();
  st.drew = drew;
  st.culled = culled;
  setAttr(st.el, "drew", drew);
  setAttr(st.el, "culled", culled);
}

/* --- 字盘本体：整块条带的淡淡底与一圈边 ---
   没有它，装箱留下的空白会被看成"没画完"；有了它，空白就成了**盘面之外**。
   一整块矩形，两层 fill/stroke，比画任何装饰都便宜。 */
function drawTray(st, c2) {
  const world = st.world;
  if (!world) return;
  const s = st.s;
  const x = st.focus.x + (0 - st.cam.cx) * s;
  const y = st.focus.y + (0 - st.cam.cy) * s;
  const w = world.W * s;
  const h = world.H * s;
  const fg = st.colorsRgb.fg;
  c2.fillStyle = rgba(fg, 0.017);
  c2.fillRect(x, y, w, h);
  c2.lineWidth = 1;
  c2.strokeStyle = rgba(fg, 0.085);
  c2.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/* --- 航线：装箱把时间顺序打散了，这条折线是观众唯一能看见"歌怎么走"的地方 --- */
function drawRoute(st, c2, index, now) {
  const world = st.world;
  if (!world || !st.rects.length) return;
  const route = world.route;
  const n = route.length;
  const accent = st.colorsRgb.accent;
  const s = st.s;
  const fx = st.focus.x;
  const fy = st.focus.y;
  const cx = st.cam.cx;
  const cy = st.cam.cy;
  const vp = st.viewport;

  let from = 0;
  let to = n - 1;
  if (!st.finale && index >= 0) {
    from = Math.max(0, index - ROUTE_BACK);
    to = Math.min(n - 1, index + ROUTE_FWD);
  }
  let sweep = -1;
  if (st.finale) {
    const t0 = Number(st.lines[0]?.time) || 0;
    const t1 = Number(st.lines[n - 1]?.time) || t0 + 1;
    const p = clamp((st.clock.at(now) - t0) / Math.max(1, t1 - t0), 0, 1);
    sweep = Math.floor(p * (n - 1));
  }

  c2.lineWidth = Math.max(1, s * 0.05);
  for (let i = from; i < to; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    if (!a || !b) continue;
    if (
      Math.max(a.x, b.x) < vp.x0 ||
      Math.min(a.x, b.x) > vp.x1 ||
      Math.max(a.y, b.y) < vp.y0 ||
      Math.min(a.y, b.y) > vp.y1
    ) {
      continue;
    }
    let alpha = st.finale
      ? Math.abs(i - sweep) <= 1
        ? 0.5
        : 0.14
      : camera.routeAlpha(i, index);
    if (alpha <= 0.02) continue;
    c2.strokeStyle = rgba(accent, alpha);
    c2.beginPath();
    c2.moveTo(fx + (a.x - cx) * s, fy + (a.y - cy) * s);
    c2.lineTo(fx + (b.x - cx) * s, fy + (b.y - cy) * s);
    c2.stroke();
  }
}

/* --- 横排条：整串一次 fillText（有译文就分两行） --- */
function drawRowBar(st, c2, bar, t, scale, alpha, rgb) {
  const s = st.s * scale;
  const x = st.focus.x + (t.x - st.cam.cx) * s;
  const y = st.focus.y + (t.y - st.cam.cy) * s;
  const trans = bar.trans && bar.thick > 1.25 + 1e-6;
  const mainBand = trans ? 1.25 : t.h;
  const fontPx = Math.max(6, mainBand * ROW_FONT * s);
  c2.fillStyle = rgba(rgb, alpha);
  c2.font = `${fontPx}px ${PLATE_FONT}`;
  c2.fillText(bar.text, x, y + (mainBand * s) / 2);
  if (trans && bar.trans) {
    c2.fillStyle = rgba(rgb, alpha * 0.62);
    c2.font = `${Math.max(5, 0.52 * s)}px ${PLATE_FONT}`;
    c2.fillText(bar.trans, x, y + (1.25 + 0.4) * s);
  }
}

/* --- 竖排条：字正立（中文），拉丁/数字整段旋转 90° --- */
function drawColBar(st, c2, i, bar, t, scale, alpha, rgb) {
  const px = st.s * scale;
  const useCache = st.kStable && !st.performance && scale === 1 && alpha > 0.02;
  if (useCache) {
    const bmp = vBitmap(st, i, bar, t, px);
    if (bmp) {
      const x = st.focus.x + (t.x - st.cam.cx) * px;
      const y = st.focus.y + (t.y - st.cam.cy) * px;
      const prev = c2.globalAlpha;
      c2.globalAlpha = alpha;
      c2.drawImage(bmp.cv, x, y, bmp.w, bmp.h);
      c2.globalAlpha = prev;
      return;
    }
  }
  paintColumn(st, c2, bar, t, px, {
    alpha,
    rgb,
    x: st.focus.x + (t.x - st.cam.cx) * px,
    y: st.focus.y + (t.y - st.cam.cy) * px,
  });
}

/**
 * 竖排条的离屏位图：横竖交错的盘面上，竖条常常是"整根不动"的，
 * 而逐字 fillText 一根 12 字的竖条要 12~24 次调用。缓存后每帧只是一次 drawImage。
 * 缩放动起来（k 不稳）时不走缓存 —— 每帧重建几十张位图比直接画还贵。
 */
function vBitmap(st, i, bar, t, px) {
  const step = Math.max(0.25, Math.round(px * 4) / 4);
  const hit = st.vcache.get(i);
  if (hit && hit.px === step) return hit;
  const wPx = Math.max(1, Math.round(t.w * step));
  const hPx = Math.max(1, Math.round(t.h * step));
  if (wPx > 900 || hPx > 4000) return null;
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(wPx * st.dpr));
  cv.height = Math.max(1, Math.round(hPx * st.dpr));
  const g = cv.getContext("2d");
  g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  paintColumn(st, g, bar, { x: 0, y: 0, w: t.w, h: t.h }, step, {
    alpha: 1,
    rgb: { r: 255, g: 255, b: 255 },
    x: 0,
    y: 0,
  });
  const entry = { cv, px: step, w: wPx, h: hPx };
  if (st.vcache.size >= VCACHE_MAX) st.vcache.clear();
  st.vcache.set(i, entry);
  return entry;
}

/**
 * 画一根竖条（两遍：先全部凹痕，再点亮的部分 —— 中间不留缝）。
 * @param {object} o {alpha, rgb, x, y}
 */
function paintColumn(st, c2, bar, t, px, o) {
  let off = st.offsets.get(bar.i);
  if (!off) {
    off = pack.measureOffsets(bar.text, st.measure, st.split);
    st.offsets.set(bar.i, off);
  }
  const chars = off.chars.length ? off.chars : ["·"];
  const n = chars.length;
  const adv = (t.h / n) * px;
  const fontPx = Math.max(5, Math.min(ROW_FONT * px, adv));
  const cx = o.x + (t.w / 2) * px;
  c2.font = `${fontPx}px ${PLATE_FONT}`;
  c2.textAlign = "center";
  c2.textBaseline = "middle";
  c2.fillStyle = rgba(o.rgb, o.alpha);

  /* 拉丁/数字连段整段旋转 90°（中文竖排里它就该躺着） */
  const runs = narrowRuns(chars, st.measure);
  let k = 0;
  for (const run of runs) {
    const top = o.y + run.start * adv;
    const span = run.len * adv;
    if (run.rot) {
      const text = chars.slice(run.start, run.start + run.len).join("");
      const w = st.measure(text) * px;
      c2.save();
      c2.translate(cx - fontPx * 0.34, top);
      c2.rotate(Math.PI / 2);
      c2.textAlign = "left";
      c2.fillText(text, (span - w) / 2, 0);
      c2.restore();
      c2.textAlign = "center";
    } else {
      for (let j = 0; j < run.len; j += 1) {
        c2.fillText(chars[run.start + j], cx, top + adv * (j + 0.5));
      }
    }
    k += run.len;
  }
  void k;
}

/** 把字素切成"整段旋转"与"逐字正立"的连段 */
function narrowRuns(chars, measure) {
  const runs = [];
  let i = 0;
  while (i < chars.length) {
    const narrow = measure(chars[i]) < 0.85;
    let j = i + 1;
    if (narrow) while (j < chars.length && measure(chars[j]) < 0.85) j += 1;
    runs.push({ start: i, len: j - i, rot: narrow && j - i >= 2 });
    i = j;
  }
  return runs;
}

/* --- 当前条：挡板 + 凹痕 + 逐字落版 + 墨点晕开 --- */
function drawLive(st, index, now) {
  const c2 = st.c2l;
  if (!c2) return;
  c2.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  c2.clearRect(0, 0, st.w, st.h);
  if (st.mode !== "plate" || index < 0 || !st.world) return;
  const r = st.rects[index];
  if (!r) return;
  const bar = st.world.bars[index];
  if (!bar) return;
  const t = pack.tightRect(r, GUTTER);
  const scale = 1 + (EMPH_SCALE - 1) * st.lift;
  const gx = st.focus.x + (t.x + t.w / 2 - st.cam.cx) * st.s;
  const gy = st.focus.y + (t.y + t.h / 2 - st.cam.cy) * st.s;
  const bw = t.w * st.s * scale;
  const bh = t.h * st.s * scale;
  const accent = st.colorsRgb.accent;
  const fg = st.colorsRgb.fg;
  const pad = Math.max(6, st.s * 0.34);

  c2.save();
  applyRoll(c2, st);

  /* 悬停框（不是当前条时也画，命中反馈要即时） */
  if (st.interactive && st.hover >= 0) {
    const hr = st.rects[st.hover];
    if (hr && hr !== r) {
      const ht = pack.tightRect(hr, GUTTER);
      const hx = st.focus.x + (ht.x - st.cam.cx) * st.s;
      const hy = st.focus.y + (ht.y - st.cam.cy) * st.s;
      const hw = ht.w * st.s;
      const hh = ht.h * st.s;
      c2.lineWidth = 1;
      c2.strokeStyle = rgba(accent, 0.55);
      roundRectPath(c2, hx - 3, hy - 3, hw + 6, hh + 6, 3);
      c2.stroke();
    }
  }

  c2.translate(gx, gy);

  /* 墨光：频谱只调这里的不透明度（±8%），几何一个像素都不动 */
  const glowA = 0.1 * (1 + (st.bass - 0.5) * 0.16);
  if (glowA > 0.01) {
    const rad = Math.max(bw, bh) * 0.78;
    const grd = c2.createRadialGradient(0, 0, Math.min(bw, bh) * 0.2, 0, 0, rad);
    grd.addColorStop(0, rgba(accent, glowA));
    grd.addColorStop(1, rgba(accent, 0));
    c2.fillStyle = grd;
    c2.fillRect(-rad, -rad, rad * 2, rad * 2);
  }

  /* 挡板：把邻居的字压下去（也是 4.5:1 对比度的来源，自检按像素量） */
  const px0 = -bw / 2 - pad;
  const py0 = -bh / 2 - pad;
  const pw = bw + pad * 2;
  const ph = bh + pad * 2;
  c2.fillStyle = rgba(st.colorsRgb.bg, 0.94);
  roundRectPath(c2, px0, py0, pw, ph, Math.min(6, st.s * 0.22));
  c2.fill();
  c2.lineWidth = 1;
  c2.strokeStyle = rgba(accent, 0.32);
  roundRectPath(c2, px0 + 0.5, py0 + 0.5, pw - 1, ph - 1, Math.min(6, st.s * 0.22));
  c2.stroke();

  c2.save();
  c2.scale(scale, scale);
  if (st.performance || !glyphReveal(st)) {
    /* 性能档/关动效：整行一次画完（不做逐字），进度用裁切扫过 */
    const tl = st.lineTiming;
    const frac = tl && tl.span > 0 ? clamp((now - (st.lines[index]?.time || 0)) / Math.max(1, tl.span), 0, 1) : 1;
    const litFraction = st.animations && st.performance ? frac : 1;
    paintCurrentRow(st, c2, bar, t, fg, litFraction);
  } else {
    paintCurrentGlyphs(st, c2, bar, t, fg, accent, now);
  }
  c2.restore();
  c2.restore();
}

function paintCurrentRow(st, c2, bar, t, fg, frac) {
  /* 局部坐标 = 未放大的屏幕像素（em × st.s），外面那层 scale() 只负责"抬起" */
  const em = st.s;
  const x = (-t.w / 2) * em;
  const trans = bar.trans && bar.thick > 1.25 + 1e-6;
  const mainBand = trans ? 1.25 : t.h;
  const fontPx = Math.max(6, mainBand * ROW_FONT * em);
  const base = -t.h / 2;
  const y = (base + mainBand / 2) * em;
  c2.font = `${fontPx}px ${PLATE_FONT}`;
  c2.textAlign = "left";
  c2.textBaseline = "middle";
  c2.fillStyle = rgba(fg, GHOST_A * 1.6);
  c2.fillText(bar.text, x, y);
  if (frac > 0) {
    c2.save();
    const total = (st.measure(bar.text) || 1) * em;
    c2.beginPath();
    c2.rect(x, (base - 0.4) * em, total * frac + 1, (mainBand + 0.8) * em);
    c2.clip();
    c2.fillStyle = rgba(fg, 1);
    c2.fillText(bar.text, x, y);
    c2.restore();
  }
  if (trans) {
    c2.font = `${Math.max(5, 0.52 * em)}px ${PLATE_FONT}`;
    c2.fillStyle = rgba(fg, 0.7);
    c2.fillText(bar.trans, x, (base + 1.25 + 0.4) * em);
  }
}

/** 逐字落版：凹痕（8% 灰）→ 字逐个砸进纸面（位移 ≤0.06em）＋ 墨点晕开 */
function paintCurrentGlyphs(st, c2, bar, t, fg, accent, now) {
  const em = st.s;
  const off = st.lineOffsets || pack.measureOffsets(bar.text, st.measure, st.split);
  const chars = off.chars.length ? off.chars : ["·"];
  const tl = st.lineTiming || timing.timedLine(st.lines[st.lineIndex], null, { chars });
  const reveal = timing.revealProgress(tl.starts, now, { durMs: timing.REVEAL_MS, steps: 16 });
  const vertical = st.rects[st.lineIndex]?.dir === 1;
  const n = chars.length;
  const trans = bar.trans && bar.thick > 1.25 + 1e-6;
  const mainBand = trans ? 1.25 : t.h;
  const adv = vertical ? (t.h / n) * em : 0;
  const fontPx = vertical
    ? Math.max(6, Math.min(ROW_FONT * em, adv))
    : Math.max(6, mainBand * ROW_FONT * em);

  c2.font = `${fontPx}px ${PLATE_FONT}`;
  c2.textAlign = vertical ? "center" : "left";
  c2.textBaseline = "middle";

  const disp = fontPx * 0.06;
  /* 第一遍：还没唱到的字 —— 暗一半、**压低一点**（像陷在纸里的凹痕） */
  for (let k = 0; k < n; k += 1) {
    if ((reveal[k] || 0) >= 1) continue;
    const p = glyphPos(vertical, off, t, k, n, em);
    c2.fillStyle = rgba(fg, GHOST_A);
    c2.fillText(chars[k], p.x, p.y + disp * 0.5);
  }

  /* 第二遍：落版 —— 升起来、变满、晕开一圈墨 */
  for (let k = 0; k < n; k += 1) {
    const p = reveal[k] || 0;
    if (p <= 0) continue;
    const pos = glyphPos(vertical, off, t, k, n, em);
    const e = timing.easeOutCubic(p);
    c2.fillStyle = rgba(fg, GHOST_A + (1 - GHOST_A) * e);
    c2.fillText(chars[k], pos.x, pos.y + disp * 0.5 * (1 - e));
    if (p < 1) {
      const bloom = timing.inkBloom(p);
      if (bloom > 0.02) {
        const rad = fontPx * 0.62;
        const grd = c2.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, rad);
        grd.addColorStop(0, rgba(accent, 0.24 * bloom));
        grd.addColorStop(1, rgba(accent, 0));
        c2.fillStyle = grd;
        c2.fillRect(pos.x - rad, pos.y - rad, rad * 2, rad * 2);
      }
    }
  }
}

/** 局部坐标下的字素位置（横排：沿条向右铺；竖排：沿条向下铺） */
function glyphPos(vertical, off, t, k, n, em) {
  if (vertical) {
    const adv = (t.h / n) * em;
    return { x: 0, y: (-t.h / 2) * em + adv * (k + 0.5) };
  }
  return { x: (-t.w / 2) * em + (off.xs[k] ?? 0) * em, y: 0 };
}

/* --- 空态：还没歌词时先把"盘子"画出来（虚线格），比一片空白诚实 --- */
function ghostWorld(st) {
  if (st.ghost) return st.ghost;
  const bars = [];
  const n = 22;
  for (let i = 0; i < n; i += 1) {
    bars.push({
      i,
      text: "",
      trans: "",
      len: 2.4 + pack.hash01(i * 3 + 1) * 9,
      vlen: 2.2 + pack.hash01(i * 5 + 2) * 4.4,
      thick: 1.25,
    });
  }
  let maxLen = 0;
  for (const b of bars) maxLen = Math.max(maxLen, b.len);
  const W = 2 * (maxLen + GUTTER);
  st.ghost = pack.packStrip(bars, { width: W, gutter: GUTTER, mix: 0.35 });
  return st.ghost;
}

function drawGhostLattice(st, c2) {
  const g = ghostWorld(st);
  const view = st.view;
  const k = Math.max(0.02, Math.min((view.w * 0.86) / (g.W * view.emPx), (view.h * 0.8) / (g.H * view.emPx)));
  const s = view.emPx * k;
  const ox = view.left + (view.w - g.W * s) / 2;
  const oy = view.top + (view.h - g.H * s) / 2;
  const fg = st.colorsRgb.fg;
  c2.save();
  c2.setLineDash([Math.max(3, s * 0.16), Math.max(4, s * 0.22)]);
  c2.lineWidth = 1;
  c2.strokeStyle = rgba(fg, 0.16);
  for (const r of g.rects) {
    if (!r) continue;
    const t = pack.tightRect(r, GUTTER);
    roundRectPath(c2, ox + t.x * s, oy + t.y * s, Math.max(1, t.w * s), Math.max(1, t.h * s), 3);
    c2.stroke();
  }
  c2.restore();
}

function glowRect(st, c2, t, color) {
  const x = st.focus.x + (t.x - st.cam.cx) * st.s;
  const y = st.focus.y + (t.y - st.cam.cy) * st.s;
  c2.fillStyle = color;
  roundRectPath(c2, x - 2, y - 2, t.w * st.s + 4, t.h * st.s + 4, 4);
  c2.fill();
}

/* --------------------------------------------------------------------------
   交互（interactive:false 时**一个监听器都不挂**）
   -------------------------------------------------------------------------- */

function bindEvents(st) {
  if (!st.el) return;
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    st.detach.push(() => target.removeEventListener(type, fn, opts));
  };

  const local = (ev) => {
    const rect = st.el.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };
  const pick = (ev) => {
    if (!st.interactive || !st.view || !st.rects.length) return -1;
    const p = local(ev);
    const w = camera.screenToWorld(st.cam, st.view, p);
    return pack.hitTest(st.rects, w.x, w.y, 0.06);
  };

  on(st.el, "click", (ev) => {
    const i = pick(ev);
    if (i < 0) return;
    const line = st.lines[i];
    if (!line) return;
    st.pendingCut = true;
    st.wheelUntil = 0;
    st.manualY = 0;
    safe(() => st.ctx.actions?.seek?.(Number(line.time) || 0), 0);
    wake(st);
  });

  on(st.el, "pointermove", (ev) => {
    const i = pick(ev);
    if (i === st.hover) return;
    st.hover = i;
    setAttr(st.el, "over", i >= 0 ? "1" : "0");
    st.wallKey = "";
    st.liveKey = "";
    wake(st);
  });

  on(st.el, "pointerleave", () => {
    if (st.hover === -1) return;
    st.hover = -1;
    setAttr(st.el, "over", "0");
    st.wallKey = "";
    st.liveKey = "";
    wake(st);
  });

  on(
    st.el,
    "wheel",
    (ev) => {
      if (!st.interactive) return;
      ev.preventDefault();
      const step = (Number(ev.deltaY) || 0) / 260;
      st.manualY = clamp(st.manualY + step * 2.4, -6, 6 + (st.world ? st.world.H * 0.5 : 0));
      st.wheelUntil = nowMs() + WHEEL_HOLD_MS;
      st.wallKey = "";
      wake(st);
    },
    { passive: false }
  );
}

/* --------------------------------------------------------------------------
   封面专色 → reportBackdrop（宿主壳观感的唯一合法通道，且必须防抖）
   -------------------------------------------------------------------------- */

function sampleAccent(st, url) {
  if (!url || url === st._cover) return;
  st._cover = url;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    if (!st.alive) return;
    try {
      const N = 12;
      const cv = document.createElement("canvas");
      cv.width = N;
      cv.height = N;
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, N, N);
      const d = g.getImageData(0, 0, N, N).data;
      let best = null;
      let bestScore = -1;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const gg = d[i + 1];
        const b = d[i + 2];
        const max = Math.max(r, gg, b);
        const min = Math.min(r, gg, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const mid = 1 - Math.abs((max + min) / 2 - 150) / 150;
        const score = sat * 2 + clamp(mid, 0, 1);
        if (score > bestScore) {
          bestScore = score;
          best = { r, g: gg, b };
        }
      }
      if (!best) return;
      const hex = `#${[best.r, best.g, best.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      /* 太暗的"专色"当强调色会看不见，退回清单里的 accent */
      const lum = relLuminance(best);
      const accent = lum < 0.06 ? st.colors.accent : hex;
      st.colors = { ...st.colors, accent };
      st.colorsRgb.accent = hexToRgb(accent, COLORS.accent);
      applyColors(st);
      st.backdropPending = { bg: st.colors.bg, fg: st.colors.fg, accent };
      scheduleBackdrop(st);
      st.wallKey = "";
      st.liveKey = "";
      wake(st);
    } catch {
      /* 取不到色就保持清单配色 —— 画面不受影响 */
    }
  };
  img.onerror = () => {};
  img.src = url;
}

function scheduleBackdrop(st) {
  if (st.backdropTimer) clearTimeout(st.backdropTimer);
  st.backdropTimer = setTimeout(() => {
    st.backdropTimer = 0;
    const pal = st.backdropPending;
    if (!pal || !st.alive) return;
    st.backdropPending = null;
    try {
      st.ctx.actions?.reportBackdrop?.(pal);
    } catch {
      /* 宿主没实现就算了 */
    }
  }, REPORT_MS);
}

/* --------------------------------------------------------------------------
   卸载
   -------------------------------------------------------------------------- */

function teardown() {
  const st = S;
  if (!st) return;
  st.alive = false;
  if (st.raf) cancelAnimationFrame(st.raf);
  st.raf = 0;
  if (st.backdropTimer) clearTimeout(st.backdropTimer);
  st.backdropTimer = 0;
  for (const off of st.detach) {
    try {
      off();
    } catch {
      /* 已经没了就算了 */
    }
  }
  st.detach.length = 0;
  st.vcache.clear();
  st.mcache.clear();
  /* 宿主只会清自己的挂载点，整窗背景层的容器得我们自己收干净 */
  if (st.ctx?.backgroundRoot) {
    st.ctx.backgroundRoot.innerHTML = "";
    st.ctx.backgroundRoot.hidden = true;
    st.ctx.backgroundRoot.removeAttribute("style");
  }
  if (st.ctx?.root) st.ctx.root.innerHTML = "";
  st.el = null;
  st.cvWall = null;
  st.cvLive = null;
  st.c2w = null;
  st.c2l = null;
  S = null;
}

/* --------------------------------------------------------------------------
   生命周期
   -------------------------------------------------------------------------- */

function applyPatch(st, patch) {
  if (!st.alive || !st.el) return;
  const type = patch?.type;
  switch (type) {
    case "mount":
    case "song":
    case "media":
    case "lyrics":
      refresh(st, { world: type !== "media", cut: type === "song" });
      break;
    case "progress": {
      const pos = Number(patch.position) || 0;
      const now = nowMs();
      /* 拖进度条 = 位置突然跳掉。宿主不会专门通知"这是一次 seek"，只能自己认：
         认出来就切镜 —— 否则摄像机会横穿半首歌，一片糊。 */
      if (Math.abs(pos - st.clock.at(now)) > SEEK_JUMP_MS) st.pendingCut = true;
      st.clock.set(pos, patch.playing !== false, now);
      const dur = Number(patch.duration);
      if (dur > 0) st.duration = dur;
      wake(st);
      if (!st.animations) paintOnce(st);
      break;
    }
    case "state": {
      const pb = safe(() => st.ctx.playback(), null) || {};
      st.clock.set(Number(pb.position) || 0, patch.playing !== false, nowMs());
      wake(st);
      if (!st.animations) paintOnce(st);
      break;
    }
    case "options":
      refresh(st, { world: false });
      break;
    case "theme":
      refresh(st, { world: false });
      break;
    case "resize":
      resize(st);
      paintOnce(st);
      wake(st);
      break;
    case "close":
      stopFrames(st);
      if (st.bgEl) st.bgEl.hidden = true;
      break;
    default:
      wake(st);
  }
}

export default {
  id: "atlas",

  mount(ctx) {
    if (S) teardown();
    const st = createState(ctx);
    S = st;
    build(st);
    return st.el;
  },

  update(ctx, patch) {
    if (!S || !S.alive) return;
    applyPatch(S, patch);
  },

  destroy() {
    teardown();
  },
};

/** 自检脚本用的内部探针（宿主不会碰）：量当前世界/摄像机/统计 */
export function __probe() {
  const st = S;
  if (!st) return null;
  return {
    mode: st.mode,
    cam: { cx: st.cam.cx, cy: st.cam.cy, k: st.cam.k },
    target: st.target ? { cx: st.target.cx, cy: st.target.cy, k: st.target.k } : null,
    s: st.s,
    view: st.view,
    world: st.world ? { W: st.world.W, H: st.world.H, density: st.world.density, n: st.rects.length } : null,
    rects: st.rects,
    lineIndex: st.lineIndex,
    lift: st.lift,
    roll: st.roll,
    finale: st.finale,
    interlude: st.interlude,
    drew: st.drew,
    culled: st.culled,
    draws: st.draws,
    idle: st.idle,
    manualY: st.manualY,
    hover: st.hover,
    interactive: st.interactive,
    animations: st.animations,
    performance: st.performance,
    bass: st.bass,
    colors: st.colors,
    lineStarts: st.lineTiming ? st.lineTiming.starts : null,
    gridH: st.world ? st.world.H : 0,
  };
}
