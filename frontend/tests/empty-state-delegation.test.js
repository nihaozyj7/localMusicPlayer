/* ==========================================================================
   empty-state-delegation.test.js — 空态主按钮必须真的能点
   --------------------------------------------------------------------------
   对应审查报告第 3 条（高危）：空态整块（含主按钮）渲染在 `.content-body` 里，
   而当时唯一的 `data-empty-act` 委托挂在 `.content-header` 上 —— 点击从按钮
   冒泡到 `#main` 就停了，永远到不了那个委托，于是**空态主按钮全部失效**
   （「去本地歌曲」「清空搜索」「添加文件夹」都点不动，且没有任何报错）。

   为什么用源码断言：content.js 是 Lit 组件（要 DOM），而且这类 bug 的特征就是
   「不报错、只是没反应」—— 只能把**委托挂在哪一层**当作不变量钉住。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = readFileSync(join(root, "frontend/src/js/ui/content.js"), "utf8");

/** 取一个方法的函数体（从定义处到该方法的收尾大括号）。 */
function methodBody(name) {
  const m = new RegExp(`\\n  (?:async )?${name}\\(`).exec(src);
  assert.ok(m, `content.js 里找不到 ${name} 的定义`);
  const rest = src.slice(m.index);
  const end = rest.indexOf("\n  }\n");
  return end > 0 ? rest.slice(0, end) : rest;
}

test("空态按钮的委托挂在 #main 上", () => {
  const mainTag = src.slice(src.indexOf('<main class="main"'));
  // 注意不能用第一个 '>' 结尾：开标签里的箭头函数 `=>` 就带一个 '>'
  const openTag = mainTag.slice(0, mainTag.indexOf(">\n") + 1);
  assert.match(
    openTag,
    /@click=\$\{\(e\) => this\.onMainClick\(e\)\}/,
    "#main 上没有点击委托 —— 空态按钮又会变成「点了没反应」"
  );
  // 委托必须在 #main 这一层：空态在 .content-body、头部在 .content-header，
  // 只有共同的祖先才能同时覆盖两者。
  assert.ok(
    src.indexOf('<main class="main"') < src.indexOf('class="content-body"'),
    "结构变了：#main 应当包住 content-body"
  );
});

test("处理空态动作的是 onMainClick", () => {
  const body = methodBody("onMainClick");
  assert.match(body, /closest\("\[data-empty-act\]"\)/, "onMainClick 没有找 data-empty-act");
  for (const act of ["add-folder", "goto-library", "clear-search"]) {
    assert.ok(body.includes(`"${act}"`), `onMainClick 少了对 ${act} 的处理 —— 那个按钮会没反应`);
  }
});

test("onHeaderClick 不再重复处理空态动作", () => {
  const body = methodBody("onHeaderClick");
  assert.ok(
    !body.includes("data-empty-act"),
    "data-empty-act 同时挂在 #main 与 .content-header 上会被处理两次（例如弹出两个选文件夹对话框）"
  );
  assert.ok(body.includes("data-tool"), "onHeaderClick 应当继续负责头部的 data-tool 按钮");
});
