/* ==========================================================================
   深渊 abyss · lib/water.js —— 纯逻辑（不碰 DOM、不碰 GL）
   --------------------------------------------------------------------------
   这一款的所有"决定"都在这里，全部是纯函数，可以直接 `node --test`：
     · 频谱 → 泵浦 / 湍流 / 泡沫（**相对量**：宿主响度补偿之后音量是未知数）
     · 封面 64×64 → 密度场像素（水的"颜料"）
     · 位置 → 下潜深度读数
     · 舞台尺寸 + dpr + 档位 → 流场的实际分辨率
     · 帧耗时 → 自适应降级档位
     · 泵浦相位（进度补丁 4Hz，直接当相位用会抖）
     · 字形遮罩的绘制计划（文本节点 → 遮罩坐标）
     · 换歌涌浪的时间包络
   ========================================================================== */

/** 宿主给的是 128 段对数频带 */
export const BANDS = 128;
/** 泵浦：低频（涌浪把整面水抬起来） */
export const LOW = { from: 0, to: 8 };
/** 湍流：中频（域扭曲强度） */
export const MID = { from: 32, to: 96 };
/** 泡沫：高频（表面颗粒） */
export const HIGH = { from: 96, to: 128 };

/** 流场档位（相对舞台像素的比例） */
export const TIERS = { full: 1, half: 0.5, third: 1 / 3 };
export const TIER_ORDER = ["full", "half", "third"];

/** 一套"自动驾驶"的阈值：超过 33ms 降一档，连续三个窗口低于 8ms 升一档 */
export const ADAPT = { slowMs: 33, fastMs: 8, upgradeStreak: 3, windowFrames: 30 };

/** 平滑系数（attack 快、release 慢：低频涌上来要立刻看见，退下去要慢慢落） */
export const ENV = { attack: 0.55, release: 0.12 };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const round = (v, n = 2) => {
  const p = 10 ** n;
  return Math.round(v * p) / p;
};

/** 归一化十六进制颜色（容错：`#abc` / `abcdef` / 带 alpha 的都吃） */
export function normHex(v, fallback) {
  const s = String(v == null ? "" : v).trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (!m) return fallback;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return "#" + h.slice(0, 6);
}

