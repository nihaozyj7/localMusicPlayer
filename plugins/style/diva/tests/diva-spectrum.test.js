/* ==========================================================================
   diva-spectrum.test.js — 频谱分析器「纯逻辑」单测
   --------------------------------------------------------------------------
   被测模块：../lib/spectrum.js（不碰宿主任何模块，node --test 直接跑）：

     node --test "plugins/style/diva/tests/diva-spectrum.test.js"

   ★ 本会话沙箱禁止「带管道 stdio 的子进程」，`node --test` 默认会给每个
     测试文件 spawn 一个子进程（报 spawn EPERM）。所以实际命令是：

     node --experimental-test-isolation=none --test \
       "plugins/style/diva/tests/diva-spectrum.test.js"

   覆盖：
     1. 初始 / 静音状态是「全 0」，read() 字段完整且对象复用；
     2. 低频 bins 高 → low 显著大于 high；高频 → 频谱质心右移；
     3. 起音快 / 释放慢（一帧上升的幅度远大于一帧下降的幅度）；
     4. 持续音不产生连续 beat；脉冲流产生 beat，且冷却挡住过密的第二记；
     5. 同一条 snapshot（at 相同）不重复计通量；
     6. null 输入平滑衰减、静音后落到 0，全程不出 NaN；
     7. 脏样本（NaN / Infinity / 越界）不出 NaN；reset() 清零。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import { createAnalyser } from "../lib/spectrum.js";

/** 宿主固定给 128 段 */
const N = 128;
const FRAME = 1000 / 60;

/** 构造一条 128 段谱：function / 数组 / 标量都支持 */
function bandsOf(value) {
  const out = new Float32Array(N);
  if (typeof value === "function") {
    for (let i = 0; i < N; i += 1) out[i] = value(i);
  } else if (value && typeof value.length === "number") {
    for (let i = 0; i < N && i < value.length; i += 1) out[i] = value[i];
  } else {
    out.fill(Number(value) || 0);
  }
  return out;
}

/** 一条样本（at = 采样时刻） */
function snap(value, at) {
  return { bands: bandsOf(value), at };
}

/**
 * 连续喂 frames 帧（每帧一条新样本，at 递增）。
 * @param {any} a createAnalyser() 的返回
 * @param {number} frames
 * @param {(frame:number, at:number)=>any} valueFn 每帧的谱
 * @param {{stepMs?:number, startAt?:number}} [opts]
 */
function feedStream(a, frames, valueFn, opts = {}) {
  const stepMs = Number(opts.stepMs) || FRAME;
  let at = Number(opts.startAt) || 0;
  for (let f = 0; f < frames; f += 1) {
    at += stepMs;
    a.update(snap(valueFn(f, at), at), at);
  }
  return a.read();
}

/** 检查状态里所有标量都是有限数且落在 0..1（at / beats 除外） */
function assertSane(state, label) {
  const unit = ["low", "mid", "high", "vocal", "energy", "centroid", "flux", "beat", "beatPhase"];
  for (const key of unit) {
    const v = state[key];
    assert.equal(Number.isFinite(v), true, `${label}: ${key} 不是有限数（${v}）`);
    assert.ok(v >= 0 && v <= 1, `${label}: ${key} 越界（${v}）`);
  }
  assert.equal(Number.isFinite(state.at), true, `${label}: at 不是有限数`);
  assert.equal(Number.isInteger(state.beats), true, `${label}: beats 不是整数`);
  for (let i = 0; i < state.bands.length; i += 1) {
    const v = state.bands[i];
    assert.equal(Number.isFinite(v), true, `${label}: bands[${i}] 不是有限数`);
    assert.ok(v >= 0 && v <= 1, `${label}: bands[${i}] 越界（${v}）`);
  }
}

/* --------------------------------------------------------------------------
   1. 初始态与 read() 契约
   -------------------------------------------------------------------------- */

test("初始状态：字段完整、全 0、bands 是复用的 Float32Array", () => {
  const a = createAnalyser({ bands: 128 });
  const s = a.read();

  for (const key of [
    "ready",
    "bands",
    "low",
    "mid",
    "high",
    "vocal",
    "energy",
    "centroid",
    "flux",
    "beat",
    "beatPhase",
    "beats",
    "at",
  ]) {
    assert.ok(key in s, `SpectrumState 缺少字段 ${key}`);
  }
  assert.equal(s.ready, false, "还没样本时 ready 必须是 false");
  assert.ok(s.bands instanceof Float32Array, "bands 必须是 Float32Array");
  assert.equal(s.bands.length, 128, "bands 必须是 128 段");
  assert.equal(s.bands.every((v) => v === 0), true, "初始逐段值必须全 0");
  assert.equal(s.energy, 0);
  assert.equal(s.beats, 0);

  // read() 复用同一个对象、bands 复用同一个数组（帧循环里零分配）
  assert.equal(a.read(), s, "read() 必须返回同一个对象");
  assert.equal(a.read().bands, s.bands, "read().bands 必须返回同一个数组");
});

