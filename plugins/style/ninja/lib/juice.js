/* ==========================================================================
   ninja/lib/juice.js — 果汁粒子池 + 切开的两半（SoA + 定长，无 DOM）
   --------------------------------------------------------------------------
   契约 v3 里没有"每帧给我一批粒子"这种东西，所以这一款的动效全部自己算。
   两条纪律来自 rubbing / abyss 的实测教训：

     1. **状态放定长类型化数组（SoA）**，运行期零分配、零 `new`。一刀下去要喷
        40~120 粒果汁，用对象池会立刻变成 GC 抖动。
     2. **绘制分批**：粒子的颜色只取 6 个色桶之一，于是每帧的 `fillStyle`
        最多 6 次（外加每桶一次 `globalAlpha`），不是 N 次。颜色的明暗由生命
        阶段决定，不由每个粒子自己拼字符串。

   两半（半颗水果）直接进**刚体**积分：切开时沿刀口的法线给一个相反的冲量，
   之后就是重力 + 自转。位置只依赖 dt 累积 —— 所以"暂停"必须真的停帧，
   否则切开的两半会在暂停期间自己落地（`playing:false` 时 skin.js 会停帧）。
   ========================================================================== */

export const TAU = Math.PI * 2;

/** 物理常数：全部"每秒"口径，dt 用秒 */
export const PHYS = Object.freeze({
  gravity: 1750, // 果汁
  drag: 0.55, // 空气阻力（指数衰减系数）
  floorBounce: 0.24, // 落到案板上的一次弹跳保留多少速度
  floorFriction: 0.62,
  halfGravity: 2050,
  halfDrag: 0.22,
  halfSpinDamp: 0.85,
  cutImpulse: 210, // 切开时两半沿刀口法线分离的初速（px/s）
  cutSpin: 7.5, // 两半的自转（rad/s）
});

/** 色桶数：果汁的色相档（绘制时每个桶一次 fillStyle） */
export const BUCKETS = 6;

function clampNum(v, a, b) {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return n < a ? a : n > b ? b : n;
}

/* --------------------------------------------------------------------------
   果汁
   -------------------------------------------------------------------------- */

export function createJuicePool(cap = 1200) {
  const c = Math.max(64, Math.round(Number(cap) || 1200));
  return {
    cap: c,
    n: 0, // 存活数量（step 里做 swap-remove 压实，永远是 [0,n)）
    x: new Float32Array(c),
    y: new Float32Array(c),
    vx: new Float32Array(c),
    vy: new Float32Array(c),
    r: new Float32Array(c),
    life: new Float32Array(c), // 剩余寿命（秒）
    ttl: new Float32Array(c),
    bucket: new Uint8Array(c),
  };
}

export function clearJuice(pool) {
  if (pool) pool.n = 0;
  return 0;
}

/**
 * 喷一次果汁。
 *
 * `dirX/dirY` 是主方向（切口的法线：两半朝两边飞，果汁也顺着两边洒），
 * `spread` 是扇形张开（弧度）。方向本身再叠一点确定性随机 ——
 * 完全不随机看起来像喷泉，随机太大看起来像爆炸。
 *
 * @returns {number} 真正加进去的粒数（池满就不再塞，不是覆盖旧粒子）
 */
export function splat(pool, opts = {}) {
  if (!pool) return 0;
  const rand = typeof opts.rand === "function" ? opts.rand : Math.random;
  const want = Math.max(1, Math.round(Number(opts.n) || 20));
  const x = Number(opts.x) || 0;
  const y = Number(opts.y) || 0;
  const dirX = Number(opts.dirX);
  const dirY = Number(opts.dirY);
  const hasDir = Number.isFinite(dirX) || Number.isFinite(dirY);
  const base = Math.atan2(hasDir ? dirY || 0 : 1, hasDir ? dirX || 0 : 0);
  const spread = Number.isFinite(opts.spread) ? Number(opts.spread) : 1.1;
  const speed = Number.isFinite(opts.speed) ? Number(opts.speed) : 260;
  const speedVar = Number.isFinite(opts.speedVar) ? Number(opts.speedVar) : 0.55;
  const rMin = Number.isFinite(opts.rMin) ? Number(opts.rMin) : 1.1;
  const rMax = Number.isFinite(opts.rMax) ? Number(opts.rMax) : 3.4;
  const ttl = Number.isFinite(opts.ttl) ? Number(opts.ttl) : 0.95;
  const ttlVar = Number.isFinite(opts.ttlVar) ? Number(opts.ttlVar) : 0.5;
  const buckets = Array.isArray(opts.buckets) && opts.buckets.length ? opts.buckets : [0];
  let added = 0;
  for (let i = 0; i < want; i += 1) {
    if (pool.n >= pool.cap) break;
    const j = pool.n;
    pool.n += 1;
    added += 1;
    const a = base + (rand() - 0.5) * spread + (rand() - 0.5) * 0.22;
    const sp = speed * (1 - speedVar + rand() * speedVar * 2);
    pool.x[j] = x + (rand() - 0.5) * 4;
    pool.y[j] = y + (rand() - 0.5) * 4;
    pool.vx[j] = Math.cos(a) * sp;
    pool.vy[j] = Math.sin(a) * sp - 40;
    pool.r[j] = rMin + rand() * (rMax - rMin);
    pool.life[j] = ttl * (1 - ttlVar + rand() * ttlVar * 2);
    pool.ttl[j] = pool.life[j];
    pool.bucket[j] = buckets[(rand() * buckets.length) | 0] % BUCKETS;
  }
  return added;
}

