/* ==========================================================================
   atlas/tests/atlas-logic.test.js — 铅字盘的纯逻辑自检（node --test）
   --------------------------------------------------------------------------
   跑法（仓库根）：
       node --test "plugins/style/atlas/tests/*.test.js"

   这里只测**不需要浏览器**的那三层：装箱（lib/pack.js）、摄像机（lib/camera.js）、
   时间（lib/timing.js），外加对 skin.js / skin.css / skin.json 的**静态纪律扫描**
   （零 import、只有一个 rAF、不写死宿主设置、安全区兜底、不留残留）。

   为什么这些断言值这个价（都是踩过的坑）：
     · 「四根等长的条必须排成两行两列」—— 天际线候选位置一旦四舍五入，装箱会塌成
       阶梯，密度从 1.00 掉到 0.67，而画面只是"看着有点松"，不报错；
     · 「确定性」—— 布局是位置/序号的纯函数，任何 Math.random 都会让每次重算跳一下；
     · 「一根都不掉」—— 空行/间奏行必须占位，丢一行整篇歌词的行号就错位；
     · 「阻尼不过冲」—— 摄像机过冲会在当前条上"弹"一下，比慢一点难看得多。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as pack from "../lib/pack.js";
import * as camera from "../lib/camera.js";
import * as timing from "../lib/timing.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const root = (p) => join(PKG, p);
const readText = (p) => readFileSync(root(p), "utf8");
/** 去掉注释后再做静态扫描：注释里会写"不写 :root"这种字样 */
const stripComments = (s) =>
  String(s)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/* --------------------------------------------------------------------------
   注入式度量：与浏览器里 `measureText / REF_PX` 同口径（中文 1em、拉丁 ~0.55em）
   -------------------------------------------------------------------------- */
const measure = (s) => {
  let w = 0;
  for (const ch of String(s ?? "")) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x2e80 && cp <= 0x9fff) w += 1;
    else if (/\s/.test(ch)) w += 0.35;
    else if (cp >= 0x41 && cp <= 0x5a) w += 0.68;
    else w += 0.55;
  }
  return w;
};
const split = (s) => Array.from(String(s ?? ""));

const SAMPLE = [
  "夜空中最亮的星",
  "能否听清",
  "那仰望的人",
  "心底的孤独和叹息",
  "我祈祷拥有一颗透明的心灵",
  "和会流泪的眼睛",
  "给我再去相信的勇气",
  "越过谎言去拥抱你",
  "每当我找不到存在的意义",
  "每当我迷失在黑夜里",
  "夜空中最亮的星",
  "请指引我靠近你",
  "Take me to your heart",
  "つきあかり",
  "",
  "Oh——",
];
/** 造 n 行"真实感"歌词（含空行、英文行、日文行、长行） */
const sampleLines = (n) =>
  Array.from({ length: n }, (_, i) => ({ time: i * 2600 + 1200, text: SAMPLE[i % SAMPLE.length] }));

const build = (lines, opts = {}) =>
  pack.buildBars(lines, { measure, split, gutter: pack.DEFAULT_GUTTER, minLen: pack.DEFAULT_MIN_LEN, ...opts });

function overlaps(rects, tol = 1e-6) {
  const bad = [];
  for (let a = 0; a < rects.length; a += 1) {
    for (let b = a + 1; b < rects.length; b += 1) {
      const A = rects[a];
      const B = rects[b];
      if (!A || !B) continue;
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ox > tol && oy > tol) bad.push([a, b, ox, oy]);
    }
  }
  return bad;
}

/* ==========================================================================
   1. 度量
   ========================================================================== */

test("measureOffsets：累积子串口径，末位恰好等于整串宽度", () => {
  const text = "你好ab cd";
  const off = pack.measureOffsets(text, measure, split);
  assert.equal(off.chars.length, 7);
  assert.equal(off.xs.length, 7);
  assert.equal(off.xs[0], 0);
  for (let k = 0; k < off.chars.length; k += 1) {
    assert.ok(
      Math.abs(off.xs[k] - measure(off.chars.slice(0, k).join(""))) < 1e-9,
      `第 ${k} 个字素的偏移必须等于前 k 个字素的实测宽度`
    );
  }
  assert.ok(Math.abs(off.w - measure(text)) < 1e-9, "整串宽度必须等于 measure(text)");
  const expectV = off.chars.reduce((a, ch) => a + Math.max(pack.MIN_GLYPH_ADV, measure(ch)), 0);
  assert.ok(Math.abs(off.vlen - expectV) < 1e-9, "竖排长度 = Σ max(最小字高, 单字宽)");
  assert.equal(pack.measureOffsets("", measure, split).w, 0);
});

test("measureOffsets：字素切分用注入的 split（不能退化成按码位）", () => {
  const text = "e\u0301x"; // e + 组合重音 = 一个字素
  const graphemes = ["e\u0301", "x"];
  const off = pack.measureOffsets(text, measure, () => graphemes);
  assert.equal(off.chars.length, 2, "必须按注入的 splitGraphemes 切");
  assert.deepEqual(off.chars, graphemes);
});

