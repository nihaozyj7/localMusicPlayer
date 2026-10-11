/**
 * 塔 spire —— 纯逻辑自检（node --test）
 *
 * 覆盖：
 *   · lib/tower.js：塔体几何、可见度、深度着色、DOM 窗口、飞行时长与插值、塔形收缩、逐字档位、行定位、时间码
 *   · lib/camera.js：阻尼相机、跳跃、段落抬升、呼吸、EMA
 *   · 静态扫描：契约纪律（零裸包名 import / 子模块透传 ?t= / ctx 白名单 / CSS 禁用项 / 清单与图标）
 *
 * 跑法： node --test "plugins/style/spire/tests/*.test.js"
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");

// Windows 上 import() 只认 file:// URL（直接喂 "C:\..." 会报 ERR_UNSUPPORTED_ESM_URL_SCHEME）
const tower = await import(pathToFileURL(join(PKG, "lib/tower.js")).href);
const camera = await import(pathToFileURL(join(PKG, "lib/camera.js")).href);

const SRC = readFileSync(join(PKG, "skin.js"), "utf8");
const CSS = readFileSync(join(PKG, "skin.css"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(PKG, "skin.json"), "utf8"));

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const j = (v) => JSON.stringify(v);

/* ==========================================================================
   tower.js —— 塔体几何
   ========================================================================== */
test("cardGeometry：镜头所在的那一层是原点（不转不缩）", () => {
  const g = tower.cardGeometry(3, 3);
  assert.equal(g.x, 0);
  assert.equal(g.y, 0);
  assert.equal(g.z, 0);
  assert.equal(g.rot, 0);
  assert.equal(g.scale, 1);
  assert.equal(g.sign, 0);
});

test("cardGeometry：镜头下方的层（还没唱到）沿 -Z / -Y 铺开，并逆时针转", () => {
  const g = tower.cardGeometry(4, 3);
  assert.equal(g.z, -tower.SHAPE.stepZ);
  assert.equal(g.y, -tower.SHAPE.stepY);
  assert.equal(g.rot, -tower.SHAPE.turn);
  assert.equal(g.sign, 1);
  assert.ok(g.x > 0, "螺旋半径把层推到一侧");
});

test("cardGeometry：镜头下方的层（唱过的）反向铺开，符号相反", () => {
  const g = tower.cardGeometry(1, 3);
  assert.equal(g.z, 2 * tower.SHAPE.stepZ);
  assert.equal(g.y, 2 * tower.SHAPE.stepY);
  assert.equal(g.rot, 2 * tower.SHAPE.turn);
  assert.equal(g.sign, -1);
  assert.ok(g.x < 0);
});

test("cardGeometry：螺旋半径对称（±d 的横向偏移大小相同、方向相反）", () => {
  const a = tower.cardGeometry(5, 3);
  const b = tower.cardGeometry(1, 3);
  assert.ok(near(Math.abs(a.x), Math.abs(b.x), 1e-3), `${a.x} vs ${b.x}`);
  assert.equal(a.x, -b.x);
});

test("cardGeometry：远处的层收敛到 farScale", () => {
  const far = tower.cardGeometry(3 + tower.SHAPE.fadeEnd * 2, 3);
  assert.ok(near(far.scale, tower.SHAPE.farScale, 1e-3), String(far.scale));
  const mid = tower.cardGeometry(3 + tower.SHAPE.fadeEnd / 2, 3);
  assert.ok(mid.scale < 1 && mid.scale > tower.SHAPE.farScale);
});

test("cardGeometry：dy 只影响纵向（相机抬升）", () => {
  const a = tower.cardGeometry(6, 3);
  const b = tower.cardGeometry(6, 3, tower.SHAPE, -26);
  assert.equal(b.y, a.y - 26);
  assert.equal(b.x, a.x);
  assert.equal(b.z, a.z);
});

