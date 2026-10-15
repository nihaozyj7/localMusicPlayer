/* ==========================================================================
   ninja/tests/ninja-logic.test.js — 「水果忍者」的纯逻辑自检（node --test）
   --------------------------------------------------------------------------
   跑法（仓库根）：
       node --test "plugins/style/ninja/tests/*.test.js"

   只测**不需要浏览器**的那几层：帧预算与降级（lib/util.js）、果盘配色
   （lib/palette.js）、投掷与连击时刻表（lib/timeline.js）、程序化水果的几何与
   绘制调用（lib/fruit.js）、果汁与两半的积分（lib/juice.js），外加对
   skin.js / skin.css / skin.json 的**静态纪律扫描**。

   为什么这些断言值这个价（每一条都对应一个真会静默出错的地方）：
     · 「顶点时刻 == 切开时刻 == 该字起唱」—— 这一款全部的时间正确性都压在这条上，
       它一错，画面就只是"水果在飘"，而任何一处都不会报错；
     · 「words 长度与字素数对不上就退回合成」—— 多语言行的 words 只对应原文，
       照用就会把字点错位（rubbing / letterbox 都踩过）；
     · 「未唱到的字必须仍然读得清」—— abyss 曾在 39 条纯逻辑全绿的情况下做出
       1.31:1 的灰雾；这里把对比度做成硬断言；
     · 「确定性随机」—— 用 Math.random 的话，换封面/改尺寸重算会让整盘水果跳一下；
     · 「只有一个 rAF、关动效零帧、暂停 6 秒停帧」—— 这是宿主契约里的省电硬约束。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as util from "../lib/util.js";
import * as palette from "../lib/palette.js";
import * as timeline from "../lib/timeline.js";
import * as fruit from "../lib/fruit.js";
import * as juice from "../lib/juice.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const root = (p) => join(PKG, p);
const readText = (p) => readFileSync(root(p), "utf8");
/** 去掉注释后再做静态扫描：注释里会写"不写 :root""不许 Math.random"这种字样 */
const stripComments = (s) =>
  String(s)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** 假 2D context：只记录调用，用来验"绘制路径真的走了"（不需要真画布） */
function mkCtx() {
  const ops = [];
  const rec =
    (name) =>
    (...args) => {
      ops.push([name, ...args]);
    };
  const grad = { addColorStop: rec("stop") };
  return {
    ops,
    save: rec("save"),
    restore: rec("restore"),
    translate: rec("translate"),
    rotate: rec("rotate"),
    scale: rec("scale"),
    beginPath: rec("beginPath"),
    closePath: rec("closePath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    quadraticCurveTo: rec("quadraticCurveTo"),
    bezierCurveTo: rec("bezierCurveTo"),
    arc: rec("arc"),
    ellipse: rec("ellipse"),
    rect: rec("rect"),
    clip: rec("clip"),
    fill: rec("fill"),
    stroke: rec("stroke"),
    fillRect: rec("fillRect"),
    clearRect: rec("clearRect"),
    createRadialGradient: (...a) => {
      ops.push(["radial", ...a]);
      return grad;
    },
    createLinearGradient: (...a) => {
      ops.push(["linear", ...a]);
      return grad;
    },
  };
}
const countOps = (ctx, name) => ctx.ops.filter((o) => o[0] === name).length;

/** 合成封面：一张纯色图 */
function flatCover(w, h, rgb, a = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = a;
  }
  return data;
}

const MANIFEST = JSON.parse(readText("skin.json"));
const guessRgb = (hex) => palette.parseHex(hex);

/* ==========================================================================
   1. util.js —— 帧预算 / 降级 / 时间
   ========================================================================== */

test("util：夹取与抛物线（顶点速度为 0）", () => {
  assert.equal(util.clamp(NaN, 3, 9), 3, "非法值必须退到下界，不能把 NaN 传下去");
  assert.equal(util.clamp("abc", 3, 9), 3);
  assert.equal(util.clamp(-5, 3, 9), 3);
  assert.equal(util.clamp(100, 3, 9), 9);
  assert.equal(util.clamp01(0.5), 0.5);
  assert.equal(util.clamp01(Infinity), 1);
  assert.equal(util.arcRise(0), 0);
  assert.equal(util.arcRise(1), 1);
  assert.ok(Math.abs(util.arcRise(0.5) - 0.75) < 1e-9, "抛物线中点应为 0.75");
  let prev = -1;
  for (let i = 0; i <= 20; i += 1) {
    const v = util.arcRise(i / 20);
    assert.ok(v >= prev, "必须单调不减");
    prev = v;
  }
  // 顶点处速度 → 0：靠近 1 的那一点点位移必须远小于线性的 0.1%
  assert.ok(1 - util.arcRise(0.999) < 1e-5, "顶点处速度为 0（这正是「抛到位」的物理含义）");
});

test("util：确定性随机与哈希（画面里不许出现 Math.random）", () => {
  assert.equal(util.hashSeed("西瓜"), util.hashSeed("西瓜"));
  assert.notEqual(util.hashSeed("西瓜"), util.hashSeed("苹果"));
  assert.equal(util.hashSeed(""), 2166136261);
  const a = util.mulberry32(1234);
  const b = util.mulberry32(1234);
  const c = util.mulberry32(1235);
  const sa = [a(), a(), a()];
  const sb = [b(), b(), b()];
  const sc = [c(), c(), c()];
  assert.deepEqual(sa, sb, "同种子必须逐值相同");
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1, "必须落在 [0,1)");
});

test("util：频谱切片与通量", () => {
  const bands = new Float32Array(128).fill(0.5);
  assert.equal(util.avgRange(bands, 0, 12), 0.5);
  assert.equal(util.maxRange(bands, 96, 128), 0.5);
  assert.equal(util.avgRange(null, 0, 12), 0);
  assert.equal(util.avgRange(bands, 120, 999), 0.5, "越界切片不能崩");
  assert.equal(util.fluxOf(null, null), 0);
  const up = new Float32Array([0.1, 0.2, 0.3]);
  assert.ok(Math.abs(util.fluxOf(null, up) - 0.2) < 1e-6, "通量 = 正向差分均值");
  assert.equal(util.fluxOf(up, up), 0, "原地不动通量必须是 0");
  const down = new Float32Array([0, 0, 0]);
  assert.equal(util.fluxOf(up, down), 0, "只取正向差分");
});

test("util：时间码与千分位", () => {
  assert.equal(util.timecode(0), "00:00");
  assert.equal(util.timecode(59_999), "00:59");
  assert.equal(util.timecode(60_000), "01:00");
  assert.equal(util.timecode(-5), "00:00");
  assert.equal(util.timecode(NaN), "00:00");
  assert.equal(util.group3(0), "0");
  assert.equal(util.group3(1240), "1,240");
  assert.equal(util.group3(1234567), "1,234,567");
});

