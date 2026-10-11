/* ==========================================================================
   深渊 abyss —— 第三方播放界面样式（契约 v3）
   --------------------------------------------------------------------------
   极限轴：**像素 / 着色器**。

   舞台是一缸缓慢流动的深水，歌词是**液面被压出的凹陷**（折射出来的，不是画上去的）：
     · canvas.ab__fluid   半分辨率 WebGL2 流场（ping-pong RGBA16F）：
                          频谱泵浦 → 流速/液面；封面 → 颜料密度场；
                          当前行文字 → 字形遮罩，梯度当法线压出凹陷
     · .ab__text          真歌词（宿主 SDK 的 `createLyricsView`，DOM 矢量）
     · .ab__surface       水面高光带（低频抬升，CSS）
     · .ab__vig           暗角 + 颗粒
     · .ab__hud           曲名 + 下潜深度读数（"− 1240 m"）
     · ctx.backgroundRoot 整窗底色（径向渐变 + 封面当"水里的颜料"）

   四条硬规矩（自检里逐条断言）：
     1. **一份排版渲染两次**：DOM 上的字是真的，遮罩里的字是量出来的 ——
        自检比"遮罩墨迹包围盒 vs DOM 文字包围盒"的差（真机 ≤ 2px）；
     2. 拿不到 `webgl2`、着色器编译失败、或**上下文丢了**，都必须**无缝**切
        Canvas2D 伪流体（双层位移贴图 + 遮罩暗刻），画面不许白屏；
     3. 一条 rAF（皮肤自己只开一个循环；GPU 计时器的结果在同一个循环里顺手取，
        不额外开 rAF，也不用 `gl.finish()` —— 探针 P1 证明它基本不等 GPU）；
     4. `destroy` 之后帧循环、GL 资源（含 `WEBGL_lose_context`）、监听器、计时器、
        自己的树、整窗背景层全部清干净。
   ========================================================================== */

const ID = "abyss";

/* 子模块必须透传入口的 ?t= 查询串（/skins/<id>/<file>?t=<token> 是宿主的同源托管路由，
   丢了 token 会 404；丢查询串还会让同一个模块被当成两个 URL 各加载一次）。 */
const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

let wa = null; // lib/water.js   —— 纯逻辑
let glm = null; // lib/gl.js     —— WebGL2 流场
let c2m = null; // lib/canvas2d.js —— 兜底
let mkm = null; // lib/mask.js   —— 字形遮罩

/** 暂停后多久停帧 */
const IDLE_STOP_MS = 6000;
/** 清单里的帧预算 */
const BUDGET_FPS = 45;
/** performance 档：1/3 分辨率 + 24fps（设计稿） */
const PERF_FPS = 24;
const PERF_TIER = "third";
/** 平滑档的档位上限：默认半分辨率，跑得动才升到全分辨率 */
const SMOOTH_TIER = "half";
const SMOOTH_CEIL = "full";
/** 视觉滞后（进度补丁 4Hz + 位置量化 250ms） */
const VISUAL_LAG_MS = 70;
/** 换歌涌浪时长 */
const SURGE_MS = 900;
/** 歌词行数上限 */
const MAX_LINES = 600;
/** 遮罩画布长边上限（4K + dpr2 下别上传一张 8MB 纹理） */
const MASK_EDGE = 2048;
const FONT_STACK = '"Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif';

const SHELL = `
  <canvas class="ab__fluid"></canvas>
  <canvas class="ab__soft"></canvas>
  <canvas class="ab__mask" hidden></canvas>
  <div class="ab__glow" aria-hidden="true"></div>
  <div class="ab__surface" aria-hidden="true"></div>
  <div class="ab__text"></div>
  <div class="ab__vig" aria-hidden="true"></div>
  <div class="ab__hud">
    <div class="ab__hud-top">
      <span class="ab__depth"></span>
      <span class="ab__hint"></span>
    </div>
    <div class="ab__hud-bottom">
      <span class="ab__title"></span>
      <span class="ab__tc"></span>
    </div>
  </div>
  <div class="ab__nogl" hidden>Canvas2D 伪流体</div>`;

const BG_SHELL = `
  <div class="abbg">
    <img class="abbg__img" alt="" />
    <div class="abbg__deep" aria-hidden="true"></div>
    <div class="abbg__caustics" aria-hidden="true"></div>
  </div>`;

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */
const nowMs = () => performance.now();

/** 只在变化时写（自定义属性每次写都会让样式失效） */
function setVar(st, name, value) {
  if (st.vars.get(name) === value) return;
  st.vars.set(name, value);
  st.elRoot.style.setProperty(name, value);
}

