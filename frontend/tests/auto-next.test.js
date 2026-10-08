/* ==========================================================================
   auto-next.test.js — 播完必须能自动切下一首（前端这半）
   --------------------------------------------------------------------------
   真实报障：「歌曲播放完成之后无法自动播放下一曲，百分百复现；手动拖到末尾
   再点播放，进度条会卡住」。

   实测（tools 里的 CDP 探针，用真实配置 + 真实曲库）拿到的证据链：

     t+4.0s   引擎判定 EOF：eof=true、playing=false、trackGapActive=true
              （后端正在等 0.5 秒的切歌间隔，等完就发 player:ended）
     +4.0s → +15s   eof 与 trackGapActive 反复在 true/false 之间翻，
              欠载计数以每秒 4 次的速度增长 → 说明每秒有 4 次
              「Play() 被打回后端」：Play() 会取消正在计时的间隔并清掉 EOF，
              引擎于是重新判定 EOF、重新起间隔 —— 间隔永远走不完。
     ended=0   player:ended 一次都没到，歌当然是「播完不切下一首」。

   那每秒 4 次的 Play() 是谁打的：前端 store 的位置在「掐点位置」与
   「整首时长」之间来回取整（跳过尾部静音时两者差几百毫秒），runtime 的
   250ms 档依赖键于是反复变化 → run() → syncAudio() → syncPlayState()
   → Player.Play()。而 syncPlayState 当时**无条件**地把当前状态推下去。

   修法（两处，缺一不可）：
     1. audio.js：#backendPlaying 记住「后端现在的状态」，同状态不重复推
        （见那里的长注释）—— 循环被切断；
     2. services_player.go：Tick 在「播完/停止」那一次也要推一条锚点，
        否则前端永远不知道后端停了，会一直把 Play() 打回去，
        而且界面会显示成「还在播、进度条卡在末尾」。

   本文件用源码级不变量 + 一个精简状态机守住这两条 ——
   audio.js 依赖 DOM，无法在 node:test 里直接 import（与 track-switch.test.js
   同一套做法）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const audioSrc = readFileSync(join(root, "frontend", "src", "js", "audio.js"), "utf8");
const serviceSrc = readFileSync(join(root, "services_player.go"), "utf8");

/** 去掉整行 `//` 注释：断言必须指向可执行代码（被注释掉的修复也能匹配上）。 */
function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}
const audioCode = stripLineComments(audioSrc);

/** 取一段函数体（从签名到下一个顶格 "\n}\n"） */
function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start > 0, `没有找到 ${signature}`);
  const end = src.indexOf("\n}\n", start);
  assert.ok(end > start, `${signature} 的结构变了（找不到结尾）`);
  return src.slice(start, end);
}

/* --------------------------------------------------------------------------
   1. 状态机：同状态不重复推 = 间隔不再被打断
   -------------------------------------------------------------------------- */

/**
 * 精简模型：只保留与「谁打断间隔」相关的部分。
 *
 * backend 侧的 gapFrames 用「还需要被推几次」表示 —— 每次 Play() 会把
 * 它**清零并重起**（引擎里是 Cancel + 下一次 markEOF 再 Arm 的行为等价物）。
 */
function makeModel({ dedupe }) {
  return {
    dedupe,
    /** 前端认为的播放状态 */
    frontPlaying: true,
    /** 后端当前的播放状态（前端最后一次推下去 / 从锚点收到的） */
    backendPlaying: true,
    /** 间隔还需要推几次才走完 */
    gapNeed: 3,
    /** player:ended 到了几次 */
    ended: 0,
    /** Play() 被打回后端的次数 */
    playCalls: 0,

    /** 与 audio.js#syncPlayState 对齐 */
    syncPlayState() {
      const want = this.frontPlaying;
      if (this.dedupe && this.backendPlaying === want) return;
      this.playCalls += 1;
      this.backendPlaying = want;
      // Play() 会取消正在计时的间隔（引擎里的行为），这里等价于把它清零：
      // 引擎随后会在下一个音频回调里重新判定 EOF 并按新间隔重新计时。
      this.gapNeed = 3;
    },

    /** 与 audio.js#applyAnchor 对齐：锚点是后端状态的权威来源 */
    applyAnchor(playing) {
      this.backendPlaying = playing;
      this.frontPlaying = playing;
    },

    /** 一个音频回调：间隔推进一格，走完就发 player:ended */
    audioTick() {
      if (this.gapNeed <= 0) return;
      this.gapNeed -= 1;
      if (this.gapNeed === 0) this.ended += 1;
    },

    /** 前端每次「位置取整档位变化」都会重跑一遍 syncAudio → syncPlayState */
    runtimeKeyChanged() {
      this.syncPlayState();
    },
  };
}

