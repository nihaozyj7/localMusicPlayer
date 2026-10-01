/* ==========================================================================
   audio-failure.test.js — 放不出来的歌：提示一次 + 自动跳下一首
   --------------------------------------------------------------------------
   用户报的现象：「播放歌曲会出现无法播放转码失败的情况，这种情况应该出现
   提示并自动切换到下一首歌曲，而不是疯狂弹错误提示」。

   根因（本文件锁住的就是它）：

     一次装载失败**不是一次事件**，而是一连串 ——

       · 后端 playerLoad 返回错误，同时广播 player:error；
       · player:error 订阅、loadSong 的 catch、（legacy 链路的）<audio> error
         会分别收到同一件事；
       · 更糟的是失败后 state.playing 仍是 true、currentId 仍是这首坏歌，
         而 runtime 的依赖键（currentId|playing|position/250|…）每 250ms
         变一次 → 每个 tick 都重跑 syncAudio() → 重新 playerLoad → 再失败
         → 又弹一条 toast。

     于是用户看到提示刷屏，而且**永远不会跳到下一首**。

   修法（见 audio.js#handlePlaybackFailure）：
     · failedSongId 当闸门：同一首歌的失败只处理一次；
     · 处理时弹**一条**提示并调 playNext(true) 自动跳下一首；
     · consecutiveFailures 熔断：连败到阈值就停下（避免坏文件刷屏式连跳）；
     · 用户主动点播会放开闸门（resetFailureGate），否则修好文件后再点没反应。

   本文件用**同一套判定规则**模拟这台状态机（audio.js 依赖 DOM，无法在
   node:test 里直接 import）。真实端到端行为由无头浏览器自检负责
   （node tools/check-audio.mjs / tools/playtest.mjs）。
   改 audio.js 里那段逻辑时这里要跟着改 —— 对不上就说明规则被动了。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

const FAILURE_STREAK_LIMIT = 5;

/**
 * 与 audio.js#handlePlaybackFailure 同一套规则的精简模型。
 * 返回 { toasts, nextCalls, stopCalls, playing }，供断言「弹了几条、跳了几次」。
 */
function makeFailureMachine(queue) {
  const m = {
    failedSongId: null,
    consecutiveFailures: 0,
    toasts: [],
    nextCalls: 0,
    stopCalls: 0,
    playing: true,
    playMode: "sequence",
    sleepAfterSong: false,
    currentId: queue[0],
    /** 与 audio.js 的 handlePlaybackFailure 对齐 */
    fail(songId, reason) {
      if (songId && songId === this.failedSongId) return; // 闸门：重复报告吞掉
      if (songId) this.failedSongId = songId;

      this.consecutiveFailures += 1;
      const giveUp = this.consecutiveFailures >= FAILURE_STREAK_LIMIT;
      const willSkip =
        !giveUp && this.playing && !this.sleepAfterSong && this.playMode !== "loop-one";

      if (giveUp) {
        this.playing = false;
        this.stopCalls += 1;
        this.failedSongId = null; // 放开闸门，下一轮不被卡住
        this.consecutiveFailures = 0;
        this.toasts.push({ kind: "give-up", songId, reason });
        return;
      }

      // 文案与实际行为一致：会跳才说「已跳到下一首」
      this.toasts.push({ kind: "skip", songId, reason, willSkip });

      if (!willSkip) {
        if (this.playing) {
          this.playing = false;
          this.stopCalls += 1;
        }
        return;
      }

      this.nextCalls += 1;
      this.currentId = queue[(queue.indexOf(songId) + 1) % queue.length];
    },
    /** 与 audio.js#noteLoadSucceeded 对齐 */
    succeeded() {
      this.consecutiveFailures = 0;
      this.failedSongId = null;
    },
    /** 与 audio.js#resetFailureGate 对齐（用户主动点播时调） */
    userPlay(songId) {
      if (!songId || songId === this.failedSongId) {
        this.failedSongId = null;
        this.consecutiveFailures = 0;
      }
    },
    /** syncAudio 的闸门判定：已判死的歌不再重试 */
    shouldLoad(songId) {
      return songId !== this.failedSongId;
    },
  };
  return m;
}

