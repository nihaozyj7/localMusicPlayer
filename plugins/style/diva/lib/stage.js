/* ==========================================================================
   diva/lib/stage.js — 「虚拟歌姬 · 全息演唱会」的舞台背景
   --------------------------------------------------------------------------
   分工：entry 每帧先 drawBack（歌姬身后），再画歌姬（diva.js），最后
   drawFront（歌姬前面）。本模块只认帧对象 f 与它带的 layout 锚点：

        f.layout = { w, h, cx, baseY, divaH, haloX, haloY, haloR, horizon, … }

   画面层次（自后往前）：
     · 静态层（离屏缓存，布局或配色变化时才重画一次）：
       深空底 / 星云 / 星空 / 三束远景体积光 / 观众席光斑 / 透视地面网格 /
       地面反光环 / 地平线亮带 / 顶部压暗 / 暗角；
     · 动态层（drawBack，每帧）：节拍闪光（很克制）、巨型全息光环
       （外圈刻度按 128 段频谱起伏并缓慢旋转、内圈呼吸、两条斜轨道椭圆环）、
       远景光束的缓慢摆动、升腾光尘的后景部分；
     · 前景层（drawFront）：一层极淡的地平线雾、近景散景、前景光点。
       前景只画在画面两侧与底部边缘，不挡人物、不挡歌词。

   性能纪律（tests/diva-stage-logic.test.js 会静态扫描源码）：
     · 全包只有 entry 那一条帧循环，本模块自己不排任何帧、不建定时器；
     · 不碰全局对象与文档根；离屏画布只在**首次 resize** 时建一次；
     · 不用阴影、不做全屏滤镜、每帧不新建渐变（渐变只在配色变化时建一次，
       而且是单位空间渐变，缩放复用）；
     · 配色预先摊成 0.025 一档的 rgba 字符串表，热路径里没有字符串拼接；
     · 光尘预分配 Float32Array，按 dt 推进、越界回绕、按深度分前后两层。

   暂停 / reduced：内部时钟冻结（画面静止），但刻度环、地面、光尘一个不少，
   仍是一张完整的舞台照片；光标（performance 档）降刻度与光尘数量。
   ========================================================================== */

// 子模块依赖同样要透传入口的 ?t= token（原因见 skin.js 顶部说明）。
const Q = new URL(import.meta.url).search;
const { LAYOUT, PALETTE, PERF } = await import(`./config.js${Q}`);
const { TAU, clamp, clamp01, mulberry32, noise1D, hexToRgb, rgba } = await import(`./util.js${Q}`);

/** 颜色透明度档数：0.025 一档（40 档），热路径里直接查表。 */
const ALPHA_STEPS = 40;
/** 节拍闪光的总透明度上限（自检按这个常量卡「克制」）。 */
const FLASH_MAX_ALPHA = 0.075;
/** 光尘按深度分层：z ≥ 这个值的画到前景层。 */
const DUST_FRONT_Z = 0.86;

/* --------------------------------------------------------------------------
   纯工具
   -------------------------------------------------------------------------- */

/** 有限数或兜底值。 */
function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** 合法 hex 色或兜底色（palette 缺项时用 config 里的 PALETTE）。 */
function safeHex(v, fallback) {
  const s = String(v ?? "").trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s) ? s : fallback;
}

