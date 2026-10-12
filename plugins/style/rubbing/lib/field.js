/* ==========================================================================
   rubbing/lib/field.js — 粒子场（纯函数 + 定长类型化数组）
   --------------------------------------------------------------------------
   拓印的粒子是**一万多个**，所以这里没有"粒子对象"这回事：

     · 状态全部放在定长 `Float32Array / Int32Array` 里（SoA），一次分配、
       运行期零分配 —— 每帧 new 一万个小对象的话，GC 会在画面上留下抖动；
     · `step()` 只做算术，不碰 DOM、不读 ctx、不建对象。

   ★ 位置是**时间的纯函数**，不是积分出来的
     老版本用弹簧把粒子吸到笔画上（k=46、drag=3.2 → 时间常数约 2.5s），
     一个字只唱 200~300ms，粒子永远在半路 —— 这是"聚集太慢跟不上节奏"的根因。
     现在每一粒有自己的 `inkAt`（何时起飞）与 `fly`（飞多久）：

       目标点 tx,ty
         ↑ e 从 0 走到 1（easeOutCubic，由 pos 直接算出来）
       灰尘位 = 目标点 + 固定的随机偏移 ox,oy
         ＋ 抖动 jx,jy（湍流 / 指针磁铁 / 暂停时下沉）

     好处是三条：
       1. 单粒落定时间**可证**（≤ fly），永远跟得上节拍；
       2. 拖进度条 / 切句 / 暂停恢复都不会错位（不存在"半路的状态"）；
       3. 每粒时刻错开 → 画面是"一粒一粒填进去"，而不是整块云一起飞。

     抖动 `keep` 系数随 e 衰减（未唱到 1 → 已落定 0.06）：灰尘松、笔画紧，
     所以字一旦填满就是清晰的，低频只让它轻轻起落（±2px），不会糊掉。
   ========================================================================== */

/** 粒子数上下限（设计稿：按面积自适应并 clamp） */
export const MIN_PARTICLES = 4000;
export const MAX_PARTICLES = 16000;

/** performance 档的粒子数除数 */
export const PERF_DIVISOR = 3;

/** 填充档位：0 = 灰尘 / 1 = 飞行中 / 2 = 已落定（= 每粒色的三个批次槽） */
export const LEVEL_DUST = 0;
export const LEVEL_FLY = 1;
export const LEVEL_INK = 2;
export const LEVELS = 3;

/**
 * 档位 → 颗粒半径倍数。
 *
 * ★ 这个数组是"填满"能不能成立的关键，不是手感调参：
 *   粒子数是按**舞台面积**算的（1100×700 → 4968 粒），而一句歌词的笔画面积有
 *   5.7 万像素 —— 每粒 1.85×1.85 只能盖住其中 **30%**，也就是"整句唱完了，
 *   字还是一粒一粒的麻点、灰字透出来七成"，看起来像撒了彩砂，不像填满。
 *   把颗粒本身按面积 ×3.4（半径 ×1.85）之后覆盖率到 ~70%，而 `fillRect`
 *   的调用次数一点没变（这一款最贵的就是调用次数，不是填充面积）。
 *   灰尘保持 1.0：背景那层沙的颗粒感是画面质感，不该一起变粗。
 */
export const GRAIN = [1, 1.25, 1.85];

/**
 * 落定后的一次"砸在纸上"放大（半径倍数），以及它的持续时长。
 * 叠在 GRAIN[LEVEL_INK] 之上 —— 落定的瞬间再涨一点，读起来像"按下去"。
 */
export const LAND_FLASH = 0.45;
export const LAND_FLASH_MS = 240;

