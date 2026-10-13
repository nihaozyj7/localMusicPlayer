/* ==========================================================================
   single-track-queue.test.js — 队列里只有一首歌时，「下一首」必须重播它，而不是空转
   --------------------------------------------------------------------------
   真实报障：「歌曲播放列表只有一首歌曲时，会出现无法切换到下一首歌曲的 bug，
   播放暂停按钮会一直闪烁」。

   机制（两条链路各自都「没错」，合起来才错）：
     · store#playSong：队列只有一首时，「下一首 / 上一首 / 播完自动下一首」
       按**列表循环**的语义就是重播这一首，于是它被调用时 currentId 不变；
       playSong 认为「同一首歌 = 已经装载好了」，只把 position 归零、playing 置 true。
     · audio.js#syncAudio：loadedFor 也还是这首，于是只把播放意图同步一下
       （syncPlayState → Player.Play()）。而后端此刻正停在上一轮的 EOF 上：
       Play() 清掉 EOF → 引擎立刻又判定播完 → player:ended → playNext
       → playSong（同一首）→ 又一次 Play() …… 每 250ms 一轮。
       用户看到的就是「切不动 + 播放/暂停按钮一直闪」。

   修法：把「用户又点播了同一首歌」这件事**显式记下来**（store 递增
   state.playNonce），音频层消费这个计数并清掉装载记账 —— 于是走一次完整的
   重新装载（回到 0 起播），后端不再停在 EOF 上，循环被切断。

   本文件两层证据：
     1. store 的真实行为（store.js 可在 node:test 里 import，见 store-pure.test.js）；
     2. audio.js 的源码级不变量 + 一个精简状态机（audio.js 依赖 DOM，无法直接 import，
        与 auto-next.test.js / track-switch.test.js 同一套做法）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { state, commit, nextIndex, playNext, playPrev, playSong, songById } from "../src/js/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const audioSrc = readFileSync(join(root, "frontend", "src", "js", "audio.js"), "utf8");

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
   1. store 的真实行为：同一首歌被再次点播 = 记一次 playNonce
   -------------------------------------------------------------------------- */

const ONLY = "only-track";
const OTHER = "other-track";

function song(id, title) {
  return {
    id,
    title,
    artist: "测试",
    album: "测试专辑",
    path: `D:/Music/${id}.mp3`,
    ext: "mp3",
    size: 5_000_000,
    duration: 100_000,
  };
}

/** 只放一首歌进队列，并把「当前这首」摆到播完的位置上。 */
function setupSingleTrackQueue() {
  state.songs = [song(ONLY, "唯一一首"), song(OTHER, "另一首")];
  commit(); // 重建 songIndex（songById 读它）
  assert.ok(songById(ONLY), "测试前提：曲库里必须有这首歌（songIndex 已重建）");
  state.queue = [ONLY];
  state.currentId = ONLY;
  state.playing = false;
  state.position = 99_000;
  state.duration = 100_000;
  state.playMode = "sequence";
  state.playNonce = 0;
  state.sleepTimer = null;
}

test("队列只有一首：手动「下一首」重播这一首，并且记下「要重新装载」", () => {
  setupSingleTrackQueue();
  playNext(false);
  assert.equal(state.currentId, ONLY, "队列里只有这一首，下一首就是它自己（列表循环语义）");
  assert.equal(state.position, 0, "必须回到开头，而不是停在末尾");
  assert.equal(state.playing, true);
  assert.equal(state.playNonce, 1, "★ 必须递增 playNonce：音频层靠它决定「同一首歌也要重新装载」");
});

test("队列只有一首：播完自动下一首（player:ended 那条链路）同样记一次", () => {
  setupSingleTrackQueue();
  playNext(true); // player:ended → handleEnded → playNext(true)
  assert.equal(state.playNonce, 1, "自动接下一首与手动点击走的是同一条判定");
  playNext(true);
  assert.equal(state.playNonce, 2, "每次都算一次：连续播完两次就该重新装载两次");
});

