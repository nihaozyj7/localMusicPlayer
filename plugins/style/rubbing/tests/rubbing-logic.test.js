// @ts-nocheck
/* ==========================================================================
   rubbing/tests/rubbing-logic.test.js — 「拓印」的纯逻辑 + 静态契约自检
   --------------------------------------------------------------------------
   跑法（在仓库根目录）：
     node --test "plugins/style/rubbing/tests/*.test.js"

   这一份**不碰浏览器**：色板 / 字形采样 / 粒子场全是纯函数，直接喂数组断言。
   画布像素级的验收在 rubbing-check.mjs（自带静态服务 + 假宿主 + 无头 Edge）。
   ========================================================================== */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const readPkg = (rel) => readFileSync(path.join(PKG, rel), "utf8");

const pal = await import(new URL("../lib/palette.js", import.meta.url).href);
const gl = await import(new URL("../lib/glyph.js", import.meta.url).href);
const fd = await import(new URL("../lib/field.js", import.meta.url).href);

/* ==========================================================================
   一、色板（封面像素 → 颜色阶梯）
   ========================================================================== */

/** 造一张 w×h 的 RGBA 位图：cb(x,y) 返回 [r,g,b,a] */
function makeBitmap(w, h, cb) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b, a] = cb(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a === undefined ? 255 : a;
    }
  }
  return data;
}

test("色板: hex 解析/格式化与亮度", () => {
  assert.deepEqual(pal.parseHex("#ff8800"), [255, 136, 0]);
  assert.deepEqual(pal.parseHex("f80"), [255, 136, 0]);
  assert.equal(pal.parseHex("nope"), null);
  assert.equal(pal.parseHex(""), null);
  assert.equal(pal.toHex([255, 136, 0]), "#ff8800");
  assert.equal(pal.toHex([300, -20, 0]), "#ff0000", "越界要夹住");
  assert.equal(pal.toHex([1, 2, 3]), "#010203", "要补零");
  assert.ok(pal.luma([255, 255, 255]) > pal.luma([0, 0, 0]));
  assert.ok(Math.abs(pal.luma([255, 255, 255]) - 1) < 1e-6);
});

test("色板: 稀疏采样会跳过低 alpha 像素", () => {
  const w = 8;
  const h = 8;
  const data = makeBitmap(w, h, (x, y) => (x < 4 ? [200, 40, 40, 255] : [10, 10, 10, 0]));
  const s = pal.samplePixels(data, w, h, { step: 1, alphaMin: 24 });
  assert.equal(s.n, 32, "只有左半边 4×8 是有内容的");
  for (let i = 0; i < s.n; i += 1) {
    assert.ok(s.rgb[i * 3] > 100, "透明像素不该被采到");
  }
});

