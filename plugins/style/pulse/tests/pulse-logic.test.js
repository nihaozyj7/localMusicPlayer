/* ==========================================================================
   pulse · 纯逻辑自检（node --test "plugins/style/pulse/tests/*.test.js"）
   --------------------------------------------------------------------------
   这一款的核心全部是可测的纯函数：能量 / 质心 / flux、自适应阈值、onset 冷却、
   中位数 BPM、变异系数判定、相位软校正（PLL）、负延迟补偿、柔性吸附，
   以及示波器的全部坐标映射。

   最后一段是**静态扫描**：imports、`ctx.*` 白名单、CSS 禁用项、清单、图标、
   destroy 的清理清单、以及"只有一条 rAF"这条纪律。
   ========================================================================== */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as bt from "../lib/beat.js";
import * as sc from "../lib/scope.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(HERE, "..");
const SKIN_JS = readFileSync(path.join(PKG, "skin.js"), "utf8");
const SKIN_CSS = readFileSync(path.join(PKG, "skin.css"), "utf8");
const MANIFEST = JSON.parse(readFileSync(path.join(PKG, "skin.json"), "utf8"));

/* --------------------------------------------------------------------------
   造料：一段"宽带"频谱 + 一个可脚本化的 onset 流
   -------------------------------------------------------------------------- */
const N = 128;
const quiet = (v = 0) => new Float32Array(N).fill(v);
const loud = (v = 1) => new Float32Array(N).fill(v);

/**
 * 按"拍点流"喂帧：每拍之间喂若干帧静音，拍点那一帧给一个宽带突变。
 * 返回 { pll, onsets, thr } —— onsets 是**被检出的**拍点时刻（不是喂进去的）。
 */
function feedBeats({ bpm = 120, frames = 240, jitter = 0, scale = 1, start = 0, fps = 60, seed = 1 } = {}) {
  const pll = bt.createPll();
  let rnd = seed;
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) % 2147483648;
    return rnd / 2147483648;
  };
  const period = 60000 / bpm; // 一拍多少毫秒：120 → 500ms
  const onsets = [];
  let t = start;
  const step = 1000 / fps;
  let nextBeat = start + period;
  for (let i = 0; i < frames; i += 1) {
    const isBeat = t >= nextBeat - step / 2;
    if (isBeat) nextBeat += period * (1 + (jitter ? (rand() * 2 - 1) * jitter : 0));
    const bands = isBeat ? loud(scale) : quiet(0.01 * scale);
    const r = bt.feedFrame(pll, { t, bands });
    if (r.onset) onsets.push(t);
    t += step;
  }
  return { pll, onsets, period };
}

/* ==========================================================================
   1. 频谱 → 三个标量
   ========================================================================== */
test("energyOf：算的是整段的均值（0..1），空输入给 0", () => {
  assert.equal(bt.energyOf(null), 0);
  assert.equal(bt.energyOf(new Float32Array(0)), 0);
  assert.equal(bt.energyOf(quiet(0)), 0);
  assert.equal(bt.energyOf(loud(1)), 1);
  assert.equal(bt.energyOf(loud(0.5)), 0.5);
  const half = new Float32Array(N).fill(0);
  for (let i = 0; i < N / 2; i += 1) half[i] = 1;
  assert.equal(bt.energyOf(half), 0.5);
});

test("centroidOf：能量全在最低段 → 0，全在最高段 → 1，平铺 → 0.5", () => {
  const low = quiet(0);
  low[0] = 1;
  const high = quiet(0);
  high[N - 1] = 1;
  assert.equal(bt.centroidOf(low), 0);
  assert.equal(bt.centroidOf(high), 1);
  assert.equal(bt.round(bt.centroidOf(loud(0.3)), 6), 0.5);
  assert.equal(bt.centroidOf(quiet(0)), 0.5, "全静音给 0.5（不假装知道）");
  assert.equal(bt.centroidOf(null), 0.5);
});

test("fluxOf：只算「变响」的那部分 —— 抬起来有值，平着与落下都是 0", () => {
  assert.equal(bt.fluxOf(loud(1), quiet(0)), 1);
  assert.equal(bt.fluxOf(loud(1), loud(1)), 0, "稳态不产生 flux（否则整首歌一直在报 onset）");
  assert.equal(bt.fluxOf(quiet(0), loud(1)), 0);
  assert.equal(bt.fluxOf(loud(1), null), 0, "第一帧没有参照，不算 flux");
  assert.equal(bt.fluxOf(loud(1), new Float32Array(64)), 0, "长度对不上就不算（宁可不报）");
});

test("median / average / cvOf：中位数抗离群值，变异系数衡量稳不稳", () => {
  assert.equal(bt.median([]), 0);
  assert.equal(bt.median([5]), 5);
  assert.equal(bt.median([3, 1, 2]), 2);
  assert.equal(bt.median([4, 1, 3, 2]), 2.5);
  assert.equal(bt.median([500, 500, 500, 9000]), 500, "漏一个 onset 造成的离群间隔不该带偏 BPM");
  assert.equal(bt.average([2, 4]), 3);
  assert.equal(bt.average([]), 0);
  assert.equal(bt.round(bt.cvOf([500, 500, 500, 500]), 6), 0);
  assert.equal(bt.round(bt.cvOf([400, 600]), 6), 0.2);
  assert.equal(bt.cvOf([]), 1, "没有样本时给最不稳的值（而不是 0）");
});