test("cardOpacity：镜头附近 1、越远越淡、到 fadeEnd 归零", () => {
  assert.equal(tower.cardOpacity(0), 1);
  assert.equal(tower.cardOpacity(tower.SHAPE.fadeStart), 1);
  assert.equal(tower.cardOpacity(tower.SHAPE.fadeEnd), 0);
  assert.equal(tower.cardOpacity(tower.SHAPE.fadeEnd + 3), 0);
  const a = tower.cardOpacity(7);
  const b = tower.cardOpacity(9);
  assert.ok(a > b && b > 0, `${a} > ${b} > 0`);
  assert.equal(tower.cardOpacity(-7), a, "对称：唱过的层与还没唱到的层同样淡出");
});

test("depthShade：0 最近、1 最远、单调", () => {
  assert.equal(tower.depthShade(0), 0);
  assert.equal(tower.depthShade(tower.SHAPE.fadeEnd), 1);
  assert.equal(tower.depthShade(999), 1);
  assert.ok(tower.depthShade(4) < tower.depthShade(8));
});

test("visibleRange：两端夹住，中间按半窗取", () => {
  assert.deepEqual(tower.visibleRange(0, 20, 3), { from: 0, to: 3, count: 4 });
  assert.deepEqual(tower.visibleRange(10, 20, 3), { from: 7, to: 13, count: 7 });
  assert.deepEqual(tower.visibleRange(19, 20, 3), { from: 16, to: 19, count: 4 });
  assert.deepEqual(tower.visibleRange(0.4, 1, 5), { from: 0, to: 0, count: 1 });
  assert.deepEqual(tower.visibleRange(3, 0, 5), { from: 0, to: -1, count: 0 });
});

test("halfWindowFor：性能档 6 / 窄窗 8 / 默认 12", () => {
  assert.equal(tower.halfWindowFor({ performanceMode: "performance" }), 6);
  assert.equal(tower.halfWindowFor({ narrow: true }), 8);
  assert.equal(tower.halfWindowFor({}), tower.SHAPE.halfWindow);
});

test("flightDuration：间隔越长飞得越久，并夹在 600~1400ms", () => {
  assert.equal(tower.flightDuration(400), 600, "快节奏 → 最短");
  assert.equal(tower.flightDuration(0), 600);
  assert.equal(tower.flightDuration(NaN), 600);
  assert.equal(tower.flightDuration(1200), 600, "fastGap 处取下界");
  assert.equal(tower.flightDuration(6000), 1400, "slowGap 处取上界");
  assert.equal(tower.flightDuration(60000), 1400);
  const a = tower.flightDuration(2000);
  const b = tower.flightDuration(4000);
  assert.ok(a < b, `${a} < ${b}`);
});

test("easeOutCubic：0→0、1→1、中点先快后慢", () => {
  assert.equal(tower.easeOutCubic(0), 0);
  assert.equal(tower.easeOutCubic(1), 1);
  assert.ok(near(tower.easeOutCubic(0.5), 0.875, 1e-6));
  assert.equal(tower.easeOutCubic(-1), 0);
  assert.equal(tower.easeOutCubic(2), 1);
});

test("flightAt：0ms 在起点、到时到终点、途中单调", () => {
  const a = tower.flightAt(2, 6, 0, 1000);
  assert.equal(a.cam, 2);
  assert.equal(a.done, false);
  const b = tower.flightAt(2, 6, 1000, 1000);
  assert.equal(b.cam, 6);
  assert.equal(b.done, true);
  assert.equal(b.t, 1);
  const c = tower.flightAt(2, 6, 1500, 1000);
  assert.equal(c.cam, 6);
  const mid = tower.flightAt(2, 6, 400, 1000).cam;
  assert.ok(mid > 2 && mid < 6);
  assert.ok(tower.flightAt(2, 6, 700, 1000).cam > mid, "单调推进");
  const zero = tower.flightAt(2, 6, 10, 0);
  assert.equal(zero.cam, 6, "时长为 0 = 直接跳");
  assert.equal(zero.done, true);
});

