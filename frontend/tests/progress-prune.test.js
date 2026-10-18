/* ==========================================================================
   progress-prune.test.js — 进度快照裁剪必须保留「最近在听」的歌
   --------------------------------------------------------------------------
   背景（审查已复现）：
     writeSnapshot -> pruneProgress 只按「对象属性的插入顺序」取最后
     PROGRESS_MAX(1500) 个。而 noteProgress 以前对已存在的键直接赋值
     （progress[id] = ms）—— 对象属性顺序只在**新增**时确定，重新赋值不会把键
     挪到末尾。于是被裁掉的是**最早开始听**的那批歌：常听的老歌（第一次播得很早、
     之后一直在播）反而先丢续播位置，留下最近才第一次听、之后再没播过的歌。

     修法：noteProgress 对已存在的键先 delete 再赋值，让插入顺序 = 最近写入顺序。
     本用例不复刻逻辑，直接走真实的 store（noteProgress + persistNow）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

/* writeSnapshot 会写 localStorage：换成内存收集器。
   必须在 import store 之前挂上（store 只在调用时读全局 localStorage）。 */
let written = null;
globalThis.localStorage = {
  getItem: () => null,
  setItem: (...args) => {
    written = args[1];
  },
  removeItem: () => {},
};

const { state, noteProgress, persistNow } = await import("../src/js/store.js");

/** 与 store.js 里的 PROGRESS_MAX 一致；写死是为了「契约变了必须改用例」 */
const PROGRESS_MAX = 1500;

function note(id, ms) {
  state.currentId = id;
  noteProgress(ms);
}

test("noteProgress：重播早期歌曲后，键被重排到末尾", () => {
  state.config.resumeProgress = true;
  state.progress = {};
  for (let i = 0; i < 2000; i += 1) note("s" + i, 1000 + i);
  assert.equal(Object.keys(state.progress)[0], "s0");

  for (let i = 0; i < 10; i += 1) note("s" + i, 77777);
  const keys = Object.keys(state.progress);
  assert.equal(keys.length, 2000, "重播已有键不该让进度表变大");
  assert.deepEqual(
    keys.slice(-10),
    ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"],
    "重播过的歌没有排到末尾：插入顺序仍是第一次听到的顺序"
  );
});

test("1500+ 首时，最近重播过的早期歌曲必须留在快照里", () => {
  state.config.resumeProgress = true;
  state.progress = {};
  for (let i = 0; i < 2000; i += 1) note("s" + i, 1000 + i);
  // 最近反复播放的是最早那批
  for (let i = 0; i < 10; i += 1) note("s" + i, 77777);

  written = null;
  persistNow();
  assert.ok(written, "persistNow 没有写出快照（localStorage 桩没接到）");
  const snap = JSON.parse(written);
  const kept = Object.keys(snap.progress);
  assert.equal(kept.length, PROGRESS_MAX, "快照只应保留 PROGRESS_MAX 首");
  for (let i = 0; i < 10; i += 1) {
    assert.ok(kept.includes("s" + i), "最近重播过的 s" + i + " 被裁掉了");
  }
  // 最早写入且一直没有重播的 s10，正是应当被裁掉的那一头
  assert.equal(kept.includes("s10"), false, "s10 早就该被裁掉，却被保留了");
});

test("快照不超过上限时原样保留", () => {
  state.config.resumeProgress = true;
  state.progress = {};
  for (let i = 0; i < 100; i += 1) note("t" + i, 100 + i);
  written = null;
  persistNow();
  const snap = JSON.parse(written);
  assert.equal(Object.keys(snap.progress).length, 100);
});
