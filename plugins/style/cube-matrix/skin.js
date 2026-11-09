/* ==========================================================================
   cube-matrix/skin.js — 「律动方块」样式入口（契约 v3）
   --------------------------------------------------------------------------
   一句话：**一片铺在透视地面上的 3D 方块矩阵，是一台频谱分析仪。**
     · 横向 15 列 = 频率轴（最左最低频，最右最高频，128 段对数谱按列取均值）；
     · 纵深 11 行 = 时间轴（每行差 2 个频谱样本 ≈ 66ms，前排最新、后排最旧），
       于是纵深方向滚动的是**真实的频谱历史**，不是造出来的波浪；
     · 柱高只由频段能量决定（快升慢降的包络），没有任何与音频无关的振荡；
     · 色相 = 基础漂移 + 列的彩虹跨度 + 高度推色 + 重拍冲量（lib/palette.js）；
     · 只有一条 rAF 帧循环，没有频谱时降频、久静后停帧（任何宿主补丁把它拉起）。

   契约纪律（v3）：
     · 零裸包名 import（只 import 本包目录内的相对模块）；
     · 不碰 window / document.documentElement、不发网络请求、不自己碰音频元素；
     · CSS 由宿主包进 @layer skin + @scope(舞台)，本文件只写 DOM 与类名；
     · 要给人读的文字全部躲在 --skin-inset-* 安全区里（见 skin.css）。

   ★ 为什么子模块是 `await import(...)` 而不是静态 import（别改成静态的）
     /skins/ 是**逐文件**鉴权的：入口被加载成 /skins/cube-matrix/skin.js?t=sk_xxx，
     而 ES 模块解析相对说明符时**只保留路径、丢掉 query** —— 静态 import 会去请求
     不带 token 的 URL 并拿到 403，报错还挂在入口上，极难定位。
     这里把入口 URL 上的 query 原样透传给每个子模块；子模块内部也各自透传。
     浏览器预览没有 query，透传的是空串，退化成普通相对导入 —— 两种环境都成立。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

const { GRID, CAM, CUBE, COLOR, PERF, BEAT, LEVEL, HISTORY } = await load("config.js");
const { createAnalyser, beatFire, fillColumnLevels } = await load("spectrum.js");
const {
  createView,
  layoutGrid,
  orderByDepth,
  cubeHeight,
  idleHeight,
  pushHistoryRow,
  decayHistory,
} = await load("scene.js");
const { frameTone } = await load("palette.js");
const { createRenderer } = await load("render.js");
const { smoothRate, mulberry32, clamp } = await load("util.js");

/** 舞台 DOM（装饰层 + HUD；HUD 全部让开宿主壳） */
const SHELL = `
  <div class="cm">
    <canvas class="cm__canvas" aria-hidden="true"></canvas>
    <div class="cm__vignette" aria-hidden="true"></div>
    <div class="cm__hud">
      <div class="cm__head">
        <div class="cm__track">
          <span class="cm__title"></span>
          <span class="cm__artist"></span>
        </div>
      </div>
      <div class="cm__foot">
        <button type="button" class="cm__lyric" disabled>
          <span class="cm__lyric-text"></span>
        </button>
      </div>
    </div>
  </div>`;

/** 空态文案（没有歌词行时） */
const EMPTY = {
  loading: "正在匹配歌词…",
  failed: "这首歌没有歌词",
  none: "这首歌没有歌词",
  instrumental: "纯音乐，请欣赏",
};

/** @type {object|null} 运行期状态（换样式会先 destroy 再 mount，因此是单例） */
let S = null;

/** 取一句歌词要显示的文字：主行优先，主行为空时退回译文 */
function lineText(line) {
  if (!line) return "";
  const main = typeof line.text === "string" ? line.text.trim() : "";
  if (main) return main;
  if (Array.isArray(line.trans) && line.trans.length) return String(line.trans[0] || "").trim();
  return "";
}

/** 空态 / 加载态文案 */
function emptyText(ctx, lyrics) {
  const status = (lyrics && lyrics.status) || "none";
  const host = (lyrics && lyrics.statusText) || "";
  if (status === "loading") return host || EMPTY.loading;
  if (host) return host;
  return EMPTY[status] || EMPTY.none;
}

