/* ==========================================================================
   cube-matrix-logic.test.js — 「律动方块」样式的纯逻辑单测
   --------------------------------------------------------------------------
   ★ 这个文件属于**第三方样式包自己**，不 import 宿主任何模块
     （store / playerhost / 契约包都不碰），只测「不用画布也能验」的那部分：

       1. 投影：近大远小、柱顶在柱底上方、t=0 时中心点落在舞台中心；
       2. 画家算法：orderByDepth 必须让远柱先画（回来的是索引数组）；
       3. 高度：频谱段越大柱子越高、不会越界、没有频谱时仍有待机起伏；
       4. 配色：色相随时间流动、能量越高越亮、色相永远在 [0,360)；
       5. 频谱分析：无输入时平滑值衰减到 0、通量能触发打击且受冷却约束；
       6. 契约纪律：零裸包名 import、不碰 window / document、CSS 用
          `:scope`（不是 `::scope`）且安全区兜底写成 0px。

   画布上的那一半（真的画出了方块、颜色真的在变）只能靠无头浏览器：
     node plugins/style/cube-matrix/tests/render-shot.mjs
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CAM, CUBE, COLOR, BEAT, GRID, LEVEL } from "../lib/config.js";
import {
  createView,
  cubeHeight,
  decayHistory,
  idleHeight,
  layoutGrid,
  orderByDepth,
  project,
  projectCube,
  pushHistoryRow,
} from "../lib/scene.js";
import { cubeTone, frameTone, wrapHue } from "../lib/palette.js";
import { beatFire, createAnalyser, fillColumnLevels } from "../lib/spectrum.js";
import { clamp, smoothRate, smoothTo } from "../lib/util.js";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------------------------------------------------------- 1. 投影 -- */

test("createView：单位尺度取宽高两个约束里更小的那个", () => {
  const wide = createView(2000, 400, 0, CAM);
  assert.equal(wide.unit, 400 * CAM.fitH, "窄高时由高度约束");
  const tall = createView(600, 2000, 0, CAM);
  assert.equal(tall.unit, 600 * CAM.fitW, "宽扁时由宽度约束");
  assert.ok(wide.unit > 0 && wide.floorY > 0);
});

test("project：近大远小 + 柱顶在柱底上方 + 原点落在舞台横向中心", () => {
  const view = createView(1200, 800, 0, CAM);
  const swayed = createView(1200, 800, CAM.yawPeriod / 4, CAM);
  assert.ok(Math.abs(view.yaw - CAM.baseYaw) < 1e-9, "t=0 时只有常驻侧看偏角");
  assert.ok(Math.abs(swayed.yaw - view.yaw) > 0.05, "yaw 会随时间左右摆动");

  const center = project(view, 0, 0, 0);
  assert.ok(Math.abs(center.sx - view.cx) < 1e-6, "原点落在横向基准线上（含侧看补偿）");
  assert.ok(Math.abs(center.sy - 800 * CAM.floorY) < 1e-6, "原点落在地面基准线上");

  // 网格四角在画面里的左右留白必须基本对称（侧看会把重心推向一侧，由补偿抹平）
  let minSx = Infinity;
  let maxSx = -Infinity;
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const p = project(view, x, 0, z);
    minSx = Math.min(minSx, p.sx);
    maxSx = Math.max(maxSx, p.sx);
  }
  assert.ok(Math.abs(minSx - (1200 - maxSx)) < 2, `左右留白应对称：${minSx} / ${1200 - maxSx}`);
  assert.ok(view.unit <= Math.min(1200 * CAM.fitW, 800 * CAM.fitH) + 1e-9, "尺度不超过适配上限");

  const near = project(view, 0, 0, 1);
  const far = project(view, 0, 0, -1);
  assert.ok(near.k > far.k, "近处的透视系数更大");
  assert.ok(near.depth < far.depth, "近处的 depth 更小（越小越近）");

  const top = project(view, 0, 0.8, 0);
  assert.ok(top.sy < center.sy, "世界 y 越大，屏幕越靠上");
});

