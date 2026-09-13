// @ts-check
/* ==========================================================================
   fx-camera.js — 「运镜」：分层视差 + 镜头语言（景别切换）
   --------------------------------------------------------------------------
   参考 folia-major 的相机做法，只取在 WebView 里真正划算的东西。第一版只做了
   「层叠正弦驱动一个容器」，实测**看不出在动**：12px 的漂移 + 0.5° 旋转，
   内容又居中，肉眼就是静止的。这一版把「看得见」当成硬指标，补了两件关键的事：

     1. **分层视差（parallax）**：同一台相机驱动多个层，每层一个 depth。
        远处装饰 depth<1 动得少、近处 depth>1 动得多。**层与层之间的相对位移
        才是「镜头在动」的知觉来源** —— 所有东西一起平移，看起来就只是"整块滑了一下"。
     2. **镜头语言（shots）**：不再只有一个正弦漂移，而是一组景别/机位
        （推近 / 拉远 / 横移 / 升降 / 环绕），每 9–16 秒换一次，过渡 2.4 秒
        （smoothstep，两端速度为 0，落点是静的）。主力位移由"当前机位"给，
        层叠正弦退居为很小的"手持微动"。

   其余保持第一版的设计：只写 transform、页面不可见时停 rAF、
   prefers-reduced-motion 或用户关掉动画时不启动、换镜用 sin² 包络。

   注意：目标元素必须是**专用容器**：它自己的 CSS 里不能再有 transform 动画
   （CSS 动画会盖掉内联的 transform，两套一起上等于相机失效）。
   ========================================================================== */

/** 系统是否要求减少动效 */
export function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    return false;
  }
}

/**
 * 机位表（归一化到 -1..1，乘上各皮肤自己的幅度）。
 *
 * 只用「能被眼睛读出来」的机位：横移、升降、推拉、环绕。
 * 每个皮肤可以传自己的 shots 覆盖（例如宇宙样式更适合大环绕）。
 */
export const CAMERA_SHOTS = [
  { id: "wide", x: 0, y: 0, r: 0, z: 0 },
  { id: "dolly-in", x: 0.08, y: -0.14, r: 0.1, z: 0.5 },
  { id: "truck-left", x: -0.9, y: 0.06, r: -0.32, z: 0.1 },
  { id: "truck-right", x: 0.9, y: -0.06, r: 0.32, z: 0.1 },
  { id: "crane-up", x: 0.14, y: -0.85, r: 0.2, z: 0.16 },
  { id: "crane-down", x: -0.14, y: 0.85, r: -0.2, z: 0.16 },
  { id: "orbit-left", x: 0.6, y: -0.34, r: -0.9, z: 0.28 },
  { id: "orbit-right", x: -0.6, y: 0.34, r: 0.9, z: 0.28 },
  { id: "dolly-out", x: -0.1, y: 0.1, r: -0.08, z: -0.4 },
];

