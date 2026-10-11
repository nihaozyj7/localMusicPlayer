/* ==========================================================================
   film.js — 暗房的「胶片与信号」逻辑（**纯函数，无 DOM**）
   --------------------------------------------------------------------------
   这一份管三件事，全都是可测的纯计算：

     1. 频谱 → 三个视觉量：低频（光晕呼吸）、高频（颗粒浓度）、通量（halation 脉冲）；
     2. 帧预算与停帧：smooth / performance 两档、暂停 6 秒后停帧（宿主约定，见 docs/37）；
     3. 零碎但容易写错的小工具：时间码、CSS url() 转义、量化。

   与 color.js 一样：**不 import 本包其它模块**（相对 import 会丢 /skins 的 token）。
   ========================================================================== */

/** 夹到 [lo, hi] */
export function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

const LOW_RANGE = [0, 12];
const MID_RANGE = [32, 96];
const HIGH_RANGE = [96, 128];

/**
 * 128 段对数全谱 → 低频 / 中频 / 高频均值 + 总能量 + 谱质心。
 *
 * 分段与 magic-circle 的取法一致（低频 0..11、中频 32..95、高频 96..127），
 * 这样"同一段音乐在两款样式里看起来是同一个东西"。
 *
 * @param {Float32Array|number[]|null} bands
 */
export function bandSummary(bands) {
  const n = bands && bands.length ? bands.length : 0;
  if (!n) return { low: 0, mid: 0, high: 0, total: 0, centroid: 0 };

  const seg = (a, b) => {
    const s = Math.max(0, a);
    const e = Math.min(n, b);
    if (e <= s) return 0;
    let sum = 0;
    for (let i = s; i < e; i += 1) sum += Number(bands[i]) || 0;
    return sum / (e - s);
  };

  let wsum = 0;
  let isum = 0;
  for (let i = 0; i < n; i += 1) {
    const v = Number(bands[i]) || 0;
    wsum += v;
    isum += v * i;
  }

  return {
    low: seg(LOW_RANGE[0], LOW_RANGE[1]),
    mid: seg(MID_RANGE[0], MID_RANGE[1]),
    high: seg(HIGH_RANGE[0], HIGH_RANGE[1]),
    total: wsum / n,
    // 归一化到 0..1：0 = 能量全在低频，1 = 全在高频
    centroid: wsum > 0 && n > 1 ? isum / wsum / (n - 1) : 0,
  };
}

/**
 * 谱通量（flux）：只累加**正向**变化，再按段数归一。
 *
 * 这是"打击检测"的标准做法：能量掉下去不算事件，涨上去才算。
 * 长度不一致（换过段数 / 第一帧）时返回 0 —— 不制造假事件。
 */
export function fluxOf(prev, next) {
  if (!next || !next.length) return 0;
  if (!prev || prev.length !== next.length) return 0;
  let sum = 0;
  for (let i = 0; i < next.length; i += 1) {
    const d = (Number(next[i]) || 0) - (Number(prev[i]) || 0);
    if (d > 0) sum += d;
  }
  return sum / next.length;
}

/**
 * 滑动窗口统计（均值 / 标准差 / 自适应阈值）。
 *
 * 环形缓冲 + Float32Array：运行期不分配对象（对齐 magic-circle 的性能约定）。
 * 阈值取 mean + k·std —— 自适应，不需要为不同音量的歌各调一个常数。
 */
export function createFluxWindow(size = 48) {
  const cap = Math.max(4, Math.floor(Number(size) || 48));
  const buf = new Float32Array(cap);
  let count = 0;
  let write = 0;

  const mean = () => {
    if (!count) return 0;
    let s = 0;
    for (let i = 0; i < count; i += 1) s += buf[i];
    return s / count;
  };

  const std = () => {
    if (count < 2) return 0;
    const m = mean();
    let s = 0;
    for (let i = 0; i < count; i += 1) {
      const d = buf[i] - m;
      s += d * d;
    }
    return Math.sqrt(s / count);
  };

  return {
    push(v) {
      buf[write] = Number(v) || 0;
      write = (write + 1) % cap;
      if (count < cap) count += 1;
    },
    mean,
    std,
    threshold: (k = 1.6) => mean() + k * std(),
    get count() {
      return count;
    },
    get capacity() {
      return cap;
    },
  };
}

/**
 * 这一帧算不算一次"打击"。
 *
 * 三道闸：绝对下限（静音时的抖动不算）、自适应阈值、冷却（一次鼓点只认一次）。
 *
 * @param {{flux:number, threshold:number, lastOnsetAt:number, now:number,
 *          cooldownMs?:number, minFlux?:number}} o
 */
export function shouldOnset(o) {
  const flux = Number(o?.flux);
  if (!Number.isFinite(flux)) return false;
  if (flux < (Number(o?.minFlux) || 0.004)) return false;
  if (flux < Number(o?.threshold)) return false;
  if (Number(o?.now) - Number(o?.lastOnsetAt) < (Number(o?.cooldownMs) || 240)) return false;
  return true;
}

/**
 * 指数逼近（帧率无关的平滑）。
 *
 * 用 tau（时间常数，ms）而不是每帧固定比例：否则 30fps 档和 144fps 档
 * 的观感会不一样。tau 越小跟得越紧。
 */
export function approach(prev, target, dtMs, tauMs) {
  const p = Number(prev) || 0;
  const t = Number(target) || 0;
  const tau = Number(tauMs) || 0;
  if (!(tau > 0)) return t;
  const k = 1 - Math.exp(-Math.max(0, Number(dtMs) || 0) / tau);
  return p + (t - p) * k;
}

/** 单帧 dt 钳制：切后台回来 / 断点调试后不让物理一步跳掉 */
export function clampDt(dt, maxMs = 50) {
  return clamp(dt, 0, maxMs);
}

/**
 * 帧预算（ms）。返回 0 = 不限帧。
 *
 * 与 docs/37 的约定一致：宿主只给"意图"（performanceMode），具体帧率由样式决定。
 * 这里 smooth 不限帧（交 rAF），performance 按清单 budgetFps 跑，暂停时更省。
 */
export function frameBudgetMs(mode, playing, budgetFps = 30, idleFps = 20) {
  if (mode !== "performance") return 0;
  const fps = playing ? budgetFps : Math.min(budgetFps, idleFps);
  return fps > 0 ? 1000 / fps - 1 : 0;
}

/** 暂停后是否该停帧（宿主约定：6 秒；两个帧率档都生效） */
export function idleExpired(now, lastActiveAt, idleMs = 6000) {
  return Number(now) - Number(lastActiveAt) >= idleMs;
}

/** 毫秒 → `MM:SS`（超过 60 分钟就继续累加，不做小时进位） */
export function timecode(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 把 URL 安全地写进 CSS `url()`。
 *
 * 封面是 data URL（可达数百 KB）或 `/online/cover?...`，两者都含 `; = + / ? &`，
 * 这些在双引号里都合法；真正要挡的是引号、反斜杠与换行（会让整条声明失效）。
 */
export function cssUrl(url) {
  const s = String(url ?? "");
  if (!s) return "none";
  const safe = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, "");
  return `url("${safe}")`;
}

/** 量化到 steps 档（0..1）：逐字点亮只在这些档位上写 DOM，其余交给 CSS 过渡 */
export function quantize(v, steps = 8) {
  const n = Math.max(1, Math.floor(Number(steps) || 8));
  return Math.round(clamp(v, 0, 1) * n) / n;
}

/** 四舍五入到 3 位小数的字符串（写 CSS 变量用，避免超长浮点串每次都不相等） */
export function fmt3(v) {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 0).toFixed(3);
}
