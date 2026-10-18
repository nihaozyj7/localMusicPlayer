/* ==========================================================================
   track-window.test.js — 曲目表窗口化（大列表只渲染可视行）
   --------------------------------------------------------------------------
   为什么必须测：8000 首时 lit-html 的 repeat 每次 update 都会对每一行调用行
   模板（node_modules/lit-html/directives/repeat.js 的 dt()），实测「切一首歌」
   是一次 234~343ms 的主线程长任务、首屏首绘 1336ms（16000 首 6536ms）。
   窗口化的区间计算一旦算错，表现是**静默**的：滚动到某处出现空白行、
   滚动条长度不对、或者点「播放」时 playContext 收到窗口内下标而播错歌。

   这个文件盯两件事：
     1. computeWindow 的区间与上下占位（纯函数，覆盖边界与夹取）；
     2. DOM 契约没有被窗口化改掉 —— 尤其是「行上的 data-index 必须是整个
        列表里的绝对下标」，以及窗口/队列的分支条件。
   行的可见行为（点击 / 双击 / 右键 / 拖拽 / 定位）由 CDP 自检负责：
     node tools/cdp-check.js / ui-interact.mjs / hitcheck.mjs
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { computeWindow, shouldWindow, WINDOW_MIN_ROWS, WINDOW_BUFFER } from "../src/js/ui/track-table.js";

const here = dirname(fileURLToPath(import.meta.url));
const tableSrc = readFileSync(join(here, "..", "src", "js", "ui", "track-table.js"), "utf8");
const cssSrc = readFileSync(join(here, "..", "src", "styles", "components", "tracktable.css"), "utf8");

/** 一屏 700px、行高 56px（= tokens.css 的 --row-h） */
const VIEW = 700;
const ROW = 56;

test("computeWindow：顶部时从第 0 行开始，窗口含一屏 + 上下缓冲", () => {
  const w = computeWindow(8000, 0, VIEW, ROW, 8);
  assert.equal(w.start, 0);
  assert.equal(w.end, Math.ceil(VIEW / ROW) + 8 * 2 + 1);
  assert.equal(w.padTop, 0);
  assert.equal(w.padBottom, (8000 - w.end) * ROW);
  assert.equal(w.rowH, ROW);
});

test("computeWindow：滚动到中间时窗口跟着走，上下占位加起来补齐总高", () => {
  const rows = 100;
  const w = computeWindow(8000, rows * ROW, VIEW, ROW, 8);
  assert.equal(w.start, rows - 8);
  assert.equal(w.end, w.start + Math.ceil(VIEW / ROW) + 8 * 2 + 1);
  assert.equal(w.padTop, w.start * ROW);
  // 占位 + 真实渲染的行 = 完整列表高度 —— 滚动条长度才不会跳
  assert.equal(w.padTop + (w.end - w.start) * ROW + w.padBottom, 8000 * ROW);
});

test("computeWindow：滚到底时窗口被夹在末尾，底部不再留占位", () => {
  const w = computeWindow(500, 500 * ROW * 4, VIEW, ROW, 8);
  assert.ok(w.end <= 500, `end 越界：${w.end}`);
  assert.equal(w.end, 500);
  assert.equal(w.padBottom, 0);
  assert.ok(w.start < w.end, "底部必须还渲染着行");
  assert.ok(w.start >= 500 - (Math.ceil(VIEW / ROW) + 8 * 2 + 1), "底部窗口不该比一屏大太多");
});

test("computeWindow：可视区一直落在窗口内（含正好落在两行之间的情况）", () => {
  const total = 2000;
  for (const scrolled of [0, 0.5, ROW, ROW * 3 + 0.4, ROW * 100, ROW * 1999, ROW * 99999]) {
    const w = computeWindow(total, scrolled, VIEW, ROW, 8);
    const firstVisible = Math.min(total - 1, Math.floor(Math.max(0, scrolled) / ROW));
    assert.ok(w.start <= firstVisible, `scrolled=${scrolled}：窗口起点 ${w.start} 漏掉了第一行 ${firstVisible}`);
    const lastVisible = Math.min(total - 1, Math.floor((Math.max(0, scrolled) + VIEW) / ROW));
    assert.ok(w.end > lastVisible, `scrolled=${scrolled}：窗口终点 ${w.end} 漏掉了最后一行 ${lastVisible}`);
  }
});

test("computeWindow：buffer=0 时窗口正好从视口首行开始", () => {
  const w = computeWindow(1000, 10 * ROW, VIEW, ROW, 0);
  assert.equal(w.start, 10);
  assert.equal(w.end, 10 + Math.ceil(VIEW / ROW) + 1);
});

test("computeWindow：空列表 / 退化输入不抛异常，也不产生 NaN", () => {
  for (const args of [
    [0, 0, VIEW, ROW],
    [-5, 0, VIEW, ROW],
    [10, -100, VIEW, ROW],
    [10, 0, 0, ROW],
    [10, 0, VIEW, 0], // 行高量不到 → 用兜底值
    [10, NaN, NaN, NaN],
    [undefined, undefined, undefined, undefined],
  ]) {
    const w = computeWindow(...args);
    for (const [k, v] of Object.entries(w)) {
      assert.ok(Number.isFinite(v), `${JSON.stringify(args)} → ${k} 不是有限数：${v}`);
    }
    assert.ok(w.start <= w.end, "start 不能大于 end");
    assert.ok(w.padTop >= 0 && w.padBottom >= 0, "占位不能是负数");
  }
  assert.equal(computeWindow(0, 0, VIEW, ROW).end, 0);
});