const DEFAULTS = {
  /** 水平 / 垂直位移幅度（px）—— 这一版比第一版大 4~6 倍，否则看不出在动 */
  ampX: 58,
  ampY: 38,
  /** 旋转幅度（deg）。轻微倾斜最能把「整块平移」变成「镜头在摇」 */
  rot: 2.4,
  /** 缩放幅度（1 的前后摆动量） */
  zoom: 0.03,
  /** 缩放基准：略大于 1，避免缩到比容器还小时露出边 */
  base: 1.012,
  /** 手持微动（叠在机位上的小抖动）。两层时间尺度：快的 ~0.11Hz（呼吸感）
      + 很慢的 ~0.017Hz（重心移动）。机位过渡用 smoothstep，两端速度为 0，
      光靠它会有一瞬间"定住"，这一层就是用来填掉那个停顿的。 */
  handX: 16,
  handY: 12,
  handR: 0.45,
  handZ: 0.008,
  /** 整体速度倍率 */
  speed: 1,
  /** 相位种子：不同皮肤给不同值，构图不会一模一样 */
  seed: 0,
  /** 帧率上限（folia 的 frameRateLimiter 思路；WebView 上 60 足够） */
  maxFps: 60,
  /** 换镜间隔（秒，取区间内随机但可复现） */
  shotMin: 9,
  shotMax: 16,
  /** 自定义机位表 */
  shots: null,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * 在 target 上创建一台相机。
 *
 * @param {HTMLElement} target 专用容器（本函数只写它的 style.transform）
 * @param {Partial<typeof DEFAULTS>} [opts]
 */
export function createCamera(target, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const shots = Array.isArray(o.shots) && o.shots.length ? o.shots : CAMERA_SHOTS;
  const noop = {
    addLayer: () => () => {},
    pulse() {},
    setEnabled() {},
    destroy() {},
    sample: () => null,
    get enabled() {
      return false;
    },
  };
  if (!target) return noop;

  // 相位（不可通约，合成起来不会明显重复）
  const p1 = o.seed * 1.37 + 0.7;
  const p2 = o.seed * 2.11 + 2.3;
  const p3 = o.seed * 0.73 + 4.1;
  const minFrame = o.maxFps > 0 ? 1000 / o.maxFps - 1 : 0;

  /**
   * 参与视差的层。depth 是「离相机多近」：
   *   0.25 = 远景装饰（动得少）  1 = 主体  1.4~2 = 前景（动得多）
   * scale=true 的层会跟着缩放（用于整窗背景那种抽象装饰）。
   * @type {Array<{el: HTMLElement, depth: number, scale: boolean}>}
   */
  const layers = [{ el: target, depth: 1, scale: true }];

  let enabled = true;
  let destroyed = false;
  let raf = 0;
  let last = 0;

  // —— 镜头：当前机位 / 上一个机位 / 过渡进度 ——
  let from = shots[0];
  let to = shots[0];
  let shotT0 = -1e9;
  // 当前镜头的时长（ms）。**过渡时长 = 驻留时长**，见 advanceShot 的说明
  let shotSpan = 1;
  let nextShotAt = 0;
  /** 可复现的伪随机（换镜选下一个机位用，不用 Math.random 以便复现画面） */
  let rndState = Math.floor(o.seed * 9301 + 49297) % 233280 || 12345;
  function rnd() {
    rndState = (rndState * 9301 + 49297) % 233280;
    return rndState / 233280;
  }

  // 换镜脉冲（切歌用）：sin² 包络，两端值与速度都为 0
  let shotAt = -1e9;
  let shotDur = 1.2;
  let shotAmp = 0;

  /** 当前相机值（分层写 transform 时要复用，也供自检读取） */
  let cur = { x: 0, y: 0, r: 0, z: 1 };

  function advanceShot(now) {
    if (now < nextShotAt) return;
    // 从「当前实际位置」取一个快照当作起点：位置连续，换镜不会跳
    from = { id: "blend", ...sampleShot(1) };
    let next = shots[Math.floor(rnd() * shots.length)];
    if (next === to && shots.length > 1) {
      next = shots[(shots.indexOf(next) + 1) % shots.length];
    }
    to = next;
    shotT0 = now;
    // 关键：过渡时长 = 这一镜头的驻留时长。相机在整段镜头里一直缓慢朝下一个
    // 机位移动，而不是「2 秒飞过去、然后定住 12 秒」—— 后者实测在 12 秒的采样
    // 窗口里总位移只有 6px，因为绝大部分时间它压根没动。
    shotSpan = Math.max(1000, (o.shotMin + rnd() * Math.max(0.1, o.shotMax - o.shotMin)) * 1000);
    nextShotAt = now + shotSpan;
  }

  /** 第 k（0..1）时刻的机位值；k=1 时正好落到目标机位 */
  function sampleShot(k) {
    const e = smoothstep(clamp(k, 0, 1));
    return {
      x: lerp(from.x, to.x, e),
      y: lerp(from.y, to.y, e),
      r: lerp(from.r, to.r, e),
      z: lerp(from.z, to.z, e),
    };
  }

  function paint(now) {
    advanceShot(now);
    const k = clamp((now - shotT0) / shotSpan, 0, 1);
    const shot = sampleShot(k);

    // 手持微动：两条不可通约正弦叠加（幅度很小，只为了让画面"活"）
    const t = (now / 1000) * o.speed;
    const hx = Math.sin(t * 0.11 + p1) * 0.6 + Math.sin(t * 0.047 + p1 * 1.7) * 0.4;
    const hy = Math.sin(t * 0.083 + p2) * 0.6 + Math.sin(t * 0.037 + p2 * 1.7) * 0.4;
    const hr = Math.sin(t * 0.059 + p3) * 0.6 + Math.sin(t * 0.029 + p3 * 1.7) * 0.4;
    const hz = Math.sin(t * 0.041 + p1 * 0.6) * 0.6 + Math.sin(t * 0.017 + p2 * 0.6) * 0.4;

    let x = shot.x * o.ampX + hx * o.handX;
    let y = shot.y * o.ampY + hy * o.handY;
    let r = shot.r * o.rot + hr * o.handR;
    let z = o.base + shot.z * o.zoom + hz * o.handZ;

    // 换镜脉冲：一次性的大幅位移（切歌 / 换封面时由皮肤调 pulse()）
    if (shotAmp > 0) {
      const te = (now - shotAt) / (shotDur * 1000);
      if (te >= 1) {
        shotAmp = 0;
      } else if (te >= 0) {
        const env = Math.pow(Math.sin(Math.PI * te), 2);
        x += env * shotAmp * 150;
        y += env * shotAmp * -28;
        r += env * shotAmp * 2.6;
        z += env * shotAmp * 0.05;
      }
    }

    cur = { x, y, r, z };
    for (const layer of layers) {
      const d = layer.depth;
      let tf =
        "translate3d(" +
        (x * d).toFixed(2) +
        "px, " +
        (y * d).toFixed(2) +
        "px, 0) rotate(" +
        (r * d).toFixed(3) +
        "deg)";
      if (layer.scale) tf += " scale(" + (1 + (z - 1) * d).toFixed(4) + ")";
      layer.el.style.transform = tf;
    }
  }

  function loop(now) {
    raf = 0;
    if (!enabled || destroyed) return;
    if (minFrame > 0 && now - last < minFrame) {
      raf = requestAnimationFrame(loop);
      return;
    }
    last = now;
    paint(now);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (raf || !enabled || destroyed) return;
    if (prefersReducedMotion()) return;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  document.addEventListener("visibilitychange", onVisibility);

  // 先用一帧静态构图落位，避免元素以 transform:none 的原始状态闪一下
  nextShotAt = 0;
  paint(performance.now());
  start();

  return {
    /**
     * 把一个元素挂进相机做视差。
     * @param {HTMLElement|null} el
     * @param {{depth?: number, scale?: boolean}} [layerOpts]
     * @returns {() => void} 取消挂载
     */
    addLayer(el, layerOpts = {}) {
      if (!el) return () => {};
      const item = {
        el,
        depth: typeof layerOpts.depth === "number" ? layerOpts.depth : 1,
        scale: layerOpts.scale !== false,
      };
      layers.push(item);
      return () => {
        const i = layers.indexOf(item);
        if (i >= 0) layers.splice(i, 1);
        el.style.transform = "";
      };
    },
    /** 换镜脉冲：strength 0..1.5，越大飞得越远（切歌 / 换封面时调） */
    pulse(strength = 1, dur = 1.2) {
      shotAt = performance.now();
      shotAmp = clamp(strength, 0, 1.5);
      shotDur = dur;
    },
    setEnabled(on) {
      enabled = Boolean(on);
      if (!enabled) {
        stop();
        for (const layer of layers) layer.el.style.transform = "";
      } else {
        start();
      }
    },
    destroy() {
      destroyed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      for (const layer of layers) layer.el.style.transform = "";
      layers.length = 1;
    },
    /** 当前相机值（自检用，避免只能从 computedStyle 反解矩阵） */
    sample() {
      return { ...cur };
    },
    get enabled() {
      return enabled;
    },
  };
}