test("色板: 阶梯是暗→亮且空桶用邻居插值补上", () => {
  // 只有两极（纯黑 + 纯白）的封面：中间 22 个桶都是空的
  const data = makeBitmap(16, 16, (x) => (x < 8 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  const sample = pal.samplePixels(data, 16, 16, { step: 1 });
  const lut = pal.buildLut(sample, { levels: 24 });
  assert.equal(lut.length, 24);
  const lums = lut.map((c) => pal.luma(c));
  for (let i = 1; i < lums.length; i += 1) {
    assert.ok(lums[i] >= lums[i - 1] - 0.02, `第 ${i} 层比上一层暗了（${lums[i - 1]} → ${lums[i]}）`);
  }
  assert.ok(lums[0] < 0.02, "第一层应当是最暗的");
  assert.ok(lums[23] > 0.9, "最后一层应当是最亮的");
});

test("色板: 单色封面不会让画面出现黑洞", () => {
  const data = makeBitmap(8, 8, () => [90, 60, 40, 255]);
  const lut = pal.buildLut(pal.samplePixels(data, 8, 8, { step: 1 }), { levels: 12 });
  assert.equal(lut.length, 12);
  for (const c of lut) {
    for (const v of c) assert.ok(Number.isFinite(v), "每层都必须是有限数");
  }
  const lums = lut.map((c) => pal.luma(c));
  assert.ok(Math.max(...lums) - Math.min(...lums) < 0.05, "单色封面的阶梯应当几乎是一条线");
});

test("色板: 完全没有封面时退化成清单配色的单色沙", () => {
  const p = pal.paletteFrom(null, 64, 64, { levels: 8 });
  assert.equal(p.hasCover, false);
  assert.equal(p.lut.length, 8);
  assert.ok(p.dominant.length === 3 && p.accent.length === 3);
  // 灰阶封面：强调色必须回退（不能拿一个"灰"当强调色）
  const gray = makeBitmap(16, 16, (x) => [x * 16, x * 16, x * 16, 255]);
  const p2 = pal.paletteFrom(gray, 16, 16, { levels: 12, fallback: { dark: [0, 0, 0], light: [255, 255, 255], accent: [185, 163, 126] } });
  assert.deepEqual(p2.accent, [185, 163, 126], "灰阶封面必须回退到清单强调色");
});

test("色板: 主色是出现最多的颜色，强调色偏向有彩度的层", () => {
  // 70% 暗蓝 + 30% 亮橙
  const data = makeBitmap(20, 10, (x) => (x < 14 ? [20, 30, 90, 255] : [240, 140, 40, 255]));
  const sample = pal.samplePixels(data, 20, 10, { step: 1 });
  const dom = pal.dominantOf(sample);
  assert.ok(dom[2] > dom[0], `主色应当是蓝的，实际 ${dom}`);
  const lut = pal.buildLut(sample, { levels: 16 });
  const acc = pal.accentOf(lut, [1, 2, 3]);
  assert.ok(pal.saturation(acc) > 0.2, `强调色应当有彩度，实际 ${acc}`);
  assert.ok(pal.luma(acc) > 0.15, "强调色不能太暗（要能当描边用）");
});

test("色板: 取色与打包", () => {
  const lut = [[0, 0, 0], [128, 128, 128], [255, 255, 255]];
  assert.deepEqual(pal.lutAt(lut, 0), [0, 0, 0]);
  assert.deepEqual(pal.lutAt(lut, 1), [255, 255, 255]);
  assert.deepEqual(pal.lutAt(lut, 0.5), [128, 128, 128]);
  assert.deepEqual(pal.lutAt([], 0.5), [200, 200, 200], "空阶梯要有兜底色");
  assert.equal(pal.packRgb([255, 136, 0]), 0xff8800);
  assert.equal(pal.packRgb([999, -5, 0]), 0xff0000);
  assert.ok(pal.contrastWith([255, 255, 255], [0, 0, 0]) > 20);
  assert.ok(pal.contrastWith([13, 12, 11], [13, 12, 11]) === 1);
});

/* ==========================================================================
   一之二、选字色的依据：**实际画出来的底**（回归：亮封面下 UI 整片消失）
   --------------------------------------------------------------------------
   背景是「封面 → blur + brightness(.46) → 暗纱」之后的合成色，而早期版本拿
   未压暗的封面主色去选字色 —— 封面比 ~0.17 亮就选出深色字，压在近黑的底上
   只有 ~1.1:1，宿主壳与 HUD 一起看不见。下面这组断言把两件事钉住：
     · 合成底一定是近黑、字色一定是亮色、对比度达标；
     · 参数与 skin.css 同源（改 CSS 忘了改常量会在这里亮红灯）。
   ========================================================================== */

/** 从 skin.css 里读一个数值当"第二意见"，避免常量与样式悄悄分叉 */
const CSS_TEXT = readPkg("skin.css");
const CSS_BRIGHTNESS = Number((/\.rbbg__img[\s\S]{0,200}?brightness\(([\d.]+)\)/.exec(CSS_TEXT) || [])[1]);
const CSS_VEIL = Number((/rgba\(8,\s*7,\s*6,\s*([\d.]+)\)/.exec(CSS_TEXT) || [])[1]);

test("色板: 选字色用合成底（亮封面也不会选出深色字）", () => {
  const light = [242, 236, 224];
  const dark = [18, 16, 14];
  const cases = [
    [255, 255, 255], // 纯白封面（最坏情况）
    [232, 217, 160],
    [212, 84, 30],
    [43, 79, 168],
    [128, 128, 128], // 中间灰
    [40, 40, 40],
    [0, 0, 0],
    null, // 无封面：按清单底色
  ];
  for (const c of cases) {
    const back = pal.backdropUnderCover(c);
    assert.equal(back.length, 3);
    // 注意：pal.luma 是"加权平均"（不做线性化），255/255 的白封面合成出来是 ~38/255
    // （≈0.15），这已经是**最亮**的情况了；正常封面都在 0.03 以下。
    assert.ok(pal.luma(back) < 0.2, `${c} 的合成底必须是近黑，实际亮度 ${pal.luma(back).toFixed(3)}`);
    const crLight = pal.contrastWith(back, light);
    const crDark = pal.contrastWith(back, dark);
    const fg = crLight >= crDark ? light : dark;
    assert.deepEqual(fg, light, `${c} 的合成底上必须选亮色字`);
    assert.ok(crLight >= 4.5, `对比度要达标（≥4.5），实际 ${crLight.toFixed(2)}`);
  }

  // 回归样本：同一个亮封面，用"未压暗的主色"会诱使选出深色字（旧 bug），
  // 用合成底则一定是亮色字。两条一起写，谁把依据改回去都会失败。
  const white = [255, 255, 255];
  assert.ok(
    pal.contrastWith(white, dark) > pal.contrastWith(white, light),
    "亮色主色本身确实会诱使选出深色字（这是那个 bug 的入口）"
  );
  const back = pal.backdropUnderCover(white);
  assert.ok(
    pal.contrastWith(back, dark) < pal.contrastWith(back, light),
    "合成底上必须反过来选亮色字"
  );

  // 参数与 skin.css 同源
  assert.equal(pal.BACKDROP_BRIGHTNESS, CSS_BRIGHTNESS, "BACKDROP_BRIGHTNESS 必须等于 .rbbg__img 的 brightness");
  assert.equal(pal.BACKDROP_VEIL, CSS_VEIL, "BACKDROP_VEIL 必须等于顶部暗纱的 alpha");
  assert.deepEqual(pal.BACKDROP_VEIL_RGB, [8, 7, 6], "暗纱颜色必须与 .rbbg__veil 一致");
  assert.ok(pal.BACKDROP_VEIL > 0 && pal.BACKDROP_VEIL < 1, "暗纱 alpha 要在 (0,1) 内");
});

test("契约: 选字色与上报都走合成底，且 accent 一起报给宿主", () => {
  const js = readPkg("skin.js");
  assert.match(js, /backdropUnderCover\(pal\.dominant\)/, "选字色必须走合成底");
  assert.ok(!/contrastWith\(pal\.dominant/.test(js), "不许再拿未压暗的封面主色选字色");
  assert.match(js, /accent:\s*palette\.toHex\(pal\.accent\)/, "reportBackdrop 必须带上 accent（宿主壳的强调色家族）");
});

/* ==========================================================================
   二、字形 → 目标点
   ========================================================================== */

/** 造一张"字"：中间一个 10×10 的实心方块 */
function boxAlpha(w, h, x0, y0, s) {
  return makeBitmap(w, h, (x, y) => (x >= x0 && x < x0 + s && y >= y0 && y < y0 + s ? [255, 255, 255, 255] : [0, 0, 0, 0]));
}

test("字形: 随机数是可重复的", () => {
  const a = gl.mulberry32(42);
  const b = gl.mulberry32(42);
  const c = gl.mulberry32(43);
  const seq = (r) => [r(), r(), r(), r()];
  assert.deepEqual(seq(a), seq(b), "同一个 seed 必须给同一串");
  assert.notDeepEqual(seq(gl.mulberry32(42)), seq(c));
  const r = gl.mulberry32(7);
  for (let i = 0; i < 100; i += 1) {
    const v = r();
    assert.ok(v >= 0 && v < 1, "必须落在 [0,1)");
  }
});

test("字形: alpha → 掩码（阈值 + 膨胀）", () => {
  const data = boxAlpha(20, 20, 5, 5, 10);
  const plain = gl.coverageFromAlpha(data, 20, 20, { alphaMin: 40, dilate: 0 });
  assert.equal(plain.ink, 100, "10×10 的方块正好 100 个墨点");
  const grown = gl.coverageFromAlpha(data, 20, 20, { alphaMin: 40, dilate: 1 });
  assert.equal(grown.ink, 144, "膨胀一圈后是 12×12");
  const strict = gl.coverageFromAlpha(data, 20, 20, { alphaMin: 250, dilate: 0 });
  assert.equal(strict.ink, 100, "白字的 alpha 足够大");
  const none = gl.coverageFromAlpha(makeBitmap(4, 4, () => [0, 0, 0, 0]), 4, 4, { dilate: 1 });
  assert.equal(none.ink, 0, "全透明不能膨胀出墨点");
});

test("字形: 统计量（墨点/质心/包围盒）", () => {
  const m = gl.coverageFromAlpha(boxAlpha(30, 20, 10, 4, 10), 30, 20, { dilate: 0 }).mask;
  const s = gl.maskStats(m, 30, 20);
  assert.equal(s.ink, 100);
  assert.equal(s.x0, 10);
  assert.equal(s.x1, 19);
  assert.equal(s.y0, 4);
  assert.equal(s.y1, 13);
  assert.ok(Math.abs(s.cx - 14.5 / 30) < 1e-6, `质心 x 应落在 14.5，实际 ${s.cx * 30}`);
  assert.ok(Math.abs(s.cy - 8.5 / 20) < 1e-6);
  const empty = gl.maskStats(new Uint8Array(6), 3, 2);
  assert.equal(empty.ink, 0);
  assert.equal(empty.cx, 0.5, "空掩码要有稳定的兜底（不能 NaN）");
});

test("字形: 摊平下标与抽样（数量/范围/可重复）", () => {
  const cov = gl.coverageFromAlpha(boxAlpha(16, 16, 2, 2, 6), 16, 16, { dilate: 0 });
  const idx = gl.inkIndex(cov.mask);
  assert.equal(idx.length, 36);
  for (const v of idx) assert.ok(v >= 0 && v < 256);

  const out = new Float32Array(50 * 2);
  const a = gl.pickTargets(idx, { w: 16, h: 16 }, 50, gl.mulberry32(1), out);
  assert.equal(a.length, 100);
  for (let i = 0; i < 50; i += 1) {
    assert.ok(a[i * 2] >= 0 && a[i * 2] <= 1, "归一化 x 越界");
    assert.ok(a[i * 2 + 1] >= 0 && a[i * 2 + 1] <= 1, "归一化 y 越界");
    // 点必须落在方块附近（2..8 像素 → 0.125..0.5 归一化，含 ±0.5px 抖动）
    assert.ok(a[i * 2] > 0.09 && a[i * 2] < 0.55, `点跑到方块外了：${a[i * 2]}`);
  }
  const b = gl.pickTargets(idx, { w: 16, h: 16 }, 50, gl.mulberry32(1), new Float32Array(100));
  assert.deepEqual(Array.from(a), Array.from(b), "同 seed 必须一致");

  const zero = gl.pickTargets(idx, { w: 16, h: 16 }, 0, gl.mulberry32(1), null);
  assert.equal(zero.length, 0);
  const emptyInk = gl.pickTargets(new Int32Array(0), { w: 4, h: 4 }, 8, gl.mulberry32(1), null);
  assert.equal(emptyInk.length, 16);
  assert.ok(emptyInk.every((v) => v === 0.5), "没有墨点时要给稳定兜底（画面中心）");
});

test("字形: 目标点等比映射到舞台上（不变形、居中）", () => {
  const stats = { ink: 100, cx: 0.5, cy: 0.5, x0: 0, y0: 0, x1: 9, y1: 9, w: 10, h: 10 };
  const pts = new Float32Array([0, 0, 1, 1, 0.5, 0.5]);
  const out = gl.fitPoints(pts, 3, { x: 0, y: 0, w: 100, h: 50 }, stats, new Float32Array(6));
  // 10×10 的方框放进 100×50：s = 5，居中 → x 偏移 25，y 偏移 0
  assert.ok(Math.abs(out[0] - 25) < 1e-3, `左上角应落在 25，实际 ${out[0]}`);
  assert.ok(Math.abs(out[1] - 0) < 1e-3);
  assert.ok(Math.abs(out[2] - 75) < 1e-3, `右下角应落在 75，实际 ${out[2]}`);
  assert.ok(Math.abs(out[3] - 50) < 1e-3);
  assert.ok(Math.abs(out[4] - 50) < 1e-3 && Math.abs(out[5] - 25) < 1e-3, "中心必须居中");
});

test("字形: 按 x 等墨量切段（笔画多的字分到更多粒子）", () => {
  const count = 12;
  const pts = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    pts[i * 2] = i / count;
    pts[i * 2 + 1] = 0.5;
  }
  const g = gl.groupByX(pts, count, 3);
  const hist = [0, 0, 0];
  for (let i = 0; i < count; i += 1) hist[g[i]] += 1;
  assert.deepEqual(hist, [4, 4, 4]);
  // 组号必须随 x 单调不减
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => pts[a * 2] - pts[b * 2]);
  for (let k = 1; k < order.length; k += 1) {
    assert.ok(g[order[k]] >= g[order[k - 1]], "组号必须跟着 x 递增");
  }
  const single = gl.groupByX(pts, count, 1);
  assert.ok(single.every((v) => v === 0), "只有一个字素时全部归 0 组");
  assert.equal(gl.groupByX(new Float32Array(0), 0, 4).length, 0);
});

test("字形: 末字时长取相邻间隔的中位数（长间奏不会亮十几秒）", () => {
  assert.equal(gl.median([3, 1, 2]), 2);
  assert.equal(gl.median([1, 2, 3, 4]), 2.5);
  assert.equal(gl.median([]), 0);
  assert.equal(gl.tailMs([0, 1000, 2000], 2000), 1000);
  // 间隔不规律时取中位数，而不是被最长的那一段带跑
  assert.equal(gl.tailMs([0, 100, 200, 5200], 5200), 100);
  assert.equal(gl.tailMs([0], 0), 400, "拿不到间隔时回退 400ms");
  assert.equal(gl.tailMs(null, 0), 400);
});

test("字形: 逐字亮度（ramp + 末字夹在句内 + 无字级歌词整行亮）", () => {
  const words = [0, 1000, 2000];
  assert.deepEqual(Array.from(gl.glyphLevels(words, 3, -10)), [0, 0, 0], "还没开口");
  assert.deepEqual(Array.from(gl.glyphLevels(words, 3, 1000)), [1, 0, 0], "到下一个字的时刻本字刚好满");
  assert.ok(Math.abs(gl.glyphLevels(words, 3, 500)[0] - 0.5) < 1e-6, "半个字时长应当走到一半");
  const half = gl.glyphLevels(words, 3, 1500);
  assert.equal(half[0], 1);
  assert.ok(Math.abs(half[1] - 0.5) < 1e-6);
  const mid = gl.glyphLevels(words, 3, 2500);
  assert.ok(Math.abs(mid[2] - 0.5) < 1e-6, `末字应当走到一半，实际 ${mid[2]}`);
  const done = gl.glyphLevels(words, 3, 3100);
  assert.equal(done[2], 1, "末字必须在 tail 内唱完");
  // ★ 长间奏：如果拿"行尾"当结束，pos=6000 时末字只有 0.22
  const late = gl.glyphLevels(words, 3, 6000, { lineEnd: 20000 });
  assert.equal(late[2], 1, "长间奏里最后一个字也必须在一句之内唱完");
  // 行尾比 tail 短时，以行尾为准（不能亮到下一行开始之后）
  const clipped = gl.glyphLevels(words, 3, 2200, { lineEnd: 2100 });
  assert.ok(clipped[2] <= 1 && clipped[2] > 0.5, `行尾要能夹住，实际 ${clipped[2]}`);
  // 没有字级歌词（或字素数对不上）→ 整行一起亮
  const uni = gl.glyphLevels(null, 4, 100);
  assert.deepEqual(Array.from(uni), [1, 1, 1, 1]);
  const mism = gl.glyphLevels([0, 500], 3, 100);
  assert.deepEqual(Array.from(mism), [1, 1, 1], "words 与字素数对不上时回退成整行");
});

test("字形: 已唱到的字素数", () => {
  const words = [0, 1000, 2000];
  assert.equal(gl.litGroups(words, 3, -1), 0);
  assert.equal(gl.litGroups(words, 3, 0), 1);
  assert.equal(gl.litGroups(words, 3, 1200), 2);
  assert.equal(gl.litGroups(words, 3, 99999), 3);
  assert.equal(gl.litGroups(null, 4, 0), 4, "没有字级歌词 = 整行都已唱到");
  assert.equal(gl.litGroups([1, 2], 3, 99), 3, "下标对不上时按整行处理");
});

/* ==========================================================================
   三、粒子场
   ========================================================================== */

const RECT = { x: 0, y: 0, w: 200, h: 100 };

test("粒子场: 池子是定长类型化数组（没有对象、没有每帧分配）", () => {
  const p = fd.createPool(1000);
  assert.equal(p.cap, 1000);
  for (const k of ["x", "y", "vx", "vy", "tx", "ty", "r", "ph"]) {
    assert.ok(p[k] instanceof Float32Array, `${k} 应当是 Float32Array`);
    assert.equal(p[k].length, 1000);
  }
  assert.ok(p.c instanceof Int32Array);
  assert.ok(p.g instanceof Int16Array);
  assert.ok(p.lit instanceof Uint8Array);
  assert.equal(fd.createPool(0).cap, 1, "至少一个粒子");
});

test("粒子场: 撒点 / 目标点 / 灰尘 / 上色", () => {
  const p = fd.createPool(64);
  const n = fd.seedPool(p, 40, gl.mulberry32(3), RECT);
  assert.equal(n, 40);
  assert.equal(p.count, 40);
  for (let i = 0; i < 40; i += 1) {
    assert.ok(p.x[i] >= 0 && p.x[i] <= 200, "x 必须落在矩形里");
    assert.ok(p.y[i] >= 0 && p.y[i] <= 100);
    assert.equal(p.g[i], -1, "刚撒下的粒子还没有归属");
    assert.equal(p.lit[i], 0);
  }
  // 目标点循环复用（粒子比点多时）
  const pts = new Float32Array([10, 20, 30, 40]);
  const groups = new Uint8Array([0, 1]);
  const colors = new Int32Array([2, 5]);
  fd.assignTargets(p, 40, pts, groups, { colors });
  assert.deepEqual([p.tx[0], p.ty[0]], [10, 20]);
  assert.deepEqual([p.tx[1], p.ty[1]], [30, 40]);
  assert.deepEqual([p.tx[2], p.ty[2]], [10, 20], "点用完了要循环");
  assert.equal(p.g[1], 1);
  assert.equal(p.c[0], 2);
  assert.equal(p.c[1], 5);
  assert.equal(fd.assignTargets(p, 40, new Float32Array(0), null), 0, "没有目标点就什么都不做");
  // 灰尘段
  fd.seedDust(p, 40, 50, gl.mulberry32(9), RECT);
  for (let i = 40; i < 50; i += 1) assert.equal(p.g[i], -1);
  assert.equal(p.g[41], -1);
});

test("粒子场: 上锁 / 撒沙 / 磁铁", () => {
  const p = fd.createPool(32);
  fd.seedPool(p, 32, gl.mulberry32(5), RECT);
  const groups = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) groups[i] = i % 4;
  const pts = new Float32Array(64);
  for (let i = 0; i < 32; i += 1) {
    pts[i * 2] = 100;
    pts[i * 2 + 1] = 50;
  }
  fd.assignTargets(p, 32, pts, groups);
  const changed = fd.markLit(p, 32, 2);
  assert.equal(changed, 16, "两组（16 个）应当被点亮");
  assert.equal(fd.markLit(p, 32, 2), 0, "第二次调用不该再报变化");
  assert.equal(fd.markLit(p, 32, 4), 16, "整行点亮时剩下的也要跟着亮");

  const before = p.vx[0];
  fd.scatter(p, 32, gl.mulberry32(11), 400);
  assert.notEqual(p.vx[0], before, "撒沙必须给到速度");

  const q = fd.createPool(8);
  fd.seedPool(q, 8, gl.mulberry32(1), { x: 0, y: 0, w: 10, h: 10 });
  for (let i = 0; i < 8; i += 1) {
    q.x[i] = 10 + i * 20; // 离指针很远
    q.vx[i] = 0;
  }
  q.x[0] = 0.5; // 贴着指针
  const hit = fd.applyMagnet(q, 8, { x: 0, y: 0, radius: 20, strength: 5000 });
  assert.equal(hit, 1, "只有半径内的粒子被推");
  assert.ok(q.vx[0] > 0, "指针左边的粒子应当被往右推");
  assert.equal(q.vx[1], 0, "半径外的不许动");
});