test("静音输入：喂满一段时间后仍然全 0，且 ready 变 true", () => {
  const a = createAnalyser();
  const s = feedStream(a, 120, () => 0);

  assert.equal(s.ready, true, "已经吃到过样本，ready 应为 true");
  assert.equal(s.bands.every((v) => v === 0), true, "静音时逐段值必须全 0");
  assert.equal(s.low, 0);
  assert.equal(s.mid, 0);
  assert.equal(s.high, 0);
  assert.equal(s.vocal, 0);
  assert.equal(s.energy, 0);
  assert.equal(s.centroid, 0, "全静音时质心取 0");
  assert.equal(s.flux, 0);
  assert.equal(s.beat, 0);
  assert.equal(s.beats, 0, "静音不该有拍");
  assertSane(s, "静音");
});

/* --------------------------------------------------------------------------
   2. 频段聚合与频谱质心
   -------------------------------------------------------------------------- */

test("低频 bins 高：low 显著大于 high，energy 大于 0", () => {
  const a = createAnalyser();
  const s = feedStream(a, 100, () => (i) => (i < 24 ? 0.8 : 0));

  assert.ok(s.low > 0.5, `低频段均值应显著抬高（实际 ${s.low.toFixed(3)}）`);
  assert.ok(s.high < 0.02, `高频段应接近 0（实际 ${s.high.toFixed(3)}）`);
  assert.ok(s.low > s.high * 10, "low 必须显著大于 high");
  assert.ok(s.energy > 0.05, "总能量应大于 0");
  assert.ok(s.vocal >= 0 && s.vocal <= 1);
  assertSane(s, "低频");
});

test("高频 bins 高：频谱质心明显右移", () => {
  const low = createAnalyser();
  const lowState = feedStream(low, 100, () => (i) => (i < 24 ? 0.8 : 0));

  const high = createAnalyser();
  const highState = feedStream(high, 100, () => (i) => (i >= 116 ? 0.8 : 0));

  assert.ok(lowState.centroid < 0.2, `低频流的质心应靠左（实际 ${lowState.centroid.toFixed(3)}）`);
  assert.ok(highState.centroid > 0.8, `高频流的质心应靠右（实际 ${highState.centroid.toFixed(3)}）`);
  assert.ok(highState.centroid > lowState.centroid + 0.5, "高频流的质心必须明显右移");
  assertSane(lowState, "低频质心");
  assertSane(highState, "高频质心");
});

/* --------------------------------------------------------------------------
   3. 起音快 / 释放慢
   -------------------------------------------------------------------------- */

test("起音快、释放慢：一帧上升幅度远大于一帧下降幅度", () => {
  // 从 0 一帧上到 0.8
  const rise = createAnalyser();
  rise.update(snap(0.8, FRAME), FRAME);
  const firstJump = rise.read().bands[0];
  assert.ok(firstJump > 0.25, `起音第一帧就该抬起（实际 ${firstJump.toFixed(3)}）`);

  // 饱到 0.8 之后一帧落回 0
  const fall = createAnalyser();
  let at = 0;
  for (let i = 0; i < 100; i += 1) {
    at += FRAME;
    fall.update(snap(0.8, at), at);
  }
  const full = fall.read().bands[0];
  assert.ok(full > 0.78, `持续输入应接近 0.8（实际 ${full.toFixed(3)}）`);
  at += FRAME;
  fall.update(snap(0, at), at);
  const afterOneFrame = fall.read().bands[0];
  const drop = full - afterOneFrame;
  assert.ok(afterOneFrame > 0.6, `释放第一帧不该掉太狠（实际 ${afterOneFrame.toFixed(3)}）`);
  assert.ok(
    firstJump > drop * 2.5,
    `起音一帧上升 ${firstJump.toFixed(3)} 应远大于释放一帧下降 ${drop.toFixed(3)}`
  );
});

/* --------------------------------------------------------------------------
   4. 节拍检测：持续音不连打、脉冲能打、冷却生效
   -------------------------------------------------------------------------- */

test("持续音不产生连续 beat", () => {
  const a = createAnalyser();
  const s = feedStream(a, 180, () => 0.5);
  assert.equal(s.beats, 0, `恒定能量不该被判成节拍（实际 ${s.beats} 记）`);
});

test("脉冲流产生 beat，且自适应阈值能持续命中", () => {
  const a = createAnalyser();
  let at = 0;
  // 先建立基线（第一帧不算起音，避免「开机即一拍」）
  for (let i = 0; i < 3; i += 1) {
    at += FRAME;
    a.update(snap(0.04, at), at);
  }
  // 6 个脉冲，间隔 500ms（30 帧）
  for (let c = 0; c < 6; c += 1) {
    at += FRAME;
    a.update(snap(0.9, at), at);
    for (let i = 0; i < 29; i += 1) {
      at += FRAME;
      a.update(snap(0.04, at), at);
    }
  }
  const s = a.read();
  assert.ok(s.beats >= 4, `6 个 500ms 间隔的脉冲至少该打出 4 记（实际 ${s.beats}）`);
  assert.ok(s.beat >= 0 && s.beat <= 1);
  assert.ok(s.beatPhase >= 0 && s.beatPhase <= 1);
  assertSane(s, "脉冲");
});

