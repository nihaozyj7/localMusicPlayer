/* ==========================================================================
   magic-circle/lib/render.js — 世界与节点的全部绘制
   --------------------------------------------------------------------------
   分层（从远到近，视差见 config.PARALLAX）：
     Layer 0  背景星域      视差 0.2
     Layer 1  巨型底阵      视差 0.5（贯穿全图的地基）
     Layer 2  连接光路      视差 1.0（节点之间的路径）
     Layer 3  歌词节点 × N  视差 1.0（世界坐标固定，只有镜头在动）
     Layer 4  世界粒子      视差 0.9 → 屏幕粒子（无视差）→ 白闪 / 暗角

   性能约定（见设计稿第九节）：
     · 底阵/光路/星域各自**一次 beginPath 攒完再 stroke**（不是一根一笔）；
     · 外环 128 刻度的镜像与本体共用同一次 stroke（同色同 alpha）；
     · 128 段的色串只给**当前高亮节点**现算，其余节点走简化环；
     · zoom < PERF.detailZoom 时只画轮廓（拉远俯瞰时的 LOD）。
   ========================================================================== */

import { INTERACT, NODE, PALETTE, PARALLAX, PERF, WORLD } from "./config.js";
import { zoomForText } from "./layout.js";
import { KIND } from "./particles.js";
import { clamp, easeOutCubic, hsl, lerp, mulberry32, TAU } from "./util.js";

const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
const STAR_COUNT = 420;
const MEASURE_CACHE_MAX = 240;