/** 十六进制 → [r,g,b]（0..255） */
export function hexToRgb(hex, fallback = [0, 0, 0]) {
  const h = normHex(hex, null);
  if (!h) return fallback.slice();
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function rgba(hex, a, fallback) {
  const [r, g, b] = hexToRgb(hex, fallback);
  return `rgba(${r},${g},${b},${round(clamp01(a), 3)})`;
}

/** 线性混合两个 [r,g,b] */
export function mixRgb(a, b, t) {
  const k = clamp01(t);
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}

/** 数组里的分段平均（越界自动夹住；空数组 → 0） */
export function bandAvg(bands, from, to) {
  if (!bands || !bands.length) return 0;
  const a = clamp(Math.floor(from), 0, bands.length - 1);
  const b = clamp(Math.ceil(to) - 1, a, bands.length - 1);
  let s = 0;
  let n = 0;
  for (let i = a; i <= b; i += 1) {
    const v = Number(bands[i]);
    if (Number.isFinite(v)) {
      s += v;
      n += 1;
    }
  }
  return n ? s / n : 0;
}

/**
 * 频谱 → 泵浦标量。
 * 频谱是**音量后**的口径（真机探针里音量被压到 0.04），所以这里全部用相对量：
 * 每个量都先除以"这一段自己的近期峰值"，得到 0..1 的"此刻有多涌"。
 * 传 prev 进来做 attack/release 平滑；返回值同时给出原始值，方便自检断言。
 */
export function pumpOf(bands, prev, opts = {}) {
  const atk = Number.isFinite(opts.attack) ? opts.attack : ENV.attack;
  const rel = Number.isFinite(opts.release) ? opts.release : ENV.release;
  const low = bandAvg(bands, LOW.from, LOW.to);
  const mid = bandAvg(bands, MID.from, MID.to);
  const high = bandAvg(bands, HIGH.from, HIGH.to);
  const p = prev || { lowPeak: 1e-4, midPeak: 1e-4, highPeak: 1e-4, lift: 0, turb: 0, foam: 0, energy: 0 };
  // 峰值缓慢衰减：几十秒不换歌也不会把标量"锁"在历史最高点
  const decay = Number.isFinite(opts.peakDecay) ? opts.peakDecay : 0.995;
  const lowPeak = Math.max(low, p.lowPeak * decay, 1e-4);
  const midPeak = Math.max(mid, p.midPeak * decay, 1e-4);
  const highPeak = Math.max(high, p.highPeak * decay, 1e-4);
  const rawLift = clamp01(low / lowPeak);
  const rawTurb = clamp01(mid / midPeak);
  const rawFoam = clamp01(high / highPeak);
  const ease = (oldV, newV) => oldV + (newV - oldV) * (newV > oldV ? atk : rel);
  const lift = ease(Number(p.lift) || 0, rawLift);
  const turb = ease(Number(p.turb) || 0, rawTurb);
  const foam = ease(Number(p.foam) || 0, rawFoam);
  const energy = clamp01((low + mid + high) / 3 / Math.max(lowPeak, midPeak, highPeak));
  return { lowPeak, midPeak, highPeak, lift, turb, foam, energy, raw: { low, mid, high } };
}

/**
 * 封面 64×64 RGBA → 256×256 密度场（双线性放大 + 亮度→密度 + 一层柔和的水波偏移）
 *
 * @param {Uint8Array} src
 * @param {number} [srcSize]
 * @param {number} [dstSize]
 */
export function densityFromCover(src, srcSize = 64, dstSize = 256) {
  const out = new Uint8Array(dstSize * dstSize * 4);
  if (!src || src.length < srcSize * srcSize * 4) return out;
  const scale = srcSize / dstSize;
  for (let y = 0; y < dstSize; y += 1) {
    for (let x = 0; x < dstSize; x += 1) {
      const sx = (x + 0.5) * scale - 0.5;
      const sy = (y + 0.5) * scale - 0.5;
      const x0 = clamp(Math.floor(sx), 0, srcSize - 1);
      const y0 = clamp(Math.floor(sy), 0, srcSize - 1);
      const x1 = clamp(x0 + 1, 0, srcSize - 1);
      const y1 = clamp(y0 + 1, 0, srcSize - 1);
      const fx = clamp01(sx - x0);
      const fy = clamp01(sy - y0);
      const o = (y * dstSize + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const p00 = src[(y0 * srcSize + x0) * 4 + c];
        const p10 = src[(y0 * srcSize + x1) * 4 + c];
        const p01 = src[(y1 * srcSize + x0) * 4 + c];
        const p11 = src[(y1 * srcSize + x1) * 4 + c];
        const top = p00 + (p10 - p00) * fx;
        const bot = p01 + (p11 - p01) * fx;
        out[o + c] = Math.round(top + (bot - top) * fy);
      }
      // 密度通道：亮度偏高一点，水才像"有颜料"
      const lum = (out[o] * 0.3 + out[o + 1] * 0.55 + out[o + 2] * 0.15) / 255;
      out[o + 3] = Math.round(clamp01(0.25 + lum * 1.35) * 255);
    }
  }
  return smoothDensity(out, dstSize, 2);
}

/**
 * 把密度场再抹一遍（可分离的 1-2-1，两趟 × passes 次）。
 *
 * 为什么必须抹：密度场是从封面**降采样**来的，一个源像素在屏幕上会放大到十几个
 * 像素宽，直接喂给 shader 就是一片硬边的方块（观感像画面坏了，而不是"水里的颜料"）。
 * 双线性只保证**过渡**是平滑的，挡不住"每一格本身"是平的 —— 这里补上一层模糊，
 * 才有水彩化开的样子。代价是每首歌一次，256×256。
 *
 * passes=2（≈每边 2 个纹素 ≈ 屏幕上 12px）：封面自带的 8bit 色带 / 边缘压暗
 * 会被放大成一道竖直的深浅分界（128 采样 → 一纹素约 6px），抹两遍才看不出边。
 */
function smoothDensity(src, size, passes = 1) {
  let cur = src;
  for (let p = 0; p < Math.max(1, passes); p += 1) {
    const tmp = new Uint8ClampedArray(cur.length);
    const out = new Uint8Array(cur.length);
    const at = (buf, x, y, c) => buf[((y * size + x) << 2) + c];
    const clampI = (v) => (v < 0 ? 0 : v > size - 1 ? size - 1 : v);
    // 横向
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        for (let c = 0; c < 4; c += 1) {
          const v = at(cur, clampI(x - 1), y, c) + 2 * at(cur, x, y, c) + at(cur, clampI(x + 1), y, c);
          tmp[((y * size + x) << 2) + c] = v >> 2;
        }
      }
    }
    // 纵向
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        for (let c = 0; c < 4; c += 1) {
          const v = at(tmp, x, clampI(y - 1), c) + 2 * at(tmp, x, y, c) + at(tmp, x, clampI(y + 1), c);
          out[((y * size + x) << 2) + c] = v >> 2;
        }
      }
    }
    cur = out;
  }
  return cur;
}

