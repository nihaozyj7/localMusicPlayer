/* ==========================================================================
   深渊 abyss · lib/canvas2d.js —— 拿不到 WebGL2 时的伪流体兜底
   --------------------------------------------------------------------------
   P1 在真机上是成立的（ANGLE/D3D11，`webgl2` ✓），但**必须**有不成立时的路：
   集显驱动被禁、远程桌面、`webgl2` 被策略关掉、GL 上下文丢了 —— 这些都真实存在。
   兜底方案就是设计稿写的：**双层位移贴图**（封面两份不同相位）+ 遮罩暗刻，
   再加上低频抬升、泡沫颗粒、暗角。

   它跟 GL 版共用同一个接口（resize / setCover / setMask / frame / dispose），
   所以皮肤那边只有一行分支 —— 视觉意图保留，损失的是折射的真实度。
   ========================================================================== */

/* 子模块之间不许静态 import（会绕开入口的 ?t= token）：这种一行工具各自留一份 */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function create2D(canvas) {
  const g = canvas.getContext("2d", { alpha: true });
  if (!g) return null;
  let dpr = 1;
  let w = 1;
  let h = 1;
  let img = null;
  let mask = null;
  const stats = { frames: 0, draws: 0 };
  let seed = 1;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  return {
    ok: true,
    kind: "2d",
    halfFloat: false,
    timer: false,
    stats,
    resize(cssW, cssH, ratio) {
      dpr = Math.max(1, Number(ratio) || 1);
      w = Math.max(1, Math.round(cssW));
      h = Math.max(1, Math.round(cssH));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      return { w: canvas.width, h: canvas.height, tier: "fallback", ratio: dpr };
    },
    setCover(image) {
      img = image || null;
    },
    setMask(srcCanvas) {
      mask = srcCanvas || null;
      return { w: mask?.width || 0, h: mask?.height || 0 };
    },
    beginMeasure() {},
    endMeasure() {},
    pollMeasure() {
      return null;
    },
    isLost() {
      return false;
    },
    frame(u) {
      stats.frames += 1;
      const ctx = g;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      const lift = clamp01(u.lift || 0);
      const turb = clamp01(u.turb || 0);
      const foam = clamp01(u.foam || 0);
      // 深水底：alpha 不能太高（0.82 会把上面那层"整窗底色"糊死，兜底档看起来
      // 就是一块纯黑），但也得够厚，不然封面会像贴纸一样浮着
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(${u.bg[0]},${u.bg[1]},${u.bg[2]},0.66)`;
      ctx.fillRect(0, 0, w, h);

      /* 双层位移贴图：同一张封面两份不同相位 —— 水面"流动"的观感就来自这一层错位 */
      if (img && img.complete && img.naturalWidth) {
        const ph = (u.time || 0) * (0.35 + lift * 0.9);
        const amp = 6 + lift * 26 + turb * 12;
        const dx1 = Math.sin(ph) * amp - (u.forceX || 0) * 12;
        const dy1 = Math.cos(ph * 0.83) * amp * 0.7 - (u.forceY || 0) * 8;
        const dx2 = Math.sin(ph * 1.37 + 1.7) * amp * 1.6 + (u.surge || 0) * 18;
        const dy2 = Math.cos(ph * 1.11 + 0.4) * amp * 1.1;
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.42;
        ctx.drawImage(img, dx1, dy1 + lift * 8, w, h);
        ctx.globalAlpha = 0.26;
        ctx.drawImage(img, dx2, dy2 - (u.surge || 0) * 10, w * 1.08, h * 1.08);
      }
      ctx.globalCompositeOperation = "source-over";

      /* 字形遮罩：一层"暗刻"（凹陷内部） + 一份错位亮边（折射高光）。
         遮罩画布与舞台是**同一个坐标系**（paintMask 就是照舞台盒子画的），
         所以这里按整块舞台贴上去，只加涌浪位移。 */
      if (mask && mask.width) {
        const mw = w;
        const mh = h;
        ctx.globalCompositeOperation = "multiply";
        ctx.filter = `blur(${2 + lift * 3}px)`;
        ctx.globalAlpha = 0.5 + lift * 0.25;
        ctx.drawImage(mask, -(u.surge || 0) * 10, -lift * 4, mw, mh);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.16 + lift * 0.2;
        ctx.drawImage(mask, (u.surge || 0) * 26 + 3, 2, mw, mh);
        ctx.filter = "none";
        ctx.globalCompositeOperation = "source-over";
      }

      /* 泡沫颗粒（高频）：位置由帧号决定，不用 Math.random —— 画面每次都一样好复现 */
      if (foam > 0.02) {
        seed = 1 + Math.floor((u.time || 0) * 12);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(${u.fg[0]},${u.fg[1]},${u.fg[2]},${(0.05 + foam * 0.16).toFixed(3)})`;
        for (let i = 0; i < 48; i += 1) {
          const x = rnd() * w;
          const y = rnd() * h;
          const r = 0.6 + rnd() * (1 + foam * 2);
          ctx.beginPath();
          ctx.arc(x, y - lift * 10, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }

      /* 暗角 + 水面高光带 */
      const vg = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.5, Math.max(w, h) * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      /* 水面高光带：用**渐变**画，不是一个 fillRect。
         原来那条 2~8px 的实心亮线没有模糊，在深水上就是一道细硬的白线
         （像画面的分隔线，GL 档是有 3px blur 的），两档观感对不上。 */
      const bandY = h * (0.34 - lift * 0.16);
      const bandH = 2 + lift * 6;
      const sg = ctx.createLinearGradient(0, bandY - bandH * 3, 0, bandY + bandH * 3);
      const a0 = Math.min(0.42, 0.24 + lift * 0.3);
      sg.addColorStop(0, `rgba(${u.accent[0]},${u.accent[1]},${u.accent[2]},0)`);
      sg.addColorStop(0.5, `rgba(${u.accent[0]},${u.accent[1]},${u.accent[2]},${a0.toFixed(3)})`);
      sg.addColorStop(1, `rgba(${u.accent[0]},${u.accent[1]},${u.accent[2]},0)`);
      ctx.fillStyle = sg;
      ctx.fillRect(0, bandY - bandH * 3, w, bandH * 6);
      ctx.globalAlpha = 1;
      stats.draws += 1;
    },
    dispose() {
      img = null;
      mask = null;
      try {
        g.clearRect(0, 0, canvas.width, canvas.height);
      } catch {
        /* 已经没了 */
      }
    },
  };
}
