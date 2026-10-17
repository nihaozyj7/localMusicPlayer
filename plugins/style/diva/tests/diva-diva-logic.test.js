/* ==========================================================================
   diva-diva-logic.test.js — 「星轨歌姬」人物模块的纯逻辑自检
   --------------------------------------------------------------------------
   这份测试属于**样式包自己**（plugins/style/diva/tests/），不 import 播放器
   项目的任何模块，可以在仓库外单独跑：

     node --test "plugins/style/diva/tests/diva-diva-logic.test.js"

   ★ 本会话沙箱禁止「带管道 stdio 的子进程」，而 node --test 默认会为每个
     用例 spawn 子进程（报 spawn EPERM，不是用例失败）。改造方式：让测试在
     当前进程内跑 ——

     node --experimental-test-isolation=none --test "plugins/style/diva/tests/diva-diva-logic.test.js"
     node plugins/style/diva/tests/diva-diva-logic.test.js

   覆盖六块：
     1. computePose 的确定性 / 值域 / 不修改入参、不抛异；
     2. 口型：播放 + 人声大 → 张开；暂停 / 频谱未就绪 → 收敛到 0；
     3. 眨眼：确定性时间表，单次时长 ≈ TIMING.blinkMs，间隔落在 2.4~6.4s；
     4. reduced：所有位移量精确为 0，且两次不同 t 的画面**逐调用一致**；
     5. 假 CanvasRenderingContext2D：draw 不抛、save/restore 配平、
        所有数值参数有限、单帧绘制调用 < 400、单位空间 transform 正确；
     6. 静态扫描源码：没有浏览器全局 / 网络 / 计时器 / 真随机 / 整屏模糊 /
        图片素材 / 静态 import（子模块必须透传 token）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { computePose, createDiva, blinkAt, DIVA_UNIT, POSE_KEYS } from "../lib/diva.js";
import { TIMING } from "../lib/config.js";

/* --------------------------------------------------------------------------
   帧对象工厂（与 entry 传给 draw 的冻结形状一致）
   -------------------------------------------------------------------------- */

const LAYOUT = {
  w: 1280,
  h: 820,
  cx: 640,
  baseY: 547,
  divaH: 410,
  divaW: 180,
  haloX: 640,
  haloY: 317,
  haloR: 205,
  lyricW: 880,
  horizon: 0.667,
  narrow: false,
  tiny: false,
};

const PALETTE = {
  bg: "#05060f",
  fg: "#eaf6ff",
  accent: "#57e6ff",
  cyan: "#57e6ff",
  violet: "#9b7bff",
  pink: "#ff7ad9",
};

function frame(over = {}) {
  return {
    w: 1280,
    h: 820,
    dpr: 1,
    t: 0,
    dt: 1 / 60,
    now: 0,
    layout: LAYOUT,
    playing: false,
    pos: 0,
    duration: 0,
    progress: 0,
    lyricIndex: -1,
    reduced: false,
    perf: false,
    narrow: false,
    tiny: false,
    palette: { ...PALETTE },
    spec: null,
    beat: 0,
    energy: 0,
    ...over,
  };
}

/** 一份「就绪」的频谱快照（字段与 lib/spectrum.js 的 read() 对齐） */
function readySpec(over = {}) {
  return {
    ready: true,
    bands: new Float32Array(128),
    low: 0.82,
    mid: 0.55,
    high: 0.48,
    vocal: 0.86,
    energy: 0.66,
    centroid: 0.5,
    flux: 0.2,
    beat: 0.55,
    beatPhase: 0.2,
    beats: 7,
    at: 1234,
    ...over,
  };
}

/* --------------------------------------------------------------------------
   假 CanvasRenderingContext2D：记录每一次方法调用
   -------------------------------------------------------------------------- */

/** 真正"落笔"的调用（路径点不算绘制调用，与性能预算口径一致） */
const PAINT = new Set(["fill", "stroke", "fillRect", "strokeRect", "fillText", "strokeText", "drawImage", "putImageData"]);

