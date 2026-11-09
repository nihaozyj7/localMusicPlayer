/* ==========================================================================
   cube-matrix/lib/scene.js — 网格布局、透视投影、单柱几何（纯函数）
   --------------------------------------------------------------------------
   渲染只负责「把这里算出来的屏幕坐标填成多边形」，所有数学都在这里，
   于是 node --test 能在没有画布的情况下验：
     · 投影是不是真的近大远小；
     · 柱体排序是不是「远的先画」（画家算法）；
     · 舞台尺寸变化时地面与网格有没有跑出画外。
   ========================================================================== */

// 子模块依赖透传入口 URL 上的 token（原因见 skin.js 顶部说明）
const Q = new URL(import.meta.url).search;
const { clamp } = await import(`./util.js${Q}`);

/** 网格四角（相对柱心的单位偏移，顺序：左上 / 右上 / 右下 / 左下） */
export const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** 网格四角（世界坐标，用来算包围盒做居中补偿） */
const GRID_CORNERS_XZ = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/**
 * 创建一帧的视图参数。
 *
 * 这里多做两件事（都只跟相机几何有关，一次算出 4 个点，成本可忽略）：
 *   1. 纵向：前沿地面若掉出画面底部，按比例收一点尺度；
 *   2. 横向：侧看（baseYaw）会把网格重心推向一侧，用四角的包围盒算一个
 *      居中补偿，交给 cx。否则宽窗口里矩阵会一直「偏左、右边空一大块」。
 *
 * @param {number} width 舞台宽（CSS 像素）
 * @param {number} height 舞台高（CSS 像素）
 * @param {number} timeSec 动画时钟（秒）
 * @param {{fov:number,baseYaw:number,yawAmp:number,pitchZ:number,yStretch:number,floorY:number,fitW:number,fitH:number}} cam
 *        CAM 常量（用参数传进来，测试里可以换一套）
 * @returns {object} 视图参数（project() 的输入）
 */
export function createView(width, height, timeSec, cam) {
  const w = Math.max(1, Number(width) || 0);
  const h = Math.max(1, Number(height) || 0);
  const sway = Math.sin((timeSec / Math.max(0.001, cam.yawPeriod || 46)) * Math.PI * 2) * cam.yawAmp;
  const yaw = (cam.baseYaw || 0) + sway;

  const make = (unit, cx) => ({
    width: w,
    height: h,
    unit,
    cx,
    floorY: h * cam.floorY,
    yaw,
    cosYaw: Math.cos(yaw),
    sinYaw: Math.sin(yaw),
    pitchZ: cam.pitchZ,
    yStretch: cam.yStretch,
    fov: cam.fov,
  });

  let view = make(Math.min(w * cam.fitW, h * cam.fitH), w / 2);

  // 1) 前沿地面不能掉出画面（柱子本身可以略微出画，地面不行，不然「地板」会断）
  const front = project(view, 0, 0, 1);
  const limit = h * 0.98;
  if (front.sy > limit && front.sy > view.floorY) {
    const shrink = (limit - view.floorY) / (front.sy - view.floorY);
    view = make(view.unit * clamp(shrink, 0.5, 1), w / 2);
  }

  // 2) 横向居中：四角包围盒的中心对齐到舞台中心
  let minSx = Infinity;
  let maxSx = -Infinity;
  for (const [x, z] of GRID_CORNERS_XZ) {
    const p = project(view, x, 0, z);
    if (p.sx < minSx) minSx = p.sx;
    if (p.sx > maxSx) maxSx = p.sx;
  }
  view.cx = w / 2 + (w / 2 - (minSx + maxSx) / 2);
  return view;
}

/**
 * 世界坐标 → 屏幕坐标。
 *
 * @param {object} view createView() 的结果
 * @param {number} x 世界横向（-1..1）
 * @param {number} y 世界高度（≥0）
 * @param {number} z 世界纵深（-1 = 最远，+1 = 最近）
 * @returns {{sx:number, sy:number, k:number, depth:number}}
 *          k = 透视系数（近大远小），depth = 到相机的距离（越大越远）
 */
