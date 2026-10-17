/* ==========================================================================
   diva/tests/diva-lyrics.test.js — 逐字歌词的纯逻辑自检
   --------------------------------------------------------------------------
   歌词模块的 DOM 部分不在这里测（项目没有 jsdom 依赖，也不该为一个皮肤引入）：
   所有「算哪一行 / 每个字素该不该亮」的计算都被抽成了可导出的纯函数，这里逐条
   断言；再用静态扫描钉住那些不能用 DOM 测的纪律（不拼 HTML、不建循环、不用
   网络 API、data-* 契约齐全）。

   运行：node --test "plugins/style/diva/tests/diva-lyrics.test.js"
   ========================================================================== */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FALLBACK_LINE_MS,
  LIT_SUNG,
  LIT_SINGING,
  LIT_UNSUNG,
  emptyStatusOf,
  glyphProgress,
  glyphStarts,
  lineEndAt,
  lineIndexAt,
  litCountOf,
  splitLyricText,
  statusEmptyText,
  transText,
} from "../lib/lyrics.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "lib", "lyrics.js"), "utf8");

/* ==========================================================================
   1. 行定位
   ========================================================================== */
test("lineIndexAt：二分定位，起点闭区间，-1 = 还没到第一句", () => {
  const lines = [{ time: 1000 }, { time: 2000 }, { time: 3500 }];
  assert.equal(lineIndexAt([], 5000), -1, "没有歌词");
  assert.equal(lineIndexAt(lines, 0), -1, "第一句之前");
  assert.equal(lineIndexAt(lines, 999), -1);
  assert.equal(lineIndexAt(lines, 1000), 0, "正好在起点上算这一句");
  assert.equal(lineIndexAt(lines, 1999), 0);
  assert.equal(lineIndexAt(lines, 2000), 1);
  assert.equal(lineIndexAt(lines, 3499), 1);
  assert.equal(lineIndexAt(lines, 3500), 2);
  assert.equal(lineIndexAt(lines, 99999), 2, "最后一句之后仍然停在最后一句");
  assert.equal(lineIndexAt(lines, Number.NaN), -1);
  assert.equal(lineIndexAt(null, 1000), -1);
});

test("lineEndAt：本行结束 = 下一行起点；没有下一行时用兜底时长", () => {
  const lines = [{ time: 1000 }, { time: 2600 }, { time: 2600 }, { time: 5000 }];
  assert.equal(lineEndAt(lines, 0), 2600);
  assert.equal(lineEndAt(lines, 1), 2600 + FALLBACK_LINE_MS, "下一行时间不前进（同刻）→ 兜底");
  assert.equal(lineEndAt(lines, 2), 5000);
  assert.equal(lineEndAt(lines, 3), 5000 + FALLBACK_LINE_MS, "最后一句没有下一行");
  assert.equal(lineEndAt([], 0), 0);
  assert.equal(FALLBACK_LINE_MS, 4200);
});

/* ==========================================================================
   2. 字素拆分：必须与 line.words 对齐
   ========================================================================== */
test("splitLyricText：优先用 sdk.splitGraphemes（words 的下标按它排）", () => {
  const sdk = { splitGraphemes: (s) => s.split("|") };
  assert.deepEqual(splitLyricText("a|b|c", sdk), ["a", "b", "c"]);
  let called = 0;
  const spy = {
    splitGraphemes(s) {
      called += 1;
      return [...s];
    },
  };
  assert.deepEqual(splitLyricText("你好", spy), ["你", "好"]);
  assert.equal(called, 1, "sdk 的实现必须真的被调用");
});

