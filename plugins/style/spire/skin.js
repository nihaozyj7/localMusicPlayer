/* ==========================================================================
   塔 spire —— 第三方播放界面样式（契约 v3）
   --------------------------------------------------------------------------
   极限轴：空间 + 清晰度。全程 CSS 3D（perspective + preserve-3d），
   正文永远是 DOM 里的矢量文字 —— 不画 canvas、不贴图、不用 filter。

   一句话：歌词是一层层悬浮玻璃板，沿 Z 轴螺旋排成一座无限塔；
   唱到哪一层，镜头就停在哪一层（镜头是"一个数"，每层的位置由它派生）。

   探针 P4 的实测结论（`.tmp-p4-3d.mjs`，14/14）直接决定了这里的取舍：
     · preserve-3d + perspective 真的投影（translateZ(200) → 投影 ×1.3333）；
     · filter / overflow:hidden / opacity<1 / backdrop-filter 都是**分组属性**，
       挂在塔的祖先上会把整套透视压平 → 塔体内部一个都不用；
     · will-change:transform 不压平 → 可以放心加合成提示；
     · transform 不参与布局 → 逐帧改 transform 不触发重排；
     · 文字栅格化倍率 ≈ 投影比 → 把 Z 引起的缩放控制在 1.15× 以内就不糊。
   ========================================================================== */

const ID = "spire";

/* 子模块必须透传入口的 ?t= 查询串（/skins/<id>/<file>?t=<token> 是宿主的同源托管路由，
   丢了 token 会 404；而且丢查询串会让模块被当成两个不同 URL 各加载一次）。 */
const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

let tower = null;
let cam = null;

/** 暂停后多久停帧（宿主进度补丁 4Hz，停帧前要留够余量） */
const IDLE_STOP_MS = 6000;
/** 视觉滞后：进度补丁 4Hz + 位置量化 250ms，往前看一眼才不显得"慢半拍" */
const VISUAL_LAG_MS = 70;
/** 清单里的帧预算（performance 档按它限帧；自检直接读清单断言） */
const BUDGET_FPS = 45;
/** 封面取色：1×1 降采样（只为壳配色与雾的冷暖，不需要细节） */
const SAMPLE_N = 1;
/** 歌词行数上限：超过这个数就不做逐字（那种歌本来也不该逐字扫一遍） */
const MAX_LINES = 600;
const FONT_STACK = '"Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';

const SHELL = `
  <div class="sp__world">
    <div class="sp__fog"></div>
    <div class="sp__slices">
      <div class="sp__slice sp__slice--a"></div>
      <div class="sp__slice sp__slice--b"></div>
      <div class="sp__slice sp__slice--c"></div>
    </div>
    <div class="sp__tower" role="list"></div>
    <div class="sp__empty" hidden></div>
  </div>
  <div class="sp__hud">
    <div class="sp__title"></div>
    <div class="sp__sub">
      <span class="sp__artist"></span>
      <span class="sp__floor"></span>
      <span class="sp__tc"></span>
    </div>
  </div>`;

const BG_SHELL = `
  <div class="spbg">
    <img class="spbg__img" alt="" decoding="async" />
    <div class="spbg__veil"></div>
    <div class="spbg__shaft"></div>
  </div>`;

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */
const nowMs = () => performance.now();
const j = (v) => JSON.stringify(v);

function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return [127, 127, 127];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hex = (rgb) =>
  "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const luma = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