test("projectCube：四面 + 顶面，顶面整体在底面之上，depth 是四角平均", () => {
  const view = createView(1000, 700, 0, CAM);
  const { cells } = layoutGrid(GRID);
  const cell = cells[0];
  const geo = projectCube(view, cell, 0.9);

  assert.equal(geo.sides.length, 4, "四根侧面");
  for (const side of geo.sides) assert.equal(side.points.length, 4, "每个侧面是四边形");

  const bottomMax = Math.max(...geo.sides.map((s) => Math.max(s.points[0][1], s.points[1][1])));
  const topMin = Math.min(...geo.top.points.map((p) => p[1]));
  assert.ok(topMin < bottomMax, "顶面必须整体高于柱脚");

  const expected = (project(view, cell.gx - cell.halfX, 0, cell.gz - cell.halfZ).depth +
    project(view, cell.gx + cell.halfX, 0, cell.gz - cell.halfZ).depth +
    project(view, cell.gx + cell.halfX, 0, cell.gz + cell.halfZ).depth +
    project(view, cell.gx - cell.halfX, 0, cell.gz + cell.halfZ).depth) / 4;
  assert.ok(Math.abs(geo.depth - expected) < 1e-6, "depth 为四角平均");
});

test("projectCube：高度为 0 时顶面与底面重合（不出现负高度）", () => {
  const view = createView(900, 600, 0, CAM);
  const cell = layoutGrid(GRID).cells[10];
  const flat = projectCube(view, cell, 0);
  const negative = projectCube(view, cell, -3);
  assert.deepEqual(negative.top.points, flat.top.points, "负高度按 0 处理");
});

/* ------------------------------------------------------------ 2. 画家算法 -- */

test("orderByDepth：远柱先画（深度单调不增），且不复制柱体", () => {
  const view = createView(1200, 800, 3.7, CAM);
  const { cells } = layoutGrid(GRID);
  const order = orderByDepth(cells, view);

  assert.equal(order.length, cells.length);
  assert.equal(new Set(order).size, cells.length, "是 0..n-1 的一个排列");

  let prevDepth = Infinity;
  for (const idx of order) {
    const d = project(view, cells[idx].gx, 0, cells[idx].gz).depth;
    assert.ok(d <= prevDepth + 1e-9, "深度必须单调不增");
    prevDepth = d;
  }
});

test("layoutGrid：列宽行宽一致、格子按中心对称铺开到 ±1", () => {
  const { cells, cols, rows } = layoutGrid(GRID);
  assert.equal(cells.length, cols * rows);
  const first = cells[0];
  const last = cells[cells.length - 1];
  assert.ok(Math.abs(first.gx + 1) < 1e-9 && Math.abs(first.gz + 1) < 1e-9);
  assert.ok(Math.abs(last.gx - 1) < 1e-9 && Math.abs(last.gz - 1) < 1e-9);
  assert.ok(first.halfX > 0 && first.halfZ > 0);
});

/* --------------------------------------------------------------- 3. 高度 -- */

test("fillColumnLevels：左列吃低频、右列吃高频（横向就是频率轴）", () => {
  const out = new Float32Array(GRID.cols);

  const lowOnly = new Float32Array(128);
  lowOnly.fill(0);
  for (let i = 0; i < 10; i += 1) lowOnly[i] = 1;
  fillColumnLevels(out, lowOnly, LEVEL);
  assert.ok(out[0] > 0.5, `最低频只该顶起最左列：${out[0]}`);
  assert.ok(out[GRID.cols - 1] < 0.01, `最右列不该被低频点亮：${out[GRID.cols - 1]}`);

  const highOnly = new Float32Array(128);
  highOnly.fill(0);
  for (let i = 118; i < 128; i += 1) highOnly[i] = 1;
  fillColumnLevels(out, highOnly, LEVEL);
  assert.ok(out[GRID.cols - 1] > 0.5, `最高频只该顶起最右列：${out[GRID.cols - 1]}`);
  assert.ok(out[0] < 0.01, `最左列不该被高频点亮：${out[0]}`);
});

test("fillColumnLevels：单调递增的谱压出来也得单调（不出现锯齿）", () => {
  const bands = new Float32Array(128);
  for (let i = 0; i < 128; i += 1) bands[i] = i / 127;
  const out = fillColumnLevels(new Float32Array(GRID.cols), bands, LEVEL);
  for (let c = 1; c < out.length; c += 1) {
    assert.ok(out[c] >= out[c - 1] - 1e-6, `列 ${c} 比前一列矮：${out[c - 1]} → ${out[c]}`);
  }
  assert.ok(out[out.length - 1] > out[0], "高频倾斜补偿必须让右端也立得起来");
});