test("foldBpm：90 与 180 是同一个脉搏，折进 60..180", () => {
  assert.equal(bt.foldBpm(120), 120);
  assert.equal(bt.foldBpm(30), 60);
  assert.equal(bt.foldBpm(45), 90);
  assert.equal(bt.foldBpm(400), 100);
  assert.equal(bt.foldBpm(0), 0);
  assert.equal(bt.foldBpm(-3), 0);
  for (const v of [12, 33, 47, 88, 121, 199, 640]) {
    const f = bt.foldBpm(v);
    assert.ok(f >= 60 && f <= 180, `${v} → ${f} 必须落在 60..180`);
  }
});

/* ==========================================================================
   2. 环形缓冲
   ========================================================================== */
test("环形缓冲：写满之后按时间顺序读，绕圈也不乱", () => {
  const r = bt.createRing(4);
  for (let i = 0; i < 6; i += 1) bt.ringPush(r, i * 10, i / 10, 0, 0);
  assert.equal(r.n, 4);
  const seen = [];
  for (let k = 0; k < r.n; k += 1) seen.push(r.t[bt.ringIndex(r, k)]);
  assert.deepEqual(seen, [20, 30, 40, 50], "最旧的被挤掉了");
  assert.equal(bt.ringLastT(r), 50);
  assert.equal(bt.ringLastT(bt.createRing(4)), -1);
  assert.equal(bt.ringIndex(r, -1), -1);
  assert.equal(bt.ringIndex(r, 99), -1);
});

test("环形缓冲按**时间**保留：高刷屏下 6 秒窗口仍然铺满", () => {
  /* 每帧一个样本，所以"存了几秒"取决于刷新率。曾经容量写死 512：
     60Hz 够 8.5 秒（自检与开发机都看不出问题），120Hz 只剩 4.26 秒 ——
     真机表现是示波器**波形左端空掉一大截**（120Hz 空 29%），
     而且开窗口/拖窗口时帧率一掉就"刚好好了"，停下来一会儿又空回去。 */
  for (const fps of [30, 60, 85, 120, 144, 240]) {
    const ring = bt.createRing();
    const dt = 1000 / fps;
    let t = 0;
    for (let k = 0; k < Math.ceil(12_000 / dt); k += 1) {
      t += dt;
      bt.ringPush(ring, t, 0.5, 0.5, 0.01);
    }
    const out = bt.createSeries();
    const n = bt.seriesInto(ring, t - bt.SPAN_MS, t, out);
    assert.ok(n > 1, `${fps}Hz：窗口里要有样本`);
    assert.ok(out.t[0] >= t - bt.SPAN_MS, `${fps}Hz：不许给出窗口左端之外的样本`);
    const cover = t - out.t[0];
    assert.ok(
      cover >= bt.SPAN_MS - dt,
      `${fps}Hz：窗口覆盖 ${Math.round(cover)}ms，应≈${bt.SPAN_MS}ms（缺料就是波形左边空一截）`
    );
    assert.ok(ring.n <= ring.cap, `${fps}Hz：容量仍然是不许越过的内存上界`);
  }
});

test("环形缓冲：时间上界与容量上界各管一段（谁先生效就谁生效）", () => {
  /* 时间上界：每秒一个样本 —— 只留 RING_KEEP_MS 内的那几个 */
  const slow = bt.createRing(64);
  for (let i = 0; i < 100; i += 1) bt.ringPush(slow, i * 1000, 0, 0, 0);
  assert.equal(slow.n, Math.ceil(bt.RING_KEEP_MS / 1000) + 1, "保留时长内的样本 + 刚写入的这一个");
  assert.ok(slow.n < slow.cap, "时间上界先生效时，容量不会被顶到");

  /* 容量上界：样本很密（时间上界不触发），仍然不许越过 cap */
  const fast = bt.createRing(4);
  for (let i = 0; i < 20; i += 1) bt.ringPush(fast, i * 10, 0, 0, 0);
  assert.equal(fast.n, 4);
  assert.deepEqual(
    [0, 1, 2, 3].map((k) => fast.t[bt.ringIndex(fast, k)]),
    [160, 170, 180, 190],
    "绕圈之后顺序仍然是从旧到新"
  );
});

test("seriesInto：按时间窗拷出来，越界的丢掉（零分配）", () => {
  const r = bt.createRing(32);
  for (let i = 0; i < 10; i += 1) bt.ringPush(r, i * 100, i / 10, i / 20, i / 30);
  const out = bt.createSeries(32);
  const n = bt.seriesInto(r, 300, 600, out);
  assert.equal(n, 4);
  assert.deepEqual(Array.from(out.t.slice(0, n)), [300, 400, 500, 600]);
  assert.equal(bt.round(out.e[0], 6), 0.3);
  assert.equal(bt.seriesInto(r, 100000, 200000, out), 0, "窗口之外一条都不给");
});