/**
 * 推进一步（dt 用秒）。dead 的粒子用 swap-remove 压实 —— 池子里永远是紧的。
 * @returns {number} 步进后的存活数量
 */
export function stepJuice(pool, dtSec, opts = {}) {
  if (!pool || pool.n <= 0) return 0;
  const dt = clampNum(dtSec, 0, 0.064); // 掉帧时不许一次跳 300ms（两半会瞬移出屏）
  const g = Number.isFinite(opts.gravity) ? opts.gravity : PHYS.gravity;
  const drag = Number.isFinite(opts.drag) ? opts.drag : PHYS.drag;
  const floor = Number.isFinite(opts.floor) ? opts.floor : Number.POSITIVE_INFINITY;
  const bounce = Number.isFinite(opts.bounce) ? opts.bounce : PHYS.floorBounce;
  const friction = Number.isFinite(opts.friction) ? opts.friction : PHYS.floorFriction;
  const damp = 1 / (1 + Math.max(0, drag) * dt);
  let n = pool.n;
  for (let i = 0; i < n; i += 1) {
    pool.life[i] -= dt;
    if (pool.life[i] <= 0) {
      // swap-remove：把最后一个搬过来，再退一格重看
      n -= 1;
      pool.x[i] = pool.x[n];
      pool.y[i] = pool.y[n];
      pool.vx[i] = pool.vx[n];
      pool.vy[i] = pool.vy[n];
      pool.r[i] = pool.r[n];
      pool.life[i] = pool.life[n];
      pool.ttl[i] = pool.ttl[n];
      pool.bucket[i] = pool.bucket[n];
      i -= 1;
      continue;
    }
    pool.vy[i] += g * dt;
    pool.vx[i] *= damp;
    pool.vy[i] *= damp;
    pool.x[i] += pool.vx[i] * dt;
    pool.y[i] += pool.vy[i] * dt;
    if (pool.y[i] > floor) {
      pool.y[i] = floor;
      pool.vy[i] = -Math.abs(pool.vy[i]) * bounce;
      pool.vx[i] *= friction;
      // 落在案板上之后寿命掉得快一点（果汁会干）
      pool.life[i] = Math.min(pool.life[i], 0.38);
    }
  }
  pool.n = n;
  return n;
}

/* --------------------------------------------------------------------------
   切开的两半（刚体）
   -------------------------------------------------------------------------- */

export function createHalfPool(cap = 48) {
  const c = Math.max(8, Math.round(Number(cap) || 48));
  return {
    cap: c,
    n: 0,
    x: new Float32Array(c),
    y: new Float32Array(c),
    vx: new Float32Array(c),
    vy: new Float32Array(c),
    rot: new Float32Array(c),
    av: new Float32Array(c),
    rx: new Float32Array(c),
    ry: new Float32Array(c),
    born: new Float64Array(c), // 切开时刻（歌曲位置，毫秒）
    kind: new Uint8Array(c),
    side: new Int8Array(c), // -1 / +1
  };
}

export function clearHalves(pool) {
  if (pool) pool.n = 0;
  return 0;
}

/**
 * 一个水果切开 → 两半。
 *
 * `cutAngle` 是刀口方向（局部弧度）。两半沿**刀口法线**朝相反方向飞
 * （法线 = (sinθ, -cosθ)），初速由 `speed` 与 PHYS.cutImpulse 共同决定；
 * 自转方向也相反，看起来才像被一刀劈开。
 * 池满时覆盖最旧的那一半（宁可丢一个旧的两半，也不能让新的一刀看不见）。
 */
