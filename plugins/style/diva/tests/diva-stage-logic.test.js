/* ==========================================================================
   diva-stage-logic.test.js — 全息舞台「纯逻辑 + 静态纪律」单测
   --------------------------------------------------------------------------
   被测模块：../lib/stage.js（不 import 宿主任何模块，node --test 直接跑）：

     node --test "plugins/style/diva/tests/diva-stage-logic.test.js"

   ★ 本会话沙箱禁止「带管道 stdio 的子进程」，`node --test` 默认会给每个
     测试文件 spawn 一个子进程（报 spawn EPERM）。所以实际命令是：

     node --experimental-test-isolation=none --test \
       "plugins/style/diva/tests/diva-stage-logic.test.js"

   覆盖：
     1. 光尘（createDust）：同 seed 完全确定、dt=0 不动、升腾方向、越界回绕、
        销毁后清空；perf 档数量减少；
     2. 光环刻度（haloArcs）：确定性、72 / 36 段分档、频谱直驱刻度长度、
        spec 为 null 时退化成待机波；
     3. 静态扫描 stage.js：没有自带帧循环 / 定时器 / 全局对象 / 阴影 /
        网络 / eval / Math.random，离屏画布只创建一次；
     4. 用假 document + 计数假 2D 上下文跑 resize / drawBack / drawFront /
        destroy：离屏画布只在第一次 resize 建一次、每帧只有一次 drawImage、
        save/restore 配平、destroy 把画布尺寸置 0 且之后不再绘制。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createDust, createStage, haloArcs } from "../lib/stage.js";
import { PERF } from "../lib/config.js";

/** 与 computeLayout() 同形的舞台锚点 */
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

/** 一帧的完整快照（entry 每帧传的就是这个形状） */
function makeFrame(overrides = {}) {
  return {
    w: LAYOUT.w,
    h: LAYOUT.h,
    dpr: 1,
    t: 1.5,
    dt: 1 / 60,
    now: 1000,
    layout: LAYOUT,
    playing: true,
    pos: 1500,
    duration: 180000,
    progress: 0.01,
    lyricIndex: -1,
    reduced: false,
    perf: false,
    narrow: false,
    tiny: false,
    palette: PALETTE,
    spec: null,
    beat: 0,
    energy: 0,
    ...overrides,
  };
}

/* --------------------------------------------------------------------------
   假 Canvas 环境（只在 stage 的运行期测试里装到 globalThis 上）
   -------------------------------------------------------------------------- */

function fakeGradient() {
  return { addColorStop() {} };
}

/** 计数用的假 2D 上下文：任何未声明的方法都退化成空函数 */
function fakeContext() {
  const calls = {
    drawImage: 0,
    fill: 0,
    stroke: 0,
    fillRect: 0,
    arc: 0,
    ellipse: 0,
    save: 0,
    restore: 0,
    gradients: 0,
    setTransform: 0,
    clearRect: 0,
  };
  const target = {
    calls,
    canvas: null,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineDashOffset: 0,
    drawImage() {
      calls.drawImage += 1;
    },
    fillRect() {
      calls.fillRect += 1;
    },
    clearRect() {
      calls.clearRect += 1;
    },
    setTransform() {
      calls.setTransform += 1;
    },
    save() {
      calls.save += 1;
    },
    restore() {
      calls.restore += 1;
    },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {
      calls.arc += 1;
    },
    ellipse() {
      calls.ellipse += 1;
    },
    fill() {
      calls.fill += 1;
    },
    stroke() {
      calls.stroke += 1;
    },
    setLineDash() {},
    translate() {},
    scale() {},
    rotate() {},
    createRadialGradient() {
      calls.gradients += 1;
      return fakeGradient();
    },
    createLinearGradient() {
      calls.gradients += 1;
      return fakeGradient();
    },
  };
  return new Proxy(target, {
    get(t, key) {
      if (typeof key === "symbol") return undefined;
      if (key in t) return t[key];
      return () => {};
    },
    set(t, key, value) {
      t[key] = value;
      return true;
    },
  });
}

/** 装一个只认 createElement("canvas") 的假文档，返回创建过的画布列表 */
function installFakeDocument() {
  const created = [];
  globalThis.document = {
    createElement(tag) {
      const ctx = fakeContext();
      const canvas = {
        tag,
        width: 0,
        height: 0,
        getContext: () => ctx,
        ctx,
      };
      created.push(canvas);
      return canvas;
    },
  };
  return created;
}

function removeFakeDocument() {
  delete globalThis.document;
}