export function project(view, x, y, z) {
  const x1 = x * view.cosYaw - z * view.sinYaw;
  const z1 = x * view.sinYaw + z * view.cosYaw;
  // z1 越大越靠近观察者，所以距离取负号；k 与距离成反比（近大远小）
  const depth = -z1;
  const k = view.fov / (view.fov + depth);
  return {
    sx: view.cx + x1 * view.unit * k,
    sy: view.floorY + (z1 * view.pitchZ - y * view.yStretch) * view.unit * k,
    k,
    depth,
  };
}

/**
 * 网格布局：每格的柱心世界坐标、半边长度、以及给高度函数用的归一化列索引。
 * 与时间无关，挂载时算一次即可。
 *
 * @param {{cols:number, rows:number, gap:number}} grid GRID 常量
 */
export function layoutGrid(grid) {
  const cols = Math.max(1, grid.cols | 0);
  const rows = Math.max(1, grid.rows | 0);
  const stepX = cols > 1 ? 2 / (cols - 1) : 2;
  const stepZ = rows > 1 ? 2 / (rows - 1) : 2;
  // 缝隙按「步长 × (1 - gap)」取边长：gap = 0.24 → 方块占 76%，格与格之间留出空隙
  const halfX = (stepX * (1 - grid.gap)) / 2;
  const halfZ = (stepZ * (1 - grid.gap)) / 2;

  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        col,
        row,
        cols,
        rows,
        /** 0（最左）..1（最右） */
        colNorm: cols > 1 ? col / (cols - 1) : 0.5,
        /** 0（最远）..1（最近） */
        rowNorm: rows > 1 ? row / (rows - 1) : 0.5,
        gx: cols > 1 ? -1 + col * stepX : 0,
        gz: rows > 1 ? -1 + row * stepZ : 0,
        halfX,
        halfZ,
      });
    }
  }
  return { cells, cols, rows, stepX, stepZ };
}

/**
 * 单根柱体的屏幕几何。
 *
 * @param {object} view createView() 的结果
 * @param {object} cell layoutGrid() 的一格
 * @param {number} h 柱高（世界单位）
 * @returns {{depth:number, sides:Array<{points:Array<[number,number]>, depth:number}>,
 *            top:{points:Array<[number,number]>, depth:number}}}
 *          sides 是 4 个侧面（未排序），top 是顶面
 */
export function projectCube(view, cell, h) {
  const height = Math.max(0, Number(h) || 0);
  const bottom = [];
  const top = [];
  let depthSum = 0;

  for (let i = 0; i < CORNERS.length; i += 1) {
    const [dx, dz] = CORNERS[i];
    const x = cell.gx + dx * cell.halfX;
    const z = cell.gz + dz * cell.halfZ;
    const p = project(view, x, 0, z);
    bottom.push(p);
    // 同一 (x, z) 的顶点共享 sx / k，只是高度方向抬升
    top.push({ sx: p.sx, sy: p.sy - height * view.yStretch * view.unit * p.k, k: p.k, depth: p.depth });
    depthSum += p.depth;
  }

  const sides = [];
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    sides.push({
      points: [
        [bottom[i].sx, bottom[i].sy],
        [bottom[j].sx, bottom[j].sy],
        [top[j].sx, top[j].sy],
        [top[i].sx, top[i].sy],
      ],
      depth: (bottom[i].depth + bottom[j].depth) / 2,
    });
  }

  return {
    depth: depthSum / 4,
    sides,
    top: {
      points: top.map((p) => [p.sx, p.sy]),
      depth: depthSum / 4,
    },
    /** 柱脚四点（用来画接地阴影，顺序与 CORNERS 一致） */
    bottom: bottom.map((p) => [p.sx, p.sy]),
  };
}