test("队列只有一首：「上一首」也不会空转（loop 到自身时要重播）", () => {
  setupSingleTrackQueue();
  playPrev();
  assert.equal(state.currentId, ONLY);
  assert.equal(state.position, 0);
  assert.equal(state.playNonce, 1);
});

test("列表里点正在播的那一行：重播（也要重新装载）", () => {
  setupSingleTrackQueue();
  state.playing = true;
  state.position = 42_000;
  playSong(ONLY);
  assert.equal(state.position, 0, "点同一行 = 重新从头播");
  assert.equal(state.playNonce, 1);
});

test("切到另一首歌：不该记「重新装载」（否则每次切歌都白重装载一次）", () => {
  setupSingleTrackQueue();
  state.queue = [ONLY, OTHER];
  playNext(false);
  assert.equal(state.currentId, OTHER);
  assert.equal(state.playNonce, 0, "换歌本来就会走完整装载，不需要这个信号");
});

test("nextIndex：队列只有一首时返回自己（0），而不是「没有下一首」", () => {
  setupSingleTrackQueue();
  assert.equal(nextIndex(1), 0, "列表循环：一首歌的队列，下一首 = 自己");
  assert.equal(nextIndex(-1), 0, "上一首同理");
});

/* --------------------------------------------------------------------------
   2. 状态机：没有「重新装载」就会一直闪；有就只播完一次
   --------------------------------------------------------------------------
   只保留与「谁把后端从 EOF 上拉回来」相关的部分：
     · 后端停在 EOF 上时，收到一次 Play() 会在下一个音频回调里再次判定播完；
     · 只有**重新装载**（playerLoad）才会把播放位置真正归零。
   -------------------------------------------------------------------------- */

function makeEngineModel({ reloadSameTrack }) {
  return {
    reloadSameTrack,
    handlerPlayNonce: 0,
    currentId: ONLY,
    queue: [ONLY],
    loadedFor: ONLY,
    playNonce: 0,
    /** 前端 store 里的位置（playSong 会把它归零） */
    position: 100_000,
    /** ★ 引擎自己的播放位置：只有 playerLoad（重新装载）才会把它归零。
        store 把 position 归零**不代表**引擎回到了开头 —— 这正是这个 bug 的核心。 */
    enginePos: 100_000,
    eof: false,
    backendPlaying: false,
    /** 播放暂停按钮的翻转次数（用户看到的「闪」） */
    playingFlips: 0,
    endedRounds: 0,
    loads: 0,

    /** store#playSong（只保留与本 bug 相关的行） */
    playSong(id) {
      if (this.currentId === id) this.playNonce += 1;
      this.currentId = id;
      this.position = 0;
      this.backendPlaying = true;
      this.playingFlips += 1;
    },

    /** audio.js#syncAudio（后端链路） */
    syncAudio() {
      const replay = this.playNonce !== this.handlerPlayNonce;
      this.handlerPlayNonce = this.playNonce;
      if (reloadSameTrack && replay && this.loadedFor === this.currentId) {
        this.loadedFor = null; // 清记账 → 走完整重新装载
      }
      if (this.loadedFor !== this.currentId) {
        this.loads += 1;
        this.loadedFor = this.currentId;
        this.enginePos = 0; // playerLoad：引擎真的回到开头
        this.eof = false;
        this.backendPlaying = true;
        return;
      }
      // 同一首歌：只把播放意图同步下去 —— Play() 清掉 EOF，
      // 但引擎的位置仍在末尾，下一个音频回调又会判定播完。
      if (this.backendPlaying !== true) this.backendPlaying = true;
      this.eof = false;
    },

    /** 一个音频回调：引擎位置还在末尾 → 重新判定播完并推一条锚点 */
    audioTick() {
      if (this.eof) return;
      if (this.enginePos >= 100_000) {
        this.eof = true;
        this.backendPlaying = false;
        this.endedRounds += 1;
        return "ended";
      }
      return null;
    },

    /** 后端播完：推一条 playing=false 的锚点 */
    anchorArrives() {
      this.backendPlaying = false;
    },
  };
}