/* --------------------------------------------------------------------------
   1. 光尘：确定性 / 静止 / 升腾 / 回绕 / 销毁
   -------------------------------------------------------------------------- */

test("createDust：同 seed 完全确定，不同 seed 不同", () => {
  const a = createDust(64, 20260101);
  const b = createDust(64, 20260101);
  const c = createDust(64, 7);
  const va = a.read();
  const vb = b.read();
  const vc = c.read();

  assert.equal(va.count, 64);
  for (const key of ["x", "y", "z", "size", "speed", "drift", "phase"]) {
    assert.deepEqual(Array.from(va[key]), Array.from(vb[key]), `同 seed 的 ${key} 必须完全一致`);
  }
  assert.notDeepEqual(Array.from(va.x), Array.from(vc.x), "不同 seed 必须得到不同的星图");

  a.destroy();
  b.destroy();
  c.destroy();
});

test("createDust：dt=0 一帧不动，dt>0 沿升腾方向推进", () => {
  const d = createDust(32, 99);
  d.step(0.1, {}); // 先跑一步，跳过初始位置
  const v = d.read();
  const beforeX = Array.from(v.x);
  const beforeY = Array.from(v.y);

  d.step(0, { t: 3 });
  assert.deepEqual(Array.from(v.x), beforeX, "dt=0 时 x 不该动");
  assert.deepEqual(Array.from(v.y), beforeY, "dt=0 时 y 不该动");

  d.step(0.1, {});
  let rose = 0;
  for (let i = 0; i < v.count; i += 1) if (v.y[i] < beforeY[i]) rose += 1;
  assert.ok(rose > v.count * 0.8, `升腾光尘的 y 应该变小（上升），实际 ${rose}/${v.count} 颗`);

  d.destroy();
});

test("createDust：越界回绕（从顶部回到下方、横向从右侧回到左侧）", () => {
  const d = createDust(24, 5);
  const v = d.read();

  v.y[3] = -0.06;
  d.step(1 / 60, {});
  assert.ok(v.y[3] > 0.9, `升到顶的粒子应回绕到画面下方（实际 ${v.y[3]}）`);
  assert.ok(v.y[3] <= 1.04, "回绕后不应再越界");

  v.x[7] = 1.2;
  d.step(1 / 60, {});
  assert.ok(v.x[7] < 0.2, `横向越界的粒子应回绕到左侧（实际 ${v.x[7]}）`);

  v.x[9] = -0.2;
  d.step(1 / 60, {});
  assert.ok(v.x[9] > 0.8, `横向越界（左侧）的粒子应回绕到右侧（实际 ${v.x[9]}）`);

  d.destroy();
});

test("createDust：destroy 后 count 归 0、数组清空", () => {
  const d = createDust(16, 1);
  d.destroy();
  const v = d.read();
  assert.equal(v.count, 0);
  assert.equal(v.x.every((n) => n === 0), true);
  assert.equal(v.y.every((n) => n === 0), true);
  // destroy 之后再推进也不该抛
  d.step(0.1, {});
  assert.equal(v.count, 0);
});

test("perf 档数量减少：刻度 72→36、光尘 88→38", () => {
  assert.ok(PERF.ticksPerf < PERF.ticksSmooth, "perf 档刻度数必须更少");
  assert.ok(PERF.dustPerf < PERF.dustSmooth, "perf 档光尘数必须更少");
  assert.equal(createDust(PERF.dustSmooth, 2).read().count, PERF.dustSmooth);
  assert.equal(createDust(PERF.dustPerf, 2).read().count, PERF.dustPerf);
});

/* --------------------------------------------------------------------------
   2. 光环刻度
   -------------------------------------------------------------------------- */

test("haloArcs：确定性 + 72/36 段分档 + 频谱直驱刻度长度", () => {
  const spec = {
    ready: true,
    bands: new Float32Array(128).fill(0.5),
    energy: 0.5,
    beat: 0.2,
  };

  const a = haloArcs(LAYOUT, spec, 3.2);
  const b = haloArcs(LAYOUT, spec, 3.2);
  assert.deepEqual(a, b, "同样的输入必须得到完全相同的刻度环");
  assert.equal(a.length, PERF.ticksSmooth, "smooth 档是 72 段刻度");
  assert.equal(haloArcs(LAYOUT, spec, 3.2, { perf: true }).length, PERF.ticksPerf, "perf 档是 36 段");

  // 频谱能量直接决定刻度长度
  const quietSpec = { ready: true, bands: new Float32Array(128).fill(0), energy: 0, beat: 0 };
  const loudSpec = { ready: true, bands: new Float32Array(128).fill(0.9), energy: 0.9, beat: 0 };
  const quiet = haloArcs(LAYOUT, quietSpec, 3.2);
  const loud = haloArcs(LAYOUT, loudSpec, 3.2);
  assert.ok(
    loud[0].outer > quiet[0].outer + 1,
    `响的频段必须画出更长的刻度（quiet=${quiet[0].outer.toFixed(2)} loud=${loud[0].outer.toFixed(2)}）`
  );

  for (const arc of a) {
    for (const key of ["a", "len", "inner", "outer", "alpha", "band", "x", "y"]) {
      assert.equal(Number.isFinite(arc[key]), true, `刻度字段 ${key} 必须是有限数`);
    }
    assert.ok(arc.len >= 0 && arc.alpha >= 0 && arc.alpha <= 1);
  }
});

