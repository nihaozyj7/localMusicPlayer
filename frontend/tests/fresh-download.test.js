/* ==========================================================================
   fresh-download.test.js — 「刚下载」置顶与路径归一化
   --------------------------------------------------------------------------
   需求（用户原话）：「新下载的歌曲排序让其靠前，并添加一个『新』的角标，
   这些角标和歌曲排序顺序在下次排序时失效（相当于手动插入到最前面并添加角标，
   在用户重启，重新排序后失效恢复到正常排序）」。

   盯住两件事：
     1. **置顶不破坏其余排序**：刚下载的那几首按「后下载的在前」排在最前面，
        剩下的顺序与排序结果完全一致（不能被顺手重排）；
     2. **路径归一化**：download:done 给的路径来自后端，与曲库里那条记录的
        path 可能大小写、斜杠方向不一致，必须能对上（对不上就既不置顶也不带角标，
        而且**不会报错** —— 属于最容易悄悄坏掉的一类逻辑）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import { hoistFreshDownloads, normDownloadPath } from "../src/js/store.js";

const song = (id) => ({ id, title: id });

/* --------------------------------------------------------------------------
   1. 置顶：刚下载的按给定顺序在前，其余保持原样
   -------------------------------------------------------------------------- */

test("hoistFreshDownloads：刚下载的排到最前，其余顺序不变", () => {
  const list = [song("a"), song("b"), song("c"), song("d")];
  const out = hoistFreshDownloads(list, ["c", "a"]);
  assert.deepEqual(
    out.map((s) => s.id),
    ["c", "a", "b", "d"],
    "freshIds 的顺序就是置顶顺序（后下载的在前）"
  );
});

test("hoistFreshDownloads：不改入参数组（曲库/排序结果不能被就地打乱）", () => {
  const list = [song("a"), song("b"), song("c")];
  const before = list.map((s) => s.id);
  hoistFreshDownloads(list, ["c"]);
  assert.deepEqual(
    list.map((s) => s.id),
    before,
    "排序结果本身是曲库的副本，也必须当成只读"
  );
});

test("hoistFreshDownloads：没有刚下载 / 列表里一个都匹配不上 → 原样返回", () => {
  const list = [song("a"), song("b")];
  assert.equal(hoistFreshDownloads(list, []), list, "空 ids 走快捷路径，不新建数组");
  assert.equal(hoistFreshDownloads(list, ["zz"]), list, "匹配不上时也不该动它");
  const empty = [];
  assert.equal(hoistFreshDownloads(empty, ["a"]), empty, "空列表安全");
});

test("hoistFreshDownloads：只影响匹配到的那几首，相对顺序稳定", () => {
  const list = [song("a"), song("b"), song("c"), song("d"), song("e")];
  const out = hoistFreshDownloads(list, ["d", "c"]);
  assert.deepEqual(
    out.map((s) => s.id),
    ["d", "c", "a", "b", "e"],
    "未被置顶的歌保持 a/b/e 的原有相对顺序"
  );
});

/* --------------------------------------------------------------------------
   2. 路径归一化：后端给的路径与曲库里的 path 必须能对上
   -------------------------------------------------------------------------- */

test("normDownloadPath：大小写与斜杠方向都归一化", () => {
  const a = normDownloadPath("C:/Users/Easecat/Music/downloads/歌.mp3");
  const b = normDownloadPath("c:\\users\\easecat\\music\\DOWNLOADs\\歌.mp3");
  assert.equal(a, b, "同一文件的不同写法必须归一化成同一个键，否则永远认领不到");
});

test("normDownloadPath：空值 / 前后空白安全", () => {
  assert.equal(normDownloadPath(""), "");
  assert.equal(normDownloadPath(undefined), "");
  assert.equal(normDownloadPath("  D:\\Music\\a.mp3  "), "d:\\music\\a.mp3");
});