function mmss(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* --------------------------------------------------------------------------
   样式包本体
   -------------------------------------------------------------------------- */
let S = null;

export default {
  id: ID,

  async mount(ctx) {
    /* 0. 子模块（透传 ?t=） */
    if (!wa) {
      wa = await load("water.js");
      glm = await load("gl.js");
      c2m = await load("canvas2d.js");
      mkm = await load("mask.js");
    }

    const st = {
      ctx,
      alive: true,
      /* DOM */
      elRoot: null,
      elCanvas: null,
      elSoft: null,
      elMask: null,
      elText: null,
      elSurface: null,
      elGlow: null,
      elNogl: null,
      elDepth: null,
      elHint: null,
      elTitle: null,
      elTc: null,
      /* 背景层 */
      bgRoot: ctx.backgroundRoot || null,
      bgImg: null,
      /* 渲染器 */
      renderer: null,
      renderKind: "",
      tier: "half",
      tierStreak: 0,
      tierCap: SMOOTH_TIER,
      tierCeil: SMOOTH_CEIL,
      /* 数据 */
      track: null,
      lines: [],
      linesKey: "",
      cur: -1,
      duration: 0,
      title: "",
      cover: "",
      coverImg: null,
      coverPixels: null,
      maskKey: "",
      maskBox: null,
      domBox: null,
      /* 时钟 */
      pos: 0,
      clock: { pos: 0, at: 0, playing: false, maxExtrapolate: 1200, touched: false },
      /* 水 */
      pump: null,
      lift: 0,
      phase: 0,
      flowTime: 0,
      surgeAt0: 0,
      hasSpec: null,
      /* 文案缓存 */
      lastTc: "",
      lastDepth: "",
      lastTitle: "",
      lastHint: "",
      mode: ctx.mode === "light" ? "light" : "dark",
      /* 设置 */
      animations: true,
      interactive: true,
      performanceMode: "smooth",
      budgetFps: BUDGET_FPS,
      showLyrics: true,
      reducedMotion: false,
      /* 帧循环 */
      raf: 0,
      last: 0,
      lastFrame: 0,
      lastActive: nowMs(),
      idle: false,
      frames: 0,
      measLeft: 0,
      /* 其他 */
      vars: new Map(),
      rect: { w: 1, h: 1, dpr: 1 },
      narrow: false,
      backdropTimer: 0,
    };
    S = st;

    /* 1. 舞台骨架 */
    const root = document.createElement("div");
    root.className = "ab";
    root.style.fontFamily = FONT_STACK;
    root.innerHTML = SHELL;
    ctx.root.appendChild(root);
    st.elRoot = root;
    st.elCanvas = root.querySelector(".ab__fluid");
    st.elSoft = root.querySelector(".ab__soft");
    st.elMask = root.querySelector(".ab__mask");
    st.elText = root.querySelector(".ab__text");
    st.elSurface = root.querySelector(".ab__surface");
    st.elGlow = root.querySelector(".ab__glow");
    st.elNogl = root.querySelector(".ab__nogl");
    st.elDepth = root.querySelector(".ab__depth");
    st.elHint = root.querySelector(".ab__hint");
    st.elTitle = root.querySelector(".ab__title");
    st.elTc = root.querySelector(".ab__tc");

    /* 2. 清单配色（CSS 只认变量；shader 也从这里取色） */
    const c = (ctx.sdk && ctx.sdk.manifest && ctx.sdk.manifest.colors) || {};
    st.colors = {
      bg: wa.normHex(c.bg, "#04121b"),
      fg: wa.normHex(c.fg, "#dff2ff"),
      accent: wa.normHex(c.accent, "#58c7ff"),
    };
    st.rgb = { bg: wa.hexToRgb(st.colors.bg), fg: wa.hexToRgb(st.colors.fg), accent: wa.hexToRgb(st.colors.accent) };
    applyColors(st);

    /* 3. 整窗背景层（清单里 background:true ⇒ 这一层由本包负责） */
    buildBackground(st);

    /* 4. 环境 / 尺寸 / 歌词 / 遮罩 */
    applyEnv(st);
    if (!buildRenderer(st)) st.elRoot.dataset.gl = "0";
    resize(st);
    buildLyrics(st);

    /* 5. 交互：点水面 = 按 x 比例 seek */
    st.onClick = (ev) => {
      if (!st.alive || !st.interactive) return;
      // 歌词区里的点击归宿主 SDK（点某一行 = seek 到那一句），别在这里再按 x 算一次
      if (st.elText && ev.target && st.elText.contains(ev.target)) return;
      const r = st.elCanvas.getBoundingClientRect();
      if (!r.width) return;
      const frac = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const dur = st.duration || 0;
      const target = Math.round(frac * dur);
      try {
        st.ctx.actions?.seek?.(target);
      } catch {
        /* 宿主不实现就算了 */
      }
    };
    st.elRoot.addEventListener("click", st.onClick);

    /* 6. 首帧数据 */
    syncTrack(st, ctx);
    syncLines(st, { force: true });
    syncProgress(st, ctx);
    st.clock.at = nowMs();
    st.phase = 0;
    st.flowTime = 0;
    if (st.animations === false) renderFrame(st, nowMs(), 0);
    else wake(st);

    /* 7. 上报宿主壳配色（防抖一次） */
    st.backdropTimer = setTimeout(() => {
      st.backdropTimer = 0;
      if (!st.alive) return;
      try {
        st.ctx.actions?.reportBackdrop?.({ bg: st.colors.bg, fg: st.colors.fg, accent: st.colors.accent });
      } catch {
        /* 宿主没实现就算了 */
      }
    }, 400);
  },

  /** 契约签名是 update(ctx, patch) */
  update(ctx, patch) {
    const st = S;
    if (!patch || typeof patch.type !== "string") return;
    if (!st || !st.alive) return;
    if (ctx && ctx !== st.ctx) st.ctx = ctx;
    switch (patch.type) {
      case "mount":
        break;
      case "song":
      case "media":
        syncTrack(st, st.ctx);
        syncLines(st, { force: true });
        syncProgress(st, st.ctx);
        surge(st); // 换歌：水面一次涌浪
        wake(st);
        break;
      case "lyrics":
        syncLines(st, { force: true });
        syncProgress(st, st.ctx);
        wake(st);
        break;
      case "progress": {
        const p = patch.patch || patch;
        if (typeof p.position === "number") {
          st.clock.pos = p.position;
          st.clock.at = nowMs();
          st.clock.touched = true;
        }
        if (typeof p.duration === "number") st.duration = p.duration;
        if (typeof p.playing === "boolean") setPlaying(st, p.playing);
        if (st.animations === false) renderFrame(st, nowMs(), 0);
        break;
      }
      case "state": {
        const p = patch.patch || patch;
        if (typeof p.playing === "boolean") setPlaying(st, p.playing);
        wake(st);
        break;
      }
      case "options":
        applyEnv(st);
        syncLines(st, { force: true });
        resize(st);
        wake(st);
        break;
      case "theme": {
        const p = patch.patch || patch;
        st.mode = p.mode || p.themeId || st.mode;
        st.elRoot.dataset.mode = st.mode === "light" ? "light" : "dark";
        break;
      }
      case "resize":
        resize(st);
        if (st.animations === false) renderFrame(st, nowMs(), 0);
        break;
      case "visibility": {
        const p = patch.patch || patch;
        const fg = p.foreground !== false;
        st.elRoot.dataset.foreground = fg ? "1" : "0";
        if (!fg) stop(st);
        else wake(st);
        break;
      }
      case "chrome":
        break;
      case "close":
        stop(st);
        st.elRoot.dataset.closed = "1";
        break;
      case "destroy":
        destroySkin(st);
        break;
      default:
        break;
    }
  },

  /* 契约签名是 destroy(ctx)。模块是单例（真机一次只挂一个样式），卸载的就是当前实例。 */
  destroy(ctx) {
    void ctx;
    const st = S;
    if (!st) return;
    destroySkin(st);
  },
};

/* ==========================================================================
   配色 / 背景层
   ========================================================================== */
function applyColors(st) {
  setVar(st, "--ab-bg", st.colors.bg);
  setVar(st, "--ab-fg", st.colors.fg);
  setVar(st, "--ab-accent", st.colors.accent);
  setVar(st, "--ab-bg-60", wa.rgba(st.colors.bg, 0.6));
  setVar(st, "--ab-bg-85", wa.rgba(st.colors.bg, 0.85));
  setVar(st, "--ab-accent-35", wa.rgba(st.colors.accent, 0.35));
  setVar(st, "--ab-accent-18", wa.rgba(st.colors.accent, 0.18));
  setVar(st, "--ab-fg-90", wa.rgba(st.colors.fg, 0.9));
  setVar(st, "--ab-fg-55", wa.rgba(st.colors.fg, 0.55));
}

function buildBackground(st) {
  const bgRoot = st.bgRoot;
  if (!bgRoot) return;
  bgRoot.hidden = false;
  bgRoot.dataset.skin = ID;
  bgRoot.innerHTML = BG_SHELL;
  st.bgImg = bgRoot.querySelector(".abbg__img");
  st.elBg = bgRoot.querySelector(".abbg");
}

/**
 * 背景层**不在** `.ab` 里（它是宿主给的另一个容器），所以 `.ab[data-x] .abbg__caustics`
 * 这种选择器根本匹配不到 —— 状态要镜像到 `.abbg` 自己身上再写规则。
 */
function syncBgState(st) {
  const el = st.elBg;
  if (!el) return;
  el.dataset.animations = st.animations ? "1" : "0";
  el.dataset.lowMotion = st.reducedMotion ? "1" : "0";
  el.dataset.perf = st.performanceMode === "performance" ? "1" : "0";
  if (st.idle) el.dataset.idle = "1";
  else delete el.dataset.idle;
}

function setCover(st, src) {
  const url = src || st.ctx.defaultCover || "";
  if (!url || url === st.cover) return;
  st.cover = url;
  if (st.bgImg && st.bgImg.getAttribute("src") !== url) {
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
  st.elRoot.dataset.cover = "1";
  sampleCover(st, url);
}

/**
 * 封面 → 两份料：
 *   · 一张 64×64 采样 → 256×256 密度场（GL 的"颜料"纹理）
 *   · 一个真 Image（Canvas2D 兜底的双层位移贴图要直接 drawImage）
 * 封面是 data URL 或同源 `/online/cover`，画布不会被 taint（P5 已在真机验过）。
 */
function sampleCover(st, url) {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    if (!st.alive) return;
    try {
      const cv = document.createElement("canvas");
      cv.width = 64;
      cv.height = 64;
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, 64, 64);
      const px = g.getImageData(0, 0, 64, 64).data;
      st.coverPixels = wa.densityFromCover(px, 64, 256);
      st.coverSrc = px;
      st.renderer?.setCover?.(st.coverPixels, 256);
      st.elRoot.dataset.coverReady = "1";
    } catch {
      st.elRoot.dataset.coverReady = "0";
    }
  };
  img.onerror = () => {
    if (st.alive) st.elRoot.dataset.coverReady = "0";
  };
  img.src = url;
  st.coverImg = img;
  // 兜底渲染器直接吃这张图（GL 那边用采样出来的密度场）
  if (st.renderKind === "2d") st.renderer?.setCover?.(img);
}