test("splitLyricText：没有 sdk（或它抛异常）时用 Array.from 兜底", () => {
  assert.deepEqual(splitLyricText("你好，世界！"), ["你", "好", "，", "世", "界", "！"]);
  assert.deepEqual(splitLyricText("🎤a"), ["🎤", "a"], "Array.from 按码位切，不会把代理对劈开");
  assert.deepEqual(splitLyricText("", null), []);
  const throwing = {
    splitGraphemes() {
      throw new Error("宿主实现坏了");
    },
  };
  assert.deepEqual(splitLyricText("ab", throwing), ["a", "b"], "异常时退回兜底，不向上抛");
});

/* ==========================================================================
   3. 每个字素的起始毫秒
   ========================================================================== */
test("glyphStarts：有 words 用精确时间轴（每个字素一个起始毫秒）", () => {
  const line = { time: 0, text: "abc", words: [0, 500, 1000] };
  assert.deepEqual(glyphStarts(line, ["a", "b", "c"], 2000), [0, 500, 1000]);
});

test("glyphStarts：没有 words 时把本行时长均摊到每个字素", () => {
  const line = { time: 1000, text: "abcd" };
  const starts = glyphStarts(line, ["a", "b", "c", "d"], 5000);
  assert.deepEqual(starts, [1000, 2000, 3000, 4000]);
  for (let k = 1; k < starts.length; k += 1) assert.ok(starts[k] - starts[k - 1] === 1000);
  assert.ok(starts[starts.length - 1] < 5000, "最后一个字素必须在行尾之前开始");
});

test("glyphStarts：words 与字素数量对不上 → 退回均摊（错位点亮比不逐字更糟）", () => {
  const line = { time: 0, text: "abc", words: [0, 500] };
  const starts = glyphStarts(line, ["a", "b", "c"], 3000);
  assert.equal(starts.length, 3);
  assert.equal(starts[0], 0);
  assert.ok(Math.abs(starts[1] - 1000) < 1e-9);
  assert.ok(Math.abs(starts[2] - 2000) < 1e-9);
});

test("glyphStarts：lineEndMs 非法时用 4200ms 兜底，末字仍在行内", () => {
  const line = { time: 1000, text: "ab" };
  const starts = glyphStarts(line, ["a", "b"], Number.NaN);
  assert.deepEqual(starts, [1000, 1000 + FALLBACK_LINE_MS / 2]);
  assert.ok(starts[1] < 1000 + FALLBACK_LINE_MS);
});

/* ==========================================================================
   4. 点亮态（0 未唱 / 1 正在唱 / 2 已唱）
   ========================================================================== */
test("glyphProgress：逐字边界 —— 唱到哪个字就点亮到哪个字", () => {
  const line = { time: 0, text: "abc", words: [0, 500, 1000] };
  const g = ["a", "b", "c"];
  assert.deepEqual(glyphProgress(line, g, -1, 2000), [0, 0, 0], "还没开口");
  assert.deepEqual(glyphProgress(line, g, 0, 2000), [1, 0, 0], "第一个字正在唱");
  assert.deepEqual(glyphProgress(line, g, 499, 2000), [1, 0, 0]);
  assert.deepEqual(glyphProgress(line, g, 500, 2000), [2, 1, 0], "换字：上一个变已唱");
  assert.deepEqual(glyphProgress(line, g, 999, 2000), [2, 1, 0]);
  assert.deepEqual(glyphProgress(line, g, 1000, 2000), [2, 2, 1]);
  assert.deepEqual(glyphProgress(line, g, 1999, 2000), [2, 2, 1]);
  assert.deepEqual(glyphProgress(line, g, 2000, 2000), [2, 2, 2], "越过行尾：全部已唱");
});

test("glyphProgress：无 words 时按均摊边界点亮", () => {
  const line = { time: 1000, text: "abcd" };
  const g = ["a", "b", "c", "d"];
  assert.deepEqual(glyphProgress(line, g, 999, 5000), [0, 0, 0, 0]);
  assert.deepEqual(glyphProgress(line, g, 1000, 5000), [1, 0, 0, 0]);
  assert.deepEqual(glyphProgress(line, g, 1999, 5000), [1, 0, 0, 0]);
  assert.deepEqual(glyphProgress(line, g, 2000, 5000), [2, 1, 0, 0]);
  assert.deepEqual(glyphProgress(line, g, 4000, 5000), [2, 2, 2, 1]);
});