test("fillColumnLevels：空谱 / 空输入一律全 0，且不越界", () => {
  const out = new Float32Array(GRID.cols).fill(0.7);
  fillColumnLevels(out, null, LEVEL);
  assert.ok(out.every((v) => v === 0), "没有谱时列电平清零");
  fillColumnLevels(out, new Float32Array(128), LEVEL);
  assert.ok(out.every((v) => v === 0), "全 0 谱压出全 0 电平");
});

test("cubeHeight：能量越大柱子越高，且永不超过 maxH", () => {
  const quiet = cubeHeight(0, CUBE);
  const loud = cubeHeight(1, CUBE);
  assert.equal(quiet, CUBE.base, "0 能量时就是底座高度");
  assert.ok(loud > quiet + 0.5, `满能量应当顶起柱子：${quiet} → ${loud}`);

  const crazy = cubeHeight(1, { ...CUBE, specAmp: 99 });
  assert.equal(crazy, CUBE.maxH, "超限被裁到 maxH");
  assert.equal(cubeHeight(-5, CUBE), CUBE.base, "负电平按 0 处理");
});

test("idleHeight：待机有呼吸，但幅度小到不会被当成「节奏」", () => {
  const { cells } = layoutGrid(GRID);
  const cell = cells[3];
  const heights = [0, 0.5, 1, 1.5, 2].map((t) => idleHeight(cell, t, CUBE, 0.31));
  assert.ok(heights.every((h) => h >= CUBE.base), "待机不低于底座");
  const spread = Math.max(...heights) - Math.min(...heights);
  assert.ok(spread > 0.005, `待机起伏应当可见：${spread}`);
  assert.ok(spread < CUBE.specAmp * 0.15, `待机起伏必须远小于频谱幅度：${spread}`);
});

test("pushHistoryRow：新样本落到最近一行，旧样本向远处退一格", () => {
  const cols = 3;
  const rows = 4;
  const history = new Float32Array(cols * rows);
  const row = (r) => Array.from(history.slice(r * cols, r * cols + cols)).map((v) => +v.toFixed(3));

  pushHistoryRow(history, [0.1, 0.2, 0.3], cols);
  assert.deepEqual(row(rows - 1), [0.1, 0.2, 0.3], "最新样本在最近的一行");
  assert.deepEqual(row(0), [0, 0, 0], "最远的一行还是空的");

  pushHistoryRow(history, [0.4, 0.5, 0.6], cols);
  assert.deepEqual(row(rows - 1), [0.4, 0.5, 0.6], "新样本顶到最近一行");
  assert.deepEqual(row(rows - 2), [0.1, 0.2, 0.3], "上一个样本退到后一排");
  assert.equal(history.length, cols * rows, "缓冲区原地修改，长度不变");

  pushHistoryRow(history, [0.7, 0.8, 0.9], cols);
  pushHistoryRow(history, [1, 1, 1], cols);
  // 4 行滚满：最远那行是最早推入的样本
  assert.deepEqual(row(0), [0.1, 0.2, 0.3], "最远一行是最早的样本");
  assert.deepEqual(row(rows - 1), [1, 1, 1], "越界电平被钳到 1");
  // 再推一次：最早的样本被挤出画面
  pushHistoryRow(history, [0, 0, 0], cols);
  assert.deepEqual(row(0), [0.4, 0.5, 0.6], "最早的样本被挤出历史缓冲");
});

test("decayHistory：暂停后整体衰减，并报出剩余能量", () => {
  const history = new Float32Array([1, 0.5, 0.25, 0.125]);
  const max = decayHistory(history, 0.5);
  assert.deepEqual(Array.from(history), [0.5, 0.25, 0.125, 0.0625]);
  assert.ok(Math.abs(max - 0.5) < 1e-6);
  assert.equal(decayHistory(new Float32Array(4), 0.5), 0);
});