/* ==========================================================================
   2. 造条与容器宽度
   ========================================================================== */

test("buildBars：行数一根不少，空行/纯空白也有占位长度", () => {
  const lines = [
    { time: 0, text: "第一行" },
    { time: 1000, text: "" },
    { time: 2000, text: "   " },
    { time: 3000, text: "第四行" },
  ];
  const { bars, width, maxLen } = build(lines);
  assert.equal(bars.length, lines.length);
  bars.forEach((b, i) => assert.equal(b.i, i, "条下标必须与行下标严格一致"));
  assert.ok(Math.abs(bars[1].len - pack.DEFAULT_MIN_LEN) < 1e-9, "空行要有占位长度");
  assert.ok(Math.abs(bars[2].len - pack.DEFAULT_MIN_LEN) < 1e-9, "纯空白行同样占位");
  assert.ok(bars[1].vlen >= pack.DEFAULT_MIN_LEN);
  assert.ok(Math.abs(maxLen - Math.max(...bars.map((b) => b.len))) < 1e-9);
  assert.ok(Math.abs(width - 2 * (maxLen + pack.DEFAULT_GUTTER)) < 1e-3, "容器宽 = 2 ×（最长条 + 留缝）");
});

test("buildBars：有译文的条更厚（副行不许挤掉正文）", () => {
  const plain = build([{ time: 0, text: "夜空中最亮的星" }]).bars[0];
  const dual = build([{ time: 0, text: "夜空中最亮的星", trans: ["The brightest star"] }]).bars[0];
  assert.ok(Math.abs(plain.thick - pack.DEFAULT_THICKNESS) < 1e-9);
  assert.ok(dual.thick > plain.thick + 0.5, "双语条必须厚出副行带");
  assert.equal(dual.trans, "The brightest star");
  const p = pack.packStrip([plain, dual], { width: 2 * (plain.len + 0.16), gutter: 0.16 });
  assert.equal(overlaps(p.rects).length, 0, "厚条与薄条不许重叠");
});

test("sizeFor：横竖两个朝向的尺寸互换算得对", () => {
  const bar = { len: 6, vlen: 7.5, thick: 1.25 };
  const g = 0.16;
  assert.deepEqual(pack.sizeFor(bar, 0, g), { w: 6.16, h: 1.41 });
  assert.deepEqual(pack.sizeFor(bar, 1, g), { w: 1.41, h: 7.66 });
});

/* ==========================================================================
   3. 装箱
   ========================================================================== */

test("装箱：四根等长的条必须正好排成 2×2（天际线候选精度回归）", () => {
  const lines = ["aaaa", "bbbb", "cccc", "dddd"].map((t, i) => ({ time: i * 1000, text: t }));
  const { bars, width, thickness } = build(lines);
  const p = pack.packStrip(bars, { width, gutter: pack.DEFAULT_GUTTER, mix: 0 });
  const cell = thickness + pack.DEFAULT_GUTTER;
  assert.equal(overlaps(p.rects).length, 0);
  assert.ok(
    Math.abs(p.H - cell * 2) < 1e-6,
    `四根等长的条应该两行放完（期望高 ${(cell * 2).toFixed(2)}，实际 ${p.H.toFixed(2)}）—— ` +
      "大于它说明候选位置被四舍五入过，装箱塌成了阶梯"
  );
  assert.ok(p.density > 0.999, `密度应该接近 1（实际 ${p.density.toFixed(3)}）`);
  assert.equal(p.flipped, 0, "两根并排刚好填满一行时不该翻成竖的");
});

test("装箱：真实歌词样本 —— 不重叠、不掉行、确定性、密度达标", () => {
  const lines = sampleLines(120);
  const { bars, width } = build(lines);
  const p = pack.packStrip(bars, { width, gutter: pack.DEFAULT_GUTTER, mix: pack.MIX_TOLERANCE });
  const p2 = pack.packStrip(bars, { width, gutter: pack.DEFAULT_GUTTER, mix: pack.MIX_TOLERANCE });

  assert.equal(p.rects.length, lines.length, "一根都不能掉");
  assert.equal(p.rects.filter(Boolean).length, lines.length, "每根都要有落点");
  assert.equal(overlaps(p.rects).length, 0, "任何两根都不许重叠（0.5px 容差）");
  assert.ok(p.H > 0 && p.density > 0, "容器高与密度必须有意义");
  assert.equal(JSON.stringify(p.rects), JSON.stringify(p2.rects), "同一份输入两次装箱必须逐字节相同");
  assert.deepEqual(p.order, p2.order, "放置顺序也必须确定");
  assert.equal(p.rects[2].dir, p2.rects[2].dir, "朝向打乱是 hash 驱动的确定量");

  const shelf = pack.shelfHeight(bars, width, pack.DEFAULT_GUTTER);
  assert.ok(p.H < shelf, `天际线必须优于货架基线（${p.H.toFixed(2)} < ${shelf.toFixed(2)}）`);
  assert.ok(p.density >= 0.6, `密度不能低于 0.6（实际 ${p.density.toFixed(3)}）`);
  // 读数：自检脚本会打印这一行，方便和浏览器里的 data-density 对账
  console.log(
    `      · 装箱读数：${lines.length} 行 → W=${p.W.toFixed(2)}em H=${p.H.toFixed(2)}em ` +
      `密度=${p.density.toFixed(3)} 货架=${shelf.toFixed(2)}em 翻向=${p.flipped}`
  );
});

