/* ==========================================================================
   rubbing/lib/field.js — 粒子场（纯函数 + 定长类型化数组）
   --------------------------------------------------------------------------
   拓印的粒子是**一万多个**，所以这里没有"粒子对象"这回事：

     · 状态全部放在定长 `Float32Array / Int32Array` 里（SoA），一次分配、
       运行期零分配 —— 每帧 new 一万个小对象的话，GC 会在画面上留下抖动；
     · `step()` 只做算术，不碰 DOM、不读 ctx、不建对象；
     · 物理量：弹簧（飞向目标）、阻尼、湍流（低频）、重力（暂停落地）、
       撒沙（一次冲量）。

   粒子的三种姿态都在同一个循环里：
     · 未唱到 → 目标点是"灰尘位置"（弱吸引 + 慢飘）
     · 已唱到 → 强弹簧拉到字形目标点
     · 暂停   → 重力接管，落到地板上堆积（不是冻结：设计稿明确要求"继续下落"）
   ========================================================================== */

/** 粒子数上下限（设计稿：按面积自适应并 clamp） */
export const MIN_PARTICLES = 3000;
export const MAX_PARTICLES = 14000;

/** performance 档的粒子数除数 */
export const PERF_DIVISOR = 3;

/** 物理常量（都在这里，调参不用翻 skin.js） */
export const PHYS = {
  /** 已唱到：弹簧刚度（1/s²） */
  springLit: 46,
  /** 未唱到：弱吸引（灰尘就位感） */
  springDust: 7,
  /** 速度阻尼（1/s，越大气氛越"稠"） */
  drag: 3.2,
  /** 湍流：低频 bass 0..1 → 每秒随机加速度 */
  turbMax: 900,
  /** 撒沙冲量（flux 触发时给每个粒子一次随机初速度） */
  scatter: 420,
  /** 暂停时的重力（像素/s²） */
  gravity: 420,
  /** 落地反弹衰减 */
  bounce: 0.18,
  /** 最大步长（秒）：切后台回来时不能一次积分 3 秒，否则粒子会"炸开" */
  maxDt: 0.05,
};

/** 一次分配：粒子池。索引 i 在所有数组里指同一个粒子。 */
export function createPool(cap = MAX_PARTICLES) {
  const n = Math.max(1, Math.round(cap));
  return {
    cap: n,
    /** 有效粒子数（可以小于 cap：降级时只画前 count 个，不重建数组） */
    count: n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    /** 目标点（像素坐标） */
    tx: new Float32Array(n),
    ty: new Float32Array(n),
    /** 颜色（0xRRGGBB）与尺寸（像素半径） */
    c: new Int32Array(n),
    r: new Float32Array(n),
    /** 所属字素组（-1 = 永远只是灰尘） */
    g: new Int16Array(n),
    /** 0 = 灰尘 / 1 = 被吸引（不需要精确大小，只用来选弹簧刚度） */
    lit: new Uint8Array(n),
    /** 每粒子随机相位，省得所有粒子同步抖（看起来像整体平移） */
    ph: new Float32Array(n),
  };
}

/** 用 rng 把粒子撒在给定矩形里（切歌/首次挂载时调用）。 */
export function seedPool(pool, count, rng, rect) {
  const n = Math.min(count, pool.cap);
  for (let i = 0; i < n; i += 1) {
    pool.x[i] = rect.x + rng() * rect.w;
    pool.y[i] = rect.y + rng() * rect.h;
    pool.vx[i] = 0;
    pool.vy[i] = 0;
    pool.tx[i] = pool.x[i];
    pool.ty[i] = pool.y[i];
    pool.c[i] = 0xbfa37e;
    pool.r[i] = 1 + rng() * 1.6;
    pool.g[i] = -1;
    pool.lit[i] = 0;
    pool.ph[i] = rng() * Math.PI * 2;
  }
  pool.count = n;
  return n;
}

