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

   修复第一层：消费方（playbackSnapshot、桌面歌词锚点）要位置就用
   audio.js#livePosition() —— 按锚点外推到**调用这一刻**，与 atMs 对齐。

   修复第二层（2026-10，仍然能看到的「字被取消再点亮」）：引擎的 Position()
   按**音频缓冲块**推进（48kHz / 1024 帧 ≈ 21ms 一跳），而消费侧按墙钟连续外推。
   每 250ms 重新对齐时，新位置可能比上一帧外推值小半块 —— 填充边界于是回退，
   压在边界上的那个字被取消再重亮。位置出口（livePosition 与所有逐字渲染器）
   因此统一过 position.js#steadyPosition：小幅回退吸附、大幅回退（seek）放行。

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
    /if \(!anchor \|\| !backendReady \|\| switchPending\) \{[\s\S]{0,200}?liveFloor = -1;[\s\S]{0,80}?return state\.position;/,
    "没有可用锚点（legacy 路径 / 切歌途中）时必须退回 state.position，并把单调下限作废"
  );
});

test("livePosition 必须单调：小幅回退吸附，大幅回退放行（seek）", () => {
  const at = audio.indexOf("export function livePosition(");
  assert.ok(at > 0, "audio.js 里找不到 livePosition");
  const body = audio.slice(at, at + 900);
  assert.match(body, /liveFloor = steadyPosition\(liveFloor, pos\)/, "位置出口必须过 steadyPosition");
  assert.match(body, /return Math\.round\(liveFloor\)/, "返回的是吸附后的位置");
  assert.match(
    audio,
    /pushPosition\(livePosition\(\), true\)/,
    "锚点到达时的对齐也要用 livePosition（否则 state.position 每 500ms 回退半块）"
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
