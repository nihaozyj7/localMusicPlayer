/* ==========================================================================
   cube-matrix/lib/render.js — 画布绘制（只负责把几何填成多边形）
   --------------------------------------------------------------------------
   数学在 scene.js、取色在 palette.js，这里只做三件事：

     1. 背景（深色垂直渐变 + 一圈随色相流动的辉光）；
     2. 柱体（每根 = 两个可见侧面 + 顶面，按画家算法从远到近画）；
     3. 地面接触阴影与顶面高光（免费的体积感，不加渐变不加 blur）。

   性能取的是「少而稳」的做法：不做 shadowBlur、不做逐柱渐变、不建离屏位图，
   每帧的多边形数量 = 可见面（约 3 × 柱数）。
   ========================================================================== */

// 子模块依赖透传入口 URL 上的 token
const Q = new URL(import.meta.url).search;
const { projectCube, nudgeSide } = await import(`./scene.js${Q}`);
const { cubeTone } = await import(`./palette.js${Q}`);
const { clamp, hsla } = await import(`./util.js${Q}`);

/**
 * @param {HTMLCanvasElement} canvas 舞台画布
 */
export function createRenderer(canvas) {
  const g = canvas.getContext("2d", { alpha: false });

  let dpr = 1;
  let W = 0;
  let H = 0;
  /** 背景垂直渐变缓存（只在尺寸变化时重建） */
  let bgGrad = null;

  /**
   * @param {number} w CSS 像素宽
   * @param {number} h CSS 像素高
   * @param {number} ratio devicePixelRatio
   */
  function resize(w, h, ratio) {
    const nextW = Math.max(1, Math.round(Number(w) || 1));
    const nextH = Math.max(1, Math.round(Number(h) || 1));
    const nextDpr = clamp(Number(ratio) || 1, 1, 2.5);
    if (nextW === W && nextH === H && nextDpr === dpr) return false;
    W = nextW;
    H = nextH;
    dpr = nextDpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    bgGrad = null;
    return true;
  }

  /** 背景：一层静态暗底 + 一层随色相 / 能量流动的中心辉光 */
  function paintBackground(tone) {
    if (!bgGrad) {
      bgGrad = g.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, "#05060c");
      bgGrad.addColorStop(0.55, "#080a15");
      bgGrad.addColorStop(1, "#04050a");
    }
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, W, H);

    const glow = g.createRadialGradient(
      W * 0.5,
      H * 0.62,
      0,
      W * 0.5,
      H * 0.62,
      Math.max(W, H) * 0.62,
    );
    glow.addColorStop(0, hsla(tone.hueBase + 16, 82, 30, 0.5 + tone.energy * 0.22 + tone.beat * 0.14));
    glow.addColorStop(0.42, hsla(tone.hueBase + 170, 74, 20, 0.2));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    // 地平线附近的一条亮带：把「地面」这条隐形的线讲出来，方块才站得住
    const horizon = g.createLinearGradient(0, H * 0.34, 0, H * 0.78);
    horizon.addColorStop(0, "rgba(0,0,0,0)");
    horizon.addColorStop(0.62, hsla(tone.hueBase + 40, 88, 34, 0.12 + tone.energy * 0.1));
    horizon.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = horizon;
    g.fillRect(0, H * 0.34, W, H * 0.44);
  }

  /**
   * 画一帧。
   *
   * @param {object} p
   * @param {object} p.view createView() 的结果
   * @param {Array<object>} p.cells layoutGrid().cells
   * @param {number[]} p.order 画家算法的绘制顺序（远 → 近）
   * @param {Float32Array|number[]} p.heights 与 cells 一一对应的柱高（世界单位）
   * @param {object} p.tone frameTone() 的结果
   * @param {object} p.cube CUBE 常量（取 maxH 做归一化）
   * @param {object} p.color COLOR 常量
   */
  function draw(p) {
    const { view, cells, order, heights, tone, cube, color } = p;
    if (canvas.width !== Math.round(view.width * dpr) || canvas.height !== Math.round(view.height * dpr)) {
      resize(view.width, view.height, dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = "round";

    paintBackground(tone);

    const maxH = cube.maxH || 1;
    for (let n = 0; n < order.length; n += 1) {
      const idx = order[n];
      const cell = cells[idx];
      const h = heights[idx] || 0;
      drawCube(cell, h, clamp(h / maxH, 0, 1), tone, color, view);
    }
  }

  /** 单根柱体：接地阴影 + 两个可见侧面 + 顶面 + （高柱才有的）顶面高光边 */
  function drawCube(cell, h, h01, tone, color, view) {
    const geo = projectCube(view, cell, h);
    const light = cubeTone(tone, cell, h01, color);

    // 接地阴影：柱脚四边形向外扩一圈的暗块。有了它，柱子才像插在地上，
    // 而不是浮在画面上（只多一个多边形，不用 blur）。
    paintQuad(scaleQuad(geo.bottom, 1.18), "rgba(2,3,8,0.42)");

    // 凸柱体只有两个侧面朝向观察者（depth 最小的两个）；先把远的那个铺上去
    const sides = geo.sides.slice().sort((a, b) => b.depth - a.depth).slice(0, 2);
    // 排序后 sides[0] 是较远面
    paintQuad(nudgeSide(sides[0].points), hsla(light.hue, light.sat, light.light + color.lightFar));
    paintQuad(nudgeSide(sides[1].points), hsla(light.hue, light.sat, light.light + color.lightNear));

    // 顶面：最亮，是「方块」这个字被认出来的关键
    paintQuad(geo.top.points, hsla(light.hue, Math.min(99, light.sat + 4), light.light + color.lightTop));

    // 高柱子的顶面描一条亮边：一排尖峰会在画面上连成一道流动的亮线
    if (h01 > 0.55) {
      g.beginPath();
      tracePath(geo.top.points);
      g.strokeStyle = hsla(light.hue, 96, Math.min(94, light.light + 34), 0.55);
      g.lineWidth = 1;
      g.stroke();
    }
  }

  function tracePath(points) {
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) g.lineTo(points[i][0], points[i][1]);
    g.closePath();
  }

  function paintQuad(points, fill) {
    g.beginPath();
    tracePath(points);
    g.fillStyle = fill;
    g.fill();
  }

  /** 以四边形质心为中心缩放（接地阴影用） */
  function scaleQuad(points, k) {
    let cx = 0;
    let cy = 0;
    for (const p of points) {
      cx += p[0];
      cy += p[1];
    }
    cx /= points.length;
    cy /= points.length;
    return points.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
  }

  return { resize, draw, get width() { return W; }, get height() { return H; } };
}