/** 物理常量（都在这里，调参不用翻 skin.js） */
export const PHYS = {
  /** 抖动回位刚度（1/s²）：越大灰尘越"贴"在原位 */
  jitterSpring: 26,
  /** 抖动阻尼（1/s） */
  jitterDrag: 4.2,
  /** 未唱到：抖动保留比例 */
  jitterDust: 1,
  /** 已落定：抖动保留比例（保住笔画清晰度，这是可读性的关键参数） */
  jitterInk: 0.06,
  /** 抖动幅度上限（px）：湍流 + 磁铁再猛也不许把场撕开 */
  jitterMax: 110,
  /** 湍流：低频 bass 0..1 → 每秒随机加速度 */
  turbMax: 900,
  /** 暂停时灰尘下沉到地板的速率（1/s，指数趋近） */
  sinkRate: 2.4,
  /** 最大步长（秒）：切后台回来时不能一次积分 3 秒 */
  maxDt: 0.05,
};

/** 一次分配：粒子池。索引 i 在所有数组里指同一个粒子。 */
export function createPool(cap = MAX_PARTICLES) {
  const n = Math.max(1, Math.round(cap));
  const f = () => new Float32Array(n);
  return {
    cap: n,
    /** 有效粒子数（可以小于 cap：降级时只画前 count 个，不重建数组） */
    count: n,
    /** 画出来的位置（每帧由 step() 写） */
    x: f(),
    y: f(),
    /** 抖动量的速度（只喂抖动，不参与"飞到笔画上"） */
    vx: f(),
    vy: f(),
    /** 抖动偏移（相对"基础位置"） */
    jx: f(),
    jy: f(),
    /** 目标点（笔画上的像素坐标） */
    tx: f(),
    ty: f(),
    /** 灰尘位相对目标点的**固定偏移**（换句不重算，沙场的形状是稳定的） */
    ox: f(),
    oy: f(),
    /** 每粒的起飞时刻（ms，歌曲位置口径）与飞行时长（ms） */
    inkAt: f(),
    fly: f(),
    /** 填充进度 0..1（画的时候要用来选批次） */
    ev: f(),
    /** 颜色桶（0..BUCKETS-1）与尺寸（像素半径） */
    c: new Int32Array(n),
    r: f(),
    /** 所属字素组（-1 = 永远只是灰尘） */
    g: new Int16Array(n),
    /** 每粒随机相位，省得所有粒子同步抖（看起来像整体平移） */
    ph: f(),
  };
}

/** 灰尘位偏移：目标点周围一圈"沙场"（横向铺得比纵向开，贴合一行字） */
function seedOrigin(pool, i, rng) {
  const a = rng() * Math.PI * 2;
  const d = 70 + Math.pow(rng(), 1.4) * 230;
  pool.ox[i] = Math.cos(a) * d;
  pool.oy[i] = Math.sin(a) * d * 0.55;
}

/** 用 rng 把粒子撒在给定矩形里 + 定下各自的灰尘位（首次挂载 / 扩池时调用）。 */
export function seedPool(pool, count, rng, rect) {
  const n = Math.min(count, pool.cap);
  for (let i = 0; i < n; i += 1) {
    pool.x[i] = rect.x + rng() * rect.w;
    pool.y[i] = rect.y + rng() * rect.h;
    pool.vx[i] = 0;
    pool.vy[i] = 0;
    pool.jx[i] = 0;
    pool.jy[i] = 0;
    pool.tx[i] = pool.x[i];
    pool.ty[i] = pool.y[i];
    seedOrigin(pool, i, rng);
    pool.c[i] = 0;
    pool.r[i] = 1.1 + rng() * 1.5;
    pool.g[i] = -1;
    pool.inkAt[i] = Infinity;
    pool.fly[i] = 1;
    pool.ev[i] = 0;
    pool.ph[i] = rng() * Math.PI * 2;
  }
  pool.count = n;
  return n;
}