test("util：帧预算（performance 档按清单 budgetFps；暂停后降频但不为零）", () => {
  assert.ok(Math.abs(util.frameBudgetMs(true, true, 45) - 1000 / 45) < 1e-9);
  assert.equal(util.frameBudgetMs(false, true), 0, "smooth + 播放中 = 不限帧");
  assert.ok(util.frameBudgetMs(false, false) > 0, "暂停后仍要落果汁，不能立刻归零");
  assert.ok(util.frameBudgetMs(false, false, 45, 24) > util.frameBudgetMs(true, true, 45));
  const b = util.paintBudgetMs(45);
  assert.ok(b > 1000 / 45 && b < 1000 / 45 * 2, "绘制预算要留余量给合成");
});

test("util：自适应降级（连续两帧才退、快了才回、8 秒后封顶）", () => {
  assert.equal(util.lodFactor(0), 1);
  assert.equal(util.lodFactor(3), 0.3);
  assert.equal(util.lodFactor(99), 0.3, "越界必须夹住");
  assert.equal(util.lodResolution(0), 1);
  assert.equal(util.lodResolution(2), 0.5);
  assert.equal(util.nextLod(0, 30, 20, 2, 100), 1, "连续两帧超预算 → 退一档");
  assert.equal(util.nextLod(0, 30, 20, 1, 100), 0, "只慢一帧不退（抖动不该降级）");
  assert.equal(util.nextLod(0, 30, 20, 9, 9000), 0, "8 秒之后不再退");
  assert.equal(util.nextLod(3, 30, 20, 9, 100), 3, "已经到底就不动了");
  assert.equal(util.nextLod(2, 5, 20, 0, 100), 1, "回到预算内回一档");
  assert.equal(util.nextLod(0, 5, 20, 0, 100), 0);
  assert.equal(util.nextLod(2, 18, 20, 0, 100), 2, "只在明显有余量时才回档（避免来回跳）");
});

test("util：空闲判定、帧闸门、逐字进度", () => {
  assert.equal(util.idleExpired(0, 5999, 6000), false);
  assert.equal(util.idleExpired(0, 6001, 6000), true);
  assert.equal(util.dueForFrame(1000, 1000, 22), false);
  assert.equal(util.dueForFrame(1000, 1022, 22), true);
  assert.equal(util.dueForFrame(1000, 1001, 0), true, "预算为 0 = 不限帧");
  assert.equal(util.litCount([0, 100, 200], 150), 2);
  assert.equal(util.litCount(null, 100), 0);
  assert.equal(util.fillProgress(0, 130, 260, 32), 0.5);
  assert.equal(util.fillProgress(0, -10, 260, 32), 0);
  assert.equal(util.fillProgress(0, 1e9, 260, 32), 1);
  assert.equal(util.fillProgress(0, 1e9, 0, 32), 1, "时长为 0 不许出现除零");
  assert.equal(util.ema(-1, 10, 0.5), 10, "-1 是「还没有样本」");
  assert.equal(util.ema(10, 20, 0.5), 15);
});

/* ==========================================================================
   2. palette.js —— 果盘配色与对比度
   ========================================================================== */

test("palette：hex 往返与混色", () => {
  assert.deepEqual(palette.parseHex("#1b1008"), [27, 16, 8]);
  assert.deepEqual(palette.parseHex("1b1008"), [27, 16, 8]);
  assert.deepEqual(palette.parseHex("#fff"), [255, 255, 255]);
  assert.equal(palette.parseHex("nope"), null);
  assert.equal(palette.toHex([27, 16, 8]), "#1b1008");
  assert.equal(palette.toHex([999, -5, 12.6]), "#ff000d", "越界要夹住并四舍五入");
  assert.deepEqual(palette.mix([0, 0, 0], [10, 20, 30], 0.5), [5, 10, 15]);
  assert.deepEqual(palette.mix([0, 0, 0], [10, 20, 30], 5), [10, 20, 30], "t 越界夹到 0..1");
});

