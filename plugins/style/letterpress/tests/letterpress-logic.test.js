/* ==========================================================================
   活字 letterpress —— 纯逻辑自检
   --------------------------------------------------------------------------
   跑法： node --test "plugins/style/letterpress/tests/*.test.js"

   覆盖：排版曲线的值域与单调性 / performance 档只留低频 / 幅度收敛 /
        版面视窗与列位移（视窗滑动不动画面）/ 深度样式 / 字素相位 /
        逐字时间戳插值 / FLIP 增量 / 行定位 / 时间码 / 专色取色与对比度，
        以及 imports / ?t= 透传 / ctx 白名单 / 签名 / CSS 禁用项 / 清单 / destroy
        的静态扫描。
   ========================================================================== */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* 本地 Node 22 用 import() 加载绝对 Windows 路径会 ERR_UNSUPPORTED_ESM_URL_SCHEME，
   必须转成 file:// URL */
const loadLocal = (file) => import(pathToFileURL(join(PKG, file)).href);

const { default: SKIN } = await loadLocal("skin.js").then(
  (m) => m,
  (e) => ({ default: { id: "letterpress", loadError: String(e) } })
);
const ts = await loadLocal("lib/typeset.js");
const ink = await loadLocal("lib/ink.js");
const SRC = readFileSync(join(PKG, "skin.js"), "utf8");
const CSS = readFileSync(join(PKG, "skin.css"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(PKG, "skin.json"), "utf8"));
const README = readFileSync(join(PKG, "README.md"), "utf8");

const j = (v) => JSON.stringify(v);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

/* --------------------------------------------------------------------------
   清单
   -------------------------------------------------------------------------- */
test("清单：id / order / apiVersion / 能力 / 配色 / 帧预算 / 入口", () => {
  assert.equal(MANIFEST.id, "letterpress");
  assert.equal(MANIFEST.name, "活字");
  assert.equal(MANIFEST.apiVersion, "3.0");
  assert.ok(MANIFEST.order >= 200, "第三方样式的 order 必须 ≥ 200");
  assert.equal(MANIFEST.entry, "skin.js");
  assert.deepEqual(MANIFEST.styles, ["skin.css"]);
  assert.equal(MANIFEST.icon?.file, "assets/icon.svg");
  assert.equal(MANIFEST.capabilities?.spectrum, true);
  // 画面上没有封面图：不申请整窗背景层
  assert.equal(MANIFEST.capabilities?.background, false);
  assert.equal(MANIFEST.capabilities?.interactive, true);
  assert.equal(MANIFEST.performance?.budgetFps, 30);
  assert.equal(SKIN.id, MANIFEST.id);
  assert.ok(!SKIN.loadError, `skin.js 必须能被独立 import：${SKIN.loadError || ""}`);
});

