/* ==========================================================================
   心跳 pulse · lib/beat.js —— 拍点检测与相位锁定的**纯逻辑**（无 DOM、无宿主）
   --------------------------------------------------------------------------
   这一款的全部难度都在这个文件里：宿主只给两种东西 ——
     · 30Hz 的 128 段频谱（拉取式，`ctx.spectrum()`，静音/未就绪时是 null）
     · 4Hz 的进度补丁（`position` 还被量化到 250ms）
   要在这两块料上做"音画同拍"，必须自己算出**拍点**。这里是全套算法：

     1. 每帧把频谱压成三个标量：能量 e（均值）、谱质心 c（加权重心）、
        flux f（正向差分之和 —— 只有"变响"才算，稳态时不产生 onset）；
     2. 自适应阈值：阈值 = max(下限, 最近 24 帧 flux 的中位数 × 1.7)，
        所以安静段落不会被噪声骗出 onset，副歌也不会因为整体变响而全部漏掉；
     3. onset 冷却 140ms（一拍最快 428 BPM，够用；避免一个鼓点被拆成两下）；
     4. 用最近 8 个间隔的**中位数**估周期 —— 中位数抗离群值（漏一个 onset 也不怕），
        BPM 折进 60..180（×2 / ÷2 折叠：90 与 180 是同一个脉搏，报哪个都行）；
     5. 间隔的变异系数 cv 决定"锁没锁上"：cv ≤ 0.16 才算 locked，cv ≥ 0.34 判 free，
        中间一律留在 listening（**不谎报 BPM** —— 自由节拍的曲子必须如实退回）；
     6. 相位用**软校正**（PLL）：新 onset 落在预测拍点 ±25% 周期内就把锚点往那边
        挪偏差的一半，否则重新起拍。硬对齐到每个 onset 会被切分音（副歌抢半拍）
        整条带偏。

   还有两件"看起来是玄学、其实必须是它"的事：

     · **负延迟补偿**：人眼对"闪一下"和"听到鼓点"的先后判定有 ~40ms 的容忍，
       但显示链路上还压着 30Hz 采样 + 一帧合成。在**预测拍点之前** leadMs 就点亮，
       看到的才是"正好卡在鼓点"。`pulseAt()` 的峰值就在 `beat - leadMs`。
     · **柔性吸附**：字级时间轴（`words`）常常是人工打的，与真实拍点差几十毫秒。
       只吸附偏差 ≤ 90ms 的字素，差得远的（抒情歌的散板）原样保留 ——
       把整句拖到网格上会让歌词"提前跑"。

   ★ 这个文件被 `tests/pulse-logic.test.js` 逐条钉着（值域 / 单调性 / 边界 /
     收敛性 / 不谎报）。改之前先看那些用例的名字。
   ========================================================================== */

/** 示波器窗口：屏幕上看到"过去 6 秒" */
export const SPAN_MS = 6000;
/** 环形缓冲容量（6 秒 × 60fps = 360，留 512） */
export const RING_CAP = 512;

/** onset 检测参数 */
export const ONSET = {
  cooldownMs: 140,
  fluxWindow: 24,
  /** 自适应阈值 = max(下限, 近期峰值 × 0.32, 近期中位数 × 1.7) */
  thrMult: 1.7,
  thrFloor: 0.002,
  peakRatio: 0.32,
  /** 峰值衰减（每帧）：60fps 下约 1.8 秒掉到三成 —— 段落一换阈值跟着换 */
  peakDecay: 0.98,
  minEnergy: 0.004,
  minIntervalMs: 100,
  maxIntervalMs: 2000,
};

/** PLL / 节拍参数 */
export const PLL = {
  maxIntervals: 8,
  minForBpm: 2,
  minOnsets: 4,
  cvLock: 0.16,
  cvFree: 0.34,
  bpmMin: 60,
  bpmMax: 180,
  leadMs: 40,
  flashPortion: 0.22,
  snapMs: 90,
  maxMarks: 32,
};

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const round = (v, n = 3) => {
  const p = 10 ** n;
  return Math.round(v * p) / p;
};

/* --------------------------------------------------------------------------
   频谱 → 三个标量
   -------------------------------------------------------------------------- */

/** 每一段的均值（0..1）。整段频谱是音量后的口径，静音就是 0。 */
export function energyOf(bands) {
  if (!bands || !bands.length) return 0;
  let s = 0;
  for (let i = 0; i < bands.length; i += 1) s += bands[i];
  return clamp01(s / bands.length);
}