export default {
  id: "cube-matrix",

  mount(ctx) {
    const root = ctx.root;
    root.innerHTML = SHELL;

    const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector(".cm__canvas"));
    const layout = layoutGrid(GRID);
    const rnd = mulberry32(0x5eed1);
    const heights = new Float32Array(layout.cells.length);
    const phases = new Float32Array(layout.cells.length);
    for (let i = 0; i < heights.length; i += 1) {
      heights[i] = CUBE.base;
      phases[i] = rnd();
    }

    const env = (ctx.env && ctx.env()) || {};
    const renderer = createRenderer(canvas);
    renderer.resize(env.width || 0, env.height || 0, env.dpr || 1);

    S = {
      ctx,
      canvas,
      renderer,
      layout,
      heights,
      phases,
      analyser: createAnalyser(128),
      /** 每列当前电平（0..1），每帧由 fillColumnLevels 原地刷新 */
      levels: new Float32Array(layout.cols),
      /** 每次采样累积的列电平（取 max，避免瞬态被采样间隔漏掉） */
      pend: new Float32Array(layout.cols),
      pendN: 0,
      /** 频谱历史：rows × cols，行 0 = 最远 = 最旧，最后一行 = 最近 = 最新 */
      history: new Float32Array(layout.cols * layout.rows),
      /** 最近一次处理的频谱样本时刻（spec.at），用来判断「有没有新样本」 */
      lastSpecAt: -1,
      /** 最近一次拿到实时频谱的动画时钟（秒），待机判定用 */
      lastLiveAt: -10,
      /** 当前帧的视图参数，resize 时刷新 */
      view: createView(env.width || 1, env.height || 1, 0, CAM),
      order: [],
      dom: {
        title: root.querySelector(".cm__title"),
        artist: root.querySelector(".cm__artist"),
        lyric: root.querySelector(".cm__lyric"),
        lyricText: root.querySelector(".cm__lyric-text"),
      },
      // —— 播放与显示选项 ——
      anim: true,
      showLyrics: true,
      interactive: ctx.options().interactive !== false,
      playing: false,
      // —— 帧循环 ——
      raf: 0,
      time: 0,
      lastTs: 0,
      lastDraw: 0,
      idleSince: 0,
      beatPulse: 0,
      // —— 歌词同步 ——
      lyricKey: "",
      lyricTime: -1,
      trackKey: "",
    };

    S.order = orderByDepth(layout.cells, S.view);
    syncOptions(ctx);
    syncTrack(ctx);
    syncLyrics(ctx);

    if (S.interactive) bindPointer();

    // 动效关闭时只画一帧静态画面（设置里关动效 / 系统要求减少动效）
    S.lastTs = performance.now();
    S.idleSince = S.lastTs;
    if (S.anim) startLoop();
    else drawStatic();
  },

  update(ctx, patch) {
    if (!S) return;
    const type = (patch && patch.type) || "";
    switch (type) {
      case "mount":
      case "song":
        syncTrack(ctx);
        syncLyrics(ctx);
        syncOptions(ctx);
        break;
      case "media":
        syncTrack(ctx);
        break;
      case "lyrics":
        syncLyrics(ctx);
        break;
      case "progress":
        if (typeof patch.playing === "boolean") S.playing = Boolean(patch.playing);
        S.idleSince = performance.now();
        break;
      case "state":
        S.playing = Boolean(patch.playing);
        S.idleSince = performance.now();
        break;
      case "options":
        syncOptions(ctx);
        syncLyrics(ctx);
        if (!S.anim) drawStatic();
        break;
      case "resize":
        rendererResize(Number(patch.width) || 0, Number(patch.height) || 0);
        if (!S.anim) drawStatic();
        break;
      case "theme":
        if (!S.anim) drawStatic();
        break;
      case "close":
        stopLoop();
        return;
      default:
        break;
    }
    if (S.anim) startLoop();
  },

  destroy(ctx) {
    stopLoop();
    if (S) {
      if (S.offPointer) S.offPointer();
      S.dom = {};
      S.ctx = null;
      S.layout = { cells: [] };
    }
    S = null;
    ctx.root.innerHTML = "";
  },
};

/* ==========================================================================
   状态同步
   ========================================================================== */

function syncOptions(ctx) {
  if (!S) return;
  const opt = (ctx.options && ctx.options()) || {};
  const env = (ctx.env && ctx.env()) || {};
  S.anim = opt.animations !== false && !env.reducedMotion;
  S.showLyrics = opt.showLyrics !== false;
  S.interactive = opt.interactive !== false;
}

