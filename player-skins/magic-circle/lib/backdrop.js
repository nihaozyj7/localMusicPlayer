/* ==========================================================================
   magic-circle/lib/backdrop.js — 整窗背景层（.mc-bg 里那张 canvas）
   --------------------------------------------------------------------------
   舞台画布现在**自己就铺满整窗**（宿主按 capabilities.background 把
   .playerview 放大到整窗，见宿主 layout.css），所以这张图稳态时其实被舞台
   完全盖住 —— 它负责的是**进出场**：详情页滑入 / 滑出那半透明的一段时间里，
   底下必须有一块同幅度滑动的夜空，而不是一块死的底色。
   视觉语言与舞台完全一致（夜空 + 星域 + 巨型底阵 + 中心辉光），两层接不上缝。

   ★ 静态：只在挂载与 resize 时各画一次，不进帧循环。
     它只在半透明的过渡期露脸，动起来既看不出来，也是纯浪费。

   ★ 尺寸的 dpr 由 skin.js 从渲染器里取了传进来 —— 插件不碰 window。
   ========================================================================== */

// 子模块依赖同样要透传 token（原因见 skin.js 顶部那段说明）
const Q = new URL(import.meta.url).search;
const { PALETTE, WORLD } = await import(`./config.js${Q}`);
const { TAU, hsl, mulberry32 } = await import(`./util.js${Q}`);

/** 星空数量（整窗；比舞台少一点，背景是配角） */
const STARS = 300;

/**
 * 把整窗背景画到 canvas 上。canvas 由 CSS 铺满 .mc-bg，尺寸取 clientWidth/Height。
 *
 * @param {HTMLCanvasElement|null} canvas
 * @param {number} dpr 设备像素比（舞台的那份；背景 1.5x 封顶，够看又不贵）
 * @returns {boolean} 真的画上了才返回 true（容器还没布局时是 false，下帧再试）
 */
export function drawBackdrop(canvas, dpr) {
  if (!canvas) return false;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!(w > 0) || !(h > 0)) return false; // 容器还没布局（hidden / 未显示）

  const k = Math.min(1.5, Math.max(1, Number(dpr) || 1));
  const px = Math.round(w * k);
  const py = Math.round(h * k);
  if (canvas.width !== px || canvas.height !== py) {
    canvas.width = px;
    canvas.height = py;
  }
  const g = canvas.getContext("2d");
  if (!g) return false;
  g.setTransform(k, 0, 0, k, 0, 0);

  // —— 1. 夜空（与舞台同色系）——
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, PALETTE.bg1);
  sky.addColorStop(0.55, PALETTE.bg0);
  sky.addColorStop(1, "#05070f");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // —— 2. 星域：先按亮度分 4 桶，再逐桶画（每桶只换一次 fillStyle）——
  const rnd = mulberry32(0x5eed1a);
  const buckets = [[], [], [], []];
  for (let i = 0; i < STARS; i += 1) {
    buckets[i % 4].push([rnd() * w, rnd() * h, 0.7 + rnd() * 1.4]);
  }
  for (let b = 0; b < 4; b += 1) {
    g.fillStyle = `rgba(214,226,255,${(0.09 + b * 0.1).toFixed(2)})`;
    for (const [x, y, s] of buckets[b]) g.fillRect(x, y, s, s);
  }

  // —— 3. 巨型底阵：以窗口为心，半径比短边还大一点 →「世界延伸到窗外」——
  const cx = w / 2;
  const cy = h / 2;
  const short = Math.min(w, h);
  const R = short * 0.66;
  const rMax = WORLD.RINGS[WORLD.RINGS.length - 1] || 1;

  // 中心辉光
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  glow.addColorStop(0, "rgba(74,116,232,0.22)");
  glow.addColorStop(0.45, "rgba(48,74,166,0.1)");
  glow.addColorStop(1, "rgba(4,6,13,0)");
  g.fillStyle = glow;
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.fill();

  // 同心环（按世界的半径比例，外面几圈故意压出画面）
  g.lineWidth = Math.max(1, short * 0.0016);
  for (let i = 0; i < WORLD.RINGS.length; i += 1) {
    const t = WORLD.RINGS[i] / rMax;
    g.strokeStyle = hsl(PALETTE.hueHigh, PALETTE.sat, PALETTE.light, 0.13 - 0.05 * (1 - t));
    g.beginPath();
    g.arc(cx, cy, R * t, 0, TAU);
    g.stroke();
  }

  // 辐条
  g.strokeStyle = hsl(PALETTE.hueHigh, PALETTE.sat, PALETTE.light, 0.07);
  g.lineWidth = Math.max(1, short * 0.0012);
  g.beginPath();
  for (let i = 0; i < WORLD.SPOKES; i += 1) {
    const a = (i / WORLD.SPOKES) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    g.moveTo(cx + c * R * 0.16, cy + s * R * 0.16);
    g.lineTo(cx + c * R, cy + s * R);
  }
  g.stroke();

  // 刻度环（128 根短齿，每 8 根一根长的 —— 与舞台的刻度环同款）
  const r0 = R * 0.9;
  g.lineWidth = Math.max(1, short * 0.002);
  g.strokeStyle = hsl(PALETTE.hueHigh, 86, 70, 0.15);
  g.beginPath();
  for (let i = 0; i < 128; i += 1) {
    const a = (i / 128) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const len = i % 8 === 0 ? R * 0.075 : R * 0.045;
    g.moveTo(cx + c * r0, cy + s * r0);
    g.lineTo(cx + c * (r0 + len), cy + s * (r0 + len));
  }
  g.stroke();

  // —— 4. 暗角：把视线收向中心，与舞台收尾那道一致 ——
  const vig = g.createRadialGradient(cx, cy, short * 0.2, cx, cy, Math.max(w, h) * 0.72);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);

  return true;
}