test("shapeFor：窄窗口把层间距与半径压小，性能档再压一档，且都有上下限", () => {
  const wide = tower.shapeFor({ width: 1280 });
  const narrow = tower.shapeFor({ width: 780, narrow: true });
  const ultra = tower.shapeFor({ width: 320, narrow: true });
  assert.ok(narrow.stepY < wide.stepY && narrow.radius < wide.radius);
  assert.ok(narrow.turn < wide.turn, "窄窗口转向收敛（少一点 rotateY，字更清楚）");
  // 宽度系数有下限：再窄也不会无限收（否则层会叠在一起）
  const floorY = Math.round(tower.SHAPE.stepY * 0.62);
  assert.equal(ultra.stepY, floorY, `宽度系数 0.62 是下限（实际 ${ultra.stepY}）`);
  assert.ok(ultra.stepY <= narrow.stepY, "单调不收反涨");
  const perf = tower.shapeFor({ width: 1280, performanceMode: "performance" });
  assert.ok(perf.stepZ < wide.stepZ, "性能档把 Z 间距收一点，减少层数上的填充");
  assert.equal(perf.stepY, wide.stepY);
  assert.ok(wide.perspective > 0 && wide.perspective <= tower.SHAPE.perspective * 1.1 + 1);
});

test("shapeFor 必须返回**完整**塔形（缺键 → scale=NaN → 整条 transform 被 CSS 忽略）", () => {
  for (const opts of [{ width: 1280 }, { width: 780, narrow: true }, { width: 1280, performanceMode: "performance" }]) {
    const s = tower.shapeFor(opts);
    for (const key of ["stepZ", "stepY", "radius", "turn", "farScale", "halfWindow", "fadeStart", "fadeEnd", "perspective"]) {
      assert.ok(Number.isFinite(s[key]), `shapeFor(${j(opts)}) 缺少 ${key}`);
    }
    // 用它算出来的几何必须全是有限数（NaN 会让 transform 变成非法值，画面直接塌）
    for (const d of [0, 1, 3, -2, 11, 12]) {
      const g = tower.cardGeometry(d, 0, s);
      for (const k of ["x", "y", "z", "rot", "scale"]) {
        assert.ok(Number.isFinite(g[k]), `geometry(${d}).${k} = ${g[k]}`);
      }
      assert.ok(Number.isFinite(tower.cardOpacity(d, s)));
      assert.ok(Number.isFinite(tower.depthShade(d, s)));
    }
  }
});

test("unitLevels：没有字级数据时整行一起亮/一起灭", () => {
  const all = tower.unitLevels(null, 4, 1000);
  assert.deepEqual(all, [1, 1, 1, 1]);
  const short = tower.unitLevels([1000, 1500], 5, 1200);
  assert.deepEqual(short, [1, 1, 1, 1, 1], "长度对不齐 → 整行");
  const empty = tower.unitLevels(null, 0, 0);
  assert.deepEqual(empty, []);
});

test("unitLevels：唱到哪算哪（字素起点 → 0，下一个字素起点 → 1）", () => {
  const words = [1000, 1500, 2000];
  assert.deepEqual(tower.unitLevels(words, 3, 900), [0, 0, 0]);
  assert.deepEqual(tower.unitLevels(words, 3, 1000), [0, 0, 0]);
  assert.deepEqual(tower.unitLevels(words, 3, 1250), [0.5, 0, 0]);
  assert.deepEqual(tower.unitLevels(words, 3, 1500), [1, 0, 0]);
  assert.deepEqual(tower.unitLevels(words, 3, 1750), [1, 0.5, 0]);
  assert.deepEqual(tower.unitLevels(words, 3, 2000), [1, 1, 0]);
});