/**
 * 把目标点写进粒子池（第 k 个粒子 → 第 k 个目标点）。
 * 目标点比粒子少时循环复用；比粒子多时只取前 count 个。
 */
export function assignTargets(pool, count, pts, groupOf, { offset = 0, colors = null } = {}) {
  const n = Math.min(count, pool.cap);
  const pn = pts.length >> 1;
  if (!pn) return 0;
  for (let i = 0; i < n; i += 1) {
    const k = (i + offset) % pn;
    pool.tx[i] = pts[k * 2];
    pool.ty[i] = pts[k * 2 + 1];
    pool.g[i] = groupOf ? groupOf[k] : 0;
    if (colors) pool.c[i] = colors[k];
  }
  return n;
}

/** 把（尚未被吸引的）灰尘粒子撒满整个矩形，作为"未唱到的字"的底层氛围。 */
export function seedDust(pool, from, to, rng, rect) {
  for (let i = from; i < Math.min(to, pool.cap); i += 1) {
    pool.x[i] = rect.x + rng() * rect.w;
    pool.y[i] = rect.y + rng() * rect.h;
    pool.vx[i] = 0;
    pool.vy[i] = 0;
    pool.tx[i] = pool.x[i];
    pool.ty[i] = pool.y[i];
    pool.g[i] = -1;
    pool.lit[i] = 0;
    pool.r[i] = 0.8 + rng() * 1.2;
  }
}

/** 已唱到的粒子组变化时调用：把"该亮但还没被吸引"的粒子切到强弹簧。 */
export function markLit(pool, count, litGroups) {
  const g = Math.max(0, Math.round(litGroups));
  let changed = 0;
  for (let i = 0; i < Math.min(count, pool.cap); i += 1) {
    const want = pool.g[i] >= 0 && pool.g[i] < g ? 1 : 0;
    if (pool.lit[i] !== want) {
      pool.lit[i] = want;
      changed += 1;
    }
  }
  return changed;
}

/**
 * 撒沙：给每个粒子一次随机冲量（依次"散开 → 再聚拢"）。
 * 冲量方向由 rng 定，速度按"离目标的距离"加权（远处的散得更开）。
 */
export function scatter(pool, count, rng, power = PHYS.scatter) {
  const n = Math.min(count, pool.cap);
  for (let i = 0; i < n; i += 1) {
    const a = rng() * Math.PI * 2;
    const k = 0.4 + rng() * 0.6;
    pool.vx[i] += Math.cos(a) * power * k;
    pool.vy[i] += Math.sin(a) * power * k * 0.7;
  }
  return n;
}

/** 步进（每帧一次）。dt 单位：秒；bass 0..1；paused = 暂停（重力接管）。 */
export function step(pool, count, dt, { bass = 0, paused = false, gravity = PHYS.gravity, floor = Infinity, drag = PHYS.drag } = {}) {
  const n = Math.min(count, pool.cap);
  const h = Math.min(Math.max(dt, 0), PHYS.maxDt);
  if (h <= 0) return;
  const damp = Math.max(0, 1 - drag * h);
  const turb = bass * PHYS.turbMax * h;
  for (let i = 0; i < n; i += 1) {
    if (paused) {
      // 暂停：重力 + 落地堆积（速度反向衰减），横向仍然阻尼
      pool.vy[i] += gravity * h;
      pool.vx[i] *= damp;
      pool.vy[i] *= Math.max(0, 1 - 0.6 * h);
      pool.x[i] += pool.vx[i] * h;
      pool.y[i] += pool.vy[i] * h;
      if (pool.y[i] > floor) {
        pool.y[i] = floor;
        pool.vy[i] = -Math.abs(pool.vy[i]) * PHYS.bounce;
        if (Math.abs(pool.vy[i]) < 6) pool.vy[i] = 0;
      }
      continue;
    }
    const k = pool.lit[i] ? PHYS.springLit : PHYS.springDust;
    const ax = (pool.tx[i] - pool.x[i]) * k;
    const ay = (pool.ty[i] - pool.y[i]) * k;
    pool.vx[i] = (pool.vx[i] + ax * h) * damp;
    pool.vy[i] = (pool.vy[i] + ay * h) * damp;
    if (turb > 0) {
      // 相位错开：用粒子自己的 ph 当偏移，避免整体同向漂移
      const s = pool.ph[i];
      pool.vx[i] += Math.cos(s * 3.1) * turb * 0.5;
      pool.vy[i] += Math.sin(s * 2.7) * turb * 0.5;
    }
    pool.x[i] += pool.vx[i] * h;
    pool.y[i] += pool.vy[i] * h;
    pool.ph[i] += h * 2.2;
  }
}

