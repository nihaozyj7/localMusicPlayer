// @ts-check
/* ==========================================================================
   arcanum-audio.js — 「奥术七元素」：把频谱翻译成魔法元素（纯计算，零 DOM）
   --------------------------------------------------------------------------
   宿主每帧推来的只有一样东西：**32 段对数频谱**（0..1，见 audio.js#spectrum）。
   皮肤不去碰 AudioContext（契约不允许，桌面背景宿主也没有），所以「鼓点 / 长音 /
   停顿 / 和弦变化」这些概念全部要在这里从频谱里推出来。

   映射表（需求里的「奥术七元素」）：

     音乐成分       元素      这个模块里的量
     -------------- --------- -------------------------------------------
     低频 / 鼓      地、雷    low（0..1）+ onset（重拍脉冲）+ thunder
     贝斯 / 中低频  水        bass
     和声 / 中频    风        mid
     旋律 / 高频    光        high
     长音          奥术光柱  arcane（持续能量包络）
     停顿          暗、雾    voidLevel（久静之后升起来）
     和弦变化      元素切换  element（质心 + 主导频段，带迟滞）

   两个刻意的设计：

     · **起振快、回落慢**：视觉上的「鼓点」要立刻亮起来、慢慢暗下去，否则
       30Hz 的采样看起来就是一格一格的跳。所以 attack/release 用两条不同的
       指数时间常数，而不是把采样值直接画出去。

     · **有回退方案**：拿不到频谱（浏览器没 WebAudio / 音频图没建起来 /
       桌面背景窗口没收到转发）时，live=false，改用**歌词行头**当节拍源 ——
       每一句歌词都踩一记脉冲，法阵照样会呼吸，只是不再区分元素。
   ========================================================================== */

/** 频段分组（32 段对数频谱实测：0~2 是鼓、3~6 是贝斯、7~14 是中频、15+ 是高频） */
export function bandSplit(bandCount = 32) {
  const n = Math.max(8, Math.min(128, Math.round(bandCount) || 32));
  return {
    count: n,
    lowEnd: Math.max(1, Math.round(n * 0.1)),
    bassEnd: Math.max(2, Math.round(n * 0.22)),
    midEnd: Math.max(3, Math.round(n * 0.47)),
  };
}

/** 元素 → 调色板色相偏移（度）与名字。皮肤把 hue 写进 CSS 变量切氛围。 */
export const ELEMENT_HUE = { earth: -6, water: -34, wind: 16, light: 44 };
export const ELEMENT_NAME = { earth: "地", water: "水", wind: "风", light: "光" };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** 指数逼近系数：tau 秒内走完约 63% */
const approach = (dt, tau) => 1 - Math.exp(-Math.max(0, dt) / Math.max(0.001, tau));

function meanOf(bands, from, to) {
  let sum = 0;
  const lo = Math.max(0, from);
  const hi = Math.min(bands.length, to);
  if (hi <= lo) return 0;
  for (let i = lo; i < hi; i += 1) sum += bands[i] || 0;
  return sum / (hi - lo);
}

/**
 * 创建一个元素分析器。调用方在 spectrum 补丁里 update()，在每帧里 frame()。
 *
 * @param {number} bandCount 宿主推来的段数（与 defineSkin 的 spectrum 声明一致）
 */