/** 位置 → 下潜深度读数（整首歌 0..2400 m，越听越深） */
export function depthOf(pos, duration, maxM = 2400) {
  const p = Number.isFinite(pos) && pos > 0 ? pos : 0;
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const frac = d > 0 ? clamp01(p / d) : 0;
  const m = Math.round(frac * maxM);
  return { m, text: `− ${m} m` };
}

/** 舞台尺寸 + dpr → 流场分辨率（dpr 封顶 1.5：4K 下不能让填充率跟着翻倍） */
export function flowSize(w, h, dpr, tier, opts = {}) {
  const cap = Number.isFinite(opts.dprCap) ? opts.dprCap : 1.5;
  const ratio = (TIERS[tier] ?? TIERS.half) * clamp(Number(dpr) || 1, 1, cap);
  const rw = Math.max(2, Math.round(w * ratio));
  const rh = Math.max(2, Math.round(h * ratio));
  return { w: rw, h: rh, ratio: round(ratio, 4), tier: TIERS[tier] ? tier : "half" };
}

/**
 * 自适应降级：一帧的平均耗时 → 下一档。
 * 降档要果断（一慢就降），升档要犹豫（连续三个窗口都快才升一格）。
 * 传 { tier, streak } 进出来，返回值里带上新的 streak。
 */
export function nextTier(avgMs, cur, opts = {}) {
  const slow = Number.isFinite(opts.slowMs) ? opts.slowMs : ADAPT.slowMs;
  const fast = Number.isFinite(opts.fastMs) ? opts.fastMs : ADAPT.fastMs;
  const need = Number.isFinite(opts.upgradeStreak) ? opts.upgradeStreak : ADAPT.upgradeStreak;
  const floor = opts.floor || "third";
  const ceil = opts.ceil || "full";
  const tier = TIERS[cur.tier] ? cur.tier : "half";
  const streak = Number.isFinite(cur.streak) ? cur.streak : 0;
  const i = TIER_ORDER.indexOf(tier);
  /** 最差允许档（index 越大越糊）与最好允许档 */
  const worst = TIER_ORDER.indexOf(floor);
  const best = TIER_ORDER.indexOf(ceil);
  if (!Number.isFinite(avgMs)) return { tier, streak: 0, moved: 0 };
  if (avgMs > slow) {
    const n = Math.min(worst, i + 1);
    return { tier: TIER_ORDER[n], streak: 0, moved: n === i ? 0 : 1, reason: "slow" };
  }
  if (avgMs < fast) {
    const s = streak + 1;
    if (s >= need) {
      const n = Math.max(best, i - 1);
      return { tier: TIER_ORDER[n], streak: n === i ? s : 0, moved: n === i ? 0 : -1, reason: "fast" };
    }
    return { tier, streak: s, moved: 0, reason: "warm" };
  }
  return { tier, streak: 0, moved: 0, reason: "hold" };
}