/** hex → 41 档 rgba 字符串表（运行期不再拼字符串）。 */
function makeRamp(hex) {
  const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 };
  const out = new Array(ALPHA_STEPS + 1);
  for (let i = 0; i <= ALPHA_STEPS; i += 1) {
    out[i] = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(i / ALPHA_STEPS).toFixed(3)})`;
  }
  return out;
}

/** 从档位表里取一个透明度对应的 rgba 字符串（自动夹取/取整）。 */
function pick(ramp, alpha) {
  return ramp[Math.round(clamp01(alpha) * ALPHA_STEPS)];
}

/* --------------------------------------------------------------------------
   光尘：确定性的升腾粒子（纯数组，运行期零分配）
   --------------------------------------------------------------------------
   坐标是**归一的画面空间**（x/y 都在 0..1），由 stage 画的时候再乘宽高，
   所以窗口缩放不需要重建粒子；z 是深度（0 = 远，1 = 近）。

   step(dt, f):
     · dt 单位秒；dt ≤ 0 直接返回（暂停 / 静止档靠它做到「一帧不动」）；
     · 越界回绕：y < -0.04 → +1.08（升到顶就回到底部重新升），x 同理；
     · 深度分层：越近的粒子升得越快、越大、越亮，视差就出来了。
   -------------------------------------------------------------------------- */

/**
 * @param {number} count 粒子数
 * @param {number} [seed] 确定性种子（同一 seed 永远同一张星图）
 */
export function createDust(count, seed = 0x51ede) {
  const n = Math.max(1, Math.round(clamp(toNum(count, PERF.dustSmooth), 1, 512)));
  const rnd = mulberry32(toNum(seed, 0x51ede) >>> 0);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const size = new Float32Array(n);
  const speed = new Float32Array(n);
  const drift = new Float32Array(n);
  const phase = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    const depth = rnd();
    z[i] = depth;
    x[i] = rnd();
    y[i] = rnd();
    size[i] = 0.7 + rnd() * 1.1 + depth * 2.2;
    speed[i] = 0.018 + depth * 0.05 + rnd() * 0.012;
    drift[i] = (rnd() - 0.5) * 0.02;
    phase[i] = rnd() * TAU;
  }

  /** read() 返回的视图（复用同一个对象） */
  const view = { count: n, x, y, z, size, speed, drift, phase };
  let clock = 0;

  /**
   * 推进一帧。
   * @param {number} dt 秒
   * @param {object} [f] 帧对象（目前只作签名占位，便于以后加风场）
   */
  function step(dt, f) {
    void f;
    const d = clamp(toNum(dt, 0), 0, 0.2);
    if (d <= 0) return view;
    clock += d;
    for (let i = 0; i < n; i += 1) {
      const depth = z[i];
      y[i] -= speed[i] * (0.45 + depth * 1.15) * d;
      x[i] += (drift[i] + Math.sin(phase[i] + clock * 0.7 + i * 0.37) * 0.006) * d;
      // 越界回绕（留一点余量，粒子不会在边缘突然出现/消失）
      if (y[i] < -0.04) y[i] += 1.08;
      else if (y[i] > 1.04) y[i] -= 1.08;
      if (x[i] < -0.04) x[i] += 1.08;
      else if (x[i] > 1.04) x[i] -= 1.08;
    }
    return view;
  }

  /** 读粒子视图（复用的同一个对象）。 */
  function read() {
    return view;
  }

  /** 清空（destroy 时调）：数组清零、count 归 0。 */
  function destroy() {
    x.fill(0);
    y.fill(0);
    z.fill(0);
    size.fill(0);
    speed.fill(0);
    drift.fill(0);
    phase.fill(0);
    view.count = 0;
  }

  return { step, read, destroy };
}

/* --------------------------------------------------------------------------
   光环刻度：几何是纯函数，单测直接打它
   --------------------------------------------------------------------------
   外圈 72 段（performance 档 36 段）刻度绕光环缓慢旋转，每段长度由
   128 段频谱的对应位置决定；没有频谱时退化成一圈缓慢起伏的待机波。
   返回的数组可直接传 opts.out 复用（stage 每帧都这么用，避免分配）。
   -------------------------------------------------------------------------- */

/**
 * @param {{haloX?:number, haloY?:number, haloR?:number}} layout 舞台锚点
 * @param {{bands?:Float32Array, energy?:number, beat?:number}|null} spec
 * @param {number} t 秒（决定了缓慢旋转）
 * @param {{perf?:boolean, ticks?:number, rotation?:number, out?:any[]}} [opts]
 * @returns {Array<{a:number, len:number, inner:number, outer:number, alpha:number, band:number, x:number, y:number}>}
 */
export function haloArcs(layout, spec, t, opts = {}) {
  const o = opts && typeof opts === "object" ? opts : {};
  const perf = Boolean(o.perf);
  const count = Math.max(4, Math.round(toNum(o.ticks, perf ? PERF.ticksPerf : PERF.ticksSmooth)));
  const lay = layout && typeof layout === "object" ? layout : {};
  const haloR = Math.max(8, toNum(lay.haloR, 160));
  const haloX = toNum(lay.haloX, 0);
  const haloY = toNum(lay.haloY, 0);
  const time = toNum(t, 0);
  const rotation = toNum(o.rotation, time * 0.16);
  const bands = spec && spec.bands && typeof spec.bands.length === "number" ? spec.bands : null;
  const energy = clamp01(toNum(spec && spec.energy, 0));
  const beat = clamp01(toNum(spec && spec.beat, 0));
  const out = Array.isArray(o.out) ? o.out : new Array(count);
  const inner = haloR * 1.02;

  for (let i = 0; i < count; i += 1) {
    const k = count > 1 ? i / count : 0;
    let v;
    if (bands && bands.length > 0) {
      const bi = Math.min(bands.length - 1, Math.floor(k * bands.length));
      v = clamp01(toNum(bands[bi], 0));
    } else {
      // 待机波：没有频谱时也要有一圈「在呼吸的刻度」，不能是死环
      v = 0.14 + 0.1 * (0.5 + 0.5 * Math.sin(k * TAU * 3 + time * 0.8));
    }
    const arc =
      out[i] || (out[i] = { a: 0, len: 0, inner: 0, outer: 0, alpha: 0, band: 0, x: 0, y: 0 });
    arc.a = rotation + k * TAU;
    arc.len = haloR * (0.055 + v * 0.34 + beat * 0.035);
    arc.inner = inner;
    arc.outer = inner + arc.len;
    arc.alpha = clamp01(0.22 + v * 0.62 + energy * 0.1);
    arc.band = v;
    arc.x = haloX;
    arc.y = haloY;
  }
  out.length = count;
  return out;
}

/* --------------------------------------------------------------------------
   舞台本体
   -------------------------------------------------------------------------- */

/**
 * 造一个舞台渲染器（一次挂载一个）。
 *
 * @param {{seed?:number}} [opts]
 * @returns {{resize:(w:number,h:number,dpr:number,layout:object)=>void,
 *            drawBack:(g:CanvasRenderingContext2D,f:object)=>void,
 *            drawFront:(g:CanvasRenderingContext2D,f:object)=>void,
 *            destroy:()=>void}}
 */
export function createStage(opts = {}) {
  const o = opts && typeof opts === "object" ? opts : {};
  const seed = toNum(o.seed, 0x5eed) >>> 0;

  let alive = true;
  let w = 1;
  let h = 1;
  let dpr = 1;
  /** 舞台锚点（优先用帧里的 layout，resize 时先落一份兜底） */
  let L = {
    w: 1,
    h: 1,
    cx: 0.5,
    baseY: 1,
    haloX: 0.5,
    haloY: 0,
    haloR: 100,
    divaH: 300,
    horizon: LAYOUT.horizon,
  };

  /** 全包唯一一块离屏画布：静态舞台 */
  let cv = null;
  let cg = null;
  /** 静态层签名（布局 / 配色 / 档位变化才重画；逐项比数字，不拼字符串） */
  let staticSig = null;
  /** 上一次见到的 palette 对象（skin 每帧给同一引用时直接跳过颜色解析） */
  let paletteRef = null;
  /** 配色表（41 档 rgba） */
  let colors = null;
  /** 单位空间渐变（配色变化时重建一次） */
  let grads = null;

  /** 内部时钟（暂停 / reduced 时冻结） */
  let time = 0;
  /** 平滑后的能量（光环呼吸用） */
  let energy = 0;
  /** 节拍闪光（0..1，克制衰减） */
  let flash = 0;
  let prevBeat = 0;
  let perfNow = false;

  const dust = createDust(PERF.dustSmooth, seed);
  /** 刻度环描述复用池（预分配，运行期不再 new） */
  const arcs = [];
  /** 近景散景（确定性，只建一次） */
  const bokeh = buildBokeh(seed);

  /** 同一帧里 drawBack + drawFront 只推进一次内部时间 */
  let frameRef = null;
  let frameNow = Number.NaN;

  function buildBokeh(s) {
    const rnd = mulberry32((s ^ 0xb0c4a) >>> 0);
    const out = [];
    for (let i = 0; i < 7; i += 1) {
      const right = i % 2 === 1;
      out.push({
        x: right ? 0.8 + rnd() * 0.17 : 0.03 + rnd() * 0.17,
        y: 0.52 + rnd() * 0.42,
        r: 0.018 + rnd() * 0.052,
        a: 0.035 + rnd() * 0.05,
        tone: i % 3,
      });
    }
    return out;
  }

  /** 从 layout 里取锚点（缺项按 config 的比例兜底）。 */
  function adoptLayout(layout) {
    const src = layout && typeof layout === "object" ? layout : {};
    const W = Math.max(1, toNum(src.w, w));
    const H = Math.max(1, toNum(src.h, h));
    const baseY = clamp(toNum(src.baseY, H * LAYOUT.horizon), H * 0.2, H * 0.95);
    const haloR = Math.max(8, toNum(src.haloR, Math.min(W, H) * 0.22));
    L = {
      w: W,
      h: H,
      cx: toNum(src.cx, W * 0.5),
      baseY,
      haloX: toNum(src.haloX, W * 0.5),
      haloY: toNum(src.haloY, baseY - haloR * 1.12),
      haloR,
      divaH: toNum(src.divaH, H * 0.5),
      horizon: clamp(toNum(src.horizon, baseY / H), 0, 1),
    };
  }

  /** 离屏画布只在第一次 resize 时创建（之后只改尺寸）。 */
  function ensureCanvas() {
    if (cv || typeof document === "undefined" || !document.createElement) return;
    cv = document.createElement("canvas");
    cg = cv && typeof cv.getContext === "function" ? cv.getContext("2d") : null;
    if (!cg) cv = null;
  }

  /** 配色 → 字符串表；变了就作废静态层与渐变。 */
  function ensureColors(palette) {
    const p = palette && typeof palette === "object" ? palette : PALETTE;
    // skin.js 每帧把同一个 palette 引用递进来：引用没变就完全跳过（零分配）
    if (colors && paletteRef === p) return;
    paletteRef = p;
    const bg = safeHex(p.bg, PALETTE.bg);
    const fg = safeHex(p.fg, PALETTE.fg);
    const accent = safeHex(p.accent, PALETTE.accent);
    const violet = safeHex(p.violet, PALETTE.violet);
    const pink = safeHex(p.pink, PALETTE.pink);
    const cyan = safeHex(p.cyan, PALETTE.cyan);
    // 引用变了但颜色没变（palette 每次新建对象时）也不重建：逐项比 hex，不拼字符串
    if (
      colors &&
      colors.bgHex === bg &&
      colors.fgHex === fg &&
      colors.accentHex === accent &&
      colors.violetHex === violet &&
      colors.pinkHex === pink &&
      colors.cyanHex === cyan
    ) {
      return;
    }
    colors = {
      key: `${bg}|${fg}|${accent}|${violet}|${pink}|${cyan}`,
      bgHex: bg,
      fgHex: fg,
      accentHex: accent,
      violetHex: violet,
      pinkHex: pink,
      cyanHex: cyan,
      bgRamp: makeRamp(bg),
      fgRamp: makeRamp(fg),
      accentRamp: makeRamp(accent),
      violetRamp: makeRamp(violet),
      pinkRamp: makeRamp(pink),
      cyanRamp: makeRamp(cyan),
    };
    grads = null;
    staticSig = null;
  }

  /**
   * 单位空间渐变：只在配色变化时创建一次，靠 translate/scale 复用。
   *
   * 这里有四类「光环伙伴渐变」：
   *   · backplate：人物身后一块很淡的暗底（把人从背景里托出来，让青紫光环更跳）；
   *   · glow：大范围体积辉光；
   *   · ring：一圈很淡的径向辉光，正好落在刻度环上（环本体不再只有细线）；
   *   · core：光环内部的全息核。
   */
  function ensureGradients(g) {
    if (grads && colors && grads.key === colors.key) return;
    const C = colors;
    const backplate = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    backplate.addColorStop(0, rgba("#000000", 0.44));
    backplate.addColorStop(0.55, rgba("#000000", 0.3));
    backplate.addColorStop(0.82, rgba("#000000", 0.1));
    backplate.addColorStop(1, rgba("#000000", 0));
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, pick(C.fgRamp, 0.16));
    glow.addColorStop(0.25, pick(C.accentRamp, 0.24));
    glow.addColorStop(0.62, pick(C.violetRamp, 0.1));
    glow.addColorStop(1, pick(C.accentRamp, 0));
    const ring = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    ring.addColorStop(0, pick(C.accentRamp, 0));
    ring.addColorStop(0.56, pick(C.accentRamp, 0));
    ring.addColorStop(0.63, pick(C.accentRamp, 0.26));
    ring.addColorStop(0.68, pick(C.violetRamp, 0.16));
    ring.addColorStop(0.78, pick(C.accentRamp, 0));
    ring.addColorStop(1, pick(C.accentRamp, 0));
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    core.addColorStop(0, pick(C.accentRamp, 0.3));
    core.addColorStop(0.62, pick(C.violetRamp, 0.13));
    core.addColorStop(1, pick(C.violetRamp, 0));
    const reflect = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    reflect.addColorStop(0, pick(C.accentRamp, 0.3));
    reflect.addColorStop(0.5, pick(C.violetRamp, 0.1));
    reflect.addColorStop(1, pick(C.accentRamp, 0));
    const fog = g.createLinearGradient(0, 0, 0, 1);
    fog.addColorStop(0, pick(C.accentRamp, 0));
    fog.addColorStop(0.5, pick(C.accentRamp, 0.05));
    fog.addColorStop(1, pick(C.accentRamp, 0));
    grads = { key: C.key, backplate, glow, ring, core, reflect, fog };
  }

  /** 每帧一次的帧状态推进（同一帧里第二次调用直接返回）。 */
  function beginFrame(f) {
    const now = toNum(f.now, Number.NaN);
    if (frameRef === f && now === frameNow && Number.isFinite(now)) return;
    frameRef = f;
    frameNow = now;

    // entry 一般已经 resize 过了；万一帧里的锚点和缓存的不一致，以帧为准并重画静态层
    const fl = f.layout;
    if (fl && typeof fl === "object") {
      const hx = toNum(fl.haloX, L.haloX);
      const hy = toNum(fl.haloY, L.haloY);
      const hr = toNum(fl.haloR, L.haloR);
      const by = toNum(fl.baseY, L.baseY);
      const fx = toNum(fl.cx, L.cx);
      if (hx !== L.haloX || hy !== L.haloY || hr !== L.haloR || by !== L.baseY || fx !== L.cx) {
        adoptLayout(fl);
        staticSig = null;
      }
    }

    perfNow = Boolean(f.perf);
    const dt = clamp(toNum(f.dt, 0), 0, 0.2);
    const reduced = Boolean(f.reduced);
    const frozen = reduced || !f.playing;
    if (!frozen) {
      time += dt;
      dust.step(dt, f);
    }

    const targetEnergy = clamp01(toNum(f.energy, toNum(f.spec && f.spec.energy, 0)));
    const k = frozen ? 0 : 1 - Math.exp(-5 * dt);
    energy = clamp01(energy + (targetEnergy - energy) * k);

    const beat = clamp01(toNum(f.beat, toNum(f.spec && f.spec.beat, 0)));
    if (!reduced && beat > prevBeat + 0.12) flash = 1;
    prevBeat = beat;
    flash = Math.max(0, flash - dt * (reduced ? 6 : 3.4));
  }

  /** 静态层：布局 / 配色 / 档位有变化才重画一次。 */
  function ensureStatic() {
    if (!cg || !colors) return;
    const sig = staticSig;
    if (
      sig &&
      sig.w === w &&
      sig.h === h &&
      sig.dpr === dpr &&
      sig.baseY === L.baseY &&
      sig.cx === L.cx &&
      sig.haloX === L.haloX &&
      sig.haloY === L.haloY &&
      sig.haloR === L.haloR &&
      sig.key === colors.key &&
      sig.perf === perfNow
    ) {
      return;
    }
    const next = staticSig || (staticSig = {});
    next.w = w;
    next.h = h;
    next.dpr = dpr;
    next.baseY = L.baseY;
    next.cx = L.cx;
    next.haloX = L.haloX;
    next.haloY = L.haloY;
    next.haloR = L.haloR;
    next.key = colors.key;
    next.perf = perfNow;
    paintStatic();
  }

  /* ---- 静态舞台：只在重画时创建的渐变都留在这一层里 ---- */
  function paintStatic() {
    if (!cg) return;
    const C = colors;
    const W = w;
    const H = h;
    const haze = L.baseY;
    const rnd = mulberry32(0x51c0de);

    cg.setTransform(dpr, 0, 0, dpr, 0, 0);
    cg.globalAlpha = 1;
    cg.globalCompositeOperation = "source-over";
    cg.clearRect(0, 0, W, H);

    // 1) 深空底
    cg.fillStyle = C.bgHex;
    cg.fillRect(0, 0, W, H);

    // 2) 天空：顶部压一点紫、贴地平线压一点青，形成「天幕」的厚度
    const sky = cg.createLinearGradient(0, 0, 0, haze);
    sky.addColorStop(0, pick(C.violetRamp, 0.12));
    sky.addColorStop(0.45, pick(C.bgRamp, 0));
    sky.addColorStop(1, pick(C.accentRamp, 0.1));
    cg.fillStyle = sky;
    cg.fillRect(0, 0, W, haze);

    const backlight = cg.createRadialGradient(
      L.haloX,
      L.haloY,
      0,
      L.haloX,
      L.haloY,
      Math.max(W, H) * 0.62
    );
    backlight.addColorStop(0, pick(C.violetRamp, 0.2));
    backlight.addColorStop(0.45, pick(C.violetRamp, 0.09));
    backlight.addColorStop(1, pick(C.violetRamp, 0));
    cg.fillStyle = backlight;
    cg.fillRect(0, 0, W, haze);

    // 3) 星云：三团很淡的色雾，压在天空里
    for (let i = 0; i < 3; i += 1) {
      const nx = W * (0.16 + rnd() * 0.68);
      const ny = haze * (0.12 + rnd() * 0.55);
      const nr = Math.max(60, Math.min(W, H) * (0.16 + rnd() * 0.16));
      const ramp = i % 2 ? C.cyanRamp : C.pinkRamp;
      const ng = cg.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0, pick(ramp, 0.07));
      ng.addColorStop(1, pick(ramp, 0));
      cg.fillStyle = ng;
      cg.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    }

    // 4) 星空（确定性：同一尺寸每次重画都是同一张星图）
    const stars = perfNow ? 70 : 150;
    for (let i = 0; i < stars; i += 1) {
      const sx = rnd() * W;
      const sy = rnd() * (haze - H * 0.03);
      const sr = 0.4 + rnd() * 1.5;
      const sa = 0.22 + rnd() * 0.55;
      cg.fillStyle = pick(i % 5 === 0 ? C.violetRamp : C.fgRamp, sa);
      cg.fillRect(sx, sy, sr, sr);
    }

    // 5) 远景体积光束（静态底；缓慢摆动在 drawBeamSway 里额外叠一层）
    const beams = perfNow ? 2 : 3;
    for (let i = 0; i < beams; i += 1) {
      const dir = i - (beams - 1) / 2;
      const apexX = L.cx + dir * W * 0.11;
      const topX = L.cx + dir * W * 0.34;
      const spread = W * (0.1 + rnd() * 0.06);
      cg.beginPath();
      cg.moveTo(apexX - W * 0.012, haze + 2);
      cg.lineTo(apexX + W * 0.012, haze + 2);
      cg.lineTo(topX + spread, -H * 0.04);
      cg.lineTo(topX - spread, -H * 0.04);
      cg.closePath();
      cg.fillStyle = pick(i === (beams >> 1) ? C.accentRamp : C.violetRamp, 0.065 + rnd() * 0.045);
      cg.fill();
      // 内束：让光束有「中间更亮」的体积感
      cg.beginPath();
      cg.moveTo(apexX - W * 0.005, haze);
      cg.lineTo(apexX + W * 0.005, haze);
      cg.lineTo(topX + spread * 0.35, -H * 0.04);
      cg.lineTo(topX - spread * 0.35, -H * 0.04);
      cg.closePath();
      cg.fillStyle = pick(C.fgRamp, 0.035);
      cg.fill();
    }

    // 6) 地面：先铺一层渐变（越靠观众越暗），才有「往舞台下方看」的纵深
    const ground = cg.createLinearGradient(0, haze, 0, H);
    ground.addColorStop(0, pick(C.violetRamp, 0.1));
    ground.addColorStop(0.35, pick(C.bgRamp, 0));
    ground.addColorStop(1, rgba("#000000", 0.45));
    cg.fillStyle = ground;
    cg.fillRect(0, haze, W, H - haze);

    // 7) 地面反光环：全息光环投在地上的一圈光
    cg.save();
    cg.translate(L.haloX, haze + H * 0.008);
    cg.scale(1, 0.26);
    const refl = cg.createRadialGradient(0, 0, 0, 0, 0, L.haloR * 2.1);
    refl.addColorStop(0, pick(C.accentRamp, 0.3));
    refl.addColorStop(0.55, pick(C.violetRamp, 0.11));
    refl.addColorStop(1, pick(C.accentRamp, 0));
    cg.fillStyle = refl;
    cg.beginPath();
    cg.arc(0, 0, L.haloR * 2.1, 0, TAU);
    cg.fill();
    cg.restore();

    // 8) 透视地面网格：横线按幂次加密、纵线从消失点发散
    const rows = perfNow ? 8 : 14;
    const cols = perfNow ? 10 : 20;
    cg.lineWidth = 1;
    for (let i = 1; i <= rows; i += 1) {
      const t = i / rows;
      const y = haze + Math.pow(t, 1.9) * (H - haze) * 1.02;
      cg.strokeStyle = pick(C.accentRamp, 0.08 + t * 0.18);
      cg.beginPath();
      cg.moveTo(0, y);
      cg.lineTo(W, y);
      cg.stroke();
    }
    for (let j = -cols; j <= cols; j += 1) {
      const t = j / cols;
      const xb = L.cx + Math.tan(t * 0.92) * W * 0.72;
      cg.strokeStyle = pick(C.accentRamp, 0.07 + (1 - Math.abs(t)) * 0.13);
      cg.beginPath();
      cg.moveTo(L.cx, haze);
      cg.lineTo(xb, H * 1.01);
      cg.stroke();
    }

    // 9) 观众席光斑：地平线上的一排小灯（做成「人海」的点阵感）
    const crowd = perfNow ? 52 : 130;
    for (let i = 0; i < crowd; i += 1) {
      const lx = rnd() * W;
      const ly = haze + (rnd() - 0.42) * H * 0.035;
      const s = 0.8 + rnd() * 2;
      const ramp = i % 9 === 0 ? C.pinkRamp : i % 4 === 0 ? C.violetRamp : C.cyanRamp;
      cg.fillStyle = pick(ramp, 0.3 + rnd() * 0.6);
      cg.fillRect(lx, ly, s, s);
    }

    // 10) 地平线亮带 + 一条极细的切线
    const bandH = Math.max(18, H * 0.05);
    const hband = cg.createLinearGradient(0, haze - bandH, 0, haze + bandH);
    hband.addColorStop(0, pick(C.accentRamp, 0));
    hband.addColorStop(0.5, pick(C.accentRamp, 0.22));
    hband.addColorStop(1, pick(C.accentRamp, 0));
    cg.fillStyle = hband;
    cg.fillRect(0, haze - bandH, W, bandH * 2);
    cg.strokeStyle = pick(C.accentRamp, 0.3);
    cg.beginPath();
    cg.moveTo(0, haze + 1);
    cg.lineTo(W, haze + 1);
    cg.stroke();

    // 11) 顶部压暗（HUD 可读）+ 暗角（把视线收进舞台中央）
    const topScrim = cg.createLinearGradient(0, 0, 0, H * 0.26);
    topScrim.addColorStop(0, rgba("#000000", 0.34));
    topScrim.addColorStop(1, rgba("#000000", 0));
    cg.fillStyle = topScrim;
    cg.fillRect(0, 0, W, H * 0.26);

    const vig = cg.createRadialGradient(
      W * 0.5,
      H * 0.52,
      Math.min(W, H) * 0.28,
      W * 0.5,
      H * 0.52,
      Math.max(W, H) * 0.72
    );
    vig.addColorStop(0, rgba("#000000", 0));
    vig.addColorStop(1, rgba("#000000", 0.5));
    cg.fillStyle = vig;
    cg.fillRect(0, 0, W, H);

    cg.globalAlpha = 1;
    cg.globalCompositeOperation = "source-over";
  }

  /* ---- 远景光束的缓慢摆动（performance 档跳过；静态底仍在缓存里） ---- */
  function drawBeamSway(g) {
    if (perfNow) return;
    const sway = Math.sin(time * 0.23) * 0.06 + noise1D(time * 0.09, 3) * 0.03;
    const top = -h * 0.05;
    for (let i = 0; i < 2; i += 1) {
      const dir = i === 0 ? -1 : 1;
      const apexX = L.cx + dir * L.haloR * 0.5;
      const topX = L.cx + dir * (w * 0.16) + sway * w * dir;
      const spread = w * 0.1;
      g.beginPath();
      g.moveTo(apexX - spread * 0.12, L.baseY);
      g.lineTo(apexX + spread * 0.12, L.baseY);
      g.lineTo(topX + spread + sway * w * 0.4, top);
      g.lineTo(topX - spread + sway * w * 0.4, top);
      g.closePath();
      g.fillStyle = pick(i === 0 ? colors.accentRamp : colors.violetRamp, 0.03);
      g.fill();
    }
  }

  /* ---- 巨型全息光环（视觉锚点） ---- */
  function drawHalo(g, f) {
    const cx = L.haloX;
    const cy = L.haloY;
    const R = L.haloR;
    const breath = 1 + Math.sin(time * 1.15) * 0.012 + energy * 0.02;
    const G = grads;

    // 人物身后的暗底：把人从背景里托出来，也让青紫光环「浮」起来
    g.save();
    g.globalAlpha = 0.85;
    g.translate(cx, cy);
    g.scale(R * 1.85, R * 1.85);
    g.fillStyle = G.backplate;
    g.fillRect(-1, -1, 2, 2);
    g.restore();

    // 背后的大范围辉光（单位渐变 + 缩放，不新建渐变）
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = clamp01(0.42 + energy * 0.35 + flash * 0.2);
    g.translate(cx, cy);
    g.scale(R * 2.65 * breath, R * 2.65 * breath);
    g.fillStyle = G.glow;
    g.fillRect(-1, -1, 2, 2);
    g.restore();

    // 环本体的一圈径向辉光：刻度环不再是「没有体积」的细线
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = clamp01(0.62 + energy * 0.3 + flash * 0.15);
    g.translate(cx, cy);
    g.scale(R * 1.62 * breath, R * 1.62 * breath);
    g.fillStyle = G.ring;
    g.fillRect(-1, -1, 2, 2);
    g.restore();

    // 全息核
    g.save();
    g.globalAlpha = clamp01(0.34 + energy * 0.3);
    g.translate(cx, cy);
    g.scale(R * 1.04 * breath, R * 1.04 * breath);
    g.fillStyle = G.core;
    g.fillRect(-1, -1, 2, 2);
    g.restore();

    // 外圈：主环（亮）+ 外侧细环 + 内侧反向转的虚线
    g.lineCap = "butt";
    g.lineWidth = Math.max(1.2, R * 0.008);
    g.strokeStyle = pick(colors.accentRamp, 0.5 + energy * 0.25);
    g.beginPath();
    g.arc(cx, cy, R * 1.02, 0, TAU);
    g.stroke();
    g.lineWidth = Math.max(1, R * 0.005);
    g.strokeStyle = pick(colors.violetRamp, 0.32 + energy * 0.2);
    g.beginPath();
    g.arc(cx, cy, R * 1.2, 0, TAU);
    g.stroke();
    g.setLineDash([Math.max(4, R * 0.06), Math.max(6, R * 0.08)]);
    g.lineDashOffset = time * R * 0.04;
    g.strokeStyle = pick(colors.accentRamp, 0.3);
    g.beginPath();
    g.arc(cx, cy, R * 0.93, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.lineDashOffset = 0;

    // 刻度环：128 段频谱 → 72（perf 36）段刻度，缓慢旋转
    const ticks = perfNow ? PERF.ticksPerf : PERF.ticksSmooth;
    haloArcs(L, f.spec || null, time, { perf: perfNow, out: arcs, ticks, rotation: time * 0.16 });
    // glitch：只有平滑档且节拍够响时，整圈刻度被横向推开一点点（性能档跳过）
    const glitch =
      !perfNow && !f.reduced && flash > 0.4 ? noise1D(time * 26, 9) * R * 0.009 : 0;
    const r0 = R * 1.02;
    g.lineCap = "round";
    for (let b = 0; b < 3; b += 1) {
      g.beginPath();
      for (let i = 0; i < ticks; i += 1) {
        const a = arcs[i];
        if (!a) continue;
        const bucket = a.band > 0.66 ? 2 : a.band > 0.34 ? 1 : 0;
        if (bucket !== b) continue;
        const ca = Math.cos(a.a);
        const sa = Math.sin(a.a);
        const r1 = r0 + a.len;
        g.moveTo(cx + ca * r0 + glitch, cy + sa * r0);
        g.lineTo(cx + ca * r1 + glitch, cy + sa * r1);
      }
      g.strokeStyle = pick(
        b === 2 ? colors.fgRamp : b === 1 ? colors.accentRamp : colors.violetRamp,
        0.38 + b * 0.24 + energy * 0.08
      );
      g.lineWidth =
        b === 2 ? Math.max(1.8, R * 0.014) : b === 1 ? Math.max(1.4, R * 0.009) : Math.max(1.1, R * 0.006);
      g.stroke();
    }
    // 强频段的刻度尖上加一点亮点：「高频在跳」一眼能读出来
    g.beginPath();
    let spark = false;
    for (let i = 0; i < ticks; i += 1) {
      const a = arcs[i];
      if (!a || a.band <= 0.66) continue;
      const ca = Math.cos(a.a);
      const sa = Math.sin(a.a);
      const rr = r0 + a.len;
      const rad = Math.max(1.1, R * 0.009);
      g.moveTo(cx + ca * rr + glitch + rad, cy + sa * rr);
      g.arc(cx + ca * rr + glitch, cy + sa * rr, rad, 0, TAU);
      spark = true;
    }
    if (spark) {
      g.fillStyle = pick(colors.fgRamp, 0.9);
      g.fill();
    }
    g.lineCap = "butt";

    // 内圈：呼吸 + 反向旋转的虚线
    const innerR = R * (0.56 + 0.045 * Math.sin(time * 0.9) + energy * 0.06);
    g.lineWidth = Math.max(1.2, R * 0.011);
    g.strokeStyle = pick(colors.accentRamp, 0.34 + energy * 0.24);
    g.beginPath();
    g.arc(cx, cy, innerR, 0, TAU);
    g.stroke();

    g.setLineDash([Math.max(3, R * 0.05), Math.max(5, R * 0.09)]);
    g.lineDashOffset = -time * R * 0.08;
    g.strokeStyle = pick(colors.violetRamp, 0.38);
    g.lineWidth = Math.max(1, R * 0.008);
    g.beginPath();
    g.arc(cx, cy, innerR * 0.78, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.lineDashOffset = 0;

    // 内圈扫描弧（跟着节拍亮一点）
    const beat = clamp01(toNum(f.beat, toNum(f.spec && f.spec.beat, 0)));
    g.strokeStyle = pick(colors.fgRamp, 0.3 + beat * 0.2);
    g.lineWidth = Math.max(1.4, R * 0.011);
    g.beginPath();
    g.arc(cx, cy, innerR * 0.92, -0.7 + time * 0.32, 0.55 + time * 0.32);
    g.stroke();

    // 两条斜轨道椭圆环（反向缓慢旋转）
    drawOrbit(g, cx, cy, R * 1.34, R * 0.4, 0.34 + time * 0.05, colors.violetRamp, 0.42, time * 0.5);
    drawOrbit(g, cx, cy, R * 1.22, R * 0.34, -0.42 - time * 0.045, colors.pinkRamp, 0.36, -time * 0.42);

    // 光环投在地面上的一圈反光（同样用缓存的单位渐变）
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = clamp01(0.3 + energy * 0.25 + flash * 0.2);
    g.translate(L.haloX, L.baseY);
    g.scale(R * 1.95, R * 0.34);
    g.fillStyle = G.reflect;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
  }

  /** 一条斜轨道椭圆环 + 轨道上的两颗光点。 */
  function drawOrbit(g, cx, cy, rx, ry, rot, ramp, alpha, phase) {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, TAU);
    g.strokeStyle = pick(ramp, alpha);
    g.lineWidth = Math.max(1.2, rx * 0.006);
    g.stroke();
    g.globalCompositeOperation = "lighter";
    for (let k = 0; k < 2; k += 1) {
      const a = phase + k * Math.PI;
      g.fillStyle = pick(colors.fgRamp, k === 0 ? 0.9 : 0.5);
      g.beginPath();
      g.arc(Math.cos(a) * rx, Math.sin(a) * ry, Math.max(1.4, rx * 0.014), 0, TAU);
      g.fill();
    }
    g.restore();
  }

  /** 光尘：按深度分前后两层、按透明度分档，批量成几次 fill。 */
  function drawDust(g, back) {
    const view = dust.read();
    if (!view.count) return;
    const limit = Math.min(view.count, perfNow ? PERF.dustPerf : PERF.dustSmooth);
    const px = clamp(w / 1280, 0.6, 1.6);
    const ramp = back ? colors.accentRamp : colors.fgRamp;
    const buckets = back ? [0.14, 0.22, 0.32] : [0.3, 0.42];
    if (!back) g.globalCompositeOperation = "lighter";
    for (let b = 0; b < buckets.length; b += 1) {
      g.beginPath();
      let any = false;
      for (let i = 0; i < limit; i += 1) {
        const depth = view.z[i];
        const isFront = depth >= DUST_FRONT_Z;
        if (back === isFront) continue;
        const bi = back
          ? Math.min(2, Math.floor(depth * 3))
          : Math.min(1, Math.floor((depth - DUST_FRONT_Z) * 8));
        if (bi !== b) continue;
        const sx = view.x[i] * w;
        const sy = view.y[i] * h;
        const r = Math.max(0.6, view.size[i] * (0.45 + depth * 0.75) * px);
        g.moveTo(sx + r, sy);
        g.arc(sx, sy, r, 0, TAU);
        any = true;
      }
      if (!any) continue;
      g.fillStyle = pick(ramp, buckets[b]);
      g.fill();
    }
    if (!back) g.globalCompositeOperation = "source-over";
  }

  /** 节拍闪光：整屏一层极淡的提亮 + 一圈往外扩散的环（都压在 0.08 以下）。 */
  function drawFlash(g) {
    if (flash <= 0.001) return;
    const a = Math.min(FLASH_MAX_ALPHA, flash * FLASH_MAX_ALPHA);
    if (a <= 0.001) return;
    g.fillStyle = pick(colors.accentRamp, a);
    g.fillRect(0, 0, w, h);
    const R = L.haloR;
    g.strokeStyle = pick(colors.fgRamp, Math.min(FLASH_MAX_ALPHA, flash * 0.12));
    g.lineWidth = Math.max(1, R * 0.008);
    g.beginPath();
    g.arc(L.haloX, L.haloY, R * 1.05 + (1 - flash) * R * 0.55, 0, TAU);
    g.stroke();
  }

  /** 前景：极淡的地平线雾。 */
  function drawHorizonFog(g) {
    const bandH = Math.max(36, h * 0.15);
    g.save();
    g.translate(0, L.baseY - bandH * 0.55);
    g.scale(1, bandH);
    g.globalAlpha = clamp01(0.5 + energy * 0.4);
    g.fillStyle = grads.fog;
    g.fillRect(0, 0, w, 1);
    g.restore();
  }

  /** 前景：画面两侧的散景光斑（不进入中央人物与歌词区）。 */
  function drawBokeh(g) {
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < bokeh.length; i += 1) {
      const b = bokeh[i];
      const x = b.x * w;
      const y = b.y * h;
      const r = Math.max(2, b.r * Math.min(w, h));
      const ramp =
        b.tone === 0 ? colors.accentRamp : b.tone === 1 ? colors.violetRamp : colors.pinkRamp;
      g.fillStyle = pick(ramp, b.a);
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.fillStyle = pick(ramp, b.a * 0.55);
      g.beginPath();
      g.arc(x, y, r * 0.55, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  /* ---- 对外接口 ---- */

  function resize(nw, nh, ndpr, layout) {
    if (!alive) return;
    w = Math.max(1, Math.round(toNum(nw, w)));
    h = Math.max(1, Math.round(toNum(nh, h)));
    dpr = clamp(toNum(ndpr, 1), 1, 3);
    adoptLayout(layout);
    ensureCanvas();
    if (cv) {
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (cv.width !== pw) cv.width = pw;
      if (cv.height !== ph) cv.height = ph;
    }
    // resize 时还不知道这一帧的 palette：先作废签名，下一次 drawBack 用真实配色重画一次
    staticSig = null;
  }

  function drawBack(g, f) {
    if (!alive || !g || !f) return;
    beginFrame(f);
    ensureColors(f.palette);
    ensureGradients(g);
    ensureStatic();
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    if (cv) g.drawImage(cv, 0, 0, w, h);
    else {
      g.fillStyle = colors.bgHex;
      g.fillRect(0, 0, w, h);
    }
    drawBeamSway(g);
    drawHalo(g, f);
    drawDust(g, true);
    drawFlash(g);
    g.restore();
  }

  function drawFront(g, f) {
    if (!alive || !g || !f) return;
    beginFrame(f);
    ensureColors(f.palette);
    ensureGradients(g);
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    drawHorizonFog(g);
    drawBokeh(g);
    drawDust(g, false);
    g.restore();
  }

  function destroy() {
    if (!alive) return;
    alive = false;
    if (cv) {
      try {
        cv.width = 0;
        cv.height = 0;
      } catch {
        /* 环境已经回收了画布，忽略 */
      }
    }
    cv = null;
    cg = null;
    staticSig = null;
    paletteRef = null;
    colors = null;
    grads = null;
    dust.destroy();
    arcs.length = 0;
    bokeh.length = 0;
    frameRef = null;
    frameNow = Number.NaN;
  }

  return { resize, drawBack, drawFront, destroy };
}