test("粒子场: 弹簧会收敛到目标，不会抖散", () => {
  const p = fd.createPool(1);
  fd.seedPool(p, 1, gl.mulberry32(1), RECT);
  p.x[0] = 0;
  p.y[0] = 0;
  p.tx[0] = 180;
  p.ty[0] = 80;
  p.g[0] = 0;
  p.lit[0] = 1;
  for (let i = 0; i < 240; i += 1) fd.step(p, 1, 1 / 60, { bass: 0 });
  const d = Math.hypot(p.tx[0] - p.x[0], p.ty[0] - p.y[0]);
  assert.ok(d < 2, `240 帧后应当基本就位，实际还差 ${d.toFixed(2)}px`);
  assert.ok(Number.isFinite(p.x[0]) && Number.isFinite(p.y[0]), "不允许 NaN");
});

test("粒子场: dt 会被钳住（切后台回来不能一次积分几秒）", () => {
  const a = fd.createPool(1);
  const b = fd.createPool(1);
  for (const p of [a, b]) {
    fd.seedPool(p, 1, gl.mulberry32(1), RECT);
    p.tx[0] = 150;
    p.ty[0] = 90;
    p.lit[0] = 1;
    p.x[0] = 0;
    p.y[0] = 0;
  }
  fd.step(a, 1, 3, { bass: 0 }); // 3 秒
  fd.step(b, 1, fd.PHYS.maxDt, { bass: 0 }); // 被钳到的上限
  assert.ok(Math.abs(a.x[0] - b.x[0]) < 1e-6, "3 秒必须被钳成 maxDt");
  assert.ok(a.x[0] < 150, "一帧不可能直接到目标（否则就是瞬移）");
});