/**
 * 画家算法：把柱体按「远 → 近」排序（远先画，近的盖上去）。
 * 返回的是**索引数组**，不复制柱体本身。
 *
 * @param {Array<object>} cells layoutGrid().cells
 * @param {object} view createView() 的结果
 */
export function orderByDepth(cells, view) {
  const keyed = cells.map((cell, i) => ({
    i,
    d: project(view, cell.gx, 0, cell.gz).depth,
  }));
  keyed.sort((a, b) => b.d - a.d);
  return keyed.map((k) => k.i);
}

/**
 * 把四个侧面的屏幕四点多边形缩一点（避免相邻柱体的抗锯齿边互相啃）。
 * 这里只做纵向微缩：柱底收 0.4px、柱顶不收 —— 矮柱看起来更「立在地上」。
 *
 * @param {Array<[number,number]>} points 来自 projectCube 的多边形
 */
export function nudgeSide(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i];
    out.push([x, i < 2 ? y - 0.4 : y]);
  }
  return out;
}

/**
 * 一根柱子在某一帧的目标高度 —— **纯频谱驱动**。
 *
 * 高度只由「这一列在这一时刻的频段电平」决定，里面没有任何与音频无关的
 * 振荡（早期版本加了正弦去找「节奏感」，结果是画面在自己起伏、和音乐无关）。
 *
 * @param {number} level 列电平（0..1，来自 spectrum.js#fillColumnLevels / 历史行）
 * @param {object} cfg { base, specAmp, maxH }
 */
export function cubeHeight(level, cfg) {
  return clamp(cfg.base + clamp(level, 0, 1) * cfg.specAmp, 0, cfg.maxH);
}

/**
 * 待机呼吸 —— **只在历史彻底空掉之后**用（没在播放 / 刚开播 / 一直静音）。
 *
 * 幅度必须远小于 specAmp（config 里 idleAmp 只有 0.03），否则又回到「假节奏」。
 *
 * @param {object} cell layoutGrid() 的一格
 * @param {number} timeSec 动画时钟（秒）
 * @param {object} cfg { base, idleAmp, maxH }
 * @param {number} phase 每格固定的随机相位（0..1）
 */
export function idleHeight(cell, timeSec, cfg, phase = 0) {
  const rowWave = Math.sin(timeSec * 1.15 - cell.rowNorm * 2.1 + phase * 0.5);
  const colWave = Math.sin(timeSec * 0.83 + cell.colNorm * 2.7 + phase * 0.9);
  const v = 0.5 + 0.5 * rowWave * colWave;
  return clamp(cfg.base + cfg.idleAmp * v, 0, cfg.maxH);
}

/**
 * 频谱瀑布的「历史行」推进：整体向远处平移一行，再把最新一列电平写到最近的一行。
 *
 * 行 0 = 最远 = 最旧，行 rows-1 = 最近 = 最新。于是纵深方向是一条真实的
 * 时间轴（每个样本往远处退一格），新数据永远出现在最靠前、最清楚的位置。
 *
 * @param {Float32Array} history 长度 rows × cols 的历史缓冲（原地修改）
 * @param {Float32Array|number[]} latest 最新一行的列电平（长度 cols）
 * @param {number} cols 列数
 */
export function pushHistoryRow(history, latest, cols) {
  const n = cols | 0;
  if (!history || n <= 0 || history.length <= n) return history;
  history.copyWithin(0, n); // 行 r ← 行 r+1（整体后退一行）
  const base = history.length - n;
  for (let c = 0; c < n; c += 1) history[base + c] = clamp(latest[c] || 0, 0, 1);
  return history;
}

/** 历史整体衰减（暂停后慢慢落回地面）；返回是否还有可见能量 */
export function decayHistory(history, k) {
  let max = 0;
  for (let i = 0; i < history.length; i += 1) {
    const v = history[i] * k;
    history[i] = v;
    if (v > max) max = v;
  }
  return max;
}
