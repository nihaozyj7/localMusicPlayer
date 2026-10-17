/* ==========================================================================
   diva/lib/spectrum.js — 128 段频谱 → 舞台 / 歌姬的全部驱动量
   --------------------------------------------------------------------------
   契约 v3 的频谱是**拉取式**的：entry 每帧调 ctx.spectrum()，把
   `{ bands: Float32Array(128), at }`（没在播放时是 null）交给这里的 update()。
   本模块把它折成三层东西：

     1. 逐段数组 `bands`（起音快、释放慢的指数平滑）—— 光环刻度直读；
     2. 五个频段标量 low / mid / high / vocal + 总能量 energy + 频谱质心
        —— 分别驱动舞台呼吸、歌姬口型（diva.js 读 vocal）与身体起伏；
     3. 事件量：正通量 flux、节拍脉冲 beat、拍内相位 beatPhase、累计拍数 beats
        —— 由**自适应阈值 + 冷却**的正通量突变检测得到。

   几条必须守住的规矩（都写进了 tests/diva-spectrum.test.js）：
     · 同一条样本（`at` 相同）不重复计通量，也不推进逐段平滑；
     · null 输入按「全 0 目标」平滑衰减，静音后逐段值真的落到 0；
     · 任何输入（NaN / Infinity / 越界）都不得让输出出现 NaN；
     · read() 返回**同一个对象**、bands 是**同一个 Float32Array**，
       帧循环里读它不产生任何分配（这是每帧都要跑的热路径）。
   ========================================================================== */

// 子模块依赖同样要透传入口的 ?t= token（原因见 skin.js 顶部说明）。
// 静态 import 会把 query 丢掉 → 生产环境请求到没带 token 的 URL（403）。
const Q = new URL(import.meta.url).search;
const { clamp, clamp01, smoothTo } = await import(`./util.js${Q}`);

/** 宿主固定给 128 段；段数只作为参数保留，便于测试用更小的谱。 */
const DEFAULT_BANDS = 128;

/** 128 段对数全谱的频段划分（左闭右开，按「128 段」口径定义）。
 *  20Hz~20kHz 的对数分桶下：0~24 ≈ 20~115Hz（鼓点/贝斯），
 *  24~72 ≈ 115Hz~2kHz（主体），72~128 ≈ 2k~20k（空气感），
 *  40~96 ≈ 300Hz~7k（人声与齿音）。 */
const RANGES = Object.freeze({
  low: [0, 24],
  mid: [24, 72],
  high: [72, 128],
  vocal: [40, 96],
});

/** 可调参数（留给 opts 覆盖，默认值就是成品观感调好的那组）。 */
const TUNING = Object.freeze({
  /** 起音速率（每秒）：大 → 峰值一出现就亮起来 */
  attackRate: 34,
  /** 释放速率（每秒）：小 → 拍点过后慢慢落回去 */
  releaseRate: 6.5,
  /** 正通量归一系数（把「一帧里所有段往上涨的总量」压到 0..1） */
  fluxGain: 2.2,
  /** flux 显示值的平滑速率 */
  fluxRelease: 9,
  /** 自适应阈值 = 历史均值 × beatMul + beatFloor */
  beatMul: 1.55,
  beatFloor: 0.02,
  /** 两次拍之间的最小间隔（毫秒）：防止一记重拍被拆成好几记 */
  cooldownMs: 200,
  /** 计算历史均值用的窗口（帧数） */
  fluxWindow: 24,
  /** 拍脉冲从 1 衰减到 0 所用的秒数 */
  beatDecaySec: 0.22,
});

/**
 * @typedef {Object} SpectrumState
 * @property {boolean} ready 是否已经拿到过真实样本（reset 后回到 false）
 * @property {Float32Array} bands 128 段平滑后的能量（0..1，复用同一个数组）
 * @property {number} low 低频段均值
 * @property {number} mid 中频段均值
 * @property {number} high 高频段均值
 * @property {number} vocal 人声段均值（口型用）
 * @property {number} energy 全谱平均能量
 * @property {number} centroid 频谱质心（0 = 全低频，1 = 全高频）
 * @property {number} flux 正通量（0..1，平滑后的显示值）
 * @property {number} beat 节拍脉冲（0..1，每次命中置 1 后衰减）
 * @property {number} beatPhase 拍内相位（0..1）
 * @property {number} beats 累计拍数
 * @property {number} at 最近一条样本的采样时刻
 */

/** 有限数或兜底值（NaN / Infinity 一律当兜底）。 */
function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** 把帧间隔夹到 (0, 0.25] 秒；异常值按 0 处理。 */
function stepSeconds(dt) {
  const n = toNum(dt, 0);
  return n > 0 ? clamp(n, 0, 0.25) : 0;
}

