/* ==========================================================================
   ninja/lib/util.js — 「水果忍者」的纯函数工具箱（无 DOM、无 canvas、无 ctx）
   --------------------------------------------------------------------------
   这里只有**能被单测直接算出来**的东西：数值夹取、缓动、确定性随机、频谱切片、
   时间码、帧预算与自适应降级状态机、空闲判定。

   ★ 本包 lib/ 之间**不许互相 import**：宿主把样式包托管在同源路由
     `/skins/<id>/<file>?t=<token>` 上，而 ES 模块解析相对说明符会丢掉查询串，
     lib → lib 的静态 import 会去请求没有 token 的 URL（会二次加载、还可能 403）。
     所以这里的东西要么独立成文件、要么由 skin.js 加载后当参数注入。
   ========================================================================== */

export const TAU = Math.PI * 2;

/** 数值夹取（NaN 一律退到下界；±Infinity 按正常夹取处理，不能当成 NaN 丢掉） */
export function clamp(v, a, b) {
  const n = Number(v);
  if (Number.isNaN(n)) return a;
  return n < a ? a : n > b ? b : n;
}

export function clamp01(v) {
  return clamp(v, 0, 1);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 抛物线的"到顶点还剩多少"曲线：1-(1-q)² —— 到顶点时速度为 0（正是抛物线的形状） */
export function arcRise(q) {
  const k = 1 - clamp01(q);
  return 1 - k * k;
}

export function easeOutCubic(t) {
  const k = 1 - clamp01(t);
  return 1 - k * k * k;
}

export function easeOutQuad(t) {
  const k = 1 - clamp01(t);
  return 1 - k * k;
}

/** FNV-1a 32 位：字符串 → 稳定种子（同样的输入永远同样的随机流） */
export function hashSeed(s) {
  let h = 2166136261;
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32：小而稳的确定性随机（画面里凡是"随机"都必须走它，不许用 Math.random） */
export function mulberry32(seed) {
  let a = Number(seed) >>> 0 || 1;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 频段均值（128 段对数全谱的切片） */
export function avgRange(bands, from, to) {
  if (!bands || !bands.length) return 0;
  const a = Math.max(0, Math.min(bands.length, Math.floor(from)));
  const b = Math.max(a + 1, Math.min(bands.length, Math.floor(to)));
  let sum = 0;
  for (let i = a; i < b; i += 1) sum += Number(bands[i]) || 0;
  return sum / (b - a);
}

export function maxRange(bands, from, to) {
  if (!bands || !bands.length) return 0;
  const a = Math.max(0, Math.min(bands.length, Math.floor(from)));
  const b = Math.max(a + 1, Math.min(bands.length, Math.floor(to)));
  let m = 0;
  for (let i = a; i < b; i += 1) m = Math.max(m, Number(bands[i]) || 0);
  return m;
}

/** 频谱通量（只取正向差分）：切水果的"手感"由它驱动 —— 详见 skin.js */
export function fluxOf(prev, next) {
  if (!next || !next.length) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < next.length; i += 1) {
    const a = prev && Number.isFinite(prev[i]) ? prev[i] : 0;
    const d = (Number(next[i]) || 0) - a;
    if (d > 0) {
      sum += d;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

/** mm:ss（负数与 NaN 都归零；**向下取整**：59.99 秒显示 00:59，不是 01:00） */
export function timecode(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 指数滑动平均（-1 表示"还没有样本"） */
export function ema(prev, sample, alpha = 0.2) {
  const a = clamp01(alpha);
  if (!Number.isFinite(prev) || prev < 0) return Number(sample) || 0;
  return prev + ((Number(sample) || 0) - prev) * a;
}

/** 一帧的绘制预算（留 35% 余量给合成与合成器） */
export function paintBudgetMs(fps, { slack = 1.35 } = {}) {
  const f = Number(fps) > 0 ? Number(fps) : 45;
  return (1000 / f) * slack;
}

/** 帧闸门：performance 档按清单 budgetFps 限帧；暂停后降到 idleFps（省电但仍会落果汁） */
export function frameBudgetMs(performanceMode, playing, budgetFps = 45, idleFps = 24) {
  if (performanceMode) return 1000 / (Number(budgetFps) > 0 ? Number(budgetFps) : 45);
  return playing ? 0 : 1000 / (Number(idleFps) > 0 ? idleFps : 24);
}

/** 自适应降级的档位系数（0 最好；越小越省） */
export const LOD_FACTOR = [1, 0.66, 0.45, 0.3];

export function lodFactor(lod) {
  const i = Math.max(0, Math.min(LOD_FACTOR.length - 1, Math.round(Number(lod) || 0)));
  return LOD_FACTOR[i];
}

/** 后两档同时把背板分辨率降下来（画布重设 = 一次清屏，所以档位必须迟滞） */
export function lodResolution(lod) {
  const i = Math.max(0, Math.round(Number(lod) || 0));
  return i >= 2 ? 0.5 : 1;
}

/**
 * 自适应降级的下一步。
 * 只有**连续两帧**超预算才退一档，并且 8 秒后不再退（后台负载/一次性抖动
 * 不该把画面永久降级 —— 见 rubbing 与 abyss 的同款教训）。
 */
export function nextLod(cur, avgMs, budgetMs, slowStreak, elapsedMs, { maxMs = 8000 } = {}) {
  const c = Math.max(0, Math.min(LOD_FACTOR.length - 1, Math.round(Number(cur) || 0)));
  if (!(budgetMs > 0)) return c;
  const elapsed = Number(elapsedMs) || 0;
  if (avgMs > budgetMs && slowStreak >= 2 && elapsed < maxMs) {
    return Math.min(LOD_FACTOR.length - 1, c + 1);
  }
  // 回到预算内就回一档（超预算时回档没有意义；也不做"快就狂升"，避免来回跳）
  if (avgMs > 0 && avgMs < budgetMs * 0.55 && c > 0) return c - 1;
  return c;
}

/** 暂停多久之后彻底停帧（宿主约定 6 秒，见 docs/37） */
export function idleExpired(lastActiveMs, nowMs, stopMs = 6000) {
  return Number(nowMs) - Number(lastActiveMs) > (Number(stopMs) || 6000);
}

/** 帧闸门：还没到预算就先不画 */
export function dueForFrame(lastMs, nowMs, budgetMs) {
  if (!(budgetMs > 0)) return true;
  return Number(nowMs) - Number(lastMs) >= budgetMs - 1.5;
}

/** 数出"已经点亮的字素个数"（starts 单调不减） */
export function litCount(starts, pos) {
  if (!starts || !starts.length) return 0;
  let n = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (Number(starts[i]) <= pos) n += 1;
    else break;
  }
  return n;
}

/** 逐字填充进度，量化到 steps 档（静止的字素不产生任何写入） */
export function fillProgress(startAt, pos, durMs, steps = 32) {
  const dur = Number(durMs) > 0 ? Number(durMs) : 1;
  const q = clamp01((Number(pos) - Number(startAt)) / dur);
  return Math.round(q * steps) / steps;
}

/** 千分位（分数读数用） */
export function group3(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
