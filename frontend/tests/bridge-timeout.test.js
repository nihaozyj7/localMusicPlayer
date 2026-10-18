/* ==========================================================================
   bridge-timeout.test.js — 桥调用的有限等待（超时/看门狗）
   --------------------------------------------------------------------------
   背景（审查已复现）：bridge.js 的 call() 只有「未连接返回 null」与「正常返回」
   两条路径，缺「后端不返回」。真实后果两处：
     · Player.Available 挂起 -> main.js 的 await probeBackend() 永不返回，
       其后的 startRuntime / 媒体键 / beforeunload 注册全部不执行；
     · Player.Load 挂起 -> audio.js 的 switchPending 没人解除，界面永久停在
       「切歌中」，失败自动跳转也不会发生。

   本文件盯住三件事：
     1) withTimeout 本身的行为（透传 / 超时 reject / 迟到结果不产生
        unhandledRejection / ms<=0 不设限）；
     2) 阈值契约：探测是短超时，装载看门狗必须长过后端最长处理时间
        （resolve ctx=6 分钟、转码 5 分钟），否则正常慢转码会被误杀；
     3) 两处接线还在；
     4) ★ 看门狗超时与「文件坏了」必须分流：超时只退回停止 + 明确提示，绝不登记
        「放不出来」、绝不自动跳下一首（后端整体挂死时那会一路拉黑好文件）。
        这条用 handleLoadTimeout 的假依赖注入来跑，不真等 7 分钟。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { backend, BridgeTimeoutError, isWails, withTimeout, PLAYER_AVAILABLE_TIMEOUT_MS } from "../src/js/bridge.js";
import { handleLoadTimeout, isEngineTimeout, LOAD_WATCHDOG_MS, switchingTrack } from "../src/js/audio.js";
import { state } from "../src/js/store.js";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "src", "js");

/** 去掉注释再扫描：说明文字里会出现被禁止的写法（同 no-fire-and-forget.test.js） */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/* --------------------------------------------------------------------------
   1. withTimeout 的行为
   -------------------------------------------------------------------------- */

test("withTimeout：底层先返回时原样透传", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), 1000, "X"), "ok");
});

test("withTimeout：超时后 reject，错误信息带调用名与秒数", async () => {
  const started = Date.now();
  await assert.rejects(withTimeout(new Promise(() => {}), 30, "Player.Load"), (err) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /Player\.Load/);
    assert.match(err.message, /已放弃等待/);
    return true;
  });
  assert.ok(Date.now() - started < 500, "超时后不该继续等到底层 promise");
});

test("withTimeout：超时抛的是可判别的 BridgeTimeoutError（不靠字符串匹配）", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20, "Player.Load"), (err) => {
    assert.ok(err instanceof BridgeTimeoutError);
    assert.equal(err.isTimeout, true);
    assert.equal(err.label, "Player.Load");
    assert.equal(err.timeoutMs, 20);
    return true;
  });
});

test("isEngineTimeout 只认标记：文案一模一样的普通 Error 不算超时", () => {
  assert.equal(isEngineTimeout(null), false);
  assert.equal(isEngineTimeout(undefined), false);
  assert.equal(isEngineTimeout(new Error("x")), false);
  assert.equal(isEngineTimeout(new Error("[bridge] Player.Load 超过 420s 没有返回（已放弃等待）")), false);
  assert.equal(isEngineTimeout(new BridgeTimeoutError("Player.Load", 100)), true);
  assert.equal(isEngineTimeout({ isTimeout: true }), true);
});

test("withTimeout：超时后迟到的 reject 不会变成 unhandledRejection", async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    let rejectLate = null;
    const late = new Promise((_resolve, reject) => {
      rejectLate = reject;
    });
    await assert.rejects(withTimeout(late, 20, "Late"), /Late/);
    rejectLate(new Error("迟到的失败"));
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.deepEqual(unhandled, [], "迟到的失败被漏成了 unhandledRejection");
});

test("withTimeout：ms<=0 表示不设限，原样返回那个 promise", () => {
  const p = Promise.resolve(1);
  assert.equal(withTimeout(p, 0, "X"), p);
});

test("未连接后端时 playerAvailable 立刻返回 null（不会挂起）", async () => {
  assert.equal(isWails(), false);
  assert.equal(await backend.playerAvailable(), null);
});

/* --------------------------------------------------------------------------
   2. 阈值契约
   -------------------------------------------------------------------------- */

test("探测超时是「短」的（10~15s）", () => {
  assert.ok(
    PLAYER_AVAILABLE_TIMEOUT_MS >= 10_000 && PLAYER_AVAILABLE_TIMEOUT_MS <= 15_000,
    "Player.Available 的探测超时应当在 10~15s 之间，收到 " + PLAYER_AVAILABLE_TIMEOUT_MS
  );
});