test("装箱：候选位置必须精确（贴着上一条右边缘要能进去）", () => {
  const sky = [
    { x: 0, w: 2.3600000000000003, y: 1.41 },
    { x: 2.3600000000000003, w: 2.3600010000000005, y: 0 },
  ];
  // 容器宽度与 buildBars 一致（多一个 1e-6 的余量）：这根条正好能贴着右边缘落下
  const W = 2 * (2.2 + 0.16) + 1e-6;
  const cands = pack.skylineCandidates(sky, 2.36, W);
  const fit = cands.map((x) => pack.skylineFitAt(sky, x, 2.36).y);
  assert.ok(
    cands.some((x, i) => Math.abs(x - 2.3600000000000003) < 1e-9 && fit[i] === 0),
    "x = 前一段右边缘处必须判成「搭在下一条上」（y=0），不能被浮点误差判成重叠"
  );
});

test("装箱：朝向打乱（mix）不破坏合法性，密度损失有界", () => {
  const lines = sampleLines(90);
  const { bars, width } = build(lines);
  const base = pack.packStrip(bars, { width, gutter: pack.DEFAULT_GUTTER, mix: 0 });
  for (const mix of [0.25, 0.5, 1]) {
    const p = pack.packStrip(bars, { width, gutter: pack.DEFAULT_GUTTER, mix });
    assert.equal(overlaps(p.rects).length, 0, `mix=${mix} 时不许重叠`);
    assert.equal(p.rects.length, lines.length);
    assert.ok(p.flipped <= lines.length, "翻向数不可能超过条数");
    assert.ok(
      p.density >= base.density - 0.12,
      `mix=${mix} 的密度损失必须受控（${p.density.toFixed(3)} vs ${base.density.toFixed(3)}）`
    );
  }
  assert.equal(pack.packStrip(bars, { width, gutter: pack.DEFAULT_GUTTER, mix: 1 }).flipped >= 0, true);
});

test("装箱：退化输入不抛异常（0 根 / 1 根 / 超长单根）", () => {
  const empty = pack.packStrip([], { width: 10, gutter: 0.16 });
  assert.deepEqual(empty.rects, []);
  assert.equal(empty.H, 0);
  assert.equal(empty.density, 0);

  const one = pack.packStrip([{ i: 0, len: 9, vlen: 9, thick: 1.25 }], { width: 18.32, gutter: 0.16 });
  assert.equal(one.rects.length, 1);
  assert.equal(one.rects[0].dir, 0);
  assert.ok(one.rects[0].x >= 0 && one.rects[0].x + one.rects[0].w <= 18.32 + 1e-6);

  const long = [{ i: 0, len: 40, vlen: 12, thick: 1.25 }];
  const p = pack.packStrip(long, { width: 5, gutter: 0.16 });
  assert.equal(p.rects.length, 1, "再挤也不能把行丢掉（兜底分支）");
});

/* ==========================================================================
   4. 取用：tightRect / hitTest / intersects
   ========================================================================== */

test("tightRect：去掉留缝，且不会退化成 0 尺寸", () => {
  const t = pack.tightRect({ x: 1, y: 2, w: 3, h: 4 }, 0.16);
  assert.ok(Math.abs(t.x - 1.08) < 1e-9 && Math.abs(t.y - 2.08) < 1e-9);
  assert.ok(Math.abs(t.w - 2.84) < 1e-9 && Math.abs(t.h - 3.84) < 1e-9);
  const tiny = pack.tightRect({ x: 0, y: 0, w: 0.05, h: 0.05 }, 0.16);
  assert.ok(tiny.w > 0 && tiny.h > 0);
});

test("hitTest：边界、容差、重叠时优先给窄条", () => {
  const rects = [
    { x: 0, y: 0, w: 4, h: 2 },
    { x: 4, y: 0, w: 2, h: 4 },
    { x: 0, y: 2, w: 4, h: 2 },
  ];
  assert.equal(pack.hitTest(rects, 1, 1), 0);
  assert.equal(pack.hitTest(rects, 5, 3), 1);
  assert.equal(pack.hitTest(rects, 1, 3), 2);
  assert.equal(pack.hitTest(rects, 99, 99), -1);
  assert.equal(pack.hitTest(rects, 6.05, 1), -1, "刚好在外面不该命中");
  assert.equal(pack.hitTest(rects, 6.05, 1, 0.1), 1, "给了容差才该命中（容差是给窄条留的）");
  assert.equal(pack.hitTest(rects, -0.05, 1, 0.1), 0, "左侧容差同样有效");

  /* 大条与小条重叠时，命中小条（竖条更窄，点谁是谁） */
  const ov = [
    { x: 0, y: 0, w: 10, h: 2 },
    { x: 3, y: 0, w: 1.4, h: 8 },
  ];
  assert.equal(pack.hitTest(ov, 3.5, 1), 1);
  assert.equal(pack.hitTest(ov, 8, 1), 0);
});

