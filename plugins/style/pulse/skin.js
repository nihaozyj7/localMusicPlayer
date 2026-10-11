/* ==========================================================================
   心跳 pulse —— 第三方播放界面样式（契约 v3）
   --------------------------------------------------------------------------
   极限轴：**同步 / 预测**。宿主给的料很少、很难看：
     · 频谱 30Hz（`ctx.spectrum()` 拉取式，静音或后端没起来时是 null）
     · 进度 4Hz，而且位置被量化到 250ms
   这一款要在这两块料上做"音画同拍"：自己算 onset、自己估 BPM、自己预测拍点，
   然后把**歌词行切换**柔性吸附到预测拍点上，还把拍点画成示波器上的网格。

   画面：一台老式心电示波器。
     · canvas：过去 6 秒的能量包络（向上长）+ 谱质心轨迹（上方窄带）+ flux 闸门（基线下方）
     · DOM 拍点网格：预测拍点的竖线，**跟着窗口一起平移**（每帧只写一次位移量）
     · DOM 字级轨道：当前行每个字素的时刻刻度，落在拍点上的那些会"吸"上去
     · 两侧机械齿轮：转速与相位由 PLL 决定（用 CSS animation + 负 delay 对齐，
       所以**不需要**每帧写角度）
     · 歌词：复用宿主 SDK 的 `createLyricsView`（按契约用它，不自己造一套）

   四条硬规矩（自检里逐条断言）：
     1. **不谎报 BPM**：拍点不稳（间隔变异系数 ≥ 0.34）或拿不到频谱时，如实显示
        「自由节拍」，绝不显示一个假的数字；
     2. 负延迟补偿：脉冲峰值出现在**预测拍点之前** 40ms（人眼/显示链路都要提前量）；
     3. 一条 rAF（皮肤自己只开一个循环）。SDK 的歌词平滑推进我们**不用**：
        我们每帧自己喂一个墙钟外推过的位置（`playing:false`），
        所以整屏只有本文件这一个 rAF；
     4. `destroy` 之后：帧循环、歌词视图、监听器、队列、挂载点全部清干净，
        且一个字节都不碰 `backgroundRoot`（清单里 `background:false`）。
   ========================================================================== */

const ID = "pulse";

/* 子模块必须透传入口的 ?t= 查询串（/skins/<id>/<file>?t=<token> 是宿主的同源托管路由，
   丢了 token 会 404；丢查询串还会让同一个模块被当成两个 URL 各加载一次）。 */
const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

let bt = null; // lib/beat.js  —— 检测 / PLL / 相位
let sc = null; // lib/scope.js —— 纯几何

/** 暂停后多久停帧（宿主进度补丁 4Hz，停帧前留够余量） */
const IDLE_STOP_MS = 6000;
/** 清单里的帧预算（performance 档取 min(清单, PERF_FPS)） */
const BUDGET_FPS = 60;
/** performance 档的降采样：设计稿要求 15Hz（比清单的 60 更严，取小） */
const PERF_FPS = 15;
/** 视觉滞后：进度补丁 4Hz + 位置量化 250ms，往前看一眼才不显得慢半拍 */
const VISUAL_LAG_MS = 70;
/** 歌词行数上限 */
const MAX_LINES = 600;
/** 拍点标记池：x 的参考窗口是**双倍**（12 秒，保证一个周期里"过去的 6 秒"都有元素），
    最快 180BPM 时 12 秒 = 36 个拍点，留 40 个 */
const MAX_MARKS = 40;
/** 字级刻度池（一行最多 64 个字素） */
const MAX_TICKS = 64;
const FONT_STACK = '"Cascadia Mono", Consolas, "DejaVu Sans Mono", "Courier New", monospace';