test("粒子场: 暂停时重力接管并在地板上堆积", () => {
  const p = fd.createPool(64);
  fd.seedPool(p, 64, gl.mulberry32(2), { x: 0, y: 0, w: 300, h: 300 });
  for (let i = 0; i < 64; i += 1) {
    p.x[i] = 150;
    p.y[i] = 20 + (i % 8) * 3;
    p.tx[i] = 150;
    p.ty[i] = 20;
    p.vx[i] = 0;
    p.vy[i] = 0;
  }
  const c0 = fd.centroid(p, 64);
  for (let i = 0; i < 120; i += 1) fd.step(p, 64, 1 / 60, { paused: true, floor: 200 });
  const c1 = fd.centroid(p, 64);
  assert.ok(c1.y > c0.y + 20, `暂停后质心应当下落，实际 ${c0.y.toFixed(1)} → ${c1.y.toFixed(1)}`);
  for (let i = 0; i < 64; i += 1) {
    assert.ok(p.y[i] <= 200 + 1e-6, "不能穿过地板");
    assert.ok(Number.isFinite(p.y[i]));
  }
  for (let i = 0; i < 600; i += 1) fd.step(p, 64, 1 / 60, { paused: true, floor: 200 });
  for (let i = 0; i < 64; i += 1) {
    assert.ok(Math.abs(p.vy[i]) < 40, "堆积后速度必须收住（不能永远弹）");
  }
});