function contrast(a, b) {
  const l1 = luma(a);
  const l2 = luma(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/* --------------------------------------------------------------------------
   样式包本体
   -------------------------------------------------------------------------- */
let S = null;

export default {
  id: ID,

  async mount(ctx) {
    /* 0. 子模块（透传 ?t=） */
    if (!tower) {
      tower = await load("tower.js");
      cam = await load("camera.js");
    }

    const st = {
      ctx,
      alive: true,
      /* DOM */
      elRoot: null,
      elWorld: null,
      elTower: null,
      elFog: null,
      elEmpty: null,
      elTitle: null,
      elArtist: null,
      elFloor: null,
      elTc: null,
      bgRoot: ctx.backgroundRoot || null,
      bgImg: null,
      elSlices: [],
      /* 数据 */
      track: null,
      lines: [],
      cover: "",
      mode: ctx.mode || "dark",
      /* 时间线 */
      pos: 0,
      clock: { pos: 0, at: 0, playing: false, maxExtrapolate: 1200 },
      /* 相机 */
      camPos: 0,
      flight: null, // { from, to, t0, dur }
      extra: null, // camera.js 的弹簧（dy 补偿）
      bass: 0,
      breath: 0,
      /* 设置 */
      animations: true,
      interactive: true,
      performanceMode: "smooth",
      budgetFps: BUDGET_FPS,
      budgetMs: 1000 / BUDGET_FPS,
      showLyrics: true,
      reducedMotion: false,
      /* 帧循环 */
      raf: 0,
      last: 0,
      frameMs: 0,
      lastActive: nowMs(),
      idle: false,
      /* 卡片池 */
      cards: [],
      half: tower.SHAPE.halfWindow,
      from: -1,
      to: -1,
      shape: null,
      rect: { w: 0, h: 0, dpr: 1 },
      /* 进度 */
      activeIndex: -1,
      gWritten: null, // 当前行每个字素写过的档位（×1000）
      vars: new Map(),
      backdropTimer: 0,
      backdropPending: null,
    };
    S = st;

    /* 1. 舞台骨架（ctx.root 由宿主提供并在挂载前清空） */
    const root = document.createElement("div");
    root.className = "sp";
    root.dataset.mode = st.mode;
    root.innerHTML = SHELL;
    ctx.root.appendChild(root);
    st.elRoot = root;
    st.elWorld = root.querySelector(".sp__world");
    st.elTower = root.querySelector(".sp__tower");
    st.elFog = root.querySelector(".sp__fog");
    st.elEmpty = root.querySelector(".sp__empty");
    st.elTitle = root.querySelector(".sp__title");
    st.elArtist = root.querySelector(".sp__artist");
    st.elFloor = root.querySelector(".sp__floor");
    st.elTc = root.querySelector(".sp__tc");
    st.elSlices = [...root.querySelectorAll(".sp__slice")];

    /* 2. 清单配色落到变量上（CSS 只认变量） */
    const c = (ctx.sdk && ctx.sdk.manifest && ctx.sdk.manifest.colors) || {};
    st.colors = {
      bg: parseHex(c.bg || "#070a12"),
      fg: parseHex(c.fg || "#e9eefb"),
      accent: parseHex(c.accent || "#6f9dff"),
    };
    applyColors(st, st.colors);
    setVar(st, "--sp-persp", `${tower.SHAPE.perspective}px`);

    /* 3. 整窗背景层：宿主给容器，内容自己填、destroy 时自己清 */
    buildBackground(st, ctx);

    /* 4. 环境 / 尺寸 / 卡片池 */
    applyEnv(st);
    resize(st);
    buildCards(st);
    st.extra = cam.createCamera(0);

    /* 4b. 交互：点某一层就跳到那一句（preserve-3d 下的命中测试按 Z 排序，P4 已验） */
    st.onClick = (ev) => {
      if (!st.alive || !st.interactive) return;
      const card = ev.target?.closest?.(".sp__card");
      if (!card) return;
      const i = Number(card.dataset.i);
      const line = Number.isFinite(i) && i >= 0 ? st.lines[i] : null;
      if (!line) return;
      ev.stopPropagation();
      try {
        st.ctx.actions?.seek?.(line.time);
      } catch {
        /* 宿主不实现就算了 */
      }
    };
    st.elTower.addEventListener("click", st.onClick);

    /* 5. 首帧数据 */
    syncTrack(st, ctx);
    syncMedia(st, ctx);
    syncLines(st, { force: true });
    syncProgress(st, ctx);
    st.clock.at = nowMs();
    wake(st);
    if (st.animations === false) {
      renderFrame(st, nowMs(), 0);
    }
  },

  /** 契约签名是 update(ctx, patch)（darkroom / rubbing 同款；只写 patch 会静默什么都不做） */
  update(ctx, patch) {
    const st = S;
    if (!patch || typeof patch.type !== "string") return;
    if (!st || !st.alive) return;
    if (ctx && ctx !== st.ctx) {
      st.ctx = ctx;
      st.cover = ""; // 换了宿主上下文（重新挂载到别处）时封面要重设
    }
    switch (patch.type) {      case "mount":
        break;
      case "song":
      case "media":
        syncTrack(st, st.ctx);
        syncMedia(st, st.ctx);
        syncLines(st, { force: true });
        wake(st);
        break;
      case "lyrics":
        syncLines(st, { force: true });
        syncProgress(st, st.ctx);
        wake(st);
        break;
      case "progress": {
        // 契约：{position, playing, at}（位置是 250ms 量化过的主机读数）
        const p = patch.patch || patch;
        if (p && typeof p.position === "number") {
          st.clock.pos = p.position;
          st.clock.at = Number.isFinite(p.at) ? p.at : nowMs();
          if (typeof p.playing === "boolean") st.clock.playing = p.playing;
          st.lastActive = nowMs();
        }
        syncProgress(st, st.ctx);
        break;
      }
      case "state": {
        const p = patch.patch || patch;
        if (p && typeof p.playing === "boolean") {
          st.clock.playing = p.playing;
          if (p.playing) {
            st.lastActive = nowMs();
            st.idle = false;
            delete st.elRoot.dataset.idle;
            wake(st);
          } else {
            st.lastActive = nowMs();
          }
        }
        break;
      }
      case "options":
        applyEnv(st);
        syncLines(st, { force: false });
        resize(st);
        wake(st);
        break;
      case "resize":
        resize(st);
        wake(st);
        break;
      case "visibility": {
        const p = patch.patch || patch;
        const fg = p && typeof p.foreground === "boolean" ? p.foreground : true;
        st.elRoot.dataset.foreground = fg ? "1" : "0";
        if (fg) {
          st.lastActive = nowMs();
          wake(st);
        } else {
          stop(st);
        }
        break;
      }
      case "theme": {
        const p = patch.patch || patch;
        st.mode = p?.mode || st.ctx.mode || st.mode;
        st.elRoot.dataset.mode = st.mode;
        st.elRoot.dataset.theme = p?.themeId || "";
        wake(st);
        break;
      }
      case "chrome":
        /* 宿主壳的观感只能通过清单 colors + reportBackdrop 影响，这里什么都不做 */
        break;
      case "close":
        st.alive = false;
        stop(st);
        if (st.bgRoot) st.bgRoot.hidden = true;
        break;
      case "default":
        break;
    }
    // 静态档不进帧循环，但补丁来了要**画一帧**（否则暂停/换句时画面永远停在挂载那一刻）
    if (st.animations === false) renderFrame(st, nowMs(), 16);
  },

  /** 契约签名是 destroy(ctx) */
  destroy(ctx) {
    const st = S;
    if (!st) return;
    st.alive = false;
    stop(st);
    if (st.backdropTimer) clearTimeout(st.backdropTimer);
    st.backdropTimer = 0;
    if (st.onClick && st.elTower) st.elTower.removeEventListener("click", st.onClick);
    for (const card of st.cards) card.units.length = 0;
    st.cards.length = 0;
    st.lines.length = 0;
    if (st.elRoot) {
      st.elRoot.removeAttribute("style");
      st.elRoot.innerHTML = "";
      st.elRoot.remove();
    }
    if (st.bgRoot) {
      st.bgRoot.innerHTML = "";
      st.bgRoot.hidden = true;
      st.bgRoot.dataset.skin = "";
    }
    S = null;
  },
};

/* ==========================================================================
   配色 / 变量
   ========================================================================== */
function applyColors(st, colors) {
  setVar(st, "--sp-bg", hex(colors.bg));
  setVar(st, "--sp-fg", hex(colors.fg));
  setVar(st, "--sp-accent", hex(colors.accent));
  const fg = [233, 238, 251];
  const dark = [7, 10, 18];
  const pick = contrast(colors.accent, dark) >= contrast(colors.accent, fg) ? dark : fg;
  setVar(st, "--sp-on-accent", hex(pick));
}

/** 只在变化时写（自定义属性每次写都会让样式失效，逐帧写上百个属性是白烧 CPU） */
function setVar(st, name, value) {
  if (st.vars.get(name) === value) return;
  st.vars.set(name, value);
  st.elRoot.style.setProperty(name, value);
}
function setVarOn(el, name, value) {
  if (el.__v && el.__v[name] === value) return;
  if (!el.__v) el.__v = Object.create(null);
  el.__v[name] = value;
  el.style.setProperty(name, value);
}

/* ==========================================================================
   背景层（整窗，宿主的容器；destroy 时必须自己清）
   ========================================================================== */
function buildBackground(st, ctx) {
  if (!st.bgRoot) return;
  st.bgRoot.hidden = false;
  st.bgRoot.dataset.skin = ID;
  st.bgRoot.innerHTML = BG_SHELL;
  st.bgImg = st.bgRoot.querySelector(".spbg__img");
}

function setCover(st, src) {
  const url = src || st.ctx.defaultCover || "";
  if (!url || url === st.cover) return;
  st.cover = url;
  if (st.bgImg) {
    // 用真 <img>（而不是背景图）：解码与显存释放交给浏览器，data-ready 也让自检能断言
    if (st.bgImg.getAttribute("src") !== url) {
      st.bgImg.dataset.ready = "0";
      st.bgImg.src = url;
      st.bgImg.dataset.ready = st.bgImg.complete ? "1" : "0";
      st.bgImg.addEventListener(
        "load",
        () => {
          if (st.alive) st.bgImg.dataset.ready = "1";
        },
        { once: true }
      );
    }
  }
  for (const s of st.elSlices) s.style.backgroundImage = `url("${url}")`;
  sampleCover(st, url);
}

/**
 * 封面取色 → 壳配色（`reportBackdrop` 只能给 bg/fg 两个值）。
 * 1×1 降采样：读到的平均色只用来给雾与壳定冷暖，不需要细节。
 * 封面是 data URL 或同源 `/online/cover`，所以画布不会被 taint（P5 已在真机验过）。
 */
function sampleCover(st, url) {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    if (!st.alive) return;
    try {
      const cv = document.createElement("canvas");
      cv.width = SAMPLE_N;
      cv.height = SAMPLE_N;
      const g = cv.getContext("2d", { willReadFrequently: false });
      g.drawImage(img, 0, 0, SAMPLE_N, SAMPLE_N);
      const d = g.getImageData(0, 0, SAMPLE_N, SAMPLE_N).data;
      const avg = [d[0], d[1], d[2]];
      const bg = mix([7, 10, 18], avg, 0.34);
      const fg = luma(bg) > 0.55 ? [12, 14, 20] : [233, 238, 251];
      const accent = mix([111, 157, 255], avg, 0.42);
      applyColors(st, { bg, fg, accent });
      setVar(st, "--sp-cover-tint", hex(mix([7, 10, 18], avg, 0.5)));
      st.backdropPending = { bg: hex(bg), fg: hex(fg) };
      scheduleBackdrop(st);
    } catch {
      /* 取不到色就保持清单配色（不影响画面） */
    }
  };
  img.onerror = () => {};
  img.src = url;
}

/** reportBackdrop 要防抖：切封面时一次会话可能连发好几张 */
function scheduleBackdrop(st) {
  if (st.backdropTimer) clearTimeout(st.backdropTimer);
  st.backdropTimer = setTimeout(() => {
    st.backdropTimer = 0;
    const pal = st.backdropPending;
    if (!pal || !st.alive) return;
    st.backdropPending = null;
    try {
      st.ctx.actions?.reportBackdrop?.({ bg: pal.bg, fg: pal.fg });
    } catch {
      /* 宿主没实现就算了 */
    }
  }, 400);
}

/* ==========================================================================
   数据同步
   ========================================================================== */
function syncTrack(st, ctx) {
  try {
    st.track = ctx.track?.() || null;
  } catch {
    st.track = null;
  }
}

function syncMedia(st, ctx) {
  let media = null;
  try {
    media = ctx.media?.() || null;
  } catch {
    media = null;
  }
  const title = media?.title || st.track?.title || "";
  const artist = media?.artist || st.track?.artist || "";
  const album = media?.album || st.track?.album || "";
  if (st.lastTitle !== title) {
    st.lastTitle = title;
    st.elTitle.textContent = title;
    st.elTitle.dataset.empty = title ? "0" : "1";
  }
  const sub = artist || album;
  if (st.lastArtist !== sub) {
    st.lastArtist = sub;
    st.elArtist.textContent = sub;
  }
  setCover(st, media?.cover || ctx.covers?.().current || "");
}

function syncProgress(st, ctx) {
  try {
    const pb = ctx.playback?.();
    if (pb) {
      if (typeof pb.position === "number" && !st.clock.touched) {
        st.clock.pos = pb.position;
        st.clock.at = nowMs();
        st.clock.touched = true;
      }
      if (typeof pb.playing === "boolean") st.clock.playing = pb.playing;
      st.duration = Number.isFinite(pb.duration) ? pb.duration : st.duration || 0;
    }
  } catch {
    /* 拿不到就用手上的 */
  }
  st.elRoot.dataset.playing = st.clock.playing ? "1" : "0";
}

/** 歌词（含逐字）：行级 + 每行字素 */
function syncLines(st, { force } = {}) {
  let lyrics = null;
  try {
    lyrics = st.ctx.lyrics?.() || null;
  } catch {
    lyrics = null;
  }
  const show = st.ctx.options?.().showLyrics !== false;
  st.showLyrics = show;
  const raw = Array.isArray(lyrics?.lines) ? lyrics.lines.slice(0, MAX_LINES) : [];
  const lines = raw
    .map((l) => {
      const text = String(l?.text ?? "");
      // 字素切分：宿主给了就用宿主的，没给就自己切（两者同义）
      const graphemes =
        Array.isArray(l?.graphemes) && l.graphemes.length ? l.graphemes.slice() : splitGraphemes(text);
      // 字级时间戳必须与字素**一一对齐**才可用；对不齐就退回整行（宁可不逐字，也不能错位点亮）
      const wordsIn = Array.isArray(l?.words) ? l.words.map(Number) : null;
      const words =
        wordsIn && wordsIn.length === graphemes.length && wordsIn.every((n) => Number.isFinite(n))
          ? wordsIn
          : null;
      return {
        time: Number.isFinite(l?.time) ? l.time : 0,
        text,
        graphemes,
        words,
      };
    })
    .filter((l) => l.text.trim().length > 0);

  const key = show ? lines.map((l) => `${l.time}|${l.text}`).join("\u0001") : "";
  if (!force && key === st.linesKey) return;
  st.linesKey = key;
  st.lines = show ? lines : [];
  st.total = st.lines.length;

  const has = st.total > 0;
  st.elRoot.dataset.empty = has ? "0" : "1";
  st.elEmpty.hidden = has;
  st.elEmpty.textContent = has ? "" : show ? "暂无歌词" : "";
  st.from = -1; // 强制重建卡片文字
  st.to = -1;
  st.activeIndex = -1;
  st.flight = null;
  st.camPos = 0;
  if (st.extra) cam.jump(st.extra, 0);
  if (has) {
    setFloor(st, 0);
  } else {
    st.elFloor.textContent = "";
    setVar(st, "--sp-progress", "0");
  }
}

/** 与宿主 sdk.splitGraphemes 同义的兜底切分（Intl.Segmenter 可用就用它） */
function splitGraphemes(text) {
  const s = String(text ?? "");
  if (!s) return [];
  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const seg = new Intl.Segmenter("zh", { granularity: "grapheme" });
      return [...seg.segment(s)].map((x) => x.segment);
    }
  } catch {
    /* 退化到码点切分 */
  }
  return [...s];
}