function syncTrack(ctx) {
  if (!S || !S.dom.title) return;
  const track = (ctx.track && ctx.track()) || null;
  const title = (track && track.title) || "";
  const artist = (track && track.artist) || "";
  const key = `${title}\u0000${artist}`;
  if (key === S.trackKey) return;
  S.trackKey = key;
  S.dom.title.textContent = title || "未在播放";
  S.dom.artist.textContent = artist;
}

function syncLyrics(ctx) {
  if (!S || !S.dom.lyric || !S.dom.lyricText) return;
  const lyrics = (ctx.lyrics && ctx.lyrics()) || null;
  const lines = lyrics && Array.isArray(lyrics.lines) ? lyrics.lines : [];
  const index = lyrics && Number.isFinite(lyrics.index) ? lyrics.index : -1;
  const line = index >= 0 && index < lines.length ? lines[index] : null;
  const text = S.showLyrics ? lineText(line) : "";
  const visible = S.showLyrics;
  const key = `${visible}|${index}|${text}|${visible && !line ? emptyText(ctx, lyrics) : ""}`;
  if (key === S.lyricKey) return;
  S.lyricKey = key;

  const box = S.dom.lyric;
  const el = S.dom.lyricText;
  const hasLine = Boolean(text);
  S.lyricTime = hasLine ? Math.max(0, Number(line.time) || 0) : -1;

  box.hidden = !visible;
  el.textContent = hasLine ? text : visible ? emptyText(ctx, lyrics) : "";
  box.classList.toggle("is-line", hasLine);
  box.disabled = !hasLine || !S.interactive;

  // 换句时重放一次淡入（移除 → 强制回流 → 加回），只在真正换行时发生
  el.classList.remove("is-swap");
  void el.offsetWidth;
  el.classList.add("is-swap");
}

/* ==========================================================================
   交互
   ========================================================================== */

function bindPointer() {
  if (!S || !S.dom.lyric) return;
  const box = S.dom.lyric;
  const onClick = () => {
    if (!S || S.lyricTime < 0) return;
    const ctx = S.ctx;
    if (ctx && ctx.actions && typeof ctx.actions.seek === "function") ctx.actions.seek(S.lyricTime);
  };
  box.addEventListener("click", onClick);
  S.offPointer = () => box.removeEventListener("click", onClick);
}

/* ==========================================================================
   帧循环
   ========================================================================== */

function startLoop() {
  if (!S || !S.anim || S.raf) return;
  const step = (ts) => {
    if (!S) return;
    S.raf = requestAnimationFrame(step);
    runFrame(ts);
  };
  S.raf = requestAnimationFrame(step);
}

function stopLoop() {
  if (!S) return;
  if (S.raf) cancelAnimationFrame(S.raf);
  S.raf = 0;
}

/** 当前这一帧该按哪个帧率画（有频谱按 budgetFps，没有就降频） */
function frameGap(live) {
  return 1000 / Math.max(8, live ? PERF.budgetFps : PERF.idleFps);
}

function runFrame(ts) {
  if (!S) return;
  const now = Number.isFinite(ts) ? ts : performance.now();
  const dt = clamp(now - (S.lastTs || now), 0, 100);

  // 久静停帧：暂停 / 切到后台久了就彻底停下，任何一次宿主补丁都会重新 startLoop
  if (!S.playing && now - S.idleSince > PERF.idleStopMs) {
    stopLoop();
    return;
  }

  if (now - S.lastDraw < frameGap(S.analyser.out.live) - 1) return;
  S.lastTs = now;
  S.lastDraw = now;
  S.time += dt / 1000;

  const ctx = S.ctx;
  const spec = ctx && ctx.spectrum ? ctx.spectrum() : null;
  const a = ingestSpectrum(spec, dt, true);
  if (a.live) S.idleSince = now;

  if (beatFire(a, S.time, BEAT.threshold, BEAT.cooldownSec)) S.beatPulse = 1;
  else S.beatPulse = Math.max(0, S.beatPulse - dt / 260);

  const tone = frameTone({
    timeSec: S.time,
    centroid: a.centroid,
    energy: a.total,
    beat: S.beatPulse,
    cfg: COLOR,
  });

  applyHeights(dt);

  S.view = createView(S.view.width, S.view.height, S.time, CAM);
  S.order = orderByDepth(S.layout.cells, S.view);
  S.renderer.draw({
    view: S.view,
    cells: S.layout.cells,
    order: S.order,
    heights: S.heights,
    tone,
    cube: CUBE,
    color: COLOR,
  });
}