test("envelopeAt：线性插值，两端不越界", () => {
  const r = bt.createRing(8);
  bt.ringPush(r, 0, 0, 0, 0);
  bt.ringPush(r, 100, 1, 0, 0);
  assert.equal(bt.round(bt.envelopeAt(r, 50), 6), 0.5, "两点之间线性插值（不是台阶）");
  assert.equal(bt.envelopeAt(r, -50), 0);
  assert.equal(bt.envelopeAt(r, 999), 1);
  assert.equal(bt.envelopeAt(bt.createRing(8), 10), 0);
});

/* ==========================================================================
   3. onset 检测
   ========================================================================== */
test("固定 500ms 一拍 → 检出、锁定、BPM 落在 120±2", () => {
  const { pll, onsets } = feedBeats({ bpm: 120, frames: 240 });
  assert.ok(onsets.length >= 5, `至少检出 5 个拍点，实际 ${onsets.length}`);
  assert.equal(pll.mode, "locked");
  assert.ok(Math.abs(pll.bpm - 120) <= 2, `BPM 应落在 120±2，实际 ${pll.bpm}`);
  assert.ok(pll.conf > 0.8, `置信度应该很高，实际 ${pll.conf}`);
});

test("音量很小时照样检出（频谱是音量后的口径，绝对阈值会全漏）", () => {
  const { pll, onsets } = feedBeats({ bpm: 120, frames: 240, scale: 0.04 });
  assert.ok(onsets.length >= 5, `音量 4% 时仍要检出拍点，实际 ${onsets.length}`);
  assert.equal(pll.mode, "locked");
});

test("静音流：一个 onset 都不该有", () => {
  const pll = bt.createPll();
  for (let i = 0; i < 200; i += 1) bt.feedFrame(pll, { t: i * 16, bands: quiet(0) });
  assert.equal(pll.onsetsSeen, 0);
  assert.equal(pll.mode, "listening");
  assert.equal(pll.bpm, 0);
});

test("稳态巨响：只有从静到响的那一下算 onset（稳态不该一直响）", () => {
  const pll = bt.createPll();
  for (let i = 0; i < 10; i += 1) bt.feedFrame(pll, { t: i * 16, bands: quiet(0.01) });
  bt.feedFrame(pll, { t: 200, bands: loud(1) });
  for (let i = 13; i < 120; i += 1) bt.feedFrame(pll, { t: i * 16, bands: loud(1) });
  assert.equal(pll.onsetsSeen, 1);
  assert.equal(pll.intervals.length, 0, "只有一个 onset，没有间隔可算");
});

test("冷却 140ms：一个鼓点被拆成两下也只算一次", () => {
  const pll = bt.createPll();
  const t0 = 1000;
  bt.feedFrame(pll, { t: t0 - 20, bands: quiet(0.01) });
  bt.feedFrame(pll, { t: t0, bands: loud(1) });
  bt.feedFrame(pll, { t: t0 + 16, bands: quiet(0.01) });
  bt.feedFrame(pll, { t: t0 + 60, bands: loud(1) }); // 距上一个 60ms < 冷却
  assert.equal(pll.onsetsSeen, 1, "60ms 后的第二下必须被冷却吃掉");
  bt.feedFrame(pll, { t: t0 + 200, bands: quiet(0.01) });
  bt.feedFrame(pll, { t: t0 + 260, bands: loud(1) });
  assert.equal(pll.onsetsSeen, 2, "超过冷却之后要能再检出");
});

test("间隔超出物理范围（<100ms / >2s）不进 BPM 统计", () => {
  const pll = bt.createPll();
  bt.feedFrame(pll, { t: 0, bands: quiet(0.01) });
  bt.feedFrame(pll, { t: 1, bands: loud(1) });
  bt.feedFrame(pll, { t: 2, bands: quiet(0.01) });
  bt.feedFrame(pll, { t: 5000, bands: loud(1) }); // 5 秒的"间隔"是漏检，不是慢拍
  assert.equal(pll.intervals.length, 0);
});

test("随机间隔 → 判 free，且**不谎报** BPM", () => {
  const pll = bt.createPll();
  let t = 0;
  let rnd = 7;
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) % 2147483648;
    return rnd / 2147483648;
  };
  for (let i = 0; i < 14; i += 1) {
    const gap = 180 + rand() * 900;
    bt.feedFrame(pll, { t, bands: quiet(0.01) });
    bt.feedFrame(pll, { t: t + 16, bands: loud(1) });
    t += gap;
  }
  assert.equal(pll.mode, "free");
  const s = bt.statusOf(pll, { hasSpectrum: true });
  assert.equal(s.label, "自由节拍");
  assert.equal(s.bpm, 0, "自由节拍下 status 里不能有 BPM 数字");
  assert.equal(bt.pulseAt(pll, t), 0, "没锁上就不该有脉冲（不假装在打拍子）");
});

test("拍点不足 4 个 → listening（校准中，不急着下结论）", () => {
  const { pll } = feedBeats({ bpm: 120, frames: 40 });
  assert.ok(pll.onsetsSeen < 4);
  assert.equal(pll.mode, "listening");
  assert.equal(bt.statusOf(pll).label, "校准中…");
});

test("拿不到频谱 → free + 说明原因（预览模式 / 后端未就绪）", () => {
  const s = bt.statusOf(bt.createPll(), { hasSpectrum: false });
  assert.equal(s.mode, "free");
  assert.equal(s.label, "自由节拍");
  assert.match(s.hint, /频谱/);
  assert.equal(s.bpm, 0);
});