/**
 * 指针磁铁：把半径内的粒子推开（interactive:false 时调用方根本不调它）。
 * 力按 1/d 衰减，避免贴脸时出现 infinity。
 */
export function applyMagnet(pool, count, { x = 0, y = 0, radius = 80, strength = 6000 } = {}) {
  const n = Math.min(count, pool.cap);
  const r2 = radius * radius;
  let hit = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = pool.x[i] - x;
    const dy = pool.y[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 <= 0.0001) continue;
    const d = Math.sqrt(d2);
    const f = (strength * (1 - d / radius)) / d;
    pool.vx[i] += dx * f;
    pool.vy[i] += dy * f;
    hit += 1;
  }
  return hit;
}

/** 频段均值（0..1）：低频给湍流。范围是闭区间 [from, to]。 */
export function avgRange(bands, from, to) {
  if (!bands || !bands.length) return 0;
  const a = Math.max(0, Math.round(from));
  const b = Math.min(bands.length - 1, Math.round(to));
  if (b < a) return 0;
  let sum = 0;
  for (let i = a; i <= b; i += 1) sum += Number(bands[i]) || 0;
  return Math.max(0, Math.min(1, sum / (b - a + 1)));
}

/** 频段峰值（0..1）：高频给颗粒/沙的闪烁。 */
export function maxRange(bands, from, to) {
  if (!bands || !bands.length) return 0;
  const a = Math.max(0, Math.round(from));
  const b = Math.min(bands.length - 1, Math.round(to));
  let m = 0;
  for (let i = a; i <= b; i += 1) m = Math.max(m, Number(bands[i]) || 0);
  return Math.max(0, Math.min(1, m));
}

/** 质心（自检要断言"暂停后粒子继续下落"）。 */
export function centroid(pool, count) {
  const n = Math.min(count, pool.cap);
  if (n <= 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += pool.x[i];
    sy += pool.y[i];
  }
  return { x: sx / n, y: sy / n };
}

/** 已经"就位"的比例（距目标 < tol 像素）—— 自检用它判断聚拢完成。 */
export function settledRatio(pool, count, tol = 3) {
  const n = Math.min(count, pool.cap);
  if (n <= 0) return 0;
  const t2 = tol * tol;
  let hit = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = pool.tx[i] - pool.x[i];
    const dy = pool.ty[i] - pool.y[i];
    if (dx * dx + dy * dy <= t2) hit += 1;
  }
  return hit / n;
}

/** performance 档：半分辨率的缩放系数。 */
export function resolutionScale(performanceMode) {
  return performanceMode ? 0.5 : 1;
}

