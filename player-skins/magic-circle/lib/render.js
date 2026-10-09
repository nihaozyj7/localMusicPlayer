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

// 子模块依赖同样要透传 token（原因见 skin.js 顶部那段说明）
const Q = new URL(import.meta.url).search;
const { INTERACT, NODE, PALETTE, PARALLAX, PERF, WORLD } = await import(`./config.js${Q}`);
const { zoomForText } = await import(`./layout.js${Q}`);
const { KIND } = await import(`./particles.js${Q}`);
const { clamp, easeOutCubic, hsl, lerp, mulberry32, quadAt, TAU } = await import(`./util.js${Q}`);

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
  /* —— 预烘精灵（见 bake* 的说明：渐变 fill 是逐像素现算的，blit 不是）—— */
  let bgSprite = null;
  let bodySprite = null;
  let glowSprite = null;
  /** draw() 每帧复用的两个集合（原先是每次 new，帧循环里的稳定 GC 压力） */
  const heroes = [];
  const near = [];
  /** 符文的固定形状（挂载一次，之后只是平移旋转） */
  const runes = buildRunes(NODE.runes);
  /** 文字测量缓存：text → {width, chars:[{ch,w}]} */
  const measureCache = new Map();

  /* ------------------------------------------------------------------ 精灵图
     为什么要有这套东西：画布的 createLinear/RadialGradient + fill 是**逐像素现算**
     的，而整屏铺一次（背景、暗角）或世界铺一次（阵体、光晕）都是「每帧铺满」的
     操作。实测（.tmp-magic/cpu-profile.mjs）93% 的采样时间落在原生绘制里，
     JS 侧根本不是瓶颈 —— 于是把**颜色不随帧变**的部分预烘成位图，
     运行期只做 drawImage（采样拷贝）；随频谱变的量交给 globalAlpha 与缩放，
     观感一致。
     ------------------------------------------------------------------------ */

  /** 新建一张离屏画布交给 paint 画；任何一步失败都返回 null（调用方走渐变兜底） */
  function bake(w, h, paint) {
    try {
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(w));
      cv.height = Math.max(1, Math.round(h));
      const cg = cv.getContext("2d");
      if (!cg) return null;
      paint(cg, cv.width, cv.height);
      return cv;
    } catch {
      return null;
    }
  }

  /** 背景：竖直渐变，按**半分辨率**烘一次、贴回时铺满 —— 拉伸只有 2 倍，
   *  而这条渐变在纵向本来就是平滑的（2 倍上采样看不出差别）。
   *  以前是 4×512 横向拉 360 倍：软件光栅下每个目标像素都要双线性采样，
   *  实测 3.3ms/帧；半分辨率版本既把内存从 5.2MB 压到 1.3MB，帧代价也接近 0。 */
  function bakeBackground() {
    const w = Math.max(2, Math.round(W / 2));
    const h = Math.max(2, Math.round(H / 2));
    return bake(w, h, (cg, cw, ch) => {
      const grad = cg.createLinearGradient(0, 0, 0, ch);
      grad.addColorStop(0, PALETTE.bg0);
      grad.addColorStop(0.55, PALETTE.bg1);
      grad.addColorStop(1, PALETTE.bg0);
      cg.fillStyle = grad;
      cg.fillRect(0, 0, cw, ch);
    });
  }

  /** 巨型底阵的阵体辉光：颜色定死（取频谱明暗的上限），明暗交给 globalAlpha。
   *  256² 够用 —— 这是一团极淡的径向填充，放大到整屏也看不出台阶。 */
  function bakeBaseBody() {
    return bake(256, 256, (cg, w, h) => {
      const c = w / 2;
      const grad = cg.createRadialGradient(c, c, c * 0.1, c, c, c);
      grad.addColorStop(0, hsl(PALETTE.hueHigh, 80, 46, 0.17));
      grad.addColorStop(0.72, hsl(PALETTE.hueHigh, 80, 42, 0.1));
      grad.addColorStop(1, hsl(PALETTE.hueHigh, 80, 40, 0));
      cg.fillStyle = grad;
      cg.fillRect(0, 0, w, h);
    });
  }

  /** 节点光晕：同上（色相取静态的中值，半径 / 亮度仍随频谱走） */
  function bakeGlow() {
    return bake(256, 256, (cg, w, h) => {
      const c = w / 2;
      const hue = lerp(PALETTE.hueLow, PALETTE.hueHigh, 0.7);
      const grad = cg.createRadialGradient(c, c, c * 0.1, c, c, c);
      grad.addColorStop(0, hsl(hue, 85, 62, 0.3));
      grad.addColorStop(0.5, hsl(hue, 85, 55, 0.12));
      grad.addColorStop(1, hsl(hue, 85, 50, 0));
      cg.fillStyle = grad;
      cg.fillRect(0, 0, w, h);
    });
  }

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

    // 渐变对象留着当兜底（精灵建不出来时还能画），精灵才是每帧走的那条路
    bgGrad = g.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, PALETTE.bg0);
    bgGrad.addColorStop(0.55, PALETTE.bg1);
    bgGrad.addColorStop(1, PALETTE.bg0);

    bgSprite = bakeBackground();
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

  /* ---------------------------------------------------------------- 主绘制 */

  function draw(st) {
    ensureStars();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 背景：按画布尺寸预烘的 1:1 精灵（≈ 直接拷贝）；建不出来才退回逐帧渐变
    if (bgSprite) g.drawImage(bgSprite, 0, 0, W, H);
    else {
      g.fillStyle = bgGrad;
      g.fillRect(0, 0, W, H);
    }

    drawStars(st);
    drawBase(st);
    drawPaths(st);

    // —— 主角（正在唱的 / 镜头正在落的 / 正在碎的）画全细节，且永远不被剔掉 ——
    // 两个集合复用实例上的缓冲区：帧循环里不 new 对象（见文件头的性能约定）
    heroes.length = 0;
    near.length = 0;
    for (let k = 0; k < 2; k += 1) {
      const idx = k === 0 ? st.singIdx : st.focusIdx;
      const n = idx >= 0 && idx != null ? st.world.nodes[idx] : null;
      if (n && heroes.indexOf(n) < 0) heroes.push(n);
    }
    const view = visible(st, PARALLAX.nodes, 900);
    for (const n of st.world.nodes) {
      if (!inRect(view, n.x, n.y, NODE.radius * 2 + 400)) continue;
      if (n.state === "passing" && heroes.indexOf(n) < 0) heroes.push(n);
      near.push(n);
    }
    if (near.length > PERF.maxNodes) {
      near.sort((a, b) => dist2(st, a) - dist2(st, b));
      near.length = PERF.maxNodes;
      for (const h of heroes) {
        if (near.indexOf(h) < 0) {
          near.pop();
          near.push(h);
        }
      }
    }
    // 非主角先画（在下），主角最后画（在上）—— 文字不该被别的节点压住
    for (const n of near) if (heroes.indexOf(n) < 0) drawNode(st, n, false);
    for (const n of near) if (heroes.indexOf(n) >= 0) drawNode(st, n, true);

    drawWorldParticles(st);
    drawScreenParticles(st);
    drawFlightFx(st);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (st.flash > 0.001) {
      g.fillStyle = `rgba(255,255,255,${(st.flash * 0.92).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
    // 暗角不再画在画布上：那是一次整屏径向渐变 / 放大贴图（实测 ~3ms/帧），
    // 改成 skin.css 里那层静态覆盖（视觉换算见 .mc__vig 的注释）。
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
   * 静态几何，全部攒成 3~4 条路径一次 stroke。
   *
   * ★ 外围**不自转**（按使用者要求）：阵是地基，角度恒定；
   *   会动的只有频谱 —— 下面的明暗、色相、阵体辉光仍然逐帧读 spec。
   */
  function drawBase(st) {
    layer(st, PARALLAX.base);
    const v = st.view;
    const detail = v.z >= PERF.detailZoom;
    const sp = st.spec;
    const swing = hueSwing(sp);
    // 拉远俯瞰（LOD）时反而要更亮：细节全砍了，只剩轮廓，再暗就是整屏发黑
    const baseAlpha = (detail ? 0.1 + sp.total * 0.32 : 0.3 + sp.total * 0.45) * (st.baseBright ?? 1);

    // 阵体辉光：一圈极淡的径向填充 —— **只在拉远俯瞰时画**。
    // 拉远时它把“地图”从纯黑背景里托起来（没有它俯瞰只剩几根细线，像没加载出来）；
    // 拉近时整屏都落在阵心那块近乎恒定的色里，却要为这一次贴图铺满全屏
    // （实测 ~5ms/帧，是整帧最贵的一笔），所以 detail 档直接不画。
    // 颜色不随帧变的部分预烘成精灵（baked 取频谱明暗的上限 0.17/0.10），
    // 明暗交给 globalAlpha，按 (0.07+0.1t)/0.17 折算；色相摆动不参与这一层
    // —— 0.04~0.17 的透明度上 ±20° 在夜空底上肉眼不可见，省一次整世界重烘。
    const body = detail ? null : bodySprite || (bodySprite = bakeBaseBody());
    if (body) {
      g.globalAlpha = clamp((0.412 + 0.588 * sp.total) * (st.baseBright ?? 1), 0, 1);
      g.drawImage(body, -WORLD.R, -WORLD.R, WORLD.R * 2, WORLD.R * 2);
      g.globalAlpha = 1;
    }

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
      const a = (i / WORLD.SPOKES) * TAU;
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
      const a = (i / 240) * TAU;
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
        const a = (i / WORLD.SPOKES) * TAU;
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

  /**
   * @param {object} st
   * @param {object} n
   * @param {boolean} full 是否画全细节（主角 / 正在碎的那颗）
   */
  function drawNode(st, n, full) {
    const v = st.view;
    const sp = st.spec;
    const b = brightness(st, n);
    const swing = hueSwing(sp);
    const detail = v.z >= PERF.detailZoom || full;
    // bass → 整个节点的呼吸缩放（平滑缩放，不是抖动）
    const breath = 1 + sp.bass * 0.12 * (full ? 1 : 0.4);
    const hover = n.hover || 0;

    g.save();
    g.translate(n.x, n.y);
    g.scale(breath, breath);

    if (detail) drawGlow(st, b, swing);
    if (detail) drawTicks(st, n, full, b, swing);
    else drawSimpleRing(st, b, swing);
    drawMidRing(st, b, swing, full);
    if (detail) drawCore(st, b, swing);
    // 主角画大字；待命的阵画一行浅色小字（告诉用户点它会跳到哪一句）
    if (full) drawText(st, n, b);
    else drawHint(st, n);

    if (hover > 0.01) {
      g.strokeStyle = hsl(PALETTE.hueHigh + swing, 90, 72, hover * 0.5);
      g.lineWidth = strokeW(v.z, 3, 1);
      g.beginPath();
      g.arc(0, 0, NODE.radius * 1.25, 0, TAU);
      g.stroke();
    }
    g.restore();
  }

  /** 光晕（total → 半径；亮度 → globalAlpha） */
  function drawGlow(st, b, swing) {
    const sp = st.spec;
    const r = NODE.radius * (1.25 + sp.total * 1.6);
    const spr = glowSprite || (glowSprite = bakeGlow());
    if (spr) {
      // 精灵是按 b=1 烘的（0.3 / 0.12 / 0 三档），整体透明度就是节点亮度
      g.globalAlpha = clamp(b, 0, 1);
      g.drawImage(spr, -r, -r, r * 2, r * 2);
      g.globalAlpha = 1;
      return;
    }
    // 精灵建不出来（画布受限）时退回逐帧渐变 —— swing 只有这条路在用
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
   * 外环 128 刻度 —— **全图唯一的频谱环**（按使用者要求：只留一圈）。
   * 刻度长度与亮度直读 fast[]，镜像层与本体同色同 alpha → 一圈 256 根、
   * 只 stroke 128 次。
   *
   * ★ 不自转：角度固定，逐帧变化的只有长度与亮度（频谱本身）。
   */
  function drawTicks(st, n, isActive, b, swing) {
    const sp = st.spec;
    const mirror = NODE.mirrorTicks;
    const arr = isActive ? sp.fast : sp.slow;
    const gain = isActive ? 1 : 0.42;
    const detailTicks = isActive || st.view.z >= 0.32;

    g.lineCap = "butt";
    // 刻度必须自己给线宽：它会吃到上一次 stroke 留下的 lineWidth（那可能是
    // 底阵的 1.6px，也可能是某个环的 3px），不同节点看起来会不一样粗
    g.lineWidth = strokeW(st.view.z, 1.5, 0.5);
    for (let i = 0; i < 128; i += 1) {
      const a = (i / 128) * TAU - Math.PI / 2;
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

  /**
   * 中环：符文按 midHi 频段逐个点亮。
   * ★ 不自转、也不再跑跑马灯（按使用者要求：外围都不转，只有频谱在变）。
   */
  function drawMidRing(st, b, swing, isActive) {
    const sp = st.spec;
    const r = NODE.radius * 0.66;
    g.lineWidth = strokeW(st.view.z, 2.4, 0.7);
    g.strokeStyle = hsl(PALETTE.hueHigh + swing, 70, 66, b * 0.5);
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.stroke();

    const lit = Math.floor(clamp(sp.midHi * 3.2, 0, 1) * runes.length);
    const scale = 1 + sp.midHi * 0.15;
    for (let k = 0; k < runes.length; k += 1) {
      const on = isActive && k < lit;
      const a = (k / runes.length) * TAU;
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

  /** 内核几何：呼吸脉冲（midLo → 半径、填充与透明度）—— 形状固定，不自转 */
  function drawCore(st, b, swing) {
    const sp = st.spec;
    const sides = 6;
    const r = NODE.radius * (0.34 + sp.midLo * 0.12);
    g.beginPath();
    for (let i = 0; i <= sides; i += 1) {
      const a = (i / sides) * TAU;
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

  /**
   * 给每个字配一组**稳定**的姿态：大小、角度、高低、摇曳相位 —— 这就是
   * 「魔法味」的来源（同一句里的字大小/角度略微不一样，再各自慢慢摆）。
   *
   * 用**文本哈希**而不是 Math.random：同一句每一帧画出来都一样，
   * 不会逐帧乱抖；换一句才换姿态。
   *
   * @param {string} text
   * @param {number} k 字序
   */
  function charPose(text, k) {
    let h = 0x811c9dc5 ^ text.length;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    h = Math.imul(h ^ (k + 0x9e3779b9), 0x85ebca6b);
    const next = () => {
      h = Math.imul(h ^ (h >>> 16), 0x27d4eb2d);
      h ^= h >>> 15;
      return ((h >>> 0) % 10000) / 10000;
    };
    return {
      tilt: (next() - 0.5) * 0.2, // ±5.7°
      scale: 1 + (next() - 0.5) * 0.13, // ±6.5%
      dy: (next() - 0.5) * 0.16, // 相对字号的高低差
      phase: next() * TAU, // 摇曳相位（各自错开）
    };
  }

  /* -------------------------------------------------------------------- 文字 */

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
    n.layout = {
      text,
      fs,
      width: m.width,
      // measure 的结果是跨节点共享的，姿态要另建一份（别改它）
      chars: m.chars.map((c, k) => ({ ...c, ...charPose(text, k) })),
    };
    return n.layout;
  }

  /**
   * **预渲染**：把这一句的每个字先画成小位图（蓝光 + 本体一起烘进去）。
   *
   * 两个目的，都是这次按使用者反馈加的：
   *   · 镜头还没到，字已经渲染好 —— 落地那一刻直接是成品，不会再看到
   *     “字还在路上拼”糊掉的画面；
   *   · 运行期每帧只剩 drawImage（比逐字 fillText + 晕影描边便宜得多）。
   *
   * 按需建：只有主角 / 正在碎的节点才会持有位图，闲置即弃（见 skin.js）。
   *
   * @returns {{text:string, scale:number, items:Array}|null}
   */
  function ensureGlyphs(n) {
    const lay = layoutOf(n);
    if (!lay) return null;
    // 出图分辨率 = 这一轮镜头的目标缩放 × dpr（保证屏幕像素 1:1，缩放正好）。
    // 夹到 2：短句会被镜头放得很大（targetZoom 可以到 4+），位图跟着 4 倍化，
    // 一颗字就是几百 KB —— 上限 2× 足够清晰（再放大也只是轻微柔化），内存少一半以上。
    const scale = clamp((n.targetZoom || 1) * dpr, 0.25, 2);
    if (n.glyphs && n.glyphs.text === lay.text && n.glyphs.scale === scale) return n.glyphs;

    // 字形位图的上下留白：0.3em 足够盖住拉丁降部（~0.22em）与 CJK 满框（±0.5em）
    // 又不至于把每颗字撑成 1.8 倍高 —— 这一格直接决定字形位图的内存。
    const pad = Math.ceil(lay.fs * 0.3 * scale);
    const items = [];
    try {
      for (const c of lay.chars) {
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.ceil(c.w * scale));
        cv.height = Math.max(1, Math.ceil(lay.fs * scale)) + pad * 2;
        const cg = cv.getContext("2d");
        if (!cg) return null;
        cg.font = `600 ${lay.fs * scale}px ${FONT_FAMILY}`;
        cg.textAlign = "center";
        cg.textBaseline = "middle";
        // 先一层蓝光，再本体（把运行期的两遍 fillText 合成一次）
        cg.fillStyle = "rgba(150,190,255,0.42)";
        cg.fillText(c.ch, cv.width / 2 - 3 * scale, cv.height / 2 + 2 * scale);
        cg.fillStyle = "rgba(236,240,255,1)";
        cg.fillText(c.ch, cv.width / 2, cv.height / 2);
        items.push(cv);
      }
    } catch {
      return null; // 画布建不动就退回矢量路径，不影响功能
    }
    n.glyphs = { text: lay.text, scale, items };
    return n.glyphs;
  }

  /**
   * 镜头出发时就调用：排版 + 位图一次做完（skin.js 在 onFocus 里调）。
   * 位图的出图分辨率直接用渲染器自己的 dpr（draw() 每帧 setTransform 的那个）。
   *
   * @param {object} n 节点
   * @param {number} zoom 这一轮的镜头目标缩放
   */
  function prewarm(n, zoom) {
    n.targetZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : n.zoomHint;
    layoutOf(n);
    ensureGlyphs(n);
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
   *
   * 有预渲染位图就贴位图（相机缩放与出图缩放不一致时按世界尺寸缩放贴），
   * 拿不到才退回逐字 fillText。
   */
  function drawText(st, n, b) {
    if (!st.showLyrics) return;
    const lay = layoutOf(n);
    if (!lay) return;
    const glyphs = ensureGlyphs(n);
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

      // —— 每个字自带一组姿态：大小 / 角度 / 高低，再各自慢慢摇曳（魔法味）——
      const twinkle = st.anim ? 0.92 + 0.08 * Math.sin(st.now * 1.25 + c.phase * 2.1) : 1;
      const a = alpha * b * twinkle;
      if (a <= 0.02) continue;
      const sway = st.anim ? Math.sin(st.now * 0.85 + c.phase) * 0.045 : 0;
      const bob = st.anim ? Math.sin(st.now * 0.6 + c.phase * 1.7) * 0.04 : 0;

      g.save();
      g.translate(x, y + lay.fs * (c.dy + bob));
      g.rotate(c.tilt + sway);
      g.scale(c.scale, c.scale);
      const cv = glyphs && glyphs.items[k];
      if (cv) {
        // 位图 → 世界尺寸（出图时按 targetZoom 放大过，这里换算回去）
        const gw = cv.width / glyphs.scale;
        const gh = cv.height / glyphs.scale;
        g.globalAlpha = a;
        g.drawImage(cv, -gw / 2, -gh / 2, gw, gh);
      } else {
        if (a > 0.25) {
          g.fillStyle = `rgba(150,190,255,${(a * 0.3).toFixed(3)})`;
          g.fillText(c.ch, -c.w / 2 - 3, 2);
        }
        g.fillStyle = `rgba(236,240,255,${a.toFixed(3)})`;
        g.fillText(c.ch, -c.w / 2, 0);
      }
      g.restore();
    }
  }

  /**
   * 跳转预览小字的位图（整行一次成图）。
   *
   * 待命的魔法阵是可以点的，但上面什么字都没有 —— 用户不知道点下去会跳到
   * 哪一句。所以给每颗待命阵挂一行浅色小字，**按需建、一次成图**：
   * 位图是屏幕像素尺寸，画的时候按当前 zoom 缩放，拉近拉远都不至于糊掉。
   *
   * @returns {{text:string, canvas:HTMLCanvasElement, ar:number}|null}
   */
  function ensureHint(n) {
    const text = String(n.line?.text ?? "").trim();
    if (!text) return null;
    if (n.hint && n.hint.text === text) return n.hint;

    const fontPx = NODE.hint.fontPx;
    const scale = clamp(dpr, 1, 2);
    const label = text.length > 44 ? `${text.slice(0, 43)}…` : text;
    const cv = document.createElement("canvas");
    const cg = cv.getContext("2d");
    if (!cg) return null;

    // 按**最终会显示的宽度**（maxPx）先定字号再烘：以前按原字号烘满整行、
    // 再在绘制时缩小 —— 44 个字的位图 ≈ 100KB/颗，30 颗就是 3MB 白占。
    // ar（宽高比）是字号无关的，所以绘制侧 dw/dh 算出来跟以前一模一样，
    // 而位图现在正好是显示尺寸的 1:1 设备像素。
    let fs = fontPx * scale;
    cg.font = `500 ${fs}px ${FONT_FAMILY}`;
    let m = cg.measureText(label);
    const limit = NODE.hint.maxPx * scale;
    if (m.width > limit && m.width > 1) {
      fs = Math.max(8 * scale, (limit / m.width) * fs);
      cg.font = `500 ${fs}px ${FONT_FAMILY}`;
      m = cg.measureText(label);
    }
    cv.width = Math.max(2, Math.ceil(m.width + fs * 0.4));
    cv.height = Math.max(2, Math.ceil(fs * 1.6));
    // 画布尺寸一改，上下文状态会被重置 —— 字体 / 对齐要重设
    cg.font = `500 ${fs}px ${FONT_FAMILY}`;
    cg.textAlign = "center";
    cg.textBaseline = "middle";
    cg.fillStyle = "rgba(226,234,255,0.96)";
    cg.fillText(label, cv.width / 2, cv.height / 2);
    n.hint = { text, canvas: cv, ar: cv.width / cv.height };
    return n.hint;
  }

  /** 待命节点下方的浅色小字（主角不画 —— 主角有大字） */
  function drawHint(st, n) {
    if (!st.showLyrics) return;
    const h = ensureHint(n);
    if (!h) return;
    const z = st.view.z;
    if (!(z > 0.04)) return; // 拉到只剩一片点阵时就不写字了
    const hovered = n.hover > 0.01;
    const px = NODE.hint.px * (hovered ? 1.18 : 1);
    let dh = px / z;
    let dw = dh * h.ar;
    const maxW = NODE.hint.maxPx / z;
    if (dw > maxW) {
      const k = maxW / dw;
      dw *= k;
      dh *= k;
    }
    const cy = NODE.radius + (NODE.hint.offsetY + (hovered ? 2 : 0)) / z;
    g.globalAlpha = hovered ? NODE.hint.hoverAlpha : NODE.hint.alpha;
    g.drawImage(h.canvas, -dw / 2, cy - dh / 2, dw, dh);
    g.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------- Layer 4 */

  /* ---------------------------------------------------- 转场笔触（飞行特效） */

  /**
   * 不同运镜给不同的笔触 —— 这是“转场要丰富一点”的落点：
   *   · dash / pan / zoomOut：沿飞行方向的速度线（屏幕空间，中段最亮）；
   *   · arc：弧线上跑一颗光包（世界空间，跟着贝塞尔走）。
   * rotate / pass 本身就有画面语言（公转 / 白闪），这里不重复加。
   */
  function drawFlightFx(st) {
    const pr = st.flight;
    if (!pr || !st.anim) return;
    const amp = Math.sin(Math.PI * pr.p);
    if (amp <= 0.01) return;

    if (pr.type === "arc" && pr.ctrl) {
      layer(st, PARALLAX.nodes);
      const e = pr.p * pr.p * (3 - 2 * pr.p); // 沿弧线平滑推进
      const pt = quadAt(pr.from, pr.ctrl, pr.to, e);
      const r = 44 + 34 * amp;
      const grad = g.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
      grad.addColorStop(0, `rgba(240,247,255,${(0.85 * amp).toFixed(3)})`);
      grad.addColorStop(0.4, `rgba(140,190,255,${(0.32 * amp).toFixed(3)})`);
      grad.addColorStop(1, "rgba(140,190,255,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(pt.x, pt.y, r, 0, TAU);
      g.fill();
    }

    if (pr.type !== "dash" && pr.type !== "pan" && pr.type !== "zoomOut") return;
    // 世界位移 → 屏幕位移（镜头反方向走），太小说明是纯纵深运动，不画速度线
    const z = st.view.z;
    const dx = -(pr.to.x - pr.from.x) * z;
    const dy = -(pr.to.y - pr.from.y) * z;
    const len = Math.hypot(dx, dy);
    if (len < 30) return;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = "round";
    for (let i = 0; i < 10; i += 1) {
      const off = ((i % 5) - 2) * (44 + ((i * 37) % 70));
      const jitter = 0.5 + ((i * 53) % 47) / 94;
      const start = -160 - jitter * 300;
      const l = 190 + ((i * 97) % 230);
      const a = amp * (0.09 + ((i * 31) % 40) / 420);
      const x0 = W / 2 + nx * off + ux * start;
      const y0 = H / 2 + ny * off + uy * start;
      g.strokeStyle = `rgba(196,218,255,${a.toFixed(3)})`;
      g.lineWidth = 1 + ((i * 17) % 3);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + ux * l, y0 + uy * l);
      g.stroke();
    }
    g.restore();
  }

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

  return { resize, draw, hitTest, worldAt, nodeZoom, textPoints, setTextScale, prewarm, size: () => ({ W, H, dpr }) };
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