function fakeCtx() {
  const calls = []; // { name, args }
  const paints = []; // 只记落笔调用
  const bad = []; // 非有限数值参数
  let depth = 0;
  let maxDepth = 0;
  let saves = 0;
  let restores = 0;

  const log = (name) => (...args) => {
    calls.push({ name, args });
    if (name === "save") {
      saves += 1;
      depth += 1;
      if (depth > maxDepth) maxDepth = depth;
    } else if (name === "restore") {
      restores += 1;
      depth -= 1;
    }
    if (PAINT.has(name)) paints.push({ name, args });
    for (const a of args) {
      if (typeof a === "number" && !Number.isFinite(a)) bad.push({ name, args });
    }
  };
  const noop = (name) => log(name);

  const ctx = {
    canvas: { width: 1280, height: 820 },
    // 属性由绘制代码写入，这里只作为可写字段存在（真实 context 会做解析）
    fillStyle: "#000",
    strokeStyle: "#000",
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    save: log("save"),
    restore: log("restore"),
    translate: log("translate"),
    scale: log("scale"),
    rotate: log("rotate"),
    beginPath: noop("beginPath"),
    closePath: noop("closePath"),
    moveTo: log("moveTo"),
    lineTo: log("lineTo"),
    quadraticCurveTo: log("quadraticCurveTo"),
    bezierCurveTo: log("bezierCurveTo"),
    arc: log("arc"),
    ellipse: log("ellipse"),
    rect: log("rect"),
    fill: log("fill"),
    stroke: log("stroke"),
    fillRect: log("fillRect"),
    strokeRect: log("strokeRect"),
    clearRect: log("clearRect"),
    setLineDash: log("setLineDash"),
    clip: noop("clip"),
    createLinearGradient: (...args) => {
      log("createLinearGradient")(...args);
      return {
        addColorStop: (offset, color) => log("addColorStop")(offset, color),
      };
    },
    createRadialGradient: (...args) => {
      log("createRadialGradient")(...args);
      return {
        addColorStop: (offset, color) => log("addColorStop")(offset, color),
      };
    },
  };

  return {
    ctx,
    calls,
    paints,
    bad,
    get saves() {
      return saves;
    },
    get restores() {
      return restores;
    },
    get depth() {
      return depth;
    },
    get maxDepth() {
      return maxDepth;
    },
  };
}

/* ==========================================================================
   1. computePose：确定性 / 值域 / 不污染入参
   ========================================================================== */

test("POSE_KEYS / DIVA_UNIT：接口常量与文档一致", () => {
  assert.equal(DIVA_UNIT, 1000, "单位空间高 1000");
  assert.deepEqual([...POSE_KEYS].sort(), [
    "armLift",
    "blink",
    "breath",
    "eyeOpen",
    "glow",
    "hairPhase",
    "headBob",
    "headTilt",
    "mouth",
    "pulse",
    "sway",
  ]);
});

test("computePose：同一帧对象永远同输出，且不修改入参", () => {
  const f = frame({ t: 3.2, now: 9000, playing: true, spec: readySpec(), beat: 0.7, energy: 0.5 });
  const snapshot = structuredClone(f); // 保留 Float32Array，深比较才准
  const a = computePose(f);
  const b = computePose(f);
  const c = computePose({ ...f, palette: { ...f.palette }, spec: { ...f.spec } });

  assert.deepEqual(a, b, "同一对象两次调用必须逐字段相等");
  assert.deepEqual(a, c, "等价的另一帧对象也必须得到同一姿态");
  assert.deepEqual(f, snapshot, "computePose 不允许修改入参");

  for (const key of POSE_KEYS) {
    assert.ok(Number.isFinite(a[key]), `${key} 必须是有限数，实际是 ${a[key]}`);
  }
});