/* ==========================================================================
   环境 / 尺寸
   ========================================================================== */
function applyEnv(st) {
  let env = null;
  let opts = null;
  try {
    env = st.ctx.env?.() || null;
    opts = st.ctx.options?.() || null;
  } catch {
    /* 用默认 */
  }
  const animations = opts?.animations !== false && env?.reducedMotion !== true;
  st.animations = animations;
  st.reducedMotion = env?.reducedMotion === true;
  st.interactive = st.ctx.interactive !== false && opts?.interactive !== false;
  st.performanceMode = opts?.performanceMode || "smooth";
  st.budgetFps = Number.isFinite(opts?.budgetFps) && opts.budgetFps > 0 ? opts.budgetFps : BUDGET_FPS;
  st.budgetMs = 1000 / st.budgetFps;
  st.showLyrics = opts?.showLyrics !== false;

  st.elRoot.dataset.animations = animations ? "1" : "0";
  st.elRoot.dataset.interactive = st.interactive ? "1" : "0";
  st.elRoot.dataset.perf = st.performanceMode === "performance" ? "1" : "0";
  st.elRoot.dataset.lowMotion = st.reducedMotion ? "1" : "0";
  st.elRoot.dataset.dpr = String(st.rect?.dpr || 1);

  const oldHalf = st.half;
  st.half = tower.halfWindowFor({
    performanceMode: st.performanceMode,
    narrow: (st.rect?.w || 0) > 0 && st.rect.w < 900,
  });
  if (oldHalf !== st.half) {
    buildCards(st);
    st.focused = null;
  }
}