/* ==========================================================================
   渲染器：WebGL2 → Canvas2D 兜底
   ========================================================================== */
function buildRenderer(st) {
  const made = glm.createGL(st.elCanvas, { flowSize: wa.flowSize });
  if (made && made.ok) {
    st.renderer = made;
    st.renderKind = "gl";
    st.elRoot.dataset.gl = "1";
    st.elRoot.dataset.render = "gl";
    st.elRoot.dataset.halfFloat = made.halfFloat ? "1" : "0";
    st.elRoot.dataset.timer = made.timer ? "1" : "0";
    // 上下文丢了：立刻切兜底（画面不许白屏）
    st.onLost = (ev) => {
      try {
        ev.preventDefault();
      } catch {
        /* 老引擎 */
      }
      if (!st.alive) return;
      dropRenderer(st);
      st.elRoot.dataset.glLost = "1";
      if (buildFallback(st)) {
        resize(st);
        if (st.animations === false) renderFrame(st, nowMs(), 0);
        else wake(st);
      }
    };
    st.elCanvas.addEventListener("webglcontextlost", st.onLost, false);
    return true;
  }
  st.glError = made && made.error ? String(made.error) : "no-webgl2";
  if (buildFallback(st)) return true;
  return false;
}

function buildFallback(st) {
  /* 兜底必须用**另一张** canvas：一个 canvas 一辈子只能有一种上下文，
     `.ab__fluid` 已经拿过 webgl2 了，再问它要 "2d" 只会拿到 null
     （丢上下文之后也一样）。两张画布都用 visibility 切换，布局盒子始终一致。 */
  const made = c2m.create2D(st.elSoft);
  if (!made || !made.ok) return false;
  st.renderer = made;
  st.renderKind = "2d";
  st.tier = "third";
  st.elRoot.dataset.gl = "0";
  st.elRoot.dataset.render = "2d";
  st.elRoot.dataset.fallback = "1";
  st.elNogl.hidden = false;
  if (st.coverImg) st.renderer.setCover(st.coverImg);
  return true;
}