test("palette：亮度与 WCAG 对比度", () => {
  assert.ok(Math.abs(palette.contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 1e-6);
  assert.ok(Math.abs(palette.contrastRatio([255, 255, 255], [0, 0, 0]) - 21) < 1e-6);
  assert.ok(Math.abs(palette.contrastRatio([10, 10, 10], [10, 10, 10]) - 1) < 1e-9);
  assert.ok(palette.luminance([255, 255, 255]) > palette.luminance([128, 128, 128]));
});

test("palette：HSL 往返与最短色相夹角", () => {
  const [h0, s0, l0] = palette.rgbToHsl([255, 0, 0]);
  assert.ok(Math.abs(h0) < 1e-6 && Math.abs(s0 - 1) < 1e-6 && Math.abs(l0 - 0.5) < 1e-6);
  const back = palette.hslToRgb([0, 1, 0.5]);
  for (let i = 0; i < 3; i += 1) assert.ok(Math.abs(back[i] - [255, 0, 0][i]) < 1);
  assert.ok(Math.abs(palette.rgbToHsl([128, 128, 128])[1]) < 1e-9, "灰的饱和度必须是 0");
  assert.equal(palette.hueDelta(350, 10), 20);
  assert.equal(palette.hueDelta(10, 350), -20);
  assert.equal(palette.hueDelta(0, 180), 180);
});

test("palette：无封面时整套退回清单配色（bg/fg/accent 与 skin.json 同源）", () => {
  const bowl = palette.bowlFromCover(null, 0, 0);
  assert.equal(bowl.gray, true);
  assert.equal(bowl.source, "manifest");
  assert.deepEqual(bowl.bg, guessRgb(MANIFEST.colors.bg), "bg 必须就是清单里那个深木色");
  assert.deepEqual(bowl.fg, guessRgb(MANIFEST.colors.fg));
  assert.deepEqual(bowl.juice, guessRgb(MANIFEST.colors.accent));
  assert.ok(bowl.board[0] > bowl.bg[0], "案板受光面必须比底色亮（字压在这一层上）");
});

test("palette：封面 → 色相（有效色相按饱和度加权，深色/灰阶不能把色相拉歪）", () => {
  const red = palette.bowlFromCover(flatCover(8, 8, [220, 40, 40]), 8, 8);
  assert.equal(red.gray, false);
  assert.equal(red.source, "cover");
  assert.ok(red.hue < 40 || red.hue > 340, `红色封面的色相应在红区，实得 ${red.hue}`);
  const [jh, js, jl] = palette.rgbToHsl(red.juice);
  assert.ok(js > 0.6 && js < 0.9, `果汁彩度必须落在可见带里，实得 ${js.toFixed(2)}`);
  assert.ok(jl > 0.4 && jl < 0.68, `果汁明度必须落在可见带里，实得 ${jl.toFixed(2)}`);

  const gray = palette.bowlFromCover(flatCover(8, 8, [124, 124, 124]), 8, 8);
  assert.equal(gray.gray, true, "灰阶封面必须被识别出来");
  assert.equal(gray.source, "manifest");
  assert.deepEqual(gray.juice, guessRgb(MANIFEST.colors.accent), "灰阶封面直接退回清单专色");

  const dark = palette.bowlFromCover(flatCover(8, 8, [8, 8, 10]), 8, 8);
  assert.equal(dark.gray, true, "近黑封面不能凭几个噪声像素编出一个色相");
});

test("palette：果盘只偏 22%（品种的可辨认性优先）", () => {
  const base = fruit.KINDS[0].rindA; // 西瓜皮
  const before = palette.rgbToHsl(base);
  const after = palette.rgbToHsl(palette.tintKind(base, 15, { gray: false, shift: 0.22 }));
  assert.ok(Math.abs(after[2] - before[2]) < 1e-6, "明度不许改（改了就不像那个水果）");
  const want = palette.hueDelta(before[0], 15) * 0.22;
  assert.ok(Math.abs(palette.hueDelta(before[0], after[0]) - want) < 0.5, "色相只该偏 22%");
  const grayTint = palette.rgbToHsl(palette.tintKind(base, 15, { gray: true }));
  assert.ok(Math.abs(grayTint[0] - before[0]) < 1e-6, "灰阶封面不许改色相");
});

test("palette：字色与凹痕色必须按「实际画出来的底」算，且都过对比度下限", () => {
  const bowl = palette.bowlFromCover(null, 0, 0);
  const ink = palette.inkOnBoard(bowl.board, bowl.fg, { min: 4.5 });
  assert.ok(ink.contrast >= 4.5, `正文对比度不足：${ink.contrast.toFixed(2)}:1`);
  const unlit = palette.unlitOf(ink.rgb, bowl.board, 0.42, 4.2);
  assert.ok(unlit.contrast >= 4.2, `未唱到的字必须仍然读得清：${unlit.contrast.toFixed(2)}:1`);
  assert.ok(unlit.back <= 0.42, "凹痕的退让量不许超过设计值");
  assert.ok(palette.inkReadable(bowl.board, ink.rgb, 4.5));
  // 亮底上选深字：这条是 rubbing 那个"亮封面 → 深字 → 看不见"的回归
  const light = palette.inkOnBoard([240, 236, 230], [247, 236, 216], { min: 4.5 });
  assert.ok(light.contrast >= 4.5);
  assert.ok(palette.luminance(light.rgb) < 0.3, "亮底必须自动换成深字");
  // 无法达标时（字色与底几乎同色）也不许返回 NaN / 未定义行为
  const impossible = palette.unlitOf([220, 220, 220], [219, 219, 219], 0.42, 4.2);
  assert.equal(impossible.back, 0);
  assert.ok(Number.isFinite(impossible.contrast));
});

/* ==========================================================================
   3. timeline.js —— 投掷时刻表、行号、连击、炸弹
   ========================================================================== */

test("timeline：字素分类与权重", () => {
  assert.equal(timeline.classify("字"), "cjk");
  assert.equal(timeline.classify("あ"), "cjk");
  assert.equal(timeline.classify("a"), "latin");
  assert.equal(timeline.classify("7"), "digit");
  assert.equal(timeline.classify("，"), "punct");
  assert.equal(timeline.classify(" "), "space");
  assert.equal(timeline.classify(""), "space");
  assert.ok(timeline.charWeight("字") > timeline.charWeight("a"));
  assert.ok(timeline.charWeight("a") > timeline.charWeight("，"));
  assert.equal(timeline.charWeight(" "), 0);
  assert.equal(timeline.median([3, 1, 2]), 2);
  assert.equal(timeline.median([4, 1, 3, 2]), 2.5);
  assert.equal(timeline.median([]), 0);
  assert.equal(timeline.median(null), 0);
});

test("timeline：合成时间轴（单调、单字封顶、长间奏里吃完就停）", () => {
  const chars = Array.from("夜空中最亮的星呀嘿哦");
  const tl = timeline.timedLine({ time: 0, text: chars.join("") }, { time: 60_000 }, { chars });
  assert.equal(tl.synth, true);
  assert.equal(tl.count, chars.length);
  for (let k = 1; k < tl.count; k += 1) assert.ok(tl.starts[k] >= tl.starts[k - 1]);
  for (let k = 0; k < tl.count; k += 1) {
    assert.ok(tl.ends[k] > tl.starts[k], "每个字都要有自己的时长");
    assert.ok(tl.ends[k] - tl.starts[k] <= timeline.MAX_CHAR_MS + 1e-6, "单字时长必须封顶");
  }
  assert.ok(tl.starts[tl.count - 1] < 8000, "超长间奏里不许一个字慢慢亮几十秒");
});

test("timeline：words 严格对齐；对不上就整行退回合成（绝不能错位点亮）", () => {
  const chars = Array.from("逐字落版测试句");
  const words = [6420, 6840, 7260, 7680, 8100, 8520, 8940];
  const ok = timeline.timedLine({ time: 6000, text: chars.join(""), words }, { time: 12_000 }, { chars });
  assert.equal(ok.synth, false);
  assert.deepEqual(ok.starts, words);
  assert.equal(ok.ends[6] - ok.starts[6], 420, "末字兜底 = 相邻间距中位数（不被长音拖走）");

  const bad = timeline.timedLine({ time: 0, text: "四个字素", words: [0, 100] }, { time: 4000 }, {
    chars: Array.from("四个字素"),
  });
  assert.equal(bad.synth, true, "长度不匹配必须退回合成");
  assert.equal(bad.count, 4);

  const reversed = timeline.timedLine({ time: 0, text: "三个字", words: [500, 100, 200] }, { time: 9000 }, {
    count: 3,
  });
  assert.deepEqual(reversed.starts, [500, 500, 500], "倒挂的起点要被抹平");
  for (let k = 0; k < 3; k += 1) assert.ok(reversed.ends[k] > reversed.starts[k], "不许出现负时长");
});

test("timeline：重叠的两行（words 越过下一句）不许把字唱到下一句里去", () => {
  const chars = Array.from("四个字素");
  const tl = timeline.timedLine({ time: 0, text: "四个字素", words: [0, 2000, 4000, 6000] }, { time: 3000 }, { chars });
  for (let k = 0; k < tl.count; k += 1) {
    assert.ok(tl.starts[k] <= 3000 - 20 + 1e-9, `第 ${k} 个字不许在下一句开始之后才开口`);
  }
});

test("timeline：顶点时刻 == 切开时刻 == 该字起唱（这一款的时间正确性全压在这条上）", () => {
  const th = timeline.throwAt([1000, 2000, 3000], 1);
  assert.equal(th.fillAt, 2000);
  assert.equal(th.apexAt, 2000 + timeline.SLASH_DELAY_MS);
  assert.equal(th.slashAt, th.apexAt, "顶点就是被切的那一下");
  assert.equal(th.tossAt, th.slashAt - timeline.TOSS_MS);
  assert.ok(th.tossAt < th.apexAt);
  assert.ok(timeline.TOSS_MS > 200 && timeline.TOSS_MS < 1200, "飞行时长要在「看得见」的量级");

  const chars = Array.from("测试一句");
  const plan = timeline.planLine({ time: 0, text: "测试一句" }, { time: 8000 }, { chars });
  assert.equal(plan.throws.length, plan.count);
  for (let k = 0; k < plan.count; k += 1) {
    assert.equal(plan.throws[k].fillAt, plan.starts[k]);
    assert.equal(plan.throws[k].slashAt, plan.starts[k] + timeline.SLASH_DELAY_MS);
  }
});

test("timeline：间奏炸弹（长空白要有东西可看，而且不许惩罚任何人）", () => {
  const chars = Array.from("短句");
  const tl = timeline.timedLine({ time: 0, text: "短句" }, { time: 9000 }, { chars });
  const bomb = timeline.bombPlan(tl, { time: 9000 });
  assert.ok(bomb, "6 秒的间奏必须抛炸弹");
  assert.ok(bomb.riseAt > tl.lineEnd, "炸弹在末字唱完之后才抛");
  assert.ok(bomb.apexAt < bomb.detonateAt, "升到悬停位之后还要烧一会儿引线");
  assert.equal(bomb.detonateAt, 9000, "引线烧完 == 下一句开口");
  assert.ok(bomb.gapMs >= timeline.BOMB_GAP_MS);

  assert.equal(timeline.bombPlan(tl, { time: tl.lineEnd + 800 }), null, "短间奏不抛炸弹");
  assert.equal(timeline.bombPlan(tl, null), null, "最后一句没有「下一句」");
  assert.equal(timeline.bombPlan({ lineEnd: 0 }, { time: 500 }), null);
});

test("timeline：播放钟（补丁 4Hz + 位置量化 250ms，必须自己外推且有上限）", () => {
  const clock = timeline.createClock({ maxExtrapolate: 1200 });
  clock.set(1000, true, 0);
  assert.equal(clock.value(0), 1000);
  assert.equal(clock.value(500), 1500);
  assert.equal(clock.value(99_999), 2200, "补丁不来就冻住，不许自己往前跑");
  clock.set(1000, false, 0);
  assert.equal(clock.value(99_999), 1000, "暂停时歌曲钟不许走");
  clock.set(NaN, true, 0);
  assert.equal(clock.value(0), 0, "非法位置不许污染状态");
  clock.set(-50, true, 0);
  assert.equal(clock.pos, 0);
});

test("timeline：行号二分（第一句之前是 -1，同秒多行取最后一个）", () => {
  const lines = [{ time: 1000 }, { time: 5000 }, { time: 9000 }, { time: 9000 }];
  assert.equal(timeline.lineIndexAt(lines, 0), -1);
  assert.equal(timeline.lineIndexAt(lines, 999), -1);
  assert.equal(timeline.lineIndexAt(lines, 1000), 0);
  assert.equal(timeline.lineIndexAt(lines, 4999), 0);
  assert.equal(timeline.lineIndexAt(lines, 5000), 1);
  assert.equal(timeline.lineIndexAt(lines, 12_000), 3);
  assert.equal(timeline.lineIndexAt([], 5000), -1);
  assert.equal(timeline.lineIndexAt(null, 5000), -1);
  assert.equal(timeline.nextLineTime(lines, 0), 5000);
  assert.equal(timeline.nextLineTime(lines, 3), Infinity);
});

test("timeline：连击与分数（只有歌驱动的切开才进读数）", () => {
  const combo = timeline.createCombo({ gapMs: 1500, idleMs: 2600, perCut: 10 });
  assert.equal(combo.pushAt(0), 1);
  assert.equal(combo.pushAt(1000), 2, "窗口内继续连");
  assert.equal(combo.pushAt(4000), 1, "断连就重来");
  assert.equal(combo.value(4100).score, 10 + 20 + 10);
  assert.equal(combo.value(4100).combo, 1);
  assert.equal(combo.value(99_999).combo, 0, "早就断掉的连击不许继续显示");
  assert.equal(combo.value(99_999).live, false);
  assert.equal(combo.value(99_999).cuts, 3, "切开的**总数**不随时间归零");

  const capped = timeline.createCombo({ gapMs: 9999, idleMs: 9999, perCut: 10 });
  let want = 0;
  for (let i = 0; i < 12; i += 1) {
    const c = capped.pushAt(i * 100);
    want += 10 * Math.min(9, c);
  }
  assert.equal(capped.value(1200).score, want, "连击加倍必须封顶（不然分数会指数爆炸）");
  assert.equal(capped.best, 12);

  capped.reset();
  assert.equal(capped.value(2000).score, 0);
  assert.equal(capped.value(2000).cuts, 0);
  assert.equal(capped.value(2000).combo, 0);
});

/* ==========================================================================
   4. fruit.js —— 程序化水果
   ========================================================================== */

test("fruit：品种表完整（皮/肉/籽三层 + 形态 + 花纹 + 剖面结构）", () => {
  assert.ok(fruit.KINDS.length >= 6, "品种太少一排水果会重复得很难看");
  const marks = new Set();
  const shapes = new Set();
  for (const k of fruit.KINDS) {
    assert.ok(k.id && k.name, "每个品种都要有 id 与显示名");
    for (const key of ["rindA", "rindB", "fleshA", "fleshB", "seed"]) {
      assert.ok(Array.isArray(k[key]) && k[key].length === 3, `${k.id}.${key} 必须是 RGB 三元组`);
      for (const v of k[key]) assert.ok(v >= 0 && v <= 255, `${k.id}.${key} 越界`);
    }
    assert.ok(k.thickness > 0.04 && k.thickness < 0.3, `${k.id} 的果皮厚度要合理`);
    assert.ok(k.seeds >= 0 && k.seeds <= 24);
    assert.ok(["round", "oval", "pear"].includes(k.shape));
    assert.ok(["stripe", "dimple", "fuzz", "scale", "none"].includes(k.mark));
    assert.ok(["segment", "core", "plain"].includes(k.cut));
    marks.add(k.mark);
    shapes.add(k.shape);
  }
  assert.ok(marks.size >= 3, "花纹要有变化");
  assert.ok(shapes.size >= 2, "形态要有变化");
});

test("fruit：kindOf 环绕与负下标；silhouette 的长短轴", () => {
  assert.equal(fruit.kindOf(0).id, fruit.KINDS[0].id);
  assert.equal(fruit.kindOf(fruit.KINDS.length).id, fruit.KINDS[0].id, "越界要环绕");
  assert.equal(fruit.kindOf(-1).id, fruit.KINDS[fruit.KINDS.length - 1].id, "负下标也要环绕");
  assert.equal(fruit.kindOf(NaN).id, fruit.KINDS[0].id);
  const oval = fruit.silhouette({ shape: "oval" });
  assert.ok(oval.ry > oval.rx, "椭圆品种要竖长");
  assert.deepEqual(fruit.silhouette({ shape: "round" }), { rx: 1, ry: 1 });
});

test("fruit：水果半径（跟字素步距走，且两端都有夹取）", () => {
  assert.equal(fruit.radiusFor(1, 20000), 13, "极小字距也要给个下限");
  assert.equal(fruit.radiusFor(1000, 20000), 30, "极大字距要有上限（不然一颗水果盖住半屏）");
  const mid = fruit.radiusFor(40, 700);
  assert.ok(mid > 15 && mid < 30, `中档字距该落在中间，实得 ${mid}`);
  assert.ok(fruit.radiusFor(40, 300) < mid, "矮窗口里水果要小一号");
  assert.ok(fruit.radiusFor(40, 700) < 40 * 0.62 + 1e-9, "半径不许超过 0.62 × 步距（否则一排糊成一片）");
  assert.ok(Number.isFinite(fruit.radiusFor(NaN, NaN)));
});

test("fruit：品种分配（确定性 + 相邻两枚一定不同）", () => {
  const a = fruit.assignKinds(12, 12345, 5);
  const b = fruit.assignKinds(12, 12345, 5);
  assert.deepEqual(Array.from(a), Array.from(b), "同样的输入必须同样的品种");
  const c = fruit.assignKinds(12, 999, 5);
  assert.notDeepEqual(Array.from(a), Array.from(c), "换种子/换歌要换排布");
  for (let i = 0; i < a.length; i += 1) assert.ok(a[i] < fruit.KINDS.length);
  for (let i = 1; i < a.length; i += 1) assert.notEqual(a[i], a[i - 1], "相邻两枚不许同品种");
  assert.equal(fruit.assignKinds(0, 1).length, 0);
});

test("fruit：颜色工具与果体路径（pear 用贝塞尔、其余用椭圆）", () => {
  assert.equal(fruit.css([255, 0, 0], 0.5), "rgba(255,0,0,0.500)");
  assert.equal(fruit.css([999, -4, 3.6], 2), "rgba(255,0,4,1.000)");
  assert.deepEqual(fruit.shade([100, 100, 100], 0), [100, 100, 100]);
  assert.ok(fruit.shade([100, 100, 100], 0.5)[0] > 100);
  assert.ok(fruit.shade([100, 100, 100], -0.5)[0] < 100);

  const g1 = mkCtx();
  fruit.bodyPath(g1, 10, 12, "round");
  assert.equal(countOps(g1, "ellipse"), 1);
  const g2 = mkCtx();
  fruit.bodyPath(g2, 10, 12, "pear");
  assert.ok(countOps(g2, "bezierCurveTo") >= 4, "苹果形要真的用曲线画出来");
  assert.equal(countOps(g2, "ellipse"), 0);

  const colors = fruit.kindColorsFor(fruit.KINDS[0], (c) => c);
  assert.deepEqual(colors.rindA, fruit.KINDS[0].rindA);
  assert.equal(colors.mark, "stripe");
  assert.equal(colors.shape, "round");
});

test("fruit：绘制调用真的发生（假 context 记账），且透明度为 0 时什么都不画", () => {
  const colors = fruit.kindColorsFor(fruit.KINDS[0], (c) => c); // 西瓜：带条纹
  const g = mkCtx();
  fruit.paintFruit(g, { x: 10, y: 20, rx: 14, ry: 14, rot: 0.3, colors, alpha: 1 });
  assert.ok(g.ops.length > 40, `一颗西瓜要画不少笔，实得 ${g.ops.length}`);
  assert.ok(countOps(g, "radial") >= 3, "球体/内阴影/高光至少要三处渐变");
  assert.ok(countOps(g, "fill") >= 3);
  assert.equal(countOps(g, "clip"), 1, "花纹必须裁在果体里");
  assert.ok(countOps(g, "quadraticCurveTo") >= 5, "西瓜纹是曲线");
  assert.ok(countOps(g, "save") === countOps(g, "restore"), "save/restore 必须配对");

  const g0 = mkCtx();
  fruit.paintFruit(g0, { x: 0, y: 0, rx: 0, ry: 0, colors, alpha: 0 });
  assert.equal(g0.ops.length, 0, "不可见就不该产生任何绘制调用");
  const gz = mkCtx();
  fruit.paintFruit(gz, { x: 0, y: 0, rx: 0, ry: 10, colors, alpha: 1 });
  assert.equal(gz.ops.length, 0, "半径为 0 也不画");

  for (const k of fruit.KINDS) {
    const gg = mkCtx();
    fruit.paintFruit(gg, { x: 0, y: 0, rx: 12, ry: 12, colors: fruit.kindColorsFor(k, (c) => c), alpha: 1 });
    assert.ok(gg.ops.length > 12, `${k.id} 的绘制路径不能是空的`);
    assert.equal(countOps(gg, "save"), countOps(gg, "restore"), `${k.id}: save/restore 不配对`);
  }
});

test("fruit：剖面（半颗）—— 真的裁掉一半、有果皮厚度、有籽与切面", () => {
  const colors = fruit.kindColorsFor(fruit.KINDS[0], (c) => c);
  const g = mkCtx();
  fruit.paintHalf(g, { x: 30, y: 40, rx: 16, ry: 16, rot: -0.4, side: -1, colors, alpha: 1, cutFlash: 1 });
  assert.equal(countOps(g, "clip"), 1, "半颗必须裁成一半");
  assert.ok(countOps(g, "rect") >= 1, "裁剪区是一个矩形半平面");
  assert.ok(countOps(g, "ellipse") >= 3, "果皮 / 果肉 / 籽都靠椭圆");
  assert.ok(countOps(g, "fill") >= 3);
  assert.equal(countOps(g, "save"), countOps(g, "restore"));

  // 有籽的品种：籽必须真的画出来
  const seeded = fruit.kindColorsFor(fruit.KINDS.find((k) => k.id === "kiwi"), (c) => c);
  const g2 = mkCtx();
  fruit.paintHalf(g2, { x: 0, y: 0, rx: 16, ry: 16, rot: 0, side: 1, colors: seeded, alpha: 1 });
  assert.ok(countOps(g2, "ellipse") >= 12, `奇异果的籽要画出来，实得 ${countOps(g2, "ellipse")}`);
  // 柑橘类：瓣膜是直线
  const seg = fruit.kindColorsFor(fruit.KINDS.find((k) => k.id === "orange"), (c) => c);
  const g3 = mkCtx();
  fruit.paintHalf(g3, { x: 0, y: 0, rx: 16, ry: 16, rot: 0, side: 1, colors: seg, alpha: 1 });
  assert.ok(countOps(g3, "lineTo") >= 8, "橙子要有瓣膜");

  const g4 = mkCtx();
  fruit.paintHalf(g4, { x: 0, y: 0, rx: 16, ry: 16, rot: 0, side: 1, colors, alpha: 0 });
  assert.equal(g4.ops.length, 0);
});

test("fruit：炸弹（引线 + 顶盖 + 火星）与刀光 / 刀痕 / 爆炸", () => {
  const g = mkCtx();
  fruit.paintBomb(g, { x: 50, y: 60, r: 14, rot: 0.1, fuse: 0.4 });
  assert.ok(countOps(g, "quadraticCurveTo") >= 2, "引线是曲线（而且要画两遍：亮线与烧掉的一段）");
  assert.ok(countOps(g, "arc") >= 4, "球体 / 顶盖 / 火星 / 轮廓");
  assert.ok(g.ops.some((o) => o[0] === "radial"), "火星要有光晕");
  const gz = mkCtx();
  fruit.paintBomb(gz, { x: 0, y: 0, r: 0, fuse: 0 });
  assert.equal(gz.ops.length, 0);

  const s = mkCtx();
  fruit.paintSlash(s, { x1: 0, y1: 0, x2: 100, y2: 20, w: 8, alpha: 1 });
  assert.equal(countOps(s, "stroke"), 3, "刀光必须是三层（外辉 / 中层 / 白芯）");
  assert.equal(countOps(s, "lineTo"), 1);
  const s0 = mkCtx();
  fruit.paintSlash(s0, { x1: 0, y1: 0, x2: 10, y2: 0, w: 8, alpha: 0 });
  assert.equal(s0.ops.length, 0);

  const t = mkCtx();
  fruit.paintTrail(t, [0, 0, 10, 10, 20, 4], { width: 7, alpha: 1 });
  assert.ok(countOps(t, "stroke") >= 6, "刀痕要逐段画，越新越粗");
  const t1 = mkCtx();
  fruit.paintTrail(t1, [0, 0], {});
  assert.equal(t1.ops.length, 0, "不足两个点不画");

  const b = mkCtx();
  fruit.paintBurst(b, { x: 10, y: 10, r: 20, k: 0.4 });
  assert.equal(countOps(b, "fill"), 1);
  const b1 = mkCtx();
  fruit.paintBurst(b1, { x: 10, y: 10, r: 20, k: 0 });
  assert.equal(b1.ops.length, 0);
});

/* ==========================================================================
   5. juice.js —— 果汁粒子与两半刚体
   ========================================================================== */

test("juice：果汁池（定长 SoA、池满不覆盖、死亡 swap-remove）", () => {
  const pool = juice.createJuicePool(1200);
  assert.ok(pool.cap >= 1200);
  assert.equal(pool.n, 0);
  assert.ok(pool.x instanceof Float32Array && pool.bucket instanceof Uint8Array);

  const rnd = util.mulberry32(7);
  const added = juice.splat(pool, { x: 100, y: 100, dirX: 1, dirY: 0, n: 40, speed: 200, rand: rnd });
  assert.equal(added, 40);
  assert.equal(pool.n, 40);
  assert.equal(juice.splat(pool, { x: 0, y: 0, n: 99999, rand: rnd }), 1200 - 40, "塞到池满为止");
  assert.equal(pool.n, pool.cap);

  const small = juice.createJuicePool(64);
  assert.equal(small.cap, 64, "容量有下限");
  juice.splat(small, { x: 0, y: 0, n: 10, ttl: 0.01, rand: rnd });
  juice.stepJuice(small, 0.06, { gravity: 0 });
  assert.equal(small.n, 0, "过期的粒子必须被压实掉（否则池子会被污染）");
});

test("juice：重力把果汁往下拽、案板会弹一下、暂停就不动", () => {
  const rnd = util.mulberry32(11);
  const pool = juice.createJuicePool(200);
  juice.splat(pool, { x: 500, y: 200, dirX: 1, dirY: 0, n: 60, speed: 40, ttl: 5, rand: rnd });
  const before = juice.juiceCentroid(pool);
  for (let i = 0; i < 10; i += 1) juice.stepJuice(pool, 1 / 60, { gravity: 1750, floor: 1e9 });
  const after = juice.juiceCentroid(pool);
  assert.ok(after.y > before.y + 5, `果汁必须往下掉：${before.y.toFixed(1)} → ${after.y.toFixed(1)}`);

  const floorPool = juice.createJuicePool(64);
  juice.splat(floorPool, { x: 0, y: 90, dirX: 0, dirY: 1, n: 6, speed: 400, ttl: 5, rand: rnd });
  for (let i = 0; i < 12; i += 1) juice.stepJuice(floorPool, 1 / 60, { gravity: 1750, floor: 100 });
  for (let i = 0; i < floorPool.n; i += 1) {
    assert.ok(floorPool.y[i] <= 100 + 1e-6, "不许穿到案板下面去");
  }
  assert.ok(floorPool.n > 0, "落到案板上不等于消失（果汁要渗在那里一会儿）");

  const still = juice.createJuicePool(64);
  juice.splat(still, { x: 10, y: 10, n: 5, ttl: 5, speed: 0, rand: rnd });
  const p0 = juice.juiceCentroid(still);
  juice.stepJuice(still, 0, { gravity: 1750, floor: 1e9 });
  assert.deepEqual(juice.juiceCentroid(still).y, p0.y, "dt=0 不许改变任何位置");
  assert.equal(juice.createJuicePool(8).cap, 64);
  assert.deepEqual(juice.juiceCentroid(juice.createJuicePool(64)), { x: 0, y: 0, n: 0 });
  assert.equal(juice.clearJuice(still), 0);
  assert.equal(still.n, 0);
});

test("juice：同一随机流下逐粒相同（换封面重算不许让画面跳）", () => {
  const mk = () => {
    const pool = juice.createJuicePool(256);
    juice.splat(pool, { x: 5, y: 6, dirX: 0, dirY: -1, n: 50, speed: 300, rand: util.mulberry32(4242) });
    return pool;
  };
  const a = mk();
  const b = mk();
  assert.deepEqual(Array.from(a.x.slice(0, a.n)), Array.from(b.x.slice(0, b.n)));
  assert.deepEqual(Array.from(a.bucket.slice(0, a.n)), Array.from(b.bucket.slice(0, b.n)));
});

test("juice：切开 → 两半（沿刀口法线反向飞、自转相反、按年龄回收）", () => {
  const pool = juice.createHalfPool(48);
  const speed = 200;
  juice.cutHalves(pool, { x: 100, y: 100, rx: 14, ry: 14, cutAngle: Math.PI / 2, kind: 1, born: 5000, speed });
  assert.equal(pool.n, 2);
  assert.equal(pool.side[0], -1);
  assert.equal(pool.side[1], 1);
  assert.equal(pool.born[0], 5000);
  assert.equal(pool.kind[0], 1);
  assert.ok(Math.abs(pool.vx[0] + speed) < 1e-3, "一半往左飞");
  assert.ok(Math.abs(pool.vx[1] - speed) < 1e-3, "另一半往右飞");
  assert.ok(pool.av[0] * pool.av[1] < 0, "两半的自转方向必须相反");

  const spread0 = juice.halvesSpread(pool);
  let last = spread0;
  for (let i = 1; i <= 6; i += 1) {
    juice.stepHalves(pool, 1 / 60, { gravity: 0, floor: 1e9, now: 5000 + i * 16, lifeMs: 10_000, drag: 0 });
    const s = juice.halvesSpread(pool);
    assert.ok(s > last, `两半必须一直分离：${last.toFixed(2)} → ${s.toFixed(2)}`);
    last = s;
  }
  assert.ok(last > 20, "分离要看得出来（不是贴着不动）");

  juice.stepHalves(pool, 1 / 60, { now: 5000 + 3000, lifeMs: 1900 });
  assert.equal(pool.n, 0, "过期的两半必须回收");

  const capped = juice.createHalfPool(8);
  for (let i = 0; i < 5; i += 1) {
    juice.cutHalves(capped, { x: i, y: i, rx: 10, ry: 10, cutAngle: 0, kind: i, born: i * 100 });
  }
  assert.equal(capped.n, 8, "池满时覆盖最旧的那一半，不是无限增长");
  assert.equal(juice.clearHalves(capped), 0);
  assert.equal(capped.n, 0);
  assert.equal(juice.halvesSpread(capped), 0);
});

test("juice：两半的重力与地面（和果汁同一套口径）", () => {
  const pool = juice.createHalfPool(8);
  juice.cutHalves(pool, { x: 0, y: 0, rx: 10, ry: 10, cutAngle: 0, born: 0, speed: 0 });
  const y0 = pool.y[0];
  juice.stepHalves(pool, 0.1, { gravity: 2050, floor: 1e9, now: 100, lifeMs: 10_000 });
  assert.ok(pool.y[0] > y0, "重力必须往下拽");
  const f = juice.createHalfPool(8);
  juice.cutHalves(f, { x: 0, y: 95, rx: 10, ry: 10, cutAngle: 0, born: 0, speed: 600, vx: 0 });
  for (let i = 0; i < 40; i += 1) juice.stepHalves(f, 1 / 60, { gravity: 2050, floor: 100, now: i * 16, lifeMs: 99_999 });
  for (let i = 0; i < f.n; i += 1) assert.ok(f.y[i] <= 100 + 1e-6, "两半不许穿到案板下面");
});

/* ==========================================================================
   6. 静态纪律扫描：skin.js / skin.css / skin.json
   ========================================================================== */

test("skin.js 能被真的 import（模板串写坏这类问题静态扫不出来）", async () => {
  const mod = await import(pathToFileURL(root("skin.js")).href);
  assert.equal(typeof mod.default, "object");
  assert.equal(mod.default.id, "ninja");
  for (const fn of ["mount", "update", "destroy"]) {
    assert.equal(typeof mod.default[fn], "function", `必须实现 ${fn}`);
  }
  assert.equal(typeof mod.__probe, "function", "自检要靠 __probe 读内部状态");
});

test("skin.js：零项目 import、子模块透传 token、只有一个 rAF 循环", () => {
  const code = stripComments(readText("skin.js"));
  assert.ok(!/^\s*import\s/m.test(code), "不许有静态 import（相对 import 会丢掉 /skins 的 token）");
  assert.ok(!/from\s+["']\.\.?\//.test(code), "不许从包外引入任何东西");
  assert.ok(/new URL\(import\.meta\.url\)\.search/.test(code), "必须取入口 URL 的 query");
  assert.ok(/import\(`\.\/lib\/\$\{file\}\$\{Q\}`\)/.test(code), "子模块必须透传 token");
  for (const f of ["util.js", "palette.js", "timeline.js", "fruit.js", "juice.js"]) {
    assert.ok(code.includes(`await load("${f}")`), `必须加载 lib/${f}`);
  }

  const rafTotal = (code.match(/requestAnimationFrame\(/g) || []).length;
  const rafTick = (code.match(/requestAnimationFrame\(\(\) => tick\(st\)\)/g) || []).length;
  assert.ok(rafTotal >= 1);
  assert.equal(rafTotal, rafTick, "所有 rAF 都必须是同一条 tick 循环（不许有第二个循环源）");
  assert.ok(/cancelAnimationFrame\(st\.raf\)/.test(code), "必须能取消");
  assert.ok(!/setInterval/.test(code), "不许用 setInterval");
  assert.ok(!/\bfetch\s*\(/.test(code), "不许 fetch");
  assert.ok(!/\beval\s*\(/.test(code), "不许 eval");
  assert.ok(!/XMLHttpRequest/.test(code));
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(code), "不许自己存东西");
  assert.ok(!/Math\.random/.test(code), "随机一律走 mulberry32（确定性）");
});

test("skin.js：子模块之间不许互相 import（会丢 token 并二次加载）", () => {
  for (const f of readdirSync(root("lib"))) {
    if (!f.endsWith(".js")) continue;
    const code = stripComments(readText(join("lib", f)));
    assert.ok(!/^\s*import\s/m.test(code), `lib/${f} 不许有静态 import`);
    assert.ok(!/from\s+["']/.test(code), `lib/${f} 不许从别处引东西（依赖一律当参数注入）`);
  }
});

test("skin.js：字号是用户设置 —— 只写自己的缩档，绝不覆盖 --lyric-size", () => {
  const code = stripComments(readText("skin.js"));
  const css = stripComments(readText("skin.css"));
  assert.ok(!/--lyric-size\s*:/.test(code + css), "不许写死宿主下发的歌词字号");
  assert.ok(!/--lyric-size/.test(code), "skin.js 里连引用都不需要（CSS 自己读）");
  assert.ok(/getComputedStyle\([^)]*\)\.fontSize/.test(code), "水果尺寸要按**计算出来**的字号走");
  assert.ok(/--nj-scale/.test(css) && /calc\(var\(--lyric-size, 16px\) \* var\(--nj-scale, 1\)\)/.test(css));
});

test("skin.js：关动效 ⇒ 不起帧；暂停 6s 停帧；后台停帧；performance 档按字符串判", () => {
  const code = stripComments(readText("skin.js"));
  assert.ok(/if\s*\(!st\.animations\)\s*\{[^}]*haltFrames\(\)/.test(code), "关动效档必须掐掉帧链，一帧都不起");
  assert.ok(/haltFrames\(\)[^}]*paintOnce\(\)/.test(code), "关动效档要画一帧静态画面（不能白屏）");
  assert.ok(/IDLE_STOP_MS\s*=\s*6000/.test(code), "空闲停帧阈值必须是 6s");
  assert.ok(/idleExpired\(st\.lastActive/.test(code));
  assert.ok(/if\s*\(!st\.foreground\)\s*\{[^}]*stopFrames\(\)/.test(code), "切后台必须停帧");
  assert.ok(
    /o\.performanceMode\s*===\s*"performance"/.test(code),
    'performanceMode 必须按字符串口径判（`=== "performance"`），Boolean("smooth") 恒真'
  );
  assert.ok(/frameBudgetMs\(/.test(code), "performance 档必须真的限帧");
  assert.ok(!/case\s*"visibility"/.test(code), "宿主不推 visibility 补丁，别照着一个永远不触发的分支写");
  assert.ok(/ctx\.env\?\.\(\)\.foreground|e\.foreground/.test(code), "前景要现取 env()");
});

test("skin.js：destroy 清干净，且不删宿主给的挂载点", () => {
  const code = stripComments(readText("skin.js"));
  assert.ok(/removeEventListener/.test(code), "监听器必须能摘掉");
  assert.ok(/clearTimeout/.test(code), "定时器必须能清掉");
  assert.ok(/bgRoot\.innerHTML\s*=\s*""/.test(code), "整窗背景层是我们填的，卸载要自己收干净");
  assert.ok(/ctx\.root\.innerHTML\s*=\s*""/.test(code), "只清内容，不删宿主的挂载点");
  assert.ok(!/\.remove\(\)/.test(code), "不许把宿主给的挂载点摘下来");
  assert.ok(/clearJuice\(/.test(code) && /clearHalves\(/.test(code), "两个池都要清");
  assert.ok(/st\.alive = false/.test(code), "先立墓碑，再清引用");
});

test("skin.js：契约纪律（不改宿主、不自己跳进度、配色只走 reportBackdrop）", () => {
  const code = stripComments(readText("skin.js"));
  assert.ok(/reportBackdrop/.test(code), "随封面取色必须上报（宿主壳配色只有这一条通道）");
  assert.ok(!/actions\.seek|seekRatio|seekBy/.test(code), "指针在这个舞台上是刀，不许顺带跳进度");
  assert.ok(!/document\.documentElement|document\.body/.test(code), "不许碰宿主根元素");
  assert.ok(!/window\./.test(code), "不许碰 window");
  assert.ok(
    !/setProperty\(\s*["']--(text|surface|border|accent|chrome|glass|h-|w-)/.test(code),
    "不许改宿主的令牌（只能写自己的 --nj-*）"
  );
  assert.ok(/setProperty/.test(code), "配色/读数走自定义属性");
});

test("skin.js：必须暴露自检用的可观测读数", () => {
  const code = stripComments(readText("skin.js"));
  const keys = [
    "empty",
    "poster",
    "idle",
    "perf",
    "animations",
    "interactive",
    "playing",
    "narrow",
    "lit",
    "glyphs",
    "fruits",
    "bomb",
    "bombfuse",
    "stains",
    "draws",
    "lod",
    "score",
    "combo",
    "cuts",
    "line",
    "dpr",
  ];
  for (const key of keys) {
    assert.ok(
      new RegExp(`setAttr\\("${key}"`).test(code),
      `缺少 data-${key} 读数（自检与 CSS 都读它）`
    );
  }
  assert.ok(/export function __probe\(\)/.test(code), "必须导出 __probe");
});

test("skin.js：宿主壳的配色由清单声明，且与 palette 的兜底同源", () => {
  const code = stripComments(readText("skin.js"));
  assert.ok(/inkOnBoard\(/.test(code) && /unlitOf\(/.test(code), "字色与凹痕色必须按案板色推导");
  assert.ok(/tintKind\(/.test(code), "果盘要按封面偏色");
  assert.ok(/setVar\("--nj-board"/.test(code));
  assert.ok(/setVar\("--nj-fg"/.test(code));
  assert.ok(/setVar\("--nj-unlit"/.test(code));
  assert.ok(/setVar\("--nj-juice"/.test(code));
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
  // 安全区是**结构化**让开的：歌词带与 HUD 两排各自算
  const topUses = (css.match(/var\(--skin-inset-top,\s*0px\)/g) || []).length;
  const bottomUses = (css.match(/var\(--skin-inset-bottom,\s*0px\)/g) || []).length;
  assert.ok(topUses >= 3 && bottomUses >= 2, `安全区要在多处让开（上 ${topUses} / 下 ${bottomUses}）`);
  assert.ok(/\.nj__field\s*\{[^}]*top:\s*calc\(var\(--skin-inset-top/.test(css), "歌词带的 top 必须就是安全区上沿");
  assert.ok(/\.nj__field\s*\{[^}]*bottom:\s*calc\(var\(--skin-inset-bottom/.test(css));
  assert.ok(/--nj-board/.test(css) && /--nj-fg/.test(css) && /--nj-unlit/.test(css) && /--nj-juice/.test(css));
  assert.ok(/background-clip:\s*text/.test(css), "逐字染色靠 background-clip: text");
  assert.ok(/\.nj\s*\[hidden\]/.test(css), "自带 [hidden] 兜底（假宿主里没有宿主骨架）");
});

test("skin.css：作用域根必须用 `:scope`（`::scope` 会把整条规则丢掉）", () => {
  const css = stripComments(readText("skin.css"));
  assert.ok(!/::scope/.test(css), "`::scope` 不是合法伪元素 —— 整条规则会被静默丢弃");
  assert.ok(/:scope\s*\{/.test(css), "要写默认变量就得挂在 `:scope`（作用域根）上");
});

test("skin.json：清单字段齐全且与契约一致", () => {
  assert.equal(MANIFEST.id, "ninja");
  assert.equal(MANIFEST.apiVersion, "3.0");
  assert.equal(MANIFEST.entry, "skin.js");
  assert.deepEqual(MANIFEST.styles, ["skin.css"]);
  assert.ok(MANIFEST.order >= 200, "第三方样式的 order 必须 ≥ 200");
  assert.equal(MANIFEST.capabilities.background, true, "铺满整窗是本样式的立身之本");
  assert.equal(MANIFEST.capabilities.spectrum, true);
  assert.equal(MANIFEST.capabilities.interactive, true);
  assert.ok(MANIFEST.performance.budgetFps > 0);
  for (const k of ["bg", "fg", "accent"]) {
    assert.match(MANIFEST.colors[k], /^#[0-9a-f]{6}$/i, `colors.${k} 必须是 6 位十六进制`);
  }
  assert.ok(MANIFEST.description.length > 20, "描述要能让人一眼看懂这个样式在干什么");
  assert.ok(existsSync(root(MANIFEST.icon.file)), "图标文件必须存在");
  assert.ok(existsSync(root("README.md")), "样式包要有自己的说明");
});

test("skin.json：清单配色与 lib/palette.js 的兜底同源（两处各写一份必然漂移）", () => {
  assert.deepEqual(palette.parseHex(MANIFEST.colors.bg), palette.BOWL_BASE.bg);
  assert.deepEqual(palette.parseHex(MANIFEST.colors.fg), palette.BOWL_BASE.fg);
  assert.deepEqual(palette.parseHex(MANIFEST.colors.accent), palette.BOWL_BASE.accent);
});

test("配色对比度：正文 / 凹痕 / 果汁在深木案板上都看得见", () => {
  const bg = palette.parseHex(MANIFEST.colors.bg);
  const fg = palette.parseHex(MANIFEST.colors.fg);
  const accent = palette.parseHex(MANIFEST.colors.accent);
  const c = (a, b) => palette.contrastRatio(a, b);
  assert.ok(c(bg, fg) >= 4.5, `正文对比度不足：${c(bg, fg).toFixed(2)}:1`);
  assert.ok(c(bg, accent) >= 2.2, `强调色在底上太暗：${c(bg, accent).toFixed(2)}:1`);
  // 真实画出来的那一层是"案板受光面"，比 bg 更亮 —— 必须按它算
  const bowl = palette.bowlFromCover(null, 0, 0);
  const ink = palette.inkOnBoard(bowl.board, bowl.fg, { min: 4.5 });
  assert.ok(c(bowl.board, ink.rgb) >= 4.5);
  const unlit = palette.unlitOf(ink.rgb, bowl.board, 0.42, 4.2);
  assert.ok(c(bowl.board, unlit.rgb) >= 4.2, `未唱到的字看不清：${c(bowl.board, unlit.rgb).toFixed(2)}:1`);
});

test("时间常数的量级（设计稿里写的那几个数不许被悄悄改小/改大）", () => {
  assert.equal(timeline.MAX_CHAR_MS, 420);
  assert.equal(timeline.MIN_CHAR_MS, 60);
  assert.equal(timeline.FILL_MS, 260);
  assert.ok(timeline.TOSS_MS >= 300 && timeline.TOSS_MS <= 900, "飞行时长 300~900ms：短了看不见、长了跟不上");
  assert.ok(timeline.SLASH_DELAY_MS <= 80, "切开只允许比起唱晚一点点");
  assert.ok(timeline.BOMB_GAP_MS >= 2000, "太短的间奏不该抛炸弹");
  assert.ok(timeline.COMBO_IDLE_MS > timeline.COMBO_GAP_MS, "读数留白必须比连击窗口长");
  assert.ok(timeline.SCORE_PER_CUT > 0);
  assert.ok(juice.PHYS.gravity > 0 && juice.PHYS.halfGravity > 0);
  assert.ok(juice.BUCKETS >= 4, "果汁要有几个色相档（不然一坨单色）");
});