/* --------------------------------------------------------------------------
   1. 核心：提示只弹一条
   -------------------------------------------------------------------------- */

test("同一个失败被多个入口重复报告 → 只弹一条提示", () => {
  const m = makeFailureMachine(["bad", "good"]);
  // 模拟真实情况：后端事件 + loadSong catch + legacy error 三处都报同一件事
  m.fail("bad", "转码失败");
  m.fail("bad", "转码失败");
  m.fail("bad", "转码失败");

  assert.equal(m.toasts.length, 1, "同一首歌只该弹一条提示，不能刷屏");
  assert.equal(m.toasts[0].kind, "skip");
});

test("坏歌在 tick 上被反复重试 → 闸门拦住，不再重试也不再弹提示", () => {
  const m = makeFailureMachine(["bad", "good"]);
  m.fail("bad", "转码失败");

  // 后续 20 个 tick 都想装载这首歌，全部该被闸门挡住
  let attempted = 0;
  for (let i = 0; i < 20; i += 1) {
    if (m.shouldLoad("bad")) attempted += 1;
  }
  assert.equal(attempted, 0, "已判死的歌不该再被送进 playerLoad");
  assert.equal(m.toasts.length, 1, "仍然只有一条提示");
});

/* --------------------------------------------------------------------------
   2. 核心：自动跳下一首
   -------------------------------------------------------------------------- */

test("失败后自动跳下一首（复用 playNext 的自动语义）", () => {
  const m = makeFailureMachine(["bad", "next1", "next2"]);
  m.fail("bad", "转码失败");

  assert.equal(m.nextCalls, 1, "必须自动跳到下一首");
  assert.equal(m.currentId, "next1", "当前歌应变成队列里的下一首");
});

test("提示文案说明「已跳到下一首」，用户知道发生了什么", () => {
  const m = makeFailureMachine(["bad", "good"]);
  m.fail("bad", "转码失败");
  assert.equal(m.toasts[0].kind, "skip");
  assert.equal(m.toasts[0].reason, "转码失败");
  assert.equal(m.toasts[0].willSkip, true, "真跳了才说「已跳到下一首」");
});

test("不跳的场合文案不能声称「已跳到下一首」", () => {
  const paused = makeFailureMachine(["bad", "good"]);
  paused.playing = false;
  paused.fail("bad", "转码失败");
  assert.equal(paused.toasts[0].willSkip, false, "暂停态下没跳，文案就不能说跳了");

  const loopOne = makeFailureMachine(["bad"]);
  loopOne.playMode = "loop-one";
  loopOne.fail("bad", "转码失败");
  assert.equal(loopOne.toasts[0].willSkip, false, "单曲循环下没跳");
});

test("跳到下一首之后，那首能播 → 连败计数清零，闸门放开", () => {
  const m = makeFailureMachine(["bad", "good"]);
  m.fail("bad", "转码失败");
  assert.equal(m.consecutiveFailures, 1);

  m.succeeded(); // 下一首装载成功
  assert.equal(m.consecutiveFailures, 0, "成功装载后连败计数必须清零");
  assert.equal(m.failedSongId, null, "闸门也要放开（否则这首歌被永久拉黑）");
});

/* --------------------------------------------------------------------------
   3. 熔断：坏文件成批时不能无限连跳
   -------------------------------------------------------------------------- */

test("连续失败到阈值 → 停止自动跳转，不再无限刷", () => {
  const m = makeFailureMachine(["a", "b", "c", "d", "e", "f", "g"]);
  const all = ["a", "b", "c", "d", "e"];

  for (const id of all) m.fail(id, "音频数据损坏");

  assert.equal(m.stopCalls, 1, "连败到阈值应停下来一次");
  assert.equal(m.playing, false, "停下来就不该还在「播放中」");
  const last = m.toasts.at(-1);
  assert.equal(last.kind, "give-up", "最后一条应是「已停止自动跳过」的汇总提示");
  assert.equal(m.failedSongId, null, "熔断后应放开闸门，下一轮不被卡住");
});