test("±8% 的拍点抖动仍然锁得住，BPM 误差在 5 之内", () => {
  const { pll } = feedBeats({ bpm: 120, frames: 300, jitter: 0.08 });
  assert.equal(pll.mode, "locked", `抖动 8% 应该还在 locked，cv=${bt.round(pll.cv, 3)}`);
  assert.ok(Math.abs(pll.bpm - 120) <= 5, `BPM 仍应接近 120，实际 ${pll.bpm}`);
});

test("PLL 软校正：校正量是偏差的一半，且落在 ±25% 周期内才校", () => {
  const pll = bt.createPll();
  // 先建立 500ms 的节拍
  let t = 0;
  for (let i = 0; i < 6; i += 1) {
    bt.feedFrame(pll, { t: t - 16, bands: quiet(0.01) });
    bt.feedFrame(pll, { t, bands: loud(1) });
    t += 500;
  }
  const period = bt.periodOf(pll);
  assert.ok(Math.abs(period - 500) < 20, `周期应约 500ms，实际 ${period}`);
  // 下一个 onset 提前 60ms（偏差 12% 周期）→ 锚点该往前提 30ms 左右
  const before = pll.anchor;
  bt.feedFrame(pll, { t: t - 16, bands: quiet(0.01) });
  bt.feedFrame(pll, { t: t - 60, bands: loud(1) });
  assert.ok(pll.lastCorrectionMs !== 0, "必须有校正量");
  assert.ok(
    Math.abs(pll.lastCorrectionMs) < Math.abs(t - 60 - before),
    "软校正只挪「偏差的一半」级别的量，不是硬对齐"
  );
  // 偏差超过 25% 周期 → 重新起拍（不是被拖走）
  const anchor2 = pll.anchor;
  const far = t - 60 + period * 0.4;
  bt.feedFrame(pll, { t: far - 16, bands: quiet(0.01) });
  bt.feedFrame(pll, { t: far, bands: loud(1) });
  assert.equal(pll.anchor, far, "差得太远时锚点直接挪到新 onset（重新起拍）");
  assert.notEqual(pll.anchor, anchor2);
});

/* ==========================================================================
   4. 相位 / 预测 / 负延迟补偿
   ========================================================================== */
test("phaseAt：锚点处为 0，半个周期处为 0.5，且永远落在 [0,1)", () => {
  const { pll } = feedBeats({ bpm: 120, frames: 240 });
  const period = bt.periodOf(pll);
  assert.ok(Math.abs(bt.phaseAt(pll, pll.anchor)) < 1e-6);
  assert.ok(Math.abs(bt.phaseAt(pll, pll.anchor + period / 2) - 0.5) < 1e-6);
  for (const dt of [0, 30, 120, 250, 499, 500, 733]) {
    const p = bt.phaseAt(pll, pll.anchor + dt);
    assert.ok(p >= 0 && p < 1, `dt=${dt} 的相位 ${p} 必须落在 [0,1)`);
  }
  assert.equal(bt.phaseAt(bt.createPll(), 1234), 0, "没锁上时给 0（调用方要看 mode）");
});

test("beatAt：下一个拍点 ≥ 当前时刻，且正好在格子上", () => {
  const { pll } = feedBeats({ bpm: 120, frames: 240 });
  const period = bt.periodOf(pll);
  for (const dt of [0, 1, 250, 499, 500, 501, 999]) {
    const t = pll.anchor + dt;
    const b = bt.beatAt(pll, t);
    assert.ok(b >= t - 1e-6, `beatAt(${dt}) 应 ≥ t`);
    const off = Math.abs(((b - pll.anchor) % period + period) % period);
    assert.ok(Math.min(off, period - off) < 1e-6, "必须落在拍点格子上");
  }
  assert.equal(bt.beatAt(bt.createPll(), 100), -1, "没锁上时没有下一个拍点");
});

test("beatTimes：窗口内、等间隔、有序、有上限", () => {
  const { pll } = feedBeats({ bpm: 120, frames: 240 });
  const t0 = pll.anchor;
  const list = bt.beatTimes(pll, t0, t0 + bt.SPAN_MS);
  assert.ok(list.length >= 10 && list.length <= bt.PLL.maxMarks);
  assert.deepEqual(list.slice().sort((a, b) => a - b), list, "必须有序");
  const period = bt.periodOf(pll);
  for (let i = 1; i < list.length; i += 1) {
    assert.ok(Math.abs(list[i] - list[i - 1] - period) < 1e-6, "间隔必须等于周期");
  }
  assert.ok(list[0] >= t0 && list[list.length - 1] <= t0 + bt.SPAN_MS);
  assert.deepEqual(bt.beatTimes(bt.createPll(), 0, 6000), [], "没锁上就不画拍点网格");
});