test("computePose：值域合理（摆动 ≤ 3°、口型/眨眼/亮度都在 0..1）", () => {
  let checked = 0;
  for (let i = 0; i < 64; i += 1) {
    const f = frame({
      t: i * 0.37,
      now: 12000 + i * 130,
      playing: i % 2 === 0,
      spec: i % 3 === 0 ? null : readySpec({ low: (i % 5) / 4, vocal: (i % 7) / 6, high: (i % 4) / 3 }),
      beat: ((i * 7) % 10) / 10,
    });
    const pose = computePose(f);
    assert.ok(Math.abs(pose.sway) <= 3, `sway=${pose.sway}`);
    assert.ok(Math.abs(pose.headTilt) <= 4, `headTilt=${pose.headTilt}`);
    assert.ok(Math.abs(pose.headBob) <= 12, `headBob=${pose.headBob}`);
    for (const key of ["breath", "mouth", "blink", "armLift", "glow", "pulse", "eyeOpen"]) {
      assert.ok(pose[key] >= 0 && pose[key] <= 1, `${key}=${pose[key]} 越界`);
    }
    checked += 1;
  }
  assert.equal(checked, 64);
});

test("待机：呼吸 / 摆身 / 发丝相位随 t 变化（不是一帧静止图）", () => {
  const a = computePose(frame({ t: 0, now: 1000 }));
  const b = computePose(frame({ t: 1.15, now: 2150 }));
  assert.notEqual(a.breath, b.breath, "呼吸要有起伏");
  assert.notEqual(a.sway, b.sway, "身体要有摆动");
  assert.notEqual(a.hairPhase, b.hairPhase, "发丝相位要推进");
  assert.notEqual(a.breath, a.sway, "不同量之间不应被写成同一个值");
});

/* ==========================================================================
   2. 口型：播放 + 人声大 → 张开；暂停 / 未就绪 → 0
   ========================================================================== */

test("口型：播放且人声大时张开，暂停时归零", () => {
  const loud = readySpec({ vocal: 0.9 });
  const singing = computePose(frame({ playing: true, spec: loud, t: 1 }));
  assert.ok(singing.mouth > 0.2, `播放 + 高 vocal 时 mouth 应明显 > 0，实际 ${singing.mouth}`);

  const paused = computePose(frame({ playing: false, spec: loud, t: 1 }));
  assert.equal(paused.mouth, 0, "暂停时嘴必须闭合");

  const notReady = computePose(frame({ playing: true, spec: { ready: false, vocal: 0.9 }, t: 1 }));
  assert.equal(notReady.mouth, 0, "频谱未就绪时嘴闭合");

  const noSpec = computePose(frame({ playing: true, spec: null, t: 1 }));
  assert.equal(noSpec.mouth, 0, "没有频谱时嘴闭合");

  const quiet = computePose(frame({ playing: true, spec: readySpec({ vocal: 0.05 }), t: 1 }));
  assert.ok(quiet.mouth < 0.02, `安静的段落不应该明显张嘴，实际 ${quiet.mouth}`);

  const softer = computePose(frame({ playing: true, spec: readySpec({ vocal: 0.55 }), t: 1 }));
  const louder = computePose(frame({ playing: true, spec: readySpec({ vocal: 1 }), t: 1 }));
  assert.ok(louder.mouth > softer.mouth, "口型要随人声强度单调增大");
  assert.ok(louder.mouth >= singing.mouth, "高音区到底后保持最大张口，不能反向收小");
});

test("人声让头微仰（headBob 更负），暂停时不参与", () => {
  const base = frame({ playing: true, t: 2.2, spec: readySpec({ vocal: 0 }) });
  const lifted = frame({ playing: true, t: 2.2, spec: readySpec({ vocal: 0.9 }) });
  assert.ok(computePose(lifted).headBob < computePose(base).headBob, "人声应把头抬起来");

  const paused = computePose(frame({ playing: false, t: 2.2, spec: readySpec({ vocal: 0.9 }) }));
  const pausedQuiet = computePose(frame({ playing: false, t: 2.2, spec: readySpec({ vocal: 0 }) }));
  assert.equal(paused.headBob, pausedQuiet.headBob, "暂停后频谱不再影响头部");
});