/**
 * 采样 → 列电平 → 历史推进。
 *
 * 「推进历史」只在**真的有新样本**（spec.at 变化）时发生：宿主在 spectrum.js 里
 * 按 ~30Hz 节流，而帧率可能更高 —— 按帧推进会让时间轴被帧率拉伸。
 *
 * @param {{bands:Float32Array, at:number}|null} spec ctx.spectrum() 的返回
 * @param {number} dt 帧间隔（毫秒）
 * @param {boolean} advance 是否推进历史（画一次性静态画面时传 false）
 */
function ingestSpectrum(spec, dt, advance) {
  const a = S.analyser.update(spec && spec.bands ? spec.bands : null, dt);
  fillColumnLevels(S.levels, a.mid, LEVEL);

  if (!a.live) {
    // 暂停 / 静音：历史慢慢落回地面，而不是僵在原地
    if (advance) decayHistory(S.history, HISTORY.idleDecay);
    return a;
  }

  S.lastLiveAt = S.time;
  const at = spec && Number.isFinite(spec.at) ? spec.at : S.lastSpecAt + 1;
  if (!advance || at === S.lastSpecAt) return a;
  S.lastSpecAt = at;

  // 一「行」要攒够 samplesPerRow 个样本；单个行内取 max，瞬态不会被采样间隔漏掉
  const cols = S.layout.cols;
  for (let c = 0; c < cols; c += 1) {
    if (S.levels[c] > S.pend[c]) S.pend[c] = S.levels[c];
  }
  S.pendN += 1;
  if (S.pendN >= Math.max(1, HISTORY.samplesPerRow | 0)) {
    pushHistoryRow(S.history, S.pend, cols);
    S.pend.fill(0);
    S.pendN = 0;
  }
  return a;
}

/** 把历史里每一行都填成当前电平（一次性静态画面用：立刻有频谱形状） */
function flattenHistory() {
  const cols = S.layout.cols;
  for (let r = 0; r < S.layout.rows; r += 1) S.history.set(S.levels, r * cols);
}

/** 历史（时间轴）× 列（频率轴）→ 每根柱子的高度；历史空掉后交给待机呼吸 */
function applyHeights(dt) {
  const { cells, cols } = S.layout;
  const history = S.history;
  const still = !S.analyser.out.live && S.time - S.lastLiveAt > 0.7;

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    // 时间越旧的行越矮（固定衰减，与时钟无关，见 config 的 CUBE.ageFalloff）
    const age = 1 - CUBE.ageFalloff * (1 - cell.rowNorm);
    const level = (history[cell.row * cols + cell.col] || 0) * age;
    if (still) {
      S.heights[i] = idleHeight(cell, S.time, CUBE, S.phases[i]);
    } else {
      S.heights[i] = smoothRate(
        S.heights[i],
        cubeHeight(level, CUBE),
        CUBE.riseMs,
        CUBE.fallMs,
        dt,
      );
    }
  }
}

/** 动效关闭时的一次性静态画面（不做推进，直接按当前频谱摆好） */
function drawStatic() {
  if (!S) return;
  const ctx = S.ctx;
  const spec = ctx && ctx.spectrum ? ctx.spectrum() : null;
  const a = ingestSpectrum(spec, 16.7, false);
  if (a.live) flattenHistory();
  const tone = frameTone({
    timeSec: S.time || 1.2,
    centroid: a.centroid,
    energy: a.total,
    beat: 0,
    cfg: COLOR,
  });
  applyHeights(0);
  S.view = createView(S.view.width, S.view.height, S.time || 1.2, CAM);
  S.order = orderByDepth(S.layout.cells, S.view);
  S.renderer.draw({
    view: S.view,
    cells: S.layout.cells,
    order: S.order,
    heights: S.heights,
    tone,
    cube: CUBE,
    color: COLOR,
  });
}

function rendererResize(width, height) {
  if (!S) return;
  const env = (S.ctx && S.ctx.env && S.ctx.env()) || {};
  const w = width || env.width || S.view.width;
  const h = height || env.height || S.view.height;
  S.renderer.resize(w, h, env.dpr || 1);
  S.view = createView(w, h, S.time, CAM);
}