test("pulseAt：峰值出现在**拍点之前** leadMs（负延迟补偿）", () => {
  const { pll } = feedBeats({ bpm: 120, frames: 240 });
  const period = bt.periodOf(pll);
  const beat = bt.beatAt(pll, pll.anchor + 10);
  const lead = bt.PLL.leadMs;
  assert.equal(bt.round(bt.pulseAt(pll, beat - lead), 6), 1, "拍点前 40ms 必须是峰值");
  assert.equal(bt.pulseAt(pll, beat - lead - period * 0.1), 0, "更早的时候是暗的");
  assert.ok(bt.pulseAt(pll, beat) < 1, "拍点**当下**已经过了峰值（这就是提前量的意思）");
  assert.ok(bt.pulseAt(pll, beat + period * 0.3) === 0, "拍点之后 30% 周期已经暗回去");
  const early = bt.pulseAt(pll, beat - lead + period * 0.02);
  const late = bt.pulseAt(pll, beat - lead + period * 0.18);
  assert.ok(early > late, "峰值之后单调衰减");
  assert.equal(bt.pulseAt(bt.createPll(), 1234), 0, "没锁上就没有脉冲");
});

/* ==========================================================================
   5. 柔性吸附
   ========================================================================== */
test("snapTime：只吸附偏差 ≤ 90ms 的，差得远的原样保留", () => {
  const beats = [1000, 1500, 2000];
  const near = bt.snapTime(1540, beats, 90);
  assert.equal(near.snapped, true);
  assert.equal(near.time, 1500);
  assert.equal(near.delta, -40, "delta < 0 表示往前提了 40ms");
  const far = bt.snapTime(1650, beats, 90);
  assert.equal(far.snapped, false);
  assert.equal(far.time, 1650, "差 150ms 的不许拖（抒情歌的散板要保留）");
  assert.equal(far.delta, 0);
  assert.equal(bt.snapTime(1500, beats, 90).snapped, true, "正好在拍点上也算吸附（delta 0）");
  assert.equal(bt.snapTime(1540, [], 90).snapped, false, "没有拍点就没有吸附");
});

test("snapTime：吸最近的那个，窗口边界取等号", () => {
  assert.equal(bt.snapTime(1040, [1000, 1070], 90).time, 1070, "吸最近的（差 30 而不是 40）");
  assert.equal(bt.snapTime(1040, [1000, 1070], 90).delta, 30);
  assert.equal(bt.snapTime(1590, [1500], 90).snapped, true, "90ms 正好在边界上，算吸附");
  assert.equal(bt.snapTime(1591, [1500], 90).snapped, false, "多 1ms 就不吸了");
  assert.equal(bt.snapTime(1540, [1500], 30).snapped, false, "把窗口调到 30ms 就不吸了");
});

test("gearAngle：锁定时落在 -180..180，未锁定时为 0", () => {
  const { pll } = feedBeats({ bpm: 120, frames: 240 });
  for (const dt of [0, 100, 250, 400, 500]) {
    const a = bt.gearAngle(pll, pll.anchor + dt);
    assert.ok(a >= -180 && a <= 180, `转角 ${a} 必须在 -180..180`);
  }
  assert.equal(bt.gearAngle(bt.createPll(), 500), 0);
});

/* ==========================================================================
   6. 示波器几何
   ========================================================================== */
test("layoutOf：画布再小也给出正的绘图区，且不越界", () => {
  for (const [w, h] of [[1, 1], [320, 120], [1045, 308], [2560, 1440]]) {
    const L = sc.layoutOf(w, h);
    assert.ok(L.plotW > 0 && L.plotH > 0, `${w}×${h} 的绘图区必须为正`);
    assert.equal(L.right, L.left + L.plotW);
    assert.equal(L.bottom, L.top + L.plotH);
    assert.ok(L.midY > L.top && L.midY < L.bottom, "基线必须在绘图区里");
    assert.ok(L.ampH > 0 && L.fluxH > 0 && L.centH > 0);
  }
});

test("xAt：左端 = t0，右端 = t0+span，单调不减且被钳在画布内", () => {
  const L = sc.layoutOf(1000, 300);
  const t0 = 10_000;
  const span = bt.SPAN_MS;
  assert.equal(sc.xAt(L, t0, t0, span), L.left);
  assert.equal(sc.xAt(L, t0 + span, t0, span), L.right);
  let prev = -1;
  for (let i = 0; i <= 20; i += 1) {
    const x = sc.xAt(L, t0 + (span * i) / 20, t0, span);
    assert.ok(x >= prev, "时间越晚 x 越大");
    prev = x;
  }
  assert.equal(sc.xAt(L, t0 - 5000, t0, span), L.left, "过去的样本被钳在左边界");
  assert.equal(sc.xAt(L, t0 + span + 5000, t0, span), L.right, "未来的样本被钳在右边界");
  assert.equal(sc.xAtRaw(L, t0 - span, t0, span), L.left - L.plotW, "原始映射不钳（元素要能跑到窗口外）");
});

test("yEnv / yCent / yFlux：单调、有界、端点正确", () => {
  const L = sc.layoutOf(1000, 300);
  assert.equal(sc.yEnv(L, 0), L.midY);
  assert.equal(sc.yEnv(L, 1), L.midY - L.ampH);
  assert.ok(sc.yEnv(L, 0.5) < sc.yEnv(L, 0.4), "能量越大越往上");
  assert.equal(sc.yEnv(L, 9), sc.yEnv(L, 1), "越界钳住");
  assert.equal(sc.yEnv(L, -9), sc.yEnv(L, 0));
  assert.equal(sc.yCent(L, 1), L.centTop);
  assert.equal(sc.yCent(L, 0), L.centTop + L.centH);
  assert.equal(sc.yFlux(L, 0), L.midY);
  assert.equal(sc.yFlux(L, 1), L.midY + L.fluxH);
  assert.ok(sc.yFlux(L, 0.5) < sc.yFlux(L, 1));
});