test("冷却生效：过密的第二记脉冲被挡住", () => {
  const a = createAnalyser();
  let at = 0;
  for (let i = 0; i < 3; i += 1) {
    at += FRAME;
    a.update(snap(0.04, at), at);
  }
  // 第一记（正常命中）
  at += FRAME;
  a.update(snap(0.9, at), at);
  assert.equal(a.read().beats, 1, "第一记脉冲应当命中");

  // 40ms 后第二记：还在 200ms 冷却里 → 不允许再记
  at += FRAME;
  a.update(snap(0.04, at), at);
  at += FRAME;
  a.update(snap(0.9, at), at);
  assert.equal(a.read().beats, 1, "冷却期内的第二记必须被挡住");

  // 等过冷却再打一记：应当正常命中
  at += 400;
  a.update(snap(0.04, at), at);
  at += FRAME;
  a.update(snap(0.9, at), at);
  assert.equal(a.read().beats, 2, "冷却结束后的脉冲应当再次命中");
});

/* --------------------------------------------------------------------------
   5. 同一条 snapshot 不重复计通量
   -------------------------------------------------------------------------- */

test("同一条 snapshot（at 相同）不重复计通量、不推进平滑", () => {
  const a = createAnalyser();
  let at = 0;
  at += FRAME;
  a.update(snap(0.04, at), at);

  const loud = snap(0.9, (at += FRAME));
  assert.equal(a.update(loud, at), true, "第一条新样本应返回 true");
  const first = a.read();
  const flux = first.flux;
  const beats = first.beats;
  const bandsSnapshot = Array.from(first.bands);

  for (let i = 0; i < 8; i += 1) {
    at += FRAME;
    assert.equal(a.update(loud, at), false, "同一条样本（at 相同）必须返回 false");
  }
  const after = a.read();
  assert.equal(after.flux, flux, "同一 snapshot 不该再计一次通量");
  assert.equal(after.beats, beats, "同一 snapshot 不该再判一次节拍");
  assert.deepEqual(Array.from(after.bands), bandsSnapshot, "同一 snapshot 不该推进逐段平滑");
});

/* --------------------------------------------------------------------------
   6. null 输入：平滑衰减到 0、不出 NaN
   -------------------------------------------------------------------------- */

test("null 输入：平滑衰减到 0，全程不出 NaN", () => {
  const a = createAnalyser();
  let at = feedStream(a, 80, () => 0.8).at;

  // 先确认已经抬起来
  assert.ok(a.read().energy > 0.7, "衰减前应处于高能量");

  // 平滑衰减的前 10 帧：能量下降但仍大于 0（不能瞬间归零）
  at += FRAME;
  a.update(null, at);
  const early = a.read();
  assert.ok(early.energy > 0, "第一帧 null 不该瞬间归零");
  assert.ok(early.energy < 0.79, "第一帧 null 就应开始下降");
  assertSane(early, "衰减早期");

  // 继续衰减 4 秒：必须完整落到 0
  for (let i = 0; i < 240; i += 1) {
    at += FRAME;
    assert.equal(a.update(null, at), false, "null 输入应返回 false");
  }
  const s = a.read();
  assertSane(s, "衰减后");
  assert.equal(s.energy, 0, `静音衰减完能量应归 0（实际 ${s.energy}）`);
  assert.equal(s.bands.every((v) => v === 0), true, "静音衰减完逐段值应归 0");
  assert.equal(s.flux, 0);
  assert.equal(s.beat, 0);
});

/* --------------------------------------------------------------------------
   7. 脏数据与 reset
   -------------------------------------------------------------------------- */

test("脏样本（NaN / Infinity / 越界）不得让输出出现 NaN", () => {
  const a = createAnalyser();
  const dirty = [Number.NaN, Infinity, -Infinity, -3, 2.5, 0.5, undefined, "x"];
  const s = feedStream(a, 60, (f) => dirty[f % dirty.length]);
  assertSane(s, "脏样本");
  assert.equal(s.ready, true);
});

test("reset()：回到初始状态（全 0、ready=false）", () => {
  const a = createAnalyser();
  feedStream(a, 80, () => 0.7);
  assert.equal(a.read().energy > 0.5, true);

  a.reset();
  const s = a.read();
  assert.equal(s.ready, false);
  assert.equal(s.energy, 0);
  assert.equal(s.beats, 0);
  assert.equal(s.beat, 0);
  assert.equal(s.flux, 0);
  assert.equal(s.at, 0);
  assert.equal(s.bands.every((v) => v === 0), true);
  assertSane(s, "reset 后");

  // reset 之后重新喂样本仍然正常工作
  const s2 = feedStream(a, 40, () => 0.6);
  assert.equal(s2.ready, true);
  assert.ok(s2.energy > 0.3);
});