export function cutHalves(pool, opts = {}) {
  if (!pool) return 0;
  const x = Number(opts.x) || 0;
  const y = Number(opts.y) || 0;
  const rx = Math.max(2, Number(opts.rx) || 8);
  const ry = Math.max(2, Number(opts.ry) || 8);
  const cutAngle = Number(opts.cutAngle) || 0;
  const speed = Number.isFinite(opts.speed) ? opts.speed : PHYS.cutImpulse;
  const spin = Number.isFinite(opts.spin) ? opts.spin : PHYS.cutSpin;
  const born = Number(opts.born) || 0;
  const kind = Math.max(0, Math.round(Number(opts.kind) || 0));
  const nx = Math.sin(cutAngle);
  const ny = -Math.cos(cutAngle);
  let added = 0;
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? -1 : 1;
    if (pool.n >= pool.cap) {
      // 覆盖最旧的
      let oldest = 0;
      for (let i = 1; i < pool.n; i += 1) if (pool.born[i] < pool.born[oldest]) oldest = i;
      fill(oldest, side);
      continue;
    }
    fill(pool.n, side);
    pool.n += 1;
    added += 1;
  }
  return added;

  function fill(j, sd) {
    const side = sd < 0 ? -1 : 1;
    pool.x[j] = x + nx * side * rx * 0.08;
    pool.y[j] = y + ny * side * ry * 0.08;
    pool.vx[j] = nx * side * speed + (opts.vx ? Number(opts.vx) * 0.4 : 0);
    pool.vy[j] = ny * side * speed - 30;
    pool.rot[j] = cutAngle;
    pool.av[j] = spin * side * (0.7 + 0.6 * ((kind % 3) / 3));
    pool.rx[j] = rx;
    pool.ry[j] = ry;
    pool.born[j] = born;
    pool.kind[j] = kind;
    pool.side[j] = side;
  }
}

/**
 * 两半推进一步。到期的（活过 `lifeMs` 或掉出 stage 底部太远）swap-remove。
 * @returns {number} 步进后的存活数量
 */
export function stepHalves(pool, dtSec, opts = {}) {
  if (!pool || pool.n <= 0) return 0;
  const dt = clampNum(dtSec, 0, 0.064);
  const g = Number.isFinite(opts.gravity) ? opts.gravity : PHYS.halfGravity;
  const drag = Number.isFinite(opts.drag) ? opts.drag : PHYS.halfDrag;
  const floor = Number.isFinite(opts.floor) ? opts.floor : Number.POSITIVE_INFINITY;
  const bounce = Number.isFinite(opts.bounce) ? opts.bounce : 0.18;
  const spinDamp = Number.isFinite(opts.spinDamp) ? opts.spinDamp : PHYS.halfSpinDamp;
  const lifeMs = Number.isFinite(opts.lifeMs) ? opts.lifeMs : 1900;
  const now = Number(opts.now) || 0;
  const damp = 1 / (1 + Math.max(0, drag) * dt);
  let n = pool.n;
  for (let i = 0; i < n; i += 1) {
    const aged = now - pool.born[i] > lifeMs;
    if (aged || pool.y[i] > floor + 260) {
      n -= 1;
      copy(i, n);
      i -= 1;
      continue;
    }
    pool.vy[i] += g * dt;
    pool.vx[i] *= damp;
    pool.vy[i] *= damp;
    pool.x[i] += pool.vx[i] * dt;
    pool.y[i] += pool.vy[i] * dt;
    pool.rot[i] += pool.av[i] * dt;
    pool.av[i] *= 1 / (1 + Math.max(0, spinDamp) * dt * 0.35);
    if (pool.y[i] > floor) {
      pool.y[i] = floor;
      pool.vy[i] = -Math.abs(pool.vy[i]) * bounce;
      pool.vx[i] *= 0.72;
    }
  }
  pool.n = n;
  return n;

  function copy(to, from) {
    pool.x[to] = pool.x[from];
    pool.y[to] = pool.y[from];
    pool.vx[to] = pool.vx[from];
    pool.vy[to] = pool.vy[from];
    pool.rot[to] = pool.rot[from];
    pool.av[to] = pool.av[from];
    pool.rx[to] = pool.rx[from];
    pool.ry[to] = pool.ry[from];
    pool.born[to] = pool.born[from];
    pool.kind[to] = pool.kind[from];
    pool.side[to] = pool.side[from];
  }
}

/* --------------------------------------------------------------------------
   读数（自检与 HUD 用）
   -------------------------------------------------------------------------- */

/** 果汁的"重心"：向下的那一坨落在哪 —— 自检用它证明果汁真的在往下掉 */
export function juiceCentroid(pool) {
  if (!pool || pool.n <= 0) return { x: 0, y: 0, n: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < pool.n; i += 1) {
    sx += pool.x[i];
    sy += pool.y[i];
  }
  return { x: sx / pool.n, y: sy / pool.n, n: pool.n };
}

/** 两半的分离度：一对两半之间的距离之和（自检用"真的裂开了"） */
export function halvesSpread(pool) {
  if (!pool || pool.n < 2) return 0;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < pool.n; i += 2) {
    const dx = pool.x[i] - pool.x[i + 1];
    const dy = pool.y[i] - pool.y[i + 1];
    sum += Math.sqrt(dx * dx + dy * dy);
    pairs += 1;
  }
  return pairs ? sum / pairs : 0;
}
