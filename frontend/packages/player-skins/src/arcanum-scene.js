// @ts-check
/* ==========================================================================
   arcanum-scene.js — 「星阵咏唱」的两块画布（纯绘制，不碰宿主契约）
   --------------------------------------------------------------------------
   这个文件只做两件事，输入全是数字，输出全是像素：

     createScene(canvas)  —— 远景 + 中景
       星空（缓慢旋转、随高频闪烁）→ 魔法雾 → 巨大的模糊法阵投影（远景）
       → 主魔法阵（多层同心圆 / 符文环 / 星座线 / 裂纹 / 涟漪 / 脉冲环 / 光柱）。
       最外面还有一圈**随旋律起伏的声浪**：采样点停在固定角度上，由频谱决定
       径向位移（不整体旋转 —— 转了圈就没人看得出哪里在起伏，见
       arcanum-timing.js 的「法阵外圈的那圈波纹」）。
       相机在这里以 depth 0.55 参与（近景动得多、远景动得少，层与层的相对
       位移才是「镜头在动」的知觉来源）。

     createDust(canvas)   —— 前景
       光尘 / 火星 / 余烬 / 羽毛 / 水滴 / 风线 / 星尘，七种粒子各对应一种元素。

   性能纪律（照抄本仓「特效样式」踩过的坑，见 docs/14、docs/23）：

     · **不用 ctx.filter / 不用 shader**。远处那个「模糊的法阵投影」是用
       多遍「线宽递增、透明度递减」的描边堆出来的（软边），比 blur 便宜一个
       数量级，也没有 WebView 上的合成开销。
     · **路径批处理**：一圈 60 根刻度是**一个 path** 一次 stroke，不是 60 次。
       符文与星座线同理（自己把点旋转好再拼进同一条 path）。
     · **渐变只创建一次**，之后靠 ctx.translate 复用（渐变坐标在用户空间里）。
     · **分辨率预算**：整窗背景会投到 2560×1440 的桌面上。画布按
       「≤ 2.2M 像素、DPR ≤ 1.5」求出实际分辨率，避免在 4K 桌面上按 3 倍 DPR
       去清三千多万像素。
     · 一帧内**只做一次昂贵的重算**（重建静态几何只在 resize 时发生）。
   ========================================================================== */

import { WAVE_GAIN, WAVE_POINTS, ringWaveIntensity, ringWaveTarget, stepWaveValue } from "./arcanum-timing.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

/** 确定性伪随机（见 arcanum-timing.js；图案必须可复现，所以不用 Math.random 定版式） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 拼 rgba 字符串（刻意不用模板串：这个包的文件在无构建产物的环境下也要能直接跑） */
function rgba(c, a) {
  return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")";
}

/** 色相旋转（元素切换时整块法阵换氛围，比重建调色板便宜得多） */
function rotateHue(rgb, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const s = Math.sqrt(1 / 3) * sin;
  const t = (1 - cos) / 3;
  const r = rgb[0];
  const gr = rgb[1];
  const b = rgb[2];
  const m = [
    [cos + t, t - s, t + s],
    [t + s, cos + t, t - s],
    [t - s, t + s, cos + t],
  ];
  return [
    clamp(m[0][0] * r + m[0][1] * gr + m[0][2] * b, 0, 255),
    clamp(m[1][0] * r + m[1][1] * gr + m[1][2] * b, 0, 255),
    clamp(m[2][0] * r + m[2][1] * gr + m[2][2] * b, 0, 255),
  ];
}

/** 画布分辨率：受 DPR 上限与像素预算双重约束（见文件头「性能纪律」） */
function fitCanvas(canvas) {
  const W = Math.max(1, canvas.clientWidth || 0);
  const H = Math.max(1, canvas.clientHeight || 0);
  const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const budget = Math.sqrt(2200000 / (W * H));
  const res = clamp(Math.min(dpr, 1.5, budget || 1), 0.5, 1.5);
  const pw = Math.max(1, Math.round(W * res));
  const ph = Math.max(1, Math.round(H * res));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const g = canvas.getContext("2d");
  if (g) g.setTransform(res, 0, 0, res, 0, 0);
  return { W, H, res };
}

/* ==========================================================================
   生成一组「符文」折线
   --------------------------------------------------------------------------
   刻意不用字体画符文：那会依赖系统装了哪种符文 / CJK 字体，还得每帧几十次
   fillText（文本光栅化比描线贵）。这里用确定性随机造 12 个折线字形，
   同一颗种子每次挂载都一样。
   ========================================================================== */

export function buildRunes(seed) {
  const rnd = mulberry32(seed);
  const glyphs = [];
  for (let g = 0; g < 12; g += 1) {
    const strokes = [];
    const sn = 2 + Math.floor(rnd() * 3);
    for (let s = 0; s < sn; s += 1) {
      const pts = [];
      const steps = 2 + Math.floor(rnd() * 3);
      let x = (rnd() - 0.5) * 1.3;
      let y = (rnd() - 0.5) * 1.3;
      pts.push([x, y]);
      for (let i = 1; i < steps; i += 1) {
        x += (rnd() - 0.5) * 1.2;
        y += (rnd() - 0.5) * 1.2;
        pts.push([x, y]);
      }
      strokes.push(pts);
    }
    glyphs.push(strokes);
  }
  return glyphs;
}

