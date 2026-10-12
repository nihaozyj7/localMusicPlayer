/* ==========================================================================
   no-dead-events.test.js — 前端事件通道必须有人订

   `bridge.js#emit()` 是**浏览器预览的 mock 通道**（真实后端走 `on()` 反向推送），
   它 dispatch 一个 `dsh:<name>` 的 CustomEvent。发出去没人听 = 一段看着像功能的
   死代码：读代码的人会以为「这里通知了播放链路」，而实际上什么都不会发生。

   第六轮审查 §4.3 数出来的正是这个：`store.js` 里有 **6 处 emit 无人订阅**
   （`player:play` / `player:pause` / `player:seek` / `player:volume`）——
   它们是「前端 `<audio>` 时代」的遗留：那时 store 通过事件驱动 `<audio>` 元素，
   而现在音频在后端出声、由 `audio.js` 直接调 Go 侧（`PlayerService`），
   这四个通道**一个订阅者都没有**。`seek` 那处最危险：见
   `seek-must-reach-audio.test.js` 的抬头 —— 「只改 state.position + emit」的写法
   曾经伪装成「跳转已经生效」，用户看到的是「进度条跳一下又弹回去」。

   这里把不变量变成机械检查：**src 里 emit 出的每个名字，都必须有 on(...) 或
   `dsh:<name>` 监听**。反证 = 往 store.js 里加回 `emit("player:play", …)`。

   局限：只认字符串字面量通道名（变量名通道扫不到），所以两边都用变量时会漏；
   当前 src 里所有通道都是字面量（`scan:progress` / `desktop:*` 等）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "src");

const rel = (file) => relative(srcRoot, file).split(sep).join("/");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

/** 去掉注释与字符串外的噪声：解释规则时写出的示例不该被当成真实调用。 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("src 里 emit 出的每个通道名都有订阅者", () => {
  const emitted = new Map(); // 通道名 → 出现位置
  const subscribed = new Set();

  for (const file of walk(srcRoot)) {
    const name = rel(file);
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/(?<![.\w])emit\(\s*["'`]([^"'`]+)["'`]/g)) {
      if (!emitted.has(m[1])) emitted.set(m[1], []);
      emitted.get(m[1]).push(name);
    }
    for (const m of src.matchAll(/(?<![.\w])on\(\s*["'`]([^"'`]+)["'`]/g)) subscribed.add(m[1]);
    for (const m of src.matchAll(/addEventListener\(\s*["'`]dsh:([^"'`]+)["'`]/g)) subscribed.add(m[1]);
  }

  assert.ok(emitted.size > 0, "没有扫到任何 emit —— 守卫失效了（emit 改名了？）");

  const dead = [...emitted.entries()]
    .filter(([channel]) => !subscribed.has(channel))
    .map(([channel, where]) => `${channel}（${[...new Set(where)].join(", ")}）`);

  assert.deepEqual(
    dead,
    [],
    [
      "以下事件通道发出去没有任何订阅者（死通道）：",
      ...dead.map((d) => `  ${d}`),
      "要么补上订阅方，要么删掉发送方 —— 留着它只会让人以为「这里通知过播放链路」。",
    ].join("\n")
  );
});