function resize(st) {
  let env = null;
  try {
    env = st.ctx.env?.() || null;
  } catch {
    /* 默认 */
  }
  const host = st.ctx.root;
  const w = Math.max(1, Math.round(host?.clientWidth || env?.width || window.innerWidth || 1280));
  const h = Math.max(1, Math.round(host?.clientHeight || env?.height || window.innerHeight || 720));
  const dpr = Math.max(1, Math.min(2, env?.dpr || window.devicePixelRatio || 1));
  st.rect = { w, h, dpr };
  st.narrow = w < 900;
  st.shape = tower.shapeFor({ width: w, performanceMode: st.performanceMode, narrow: st.narrow });
  setVar(st, "--sp-persp", `${st.shape.perspective}px`);
  setVar(st, "--sp-step", `${st.shape.stepZ}px`);
  setVar(st, "--sp-ty", `${Math.round(st.shape.stepY)}px`);
  setVar(st, "--sp-radius", `${st.shape.radius}px`);
  st.elRoot.dataset.narrow = st.narrow ? "1" : "0";
  st.elRoot.dataset.dpr = String(dpr);
  /* 宽高也给 CSS（雾/切片按它算尺寸） */
  setVar(st, "--sp-w", `${w}px`);
  setVar(st, "--sp-h", `${h}px`);
}

