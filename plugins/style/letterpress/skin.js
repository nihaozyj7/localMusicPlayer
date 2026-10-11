/* ==========================================================================
   活字 letterpress —— 第三方播放界面样式（契约 v3）
   --------------------------------------------------------------------------
   极限轴：文字 / 排版本身。整屏只有字，没有一个图形元素、没有一张图、
   没有 canvas、没有贴图 —— 连舞台底色都是一张"纸"。

   一句话：字是被"排"出来的 —— 字号 / 字重 / 字距 / 斜切由 128 段频谱映射成
   一条排版曲线（低频抬字重与字号、中频拉字距并顶起基线、高频给一点斜切）；
   换句 = 一次**活字重排**：新句的字素从旧句的位置飞过来（FLIP，只动 transform）。

   三条硬规矩（都在自检里断言）：
     1. 逐字素属性只写在**当前行**上 —— 不是给全文每个字都写（那是 N 行 × 20 字/帧）；
     2. 排版曲线每帧只写**行级 6 个**自定义属性，而且写前比对旧值（静止帧零写入）；
     3. 基准字号来自宿主的 `lyricsFontSize`，曲线是乘在它上面的**相对量** ——
        绝不用自己的数值覆盖用户设置。

   为什么不用可变字体：CJK 可变字体子集化后仍有数 MB，且首帧必然跳字（字体没到
   只能先用兜底字体排一遍再重排）。四个真实存在的 CSS 属性已经足够表达"排版在呼吸"。
   ========================================================================== */

const ID = "letterpress";

/* 子模块必须透传入口的 ?t= 查询串（/skins/<id>/<file>?t=<token> 是宿主的同源托管路由，
   丢了 token 会 404；丢查询串还会让同一个模块被当成两个 URL 各加载一次）。 */
const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

let ts = null; // lib/typeset.js
let ink = null; // lib/ink.js

/** 暂停后多久停帧（宿主进度补丁 4Hz，停帧前留够余量） */
const IDLE_STOP_MS = 6000;
/** 清单里的帧预算（performance 档按它限帧；自检直接读清单断言） */
const BUDGET_FPS = 30;
/** 视觉滞后：进度补丁 4Hz + 位置量化 250ms，往前看一眼才不显得慢半拍 */
const VISUAL_LAG_MS = 70;
/** 封面取色降采样：挑专色要一点分布，12×12 够（不是求平均色） */
const SAMPLE_N = 12;
/** 歌词行数上限 */
const MAX_LINES = 600;
/** 行池 = 2×half+1（当前行前后各 40 行；屏幕上只看得见 7 行左右）
    —— 视窗滑动时"槽位换字"发生在 40 行开外，永远不在视野里 */
const HALF_WINDOW = 40;
const FONT_STACK =
  '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "SimSun", Georgia, "Times New Roman", serif';

const SHELL = `
  <div class="lp__paper">
    <div class="lp__rules"></div>
    <div class="lp__marks">
      <i class="lp__mark lp__mark--a"></i><i class="lp__mark lp__mark--b"></i>
      <i class="lp__mark lp__mark--c"></i><i class="lp__mark lp__mark--d"></i>
    </div>
  </div>
  <div class="lp__sheet">
    <div class="lp__elide lp__elide--top"></div>
    <div class="lp__col"></div>
    <div class="lp__elide lp__elide--bottom"></div>
    <div class="lp__poster" hidden>
      <div class="lp__poster-title"></div>
      <div class="lp__poster-sub"></div>
    </div>
  </div>
  <div class="lp__empty" hidden>
    <div class="lp__empty-text"></div>
    <div class="lp__empty-sub"></div>
  </div>
  <div class="lp__hud">
    <div class="lp__hud-title"></div>
    <div class="lp__hud-meta">
      <span class="lp__num"></span>
      <span class="lp__read"></span>
      <span class="lp__tc"></span>
    </div>
  </div>`;

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */
const nowMs = () => performance.now();
const j = (v) => JSON.stringify(v);