export function createElementAnalyzer(bandCount = 32) {
  const split = bandSplit(bandCount);

  const a = {
    split,
    /** 频谱是否可用（false 时走歌词节拍回退） */
    live: false,
    /** 分组能量（0..1，已起振/回落平滑） */
    low: 0,
    bass: 0,
    mid: 0,
    high: 0,
    /** 全频能量 */
    energy: 0,
    /** 重拍脉冲（1→0，曲线上是「起振快、回落慢」） */
    onset: 0,
    /** 重拍落在哪一组（渲染层据此决定是「地裂」还是「风啸」） */
    onsetBand: "earth",
    /** 雷：一次白闪 + 脉冲环 + 粒子爆裂（比 onset 更亮、更短） */
    thunder: 0,
    /** 奥术光柱：长音的持续包络 */
    arcane: 0,
    /** 暗 / 雾：停顿的持续包络 */
    voidLevel: 0,
    /** 频谱质心（0..1），用来判断「和弦/音色是否换了」 */
    centroid: 0.5,
    /** 当前元素 */
    element: "earth",
    /** 元素刚刚切换（渲染层据此重建符文图案 / 切色） */
    elementSwitched: false,
    /** 频谱不可用时，由调用方写进来的歌词节拍脉冲 */
    tempoPulse: 0,

    // —— 内部状态（下划线开头：渲染层不要读）——
    _lowRaw: 0,
    _bassRaw: 0,
    _midRaw: 0,
    _highRaw: 0,
    _energyRaw: 0,
    _lowBase: 0,
    _energyBase: 0,
    _lastOnsetAt: -1e9,
    _elapsed: 0,
    _quiet: 0,
    _loud: 0,
    _candidate: "",
    _candidateFor: 0,
  };

  /**
   * 收到一帧频谱。bands 为 null 表示「停止」（暂停 / 没有旋律）。
   * @param {number[]|Float32Array|null} bands
   */
  a.update = (bands) => {
    if (!bands || !bands.length) {
      a.live = false;
      return;
    }
    a.live = true;
    const n = bands.length;
    const s = a.split;
    a._lowRaw = meanOf(bands, 0, Math.min(n, s.lowEnd));
    a._bassRaw = meanOf(bands, Math.min(n, s.lowEnd), Math.min(n, s.bassEnd));
    a._midRaw = meanOf(bands, Math.min(n, s.bassEnd), Math.min(n, s.midEnd));
    a._highRaw = meanOf(bands, Math.min(n, s.midEnd), n);
    a._energyRaw = meanOf(bands, 0, n);

    // 质心：用「加权平均频段下标 / 段数」代替真正的 Hz 质心（对数分桶下已经够用）
    let wsum = 0;
    let vsum = 0;
    for (let i = 0; i < n; i += 1) {
      const v = bands[i] || 0;
      wsum += i * v;
      vsum += v;
    }
    const centroid = vsum > 0.001 ? wsum / vsum / Math.max(1, n - 1) : a.centroid;
    a.centroid += (centroid - a.centroid) * 0.25;
  };

  /**
   * 每帧推进一步（dt 秒）。
   *
   * @param {number} dt 距上一帧的秒数
   * @param {{ playing?: boolean, tempoPulse?: number }} [ctx]
   */
  a.frame = (dt, ctx = {}) => {
    const d = clamp(dt || 0, 0, 0.1);
    a._elapsed += d;
    a.elementSwitched = false;

    const attack = approach(d, 0.035);
    const release = approach(d, 0.24);

    // 目标值：有频谱就用频谱；没有就用「歌词行头」的节拍脉冲造一个假的低频
    let tLow;
    let tBass;
    let tMid;
    let tHigh;
    let tEnergy;
    if (a.live) {
      tLow = a._lowRaw;
      tBass = a._bassRaw;
      tMid = a._midRaw;
      tHigh = a._highRaw;
      tEnergy = a._energyRaw;
    } else {
      const pulse = clamp(ctx.tempoPulse || 0, 0, 1);
      const on = ctx.playing ? 1 : 0;
      tLow = on * (0.12 + pulse * 0.55);
      tBass = on * (0.1 + pulse * 0.22);
      tMid = on * 0.14;
      tHigh = on * 0.12;
      tEnergy = on * (0.16 + pulse * 0.14);
      // 回退模式下不给元素切换，也不给长音 / 停顿（那些只有真频谱才读得准）
      a.arcane *= Math.exp(-d / 0.5);
      a.voidLevel = on ? 0 : clamp(a.voidLevel + approach(d, 1.2), 0, 1);
      a.thunder *= Math.exp(-d / 0.3);
      a.onset *= Math.exp(-d / 0.22);
    }

    const step = (cur, target) => cur + (target - cur) * (target > cur ? attack : release);
    a.low = step(a.low, tLow);
    a.bass = step(a.bass, tBass);
    a.mid = step(a.mid, tMid);
    a.high = step(a.high, tHigh);
    a.energy = step(a.energy, tEnergy);
    a.tempoPulse = clamp(ctx.tempoPulse || 0, 0, 1);

    if (a.live) {
      // —— 基线：慢 EMA，用来做「重拍」的比较基准 ——
      const baseK = approach(d, 0.55);
      a._lowBase += (a._lowRaw - a._lowBase) * baseK;
      a._energyBase += (a._energyRaw - a._energyBase) * baseK;

      // —— 重拍：低频突增 + 140ms 不定期的冷却，避免一记鼓连爆三次 ——
      const now = a._elapsed;
      const hit = a._lowRaw > a._lowBase * 1.45 + 0.05;
      if (hit && now - a._lastOnsetAt > 0.14) {
        a._lastOnsetAt = now;
        a.onset = 1;
        a.thunder = 1;
        // 哪一组跳得最凶，元素就记在谁头上
        const dl = a._lowRaw - a.low;
        const db = a._bassRaw - a.bass;
        const dm = a._midRaw - a.mid;
        const dh = a._highRaw - a.high;
        const top = Math.max(dl, db, dm, dh);
        a.onsetBand = top === dl ? "earth" : top === db ? "water" : top === dm ? "wind" : "light";
      }
      a.onset *= Math.exp(-d / 0.22);
      a.thunder *= Math.exp(-d / 0.3);

      // —— 长音 → 奥术光柱：能量高且稳定（低频起伏小）就慢慢立起来 ——
      const steady = a._lowRaw - a._lowBase < 0.05;
      const loud = a._energyBase > 0.3 && steady;
      a._loud = loud ? a._loud + d : 0;
      const wantArcane = a._loud > 0.55 ? 1 : 0;
      a.arcane += (wantArcane - a.arcane) * approach(d, wantArcane > a.arcane ? 0.7 : 0.45);

      // —— 停顿 → 暗雾：久静（0.9s）才升起来，避免正常间奏一抖一抖 ——
      const quiet = a._energyBase < 0.06;
      a._quiet = quiet ? a._quiet + d : 0;
      const wantVoid = a._quiet > 0.9 ? 1 : 0;
      a.voidLevel += (wantVoid - a.voidLevel) * approach(d, wantVoid > a.voidLevel ? 1.1 : 0.5);

      // —— 和弦变化 → 元素切换：主导频段变了，而且要连续保持 1.1s 才算数 ——
      const groups = { earth: a.low, water: a.bass, wind: a.mid, light: a.high };
      let best = a.element;
      let bestV = -1;
      for (const key of Object.keys(groups)) {
        if (groups[key] > bestV) {
          bestV = groups[key];
          best = key;
        }
      }
      if (best !== a.element) {
        if (best !== a._candidate) {
          a._candidate = best;
          a._candidateFor = 0;
        } else {
          a._candidateFor += d;
          if (a._candidateFor > 1.1) {
            a.element = best;
            a._candidateFor = 0;
            a._candidate = "";
            a.elementSwitched = true;
          }
        }
      } else {
        a._candidate = "";
        a._candidateFor = 0;
      }
    }

    return a;
  };

  /** 当前元素的色相偏移（渲染层写进 CSS 变量） */
  a.hue = () => ELEMENT_HUE[a.element] ?? 0;

  return a;
}