/* ==========================================================================
   卡片池（DOM 数量与歌词行数无关）
   ========================================================================== */
function buildCards(st) {
  const want = st.half * 2 + 1;
  const tower3d = st.elTower;
  tower3d.innerHTML = "";
  const frag = document.createDocumentFragment();
  const cards = [];
  for (let k = 0; k < want; k += 1) {
    const el = document.createElement("div");
    el.className = "sp__card";
    el.dataset.k = String(k);
    el.dataset.i = "-1";
    el.setAttribute("role", "listitem");
    const plate = document.createElement("div");
    plate.className = "sp__plate";
    const line = document.createElement("div");
    line.className = "sp__line";
    plate.appendChild(line);
    el.appendChild(plate);
    frag.appendChild(el);
    cards.push({ el, line, units: [], i: -1, lit: false, state: "" });
  }
  tower3d.appendChild(frag);
  st.cards = cards;
  st.from = -1;
  st.to = -1;
}

/** 卡片文字：一层 = 一句（逐字素 span 只在**当前行**才需要，但全部建好更省事） */
function paintCard(st, card, i) {
  const line = st.lines[i];
  card.i = i;
  card.el.dataset.i = String(i);
  card.lit = false;
  card.state = "";
  card.units.length = 0;
  card.line.textContent = "";
  if (!line) return;
  const frag = document.createDocumentFragment();
  const units = [];
  for (const g of line.graphemes) {
    const s = document.createElement("span");
    s.className = "sp__u";
    s.textContent = g;
    frag.appendChild(s);
    units.push(s);
  }
  card.line.appendChild(frag);
  card.units = units;
}