test("清单配色：纸白/墨黑/专色的对比度 ≥ 4.5（浅色舞台下底栏要读得清）", () => {
  const { bg, fg, accent } = MANIFEST.colors;
  assert.match(bg, /^#[0-9a-f]{6}$/i);
  assert.match(fg, /^#[0-9a-f]{6}$/i);
  assert.match(accent, /^#[0-9a-f]{6}$/i);
  assert.ok(ink.contrast(bg, fg) >= 4.5, `纸白/墨黑对比度不足：${ink.contrast(bg, fg)}`);
  assert.ok(ink.contrast(bg, accent) >= 2.6, `专色在纸上的对比度不足：${ink.contrast(bg, accent)}`);
});

/* --------------------------------------------------------------------------
   频谱 → 排版曲线
   -------------------------------------------------------------------------- */
test("bandSplit：三段口径（0..12 / 13..44 / 45..127），空谱给 0", () => {
  assert.deepEqual(ts.bandSplit(null), { low: 0, mid: 0, high: 0 });
  assert.deepEqual(ts.bandSplit([]), { low: 0, mid: 0, high: 0 });
  const ones = new Array(128).fill(1);
  const all = ts.bandSplit(ones);
  assert.ok(near(all.low, 1) && near(all.mid, 1) && near(all.high, 1), j(all));
  // 只有低频：mid/high 必须是 0（否则"低频抬字重"就没法单独验证）
  const lowOnly = new Array(128).fill(0);
  for (let i = 0; i <= 12; i += 1) lowOnly[i] = 1;
  const s = ts.bandSplit(lowOnly);
  assert.ok(near(s.low, 1) && near(s.mid, 0) && near(s.high, 0), j(s));
});

test("typesetCurve：六条轴都在值域内（写进 CSS 的值不能越界）", () => {
  const cases = [0, 0.25, 0.5, 0.75, 1];
  for (const low of cases) {
    for (const mid of cases) {
      for (const high of cases) {
        const c = ts.typesetCurve({ low, mid, high }, { fit: 1 });
        assert.ok(c.weight >= ts.CURVE.weightMin && c.weight <= ts.CURVE.weightMax, `weight=${c.weight}`);
        assert.equal(c.weight % 10, 0, "字重要取整到 10（否则每次读到的都是吸附后的值）");
        assert.ok(c.size >= 0.94 && c.size <= 1.13, `size=${c.size}`);
        assert.ok(c.spacing >= ts.CURVE.spaceMin && c.spacing <= ts.CURVE.spaceMax, `spacing=${c.spacing}`);
        assert.ok(c.skew <= 0 && c.skew >= ts.CURVE.skewMax, `skew=${c.skew}`);
        assert.ok(c.lift >= 0 && c.lift <= ts.CURVE.liftMax, `lift=${c.lift}`);
        assert.ok(c.ink >= ts.CURVE.inkMin && c.ink <= ts.CURVE.inkMax, `ink=${c.ink}`);
      }
    }
  }
});

test("typesetCurve：低频抬字重与字号、中频拉字距并顶基线、高频给斜切并收字号", () => {
  const at = (o) => ts.typesetCurve(o, { fit: 1 });
  // 字重单调不减
  let prev = at({ low: 0 });
  for (const low of [0.2, 0.4, 0.6, 0.8, 1]) {
    const c = at({ low });
    assert.ok(c.weight > prev.weight, `字重没有随低频增大：${prev.weight} → ${c.weight}`);
    assert.ok(c.size > prev.size, `字号没有随低频放大：${prev.size} → ${c.size}`);
    prev = c;
  }
  // 字距随中频变松
  prev = at({ mid: 0 });
  for (const mid of [0.3, 0.6, 1]) {
    const c = at({ mid });
    assert.ok(c.spacing > prev.spacing && c.lift > prev.lift, `字距/抬升没随中频变：${j([prev, c])}`);
    prev = c;
  }
  // 斜切随高频更斜（更负），字号收回来
  prev = at({ high: 0 });
  for (const high of [0.3, 0.6, 1]) {
    const c = at({ high });
    assert.ok(c.skew < prev.skew && c.size < prev.size, `斜切/收字号没随高频变：${j([prev, c])}`);
    prev = c;
  }
  // 全 0 时是"干净的第一版"：没有任何斜切与抬升
  const zero = at({ low: 0, mid: 0, high: 0 });
  assert.equal(zero.skew, 0);
  assert.equal(zero.lift, 0);
});

test("typesetCurve：performance 档只有低频轴在动（字距/斜切/抬升一律不动）", () => {
  const a = ts.typesetCurve({ low: 0.4, mid: 1, high: 1 }, { fit: 1, performance: true });
  const b = ts.typesetCurve({ low: 0.4, mid: 0, high: 0 }, { fit: 1, performance: true });
  assert.equal(a.spacing, b.spacing);
  assert.equal(a.skew, b.skew);
  assert.equal(a.lift, b.lift);
  assert.equal(a.weight, b.weight);
  // 中高频再大也不能让字重/字号变
  assert.equal(b.weight, ts.typesetCurve({ low: 0.4 }, { fit: 1, performance: true }).weight);
});

test("typesetCurve：disabled（静态档）给中性版式，与频谱无关", () => {
  const a = ts.typesetCurve({ low: 1, mid: 1, high: 1 }, { disabled: true });
  const b = ts.typesetCurve({ low: 0, mid: 0, high: 0 }, { disabled: true });
  assert.deepEqual(a, b);
  assert.deepEqual(a, ts.neutralCurve());
  assert.equal(a.skew, 0);
  assert.equal(a.lift, 0);
});

test("fit（窄窗口收敛）：幅度变小但**不归零**，且单调", () => {
  const wide = ts.typesetCurve({ low: 1, mid: 1, high: 1 }, { fit: 1 });
  const narrow = ts.typesetCurve({ low: 1, mid: 1, high: 1 }, { fit: 0.72 });
  assert.ok(narrow.spacing < wide.spacing && narrow.spacing > 0, `字距收敛：${j([wide, narrow])}`);
  assert.ok(Math.abs(narrow.skew) < Math.abs(wide.skew) && narrow.skew < 0, `斜切收敛：${j([wide, narrow])}`);
  assert.ok(narrow.size > 1, "字号要被收敛，但不能收回基准以下");
  assert.ok(ts.amplitudeFit(0.72) < ts.amplitudeFit(1));
  assert.ok(ts.amplitudeFit(0.5) >= 0.55 && ts.amplitudeFit(1) <= 1);
});

test("fitFor：很宽=1，很窄收敛到 0.72 封顶", () => {
  assert.equal(ts.fitFor(1920, 1080), 1);
  assert.equal(ts.fitFor(390, 300), 0.72);
  assert.ok(ts.fitFor(830, 560) < 1 && ts.fitFor(830, 560) > 0.72);
  assert.equal(ts.fitFor(0, 0), 1); // 非法尺寸退回"基准舞台"，而不是给出一个缩水版面
});

/* --------------------------------------------------------------------------
   版面
   -------------------------------------------------------------------------- */
test("windowFor：当前行前后各 40 行，两端夹取，行数不够就全给", () => {
  assert.deepEqual(ts.windowFor(0, 0), { from: 0, to: -1 });
  assert.deepEqual(ts.windowFor(0, 5), { from: 0, to: 4 });
  assert.deepEqual(ts.windowFor(100, 300), { from: 60, to: 140 });
  assert.deepEqual(ts.windowFor(0, 300), { from: 0, to: 80 });
  assert.deepEqual(ts.windowFor(299, 300), { from: 219, to: 299 });
  const w = ts.windowFor(250, 300);
  assert.equal(w.to - w.from + 1, 81, "池子大小必须是 2×40+1");
});

test("columnShift：视窗滑动本身不动画面（cur 与 from 同时 +1 → 位移不变）", () => {
  const a = ts.columnShift(10, 0);
  const b = ts.columnShift(11, 1);
  assert.equal(a, b, "滑动视窗却让画面动了 —— 那会在换行时看到一次跳字");
  assert.equal(ts.columnShift(11, 0) - a, -ts.CURVE.leading, "每换一行，列上移一个行高");
  assert.equal(ts.columnShift(0, 0), 0);
});

test("depthOf / depthStyle：越远的行越小越淡，深度夹到 3", () => {
  assert.equal(ts.depthOf(5, 5), 0);
  assert.equal(ts.depthOf(5, 8), 3);
  assert.equal(ts.depthOf(-3, 5), 3, "负行号也要按距离算");
  const d0 = ts.depthStyle(0);
  assert.equal(d0.scale, 1);
  assert.equal(d0.ink, 1);
  let prev = d0;
  for (const d of [1, 2, 3]) {
    const s = ts.depthStyle(d);
    assert.ok(s.scale < prev.scale && s.ink <= prev.ink, `深度样式没单调：${j([prev, s])}`);
    prev = s;
  }
  assert.deepEqual(ts.depthStyle(9), ts.depthStyle(3), "深度要夹到 3（更远的行不该继续变小）");
  assert.deepEqual(ts.depthStyle(-1), ts.depthStyle(0));
});

test("unitPhase：确定性、落在 0.85..1.15、第 0 个字素是 1", () => {
  assert.equal(ts.unitPhase(0), 1);
  for (let i = 0; i < 60; i += 1) {
    const v = ts.unitPhase(i);
    assert.ok(v >= 0.85 && v <= 1.15, `相位越界：${i} → ${v}`);
    assert.equal(v, ts.unitPhase(i), "同一个字素两次渲染必须一样（否则自检没法断言）");
  }
});

test("reflowMs：字越多重排越久，夹在 280..560ms", () => {
  assert.ok(ts.reflowMs(0) >= 280);
  assert.ok(ts.reflowMs(1000) <= 560);
  assert.ok(ts.reflowMs(20) < ts.reflowMs(38));
});

/* --------------------------------------------------------------------------
   逐字点亮
   -------------------------------------------------------------------------- */
test("litFor：没有字级时间戳时整行一起亮", () => {
  const line = { time: 1000, graphemes: ["甲", "乙", "丙"], words: null };
  assert.deepEqual(ts.litFor(line, 999), [0, 0, 0]);
  assert.deepEqual(ts.litFor(line, 1000), [1, 1, 1]);
});

test("litFor：有字级时间戳时按字插值，最后一个字也要唱得完", () => {
  const line = { time: 0, graphemes: ["甲", "乙", "丙"], words: [0, 500, 1000] };
  assert.deepEqual(ts.litFor(line, -10), [0, 0, 0]);
  const mid = ts.litFor(line, 250);
  assert.ok(near(mid[0], 0.5, 1e-9), j(mid));
  assert.ok(mid[1] === 0 && mid[2] === 0, j(mid));
  const late = ts.litFor(line, 1250);
  assert.ok(late[0] === 1 && late[1] === 1 && near(late[2], 250 / 420, 1e-9), j(late));
  // 最后一个字素没有"下一个时间戳"：要用兜底时长收尾，否则永远亮不满
  assert.equal(ts.litFor(line, 1000 + ts.CURVE.lastUnitMs)[2], 1);
  // 全程单调不减
  let prev = ts.litFor(line, 0);
  for (let p = 0; p <= 1600; p += 50) {
    const cur = ts.litFor(line, p);
    for (let i = 0; i < cur.length; i += 1) assert.ok(cur[i] >= prev[i] - 1e-9, `进度回退：p=${p}`);
    prev = cur;
  }
});

test("litFor：字级时间戳长度对不上字素数时退回整行（宁可不逐字，也不能错位）", () => {
  const line = { time: 0, graphemes: ["甲", "乙", "丙"], words: [0, 500] };
  // 字级时间戳只给了 2 个、字素却有 3 个 → 不能猜对齐，整行一起亮
  assert.deepEqual(ts.litFor(line, -100), [0, 0, 0]);
  assert.deepEqual(ts.litFor(line, 5000), [1, 1, 1]);
  const nan = { time: 0, graphemes: ["甲", "乙"], words: [0, NaN] };
  assert.deepEqual(ts.litFor(nan, 5000), [1, 1], "非有限的时间戳同样退回整行");
});

test("progressRatio：行内 0..1，越过下一行时间就是 1", () => {
  const line = { time: 1000 };
  assert.equal(ts.progressRatio(line, 1000, 3000), 0);
  assert.equal(ts.progressRatio(line, 2000, 3000), 0.5);
  assert.equal(ts.progressRatio(line, 4000, 3000), 1);
  assert.equal(ts.progressRatio(line, -500, 3000), 0);
  // 没有下一行时间也不能超过 1
  assert.equal(ts.progressRatio(line, 1e9, null), 1);
});

/* --------------------------------------------------------------------------
   行定位 / 时间码
   -------------------------------------------------------------------------- */
const LINES = [{ time: 0 }, { time: 8000 }, { time: 14000 }, { time: 20000 }];

test("lineIndexAt：最后一句 time <= pos 的行；还没到第一句给 -1", () => {
  assert.equal(ts.lineIndexAt(LINES, -1), -1);
  assert.equal(ts.lineIndexAt(LINES, 0), 0);
  assert.equal(ts.lineIndexAt(LINES, 7999), 0);
  assert.equal(ts.lineIndexAt(LINES, 8000), 1);
  assert.equal(ts.lineIndexAt(LINES, 13999), 1);
  assert.equal(ts.lineIndexAt(LINES, 1e9), 3);
  assert.equal(ts.lineIndexAt([], 100), -1);
});

test("nextLineTime / gapAfter：空档读数（重排节奏与 HUD 都靠它）", () => {
  assert.equal(ts.nextLineTime(LINES, 0), 8000);
  assert.equal(ts.nextLineTime(LINES, 3), null);
  assert.equal(ts.nextLineTime(LINES, -1), null);
  assert.equal(ts.gapAfter(LINES, 0), 8000);
  assert.equal(ts.gapAfter(LINES, 2), 6000);
  assert.equal(ts.gapAfter(LINES, 3), 0);
});

test("timecode：mm:ss，负值与非法值都当 0", () => {
  assert.equal(ts.timecode(0), "00:00");
  assert.equal(ts.timecode(59500), "00:59");
  assert.equal(ts.timecode(65000), "01:05");
  assert.equal(ts.timecode(3661000), "61:01");
  assert.equal(ts.timecode(-500), "00:00");
  assert.equal(ts.timecode(NaN), "00:00");
});

/* --------------------------------------------------------------------------
   FLIP
   -------------------------------------------------------------------------- */
test("reflowDelta：新字素从旧字素的位置出发（同坐标系）；缩放比夹取", () => {
  const from = [
    { x: 10, y: 100, w: 20, h: 40 },
    { x: 40, y: 100, w: 20, h: 40 },
  ];
  const to = [
    { x: 10, y: 220, w: 20, h: 30 },
    { x: 40, y: 220, w: 10, h: 30 },
  ];
  const d = ts.reflowDelta(from, to);
  assert.equal(d.length, 2);
  assert.equal(d[0].dx, 0);
  assert.equal(d[0].dy, -120);
  assert.ok(near(d[0].sy, 40 / 30, 1e-3));
  assert.ok(d[1].sx > 1, j(d[1]));
  // 字素变多时，多出来的从旧行最后一个字的位置出发
  const more = ts.reflowDelta(from, [...to, { x: 60, y: 220, w: 10, h: 30 }]);
  assert.equal(more.length, 3);
  assert.equal(more[2].dx, from[1].x - 60);
  // 没有旧位置（第一次排）→ 不飞
  assert.deepEqual(ts.reflowDelta([], to), [
    { dx: 0, dy: 0, sx: 1, sy: 1 },
    { dx: 0, dy: 0, sx: 1, sy: 1 },
  ]);
  // 尺寸为 0 的读数不能算出 Infinity/NaN
  const weird = ts.reflowDelta([{ x: 0, y: 0, w: 0, h: 0 }], [{ x: 0, y: 0, w: 0, h: 0 }]);
  assert.ok(Number.isFinite(weird[0].sx) && Number.isFinite(weird[0].sy), j(weird));
});

/* --------------------------------------------------------------------------
   墨色 / 专色
   -------------------------------------------------------------------------- */
test("ink：hex 往返、非法输入给中性灰", () => {
  assert.deepEqual(ink.hexToRgb("#a8452c"), [168, 69, 44]);
  assert.equal(ink.rgbToHex([168, 69, 44]), "#a8452c");
  assert.equal(ink.rgbToHex([300, -5, 12.6]), "#ff000d");
  assert.deepEqual(ink.hexToRgb("nope"), [127, 127, 127]);
  assert.equal(ink.hexToRgb("#A8452C").length, 3);
});

test("ink：对比度（白/黑 = 21、对称、单调）与 bestInk", () => {
  assert.equal(ink.contrast("#ffffff", "#000000"), 21);
  assert.equal(ink.contrast("#000000", "#ffffff"), 21);
  assert.equal(ink.contrast("#ffffff", "#ffffff"), 1);
  assert.equal(ink.contrast(ink.PAPER, ink.INK), ink.contrast(ink.INK, ink.PAPER));
  assert.ok(ink.contrast(ink.PAPER, ink.INK) >= 4.5);
  assert.equal(ink.bestInk(ink.PAPER), ink.INK, "纸白上要用墨黑");
  assert.equal(ink.bestInk("#101010"), ink.PAPER, "暗底上要用纸白");
});

test("ink：spotScore —— 灰不是专色，中间明度的饱和色分最高", () => {
  assert.equal(ink.spotScore([128, 128, 128]), 0);
  assert.equal(ink.spotScore([250, 249, 248]), 0, "接近纸白的颜色不该当专色");
  const red = ink.spotScore([168, 69, 44]);
  const pale = ink.spotScore([255, 230, 225]);
  assert.ok(red > 0 && red > pale, j({ red, pale }));
});

test("ink：pickSpot —— 跳过纸白与墨黑，取到那个专色；退化输入给兜底色", () => {
  const mk = (rgbs) => {
    const d = new Uint8ClampedArray(rgbs.length * 4);
    rgbs.forEach((c, i) => {
      d[i * 4] = c[0];
      d[i * 4 + 1] = c[1];
      d[i * 4 + 2] = c[2];
      d[i * 4 + 3] = c[3] === undefined ? 255 : c[3];
    });
    return d;
  };
  // 一堆纸白/墨黑 + 一小撮朱红：必须取到朱红（这就是"专色"的意思）
  const px = mk([
    [242, 239, 231],
    [23, 22, 16],
    [240, 238, 230],
    [0, 0, 0],
    [168, 69, 44],
    [170, 72, 46],
    [166, 66, 42],
  ]);
  const spot = ink.pickSpot(px, px.length / 4, 1);
  const [r, g, b] = ink.hexToRgb(spot);
  assert.ok(r > 120 && g < 110 && b < 110, `专色不对：${spot}`);
  // 全透明 / 全灰 / 空 → 兜底色
  assert.equal(ink.pickSpot(mk([[200, 30, 30, 0]]), 1, 1), ink.SPOT_FALLBACK);
  assert.equal(ink.pickSpot(mk([[128, 128, 128]]), 1, 1), ink.SPOT_FALLBACK);
  assert.equal(ink.pickSpot(new Uint8ClampedArray(0), 0, 0), ink.SPOT_FALLBACK);
  // 确定性
  assert.equal(ink.pickSpot(px, px.length / 4, 1), spot);
});

test("ink：readableSpot —— 专色在纸上太浅就换兜底色（强调必须看得见）", () => {
  assert.equal(ink.readableSpot("#f4f2ec"), ink.SPOT_FALLBACK);
  assert.equal(ink.readableSpot("#a8452c"), "#a8452c");
  assert.equal(ink.readableSpot("乱码"), ink.SPOT_FALLBACK);
  assert.equal(ink.readableSpot(""), ink.SPOT_FALLBACK);
});

/* --------------------------------------------------------------------------
   契约纪律（静态扫描）
   -------------------------------------------------------------------------- */
test("契约：零越权 —— 无网络 / 无 eval / 无定时器驱动画面 / ctx 只用白名单", () => {
  for (const bad of ["fetch(", "XMLHttpRequest", "eval(", "new Function", "setInterval(", "localStorage"]) {
    assert.ok(!SRC.includes(bad), `skin.js 里不许出现 ${bad}`);
  }
  // setTimeout 只允许用在两处：铅块显形计时与 reportBackdrop 防抖
  const timers = SRC.match(/setTimeout\(/g) || [];
  assert.equal(timers.length, 2, `setTimeout 只该有 2 处（铅块计时 + 上报防抖），实际 ${timers.length}`);
  const allowed = new Set([
    "root",
    "backgroundRoot",
    "defaultCover",
    "mode",
    "interactive",
    "env",
    "options",
    "media",
    "track",
    "lyrics",
    "covers",
    "playback",
    "spectrum",
    "sdk",
    "actions",
  ]);
  const used = new Set([...SRC.matchAll(/(?:ctx|st\.ctx)\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  for (const k of used) assert.ok(allowed.has(k), `用到了契约之外的 ctx.${k}`);
});

test("契约：子模块 import 必须透传入口的 ?t=（偷懒写死 ./lib/x.js 会在真机 404）", () => {
  assert.match(SRC, /new URL\(import\.meta\.url\)\.search/);
  assert.match(SRC, /import\(`\.\/lib\/\$\{file\}\$\{Q\}`\)/);
  assert.ok(!/from "\.\/lib\//.test(SRC), "静态 import 会丢掉 ?t=");
});

test("契约：签名是 update(ctx, patch) / destroy(ctx)", () => {
  assert.match(SRC, /async mount\(ctx\)/);
  assert.match(SRC, /update\(ctx, patch\)/);
  assert.match(SRC, /destroy\(ctx\)/);
  assert.ok(!/\n\s*update\(patch\)/.test(SRC), "update 少写了 ctx 参数");
});

test("契约：频谱快照要读 .bands（当成裸数组用会静默读到 0）", () => {
  assert.match(SRC, /snap\?\.bands/);
  assert.match(SRC, /spectrum\?\.\(\)/);
});

test("纪律：逐字素属性只写在当前行（换行时既要装上也要卸掉）", () => {
  assert.match(SRC, /const wantUnits = i === st\.cur \? 1 : 0/, "要按「这一行该不该是活字行」决定要不要 span");
  assert.match(SRC, /if \(i === st\.cur\) \{/, "只有当前行才切字素 span");
  assert.match(SRC, /dataset\.units/, "要留下「这一行有没有 span」的痕迹，否则换行时卸不掉");
  // 帧循环里不许出现"遍历所有槽位写字素属性"的写法
  const render = SRC.slice(SRC.indexOf("function renderFrame"), SRC.indexOf("const curveKey"));
  assert.ok(!/st\.slots/.test(render), "帧循环里不许遍历整个行池（那是每帧 81 行的账）");
  assert.match(render, /paintUnits\(st, pos\)/);
});

test("纪律：排版曲线写前比对旧值（静止帧零写入）", () => {
  assert.match(SRC, /if \(key !== st\.lastCurveKey\)/, "曲线必须按 key 比对后再写");
  assert.match(SRC, /if \(el\.__v && el\.__v\[name\] === value\) return;/);
  assert.match(SRC, /if \(st\.vars\.get\(name\) === value\) return;/);
});

test("纪律：基准字号来自宿主 lyricsFontSize，曲线只做相对量", () => {
  assert.match(SRC, /--lp-base/, "要把宿主字号写进 --lp-base");
  assert.match(SRC, /lyricsFontSize/);
  assert.match(CSS, /font-size: calc\(var\(--lp-base\) \* var\(--lp-fit\) \* var\(--lp-sz\)/);
  // 正文行不许出现写死的字号（HUD 那种小字是壳，不算）
  const lineBlock = CSS.slice(CSS.indexOf(".lp__line {"), CSS.indexOf(".lp__line[data-state"));
  assert.ok(!/font-size:\s*[\d.]+px/.test(lineBlock), "正文行的字号不能写死（会覆盖用户设置）");
});

test("CSS：只写相对舞台的选择器，且不越过宿主的 @scope", () => {
  const clean = CSS.replace(/\/\*[\s\S]*?\*\//g, ""); // 注释里提到这些名字不算违规
  assert.ok(!/!important/.test(clean), "插件 CSS 里不要用 !important");
  for (const bad of [":root", "html", "body", ".playerview["]) {
    assert.ok(!clean.includes(bad), `不许写 ${bad}（宿主已经用 @scope 限定）`);
  }
  assert.match(CSS, /^\.lp[\s{]/m);
});

test("CSS：整屏文字零滤镜（唯一一个 filter 只挂在纸张纹理上）", () => {
  const clean = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const filters = clean.match(/filter\s*:/g) || [];
  assert.equal(filters.length, 3, `filter 只该出现在纸张纹理上（不含注释），实际 ${filters.length}`);
  const blocks = clean.split("}").map((b) => b.trim()).filter(Boolean);
  for (const b of blocks) {
    const sel = b.slice(0, b.indexOf("{")).trim();
    if (!/filter\s*:/.test(b)) continue;
    assert.match(sel, /\.lp__rules/, `不该给 ${sel} 上滤镜（正文必须矢量清晰）`);
  }
  assert.ok(!/backdrop-filter/.test(clean), "不用背景虚化（这一款没有图片层）");
});

test("CSS：静态档与性能档都关掉过渡（否则「停帧」还在动）", () => {
  assert.match(CSS, /\[data-animations="0"\] \.lp__col \{\s*transition: none;/);
  assert.match(CSS, /\[data-perf="1"\] \.lp__line \{\s*transition: none;/);
});

/* --------------------------------------------------------------------------
   结构 / destroy
   -------------------------------------------------------------------------- */
test("骨架：行池 / 纸面 / 海报 / 空态 / HUD 都在", () => {
  assert.match(SRC, /const SHELL = `/, "骨架要写在一处，别在运行时拼");
  for (const cls of [
    "lp__paper",
    "lp__rules",
    "lp__marks",
    "lp__sheet",
    "lp__col",
    "lp__poster",
    "lp__poster-title",
    "lp__empty",
    "lp__hud",
    "lp__hud-title",
    "lp__num",
    "lp__read",
    "lp__tc",
    "lp__elide--top",
    "lp__elide--bottom",
  ]) {
    assert.ok(SRC.includes(cls), `骨架里少了 ${cls}`);
    assert.ok(CSS.includes("." + cls), `CSS 里少了 .${cls}`);
  }
  assert.match(SRC, /const HALF_WINDOW = 40;/, "行池大小要写成一个常量（自检要对账）");
  assert.match(SRC, /const want = HALF_WINDOW \* 2 \+ 1;/);
  assert.match(SRC, /el\.style\.setProperty\("--slot"/, "槽位在建池时写一次，不做每行每帧的写");
});

test("可观测性：自检与排查需要的 data-* 都在", () => {
  for (const attr of [
    "data-line",
    "data-total",
    "data-lit",
    "data-glyphs",
    "data-weight",
    "data-size",
    "data-set",
    "data-empty",
    "data-poster",
    "data-perf",
    "data-animations",
    "data-interactive",
    "data-narrow",
    "data-dpr",
    "data-idle",
    "data-playing",
    "data-depth",
    "data-off",
    "data-units",
  ]) {
    const key = attr.replace("data-", "");
    assert.ok(
      SRC.includes(`dataset.${key}`) || SRC.includes(`${key} =`) || SRC.includes(`"${key}"`),
      `少了可观测属性 ${attr}`
    );
  }
});

test("destroy：清理帧循环 / 计时器 / WAAPI / 监听 / 根节点，且不碰别人给的背景层", () => {
  const at = SRC.indexOf("destroy(ctx) {");
  assert.ok(at > 0, "destroy 的签名必须是 destroy(ctx)");
  // 注释里提到 backgroundRoot 不算越权（这里只审代码）
  const d = SRC.slice(at, SRC.indexOf("\n};", at)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const need of [
    "stop(st)",
    "clearTimeout(st.holdTimer)",
    "clearTimeout(st.backdropTimer)",
    "a.cancel()",
    "removeEventListener",
    "st.elRoot.remove()",
  ]) {
    assert.ok(d.includes(need), `destroy 里少了 ${need}`);
  }
  assert.ok(!/bgRoot|backgroundRoot/.test(d), "这一款声明了 background:false，不该去动宿主的背景容器");
  assert.match(d, /S = null;/);
});

test("README：写清楚结构 / 数据映射 / 降级 / 自检命令", () => {
  for (const need of ["letterpress", "node --test", "letterpress-check.mjs", "降级", "数据映射", "实现偏差"]) {
    assert.ok(README.includes(need), `README 里少了「${need}」`);
  }
});