/* ==========================================================================
   3. 眨眼：确定性时间表 + 时长 / 间隔
   ========================================================================== */

test("眨眼：时间表确定性、单次 ≈ blinkMs、间隔落在 2.4~6.4s", () => {
  // 时间轴上逐点采样（步长 2ms），找出每一次眨眼
  const windows = [];
  let open = null;
  let previous = 0;
  const step = 2;
  const limit = 30000;
  for (let now = 0; now <= limit; now += step) {
    const v = blinkAt(now);
    assert.ok(v >= 0 && v <= 1, `blinkAt(${now})=${v} 越界`);
    if (v > 0.02 && open === null) open = now;
    if (v <= 0.02 && open !== null) {
      windows.push({ from: open, to: now - step, peak: previous });
      open = null;
    }
    previous = Math.max(previous, v);
    if (v <= 0.02) previous = 0;
  }

  assert.ok(windows.length >= 4, `30s 内至少应眨眼 4 次，实际 ${windows.length} 次`);

  for (let i = 0; i < windows.length; i += 1) {
    const w = windows[i];
    const duration = w.to - w.from + step;
    assert.ok(
      duration >= TIMING.blinkMs - 20 && duration <= TIMING.blinkMs + 20,
      `第 ${i} 次眨眼时长 ${duration}ms 应接近 ${TIMING.blinkMs}ms`
    );
    if (i > 0) {
      const gap = windows[i].from - windows[i - 1].from;
      assert.ok(
        gap >= TIMING.blinkMinMs - step && gap <= TIMING.blinkMaxMs + step,
        `第 ${i} 次眨眼间隔 ${gap}ms 应落在 [${TIMING.blinkMinMs}, ${TIMING.blinkMaxMs}]`
      );
    }
    // 每次都要真的闭合（不是"抖一下"）
    const mid = w.from + Math.round(TIMING.blinkMs / 2);
    assert.ok(blinkAt(mid) > 0.95, `闭眼峰值应接近 1，实际 ${blinkAt(mid)}`);
    // 采样起点最多偏 step，所以"窗口外"要留出一个步长的余量
    assert.equal(blinkAt(w.from - step * 2), 0, "眨眼前必须完全睁开");
    assert.equal(blinkAt(w.from + TIMING.blinkMs + step * 2), 0, "眨眼后必须完全睁开（时长收口）");
  }

  // 确定性：再算一遍，窗口完全一致
  const again = [];
  let open2 = null;
  for (let now = 0; now <= limit; now += step) {
    const v = blinkAt(now);
    if (v > 0.02 && open2 === null) open2 = now;
    if (v <= 0.02 && open2 !== null) {
      again.push(open2);
      open2 = null;
    }
  }
  assert.deepEqual(
    again,
    windows.map((w) => w.from),
    "眨眼时间表必须完全确定"
  );
});

test("眨眼：computePose 与 blinkAt 同源，eyeOpen = 1 - blink", () => {
  for (const now of [1000, 4200, 8600, 13400, 21000]) {
    const pose = computePose(frame({ now, t: now / 1000 }));
    assert.equal(pose.blink, blinkAt(now), `now=${now} 时 computePose 的 blink 应来自 blinkAt`);
    assert.ok(Math.abs(pose.eyeOpen - (1 - pose.blink)) < 1e-12, "eyeOpen 必须等于 1 - blink");
  }
});

/* ==========================================================================
   4. reduced：全静止，但画面完整（两次不同 t 逐调用一致）
   ========================================================================== */