test("polylineOf：长度 2n、x 单调、y 都在画布里", () => {
  const L = sc.layoutOf(800, 260);
  const ring = bt.createRing(64);
  for (let i = 0; i < 30; i += 1) bt.ringPush(ring, i * 100, i / 30, 0.5, i / 60);
  const series = bt.createSeries(64);
  const n = bt.seriesInto(ring, 0, 10_000, series);
  series.n = n;
  const env = sc.polylineOf(series, L, 0, bt.SPAN_MS, "e");
  assert.equal(env.length, n * 2);
  for (let i = 0; i < n; i += 1) {
    const y = env[i * 2 + 1];
    assert.ok(y >= L.top && y <= L.bottom, `第 ${i} 点的 y=${y} 越界`);
    if (i > 0) assert.ok(env[i * 2] >= env[(i - 1) * 2], "x 必须单调不减");
  }
  const empty = sc.polylineOf(bt.createSeries(8), L, 0, bt.SPAN_MS, "e");
  assert.equal(empty.length, 0, "没有样本就什么都不画");
});

test("gridColumns：等分、落在绘图区里", () => {
  const L = sc.layoutOf(900, 300);
  const cols = sc.gridColumns(L, 8);
  assert.equal(cols.length, 8);
  for (let i = 0; i < cols.length; i += 1) {
    assert.ok(cols[i] > L.left && cols[i] < L.right, "刻度线必须在绘图区里");
    if (i > 0) assert.equal(bt.round(cols[i] - cols[i - 1], 6), bt.round(L.plotW / 8, 6));
  }
  assert.equal(sc.gridColumns(L, 0).length, 0);
});

test("winOf：x 的参考点与保留范围是两个区间（滑动窗口靠它错位）", () => {
  const win = sc.winOf(9000, bt.SPAN_MS, bt.SPAN_MS);
  assert.equal(win.refT, 9000);
  assert.equal(win.from, 9000 - bt.SPAN_MS, "往前多留一个周期");
  assert.equal(win.to, 9000 + bt.SPAN_MS * 2, "往后也多留一个周期");
  const pure = sc.winOf(9000, bt.SPAN_MS);
  assert.equal(pure.from, 9000);
  assert.equal(pure.to, 9000 + bt.SPAN_MS);
});

test("markXs：窗口外的拍点不画，x 在画布内，next 标出未来的那个", () => {
  const L = sc.layoutOf(1000, 300);
  const t0 = 10_000;
  const span = bt.SPAN_MS;
  const win = sc.winOf(t0, span);
  const beats = [t0 - 500, t0, t0 + 500, t0 + span, t0 + span + 500];
  const xs = sc.markXs(beats, L, win, t0 + 2000);
  assert.equal(xs.length, 3, "窗口外的两条被丢掉");
  for (const m of xs) assert.ok(m.x >= L.left && m.x <= L.right);
  assert.equal(xs[0].next, false, "已经过去的拍点 next=false");
  assert.equal(xs[1].next, false, "过去 2 秒的拍点也已经是过去式");
  assert.equal(xs[2].next, true, "还没发生的拍点 next=true");
  assert.equal(xs[2].x, L.right, "窗口右端的那一拍正好落在右边界");
});

test("markXs：x 用 refT 映射、保留范围用 from/to —— 双倍窗口里屏幕外的也留着", () => {
  const L = sc.layoutOf(1000, 300);
  const refT = 4000;
  const span = bt.SPAN_MS;
  const win = sc.winOf(refT, span, span);
  const beats = [refT - span, refT, refT + span, refT + span * 2];
  const xs = sc.markXs(beats, L, win);
  assert.equal(xs.length, 4, "双倍窗口里的四条都在（屏幕外的由容器 overflow:hidden 裁掉）");
  assert.equal(xs[0].x, L.left - L.plotW, "往前一个周期的拍点落在屏幕左外侧，位置仍然算得出来");
  assert.equal(xs[2].x, L.right, "refT+span 正好是右边界");
  assert.equal(xs[3].x, L.right + L.plotW, "再往后一个周期在屏幕右外侧");
  assert.equal(sc.markXs([refT - span - 1], L, win).length, 0, "超出保留范围的不要");
});

test("railTicks：吸附过的刻度落在拍点上，没吸附的保持原位", () => {
  const L = sc.layoutOf(1000, 300);
  const t0 = 10_000;
  const span = bt.SPAN_MS;
  const win = sc.winOf(t0, span);
  const beats = [t0 + 1000, t0 + 1500, t0 + 2000];
  const words = [t0 + 1040, t0 + 1650, t0 + 2010, Number.NaN, t0 - 100];
  const ticks = sc.railTicks(words, beats, L, win, bt.snapTime, 90);
  assert.equal(ticks.length, 3, "NaN 与窗口外的都不给");
  assert.equal(ticks[0].snapped, true);
  assert.equal(ticks[0].t, t0 + 1000);
  assert.equal(ticks[0].x, sc.xAt(L, t0 + 1000, t0, span));
  assert.equal(ticks[1].snapped, false);
  assert.equal(ticks[1].t, t0 + 1650, "差 150ms 的不许吸");
  assert.equal(ticks[2].snapped, true);
  assert.equal(ticks[2].delta, -10, "delta 为负表示往后推了 10ms");
  assert.equal(ticks[0].i, 0, "下标要带上（自检用它核对是哪一个字素）");
});