function dropRenderer(st) {
  if (st.onLost) {
    st.elCanvas?.removeEventListener("webglcontextlost", st.onLost);
    st.onLost = null;
  }
  try {
    st.renderer?.dispose?.();
  } catch {
    /* 已经没了 */
  }
  st.renderer = null;
  st.renderKind = "";
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
  st.animations = opts?.animations !== false && env?.reducedMotion !== true;
  st.reducedMotion = env?.reducedMotion === true;
  st.interactive = st.ctx.interactive !== false && opts?.interactive !== false;
  st.performanceMode = opts?.performanceMode || "smooth";
  st.budgetFps = Number.isFinite(opts?.budgetFps) && opts.budgetFps > 0 ? opts.budgetFps : BUDGET_FPS;
  st.showLyrics = opts?.showLyrics !== false;
  st.tierCap = st.performanceMode === "performance" ? PERF_TIER : SMOOTH_TIER;
  st.tierCeil = st.performanceMode === "performance" ? PERF_TIER : SMOOTH_CEIL;
  // performance 档直接落到 1/3；切回平滑档时先从半分辨率起步（别一上来就全分辨率）
  if (st.performanceMode === "performance") st.tier = PERF_TIER;
  else if (st.tier === PERF_TIER) st.tier = SMOOTH_TIER;

  st.elRoot.dataset.animations = st.animations ? "1" : "0";
  st.elRoot.dataset.interactive = st.interactive ? "1" : "0";
  st.elRoot.dataset.perf = st.performanceMode === "performance" ? "1" : "0";
  st.elRoot.dataset.lowMotion = st.reducedMotion ? "1" : "0";
  st.elRoot.dataset.showLyrics = st.showLyrics ? "1" : "0";
  st.elRoot.dataset.mode = st.mode === "light" ? "light" : "dark";
  syncBgState(st);
  if (st.view) st.view.element.dataset.passive = st.interactive ? "0" : "1";
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
  st.narrow = w < 900;
  setVar(st, "--ab-w", `${w}px`);
  setVar(st, "--ab-h", `${h}px`);
  st.elRoot.dataset.narrow = st.narrow ? "1" : "0";
  st.elRoot.dataset.dpr = String(dpr);
  st.rect = { w, h, dpr };

  const size = st.renderer?.resize?.(w, h, dpr, st.tier);
  if (size) {
    st.tier = st.renderKind === "2d" ? "third" : st.tier;
    st.elRoot.dataset.tier = st.renderKind === "2d" ? "fallback" : st.tier;
    st.elRoot.dataset.flow = `${size.w}x${size.h}`;
    if (size.ok === false) {
      // FBO 不完整：GL 这条路走不通，切兜底（不许白屏）
      st.elRoot.dataset.glFbo = String(size.status || 0);
      dropRenderer(st);
      buildFallback(st);
      st.renderer?.resize?.(w, h, dpr, "third");
    }
  }
  // 尺寸变了：遮罩要重画（坐标全变了）
  st.maskKey = "";
  refreshMask(st, true);
}