test("没有去重时：前端的重发会一直打断切歌间隔（复现这个 bug）", () => {
  const m = makeModel({ dedupe: false });
  // 30 次依赖键变化（真实实测约每秒 4 次）+ 每次之间来一个音频回调
  for (let i = 0; i < 30; i += 1) {
    m.runtimeKeyChanged();
    m.audioTick();
  }
  assert.equal(m.ended, 0, "间隔被反复清零，player:ended 永远发不出来 —— 这正是用户报的现象");
  assert.ok(m.playCalls >= 20, `Play() 被打回了 ${m.playCalls} 次`);
});

test("去重之后：同样的重发不再打断间隔，player:ended 正常到达", () => {
  const m = makeModel({ dedupe: true });
  for (let i = 0; i < 30; i += 1) {
    m.runtimeKeyChanged();
    m.audioTick();
  }
  assert.equal(m.ended, 1, "间隔走完必须发出一次 player:ended");
  assert.equal(m.playCalls, 0, "前端不该把已经在播的状态再推一遍");
});

test("后端说「停了」之后：前端同步下来的暂停态不会被原样推回去", () => {
  const m = makeModel({ dedupe: true });
  // 引擎播完：EOF 把 playing 置 false，Tick 推一条锚点（见 services_player.go）
  m.applyAnchor(false);
  // 前端因此重绘（依赖键变化）→ syncAudio → syncPlayState
  m.runtimeKeyChanged();
  assert.equal(m.playCalls, 0, "把「后端已经停了」当成用户意图推回去，就会取消正在等的间隔");
  m.audioTick();
  m.audioTick();
  m.audioTick();
  assert.equal(m.ended, 1, "锚点只是告知状态，不该阻止自动下一首");
});

test("用户真的按下暂停：仍然要送到后端（间隔该被取消）", () => {
  const m = makeModel({ dedupe: true });
  m.frontPlaying = false; // 用户点了暂停
  m.syncPlayState();
  assert.equal(m.playCalls, 1, "用户的暂停意图必须送出去");
  assert.equal(m.backendPlaying, false);
});

/* --------------------------------------------------------------------------
   2. 源码级不变量：上面这套规则必须真的写在代码里
   -------------------------------------------------------------------------- */

test("audio.js：syncPlayState 必须在同状态时直接返回（不再重复推）", () => {
  const body = bodyOf(audioCode, "async function syncPlayState() {");
  assert.match(
    body,
    /if \(backendPlaying === want\) return;/,
    "syncPlayState 必须比较「后端当前状态」后提前返回 —— 少了它，Play() 会被每秒重发好几次，切歌间隔永远走不完"
  );
});

test("audio.js：backendPlaying 必须被锚点、推送、卸载三处维护", () => {
  assert.match(
    audioCode,
    /let backendPlaying = null;/,
    "audio.js 里必须有 backendPlaying 这个模块级状态"
  );
  // 锚点是后端状态的权威来源（播完那条锚点就是从这里进来的）
  assert.match(
    bodyOf(audioCode, "function applyAnchor(payload) {"),
    /backendPlaying = anchor\.playing;/,
    "applyAnchor 必须记下后端真正的播放状态"
  );
  // 推送成功后记账，避免下一轮又推一遍
  assert.match(
    bodyOf(audioCode, "async function syncPlayState() {"),
    /backendPlaying = want;/,
    "推送成功后要记下这个状态"
  );
  // 卸载 / 装载失败：记账必须清掉，否则换歌后会拿旧状态去比
  assert.match(
    bodyOf(audioCode, "async function unloadCurrent() {"),
    /backendPlaying = null;/,
    "卸载时必须清掉 backendPlaying"
  );
});

test("services_player.go：Tick 必须把「播完了/停了」推给前端", () => {
  const start = serviceSrc.indexOf("func (s *PlayerService) Tick() {");
  assert.ok(start > 0, "services_player.go 里没有找到 Tick");
  const body = serviceSrc.slice(start, serviceSrc.indexOf("\n}\n", start));

  assert.ok(
    !/!\s*s\.engine\.Playing\(\)\s*\{\s*return\s*\}/.test(body),
    "Tick 里不能再有「没在播就直接 return」—— 那会让前端永远不知道后端停了（播完不切下一首、进度条卡在末尾）"
  );
  assert.match(body, /s\.engine\.Playing\(\)/, "Tick 需要读到引擎的播放状态");
  assert.match(body, /s\.pushAnchorLocked\(/, "Tick 必须推锚点");
});