test("computeWindow：rowH 非法时退回 tokens 的 --row-h（56），不让占位变成 0", () => {
  assert.equal(computeWindow(100, 0, VIEW, 0).rowH, 56);
  assert.equal(computeWindow(100, 0, VIEW, -3).rowH, 56);
  assert.ok(computeWindow(100, 0, VIEW, 0).padBottom > 0);
});

test("阈值：恰好 WINDOW_MIN_ROWS 行不窗口化，多一行才窗口化", () => {
  assert.equal(WINDOW_MIN_ROWS, 300, "阈值被改动了：这个数字是「小列表保持全量渲染」的契约");
  assert.equal(shouldWindow("library", 300), false, "恰好 300 行应当全量渲染");
  assert.equal(shouldWindow("library", 301), true, "301 行应当开始窗口化");
  assert.equal(shouldWindow("library", 0), false);
  assert.equal(shouldWindow("library", NaN), false);
  assert.equal(shouldWindow("library", undefined), false);
});

test("阈值：队列（playlist 模式）不论多少行都不窗口化（拖拽排序依赖全部行在 DOM 里）", () => {
  assert.equal(shouldWindow("playlist", 100000), false);
  assert.equal(shouldWindow("queue", 100000), false);
  assert.match(cssSrc, /\.tracks__pad\s*\{/, "缺少 .tracks__pad 规则");
});

test("resize：视口变高之后窗口必须重算（否则底部留白，要等用户滚一下才补上）", () => {
  // 复现独立验证报的场景：先按 600px 高的视口算一次窗口，再把视口拉到 1400px。
  const total = 901;
  const scrolled = 400 * ROW; // 滚到中间
  const small = computeWindow(total, scrolled, 600, ROW, WINDOW_BUFFER);
  const tall = computeWindow(total, scrolled, 1400, ROW, WINDOW_BUFFER);

  // 1) 变高之后窗口必须变大（行数 = 一屏 + 两倍缓冲 + 1）
  assert.ok(
    tall.end - tall.start > small.end - small.start,
    `视口 1400 的窗口（${tall.end - tall.start} 行）不比视口 600（${small.end - small.start} 行）大`
  );
  // 2) 新窗口必须覆盖到视口底边 —— 这就是「底部不留白」的判据
  const bottom = (w) => w.rowH * w.end;
  assert.ok(
    bottom(tall) >= scrolled + 1400,
    `视口 1400 时窗口只盖到 ${bottom(tall)}px，视口底边在 ${scrolled + 1400}px`
  );
  // 3) 旧窗口（按 600 算的那份）确实盖不住 1400 的视口 —— 说明「不重算」就是留白的根因
  assert.ok(bottom(small) < scrolled + 1400, "这条测试的前提不成立了：小视口的窗口居然盖住了大视口");
  // 4) 两种视口下「占位 + 行」都必须等于完整列表高度（滚动条长度不跳）
  for (const w of [small, tall]) {
    assert.equal(w.padTop + (w.end - w.start) * w.rowH + w.padBottom, total * ROW);
  }
});

test("resize：窗口变矮时窗口跟着变小，但仍然盖满视口", () => {
  const total = 5000;
  for (const viewport of [400, 600, 900, 1400, 2000]) {
    const w = computeWindow(total, 1000 * ROW, viewport, ROW, WINDOW_BUFFER);
    assert.ok(
      w.end * w.rowH >= 1000 * ROW + viewport,
      `viewport=${viewport}：窗口底边 ${w.end * w.rowH} 没盖到 ${1000 * ROW + viewport}`
    );
    assert.ok(w.start <= 1000, `viewport=${viewport}：窗口起点 ${w.start} 漏掉了第一行`);
  }
});

test("resize：组件真的挂了 window resize 监听，并在断开时摘掉（幂等）", () => {
  // 纯函数测不到「有没有挂监听」，这里补一条接线断言。
  // 组件是 Lit 元素，node:test 里没有 window/DOM 不能实例化（见文件头）。
  assert.match(
    tableSrc,
    /window\.addEventListener\("resize", this\._onResize\)/,
    "没有挂 window resize 监听 —— 拉高窗口后底部会留白"
  );
  assert.match(tableSrc, /window\.removeEventListener\("resize", this\._onResize\)/, "断开时没有摘掉 resize 监听");
  assert.match(tableSrc, /if \(this\._resizeBound\) return;/, "resize 监听没有幂等闸门（多次 connected 会重复挂）");
  assert.match(tableSrc, /this\._onResize = \(\) => this\.scheduleWindowUpdate\(\)/, "resize 没有走统一的节流入口");
});

test("行的 data-index 仍是整个列表里的绝对下标（窗口内下标会让播放动作播错歌）", () => {
  assert.match(
    tableSrc,
    /this\.rowTemplate\(song, win\.start \+ index, mode\)/,
    "窗口分支给 rowTemplate 传的不是绝对下标 —— playContext / data-index 会错位"
  );
  // 行的 DOM 契约（事件委托、CSS、tools/*.mjs 自检都按这些属性查询）
  for (const attr of ["data-id=", "data-index=", "aria-selected=", "aria-current=", "data-playing=", "data-act="]) {
    assert.ok(tableSrc.includes(attr), `行模板少了 ${attr} —— 对外契约被改掉了`);
  }
});

test("窗口分支渲染上下占位块，且占位块不参与命中测试", () => {
  assert.ok(tableSrc.includes('data-pad="top"'), "缺少顶部占位块（滚动条长度会不对）");
  assert.ok(tableSrc.includes('data-pad="bottom"'), "缺少底部占位块");
  assert.match(cssSrc, /\.tracks__pad\s*\{[^}]*pointer-events:\s*none;/, "占位块必须不接指针事件");
});