/* ==========================================================================
   歌词 / 掩膜
   ========================================================================== */
function buildLyrics(st) {
  const sdk = st.ctx.sdk || {};
  if (typeof sdk.createLyricsView !== "function") {
    st.elRoot.dataset.noSdk = "1";
    return;
  }
  st.view = sdk.createLyricsView(st.elText, {
    escape: sdk.html?.escapeHtml,
    interactive: st.interactive,
    onSeek: (ms) => {
      try {
        st.ctx.actions?.seek?.(ms);
      } catch {
        /* 宿主不实现就算了 */
      }
    },
    onOpenFolder: () => {
      try {
        st.ctx.actions?.openFolder?.();
      } catch {
        /* 宿主不实现就算了 */
      }
    },
  });
  if (st.view) st.view.element.dataset.passive = st.interactive ? "0" : "1";
}

function syncTrack(st, ctx) {
  try {
    st.track = ctx.track?.() || null;
  } catch {
    st.track = null;
  }
  let media = null;
  try {
    media = ctx.media?.() || null;
  } catch {
    media = null;
  }
  setCover(st, media?.cover || "");
  if (!st.cover) {
    try {
      setCover(st, ctx.covers?.()?.current || "");
    } catch {
      /* 拿不到就算了 */
    }
  }
  const title = st.track?.title || media?.title || "";
  if (title !== st.lastTitle) {
    st.lastTitle = title;
    st.elTitle.textContent = title || "未知曲目";
  }
}