test("haloArcs：spec 为 null 时退化成待机波、不抛", () => {
  const a = haloArcs(LAYOUT, null, 0.5);
  const b = haloArcs(LAYOUT, null, 0.5);
  const c = haloArcs(LAYOUT, null, 4.5);
  assert.equal(a.length, PERF.ticksSmooth);
  assert.deepEqual(a, b, "同一时刻的待机波必须确定");
  assert.notDeepEqual(a, c, "待机波应随时间缓慢起伏（时间不同结果不同）");
  for (const arc of a) {
    assert.ok(Number.isFinite(arc.len) && arc.len > 0);
    assert.ok(Number.isFinite(arc.alpha));
  }

  // 缺 layout / 非法 layout 也不能抛
  const fallback = haloArcs(null, null, 1);
  assert.equal(fallback.length, PERF.ticksSmooth);
  for (const arc of fallback) assert.equal(Number.isFinite(arc.outer), true);
});

/* --------------------------------------------------------------------------
   3. 静态扫描：stage.js 必须守住的性能 / 安全纪律
   -------------------------------------------------------------------------- */

const STAGE_SRC = readFileSync(new URL("../lib/stage.js", import.meta.url), "utf8");

test("静态扫描 stage.js：不自排帧、不建定时器、不碰全局对象、无阴影/滤镜/网络/eval", () => {
  const banned = [
    [/requestAnimationFrame/, "requestAnimationFrame（帧循环归 entry 所有）"],
    [/cancelAnimationFrame/, "cancelAnimationFrame"],
    [/\bsetInterval\b/, "setInterval"],
    [/\bsetTimeout\b/, "setTimeout"],
    [/\bwindow\b/, "window"],
    [/document\.documentElement/, "document.documentElement"],
    [/\bshadowBlur\b/, "shadowBlur（禁止阴影）"],
    [/\.filter\s*=/, "全屏 filter（禁止）"],
    [/\bfetch\s*\(/, "fetch（不发网络请求）"],
    [/\beval\s*\(/, "eval"],
    [/\bnew\s+Function\b/, "new Function"],
    [/Math\.random/, "Math.random（画面必须确定性）"],
  ];
  for (const [re, label] of banned) {
    assert.equal(re.test(STAGE_SRC), false, `stage.js 里不该出现 ${label}`);
  }

  // document 只允许 createElement（离屏画布）；其余 document.* 一律不允许
  const docUses = STAGE_SRC.match(/document\.[A-Za-z]+/g) || [];
  for (const use of docUses) {
    assert.equal(use, "document.createElement", `stage.js 只允许 document.createElement，出现了 ${use}`);
  }
  // 离屏画布只创建一次（源码里只有一处 createElement("canvas")，运行期也只走一次）
  assert.equal(
    (STAGE_SRC.match(/createElement\s*\(\s*"canvas"\s*\)/g) || []).length,
    1,
    "离屏画布只应创建一次"
  );

  // 节拍闪光必须克制：源码里声明的透明度上限 ≤ 0.08
  const flash = /FLASH_MAX_ALPHA\s*=\s*([0-9.]+)/.exec(STAGE_SRC);
  assert.ok(flash, "应当有 FLASH_MAX_ALPHA 常量把节拍闪光封顶");
  assert.ok(Number(flash[1]) > 0 && Number(flash[1]) <= 0.08, `节拍闪光上限必须 ≤ 0.08（实际 ${flash[1]}）`);
});

/* --------------------------------------------------------------------------
   4. 运行期：离屏画布只建一次 + 每帧一次 drawImage + save/restore 配平
   -------------------------------------------------------------------------- */

test("没有 document 时 createStage / resize / draw 也不抛（纯 Node 兜底）", () => {
  const stage = createStage();
  stage.resize(400, 300, 1, { ...LAYOUT, w: 400, h: 300, cx: 200, baseY: 200 });
  const g = fakeContext();
  const f = makeFrame({ w: 400, h: 300, layout: { ...LAYOUT, w: 400, h: 300, cx: 200, baseY: 200 } });
  assert.doesNotThrow(() => stage.drawBack(g, f));
  assert.doesNotThrow(() => stage.drawFront(g, f));
  // 没有离屏画布时退化成纯色底（fillRect），但绘制不该崩
  assert.ok(g.calls.fillRect >= 1, "没有离屏画布时应退化成纯色底");
  stage.destroy();
});

test("离屏 canvas 只在第一次 resize 创建一次；每帧只 drawImage 一次", () => {
  const created = installFakeDocument();
  try {
    const stage = createStage();
    stage.resize(LAYOUT.w, LAYOUT.h, 1, LAYOUT);
    assert.equal(created.length, 1, "第一次 resize 应当创建唯一一块离屏画布");
    assert.ok(created[0].width > 0 && created[0].height > 0, "离屏画布尺寸应已按 dpr 设好");

    const g = fakeContext();
    const f1 = makeFrame({ now: 1000 });
    stage.drawBack(g, f1);
    stage.drawFront(g, f1);
    assert.equal(g.calls.drawImage, 1, "drawBack 每帧只应 drawImage 一次静态层");
    assert.equal(g.calls.save, g.calls.restore, "drawBack / drawFront 的 save 与 restore 必须配平");

    // 同一帧里 drawFront 不能把内部时间再推进一次（靠两次调用的光尘位置不好直接断言，
    // 这里至少保证不重复 drawImage、不重复绘制静态层）
    g.calls.drawImage = 0;
    stage.drawFront(g, makeFrame({ now: 1016 }));
    assert.equal(g.calls.drawImage, 0, "drawFront 不应再贴一次静态层");

    // 再 resize 一次：只改尺寸、不新建画布
    stage.resize(960, 600, 2, { ...LAYOUT, w: 960, h: 600, cx: 480, baseY: 400 });
    assert.equal(created.length, 1, "第二次 resize 不该再创建离屏画布");

    g.calls.drawImage = 0;
    stage.drawBack(g, makeFrame({ now: 1032, layout: { ...LAYOUT, w: 960, h: 600, cx: 480, baseY: 400 } }));
    assert.equal(g.calls.drawImage, 1, "resize 后应重画一次静态层并重新贴图");
    assert.equal(g.calls.save, g.calls.restore, "drawBack 的 save/restore 必须配平");

    stage.destroy();
    assert.equal(created[0].width, 0, "destroy 应把离屏画布尺寸置 0");
    assert.equal(created[0].height, 0, "destroy 应把离屏画布尺寸置 0");

    // destroy 之后再画：应当是安全空操作
    g.calls.drawImage = 0;
    assert.doesNotThrow(() => stage.drawBack(g, makeFrame({ now: 1100 })));
    assert.doesNotThrow(() => stage.drawFront(g, makeFrame({ now: 1100 })));
    assert.equal(g.calls.drawImage, 0, "destroy 之后不该再绘制");
  } finally {
    removeFakeDocument();
  }
});

test("reduced / perf / 暂停帧都能安全绘制（含 spec=null 与有限字段）", () => {
  const created = installFakeDocument();
  try {
    const stage = createStage();
    stage.resize(LAYOUT.w, LAYOUT.h, 1, LAYOUT);
    const g = fakeContext();

    const paused = makeFrame({ playing: false, now: 2000 });
    const reduced = makeFrame({ playing: false, reduced: true, now: 2016 });
    const perf = makeFrame({ perf: true, now: 2032, spec: { ready: true, bands: new Float32Array(128).fill(0.4), energy: 0.4, beat: 0.3 } });
    const noSpec = makeFrame({ now: 2048, spec: null, beat: 0, energy: 0 });

    for (const f of [paused, reduced, perf, noSpec]) {
      assert.doesNotThrow(() => stage.drawBack(g, f), "drawBack 不应抛");
      assert.doesNotThrow(() => stage.drawFront(g, f), "drawFront 不应抛");
    }
    assert.ok(g.calls.drawImage >= 4, "每一帧都应贴一次静态层");
    assert.equal(created.length, 1, "多次绘制不该创建新画布");
    assert.equal(g.calls.save, g.calls.restore, "各帧的 save/restore 总数必须配平");
    stage.destroy();
  } finally {
    removeFakeDocument();
  }
});