test("粒子场: 湍流只在有低频时起作用", () => {
  const quiet = fd.createPool(1);
  const loud = fd.createPool(1);
  for (const p of [quiet, loud]) {
    fd.seedPool(p, 1, gl.mulberry32(4), RECT);
    p.x[0] = 100;
    p.y[0] = 50;
    p.tx[0] = 100;
    p.ty[0] = 50;
    p.vx[0] = 0;
    p.vy[0] = 0;
  }
  for (let i = 0; i < 30; i += 1) {
    fd.step(quiet, 1, 1 / 60, { bass: 0 });
    fd.step(loud, 1, 1 / 60, { bass: 1 });
  }
  assert.ok(Math.abs(quiet.vx[0]) < Math.abs(loud.vx[0]) + 1e-9, "有低频时抖动应当更大");
  assert.ok(Math.abs(loud.vx[0]) > 1, "低频为该给到可见的冲量");
});

test("粒子场: 质心 / 就位率 / 分辨率", () => {
  const p = fd.createPool(4);
  p.cap = 4;
  p.x.set([0, 10, 0, 10]);
  p.y.set([0, 0, 10, 10]);
  p.tx.set([0, 10, 0, 10]);
  p.ty.set([0, 0, 10, 10]);
  const c = fd.centroid(p, 4);
  assert.equal(c.x, 5);
  assert.equal(c.y, 5);
  assert.equal(fd.settledRatio(p, 4, 1), 1);
  p.x[0] = 50;
  assert.equal(fd.settledRatio(p, 4, 1), 0.75);
  assert.equal(fd.settledRatio(fd.createPool(2), 0), 0, "没有粒子时不能除零");
  assert.equal(fd.resolutionScale(true), 0.5);
  assert.equal(fd.resolutionScale(false), 1);
});