test("intersects：视口剔除要能真剔掉", () => {
  const r = { x: 10, y: 10, w: 4, h: 2 };
  assert.equal(pack.intersects(r, { x0: 0, y0: 0, x1: 20, y1: 20 }), true);
  assert.equal(pack.intersects(r, { x0: 0, y0: 0, x1: 10, y1: 20 }), false, "恰好贴着左边界不算相交");
  assert.equal(pack.intersects(r, { x0: 14, y0: 0, x1: 20, y1: 20 }), false);
  assert.equal(pack.intersects(null, { x0: 0, y0: 0, x1: 1, y1: 1 }), false);
});

test("hash01：稳定、有界、不依赖 Math.random", () => {
  const a = Array.from({ length: 64 }, (_, i) => pack.hash01(i));
  const b = Array.from({ length: 64 }, (_, i) => pack.hash01(i));
  assert.deepEqual(a, b);
  assert.ok(a.every((v) => v >= 0 && v < 1));
  assert.equal(new Set(a).size, a.length, "相邻序号不该撞在同一个值上");
});

/* ==========================================================================
   5. 摄像机
   ========================================================================== */

const VIEW = () => camera.makeView({ left: 0, top: 88, w: 1280, h: 520, emPx: 22 });

test("摄像机：世界↔屏幕往返（命中测试全靠它）", () => {
  const view = VIEW();
  const cam = camera.createCamera({ cx: 12.5, cy: 40.25, k: 0.83 });
  for (const p of [{ x: 0, y: 0 }, { x: 12.5, y: 40.25 }, { x: -3, y: 91 }]) {
    const s = camera.worldToScreen(cam, view, p);
    const back = camera.screenToWorld(cam, view, s);
    assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
  }
  const center = camera.worldToScreen(cam, view, { x: cam.cx, y: cam.cy });
  const f = camera.viewFocus(view);
  assert.ok(Math.abs(center.x - f.x) < 1e-9 && Math.abs(center.y - f.y) < 1e-9, "机位中心要落在视口焦点上");
  assert.ok(f.y > view.top && f.y < view.top + view.h, "焦点必须在安全区内（让开宿主壳）");
});

test("摄像机：临界阻尼永不过冲，且最终精确落到目标", () => {
  const view = VIEW();
  const cam = camera.createCamera({ cx: 0, cy: 0, k: 1 });
  const target = { cx: 24, cy: 61, k: 0.72 };
  let prev = Infinity;
  for (let i = 0; i < 240; i += 1) {
    const before = Math.abs(cam.cx - target.cx);
    camera.stepCamera(cam, target, 16);
    const after = Math.abs(cam.cx - target.cx);
    assert.ok(after <= before + 1e-9, `第 ${i} 帧过冲了（${before} → ${after}）`);
    assert.ok(after <= prev + 1e-9, "距离必须单调收敛");
    prev = after;
    const sgnBefore = Math.sign(before);
    const sgnAfter = Math.sign(cam.cy - target.cy);
    void sgnBefore;
    void sgnAfter;
  }
  assert.equal(cam.cx, target.cx);
  assert.equal(cam.cy, target.cy);
  assert.equal(cam.k, target.k);

  /* 一帧就走完一半左右（τ≈220ms / 16ms 一帧） */
  const quick = camera.createCamera({ cx: 0, cy: 0, k: 1 });
  camera.stepCamera(quick, { cx: 10, cy: 0, k: 1 }, 16);
  const moved = quick.cx;
  assert.ok(moved > 0.5 && moved < 1.6, `16ms 大约走 7%（实际 ${(moved / 10).toFixed(3)}）`);
});

test("摄像机：切镜规则（太远就 cut，seek 一律 cut）", () => {
  const view = VIEW();
  const cam = camera.createCamera({ cx: 0, cy: 0, k: 1 });
  const span = Math.min(view.w, view.h);
  const s = view.emPx;
  const near = { cx: (span * 0.5) / s, cy: 0, k: 1 };
  const far = { cx: (span * 2.5) / s, cy: 0, k: 1 };
  assert.equal(camera.planMove(cam, near, view), "pan");
  assert.equal(camera.planMove(cam, far, view), "cut");
  assert.ok(camera.CUT_VIEWPORTS > 1, "切镜阈值必须大于一个视口（否则密集装箱白做）");
});