/* ==========================================================================
   帧循环
   ========================================================================== */
function wake(st) {
  if (!st.alive || st.raf) return;
  if (st.animations === false) return; // 静态档不进循环
  st.idle = false;
  delete st.elRoot.dataset.idle;
  st.last = 0;
  st.raf = requestAnimationFrame(() => frame(st));
}

function stop(st) {
  if (st.raf) cancelAnimationFrame(st.raf);
  st.raf = 0;
  st.last = 0;
}

function frame(st) {
  st.raf = 0;
  if (!st.alive || st.idle) return;
  const now = nowMs();
  const dtMs = st.last ? now - st.last : 16;
  const budget = 1000 / st.budgetFps;
  if (st.performanceMode === "performance" && st.lastFrame && now - st.lastFrame < budget) {
    st.raf = requestAnimationFrame(() => frame(st));
    return;
  }
  st.lastFrame = now;
  st.last = now;
  renderFrame(st, now, dtMs);
  if (st.animations === false) return;
  if (!st.clock.playing && now - st.lastActive > IDLE_STOP_MS) {
    st.idle = true;
    st.elRoot.dataset.idle = "1";
    return;
  }
  st.raf = requestAnimationFrame(() => frame(st));
}

/** 时钟外推：进度补丁 4Hz + 250ms 量化，不插值就会一顿一顿 */
function positionAt(st, now) {
  const base = st.clock.pos;
  if (!st.clock.playing) return base;
  const dt = now - st.clock.at;
  const add = Math.max(0, Math.min(dt, st.clock.maxExtrapolate));
  return base + add;
}