/**
 * 创建一个频谱分析器（一次挂载一个；换歌时 reset() 即可复用）。
 *
 * @param {{bands?:number, attackRate?:number, releaseRate?:number, fluxGain?:number,
 *          beatMul?:number, beatFloor?:number, cooldownMs?:number, fluxWindow?:number}} [opts]
 */
export function createAnalyser(opts = {}) {
  const o = opts && typeof opts === "object" ? opts : {};
  const n = Math.round(clamp(toNum(o.bands, DEFAULT_BANDS), 16, 512));
  const attackRate = clamp(toNum(o.attackRate, TUNING.attackRate), 1, 120);
  const releaseRate = clamp(toNum(o.releaseRate, TUNING.releaseRate), 0.2, 120);
  const fluxGain = clamp(toNum(o.fluxGain, TUNING.fluxGain), 0.1, 10);
  const beatMul = clamp(toNum(o.beatMul, TUNING.beatMul), 0.5, 6);
  const beatFloor = clamp(toNum(o.beatFloor, TUNING.beatFloor), 0, 1);
  const cooldownMs = clamp(toNum(o.cooldownMs, TUNING.cooldownMs), 0, 2000);
  const fluxWindow = Math.round(clamp(toNum(o.fluxWindow, TUNING.fluxWindow), 4, 128));

  /** 逐段平滑值（对外就是 state.bands） */
  const bands = new Float32Array(n);
  /** 上一帧的原始值（算正通量用） */
  const prevRaw = new Float32Array(n);
  /** 通量历史环形缓冲（算自适应阈值用） */
  const fluxHist = new Float32Array(fluxWindow);

  const state = {
    ready: false,
    bands,
    low: 0,
    mid: 0,
    high: 0,
    vocal: 0,
    energy: 0,
    centroid: 0,
    flux: 0,
    beat: 0,
    beatPhase: 0,
    beats: 0,
    at: 0,
  };

  /** 内部时间线 */
  let lastNow = 0;
  let lastAt = Number.NaN;
  let sawSample = false;
  /** 上一帧是否还有真实样本（用于「暂停后恢复」时清零 prevRaw） */
  let hadRaw = false;
  /** 最近一记拍的时刻（毫秒）与估计的拍间隔（毫秒） */
  let lastBeatAt = -1;
  let beatPeriod = 500;
  /** 通量历史（环形缓冲的写指针 / 有效数 / 和） */
  let histAt = 0;
  let histCount = 0;
  let histSum = 0;

  /** 按 128 段口径取 [from, to) 区间的均值，段数不同时等比映射。 */
  function rangeAvg(arr, from, to) {
    const a = Math.floor((from * n) / DEFAULT_BANDS);
    const b = Math.max(a + 1, Math.min(n, Math.ceil((to * n) / DEFAULT_BANDS)));
    let sum = 0;
    for (let i = a; i < b; i += 1) sum += arr[i];
    return sum / (b - a);
  }

  /** 用平滑后的逐段值刷新五个频段标量 / 能量 / 质心。 */
  function applyAggregates() {
    let sum = 0;
    let wsum = 0;
    for (let i = 0; i < n; i += 1) {
      const v = bands[i];
      sum += v;
      wsum += i * v;
    }
    state.low = clamp01(rangeAvg(bands, RANGES.low[0], RANGES.low[1]));
    state.mid = clamp01(rangeAvg(bands, RANGES.mid[0], RANGES.mid[1]));
    state.high = clamp01(rangeAvg(bands, RANGES.high[0], RANGES.high[1]));
    state.vocal = clamp01(rangeAvg(bands, RANGES.vocal[0], RANGES.vocal[1]));
    state.energy = clamp01(sum / n);
    // 全静音时质心给 0（不是 0.5 —— 「静音 = 全 0」是自检的判据之一）
    state.centroid = sum > 1e-6 ? clamp01(wsum / sum / Math.max(1, n - 1)) : 0;
  }

  /** 一条新样本都读不到时的平滑衰减：所有值往下走，最终落 0。 */
  function decay(dt) {
    for (let i = 0; i < n; i += 1) {
      const cur = bands[i];
      if (cur <= 0) {
        bands[i] = 0;
        continue;
      }
      const next = smoothTo(cur, 0, dt, releaseRate);
      bands[i] = next < 1e-4 ? 0 : clamp01(next);
    }
    applyAggregates();
    state.flux = smoothTo(state.flux, 0, dt, TUNING.fluxRelease);
    if (state.flux < 1e-4) state.flux = 0;
    if (hadRaw) {
      // 恢复播放时应当把「重新出声」当成一次起音（而不是和一小时前的谱比）
      prevRaw.fill(0);
      hadRaw = false;
    }
  }

  /**
   * 喂一帧频谱。返回 true = 这一帧吃到了**新的**样本。
   *
   * @param {{bands:Float32Array, at:number}|Float32Array|null} snapshot
   * @param {number} nowMs 当前墙钟（毫秒）
   * @returns {boolean}
   */
  function update(snapshot, nowMs) {
    const now = toNum(nowMs, lastNow + 1000 / 60);
    let dt = lastNow > 0 ? (now - lastNow) / 1000 : 1 / 60;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = stepSeconds(dt);
    lastNow = now;

    // 拍脉冲按墙钟衰减（同一条样本被重复读的帧里也要继续衰减）
    if (state.beat > 0) {
      const next = state.beat - dt / TUNING.beatDecaySec;
      state.beat = next > 1e-3 ? clamp01(next) : 0;
    }
    state.beatPhase = lastBeatAt >= 0 ? clamp01((now - lastBeatAt) / beatPeriod) : 0;

    // —— 取出样本本体 ——
    let raw = null;
    let stamp = now;
    if (snapshot && typeof snapshot === "object") {
      if (ArrayBuffer.isView(snapshot) || Array.isArray(snapshot)) {
        raw = snapshot;
      } else if (snapshot.bands && typeof snapshot.bands.length === "number") {
        raw = snapshot.bands;
        stamp = toNum(snapshot.at, now);
      }
    }
    if (!raw || raw.length <= 0) {
      decay(dt);
      return false;
    }
    if (sawSample && stamp === lastAt) return false;

    const first = !sawSample;
    sawSample = true;
    lastAt = stamp;
    state.at = stamp;
    state.ready = true;

    // —— 逐段起音快 / 释放慢 + 正通量 ——
    let sumPos = 0;
    for (let i = 0; i < n; i += 1) {
      const v = clamp01(toNum(i < raw.length ? raw[i] : 0, 0));
      const cur = bands[i];
      const rate = v > cur ? attackRate : releaseRate;
      let next = cur + (v - cur) * (1 - Math.exp(-rate * dt));
      if (!Number.isFinite(next)) next = v;
      if (Math.abs(next - v) < 1e-4) next = v;
      bands[i] = clamp01(next);

      if (!first) {
        const d = v - prevRaw[i];
        if (d > 0) sumPos += d;
      }
      prevRaw[i] = v;
    }
    hadRaw = true;
    applyAggregates();

    // —— 正通量 + 自适应阈值（用**过去**的均值，不含当前这一帧） ——
    const fluxVal = first ? 0 : clamp01((sumPos / n) * fluxGain);
    const mean = histCount > 0 ? histSum / histCount : 0;
    const idx = histAt % fluxWindow;
    if (histCount >= fluxWindow) histSum -= fluxHist[idx];
    else histCount += 1;
    fluxHist[idx] = fluxVal;
    histSum += fluxVal;
    histAt += 1;

    state.flux = smoothTo(state.flux, fluxVal, dt, TUNING.fluxRelease);
    if (state.flux < 1e-4 && fluxVal <= 0) state.flux = 0;

    const threshold = mean * beatMul + beatFloor;
    // lastBeatAt < 0 = 还没打过拍：不套冷却（否则第一记必须等满一个冷却才可能响）
    const cooled = lastBeatAt < 0 || now - lastBeatAt >= cooldownMs;
    const canFire = !first && fluxVal > threshold && cooled;
    if (canFire) {
      if (lastBeatAt >= 0) {
        const gap = now - lastBeatAt;
        // 只采纳 180~2400ms 的间隔（太快是重影、太慢是段落）
        if (gap >= 180 && gap <= 2400) beatPeriod = beatPeriod + (gap - beatPeriod) * 0.4;
      }
      lastBeatAt = now;
      state.beats += 1;
      state.beat = 1;
      state.beatPhase = 0;
    }

    return true;
  }

  /** 回到未挂载状态（换歌 / 卸载时调）。所有数组与标量清零。 */
  function reset() {
    bands.fill(0);
    prevRaw.fill(0);
    fluxHist.fill(0);
    state.ready = false;
    state.low = 0;
    state.mid = 0;
    state.high = 0;
    state.vocal = 0;
    state.energy = 0;
    state.centroid = 0;
    state.flux = 0;
    state.beat = 0;
    state.beatPhase = 0;
    state.beats = 0;
    state.at = 0;
    lastNow = 0;
    lastAt = Number.NaN;
    sawSample = false;
    hadRaw = false;
    lastBeatAt = -1;
    beatPeriod = 500;
    histAt = 0;
    histCount = 0;
    histSum = 0;
  }

  /** 读当前状态（**复用同一个对象**，不要缓存后长期持有字段以外的引用）。 */
  function read() {
    return state;
  }

  return { update, read, reset };
}