test("unitLevels：末字时长 = 相邻间隔的中位数，并夹在行尾之内", () => {
  const words = [0, 500, 1000, 1500];
  // 中位间隔 500 → 末字 1500..2000
  assert.equal(tower.unitLevels(words, 4, 1750)[3], 0.5);
  assert.equal(tower.unitLevels(words, 4, 2000)[3], 1);
  // 行尾更早 → 末字在行尾就结束
  const capped = tower.unitLevels(words, 4, 1700, { lineEnd: 1700 });
  assert.equal(capped[3], 1, "行尾到了就直接满格");
  // 只有一个字素：没有间隔可算 → 回退 tail
  const one = tower.unitLevels([0], 1, 200, { tail: 400 });
  assert.equal(one[0], 0.5);
});

test("unitLevels：长间奏里末字不会亮十几秒（clamp 到行尾）", () => {
  const words = [0, 400];
  const lv = tower.unitLevels(words, 2, 9000, { lineEnd: 4000 });
  assert.equal(lv[1], 1, "行尾之后保持满格，而不是继续慢慢涨");
  assert.ok(tower.unitLevels(words, 2, 5000, { lineEnd: 4000 })[1] <= 1);
});

test("lineIndexAt：二分定位（含行首、行间、行前、空表）", () => {
  const lines = [{ time: 0 }, { time: 4000 }, { time: 9000 }];
  assert.equal(tower.lineIndexAt(lines, 0), 0);
  assert.equal(tower.lineIndexAt(lines, 3999), 0);
  assert.equal(tower.lineIndexAt(lines, 4000), 1);
  assert.equal(tower.lineIndexAt(lines, 9500), 2);
  assert.equal(tower.lineIndexAt(lines, -50), 0, "还没开始 → 第 0 行");
  assert.equal(tower.lineIndexAt([], 100), -1);
  assert.equal(tower.lineIndexAt(null, 100), -1);
});

test("nextLineTime：末行之后是 null", () => {
  const lines = [{ time: 0 }, { time: 4000 }];
  assert.equal(tower.nextLineTime(lines, 0), 4000);
  assert.equal(tower.nextLineTime(lines, 1), null);
  assert.equal(tower.nextLineTime(null, 0), null);
});

test("isCurrent：浮点层号的容差判断", () => {
  assert.equal(tower.isCurrent(3, 3), true);
  assert.equal(tower.isCurrent(3.2, 3), true);
  assert.equal(tower.isCurrent(3.5, 3), false);
  assert.equal(tower.isCurrent(4, 3), false);
});

test("timecode：mm:ss（负数与非法值都当 0）", () => {
  assert.equal(tower.timecode(0), "00:00");
  assert.equal(tower.timecode(999), "00:00");
  assert.equal(tower.timecode(65000), "01:05");
  assert.equal(tower.timecode(-5000), "00:00");
  assert.equal(tower.timecode(NaN), "00:00");
  assert.equal(tower.timecode(3600000), "60:00");
});

/* ==========================================================================
   camera.js —— 分层相机
   ========================================================================== */
test("createCamera / aim / jump：目标与位置的关系", () => {
  const c = camera.createCamera(2);
  assert.equal(c.pos, 2);
  assert.equal(c.target, 2);
  camera.aim(c, 9);
  assert.equal(c.target, 9);
  assert.equal(c.pos, 2, "aim 不动位置");
  camera.jump(c, 9);
  assert.equal(c.pos, 9);
  assert.equal(c.vel, 0);
});

test("stepCamera：无过冲地收敛到目标，并且能判定 settled", () => {
  const c = camera.createCamera(0);
  camera.aim(c, 5);
  let settled = false;
  let maxPos = 0;
  for (let i = 0; i < 400 && !settled; i += 1) {
    const r = camera.stepCamera(c, 1 / 60);
    maxPos = Math.max(maxPos, r.pos);
    settled = r.settled;
  }
  assert.ok(settled, "400 帧内应当收敛");
  assert.equal(c.pos, 5);
  assert.equal(c.vel, 0);
  assert.ok(maxPos <= 5 + 1e-6, `无过冲（峰值 ${maxPos}）`);
});