const SHELL = `
  <div class="pl__scope">
    <canvas class="pl__cv"></canvas>
    <div class="pl__beats"></div>
    <div class="pl__rail"></div>
    <div class="pl__sweep"></div>
    <div class="pl__nospec" hidden>无频谱 · 自由节拍</div>
  </div>
  <div class="pl__grid"></div>
  <div class="pl__gears">
    <i class="pl__gear pl__gear--l"></i>
    <i class="pl__gear pl__gear--r"></i>
  </div>
  <div class="pl__lyrics"></div>
  <div class="pl__hud">
    <div class="pl__hud-top">
      <span class="pl__bpm"></span>
      <span class="pl__hint"></span>
    </div>
    <div class="pl__hud-bottom">
      <span class="pl__title"></span>
      <span class="pl__phase"></span>
      <span class="pl__tc"></span>
    </div>
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
function setVarOn(el, name, value) {
  if (el.__v && el.__v[name] === value) return;
  if (!el.__v) el.__v = Object.create(null);
  el.__v[name] = value;
  el.style.setProperty(name, value);
}

/* --------------------------------------------------------------------------
   样式包本体
   -------------------------------------------------------------------------- */
let S = null;

export default {
  id: ID,

  async mount(ctx) {
    /* 0. 子模块（透传 ?t=） */
    if (!bt) {
      bt = await load("beat.js");
      sc = await load("scope.js");
    }

    const st = {
      ctx,
      alive: true,
      /* DOM */
      elRoot: null,
      elScope: null,
      elCanvas: null,
      ctx2d: null,
      elBeats: null,
      elRail: null,
      elNospec: null,
      elGears: null,
      elLyrics: null,
      elBpm: null,
      elHint: null,
      elTitle: null,
      elPhase: null,
      elTc: null,
      marks: [],
      ticks: [],
      /* 数据 */
      track: null,
      lines: [],
      linesKey: "",
      cur: -1,
      duration: 0,
      title: "",
      mode: ctx.mode === "light" ? "light" : "dark",
      /* 时钟 */
      pos: 0,
      clock: { pos: 0, at: 0, playing: false, maxExtrapolate: 1200, touched: false },
      /* 拍点 */
      pll: bt.createPll(),
      series: bt.createSeries(),
      layout: sc.layoutOf(1, 1),
      tRef: 0,
      marksKey: "",
      railKey: "",
      lastSlide: null,
      mode: "",
      lastLabel: "",
      lastHint: "",
      lastTc: "",
      lastPhase: "",
      hasSpec: true,
      noSpecSince: 0,
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
      /* 渲染 */
      vars: new Map(),
      view: null,
      rect: { w: 1, h: 1, dpr: 1 },
      backdropTimer: 0,
    };
    S = st;

    /* 1. 舞台骨架（ctx.root 由宿主提供并在挂载前清空） */
    const root = document.createElement("div");
    root.className = "pl";
    root.style.fontFamily = FONT_STACK;
    root.innerHTML = SHELL;
    ctx.root.appendChild(root);
    st.elRoot = root;
    st.elScope = root.querySelector(".pl__scope");
    st.elCanvas = root.querySelector(".pl__cv");
    st.elBeats = root.querySelector(".pl__beats");
    st.elRail = root.querySelector(".pl__rail");
    st.elNospec = root.querySelector(".pl__nospec");
    st.elGears = root.querySelector(".pl__gears");
    st.elLyrics = root.querySelector(".pl__lyrics");
    st.elBpm = root.querySelector(".pl__bpm");
    st.elHint = root.querySelector(".pl__hint");
    st.elTitle = root.querySelector(".pl__title");
    st.elPhase = root.querySelector(".pl__phase");
    st.elTc = root.querySelector(".pl__tc");

    /* 2. 清单配色落到变量上（CSS 只认变量；canvas 也从这里取色） */
    const c = (ctx.sdk && ctx.sdk.manifest && ctx.sdk.manifest.colors) || {};
    st.colors = {
      bg: sc.normHex(c.bg, "#05070a"),
      fg: sc.normHex(c.fg, "#7cfc9b"),
      accent: sc.normHex(c.accent, "#7cfc9b"),
    };
    applyColors(st);

    /* 3. 标记池（DOM 一次建好，之后只写变量） */
    buildPool(st);

    /* 4. 环境 / 尺寸 / 歌词视图 */
    applyEnv(st);
    resize(st);
    buildLyrics(st);

    /* 5. 交互：点波形 = seek 到那一刻（整块示波器都是命中区） */
    st.onClick = (ev) => {
      if (!st.alive || !st.interactive) return;
      const r = st.elScope.getBoundingClientRect();
      const x = ev.clientX - r.left;
      const L = st.layout;
      const frac = L.plotW > 0 ? (x - L.left) / L.plotW : 0;
      /* 屏幕左端 = 6 秒前，右端 = 现在（与 canvas、与拍点标记同一套口径，都在歌曲时间里） */
      const t = st.now - bt.SPAN_MS + Math.max(0, Math.min(1, frac)) * bt.SPAN_MS;
      const target = Math.max(0, Math.min(st.duration || t, t));
      try {
        st.ctx.actions?.seek?.(Math.round(target));
      } catch {
        /* 宿主不实现就算了 */
      }
    };
    st.elScope.addEventListener("click", st.onClick);

    /* 6. 首帧数据 */
    syncTrack(st, ctx);
    syncLines(st, { force: true });
    syncProgress(st, ctx);
    st.clock.at = nowMs();
    st.tRef = positionAt(st, nowMs());
    st.now = st.tRef;
    if (st.animations === false) renderFrame(st, nowMs(), 0);
    else wake(st);

    /* 7. 上报宿主壳配色（**防抖**：一次挂载只发一次，颜色是清单里固定的） */
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

  /** 契约签名是 update(ctx, patch)（darkroom / rubbing / spire / letterpress 同款） */
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
        resetBeat(st);
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
        wake(st);
        break;
      case "theme": {
        const p = patch.patch || patch;
        st.mode = p.mode || p.themeId || st.mode;
        // 示波器只认自己的配色：主题切换只改标记，不改荧光绿
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

  /* 契约签名是 destroy(ctx)。ctx 只是签名的一部分：模块是单例（真机一次只挂一个样式），
     所以卸载的就是当前这个实例 —— 拿 ctx 做"是不是自己的"判断反而会在换上下文时漏卸载。 */
  destroy(ctx) {
    void ctx;
    const st = S;
    if (!st) return;
    destroySkin(st);
  },
};

/* ==========================================================================
   配色 / 变量
   ========================================================================== */
function applyColors(st) {
  setVar(st, "--pl-bg", st.colors.bg);
  setVar(st, "--pl-fg", st.colors.fg);
  setVar(st, "--pl-accent", st.colors.accent);
  const rgb = sc.hexToRgb(st.colors.fg, [124, 252, 155]);
  /* 透明度是"展开"出来的（--pl-fg-08/15/30/55）：
     CSS 里既不用 color-mix，也不必把颜色写死在样式表里 —— 换清单就能换整屏配色 */
  st.elRoot.style.setProperty("--pl-fg-08", sc.rgba(rgb, 0.08));
  st.elRoot.style.setProperty("--pl-fg-15", sc.rgba(rgb, 0.15));
  st.elRoot.style.setProperty("--pl-fg-30", sc.rgba(rgb, 0.3));
  st.elRoot.style.setProperty("--pl-fg-55", sc.rgba(rgb, 0.55));
  st.ink = {
    grid: sc.rgba(rgb, 0.14),
    base: sc.rgba(rgb, 0.3),
    env: sc.rgba(rgb, 0.92),
    envFill: sc.rgba(rgb, 0.16),
    cent: sc.rgba(sc.hexToRgb(st.colors.accent, [124, 252, 155]), 0.75),
    flux: sc.rgba(rgb, 0.35),
    sweep: sc.rgba(rgb, 0.55),
    beat: sc.rgba(rgb, 0.3),
    dim: sc.rgba(rgb, 0.45),
  };
  // 宿主壳（底栏/按钮）配色：深底 + 荧光字
  setVar(st, "--pl-chrome-bg", st.colors.bg);
  setVar(st, "--pl-chrome-fg", st.colors.fg);
}

/* ==========================================================================
   标记池
   ========================================================================== */
function buildPool(st) {
  const bf = document.createDocumentFragment();
  for (let i = 0; i < MAX_MARKS; i += 1) {
    const el = document.createElement("i");
    el.className = "pl__beat";
    el.dataset.off = "1";
    bf.appendChild(el);
    st.marks.push({ el, t: null });
  }
  st.elBeats.appendChild(bf);

  const tf = document.createDocumentFragment();
  for (let i = 0; i < MAX_TICKS; i += 1) {
    const el = document.createElement("i");
    el.className = "pl__tick";
    el.dataset.off = "1";
    tf.appendChild(el);
    st.ticks.push({ el, t: null, snapped: false });
  }
  st.elRail.appendChild(tf);
}

/* ==========================================================================
   歌词（复用宿主 SDK 的 createLyricsView）
   ========================================================================== */
function buildLyrics(st) {
  const sdk = st.ctx.sdk || {};
  if (typeof sdk.createLyricsView !== "function") {
    st.elRoot.dataset.noSdk = "1";
    return;
  }
  st.view = sdk.createLyricsView(st.elLyrics, {
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
      const text = String(l?.text ?? "");
      const starts = Array.isArray(l?.words) ? l.words.map(Number) : null;
      const words = starts && starts.length && starts.every((n) => Number.isFinite(n)) ? starts : null;
      return { time: Number.isFinite(l?.time) ? l.time : 0, text, words, trans: l?.trans };
    })
    .filter((l) => l.text.trim().length > 0);

  const key = lines.map((l) => `${l.time}|${l.text}|${l.words ? l.words.join(",") : ""}`).join("\u0001");
  if (!force && key === st.linesKey) return;
  st.linesKey = key;
  st.lines = lines;
  st.cur = -1;
  st.railKey = "";
  st.elRoot.dataset.total = String(lines.length);
  st.elRoot.dataset.empty = lines.length ? "0" : "1";
  if (st.view) {
    st.view.setLines(lines, {
      emptyText: "暂无歌词",
      emptyHint: "示波器仍在跟随频谱",
      showOpenFolder: true,
    });
  }
  layoutRail(st);
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
      if (Number.isFinite(pb.duration)) st.duration = pb.duration;
    }
  } catch {
    /* 拿不到就用手上的 */
  }
  st.elRoot.dataset.playing = st.clock.playing ? "1" : "0";
  st.lastActive = nowMs();
}

/** 暂停/播放：暂停时记下时刻（停帧判断要用），恢复时把外推锚点对齐到墙钟 */
function setPlaying(st, playing) {
  st.clock.playing = !!playing;
  st.clock.at = nowMs();
  st.elRoot.dataset.playing = playing ? "1" : "0";
  if (playing) {
    st.lastActive = nowMs();
    wake(st);
  }
}

/** 换歌：拍点全部作废（新歌的 BPM 大概率不一样，留着旧锚点只会错拍） */
function resetBeat(st) {
  st.pll = bt.createPll();
  st.tRef = positionAt(st, nowMs());
  st.now = st.tRef;
  st.marksKey = "";
  st.railKey = "";
  st.mode = "";
  st.lastLabel = "";
  st.lastHint = "";
  setVar(st, "--pl-pulse", "0");
  st.elRoot.dataset.beat = "listening";
  st.elRoot.dataset.flash = "0";
  layoutMarks(st);
  layoutRail(st);
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

  st.elRoot.dataset.animations = st.animations ? "1" : "0";
  st.elRoot.dataset.interactive = st.interactive ? "1" : "0";
  st.elRoot.dataset.perf = st.performanceMode === "performance" ? "1" : "0";
  st.elRoot.dataset.lowMotion = st.reducedMotion ? "1" : "0";
  st.elRoot.dataset.showLyrics = st.showLyrics ? "1" : "0";
  st.elRoot.dataset.mode = st.mode === "light" ? "light" : "dark";
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
  setVar(st, "--pl-w", `${w}px`);
  setVar(st, "--pl-h", `${h}px`);
  st.elRoot.dataset.narrow = st.narrow ? "1" : "0";
  st.elRoot.dataset.dpr = String(dpr);

  /* canvas 的坐标空间是 **.pl__scope 的盒子**（不是整个舞台）：
     DOM 拍点/刻度与 canvas 共用同一套 layout 数字，所以必须按同一块盒子算。
     CSS 还没生效时 clientHeight 会是 0 —— 退回一个按比例的估值，下一帧 resize 会纠正。 */
  const scope = st.elScope;
  const cw = Math.max(1, Math.round(scope?.clientWidth || w * 0.95));
  const ch = Math.max(1, Math.round(scope?.clientHeight || h * 0.42));
  const rect = { w, h, cw, ch, dpr };
  st.rect = rect;
  st.layout = sc.layoutOf(cw, ch);

  const cv = st.elCanvas;
  cv.width = Math.max(1, Math.round(cw * dpr));
  cv.height = Math.max(1, Math.round(ch * dpr));
  st.ctx2d = cv.getContext("2d", { alpha: true });
  // 尺寸变了：标记与刻度的像素位置全部重算
  st.marksKey = "";
  st.railKey = "";
}

/* ==========================================================================
   拍点标记 / 字级刻度
   --------------------------------------------------------------------------
   两者都放在"会滑动的容器"里：元素的 --x 只在**重锚 / 换行 / 窗口重设**时写，
   每帧只写一次容器位移 --pl-slide。窗口重设时同一帧里重算 x 并把位移归零，
   屏幕上的位置**连续**（不会跳）。
   ========================================================================== */
function windowKey(st) {
  return `${st.pll.mode}|${Math.round(st.pll.anchor)}|${Math.round(st.pll.bpm * 10)}|${Math.round(st.tRef)}|${st.layout.w}`;
}

function layoutMarks(st) {
  const L = st.layout;
  const key = windowKey(st);
  if (key === st.marksKey) return;
  st.marksKey = key;
  /* x 的参考点是"一个周期前"（xRef），保留范围是双倍窗口：
     屏幕上永远只看得见 [now−6s, now]，而 xRef 一个周期才换一次 ——
     双倍窗口保证这一整个周期里"看过去的 6 秒"都躺着现成的元素。 */
  const win = sc.winOf(st.tRef - bt.SPAN_MS, bt.SPAN_MS, bt.SPAN_MS);
  const beats = st.pll.mode === "locked" ? bt.beatTimes(st.pll, win.from, win.to, MAX_MARKS) : [];
  const xs = sc.markXs(beats, L, win, st.now);
  for (let i = 0; i < st.marks.length; i += 1) {
    const m = st.marks[i];
    const b = xs[i];
    if (!b) {
      if (m.t !== null) {
        m.t = null;
        m.el.dataset.off = "1";
      }
      continue;
    }
    m.t = b.t;
    m.el.dataset.off = "0";
    setVarOn(m.el, "--x", `${Math.round(b.x)}px`);
  }
  st.elRoot.dataset.marks = String(xs.length);
  st.lastSlide = null; // 位移要跟着新窗口重写
}

function layoutRail(st) {
  const L = st.layout;
  const line = st.cur >= 0 ? st.lines[st.cur] : null;
  const key = `${st.cur}|${Math.round(st.pll.anchor)}|${Math.round(st.pll.bpm * 10)}|${Math.round(st.tRef)}|${L.w}`;
  if (key === st.railKey) return;
  st.railKey = key;
  const win = sc.winOf(st.tRef - bt.SPAN_MS, bt.SPAN_MS, bt.SPAN_MS);
  const beats = st.pll.mode === "locked" ? bt.beatTimes(st.pll, win.from, win.to, MAX_MARKS) : [];
  const ticks = sc.railTicks(line?.words || [], beats, L, win, bt.snapTime, bt.PLL.snapMs);
  let snapped = 0;
  for (let i = 0; i < st.ticks.length; i += 1) {
    const k = st.ticks[i];
    const t = ticks[i];
    if (!t) {
      if (k.t !== null) {
        k.t = null;
        k.snapped = false;
        k.el.dataset.off = "1";
      }
      continue;
    }
    k.t = t.t;
    k.snapped = t.snapped;
    if (t.snapped) snapped += 1;
    k.el.dataset.off = "0";
    k.el.dataset.snap = t.snapped ? "1" : "0";
    setVarOn(k.el, "--x", `${Math.round(t.x)}px`);
  }
  st.elRoot.dataset.ticks = String(ticks.length);
  st.elRoot.dataset.snapped = String(snapped);
  st.lastSlide = null;
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
  /* wall = performance.now()：只管**调度**（限帧、闲置看门狗）
     song = 歌曲位置：管**画面**（时间轴、拍点、脉冲、齿轮、歌词刻度）
     两者分开是必须的 —— 歌曲时间是位置的函数，暂停时不走；
     而"暂停 6 秒后停帧"这种判断必须用墙上时钟，否则暂停时它永远不动。 */
  const wall = nowMs();
  const dtMs = st.last ? wall - st.last : 16;
  // performance 档：清单预算与设计稿的 15Hz 降采样取严
  const fps = st.performanceMode === "performance" ? Math.min(st.budgetFps, PERF_FPS) : 0;
  const budget = fps > 0 ? 1000 / fps : 0;
  if (budget > 0 && st.lastFrame && wall - st.lastFrame < budget) {
    st.raf = requestAnimationFrame(() => frame(st));
    return;
  }
  st.lastFrame = wall;
  st.last = wall;
  renderFrame(st, wall, dtMs);
  if (st.animations === false) return;
  if (!st.clock.playing && wall - st.lastActive > IDLE_STOP_MS) {
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

function renderFrame(st, wall, dtMs) {
  /* 画面的一切都架在**歌曲时间**上：歌词字级时刻、上一句/下一句、拍点锚点、
     脉冲相位、齿轮相位、时间轴窗口 —— 全是同一个钟，才能互相对得上。
     （曾经把 performance.now() 当时间轴用：探针里字级刻度"刚好"吸上是因为
     合成拍点的相位凑巧，真机上歌曲位置与页面开机的毫秒数差着几个数量级，一条都不会画。） */
  const now = positionAt(st, wall);
  st.frames += 1;
  st.now = now;
  const L = st.layout;

  /* ---- 1. 频谱 → 三个标量 → onset 检测（静态档不喂：设计稿要求"不做 PLL"） ---- */
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
    st.elNospec.hidden = hasSpec;
  }
  if (st.animations !== false) {
    if (bands) bt.feedFrame(st.pll, { t: now, bands });
  }

  /* ---- 2. 状态 / 文案（**不谎报 BPM**） ---- */
  const status = bt.statusOf(st.pll, { hasSpectrum: hasSpec });
  if (status.mode !== st.mode) {
    st.mode = status.mode;
    st.elRoot.dataset.beat = status.mode;
    st.marksKey = "";
    st.railKey = "";
  }
  /* 检出多少、间隔有多稳：写出来是为了能"看得见"（屏幕上看不到，但自检与真机探针要读它） */
  if (st.lastOnsets !== st.pll.onsetsSeen) {
    st.lastOnsets = st.pll.onsetsSeen;
    st.elRoot.dataset.onsets = String(st.pll.onsetsSeen);
  }
  const cvText = st.pll.cv.toFixed(2);
  if (st.lastCv !== cvText) {
    st.lastCv = cvText;
    st.elRoot.dataset.cv = cvText;
  }
  if (status.label !== st.lastLabel) {
    st.lastLabel = status.label;
    st.elBpm.textContent = status.label;
    st.elBpm.dataset.mode = status.mode;
  }
  if (status.hint !== st.lastHint) {
    st.lastHint = status.hint;
    st.elHint.textContent = status.hint;
  }

  /* ---- 3. 脉冲（负延迟补偿：峰值在拍点之前 40ms） ---- */
  const pulse = bt.pulseAt(st.pll, now);
  setVar(st, "--pl-pulse", pulse.toFixed(2));
  st.elRoot.dataset.flash = pulse > 0.5 ? "1" : "0";

  /* ---- 4. 齿轮：相位对齐交给 CSS animation（不写每帧角度） ---- */
  if (status.mode === "locked") {
    const period = bt.periodOf(st.pll);
    setVar(st, "--pl-period", `${Math.round(period)}ms`);
    const phaseMs = Math.round(((now - st.pll.anchor) % period + period) % period);
    setVar(st, "--pl-phase-ms", `${phaseMs}ms`);
  } else {
    setVar(st, "--pl-period", "4000ms");
    setVar(st, "--pl-phase-ms", "0ms");
  }

  /* ---- 5. 窗口参考点重设（同一帧里重算 x 并把位移归零 → 画面连续） ---- */
  /* 屏幕上的时间轴口径只有一条：右端 = 现在，左端 = 6 秒前。
     --x 按 xRef = tRef − 6s 写，容器位移 slide = −(now − tRef)/6s × plotW，
     于是屏幕位置 = x + slide = plotW + (t − now)/6s × plotW —— 与 canvas 的 t0 = now − 6s 同一套口径
     （自检量"字级刻度与拍点标记重合"就是钉住这件事）。xRef 每 6 秒才换一次，
     这中间的每帧只写一个 --pl-slide。 */
  if (now - st.tRef >= bt.SPAN_MS || st.tRef <= 0) {
    st.tRef = now;
    st.marksKey = "";
    st.railKey = "";
  }
  layoutMarks(st);
  layoutRail(st);
  const slide = `${Math.round((-(now - st.tRef) / bt.SPAN_MS) * L.plotW)}px`;
  if (st.lastSlide !== slide) {
    st.lastSlide = slide;
    setVar(st, "--pl-slide", slide);
  }

  /* ---- 6. 歌词：当前行 + 逐字（每帧喂墙钟外推位置；playing:false 让 SDK 不开自己的循环） ---- */
  const pos = positionAt(st, now);
  st.pos = pos;
  if (st.view && st.lines.length) {
    st.view.setPosition(pos + VISUAL_LAG_MS, { playing: false });
    const idx = sdkLineIndex(st, pos + VISUAL_LAG_MS);
    if (idx !== st.cur) {
      st.cur = idx;
      st.railKey = "";
      layoutRail(st);
      st.elRoot.dataset.line = String(idx);
    }
  } else if (st.cur !== -1) {
    st.cur = -1;
    st.railKey = "";
    layoutRail(st);
    st.elRoot.dataset.line = "-1";
  }

  /* ---- 7. 读数 ---- */
  const tc = `${sc.mmss(pos)} / ${sc.mmss(st.duration)}`;
  if (tc !== st.lastTc) {
    st.lastTc = tc;
    st.elTc.textContent = tc;
  }
  const pct = `${Math.round(bt.phaseAt(st.pll, now) * 10) * 10}%`;
  if (pct !== st.lastPhase) {
    st.lastPhase = pct;
    st.elPhase.textContent = status.mode === "locked" ? `相位 ${pct}` : "";
  }
  const title = st.track?.title || "";
  if (title !== st.title) {
    st.title = title;
    st.elTitle.textContent = title;
    st.elTitle.dataset.empty = title ? "0" : "1";
  }

  /* ---- 8. 画 ---- */
  draw(st, now);
}

/** 当前行下标（与 SDK 的 findLyricIndex 同义，自己算一份省一次 SDK 调用） */
function sdkLineIndex(st, pos) {
  const lines = st.lines;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= pos) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/* ==========================================================================
   画布
   ========================================================================== */
function draw(st, now) {
  const g = st.ctx2d;
  if (!g) return;
  const L = st.layout;
  const { cw, ch, dpr } = st.rect;
  const t0 = now - bt.SPAN_MS;
  const n = bt.seriesInto(st.pll.ring, t0, now, st.series);
  st.series.n = n;

  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);

  /* 网格竖线 */
  g.lineWidth = 1;
  g.strokeStyle = st.ink.grid;
  const cols = sc.gridColumns(L, 8);
  g.beginPath();
  for (let i = 0; i < cols.length; i += 1) {
    g.moveTo(Math.round(cols[i]) + 0.5, L.top);
    g.lineTo(Math.round(cols[i]) + 0.5, L.bottom);
  }
  g.stroke();

  /* 基线 */
  g.strokeStyle = st.ink.base;
  g.beginPath();
  g.moveTo(L.left, L.midY + 0.5);
  g.lineTo(L.right, L.midY + 0.5);
  g.stroke();

  if (n > 1) {
    /* 包络（填充 + 描边） */
    const env = sc.polylineOf(st.series, L, t0, bt.SPAN_MS, "e");
    g.beginPath();
    g.moveTo(env[0], L.midY);
    for (let i = 0; i < n; i += 1) g.lineTo(env[i * 2], env[i * 2 + 1]);
    g.lineTo(env[(n - 1) * 2], L.midY);
    g.closePath();
    g.fillStyle = st.ink.envFill;
    g.fill();
    g.beginPath();
    g.moveTo(env[0], env[1]);
    for (let i = 1; i < n; i += 1) g.lineTo(env[i * 2], env[i * 2 + 1]);
    g.strokeStyle = st.ink.env;
    g.lineWidth = 1.5;
    g.stroke();

    /* flux 闸门（基线下方） */
    const flux = sc.polylineOf(st.series, L, t0, bt.SPAN_MS, "f");
    g.beginPath();
    g.moveTo(flux[0], flux[1]);
    for (let i = 1; i < n; i += 1) g.lineTo(flux[i * 2], flux[i * 2 + 1]);
    g.strokeStyle = st.ink.flux;
    g.lineWidth = 1;
    g.stroke();

    /* 谱质心轨迹（上方窄带） */
    const cent = sc.polylineOf(st.series, L, t0, bt.SPAN_MS, "c");
    g.beginPath();
    g.moveTo(cent[0], cent[1]);
    for (let i = 1; i < n; i += 1) g.lineTo(cent[i * 2], cent[i * 2 + 1]);
    g.strokeStyle = st.ink.cent;
    g.lineWidth = 1;
    g.stroke();
  }

  /* 扫描指针（右端 = 现在） */
  g.strokeStyle = st.ink.sweep;
  g.beginPath();
  g.moveTo(L.right - 0.5, L.top);
  g.lineTo(L.right - 0.5, L.bottom);
  g.stroke();

  /* 拍点：canvas 里再画一层很淡的竖线（DOM 标记负责"亮"的那一层） */
  if (st.pll.mode === "locked") {
    const beats = bt.beatTimes(st.pll, t0, now, MAX_MARKS);
    g.strokeStyle = st.ink.beat;
    g.beginPath();
    for (let i = 0; i < beats.length; i += 1) {
      const x = Math.round(sc.xAt(L, beats[i], t0, bt.SPAN_MS)) + 0.5;
      g.moveTo(x, L.top);
      g.lineTo(x, L.bottom);
    }
    g.stroke();
  }

  /* 没有频谱时说清楚（不要假装在监听） */
  if (!st.hasSpec) {
    g.fillStyle = st.ink.dim;
    g.font = "11px " + FONT_STACK;
    g.fillText("无频谱输入", L.left + 4, L.top + 12);
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
  if (st.onClick) st.elScope?.removeEventListener("click", st.onClick);
  st.onClick = null;
  st.marks.length = 0;
  st.ticks.length = 0;
  st.lines = [];
  st.series.n = 0;
  st.pll = null;
  st.ctx2d = null;
  if (st.elRoot) {
    st.elRoot.remove();
    st.elRoot = null;
  }
  if (S === st) S = null;
}