test("smoothRate：上升比下落快（快升慢降的包络）", () => {
  let up = 0;
  up = smoothRate(up, 1, CUBE.riseMs, CUBE.fallMs, 16.7);
  let down = 1;
  down = smoothRate(down, 0, CUBE.riseMs, CUBE.fallMs, 16.7);
  assert.ok(up > 1 - down, `上升量应大于下落量：上升 ${up} / 下落 ${1 - down}`);
  assert.ok(up > 0.5, `一个 60fps 帧内就该吃到大部分能量：${up}`);

  // 同一目标值在 60fps 与 30fps 下走过的比例接近（与帧率无关）
  let a = 0;
  for (let i = 0; i < 4; i += 1) a = smoothTo(a, 1, 0.3, 16.6667);
  let b = 0;
  for (let i = 0; i < 2; i += 1) b = smoothTo(b, 1, 0.3, 33.3334);
  assert.ok(Math.abs(a - b) < 0.02, `60fps 与 30fps 的推进量应当接近：${a} vs ${b}`);
  assert.equal(clamp(5, 0, 1), 1);
});

/* --------------------------------------------------------------- 4. 配色 -- */

test("wrapHue：负数也收敛到 [0,360)", () => {
  assert.equal(wrapHue(-1), 359);
  assert.equal(wrapHue(360), 0);
  assert.equal(wrapHue(725.5), 5.5);
});

test("frameTone：色相随时间流动；能量 / 重拍让画面更亮", () => {
  const base = { centroid: 0.5, energy: 0, beat: 0, cfg: COLOR };
  const t0 = frameTone({ ...base, timeSec: 0 });
  const t1 = frameTone({ ...base, timeSec: 5 });
  assert.notEqual(t0.hueBase.toFixed(2), t1.hueBase.toFixed(2), "色相必须随时间变化");

  const dim = frameTone({ ...base, timeSec: 0 });
  const bright = frameTone({ ...base, timeSec: 0, energy: 1, beat: 1 });
  assert.ok(bright.light > dim.light, "能量高时更亮");
  assert.ok(bright.sat >= dim.sat, "能量高时更饱和");

  const lowCentroid = frameTone({ ...base, timeSec: 2, centroid: 0 });
  const highCentroid = frameTone({ ...base, timeSec: 2, centroid: 1 });
  assert.notEqual(lowCentroid.hueBase.toFixed(2), highCentroid.hueBase.toFixed(2), "质心推动色相");
});

test("cubeTone：一帧之内左右铺开彩虹，且色相 / 明度始终合法", () => {
  const tone = frameTone({ timeSec: 7.3, centroid: 0.42, energy: 0.6, beat: 0, cfg: COLOR });
  const { cells } = layoutGrid(GRID);
  const left = cubeTone(tone, cells.find((c) => c.colNorm === 0), 0.5, COLOR);
  const right = cubeTone(tone, cells.find((c) => c.colNorm === 1), 0.5, COLOR);
  assert.ok(Math.abs(left.hue - right.hue) > 60, `左右色差应当明显：${left.hue} vs ${right.hue}`);

  for (const cell of cells) {
    for (const h01 of [0, 0.5, 1]) {
      const c = cubeTone(tone, cell, h01, COLOR);
      assert.ok(c.hue >= 0 && c.hue < 360, `色相越界：${c.hue}`);
      assert.ok(c.sat >= 0 && c.sat <= 100, `饱和度越界：${c.sat}`);
      assert.ok(c.light >= 0 && c.light <= 100, `明度越界：${c.light}`);
    }
  }

  const low = cubeTone(tone, cells[0], 0, COLOR);
  const high = cubeTone(tone, cells[0], 1, COLOR);
  assert.ok(high.light > low.light, "越高的柱子越亮");
});

/* --------------------------------------------------------------- 5. 频谱 -- */

test("createAnalyser：无输入时平滑值衰减到 0（暂停后退回待机）", () => {
  const { out, update } = createAnalyser(128);
  const loud = new Float32Array(128).fill(1);
  update(loud, 16.7);
  assert.ok(out.live, "有谱时 live 为真");
  assert.ok(out.mid[10] > 0.2, "第一帧就该吃到能量");

  for (let i = 0; i < 120; i += 1) update(null, 16.7);
  assert.equal(out.live, false);
  assert.ok(out.mid[10] < 0.02, `衰减应当接近 0：${out.mid[10]}`);
  assert.ok(out.total < 0.02, "整体能量同样衰减");
});