test("railTicks：没有 snapFn 时原样返回（scope 不认识 beat.js）", () => {
  const L = sc.layoutOf(600, 200);
  const ticks = sc.railTicks([100, 200], [], L, sc.winOf(0, bt.SPAN_MS), null, 90);
  assert.equal(ticks.length, 2);
  assert.equal(ticks[0].snapped, false);
  assert.equal(ticks[0].t, 100);
});

test("activityOf / glowOf：均值与峰值，空序列给 0", () => {
  const ring = bt.createRing(16);
  bt.ringPush(ring, 0, 0.2, 0, 0);
  bt.ringPush(ring, 10, 0.8, 0, 0);
  const s = bt.createSeries(16);
  s.n = bt.seriesInto(ring, 0, 100, s);
  assert.equal(bt.round(sc.activityOf(s), 6), 0.5);
  assert.equal(bt.round(sc.glowOf(s), 6), 0.8);
  assert.equal(sc.activityOf(null), 0);
  assert.equal(sc.glowOf(bt.createSeries(4)), 0);
});

test("mmss：mm:ss，负数与非数字都当 0", () => {
  assert.equal(sc.mmss(0), "00:00");
  assert.equal(sc.mmss(-500), "00:00");
  assert.equal(sc.mmss(Number.NaN), "00:00");
  assert.equal(sc.mmss(59_999), "00:59");
  assert.equal(sc.mmss(60_000), "01:00");
  assert.equal(sc.mmss(61_000), "01:01");
  assert.equal(sc.mmss(3_599_000), "59:59");
  assert.equal(sc.mmss(240_000), "04:00");
});