test("摄像机：取景让当前条在画面里，倍率被夹住，横向偏置有界", () => {
  const view = VIEW();
  const worldW = 42;
  const worldH = 60;
  for (const rect of [
    { x: 0, y: 0, w: 8, h: 1.25 },
    { x: 20, y: 30, w: 6, h: 9 },
    { x: worldW - 8, y: 60, w: 8, h: 1.25 },
  ]) {
    for (const lift of [0, 1]) {
      const cam = camera.cameraTarget(rect, view, { worldW, worldH, lift });
      assert.ok(cam.k >= camera.K_MIN - 1e-9 && cam.k <= camera.K_MAX + 1e-9, "k 必须被夹在 [K_MIN,K_MAX]");
      const c = camera.worldToScreen(cam, view, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
      const f = camera.viewFocus(view);
      assert.ok(
        Math.abs(c.x - f.x) <= view.w * (camera.BIAS_MAX + 0.02),
        `横向偏置不得超过视口宽的 ${camera.BIAS_MAX}`
      );
      assert.ok(c.y >= view.top && c.y <= view.top + view.h, "当前条的纵向位置必须落在安全区内");
    }
  }
  /* 抬起（lift=1）要略微推近，但不是换一档 */
  const a = camera.cameraTarget({ x: 0, y: 0, w: 6, h: 1.25 }, view, { worldW, worldH, lift: 0 });
  const b = camera.cameraTarget({ x: 0, y: 0, w: 6, h: 1.25 }, view, { worldW, worldH, lift: 1 });
  assert.ok(b.k > a.k && b.k / a.k < 1.12, "抬起补正应在 6% 量级");
});

test("摄像机：取景是 cover（铺满画面），不是 contain（缩在中间）", () => {
  const view = VIEW();
  /* 长歌：又窄又长 ⇒ 宽度定倍率，纵向一定会溢出（要靠巡游） */
  const tall = camera.framingScale(24, 120, view);
  assert.ok(
    Math.abs(tall - (view.w * 0.96) / (24 * view.emPx)) < 1e-9,
    "又窄又长的盘面必须按**宽度**铺满"
  );
  assert.ok(120 * view.emPx * tall > view.h, "纵向溢出是对的 —— 摄像机负责巡游");
  /* 短歌：又宽又扁 ⇒ 高度定倍率，横向溢出 */
  const flatH = 8;
  const flat = camera.framingScale(24, flatH, view);
  assert.ok(Math.abs(flat - (view.h * 0.96) / (flatH * view.emPx)) < 1e-9, "又宽又扁的盘面必须按**高度**铺满");
  assert.ok(24 * view.emPx * flat > view.w, "横向溢出是对的");
  /* contain 的写法（min）会让画面空掉一大半，这里明确否掉 */
  assert.ok(camera.framingScale(24, 120, view) > Math.min(1, 0.5));
  assert.equal(camera.framingScale(0, 0, view) >= camera.K_MIN, true);
});

test("摄像机：微滚转有界、静止归零", () => {
  assert.equal(camera.rollDeg(0), 0);
  for (const v of [-200, -20, -1, 1, 20, 200]) {
    assert.ok(Math.abs(camera.rollDeg(v)) <= camera.ROLL_MAX_DEG + 1e-9);
  }
  assert.ok(camera.rollDeg(20) > 0 && camera.rollDeg(-20) < 0, "方向要跟着移动方向");
  assert.ok(camera.ROLL_MAX_DEG <= 1.5, "微滚转必须小于 1.5°（再大就晕）");

  const cam = camera.createCamera({ cx: 0, cy: 0, k: 1 });
  const r = camera.stepCamera(cam, { cx: 0, cy: 30, k: 1 }, 16);
  assert.ok(Math.abs(r.roll) <= camera.ROLL_MAX_DEG);
  const still = camera.stepCamera(cam, camera.createCamera({ cx: cam.cx, cy: cam.cy, k: cam.k }), 16);
  assert.equal(still.roll, 0, "到站后必须完全水平");
  assert.equal(still.moved, false, "到站后必须报告'没动'（脏标记靠它省帧）");
});

test("摄像机：拉远看全貌时四角都在画面内", () => {
  const view = VIEW();
  const W = 30;
  const H = 140;
  const cam = camera.wholeWorldTarget(W, H, view);
  for (const p of [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: 0, y: H },
    { x: W, y: H },
  ]) {
    const s = camera.worldToScreen(cam, view, p);
    assert.ok(
      s.x >= view.left - 1 && s.x <= view.left + view.w + 1 && s.y >= view.top - 1 && s.y <= view.top + view.h + 1,
      `全貌拉远后世界角点仍在画面外：${JSON.stringify(s)}`
    );
  }
});