/** 谱质心（0..1）：能量分布在频谱上的重心。全静音时给 0.5（不假装） */
export function centroidOf(bands) {
  if (!bands || !bands.length) return 0.5;
  let num = 0;
  let den = 0;
  for (let i = 0; i < bands.length; i += 1) {
    const v = bands[i];
    num += i * v;
    den += v;
  }
  if (den <= 1e-6) return 0.5;
  return clamp01(num / den / (bands.length - 1));
}

/** flux：正向差分之和 / 段数。只有"变响"计入，稳态乐音不会一直报 onset */
export function fluxOf(bands, prev) {
  if (!bands || !bands.length) return 0;
  if (!prev || prev.length !== bands.length) return 0;
  let s = 0;
  for (let i = 0; i < bands.length; i += 1) {
    const d = bands[i] - prev[i];
    if (d > 0) s += d;
  }
  return clamp01(s / bands.length);
}

export function median(arr) {
  if (!arr || !arr.length) return 0;
  const a = Array.prototype.slice.call(arr).sort((x, y) => x - y);
  const n = a.length;
  const m = n >> 1;
  return n % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function average(arr) {
  if (!arr || !arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i += 1) s += arr[i];
  return s / arr.length;
}

/** 变异系数（标准差 / 均值）：拍点稳不稳就看它 */
export function cvOf(arr) {
  const mean = average(arr);
  if (!(mean > 0)) return 1;
  let s = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const d = arr[i] - mean;
    s += d * d;
  }
  return Math.sqrt(s / arr.length) / mean;
}

/* --------------------------------------------------------------------------
   环形缓冲（过去 SPAN_MS 的包络 / 质心 / flux）
   -------------------------------------------------------------------------- */

export function createRing(cap = RING_CAP) {
  return {
    cap,
    head: 0,
    n: 0,
    t: new Float64Array(cap),
    e: new Float32Array(cap),
    c: new Float32Array(cap),
    f: new Float32Array(cap),
  };
}

export function ringPush(ring, t, e, c, f) {
  const i = ring.head;
  ring.t[i] = t;
  ring.e[i] = e;
  ring.c[i] = c;
  ring.f[i] = f;
  ring.head = (i + 1) % ring.cap;
  if (ring.n < ring.cap) ring.n += 1;
}

/** 第 k 个样本（k 从 0 = 最旧 到 n-1 = 最新）在 typed array 里的下标 */
export function ringIndex(ring, k) {
  if (k < 0 || k >= ring.n) return -1;
  return (ring.head - ring.n + k + ring.cap * 2) % ring.cap;
}

/** 最新一个样本的时刻（没有样本时返回 -1） */
export function ringLastT(ring) {
  if (!ring.n) return -1;
  return ring.t[ringIndex(ring, ring.n - 1)];
}

/**
 * 把 [t0, t1] 内的样本按时间顺序**拷进** out（零分配：canvas 每帧要用它）。
 * out 是 { t, e, c, f } 四个长度 ≥ cap 的 typed array；返回实际条数。
 */
export function seriesInto(ring, t0, t1, out) {
  let n = 0;
  for (let k = 0; k < ring.n; k += 1) {
    const i = ringIndex(ring, k);
    const t = ring.t[i];
    if (t < t0 || t > t1) continue;
    out.t[n] = t;
    out.e[n] = ring.e[i];
    out.c[n] = ring.c[i];
    out.f[n] = ring.f[i];
    n += 1;
  }
  return n;
}

/** seriesInto 的 out 缓冲（长度按容量给够） */
export function createSeries(cap = RING_CAP) {
  return {
    cap,
    n: 0,
    t: new Float64Array(cap),
    e: new Float32Array(cap),
    c: new Float32Array(cap),
    f: new Float32Array(cap),
  };
}

/** 包络在某一时刻的值（线性插值；超出范围给最近的那一端） */
export function envelopeAt(ring, t, key = "e") {
  if (!ring.n) return 0;
  const arr = ring[key];
  const t0 = ringIndex(ring, 0);
  const tn = ringIndex(ring, ring.n - 1);
  if (t <= ring.t[t0]) return arr[t0];
  if (t >= ring.t[tn]) return arr[tn];
  for (let k = 0; k < ring.n; k += 1) {
    const i = ringIndex(ring, k);
    if (ring.t[i] >= t) {
      const j = ringIndex(ring, Math.max(0, k - 1));
      const span = ring.t[i] - ring.t[j];
      const w = span > 0 ? (t - ring.t[j]) / span : 0;
      return arr[j] + (arr[i] - arr[j]) * w;
    }
  }
  return arr[tn];
}

/* --------------------------------------------------------------------------
   节拍：BPM 折叠 / 相位 / 预测
   -------------------------------------------------------------------------- */