test("reduced：所有位移 / 摆动精确为 0", () => {
  const a = computePose(frame({ reduced: true, playing: true, spec: readySpec(), beat: 1, energy: 1, t: 9.7, now: 12345 }));
  assert.equal(a.sway, 0, "sway");
  assert.equal(a.headTilt, 0, "headTilt");
  assert.equal(a.headBob, 0, "headBob");
  assert.equal(a.mouth, 0, "mouth");
  assert.equal(a.blink, 0, "reduced 不眨眼");
  assert.equal(a.hairPhase, 0, "hairPhase");
  assert.equal(a.pulse, 0, "pulse");
  assert.equal(a.breath, 0, "breath");
  assert.equal(a.eyeOpen, 1, "眼睛完全睁开");

  const b = computePose(frame({ reduced: true, playing: false, spec: null, t: 0, now: 1 }));
  assert.deepEqual(a, b, "reduced 下不同帧得到同一静态姿态");
});

test("reduced：两帧不同的 t / now / spec 画出完全相同的调用序列", () => {
  const run = (f) => {
    const rec = fakeCtx();
    const diva = createDiva();
    diva.draw(rec.ctx, f);
    diva.destroy();
    return rec.calls;
  };
  const f1 = frame({ reduced: true, t: 0, now: 0, playing: true, spec: readySpec() });
  const f2 = frame({ reduced: true, t: 42.5, now: 987654, playing: false, spec: readySpec({ beat: 1, energy: 1 }) });
  assert.deepEqual(run(f2), run(f1), "reduced 档必须是真正静止的静态画面（所有路径点都一样）");
});

/* ==========================================================================
   5. 假 Canvas 上跑 draw：不抛 / 配平 / 有限 / 预算 / 单位空间
   ========================================================================== */

test("draw：正常播放帧不抛、save/restore 配平、数值参数有限", () => {
  const rec = fakeCtx();
  const diva = createDiva();
  const f = frame({ t: 4.4, now: 5600, playing: true, spec: readySpec(), beat: 0.8, energy: 0.6 });
  diva.draw(rec.ctx, f);

  assert.equal(rec.saves, rec.restores, `save/restore 必须配平：${rec.saves} vs ${rec.restores}`);
  assert.equal(rec.depth, 0, "draw 结束时不能留在嵌套里");
  assert.ok(rec.maxDepth >= 2, "至少要有人物整体 + 头部两层变换");
  assert.deepEqual(rec.bad, [], "任何传给 context 的数值都必须是有限数（不能有 NaN/Infinity）");
  assert.ok(rec.calls.length > 100, `路径点太少了，画面可能是空的（${rec.calls.length}）`);
  diva.destroy();
});

test("draw：单位空间作画（只 translate 到锚点、scale 到 divaH/1000）", () => {
  const rec = fakeCtx();
  const diva = createDiva();
  diva.draw(rec.ctx, frame({ t: 1, now: 1000, playing: true, spec: readySpec() }));

  const translate = rec.calls.find((c) => c.name === "translate");
  assert.ok(translate, "必须把原点平移到脚底");
  assert.equal(translate.args[0], LAYOUT.cx, "x 用 layout.cx");
  assert.equal(translate.args[1], LAYOUT.baseY, "y 用 layout.baseY");

  const scale = rec.calls.find((c) => c.name === "scale");
  const s = LAYOUT.divaH / DIVA_UNIT;
  assert.ok(scale, "必须按 divaH / 1000 缩放");
  assert.equal(scale.args[0], s);
  assert.equal(scale.args[1], s);

  // 第一个 save 必须在所有绘制之前，最后一个调用必须是 restore
  assert.equal(rec.calls[0].name, "createLinearGradient", "首帧先建缓存渐变（不落笔、不改状态）");
  assert.equal(rec.calls[rec.calls.length - 1].name, "restore", "最后一个调用必须是 restore");
  diva.destroy();
});