test("没有「重新装载」时：同一首被反复播完 —— 复现按钮闪烁", () => {
  const m = makeEngineModel({ reloadSameTrack: false });
  for (let i = 0; i < 5; i += 1) {
    const ended = m.audioTick(); // 引擎判定播完
    assert.equal(ended, "ended");
    m.anchorArrives();
    m.playSong(ONLY); // player:ended → playNext → playSong（同一首）
    m.syncAudio(); // runtime tick → syncAudio → syncPlayState → Play()
  }
  assert.equal(m.loads, 0, "一次重新装载都没有：后端一直停在末尾");
  assert.ok(m.playingFlips >= 5, `播放状态被反复翻转 ${m.playingFlips} 次 —— 这正是用户看到的闪烁`);
});

test("有「重新装载」时：重播一次就稳定下来，不再空转", () => {
  const m = makeEngineModel({ reloadSameTrack: true });
  m.audioTick(); // 播完
  m.anchorArrives();
  m.playSong(ONLY);
  m.syncAudio();
  assert.equal(m.loads, 1, "重新装载一次");
  assert.equal(m.position, 0, "回到开头起播");
  // 之后就算再点一次「下一首」，也只是再重装载一次，绝不会每 250ms 空转
  const before = m.playingFlips;
  m.audioTick();
  assert.equal(m.audioTick(), null, "位置在 0，没有立刻播完");
  assert.equal(m.playingFlips, before, "没有额外的播放状态翻转");
});

/* --------------------------------------------------------------------------
   3. 源码级不变量：上面的规则必须真的写在代码里
   -------------------------------------------------------------------------- */

test("store.js：playSong 必须在「又是这一首」时递增 playNonce", () => {
  const storeSrc = readFileSync(join(root, "frontend", "src", "js", "store.js"), "utf8");
  const code = stripLineComments(storeSrc);
  const body = bodyOf(code, "export function playSong(songId, options = {}) {");
  assert.match(body, /const replay = state\.currentId === songId;/, "要判断「是不是又在点这一首」");
  assert.match(
    body,
    /if \(replay\) state\.playNonce \+= 1;/,
    "★ 必须递增 playNonce —— 少了它，音频层永远不会重新装载同一首歌"
  );
  assert.ok(
    code.includes("playNonce: 0,"),
    "state.playNonce 必须在初始 state 里声明（本项目要求「state 有哪些字段」在代码里有唯一答案）"
  );
});

test("audio.js：syncAudio 必须在 playNonce 变化时清掉装载记账", () => {
  assert.match(audioCode, /let handledPlayNonce = 0;/, "audio.js 必须有这个计数的本地镜像");
  const helper = bodyOf(audioCode, "function replayRequested() {");
  assert.match(helper, /state\.playNonce === handledPlayNonce/, "没有变化时不能算一次重播");
  assert.match(helper, /handledPlayNonce = state\.playNonce;/, "消费之后要记账，避免每一跳都触发重装载");

  const body = bodyOf(audioCode, "export async function syncAudio() {");
  assert.match(
    body,
    /\n {2}if \(replayRequested\(\) && loadedFor === song\.id\) \{/,
    "★ syncAudio 必须在这个信号上清掉装载记账：否则只会推一次 Play()，后端停在 EOF 上空转（断言刻意锚定 `if (replayRequested() …` 的完整形式 —— 被 `false &&` 短路掉的死代码不算修好）"
  );
  assert.match(body, /loadedFor = null;/, "清掉 loadedFor 才会走下面的完整重新装载");
  assert.ok(
    body.indexOf("replayRequested()") < body.indexOf("if (loadedFor !== song.id)"),
    "顺序要紧：重新装载的判定必须在「同一首歌只同步播放状态」之前"
  );
});

test("audio.js：legacy 回退链路也要回到 0（两条路径行为一致）", () => {
  const body = bodyOf(audioCode, "async function syncLegacy() {");
  assert.match(
    body,
    /\n {2}if \(replayRequested\(\) && loadedFor === song\.id && switchPhase !== SWITCH_LOADING\) \{/,
    "legacy 链路同样要认这个信号（同样不接受被短路掉的形式）"
  );
  assert.match(body, /node\.currentTime = 0;/, "暂停在末尾时 play() 不会回到 0，必须显式 seek");
});