function syncLines(st, { force } = {}) {
  let lyrics = null;
  try {
    lyrics = st.ctx.lyrics?.() || null;
  } catch {
    lyrics = null;
  }
  const raw = Array.isArray(lyrics?.lines) ? lyrics.lines.slice(0, MAX_LINES) : [];
  const lines = raw
    .map((l) => {
      const starts = Array.isArray(l?.words) ? l.words.map(Number) : null;
      const words = starts && starts.length && starts.every((n) => Number.isFinite(n)) ? starts : null;
      return { time: Number.isFinite(l?.time) ? l.time : 0, text: String(l?.text ?? ""), words, trans: l?.trans };
    })
    .filter((l) => l.text.trim().length > 0);
  const key = lines.map((l) => `${l.time}|${l.text}|${l.words ? l.words.join(",") : ""}`).join("\u0001");
  if (!force && key === st.linesKey) return;
  st.linesKey = key;
  st.lines = lines;
  st.cur = -1;
  st.maskKey = "";
  st.elRoot.dataset.total = String(lines.length);
  st.elRoot.dataset.empty = lines.length ? "0" : "1";
  if (st.view) {
    st.view.setLines(lines, {
      emptyText: "暂无歌词",
      emptyHint: "水面仍在流动",
      showOpenFolder: true,
    });
  }
  refreshMask(st, true);
}

/** 当前行号：二分查找（`lyrics().index` 是阶跃量，4Hz 才更新，不能当连续量用） */
function lineIndexAt(st, pos) {
  const L = st.lines;
  if (!L.length) return -1;
  let lo = 0;
  let hi = L.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (L[mid].time <= pos) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** 当前行的 DOM 元素（宿主 SDK 会给当前行加 aria-current） */
function activeLineEl(st) {
  const host = st.view?.element || st.elText;
  if (!host) return null;
  return host.querySelector('.lyric[aria-current="true"]') || host.querySelector(`.lyric[data-lyric-index="${st.cur}"]`) || null;
}

/**
 * 字形遮罩：**每行只画一次**（不是每帧）。
 * 行号 / 文本 / 画布尺寸都不变就直接返回 —— 逐帧重画一张全舞台的画布纯属浪费。
 */
function refreshMask(st, force) {
  if (!mkm || !st.elMask) return;
  const idx = st.cur;
  const text = idx >= 0 && st.lines[idx] ? st.lines[idx].text : "";
  const cssW = Math.max(1, Math.round(st.elCanvas.clientWidth || st.rect.w));
  const cssH = Math.max(1, Math.round(st.elCanvas.clientHeight || st.rect.h));
  const key = `${wa.maskKey(idx, text, cssW, cssH)}|${force ? "f" : ""}|${st.rect.dpr}`;
  const lineEl = idx >= 0 ? activeLineEl(st) : null;
  if (!force && key === st.maskKey && lineEl) return;
  if (!lineEl || !text) {
    // 没有当前行：遮罩清空（水面不该有一块假的凹陷）
    const g = st.elMask.getContext("2d");
    if (g) {
      st.elMask.width = Math.max(1, cssW);
      st.elMask.height = Math.max(1, cssH);
      g.clearRect(0, 0, st.elMask.width, st.elMask.height);
    }
    st.maskKey = key;
    st.maskBox = null;
    st.domBox = null;
    st.renderer?.setMask?.(st.elMask);
    st.elRoot.dataset.mask = "0";
    return;
  }
  let out = null;
  try {
    out = mkm.paintMask(st.elMask, st.elCanvas, lineEl, st.rect.dpr, { cssW, cssH, maxEdge: MASK_EDGE, maskPlan: wa.maskPlan });
  } catch {
    out = null;
  }
  st.maskKey = key;
  if (out) {
    st.maskBox = out.box;
    st.domBox = mkm.domTextBox(lineEl, st.elCanvas, out.scale);
    st.renderer?.setMask?.(st.elMask);
    st.maskRev = (st.maskRev || 0) + 1;
    st.elRoot.dataset.maskrev = String(st.maskRev);
    st.elRoot.dataset.mask = String(out.items);
    st.elRoot.dataset.maskscale = String(out.scale.toFixed(3));
    if (out.box && st.domBox) {
      const d = Math.max(
        Math.abs(out.box.l - st.domBox.l),
        Math.abs(out.box.t - st.domBox.t),
        Math.abs(out.box.r - st.domBox.r),
        Math.abs(out.box.b - st.domBox.b)
      );
      st.elRoot.dataset.maskerr = String(Math.round(d));
    }
  } else {
    st.elRoot.dataset.mask = "0";
  }
}

/* ==========================================================================
   时钟 / 数据
   ========================================================================== */
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
      if (Number.isFinite(pb.duration)) st.duration = pb.duration;
    }
  } catch {
    /* 拿不到就用手上的 */
  }
  st.elRoot.dataset.playing = st.clock.playing ? "1" : "0";
  st.lastActive = nowMs();
}

function setPlaying(st, playing) {
  st.clock.playing = !!playing;
  st.clock.at = nowMs();
  st.elRoot.dataset.playing = playing ? "1" : "0";
  if (playing) {
    st.lastActive = nowMs();
    wake(st);
  }
}