test("粒子场: 粒子数按面积自适应且在 clamp 区间里", () => {
  assert.equal(fd.countForArea(1100 * 700, 1), 3850);
  assert.equal(fd.countForArea(1100 * 700, 2), 7700, "dpr2 要翻倍");
  assert.equal(fd.countForArea(3840 * 2160, 2), fd.MAX_PARTICLES, "4K+dpr2 顶到上限");
  assert.equal(fd.countForArea(100, 1), fd.MIN_PARTICLES, "再小也要有下限");
  assert.equal(fd.countForArea(0, 1), fd.MIN_PARTICLES);
  assert.equal(fd.countForArea(1100 * 700, 1, { performanceMode: true }), 1283, "performance 档 ÷3");
  assert.equal(fd.countForArea(1100 * 700, 1, { performanceMode: true }) < fd.countForArea(1100 * 700, 1), true);
});

test("粒子场: 帧预算与自适应降级（探针 P5 的控制器）", () => {
  assert.ok(Math.abs(fd.paintBudgetMs(45) - 30) < 0.1, "45fps 的预算应当约 30ms（含 1.35 余量）");
  assert.ok(fd.paintBudgetMs(0) > 0, "非法帧率要回退");
  assert.equal(fd.ema(-1, 20, 0.25), 20, "第一个样本直接采用");
  assert.ok(Math.abs(fd.ema(20, 40, 0.5) - 30) < 1e-6);

  assert.equal(fd.lodFactor(0), 1);
  assert.equal(fd.lodFactor(3), 0.3);
  assert.equal(fd.lodFactor(99), 0.3, "越界要夹住");
  assert.equal(fd.lodResolution(1), 1);
  assert.equal(fd.lodResolution(2), 0.5);
  assert.equal(fd.lodResolution(3), 0.5);

  const budget = 30;
  assert.equal(fd.nextLod(0, 50, budget, 1, 0), 0, "只慢一帧不许退档（GC 抖动会骗人）");
  assert.equal(fd.nextLod(0, 50, budget, 2, 0), 1, "连续两帧超预算才退一档");
  assert.equal(fd.nextLod(1, 50, budget, 3, 0), 2);
  assert.equal(fd.nextLod(3, 99, budget, 9, 0), 3, "最多退到 3 档");
  assert.equal(fd.nextLod(0, 5, budget, 5, 0), 0, "够快就不退");
  assert.equal(fd.nextLod(1, 50, budget, 9, 9000), 1, "开播 8 秒后不再退档（避免来回跳）");
});

test("粒子场: 停帧 / 限帧 / 时间码 / 频段", () => {
  assert.equal(fd.idleExpired(0, 5999, 6000), false);
  assert.equal(fd.idleExpired(0, 6000, 6000), true);
  assert.equal(fd.dueForFrame(0, 21, 22), false);
  assert.equal(fd.dueForFrame(0, 22, 22), true);
  assert.equal(fd.timecode(0), "00:00");
  assert.equal(fd.timecode(65000), "01:05");
  assert.equal(fd.timecode(3665000), "1:01:05");
  assert.equal(fd.timecode(-5), "00:00");
  assert.equal(fd.timecode(241000), "04:01");
  const bands = new Float32Array(128);
  bands.fill(0.2);
  bands[0] = 1;
  bands[127] = 0.8;
  assert.equal(fd.avgRange(bands, 0, 0), 1);
  assert.ok(Math.abs(fd.avgRange(bands, 1, 3) - 0.2) < 1e-6);
  assert.equal(fd.maxRange(bands, 120, 127).toFixed(3), "0.800");
  assert.equal(fd.avgRange(null, 0, 8), 0);
  assert.equal(fd.maxRange(new Float32Array(0), 0, 4), 0);
  assert.equal(fd.avgRange(bands, 200, 300), 0, "越界范围要给 0 而不是 NaN");
  assert.equal(fd.litTint(0), 0);
  assert.equal(fd.litTint(1), 1);
  assert.ok(fd.litTint(0.5) > 0.4 && fd.litTint(0.5) < 0.6);
});