test("glyphProgress：末字兜底 —— 最后一句不会永远停在「正在唱」", () => {
  const line = { time: 0, text: "a" };
  assert.deepEqual(glyphProgress(line, ["a"], 4199, FALLBACK_LINE_MS), [1]);
  assert.deepEqual(glyphProgress(line, ["a"], FALLBACK_LINE_MS, FALLBACK_LINE_MS), [2]);
  assert.deepEqual(glyphProgress(line, [], 0, 1000), [], "没有字素就没有点亮态");
  assert.deepEqual(glyphProgress(line, ["a"], Number.NaN, 1000), [0]);
});

test("litCountOf：正在唱 + 已唱都算「已点亮」，写进 data-dv-lit", () => {
  assert.equal(litCountOf([0, 0, 0]), 0);
  assert.equal(litCountOf([1, 0, 0]), 1);
  assert.equal(litCountOf([2, 1, 0]), 2);
  assert.equal(litCountOf([2, 2, 2]), 3);
  assert.equal(litCountOf(null), 0);
  assert.equal(LIT_UNSUNG, 0);
  assert.equal(LIT_SINGING, 1);
  assert.equal(LIT_SUNG, 2);
});

/* ==========================================================================
   5. 多语言翻译 / 空态
   ========================================================================== */
test("transText：同时间戳的其它语言用 ' · ' 连接", () => {
  assert.equal(transText({ text: "hello", trans: ["你好", "konnichiwa"] }), "你好 · konnichiwa");
  assert.equal(transText({ text: "hello" }), "", "单语言 → 空串，交给 CSS 的 :empty 隐藏");
  assert.equal(transText({ text: "hello", trans: ["  ", ""] }), "", "空译文不算一条");
  assert.equal(transText({ text: "x", trans: ["a", "", "b"] }), "a · b");
  assert.equal(transText({ text: "x", trans: ["a", "b"] }, " / "), "a / b");
  assert.equal(transText(null), "");
});

test("emptyStatusOf：无歌词 / 加载中 / 匹配失败要能分开（宿主没给 status 时从文案反推）", () => {
  assert.equal(emptyStatusOf([{ time: 0 }], {}), "ok");
  assert.equal(emptyStatusOf([], { status: "loading" }), "loading", "显式 status 优先");
  assert.equal(emptyStatusOf([], { emptyText: "歌词匹配中…" }), "loading");
  assert.equal(emptyStatusOf([], { emptyText: "正在加载歌词" }), "loading");
  assert.equal(emptyStatusOf([], { emptyText: "歌词匹配失败" }), "failed");
  assert.equal(emptyStatusOf([], { emptyText: "在线匹配失败" }), "failed");
  assert.equal(emptyStatusOf([], { emptyText: "暂无歌词" }), "none");
  assert.equal(emptyStatusOf([], {}), "none");
  assert.equal(emptyStatusOf(null, {}), "none");
});

test("statusEmptyText：状态 → 明确的空态文案（不允许空白）", () => {
  assert.equal(statusEmptyText("loading"), "歌词匹配中…");
  assert.equal(statusEmptyText("matching"), "歌词匹配中…");
  assert.equal(statusEmptyText("failed"), "歌词匹配失败");
  assert.equal(statusEmptyText("none"), "暂无歌词");
  assert.equal(statusEmptyText("whatever"), "暂无歌词");
  assert.equal(statusEmptyText(undefined), "暂无歌词");
});

/* ==========================================================================
   6. 静态扫描：契约纪律
   ========================================================================== */