test("stepCamera：巨大的 dt 被夹住（切后台回来不会炸）", () => {
  const c = camera.createCamera(0);
  camera.aim(c, 10);
  camera.stepCamera(c, 60); // 60 秒
  assert.ok(c.pos <= 10 + 1e-6, `不允许冲过目标：${c.pos}`);
  assert.ok(Number.isFinite(c.pos) && Number.isFinite(c.vel));
});

test("stepCamera：非法 dt 当作 0（位置不动，但也不算崩）", () => {
  const c = camera.createCamera(3);
  camera.aim(c, 3);
  const r = camera.stepCamera(c, NaN);
  assert.equal(r.pos, 3);
  assert.equal(r.settled, true);
});

test("liftForGap：间隔越长抬得越低（负值），并夹在上限", () => {
  assert.equal(camera.liftForGap(0), 0);
  assert.equal(camera.liftForGap(NaN), 0);
  assert.equal(camera.liftForGap(60000), -26);
  assert.equal(camera.liftForGap(6000, { maxDy: 26 }), -26);
  const a = camera.liftForGap(2000);
  const b = camera.liftForGap(5000);
  assert.ok(a > b && b >= -26, `${a} > ${b} >= -26`);
});

test("breathForBass：0 不动、1 到顶、越界夹住", () => {
  assert.equal(camera.breathForBass(0), 0);
  assert.equal(camera.breathForBass(1), 9);
  assert.equal(camera.breathForBass(2), 9);
  assert.equal(camera.breathForBass(-1), 0);
  assert.equal(camera.breathForBass(NaN), 0);
  assert.equal(camera.breathForBass(0.5, { amp: 10 }), 5);
});

test("ema：起点直接取样本（prev<=0 是「没有上一次」的哨兵），之后平滑逼近", () => {
  assert.equal(camera.ema(-1, 20, 0.25), 20);
  assert.equal(camera.ema(NaN, 20), 20);
  assert.equal(camera.ema(0, 20, 0.5), 20, "0 也算哨兵 → 直接取样本");
  assert.equal(camera.ema(20, 0, 0.5), 10);
  assert.equal(camera.ema(camera.ema(20, 0, 0.5), 20, 0.5), 15);
  assert.equal(camera.ema(10, NaN, 0.5), 5, "非有限样本当 0");
});

/* ==========================================================================
   静态纪律扫描
   ========================================================================== */