/** 把任意 BPM 折进 [bpmMin, bpmMax]（90 与 180 是同一个脉搏，×2 / ÷2 都合法） */
export function foldBpm(bpm, min = PLL.bpmMin, max = PLL.bpmMax) {
  if (!(bpm > 0)) return 0;
  let v = bpm;
  let guard = 0;
  while (v < min && guard < 8) {
    v *= 2;
    guard += 1;
  }
  while (v > max && guard < 16) {
    v /= 2;
    guard += 1;
  }
  return Math.round(clamp(v, min, max) * 10) / 10;
}

export function createPll(opts = {}) {
  return {
    ring: createRing(opts.cap || RING_CAP),
    series: createSeries(opts.cap || RING_CAP),
    prev: null,
    fluxHist: [],
    fluxPeak: 0,
    intervals: [],
    onsetsSeen: 0,
    lastOnset: -1,
    anchor: -1,
    bpm: 0,
    cv: 1,
    conf: 0,
    mode: "listening",
    /** 上一次修正时锚点被挪动的毫秒数（自检拿它看"软校正"有没有在收敛） */
    lastCorrectionMs: 0,
    frames: 0,
    ...opts,
  };
}

function copyBands(bands, buf) {
  const n = bands.length;
  if (!buf || buf.length !== n) return Float32Array.from(bands);
  buf.set(bands);
  return buf;
}

/**
 * 喂一帧。返回 { e, c, flux, thr, onset }。
 * 采样必须按真实时间喂（t 是 performance.now()），间隔估计全靠它。
 */
export function feedFrame(pll, { t, bands }) {
  const e = energyOf(bands);
  const c = centroidOf(bands);
  const f = fluxOf(bands, pll.prev);
  pll.prev = bands && bands.length ? copyBands(bands, pll.prev) : null;
  ringPush(pll.ring, t, e, c, f);
  pll.frames += 1;

  pll.fluxHist.push(f);
  while (pll.fluxHist.length > ONSET.fluxWindow) pll.fluxHist.shift();
  /* 阈值三选一取最大：
       · 下限（纯底噪不该报 onset）
       · 近期峰值的一部分（频谱是**音量后**的口径：绝对阈值在音量 0.04 时全部漏检）
       · 近期中位数的若干倍（安静段落里的突变照样抓得住） */
  pll.fluxPeak = Math.max(f, pll.fluxPeak * ONSET.peakDecay);
  const thr = Math.max(ONSET.thrFloor, pll.fluxPeak * ONSET.peakRatio, median(pll.fluxHist) * ONSET.thrMult);

  let onset = false;
  const cool = pll.lastOnset < 0 || t - pll.lastOnset >= ONSET.cooldownMs;
  if (bands && f > thr && e > ONSET.minEnergy && cool) {
    if (pll.lastOnset >= 0) {
      const iv = t - pll.lastOnset;
      if (iv >= ONSET.minIntervalMs && iv <= ONSET.maxIntervalMs) {
        pll.intervals.push(iv);
        while (pll.intervals.length > PLL.maxIntervals) pll.intervals.shift();
        updateTempo(pll);
      }
    }
    /* 相位软校正：落在预测拍点 ±25% 周期内就往那边挪一半，否则重新起拍。
       （不加权硬对齐会被切分音整条带偏；这半步是 PLL 的全部秘密） */
    let corrected = 0;
    if (pll.bpm > 0 && pll.anchor >= 0) {
      const period = 60000 / pll.bpm;
      let ph = ((t - pll.anchor) % period + period) % period / period;
      if (ph > 0.5) ph -= 1;
      if (Math.abs(ph) <= 0.25) {
        corrected = ph * period * 0.5;
        pll.anchor += corrected;
      } else {
        pll.anchor = t;
      }
    } else {
      pll.anchor = t;
    }
    pll.lastCorrectionMs = corrected;
    pll.lastOnset = t;
    pll.onsetsSeen += 1;
    onset = true;
  }
  return { e, c, flux: f, thr, onset };
}

/** 用间隔的中位数估 BPM，并判定 locked / free / listening */
export function updateTempo(pll) {
  const iv = pll.intervals;
  if (iv.length < 2) {
    pll.bpm = 0;
    pll.cv = 1;
    pll.conf = 0;
    pll.mode = pll.onsetsSeen >= PLL.minOnsets ? "free" : "listening";
    return pll.mode;
  }
  /* 中位数抗"漏检一拍"造成的离群间隔，但它对抖动不敏感——所以再取一次**修剪均值**：
     只平均落在中位数 ±35% 内的间隔。抖动 ±8% 的拍点用中位数会偏 5%，用修剪均值偏 1%。 */
  const med = median(iv);
  const inliers = iv.filter((v) => Math.abs(v - med) <= med * 0.35);
  const period = inliers.length ? average(inliers) : med;
  pll.bpm = period > 0 ? foldBpm(60000 / period) : 0;
  pll.cv = cvOf(iv);
  pll.conf = clamp01(1 - pll.cv / (PLL.cvFree * 1.2));
  if (pll.onsetsSeen < PLL.minOnsets) pll.mode = "listening";
  else if (pll.cv <= PLL.cvLock) pll.mode = "locked";
  else if (pll.cv >= PLL.cvFree) pll.mode = "free";
  else pll.mode = "listening"; // 介于两者之间 = 还在校准：**不谎报** BPM
  return pll.mode;
}

