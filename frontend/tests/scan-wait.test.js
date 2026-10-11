/* ==========================================================================
   scan-wait.test.js — 扫描收尾的等待逻辑
   --------------------------------------------------------------------------
   runRescan 会在收到 scan:done 之后从 state.allSongsRaw 取「最新曲库」，
   它必须是 main.js 的处理器拉回来的那一份，而不是扫描之前的旧快照。

   原来的等待是「让出一个宏任务（setTimeout 0）」—— 而 main.js 的处理器是
   async 的，它 await 了一次 backend.songs()（IPC 往返），一个宏任务远早于
   那次 IPC 返回。于是 rescan() 用**扫描前**的快照算「新增 / 移除 / 共 N 首」，
   数字全错，并且一直错到下一次扫描（列表本身随后会被 main.js 纠正，
   所以只有这些数字是坏的，特别难被发现）。

   现在改成「轮询等 allSongsRaw 换实例 + 超时兜底自己拉一次」。
   这里守住这个轮询原语本身。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import { waitUntil } from "../src/js/store.js";

test("waitUntil：条件成立就返回 true", async () => {
  let flag = false;
  setTimeout(() => {
    flag = true;
  }, 20);
  const ok = await waitUntil(() => flag, { waitMs: 1000, stepMs: 5 });
  assert.equal(ok, true);
});

test("waitUntil：一开始就成立时不等待", async () => {
  const t0 = Date.now();
  const ok = await waitUntil(() => true, { waitMs: 1000, stepMs: 50 });
  assert.equal(ok, true);
  assert.ok(Date.now() - t0 < 40, "条件已成立时不该还等一轮 stepMs");
});

test("waitUntil：超时返回 false（而不是永远挂着）", async () => {
  const t0 = Date.now();
  const ok = await waitUntil(() => false, { waitMs: 30, stepMs: 5 });
  const spent = Date.now() - t0;
  assert.equal(ok, false);
  assert.ok(spent >= 30, `应当至少等到期限，实际只等了 ${spent}ms`);
  assert.ok(spent < 1000, `超时要及时返回，实际等了 ${spent}ms`);
});

test("waitUntil：等到的是「变化」，不是「非空」", async () => {
  // 这正是扫描那条路径的断言方式：旧快照本身就是个非空数组，
  // 用「非空」当条件会立刻通过、读到旧数据。
  const stale = [1, 2, 3];
  let current = stale;
  setTimeout(() => {
    current = [1, 2, 3, 4];
  }, 15);
  const ok = await waitUntil(() => current !== stale, { waitMs: 500, stepMs: 5 });
  assert.equal(ok, true);
  assert.equal(current.length, 4);
});