test("draw：单帧绘制调用 < 400（smooth / perf / tiny 三档都测）", () => {
  const cases = [
    { name: "smooth", f: frame({ t: 6.1, now: 7000, playing: true, spec: readySpec(), beat: 0.9, energy: 0.8 }) },
    { name: "perf", f: frame({ t: 6.1, now: 7000, playing: true, perf: true, spec: readySpec(), beat: 0.9, energy: 0.8 }) },
    { name: "tiny", f: frame({ t: 2.2, now: 3000, playing: true, tiny: true, spec: readySpec() }) },
    { name: "paused", f: frame({ t: 2.2, now: 3000, playing: false }) },
  ];
  for (const { name, f } of cases) {
    const rec = fakeCtx();
    const diva = createDiva();
    diva.draw(rec.ctx, f);
    assert.ok(rec.paints.length > 30, `${name}：画得太少，人物可能缺层（${rec.paints.length}）`);
    assert.ok(rec.paints.length < 400, `${name}：单帧绘制调用 ${rec.paints.length} 超过 400 的预算`);
    diva.destroy();
  }
});

test("draw：perf 档比 smooth 档省（不是同一个数字）", () => {
  const smooth = fakeCtx();
  createDiva().draw(smooth.ctx, frame({ t: 5.2, now: 6000, playing: true, spec: readySpec() }));
  const perf = fakeCtx();
  const diva = createDiva();
  diva.draw(perf.ctx, frame({ t: 5.2, now: 6000, playing: true, perf: true, spec: readySpec() }));
  assert.ok(perf.paints.length < smooth.paints.length, `perf=${perf.paints.length} 应少于 smooth=${smooth.paints.length}`);
  diva.destroy();
});

test("draw：缺字段 / 脏数据 / spec 未就绪都不抛，且不产生非有限参数", () => {
  const variants = [
    frame({ playing: true, spec: { ready: false } }),
    frame({ playing: true, spec: {} }),
    frame({ t: NaN, now: NaN, dt: NaN, playing: true, spec: readySpec() }),
    frame({ t: -5, now: -100, playing: true, spec: readySpec({ low: NaN, vocal: NaN, energy: NaN, beat: NaN }) }),
    frame({ palette: null, spec: null }),
    frame({ palette: {}, playing: true }),
    frame({ beat: NaN, energy: Infinity }),
  ];
  for (const f of variants) {
    const rec = fakeCtx();
    const diva = createDiva();
    assert.doesNotThrow(() => diva.draw(rec.ctx, f), "draw 不允许抛异常");
    assert.equal(rec.saves, rec.restores, "出错的帧也必须配平 save/restore");
    assert.deepEqual(rec.bad, [], "脏数据不能变成 NaN 传给 context");
    diva.destroy();
  }
});

test("draw：没有有效 layout 时直接跳过（不碰 context）", () => {
  for (const layout of [undefined, null, {}, { divaH: 0 }, { divaH: -10, cx: 1, baseY: 1 }]) {
    const rec = fakeCtx();
    const diva = createDiva();
    assert.doesNotThrow(() => diva.draw(rec.ctx, frame({ layout })));
    assert.equal(rec.calls.length, 0, "没有可用布局时不应有任何 context 调用");
    diva.destroy();
  }
});

test("destroy：之后的 draw 是空操作（不重进绘制、不抛）", () => {
  const rec = fakeCtx();
  const diva = createDiva();
  diva.draw(rec.ctx, frame({ t: 3, now: 3000, playing: true, spec: readySpec() }));
  const before = rec.calls.length;
  diva.destroy();
  diva.destroy(); // 允许重复销毁
  assert.doesNotThrow(() => diva.draw(rec.ctx, frame({ t: 9, now: 9000, playing: true, spec: readySpec() })));
  assert.equal(rec.calls.length, before, "destroy 之后不能再碰 context");
});