test("摄像机：航线亮度 —— 当前→下一句最亮，越远越淡", () => {
  const cur = camera.routeAlpha(5, 5);
  assert.ok(cur > camera.routeAlpha(6, 5), "当前→下一句要比再往前亮");
  assert.ok(camera.routeAlpha(6, 5) > camera.routeAlpha(7, 5));
  assert.ok(camera.routeAlpha(7, 5) > camera.routeAlpha(9, 5));
  assert.ok(camera.routeAlpha(1, 5) < cur, "唱过的只是余温");
  assert.ok(cur <= 0.7 && cur > 0.2);
  assert.deepEqual(camera.routeSegments([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0, 5), [{ from: 0, to: 1 }]);
  assert.deepEqual(camera.routeSegments([], 0, 1), []);
});

/* ==========================================================================
   6. 时间
   ========================================================================== */

test("播放钟：外推有上限，暂停时不走", () => {
  const clock = timing.createClock({ maxExtrapolateMs: 900 });
  clock.set(10_000, true, 1000);
  assert.equal(clock.at(1000), 10_000);
  assert.equal(clock.at(1400), 10_400);
  assert.equal(clock.at(99_999), 10_900, "外推必须有上限（补丁不来就冻住，不能比声音先唱完）");
  clock.set(12_000, false, 5000);
  assert.equal(clock.at(90_000), 12_000, "暂停时必须停在权威位置上");
  assert.equal(clock.playing, false);
  clock.set(NaN, true, 6000);
  assert.equal(clock.at(6000), 12_000, "非法位置不该污染状态");
});

test("字素分类：中/英/数/标点/空格", () => {
  assert.equal(timing.classify("字"), "cjk");
  assert.equal(timing.classify("あ"), "cjk");
  assert.equal(timing.classify("a"), "latin");
  assert.equal(timing.classify("Z"), "latin");
  assert.equal(timing.classify("7"), "digit");
  assert.equal(timing.classify("，"), "punct");
  assert.equal(timing.classify("."), "punct");
  assert.equal(timing.classify(" "), "space");
  assert.equal(timing.classify(""), "space");
  assert.ok(timing.charWeight("字") > timing.charWeight("a"));
  assert.ok(timing.charWeight("a") > timing.charWeight("，"));
  assert.equal(timing.charWeight(" "), 0);
});

test("合成时间轴：起点单调、单字封顶、唱完停住", () => {
  const chars = Array.from("夜空中最亮的星呀嘿哦");
  const line = { time: 0, text: chars.join("") };
  const next = { time: 9000 };
  const tl = timing.timedLine(line, next, { chars });
  assert.equal(tl.synth, true);
  assert.equal(tl.count, chars.length);
  for (let k = 1; k < tl.starts.length; k += 1) {
    assert.ok(tl.starts[k] >= tl.starts[k - 1], "起点必须单调不减");
  }
  for (let k = 0; k < tl.count; k += 1) {
    assert.ok(tl.ends[k] > tl.starts[k], "每个字都要有自己的时长");
    assert.ok(tl.ends[k] - tl.starts[k] <= timing.MAX_CHAR_MS + 1e-6, "单字时长必须封顶");
  }
  const span = tl.starts[tl.count - 1] - tl.starts[0];
  assert.ok(span <= timing.MAX_CHAR_MS * tl.count + 1e-6);
  assert.ok(tl.starts[tl.count - 1] < next.time, "不能拖到下一句里去");
});

test("合成时间轴：短句分摊、长间奏不吃亏、末字用相邻间距中位数", () => {
  const chars = Array.from("短句");
  const fast = timing.timedLine({ time: 0, text: "短句" }, { time: 700 }, { chars });
  assert.ok(fast.starts[1] - fast.starts[0] < timing.MAX_CHAR_MS, "句短就该唱得快");
  assert.ok(Math.abs(fast.ends[fast.count - 1] - 700) < 1e-6);

  const many = Array.from("一二三四五六七八");
  const long = timing.timedLine({ time: 0, text: many.join("") }, { time: 60_000 }, { chars: many });
  assert.ok(
    long.starts[many.length - 1] < 8000,
    "超长间奏里不能一个字慢慢亮到几十秒（必须封顶后停住）"
  );

  const words = [0, 400, 800, 1200, 3000];
  const tl = timing.timedLine({ time: 0, words, text: "五个字素" }, { time: 9000 }, { count: 5 });
  assert.equal(tl.synth, false);
  assert.deepEqual(tl.starts, words);
  assert.equal(tl.ends[4] - tl.starts[4], timing.medianGap(words), "末字兜底 = 相邻间距中位数（不被长音拖走）");
});

test("字级时间轴：words 长度对不上就退回合成（绝不能错位点亮）", () => {
  const chars = Array.from("四个字素");
  const bad = timing.timedLine({ time: 0, words: [0, 100], text: "四个字素" }, { time: 4000 }, { chars });
  assert.equal(bad.synth, true, "长度不匹配时必须退回合成");
  assert.equal(bad.count, 4);
  const good = timing.timedLine({ time: 0, words: [0, 100, 200, 300], text: "四个字素" }, { time: 4000 }, {
    chars,
  });
  assert.equal(good.synth, false);
  const reversed = timing.timedLine({ time: 0, words: [500, 100, 200], text: "三个字" }, { time: 9000 }, {
    count: 3,
  });
  assert.deepEqual(reversed.starts, [500, 500, 500], "倒挂的起点要被抹平，不能出现负时长");
  for (let k = 0; k < 3; k += 1) assert.ok(reversed.ends[k] > reversed.starts[k]);
});

test("落版进度：量化到档（静止的句子零重绘）、墨点两端归零", () => {
  const starts = [0, 100, 200];
  const p = timing.revealProgress(starts, 150, { durMs: 180, steps: 16 });
  assert.equal(p.length, 3);
  assert.equal(p[0], Math.round((150 / 180) * 16) / 16);
  assert.equal(p[1], Math.round((50 / 180) * 16) / 16);
  assert.equal(p[2], 0, "还没到点的字素进度是 0");
  const later = timing.revealProgress(starts, 9000, { durMs: 180, steps: 16 });
  assert.deepEqual(later, [1, 1, 1], "唱完就是终态（不该有残余的小数）");
  assert.equal(timing.revealProgress([], 100).length, 0);
  assert.equal(timing.inkBloom(0), 0);
  assert.equal(timing.inkBloom(1), 0);
  assert.ok(timing.inkBloom(0.5) > 0.9);
  assert.equal(timing.litCount(starts, -1), 0);
  assert.equal(timing.litCount(starts, 100), 2);
  assert.equal(timing.litCount(starts, 99999), 3);
  assert.equal(timing.litCount(null, 100), 0);
  assert.equal(timing.easeOutCubic(0), 0);
  assert.equal(timing.easeOutCubic(1), 1);
});

test("当前行：二分的边界（第一句之前是 -1）", () => {
  const lines = [{ time: 1000 }, { time: 5000 }, { time: 9000 }, { time: 9000 }];
  assert.equal(timing.lineIndexAt(lines, 0), -1);
  assert.equal(timing.lineIndexAt(lines, 999), -1);
  assert.equal(timing.lineIndexAt(lines, 1000), 0);
  assert.equal(timing.lineIndexAt(lines, 4999), 0);
  assert.equal(timing.lineIndexAt(lines, 5000), 1);
  assert.equal(timing.lineIndexAt(lines, 12_000), 3, "同秒多行取最后一个");
  assert.equal(timing.lineIndexAt([], 5000), -1);
  assert.equal(timing.lineIndexAt(null, 5000), -1);
});

test("曲末与间奏的判定", () => {
  const lines = [{ time: 0 }, { time: 3000 }, { time: 21_000 }];
  assert.equal(timing.isFinale(lines, 10_000, 6000), false);
  assert.equal(timing.isFinale(lines, 26_999, 6000), false);
  assert.equal(timing.isFinale(lines, 27_001, 6000), true);
  assert.equal(timing.isFinale([], 99_999), false);
  assert.equal(timing.isInterlude(lines, 1, 7000), true, "3s → 21s 之间是长间奏");
  assert.equal(timing.isInterlude(lines, 0, 7000), false);
  assert.equal(timing.isInterlude(lines, 2, 7000), false, "最后一句没有「下一句」");
  assert.equal(timing.isInterlude(lines, -1, 7000), false);
});

/* ==========================================================================
   7. 静态纪律扫描（skin.js / skin.css / skin.json）
   ========================================================================== */

test("skin.js：零项目 import、子模块透传 token、只有一个 rAF 循环", () => {
  const src = readText("skin.js");
  const code = stripComments(src);
  assert.ok(!/^\s*import\s/m.test(code), "不许有静态 import（相对 import 会丢掉 /skins 的 token）");
  assert.ok(!/from\s+["']\.\.?\//.test(code), "不许从包外引入任何东西");
  assert.ok(/new URL\(import\.meta\.url\)\.search/.test(code), "必须取入口 URL 的 query");
  assert.ok(/import\(`\.\/lib\/\$\{file\}\$\{Q\}`\)/.test(code), "子模块必须透传 token");
  assert.ok(/await load\("pack\.js"\)/.test(code) && /await load\("camera\.js"\)/.test(code) && /await load\("timing\.js"\)/.test(code));

  const rafTotal = (code.match(/requestAnimationFrame\(/g) || []).length;
  const rafTick = (code.match(/requestAnimationFrame\(\(\) => tick\(st\)\)/g) || []).length;
  assert.ok(rafTotal >= 1);
  assert.equal(rafTotal, rafTick, "所有 rAF 都必须是同一条 tick 循环（不许有第二个循环源）");
  assert.ok(/cancelAnimationFrame\(st\.raf\)/.test(code), "必须能取消");
  assert.ok(!/setInterval/.test(code), "不许用 setInterval");
  assert.ok(!/\bfetch\s*\(/.test(code), "不许 fetch");
  assert.ok(!/\beval\s*\(/.test(code), "不许 eval");
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(code), "不许自己存东西");
  assert.ok(!/--lyric-size\s*:/.test(code + readText("skin.css")), "不许写死宿主下发的歌词字号");
  assert.ok(/options\.lyricsFontSize|opt\.lyricsFontSize/.test(code), "字号必须从 options 读");
});

test("skin.js：关动效 ⇒ 不起帧；暂停 6s 停帧；destroy 不留残留", () => {
  const code = stripComments(readText("skin.js"));
  assert.ok(/if\s*\(!st\.animations\)\s*\{[^}]*haltFrames/.test(code), "关动效档必须掐掉帧链，一帧都不起");
  assert.ok(/IDLE_STOP_MS\s*=\s*6000/.test(code), "空闲停帧阈值必须是 6s");
  /* 真机上踩过：performanceMode 是字符串 "smooth" | "performance"，
     Boolean("smooth") 恒真 ⇒ 一直在跑性能兜底档（逐字落版整个消失）而自检全绿 */
  assert.ok(
    /performanceMode\s*===\s*"performance"/.test(code),
    'performanceMode 必须按字符串口径判（`=== "performance"`），不能 Boolean() 它'
  );
  assert.ok(/stopFrames\(st\)/.test(code) && /cancelAnimationFrame/.test(code));
  assert.ok(/removeEventListener/.test(code), "监听器必须能摘掉");
  assert.ok(/clearTimeout/.test(code), "定时器必须能清掉");
  assert.ok(/backgroundRoot\.innerHTML\s*=\s*""/.test(code), "整窗背景层的容器是我们填的，卸载要自己收干净");
  assert.ok(/ctx\.root\.innerHTML\s*=\s*""/.test(code), "只清内容，不删宿主的挂载点");
  assert.ok(!/remove\(\)/.test(code), "不许把宿主给的挂载点摘下来");
});

test("skin.js：频谱只碰绘制参数，不进几何", () => {
  const code = stripComments(readText("skin.js"));
  assert.ok(!/packStrip\([^)]*bass/.test(code), "频谱不许进装箱");
  assert.ok(!/buildBars\([^)]*bass/.test(code), "频谱不许进造条");
  assert.ok(/bass/.test(code), "但辉光/薄雾要真的用上它");
  assert.ok(/data-cols|"cols"/.test(code), "要暴露可观测的几何读数（自检与对账用）");
});

test("skin.js：必须暴露自检用的可观测读数", () => {
  const code = stripComments(readText("skin.js"));
  for (const key of ["bars", "cols", "h", "density", "line", "lit", "culled", "drew", "idle", "mix", "anim", "perf"]) {
    assert.ok(
      new RegExp(`setAttr\\(st\\.el, "${key}"`).test(code) || new RegExp(`"${key}",`).test(code),
      `缺少 data-${key} 读数`
    );
  }
});

test("skin.css：只写相对舞台根的选择器，不碰 :root/html/body/*，带安全区兜底", () => {
  const css = stripComments(readText("skin.css"));
  assert.ok(!/!important/.test(css), "不许 !important");
  assert.ok(!/:root/.test(css), "不许写 :root");
  assert.ok(!/(^|[\s,])html\b/.test(css), "不许写 html");
  assert.ok(!/(^|[\s,])body\b/.test(css), "不许写 body");
  assert.ok(!/(^|[\s,])\*\s*\{/.test(css), "不许裸通配选择器");
  assert.ok(!/\.playerview\[data-skin/.test(css), "选择器必须相对舞台根写");
  assert.ok(/var\(--skin-inset-top,\s*0px\)/.test(css), "上安全区必须让开，且兜底只能是 0px");
  assert.ok(/var\(--skin-inset-bottom,\s*0px\)/.test(css), "下安全区必须让开，且兜底只能是 0px");
  assert.ok(/--at-bg/.test(css) && /--at-fg/.test(css), "颜色必须走变量（JS 按清单/封面写）");
});

test("skin.json：清单字段齐全且与契约一致", () => {
  const json = JSON.parse(readText("skin.json"));
  assert.equal(json.id, "atlas");
  assert.equal(json.apiVersion, "3.0");
  assert.equal(json.entry, "skin.js");
  assert.deepEqual(json.styles, ["skin.css"]);
  assert.equal(json.order, 280);
  assert.equal(json.capabilities.background, true, "铺满整窗是本样式的立身之本");
  assert.equal(json.capabilities.spectrum, true);
  assert.equal(json.capabilities.interactive, true);
  for (const k of ["bg", "fg", "accent"]) {
    assert.match(json.colors[k], /^#[0-9a-f]{6}$/i, `colors.${k} 必须是 6 位十六进制`);
  }
  assert.ok(json.description.length > 20, "描述要能让人一眼看懂这个样式在干什么");
  assert.ok(existsSync(root(json.icon.file)), "图标文件必须存在");
  assert.ok(existsSync(root("README.md")), "样式包要有自己的说明");
});

test("配色对比度：正文/挡板/强调色都得看得见", () => {
  const json = JSON.parse(readText("skin.json"));
  const rgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const lum = (c) => {
    const f = (v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const contrast = (a, b) => {
    const la = lum(a);
    const lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const bg = rgb(json.colors.bg);
  const fg = rgb(json.colors.fg);
  const accent = rgb(json.colors.accent);
  /* 挡板是 bg 的 90% 不透明压在画面上：最坏情况就是 bg 本身 */
  assert.ok(contrast(bg, fg) >= 4.5, `正文对比度不足：${contrast(bg, fg).toFixed(2)}:1`);
  assert.ok(contrast(bg, accent) >= 2.2, `强调色在底上太暗：${contrast(bg, accent).toFixed(2)}:1`);
});