/** 换歌涌浪：整屏一次折射偏移 */
function surge(st) {
  st.surgeAt0 = nowMs();
  st.elRoot.dataset.surge = "1";
}

/** 时钟外推：进度补丁 4Hz + 250ms 量化，不插值就会一顿一顿 */
function positionAt(st, now) {
  const base = st.clock.pos;
  if (!st.clock.playing) return base;
  const add = Math.max(0, Math.min(now - st.clock.at, st.clock.maxExtrapolate));
  return base + add;
}

/* ==========================================================================
   帧循环
   ========================================================================== */
function wake(st) {
  if (!st.alive || st.raf) return;
  if (st.animations === false) return; // 静态档不进循环
  st.idle = false;
  delete st.elRoot.dataset.idle;
  syncBgState(st);
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
  /* wall 管**调度**（限帧、闲置看门狗、GPU 计时窗口）；dt 管**水**（相位积分）。
     水的相位不能拿歌曲位置当相位：进度补丁 4Hz + 250ms 量化，直接喂会一顿一顿。 */
  const wall = nowMs();
  const dtMs = st.last ? Math.min(200, wall - st.last) : 16;
  const fps = st.performanceMode === "performance" ? Math.min(st.budgetFps, PERF_FPS) : 0;
  const budget = fps > 0 ? 1000 / fps : 0;
  if (budget > 0 && st.lastFrame && wall - st.lastFrame < budget) {
    st.raf = requestAnimationFrame(() => frame(st));
    return;
  }
  // GPU 计时窗口（30 帧一个窗口；结果在 pollMeasure 里顺手取，不额外开 rAF）
  if (st.renderKind === "gl" && st.renderer?.timer) {
    if (st.measLeft === 0) {
      if (st.renderer.beginMeasure()) st.measLeft = 30;
    } else if (st.measLeft === 1) {
      st.renderer.endMeasure();
    }
    if (st.measLeft > 0) st.measLeft -= 1;
  }
  st.lastFrame = wall;
  st.last = wall;
  renderFrame(st, wall, dtMs);
  if (st.animations === false) return;
  if (!st.clock.playing && wall - st.lastActive > IDLE_STOP_MS) {
    st.idle = true;
    st.elRoot.dataset.idle = "1";
    syncBgState(st);
    return;
  }
  st.raf = requestAnimationFrame(() => frame(st));
}