export function createRenderer(canvas) {
  const g = canvas.getContext("2d", { alpha: false });

  let W = 0;
  let H = 0;
  let dpr = 1;
  /** 世界字号缩放（设置里的歌词字号） */
  let textScale = 1;
  /** @type {{x:number,y:number,size:number,ph:number,sp:number,bucket:number}[]} */
  const stars = [];
  let bgGrad = null;
  let vignette = null;
  /** 符文的固定形状（挂载一次，之后只是平移旋转） */
  const runes = buildRunes(NODE.runes);
  /** 文字测量缓存：text → {width, chars:[{ch,w}]} */
  const measureCache = new Map();

  /* ------------------------------------------------------------------ 尺寸 */

  function resize(w, h, ratio) {
    const cw = Math.max(1, Math.round(w));
    const ch = Math.max(1, Math.round(h));
    const r = clamp(ratio || 1, 1, 2);
    if (cw === W && ch === H && r === dpr) return;
    W = cw;
    H = ch;
    dpr = r;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    bgGrad = g.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, PALETTE.bg0);
    bgGrad.addColorStop(0.55, PALETTE.bg1);
    bgGrad.addColorStop(1, PALETTE.bg0);

    vignette = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  }

  /* ------------------------------------------------------------------ 星域 */

  function ensureStars() {
    if (stars.length) return;
    const rnd = mulberry32(0x51ced);
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const a = rnd() * TAU;
      const r = Math.sqrt(rnd()) * WORLD.STAR_R;
      stars.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        size: 0.7 + rnd() * 2.1,
        ph: rnd() * TAU,
        sp: 0.5 + rnd() * 1.6,
        bucket: (rnd() * 4) | 0,
      });
    }
  }

  /* -------------------------------------------------------------- 坐标变换 */

  /** 把画布切到某一层的坐标系（世界坐标 → 屏幕） */
  function layer(st, parallax) {
    const v = st.view;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(W / 2, H / 2);
    if (v.rot) g.rotate(v.rot);
    g.scale(v.z, v.z);
    g.translate(-v.x * parallax, -v.y * parallax);
  }

  /** 某层在世界里的可见矩形（带缓冲），用于剔除 */
  function visible(st, parallax, buffer) {
    const v = st.view;
    const hw = W / (2 * v.z) + buffer;
    const hh = H / (2 * v.z) + buffer;
    return { cx: v.x * parallax, cy: v.y * parallax, hw, hh };
  }

  function inRect(rect, x, y, pad) {
    return Math.abs(x - rect.cx) <= rect.hw + pad && Math.abs(y - rect.cy) <= rect.hh + pad;
  }

  /* ------------------------------------------------------------------ 主绘制 */

  function draw(st) {
    ensureStars();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, W, H);

    drawStars(st);
    drawBase(st);
    drawPaths(st);

    // 节点：非高亮的先画（在下），高亮的最后画（在上）
    const view = visible(st, PARALLAX.nodes, 900);
    let near = [];
    for (const n of st.world.nodes) {
      if (!inRect(view, n.x, n.y, NODE.radius * 2 + 400)) continue;
      near.push(n);
    }
    const active = st.activeIdx >= 0 ? st.world.nodes[st.activeIdx] : null;
    if (near.length > PERF.maxNodes) {
      near.sort((a, b) => dist2(st, a) - dist2(st, b));
      near = near.slice(0, PERF.maxNodes);
      // 当前高亮的那颗永远不能被截掉（拉远俯瞰时它可能离镜头最远）
      if (active && near.indexOf(active) < 0) {
        near.pop();
        near.push(active);
      }
    }
    for (const n of near) {
      if (n === active) continue;
      drawNode(st, n, false);
    }
    if (active && near.indexOf(active) >= 0) drawNode(st, active, true);

    drawWorldParticles(st);
    drawScreenParticles(st);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (st.flash > 0.001) {
      g.fillStyle = `rgba(255,255,255,${(st.flash * 0.92).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
    g.fillStyle = vignette;
    g.fillRect(0, 0, W, H);
  }

  function dist2(st, n) {
    const v = st.view;
    return (n.x - v.x) ** 2 + (n.y - v.y) ** 2;
  }

  /* ---------------------------------------------------------------- Layer 0 */

  function drawStars(st) {
    layer(st, PARALLAX.stars);
    const rect = visible(st, PARALLAX.stars, 400);
    const tw = st.spec;
    // 4 个亮度桶 → 每帧只换 4 次 fillStyle（而不是 420 次）；细调交给 globalAlpha
    for (let b = 0; b < 4; b += 1) {
      g.fillStyle = `rgba(214,226,255,${(0.14 + b * 0.14).toFixed(2)})`;
      for (const s of stars) {
        if (s.bucket !== b) continue;
        if (!inRect(rect, s.x, s.y, 60)) continue;
        const flick = st.anim ? 0.55 + 0.45 * Math.sin(st.now * s.sp + s.ph) : 0.8;
        // 高频越亮：星尘的“呼吸”直接吃 high 频段
        const a = flick * (0.6 + tw.high * 1.6);
        if (a < 0.2) continue;
        const size = s.size * (0.8 + Math.min(a, 1.6) * 0.35);
        g.globalAlpha = clamp(a, 0, 1);
        g.fillRect(s.x - size / 2, s.y - size / 2, size, size);
      }
    }
    g.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------- Layer 1 */

  /**
   * 巨型底阵：同心环 + 径向辐条 + 外圈刻度 + 落点标记。
   * 静态几何 + 一个缓慢自转角，全部攒成 3~4 条路径一次 stroke。
   */
  function drawBase(st) {
    layer(st, PARALLAX.base);
    const v = st.view;
    const detail = v.z >= PERF.detailZoom;
    const sp = st.spec;
    const swing = hueSwing(sp);
    const rot = st.anim ? st.now * 0.02 * (1 + sp.low * 0.8) : 0;
    // 拉远俯瞰（LOD）时反而要更亮：细节全砍了，只剩轮廓，再暗就是整屏发黑
    const baseAlpha = (detail ? 0.1 + sp.total * 0.32 : 0.3 + sp.total * 0.45) * (st.baseBright ?? 1);

    // 阵体：一圈极淡的径向填充。拉远时它把“地图”从纯黑背景里托起来，
    // 没有它的话俯瞰镜头下只剩几根细线，看着像没加载出来
    const body = g.createRadialGradient(0, 0, WORLD.R * 0.1, 0, 0, WORLD.R);
    const bodyHue = PALETTE.hueHigh + swing;
    body.addColorStop(0, hsl(bodyHue, 80, 46, (0.07 + sp.total * 0.1) * (st.baseBright ?? 1)));
    body.addColorStop(0.72, hsl(bodyHue, 80, 42, (0.04 + sp.total * 0.06) * (st.baseBright ?? 1)));
    body.addColorStop(1, hsl(bodyHue, 80, 40, 0));
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, WORLD.R, 0, TAU);
    g.fill();

    // 同心环
    g.lineWidth = strokeW(v.z, detail ? 1.6 : 2.6, 0.6);
    g.strokeStyle = hsl(PALETTE.hueHigh + swing, PALETTE.sat, PALETTE.light, baseAlpha);
    g.beginPath();
    for (const r of WORLD.RINGS) {
      g.moveTo(r, 0);
      g.arc(0, 0, r, 0, TAU);
    }
    g.stroke();

    // 径向辐条
    g.beginPath();
    for (let i = 0; i < WORLD.SPOKES; i += 1) {
      const a = rot + (i / WORLD.SPOKES) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.moveTo(c * 320, s * 320);
      g.lineTo(c * WORLD.R, s * WORLD.R);
    }
    g.strokeStyle = hsl(PALETTE.hueHigh + swing, PALETTE.sat, PALETTE.light, baseAlpha * 0.75);
    g.stroke();

    if (!detail) return;

    // 外圈刻度（每 1.5° 一根）
    const outer = WORLD.RINGS[WORLD.RINGS.length - 1];
    g.beginPath();
    for (let i = 0; i < 240; i += 1) {
      const a = rot + (i / 240) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const long = i % 10 === 0;
      const r1 = outer - (long ? 120 : 60);
      g.moveTo(c * r1, s * r1);
      g.lineTo(c * outer, s * outer);
    }
    g.strokeStyle = hsl(
      lerp(PALETTE.hueLow, PALETTE.hueHigh, 0.7) + swing,
      PALETTE.sat,
      PALETTE.light,
      baseAlpha * 0.9
    );
    g.stroke();

    // 环 × 辐条 的交点：节点候选落点（“被封印在阵中”的关键暗示）
    g.beginPath();
    for (const r of WORLD.RINGS) {
      for (let i = 0; i < WORLD.SPOKES; i += 1) {
        const a = rot + (i / WORLD.SPOKES) * TAU;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const s = r === outer ? 26 : 16;
        g.moveTo(x - s, y);
        g.lineTo(x + s, y);
        g.moveTo(x, y - s);
        g.lineTo(x, y + s);
      }
    }
    g.strokeStyle = hsl(PALETTE.hueLow + swing, PALETTE.sat, PALETTE.light + 8, baseAlpha * 0.8);
    g.stroke();
  }

  /* ---------------------------------------------------------------- Layer 2 */

  /** 节点之间的连接光路（平时极淡，正在飞行的那条会亮起来） */
  function drawPaths(st) {
    const nodes = st.world.nodes;
    if (nodes.length < 2) return;
    layer(st, PARALLAX.paths);
    const rect = visible(st, PARALLAX.paths, 600);
    const sp = st.spec;
    const swing = hueSwing(sp);

    g.lineWidth = strokeW(st.view.z, 2, 0.5);
    g.strokeStyle = hsl(PALETTE.hueHigh + swing, 50, 60, 0.07 + sp.total * 0.12);
    g.beginPath();
    for (let i = 0; i + 1 < nodes.length; i += 1) {
      const a = nodes[i];
      const b = nodes[i + 1];
      if (!inRect(rect, a.x, a.y, 400) && !inRect(rect, b.x, b.y, 400)) continue;
      pathBetween(a, b, 0.18);
    }
    g.stroke();

    // 正在飞的那条：亮起来 + 沿线流光
    const fl = st.flight;
    if (fl) {
      const from = nearestNode(nodes, fl.from);
      const to = nearestNode(nodes, fl.to);
      if (from && to && from !== to) {
        const pulse = Math.sin(Math.PI * clamp(fl.p, 0, 1));
        g.lineWidth = strokeW(st.view.z, 4, 1);
        g.strokeStyle = hsl(PALETTE.hueHigh + swing, 85, 68, 0.15 + pulse * 0.55);
        g.beginPath();
        pathBetween(from, to, 0.18);
        g.stroke();
      }
    }
  }

  function pathBetween(a, b, pull) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const k = 1 - Math.min(pull, 0.4);
    g.moveTo(a.x, a.y);
    g.quadraticCurveTo(mx * k, my * k, b.x, b.y);
  }

  function nearestNode(nodes, pt) {
    let best = null;
    let bd = Infinity;
    for (const n of nodes) {
      const d = (n.x - pt.x) ** 2 + (n.y - pt.y) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return bd < 60 * 60 ? best : null;
  }

  /* ---------------------------------------------------------------- Layer 3 */

  /** 节点亮度：idle 0.15 → approaching 1.0 → active 1 → passing 衰减 */
  function brightness(st, n) {
    const since = st.now - n.stateAt;
    switch (n.state) {
      case "active":
        return 1;
      case "approaching": {
        const dur = n.assembleDur || 0.8;
        return lerp(0.15, 1, clamp(since / dur, 0, 1));
      }
      case "passing":
        return lerp(1, 0.15, clamp(since / 1.2, 0, 1));
      default:
        return 0.15;
    }
  }

  function drawNode(st, n, isActive) {
    const v = st.view;
    const sp = st.spec;
    const b = brightness(st, n);
    const swing = hueSwing(sp);
    const detail = v.z >= PERF.detailZoom || isActive;
    // bass → 整个节点的呼吸缩放
    const breath = 1 + sp.bass * 0.12 * (isActive ? 1 : 0.4);
    const hover = n.hover || 0;

    g.save();
    g.translate(n.x, n.y);
    g.scale(breath, breath);

    if (detail) drawGlow(st, b, swing);
    if (detail) drawTicks(st, n, isActive, b, swing);
    else drawSimpleRing(st, b, swing);
    drawMidRing(st, b, swing, isActive);
    if (detail) drawCore(st, b, swing);
    if (isActive) drawText(st, n, b);

    if (hover > 0.01) {
      g.strokeStyle = hsl(PALETTE.hueHigh + swing, 90, 72, hover * 0.5);
      g.lineWidth = strokeW(v.z, 3, 1);
      g.beginPath();
      g.arc(0, 0, NODE.radius * 1.25, 0, TAU);
      g.stroke();
    }
    g.restore();
  }

  /** 光晕（total → 径向渐变半径） */
  function drawGlow(st, b, swing) {
    const sp = st.spec;
    const r = NODE.radius * (1.25 + sp.total * 1.6);
    const grad = g.createRadialGradient(0, 0, NODE.radius * 0.2, 0, 0, r);
    const hue = lerp(PALETTE.hueLow, PALETTE.hueHigh, 0.7) + swing;
    grad.addColorStop(0, hsl(hue, 85, 62, 0.3 * b));
    grad.addColorStop(0.5, hsl(hue, 85, 55, 0.12 * b));
    grad.addColorStop(1, hsl(hue, 85, 50, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
  }

  /**
   * 外环 128 刻度（核心视觉）：刻度长度与亮度直读 fast[]，
   * 镜像层与本体同色同 alpha → 一圈 256 根、只 stroke 128 次。
   */
  function drawTicks(st, n, isActive, b, swing) {
    const sp = st.spec;
    const mirror = NODE.mirrorTicks;
    const baseRot = st.anim ? st.now * (isActive ? 0.22 : 0.08) * (1 + sp.low * 1.4) : 0;
    const arr = isActive ? sp.fast : sp.slow;
    const gain = isActive ? 1 : 0.42;
    const detailTicks = isActive || st.view.z >= 0.32;

    g.lineCap = "butt";
    // 刻度必须自己给线宽：它会吃到上一次 stroke 留下的 lineWidth（那可能是
    // 底阵的 1.6px，也可能是某个环的 3px），不同节点看起来会不一样粗
    g.lineWidth = strokeW(st.view.z, 1.5, 0.5);
    for (let i = 0; i < 128; i += 1) {
      const a = baseRot + (i / 128) * TAU - Math.PI / 2;
      const raw = arr[i];
      const len = NODE.tickMin + raw * NODE.tickSpan * gain;
      const alpha = (0.15 + raw * 0.85) * b * (isActive ? 1 : 0.75);
      if (alpha < 0.03) continue;
      const hue = lerp(PALETTE.hueLow, PALETTE.hueHigh, i / 127) + swing;
      g.strokeStyle = hsl(hue, PALETTE.sat, PALETTE.light, alpha);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const r0 = NODE.radius;
      const r1 = r0 + len;
      g.beginPath();
      g.moveTo(c * r0, s * r0);
      g.lineTo(c * r1, s * r1);
      if (mirror) {
        g.moveTo(c * r0, -s * r0);
        g.lineTo(c * r1, -s * r1);
      }
      g.stroke();

      // 峰值保持：顶部一小段亮帽
      if (detailTicks && isActive && sp.peak[i] > 0.12) {
        const pr = r0 + NODE.tickMin + sp.peak[i] * NODE.tickSpan;
        g.strokeStyle = hsl(hue, 90, 78, alpha * 0.8);
        g.beginPath();
        g.moveTo(c * pr, s * pr);
        g.lineTo(c * (pr + 14), s * (pr + 14));
        g.stroke();
      }
    }
  }

  /** 非高亮节点的简化环（一次 path 一根 stroke）—— 只在拉远（LOD）时用 */
  function drawSimpleRing(st, b, swing) {
    const sp = st.spec;
    // 拉远时节点就是地图上的“灯”：按 idle 的 0.15 画等于整张图没点亮
    const vis = Math.max(b, 0.45);
    g.lineWidth = strokeW(st.view.z, 3, 0.8);
    g.strokeStyle = hsl(PALETTE.hueHigh + swing, PALETTE.sat, PALETTE.light, vis * 0.75);
    g.beginPath();
    g.arc(0, 0, NODE.radius, 0, TAU);
    g.stroke();
    g.beginPath();
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const len = 26 + sp.total * 60;
      g.moveTo(c * NODE.radius, s * NODE.radius);
      g.lineTo(c * (NODE.radius + len), s * (NODE.radius + len));
    }
    g.stroke();
  }

  /** 中环：反向自转 + 符文逐个点亮（midHi 频段，像跑马灯） */
  function drawMidRing(st, b, swing, isActive) {
    const sp = st.spec;
    const r = NODE.radius * 0.66;
    const dir = st.anim ? -st.now * 0.3 * (1 + sp.low * 1.2) : 0;
    g.lineWidth = strokeW(st.view.z, 2.4, 0.7);
    g.strokeStyle = hsl(PALETTE.hueHigh + swing, 70, 66, b * 0.5);
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.stroke();

    const lit = Math.floor(clamp(sp.midHi * 3.2, 0, 1) * runes.length);
    const runner = st.anim ? Math.floor(st.now * 2.4) % runes.length : -1;
    const scale = 1 + sp.midHi * 0.15;
    for (let k = 0; k < runes.length; k += 1) {
      const on = isActive && (k < lit || k === runner);
      const a = dir + (k / runes.length) * TAU;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      g.save();
      g.translate(x, y);
      g.rotate(a + Math.PI / 2);
      g.scale(scale, scale);
      g.strokeStyle = on
        ? hsl(lerp(PALETTE.hueLow, PALETTE.hueHigh, 0.75) + swing, 92, 74, b)
        : hsl(PALETTE.hueHigh + swing, 50, 62, b * 0.3);
      g.lineWidth = strokeW(st.view.z, 3, 0.9);
      g.beginPath();
      const pts = runes[k];
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke();
      g.restore();
    }
  }

  /** 内核几何：呼吸脉冲（midLo → 填充与透明度） */
  function drawCore(st, b, swing) {
    const sp = st.spec;
    const sides = 6;
    const rot = st.anim ? st.now * (0.5 + sp.low * 1.5) : 0;
    const r = NODE.radius * (0.34 + sp.midLo * 0.12);
    g.beginPath();
    for (let i = 0; i <= sides; i += 1) {
      const a = rot + (i / sides) * TAU;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = hsl(lerp(PALETTE.hueLow, PALETTE.hueHigh, 0.6) + swing, 88, 60, (0.1 + sp.midLo * 0.5) * b);
    g.fill();
    g.strokeStyle = hsl(PALETTE.hueHigh + swing, 90, 72, 0.55 * b);
    g.lineWidth = clamp(3 / st.view.z, 0.9, 6);
    g.stroke();

    // 内核里的一点芯光
    const core = g.createRadialGradient(0, 0, 0, 0, 0, r);
    core.addColorStop(0, `rgba(255,255,255,${(0.16 + sp.midLo * 0.3) * b})`);
    core.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
  }

  /* ------------------------------------------------------------ 歌词文字 */

  function measure(text, fs) {
    const key = `${fs}|${text}`;
    const hit = measureCache.get(key);
    if (hit) return hit;
    g.font = `600 ${fs}px ${FONT_FAMILY}`;
    const chars = [];
    let x = 0;
    for (const ch of text) {
      const w = g.measureText(ch).width;
      chars.push({ ch, x, w });
      x += w;
    }
    const out = { width: x, chars };
    if (measureCache.size >= MEASURE_CACHE_MAX) measureCache.clear();
    measureCache.set(key, out);
    return out;
  }

  /** 按行长算出实际字号与布局（缓存在节点上，换文字才重算） */
  function layoutOf(n) {
    const text = String(n.line?.text ?? "").trim();
    if (!text) return null;
    if (n.layout && n.layout.text === text) return n.layout;
    const base = NODE.fontSize * textScale;
    let fs = base;
    let m = measure(text, fs);
    if (m.width > NODE.maxTextWidth) {
      fs = Math.max(42, (NODE.maxTextWidth / m.width) * fs);
      m = measure(text, fs);
    }
    n.layout = { text, fs, width: m.width, chars: m.chars };
    return n.layout;
  }

  /** 设置里的歌词字号 → 世界字号缩放（改了要把节点上的布局作废，见 skin.js） */
  function setTextScale(s) {
    textScale = clamp(Number(s) || 1, 0.5, 2);
  }

  /** 这个节点的镜头目标缩放（让不同长短的歌词在屏幕上一样大） */
  function nodeZoom(n, stageW) {
    const lay = layoutOf(n);
    if (!lay) return n.zoomHint;
    return zoomForText(lay.width, stageW, n.zoomHint);
  }

  /** 文字碎裂用：每个字在节点本地坐标里的位置 */
  function textPoints(n) {
    const lay = layoutOf(n);
    if (!lay) return [];
    const half = -lay.width / 2;
    return lay.chars.map((c) => ({ x: half + c.x + c.w / 2, y: 0 }));
  }

  /**
   * 歌词：在阵心逐字聚合成型（approaching）→ 完全显示（active）
   * → 碎成粒子飘散（passing，粒子由 skin.js 负责撒）。
   */
  function drawText(st, n, b) {
    if (!st.showLyrics) return;
    const lay = layoutOf(n);
    if (!lay) return;
    const since = st.now - n.stateAt;

    let assemble = 1;
    let scatter = 0;
    if (n.state === "approaching") assemble = clamp(since / (n.assembleDur || NODE.assembleSec), 0, 1);
    else if (n.state === "passing") scatter = clamp(since / NODE.shatterSec, 0, 1);
    else if (n.state === "idle") assemble = 0;

    const driftX = st.shatterDriftX || 0;
    const half = -lay.width / 2;
    g.font = `600 ${lay.fs}px ${FONT_FAMILY}`;
    g.textAlign = "left";
    g.textBaseline = "middle";

    const total = lay.chars.length;
    for (let k = 0; k < total; k += 1) {
      const c = lay.chars[k];
      // 逐字错峰：后一个字晚 0.4 个周期起步
      const stagger = total > 1 ? (k / (total - 1)) * 0.4 : 0;
      const t = assemble >= 1 ? 1 : easeOutCubic(clamp((assemble - stagger) / 0.6, 0, 1));

      let x = half + c.x + c.w / 2;
      let y = 0;
      let alpha = 1;

      if (t < 1) {
        // 从外环刻度尖端飞向阵心（带一点侧向弧线）
        const a = (k / Math.max(total, 1)) * TAU - Math.PI / 2;
        const r = NODE.radius + NODE.tickSpan * 0.75;
        const sx = Math.cos(a) * r;
        const sy = Math.sin(a) * r;
        x = lerp(sx, x, t);
        y = lerp(sy, y, t) + Math.sin(Math.PI * t) * 46;
        alpha = Math.pow(t, 0.7);
      }
      if (scatter > 0) {
        x += driftX * scatter * (0.6 + (k % 5) * 0.16);
        y += Math.sin(k * 1.7) * 120 * scatter;
        alpha = 1 - Math.pow(scatter, 0.8);
      }
      if (alpha <= 0.02) continue;

      const alphaAll = alpha * b;
      if (alphaAll > 0.25) {
        g.fillStyle = `rgba(150,190,255,${(alphaAll * 0.3).toFixed(3)})`;
        g.fillText(c.ch, x - c.w / 2 - 3, y + 2);
      }
      g.fillStyle = `rgba(236,240,255,${alphaAll.toFixed(3)})`;
      g.fillText(c.ch, x - c.w / 2, y);
    }
  }

  /* ---------------------------------------------------------------- Layer 4 */

  function drawWorldParticles(st) {
    layer(st, PARALLAX.worldParticles);
    const p = st.worldPool;
    const rect = visible(st, PARALLAX.worldParticles, 500);
    for (let i = 0; i < p.cap; i += 1) {
      if (!p.alive[i]) continue;
      const x = p.x[i];
      const y = p.y[i];
      if (!inRect(rect, x, y, 60)) continue;
      const t = clamp(p.life[i] / p.max[i], 0, 1);
      const kind = p.kind[i];

      if (kind === KIND.RIPPLE) {
        const grow = 1 + 2.6 * (1 - t);
        const r = p.size[i] * grow;
        g.strokeStyle = hsl(p.hue[i], p.sat[i], p.light[i], Math.pow(t, 1.6) * 0.45);
        g.lineWidth = strokeW(st.view.z, 6 * t, 1);
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.stroke();
        continue;
      }

      const size = p.size[i] * (0.5 + t * 0.7);
      g.fillStyle = hsl(p.hue[i], p.sat[i], p.light[i], Math.sin(Math.PI * t) * 0.9);
      if (kind === KIND.SHARD) {
        g.save();
        g.translate(x, y);
        g.rotate(p.rot[i]);
        g.fillRect(-size / 2, -size / 6, size, size / 3);
        g.restore();
      } else if (kind === KIND.MOTE) {
        g.fillRect(x - size / 2, y - size / 2, size, size);
      } else {
        g.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
  }

  function drawScreenParticles(st) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = st.screenPool;
    for (let i = 0; i < p.cap; i += 1) {
      if (!p.alive[i]) continue;
      const t = clamp(p.life[i] / p.max[i], 0, 1);
      const size = p.size[i] * (0.6 + t * 0.5);
      const a = Math.sin(Math.PI * t) * 0.75;
      g.fillStyle = hsl(p.hue[i], p.sat[i], p.light[i], a);
      if (p.kind[i] === KIND.FEATHER) {
        g.fillRect(p.x[i], p.y[i], Math.max(1, size * 0.22), size);
      } else {
        g.fillRect(p.x[i] - size / 2, p.y[i] - size / 2, size, size);
      }
    }
  }

  /* ---------------------------------------------------------------- 反投影 */

  /** 屏幕坐标 → 世界坐标（只用于点节点，取视差 1 的那一层） */
  function worldAt(st, sx, sy) {
    const v = st.view;
    let dx = (sx - W / 2) / v.z;
    let dy = (sy - H / 2) / v.z;
    if (v.rot) {
      const c = Math.cos(-v.rot);
      const s = Math.sin(-v.rot);
      const rx = dx * c - dy * s;
      const ry = dx * s + dy * c;
      dx = rx;
      dy = ry;
    }
    return { x: v.x + dx, y: v.y + dy };
  }

  /** 点击命中：返回节点下标（-1 = 没点中） */
  function hitTest(st, sx, sy) {
    const w = worldAt(st, sx, sy);
    let best = -1;
    let bd = Infinity;
    for (const n of st.world.nodes) {
      const d = Math.hypot(n.x - w.x, n.y - w.y);
      if (d < NODE.radius * INTERACT.hitScale && d < bd) {
        bd = d;
        best = n.i;
      }
    }
    return best;
  }

  return { resize, draw, hitTest, worldAt, nodeZoom, textPoints, setTextScale, size: () => ({ W, H, dpr }) };
}

/* -------------------------------------------------------------------- 杂项 */

/**
 * 屏幕像素 → 世界单位的线宽。
 *
 * 画布是「先缩放 z 再画」的，所以线宽要除以 z 才能在任何缩放下都是
 * 同样的屏幕粗细 —— 不除的话拉远俯瞰时所有线条都会细成 0.3px（整屏发黑）。
 */
function strokeW(z, px, min) {
  return Math.max(px / Math.max(z, 0.02), min ?? 0.5);
}

/** 频谱质心 → 整体色相偏移（±PALETTE.hueSwing） */
function hueSwing(sp) {
  return (sp.centroid - 0.5) * 2 * PALETTE.hueSwing;
}

/** 符文的折线形状（固定种子，每次挂载长得一样） */
function buildRunes(count) {
  const rnd = mulberry32(0x9e3d71);
  const out = [];
  for (let k = 0; k < count; k += 1) {
    const pts = [];
    const segs = 3 + ((rnd() * 3) | 0);
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      const x = lerp(-14, 14, rnd() > 0.5 ? t : 1 - t);
      const y = lerp(-16, 16, t);
      pts.push(x, y);
    }
    // 保证每一枚都有“骨架”：首尾一定落在上下两端
    pts[0] = -12;
    pts[1] = -16;
    pts[pts.length - 2] = 12;
    pts[pts.length - 1] = 16;
    out.push(Float32Array.from(pts));
  }
  return out;
}
