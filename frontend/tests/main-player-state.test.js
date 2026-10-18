/* ==========================================================================
   main-player-state.test.js — player:state 只能有一个订阅者，而且必须带闸门
   --------------------------------------------------------------------------
   背景（真实竞态，审查已复现）：
     main.js 以前在 bindBackendEvents() 里额外订阅了一次 player:state，并把
     payload.playing 直接写进 state.playing。它绕过 audio.js 的 switchPending
     闸门 —— 后端引擎到 EOF 后，Tick 会补推一条 playing=false 的锚点
     （见 services_player.go#Tick），它正好落在「自动下一首」那次 playerLoad 的
     装载窗口里；audio.js 的 applyAnchor 正确丢弃它，main.js 那个监听器却把
     playSong 刚置上的 state.playing=true 覆盖回 false。loadSong 装载完成时按
     state.playing 决定要不要 playerPlay()，于是新歌装载好了却不播放。

     旧写法还读了 payload.position / payload.duration，而锚点字段是
     positionMs / durationMs（见 services_player.go#stateLocked），所以它今天
     只剩 playing 那一句有害 —— 这也正是本文件要一起钉住的：别照着旧字段名
     「修复」回来。

   本文件是**源码级守卫**（同 no-fire-and-forget.test.js 的做法）：player:state
   的订阅还有没有第二个，光看行为测不出来，只能盯住源码。audio.js 那边仍要有
   订阅与 switchPending 闸门，避免「删多了」把主链路一起删掉。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "src", "js");

/**
 * 去掉注释再扫描：本文件顶部的说明里就写着 on("player:state")，不去掉会误报。
 * 块注释换成等量空格以保住行号（理由见 no-fire-and-forget.test.js）。
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("main.js 不再订阅 player:state（该事件由 audio.js 独占）", () => {
  const src = stripComments(readFileSync(join(srcRoot, "main.js"), "utf8"));
  const hits = [...src.matchAll(/on\(\s*"player:state"/g)];
  assert.equal(
    hits.length,
    0,
    "main.js 又注册了 player:state —— 它没有 audio.js 的 switchPending 闸门，" +
      "会把自动下一首刚置上的 state.playing 覆盖回 false（新歌装载后不播放）"
  );
  // 旧写法读的字段后端根本不存在（锚点是 positionMs / durationMs），别再照着它写回来
  assert.equal(
    /payload\.position\b/.test(src),
    false,
    "main.js 里出现了 payload.position —— 后端 player:state 载荷里没有这个字段"
  );
  assert.equal(
    /payload\.duration\b/.test(src),
    false,
    "main.js 里出现了 payload.duration —— 后端 player:state 载荷里没有这个字段"
  );
});

test("audio.js 仍然是 player:state 的订阅者，且 switchPending 闸门还在", () => {
  const src = stripComments(readFileSync(join(srcRoot, "audio.js"), "utf8"));
  assert.match(src, /on\(\s*"player:state"/, "audio.js 必须订阅 player:state（进度锚点与播放状态的唯一真源）");
  assert.match(src, /if \(switchPending\) return;/, "applyAnchor 的切歌闸门被删了：换歌窗口里的旧锚点会污染进度");
});

test("loadSong 在置位 switchPending 之后才允许 await（闸门必须先于异步）", () => {
  const src = stripComments(readFileSync(join(srcRoot, "audio.js"), "utf8"));
  const pos = src.indexOf("switchPending = true;");
  assert.ok(pos > 0, "loadSong 里的 switchPending = true 不见了");
  const firstAwait = src.indexOf("await", src.indexOf("async function loadSong"));
  assert.ok(pos < firstAwait, "switchPending 置位晚于 loadSong 的第一次 await：旧歌锚点会在置位前写进 store");
});