test("熔断之后用户重新点播还能继续（不是永久卡死）", () => {
  const m = makeFailureMachine(["a", "b", "c", "d", "e", "f"]);
  for (const id of ["a", "b", "c", "d", "e"]) m.fail(id, "损坏");
  assert.equal(m.playing, false);

  // 用户缓过来，点了队列里最后一首（假设它是好的）
  m.playing = true;
  m.userPlay("f");
  assert.equal(m.shouldLoad("f"), true, "熔断后点新歌必须能装载");
  m.succeeded();
  assert.equal(m.consecutiveFailures, 0);
});

test("熔断时的提示数量有界（每首一条 + 一条汇总，不是无限）", () => {
  const m = makeFailureMachine(["a", "b", "c", "d", "e"]);
  for (const id of ["a", "b", "c", "d", "e"]) m.fail(id, "损坏");
  // 前 4 首各一条 skip，第 5 首触发熔断给一条 give-up
  assert.equal(m.toasts.length, 5);
  assert.equal(m.toasts.filter((t) => t.kind === "give-up").length, 1);
});

/* --------------------------------------------------------------------------
   4. 不该跳的场合就别跳
   -------------------------------------------------------------------------- */

test("暂停状态下点了一首坏歌 → 就地停下，不该「自动播放」后面的歌", () => {
  const m = makeFailureMachine(["bad", "good"]);
  m.playing = false;
  m.fail("bad", "转码失败");

  assert.equal(m.nextCalls, 0, "暂停态下不该自动跳下一首");
  assert.equal(m.toasts.length, 1, "但仍然要提示用户这次失败了");
});

test("单曲循环下坏文件 → 停在原地（重播多少次都一样）", () => {
  const m = makeFailureMachine(["bad"]);
  m.playMode = "loop-one";
  m.fail("bad", "转码失败");

  assert.equal(m.nextCalls, 0, "单曲循环不该跳到别处");
  assert.equal(m.playing, false, "应停下来等用户处理");
});

test("定时停止（播完即停）语义下失败 → 不跳下一首", () => {
  const m = makeFailureMachine(["bad", "good"]);
  m.sleepAfterSong = true;
  m.fail("bad", "转码失败");

  assert.equal(m.nextCalls, 0, "「播完即停」下不该自动跳");
  assert.equal(m.playing, false);
});

/* --------------------------------------------------------------------------
   5. 闸门必须能被用户的主动点播打开
   -------------------------------------------------------------------------- */

test("用户主动点播已拉黑的歌 → 放开闸门，允许再试一次", () => {
  const m = makeFailureMachine(["bad", "good"]);
  m.fail("bad", "转码失败");
  assert.equal(m.shouldLoad("bad"), false, "失败后先被闸门拦住");

  m.userPlay("bad"); // 用户又点了一次这首歌
  assert.equal(m.shouldLoad("bad"), true, "主动点播必须能重试（否则「点了没反应」）");
  assert.equal(m.failedSongId, null);
});

test("自动跳转不放开闸门（只有用户点播才放开）", () => {
  const m = makeFailureMachine(["bad", "good"]);
  m.fail("bad", "转码失败");
  m.nextCalls = 0;

  // 自动跳到 good，闸门仍然关着 bad
  assert.equal(m.shouldLoad("bad"), false, "自动跳转不该解除对坏歌的拉黑");
});

/* --------------------------------------------------------------------------
   6. 两条链路（后端 / legacy）行为必须一致
   -------------------------------------------------------------------------- */

test("后端链路与 legacy 链路走同一套处理：都只弹一条并跳下一首", () => {
  const backend = makeFailureMachine(["bad", "good"]);
  const legacy = makeFailureMachine(["bad", "good"]);

  backend.fail("bad", "转码失败"); // source = "backend"
  legacy.fail("bad", "格式无法播放（解码失败）"); // source = "legacy"

  assert.equal(backend.toasts.length, legacy.toasts.length, "两条链路的提示数量应一致");
  assert.equal(backend.nextCalls, legacy.nextCalls, "两条链路都该跳下一首");
  assert.equal(backend.nextCalls, 1);
});