/** 扩池时给新增的粒子撒点（不重建整池，避免已有画面跳一下）。 */
export function seedDust(pool, from, to, rng, rect) {
  for (let i = from; i < Math.min(to, pool.cap); i += 1) {
    pool.x[i] = rect.x + rng() * rect.w;
    pool.y[i] = rect.y + rng() * rect.h;
    pool.vx[i] = 0;
    pool.vy[i] = 0;
    pool.jx[i] = 0;
    pool.jy[i] = 0;
    pool.tx[i] = pool.x[i];
    pool.ty[i] = pool.y[i];
    seedOrigin(pool, i, rng);
    pool.g[i] = -1;
    pool.inkAt[i] = Infinity;
    pool.fly[i] = 1;
    pool.ev[i] = 0;
    pool.r[i] = 0.9 + rng() * 1.3;
    pool.ph[i] = rng() * Math.PI * 2;
  }
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

/** 把池子摊平成"没有字"的状态（空态 / 无歌词：整池退化成沙）。 */
export function clearFill(pool, count) {
  const n = Math.min(count, pool.cap);
  for (let i = 0; i < n; i += 1) {
    pool.inkAt[i] = Infinity;
    pool.ev[i] = 0;
    pool.g[i] = -1;
  }
  return n;
}

/** 切句时给每粒一次随机冲量（"撒沙"）：灰尘会散一下再重新排布。 */
export function burst(pool, count, rng, power = 300) {
  const n = Math.min(count, pool.cap);
  for (let i = 0; i < n; i += 1) {
    const a = rng() * Math.PI * 2;
    const k = 0.4 + rng() * 0.6;
    pool.vx[i] += Math.cos(a) * power * k;
    pool.vy[i] += Math.sin(a) * power * k * 0.7;
  }
  return n;
}

/** 清零抖动：`animations:false` / 减少动效时用，让粒子**正好**落在笔画上。 */
export function restJitter(pool, count) {
  const n = Math.min(count, pool.cap);
  pool.jx.fill(0, 0, n);
  pool.jy.fill(0, 0, n);
  pool.vx.fill(0, 0, n);
  pool.vy.fill(0, 0, n);
  return n;
}

/**
 * 步进（每帧一次）。
 *
 * @param {object} pool
 * @param {number} count
 * @param {number} dt 秒
 * @param {{pos?:number,bass?:number,paused?:boolean,sink?:number,floor?:number,turbulence?:boolean}} opts
 *   pos 是"用于填充的歌曲位置"（skin.js 已经把视觉提前量算进去了）；
 *   sink 0..1 是暂停下沉量（skin.js 用 sinkStep 推）。
 */
export function step(pool, count, dt, opts = {}) {
  const { pos = 0, bass = 0, paused = false, sink = 0, floor = Infinity, turbulence = true } = opts;
  const n = Math.min(count, pool.cap);
  const h = Math.min(Math.max(dt, 0), PHYS.maxDt);
  const sinkT = sink <= 0 ? 0 : sink >= 1 ? 1 : sink;
  const turb = bass > 0 ? bass * PHYS.turbMax * h : 0;
  const damp = Math.exp(-PHYS.jitterDrag * h);
  const k = PHYS.jitterSpring;
  const floorY = Number.isFinite(floor) ? floor : Infinity;
  for (let i = 0; i < n; i += 1) {
    // 1) 填充进度：完全由时间轴决定
    const fly = pool.fly[i] > 1 ? pool.fly[i] : 1;
    let u = (pos - pool.inkAt[i]) / fly;
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    const inv = 1 - u;
    const e = 1 - inv * inv * inv; // easeOutCubic：起步快、落定稳
    pool.ev[i] = e;
    // 2) 抖动（湍流 / 磁铁 / 回位）
    if (paused) {
      pool.vx[i] *= damp;
      pool.vy[i] *= damp;
    } else {
      pool.vx[i] = (pool.vx[i] - pool.jx[i] * k * h) * damp;
      pool.vy[i] = (pool.vy[i] - pool.jy[i] * k * h) * damp;
    }
    if (turbulence && turb > 0) {
      const s = pool.ph[i];
      pool.vx[i] += Math.cos(s * 3.1) * turb * 0.5;
      pool.vy[i] += Math.sin(s * 2.7) * turb * 0.5;
    }
    let jx = pool.jx[i] + pool.vx[i] * h;
    let jy = pool.jy[i] + pool.vy[i] * h;
    if (jx > PHYS.jitterMax) jx = PHYS.jitterMax;
    else if (jx < -PHYS.jitterMax) jx = -PHYS.jitterMax;
    if (jy > PHYS.jitterMax) jy = PHYS.jitterMax;
    else if (jy < -PHYS.jitterMax) jy = -PHYS.jitterMax;
    pool.jx[i] = jx;
    pool.jy[i] = jy;
    // 3) 位置 = 目标点 + 灰尘偏移 × (1 - e) + 抖动 × keep
    //    暂停时灰尘位整体压到地板上（已落定的粒子 e=1，纹丝不动）
    const keep = PHYS.jitterDust + (PHYS.jitterInk - PHYS.jitterDust) * e;
    const oyAbs = pool.ty[i] + pool.oy[i];
    const oyEff = sinkT > 0 && Number.isFinite(floorY) ? oyAbs + sinkT * (floorY - oyAbs) : oyAbs;
    pool.x[i] = pool.tx[i] + pool.ox[i] * inv + jx * keep;
    pool.y[i] = oyEff + (pool.ty[i] - oyEff) * e + jy * keep;
    pool.ph[i] += h * 2.2;
  }
  return n;
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

/** 暂停下沉量：0（在放）→ 1（灰尘全沉到地板），指数趋近，与帧率无关。 */
export function sinkStep(sink, paused, dt, { rate = PHYS.sinkRate } = {}) {
  const cur = Number(sink) || 0;
  const target = paused ? 1 : 0;
  const k = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, Number(dt) || 0));
  const v = cur + (target - cur) * k;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** 落定闪光量 0..1（刚落定的那一瞬放大半像素级，让"填充"看得见）。 */
export function landFlash(pos, inkAt, fly, { ms = LAND_FLASH_MS } = {}) {
  const t = Number(pos) - (Number(inkAt) + Number(fly));
  if (!(t >= 0) || t >= ms) return 0;
  return 1 - t / ms;
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

/** 质心（自检要断言"暂停后灰尘继续下落"）。 */
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

/** 已经"就位"的比例（距目标 < tol 像素）—— 自检用它判断填充完成。 */
export function settledRatio(pool, count, tol = 2.5) {
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

/** 平均填充进度（自检用它断言"粒子在逐粒填进去"）。 */
export function meanFill(pool, count) {
  const n = Math.min(count, pool.cap);
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += pool.ev[i];
  return sum / n;
}

/** 已落定（e ≥ 1）的比例。 */
export function inkedRatio(pool, count) {
  const n = Math.min(count, pool.cap);
  if (n <= 0) return 0;
  let hit = 0;
  for (let i = 0; i < n; i += 1) if (pool.ev[i] >= 1) hit += 1;
  return hit / n;
}

/** performance 档：半分辨率的缩放系数。 */
export function resolutionScale(performanceMode) {
  return performanceMode ? 0.5 : 1;
}

/** 粒子数按面积 × dpr 自适应（clamp 4000~16000，performance 再 ÷3）。 */
export function countForArea(areaPx, dpr, { min = MIN_PARTICLES, max = MAX_PARTICLES, performanceMode = false } = {}) {
  const area = Math.max(0, Number(areaPx) || 0);
  const d = Math.max(1, Math.min(2, Number(dpr) || 1));
  // 密度实测：每 155 逻辑像素² 一个粒子（1100×700 → 约 4970；4K+dpr2 顶到上限）。
  // 比旧版（/200）密一档：现在粒子要负责"把灰字填成彩色"，稀了看不出填充。
  let n = Math.round((area / 155) * d);
  n = Math.max(min, Math.min(max, n));
  // performance 档：粒子数 ÷3（这里**不再**抬回 min —— 要的就是 ÷3）
  if (performanceMode) n = Math.max(500, Math.round(n / PERF_DIVISOR));
  return n;
}

/* --------------------------------------------------------------------------
   帧预算与自适应降级（★ 探针 P5 的答案）
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
