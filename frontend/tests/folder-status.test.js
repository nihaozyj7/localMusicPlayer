/* ==========================================================================
   folder-status.test.js — 文件夹状态：Go 与前端必须一一对应
   --------------------------------------------------------------------------
   后端 `internal/library/library.go#walkFolder` 会给每个扫描根一个状态字符串
   （ok / missing / denied / partial / error），前端设置页的文件夹卡片按它出
   提示（`settings-view.js#foldersCard`）。

   这个契约以前是**单向**的：后端加了新状态，前端不知道，于是落到兜底分支上
   显示一个不相干的提示。真实后果有两例：
     · 扫描根 I/O 错误（磁盘掉线、路径过长）被显示成「无访问权限」，
       用户去改权限，怎么改都没用；
     · 「部分子目录读不到」（曲库少了一批歌）以前**根本不会被报出来**，
       现在报出来了，但如果前端不认这个值，它会显示成「无访问权限」。

   所以这里做双向校验：Go 侧声明的每个状态值，前端都必须显式认得。
   本文件只读源码做字面量比对（settings-view.js 依赖 DOM，node:test 里
   不能直接渲染），这与仓库里其它契约测试（如 StableID 双向比对）同一路子。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const goSrc = readFileSync(join(root, "internal", "library", "library.go"), "utf8");
const viewSrc = readFileSync(join(root, "frontend", "src", "js", "ui", "settings-view.js"), "utf8");

/** Go 侧声明的状态值：statusXxx = "yyy" */
function goStatuses() {
  const out = [];
  for (const m of goSrc.matchAll(/status[A-Za-z]+\s*=\s*"([a-z]+)"/g)) {
    out.push(m[1]);
  }
  return out;
}

/** foldersCard 的函数体（到下一个同级方法为止） */
function foldersCardBody() {
  const start = viewSrc.indexOf("foldersCard() {");
  assert.ok(start > 0, "settings-view.js 里找不到 foldersCard");
  const end = viewSrc.indexOf("\n  /* ", start);
  return viewSrc.slice(start, end > start ? end : start + 4000);
}

const body = foldersCardBody();

test("Go 侧的状态值都能被解析出来（守卫测试自身的前提）", () => {
  const statuses = goStatuses();
  assert.deepEqual(
    [...statuses].sort(),
    ["denied", "error", "missing", "ok", "partial"],
    `从 library.go 解析出的状态值 = ${JSON.stringify(statuses)}，与期望不符 —— ` +
      `要么后端改了状态字面量，要么这里的选择器过期了`
  );
});

test("每个后端状态都在文件夹卡片里有显式分支", () => {
  for (const s of goStatuses()) {
    assert.ok(
      body.includes(`"${s}"`),
      `后端会返回状态 "${s}"，但 foldersCard 没有显式处理它 —— ` + `它会落到兜底分支上显示一个不相干的提示`
    );
  }
});

test("状态 → 提示文案是逐条固定的", () => {
  // 文案本身是对外表现，改文案要同时改这里（避免「I/O 错误被说成无访问权限」重演）
  const want = [
    ["missing", "路径不存在"],
    ["denied", "无访问权限"],
    ["partial", "部分子目录读不到"],
    ["error", "扫描出错"],
  ];
  for (const [status, text] of want) {
    const at = body.indexOf(`"${status}"`);
    assert.ok(at > 0, `没有处理状态 ${status}`);
    // 该分支到下一个状态分支之间的片段里应当出现对应文案
    const nextAt = body.indexOf("f.status ===", at + 1);
    const seg = body.slice(at, nextAt > at ? nextAt : body.length);
    assert.ok(seg.includes(text), `状态 ${status} 的提示文案应当是「${text}」，实际片段：${seg.slice(0, 120)}…`);
  }
});

test("兜底分支不能再把未知状态说成「无访问权限」", () => {
  const deniedAt = body.indexOf('"denied"');
  assert.ok(deniedAt > 0, "没有处理 denied");
  // denied 之后应当还有别的状态分支，并且最后落到「扫描出错」
  const after = body.slice(deniedAt);
  assert.ok(after.includes('"partial"'), "denied 之后缺少 partial 分支");
  assert.ok(after.includes("扫描出错"), "末尾缺少「扫描出错」兜底");
});