test("零裸包名 import / 子模块透传 ?t=", () => {
  const imports = [...SRC.matchAll(/^\s*import\s+(?:[^'"]*from\s+)?["']([^"']+)["']/gm)].map((m) => m[1]);
  for (const spec of imports) {
    assert.ok(spec.startsWith(".") || spec.startsWith("/"), `不允许裸包名 import：${spec}`);
  }
  assert.match(SRC, /new URL\(import\.meta\.url\)\.search/, "必须读入口的查询串");
  assert.match(SRC, /import\(`\.\/lib\/\$\{file\}\$\{Q\}`\)/, "子模块 import 必须透传 ?t=");
  assert.ok(!/import\(["']\.\/lib\//.test(SRC), "不许写死没有 token 的子模块路径");
});

test("不许用的 API 一个都不能出现", () => {
  for (const bad of ["fetch(", "eval(", "new Function", "setInterval", "localStorage", "sessionStorage", "document.write"]) {
    assert.ok(!SRC.includes(bad), `skin.js 里不允许出现 ${bad}`);
  }
  assert.ok(!/requestAnimationFrame[\s\S]*requestAnimationFrame[\s\S]*requestAnimationFrame/.test(SRC) === false, "帧循环只能有一条");
  const rafSites = [...SRC.matchAll(/requestAnimationFrame\(/g)].length;
  assert.ok(rafSites <= 3, `rAF 调用点应当很少（实际 ${rafSites} 处）`);
});

test("ctx 白名单：只碰契约里有的成员", () => {
  const allowed = new Set([
    "root", "backgroundRoot", "playback", "media", "track", "lyrics", "covers",
    "options", "env", "spectrum", "sdk", "on", "actions", "defaultCover", "themeId", "mode", "interactive",
  ]);
  const used = new Set();
  for (const m of SRC.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
  for (const m of SRC.matchAll(/\bst\.ctx\.([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
  for (const key of used) assert.ok(allowed.has(key), `越权使用 ctx.${key}`);
  for (const m of SRC.matchAll(/actions\??\.([A-Za-z_$][\w$]*)/g)) {
    assert.ok(["reportBackdrop", "seek"].includes(m[1]), `未受控的动作 ctx.actions.${m[1]}`);
  }
  assert.ok(SRC.includes("manifest"), "配色要读清单");
});

test("频谱快照必须取 .bands（不是把快照当数组）", () => {
  assert.match(SRC, /snap\?\.bands/, "必须从 {bands, at} 里取 bands");
  assert.ok(!/avgRange\([^)]*spectrum\(\)/.test(SRC), "不许把 spectrum() 的返回值直接喂给 avgRange");
});

test("CSS：3D 链条上不许出现分组属性（filter / backdrop-filter / contain / mask）", () => {
  const clean = CSS.replace(/\/\*[\s\S]*?\*\//g, ""); // 注释里的词不算
  // 会压平整套透视的只有「3D 渲染上下文自己」与「它里面的元素」——
  // 也就是 .sp__world（透视容器）/ .sp__tower（preserve-3d）/ .sp__card（层）。
  // 祖先（.sp）与旁边的背景层（.spbg）不受影响，P4 已实测，所以只在这三个上把门。
  const blocks = clean.split("}").map((b) => b.trim()).filter(Boolean);
  for (const b of blocks) {
    const sel = b.slice(0, b.indexOf("{")).trim();
    if (!/\.sp__world|\.sp__tower|\.sp__card/.test(sel)) continue;
    for (const decl of b.slice(b.indexOf("{") + 1).split(";")) {
      const prop = decl.split(":")[0].trim().toLowerCase();
      assert.ok(
        !["filter", "backdrop-filter", "contain", "mask", "mask-image"].includes(prop),
        `${sel} 上不许出现分组属性 ${prop}（会把塔压平）`
      );
    }
  }
  assert.ok(!/!important/.test(CSS), "插件 CSS 里不要用 !important");
  for (const bad of [":root", "html", "body", ".playerview["]) {
    assert.ok(!CSS.includes(bad), `不许写 ${bad}（宿主已经用 @scope 限定）`);
  }
  // 整窗背景层的内容是本包自己填的，必须真的写过样式（曾经只有 DOM 没有样式）
  for (const sel of [".spbg", ".spbg__img", ".spbg__veil", ".spbg__shaft"]) {
    assert.ok(clean.includes(sel + " {") || clean.includes(sel + ","), `背景层缺样式：${sel}`);
  }
});

test("CSS：preserve-3d 只出现在塔体与层上，且用它自己的变量", () => {
  const clean = CSS.replace(/\/\*[\s\S]*?\*\//g, ""); // 注释里的词不算
  const blocks = clean.split("}").map((b) => b.trim());
  const p3 = blocks.filter((b) => /transform-style:\s*preserve-3d/.test(b));
  assert.equal(p3.length, 2, "preserve-3d 只应出现在塔体与层上");
  for (const b of p3) {
    const sel = b.slice(0, b.indexOf("{")).trim();
    assert.ok(/^\.sp__(tower|card)$/.test(sel), `preserve-3d 出现在了不该出现的选择器上：${sel}`);
  }
  assert.match(CSS, /\.sp\s*\{[\s\S]*?overflow:\s*hidden/, "舞台根用 overflow:hidden 裁掉飞出去的层（P4 证明不影响嵌套 3D）");
});

test("清单：id / order / 能力 / 配色 / 帧预算齐全且口径正确", () => {
  assert.equal(MANIFEST.id, "spire");
  assert.equal(MANIFEST.apiVersion, "3.0");
  assert.ok(MANIFEST.order >= 200, "第三方样式的 order 必须 ≥ 200");
  assert.equal(MANIFEST.performance.budgetFps, 45);
  assert.equal(SRC.includes("BUDGET_FPS = 45"), true, "代码里的默认帧预算要与清单一致");
  assert.ok(MANIFEST.capabilities.spectrum && MANIFEST.capabilities.background && MANIFEST.capabilities.interactive);
  for (const k of ["bg", "fg", "accent"]) {
    assert.match(MANIFEST.colors[k], /^#[0-9a-f]{6}$/, `colors.${k} 必须是 6 位 hex`);
  }
  assert.ok(MANIFEST.capabilities.background === SRC.includes("backgroundRoot"), "声明了 background 就要真的用");
});

test("包结构齐全（含 README 与 assets/icon.svg）", () => {
  for (const f of ["skin.json", "skin.js", "skin.css", "README.md", "assets/icon.svg", "lib/tower.js", "lib/camera.js"]) {
    assert.ok(existsSync(join(PKG, f)), `缺文件：${f}`);
  }
  const icon = readFileSync(join(PKG, "assets/icon.svg"), "utf8");
  assert.ok(icon.includes("<svg") && icon.includes("viewBox"), "图标必须是能当 mask 的 svg");
  assert.ok(!/<\?xml/.test(icon), "不要 XML 声明（宿主直接当 mask 用）");
});

test("destroy 必须清干净（舞台 + 整窗背景层 + 帧循环 + 计时器 + 监听）", () => {
  const at = SRC.indexOf("destroy(ctx) {");
  assert.ok(at > 0, "destroy 的签名必须是 destroy(ctx)（与其余样式、与契约一致）");
  const d = SRC.slice(at);
  assert.match(d, /cancelAnimationFrame/);
  assert.match(d, /clearTimeout/);
  assert.match(d, /removeEventListener/);
  assert.match(d, /innerHTML = ""/, "整窗背景层要清空");
  assert.match(d, /bgRoot\.hidden = true/, "整窗背景层要藏起来");
  assert.match(d, /S = null/, "实例引用要断掉");
});

test("字级时间戳按「字素数」对齐（不是按宿主的 graphemes 字段）", () => {
  // 宿主给的 words 对齐的是 sdk.splitGraphemes(text)；行里没有 graphemes 字段是常态，
  // 一旦按 l.graphemes 判断，words 会被误判成"对不齐"→ 整行一起亮（逐字就没了）。
  assert.match(SRC, /wordsIn\.length === graphemes\.length/, "对齐判断要用切出来的字素数");
  assert.ok(!/words\.length === \(Array\.isArray\(l\?\.graphemes\)/.test(SRC), "不许拿宿主字段的存在性当对齐条件");
});

test("可观测性属性：镜头位置 / 是否在飞 / 帧预算（自检与排查都靠它们）", () => {
  assert.match(SRC, /dataset\.cam = /, "要暴露镜头层号");
  assert.match(SRC, /dataset\.flying/, "要暴露是否正在飞行");
  assert.match(SRC, /dataset\.flightMs/, "要暴露这一跳的时长");
  assert.match(SRC, /dataset\.lod|dataset\.cam/, "至少要有可观测状态");
});

test("tests 目录只放自检（不混进安装包）", () => {
  const files = readdirSync(join(PKG, "tests"));
  assert.ok(files.length >= 1);
  for (const f of files) {
    assert.ok(/\.(test\.js|mjs)$/.test(f), `tests 里只应有自检脚本：${f}`);
  }
});