function renderFrame(st, now, dtMs) {
  const pos = Math.max(0, positionAt(st, now) - VISUAL_LAG_MS);
  st.pos = pos;

  /* 当前行 → 镜头目标 */
  const idx = tower.lineIndexAt(st.lines, pos);
  if (idx >= 0 && idx !== st.activeIndex) {
    const gap = st.lines[idx].time - (st.lines[st.activeIndex]?.time ?? st.lines[idx].time);
    const dur = st.animations === false || st.performanceMode === "performance" ? 0 : tower.flightDuration(gap);
    st.flight =
      dur > 0 && st.activeIndex >= 0
        ? { from: st.camPos, to: idx, t0: now, dur }
        : null;
    if (!st.flight) st.camPos = idx;
    st.activeIndex = idx;
    st.elRoot.dataset.flightMs = String(dur);
    setFloor(st, idx);
    if (st.extra) cam.aim(st.extra, cam.liftForGap(gap));
    if (st.performanceMode === "performance") setVar(st, "--sp-step-scale", "0.9");
  }

  /* 镜头：确定性飞行（时长由行间隔反算） */
  if (st.flight) {
    const f = tower.flightAt(st.flight.from, st.flight.to, now - st.flight.t0, st.flight.dur);
    st.camPos = f.cam;
    if (f.done) st.flight = null;
  }
  // 可观测性：镜头停在哪儿、这一跳有多久（自检与排查都靠这两个属性）
  setVar(st, "--sp-cam", st.camPos.toFixed(3));
  if (st.elRoot.dataset.cam !== st.camPos.toFixed(3)) st.elRoot.dataset.cam = st.camPos.toFixed(3);
  st.elRoot.dataset.flying = st.flight ? "1" : "0";

  /* 低频 → 塔体呼吸（很小，只为了让空间"活着"） */
  const bands = readBands(st);
  const bass = bands ? avgRange(bands, 0, 12) : 0;
  st.bass = cam.ema(st.bass, bass, 0.12);
  st.breath = st.animations === false || st.performanceMode === "performance" ? 0 : cam.breathForBass(st.bass);
  setVar(st, "--sp-breath", `${st.breath.toFixed(2)}px`);
  setVar(st, "--sp-bass", st.bass.toFixed(3));

  /* 相机纵向补偿（弹簧，避免换层时"硬拐弯"） */
  const ce = cam.stepCamera(st.extra, dtMs / 1000);
  setVar(st, "--sp-cam-dy", `${ce.pos.toFixed(2)}px`);

  /* 逐层几何（只有池里的卡片会被写） */
  const range = tower.visibleRange(st.camPos, Math.max(1, st.total), st.half);
  if (range.from !== st.from || range.to !== st.to) repaintWindow(st, range);
  paintWindow(st, range);
  paintUnits(st, pos);
  setVar(st, "--sp-progress", progressRatio(st, pos, idx));
  paintTimecode(st, pos);
}