/** 把一个符文按 (rot, scale) 变换后拼进同一条 path */
function traceRune(g, glyph, cx, cy, rot, scale) {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  for (const stroke of glyph) {
    for (let i = 0; i < stroke.length; i += 1) {
      const px = stroke[i][0] * scale;
      const py = stroke[i][1] * scale;
      const x = cx + px * cos - py * sin;
      const y = cy + px * sin + py * cos;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  }
}

/* ==========================================================================
   远景 + 中景
   ========================================================================== */

/**
 * @param {HTMLCanvasElement|null} canvas
 */
export function createScene(canvas) {
  const noop = {
    resize: () => {},
    setSafeArea: () => {},
    setPalette: () => {},
    setHue: () => {},
    setPattern: () => {},
    frame: () => {},
    event: () => {},
    debug: () => ({}),
    destroy: () => {},
  };
  if (!canvas || typeof canvas.getContext !== "function") return noop;
  const g = canvas.getContext("2d");
  if (!g) return noop;

  let W = 0;
  let H = 0;
  let R = 0;
  let cx = 0;
  let cy = 0;
  let palette = [
    [150, 190, 255],
    [120, 140, 235],
    [255, 226, 160],
  ];
  let tinted = palette.map((c) => c.slice());
  let hue = 0;
  let bgA = [10, 12, 26];
  let bgB = [4, 5, 12];
  let glyphs = buildRunes(1337);
  let farGlyphs = buildRunes(4242);

  /** @type {Array<{x:number,y:number,r:number,a:number,sp:number,ph:number,c:number}>} */
  let stars = [];
  /** @type {Array<{a:number,r:number,ph:number}>} */
  let nodes = [];
  /** @type {Array<[number,number]>} */
  let links = [];
  /** @type {number[][][]} 每条裂纹是一串 [x,y]（相对法阵半径的比例） */
  let cracks = [];
  const ripples = [];
  const pulses = [];
  for (let i = 0; i < 5; i += 1) ripples.push({ live: false, t: 0, x: 0, y: 0, r0: 0, r1: 0 });
  for (let i = 0; i < 4; i += 1) pulses.push({ live: false, t: 0, r0: 0, r1: 0 });

  let gradDisc = null;
  let gradRing = null;
  let gradVignette = null;
  let gradBeam = null;
  /**
   * 法阵外圈那圈波纹线：72 个采样点，快起慢落地跟着频谱起伏。
   * ★ 采样点停在固定的角度上（不整体旋转）—— 见 arcanum-timing.js 的
   *   「法阵外圈的那圈波纹」一节：转了圈就没人看得出哪里在起伏。
   */
  const WAVE_N = WAVE_POINTS;
  const wave = new Float32Array(WAVE_N);
  /** 每个采样点自己的行进包络相位：避免整圈一起张缩（那看起来像在调音量） */
  const wavePhase = new Float32Array(WAVE_N);
  for (let i = 0; i < WAVE_N; i += 1) wavePhase[i] = (i * 2.399963) % TAU;
  const fog = [];
  for (let i = 0; i < 3; i += 1) fog.push({ ph: i * 2.1, r: 100, grad: null });

  let shatter = 0;
  let flash = 0;
  let rippleCursor = 0;
  let pulseCursor = 0;
  const scatterRnd = mulberry32(20260101);
  /**
   * 上下被 chrome（标题栏 / 详情页头部 / 底栏）压住的留白（px）。
   * 由皮肤在量完安全区之后写进来（见 arcanum.js 的 measureSafeArea），
   * 法阵据此把自己摆进"真正看得见的那块画面"的正中。
   */
  const canvasSafe = { top: 0, bottom: 0 };

  function rebuild() {
    const fit = fitCanvas(canvas);
    W = fit.W;
    H = fit.H;
    /**
     * ★ 法阵要**整体完整地**待在"能看见的那块画面"里。
     *
     * 舞台铺满整窗，上下却被标题栏 / 详情页头部 / 底栏压着（见 --ar-safe-*），
     * 所以"画面中心"不是 H/2，而是安全区的中点。早先圆心固定在 H * 0.58：
     * 一来比中点低了 65px（1440×808 时），二来最外那圈波纹的波峰还会再往外
     * 顶出半径的 42%，于是下半圈连同外环一起被底栏吃掉 —— 看起来就是
     * "魔法阵没在中间、还显示不全"。
     *
     * 现在的做法：先按**安全区**短边求半径（留出波峰那 42% 的余量），
     * 再把圆心放在安全区正中。
     */
    const safeTop = canvasSafe.top;
    const safeBottom = canvasSafe.bottom;
    const safeH = Math.max(1, H - safeTop - safeBottom);
    const safeW = W;
    // 可见区域的短边：半径按它算，法阵才不会比画面还高
    const visible = Math.max(1, Math.min(safeW, safeH));
    // 1.18 是外环半径倍数，1.42 是波峰能到达的最大外扩（见 WAVE_GAIN / 波幅公式）
    R = Math.max(40, (visible * 0.5) / (1.18 * 1.42));
    cx = W / 2;
    cy = safeTop + safeH / 2;
    // 法阵中心也写给 CSS：HUD / 空态要对齐它
    if (canvas.parentElement) {
      canvas.parentElement.style.setProperty("--ar-core-x", cx.toFixed(1) + "px");
      canvas.parentElement.style.setProperty("--ar-core-y", cy.toFixed(1) + "px");
    }

    const rnd = mulberry32(9182);
    stars = [];
    for (let i = 0; i < 220; i += 1) {
      stars.push({
        x: (rnd() - 0.5) * 2.3,
        y: (rnd() - 0.5) * 2.3,
        r: 0.6 + rnd() * 1.5,
        a: 0.18 + rnd() * 0.6,
        sp: 0.35 + rnd() * 1.7,
        ph: rnd() * TAU,
        c: rnd() < 0.22 ? 1 : rnd() < 0.5 ? 2 : 0,
      });
    }

    nodes = [];
    links = [];
    const nodeCount = 16;
    for (let i = 0; i < nodeCount; i += 1) {
      nodes.push({ a: (i / nodeCount) * TAU + (rnd() - 0.5) * 0.16, r: 0.72 + rnd() * 0.34, ph: rnd() * TAU });
    }
    for (let i = 0; i < nodeCount; i += 1) {
      links.push([i, (i + 5) % nodeCount]);
      if (rnd() < 0.5) links.push([i, (i + 7) % nodeCount]);
    }

    cracks = [];
    for (let i = 0; i < 9; i += 1) {
      const pts = [[0, 0]];
      let rr = 0.18;
      let aa = (i / 9) * TAU + (rnd() - 0.5) * 0.3;
      while (rr < 0.96) {
        rr += 0.1 + rnd() * 0.16;
        aa += (rnd() - 0.5) * 0.34;
        pts.push([Math.cos(aa) * rr, Math.sin(aa) * rr]);
      }
      cracks.push(pts);
    }

    gradDisc = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.05);
    gradDisc.addColorStop(0, rgba(tinted[1], 0.2));
    gradDisc.addColorStop(0.62, rgba(tinted[1], 0.07));
    gradDisc.addColorStop(1, rgba(tinted[1], 0));

    // 波纹环的环形底衬（绝对坐标：填充时不要再 translate 这个 ctx）
    gradRing = g.createRadialGradient(cx, cy, R * 1.0, cx, cy, R * 1.62);
    gradRing.addColorStop(0, rgba(tinted[0], 0));
    gradRing.addColorStop(0.3, rgba(tinted[0], 0.18));
    gradRing.addColorStop(0.66, rgba(tinted[1], 0.1));
    gradRing.addColorStop(1, rgba(tinted[1], 0));

    gradVignette = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, Math.max(W, H) * 0.78);
    gradVignette.addColorStop(0, "rgba(0,0,0,0)");
    gradVignette.addColorStop(1, "rgba(0,0,0,0.62)");

    gradBeam = g.createLinearGradient(0, 0, 0, -R * 1.6);
    gradBeam.addColorStop(0, rgba(tinted[0], 0.4));
    gradBeam.addColorStop(0.5, rgba(tinted[2], 0.16));
    gradBeam.addColorStop(1, rgba(tinted[2], 0));

    for (const f of fog) {
      f.r = R * 1.5;
      f.grad = g.createRadialGradient(0, 0, 0, 0, 0, f.r);
      f.grad.addColorStop(0, rgba(tinted[1], 0.14));
      f.grad.addColorStop(1, rgba(tinted[1], 0));
    }
  }

  function applyTint() {
    tinted = palette.map((c) => (hue ? rotateHue(c, hue) : c.slice()));
  }

  function spawnRipple() {
    const p = ripples[rippleCursor % ripples.length];
    rippleCursor += 1;
    const a = scatterRnd() * TAU;
    const rr = scatterRnd() * R * 0.5;
    p.live = true;
    p.t = 0;
    p.x = Math.cos(a) * rr;
    p.y = Math.sin(a) * rr * 0.6;
    p.r0 = R * 0.06;
    p.r1 = R * (0.4 + scatterRnd() * 0.5);
  }

  function spawnPulse() {
    const p = pulses[pulseCursor % pulses.length];
    pulseCursor += 1;
    p.live = true;
    p.t = 0;
    p.r0 = R * 0.16;
    p.r1 = R * (1.25 + scatterRnd() * 0.5);
  }

  return {
    resize() {
      rebuild();
      applyTint();
    },
    /**
     * 告诉法阵"上下各有多少 px 被 chrome 压住"——它据此把圆心放到安全区正中，
     * 并按安全区短边求半径，保证整个法阵（连波纹波峰）都完整可见。
     * @param {number} top px
     * @param {number} bottom px
     */
    setSafeArea(top, bottom) {
      const t = Math.max(0, Number(top) || 0);
      const b = Math.max(0, Number(bottom) || 0);
      if (Math.abs(t - canvasSafe.top) < 0.5 && Math.abs(b - canvasSafe.bottom) < 0.5) return;
      canvasSafe.top = t;
      canvasSafe.bottom = b;
      rebuild();
      applyTint();
    },
    setPalette(colors, bg) {
      if (Array.isArray(colors) && colors.length >= 3) palette = colors.slice(0, 3);
      if (Array.isArray(bg) && bg.length >= 2) {
        bgA = bg[0];
        bgB = bg[1];
      }
      applyTint();
      rebuild();
    },
    setHue(deg) {
      const next = Number(deg) || 0;
      if (Math.abs(next - hue) < 1.5) return;
      hue = next;
      applyTint();
      rebuild();
    },
    setPattern(seed) {
      glyphs = buildRunes(seed);
      farGlyphs = buildRunes(seed + 977);
    },
    event(type) {
      if (type === "shatter") {
        shatter = 1;
        for (let i = 0; i < 3; i += 1) spawnPulse();
        for (let i = 0; i < 4; i += 1) spawnRipple();
      } else if (type === "flash") {
        flash = 1;
        spawnPulse();
      } else if (type === "dissolve") {
        for (let i = 0; i < 5; i += 1) spawnRipple();
      }
    },

    /**
     * @param {number} t 秒（累计）
     * @param {number} dt 秒
     * @param {{low:number,bass:number,mid:number,high:number,energy:number,onset:number,thunder:number,arcane:number,voidLevel:number,spin:number,alpha:number,camX:number,camY:number,zoom:number,playing:boolean,tempoPulse?:number,bands?:number[]|Float32Array|null,bandsLive?:boolean}} s
     */
    frame(t, dt, s) {
      if (!W || !H) return;
      shatter *= Math.exp(-dt / 0.55);
      if (shatter < 0.003) shatter = 0;
      flash *= Math.exp(-dt / 0.16);
      if (flash < 0.004) flash = 0;

      const low = clamp(s.low || 0, 0, 1);
      const bass = clamp(s.bass || 0, 0, 1);
      const mid = clamp(s.mid || 0, 0, 1);
      const high = clamp(s.high || 0, 0, 1);
      const onset = clamp(s.onset || 0, 0, 1);
      const thunder = clamp(s.thunder || 0, 0, 1);
      const arcane = clamp(s.arcane || 0, 0, 1);
      const voidLevel = clamp(s.voidLevel || 0, 0, 1);
      const alpha = clamp(s.alpha == null ? 1 : s.alpha, 0, 1);
      const spin = clamp(s.spin == null ? 1 : s.spin, 0, 3);
      const parX = (s.camX || 0) * 0.55;
      const parY = (s.camY || 0) * 0.55;
      const zoom = clamp(s.zoom || 1, 0.8, 1.3);

      // —— 底：**清空而不是铺底色** ——
      // 深空底色由整窗背景层（.ar-void）用 CSS 渐变负责，这块画布保持透明，
      // 于是「远景 / 魔法雾」不用为了不遮住背景而反复算 alpha。
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, W, H);

      // —— 远景：星空（视差 0.16 + 缓慢整体旋转 + 随高频闪烁）——
      const skyAng = t * 0.006 * spin;
      const skyCos = Math.cos(skyAng);
      const skySin = Math.sin(skyAng);
      g.globalCompositeOperation = "lighter";
      for (const st of stars) {
        const px = st.x * W * 0.5;
        const py = st.y * H * 0.5;
        const rx = px * skyCos - py * skySin + cx + parX * 0.16;
        const ry = px * skySin + py * skyCos + cy * 0.55 + parY * 0.16;
        if (rx < -4 || rx > W + 4 || ry < -4 || ry > H + 4) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * st.sp + st.ph);
        g.globalAlpha = clamp(st.a * (0.4 + 0.6 * tw) * (0.75 + 0.5 * high), 0, 1);
        g.fillStyle = rgba(tinted[st.c], 1);
        const size = st.r * (1 + high * 0.35);
        g.fillRect(rx, ry, size, size);
      }
      g.globalAlpha = 1;

      // —— 远景：魔法雾（三团缓慢漂移的软光）——
      for (let i = 0; i < fog.length; i += 1) {
        const f = fog[i];
        const fx = cx + Math.sin(t * 0.031 + f.ph) * W * 0.18 + parX * 0.35;
        const fy = cy + Math.cos(t * 0.024 + f.ph * 1.3) * H * 0.14 + parY * 0.35;
        g.globalAlpha = clamp((0.5 + voidLevel * 0.5) * (0.7 + alpha * 0.5), 0, 1);
        g.save();
        g.translate(fx, fy);
        g.fillStyle = f.grad;
        g.fillRect(-f.r, -f.r, f.r * 2, f.r * 2);
        g.restore();
      }
      g.globalAlpha = 1;

      // —— 远景：巨大而模糊的法阵投影（多遍描边做软边，不用 blur）——
      const farRot = t * 0.014 * spin;
      const farR = R * (2.05 + Math.sin(t * 0.05) * 0.03) * zoom;
      for (let pass = 0; pass < 3; pass += 1) {
        const lw = [6, 2.4, 0.9][pass];
        const la = [0.03, 0.045, 0.06][pass] * (0.55 + alpha * 0.7);
        g.lineWidth = lw;
        g.strokeStyle = rgba(tinted[1], la);
        g.beginPath();
        g.moveTo(cx + farR, cy);
        g.arc(cx, cy, farR, 0, TAU);
        g.moveTo(cx + farR * 0.74, cy);
        g.arc(cx, cy, farR * 0.74, 0, TAU);
        for (let k = 0; k < 7; k += 1) {
          const a1 = farRot + (k / 7) * TAU;
          const a2 = farRot + (((k * 3) % 7) / 7) * TAU;
          g.moveTo(cx + Math.cos(a1) * farR * 0.74, cy + Math.sin(a1) * farR * 0.74);
          g.lineTo(cx + Math.cos(a2) * farR * 0.74, cy + Math.sin(a2) * farR * 0.74);
        }
        for (let k = 0; k < 12; k += 1) {
          const a = farRot + (k / 12) * TAU;
          traceRune(
            g,
            farGlyphs[k],
            cx + Math.cos(a) * farR * 0.87,
            cy + Math.sin(a) * farR * 0.87,
            a + Math.PI / 2,
            farR * 0.055
          );
        }
        g.stroke();
      }

      // —— 中景：主魔法阵 ——
      const arrX = cx + parX;
      const arrY = cy + parY;
      const breathe = 1 + low * 0.018 + onset * 0.03 + arcane * 0.012;
      /** 一圈刻度（一个 path 一次 stroke） */
      const drawTicks = (radius, count, len, width, color, a) => {
        g.lineWidth = width;
        g.strokeStyle = rgba(color, a);
        g.beginPath();
        for (let i = 0; i < count; i += 1) {
          const a1 = (i / count) * TAU;
          const a2 = a1 + (TAU / count) * 0.42;
          const r1 = radius * (1 - len);
          g.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
          g.lineTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
          if (i % 4 === 0) {
            g.moveTo(Math.cos(a2) * r1 * 0.94, Math.sin(a2) * r1 * 0.94);
            g.lineTo(Math.cos(a2) * radius, Math.sin(a2) * radius);
          }
        }
        g.stroke();
      };

      g.globalAlpha = clamp(alpha * (0.85 + low * 0.3), 0, 1);
      g.save();
      g.translate(arrX, arrY);
      g.fillStyle = gradDisc;
      g.fillRect(-R * 1.05, -R * 1.05, R * 2.1, R * 2.1);
      g.restore();
      g.globalAlpha = 1;

      g.globalCompositeOperation = "lighter";
      const rings = [
        { r: 1, dir: 1, sp: 0.3, w: 1.5, col: 0, a: 0.85 },
        { r: 0.9, dir: -1, sp: 0.22, w: 1, col: 1, a: 0.5 },
        { r: 0.68, dir: 1, sp: 0.36, w: 1, col: 0, a: 0.45, runes: true },
        { r: 0.44, dir: -1, sp: 0.5, w: 1.1, col: 2, a: 0.55, runes: true },
        { r: 0.26, dir: 1, sp: 0.62, w: 1.4, col: 0, a: 0.6, ticks: 18, len: 0.09 },
      ];
      for (let i = 0; i < rings.length; i += 1) {
        const ring = rings[i];
        const rr = R * ring.r * breathe + shatter * Math.sin(t * 41 + i * 2.3) * 0.06 * R;
        const rot = t * ring.sp * spin * ring.dir;
        g.save();
        g.translate(arrX, arrY);
        g.rotate(rot);
        g.lineWidth = ring.w;
        g.strokeStyle = rgba(tinted[ring.col], clamp(ring.a * alpha * (0.75 + low * 0.4 + thunder * 0.5), 0, 1));
        g.beginPath();
        g.moveTo(rr, 0);
        g.arc(0, 0, rr, 0, TAU);
        g.stroke();
        if (ring.runes) {
          g.lineWidth = 1;
          g.strokeStyle = rgba(tinted[ring.col], clamp(0.55 * alpha * (0.6 + high * 0.7), 0, 1));
          g.beginPath();
          for (let k = 0; k < 10; k += 1) {
            const a = (k / 10) * TAU;
            traceRune(
              g,
              glyphs[(i * 5 + k) % glyphs.length],
              Math.cos(a) * rr,
              Math.sin(a) * rr,
              a + Math.PI / 2,
              R * 0.055
            );
          }
          g.stroke();
        }
        g.restore();
      }

      // 刻度圈单独画：它不跟着旋转 —— 静止的刻度更能读出「法阵在转」
      g.save();
      g.translate(arrX, arrY);
      drawTicks(R * 1.06 * breathe, 60, 0.028, 1.1, tinted[0], clamp(0.5 * alpha * (0.7 + onset * 0.9), 0, 1));
      drawTicks(R * 0.9 * breathe, 34, 0.05, 0.9, tinted[1], clamp(0.36 * alpha, 0, 1));
      g.restore();

      // 星座线：高频越强越亮，节点随拍闪
      const conA = clamp(alpha * (0.05 + high * 0.5), 0, 1);
      if (conA > 0.02) {
        g.lineWidth = 1;
        g.strokeStyle = rgba(tinted[0], conA);
        g.beginPath();
        for (const pair of links) {
          const n1 = nodes[pair[0]];
          const n2 = nodes[pair[1]];
          g.moveTo(arrX + Math.cos(n1.a) * R * n1.r * breathe, arrY + Math.sin(n1.a) * R * n1.r * breathe);
          g.lineTo(arrX + Math.cos(n2.a) * R * n2.r * breathe, arrY + Math.sin(n2.a) * R * n2.r * breathe);
        }
        g.stroke();
        g.fillStyle = rgba(tinted[2], clamp(0.25 + high * 0.7, 0, 1) * alpha);
        g.beginPath();
        for (const n of nodes) {
          const tw = 0.6 + 0.4 * Math.sin(t * 2.2 + n.ph);
          const nx = arrX + Math.cos(n.a) * R * n.r * breathe;
          const ny = arrY + Math.sin(n.a) * R * n.r * breathe;
          g.moveTo(nx + 2.2 * tw, ny);
          g.arc(nx, ny, 2.2 * tw, 0, TAU);
        }
        g.fill();
      }

      // —— 法阵外圈：三圈声浪（随旋律起伏，不转圈）——
      // 需求「魔法阵周围可以弄一圈波纹线条随着旋律而起伏」。做法见
      // arcanum-timing.js 的「法阵外圈的那圈波纹」一节：把整条频谱按频率轴
      // 铺在圆周的三段上（首尾都落在安静的两头 → 接缝平滑），采样点停在**固定
      // 角度**上，于是"哪里在起伏"一眼就看得出来。
      // ★ 幅度：位移 = 半径 × WAVE_GAIN × 幅度 × 强度。早先只有 6.5%~19% 的
      //   半径位移，又叠了一层整体旋转，实际只有一条几乎不动的细线 —— 现在满幅
      //   有 30% 半径，安静段落也留着约三成的持续起伏，肉眼一定能看到。
      const energy = clamp(s.energy || 0, 0, 1);
      const intensity = ringWaveIntensity(s);
      const waveBase = R * 1.18 * breathe;
      const waveAmp = R * WAVE_GAIN * (0.34 + 0.66 * intensity);
      for (let i = 0; i < WAVE_N; i += 1) {
        stepWaveValue(wave, i, ringWaveTarget(s, i, WAVE_N, t), 0.5, 0.12);
      }
      /** 某一个采样点的径向位移（含每个点自己的行进包络） */
      const waveR = (i) => {
        const idx = i % WAVE_N;
        const env = 0.82 + 0.18 * Math.sin(t * 1.35 + wavePhase[idx]);
        return wave[idx] * env;
      };

      // 环带：外圈正向走一圈，再用内圈反向走回来，闭合成一条带状路径
      g.lineWidth = 1.15;
      g.beginPath();
      for (let i = 0; i <= WAVE_N; i += 1) {
        const idx = i % WAVE_N;
        const ang = (idx / WAVE_N) * TAU;
        const r = waveBase + waveAmp * waveR(idx);
        const x = arrX + Math.cos(ang) * r;
        const y = arrY + Math.sin(ang) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      for (let i = WAVE_N; i >= 0; i -= 1) {
        const idx = i % WAVE_N;
        const ang = (idx / WAVE_N) * TAU;
        const r = waveBase - R * 0.09 + waveAmp * 0.55 * waveR(idx);
        g.lineTo(arrX + Math.cos(ang) * r, arrY + Math.sin(ang) * r);
      }
      g.closePath();
      g.globalAlpha = clamp(alpha, 0, 1);
      g.fillStyle = gradRing;
      g.fill();
      g.globalAlpha = 1;

      // 波峰上的亮线
      g.strokeStyle = rgba(tinted[0], clamp(alpha * (0.34 + energy * 0.45 + thunder * 0.35), 0, 1));
      g.beginPath();
      for (let i = 0; i <= WAVE_N; i += 1) {
        const idx = i % WAVE_N;
        const ang = (idx / WAVE_N) * TAU;
        const r = waveBase + waveAmp * waveR(idx);
        const x = arrX + Math.cos(ang) * r;
        const y = arrY + Math.sin(ang) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();

      // 波峰向外甩出的短线：跟着起伏走 —— 谷底没有线、浪尖伸得最长，
      // 于是"起伏的形状"靠这一圈长短线也能读出来（哪怕色弱 / 小窗口）
      g.lineWidth = 1;
      g.strokeStyle = rgba(tinted[2], clamp(alpha * 0.34, 0, 1));
      g.beginPath();
      for (let i = 0; i < WAVE_N; i += 2) {
        const v = waveR(i);
        if (v < 0.24) continue;
        const ang = (i / WAVE_N) * TAU;
        const r0 = waveBase + waveAmp * v;
        const r1 = r0 + R * 0.22 * WAVE_GAIN * v * (0.6 + intensity);
        g.moveTo(arrX + Math.cos(ang) * r0, arrY + Math.sin(ang) * r0);
        g.lineTo(arrX + Math.cos(ang) * r1, arrY + Math.sin(ang) * r1);
      }
      g.stroke();

      // 中心七芒星 + 同心圆（法阵的「机芯」）
      g.save();
      g.translate(arrX, arrY);
      g.rotate(-t * 0.09 * spin);
      g.lineWidth = 1.6;
      g.strokeStyle = rgba(tinted[0], clamp(alpha * (0.5 + low * 0.5 + thunder * 0.6), 0, 1));
      g.beginPath();
      g.moveTo(R * 0.24, 0);
      g.arc(0, 0, R * 0.24, 0, TAU);
      g.moveTo(R * 0.12, 0);
      g.arc(0, 0, R * 0.12, 0, TAU);
      g.stroke();
      g.lineWidth = 1.2;
      g.strokeStyle = rgba(tinted[2], clamp(alpha * (0.35 + mid * 0.6), 0, 1));
      g.beginPath();
      for (let k = 0; k < 7; k += 1) {
        const a1 = (k / 7) * TAU;
        const a2 = (((k * 3) % 7) / 7) * TAU;
        g.moveTo(Math.cos(a1) * R * 0.24, Math.sin(a1) * R * 0.24);
        g.lineTo(Math.cos(a2) * R * 0.24, Math.sin(a2) * R * 0.24);
      }
      g.stroke();
      g.restore();

      // 地：裂纹（低频越强越亮，重拍时闪一下）
      const crackA = clamp(alpha * (0.1 + low * 0.55 + onset * 0.45), 0, 1);
      if (crackA > 0.03) {
        g.lineWidth = 1.1;
        g.strokeStyle = rgba(tinted[2], crackA);
        g.beginPath();
        for (const crack of cracks) {
          for (let i = 0; i < crack.length; i += 1) {
            const x = arrX + crack[i][0] * R * breathe;
            const y = arrY + crack[i][1] * R * breathe;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
        }
        g.stroke();
      }

      // 水：涟漪
      for (const p of ripples) {
        if (!p.live) continue;
        p.t += dt;
        const k = p.t / 1.1;
        if (k >= 1) {
          p.live = false;
          continue;
        }
        const rr = p.r0 + (p.r1 - p.r0) * k;
        g.lineWidth = 1.2;
        g.strokeStyle = rgba(tinted[1], clamp((1 - k) * alpha * (0.25 + bass * 0.7), 0, 1));
        g.beginPath();
        g.ellipse(arrX + p.x, arrY + p.y, rr, rr * 0.62, 0, 0, TAU);
        g.stroke();
      }

      // 雷：脉冲环
      for (const p of pulses) {
        if (!p.live) continue;
        p.t += dt;
        const k = p.t / 0.95;
        if (k >= 1) {
          p.live = false;
          continue;
        }
        const rr = p.r0 + (p.r1 - p.r0) * k;
        g.lineWidth = 2.2 * (1 - k) + 0.6;
        g.strokeStyle = rgba(tinted[0], clamp((1 - k) * (0.5 + thunder * 0.5), 0, 1));
        g.beginPath();
        g.moveTo(arrX + rr, arrY);
        g.arc(arrX, arrY, rr, 0, TAU);
        g.stroke();
      }

      // 奥术光柱：长音时从法阵中心持续上升
      if (arcane > 0.02) {
        g.save();
        g.translate(arrX, arrY);
        g.globalAlpha = clamp(arcane * 0.58 * alpha, 0, 1);
        g.fillStyle = gradBeam;
        const bw = R * 0.26 * (0.8 + arcane * 0.4);
        g.fillRect(-bw / 2, -R * 1.6, bw, R * 1.6);
        g.globalAlpha = 1;
        g.restore();
      }

      // 停顿：整块暗下来 + 渐晕加深
      g.globalCompositeOperation = "source-over";
      g.fillStyle = gradVignette;
      g.globalAlpha = clamp(0.55 + voidLevel * 0.4, 0, 1);
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
      // 停顿：先用偏亮的底色把画面往下压（bgA），再叠一层更深的（bgB）
      if (voidLevel > 0.01) {
        g.fillStyle = rgba(bgA, clamp(voidLevel * 0.22, 0, 0.3));
        g.fillRect(0, 0, W, H);
        g.fillStyle = rgba(bgB, clamp(voidLevel * 0.38, 0, 0.5));
        g.fillRect(0, 0, W, H);
      }

      // 雷：白闪
      if (flash > 0.004) {
        g.globalCompositeOperation = "lighter";
        g.fillStyle = rgba(tinted[0], clamp(flash * 0.16, 0, 0.25));
        g.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = "source-over";
    },

    /** 自检用：分辨率 / 半径 / 当前图案 */
    debug() {
      return { w: W, h: H, R: Math.round(R), hue, stars: stars.length, glyphs: glyphs.length };
    },

    destroy() {
      if (canvas.width) {
        canvas.width = 1;
        canvas.height = 1;
      }
    },
  };
}

/* ==========================================================================
   前景：七种粒子（对应七元素）
   ========================================================================== */

/**
 * @param {HTMLCanvasElement|null} canvas
 */
export function createDust(canvas) {
  const noop = {
    resize: () => {},
    setPalette: () => {},
    setHue: () => {},
    frame: () => {},
    burst: () => {},
    debug: () => ({}),
    destroy: () => {},
  };
  if (!canvas || typeof canvas.getContext !== "function") return noop;
  const g = canvas.getContext("2d");
  if (!g) return noop;

  const MAX = 150;
  let W = 0;
  let H = 0;
  let res = 1;
  let palette = [
    [170, 200, 255],
    [255, 226, 160],
    [220, 160, 255],
  ];
  let tinted = palette.map((c) => c.slice());

  const pool = [];
  for (let i = 0; i < MAX; i += 1) {
    pool.push({
      live: false,
      kind: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      max: 1,
      size: 1,
      rot: 0,
      spin: 0,
      ph: 0,
      a: 1,
      c: 0,
    });
  }
  let cursor = 0;
  const rnd = mulberry32(5150);

  function resize() {
    const fit = fitCanvas(canvas);
    W = fit.W;
    H = fit.H;
    res = fit.res;
  }

  /** 种类：0 光尘 1 火星 2 余烬 3 羽毛 4 水滴 5 风线 6 星尘 */
  function spawn(kind, opts) {
    const o = opts || {};
    const p = pool[cursor % MAX];
    cursor += 1;
    // 随机场比屏幕大一圈：前景视差（1.4×）推动时也不会看到空边
    p.live = true;
    p.kind = kind;
    p.x = (o.x == null ? rnd() : o.x) * (W * 1.5) - W * 0.25;
    p.y = (o.y == null ? rnd() : o.y) * (H * 1.5) - H * 0.25;
    p.rot = rnd() * TAU;
    p.spin = (rnd() - 0.5) * 1.2;
    p.ph = rnd() * TAU;
    p.c = rnd() < 0.3 ? 1 : rnd() < 0.6 ? 2 : 0;
    if (kind === 0) {
      p.vx = (rnd() - 0.5) * 8;
      p.vy = -6 - rnd() * 12;
      p.max = 9 + rnd() * 7;
      p.size = 0.8 + rnd() * 1.5;
      p.a = 0.18 + rnd() * 0.3;
    } else if (kind === 1) {
      p.vx = (rnd() - 0.5) * 90;
      p.vy = -60 - rnd() * 150;
      p.max = 0.7 + rnd() * 0.9;
      p.size = 1.2 + rnd() * 2;
      p.a = 0.7 + rnd() * 0.3;
    } else if (kind === 2) {
      p.vx = (rnd() - 0.5) * 22;
      p.vy = -18 - rnd() * 30;
      p.max = 2.6 + rnd() * 2.6;
      p.size = 1 + rnd() * 1.8;
      p.a = 0.4 + rnd() * 0.4;
    } else if (kind === 3) {
      p.vx = (rnd() - 0.5) * 26;
      p.vy = 16 + rnd() * 26;
      p.max = 4 + rnd() * 4;
      p.size = 2 + rnd() * 2.6;
      p.a = 0.22 + rnd() * 0.3;
    } else if (kind === 4) {
      p.vx = (rnd() - 0.5) * 12;
      p.vy = 120 + rnd() * 240;
      p.max = 1.1 + rnd() * 0.9;
      p.size = 1 + rnd() * 1.4;
      p.a = 0.35 + rnd() * 0.4;
    } else if (kind === 5) {
      p.vx = (rnd() < 0.5 ? -1 : 1) * (90 + rnd() * 180);
      p.vy = (rnd() - 0.5) * 16;
      p.max = 0.8 + rnd() * 0.7;
      p.size = 12 + rnd() * 40;
      p.a = 0.12 + rnd() * 0.2;
    } else {
      p.vx = (rnd() - 0.5) * 40;
      p.vy = (rnd() - 0.5) * 40;
      p.max = 1.6 + rnd() * 1.6;
      p.size = 0.9 + rnd() * 1.3;
      p.a = 0.5 + rnd() * 0.4;
    }
    if (o.vx != null) p.vx = o.vx;
    if (o.vy != null) p.vy = o.vy;
    if (o.max != null) p.max = o.max;
    p.life = 0;
  }

  function aliveCount() {
    let n = 0;
    for (const p of pool) if (p.live) n += 1;
    return n;
  }

  return {
    resize,
    setPalette(colors) {
      if (Array.isArray(colors) && colors.length >= 3) {
        palette = colors.slice(0, 3);
        tinted = palette.map((c) => c.slice());
      }
    },
    setHue(deg) {
      tinted = palette.map((c) => (deg ? rotateHue(c, deg) : c.slice()));
    },
    burst(n) {
      const count = Math.max(1, Math.round(n || 6));
      for (let i = 0; i < count; i += 1) spawn(1);
    },

    /**
     * @param {number} t 秒
     * @param {number} dt 秒
     * @param {{low:number,bass:number,mid:number,high:number,onset:number,arcane:number,voidLevel:number,density:number,camX:number,camY:number,playing:boolean}} s
     */
    frame(t, dt, s) {
      if (!W || !H) return;
      const low = clamp(s.low || 0, 0, 1);
      const bass = clamp(s.bass || 0, 0, 1);
      const mid = clamp(s.mid || 0, 0, 1);
      const high = clamp(s.high || 0, 0, 1);
      const onset = clamp(s.onset || 0, 0, 1);
      const arcane = clamp(s.arcane || 0, 0, 1);
      const voidLevel = clamp(s.voidLevel || 0, 0, 1);
      const density = clamp(s.density == null ? 0.6 : s.density, 0, 2);
      const parX = (s.camX || 0) * 1.4;
      const parY = (s.camY || 0) * 1.4;

      // —— 按元素补充新粒子（上限由段落密度决定）——
      const budget = Math.min(4, Math.round(density * 2.4));
      let made = 0;
      if (s.playing) {
        if (made < budget && low > 0.22) {
          spawn(0);
          made += 1;
        }
        if (made < budget && onset > 0.55) {
          spawn(1);
          made += 1;
        }
        if (made < budget && low > 0.35 && rnd() < 0.5) {
          spawn(2);
          made += 1;
        }
        if (made < budget && mid > 0.28 && rnd() < 0.6) {
          spawn(mid > 0.5 ? 5 : 3);
          made += 1;
        }
        if (made < budget && bass > 0.3 && rnd() < 0.5) {
          spawn(4);
          made += 1;
        }
        if (made < budget && high > 0.25 && rnd() < 0.7) {
          spawn(6);
        }
      } else if (rnd() < 0.05) {
        // 停顿 / 暂停：只留光尘悬停
        spawn(0);
      }
      if (arcane > 0.4 && rnd() < 0.25)
        spawn(1, { x: 0.5, y: 0.6, vy: -120 - rnd() * 90, vx: (rnd() - 0.5) * 30, max: 1.2 });

      const damp = Math.exp(-dt * (voidLevel > 0.5 ? 4.2 : 0.35));
      g.setTransform(res, 0, 0, res, 0, 0);
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";

      for (const p of pool) {
        if (!p.live) continue;
        p.life += dt;
        if (p.life >= p.max) {
          p.live = false;
          continue;
        }
        const k = p.life / p.max;
        if (voidLevel > 0.5) {
          p.vx *= damp;
          p.vy *= damp;
        }
        if (p.kind === 3) {
          p.x += (p.vx + Math.sin(t * 1.6 + p.ph) * 26) * dt;
          p.y += p.vy * dt;
        } else if (p.kind === 6) {
          p.x += (p.vx + Math.cos(t * 0.8 + p.ph) * 18) * dt;
          p.y += (p.vy + Math.sin(t * 0.9 + p.ph) * 18) * dt;
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        p.rot += p.spin * dt;

        const sx = p.x + parX;
        const sy = p.y + parY;
        if (sx < -80 || sx > W + 80 || sy < -80 || sy > H + 80) {
          p.live = false;
          continue;
        }

        const fade = p.kind === 0 ? 1 : Math.sin(Math.min(1, k) * Math.PI);
        let a = p.a * fade;
        if (p.kind === 1) a *= 0.7 + onset * 0.6;

        if (p.kind === 5) {
          g.strokeStyle = rgba(tinted[0], clamp(a, 0, 1));
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(sx, sy);
          g.lineTo(sx - Math.sign(p.vx) * p.size, sy - 1.5);
          g.stroke();
          continue;
        }
        if (p.kind === 4) {
          g.strokeStyle = rgba(tinted[1], clamp(a, 0, 1));
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(sx, sy - p.size * 2.4);
          g.lineTo(sx, sy);
          g.stroke();
          continue;
        }
        g.globalAlpha = clamp(a, 0, 1);
        g.fillStyle = rgba(tinted[p.c], 1);
        if (p.kind === 3) {
          g.beginPath();
          g.ellipse(sx, sy, p.size, p.size * 0.42, p.rot, 0, TAU);
          g.fill();
        } else if (p.kind === 0 || p.kind === 6) {
          g.fillRect(sx, sy, p.size, p.size);
        } else {
          g.beginPath();
          g.arc(sx, sy, p.size, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      g.globalCompositeOperation = "source-over";
    },

    debug() {
      return { w: W, h: H, res: Number(res.toFixed(2)), alive: aliveCount() };
    },

    destroy() {
      for (const p of pool) p.live = false;
      if (canvas.width) {
        canvas.width = 1;
        canvas.height = 1;
      }
    },
  };
}
