/* ==========================================================================
   skin-patch-contract.test.js — 契约里的补丁类型 == 宿主真的推的类型

   皮肤契约的 `PATCH_TYPES`（frontend/packages/player-skins/src/contract.js）
   是插件作者写 `switch (patch.type)` 的依据，但它**没有任何机械约束**跟宿主对齐。
   第六轮审查 §4.2 抓到的现状：
     · 清单里多列了 `visibility` / `chrome` —— 宿主一次都没推过，照着写就是
       永远不触发的分支（`皮肤说明.md` 与 `docs/42` 也照抄了）；
     · `playerhost.js` 里有一处 `pushMedia()`（封面变化路径）**压根没带 type**，
       推出去是一个 `patch.type === undefined` 的补丁 —— `ctx.on("media")` 收不到
       （skinhost.push 按 `type !== patch.type` 过滤），而自带的两款皮肤与模板皮肤
       都是 `switch (patch.type) { case "media": … }`，等于封面变化被静默丢弃。

   这里做两件事：
     1. 从宿主源码里把**真正会推的类型**提取出来，与 PATCH_TYPES 双向比对；
     2. 要求每一处 `pushMedia(...)` 调用都显式带 `type:` —— 补丁必须有类型。

   提取方式是正则扫源码（不是运行时插桩）：宿主模块 import 了一大堆 DOM 与
   Wails 依赖，跑不起来；而"推了什么类型"在源码里就是字面量，扫得干净。
   局限也写在这里：类型如果是**变量**（`push({ type: someVar })`）就扫不到 ——
   真有那种写法时请把它改成字面量，或在此处补一条显式映射。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PATCH_TYPES } from "../packages/player-skins/src/contract.js";

const here = dirname(fileURLToPath(import.meta.url));
const jsRoot = join(here, "..", "src", "js");

/** 宿主里所有可能推补丁的模块。 */
const HOST_FILES = ["skinhost.js", "playerhost.js"];

/** `push({ type: "x"` 与 `pushMedia({ type: "x"` 里的字面量类型。 */
const PUSH_WITH_TYPE = /\bpush(?:Media)?\(\{\s*type:\s*"([A-Za-z]+)"/g;

/** 每一处 `pushMedia(` 调用（用于检查它有没有带 type）。 */
const PUSH_MEDIA_CALL = /\bpushMedia\(([^\n]*)\)/g;

/**
 * 去掉注释（**保留字符串**）。
 *
 * 必须去注释：说明「不要这么写」的注释里往往正好含有那个写法 —— 本次就踩了，
 * 本文件作者在 pushMedia 的文档注释里写了 `pushMedia()`，守卫立刻误报。
 * 普通按行砍 `//` 会砍坏字符串里的 `http://`，所以这里走一遍引号状态机。
 */
function stripComments(text) {
  let out = "";
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i++;
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

function hostSource() {
  return HOST_FILES.map((name) => ({
    name,
    text: stripComments(readFileSync(join(jsRoot, name), "utf8")),
  }));
}

test("PATCH_TYPES 与宿主真正推的类型逐项一致", () => {
  const pushed = new Set();
  for (const { text } of hostSource()) {
    for (const m of text.matchAll(PUSH_WITH_TYPE)) pushed.add(m[1]);
  }

  const declared = new Set(PATCH_TYPES);
  const neverPushed = [...declared].filter((t) => !pushed.has(t)).sort();
  const undeclared = [...pushed].filter((t) => !declared.has(t)).sort();

  assert.deepEqual(
    neverPushed,
    [],
    `PATCH_TYPES 里这些类型宿主从来不推（插件照着写就是永远不触发的分支）：${neverPushed.join(", ")}`
  );
  assert.deepEqual(undeclared, [], `宿主真的在推、但 PATCH_TYPES 里没有的类型：${undeclared.join(", ")}`);
});

test("每一处 pushMedia(...) 都必须显式带上 type", () => {
  const offenders = [];
  for (const { name, text } of hostSource()) {
    for (const m of text.matchAll(PUSH_MEDIA_CALL)) {
      // 函数定义本身不算调用点
      if (/\bfunction\s+$/.test(text.slice(0, m.index))) continue;
      const args = m[1].trim();
      if (!args.includes("type:")) offenders.push(`${name}: pushMedia(${args})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    [
      '以下调用推出去的补丁**没有类型**（ctx.on("media") 收不到，switch(patch.type) 的皮肤会当成未知类型丢掉）：',
      ...offenders.map((o) => `  ${o}`),
      '封面变化那条路径请写成 pushMedia({ type: "media" }, false) —— 第二个参数是 force，',
      "传 false 才能保持「只在封面真的变了时才推」（那一处在 4Hz 渲染循环里）。",
    ].join("\n")
  );
});