function readBands(st) {
  try {
    const snap = st.ctx.spectrum?.();
    const b = snap?.bands; // ★ 快照是 {bands, at}，不是裸数组
    return b && b.length ? b : null;
  } catch {
    return null;
  }
}
function avgRange(bands, from, to) {
  const lo = Math.max(0, from);
  const hi = Math.min(bands.length - 1, to);
  if (hi < lo) return 0;
  let sum = 0;
  for (let i = lo; i <= hi; i += 1) sum += bands[i];
  return sum / (hi - lo + 1);
}

/** 窗口滑动后要重新分配卡片文字 */
function repaintWindow(st, range) {
  st.from = range.from;
  st.to = range.to;
  for (let k = 0; k < st.cards.length; k += 1) {
    const i = range.from + k;
    const card = st.cards[k];
    if (i > range.to) {
      if (card.i !== -1) {
        card.i = -1;
        card.el.dataset.i = "-1";
        card.el.dataset.off = "1";
        card.line.textContent = "";
        card.units.length = 0;
      }
      continue;
    }
    card.el.dataset.off = "0";
    if (card.i !== i) paintCard(st, card, i);
  }
}

/** 每帧写几何：一层只写 2 个自定义属性（transform 整体 + 不透明度） */
function paintWindow(st, range) {
  const shape = st.shape || tower.SHAPE;
  for (let k = 0; k < st.cards.length; k += 1) {
    const card = st.cards[k];
    const i = range.from + k;
    if (i > range.to || card.i < 0) continue;
    const g = tower.cardGeometry(i, st.camPos, shape);
    const op = tower.cardOpacity(i - st.camPos, shape);
    const state = i <= st.activeIndex ? (tower.isCurrent(st.camPos, i) ? "active" : "lit") : "idle";
    const tf = `translate3d(${g.x}px, ${g.y}px, ${g.z}px) rotateY(${g.rot}deg) scale(${g.scale})`;
    setVarOn(card.el, "--c-tf", tf);
    setVarOn(card.el, "--c-op", op.toFixed(3));
    // 静态档（一列垂直列表）不用 3D 变换，只按"离当前行多远"排一行
    if (st.animations === false) setVarOn(card.el, "--c-i-offset", String(i - (st.activeIndex >= 0 ? st.activeIndex : i)));
    if (card.state !== state) {
      card.state = state;
      card.el.dataset.state = state;
      if (state === "lit") {
        for (const u of card.units) setVarOn(u, "--g", "1");
      }
    }
  }
}

/** 当前行的逐字点亮（只写变化的档位） */
function paintUnits(st, pos) {
  const card = st.cards.find((c) => c.i === st.activeIndex);
  if (!card) return;
  const line = st.lines[st.activeIndex];
  if (!line) return;
  const levels = tower.unitLevels(line.words, card.units.length, pos, {
    lineEnd: tower.nextLineTime(st.lines, st.activeIndex),
  });
  for (let i = 0; i < card.units.length; i += 1) {
    const v = Math.round(levels[i] * 1000) / 1000;
    setVarOn(card.units[i], "--g", String(v));
  }
  st.lit = levels.filter((v) => v > 0).length;
  st.elRoot.dataset.lit = String(st.lit);
  st.elRoot.dataset.glyphs = String(card.units.length);
  st.elRoot.dataset.line = String(st.activeIndex);
}

function progressRatio(st, pos, idx) {
  const total = Math.max(1, st.total);
  if (idx < 0) return "0";
  const from = st.lines[idx]?.time ?? 0;
  const to = tower.nextLineTime(st.lines, idx);
  if (to == null) return ((idx + 0.999) / total).toFixed(3);
  const t = (pos - from) / Math.max(1, to - from);
  return Math.max(0, Math.min(1, t)).toFixed(3);
}

function setFloor(st, idx) {
  const n = Math.max(0, st.activeIndex >= 0 ? st.activeIndex : idx) + 1;
  const total = Math.max(1, st.total);
  const text = `第 ${n} / ${total} 层`;
  if (st.elFloor.textContent !== text) st.elFloor.textContent = text;
  setVar(st, "--sp-floor", String(n));
  st.elRoot.dataset.floor = String(n);
}

function paintTimecode(st, pos) {
  const text = `${tower.timecode(pos)} / ${tower.timecode(st.duration || 0)}`;
  if (st.tcText !== text) {
    st.tcText = text;
    st.elTc.textContent = text;
  }
}
