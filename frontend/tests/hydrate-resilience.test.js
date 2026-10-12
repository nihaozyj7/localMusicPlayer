/* ==========================================================================
   hydrate-resilience.test.js — 启动水合必须逐项兜底
   --------------------------------------------------------------------------
   对应审查报告第 38 条（中危）：`hydrateFromBackend` 用裸 `Promise.all`，
   任一失败即中断整条启动链（当时只有 `appVersion` 带 `catch`）。

   裸 Promise.all 的语义是「任一失败 → 整体失败」：后端有一个绑定抛错，
   曲库 / 文件夹 / 歌单 / 配置**全都停在初始状态**，界面看起来是「什么都没有」，
   而唯一线索是控制台里一行未捕获异常。

   源码断言的理由与 empty-state-delegation.test.js 相同：store.js 的水合路径要
   真后端，而这处的退化表现是「静默少一块」而不是报错。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = readFileSync(join(root, "frontend/src/js/store.js"), "utf8");

/** 取 hydrateFromBackend 里那个 Promise.all 的数组字面量。 */
function hydrateBatch() {
  const start = src.indexOf("export async function hydrateFromBackend()");
  assert.ok(start > 0, "store.js 里找不到 hydrateFromBackend");
  const body = src.slice(start, start + 3000);
  const open = body.indexOf("await Promise.all([");
  assert.ok(open > 0, "hydrateFromBackend 里找不到 Promise.all —— 启动水合被改写了，请重新审一遍");
  const close = body.indexOf("]);", open);
  assert.ok(close > open, "Promise.all 的参数列表没有正常结束");
  return body.slice(open, close);
}

test("每一项后端调用都带兜底", () => {
  const batch = hydrateBatch();
  const entries = batch
    .slice(batch.indexOf("[") + 1)
    .split("\n")
    .map((line) => line.trim())
    // 只取「调用项」：以 safe( 开头、或以 backend. 开头的行
    .filter((line) => line.startsWith("safe(") || line.startsWith("backend."));
  assert.ok(entries.length >= 5, `水合项看起来只有 ${entries.length} 项，少了？`);
  for (const entry of entries) {
    assert.ok(entry.startsWith("safe("), `水合项没有兜底：${entry} —— 它一失败整条启动链就断（裸 Promise.all）`);
  }
  // 每一项都要有中文标签，出事时能一眼看出是哪一块
  const labels = [...batch.matchAll(/safe\("([^"]+)"/g)].map((m) => m[1]);
  assert.ok(labels.length === entries.length, `有 ${entries.length} 项，但只有 ${labels.length} 个标签`);
  for (const label of ["曲库", "文件夹", "配置", "歌单"]) {
    assert.ok(labels.includes(label), `缺少「${label}」这一项的标签`);
  }
});

test("兜底函数会记日志并返回默认值", () => {
  const start = src.indexOf("export async function hydrateFromBackend()");
  const body = src.slice(start, start + 1200);
  assert.match(body, /const safe = \(label, promise, fallback\) =>/, "找不到 safe 兜底包装");
  assert.match(body, /promise\.catch\(/, "safe 没有接住失败");
  assert.match(body, /console\.warn\(/, "safe 失败时没有任何日志 —— 出问题会完全无声");
  assert.match(body, /return fallback;/, "safe 没有返回兜底值");
});

test("兜底值为 null 时下游不会当成「空曲库」", () => {
  const start = src.indexOf("export async function hydrateFromBackend()");
  const body = src.slice(start, start + 4000);
  // 曲库失败时不能把 state.songs 清空、也不能假装「刚扫描完、0 首」
  const songsGuard = body.indexOf("if (Array.isArray(songs))");
  const lastScan = body.indexOf("state.lastScan = {");
  assert.ok(songsGuard > 0, "曲库那一项没有 Array.isArray 判定 —— null 会被当成空曲库");
  assert.ok(songsGuard < lastScan, "state.lastScan 必须在 Array.isArray(songs) 判定之内，否则失败时会显示「0 首」");
});