/* ==========================================================================
   四、静态契约与包结构（与宿主 @scope / @layer 的边界）
   ========================================================================== */

const JS_FILES = ["skin.js", "lib/palette.js", "lib/glyph.js", "lib/field.js"];

test("包结构: 清单声明的文件都在，且带 README 与 tests", () => {
  const manifest = JSON.parse(readPkg("skin.json"));
  assert.equal(manifest.id, "rubbing");
  assert.equal(manifest.apiVersion, "3.0");
  assert.ok(Number.isFinite(manifest.order) && manifest.order >= 200, "第三方样式 order 必须 ≥ 200");
  assert.ok(manifest.order < 300, "order 应落在第三方区间（200..299）");
  for (const key of ["bg", "fg", "accent"]) {
    assert.match(manifest.colors[key], /^#[0-9a-f]{6}$/, `colors.${key} 不是 hex`);
  }
  assert.ok(
    pal.contrastWith(pal.parseHex(manifest.colors.fg), pal.parseHex(manifest.colors.bg)) >= 4.5,
    "清单 fg/bg 对比度不足（宿主壳会看不清）"
  );
  assert.ok(manifest.performance.budgetFps > 0 && manifest.performance.budgetFps <= 60);
  for (const f of [manifest.entry, ...manifest.styles, manifest.icon.file]) {
    assert.ok(existsSync(path.join(PKG, f)), `清单里声明的 ${f} 不存在`);
  }
  assert.ok(existsSync(path.join(PKG, "README.md")), "包必须带 README.md");
  assert.ok(existsSync(path.join(PKG, "tests")), "包必须带自己的 tests/");
  assert.ok(!existsSync(path.join(PKG, "node_modules")), "包内不许有 node_modules");
});

test("图标: 给 .skin-icon 当 mask 用（形状只由不透明度决定）", () => {
  const manifest = JSON.parse(readPkg("skin.json"));
  const icon = readPkg(manifest.icon.file);
  assert.match(icon, /viewBox="0 0 64 64"/);
  const markup = icon.replace(/<!--[\s\S]*?-->/g, "");
  assert.ok(!/currentColor/.test(markup), "mask 图标不该依赖 currentColor");
  assert.ok(!/url\(#|<style\b|\bstop-color\b/.test(markup), "mask 图标不该带渐变或内联样式");
  assert.ok(/fill="#fff"|stroke="#fff"/.test(markup), "形状应当是不透明白色");
});

test("契约: 零裸包名 import，且子模块透传入口 token", () => {
  for (const rel of JS_FILES) {
    const src = readPkg(rel);
    const specs = [];
    const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(src))) specs.push(m[1]);
    for (const s of specs) {
      assert.ok(
        s.startsWith("./") || s.startsWith("../"),
        `${rel} 里出现了非相对说明符 "${s}"：第三方样式只能包内相对 import（AGENTS.md §6.10）`
      );
    }
    if (rel === "skin.js") {
      assert.match(src, /new URL\(import\.meta\.url\)\.search/, "入口必须取自己的 query");
      assert.match(src, /import\(`\.\/lib\/\$\{file\}\$\{Q\}`\)/, "子模块必须拼上 query（否则 /skins 鉴权 403）");
    }
  }
});

test("契约: 不用网络 / 存储 / eval / 轮询定时器 / 宿主全局", () => {
  const banned = [
    [/\bfetch\s*\(/, "fetch"],
    [/XMLHttpRequest/, "XMLHttpRequest"],
    [/\bWebSocket\b/, "WebSocket"],
    [/\blocalStorage\b/, "localStorage"],
    [/\bsessionStorage\b/, "sessionStorage"],
    [/\bindexedDB\b/, "indexedDB"],
    [/\beval\s*\(/, "eval"],
    [/new\s+Function\b/, "new Function"],
    [/\bsetInterval\b/, "setInterval（皮肤不该有轮询）"],
    [/\bdocument\.documentElement\b/, "document.documentElement（宿主壳不许碰）"],
    [/\bdocument\.body\b/, "document.body"],
    [/\bwindow\./, "window.*（拿不到宿主对象，也不该拿）"],
    [/\bglobalThis\b/, "globalThis"],
  ];
  for (const rel of JS_FILES) {
    const src = readPkg(rel);
    for (const [re, label] of banned) {
      assert.ok(!re.test(src), `${rel} 里出现了 ${label}`);
    }
  }
});

test("契约: 只用契约里存在的 ctx 能力，且清单能力与用法一致", () => {
  const src = readPkg("skin.js");
  for (const dead of ["ctx.assets", "ctx.log", "ctx.audio", "ctx.covers("]) {
    assert.ok(!src.includes(dead), `skin.js 用了契约里不存在的 ${dead}`);
  }
  const allowed = new Set([
    "ctx.root",
    "ctx.sdk",
    "ctx.backgroundRoot",
    "ctx.options",
    "ctx.env",
    "ctx.media",
    "ctx.track",
    "ctx.playback",
    "ctx.spectrum",
    "ctx.actions",
    "ctx.defaultCover",
    "ctx.sdk.splitGraphemes",
    "ctx.actions?.seek",
    "ctx.actions?.reportBackdrop",
    "ctx.playback?.()",
    "ctx.track?.()",
    "ctx.media?.()",
    "ctx.options?.()",
    "ctx.env?.()",
    "ctx.spectrum?.()",
  ]);
  const used = new Set();
  const re = /\bctx(?:\?)?\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) used.add(`ctx.${m[1]}`);
  for (const u of used) {
    assert.ok(allowed.has(u), `skin.js 用了没核实的 ${u}（要么补进白名单，要么别用）`);
  }
  const manifest = JSON.parse(readPkg("skin.json"));
  assert.equal(manifest.capabilities.spectrum, src.includes("ctx.spectrum"), "spectrum 能力与用法不一致");
  assert.equal(manifest.capabilities.background, src.includes("ctx.backgroundRoot"), "background 能力与用法不一致");
  assert.equal(manifest.capabilities.interactive, src.includes("ctx.actions?.seek"), "interactive 能力与用法不一致");
});

test("契约: 帧循环纪律（一条 rAF / 不做轮询 / 尊重 animations）", () => {
  const src = readPkg("skin.js");
  const rafCalls = (src.match(/requestAnimationFrame\(/g) || []).length;
  assert.ok(rafCalls <= 3, `rAF 调用点太多（${rafCalls}），应当只有 frame() 的两处与 wake() 的一处`);
  assert.ok(!/setInterval/.test(src), "不许用 setInterval 做动画");
  assert.match(src, /IDLE_STOP_MS = 6000/, "必须遵守 6 秒停帧约定");
  assert.match(src, /options\(\)\.animations === false|animations !== false/, "必须读 animations 开关");
  assert.match(src, /reducedMotion/, "必须读 reducedMotion");
  assert.match(src, /performanceMode === "performance"/, "必须读 performance 档");
  assert.match(src, /cancelAnimationFrame/, "destroy/停帧必须真的取消 rAF");
  assert.match(src, /case "visibility"/, "必须先处理 visibility 补丁");
  assert.match(src, /dataset\.lod/, "必须把降级档位暴露出来（自检与排查）");
  // ctx.spectrum() 给的是快照 {bands, at}（契约 §SpectrumSnapshot）：
  // 写漏 .bands 会静默拿到一个对象，所有频段读数恒为 0（自检里踩过一次）
  assert.match(src, /snap\?\.bands|\.bands\b/, "必须从频谱快照里取 .bands（不是把快照当数组用）");
  assert.ok(!/avgRange\(spectrum\(\)/.test(src), "不许把 spectrum() 的返回值直接当数组喂给 avgRange");
});

test("契约: CSS 没有会被宿主包层静默吃掉的写法", () => {
  const css = readPkg("skin.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/!important/.test(css), "CSS 里不许有 !important");
  assert.ok(!/:root\b/.test(css), "CSS 里不许有 :root");
  assert.ok(!/\bhtml\b\s*[,{]/.test(css), "CSS 里不许有裸 html 选择器");
  assert.ok(!/\bbody\b\s*[,{]/.test(css), "CSS 里不许有裸 body 选择器");
  assert.ok(!/\.playerview\b/.test(css), "不许写宿主 .playerview 前缀（宿主会加 @scope）");
  assert.ok(!/\[data-skin=/.test(css), "不许按 data-skin 属性自选（那正是 @scope 的事）");

  for (const chunk of css.split("}")) {
    const selectorText = chunk.split("{")[0].trim();
    if (!selectorText || selectorText.startsWith("@")) continue;
    for (const sel of selectorText.split(",")) {
      const s = sel.trim();
      if (!s) continue;
      if (/^\d+%$/.test(s) || s === "from" || s === "to") continue;
      assert.ok(!s.includes("*"), `CSS 里不许用 * 选择器：${s}`);
      const first = s.split(/[\s>+~:.[#]+/)[0];
      assert.ok(!/^[a-z][a-z0-9-]*$/i.test(first), `CSS 里不许用裸标签选择器：${s}`);
    }
  }

  // 这一款特有的硬约束：filter 只允许出现在三处（画布对比度、灰尘微糊、背景大图）
  const allowedFilter = /\.rb__canvas|\.rb__dust|\.rbbg__img/;
  for (const c of css.split("}")) {
    if (!/(^|[;{\s])filter\s*:/.test(c)) continue;
    const rule = c.split("{")[0].trim();
    assert.ok(allowedFilter.test(rule), `filter 只允许出现在 .rb__canvas / .rb__dust / .rbbg__img 上，实际：${rule}`);
  }
  // 全屏大半径模糊只允许在背景层（docs/36：每帧全屏大模糊是最贵的操作之一）
  for (const c of css.split("}")) {
    if (!/blur\(/.test(c)) continue;
    const rule = c.split("{")[0].trim();
    assert.ok(/\.rbbg__img|\.rb__dust/.test(rule), `blur 只允许出现在背景图与灰尘层上，实际：${rule}`);
  }
  // 画布必须铺满舞台
  assert.match(css, /\.rb__canvas\s*\{[^}]*position:\s*absolute/, "画布必须绝对定位铺满舞台");
});

test("入口: 导出的形状符合契约", () => {
  const src = readPkg("skin.js");
  assert.match(src, /export default \{/);
  assert.match(src, /\bid:\s*"rubbing"/);
  for (const fn of ["mount", "update", "destroy"]) {
    assert.match(src, new RegExp(`\\b${fn}\\s*\\(`), `契约要求导出 ${fn}()`);
  }
  // destroy 必须自己清整窗背景层（宿主只清 ctx.root）
  const destroySrc = src.slice(src.indexOf("destroy(ctx)"));
  assert.match(destroySrc, /bgRoot\.innerHTML = ""/, "destroy 必须清空整窗背景层");
  assert.match(destroySrc, /bgRoot\.hidden = true/, "destroy 必须把整窗背景层藏起来");
  assert.match(destroySrc, /cancelAnimationFrame/, "destroy 必须停帧");
  assert.match(destroySrc, /removeEventListener/, "destroy 必须摘掉监听");
});
