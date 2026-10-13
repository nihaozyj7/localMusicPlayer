/* ==========================================================================
   theme-cycle.test.js — 标题栏主题按钮按设置里的列表循环（首尾相连）
   --------------------------------------------------------------------------
   需求：「主题按钮改为按照设置中的列表循环切换，首位相连」。

   以前这个按钮只翻 state.config.themeMode（深/浅两档），因为主题当时只有
   深浅两个。现在主题是**一份可扩展的列表**（内置 3 个 + 用户往主题目录里
   丢的 CSS），一个只翻深浅的按钮永远碰不到第三个主题。

   现在的语义：
     · 顺序 = 设置界面里主题卡片的顺序（settings-view.js 直接 map listThemes()，
       两者是**同一份注册表**）；
     · 每点一次切到下一个，最后一个再点回到第一个（取模，不是「到头就停」）；
     · theme 与 themeMode 一起写（主题自己声明了深浅），与设置里点卡片一致。

   theme.js 的 nextTheme 是纯函数（只读状态 + 注册表），可在 node:test 里直接跑；
   toggleTheme / 标题栏那两处依赖 DOM，用源码级不变量守住。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { listThemes, nextTheme } from "../src/js/theme.js";
import { state } from "../src/js/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const themeSrc = readFileSync(join(root, "frontend", "src", "js", "theme.js"), "utf8");
const titlebarSrc = readFileSync(join(root, "frontend", "src", "js", "ui", "titlebar.js"), "utf8");
const settingsViewSrc = readFileSync(join(root, "frontend", "src", "js", "ui", "settings-view.js"), "utf8");

/* --------------------------------------------------------------------------
   1. nextTheme：按列表顺序走一格，末尾回到开头
   -------------------------------------------------------------------------- */

test("nextTheme：从列表第一个走到第二个", () => {
  const list = listThemes();
  assert.ok(list.length >= 2, "至少要有两个主题才谈得上「切换」");
  state.config.theme = list[0].id;
  assert.equal(nextTheme()?.id, list[1].id);
});

test("nextTheme：最后一个的下一个是**第一个**（首尾相连）", () => {
  const list = listThemes();
  const last = list[list.length - 1];
  state.config.theme = last.id;
  const nxt = nextTheme();
  assert.equal(nxt?.id, list[0].id, "到了末尾必须绕回开头，而不是停住 / 返回空");
});

test("nextTheme：连点一圈正好回到起点（不重不漏）", () => {
  const list = listThemes().map((t) => t.id);
  const start = list[1];
  state.config.theme = start;
  const seen = [];
  for (let i = 0; i < list.length; i += 1) {
    const nxt = nextTheme();
    seen.push(nxt.id);
    state.config.theme = nxt.id;
  }
  const expected = list.map((_, i) => list[(list.indexOf(start) + i + 1) % list.length]);
  assert.deepEqual(seen, expected, "一圈的落点必须与列表顺序一致，且最后回到起点");
  assert.equal(state.config.theme, start, `点了 ${list.length} 次之后应当回到 ${start}`);
});

test("nextTheme：当前主题不在列表里时从第一个开始（不跳到不存在的主题）", () => {
  const list = listThemes();
  state.config.theme = "这个主题已经被删掉了";
  assert.equal(nextTheme()?.id, list[0].id);
});

test("nextTheme：注册表为空时返回 null（按钮不能崩）", () => {
  const list = listThemes();
  const saved = list.splice(0, list.length); // 临时清空（同一个数组引用）
  try {
    assert.equal(nextTheme(), null);
  } finally {
    list.push(...saved);
  }
});

/* --------------------------------------------------------------------------
   2. 源码级不变量：按钮与设置用同一份列表、同一套落法
   -------------------------------------------------------------------------- */

test("theme.js：toggleTheme 必须用 nextTheme 的结果同时写 theme 与 themeMode", () => {
  const start = themeSrc.indexOf("export async function toggleTheme() {");
  assert.ok(start > 0, "theme.js 里没有 toggleTheme");
  const body = themeSrc.slice(start, themeSrc.indexOf("\n}\n", start));
  assert.match(body, /const next = nextTheme\(\);/, "顺序必须来自注册表（= 设置里的列表）");
  assert.match(body, /state\.config\.theme = next\.id;/, "要把主题本身切过去 —— 只翻深浅色就碰不到第三个主题");
  assert.match(body, /state\.config\.themeMode = next\.mode;/, "主题自带深浅，两个字段一起写（与设置里点卡片一致）");
  assert.doesNotMatch(
    body,
    /resolved\?\.mode === "light" \? "dark" : "light"/,
    "旧的「深浅二选一」写法必须消失，否则按钮又变回两档开关"
  );
});

test("nextTheme：顺序与设置界面完全同源（都用 listThemes()）", () => {
  const start = themeSrc.indexOf("export function nextTheme(");
  const body = themeSrc.slice(start, themeSrc.indexOf("\n}\n", start));
  assert.match(body, /const themes = listThemes\(\);/, "循环顺序必须取自注册表");
  assert.match(body, /% themes\.length/, "取模 —— 首尾相连靠的就是它");
  assert.match(
    settingsViewSrc,
    /const themes = listThemes\(\);/,
    "设置界面的主题卡片也读同一份注册表：两处顺序必须一致，否则「按设置中的列表循环」就不成立"
  );
});

test("标题栏：提示里写出下一个主题，且下一个主题进依赖数组", () => {
  assert.match(titlebarSrc, /const upcoming = nextTheme\(state\.config\.theme\);/, "渲染时要算出下一个主题");
  assert.match(titlebarSrc, /下一个主题：\$\{upcoming\.name\}/, "提示要告诉用户下一个是谁（而不是「切换到浅色」）");
  assert.match(
    titlebarSrc,
    /nextTheme\(state\.config\.theme\)\?\.id/,
    "下一个主题的 id 必须在 deps 里：否则换完主题提示文案还是旧的"
  );
});
