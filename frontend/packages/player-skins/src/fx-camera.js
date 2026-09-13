// @ts-check
/* ==========================================================================
   fx-camera.js — 「运镜」：用层叠正弦驱动一个容器的相机位移
   --------------------------------------------------------------------------
   参考 folia-major 的相机做法，只取三件在 WebView 里真正划算的事：

     1. **层叠不可通约正弦**（incommensurate sines）而不是随机噪声：
        x = (sin(t·0.11+φ₁)·0.6 + sin(t·0.047+φ₁·1.7)·0.4) · amp
        两条频率不成整数比，合成起来永远不会明显重复，而每一帧也不需要
        攒随机数 —— 给定 t 就能算出同一帧，掉帧 / 卡顿之后不会「漂移」。
     2. **换镜包络**：切歌时给一个 sin²(π·te) 的包络（两端值与速度都为 0），
        所以镜头「飞过去再落回来」时落点是静止的，不会在结尾踢一下。
     3. **只写 transform，且只在可见时跑**：页面被切到后台 / 窗口最小化时
        停掉 rAF；用户关掉界面动画或系统开了 prefers-reduced-motion 时完全不启动。

   刻意**不做**的事：不读音频、不跟鼠标。理由与 folia 一致 —— 相机的运动曲线
   应该由作者控制得干净，跟着节拍抖会毁掉「镜头感」。

   注意：目标元素必须是**专用容器**。它自己的 CSS 里不能再有 transform 动画
   （两者会互相覆盖）；皮肤的做法是「相机容器 > 舞台」，舞台里再各自做动画。
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

const DEFAULTS = {
  /** 水平 / 垂直漂移幅度（px） */
  ampX: 12,
  ampY: 9,
  /** 旋转幅度（deg） */
  rot: 0.5,
  /** 缩放幅度（1 ± zoom） */
  zoom: 0.022,
  /** 整体速度倍率 */
  speed: 1,
  /** 相位种子：不同皮肤 / 不同挂载给不同的值，构图不会一模一样 */
  seed: 0,
  /** 帧率上限（folia 的 frameRateLimiter 思路；WebView 上 60 足够） */
  maxFps: 60,
};

/**
 * 在 target 上创建一个相机。
 *
 * @param {HTMLElement} target 专用容器（本函数只写它的 style.transform）
 * @param {Partial<typeof DEFAULTS>} [opts]
 */
export function createCamera(target, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!target) {
    return {
      pulse() {},
      setEnabled() {},
      destroy() {},
      get enabled() {
        return false;
      },
    };
  }

  const p1 = o.seed * 1.37 + 0.7;
  const p2 = o.seed * 2.11 + 2.3;
  const p3 = o.seed * 0.73 + 4.1;
  const minFrame = o.maxFps > 0 ? 1000 / o.maxFps - 1 : 0;

  let enabled = true;
  let destroyed = false;
  let raf = 0;
  let last = 0;
  /** 换镜包络：te 从 0 走到 1，之后归零 */
  let shotAt = -1e9;
  let shotDur = 1.25;
  let shotAmp = 0;

  function paint(now) {
    const t = (now / 1000) * o.speed;
    // 手摇呼吸：两条不可通约正弦叠加
    const sx = Math.sin(t * 0.11 + p1) * 0.6 + Math.sin(t * 0.047 + p1 * 1.7) * 0.4;
    const sy = Math.sin(t * 0.083 + p2) * 0.6 + Math.sin(t * 0.037 + p2 * 1.7) * 0.4;
    const sr = Math.sin(t * 0.059 + p3) * 0.6 + Math.sin(t * 0.029 + p3 * 1.7) * 0.4;
    const sz = Math.sin(t * 0.041 + p1 * 0.6) * 0.6 + Math.sin(t * 0.017 + p2 * 0.6) * 0.4;

    let x = sx * o.ampX;
    let y = sy * o.ampY;
    let r = sr * o.rot;
    let z = 1 + sz * o.zoom;

    // 换镜：横向弧线 + 轻微推近，包络两端静止
    if (shotAmp > 0) {
      const te = (now - shotAt) / (shotDur * 1000);
      if (te >= 1) {
        shotAmp = 0;
      } else if (te >= 0) {
        const env = Math.pow(Math.sin(Math.PI * te), 2);
        x += env * shotAmp * 46;
        y += env * shotAmp * -12;
        z += env * shotAmp * 0.05;
        r += env * shotAmp * 1.4;
      }
    }

    target.style.transform =
      "translate3d(" +
      x.toFixed(2) +
      "px, " +
      y.toFixed(2) +
      "px, 0) rotate(" +
      r.toFixed(3) +
      "deg) scale(" +
      z.toFixed(4) +
      ")";
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
  paint(performance.now());
  start();

  return {
    /** 换镜脉冲：strength 0..1，越大飞得越远（切歌 / 换封面时调） */
    pulse(strength = 1, dur = 1.25) {
      shotAt = performance.now();
      shotAmp = Math.max(0, Math.min(1.5, strength));
      shotDur = dur;
    },
    setEnabled(on) {
      enabled = Boolean(on);
      if (!enabled) {
        stop();
        target.style.transform = "";
      } else {
        start();
      }
    },
    destroy() {
      destroyed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      target.style.transform = "";
    },
    get enabled() {
      return enabled;
    },
  };
}