export function periodOf(pll) {
  return pll.bpm > 0 ? 60000 / pll.bpm : 0;
}

/** 相位 0..1（0 = 正好在拍点上）。没锁上时给 0 —— 调用方要自己看 mode */
export function phaseAt(pll, t) {
  const period = periodOf(pll);
  if (!(period > 0) || pll.anchor < 0) return 0;
  const ph = (((t - pll.anchor) % period) + period) % period;
  const p = ph / period;
  /* 浮点误差会让"正好在拍点上"落成 0.9999999999999998：归一成 0，
     否则脉冲会在拍点那一刻变成 0（表现是"每次拍子闪一下就没"） */
  return p >= 1 - 1e-9 ? 0 : p;
}

/** 下一个拍点的时刻（没锁上时返回 -1） */
export function beatAt(pll, t) {
  const period = periodOf(pll);
  if (!(period > 0) || pll.anchor < 0) return -1;
  if (t <= pll.anchor) return pll.anchor;
  const k = Math.ceil((t - pll.anchor) / period - 1e-6);
  return pll.anchor + k * period;
}

/**
 * [t0, t1] 内的预测拍点（给吸附与画网格用）。上限 maxMarks 条。
 * 没锁上时返回空数组 —— 自由节拍上不画拍点网格。
 */
export function beatTimes(pll, t0, t1, maxMarks = PLL.maxMarks) {
  const period = periodOf(pll);
  if (!(period > 0) || pll.anchor < 0 || t1 <= t0) return [];
  let k = Math.ceil((t0 - pll.anchor) / period - 1e-6);
  const out = [];
  for (; out.length < maxMarks; k += 1) {
    const t = pll.anchor + k * period;
    if (t > t1) break;
    if (t >= t0) out.push(t);
  }
  return out;
}

/**
 * 脉冲亮度 0..1：**负延迟补偿** —— 峰值出现在预测拍点之前 leadMs。
 * 看到的是"正好卡在鼓点"，而不是"晚半拍"。
 */
export function pulseAt(pll, t, leadMs = PLL.leadMs, portion = PLL.flashPortion) {
  if (pll.mode !== "locked") return 0;
  const p = phaseAt(pll, t + leadMs);
  return p < portion ? clamp01(1 - p / portion) : 0;
}

/** 吸附结果：{ time, snapped, delta }。delta < 0 = 往前提 */
export function snapTime(ms, beats, maxMs = PLL.snapMs) {
  let best = ms;
  let bestD = 0;
  let hit = false;
  let bestAbs = Infinity;
  for (let i = 0; i < beats.length; i += 1) {
    const d = ms - beats[i];
    const a = Math.abs(d);
    if (a <= maxMs && a < bestAbs) {
      bestAbs = a;
      best = beats[i];
      bestD = -d;
      hit = true;
    }
  }
  return { time: best, snapped: hit, delta: hit ? bestD : 0 };
}

/**
 * 面板文案：**不许出现假的 BPM**。
 * hasSpectrum=false（预览模式 / 后端没起来）也走 free，并说明原因。
 */
export function statusOf(pll, { hasSpectrum = true } = {}) {
  if (!hasSpectrum) return { mode: "free", label: "自由节拍", hint: "宿主未提供频谱", bpm: 0 };
  if (pll.mode === "locked" && pll.bpm > 0) {
    return { mode: "locked", label: `${Math.round(pll.bpm)} BPM`, hint: "已锁相", bpm: pll.bpm };
  }
  if (pll.mode === "free") return { mode: "free", label: "自由节拍", hint: "拍点不稳", bpm: 0 };
  return { mode: "listening", label: "校准中…", hint: `已收 ${pll.onsetsSeen} 个拍点`, bpm: 0 };
}

/** 齿轮转角：把相位摊成 -180..180 度（左右两只齿轮反向由 CSS 决定） */
export function gearAngle(pll, t) {
  if (pll.mode !== "locked") return 0;
  return Math.round(phaseAt(pll, t) * 360 - 180);
}