test("不拼 HTML：歌词文本只能走 textContent", () => {
  assert.doesNotMatch(SRC, /innerHTML/, "歌词来自用户文件 / 在线匹配，绝不能当 HTML 拼");
  assert.doesNotMatch(SRC, /outerHTML/);
  assert.doesNotMatch(SRC, /insertAdjacentHTML/);
  assert.match(SRC, /textContent/, "所有文字都必须用 textContent 写");
  assert.match(SRC, /document\.createElement/, "DOM 用 createElement 建，不拼字符串");
});

test("不建循环 / 计时器：帧由 entry 驱动，本模块只提供 tick", () => {
  assert.doesNotMatch(SRC, /requestAnimationFrame/, "lib 里不许开帧循环");
  assert.doesNotMatch(SRC, /\bsetInterval\s*\(/);
  assert.doesNotMatch(SRC, /\bsetTimeout\s*\(/);
  assert.doesNotMatch(SRC, /\bwindow\./, "不碰整窗对象");
  assert.doesNotMatch(SRC, /document\.documentElement/);
  assert.match(SRC, /function tick\(/, "帧循环每帧调的就是它");
});

test("不发网络请求 / 不 eval / 不碰存储", () => {
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /\beval\s*\(/, /new\s+Function\s*\(/, /localStorage/, /sessionStorage/, /navigator\.sendBeacon/]) {
    assert.doesNotMatch(SRC, bad, `lyrics.js 不许出现 ${bad}`);
  }
});

test("没有静态 import：子模块必须透传 ?t=（/skins/ 逐文件鉴权）", () => {
  const staticImports = [...SRC.matchAll(/^\s*import\s+[^("]/gm)];
  assert.equal(staticImports.length, 0, "静态 import 会丢掉 query → 403");
  assert.match(SRC, /new URL\(import\.meta\.url\)\.search/);
  assert.match(SRC, /\$\{Q\}/, "动态 import 必须带上 query");
  assert.match(SRC, /import\(`\.\/config\.js\$\{Q\}`\)/);
  assert.doesNotMatch(SRC, /from\s+["'](?:\.\.\/|player-skins|store\.js)/, "不 import 宿主模块");
});

test("观测契约：data-* 齐全（自检脚本按它们断言）", () => {
  for (const key of ["dvLines", "dvIndex", "dvLit", "dvEmpty", "dvStatus"]) {
    assert.match(SRC, new RegExp(`dataset\\.${key}\\b`), `缺少 dataset.${key}（data-dv-*）`);
  }
  for (const cls of [
    "dv-lrc",
    "dv-lrc__stack",
    "dv-lrc__line",
    "dv-lrc__line--prev",
    "dv-lrc__line--cur",
    "dv-lrc__line--next",
    "dv-lrc__trans",
    "dv-lrc__empty",
    "dv-lrc__emptyRing",
    "dv-lrc__emptyText",
    "dv-lrc__g",
  ]) {
    assert.ok(SRC.includes(cls), `缺少 DOM 类名 ${cls}`);
  }
  assert.match(SRC, /dataset\.role/, "prev / cur / next 必须有 data-role");
  assert.match(SRC, /dataset\.lit/, "字素必须有 data-lit 0/1/2");
  assert.match(SRC, /aria-current/, "当前行必须标 aria-current");
});

test("接口齐全（冻结契约）：五个方法 + 唯一一条 tick 驱动", () => {
  for (const fn of ["setLines", "setPosition", "tick", "setOptions", "destroy"]) {
    assert.match(SRC, new RegExp(`function ${fn}\\(`), `缺少 ${fn}()`);
  }
  assert.match(SRC, /return \{ setLines, setPosition, tick, setOptions, destroy \}/);
  assert.match(SRC, /splitGraphemes/, "必须优先用宿主的字素切分");
  assert.match(SRC, /Array\.from/, "没有 sdk 时用 Array.from 兜底");
  assert.match(SRC, /TIMING\.maxInterpMs/, "帧间外推必须有上限（暂停后位置不许继续跑）");
});