function renderFrame(st, wall, dtMs) {
  st.frames += 1;
  const now = positionAt(st, wall);

  /* ---- 1. 频谱 → 泵浦（相对量，音量无关） ---- */
  let spec = null;
  try {
    spec = st.ctx.spectrum?.() || null;
  } catch {
    spec = null;
  }
  const bands = spec && spec.bands ? spec.bands : null;
  const hasSpec = !!bands;
  if (hasSpec !== st.hasSpec) {
    st.hasSpec = hasSpec;
    st.elRoot.dataset.spec = hasSpec ? "1" : "0";
    st.elHint.textContent = hasSpec ? "" : "无频谱 · 水面静止";
  }
  st.pump = wa.pumpOf(bands, st.pump);
  st.lift = wa.liftOf(st.pump, st.lift, 0.18);
  const speed = wa.flowSpeed(st.clock.playing, st.lift);
  st.phase = wa.pumpPhase(st.phase, dtMs, speed);
  st.flowTime += (dtMs / 1000) * (0.4 + st.lift * 1.1);
  const surgeV = wa.surgeAt(st.surgeAt0, wall, SURGE_MS);
  if (surgeV <= 0.001 && st.elRoot.dataset.surge === "1") {
    delete st.elRoot.dataset.surge;
    st.elRoot.dataset.surge = "0";
  }

  /* ---- 2. CSS 侧的水（表面带高度 / 光晕 / 颗粒） ---- */
  setVar(st, "--ab-lift", st.lift.toFixed(3));
  setVar(st, "--ab-turb", st.pump.turb.toFixed(3));
  setVar(st, "--ab-foam", st.pump.foam.toFixed(3));
  setVar(st, "--ab-phase", `${Math.round(st.phase * 100) / 100}rad`);
  setVar(st, "--ab-surge", surgeV.toFixed(3));
  st.elRoot.dataset.flowState = st.clock.playing ? "flowing" : "still";

  /* ---- 3. 歌词：当前行 + 逐字（每帧喂外推位置；playing:false 让 SDK 不开自己的循环） ---- */
  const pos = now + VISUAL_LAG_MS;
  st.pos = now;
  if (st.view && st.lines.length) {
    st.view.setPosition(pos, { playing: false });
    const idx = lineIndexAt(st, pos);
    if (idx !== st.cur) {
      st.cur = idx;
      st.elRoot.dataset.line = String(idx);
      refreshMask(st, false);
    }
  } else if (st.cur !== -1) {
    st.cur = -1;
    st.elRoot.dataset.line = "-1";
    refreshMask(st, false);
  }

  /* ---- 4. 交给渲染器（GL 或兜底） ---- */
  const u = {
    time: st.flowTime,
    lift: st.lift,
    turb: st.pump.turb,
    foam: st.pump.foam,
    surge: surgeV,
    diss: st.clock.playing ? 0.986 : 0.972,
    forceX: Math.cos(st.phase) * (0.25 + st.lift * 0.9),
    forceY: Math.sin(st.phase * 0.7) * (0.18 + st.lift * 0.6),
    bg: st.rgb.bg,
    fg: st.rgb.fg,
    accent: st.rgb.accent,
  };
  try {
    st.renderer?.frame?.(u);
  } catch {
    st.elRoot.dataset.glFail = "1";
  }
  const stats = st.renderer?.stats;
  if (stats) {
    if (st.lastMeas !== stats.samples) {
      st.lastMeas = stats.samples;
      st.elRoot.dataset.meas = String(stats.samples); // 完成了几个计时窗口（诚实暴露）
    }
    if (st.lastDraws !== stats.draws) {
      st.lastDraws = stats.draws;
      st.elRoot.dataset.draws = String(stats.draws);
    }
    if (st.lastGlerr !== stats.errors) {
      st.lastGlerr = stats.errors;
      st.elRoot.dataset.glerr = String(stats.errors);
      st.elRoot.dataset.glerrcode = String(stats.lastError || 0);
    }
  }

  /* ---- 5. 自适应降级：拿真实 GPU 时间（没有计时器扩展就不自吹） ---- */
  const avg = st.renderer?.pollMeasure?.();
  if (Number.isFinite(avg) && avg >= 0) {
    st.elRoot.dataset.glms = avg.toFixed(2);
    const next = wa.nextTier(avg, { tier: st.tier, streak: st.tierStreak }, { floor: PERF_TIER, ceil: st.tierCeil, slowMs: 33, fastMs: 8 });
    st.tierStreak = next.streak;
    if (next.moved !== 0 && next.tier !== st.tier) {
      st.tier = next.tier;
      st.elRoot.dataset.tier = st.tier;
      st.elRoot.dataset.tierMove = next.moved > 0 ? "down" : "up";
      const size = st.renderer.resize?.(st.rect.w, st.rect.h, st.rect.dpr, st.tier);
      if (size) st.elRoot.dataset.flow = `${size.w}x${size.h}`;
    }
  }

  /* ---- 6. 读数：下潜深度 + 时间码 ---- */
  const depth = wa.depthOf(now, st.duration);
  if (depth.text !== st.lastDepth) {
    st.lastDepth = depth.text;
    st.elDepth.textContent = depth.text;
  }
  st.elRoot.dataset.depth = String(depth.m);
  const tc = `${mmss(now)} / ${mmss(st.duration)}`;
  if (tc !== st.lastTc) {
    st.lastTc = tc;
    st.elTc.textContent = tc;
  }
}

/* ==========================================================================
   卸载
   ========================================================================== */
function destroySkin(st) {
  if (!st.alive) return;
  st.alive = false;
  stop(st);
  if (st.backdropTimer) clearTimeout(st.backdropTimer);
  st.backdropTimer = 0;
  if (st.view) {
    try {
      st.view.destroy();
    } catch {
      /* 视图自己已经清过 */
    }
    st.view = null;
  }
  if (st.onClick) st.elRoot?.removeEventListener("click", st.onClick);
  st.onClick = null;
  // GL 资源（含 WEBGL_lose_context）+ 兜底画布
  dropRenderer(st);
  st.coverPixels = null;
  st.coverSrc = null;
  st.coverImg = null;
  st.lines = [];
  st.pump = null;
  if (st.elMask) {
    const g = st.elMask.getContext("2d");
    if (g) g.clearRect(0, 0, st.elMask.width, st.elMask.height);
    st.elMask.remove();
    st.elMask = null;
  }
  if (st.elRoot) {
    st.elRoot.remove();
    st.elRoot = null;
  }
  // 整窗背景层：挂载时是我们填的，卸载时必须自己清干净（清单 background:true）
  if (st.bgRoot) {
    st.bgRoot.innerHTML = "";
    st.bgRoot.hidden = true;
    st.bgRoot.dataset.skin = "";
    st.bgRoot = null;
  }
  st.bgImg = null;
  if (S === st) S = null;
}