test("颜色：hexToRgb / rgba / normHex 都不产出坏值", () => {
  assert.deepEqual(sc.hexToRgb("#7cfc9b"), [124, 252, 155]);
  assert.deepEqual(sc.hexToRgb("#fff"), [255, 255, 255]);
  assert.deepEqual(sc.hexToRgb("nope", [1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(sc.hexToRgb(null, [4, 5, 6]), [4, 5, 6]);
  assert.equal(sc.rgba([1, 2, 3], 0.5), "rgba(1,2,3,0.5)");
  assert.equal(sc.normHex("#aabbcc", "#000"), "#aabbcc");
  assert.equal(sc.normHex("not-a-color", "#000"), "#000");
  assert.equal(sc.normHex(undefined, "#111"), "#111");
});

/* ==========================================================================
   7. 契约纪律（静态扫描）
   ========================================================================== */
test("包结构齐全（清单 / 入口 / 样式 / 图标 / 子模块 / README / 自检）", () => {
  for (const f of [
    "skin.json",
    "skin.js",
    "skin.css",
    "assets/icon.svg",
    "lib/beat.js",
    "lib/scope.js",
    "README.md",
    "tests/pulse-logic.test.js",
    "tests/pulse-check.mjs",
  ]) {
    assert.ok(existsSync(path.join(PKG, f)), `缺 ${f}`);
  }
  const icon = readFileSync(path.join(PKG, "assets/icon.svg"), "utf8");
  assert.match(icon, /<svg/);
  assert.ok(icon.length > 200, "图标不能是空壳");
  const tests = readdirSync(path.join(PKG, "tests"));
  assert.deepEqual(tests.sort(), ["pulse-check.mjs", "pulse-logic.test.js"]);
});

test("清单：order ≥ 200 / apiVersion 3.0 / 三项配色 / 帧预算", () => {
  assert.equal(MANIFEST.id, "pulse");
  assert.equal(MANIFEST.apiVersion, "3.0");
  assert.ok(MANIFEST.order >= 200, "第三方样式的 order 必须 ≥ 200");
  assert.equal(MANIFEST.order, 250);
  assert.equal(MANIFEST.entry, "skin.js");
  assert.deepEqual(MANIFEST.styles, ["skin.css"]);
  assert.equal(MANIFEST.capabilities.spectrum, true);
  assert.equal(MANIFEST.capabilities.background, false, "这一款不声明整窗背景层");
  assert.equal(MANIFEST.capabilities.interactive, true);
  for (const k of ["bg", "fg", "accent"]) {
    assert.match(MANIFEST.colors[k], /^#[0-9a-f]{6}$/i, `colors.${k} 必须是六位十六进制`);
  }
  assert.equal(MANIFEST.performance.budgetFps, 60);
});

test("零项目依赖：只有包内相对路径的子模块 import，且透传 ?t=", () => {
  const specifiers = [...SKIN_JS.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(specifiers, [], "skin.js 不该有静态 import");
  assert.equal((SKIN_JS.match(/import\(/g) || []).length >= 1, true);
  assert.match(SKIN_JS, /new URL\(import\.meta\.url\)\.search/);
  assert.match(SKIN_JS, /import\(`\.\/lib\/\$\{file\}\$\{Q\}`\)/);
  for (const bad of ["../", "player-skins", "store.js", "utils.js"]) {
    assert.ok(!SKIN_JS.includes(`"${bad}`) && !SKIN_JS.includes(`'${bad}`), `不许 import ${bad}`);
  }
});

test("子模块自己不 import 任何东西（静态 import 会绕开 ?t= token）", () => {
  for (const f of ["lib/beat.js", "lib/scope.js"]) {
    const src = readFileSync(path.join(PKG, f), "utf8");
    assert.deepEqual([...src.matchAll(/^\s*import\s/gm)], [], `${f} 里不许有 import`);
    assert.ok(!/\bdocument\b/.test(src), `${f} 必须是纯逻辑（不碰 DOM）`);
    assert.ok(!/\bwindow\b/.test(src), `${f} 必须是纯逻辑（不碰 window）`);
  }
});

test("越权 API：fetch / eval / 定时器 / 存储 / Worker 一个都不许有", () => {
  for (const bad of [
    /\bfetch\s*\(/,
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
    /\bsetInterval\s*\(/,
    /\bXMLHttpRequest\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bWorker\b/,
  ]) {
    assert.ok(!bad.test(SKIN_JS), `不许出现 ${bad}`);
  }
  assert.match(SKIN_JS, /\bsetTimeout\s*\(/, "只允许 setTimeout（防抖上报）");
});

test("ctx.* 白名单：只用契约里有的成员", () => {
  const allowed = new Set([
    "root",
    "backgroundRoot",
    "sdk",
    "themeId",
    "mode",
    "interactive",
    "playback",
    "media",
    "track",
    "lyrics",
    "covers",
    "options",
    "env",
    "spectrum",
    "actions",
  ]);
  const src = SKIN_JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const used = new Set([...src.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  for (const name of used) assert.ok(allowed.has(name), `ctx.${name} 不在契约里`);
  const stUsed = new Set([...src.matchAll(/\bst\.ctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  for (const name of stUsed) assert.ok(allowed.has(name), `st.ctx.${name} 不在契约里`);
  assert.ok(used.size >= 5, "确认真的扫到了 ctx 用法");
});

test("声明 background:false → 一个字节都不碰 backgroundRoot", () => {
  const src = SKIN_JS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/backgroundRoot/.test(src), "清单里 background:false，就不该引用 backgroundRoot");
  const cssNoComments = SKIN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/skin-bg|rbbg|drbg|spbg|skbg/.test(cssNoComments), "CSS 里也不该出现背景层的类名");
});

test("CSS 纪律：不给宿主壳写前缀 / 不用 !important / 不写 :root 与裸标签 / 不用 filter", () => {
  const css = SKIN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/!important/.test(css), "不许用 !important");
  assert.ok(!/:root/.test(css), "不许写 :root");
  assert.ok(!/\.playerview\[/.test(css), "不许写 .playerview[data-skin=…] 前缀（宿主会包 @scope）");
  assert.ok(!/^\s*(html|body|\*)\s*[,{]/m.test(css), "不许写 html / body / *");
  assert.ok(!/filter\s*:/.test(css), "这一款不用 filter（扫描线用纯渐变画）");
  // 每条规则的选择器都必须以 .pl 开头（@keyframes 的关键帧步进除外）
  const selLines = css
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith("{") && !l.startsWith("@"));
  assert.ok(selLines.length > 20, `确认真的扫到了选择器（${selLines.length} 条）`);
  for (const l of selLines) {
    const sel = l.slice(0, -1).trim();
    if (/^(from|to|\d+(\.\d+)?%)$/.test(sel)) continue; // 关键帧步进
    for (const part of sel.split(",")) {
      assert.ok(part.trim().startsWith(".pl"), `选择器 ${part.trim()} 不是相对舞台根的`);
    }
  }
  assert.match(css, /@keyframes pl-spin/, "齿轮转速用 CSS animation（不写每帧角度）");
});

test("只有一条 rAF：皮肤自己不额外开循环（SDK 的平滑推进被关掉）", () => {
  const calls = [...SKIN_JS.matchAll(/requestAnimationFrame\(/g)].length;
  assert.ok(calls <= 3, `requestAnimationFrame 只该出现在 wake/frame 里，实际 ${calls} 处`);
  assert.match(SKIN_JS, /cancelAnimationFrame/);
  assert.match(SKIN_JS, /setPosition\([^)]*\{[^}]*playing:\s*false[^}]*\}/, "每帧自己喂位置，SDK 不开循环");
  assert.ok(!/st\.view\.setPlaying/.test(SKIN_JS), "皮肤不调 view.setPlaying");
});

test("destroy 的清理清单：帧循环 / 定时器 / 歌词视图 / 监听器 / 挂载点", () => {
  const body = SKIN_JS.slice(SKIN_JS.indexOf("function destroySkin"));
  assert.match(body, /stop\(st\)/, "停帧");
  assert.match(body, /clearTimeout\(st\.backdropTimer\)/, "清防抖定时器");
  assert.match(body, /st\.view\.destroy\(\)/, "销毁 SDK 歌词视图");
  assert.match(body, /removeEventListener\("click", st\.onClick\)/, "摘掉点击监听");
  assert.match(body, /st\.elRoot\.remove\(\)/, "摘掉自己的挂载点");
  assert.match(body, /st\.alive = false/);
});