/** 粒子数按面积 × dpr 自适应（设计稿：clamp 3000~14000，performance 再 ÷3）。 */
export function countForArea(areaPx, dpr, { min = MIN_PARTICLES, max = MAX_PARTICLES, performanceMode = false } = {}) {
  const area = Math.max(0, Number(areaPx) || 0);
  const d = Math.max(1, Math.min(2, Number(dpr) || 1));
  // 密度实测：每 200 逻辑像素² 一个粒子（1100×700 → 约 3850；dpr2 → 7700；
  // 4K 会顶到上限 14000 —— 正好是设计稿给的 clamp 区间）
  let n = Math.round((area / 200) * d);
  n = Math.max(min, Math.min(max, n));
  // performance 档：粒子数 ÷3（这里**不再**抬回 min —— 设计稿要的就是 ÷3）
  if (performanceMode) n = Math.max(500, Math.round(n / PERF_DIVISOR));
  return n;
}

/* --------------------------------------------------------------------------
   帧预算与自适应降级（★ 这是探针 P5 的答案）
   --------------------------------------------------------------------------
   无头/低端机上"每帧要画多少粒子"不能只按面积猜：填率、dpr、GPU 都会变。
   所以皮肤自己量**自己这一帧花了多久**（EMA），超预算就往下退一档：

     lod 0：全量粒子 + 全分辨率
     lod 1：×0.66
     lod 2：×0.45 + 半分辨率
     lod 3：×0.30 + 半分辨率（最低档，仍在动）

   只在**连续两帧**超预算时才退档（偶发一次 GC 不算），并且只在开播后前
   几秒允许退档（之后稳定就不再来回跳）。
   -------------------------------------------------------------------------- */

/** 预算：清单 budgetFps 的 1.35 倍留一点余量（rAF 本身有开销）。 */
export function paintBudgetMs(fps, { slack = 1.35 } = {}) {
  const f = Number(fps) > 0 ? Number(fps) : 45;
  return (1000 / f) * slack;
}

/** 指数滑动平均（alpha 越小越平滑）。prev ≤ 0 视为"还没有样本"。 */
export function ema(prev, sample, alpha = 0.2) {
  const p = Number(prev);
  if (!Number.isFinite(p) || p <= 0) return sample;
  return p * (1 - alpha) + sample * alpha;
}

/** 当前档位对应的粒子比例。 */
export function lodFactor(lod) {
  return [1, 0.66, 0.45, 0.3][Math.max(0, Math.min(3, Math.round(lod)))] ?? 0.3;
}

/** 档位对应的分辨率比例（0/1 全分辨率，2/3 半分辨率）。 */
export function lodResolution(lod) {
  return lod >= 2 ? 0.5 : 1;
}

/**
 * 下一帧该用哪个档位。
 *
 * @param {number} cur 当前档位
 * @param {number} avgMs 自己 paint 的 EMA
 * @param {number} budgetMs 预算
 * @param {number} slowStreak 连续超预算次数
 * @param {number} elapsedMs 开播以来毫秒（超过 8 秒就不再退档，避免来回跳）
 */
export function nextLod(cur, avgMs, budgetMs, slowStreak, elapsedMs, { maxMs = 8000 } = {}) {
  const lod = Math.max(0, Math.min(3, Math.round(cur) || 0));
  if (elapsedMs > maxMs) return lod;
  if (slowStreak < 2) return lod;
  if (avgMs <= budgetMs) return lod;
  return Math.min(3, lod + 1);
}

/** 暂停 6 秒停帧（宿主约定）。 */
export function idleExpired(lastActiveMs, nowMs, stopMs = 6000) {
  return Number(nowMs) - Number(lastActiveMs) >= stopMs;
}

/** 帧率闸门：距离上一帧够久了才画（performance 档用）。 */
export function dueForFrame(lastMs, nowMs, budgetMs) {
  return Number(nowMs) - Number(lastMs) >= Number(budgetMs);
}

/** 时间码（与暗房同口径：mm:ss，超过一小时加 hh:）。 */
export function timecode(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const p = (v) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** 逐字亮度 → 粒子色（暗部更"脏"，亮部更"白"）：返回 0..1 的混白比例。 */
export function litTint(level) {
  const t = Math.max(0, Math.min(1, Number(level) || 0));
  return t * t * (3 - 2 * t); // smoothstep
}