/** 静止时的微流速度（暂停后水也要慢慢动一点，但不能"还在放歌"） */
export function flowSpeed(playing, lift, opts = {}) {
  const idle = Number.isFinite(opts.idle) ? opts.idle : 0.06;
  return playing ? 0.35 + clamp01(lift) * 0.65 : idle;
}

/**
 * 泵浦相位：进度补丁 4Hz，直接拿位置当相位会一顿一顿。
 * 这里按**真实经过的毫秒**积分（速率由流速决定），所以暂停时相位几乎不动、
 * 播放时平滑推进。返回的相位始终落在 [0, 2π)。
 */
export function pumpPhase(prev, dtMs, speed, opts = {}) {
  const tau = Number.isFinite(opts.tau) ? opts.tau : Math.PI * 2;
  const sp = Number.isFinite(speed) ? speed : 0;
  const dt = clamp(Number(dtMs) || 0, 0, 100);
  const p = (Number(prev) || 0) + (dt / 1000) * sp * tau * 0.5;
  const m = p % tau;
  return m < 0 ? m + tau : m;
}

/**
 * 字形遮罩的绘制计划（纯数据）：把一行的文本节点框换算成"相对舞台、乘以 dpr"的遮罩坐标。
 * stage 传 { width, height }，rects 传 [{ x, y, w, h, text, font }]。
 */
export function maskPlan(rects, stage, dpr, scale = 1) {
  const sw = Math.max(1, Number(stage?.width) || 1);
  const sh = Math.max(1, Number(stage?.height) || 1);
  const k = (Number(dpr) || 1) * (Number(scale) || 1);
  const out = [];
  for (const r of rects || []) {
    if (!r || !r.text || !String(r.text).trim()) continue;
    const x = (Number(r.x) || 0) * k;
    const y = (Number(r.y) || 0) * k;
    const w = Math.max(0, (Number(r.w) || 0) * k);
    const h = Math.max(0, (Number(r.h) || 0) * k);
    if (w <= 0 || h <= 0) continue;
    if (x > sw * k || y > sh * k || x + w < 0 || y + h < 0) continue; // 完全在台外
    out.push({ x, y, w, h, text: String(r.text), font: r.font || "" });
  }
  return { items: out, w: Math.round(sw * k), h: Math.round(sh * k), scale: k };
}

/** 遮罩的目标状态：只有"行号 + 文本 + 遮罩尺寸"都变了才需要重新画/重新上传 */
/**
 * 字形遮罩的重画判据。
 *
 * ★ `scroll` 必须参与：遮罩画布是全舞台坐标系，字形画在**当时的**可视位置上，
 *   而宿主 SDK 在换行时会把当前行滚到中间 —— 滚动发生在皮肤画完遮罩之后。
 *   不带滚动量就会出现"墨迹正好比 DOM 文字低 scrollTop 个像素"：
 *   屏幕上看到的是水里的凹陷/辉光整体错位（实测错 11~46px，随行号变大）。
 *   带上它，多画一帧就自己收敛（一行一次，不是每帧）。
 */
export function maskKey(index, text, w, h, scroll = 0) {
  const s = Math.round(Number(scroll) || 0);
  return `${index}|${Math.round(w)}x${Math.round(h)}|${s}|${String(text || "").slice(0, 120)}`;
}

/** 换歌涌浪：一次整屏折射偏移，0 → 1 → 0（t0 是涌浪起点，durMs 总时长） */
export function surgeAt(t0, now, durMs = 900) {
  const d = Number(durMs) || 0;
  if (!t0 || !d || now < t0) return 0;
  const t = clamp01((now - t0) / d);
  return Math.sin(t * Math.PI) * (1 - t * 0.35);
}

/** 水面的抬升量（低频 → 液面高度，0..1 映射到 CSS 的 px / shader 的 uLift） */
export function liftOf(pump, prev = 0, k = 0.15) {
  const target = clamp01(Number(pump?.lift) || 0);
  return prev + (target - prev) * clamp01(k);
}