test("createDiva：opts.blinkSeed 走确定性时间表，且不同 seed 节奏不同", () => {
  // 两套时间表各自跑一遍（避免交替重置缓存）
  const sample = (seed) => {
    const out = [];
    for (let now = 0; now <= 40000; now += 4) out.push(blinkAt(now, seed));
    return out;
  };
  const a = sample(7);
  const b = sample(7);
  const c = sample(1234);
  assert.deepEqual(a, b, "同一 seed 的眨眼时间表必须完全确定");
  assert.notDeepEqual(a, c, "不同 seed 的眨眼节奏不应完全一样");

  const diffAt = a.findIndex((v, i) => Math.abs(v - c[i]) > 0.5);
  assert.ok(diffAt >= 0, "应能找到两套时间表明显不同的时刻");
  const now = diffAt * 4;

  const run = (seed) => {
    const rec = fakeCtx();
    const diva = createDiva({ blinkSeed: seed });
    diva.draw(rec.ctx, frame({ now, t: now / 1000, playing: false }));
    diva.destroy();
    return rec.calls;
  };
  assert.deepEqual(run(7), run(7), "同 seed 的实例必须画出同一画面");
  assert.notDeepEqual(run(7), run(1234), "opts.blinkSeed 应真实作用到画面上");
});

/* ==========================================================================
   6. 静态扫描：契约纪律（不是运行时行为，但同样是交付门槛）
   ========================================================================== */

const SOURCE = readFileSync(new URL("../lib/diva.js", import.meta.url), "utf8");

/** 去掉注释再扫，避免"注释里提到某 API"被误判 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
}

const CODE = stripComments(SOURCE);

test("静态扫描：没有浏览器全局 / 网络 / 计时器 / 真随机 / 整屏模糊", () => {
  const banned = [
    [/\bwindow\b/, "window"],
    [/\bdocument\b/, "document"],
    [/\bfetch\s*\(/, "fetch()"],
    [/\beval\s*\(/, "eval()"],
    [/\bsetInterval\b/, "setInterval"],
    [/\bsetTimeout\b/, "setTimeout"],
    [/\brequestAnimationFrame\b/, "requestAnimationFrame"],
    [/Math\.random/, "Math.random"],
    [/\bshadowBlur\b/, "shadowBlur"],
    [/\.filter\s*=/, "context.filter"],
    [/\bnew\s+Image\b/, "new Image"],
    [/\bcreateElement\b/, "createElement"],
    [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  ];
  for (const [re, name] of banned) {
    assert.ok(!re.test(CODE), `diva.js 里不允许出现 ${name}`);
  }
});

test("静态扫描：子模块 import 必须透传 token（不是静态 import）", () => {
  assert.ok(/const Q = new URL\(import\.meta\.url\)\.search;/.test(CODE), "必须从入口 URL 取 query");
  assert.ok(/await import\(`\.\/config\.js\$\{Q\}`\)/.test(CODE), "config.js 必须动态 import 并透传 token");
  assert.ok(/await import\(`\.\/util\.js\$\{Q\}`\)/.test(CODE), "util.js 必须动态 import 并透传 token");
  assert.ok(!/\bfrom\s+["']\.\//.test(CODE), "不允许静态 import 包内相对模块（/skins/ 逐文件鉴权会 403）");
  assert.ok(!/\bfrom\s+["'][a-z@]/i.test(CODE), "不允许裸包名 import（契约 v3：插件零 import 宿主）");
});

test("静态扫描：绘制预算的关键纪律（无巨型渐变循环 / 无每帧 closePath 泄漏）", () => {
  // 渐变只在 ensureLook 里建（调色板变化才重建），不能出现在逐帧路径里。
  // 目前是三处：亮发渐变 / 暗发渐变 / 礼服渐变；再给后续加一条裙摆高光渐变的余量，上限 4。
  const gradientCalls = CODE.match(/createLinearGradient\(/g) || [];
  assert.ok(
    gradientCalls.length >= 1 && gradientCalls.length <= 4,
    `createLinearGradient 只允许 1~4 处（发色×2 + 裙色，余量 1），实际 ${gradientCalls.length}`
  );
  // save/restore 的源码配对：数量必须相等（运行时另有用例）
  const saves = CODE.match(/\.save\(\)/g) || [];
  const restores = CODE.match(/\.restore\(\)/g) || [];
  assert.equal(saves.length, restores.length, `源码里 save/restore 数量应相等：${saves.length} vs ${restores.length}`);
});
