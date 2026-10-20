/* ==========================================================================
   live-position.test.js — 逐字歌词「填充边界突然回退」的源头修复
   --------------------------------------------------------------------------
   真实报障：逐字歌词播放时，点亮边界会周期性地往回跳一小段。

   根因不是时间轴数据（真实缓存 2925 行逐字歌词实测全部单调），而是
   **位置的运输延迟**：

     · state.position 在 audio.js 的 tick 里算好（250ms 一档），
     · 经过 notify → 订阅 → 渲染 → 宿主推送才到皮肤 / 桌面歌词窗口，
     · 而渲染侧又拿墙钟向前外推 —— 两边一合成就变成「每 250ms 推送一次、
       每次回退一小段（回退量 ≈ 推送链路延迟）」。

   修复：消费方（playbackSnapshot、桌面歌词锚点）要位置就用
   audio.js#livePosition() —— 按锚点外推到**调用这一刻**，与 atMs 对齐。

   与 lyrics-word-upgrade.test.js 同一个理由用「读源码断言」而不是 import：
   audio.js / playerhost.js 依赖 bridge / store / DOM，在 node:test 里跑不起来。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

/** 去掉注释再断言：注释里正好会写到这些写法（「不要这么写」的说明） */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const audio = stripComments(read("frontend", "src", "js", "audio.js"));
const playerhost = stripComments(read("frontend", "src", "js", "playerhost.js"));
const runtime = stripComments(read("frontend", "src", "js", "runtime.js"));

test("audio.js 导出 livePosition：按锚点把位置外推到调用时刻", () => {
  assert.match(audio, /export function livePosition\(\)/, "缺少 livePosition 导出");
  assert.match(audio, /performance\.now\(\) - anchor\.at/, "外推基准必须是「本地收到锚点的时刻」");
  assert.match(
    audio,
    /if \(!anchor \|\| !backendReady \|\| switchPending\) return state\.position;/,
    "没有可用锚点（legacy 路径 / 切歌途中）时必须退回 state.position"
  );
});

test("extrapolate 与 livePosition 共用同一份外推（不许两处漂移）", () => {
  const at = audio.indexOf("function extrapolate(");
  assert.ok(at > 0, "audio.js 里找不到 extrapolate");
  const body = audio.slice(at, at + 400);
  assert.match(body, /pushPosition\(livePosition\(\), false\)/, "外推心跳要用 livePosition，而不是复制一份公式");
});

test("playbackSnapshot 用 livePosition（皮肤逐字填充的位置不能带链路延迟）", () => {
  const at = playerhost.indexOf("function playbackSnapshot(");
  assert.ok(at > 0, "playerhost.js 里找不到 playbackSnapshot");
  const body = playerhost.slice(at, at + 400);
  assert.match(body, /position: livePosition\(\)/, "ctx.playback().position 必须是现算值");
});

test("桌面歌词锚点：posMs 与 atMs 必须同一时刻对齐", () => {
  const at = runtime.indexOf("const frame = state.playing ? currentLyricFrame() : null;");
  assert.ok(at > 0, "runtime.js 里找不到桌面歌词帧构造");
  const body = runtime.slice(at, at + 600);
  assert.match(body, /posMs: livePosition\(\)/, "posMs 用现算值，窗口那边按墙钟外推才不会回退");
  assert.match(body, /atMs: Date\.now\(\)/, "atMs 是同一时刻的墙钟");
});