/* --------------------------------------------------------------------------
   样式包本体
   -------------------------------------------------------------------------- */
let S = null;

export default {
  id: ID,

  async mount(ctx) {
    /* 0. 子模块（透传 ?t=） */
    if (!ts) {
      ts = await load("typeset.js");
      ink = await load("ink.js");
    }

    const st = {
      ctx,
      alive: true,
      /* DOM */
      elRoot: null,
      elSheet: null,
      elCol: null,
      elPoster: null,
      elPosterTitle: null,
      elPosterSub: null,
      elEmpty: null,
      elEmptyText: null,
      elEmptySub: null,
      elTitle: null,
      elNum: null,
      elRead: null,
      elTc: null,
      elElideTop: null,
      elElideBottom: null,
      /* 数据 */
      track: null,
      lines: [],
      total: 0,
      linesKey: "",
      cover: "",
      spot: ink.SPOT_FALLBACK,
      mode: ctx.mode || "light",
      /* 时间线 */
      pos: 0,
      clock: { pos: 0, at: 0, playing: false, maxExtrapolate: 1200 },
      /* 版面 */
      cur: -1,
      from: -1,
      to: -1,
      slots: [],
      units: [],
      unitI: -1,
      gWritten: null,
      composing: false,
      holdTimer: 0,
      moveMs: 0,
      /* 排版曲线 */
      curve: null,
      lastCurveKey: "",
      lastProg: "",
      bass: 0,
      /* 设置 */
      animations: true,
      interactive: true,
      performanceMode: "smooth",
      budgetFps: BUDGET_FPS,
      showLyrics: true,
      reducedMotion: false,
      baseSize: 21,
      fit: 1,
      /* 帧循环 */
      raf: 0,
      last: 0,
      lastFrame: 0,
      lastActive: nowMs(),
      idle: false,
      /* 取色 */
      vars: new Map(),
      backdropTimer: 0,
      backdropPending: null,
      anims: [],
      rect: { w: 0, h: 0, dpr: 1 },
    };
    S = st;

    /* 1. 舞台骨架（ctx.root 由宿主提供并在挂载前清空） */
    const root = document.createElement("div");
    root.className = "lp";
    root.dataset.mode = st.mode;
    root.style.fontFamily = FONT_STACK;
    root.innerHTML = SHELL;
    ctx.root.appendChild(root);
    st.elRoot = root;
    st.elSheet = root.querySelector(".lp__sheet");
    st.elCol = root.querySelector(".lp__col");
    st.elPoster = root.querySelector(".lp__poster");
    st.elPosterTitle = root.querySelector(".lp__poster-title");
    st.elPosterSub = root.querySelector(".lp__poster-sub");
    st.elEmpty = root.querySelector(".lp__empty");
    st.elEmptyText = root.querySelector(".lp__empty-text");
    st.elEmptySub = root.querySelector(".lp__empty-sub");
    st.elTitle = root.querySelector(".lp__hud-title");
    st.elNum = root.querySelector(".lp__num");
    st.elRead = root.querySelector(".lp__read");
    st.elTc = root.querySelector(".lp__tc");
    st.elElideTop = root.querySelector(".lp__elide--top");
    st.elElideBottom = root.querySelector(".lp__elide--bottom");

    /* 2. 清单配色落到变量上（CSS 只认变量） */
    const c = (ctx.sdk && ctx.sdk.manifest && ctx.sdk.manifest.colors) || {};
    st.colors = { bg: c.bg || ink.PAPER, fg: c.fg || ink.INK, accent: c.accent || ink.SPOT_FALLBACK };
    applyColors(st, st.colors);

    /* 3. 环境 / 版面 / 行池 */
    applyEnv(st);
    resize(st);
    buildSlots(st);

    /* 4. 交互：点某一行就跳到那一句（整块行都是命中区，DOM 文本天然精确） */
    st.onClick = (ev) => {
      if (!st.alive || !st.interactive) return;
      const el = ev.target?.closest?.(".lp__line");
      if (!el) return;
      const i = Number(el.dataset.i);
      const line = Number.isFinite(i) && i >= 0 ? st.lines[i] : null;
      if (!line) return;
      ev.stopPropagation();
      try {
        st.ctx.actions?.seek?.(line.time);
      } catch {
        /* 宿主不实现就算了 */
      }
    };
    st.elCol.addEventListener("click", st.onClick);

    /* 5. 首帧数据 */
    syncTrack(st, ctx);
    syncMedia(st, ctx);
    syncLines(st, { force: true });
    syncProgress(st, ctx);
    st.clock.at = nowMs();
    if (st.animations === false) renderFrame(st, nowMs(), 0);
    else wake(st);
  },

  /** 契约签名是 update(ctx, patch)（darkroom / rubbing / spire 同款；只写 patch 会静默什么都不做） */
  update(ctx, patch) {
    const st = S;
    if (!patch || typeof patch.type !== "string") return;
    if (!st || !st.alive) return;
    if (ctx && ctx !== st.ctx) {
      st.ctx = ctx;
      st.cover = ""; // 换宿主上下文（重新挂载到别处）时封面要重取
    }
    switch (patch.type) {
      case "mount":
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
        const p = patch.patch || patch;
        if (p && typeof p.position === "number") {
          st.clock.pos = p.position;
          st.clock.at = Number.isFinite(p.at) ? p.at : nowMs();
          if (typeof p.playing === "boolean") {
            st.clock.playing = p.playing;
            st.elRoot.dataset.playing = p.playing ? "1" : "0";
            // 播放中就别停在"待机"状态上（暂停 6 秒才会进 idle）
            if (p.playing && st.idle) {
              st.idle = false;
              delete st.elRoot.dataset.idle;
              wake(st);
            }
          }
          st.lastActive = nowMs();
        }
        break;
      }
      case "state": {
        const p = patch.patch || patch;
        if (p && typeof p.playing === "boolean") {
          st.clock.playing = p.playing;
          st.lastActive = nowMs();
          if (p.playing) {
            st.idle = false;
            delete st.elRoot.dataset.idle;
            wake(st);
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
        break;
      case "default":
        break;
    }
    // 静态档不进帧循环，但补丁来了要**画一帧**（否则暂停/换句时画面永远停在挂载那一刻）
    if (st.animations === false && st.alive) renderFrame(st, nowMs(), 16);
  },

  /** 契约签名是 destroy(ctx) */
  destroy(ctx) {
    const st = S;
    if (!st) return;
    st.alive = false;
    stop(st);
    if (st.holdTimer) clearTimeout(st.holdTimer);
    st.holdTimer = 0;
    if (st.backdropTimer) clearTimeout(st.backdropTimer);
    st.backdropTimer = 0;
    for (const a of st.anims) {
      try {
        a.cancel();
      } catch {
        /* 已经结束的动画取消会抛，忽略 */
      }
    }
    st.anims.length = 0;
    if (st.onClick && st.elCol) st.elCol.removeEventListener("click", st.onClick);
    st.units.length = 0;
    st.slots.length = 0;
    st.lines.length = 0;
    st.total = 0;
    if (st.elRoot) {
      st.elRoot.removeAttribute("style");
      st.elRoot.innerHTML = "";
      st.elRoot.remove();
    }
    /* 这一款声明了 background:false —— 从不碰 ctx.backgroundRoot，
       所以这里也不去清它（清了就是越权：容器不是我们的） */
    S = null;
  },
};

/* ==========================================================================
   配色 / 变量
   ========================================================================== */
function applyColors(st, colors) {
  const paper = normHex(colors.bg, ink.PAPER);
  const inkc = normHex(colors.fg, ink.INK);
  setVar(st, "--lp-paper", paper);
  setVar(st, "--lp-ink", inkc);
  setVar(st, "--lp-spot", st.spot || normHex(colors.accent, ink.SPOT_FALLBACK));
  setVar(st, "--lp-spot-ink", ink.bestInk(st.spot || colors.accent));
  // 宿主壳（底栏/按钮）配色：纸白底 + 墨黑字，另给专色做强调
  setVar(st, "--lp-chrome-bg", paper);
  setVar(st, "--lp-chrome-fg", inkc);
}

const normHex = (v, fb) => (/^#[0-9a-f]{6}$/i.test(String(v || "").trim()) ? String(v).trim() : fb);

/** 只在变化时写（自定义属性每次写都会让样式失效，逐帧写上百个是白烧 CPU） */
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
   封面 → 专色
   ========================================================================== */
/**
 * 从封面挑一个"专色"（不是平均色）：跳过接近纸白/墨黑的像素，按
 * 饱和度 × 中间明度打分取桶。封面是 data URL 或同源 /online/cover，
 * 所以画布不会被 taint（P5 已在真机验过）。
 */
function sampleSpot(st, url) {
  if (!url) return;
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
      const d = g.getImageData(0, 0, SAMPLE_N, SAMPLE_N);
      const spot = ink.readableSpot(ink.pickSpot(d.data, SAMPLE_N, SAMPLE_N, {}), st.colors.bg);
      st.spot = spot;
      setVar(st, "--lp-spot", spot);
      setVar(st, "--lp-spot-ink", ink.bestInk(spot));
      // 上报给宿主：纸白/墨黑是固定的，专色随封面变
      st.backdropPending = { bg: normHex(st.colors.bg, ink.PAPER), fg: normHex(st.colors.fg, ink.INK), accent: spot };
      scheduleBackdrop(st);
    } catch {
      /* 取不到色就保持清单配色（画面不受影响） */
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
      st.ctx.actions?.reportBackdrop?.({ bg: pal.bg, fg: pal.fg, accent: pal.accent });
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
  const title = media?.song?.title || st.track?.title || "";
  const artist = media?.song?.artist || st.track?.artist || "";
  if (st.lastTitle !== title) {
    st.lastTitle = title;
    st.elTitle.textContent = title;
    st.elTitle.dataset.empty = title ? "0" : "1";
    if (st.showLyrics === false) applyPoster(st);
  }
  if (st.lastArtist !== artist) {
    st.lastArtist = artist;
    applyPoster(st);
  }
  setCover(st, media?.cover || ctx.covers?.().current || "");
}

function setCover(st, src) {
  const url = src || st.ctx.defaultCover || "";
  if (!url || url === st.cover) return;
  st.cover = url;
  sampleSpot(st, url);
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
  const showChanged = st.showLyrics !== show;
  st.showLyrics = show;

  const raw = Array.isArray(lyrics?.lines) ? lyrics.lines.slice(0, MAX_LINES) : [];
  const lines = raw
    .map((l) => {
      const text = String(l?.text ?? "");
      // 字素切分：宿主给了就用宿主的，没给就自己切（两者同义）
      const graphemes = Array.isArray(l?.graphemes) && l.graphemes.length ? l.graphemes.slice() : splitGraphemes(text);
      // 字级时间戳必须与字素**一一对齐**才可用；对不齐就退回整行
      // （宁可不逐字，也不能错位点亮）—— 注意是按"切出来的字素数"对齐，
      // 不是按宿主有没有给 graphemes 字段（行里没有这个字段是常态）
      const wordsIn = Array.isArray(l?.words) ? l.words.map(Number) : null;
      const words =
        wordsIn && wordsIn.length === graphemes.length && wordsIn.every((n) => Number.isFinite(n)) ? wordsIn : null;
      return { time: Number.isFinite(l?.time) ? l.time : 0, text, graphemes, words };
    })
    .filter((l) => l.text.trim().length > 0);

  const key = show ? lines.map((l) => `${l.time}|${l.text}`).join("\u0001") : "";
  if (!force && !showChanged && key === st.linesKey) return;
  st.linesKey = key;
  st.lines = show ? lines : [];
  st.total = st.lines.length;

  st.elRoot.dataset.total = String(st.total);
  st.elRoot.dataset.showLyrics = show ? "1" : "0";
  st.elRoot.dataset.poster = show ? "0" : "1";
  st.elRoot.dataset.empty = show && !st.total ? "1" : "0";
  st.elPoster.hidden = show;
  st.elEmpty.hidden = !(show && !st.total);
  if (!show) applyPoster(st);
  if (show && !st.total) {
    st.elEmptyText.textContent = "暂无歌词";
    st.elEmptySub.textContent = st.lastTitle || "";
  }

  // 换歌/换歌词：版面从头开始，行池重排
  st.cur = -1;
  st.from = -1;
  st.to = -1;
  st.units.length = 0;
  st.unitI = -1;
  st.gWritten = null;
  for (const s of st.slots) {
    s.i = -1;
    s.depth = -1;
    s.el.dataset.i = "-1";
    s.el.dataset.off = "1";
    delete s.el.dataset.units;
    delete s.el.dataset.depth;
    delete s.el.dataset.state;
    s.el.textContent = "";
    // 只清"内容相关"的变量：--slot 是**版面骨架**，清掉它所有行会塌到同一个槽位上
    // （这个 bug 的表现是"整页文字叠在一起"，而帧计数、行号、逐字档位全都是对的）
    s.el.style.removeProperty("--lp-ds");
    s.el.style.removeProperty("--lp-di");
    s.el.__v = null;
    s.units.length = 0;
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
   环境 / 尺寸 / 版面
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
  st.animations = opts?.animations !== false && env?.reducedMotion !== true;
  st.reducedMotion = env?.reducedMotion === true;
  st.interactive = st.ctx.interactive !== false && opts?.interactive !== false;
  st.performanceMode = opts?.performanceMode || "smooth";
  st.budgetFps = Number.isFinite(opts?.budgetFps) && opts.budgetFps > 0 ? opts.budgetFps : BUDGET_FPS;
  st.showLyrics = opts?.showLyrics !== false;
  // ★ 基准字号来自宿主设置（用户字号），曲线只做相对量
  const fs = Number(opts?.lyricsFontSize);
  st.baseSize = Number.isFinite(fs) && fs >= 8 && fs <= 96 ? fs : 21;
  setVar(st, "--lp-base", `${st.baseSize}px`);

  st.elRoot.dataset.animations = st.animations ? "1" : "0";
  st.elRoot.dataset.interactive = st.interactive ? "1" : "0";
  st.elRoot.dataset.perf = st.performanceMode === "performance" ? "1" : "0";
  st.elRoot.dataset.lowMotion = st.reducedMotion ? "1" : "0";

  const oldMove = st.moveMs;
  st.moveMs = st.animations === false ? 0 : ts.CURVE.moveMs;
  if (oldMove !== st.moveMs) setVar(st, "--lp-move", `${st.moveMs}ms`);
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
  st.fit = ts.fitFor(w, h);
  const leading = st.narrow ? Math.round(ts.CURVE.leading * 0.82) : ts.CURVE.leading;
  setVar(st, "--lp-w", `${w}px`);
  setVar(st, "--lp-h", `${h}px`);
  setVar(st, "--lp-leading", `${leading}px`);
  setVar(st, "--lp-fit", String(st.fit));
  st.elRoot.dataset.narrow = st.narrow ? "1" : "0";
  st.elRoot.dataset.dpr = String(dpr);
  // 版面变化后列位移要按新的行高重算
  if (st.cur >= 0 && st.from >= 0) setVar(st, "--lp-shift", `${ts.columnShift(st.cur, st.from, leading)}px`);
}

/** 行池：2×HALF_WINDOW+1 个行元素（DOM 数量与歌词行数无关） */
function buildSlots(st) {
  const want = HALF_WINDOW * 2 + 1;
  st.elCol.innerHTML = "";
  const frag = document.createDocumentFragment();
  const slots = [];
  for (let k = 0; k < want; k += 1) {
    const el = document.createElement("div");
    el.className = "lp__line";
    el.dataset.k = String(k);
    el.dataset.i = "-1";
    el.dataset.off = "1";
    el.setAttribute("role", "listitem");
    // 槽位号 = k（0..80），与 columnShift 的口径必须一致：
    // 当前行永远落在 (cur - from) 号槽位上，列位移把那一槽拉到版面中央
    el.style.setProperty("--slot", String(k));
    frag.appendChild(el);
    slots.push({ el, i: -1, units: [], depth: -1 });
  }
  st.elCol.appendChild(frag);
  st.slots = slots;
  st.from = -1;
  st.to = -1;
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
  const add = Math.max(0, Math.min(now - st.clock.at, st.clock.maxExtrapolate));
  return base + add;
}

function renderFrame(st, now) {
  const pos = Math.max(0, positionAt(st, now) - VISUAL_LAG_MS);
  st.pos = pos;

  /* 1. 当前行（换行 = 一次活字重排） */
  const idx = ts.lineIndexAt(st.lines, pos);
  if (idx !== st.cur) setCurrent(st, idx);

  /* 2. 频谱 → 排版曲线（只写行级的 6 个属性，写前比对旧值） */
  const split = ts.bandSplit(readBands(st));
  st.bass = st.bass + (split.low - st.bass) * 0.14;
  const curve = ts.typesetCurve(
    { low: st.bass, mid: split.mid, high: split.high },
    {
      fit: ts.amplitudeFit(st.fit),
      performance: st.performanceMode === "performance",
      disabled: st.animations === false || st.reducedMotion,
    }
  );
  st.curve = curve;
  // key 里带上基准字号与版面缩放：宿主改了用户字号时画面要立刻跟上，
  // 而"字号读数"与 data-size 都在这个分支里更新（漏掉它们会变成改了设置没反应）
  const key = `${curveKey(curve)}|${st.baseSize}|${st.fit}`;
  if (key !== st.lastCurveKey) {
    st.lastCurveKey = key;
    setVar(st, "--lp-wt", String(curve.weight));
    setVar(st, "--lp-sz", String(curve.size));
    setVar(st, "--lp-sp", `${curve.spacing}em`);
    setVar(st, "--lp-sk", `${curve.skew}deg`);
    setVar(st, "--lp-lift", `${curve.lift}px`);
    setVar(st, "--lp-inkv", String(curve.ink));
    st.elRoot.dataset.weight = String(curve.weight);
    st.elRoot.dataset.size = curve.size.toFixed(3);
    const read = `字 ${(st.baseSize * st.fit * curve.size).toFixed(1)} · ${curve.weight}`;
    if (st.elRead.textContent !== read) st.elRead.textContent = read;
  }
  // 行内进度单独判变化：安静的段落里曲线可能一帧都不变，但进度还在走
  const prog = String(ts.progressRatio(st.lines[st.cur], pos, ts.nextLineTime(st.lines, st.cur)));
  if (prog !== st.lastProg) {
    st.lastProg = prog;
    setVar(st, "--lp-progress", prog);
  }

  /* 3. 逐字点亮：只写**当前行**的字素，只写变了的档位 */
  paintUnits(st, pos);

  /* 4. HUD */
  paintHud(st, pos);
}

const curveKey = (c) =>
  `${c.weight}|${c.size}|${c.spacing}|${c.skew}|${c.lift}|${c.ink}`;

function readBands(st) {
  try {
    const snap = st.ctx.spectrum?.();
    const b = snap?.bands; // ★ 快照是 {bands, at}，不是裸数组
    return b && b.length ? b : null;
  } catch {
    return null;
  }
}

/* ==========================================================================
   换行 = 活字重排（FLIP）
   ========================================================================== */
function setCurrent(st, idx) {
  const prev = st.cur;
  const prevSlot = prev >= 0 ? st.slots.find((s) => s.i === prev) : null;
  // 1) 换行前：量下旧行的每个字素（同一个坐标系：列位移的过渡还没开始走）
  const fromRects = st.animations === false ? [] : prevSlot ? prevSlot.units.map((u) => rectIn(st.elCol, u)) : [];
  const prevUnits = prevSlot ? prevSlot.units.length : 0;

  st.cur = idx;
  const win = ts.windowFor(idx, st.total, HALF_WINDOW);
  repaintWindow(st, win);

  // 2) 换行后：量新行的每个字素，算位移（FLIP 的起点）
  if (fromRects.length && st.units.length) {
    const toRects = st.units.map((u) => rectIn(st.elCol, u));
    const deltas = ts.reflowDelta(fromRects, toRects);
    playReflow(st, deltas, ts.reflowMs(st.units.length));
  } else if (prevUnits) {
    // 静态档：不飞，但也要让"重排过"这件事留下痕迹（铅块短暂显形）
    markSet(st);
  }

  // 3) HUD / 可观测性
  if (idx >= 0) {
    st.elNum.textContent = `§ ${idx + 1} / ${st.total}`;
  } else {
    st.elNum.textContent = st.total ? `§ 前奏 / ${st.total}` : "";
  }
  st.elRoot.dataset.line = String(idx);
  st.elRoot.dataset.lit = String(st.units.length);
  st.elRoot.dataset.glyphs = String(st.units.length);
  setVar(st, "--lp-progress", "0");
}

/** 视窗滑动：槽位重新分配文字（只给变了的槽位写 DOM） */
function repaintWindow(st, win) {
  st.from = win.from;
  st.to = win.to;
  st.units = [];
  st.unitI = -1;
  st.gWritten = null;
  for (let k = 0; k < st.slots.length; k += 1) {
    const slot = st.slots[k];
    const i = win.from + k;
    if (i > win.to) {
      if (slot.i !== -1 || slot.depth !== -1) {
        slot.i = -1;
        slot.depth = -1;
        slot.el.dataset.i = "-1";
        slot.el.dataset.off = "1";
        slot.el.textContent = "";
        slot.units.length = 0;
      }
      continue;
    }
    slot.el.dataset.off = "0";
    const depth = ts.depthOf(i, st.cur);
    // 需要逐字素 span 的只有当前行：换行时既要"给新行装上"，也要"把旧行卸掉"，
    // 所以判据不是"行号变了"，而是"行号变了 **或** 它该不该是活字行"
    const wantUnits = i === st.cur ? 1 : 0;
    if (slot.i !== i || Number(slot.el.dataset.units || 0) !== wantUnits) paintSlot(st, slot, i);
    if (slot.depth !== depth) {
      slot.depth = depth;
      const d = ts.depthStyle(depth);
      setVarOn(slot.el, "--lp-ds", String(d.scale));
      setVarOn(slot.el, "--lp-di", String(d.ink));
      slot.el.dataset.depth = String(depth);
      slot.el.dataset.state = depth === 0 ? "active" : depth === 1 ? "near" : "far";
    }
    if (i === st.cur) {
      st.units = slot.units;
      st.unitI = i;
    }
  }
  // 列位移：只由 (cur - from) 决定 → 视窗滑动本身不动画面
  const leading = st.narrow ? Math.round(ts.CURVE.leading * 0.82) : ts.CURVE.leading;
  setVar(st, "--lp-shift", `${ts.columnShift(st.cur, st.from, leading)}px`);
  // 版口省略号：上面/下面还有多少行没排出来
  const above = Math.max(0, win.from);
  const below = Math.max(0, st.total - 1 - win.to);
  st.elElideTop.textContent = above ? `⋯ 前 ${above} 行` : "";
  st.elElideBottom.textContent = below ? `后 ${below} 行 ⋯` : "";
}

/**
 * 一个槽位的文字。**只有当前行**切成逐字素 span（其余行是纯文本）——
 * 逐字素属性绝不能给全文写：那是 N 行 × 20 字/帧。
 */
function paintSlot(st, slot, i) {
  const line = st.lines[i];
  slot.i = i;
  slot.el.dataset.i = String(i);
  slot.units.length = 0;
  slot.el.textContent = "";
  if (!line) {
    delete slot.el.dataset.units;
    return;
  }
  if (i === st.cur) {
    slot.el.dataset.units = "1";
    const frag = document.createDocumentFragment();
    const units = [];
    const n = line.graphemes.length;
    for (let u = 0; u < n; u += 1) {
      const s = document.createElement("span");
      s.className = "lp__u";
      s.dataset.u = String(u);
      s.textContent = line.graphemes[u];
      // 相位只在换行时写一次（每帧写 4 个轴属性 × 一行字是白烧）：
      // 轴值写在行根上，字素只带一个相位倍率
      s.style.setProperty("--lp-a", String(ts.unitPhase(u)));
      frag.appendChild(s);
      units.push(s);
    }
    slot.el.appendChild(frag);
    slot.units = units;
  } else {
    delete slot.el.dataset.units;
    slot.el.textContent = line.text;
  }
}

/** FLIP 播放：只动 transform（WAAPI，合成器动画，不碰布局） */
function playReflow(st, deltas, ms) {
  if (st.animations === false) {
    markSet(st);
    return;
  }
  const easing = "cubic-bezier(.2,.9,.2,1)";
  st.anims = st.anims.filter((a) => {
    try {
      return a.playState === "running";
    } catch {
      return false;
    }
  });
  for (let i = 0; i < st.units.length && i < deltas.length; i += 1) {
    const d = deltas[i];
    if (!d || (!d.dx && !d.dy && d.sx === 1 && d.sy === 1)) continue;
    const el = st.units[i];
    try {
      const a = el.animate(
        [
          { transform: `translate(${d.dx}px, ${d.dy}px) scale(${d.sx}, ${d.sy})`, opacity: 0.25 },
          { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 },
        ],
        { duration: ms, easing, fill: "none" }
      );
      st.anims.push(a);
    } catch {
      /* 不支持 WAAPI 就直接到位（画面依然正确） */
    }
  }
  markSet(st, ms);
}

/** "刚排好"：铅块短暂显形（CSS 靠 data-set 显示 .lp__u::after） */
function markSet(st, ms) {
  if (st.holdTimer) clearTimeout(st.holdTimer);
  st.elRoot.dataset.set = "1";
  st.composing = true;
  const hold = Number.isFinite(ms) && ms > 0 ? Math.min(ms, ts.CURVE.reflowMax) : ts.CURVE.setHoldMs;
  st.holdTimer = setTimeout(() => {
    st.holdTimer = 0;
    st.composing = false;
    if (st.alive && st.elRoot) delete st.elRoot.dataset.set;
  }, hold);
}

/** 相对容器的矩形（把容器的位移减掉：过渡中的列位移就不会污染 FLIP 的读数） */
function rectIn(container, el) {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
}

/* ==========================================================================
   逐字点亮
   ========================================================================== */
function paintUnits(st, pos) {
  if (!st.units.length) return;
  const line = st.lines[st.unitI];
  if (!line) return;
  const lits = ts.litFor(line, pos);
  if (!st.gWritten || st.gWritten.length !== lits.length) st.gWritten = new Array(lits.length).fill(-1);
  for (let i = 0; i < st.units.length; i += 1) {
    const v = Math.round(lits[i] * 100) / 100; // 量化到 1%：避免每帧都写
    if (st.gWritten[i] === v) continue;
    st.gWritten[i] = v;
    setVarOn(st.units[i], "--g", String(v));
  }
}

/* ==========================================================================
   HUD / 海报
   ========================================================================== */
function paintHud(st, pos) {
  const tc = ts.timecode(pos);
  if (st.lastTc !== tc) {
    st.lastTc = tc;
    st.elTc.textContent = st.duration ? `${tc} / ${ts.timecode(st.duration)}` : tc;
  }
}

function applyPoster(st) {
  if (!st.elPoster) return;
  st.elPosterTitle.textContent = st.lastTitle || "";
  st.elPosterSub.textContent = st.lastArtist || "";
}