test("装载看门狗长于后端最长处理时间（resolve ctx=6 分钟），不会误杀慢转码", () => {
  assert.ok(
    LOAD_WATCHDOG_MS >= 6.5 * 60 * 1000,
    "Player.Load 看门狗短于后端 6 分钟的 resolve 上限，正常慢转码会被误杀，收到 " + LOAD_WATCHDOG_MS
  );
  assert.ok(Number.isFinite(LOAD_WATCHDOG_MS), "看门狗必须是有限值（无限 = 没修）");
});

/* --------------------------------------------------------------------------
   3. 接线：两处都要在，且收尾逻辑还在
   -------------------------------------------------------------------------- */

test("bridge.js：playerAvailable 走 callWithTimeout，不再裸 call", () => {
  const src = stripComments(readFileSync(join(srcRoot, "bridge.js"), "utf8"));
  assert.match(src, /playerAvailable:\s*\(\)\s*=>\s*callWithTimeout\(/, "playerAvailable 又变回裸 call 了");
  assert.match(src, /export function withTimeout\(/, "withTimeout 不见了");
});

test("audio.js：playerLoad 被 withTimeout 看门狗包住", () => {
  const src = stripComments(readFileSync(join(srcRoot, "audio.js"), "utf8"));
  assert.match(
    src,
    /withTimeout\(\s*backend\.playerLoad\(song\.id\),\s*LOAD_WATCHDOG_MS/,
    "playerLoad 没有经过 withTimeout 看门狗 —— 后端挂起时 switchPending 永远不解除"
  );
});

test("audio.js：非超时的装载失败仍清 switchPending 并走 handlePlaybackFailure（坏文件路径不变）", () => {
  const src = stripComments(readFileSync(join(srcRoot, "audio.js"), "utf8"));
  assert.match(
    src,
    /switchPending = false;\s*handlePlaybackFailure\(song\.id, err\?\.message \?\? "装载失败", "load"\);/,
    "loadSong 的 catch 不再清 switchPending / 不再走 handlePlaybackFailure"
  );
});

test("audio.js：超时分支在 handlePlaybackFailure 之前 return，且不登记、不跳下一首", () => {
  const src = stripComments(readFileSync(join(srcRoot, "audio.js"), "utf8"));
  const timeoutAt = src.indexOf("if (isEngineTimeout(err)) {");
  const fallbackAt = src.indexOf('handlePlaybackFailure(song.id, err?.message ?? "装载失败", "load")');
  assert.ok(timeoutAt > 0, "loadSong 的 catch 里没有超时分支");
  assert.ok(fallbackAt > timeoutAt, "超时分支必须在坏文件处理之前");
  const branch = src.slice(timeoutAt, src.indexOf("return;", timeoutAt));
  assert.match(branch, /handleLoadTimeout\(/, "超时分支要调用 handleLoadTimeout 做收尾");
  assert.equal(/reportUnplayable/.test(branch), false, "超时分支不能登记「放不出来」");
  assert.equal(/playNext/.test(branch), false, "超时分支不能自动跳下一首");
});

test("audio.js：超时收尾压住自动重试（否则下一次 tick 立刻再装载一遍）", () => {
  const src = stripComments(readFileSync(join(srcRoot, "audio.js"), "utf8"));
  const fnAt = src.indexOf("export function handleLoadTimeout(");
  assert.ok(fnAt > 0, "handleLoadTimeout 不见了");
  const body = src.slice(fnAt, src.indexOf("\n}", fnAt));
  assert.match(body, /failedSongId = song\.id/, "handleLoadTimeout 没有设置 failedSongId 闸门");
  assert.match(body, /switchPending = false/, "handleLoadTimeout 必须清 switchPending");
  assert.match(body, /state\.playing = false/, "handleLoadTimeout 必须把播放状态退回停止");
});

test("看门狗超时：退回停止 + 提示「引擎无响应」，不自动跳下一首（假依赖，不真等 7 分钟）", () => {
  const toasts = [];
  const commits = [];
  state.currentId = "s1";
  state.queue = ["s1", "s2"]; // 队列里明明有下一首
  state.playing = true;
  const beforeId = state.currentId;
  handleLoadTimeout(
    { id: "s1", title: "测试歌" },
    { commit: () => commits.push(1), toast: (msg) => toasts.push(msg), reason: "Player.Load 超时" }
  );
  assert.equal(state.playing, false, "超时后应退回「已停止」");
  assert.equal(state.currentId, beforeId, "超时不该自动跳下一首（那是坏文件的行为）");
  assert.deepEqual(state.queue, ["s1", "s2"], "队列不该被改动");
  assert.equal(switchingTrack(), false, "switchPending 必须被清掉，否则界面永久卡在「切歌中」");
  assert.equal(commits.length, 1, "要 commit 一次把停止状态广播出去");
  assert.equal(toasts.length, 1, "要明确提示一次");
  assert.match(toasts[0], /引擎无响应/);
  assert.match(toasts[0], /不是文件损坏/);
});