test("beatFire：通量够高才响，冷却期内不重复", () => {
  const { out, update } = createAnalyser(128);
  update(new Float32Array(128).fill(0), 16.7);
  const quiet = beatFire(out, 1, BEAT.threshold, BEAT.cooldownSec);
  assert.equal(quiet, false, "静默时不该触发");

  update(new Float32Array(128).fill(1), 16.7);
  assert.ok(out.flux > BEAT.threshold, `一记满能量重拍的通量应当够大：${out.flux}`);
  assert.equal(beatFire(out, 2, BEAT.threshold, BEAT.cooldownSec), true);
  // 立刻再来一记：冷却未过，不触发
  update(new Float32Array(128).fill(0), 16.7);
  update(new Float32Array(128).fill(1), 16.7);
  assert.equal(beatFire(out, 2 + BEAT.cooldownSec / 2, BEAT.threshold, BEAT.cooldownSec), false);
});

/* --------------------------------------------------- 6. 契约纪律与安全区 -- */

/** 去掉注释后再扫描，避免把「说明文字」当成代码 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

test("零裸包名 import：只 import 本包目录内的相对模块", () => {
  const files = ["skin.js", ...readdirSync(join(PKG_ROOT, "lib")).map((f) => join("lib", f))];
  for (const rel of files) {
    const code = stripComments(readFileSync(join(PKG_ROOT, rel), "utf8"));
    const specifiers = [
      ...code.matchAll(/\bfrom\s*["'`]([^"'`]+)["'`]/g),
      ...code.matchAll(/\bimport\s*\(\s*["'`]([^"'`]+)["'`]/g),
      ...code.matchAll(/\bimport\s*\(\s*`[^`]*\$\{\d*\}?([^`]*)`/g).map((m) => ({})),
    ].map((m) => m[1]).filter(Boolean);
    for (const spec of specifiers) {
      assert.ok(
        spec.startsWith("./") || spec.startsWith("../"),
        `${rel} 里出现了非相对 import：${spec}`,
      );
    }
  }
});

test("不碰 window / document / 网络，也不做定时器轮询", () => {
  const files = ["skin.js", ...readdirSync(join(PKG_ROOT, "lib")).map((f) => join("lib", f))];
  for (const rel of files) {
    const code = stripComments(readFileSync(join(PKG_ROOT, rel), "utf8"));
    for (const banned of ["window.", "document.", "fetch(", "XMLHttpRequest", "navigator.", "localStorage"]) {
      assert.ok(!code.includes(banned), `${rel} 里出现了 ${banned}（契约禁止）`);
    }
    assert.ok(!code.includes("setInterval"), `${rel} 里出现 setInterval（只允许一条 rAF 循环）`);
  }
});

test("skin.css：用 :scope（伪类）而不是 ::scope，且安全区兜底写成 0px", () => {
  // 注释里会提到 `::scope` 这个错误写法，扫描前先剥掉注释
  const css = readFileSync(join(PKG_ROOT, "skin.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(css.includes(":scope {"), "舞台自身规则必须用 :scope");
  assert.ok(!css.includes("::scope"), "::scope 不是合法伪元素，整条规则会被丢掉");
  assert.ok(
    css.includes("var(--skin-inset-top, 0px)") && css.includes("var(--skin-inset-bottom, 0px)"),
    "HUD 必须让开 --skin-inset-top / --skin-inset-bottom，兜底写 0px",
  );
  assert.ok(!/\.playerview\[data-skin=/.test(css), "插件不该自己写舞台选择器前缀");
});

test("skin.json：id 与目录名一致，且声明了频谱能力", () => {
  const manifest = JSON.parse(readFileSync(join(PKG_ROOT, "skin.json"), "utf8"));
  assert.equal(manifest.id, "cube-matrix");
  assert.equal(manifest.apiVersion, "3.0");
  assert.equal(manifest.capabilities.spectrum, true, "不吃频谱就没有起伏");
  assert.ok(manifest.colors && manifest.colors.bg && manifest.colors.fg, "colors 必须齐");
});
